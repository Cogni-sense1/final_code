import { App } from 'aws-cdk-lib';
import { NeuroVoiceStack } from './stack';

const app = new App();
const ctx = (key: string, fallback: string): string => (app.node.tryGetContext(key) as string | undefined) ?? fallback;

new NeuroVoiceStack(app, 'NeuroVoice', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'ap-south-1' },
  description: "NeuroVoice: multimodal Parkinson's screening and monitoring",
  webOrigin: ctx('webOrigin', 'http://localhost:5173'),
  sesFrom: ctx('sesFrom', ''),
  bedrockRegion: ctx('bedrockRegion', 'us-east-1'),
  bedrockModel: ctx('bedrockModel', 'us.amazon.nova-pro-v1:0'),
  whatsapp: ctx('whatsapp', 'false') === 'true',
});
