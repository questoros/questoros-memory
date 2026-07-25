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
 * Injectable Microsoft Graph client surface used by MicrosoftGraphDriveProvider.
 * Real Graph wiring can replace FakeMicrosoftGraphClient after live approval.
 */
export interface MicrosoftGraphHttpClient {
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

export type HttpClient = MicrosoftGraphHttpClient;
