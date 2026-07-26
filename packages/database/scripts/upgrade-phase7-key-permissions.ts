import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { config as loadDotenv } from 'dotenv';
import { hashApiKey, sortPermissions, validatePermissions } from '@questoros-memory/memory-core';
import type { ApiPermission } from '@questoros-memory/memory-core';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');
const REQUIRED_PHASE7_PERMISSIONS: readonly ApiPermission[] = [
  'memory:read',
  'memory:harvest',
];

function fail(message: string): never {
  throw new Error(message);
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

function loadPrivateKey(): string {
  const explicit =
    process.env.QUESTOROS_MEMORY_STAGING_API_KEY?.trim() ||
    process.env.QUESTOROS_MEMORY_API_KEY?.trim();
  if (explicit) return explicit;

  if (!fs.existsSync(ENV_PATH)) {
    return fail('Repository .env was not found.');
  }

  const matches = new Set<string>();
  for (const rawLine of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const value = stripQuotes(line.slice(separator + 1));
    if (value.startsWith('qmem_live_')) matches.add(value);
  }

  if (matches.size !== 1) {
    return fail(
      matches.size === 0
        ? 'No private qmem_live_ key was found in the repository .env.'
        : 'Multiple qmem_live_ keys were found. Set QUESTOROS_MEMORY_STAGING_API_KEY explicitly.',
    );
  }

  return [...matches][0]!;
}

async function main(): Promise<void> {
  if (process.env.RUN_PHASE7_STAGING_KEY_PERMISSION_FIX !== 'true') {
    fail(
      'Phase 7 key permission upgrade is gated. Set RUN_PHASE7_STAGING_KEY_PERMISSION_FIX=true after explicit approval.',
    );
  }

  loadDotenv({ path: ENV_PATH, override: false });
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) fail('DATABASE_URL is required in the ignored repository .env.');

  const rawKey = loadPrivateKey();
  const keyHash = hashApiKey(rawKey);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const result = await client.query<{
      id: string;
      key_prefix: string;
      permissions: unknown;
      status: string;
      scope_type: string;
    }>(
      `SELECT id, key_prefix, permissions, status, scope_type
       FROM api_keys
       WHERE key_hash = $1
       LIMIT 2`,
      [keyHash],
    );

    if (result.rows.length !== 1) {
      fail(
        result.rows.length === 0
          ? 'The local private key does not match an API key in this database.'
          : 'The private key matched more than one database record.',
      );
    }

    const row = result.rows[0]!;
    if (row.status !== 'ACTIVE') fail('The matching API key is not ACTIVE.');

    const current = validatePermissions(row.permissions);
    const next = sortPermissions([
      ...new Set<ApiPermission>([...current, ...REQUIRED_PHASE7_PERMISSIONS]),
    ]);
    const added = next.filter((permission) => !current.includes(permission));

    if (added.length === 0) {
      console.log(
        JSON.stringify({
          status: 'success',
          action: 'phase7-key-permission-upgrade',
          changed: false,
          keyPrefix: row.key_prefix,
          scopeType: row.scope_type,
          permissions: next,
        }),
      );
      return;
    }

    await client.query('BEGIN');
    const updated = await client.query<{ permissions: unknown }>(
      `UPDATE api_keys
       SET permissions = $1::jsonb
       WHERE id = $2 AND key_hash = $3 AND status = 'ACTIVE'
       RETURNING permissions`,
      [JSON.stringify(next), row.id, keyHash],
    );
    if (updated.rows.length !== 1)
      fail('The API key changed concurrently; no permission update was applied.');
    validatePermissions(updated.rows[0]!.permissions);
    await client.query('COMMIT');

    console.log(
      JSON.stringify({
        status: 'success',
        action: 'phase7-key-permission-upgrade',
        changed: true,
        keyPrefix: row.key_prefix,
        scopeType: row.scope_type,
        addedPermissions: added,
        permissions: next,
      }),
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown permission upgrade failure.';
  console.error(
    JSON.stringify({
      status: 'failure',
      action: 'phase7-key-permission-upgrade',
      message: message.replace(/qmem_live_[A-Za-z0-9_-]+/g, '[REDACTED]').slice(0, 300),
    }),
  );
  process.exit(1);
});
