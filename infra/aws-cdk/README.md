# QuestorOS Memory — AWS CDK staging (Phase 4)

**Status:** Prepared only. **Do not deploy** without explicit cost and teardown approval.

## Topology

```text
API Gateway HTTP API (ap-southeast-1)
  → Lambda Node.js 24 (ap-southeast-1)
  → CockroachDB Cloud (Singapore)
  → Bedrock Runtime (us-west-2) Titan Text Embeddings V2
```

## Regions

| Concern                | Region           |
| ---------------------- | ---------------- |
| Application deployment | `ap-southeast-1` |
| Bedrock InvokeModel    | `us-west-2`      |

Titan Text Embeddings V2 supports in-region invocation in multiple AWS Regions, including at least `us-east-1`, `us-east-2`, and `us-west-2`. Phase 4 selects `us-west-2` for Bedrock calls and does not invoke the model from `ap-southeast-1`. Keep application and Bedrock regions as separate settings.

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

- `EMBEDDING_AUTO_ON_WRITE=false` by default
- no historical backfill
- no batch job / provisioned throughput / Priority tier
- Lambda reserved concurrency: 5
- API Gateway stage throttling: 20 rps / burst 40
- CloudWatch log retention: 14 days
- Secrets from AWS Secrets Manager (never CloudFormation outputs)
- tags: `project`, `environment`, `phase`, `manager`
- stdio MCP is not deployed; remote Streamable HTTP MCP requires a later security checkpoint

## Cost and teardown

Before any deploy, publish:

1. estimated monthly cost for Lambda + API Gateway + Secrets Manager + CloudWatch + Bedrock invocations
2. AWS Budget alert documentation
3. teardown command (`cdk destroy` for this stack only)

Until approval:

```powershell
pnpm.cmd --filter @questoros-memory/aws-cdk deploy
```

must remain blocked.
