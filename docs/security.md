# Security Overview

> This document describes the intended security architecture for QuestorOS Memory. No security controls have been implemented yet.

## Access paths

There are two distinct access paths, each with different security properties:

### 1. CockroachDB Cloud Managed MCP (read-only)

- Used by developers for schema inspection, diagnostics, and query verification.
- Configured via `.cursor/mcp.json` (local, never committed).
- Authenticated through CockroachDB OAuth with **read-only** permission.
- This is **not** the customer-facing product.

### 2. Application SQL user (future)

- Will be used by the QuestorOS Memory services at runtime.
- The SQL user credentials are a separate secret from the OAuth identity.
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
