import type { MemoryType } from '@questoros-memory/memory-core';
import type { ExtractedCandidate, Extractor } from './contracts.js';

const PREFIX_RULES: Array<{
  pattern: RegExp;
  memoryType: MemoryType;
  confidence: number;
  label: string;
}> = [
  { pattern: /^Goal:\s*(.+)$/i, memoryType: 'GOAL', confidence: 0.95, label: 'Goal' },
  { pattern: /^Budget:\s*(.+)$/i, memoryType: 'FACT', confidence: 0.9, label: 'Budget' },
  {
    pattern: /^Launch date:\s*(.+)$/i,
    memoryType: 'FACT',
    confidence: 0.95,
    label: 'Launch date',
  },
  {
    pattern: /^Constraint:\s*(.+)$/i,
    memoryType: 'CONSTRAINT',
    confidence: 0.95,
    label: 'Constraint',
  },
  { pattern: /^Task:\s*(.+)$/i, memoryType: 'TASK', confidence: 0.9, label: 'Task' },
];

const MONTH_DAY_PATTERN =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\b/gi;

function normalizeLine(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

function extractPrefixedCandidate(line: string): ExtractedCandidate | null {
  for (const rule of PREFIX_RULES) {
    const match = line.match(rule.pattern);
    if (!match?.[1]) {
      continue;
    }
    const value = match[1].trim();
    if (!value) {
      continue;
    }
    return {
      content: `${rule.label}: ${value}`,
      memoryType: rule.memoryType,
      confidence: rule.confidence,
      metadata: { extraction: 'prefix', rawLine: line },
    };
  }
  return null;
}

function extractDateFacts(line: string, seen: Set<string>): ExtractedCandidate[] {
  if (/^Launch date:/i.test(line)) {
    return [];
  }

  const results: ExtractedCandidate[] = [];
  MONTH_DAY_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MONTH_DAY_PATTERN.exec(line)) !== null) {
    const dateText = `${match[1]} ${match[2]}`;
    const content = `Launch date: ${dateText}`;
    const key = content.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push({
      content,
      memoryType: 'FACT',
      confidence: 0.75,
      metadata: { extraction: 'date-pattern', dateText, rawLine: line },
    });
  }
  return results;
}

/**
 * Rule-based extractor for hackathon fixtures.
 * Detects Goal:/Budget:/Launch date:/Constraint:/Task: lines and month-day date facts.
 */
export class DeterministicExtractor implements Extractor {
  extract(text: string): ExtractedCandidate[] {
    const lines = text.split(/\r?\n/).map(normalizeLine).filter(Boolean);
    const candidates: ExtractedCandidate[] = [];
    const seen = new Set<string>();

    for (const line of lines) {
      const prefixed = extractPrefixedCandidate(line);
      if (prefixed) {
        const key = prefixed.content.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push(prefixed);
        }
        continue;
      }

      for (const dateFact of extractDateFacts(line, seen)) {
        candidates.push(dateFact);
      }
    }

    return candidates;
  }
}
