export type { EmbeddingRequest, EmbeddingResult, EmbeddingProvider } from './contracts.js';
export {
  loadEmbeddingConfig,
  TITAN_V2_MODEL_ID,
  TITAN_V2_DIMENSIONS,
  TITAN_V2_NORMALIZE,
  TITAN_V2_PROVIDER,
  HARD_MAX_INPUT_CHARACTERS,
  DEFAULT_MAX_INPUT_CHARACTERS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_BEDROCK_REGION,
} from './config.js';
export type { EmbeddingConfig } from './config.js';
export { EmbeddingProviderError, EMBEDDING_ERROR_CODES } from './errors.js';
export type { EmbeddingErrorCode } from './errors.js';
export {
  validateEmbeddingRequest,
  buildTitanInvokeBody,
  extractEmbeddingVector,
} from './validation.js';
export type { TitanInvokeBody } from './validation.js';
export { BedrockTitanV2Provider } from './bedrock-titan-v2.js';
export type { BedrockTitanV2ProviderOptions } from './bedrock-titan-v2.js';
export { createEmbeddingProvider } from './factory.js';
export type { CreateEmbeddingProviderOptions } from './factory.js';
