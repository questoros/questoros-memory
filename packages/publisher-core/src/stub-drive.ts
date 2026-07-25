import { createHash } from 'node:crypto';
import type {
  CreateDocumentInput,
  CreateFolderInput,
  DocumentPublisher,
  DriveChange,
  DriveDocument,
  DriveFileMetadata,
  DriveFolder,
  DriveProvider,
  ExternalChangeReader,
  ExternalChangeResult,
  PublishDocumentInput,
  PublishedArtifactMetadata,
  ShareLinkOptions,
  SyncDirection,
  UpdateDocumentInput,
} from './types.js';
import { assertShareLinkAllowed } from './types.js';

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory DriveProvider for unit tests (no network).
 */
export class StubDriveProvider implements DriveProvider, DocumentPublisher, ExternalChangeReader {
  private readonly folders = new Map<string, DriveFolder>();
  private readonly documents = new Map<string, DriveDocument>();
  private readonly changes: DriveChange[] = [];
  readonly providerName = 'stub';
  readonly driveId = 'stub-drive';

  async createFolder(input: CreateFolderInput): Promise<DriveFolder> {
    await Promise.resolve();
    const folder: DriveFolder = {
      id: newId('folder'),
      name: input.name,
      parentFolderId: input.parentFolderId ?? null,
      driveId: input.driveId ?? this.driveId,
      siteId: input.siteId ?? null,
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
      id: newId('doc'),
      name: input.name,
      parentFolderId: input.parentFolderId ?? null,
      content: input.content,
      mimeType: input.mimeType ?? 'text/markdown',
      modifiedAt: nowIso(),
      webViewLink: `stub://docs/${input.name}`,
      driveId: input.driveId ?? this.driveId,
      siteId: input.siteId ?? null,
    };
    this.documents.set(doc.id, doc);
    this.changes.push({
      fileId: doc.id,
      removed: false,
      modifiedAt: doc.modifiedAt,
      driveId: doc.driveId,
      siteId: doc.siteId,
    });
    return doc;
  }

  async updateDocument(input: UpdateDocumentInput): Promise<DriveDocument> {
    await Promise.resolve();
    const existing = this.documents.get(input.fileId);
    if (!existing) {
      throw new Error(`StubDriveProvider: document not found: ${input.fileId}`);
    }
    const updated: DriveDocument = {
      ...existing,
      content: input.content,
      name: input.name ?? existing.name,
      modifiedAt: nowIso(),
      driveId: input.driveId ?? existing.driveId,
      siteId: input.siteId ?? existing.siteId,
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
      throw new Error(`StubDriveProvider: document not found: ${fileId}`);
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
        md5Checksum: hashContent(doc.content).slice(0, 32),
        driveId: doc.driveId ?? this.driveId,
        siteId: doc.siteId ?? null,
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
        driveId: folder.driveId ?? this.driveId,
        siteId: folder.siteId ?? null,
      };
    }
    throw new Error(`StubDriveProvider: metadata not found: ${fileId}`);
  }

  async createShareLink(fileId: string, options?: ShareLinkOptions): Promise<string> {
    const safe = assertShareLinkAllowed(options);
    const meta = await this.getMetadata(fileId);
    return `stub://share/${meta.id}?scope=${safe.type ?? 'organization'}`;
  }

  async publish(input: PublishDocumentInput): Promise<PublishedArtifactMetadata> {
    const doc = await this.createDocument({
      name: input.title,
      content: input.content,
      parentFolderId: input.parentFolderId,
      mimeType: 'text/markdown',
      driveId: input.driveId ?? this.driveId,
      siteId: input.siteId ?? null,
    });
    const syncDirection: SyncDirection = input.syncDirection ?? 'BIDIRECTIONAL_REVIEWED';
    return {
      provider: input.provider ?? this.providerName,
      driveId: doc.driveId ?? this.driveId,
      siteId: doc.siteId ?? null,
      externalFileId: doc.id,
      externalUrl: doc.webViewLink ?? null,
      parentFolderId: doc.parentFolderId,
      artifactType: input.artifactType,
      sourceMemoryIds: [...input.sourceMemoryIds],
      sourceRevisionIds: [...input.sourceRevisionIds],
      publishedAt: doc.modifiedAt,
      publishedBy: input.publishedBy,
      lastExternalModifiedAt: doc.modifiedAt,
      lastSyncedContentHash: hashContent(input.content),
      syncDirection,
      syncStatus: 'PUBLISHED',
      title: input.title,
    };
  }

  async republish(
    metadata: PublishedArtifactMetadata,
    content: string,
  ): Promise<PublishedArtifactMetadata> {
    const doc = await this.updateDocument({
      fileId: metadata.externalFileId,
      content,
      driveId: metadata.driveId,
      siteId: metadata.siteId,
    });
    return {
      ...metadata,
      driveId: doc.driveId ?? metadata.driveId ?? this.driveId,
      siteId: doc.siteId ?? metadata.siteId ?? null,
      lastExternalModifiedAt: doc.modifiedAt,
      lastSyncedContentHash: hashContent(content),
      syncStatus: 'REPUBLISHED',
      publishedAt: doc.modifiedAt,
    };
  }

  async detectChange(
    metadata: PublishedArtifactMetadata,
    options?: { localContentHash?: string },
  ): Promise<ExternalChangeResult> {
    const doc = await this.readDocument(metadata.externalFileId);
    const contentHash = hashContent(doc.content);
    const changed = contentHash !== metadata.lastSyncedContentHash;
    const localChanged =
      options?.localContentHash !== undefined &&
      options.localContentHash !== metadata.lastSyncedContentHash;
    return {
      externalFileId: doc.id,
      content: doc.content,
      contentHash,
      modifiedAt: doc.modifiedAt,
      changed,
      syncConflict: Boolean(changed && localChanged),
    };
  }
}
