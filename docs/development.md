# Development

## Status

Phase 2 — Quality gates and initial CockroachDB schema implemented.

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

# Bootstrap the target database
pnpm --filter @questoros-memory/database db:bootstrap

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
