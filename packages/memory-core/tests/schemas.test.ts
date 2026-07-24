import { describe, it, expect } from 'vitest';
import {
  createMemoryRequestSchema,
  correctMemoryRequestSchema,
  searchMemoryRequestSchema,
  listMemoriesQuerySchema,
  upsertEmbeddingRequestSchema,
  memoryMetadataSchema,
  icareLifecycleStageSchema,
  parseContract,
  formatZodIssues,
} from '../src/schemas.js';
import { ServiceError, ERROR_CODES } from '../src/errors.js';
import { EMBEDDING_DIMENSIONS } from '../src/limits.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const _PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const CHAIN_ID = '44444444-4444-4444-8444-444444444444';
const MEMORY_ID = '55555555-5555-4555-8555-555555555555';

function validEmbedding(): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.01);
}

describe('icareLifecycleStageSchema', () => {
  it('accepts all seven internal lifecycle stages', () => {
    const stages = [
      'ISSUE',
      'CONTEXT',
      'ANALYSIS',
      'RECOMMENDATIONS',
      'RECOMMENDATION_EVALUATION',
      'EXECUTION',
      'EXECUTION_EVALUATION',
    ] as const;

    for (const stage of stages) {
      expect(icareLifecycleStageSchema.safeParse(stage).success).toBe(true);
    }
  });

  it('rejects invalid lifecycle stages', () => {
    expect(icareLifecycleStageSchema.safeParse('EVALUATION').success).toBe(false);
  });
});

describe('createMemoryRequestSchema', () => {
  const base = {
    scopeType: 'TENANT' as const,
    memoryType: 'FACT' as const,
    content: 'A valid memory body.',
  };

  it('accepts ICARE³ lifecycle fields on create', () => {
    const result = createMemoryRequestSchema.safeParse({
      ...base,
      title: 'Issue framing',
      icareStage: 'ISSUE',
      reasoningChainId: CHAIN_ID,
      relatedMemoryIds: [MEMORY_ID],
      outcomeSummary: 'Pending',
      lessonsLearned: ['Capture constraints early'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects client-supplied tenantId and actorId', () => {
    const tenantResult = createMemoryRequestSchema.safeParse({
      ...base,
      tenantId: TENANT_ID,
    });
    expect(tenantResult.success).toBe(false);

    const actorResult = createMemoryRequestSchema.safeParse({
      ...base,
      actorId: TENANT_ID,
    });
    expect(actorResult.success).toBe(false);
  });

  it('rejects empty content', () => {
    expect(createMemoryRequestSchema.safeParse({ ...base, content: '   ' }).success).toBe(false);
  });

  it('allows optional workspaceId at schema layer; service enforces scope IDs', () => {
    expect(
      createMemoryRequestSchema.safeParse({
        ...base,
        scopeType: 'WORKSPACE',
      }).success,
    ).toBe(true);

    expect(
      createMemoryRequestSchema.safeParse({
        ...base,
        scopeType: 'PROJECT',
        workspaceId: WORKSPACE_ID,
      }).success,
    ).toBe(true);
  });
});

describe('correctMemoryRequestSchema', () => {
  it('requires content and reason', () => {
    expect(
      correctMemoryRequestSchema.safeParse({
        content: 'Updated body',
        reason: 'Fix factual error',
        icareStage: 'CONTEXT',
      }).success,
    ).toBe(true);

    expect(
      correctMemoryRequestSchema.safeParse({
        content: 'Updated body',
        reason: '',
      }).success,
    ).toBe(false);
  });
});

describe('searchMemoryRequestSchema', () => {
  it('requires queryText or queryEmbedding', () => {
    expect(
      searchMemoryRequestSchema.safeParse({
        scopeType: 'TENANT',
      }).success,
    ).toBe(false);
  });

  it('accepts lifecycle-stage filters with text query', () => {
    const result = searchMemoryRequestSchema.safeParse({
      scopeType: 'TENANT',
      queryText: 'deployment risk',
      icareStages: ['RECOMMENDATION_EVALUATION', 'EXECUTION_EVALUATION'],
      reasoningChainId: CHAIN_ID,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid embedding length', () => {
    expect(
      searchMemoryRequestSchema.safeParse({
        scopeType: 'TENANT',
        queryEmbedding: [0.1, 0.2],
      }).success,
    ).toBe(false);
  });
});

describe('listMemoriesQuerySchema', () => {
  it('accepts ICARE filters and coerces limit', () => {
    const result = listMemoriesQuerySchema.safeParse({
      icareStage: 'ANALYSIS',
      reasoningChainId: CHAIN_ID,
      limit: '10',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
    }
  });

  it('rejects tenantId from client query', () => {
    expect(listMemoriesQuerySchema.safeParse({ tenantId: TENANT_ID }).success).toBe(false);
  });
});

describe('upsertEmbeddingRequestSchema', () => {
  it('requires exactly EMBEDDING_DIMENSIONS finite numbers', () => {
    expect(
      upsertEmbeddingRequestSchema.safeParse({
        embedding: validEmbedding(),
      }).success,
    ).toBe(true);

    expect(
      upsertEmbeddingRequestSchema.safeParse({
        embedding: validEmbedding().concat([NaN]),
      }).success,
    ).toBe(false);
  });
});

describe('memoryMetadataSchema', () => {
  it('validates nested icare metadata', () => {
    const result = memoryMetadataSchema.safeParse({
      title: 'Valid title',
      icare: {
        icareStage: 'EXECUTION',
        executionStatus: 'IN_PROGRESS',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid icare block', () => {
    expect(
      memoryMetadataSchema.safeParse({
        icare: { icareStage: 'NOT_A_STAGE' },
      }).success,
    ).toBe(false);
  });
});

describe('parseContract', () => {
  it('throws ServiceError with normalized validation message', () => {
    try {
      parseContract(createMemoryRequestSchema, { content: '' });
      expect.fail('Expected parseContract to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      const err = error as ServiceError;
      expect(err.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('Validation failed:');
      expect(err.message).not.toContain('ZodError');
    }
  });
});

describe('formatZodIssues', () => {
  it('formats issue paths without exposing internal types', () => {
    const parsed = createMemoryRequestSchema.safeParse({ content: 'x' });
    if (parsed.success) {
      expect.fail('Expected validation failure');
    }
    const formatted = formatZodIssues(parsed.error);
    expect(formatted).toContain('scopeType');
    expect(formatted).not.toContain('Zod');
  });
});
