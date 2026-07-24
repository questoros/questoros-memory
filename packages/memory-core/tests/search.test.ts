import { describe, it, expect } from 'vitest';
import {
  computeKeywordScore,
  clampVectorSimilarity,
  computeRecency,
  computeFinalScore,
  buildReasons,
  VECTOR_WEIGHTS,
  NO_VECTOR_WEIGHTS,
} from '../src/search.js';

describe('computeKeywordScore', () => {
  it('returns 1.0 for exact match', () => {
    expect(computeKeywordScore('hello world', 'hello world')).toBe(1.0);
  });

  it('normalizes whitespace before matching', () => {
    expect(computeKeywordScore('hello   world', 'hello world')).toBe(1.0);
  });

  it('is case insensitive', () => {
    expect(computeKeywordScore('Hello World', 'hello world')).toBe(1.0);
  });

  it('returns 0.65 when all query tokens match', () => {
    expect(computeKeywordScore('hello world foo', 'hello world')).toBe(0.65);
  });

  it('returns 0.35 when some tokens match', () => {
    expect(computeKeywordScore('hello foo bar', 'hello world')).toBe(0.35);
  });

  it('returns 0.0 when no tokens match', () => {
    expect(computeKeywordScore('foo bar', 'hello world')).toBe(0.0);
  });
});

describe('clampVectorSimilarity', () => {
  it('converts cosine distance to similarity', () => {
    expect(clampVectorSimilarity(0)).toBe(1);
    expect(clampVectorSimilarity(1)).toBe(0);
  });

  it('clamps to [0, 1]', () => {
    expect(clampVectorSimilarity(-0.5)).toBe(1);
    expect(clampVectorSimilarity(1.5)).toBe(0);
  });

  it('handles values in range', () => {
    expect(clampVectorSimilarity(0.25)).toBe(0.75);
    expect(clampVectorSimilarity(0.7)).toBeCloseTo(0.3, 10);
  });
});

describe('computeRecency', () => {
  it('returns 1.0 for future dates', () => {
    const now = new Date('2025-01-15');
    const future = new Date('2025-01-20');
    expect(computeRecency(future, now)).toBe(1.0);
  });

  it('returns exactly 0.5 after one half-life', () => {
    const now = new Date('2025-01-15T00:00:00Z');
    const past = new Date('2025-01-08T00:00:00Z');
    const halfLife = 7 * 24 * 60 * 60 * 1000;
    const score = computeRecency(past, now, halfLife);
    expect(score).toBeCloseTo(0.5, 2);
  });

  it('decays towards 0 with age', () => {
    const now = new Date('2025-01-15');
    const recent = new Date('2025-01-14');
    const old = new Date('2025-01-01');
    const recentScore = computeRecency(recent, now);
    const oldScore = computeRecency(old, now);
    expect(recentScore).toBeGreaterThan(oldScore);
  });
});

describe('computeFinalScore', () => {
  it('uses VECTOR_WEIGHTS when hasVector is true', () => {
    const score = computeFinalScore(
      {
        vectorSimilarity: 1,
        keywordScore: 0,
        importance: 0,
        confidence: 0,
        recency: 0,
      },
      true,
    );
    expect(score).toBe(VECTOR_WEIGHTS.vectorSimilarity);
  });

  it('uses NO_VECTOR_WEIGHTS when hasVector is false', () => {
    const score = computeFinalScore(
      {
        keywordScore: 1,
        importance: 0,
        confidence: 0,
        recency: 0,
      },
      false,
    );
    expect(score).toBe(NO_VECTOR_WEIGHTS.keywordScore);
  });

  it('rounds to 2 decimal places', () => {
    const score = computeFinalScore(
      {
        vectorSimilarity: 0.777,
        keywordScore: 0.444,
        importance: 0.333,
        confidence: 0.222,
        recency: 0.111,
      },
      true,
    );
    const decimalPlaces = score.toString().split('.')[1]?.length ?? 0;
    expect(decimalPlaces).toBeLessThanOrEqual(2);
  });
});

describe('buildReasons', () => {
  const scopeInfo = { scopeType: 'WORKSPACE', scopeId: 'ws-1' };

  it('includes scope match reason', () => {
    const reasons = buildReasons(
      {
        keywordScore: 0,
        importance: 0,
        confidence: 0,
        recency: 0,
      },
      scopeInfo,
    );
    expect(reasons).toContain('workspace scope match');
  });

  it('includes semantic similarity when vectorSimilarity > 0.5', () => {
    const reasons = buildReasons(
      {
        vectorSimilarity: 0.8,
        keywordScore: 0,
        importance: 0,
        confidence: 0,
        recency: 0,
      },
      scopeInfo,
    );
    expect(reasons).toContain('semantic similarity');
  });

  it('does not include semantic similarity when vectorSimilarity <= 0.5', () => {
    const reasons = buildReasons(
      {
        vectorSimilarity: 0.3,
        keywordScore: 0,
        importance: 0,
        confidence: 0,
        recency: 0,
      },
      scopeInfo,
    );
    expect(reasons).not.toContain('semantic similarity');
  });

  it('includes exact phrase match for keywordScore >= 1.0', () => {
    const reasons = buildReasons(
      {
        keywordScore: 1.0,
        importance: 0,
        confidence: 0,
        recency: 0,
      },
      scopeInfo,
    );
    expect(reasons).toContain('exact phrase match');
  });

  it('includes all query tokens matched for keywordScore >= 0.65', () => {
    const reasons = buildReasons(
      {
        keywordScore: 0.65,
        importance: 0,
        confidence: 0,
        recency: 0,
      },
      scopeInfo,
    );
    expect(reasons).toContain('all query tokens matched');
  });

  it('includes partial token match for keywordScore > 0 but < 0.65', () => {
    const reasons = buildReasons(
      {
        keywordScore: 0.35,
        importance: 0,
        confidence: 0,
        recency: 0,
      },
      scopeInfo,
    );
    expect(reasons).toContain('partial token match');
  });
});
