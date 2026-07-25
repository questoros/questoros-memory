import type { EmbeddingRequest } from './contracts.js';
import {
  HARD_MAX_INPUT_CHARACTERS,
  TITAN_V2_DIMENSIONS,
  TITAN_V2_MODEL_ID,
  TITAN_V2_NORMALIZE,
} from './config.js';
import { EmbeddingProviderError, EMBEDDING_ERROR_CODES } from './errors.js';

export interface TitanInvokeBody {
  inputText: string;
  dimensions: 1024;
  normalize: true;
  embeddingTypes: ['float'];
}

export function validateEmbeddingRequest(
  request: EmbeddingRequest,
  maxInputCharacters: number,
): string {
  if (request.modelId !== TITAN_V2_MODEL_ID) {
    throw new EmbeddingProviderError(
      EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_NOT_CONFIGURED,
      'Unsupported embedding model.',
      400,
    );
  }
  if (request.dimensions !== TITAN_V2_DIMENSIONS) {
    throw new EmbeddingProviderError(
      EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_NOT_CONFIGURED,
      'Embedding dimensions must be exactly 1024.',
      400,
    );
  }
  if (request.normalize !== TITAN_V2_NORMALIZE) {
    throw new EmbeddingProviderError(
      EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_NOT_CONFIGURED,
      'Embedding normalization must be true.',
      400,
    );
  }

  const inputText = request.inputText ?? '';
  if (typeof inputText !== 'string' || inputText.trim().length === 0) {
    throw new EmbeddingProviderError(
      EMBEDDING_ERROR_CODES.EMBEDDING_INPUT_EMPTY,
      'Embedding input text must not be empty.',
      400,
    );
  }

  const limit = Math.min(maxInputCharacters, HARD_MAX_INPUT_CHARACTERS);
  if (inputText.length > limit) {
    throw new EmbeddingProviderError(
      EMBEDDING_ERROR_CODES.EMBEDDING_INPUT_TOO_LARGE,
      'Embedding input text exceeds the configured maximum length.',
      400,
    );
  }

  return inputText;
}

export function buildTitanInvokeBody(inputText: string): TitanInvokeBody {
  return {
    inputText,
    dimensions: TITAN_V2_DIMENSIONS,
    normalize: TITAN_V2_NORMALIZE,
    embeddingTypes: ['float'],
  };
}

export function extractEmbeddingVector(payload: unknown): {
  embedding: number[];
  inputTokenCount: number | null;
} {
  if (!payload || typeof payload !== 'object') {
    throw new EmbeddingProviderError(
      EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_RESPONSE_INVALID,
      'Embedding provider returned an invalid response.',
      502,
    );
  }

  const record = payload as Record<string, unknown>;
  let embedding: unknown = record.embedding;

  if (
    (!Array.isArray(embedding) || embedding.length === 0) &&
    record.embeddingsByType &&
    typeof record.embeddingsByType === 'object'
  ) {
    const byType = record.embeddingsByType as Record<string, unknown>;
    embedding = byType.float;
  }

  if (!Array.isArray(embedding)) {
    throw new EmbeddingProviderError(
      EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_RESPONSE_INVALID,
      'Embedding provider response did not include a float vector.',
      502,
    );
  }

  if (embedding.length !== TITAN_V2_DIMENSIONS) {
    throw new EmbeddingProviderError(
      EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_RESPONSE_INVALID,
      'Embedding provider returned an unexpected vector length.',
      502,
    );
  }

  const numbers: number[] = [];
  for (const value of embedding) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new EmbeddingProviderError(
        EMBEDDING_ERROR_CODES.EMBEDDING_PROVIDER_RESPONSE_INVALID,
        'Embedding provider returned a non-finite vector value.',
        502,
      );
    }
    numbers.push(value);
  }

  const tokenRaw = record.inputTextTokenCount ?? record.inputTokenCount;
  const inputTokenCount =
    typeof tokenRaw === 'number' && Number.isFinite(tokenRaw) ? Math.trunc(tokenRaw) : null;

  return { embedding: numbers, inputTokenCount };
}
