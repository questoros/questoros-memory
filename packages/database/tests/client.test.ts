import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockDisconnect = vi.fn().mockResolvedValue(undefined);
const MockPrismaClient = vi.fn(function MockPrismaClient(
  this: { $disconnect: unknown },
  opts: unknown,
) {
  this.$disconnect = mockDisconnect;
  Object.assign(this, { opts });
});

vi.mock('@prisma/client', () => ({
  PrismaClient: MockPrismaClient,
}));

describe('getDatabaseClient', () => {
  const originalUrl = process.env.DATABASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    vi.resetModules();
    MockPrismaClient.mockClear();
    mockDisconnect.mockClear();
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalUrl;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('throws when DATABASE_URL is missing', async () => {
    const { getDatabaseClient } = await import('../src/client.js');
    expect(() => getDatabaseClient()).toThrow(/DATABASE_URL is not set/);
  });

  it('creates and caches a Prisma client when DATABASE_URL is set', async () => {
    process.env.DATABASE_URL = 'postgresql://example.invalid/testdb';
    const { getDatabaseClient, disconnectDatabaseClient } = await import('../src/client.js');

    const first = getDatabaseClient();
    const second = getDatabaseClient();
    expect(first).toBe(second);
    expect(MockPrismaClient).toHaveBeenCalledTimes(1);
    expect(MockPrismaClient.mock.calls[0][0]).toEqual({ log: ['error'] });

    await disconnectDatabaseClient();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('uses development log levels when NODE_ENV is development', async () => {
    process.env.DATABASE_URL = 'postgresql://example.invalid/testdb';
    process.env.NODE_ENV = 'development';
    const { getDatabaseClient, disconnectDatabaseClient } = await import('../src/client.js');

    getDatabaseClient();
    expect(MockPrismaClient.mock.calls[0][0]).toEqual({ log: ['warn', 'error'] });
    await disconnectDatabaseClient();
  });

  it('disconnect is a no-op when no client was created', async () => {
    const { disconnectDatabaseClient } = await import('../src/client.js');
    await expect(disconnectDatabaseClient()).resolves.toBeUndefined();
    expect(mockDisconnect).not.toHaveBeenCalled();
  });
});
