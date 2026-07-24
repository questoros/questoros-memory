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
