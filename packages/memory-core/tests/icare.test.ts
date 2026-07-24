import { describe, it, expect } from 'vitest';
import {
  ICARE_LIFECYCLE_STAGES,
  ICARE_PUBLIC_STAGE_LABELS,
  ICARE_PUBLIC_LIFECYCLE,
  ICARE_PRODUCT_NAME,
  ICARE_PRODUCT_TAGLINE,
  ICARE_ELEVATOR_PITCH,
  ICARE_METADATA_KEY,
  TITLE_METADATA_KEY,
  isIcareLifecycleStage,
  getIcarePublicLabel,
  extractIcareMetadata,
  extractTitle,
  mergeMemoryMetadata,
  collectRelatedMemoryIds,
} from '../src/icare.js';

const CHAIN_ID = '11111111-1111-4111-8111-111111111111';
const RELATED_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_ID = '33333333-3333-4333-8333-333333333333';

describe('ICARE³ product constants', () => {
  it('exposes canonical product framing', () => {
    expect(ICARE_PRODUCT_NAME).toBe('ICARE³™');
    expect(ICARE_PRODUCT_TAGLINE).toBe('Agentic Persistent Memory for Organizational Intelligence');
    expect(ICARE_ELEVATOR_PITCH).toContain('agentic memory');
    expect(ICARE_PUBLIC_LIFECYCLE).toBe(
      'Issue → Context → Analysis → Recommendations → Evaluation → Execution → Evaluation',
    );
  });
});

describe('ICARE_LIFECYCLE_STAGES', () => {
  it('contains exactly seven internal lifecycle identifiers', () => {
    expect(ICARE_LIFECYCLE_STAGES).toEqual([
      'ISSUE',
      'CONTEXT',
      'ANALYSIS',
      'RECOMMENDATIONS',
      'RECOMMENDATION_EVALUATION',
      'EXECUTION',
      'EXECUTION_EVALUATION',
    ]);
  });

  it('distinguishes the two evaluation stages internally', () => {
    expect(ICARE_LIFECYCLE_STAGES).toContain('RECOMMENDATION_EVALUATION');
    expect(ICARE_LIFECYCLE_STAGES).toContain('EXECUTION_EVALUATION');
    expect(ICARE_LIFECYCLE_STAGES.indexOf('RECOMMENDATION_EVALUATION')).not.toBe(
      ICARE_LIFECYCLE_STAGES.indexOf('EXECUTION_EVALUATION'),
    );
  });
});

describe('ICARE_PUBLIC_STAGE_LABELS', () => {
  it('maps both evaluation stages to the public label Evaluation', () => {
    expect(ICARE_PUBLIC_STAGE_LABELS.RECOMMENDATION_EVALUATION).toBe('Evaluation');
    expect(ICARE_PUBLIC_STAGE_LABELS.EXECUTION_EVALUATION).toBe('Evaluation');
  });

  it('provides distinct public labels for non-evaluation stages', () => {
    expect(getIcarePublicLabel('ISSUE')).toBe('Issue');
    expect(getIcarePublicLabel('EXECUTION')).toBe('Execution');
  });
});

describe('isIcareLifecycleStage', () => {
  it('accepts all valid stages', () => {
    for (const stage of ICARE_LIFECYCLE_STAGES) {
      expect(isIcareLifecycleStage(stage)).toBe(true);
    }
  });

  it('rejects invalid stages', () => {
    expect(isIcareLifecycleStage('EVALUATION')).toBe(false);
    expect(isIcareLifecycleStage('')).toBe(false);
    expect(isIcareLifecycleStage(null)).toBe(false);
  });
});

describe('extractIcareMetadata', () => {
  it('returns null when icare block is absent or invalid', () => {
    expect(extractIcareMetadata(null)).toBeNull();
    expect(extractIcareMetadata({})).toBeNull();
    expect(extractIcareMetadata({ icare: { icareStage: 'INVALID' } })).toBeNull();
  });

  it('extracts full ICARE³ metadata including execution fields', () => {
    const metadata = {
      [ICARE_METADATA_KEY]: {
        icareStage: 'EXECUTION_EVALUATION',
        reasoningChainId: CHAIN_ID,
        relatedMemoryIds: [RELATED_ID],
        evaluationTargetMemoryId: TARGET_ID,
        executionStatus: 'COMPLETED',
        outcomeSummary: 'Deployment succeeded.',
        lessonsLearned: ['Monitor rollout metrics'],
      },
    };

    expect(extractIcareMetadata(metadata)).toEqual({
      icareStage: 'EXECUTION_EVALUATION',
      reasoningChainId: CHAIN_ID,
      relatedMemoryIds: [RELATED_ID],
      evaluationTargetMemoryId: TARGET_ID,
      executionStatus: 'COMPLETED',
      outcomeSummary: 'Deployment succeeded.',
      lessonsLearned: ['Monitor rollout metrics'],
    });
  });

  it('filters non-string entries from array fields', () => {
    const metadata = {
      icare: {
        icareStage: 'ISSUE',
        relatedMemoryIds: [RELATED_ID, 42, null],
        lessonsLearned: ['valid', '', 1],
      },
    };
    const result = extractIcareMetadata(metadata);
    expect(result?.relatedMemoryIds).toEqual([RELATED_ID]);
    expect(result?.lessonsLearned).toEqual(['valid', '']);
  });
});

describe('extractTitle', () => {
  it('reads title from metadata.title', () => {
    expect(extractTitle({ [TITLE_METADATA_KEY]: 'Quarterly review' })).toBe('Quarterly review');
    expect(extractTitle({ title: 123 })).toBeNull();
  });
});

describe('mergeMemoryMetadata', () => {
  it('merges title and ICARE fields into metadata.icare', () => {
    const merged = mergeMemoryMetadata({
      title: 'Launch decision',
      icareStage: 'RECOMMENDATIONS',
      reasoningChainId: CHAIN_ID,
      relatedMemoryIds: [RELATED_ID],
    });

    expect(merged.title).toBe('Launch decision');
    expect(merged.icare).toEqual({
      icareStage: 'RECOMMENDATIONS',
      reasoningChainId: CHAIN_ID,
      relatedMemoryIds: [RELATED_ID],
    });
  });

  it('requires icareStage when ICARE fields are present', () => {
    expect(() =>
      mergeMemoryMetadata({
        reasoningChainId: CHAIN_ID,
      }),
    ).toThrow('icareStage is required when ICARE³ metadata fields are present.');
  });

  it('preserves existing icare keys when updating', () => {
    const merged = mergeMemoryMetadata({
      metadata: {
        icare: { icareStage: 'CONTEXT', reasoningChainId: CHAIN_ID },
        custom: true,
      },
      icareStage: 'ANALYSIS',
    });

    expect(merged.icare).toEqual({
      icareStage: 'ANALYSIS',
      reasoningChainId: CHAIN_ID,
    });
    expect(merged.custom).toBe(true);
  });
});

describe('collectRelatedMemoryIds', () => {
  it('collects related IDs from top-level and nested metadata', () => {
    const ids = collectRelatedMemoryIds({
      relatedMemoryIds: [RELATED_ID],
      evaluationTargetMemoryId: TARGET_ID,
      metadata: {
        icare: {
          icareStage: 'EXECUTION',
          relatedMemoryIds: ['44444444-4444-4444-8444-444444444444'],
        },
      },
    });

    expect(ids).toEqual(
      expect.arrayContaining([RELATED_ID, TARGET_ID, '44444444-4444-4444-8444-444444444444']),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
