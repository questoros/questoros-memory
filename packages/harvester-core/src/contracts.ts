import type { MemoryType, IcareLifecycleStage, ScopeType } from '@questoros-memory/memory-core';
import type {
  CandidateDisposition,
  OwnershipClassification,
  AnalysisClassification,
  ReasoningProvider,
} from '@questoros-memory/reasoning-provider';

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
  scopeType?: ScopeType;
  sensitivity?: string;
  status?: string;
}

export type AnalysisStatus = 'DUPLICATE' | 'NEAR_DUPLICATE' | 'CONFLICT' | 'PENDING';

export interface AnalyzedCandidate extends ExtractedCandidate {
  status: AnalysisStatus;
  relatedMemoryIds: string[];
}

export interface Extractor {
  extract(text: string): ExtractedCandidate[];
}

/**
 * Governed candidate proposal produced by the agentic Harvester.
 * Never written to authoritative memory until approval.
 */
export interface GovernedCandidateProposal {
  content: string;
  memoryType: MemoryType;
  icareStage: IcareLifecycleStage;
  confidence: number;
  importance: number;
  ownershipClassification: OwnershipClassification;
  scopeRecommendation: ScopeType;
  sourceEvidenceSpan: string;
  sourceLocator: string;
  reasonForDurability: string;
  relatedEntityOrProject: string;
  recommendedDisposition: CandidateDisposition;
  analysisClassification: AnalysisClassification;
  relatedMemoryIds: string[];
  requiresApproval: boolean;
  policyAllowed: boolean;
  metadata: Record<string, unknown>;
}

export interface AgenticHarvestInput {
  sourceText: string;
  sourceLocator?: string;
  relatedMemories: ExistingMemoryRef[];
  permissions: readonly string[];
  /** When true, use DeterministicExtractor fallback instead of reasoning provider. */
  useDeterministicFallback?: boolean;
}

export interface AgenticHarvestResult {
  candidates: GovernedCandidateProposal[];
  extractorMode: 'model' | 'deterministic-fallback';
  providerName: string;
  modelId: string;
  rationale: string;
}

export interface AgenticHarvester {
  harvest(input: AgenticHarvestInput): Promise<AgenticHarvestResult>;
}

export type { ReasoningProvider };
