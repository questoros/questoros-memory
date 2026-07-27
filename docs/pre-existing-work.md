# Pre-existing Work Disclosure

## What existed before the hackathon

QuestorOS existed before the submission period as a broader AI workspace and operating-system concept. It included internal ideas and functionality for retaining user, conversation, project, and workflow context.

The broader QuestorOS application, its production infrastructure, and its earlier internal memory implementation are not contained in or deployed by this repository.

## What was created for this hackathon

The standalone product in this repository—**QuestorOS Memory: Agentic Memory as a Service**—was created during the hackathon submission period as a separate public implementation.

Hackathon work includes:

- the standalone CockroachDB organizational-memory schema;
- tenant, workspace, project, actor, and scoped API-key boundaries;
- authoritative memories, immutable revisions, provenance, and audit events;
- 1,024-dimensional vector storage and distributed cosine indexing;
- explainable scoped retrieval;
- correction and deletion lifecycle operations;
- proposal candidates and governed review boundaries;
- Amazon Bedrock structured reasoning;
- AWS API Gateway, Lambda, S3, CloudWatch, IAM, Budgets, and CDK staging integration;
- customer-facing REST and MCP interfaces;
- local stdio MCP and authenticated remote Streamable HTTP MCP;
- external-client acceptance tests;
- deterministic synthetic setup, verification, cleanup, and state-restoration tooling; and
- the public documentation, judge guide, submission draft, and video plan.

## Standard tools and dependencies

The project uses standard development tools, open-source packages, frameworks, SDKs, and AI coding assistants. Examples include TypeScript, Node.js, pnpm, Prisma, Fastify, Zod, the official Model Context Protocol SDK, AWS SDK/CDK packages, and CockroachDB's PostgreSQL-compatible interfaces.

Third-party components remain subject to their respective licenses. The original project code in this repository is released under Apache License 2.0.

## Separation from prior QuestorOS work

This repository does not copy or deploy the broader QuestorOS application. QuestorOS is referenced as a future or first-party client of the standalone memory service, alongside third-party AI clients.

The central pre-existing idea was that persistent memory matters to QuestorOS. The hackathon implementation turns that concept into a new standalone CockroachDB/AWS/MCP product with its own schema, authorization model, governance workflow, deployment, tests, and external interfaces.

## Ongoing disclosure rule

Any future file copied or adapted from a pre-existing QuestorOS repository must identify:

1. the source repository;
2. the source path;
3. the source commit;
4. the scope of adaptation; and
5. why inclusion complies with the hackathon rules and the source license.

No undisclosed production QuestorOS code should be added to this repository.
