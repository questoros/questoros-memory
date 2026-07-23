import { describe, it, expect } from 'vitest';
import {
  SCOPE_TYPES,
  MEMORY_TYPES,
  MEMORY_STATUSES,
  SENSITIVITY_VALUES,
  ACTOR_TYPES,
  SOURCE_TYPES,
  AUDIT_OUTCOMES,
} from '../src/memory-types';

describe('Scope types', () => {
  it('has exactly three scope types', () => {
    expect(SCOPE_TYPES).toEqual(['TENANT', 'WORKSPACE', 'PROJECT']);
  });
});

describe('Memory types', () => {
  it('has exactly eight memory types', () => {
    expect(MEMORY_TYPES).toEqual([
      'PROFILE',
      'PREFERENCE',
      'FACT',
      'DECISION',
      'TASK',
      'EVENT',
      'SUMMARY',
      'INSTRUCTION',
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

  it('contains no duplicates', () => {
    expect(new Set(MEMORY_STATUSES).size).toBe(MEMORY_STATUSES.length);
  });
});

describe('Sensitivity values', () => {
  it('has exactly four sensitivity levels', () => {
    expect(SENSITIVITY_VALUES).toEqual(['PUBLIC', 'STANDARD', 'SENSITIVE', 'RESTRICTED']);
  });

  it('contains no duplicates', () => {
    expect(new Set(SENSITIVITY_VALUES).size).toBe(SENSITIVITY_VALUES.length);
  });
});

describe('Actor types', () => {
  it('has exactly four actor types', () => {
    expect(ACTOR_TYPES).toEqual(['USER', 'AGENT', 'SERVICE', 'SYSTEM']);
  });

  it('contains no duplicates', () => {
    expect(new Set(ACTOR_TYPES).size).toBe(ACTOR_TYPES.length);
  });
});

describe('Source types', () => {
  it('has exactly seven source types', () => {
    expect(SOURCE_TYPES).toEqual([
      'CONVERSATION',
      'DOCUMENT',
      'EMAIL',
      'CALENDAR',
      'API',
      'MANUAL',
      'SYSTEM',
    ]);
  });

  it('contains no duplicates', () => {
    expect(new Set(SOURCE_TYPES).size).toBe(SOURCE_TYPES.length);
  });
});

describe('Audit outcomes', () => {
  it('has exactly three audit outcomes', () => {
    expect(AUDIT_OUTCOMES).toEqual(['SUCCESS', 'DENIED', 'FAILED']);
  });

  it('contains no duplicates', () => {
    expect(new Set(AUDIT_OUTCOMES).size).toBe(AUDIT_OUTCOMES.length);
  });
});
