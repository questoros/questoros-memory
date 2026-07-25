# Phase 4 — Bedrock embeddings and deployment preparation

## Scope

Phase 4 adds:

1. provider-neutral `@questoros-memory/embedding-provider`
2. Amazon Titan Text Embeddings V2 (`amazon.titan-embed-text-v2:0`, 1024 dims, normalize=true, float)
3. `generateEmbeddingForMemory` orchestration with reuse / force
4. REST `POST /v1/memories/:memoryId/embedding/generate`
5. MCP `questoros_memory_generate_embedding` (10 tools total)
6. AWS CDK staging preparation under `infra/aws-cdk/` (**not deployed**)

Caller-supplied embedding remains available:

- `PUT /v1/memories/:memoryId/embedding`
- `questoros_memory_set_embedding`

## Configuration

See `.env.example`. Key defaults:

```text
EMBEDDING_PROVIDER=amazon-bedrock
EMBEDDING_MODEL_ID=amazon.titan-embed-text-v2:0
EMBEDDING_DIMENSIONS=1024
EMBEDDING_NORMALIZE=true
AWS_BEDROCK_REGION=us-west-2
EMBEDDING_AUTO_ON_WRITE=false
EMBEDDING_MAX_INPUT_CHARACTERS=20000
EMBEDDING_TIMEOUT_MS=10000
EMBEDDING_MAX_ATTEMPTS=3
```

Application deployment region (future): `ap-southeast-1`.  
Bedrock invocation region for Phase 4: `us-west-2`.

Titan Text Embeddings V2 supports in-region invocation in multiple AWS Regions, including at least `us-east-1`, `us-east-2`, and `us-west-2`. Phase 4 keeps `AWS_BEDROCK_REGION=us-west-2` as the selected runtime region; this is an implementation choice, not a claim that only two Regions exist. The model is not used from `ap-southeast-1` in this phase.

Never commit AWS credentials, Cognito/session tokens, `DATABASE_URL`, or Memory API keys.

## Authorization and lifecycle

- Permission: `memory:embed`
- Tenant-bound load + credential scope enforcement
- Existing embedding for model/1024 reused when `force=false`
- Correction continues to delete embeddings; regenerate explicitly or via optional auto-on-write
- Auto-on-write is disabled by default; when enabled, failures do not roll back memory writes
- Responses never include the vector

## Database

No Phase 4 migration. Existing `memory_embeddings` unique key `(tenant_id, memory_id, embedding_model, embedding_dimensions)` is sufficient.

## Testing

Unit/provider/service/REST/MCP tests never call AWS.  
Opt-in fake-provider CockroachDB test:

```powershell
$env:RUN_DATABASE_INTEGRATION_TESTS="true"
# plus QUESTOROS_TEST_TENANT_ID / QUESTOROS_TEST_ACTOR_ID
pnpm.cmd test -- packages/memory-service/tests/embeddings.integration.test.ts
```

## Checkpoints

1. Local implementation complete — no live Bedrock, no AWS deploy
2. After approval — single live connectivity probe gated by `RUN_LIVE_BEDROCK_PREFLIGHT=true`
3. After cost/teardown approval — CDK deploy of staging only

Live Bedrock preflight must never run from `pnpm test`, `pnpm build`, package `prepare`/`postinstall`, or CI. It requires an explicit future flag such as `RUN_LIVE_BEDROCK_PREFLIGHT=true`.
