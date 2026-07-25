import { z } from 'zod';
import {
  SCOPE_TYPES,
  MEMORY_TYPES,
  MEMORY_STATUSES,
  SENSITIVITY_VALUES,
  CANDIDATE_STATUSES,
  HARVEST_RUN_STATUSES,
  SYNC_DIRECTIONS,
  SYNC_STATUSES,
} from './memory-types.js';
import { API_PERMISSIONS } from './permissions.js';
import { ERROR_CODES, ServiceError } from './errors.js';
import { ICARE_LIFECYCLE_STAGES } from './icare.js';
import {
  MAX_CONTENT_BYTES,
  MAX_METADATA_BYTES,
  MAX_METADATA_DEPTH,
  MAX_TITLE_LENGTH,
  MAX_REASON_BYTES,
  MAX_QUERY_TEXT_BYTES,
  MAX_OUTCOME_SUMMARY_LENGTH,
  MAX_LESSON_LENGTH,
  MAX_LESSONS,
  MAX_RELATED_MEMORY_IDS,
  MAX_EMBEDDING_MODEL_LENGTH,
  MAX_CURSOR_LENGTH,
  EMBEDDING_DIMENSIONS,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  EXECUTION_STATUSES,
} from './limits.js';

// ── Primitive enums ────────────────────────────────────────────

export const scopeTypeSchema = z.enum(SCOPE_TYPES);
export const memoryTypeSchema = z.enum(MEMORY_TYPES);
export const memoryStatusSchema = z.enum(MEMORY_STATUSES);
export const sensitivitySchema = z.enum(SENSITIVITY_VALUES);
export const apiPermissionSchema = z.enum(API_PERMISSIONS);
export const icareLifecycleStageSchema = z.enum(ICARE_LIFECYCLE_STAGES);
export const executionStatusSchema = z.enum(EXECUTION_STATUSES);
export const uuidSchema = z.uuid();
const isoDateTimeSchema = z.iso.datetime({ offset: true });

const ERROR_CODE_VALUES = Object.values(ERROR_CODES) as [
  (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
  ...(typeof ERROR_CODES)[keyof typeof ERROR_CODES][],
];

// ── Helpers ────────────────────────────────────────────────────

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function jsonDepth(value: unknown, current = 0): number {
  if (current > MAX_METADATA_DEPTH) return current;
  if (value === null || typeof value !== 'object') return current;
  let maxDepth = current;
  const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  for (const child of children) {
    maxDepth = Math.max(maxDepth, jsonDepth(child, current + 1));
  }
  return maxDepth;
}

function rejectAuthoritativeIdentity(value: object, ctx: z.RefinementCtx): void {
  for (const key of ['tenantId', 'actorId', 'apiKeyId'] as const) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} is not accepted from the client.`,
      });
    }
  }
}

function contentStringSchema(fieldName: string = 'content') {
  return z.string().superRefine((raw, ctx) => {
    const normalized = raw.replace(/\r\n/g, '\n').trim();
    if (normalized.length === 0) {
      ctx.addIssue({ code: 'custom', message: `${fieldName} must not be empty.` });
      return;
    }
    const bytes = utf8ByteLength(normalized);
    if (bytes > MAX_CONTENT_BYTES) {
      ctx.addIssue({
        code: 'custom',
        message: `${fieldName} exceeds the maximum allowed size.`,
      });
    }
  });
}

function boundedStringBytes(maxBytes: number, fieldName: string) {
  return z.string().superRefine((raw, ctx) => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      ctx.addIssue({ code: 'custom', message: `${fieldName} must not be empty.` });
      return;
    }
    if (utf8ByteLength(trimmed) > maxBytes) {
      ctx.addIssue({
        code: 'custom',
        message: `${fieldName} exceeds the maximum allowed size.`,
      });
    }
  });
}

export const embeddingVectorSchema = z.array(z.number().finite()).length(EMBEDDING_DIMENSIONS, {
  message: `Embedding must contain exactly ${EMBEDDING_DIMENSIONS} finite numbers.`,
});

export const embeddingModelSchema = z.string().trim().min(1).max(MAX_EMBEDDING_MODEL_LENGTH);

export const titleSchema = z.string().trim().min(1).max(MAX_TITLE_LENGTH);

export const icareFieldsSchema = z
  .object({
    icareStage: icareLifecycleStageSchema.optional(),
    reasoningChainId: uuidSchema.optional(),
    relatedMemoryIds: z.array(uuidSchema).max(MAX_RELATED_MEMORY_IDS).optional(),
    evaluationTargetMemoryId: uuidSchema.optional(),
    executionStatus: executionStatusSchema.optional(),
    outcomeSummary: z.string().trim().max(MAX_OUTCOME_SUMMARY_LENGTH).optional(),
    lessonsLearned: z
      .array(z.string().trim().min(1).max(MAX_LESSON_LENGTH))
      .max(MAX_LESSONS)
      .optional(),
  })
  .strict();

export const icareMetadataSchema = z
  .object({
    icareStage: icareLifecycleStageSchema,
    reasoningChainId: uuidSchema.optional(),
    relatedMemoryIds: z.array(uuidSchema).max(MAX_RELATED_MEMORY_IDS).optional(),
    evaluationTargetMemoryId: uuidSchema.optional(),
    executionStatus: executionStatusSchema.optional(),
    outcomeSummary: z.string().trim().max(MAX_OUTCOME_SUMMARY_LENGTH).optional(),
    lessonsLearned: z
      .array(z.string().trim().min(1).max(MAX_LESSON_LENGTH))
      .max(MAX_LESSONS)
      .optional(),
  })
  .strict();

export const memoryMetadataSchema = z.unknown().superRefine((value, ctx) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    ctx.addIssue({ code: 'custom', message: 'Metadata must be a JSON object.' });
    return;
  }

  if (utf8ByteLength(JSON.stringify(value)) > MAX_METADATA_BYTES) {
    ctx.addIssue({ code: 'custom', message: 'Metadata exceeds the maximum allowed size.' });
    return;
  }

  if (jsonDepth(value) > MAX_METADATA_DEPTH) {
    ctx.addIssue({ code: 'custom', message: 'Metadata nesting exceeds the maximum depth.' });
    return;
  }

  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, 'title') && record.title !== undefined) {
    const titleResult = titleSchema.safeParse(record.title);
    if (!titleResult.success) {
      ctx.addIssue({ code: 'custom', path: ['title'], message: 'Invalid title.' });
    }
  }

  if (Object.prototype.hasOwnProperty.call(record, 'icare') && record.icare !== undefined) {
    const parsed = icareMetadataSchema.safeParse(record.icare);
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', path: ['icare'], message: 'Invalid ICARE³ metadata.' });
    }
  }
}) as z.ZodType<Record<string, unknown>>;

// ── Auth / identity (response-side) ────────────────────────────

export const credentialScopeSchema = z
  .object({
    scopeType: scopeTypeSchema,
    scopeId: uuidSchema,
    workspaceId: uuidSchema.nullable(),
    projectId: uuidSchema.nullable(),
  })
  .strict();

export const authContextSchema = z
  .object({
    apiKeyId: uuidSchema,
    tenantId: uuidSchema,
    actorId: uuidSchema,
    credentialScope: credentialScopeSchema,
    permissions: z.array(apiPermissionSchema).min(1),
  })
  .strict();

export const whoamiResponseSchema = z
  .object({
    tenantId: uuidSchema,
    actorId: uuidSchema,
    credentialScope: credentialScopeSchema,
    permissions: z.array(apiPermissionSchema).min(1),
  })
  .strict();

// ── Request contracts ──────────────────────────────────────────

const createMemoryBaseSchema = z
  .object({
    scopeType: scopeTypeSchema,
    workspaceId: uuidSchema.optional().nullable(),
    projectId: uuidSchema.optional().nullable(),
    memoryType: memoryTypeSchema,
    title: titleSchema.optional(),
    content: contentStringSchema('content'),
    importance: z.number().finite().min(0).max(1).optional(),
    confidence: z.number().finite().min(0).max(1).optional(),
    sensitivity: sensitivitySchema.optional(),
    validFrom: isoDateTimeSchema.optional(),
    validUntil: isoDateTimeSchema.nullable().optional(),
    sourceArtifactId: uuidSchema.optional().nullable(),
    metadata: memoryMetadataSchema.optional(),
    embedding: embeddingVectorSchema.optional(),
    embeddingModel: embeddingModelSchema.optional(),
    embeddingDimensions: z.literal(EMBEDDING_DIMENSIONS).optional(),
    icareStage: icareLifecycleStageSchema.optional(),
    reasoningChainId: uuidSchema.optional(),
    relatedMemoryIds: z.array(uuidSchema).max(MAX_RELATED_MEMORY_IDS).optional(),
    evaluationTargetMemoryId: uuidSchema.optional(),
    executionStatus: executionStatusSchema.optional(),
    outcomeSummary: z.string().trim().max(MAX_OUTCOME_SUMMARY_LENGTH).optional(),
    lessonsLearned: z
      .array(z.string().trim().min(1).max(MAX_LESSON_LENGTH))
      .max(MAX_LESSONS)
      .optional(),
  })
  .strict();

export const createMemoryRequestSchema = createMemoryBaseSchema.superRefine((value, ctx) => {
  rejectAuthoritativeIdentity(value, ctx);
});

export const correctMemoryRequestSchema = z
  .object({
    title: titleSchema.optional(),
    content: contentStringSchema('content'),
    reason: boundedStringBytes(MAX_REASON_BYTES, 'reason'),
    importance: z.number().finite().min(0).max(1).optional(),
    confidence: z.number().finite().min(0).max(1).optional(),
    sensitivity: sensitivitySchema.optional(),
    validUntil: isoDateTimeSchema.nullable().optional(),
    metadata: memoryMetadataSchema.optional(),
    icareStage: icareLifecycleStageSchema.optional(),
    reasoningChainId: uuidSchema.optional(),
    relatedMemoryIds: z.array(uuidSchema).max(MAX_RELATED_MEMORY_IDS).optional(),
    evaluationTargetMemoryId: uuidSchema.optional(),
    executionStatus: executionStatusSchema.optional(),
    outcomeSummary: z.string().trim().max(MAX_OUTCOME_SUMMARY_LENGTH).optional(),
    lessonsLearned: z
      .array(z.string().trim().min(1).max(MAX_LESSON_LENGTH))
      .max(MAX_LESSONS)
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    rejectAuthoritativeIdentity(value, ctx);
  });

export const searchMemoryRequestSchema = z
  .object({
    scopeType: scopeTypeSchema,
    workspaceId: uuidSchema.optional().nullable(),
    projectId: uuidSchema.optional().nullable(),
    queryText: boundedStringBytes(MAX_QUERY_TEXT_BYTES, 'queryText').optional(),
    queryEmbedding: embeddingVectorSchema.optional(),
    memoryTypes: z.array(memoryTypeSchema).max(MEMORY_TYPES.length).optional(),
    sensitivities: z.array(sensitivitySchema).max(SENSITIVITY_VALUES.length).optional(),
    icareStages: z.array(icareLifecycleStageSchema).max(ICARE_LIFECYCLE_STAGES.length).optional(),
    reasoningChainId: uuidSchema.optional(),
    sourceArtifactId: uuidSchema.optional(),
    limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).optional(),
    minimumScore: z.number().finite().min(0).max(1).optional(),
    updatedAfter: isoDateTimeSchema.optional(),
    updatedBefore: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    rejectAuthoritativeIdentity(value, ctx);
    if (!value.queryText && !value.queryEmbedding) {
      ctx.addIssue({
        code: 'custom',
        message: 'At least one of queryText or queryEmbedding is required.',
      });
    }
  });

export const listMemoriesQuerySchema = z
  .object({
    scopeType: scopeTypeSchema.optional(),
    workspaceId: uuidSchema.optional(),
    projectId: uuidSchema.optional(),
    memoryType: memoryTypeSchema.optional(),
    status: memoryStatusSchema.optional(),
    sensitivity: sensitivitySchema.optional(),
    actorId: uuidSchema.optional(),
    icareStage: icareLifecycleStageSchema.optional(),
    reasoningChainId: uuidSchema.optional(),
    sourceArtifactId: uuidSchema.optional(),
    updatedAfter: isoDateTimeSchema.optional(),
    updatedBefore: isoDateTimeSchema.optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
    cursor: z.string().min(1).max(MAX_CURSOR_LENGTH).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Object.prototype.hasOwnProperty.call(value, 'tenantId')) {
      ctx.addIssue({
        code: 'custom',
        path: ['tenantId'],
        message: 'tenantId is not accepted from the client.',
      });
    }
  });

export const getMemoryQuerySchema = z
  .object({
    includeDeleted: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        if (typeof value === 'boolean') return value;
        return value === 'true';
      }),
  })
  .strict();

export const memoryIdParamsSchema = z
  .object({
    memoryId: uuidSchema,
  })
  .strict();

export const upsertEmbeddingRequestSchema = z
  .object({
    embedding: embeddingVectorSchema,
    embeddingModel: embeddingModelSchema.optional(),
    embeddingDimensions: z.literal(EMBEDDING_DIMENSIONS).optional(),
    provider: z.string().trim().min(1).max(128).optional(),
    modelVersion: z.string().trim().min(1).max(128).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    rejectAuthoritativeIdentity(value, ctx);
  });

export const cursorDataSchema = z
  .object({
    updatedAt: isoDateTimeSchema,
    id: uuidSchema,
  })
  .strict();

// ── Response contracts ─────────────────────────────────────────

export const memoryRecordSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    workspaceId: uuidSchema.nullable(),
    projectId: uuidSchema.nullable(),
    actorId: uuidSchema.nullable(),
    sourceArtifactId: uuidSchema.nullable(),
    scopeType: scopeTypeSchema,
    scopeId: uuidSchema,
    memoryType: memoryTypeSchema,
    status: memoryStatusSchema,
    content: z.string(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    importance: z.number().finite(),
    confidence: z.number().finite(),
    sensitivity: sensitivitySchema,
    validFrom: z.union([z.date(), isoDateTimeSchema]),
    validUntil: z.union([z.date(), isoDateTimeSchema]).nullable(),
    supersededById: uuidSchema.nullable(),
    metadata: memoryMetadataSchema,
    createdAt: z.union([z.date(), isoDateTimeSchema]),
    updatedAt: z.union([z.date(), isoDateTimeSchema]),
    deletedAt: z.union([z.date(), isoDateTimeSchema]).nullable(),
  })
  .strict();

export const memoryRevisionSchema = z
  .object({
    id: uuidSchema,
    tenantId: uuidSchema,
    memoryId: uuidSchema,
    revisionNumber: z.number().int().positive(),
    content: z.string(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    reason: z.string().nullable(),
    createdByActorId: uuidSchema.nullable(),
    createdAt: z.union([z.date(), isoDateTimeSchema]),
  })
  .strict();

export const listMemoriesResponseSchema = z
  .object({
    items: z.array(memoryRecordSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

export const searchExplanationSchema = z
  .object({
    matchedScope: z
      .object({
        scopeType: scopeTypeSchema,
        scopeId: uuidSchema,
      })
      .strict(),
    components: z
      .object({
        vectorSimilarity: z.number().finite().optional(),
        keywordScore: z.number().finite(),
        importance: z.number().finite(),
        confidence: z.number().finite(),
        recency: z.number().finite(),
      })
      .strict(),
    weights: z.record(z.string(), z.number().finite()),
    finalScore: z.number().finite(),
    reasons: z.array(z.string()),
  })
  .strict();

export const searchResultItemSchema = z
  .object({
    memory: memoryRecordSchema,
    revisionNumber: z.number().int().positive(),
    explanation: searchExplanationSchema,
  })
  .strict();

export const correctMemoryResponseSchema = z
  .object({
    id: uuidSchema,
    revisionNumber: z.number().int().positive(),
    embeddingInvalidated: z.boolean(),
  })
  .strict();

export const deleteMemoryResponseSchema = z
  .object({
    alreadyDeleted: z.boolean(),
  })
  .strict();

export const upsertEmbeddingResponseSchema = z
  .object({
    status: z.literal('ok'),
  })
  .strict();

export const generateEmbeddingRequestSchema = z
  .object({
    force: z.boolean().default(false),
  })
  .strict();

export const generateEmbeddingResponseSchema = z
  .object({
    memoryId: uuidSchema,
    provider: z.literal('amazon-bedrock'),
    modelId: embeddingModelSchema,
    dimensions: z.literal(EMBEDDING_DIMENSIONS),
    normalized: z.literal(true),
    inputTokenCount: z.number().int().nullable(),
    generated: z.boolean(),
    reused: z.boolean(),
  })
  .strict();

export const errorBodySchema = z
  .object({
    error: z
      .object({
        code: z.enum(ERROR_CODE_VALUES),
        message: z.string().min(1),
        requestId: z.string().min(1),
      })
      .strict(),
  })
  .strict();

// ── MCP tool shapes (thin; full validation via request schemas) ─

export const createMemoryToolShape = {
  scopeType: scopeTypeSchema,
  workspaceId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  memoryType: memoryTypeSchema,
  title: titleSchema.optional(),
  content: z.string().min(1),
  importance: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  sensitivity: sensitivitySchema.optional(),
  sourceArtifactId: uuidSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  embedding: embeddingVectorSchema.optional(),
  embeddingModel: embeddingModelSchema.optional(),
  icareStage: icareLifecycleStageSchema.optional(),
  reasoningChainId: uuidSchema.optional(),
  relatedMemoryIds: z.array(uuidSchema).max(MAX_RELATED_MEMORY_IDS).optional(),
  evaluationTargetMemoryId: uuidSchema.optional(),
  executionStatus: executionStatusSchema.optional(),
  outcomeSummary: z.string().optional(),
  lessonsLearned: z.array(z.string()).max(MAX_LESSONS).optional(),
} as const;

export const getMemoryToolShape = {
  memoryId: uuidSchema,
  includeDeleted: z.boolean().optional(),
} as const;

export const listMemoriesToolShape = {
  scopeType: scopeTypeSchema.optional(),
  workspaceId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  memoryType: memoryTypeSchema.optional(),
  status: memoryStatusSchema.optional(),
  sensitivity: sensitivitySchema.optional(),
  actorId: uuidSchema.optional(),
  icareStage: icareLifecycleStageSchema.optional(),
  reasoningChainId: uuidSchema.optional(),
  sourceArtifactId: uuidSchema.optional(),
  updatedAfter: z.string().optional(),
  updatedBefore: z.string().optional(),
  limit: z.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
  cursor: z.string().optional(),
} as const;

export const searchMemoryToolShape = {
  scopeType: scopeTypeSchema,
  workspaceId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  queryText: z.string().optional(),
  queryEmbedding: embeddingVectorSchema.optional(),
  memoryTypes: z.array(memoryTypeSchema).optional(),
  sensitivities: z.array(sensitivitySchema).optional(),
  icareStages: z.array(icareLifecycleStageSchema).optional(),
  reasoningChainId: uuidSchema.optional(),
  sourceArtifactId: uuidSchema.optional(),
  limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).optional(),
  minimumScore: z.number().min(0).max(1).optional(),
  updatedAfter: z.string().optional(),
  updatedBefore: z.string().optional(),
} as const;

export const correctMemoryToolShape = {
  memoryId: uuidSchema,
  title: titleSchema.optional(),
  content: z.string().min(1),
  reason: z.string().min(1),
  importance: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  sensitivity: sensitivitySchema.optional(),
  validUntil: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  icareStage: icareLifecycleStageSchema.optional(),
  reasoningChainId: uuidSchema.optional(),
  relatedMemoryIds: z.array(uuidSchema).max(MAX_RELATED_MEMORY_IDS).optional(),
  evaluationTargetMemoryId: uuidSchema.optional(),
  executionStatus: executionStatusSchema.optional(),
  outcomeSummary: z.string().optional(),
  lessonsLearned: z.array(z.string()).max(MAX_LESSONS).optional(),
} as const;

export const deleteMemoryToolShape = {
  memoryId: uuidSchema,
} as const;

export const historyMemoryToolShape = {
  memoryId: uuidSchema,
} as const;

export const setEmbeddingToolShape = {
  memoryId: uuidSchema,
  embedding: embeddingVectorSchema,
  embeddingModel: embeddingModelSchema.optional(),
  embeddingDimensions: z.literal(EMBEDDING_DIMENSIONS).optional(),
  provider: z.string().optional(),
  modelVersion: z.string().optional(),
} as const;

export const generateEmbeddingToolShape = {
  memoryId: uuidSchema,
  force: z.boolean().optional(),
} as const;

export const candidateStatusSchema = z.enum(CANDIDATE_STATUSES);
export const harvestRunStatusSchema = z.enum(HARVEST_RUN_STATUSES);
export const syncDirectionSchema = z.enum(SYNC_DIRECTIONS);
export const syncStatusSchema = z.enum(SYNC_STATUSES);

export const createHarvestRunRequestSchema = z
  .object({
    scopeType: scopeTypeSchema,
    workspaceId: uuidSchema.optional(),
    projectId: uuidSchema.optional(),
    sourceText: contentStringSchema('sourceText'),
    sourceType: z.enum(['UPLOAD', 'HARVEST', 'DOCUMENT', 'DRIVE', 'MANUAL']).default('UPLOAD'),
    sourceUri: z.string().trim().max(2048).optional(),
    title: titleSchema.optional(),
    reasoningChainId: uuidSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    rejectAuthoritativeIdentity(value, ctx);
    if (value.scopeType === 'TENANT' && (value.workspaceId || value.projectId)) {
      ctx.addIssue({
        code: 'custom',
        message: 'TENANT scope must not include workspaceId or projectId.',
      });
    }
    if (value.scopeType === 'WORKSPACE' && !value.workspaceId) {
      ctx.addIssue({ code: 'custom', path: ['workspaceId'], message: 'workspaceId is required.' });
    }
    if (value.scopeType === 'WORKSPACE' && value.projectId) {
      ctx.addIssue({
        code: 'custom',
        path: ['projectId'],
        message: 'WORKSPACE scope must not include projectId.',
      });
    }
    if (value.scopeType === 'PROJECT' && (!value.workspaceId || !value.projectId)) {
      ctx.addIssue({
        code: 'custom',
        message: 'PROJECT scope requires workspaceId and projectId.',
      });
    }
  });

export const listCandidatesQuerySchema = z
  .object({
    harvestRunId: uuidSchema.optional(),
    status: candidateStatusSchema.optional(),
    scopeType: scopeTypeSchema.optional(),
    workspaceId: uuidSchema.optional(),
    projectId: uuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
  })
  .strict();

export const candidateIdParamsSchema = z
  .object({
    candidateId: uuidSchema,
  })
  .strict();

export const harvestRunIdParamsSchema = z
  .object({
    runId: uuidSchema,
  })
  .strict();

export const approveCandidateRequestSchema = z
  .object({
    reason: boundedStringBytes(MAX_REASON_BYTES, 'reason').optional(),
  })
  .strict();

export const rejectCandidateRequestSchema = z
  .object({
    reason: boundedStringBytes(MAX_REASON_BYTES, 'reason'),
  })
  .strict();

export const createContextPackageRequestSchema = z
  .object({
    scopeType: scopeTypeSchema,
    workspaceId: uuidSchema.optional(),
    projectId: uuidSchema.optional(),
    memoryTypes: z.array(memoryTypeSchema).max(MEMORY_TYPES.length).optional(),
    limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).optional(),
    queryText: z.string().optional(),
    reasoningChainId: uuidSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    rejectAuthoritativeIdentity(value, ctx);
  });

export const publishArtifactRequestSchema = z
  .object({
    scopeType: scopeTypeSchema,
    workspaceId: uuidSchema.optional(),
    projectId: uuidSchema.optional(),
    artifactType: z.string().trim().min(1).max(128).default('INTELLIGENCE_BRIEF'),
    title: titleSchema,
    content: contentStringSchema('content'),
    sourceMemoryIds: z.array(uuidSchema).max(MAX_RELATED_MEMORY_IDS).default([]),
    sourceRevisionIds: z.array(uuidSchema).max(MAX_RELATED_MEMORY_IDS).default([]),
    provider: z
      .enum(['stub', 'google-drive', 'microsoft-onedrive', 'microsoft-sharepoint'])
      .default('stub'),
    parentFolderId: z.string().trim().max(512).optional(),
    driveId: z.string().trim().max(512).optional(),
    siteId: z.string().trim().max(512).optional(),
    syncDirection: syncDirectionSchema.default('BIDIRECTIONAL_REVIEWED'),
    reasoningChainId: uuidSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    rejectAuthoritativeIdentity(value, ctx);
  });

export const publishedArtifactIdParamsSchema = z
  .object({
    artifactId: uuidSchema,
  })
  .strict();

export const republishArtifactRequestSchema = z
  .object({
    content: contentStringSchema('content'),
    reasoningChainId: uuidSchema.optional(),
  })
  .strict();

export const harvestRunToolShape = {
  scopeType: scopeTypeSchema,
  workspaceId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  sourceText: z.string().min(1),
  sourceType: z.enum(['UPLOAD', 'HARVEST', 'DOCUMENT', 'DRIVE', 'MANUAL']).optional(),
  title: titleSchema.optional(),
} as const;

export const listCandidatesToolShape = {
  harvestRunId: uuidSchema.optional(),
  status: candidateStatusSchema.optional(),
  limit: z.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
} as const;

export const getCandidateToolShape = {
  candidateId: uuidSchema,
} as const;

export const approveCandidateToolShape = {
  candidateId: uuidSchema,
  reason: z.string().optional(),
} as const;

export const rejectCandidateToolShape = {
  candidateId: uuidSchema,
  reason: z.string().min(1),
} as const;

export const contextPackageToolShape = {
  scopeType: scopeTypeSchema,
  workspaceId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  queryText: z.string().optional(),
  limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).optional(),
} as const;

export const publishArtifactToolShape = {
  scopeType: scopeTypeSchema,
  workspaceId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  title: titleSchema,
  content: z.string().min(1),
  sourceMemoryIds: z.array(uuidSchema).optional(),
  provider: z
    .enum(['stub', 'google-drive', 'microsoft-onedrive', 'microsoft-sharepoint'])
    .optional(),
  syncDirection: syncDirectionSchema.optional(),
  driveId: z.string().optional(),
  siteId: z.string().optional(),
} as const;

export const syncArtifactToolShape = {
  artifactId: uuidSchema,
} as const;

// ── Inferred types ─────────────────────────────────────────────

export type CreateMemoryRequest = z.infer<typeof createMemoryRequestSchema>;
export type CorrectMemoryRequest = z.infer<typeof correctMemoryRequestSchema>;
export type SearchMemoryRequest = z.infer<typeof searchMemoryRequestSchema>;
export type ListMemoriesQuery = z.infer<typeof listMemoriesQuerySchema>;
export type UpsertEmbeddingRequest = z.infer<typeof upsertEmbeddingRequestSchema>;
export type GenerateEmbeddingRequest = z.infer<typeof generateEmbeddingRequestSchema>;
export type GenerateEmbeddingResponse = z.infer<typeof generateEmbeddingResponseSchema>;
export type WhoamiResponse = z.infer<typeof whoamiResponseSchema>;
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;
export type MemoryRevision = z.infer<typeof memoryRevisionSchema>;
export type SearchResultItemContract = z.infer<typeof searchResultItemSchema>;
export type ErrorBody = z.infer<typeof errorBodySchema>;
export type IcareMetadataInput = z.infer<typeof icareMetadataSchema>;

// ── Parse helpers ──────────────────────────────────────────────

export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'request';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

/** Normalized validation failure — avoids leaking raw Zod internals. */
export function parseContract<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ServiceError(
      ERROR_CODES.VALIDATION_ERROR,
      `Validation failed: ${formatZodIssues(result.error)}`,
      400,
    );
  }
  return result.data;
}

export const paginationDefaults = {
  listLimit: DEFAULT_LIST_LIMIT,
  maxListLimit: MAX_LIST_LIMIT,
  searchLimit: DEFAULT_SEARCH_LIMIT,
  maxSearchLimit: MAX_SEARCH_LIMIT,
} as const;
