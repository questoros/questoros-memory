import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ERROR_CODES, ServiceError } from '@questoros-memory/memory-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRemoteMcpRequestHandler } from '../src/remote.js';
import { REMOTE_MCP_READ_ONLY_TOOL_NAMES } from '../src/remote-tools.js';

const API_KEY = 'qmem_live_remote_http_test_key_only';
const MEMORY_ID = '66666666-6666-4666-8666-666666666666';

const mockWhoami = vi.fn();
const mockGet = vi.fn();
const mockList = vi.fn();
const mockSearch = vi.fn();
const mockHistory = vi.fn();

vi.mock('@questoros-memory/memory-service', () => ({
  transportWhoami: (...args: unknown[]) => mockWhoami(...args),
  transportGetMemory: (...args: unknown[]) => mockGet(...args),
  transportListMemories: (...args: unknown[]) => mockList(...args),
  transportSearchMemories: (...args: unknown[]) => mockSearch(...args),
  transportRevisionHistory: (...args: unknown[]) => mockHistory(...args),
}));

type RunningServer = {
  server: Server;
  endpoint: URL;
};

const runningServers: Server[] = [];

async function startServer(
  options: Parameters<typeof createRemoteMcpRequestHandler>[0] = {},
): Promise<RunningServer> {
  const handler = createRemoteMcpRequestHandler(options);
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  runningServers.push(server);
  const address = server.address() as AddressInfo;
  return {
    server,
    endpoint: new URL(`http://127.0.0.1:${address.port}/mcp`),
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function connectClient(endpoint: URL): Promise<Client> {
  const client = new Client({ name: 'phase8-remote-test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: {
      headers: {
        authorization: `Bearer ${API_KEY}`,
      },
    },
  });
  await client.connect(transport);
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWhoami.mockResolvedValue({
    tenantId: '11111111-1111-4111-8111-111111111111',
    actorId: '22222222-2222-4222-8222-222222222222',
    credentialScope: {
      scopeType: 'PROJECT',
      projectId: '33333333-3333-4333-8333-333333333333',
    },
    permissions: ['memory:read'],
  });
  mockGet.mockResolvedValue({ id: MEMORY_ID, content: 'Synthetic project memory.' });
  mockList.mockResolvedValue({ items: [], nextCursor: null });
  mockSearch.mockResolvedValue([]);
  mockHistory.mockResolvedValue([]);
});

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map((server) => closeServer(server)));
});

describe('authenticated remote MCP Streamable HTTP handler', () => {
  it('rejects an unauthenticated request before MCP initialization', async () => {
    const { endpoint } = await startServer();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'unauthenticated-test', version: '1.0.0' },
        },
      }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('Bearer');
    const payload = await response.json();
    expect(payload.error.data.code).toBe(ERROR_CODES.AUTH_REQUIRED);
    expect(JSON.stringify(payload)).not.toMatch(/qmem_live_|DATABASE_URL|postgresql|stack/i);
    expect(mockWhoami).not.toHaveBeenCalled();
  });

  it('rejects an invalid key with a sanitized authentication code', async () => {
    mockWhoami.mockRejectedValue(
      new ServiceError(ERROR_CODES.AUTH_INVALID, 'API key is invalid.', 401),
    );
    const { endpoint } = await startServer();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${API_KEY}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'invalid-auth-test', version: '1.0.0' },
        },
      }),
    });

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error.data.code).toBe(ERROR_CODES.AUTH_INVALID);
    expect(JSON.stringify(payload)).not.toContain(API_KEY);
  });

  it('connects with the official MCP client and exposes only the five read-only tools', async () => {
    const { endpoint } = await startServer();
    const client = await connectClient(endpoint);

    try {
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual(REMOTE_MCP_READ_ONLY_TOOL_NAMES);

      const whoami = await client.callTool({
        name: 'questoros_memory_whoami',
        arguments: {},
      });
      expect(whoami.isError).not.toBe(true);
      expect(JSON.stringify(whoami)).toContain('11111111-1111-4111-8111-111111111111');
      expect(JSON.stringify(whoami)).not.toContain(API_KEY);

      let blocked = false;
      try {
        const result = await client.callTool({
          name: 'questoros_memory_create',
          arguments: { scopeType: 'PROJECT', memoryType: 'FACT', content: 'Blocked.' },
        });
        blocked = result.isError === true;
      } catch {
        blocked = true;
      }
      expect(blocked).toBe(true);
    } finally {
      await client.close();
    }
  });

  it('returns a safe MCP tool error when memory-service denies project scope', async () => {
    mockGet.mockRejectedValueOnce(
      new ServiceError(
        ERROR_CODES.SCOPE_DENIED,
        'Requested memory is outside credential scope.',
        403,
      ),
    );
    const { endpoint } = await startServer();
    const client = await connectClient(endpoint);

    try {
      const result = await client.callTool({
        name: 'questoros_memory_get',
        arguments: { memoryId: MEMORY_ID },
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toContain('SCOPE_DENIED');
      expect(JSON.stringify(result)).not.toMatch(
        /qmem_live_|DATABASE_URL|postgresql|prisma|stack/i,
      );
    } finally {
      await client.close();
    }
  });

  it('rejects browser origins unless they are explicitly allowlisted', async () => {
    const { endpoint } = await startServer({ allowedOrigins: ['https://approved.example'] });
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        origin: 'https://unapproved.example',
        authorization: `Bearer ${API_KEY}`,
        'content-type': 'application/json',
      },
      body: '{}',
    });

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.error.data.code).toBe('MCP_ORIGIN_DENIED');
    expect(mockWhoami).not.toHaveBeenCalled();
  });
});
