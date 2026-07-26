# QuestorOS Memory

**ICARE³™ — Agentic Persistent Memory for Organizational Intelligence**

> ICARE³ gives organizations agentic memory that preserves reasoning, decisions, actions, and outcomes—so every AI interaction improves the next.

QuestorOS Memory is a portable, explainable, user-controlled memory layer for AI agents, accessible through REST and MCP interfaces.

> Hackathon staging MVP. The service is deployed for controlled testing but is not production-ready.

## Current implementation status

The merged Phase 7 baseline includes:

- CockroachDB-backed organizational memory and native vector retrieval;
- tenant, workspace, and project authorization boundaries;
- authenticated REST APIs deployed to AWS staging in Singapore (`ap-southeast-1`);
- Amazon Bedrock reasoning through the US Nova Micro cross-Region inference profile;
- proposal-only governed harvesting with human-review boundaries;
- strict structured-output validation, sanitized errors, and bounded model usage;
- a local customer-facing MCP stdio server over the shared memory-service layer; and
- a $5 monthly AWS staging budget with no provisioned Bedrock throughput.

A live governed-harvest test completed successfully with one pending proposal candidate and zero authoritative-memory writes.

## Phase 8 — Remote MCP and demo readiness

Phase 8 converts the validated staging MVP into a judge-ready external integration:

1. correct public documentation and architecture status;
2. add an authenticated remote MCP transport without raw database access;
3. verify an external AI client can retrieve through the same authorization layer;
4. provide a reproducible synthetic end-to-end demonstration; and
5. finalize security, disclosure, setup, and judging documentation.

The Phase 8 branch now contains a tested stateless Streamable HTTP MCP transport with bearer-key authentication and an immutable five-tool read-only allowlist. It has not been deployed to AWS staging or merged into the baseline.

Initial remote tools:

```text
questoros_memory_whoami
questoros_memory_get
questoros_memory_list
questoros_memory_search
questoros_memory_history
```

See [`docs/phase-8-remote-mcp-demo.md`](docs/phase-8-remote-mcp-demo.md) and [`docs/mcp-server.md`](docs/mcp-server.md).

## ICARE³ reasoning lifecycle

Public lifecycle:

> **Issue → Context → Analysis → Recommendations → Evaluation → Execution → Evaluation**

Internally, the two Evaluation stages are distinguished as `RECOMMENDATION_EVALUATION` (assess recommendations before action) and `EXECUTION_EVALUATION` (measure execution, outcomes, evidence, and lessons learned).

## Core product path

```text
QuestorOS or third-party AI client
                |
                v
Customer-facing MCP / authenticated REST API
                |
                v
@questoros-memory/memory-service
                |
                v
Authentication, authorization, scope enforcement, audit
                |
                v
CockroachDB memory, revision, provenance, and vector storage
                |
                +----> Amazon Bedrock reasoning
                |
                +----> Amazon S3 source artifacts
```

REST and MCP transports use the shared `memory-service` layer. They do not duplicate business rules or access Prisma directly.

## MVP capabilities

The current staging MVP demonstrates:

1. storing meaningful organizational memory;
2. retrieving it in a later session;
3. CockroachDB vector retrieval;
4. tenant, workspace, and project authorization filters;
5. retrieval explanations and provenance;
6. correction, revision history, and soft deletion;
7. local access through the customer-facing MCP server; and
8. live Bedrock-assisted harvesting that creates proposals without silently changing authoritative memory.

The Phase 8 branch additionally demonstrates authenticated remote MCP protocol integration through the official Streamable HTTP client without enabling remote write tools.

## Two distinct MCP layers

### CockroachDB Cloud Managed MCP Server

Used for read-only schema inspection, diagnostics, retrieval verification, and index recommendations. It is an administrative development tool and must not be treated as the customer product.

### QuestorOS Memory MCP Server

The customer-facing server exposes controlled memory operations without raw SQL or unrestricted database access. The merged baseline uses stdio locally. The Phase 8 branch adds an authenticated stateless Streamable HTTP transport over the same service and authorization boundaries; staging deployment remains pending explicit approval.

See [`docs/mcp-server.md`](docs/mcp-server.md), [`docs/rest-api.md`](docs/rest-api.md), and [`docs/architecture.md`](docs/architecture.md).

## Repository status and disclosure

This repository contains new hackathon work for the standalone **QuestorOS Memory: Agentic Memory as a Service** project (ICARE³™).

The broader QuestorOS product existed before the hackathon and already included internal memory concepts and functionality. The standalone CockroachDB/AWS/MCP memory service and its portable developer interfaces are the hackathon implementation. Reused work must be identified and disclosed in [`docs/pre-existing-work.md`](docs/pre-existing-work.md).

## Infrastructure

- CockroachDB Basic on AWS Singapore;
- AWS staging stack in Singapore (`ap-southeast-1`);
- Bedrock reasoning client in `us-west-2` using `us.amazon.nova-micro-v1:0`;
- proposal-only governed harvesting;
- Apache License 2.0.

## Setup

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

See [`docs/development.md`](docs/development.md) for full local setup instructions.

## Architecture

See [`docs/architecture.md`](docs/architecture.md), [`docs/authentication.md`](docs/authentication.md), and [`docs/retrieval.md`](docs/retrieval.md).

## Security

Read [`SECURITY.md`](SECURITY.md), [`docs/security.md`](docs/security.md), and [`docs/threat-model.md`](docs/threat-model.md) before connecting credentials or external tools.

## License

Licensed under the [Apache License 2.0](LICENSE).
