import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContinuityAgent, chooseNextTool } from '../src/agent.js';

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

describe('chooseNextTool', () => {
  it('selects tools from workspace state, not step number', () => {
    const base = {
      goal: 'Goal: launch',
      continueProject: false,
      sessionId: 's1',
      agentRunId: 'r1',
      reasoningChainId: '11111111-1111-4111-8111-111111111111',
      searched: false,
      createdMemoryIds: [] as string[],
      correctedMemoryId: null as string | null,
      historyFetched: false,
      artifactPaths: [] as string[],
      checkpointMemoryId: null as string | null,
      evaluationMemoryId: null as string | null,
      completed: false,
      lastSearchHits: [] as Array<{ id: string; content: string }>,
    };

    expect(chooseNextTool(base)?.tool).toBe('memory_search');
    expect(chooseNextTool({ ...base, searched: true })?.tool).toBe('memory_create');
    expect(chooseNextTool({ ...base, searched: true })?.args.icareStage).toBe('ISSUE');
    expect(
      chooseNextTool({
        ...base,
        searched: true,
        createdMemoryIds: ['m1'],
      })?.tool,
    ).toBe('artifact_write');
    expect(
      chooseNextTool({
        ...base,
        searched: true,
        createdMemoryIds: ['m1'],
        artifactPaths: ['/tmp/a.md'],
      })?.tool,
    ).toBe('project_checkpoint');
    expect(
      chooseNextTool({
        ...base,
        searched: true,
        createdMemoryIds: ['m1'],
        artifactPaths: ['/tmp/a.md'],
        checkpointMemoryId: 'cp1',
      })?.tool,
    ).toBe('memory_create');
    expect(
      chooseNextTool({
        ...base,
        searched: true,
        createdMemoryIds: ['m1'],
        artifactPaths: ['/tmp/a.md'],
        checkpointMemoryId: 'cp1',
      })?.args.icareStage,
    ).toBe('EXECUTION_EVALUATION');
    expect(
      chooseNextTool({
        ...base,
        searched: true,
        createdMemoryIds: ['m1'],
        artifactPaths: ['/tmp/a.md'],
        checkpointMemoryId: 'cp1',
        evaluationMemoryId: 'ev1',
      })?.tool,
    ).toBe('task_complete');
  });

  it('prefers correction path when correction text is present', () => {
    const call = chooseNextTool({
      goal: 'launch',
      correction: 'Launch date: August 20.',
      continueProject: true,
      sessionId: 's',
      agentRunId: 'r',
      reasoningChainId: '11111111-1111-4111-8111-111111111111',
      searched: true,
      createdMemoryIds: [],
      correctedMemoryId: null,
      historyFetched: false,
      artifactPaths: [],
      checkpointMemoryId: null,
      evaluationMemoryId: null,
      completed: false,
      lastSearchHits: [{ id: 'mem-date', content: 'Launch date: August 15.' }],
    });
    expect(call?.tool).toBe('memory_correct');
    expect(call?.args.memoryId).toBe('mem-date');
    expect(call?.args.icareStage).toBe('RECOMMENDATION_EVALUATION');
  });
});

describe('ContinuityAgent', () => {
  let artifactDir: string;

  beforeEach(async () => {
    artifactDir = await mkdtemp(path.join(os.tmpdir(), 'continuity-'));
  });

  it('runs a tool loop against mocked fetch without importing service packages', async () => {
    const fetchMock = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? 'GET';
      if (url.endsWith('/v1/memories/search') && method === 'POST') {
        return jsonResponse(200, { results: [] });
      }
      if (url.endsWith('/v1/memories') && method === 'POST') {
        const body = JSON.parse(init?.body ?? '{}') as { memoryType?: string };
        const id =
          body.memoryType === 'CHECKPOINT'
            ? 'mem-checkpoint'
            : body.memoryType === 'ARTIFACT_SUMMARY'
              ? 'mem-artifact'
              : body.memoryType === 'ACTION_RESULT'
                ? 'mem-eval'
                : 'mem-goal';
        return jsonResponse(201, { memory: { id, memoryType: body.memoryType } });
      }
      return jsonResponse(404, { error: { message: `unexpected ${method} ${url}` } });
    });

    const agent = new ContinuityAgent({
      baseUrl: 'http://memory.test',
      apiKey: 'qmem_test',
      fetch: fetchMock,
      artifactDir,
      sessionId: 'test-session',
      agentRunId: 'test-run',
    });

    const result = await agent.run({
      goal: 'Goal: launch a new product.',
    });

    expect(result.completed).toBe(true);
    expect(result.steps.map((s) => s.call.tool)).toEqual([
      'memory_search',
      'memory_create',
      'artifact_write',
      'project_checkpoint',
      'memory_create',
      'task_complete',
    ]);
    expect(result.checkpointMemoryId).toBe('mem-checkpoint');
    expect(result.steps.some((s) => s.call.args.icareStage === 'EXECUTION_EVALUATION')).toBe(true);
    expect(result.artifacts).toHaveLength(1);
    const artifact = await readFile(result.artifacts[0]!, 'utf8');
    expect(artifact).toContain('Product Launch Plan');

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/v1/memories/search'))).toBe(true);
    expect(urls.every((u) => u.startsWith('http://memory.test/'))).toBe(true);
  });

  it('continues a project using recalled August 20 date', async () => {
    const fetchMock = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? 'GET';
      if (url.endsWith('/v1/memories/search') && method === 'POST') {
        return jsonResponse(200, {
          results: [
            { id: 'm-date', content: 'Launch date: August 20.', memoryType: 'FACT' },
            {
              id: 'm-constraint',
              content: 'Constraint: no paid advertising.',
              memoryType: 'CONSTRAINT',
            },
          ],
        });
      }
      if (url.endsWith('/v1/memories') && method === 'POST') {
        const body = JSON.parse(init?.body ?? '{}') as { memoryType?: string };
        const id =
          body.memoryType === 'CHECKPOINT'
            ? 'cp2'
            : body.memoryType === 'ACTION_RESULT'
              ? 'ev2'
              : 'sum2';
        return jsonResponse(201, {
          memory: { id, memoryType: body.memoryType },
        });
      }
      return jsonResponse(404, { error: { message: 'unexpected' } });
    });

    const agent = new ContinuityAgent({
      baseUrl: 'http://memory.test',
      apiKey: 'key',
      fetch: fetchMock,
      artifactDir,
      sessionId: 'session-2',
      agentRunId: 'run-2',
    });

    const result = await agent.run({
      goal: 'Continue the launch project.',
      continueProject: true,
    });

    expect(result.completed).toBe(true);
    expect(result.steps[0]?.call.tool).toBe('memory_search');
    const artifactStep = result.steps.find((s) => s.call.tool === 'artifact_write');
    expect(artifactStep).toBeTruthy();
    const written = await readFile(result.artifacts[0]!, 'utf8');
    expect(written).toContain('August 20');
    expect(written).toContain('no paid advertising');
    expect(written).not.toContain('August 15');
  });

  it('does not depend on memory-service or database packages', () => {
    const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps['@questoros-memory/sdk']).toBe('workspace:*');
    expect(deps['@questoros-memory/memory-service']).toBeUndefined();
    expect(deps['@questoros-memory/database']).toBeUndefined();
  });
});
