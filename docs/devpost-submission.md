# Devpost Submission Draft

Use this document as the source of truth when completing the CockroachDB × AWS Hackathon submission form. Replace bracketed placeholders before submitting.

## Project name

**QuestorOS Memory — ICARE³ Agentic Memory for Organizational Intelligence**

## Tagline

A governed persistent-memory layer that lets separate AI agents remember organizational reasoning, decisions, revisions, provenance, and outcomes safely across sessions.

## Repository

```text
https://github.com/questoros/questoros-memory
```

The repository is public and licensed under Apache License 2.0.

## Functional demo

```text
https://blrt2ds22f.execute-api.ap-southeast-1.amazonaws.com/staging/mcp
```

The endpoint is an authenticated MCP Streamable HTTP service. Supply the temporary project-scoped read-only bearer key only in Devpost's private testing instructions. Do not place the key in the public project description, screenshots, repository, or video.

## Demonstration video

```text
[PUBLIC YOUTUBE OR VIMEO URL — UNDER THREE MINUTES]
```

## What problem does it solve?

Organizations are adopting multiple AI assistants, but the reasoning created in those interactions is fragmented across users, vendors, chats, and sessions. Documents preserve outputs, but they do not preserve trusted agent memory with authorization scope, provenance, immutable corrections, explainable retrieval, and governance over what becomes authoritative.

QuestorOS Memory creates that missing system of record. It allows an AI client to retrieve durable organizational context without replacing the client's existing model or workflow platform.

## What does it do?

QuestorOS Memory stores scoped organizational memory in CockroachDB and makes it available through authenticated REST and MCP interfaces.

The live staging demonstration proves that:

- one client session can create a synthetic project memory;
- a separate MCP session can retrieve it through list, explainable search, and get;
- a controlled correction creates an immutable second revision;
- another independent MCP session can retrieve the corrected content and full history;
- project-scoped credentials cannot cross into another project;
- remote write tools remain unavailable;
- Amazon Bedrock can extract a pending proposal without silently changing authoritative memory; and
- every synthetic authoritative and proposal record can be removed exactly, restoring the original state.

## How it works

All REST and MCP requests call the same `@questoros-memory/memory-service` business layer. That layer performs authentication, permission checks, tenant/workspace/project scope enforcement, audit logging, lifecycle operations, retrieval explanation, and governance.

CockroachDB stores:

- tenants, workspaces, projects, and actors;
- authoritative memories;
- immutable memory revisions;
- vector embeddings and the vector index;
- source artifacts;
- audit events;
- harvest runs; and
- proposal candidates awaiting explicit review.

AWS Lambda runs the authenticated REST API, remote MCP adapter, and governed-harvest workflow. API Gateway provides HTTPS ingress and throttling. Amazon Bedrock Nova Micro performs bounded structured extraction. S3 stores bounded source artifacts. CloudWatch provides logs and alarms. IAM limits runtime permissions, and an AWS Budget caps the staging target at $5 per month.

## CockroachDB tools used

### CockroachDB Distributed Vector Indexing

QuestorOS Memory stores 1,024-dimensional vectors in CockroachDB and uses the `memory_embeddings_scope_cosine_idx` vector index with cosine operators. Vector retrieval is combined with authorization filters, metadata, and an explanation object instead of being exposed as an unrestricted similarity query.

### CockroachDB Cloud Managed MCP Server

The Managed MCP Server is used as a separate read-only administrative development tool for schema inspection, table and index verification, retrieval diagnostics, and index recommendations. It is intentionally separated from the customer-facing QuestorOS Memory MCP service and never receives application SQL credentials or write permission.

## AWS services used

- **AWS Lambda:** serverless REST, remote MCP, and governed-harvest execution.
- **Amazon API Gateway:** HTTPS staging endpoint and request throttling.
- **Amazon Bedrock:** structured reasoning with `us.amazon.nova-micro-v1:0`.
- **Amazon S3:** bounded source-artifact storage.
- **Amazon CloudWatch:** logs, request correlation, and alarms.
- **AWS IAM:** least-privilege service access.
- **AWS Budgets:** $5 monthly staging budget boundary.

## Agentic memory design

Memory is the product's central system of record, not an accessory table. The design preserves content, scope, provenance, confidence, importance, lifecycle stage, revisions, audit events, embeddings, retrieval explanations, and proposal-review state.

A model may propose memory, but it cannot directly approve, publish, correct, delete, or create authoritative memory. This prevents a model-generated interpretation from silently becoming organizational truth.

## Technical implementation

- PostgreSQL-compatible CockroachDB schema with explicit tenant/workspace/project boundaries.
- Native vector storage and distributed vector index.
- Shared authorization and business-logic layer for REST and MCP.
- Official MCP SDK with stateless Streamable HTTP.
- Bearer authentication before initialization or tool discovery.
- Exact five-tool remote read-only allowlist.
- Deny-by-default browser origins.
- Strict JSON and Zod validation for model output.
- Sanitized protocol errors and request correlation.
- CDK-defined AWS staging infrastructure with synthesis and assembly verification.
- Automated formatting, linting, type checking, tests, build, and infrastructure checks in CI.

## Real-world impact

The same memory layer can serve legal teams, financial institutions, educators, support organizations, engineering teams, and enterprises that need AI-generated context to remain durable, explainable, access-controlled, and owned by the organization.

The portable service model lets an organization retain its chosen AI clients and models while keeping organizational memory in a separate governed system of record.

## Product readiness

The staging MVP includes:

- tenant, workspace, and project isolation;
- scoped API keys and granular permissions;
- immutable revision history;
- provenance and audit events;
- explainable retrieval;
- remote read-only MCP access;
- least-privilege IAM;
- throttling, logging, alarms, and a cost budget;
- proposal-only model output;
- deterministic synthetic acceptance tests; and
- exact cleanup and state-restoration proof.

The project is explicitly described as a staging MVP rather than production-ready software.

## Creativity and originality

QuestorOS Memory treats agentic memory as organizational infrastructure rather than a chat-history feature. Its core insight is that durable memory must preserve not just facts, but the lifecycle of organizational reasoning: issue, context, analysis, recommendations, evaluation, execution, and outcome evaluation.

## Challenges

The most difficult engineering issue was adapting the official MCP Streamable HTTP protocol to API Gateway and Lambda without allowing a Node HTTP transport to operate on a synthetic Fastify socket. CloudWatch exposed the failure, and the final Lambda adapter maps API Gateway events directly to the SDK Web Standards transport while keeping normal REST traffic on Fastify.

A second challenge was maintaining strict governance while demonstrating live model reasoning. The final design allows Bedrock to create only pending proposals and proves that authoritative memory remains unchanged until an explicit governed action occurs.

## Accomplishments

- Authenticated remote MCP running in AWS staging.
- Cross-session persistent retrieval through the official MCP client.
- Explainable search and immutable correction history.
- Project isolation and remote-write denial proven live.
- Live Bedrock proposal generation with zero automatic authoritative writes.
- Complete synthetic cleanup with exact state restoration.
- Full CI and CDK verification.

## What we learned

Persistent memory becomes production-relevant only when retrieval, authorization, provenance, correction, governance, and failure handling are designed together. A vector result alone is not organizational memory, and a model output should not automatically become organizational truth.

## What's next

- OAuth and managed customer onboarding.
- Production-grade multi-region deployment.
- Additional agent adapters.
- Human review UI for proposal candidates.
- Policy-configurable retention and sensitivity controls.
- Expanded observability and recovery automation.
- Integration into the broader QuestorOS Intelligence Operating System.

## Pre-existing work disclosure

QuestorOS existed before the hackathon as a broader AI workspace and operating-system concept with internal memory ideas. The standalone product implemented in this repository—QuestorOS Memory: Agentic Memory as a Service—was created during the hackathon submission period.

The new hackathon work includes the standalone CockroachDB schema, distributed vector retrieval, AWS staging stack, REST and MCP interfaces, multi-tenant authorization, provenance, revision history, governed harvesting, external-client demonstration, and submission package.

See [`pre-existing-work.md`](pre-existing-work.md).

## Private testing instructions

Use [`private-judge-testing-template.md`](private-judge-testing-template.md) as the source for Devpost's private testing field. Never place the completed credential in this public file.

The final private instructions must include:

```text
Transport: MCP Streamable HTTP
Endpoint: https://blrt2ds22f.execute-api.ap-southeast-1.amazonaws.com/staging/mcp
Authentication: Authorization: Bearer [TEMPORARY READ-ONLY JUDGE KEY]
Credential scope: PROJECT
Permissions: memory:read only
Expected tools: questoros_memory_whoami, questoros_memory_get, questoros_memory_list, questoros_memory_search, questoros_memory_history
Synthetic fixture memory ID: [PROVISIONED MEMORY ID]
Credential expiry: [EXPIRY AFTER JUDGING]
```

## Final submission checklist

### Repository-side complete

- [x] Public repository URL prepared.
- [x] Apache License 2.0 present.
- [x] Functional MCP endpoint documented.
- [x] CockroachDB tools and AWS services identified.
- [x] Pre-existing work disclosed.
- [x] Architecture diagram included.
- [x] Reproducible cross-session demo passed.
- [x] Exact cleanup and state restoration passed.
- [x] Judge guide prepared.
- [x] Private testing template prepared without secrets.
- [x] Less-than-three-minute video script prepared.
- [x] Final evidence review prepared.
- [x] Full CI and CDK verification passed.

### External actions remaining

- [ ] Provision a temporary read-only judge key and place it only in private testing instructions.
- [ ] Provision the stable synthetic judge fixture.
- [ ] Record and upload the public YouTube or Vimeo video.
- [ ] Replace the video placeholder above.
- [ ] Test the completed submission from a signed-out browser and clean external MCP client.
- [ ] Submit the Devpost form.
- [ ] Keep staging available through judging.
- [ ] Revoke the judge key and remove the fixture after judging.

See [`final-submission-review.md`](final-submission-review.md) for the final gate and [`cost-and-cleanup.md`](cost-and-cleanup.md) for post-judging teardown.
