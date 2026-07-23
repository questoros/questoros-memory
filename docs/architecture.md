# Architecture

> Planned hackathon architecture. Components described here are not complete unless explicitly marked otherwise.

## Product path

```text
QuestorOS or third-party AI client
                |
                v
Customer-facing QuestorOS Memory MCP / REST API
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
