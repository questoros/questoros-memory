#!/usr/bin/env node
/**
 * Gated live Phase 8 smoke for the deployed read-only remote MCP endpoint.
 *
 * This script performs no writes. It validates authentication, origin denial,
 * the immutable tool allowlist, whoami, scoped list/search/get/history reads,
 * non-allowlisted write blocking, and an unchanged authoritative memory set.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const EXPECTED_TOOLS = [
  'questoros_memory_whoami',
  'questoros_memory_get',
  'questoros_memory_list',
  'questoros_memory_search',
  'questoros_memory_history',
];

if (process.env.RUN_PHASE8_REMOTE_MCP_SMOKE !== 'true') {
  console.error(
    'Phase 8 remote MCP smoke is blocked. Set RUN_PHASE8_REMOTE_MCP_SMOKE=true only after explicit deployment approval.',
  );
  process.exit(1);
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function findRepoEnv(startDirectory) {
  let current = path.resolve(startDirectory);
  for (let depth = 0; depth < 7; depth += 1) {
    const candidate = path.join(current, '.env');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function loadApiKey() {
  const explicit = process.env.QUESTOROS_MEMORY_STAGING_API_KEY?.trim();
  if (explicit) return explicit;

  const envPath = findRepoEnv(process.cwd());
  if (!envPath) return null;

  const matches = new Set();
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const value = stripQuotes(line.slice(separator + 1));
    if (value.startsWith('qmem_live_')) matches.add(value);
  }

  if (matches.size === 1) return [...matches][0];
  if (matches.size > 1) {
    console.error(
      'Multiple local qmem_live_ keys were found. Set QUESTOROS_MEMORY_STAGING_API_KEY explicitly for this run.',
    );
    process.exit(1);
  }
  return null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function contentTexts(result) {
  const record = asRecord(result);
  const content = Array.isArray(record.content) ? record.content : [];
  return content
    .map(asRecord)
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text);
}

function parseJsonTextResult(result) {
  for (const text of contentTexts(result)) {
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) continue;
    try {
      return JSON.parse(trimmed);
    } catch {
      // Continue until a valid JSON text content block is found.
    }
  }
  throw new Error('MCP tool result did not include a valid JSON text block.');
}

function scopeArguments(identity, limit = 100) {
  const scope = asRecord(identity.credentialScope);
  const scopeType = String(scope.scopeType ?? '');
  assert(['TENANT', 'WORKSPACE', 'PROJECT'].includes(scopeType), 'Credential scope is invalid.');
  const args = { scopeType, limit };
  if (scope.workspaceId) args.workspaceId = String(scope.workspaceId);
  if (scope.projectId) args.projectId = String(scope.projectId);
  if (scopeType === 'WORKSPACE') {
    assert(typeof args.workspaceId === 'string', 'Workspace credential is missing workspaceId.');
  }
  if (scopeType === 'PROJECT') {
    assert(
      typeof args.workspaceId === 'string' && typeof args.projectId === 'string',
      'Project credential is missing workspaceId or projectId.',
    );
  }
  return args;
}

function memoryItems(listPayload) {
  const payload = asRecord(listPayload);
  return Array.isArray(payload.items) ? payload.items.map(asRecord) : [];
}

function sortedIds(items) {
  return items
    .map((item) => String(item.id ?? ''))
    .filter(Boolean)
    .sort();
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertItemsWithinCredentialScope(items, identity) {
  const scope = asRecord(identity.credentialScope);
  const scopeType = String(scope.scopeType ?? '');
  for (const item of items) {
    if (scopeType === 'PROJECT') {
      assert(
        String(item.projectId ?? '') === String(scope.projectId ?? ''),
        'Remote MCP list returned a memory outside the project credential scope.',
      );
      assert(
        String(item.workspaceId ?? '') === String(scope.workspaceId ?? ''),
        'Remote MCP list returned a memory outside the project workspace.',
      );
    } else if (scopeType === 'WORKSPACE') {
      assert(
        String(item.workspaceId ?? '') === String(scope.workspaceId ?? ''),
        'Remote MCP list returned a memory outside the workspace credential scope.',
      );
    }
  }
}

async function rawInitialize(endpoint, headers = {}) {
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'phase8-live-smoke', version: '1.0.0' },
      },
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
}

const endpointValue = process.env.QUESTOROS_MEMORY_REMOTE_MCP_URL?.trim();
const apiKey = loadApiKey();
if (!endpointValue || !apiKey) {
  console.error(
    'QUESTOROS_MEMORY_REMOTE_MCP_URL and the private staging API key are required. The key may auto-load from .env when exactly one qmem_live_ value exists.',
  );
  process.exit(1);
}

let endpoint;
try {
  endpoint = new URL(endpointValue);
} catch {
  console.error('The remote MCP URL is invalid.');
  process.exit(1);
}

if (
  endpoint.protocol !== 'https:' ||
  !endpoint.hostname.endsWith('.execute-api.ap-southeast-1.amazonaws.com') ||
  !endpoint.pathname.replace(/\/+$/, '').endsWith('/staging/mcp')
) {
  console.error('The smoke requires the approved HTTPS Phase 8 staging MCP endpoint.');
  process.exit(1);
}

const requestId = `phase8-mcp-smoke-${randomUUID()}`;
let client;

try {
  const unauthenticated = await rawInitialize(endpoint, { 'x-request-id': requestId });
  assert(unauthenticated.status === 401, 'Unauthenticated MCP initialization was not rejected.');
  assert(
    unauthenticated.headers.get('cache-control') === 'no-store',
    'Unauthenticated response is missing Cache-Control: no-store.',
  );
  assert(
    unauthenticated.headers.get('x-content-type-options') === 'nosniff',
    'Unauthenticated response is missing X-Content-Type-Options: nosniff.',
  );
  assert(
    unauthenticated.headers.get('x-request-id') === requestId,
    'Unauthenticated response did not preserve the sanitized request ID.',
  );
  const unauthenticatedPayload = asRecord(await unauthenticated.json());
  assert(
    asRecord(asRecord(unauthenticatedPayload.error).data).code === 'AUTH_REQUIRED',
    'Unauthenticated MCP response did not return AUTH_REQUIRED.',
  );

  const deniedOrigin = await rawInitialize(endpoint, {
    authorization: `Bearer ${apiKey}`,
    origin: 'https://unapproved.phase8.invalid',
    'x-request-id': `${requestId}-origin`,
  });
  assert(deniedOrigin.status === 403, 'Unapproved browser origin was not rejected.');
  const deniedOriginPayload = asRecord(await deniedOrigin.json());
  assert(
    asRecord(asRecord(deniedOriginPayload.error).data).code === 'MCP_ORIGIN_DENIED',
    'Origin rejection did not return MCP_ORIGIN_DENIED.',
  );

  client = new Client({ name: 'phase8-live-staging-smoke', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: {
      headers: {
        authorization: `Bearer ${apiKey}`,
        'x-request-id': requestId,
      },
    },
  });
  await client.connect(transport);

  const listedTools = await client.listTools();
  const toolNames = listedTools.tools.map((tool) => tool.name);
  assert(
    sameStrings(toolNames, EXPECTED_TOOLS),
    `Remote MCP tool allowlist mismatch: ${toolNames.join(', ')}`,
  );

  const whoamiResult = await client.callTool({
    name: 'questoros_memory_whoami',
    arguments: {},
  });
  assert(whoamiResult.isError !== true, 'Remote MCP whoami returned an error.');
  const identity = asRecord(parseJsonTextResult(whoamiResult));
  assert(typeof identity.tenantId === 'string', 'Remote MCP whoami omitted tenantId.');
  assert(typeof identity.actorId === 'string', 'Remote MCP whoami omitted actorId.');

  const listArgs = scopeArguments(identity);
  const beforeListResult = await client.callTool({
    name: 'questoros_memory_list',
    arguments: listArgs,
  });
  assert(beforeListResult.isError !== true, 'Remote MCP list returned an error.');
  const beforePayload = parseJsonTextResult(beforeListResult);
  const beforeItems = memoryItems(beforePayload);
  assertItemsWithinCredentialScope(beforeItems, identity);
  const beforeIds = sortedIds(beforeItems);

  const searchResult = await client.callTool({
    name: 'questoros_memory_search',
    arguments: {
      ...scopeArguments(identity, 10),
      queryText: 'Phase',
    },
  });
  assert(searchResult.isError !== true, 'Remote MCP search returned an error.');
  const searchPayload = parseJsonTextResult(searchResult);
  assert(Array.isArray(searchPayload), 'Remote MCP search did not return a result array.');

  let getChecked = false;
  let historyChecked = false;
  if (beforeItems.length > 0) {
    const memoryId = String(beforeItems[0].id ?? '');
    assert(memoryId.length > 0, 'Listed memory did not include an ID.');

    const getResult = await client.callTool({
      name: 'questoros_memory_get',
      arguments: { memoryId },
    });
    assert(getResult.isError !== true, 'Remote MCP get returned an error.');
    const fetched = asRecord(parseJsonTextResult(getResult));
    assert(String(fetched.id ?? '') === memoryId, 'Remote MCP get returned the wrong memory.');
    getChecked = true;

    const historyResult = await client.callTool({
      name: 'questoros_memory_history',
      arguments: { memoryId },
    });
    assert(historyResult.isError !== true, 'Remote MCP history returned an error.');
    const history = parseJsonTextResult(historyResult);
    assert(Array.isArray(history), 'Remote MCP history did not return an array.');
    historyChecked = true;
  }

  let writeToolBlocked = false;
  try {
    const createResult = await client.callTool({
      name: 'questoros_memory_create',
      arguments: {
        scopeType: listArgs.scopeType,
        ...(listArgs.workspaceId ? { workspaceId: listArgs.workspaceId } : {}),
        ...(listArgs.projectId ? { projectId: listArgs.projectId } : {}),
        memoryType: 'FACT',
        content: 'This write must remain blocked.',
      },
    });
    writeToolBlocked = createResult.isError === true;
  } catch {
    writeToolBlocked = true;
  }
  assert(writeToolBlocked, 'A non-allowlisted remote create tool was not blocked.');

  const afterListResult = await client.callTool({
    name: 'questoros_memory_list',
    arguments: listArgs,
  });
  assert(afterListResult.isError !== true, 'Final remote MCP list returned an error.');
  const afterItems = memoryItems(parseJsonTextResult(afterListResult));
  assertItemsWithinCredentialScope(afterItems, identity);
  const afterIds = sortedIds(afterItems);
  assert(
    sameStrings(beforeIds, afterIds),
    'Authoritative memory set changed during the read-only remote MCP smoke.',
  );

  process.stdout.write(
    `${JSON.stringify({
      status: 'success',
      test: 'phase8-remote-mcp-staging-smoke',
      endpoint: `${endpoint.origin}${endpoint.pathname}`,
      transport: 'streamable-http-stateless',
      authenticated: true,
      toolNames,
      toolCount: toolNames.length,
      credentialScope: asRecord(identity.credentialScope).scopeType,
      listedMemoryCount: beforeItems.length,
      searchResultCount: searchPayload.length,
      getChecked,
      historyChecked,
      unauthenticatedRejected: true,
      unapprovedOriginRejected: true,
      nonAllowlistedWriteBlocked: true,
      authoritativeMemoryWrites: 0,
      authoritativeMemorySetUnchanged: true,
      requestId,
    })}\n`,
  );
} catch (error) {
  const message =
    error instanceof Error
      ? error.message.replace(/qmem_live_[A-Za-z0-9_-]+/g, '[REDACTED]').slice(0, 500)
      : 'Unknown remote MCP smoke failure.';
  process.stdout.write(
    `${JSON.stringify({
      status: 'failure',
      test: 'phase8-remote-mcp-staging-smoke',
      category: 'VALIDATION',
      message,
      requestId,
    })}\n`,
  );
  process.exitCode = 1;
} finally {
  if (client) await client.close().catch(() => undefined);
}
