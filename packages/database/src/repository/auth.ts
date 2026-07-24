import type { PrismaClient } from '@prisma/client';
import type { AuthContext, ApiPermission } from '@questoros-memory/memory-core';

export interface StoredApiKey {
  id: string;
  tenantId: string;
  actorId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopeType: string;
  scopeId: string;
  workspaceId: string | null;
  projectId: string | null;
  permissions: ApiPermission[];
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
  tenantStatus: string;
}

export async function lookupApiKey(
  prisma: PrismaClient,
  keyHash: string,
): Promise<StoredApiKey | null> {
  const result = await prisma.$queryRaw<StoredApiKey[]>`
    SELECT
      ak.id,
      ak.tenant_id AS "tenantId",
      ak.actor_id AS "actorId",
      ak.name,
      ak.key_prefix AS "keyPrefix",
      ak.key_hash AS "keyHash",
      ak.scope_type AS "scopeType",
      ak.scope_id AS "scopeId",
      ak.workspace_id AS "workspaceId",
      ak.project_id AS "projectId",
      ak.permissions,
      ak.status,
      ak.expires_at AS "expiresAt",
      ak.created_at AS "createdAt",
      ak.revoked_at AS "revokedAt",
      t.status AS "tenantStatus"
    FROM api_keys ak
    JOIN tenants t ON t.id = ak.tenant_id
    WHERE ak.key_hash = ${keyHash}
    LIMIT 1
  `;
  return result[0] ?? null;
}

export function validateApiKeyStatus(stored: StoredApiKey): AuthContext | null {
  // Tenant must be ACTIVE
  if (stored.tenantStatus !== 'ACTIVE') return null;

  // Key must be ACTIVE
  if (stored.status !== 'ACTIVE') return null;

  // Check expiration
  if (stored.expiresAt && new Date() > stored.expiresAt) return null;

  const permissions = stored.permissions;

  return {
    apiKeyId: stored.id,
    tenantId: stored.tenantId,
    actorId: stored.actorId,
    credentialScope: {
      scopeType: stored.scopeType as 'TENANT' | 'WORKSPACE' | 'PROJECT',
      scopeId: stored.scopeId,
      workspaceId: stored.workspaceId,
      projectId: stored.projectId,
    },
    permissions,
  };
}
