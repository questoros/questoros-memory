export interface ScopeInput {
  tenantId: string;
  workspaceId?: string | null;
  projectId?: string | null;
}

export interface ScopeResult {
  scopeType: 'TENANT' | 'WORKSPACE' | 'PROJECT';
  scopeId: string;
}

function isBlank(value: string | null | undefined): boolean {
  return value === undefined || value === null || value.trim() === '';
}

/**
 * Resolve exactly one valid scope from the input IDs.
 *
 * Rules:
 * - project requires workspace;
 * - project scope uses the project ID;
 * - workspace scope uses the workspace ID;
 * - otherwise tenant scope uses the tenant ID;
 * - blank IDs are rejected.
 */
export function resolveScope(input: ScopeInput): ScopeResult {
  const { tenantId, workspaceId, projectId } = input;

  if (isBlank(tenantId)) {
    throw new Error('tenantId must be a non-blank string');
  }

  if (projectId !== undefined && projectId !== null) {
    if (projectId.trim() === '') {
      throw new Error('projectId must be a non-blank string when provided');
    }
    if (isBlank(workspaceId)) {
      throw new Error('project scope requires a non-blank workspaceId');
    }
    return { scopeType: 'PROJECT', scopeId: projectId.trim() };
  }

  if (workspaceId !== undefined && workspaceId !== null) {
    if (workspaceId.trim() === '') {
      throw new Error('workspaceId must be a non-blank string when provided');
    }
    return { scopeType: 'WORKSPACE', scopeId: workspaceId.trim() };
  }

  return { scopeType: 'TENANT', scopeId: tenantId.trim() };
}
