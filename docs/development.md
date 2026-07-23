# Development

## Status

Hackathon work in progress. Not production-ready.

## Local setup

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The scripts and workspace will be added during Phase 1 implementation.

## Environment variables

Copy `.env.example` to a local `.env` or `.env.local` file and replace placeholders privately. Never commit real credentials.

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

After authentication, the following read-only tests were performed against the questoros-memory cluster (Phase 1).

### Test 1 — List databases

```text
Databases: defaultdb
```

`defaultdb` was present. No application database was created yet — that is expected for Phase 1.

### Test 2 — List user-created tables

```text
defaultdb user-created tables: (none)
```

No application tables existed — correct for Phase 1.

### Test 3 — Cluster configuration

```text
Plan: Basic
Cloud provider: AWS
Region: ap-southeast-1 (Singapore)
CockroachDB version: 26.2.1
Status: CREATED
```

The cluster configuration matches the expected Basic, AWS, Singapore setup. All tests were performed with read-only access only.
