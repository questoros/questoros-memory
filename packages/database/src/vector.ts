import { EMBEDDING_DIMENSIONS } from './constants';

/**
 * Validate that a value is a finite numeric array of exactly 1024 elements.
 */
export function validateVector(values: number[]): asserts values is number[] {
  if (!Array.isArray(values)) {
    throw new Error('Embedding must be an array of numbers');
  }
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding must have exactly ${EMBEDDING_DIMENSIONS} dimensions, got ${values.length}`,
    );
  }
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`Embedding value at index ${i} is not a finite number: ${String(v)}`);
    }
  }
}

/**
 * Validate that a value is a finite numeric array of a specific dimension.
 */
export function validateDimension(values: number[], expected: number): asserts values is number[] {
  if (!Array.isArray(values)) {
    throw new Error('Embedding must be an array of numbers');
  }
  if (values.length !== expected) {
    throw new Error(`Embedding must have exactly ${expected} dimensions, got ${values.length}`);
  }
}

/**
 * Serialize a numeric vector to a pgvector-compatible literal.
 *
 * - Rejects wrong dimension, NaN, Infinity, and non-numeric values.
 * - Does not interpolate unchecked SQL identifiers.
 * - Returns only a safe pgvector literal: '[v1,v2,...,vN]'
 */
export function serializeVector(values: number[]): string {
  validateVector(values);
  return `[${values.join(',')}]`;
}

/**
 * Build a cosine-distance SQL comparison for a query vector.
 *
 * @param paramPlaceholder - The parameter placeholder, e.g. $1 or $vectorArg
 * @returns SQL fragment for cosine-distance ordering
 */
export function cosineDistanceSql(paramPlaceholder: string): string {
  return `embedding <=> ${paramPlaceholder}::vector`;
}
