import type {
  ConflictAnalysisResult,
  ExecutionEvaluationResult,
  PolicyEvaluationResult,
  StructuredExtractionResult,
  ToolSelectionDecision,
} from './schemas.js';

export interface ExistingMemoryContext {
  id: string;
  content: string;
  memoryType: string;
  scopeType?: string;
  sensitivity?: string;
  status?: string;
}

export interface StructuredExtractionRequest {
  sourceText: string;
  sourceLocator?: string;
  relatedMemories?: ExistingMemoryContext[];
  policyConstraints?: string[];
}

export interface ConflictAnalysisRequest {
  candidateContent: string;
  candidateMemoryType: string;
  relatedMemories: ExistingMemoryContext[];
  sourceEvidenceSpan?: string;
}

export interface PolicyEvaluationRequest {
  candidateContent: string;
  ownershipClassification: string;
  scopeRecommendation: string;
  confidence: number;
  disposition: string;
  permissions: readonly string[];
}

export interface ToolSelectionRequest {
  userGoal: string;
  availableTools: string[];
  retrievedContext: Array<{ id: string; content: string; memoryType?: string }>;
  currentIcareState: string;
  priorObservations: Array<{ tool: string; ok: boolean; summary: string }>;
  remainingStepBudget: number;
  policyConstraints: string[];
  workspaceHints?: Record<string, unknown>;
}

export interface ExecutionEvaluationRequest {
  goal: string;
  toolTrail: Array<{ tool: string; ok: boolean; summary: string }>;
  artifacts: string[];
}

/**
 * Provider-neutral structured extraction of organizational intelligence.
 * Output is always a proposal — never a direct database write.
 */
export interface StructuredExtractionProvider {
  readonly providerName: string;
  extract(request: StructuredExtractionRequest): Promise<StructuredExtractionResult>;
}

export interface ConflictAnalysisProvider {
  analyze(request: ConflictAnalysisRequest): Promise<ConflictAnalysisResult>;
}

export interface PolicyEvaluationProvider {
  evaluate(request: PolicyEvaluationRequest): Promise<PolicyEvaluationResult>;
}

export interface ToolSelectionProvider {
  selectNextTool(request: ToolSelectionRequest): Promise<ToolSelectionDecision>;
}

export interface ExecutionEvaluationProvider {
  evaluateExecution(request: ExecutionEvaluationRequest): Promise<ExecutionEvaluationResult>;
}

/**
 * Composite reasoning surface used by Harvester and Continuity Agent.
 */
export interface ReasoningProvider
  extends
    StructuredExtractionProvider,
    ConflictAnalysisProvider,
    PolicyEvaluationProvider,
    ToolSelectionProvider,
    ExecutionEvaluationProvider {
  readonly modelId: string;
}
