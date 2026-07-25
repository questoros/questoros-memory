import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceError, ERROR_CODES } from '@questoros-memory/memory-core';

const MEMORY_ID = '66666666-6666-4666-8666-666666666666';
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

const mockWhoami = vi.fn();
const mockCreate = vi.fn();
const mockGet = vi.fn();
const mockList = vi.fn();
const mockSearch = vi.fn();
const mockCorrect = vi.fn();
const mockDelete = vi.fn();
const mockHistory = vi.fn();
const mockEmbed = vi.fn();
const mockGenerate = vi.fn();
const mockReadyz = vi.fn();

vi.mock('@questoros-memory/memory-service', () => ({
  transportWhoami: (...args: unknown[]) => mockWhoami(...args),
  transportCreateMemory: (...args: unknown[]) => mockCreate(...args),
  transportGetMemory: (...args: unknown[]) => mockGet(...args),
  transportListMemories: (...args: unknown[]) => mockList(...args),
  transportSearchMemories: (...args: unknown[]) => mockSearch(...args),
  transportCorrectMemory: (...args: unknown[]) => mockCorrect(...args),
  transportDeleteMemory: (...args: unknown[]) => mockDelete(...args),
  transportRevisionHistory: (...args: unknown[]) => mockHistory(...args),
  transportUpsertEmbedding: (...args: unknown[]) => mockEmbed(...args),
  transportGenerateEmbedding: (...args: unknown[]) => mockGenerate(...args),
  transportReadyz: (...args: unknown[]) => mockReadyz(...args),
}));

import { buildApp } from '../src/app.js';

function authHeader(token = 'qmem_live_example_test_key'): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

function sampleMemory() {
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
    content: 'Example memory.',
    contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    importance: 0.5,
    confidence: 1,
    sensitivity: 'STANDARD',
    validFrom: now.toISOString(),
    validUntil: null,
    supersededById: null,
    metadata: {
      title: 'Example',
      icare: { icareStage: 'ISSUE', reasoningChainId: '88888888-8888-4888-8888-888888888888' },
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    deletedAt: null,
  };
}

describe('REST routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadyz.mockResolvedValue(true);
    mockWhoami.mockResolvedValue({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      credentialScope: {
        scopeType: 'TENANT',
        scopeId: TENANT_ID,
        workspaceId: null,
        projectId: null,
      },
      permissions: ['memory:read', 'memory:write'],
    });
    mockCreate.mockResolvedValue({
      memory: sampleMemory(),
      revision: { revisionNumber: 1 },
    });
    mockGet.mockResolvedValue(sampleMemory());
    mockList.mockResolvedValue({ items: [sampleMemory()], nextCursor: null });
    mockSearch.mockResolvedValue([
      {
        memory: sampleMemory(),
        revisionNumber: 1,
        explanation: {
          matchedScope: { scopeType: 'TENANT', scopeId: TENANT_ID },
          components: { keywordScore: 0.65, importance: 0.5, confidence: 1, recency: 1 },
          weights: { keywordScore: 0.35 },
          finalScore: 0.7,
          reasons: ['Keyword match'],
        },
      },
    ]);
    mockCorrect.mockResolvedValue({
      memory: sampleMemory(),
      revision: { revisionNumber: 2 },
      embeddingInvalidated: true,
    });
    mockDelete.mockResolvedValue({ alreadyDeleted: false });
    mockHistory.mockResolvedValue([
      {
        id: 'rev-1',
        tenantId: TENANT_ID,
        memoryId: MEMORY_ID,
        revisionNumber: 1,
        content: 'Example memory.',
        contentHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        reason: 'Initial creation',
        createdByActorId: ACTOR_ID,
        createdAt: new Date().toISOString(),
      },
    ]);
    mockEmbed.mockResolvedValue({ status: 'ok' });
    mockGenerate.mockResolvedValue({
      memoryId: MEMORY_ID,
      provider: 'amazon-bedrock',
      modelId: 'amazon.titan-embed-text-v2:0',
      dimensions: 1024,
      normalized: true,
      inputTokenCount: 4,
      generated: true,
      reused: false,
    });
  });

  it('GET /healthz returns ok without authentication', async () => {
    const app = await buildApp({ logLevel: 'silent' });
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('GET /readyz reflects transport readiness', async () => {
    const app = await buildApp({ logLevel: 'silent' });
    mockReadyz.mockResolvedValueOnce(false);
    const failing = await app.inject({ method: 'GET', url: '/readyz' });
    expect(failing.statusCode).toBe(503);

    const ready = await app.inject({ method: 'GET', url: '/readyz' });
    expect(ready.statusCode).toBe(200);
    await app.close();
  });

  it('GET /v1/whoami requires bearer token and returns identity', async () => {
    const app = await buildApp({ logLevel: 'silent' });

    mockWhoami.mockRejectedValueOnce(
      new ServiceError(ERROR_CODES.AUTH_REQUIRED, 'Authentication required.', 401),
    );
    const missing = await app.inject({ method: 'GET', url: '/v1/whoami' });
    expect(mockWhoami).toHaveBeenCalledWith(undefined);
    expect(missing.statusCode).toBe(401);
    const missingBody = missing.json();
    expect(missingBody.error.code).toBe('AUTH_REQUIRED');
    expect(JSON.stringify(missingBody)).not.toMatch(/stack/i);

    const ok = await app.inject({
      method: 'GET',
      url: '/v1/whoami',
      headers: authHeader(),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().tenantId).toBe(TENANT_ID);
    await app.close();
  });

  it('POST /v1/memories creates memory via transport layer', async () => {
    const app = await buildApp({ logLevel: 'silent' });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/memories',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: {
        scopeType: 'TENANT',
        memoryType: 'FACT',
        content: 'New memory body.',
        icareStage: 'ISSUE',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mockCreate).toHaveBeenCalled();
    expect(response.json().metadata.icare.icareStage).toBe('ISSUE');
    await app.close();
  });

  it('returns structured validation errors without stack traces', async () => {
    const app = await buildApp({ logLevel: 'silent' });
    mockCreate.mockRejectedValueOnce(
      new ServiceError(
        ERROR_CODES.VALIDATION_ERROR,
        'Validation failed: content must not be empty.',
        400,
      ),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/memories',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: { scopeType: 'TENANT', memoryType: 'FACT', content: '' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.requestId).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/stack|prisma|postgresql/i);
    await app.close();
  });

  it('GET /v1/memories/:memoryId validates UUID path parameter', async () => {
    const app = await buildApp({ logLevel: 'silent' });
    const invalid = await app.inject({
      method: 'GET',
      url: '/v1/memories/not-a-uuid',
      headers: authHeader(),
    });
    expect(invalid.statusCode).toBe(400);
    expect(mockGet).not.toHaveBeenCalled();

    const ok = await app.inject({
      method: 'GET',
      url: `/v1/memories/${MEMORY_ID}`,
      headers: authHeader(),
    });
    expect(ok.statusCode).toBe(200);
    await app.close();
  });

  it('covers list, search, correct, delete, history, and embedding routes', async () => {
    const app = await buildApp({ logLevel: 'silent' });

    const list = await app.inject({
      method: 'GET',
      url: '/v1/memories?icareStage=ISSUE',
      headers: authHeader(),
    });
    expect(list.statusCode).toBe(200);

    const search = await app.inject({
      method: 'POST',
      url: '/v1/memories/search',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: { scopeType: 'TENANT', queryText: 'Example' },
    });
    expect(search.statusCode).toBe(200);

    const correct = await app.inject({
      method: 'POST',
      url: `/v1/memories/${MEMORY_ID}/corrections`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: { content: 'Updated body.', reason: 'Fix wording' },
    });
    expect(correct.statusCode).toBe(200);
    expect(correct.json().embeddingInvalidated).toBe(true);

    const del = await app.inject({
      method: 'DELETE',
      url: `/v1/memories/${MEMORY_ID}`,
      headers: authHeader(),
    });
    expect(del.statusCode).toBe(200);

    const history = await app.inject({
      method: 'GET',
      url: `/v1/memories/${MEMORY_ID}/revisions`,
      headers: authHeader(),
    });
    expect(history.statusCode).toBe(200);

    const embed = await app.inject({
      method: 'PUT',
      url: `/v1/memories/${MEMORY_ID}/embedding`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: {
        embedding: Array.from({ length: 1024 }, () => 0.01),
      },
    });
    expect(embed.statusCode).toBe(200);

    const generate = await app.inject({
      method: 'POST',
      url: `/v1/memories/${MEMORY_ID}/embedding/generate`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: { force: false },
    });
    expect(generate.statusCode).toBe(200);
    expect(generate.json()).toMatchObject({
      memoryId: MEMORY_ID,
      generated: true,
      reused: false,
      dimensions: 1024,
      normalized: true,
    });
    expect(JSON.stringify(generate.json())).not.toContain('0.01');
    expect(mockGenerate).toHaveBeenCalled();

    mockGenerate.mockResolvedValueOnce({
      memoryId: MEMORY_ID,
      provider: 'amazon-bedrock',
      modelId: 'amazon.titan-embed-text-v2:0',
      dimensions: 1024,
      normalized: true,
      inputTokenCount: null,
      generated: false,
      reused: true,
    });
    const reused = await app.inject({
      method: 'POST',
      url: `/v1/memories/${MEMORY_ID}/embedding/generate`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: { force: false },
    });
    expect(reused.json().reused).toBe(true);

    mockGenerate.mockRejectedValueOnce(
      new ServiceError(ERROR_CODES.EMBEDDING_PROVIDER_THROTTLED, 'throttled', 429),
    );
    const throttled = await app.inject({
      method: 'POST',
      url: `/v1/memories/${MEMORY_ID}/embedding/generate`,
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: { force: true },
    });
    expect(throttled.statusCode).toBe(429);
    expect(throttled.json().error.code).toBe('EMBEDDING_PROVIDER_THROTTLED');
    expect(throttled.json().error.requestId).toBeTruthy();
    await app.close();
  });

  it('maps permission and scope failures to structured errors', async () => {
    const app = await buildApp({ logLevel: 'silent' });
    mockGet.mockRejectedValueOnce(
      new ServiceError(ERROR_CODES.SCOPE_DENIED, 'Operation exceeds your credential scope.', 403),
    );

    const response = await app.inject({
      method: 'GET',
      url: `/v1/memories/${MEMORY_ID}`,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json().error.code).toBe('SCOPE_DENIED');
    await app.close();
  });

  it('handles unexpected errors without leaking internals', async () => {
    const app = await buildApp({ logLevel: 'silent' });
    mockGet.mockRejectedValueOnce(new Error('PrismaClientKnownRequestError: secret detail'));

    const response = await app.inject({
      method: 'GET',
      url: `/v1/memories/${MEMORY_ID}`,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Internal server error.');
    expect(JSON.stringify(body)).not.toMatch(/Prisma|secret detail|stack/i);
    await app.close();
  });

  it('maps malformed JSON to structured 400 VALIDATION_ERROR', async () => {
    const app = await buildApp({ logLevel: 'silent' });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/memories',
      headers: { ...authHeader(), 'content-type': 'application/json' },
      payload: '{"content":',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(response.json().error.message).toMatch(/malformed json/i);
    expect(JSON.stringify(response.json())).not.toMatch(/stack|Prisma|DATABASE_URL/i);
    await app.close();
  });

  it('maps unsupported content type to structured 415 VALIDATION_ERROR', async () => {
    const app = await buildApp({ logLevel: 'silent' });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/memories',
      headers: { ...authHeader(), 'content-type': 'application/xml' },
      payload: '<memory/>',
    });
    expect(response.statusCode).toBe(415);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('maps transport failures on list/search/correct/delete/history/embed routes', async () => {
    const app = await buildApp({ logLevel: 'silent' });
    const denied = new ServiceError(ERROR_CODES.PERMISSION_DENIED, 'Denied.', 403);

    mockList.mockRejectedValueOnce(denied);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/v1/memories',
          headers: authHeader(),
        })
      ).statusCode,
    ).toBe(403);

    mockSearch.mockRejectedValueOnce(denied);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/memories/search',
          headers: { ...authHeader(), 'content-type': 'application/json' },
          payload: { scopeType: 'TENANT', queryText: 'x' },
        })
      ).statusCode,
    ).toBe(403);

    mockCorrect.mockRejectedValueOnce(denied);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/memories/${MEMORY_ID}/corrections`,
          headers: { ...authHeader(), 'content-type': 'application/json' },
          payload: { content: 'x', reason: 'y' },
        })
      ).statusCode,
    ).toBe(403);

    mockDelete.mockRejectedValueOnce(denied);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/v1/memories/${MEMORY_ID}`,
          headers: authHeader(),
        })
      ).statusCode,
    ).toBe(403);

    mockHistory.mockRejectedValueOnce(denied);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/v1/memories/${MEMORY_ID}/revisions`,
          headers: authHeader(),
        })
      ).statusCode,
    ).toBe(403);

    mockEmbed.mockRejectedValueOnce(denied);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/v1/memories/${MEMORY_ID}/embedding`,
          headers: { ...authHeader(), 'content-type': 'application/json' },
          payload: { embedding: Array.from({ length: 1024 }, () => 0.01) },
        })
      ).statusCode,
    ).toBe(403);

    await app.close();
  });

  it('rejects non-Bearer authorization schemes as missing token', async () => {
    const app = await buildApp({ logLevel: 'silent' });
    mockWhoami.mockRejectedValueOnce(
      new ServiceError(ERROR_CODES.AUTH_REQUIRED, 'Authentication required.', 401),
    );
    const response = await app.inject({
      method: 'GET',
      url: '/v1/whoami',
      headers: { authorization: 'Basic abc' },
    });
    expect(mockWhoami).toHaveBeenCalledWith(undefined);
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
