import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '@questoros-memory/memory-core';
import { ServiceError, ERROR_CODES } from '@questoros-memory/memory-core';
import type { MemoryRow } from '@questoros-memory/database';
import {
  EmbeddingProviderError,
  EMBEDDING_ERROR_CODES,
  TITAN_V2_MODEL_ID,
  type EmbeddingProvider,
} from '@questoros-memory/embedding-provider';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const API_KEY_ID = '33333333-3333-4333-8333-333333333333';
const MEMORY_ID = '66666666-6666-4666-8666-666666666666';

vi.mock('@questoros-memory/database', () => ({
  withTransaction: vi.fn(async (_prisma: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({})),
  getMemory: vi.fn(),
  hasEmbedding: vi.fn(),
  upsertEmbedding: vi.fn(),
  insertAuditEvent: vi.fn(),
}));

import * as repo from '@questoros-memory/database';
import { generateEmbeddingForMemory, maybeAutoGenerateEmbedding } from '../src/embeddings.js';

const mockPrisma = {} as PrismaClient;

function tenantAuth(permissions: string[] = ['memory:embed']): AuthContext {
  return {
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    apiKeyId: API_KEY_ID,
    permissions,
    credentialScope: { scopeType: 'TENANT', workspaceId: null, projectId: null },
  };
}

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
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    metadata: {},
    ...overrides,
  };
}

function fakeProvider(calls: unknown[]): EmbeddingProvider {
  return {
    providerName: 'amazon-bedrock',
    generate: vi.fn(async (request) => {
      calls.push(request);
      return {
        embedding: Array.from({ length: 1024 }, () => 0.02),
        modelId: TITAN_V2_MODEL_ID,
        dimensions: 1024 as const,
        normalized: true as const,
        inputTokenCount: 5,
        provider: 'amazon-bedrock' as const,
      };
    }),
  };
}

describe('generateEmbeddingForMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repo.getMemory).mockResolvedValue(makeMemory());
    vi.mocked(repo.hasEmbedding).mockResolvedValue(false);
    vi.mocked(repo.upsertEmbedding).mockResolvedValue(undefined as never);
    vi.mocked(repo.insertAuditEvent).mockResolvedValue(undefined as never);
  });

  it('denies missing permission before provider call', async () => {
    const calls: unknown[] = [];
    await expect(
      generateEmbeddingForMemory(mockPrisma, tenantAuth(['memory:read']), MEMORY_ID, {
        provider: fakeProvider(calls),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.PERMISSION_DENIED });
    expect(calls).toHaveLength(0);
  });

  it('rejects deleted memory before provider call', async () => {
    vi.mocked(repo.getMemory).mockResolvedValue(makeMemory({ status: 'DELETED' }));
    const calls: unknown[] = [];
    await expect(
      generateEmbeddingForMemory(mockPrisma, tenantAuth(), MEMORY_ID, {
        provider: fakeProvider(calls),
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.MEMORY_DELETED });
    expect(calls).toHaveLength(0);
  });

  it('reuses an existing embedding without invoking the provider', async () => {
    vi.mocked(repo.hasEmbedding).mockResolvedValue(true);
    const calls: unknown[] = [];
    const result = await generateEmbeddingForMemory(mockPrisma, tenantAuth(), MEMORY_ID, {
      provider: fakeProvider(calls),
      force: false,
    });
    expect(result).toMatchObject({ generated: false, reused: true, memoryId: MEMORY_ID });
    expect(calls).toHaveLength(0);
    expect(result).not.toHaveProperty('embedding');
  });

  it('force regenerates and upserts safely', async () => {
    vi.mocked(repo.hasEmbedding).mockResolvedValue(true);
    const calls: unknown[] = [];
    const result = await generateEmbeddingForMemory(mockPrisma, tenantAuth(), MEMORY_ID, {
      provider: fakeProvider(calls),
      force: true,
      requestId: 'req-1',
    });
    expect(result).toMatchObject({
      generated: true,
      reused: false,
      provider: 'amazon-bedrock',
      dimensions: 1024,
      normalized: true,
      inputTokenCount: 5,
    });
    expect(calls).toHaveLength(1);
    expect(repo.upsertEmbedding).toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('0.02');
  });

  it('audits provider failures safely', async () => {
    const provider: EmbeddingProvider = {
      providerName: 'amazon-bedrock',
      generate: vi.fn(async () => {
        throw new EmbeddingProviderError(
          EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_THROTTLED,
          'Embedding provider is throttling requests.',
          429,
          true,
        );
      }),
    };
    await expect(
      generateEmbeddingForMemory(mockPrisma, tenantAuth(), MEMORY_ID, { provider }),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(repo.insertAuditEvent).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({ outcome: 'FAILURE' }),
    );
  });

  it('rejects stale embedding when content changes during provider invocation', async () => {
    const originalHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const changedHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    vi.mocked(repo.getMemory)
      .mockResolvedValueOnce(makeMemory({ contentHash: originalHash }))
      .mockResolvedValueOnce(
        makeMemory({ contentHash: changedHash, content: 'Corrected content.' }),
      );

    const calls: unknown[] = [];
    await expect(
      generateEmbeddingForMemory(mockPrisma, tenantAuth(), MEMORY_ID, {
        provider: fakeProvider(calls),
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.CONFLICT,
      statusCode: 409,
    });

    expect(calls).toHaveLength(1);
    expect(repo.upsertEmbedding).not.toHaveBeenCalled();
    expect(repo.insertAuditEvent).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        outcome: 'FAILURE',
        metadata: expect.objectContaining({ conflict: 'content_hash_changed' }),
      }),
    );
    expect(JSON.stringify(calls)).not.toContain('0.02');
  });
});

describe('maybeAutoGenerateEmbedding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repo.getMemory).mockResolvedValue(makeMemory());
    vi.mocked(repo.hasEmbedding).mockResolvedValue(false);
  });

  it('makes zero provider calls when auto-on-write is false', async () => {
    const calls: unknown[] = [];
    await maybeAutoGenerateEmbedding(mockPrisma, tenantAuth(), MEMORY_ID, 'req', {
      provider: fakeProvider(calls),
      config: {
        provider: 'amazon-bedrock',
        modelId: TITAN_V2_MODEL_ID,
        dimensions: 1024,
        normalize: true,
        bedrockRegion: 'us-west-2',
        autoOnWrite: false,
        maxInputCharacters: 20_000,
        timeoutMs: 10_000,
        maxAttempts: 1,
      },
    });
    expect(calls).toHaveLength(0);
  });

  it('preserves writes when auto-on-write provider fails', async () => {
    const provider: EmbeddingProvider = {
      providerName: 'amazon-bedrock',
      generate: vi.fn(async () => {
        throw new EmbeddingProviderError(
          EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_UNAVAILABLE,
          'Embedding provider is temporarily unavailable.',
          503,
          true,
        );
      }),
    };
    await expect(
      maybeAutoGenerateEmbedding(mockPrisma, tenantAuth(), MEMORY_ID, 'req', {
        provider,
        config: {
          provider: 'amazon-bedrock',
          modelId: TITAN_V2_MODEL_ID,
          dimensions: 1024,
          normalize: true,
          bedrockRegion: 'us-west-2',
          autoOnWrite: true,
          maxInputCharacters: 20_000,
          timeoutMs: 10_000,
          maxAttempts: 1,
        },
      }),
    ).resolves.toBeUndefined();
  });
});
