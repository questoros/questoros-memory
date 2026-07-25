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

### Checkpoint 7–9 — Publisher round-trip

- Publish/sync/republish stamp ICARE³ stages on `published_artifacts.metadata` and audit
- External edits → harvest candidates (never silent overwrite)
- `SYNC_CONFLICT` when both sides changed

### Checkpoint 10 — AWS (plan only)

- See [phase-5-aws-deploy-teardown.md](./phase-5-aws-deploy-teardown.md)
- **Deploy is blocked** until explicit approval
- Continuity Agent and Memory API remain independently deployable (ICARE³ continuity does not require shared DB)

---

## Packages

| Package                              | Role                              |
| ------------------------------------ | --------------------------------- |
| `@questoros-memory/harvester-core`   | Extraction + analysis             |
| `@questoros-memory/publisher-core`   | Drive/publisher interfaces + stub |
| `@questoros-memory/drive-google`     | Google Drive adapter              |
| `@questoros-memory/sdk`              | Public REST client                |
| `@questoros-memory/continuity-agent` | Reference ICARE³ agent            |

---

## Demo narrative (ICARE³)

1. **Session 1 — Issue/Context/Execution:** store goal + facts; write artifact; checkpoint; post-execution evaluation/lessons
2. **Correction — Recommendation Evaluation:** August 15 → August 20 via correction + revision history
3. **Session 2 — Context → Execution:** new process, empty chat; recall August 20; respect constraint; next artifact + checkpoint + evaluation
4. **Publisher (stub/Google):** publish brief → human edit in Drive → sync creates candidates → approve → republish

The Memory API and Continuity Agent remain independently deployable.
