#!/usr/bin/env node
/**
 * Gated live Bedrock preflight.
 * Do not call from test/build/CI.
 * Requires RUN_LIVE_BEDROCK_PREFLIGHT=true and explicit approval.
 * Executes exactly one InvokeModel call with maxAttempts=1 and no application retry.
 */
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const MODEL_ID = 'amazon.titan-embed-text-v2:0';
const REGION = 'us-west-2';
const DIMENSIONS = 1024;
const INPUT_TEXT = 'QuestorOS Memory Phase 4 Bedrock connectivity test.';

function fail(category) {
  process.stdout.write(
    `${JSON.stringify({
      status: 'failure',
      modelId: MODEL_ID,
      region: REGION,
      category,
    })}\n`,
  );
  process.exit(1);
}

function isFiniteNumberArray(value, length) {
  if (!Array.isArray(value) || value.length !== length) {
    return false;
  }
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      return false;
    }
  }
  return true;
}

function arraysEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function categorizeError(error) {
  const name =
    error && typeof error === 'object' && 'name' in error && typeof error.name === 'string'
      ? error.name
      : '';
  const httpStatus =
    error && typeof error === 'object' && '$metadata' in error
      ? Number(error.$metadata?.httpStatusCode ?? NaN)
      : NaN;
  const message = error instanceof Error ? error.message : '';

  if (
    name === 'CredentialsProviderError' ||
    name === 'ExpiredTokenException' ||
    name === 'UnrecognizedClientException' ||
    /credential|expired token|could not load|unable to locate/i.test(message)
  ) {
    return 'AUTHENTICATION';
  }
  if (
    name === 'AccessDeniedException' ||
    name === 'UnauthorizedException' ||
    httpStatus === 401 ||
    httpStatus === 403
  ) {
    return 'ACCESS_DENIED';
  }
  if (name === 'ThrottlingException' || name === 'TooManyRequestsException' || httpStatus === 429) {
    return 'THROTTLED';
  }
  if (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    name === 'RequestTimeout' ||
    name === 'TimeoutException' ||
    /timed out|timeout/i.test(message)
  ) {
    return 'TIMEOUT';
  }
  if (
    name === 'ServiceUnavailableException' ||
    name === 'InternalServerException' ||
    name === 'ModelNotReadyException' ||
    name === 'ResourceNotFoundException' ||
    httpStatus === 500 ||
    httpStatus === 502 ||
    httpStatus === 503
  ) {
    return 'MODEL_UNAVAILABLE';
  }
  if (
    name === 'ValidationException' ||
    name === 'ModelErrorException' ||
    name === 'SyntaxError' ||
    httpStatus === 400
  ) {
    return 'INVALID_RESPONSE';
  }
  if (
    name === 'NetworkingError' ||
    name === 'ENOTFOUND' ||
    name === 'ECONNREFUSED' ||
    name === 'ECONNRESET' ||
    /network|ENOTFOUND|ECONNREFUSED|ECONNRESET/i.test(`${name} ${message}`)
  ) {
    return 'NETWORK';
  }
  return 'UNKNOWN';
}

if (process.env.RUN_LIVE_BEDROCK_PREFLIGHT !== 'true') {
  console.error(
    'Live Bedrock preflight is disabled. Set RUN_LIVE_BEDROCK_PREFLIGHT=true only after approval.',
  );
  process.exit(1);
}

const client = new BedrockRuntimeClient({
  region: REGION,
  maxAttempts: 1,
});

const body = {
  inputText: INPUT_TEXT,
  dimensions: DIMENSIONS,
  normalize: true,
  embeddingTypes: ['float'],
};

const started = Date.now();

let response;
try {
  response = await client.send(
    new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(JSON.stringify(body)),
    }),
  );
} catch (error) {
  fail(categorizeError(error));
}

const latencyMs = Date.now() - started;

if (!response?.body) {
  fail('INVALID_RESPONSE');
}

let parsed;
try {
  parsed = JSON.parse(new TextDecoder().decode(response.body));
} catch {
  fail('INVALID_RESPONSE');
}

if (!parsed || typeof parsed !== 'object') {
  fail('INVALID_RESPONSE');
}

const record = parsed;
const canonical = record.embedding;
const byType =
  record.embeddingsByType && typeof record.embeddingsByType === 'object'
    ? record.embeddingsByType.float
    : undefined;

if (!isFiniteNumberArray(canonical, DIMENSIONS)) {
  fail('INVALID_RESPONSE');
}

if (byType !== undefined) {
  if (!isFiniteNumberArray(byType, DIMENSIONS)) {
    fail('INVALID_RESPONSE');
  }
  if (!arraysEqual(canonical, byType)) {
    fail('INVALID_RESPONSE');
  }
}

const tokenRaw = record.inputTextTokenCount;
if (typeof tokenRaw !== 'number' || !Number.isInteger(tokenRaw) || tokenRaw < 0) {
  fail('INVALID_RESPONSE');
}

process.stdout.write(
  `${JSON.stringify({
    status: 'success',
    provider: 'amazon-bedrock',
    modelId: MODEL_ID,
    region: REGION,
    dimensions: DIMENSIONS,
    normalized: true,
    embeddingType: 'float',
    inputTextTokenCount: tokenRaw,
    latencyMs,
    vectorValidated: true,
  })}\n`,
);
process.exit(0);
