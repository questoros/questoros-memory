import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceError, ERROR_CODES } from '@questoros-memory/memory-core';
import { MCP_TOOL_NAMES, registerTools } from '../src/tools.js';

const API_KEY = 'qmem_live_example_test_key_only';
const MEMORY_ID = '66666666-6666-4666-8666-666666666666';

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
}));

type ToolRegistration = {
  name: string;
  description: string;
  shape?: Record<string, unknown>;
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
        description: string,
        shapeOrHandler: Record<string, unknown> | ToolRegistration['handler'],
        maybeHandler?: ToolRegistration['handler'],
      ) => {
        if (typeof shapeOrHandler === 'function') {
          tools.set(name, { name, description, handler: shapeOrHandler });
        } else {
          tools.set(name, {
            name,
            description,
            shape: shapeOrHandler,
            handler: maybeHandler!,
          });
        }
      },
    },
  };
}

describe('MCP_TOOL_NAMES', () => {
  it('exports exactly ten stable tool names', () => {
    expect(MCP_TOOL_NAMES).toHaveLength(10);
    expect(MCP_TOOL_NAMES).toEqual([
      'questoros_memory_whoami',
      'questoros_memory_create',
      'questoros_memory_get',
      'questoros_memory_list',
      'questoros_memory_search',
      'questoros_memory_correct',
      'questoros_memory_delete',
      'questoros_memory_history',
      'questoros_memory_set_embedding',
      'questoros_memory_generate_embedding',
    ]);
  });
});

describe('registerTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWhoami.mockResolvedValue({
      tenantId: '11111111-1111-4111-8111-111111111111',
      actorId: '22222222-2222-4222-8222-222222222222',
      permissions: ['memory:read'],
    });
    mockCreate.mockResolvedValue({
      memory: { id: MEMORY_ID, metadata: { icare: { icareStage: 'ISSUE' } } },
      revision: { revisionNumber: 1 },
    });
    mockGet.mockResolvedValue({ id: MEMORY_ID });
    mockList.mockResolvedValue({ items: [], nextCursor: null });
    mockSearch.mockResolvedValue([]);
    mockCorrect.mockResolvedValue({
      memory: { id: MEMORY_ID },
      revision: { revisionNumber: 2 },
      embeddingInvalidated: true,
    });
    mockDelete.mockResolvedValue({ alreadyDeleted: false });
    mockHistory.mockResolvedValue([]);
    mockEmbed.mockResolvedValue(undefined);
  });

  it('registers all nine tools on the MCP server', () => {
    const { server, tools } = createMockServer();
    registerTools(server as never, API_KEY);
    for (const name of MCP_TOOL_NAMES) {
      expect(tools.has(name)).toBe(true);
    }
  });

  it('invokes transportWhoami with configured API key and returns structured JSON', async () => {
    const { server, tools } = createMockServer();
    registerTools(server as never, API_KEY);

    const result = await tools.get('questoros_memory_whoami')!.handler({});
    expect(mockWhoami).toHaveBeenCalledWith(API_KEY);
    expect(result.content[0].text).toContain('11111111-1111-4111-8111-111111111111');
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  it('validates create tool input shape and calls transportCreateMemory', async () => {
    const { server, tools } = createMockServer();
    registerTools(server as never, API_KEY);

    const registration = tools.get('questoros_memory_create')!;
    expect(registration.shape ?? registration.handler).toBeDefined();
    if (registration.shape) {
      expect(registration.shape).toHaveProperty('scopeType');
      expect(registration.shape).toHaveProperty('icareStage');
    }

    const result = await registration.handler({
      scopeType: 'TENANT',
      memoryType: 'FACT',
      content: 'MCP-created memory.',
      icareStage: 'ISSUE',
    });

    expect(mockCreate).toHaveBeenCalledWith(
      API_KEY,
      expect.objectContaining({ icareStage: 'ISSUE' }),
    );
    expect(result.content[0].text).toContain(MEMORY_ID);
    expect(JSON.stringify(result)).not.toMatch(/qmem_live_|DATABASE_URL|postgresql/i);
  });

  it('returns safe structured errors without credential leakage', async () => {
    const { server, tools } = createMockServer();
    registerTools(server as never, API_KEY);

    mockGet.mockRejectedValueOnce(
      new ServiceError(ERROR_CODES.PERMISSION_DENIED, 'Insufficient permissions.', 403),
    );

    const result = await tools.get('questoros_memory_get')!.handler({ memoryId: MEMORY_ID });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('PERMISSION_DENIED');
    expect(result.content[0].text).not.toContain(API_KEY);
    expect(result.content[0].text).not.toMatch(/stack|postgresql|prisma/i);
  });

  it('routes search, correct, delete, history, and embedding through transport layer', async () => {
    const { server, tools } = createMockServer();
    registerTools(server as never, API_KEY);

    await tools.get('questoros_memory_search')!.handler({
      scopeType: 'TENANT',
      queryText: 'deployment',
    });
    expect(mockSearch).toHaveBeenCalled();

    await tools.get('questoros_memory_correct')!.handler({
      memoryId: MEMORY_ID,
      content: 'Updated',
      reason: 'Fix',
    });
    expect(mockCorrect).toHaveBeenCalledWith(API_KEY, MEMORY_ID, expect.any(Object));

    await tools.get('questoros_memory_delete')!.handler({ memoryId: MEMORY_ID });
    expect(mockDelete).toHaveBeenCalledWith(API_KEY, MEMORY_ID);

    await tools.get('questoros_memory_history')!.handler({ memoryId: MEMORY_ID });
    expect(mockHistory).toHaveBeenCalledWith(API_KEY, MEMORY_ID);

    await tools.get('questoros_memory_set_embedding')!.handler({
      memoryId: MEMORY_ID,
      embedding: Array.from({ length: 1024 }, () => 0.01),
    });
    expect(mockEmbed).toHaveBeenCalled();

    mockGenerate.mockResolvedValueOnce({
      memoryId: MEMORY_ID,
      provider: 'amazon-bedrock',
      modelId: 'amazon.titan-embed-text-v2:0',
      dimensions: 1024,
      normalized: true,
      inputTokenCount: 3,
      generated: true,
      reused: false,
    });
    const generated = await tools.get('questoros_memory_generate_embedding')!.handler({
      memoryId: MEMORY_ID,
      force: false,
    });
    expect(mockGenerate).toHaveBeenCalledWith(API_KEY, MEMORY_ID, { force: false });
    expect(generated.content[0].text).toContain('"generated": true');
    expect(generated.content[0].text).not.toContain('embedding');
  });

  it('returns list and get success payloads', async () => {
    const { server, tools } = createMockServer();
    registerTools(server as never, API_KEY);

    const listed = await tools.get('questoros_memory_list')!.handler({});
    expect(listed.content[0].text).toContain('Found 0 memories');
    expect(mockList).toHaveBeenCalledWith(API_KEY, expect.any(Object));

    const got = await tools.get('questoros_memory_get')!.handler({ memoryId: MEMORY_ID });
    expect(got.content[0].text).toContain(MEMORY_ID);
    expect(got.isError).toBeUndefined();
  });

  it('reports already-deleted delete results', async () => {
    const { server, tools } = createMockServer();
    registerTools(server as never, API_KEY);
    mockDelete.mockResolvedValueOnce({ alreadyDeleted: true });
    const result = await tools.get('questoros_memory_delete')!.handler({ memoryId: MEMORY_ID });
    expect(result.content[0].text).toContain('already deleted');
  });

  it('converts unexpected non-ServiceError failures safely', async () => {
    const { server, tools } = createMockServer();
    registerTools(server as never, API_KEY);
    mockList.mockRejectedValueOnce(new Error('boom with postgresql://secret'));
    const result = await tools.get('questoros_memory_list')!.handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: request failed.');
    expect(result.content[0].text).not.toContain('postgresql');
    expect(result.content[0].text).not.toContain(API_KEY);
  });
});

describe('protocol safety', () => {
  it('does not expose API key in module exports', () => {
    expect(JSON.stringify(MCP_TOOL_NAMES)).not.toContain('qmem_live_');
  });
});
