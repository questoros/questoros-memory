-- Phase 3 constraint correction and API-key table
-- This migration adds missing composite foreign keys,
-- corrects the memories scope constraint to use exact equality,
-- adds project triple uniqueness,
-- and creates the api_keys table.

-- ============================================================
-- 0. Unlock tables that need constraint modifications
-- or are referenced by new foreign keys.
-- ============================================================
ALTER TABLE tenants SET (schema_locked = false);
ALTER TABLE workspaces SET (schema_locked = false);
ALTER TABLE projects SET (schema_locked = false);
ALTER TABLE actors SET (schema_locked = false);
ALTER TABLE source_artifacts SET (schema_locked = false);
ALTER TABLE memories SET (schema_locked = false);
ALTER TABLE memory_audit_events SET (schema_locked = false);

-- ============================================================
-- 1. Project triple uniqueness
-- ============================================================
ALTER TABLE projects ADD CONSTRAINT projects_tenant_workspace_id_unique UNIQUE (tenant_id, workspace_id, id);

-- ============================================================
-- 2. Source artifact composite foreign keys
-- ============================================================
-- Add FK for (tenant_id, workspace_id) -> workspaces(tenant_id, id)
-- Replace existing index with proper FK
ALTER TABLE source_artifacts DROP CONSTRAINT IF EXISTS source_artifacts_tenant_workspace_fkey;
ALTER TABLE source_artifacts ADD CONSTRAINT source_artifacts_tenant_workspace_fkey FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id);

-- Add FK for (tenant_id, workspace_id, project_id) -> projects(tenant_id, workspace_id, id)
ALTER TABLE source_artifacts DROP CONSTRAINT IF EXISTS source_artifacts_tenant_workspace_project_fkey;
ALTER TABLE source_artifacts ADD CONSTRAINT source_artifacts_tenant_workspace_project_fkey FOREIGN KEY (tenant_id, workspace_id, project_id) REFERENCES projects(tenant_id, workspace_id, id);

-- ============================================================
-- 3. Memories composite foreign keys
-- ============================================================
ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_tenant_workspace_fkey;
ALTER TABLE memories ADD CONSTRAINT memories_tenant_workspace_fkey FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id);

ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_tenant_workspace_project_fkey;
ALTER TABLE memories ADD CONSTRAINT memories_tenant_workspace_project_fkey FOREIGN KEY (tenant_id, workspace_id, project_id) REFERENCES projects(tenant_id, workspace_id, id);

ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_tenant_actor_fkey;
ALTER TABLE memories ADD CONSTRAINT memories_tenant_actor_fkey FOREIGN KEY (tenant_id, actor_id) REFERENCES actors(tenant_id, id);

ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_tenant_source_artifact_fkey;
ALTER TABLE memories ADD CONSTRAINT memories_tenant_source_artifact_fkey FOREIGN KEY (tenant_id, source_artifact_id) REFERENCES source_artifacts(tenant_id, id);

-- Replace the weaker scope constraint with exact equality checks
ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_scope_tenant_check;
ALTER TABLE memories ADD CONSTRAINT memories_scope_tenant_check CHECK (
    (scope_type = 'TENANT' AND scope_id = tenant_id AND workspace_id IS NULL AND project_id IS NULL)
    OR
    (scope_type = 'WORKSPACE' AND scope_id = workspace_id AND workspace_id IS NOT NULL AND project_id IS NULL)
    OR
    (scope_type = 'PROJECT' AND scope_id = project_id AND workspace_id IS NOT NULL AND project_id IS NOT NULL)
);

-- ============================================================
-- 4. Memory audit events composite foreign keys
-- ============================================================
ALTER TABLE memory_audit_events DROP CONSTRAINT IF EXISTS audit_events_tenant_workspace_fkey;
ALTER TABLE memory_audit_events ADD CONSTRAINT audit_events_tenant_workspace_fkey FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id);

ALTER TABLE memory_audit_events DROP CONSTRAINT IF EXISTS audit_events_tenant_workspace_project_fkey;
ALTER TABLE memory_audit_events ADD CONSTRAINT audit_events_tenant_workspace_project_fkey FOREIGN KEY (tenant_id, workspace_id, project_id) REFERENCES projects(tenant_id, workspace_id, id);

ALTER TABLE memory_audit_events DROP CONSTRAINT IF EXISTS audit_events_tenant_actor_fkey;
ALTER TABLE memory_audit_events ADD CONSTRAINT audit_events_tenant_actor_fkey FOREIGN KEY (tenant_id, actor_id) REFERENCES actors(tenant_id, id);

ALTER TABLE memory_audit_events DROP CONSTRAINT IF EXISTS audit_events_tenant_memory_fkey;
ALTER TABLE memory_audit_events ADD CONSTRAINT audit_events_tenant_memory_fkey FOREIGN KEY (tenant_id, memory_id) REFERENCES memories(tenant_id, id);

-- ============================================================
-- 5. ApiKeys table
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    actor_id UUID NOT NULL,
    name STRING NOT NULL,
    key_prefix STRING NOT NULL,
    key_hash STRING NOT NULL,
    scope_type STRING NOT NULL,
    scope_id UUID NOT NULL,
    workspace_id UUID NULL,
    project_id UUID NULL,
    permissions JSONB NOT NULL,
    status STRING NOT NULL DEFAULT 'ACTIVE',
    expires_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ NULL,
    CONSTRAINT api_keys_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT api_keys_tenant_actor_fkey FOREIGN KEY (tenant_id, actor_id) REFERENCES actors(tenant_id, id),
    CONSTRAINT api_keys_key_hash_unique UNIQUE (key_hash),
    CONSTRAINT api_keys_tenant_id_unique UNIQUE (tenant_id, id),
    CONSTRAINT api_keys_status_check CHECK (status IN ('ACTIVE', 'REVOKED')),
    CONSTRAINT api_keys_scope_check CHECK (
        (scope_type = 'TENANT' AND scope_id = tenant_id AND workspace_id IS NULL AND project_id IS NULL)
        OR
        (scope_type = 'WORKSPACE' AND scope_id = workspace_id AND workspace_id IS NOT NULL AND project_id IS NULL)
        OR
        (scope_type = 'PROJECT' AND scope_id = project_id AND workspace_id IS NOT NULL AND project_id IS NOT NULL)
    ),
    CONSTRAINT api_keys_revocation_check CHECK (
        (status = 'REVOKED' AND revoked_at IS NOT NULL)
        OR
        (status = 'ACTIVE' AND revoked_at IS NULL)
    ),
    CONSTRAINT api_keys_project_requires_workspace CHECK (project_id IS NULL OR workspace_id IS NOT NULL)
);

-- Unlock api_keys before creating non-constraint indexes
ALTER TABLE api_keys SET (schema_locked = false);

-- Non-constraint indexes for api_keys
CREATE INDEX IF NOT EXISTS api_keys_tenant_status_idx ON api_keys(tenant_id, status);
CREATE INDEX IF NOT EXISTS api_keys_tenant_actor_status_idx ON api_keys(tenant_id, actor_id, status);
CREATE INDEX IF NOT EXISTS api_keys_key_prefix_idx ON api_keys(key_prefix);
