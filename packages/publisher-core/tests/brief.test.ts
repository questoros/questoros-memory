import { describe, expect, it } from 'vitest';
import { renderIntelligenceBrief, StubDriveProvider } from '../src/index.js';

describe('renderIntelligenceBrief', () => {
  it('renders provenance-linked project intelligence', () => {
    const content = renderIntelligenceBrief({
      title: 'Harborview Project Intelligence Brief',
      projectName: 'Harborview Tower',
      reasoningChainId: '11111111-1111-4111-8111-111111111111',
      memories: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          content: 'Launch date: August 20, 2026',
          memoryType: 'FACT',
          icareStage: 'CONTEXT',
          revisionId: '33333333-3333-4333-8333-333333333333',
        },
      ],
      contradictionNotes: ['July 15 superseded by August 20'],
      openTasks: ['Obtain fire-safety certificate'],
    });

    expect(content).toContain('Harborview Tower');
    expect(content).toContain('memory:22222222-2222-4222-8222-222222222222');
    expect(content).toContain('SYNC_CONFLICT');
  });
});

describe('StubDriveProvider sync conflict', () => {
  it('detects SYNC_CONFLICT when local and external both diverge', async () => {
    const drive = new StubDriveProvider();
    const published = await drive.publish({
      title: 'brief',
      content: 'original',
      artifactType: 'intelligence-brief',
      sourceMemoryIds: ['11111111-1111-4111-8111-111111111111'],
      sourceRevisionIds: [],
      publishedBy: 'actor',
    });

    await drive.updateDocument({
      fileId: published.externalFileId,
      content: 'external edit',
    });

    const change = await drive.detectChange(published, {
      localContentHash: 'local-changed-hash',
    });
    expect(change.changed).toBe(true);
    expect(change.syncConflict).toBe(true);
  });
});
