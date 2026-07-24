# Architecture

> Phase 3 adds authenticated REST and MCP transports over a shared memory-service layer. ICARE³™ lifecycle metadata is stored in existing Memory model fields without a new migration.

## Product path

```text
QuestorOS or third-party AI client
                |
                v
Customer-facing QuestorOS Memory MCP / REST API
                |
                v
@questoros-memory/memory-service (shared business logic)
                |
                v
Authentication, tenant isolation, permissions, audit
                |
                v
Memory extraction, retrieval, ranking, context assembly
                |
                v
CockroachDB distributed memory and vector storage
                |
                +----> AWS Lambda workflows
                |
                +----> Amazon S3 source artifacts
```

REST and MCP must not duplicate business rules or access Prisma directly. Both call the same `memory-service` transport helpers.

## ICARE³ lifecycle (metadata.icare)

Public: Issue → Context → Analysis → Recommendations → Evaluation → Execution → Evaluation

Internal stages include `RECOMMENDATION_EVALUATION` and `EXECUTION_EVALUATION` for the two evaluation steps.

## Administrative and diagnostic path

```text
Cursor
  |
  v
CockroachDB Cloud Managed MCP Server
  |
  v
Read-only schema inspection and diagnostics
```

The CockroachDB Cloud Managed MCP Server is an administrative and diagnostic tool. It is not the customer-facing QuestorOS Memory MCP product.

## Initial infrastructure decisions

- CockroachDB plan: Basic
- CockroachDB cloud: AWS
- CockroachDB region: Singapore (`ap-southeast-1`)
- AWS project region: Singapore (`ap-southeast-1`)
- Existing QuestorOS production infrastructure is outside the scope of this repository.
