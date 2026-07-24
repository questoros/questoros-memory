import type { CredentialScope } from '@questoros-memory/memory-core';
import { ServiceError, ERROR_CODES } from '@questoros-memory/memory-core';

export interface RequestedScope {
  scopeType: 'TENANT' | 'WORKSPACE' | 'PROJECT';
  workspaceId: string | null;
  projectId: string | null;
}

export function resolveRequestedScope(
  scopeType: string,
  workspaceId?: string | null,
  projectId?: string | null,
): RequestedScope {
  if (scopeType === 'PROJECT') {
    if (!workspaceId || !projectId) {
      throw new ServiceError(
        ERROR_CODES.VALIDATION_ERROR,
        'Project scope requires workspaceId and projectId.',
      );
    }
    return { scopeType: 'PROJECT', workspaceId, projectId };
  }
  if (scopeType === 'WORKSPACE') {
    if (!workspaceId) {
      throw new ServiceError(ERROR_CODES.VALIDATION_ERROR, 'Workspace scope requires workspaceId.');
    }
    return { scopeType: 'WORKSPACE', workspaceId, projectId: null };
  }
  if (scopeType === 'TENANT') {
    return { scopeType: 'TENANT', workspaceId: null, projectId: null };
  }
  throw new ServiceError(ERROR_CODES.VALIDATION_ERROR, `Invalid scope type: ${scopeType}`);
}

export function getCredentialScopeId(scope: CredentialScope): string {
  return scope.scopeId;
}

export function isScopeContained(
  credentialScope: CredentialScope,
  requestedScope: RequestedScope,
): boolean {
  const { scopeType: credType, workspaceId: credWsId, projectId: credProjId } = credentialScope;

  // Tenant-scoped key can access anything within tenant
  if (credType === 'TENANT') return true;

  // Workspace-scoped key
  if (credType === 'WORKSPACE') {
    if (requestedScope.scopeType === 'TENANT') return false;
    // Must match the same workspace
    if (requestedScope.workspaceId !== credWsId) return false;
    return true;
  }

  // Project-scoped key
  if (credType === 'PROJECT') {
    if (requestedScope.scopeType !== 'PROJECT') return false;
    // Must match the same workspace AND project
    if (requestedScope.workspaceId !== credWsId) return false;
    if (requestedScope.projectId !== credProjId) return false;
    return true;
  }

  return false;
}

export function enforceScope(
  credentialScope: CredentialScope,
  requestedScope: RequestedScope,
): void {
  if (!isScopeContained(credentialScope, requestedScope)) {
    throw new ServiceError(
      ERROR_CODES.SCOPE_DENIED,
      'Operation exceeds your credential scope.',
      403,
    );
  }
}

export function enforceMemoryScope(
  credentialScope: CredentialScope,
  memoryScopeType: string,
  memoryScopeId: string,
  memoryWorkspaceId: string | null,
  memoryProjectId: string | null,
): void {
  const requested: RequestedScope = {
    scopeType: memoryScopeType as 'TENANT' | 'WORKSPACE' | 'PROJECT',
    workspaceId: memoryWorkspaceId,
    projectId: memoryProjectId,
  };
  enforceScope(credentialScope, requested);
}
