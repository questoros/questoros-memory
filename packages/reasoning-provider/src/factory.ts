import type { ReasoningProvider } from './contracts.js';
import { loadReasoningConfig, type ReasoningConfig } from './config.js';
import { ReasoningProviderError, REASONING_ERROR_CODES } from './errors.js';
import { MockReasoningProvider } from './mock.js';

export interface CreateReasoningProviderOptions {
  config?: ReasoningConfig;
  /** Injected provider for tests. */
  provider?: ReasoningProvider;
}

/**
 * Factory for reasoning providers.
 * Live Bedrock/other model calls stay gated — CI and default paths use mock.
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
        'Live reasoning-model calls are disabled. Use REASONING_PROVIDER=mock or inject a provider.',
        503,
      );
    }
    throw new ReasoningProviderError(
      REASONING_ERROR_CODES.REASONING_LIVE_CALLS_DISABLED,
      'Live amazon-bedrock reasoning is not enabled in this checkpoint.',
      503,
    );
  }

  throw new ReasoningProviderError(
    REASONING_ERROR_CODES.REASONING_PROVIDER_NOT_CONFIGURED,
    'Reasoning provider is not configured.',
    500,
  );
}
