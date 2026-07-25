import type { EmbeddingProvider } from './contracts.js';
import { loadEmbeddingConfig, type EmbeddingConfig } from './config.js';
import { BedrockTitanV2Provider } from './bedrock-titan-v2.js';
import { EmbeddingProviderError, EMBEDDING_ERROR_CODES } from './errors.js';

export interface CreateEmbeddingProviderOptions {
  config?: EmbeddingConfig;
  client?: ConstructorParameters<typeof BedrockTitanV2Provider>[0]['client'];
}

export function createEmbeddingProvider(
  options: CreateEmbeddingProviderOptions = {},
): EmbeddingProvider {
  const config = options.config ?? loadEmbeddingConfig();
  if (config.provider !== 'amazon-bedrock') {
    throw new EmbeddingProviderError(
      EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_NOT_CONFIGURED,
      'Embedding provider is not configured.',
      500,
    );
  }
  return new BedrockTitanV2Provider({
    config,
    client: options.client,
  });
}
