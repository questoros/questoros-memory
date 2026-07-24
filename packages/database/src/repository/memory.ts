import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { serializeVector } from '../vector.js';

// ── Types ──────────────────────────────────────────────────────

export interface CreateMemoryInput {
  tenantId: string;
  actorId: string;
  workspaceId: string | null;
  projectId: string | null;
  scopeType: string;
  scopeId: string;
  memoryType: string;
  content: string;
  contentHash: string;
  importance: number;
  confidence: number;
  sensitivity: string;
  validFrom: Date;
  validUntil: Date | null;
  sourceArtifactId: string | null;
  metadata: Record<string, unknown>;
}

export interface MemoryRow {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  projectId: string | null;
  actorId: string | null;
  sourceArtifactId: string | null;
  scopeType: string;
  scopeId: string;
  memoryType: string;
  status: string;
  content: string;
  contentHash: string;
  importance: number;
  confidence: number;
  sensitivity: string;
  validFrom: Date;
  validUntil: Date | null;
  supersededById: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface RevisionRow {
  id: string;
  tenantId: string;
  memoryId: string;
  revisionNumber: number;
  content: string;
  contentHash: string;
  reason: string | null;
  createdByActorId: string | null;
  createdAt: Date;
}

export interface AuditEventInput {
  tenantId: string;
  workspaceId: string | null;
  projectId: string | null;
  actorId: string | null;
  memoryId: string | null;
  action: string;
  outcome: string;
  requestId: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
}

export interface ListMemoriesFilter {
  tenantId: string;
  scopeType?: string;
  workspaceId?: string | null;
  projectId?: string | null;
  memoryType?: string;
  status?: string;
  sensitivity?: string;
  actorId?: string;
  icareStage?: string;
  reasoningChainId?: string;
  sourceArtifactId?: string;
  updatedAfter?: Date;
  updatedBefore?: Date;
  limit: number;
}

export interface ListMemoriesCursor {
  updatedAt: string;
  id: string;
}

export interface MemoryWithRevision extends MemoryRow {
  revisionNumber: number;
}

export interface SearchMemoryRow {
  id: string;
  tenant_id: string;
  workspace_id: string | null;
  project_id: string | null;
  actor_id: string | null;
  source_artifact_id: string | null;
  scope_type: string;
  scope_id: string;
  memory_type: string;
  status: string;
  content: string;
  content_hash: string;
  importance: number;
  confidence: number;
  sensitivity: string;
  valid_from: Date;
  valid_until: Date | null;
  superseded_by_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  revision_number: number;
  cosine_distance: number | null;
}

// ── Create memory ──────────────────────────────────────────────

export async function insertMemory(
  tx: Prisma.TransactionClient,
  input: CreateMemoryInput,
): Promise<MemoryRow> {
  const result = await tx.$queryRaw<MemoryRow[]>`
    INSERT INTO memories (
      tenant_id, actor_id, workspace_id, project_id,
      scope_type, scope_id, memory_type, status,
      content, content_hash, importance, confidence,
      sensitivity, valid_from, valid_until, source_artifact_id, metadata
    ) VALUES (
      ${input.tenantId}::uuid, ${input.actorId}::uuid, ${input.workspaceId}::uuid, ${input.projectId}::uuid,
      ${input.scopeType}, ${input.scopeId}::uuid, ${input.memoryType}, 'ACTIVE',
      ${input.content}, ${input.contentHash}, ${input.importance}, ${input.confidence},
      ${input.sensitivity}, ${input.validFrom}, ${input.validUntil}::timestamptz, ${input.sourceArtifactId}::uuid, ${JSON.stringify(input.metadata)}::jsonb
    )
    RETURNING
      id, tenant_id AS "tenantId", workspace_id AS "workspaceId", project_id AS "projectId",
      actor_id AS "actorId", source_artifact_id AS "sourceArtifactId",
      scope_type AS "scopeType", scope_id AS "scopeId", memory_type AS "memoryType",
      status, content, content_hash AS "contentHash", importance::float8 AS importance,
      confidence::float8 AS confidence, sensitivity, valid_from AS "validFrom",
      valid_until AS "validUntil", superseded_by_id AS "supersededById",
      metadata, created_at AS "createdAt", updated_at AS "updatedAt", deleted_at AS "deletedAt"
  `;
  return result[0];
}

export async function insertRevision(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    memoryId: string;
    revisionNumber: number;
    content: string;
    contentHash: string;
    reason: string | null;
    createdByActorId: string | null;
  },
): Promise<RevisionRow> {
  const result = await tx.$queryRaw<RevisionRow[]>`
    INSERT INTO memory_revisions (
      tenant_id, memory_id, revision_number, content, content_hash, reason, created_by_actor_id
    ) VALUES (
      ${input.tenantId}::uuid, ${input.memoryId}::uuid, ${input.revisionNumber},
      ${input.content}, ${input.contentHash}, ${input.reason}, ${input.createdByActorId}::uuid
    )
    RETURNING
      id, tenant_id AS "tenantId", memory_id AS "memoryId",
      revision_number AS "revisionNumber", content, content_hash AS "contentHash",
      reason, created_by_actor_id AS "createdByActorId", created_at AS "createdAt"
  `;
  return result[0];
}

export async function insertAuditEvent(tx: Prisma.TransactionClient, input: AuditEventInput) {
  await tx.$executeRaw`
    INSERT INTO memory_audit_events (
      tenant_id, workspace_id, project_id, actor_id, memory_id,
      action, outcome, request_id, reason, metadata
    ) VALUES (
      ${input.tenantId}::uuid, ${input.workspaceId}::uuid, ${input.projectId}::uuid,
      ${input.actorId}::uuid, ${input.memoryId}::uuid,
      ${input.action}, ${input.outcome}, ${input.requestId}, ${input.reason}, ${JSON.stringify(input.metadata)}::jsonb
    )
  `;
}

// ── Duplicate check ────────────────────────────────────────────

export async function findActiveMemoryByContentHash(
  tx: Prisma.TransactionClient,
  tenantId: string,
  scopeType: string,
  scopeId: string,
  memoryType: string,
  contentHash: string,
): Promise<MemoryRow | null> {
  const result = await tx.$queryRaw<MemoryRow[]>`
    SELECT
      id, tenant_id AS "tenantId", workspace_id AS "workspaceId", project_id AS "projectId",
      actor_id AS "actorId", source_artifact_id AS "sourceArtifactId",
      scope_type AS "scopeType", scope_id AS "scopeId", memory_type AS "memoryType",
      status, content, content_hash AS "contentHash", importance::float8 AS importance,
      confidence::float8 AS confidence, sensitivity, valid_from AS "validFrom",
      valid_until AS "validUntil", superseded_by_id AS "supersededById",
      metadata, created_at AS "createdAt", updated_at AS "updatedAt", deleted_at AS "deletedAt"
    FROM memories
    WHERE tenant_id = ${tenantId}::uuid
      AND scope_type = ${scopeType}
      AND scope_id = ${scopeId}::uuid
      AND memory_type = ${memoryType}
      AND content_hash = ${contentHash}
      AND status = 'ACTIVE'
    LIMIT 1
  `;
  return result[0] ?? null;
}

// ── Get memory ─────────────────────────────────────────────────

export async function getMemory(
  tx: Prisma.TransactionClient,
  tenantId: string,
  memoryId: string,
  includeDeleted: boolean = false,
): Promise<MemoryRow | null> {
  const whereDeleted = includeDeleted ? Prisma.sql`` : Prisma.sql`AND status != 'DELETED'`;

  const result = await tx.$queryRaw<MemoryRow[]>`
    SELECT
      id, tenant_id AS "tenantId", workspace_id AS "workspaceId", project_id AS "projectId",
      actor_id AS "actorId", source_artifact_id AS "sourceArtifactId",
      scope_type AS "scopeType", scope_id AS "scopeId", memory_type AS "memoryType",
      status, content, content_hash AS "contentHash", importance::float8 AS importance,
      confidence::float8 AS confidence, sensitivity, valid_from AS "validFrom",
      valid_until AS "validUntil", superseded_by_id AS "supersededById",
      metadata, created_at AS "createdAt", updated_at AS "updatedAt", deleted_at AS "deletedAt"
    FROM memories
    WHERE tenant_id = ${tenantId}::uuid
      AND id = ${memoryId}::uuid
      ${whereDeleted}
    LIMIT 1
  `;
  return result[0] ?? null;
}

// ── List memories ──────────────────────────────────────────────

export async function listMemories(
  prisma: PrismaClient,
  filter: ListMemoriesFilter,
  cursor: ListMemoriesCursor | null,
): Promise<MemoryRow[]> {
  const conditions: string[] = [`m.tenant_id = '${filter.tenantId}'`];

  if (cursor) {
    conditions.push(
      `(m.updated_at, m.id) < ('${cursor.updatedAt}'::timestamptz, '${cursor.id}'::uuid)`,
    );
  }

  if (filter.scopeType) {
    conditions.push(`m.scope_type = '${filter.scopeType}'`);
  }
  if (filter.workspaceId !== undefined && filter.workspaceId !== null) {
    conditions.push(`m.workspace_id = '${filter.workspaceId}'`);
  } else if (filter.workspaceId === null && filter.scopeType !== 'TENANT') {
    // Scope may be implied by scopeType
  }
  if (filter.projectId !== undefined && filter.projectId !== null) {
    conditions.push(`m.project_id = '${filter.projectId}'`);
  }
  if (filter.memoryType) {
    conditions.push(`m.memory_type = '${filter.memoryType}'`);
  }
  if (filter.status) {
    conditions.push(`m.status = '${filter.status}'`);
  } else {
    conditions.push(`m.status != 'DELETED'`);
  }
  if (filter.sensitivity) {
    conditions.push(`m.sensitivity = '${filter.sensitivity}'`);
  }
  if (filter.actorId) {
    conditions.push(`m.actor_id = '${filter.actorId}'`);
  }
  if (filter.updatedAfter) {
    conditions.push(`m.updated_at >= '${filter.updatedAfter.toISOString()}'::timestamptz`);
  }
  if (filter.updatedBefore) {
    conditions.push(`m.updated_at <= '${filter.updatedBefore.toISOString()}'::timestamptz`);
  }
  if (filter.sourceArtifactId) {
    conditions.push(`m.source_artifact_id = '${filter.sourceArtifactId}'`);
  }
  if (filter.icareStage) {
    conditions.push(`m.metadata->'icare'->>'icareStage' = '${filter.icareStage}'`);
  }
  if (filter.reasoningChainId) {
    conditions.push(`m.metadata->'icare'->>'reasoningChainId' = '${filter.reasoningChainId}'`);
  }

  const whereClause = conditions.join('\n      AND ');
  const limit = Math.min(filter.limit, 100);

  const result = await prisma.$queryRawUnsafe<MemoryRow[]>(`
    SELECT
      m.id, m.tenant_id AS "tenantId", m.workspace_id AS "workspaceId",
      m.project_id AS "projectId", m.actor_id AS "actorId",
      m.source_artifact_id AS "sourceArtifactId",
      m.scope_type AS "scopeType", m.scope_id AS "scopeId",
      m.memory_type AS "memoryType", m.status,
      m.content, m.content_hash AS "contentHash",
      m.importance::float8 AS importance, m.confidence::float8 AS confidence,
      m.sensitivity, m.valid_from AS "validFrom", m.valid_until AS "validUntil",
      m.superseded_by_id AS "supersededById",
      m.metadata, m.created_at AS "createdAt", m.updated_at AS "updatedAt",
      m.deleted_at AS "deletedAt"
    FROM memories m
    WHERE ${whereClause}
    ORDER BY m.updated_at DESC, m.id DESC
    LIMIT ${limit}
  `);

  return result;
}

// ── Update memory ──────────────────────────────────────────────

export async function updateMemory(
  tx: Prisma.TransactionClient,
  tenantId: string,
  memoryId: string,
  updates: {
    content?: string;
    contentHash?: string;
    importance?: number;
    confidence?: number;
    sensitivity?: string;
    validUntil?: Date | null;
    metadata?: Record<string, unknown>;
  },
): Promise<MemoryRow> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (updates.content !== undefined) {
    setClauses.push(`content = $${paramIndex++}`);
    params.push(updates.content);
    setClauses.push(`content_hash = $${paramIndex++}`);
    params.push(updates.contentHash);
  }
  if (updates.importance !== undefined) {
    setClauses.push(`importance = $${paramIndex++}::decimal(5,4)`);
    params.push(updates.importance);
  }
  if (updates.confidence !== undefined) {
    setClauses.push(`confidence = $${paramIndex++}::decimal(5,4)`);
    params.push(updates.confidence);
  }
  if (updates.sensitivity !== undefined) {
    setClauses.push(`sensitivity = $${paramIndex++}`);
    params.push(updates.sensitivity);
  }
  if (updates.validUntil !== undefined) {
    if (updates.validUntil === null) {
      setClauses.push(`valid_until = NULL`);
    } else {
      setClauses.push(`valid_until = $${paramIndex++}::timestamptz`);
      params.push(updates.validUntil);
    }
  }
  if (updates.metadata !== undefined) {
    setClauses.push(`metadata = $${paramIndex++}::jsonb`);
    params.push(JSON.stringify(updates.metadata));
  }

  setClauses.push(`updated_at = now()`);

  params.push(tenantId, memoryId);

  const result = await tx.$queryRawUnsafe<MemoryRow[]>(
    `
    UPDATE memories
    SET ${setClauses.join(', ')}
    WHERE tenant_id = $${paramIndex}::uuid AND id = $${paramIndex + 1}::uuid
    RETURNING
      id, tenant_id AS "tenantId", workspace_id AS "workspaceId", project_id AS "projectId",
      actor_id AS "actorId", source_artifact_id AS "sourceArtifactId",
      scope_type AS "scopeType", scope_id AS "scopeId", memory_type AS "memoryType",
      status, content, content_hash AS "contentHash", importance::float8 AS importance,
      confidence::float8 AS confidence, sensitivity, valid_from AS "validFrom",
      valid_until AS "validUntil", superseded_by_id AS "supersededById",
      metadata, created_at AS "createdAt", updated_at AS "updatedAt", deleted_at AS "deletedAt"
  `,
    ...params,
  );

  return result[0];
}

// ── Soft delete memory ─────────────────────────────────────────

export async function softDeleteMemory(
  tx: Prisma.TransactionClient,
  tenantId: string,
  memoryId: string,
) {
  await tx.$executeRaw`
    UPDATE memories
    SET status = 'DELETED', deleted_at = now(), updated_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND id = ${memoryId}::uuid
  `;
}

// ── Get revisions ──────────────────────────────────────────────

export async function getRevisions(
  prisma: PrismaClient,
  tenantId: string,
  memoryId: string,
): Promise<RevisionRow[]> {
  const result = await prisma.$queryRaw<RevisionRow[]>`
    SELECT
      id, tenant_id AS "tenantId", memory_id AS "memoryId",
      revision_number AS "revisionNumber", content, content_hash AS "contentHash",
      reason, created_by_actor_id AS "createdByActorId", created_at AS "createdAt"
    FROM memory_revisions
    WHERE tenant_id = ${tenantId}::uuid AND memory_id = ${memoryId}::uuid
    ORDER BY revision_number ASC
  `;
  return result;
}

export async function getMaxRevisionNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  memoryId: string,
): Promise<number> {
  const result = await tx.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(revision_number) AS max
    FROM memory_revisions
    WHERE tenant_id = ${tenantId}::uuid AND memory_id = ${memoryId}::uuid
  `;
  return result[0]?.max ?? 0;
}

// ── Embedding operations ───────────────────────────────────────

export async function upsertEmbedding(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    memoryId: string;
    scopeType: string;
    scopeId: string;
    embeddingModel: string;
    embeddingDimensions: number;
    embedding: number[];
  },
) {
  const vector = serializeVector(input.embedding);
  await tx.$executeRaw`
    UPSERT INTO memory_embeddings (
      tenant_id, memory_id, scope_type, scope_id,
      embedding_model, embedding_dimensions, embedding
    ) VALUES (
      ${input.tenantId}::uuid, ${input.memoryId}::uuid,
      ${input.scopeType}, ${input.scopeId}::uuid,
      ${input.embeddingModel}, ${input.embeddingDimensions},
      ${vector}::vector
    )
  `;
}

export async function deleteEmbeddingsForMemory(
  tx: Prisma.TransactionClient,
  tenantId: string,
  memoryId: string,
) {
  await tx.$executeRaw`
    DELETE FROM memory_embeddings
    WHERE tenant_id = ${tenantId}::uuid AND memory_id = ${memoryId}::uuid
  `;
}

export interface SearchFilterInput {
  tenantId: string;
  scopeType: string;
  scopeId: string;
  memoryTypes?: string[];
  sensitivities?: string[];
  icareStages?: string[];
  reasoningChainId?: string;
  sourceArtifactId?: string;
  updatedAfter?: Date;
  updatedBefore?: Date;
  limit: number;
}

function appendSearchMetadataFilters(
  conditions: string[],
  input: Pick<
    SearchFilterInput,
    | 'memoryTypes'
    | 'sensitivities'
    | 'icareStages'
    | 'reasoningChainId'
    | 'sourceArtifactId'
    | 'updatedAfter'
    | 'updatedBefore'
  >,
): void {
  if (input.memoryTypes && input.memoryTypes.length > 0) {
    const types = input.memoryTypes.map((t) => `'${t}'`).join(', ');
    conditions.push(`m.memory_type IN (${types})`);
  }

  if (input.sensitivities && input.sensitivities.length > 0) {
    const sens = input.sensitivities.map((s) => `'${s}'`).join(', ');
    conditions.push(`m.sensitivity IN (${sens})`);
  }

  if (input.icareStages && input.icareStages.length > 0) {
    const stages = input.icareStages.map((s) => `'${s}'`).join(', ');
    conditions.push(`m.metadata->'icare'->>'icareStage' IN (${stages})`);
  }

  if (input.reasoningChainId) {
    conditions.push(`m.metadata->'icare'->>'reasoningChainId' = '${input.reasoningChainId}'`);
  }

  if (input.sourceArtifactId) {
    conditions.push(`m.source_artifact_id = '${input.sourceArtifactId}'`);
  }

  if (input.updatedAfter) {
    conditions.push(`m.updated_at >= '${input.updatedAfter.toISOString()}'::timestamptz`);
  }

  if (input.updatedBefore) {
    conditions.push(`m.updated_at <= '${input.updatedBefore.toISOString()}'::timestamptz`);
  }
}

export async function searchByVector(
  prisma: PrismaClient,
  input: SearchFilterInput & {
    queryEmbedding: number[];
    minimumScore?: number;
  },
): Promise<SearchMemoryRow[]> {
  const vector = serializeVector(input.queryEmbedding);
  const limit = Math.min(input.limit, 100);

  const conditions: string[] = [
    `m.tenant_id = '${input.tenantId}'`,
    `me.scope_type = '${input.scopeType}'`,
    `me.scope_id = '${input.scopeId}'`,
    `m.status = 'ACTIVE'`,
  ];

  appendSearchMetadataFilters(conditions, input);

  const result = await prisma.$queryRawUnsafe<SearchMemoryRow[]>(`
    SELECT
      m.id, m.tenant_id, m.workspace_id, m.project_id,
      m.actor_id, m.source_artifact_id,
      m.scope_type, m.scope_id, m.memory_type,
      m.status, m.content, m.content_hash,
      m.importance::float8 AS importance, m.confidence::float8 AS confidence,
      m.sensitivity, m.valid_from, m.valid_until,
      m.superseded_by_id, m.metadata, m.created_at, m.updated_at, m.deleted_at,
      COALESCE(mr.revision_number, 1) AS revision_number,
      (me.embedding <=> '${vector}'::vector) AS cosine_distance
    FROM memories m
    JOIN memory_embeddings me ON me.tenant_id = m.tenant_id AND me.memory_id = m.id
    LEFT JOIN LATERAL (
      SELECT revision_number FROM memory_revisions
      WHERE tenant_id = m.tenant_id AND memory_id = m.id
      ORDER BY revision_number DESC
      LIMIT 1
    ) mr ON true
    WHERE ${conditions.join('\n      AND ')}
    ORDER BY me.embedding <=> '${vector}'::vector ASC
    LIMIT ${limit}
  `);

  return result;
}

export async function searchByText(
  prisma: PrismaClient,
  input: SearchFilterInput,
): Promise<SearchMemoryRow[]> {
  const limit = Math.min(input.limit, 100);

  const conditions: string[] = [
    `m.tenant_id = '${input.tenantId}'`,
    `m.scope_type = '${input.scopeType}'`,
    `m.scope_id = '${input.scopeId}'`,
    `m.status = 'ACTIVE'`,
  ];

  appendSearchMetadataFilters(conditions, input);

  const result = await prisma.$queryRawUnsafe<SearchMemoryRow[]>(`
    SELECT
      m.id, m.tenant_id, m.workspace_id, m.project_id,
      m.actor_id, m.source_artifact_id,
      m.scope_type, m.scope_id, m.memory_type,
      m.status, m.content, m.content_hash,
      m.importance::float8 AS importance, m.confidence::float8 AS confidence,
      m.sensitivity, m.valid_from, m.valid_until,
      m.superseded_by_id, m.metadata, m.created_at, m.updated_at, m.deleted_at,
      COALESCE(mr.revision_number, 1) AS revision_number,
      NULL::float8 AS cosine_distance
    FROM memories m
    LEFT JOIN LATERAL (
      SELECT revision_number FROM memory_revisions
      WHERE tenant_id = m.tenant_id AND memory_id = m.id
      ORDER BY revision_number DESC
      LIMIT 1
    ) mr ON true
    WHERE ${conditions.join('\n      AND ')}
    ORDER BY m.updated_at DESC, m.id DESC
    LIMIT ${limit}
  `);

  return result;
}

// ── ApiKey bootstrap ───────────────────────────────────────────

export async function insertApiKey(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    actorId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    scopeType: string;
    scopeId: string;
    workspaceId: string | null;
    projectId: string | null;
    permissions: string[];
  },
) {
  await tx.$executeRaw`
    INSERT INTO api_keys (
      tenant_id, actor_id, name, key_prefix, key_hash,
      scope_type, scope_id, workspace_id, project_id, permissions
    ) VALUES (
      ${input.tenantId}::uuid, ${input.actorId}::uuid, ${input.name},
      ${input.keyPrefix}, ${input.keyHash},
      ${input.scopeType}, ${input.scopeId}::uuid,
      ${input.workspaceId}::uuid, ${input.projectId}::uuid,
      ${JSON.stringify(input.permissions)}::jsonb
    )
  `;
}

export async function findActiveApiKey(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actorId: string,
  name: string,
): Promise<{ id: string; keyPrefix: string } | null> {
  const result = await tx.$queryRaw<{ id: string; keyPrefix: string }[]>`
    SELECT id, key_prefix AS "keyPrefix"
    FROM api_keys
    WHERE tenant_id = ${tenantId}::uuid
      AND actor_id = ${actorId}::uuid
      AND name = ${name}
      AND status = 'ACTIVE'
    LIMIT 1
  `;
  return result[0] ?? null;
}

export async function revokeApiKey(tx: Prisma.TransactionClient, apiKeyId: string) {
  await tx.$executeRaw`
    UPDATE api_keys
    SET status = 'REVOKED', revoked_at = now()
    WHERE id = ${apiKeyId}::uuid AND status = 'ACTIVE'
  `;
}

// ── Bootstrap helpers ──────────────────────────────────────────

export async function upsertTenant(
  tx: Prisma.TransactionClient,
  input: { slug: string; name: string },
): Promise<{ id: string }> {
  const result = await tx.$queryRaw<{ id: string }[]>`
    UPSERT INTO tenants (slug, name)
    VALUES (${input.slug}, ${input.name})
    RETURNING id
  `;
  return result[0];
}

export async function upsertWorkspace(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; slug: string; name: string },
): Promise<{ id: string }> {
  const result = await tx.$queryRaw<{ id: string }[]>`
    UPSERT INTO workspaces (tenant_id, slug, name)
    VALUES (${input.tenantId}::uuid, ${input.slug}, ${input.name})
    RETURNING id
  `;
  return result[0];
}

export async function upsertProject(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; workspaceId: string; slug: string; name: string },
): Promise<{ id: string }> {
  const result = await tx.$queryRaw<{ id: string }[]>`
    UPSERT INTO projects (tenant_id, workspace_id, slug, name)
    VALUES (${input.tenantId}::uuid, ${input.workspaceId}::uuid, ${input.slug}, ${input.name})
    RETURNING id
  `;
  return result[0];
}

export async function upsertActor(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; externalId: string; actorType: string; displayName?: string | null },
): Promise<{ id: string }> {
  const result = await tx.$queryRaw<{ id: string }[]>`
    UPSERT INTO actors (tenant_id, external_id, actor_type, display_name)
    VALUES (${input.tenantId}::uuid, ${input.externalId}, ${input.actorType}, ${input.displayName ?? null})
    RETURNING id
  `;
  return result[0];
}
