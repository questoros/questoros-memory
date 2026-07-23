export interface ScopeInput {
  tenantId: string;
  workspaceId?: string | null;
  projectId?: string | null;
}

export interface ScopeResult {
  scopeType: 'TENANT' | 'WORKSPACE' | 'PROJECT';
  scopeId: string;
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

  if (!tenantId || tenantId.trim() === '') {
    throw new Error('tenantId must be a non-blank string');
  }

  if (projectId) {
    const pid = projectId.trim();
    if (pid === '') {
      throw new Error('projectId must be a non-blank string when provided');
    }
    if (!workspaceId || workspaceId.trim() === '') {
      throw new Error('project scope requires a non-blank workspaceId');
    }
    return { scopeType: 'PROJECT', scopeId: pid };
  }

  if (workspaceId) {
    const wid = workspaceId.trim();
    if (wid === '') {
      throw new Error('workspaceId must be a non-blank string when provided');
    }
    return { scopeType: 'WORKSPACE', scopeId: wid };
  }

  return { scopeType: 'TENANT', scopeId: tenantId.trim() };
}
