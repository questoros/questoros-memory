import { describe, expect, it } from 'vitest';
import {
  ModelBackedHarvester,
  combinedHarborviewCorpus,
  HARBORVIEW_SOURCE_BUNDLE,
} from '../src/index.js';
import { MockReasoningProvider } from '@questoros-memory/reasoning-provider';
import { renderIntelligenceBrief, StubDriveProvider } from '@questoros-memory/publisher-core';

describe('Harborview real-estate organizational intelligence demo (mocked)', () => {
  it('harvests raw files, detects contradiction, and prepares brief + sync conflict path', async () => {
    const harvester = new ModelBackedHarvester({
      reasoning: new MockReasoningProvider(),
    });

    const staleMemoryId = '11111111-1111-4111-8111-111111111111';
    const harvest = await harvester.harvest({
      sourceText: combinedHarborviewCorpus(),
      sourceLocator: 'harborview-bundle',
      relatedMemories: [
        {
          id: staleMemoryId,
          content: 'Launch date: July 15, 2026',
          memoryType: 'FACT',
        },
      ],
      permissions: ['memory:harvest', 'memory:review', 'memory:publish'],
    });

    expect(HARBORVIEW_SOURCE_BUNDLE.length).toBe(5);
    expect(harvest.extractorMode).toBe('model');
    expect(harvest.candidates.length).toBeGreaterThanOrEqual(4);

    const privateIgnored = harvest.candidates.filter(
      (c) => c.ownershipClassification === 'PRIVATE',
    );
    expect(privateIgnored.every((c) => c.recommendedDisposition === 'IGNORE')).toBe(true);

    const correction = harvest.candidates.find((c) => c.recommendedDisposition === 'CORRECT');
    expect(correction).toBeTruthy();
    expect(correction?.relatedMemoryIds).toContain(staleMemoryId);
    expect(correction?.requiresApproval).toBe(true);
    expect(correction?.sourceEvidenceSpan.length).toBeGreaterThan(0);

    const durable = harvest.candidates.filter(
      (c) =>
        c.recommendedDisposition === 'CREATE' &&
        c.ownershipClassification !== 'PRIVATE' &&
        c.policyAllowed,
    );
    expect(durable.some((c) => /commitment/i.test(c.content))).toBe(true);
    expect(durable.some((c) => /Missing document|fire-safety/i.test(c.content))).toBe(true);
    expect(durable.some((c) => c.memoryType === 'CONSTRAINT')).toBe(true);
    expect(durable.some((c) => /template/i.test(c.content))).toBe(true);

    // Approval gate: proposals only — no authoritative write happened in harvester.
    expect(
      harvest.candidates.every((c) => c.requiresApproval || c.recommendedDisposition === 'IGNORE'),
    ).toBe(true);

    const approvedMemories = [
      {
        id: '22222222-2222-4222-8222-222222222222',
        content: correction?.content ?? 'Launch date: August 20, 2026',
        memoryType: 'FACT',
        icareStage: 'CONTEXT',
        revisionId: '33333333-3333-4333-8333-333333333333',
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        content: 'Missing document: fire-safety certificate',
        memoryType: 'TASK',
        icareStage: 'RECOMMENDATIONS',
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        content: 'Constraint: no paid advertising for this asset class',
        memoryType: 'CONSTRAINT',
        icareStage: 'CONTEXT',
      },
    ];

    const brief = renderIntelligenceBrief({
      title: 'Harborview Project Intelligence Brief',
      projectName: 'Harborview Tower',
      memories: approvedMemories,
      contradictionNotes: [
        'July 15, 2026 superseded by August 20, 2026 after recommendation evaluation',
      ],
      openTasks: ['Obtain fire-safety certificate'],
      reasoningChainId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });

    expect(brief).toContain('Harborview Tower');
    expect(brief).toContain('August 20');
    expect(brief).toContain('memory:22222222-2222-4222-8222-222222222222');

    const drive = new StubDriveProvider();
    const published = await drive.publish({
      title: 'Harborview Project Intelligence Brief',
      content: brief,
      artifactType: 'intelligence-brief',
      sourceMemoryIds: approvedMemories.map((m) => m.id),
      sourceRevisionIds: ['33333333-3333-4333-8333-333333333333'],
      publishedBy: 'demo-actor',
      syncDirection: 'BIDIRECTIONAL_REVIEWED',
    });
    expect(published.syncStatus).toBe('PUBLISHED');

    await drive.updateDocument({
      fileId: published.externalFileId,
      content: `${brief}\n\nExternal edit: changed occupancy note`,
    });
    const change = await drive.detectChange(published, {
      localContentHash: 'locally-edited-hash',
    });
    expect(change.syncConflict).toBe(true);
  });

  it('does not make live model or Drive calls', async () => {
    const harvester = new ModelBackedHarvester({
      reasoning: new MockReasoningProvider({ modelId: 'mock-ci' }),
    });
    const result = await harvester.harvest({
      sourceText: HARBORVIEW_SOURCE_BUNDLE[1].text,
      sourceLocator: HARBORVIEW_SOURCE_BUNDLE[1].locator,
      relatedMemories: [],
      permissions: ['memory:harvest'],
    });
    expect(result.providerName).toBe('mock');
    expect(result.modelId).toBe('mock-ci');
  });
});
