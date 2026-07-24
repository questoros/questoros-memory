import type { ApiPermission } from './permissions.js';

export interface CredentialScope {
  scopeType: 'TENANT' | 'WORKSPACE' | 'PROJECT';
  scopeId: string;
  workspaceId: string | null;
  projectId: string | null;
}

export interface AuthContext {
  apiKeyId: string;
  tenantId: string;
  actorId: string;
  credentialScope: CredentialScope;
  permissions: readonly ApiPermission[];
}
