# Phase 8 — Remote MCP and Hackathon Demo Readiness

## Read this first

Phase 7 is complete and merged. These facts are already proven and must not be weakened:

- AWS staging is deployed in `ap-southeast-1`.
- Live Bedrock reasoning uses `us.amazon.nova-micro-v1:0` through a client in `us-west-2`.
- Governed harvesting creates proposal candidates only.
- REST and MCP use `@questoros-memory/memory-service`; neither transport accesses Prisma directly.
- Existing QuestorOS production infrastructure is outside this repository.
- The AWS staging budget remains $5 per month.
- A model cannot automatically approve, publish, correct, delete, or create authoritative memory.

## Objective

Deliver a secure authenticated remote MCP endpoint and a reproducible external-client demonstration of persistent organizational intelligence without changing the established authorization, governance, or cost boundaries.

## Current checkpoint

- **8A — complete:** public status and architecture documentation corrected.
- **8B — complete:** authenticated stateless Streamable HTTP transport, immutable five-tool read-only allowlist, safe origin handling, sanitized errors, request correlation, and official-client tests.
- **8C — complete:** corrected Lambda bundle deployed and live remote MCP acceptance passed.
- **8D — implemented; live run pending:** reproducible setup, verification, cleanup, and all-in-one demo commands.
- **8E — pending:** final submission package and demonstration video.

## Deployed remote MCP

Endpoint:

```text
https://blrt2ds22f.execute-api.ap-southeast-1.amazonaws.com/staging/mcp
```

Exact remote allowlist:

```text
questoros_memory_whoami
questoros_memory_get
questoros_memory_list
questoros_memory_search
questoros_memory_history
```

The remote endpoint does not expose create, correct, delete, embedding mutation, harvest, approval, rejection, publication, synchronization, or administrative tools.

Live Phase 8C acceptance proved:

- official MCP client authentication;
- exact five-tool discovery;
- unauthenticated access rejection;
- deny-by-default browser origins;
- project-scoped authorization;
- non-allowlisted remote writes blocked;
- zero authoritative-memory writes; and
- an unchanged authoritative-memory set.

The initial project contained no authoritative memories, so Phase 8C did not exercise `get` or `history`. Phase 8D closes that demonstration gap with a temporary synthetic record and exact cleanup.

## Phase 8D reproducible demo

The Phase 8D harness is gated and synthetic-only. It uses the existing private project-scoped staging key from the ignored local `.env` and the matching `DATABASE_URL` only for exact final cleanup. No secret is written to the demo state or report.

### Setup

```powershell
$env:RUN_PHASE8_DEMO = "true"
pnpm.cmd --filter @questoros-memory/mcp-server demo:phase8:setup
Remove-Item Env:RUN_PHASE8_DEMO -ErrorAction SilentlyContinue
```

Setup:

1. authenticates through staging REST;
2. requires project scope and least-required read/write/correct/delete/harvest permissions;
3. verifies the local database URL contains the authenticated staging tenant;
4. snapshots the original active-memory ID set;
5. creates exactly one synthetic project memory through authenticated REST; and
6. saves only non-secret IDs and markers in `.acceptance/phase8-demo-state.json`.

### Verification

```powershell
$env:RUN_PHASE8_DEMO = "true"
pnpm.cmd --filter @questoros-memory/mcp-server demo:phase8:verify
Remove-Item Env:RUN_PHASE8_DEMO -ErrorAction SilentlyContinue
```

Verification starts independent official MCP client sessions and proves:

- prior-session retrieval through remote list, explainable search, and get;
- actor and metadata provenance;
- cross-project denial with `SCOPE_DENIED`;
- the remote create tool remains unavailable;
- a controlled REST correction creates immutable revision 2;
- a new MCP session retrieves corrected content and both revisions;
- one live Nova Micro harvest creates only pending proposal candidates; and
- authoritative memory IDs are unchanged during governed harvesting.

### Cleanup

```powershell
$env:RUN_PHASE8_DEMO = "true"
pnpm.cmd --filter @questoros-memory/mcp-server demo:phase8:cleanup
Remove-Item Env:RUN_PHASE8_DEMO -ErrorAction SilentlyContinue
```

Cleanup:

1. soft-deletes the demo memory through authenticated REST;
2. verifies the original active-memory ID set is restored;
3. hard-removes only the exact demo memory, revisions, audit events, candidates, harvest run, and source artifact;
4. verifies those exact records are absent;
5. verifies the original active-memory ID set remains unchanged;
6. deletes the local non-secret state file; and
7. writes `.acceptance/phase8-demo-report.md` and copies it to the Windows clipboard.

### All-in-one judge-ready run

```powershell
$env:RUN_PHASE8_DEMO = "true"
pnpm.cmd --filter @questoros-memory/mcp-server demo:phase8
Remove-Item Env:RUN_PHASE8_DEMO -ErrorAction SilentlyContinue
```

The all-in-one command performs setup, cross-session verification, governed harvest, cleanup, and report generation in one bounded run.

The report contains no API key, bearer token, database URL, AWS credential, raw model output, or private chain-of-thought.

## Safety boundaries

The demo must stop when:

- the endpoint is not the approved HTTPS staging endpoint;
- more than one `qmem_live_` value is found and no explicit key is selected;
- the key is not project-scoped;
- required permissions are missing;
- the local database does not contain the authenticated tenant;
- remote tool discovery differs from the exact read-only allowlist;
- project isolation fails;
- a remote write tool becomes callable;
- correction history is incomplete;
- governed harvesting changes authoritative memory; or
- cleanup cannot prove exact restoration.

The state and report live under `.acceptance/`, which is ignored by Git.

## Phase 8E submission package

Required:

- current README and architecture diagram;
- remote MCP setup guide and REST examples;
- security and governance explanation;
- CockroachDB and AWS integration explanation;
- pre-existing-work disclosure;
- copyable Phase 8D report;
- judge walkthrough and demonstration video;
- cost and cleanup instructions.

## Non-goals

Phase 8 does not include:

- production deployment;
- public anonymous access;
- OAuth redesign;
- a new memory schema;
- a new reasoning model;
- automatic model approvals;
- unrestricted remote write tools;
- raw SQL access for product clients; or
- migration of the broader QuestorOS product into this repository.

## Test gates

Every Phase 8 commit must pass:

```text
format
lint
typecheck
unit tests
full build
CDK synthesis
AWS assembly verification
```

## Completion definition

Phase 8 is complete only when:

- remote authenticated MCP works in staging;
- the exact read-only allowlist works;
- project isolation is proven;
- the reproducible cross-session demo passes and cleans up;
- governed harvesting remains proposal-only;
- documentation matches the deployed architecture;
- CI and staging acceptance pass; and
- final merge is explicitly approved.
