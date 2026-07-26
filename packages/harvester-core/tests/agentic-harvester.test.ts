import { describe, expect, it, vi } from 'vitest';
import { ModelBackedHarvester, DeterministicExtractor } from '../src/index.js';
import {
  MockReasoningProvider,
  type ReasoningProvider,
} from '@questoros-memory/reasoning-provider';

describe('ModelBackedHarvester', () => {
  it('forms governed candidates from ordinary enterprise text', async () => {
    const harvester = new ModelBackedHarvester({
      reasoning: new MockReasoningProvider(),
    });
    const result = await harvester.harvest({
      sourceText: [
        'Property Harborview Tower remains active.',
        'Buyer committed to signing the LOI this week.',
        'Closing deadline is August 20, 2026.',
        'We are missing the environmental report.',
        'Constraint: no paid advertising.',
      ].join('\n'),
      sourceLocator: 'project-brief.md',
      relatedMemories: [],
      permissions: ['memory:harvest', 'memory:review'],
    });

    expect(result.extractorMode).toBe('model');
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((c) => c.sourceEvidenceSpan.length > 0)).toBe(true);
    expect(result.candidates.every((c) => c.reasonForDurability.length > 0)).toBe(true);
  });

  it('keeps DeterministicExtractor as fallback', async () => {
    const harvester = new ModelBackedHarvester();
    const result = await harvester.harvest({
      sourceText: 'Goal: launch Harborview\nLaunch date: July 15',
      relatedMemories: [],
      permissions: ['memory:harvest'],
      useDeterministicFallback: true,
    });
    expect(result.extractorMode).toBe('deterministic-fallback');
    expect(result.candidates.some((c) => c.content.startsWith('Goal:'))).toBe(true);
    expect(new DeterministicExtractor().extract('Goal: x').length).toBe(1);
  });

  it('requires approval before authoritative writes and ignores private promotion', async () => {
    const harvester = new ModelBackedHarvester();
    const result = await harvester.harvest({
      sourceText: [
        'Goal: close Harborview',
        'Private: my personal bonus target is confidential',
        'Launch date: August 20',
      ].join('\n'),
      relatedMemories: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          content: 'Launch date: July 15',
          memoryType: 'FACT',
        },
      ],
      permissions: ['memory:harvest'],
    });

    const privateOnes = result.candidates.filter((c) => c.ownershipClassification === 'PRIVATE');
    expect(privateOnes.every((c) => c.recommendedDisposition === 'IGNORE')).toBe(true);

    const correction = result.candidates.find((c) => c.recommendedDisposition === 'CORRECT');
    expect(correction?.requiresApproval).toBe(true);
    expect(correction?.relatedMemoryIds).toContain('11111111-1111-4111-8111-111111111111');
  });

  it('caps live Bedrock follow-up reasoning to three candidates', async () => {
    const analyze = vi.fn(async () => ({
      classification: 'NEW_DURABLE' as const,
      disposition: 'CREATE' as const,
      confidence: 0.9,
      relatedMemoryIds: [],
      evidence: 'Synthetic evidence.',
      rationale: 'Synthetic conflict analysis.',
    }));
    const evaluate = vi.fn(async () => ({
      allowed: true,
      requiresApproval: true,
      confidence: 0.9,
      ownershipOk: true,
      permissionsOk: true,
      rationale: 'Synthetic policy evaluation.',
    }));
    const provider: ReasoningProvider = {
      providerName: 'amazon-bedrock',
      modelId: 'amazon.nova-micro-v1:0',
      extract: async () => ({
        candidates: Array.from({ length: 5 }, (_, index) => ({
          content: `Fact ${index + 1}`,
          memoryType: 'FACT' as const,
          icareStage: 'CONTEXT' as const,
          confidence: 0.9,
          importance: 0.8,
          ownershipClassification: 'PROJECT' as const,
          scopeRecommendation: 'PROJECT' as const,
          sourceEvidenceSpan: `Fact ${index + 1}`,
          sourceLocator: 'synthetic.txt',
          reasonForDurability: 'Synthetic durable fact.',
          relatedEntityOrProject: 'synthetic-project',
          recommendedDisposition: 'CREATE' as const,
          relatedMemoryIds: [],
        })),
        rationale: 'Synthetic live extraction.',
        provider: 'amazon-bedrock',
        modelId: 'amazon.nova-micro-v1:0',
      }),
      analyze,
      evaluate,
      selectNextTool: async () => ({ action: 'stop', reason: 'Not used.' }),
      evaluateExecution: async () => ({
        outcomeSummary: 'Not used.',
        lessonsLearned: ['Not used.'],
        success: true,
        icareStage: 'EXECUTION_EVALUATION',
      }),
    };

    const result = await new ModelBackedHarvester({ reasoning: provider }).harvest({
      sourceText: 'Synthetic source.',
      relatedMemories: [],
      permissions: ['memory:harvest'],
    });

    expect(result.candidates).toHaveLength(3);
    expect(analyze).toHaveBeenCalledTimes(3);
    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(result.rationale).toContain('capped at 3 candidates');
  });
});
