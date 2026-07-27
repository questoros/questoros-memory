# Development

## Status

Phase 8 staging is deployed and live:

- authenticated REST through API Gateway and Lambda;
- authenticated read-only remote MCP through the same Lambda;
- local stdio MCP;
- CockroachDB vector retrieval, revisions, provenance, and audit;
- live Bedrock Nova Micro governed harvesting;
- proposal-only model output;
- reproducible Phase 8D setup, verification, cleanup, and report generation; and
- full CI plus CDK synthesis and assembly verification.

The repository remains a controlled staging MVP, not a production deployment.

## Local setup

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Environment variables

Copy `.env.example` to a local `.env` file and replace placeholders privately. Never commit real credentials.

Required for database-backed local or demo operations:

- `DATABASE_URL` — CockroachDB connection string for the `questoros_memory` database.
- `DATABASE_NAME` — set to `questoros_memory`.

Private authentication:

- `QUESTOROS_MEMORY_API_KEY` — local API/MCP key.
- `QUESTOROS_MEMORY_STAGING_API_KEY` — optional explicit staging key selection when more than one `qmem_live_` value exists.

Remote staging:

- `QUESTOROS_MEMORY_STAGING_URL` — approved REST base URL.
- `QUESTOROS_MEMORY_REMOTE_MCP_URL` — approved remote MCP URL.

Opt-in gates:

- `RUN_DATABASE_INTEGRATION_TESTS=true` — live database verification.
- `RUN_PHASE8_REMOTE_MCP_SMOKE=true` — read-only remote MCP smoke.
- `RUN_PHASE8_REMOTE_MCP_DIAGNOSTIC=true` — sanitized AWS diagnostic report.
- `RUN_PHASE8_DEMO=true` — temporary synthetic cross-session demo and cleanup.

Live AWS reasoning remains disabled by default in local development.

## Node.js runtime

- **Recommended:** Node.js 24 LTS, used in CI.
- **Minimum supported:** Node.js 22 LTS.
- Node.js 20 is not supported.

## Local services

```powershell
# REST API
pnpm dev:api

# MCP stdio server
pnpm dev:mcp

# Loopback remote MCP development listener
$env:REMOTE_MCP_ENABLED = "true"
pnpm.cmd --filter @questoros-memory/mcp-server dev:remote
Remove-Item Env:REMOTE_MCP_ENABLED -ErrorAction SilentlyContinue
```

## Phase 8 staging verification

### Read-only remote MCP smoke

```powershell
$env:RUN_PHASE8_REMOTE_MCP_SMOKE = "true"
$env:QUESTOROS_MEMORY_REMOTE_MCP_URL = "https://blrt2ds22f.execute-api.ap-southeast-1.amazonaws.com/staging/mcp"

pnpm.cmd --filter @questoros-memory/mcp-server smoke:phase8-remote

Remove-Item Env:RUN_PHASE8_REMOTE_MCP_SMOKE -ErrorAction SilentlyContinue
Remove-Item Env:QUESTOROS_MEMORY_REMOTE_MCP_URL -ErrorAction SilentlyContinue
```

### Full reproducible demonstration

```powershell
$env:RUN_PHASE8_DEMO = "true"
$env:QUESTOROS_MEMORY_STAGING_URL = "https://blrt2ds22f.execute-api.ap-southeast-1.amazonaws.com/staging"
$env:QUESTOROS_MEMORY_REMOTE_MCP_URL = "https://blrt2ds22f.execute-api.ap-southeast-1.amazonaws.com/staging/mcp"

pnpm.cmd --filter @questoros-memory/mcp-server demo:phase8

Remove-Item Env:RUN_PHASE8_DEMO -ErrorAction SilentlyContinue
Remove-Item Env:QUESTOROS_MEMORY_STAGING_URL -ErrorAction SilentlyContinue
Remove-Item Env:QUESTOROS_MEMORY_REMOTE_MCP_URL -ErrorAction SilentlyContinue
```

The demo creates only synthetic data, verifies cross-session retrieval and governance, performs exact cleanup, writes a sanitized report under `.acceptance/`, and copies the report to the Windows clipboard.

## Database commands

```bash
# Validate and generate Prisma client
pnpm --filter @questoros-memory/database prisma:validate
pnpm --filter @questoros-memory/database prisma:generate

# Bootstrap target database
pnpm --filter @questoros-memory/database db:bootstrap

# Bootstrap local demo tenant, actor, and API key into ignored .env
pnpm --filter @questoros-memory/database auth:bootstrap-local -- --write-env

# Apply migrations
pnpm --filter @questoros-memory/database db:migrate

# Verify schema
pnpm --filter @questoros-memory/database db:verify
```

Opt-in vector verification:

```powershell
$env:RUN_DATABASE_INTEGRATION_TESTS = "true"
pnpm.cmd --filter @questoros-memory/database db:verify-vector
Remove-Item Env:RUN_DATABASE_INTEGRATION_TESTS -ErrorAction SilentlyContinue
```

## CockroachDB Cloud Managed MCP in Cursor

1. Copy `.cursor/mcp.example.json` to `.cursor/mcp.json`.
2. Replace `YOUR_COCKROACHDB_CLUSTER_ID` locally.
3. Reload Cursor.
4. Authenticate through CockroachDB OAuth.
5. Grant read-only access only.
6. Never commit `.cursor/mcp.json`.

The Managed MCP connection is for schema inspection, query diagnostics, retrieval verification, and index recommendations. Do not use it for migrations or data writes.

The application SQL user and Managed MCP OAuth identity are separate access paths. Never place the SQL password in the MCP configuration.

## Vector contract

The database includes:

- `vector(1024)` embedding storage;
- `memory_embeddings_scope_cosine_idx` with `vector_cosine_ops`;
- scope and lifecycle indexes for memories;
- revision and audit tables; and
- a synthetic cosine-distance verification that rolls back test data safely.

## CI gates

Every pull request must pass:

```text
install
generate Prisma client
package build
format
lint
typecheck
tests
full build
CDK synth
AWS assembly verification
```

Judge and submission material is listed in the repository README.
