# @questoros-memory/database

**Status:** Placeholder — implementation pending.

## Responsibility

This package will contain:

- CockroachDB schema definitions and migrations.
- CockroachDB client configuration.
- Vector-index definitions for semantic memory retrieval.
- Query helpers for tenant-scoped memory operations.

## What it must not do

- Must not contain secrets, connection strings, or credentials.
- Must not perform migrations during package install or build.
- Must not access the database during build or typecheck.

## Security boundaries

- This package will consume the `DATABASE_URL` from the runtime environment only at application startup.
- SQL user credentials must never be committed or logged.
- All queries must enforce tenant, workspace, and project authorization filters.
