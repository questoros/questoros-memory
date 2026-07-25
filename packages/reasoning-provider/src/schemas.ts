import { z } from 'zod';
import { ICARE_LIFECYCLE_STAGES, MEMORY_TYPES, SCOPE_TYPES } from '@questoros-memory/memory-core';

export const CANDIDATE_DISPOSITIONS = [
  'CREATE',
  'MERGE',
  'CORRECT',
  'IGNORE',
  'ESCALATE',
  'PUBLISH',
] as const;
export type CandidateDisposition = (typeof CANDIDATE_DISPOSITIONS)[number];

export const OWNERSHIP_CLASSIFICATIONS = [
  'ORGANIZATION',
  'WORKSPACE',
  'PROJECT',
  'PRIVATE',
  'TRANSIENT',
] as const;
export type OwnershipClassification = (typeof OWNERSHIP_CLASSIFICATIONS)[number];

export const ANALYSIS_CLASSIFICATIONS = [
  'EXACT_DUPLICATE',
  'NEAR_DUPLICATE',
  'NEW_DURABLE',
  'SUPERSEDING_CORRECTION',
  'UNRESOLVED_CONTRADICTION',
  'DIFFERENT_SCOPE',
  'PRIVATE_INFORMATION',
  'IRRELEVANT_OR_TRANSIENT',
] as const;
export type AnalysisClassification = (typeof ANALYSIS_CLASSIFICATIONS)[number];

export const AGENT_TOOL_NAMES = [
  'memory_search',
  'memory_create',
  'memory_correct',
  'memory_history',
  'artifact_write',
  'project_checkpoint',
  'task_complete',
] as const;
export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

const confidenceSchema = z.number().min(0).max(1);
const importanceSchema = z.number().min(0).max(1);

export const proposedCandidateSchema = z
  .object({
    content: z.string().trim().min(1).max(8000),
    memoryType: z.enum(MEMORY_TYPES),
    icareStage: z.enum(ICARE_LIFECYCLE_STAGES),
    confidence: confidenceSchema,
    importance: importanceSchema,
    ownershipClassification: z.enum(OWNERSHIP_CLASSIFICATIONS),
    scopeRecommendation: z.enum(SCOPE_TYPES),
    sourceEvidenceSpan: z.string().trim().min(1).max(2000),
    sourceLocator: z.string().trim().min(1).max(512),
    reasonForDurability: z.string().trim().min(1).max(1000),
    relatedEntityOrProject: z.string().trim().min(1).max(512),
    recommendedDisposition: z.enum(CANDIDATE_DISPOSITIONS),
    relatedMemoryIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .strict();

export const structuredExtractionResultSchema = z
  .object({
    candidates: z.array(proposedCandidateSchema).max(50),
    rationale: z.string().trim().min(1).max(2000),
    provider: z.string().trim().min(1).max(64),
    modelId: z.string().trim().min(1).max(128),
  })
  .strict();

export const conflictAnalysisResultSchema = z
  .object({
    classification: z.enum(ANALYSIS_CLASSIFICATIONS),
    disposition: z.enum(CANDIDATE_DISPOSITIONS),
    confidence: confidenceSchema,
    relatedMemoryIds: z.array(z.string().uuid()).max(50),
    evidence: z.string().trim().min(1).max(2000),
    rationale: z.string().trim().min(1).max(2000),
  })
  .strict();

export const policyEvaluationResultSchema = z
  .object({
    allowed: z.boolean(),
    requiresApproval: z.boolean(),
    confidence: confidenceSchema,
    ownershipOk: z.boolean(),
    permissionsOk: z.boolean(),
    rationale: z.string().trim().min(1).max(2000),
  })
  .strict();

export const toolSelectionDecisionSchema = z
  .object({
    action: z.enum(['call_tool', 'stop']),
    tool: z.enum(AGENT_TOOL_NAMES).optional(),
    args: z.record(z.string(), z.unknown()).optional(),
    reason: z.string().trim().min(1).max(1000),
    icareStage: z.enum(ICARE_LIFECYCLE_STAGES).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.action === 'call_tool') {
      if (!value.tool) {
        ctx.addIssue({
          code: 'custom',
          path: ['tool'],
          message: 'tool is required for call_tool.',
        });
      }
      if (!value.args || typeof value.args !== 'object') {
        ctx.addIssue({
          code: 'custom',
          path: ['args'],
          message: 'args are required for call_tool.',
        });
      }
    }
    if (value.action === 'stop' && value.tool) {
      ctx.addIssue({
        code: 'custom',
        path: ['tool'],
        message: 'stop decisions must not include a tool.',
      });
    }
  });

export const executionEvaluationResultSchema = z
  .object({
    outcomeSummary: z.string().trim().min(1).max(2000),
    lessonsLearned: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
    success: z.boolean(),
    icareStage: z.literal('EXECUTION_EVALUATION'),
  })
  .strict();

export type ProposedCandidate = z.infer<typeof proposedCandidateSchema>;
export type StructuredExtractionResult = z.infer<typeof structuredExtractionResultSchema>;
export type ConflictAnalysisResult = z.infer<typeof conflictAnalysisResultSchema>;
export type PolicyEvaluationResult = z.infer<typeof policyEvaluationResultSchema>;
export type ToolSelectionDecision = z.infer<typeof toolSelectionDecisionSchema>;
export type ExecutionEvaluationResult = z.infer<typeof executionEvaluationResultSchema>;
