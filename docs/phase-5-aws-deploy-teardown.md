# Phase 5 Checkpoint 10 — AWS deploy and teardown (plan only)

**Status: BLOCKED.** Do not deploy AWS infrastructure, create paid resources, or run live Drive/Bedrock from CI until an explicit cost and teardown approval is recorded.

This document is the Checkpoint 10 plan only. It extends the Phase 4 prepare-only CDK work under `infra/aws-cdk/`.

---

## Goals after approval

1. Private/staging Memory API (API Gateway → Lambda or container) in `ap-southeast-1`
2. Continuity Agent as a **separate** service (public REST / ICARE³ loop only; no DB security-group need). The agent never shares CockroachDB with Memory API — ICARE³ continuity is carried by Memory over REST.
3. Secrets Manager for `DATABASE_URL` / API keys (never CloudFormation outputs or git)
4. Optional later: gated Google Drive OAuth secrets for Publisher
5. Budgets + teardown runbook before any spend

---

## Regions (unchanged from Phase 4)

| Concern                                        | Region           |
| ---------------------------------------------- | ---------------- |
| Application deploy (API + Continuity Agent)    | `ap-southeast-1` |
| Bedrock InvokeModel (Titan Text Embeddings V2) | `us-west-2`      |

Do not invoke Bedrock from `ap-southeast-1` in this phase.

---

## Proposed topology

```text
Internet / private clients
  → API Gateway HTTP API (ap-southeast-1)
      → Memory API Lambda/container (ap-southeast-1)
          → CockroachDB Cloud (existing)
          → Secrets Manager
          → Bedrock Runtime (us-west-2) for embeddings only

  → Continuity Agent service (ap-southeast-1)
      → Memory API over HTTPS only
      → No DATABASE_URL, no Prisma, no VPC DB access
```

Publisher / Google Drive adapters stay opt-in and secret-gated. Live Drive preflight remains behind `RUN_LIVE_DRIVE_PREFLIGHT=true` and is never part of deploy or CI.

---

## Pre-deploy checklist (must complete before unblock)

1. Estimated monthly cost: Lambda/API Gateway + Secrets Manager + CloudWatch + Bedrock invocations + (optional) Continuity Agent compute
2. AWS Budget alert documented (threshold + notification target)
3. Stack name(s) and tags: `project`, `environment`, `phase`, `manager`
4. Reserved concurrency / API throttling retained (Phase 4 defaults: Lambda reserved 5; stage 20 rps / burst 40)
5. Log retention ≤ 14 days unless explicitly extended
6. Confirm `EMBEDDING_AUTO_ON_WRITE=false` unless separately approved
7. Confirm Continuity Agent env contains only `MEMORY_API_BASE_URL` + `MEMORY_API_KEY` (and app config) — **no** `DATABASE_URL`
8. Written teardown owner and timebox for the staging experiment

---

## Deploy steps (do not run until approved)

```powershell
# 1) Synth / diff only until approval
pnpm.cmd --filter @questoros-memory/aws-cdk synth
pnpm.cmd --filter @questoros-memory/aws-cdk diff

# 2) After explicit approval only
pnpm.cmd --filter @questoros-memory/aws-cdk deploy

# 3) Continuity Agent (separate stack/service — add when approved)
# Deploy agent image/function with MEMORY_API_BASE_URL + Secrets Manager reference to API key.
```

Until approval, `deploy` scripts must remain blocked or no-op with a clear message (same posture as Phase 4).

---

## Teardown runbook (execute after the experiment)

1. Disable or rotate Memory API keys used by staging and Continuity Agent
2. Revoke / disable Google Drive OAuth client credentials if any were created
3. Destroy application stacks only (do not touch unrelated accounts/resources):

```powershell
pnpm.cmd --filter @questoros-memory/aws-cdk exec -- cdk destroy --force
# or the approved stack-specific destroy command recorded at deploy time
```

4. Confirm CloudWatch log groups, Secrets Manager secrets, and API Gateway stages are gone or scheduled for deletion
5. Confirm AWS Budget alerts can be removed or left as account policy
6. Record final spend and close the checkpoint

---

## Explicit non-goals for Checkpoint 10

- Production multi-region HA
- Public unauthenticated endpoints
- Deploying stdio MCP or unsecured remote MCP
- OneDrive adapter production wiring
- Billing / marketplace packaging
- Any deploy from `pnpm test`, `pnpm build`, or CI without a dedicated approved workflow

---

## Gate summary

| Action                                 | Allowed now?        |
| -------------------------------------- | ------------------- |
| Document plan (this file)              | Yes                 |
| `cdk synth` / `diff`                   | Yes (local prepare) |
| `cdk deploy`                           | **No** — blocked    |
| Live Bedrock / Drive preflight from CI | **No**              |
| Continuity Agent production deploy     | **No** — blocked    |

Unblock only with an explicit user approval that includes cost estimate acceptance and teardown ownership.
