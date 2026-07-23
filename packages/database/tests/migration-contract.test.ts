import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '..',
  'prisma',
  'migrations',
  '20260723173918_initial_memory_schema',
  'migration.sql',
);

let migrationSql: string;

beforeAll(() => {
  migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf-8');
});

const REQUIRED_TABLES = [
  'tenants',
  'workspaces',
  'projects',
  'actors',
  'source_artifacts',
  'memories',
  'memory_revisions',
  'memory_embeddings',
  'memory_audit_events',
];

describe.each(REQUIRED_TABLES)('migration contains table %s', (table) => {
  it(`contains CREATE TABLE IF NOT EXISTS ${table}`, () => {
    expect(migrationSql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
  });
});

describe('migration vector support', () => {
  it('contains VECTOR(1024)', () => {
    expect(migrationSql).toContain('VECTOR(1024)');
  });

  it('contains memory_embeddings_scope_cosine_idx', () => {
    expect(migrationSql).toContain('memory_embeddings_scope_cosine_idx');
  });

  it('contains vector_cosine_ops', () => {
    expect(migrationSql).toContain('vector_cosine_ops');
  });
});

describe('migration tenant isolation', () => {
  it('contains tenant_id column references', () => {
    expect(migrationSql).toContain('tenant_id');
  });

  it('contains scope_type references', () => {
    expect(migrationSql).toContain('scope_type');
  });

  it('contains scope_id references', () => {
    expect(migrationSql).toContain('scope_id');
  });
});

describe('migration constraints', () => {
  it('contains TENANT scope type check', () => {
    expect(migrationSql).toContain("'TENANT'");
  });

  it('contains WORKSPACE scope type check', () => {
    expect(migrationSql).toContain("'WORKSPACE'");
  });

  it('contains PROJECT scope type check', () => {
    expect(migrationSql).toContain("'PROJECT'");
  });

  it('contains ACTIVE status check', () => {
    expect(migrationSql).toContain("'ACTIVE'");
  });

  it('contains DELETED status check', () => {
    expect(migrationSql).toContain("'DELETED'");
  });

  it('contains SUPERSEDED status check', () => {
    expect(migrationSql).toContain("'SUPERSEDED'");
  });
});

describe('migration safety', () => {
  it('does not contain DROP DATABASE', () => {
    expect(migrationSql).not.toMatch(/DROP\s+DATABASE/i);
  });

  it('does not contain DROP TABLE', () => {
    expect(migrationSql).not.toMatch(/DROP\s+TABLE/i);
  });

  it('does not contain TRUNCATE', () => {
    expect(migrationSql).not.toMatch(/TRUNCATE/i);
  });

  it('does not contain DATABASE_URL', () => {
    expect(migrationSql).not.toContain('DATABASE_URL');
  });

  it('does not contain postgresql://', () => {
    expect(migrationSql).not.toContain('postgresql://');
  });
});
