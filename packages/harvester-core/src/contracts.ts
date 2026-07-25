import type { MemoryType } from '@questoros-memory/memory-core';

export interface ExtractedCandidate {
  content: string;
  memoryType: MemoryType;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface ExistingMemoryRef {
  id: string;
  content: string;
  memoryType: MemoryType;
}

export type AnalysisStatus = 'DUPLICATE' | 'NEAR_DUPLICATE' | 'CONFLICT' | 'PENDING';

export interface AnalyzedCandidate extends ExtractedCandidate {
  status: AnalysisStatus;
  relatedMemoryIds: string[];
}

export interface Extractor {
  extract(text: string): ExtractedCandidate[];
}
