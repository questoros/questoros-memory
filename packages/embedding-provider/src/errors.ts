export const EMBEDDING_ERROR_CODES = {
  EMBEDDING_PROVIDER_NOT_CONFIGURED: 'EMBEDDING_PROVIDER_NOT_CONFIGURED',
  EMBEDDING_INPUT_EMPTY: 'EMBEDDING_INPUT_EMPTY',
  EMBEDDING_INPUT_TOO_LARGE: 'EMBEDDING_INPUT_TOO_LARGE',
  EMBEDDING_PROVIDER_ACCESS_DENIED: 'EMBEDDING_PROVIDER_ACCESS_DENIED',
  EMBEDDING_PROVIDER_THROTTLED: 'EMBEDDING_PROVIDER_THROTTLED',
  EMBEDDING_PROVIDER_TIMEOUT: 'EMBEDDING_PROVIDER_TIMEOUT',
  EMBEDDING_PROVIDER_RESPONSE_INVALID: 'EMBEDDING_PROVIDER_RESPONSE_INVALID',
  EMBEDDING_PROVIDER_UNAVAILABLE: 'EMBEDDING_PROVIDER_UNAVAILABLE',
} as const;

export type EmbeddingErrorCode = (typeof EMBEDDING_ERROR_CODES)[keyof typeof EMBEDDING_ERROR_CODES];

export class EmbeddingProviderError extends Error {
  public readonly code: EmbeddingErrorCode;
  public readonly statusCode: number;
  public readonly retryable: boolean;

  constructor(
    code: EmbeddingErrorCode,
    message: string,
    statusCode: number,
    retryable: boolean = false,
  ) {
    super(message);
    this.name = 'EmbeddingProviderError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}
