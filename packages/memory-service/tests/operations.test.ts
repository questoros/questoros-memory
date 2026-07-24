import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '@questoros-memory/memory-core';
import { ServiceError, ERROR_CODES, EMBEDDING_DIMENSIONS } from '@questoros-memory/memory-core';
import type { MemoryRow, RevisionRow } from '@questoros-memory/database';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const API_KEY_ID = '33333333-3333-4333-8333-333333333333';
const WORKSPACE_ID = '44444444-4444-4444-8444-444444444444';
const PROJECT_ID = '55555555-5555-4555-8555-555555555555';
const MEMORY_ID = '66666666-6666-4666-8666-666666666666';
const RELATED_ID = '77777777-7777-4777-8777-777777777777';
const CHAIN_ID = '88888888-8888-4888-8888-888888888888';
const OTHER_WORKSPACE = '99999999-9999-4999-8999-999999999999';

const mockPrisma = {} as PrismaClient;
const mockTx = {} as PrismaClient;

function makeMemory(overrides: Partial<MemoryRow> = {}): MemoryRow {
  const now = new Date('2026-07-24T12:00:00.000Z');
  return {
    id: MEMORY_ID,
    tenantId: TENANT_ID,
    workspaceId: null,
    projectId: null,
    actorId: ACTOR_ID,
    sourceArtifactId: null,
    scopeType: 'TENANT',
    scopeId: TENANT_ID,
    memoryType: 'FACT',
    status: 'ACTIVE',
    content: 'Baseline content.',
    contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    importance: 0.5,
    confidence: 1,
    sensitivity: 'STANDARD',
    validFrom: now,
    validUntil: null,
    supersededById: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function tenantAuth(
  permissions: AuthContext['permissions'] = ['memory:read', 'memory:write'],
): AuthContext {
  return {
    apiKeyId: API_KEY_ID,
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    credentialScope: {
      scopeType: 'TENANT',
      scopeId: TENANT_ID,
      workspaceId: null,
      projectId: null,
    },
    permissions,
  };
}

function workspaceAuth(): AuthContext {
  return {
    ...tenantAuth([
      'memory:read',
      'memory:write',
      'memory:correct',
      'memory:delete',
      'memory:embed',
    ]),
    credentialScope: {
      scopeType: 'WORKSPACE',
      scopeId: WORKSPACE_ID,
      workspaceId: WORKSPACE_ID,
      projectId: null,
    },
  };
}

function projectAuth(): AuthContext {
  return {
    ...tenantAuth(['memory:read', 'memory:write']),
    credentialScope: {
      scopeType: 'PROJECT',
      scopeId: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    },
  };
}

function validEmbedding(): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.01);
}

vi.mock('@questoros-memory/database', () => ({
  withTransaction: vi.fn(
    async (_prisma: PrismaClient, fn: (tx: PrismaClient) => Promise<unknown>) => fn(mockTx),
  ),
  findActiveMemoryByContentHash: vi.fn(),
  insertMemory: vi.fn(),
  insertRevision: vi.fn(),
  upsertEmbedding: vi.fn(),
  insertAuditEvent: vi.fn(),
  getMemory: vi.fn(),
  listMemories: vi.fn(),
  getMaxRevisionNumber: vi.fn(),
  updateMemory: vi.fn(),
  deleteEmbeddingsForMemory: vi.fn(),
  softDeleteMemory: vi.fn(),
  getRevisions: vi.fn(),
  searchByText: vi.fn(),
  searchByVector: vi.fn(),
}));

import * as repo from '@questoros-memory/database';
import {
  whoami,
  createMemory,
  getMemory,
  listMemories,
  searchMemories,
  correctMemory,
  deleteMemory,
  getRevisionHistory,
  upsertEmbedding,
} from '../src/operations.js';

describe('whoami', () => {
  it('returns authenticated identity without database access', () => {
    const auth = tenantAuth(['memory:read', 'memory:admin']);
    expect(whoami(auth)).toEqual({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      credentialScope: auth.credentialScope,
      permissions: ['memory:read', 'memory:admin'],
    });
  });
});

describe('createMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repo.findActiveMemoryByContentHash).mockResolvedValue(null);
    vi.mocked(repo.insertMemory).mockImplementation(async (_tx, input) =>
      makeMemory({
        content: input.content,
        contentHash: input.contentHash,
        metadata: input.metadata,
        actorId: input.actorId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
      }),
    );
    vi.mocked(repo.insertRevision).mockResolvedValue({
      id: 'rev-1',
      tenantId: TENANT_ID,
      memoryId: MEMORY_ID,
      revisionNumber: 1,
      content: 'Baseline content.',
      contentHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      reason: 'Initial creation',
      createdByActorId: ACTOR_ID,
      createdAt: new Date(),
    });
  });

  it('persists ICARE³ lifecycle metadata and binds actor on create', async () => {
    vi.mocked(repo.getMemory).mockResolvedValue(makeMemory({ id: RELATED_ID }));

    const result = await createMemory(mockPrisma, tenantAuth(), {
      scopeType: 'TENANT',
      memoryType: 'DECISION',
      content: 'Approve phased rollout.',
      title: 'Rollout decision',
      icareStage: 'RECOMMENDATIONS',
      reasoningChainId: CHAIN_ID,
      relatedMemoryIds: [RELATED_ID],
    });

    expect(repo.insertMemory).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        actorId: ACTOR_ID,
        tenantId: TENANT_ID,
        metadata: expect.objectContaining({
          title: 'Rollout decision',
          icare: expect.objectContaining({
            icareStage: 'RECOMMENDATIONS',
            reasoningChainId: CHAIN_ID,
            relatedMemoryIds: [RELATED_ID],
          }),
        }),
      }),
    );
    expect(result.memory.actorId).toBe(ACTOR_ID);
    expect(result.revision.revisionNumber).toBe(1);
  });

  it('denies create when write permission is missing', async () => {
    await expect(
      createMemory(mockPrisma, tenantAuth(['memory:read']), {
        scopeType: 'TENANT',
        memoryType: 'FACT',
        content: 'Denied write.',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.PERMISSION_DENIED, statusCode: 403 });
  });

  it('rejects cross-workspace scope for workspace credential', async () => {
    await expect(
      createMemory(mockPrisma, workspaceAuth(), {
        scopeType: 'WORKSPACE',
        workspaceId: OTHER_WORKSPACE,
        memoryType: 'FACT',
        content: 'Wrong workspace.',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.SCOPE_DENIED, statusCode: 403 });
  });

  it('validates related memories are accessible within scope', async () => {
    vi.mocked(repo.getMemory).mockResolvedValue(
      makeMemory({
        id: RELATED_ID,
        workspaceId: OTHER_WORKSPACE,
        scopeType: 'WORKSPACE',
        scopeId: OTHER_WORKSPACE,
      }),
    );

    await expect(
      createMemory(mockPrisma, workspaceAuth(), {
        scopeType: 'WORKSPACE',
        workspaceId: WORKSPACE_ID,
        memoryType: 'FACT',
        content: 'References foreign memory.',
        icareStage: 'CONTEXT',
        relatedMemoryIds: [RELATED_ID],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.SCOPE_DENIED, statusCode: 403 });
  });
});

describe('getMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns memory within tenant and scope', async () => {
    vi.mocked(repo.getMemory).mockResolvedValue(makeMemory());
    const memory = await getMemory(mockPrisma, tenantAuth(), MEMORY_ID);
    expect(memory.id).toBe(MEMORY_ID);
  });

  it('throws not found for missing memory', async () => {
    vi.mocked(repo.getMemory).mockResolvedValue(null);
    await expect(getMemory(mockPrisma, tenantAuth(), MEMORY_ID)).rejects.toMatchObject({
      code: ERROR_CODES.MEMORY_NOT_FOUND,
      statusCode: 404,
    });
  });

  it('denies project-scoped access to tenant memory', async () => {
    vi.mocked(repo.getMemory).mockResolvedValue(makeMemory());
    await expect(getMemory(mockPrisma, projectAuth(), MEMORY_ID)).rejects.toMatchObject({
      code: ERROR_CODES.SCOPE_DENIED,
      statusCode: 403,
    });
  });
});

describe('listMemories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repo.listMemories).mockResolvedValue([makeMemory()]);
  });

  it('applies workspace filter for workspace credentials', async () => {
    await listMemories(mockPrisma, workspaceAuth(), { icareStage: 'ISSUE' });
    expect(repo.listMemories).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        icareStage: 'ISSUE',
      }),
      null,
    );
  });

  it('rejects list when read permission is missing', async () => {
    await expect(listMemories(mockPrisma, tenantAuth(['memory:write']), {})).rejects.toMatchObject({
      code: ERROR_CODES.PERMISSION_DENIED,
    });
  });

  it('rejects invalid cursor', async () => {
    await expect(
      listMemories(mockPrisma, tenantAuth(), { cursor: 'not-a-valid-cursor' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_CURSOR });
  });
});

describe('searchMemories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repo.searchByText).mockResolvedValue([
      {
        id: MEMORY_ID,
        tenant_id: TENANT_ID,
        workspace_id: null,
        project_id: null,
        actor_id: ACTOR_ID,
        source_artifact_id: null,
        scope_type: 'TENANT',
        scope_id: TENANT_ID,
        memory_type: 'FACT',
        status: 'ACTIVE',
        content: 'Searchable content about deployment.',
        content_hash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        importance: 0.7,
        confidence: 0.9,
        sensitivity: 'STANDARD',
        valid_from: new Date(),
        valid_until: null,
        superseded_by_id: null,
        metadata: { icare: { icareStage: 'ANALYSIS' } },
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        revision_number: 1,
        cosine_distance: null,
      },
    ]);
  });

  it('returns explainable search results for text query', async () => {
    const results = await searchMemories(mockPrisma, tenantAuth(), {
      scopeType: 'TENANT',
      queryText: 'deployment',
      icareStages: ['ANALYSIS'],
      reasoningChainId: CHAIN_ID,
    });

    expect(results).toHaveLength(1);
    expect(results[0].explanation.finalScore).toBeGreaterThan(0);
    expect(results[0].explanation.reasons.length).toBeGreaterThan(0);
    expect(results[0].memory.metadata).toEqual({ icare: { icareStage: 'ANALYSIS' } });
  });

  it('denies search outside project scope', async () => {
    await expect(
      searchMemories(mockPrisma, projectAuth(), {
        scopeType: 'TENANT',
        queryText: 'deployment',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.SCOPE_DENIED });
  });
});

describe('correctMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repo.getMemory).mockResolvedValue(makeMemory());
    vi.mocked(repo.getMaxRevisionNumber).mockResolvedValue(1);
    vi.mocked(repo.updateMemory).mockResolvedValue(
      makeMemory({
        content: 'Corrected content.',
        contentHash: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      }),
    );
    vi.mocked(repo.insertRevision).mockResolvedValue({
      id: 'rev-2',
      tenantId: TENANT_ID,
      memoryId: MEMORY_ID,
      revisionNumber: 2,
      content: 'Corrected content.',
      contentHash: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      reason: 'Fix typo',
      createdByActorId: ACTOR_ID,
      createdAt: new Date(),
    });
  });

  it('creates revision and invalidates embeddings', async () => {
    const result = await correctMemory(mockPrisma, tenantAuth(['memory:correct']), MEMORY_ID, {
      content: 'Corrected content.',
      reason: 'Fix typo',
      icareStage: 'CONTEXT',
    });

    expect(result.embeddingInvalidated).toBe(true);
    expect(repo.deleteEmbeddingsForMemory).toHaveBeenCalledWith(mockTx, TENANT_ID, MEMORY_ID);
    expect(result.revision.revisionNumber).toBe(2);
  });

  it('requires memory:correct permission', async () => {
    await expect(
      correctMemory(mockPrisma, tenantAuth(['memory:read']), MEMORY_ID, {
        content: 'Nope',
        reason: 'Denied',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.PERMISSION_DENIED });
  });
});

describe('deleteMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repo.getMemory).mockResolvedValue(makeMemory());
  });

  it('soft-deletes memory and writes audit trail', async () => {
    const result = await deleteMemory(mockPrisma, tenantAuth(['memory:delete']), MEMORY_ID);
    expect(result.alreadyDeleted).toBe(false);
    expect(repo.softDeleteMemory).toHaveBeenCalledWith(mockTx, TENANT_ID, MEMORY_ID);
    expect(repo.insertAuditEvent).toHaveBeenCalled();
  });

  it('returns alreadyDeleted for deleted memory', async () => {
    vi.mocked(repo.getMemory).mockResolvedValue(makeMemory({ status: 'DELETED' }));
    const result = await deleteMemory(mockPrisma, tenantAuth(['memory:delete']), MEMORY_ID);
    expect(result.alreadyDeleted).toBe(true);
  });
});

describe('getRevisionHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repo.getMemory).mockResolvedValue(makeMemory());
    vi.mocked(repo.getRevisions).mockResolvedValue([
      {
        id: 'rev-1',
        tenantId: TENANT_ID,
        memoryId: MEMORY_ID,
        revisionNumber: 1,
        content: 'Baseline content.',
        contentHash: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        reason: 'Initial creation',
        createdByActorId: ACTOR_ID,
        createdAt: new Date(),
      } satisfies RevisionRow,
    ]);
  });

  it('returns revision history within scope', async () => {
    const revisions = await getRevisionHistory(mockPrisma, tenantAuth(), MEMORY_ID);
    expect(revisions).toHaveLength(1);
    expect(revisions[0].revisionNumber).toBe(1);
  });
});

describe('upsertEmbedding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repo.getMemory).mockResolvedValue(makeMemory());
  });

  it('upserts embedding when embed permission is granted', async () => {
    await upsertEmbedding(mockPrisma, tenantAuth(['memory:embed']), MEMORY_ID, {
      embedding: validEmbedding(),
    });
    expect(repo.upsertEmbedding).toHaveBeenCalled();
  });

  it('rejects invalid embedding dimensions', async () => {
    await expect(
      upsertEmbedding(mockPrisma, tenantAuth(['memory:embed']), MEMORY_ID, {
        embedding: [0.1, 0.2],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
  });

  it('requires memory:embed permission', async () => {
    await expect(
      upsertEmbedding(mockPrisma, tenantAuth(['memory:read']), MEMORY_ID, {
        embedding: validEmbedding(),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.PERMISSION_DENIED });
  });
});

describe('ServiceError propagation', () => {
  it('wraps metadata validation failures as ServiceError', async () => {
    await expect(
      createMemory(mockPrisma, tenantAuth(), {
        scopeType: 'TENANT',
        memoryType: 'FACT',
        content: 'Bad metadata path.',
        icareStage: 'ISSUE',
        reasoningChainId: 'not-a-uuid',
      }),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});
