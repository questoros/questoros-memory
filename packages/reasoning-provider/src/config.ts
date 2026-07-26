import { ReasoningProviderError, REASONING_ERROR_CODES } from './errors.js';

export const REASONING_PROVIDERS = ['mock', 'amazon-bedrock'] as const;
export type ReasoningProviderName = (typeof REASONING_PROVIDERS)[number];

export const DEFAULT_REASONING_PROVIDER: ReasoningProviderName = 'mock';
export const DEFAULT_REASONING_MODEL_ID = 'mock-structured-v1';
export const DEFAULT_BEDROCK_REASONING_MODEL_ID = 'amazon.nova-micro-v1:0';
export const DEFAULT_REASONING_REGION = 'us-west-2';
export const DEFAULT_REASONING_MAX_INPUT_CHARACTERS = 24_000;
export const DEFAULT_REASONING_MAX_OUTPUT_TOKENS = 2_048;
export const DEFAULT_REASONING_TIMEOUT_MS = 15_000;

export interface ReasoningConfig {
  provider: ReasoningProviderName;
  modelId: string;
  region: string;
  /** Live model calls stay gated until separately approved. */
  allowLiveCalls: boolean;
  /** Total serialized request limit before any provider call. */
  maxInputCharacters: number;
  /** Maximum generated tokens for one reasoning operation. */
  maxOutputTokens: number;
  /** Hard application timeout for one reasoning operation. */
  timeoutMs: number;
}

function readEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const normalized = raw.toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  throw new ReasoningProviderError(
    REASONING_ERROR_CODES.REASONING_PROVIDER_NOT_CONFIGURED,
    'Invalid boolean for reasoning configuration.',
    500,
  );
}

function parseInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ReasoningProviderError(
      REASONING_ERROR_CODES.REASONING_PROVIDER_NOT_CONFIGURED,
      'Invalid numeric reasoning configuration.',
      500,
    );
  }
  return value;
}

export function loadReasoningConfig(env: NodeJS.ProcessEnv = process.env): ReasoningConfig {
  const providerRaw = (
    readEnv(env, 'REASONING_PROVIDER') ?? DEFAULT_REASONING_PROVIDER
  ).toLowerCase();
  if (!(REASONING_PROVIDERS as readonly string[]).includes(providerRaw)) {
    throw new ReasoningProviderError(
      REASONING_ERROR_CODES.REASONING_PROVIDER_NOT_CONFIGURED,
      `Unsupported REASONING_PROVIDER: ${providerRaw}`,
      500,
    );
  }

  const provider = providerRaw as ReasoningProviderName;
  const defaultModelId =
    provider === 'amazon-bedrock' ? DEFAULT_BEDROCK_REASONING_MODEL_ID : DEFAULT_REASONING_MODEL_ID;

  return {
    provider,
    modelId: readEnv(env, 'REASONING_MODEL_ID') ?? defaultModelId,
    region: readEnv(env, 'REASONING_REGION') ?? DEFAULT_REASONING_REGION,
    allowLiveCalls: parseBoolean(readEnv(env, 'REASONING_ALLOW_LIVE_CALLS'), false),
    maxInputCharacters: parseInteger(
      readEnv(env, 'REASONING_MAX_INPUT_CHARACTERS'),
      DEFAULT_REASONING_MAX_INPUT_CHARACTERS,
      1_000,
      100_000,
    ),
    maxOutputTokens: parseInteger(
      readEnv(env, 'REASONING_MAX_OUTPUT_TOKENS'),
      DEFAULT_REASONING_MAX_OUTPUT_TOKENS,
      128,
      5_000,
    ),
    timeoutMs: parseInteger(
      readEnv(env, 'REASONING_TIMEOUT_MS'),
      DEFAULT_REASONING_TIMEOUT_MS,
      1_000,
      29_000,
    ),
  };
}
