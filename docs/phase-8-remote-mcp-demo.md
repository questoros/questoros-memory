# Phase 8 — Remote MCP and Hackathon Demo Readiness

## Read this first

Phase 7 is complete and merged. These facts are proven and must not be weakened:

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
- **8D — complete:** reproducible setup, cross-session verification, governed-harvest proof, exact cleanup, and copyable report passed live.
- **8E — in progress:** final submission package, judge access, and demonstration video.

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

The remote endpoint does not expose create, correct, delete, embedding mutation, harvest, approval, rejection, publication, synchronization, SQL, or administrative tools.

## Phase 8C live acceptance

Live Phase 8C acceptance proved:

- official MCP client authentication;
- exact five-tool discovery;
- unauthenticated access rejection;
- deny-by-default browser origins;
- project-scoped authorization;
- non-allowlisted remote writes blocked;
- zero authoritative-memory writes; and
- an unchanged authoritative-memory set.

The initial project contained no authoritative memories, so Phase 8C did not exercise `get` or `history`.

## Phase 8D live reproducible demo

The Phase 8D run used one temporary synthetic project memory and completed successfully.

Evidence:

```text
Generated: 2026-07-27T10:44:02.057Z
Marker: 35d207c4-0635-4b09-8c23-1315af112bcc
Memory ID: 3f1720bf-fa93-4d55-a1a6-65ccf82be1b1
Credential scope: PROJECT
Revision count: 2
Search result count: 1
Governed harvest candidates: 1
```

The live run proved:

- Session 1 created one synthetic authoritative memory through authenticated REST.
- Session 2 retrieved it through remote MCP list, explainable search, and get.
- Actor provenance and synthetic marker metadata were preserved.
- Cross-project access was denied.
- A non-allowlisted remote write was blocked.
- A controlled REST correction created immutable revision 2.
- Session 3 retrieved the corrected content and both revisions through remote MCP.
- One bounded live Nova Micro harvest produced one pending proposal candidate.
- Governed harvesting changed no authoritative memory.
- Candidate approval, rejection, and publication actions remained zero.
- Soft deletion was verified.
- All demo-created authoritative and proposal records were hard-removed.
- The original active-memory ID set was restored exactly.
- The report contained no private API key or database URL.

## Reproducible demo commands

The harness is gated and synthetic-only. It uses the existing private project-scoped staging key from the ignored local `.env` and the matching `DATABASE_URL` only for exact final cleanup. No secret is written to demo state or report.

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

### All-in-one run

```powershell
$env:RUN_PHASE8_DEMO = "true"
pnpm.cmd --filter @questoros-memory/mcp-server demo:phase8
Remove-Item Env:RUN_PHASE8_DEMO -ErrorAction SilentlyContinue
```

The report contains no API key, bearer token, database URL, AWS credential, raw model output, or private chain-of-thought.

## Safety boundaries

The demo stops when:

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

The repository now includes:

- a current judge-ready README and Mermaid architecture diagram;
- [`judge-guide.md`](judge-guide.md);
- [`devpost-submission.md`](devpost-submission.md);
- [`video-script.md`](video-script.md);
- [`cost-and-cleanup.md`](cost-and-cleanup.md);
- current remote MCP and development instructions;
- security and governance documentation;
- CockroachDB and AWS integration explanations; and
- the required pre-existing-work disclosure.

Remaining before final submission:

- provision a temporary read-only judge key and synthetic fixture;
- test the private judge instructions from a clean external client;
- record and upload the public video under three minutes;
- add the final video URL;
- verify repository license detection and public accessibility;
- complete the Devpost form; and
- perform final evidence review.

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
- judge access and video are ready;
- CI and staging acceptance pass; and
- final merge is explicitly approved.
