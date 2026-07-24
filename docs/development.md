# Development

## Status

Phase 3 — Memory API, MCP server, shared Zod/ICARE³ contracts, and hardening tests (mocked repository boundary).

## Local setup

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Environment variables

Copy `.env.example` to a local `.env` file and replace placeholders privately. Never commit real credentials.

Required:

- `DATABASE_URL` — CockroachDB connection string for the `questoros_memory` database.
- `DATABASE_NAME` — Set to `questoros_memory`.

Optional for integration tests:

- `RUN_DATABASE_INTEGRATION_TESTS` — Set to `true` to enable live database verification.

## Node.js runtime

- **Recommended**: Node.js 24 LTS (used in CI).
- **Minimum supported**: Node.js 22 LTS.
- Node.js 20 is not supported (end-of-life as of March 2026).

## Phase 3 services

```powershell
# REST API (local)
pnpm dev:api

# MCP stdio server (local)
pnpm dev:mcp
```

Phase 3 unit tests mock the database and do not require `DATABASE_URL`. Opt-in integration tests:

```powershell
$env:RUN_DATABASE_INTEGRATION_TESTS="true"
pnpm --filter @questoros-memory/database db:verify-vector
Remove-Item Env:RUN_DATABASE_INTEGRATION_TESTS
```

Documentation: [`authentication.md`](authentication.md), [`rest-api.md`](rest-api.md), [`mcp-server.md`](mcp-server.md), [`phase-3-verification.md`](phase-3-verification.md).

## Phase 2 quality tooling

```bash
# Lint all packages
pnpm lint

# Run tests with coverage
pnpm test
pnpm test:coverage
```

## Phase 2 database

```bash
# Validate and generate Prisma client
pnpm --filter @questoros-memory/database prisma:validate
pnpm --filter @questoros-memory/database prisma:generate

# Bootstrap the target database (creates DB only; does not create API keys)
pnpm --filter @questoros-memory/database db:bootstrap

# Bootstrap local demo tenant/actor/API key into ignored .env
pnpm --filter @questoros-memory/database auth:bootstrap-local -- --write-env

# Apply migrations
pnpm --filter @questoros-memory/database db:migrate

# Verify schema
pnpm --filter @questoros-memory/database db:verify

# Verify vector contract (opt-in, connects to the database)
$env:RUN_DATABASE_INTEGRATION_TESTS="true"
pnpm --filter @questoros-memory/database db:verify-vector
Remove-Item Env:RUN_DATABASE_INTEGRATION_TESTS
```

## CockroachDB Cloud Managed MCP in Cursor

1. Copy `.cursor/mcp.example.json` to `.cursor/mcp.json`.
2. Replace `YOUR_COCKROACHDB_CLUSTER_ID` locally.
3. Reload Cursor.
4. Authenticate through CockroachDB OAuth.
5. Grant **read-only** access only.
6. Never commit `.cursor/mcp.json`.

The Managed MCP connection is for schema inspection, query diagnostics, retrieval verification, and index recommendations. Do not use it for migrations or data writes.

The application SQL user and Managed MCP OAuth identity are separate access paths. Never place the SQL password in the MCP configuration.

## MCP read-only verification results

### Phase 2 — After migration

The `questoros_memory` database now contains all nine tables, ordinary indexes, and a CockroachDB vector index (`memory_embeddings_scope_cosine_idx`). All verification tests passed:

- All nine tables confirmed: tenants, workspaces, projects, actors, source_artifacts, memories, memory_revisions, memory_embeddings, memory_audit_events.
- Embedding column type: `vector(1024)`.
- Ordinary indexes: memories_scope_lookup_idx, memories_actor_lookup_idx, memories_source_artifact_lookup_idx, memories_content_hash_idx, memory_embeddings_memory_idx, audit_events_tenant_created_idx.
- Vector index: `memory_embeddings_scope_cosine_idx` with `vector_cosine_ops`.
- Vector contract verified: synthetic cosine-distance query returns expected nearest memory. Transaction safely rolled back.

### Phase 1 — Pre-migration

```text
Databases: defaultdb
Plan: Basic
Cloud provider: AWS
Region: ap-southeast-1
CockroachDB version: 26.2.1
```

## Phase 2 CI validation

The initial CI run (ID 30005064915) failed during `actions/setup-node@v4` because Node.js 20 is end-of-life and pnpm 11.16.0 requires Node.js >= 22. All subsequent quality steps were skipped.

After updating the workflow:

- `actions/checkout` from `@v4` to `@v6`
- `actions/setup-node` from `@v4` to `@v6` with `node-version: 24`
- `pnpm/action-setup` from `@v4` to `@v6` with `cache: true`
- Removed deprecated `cache: 'pnpm'` from `setup-node`
- Removed Node.js 20 matrix strategy
- Updated `package.json` engines to `>=22.0.0`
- Added `.node-version` and `.nvmrc` (both `24`)

All remote quality steps passed on run ID 30007566361:

- Checkout ✅
- Set up Node.js ✅
- Set up pnpm ✅
- Install dependencies ✅
- Format check ✅
- Lint ✅
- Typecheck ✅
- Test ✅
- Build ✅
