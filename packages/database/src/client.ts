import { PrismaClient } from '@prisma/client';

let client: PrismaClient | null = null;

/**
 * Get a lazy Prisma client instance.
 *
 * Does not connect during module import, build, typecheck, lint, or unit tests.
 * The first call creates and caches one instance per Node.js process.
 */
export function getDatabaseClient(): PrismaClient {
  if (!client) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL is not set. Configure it in the environment before requesting the database client.',
      );
    }
    client = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }
  return client;
}

/**
 * Explicitly disconnect the cached Prisma client.
 * Used by scripts and tests for clean shutdown.
 */
export async function disconnectDatabaseClient(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
