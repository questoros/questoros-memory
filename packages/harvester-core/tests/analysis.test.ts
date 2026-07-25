import { describe, it, expect } from 'vitest';
import { analyzeAgainstMemories, DeterministicExtractor } from '../src/index.js';

describe('analyzeAgainstMemories', () => {
  it('marks exact content as DUPLICATE', () => {
    const analyzed = analyzeAgainstMemories(
      [{ content: 'Goal: Ship demo', memoryType: 'GOAL', confidence: 0.9 }],
      [{ id: 'm1', content: 'Goal: Ship demo', memoryType: 'GOAL' }],
    );
    expect(analyzed[0]).toMatchObject({
      status: 'DUPLICATE',
      relatedMemoryIds: ['m1'],
    });
  });

  it('marks near-identical content as NEAR_DUPLICATE', () => {
    const analyzed = analyzeAgainstMemories(
      [
        {
          content: 'Constraint: Do not silently overwrite authoritative memory',
          memoryType: 'CONSTRAINT',
          confidence: 0.9,
        },
      ],
      [
        {
          id: 'm2',
          content: 'Constraint: Do not silently overwrite memory',
          memoryType: 'CONSTRAINT',
        },
      ],
    );
    expect(analyzed[0]?.status).toBe('NEAR_DUPLICATE');
    expect(analyzed[0]?.relatedMemoryIds).toContain('m2');
  });

  it('marks conflicting launch dates as CONFLICT', () => {
    const extractor = new DeterministicExtractor();
    const candidates = extractor.extract('Launch date: August 15');
    const analyzed = analyzeAgainstMemories(candidates, [
      { id: 'm-launch', content: 'Launch date: August 20', memoryType: 'FACT' },
    ]);
    expect(analyzed[0]).toMatchObject({
      status: 'CONFLICT',
      relatedMemoryIds: ['m-launch'],
    });
  });

  it('leaves unmatched candidates as PENDING', () => {
    const analyzed = analyzeAgainstMemories(
      [{ content: 'Task: Write status brief', memoryType: 'TASK', confidence: 0.8 }],
      [{ id: 'm3', content: 'Goal: Unrelated goal', memoryType: 'GOAL' }],
    );
    expect(analyzed[0]).toMatchObject({ status: 'PENDING', relatedMemoryIds: [] });
  });
});
