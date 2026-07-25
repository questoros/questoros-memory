import { createHash } from 'node:crypto';
import type {
  CreateDocumentInput,
  CreateFolderInput,
  DriveChange,
  DriveDocument,
  DriveFileMetadata,
  DriveFolder,
  ShareLinkOptions,
  UpdateDocumentInput,
} from '@questoros-memory/publisher-core';
import { assertShareLinkAllowed } from '@questoros-memory/publisher-core';
import type { MicrosoftGraphHttpClient } from './http-client.js';

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export type MicrosoftGraphTarget = 'onedrive' | 'sharepoint';

export interface FakeMicrosoftGraphClientOptions {
  target?: MicrosoftGraphTarget;
  driveId?: string;
  siteId?: string | null;
}

/**
 * In-memory fake Microsoft Graph client for OneDrive and SharePoint unit tests.
 * Never performs network I/O or stores OAuth tokens.
 */
export class FakeMicrosoftGraphClient implements MicrosoftGraphHttpClient {
  private readonly folders = new Map<string, DriveFolder>();
  private readonly documents = new Map<string, DriveDocument>();
  private readonly changes: DriveChange[] = [];
  readonly target: MicrosoftGraphTarget;
  readonly driveId: string;
  readonly siteId: string | null;

  constructor(options: FakeMicrosoftGraphClientOptions = {}) {
    this.target = options.target ?? 'onedrive';
    this.driveId = options.driveId ?? 'ms-drive-default';
    this.siteId =
      options.siteId !== undefined
        ? options.siteId
        : this.target === 'sharepoint'
          ? 'ms-site-default'
          : null;
  }

  async createFolder(input: CreateFolderInput): Promise<DriveFolder> {
    await Promise.resolve();
    const folder: DriveFolder = {
      id: newId('msfolder'),
      name: input.name,
      parentFolderId: input.parentFolderId ?? null,
      driveId: input.driveId ?? this.driveId,
      siteId: input.siteId ?? this.siteId,
    };
    this.folders.set(folder.id, folder);
    return folder;
  }

  async findFolder(name: string, parentFolderId?: string | null): Promise<DriveFolder | null> {
    await Promise.resolve();
    for (const folder of this.folders.values()) {
      if (
        folder.name === name &&
        (parentFolderId === undefined || folder.parentFolderId === (parentFolderId ?? null))
      ) {
        return folder;
      }
    }
    return null;
  }

  async createDocument(input: CreateDocumentInput): Promise<DriveDocument> {
    await Promise.resolve();
    const driveId = input.driveId ?? this.driveId;
    const siteId = input.siteId ?? this.siteId;
    const host =
      this.target === 'sharepoint'
        ? `https://contoso.sharepoint.com/sites/demo/_layouts/15/Doc.aspx?sourcedoc=${encodeURIComponent(input.name)}`
        : `https://graph.microsoft.com/v1.0/me/drive/items/fake/${encodeURIComponent(input.name)}`;
    const doc: DriveDocument = {
      id: newId('msdoc'),
      name: input.name,
      parentFolderId: input.parentFolderId ?? null,
      content: input.content,
      mimeType: input.mimeType ?? 'text/markdown',
      modifiedAt: nowIso(),
      webViewLink: host,
      driveId,
      siteId,
    };
    this.documents.set(doc.id, doc);
    this.changes.push({
      fileId: doc.id,
      removed: false,
      modifiedAt: doc.modifiedAt,
      driveId,
      siteId,
    });
    return doc;
  }

  async updateDocument(input: UpdateDocumentInput): Promise<DriveDocument> {
    await Promise.resolve();
    const existing = this.documents.get(input.fileId);
    if (!existing) {
      throw new Error(`FakeMicrosoftGraphClient: document not found: ${input.fileId}`);
    }
    const updated: DriveDocument = {
      ...existing,
      content: input.content,
      name: input.name ?? existing.name,
      modifiedAt: nowIso(),
      driveId: input.driveId ?? existing.driveId ?? this.driveId,
      siteId: input.siteId ?? existing.siteId ?? this.siteId,
    };
    this.documents.set(updated.id, updated);
    this.changes.push({
      fileId: updated.id,
      removed: false,
      modifiedAt: updated.modifiedAt,
      driveId: updated.driveId,
      siteId: updated.siteId,
    });
    return updated;
  }

  async readDocument(fileId: string): Promise<DriveDocument> {
    await Promise.resolve();
    const doc = this.documents.get(fileId);
    if (!doc) {
      throw new Error(`FakeMicrosoftGraphClient: document not found: ${fileId}`);
    }
    return { ...doc };
  }

  async listChanges(pageToken?: string | null): Promise<{
    changes: DriveChange[];
    nextPageToken: string | null;
  }> {
    await Promise.resolve();
    void pageToken;
    // Simulates Graph delta/change tracking without network.
    return { changes: [...this.changes], nextPageToken: null };
  }

  async getMetadata(fileId: string): Promise<DriveFileMetadata> {
    await Promise.resolve();
    const doc = this.documents.get(fileId);
    if (doc) {
      return {
        id: doc.id,
        name: doc.name,
        mimeType: doc.mimeType,
        parentFolderId: doc.parentFolderId,
        modifiedAt: doc.modifiedAt,
        webViewLink: doc.webViewLink ?? null,
        md5Checksum: hashContent(doc.content).slice(0, 32),
        driveId: doc.driveId ?? this.driveId,
        siteId: doc.siteId ?? this.siteId,
      };
    }
    const folder = this.folders.get(fileId);
    if (folder) {
      return {
        id: folder.id,
        name: folder.name,
        mimeType: 'application/vnd.microsoft.graph.folder',
        parentFolderId: folder.parentFolderId,
        modifiedAt: nowIso(),
        webViewLink: null,
        md5Checksum: null,
        driveId: folder.driveId ?? this.driveId,
        siteId: folder.siteId ?? this.siteId,
      };
    }
    throw new Error(`FakeMicrosoftGraphClient: metadata not found: ${fileId}`);
  }

  async createShareLink(fileId: string, options?: ShareLinkOptions): Promise<string> {
    await Promise.resolve();
    const safe = assertShareLinkAllowed(options);
    const scope = safe.type === 'anyone' ? 'anonymous' : 'organization';
    return `https://graph.microsoft.com/v1.0/shares/fake/${fileId}?scope=${scope}`;
  }

  /** Test helper: inspect stored documents. */
  getStoredDocuments(): Map<string, DriveDocument> {
    return this.documents;
  }
}
