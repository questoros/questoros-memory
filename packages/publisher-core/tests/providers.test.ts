import { describe, expect, it } from 'vitest';
import { assertShareLinkAllowed, DRIVE_PROVIDERS, StubDriveProvider } from '../src/index.js';

describe('multi-drive publisher contracts', () => {
  it('exposes canonical provider names for Google and Microsoft', () => {
    expect(DRIVE_PROVIDERS).toContain('google-drive');
    expect(DRIVE_PROVIDERS).toContain('microsoft-onedrive');
    expect(DRIVE_PROVIDERS).toContain('microsoft-sharepoint');
    expect(DRIVE_PROVIDERS).toContain('stub');
  });

  it('blocks public share links by default', () => {
    expect(() => assertShareLinkAllowed({ type: 'anyone' })).toThrow(/Public share links/);
    expect(assertShareLinkAllowed({ type: 'organization' }).type).toBe('organization');
    expect(assertShareLinkAllowed({ type: 'anyone', allowPublic: true }).allowPublic).toBe(true);
  });

  it('records driveId on stub publish and detects SYNC_CONFLICT', async () => {
    const drive = new StubDriveProvider();
    const published = await drive.publish({
      title: 'brief',
      content: 'original',
      artifactType: 'intelligence-brief',
      sourceMemoryIds: ['11111111-1111-4111-8111-111111111111'],
      sourceRevisionIds: [],
      publishedBy: 'actor',
      provider: 'stub',
    });
    expect(published.driveId).toBe('stub-drive');
    expect(published.siteId).toBeNull();

    await drive.updateDocument({ fileId: published.externalFileId, content: 'external' });
    const change = await drive.detectChange(published, { localContentHash: 'local-hash' });
    expect(change.syncConflict).toBe(true);
  });
});
