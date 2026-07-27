import fs from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { disconnectDatabaseClient, getDatabaseClient } from '@questoros-memory/database';
import { generateApiKey } from '@questoros-memory/memory-core';

const GATE = 'RUN_PHASE8_JUDGE_ACCESS';
const API_URL = 'https://blrt2ds22f.execute-api.ap-southeast-1.amazonaws.com/staging';
const MCP_URL = `${API_URL}/mcp`;
const KEY_EXPIRY = '2026-09-22T23:59:59.000Z';
const TOOLS = [
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
const privatePath = path.join(acceptanceDirectory, 'phase8-judge-private-instructions.txt');
const publicPath = path.join(acceptanceDirectory, 'phase8-judge-public-report.md');
const mode = (process.argv[2] ?? 'provision').toLowerCase();

type Phase = 'MEMORY_CREATED' | 'KEY_CREATED' | 'VERIFIED';

interface Scope {
  scopeType: 'PROJECT';
  scopeId: string;
  workspaceId: string;
  projectId: string;
}

interface State {
  version: 1;
  phase: Phase;
  marker: string;
  createdAt: string;
  tenantId: string;
  scope: Scope;
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

class HttpFailure extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Staging REST request failed with status ${status}.`);
    this.name = 'HttpFailure';
    this.status = status;
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

function localEnv(): Map<string, string> {
  const result = new Map<string, string>();
  const envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) return result;

  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    result.set(line.slice(0, separator).trim(), stripQuotes(line.slice(separator + 1)));
  }
  return result;
}

function configureDatabase(values: Map<string, string>): void {
  if (process.env.DATABASE_URL?.trim()) return;
  const value = values.get('DATABASE_URL')?.trim();
  assert(value, 'DATABASE_URL is required in the ignored local .env.');
  process.env.DATABASE_URL = value;
}

function adminKey(values: Map<string, string>): string {
  const explicit = process.env.QUESTOROS_MEMORY_STAGING_API_KEY?.trim();
  if (explicit) return explicit;

  const matches = new Set<string>();
  for (const value of values.values()) {
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

function validateUrl(value: string, expected: string, label: string): void {
  let normalized: string;
  try {
    normalized = new URL(value).toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${label} is invalid.`);
  }
  assert(normalized === expected, `${label} must be ${expected}.`);
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

function textBlocks(result: unknown): string[] {
  const content = asRecord(result).content;
  return Array.isArray(content)
    ? content
        .map(asRecord)
        .filter((item) => item.type === 'text' && typeof item.text === 'string')
        .map((item) => String(item.text))
    : [];
}

function mcpJson(result: unknown): unknown {
  for (const text of textBlocks(result)) {
    const candidate = text.trim();
    if (!candidate.startsWith('{') && !candidate.startsWith('[')) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next text block.
    }
  }
  throw new Error('MCP result did not contain JSON content.');
}

async function saveState(state: State): Promise<void> {
  await mkdir(acceptanceDirectory, { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

async function loadState(): Promise<State> {
  const state = JSON.parse(await readFile(statePath, 'utf8')) as State;
  assert(state.version === 1, 'Unsupported judge fixture state version.');
  return state;
}

function rest(key: string) {
  return async (
    route: string,
    options: { requestId: string; method?: string; body?: unknown },
  ): Promise<unknown> => {
    const response = await fetch(`${API_URL}${route}`, {
      method: options.method ?? 'GET',
      headers: {
        authorization: `Bearer ${key}`,
        'x-request-id': options.requestId,
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: 'error',
      signal: AbortSignal.timeout(45_000),
    });
    const payload = (response.headers.get('content-type') ?? '').includes('application/json')
      ? await response.json()
      : null;
    if (!response.ok) throw new HttpFailure(response.status);
    return payload;
  };
}

async function mcpClient(key: string, name: string): Promise<Client> {
  const client = new Client({ name, version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: {
      headers: {
        authorization: `Bearer ${key}`,
        'x-request-id': `phase8-judge-${randomUUID()}`,
      },
    },
  });
  await client.connect(transport);
  return client;
}

async function verifyDatabaseTenant(tenantId: string): Promise<void> {
  const prisma = getDatabaseClient();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM tenants WHERE id = ${tenantId}::uuid LIMIT 1
  `;
  assert(rows.length === 1, 'Local DATABASE_URL does not contain the staging tenant.');
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

async function createReadOnlyCredential(state: State) {
  const prisma = getDatabaseClient();
  const generated = generateApiKey();
  const externalId = `devpost-phase8-judge-${state.marker}`;

  const result = await prisma.$transaction(async (tx) => {
    const actors = await tx.$queryRaw<Array<{ id: string }>>`
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

    const keys = await tx.$queryRaw<Array<{ id: string }>>`
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
        ${actors[0].id}::uuid,
        'Devpost Phase 8 Judge Read-Only',
        ${generated.prefix},
        ${generated.hash},
        'PROJECT',
        ${state.scope.projectId}::uuid,
        ${state.scope.workspaceId}::uuid,
        ${state.scope.projectId}::uuid,
        ${JSON.stringify(['memory:read'])}::jsonb,
        ${new Date(KEY_EXPIRY)}
      )
      RETURNING id
    `;
    assert(keys.length === 1, 'Judge API key was not created.');
    return { actorId: actors[0].id, apiKeyId: keys[0].id };
  });

  return {
    ...result,
    rawKey: generated.raw,
    prefix: generated.prefix,
  };
}

async function verifyReadOnlyAccess(state: State, key: string): Promise<void> {
  const client = await mcpClient(key, 'phase8-devpost-judge-verification');
  try {
    const catalog = await client.listTools();
    assert(
      sameStrings(
        catalog.tools.map((tool) => tool.name),
        TOOLS,
      ),
      'Remote tool catalog is not the exact read-only allowlist.',
    );

    const whoamiResult = await client.callTool({
      name: 'questoros_memory_whoami',
      arguments: {},
    });
    assert(whoamiResult.isError !== true, 'Judge whoami failed.');
    const identity = asRecord(mcpJson(whoamiResult));
    const permissions = Array.isArray(identity.permissions) ? identity.permissions.map(String) : [];
    assert(sameStrings(permissions, ['memory:read']), 'Judge key is not memory:read only.');
    assert(
      asRecord(identity.credentialScope).projectId === state.scope.projectId,
      'Judge project scope is incorrect.',
    );

    const scopeArguments = {
      scopeType: 'PROJECT',
      workspaceId: state.scope.workspaceId,
      projectId: state.scope.projectId,
    };
    const listResult = await client.callTool({
      name: 'questoros_memory_list',
      arguments: { ...scopeArguments, limit: 20 },
    });
    assert(listResult.isError !== true, 'Judge list failed.');
    const list = asRecord(mcpJson(listResult));
    const items = Array.isArray(list.items) ? list.items.map(asRecord) : [];
    assert(
      items.some((item) => String(item.id ?? '') === state.memoryId),
      'Judge fixture is absent from list.',
    );

    const searchResult = await client.callTool({
      name: 'questoros_memory_search',
      arguments: {
        ...scopeArguments,
        queryText: 'Harborview continuity milestone',
        limit: 10,
      },
    });
    assert(searchResult.isError !== true, 'Judge search failed.');
    const search = mcpJson(searchResult);
    assert(Array.isArray(search), 'Judge search did not return an array.');
    assert(
      search
        .map(asRecord)
        .some((entry) => String(asRecord(entry.memory).id ?? '') === state.memoryId),
      'Judge fixture is absent from search.',
    );

    const getResult = await client.callTool({
      name: 'questoros_memory_get',
      arguments: { memoryId: state.memoryId },
    });
    assert(getResult.isError !== true, 'Judge get failed.');
    assert(
      asRecord(mcpJson(getResult)).content === state.correctedContent,
      'Judge get did not return corrected content.',
    );

    const historyResult = await client.callTool({
      name: 'questoros_memory_history',
      arguments: { memoryId: state.memoryId },
    });
    assert(historyResult.isError !== true, 'Judge history failed.');
    const history = mcpJson(historyResult);
    assert(
      Array.isArray(history) && history.length === 2,
      'Judge history must have two revisions.',
    );

    const deniedResult = await client.callTool({
      name: 'questoros_memory_list',
      arguments: {
        scopeType: 'PROJECT',
        workspaceId: state.scope.workspaceId,
        projectId: randomUUID(),
        limit: 10,
      },
    });
    assert(
      deniedResult.isError === true &&
        textBlocks(deniedResult).some((text) => text.includes('SCOPE_DENIED')),
      'Judge key was not denied for another project.',
    );

    let writeBlocked = false;
    try {
      const writeResult = await client.callTool({
        name: 'questoros_memory_create',
        arguments: {
          ...scopeArguments,
          memoryType: 'FACT',
          content: 'This write must remain blocked.',
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

function privateInstructions(state: State, rawKey: string): string {
  return [
    'QuestorOS Memory — Private Devpost Judge Instructions',
    '',
    `Transport: MCP Streamable HTTP`,
    `Endpoint: ${MCP_URL}`,
    `Authorization: Bearer ${rawKey}`,
    `Credential scope: PROJECT`,
    `Permissions: memory:read only`,
    `Synthetic fixture memory ID: ${state.memoryId}`,
    `Credential expiry: ${state.expiresAt}`,
    '',
    'Expected tools:',
    ...TOOLS.map((tool) => `- ${tool}`),
    '',
    'Suggested search query: Harborview continuity milestone',
    '',
    'The credential cannot create, correct, delete, harvest, approve, reject, publish, administer, execute SQL, or access another project.',
    'Do not publish this key or include it in screenshots, recordings, issues, or repository files.',
    '',
  ].join('\n');
}

function publicReport(state: State): string {
  return [
    '# Phase 8E Judge Fixture',
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
    '- list, explainable search, get, and history;',
    '- corrected persistent content;',
    '- immutable revisions 1 and 2;',
    '- cross-project denial;',
    '- non-allowlisted write denial; and',
    '- no private API key or database URL in this report.',
    '',
  ].join('\n');
}

function clipboard(value: string): boolean {
  if (process.platform !== 'win32') return false;
  return (
    spawnSync('clip.exe', [], {
      input: value,
      encoding: 'utf8',
      windowsHide: true,
    }).status === 0
  );
}

async function provision(key: string): Promise<void> {
  assert(!fs.existsSync(statePath), 'Judge fixture state exists. Run cleanup first.');
  assert(!fs.existsSync(privatePath), 'Private judge instructions exist. Run cleanup first.');

  const requestIds = {
    create: `phase8-judge-create-${randomUUID()}`,
    correction: `phase8-judge-correct-${randomUUID()}`,
    deletion: `phase8-judge-delete-${randomUUID()}`,
  };
  const request = rest(key);
  const identity = asRecord(await request('/v1/whoami', { requestId: requestIds.create }));
  const permissionList = Array.isArray(identity.permissions)
    ? identity.permissions.map(String)
    : [];
  const required = ['memory:read', 'memory:write', 'memory:correct', 'memory:delete'];
  assert(
    required.every(
      (permission) =>
        permissionList.includes(permission) || permissionList.includes('memory:admin'),
    ),
    `Provisioning key needs: ${required.join(', ')}.`,
  );
  const scopeRecord = asRecord(identity.credentialScope);
  assert(scopeRecord.scopeType === 'PROJECT', 'Provisioning key must be project-scoped.');
  assert(
    typeof identity.tenantId === 'string' &&
      typeof scopeRecord.scopeId === 'string' &&
      typeof scopeRecord.workspaceId === 'string' &&
      typeof scopeRecord.projectId === 'string',
    'Provisioning identity is incomplete.',
  );

  const scope: Scope = {
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
  assert(memoryId, 'Judge fixture creation returned no memory ID.');

  let state: State = {
    version: 1,
    phase: 'MEMORY_CREATED',
    marker,
    createdAt: new Date().toISOString(),
    tenantId: identity.tenantId,
    scope,
    beforeMemoryIds,
    memoryId,
    initialContent,
    correctedContent,
    requestIds,
  };
  await saveState(state);

  const correction = asRecord(
    await request(`/v1/memories/${memoryId}/corrections`, {
      method: 'POST',
      requestId: requestIds.correction,
      body: {
        content: correctedContent,
        reason: 'Synthetic Phase 8E correction for judge history verification.',
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

  const judge = await createReadOnlyCredential(state);
  state = {
    ...state,
    phase: 'KEY_CREATED',
    judgeActorId: judge.actorId,
    judgeApiKeyId: judge.apiKeyId,
    judgeKeyPrefix: judge.prefix,
    expiresAt: KEY_EXPIRY,
  };
  await saveState(state);

  await verifyReadOnlyAccess(state, judge.rawKey);
  state = { ...state, phase: 'VERIFIED' };
  await saveState(state);

  await mkdir(acceptanceDirectory, { recursive: true });
  const instructions = privateInstructions(state, judge.rawKey);
  await writeFile(privatePath, instructions, { encoding: 'utf8', mode: 0o600 });
  await writeFile(publicPath, publicReport(state), { encoding: 'utf8', mode: 0o600 });

  process.stdout.write(
    `${JSON.stringify({
      status: 'success',
      operation: 'phase8-judge-provision',
      memoryId: state.memoryId,
      keyPrefix: state.judgeKeyPrefix,
      permissions: ['memory:read'],
      revisionCount: 2,
      toolCount: TOOLS.length,
      expiresAt: state.expiresAt,
      privateInstructionsPath: privatePath,
      publicReportPath: publicPath,
      clipboardCopied: clipboard(instructions),
      secretsPrinted: false,
    })}\n`,
  );
}

function keyFromPrivateFile(): string {
  const contents = fs.readFileSync(privatePath, 'utf8');
  const match = /^Authorization: Bearer (qmem_live_[A-Za-z0-9_-]+)$/m.exec(contents);
  assert(match?.[1], 'Private judge instructions do not contain a valid key.');
  return match[1];
}

async function verify(): Promise<void> {
  const state = await loadState();
  assert(state.phase === 'VERIFIED', 'Judge fixture provisioning is incomplete.');
  const key = process.env.QUESTOROS_MEMORY_JUDGE_API_KEY?.trim() || keyFromPrivateFile();
  await verifyReadOnlyAccess(state, key);
  process.stdout.write(
    `${JSON.stringify({
      status: 'success',
      operation: 'phase8-judge-verify',
      memoryId: state.memoryId,
      keyPrefix: state.judgeKeyPrefix,
      expiresAt: state.expiresAt,
      revisionCount: 2,
      toolCount: TOOLS.length,
      secretsPrinted: false,
    })}\n`,
  );
}

async function cleanup(key: string): Promise<void> {
  const state = await loadState();
  await verifyDatabaseTenant(state.tenantId);

  try {
    await rest(key)(`/v1/memories/${state.memoryId}`, {
      method: 'DELETE',
      requestId: state.requestIds.deletion,
    });
  } catch (error) {
    if (!(error instanceof HttpFailure) || ![404, 410].includes(error.status)) throw error;
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
        )
    `;
    if (state.judgeActorId) {
      await tx.$executeRaw`
        DELETE FROM memory_audit_events
        WHERE tenant_id = ${state.tenantId}::uuid
          AND actor_id = ${state.judgeActorId}::uuid
      `;
    }
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

  const memoryRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM memories
    WHERE tenant_id = ${state.tenantId}::uuid
      AND id = ${state.memoryId}::uuid
  `;
  assert(memoryRows.length === 0, 'Judge fixture memory still exists after cleanup.');

  if (state.judgeApiKeyId) {
    const keyRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM api_keys
      WHERE tenant_id = ${state.tenantId}::uuid
        AND id = ${state.judgeApiKeyId}::uuid
    `;
    assert(keyRows.length === 0, 'Judge API key still exists after cleanup.');
  }

  const afterMemoryIds = await activeMemoryIds(state.tenantId, state.scope.projectId);
  assert(
    sameStrings(afterMemoryIds, state.beforeMemoryIds),
    'Original active-memory set was not restored.',
  );

  await rm(statePath, { force: true });
  await rm(privatePath, { force: true });
  await rm(publicPath, { force: true });

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
  assert(['provision', 'verify', 'cleanup'].includes(mode), `Unsupported mode: ${mode}.`);
  assert(
    process.env[GATE] === 'true',
    `Judge fixture operations are blocked. Set ${GATE}=true only for approved staging work.`,
  );
  validateUrl(
    process.env.QUESTOROS_MEMORY_STAGING_URL?.trim() || API_URL,
    API_URL,
    'QUESTOROS_MEMORY_STAGING_URL',
  );
  validateUrl(
    process.env.QUESTOROS_MEMORY_REMOTE_MCP_URL?.trim() || MCP_URL,
    MCP_URL,
    'QUESTOROS_MEMORY_REMOTE_MCP_URL',
  );

  const values = localEnv();
  configureDatabase(values);
  const key = adminKey(values);

  if (mode === 'provision') await provision(key);
  if (mode === 'verify') await verify();
  if (mode === 'cleanup') await cleanup(key);
}

main()
  .catch((error: unknown) => {
    const message = sanitize(
      error instanceof Error ? error.message : 'Unknown judge fixture failure.',
    );
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
