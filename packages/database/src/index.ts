export { getDatabaseClient, disconnectDatabaseClient } from './client.js';
export { EMBEDDING_MODEL_ID, EMBEDDING_DIMENSIONS, EMBEDDING_NORMALIZE } from './constants.js';
export { resolveScope } from './scope.js';
export type { ScopeInput, ScopeResult } from './scope.js';
export { validateVector, validateDimension, serializeVector, cosineDistanceSql } from './vector.js';
export { withRetry, withTransaction } from './retry.js';
export * from './repository/index.js';
