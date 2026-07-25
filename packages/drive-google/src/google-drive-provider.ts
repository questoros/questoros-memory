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
} from '@questoros-memory/publisher-core';
import { DriveNotConfiguredError } from './errors.js';
import type { GoogleDriveHttpClient } from './http-client.js';

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export interface GoogleDriveProviderOptions {
  client?: GoogleDriveHttpClient;
  driveId?: string | null;
}

/**
 * Google Drive adapter. Requires an injectable client for operations.
 * Without options.client, every method throws DriveNotConfiguredError.
 */
export class GoogleDriveProvider implements DriveProvider, DocumentPublisher, ExternalChangeReader {
  readonly providerName = 'google-drive' as const;
  readonly driveId: string | null;
  private readonly client: GoogleDriveHttpClient | null;

  constructor(options: GoogleDriveProviderOptions = {}) {
    this.client = options.client ?? null;
    this.driveId = options.driveId ?? 'google-drive-default';
  }

  private requireClient(): GoogleDriveHttpClient {
    if (!this.client) {
      throw new DriveNotConfiguredError();
    }
    return this.client;
  }

  async createFolder(input: CreateFolderInput): Promise<DriveFolder> {
    return this.requireClient().createFolder({
      ...input,
      driveId: input.driveId ?? this.driveId,
    });
  }

  async findFolder(name: string, parentFolderId?: string | null): Promise<DriveFolder | null> {
    return this.requireClient().findFolder(name, parentFolderId);
  }

  async createDocument(input: CreateDocumentInput): Promise<DriveDocument> {
    return this.requireClient().createDocument({
      ...input,
      driveId: input.driveId ?? this.driveId,
    });
  }

  async updateDocument(input: UpdateDocumentInput): Promise<DriveDocument> {
    return this.requireClient().updateDocument({
      ...input,
      driveId: input.driveId ?? this.driveId,
    });
  }

  async readDocument(fileId: string): Promise<DriveDocument> {
    return this.requireClient().readDocument(fileId);
  }

  async listChanges(pageToken?: string | null): Promise<{
    changes: DriveChange[];
    nextPageToken: string | null;
  }> {
    return this.requireClient().listChanges(pageToken);
  }

  async getMetadata(fileId: string): Promise<DriveFileMetadata> {
    return this.requireClient().getMetadata(fileId);
  }

  async createShareLink(fileId: string, options?: ShareLinkOptions): Promise<string> {
    return this.requireClient().createShareLink(fileId, options);
  }

  async publish(input: PublishDocumentInput): Promise<PublishedArtifactMetadata> {
    const doc = await this.createDocument({
      name: input.title,
      content: input.content,
      parentFolderId: input.parentFolderId,
      mimeType: 'text/markdown',
      driveId: input.driveId ?? this.driveId,
    });
    const syncDirection: SyncDirection = input.syncDirection ?? 'BIDIRECTIONAL_REVIEWED';
    return {
      provider: input.provider ?? this.providerName,
      driveId: doc.driveId ?? this.driveId,
      siteId: null,
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
      driveId: metadata.driveId ?? this.driveId,
    });
    return {
      ...metadata,
      provider: metadata.provider || this.providerName,
      driveId: doc.driveId ?? metadata.driveId ?? this.driveId,
      siteId: null,
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
