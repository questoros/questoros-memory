# MCP Server

QuestorOS Memory exposes controlled memory operations through MCP without granting raw SQL or unrestricted database access. All MCP tools use `@questoros-memory/memory-service`; MCP transport code must not access Prisma directly or duplicate business rules.

## Current transport

- **Protocol:** Model Context Protocol
- **Current transport:** local stdio
- **Package:** `@questoros-memory/mcp-server`
- **Entry:** `pnpm --filter @questoros-memory/mcp-server start`
- **Remote MCP status:** Phase 8 implementation target; not yet available on the merged Phase 7 baseline

## Local configuration

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

Prefer aligning with `.cursor/mcp.phase3.example.json`. Never commit `.cursor/mcp.json` or live credentials. `DATABASE_URL` is loaded by the service from the process environment or ignored `.env`; do not paste live connection strings into MCP configuration.

The CockroachDB Cloud Managed MCP server remains a separate, read-only administrative tool. Do not conflate it with this customer-facing memory MCP.

## Tool catalog

Exactly ten local stdio tools are registered:

| Tool name                             | Mutates data | Description                                 |
| ------------------------------------- | ------------ | ------------------------------------------- |
| `questoros_memory_whoami`             | No           | Identity and permissions                    |
| `questoros_memory_create`             | Yes          | Create memory with ICARE³ metadata          |
| `questoros_memory_get`                | No           | Get memory by ID                            |
| `questoros_memory_list`               | No           | List with lifecycle filters                 |
| `questoros_memory_search`             | No           | Explainable search                          |
| `questoros_memory_correct`            | Yes          | Correct with revision history               |
| `questoros_memory_delete`             | Yes          | Soft delete                                 |
| `questoros_memory_history`            | No           | Revision history                            |
| `questoros_memory_set_embedding`      | Yes          | Upsert caller-supplied 1024-d embedding     |
| `questoros_memory_generate_embedding` | Yes          | Generate Titan V2 embedding metadata        |

Tool names are exported as `MCP_TOOL_NAMES` from `services/mcp-server/src/tools.ts`.

Governed harvesting is currently available through the authenticated REST API. Phase 8 must decide which harvest operations, if any, become remote MCP tools. Approval, publication, and administrative operations must not be exposed by default.

## Validation

MCP tools use thinner transport-facing Zod input shapes for MCP SDK registration. Full validation still runs through the shared `memory-service` and `memory-core` contracts used by REST. Invalid input produces a safe `Error [CODE]: message` text response with `isError: true`.

## Authentication and authorization

The local API key is supplied at server startup through an environment variable. Every tool invocation passes that key to the transport layer, which resolves tenant, actor, permissions, and scope identically to REST.

The Phase 8 remote transport must preserve these same controls:

- authenticated caller context;
- tenant, workspace, and project scope enforcement;
- explicit permission checks per tool;
- sanitized errors;
- audit correlation; and
- no raw database credentials in clients.

## Remote MCP requirements

The remote transport must:

1. reuse `@questoros-memory/memory-service` exclusively;
2. expose only an explicit allowlist of tools;
3. keep protocol responses separate from logs and diagnostics;
4. support secure HTTPS transport;
5. reject missing, invalid, revoked, or out-of-scope credentials;
6. preserve proposal-only governed harvesting;
7. avoid automatic approval, publication, correction, deletion, or authoritative-memory creation; and
8. include an external-client integration test using synthetic data.

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

## stdout and stderr rules

| Stream | Allowed content              |
| ------ | ---------------------------- |
| stdout | MCP protocol messages only   |
| stderr | Diagnostics and startup logs |

Never print API keys, `DATABASE_URL`, connection strings, raw request headers, source content, model output, or private chain-of-thought to protocol output.

## Troubleshooting

| Symptom                               | Likely cause                         |
| ------------------------------------- | ------------------------------------ |
| `AUTH_REQUIRED` / `AUTH_INVALID`      | Missing or wrong API key             |
| `AUTH_REVOKED` / `AUTH_EXPIRED`       | Key is no longer active              |
| `SCOPE_DENIED`                        | Key scope narrower than requested op |
| `PERMISSION_DENIED`                   | Key lacks required permission        |
| `VALIDATION_ERROR`                    | Input failed shared Zod contract     |
| `REASONING_OUTPUT_INVALID`            | Model output failed strict schema    |
| Protocol corruption in a local client | Diagnostic text written to stdout    |

## ICARE³ support

Create, list, search, and correct tools accept ICARE³ lifecycle fields (`icareStage`, `reasoningChainId`, `relatedMemoryIds`, and related metadata). Lifecycle data is persisted under `metadata.icare` without a separate migration.
