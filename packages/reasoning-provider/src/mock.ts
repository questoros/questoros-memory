import type {
  ConflictAnalysisProvider,
  ConflictAnalysisRequest,
  ExecutionEvaluationProvider,
  ExecutionEvaluationRequest,
  ExistingMemoryContext,
  PolicyEvaluationProvider,
  PolicyEvaluationRequest,
  ReasoningProvider,
  StructuredExtractionProvider,
  StructuredExtractionRequest,
  ToolSelectionProvider,
  ToolSelectionRequest,
} from './contracts.js';
import type { ReasoningConfig } from './config.js';
import { DEFAULT_REASONING_MODEL_ID } from './config.js';
import { ReasoningProviderError, REASONING_ERROR_CODES } from './errors.js';
import {
  conflictAnalysisResultSchema,
  executionEvaluationResultSchema,
  policyEvaluationResultSchema,
  structuredExtractionResultSchema,
  toolSelectionDecisionSchema,
  type ProposedCandidate,
  type StructuredExtractionResult,
  type ToolSelectionDecision,
} from './schemas.js';

const DATE_PATTERN_GLOBAL =
  /\b((January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?|\d{4}-\d{2}-\d{2})\b/gi;

const DATE_PATTERN =
  /\b((January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?|\d{4}-\d{2}-\d{2})\b/i;

function firstDate(text: string): string | null {
  const match = text.match(DATE_PATTERN);
  return match?.[1] ?? null;
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function stripInstructionInjection(text: string): string {
  // Treat prompt-injection content as source data, never as instructions.
  return text
    .replace(
      /(?:^|\n)\s*(?:system|assistant)\s*:[^\n]*/gi,
      '\n[quoted adversarial source text omitted]',
    )
    .replace(/\bignore previous\b/gi, 'ignore-previous (quoted)')
    .replace(/\boverride policy\b/gi, 'override-policy (quoted)')
    .replace(/\bdelete all memories\b/gi, 'delete-all-memories (quoted)');
}

function evidenceSpan(source: string, needle: string): string {
  const idx = source.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return source.slice(0, 240);
  const start = Math.max(0, idx - 40);
  const end = Math.min(source.length, idx + needle.length + 80);
  return source.slice(start, end).trim();
}

function pushUnique(candidates: ProposedCandidate[], next: ProposedCandidate): void {
  const key = normalize(next.content);
  if (candidates.some((c) => normalize(c.content) === key)) return;
  candidates.push(next);
}

function extractFromProse(
  sourceText: string,
  sourceLocator: string,
  related: ExistingMemoryContext[],
): ProposedCandidate[] {
  const text = stripInstructionInjection(sourceText);
  const candidates: ProposedCandidate[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const goalMatch = line.match(/^(?:goal|objective|project goal)\s*[:-]\s*(.+)$/i);
    if (goalMatch?.[1]) {
      pushUnique(candidates, {
        content: `Goal: ${goalMatch[1].trim()}`,
        memoryType: 'GOAL',
        icareStage: 'ISSUE',
        confidence: 0.92,
        importance: 0.9,
        ownershipClassification: 'PROJECT',
        scopeRecommendation: 'PROJECT',
        sourceEvidenceSpan: evidenceSpan(text, goalMatch[1]),
        sourceLocator,
        reasonForDurability: 'Project goal guides downstream agent decisions.',
        relatedEntityOrProject: 'active-project',
        recommendedDisposition: 'CREATE',
        relatedMemoryIds: [],
      });
    }

    const budgetMatch = line.match(/^(?:budget|capex|opex)\s*[:-]\s*(.+)$/i);
    if (budgetMatch?.[1]) {
      pushUnique(candidates, {
        content: `Budget: ${budgetMatch[1].trim()}`,
        memoryType: 'FACT',
        icareStage: 'CONTEXT',
        confidence: 0.9,
        importance: 0.75,
        ownershipClassification: 'PROJECT',
        scopeRecommendation: 'PROJECT',
        sourceEvidenceSpan: evidenceSpan(text, budgetMatch[1]),
        sourceLocator,
        reasonForDurability: 'Budget constraints affect execution options.',
        relatedEntityOrProject: 'active-project',
        recommendedDisposition: 'CREATE',
        relatedMemoryIds: [],
      });
    }

    const constraintMatch = line.match(/^(?:constraint|restriction|policy)\s*[:-]\s*(.+)$/i);
    if (constraintMatch?.[1]) {
      pushUnique(candidates, {
        content: `Constraint: ${constraintMatch[1].trim()}`,
        memoryType: 'CONSTRAINT',
        icareStage: 'CONTEXT',
        confidence: 0.93,
        importance: 0.85,
        ownershipClassification: 'ORGANIZATION',
        scopeRecommendation: 'WORKSPACE',
        sourceEvidenceSpan: evidenceSpan(text, constraintMatch[1]),
        sourceLocator,
        reasonForDurability: 'Operating constraints must survive across sessions.',
        relatedEntityOrProject: 'active-project',
        recommendedDisposition: 'CREATE',
        relatedMemoryIds: [],
      });
    }

    const taskMatch = line.match(/^(?:task|next action|action item)\s*[:-]\s*(.+)$/i);
    if (taskMatch?.[1]) {
      pushUnique(candidates, {
        content: `Task: ${taskMatch[1].trim()}`,
        memoryType: 'TASK',
        icareStage: 'RECOMMENDATIONS',
        confidence: 0.88,
        importance: 0.7,
        ownershipClassification: 'PROJECT',
        scopeRecommendation: 'PROJECT',
        sourceEvidenceSpan: evidenceSpan(text, taskMatch[1]),
        sourceLocator,
        reasonForDurability: 'Actionable task for Continuity Agent execution.',
        relatedEntityOrProject: 'active-project',
        recommendedDisposition: 'CREATE',
        relatedMemoryIds: [],
      });
    }

    const launchMatch = line.match(
      /^(?:launch date|closing date|deadline|due date)\s*[:-]\s*(.+)$/i,
    );
    if (launchMatch?.[1]) {
      pushUnique(candidates, {
        content: `Launch date: ${launchMatch[1].trim()}`,
        memoryType: 'FACT',
        icareStage: 'CONTEXT',
        confidence: 0.95,
        importance: 0.95,
        ownershipClassification: 'PROJECT',
        scopeRecommendation: 'PROJECT',
        sourceEvidenceSpan: evidenceSpan(text, launchMatch[1]),
        sourceLocator,
        reasonForDurability: 'Deadline is authoritative scheduling intelligence.',
        relatedEntityOrProject: 'active-project',
        recommendedDisposition: 'CREATE',
        relatedMemoryIds: [],
      });
    }
  }

  // Ordinary prose heuristics (no fixture prefixes required)
  const commitment = text.match(
    /(?:customer|tenant|buyer|client)\s+(?:committed|commitment|agreed)\s+(?:to\s+)?([^.\n]+)/i,
  );
  if (commitment?.[1]) {
    pushUnique(candidates, {
      content: `Customer commitment: ${commitment[1].trim()}`,
      memoryType: 'FACT',
      icareStage: 'CONTEXT',
      confidence: 0.86,
      importance: 0.88,
      ownershipClassification: 'PROJECT',
      scopeRecommendation: 'PROJECT',
      sourceEvidenceSpan: evidenceSpan(text, commitment[0]),
      sourceLocator,
      reasonForDurability: 'Customer commitments are durable commercial facts.',
      relatedEntityOrProject: 'active-property',
      recommendedDisposition: 'CREATE',
      relatedMemoryIds: [],
    });
  }

  const missingDoc = text.match(
    /(?:missing|awaiting|need(?:s)?)\s+(?:the\s+)?([A-Za-z0-9 _/-]+(?:certificate|report|appraisal|survey|lease|insurance|estoppel)[^.\n]*)/i,
  );
  if (missingDoc?.[0]) {
    pushUnique(candidates, {
      content: `Missing document: ${missingDoc[1].trim()}`,
      memoryType: 'TASK',
      icareStage: 'RECOMMENDATIONS',
      confidence: 0.84,
      importance: 0.8,
      ownershipClassification: 'PROJECT',
      scopeRecommendation: 'PROJECT',
      sourceEvidenceSpan: evidenceSpan(text, missingDoc[0]),
      sourceLocator,
      reasonForDurability: 'Missing documents block closing and must be tracked.',
      relatedEntityOrProject: 'active-property',
      recommendedDisposition: 'CREATE',
      relatedMemoryIds: [],
    });
  }

  const operatingConstraint = text.match(
    /(?:no paid advertising|cannot\s+[^.\n]{5,80}|must not\s+[^.\n]{5,80}|operating constraint[:\s]+[^.\n]+)/i,
  );
  if (operatingConstraint?.[0] && !candidates.some((c) => c.memoryType === 'CONSTRAINT')) {
    pushUnique(candidates, {
      content: `Constraint: ${operatingConstraint[0].trim()}`,
      memoryType: 'CONSTRAINT',
      icareStage: 'CONTEXT',
      confidence: 0.87,
      importance: 0.82,
      ownershipClassification: 'ORGANIZATION',
      scopeRecommendation: 'WORKSPACE',
      sourceEvidenceSpan: evidenceSpan(text, operatingConstraint[0]),
      sourceLocator,
      reasonForDurability: 'Operating constraints govern allowable execution.',
      relatedEntityOrProject: 'active-property',
      recommendedDisposition: 'CREATE',
      relatedMemoryIds: [],
    });
  }

  const template = text.match(/(?:template|standard form|reusable)\s+(?:for\s+)?([^.\n]{5,120})/i);
  if (template?.[0]) {
    pushUnique(candidates, {
      content: `Reusable template: ${template[1].trim()}`,
      memoryType: 'INSTRUCTION',
      icareStage: 'CONTEXT',
      confidence: 0.8,
      importance: 0.65,
      ownershipClassification: 'ORGANIZATION',
      scopeRecommendation: 'WORKSPACE',
      sourceEvidenceSpan: evidenceSpan(text, template[0]),
      sourceLocator,
      reasonForDurability: 'Reusable templates compound organizational intelligence.',
      relatedEntityOrProject: 'workspace-playbooks',
      recommendedDisposition: 'CREATE',
      relatedMemoryIds: [],
    });
  }

  const privateNote = text.match(
    /(?:private|personal|do not share|confidential to me)\s*[:-]\s*([^.\n]+)/i,
  );
  if (privateNote?.[1]) {
    pushUnique(candidates, {
      content: `Private note: ${privateNote[1].trim()}`,
      memoryType: 'PREFERENCE',
      icareStage: 'CONTEXT',
      confidence: 0.7,
      importance: 0.3,
      ownershipClassification: 'PRIVATE',
      scopeRecommendation: 'PROJECT',
      sourceEvidenceSpan: evidenceSpan(text, privateNote[0]),
      sourceLocator,
      reasonForDurability: 'Marked private; must not promote to organization scope.',
      relatedEntityOrProject: 'actor-private',
      recommendedDisposition: 'IGNORE',
      relatedMemoryIds: [],
    });
  }

  DATE_PATTERN_GLOBAL.lastIndex = 0;
  let dateMatch: RegExpExecArray | null;
  const seenDates = new Set<string>();
  while ((dateMatch = DATE_PATTERN_GLOBAL.exec(text)) !== null) {
    const dateText = dateMatch[1];
    const key = dateText.toLowerCase();
    if (seenDates.has(key)) continue;
    seenDates.add(key);
    const window = text.slice(Math.max(0, dateMatch.index - 60), dateMatch.index + 80);
    if (!/(launch|clos(?:e|ing)|deadline|due|occupancy|handover)/i.test(window)) {
      continue;
    }
    pushUnique(candidates, {
      content: `Launch date: ${dateText}`,
      memoryType: 'FACT',
      icareStage: 'CONTEXT',
      confidence: 0.82,
      importance: 0.9,
      ownershipClassification: 'PROJECT',
      scopeRecommendation: 'PROJECT',
      sourceEvidenceSpan: evidenceSpan(text, dateText),
      sourceLocator,
      reasonForDurability: 'Dated milestone extracted from narrative source.',
      relatedEntityOrProject: 'active-property',
      recommendedDisposition: 'CREATE',
      relatedMemoryIds: [],
    });
  }

  // Detect contradictions against related memories
  for (const candidate of candidates) {
    if (!/launch date/i.test(candidate.content)) continue;
    const candidateDate = firstDate(candidate.content)?.toLowerCase();
    if (!candidateDate) continue;
    for (const memory of related) {
      if (!/launch date/i.test(memory.content)) continue;
      const memoryDate = firstDate(memory.content)?.toLowerCase();
      if (memoryDate && memoryDate !== candidateDate) {
        candidate.recommendedDisposition = 'CORRECT';
        candidate.relatedMemoryIds = [memory.id];
        candidate.reasonForDurability =
          'Superseding date correction detected against authoritative memory.';
        candidate.confidence = Math.max(candidate.confidence, 0.9);
      }
    }
  }

  if (candidates.length === 0 && text.trim()) {
    pushUnique(candidates, {
      content: text.trim().slice(0, 500),
      memoryType: 'SUMMARY',
      icareStage: 'CONTEXT',
      confidence: 0.55,
      importance: 0.4,
      ownershipClassification: 'PROJECT',
      scopeRecommendation: 'PROJECT',
      sourceEvidenceSpan: text.slice(0, 240),
      sourceLocator,
      reasonForDurability: 'Fallback summary of otherwise unstructured source.',
      relatedEntityOrProject: 'active-project',
      recommendedDisposition: 'ESCALATE',
      relatedMemoryIds: [],
    });
  }

  return candidates;
}

function classifyConflict(
  candidateContent: string,
  related: ExistingMemoryContext[],
): {
  classification:
    | 'EXACT_DUPLICATE'
    | 'NEAR_DUPLICATE'
    | 'NEW_DURABLE'
    | 'SUPERSEDING_CORRECTION'
    | 'UNRESOLVED_CONTRADICTION'
    | 'PRIVATE_INFORMATION'
    | 'IRRELEVANT_OR_TRANSIENT';
  disposition: 'CREATE' | 'MERGE' | 'CORRECT' | 'IGNORE' | 'ESCALATE';
  relatedMemoryIds: string[];
  evidence: string;
} {
  const norm = normalize(candidateContent);
  if (/^private note:/i.test(candidateContent)) {
    return {
      classification: 'PRIVATE_INFORMATION',
      disposition: 'IGNORE',
      relatedMemoryIds: [],
      evidence: 'Ownership classified private.',
    };
  }

  for (const memory of related) {
    if (normalize(memory.content) === norm) {
      return {
        classification: 'EXACT_DUPLICATE',
        disposition: 'IGNORE',
        relatedMemoryIds: [memory.id],
        evidence: memory.content,
      };
    }
  }

  const candidateDate = firstDate(candidateContent)?.toLowerCase();
  for (const memory of related) {
    if (/launch date/i.test(candidateContent) && /launch date/i.test(memory.content)) {
      const memoryDate = firstDate(memory.content)?.toLowerCase();
      if (candidateDate && memoryDate && candidateDate !== memoryDate) {
        return {
          classification: 'SUPERSEDING_CORRECTION',
          disposition: 'CORRECT',
          relatedMemoryIds: [memory.id],
          evidence: `Candidate date ${candidateDate} vs memory date ${memoryDate}`,
        };
      }
    }
  }

  for (const memory of related) {
    const a = new Set(norm.split(/\s+/));
    const b = new Set(normalize(memory.content).split(/\s+/));
    let inter = 0;
    for (const t of a) if (b.has(t)) inter += 1;
    const union = a.size + b.size - inter;
    const jaccard = union === 0 ? 0 : inter / union;
    if (jaccard >= 0.75) {
      return {
        classification: 'NEAR_DUPLICATE',
        disposition: 'MERGE',
        relatedMemoryIds: [memory.id],
        evidence: memory.content,
      };
    }
  }

  if (/transient|temporary reminder|fyi only/i.test(candidateContent)) {
    return {
      classification: 'IRRELEVANT_OR_TRANSIENT',
      disposition: 'IGNORE',
      relatedMemoryIds: [],
      evidence: candidateContent.slice(0, 200),
    };
  }

  return {
    classification: 'NEW_DURABLE',
    disposition: 'CREATE',
    relatedMemoryIds: [],
    evidence: 'No conflicting authoritative memory found in scope.',
  };
}

/**
 * Deterministic mock reasoning engine for CI and offline demos.
 * Never performs live model or network calls.
 */
export class MockReasoningProvider implements ReasoningProvider {
  readonly providerName = 'mock';
  readonly modelId: string;

  constructor(options?: { modelId?: string; config?: ReasoningConfig }) {
    this.modelId = options?.modelId ?? options?.config?.modelId ?? DEFAULT_REASONING_MODEL_ID;
  }

  async extract(request: StructuredExtractionRequest): Promise<StructuredExtractionResult> {
    await Promise.resolve();
    const locator = request.sourceLocator ?? 'inline-source';
    const candidates = extractFromProse(request.sourceText, locator, request.relatedMemories ?? []);
    return structuredExtractionResultSchema.parse({
      candidates,
      rationale:
        'Mock structured extraction treated source text as data and proposed governed candidates.',
      provider: this.providerName,
      modelId: this.modelId,
    });
  }

  async analyze(request: ConflictAnalysisRequest) {
    await Promise.resolve();
    const classified = classifyConflict(request.candidateContent, request.relatedMemories);
    return conflictAnalysisResultSchema.parse({
      ...classified,
      confidence: classified.disposition === 'CORRECT' ? 0.93 : 0.8,
      rationale: `Mock analysis classified proposal as ${classified.classification}.`,
    });
  }

  async evaluate(request: PolicyEvaluationRequest) {
    await Promise.resolve();
    const privateBlocked = request.ownershipClassification === 'PRIVATE';
    const confidenceOk = request.confidence >= 0.55;
    const ownershipOk = !privateBlocked || request.disposition === 'IGNORE';
    const permissionsOk =
      request.permissions.includes('memory:harvest') ||
      request.permissions.includes('memory:review') ||
      request.permissions.includes('memory:write');
    const allowed =
      ownershipOk && permissionsOk && confidenceOk && request.disposition !== 'ESCALATE';
    return policyEvaluationResultSchema.parse({
      allowed,
      requiresApproval: request.disposition !== 'IGNORE',
      confidence: request.confidence,
      ownershipOk,
      permissionsOk,
      rationale: privateBlocked
        ? 'Private ownership must not promote to organization scope.'
        : 'Policy evaluation completed for governed candidate.',
    });
  }

  async selectNextTool(request: ToolSelectionRequest): Promise<ToolSelectionDecision> {
    await Promise.resolve();
    const tools = new Set(request.availableTools);
    const hints = request.workspaceHints ?? {};
    const searched = Boolean(hints.searched);
    const createdCount = Number(hints.createdMemoryIdsLength ?? 0);
    const correctedMemoryId =
      typeof hints.correctedMemoryId === 'string' ? hints.correctedMemoryId : null;
    const historyFetched = Boolean(hints.historyFetched);
    const artifactCount = Number(hints.artifactPathsLength ?? 0);
    const checkpointMemoryId =
      typeof hints.checkpointMemoryId === 'string' ? hints.checkpointMemoryId : null;
    const evaluationMemoryId =
      typeof hints.evaluationMemoryId === 'string' ? hints.evaluationMemoryId : null;
    const completed = Boolean(hints.completed);
    const correction = typeof hints.correction === 'string' ? hints.correction : undefined;
    const continueProject = Boolean(hints.continueProject);
    const remaining = request.remainingStepBudget;

    if (completed || remaining <= 0) {
      return toolSelectionDecisionSchema.parse({
        action: 'stop',
        reason: 'Step budget exhausted or task already complete.',
      });
    }

    const requireTool = (tool: string): void => {
      if (!tools.has(tool)) {
        throw new ReasoningProviderError(
          REASONING_ERROR_CODES.REASONING_TOOL_INVALID,
          `Requested tool is not available: ${tool}`,
        );
      }
    };

    if (!searched && tools.has('memory_search')) {
      requireTool('memory_search');
      return toolSelectionDecisionSchema.parse({
        action: 'call_tool',
        tool: 'memory_search',
        args: { query: request.userGoal || 'Continue the project', limit: 10 },
        reason: 'Retrieve related organizational intelligence before acting.',
        icareStage: 'CONTEXT',
      });
    }

    if (!searched && !tools.has('memory_search')) {
      throw new ReasoningProviderError(
        REASONING_ERROR_CODES.REASONING_TOOL_INVALID,
        'memory_search is required before acting but is not available.',
      );
    }

    if (correction && !correctedMemoryId && tools.has('memory_correct')) {
      const target =
        (typeof hints.correctionMemoryId === 'string' ? hints.correctionMemoryId : null) ??
        request.retrievedContext.find((h) => /launch date|deadline|closing/i.test(h.content))?.id;
      if (!target && tools.has('memory_search')) {
        return toolSelectionDecisionSchema.parse({
          action: 'call_tool',
          tool: 'memory_search',
          args: { query: 'Launch date', limit: 10 },
          reason: 'Locate the memory that must be corrected.',
          icareStage: 'ANALYSIS',
        });
      }
      if (target) {
        requireTool('memory_correct');
        return toolSelectionDecisionSchema.parse({
          action: 'call_tool',
          tool: 'memory_correct',
          args: {
            memoryId: target,
            content: correction,
            reason: 'Authoritative correction from governed review.',
          },
          reason: 'Apply superseding correction while preserving provenance.',
          icareStage: 'RECOMMENDATION_EVALUATION',
        });
      }
    }

    if (correctedMemoryId && !historyFetched && tools.has('memory_history')) {
      requireTool('memory_history');
      return toolSelectionDecisionSchema.parse({
        action: 'call_tool',
        tool: 'memory_history',
        args: { memoryId: correctedMemoryId },
        reason: 'Confirm revision history after correction.',
        icareStage: 'EXECUTION_EVALUATION',
      });
    }

    if (correction && correctedMemoryId && historyFetched && tools.has('task_complete')) {
      requireTool('task_complete');
      return toolSelectionDecisionSchema.parse({
        action: 'call_tool',
        tool: 'task_complete',
        args: {
          summary:
            'Applied correction, verified revisions, and retained lesson that corrections supersede stale facts.',
        },
        reason: 'Correction workflow is complete.',
        icareStage: 'EXECUTION_EVALUATION',
      });
    }

    if (!continueProject && createdCount === 0 && tools.has('memory_create')) {
      requireTool('memory_create');
      return toolSelectionDecisionSchema.parse({
        action: 'call_tool',
        tool: 'memory_create',
        args: {
          content: request.userGoal,
          memoryType: 'GOAL',
          icareStage: 'ISSUE',
        },
        reason: 'Persist the durable project issue/goal.',
        icareStage: 'ISSUE',
      });
    }

    if (artifactCount === 0 && tools.has('artifact_write')) {
      requireTool('artifact_write');
      const launch =
        request.retrievedContext.find((h) => /launch date|deadline|closing/i.test(h.content))
          ?.content ?? 'Deadline from memory';
      const constraint =
        request.retrievedContext.find((h) => /constraint|no paid advertising/i.test(h.content))
          ?.content ?? 'Constraint: follow operating policy';
      return toolSelectionDecisionSchema.parse({
        action: 'call_tool',
        tool: 'artifact_write',
        args: {
          filename: `next-action-${Date.now()}.md`,
          content: [
            '# Next Action Brief',
            '',
            `Goal: ${request.userGoal}`,
            launch,
            constraint,
            '',
            'Next action: execute the highest-priority open task without violating constraints.',
          ].join('\n'),
        },
        reason: 'Produce a non-memory execution artifact from recalled intelligence.',
        icareStage: 'EXECUTION',
      });
    }

    if (!checkpointMemoryId && tools.has('project_checkpoint')) {
      requireTool('project_checkpoint');
      return toolSelectionDecisionSchema.parse({
        action: 'call_tool',
        tool: 'project_checkpoint',
        args: {
          content: `Checkpoint: ${request.userGoal}`,
          memoryType: 'CHECKPOINT',
          icareStage: 'EXECUTION',
        },
        reason: 'Store an execution checkpoint for the next session.',
        icareStage: 'EXECUTION',
      });
    }

    if (checkpointMemoryId && !evaluationMemoryId && tools.has('memory_create')) {
      requireTool('memory_create');
      return toolSelectionDecisionSchema.parse({
        action: 'call_tool',
        tool: 'memory_create',
        args: {
          content: continueProject
            ? 'Continued project from memory; wrote next artifact without chat history.'
            : 'Stored goal; wrote artifact and checkpoint.',
          memoryType: 'ACTION_RESULT',
          icareStage: 'EXECUTION_EVALUATION',
          outcomeSummary: 'Agent run produced durable memory and a local artifact.',
          lessonsLearned: [
            'Recall before create.',
            'Corrections preserve revision history.',
            'Session continuity depends on QuestorOS Memory, not chat history.',
          ],
        },
        reason: 'Capture post-execution evaluation and lessons.',
        icareStage: 'EXECUTION_EVALUATION',
      });
    }

    if (checkpointMemoryId && evaluationMemoryId && tools.has('task_complete')) {
      requireTool('task_complete');
      return toolSelectionDecisionSchema.parse({
        action: 'call_tool',
        tool: 'task_complete',
        args: {
          summary: continueProject
            ? 'Continued from memory, executed next task, stored checkpoint and lessons.'
            : 'Stored goal, executed artifact path, checkpointed, and evaluated.',
        },
        reason: 'Stop after durable ICARE³ results are stored.',
        icareStage: 'EXECUTION_EVALUATION',
      });
    }

    return toolSelectionDecisionSchema.parse({
      action: 'stop',
      reason: 'No further validated tool applies under current policy constraints.',
    });
  }

  async evaluateExecution(request: ExecutionEvaluationRequest) {
    await Promise.resolve();
    return executionEvaluationResultSchema.parse({
      outcomeSummary: `Completed ${request.toolTrail.length} tool steps for goal: ${request.goal}`,
      lessonsLearned: [
        'Model output is proposal-only until deterministic validation.',
        'Cross-session continuity requires authoritative memory recall.',
        request.artifacts.length > 0
          ? 'Non-memory artifacts complement durable memory records.'
          : 'Prefer producing at least one non-memory artifact during execution.',
      ],
      success: request.toolTrail.every((step) => step.ok),
      icareStage: 'EXECUTION_EVALUATION',
    });
  }
}

export type {
  StructuredExtractionProvider,
  ConflictAnalysisProvider,
  PolicyEvaluationProvider,
  ToolSelectionProvider,
  ExecutionEvaluationProvider,
};
