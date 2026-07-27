import fs from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { disconnectDatabaseClient, getDatabaseClient } from '@questoros-memory/database';
import { generateApiKey, hashApiKey } from '@questoros-memory/memory-core';

const GATE = 'RUN_PHASE8_JUDGE_ACCESS';
const APPROVED_API_URL =
  'https://blrt2ds22f.execute-api.ap-southeast-1.amazonaws.com/staging';
const APPROVED_MCP_URL = `${APPROVED_API_URL}/mcp`;
const JUDGE_KEY_EXPIRY = '2026-09-22T23:59:59.000Z';
const EXPECTED_TOOLS = [
  'questoros_memory_whoami',
  'questoros_memory_get',
  'questoros_memory_list',
  'questoros_memory_search',
  'questoros_memory_history',
];

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, '../../..');
const acceptanceDirectory = path.join(repoRoot, '.acceptance');
const statePath = path.join(acceptanceDirectory, 'phase8-judge-state.json');
const privateInstructionsPath = path.join(
  acceptanceDirectory,
  'phase8-judge-private-instructions.txt',
);
const publicReportPath = path.join(acceptanceDirectory, 'phase8-judge-public-report.md');
const mode = (process.argv[2] ?? 'provision').toLowerCase();
const validModes = new Set(['provision', 'verify', 'cleanup']);

type FixturePhase = 'MEMORY_CREATED' | 'KEY_CREATED' | 'VERIFIED';

interface ProjectScope {
  scopeType: 'PROJECT';
  scopeId: string;
  workspaceId: string;
  projectId: string;
}

interface JudgeState {
  version: 1;
  phase: FixturePhase;
  createdAt: string;
  marker: string;
  apiUrl: string;
  mcpUrl: string;
  tenantId: string;
  adminActorId: string;
  scope: ProjectScope;
  beforeMemoryIds: string[];
  memoryId: string;
  initialContent: string;
  correctedContent: string;
  requestIds: {
    create: string;
    correction: string;
    deletion: string;
  };
  judgeActorId?: string;
  judgeApiKeyId?: string;
  judgeKeyPrefix?: string;
  expiresAt?: string;
}

interface HttpFailureDetails {
  status: number;
  code?: string;
  requestId?: string;
}

class HttpFailure extends Error {
  readonly details: HttpFailureDetails;

  constructor(message: string, details: HttpFailureDetails) {
    super(message);
    this.name = 'HttpFailure';
    this.details = details;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadLocalEnv(): Map<string, string> {
  const values = new Map<string, string>();
  const envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) return values;

  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    values.set(line.slice(0, separator).trim(), stripQuotes(line.slice(separator + 1)));
  }
  return values;
}

function configureDatabaseUrl(localEnv: Map<string, string>): void {
  if (process.env.DATABASE_URL?.trim()) return;
  const databaseUrl = localEnv.get('DATABASE_URL')?.trim();
  assert(databaseUrl, 'DATABASE_URL is required in the ignored local .env.');
  process.env.DATABASE_URL = databaseUrl;
}

function loadAdminApiKey(localEnv: Map<string, string>): string {
  const explicit = process.env.QUESTOROS_MEMORY_STAGING_API_KEY?.trim();
  if (explicit) return explicit;

  const matches = new Set<string>();
  for (const value of localEnv.values()) {
    if (value.startsWith('qmem_live_')) matches.add(value);
  }

  assert(
    matches.size === 1,
    matches.size > 1
      ? 'Multiple qmem_live_ values exist. Set QUESTOROS_MEMORY_STAGING_API_KEY explicitly.'
      : 'No private staging API key was found in the ignored local .env.',
  );
  return [...matches][0];
}

function validateEndpoint(value: string, expected: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} is invalid.`);
  }
  assert(parsed.toString().replace(/\/$/, '') === expected, `${label} must be ${expected}.`);
  return expected;
}

function sanitize(value: string): string {
  return value
    .replace(/qmem_live_[A-Za-z0-9_-]+/g, '[REDACTED_API_KEY]')
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]');
}

function sameStrings(left: string[], right: string[]): boolean {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function contentTexts(result: unknown): string[] {
  const content = asRecord(result).content;
  return Array.isArray(content)
    ? content
        .map(asRecord)
        .filter((item) => item.type === 'text' && typeof item.text === 'string')
        .map((item) => String(item.text))
    : [];
}

function parseMcpJson(result: unknown): unknown {
  for (const text of contentTexts(result)) {
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) continue;
    try {
      return JSON.parse(trimmed);
    } catch {
      // Continue until a valid JSON content block is found.
    }
  }
  throw new Error('MCP result did not contain a valid JSON content block.');
}

async function writeState(state: JudgeState): Promise<void> {
  await mkdir(acceptanceDirectory, { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

async function readState(): Promise<JudgeState> {
  const parsed = JSON.parse(await readFile(statePath, 'utf8')) as JudgeState;
  assert(parsed.version === 1, 'Unsupported judge fixture state version.');
  return parsed;
}

function createHttpClient(apiUrl: string, apiKey: string) {
  return async function request(
    route: string,
    options: { method?: string; body?: unknown; requestId: string },
  ): Promise<unknown> {
    const response = await fetch(`${apiUrl}${route}`, {
      method: options.method ?? 'GET',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'x-request-id': options.requestId,
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: 'error',
      signal: AbortSignal.timeout(45_000),
    });

    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
      const error = asRecord(asRecord(payload).error);
      throw new HttpFailure('Staging REST request failed.', {
        status: response.status,
        code: typeof error.code === 'string' ? error.code : undefined,
        requestId:
          typeof error.requestId === 'string'
            ? error.requestId
            : (response.headers.get('x-request-id') ?? undefined),
      });
    }
    return payload;
  };
}

async function connectMcp(apiKey: string, name: string): Promise<Client> {
  const client = new Client({ name, version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(APPROVED_MCP_URL), {
    requestInit: {
      headers: {
        authorization: `Bearer ${apiKey}`,
        'x-request-id': `phase8-judge-mcp-${randomUUID()}`,
      },
    },
  });
  await client.connect(transport);
  return client;
}

async function activeMemoryIds(tenantId: string, projectId: string): Promise<string[]> {
  const prisma = getDatabaseClient();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM memories
    WHERE tenant_id = ${tenantId}::uuid
      AND project_id = ${projectId}::uuid
      AND status = 'ACTIVE'
    ORDER BY id
  `;
  return rows.map((row) => row.id).sort();
}

async function verifyDatabaseTenant(tenantId: string): Promise<void> {
  const prisma = getDatabaseClient();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM tenants WHERE id = ${tenantId}::uuid LIMIT 1
  `;
  assert(rows.length === 1, 'Local DATABASE_URL does not contain the staging tenant.');
}

async function createJudgeActorAndKey(
  state: JudgeState,
): Promise<{ actorId: string; apiKeyId: string; rawKey: string; prefix: string }> {
  const prisma = getDatabaseClient();
  const generated = generateApiKey();
  const keyHash = hashApiKey(generated.raw);
  const externalId = `devpost-phase8-judge-${state.marker}`;

  const actors = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO actors (
      tenant_id,
      external_id,
      actor_type,
      display_name,
      metadata
    )
    VALUES (
      ${state.tenantId}::uuid,
      ${externalId},
      'SERVICE',
      'Devpost Phase 8 Judge Reader',
      ${JSON.stringify({ synthetic: true, fixture: 'phase8e-judge', marker: state.marker })}::jsonb
    )
    RETURNING id
  `;
  assert(actors.length === 1, 'Judge actor was not created.');
  const actorId = actors[0].id;

  const keyRows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO api_keys (
      tenant_id,
      actor_id,
      name,
      key_prefix,
      key_hash,
      scope_type,
      scope_id,
      workspace_id,
      project_id,
      permissions,
      expires_at
    )
    VALUES (
      ${state.tenantId}::uuid,
      ${actorId}::uuid,
      'Devpost Phase 8 Judge Read-Only',
      ${generated.prefix},
      ${keyHash},
      'PROJECT',
      ${state.scope.projectId}::uuid,
      ${state.scope.workspaceId}::uuid,
      ${state.scope.projectId}::uuid,
      ${JSON.stringify(['memory:read'])}::jsonb,
      ${new Date(JUDGE_KEY_EXPIRY)}
    )
    RETURNING id
  `;
  assert(keyRows.length === 1, 'Judge API key was not created.');

  return {
    actorId,
    apiKeyId: keyRows[0].id,
    rawKey: generated.raw,
    prefix: generated.prefix,
  };
}

async function verifyJudgeAccess(state: JudgeState, judgeKey: string): Promise<void> {
  const client = await connectMcp(judgeKey, 'phase8-devpost-judge-verification');
  try {
    const tools = await client.listTools();
    assert(
      sameStrings(
        tools.tools.map((tool) => tool.name),
        EXPECTED_TOOLS,
      ),
      'Remote judge tool catalog differs from the exact read-only allowlist.',
    );

    const whoamiResult = await client.callTool({
      name: 'questoros_memory_whoami',
      arguments: {},
    });
    assert(whoamiResult.isError !== true, 'Judge whoami failed.');
    const identity = asRecord(parseMcpJson(whoamiResult));
    const permissions = Array.isArray(identity.permissions) ? identity.permissions.map(String) : [];
    assert(
      sameStrings(permissions, ['memory:read']),
      'Judge credential is not restricted to memory:read.',
    );
    assert(
      asRecord(identity.credentialScope).projectId === state.scope.projectId,
      'Judge credential project scope is incorrect.',
    );

    const listResult = await client.callTool({
      name: 'questoros_memory_list',
      arguments: {
        scopeType: 'PROJECT',
        workspaceId: state.scope.workspaceId,
        projectId: state.scope.projectId,
        limit: 20,
      },
    });
    assert(listResult.isError !== true, 'Judge list failed.');
    const listPayload = asRecord(parseMcpJson(listResult));
    const items = Array.isArray(listPayload.items) ? listPayload.items.map(asRecord) : [];
    assert(
      items.some((memory) => String(memory.id ?? '') === state.memoryId),
      'Judge fixture was not returned by list.',
    );

    const searchResult = await client.callTool({
      name: 'questoros_memory_search',
      arguments: {
        scopeType: 'PROJECT',
        workspaceId: state.scope.workspaceId,
        projectId: state.scope.projectId,
        queryText: 'Harborview continuity milestone',
        limit: 10,
      },
    });
    assert(searchResult.isError !== true, 'Judge search failed.');
    const searchPayload = parseMcpJson(searchResult);
    assert(Array.isArray(searchPayload), 'Judge search did not return an array.');
    assert(
      searchPayload
        .map(asRecord)
        .some((entry) => String(asRecord(entry.memory).id ?? '') === state.memoryId),
      'Judge fixture was not returned by search.',
    );

    const getResult = await client.callTool({
      name: 'questoros_memory_get',
      arguments: { memoryId: state.memoryId },
    });
    assert(getResult.isError !== true, 'Judge get failed.');
    assert(
      asRecord(parseMcpJson(getResult)).content === state.correctedContent,
      'Judge get did not return corrected content.',
    );

    const historyResult = await client.callTool({
      name: 'questoros_memory_history',
      arguments: { memoryId: state.memoryId },
    });
    assert(historyResult.isError !== true, 'Judge history failed.');
    const history = parseMcpJson(historyResult);
    assert(Array.isArray(history) && history.length === 2, 'Judge history must contain two revisions.');

    const crossProjectResult = await client.callTool({
      name: 'questoros_memory_list',
      arguments: {
        scopeType: 'PROJECT',
        workspaceId: state.scope.workspaceId,
        projectId: randomUUID(),
        limit: 10,
      },
    });
    assert(
      crossProjectResult.isError === true &&
        contentTexts(crossProjectResult).some((text) => text.includes('SCOPE_DENIED')),
      'Judge key was not denied for another project.',
    );

    let writeBlocked = false;
    try {
      const writeResult = await client.callTool({
        name: 'questoros_memory_create',
        arguments: {
          scopeType: 'PROJECT',
          workspaceId: state.scope.workspaceId,
          projectId: state.scope.projectId,
          memoryType: 'FACT',
          content: 'This write must remain unavailable.',
        },
      });
      writeBlocked = writeResult.isError === true;
    } catch {
      writeBlocked = true;
    }
    assert(writeBlocked, 'A non-allowlisted judge write was not blocked.');
  } finally {
    await client.close();
  }
}

function privateInstructions(state: JudgeState, rawKey: string): string {
  return [
    'QuestorOS Memory — Private Devpost Judge Instructions',
    '',
    `Transport: MCP Streamable HTTP`,
    `Endpoint: ${state.mcpUrl}`,
    `Authorization: Bearer ${rawKey}`,
    `Credential scope: PROJECT`,
    `Permissions: memory:read only`,
    `Synthetic fixture memory ID: ${state.memoryId}`,
    `Credential expiry: ${state.expiresAt}`,
    '',
    'Expected tools:',
    ...EXPECTED_TOOLS.map((tool) => `- ${tool}`),
    '',
    'Suggested search query: Harborview continuity milestone',
    '',
    'The credential cannot create, correct, delete, harvest, approve, reject, publish, administer, execute SQL, or access another project.',
    'Do not publish this key or include it in screenshots, recordings, issues, or repository files.',
    '',
  ].join('\n');
}

function publicReport(state: JudgeState): string {
  return [
    '# Phase 8E Judge Fixture Provisioning',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Marker: ${state.marker}`,
    `Credential scope: PROJECT`,
    `Permissions: memory:read only`,
    `Synthetic fixture memory ID: ${state.memoryId}`,
    `Revision count: 2`,
    `Remote tool count: 5`,
    `Credential expiry: ${state.expiresAt}`,
    '',
    'Verified:',
    '',
    '- official MCP client connection;',
    '- exact five-tool read-only catalog;',
    '- project-scoped identity;',
    '- list, explainable search, get, and history;',
    '- corrected persistent content;',
    '- immutable revisions 1 and 2;',
    '- cross-project denial;',
    '- non-allowlisted write denial; and',
    '- no private API key or database URL in this report.',
    '',
  ].join('\n');
}

function copyToClipboard(value: string): boolean {
  if (process.platform !== 'win32') return false;
  const result = spawnSync('clip.exe', [], {
    input: value,
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0;
}

async function provision(adminKey: string): Promise<void> {
  assert(!fs.existsSync(statePath), 'Judge fixture state already exists. Run cleanup first.');
  assert(
    !fs.existsSync(privateInstructionsPath),
    'Private judge instructions already exist. Run cleanup first.',
  );

  const requestIds = {
    create: `phase8-judge-create-${randomUUID()}`,
    correction: `phase8-judge-correct-${randomUUID()}`,
    deletion: `phase8-judge-delete-${randomUUID()}`,
  };
  const request = createHttpClient(APPROVED_API_URL, adminKey);
  const identity = asRecord(await request('/v1/whoami', { requestId: requestIds.create }));
  const scopeRecord = asRecord(identity.credentialScope);
  const permissions = Array.isArray(identity.permissions) ? identity.permissions.map(String) : [];
  const requiredPermissions = ['memory:read', 'memory:write', 'memory:correct', 'memory:delete'];
  assert(
    requiredPermissions.every(
      (permission) => permissions.includes(permission) || permissions.includes('memory:admin'),
    ),
    `Provisioning key needs: ${requiredPermissions.join(', ')}.`,
  );
  assert(scopeRecord.scopeType === 'PROJECT', 'Provisioning requires the project-scoped key.');
  assert(
    typeof identity.tenantId === 'string' && typeof identity.actorId === 'string',
    'whoami omitted tenant or actor identity.',
  );
  assert(
    typeof scopeRecord.scopeId === 'string' &&
      typeof scopeRecord.workspaceId === 'string' &&
      typeof scopeRecord.projectId === 'string',
    'Project credential scope is incomplete.',
  );

  const scope: ProjectScope = {
    scopeType: 'PROJECT',
    scopeId: scopeRecord.scopeId,
    workspaceId: scopeRecord.workspaceId,
    projectId: scopeRecord.projectId,
  };
  await verifyDatabaseTenant(identity.tenantId);
  const beforeMemoryIds = await activeMemoryIds(identity.tenantId, scope.projectId);
  const marker = randomUUID();
  const initialContent = [
    `Synthetic Phase 8E judge fixture marker ${marker}.`,
    'The Harborview continuity milestone is July 15, 2026.',
    'This record contains no customer or private QuestorOS data.',
  ].join(' ');
  const correctedContent = [
    `Synthetic Phase 8E judge fixture marker ${marker}.`,
    'The Harborview continuity milestone is August 20, 2026.',
    'This record contains no customer or private QuestorOS data.',
  ].join(' ');

  const created = asRecord(
    await request('/v1/memories', {
      method: 'POST',
      requestId: requestIds.create,
      body: {
        scopeType: 'PROJECT',
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        memoryType: 'FACT',
        title: 'Phase 8E synthetic Harborview judge fixture',
        content: initialContent,
        importance: 0.9,
        confidence: 1,
        sensitivity: 'STANDARD',
        icareStage: 'CONTEXT',
        metadata: {
          synthetic: true,
          fixture: 'phase8e-judge',
          marker,
          provenance: 'authenticated-rest-seed',
        },
      },
    }),
  );
  const memoryId = String(created.id ?? '');
  assert(memoryId, 'Judge fixture creation did not return a memory ID.');

  let state: JudgeState = {
    version: 1,
    phase: 'MEMORY_CREATED',
    createdAt: new Date().toISOString(),
    marker,
    apiUrl: APPROVED_API_URL,
    mcpUrl: APPROVED_MCP_URL,
    tenantId: identity.tenantId,
    adminActorId: identity.actorId,
    scope,
    beforeMemoryIds,
    memoryId,
    initialContent,
    correctedContent,
    requestIds,
  };
  await writeState(state);

  const correction = asRecord(
    await request(`/v1/memories/${memoryId}/corrections`, {
      method: 'POST',
      requestId: requestIds.correction,
      body: {
        content: correctedContent,
        reason: 'Synthetic Phase 8E correction for judge revision-history verification.',
        icareStage: 'RECOMMENDATION_EVALUATION',
        metadata: {
          synthetic: true,
          fixture: 'phase8e-judge',
          marker,
          provenance: 'authenticated-rest-correction',
        },
      },
    }),
  );
  assert(Number(correction.revisionNumber) === 2, 'Judge correction did not create revision 2.');

  const judge = await createJudgeActorAndKey(state);
  state = {
    ...state,
    phase: 'KEY_CREATED',
    judgeActorId: judge.actorId,
    judgeApiKeyId: judge.apiKeyId,
    judgeKeyPrefix: judge.prefix,
    expiresAt: JUDGE_KEY_EXPIRY,
  };
  await writeState(state);

  await verifyJudgeAccess(state, judge.rawKey);
  state = { ...state, phase: 'VERIFIED' };
  await writeState(state);

  await mkdir(acceptanceDirectory, { recursive: true });
  const instructions = privateInstructions(state, judge.rawKey);
  await writeFile(privateInstructionsPath, instructions, { encoding: 'utf8', mode: 0o600 });
  await writeFile(publicReportPath, publicReport(state), { encoding: 'utf8', mode: 0o600 });
  const clipboardCopied = copyToClipboard(instructions);

  process.stdout.write(
    `${JSON.stringify({
      status: 'success',
      operation: 'phase8-judge-provision',
      memoryId: state.memoryId,
      keyPrefix: state.judgeKeyPrefix,
      scope: state.scope.scopeType,
      permissions: ['memory:read'],
      revisionCount: 2,
      toolCount: EXPECTED_TOOLS.length,
      expiresAt: state.expiresAt,
      privateInstructionsPath,
      publicReportPath,
      clipboardCopied,
      secretsPrinted: false,
    })}\n`,
  );
}

function readJudgeKeyFromPrivateInstructions(): string {
  const text = fs.readFileSync(privateInstructionsPath, 'utf8');
  const match = /^Authorization: Bearer (qmem_live_[A-Za-z0-9_-]+)$/m.exec(text);
  assert(match?.[1], 'Private judge instructions do not contain a valid key.');
  return match[1];
}

async function verifyExisting(): Promise<void> {
  const state = await readState();
  assert(state.phase === 'VERIFIED', 'Judge fixture has not completed provisioning.');
  const judgeKey =
    process.env.QUESTOROS_MEMORY_JUDGE_API_KEY?.trim() || readJudgeKeyFromPrivateInstructions();
  await verifyJudgeAccess(state, judgeKey);
  process.stdout.write(
    `${JSON.stringify({
      status: 'success',
      operation: 'phase8-judge-verify',
      memoryId: state.memoryId,
      keyPrefix: state.judgeKeyPrefix,
      expiresAt: state.expiresAt,
      revisionCount: 2,
      toolCount: EXPECTED_TOOLS.length,
      secretsPrinted: false,
    })}\n`,
  );
}

async function cleanup(adminKey: string): Promise<void> {
  const state = await readState();
  await verifyDatabaseTenant(state.tenantId);
  const request = createHttpClient(state.apiUrl, adminKey);

  try {
    await request(`/v1/memories/${state.memoryId}`, {
      method: 'DELETE',
      requestId: state.requestIds.deletion,
    });
  } catch (error) {
    if (!(error instanceof HttpFailure) || ![404, 410].includes(error.details.status)) throw error;
  }

  const prisma = getDatabaseClient();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM memory_audit_events
      WHERE tenant_id = ${state.tenantId}::uuid
        AND (
          memory_id = ${state.memoryId}::uuid
          OR request_id IN (
            ${state.requestIds.create},
            ${state.requestIds.correction},
            ${state.requestIds.deletion}
          )
          ${state.judgeActorId ? tx.$queryRaw`OR actor_id = ${state.judgeActorId}::uuid` : tx.$queryRaw``}
        )
    `;
    await tx.$executeRaw`
      DELETE FROM memory_embeddings
      WHERE tenant_id = ${state.tenantId}::uuid
        AND memory_id = ${state.memoryId}::uuid
    `;
    await tx.$executeRaw`
      DELETE FROM memory_revisions
      WHERE tenant_id = ${state.tenantId}::uuid
        AND memory_id = ${state.memoryId}::uuid
    `;
    if (state.judgeApiKeyId) {
      await tx.$executeRaw`
        DELETE FROM api_keys
        WHERE tenant_id = ${state.tenantId}::uuid
          AND id = ${state.judgeApiKeyId}::uuid
      `;
    }
    await tx.$executeRaw`
      DELETE FROM memories
      WHERE tenant_id = ${state.tenantId}::uuid
        AND id = ${state.memoryId}::uuid
    `;
    if (state.judgeActorId) {
      await tx.$executeRaw`
        DELETE FROM actors
        WHERE tenant_id = ${state.tenantId}::uuid
          AND id = ${state.judgeActorId}::uuid
      `;
    }
  });

  const remainingMemory = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM memories
    WHERE tenant_id = ${state.tenantId}::uuid
      AND id = ${state.memoryId}::uuid
  `;
  assert(remainingMemory.length === 0, 'Judge fixture memory still exists after cleanup.');

  if (state.judgeApiKeyId) {
    const remainingKey = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM api_keys
      WHERE tenant_id = ${state.tenantId}::uuid
        AND id = ${state.judgeApiKeyId}::uuid
    `;
    assert(remainingKey.length === 0, 'Judge API key still exists after cleanup.');
  }

  const afterMemoryIds = await activeMemoryIds(state.tenantId, state.scope.projectId);
  assert(
    sameStrings(afterMemoryIds, state.beforeMemoryIds),
    'Original active-memory set was not restored after judge cleanup.',
  );

  await rm(statePath, { force: true });
  await rm(privateInstructionsPath, { force: true });
  await rm(publicReportPath, { force: true });

  process.stdout.write(
    `${JSON.stringify({
      status: 'success',
      operation: 'phase8-judge-cleanup',
      memoryRemoved: true,
      apiKeyRemoved: true,
      judgeActorRemoved: true,
      originalActiveMemorySetRestored: true,
      privateInstructionsRemoved: true,
    })}\n`,
  );
}

async function main(): Promise<void> {
  assert(validModes.has(mode), `Unsupported mode: ${mode}.`);
  assert(
    process.env[GATE] === 'true',
    `Judge fixture operations are blocked. Set ${GATE}=true only for approved staging work.`,
  );

  const apiUrl = validateEndpoint(
    process.env.QUESTOROS_MEMORY_STAGING_URL?.trim() || APPROVED_API_URL,
    APPROVED_API_URL,
    'QUESTOROS_MEMORY_STAGING_URL',
  );
  const mcpUrl = validateEndpoint(
    process.env.QUESTOROS_MEMORY_REMOTE_MCP_URL?.trim() || APPROVED_MCP_URL,
    APPROVED_MCP_URL,
    'QUESTOROS_MEMORY_REMOTE_MCP_URL',
  );
  assert(apiUrl === APPROVED_API_URL && mcpUrl === APPROVED_MCP_URL, 'Endpoint check failed.');

  const localEnv = loadLocalEnv();
  configureDatabaseUrl(localEnv);
  const adminKey = loadAdminApiKey(localEnv);

  if (mode === 'provision') await provision(adminKey);
  if (mode === 'verify') await verifyExisting();
  if (mode === 'cleanup') await cleanup(adminKey);
}

main()
  .catch((error: unknown) => {
    const message = sanitize(error instanceof Error ? error.message : 'Unknown judge fixture failure.');
    process.stdout.write(
      `${JSON.stringify({
        status: 'failure',
        operation: `phase8-judge-${mode}`,
        message,
        recoveryStateExists: fs.existsSync(statePath),
        cleanupCommand:
          'RUN_PHASE8_JUDGE_ACCESS=true pnpm --filter @questoros-memory/mcp-server judge:phase8:cleanup',
      })}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabaseClient().catch(() => undefined);
  });
