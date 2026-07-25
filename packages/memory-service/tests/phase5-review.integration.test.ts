/**
 * Opt-in CockroachDB integration for Phase 5 review atomicity and revision semantics.
 * Enable with RUN_DATABASE_INTEGRATION_TESTS=true and DATABASE_URL.
 * Never invokes live model / Google / Microsoft.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '@questoros-memory/memory-core';
import {
  API_PERMISSIONS,
  ERROR_CODES,
  ServiceError,
  generateApiKey,
} from '@questoros-memory/memory-core';
import {
  getDatabaseClient,
  disconnectDatabaseClient,
  withTransaction,
  getRevisions,
} from '@questoros-memory/database';
import * as repo from '@questoros-memory/database';
import { approveCandidate, rejectCandidate, createHarvestRun, createMemory } from '../src/index.js';

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';

describe.skipIf(!enabled)('Phase 5 candidate review atomicity (CockroachDB)', () => {
  let prisma: PrismaClient;
  let auth: AuthContext;
  let tenantId = '';
  let workspaceId = '';
  let projectId = '';
  let actorId = '';

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for Phase 5 review integration tests');
    }
    prisma = getDatabaseClient();
    const key = generateApiKey();
    const label = `phase5-review-${Date.now()}`;
    const scoped = await withTransaction(prisma, async (tx) => {
      const tenant = await repo.upsertTenant(tx, { slug: label, name: label });
      const workspace = await repo.upsertWorkspace(tx, {
        tenantId: tenant.id,
        slug: 'ws',
        name: 'WS',
      });
      const project = await repo.upsertProject(tx, {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        slug: 'proj',
        name: 'Proj',
      });
      const actor = await repo.upsertActor(tx, {
        tenantId: tenant.id,
        externalId: `${label}-actor`,
        actorType: 'SERVICE',
        displayName: 'Reviewer',
      });
      await repo.insertApiKey(tx, {
        tenantId: tenant.id,
        actorId: actor.id,
        name: `${label}-key`,
        keyPrefix: key.prefix,
        keyHash: key.hash,
        scopeType: 'PROJECT',
        scopeId: project.id,
        workspaceId: workspace.id,
        projectId: project.id,
        permissions: [...API_PERMISSIONS],
      });
      return { tenant, workspace, project, actor };
    });
    tenantId = scoped.tenant.id;
    workspaceId = scoped.workspace.id;
    projectId = scoped.project.id;
    actorId = scoped.actor.id;
    auth = {
      apiKeyId: randomUUID(),
      tenantId,
      actorId,
      permissions: [...API_PERMISSIONS],
      credentialScope: {
        scopeType: 'PROJECT',
        scopeId: projectId,
        workspaceId,
        projectId,
      },
    };
  });

  afterAll(async () => {
    if (!tenantId) return;
    try {
      await prisma.$executeRaw`DELETE FROM memory_candidates WHERE tenant_id = ${tenantId}::uuid`;
      await prisma.$executeRaw`DELETE FROM harvest_runs WHERE tenant_id = ${tenantId}::uuid`;
      await prisma.$executeRaw`DELETE FROM memory_embeddings WHERE tenant_id = ${tenantId}::uuid`;
      await prisma.$executeRaw`DELETE FROM memory_revisions WHERE tenant_id = ${tenantId}::uuid`;
      await prisma.$executeRaw`DELETE FROM memory_audit_events WHERE tenant_id = ${tenantId}::uuid`;
      await prisma.$executeRaw`UPDATE memories SET superseded_by_id = NULL WHERE tenant_id = ${tenantId}::uuid`;
      await prisma.$executeRaw`DELETE FROM memories WHERE tenant_id = ${tenantId}::uuid`;
      await prisma.$executeRaw`DELETE FROM source_artifacts WHERE tenant_id = ${tenantId}::uuid`;
      await prisma.$executeRaw`DELETE FROM api_keys WHERE tenant_id = ${tenantId}::uuid`;
      await prisma.$executeRaw`DELETE FROM actors WHERE tenant_id = ${tenantId}::uuid`;
      await prisma.$executeRaw`DELETE FROM projects WHERE tenant_id = ${tenantId}::uuid`;
      await prisma.$executeRaw`DELETE FROM workspaces WHERE tenant_id = ${tenantId}::uuid`;
      await prisma.$executeRaw`DELETE FROM tenants WHERE id = ${tenantId}::uuid`;
    } finally {
      await disconnectDatabaseClient();
    }
  });

  async function seedConflictCandidate() {
    // Isolate from other FACT memories so CONFLICT relatedIds[0] is this seed.
    await prisma.$executeRaw`
      UPDATE memory_candidates SET approved_memory_id = NULL WHERE tenant_id = ${tenantId}::uuid
    `;
    await prisma.$executeRaw`DELETE FROM memory_candidates WHERE tenant_id = ${tenantId}::uuid`;
    await prisma.$executeRaw`DELETE FROM harvest_runs WHERE tenant_id = ${tenantId}::uuid`;
    await prisma.$executeRaw`DELETE FROM memory_embeddings WHERE tenant_id = ${tenantId}::uuid`;
    await prisma.$executeRaw`DELETE FROM memory_revisions WHERE tenant_id = ${tenantId}::uuid`;
    await prisma.$executeRaw`DELETE FROM memory_audit_events WHERE tenant_id = ${tenantId}::uuid`;
    await prisma.$executeRaw`
      UPDATE memories SET superseded_by_id = NULL WHERE tenant_id = ${tenantId}::uuid
    `;
    await prisma.$executeRaw`DELETE FROM memories WHERE tenant_id = ${tenantId}::uuid`;
    await prisma.$executeRaw`DELETE FROM source_artifacts WHERE tenant_id = ${tenantId}::uuid`;

    const created = await createMemory(prisma, auth, {
      scopeType: 'PROJECT',
      workspaceId,
      projectId,
      memoryType: 'FACT',
      content: 'Launch date: July 15, 2026',
      icareStage: 'CONTEXT',
    });
    const harvest = await createHarvestRun(prisma, auth, {
      scopeType: 'PROJECT',
      workspaceId,
      projectId,
      sourceText: 'Launch date: August 20, 2026\nConstraint: no paid advertising.\n',
      sourceType: 'DOCUMENT',
      title: `correction harvest ${randomUUID().slice(0, 8)}`,
    });
    const conflict = harvest.candidates.find(
      (c) =>
        c.status === 'CONFLICT' &&
        Array.isArray(c.relatedMemoryIds) &&
        c.relatedMemoryIds.includes(created.memory.id),
    );
    if (!conflict) {
      throw new Error(
        `Expected CONFLICT linked to seeded memory; got ${JSON.stringify(
          harvest.candidates.map((c) => ({
            status: c.status,
            related: c.relatedMemoryIds,
            content: c.content,
          })),
        )}`,
      );
    }
    return { created, harvest, conflict };
  }

  it('records exact corrected revision history (rev1 July 15, rev2 August 20, current August 20)', async () => {
    const { created, conflict } = await seedConflictCandidate();
    const approved = await approveCandidate(prisma, auth, conflict.id, {
      reason: 'Supersede July 15 with August 20',
    });
    expect(approved.memory.content).toMatch(/August\s+20,\s*2026/i);
    expect(approved.memory.id).toBe(created.memory.id);

    const revisions = await getRevisions(prisma, tenantId, created.memory.id);
    expect(revisions).toHaveLength(2);
    expect(revisions[0]!.revisionNumber).toBe(1);
    expect(revisions[0]!.content).toBe('Launch date: July 15, 2026');
    expect(revisions[1]!.revisionNumber).toBe(2);
    expect(revisions[1]!.content).toMatch(/August\s+20,\s*2026/i);
    expect(revisions[1]!.reason).toMatch(/Supersede July 15/i);
    expect(revisions[1]!.createdByActorId).toBe(actorId);
  });

  it('allows only one concurrent approval to succeed with a single correction revision', async () => {
    const { created, conflict } = await seedConflictCandidate();
    const results = await Promise.allSettled([
      approveCandidate(prisma, auth, conflict.id, { reason: 'reviewer-a' }),
      approveCandidate(prisma, auth, conflict.id, { reason: 'reviewer-b' }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const err = (rejected[0] as PromiseRejectedResult).reason;
    expect(err).toBeInstanceOf(ServiceError);
    expect((err as ServiceError).code).toBe(ERROR_CODES.CONFLICT);
    expect((err as ServiceError).statusCode).toBe(409);

    const candidate = await repo.getMemoryCandidate(prisma, tenantId, conflict.id);
    expect(candidate?.status).toBe('APPROVED');
    const winner = (fulfilled[0] as PromiseFulfilledResult<{ memory: { id: string } }>).value;
    expect(winner.memory.id).toBe(created.memory.id);
    const revisions = await getRevisions(prisma, tenantId, created.memory.id);
    expect(revisions.filter((r) => /August\s+20/i.test(r.content))).toHaveLength(1);
  });

  it('approval vs rejection race yields exactly one terminal outcome', async () => {
    const { conflict } = await seedConflictCandidate();
    const results = await Promise.allSettled([
      approveCandidate(prisma, auth, conflict.id, { reason: 'approve-race' }),
      rejectCandidate(prisma, auth, conflict.id, { reason: 'reject-race' }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const candidate = await repo.getMemoryCandidate(prisma, tenantId, conflict.id);
    expect(['APPROVED', 'REJECTED']).toContain(candidate?.status);
  });

  it('rolls back claim on injected failure before commit', async () => {
    const { created, conflict } = await seedConflictCandidate();
    const beforeRevisions = await getRevisions(prisma, tenantId, created.memory.id);
    await expect(
      withTransaction(
        prisma,
        async (tx) => {
          const claimed = await repo.claimMemoryCandidateForReview(tx, tenantId, conflict.id);
          expect(claimed?.status).toBe('REVIEWING');
          throw new Error('injected-fault');
        },
        'fault-injection',
      ),
    ).rejects.toThrow(/injected-fault/);

    const after = await repo.getMemoryCandidate(prisma, tenantId, conflict.id);
    expect(after?.status).toBe('CONFLICT');
    const afterRevisions = await getRevisions(prisma, tenantId, created.memory.id);
    expect(afterRevisions).toHaveLength(beforeRevisions.length);
    const memory = await repo.getMemory(prisma, tenantId, created.memory.id);
    expect(memory?.content).toBe('Launch date: July 15, 2026');
  });

  it('rejects policy-disallowed, private, duplicate-without-merge, and failed-harvest approvals', async () => {
    const harvest = await createHarvestRun(prisma, auth, {
      scopeType: 'PROJECT',
      workspaceId,
      projectId,
      sourceText: 'Constraint: never ship without review.\n',
      sourceType: 'DOCUMENT',
      title: 'policy harvest',
    });
    const pending = harvest.candidates.find((c) => c.status === 'PENDING');
    expect(pending).toBeTruthy();

    await prisma.$executeRaw`
      UPDATE memory_candidates
      SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{policyAllowed}', 'false'::jsonb)
      WHERE tenant_id = ${tenantId}::uuid AND id = ${pending!.id}::uuid
    `;
    await expect(
      approveCandidate(prisma, auth, pending!.id, { reason: 'should fail policy' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.PERMISSION_DENIED });

    await prisma.$executeRaw`
      UPDATE memory_candidates
      SET metadata = jsonb_set(
        jsonb_set(COALESCE(metadata, '{}'::jsonb), '{policyAllowed}', 'true'::jsonb),
        '{ownershipClassification}',
        '"PRIVATE"'::jsonb
      )
      WHERE tenant_id = ${tenantId}::uuid AND id = ${pending!.id}::uuid
    `;
    await expect(
      approveCandidate(prisma, auth, pending!.id, { reason: 'should fail private' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.PERMISSION_DENIED });

    await prisma.$executeRaw`
      UPDATE memory_candidates
      SET status = 'DUPLICATE',
          metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{ownershipClassification}', '"PROJECT"'::jsonb)
      WHERE tenant_id = ${tenantId}::uuid AND id = ${pending!.id}::uuid
    `;
    await expect(
      approveCandidate(prisma, auth, pending!.id, { reason: 'should fail duplicate' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });

    await prisma.$executeRaw`
      UPDATE memory_candidates SET status = 'PENDING' WHERE tenant_id = ${tenantId}::uuid AND id = ${pending!.id}::uuid
    `;
    await prisma.$executeRaw`
      UPDATE harvest_runs SET status = 'FAILED' WHERE tenant_id = ${tenantId}::uuid AND id = ${harvest.run.id}::uuid
    `;
    await expect(
      approveCandidate(prisma, auth, pending!.id, { reason: 'should fail failed harvest' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CONFLICT });
  });
});
