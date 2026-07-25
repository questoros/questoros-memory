import type { PrismaClient, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

export type HarvestRunRow = {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  projectId: string | null;
  actorId: string | null;
  sourceArtifactId: string | null;
  scopeType: string;
  scopeId: string;
  status: string;
  title: string | null;
  errorMessage: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

export type MemoryCandidateRow = {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  projectId: string | null;
  harvestRunId: string;
  sourceArtifactId: string | null;
  scopeType: string;
  scopeId: string;
  memoryType: string;
  status: string;
  content: string;
  contentHash: string;
  confidence: Prisma.Decimal;
  relatedMemoryIds: Prisma.JsonValue;
  approvedMemoryId: string | null;
  reviewReason: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
};

export type PublishedArtifactRow = {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  projectId: string | null;
  actorId: string | null;
  scopeType: string;
  scopeId: string;
  provider: string;
  externalFileId: string | null;
  externalUrl: string | null;
  parentFolderId: string | null;
  artifactType: string;
  title: string;
  content: string;
  sourceMemoryIds: Prisma.JsonValue;
  sourceRevisionIds: Prisma.JsonValue;
  publishedAt: Date;
  lastExternalModifiedAt: Date | null;
  lastSyncedContentHash: string;
  syncDirection: string;
  syncStatus: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export async function insertHarvestRun(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    tenantId: string;
    workspaceId: string | null;
    projectId: string | null;
    actorId: string | null;
    sourceArtifactId: string | null;
    scopeType: string;
    scopeId: string;
    status?: string;
    title?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<HarvestRunRow> {
  return prisma.harvestRun.create({
    data: {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      actorId: input.actorId,
      sourceArtifactId: input.sourceArtifactId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      status: input.status ?? 'PENDING',
      title: input.title ?? null,
      metadata: asJson(input.metadata ?? {}),
    },
  });
}

export async function updateHarvestRun(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  runId: string,
  data: {
    status?: string;
    errorMessage?: string | null;
    completedAt?: Date | null;
    sourceArtifactId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<HarvestRunRow> {
  return prisma.harvestRun.update({
    where: { tenantId_id: { tenantId, id: runId } },
    data: {
      status: data.status,
      errorMessage: data.errorMessage,
      completedAt: data.completedAt,
      sourceArtifactId: data.sourceArtifactId,
      ...(data.metadata !== undefined ? { metadata: asJson(data.metadata) } : {}),
      updatedAt: new Date(),
    },
  });
}

export async function getHarvestRun(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  runId: string,
): Promise<HarvestRunRow | null> {
  return prisma.harvestRun.findUnique({
    where: { tenantId_id: { tenantId, id: runId } },
  });
}

export async function insertMemoryCandidate(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    tenantId: string;
    workspaceId: string | null;
    projectId: string | null;
    harvestRunId: string;
    sourceArtifactId: string | null;
    scopeType: string;
    scopeId: string;
    memoryType: string;
    status?: string;
    content: string;
    confidence?: number;
    relatedMemoryIds?: string[];
    metadata?: Record<string, unknown>;
  },
): Promise<MemoryCandidateRow> {
  const contentHash = hashContent(input.content);
  return prisma.memoryCandidate.create({
    data: {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      harvestRunId: input.harvestRunId,
      sourceArtifactId: input.sourceArtifactId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      memoryType: input.memoryType,
      status: input.status ?? 'PENDING',
      content: input.content,
      contentHash,
      confidence: input.confidence ?? 1,
      relatedMemoryIds: asJson(input.relatedMemoryIds ?? []),
      metadata: asJson(input.metadata ?? {}),
    },
  });
}

export async function getMemoryCandidate(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  candidateId: string,
): Promise<MemoryCandidateRow | null> {
  return prisma.memoryCandidate.findUnique({
    where: { tenantId_id: { tenantId, id: candidateId } },
  });
}

export async function listMemoryCandidates(
  prisma: PrismaClient | Prisma.TransactionClient,
  filter: {
    tenantId: string;
    harvestRunId?: string;
    status?: string;
    scopeType?: string;
    scopeId?: string;
    limit?: number;
  },
): Promise<MemoryCandidateRow[]> {
  return prisma.memoryCandidate.findMany({
    where: {
      tenantId: filter.tenantId,
      harvestRunId: filter.harvestRunId,
      status: filter.status,
      scopeType: filter.scopeType,
      scopeId: filter.scopeId,
    },
    orderBy: { createdAt: 'desc' },
    take: filter.limit ?? 50,
  });
}

export async function updateMemoryCandidate(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  candidateId: string,
  data: {
    status?: string;
    approvedMemoryId?: string | null;
    reviewReason?: string | null;
    relatedMemoryIds?: string[];
    reviewedAt?: Date | null;
  },
): Promise<MemoryCandidateRow> {
  return prisma.memoryCandidate.update({
    where: { tenantId_id: { tenantId, id: candidateId } },
    data: {
      status: data.status,
      approvedMemoryId: data.approvedMemoryId,
      reviewReason: data.reviewReason,
      reviewedAt: data.reviewedAt,
      ...(data.relatedMemoryIds !== undefined
        ? { relatedMemoryIds: asJson(data.relatedMemoryIds) }
        : {}),
      updatedAt: new Date(),
    },
  });
}

export async function insertPublishedArtifact(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    tenantId: string;
    workspaceId: string | null;
    projectId: string | null;
    actorId: string | null;
    scopeType: string;
    scopeId: string;
    provider: string;
    externalFileId?: string | null;
    externalUrl?: string | null;
    parentFolderId?: string | null;
    artifactType: string;
    title: string;
    content: string;
    sourceMemoryIds?: string[];
    sourceRevisionIds?: string[];
    lastSyncedContentHash: string;
    syncDirection: string;
    syncStatus: string;
    metadata?: Record<string, unknown>;
  },
): Promise<PublishedArtifactRow> {
  return prisma.publishedArtifact.create({
    data: {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      actorId: input.actorId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      provider: input.provider,
      externalFileId: input.externalFileId ?? null,
      externalUrl: input.externalUrl ?? null,
      parentFolderId: input.parentFolderId ?? null,
      artifactType: input.artifactType,
      title: input.title,
      content: input.content,
      sourceMemoryIds: asJson(input.sourceMemoryIds ?? []),
      sourceRevisionIds: asJson(input.sourceRevisionIds ?? []),
      lastSyncedContentHash: input.lastSyncedContentHash,
      syncDirection: input.syncDirection,
      syncStatus: input.syncStatus,
      metadata: asJson(input.metadata ?? {}),
    },
  });
}

export async function getPublishedArtifact(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  artifactId: string,
): Promise<PublishedArtifactRow | null> {
  return prisma.publishedArtifact.findUnique({
    where: { tenantId_id: { tenantId, id: artifactId } },
  });
}

export async function updatePublishedArtifact(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  artifactId: string,
  data: {
    content?: string;
    externalFileId?: string | null;
    externalUrl?: string | null;
    lastSyncedContentHash?: string;
    lastExternalModifiedAt?: Date | null;
    syncStatus?: string;
    sourceMemoryIds?: string[];
    sourceRevisionIds?: string[];
    metadata?: Record<string, unknown>;
  },
): Promise<PublishedArtifactRow> {
  return prisma.publishedArtifact.update({
    where: { tenantId_id: { tenantId, id: artifactId } },
    data: {
      content: data.content,
      externalFileId: data.externalFileId,
      externalUrl: data.externalUrl,
      lastSyncedContentHash: data.lastSyncedContentHash,
      lastExternalModifiedAt: data.lastExternalModifiedAt,
      syncStatus: data.syncStatus,
      ...(data.sourceMemoryIds !== undefined
        ? { sourceMemoryIds: asJson(data.sourceMemoryIds) }
        : {}),
      ...(data.sourceRevisionIds !== undefined
        ? { sourceRevisionIds: asJson(data.sourceRevisionIds) }
        : {}),
      ...(data.metadata !== undefined ? { metadata: asJson(data.metadata) } : {}),
      updatedAt: new Date(),
    },
  });
}

export async function insertSourceArtifact(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    tenantId: string;
    workspaceId: string | null;
    projectId: string | null;
    sourceType: string;
    sourceUri?: string | null;
    contentType?: string | null;
    checksumSha256?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  return prisma.sourceArtifact.create({
    data: {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      sourceType: input.sourceType,
      sourceUri: input.sourceUri ?? null,
      contentType: input.contentType ?? 'text/plain',
      checksumSha256: input.checksumSha256 ?? null,
      metadata: asJson(input.metadata ?? {}),
    },
  });
}
