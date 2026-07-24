import type { AuthContext } from '@questoros-memory/memory-core';
import { hashApiKey, parseApiKey, ServiceError, ERROR_CODES } from '@questoros-memory/memory-core';
import { lookupApiKey, validateApiKeyStatus } from '@questoros-memory/database';
import type { PrismaClient } from '@prisma/client';

export interface AuthenticateResult {
  authContext: AuthContext;
  keyPrefix: string;
}

export async function authenticate(
  prisma: PrismaClient,
  token: string | undefined,
): Promise<AuthenticateResult> {
  if (!token) {
    throw new ServiceError(ERROR_CODES.AUTH_REQUIRED, 'Authorization header is required.', 401);
  }

  const parsed = parseApiKey(token);
  if (!parsed) {
    throw new ServiceError(ERROR_CODES.AUTH_INVALID, 'Invalid API key format.', 401);
  }

  const hash = hashApiKey(token);
  const stored = await lookupApiKey(prisma, hash);

  if (!stored) {
    throw new ServiceError(ERROR_CODES.AUTH_INVALID, 'Invalid API key.', 401);
  }

  const authContext = validateApiKeyStatus(stored);
  if (!authContext) {
    if (stored.status !== 'ACTIVE') {
      throw new ServiceError(ERROR_CODES.AUTH_REVOKED, 'API key has been revoked.', 401);
    }
    if (stored.tenantStatus !== 'ACTIVE') {
      throw new ServiceError(ERROR_CODES.AUTH_INVALID, 'Invalid API key.', 401);
    }
    if (stored.expiresAt && new Date() > stored.expiresAt) {
      throw new ServiceError(ERROR_CODES.AUTH_EXPIRED, 'API key has expired.', 401);
    }
    throw new ServiceError(ERROR_CODES.AUTH_INVALID, 'Invalid API key.', 401);
  }

  return { authContext, keyPrefix: stored.keyPrefix };
}
