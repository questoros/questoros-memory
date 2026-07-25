import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ServiceError,
  createMemoryToolShape,
  getMemoryToolShape,
  listMemoriesToolShape,
  searchMemoryToolShape,
  correctMemoryToolShape,
  deleteMemoryToolShape,
  historyMemoryToolShape,
  setEmbeddingToolShape,
  generateEmbeddingToolShape,
  harvestRunToolShape,
  listCandidatesToolShape,
  getCandidateToolShape,
  approveCandidateToolShape,
  rejectCandidateToolShape,
  contextPackageToolShape,
  publishArtifactToolShape,
  syncArtifactToolShape,
} from '@questoros-memory/memory-core';
import {
  transportWhoami,
  transportCreateMemory,
  transportGetMemory,
  transportListMemories,
  transportSearchMemories,
  transportCorrectMemory,
  transportDeleteMemory,
  transportRevisionHistory,
  transportUpsertEmbedding,
  transportGenerateEmbedding,
  transportCreateHarvestRun,
  transportListCandidates,
  transportGetCandidate,
  transportApproveCandidate,
  transportRejectCandidate,
  transportCreateContextPackage,
  transportPublishArtifact,
  transportSyncPublishedArtifact,
} from '@questoros-memory/memory-service';

function formatError(error: unknown): string {
  if (error instanceof ServiceError) {
    return `Error [${error.code}]: ${error.message}`;
  }
  return 'Error: request failed.';
}

function jsonResult(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  };
}

export function registerTools(server: McpServer, apiKey: string): void {
  server.tool(
    'questoros_memory_whoami',
    'Returns the authenticated tenant, actor, credential scope, and permissions. Read-only. Limited to the authenticated credential.',
    async () => {
      try {
        return jsonResult(await transportWhoami(apiKey));
      } catch (error) {
        return { content: [{ type: 'text', text: formatError(error) }], isError: true };
      }
    },
  );

  server.tool(
    'questoros_memory_create',
    'Creates a memory within the authenticated tenant and credential scope. Supports ICARE³ lifecycle metadata. Changes data.',
    createMemoryToolShape,
    async (input) => {
      try {
        const result = await transportCreateMemory(apiKey, input);
        return {
          content: [
            { type: 'text', text: `Memory created successfully with ID: ${result.memory.id}` },
            { type: 'text', text: JSON.stringify(result.memory, null, 2) },
          ],
        };
      } catch (error) {
        return { content: [{ type: 'text', text: formatError(error) }], isError: true };
      }
    },
  );

  server.tool(
    'questoros_memory_get',
    'Retrieves a single memory by ID within the authenticated tenant and credential scope. Read-only.',
    getMemoryToolShape,
    async (input) => {
      try {
        const result = await transportGetMemory(apiKey, input.memoryId, {
          includeDeleted: input.includeDeleted,
        });
        return jsonResult(result);
      } catch (error) {
        return { content: [{ type: 'text', text: formatError(error) }], isError: true };
      }
    },
  );

  server.tool(
    'questoros_memory_list',
    'Lists memories within the authenticated tenant and credential scope. Supports ICARE³ stage and reasoning-chain filters. Read-only.',
    listMemoriesToolShape,
    async (input) => {
      try {
        const result = await transportListMemories(apiKey, input);
        return {
          content: [
            { type: 'text', text: `Found ${result.items.length} memories.` },
            { type: 'text', text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return { content: [{ type: 'text', text: formatError(error) }], isError: true };
      }
    },
  );

  server.tool(
    'questoros_memory_search',
    'Searches memories by text and/or embedding with explainable scores. Supports lifecycle-stage and reasoning-chain filters. Read-only.',
    searchMemoryToolShape,
    async (input) => {
      try {
        const result = await transportSearchMemories(apiKey, input);
        return {
          content: [
            { type: 'text', text: `Found ${result.length} results.` },
            { type: 'text', text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return { content: [{ type: 'text', text: formatError(error) }], isError: true };
      }
    },
  );

  server.tool(
    'questoros_memory_correct',
    'Corrects an existing memory and preserves revision history. Invalidates embeddings. Changes data.',
    correctMemoryToolShape,
    async (input) => {
      try {
        const { memoryId, ...body } = input;
        const result = await transportCorrectMemory(apiKey, memoryId, body);
        return {
          content: [
            {
              type: 'text',
              text: `Memory corrected. Revision: ${result.revision.revisionNumber}. Embedding invalidated: ${result.embeddingInvalidated}`,
            },
            { type: 'text', text: JSON.stringify(result.memory, null, 2) },
          ],
        };
      } catch (error) {
        return { content: [{ type: 'text', text: formatError(error) }], isError: true };
      }
    },
  );

  server.tool(
    'questoros_memory_delete',
    'Soft-deletes a memory within credential scope. Changes data.',
    deleteMemoryToolShape,
    async (input) => {
      try {
        const result = await transportDeleteMemory(apiKey, input.memoryId);
        return {
          content: [
            {
              type: 'text',
              text: result.alreadyDeleted
                ? 'Memory was already deleted.'
                : 'Memory soft-deleted successfully.',
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: 'text', text: formatError(error) }], isError: true };
      }
    },
  );

  server.tool(
    'questoros_memory_history',
    'Returns revision history for a memory. Read-only.',
    historyMemoryToolShape,
    async (input) => {
      try {
        const result = await transportRevisionHistory(apiKey, input.memoryId);
        return {
          content: [
            { type: 'text', text: `Found ${result.length} revisions.` },
            { type: 'text', text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return { content: [{ type: 'text', text: formatError(error) }], isError: true };
      }
    },
  );

  server.tool(
    'questoros_memory_set_embedding',
    'Sets a 1024-dimension embedding on a memory. Changes data.',
    setEmbeddingToolShape,
    async (input) => {
      try {
        const { memoryId, ...body } = input;
        await transportUpsertEmbedding(apiKey, memoryId, body);
        return { content: [{ type: 'text', text: 'Embedding set successfully.' }] };
      } catch (error) {
        return { content: [{ type: 'text', text: formatError(error) }], isError: true };
      }
    },
  );

  server.tool(
    'questoros_memory_generate_embedding',
    'Generates and persists a Titan Text Embeddings V2 vector for a memory. Returns metadata only, never the vector. Changes data.',
    generateEmbeddingToolShape,
    async (input) => {
      try {
        const result = await transportGenerateEmbedding(apiKey, input.memoryId, {
          force: input.force ?? false,
        });
        return jsonResult(result);
      } catch (error) {
        return { content: [{ type: 'text', text: formatError(error) }], isError: true };
      }
    },
  );

  server.tool(
    'questoros_memory_harvest_run',
    'Runs deterministic harvest extraction against source text and creates reviewable candidates. Changes data.',
    harvestRunToolShape,
    async (input) => {
      try {
        return jsonResult(await transportCreateHarvestRun(apiKey, input));
      } catch (error) {
        return { content: [{ type: 'text', text: formatError(error) }], isError: true };
      }
    },
  );

  server.tool(
    'questoros_memory_list_candidates',
    'Lists memory candidates awaiting review. Read-only within credential scope.',
    listCandidatesToolShape,
    async (input) => {
      try {
        return jsonResult(await transportListCandidates(apiKey, input));
      } catch (error) {
        return { content: [{ type: 'text', text: formatError(error) }], isError: true };
      }
    },
  );

  server.tool(
    'questoros_memory_get_candidate',
    'Gets one memory candidate by id. Read-only within credential scope.',
    getCandidateToolShape,
    async (input) => {
      try {
        return jsonResult(await transportGetCandidate(apiKey, input.candidateId));
      } catch (error) {
        return { content: [{ type: 'text', text: formatError(error) }], isError: true };
      }
    },
  );

  server.tool(
    'questoros_memory_approve_candidate',
    'Approves a candidate into authoritative memory (create or correct). Changes data.',
    approveCandidateToolShape,
    async (input) => {
      try {
        return jsonResult(
          await transportApproveCandidate(apiKey, input.candidateId, {
            reason: input.reason,
          }),
        );
      } catch (error) {
        return { content: [{ type: 'text', text: formatError(error) }], isError: true };
      }
    },
  );

  server.tool(
    'questoros_memory_reject_candidate',
    'Rejects a candidate without writing authoritative memory. Changes data.',
    rejectCandidateToolShape,
    async (input) => {
      try {
        return jsonResult(
          await transportRejectCandidate(apiKey, input.candidateId, {
            reason: input.reason,
          }),
        );
      } catch (error) {
        return { content: [{ type: 'text', text: formatError(error) }], isError: true };
      }
    },
  );

  server.tool(
    'questoros_memory_context_package',
    'Assembles a scoped organizational intelligence context package. Read-only.',
    contextPackageToolShape,
    async (input) => {
      try {
        return jsonResult(await transportCreateContextPackage(apiKey, input));
      } catch (error) {
        return { content: [{ type: 'text', text: formatError(error) }], isError: true };
      }
    },
  );

  server.tool(
    'questoros_memory_publish_artifact',
    'Publishes an intelligence brief to the configured Drive provider (stub or Google). Changes data.',
    publishArtifactToolShape,
    async (input) => {
      try {
        return jsonResult(await transportPublishArtifact(apiKey, input));
      } catch (error) {
        return { content: [{ type: 'text', text: formatError(error) }], isError: true };
      }
    },
  );

  server.tool(
    'questoros_memory_sync_artifact',
    'Detects external Drive edits and creates harvest candidates without silent overwrite. Changes data.',
    syncArtifactToolShape,
    async (input) => {
      try {
        return jsonResult(await transportSyncPublishedArtifact(apiKey, input.artifactId));
      } catch (error) {
        return { content: [{ type: 'text', text: formatError(error) }], isError: true };
      }
    },
  );
}

export const MCP_TOOL_NAMES = [
  'questoros_memory_whoami',
  'questoros_memory_create',
  'questoros_memory_get',
  'questoros_memory_list',
  'questoros_memory_search',
  'questoros_memory_correct',
  'questoros_memory_delete',
  'questoros_memory_history',
  'questoros_memory_set_embedding',
  'questoros_memory_generate_embedding',
  'questoros_memory_harvest_run',
  'questoros_memory_list_candidates',
  'questoros_memory_get_candidate',
  'questoros_memory_approve_candidate',
  'questoros_memory_reject_candidate',
  'questoros_memory_context_package',
  'questoros_memory_publish_artifact',
  'questoros_memory_sync_artifact',
] as const;
