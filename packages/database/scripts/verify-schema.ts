/**
 * Verify that the target database schema matches expectations.
 *
 * Connects through DATABASE_URL and checks:
 * - target database is questoros_memory
 * - all nine tables exist
 * - expected columns exist
 * - vector column reports a vector type
 * - ordinary indexes exist
 * - vector index exists
 *
 * Prints only sanitized object names and pass/fail results.
 */
import pg from 'pg';

const { Client } = pg;

interface TableInfo {
  table_name: string;
}

interface ColumnInfo {
  column_name: string;
  data_type: string;
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

  console.log(`\nTarget database: ${database}`);
  console.log('\n── Table verification ──\n');

  const client = new Client({ connectionString: url });

  try {
    await client.connect();

    // List tables
    const tablesResult = await client.query<TableInfo>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`,
    );

    const existingTables = tablesResult.rows.map((r) => r.table_name);

    for (const table of EXPECTED_TABLES) {
      if (existingTables.includes(table)) {
        pass(`Table "${table}" exists`);
      } else {
        fail(`Table "${table}" missing`);
      }
    }

    // Check columns for each table
    console.log('\n── Column verification ──\n');

    for (const [table, expectedCols] of Object.entries(EXPECTED_COLUMNS)) {
      if (!existingTables.includes(table)) continue;

      const colResult = await client.query<ColumnInfo>(
        `SELECT column_name, data_type FROM information_schema.columns
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
      }
    }

    // Check vector column type
    console.log('\n── Vector column ──\n');
    const vecColResult = await client.query<ColumnInfo>(
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
      }
    } else {
      fail('embedding column not found');
    }

    // Check ordinary indexes
    console.log('\n── Ordinary indexes ──\n');
    const EXPECTED_INDEXES = [
      'memories_scope_lookup_idx',
      'memories_actor_lookup_idx',
      'memories_source_artifact_lookup_idx',
      'memories_content_hash_idx',
      'memory_embeddings_memory_idx',
      'audit_events_tenant_created_idx',
    ];

    for (const idx of EXPECTED_INDEXES) {
      const idxResult = await client.query(
        `SELECT indexname FROM pg_indexes
         WHERE tablename IN (
           SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
         )
         AND indexname = $1`,
        [idx],
      );

      if (idxResult.rows.length > 0) {
        pass(`Index "${idx}"`);
      } else {
        fail(`Index "${idx}" missing`);
      }
    }

    // Check vector index
    console.log('\n── Vector index ──\n');
    const vecIdxResult = await client.query(
      `SELECT indexname FROM pg_indexes
       WHERE indexname = 'memory_embeddings_scope_cosine_idx'`,
    );

    if (vecIdxResult.rows.length > 0) {
      pass("Vector index 'memory_embeddings_scope_cosine_idx' exists");
    } else {
      fail("Vector index 'memory_embeddings_scope_cosine_idx' missing");
    }

    console.log('\n── Summary ──\n');
    console.log('Schema verification complete.');
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err: Error) => {
  console.error(`\nVerification failed: ${err.message}`);
  process.exit(1);
});
