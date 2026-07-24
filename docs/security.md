# Security Overview

> Phase 3 implements scoped API-key authentication, shared Zod validation, structured errors, and log redaction for the REST API. MCP uses the same authorization path through `memory-service`.

## Access paths

There are three distinct access paths, each with different security properties:

### 1. CockroachDB Cloud Managed MCP (read-only)

- Used by developers for schema inspection, diagnostics, and query verification.
- Configured via `.cursor/mcp.json` (local, never committed).
- Authenticated through CockroachDB OAuth with **read-only** permission.
- This is **not** the customer-facing product.

### 2. QuestorOS Memory API / MCP (application credentials)

- REST (`services/memory-api`) and MCP (`services/mcp-server`) authenticate with scoped API keys.
- Keys are hashed at rest; plaintext is shown once at bootstrap.
- Tenant, workspace, and project scope are enforced in `memory-service`.
- See [`docs/authentication.md`](authentication.md).

### 3. Application SQL user (runtime database)

- Used by QuestorOS Memory services at runtime via `DATABASE_URL`.
- The SQL user credentials are a separate secret from OAuth or API keys.
- Must never appear in MCP configuration, documentation, or version control.

## Threat model

See [`docs/threat-model.md`](threat-model.md) for a detailed threat enumeration.

## Key principles

| Principle             | Rationale                                                          |
| --------------------- | ------------------------------------------------------------------ |
| Least privilege       | Each component gets only the access it needs.                      |
| Read-only by default  | The first MCP connection is read-only.                             |
| Tenant isolation      | All memory queries must be scoped to tenant + workspace + project. |
| Input sanitization    | Stored memory and documents are potentially hostile input.         |
| No secrets in code    | Connection strings, passwords, tokens never committed.             |
| Separate access paths | SQL user credentials ≠ OAuth identity.                             |
