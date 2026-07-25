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
import type { GoogleDriveHttpClient } from './http-client.js';

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory fake Google client for unit tests.
 */
export class FakeGoogleClient implements GoogleDriveHttpClient {
  private readonly folders = new Map<string, DriveFolder>();
  private readonly documents = new Map<string, DriveDocument>();
  private readonly changes: DriveChange[] = [];

  async createFolder(input: CreateFolderInput): Promise<DriveFolder> {
    await Promise.resolve();
    const folder: DriveFolder = {
      id: newId('gfolder'),
      name: input.name,
      parentFolderId: input.parentFolderId ?? null,
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
    const doc: DriveDocument = {
      id: newId('gdoc'),
      name: input.name,
      parentFolderId: input.parentFolderId ?? null,
      content: input.content,
      mimeType: input.mimeType ?? 'text/markdown',
      modifiedAt: nowIso(),
      webViewLink: `https://drive.google.com/file/d/fake/${input.name}`,
    };
    this.documents.set(doc.id, doc);
    this.changes.push({ fileId: doc.id, removed: false, modifiedAt: doc.modifiedAt });
    return doc;
  }

  async updateDocument(input: UpdateDocumentInput): Promise<DriveDocument> {
    await Promise.resolve();
    const existing = this.documents.get(input.fileId);
    if (!existing) {
      throw new Error(`FakeGoogleClient: document not found: ${input.fileId}`);
    }
    const updated: DriveDocument = {
      ...existing,
      content: input.content,
      name: input.name ?? existing.name,
      modifiedAt: nowIso(),
    };
    this.documents.set(updated.id, updated);
    this.changes.push({ fileId: updated.id, removed: false, modifiedAt: updated.modifiedAt });
    return updated;
  }

  async readDocument(fileId: string): Promise<DriveDocument> {
    await Promise.resolve();
    const doc = this.documents.get(fileId);
    if (!doc) {
      throw new Error(`FakeGoogleClient: document not found: ${fileId}`);
    }
    return { ...doc };
  }

  async listChanges(pageToken?: string | null): Promise<{
    changes: DriveChange[];
    nextPageToken: string | null;
  }> {
    await Promise.resolve();
    void pageToken;
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
        md5Checksum: null,
      };
    }
    const folder = this.folders.get(fileId);
    if (folder) {
      return {
        id: folder.id,
        name: folder.name,
        mimeType: 'application/vnd.google-apps.folder',
        parentFolderId: folder.parentFolderId,
        modifiedAt: nowIso(),
        webViewLink: null,
        md5Checksum: null,
      };
    }
    throw new Error(`FakeGoogleClient: metadata not found: ${fileId}`);
  }

  async createShareLink(fileId: string, options?: ShareLinkOptions): Promise<string> {
    await Promise.resolve();
    void options;
    return `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
  }

  /** Test helper: inspect stored documents. */
  getStoredDocuments(): Map<string, DriveDocument> {
    return this.documents;
  }
}
