import path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

const DEPLOYMENT_REGION = 'ap-southeast-1';
const BEDROCK_REGION = 'us-west-2';
const DATABASE_SECRET_NAME = 'questoros-memory/staging/database-url';
const FUNCTION_NAME = 'questoros-memory-staging-api';
const LOG_GROUP_NAME = '/questoros-memory/staging/api';
const TITAN_MODEL_ARN = 'arn:aws:bedrock:us-west-2::foundation-model/amazon.titan-embed-text-v2:0';
const NOVA_MICRO_BASE_MODEL_ID = 'amazon.nova-micro-v1:0';
const NOVA_MICRO_INFERENCE_PROFILE_ID = 'us.amazon.nova-micro-v1:0';
const NOVA_MICRO_DESTINATION_REGIONS = ['us-east-1', 'us-east-2', 'us-west-2'] as const;
const PARAMETERS_SECRETS_EXTENSION_PARAMETER =
  '/aws/service/aws-parameters-and-secrets-lambda-extension/x86/latest';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const fiveMinutes = cdk.Duration.minutes(5);

function standardAlarmProps(
  alarmName: string,
  alarmDescription: string,
): Pick<
  cloudwatch.AlarmProps,
  'alarmName' | 'alarmDescription' | 'comparisonOperator' | 'treatMissingData' | 'actionsEnabled'
> {
  return {
    alarmName,
    alarmDescription,
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    actionsEnabled: true,
  };
}

/**
 * QuestorOS Memory staging infrastructure.
 *
 * Phase 8 retains bounded Amazon Nova Micro reasoning and adds the authenticated
 * read-only remote MCP transport to the existing staging API Lambda. The MCP
 * route introduces no new compute, database, IAM, or automatic write path.
 */
export class QuestorosMemoryStagingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add('project', 'questoros-memory');
    cdk.Tags.of(this).add('environment', 'staging');
    cdk.Tags.of(this).add('phase', '8');
    cdk.Tags.of(this).add('manager', 'questoros');

    const dbSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'MemoryDatabaseSecret',
      DATABASE_SECRET_NAME,
    );

    const extensionLayerArn = ssm.StringParameter.valueForStringParameter(
      this,
      PARAMETERS_SECRETS_EXTENSION_PARAMETER,
    );
    const extensionLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'ParametersAndSecretsExtension',
      extensionLayerArn,
    );

    const logGroup = new logs.LogGroup(this, 'MemoryApiLogGroup', {
      logGroupName: LOG_GROUP_NAME,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const fn = new nodejs.NodejsFunction(this, 'MemoryApiFunction', {
      functionName: FUNCTION_NAME,
      description: 'QuestorOS Memory staging REST and read-only remote MCP API',
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.X86_64,
      entry: path.join(repoRoot, 'services', 'memory-api', 'src', 'lambda.ts'),
      handler: 'handler',
      projectRoot: repoRoot,
      depsLockFilePath: path.join(repoRoot, 'pnpm-lock.yaml'),
      bundling: {
        target: 'node24',
        format: nodejs.OutputFormat.CJS,
        minify: false,
        sourceMap: true,
        sourcesContent: false,
        forceDockerBundling: true,
        externalModules: ['@prisma/client'],
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (inputDir, outputDir) => [
            `node "${inputDir}/infra/aws-cdk/scripts/copy-prisma-runtime.mjs" "${inputDir}" "${outputDir}"`,
          ],
        },
      },
      layers: [extensionLayer],
      logGroup,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      // New AWS accounts can have a reduced regional concurrency quota. Do not
      // reserve function concurrency until the account quota supports leaving
      // AWS's required unreserved pool. The HTTP API throttle and $5 budget
      // remain the staging traffic and spend controls.
      environment: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--enable-source-maps',
        LOG_LEVEL: 'info',
        EMBEDDING_PROVIDER: 'amazon-bedrock',
        EMBEDDING_MODEL_ID: 'amazon.titan-embed-text-v2:0',
        EMBEDDING_DIMENSIONS: '1024',
        EMBEDDING_NORMALIZE: 'true',
        AWS_BEDROCK_REGION: BEDROCK_REGION,
        EMBEDDING_AUTO_ON_WRITE: 'false',
        REASONING_PROVIDER: 'amazon-bedrock',
        REASONING_MODEL_ID: NOVA_MICRO_INFERENCE_PROFILE_ID,
        REASONING_REGION: BEDROCK_REGION,
        REASONING_ALLOW_LIVE_CALLS: 'true',
        REASONING_MAX_INPUT_CHARACTERS: '24000',
        REASONING_MAX_OUTPUT_TOKENS: '1024',
        REASONING_TIMEOUT_MS: '7000',
        REMOTE_MCP_ENABLED: 'true',
        // Non-browser MCP clients normally omit Origin. Browser origins remain
        // denied until an exact HTTPS origin is explicitly reviewed and added.
        REMOTE_MCP_ALLOWED_ORIGINS: '',
        DATABASE_SECRET_ID: dbSecret.secretArn,
        PARAMETERS_SECRETS_EXTENSION_HTTP_PORT: '2773',
        SECRETS_MANAGER_TTL: '300',
        PARAMETERS_SECRETS_EXTENSION_LOG_LEVEL: 'WARN',
      },
    });

    const novaInferenceProfileArn = cdk.Stack.of(this).formatArn({
      service: 'bedrock',
      region: BEDROCK_REGION,
      account: this.account,
      resource: 'inference-profile',
      resourceName: NOVA_MICRO_INFERENCE_PROFILE_ID,
    });
    const novaFoundationModelArns = NOVA_MICRO_DESTINATION_REGIONS.map((region) =>
      cdk.Stack.of(this).formatArn({
        service: 'bedrock',
        region,
        account: '',
        resource: 'foundation-model',
        resourceName: NOVA_MICRO_BASE_MODEL_ID,
      }),
    );

    dbSecret.grantRead(fn);
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'InvokeTitanTextEmbeddingsV2',
        actions: ['bedrock:InvokeModel'],
        resources: [TITAN_MODEL_ARN],
      }),
    );
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'InvokeNovaMicroInferenceProfile',
        actions: ['bedrock:InvokeModel'],
        resources: [novaInferenceProfileArn],
      }),
    );
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'InvokeNovaMicroThroughApprovedProfile',
        actions: ['bedrock:InvokeModel'],
        resources: novaFoundationModelArns,
        conditions: {
          StringEquals: {
            'bedrock:InferenceProfileArn': novaInferenceProfileArn,
          },
        },
      }),
    );

    const httpApi = new apigwv2.HttpApi(this, 'MemoryHttpApi', {
      apiName: 'questoros-memory-staging',
      description: 'QuestorOS Memory staging API with application bearer authentication',
      corsPreflight: undefined,
      createDefaultStage: false,
    });

    const integration = new integrations.HttpLambdaIntegration('MemoryLambdaIntegration', fn);
    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigwv2.HttpMethod.ANY],
      integration,
    });
    httpApi.addRoutes({
      path: '/healthz',
      methods: [apigwv2.HttpMethod.GET],
      integration,
    });

    const stage = new apigwv2.HttpStage(this, 'StagingStage', {
      httpApi,
      stageName: 'staging',
      autoDeploy: true,
      throttle: {
        rateLimit: 20,
        burstLimit: 40,
      },
    });

    fn.metricErrors({ period: fiveMinutes, statistic: 'Sum' }).createAlarm(
      this,
      'MemoryApiErrorsAlarm',
      {
        ...standardAlarmProps(
          'questoros-memory-staging-lambda-errors',
          'QuestorOS Memory staging Lambda reported one or more errors in five minutes.',
        ),
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
      },
    );

    fn.metricThrottles({ period: fiveMinutes, statistic: 'Sum' }).createAlarm(
      this,
      'MemoryApiThrottlesAlarm',
      {
        ...standardAlarmProps(
          'questoros-memory-staging-lambda-throttles',
          'QuestorOS Memory staging Lambda was throttled.',
        ),
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
      },
    );

    fn.metricDuration({ period: fiveMinutes, statistic: 'p95' }).createAlarm(
      this,
      'MemoryApiDurationAlarm',
      {
        ...standardAlarmProps(
          'questoros-memory-staging-lambda-duration-p95',
          'QuestorOS Memory staging Lambda p95 duration approached its timeout.',
        ),
        threshold: 25_000,
        evaluationPeriods: 2,
        datapointsToAlarm: 2,
      },
    );

    stage
      .metricServerError({ period: fiveMinutes, statistic: 'Sum' })
      .createAlarm(this, 'MemoryApiGatewayServerErrorAlarm', {
        ...standardAlarmProps(
          'questoros-memory-staging-api-5xx',
          'QuestorOS Memory staging HTTP API returned one or more 5xx responses.',
        ),
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
      });

    stage
      .metricLatency({ period: fiveMinutes, statistic: 'p95' })
      .createAlarm(this, 'MemoryApiGatewayLatencyAlarm', {
        ...standardAlarmProps(
          'questoros-memory-staging-api-latency-p95',
          'QuestorOS Memory staging HTTP API p95 latency exceeded 25 seconds.',
        ),
        threshold: 25_000,
        evaluationPeriods: 2,
        datapointsToAlarm: 2,
      });

    new cdk.CfnOutput(this, 'DeploymentRegion', {
      value: DEPLOYMENT_REGION,
    });
    new cdk.CfnOutput(this, 'BedrockRegion', { value: BEDROCK_REGION });
    new cdk.CfnOutput(this, 'HttpApiId', { value: httpApi.apiId });
    new cdk.CfnOutput(this, 'StagingApiUrl', {
      value: `${httpApi.apiEndpoint}/staging`,
    });
    new cdk.CfnOutput(this, 'RemoteMcpUrl', {
      value: `${httpApi.apiEndpoint}/staging/mcp`,
    });
  }
}

const app = new cdk.App({
  outdir: process.env.CDK_OUTDIR ?? path.join(repoRoot, 'infra', 'aws-cdk', 'cdk.out'),
});
new QuestorosMemoryStagingStack(app, 'QuestorosMemoryStaging', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: DEPLOYMENT_REGION,
  },
});
app.synth();
