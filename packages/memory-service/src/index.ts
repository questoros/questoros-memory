export { authenticate } from './auth.js';
export type { AuthenticateResult } from './auth.js';
export {
  resolveRequestedScope,
  enforceScope,
  enforceMemoryScope,
  isScopeContained,
} from './scope.js';
export type { RequestedScope } from './scope.js';
export { normalizeContent, hashContent, validateMetadata, validateEmbedding } from './content.js';
export {
  createMemory,
  getMemory,
  listMemories,
  correctMemory,
  deleteMemory,
  getRevisionHistory,
  upsertEmbedding,
  searchMemories,
  whoami,
} from './operations.js';
export type {
  CreateMemoryInput,
  CreateMemoryResult,
  ListMemoriesInput,
  ListMemoriesResult,
  CorrectMemoryInput,
  CorrectMemoryResult,
  DeleteMemoryResult,
  UpsertEmbeddingInput,
  SearchInput,
  SearchResultItem,
  WhoamiResult,
} from './operations.js';
export {
  generateEmbeddingForMemory,
  maybeAutoGenerateEmbedding,
  mapEmbeddingProviderError,
} from './embeddings.js';
export type { GenerateEmbeddingOptions } from './embeddings.js';
export {
  extractCandidatesFromText,
  analyzeCandidateAgainstMemories,
  recommendationForAnalysisStatus,
  createHarvestRun,
  getHarvestRun,
  listCandidates,
  getCandidate,
  approveCandidate,
  rejectCandidate,
  createContextPackage,
  publishArtifact,
  getPublishedArtifact,
  syncPublishedArtifact,
  republishArtifact,
  __setStubDriveContent,
} from './phase5.js';
export {
  transportWhoami,
  transportCreateMemory,
  transportGetMemory,
  transportListMemories,
  transportSearchMemories,
  transportCorrectMemory,
  transportDeleteMemory,
  transportRevisionHistory,
  transportUpsertEmbedding,
  transportGenerateEmbedding,
  transportCreateHarvestRun,
  transportGetHarvestRun,
  transportListCandidates,
  transportGetCandidate,
  transportApproveCandidate,
  transportRejectCandidate,
  transportCreateContextPackage,
  transportPublishArtifact,
  transportGetPublishedArtifact,
  transportSyncPublishedArtifact,
  transportRepublishArtifact,
  transportReadyz,
} from './transport.js';
