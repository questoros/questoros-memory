/**
 * Two-session Continuity Agent demo (launch-date correction story).
 *
 * ICARE³™ spine for the demo:
 *   Issue → Context → Analysis → Recommendations → Evaluation → Execution → Evaluation
 *
 * This script documents and optionally drives the hackathon demo.
 * It is NOT a hard-coded step script for the agent loop — `ContinuityAgent`
 * chooses tools from workspace state. This file only sequences two separate
 * agent *processes* (sessions) for operators.
 *
 * Env:
 *   MEMORY_API_BASE_URL  (default http://127.0.0.1:8787)
 *   MEMORY_API_KEY       (required to actually call the API)
 *   RUN_DEMO_LAUNCH=true (required to execute; otherwise prints the plan)
 *
 * Session 1 — Issue/Context/Execution: seed project memory, artifact, checkpoint, evaluation.
 * Correction — Recommendation Evaluation: August 15 → August 20 via memory_correct.
 * Session 2 — Context → Execution: new process, empty chat history, continue from Memory only.
 *
 * Never set DATABASE_URL here. Never import memory-service or database.
 */

import { ContinuityAgent } from './agent.js';

const SESSION1_GOAL = [
  'Goal: launch a new product.',
  'Budget: USD 10,000.',
  'Launch date: August 15.',
  'Constraint: no paid advertising.',
].join('\n');

const CORRECTION = 'Launch date: August 20.';

const SESSION2_GOAL = 'Continue the launch project.';

export function describeTwoSessionDemo(): string {
  return [
    '# QuestorOS Continuity Agent — two-session ICARE³ demo',
    '',
    'ICARE³™: Issue → Context → Analysis → Recommendations → Evaluation → Execution → Evaluation',
    '',
    '## Session 1 (new process)',
    'User: prepare a product launch with goal, budget, August 15 launch date, no paid ads.',
    'Agent ICARE³ loop (state-driven): Context(search) → Issue(create goal) → Execution(artifact + checkpoint) → Execution Evaluation(lessons) → stop',
    '',
    '## Correction',
    'User: The launch date is August 20, not August 15.',
    'Agent: Analysis(locate) → Recommendation Evaluation(correct) → Execution Evaluation(history) → stop',
    '',
    '## Session 2 (new process, empty conversation)',
    'User: Continue the launch project.',
    'Agent must recall August 20 (not 15), respect no-paid-advertising, write next artifact + checkpoint + evaluation.',
    '',
    'Isolation: public REST via @questoros-memory/sdk only. ICARE³ stages stored under metadata.icare + reasoningChainId.',
  ].join('\n');
}

async function main(): Promise<void> {
  console.log(describeTwoSessionDemo());
  console.log('');

  if (process.env.RUN_DEMO_LAUNCH !== 'true') {
    console.log(
      'Demo execution gated. Set RUN_DEMO_LAUNCH=true and MEMORY_API_KEY to run against a live API.',
    );
    return;
  }

  const baseUrl = process.env.MEMORY_API_BASE_URL ?? 'http://127.0.0.1:8787';
  const apiKey = process.env.MEMORY_API_KEY;
  if (!apiKey) {
    throw new Error('MEMORY_API_KEY is required when RUN_DEMO_LAUNCH=true');
  }

  const session1 = new ContinuityAgent({
    baseUrl,
    apiKey,
    sessionId: 'demo-session-1',
    agentRunId: 'demo-run-1',
  });
  const result1 = await session1.run({ goal: SESSION1_GOAL });
  console.log('Session 1 completed:', result1.completed, result1.summary);

  const correctionAgent = new ContinuityAgent({
    baseUrl,
    apiKey,
    sessionId: 'demo-session-1-correction',
    agentRunId: 'demo-run-1b',
  });
  const correctionResult = await correctionAgent.run({
    goal: SESSION1_GOAL,
    correction: CORRECTION,
    continueProject: true,
  });
  console.log('Correction completed:', correctionResult.completed, correctionResult.summary);

  const session2 = new ContinuityAgent({
    baseUrl,
    apiKey,
    sessionId: 'demo-session-2',
    agentRunId: 'demo-run-2',
  });
  const result2 = await session2.run({
    goal: SESSION2_GOAL,
    continueProject: true,
  });
  console.log('Session 2 completed:', result2.completed, result2.summary);
  console.log('Session 2 artifacts:', result2.artifacts);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
