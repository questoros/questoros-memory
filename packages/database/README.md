# @questoros-memory/database

**Status:** Phase 2 — Schema and migrations implemented.

## Responsibility

This package contains:

- CockroachDB schema definitions and migrations.
- CockroachDB client configuration (lazy Prisma client).
- Vector-index definitions for semantic memory retrieval.
- Query helpers for tenant-scoped memory operations.
- Bootstrap script for creating the target database.
- Schema and vector contract verification scripts.

## What it must not do

- Must not contain secrets, connection strings, or credentials.
- Must not perform migrations during package install or build.
- Must not access the database during build, typecheck, lint, or unit tests.

## Security boundaries

- This package consumes the `DATABASE_URL` from the runtime environment only at application startup.
- SQL user credentials must never be committed or logged.
- All queries must enforce tenant, workspace, and project authorization filters.

## Safe commands

```bash
# Validate the Prisma schema
pnpm --filter @questoros-memory/database prisma:validate

# Generate the Prisma client
pnpm --filter @questoros-memory/database prisma:generate

# Bootstrap the target database (creates questoros_memory if missing)
pnpm --filter @questoros-memory/database db:bootstrap

# Apply migrations
pnpm --filter @questoros-memory/database db:migrate

# Verify schema after migration
pnpm --filter @questoros-memory/database db:verify

# Verify vector contract (requires RUN_DATABASE_INTEGRATION_TESTS=true)
pnpm --filter @questoros-memory/database db:verify-vector
```
