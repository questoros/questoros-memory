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
  transportWhoami,
  transportCreateMemory,
  transportGetMemory,
  transportListMemories,
  transportSearchMemories,
  transportCorrectMemory,
  transportDeleteMemory,
  transportRevisionHistory,
  transportUpsertEmbedding,
  transportReadyz,
} from './transport.js';
