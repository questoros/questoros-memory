import type {
  ConflictAnalysisRequest,
  ExecutionEvaluationRequest,
  PolicyEvaluationRequest,
  ReasoningProvider,
  StructuredExtractionRequest,
  ToolSelectionRequest,
} from './contracts.js';
import {
  DEFAULT_BEDROCK_REASONING_MODEL_ID,
  loadReasoningConfig,
  type ReasoningConfig,
} from './config.js';
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

class FailClosedBedrockReasoningProvider implements ReasoningProvider {
  public readonly providerName = 'amazon-bedrock';
  public readonly modelId = DEFAULT_BEDROCK_REASONING_MODEL_ID;
  private readonly error: ReasoningProviderError;

  constructor(error: ReasoningProviderError) {
    this.error = error;
  }

  private reject(): Promise<never> {
    return Promise.reject(this.error);
  }

  extract(_request: StructuredExtractionRequest): Promise<never> {
    return this.reject();
  }

  analyze(_request: ConflictAnalysisRequest): Promise<never> {
    return this.reject();
  }

  evaluate(_request: PolicyEvaluationRequest): Promise<never> {
    return this.reject();
  }

  selectNextTool(_request: ToolSelectionRequest): Promise<never> {
    return this.reject();
  }

  evaluateExecution(_request: ExecutionEvaluationRequest): Promise<never> {
    return this.reject();
  }
}

function explicitEnvironmentProvider(): string {
  return (process.env.REASONING_PROVIDER ?? '').trim().toLowerCase();
}

function asFailClosedError(error: unknown): ReasoningProviderError {
  if (error instanceof ReasoningProviderError) return error;
  return new ReasoningProviderError(
    REASONING_ERROR_CODES.REASONING_PROVIDER_NOT_CONFIGURED,
    'Live Bedrock reasoning is not configured correctly.',
    503,
  );
}

/**
 * Factory for reasoning providers.
 * CI and default paths use mock. Live Bedrock requires an explicit allow flag.
 * Explicit Bedrock configuration fails closed at operation time so service
 * startup cannot silently replace the approved live provider with the mock.
 */
export function createReasoningProvider(
  options: CreateReasoningProviderOptions = {},
): ReasoningProvider {
  if (options.provider) {
    return options.provider;
  }

  let config: ReasoningConfig;
  try {
    config = options.config ?? loadReasoningConfig();
  } catch (error) {
    if (!options.config && explicitEnvironmentProvider() === 'amazon-bedrock') {
      return new FailClosedBedrockReasoningProvider(asFailClosedError(error));
    }
    throw error;
  }

  if (config.provider === 'mock') {
    return new MockReasoningProvider({ config });
  }

  if (config.provider === 'amazon-bedrock') {
    if (!config.allowLiveCalls) {
      const error = new ReasoningProviderError(
        REASONING_ERROR_CODES.REASONING_LIVE_CALLS_DISABLED,
        'Live reasoning-model calls are disabled. Use REASONING_PROVIDER=mock or explicitly enable approved live calls.',
        503,
      );
      if (!options.config) {
        return new FailClosedBedrockReasoningProvider(error);
      }
      throw error;
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
