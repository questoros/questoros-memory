# MCP Server

QuestorOS Memory exposes controlled memory operations through MCP without granting raw SQL or unrestricted database access. Every MCP tool uses `@questoros-memory/memory-service`; MCP transport code does not access Prisma directly or duplicate business rules.

## Transport status

| Transport       | Status                           | Intended use                       |
| --------------- | -------------------------------- | ---------------------------------- |
| stdio           | Implemented                      | Local customer-facing MCP clients  |
| Streamable HTTP | Deployed and live in AWS staging | Authenticated remote read-only MCP |

The CockroachDB Cloud Managed MCP Server remains a separate, read-only administrative tool. It is not the customer-facing QuestorOS Memory MCP server.

## Live remote endpoint

```text
https://blrt2ds22f.execute-api.ap-southeast-1.amazonaws.com/staging/mcp
```

The endpoint requires a private database-backed bearer key. Temporary judge access is project-scoped and read-only and must be distributed only through private testing instructions.

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

The local stdio catalog contains the complete controlled tool set exported as `MCP_TOOL_NAMES` from `services/mcp-server/src/tools.ts`. It includes read, write, governed-harvest, review, context-package, and publication operations. Authorization is enforced by `memory-service` for every invocation.

## Remote Streamable HTTP transport

The remote implementation uses the official MCP SDK in stateless mode. A fresh server and transport are created per request, so the service does not require in-memory session affinity.

API Gateway Lambda events are mapped directly to a Web `Request`, and `/mcp` uses the SDK Web Standards Streamable HTTP transport. Normal REST requests continue through Fastify. This separation avoids treating a synthetic Lambda/Fastify request as a real Node socket.

The Node HTTP development entry remains available for loopback testing:

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

The development listener is plain HTTP and must only be used on loopback or behind approved HTTPS termination. Non-loopback binding is blocked unless `REMOTE_MCP_ALLOW_PUBLIC_BIND=true` is explicitly set.

Optional configuration:

```text
REMOTE_MCP_HOST
REMOTE_MCP_PORT
REMOTE_MCP_ALLOWED_ORIGINS
REMOTE_MCP_ALLOW_PUBLIC_BIND
```

The staging origin allowlist is empty, so browser-origin requests are denied by default.

## Remote authentication

Clients send an API key as a bearer token:

```text
Authorization: Bearer qmem_live_...
```

Authentication is resolved through `transportWhoami` before MCP initialization or tool discovery. Missing, invalid, revoked, and expired credentials cannot enumerate the remote tool catalog.

The handler also:

- preserves tenant, workspace, and project scope enforcement;
- preserves permission checks inside `memory-service`;
- returns sanitized JSON-RPC authentication and transport errors;
- supplies a sanitized request-correlation ID;
- rejects unapproved browser origins when an `Origin` header is present;
- sends `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`; and
- never returns API keys, database credentials, AWS credentials, raw headers, model output, or private chain-of-thought.

## Remote read-only allowlist

The deployed remote version registers exactly these five tools:

| Tool                       | Mutates data | Description                                               |
| -------------------------- | ------------ | --------------------------------------------------------- |
| `questoros_memory_whoami`  | No           | Authenticated identity, permissions, and credential scope |
| `questoros_memory_get`     | No           | Retrieve one scoped memory                                |
| `questoros_memory_list`    | No           | List scoped memories with supported filters               |
| `questoros_memory_search`  | No           | Explainable scoped memory search                          |
| `questoros_memory_history` | No           | Retrieve revision history for one scoped memory           |

The immutable allowlist is exported as `REMOTE_MCP_READ_ONLY_TOOL_NAMES` from `services/mcp-server/src/remote-tools.ts`.

The remote catalog does **not** expose create, correct, delete, embedding mutation, governed harvest, candidate approval or rejection, publication, synchronization, SQL, or administrative tools. A non-allowlisted tool call fails through the MCP protocol.

## Live validation

Phase 8C verified:

- unauthenticated rejection before MCP initialization;
- unapproved browser-origin rejection;
- connection through the official MCP Streamable HTTP client;
- exact five-tool discovery;
- authenticated `whoami`;
- project-scoped list and search;
- rejection of a non-allowlisted write tool;
- zero authoritative-memory writes; and
- an unchanged authoritative-memory set.

Phase 8D then verified with temporary synthetic data:

- list, explainable search, get, and history across independent sessions;
- actor and marker provenance;
- cross-project `SCOPE_DENIED`;
- a controlled correction with revisions 1 and 2;
- proposal-only Bedrock harvesting; and
- exact cleanup with original-state restoration.

## Reproducible commands

```powershell
# Read-only live smoke
$env:RUN_PHASE8_REMOTE_MCP_SMOKE = "true"
pnpm.cmd --filter @questoros-memory/mcp-server smoke:phase8-remote
Remove-Item Env:RUN_PHASE8_REMOTE_MCP_SMOKE -ErrorAction SilentlyContinue

# Full synthetic cross-session demonstration and cleanup
$env:RUN_PHASE8_DEMO = "true"
pnpm.cmd --filter @questoros-memory/mcp-server demo:phase8
Remove-Item Env:RUN_PHASE8_DEMO -ErrorAction SilentlyContinue
```

The commands load private values from the ignored local environment and produce sanitized output. See [`phase-8-remote-mcp-demo.md`](phase-8-remote-mcp-demo.md).

## Output and diagnostic rules

Successful tools return structured JSON in MCP text content blocks. Expected failures return safe `Error [CODE]: message` tool results or sanitized JSON-RPC errors.

| Channel                       | Allowed content                                             |
| ----------------------------- | ----------------------------------------------------------- |
| MCP protocol response         | Tool data and sanitized errors only                         |
| stderr or diagnostic callback | Sanitized event, request ID, code, and optional HTTP status |

Never print API keys, `DATABASE_URL`, connection strings, raw request headers, source content, model output, or private chain-of-thought to protocol output or diagnostics.

## Troubleshooting

| Symptom                          | Likely cause                                           |
| -------------------------------- | ------------------------------------------------------ |
| `AUTH_REQUIRED` / `AUTH_INVALID` | Missing or wrong bearer key                            |
| `AUTH_REVOKED` / `AUTH_EXPIRED`  | Key is no longer active                                |
| `SCOPE_DENIED`                   | Credential scope is narrower than the requested memory |
| `PERMISSION_DENIED`              | Key lacks the required read permission                 |
| `VALIDATION_ERROR`               | Tool input failed the shared contract                  |
| `MCP_ORIGIN_DENIED`              | Browser origin is not explicitly allowlisted           |
| `MCP_METHOD_NOT_ALLOWED`         | Unsupported HTTP method for stateless remote MCP       |
| `MCP_TRANSPORT_ERROR`            | Sanitized MCP transport failure                        |

Judge instructions: [`judge-guide.md`](judge-guide.md).
