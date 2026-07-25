# REST API

The Memory API is a Fastify service that exposes ICARE³™ organizational memory over HTTPS JSON. All authenticated routes call `@questoros-memory/memory-service` transport helpers — routes never access Prisma directly.

Base URL (local default): `http://127.0.0.1:8787`

## Authentication

Send the API key as a bearer token:

```http
Authorization: Bearer qmem_live_example_0123456789abcdef0123456789abcdef
```

Optional request correlation:

```http
X-Request-Id: req-20260724-001
```

## Unauthenticated endpoints

### `GET /healthz`

Liveness probe.

**Response `200`**

```json
{ "status": "ok" }
```

### `GET /readyz`

Readiness probe (includes database connectivity check).

**Response `200`**

```json
{ "status": "ok" }
```

**Response `503`** when the database is unreachable.

## Authenticated endpoints

All `/v1/*` routes require a valid bearer token and enforce permissions plus credential scope.

### `GET /v1/whoami`

Returns tenant, actor, credential scope, and permissions.

**Permission:** none required beyond valid authentication.

**Response `200`**

```json
{
  "tenantId": "11111111-1111-4111-8111-111111111111",
  "actorId": "22222222-2222-4222-8222-222222222222",
  "credentialScope": {
    "scopeType": "TENANT",
    "scopeId": "11111111-1111-4111-8111-111111111111",
    "workspaceId": null,
    "projectId": null
  },
  "permissions": ["memory:read", "memory:write"]
}
```

### `POST /v1/memories`

Creates a memory within the authenticated scope.

**Permission:** `memory:write`

**Request body (excerpt)**

```json
{
  "scopeType": "TENANT",
  "memoryType": "DECISION",
  "title": "Rollout approval",
  "content": "Approve phased rollout to Singapore region.",
  "icareStage": "RECOMMENDATIONS",
  "reasoningChainId": "88888888-8888-4888-8888-888888888888",
  "relatedMemoryIds": ["66666666-6666-4666-8666-666666666666"],
  "metadata": { "source": "planning-session" }
}
```

ICARE³ lifecycle fields are stored under `metadata.icare`. Title is stored as `metadata.title`.

**Response `201`** — memory record.

### `GET /v1/memories`

Lists memories with cursor pagination.

**Permission:** `memory:read`

**Query parameters**

| Parameter          | Description                     |
| ------------------ | ------------------------------- |
| `scopeType`        | Optional scope filter           |
| `workspaceId`      | Workspace filter when scoped    |
| `projectId`        | Project filter when scoped      |
| `memoryType`       | Memory type filter              |
| `icareStage`       | ICARE³ lifecycle stage filter   |
| `reasoningChainId` | Reasoning-chain filter          |
| `limit`            | Page size (default 20, max 100) |
| `cursor`           | Opaque pagination cursor        |

**Response `200`**

```json
{
  "items": [{ "id": "...", "metadata": { "icare": { "icareStage": "ISSUE" } } }],
  "nextCursor": null
}
```

### `GET /v1/memories/:memoryId`

Retrieves one memory.

**Permission:** `memory:read`

**Query:** `includeDeleted=true|false`

### `POST /v1/memories/search`

Explainable search by text and/or embedding.

**Permission:** `memory:read`

**Request body (excerpt)**

```json
{
  "scopeType": "TENANT",
  "queryText": "deployment risk",
  "icareStages": ["ANALYSIS", "RECOMMENDATION_EVALUATION"],
  "reasoningChainId": "88888888-8888-4888-8888-888888888888",
  "limit": 20
}
```

At least one of `queryText` or `queryEmbedding` (1024 dimensions) is required.

**Response `200`** — array of `{ memory, revisionNumber, explanation }`.

### `POST /v1/memories/:memoryId/corrections`

Corrects content and preserves revision history. Invalidates embeddings.

**Permission:** `memory:correct`

**Request body**

```json
{
  "content": "Updated decision text.",
  "reason": "Clarify scope after review.",
  "icareStage": "RECOMMENDATION_EVALUATION"
}
```

**Response `200`**

```json
{
  "id": "66666666-6666-4666-8666-666666666666",
  "revisionNumber": 2,
  "embeddingInvalidated": true
}
```

### `DELETE /v1/memories/:memoryId`

Soft-deletes a memory.

**Permission:** `memory:delete`

**Response `200`**

```json
{ "alreadyDeleted": false }
```

### `GET /v1/memories/:memoryId/revisions`

Returns immutable revision history.

**Permission:** `memory:read`

### `PUT /v1/memories/:memoryId/embedding`

Upserts a 1024-dimension embedding vector.

**Permission:** `memory:embed`

**Request body**

```json
{
  "embedding": [0.01, 0.02],
  "embeddingModel": "amazon.titan-embed-text-v2:0"
}
```

(The `embedding` array must contain exactly 1024 finite numbers.)

**Response `200`**

```json
{ "status": "ok" }
```

### `POST /v1/memories/:memoryId/embedding/generate`

Generates and persists a Titan Text Embeddings V2 embedding for the memory content.

Permission: `memory:embed`

```json
{ "force": false }
```

**Response `200`** (metadata only; never the vector):

```json
{
  "memoryId": "66666666-6666-4666-8666-666666666666",
  "provider": "amazon-bedrock",
  "modelId": "amazon.titan-embed-text-v2:0",
  "dimensions": 1024,
  "normalized": true,
  "inputTokenCount": 12,
  "generated": true,
  "reused": false
}
```

When an embedding already exists for the configured model/dimensions and `force` is false, the existing row is reused without calling Bedrock.

## Structured errors

All error responses use this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed: content must not be empty.",
    "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  }
}
```

Errors never include stack traces, Prisma messages, connection strings, or key material.

## ICARE³ lifecycle fields

Public lifecycle:

> Issue → Context → Analysis → Recommendations → Evaluation → Execution → Evaluation

Internal identifiers distinguish the two evaluation stages:

- `RECOMMENDATION_EVALUATION` — assess recommendations before action
- `EXECUTION_EVALUATION` — measure execution, outcomes, evidence, lessons

Optional request/response fields: `icareStage`, `reasoningChainId`, `relatedMemoryIds`, `evaluationTargetMemoryId`, `executionStatus`, `outcomeSummary`, `lessonsLearned`.
