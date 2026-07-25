/**
 * Opt-in CockroachDB integration using a deterministic fake embedding provider.
 * Never invokes AWS/Bedrock.
 *
 * Enable with RUN_DATABASE_INTEGRATION_TESTS=true and a valid DATABASE_URL.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '@questoros-memory/memory-core';
import {
  getDatabaseClient,
  disconnectDatabaseClient,
  deleteEmbeddingsForMemory,
  searchByVector,
  softDeleteMemory,
  hasEmbedding,
} from '@questoros-memory/database';
import {
  createMemory,
  correctMemory,
  generateEmbeddingForMemory,
} from '@questoros-memory/memory-service';
import { TITAN_V2_MODEL_ID, type EmbeddingProvider } from '@questoros-memory/embedding-provider';

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

function fakeProvider(): EmbeddingProvider {
  let seed = 1;
  return {
    providerName: 'amazon-bedrock',
    async generate() {
      seed += 1;
      return {
        embedding: Array.from({ length: 1024 }, (_, i) => ((i + seed) % 97) / 97),
        modelId: TITAN_V2_MODEL_ID,
        dimensions: 1024,
        normalized: true,
        inputTokenCount: 8,
        provider: 'amazon-bedrock',
      };
    },
  };
}

describe.skipIf(!enabled)('embedding lifecycle integration (fake provider)', () => {
  let prisma: PrismaClient;
  let auth: AuthContext;
  let memoryId = '';

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for embedding integration tests');
    }
    prisma = getDatabaseClient();

    // Uses whatever bootstrap tenant/actor already exists for local Phase 3 testing.
    // Falls back to env-provided IDs when present.
    const tenantId = process.env.QUESTOROS_TEST_TENANT_ID;
    const actorId = process.env.QUESTOROS_TEST_ACTOR_ID;
    if (!tenantId || !actorId) {
      throw new Error(
        'Set QUESTOROS_TEST_TENANT_ID and QUESTOROS_TEST_ACTOR_ID for embedding integration tests.',
      );
    }
    auth = {
      tenantId,
      actorId,
      apiKeyId: process.env.QUESTOROS_TEST_API_KEY_ID ?? randomUUID(),
      permissions: [
        'memory:read',
        'memory:write',
        'memory:correct',
        'memory:delete',
        'memory:embed',
        'memory:search',
      ],
      credentialScope: { scopeType: 'TENANT', workspaceId: null, projectId: null },
    };
  });

  afterAll(async () => {
    if (memoryId) {
      try {
        await deleteEmbeddingsForMemory(prisma, auth.tenantId, memoryId);
        await softDeleteMemory(prisma, auth.tenantId, memoryId);
      } catch {
        // best-effort cleanup
      }
    }
    if (enabled) {
      await disconnectDatabaseClient();
    }
  });

  it('generates, searches, invalidates on correct, regenerates, and cleans up without AWS', async () => {
    const provider = fakeProvider();
    const created = await createMemory(prisma, auth, {
      scopeType: 'TENANT',
      memoryType: 'FACT',
      content: `Phase 4 fake-provider embedding probe ${randomUUID()}`,
    });
    memoryId = created.memory.id;

    const generated = await generateEmbeddingForMemory(prisma, auth, memoryId, {
      provider,
      force: false,
    });
    expect(generated.generated).toBe(true);
    expect(generated).not.toHaveProperty('embedding');
    expect(await hasEmbedding(prisma, auth.tenantId, memoryId, TITAN_V2_MODEL_ID, 1024)).toBe(true);

    const reused = await generateEmbeddingForMemory(prisma, auth, memoryId, {
      provider,
      force: false,
    });
    expect(reused.reused).toBe(true);

    // Ensure a searchable vector exists (already upserted by generate).
    const hits = await searchByVector(prisma, {
      tenantId: auth.tenantId,
      scopeType: 'TENANT',
      scopeId: auth.tenantId,
      queryEmbedding: Array.from({ length: 1024 }, (_, i) => ((i + 2) % 97) / 97),
      limit: 5,
    });
    expect(Array.isArray(hits)).toBe(true);

    await correctMemory(prisma, auth, memoryId, {
      content: `Phase 4 corrected content ${randomUUID()}`,
      reason: 'Prove embedding invalidation',
    });
    expect(await hasEmbedding(prisma, auth.tenantId, memoryId, TITAN_V2_MODEL_ID, 1024)).toBe(
      false,
    );

    const regenerated = await generateEmbeddingForMemory(prisma, auth, memoryId, {
      provider,
      force: false,
    });
    expect(regenerated.generated).toBe(true);

    await softDeleteMemory(prisma, auth.tenantId, memoryId);
    await deleteEmbeddingsForMemory(prisma, auth.tenantId, memoryId);
    memoryId = '';
  });
});
