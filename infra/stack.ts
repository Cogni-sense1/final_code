import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CfnOutput, Duration, RemovalPolicy, Stack, type StackProps,
  aws_amplify as amplify, aws_apigatewayv2 as apigw, aws_apigatewayv2_integrations as integrations, aws_cognito as cognito,
  aws_dynamodb as dynamodb, aws_events as events, aws_events_targets as targets, aws_iam as iam, aws_lambda as lambda,
  aws_lambda_nodejs as nodejs, aws_logs as logs, aws_s3 as s3, aws_secretsmanager as secrets, aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface NeuroVoiceProps extends StackProps {
  /** Origin of the web app, for CORS. */
  webOrigin: string;
  /** Verified SES sender. Leave empty to skip email. */
  sesFrom: string;
  bedrockRegion: string;
  bedrockModel: string;
  /** Wire up the Twilio WhatsApp webhook from the `neurovoice/twilio` secret. */
  whatsapp: boolean;
}

export class NeuroVoiceStack extends Stack {
  constructor(scope: Construct, id: string, props: NeuroVoiceProps) {
    super(scope, id, props);

    // ── Data ─────────────────────────────────────────────────────────────────
    const table = new dynamodb.Table(this, 'Table', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    table.addGlobalSecondaryIndex({
      indexName: 'gsi1',
      partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
    });

    const audio = new s3.Bucket(this, 'Audio', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Recordings are kept only long enough to be useful; derived features live in DynamoDB.
      lifecycleRules: [{ expiration: Duration.days(30) }],
      cors: [{ allowedMethods: [s3.HttpMethods.PUT], allowedOrigins: [props.webOrigin], allowedHeaders: ['*'], maxAge: 600 }],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ── Identity ─────────────────────────────────────────────────────────────
    const users = new cognito.UserPool(this, 'Users', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { fullname: { required: true, mutable: true } },
      // Self-declared and used only to pick the right screens. Access to another
      // person's data is granted by that person's invite, never by this attribute.
      customAttributes: { role: new cognito.StringAttribute({ mutable: false }) },
      passwordPolicy: { minLength: 10, requireDigits: true, requireLowercase: true, requireUppercase: false, requireSymbols: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const webClient = users.addClient('Web', { authFlows: { userSrp: true }, preventUserExistenceErrors: true });

    // ── Voice analysis (Python, Praat) ───────────────────────────────────────
    // Built by `python services/voice/build.py` into a cache folder outside the repository,
    // so file-sync tools cannot turn it into cloud placeholders.
    const voiceBuild = process.env.NV_VOICE_BUILD ?? path.join(os.homedir(), '.cache', 'neurovoice', 'voice-lambda');
    if (!fs.existsSync(voiceBuild)) throw new Error('Run `python services/voice/build.py` before synthesising.');
    const hasFfmpeg = fs.existsSync(path.join(voiceBuild, 'bin', 'ffmpeg'));
    const voiceFn = new lambda.Function(this, 'VoiceFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambda.Architecture.X86_64,
      handler: 'neurovoice_voice.handler.lambda_handler',
      code: lambda.Code.fromAsset(voiceBuild),
      memorySize: 1024,
      timeout: Duration.seconds(60),
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: hasFfmpeg ? { FFMPEG_PATH: '/var/task/bin/ffmpeg' } : {},
    });
    audio.grantRead(voiceFn);

    // ── API and jobs (TypeScript) ────────────────────────────────────────────
    const environment: Record<string, string> = {
      NV_MODE: 'aws',
      TABLE_NAME: table.tableName,
      AUDIO_BUCKET: audio.bucketName,
      VOICE_FUNCTION: voiceFn.functionName,
      USER_POOL_ID: users.userPoolId,
      USER_POOL_CLIENT_ID: webClient.userPoolClientId,
      WEB_ORIGIN: props.webOrigin,
      SES_FROM: props.sesFrom,
      BEDROCK_REGION: props.bedrockRegion,
      BEDROCK_MODEL_ID: props.bedrockModel,
    };
    if (props.whatsapp) {
      const twilio = secrets.Secret.fromSecretNameV2(this, 'Twilio', 'neurovoice/twilio');
      environment.TWILIO_ACCOUNT_SID = twilio.secretValueFromJson('sid').unsafeUnwrap();
      environment.TWILIO_AUTH_TOKEN = twilio.secretValueFromJson('token').unsafeUnwrap();
      environment.TWILIO_WHATSAPP_FROM = twilio.secretValueFromJson('from').unsafeUnwrap();
    }

    const node = (name: string, entry: string, handler: string, timeout: number): nodejs.NodejsFunction => {
      const fn = new nodejs.NodejsFunction(this, name, {
        entry: path.join(root, 'services', 'api', 'src', entry),
        handler,
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 512,
        timeout: Duration.seconds(timeout),
        logRetention: logs.RetentionDays.ONE_MONTH,
        environment,
        bundling: { format: nodejs.OutputFormat.ESM, target: 'node22', minify: true, sourceMap: true, mainFields: ['module', 'main'],
          // The local-only ffmpeg helper is never loaded on Lambda.
          externalModules: ['ffmpeg-static'],
          banner: "import{createRequire}from'module';const require=createRequire(import.meta.url);" },
        depsLockFilePath: path.join(root, 'package-lock.json'),
        projectRoot: root,
      });
      table.grantReadWriteData(fn);
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'], resources: ['*'],
      }));
      // Direct-to-phone SMS has no topic ARN to scope to; deny topic publishing instead.
      fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['sns:Publish'], resources: ['*'] }));
      fn.addToRolePolicy(new iam.PolicyStatement({ effect: iam.Effect.DENY, actions: ['sns:Publish'], resources: ['arn:aws:sns:*:*:*'] }));
      if (props.sesFrom) fn.addToRolePolicy(new iam.PolicyStatement({ actions: ['ses:SendEmail'], resources: ['*'] }));
      return fn;
    };

    const apiFn = node('ApiFn', 'lambda.ts', 'handler', 29);
    audio.grantReadWrite(apiFn);
    voiceFn.grantInvoke(apiFn);
    // The companion's voice: Polly speaks, Transcribe listens.
    apiFn.addToRolePolicy(new iam.PolicyStatement({ actions: ['polly:SynthesizeSpeech', 'transcribe:StartStreamTranscription'], resources: ['*'] }));

    const api = new apigw.HttpApi(this, 'Api', {
      corsPreflight: {
        allowOrigins: [props.webOrigin], allowHeaders: ['authorization', 'content-type'],
        allowMethods: [apigw.CorsHttpMethod.ANY], maxAge: Duration.minutes(10),
      },
      defaultIntegration: new integrations.HttpLambdaIntegration('ApiIntegration', apiFn),
    });
    apiFn.addEnvironment('PUBLIC_URL', api.apiEndpoint);

    // ── Nightly consolidation: Step Functions fans out one branch per patient ─
    const listFn = node('ListPatientsFn', 'jobs.ts', 'listPatients', 60);
    const consolidateFn = node('ConsolidateFn', 'jobs.ts', 'consolidate', 60);
    const perPatient = new sfn.Map(this, 'EachPatient', { itemsPath: '$.patients', maxConcurrency: 10, resultPath: sfn.JsonPath.DISCARD });
    perPatient.itemProcessor(
      new tasks.LambdaInvoke(this, 'ConsolidateProfile', { lambdaFunction: consolidateFn, payloadResponseOnly: true })
        .addRetry({ maxAttempts: 2, backoffRate: 2 }),
    );
    const nightly = new sfn.StateMachine(this, 'NightlyConsolidation', {
      definitionBody: sfn.DefinitionBody.fromChainable(
        new tasks.LambdaInvoke(this, 'ListPatients', { lambdaFunction: listFn, payloadResponseOnly: true }).next(perPatient),
      ),
      timeout: Duration.minutes(30),
    });

    // ── Schedules (UTC). 20:30 UTC is 02:00 in India. ────────────────────────
    new events.Rule(this, 'NightlyRule', {
      schedule: events.Schedule.cron({ minute: '30', hour: '20' }), targets: [new targets.SfnStateMachine(nightly)],
    });
    new events.Rule(this, 'DoseSweepRule', {
      schedule: events.Schedule.rate(Duration.minutes(30)), targets: [new targets.LambdaFunction(node('SweepFn', 'jobs.ts', 'sweep', 120))],
    });
    new events.Rule(this, 'MonthlyReportRule', {
      schedule: events.Schedule.cron({ minute: '0', hour: '1', day: '1' }), targets: [new targets.LambdaFunction(node('MonthlyFn', 'jobs.ts', 'monthly', 300))],
    });

    // ── Web hosting ──────────────────────────────────────────────────────────
    const site = new amplify.CfnApp(this, 'Web', {
      name: 'neurovoice',
      platform: 'WEB',
      // Single-page app: serve index.html for any path that is not a file.
      customRules: [{ source: '</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff2?|json|webmanifest|wasm|task)$)([^.]+$)/>', target: '/index.html', status: '200' }],
    });
    new amplify.CfnBranch(this, 'WebMain', { appId: site.attrAppId, branchName: 'main', stage: 'PRODUCTION' });

    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'UserPoolId', { value: users.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: webClient.userPoolClientId });
    new CfnOutput(this, 'AudioBucket', { value: audio.bucketName });
    new CfnOutput(this, 'AmplifyAppId', { value: site.attrAppId });
    new CfnOutput(this, 'WebUrl', { value: `https://main.${site.attrDefaultDomain}` });
    new CfnOutput(this, 'WhatsAppWebhook', { value: `${api.apiEndpoint}/webhooks/whatsapp` });
  }
}
