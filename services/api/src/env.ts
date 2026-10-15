import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..', '..', '..');

const e = process.env;

/**
 * `local` runs everything on this machine with no AWS account.
 * `aws` is set by the CDK stack on every Lambda.
 */
export const env = {
  mode: (e.NV_MODE ?? 'local') as 'local' | 'aws',
  port: Number(e.PORT ?? 8787),
  region: e.AWS_REGION ?? 'ap-south-1',
  webOrigin: e.WEB_ORIGIN ?? 'http://localhost:5173',

  // Local stand-ins
  localDir: e.NV_LOCAL_DIR ?? path.join(REPO_ROOT, '.local'),
  localJwtSecret: e.NV_LOCAL_JWT_SECRET ?? 'local-development-only-secret',
  python: e.NV_PYTHON ?? 'python',

  // AWS resources
  tableName: e.TABLE_NAME ?? '',
  audioBucket: e.AUDIO_BUCKET ?? '',
  voiceFunction: e.VOICE_FUNCTION ?? '',
  userPoolId: e.USER_POOL_ID ?? '',
  userPoolClientId: e.USER_POOL_CLIENT_ID ?? '',
  sesFrom: e.SES_FROM ?? '',

  // The companion (Bedrock) and speech (Transcribe, Polly) are used whenever AWS credentials
  // work, including on a laptop. Set NV_AWS_AI=false to force the offline fallbacks.
  // Off under test so the suite never makes paid calls.
  awsAi: (e.NV_AWS_AI ?? (e.VITEST ? 'false' : 'true')) === 'true',
  bedrockRegion: e.BEDROCK_REGION ?? 'us-east-1',
  // Any Bedrock chat model with tool use. Amazon Nova needs no extra sign-up. For Claude, submit
  // the Anthropic use-case form in the Bedrock console, then set e.g. us.anthropic.claude-sonnet-4-6.
  bedrockModel: e.BEDROCK_MODEL_ID ?? 'us.amazon.nova-pro-v1:0',

  // WhatsApp via Twilio
  twilioSid: e.TWILIO_ACCOUNT_SID ?? '',
  twilioToken: e.TWILIO_AUTH_TOKEN ?? '',
  twilioFrom: e.TWILIO_WHATSAPP_FROM ?? '',
  publicUrl: e.PUBLIC_URL ?? '',
};

export const isLocal = (): boolean => env.mode === 'local';
