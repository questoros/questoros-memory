# Phase 3 Verification

This document records the Phase 3 hardening baseline for branch `feat/phase-3-memory-api-mcp`.

## Repository state

| Item          | Value                                                |
| ------------- | ---------------------------------------------------- |
| Repository    | `questoros-memory`                                   |
| Branch        | `feat/phase-3-memory-api-mcp`                        |
| Starting HEAD | `1ab8bf0539f9990ad0f91fccf57de7168399c706`           |
| Architecture  | REST + MCP → memory-service → database → CockroachDB |

## Migrations

Phase 3 builds on existing Phase 2 and Phase 3 migration directories already present in the working tree. Hardening work does **not** add migrations, edit `_prisma_migrations`, or run `prisma migrate deploy`.

## Validation commands

Run from repository root:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @questoros-memory/database prisma:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

Database scripts (local only, optional):

```powershell
pnpm --filter @questoros-memory/database prisma:validate
pnpm --filter @questoros-memory/database prisma:generate
```

CI runs Prisma generate before format/lint/typecheck/test/build.

## Test suites added (Phase 3 hardening)

| File                                               | Scope                               |
| -------------------------------------------------- | ----------------------------------- |
| `packages/memory-core/tests/icare.test.ts`         | ICARE³ lifecycle contract           |
| `packages/memory-core/tests/schemas.test.ts`       | Shared Zod validation               |
| `packages/memory-core/tests/cursor.test.ts`        | Cursor schema / injection rejection |
| `packages/memory-service/tests/operations.test.ts` | Service ops + isolation (mocked DB) |
| `packages/database/tests/sql-safety.test.ts`       | Parameterized SQL + upsert conflict |
| `services/memory-api/tests/routes.test.ts`         | Fastify inject + mocked transport   |
| `services/mcp-server/tests/tools.test.ts`          | Nine MCP tools + mocked transport   |

Phase 3 unit tests do **not** require `DATABASE_URL`. Live CockroachDB integration remains opt-in via `RUN_DATABASE_INTEGRATION_TESTS=true`.

**Current totals:** 215 tests (17 files), all passing without `DATABASE_URL`.

## Security checks

Before commit or push:

```powershell
git check-ignore -v .env
git check-ignore -v .cursor/mcp.json
git ls-files .env
git ls-files .cursor/mcp.json
git grep -n "qmem_live_" -- . ":(exclude).env" ":(exclude).cursor/mcp.json"
git grep -n "postgresql://" -- . ":(exclude).env" ":(exclude).env.example"
```

Tracked code may contain placeholder keys (`qmem_live_example_...`) only.

## Gates

| Gate                 | Requirement                         |
| -------------------- | ----------------------------------- |
| Credential bootstrap | Local only; not run in CI           |
| Unit test suite      | Must pass without `DATABASE_URL`    |
| Live smoke test      | Manual, after local bootstrap       |
| Push / PR            | Separate approval; CI must be green |

Do not claim smoke tests passed unless they were executed locally with valid placeholders in a private `.env`.

## Known limitations

- AWS Lambda workflows and public endpoint deployment are out of scope.
- Bedrock embedding generation is not invoked in Phase 3 tests.
- Application-level approval UI (QuestorOS frontend) is separate from this service.
- Opt-in database integration tests may be skipped in CI.

## Related documentation

- [`authentication.md`](authentication.md)
- [`rest-api.md`](rest-api.md)
- [`mcp-server.md`](mcp-server.md)
- [`retrieval.md`](retrieval.md)
