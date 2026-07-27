# Cost and Cleanup

This document defines the staging cost boundary, synthetic-data cleanup procedure, judge-access retirement, and final infrastructure teardown.

## Current cost boundary

The AWS staging stack is intentionally small:

- one API Gateway HTTP API;
- one Lambda function for REST, remote MCP, and governed harvesting;
- one bounded S3 source-artifact bucket;
- CloudWatch logs and alarms;
- least-privilege IAM; and
- one AWS Budget set to **$5 per month**.

There is:

- no production stack;
- no second remote-MCP Lambda;
- no ECS or EKS service;
- no provisioned Bedrock throughput;
- no continuously running compute instance;
- no automatic embedding generation on every write; and
- no anonymous public invocation path.

CockroachDB uses a controlled Basic cluster on AWS Singapore. CockroachDB plan terms and usage limits are managed separately from the CDK stack.

## Cost-sensitive operations

### Amazon Bedrock

Live reasoning is disabled by default in local development and enabled only through explicit bounded staging configuration. Requests have maximum input, output-token, timeout, and retry limits.

The reproducible Phase 8D demonstration performs one bounded Nova Micro extraction. Remote judge credentials are read-only and cannot initiate harvest operations.

### AWS Lambda and API Gateway

The endpoint is rate-limited. Judge instructions prohibit load testing, destructive testing, and cost-amplification testing.

### Amazon S3

Only bounded synthetic or authorized source artifacts should be uploaded. The demo cleanup removes its exact synthetic source artifact.

### CloudWatch

Logs must not include API keys, database URLs, raw request headers, raw model output, or private chain-of-thought. Retention and alarm configuration are controlled by the staging stack.

## Reproducible demo cleanup

The Phase 8D harness supports exact recovery:

```powershell
$env:RUN_PHASE8_DEMO = "true"
pnpm.cmd --filter @questoros-memory/mcp-server demo:phase8:cleanup
Remove-Item Env:RUN_PHASE8_DEMO -ErrorAction SilentlyContinue
```

Cleanup:

1. authenticates against the approved staging tenant;
2. reads the Git-ignored recovery state;
3. soft-deletes the exact synthetic memory through REST;
4. verifies the original active-memory set is restored;
5. hard-removes only recorded demo revisions, embeddings, audit events, proposal candidates, harvest run, source artifact, and memory;
6. verifies those exact identifiers are absent; and
7. removes the local recovery state.

Do not run ad hoc broad deletion queries when the recorded cleanup command is available.

## Judge fixture lifecycle

Before submission:

1. create one synthetic project memory;
2. create one controlled correction so `history` contains two revisions;
3. create a separate project-scoped API key with `memory:read` only;
4. set expiry after the official judging period;
5. verify the key through an external MCP client; and
6. place the plaintext key only in Devpost's private testing instructions.

During judging:

- keep the staging service available;
- monitor the AWS budget and CloudWatch alarms;
- do not rotate the judge key unless compromise is suspected;
- never publish the key; and
- do not place real organizational data in the fixture project.

After judging:

1. revoke or delete the judge API key;
2. soft-delete and hard-remove the exact synthetic fixture and revisions;
3. delete request-correlated audit events created only by the fixture;
4. verify the original active-memory set is restored;
5. remove the private local testing-instructions file; and
6. confirm the remote endpoint rejects the retired key.

## AWS authentication check

Before any AWS maintenance command, verify the intended account and Region:

```powershell
$env:AWS_PROFILE = "questoros-memory"
$env:AWS_REGION = "ap-southeast-1"
$env:AWS_DEFAULT_REGION = "ap-southeast-1"

aws sts get-caller-identity `
  --profile questoros-memory `
  --region ap-southeast-1 `
  --output json
```

Expected AWS account:

```text
810448722242
```

Stop when the account does not match.

## Inspect before teardown

```powershell
pnpm.cmd build
pnpm.cmd --filter @questoros-memory/aws-cdk synth
pnpm.cmd --filter @questoros-memory/aws-cdk synth:verify

pnpm.cmd dlx aws-cdk@2.1132.1 diff QuestorosMemoryStaging `
  --app "node infra/aws-cdk/dist/app.js" `
  --profile questoros-memory
```

Review the diff before any deployment or destroy operation.

## Final AWS teardown

Run final teardown only after the official judging period and after exporting any evidence required for the submission record.

```powershell
pnpm.cmd dlx aws-cdk@2.1132.1 destroy QuestorosMemoryStaging `
  --app "node infra/aws-cdk/dist/app.js" `
  --profile questoros-memory
```

CDK may require confirmation. Read the proposed deletions carefully.

The CockroachDB cluster is managed outside this CDK stack and is not deleted by `cdk destroy`. Inspect retained S3 objects, CloudWatch logs, Secrets Manager values, and any resource with a retention policy after stack teardown. Do not claim deletion until each retained resource has been checked separately.

## CockroachDB retirement

After the AWS stack and judge access are retired:

1. verify no other project relies on the cluster;
2. revoke application SQL credentials and Managed MCP access;
3. export only non-sensitive evidence that must be retained;
4. delete the standalone demo database or cluster through CockroachDB Cloud when appropriate; and
5. verify billing and usage have stopped.

Never delete the broader QuestorOS production database or infrastructure. They are outside this repository and outside the hackathon staging boundary.

## Final verification checklist

- [ ] Judge key revoked or deleted.
- [ ] Judge fixture and revisions removed.
- [ ] Demo recovery state removed.
- [ ] Original active-memory set restored.
- [ ] Remote endpoint rejects retired credentials.
- [ ] AWS stack destroyed or intentionally retained with documented approval.
- [ ] Retained S3, logs, secrets, and alarms reviewed.
- [ ] CockroachDB access revoked or cluster intentionally retained.
- [ ] AWS and CockroachDB billing checked.
- [ ] No production QuestorOS resource changed.
