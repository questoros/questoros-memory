import { createHash } from 'node:crypto';
import {
  MAX_CONTENT_BYTES,
  EMBEDDING_DIMENSIONS,
  parseContract,
  memoryMetadataSchema,
  embeddingVectorSchema,
} from '@questoros-memory/memory-core';

export function normalizeContent(raw: string): string {
  // 1. Convert CRLF to LF
  let normalized = raw.replace(/\r\n/g, '\n');
  // 2. Trim leading and trailing whitespace
  normalized = normalized.trim();
  // 3. Reject empty
  if (normalized.length === 0) {
    throw new Error('Content must not be empty.');
  }
  // 4. Enforce max UTF-8 byte length
  const bytes = Buffer.byteLength(normalized, 'utf-8');
  if (bytes > MAX_CONTENT_BYTES) {
    throw new Error(`Content exceeds maximum size of ${MAX_CONTENT_BYTES} bytes (${bytes} bytes).`);
  }
  return normalized;
}

export function hashContent(normalized: string): string {
  return createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

export function validateMetadata(value: unknown): Record<string, unknown> {
  return parseContract(memoryMetadataSchema, value);
}

export function validateEmbedding(values: number[]): void {
  parseContract(embeddingVectorSchema, values);
  // Keep explicit message path for callers that expect Error rather than ServiceError
  // when embeddingVectorSchema somehow bypasses (should not happen).
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding must have exactly ${EMBEDDING_DIMENSIONS} dimensions, got ${values.length}.`,
    );
  }
}
