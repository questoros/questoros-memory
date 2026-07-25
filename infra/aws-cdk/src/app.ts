/**
 * QuestorOS Memory — private staging CDK app (PREPARE ONLY).
 *
 * Deployment region: ap-southeast-1
 * Bedrock runtime region: us-west-2
 *
 * Do not deploy without an explicit cost and teardown approval.
 */
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

const DEPLOYMENT_REGION = 'ap-southeast-1';
const BEDROCK_REGION = 'us-west-2';
const TITAN_MODEL_ARN = 'arn:aws:bedrock:us-west-2::foundation-model/amazon.titan-embed-text-v2:0';

export class QuestorosMemoryStagingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add('project', 'questoros-memory');
    cdk.Tags.of(this).add('environment', 'staging');
    cdk.Tags.of(this).add('phase', '4');
    cdk.Tags.of(this).add('manager', 'questoros');

    const dbSecret = new secretsmanager.Secret(this, 'MemoryDatabaseSecret', {
      description: 'CockroachDB URL for QuestorOS Memory staging (value set out-of-band)',
      secretName: 'questoros-memory/staging/database-url',
    });

    const apiKeySecret = new secretsmanager.Secret(this, 'MemoryApiKeySecret', {
      description: 'Bootstrap Memory API key material (value set out-of-band)',
      secretName: 'questoros-memory/staging/api-key',
    });

    const fn = new lambda.Function(this, 'MemoryApiFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(
        'exports.handler = async () => ({ statusCode: 501, body: "Not deployed" });',
      ),
      memorySize: 512,
      timeout: cdk.Duration.seconds(15),
      reservedConcurrentExecutions: 5,
      environment: {
        EMBEDDING_PROVIDER: 'amazon-bedrock',
        EMBEDDING_MODEL_ID: 'amazon.titan-embed-text-v2:0',
        EMBEDDING_DIMENSIONS: '1024',
        EMBEDDING_NORMALIZE: 'true',
        AWS_BEDROCK_REGION: BEDROCK_REGION,
        EMBEDDING_AUTO_ON_WRITE: 'false',
        DATABASE_SECRET_ARN: dbSecret.secretArn,
        API_KEY_SECRET_ARN: apiKeySecret.secretArn,
      },
      logRetention: logs.RetentionDays.TWO_WEEKS,
    });

    dbSecret.grantRead(fn);
    apiKeySecret.grantRead(fn);

    fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'InvokeTitanTextEmbeddingsV2',
        actions: ['bedrock:InvokeModel'],
        resources: [TITAN_MODEL_ARN],
      }),
    );

    const httpApi = new apigwv2.HttpApi(this, 'MemoryHttpApi', {
      apiName: 'questoros-memory-staging',
      description: 'Private staging Memory API (no permissive CORS)',
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

    new apigwv2.HttpStage(this, 'StagingStage', {
      httpApi,
      stageName: 'staging',
      autoDeploy: true,
      throttle: {
        rateLimit: 20,
        burstLimit: 40,
      },
    });

    new cdk.CfnOutput(this, 'DeploymentRegion', { value: DEPLOYMENT_REGION });
    new cdk.CfnOutput(this, 'BedrockRegion', { value: BEDROCK_REGION });
    new cdk.CfnOutput(this, 'HttpApiId', { value: httpApi.apiId });
    // Intentionally no secret values in outputs.
  }
}

const app = new cdk.App();
new QuestorosMemoryStagingStack(app, 'QuestorosMemoryStaging', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: DEPLOYMENT_REGION,
  },
});
