import { MemoryApiClient, type FetchLike } from '@questoros-memory/sdk';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export type MemoryToolName =
  'memory_search' | 'memory_create' | 'memory_correct' | 'memory_history';

export type LocalToolName = 'artifact_write' | 'project_checkpoint' | 'task_complete';

export type ToolName = MemoryToolName | LocalToolName;

export interface ToolCall {
  tool: ToolName;
  args: Record<string, unknown>;
  reason: string;
}

export interface ToolObservation {
  tool: ToolName;
  ok: boolean;
  result: unknown;
}

export interface ContinuityAgentOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: FetchLike;
  /** Directory for local artifacts (default: .continuity-artifacts). */
  artifactDir?: string;
  maxSteps?: number;
  sessionId?: string;
  agentRunId?: string;
}

export interface ContinuityAgentInput {
  /** User goal / utterance for this run. */
  goal: string;
  /** Optional correction text (e.g. launch date change). */
  correction?: string;
  /** Optional memory id to correct when known. */
  correctionMemoryId?: string;
  /** When true, prefer recalling existing project memory before creating. */
  continueProject?: boolean;
}

export interface ContinuityAgentResult {
  sessionId: string;
  agentRunId: string;
  completed: boolean;
  steps: Array<{ call: ToolCall; observation: ToolObservation }>;
  artifacts: string[];
  checkpointMemoryId: string | null;
  summary: string;
}

interface AgentWorkspace {
  goal: string;
  correction?: string;
  correctionMemoryId?: string;
  continueProject: boolean;
  sessionId: string;
  agentRunId: string;
  /** ICARE³ reasoning chain id — shared across all memories in this run. */
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
}

function agentBaseMetadata(
  workspace: AgentWorkspace,
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

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function extractHits(
  searchResponse: unknown,
): Array<{ id: string; content: string; memoryType?: string }> {
  const body = asRecord(searchResponse);
  const results = Array.isArray(body.results)
    ? body.results
    : Array.isArray(body.items)
      ? body.items
      : Array.isArray(searchResponse)
        ? searchResponse
        : [];

  const hits: Array<{ id: string; content: string; memoryType?: string }> = [];
  for (const item of results) {
    const row = asRecord(item);
    const memory = asRecord(row.memory ?? row);
    const id =
      typeof memory.id === 'string' ? memory.id : typeof row.id === 'string' ? row.id : null;
    const content =
      typeof memory.content === 'string'
        ? memory.content
        : typeof row.content === 'string'
          ? row.content
          : null;
    if (!id || !content) {
      continue;
    }
    hits.push({
      id,
      content,
      memoryType:
        typeof memory.memoryType === 'string'
          ? memory.memoryType
          : typeof row.memoryType === 'string'
            ? row.memoryType
            : undefined,
    });
  }
  return hits;
}

function findLaunchDateHit(
  hits: Array<{ id: string; content: string }>,
): { id: string; content: string } | null {
  return hits.find((hit) => /launch date/i.test(hit.content)) ?? null;
}

/**
 * Choose the next tool from workspace state — never from step index alone.
 * Maps onto ICARE³: Issue → Context → Analysis → Recommendations → Evaluation → Execution → Evaluation.
 */
export function chooseNextTool(workspace: AgentWorkspace): ToolCall | null {
  if (workspace.completed) {
    return null;
  }

  // CONTEXT — recall prior organizational intelligence
  if (workspace.continueProject && !workspace.searched) {
    return {
      tool: 'memory_search',
      args: {
        query: workspace.goal || 'Continue the launch project',
        limit: 10,
        reasoningChainId: workspace.reasoningChainId,
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

  // RECOMMENDATIONS → RECOMMENDATION_EVALUATION via correction path
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

  // ISSUE → CONTEXT durable goal
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

  // EXECUTION — non-memory artifact
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

  // EXECUTION_EVALUATION — outcome + lesson
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

export class ContinuityAgent {
  private readonly client: MemoryApiClient;
  private readonly artifactDir: string;
  private readonly maxSteps: number;
  private readonly sessionId: string;
  private readonly agentRunId: string;

  constructor(options: ContinuityAgentOptions) {
    this.client = new MemoryApiClient({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      fetch: options.fetch,
    });
    this.artifactDir = options.artifactDir ?? path.join(process.cwd(), '.continuity-artifacts');
    this.maxSteps = options.maxSteps ?? 12;
    this.sessionId = options.sessionId ?? `session-${Date.now()}`;
    this.agentRunId = options.agentRunId ?? `run-${Date.now()}`;
  }

  async run(input: ContinuityAgentInput): Promise<ContinuityAgentResult> {
    const reasoningChainId = randomUUID();
    const workspace: AgentWorkspace = {
      goal: input.goal,
      correction: input.correction,
      correctionMemoryId: input.correctionMemoryId,
      continueProject: Boolean(input.continueProject),
      sessionId: this.sessionId,
      agentRunId: this.agentRunId,
      reasoningChainId,
      searched: false,
      createdMemoryIds: [],
      correctedMemoryId: null,
      historyFetched: false,
      artifactPaths: [],
      checkpointMemoryId: null,
      evaluationMemoryId: null,
      completed: false,
      lastSearchHits: [],
    };

    const steps: ContinuityAgentResult['steps'] = [];

    for (let i = 0; i < this.maxSteps; i += 1) {
      const call = chooseNextTool(workspace);
      if (!call) {
        break;
      }
      const observation = await this.executeTool(call, workspace);
      steps.push({ call, observation });
      if (workspace.completed) {
        break;
      }
    }

    return {
      sessionId: workspace.sessionId,
      agentRunId: workspace.agentRunId,
      completed: workspace.completed,
      steps,
      artifacts: [...workspace.artifactPaths],
      checkpointMemoryId: workspace.checkpointMemoryId,
      summary:
        steps.find((s) => s.call.tool === 'task_complete')?.call.args.summary?.toString() ??
        'Agent stopped without task_complete.',
    };
  }

  private async executeTool(call: ToolCall, workspace: AgentWorkspace): Promise<ToolObservation> {
    try {
      switch (call.tool) {
        case 'memory_search': {
          const query = String(call.args.query ?? workspace.goal);
          const limit = typeof call.args.limit === 'number' ? call.args.limit : 10;
          const result = await this.client.searchMemories({
            queryText: query,
            limit,
            ...(typeof call.args.reasoningChainId === 'string'
              ? { reasoningChainId: call.args.reasoningChainId }
              : {}),
          });
          workspace.searched = true;
          workspace.lastSearchHits = extractHits(result);
          return { tool: call.tool, ok: true, result };
        }
        case 'memory_create': {
          const body: Record<string, unknown> = {
            content: String(call.args.content ?? ''),
            memoryType: String(call.args.memoryType ?? 'FACT'),
            metadata: call.args.metadata ?? {},
          };
          if (typeof call.args.icareStage === 'string') body.icareStage = call.args.icareStage;
          if (typeof call.args.reasoningChainId === 'string') {
            body.reasoningChainId = call.args.reasoningChainId;
          }
          if (typeof call.args.outcomeSummary === 'string') {
            body.outcomeSummary = call.args.outcomeSummary;
          }
          if (Array.isArray(call.args.lessonsLearned)) {
            body.lessonsLearned = call.args.lessonsLearned;
          }
          const result = await this.client.createMemory(body);
          const memory = asRecord(asRecord(result).memory ?? result);
          const id = typeof memory.id === 'string' ? memory.id : null;
          if (id) {
            workspace.createdMemoryIds.push(id);
            if (call.args.icareStage === 'EXECUTION_EVALUATION') {
              workspace.evaluationMemoryId = id;
            }
          }
          return { tool: call.tool, ok: true, result };
        }
        case 'memory_correct': {
          const memoryId = String(call.args.memoryId ?? '');
          const result = await this.client.correctMemory(memoryId, {
            content: String(call.args.content ?? ''),
            reason: String(call.args.reason ?? 'correction'),
            ...(typeof call.args.icareStage === 'string'
              ? { icareStage: call.args.icareStage }
              : {}),
            ...(typeof call.args.reasoningChainId === 'string'
              ? { reasoningChainId: call.args.reasoningChainId }
              : {}),
          });
          workspace.correctedMemoryId = memoryId;
          return { tool: call.tool, ok: true, result };
        }
        case 'memory_history': {
          const memoryId = String(call.args.memoryId ?? workspace.correctedMemoryId ?? '');
          const result = await this.client.getHistory(memoryId);
          workspace.historyFetched = true;
          return { tool: call.tool, ok: true, result };
        }
        case 'artifact_write': {
          await mkdir(this.artifactDir, { recursive: true });
          const filename = String(call.args.filename ?? `artifact-${Date.now()}.md`);
          const fullPath = path.join(this.artifactDir, filename);
          await writeFile(fullPath, String(call.args.content ?? ''), 'utf8');
          workspace.artifactPaths.push(fullPath);

          const summary = await this.client.createMemory({
            content: `Artifact summary: ${filename}`,
            memoryType: 'ARTIFACT_SUMMARY',
            icareStage: 'EXECUTION',
            reasoningChainId: workspace.reasoningChainId,
            metadata: agentBaseMetadata(workspace, 'EXECUTION', {
              artifactId: fullPath,
              createdByTool: 'artifact_write',
              executionStatus: 'artifact_written',
            }),
          });
          return { tool: call.tool, ok: true, result: { path: fullPath, memory: summary } };
        }
        case 'project_checkpoint': {
          const result = await this.client.createMemory({
            content: String(call.args.content ?? 'Checkpoint'),
            memoryType: 'CHECKPOINT',
            icareStage:
              typeof call.args.icareStage === 'string' ? call.args.icareStage : 'EXECUTION',
            reasoningChainId: workspace.reasoningChainId,
            metadata: call.args.metadata ?? agentBaseMetadata(workspace, 'EXECUTION'),
          });
          const memory = asRecord(asRecord(result).memory ?? result);
          const id = typeof memory.id === 'string' ? memory.id : null;
          workspace.checkpointMemoryId = id;
          return { tool: call.tool, ok: true, result };
        }
        case 'task_complete': {
          workspace.completed = true;
          return { tool: call.tool, ok: true, result: { summary: call.args.summary } };
        }
        default: {
          const _exhaustive: never = call.tool;
          return { tool: _exhaustive, ok: false, result: { error: 'unknown tool' } };
        }
      }
    } catch (error) {
      return {
        tool: call.tool,
        ok: false,
        result: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }
}
