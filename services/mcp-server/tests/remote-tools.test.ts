import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES, ServiceError } from '@questoros-memory/memory-core';
import {
  REMOTE_MCP_READ_ONLY_TOOL_NAMES,
  registerRemoteReadOnlyTools,
} from '../src/remote-tools.js';

const API_KEY = 'qmem_live_remote_test_key_only';
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

type ToolRegistration = {
  name: string;
  handler: (
    input: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
};

function createMockServer() {
  const tools = new Map<string, ToolRegistration>();
  return {
    tools,
    server: {
      tool: (
        name: string,
        _description: string,
        shapeOrHandler: Record<string, unknown> | ToolRegistration['handler'],
        maybeHandler?: ToolRegistration['handler'],
      ) => {
        tools.set(name, {
          name,
          handler:
            typeof shapeOrHandler === 'function'
              ? shapeOrHandler
              : (maybeHandler as ToolRegistration['handler']),
        });
      },
    },
  };
}

describe('Phase 8 remote MCP read-only tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWhoami.mockResolvedValue({
      tenantId: '11111111-1111-4111-8111-111111111111',
      actorId: '22222222-2222-4222-8222-222222222222',
      permissions: ['memory:read'],
    });
    mockGet.mockResolvedValue({ id: MEMORY_ID });
    mockList.mockResolvedValue({ items: [], nextCursor: null });
    mockSearch.mockResolvedValue([]);
    mockHistory.mockResolvedValue([]);
  });

  it('exports and registers exactly the five approved read-only tools', () => {
    expect(REMOTE_MCP_READ_ONLY_TOOL_NAMES).toEqual([
      'questoros_memory_whoami',
      'questoros_memory_get',
      'questoros_memory_list',
      'questoros_memory_search',
      'questoros_memory_history',
    ]);

    const { server, tools } = createMockServer();
    registerRemoteReadOnlyTools(server as never, API_KEY);

    expect([...tools.keys()]).toEqual(REMOTE_MCP_READ_ONLY_TOOL_NAMES);
    expect(
      [...tools.keys()].some((name) =>
        /create|correct|delete|approve|reject|publish|embed/i.test(name),
      ),
    ).toBe(false);
  });

  it('routes every operation through memory-service with the request API key', async () => {
    const { server, tools } = createMockServer();
    registerRemoteReadOnlyTools(server as never, API_KEY);

    await tools.get('questoros_memory_whoami')!.handler({});
    await tools.get('questoros_memory_get')!.handler({ memoryId: MEMORY_ID });
    await tools.get('questoros_memory_list')!.handler({ scopeType: 'TENANT' });
    await tools.get('questoros_memory_search')!.handler({
      scopeType: 'TENANT',
      queryText: 'deployment',
    });
    await tools.get('questoros_memory_history')!.handler({ memoryId: MEMORY_ID });

    expect(mockWhoami).toHaveBeenCalledWith(API_KEY);
    expect(mockGet).toHaveBeenCalledWith(API_KEY, MEMORY_ID, { includeDeleted: undefined });
    expect(mockList).toHaveBeenCalledWith(API_KEY, expect.any(Object));
    expect(mockSearch).toHaveBeenCalledWith(API_KEY, expect.any(Object));
    expect(mockHistory).toHaveBeenCalledWith(API_KEY, MEMORY_ID);
  });

  it('returns a sanitized scoped-access error without leaking credentials', async () => {
    const { server, tools } = createMockServer();
    registerRemoteReadOnlyTools(server as never, API_KEY);
    mockGet.mockRejectedValueOnce(
      new ServiceError(
        ERROR_CODES.SCOPE_DENIED,
        'Requested memory is outside credential scope.',
        403,
      ),
    );

    const result = await tools.get('questoros_memory_get')!.handler({ memoryId: MEMORY_ID });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('SCOPE_DENIED');
    expect(JSON.stringify(result)).not.toContain(API_KEY);
    expect(JSON.stringify(result)).not.toMatch(/DATABASE_URL|postgresql|prisma|stack/i);
  });
});
