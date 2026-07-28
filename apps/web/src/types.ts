export type PortalView = 'overview' | 'ask' | 'knowledge' | 'review';

export type ServiceState =
  'checking' | 'operational' | 'degraded' | 'unavailable' | 'not-configured';

export interface RuntimeConfig {
  apiBaseUrl?: string;
  productName?: string;
  statusPageTitle?: string;
}

export interface CredentialScope {
  scopeType: 'TENANT' | 'WORKSPACE' | 'PROJECT';
  scopeId: string;
  workspaceId: string | null;
  projectId: string | null;
}

export interface WhoAmI {
  tenantId: string;
  actorId: string;
  credentialScope: CredentialScope;
  permissions: string[];
}

export interface MemoryRecord {
  id: string;
  tenantId?: string;
  workspaceId: string | null;
  projectId: string | null;
  actorId?: string | null;
  sourceArtifactId: string | null;
  scopeType: string;
  scopeId: string;
  memoryType: string;
  status: string;
  content: string;
  contentHash?: string;
  importance: number;
  confidence: number;
  sensitivity: string;
  validFrom?: string;
  validUntil?: string | null;
  supersededById?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface MemoryRevision {
  id: string;
  memoryId: string;
  revisionNumber: number;
  content: string;
  reason: string | null;
  createdAt: string;
  createdByActorId?: string | null;
}

export interface SearchExplanation {
  finalScore: number;
  reasons: string[];
  components?: Record<string, number>;
  weights?: Record<string, number>;
}

export interface SearchResult {
  memory: MemoryRecord;
  revisionNumber: number;
  explanation: SearchExplanation;
}

export interface MemoryCandidate {
  id: string;
  harvestRunId?: string;
  sourceArtifactId?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  scopeType?: string;
  scopeId?: string;
  memoryType: string;
  status: string;
  content: string;
  confidence: number;
  relatedMemoryIds?: string[];
  approvedMemoryId?: string | null;
  reviewReason?: string | null;
  reviewedAt?: string | null;
  metadata: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface SourceLink {
  label: string;
  url: string;
  kind: 'file' | 'folder' | 'message' | 'meeting' | 'source';
}

export interface PublicHealth {
  portal: ServiceState;
  api: ServiceState;
  readiness: ServiceState;
  checkedAt: string | null;
  message?: string;
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
  };
}
