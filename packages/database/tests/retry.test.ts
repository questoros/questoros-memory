import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { withRetry, withTransaction } from '../src/retry.js';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns on the first successful attempt', async () => {
    const result = await withRetry(async (attempt) => {
      expect(attempt).toBe(0);
      return 'ok';
    });
    expect(result).toBe('ok');
  });

  it('rethrows non-retryable errors immediately', async () => {
    await expect(
      withRetry(async () => {
        throw Object.assign(new Error('constraint'), { code: 'P2002' });
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('retries P2034 and succeeds on a later attempt', async () => {
    let calls = 0;
    const promise = withRetry(async () => {
      calls += 1;
      if (calls < 3) {
        throw Object.assign(new Error('conflict'), { code: 'P2034' });
      }
      return 'recovered';
    });

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('recovered');
    expect(calls).toBe(3);
  });

  it('treats raw 40001 and serialization messages as retryable', async () => {
    const cases = [{ code: '40001' }, { message: 'restart transaction' }, { message: '40001' }];

    for (const err of cases) {
      let calls = 0;
      const promise = withRetry(async () => {
        calls += 1;
        if (calls === 1) {
          throw err;
        }
        return 'ok';
      });
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBe('ok');
    }
  });

  it('exhausts retries and throws DATABASE_RETRY_EXHAUSTED with context', async () => {
    const promise = withRetry(async () => {
      throw Object.assign(new Error('serialization failure'), { code: 'P2034' });
    }, 'create-memory');

    const expectation = expect(promise).rejects.toMatchObject({
      code: 'DATABASE_RETRY_EXHAUSTED',
      message: expect.stringContaining('[create-memory]'),
    });
    await vi.runAllTimersAsync();
    await expectation;
  });

  it('exhausts retries without context when omitted', async () => {
    const promise = withRetry(async () => {
      throw { code: '40001', message: 'serialization' };
    });
    const expectation = expect(promise).rejects.toMatchObject({
      code: 'DATABASE_RETRY_EXHAUSTED',
      message: expect.stringMatching(/exhausted after 5 attempts$/),
    });
    await vi.runAllTimersAsync();
    await expectation;
  });
});

describe('withTransaction', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the callback inside a Serializable Prisma transaction', async () => {
    const tx = { tag: 'tx' } as never;
    const prisma = {
      $transaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>, opts: unknown) => {
        expect(opts).toEqual(
          expect.objectContaining({
            isolationLevel: 'Serializable',
            maxWait: 5000,
            timeout: 15000,
          }),
        );
        return fn(tx);
      }),
    } as unknown as PrismaClient;

    const result = await withTransaction(
      prisma,
      async (client) => {
        expect(client).toBe(tx);
        return 42;
      },
      'write',
    );

    expect(result).toBe(42);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
