import { describe, it, expect } from 'vitest';
import {
  DriveNotConfiguredError,
  FakeMicrosoftGraphClient,
  MicrosoftGraphDriveProvider,
} from '../src/index.js';

describe('MicrosoftGraphDriveProvider', () => {
  it('throws DriveNotConfiguredError without an injectable client', async () => {
    const provider = new MicrosoftGraphDriveProvider({ mode: 'onedrive' });
    await expect(provider.createFolder({ name: 'x' })).rejects.toBeInstanceOf(
      DriveNotConfiguredError,
    );
    await expect(provider.readDocument('missing')).rejects.toMatchObject({
      code: 'DRIVE_NOT_CONFIGURED',
    });
  });

  it('supports OneDrive folder/document operations via fake client', async () => {
    const client = new FakeMicrosoftGraphClient({
      target: 'onedrive',
      driveId: 'drive-onedrive-1',
    });
    const provider = new MicrosoftGraphDriveProvider({
      client,
      mode: 'onedrive',
      driveId: 'drive-onedrive-1',
    });

    expect(provider.providerName).toBe('microsoft-onedrive');

    const folder = await provider.createFolder({ name: 'QuestorOS Intelligence' });
    expect(folder.driveId).toBe('drive-onedrive-1');
    expect(folder.siteId).toBeNull();

    const doc = await provider.createDocument({
      name: 'Current Intelligence Brief.md',
      content: 'Launch date: August 20',
      parentFolderId: folder.id,
    });
    expect(doc.parentFolderId).toBe(folder.id);
    expect(doc.driveId).toBe('drive-onedrive-1');

    const read = await provider.readDocument(doc.id);
    expect(read.content).toBe('Launch date: August 20');

    const updated = await provider.updateDocument({
      fileId: doc.id,
      content: 'Launch date: August 15',
    });
    expect(updated.content).toContain('August 15');

    const link = await provider.createShareLink(doc.id);
    expect(link).toContain('organization');

    await expect(provider.createShareLink(doc.id, { type: 'anyone' })).rejects.toThrow(
      /Public share links are disabled/,
    );

    const changes = await provider.listChanges();
    expect(changes.changes.length).toBeGreaterThan(0);
    expect(client.getStoredDocuments().has(doc.id)).toBe(true);
  });

  it('supports SharePoint document libraries with siteId metadata', async () => {
    const client = new FakeMicrosoftGraphClient({
      target: 'sharepoint',
      driveId: 'drive-spo-docs',
      siteId: 'site-contoso-demo',
    });
    const provider = new MicrosoftGraphDriveProvider({
      client,
      mode: 'sharepoint',
      driveId: 'drive-spo-docs',
      siteId: 'site-contoso-demo',
    });

    expect(provider.providerName).toBe('microsoft-sharepoint');

    const published = await provider.publish({
      title: 'Harborview Brief',
      content: '# Brief\n\nClosing August 20',
      artifactType: 'intelligence-brief',
      sourceMemoryIds: ['11111111-1111-4111-8111-111111111111'],
      sourceRevisionIds: [],
      publishedBy: 'actor-1',
      syncDirection: 'BIDIRECTIONAL_REVIEWED',
    });

    expect(published.provider).toBe('microsoft-sharepoint');
    expect(published.driveId).toBe('drive-spo-docs');
    expect(published.siteId).toBe('site-contoso-demo');
    expect(published.syncStatus).toBe('PUBLISHED');
    expect(published.syncDirection).toBe('BIDIRECTIONAL_REVIEWED');

    await provider.updateDocument({
      fileId: published.externalFileId,
      content: '# Brief\n\nExternal edit',
    });

    const change = await provider.detectChange(published, {
      localContentHash: 'local-diverged',
    });
    expect(change.changed).toBe(true);
    expect(change.syncConflict).toBe(true);

    const republished = await provider.republish(published, '# Brief\n\nApproved republish');
    expect(republished.syncStatus).toBe('REPUBLISHED');
    expect(republished.siteId).toBe('site-contoso-demo');
  });
});
