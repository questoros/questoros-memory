import type {
  CreateDocumentInput,
  CreateFolderInput,
  DriveChange,
  DriveDocument,
  DriveFileMetadata,
  DriveFolder,
  DriveProvider,
  ShareLinkOptions,
  UpdateDocumentInput,
} from '@questoros-memory/publisher-core';
import { DriveNotConfiguredError } from './errors.js';
import type { GoogleDriveHttpClient } from './http-client.js';

export interface GoogleDriveProviderOptions {
  client?: GoogleDriveHttpClient;
}

/**
 * Google Drive adapter. Requires an injectable client for operations.
 * Without options.client, every method throws DriveNotConfiguredError.
 */
export class GoogleDriveProvider implements DriveProvider {
  readonly providerName = 'google-drive';
  private readonly client: GoogleDriveHttpClient | null;

  constructor(options: GoogleDriveProviderOptions = {}) {
    this.client = options.client ?? null;
  }

  private requireClient(): GoogleDriveHttpClient {
    if (!this.client) {
      throw new DriveNotConfiguredError();
    }
    return this.client;
  }

  async createFolder(input: CreateFolderInput): Promise<DriveFolder> {
    return this.requireClient().createFolder(input);
  }

  async findFolder(name: string, parentFolderId?: string | null): Promise<DriveFolder | null> {
    return this.requireClient().findFolder(name, parentFolderId);
  }

  async createDocument(input: CreateDocumentInput): Promise<DriveDocument> {
    return this.requireClient().createDocument(input);
  }

  async updateDocument(input: UpdateDocumentInput): Promise<DriveDocument> {
    return this.requireClient().updateDocument(input);
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
}
