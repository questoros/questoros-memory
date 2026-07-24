-- Phase 3 follow-up: add missing api_keys workspace and project foreign keys
-- These were omitted from the initial Phase 3 constraint correction migration.
-- The api_keys table already exists; we only add the missing FK constraints.

-- Unlock the referencing table and both referenced parent tables
-- before adding foreign keys, because CockroachDB v26.2 prevents
-- adding FKs referencing locked tables.
ALTER TABLE api_keys SET (schema_locked = false);
ALTER TABLE workspaces SET (schema_locked = false);
ALTER TABLE projects SET (schema_locked = false);

-- Add workspace foreign key
ALTER TABLE api_keys ADD CONSTRAINT IF NOT EXISTS api_keys_tenant_workspace_fkey
FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id);

-- Add project foreign key (triple relation)
ALTER TABLE api_keys ADD CONSTRAINT IF NOT EXISTS api_keys_tenant_workspace_project_fkey
FOREIGN KEY (tenant_id, workspace_id, project_id) REFERENCES projects(tenant_id, workspace_id, id);
