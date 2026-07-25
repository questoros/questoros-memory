import { describe, it, expect, vi } from 'vitest';
import { MemoryApiClient, MemoryApiError } from '../src/index.js';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

describe('MemoryApiClient', () => {
  it('sends bearer auth and calls whoami', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { tenantId: 't1' }));
    const client = new MemoryApiClient({
      baseUrl: 'http://127.0.0.1:8787',
      apiKey: 'qmem_live_test',
      fetch: fetchMock,
    });

    await expect(client.whoami()).resolves.toEqual({ tenantId: 't1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/v1/whoami',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer qmem_live_test',
        }),
      }),
    );
  });

  it('posts JSON for createMemory and harvest/publish methods', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'm1' }));
    const client = new MemoryApiClient({
      baseUrl: 'http://example.test/',
      apiKey: 'key',
      fetch: fetchMock,
    });

    await client.createMemory({ content: 'hello', memoryType: 'FACT' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://example.test/v1/memories',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ content: 'hello', memoryType: 'FACT' }),
      }),
    );

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'run-1' }));
    await client.createHarvestRun({ text: 'Goal: Ship' });
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://example.test/v1/harvest/runs',
      expect.objectContaining({ method: 'POST' }),
    );

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'cand-1' }));
    await client.approveCandidate('cand-1');
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://example.test/v1/candidates/cand-1/approve',
      expect.objectContaining({ method: 'POST' }),
    );

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'art-1' }));
    await client.publishArtifact({ title: 'Brief' });
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://example.test/v1/publish/artifacts',
      expect.objectContaining({ method: 'POST' }),
    );

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { synced: true }));
    await client.syncArtifact('art-1');
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://example.test/v1/publish/artifacts/art-1/sync',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws MemoryApiError on non-OK responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(403, { error: { message: 'Forbidden' } }));
    const client = new MemoryApiClient({
      baseUrl: 'http://127.0.0.1:8787',
      apiKey: 'key',
      fetch: fetchMock,
    });

    await expect(client.listMemories()).rejects.toBeInstanceOf(MemoryApiError);
    await expect(client.listCandidates()).rejects.toMatchObject({
      status: 403,
      message: 'Forbidden',
    });
  });
});
