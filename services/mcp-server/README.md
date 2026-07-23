# @questoros-memory/mcp-server

**Status:** Placeholder — implementation pending.

## Responsibility

This service will be the customer-facing **QuestorOS Memory MCP Server** that exposes controlled memory operations through the Model Context Protocol.

## What it must not do

- Must not expose unrestricted raw SQL or CockroachDB access.
- Must not bypass authentication, tenant isolation, or authorization.

## Key distinction

This is the **customer-facing MCP server** — separate from the CockroachDB Cloud Managed MCP Server used for administrative read-only diagnostics.

## Security boundaries

- All MCP tool calls must authenticate the requesting client.
- All memory operations must enforce tenant, workspace, and project scope.
- Input from memory content must be sanitized to prevent prompt injection.
