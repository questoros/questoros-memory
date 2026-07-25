import { afterEach, describe, expect, it } from 'vitest';
import { FakeGoogleDriveClient, GoogleDriveProvider } from '@questoros-memory/drive-google';
import {
  FakeMicrosoftGraphClient,
  MicrosoftGraphDriveProvider,
} from '@questoros-memory/drive-microsoft';
import {
  __registerDriveBackend,
  __resetDriveBackends,
  __simulateExternalDriveEdit,
} from '../src/index.js';

describe('injectable Drive backends (fake providers)', () => {
  afterEach(() => {
    __resetDriveBackends();
  });

  it('registers Google, OneDrive, and SharePoint fakes and detects SYNC_CONFLICT', async () => {
    const google = new GoogleDriveProvider({ client: new FakeGoogleDriveClient() });
    const onedrive = new MicrosoftGraphDriveProvider({
      client: new FakeMicrosoftGraphClient({ target: 'onedrive', driveId: 'od-1' }),
      mode: 'onedrive',
      driveId: 'od-1',
    });
    const sharepoint = new MicrosoftGraphDriveProvider({
      client: new FakeMicrosoftGraphClient({
        target: 'sharepoint',
        driveId: 'spo-drive',
        siteId: 'spo-site',
      }),
      mode: 'sharepoint',
      driveId: 'spo-drive',
      siteId: 'spo-site',
    });

    __registerDriveBackend('google-drive', google);
    __registerDriveBackend('microsoft-onedrive', onedrive);
    __registerDriveBackend('microsoft-sharepoint', sharepoint);

    for (const [provider, drive] of [
      ['google-drive', google],
      ['microsoft-onedrive', onedrive],
      ['microsoft-sharepoint', sharepoint],
    ] as const) {
      const published = await drive.publish({
        title: `Brief ${provider}`,
        content: 'Launch date: August 20, 2026\nConstraint: no paid advertising',
        artifactType: 'intelligence-brief',
        sourceMemoryIds: [],
        sourceRevisionIds: [],
        publishedBy: 'acceptance-actor',
        provider,
        syncDirection: 'BIDIRECTIONAL_REVIEWED',
      });

      expect(published.provider).toBe(provider);
      expect(published.syncStatus).toBe('PUBLISHED');
      expect(published.lastSyncedContentHash).toBeTruthy();
      if (provider === 'microsoft-sharepoint') {
        expect(published.siteId).toBe('spo-site');
      }

      await __simulateExternalDriveEdit(
        provider,
        published.externalFileId,
        `${published.title}\nExternal edit`,
      );

      const change = await drive.detectChange(published, {
        localContentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      });
      expect(change.changed).toBe(true);
      expect(change.syncConflict).toBe(true);

      await expect(
        drive.createShareLink(published.externalFileId, { type: 'anyone' }),
      ).rejects.toThrow(/Public share links/i);
    }
  });
});
