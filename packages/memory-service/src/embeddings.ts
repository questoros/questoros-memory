import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '@questoros-memory/memory-core';
import {
  ServiceError,
  ERROR_CODES,
  parseContract,
  memoryIdParamsSchema,
  generateEmbeddingRequestSchema,
  type GenerateEmbeddingResponse,
} from '@questoros-memory/memory-core';
import {
  createEmbeddingProvider,
  loadEmbeddingConfig,
  EmbeddingProviderError,
  type EmbeddingProvider,
  type EmbeddingConfig,
  TITAN_V2_PROVIDER,
} from '@questoros-memory/embedding-provider';
import { withTransaction } from '@questoros-memory/database';
import * as repo from '@questoros-memory/database';
import { enforceMemoryScope } from './scope.js';
import { hasPermission } from '@questoros-memory/memory-core';
import type { ApiPermission } from '@questoros-memory/memory-core';

function hasPermissionCheck(auth: AuthContext, required: string): void {
  if (!hasPermission(auth.permissions, required as ApiPermission)) {
    throw new ServiceError(ERROR_CODES.PERMISSION_DENIED, 'Insufficient permissions.', 403);
  }
}

export function mapEmbeddingProviderError(error: unknown): ServiceError {
  if (error instanceof ServiceError) return error;
  if (error instanceof EmbeddingProviderError) {
    const known = new Set<string>(Object.values(ERROR_CODES));
    const code = known.has(error.code)
      ? (error.code as (typeof ERROR_CODES)[keyof typeof ERROR_CODES])
      : ERROR_CODES.EMBEDDING_PROVIDER_UNAVAILABLE;
    return new ServiceError(code, error.message, error.statusCode);
  }
  return new ServiceError(
    ERROR_CODES.EMBEDDING_PROVIDER_UNAVAILABLE,
    'Embedding provider request failed.',
    503,
  );
}

export interface GenerateEmbeddingOptions {
  force?: boolean;
  requestId?: string;
  provider?: EmbeddingProvider;
  config?: EmbeddingConfig;
}

export async function generateEmbeddingForMemory(
  prisma: PrismaClient,
  auth: AuthContext,
  memoryId: string,
  options: GenerateEmbeddingOptions = {},
): Promise<GenerateEmbeddingResponse> {
  hasPermissionCheck(auth, 'memory:embed');
  parseContract(memoryIdParamsSchema, { memoryId });
  const input = parseContract(generateEmbeddingRequestSchema, {
    force: options.force ?? false,
  });

  const config = options.config ?? loadEmbeddingConfig();
  const memory = await repo.getMemory(prisma, auth.tenantId, memoryId);
  if (!memory) {
    throw new ServiceError(ERROR_CODES.MEMORY_NOT_FOUND, 'Memory not found.', 404);
  }
  if (memory.status === 'DELETED') {
    throw new ServiceError(
      ERROR_CODES.MEMORY_DELETED,
      'Cannot generate embedding for a deleted memory.',
      400,
    );
  }

  enforceMemoryScope(
    auth.credentialScope,
    memory.scopeType,
    memory.scopeId,
    memory.workspaceId,
    memory.projectId,
  );

  const exists = await repo.hasEmbedding(
    prisma,
    auth.tenantId,
    memoryId,
    config.modelId,
    config.dimensions,
  );

  if (exists && !input.force) {
    await repo.insertAuditEvent(prisma, {
      tenantId: auth.tenantId,
      workspaceId: memory.workspaceId,
      projectId: memory.projectId,
      actorId: auth.actorId,
      memoryId,
      action: 'EMBED',
      outcome: 'SUCCESS',
      requestId: options.requestId ?? null,
      reason: null,
      metadata: {
        provider: config.provider,
        modelId: config.modelId,
        dimensions: config.dimensions,
        reused: true,
        generated: false,
      },
    });

    return {
      memoryId,
      provider: TITAN_V2_PROVIDER,
      modelId: config.modelId,
      dimensions: config.dimensions,
      normalized: true,
      inputTokenCount: null,
      generated: false,
      reused: true,
    };
  }

  const provider = options.provider ?? createEmbeddingProvider({ config });

  let result;
  try {
    result = await provider.generate({
      inputText: memory.content,
      modelId: config.modelId,
      dimensions: 1024,
      normalize: true,
    });
  } catch (error) {
    try {
      await repo.insertAuditEvent(prisma, {
        tenantId: auth.tenantId,
        workspaceId: memory.workspaceId,
        projectId: memory.projectId,
        actorId: auth.actorId,
        memoryId,
        action: 'EMBED',
        outcome: 'FAILURE',
        requestId: options.requestId ?? null,
        reason: null,
        metadata: {
          provider: config.provider,
          modelId: config.modelId,
          force: input.force,
        },
      });
    } catch {
      // Audit failure must not mask the provider error.
    }
    throw mapEmbeddingProviderError(error);
  }

  await withTransaction(
    prisma,
    async (tx) => {
      const current = await repo.getMemory(tx, auth.tenantId, memoryId);
      if (!current || current.status === 'DELETED') {
        throw new ServiceError(
          ERROR_CODES.MEMORY_DELETED,
          'Cannot generate embedding for a deleted memory.',
          400,
        );
      }

      await repo.upsertEmbedding(tx, {
        tenantId: auth.tenantId,
        memoryId,
        scopeType: current.scopeType,
        scopeId: current.scopeId,
        embeddingModel: result.modelId,
        embeddingDimensions: result.dimensions,
        embedding: [...result.embedding],
      });

      await repo.insertAuditEvent(tx, {
        tenantId: auth.tenantId,
        workspaceId: current.workspaceId,
        projectId: current.projectId,
        actorId: auth.actorId,
        memoryId,
        action: 'EMBED',
        outcome: 'SUCCESS',
        requestId: options.requestId ?? null,
        reason: null,
        metadata: {
          provider: result.provider,
          modelId: result.modelId,
          dimensions: result.dimensions,
          normalized: result.normalized,
          inputTokenCount: result.inputTokenCount,
          reused: false,
          generated: true,
          force: input.force,
        },
      });
    },
    'generateEmbeddingForMemory',
  );

  return {
    memoryId,
    provider: result.provider,
    modelId: result.modelId,
    dimensions: result.dimensions,
    normalized: true,
    inputTokenCount: result.inputTokenCount,
    generated: true,
    reused: false,
  };
}

/** Best-effort post-commit auto embedding. Never throws to callers of create/correct. */
export async function maybeAutoGenerateEmbedding(
  prisma: PrismaClient,
  auth: AuthContext,
  memoryId: string,
  requestId?: string,
  options: { provider?: EmbeddingProvider; config?: EmbeddingConfig } = {},
): Promise<void> {
  const config = options.config ?? loadEmbeddingConfig();
  if (!config.autoOnWrite) {
    return;
  }

  try {
    await generateEmbeddingForMemory(prisma, auth, memoryId, {
      force: false,
      requestId,
      provider: options.provider,
      config,
    });
  } catch {
    // Provider failure must not roll back the memory write. Failure is audited inside generate.
  }
}
