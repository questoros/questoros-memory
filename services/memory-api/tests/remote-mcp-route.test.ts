import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ERROR_CODES } from '@questoros-memory/memory-core';
import { buildApp } from '../src/app.js';

const apps: FastifyInstance[] = [];

async function createApp(options: Parameters<typeof buildApp>[0]): Promise<FastifyInstance> {
  const app = await buildApp({ logLevel: 'silent', ...options });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('Memory API remote MCP route', () => {
  it('does not mount the route unless explicitly enabled', async () => {
    const app = await createApp({ remoteMcpEnabled: false });
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { 'content-type': 'application/json' },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {} },
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('rejects unauthenticated initialization before tool discovery', async () => {
    const app = await createApp({ remoteMcpEnabled: true });
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { 'content-type': 'application/json' },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {} },
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toContain('Bearer');
    expect(response.json().error.data.code).toBe(ERROR_CODES.AUTH_REQUIRED);
    expect(response.body).not.toMatch(/qmem_live_|DATABASE_URL|postgresql|prisma|stack/i);
  });

  it('rejects a browser origin that is not explicitly allowlisted', async () => {
    const app = await createApp({
      remoteMcpEnabled: true,
      remoteMcpAllowedOrigins: ['https://approved.example'],
    });
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        origin: 'https://unapproved.example',
        'content-type': 'application/json',
      },
      payload: {},
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.data.code).toBe('MCP_ORIGIN_DENIED');
  });

  it('fails closed on malformed configured origins', async () => {
    const previous = process.env.REMOTE_MCP_ALLOWED_ORIGINS;
    process.env.REMOTE_MCP_ALLOWED_ORIGINS = 'https://approved.example/path';
    try {
      await expect(buildApp({ logLevel: 'silent', remoteMcpEnabled: true })).rejects.toThrow(
        'exact HTTP or HTTPS origins',
      );
    } finally {
      if (previous === undefined) {
        delete process.env.REMOTE_MCP_ALLOWED_ORIGINS;
      } else {
        process.env.REMOTE_MCP_ALLOWED_ORIGINS = previous;
      }
    }
  });
});
