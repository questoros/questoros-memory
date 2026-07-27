# Demonstration Video Script

Target runtime: **2 minutes 45 seconds**. Judges are not required to watch beyond three minutes, so do not exceed 2:55 after editing.

Use screen recording only. Do not display API keys, database URLs, AWS credentials, browser password managers, private tabs, notifications, customer data, raw model output, or private chain-of-thought. Do not use copyrighted music.

## Recording layout

Prepare these windows before recording:

1. terminal at the repository root;
2. the architecture section of `README.md`;
3. CockroachDB Console or the read-only CockroachDB Managed MCP inspection showing the memory, revision, and vector structures;
4. a sanitized Phase 8D report;
5. optional AWS Lambda/API Gateway console pages with account identifiers hidden.

Use the staged commands instead of the all-in-one command so the memory can remain visible during recording:

```powershell
$env:RUN_PHASE8_DEMO = "true"
pnpm.cmd --filter @questoros-memory/mcp-server demo:phase8:setup
pnpm.cmd --filter @questoros-memory/mcp-server demo:phase8:verify
pnpm.cmd --filter @questoros-memory/mcp-server demo:phase8:cleanup
Remove-Item Env:RUN_PHASE8_DEMO -ErrorAction SilentlyContinue
```

Pause between commands to capture the required evidence. Cleanup must be recorded or performed immediately after recording.

## Script and shot list

### 0:00–0:15 — Problem

**Visual:** title slide or README header, then the architecture diagram.

**Narration:**

> AI assistants create valuable reasoning, but that intelligence is usually fragmented across users, tools, and sessions. QuestorOS Memory gives organizations a governed memory system that preserves context, provenance, corrections, and outcomes independently of any one AI client.

### 0:15–0:35 — Architecture

**Visual:** README Mermaid architecture diagram. Slowly highlight client, AWS, shared service, CockroachDB, Bedrock, and S3.

**Narration:**

> Both REST and MCP use one authorization and governance layer. CockroachDB is the system of record for memories, immutable revisions, audit events, and vectors. AWS Lambda serves the API and remote MCP endpoint. Bedrock Nova Micro can propose memory from bounded source material, but it cannot directly change authoritative memory.

### 0:35–0:55 — CockroachDB memory layer

**Visual:** CockroachDB Console or read-only Managed MCP results showing the relevant tables and `memory_embeddings_scope_cosine_idx`. Do not expose connection strings.

**Narration:**

> CockroachDB is not a toy datastore here. The schema enforces tenant, workspace, and project boundaries, stores revision history and provenance, and uses a distributed cosine vector index for scoped retrieval. The separate CockroachDB Managed MCP connection is read-only and used for inspection and diagnostics.

### 0:55–1:15 — Session 1 creates memory

**Visual:** terminal running `demo:phase8:setup`. Show only sanitized success output and the generated synthetic memory identifier.

**Narration:**

> Session one creates exactly one synthetic project memory through authenticated REST. The harness first snapshots the original active-memory set and verifies that the local cleanup connection points to the same staging tenant.

### 1:15–1:45 — Session 2 retrieves through remote MCP

**Visual:** run `demo:phase8:verify`. Show successful remote list, search, and get checks. Briefly show the five-tool allowlist.

**Narration:**

> A separate official MCP client session connects to the live AWS endpoint. It discovers exactly five read-only tools, retrieves the prior memory through list, explainable search, and get, verifies provenance, blocks a remote write, and denies access to another project.

### 1:45–2:05 — Correction and history

**Visual:** continue verification output or sanitized report showing revision count two.

**Narration:**

> A controlled REST correction creates immutable revision two. A third independent MCP session retrieves the corrected content and both revisions, proving persistent memory across clients and time rather than simple chat history.

### 2:05–2:25 — Governed Bedrock reasoning

**Visual:** sanitized verification output showing one candidate, zero authoritative changes, and zero approval or publication actions.

**Narration:**

> One bounded Bedrock harvest produces a pending proposal candidate. The authoritative memory remains unchanged, and the model performs no approval, rejection, or publication action. Human review remains the boundary between suggestion and organizational truth.

### 2:25–2:42 — Exact cleanup

**Visual:** run `demo:phase8:cleanup`. Show state-restoration success.

**Narration:**

> Cleanup first verifies soft deletion, then removes only the exact synthetic memory, revisions, audits, candidate, run, and source artifact. The original active-memory set is restored exactly.

### 2:42–2:55 — Closing impact

**Visual:** return to product name and architecture.

**Narration:**

> QuestorOS Memory lets organizations keep their chosen AI tools while owning a secure, explainable, and portable intelligence layer. Agents can remember reliably without being allowed to rewrite organizational truth.

## Required final-frame text

```text
QuestorOS Memory — ICARE³ Agentic Persistent Memory
CockroachDB + AWS Lambda + Amazon Bedrock
Public repository: github.com/questoros/questoros-memory
```

## Editing checklist

- [ ] Final duration is below three minutes.
- [ ] CockroachDB memory tables or vector index are visibly shown.
- [ ] The running project is visibly demonstrated.
- [ ] Remote MCP retrieval is shown.
- [ ] Revision history is shown.
- [ ] Proposal-only Bedrock behavior is shown.
- [ ] Cleanup success is shown.
- [ ] No credential, database URL, account number, private data, or notification is visible.
- [ ] No copyrighted music is included.
- [ ] Video is uploaded publicly to YouTube or Vimeo.
- [ ] Public video URL is added to Devpost and `devpost-submission.md`.
