/**
 * Verify that the target database schema matches Phase 3 expectations.
 *
 * Connects through DATABASE_URL and checks:
 * - exactly ten application tables
 * - required columns for every table
 * - vector column type
 * - new composite foreign keys
 * - project triple uniqueness
 * - exact memory scope check
 * - audit-event foreign keys
 * - api_keys contract (columns, FKs, checks, indexes)
 * - all Phase 2 ordinary indexes
 * - vector index
 * - migration status
 *
 * Prints only sanitized object names and pass/fail results.
 */
import pg from 'pg';

const { Client } = pg;

interface ConstraintRow {
  constraint_name: string;
  constraint_type: string;
  details: string;
}

const EXPECTED_TABLES = [
  'tenants',
  'workspaces',
  'projects',
  'actors',
  'source_artifacts',
  'memories',
  'memory_revisions',
  'memory_embeddings',
  'memory_audit_events',
  'api_keys',
  'harvest_runs',
  'memory_candidates',
  'published_artifacts',
];

// Required composite foreign keys
const REQUIRED_FKS: Record<string, string[]> = {
  source_artifacts: [
    'source_artifacts_tenant_workspace_fkey',
    'source_artifacts_tenant_workspace_project_fkey',
  ],
  memories: [
    'memories_tenant_workspace_fkey',
    'memories_tenant_workspace_project_fkey',
    'memories_tenant_actor_fkey',
    'memories_tenant_source_artifact_fkey',
    'memories_superseded_by_fkey',
  ],
  memory_audit_events: [
    'audit_events_tenant_workspace_fkey',
    'audit_events_tenant_workspace_project_fkey',
    'audit_events_tenant_actor_fkey',
    'audit_events_tenant_memory_fkey',
  ],
  api_keys: [
    'api_keys_tenant_fkey',
    'api_keys_tenant_actor_fkey',
    'api_keys_tenant_workspace_fkey',
    'api_keys_tenant_workspace_project_fkey',
  ],
  harvest_runs: [
    'harvest_runs_tenant_fkey',
    'harvest_runs_tenant_workspace_fkey',
    'harvest_runs_tenant_workspace_project_fkey',
    'harvest_runs_tenant_actor_fkey',
    'harvest_runs_tenant_source_artifact_fkey',
  ],
  memory_candidates: [
    'memory_candidates_tenant_fkey',
    'memory_candidates_harvest_run_fkey',
    'memory_candidates_tenant_workspace_fkey',
    'memory_candidates_tenant_workspace_project_fkey',
    'memory_candidates_tenant_source_artifact_fkey',
    'memory_candidates_tenant_approved_memory_fkey',
  ],
  published_artifacts: [
    'published_artifacts_tenant_fkey',
    'published_artifacts_tenant_workspace_fkey',
    'published_artifacts_tenant_workspace_project_fkey',
    'published_artifacts_tenant_actor_fkey',
  ],
};

// Required unique constraints
const REQUIRED_UNIQUES: Record<string, string[]> = {
  projects: ['projects_tenant_workspace_id_unique'],
  api_keys: ['api_keys_key_hash_unique', 'api_keys_tenant_id_unique'],
};

// Required check constraints
const REQUIRED_CHECKS: Record<string, string[]> = {
  api_keys: [
    'api_keys_status_check',
    'api_keys_scope_check',
    'api_keys_revocation_check',
    'api_keys_project_requires_workspace',
  ],
};

// Required ordinary indexes
const EXPECTED_INDEXES = [
  'memories_scope_lookup_idx',
  'memories_actor_lookup_idx',
  'memories_source_artifact_lookup_idx',
  'memories_content_hash_idx',
  'memory_embeddings_memory_idx',
  'audit_events_tenant_created_idx',
  'api_keys_tenant_status_idx',
  'api_keys_tenant_actor_status_idx',
  'api_keys_key_prefix_idx',
];

const EXPECTED_COLUMNS: Record<string, string[]> = {
  tenants: ['id', 'slug', 'name', 'status', 'metadata', 'created_at', 'updated_at'],
  workspaces: ['id', 'tenant_id', 'slug', 'name', 'status', 'metadata', 'created_at', 'updated_at'],
  projects: [
    'id',
    'tenant_id',
    'workspace_id',
    'slug',
    'name',
    'status',
    'metadata',
    'created_at',
    'updated_at',
  ],
  actors: [
    'id',
    'tenant_id',
    'external_id',
    'actor_type',
    'display_name',
    'metadata',
    'created_at',
    'updated_at',
  ],
  source_artifacts: [
    'id',
    'tenant_id',
    'workspace_id',
    'project_id',
    'source_type',
    'source_uri',
    'content_type',
    'checksum_sha256',
    'metadata',
    'created_at',
  ],
  memories: [
    'id',
    'tenant_id',
    'workspace_id',
    'project_id',
    'actor_id',
    'source_artifact_id',
    'scope_type',
    'scope_id',
    'memory_type',
    'status',
    'content',
    'content_hash',
    'importance',
    'confidence',
    'sensitivity',
    'valid_from',
    'valid_until',
    'superseded_by_id',
    'metadata',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  memory_revisions: [
    'id',
    'tenant_id',
    'memory_id',
    'revision_number',
    'content',
    'content_hash',
    'reason',
    'created_by_actor_id',
    'created_at',
  ],
  memory_embeddings: [
    'id',
    'tenant_id',
    'memory_id',
    'scope_type',
    'scope_id',
    'embedding_model',
    'embedding_dimensions',
    'embedding',
    'created_at',
  ],
  memory_audit_events: [
    'id',
    'tenant_id',
    'workspace_id',
    'project_id',
    'actor_id',
    'memory_id',
    'action',
    'outcome',
    'request_id',
    'reason',
    'metadata',
    'created_at',
  ],
  api_keys: [
    'id',
    'tenant_id',
    'actor_id',
    'name',
    'key_prefix',
    'key_hash',
    'scope_type',
    'scope_id',
    'workspace_id',
    'project_id',
    'permissions',
    'status',
    'expires_at',
    'created_at',
    'revoked_at',
  ],
  harvest_runs: [
    'id',
    'tenant_id',
    'workspace_id',
    'project_id',
    'actor_id',
    'source_artifact_id',
    'scope_type',
    'scope_id',
    'status',
    'title',
    'error_message',
    'metadata',
    'created_at',
    'updated_at',
    'completed_at',
  ],
  memory_candidates: [
    'id',
    'tenant_id',
    'workspace_id',
    'project_id',
    'harvest_run_id',
    'source_artifact_id',
    'scope_type',
    'scope_id',
    'memory_type',
    'status',
    'content',
    'content_hash',
    'confidence',
    'related_memory_ids',
    'approved_memory_id',
    'review_reason',
    'metadata',
    'created_at',
    'updated_at',
    'reviewed_at',
  ],
  published_artifacts: [
    'id',
    'tenant_id',
    'workspace_id',
    'project_id',
    'actor_id',
    'scope_type',
    'scope_id',
    'provider',
    'external_file_id',
    'external_url',
    'parent_folder_id',
    'artifact_type',
    'title',
    'content',
    'source_memory_ids',
    'source_revision_ids',
    'published_at',
    'last_external_modified_at',
    'last_synced_content_hash',
    'sync_direction',
    'sync_status',
    'metadata',
    'created_at',
    'updated_at',
  ],
};

function pass(label: string): void {
  console.log(`  ✓ ${label}`);
}

function fail(label: string, detail?: string): void {
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('ERROR: DATABASE_URL is not set.');
    process.exit(1);
  }

  const parsedUrl = new URL(url);
  const database = parsedUrl.pathname.replace(/^\//, '');

  if (database !== 'questoros_memory') {
    console.error(`ERROR: Expected database 'questoros_memory', got '${database}'`);
    process.exit(1);
  }

  let hasErrors = false;

  console.log(`\nTarget database: ${database}`);
  console.log('\n── Migration status ──\n');

  const client = new Client({ connectionString: url });

  try {
    await client.connect();

    // Verify Phase 3 migration is recorded
    const migResult = await client.query(
      `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
       WHERE migration_name = '20260723190000_phase3_constraint_correction'
       ORDER BY started_at DESC LIMIT 1`,
    );

    if (migResult.rows.length > 0) {
      const m = migResult.rows[0];
      if (m.finished_at && !m.rolled_back_at) {
        pass(
          `Phase 3 migration "${m.migration_name}" applied at ${m.finished_at.toISOString?.() ?? String(m.finished_at)}`,
        );
      } else {
        fail(`Phase 3 migration "${m.migration_name}" is not successfully applied`);
        hasErrors = true;
      }
    } else {
      fail('Phase 3 migration not found in _prisma_migrations');
      hasErrors = true;
    }

    // List tables
    const tablesResult = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`,
    );

    const existingTables = tablesResult.rows.map((r) => r.table_name);

    // Check for application tables (excluding _prisma_migrations)
    const appTables = existingTables.filter((t) => t !== '_prisma_migrations');
    console.log(`\n── Table verification (expect ${EXPECTED_TABLES.length}) ──\n`);

    if (appTables.length === EXPECTED_TABLES.length) {
      pass(`Thirteen application tables found (${appTables.length})`);
    } else {
      fail(`Expected ${EXPECTED_TABLES.length} application tables, found ${appTables.length}`);
      hasErrors = true;
    }

    for (const table of EXPECTED_TABLES) {
      if (existingTables.includes(table)) {
        pass(`Table "${table}" exists`);
      } else {
        fail(`Table "${table}" missing`);
        hasErrors = true;
      }
    }

    // Check columns for each table
    console.log('\n── Column verification ──\n');

    for (const [table, expectedCols] of Object.entries(EXPECTED_COLUMNS)) {
      if (!existingTables.includes(table)) continue;

      const colResult = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [table],
      );

      const existingCols = colResult.rows.map((r) => r.column_name);
      const allPresent = expectedCols.every((c) => existingCols.includes(c));

      if (allPresent) {
        pass(`Columns for "${table}"`);
      } else {
        const missing = expectedCols.filter((c) => !existingCols.includes(c));
        fail(`Columns for "${table}"`, `missing: ${missing.join(', ')}`);
        hasErrors = true;
      }
    }

    // Check foreign keys
    console.log('\n── Foreign key constraints ──\n');

    for (const [table, fkNames] of Object.entries(REQUIRED_FKS)) {
      if (!existingTables.includes(table)) continue;

      for (const fkName of fkNames) {
        const fkResult = await client.query<ConstraintRow>(
          `SELECT constraint_name, constraint_type FROM information_schema.table_constraints
           WHERE table_schema = 'public' AND table_name = $1 AND constraint_name = $2`,
          [table, fkName],
        );

        if (fkResult.rows.length > 0) {
          pass(`FK "${fkName}" on "${table}"`);
        } else {
          fail(`FK "${fkName}" on "${table}"`);
          hasErrors = true;
        }
      }
    }

    // Check unique constraints
    console.log('\n── Unique constraints ──\n');

    for (const [table, uniqueNames] of Object.entries(REQUIRED_UNIQUES)) {
      if (!existingTables.includes(table)) continue;

      for (const uname of uniqueNames) {
        const uResult = await client.query<ConstraintRow>(
          `SELECT constraint_name FROM information_schema.table_constraints
           WHERE table_schema = 'public' AND table_name = $1 AND constraint_name = $2`,
          [table, uname],
        );

        if (uResult.rows.length > 0) {
          pass(`Unique "${uname}" on "${table}"`);
        } else {
          fail(`Unique "${uname}" on "${table}"`);
          hasErrors = true;
        }
      }
    }

    // Verify exact memory scope check
    console.log('\n── Exact memory scope check ──\n');

    const scopeResult = await client.query<ConstraintRow>(
      `SELECT constraint_name, check_clause FROM information_schema.check_constraints
       WHERE constraint_name = 'memories_scope_tenant_check'`,
    );

    if (scopeResult.rows.length > 0) {
      const clause = scopeResult.rows[0].check_clause ?? '';
      // Verify that the check requires exact equality (scope_id = workspace_id or scope_id = project_id)
      // instead of the weaker scope_id IS NOT NULL form
      if (
        clause.includes('scope_id = workspace_id') &&
        clause.includes('scope_id = project_id') &&
        clause.includes('scope_id = tenant_id')
      ) {
        pass('memories_scope_tenant_check uses exact equality');
      } else {
        fail('memories_scope_tenant_check', 'does not use exact equality');
        hasErrors = true;
      }
    } else {
      fail('memories_scope_tenant_check', 'missing');
      hasErrors = true;
    }

    // Check API-key check constraints
    console.log('\n── API-key check constraints ──\n');

    for (const checkName of REQUIRED_CHECKS.api_keys) {
      const cResult = await client.query<ConstraintRow>(
        `SELECT constraint_name FROM information_schema.table_constraints
         WHERE table_schema = 'public' AND table_name = 'api_keys' AND constraint_name = $1`,
        [checkName],
      );

      if (cResult.rows.length > 0) {
        pass(`Check "${checkName}"`);
      } else {
        fail(`Check "${checkName}"`);
        hasErrors = true;
      }
    }

    // Check vector column type
    console.log('\n── Vector column ──\n');
    const vecColResult = await client.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'memory_embeddings'
         AND column_name = 'embedding'`,
    );

    if (vecColResult.rows.length > 0) {
      const { column_name, data_type } = vecColResult.rows[0];
      if (data_type.toLowerCase().includes('vector')) {
        pass(`"${column_name}" type is "${data_type}"`);
      } else {
        fail(`"${column_name}" type`, `expected vector, got "${data_type}"`);
        hasErrors = true;
      }
    } else {
      fail('embedding column not found');
      hasErrors = true;
    }

    // Check ordinary indexes
    console.log('\n── Ordinary indexes ──\n');

    for (const idx of EXPECTED_INDEXES) {
      const idxResult = await client.query(
        `SELECT indexname FROM pg_indexes
         WHERE tablename IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public')
         AND indexname = $1`,
        [idx],
      );

      if (idxResult.rows.length > 0) {
        pass(`Index "${idx}"`);
      } else {
        fail(`Index "${idx}" missing`);
        hasErrors = true;
      }
    }

    // Check vector index
    console.log('\n── Vector index ──\n');
    const vecIdxResult = await client.query(
      `SELECT indexname FROM pg_indexes WHERE indexname = 'memory_embeddings_scope_cosine_idx'`,
    );

    if (vecIdxResult.rows.length > 0) {
      pass("Vector index 'memory_embeddings_scope_cosine_idx' exists");
    } else {
      fail("Vector index 'memory_embeddings_scope_cosine_idx' missing");
      hasErrors = true;
    }

    console.log('\n── Summary ──\n');
    if (hasErrors) {
      console.log('Schema verification FAILED.');
      process.exit(1);
    }
    console.log('Phase 3 schema verification complete.');
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err: Error) => {
  console.error(`\nVerification failed: ${err.message}`);
  process.exit(1);
});
