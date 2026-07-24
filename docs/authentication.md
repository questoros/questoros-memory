# Authentication

QuestorOS Memory authenticates every business request with a scoped API key. Keys are the only supported credential for the REST API and MCP server in Phase 3.

## API key format

Live keys use the prefix `qmem_live_`, an 8-character key prefix segment, an underscore, then a high-entropy secret:

```text
qmem_live_<8chars>_<secret>
```

Example placeholder only — never commit or share a real key:

```text
qmem_live_example1_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Lookup and storage

1. The service extracts the bearer token from `Authorization: Bearer <token>`.
2. The full token is hashed with SHA-256.
3. The database lookup matches on the unique `key_hash` column (hash-only lookup).
4. Only the hash and short `key_prefix` are stored; plaintext secrets are shown once at creation and never persisted.

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

Default list behavior follows the hierarchy above without requiring an explicit `scopeType` filter. Explicit filters may narrow results but never widen credential authority. Reasoning-chain IDs and related-memory references do not bypass scope checks. Out-of-scope memory IDs return opaque `MEMORY_NOT_FOUND`.

## Actor binding

The authenticated actor is derived from the API key record. Clients must not supply `actorId`, `tenantId`, or `apiKeyId` as authoritative request fields — those values are rejected by shared Zod contracts.

## Revocation and expiration

Revoked or expired keys are rejected before any memory operation runs. Corrupt permission payloads fail closed as invalid credentials. Authentication failures return structured errors without revealing whether a key exists.

## Bootstrap workflow

Use the local auth bootstrap script to create tenant, workspace, project, actor, and API key records. The script writes the plaintext key only to ignored `.env` when `--write-env` is passed.

```powershell
# Example only — run from repository root after DATABASE_URL is configured locally
pnpm --filter @questoros-memory/database auth:bootstrap-local -- --write-env
```

(`db:bootstrap` only ensures the database exists; it does not create API keys.)

Do not run bootstrap in CI. Phase 3 unit tests mock the repository boundary and do not require `DATABASE_URL`.

## Log redaction

REST logging redacts `authorization`, `apiKey`, `token`, and `DATABASE_URL` fields. MCP diagnostics must go to stderr; protocol output stays on stdout only.

## Safe examples

```text
Authorization: Bearer qmem_live_example1_0123456789abcdef0123456789abcdef
```

Replace the placeholder with a locally generated key. Never paste production credentials into documentation, issues, or chat logs.
