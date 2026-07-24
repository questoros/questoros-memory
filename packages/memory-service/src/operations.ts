import type { PrismaClient } from '@prisma/client';
import type {
  AuthContext,
  SensitivityValue,
  ApiPermission,
  IcareLifecycleStage,
} from '@questoros-memory/memory-core';
import {
  ServiceError,
  ERROR_CODES,
  computeKeywordScore,
  clampVectorSimilarity,
  computeRecency,
  computeFinalScore,
  buildReasons,
  encodeCursor,
  decodeCursor,
  hasPermission,
  VECTOR_WEIGHTS,
  NO_VECTOR_WEIGHTS,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  DEFAULT_EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  mergeMemoryMetadata,
  collectRelatedMemoryIds,
  parseContract,
  createMemoryRequestSchema,
  correctMemoryRequestSchema,
  searchMemoryRequestSchema,
  listMemoriesQuerySchema,
  memoryIdParamsSchema,
  upsertEmbeddingRequestSchema,
} from '@questoros-memory/memory-core';
import { withTransaction } from '@questoros-memory/database';
import { normalizeContent, hashContent, validateMetadata, validateEmbedding } from './content.js';
import { resolveRequestedScope, enforceScope, enforceMemoryScope } from './scope.js';
import type { RequestedScope } from './scope.js';
import * as repo from '@questoros-memory/database';

const DEFAULT_SENSITIVITY: SensitivityValue = 'STANDARD';

// ── Create Memory ──────────────────────────────────────────────

export interface CreateMemoryInput {
  scopeType: string;
  workspaceId?: string | null;
  projectId?: string | null;
  memoryType: string;
  title?: string;
  content: string;
  importance?: number;
  confidence?: number;
  sensitivity?: string;
  validFrom?: Date | string;
  validUntil?: Date | string | null;
  sourceArtifactId?: string | null;
  metadata?: Record<string, unknown>;
  embedding?: number[];
  embeddingModel?: string;
  embeddingDimensions?: number;
  icareStage?: IcareLifecycleStage;
  reasoningChainId?: string;
  relatedMemoryIds?: string[];
  evaluationTargetMemoryId?: string;
  executionStatus?: string;
  outcomeSummary?: string;
  lessonsLearned?: string[];
}

export interface CreateMemoryResult {
  memory: repo.MemoryRow;
  revision: repo.RevisionRow;
}

export async function createMemory(
  prisma: PrismaClient,
  auth: AuthContext,
  rawInput: CreateMemoryInput | Record<string, unknown>,
  requestId?: string,
): Promise<CreateMemoryResult> {
  const input = parseContract(createMemoryRequestSchema, normalizeDates(rawInput));
  const requestedScope = resolveRequestedScope(input.scopeType, input.workspaceId, input.projectId);
  enforceScope(auth.credentialScope, requestedScope);
  hasPermissionCheck(auth, 'memory:write');

  const normalizedContent = normalizeContent(input.content);
  const contentHash = hashContent(normalizedContent);
  const metadata = buildValidatedMetadata(input);
  await assertRelatedMemoriesAccessible(prisma, auth, collectRelatedMemoryIds(input));

  const importance = input.importance ?? 0.5;
  const confidence = input.confidence ?? 1.0;
  const sensitivity = input.sensitivity ?? DEFAULT_SENSITIVITY;
  const validFrom = input.validFrom ? new Date(input.validFrom) : new Date();
  const validUntil =
    input.validUntil === undefined
      ? null
      : input.validUntil === null
        ? null
        : new Date(input.validUntil);
  const scopeId = getScopeId(requestedScope, auth.tenantId);

  return await withTransaction(
    prisma,
    async (tx) => {
      const existing = await repo.findActiveMemoryByContentHash(
        tx,
        auth.tenantId,
        requestedScope.scopeType,
        scopeId,
        input.memoryType,
        contentHash,
      );

      if (existing) {
        throw new ServiceError(
          ERROR_CODES.MEMORY_DUPLICATE,
          'An active memory with identical content already exists.',
          409,
        );
      }

      const memory = await repo.insertMemory(tx, {
        tenantId: auth.tenantId,
        actorId: auth.actorId,
        workspaceId: requestedScope.workspaceId,
        projectId: requestedScope.projectId,
        scopeType: requestedScope.scopeType,
        scopeId,
        memoryType: input.memoryType,
        content: normalizedContent,
        contentHash,
        importance,
        confidence,
        sensitivity,
        validFrom,
        validUntil,
        sourceArtifactId: input.sourceArtifactId ?? null,
        metadata,
      });

      const revision = await repo.insertRevision(tx, {
        tenantId: auth.tenantId,
        memoryId: memory.id,
        revisionNumber: 1,
        content: normalizedContent,
        contentHash,
        reason: 'Initial creation',
        createdByActorId: auth.actorId,
      });

      if (input.embedding) {
        validateEmbedding(input.embedding);
        await repo.upsertEmbedding(tx, {
          tenantId: auth.tenantId,
          memoryId: memory.id,
          scopeType: requestedScope.scopeType,
          scopeId,
          embeddingModel: input.embeddingModel ?? DEFAULT_EMBEDDING_MODEL,
          embeddingDimensions: EMBEDDING_DIMENSIONS,
          embedding: input.embedding,
        });
      }

      await repo.insertAuditEvent(tx, {
        tenantId: auth.tenantId,
        workspaceId: requestedScope.workspaceId,
        projectId: requestedScope.projectId,
        actorId: auth.actorId,
        memoryId: memory.id,
        action: 'CREATE',
        outcome: 'SUCCESS',
        requestId: requestId ?? null,
        reason: null,
        metadata: {},
      });

      return { memory, revision };
    },
    'createMemory',
  );
}

// ── Get Memory ─────────────────────────────────────────────────

export interface GetMemoryOptions {
  includeDeleted?: boolean;
}

export async function getMemory(
  prisma: PrismaClient,
  auth: AuthContext,
  memoryId: string,
  options?: GetMemoryOptions,
): Promise<repo.MemoryRow> {
  hasPermissionCheck(auth, 'memory:read');
  parseContract(memoryIdParamsSchema, { memoryId });

  const memory = await repo.getMemory(prisma, auth.tenantId, memoryId, options?.includeDeleted);

  if (!memory) {
    throw new ServiceError(ERROR_CODES.MEMORY_NOT_FOUND, 'Memory not found.', 404);
  }

  enforceMemoryScope(
    auth.credentialScope,
    memory.scopeType,
    memory.scopeId,
    memory.workspaceId,
    memory.projectId,
  );

  return memory;
}

// ── List Memories ──────────────────────────────────────────────

export interface ListMemoriesInput {
  scopeType?: string;
  workspaceId?: string | null;
  projectId?: string | null;
  memoryType?: string;
  status?: string;
  sensitivity?: string;
  actorId?: string;
  icareStage?: IcareLifecycleStage;
  reasoningChainId?: string;
  sourceArtifactId?: string;
  updatedAfter?: Date | string;
  updatedBefore?: Date | string;
  limit?: number;
  cursor?: string;
}

export interface ListMemoriesResult {
  items: repo.MemoryRow[];
  nextCursor: string | null;
}

export async function listMemories(
  prisma: PrismaClient,
  auth: AuthContext,
  rawInput: unknown,
): Promise<ListMemoriesResult> {
  hasPermissionCheck(auth, 'memory:read');
  const input = parseContract(
    listMemoriesQuerySchema,
    normalizeListQuery((rawInput ?? {}) as ListMemoriesInput | Record<string, unknown>),
  );

  const limit = Math.min(input.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const status = input.status ?? 'ACTIVE';

  let parsedCursor: { updatedAt: string; id: string } | null = null;
  if (input.cursor) {
    try {
      parsedCursor = decodeCursor(input.cursor);
    } catch {
      throw new ServiceError(ERROR_CODES.INVALID_CURSOR, 'Invalid cursor format.', 400);
    }
  }

  const requestedScope = input.scopeType
    ? resolveRequestedScope(input.scopeType, input.workspaceId, input.projectId)
    : null;

  if (requestedScope) {
    enforceScope(auth.credentialScope, requestedScope);
  }

  // Hierarchical defaults when the client does not pass an explicit scope filter:
  // - PROJECT credential → memories in that project
  // - WORKSPACE credential → workspace + project memories in that workspace
  // - TENANT credential → all memories in the tenant
  // Explicit scopeType narrows; it never widens past credential authority.
  let filterScopeType: string | undefined;
  let filterWorkspaceId: string | null | undefined;
  let filterProjectId: string | null | undefined;

  if (requestedScope) {
    filterScopeType = requestedScope.scopeType;
    filterWorkspaceId = requestedScope.workspaceId;
    filterProjectId = requestedScope.projectId;
  } else if (auth.credentialScope.scopeType === 'PROJECT') {
    filterWorkspaceId = auth.credentialScope.workspaceId;
    filterProjectId = auth.credentialScope.projectId;
  } else if (auth.credentialScope.scopeType === 'WORKSPACE') {
    filterWorkspaceId = auth.credentialScope.workspaceId;
  }

  // Reasoning-chain filter never expands credential scope.
  const filter: repo.ListMemoriesFilter = {
    tenantId: auth.tenantId,
    scopeType: filterScopeType,
    workspaceId: filterWorkspaceId,
    projectId: filterProjectId,
    memoryType: input.memoryType,
    status,
    sensitivity: input.sensitivity,
    actorId: input.actorId,
    icareStage: input.icareStage,
    reasoningChainId: input.reasoningChainId,
    sourceArtifactId: input.sourceArtifactId,
    updatedAfter: input.updatedAfter ? new Date(input.updatedAfter) : undefined,
    updatedBefore: input.updatedBefore ? new Date(input.updatedBefore) : undefined,
    limit: limit + 1,
  };

  const items = await repo.listMemories(prisma, filter, parsedCursor);

  let nextCursor: string | null = null;
  if (items.length > limit) {
    items.pop();
    const last = items[items.length - 1];
    nextCursor = encodeCursor(last.updatedAt, last.id);
  }

  return { items, nextCursor };
}

// ── Correct Memory ─────────────────────────────────────────────

export interface CorrectMemoryInput {
  title?: string;
  content: string;
  reason: string;
  importance?: number;
  confidence?: number;
  sensitivity?: string;
  validUntil?: Date | string | null;
  metadata?: Record<string, unknown>;
  icareStage?: IcareLifecycleStage;
  reasoningChainId?: string;
  relatedMemoryIds?: string[];
  evaluationTargetMemoryId?: string;
  executionStatus?: string;
  outcomeSummary?: string;
  lessonsLearned?: string[];
}

export interface CorrectMemoryResult {
  memory: repo.MemoryRow;
  revision: repo.RevisionRow;
  embeddingInvalidated: boolean;
}

export async function correctMemory(
  prisma: PrismaClient,
  auth: AuthContext,
  memoryId: string,
  rawInput: CorrectMemoryInput,
  requestId?: string,
): Promise<CorrectMemoryResult> {
  hasPermissionCheck(auth, 'memory:correct');
  parseContract(memoryIdParamsSchema, { memoryId });
  const input = parseContract(correctMemoryRequestSchema, normalizeDates(rawInput));
  await assertRelatedMemoriesAccessible(prisma, auth, collectRelatedMemoryIds(input));

  return await withTransaction(
    prisma,
    async (tx) => {
      const memory = await repo.getMemory(tx, auth.tenantId, memoryId);
      if (!memory) {
        throw new ServiceError(ERROR_CODES.MEMORY_NOT_FOUND, 'Memory not found.', 404);
      }
      if (memory.status === 'DELETED') {
        throw new ServiceError(ERROR_CODES.MEMORY_DELETED, 'Cannot correct a deleted memory.', 400);
      }

      enforceMemoryScope(
        auth.credentialScope,
        memory.scopeType,
        memory.scopeId,
        memory.workspaceId,
        memory.projectId,
      );

      const normalizedContent = normalizeContent(input.content);
      const newContentHash = hashContent(normalizedContent);

      if (newContentHash === memory.contentHash) {
        throw new ServiceError(
          ERROR_CODES.MEMORY_UNCHANGED,
          'Correction content is identical to current content.',
          400,
        );
      }

      const metadata = buildValidatedMetadata({
        title: input.title,
        icareStage: input.icareStage,
        reasoningChainId: input.reasoningChainId,
        relatedMemoryIds: input.relatedMemoryIds,
        evaluationTargetMemoryId: input.evaluationTargetMemoryId,
        executionStatus: input.executionStatus,
        outcomeSummary: input.outcomeSummary,
        lessonsLearned: input.lessonsLearned,
        metadata: {
          ...memory.metadata,
          ...(input.metadata ?? {}),
        },
      });

      const maxRev = await repo.getMaxRevisionNumber(tx, auth.tenantId, memoryId);
      const nextRev = maxRev + 1;

      const updated = await repo.updateMemory(tx, auth.tenantId, memoryId, {
        content: normalizedContent,
        contentHash: newContentHash,
        importance: input.importance,
        confidence: input.confidence,
        sensitivity: input.sensitivity,
        validUntil:
          input.validUntil === undefined
            ? undefined
            : input.validUntil === null
              ? null
              : new Date(input.validUntil),
        metadata,
      });

      const revision = await repo.insertRevision(tx, {
        tenantId: auth.tenantId,
        memoryId,
        revisionNumber: nextRev,
        content: normalizedContent,
        contentHash: newContentHash,
        reason: input.reason,
        createdByActorId: auth.actorId,
      });

      await repo.deleteEmbeddingsForMemory(tx, auth.tenantId, memoryId);

      await repo.insertAuditEvent(tx, {
        tenantId: auth.tenantId,
        workspaceId: memory.workspaceId,
        projectId: memory.projectId,
        actorId: auth.actorId,
        memoryId,
        action: 'CORRECT',
        outcome: 'SUCCESS',
        requestId: requestId ?? null,
        reason: input.reason,
        metadata: {},
      });

      return { memory: updated, revision, embeddingInvalidated: true };
    },
    'correctMemory',
  );
}

// ── Soft Delete Memory ─────────────────────────────────────────

export interface DeleteMemoryResult {
  alreadyDeleted: boolean;
}

export async function deleteMemory(
  prisma: PrismaClient,
  auth: AuthContext,
  memoryId: string,
  requestId?: string,
): Promise<DeleteMemoryResult> {
  hasPermissionCheck(auth, 'memory:delete');
  parseContract(memoryIdParamsSchema, { memoryId });

  return await withTransaction(
    prisma,
    async (tx) => {
      const memory = await repo.getMemory(tx, auth.tenantId, memoryId, true);
      if (!memory) {
        throw new ServiceError(ERROR_CODES.MEMORY_NOT_FOUND, 'Memory not found.', 404);
      }

      enforceMemoryScope(
        auth.credentialScope,
        memory.scopeType,
        memory.scopeId,
        memory.workspaceId,
        memory.projectId,
      );

      if (memory.status === 'DELETED') {
        return { alreadyDeleted: true };
      }

      await repo.softDeleteMemory(tx, auth.tenantId, memoryId);
      await repo.deleteEmbeddingsForMemory(tx, auth.tenantId, memoryId);

      await repo.insertAuditEvent(tx, {
        tenantId: auth.tenantId,
        workspaceId: memory.workspaceId,
        projectId: memory.projectId,
        actorId: auth.actorId,
        memoryId,
        action: 'DELETE',
        outcome: 'SUCCESS',
        requestId: requestId ?? null,
        reason: null,
        metadata: {},
      });

      return { alreadyDeleted: false };
    },
    'deleteMemory',
  );
}

// ── Get Revision History ───────────────────────────────────────

export async function getRevisionHistory(
  prisma: PrismaClient,
  auth: AuthContext,
  memoryId: string,
): Promise<repo.RevisionRow[]> {
  hasPermissionCheck(auth, 'memory:read');
  parseContract(memoryIdParamsSchema, { memoryId });

  const memory = await repo.getMemory(prisma, auth.tenantId, memoryId, true);
  if (!memory) {
    throw new ServiceError(ERROR_CODES.MEMORY_NOT_FOUND, 'Memory not found.', 404);
  }

  enforceMemoryScope(
    auth.credentialScope,
    memory.scopeType,
    memory.scopeId,
    memory.workspaceId,
    memory.projectId,
  );

  return await repo.getRevisions(prisma, auth.tenantId, memoryId);
}

// ── Upsert Embedding ───────────────────────────────────────────

export interface UpsertEmbeddingInput {
  embedding: number[];
  embeddingModel?: string;
  embeddingDimensions?: number;
  provider?: string;
  modelVersion?: string;
}

export async function upsertEmbedding(
  prisma: PrismaClient,
  auth: AuthContext,
  memoryId: string,
  rawInput: UpsertEmbeddingInput,
  requestId?: string,
): Promise<void> {
  hasPermissionCheck(auth, 'memory:embed');
  parseContract(memoryIdParamsSchema, { memoryId });
  const input = parseContract(upsertEmbeddingRequestSchema, rawInput);
  validateEmbedding(input.embedding);

  return await withTransaction(
    prisma,
    async (tx) => {
      const memory = await repo.getMemory(tx, auth.tenantId, memoryId);
      if (!memory) {
        throw new ServiceError(ERROR_CODES.MEMORY_NOT_FOUND, 'Memory not found.', 404);
      }
      if (memory.status === 'DELETED') {
        throw new ServiceError(
          ERROR_CODES.MEMORY_DELETED,
          'Cannot set embedding on a deleted memory.',
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

      await repo.upsertEmbedding(tx, {
        tenantId: auth.tenantId,
        memoryId,
        scopeType: memory.scopeType,
        scopeId: memory.scopeId,
        embeddingModel: input.embeddingModel ?? DEFAULT_EMBEDDING_MODEL,
        embeddingDimensions: EMBEDDING_DIMENSIONS,
        embedding: input.embedding,
      });

      await repo.insertAuditEvent(tx, {
        tenantId: auth.tenantId,
        workspaceId: memory.workspaceId,
        projectId: memory.projectId,
        actorId: auth.actorId,
        memoryId,
        action: 'EMBED',
        outcome: 'SUCCESS',
        requestId: requestId ?? null,
        reason: null,
        metadata: {
          ...(input.provider ? { provider: input.provider } : {}),
          ...(input.modelVersion ? { modelVersion: input.modelVersion } : {}),
        },
      });
    },
    'upsertEmbedding',
  );
}

// ── Search ─────────────────────────────────────────────────────

export interface SearchInput {
  scopeType: string;
  workspaceId?: string | null;
  projectId?: string | null;
  queryText?: string;
  queryEmbedding?: number[];
  memoryTypes?: string[];
  sensitivities?: string[];
  icareStages?: IcareLifecycleStage[];
  reasoningChainId?: string;
  sourceArtifactId?: string;
  limit?: number;
  minimumScore?: number;
  updatedAfter?: Date | string;
  updatedBefore?: Date | string;
}

export interface SearchResultItem {
  memory: repo.MemoryRow;
  revisionNumber: number;
  explanation: {
    matchedScope: { scopeType: string; scopeId: string };
    components: {
      vectorSimilarity?: number;
      keywordScore: number;
      importance: number;
      confidence: number;
      recency: number;
    };
    weights: Record<string, number>;
    finalScore: number;
    reasons: string[];
  };
}

export async function searchMemories(
  prisma: PrismaClient,
  auth: AuthContext,
  rawInput: SearchInput,
): Promise<SearchResultItem[]> {
  hasPermissionCheck(auth, 'memory:read');
  const input = parseContract(searchMemoryRequestSchema, normalizeDates(rawInput));

  const requestedScope = resolveRequestedScope(input.scopeType, input.workspaceId, input.projectId);
  enforceScope(auth.credentialScope, requestedScope);

  const scopeId = getScopeId(requestedScope, auth.tenantId);
  const now = new Date();
  const limit = Math.min(input.limit ?? 20, MAX_LIST_LIMIT);
  const hasVector = !!input.queryEmbedding;

  if (input.queryEmbedding) {
    validateEmbedding(input.queryEmbedding);
  }

  const searchFilter = {
    tenantId: auth.tenantId,
    scopeType: requestedScope.scopeType,
    scopeId,
    memoryTypes: input.memoryTypes,
    sensitivities: input.sensitivities,
    icareStages: input.icareStages,
    reasoningChainId: input.reasoningChainId,
    sourceArtifactId: input.sourceArtifactId,
    updatedAfter: input.updatedAfter ? new Date(input.updatedAfter) : undefined,
    updatedBefore: input.updatedBefore ? new Date(input.updatedBefore) : undefined,
    limit,
  };

  const rows = hasVector
    ? await repo.searchByVector(prisma, {
        ...searchFilter,
        queryEmbedding: input.queryEmbedding!,
        minimumScore: input.minimumScore,
      })
    : await repo.searchByText(prisma, searchFilter);

  const items: SearchResultItem[] = rows.map((row) => {
    const keywordScore = input.queryText ? computeKeywordScore(row.content, input.queryText) : 0;
    const vectorSimilarity =
      row.cosine_distance !== null ? clampVectorSimilarity(row.cosine_distance) : undefined;
    const recency = computeRecency(row.updated_at, now);

    const components = {
      vectorSimilarity,
      keywordScore,
      importance: row.importance,
      confidence: row.confidence,
      recency,
    };

    const finalScore = computeFinalScore(components, hasVector);
    const reasons = buildReasons(components, {
      scopeType: requestedScope.scopeType,
      scopeId,
    });

    const memory: repo.MemoryRow = {
      id: row.id,
      tenantId: row.tenant_id,
      workspaceId: row.workspace_id,
      projectId: row.project_id,
      actorId: row.actor_id,
      sourceArtifactId: row.source_artifact_id,
      scopeType: row.scope_type,
      scopeId: row.scope_id,
      memoryType: row.memory_type,
      status: row.status,
      content: row.content,
      contentHash: row.content_hash,
      importance: row.importance,
      confidence: row.confidence,
      sensitivity: row.sensitivity,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      supersededById: row.superseded_by_id,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };

    return {
      memory,
      revisionNumber: row.revision_number,
      explanation: {
        matchedScope: {
          scopeType: requestedScope.scopeType,
          scopeId,
        },
        components: {
          ...(vectorSimilarity !== undefined ? { vectorSimilarity } : {}),
          keywordScore,
          importance: row.importance,
          confidence: row.confidence,
          recency,
        },
        weights: hasVector ? { ...VECTOR_WEIGHTS } : { ...NO_VECTOR_WEIGHTS },
        finalScore,
        reasons,
      },
    };
  });

  items.sort((a, b) => {
    const scoreDiff = b.explanation.finalScore - a.explanation.finalScore;
    if (scoreDiff !== 0) return scoreDiff;
    const timeDiff = b.memory.updatedAt.getTime() - a.memory.updatedAt.getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.memory.id.localeCompare(a.memory.id);
  });

  return items;
}

// ── Whoami ─────────────────────────────────────────────────────

export interface WhoamiResult {
  tenantId: string;
  actorId: string;
  credentialScope: {
    scopeType: string;
    scopeId: string;
    workspaceId: string | null;
    projectId: string | null;
  };
  permissions: readonly string[];
}

export function whoami(auth: AuthContext): WhoamiResult {
  return {
    tenantId: auth.tenantId,
    actorId: auth.actorId,
    credentialScope: { ...auth.credentialScope },
    permissions: [...auth.permissions],
  };
}

// ── Helpers ────────────────────────────────────────────────────

function hasPermissionCheck(auth: AuthContext, required: string): void {
  if (!hasPermission(auth.permissions, required as ApiPermission)) {
    throw new ServiceError(ERROR_CODES.PERMISSION_DENIED, 'Insufficient permissions.', 403);
  }
}

function getScopeId(scope: RequestedScope, tenantId: string): string {
  if (scope.scopeType === 'TENANT') return tenantId;
  return scope.scopeType === 'PROJECT' ? scope.projectId! : scope.workspaceId!;
}

function toIso(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function normalizeDates<T>(input: T): T {
  const next: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  for (const key of ['validFrom', 'validUntil', 'updatedAfter', 'updatedBefore'] as const) {
    if (key in next) next[key] = toIso(next[key]);
  }
  return next as T;
}

function normalizeListQuery(
  input: ListMemoriesInput | Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...input };
  if ('updatedAfter' in input && input.updatedAfter) {
    next.updatedAfter = toIso(input.updatedAfter);
  }
  if ('updatedBefore' in input && input.updatedBefore) {
    next.updatedBefore = toIso(input.updatedBefore);
  }
  if ('workspaceId' in input && input.workspaceId === null) delete next.workspaceId;
  if ('projectId' in input && input.projectId === null) delete next.projectId;
  return next;
}

function buildValidatedMetadata(fields: {
  title?: string;
  metadata?: Record<string, unknown>;
  icareStage?: IcareLifecycleStage;
  reasoningChainId?: string;
  relatedMemoryIds?: string[];
  evaluationTargetMemoryId?: string;
  executionStatus?: string;
  outcomeSummary?: string;
  lessonsLearned?: string[];
}): Record<string, unknown> {
  try {
    const merged = mergeMemoryMetadata(fields);
    return validateMetadata(merged);
  } catch (error) {
    throw new ServiceError(
      ERROR_CODES.VALIDATION_ERROR,
      error instanceof Error ? error.message : 'Invalid memory metadata.',
      400,
    );
  }
}

async function assertRelatedMemoriesAccessible(
  prisma: PrismaClient,
  auth: AuthContext,
  relatedIds: string[],
): Promise<void> {
  for (const relatedId of relatedIds) {
    const related = await repo.getMemory(prisma, auth.tenantId, relatedId);
    if (!related || related.status === 'DELETED') {
      throw new ServiceError(
        ERROR_CODES.VALIDATION_ERROR,
        'Related memory reference is invalid or inaccessible.',
        400,
      );
    }
    try {
      enforceMemoryScope(
        auth.credentialScope,
        related.scopeType,
        related.scopeId,
        related.workspaceId,
        related.projectId,
      );
    } catch {
      throw new ServiceError(
        ERROR_CODES.VALIDATION_ERROR,
        'Related memory reference is invalid or inaccessible.',
        400,
      );
    }
  }
}
