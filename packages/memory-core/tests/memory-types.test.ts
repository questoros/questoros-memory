import { describe, it, expect } from 'vitest';
import {
  SCOPE_TYPES,
  MEMORY_TYPES,
  MEMORY_STATUSES,
  SENSITIVITY_VALUES,
  ACTOR_TYPES,
  SOURCE_TYPES,
  AUDIT_OUTCOMES,
  CANDIDATE_STATUSES,
  HARVEST_RUN_STATUSES,
  SYNC_DIRECTIONS,
  SYNC_STATUSES,
} from '../src/memory-types';

describe('Scope types', () => {
  it('has exactly three scope types', () => {
    expect(SCOPE_TYPES).toEqual(['TENANT', 'WORKSPACE', 'PROJECT']);
  });
});

describe('Memory types', () => {
  it('includes Phase 5 organizational intelligence types', () => {
    expect(MEMORY_TYPES).toEqual([
      'PROFILE',
      'PREFERENCE',
      'FACT',
      'DECISION',
      'TASK',
      'EVENT',
      'SUMMARY',
      'INSTRUCTION',
      'GOAL',
      'CONSTRAINT',
      'ACTION_RESULT',
      'CHECKPOINT',
      'ARTIFACT_SUMMARY',
    ]);
  });

  it('contains no duplicates', () => {
    expect(new Set(MEMORY_TYPES).size).toBe(MEMORY_TYPES.length);
  });
});

describe('Memory statuses', () => {
  it('has exactly three statuses', () => {
    expect(MEMORY_STATUSES).toEqual(['ACTIVE', 'SUPERSEDED', 'DELETED']);
  });
});

describe('Sensitivity values', () => {
  it('has exactly four sensitivity levels', () => {
    expect(SENSITIVITY_VALUES).toEqual(['PUBLIC', 'STANDARD', 'SENSITIVE', 'RESTRICTED']);
  });
});

describe('Actor types', () => {
  it('has exactly four actor types', () => {
    expect(ACTOR_TYPES).toEqual(['USER', 'AGENT', 'SERVICE', 'SYSTEM']);
  });
});

describe('Source types', () => {
  it('includes harvest and drive sources', () => {
    expect(SOURCE_TYPES).toEqual([
      'CONVERSATION',
      'DOCUMENT',
      'EMAIL',
      'CALENDAR',
      'API',
      'MANUAL',
      'SYSTEM',
      'DRIVE',
      'UPLOAD',
      'HARVEST',
    ]);
  });
});

describe('Candidate and sync enums', () => {
  it('defines candidate statuses', () => {
    expect(CANDIDATE_STATUSES).toContain('PENDING');
    expect(CANDIDATE_STATUSES).toContain('CONFLICT');
  });

  it('defines harvest run statuses', () => {
    expect(HARVEST_RUN_STATUSES).toEqual(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']);
  });

  it('defines sync directions and statuses', () => {
    expect(SYNC_DIRECTIONS).toContain('BIDIRECTIONAL_REVIEWED');
    expect(SYNC_STATUSES).toContain('SYNC_CONFLICT');
  });
});

describe('Audit outcomes', () => {
  it('has exactly three audit outcomes', () => {
    expect(AUDIT_OUTCOMES).toEqual(['SUCCESS', 'DENIED', 'FAILED']);
  });
});
