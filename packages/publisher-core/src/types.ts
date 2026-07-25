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

/**
 * Canonical publisher provider identifiers.
 * Organizational-intelligence logic must never import provider-specific packages.
 */
export const DRIVE_PROVIDERS = [
  'stub',
  'google-drive',
  'microsoft-onedrive',
  'microsoft-sharepoint',
] as const;
export type DriveProviderName = (typeof DRIVE_PROVIDERS)[number];

export interface PublishedArtifactMetadata {
  provider: DriveProviderName;
  /** Provider drive / library root identifier (OneDrive driveId or Google drive). */
  driveId?: string | null;
  /** SharePoint site id when provider is microsoft-sharepoint. */
  siteId?: string | null;
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
  driveId?: string | null;
  siteId?: string | null;
}

export interface DriveDocument {
  id: string;
  name: string;
  parentFolderId: string | null;
  content: string;
  mimeType: string;
  modifiedAt: string;
  webViewLink?: string | null;
  driveId?: string | null;
  siteId?: string | null;
}

export interface DriveChange {
  fileId: string;
  removed: boolean;
  modifiedAt: string;
  driveId?: string | null;
  siteId?: string | null;
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  parentFolderId: string | null;
  modifiedAt: string;
  webViewLink?: string | null;
  md5Checksum?: string | null;
  driveId?: string | null;
  siteId?: string | null;
}

export interface CreateFolderInput {
  name: string;
  parentFolderId?: string | null;
  driveId?: string | null;
  siteId?: string | null;
}

export interface CreateDocumentInput {
  name: string;
  content: string;
  parentFolderId?: string | null;
  mimeType?: string;
  driveId?: string | null;
  siteId?: string | null;
}

export interface UpdateDocumentInput {
  fileId: string;
  content: string;
  name?: string;
  driveId?: string | null;
  siteId?: string | null;
}

export interface ShareLinkOptions {
  role?: 'reader' | 'commenter' | 'writer';
  /**
   * Share scope. Default is organization/domain — never `anyone` unless
   * `allowPublic` is explicitly true.
   */
  type?: 'anyone' | 'user' | 'domain' | 'organization';
  /** Required for type=anyone. Public links are disabled by default. */
  allowPublic?: boolean;
}

/**
 * Provider-neutral Drive connector (Google Drive + Microsoft OneDrive/SharePoint).
 */
export interface DriveProvider {
  readonly providerName: string;
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
  provider?: DriveProviderName;
  driveId?: string | null;
  siteId?: string | null;
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

/** Reject automatic public share links unless explicitly approved. */
export function assertShareLinkAllowed(options?: ShareLinkOptions): ShareLinkOptions {
  const type = options?.type ?? 'organization';
  if (type === 'anyone' && options?.allowPublic !== true) {
    throw new Error(
      'Public share links are disabled by default. Set allowPublic=true only with explicit approval.',
    );
  }
  return { ...options, type };
}
