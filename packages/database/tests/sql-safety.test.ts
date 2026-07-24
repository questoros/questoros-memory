import { describe, it, expect, vi } from 'vitest';
import {
  assertSqlFullyParameterized,
  buildListMemoryConditions,
  upsertEmbedding,
  upsertTenant,
  upsertWorkspace,
  upsertProject,
  upsertActor,
} from '../src/repository/memory.js';
import { validateApiKeyStatus, type StoredApiKey } from '../src/repository/auth.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const MEMORY_ID = '66666666-6666-4666-8666-666666666666';
const WORKSPACE_ID = '44444444-4444-4444-8444-444444444444';
const PROJECT_ID = '55555555-5555-4555-8555-555555555555';

describe('buildListMemoryConditions', () => {
  it('binds tenant, cursor, and adversarial filters without interpolating into SQL text', () => {
    const adversarialChain = "'); DROP TABLE memories; --";
    const { where, boundValues } = buildListMemoryConditions(
      {
        tenantId: TENANT_ID,
        reasoningChainId: adversarialChain,
        memoryType: 'FACT',
        limit: 20,
      },
      {
        updatedAt: '2025-06-15T10:30:00.000Z',
        id: MEMORY_ID,
      },
    );

    expect(() => assertSqlFullyParameterized(where, boundValues)).not.toThrow();
    const sqlText = where.strings.join('?');
    expect(sqlText).not.toContain(TENANT_ID);
    expect(sqlText).not.toContain(MEMORY_ID);
    expect(sqlText).not.toContain(adversarialChain);
    expect(sqlText).not.toContain('DROP TABLE');
    expect(where.values).toEqual(
      expect.arrayContaining([TENANT_ID, '2025-06-15T10:30:00.000Z', MEMORY_ID, adversarialChain]),
    );
  });

  it('binds workspace and project hierarchy filters as parameters', () => {
    const { where, boundValues } = buildListMemoryConditions(
      {
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        limit: 10,
      },
      null,
    );
    expect(() => assertSqlFullyParameterized(where, boundValues)).not.toThrow();
    expect(where.strings.join('?')).not.toContain(WORKSPACE_ID);
    expect(where.strings.join('?')).not.toContain(PROJECT_ID);
  });
});

describe('upsertEmbedding SQL', () => {
  it('uses ON CONFLICT on the logical unique key and can be called twice', async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const tx = { $executeRaw: executeRaw } as never;
    const embedding = Array.from({ length: 1024 }, (_, i) => i / 1024);

    await upsertEmbedding(tx, {
      tenantId: TENANT_ID,
      memoryId: MEMORY_ID,
      scopeType: 'TENANT',
      scopeId: TENANT_ID,
      embeddingModel: 'test-model',
      embeddingDimensions: 1024,
      embedding,
    });
    await upsertEmbedding(tx, {
      tenantId: TENANT_ID,
      memoryId: MEMORY_ID,
      scopeType: 'TENANT',
      scopeId: TENANT_ID,
      embeddingModel: 'test-model',
      embeddingDimensions: 1024,
      embedding: embedding.map((v) => v + 0.001),
    });

    expect(executeRaw).toHaveBeenCalledTimes(2);
    for (const call of executeRaw.mock.calls) {
      const strings = call[0] as TemplateStringsArray;
      const text = Array.from(strings).join(' ');
      expect(text).toMatch(/ON CONFLICT/i);
      expect(text).toMatch(/tenant_id/i);
      expect(text).toMatch(/memory_id/i);
      expect(text).toMatch(/embedding_model/i);
      expect(text).toMatch(/embedding_dimensions/i);
      expect(text).not.toMatch(/\bUPSERT\b/i);
    }
  });
});

describe('identity upsert SQL', () => {
  it('uses secondary unique conflict targets for tenant/workspace/project/actor', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: TENANT_ID }]);
    const tx = { $queryRaw: queryRaw } as never;

    await upsertTenant(tx, { slug: 'demo', name: 'Demo' });
    await upsertWorkspace(tx, { tenantId: TENANT_ID, slug: 'ws', name: 'WS' });
    await upsertProject(tx, {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      slug: 'proj',
      name: 'Proj',
    });
    await upsertActor(tx, {
      tenantId: TENANT_ID,
      externalId: 'actor-1',
      actorType: 'SERVICE',
      displayName: 'Actor',
    });

    const texts = queryRaw.mock.calls.map((call) =>
      Array.from(call[0] as TemplateStringsArray).join(' '),
    );
    expect(texts[0]).toMatch(/ON CONFLICT \(slug\)/i);
    expect(texts[1]).toMatch(/ON CONFLICT \(tenant_id, slug\)/i);
    expect(texts[2]).toMatch(/ON CONFLICT \(tenant_id, workspace_id, slug\)/i);
    expect(texts[3]).toMatch(/ON CONFLICT \(tenant_id, external_id\)/i);
    for (const text of texts) {
      expect(text).not.toMatch(/\bUPSERT\b/i);
    }
  });
});

describe('validateApiKeyStatus permissions', () => {
  function baseKey(overrides: Partial<StoredApiKey> = {}): StoredApiKey {
    return {
      id: '33333333-3333-4333-8333-333333333333',
      tenantId: TENANT_ID,
      actorId: '22222222-2222-4222-8222-222222222222',
      name: 'test',
      keyPrefix: 'abcdefgh',
      keyHash: 'hash',
      scopeType: 'TENANT',
      scopeId: TENANT_ID,
      workspaceId: null,
      projectId: null,
      permissions: ['memory:read'],
      status: 'ACTIVE',
      expiresAt: null,
      createdAt: new Date(),
      revokedAt: null,
      tenantStatus: 'ACTIVE',
      ...overrides,
    };
  }

  it('accepts valid permissions', () => {
    const auth = validateApiKeyStatus(baseKey());
    expect(auth?.permissions).toEqual(['memory:read']);
  });

  it('rejects corrupt non-array permissions', () => {
    expect(validateApiKeyStatus(baseKey({ permissions: 'memory:read' as never }))).toBeNull();
  });

  it('rejects unknown permission values', () => {
    expect(
      validateApiKeyStatus(baseKey({ permissions: ['memory:read', 'memory:hack'] as never })),
    ).toBeNull();
  });
});
