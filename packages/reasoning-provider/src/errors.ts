export const REASONING_ERROR_CODES = {
  REASONING_PROVIDER_NOT_CONFIGURED: 'REASONING_PROVIDER_NOT_CONFIGURED',
  REASONING_OUTPUT_INVALID: 'REASONING_OUTPUT_INVALID',
  REASONING_TOOL_INVALID: 'REASONING_TOOL_INVALID',
  REASONING_LIVE_CALLS_DISABLED: 'REASONING_LIVE_CALLS_DISABLED',
} as const;

export type ReasoningErrorCode = (typeof REASONING_ERROR_CODES)[keyof typeof REASONING_ERROR_CODES];

export class ReasoningProviderError extends Error {
  public readonly code: ReasoningErrorCode;
  public readonly statusCode: number;

  constructor(code: ReasoningErrorCode, message: string, statusCode: number = 400) {
    super(message);
    this.name = 'ReasoningProviderError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
