# QuestorOS Memory

**ICARE³™ — Agentic Persistent Memory for Organizational Intelligence**

> ICARE³ gives organizations agentic memory that preserves reasoning, decisions, actions, and outcomes—so every AI interaction improves the next.

QuestorOS Memory is a portable, explainable, user-controlled memory layer for AI agents, accessible through MCP, REST APIs, and SDKs.

> Hackathon work in progress. Not production-ready.

## ICARE³ reasoning lifecycle

Public lifecycle:

> **Issue → Context → Analysis → Recommendations → Evaluation → Execution → Evaluation**

Internally, the two Evaluation stages are distinguished as `RECOMMENDATION_EVALUATION` (assess recommendations before action) and `EXECUTION_EVALUATION` (measure execution, outcomes, evidence, and lessons learned).

## Phase 3 — Memory API and MCP

- Shared Zod contracts and ICARE³ lifecycle metadata in `@questoros-memory/memory-core`
- Canonical `memory-service` layer with tenant/workspace/project isolation
- Fastify REST API (`services/memory-api`)
- MCP stdio server with nine memory tools (`services/mcp-server`)
- Phase 3 hardening tests (mocked; no live `DATABASE_URL` required)

See [`docs/rest-api.md`](docs/rest-api.md), [`docs/mcp-server.md`](docs/mcp-server.md), and [`docs/phase-3-verification.md`](docs/phase-3-verification.md).

## Phase 2 — Quality gates and database schema

- Quality gates implemented: ESLint, Vitest, Husky, lint-staged, GitHub Actions CI.
- Initial CockroachDB memory schema implemented with nine tables and native vector index.
- Customer-facing REST and MCP interfaces are implemented in Phase 3 (local/dev; AWS runtime not deployed).
- AWS runtime is not yet deployed.

## MVP objective

The hackathon MVP is intended to demonstrate:

1. storing a meaningful memory;
2. retrieving it in a later session;
3. CockroachDB vector retrieval;
4. tenant, workspace, and project authorization filters;
5. retrieval explanations and provenance;
6. correction and deletion; and
7. access through a customer-facing MCP server.

## Two distinct MCP layers

### CockroachDB Cloud Managed MCP Server

Used for read-only schema inspection, diagnostics, retrieval verification, and index recommendations. It is an administrative development tool and must not be treated as the customer product.

### QuestorOS Memory MCP Server

The customer-facing Phase 3 stdio MCP server that exposes nine controlled memory tools without providing raw SQL or unrestricted database access. Local configuration uses placeholders only; AWS hosting is not deployed yet.

## Repository status and disclosure

This repository contains new hackathon work for the standalone **QuestorOS Memory: Agentic Memory as a Service** project (ICARE³™).

The broader QuestorOS product existed before the hackathon and already included internal memory concepts and functionality. The standalone CockroachDB/AWS/MCP memory service and its portable developer interfaces are the hackathon implementation. Reused work must be identified and disclosed in [`docs/pre-existing-work.md`](docs/pre-existing-work.md).

## Initial infrastructure

- CockroachDB Basic cluster
- AWS cloud
- Singapore region (`ap-southeast-1`)
- Apache License 2.0

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
