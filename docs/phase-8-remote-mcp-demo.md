# Phase 8 — Remote MCP and Hackathon Demo Readiness

## Read this first

Phase 7 is complete and merged. The following facts are already proven and must not be reimplemented or weakened:

- AWS staging is deployed in `ap-southeast-1`.
- Live Bedrock reasoning uses `us.amazon.nova-micro-v1:0` through a client in `us-west-2`.
- Governed harvesting creates proposal candidates only.
- A successful live test created one `PENDING` candidate and zero authoritative-memory writes.
- REST and MCP must use `@questoros-memory/memory-service` rather than Prisma directly.
- The current customer MCP server is local stdio only.
- The CockroachDB Cloud Managed MCP server is an administrative diagnostic tool, not the product MCP server.
- Existing QuestorOS production infrastructure is outside this repository.
- The AWS staging budget remains $5 per month.

Phase 8 must not add automatic approval, publication, correction, deletion, or authoritative-memory creation by a model.

## Objective

Deliver a secure authenticated remote MCP endpoint and a reproducible external-client demonstration of persistent organizational intelligence without changing the established memory-service, authorization, governance, or cost boundaries.

## Work order

### 8A — Baseline audit and documentation correction

Required:

- update README status;
- update architecture to show deployed REST, CockroachDB, Bedrock, S3, and local MCP;
- state clearly that remote MCP is not yet available;
- document the Phase 8 security and acceptance boundaries;
- remove claims that AWS is not deployed.

Acceptance:

- no public document claims that the current MCP server is already remote;
- no public document claims that AWS staging is undeployed;
- no production-readiness claim is made.

### 8B — Authenticated remote MCP transport

Required:

- add a remote HTTPS-capable MCP transport;
- reuse the existing MCP tool handlers or shared tool definitions;
- route every operation through `@questoros-memory/memory-service`;
- preserve API-key authentication, permissions, scope enforcement, and audit correlation;
- keep protocol output separate from diagnostics;
- return sanitized errors only;
- expose an explicit tool allowlist.

Initial remote allowlist:

```text
questoros_memory_whoami
questoros_memory_get
questoros_memory_list
questoros_memory_search
questoros_memory_history
```

A proposal-only harvest tool may be added only after the read-only transport is working and tested. Do not expose create, correct, delete, approval, rejection, publication, embedding mutation, or administrative tools in the first remote version.

Acceptance:

- unauthenticated request rejected;
- invalid, revoked, and expired key rejected;
- out-of-scope request rejected;
- allowed read operation succeeds;
- non-allowlisted tool cannot be invoked;
- no client receives `DATABASE_URL`, AWS credentials, raw request headers, raw model output, or private chain-of-thought.

### 8C — External-client integration test

Required:

- connect one external MCP-compatible AI client;
- use a synthetic tenant/project-scoped key;
- run `whoami`;
- retrieve known synthetic memory;
- run explainable search;
- retrieve revision history;
- verify project isolation with a negative test.

Acceptance:

- all allowed operations succeed through remote MCP;
- narrower scope cannot access another project;
- audit records contain request correlation without secrets;
- authoritative memory is unchanged by read-only tests.

### 8D — Reproducible end-to-end demo

Required demo story:

1. create or seed synthetic organizational memory;
2. end the first client session;
3. start a new session;
4. retrieve the prior context through remote MCP;
5. show CockroachDB persistence and provenance;
6. submit one synthetic governed-harvest source;
7. show one proposal candidate awaiting review;
8. prove the authoritative memory set did not change automatically;
9. demonstrate correction history or soft deletion through the controlled REST/local-admin path, not the initial remote MCP allowlist.

Required scripts:

- one setup/seed command;
- one demo verification command;
- one cleanup/reset command;
- no private QuestorOS or customer data.

### 8E — Submission package

Required:

- current README;
- architecture diagram;
- remote MCP setup guide;
- REST examples;
- security and governance explanation;
- CockroachDB and AWS integration explanation;
- pre-existing-work disclosure;
- demo script and judge walkthrough;
- final screenshots or video evidence;
- cost and cleanup instructions.

## Non-goals

Phase 8 does not include:

- production deployment;
- public anonymous access;
- OAuth redesign;
- new memory schema;
- new reasoning model;
- automatic model approvals;
- unrestricted remote write tools;
- raw SQL access;
- migration of the broader QuestorOS product into this repository.

## Test gates

Every Phase 8 pull request must pass:

```text
format
lint
typecheck
unit tests
full build
CDK synthesis
AWS assembly verification
```

Before any new staging deployment:

1. review `cdk diff`;
2. confirm no unrelated resource replacement or deletion;
3. confirm no wildcard Bedrock or database access;
4. confirm the $5 budget remains;
5. deploy only the existing staging stack;
6. run read-only health, readiness, and authentication smoke tests.

Before exposing a remote harvest tool:

1. run the read-only remote MCP suite first;
2. use synthetic data only;
3. limit the run to one source;
4. require proposal-only results;
5. verify zero authoritative-memory writes;
6. require explicit approval before merging.

## Completion definition

Phase 8 is complete only when:

- a remote authenticated MCP client can connect;
- the initial read-only tool allowlist works;
- scope isolation is proven;
- one reproducible cross-session demo works;
- governed harvesting remains proposal-only;
- documentation matches the deployed architecture;
- CI and staging smoke tests pass; and
- final merge is explicitly approved.
