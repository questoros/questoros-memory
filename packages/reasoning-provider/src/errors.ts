export const REASONING_ERROR_CODES = {
  REASONING_PROVIDER_NOT_CONFIGURED: 'REASONING_PROVIDER_NOT_CONFIGURED',
  REASONING_OUTPUT_INVALID: 'REASONING_OUTPUT_INVALID',
  REASONING_TOOL_INVALID: 'REASONING_TOOL_INVALID',
  REASONING_LIVE_CALLS_DISABLED: 'REASONING_LIVE_CALLS_DISABLED',
  REASONING_INPUT_TOO_LARGE: 'REASONING_INPUT_TOO_LARGE',
  REASONING_PROVIDER_ACCESS_DENIED: 'REASONING_PROVIDER_ACCESS_DENIED',
  REASONING_PROVIDER_THROTTLED: 'REASONING_PROVIDER_THROTTLED',
  REASONING_PROVIDER_TIMEOUT: 'REASONING_PROVIDER_TIMEOUT',
  REASONING_PROVIDER_UNAVAILABLE: 'REASONING_PROVIDER_UNAVAILABLE',
  REASONING_PROVIDER_RESPONSE_INVALID: 'REASONING_PROVIDER_RESPONSE_INVALID',
} as const;

export type ReasoningErrorCode = (typeof REASONING_ERROR_CODES)[keyof typeof REASONING_ERROR_CODES];

export class ReasoningProviderError extends Error {
  public readonly code: ReasoningErrorCode;
  public readonly statusCode: number;
  public readonly retryable: boolean;

  constructor(
    code: ReasoningErrorCode,
    message: string,
    statusCode: number = 400,
    retryable: boolean = false,
  ) {
    super(message);
    this.name = 'ReasoningProviderError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}
