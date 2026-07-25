import { describe, it, expect } from 'vitest';
import { DeterministicExtractor } from '../src/index.js';

describe('DeterministicExtractor', () => {
  const extractor = new DeterministicExtractor();

  it('extracts prefixed Goal/Budget/Launch date/Constraint/Task lines', () => {
    const text = [
      'Goal: Ship organizational intelligence demo',
      'Budget: $50,000',
      'Launch date: August 20',
      'Constraint: No silent memory overwrites',
      'Task: Approve launch date correction',
      'Unrelated chatter without a prefix',
    ].join('\n');

    const candidates = extractor.extract(text);
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          memoryType: 'GOAL',
          content: 'Goal: Ship organizational intelligence demo',
        }),
        expect.objectContaining({ memoryType: 'FACT', content: 'Budget: $50,000' }),
        expect.objectContaining({ memoryType: 'FACT', content: 'Launch date: August 20' }),
        expect.objectContaining({
          memoryType: 'CONSTRAINT',
          content: 'Constraint: No silent memory overwrites',
        }),
        expect.objectContaining({
          memoryType: 'TASK',
          content: 'Task: Approve launch date correction',
        }),
      ]),
    );
    expect(candidates).toHaveLength(5);
  });

  it('detects August 15 style date facts without Launch date prefix', () => {
    const candidates = extractor.extract(
      'We moved the event to August 15 after the stakeholder review.',
    );
    expect(candidates).toEqual([
      expect.objectContaining({
        memoryType: 'FACT',
        content: 'Launch date: August 15',
        confidence: 0.75,
      }),
    ]);
  });

  it('deduplicates identical extracts', () => {
    const candidates = extractor.extract('Goal: Win the demo\nGoal: Win the demo');
    expect(candidates).toHaveLength(1);
  });
});
