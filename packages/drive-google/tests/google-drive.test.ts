import { describe, it, expect } from 'vitest';
import { DriveNotConfiguredError, FakeGoogleClient, GoogleDriveProvider } from '../src/index.js';

describe('GoogleDriveProvider', () => {
  it('throws DriveNotConfiguredError without an injectable client', async () => {
    const provider = new GoogleDriveProvider();
    await expect(provider.createFolder({ name: 'x' })).rejects.toBeInstanceOf(
      DriveNotConfiguredError,
    );
    await expect(provider.readDocument('missing')).rejects.toMatchObject({
      code: 'DRIVE_NOT_CONFIGURED',
    });
  });

  it('delegates to FakeGoogleClient for folder and document operations', async () => {
    const client = new FakeGoogleClient();
    const provider = new GoogleDriveProvider({ client });

    const folder = await provider.createFolder({ name: 'QuestorOS Intelligence' });
    expect(folder.name).toBe('QuestorOS Intelligence');

    const doc = await provider.createDocument({
      name: 'Current Intelligence Brief.md',
      content: 'Launch date: August 20',
      parentFolderId: folder.id,
    });
    expect(doc.parentFolderId).toBe(folder.id);

    const read = await provider.readDocument(doc.id);
    expect(read.content).toBe('Launch date: August 20');

    const updated = await provider.updateDocument({
      fileId: doc.id,
      content: 'Launch date: August 15',
    });
    expect(updated.content).toContain('August 15');

    const link = await provider.createShareLink(doc.id);
    expect(link).toContain(doc.id);
    expect(link).toContain('scope=domain');

    await expect(provider.createShareLink(doc.id, { type: 'anyone' })).rejects.toThrow(
      /Public share links are disabled/,
    );

    const changes = await provider.listChanges();
    expect(changes.changes.length).toBeGreaterThan(0);
    expect(client.getStoredDocuments().has(doc.id)).toBe(true);
    expect(doc.driveId).toBe('google-drive-default');
  });
});
