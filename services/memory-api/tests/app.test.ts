import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDisconnect = vi.fn().mockResolvedValue(undefined);

vi.mock('@questoros-memory/database', () => ({
  disconnectDatabaseClient: (...args: unknown[]) => mockDisconnect(...args),
}));

vi.mock('@questoros-memory/memory-service', () => ({
  transportWhoami: vi.fn(),
  transportCreateMemory: vi.fn(),
  transportGetMemory: vi.fn(),
  transportListMemories: vi.fn(),
  transportSearchMemories: vi.fn(),
  transportCorrectMemory: vi.fn(),
  transportDeleteMemory: vi.fn(),
  transportRevisionHistory: vi.fn(),
  transportUpsertEmbedding: vi.fn(),
  transportReadyz: vi.fn().mockResolvedValue(true),
}));

import { buildApp, startApp, stopApp } from '../src/app.js';

describe('buildApp request id and error mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves a valid caller-provided x-request-id', async () => {
    const app = await buildApp({ logLevel: 'silent' });
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'caller-req-123' },
    });
    expect(response.headers['x-request-id']).toBe('caller-req-123');
    await app.close();
  });

  it('maps Fastify schema validation failures to VALIDATION_ERROR', async () => {
    const app = await buildApp({ logLevel: 'silent' });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/memories/not-a-uuid',
      headers: { authorization: 'Bearer qmem_live_example_test_key' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('maps empty JSON body to VALIDATION_ERROR', async () => {
    const app = await buildApp({ logLevel: 'silent' });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/memories',
      headers: {
        authorization: 'Bearer qmem_live_example_test_key',
        'content-type': 'application/json',
      },
      payload: '',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('enforces bodyLimit', async () => {
    const app = await buildApp({ logLevel: 'silent', bodyLimit: 32 });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/memories',
      headers: {
        authorization: 'Bearer qmem_live_example_test_key',
        'content-type': 'application/json',
      },
      payload: { content: 'x'.repeat(200) },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });
});

describe('startApp and stopApp', () => {
  it('starts listening and stops cleanly', async () => {
    const app = await buildApp({ logLevel: 'silent', host: '127.0.0.1', port: 0 });
    await startApp(app);
    expect(app.server.listening).toBe(true);
    await stopApp(app);
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('propagates listen failures', async () => {
    const app = await buildApp({ logLevel: 'silent' });
    vi.spyOn(app, 'listen').mockRejectedValueOnce(new Error('bind failed'));
    await expect(startApp(app)).rejects.toThrow('bind failed');
    await app.close();
  });
});
