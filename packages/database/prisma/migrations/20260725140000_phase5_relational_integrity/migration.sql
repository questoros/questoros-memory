-- Phase 5 final review: add composite relational integrity FKs
-- Do not edit previously applied Phase 5 migrations.
-- Unlock referencing tables and FK targets that may be schema_locked (CockroachDB).

ALTER TABLE harvest_runs SET (schema_locked = false);
ALTER TABLE memory_candidates SET (schema_locked = false);
ALTER TABLE published_artifacts SET (schema_locked = false);
ALTER TABLE source_artifacts SET (schema_locked = false);
ALTER TABLE memories SET (schema_locked = false);
ALTER TABLE workspaces SET (schema_locked = false);
ALTER TABLE projects SET (schema_locked = false);
ALTER TABLE actors SET (schema_locked = false);

-- harvest_runs
ALTER TABLE harvest_runs DROP CONSTRAINT IF EXISTS harvest_runs_tenant_workspace_fkey;
ALTER TABLE harvest_runs ADD CONSTRAINT harvest_runs_tenant_workspace_fkey
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id);

ALTER TABLE harvest_runs DROP CONSTRAINT IF EXISTS harvest_runs_tenant_workspace_project_fkey;
ALTER TABLE harvest_runs ADD CONSTRAINT harvest_runs_tenant_workspace_project_fkey
  FOREIGN KEY (tenant_id, workspace_id, project_id) REFERENCES projects(tenant_id, workspace_id, id);

ALTER TABLE harvest_runs DROP CONSTRAINT IF EXISTS harvest_runs_tenant_actor_fkey;
ALTER TABLE harvest_runs ADD CONSTRAINT harvest_runs_tenant_actor_fkey
  FOREIGN KEY (tenant_id, actor_id) REFERENCES actors(tenant_id, id);

ALTER TABLE harvest_runs DROP CONSTRAINT IF EXISTS harvest_runs_tenant_source_artifact_fkey;
ALTER TABLE harvest_runs ADD CONSTRAINT harvest_runs_tenant_source_artifact_fkey
  FOREIGN KEY (tenant_id, source_artifact_id) REFERENCES source_artifacts(tenant_id, id);

-- memory_candidates
ALTER TABLE memory_candidates DROP CONSTRAINT IF EXISTS memory_candidates_tenant_workspace_fkey;
ALTER TABLE memory_candidates ADD CONSTRAINT memory_candidates_tenant_workspace_fkey
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id);

ALTER TABLE memory_candidates DROP CONSTRAINT IF EXISTS memory_candidates_tenant_workspace_project_fkey;
ALTER TABLE memory_candidates ADD CONSTRAINT memory_candidates_tenant_workspace_project_fkey
  FOREIGN KEY (tenant_id, workspace_id, project_id) REFERENCES projects(tenant_id, workspace_id, id);

ALTER TABLE memory_candidates DROP CONSTRAINT IF EXISTS memory_candidates_tenant_source_artifact_fkey;
ALTER TABLE memory_candidates ADD CONSTRAINT memory_candidates_tenant_source_artifact_fkey
  FOREIGN KEY (tenant_id, source_artifact_id) REFERENCES source_artifacts(tenant_id, id);

ALTER TABLE memory_candidates DROP CONSTRAINT IF EXISTS memory_candidates_tenant_approved_memory_fkey;
ALTER TABLE memory_candidates ADD CONSTRAINT memory_candidates_tenant_approved_memory_fkey
  FOREIGN KEY (tenant_id, approved_memory_id) REFERENCES memories(tenant_id, id);

-- published_artifacts
ALTER TABLE published_artifacts DROP CONSTRAINT IF EXISTS published_artifacts_tenant_workspace_fkey;
ALTER TABLE published_artifacts ADD CONSTRAINT published_artifacts_tenant_workspace_fkey
  FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id);

ALTER TABLE published_artifacts DROP CONSTRAINT IF EXISTS published_artifacts_tenant_workspace_project_fkey;
ALTER TABLE published_artifacts ADD CONSTRAINT published_artifacts_tenant_workspace_project_fkey
  FOREIGN KEY (tenant_id, workspace_id, project_id) REFERENCES projects(tenant_id, workspace_id, id);

ALTER TABLE published_artifacts DROP CONSTRAINT IF EXISTS published_artifacts_tenant_actor_fkey;
ALTER TABLE published_artifacts ADD CONSTRAINT published_artifacts_tenant_actor_fkey
  FOREIGN KEY (tenant_id, actor_id) REFERENCES actors(tenant_id, id);

ALTER TABLE harvest_runs SET (schema_locked = true);
ALTER TABLE memory_candidates SET (schema_locked = true);
ALTER TABLE published_artifacts SET (schema_locked = true);
ALTER TABLE source_artifacts SET (schema_locked = true);
ALTER TABLE memories SET (schema_locked = true);
ALTER TABLE workspaces SET (schema_locked = true);
ALTER TABLE projects SET (schema_locked = true);
ALTER TABLE actors SET (schema_locked = true);
