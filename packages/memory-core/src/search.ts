export const VECTOR_WEIGHTS = {
  vectorSimilarity: 0.55,
  keywordScore: 0.15,
  importance: 0.15,
  confidence: 0.1,
  recency: 0.05,
} as const;

export const NO_VECTOR_WEIGHTS = {
  keywordScore: 0.35,
  importance: 0.25,
  confidence: 0.2,
  recency: 0.2,
} as const;

export interface SearchComponents {
  vectorSimilarity?: number;
  keywordScore: number;
  importance: number;
  confidence: number;
  recency: number;
}

export interface SearchExplanation {
  matchedScope: {
    scopeType: string;
    scopeId: string;
  };
  components: SearchComponents;
  weights: Record<string, number>;
  finalScore: number;
  reasons: string[];
}

export function computeKeywordScore(content: string, query: string): number {
  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
  const normalizedContent = normalize(content);
  const normalizedQuery = normalize(query);

  if (normalizedContent === normalizedQuery) return 1.0;

  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const contentTokens = new Set(normalizedContent.split(/\s+/).filter(Boolean));

  const matchedTokens = queryTokens.filter((t) => contentTokens.has(t));

  if (matchedTokens.length === 0) return 0.0;
  if (matchedTokens.length === queryTokens.length) return 0.65;

  return 0.35;
}

export function clampVectorSimilarity(cosineDistance: number): number {
  const similarity = 1 - cosineDistance;
  return Math.max(0, Math.min(1, similarity));
}

export function computeRecency(
  updatedAt: Date,
  now: Date,
  halfLifeMs: number = 7 * 24 * 60 * 60 * 1000,
): number {
  const ageMs = now.getTime() - updatedAt.getTime();
  if (ageMs <= 0) return 1.0;
  return Math.exp((-Math.LN2 * ageMs) / halfLifeMs);
}

export function computeFinalScore(components: SearchComponents, hasVector: boolean): number {
  let score = 0;

  if (hasVector) {
    const w = VECTOR_WEIGHTS;
    if (components.vectorSimilarity !== undefined) {
      score += w.vectorSimilarity * components.vectorSimilarity;
    }
    score += w.keywordScore * components.keywordScore;
    score += w.importance * components.importance;
    score += w.confidence * components.confidence;
    score += w.recency * components.recency;
  } else {
    const w = NO_VECTOR_WEIGHTS;
    score += w.keywordScore * components.keywordScore;
    score += w.importance * components.importance;
    score += w.confidence * components.confidence;
    score += w.recency * components.recency;
  }

  return Math.round(score * 100) / 100;
}

export function buildReasons(
  components: SearchComponents,
  scopeInfo: { scopeType: string; scopeId: string },
): string[] {
  const reasons: string[] = [];

  reasons.push(`${scopeInfo.scopeType.toLowerCase()} scope match`);

  if (components.vectorSimilarity !== undefined && components.vectorSimilarity > 0.5) {
    reasons.push('semantic similarity');
  }

  if (components.keywordScore >= 1.0) {
    reasons.push('exact phrase match');
  } else if (components.keywordScore >= 0.65) {
    reasons.push('all query tokens matched');
  } else if (components.keywordScore > 0) {
    reasons.push('partial token match');
  }

  return reasons;
}
