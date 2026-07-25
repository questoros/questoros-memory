import { describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ContinuityAgent,
  ModelDirectedContinuityPolicy,
  DeterministicContinuityPolicy,
} from '../src/index.js';
import {
  MockReasoningProvider,
  toolSelectionDecisionSchema,
  type ToolSelectionProvider,
} from '@questoros-memory/reasoning-provider';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

describe('ModelDirectedContinuityPolicy', () => {
  it('uses validated model tool selection and bounds the loop', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'continuity-model-'));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/memories/search') && method === 'POST') {
        return jsonResponse(200, {
          results: [
            {
              memory: {
                id: '11111111-1111-4111-8111-111111111111',
                content: 'Launch date: August 20, 2026',
                memoryType: 'FACT',
              },
            },
            {
              memory: {
                id: '22222222-2222-4222-8222-222222222222',
                content: 'Constraint: no paid advertising',
                memoryType: 'CONSTRAINT',
              },
            },
          ],
        });
      }
      if (url.includes('/memories') && method === 'POST' && !url.includes('corrections')) {
        return jsonResponse(200, {
          memory: { id: `mem-${Math.random().toString(16).slice(2, 10)}` },
        });
      }
      return jsonResponse(200, {});
    });

    const agent = new ContinuityAgent({
      baseUrl: 'http://memory.test',
      apiKey: 'test-key',
      fetch: fetchMock as unknown as typeof fetch,
      artifactDir: dir,
      maxSteps: 8,
      sessionId: 's-model',
      agentRunId: 'r-model',
      policy: new ModelDirectedContinuityPolicy(new MockReasoningProvider()),
    });

    const result = await agent.run({
      goal: 'Continue Harborview closing readiness',
      continueProject: true,
    });

    expect(result.policyName).toBe('model-directed');
    expect(result.completed).toBe(true);
    expect(result.steps.length).toBeLessThanOrEqual(8);
    expect(result.steps[0]?.call.tool).toBe('memory_search');
    expect(result.steps.some((s) => s.call.tool === 'artifact_write')).toBe(true);
    expect(result.steps.some((s) => s.call.tool === 'project_checkpoint')).toBe(true);
    expect(result.artifacts.length).toBeGreaterThan(0);
  });

  it('rejects unrecognized model tools via schema and falls back safely', async () => {
    const badSelector: ToolSelectionProvider = {
      async selectNextTool() {
        const parsed = toolSelectionDecisionSchema.safeParse({
          action: 'call_tool',
          tool: 'drop_database',
          args: {},
          reason: 'nope',
        });
        expect(parsed.success).toBe(false);
        throw new Error('invalid tool');
      },
    };

    const policy = new ModelDirectedContinuityPolicy(
      badSelector,
      new DeterministicContinuityPolicy(),
    );
    const call = await policy.chooseNextTool({
      goal: 'x',
      continueProject: false,
      sessionId: 's',
      agentRunId: 'r',
      reasoningChainId: '11111111-1111-4111-8111-111111111111',
      searched: false,
      createdMemoryIds: [],
      correctedMemoryId: null,
      historyFetched: false,
      artifactPaths: [],
      checkpointMemoryId: null,
      evaluationMemoryId: null,
      completed: false,
      lastSearchHits: [],
      priorObservations: [],
      remainingStepBudget: 5,
    });
    expect(call?.tool).toBe('memory_search');
  });

  it('recalls corrected facts instead of stale dates', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'continuity-correct-'));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/memories/search')) {
        return jsonResponse(200, {
          results: [
            {
              memory: {
                id: '11111111-1111-4111-8111-111111111111',
                content: 'Launch date: August 20, 2026',
                memoryType: 'FACT',
              },
            },
          ],
        });
      }
      if (url.includes('/corrections')) {
        return jsonResponse(200, { memory: { id: '11111111-1111-4111-8111-111111111111' } });
      }
      if (url.includes('/revisions')) {
        return jsonResponse(200, {
          revisions: [
            { revisionNumber: 1, content: 'Launch date: July 15, 2026' },
            { revisionNumber: 2, content: 'Launch date: August 20, 2026' },
          ],
        });
      }
      if (method === 'POST') {
        return jsonResponse(200, { memory: { id: 'mem-new' } });
      }
      return jsonResponse(200, {});
    });

    const agent = new ContinuityAgent({
      baseUrl: 'http://memory.test',
      apiKey: 'test-key',
      fetch: fetchMock as unknown as typeof fetch,
      artifactDir: dir,
      maxSteps: 6,
      policy: new ModelDirectedContinuityPolicy(new MockReasoningProvider()),
    });

    const result = await agent.run({
      goal: 'Apply closing correction',
      continueProject: true,
      correction: 'Launch date: August 20, 2026',
      correctionMemoryId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.steps.some((s) => s.call.tool === 'memory_correct')).toBe(true);
    expect(result.steps.some((s) => s.call.tool === 'memory_history')).toBe(true);
    expect(result.completed).toBe(true);
  });
});
