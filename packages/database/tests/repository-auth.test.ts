import { describe, it, expect, vi } from 'vitest';
import { lookupApiKey, validateApiKeyStatus, type StoredApiKey } from '../src/repository/auth.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

function baseKey(overrides: Partial<StoredApiKey> = {}): StoredApiKey {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    tenantId: TENANT_ID,
    actorId: '22222222-2222-4222-8222-222222222222',
    name: 'test',
    keyPrefix: 'abcdefgh',
    keyHash: 'hash',
    scopeType: 'TENANT',
    scopeId: TENANT_ID,
    workspaceId: null,
    projectId: null,
    permissions: ['memory:read'],
    status: 'ACTIVE',
    expiresAt: null,
    createdAt: new Date(),
    revokedAt: null,
    tenantStatus: 'ACTIVE',
    ...overrides,
  };
}

describe('lookupApiKey', () => {
  it('returns the first matching row or null', async () => {
    const row = baseKey();
    const queryRaw = vi.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
    const prisma = { $queryRaw: queryRaw } as never;

    await expect(lookupApiKey(prisma, 'hash')).resolves.toEqual(row);
    await expect(lookupApiKey(prisma, 'missing')).resolves.toBeNull();

    const sqlText = Array.from(queryRaw.mock.calls[0][0] as TemplateStringsArray).join(' ');
    expect(sqlText).toMatch(/api_keys/i);
    expect(sqlText).toMatch(/tenants/i);
    expect(sqlText).toMatch(/key_hash/i);
  });
});

describe('validateApiKeyStatus rejection paths', () => {
  it('rejects inactive tenant', () => {
    expect(validateApiKeyStatus(baseKey({ tenantStatus: 'SUSPENDED' }))).toBeNull();
  });

  it('rejects revoked key', () => {
    expect(validateApiKeyStatus(baseKey({ status: 'REVOKED' }))).toBeNull();
  });

  it('rejects expired key', () => {
    expect(validateApiKeyStatus(baseKey({ expiresAt: new Date(Date.now() - 60_000) }))).toBeNull();
  });

  it('accepts active unexpired key', () => {
    const auth = validateApiKeyStatus(baseKey({ expiresAt: new Date(Date.now() + 60_000) }));
    expect(auth?.apiKeyId).toBe('33333333-3333-4333-8333-333333333333');
    expect(auth?.permissions).toEqual(['memory:read']);
  });
});
