/**
 * ARCHIVED one-time Phase 5 migration recovery helper.
 *
 * The partial-migration recovery for
 * `20260725100000_phase5_harvest_candidates_publish` already completed.
 * Normal users must use Prisma migrations (`pnpm db:migrate`), never this script.
 *
 * This file refuses to run unless every safety gate is present. It never runs
 * from install/build/test/CI and never prints DATABASE_URL.
 */
import 'dotenv/config';
import pg from 'pg';

function refuse(message) {
  console.error(message);
  process.exit(1);
}

if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
  refuse('Phase 5 migration recovery is refused in CI.');
}

if (process.env.RUN_PHASE5_MIGRATION_RECOVERY !== 'true') {
  refuse(
    'Phase 5 migration recovery is gated. Recovery already completed; use Prisma migrations. Set RUN_PHASE5_MIGRATION_RECOVERY=true only for an approved, documented re-run.',
  );
}

const expectedCluster = process.env.PHASE5_RECOVERY_EXPECTED_CLUSTER?.trim();
if (!expectedCluster) {
  refuse('PHASE5_RECOVERY_EXPECTED_CLUSTER is required (exact cluster/host identifier).');
}

const confirm = process.env.PHASE5_RECOVERY_CONFIRM?.trim();
if (confirm !== 'RECOVER-PHASE5') {
  refuse('PHASE5_RECOVERY_CONFIRM must equal RECOVER-PHASE5.');
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  refuse('DATABASE_URL is required.');
}

if (!databaseUrl.includes(expectedCluster)) {
  refuse(
    'DATABASE_URL does not match PHASE5_RECOVERY_EXPECTED_CLUSTER. Refusing unknown environment.',
  );
}

const allowInsecureTls = process.env.PHASE5_RECOVERY_ALLOW_INSECURE_TLS === 'true';
const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: allowInsecureTls ? { rejectUnauthorized: false } : { rejectUnauthorized: true },
});

if (allowInsecureTls) {
  console.error(
    'WARNING: PHASE5_RECOVERY_ALLOW_INSECURE_TLS=true disables TLS certificate verification. Approved documented recovery only.',
  );
}

const statements = [
  `ALTER TABLE harvest_runs SET (schema_locked = false)`,
  `CREATE INDEX IF NOT EXISTS harvest_runs_tenant_status_created_idx ON harvest_runs (tenant_id, status, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS memory_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  workspace_id UUID NULL,
  project_id UUID NULL,
  harvest_run_id UUID NOT NULL,
  source_artifact_id UUID NULL,
  scope_type STRING NOT NULL,
  scope_id UUID NOT NULL,
  memory_type STRING NOT NULL,
  status STRING NOT NULL DEFAULT 'PENDING',
  content STRING NOT NULL,
  content_hash STRING NOT NULL,
  confidence DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
  related_memory_ids JSONB NOT NULL DEFAULT '[]',
  approved_memory_id UUID NULL,
  review_reason STRING NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ NULL,
  CONSTRAINT memory_candidates_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT memory_candidates_harvest_run_fkey FOREIGN KEY (tenant_id, harvest_run_id) REFERENCES harvest_runs(tenant_id, id),
  CONSTRAINT memory_candidates_tenant_id_unique UNIQUE (tenant_id, id)
)`,
  `ALTER TABLE memory_candidates SET (schema_locked = false)`,
  `CREATE INDEX IF NOT EXISTS memory_candidates_tenant_run_status_idx ON memory_candidates (tenant_id, harvest_run_id, status)`,
  `CREATE INDEX IF NOT EXISTS memory_candidates_tenant_status_created_idx ON memory_candidates (tenant_id, status, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS published_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  workspace_id UUID NULL,
  project_id UUID NULL,
  actor_id UUID NULL,
  scope_type STRING NOT NULL,
  scope_id UUID NOT NULL,
  provider STRING NOT NULL,
  external_file_id STRING NULL,
  external_url STRING NULL,
  parent_folder_id STRING NULL,
  artifact_type STRING NOT NULL,
  title STRING NOT NULL,
  content STRING NOT NULL,
  source_memory_ids JSONB NOT NULL DEFAULT '[]',
  source_revision_ids JSONB NOT NULL DEFAULT '[]',
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_external_modified_at TIMESTAMPTZ NULL,
  last_synced_content_hash STRING NOT NULL,
  sync_direction STRING NOT NULL,
  sync_status STRING NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT published_artifacts_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT published_artifacts_tenant_id_unique UNIQUE (tenant_id, id)
)`,
  `ALTER TABLE published_artifacts SET (schema_locked = false)`,
  `CREATE INDEX IF NOT EXISTS published_artifacts_tenant_sync_updated_idx ON published_artifacts (tenant_id, sync_status, updated_at DESC)`,
];

await client.connect();
try {
  for (const statement of statements) {
    process.stdout.write(`→ ${statement.slice(0, 60).replace(/\s+/g, ' ')}… `);
    await client.query(statement);
    console.log('ok');
  }
  console.log('Phase 5 recovery complete (gated re-run)');
} finally {
  await client.end();
}
