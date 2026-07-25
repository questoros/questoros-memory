import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  assertSqlFullyParameterized,
  buildListMemoryConditions,
  deleteEmbeddingsForMemory,
  findActiveMemoryByContentHash,
  getMaxRevisionNumber,
  getMemory,
  getRevisions,
  joinSqlAnd,
  listMemories,
  searchByText,
  searchByVector,
  softDeleteMemory,
  updateMemory,
  insertApiKey,
  findActiveApiKey,
  revokeApiKey,
} from '../src/repository/memory.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const MEMORY_ID = '66666666-6666-4666-8666-666666666666';
const WORKSPACE_ID = '44444444-4444-4444-8444-444444444444';
const PROJECT_ID = '55555555-5555-4555-8555-555555555555';
const SCOPE_ID = PROJECT_ID;

type SqlLike = { strings: readonly string[]; values: unknown[] };

function flattenSql(sql: SqlLike): { text: string; values: unknown[] } {
  let text = '';
  const values: unknown[] = [];
  for (let i = 0; i < sql.strings.length; i++) {
    text += sql.strings[i];
    if (i < sql.values.length) {
      const value = sql.values[i];
      if (value && typeof value === 'object' && Array.isArray((value as SqlLike).strings)) {
        const nested = flattenSql(value as SqlLike);
        text += nested.text;
        values.push(...nested.values);
      } else {
        text += `$${values.length + 1}`;
        values.push(value);
      }
    }
  }
  return { text, values };
}

function sqlFromQueryRawCall(args: unknown[]): { text: string; values: unknown[] } {
  if (
    args.length === 1 &&
    args[0] &&
    typeof args[0] === 'object' &&
    Array.isArray((args[0] as SqlLike).strings)
  ) {
    return flattenSql(args[0] as SqlLike);
  }
  return flattenSql({
    strings: args[0] as TemplateStringsArray,
    values: args.slice(1),
  });
}

function makeEmbedding(): number[] {
  return Array.from({ length: 1024 }, (_, i) => i / 1024);
}

describe('joinSqlAnd and assertSqlFullyParameterized', () => {
  it('joins fragments with AND', () => {
    const joined = joinSqlAnd([Prisma.sql`a = ${1}`, Prisma.sql`b = ${2}`]);
    const flat = flattenSql(joined);
    expect(flat.text).toContain(' AND ');
    expect(flat.values).toEqual([1, 2]);
  });

  it('rejects request-derived values leaked into SQL text', () => {
    const leaked = TENANT_ID;
    const sql = {
      strings: [`tenant_id = '${leaked}'`],
      values: [] as unknown[],
    } as unknown as Prisma.Sql;
    expect(() => assertSqlFullyParameterized(sql, [leaked])).toThrow(/appears in SQL text/);
  });

  it('rejects missing bound values and accepts Date/number/boolean/bigint', () => {
    const when = new Date('2026-01-01T00:00:00.000Z');
    const sql = Prisma.sql`n = ${1} AND flag = ${true} AND big = ${1n} AND ts = ${when}`;
    expect(() => assertSqlFullyParameterized(sql, [1, true, 1n, when])).not.toThrow();

    const missing = Prisma.sql`n = ${1}`;
    expect(() => assertSqlFullyParameterized(missing, [1, 'ghost'])).toThrow(
      /missing from SQL parameters/,
    );
  });
});

describe('buildListMemoryConditions optional filters', () => {
  it('binds scope, hierarchy, status, sensitivity, actor, dates, and ICARE filters', () => {
    const after = new Date('2026-01-01T00:00:00.000Z');
    const before = new Date('2026-12-31T00:00:00.000Z');
    const { where, boundValues } = buildListMemoryConditions(
      {
        tenantId: TENANT_ID,
        scopeType: 'PROJECT',
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        memoryType: 'FACT',
        status: 'ACTIVE',
        sensitivity: 'STANDARD',
        actorId: '22222222-2222-4222-8222-222222222222',
        updatedAfter: after,
        updatedBefore: before,
        sourceArtifactId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        icareStage: 'ISSUE',
        reasoningChainId: '88888888-8888-4888-8888-888888888888',
        limit: 10,
      },
      null,
    );

    const text = where.strings.join('?');
    expect(text).toContain('m.scope_type');
    expect(text).toContain('m.workspace_id');
    expect(text).toContain('m.project_id');
    expect(text).toContain('m.status');
    expect(text).toContain('m.sensitivity');
    expect(text).toContain('m.actor_id');
    expect(text).toContain('icareStage');
    expect(text).toContain('reasoningChainId');
    expect(() => assertSqlFullyParameterized(where, boundValues)).not.toThrow();
  });

  it('defaults to excluding DELETED when status is omitted', () => {
    const { where } = buildListMemoryConditions({ tenantId: TENANT_ID, limit: 5 }, null);
    expect(where.strings.join('')).toContain("m.status != 'DELETED'");
  });
});

describe('memory repository query helpers', () => {
  it('getMemory includes deleted rows only when requested', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const tx = { $queryRaw: queryRaw } as never;

    await getMemory(tx, TENANT_ID, MEMORY_ID, false);
    await getMemory(tx, TENANT_ID, MEMORY_ID, true);

    const activeSql = sqlFromQueryRawCall(queryRaw.mock.calls[0]).text;
    const allSql = sqlFromQueryRawCall(queryRaw.mock.calls[1]).text;
    expect(activeSql).toContain("status != 'DELETED'");
    expect(allSql).not.toContain("status != 'DELETED'");
  });

  it('findActiveMemoryByContentHash returns null on miss', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const tx = { $queryRaw: queryRaw } as never;
    await expect(
      findActiveMemoryByContentHash(tx, TENANT_ID, 'TENANT', TENANT_ID, 'FACT', 'hash'),
    ).resolves.toBeNull();
  });

  it('listMemories executes parameterized WHERE with LIMIT', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const prisma = { $queryRaw: queryRaw } as never;
    await listMemories(prisma, { tenantId: TENANT_ID, limit: 7 }, null);
    const { text, values } = sqlFromQueryRawCall(queryRaw.mock.calls[0]);
    expect(text).toMatch(/LIMIT/i);
    expect(values).toContain(TENANT_ID);
  });

  it('updateMemory builds optional SET clauses including null validUntil', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        id: MEMORY_ID,
        tenantId: TENANT_ID,
        workspaceId: null,
        projectId: null,
        actorId: null,
        sourceArtifactId: null,
        scopeType: 'TENANT',
        scopeId: TENANT_ID,
        memoryType: 'FACT',
        status: 'ACTIVE',
        content: 'x',
        contentHash: 'h',
        importance: 0.5,
        confidence: 1,
        sensitivity: 'STANDARD',
        validFrom: new Date(),
        validUntil: null,
        supersededById: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ]);
    const tx = { $queryRaw: queryRaw } as never;

    await updateMemory(tx, TENANT_ID, MEMORY_ID, {
      content: 'updated',
      contentHash: 'newhash',
      importance: 0.8,
      confidence: 0.9,
      sensitivity: 'STANDARD',
      validUntil: null,
      metadata: { title: 't' },
    });

    const { text, values } = sqlFromQueryRawCall(queryRaw.mock.calls[0]);
    expect(text).toMatch(/UPDATE memories/i);
    expect(text).toContain('valid_until');
    expect(values).toEqual(expect.arrayContaining(['updated', 'newhash', 0.8, 0.9]));
  });

  it('softDelete, revisions, max revision, and embedding delete execute expected SQL', async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ max: 4 }]);
    const tx = { $executeRaw: executeRaw, $queryRaw: queryRaw } as never;

    await softDeleteMemory(tx, TENANT_ID, MEMORY_ID);
    await getRevisions(tx, TENANT_ID, MEMORY_ID);
    await expect(getMaxRevisionNumber(tx, TENANT_ID, MEMORY_ID)).resolves.toBe(4);
    await deleteEmbeddingsForMemory(tx, TENANT_ID, MEMORY_ID);

    expect(executeRaw).toHaveBeenCalled();
    expect(sqlFromQueryRawCall(queryRaw.mock.calls[0]).text).toMatch(/memory_revisions/i);
  });

  it('getMaxRevisionNumber returns 0 when no revisions exist', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ max: null }]);
    const tx = { $queryRaw: queryRaw } as never;
    await expect(getMaxRevisionNumber(tx, TENANT_ID, MEMORY_ID)).resolves.toBe(0);
  });
});

describe('searchByVector SQL prefix enforcement', () => {
  it('requires exact tenant_id, scope_type, scope_id, ACTIVE status, and cosine distance', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const prisma = { $queryRaw: queryRaw } as never;
    const embedding = makeEmbedding();

    await searchByVector(prisma, {
      tenantId: TENANT_ID,
      scopeType: 'PROJECT',
      scopeId: SCOPE_ID,
      queryEmbedding: embedding,
      limit: 10,
      minimumScore: 0.5,
    });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const { text, values } = sqlFromQueryRawCall(queryRaw.mock.calls[0]);

    expect(text).toMatch(/me\.tenant_id\s*=/);
    expect(text).toMatch(/me\.scope_type\s*=/);
    expect(text).toMatch(/me\.scope_id\s*=/);
    expect(text).toContain("m.status = 'ACTIVE'");
    expect(text).toMatch(/me\.embedding\s*<=>/);
    expect(text).toMatch(/ORDER BY me\.embedding\s*<=>/);

    expect(values).toEqual(
      expect.arrayContaining([TENANT_ID, 'PROJECT', SCOPE_ID, expect.stringMatching(/^\[/), 0.5]),
    );
    expect(values.some((v) => typeof v === 'string' && v.startsWith('[') && v.endsWith(']'))).toBe(
      true,
    );
  });

  it('omits minimumScore predicate when not provided but still binds scope predicates', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const prisma = { $queryRaw: queryRaw } as never;

    await searchByVector(prisma, {
      tenantId: TENANT_ID,
      scopeType: 'WORKSPACE',
      scopeId: WORKSPACE_ID,
      queryEmbedding: makeEmbedding(),
      limit: 5,
    });

    const { text, values } = sqlFromQueryRawCall(queryRaw.mock.calls[0]);
    expect(text).toMatch(/me\.tenant_id\s*=/);
    expect(text).toMatch(/me\.scope_type\s*=/);
    expect(text).toMatch(/me\.scope_id\s*=/);
    expect(text).toContain("m.status = 'ACTIVE'");
    expect(text).toMatch(/me\.embedding\s*<=>/);
    expect(text).not.toMatch(/1 - \(me\.embedding/);
    expect(values).toEqual(expect.arrayContaining([TENANT_ID, 'WORKSPACE', WORKSPACE_ID]));
  });
});

describe('searchByText', () => {
  it('filters by memory tenant/scope and ACTIVE status', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const prisma = { $queryRaw: queryRaw } as never;
    await searchByText(prisma, {
      tenantId: TENANT_ID,
      scopeType: 'PROJECT',
      scopeId: PROJECT_ID,
      limit: 3,
      memoryTypes: ['FACT'],
      sensitivities: ['STANDARD'],
      icareStages: ['ISSUE'],
    });
    const { text, values } = sqlFromQueryRawCall(queryRaw.mock.calls[0]);
    expect(text).toMatch(/m\.tenant_id\s*=/);
    expect(text).toMatch(/m\.scope_type\s*=/);
    expect(text).toMatch(/m\.scope_id\s*=/);
    expect(text).toContain("m.status = 'ACTIVE'");
    expect(values).toEqual(expect.arrayContaining([TENANT_ID, 'PROJECT', PROJECT_ID]));
  });
});

describe('api key repository helpers', () => {
  it('inserts, finds active, and revokes API keys', async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const queryRaw = vi.fn().mockResolvedValue([{ id: 'key-1' }]);
    const tx = { $executeRaw: executeRaw, $queryRaw: queryRaw } as never;

    await insertApiKey(tx, {
      tenantId: TENANT_ID,
      actorId: '22222222-2222-4222-8222-222222222222',
      name: 'demo',
      keyPrefix: 'abcdefgh',
      keyHash: 'hash',
      scopeType: 'PROJECT',
      scopeId: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      permissions: ['memory:read'],
    });
    await findActiveApiKey(tx, TENANT_ID, '22222222-2222-4222-8222-222222222222', 'demo');
    await revokeApiKey(tx, 'key-1');

    expect(executeRaw).toHaveBeenCalled();
    expect(queryRaw).toHaveBeenCalled();
    expect(sqlFromQueryRawCall(queryRaw.mock.calls[0]).text).toMatch(/api_keys/i);
  });
});
