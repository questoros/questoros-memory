# MCP Server

QuestorOS Memory exposes controlled memory operations through MCP without granting raw SQL or unrestricted database access. Every MCP tool uses `@questoros-memory/memory-service`; MCP transport code does not access Prisma directly or duplicate business rules.

## Transport status

| Transport | Status | Intended use |
| --- | --- | --- |
| stdio | Implemented | Local customer-facing MCP clients |
| Streamable HTTP | Implemented and tested on the Phase 8 branch; not deployed | Authenticated remote MCP behind approved HTTPS termination |

The CockroachDB Cloud Managed MCP server remains a separate, read-only administrative tool. It is not the customer-facing QuestorOS Memory MCP server.

## Local stdio transport

- **Package:** `@questoros-memory/mcp-server`
- **Development entry:** `pnpm --filter @questoros-memory/mcp-server dev`
- **Built entry:** `pnpm --filter @questoros-memory/mcp-server start`

Copy `.cursor/mcp.phase3.example.json` to `.cursor/mcp.json` locally and set:

```json
{
  "mcpServers": {
    "questoros-memory": {
      "command": "pnpm",
      "args": ["--filter", "@questoros-memory/mcp-server", "dev"],
      "env": {
        "QUESTOROS_MEMORY_API_KEY": "${QUESTOROS_MEMORY_API_KEY:-placeholder-change-me}"
      }
    }
  }
}
```

Never commit `.cursor/mcp.json` or live credentials. `DATABASE_URL` is loaded by the service from the process environment or ignored `.env`; do not put database connection strings in MCP client configuration.

The local stdio catalog contains the complete controlled tool set exported as `MCP_TOOL_NAMES` from `services/mcp-server/src/tools.ts`. It includes read, write, governed-harvest, review, context-package, and publication operations. Authorization is still enforced by `memory-service` for every invocation.

## Phase 8 remote Streamable HTTP transport

The remote implementation uses the MCP SDK Streamable HTTP transport in stateless mode. It creates a fresh MCP server and transport per request, allowing it to operate behind an HTTPS reverse proxy or gateway without in-memory session affinity.

The implementation is exported from `services/mcp-server/src/remote.ts`:

```ts
import { createRemoteMcpRequestHandler } from '@questoros-memory/mcp-server';

const handler = createRemoteMcpRequestHandler({
  allowedOrigins: ['https://approved-client.example'],
});
```

The Node HTTP development entry is intentionally gated:

```bash
REMOTE_MCP_ENABLED=true \
pnpm --filter @questoros-memory/mcp-server dev:remote
```

Defaults:

```text
host: 127.0.0.1
port: 3100
route: /mcp
```

The development listener is plain HTTP and must only be used on loopback or behind approved HTTPS termination. Non-loopback binding is blocked unless `REMOTE_MCP_ALLOW_PUBLIC_BIND=true` is explicitly set. This does not authorize an internet-facing deployment by itself.

Optional configuration:

```text
REMOTE_MCP_HOST
REMOTE_MCP_PORT
REMOTE_MCP_ALLOWED_ORIGINS
REMOTE_MCP_ALLOW_PUBLIC_BIND
```

## Remote authentication

Clients send the existing private API key as a bearer token:

```text
Authorization: Bearer qmem_live_...
```

Authentication is resolved through `transportWhoami` before MCP initialization or tool discovery. Missing, invalid, revoked, and expired credentials therefore cannot enumerate the remote tool catalog.

The handler also:

- preserves tenant, workspace, and project scope enforcement;
- preserves permission checks inside `memory-service`;
- returns sanitized JSON-RPC authentication and transport errors;
- supplies a sanitized request-correlation ID;
- rejects unapproved browser origins when an `Origin` header is present;
- sends `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`; and
- never returns API keys, database credentials, AWS credentials, raw headers, model output, or private chain-of-thought.

## Remote read-only allowlist

The first remote version registers exactly these five tools:

| Tool | Mutates data | Description |
| --- | --- | --- |
| `questoros_memory_whoami` | No | Authenticated identity, permissions, and credential scope |
| `questoros_memory_get` | No | Retrieve one scoped memory |
| `questoros_memory_list` | No | List scoped memories with supported filters |
| `questoros_memory_search` | No | Explainable scoped memory search |
| `questoros_memory_history` | No | Retrieve revision history for one scoped memory |

The immutable allowlist is exported as `REMOTE_MCP_READ_ONLY_TOOL_NAMES` from `services/mcp-server/src/remote-tools.ts`.

The remote catalog does **not** expose create, correct, delete, embedding mutation, governed harvest, candidate approval or rejection, publication, synchronization, or administrative tools. A non-allowlisted tool call fails through the MCP protocol.

## Validation

Phase 8B includes unit and official-client integration coverage for:

- unauthenticated rejection before MCP initialization;
- invalid-key rejection with sanitized errors;
- connection through the official MCP Streamable HTTP client;
- exact five-tool discovery;
- successful authenticated `whoami`;
- rejection of a non-allowlisted write tool;
- safe `SCOPE_DENIED` results from `memory-service`;
- browser-origin enforcement; and
- absence of credentials and infrastructure details in protocol output.

The remote transport is implemented and tested but has not been added to the AWS staging stack. Any staging deployment requires a reviewed CDK diff and explicit approval.

## Output and diagnostic rules

Successful tools return structured JSON in MCP text content blocks. Expected failures return safe `Error [CODE]: message` tool results or sanitized JSON-RPC errors.

| Channel | Allowed content |
| --- | --- |
| MCP protocol response | Tool data and sanitized errors only |
| stderr or diagnostic callback | Sanitized event, request ID, code, and optional HTTP status |

Never print API keys, `DATABASE_URL`, connection strings, raw request headers, source content, model output, or private chain-of-thought to protocol output or diagnostics.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `AUTH_REQUIRED` / `AUTH_INVALID` | Missing or wrong bearer key |
| `AUTH_REVOKED` / `AUTH_EXPIRED` | Key is no longer active |
| `SCOPE_DENIED` | Credential scope is narrower than the requested memory |
| `PERMISSION_DENIED` | Key lacks the required read permission |
| `VALIDATION_ERROR` | Tool input failed the shared contract |
| `MCP_ORIGIN_DENIED` | Browser origin is not explicitly allowlisted |
| `MCP_METHOD_NOT_ALLOWED` | Unsupported HTTP method for stateless remote MCP |
| `MCP_TRANSPORT_ERROR` | Sanitized MCP transport failure |
