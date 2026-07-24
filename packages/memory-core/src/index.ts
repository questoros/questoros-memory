export {
  SCOPE_TYPES,
  MEMORY_TYPES,
  MEMORY_STATUSES,
  SENSITIVITY_VALUES,
  ACTOR_TYPES,
  SOURCE_TYPES,
  AUDIT_OUTCOMES,
} from './memory-types.js';
export type {
  ScopeType,
  MemoryType,
  MemoryStatus,
  SensitivityValue,
  ActorType,
  SourceType,
  AuditOutcome,
} from './memory-types.js';

export {
  API_PERMISSIONS,
  PERMISSION_HIERARCHY,
  hasPermission,
  impliesPermission,
  validatePermissions,
  sortPermissions,
} from './permissions.js';
export type { ApiPermission } from './permissions.js';

export type { CredentialScope, AuthContext } from './auth.js';

export { API_KEY_PREFIX, generateApiKey, parseApiKey, hashApiKey } from './api-key.js';
export type { ParsedApiKey, GeneratedApiKey } from './api-key.js';

export {
  VECTOR_WEIGHTS,
  NO_VECTOR_WEIGHTS,
  computeKeywordScore,
  clampVectorSimilarity,
  computeRecency,
  computeFinalScore,
  buildReasons,
} from './search.js';
export type { SearchComponents, SearchExplanation } from './search.js';

export { encodeCursor, decodeCursor, CursorError } from './cursor.js';
export type { CursorData } from './cursor.js';

export { ERROR_CODES, ServiceError } from './errors.js';
export type { ErrorCode } from './errors.js';

export {
  MAX_CONTENT_BYTES,
  MAX_METADATA_BYTES,
  MAX_METADATA_DEPTH,
  MAX_TITLE_LENGTH,
  MAX_REASON_BYTES,
  MAX_QUERY_TEXT_BYTES,
  MAX_OUTCOME_SUMMARY_LENGTH,
  MAX_LESSON_LENGTH,
  MAX_LESSONS,
  MAX_RELATED_MEMORY_IDS,
  MAX_EMBEDDING_MODEL_LENGTH,
  MAX_CURSOR_LENGTH,
  EMBEDDING_DIMENSIONS,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  DEFAULT_EMBEDDING_MODEL,
  EXECUTION_STATUSES,
} from './limits.js';
export type { ExecutionStatus } from './limits.js';

export {
  ICARE_PRODUCT_NAME,
  ICARE_PRODUCT_TAGLINE,
  ICARE_ELEVATOR_PITCH,
  ICARE_PUBLIC_LIFECYCLE,
  ICARE_LIFECYCLE_STAGES,
  ICARE_PUBLIC_STAGE_LABELS,
  ICARE_METADATA_KEY,
  TITLE_METADATA_KEY,
  isIcareLifecycleStage,
  getIcarePublicLabel,
  extractIcareMetadata,
  extractTitle,
  mergeMemoryMetadata,
  collectRelatedMemoryIds,
} from './icare.js';
export type { IcareLifecycleStage, IcareMetadata, IcareRequestFields } from './icare.js';

export {
  scopeTypeSchema,
  memoryTypeSchema,
  memoryStatusSchema,
  sensitivitySchema,
  apiPermissionSchema,
  icareLifecycleStageSchema,
  executionStatusSchema,
  uuidSchema,
  embeddingVectorSchema,
  embeddingModelSchema,
  titleSchema,
  icareFieldsSchema,
  icareMetadataSchema,
  memoryMetadataSchema,
  credentialScopeSchema,
  authContextSchema,
  whoamiResponseSchema,
  createMemoryRequestSchema,
  correctMemoryRequestSchema,
  searchMemoryRequestSchema,
  listMemoriesQuerySchema,
  getMemoryQuerySchema,
  memoryIdParamsSchema,
  upsertEmbeddingRequestSchema,
  cursorDataSchema,
  memoryRecordSchema,
  memoryRevisionSchema,
  listMemoriesResponseSchema,
  searchExplanationSchema,
  searchResultItemSchema,
  correctMemoryResponseSchema,
  deleteMemoryResponseSchema,
  upsertEmbeddingResponseSchema,
  errorBodySchema,
  createMemoryToolShape,
  getMemoryToolShape,
  listMemoriesToolShape,
  searchMemoryToolShape,
  correctMemoryToolShape,
  deleteMemoryToolShape,
  historyMemoryToolShape,
  setEmbeddingToolShape,
  formatZodIssues,
  parseContract,
  paginationDefaults,
} from './schemas.js';
export type {
  CreateMemoryRequest,
  CorrectMemoryRequest,
  SearchMemoryRequest,
  ListMemoriesQuery,
  UpsertEmbeddingRequest,
  WhoamiResponse,
  MemoryRecord,
  MemoryRevision,
  SearchResultItemContract,
  ErrorBody,
  IcareMetadataInput,
} from './schemas.js';
