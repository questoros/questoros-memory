import type {
  AnalyzedCandidate,
  AnalysisStatus,
  ExistingMemoryRef,
  ExtractedCandidate,
} from './contracts.js';

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'to',
  'for',
  'in',
  'on',
  'at',
  'is',
  'are',
  'be',
  'by',
  'with',
]);

const DATE_PATTERN =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\b/i;

function normalizeContent(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, ' ');
}

function tokenize(content: string): Set<string> {
  const tokens = normalizeContent(content)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 1;
  }
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function extractDate(content: string): string | null {
  const match = content.match(DATE_PATTERN);
  if (!match) {
    return null;
  }
  return `${match[1]} ${match[2]}`.toLowerCase();
}

function isLaunchDateTopic(content: string): boolean {
  const normalized = normalizeContent(content);
  return (
    normalized.includes('launch date') ||
    normalized.includes('launch') ||
    DATE_PATTERN.test(content)
  );
}

function classifyAgainst(
  candidate: ExtractedCandidate,
  existing: ExistingMemoryRef[],
): { status: AnalysisStatus; relatedMemoryIds: string[] } {
  const candidateNorm = normalizeContent(candidate.content);
  const candidateTokens = tokenize(candidate.content);
  const candidateDate = extractDate(candidate.content);
  const related = new Set<string>();

  let status: AnalysisStatus = 'PENDING';

  for (const memory of existing) {
    const memoryNorm = normalizeContent(memory.content);
    const memoryTokens = tokenize(memory.content);
    const overlap = jaccard(candidateTokens, memoryTokens);

    if (candidateNorm === memoryNorm) {
      related.add(memory.id);
      status = 'DUPLICATE';
      continue;
    }

    const candidateIsLaunch = isLaunchDateTopic(candidate.content);
    const memoryIsLaunch = isLaunchDateTopic(memory.content);
    const memoryDate = extractDate(memory.content);

    if (
      candidateIsLaunch &&
      memoryIsLaunch &&
      candidateDate &&
      memoryDate &&
      candidateDate !== memoryDate
    ) {
      related.add(memory.id);
      status = 'CONFLICT';
      continue;
    }

    if (status === 'DUPLICATE' || status === 'CONFLICT') {
      continue;
    }

    if (overlap >= 0.85 || (overlap >= 0.6 && candidate.memoryType === memory.memoryType)) {
      related.add(memory.id);
      status = 'NEAR_DUPLICATE';
    }
  }

  return { status, relatedMemoryIds: [...related] };
}

/**
 * Annotate extracted candidates against existing authoritative memories.
 * Never mutates memory; only classifies candidates for review.
 */
export function analyzeAgainstMemories(
  candidates: ExtractedCandidate[],
  existing: ExistingMemoryRef[],
): AnalyzedCandidate[] {
  return candidates.map((candidate) => {
    const { status, relatedMemoryIds } = classifyAgainst(candidate, existing);
    return {
      ...candidate,
      status,
      relatedMemoryIds,
    };
  });
}
