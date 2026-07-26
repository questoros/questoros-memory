/**
 * Bootstrap local authentication credentials.
 *
 * Usage:
 *   pnpm --filter @questoros-memory/database auth:bootstrap-local -- --write-env
 *   pnpm --filter @questoros-memory/database auth:bootstrap-local -- --write-env --rotate
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { generateApiKey, hashApiKey } from '@questoros-memory/memory-core';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');
const GITIGNORE_PATH = path.join(REPO_ROOT, '.gitignore');

// Demo data
const DEMO_TENANT_SLUG = 'questoros-demo';
const DEMO_TENANT_NAME = 'QuestorOS Memory Demo';
const DEMO_WORKSPACE_SLUG = 'demo';
const DEMO_WORKSPACE_NAME = 'Demo Workspace';
const DEMO_PROJECT_SLUG = 'memory-mvp';
const DEMO_PROJECT_NAME = 'Memory MVP';
const DEMO_ACTOR_EXTERNAL_ID = 'local-demo-service';
const DEMO_ACTOR_TYPE = 'SERVICE';
const DEMO_API_KEY_NAME = 'Local Phase 3 Demo';
const DEMO_SCOPE_TYPE = 'PROJECT';
const DEMO_PERMISSIONS = [
  'memory:read',
  'memory:write',
  'memory:correct',
  'memory:delete',
  'memory:embed',
  'memory:harvest',
  'memory:review',
  'memory:publish',
];

function pass(msg: string) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg: string) {
  console.error(`  ✗ ${msg}`);
}

async function main() {
  const args = process.argv.slice(2);
  const writeEnv = args.includes('--write-env');
  const rotate = args.includes('--rotate');

  if (!writeEnv) {
    console.log('--write-env flag is required to perform writes. Dry run mode.');
    console.log('Pass --write-env to actually create credentials and write to .env.\n');
  }

  // Validate .env is ignored
  if (!fs.existsSync(GITIGNORE_PATH)) {
    fail('.gitignore not found');
    process.exit(1);
  }

  const gitignore = fs.readFileSync(GITIGNORE_PATH, 'utf-8');
  const envIgnored = gitignore.split('\n').some((line) => line.trim() === '.env');
  if (!envIgnored) {
    fail('.env is not listed in .gitignore. Aborting for safety.');
    process.exit(1);
  }

  // Check if .env is tracked by git
  try {
    const { execSync } = await import('child_process');
    const result = execSync('git ls-files .env', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
    if (result) {
      fail('.env is tracked by git. Aborting for safety.');
      process.exit(1);
    }
  } catch {
    // git not available, skip check
  }

  // Connect to database
  const url = process.env.DATABASE_URL;
  if (!url) {
    fail('DATABASE_URL is not set.');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    console.log('\n── Bootstrapping local authentication ──\n');

    // 1. Upsert Tenant
    const tenantResult = await client.query(
      `INSERT INTO tenants (slug, name) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = excluded.name, updated_at = now()
       RETURNING id`,
      [DEMO_TENANT_SLUG, DEMO_TENANT_NAME],
    );
    const tenantId = tenantResult.rows[0].id;
    pass(`Tenant "${DEMO_TENANT_SLUG}" (${tenantId.slice(0, 8)}...)`);

    // 2. Upsert Workspace
    const wsResult = await client.query(
      `INSERT INTO workspaces (tenant_id, slug, name) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, slug) DO UPDATE SET name = excluded.name, updated_at = now()
       RETURNING id`,
      [tenantId, DEMO_WORKSPACE_SLUG, DEMO_WORKSPACE_NAME],
    );
    const workspaceId = wsResult.rows[0].id;
    pass(`Workspace "${DEMO_WORKSPACE_SLUG}" (${workspaceId.slice(0, 8)}...)`);

    // 3. Upsert Project
    const projResult = await client.query(
      `INSERT INTO projects (tenant_id, workspace_id, slug, name) VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, workspace_id, slug) DO UPDATE SET name = excluded.name, updated_at = now()
       RETURNING id`,
      [tenantId, workspaceId, DEMO_PROJECT_SLUG, DEMO_PROJECT_NAME],
    );
    const projectId = projResult.rows[0].id;
    pass(`Project "${DEMO_PROJECT_SLUG}" (${projectId.slice(0, 8)}...)`);

    // 4. Upsert Actor
    const actorResult = await client.query(
      `INSERT INTO actors (tenant_id, external_id, actor_type, display_name) VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, external_id) DO UPDATE SET
         actor_type = excluded.actor_type,
         display_name = excluded.display_name,
         updated_at = now()
       RETURNING id`,
      [tenantId, DEMO_ACTOR_EXTERNAL_ID, DEMO_ACTOR_TYPE, 'Local Demo Service'],
    );
    const actorId = actorResult.rows[0].id;
    pass(`Actor "${DEMO_ACTOR_EXTERNAL_ID}" (${actorId.slice(0, 8)}...)`);

    // 5. Check for existing active API key
    const existingKeyResult = await client.query(
      `SELECT id, key_prefix FROM api_keys
       WHERE tenant_id = $1 AND actor_id = $2 AND name = $3 AND status = 'ACTIVE'
       LIMIT 1`,
      [tenantId, actorId, DEMO_API_KEY_NAME],
    );

    if (existingKeyResult.rows.length > 0) {
      const existing = existingKeyResult.rows[0];
      if (rotate) {
        pass(`Existing active key found (prefix: ${existing.key_prefix}). Rotating...`);

        if (!writeEnv) {
          console.log('  (dry run - would revoke and create new key)');
        }
      } else {
        pass(
          `Existing active key found (prefix: ${existing.key_prefix}). Use --rotate to create a new one.`,
        );
        if (writeEnv) {
          // If we have an existing key but no way to recover plaintext, tell user to rotate
          console.log('  NOTE: A matching active API key already exists.');
          console.log('  The plaintext key is not stored and cannot be recovered.');
          console.log('  Use --rotate to revoke the old key and create a new one.');
        }
        return;
      }
    }

    if (!writeEnv) {
      console.log('\n── Dry run complete. Pass --write-env to persist. ──\n');
      return;
    }

    // === WRITE OPERATIONS ===

    // Revoke old key if rotating
    if (rotate && existingKeyResult.rows.length > 0) {
      await client.query(
        `UPDATE api_keys SET status = 'REVOKED', revoked_at = now() WHERE id = $1 AND status = 'ACTIVE'`,
        [existingKeyResult.rows[0].id],
      );
      pass('Old key revoked.');
    }

    // Generate new API key
    const generated = generateApiKey();
    const keyHash = hashApiKey(generated.raw);

    // Insert new API key
    await client.query(
      `INSERT INTO api_keys (tenant_id, actor_id, name, key_prefix, key_hash, scope_type, scope_id, workspace_id, project_id, permissions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        tenantId,
        actorId,
        DEMO_API_KEY_NAME,
        generated.prefix,
        keyHash,
        DEMO_SCOPE_TYPE,
        projectId,
        workspaceId,
        projectId,
        JSON.stringify(DEMO_PERMISSIONS),
      ],
    );
    pass(`API key "${generated.prefix}" created.`);

    // Write to .env
    const envVar = `QUESTOROS_MEMORY_API_KEY="${generated.raw}"`;
    let envContent = '';
    if (fs.existsSync(ENV_PATH)) {
      envContent = fs.readFileSync(ENV_PATH, 'utf-8');
      // Replace existing QUESTOROS_MEMORY_API_KEY line if present
      const regex = /^QUESTOROS_MEMORY_API_KEY=.*$/m;
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `QUESTOROS_MEMORY_API_KEY="${generated.raw}"`);
      } else {
        envContent += `\n${envVar}\n`;
      }
    } else {
      envContent = `${envVar}\n`;
    }

    fs.writeFileSync(ENV_PATH, envContent, 'utf-8');
    pass(`.env updated with API key prefix "${generated.prefix}".`);

    console.log(`\n── Bootstrap complete. API key prefix: ${generated.prefix} ──\n`);
    console.log('The full key has been written to .env as QUESTOROS_MEMORY_API_KEY.');
    console.log(`Use this key for REST API and MCP server authentication.\n`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err: Error) => {
  console.error(`\nBootstrap failed: ${err.message}`);
  process.exit(1);
});
