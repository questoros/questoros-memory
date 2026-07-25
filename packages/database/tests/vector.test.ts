import { describe, it, expect } from 'vitest';
import {
  validateVector,
  validateDimension,
  serializeVector,
  cosineDistanceSql,
} from '../src/vector';

describe('validateVector', () => {
  it('accepts a valid 1024-dimensional finite vector', () => {
    const vec = new Array(1024).fill(0.5);
    expect(() => validateVector(vec)).not.toThrow();
  });

  it('rejects non-array input', () => {
    expect(() => validateVector('not-an-array' as never)).toThrow(/must be an array/);
  });

  it('rejects 1023 dimensions', () => {
    const vec = new Array(1023).fill(0.5);
    expect(() => validateVector(vec)).toThrow('exactly 1024');
  });

  it('rejects 1025 dimensions', () => {
    const vec = new Array(1025).fill(0.5);
    expect(() => validateVector(vec)).toThrow('exactly 1024');
  });

  it('rejects NaN', () => {
    const vec = new Array(1024).fill(0.5);
    vec[0] = NaN;
    expect(() => validateVector(vec)).toThrow('not a finite number');
  });

  it('rejects Infinity', () => {
    const vec = new Array(1024).fill(0.5);
    vec[0] = Infinity;
    expect(() => validateVector(vec)).toThrow('not a finite number');
  });

  it('rejects -Infinity', () => {
    const vec = new Array(1024).fill(0.5);
    vec[0] = -Infinity;
    expect(() => validateVector(vec)).toThrow('not a finite number');
  });
});

describe('validateDimension', () => {
  it('accepts matching length arrays', () => {
    expect(() => validateDimension([1, 2, 3], 3)).not.toThrow();
  });

  it('rejects non-array input', () => {
    expect(() => validateDimension(null as never, 3)).toThrow(/must be an array/);
  });

  it('rejects wrong length', () => {
    expect(() => validateDimension([1, 2], 3)).toThrow(/exactly 3 dimensions/);
  });
});

describe('serializeVector', () => {
  it('returns a pgvector literal starting with [ and ending with ]', () => {
    const vec = new Array(1024).fill(0.5);
    const literal = serializeVector(vec);
    expect(literal.startsWith('[')).toBe(true);
    expect(literal.endsWith(']')).toBe(true);
  });

  it('does not introduce SQL statement delimiters', () => {
    const vec = new Array(1024).fill(0.5);
    const literal = serializeVector(vec);
    expect(literal).not.toContain(';');
    expect(literal).not.toContain('--');
    expect(literal).not.toContain("'");
  });
});

describe('cosineDistanceSql', () => {
  it('returns a SQL fragment with <=> operator', () => {
    const sql = cosineDistanceSql('$1');
    expect(sql).toContain('<=>');
    expect(sql).toContain('$1::vector');
  });
});
