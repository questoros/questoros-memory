# Authentication

QuestorOS Memory authenticates every business request with a scoped API key. Keys are the only supported credential for the REST API and MCP server in Phase 3.

## API key format

Live keys use the prefix `qmem_live_` followed by a high-entropy secret segment:

```text
qmem_live_example_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Example placeholder only — never commit or share a real key.

## Lookup and storage

1. The service extracts the bearer token from `Authorization: Bearer <token>`.
2. The prefix identifies the key record.
3. The secret segment is hashed with SHA-256 before comparison.
4. Only the hash is stored in the database; plaintext secrets are shown once at creation.

## Permissions

| Permission       | Purpose                                     |
| ---------------- | ------------------------------------------- |
| `memory:read`    | Get, list, search, revision history, whoami |
| `memory:write`   | Create memories                             |
| `memory:correct` | Correct memories with revision history      |
| `memory:delete`  | Soft-delete memories                        |
| `memory:embed`   | Upsert embeddings                           |
| `memory:admin`   | Implies all other memory permissions        |

## Credential scope

Each key is bound to exactly one scope:

| Scope       | Access boundary                             |
| ----------- | ------------------------------------------- |
| `TENANT`    | Any workspace or project within the tenant  |
| `WORKSPACE` | Only the bound workspace (and its projects) |
| `PROJECT`   | Only the bound project                      |

A workspace-scoped key cannot read or write another workspace. A project-scoped key cannot escalate to tenant-wide access. Reasoning-chain IDs and related-memory references do not bypass scope checks.

## Actor binding

The authenticated actor is derived from the API key record. Clients must not supply `actorId`, `tenantId`, or `apiKeyId` as authoritative request fields — those values are rejected by shared Zod contracts.

## Revocation and expiration

Revoked or expired keys are rejected before any memory operation runs. Authentication failures return structured errors without revealing whether a prefix exists.

## Bootstrap workflow

Use the database bootstrap script locally to create tenant, workspace, project, actor, and API key records. The script prints the plaintext key once. Store it in a local secret manager or `.env` file that is never committed.

```powershell
# Example only — run from repository root after DATABASE_URL is configured locally
pnpm --filter @questoros-memory/database db:bootstrap
```

Do not run bootstrap in CI. Phase 3 unit tests mock the repository boundary and do not require `DATABASE_URL`.

## Log redaction

REST logging redacts `authorization`, `apiKey`, `token`, and `DATABASE_URL` fields. MCP diagnostics must go to stderr; protocol output stays on stdout only.

## Safe examples

```text
Authorization: Bearer qmem_live_example_0123456789abcdef0123456789abcdef
```

Replace the placeholder with a locally generated key. Never paste production credentials into documentation, issues, or chat logs.
