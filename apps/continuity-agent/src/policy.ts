import type { ToolSelectionProvider } from '@questoros-memory/reasoning-provider';
import type { ToolCall, ToolName } from './agent.js';

export interface ContinuityPolicyWorkspace {
  goal: string;
  correction?: string;
  correctionMemoryId?: string;
  continueProject: boolean;
  sessionId: string;
  agentRunId: string;
  reasoningChainId: string;
  searched: boolean;
  createdMemoryIds: string[];
  correctedMemoryId: string | null;
  historyFetched: boolean;
  artifactPaths: string[];
  checkpointMemoryId: string | null;
  evaluationMemoryId: string | null;
  completed: boolean;
  lastSearchHits: Array<{ id: string; content: string; memoryType?: string }>;
  priorObservations: Array<{ tool: string; ok: boolean; summary: string }>;
  remainingStepBudget: number;
}

export interface ContinuityPolicy {
  readonly name: string;
  chooseNextTool(workspace: ContinuityPolicyWorkspace): Promise<ToolCall | null>;
}

const AVAILABLE_TOOLS: ToolName[] = [
  'memory_search',
  'memory_create',
  'memory_correct',
  'memory_history',
  'artifact_write',
  'project_checkpoint',
  'task_complete',
];

function agentBaseMetadata(
  workspace: ContinuityPolicyWorkspace,
  icareStage: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    source: 'continuity-agent',
    agentRunId: workspace.agentRunId,
    sessionId: workspace.sessionId,
    icare: {
      icareStage,
      reasoningChainId: workspace.reasoningChainId,
    },
    ...extra,
  };
}

function findLaunchDateHit(
  hits: Array<{ id: string; content: string }>,
): { id: string; content: string } | null {
  return hits.find((hit) => /launch date|deadline|closing/i.test(hit.content)) ?? null;
}

/**
 * Preserved deterministic ICARE³ policy (Phase 5A).
 * Kept as the safe/default fallback and regression baseline.
 */
export class DeterministicContinuityPolicy implements ContinuityPolicy {
  readonly name = 'deterministic';

  async chooseNextTool(workspace: ContinuityPolicyWorkspace): Promise<ToolCall | null> {
    await Promise.resolve();
    if (workspace.completed || workspace.remainingStepBudget <= 0) {
      return null;
    }

    if (workspace.continueProject && !workspace.searched) {
      return {
        tool: 'memory_search',
        args: {
          query:
            `${workspace.goal || 'Continue the launch project'} closing date launch date deadline constraint fire-safety`.trim(),
          limit: 20,
        },
        reason: 'ICARE³ Context: recall prior project memories before acting.',
      };
    }

    if (!workspace.continueProject && !workspace.searched) {
      return {
        tool: 'memory_search',
        args: { query: workspace.goal, limit: 10 },
        reason: 'ICARE³ Context: search existing memory before creating new facts.',
      };
    }

    if (workspace.correction && !workspace.correctedMemoryId) {
      const target =
        workspace.correctionMemoryId ?? findLaunchDateHit(workspace.lastSearchHits)?.id ?? null;
      if (!target) {
        return {
          tool: 'memory_search',
          args: { query: 'Launch date', limit: 10 },
          reason: 'ICARE³ Analysis: locate the launch-date memory to correct.',
        };
      }
      return {
        tool: 'memory_correct',
        args: {
          memoryId: target,
          content: workspace.correction,
          reason: 'User corrected the launch date.',
          icareStage: 'RECOMMENDATION_EVALUATION',
          reasoningChainId: workspace.reasoningChainId,
        },
        reason: 'ICARE³ Recommendation Evaluation: apply authoritative launch-date correction.',
      };
    }

    if (workspace.correctedMemoryId && !workspace.historyFetched) {
      return {
        tool: 'memory_history',
        args: { memoryId: workspace.correctedMemoryId },
        reason: 'ICARE³ Execution Evaluation: confirm revision history after correction.',
      };
    }

    if (workspace.correction && workspace.correctedMemoryId && workspace.historyFetched) {
      return {
        tool: 'task_complete',
        args: {
          summary:
            'ICARE³ complete: applied launch-date correction, verified revisions, retained lesson that corrections supersede stale facts.',
        },
        reason: 'Correction run is complete after history confirmation.',
      };
    }

    if (!workspace.continueProject && workspace.createdMemoryIds.length === 0) {
      return {
        tool: 'memory_create',
        args: {
          content: workspace.goal,
          memoryType: 'GOAL',
          icareStage: 'ISSUE',
          reasoningChainId: workspace.reasoningChainId,
          metadata: agentBaseMetadata(workspace, 'ISSUE', {
            createdByTool: 'memory_create',
          }),
        },
        reason: 'ICARE³ Issue: persist the durable project goal.',
      };
    }

    if (workspace.continueProject && workspace.searched && workspace.artifactPaths.length === 0) {
      const launch =
        findLaunchDateHit(workspace.lastSearchHits)?.content ?? 'Launch date: (from memory)';
      const constraint =
        workspace.lastSearchHits.find((h) => /no paid advertising|constraint/i.test(h.content))
          ?.content ?? 'Constraint: no paid advertising';
      return {
        tool: 'artifact_write',
        args: {
          filename: `launch-next-${workspace.sessionId}.md`,
          content: [
            '# Next Launch Action',
            '',
            `ICARE³ lifecycle: Issue → Context → Analysis → Recommendations → Evaluation → Execution → Evaluation`,
            '',
            `Goal: ${workspace.goal}`,
            launch,
            constraint,
            '',
            'Next action: draft channel plan without paid ads.',
            '',
            `Session: ${workspace.sessionId}`,
            `Reasoning chain: ${workspace.reasoningChainId}`,
          ].join('\n'),
        },
        reason: 'ICARE³ Execution: produce the next non-memory artifact from recalled context.',
      };
    }

    if (
      !workspace.continueProject &&
      workspace.createdMemoryIds.length > 0 &&
      workspace.artifactPaths.length === 0
    ) {
      return {
        tool: 'artifact_write',
        args: {
          filename: `launch-plan-${workspace.sessionId}.md`,
          content: [
            '# Product Launch Plan',
            '',
            workspace.goal,
            '',
            'Constraints and facts will be loaded from QuestorOS Memory on the next session.',
            '',
            `Session: ${workspace.sessionId}`,
            `Reasoning chain: ${workspace.reasoningChainId}`,
          ].join('\n'),
        },
        reason: 'ICARE³ Execution: create a launch plan artifact (non-memory action).',
      };
    }

    if (workspace.artifactPaths.length > 0 && !workspace.checkpointMemoryId) {
      return {
        tool: 'project_checkpoint',
        args: {
          content: `Checkpoint after ${workspace.continueProject ? 'continuation' : 'initial'} run: ${workspace.goal}`,
          memoryType: 'CHECKPOINT',
          icareStage: 'EXECUTION',
          reasoningChainId: workspace.reasoningChainId,
          metadata: agentBaseMetadata(workspace, 'EXECUTION', {
            artifactId: workspace.artifactPaths[0],
            taskStatus: 'in_progress',
            createdByTool: 'project_checkpoint',
            executionStatus: 'checkpointed',
          }),
        },
        reason: 'ICARE³ Execution: store a checkpoint for the next agent run.',
      };
    }

    if (workspace.checkpointMemoryId && !workspace.evaluationMemoryId) {
      return {
        tool: 'memory_create',
        args: {
          content: workspace.continueProject
            ? 'Continued launch project from memory; next artifact written without chat history.'
            : 'Initial launch goal stored; launch plan artifact and checkpoint written.',
          memoryType: 'ACTION_RESULT',
          icareStage: 'EXECUTION_EVALUATION',
          reasoningChainId: workspace.reasoningChainId,
          outcomeSummary: 'Agent run produced durable memory and a local artifact.',
          lessonsLearned: [
            'Recall before create.',
            'Corrections must preserve revision history.',
            'Session continuity depends on QuestorOS Memory, not chat history.',
          ],
          metadata: agentBaseMetadata(workspace, 'EXECUTION_EVALUATION', {
            createdByTool: 'memory_create',
            relatedMemoryIds: [...workspace.createdMemoryIds, workspace.checkpointMemoryId].filter(
              Boolean,
            ),
          }),
        },
        reason: 'ICARE³ Execution Evaluation: capture outcome and lessons.',
      };
    }

    if (workspace.checkpointMemoryId && workspace.evaluationMemoryId && !workspace.completed) {
      return {
        tool: 'task_complete',
        args: {
          summary: workspace.continueProject
            ? 'ICARE³ complete: continued launch project from memory, wrote next artifact + checkpoint + evaluation.'
            : 'ICARE³ complete: stored goal, wrote launch plan, checkpoint, and post-execution evaluation.',
        },
        reason: 'Stop the loop after durable ICARE³ results are stored.',
      };
    }

    return null;
  }
}

/**
 * Model-directed policy: asks a ToolSelectionProvider for the next validated tool.
 * Invalid model tool names / args are rejected and the loop stops safely.
 */
export class ModelDirectedContinuityPolicy implements ContinuityPolicy {
  readonly name = 'model-directed';
  private readonly selector: ToolSelectionProvider;
  private readonly fallback: ContinuityPolicy;

  constructor(
    selector: ToolSelectionProvider,
    fallback: ContinuityPolicy = new DeterministicContinuityPolicy(),
  ) {
    this.selector = selector;
    this.fallback = fallback;
  }

  async chooseNextTool(workspace: ContinuityPolicyWorkspace): Promise<ToolCall | null> {
    if (workspace.completed || workspace.remainingStepBudget <= 0) {
      return null;
    }

    try {
      const decision = await this.selector.selectNextTool({
        userGoal: workspace.goal,
        availableTools: [...AVAILABLE_TOOLS],
        retrievedContext: workspace.lastSearchHits,
        currentIcareState: workspace.searched ? 'ANALYSIS' : 'CONTEXT',
        priorObservations: workspace.priorObservations,
        remainingStepBudget: workspace.remainingStepBudget,
        policyConstraints: [
          'Retrieve memory before acting.',
          'Respect corrected facts.',
          'Perform at least one non-memory action.',
          'Store execution result and post-execution evaluation.',
          'Stop within the bounded step count.',
          'No raw chain-of-thought storage.',
        ],
        workspaceHints: {
          searched: workspace.searched,
          createdMemoryIdsLength: workspace.createdMemoryIds.length,
          correctedMemoryId: workspace.correctedMemoryId,
          historyFetched: workspace.historyFetched,
          artifactPathsLength: workspace.artifactPaths.length,
          checkpointMemoryId: workspace.checkpointMemoryId,
          evaluationMemoryId: workspace.evaluationMemoryId,
          completed: workspace.completed,
          correction: workspace.correction,
          correctionMemoryId: workspace.correctionMemoryId,
          continueProject: workspace.continueProject,
          reasoningChainId: workspace.reasoningChainId,
          sessionId: workspace.sessionId,
        },
      });

      if (decision.action === 'stop') {
        return null;
      }

      if (!decision.tool || !decision.args) {
        return this.fallback.chooseNextTool(workspace);
      }

      if (!(AVAILABLE_TOOLS as string[]).includes(decision.tool)) {
        throw new Error(`Unrecognized tool from model: ${decision.tool}`);
      }

      const args: Record<string, unknown> = { ...decision.args };
      if (typeof decision.icareStage === 'string' && args.icareStage === undefined) {
        args.icareStage = decision.icareStage;
      }
      // Cross-session continue must recall by scope, not by a fresh reasoning chain id.
      if (decision.tool === 'memory_search') {
        delete args.reasoningChainId;
      } else if (args.reasoningChainId === undefined) {
        args.reasoningChainId = workspace.reasoningChainId;
      }
      if (decision.tool === 'memory_create' || decision.tool === 'project_checkpoint') {
        args.metadata =
          args.metadata ??
          agentBaseMetadata(workspace, decision.icareStage ?? 'EXECUTION', {
            createdByTool: decision.tool,
            policy: this.name,
          });
      }

      return {
        tool: decision.tool,
        args,
        reason: decision.reason,
      };
    } catch {
      return this.fallback.chooseNextTool(workspace);
    }
  }
}
