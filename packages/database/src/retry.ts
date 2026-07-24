/**
 * CockroachDB transaction retry helper for SERIALIZABLE isolation.
 *
 * Retries only SQLSTATE 40001 (serialization failure).
 * Implements exponential backoff with jitter.
 */

import type { PrismaClient } from '@prisma/client';

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 50;
const MAX_DELAY_MS = 2000;

/**
 * Generate a random integer between 0 and max-1.
 */
function jitter(max: number): number {
  return Math.floor(Math.random() * max);
}

/**
 * Calculate delay for attempt n (0-indexed) with jitter.
 */
function calculateDelay(attempt: number): number {
  const exponential = BASE_DELAY_MS * Math.pow(2, attempt);
  const capped = Math.min(exponential, MAX_DELAY_MS);
  return capped + jitter(capped);
}

/**
 * Check if a Prisma or PG error represents SQLSTATE 40001.
 */
function isRetryable40001(error: unknown): boolean {
  const err = error as Record<string, unknown>;
  // Prisma: P2034 is the Prisma code for a transaction conflict
  if (err.code === 'P2034') return true;
  // Raw pg: code 40001
  if (err.code === '40001') return true;
  // Message-based check
  const msg = typeof err.message === 'string' ? err.message : '';
  if (msg.includes('40001') || msg.includes('restart transaction') || msg.includes('serialization'))
    return true;
  return false;
}

/**
 * Execute a transaction callback with automatic retry on SQLSTATE 40001.
 *
 * @param fn - The async callback that performs the transaction work.
 *   Receives the attempt number (0-based) for logging.
 * @param context - Optional context string for error messages.
 * @returns The result of the callback.
 * @throws The last error if all retries are exhausted or the error is non-retryable.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  context?: string,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (!isRetryable40001(error)) {
        throw error;
      }

      if (attempt < MAX_ATTEMPTS - 1) {
        const delay = calculateDelay(attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  const ctx = context ? ` [${context}]` : '';
  const err = new Error(
    `Transaction retry exhausted after ${MAX_ATTEMPTS} attempts${ctx}`,
  ) as Error & { code: string; cause: unknown };
  err.code = 'DATABASE_RETRY_EXHAUSTED';
  err.cause = lastError;
  throw err;
}

/**
 * Execute a multi-statement write within a Prisma interactive transaction
 * with automatic retry on SQLSTATE 40001.
 */
export async function withTransaction<T>(
  prisma: PrismaClient,
  fn: (
    tx: Omit<
      PrismaClient,
      '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
    >,
  ) => Promise<T>,
  context?: string,
): Promise<T> {
  return withRetry(async (_attempt) => {
    return await prisma.$transaction(
      async (tx) => {
        return await fn(tx);
      },
      {
        isolationLevel: 'Serializable',
        maxWait: 5000,
        timeout: 15000,
      },
    );
  }, context);
}
