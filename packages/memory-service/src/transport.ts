/**
 * Transport-facing API. REST and MCP call these helpers and must not import
 * Prisma or database repositories directly.
 */
import { getDatabaseClient } from '@questoros-memory/database';
import type { AuthContext } from '@questoros-memory/memory-core';
import { parseContract, getMemoryQuerySchema } from '@questoros-memory/memory-core';
import { authenticate } from './auth.js';
import {
  whoami,
  createMemory,
  getMemory,
  listMemories,
  searchMemories,
  correctMemory,
  deleteMemory,
  getRevisionHistory,
  upsertEmbedding,
  type CreateMemoryInput,
  type SearchInput,
  type CorrectMemoryInput,
  type UpsertEmbeddingInput,
} from './operations.js';
import { generateEmbeddingForMemory } from './embeddings.js';

async function withAuth(token: string | undefined): Promise<{
  auth: AuthContext;
}> {
  const prisma = getDatabaseClient();
  const { authContext } = await authenticate(prisma, token);
  return { auth: authContext };
}

export async function transportWhoami(token: string | undefined) {
  const { auth } = await withAuth(token);
  return whoami(auth);
}

export async function transportCreateMemory(
  token: string | undefined,
  body: unknown,
  requestId?: string,
) {
  const { auth } = await withAuth(token);
  return createMemory(getDatabaseClient(), auth, (body ?? {}) as CreateMemoryInput, requestId);
}

export async function transportGetMemory(
  token: string | undefined,
  memoryId: string,
  query: unknown = {},
) {
  const { auth } = await withAuth(token);
  const options = parseContract(getMemoryQuerySchema, query ?? {});
  return getMemory(getDatabaseClient(), auth, memoryId, options);
}

export async function transportListMemories(token: string | undefined, query: unknown) {
  const { auth } = await withAuth(token);
  return listMemories(getDatabaseClient(), auth, query);
}

export async function transportSearchMemories(token: string | undefined, body: unknown) {
  const { auth } = await withAuth(token);
  return searchMemories(getDatabaseClient(), auth, (body ?? {}) as SearchInput);
}

export async function transportCorrectMemory(
  token: string | undefined,
  memoryId: string,
  body: unknown,
  requestId?: string,
) {
  const { auth } = await withAuth(token);
  return correctMemory(
    getDatabaseClient(),
    auth,
    memoryId,
    (body ?? {}) as CorrectMemoryInput,
    requestId,
  );
}

export async function transportDeleteMemory(
  token: string | undefined,
  memoryId: string,
  requestId?: string,
) {
  const { auth } = await withAuth(token);
  return deleteMemory(getDatabaseClient(), auth, memoryId, requestId);
}

export async function transportRevisionHistory(token: string | undefined, memoryId: string) {
  const { auth } = await withAuth(token);
  return getRevisionHistory(getDatabaseClient(), auth, memoryId);
}

export async function transportUpsertEmbedding(
  token: string | undefined,
  memoryId: string,
  body: unknown,
  requestId?: string,
) {
  const { auth } = await withAuth(token);
  await upsertEmbedding(
    getDatabaseClient(),
    auth,
    memoryId,
    (body ?? {}) as UpsertEmbeddingInput,
    requestId,
  );
  return { status: 'ok' as const };
}

export async function transportGenerateEmbedding(
  token: string | undefined,
  memoryId: string,
  body: unknown,
  requestId?: string,
) {
  const { auth } = await withAuth(token);
  const force =
    body && typeof body === 'object' && 'force' in body
      ? Boolean((body as { force?: unknown }).force)
      : false;
  return generateEmbeddingForMemory(getDatabaseClient(), auth, memoryId, {
    force,
    requestId,
  });
}

/** Health helpers used by REST — not business logic. */
export async function transportReadyz(): Promise<boolean> {
  try {
    const prisma = getDatabaseClient();
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
