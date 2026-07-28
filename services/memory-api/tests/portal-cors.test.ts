import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

let app: FastifyInstance | null = null;

afterEach(async () => {
  if (app) await app.close();
  app = null;
});

describe('MemoryOS portal origin controls', () => {
  it('allows configured browser origins and exposes the request id', async () => {
    app = await buildApp({ logLevel: 'silent', portalOrigins: ['https://memory.example.com'] });
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'https://memory.example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://memory.example.com');
    expect(response.headers['access-control-expose-headers']).toBe('X-Request-Id');
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('handles configured preflight requests without authentication', async () => {
    app = await buildApp({ logLevel: 'silent', portalOrigins: ['https://memory.example.com'] });
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/memories',
      headers: {
        origin: 'https://memory.example.com',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization,x-request-id',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://memory.example.com');
    expect(response.headers['access-control-allow-headers']).toContain('Authorization');
  });

  it('rejects unconfigured browser origins', async () => {
    app = await buildApp({ logLevel: 'silent', portalOrigins: ['https://memory.example.com'] });
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'https://untrusted.example.com' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { code: 'PERMISSION_DENIED', message: 'Origin is not allowed.' },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('keeps same-origin and non-browser calls unchanged', async () => {
    app = await buildApp({ logLevel: 'silent', portalOrigins: [] });
    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
