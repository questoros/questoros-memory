import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  type BedrockRuntimeClientConfig,
} from '@aws-sdk/client-bedrock-runtime';
import type { EmbeddingProvider, EmbeddingRequest, EmbeddingResult } from './contracts.js';
import {
  TITAN_V2_DIMENSIONS,
  TITAN_V2_MODEL_ID,
  TITAN_V2_NORMALIZE,
  TITAN_V2_PROVIDER,
  type EmbeddingConfig,
} from './config.js';
import { EmbeddingProviderError, EMBEDDING_ERROR_CODES } from './errors.js';
import {
  buildTitanInvokeBody,
  extractEmbeddingVector,
  validateEmbeddingRequest,
} from './validation.js';

export interface BedrockTitanV2ProviderOptions {
  config: EmbeddingConfig;
  client?: BedrockRuntimeClient;
  clientConfig?: BedrockRuntimeClientConfig;
}

function mapAwsError(error: unknown): EmbeddingProviderError {
  if (error instanceof EmbeddingProviderError) {
    return error;
  }

  const name =
    error &&
    typeof error === 'object' &&
    'name' in error &&
    typeof (error as { name?: unknown }).name === 'string'
      ? (error as { name: string }).name
      : '';
  const httpStatus =
    error && typeof error === 'object' && '$metadata' in error
      ? Number(
          (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? NaN,
        )
      : NaN;

  if (
    name === 'AccessDeniedException' ||
    name === 'UnauthorizedException' ||
    httpStatus === 401 ||
    httpStatus === 403
  ) {
    return new EmbeddingProviderError(
      EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_ACCESS_DENIED,
      'Embedding provider access was denied.',
      403,
    );
  }

  if (name === 'ThrottlingException' || name === 'TooManyRequestsException' || httpStatus === 429) {
    return new EmbeddingProviderError(
      EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_THROTTLED,
      'Embedding provider is throttling requests.',
      429,
      true,
    );
  }

  if (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    name === 'RequestTimeout' ||
    name === 'TimeoutException'
  ) {
    return new EmbeddingProviderError(
      EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_TIMEOUT,
      'Embedding provider request timed out.',
      504,
      true,
    );
  }

  if (
    name === 'ServiceUnavailableException' ||
    name === 'InternalServerException' ||
    httpStatus === 500 ||
    httpStatus === 502 ||
    httpStatus === 503
  ) {
    return new EmbeddingProviderError(
      EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_UNAVAILABLE,
      'Embedding provider is temporarily unavailable.',
      503,
      true,
    );
  }

  if (
    name === 'ValidationException' ||
    name === 'ModelErrorException' ||
    name === 'ModelNotReadyException' ||
    name === 'ResourceNotFoundException'
  ) {
    return new EmbeddingProviderError(
      EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_RESPONSE_INVALID,
      'Embedding provider rejected the request.',
      502,
    );
  }

  return new EmbeddingProviderError(
    EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_UNAVAILABLE,
    'Embedding provider request failed.',
    503,
    true,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class BedrockTitanV2Provider implements EmbeddingProvider {
  public readonly providerName = TITAN_V2_PROVIDER;
  private readonly config: EmbeddingConfig;
  private readonly client: BedrockRuntimeClient;

  constructor(options: BedrockTitanV2ProviderOptions) {
    this.config = options.config;
    this.client =
      options.client ??
      new BedrockRuntimeClient({
        region: options.config.bedrockRegion,
        maxAttempts: 1,
        ...(options.clientConfig ?? {}),
      });
  }

  async generate(request: EmbeddingRequest): Promise<EmbeddingResult> {
    const inputText = validateEmbeddingRequest(request, this.config.maxInputCharacters);
    const body = buildTitanInvokeBody(inputText);
    const encoded = new TextEncoder().encode(JSON.stringify(body));

    let attempt = 0;
    let lastError: EmbeddingProviderError | undefined;

    while (attempt < this.config.maxAttempts) {
      attempt += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await this.client.send(
          new InvokeModelCommand({
            modelId: TITAN_V2_MODEL_ID,
            contentType: 'application/json',
            accept: 'application/json',
            body: encoded,
          }),
          { abortSignal: controller.signal },
        );

        if (!response.body) {
          throw new EmbeddingProviderError(
            EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_RESPONSE_INVALID,
            'Embedding provider returned an empty body.',
            502,
          );
        }

        const text = new TextDecoder().decode(response.body);
        let parsed: unknown;
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          throw new EmbeddingProviderError(
            EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_RESPONSE_INVALID,
            'Embedding provider returned non-JSON content.',
            502,
          );
        }

        const { embedding, inputTokenCount } = extractEmbeddingVector(parsed);
        return {
          embedding,
          modelId: TITAN_V2_MODEL_ID,
          dimensions: TITAN_V2_DIMENSIONS,
          normalized: TITAN_V2_NORMALIZE,
          inputTokenCount,
          provider: TITAN_V2_PROVIDER,
        };
      } catch (error) {
        lastError = mapAwsError(error);
        const canRetry = lastError.retryable && attempt < this.config.maxAttempts;
        if (!canRetry) {
          throw lastError;
        }
        await sleep(Math.min(250 * 2 ** (attempt - 1), 2000));
      } finally {
        clearTimeout(timer);
      }
    }

    throw (
      lastError ??
      new EmbeddingProviderError(
        EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_UNAVAILABLE,
        'Embedding provider request failed.',
        503,
        true,
      )
    );
  }
}
