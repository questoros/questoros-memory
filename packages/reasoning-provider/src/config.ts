import { ReasoningProviderError, REASONING_ERROR_CODES } from './errors.js';

export const REASONING_PROVIDERS = ['mock', 'amazon-bedrock'] as const;
export type ReasoningProviderName = (typeof REASONING_PROVIDERS)[number];

export const DEFAULT_REASONING_PROVIDER: ReasoningProviderName = 'mock';
export const DEFAULT_REASONING_MODEL_ID = 'mock-structured-v1';
export const DEFAULT_REASONING_REGION = 'us-west-2';

export interface ReasoningConfig {
  provider: ReasoningProviderName;
  modelId: string;
  region: string;
  /** Live model calls stay gated until separately approved. */
  allowLiveCalls: boolean;
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

  return {
    provider: providerRaw as ReasoningProviderName,
    modelId: readEnv(env, 'REASONING_MODEL_ID') ?? DEFAULT_REASONING_MODEL_ID,
    region: readEnv(env, 'REASONING_REGION') ?? DEFAULT_REASONING_REGION,
    allowLiveCalls: parseBoolean(readEnv(env, 'REASONING_ALLOW_LIVE_CALLS'), false),
  };
}
