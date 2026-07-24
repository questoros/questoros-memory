import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Contract tests for the verify-schema script.
 *
 * These test the verification logic by asserting that the follow-up
 * migration SQL contains the missing API-key foreign keys and that
 * the verify-schema.ts REQUIRED_FKS config includes them.
 */
import fs from 'fs';
import path from 'path';

const FOLLOWUP_MIGRATION_PATH = path.resolve(
  __dirname,
  '..',
  'prisma',
  'migrations',
  '20260723230100_phase3_api_key_fks',
  'migration.sql',
);

const VERIFY_SCRIPT_PATH = path.resolve(__dirname, '..', 'scripts', 'verify-schema.ts');

describe('follow-up migration SQL', () => {
  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(FOLLOWUP_MIGRATION_PATH, 'utf-8');
  });

  it('contains api_keys_tenant_workspace_fkey', () => {
    expect(sql).toContain('api_keys_tenant_workspace_fkey');
  });

  it('contains api_keys_tenant_workspace_project_fkey', () => {
    expect(sql).toContain('api_keys_tenant_workspace_project_fkey');
  });

  it('references workspaces for the workspace FK', () => {
    expect(sql).toContain('REFERENCES workspaces');
  });

  it('references projects for the project FK', () => {
    expect(sql).toContain('REFERENCES projects');
  });

  it('unlocks api_keys before adding constraints', () => {
    expect(sql).toContain('ALTER TABLE api_keys SET (schema_locked = false)');
  });
});

describe('verify-script REQUIRED_FKS config', () => {
  let scriptContent: string;

  beforeAll(() => {
    scriptContent = fs.readFileSync(VERIFY_SCRIPT_PATH, 'utf-8');
  });

  it('requires api_keys_tenant_workspace_fkey', () => {
    expect(scriptContent).toContain('api_keys_tenant_workspace_fkey');
  });

  it('requires api_keys_tenant_workspace_project_fkey', () => {
    expect(scriptContent).toContain('api_keys_tenant_workspace_project_fkey');
  });

  it('lists the missing FKs under the api_keys section', () => {
    // Find the api_keys section in REQUIRED_FKS
    const apiKeysSection = scriptContent.match(/api_keys:\s*\[([^\]]*)\]/s);
    expect(apiKeysSection).not.toBeNull();
    expect(apiKeysSection![1]).toContain('api_keys_tenant_workspace_fkey');
    expect(apiKeysSection![1]).toContain('api_keys_tenant_workspace_project_fkey');
  });
});
