# Phase 5 — Organizational Intelligence (ICARE³™ core)

## 0. Canonical core — ICARE³™

ICARE³™ is the **non-negotiable** reasoning core of QuestorOS. Harvester, Memory, Context, Continuity Agent, Publisher, and Console are implementation layers **around** ICARE³ — they do not replace it.

Canonical loop (two distinct Evaluation stages):

```text
Issue
→ Context
→ Analysis
→ Recommendations
→ Evaluation          (RECOMMENDATION_EVALUATION — before action)
→ Execution
→ Evaluation          (EXECUTION_EVALUATION — outcomes, evidence, lessons)
```

Product hierarchy:

```text
ICARE³™ = durable reasoning layer
Organizational Intelligence = asset that accumulates
QuestorOS = Intelligence Operating System
AI models = interchangeable engines
```

Durable record (stored under `metadata.icare` + shared `reasoningChainId`; no dedicated ICARE tables):

```text
issues, context, analysis, recommendations,
pre-execution evaluations, approved decisions,
executions, evidence, outcomes,
post-execution evaluations, lessons
```

Canonical sources (ICARE³-revised):

- `QUESTOROS_MEMORY_PHASE_5_STANDALONE_SELLABLE_AGENTIC_PRODUCT_ICARE3_CANONICAL.md`
- `QUESTOROS_MEMORY_PHASE_5_DRIVE_ROUND_TRIP_SYNC_ICARE3_ADDENDUM.md`

Branch: `feat/phase-5-organizational-intelligence-harvester`.

Hard isolation: `apps/continuity-agent` depends on `@questoros-memory/sdk` only. It never imports `memory-service`, `database`, or Prisma, and never reads `DATABASE_URL`.

---

## Layer mapping onto ICARE³

| Layer                | ICARE³ role                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Harvester**        | Issue (what changed) → Context (source + related memories) → Analysis (duplicate/conflict) → Recommendations (candidates: create/merge/correct/ignore) |
| **Approvals**        | Recommendation Evaluation → Execution (authoritative memory / correction)                                                                              |
| **Memory**           | Durable ICARE³ record (`metadata.icare`)                                                                                                               |
| **Context packages** | Assemble Context by stage + chain citations                                                                                                            |
| **Continuity Agent** | Full ICARE³ tool loop via public REST                                                                                                                  |
| **Publisher**        | Issue(external edit) → … → Execution(publish/republish) → Execution Evaluation (sync lessons)                                                          |
| **Console**          | Human governance for evaluations (API ready; UI later)                                                                                                 |

---

## Checkpoints

### Checkpoint 1–3 — Harvest + analysis

- `harvest_runs` / `memory_candidates` carry `reasoningChainId` and `metadata.icare`
- Analysis never writes authoritative memory; Recommendations become candidates
- Conflicting launch dates → `CONFLICT` + recommendation `correct`

### Checkpoint 4 — Approvals as Recommendation Evaluation

- Approve/reject audit `icareStage: RECOMMENDATION_EVALUATION`
- Approved memories materialize with durable stage + chain linkage

### Checkpoint 5 — Context packages

- `POST /v1/context/packages` returns `byStage`, `icareLifecycle`, citations with stages
- Optional `reasoningChainId` filter

### Checkpoint 6 — Continuity Agent

- State-driven loop mapped to ICARE³ stages
- Creates ISSUE / EXECUTION / EXECUTION_EVALUATION memories with one chain per run
- Two-session launch demo documents ICARE³ continuity
- Phase 5B: `DeterministicContinuityPolicy` preserved; `ModelDirectedContinuityPolicy` selects tools via provider-neutral reasoning

### Checkpoint 7–9 — Publisher round-trip

- Publish/sync/republish stamp ICARE³ stages on `published_artifacts.metadata` and audit
- External edits → harvest candidates (never silent overwrite)
- `SYNC_CONFLICT` when both sides changed
- Phase 5B: `renderIntelligenceBrief` + fake Drive remain CI-safe (no live Drive calls)
- Multi-drive: Google Drive + Microsoft OneDrive/SharePoint share `DriveProvider` / `DocumentPublisher` / `ExternalChangeReader`; live OAuth gated

### Phase 5B — Real agentic Harvester

- `@questoros-memory/reasoning-provider` — provider-neutral structured extraction, conflict analysis, policy evaluation, tool selection (mock by default; live calls gated)
- `ModelBackedHarvester` forms governed candidates from ordinary enterprise text; `DeterministicExtractor` remains offline/test fallback
- Harborview synthetic real-estate fixtures prove contradiction → approval → brief → continuity without live model/Drive/AWS

### Checkpoint 10 — AWS (plan only)

- See [phase-5-aws-deploy-teardown.md](./phase-5-aws-deploy-teardown.md)
- **Deploy is blocked** until explicit approval
- Continuity Agent and Memory API remain independently deployable (ICARE³ continuity does not require shared DB)

---

## Packages

| Package                                | Role                                                              |
| -------------------------------------- | ----------------------------------------------------------------- |
| `@questoros-memory/reasoning-provider` | Structured agentic reasoning contracts + mock                     |
| `@questoros-memory/harvester-core`     | Deterministic + model-backed harvest orchestration                |
| `@questoros-memory/publisher-core`     | Provider-neutral Drive/publisher interfaces, brief renderer, stub |
| `@questoros-memory/drive-google`       | Google Drive adapter (live gated)                                 |
| `@questoros-memory/drive-microsoft`    | OneDrive / SharePoint Graph adapter (live gated)                  |
| `@questoros-memory/sdk`                | Public REST client                                                |
| `@questoros-memory/continuity-agent`   | Reference ICARE³ agent (deterministic + model)                    |

Canonical publisher providers: `google-drive`, `microsoft-onedrive`, `microsoft-sharepoint` (plus `stub` for CI).
Organizational-intelligence logic never imports Google- or Microsoft-specific packages.

---

## Demo narrative (ICARE³)

1. **Harvest Harborview sources** — property CSV, brief, transcript, lease, template
2. **Show candidates + evidence** — commitment, deadline, constraint, missing document, template
3. **Detect contradiction** — July 15 vs August 20 → CORRECT disposition (approval required)
4. **Approve correction** — Recommendation Evaluation → authoritative memory + revision
5. **Publish Project Intelligence Brief** — stub Drive; external edit → SYNC_CONFLICT candidates
6. **Continuity Agent session (no chat history)** — model-directed tool selection recalls August 20, executes next task, stores artifact/checkpoint/outcome/lesson

The Memory API and Continuity Agent remain independently deployable.

---

## Phase 5C acceptance status

Gated harness: `pnpm acceptance:phase5` (`RUN_PHASE5_ACCEPTANCE=true` + `DATABASE_URL`).

Proven against the real CockroachDB development database, in-process REST API, and public SDK:

- Harborview synthetic harvest → governed candidates → approve correction / reject private
- Context package + intelligence brief
- Fake Google Drive, OneDrive, and SharePoint publish + `SYNC_CONFLICT` (no live Drive/Microsoft calls)
- New Continuity Agent session (empty chat history) recalls August 20, respects no-paid-advertising, writes Markdown artifact, persists checkpoint / outcome / lesson
- Cross-tenant isolation + full teardown of acceptance-scoped rows

Live model, Google, Microsoft, and AWS deploy: **none**. Draft PR #6 remains unmerged.
