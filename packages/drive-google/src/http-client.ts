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

/**
 * Minimal injectable client surface used by GoogleDriveProvider.
 * Real Google API wiring can replace FakeGoogleClient later.
 */
export interface GoogleDriveHttpClient {
  createFolder(input: CreateFolderInput): Promise<DriveFolder>;
  findFolder(name: string, parentFolderId?: string | null): Promise<DriveFolder | null>;
  createDocument(input: CreateDocumentInput): Promise<DriveDocument>;
  updateDocument(input: UpdateDocumentInput): Promise<DriveDocument>;
  readDocument(fileId: string): Promise<DriveDocument>;
  listChanges(pageToken?: string | null): Promise<{
    changes: DriveChange[];
    nextPageToken: string | null;
  }>;
  getMetadata(fileId: string): Promise<DriveFileMetadata>;
  createShareLink(fileId: string, options?: ShareLinkOptions): Promise<string>;
}

export type HttpClient = GoogleDriveHttpClient;
