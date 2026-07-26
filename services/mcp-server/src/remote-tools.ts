import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ServiceError,
  getMemoryToolShape,
  historyMemoryToolShape,
  listMemoriesToolShape,
  searchMemoryToolShape,
} from '@questoros-memory/memory-core';
import {
  transportGetMemory,
  transportListMemories,
  transportRevisionHistory,
  transportSearchMemories,
  transportWhoami,
} from '@questoros-memory/memory-service';

export const REMOTE_MCP_READ_ONLY_TOOL_NAMES = [
  'questoros_memory_whoami',
  'questoros_memory_get',
  'questoros_memory_list',
  'questoros_memory_search',
  'questoros_memory_history',
] as const;

export type RemoteMcpReadOnlyToolName = (typeof REMOTE_MCP_READ_ONLY_TOOL_NAMES)[number];

function formatError(error: unknown): string {
  if (error instanceof ServiceError) {
    return `Error [${error.code}]: ${error.message}`;
  }
  return 'Error: request failed.';
}

function errorResult(error: unknown) {
  return {
    content: [{ type: 'text' as const, text: formatError(error) }],
    isError: true,
  };
}

function jsonResult(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  };
}

/**
 * Registers the complete and immutable Phase 8B remote MCP allowlist.
 *
 * This function intentionally does not accept caller-selected tool names. The
 * remote catalog is fixed in source so a deployment or environment variable
 * cannot silently enable a mutating tool.
 */
export function registerRemoteReadOnlyTools(server: McpServer, apiKey: string): void {
  server.tool(
    'questoros_memory_whoami',
    'Returns the authenticated tenant, actor, credential scope, and permissions. Read-only.',
    async () => {
      try {
        return jsonResult(await transportWhoami(apiKey));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    'questoros_memory_get',
    'Retrieves a single memory by ID within the authenticated tenant and credential scope. Read-only.',
    getMemoryToolShape,
    async (input) => {
      try {
        return jsonResult(
          await transportGetMemory(apiKey, input.memoryId, {
            includeDeleted: input.includeDeleted,
          }),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    'questoros_memory_list',
    'Lists memories within the authenticated tenant and credential scope. Read-only.',
    listMemoriesToolShape,
    async (input) => {
      try {
        const result = await transportListMemories(apiKey, input);
        return {
          content: [
            { type: 'text' as const, text: `Found ${result.items.length} memories.` },
            { type: 'text' as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    'questoros_memory_search',
    'Searches memories with explainable scores within the authenticated credential scope. Read-only.',
    searchMemoryToolShape,
    async (input) => {
      try {
        const result = await transportSearchMemories(apiKey, input);
        return {
          content: [
            { type: 'text' as const, text: `Found ${result.length} results.` },
            { type: 'text' as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    'questoros_memory_history',
    'Returns revision history for one memory within the authenticated credential scope. Read-only.',
    historyMemoryToolShape,
    async (input) => {
      try {
        const result = await transportRevisionHistory(apiKey, input.memoryId);
        return {
          content: [
            { type: 'text' as const, text: `Found ${result.length} revisions.` },
            { type: 'text' as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
