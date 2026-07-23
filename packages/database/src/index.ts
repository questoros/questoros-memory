export { getDatabaseClient, disconnectDatabaseClient } from './client';
export { EMBEDDING_MODEL_ID, EMBEDDING_DIMENSIONS, EMBEDDING_NORMALIZE } from './constants';
export { resolveScope } from './scope';
export type { ScopeInput, ScopeResult } from './scope';
export { validateVector, validateDimension, serializeVector, cosineDistanceSql } from './vector';
