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
  DriveProviderName,
  ExternalChangeReader,
  ExternalChangeResult,
  PublishDocumentInput,
  PublishedArtifactMetadata,
  ShareLinkOptions,
  SyncDirection,
  UpdateDocumentInput,
} from '@questoros-memory/publisher-core';
import { DriveNotConfiguredError } from './errors.js';
import type { MicrosoftGraphHttpClient } from './http-client.js';

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export type MicrosoftGraphMode = 'onedrive' | 'sharepoint';

export interface MicrosoftGraphDriveProviderOptions {
  /** Injectable Graph client. Required for any real operation; omit to keep live calls gated. */
  client?: MicrosoftGraphHttpClient;
  mode?: MicrosoftGraphMode;
  driveId?: string | null;
  siteId?: string | null;
}

/**
 * Microsoft Graph adapter for OneDrive personal/business and SharePoint libraries.
 * Without options.client, every method throws DriveNotConfiguredError (no live calls).
 */
export class MicrosoftGraphDriveProvider
  implements DriveProvider, DocumentPublisher, ExternalChangeReader
{
  readonly providerName: DriveProviderName;
  readonly mode: MicrosoftGraphMode;
  readonly driveId: string | null;
  readonly siteId: string | null;
  private readonly client: MicrosoftGraphHttpClient | null;

  constructor(options: MicrosoftGraphDriveProviderOptions = {}) {
    this.client = options.client ?? null;
    this.mode = options.mode ?? 'onedrive';
    this.providerName = this.mode === 'sharepoint' ? 'microsoft-sharepoint' : 'microsoft-onedrive';
    this.driveId = options.driveId ?? null;
    this.siteId = options.siteId ?? (this.mode === 'sharepoint' ? null : null);
  }

  private requireClient(): MicrosoftGraphHttpClient {
    if (!this.client) {
      throw new DriveNotConfiguredError();
    }
    return this.client;
  }

  async createFolder(input: CreateFolderInput): Promise<DriveFolder> {
    return this.requireClient().createFolder({
      ...input,
      driveId: input.driveId ?? this.driveId,
      siteId: input.siteId ?? this.siteId,
    });
  }

  async findFolder(name: string, parentFolderId?: string | null): Promise<DriveFolder | null> {
    return this.requireClient().findFolder(name, parentFolderId);
  }

  async createDocument(input: CreateDocumentInput): Promise<DriveDocument> {
    return this.requireClient().createDocument({
      ...input,
      driveId: input.driveId ?? this.driveId,
      siteId: input.siteId ?? this.siteId,
    });
  }

  async updateDocument(input: UpdateDocumentInput): Promise<DriveDocument> {
    return this.requireClient().updateDocument({
      ...input,
      driveId: input.driveId ?? this.driveId,
      siteId: input.siteId ?? this.siteId,
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
      siteId: input.siteId ?? this.siteId,
    });
    const syncDirection: SyncDirection = input.syncDirection ?? 'BIDIRECTIONAL_REVIEWED';
    return {
      provider: input.provider ?? this.providerName,
      driveId: doc.driveId ?? this.driveId,
      siteId: doc.siteId ?? this.siteId,
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
      siteId: metadata.siteId ?? this.siteId,
    });
    return {
      ...metadata,
      provider: metadata.provider || this.providerName,
      driveId: doc.driveId ?? metadata.driveId ?? this.driveId,
      siteId: doc.siteId ?? metadata.siteId ?? this.siteId,
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
