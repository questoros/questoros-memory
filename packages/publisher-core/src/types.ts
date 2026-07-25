export const SYNC_DIRECTIONS = ['EXPORT_ONLY', 'IMPORT_ONLY', 'BIDIRECTIONAL_REVIEWED'] as const;
export type SyncDirection = (typeof SYNC_DIRECTIONS)[number];

export const SYNC_STATUSES = [
  'PENDING',
  'PUBLISHED',
  'EXTERNAL_CHANGED',
  'SYNC_CONFLICT',
  'REPUBLISHED',
  'FAILED',
] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export interface PublishedArtifactMetadata {
  provider: string;
  externalFileId: string;
  externalUrl: string | null;
  parentFolderId: string | null;
  artifactType: string;
  sourceMemoryIds: string[];
  sourceRevisionIds: string[];
  publishedAt: string;
  publishedBy: string;
  lastExternalModifiedAt: string | null;
  lastSyncedContentHash: string;
  syncDirection: SyncDirection;
  syncStatus: SyncStatus;
  title?: string;
}

export interface DriveFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
}

export interface DriveDocument {
  id: string;
  name: string;
  parentFolderId: string | null;
  content: string;
  mimeType: string;
  modifiedAt: string;
  webViewLink?: string | null;
}

export interface DriveChange {
  fileId: string;
  removed: boolean;
  modifiedAt: string;
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  parentFolderId: string | null;
  modifiedAt: string;
  webViewLink?: string | null;
  md5Checksum?: string | null;
}

export interface CreateFolderInput {
  name: string;
  parentFolderId?: string | null;
}

export interface CreateDocumentInput {
  name: string;
  content: string;
  parentFolderId?: string | null;
  mimeType?: string;
}

export interface UpdateDocumentInput {
  fileId: string;
  content: string;
  name?: string;
}

export interface ShareLinkOptions {
  role?: 'reader' | 'commenter' | 'writer';
  type?: 'anyone' | 'user' | 'domain';
}

/**
 * Provider-neutral Drive connector (Phase 5 addendum).
 */
export interface DriveProvider {
  createFolder(input: CreateFolderInput): Promise<DriveFolder>;
  findFolder(name: string, parentFolderId?: string | null): Promise<DriveFolder | null>;
  createDocument(input: CreateDocumentInput): Promise<DriveDocument>;
  updateDocument(input: UpdateDocumentInput): Promise<DriveDocument>;
  readDocument(fileId: string): Promise<DriveDocument>;
  listChanges(
    pageToken?: string | null,
  ): Promise<{ changes: DriveChange[]; nextPageToken: string | null }>;
  getMetadata(fileId: string): Promise<DriveFileMetadata>;
  createShareLink(fileId: string, options?: ShareLinkOptions): Promise<string>;
}

export interface PublishDocumentInput {
  title: string;
  content: string;
  artifactType: string;
  parentFolderId?: string | null;
  sourceMemoryIds: string[];
  sourceRevisionIds: string[];
  publishedBy: string;
  syncDirection?: SyncDirection;
  provider?: string;
}

/**
 * Higher-level publisher that writes approved intelligence to Drive.
 */
export interface DocumentPublisher {
  publish(input: PublishDocumentInput): Promise<PublishedArtifactMetadata>;
  republish(
    metadata: PublishedArtifactMetadata,
    content: string,
  ): Promise<PublishedArtifactMetadata>;
}

export interface ExternalChangeResult {
  externalFileId: string;
  content: string;
  contentHash: string;
  modifiedAt: string;
  changed: boolean;
  syncConflict: boolean;
}

/**
 * Reads external Drive edits for governed candidate creation.
 */
export interface ExternalChangeReader {
  detectChange(
    metadata: PublishedArtifactMetadata,
    options?: { localContentHash?: string },
  ): Promise<ExternalChangeResult>;
  listChanges(pageToken?: string | null): Promise<{
    changes: DriveChange[];
    nextPageToken: string | null;
  }>;
}
