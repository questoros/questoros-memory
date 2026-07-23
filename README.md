# QuestorOS Memory

**QuestorOS Memory is a portable, explainable, user-controlled memory layer for AI agents, accessible through MCP, APIs, and SDKs.**

> Hackathon work in progress. Not production-ready.

## Phase 2 — Quality gates and database schema

- Quality gates implemented: ESLint, Vitest, Husky, lint-staged, GitHub Actions CI.
- Initial CockroachDB memory schema implemented with nine tables and native vector index.
- Customer-facing APIs are not yet implemented.
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

The planned customer-facing service that will expose controlled memory operations without providing raw SQL or unrestricted database access.

## Repository status and disclosure

This repository contains new hackathon work for the standalone **QuestorOS Memory: Agentic Memory as a Service** project.

The broader QuestorOS product existed before the hackathon and already included internal memory concepts and functionality. Reused work must be identified and disclosed in [`docs/pre-existing-work.md`](docs/pre-existing-work.md).

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

See [`docs/architecture.md`](docs/architecture.md).

## Security

Read [`SECURITY.md`](SECURITY.md), [`docs/security.md`](docs/security.md), and [`docs/threat-model.md`](docs/threat-model.md) before connecting credentials or external tools.

## License

Licensed under the [Apache License 2.0](LICENSE).
