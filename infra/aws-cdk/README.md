# QuestorOS Memory — AWS staging

**Status:** Phase 6 packaging and synthesis only. **Do not deploy** without explicit cost, budget, secret-provisioning, and teardown approval.

## Topology

```text
API Gateway HTTP API (ap-southeast-1)
  → Lambda Node.js 24 + Fastify Memory API (ap-southeast-1)
  → AWS Parameters and Secrets Lambda Extension
  → CockroachDB Cloud (Singapore)
  → Bedrock Runtime (us-west-2) Titan Text Embeddings V2
```

The previous inline `501 Not deployed` Lambda placeholder has been replaced by the real Memory API handler. The deployment package includes the generated Prisma client and the `rhel-openssl-3.0.x` query engine required by the Amazon Linux 2023 Lambda runtime.

## Regions

| Concern                | Region           |
| ---------------------- | ---------------- |
| Application deployment | `ap-southeast-1` |
| CockroachDB cluster    | Singapore        |
| Bedrock InvokeModel    | `us-west-2`      |

Application and Bedrock regions remain separate settings.

## Database secret

The stack imports, but does not create or delete, this secret:

```text
questoros-memory/staging/database-url
```

The value may be either the raw CockroachDB PostgreSQL URL or JSON:

```json
{
  "DATABASE_URL": "postgresql://..."
}
```

At invocation time, the AWS Parameters and Secrets Lambda Extension retrieves and caches the value. The Lambda function receives only the secret ARN in `DATABASE_SECRET_ID`; the database URL is not embedded in CloudFormation, CDK outputs, source control, or logs.

Before an approved deployment, the secret must be created out-of-band with the existing private `DATABASE_URL`. Never paste the value into an issue, PR, command transcript, or chat.

## Package verification

```powershell
pnpm.cmd --filter @questoros-memory/aws-cdk synth
```

This command does **not** deploy. It:

1. builds the monorepo;
2. generates Prisma for both the development host and Lambda Amazon Linux target;
3. bundles the real API with CDK `NodejsFunction`;
4. copies the Prisma runtime into the Lambda asset;
5. synthesizes CloudFormation;
6. verifies the handler, runtime, secret reference, package size, and absence of inline placeholder or obvious secret material.

The command requires Docker because bundling is forced into a Lambda-compatible build environment.

## Least-privilege Bedrock policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvokeTitanTextEmbeddingsV2",
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": "arn:aws:bedrock:us-west-2::foundation-model/amazon.titan-embed-text-v2:0"
    }
  ]
}
```

Do not grant `bedrock:*`, AdministratorAccess, PowerUserAccess, streaming invocation, provisioned throughput, or batch jobs.

## Safety controls

- `EMBEDDING_AUTO_ON_WRITE=false`
- no historical backfill
- no batch jobs or provisioned throughput
- Lambda reserved concurrency: 5
- API Gateway stage throttling: 20 requests/second, burst 40
- Lambda timeout: 30 seconds
- Lambda memory: 1,024 MB
- CloudWatch log retention: 14 days
- application logs redact authorization headers, API keys, tokens, and `DATABASE_URL`
- database secret read permission limited to the imported staging secret
- AWS Parameters and Secrets extension cache TTL: 300 seconds
- no permissive CORS
- remote MCP is not deployed

## Deployment gate

The deployment command remains intentionally blocked:

```powershell
pnpm.cmd --filter @questoros-memory/aws-cdk deploy
```

Before unblocking it, Phase 6 must publish and approve:

1. a monthly cost estimate;
2. an AWS Budget alert plan;
3. the exact secret-creation procedure without displaying its value;
4. the exact stack-only teardown command;
5. post-deployment smoke tests;
6. confirmation that the endpoint will contain synthetic staging data only.

Current boundaries:

```text
AWS resources created: none
Public endpoint: none
Live Bedrock calls during Phase 6 packaging: none
Live Google/Microsoft calls: none
Production changes: none
```
