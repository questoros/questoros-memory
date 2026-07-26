import type { ReasoningProvider } from './contracts.js';
import { loadReasoningConfig, type ReasoningConfig } from './config.js';
import { ReasoningProviderError, REASONING_ERROR_CODES } from './errors.js';
import { MockReasoningProvider } from './mock.js';
import {
  BedrockNovaMicroReasoningProvider,
  type BedrockConverseClient,
} from './bedrock-nova-micro.js';

export interface CreateReasoningProviderOptions {
  config?: ReasoningConfig;
  /** Injected provider for tests. */
  provider?: ReasoningProvider;
  /** Injected Bedrock client for tests. */
  bedrockClient?: BedrockConverseClient;
}

/**
 * Factory for reasoning providers.
 * CI and default paths use mock. Live Bedrock requires an explicit allow flag.
 */
export function createReasoningProvider(
  options: CreateReasoningProviderOptions = {},
): ReasoningProvider {
  if (options.provider) {
    return options.provider;
  }

  const config = options.config ?? loadReasoningConfig();

  if (config.provider === 'mock') {
    return new MockReasoningProvider({ config });
  }

  if (config.provider === 'amazon-bedrock') {
    if (!config.allowLiveCalls) {
      throw new ReasoningProviderError(
        REASONING_ERROR_CODES.REASONING_LIVE_CALLS_DISABLED,
        'Live reasoning-model calls are disabled. Use REASONING_PROVIDER=mock or explicitly enable approved live calls.',
        503,
      );
    }
    return new BedrockNovaMicroReasoningProvider({
      config,
      client: options.bedrockClient,
    });
  }

  throw new ReasoningProviderError(
    REASONING_ERROR_CODES.REASONING_PROVIDER_NOT_CONFIGURED,
    'Reasoning provider is not configured.',
    500,
  );
}
