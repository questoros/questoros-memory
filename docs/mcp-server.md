# MCP Server

The QuestorOS Memory MCP server exposes the same business operations as the REST API over stdio transport. It uses `@questoros-memory/memory-service` exclusively — no direct database access from tools.

## Transport

- **Protocol:** Model Context Protocol (stdio)
- **Package:** `@questoros-memory/mcp-server`
- **Entry:** `pnpm --filter @questoros-memory/mcp-server start`

## Configuration

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

Prefer aligning with `.cursor/mcp.phase3.example.json`. Never commit `.cursor/mcp.json` or live credentials. `DATABASE_URL` is loaded by the service from the process environment / ignored `.env`; do not paste live connection strings into MCP config.

The CockroachDB Cloud Managed MCP server remains a separate, read-only administrative tool. Do not conflate it with this customer-facing memory MCP.

## Tool catalog

Exactly nine tools are registered:

| Tool name                        | Mutates data | Description                        |
| -------------------------------- | ------------ | ---------------------------------- |
| `questoros_memory_whoami`        | No           | Identity and permissions           |
| `questoros_memory_create`        | Yes          | Create memory with ICARE³ metadata |
| `questoros_memory_get`           | No           | Get memory by ID                   |
| `questoros_memory_list`          | No           | List with lifecycle filters        |
| `questoros_memory_search`        | No           | Explainable search                 |
| `questoros_memory_correct`       | Yes          | Correct with revision history      |
| `questoros_memory_delete`        | Yes          | Soft delete                        |
| `questoros_memory_history`       | No           | Revision history                   |
| `questoros_memory_set_embedding` | Yes          | Upsert 1024-d embedding            |

Tool names are exported as `MCP_TOOL_NAMES` from `services/mcp-server/src/tools.ts`.

## Validation

MCP tools use thinner transport-facing Zod input shapes for MCP SDK registration. Full request validation still runs through the shared `memory-service` / `memory-core` contracts used by REST. Invalid input produces a safe `Error [CODE]: message` text response with `isError: true`.

## Authentication and authorization

The API key is supplied at server startup via environment variable. Every tool invocation passes that key to the transport layer, which resolves tenant, actor, permissions, and scope identically to REST.

## Output format

Successful tools return structured JSON in text content blocks. Example create response:

```text
Memory created successfully with ID: 66666666-6666-4666-8666-666666666666
{
  "id": "66666666-6666-4666-8666-666666666666",
  "metadata": {
    "title": "Issue framing",
    "icare": { "icareStage": "ISSUE" }
  }
}
```

## stdout / stderr rules

| Stream | Allowed content              |
| ------ | ---------------------------- |
| stdout | MCP protocol messages only   |
| stderr | Diagnostics and startup logs |

Never print API keys, `DATABASE_URL`, connection strings, or raw request headers to stdout.

## Troubleshooting

| Symptom                          | Likely cause                         |
| -------------------------------- | ------------------------------------ |
| `AUTH_REQUIRED` / `AUTH_INVALID` | Missing or wrong API key in env      |
| `SCOPE_DENIED`                   | Key scope narrower than requested op |
| `PERMISSION_DENIED`              | Key lacks required permission        |
| `VALIDATION_ERROR`               | Input failed shared Zod contract     |
| Protocol corruption in Cursor    | Log line written to stdout           |

## ICARE³ support

Create, list, search, and correct tools accept ICARE³ lifecycle fields (`icareStage`, `reasoningChainId`, `relatedMemoryIds`, etc.). Lifecycle data is persisted under `metadata.icare` without a separate migration.
