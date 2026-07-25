-- Phase 5: harvest runs, memory candidates, published artifacts
-- CockroachDB may create tables with schema_locked=true; unlock before indexes.

CREATE TABLE harvest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  workspace_id UUID NULL,
  project_id UUID NULL,
  actor_id UUID NULL,
  source_artifact_id UUID NULL,
  scope_type STRING NOT NULL,
  scope_id UUID NOT NULL,
  status STRING NOT NULL DEFAULT 'PENDING',
  title STRING NULL,
  error_message STRING NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL,
  CONSTRAINT harvest_runs_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT harvest_runs_tenant_id_unique UNIQUE (tenant_id, id)
);

ALTER TABLE harvest_runs SET (schema_locked = false);
CREATE INDEX harvest_runs_tenant_status_created_idx ON harvest_runs (tenant_id, status, created_at DESC);

CREATE TABLE memory_candidates (
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
);

ALTER TABLE memory_candidates SET (schema_locked = false);
CREATE INDEX memory_candidates_tenant_run_status_idx ON memory_candidates (tenant_id, harvest_run_id, status);
CREATE INDEX memory_candidates_tenant_status_created_idx ON memory_candidates (tenant_id, status, created_at DESC);

CREATE TABLE published_artifacts (
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
);

ALTER TABLE published_artifacts SET (schema_locked = false);
CREATE INDEX published_artifacts_tenant_sync_updated_idx ON published_artifacts (tenant_id, sync_status, updated_at DESC);
