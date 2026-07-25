import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  insertMemory,
  searchByVector,
  upsertEmbedding,
  upsertActor,
  upsertProject,
  upsertTenant,
  upsertWorkspace,
} from '../src/repository/memory.js';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL_ID } from '../src/constants.js';

const runIntegration = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

function makeVector(seed: number): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => ((i + seed) % 97) / 97);
}

describe.skipIf(!runIntegration)('vector scope isolation (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for integration tests');
    }
    prisma = new PrismaClient({ log: ['error'] });
  });

  it('returns only memories matching exact tenant_id + scope_type + scope_id', async () => {
    await expect(
      prisma.$transaction(
        async (tx) => {
          const tenant = await upsertTenant(tx, {
            slug: `vec-iso-${Date.now()}`,
            name: 'Vector Isolation Tenant',
          });
          const workspace = await upsertWorkspace(tx, {
            tenantId: tenant.id,
            slug: 'ws-iso',
            name: 'WS',
          });
          const projectA = await upsertProject(tx, {
            tenantId: tenant.id,
            workspaceId: workspace.id,
            slug: 'proj-a',
            name: 'Project A',
          });
          const projectB = await upsertProject(tx, {
            tenantId: tenant.id,
            workspaceId: workspace.id,
            slug: 'proj-b',
            name: 'Project B',
          });
          const actor = await upsertActor(tx, {
            tenantId: tenant.id,
            externalId: 'vec-iso-actor',
            actorType: 'SERVICE',
            displayName: 'Vector Iso',
          });

          const inScope = await insertMemory(tx, {
            tenantId: tenant.id,
            workspaceId: workspace.id,
            projectId: projectA.id,
            actorId: actor.id,
            sourceArtifactId: null,
            scopeType: 'PROJECT',
            scopeId: projectA.id,
            memoryType: 'FACT',
            content: 'In-scope vector isolation memory',
            contentHash: `in-${Date.now()}`,
            importance: 0.5,
            confidence: 1,
            sensitivity: 'STANDARD',
            validFrom: new Date(),
            validUntil: null,
            metadata: {},
          });
          const outOfScope = await insertMemory(tx, {
            tenantId: tenant.id,
            workspaceId: workspace.id,
            projectId: projectB.id,
            actorId: actor.id,
            sourceArtifactId: null,
            scopeType: 'PROJECT',
            scopeId: projectB.id,
            memoryType: 'FACT',
            content: 'Out-of-scope vector isolation memory',
            contentHash: `out-${Date.now()}`,
            importance: 0.5,
            confidence: 1,
            sensitivity: 'STANDARD',
            validFrom: new Date(),
            validUntil: null,
            metadata: {},
          });

          const queryEmbedding = makeVector(1);
          await upsertEmbedding(tx, {
            tenantId: tenant.id,
            memoryId: inScope.id,
            scopeType: 'PROJECT',
            scopeId: projectA.id,
            embeddingModel: EMBEDDING_MODEL_ID,
            embeddingDimensions: EMBEDDING_DIMENSIONS,
            embedding: queryEmbedding,
          });
          await upsertEmbedding(tx, {
            tenantId: tenant.id,
            memoryId: outOfScope.id,
            scopeType: 'PROJECT',
            scopeId: projectB.id,
            embeddingModel: EMBEDDING_MODEL_ID,
            embeddingDimensions: EMBEDDING_DIMENSIONS,
            embedding: makeVector(2),
          });

          const hits = await searchByVector(tx as never, {
            tenantId: tenant.id,
            scopeType: 'PROJECT',
            scopeId: projectA.id,
            queryEmbedding,
            limit: 10,
          });

          expect(hits.map((row) => row.id)).toEqual([inScope.id]);
          expect(hits.every((row) => row.scope_id === projectA.id)).toBe(true);
          expect(hits.some((row) => row.id === outOfScope.id)).toBe(false);

          throw new Error('intentional-rollback');
        },
        { isolationLevel: 'Serializable', maxWait: 5000, timeout: 30000 },
      ),
    ).rejects.toThrow('intentional-rollback');
  });
});
