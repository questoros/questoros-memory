import { describe, it, expect } from 'vitest';
import { MAX_CONTENT_BYTES } from '@questoros-memory/memory-core';
import {
  hashContent,
  normalizeContent,
  validateEmbedding,
  validateMetadata,
} from '../src/content.js';

describe('normalizeContent', () => {
  it('converts CRLF to LF and trims', () => {
    expect(normalizeContent('  hello\r\nworld  ')).toBe('hello\nworld');
  });

  it('rejects empty content after trim', () => {
    expect(() => normalizeContent('   \r\n  ')).toThrow(/must not be empty/);
  });

  it('rejects content exceeding MAX_CONTENT_BYTES', () => {
    const oversized = 'x'.repeat(MAX_CONTENT_BYTES + 1);
    expect(() => normalizeContent(oversized)).toThrow(/exceeds maximum size/);
  });
});

describe('hashContent', () => {
  it('returns a stable sha256 hex digest', () => {
    expect(hashContent('abc')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashContent('abc')).toBe(hashContent('abc'));
  });
});

describe('validateMetadata and validateEmbedding', () => {
  it('accepts empty metadata object', () => {
    expect(validateMetadata({})).toEqual({});
  });

  it('rejects wrong embedding length via schema', () => {
    expect(() => validateEmbedding([0.1, 0.2])).toThrow();
  });

  it('accepts a full 1024-dimensional embedding', () => {
    expect(() => validateEmbedding(Array.from({ length: 1024 }, () => 0.01))).not.toThrow();
  });
});
