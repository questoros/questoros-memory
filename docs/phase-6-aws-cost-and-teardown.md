# Phase 6 AWS staging cost, budget, and teardown record

**Prepared:** 2026-07-25  
**Validated:** 2026-07-26  
**Scope:** QuestorOS Memory staging only  
**Deployment status:** Restored staging stack deployed after successful teardown and recovery proof

This document records the approved Phase 6 staging deployment, cost guard, teardown proof, and restoration proof. It does not authorize production deployment, a second environment, broader AWS permissions, additional paid services, or a higher budget.

## Cost assumptions

The low-volume staging estimate assumes:

- 10,000 API Gateway HTTP API requests per month;
- 1,024 MB Lambda memory;
- 500 ms average Lambda duration;
- one Secrets Manager secret;
- no secret rotation;
- AWS Parameters and Secrets extension caching enabled;
- 100 MB of Lambda logs ingested per month with 14-day retention;
- five standard-resolution CloudWatch alarms;
- up to 1 million Titan Text Embeddings V2 input tokens per month;
- no provisioned throughput, batch inference, NAT Gateway, VPC endpoint, custom domain, WAF, or remote MCP;
- outbound internet data transfer excluded because it depends on actual payload volume.

## Estimated monthly AWS service cost

| Service                   | Assumption                                                         | Approximate monthly cost before credits/free tier |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------: |
| API Gateway HTTP API      | 10,000 requests at approximately $1.00 per million                 |                                             $0.01 |
| Lambda requests           | 10,000 requests at $0.20 per million                               |                                   less than $0.01 |
| Lambda duration           | 5,000 GB-seconds at approximately $0.0000166667 per GB-second      |                                             $0.08 |
| Secrets Manager storage   | One secret                                                         |                                             $0.40 |
| Secrets Manager API calls | Extension-cached retrieval, well below 10,000 calls                |                                   less than $0.01 |
| CloudWatch alarms         | Five standard-resolution alarm metrics at approximately $0.10 each |                                             $0.50 |
| CloudWatch Logs           | 0.1 GB ingestion; regional rates vary                              |                         approximately $0.05–$0.10 |
| Titan Text Embeddings V2  | Up to 1 million input tokens at approximately $0.02 per million    |                                             $0.02 |
| **Estimated total**       | Excludes data transfer and taxes                                   |               **approximately $1.07–$1.12/month** |

The Lambda and API Gateway portions may be covered by applicable AWS free usage or credits. The estimate deliberately shows the approximate pre-credit amount so the deployment decision does not depend on credits remaining available.

Pricing is usage-based and region-dependent. Recheck the official AWS pricing pages before a materially different deployment:

- <https://aws.amazon.com/api-gateway/pricing/>
- <https://aws.amazon.com/lambda/pricing/>
- <https://aws.amazon.com/secrets-manager/pricing/>
- <https://aws.amazon.com/cloudwatch/pricing/>
- <https://aws.amazon.com/bedrock/pricing/>

## AWS Budget

The required monthly staging budget was created and preserved through teardown:

```text
Budget name: questoros-memory-staging-monthly
Budget amount: $5.00/month
Scope tag: project = questoros-memory
Actual alerts: 50%, 80%, 100%
Forecast alert: 100%
Automatic shutdown action: disabled
Notification destination: configured out-of-band
Credits/refunds: excluded from the spend guard where the console permits
```

The $5.00 limit is intentionally several times higher than the low-volume estimate, while still providing an early warning if traffic, logs, alarms, or model usage increase unexpectedly.

Do not commit a notification email address, phone number, webhook, account ID, or budget subscriber identifier to this repository.

## Database secret

The stack imports this existing secret and does not create or delete it:

```text
questoros-memory/staging/database-url
```

The secret is stored in `ap-southeast-1` and targets the CockroachDB database `questoros_memory`. Its private URL is never placed in source control, CloudFormation parameters, CDK context, logs, issues, pull requests, or chat.

Accepted secret formats:

```text
postgresql://...
```

or:

```json
{
  "DATABASE_URL": "postgresql://..."
}
```

## Reviewed deployment command

The repository's `deploy` script remains intentionally blocked. An explicitly approved staging deployment or restoration uses:

```powershell
pnpm.cmd build
pnpm.cmd dlx aws-cdk@2.1132.1 deploy QuestorosMemoryStaging `
  --app "node infra/aws-cdk/dist/app.js" `
  --profile questoros-memory `
  --require-approval broadening
```

Before a future redeployment, confirm the exact branch head, CI result, synthesized package verification, AWS Budget, secret existence, and scope of the CloudFormation change set.

## Stack-only teardown

The reviewed stack teardown command is:

```powershell
pnpm.cmd dlx aws-cdk@2.1132.1 destroy QuestorosMemoryStaging `
  --app "node infra/aws-cdk/dist/app.js" `
  --profile questoros-memory `
  --force
```

Expected stack teardown behavior:

- deletes API Gateway HTTP API and staging stage;
- deletes the Memory API Lambda and execution role;
- deletes the explicit staging log group because its removal policy is `DESTROY`;
- deletes the five CloudWatch alarms;
- deletes stack-managed permissions and integrations;
- does **not** delete the imported CockroachDB secret;
- does **not** delete the CockroachDB cluster;
- does **not** delete the $5 monthly budget;
- does **not** delete account-level CDK bootstrap resources.

## Read-only staging smoke gate

The official smoke test uses synthetic staging access and requires explicit enablement:

```powershell
$env:RUN_PHASE6_STAGING_SMOKE="true"
$env:QUESTOROS_MEMORY_STAGING_URL="https://<approved-staging-endpoint>/staging"
$env:QUESTOROS_MEMORY_STAGING_API_KEY="<existing private staging key>"
pnpm.cmd --filter @questoros-memory/aws-cdk smoke:staging
Remove-Item Env:RUN_PHASE6_STAGING_SMOKE
Remove-Item Env:QUESTOROS_MEMORY_STAGING_URL
Remove-Item Env:QUESTOROS_MEMORY_STAGING_API_KEY
```

The smoke test performs read-only health, readiness, and authenticated identity checks. It does not create memories, invoke Bedrock, publish files, or call Google or Microsoft providers. It prints no credential or response body.

## Live deployment proof

The first successful staging deployment validated:

```text
Health status: 200
Ready status: 200
Whoami status: 200
Official staging smoke passed: True
```

The initial AWS secret mistakenly targeted `defaultdb`; it was corrected out-of-band to the existing `questoros_memory` database. No secret value was committed or printed.

## Teardown proof

The approved stack-only teardown completed with all required checks passing:

```text
Stack absent: True
Endpoint inactive: True
Lambda absent: True
API absent: True
Log group absent: True
Alarms absent: True
Secret preserved: True
CDK bootstrap preserved: True
Budget preserved: True
```

No live Bedrock, Google, or Microsoft operation was triggered during deployment, smoke testing, teardown, or restoration.

## Restoration proof

The staging stack was restored from the reviewed branch after teardown. Health, readiness, CockroachDB connectivity, and authenticated identity were revalidated:

```text
Restored staging smoke passed: True
```

The restored staging stack remains deployed. Production was not changed.
