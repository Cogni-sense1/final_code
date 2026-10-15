/**
 * Voice capture. Recordings are converted to 16-bit mono WAV in the browser so the
 * analysis sees the same format from every device.
 */

export interface Recorder {
  /** Live input level, 0 to 1, for the on-screen meter. */
  level(): number;
  stop(): Promise<Blob>;
  cancel(): void;
}

export async function startRecording(): Promise<Recorder> {
  // Phone call "enhancements" smooth out exactly the irregularities being measured.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  });
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);

  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.start();

  const release = (): void => {
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };

  return {
    level() {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      return Math.min(1, Math.sqrt(sum / buf.length) * 6);
    },
    stop() {
      return new Promise((resolve, reject) => {
        recorder.onstop = async () => {
          try {
            const decoded = await ctx.decodeAudioData(await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer());
            resolve(encodeWav(decoded));
          } catch {
            reject(new Error('This browser could not process the recording.'));
          } finally {
            release();
          }
        };
        recorder.stop();
      });
    },
    cancel() {
      if (recorder.state !== 'inactive') recorder.stop();
      release();
    },
  };
}

function encodeWav(audio: AudioBuffer): Blob {
  const n = audio.length;
  const mono = new Float32Array(n);
  for (let ch = 0; ch < audio.numberOfChannels; ch++) {
    const data = audio.getChannelData(ch);
    for (let i = 0; i < n; i++) mono[i]! += data[i]! / audio.numberOfChannels;
  }
  const view = new DataView(new ArrayBuffer(44 + n * 2));
  const text = (offset: number, s: string): void => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
  text(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]!));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: 'audio/wav' });
}

/** Read text aloud with the device's own voice. */
export function speakLocally(text: string, lang: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

// ── Conversation audio ───────────────────────────────────────────────────────

const TAP_WORKLET = `
class NvTap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('nv-tap', NvTap);`;

const TARGET_RATE = 16000;
const rms = (x: Float32Array): number => {
  let sum = 0;
  for (const v of x) sum += v * v;
  return Math.sqrt(sum / Math.max(x.length, 1));
};

/**
 * An open microphone for talking with the companion. `listen()` waits for the person to
 * start speaking, records until they pause, and returns that one utterance as 16 kHz WAV.
 */
export class VoiceSession {
  private frames: Float32Array[] = [];
  private preRoll: Float32Array[] = [];
  private noise = 0.004;
  private current = 0;
  private waiting: { resolve: (b: Blob | null) => void; timer: number; started: number | null; quietSince: number | null; loudFor: number } | null = null;

  private constructor(private stream: MediaStream, private ctx: AudioContext, private node: AudioWorkletNode) {
    node.port.onmessage = (e: MessageEvent<Float32Array>) => this.onFrame(e.data);
  }

  static async open(): Promise<VoiceSession> {
    // Unlike the voice check, a conversation benefits from the device's noise handling.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const ctx = new AudioContext();
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([TAP_WORKLET], { type: 'application/javascript' })));
    const node = new AudioWorkletNode(ctx, 'nv-tap');
    ctx.createMediaStreamSource(stream).connect(node);
    return new VoiceSession(stream, ctx, node);
  }

  /** Live input level, 0 to 1. */
  level(): number {
    return Math.min(1, this.current * 8);
  }

  /** True once speech has started in the current `listen()`. */
  get hearing(): boolean {
    return !!this.waiting?.started;
  }

  private onFrame(frame: Float32Array): void {
    const level = rms(frame);
    this.current = this.current * 0.7 + level * 0.3;
    const w = this.waiting;
    if (!w) return;
    const ms = (frame.length / this.ctx.sampleRate) * 1000;
    const threshold = Math.max(0.012, this.noise * 3.5);
    const loud = level > threshold;

    if (w.started === null) {
      // Keep the last 400 ms so the first syllable is not clipped.
      this.preRoll.push(frame);
      while (this.preRoll.length * ms > 400) this.preRoll.shift();
      if (!loud) this.noise = this.noise * 0.98 + level * 0.02;
      w.loudFor = loud ? w.loudFor + ms : 0;
      if (w.loudFor >= 120) {
        w.started = performance.now();
        window.clearTimeout(w.timer);
        this.frames = [...this.preRoll];
        this.preRoll = [];
      }
      return;
    }
    this.frames.push(frame);
    const now = performance.now();
    if (loud) w.quietSince = null;
    else w.quietSince ??= now;
    // A pause of about a second ends the turn; 25 seconds is the most one turn can run.
    if ((w.quietSince !== null && now - w.quietSince > 1000) || now - w.started > 25_000) this.finish(this.toWav());
  }

  private finish(result: Blob | null): void {
    const w = this.waiting;
    if (!w) return;
    window.clearTimeout(w.timer);
    this.waiting = null;
    this.frames = [];
    this.preRoll = [];
    w.resolve(result);
  }

  private toWav(): Blob {
    const total = this.frames.reduce((n, f) => n + f.length, 0);
    const input = new Float32Array(total);
    let offset = 0;
    for (const f of this.frames) { input.set(f, offset); offset += f.length; }
    // Downsample by averaging, which also takes the edge off high-frequency noise.
    const ratio = this.ctx.sampleRate / TARGET_RATE;
    const n = Math.floor(total / ratio);
    const view = new DataView(new ArrayBuffer(44 + n * 2));
    const text = (o: number, s: string): void => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    text(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, TARGET_RATE, true); view.setUint32(28, TARGET_RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, 'data'); view.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const from = Math.floor(i * ratio);
      const to = Math.max(from + 1, Math.floor((i + 1) * ratio));
      let sum = 0;
      for (let j = from; j < to; j++) sum += input[j] ?? 0;
      const s = Math.max(-1, Math.min(1, sum / (to - from)));
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([view], { type: 'audio/wav' });
  }

  /** One utterance, or null if nobody spoke within `silenceMs`. */
  listen(silenceMs = 9000): Promise<Blob | null> {
    this.finish(null);
    void this.ctx.resume();
    return new Promise((resolve) => {
      this.waiting = { resolve, started: null, quietSince: null, loudFor: 0, timer: window.setTimeout(() => this.finish(null), silenceMs) };
    });
  }

  /** Abandon the current `listen()`; it resolves null. */
  stopListening(): void {
    this.finish(null);
  }

  close(): void {
    this.finish(null);
    this.node.port.onmessage = null;
    this.stream.getTracks().forEach((t) => t.stop());
    void this.ctx.close();
  }
}

/** Plays speech and resolves when it ends. One element is reused so playback stays allowed after the first tap. */
export class Speaker {
  private el = new Audio();
  private done: (() => void) | null = null;

  constructor() {
    this.el.onended = this.el.onerror = () => this.settle();
  }

  private settle(): void {
    this.done?.();
    this.done = null;
  }

  /** `src` is an audio URL from the server. Without it the device's own voice reads `text`. */
  say(text: string, lang: string, src: string | null): Promise<void> {
    this.stop();
    return new Promise((resolve) => {
      this.done = resolve;
      if (src) {
        this.el.src = src;
        this.el.play().catch(() => this.settle());
      } else if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        u.rate = 0.95;
        u.onend = u.onerror = () => this.settle();
        window.speechSynthesis.speak(u);
      } else this.settle();
    });
  }

  stop(): void {
    this.el.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.settle();
  }
}
