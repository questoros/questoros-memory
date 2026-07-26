#!/usr/bin/env node
/**
 * Gated Phase 7 Amazon Bedrock reasoning preflight.
 * Do not call from test/build/CI.
 * Executes exactly one Converse request with maxAttempts=1.
 */
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const MODEL_ID = 'amazon.nova-micro-v1:0';
const REGION = 'us-west-2';

function fail(category) {
  process.stdout.write(
    `${JSON.stringify({
      status: 'failure',
      provider: 'amazon-bedrock',
      modelId: MODEL_ID,
      region: REGION,
      category,
    })}\n`,
  );
  process.exit(1);
}

function categorizeError(error) {
  const name =
    error && typeof error === 'object' && 'name' in error && typeof error.name === 'string'
      ? error.name
      : '';
  const status =
    error && typeof error === 'object' && '$metadata' in error
      ? Number(error.$metadata?.httpStatusCode ?? NaN)
      : NaN;
  const message = error instanceof Error ? error.message : '';

  if (/credential|expired token|could not load|unable to locate/i.test(`${name} ${message}`)) {
    return 'AUTHENTICATION';
  }
  if (name === 'AccessDeniedException' || name === 'UnauthorizedException' || status === 401 || status === 403) {
    return 'ACCESS_DENIED';
  }
  if (name === 'ThrottlingException' || name === 'TooManyRequestsException' || status === 429) {
    return 'THROTTLED';
  }
  if (/timeout|abort/i.test(`${name} ${message}`)) {
    return 'TIMEOUT';
  }
  if (
    name === 'ServiceUnavailableException' ||
    name === 'InternalServerException' ||
    name === 'ModelNotReadyException' ||
    name === 'ResourceNotFoundException' ||
    status === 500 ||
    status === 502 ||
    status === 503
  ) {
    return 'MODEL_UNAVAILABLE';
  }
  if (name === 'ValidationException' || name === 'ModelErrorException' || status === 400) {
    return 'INVALID_REQUEST';
  }
  return 'UNKNOWN';
}

if (process.env.RUN_PHASE7_BEDROCK_PREFLIGHT !== 'true') {
  console.error(
    'Phase 7 Bedrock preflight is disabled. Set RUN_PHASE7_BEDROCK_PREFLIGHT=true only after explicit approval.',
  );
  process.exit(1);
}

const client = new BedrockRuntimeClient({ region: REGION, maxAttempts: 1 });
const started = Date.now();
let response;

try {
  response = await client.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      system: [
        {
          text: 'Return exactly one JSON object. Do not use markdown. This is a synthetic connectivity test and must not call tools or claim any external action.',
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            {
              text: 'Return {"status":"ok","proposalOnly":true,"modelTask":"structured-reasoning-connectivity"}.',
            },
          ],
        },
      ],
      inferenceConfig: { maxTokens: 128, temperature: 0, topP: 0.1 },
    }),
  );
} catch (error) {
  fail(categorizeError(error));
}

const latencyMs = Date.now() - started;
const content = response?.output?.message?.content ?? [];
const text = content
  .map((block) => (block && typeof block === 'object' && typeof block.text === 'string' ? block.text : ''))
  .join('')
  .trim()
  .replace(/^```(?:json)?\s*/i, '')
  .replace(/\s*```$/i, '');

let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  fail('INVALID_RESPONSE');
}

if (
  !parsed ||
  parsed.status !== 'ok' ||
  parsed.proposalOnly !== true ||
  parsed.modelTask !== 'structured-reasoning-connectivity'
) {
  fail('INVALID_RESPONSE');
}

process.stdout.write(
  `${JSON.stringify({
    status: 'success',
    provider: 'amazon-bedrock',
    modelId: MODEL_ID,
    region: REGION,
    proposalOnly: true,
    inputTokens: response?.usage?.inputTokens ?? null,
    outputTokens: response?.usage?.outputTokens ?? null,
    latencyMs,
    calls: 1,
    writes: 0,
  })}\n`,
);
process.exit(0);
