import { describe, it, expect } from 'vitest';
import {
  extractCandidatesFromText,
  analyzeCandidateAgainstMemories,
  recommendationForAnalysisStatus,
} from '../src/phase5.js';

describe('extractCandidatesFromText', () => {
  it('extracts goal, constraint, budget, launch date, and tasks', () => {
    const text = `
Goal: launch a new product.
Budget: USD 10,000.
Launch date: August 15.
Constraint: no paid advertising.
Task: draft launch plan.
`;
    const candidates = extractCandidatesFromText(text);
    expect(candidates.some((c) => c.memoryType === 'GOAL')).toBe(true);
    expect(candidates.some((c) => c.memoryType === 'CONSTRAINT')).toBe(true);
    expect(candidates.some((c) => c.memoryType === 'FACT' && /budget/i.test(c.content))).toBe(true);
    expect(candidates.some((c) => c.memoryType === 'FACT' && /august 15/i.test(c.content))).toBe(
      true,
    );
    expect(candidates.some((c) => c.memoryType === 'TASK')).toBe(true);
  });
});

describe('analyzeCandidateAgainstMemories', () => {
  it('marks launch-date conflicts', () => {
    const result = analyzeCandidateAgainstMemories('Launch date: August 20.', 'FACT', [
      {
        id: '11111111-1111-4111-8111-111111111111',
        content: 'Launch date: August 15.',
        memoryType: 'FACT',
      },
    ]);
    expect(result.status).toBe('CONFLICT');
    expect(result.relatedMemoryIds).toHaveLength(1);
  });

  it('marks exact duplicates', () => {
    const result = analyzeCandidateAgainstMemories('same', 'FACT', [
      { id: '11111111-1111-4111-8111-111111111111', content: 'same', memoryType: 'FACT' },
    ]);
    expect(result.status).toBe('DUPLICATE');
  });
});

describe('recommendationForAnalysisStatus', () => {
  it('maps ICARE³ Analysis outcomes to Recommendations', () => {
    expect(recommendationForAnalysisStatus('PENDING')).toBe('create');
    expect(recommendationForAnalysisStatus('DUPLICATE')).toBe('ignore');
    expect(recommendationForAnalysisStatus('NEAR_DUPLICATE')).toBe('merge');
    expect(recommendationForAnalysisStatus('CONFLICT')).toBe('correct');
  });
});
