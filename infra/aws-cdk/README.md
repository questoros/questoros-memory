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
6. verifies the real handler and Lambda package size;
7. verifies the Lambda runtime, memory, timeout, and reserved concurrency;
8. verifies the explicit 14-day log group and stack-scoped deletion policy;
9. verifies five actionless CloudWatch alarms and API Gateway throttling;
10. verifies that no inline placeholder or obvious secret material is present.

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

## Safety and observability controls

- `EMBEDDING_AUTO_ON_WRITE=false`
- no historical backfill
- no batch jobs or provisioned throughput
- Lambda reserved concurrency: 5
- API Gateway stage throttling: 20 requests/second, burst 40
- Lambda timeout: 30 seconds
- Lambda memory: 1,024 MB
- explicit log group: `/questoros-memory/staging/api`
- CloudWatch log retention: 14 days
- staging log group removal policy: `DESTROY`
- application logs redact authorization headers, API keys, tokens, and `DATABASE_URL`
- database secret read permission limited to the imported staging secret
- AWS Parameters and Secrets extension cache TTL: 300 seconds
- no permissive CORS
- remote MCP is not deployed

The stack prepares five standard-resolution alarms without notification actions:

```text
Lambda errors
Lambda throttles
Lambda p95 duration ≥ 25 seconds for two periods
HTTP API 5xx responses
HTTP API p95 latency ≥ 25 seconds for two periods
```

Notification destinations remain an explicit deployment-time decision and are never committed to the repository.

## Cost, budget, and teardown gate

The reviewed estimate, required $5 monthly budget, secret-input rules, exact deployment command, exact stack-only teardown command, and teardown proof are documented in:

```text
docs/phase-6-aws-cost-and-teardown.md
```

The deployment command remains intentionally blocked:

```powershell
pnpm.cmd --filter @questoros-memory/aws-cdk deploy
```

## Read-only staging smoke test

The prepared smoke test remains blocked until an approved deployment:

```powershell
$env:RUN_PHASE6_STAGING_SMOKE="true"
$env:QUESTOROS_MEMORY_STAGING_URL="https://<approved-staging-endpoint>/staging"
$env:QUESTOROS_MEMORY_STAGING_API_KEY="<private staging key>"
pnpm.cmd --filter @questoros-memory/aws-cdk smoke:staging
```

It checks health, database readiness, and authenticated identity only. It performs no writes, Bedrock calls, or external provider calls and prints no credentials or response bodies.

Current boundaries:

```text
AWS resources created: none
Public endpoint: none
Live Bedrock calls during Phase 6 packaging: none
Live Google/Microsoft calls: none
Production changes: none
```
