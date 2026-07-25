/**
 * Phase 5 final-review governance tests (no live Drive / model calls).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '@questoros-memory/memory-core';
import { ERROR_CODES, ServiceError } from '@questoros-memory/memory-core';
import type {
  MemoryRow,
  RevisionRow,
  MemoryCandidateRow,
  PublishedArtifactRow,
} from '@questoros-memory/database';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const API_KEY_ID = '33333333-3333-4333-8333-333333333333';
const WORKSPACE_ID = '44444444-4444-4444-8444-444444444444';
const PROJECT_ID = '55555555-5555-4555-8555-555555555555';
const MEMORY_ID = '66666666-6666-4666-8666-666666666666';
const REVISION_ID = '77777777-7777-4777-8777-777777777777';
const OTHER_MEMORY = '88888888-8888-4888-8888-888888888888';
const OTHER_REVISION = '99999999-9999-4999-8999-999999999999';
const ARTIFACT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CANDIDATE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HARVEST_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const mockPrisma = {} as PrismaClient;

vi.mock('@questoros-memory/database', async () => {
  const actual = await vi.importActual<typeof import('@questoros-memory/database')>(
    '@questoros-memory/database',
  );
  return {
    ...actual,
    withTransaction: vi.fn(async (_prisma, fn) => fn(mockPrisma)),
    getMemory: vi.fn(),
    getRevision: vi.fn(),
    getMemoryCandidate: vi.fn(),
    getPublishedArtifact: vi.fn(),
    insertPublishedArtifact: vi.fn(),
    updatePublishedArtifact: vi.fn(),
    updatePublishedArtifactIfMatch: vi.fn(),
    insertAuditEvent: vi.fn(),
    hashContent: actual.hashContent,
  };
});

import * as repo from '@questoros-memory/database';
import {
  publishArtifact,
  republishArtifact,
  __registerDriveBackend,
  __resetDriveBackends,
} from '../src/phase5.js';

function projectAuth(
  permissions: AuthContext['permissions'] = ['memory:read', 'memory:publish', 'memory:review'],
): AuthContext {
  return {
    apiKeyId: API_KEY_ID,
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    credentialScope: {
      scopeType: 'PROJECT',
      scopeId: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    },
    permissions,
  };
}

function makeMemory(overrides: Partial<MemoryRow> = {}): MemoryRow {
  const now = new Date('2026-07-24T12:00:00.000Z');
  return {
    id: MEMORY_ID,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    actorId: ACTOR_ID,
    sourceArtifactId: null,
    scopeType: 'PROJECT',
    scopeId: PROJECT_ID,
    memoryType: 'FACT',
    status: 'ACTIVE',
    content: 'Closing date: August 20, 2026',
    contentHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    importance: 0.5,
    confidence: 1,
    sensitivity: 'STANDARD',
    validFrom: now,
    validUntil: null,
    supersededById: null,
    metadata: { ownershipClassification: 'PROJECT' },
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeRevision(overrides: Partial<RevisionRow> = {}): RevisionRow {
  return {
    id: REVISION_ID,
    tenantId: TENANT_ID,
    memoryId: MEMORY_ID,
    revisionNumber: 2,
    content: 'Closing date: August 20, 2026',
    contentHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    reason: 'Approved harvest candidate correction.',
    createdByActorId: ACTOR_ID,
    createdAt: new Date('2026-07-24T12:00:00.000Z'),
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<PublishedArtifactRow> = {}): PublishedArtifactRow {
  const now = new Date('2026-07-24T12:00:00.000Z');
  return {
    id: ARTIFACT_ID,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    actorId: ACTOR_ID,
    scopeType: 'PROJECT',
    scopeId: PROJECT_ID,
    provider: 'stub',
    externalFileId: 'file-1',
    externalUrl: 'https://example.test/file-1',
    parentFolderId: 'folder-1',
    artifactType: 'intelligence-brief',
    title: 'Brief',
    content: 'old',
    sourceMemoryIds: [MEMORY_ID],
    sourceRevisionIds: [REVISION_ID],
    publishedAt: now,
    lastExternalModifiedAt: now,
    lastSyncedContentHash: 'oldhash',
    syncDirection: 'BIDIRECTIONAL_REVIEWED',
    syncStatus: 'SYNC_CONFLICT',
    metadata: { syncHarvestRunId: HARVEST_ID, driveId: 'stub' },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<MemoryCandidateRow> = {}): MemoryCandidateRow {
  const now = new Date('2026-07-24T12:00:00.000Z');
  return {
    id: CANDIDATE_ID,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    harvestRunId: HARVEST_ID,
    sourceArtifactId: null,
    scopeType: 'PROJECT',
    scopeId: PROJECT_ID,
    memoryType: 'FACT',
    status: 'APPROVED',
    content: 'Closing date: August 20, 2026',
    contentHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    confidence: 1,
    relatedMemoryIds: [MEMORY_ID],
    approvedMemoryId: MEMORY_ID,
    reviewReason: 'ok',
    metadata: {},
    createdAt: now,
    updatedAt: now,
    reviewedAt: now,
    ...overrides,
  };
}

describe('publisher fail-closed and provenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetDriveBackends();
  });

  afterEach(() => {
    __resetDriveBackends();
  });

  it('returns 503 for unconfigured google-drive without creating artifacts', async () => {
    await expect(
      publishArtifact(mockPrisma, projectAuth(), {
        scopeType: 'PROJECT',
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        title: 'Brief',
        content: 'x',
        provider: 'google-drive',
        sourceMemoryIds: [],
        sourceRevisionIds: [],
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.DRIVE_NOT_CONFIGURED,
      statusCode: 503,
    });
    expect(repo.insertPublishedArtifact).not.toHaveBeenCalled();
    expect(repo.insertAuditEvent).not.toHaveBeenCalled();
  });

  it('returns 503 for unconfigured OneDrive and SharePoint', async () => {
    for (const provider of ['microsoft-onedrive', 'microsoft-sharepoint'] as const) {
      await expect(
        publishArtifact(mockPrisma, projectAuth(), {
          scopeType: 'PROJECT',
          workspaceId: WORKSPACE_ID,
          projectId: PROJECT_ID,
          title: 'Brief',
          content: 'x',
          provider,
          sourceMemoryIds: [],
          sourceRevisionIds: [],
        }),
      ).rejects.toMatchObject({
        code: ERROR_CODES.DRIVE_NOT_CONFIGURED,
        statusCode: 503,
      });
    }
    expect(repo.insertPublishedArtifact).not.toHaveBeenCalled();
  });

  it('rejects cross-tenant source memory before provider publish', async () => {
    vi.mocked(repo.getMemory).mockResolvedValue(
      makeMemory({ tenantId: '00000000-0000-4000-8000-000000000099' }),
    );
    const publish = vi.fn();
    __registerDriveBackend('stub', {
      publish,
      republish: vi.fn(),
      detectChange: vi.fn(),
      updateDocument: vi.fn(),
    } as never);

    await expect(
      publishArtifact(mockPrisma, projectAuth(), {
        scopeType: 'PROJECT',
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        title: 'Brief',
        content: 'x',
        provider: 'stub',
        sourceMemoryIds: [MEMORY_ID],
        sourceRevisionIds: [],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.SCOPE_DENIED });
    expect(publish).not.toHaveBeenCalled();
    expect(repo.insertPublishedArtifact).not.toHaveBeenCalled();
  });

  it('rejects private memory, restricted memory, wrong project, deleted, and forged revisions', async () => {
    const publish = vi.fn();
    __registerDriveBackend('stub', {
      publish,
      republish: vi.fn(),
      detectChange: vi.fn(),
      updateDocument: vi.fn(),
    } as never);

    vi.mocked(repo.getMemory).mockResolvedValueOnce(
      makeMemory({ metadata: { ownershipClassification: 'PRIVATE' } }),
    );
    await expect(
      publishArtifact(mockPrisma, projectAuth(), {
        scopeType: 'PROJECT',
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        title: 'Brief',
        provider: 'stub',
        sourceMemoryIds: [MEMORY_ID],
        sourceRevisionIds: [],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.PERMISSION_DENIED });

    vi.mocked(repo.getMemory).mockResolvedValueOnce(makeMemory({ sensitivity: 'RESTRICTED' }));
    await expect(
      publishArtifact(mockPrisma, projectAuth(), {
        scopeType: 'PROJECT',
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        title: 'Brief',
        provider: 'stub',
        sourceMemoryIds: [MEMORY_ID],
        sourceRevisionIds: [],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.PERMISSION_DENIED });

    vi.mocked(repo.getMemory).mockResolvedValueOnce(
      makeMemory({
        projectId: '00000000-0000-4000-8000-000000000001',
        scopeId: '00000000-0000-4000-8000-000000000001',
      }),
    );
    await expect(
      publishArtifact(mockPrisma, projectAuth(), {
        scopeType: 'PROJECT',
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        title: 'Brief',
        provider: 'stub',
        sourceMemoryIds: [MEMORY_ID],
        sourceRevisionIds: [],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.SCOPE_DENIED });

    vi.mocked(repo.getMemory).mockResolvedValueOnce(makeMemory({ status: 'DELETED' }));
    await expect(
      publishArtifact(mockPrisma, projectAuth(), {
        scopeType: 'PROJECT',
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        title: 'Brief',
        provider: 'stub',
        sourceMemoryIds: [MEMORY_ID],
        sourceRevisionIds: [],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.MEMORY_DELETED });

    vi.mocked(repo.getMemory).mockResolvedValueOnce(makeMemory());
    vi.mocked(repo.getRevision).mockResolvedValueOnce(
      makeRevision({ id: OTHER_REVISION, memoryId: OTHER_MEMORY }),
    );
    await expect(
      publishArtifact(mockPrisma, projectAuth(), {
        scopeType: 'PROJECT',
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        title: 'Brief',
        provider: 'stub',
        sourceMemoryIds: [MEMORY_ID],
        sourceRevisionIds: [OTHER_REVISION],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });

    expect(publish).not.toHaveBeenCalled();
    expect(repo.insertPublishedArtifact).not.toHaveBeenCalled();
    expect(repo.insertAuditEvent).not.toHaveBeenCalled();
  });

  it('publishes when provenance is valid', async () => {
    vi.mocked(repo.getMemory).mockResolvedValue(makeMemory());
    vi.mocked(repo.getRevision).mockResolvedValue(makeRevision());
    vi.mocked(repo.insertPublishedArtifact).mockResolvedValue(
      makeArtifact({ syncStatus: 'PUBLISHED' }),
    );
    vi.mocked(repo.insertAuditEvent).mockResolvedValue(undefined as never);
    const publish = vi.fn().mockResolvedValue({
      externalFileId: 'file-1',
      externalUrl: 'https://example.test/file-1',
      parentFolderId: 'folder-1',
      lastSyncedContentHash: 'hash',
      driveId: 'stub',
      siteId: null,
    });
    __registerDriveBackend('stub', {
      publish,
      republish: vi.fn(),
      detectChange: vi.fn(),
      updateDocument: vi.fn(),
    } as never);

    const result = await publishArtifact(mockPrisma, projectAuth(), {
      scopeType: 'PROJECT',
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      title: 'Brief',
      artifactType: 'intelligence-brief',
      provider: 'stub',
      sourceMemoryIds: [MEMORY_ID],
      sourceRevisionIds: [REVISION_ID],
    });

    expect(publish).toHaveBeenCalledOnce();
    expect(String(publish.mock.calls[0]![0].content)).toContain('August 20');
    expect(String(publish.mock.calls[0]![0].content)).not.toContain('(see authoritative memory)');
    expect(repo.insertPublishedArtifact).toHaveBeenCalledOnce();
    expect(result.artifact).toBeTruthy();
  });
});

describe('republish governance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetDriveBackends();
  });

  afterEach(() => {
    __resetDriveBackends();
  });

  it('rejects republish without approved candidate relationship', async () => {
    vi.mocked(repo.getPublishedArtifact).mockResolvedValue(makeArtifact());
    vi.mocked(repo.getMemoryCandidate).mockResolvedValue(null);

    await expect(
      republishArtifact(mockPrisma, projectAuth(), ARTIFACT_ID, {
        approvedCandidateId: CANDIDATE_ID,
        sourceMemoryIds: [MEMORY_ID],
        sourceRevisionIds: [REVISION_ID],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.MEMORY_NOT_FOUND });
  });

  it('rejects pending, rejected, and unrelated approved candidates', async () => {
    vi.mocked(repo.getPublishedArtifact).mockResolvedValue(makeArtifact());

    vi.mocked(repo.getMemoryCandidate).mockResolvedValueOnce(makeCandidate({ status: 'PENDING' }));
    await expect(
      republishArtifact(mockPrisma, projectAuth(), ARTIFACT_ID, {
        approvedCandidateId: CANDIDATE_ID,
        sourceMemoryIds: [MEMORY_ID],
        sourceRevisionIds: [REVISION_ID],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CONFLICT });

    vi.mocked(repo.getMemoryCandidate).mockResolvedValueOnce(makeCandidate({ status: 'REJECTED' }));
    await expect(
      republishArtifact(mockPrisma, projectAuth(), ARTIFACT_ID, {
        approvedCandidateId: CANDIDATE_ID,
        sourceMemoryIds: [MEMORY_ID],
        sourceRevisionIds: [REVISION_ID],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CONFLICT });

    vi.mocked(repo.getMemoryCandidate).mockResolvedValueOnce(
      makeCandidate({ harvestRunId: '00000000-0000-4000-8000-0000000000aa' }),
    );
    await expect(
      republishArtifact(mockPrisma, projectAuth(), ARTIFACT_ID, {
        approvedCandidateId: CANDIDATE_ID,
        sourceMemoryIds: [MEMORY_ID],
        sourceRevisionIds: [REVISION_ID],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
  });

  it('republishes after valid approved correction', async () => {
    vi.mocked(repo.getPublishedArtifact).mockResolvedValue(makeArtifact());
    vi.mocked(repo.getMemoryCandidate).mockResolvedValue(makeCandidate());
    vi.mocked(repo.getMemory).mockResolvedValue(makeMemory());
    vi.mocked(repo.getRevision).mockResolvedValue(makeRevision());
    vi.mocked(repo.updatePublishedArtifactIfMatch).mockResolvedValue(
      makeArtifact({ syncStatus: 'REPUBLISHED' }),
    );
    vi.mocked(repo.insertAuditEvent).mockResolvedValue(undefined as never);
    const republish = vi.fn().mockResolvedValue({
      lastSyncedContentHash: 'newhash',
      lastExternalModifiedAt: new Date().toISOString(),
    });
    __registerDriveBackend('stub', {
      publish: vi.fn(),
      republish,
      detectChange: vi.fn(),
      updateDocument: vi.fn(),
    } as never);

    const result = await republishArtifact(mockPrisma, projectAuth(), ARTIFACT_ID, {
      approvedCandidateId: CANDIDATE_ID,
      sourceMemoryIds: [MEMORY_ID],
      sourceRevisionIds: [REVISION_ID],
    });

    expect(republish).toHaveBeenCalledOnce();
    expect(repo.updatePublishedArtifactIfMatch).toHaveBeenCalledOnce();
    expect(repo.insertAuditEvent).toHaveBeenCalledOnce();
    expect(result.artifact.syncStatus).toBe('REPUBLISHED');
  });

  it('calls provider exactly once when DB transaction retries on serialization failure', async () => {
    vi.mocked(repo.getPublishedArtifact).mockResolvedValue(makeArtifact());
    vi.mocked(repo.getMemoryCandidate).mockResolvedValue(makeCandidate());
    vi.mocked(repo.getMemory).mockResolvedValue(makeMemory());
    vi.mocked(repo.getRevision).mockResolvedValue(makeRevision());
    vi.mocked(repo.insertAuditEvent).mockResolvedValue(undefined as never);
    vi.mocked(repo.updatePublishedArtifactIfMatch)
      .mockRejectedValueOnce(Object.assign(new Error('restart transaction'), { code: 'P2034' }))
      .mockResolvedValueOnce(makeArtifact({ syncStatus: 'REPUBLISHED' }));

    const actual = await vi.importActual<typeof import('@questoros-memory/database')>(
      '@questoros-memory/database',
    );
    vi.mocked(repo.withTransaction).mockImplementation(async (_prisma, fn, context) =>
      actual.withRetry(async () => fn(mockPrisma), context),
    );

    const republish = vi.fn().mockResolvedValue({
      lastSyncedContentHash: 'newhash',
      lastExternalModifiedAt: new Date().toISOString(),
    });
    __registerDriveBackend('stub', {
      publish: vi.fn(),
      republish,
      detectChange: vi.fn(),
      updateDocument: vi.fn(),
    } as never);

    const result = await republishArtifact(mockPrisma, projectAuth(), ARTIFACT_ID, {
      approvedCandidateId: CANDIDATE_ID,
      sourceMemoryIds: [MEMORY_ID],
      sourceRevisionIds: [REVISION_ID],
    });

    expect(republish).toHaveBeenCalledTimes(1);
    expect(repo.updatePublishedArtifactIfMatch).toHaveBeenCalledTimes(2);
    expect(repo.insertAuditEvent).toHaveBeenCalledTimes(1);
    expect(result.artifact.syncStatus).toBe('REPUBLISHED');
  });

  it('does not retry provider when DB persistence fails permanently after external write', async () => {
    vi.mocked(repo.getPublishedArtifact).mockResolvedValue(makeArtifact());
    vi.mocked(repo.getMemoryCandidate).mockResolvedValue(makeCandidate());
    vi.mocked(repo.getMemory).mockResolvedValue(makeMemory());
    vi.mocked(repo.getRevision).mockResolvedValue(makeRevision());
    vi.mocked(repo.withTransaction).mockImplementation(async (_prisma, fn) => fn(mockPrisma));
    vi.mocked(repo.updatePublishedArtifactIfMatch).mockRejectedValue(
      Object.assign(new Error('permanent db failure'), { code: 'P1001' }),
    );

    const republish = vi.fn().mockResolvedValue({
      lastSyncedContentHash: 'newhash',
      lastExternalModifiedAt: new Date().toISOString(),
    });
    __registerDriveBackend('stub', {
      publish: vi.fn(),
      republish,
      detectChange: vi.fn(),
      updateDocument: vi.fn(),
    } as never);

    await expect(
      republishArtifact(mockPrisma, projectAuth(), ARTIFACT_ID, {
        approvedCandidateId: CANDIDATE_ID,
        sourceMemoryIds: [MEMORY_ID],
        sourceRevisionIds: [REVISION_ID],
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.RECONCILIATION_REQUIRED,
      statusCode: 503,
    });
    expect(republish).toHaveBeenCalledTimes(1);
  });
});

describe('ServiceError DRIVE_NOT_CONFIGURED', () => {
  it('is a known error code', () => {
    expect(ERROR_CODES.DRIVE_NOT_CONFIGURED).toBe('DRIVE_NOT_CONFIGURED');
    expect(new ServiceError(ERROR_CODES.DRIVE_NOT_CONFIGURED, 'x', 503).statusCode).toBe(503);
  });
});
