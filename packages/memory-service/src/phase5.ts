import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthContext, MemoryType, IcareLifecycleStage } from '@questoros-memory/memory-core';
import {
  ServiceError,
  ERROR_CODES,
  parseContract,
  createHarvestRunRequestSchema,
  listCandidatesQuerySchema,
  candidateIdParamsSchema,
  harvestRunIdParamsSchema,
  approveCandidateRequestSchema,
  rejectCandidateRequestSchema,
  createContextPackageRequestSchema,
  publishArtifactRequestSchema,
  publishedArtifactIdParamsSchema,
  republishArtifactRequestSchema,
  hasPermission,
  mergeMemoryMetadata,
  extractIcareMetadata,
  ICARE_PUBLIC_LIFECYCLE,
  type ApiPermission,
} from '@questoros-memory/memory-core';
import {
  DeterministicExtractor,
  analyzeAgainstMemories,
  ModelBackedHarvester,
} from '@questoros-memory/harvester-core';
import { StubDriveProvider, renderIntelligenceBrief } from '@questoros-memory/publisher-core';
import {
  createReasoningProvider,
  MockReasoningProvider,
  type ReasoningProvider,
} from '@questoros-memory/reasoning-provider';
import * as repo from '@questoros-memory/database';
import { withTransaction } from '@questoros-memory/database';
import { resolveRequestedScope, enforceScope, enforceMemoryScope } from './scope.js';
import { normalizeContent, hashContent } from './content.js';
import { listMemories as listMemoriesOp, searchMemories } from './operations.js';

const defaultExtractor = new DeterministicExtractor();
/** Process-local stub Drive used when provider=stub (tests + hackathon). */
const stubDrive = new StubDriveProvider();

let harvestReasoning: ReasoningProvider = new MockReasoningProvider();
let agenticHarvester = new ModelBackedHarvester({ reasoning: harvestReasoning });

/** Test/helper: inject a reasoning provider without live model calls. */
export function __setHarvestReasoningProvider(provider: ReasoningProvider | null): void {
  harvestReasoning = provider ?? new MockReasoningProvider();
  agenticHarvester = new ModelBackedHarvester({ reasoning: harvestReasoning });
}

export function __getHarvestReasoningProvider(): ReasoningProvider {
  return harvestReasoning;
}

try {
  // Prefer configured provider; fall back to mock when live calls are gated.
  harvestReasoning = createReasoningProvider();
  agenticHarvester = new ModelBackedHarvester({ reasoning: harvestReasoning });
} catch {
  harvestReasoning = new MockReasoningProvider();
  agenticHarvester = new ModelBackedHarvester({ reasoning: harvestReasoning });
}

function requirePermission(auth: AuthContext, required: ApiPermission): void {
  if (!hasPermission(auth.permissions, required)) {
    throw new ServiceError(ERROR_CODES.PERMISSION_DENIED, 'Insufficient permissions.', 403);
  }
}

function scopeIdFor(
  scopeType: string,
  tenantId: string,
  workspaceId: string | null,
  projectId: string | null,
): string {
  if (scopeType === 'PROJECT' && projectId) return projectId;
  if (scopeType === 'WORKSPACE' && workspaceId) return workspaceId;
  return tenantId;
}

/** Map analysis status → ICARE³ Recommendation action (never auto-executes). */
export function recommendationForAnalysisStatus(status: string): string {
  switch (status) {
    case 'DUPLICATE':
      return 'ignore';
    case 'NEAR_DUPLICATE':
      return 'merge';
    case 'CONFLICT':
      return 'correct';
    default:
      return 'create';
  }
}

function asMetadataRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function resolveReasoningChainId(
  metadata: Record<string, unknown> | undefined,
  explicit?: string | null,
): string {
  if (explicit) return explicit;
  const fromMeta = metadata?.reasoningChainId;
  if (typeof fromMeta === 'string' && fromMeta.length > 0) return fromMeta;
  const icare = extractIcareMetadata(metadata ?? {});
  if (icare?.reasoningChainId) return icare.reasoningChainId;
  return randomUUID();
}

function durableStageForMemoryType(memoryType: string): IcareLifecycleStage {
  switch (memoryType) {
    case 'GOAL':
    case 'CONSTRAINT':
    case 'FACT':
    case 'SUMMARY':
    case 'ARTIFACT_SUMMARY':
      return 'CONTEXT';
    case 'DECISION':
      return 'RECOMMENDATIONS';
    case 'TASK':
    case 'ACTION_RESULT':
    case 'CHECKPOINT':
      return 'EXECUTION';
    default:
      return 'CONTEXT';
  }
}

/** Deterministic extractor used by harvest runs (Checkpoint 2). */
export function extractCandidatesFromText(sourceText: string): Array<{
  content: string;
  memoryType: string;
  confidence: number;
  metadata: Record<string, unknown>;
}> {
  const extracted = defaultExtractor.extract(sourceText).map((item) => ({
    content: item.content,
    memoryType: item.memoryType,
    confidence: item.confidence,
    metadata: item.metadata ?? {},
  }));
  if (extracted.length === 0 && sourceText.trim()) {
    return [
      {
        content: sourceText.trim().slice(0, 2000),
        memoryType: 'SUMMARY',
        confidence: 0.5,
        metadata: { extractedBy: 'deterministic', field: 'fallback_summary' },
      },
    ];
  }
  return extracted;
}

/** Duplicate / contradiction analysis (Checkpoint 3). */
export function analyzeCandidateAgainstMemories(
  content: string,
  memoryType: string,
  existing: Array<{ id: string; content: string; memoryType: string }>,
): { status: string; relatedMemoryIds: string[] } {
  const [analyzed] = analyzeAgainstMemories(
    [
      {
        content,
        memoryType: memoryType as MemoryType,
        confidence: 1,
        metadata: {},
      },
    ],
    existing.map((m) => ({
      id: m.id,
      content: m.content,
      memoryType: m.memoryType as MemoryType,
    })),
  );
  return {
    status: analyzed?.status ?? 'PENDING',
    relatedMemoryIds: analyzed?.relatedMemoryIds ?? [],
  };
}

export async function createHarvestRun(
  prisma: PrismaClient,
  auth: AuthContext,
  body: unknown,
  requestId?: string,
) {
  if (
    !hasPermission(auth.permissions, 'memory:harvest') &&
    !hasPermission(auth.permissions, 'memory:publish')
  ) {
    throw new ServiceError(ERROR_CODES.PERMISSION_DENIED, 'Insufficient permissions.', 403);
  }
  const input = parseContract(createHarvestRunRequestSchema, body ?? {});
  const requested = resolveRequestedScope(input.scopeType, input.workspaceId, input.projectId);
  enforceScope(auth.credentialScope, requested);

  const scopeId = scopeIdFor(
    requested.scopeType,
    auth.tenantId,
    requested.workspaceId,
    requested.projectId,
  );

  const reasoningChainId = resolveReasoningChainId(input.metadata, input.reasoningChainId ?? null);

  // ICARE³ Harvester loop: Issue (what changed) → Context (source + related memories)
  const run = await repo.insertHarvestRun(prisma, {
    tenantId: auth.tenantId,
    workspaceId: requested.workspaceId,
    projectId: requested.projectId,
    actorId: auth.actorId,
    sourceArtifactId: null,
    scopeType: requested.scopeType,
    scopeId,
    status: 'RUNNING',
    title: input.title ?? null,
    metadata: mergeMemoryMetadata({
      metadata: {
        ...(input.metadata ?? {}),
        requestId: requestId ?? null,
        icareLifecycle: ICARE_PUBLIC_LIFECYCLE,
        harvestIssue: 'Authorized source may contain durable organizational intelligence.',
      },
      icareStage: 'ISSUE',
      reasoningChainId,
    }),
  });

  try {
    const checksum = repo.hashContent(input.sourceText);
    const artifact = await repo.insertSourceArtifact(prisma, {
      tenantId: auth.tenantId,
      workspaceId: requested.workspaceId,
      projectId: requested.projectId,
      sourceType: input.sourceType,
      sourceUri: input.sourceUri ?? null,
      contentType: 'text/plain',
      checksumSha256: checksum,
      metadata: {
        title: input.title ?? null,
        byteLength: Buffer.byteLength(input.sourceText, 'utf8'),
        reasoningChainId,
      },
    });

    // Prefer scoped text search for related memories, then fall back to list.
    let existing: Array<{
      id: string;
      content: string;
      memoryType: string;
      scopeType?: string;
      sensitivity?: string;
      status?: string;
    }> = [];

    try {
      const searchRows = await repo.searchByText(prisma, {
        tenantId: auth.tenantId,
        scopeType: requested.scopeType,
        scopeId,
        limit: 25,
      });
      existing = searchRows.map((row) => ({
        id: row.id,
        content: row.content,
        memoryType: row.memory_type,
        scopeType: row.scope_type,
        sensitivity: row.sensitivity,
        status: row.status,
      }));
    } catch {
      existing = [];
    }

    if (existing.length === 0) {
      const listed = await repo.listMemories(
        prisma,
        {
          tenantId: auth.tenantId,
          scopeType: requested.scopeType,
          workspaceId: requested.workspaceId,
          projectId: requested.projectId,
          status: 'ACTIVE',
          limit: 100,
        },
        null,
      );
      existing = listed.map((m) => ({
        id: m.id,
        content: m.content,
        memoryType: m.memoryType,
        scopeType: m.scopeType,
        sensitivity: m.sensitivity,
        status: m.status,
      }));
    }

    const useDeterministicFallback =
      input.metadata?.extractorMode === 'deterministic' ||
      process.env.HARVESTER_MODE === 'deterministic';

    const harvest = await agenticHarvester.harvest({
      sourceText: input.sourceText,
      sourceLocator: input.sourceUri ?? input.title ?? 'harvest-source',
      relatedMemories: existing.map((m) => ({
        id: m.id,
        content: m.content,
        memoryType: m.memoryType as MemoryType,
        scopeType: m.scopeType as 'TENANT' | 'WORKSPACE' | 'PROJECT' | undefined,
        sensitivity: m.sensitivity,
        status: m.status,
      })),
      permissions: auth.permissions,
      useDeterministicFallback: Boolean(useDeterministicFallback),
    });

    // Analysis → Recommendations (candidates only; never silent memory write)
    const candidates = [];
    for (const item of harvest.candidates) {
      const status =
        item.recommendedDisposition === 'CORRECT'
          ? 'CONFLICT'
          : item.recommendedDisposition === 'IGNORE' &&
              item.analysisClassification === 'EXACT_DUPLICATE'
            ? 'DUPLICATE'
            : item.recommendedDisposition === 'MERGE'
              ? 'NEAR_DUPLICATE'
              : item.analysisClassification === 'UNRESOLVED_CONTRADICTION'
                ? 'CONFLICT'
                : 'PENDING';
      const recommendation = item.recommendedDisposition.toLowerCase();
      const candidateMetadata = mergeMemoryMetadata({
        metadata: {
          ...item.metadata,
          harvestRecommendation: recommendation,
          analysisStatus: status,
          extractorMode: harvest.extractorMode,
          reasoningProvider: harvest.providerName,
          reasoningModelId: harvest.modelId,
        },
        icareStage: 'RECOMMENDATIONS',
        reasoningChainId,
        relatedMemoryIds: item.relatedMemoryIds,
      });
      const created = await repo.insertMemoryCandidate(prisma, {
        tenantId: auth.tenantId,
        workspaceId: requested.workspaceId,
        projectId: requested.projectId,
        harvestRunId: run.id,
        sourceArtifactId: artifact.id,
        scopeType: requested.scopeType,
        scopeId,
        memoryType: item.memoryType,
        status,
        content: item.content,
        confidence: item.confidence,
        relatedMemoryIds: item.relatedMemoryIds,
        metadata: candidateMetadata,
      });
      candidates.push(serializeCandidate(created));
    }

    const completed = await repo.updateHarvestRun(prisma, auth.tenantId, run.id, {
      status: 'COMPLETED',
      sourceArtifactId: artifact.id,
      completedAt: new Date(),
      metadata: mergeMemoryMetadata({
        metadata: {
          candidateCount: candidates.length,
          requestId: requestId ?? null,
          relatedMemoryCount: existing.length,
          icareLifecycle: ICARE_PUBLIC_LIFECYCLE,
          extractorMode: harvest.extractorMode,
          reasoningProvider: harvest.providerName,
          reasoningModelId: harvest.modelId,
          harvestRationale: harvest.rationale,
        },
        icareStage: 'ANALYSIS',
        reasoningChainId,
      }),
    });

    await repo.insertAuditEvent(prisma, {
      tenantId: auth.tenantId,
      workspaceId: requested.workspaceId,
      projectId: requested.projectId,
      actorId: auth.actorId,
      memoryId: null,
      action: 'HARVEST',
      outcome: 'SUCCESS',
      requestId: requestId ?? null,
      reason: null,
      metadata: {
        harvestRunId: run.id,
        candidateCount: candidates.length,
        icareStage: 'ANALYSIS',
        reasoningChainId,
      },
    });

    return { run: serializeHarvestRun(completed), candidates, reasoningChainId };
  } catch (error) {
    await repo.updateHarvestRun(prisma, auth.tenantId, run.id, {
      status: 'FAILED',
      errorMessage: 'Harvest run failed.',
      completedAt: new Date(),
      metadata: mergeMemoryMetadata({
        metadata: { requestId: requestId ?? null },
        icareStage: 'ANALYSIS',
        reasoningChainId,
        outcomeSummary: 'Harvest run failed before recommendations were persisted.',
      }),
    });
    throw error;
  }
}

export async function getHarvestRun(prisma: PrismaClient, auth: AuthContext, runId: string) {
  requirePermission(auth, 'memory:harvest');
  parseContract(harvestRunIdParamsSchema, { runId });
  const run = await repo.getHarvestRun(prisma, auth.tenantId, runId);
  if (!run) {
    throw new ServiceError(ERROR_CODES.MEMORY_NOT_FOUND, 'Harvest run not found.', 404);
  }
  enforceMemoryScope(
    auth.credentialScope,
    run.scopeType,
    run.scopeId,
    run.workspaceId,
    run.projectId,
  );
  const candidates = await repo.listMemoryCandidates(prisma, {
    tenantId: auth.tenantId,
    harvestRunId: runId,
    limit: 100,
  });
  return {
    run: serializeHarvestRun(run),
    candidates: candidates.map(serializeCandidate),
  };
}

export async function listCandidates(prisma: PrismaClient, auth: AuthContext, query: unknown) {
  requirePermission(auth, 'memory:review');
  const input = parseContract(listCandidatesQuerySchema, query ?? {});
  const rows = await repo.listMemoryCandidates(prisma, {
    tenantId: auth.tenantId,
    harvestRunId: input.harvestRunId,
    status: input.status,
    scopeType: input.scopeType,
    scopeId:
      input.scopeType === 'PROJECT'
        ? input.projectId
        : input.scopeType === 'WORKSPACE'
          ? input.workspaceId
          : input.scopeType === 'TENANT'
            ? auth.tenantId
            : undefined,
    limit: input.limit ?? 50,
  });
  const visible = rows.filter((row) => {
    try {
      enforceMemoryScope(
        auth.credentialScope,
        row.scopeType,
        row.scopeId,
        row.workspaceId,
        row.projectId,
      );
      return true;
    } catch {
      return false;
    }
  });
  return { candidates: visible.map(serializeCandidate) };
}

export async function getCandidate(prisma: PrismaClient, auth: AuthContext, candidateId: string) {
  requirePermission(auth, 'memory:review');
  parseContract(candidateIdParamsSchema, { candidateId });
  const row = await repo.getMemoryCandidate(prisma, auth.tenantId, candidateId);
  if (!row) {
    throw new ServiceError(ERROR_CODES.MEMORY_NOT_FOUND, 'Candidate not found.', 404);
  }
  enforceMemoryScope(
    auth.credentialScope,
    row.scopeType,
    row.scopeId,
    row.workspaceId,
    row.projectId,
  );
  return { candidate: serializeCandidate(row) };
}

export async function approveCandidate(
  prisma: PrismaClient,
  auth: AuthContext,
  candidateId: string,
  body: unknown,
  requestId?: string,
) {
  requirePermission(auth, 'memory:review');
  parseContract(candidateIdParamsSchema, { candidateId });
  const input = parseContract(approveCandidateRequestSchema, body ?? {});
  const row = await repo.getMemoryCandidate(prisma, auth.tenantId, candidateId);
  if (!row) {
    throw new ServiceError(ERROR_CODES.MEMORY_NOT_FOUND, 'Candidate not found.', 404);
  }
  enforceMemoryScope(
    auth.credentialScope,
    row.scopeType,
    row.scopeId,
    row.workspaceId,
    row.projectId,
  );
  if (row.status === 'APPROVED' || row.status === 'REJECTED') {
    throw new ServiceError(ERROR_CODES.CONFLICT, 'Candidate has already been reviewed.', 409);
  }

  const relatedIds = Array.isArray(row.relatedMemoryIds) ? (row.relatedMemoryIds as string[]) : [];
  const normalizedContent = normalizeContent(row.content);
  const contentHash = hashContent(normalizedContent);
  const candidateMeta = asMetadataRecord(row.metadata);
  const reasoningChainId = resolveReasoningChainId(candidateMeta);
  const durableStage = durableStageForMemoryType(row.memoryType);
  const approvedMetadata = mergeMemoryMetadata({
    metadata: {
      harvestCandidateId: row.id,
      harvestRunId: row.harvestRunId,
      harvestRecommendation: candidateMeta.harvestRecommendation ?? null,
    },
    icareStage: durableStage,
    reasoningChainId,
    relatedMemoryIds: relatedIds,
    evaluationTargetMemoryId: relatedIds[0],
    outcomeSummary: input.reason ?? 'Candidate approved after recommendation evaluation.',
  });

  const memory = await withTransaction(
    prisma,
    async (tx) => {
      if (row.status === 'CONFLICT' && relatedIds[0]) {
        const existing = await repo.getMemory(tx, auth.tenantId, relatedIds[0]);
        if (!existing || existing.status === 'DELETED') {
          throw new ServiceError(
            ERROR_CODES.MEMORY_NOT_FOUND,
            'Related memory for conflict resolution was not found.',
            404,
          );
        }
        const rev = (await repo.getMaxRevisionNumber(tx, auth.tenantId, existing.id)) + 1;
        await repo.insertRevision(tx, {
          tenantId: auth.tenantId,
          memoryId: existing.id,
          revisionNumber: rev,
          content: existing.content,
          contentHash: existing.contentHash,
          reason: input.reason ?? 'Approved harvest candidate correction.',
          createdByActorId: auth.actorId,
        });
        await repo.deleteEmbeddingsForMemory(tx, auth.tenantId, existing.id);
        const existingMeta = asMetadataRecord(existing.metadata);
        return repo.updateMemory(tx, auth.tenantId, existing.id, {
          content: normalizedContent,
          contentHash,
          metadata: mergeMemoryMetadata({
            metadata: {
              ...existingMeta,
              ...approvedMetadata,
              correctedFromCandidateId: row.id,
            },
            icareStage: durableStage,
            reasoningChainId,
            relatedMemoryIds: relatedIds,
            evaluationTargetMemoryId: existing.id,
            outcomeSummary: input.reason ?? 'Conflict resolved via approved candidate correction.',
          }),
        });
      }

      return repo.insertMemory(tx, {
        tenantId: auth.tenantId,
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        actorId: auth.actorId,
        sourceArtifactId: row.sourceArtifactId,
        scopeType: row.scopeType,
        scopeId: row.scopeId,
        memoryType: row.memoryType,
        content: normalizedContent,
        contentHash,
        importance: 0.5,
        confidence: Number(row.confidence),
        sensitivity: 'STANDARD',
        validFrom: new Date(),
        validUntil: null,
        metadata: approvedMetadata,
      });
    },
    'approveCandidate',
  );

  const updated = await repo.updateMemoryCandidate(prisma, auth.tenantId, candidateId, {
    status: 'APPROVED',
    approvedMemoryId: memory.id,
    reviewReason: input.reason ?? null,
    reviewedAt: new Date(),
  });

  await repo.insertAuditEvent(prisma, {
    tenantId: auth.tenantId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    actorId: auth.actorId,
    memoryId: memory.id,
    action: 'CANDIDATE_APPROVE',
    outcome: 'SUCCESS',
    requestId: requestId ?? null,
    reason: input.reason ?? null,
    metadata: {
      candidateId,
      icareStage: 'RECOMMENDATION_EVALUATION',
      reasoningChainId,
      executionFollowUpStage: durableStage,
    },
  });

  return {
    candidate: serializeCandidate(updated),
    memory: {
      id: memory.id,
      memoryType: memory.memoryType,
      content: memory.content,
      status: memory.status,
      metadata: memory.metadata,
    },
    reasoningChainId,
  };
}

export async function rejectCandidate(
  prisma: PrismaClient,
  auth: AuthContext,
  candidateId: string,
  body: unknown,
  requestId?: string,
) {
  requirePermission(auth, 'memory:review');
  parseContract(candidateIdParamsSchema, { candidateId });
  const input = parseContract(rejectCandidateRequestSchema, body ?? {});
  const row = await repo.getMemoryCandidate(prisma, auth.tenantId, candidateId);
  if (!row) {
    throw new ServiceError(ERROR_CODES.MEMORY_NOT_FOUND, 'Candidate not found.', 404);
  }
  enforceMemoryScope(
    auth.credentialScope,
    row.scopeType,
    row.scopeId,
    row.workspaceId,
    row.projectId,
  );
  if (row.status === 'APPROVED' || row.status === 'REJECTED') {
    throw new ServiceError(ERROR_CODES.CONFLICT, 'Candidate has already been reviewed.', 409);
  }

  const candidateMeta = asMetadataRecord(row.metadata);
  const reasoningChainId = resolveReasoningChainId(candidateMeta);

  const updated = await repo.updateMemoryCandidate(prisma, auth.tenantId, candidateId, {
    status: 'REJECTED',
    reviewReason: input.reason,
    reviewedAt: new Date(),
  });

  await repo.insertAuditEvent(prisma, {
    tenantId: auth.tenantId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    actorId: auth.actorId,
    memoryId: null,
    action: 'CANDIDATE_REJECT',
    outcome: 'SUCCESS',
    requestId: requestId ?? null,
    reason: input.reason,
    metadata: {
      candidateId,
      icareStage: 'RECOMMENDATION_EVALUATION',
      reasoningChainId,
      evaluationOutcome: 'rejected',
      outcomeSummary: input.reason,
    },
  });

  return { candidate: serializeCandidate(updated), reasoningChainId };
}

export async function createContextPackage(prisma: PrismaClient, auth: AuthContext, body: unknown) {
  requirePermission(auth, 'memory:read');
  const input = parseContract(createContextPackageRequestSchema, body ?? {});
  const requested = resolveRequestedScope(input.scopeType, input.workspaceId, input.projectId);
  enforceScope(auth.credentialScope, requested);

  const memoryTypes =
    input.memoryTypes ??
    (['GOAL', 'CONSTRAINT', 'DECISION', 'FACT', 'TASK', 'CHECKPOINT', 'ARTIFACT_SUMMARY'] as const);

  const listed = await listMemoriesOp(prisma, auth, {
    scopeType: requested.scopeType,
    workspaceId: requested.workspaceId ?? undefined,
    projectId: requested.projectId ?? undefined,
    status: 'ACTIVE',
    limit: input.limit ?? 50,
  });

  const filtered = listed.items.filter((m) =>
    (memoryTypes as readonly string[]).includes(m.memoryType),
  );

  const chainFiltered =
    input.reasoningChainId === undefined
      ? filtered
      : filtered.filter((m) => {
          const icare = extractIcareMetadata(asMetadataRecord(m.metadata));
          return icare?.reasoningChainId === input.reasoningChainId;
        });

  let searchHits: Array<{
    memoryId: string;
    score: number;
    reasons: string[];
    icareStage?: string;
  }> = [];
  if (input.queryText?.trim()) {
    const searched = await searchMemories(prisma, auth, {
      scopeType: requested.scopeType,
      workspaceId: requested.workspaceId ?? undefined,
      projectId: requested.projectId ?? undefined,
      queryText: input.queryText,
      limit: input.limit ?? 20,
      reasoningChainId: input.reasoningChainId,
    });
    searchHits = searched.map((r) => {
      const icare = extractIcareMetadata(asMetadataRecord(r.memory.metadata));
      return {
        memoryId: r.memory.id,
        score: r.explanation.finalScore,
        reasons: r.explanation.reasons,
        icareStage: icare?.icareStage,
      };
    });
  }

  const byStage: Record<string, Array<{ id: string; memoryType: string; content: string }>> = {};
  for (const m of chainFiltered) {
    const icare = extractIcareMetadata(asMetadataRecord(m.metadata));
    const stage = icare?.icareStage ?? durableStageForMemoryType(m.memoryType);
    if (!byStage[stage]) byStage[stage] = [];
    byStage[stage].push({
      id: m.id,
      memoryType: m.memoryType,
      content: m.content,
    });
  }

  return {
    scopeType: requested.scopeType,
    workspaceId: requested.workspaceId,
    projectId: requested.projectId,
    generatedAt: new Date().toISOString(),
    icareLifecycle: ICARE_PUBLIC_LIFECYCLE,
    reasoningChainId: input.reasoningChainId ?? null,
    byStage,
    memories: chainFiltered.map((m) => {
      const icare = extractIcareMetadata(asMetadataRecord(m.metadata));
      return {
        id: m.id,
        memoryType: m.memoryType,
        content: m.content,
        importance: m.importance,
        confidence: m.confidence,
        updatedAt: m.updatedAt,
        icareStage: icare?.icareStage ?? null,
        reasoningChainId: icare?.reasoningChainId ?? null,
      };
    }),
    citations: searchHits,
  };
}

export async function publishArtifact(
  prisma: PrismaClient,
  auth: AuthContext,
  body: unknown,
  requestId?: string,
) {
  requirePermission(auth, 'memory:publish');
  const input = parseContract(publishArtifactRequestSchema, body ?? {});
  const requested = resolveRequestedScope(input.scopeType, input.workspaceId, input.projectId);
  enforceScope(auth.credentialScope, requested);

  if (input.content.toLowerCase().includes('password') || input.content.includes('AKIA')) {
    throw new ServiceError(
      ERROR_CODES.PERMISSION_DENIED,
      'Refusing to publish content that appears to contain secrets.',
      403,
    );
  }

  const scopeId = scopeIdFor(
    requested.scopeType,
    auth.tenantId,
    requested.workspaceId,
    requested.projectId,
  );

  const reasoningChainId = resolveReasoningChainId(input.metadata, input.reasoningChainId ?? null);

  const publishedContent =
    input.artifactType === 'intelligence-brief' && !input.content.includes('ICARE³ lifecycle')
      ? renderIntelligenceBrief({
          title: input.title,
          projectName: input.title,
          memories: input.sourceMemoryIds.map((id) => ({
            id,
            content: '(see authoritative memory)',
            memoryType: 'FACT',
            icareStage: 'CONTEXT',
          })),
          reasoningChainId,
        })
      : input.content;

  const published = await stubDrive.publish({
    title: input.title,
    content: publishedContent,
    artifactType: input.artifactType,
    sourceMemoryIds: input.sourceMemoryIds,
    sourceRevisionIds: input.sourceRevisionIds,
    parentFolderId: input.parentFolderId,
    provider: input.provider,
    syncDirection: input.syncDirection,
    publishedBy: auth.actorId,
    driveId: input.driveId ?? null,
    siteId: input.siteId ?? null,
  });

  const artifact = await repo.insertPublishedArtifact(prisma, {
    tenantId: auth.tenantId,
    workspaceId: requested.workspaceId,
    projectId: requested.projectId,
    actorId: auth.actorId,
    scopeType: requested.scopeType,
    scopeId,
    provider: input.provider,
    externalFileId: published.externalFileId,
    externalUrl: published.externalUrl,
    parentFolderId: published.parentFolderId,
    artifactType: input.artifactType,
    title: input.title,
    content: publishedContent,
    sourceMemoryIds: input.sourceMemoryIds,
    sourceRevisionIds: input.sourceRevisionIds,
    lastSyncedContentHash: published.lastSyncedContentHash,
    syncDirection: input.syncDirection,
    syncStatus: 'PUBLISHED',
    metadata: mergeMemoryMetadata({
      metadata: {
        ...(input.metadata ?? {}),
        requestId: requestId ?? null,
        sourceMemoryIds: input.sourceMemoryIds,
        sourceRevisionIds: input.sourceRevisionIds,
        icareLifecycle: ICARE_PUBLIC_LIFECYCLE,
        driveId: published.driveId ?? input.driveId ?? null,
        siteId: published.siteId ?? input.siteId ?? null,
        providerAccountBound: true,
      },
      icareStage: 'EXECUTION',
      reasoningChainId,
      relatedMemoryIds: input.sourceMemoryIds,
      executionStatus: 'published',
      outcomeSummary: `Published ${input.artifactType} to ${input.provider}.`,
    }),
  });

  await repo.insertAuditEvent(prisma, {
    tenantId: auth.tenantId,
    workspaceId: requested.workspaceId,
    projectId: requested.projectId,
    actorId: auth.actorId,
    memoryId: null,
    action: 'PUBLISH',
    outcome: 'SUCCESS',
    requestId: requestId ?? null,
    reason: null,
    metadata: {
      artifactId: artifact.id,
      provider: input.provider,
      icareStage: 'EXECUTION',
      reasoningChainId,
    },
  });

  return { artifact: serializePublishedArtifact(artifact), reasoningChainId };
}

export async function getPublishedArtifact(
  prisma: PrismaClient,
  auth: AuthContext,
  artifactId: string,
) {
  requirePermission(auth, 'memory:publish');
  parseContract(publishedArtifactIdParamsSchema, { artifactId });
  const row = await repo.getPublishedArtifact(prisma, auth.tenantId, artifactId);
  if (!row) {
    throw new ServiceError(ERROR_CODES.MEMORY_NOT_FOUND, 'Published artifact not found.', 404);
  }
  enforceMemoryScope(
    auth.credentialScope,
    row.scopeType,
    row.scopeId,
    row.workspaceId,
    row.projectId,
  );
  return { artifact: serializePublishedArtifact(row) };
}

export async function syncPublishedArtifact(
  prisma: PrismaClient,
  auth: AuthContext,
  artifactId: string,
  requestId?: string,
) {
  requirePermission(auth, 'memory:publish');
  parseContract(publishedArtifactIdParamsSchema, { artifactId });
  const row = await repo.getPublishedArtifact(prisma, auth.tenantId, artifactId);
  if (!row) {
    throw new ServiceError(ERROR_CODES.MEMORY_NOT_FOUND, 'Published artifact not found.', 404);
  }
  enforceMemoryScope(
    auth.credentialScope,
    row.scopeType,
    row.scopeId,
    row.workspaceId,
    row.projectId,
  );

  const externalId = row.externalFileId;
  if (!externalId) {
    throw new ServiceError(ERROR_CODES.VALIDATION_ERROR, 'Artifact has no external file id.', 400);
  }

  const publishedMeta = asMetadataRecord(row.metadata);
  let change;
  try {
    change = await stubDrive.detectChange(
      {
        provider: row.provider,
        driveId: typeof publishedMeta.driveId === 'string' ? publishedMeta.driveId : null,
        siteId: typeof publishedMeta.siteId === 'string' ? publishedMeta.siteId : null,
        externalFileId: externalId,
        externalUrl: row.externalUrl,
        parentFolderId: row.parentFolderId,
        artifactType: row.artifactType,
        sourceMemoryIds: Array.isArray(row.sourceMemoryIds)
          ? (row.sourceMemoryIds as string[])
          : [],
        sourceRevisionIds: Array.isArray(row.sourceRevisionIds)
          ? (row.sourceRevisionIds as string[])
          : [],
        publishedAt: row.publishedAt.toISOString(),
        publishedBy: row.actorId ?? auth.actorId,
        lastExternalModifiedAt: row.lastExternalModifiedAt?.toISOString() ?? null,
        lastSyncedContentHash: row.lastSyncedContentHash,
        syncDirection: row.syncDirection as
          'EXPORT_ONLY' | 'IMPORT_ONLY' | 'BIDIRECTIONAL_REVIEWED',
        syncStatus: row.syncStatus as
          'PENDING' | 'PUBLISHED' | 'EXTERNAL_CHANGED' | 'SYNC_CONFLICT' | 'REPUBLISHED' | 'FAILED',
        title: row.title,
      },
      { localContentHash: repo.hashContent(row.content) },
    );
  } catch {
    throw new ServiceError(ERROR_CODES.MEMORY_NOT_FOUND, 'External file not found.', 404);
  }

  if (!change.changed) {
    return {
      artifact: serializePublishedArtifact(row),
      changed: false,
      harvest: null,
    };
  }

  const syncStatus = change.syncConflict ? 'SYNC_CONFLICT' : 'EXTERNAL_CHANGED';
  const artifactMeta = asMetadataRecord(row.metadata);
  const reasoningChainId = resolveReasoningChainId(artifactMeta);

  const updated = await repo.updatePublishedArtifact(prisma, auth.tenantId, artifactId, {
    syncStatus,
    lastExternalModifiedAt: new Date(change.modifiedAt),
    metadata: mergeMemoryMetadata({
      metadata: {
        ...artifactMeta,
        lastExternalHash: change.contentHash,
        syncIssue: 'External Drive content diverged from lastSyncedContentHash.',
      },
      icareStage: 'ISSUE',
      reasoningChainId,
      outcomeSummary: change.syncConflict
        ? 'Concurrent edit detected (SYNC_CONFLICT).'
        : 'External edit detected; harvest recommendations required.',
    }),
  });

  // ICARE³: Issue(external edit) → harvest Context/Analysis/Recommendations (candidates only)
  const harvest = await createHarvestRun(
    prisma,
    auth,
    {
      scopeType: row.scopeType,
      workspaceId: row.workspaceId ?? undefined,
      projectId: row.projectId ?? undefined,
      sourceText: change.content,
      sourceType: 'DRIVE',
      sourceUri: row.externalUrl ?? undefined,
      title: `External edit: ${row.title}`,
      reasoningChainId,
      metadata: {
        publishedArtifactId: row.id,
        syncStatus,
        previousHash: row.lastSyncedContentHash,
        externalHash: change.contentHash,
        icarePublisherLoop: true,
      },
    },
    requestId,
  );

  await repo.insertAuditEvent(prisma, {
    tenantId: auth.tenantId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    actorId: auth.actorId,
    memoryId: null,
    action: 'PUBLISH_SYNC',
    outcome: 'SUCCESS',
    requestId: requestId ?? null,
    reason: null,
    metadata: {
      artifactId,
      syncStatus,
      harvestRunId: harvest.run.id,
      icareStage: 'EXECUTION_EVALUATION',
      reasoningChainId,
      lessonsLearned: [
        'Never silently overwrite authoritative memory from Drive edits.',
        'External changes become candidates for recommendation evaluation.',
      ],
    },
  });

  return {
    artifact: serializePublishedArtifact(updated),
    changed: true,
    harvest,
    reasoningChainId,
  };
}

export async function republishArtifact(
  prisma: PrismaClient,
  auth: AuthContext,
  artifactId: string,
  body: unknown,
  requestId?: string,
) {
  requirePermission(auth, 'memory:publish');
  parseContract(publishedArtifactIdParamsSchema, { artifactId });
  const input = parseContract(republishArtifactRequestSchema, body ?? {});
  const row = await repo.getPublishedArtifact(prisma, auth.tenantId, artifactId);
  if (!row) {
    throw new ServiceError(ERROR_CODES.MEMORY_NOT_FOUND, 'Published artifact not found.', 404);
  }
  enforceMemoryScope(
    auth.credentialScope,
    row.scopeType,
    row.scopeId,
    row.workspaceId,
    row.projectId,
  );
  if (!row.externalFileId) {
    throw new ServiceError(ERROR_CODES.VALIDATION_ERROR, 'Artifact has no external file id.', 400);
  }

  const artifactMeta = asMetadataRecord(row.metadata);
  const reasoningChainId = resolveReasoningChainId(artifactMeta, input.reasoningChainId ?? null);

  const republished = await stubDrive.republish(
    {
      provider: row.provider,
      driveId: typeof artifactMeta.driveId === 'string' ? artifactMeta.driveId : null,
      siteId: typeof artifactMeta.siteId === 'string' ? artifactMeta.siteId : null,
      externalFileId: row.externalFileId,
      externalUrl: row.externalUrl,
      parentFolderId: row.parentFolderId,
      artifactType: row.artifactType,
      sourceMemoryIds: Array.isArray(row.sourceMemoryIds) ? (row.sourceMemoryIds as string[]) : [],
      sourceRevisionIds: Array.isArray(row.sourceRevisionIds)
        ? (row.sourceRevisionIds as string[])
        : [],
      publishedAt: row.publishedAt.toISOString(),
      publishedBy: row.actorId ?? auth.actorId,
      lastExternalModifiedAt: row.lastExternalModifiedAt?.toISOString() ?? null,
      lastSyncedContentHash: row.lastSyncedContentHash,
      syncDirection: row.syncDirection as 'EXPORT_ONLY' | 'IMPORT_ONLY' | 'BIDIRECTIONAL_REVIEWED',
      syncStatus: row.syncStatus as
        'PENDING' | 'PUBLISHED' | 'EXTERNAL_CHANGED' | 'SYNC_CONFLICT' | 'REPUBLISHED' | 'FAILED',
      title: row.title,
    },
    input.content,
  );

  const updated = await repo.updatePublishedArtifact(prisma, auth.tenantId, artifactId, {
    content: input.content,
    lastSyncedContentHash: republished.lastSyncedContentHash,
    syncStatus: 'REPUBLISHED',
    lastExternalModifiedAt: new Date(republished.lastExternalModifiedAt ?? Date.now()),
    metadata: mergeMemoryMetadata({
      metadata: { ...artifactMeta, requestId: requestId ?? null },
      icareStage: 'EXECUTION',
      reasoningChainId,
      executionStatus: 'republished',
      outcomeSummary: 'Authoritative content republished after governed approval.',
      lessonsLearned: ['Republish only after recommendation evaluation and memory update.'],
    }),
  });
  await repo.insertAuditEvent(prisma, {
    tenantId: auth.tenantId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    actorId: auth.actorId,
    memoryId: null,
    action: 'PUBLISH_REPUBLISH',
    outcome: 'SUCCESS',
    requestId: requestId ?? null,
    reason: null,
    metadata: {
      artifactId,
      icareStage: 'EXECUTION_EVALUATION',
      reasoningChainId,
    },
  });
  return { artifact: serializePublishedArtifact(updated), reasoningChainId };
}

/** Test helper: mutate stub external content (simulates Drive edit). */
export async function __setStubDriveContent(
  externalFileId: string,
  content: string,
): Promise<void> {
  await stubDrive.updateDocument({ fileId: externalFileId, content });
}

function serializeHarvestRun(run: repo.HarvestRunRow) {
  return {
    id: run.id,
    tenantId: run.tenantId,
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    actorId: run.actorId,
    sourceArtifactId: run.sourceArtifactId,
    scopeType: run.scopeType,
    scopeId: run.scopeId,
    status: run.status,
    title: run.title,
    errorMessage: run.errorMessage,
    metadata: run.metadata,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

function serializeCandidate(row: repo.MemoryCandidateRow) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    harvestRunId: row.harvestRunId,
    sourceArtifactId: row.sourceArtifactId,
    scopeType: row.scopeType,
    scopeId: row.scopeId,
    memoryType: row.memoryType,
    status: row.status,
    content: row.content,
    contentHash: row.contentHash,
    confidence: Number(row.confidence),
    relatedMemoryIds: row.relatedMemoryIds,
    approvedMemoryId: row.approvedMemoryId,
    reviewReason: row.reviewReason,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

function serializePublishedArtifact(row: repo.PublishedArtifactRow) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    actorId: row.actorId,
    scopeType: row.scopeType,
    scopeId: row.scopeId,
    provider: row.provider,
    externalFileId: row.externalFileId,
    externalUrl: row.externalUrl,
    parentFolderId: row.parentFolderId,
    artifactType: row.artifactType,
    title: row.title,
    content: row.content,
    sourceMemoryIds: row.sourceMemoryIds,
    sourceRevisionIds: row.sourceRevisionIds,
    publishedAt: row.publishedAt.toISOString(),
    lastExternalModifiedAt: row.lastExternalModifiedAt?.toISOString() ?? null,
    lastSyncedContentHash: row.lastSyncedContentHash,
    syncDirection: row.syncDirection,
    syncStatus: row.syncStatus,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
