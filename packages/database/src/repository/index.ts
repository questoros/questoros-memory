export { lookupApiKey, validateApiKeyStatus } from './auth.js';
export type { StoredApiKey } from './auth.js';

export {
  insertMemory,
  insertRevision,
  insertAuditEvent,
  findActiveMemoryByContentHash,
  getMemory,
  listMemories,
  updateMemory,
  softDeleteMemory,
  getRevisions,
  getMaxRevisionNumber,
  upsertEmbedding,
  hasEmbedding,
  deleteEmbeddingsForMemory,
  searchByVector,
  searchByText,
  insertApiKey,
  findActiveApiKey,
  revokeApiKey,
  upsertTenant,
  upsertWorkspace,
  upsertProject,
  upsertActor,
  buildListMemoryConditions,
  assertSqlFullyParameterized,
  joinSqlAnd,
} from './memory.js';
export type {
  CreateMemoryInput,
  MemoryRow,
  RevisionRow,
  AuditEventInput,
  ListMemoriesFilter,
  ListMemoriesCursor,
  MemoryWithRevision,
  SearchMemoryRow,
} from './memory.js';

export {
  hashContent,
  insertHarvestRun,
  updateHarvestRun,
  getHarvestRun,
  insertMemoryCandidate,
  getMemoryCandidate,
  listMemoryCandidates,
  updateMemoryCandidate,
  insertPublishedArtifact,
  getPublishedArtifact,
  updatePublishedArtifact,
  insertSourceArtifact,
} from './harvest.js';
export type { HarvestRunRow, MemoryCandidateRow, PublishedArtifactRow } from './harvest.js';
