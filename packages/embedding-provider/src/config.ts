import { EmbeddingProviderError, EMBEDDING_ERROR_CODES } from './errors.js';

export const TITAN_V2_MODEL_ID = 'amazon.titan-embed-text-v2:0';
export const TITAN_V2_DIMENSIONS = 1024 as const;
export const TITAN_V2_NORMALIZE = true as const;
export const TITAN_V2_PROVIDER = 'amazon-bedrock' as const;
export const HARD_MAX_INPUT_CHARACTERS = 50_000;
export const DEFAULT_MAX_INPUT_CHARACTERS = 20_000;
export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_BEDROCK_REGION = 'us-west-2';

export interface EmbeddingConfig {
  provider: typeof TITAN_V2_PROVIDER;
  modelId: typeof TITAN_V2_MODEL_ID;
  dimensions: typeof TITAN_V2_DIMENSIONS;
  normalize: typeof TITAN_V2_NORMALIZE;
  bedrockRegion: string;
  autoOnWrite: boolean;
  maxInputCharacters: number;
  timeoutMs: number;
  maxAttempts: number;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const normalized = raw.toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  throw new EmbeddingProviderError(
    EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_NOT_CONFIGURED,
    `Invalid boolean for embedding configuration.`,
    500,
  );
}

function parsePositiveInt(raw: string | undefined, fallback: number, label: string): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new EmbeddingProviderError(
      EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_NOT_CONFIGURED,
      `Invalid ${label} for embedding configuration.`,
      500,
    );
  }
  return value;
}

export function loadEmbeddingConfig(env: NodeJS.ProcessEnv = process.env): EmbeddingConfig {
  const provider = (env.EMBEDDING_PROVIDER ?? TITAN_V2_PROVIDER).trim();
  if (provider !== TITAN_V2_PROVIDER) {
    throw new EmbeddingProviderError(
      EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_NOT_CONFIGURED,
      'Only amazon-bedrock is supported in Phase 4.',
      500,
    );
  }

  const modelId = (env.EMBEDDING_MODEL_ID ?? TITAN_V2_MODEL_ID).trim();
  if (modelId !== TITAN_V2_MODEL_ID) {
    throw new EmbeddingProviderError(
      EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_NOT_CONFIGURED,
      'Only amazon.titan-embed-text-v2:0 is supported in Phase 4.',
      500,
    );
  }

  const dimensions = parsePositiveInt(
    env.EMBEDDING_DIMENSIONS,
    TITAN_V2_DIMENSIONS,
    'EMBEDDING_DIMENSIONS',
  );
  if (dimensions !== TITAN_V2_DIMENSIONS) {
    throw new EmbeddingProviderError(
      EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_NOT_CONFIGURED,
      'Embedding dimensions must be exactly 1024.',
      500,
    );
  }

  const normalize = parseBoolean(env.EMBEDDING_NORMALIZE, TITAN_V2_NORMALIZE);
  if (normalize !== true) {
    throw new EmbeddingProviderError(
      EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_NOT_CONFIGURED,
      'Embedding normalization must be true.',
      500,
    );
  }

  const maxInputCharacters = Math.min(
    parsePositiveInt(
      env.EMBEDDING_MAX_INPUT_CHARACTERS,
      DEFAULT_MAX_INPUT_CHARACTERS,
      'EMBEDDING_MAX_INPUT_CHARACTERS',
    ),
    HARD_MAX_INPUT_CHARACTERS,
  );

  return {
    provider: TITAN_V2_PROVIDER,
    modelId: TITAN_V2_MODEL_ID,
    dimensions: TITAN_V2_DIMENSIONS,
    normalize: TITAN_V2_NORMALIZE,
    bedrockRegion:
      (env.AWS_BEDROCK_REGION ?? DEFAULT_BEDROCK_REGION).trim() || DEFAULT_BEDROCK_REGION,
    autoOnWrite: parseBoolean(env.EMBEDDING_AUTO_ON_WRITE, false),
    maxInputCharacters,
    timeoutMs: parsePositiveInt(
      env.EMBEDDING_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      'EMBEDDING_TIMEOUT_MS',
    ),
    maxAttempts: parsePositiveInt(
      env.EMBEDDING_MAX_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS,
      'EMBEDDING_MAX_ATTEMPTS',
    ),
  };
}

export function readOptionalEnv(name: string): string | undefined {
  return readEnv(name);
}
