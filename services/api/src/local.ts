import { serve } from '@hono/node-server';
import { createApp } from './app';
import { env } from './env';

serve({ fetch: createApp().fetch, port: env.port }, (info) => {
  console.log(`NeuroVoice API (${env.mode}) on http://localhost:${info.port}`);
  console.log(`  companion and speech: ${env.awsAi ? `Amazon Bedrock (${env.bedrockModel}), Transcribe, Polly, when AWS credentials allow` : 'offline fallbacks (NV_AWS_AI=false)'}`);
  console.log(`  data: ${env.localDir}`);
});
