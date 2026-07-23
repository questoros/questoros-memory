# @questoros-memory/memory-api

**Status:** Placeholder — implementation pending.

## Responsibility

This service will provide an authenticated REST API for memory operations alongside the MCP interface.

## What it must not do

- Must not expose raw SQL or unrestricted database access.
- Must not accept secrets, credentials, or unauthenticated requests.

## Security boundaries

- All endpoints require authentication and authorization.
- Tenant, workspace, and project scopes must be validated on every request.
- Input validation must prevent injection attacks.
