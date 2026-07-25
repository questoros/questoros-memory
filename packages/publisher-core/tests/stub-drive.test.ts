import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { StubDriveProvider } from '../src/index.js';

function hash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

describe('StubDriveProvider', () => {
  it('creates folders and documents in memory', async () => {
    const drive = new StubDriveProvider();
    const folder = await drive.createFolder({ name: 'QuestorOS' });
    const found = await drive.findFolder('QuestorOS');
    expect(found?.id).toBe(folder.id);

    const doc = await drive.createDocument({
      name: 'brief.md',
      content: 'Launch date: August 20',
      parentFolderId: folder.id,
    });
    const read = await drive.readDocument(doc.id);
    expect(read.content).toBe('Launch date: August 20');
    expect(read.parentFolderId).toBe(folder.id);
  });

  it('publishes artifact metadata with provenance', async () => {
    const drive = new StubDriveProvider();
    const meta = await drive.publish({
      title: 'Current Intelligence Brief',
      content: '# Brief\n\nLaunch date: August 20',
      artifactType: 'intelligence_brief',
      sourceMemoryIds: ['mem-1'],
      sourceRevisionIds: ['rev-1'],
      publishedBy: 'actor-1',
    });

    expect(meta.provider).toBe('stub');
    expect(meta.syncDirection).toBe('BIDIRECTIONAL_REVIEWED');
    expect(meta.syncStatus).toBe('PUBLISHED');
    expect(meta.sourceMemoryIds).toEqual(['mem-1']);
    expect(meta.lastSyncedContentHash).toBe(hash('# Brief\n\nLaunch date: August 20'));
  });

  it('detects external edits without overwriting', async () => {
    const drive = new StubDriveProvider();
    const meta = await drive.publish({
      title: 'Brief',
      content: 'Launch date: August 20',
      artifactType: 'intelligence_brief',
      sourceMemoryIds: [],
      sourceRevisionIds: [],
      publishedBy: 'actor-1',
    });

    await drive.updateDocument({
      fileId: meta.externalFileId,
      content: 'Launch date: August 15',
    });

    const change = await drive.detectChange(meta);
    expect(change.changed).toBe(true);
    expect(change.content).toContain('August 15');
    expect(change.syncConflict).toBe(false);

    const conflict = await drive.detectChange(meta, {
      localContentHash: hash('Launch date: August 22'),
    });
    expect(conflict.syncConflict).toBe(true);
  });
});
