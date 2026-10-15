import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { StartStreamTranscriptionCommand, TranscribeStreamingClient } from '@aws-sdk/client-transcribe-streaming';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Features } from '@neurovoice/shared';
import { env, isLocal, REPO_ROOT } from './env';

// ── Audio storage ────────────────────────────────────────────────────────────

const safeKey = (key: string): string => {
  if (!/^[\w\-/.]+$/.test(key) || key.includes('..')) throw new Error('invalid key');
  return key;
};
const localAudio = (key: string): string => path.join(env.localDir, 'audio', safeKey(key));

export const blob = {
  /** Where a client should PUT the recording. */
  async uploadUrl(key: string, contentType: string, apiBase: string): Promise<{ url: string; direct: boolean }> {
    if (isLocal()) return { url: `${apiBase}/voice/uploads/${key}`, direct: false };
    const cmd = new PutObjectCommand({ Bucket: env.audioBucket, Key: safeKey(key), ContentType: contentType });
    return { url: await getSignedUrl(new S3Client({}), cmd, { expiresIn: 300 }), direct: true };
  },
  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    if (isLocal()) {
      await fs.mkdir(path.dirname(localAudio(key)), { recursive: true });
      await fs.writeFile(localAudio(key), bytes);
    } else {
      await new S3Client({}).send(new PutObjectCommand({ Bucket: env.audioBucket, Key: safeKey(key), Body: bytes, ContentType: contentType }));
    }
  },
  async delete(key: string): Promise<void> {
    if (isLocal()) await fs.rm(localAudio(key), { force: true });
    else await new S3Client({}).send(new DeleteObjectCommand({ Bucket: env.audioBucket, Key: safeKey(key) }));
  },
};

// ── Voice analysis ───────────────────────────────────────────────────────────

export interface VoiceResult {
  features: Features;
  quality: { usable: boolean; problems: string[]; duration_s: number; speech_s: number; voiced_s: number };
}

async function ffmpegPath(): Promise<string | undefined> {
  try {
    return ((await import('ffmpeg-static')).default as unknown as string | null) ?? undefined;
  } catch {
    return undefined;
  }
}

export const voice = {
  async analyze(key: string): Promise<VoiceResult> {
    if (!isLocal()) {
      const out = await new LambdaClient({}).send(new InvokeCommand({
        FunctionName: env.voiceFunction, Payload: Buffer.from(JSON.stringify({ bucket: env.audioBucket, key })),
      }));
      const body = JSON.parse(Buffer.from(out.Payload ?? []).toString('utf8'));
      if (out.FunctionError) throw new Error(body.errorMessage ?? 'voice analysis failed');
      return body as VoiceResult;
    }
    const ffmpeg = await ffmpegPath();
    return new Promise((resolve, reject) => {
      execFile(
        env.python, ['-m', 'neurovoice_voice.handler', localAudio(key)],
        { cwd: path.join(REPO_ROOT, 'services', 'voice'), timeout: 60_000, env: { ...process.env, ...(ffmpeg ? { FFMPEG_PATH: ffmpeg } : {}) } },
        (err, stdout, stderr) => {
          try {
            const parsed = JSON.parse(stdout.trim().split('\n').pop() ?? '');
            if (parsed.error) reject(new Error(parsed.error));
            else resolve(parsed as VoiceResult);
          } catch {
            reject(new Error(`voice analysis failed: ${err?.message ?? stderr.slice(-300)}`));
          }
        },
      );
    });
  },
};

// ── Notifications ────────────────────────────────────────────────────────────

export interface Notice { phone?: string; email?: string; subject: string; message: string }

/** Tests and local runs read what would have been sent. */
export const sentNotices: Notice[] = [];

export const notifier = {
  async send(n: Notice): Promise<void> {
    sentNotices.push(n);
    if (isLocal()) {
      console.log(`[notify] ${n.phone ?? n.email ?? 'nobody'}: ${n.subject} - ${n.message}`);
      return;
    }
    const jobs: Promise<unknown>[] = [];
    if (n.phone) jobs.push(new SNSClient({}).send(new PublishCommand({ PhoneNumber: n.phone, Message: `${n.subject}\n${n.message}` })));
    if (n.email && env.sesFrom) {
      jobs.push(new SESv2Client({}).send(new SendEmailCommand({
        FromEmailAddress: env.sesFrom, Destination: { ToAddresses: [n.email] },
        Content: { Simple: { Subject: { Data: n.subject }, Body: { Text: { Data: n.message } } } },
      })));
    }
    // A failed text or email must never fail the request that triggered it.
    for (const r of await Promise.allSettled(jobs)) if (r.status === 'rejected') console.error('[notify] failed', r.reason);
  },
};

// ── AWS AI services: availability ────────────────────────────────────────────

const downUntil = new Map<string, number>();

/** False while a service is switched off, or cooling down after a credentials or permission failure. */
export const aiUsable = (service: string): boolean => env.awsAi && Date.now() > (downUntil.get(service) ?? 0);

/**
 * Record a failed call. Missing credentials or permissions will not fix themselves in the
 * next minute, so the service is skipped for a while instead of failing every request.
 */
export function aiFailed(service: string, err: unknown): void {
  const e = err as { name?: string; status?: number; $metadata?: { httpStatusCode?: number }; message?: string };
  const status = e.status ?? e.$metadata?.httpStatusCode;
  const blocked = status === 401 || status === 403 || /Credential|AccessDenied|UnrecognizedClient|ExpiredToken/i.test(`${e.name} ${e.message}`);
  if (blocked) downUntil.set(service, Date.now() + 5 * 60_000);
  console.error(`[${service}] ${blocked ? 'unavailable (credentials or permissions); using the fallback for 5 minutes' : 'call failed'}: ${e.message ?? e.name}`);
}

// ── Speech ───────────────────────────────────────────────────────────────────

let polly: PollyClient | undefined;
let transcriber: TranscribeStreamingClient | undefined;
const languageOf = (locale: string): 'hi-IN' | 'en-IN' => (locale.startsWith('hi') ? 'hi-IN' : 'en-IN');

export interface Wav { sampleRate: number; pcm: Uint8Array }

/** Read a 16-bit mono PCM WAV, as the web app records it. */
export function parseWav(bytes: Uint8Array): Wav | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number): string => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let sampleRate = 0;
  for (let o = 12; o + 8 <= bytes.length;) {
    const size = view.getUint32(o + 4, true);
    if (tag(o) === 'fmt ') {
      // PCM, one channel, 16 bits.
      if (view.getUint16(o + 8, true) !== 1 || view.getUint16(o + 10, true) !== 1 || view.getUint16(o + 22, true) !== 16) return null;
      sampleRate = view.getUint32(o + 12, true);
    } else if (tag(o) === 'data') {
      return sampleRate ? { sampleRate, pcm: bytes.subarray(o + 8, Math.min(bytes.length, o + 8 + size)) } : null;
    }
    o += 8 + size + (size % 2);
  }
  return null;
}

export const speech = {
  /** MP3 from Amazon Polly, or null when it is unavailable (the device speaks instead). */
  async synthesize(text: string, locale: string): Promise<Uint8Array | null> {
    if (!aiUsable('polly')) return null;
    try {
      polly ??= new PollyClient({ region: env.region });
      const out = await polly.send(new SynthesizeSpeechCommand({
        Text: text.slice(0, 2500), OutputFormat: 'mp3', Engine: 'neural', VoiceId: 'Kajal', LanguageCode: languageOf(locale),
      }));
      return out.AudioStream ? await out.AudioStream.transformToByteArray() : null;
    } catch (err) {
      aiFailed('polly', err);
      return null;
    }
  },

  /** What was said, from Amazon Transcribe. Null when the service is unavailable. */
  async transcribe(wav: Wav, locale: string): Promise<string | null> {
    if (!aiUsable('transcribe')) return null;
    try {
      transcriber ??= new TranscribeStreamingClient({ region: env.region });
      const bytesPerChunk = Math.round(wav.sampleRate / 10) * 2;
      const out = await transcriber.send(new StartStreamTranscriptionCommand({
        LanguageCode: languageOf(locale), MediaEncoding: 'pcm', MediaSampleRateHertz: wav.sampleRate,
        AudioStream: (async function* () {
          for (let i = 0; i < wav.pcm.length; i += bytesPerChunk) yield { AudioEvent: { AudioChunk: wav.pcm.subarray(i, i + bytesPerChunk) } };
        })(),
      }));
      let text = '';
      for await (const event of out.TranscriptResultStream ?? []) {
        for (const result of event.TranscriptEvent?.Transcript?.Results ?? []) {
          if (!result.IsPartial) text += `${result.Alternatives?.[0]?.Transcript ?? ''} `;
        }
      }
      return text.trim();
    } catch (err) {
      aiFailed('transcribe', err);
      return null;
    }
  },
};
