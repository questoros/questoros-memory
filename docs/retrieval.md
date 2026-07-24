# Retrieval

QuestorOS Memory retrieval combines vector similarity, structured filters, and explainable ranking. Similarity alone is insufficient — task state, approval state, execution state, and organizational scope are structured truth stored in the database, not inferred from embeddings.

## Search modes

### Text search

When only `queryText` is supplied, the service queries active memories in scope and scores results with:

- keyword overlap (`keywordScore`)
- memory `importance`
- memory `confidence`
- recency (`updatedAt` half-life decay)

### Vector search

When `queryEmbedding` (1024 finite dimensions) is supplied, vector cosine similarity is included with these default weights:

| Component        | Weight |
| ---------------- | ------ |
| vectorSimilarity | 0.55   |
| keywordScore     | 0.15   |
| importance       | 0.15   |
| confidence       | 0.10   |
| recency          | 0.05   |

Text-only search uses a separate weight profile without the vector component.

## Mandatory structured filters

Every search executes within:

1. **Tenant** — derived from authentication; never client-supplied
2. **Credential scope** — tenant, workspace, or project boundary
3. **Scope type + scope ID** — explicit in the request and enforced against the key

Optional structured filters:

| Filter                | Purpose                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------- |
| `memoryTypes`         | Content classification (FACT, DECISION, …)                                              |
| `sensitivities`       | Data sensitivity tier                                                                   |
| `icareStages`         | ICARE³ lifecycle stage                                                                  |
| `reasoningChainId`    | Group memories in one reasoning cycle                                                   |
| `sourceArtifactId`    | Provenance link                                                                         |
| `updatedAfter/Before` | Temporal window                                                                         |
| `minimumScore`        | Optional vector similarity floor (`1 - cosine_distance`) applied in SQL for vector mode |

Reasoning-chain and related-memory links **never** bypass tenant, workspace, or project isolation.

## Explainable results

Each hit includes:

```json
{
  "memory": {},
  "revisionNumber": 1,
  "explanation": {
    "matchedScope": { "scopeType": "TENANT", "scopeId": "..." },
    "components": {
      "keywordScore": 0.65,
      "importance": 0.7,
      "confidence": 0.9,
      "recency": 0.98
    },
    "weights": { "keywordScore": 0.35, "importance": 0.25 },
    "finalScore": 0.72,
    "reasons": ["Keyword match", "High importance"]
  }
}
```

Clients can show users _why_ a memory surfaced without exposing raw SQL or embedding internals.

## Deterministic ranking

Results sort by:

1. `finalScore` descending
2. `updatedAt` descending
3. `id` descending (tie-break)

## Transactional truth vs embedding similarity

| Concern                       | Source of truth                      |
| ----------------------------- | ------------------------------------ |
| Lifecycle stage               | `metadata.icare.icareStage`          |
| Reasoning chain membership    | `reasoningChainId`                   |
| Execution status              | `metadata.icare.executionStatus`     |
| Approval / evaluation outcome | Structured ICARE fields              |
| Organizational scope          | tenant / workspace / project columns |
| Semantic relatedness          | Embedding + keyword scores           |

A high vector score must not override scope denial or a deleted memory status. Corrections invalidate stale embeddings until a new vector is supplied.

## ICARE³ lifecycle in retrieval

Filter by internal stage identifiers:

- `ISSUE`, `CONTEXT`, `ANALYSIS`, `RECOMMENDATIONS`
- `RECOMMENDATION_EVALUATION` (public label: Evaluation)
- `EXECUTION`
- `EXECUTION_EVALUATION` (public label: Evaluation)

This lets agents reconstruct a reasoning cycle: issue → context → analysis → recommendations → pre-action evaluation → execution → post-action evaluation.

## Pagination (list)

List endpoints use cursor pagination encoded from `(updatedAt, id)`. Invalid cursors return `INVALID_CURSOR` without leaking internal cursor structure.
