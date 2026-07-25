-- Align DESC indexes with Prisma Cockroach migrate-diff (ASC) expectations.
-- Vector index memory_embeddings_scope_cosine_idx is intentionally unchanged
-- (unsupported in Prisma PSL; verified by db:verify).

ALTER TABLE memories SET (schema_locked = false);
ALTER TABLE memory_audit_events SET (schema_locked = false);
ALTER TABLE harvest_runs SET (schema_locked = false);
ALTER TABLE memory_candidates SET (schema_locked = false);
ALTER TABLE published_artifacts SET (schema_locked = false);

DROP INDEX IF EXISTS memories_scope_lookup_idx CASCADE;
CREATE INDEX memories_scope_lookup_idx ON memories (tenant_id, scope_type, scope_id, status, updated_at);

DROP INDEX IF EXISTS memories_actor_lookup_idx CASCADE;
CREATE INDEX memories_actor_lookup_idx ON memories (tenant_id, actor_id, status, updated_at);

DROP INDEX IF EXISTS audit_events_tenant_created_idx CASCADE;
CREATE INDEX audit_events_tenant_created_idx ON memory_audit_events (tenant_id, created_at);

DROP INDEX IF EXISTS harvest_runs_tenant_status_created_idx CASCADE;
CREATE INDEX harvest_runs_tenant_status_created_idx ON harvest_runs (tenant_id, status, created_at);

DROP INDEX IF EXISTS memory_candidates_tenant_status_created_idx CASCADE;
CREATE INDEX memory_candidates_tenant_status_created_idx ON memory_candidates (tenant_id, status, created_at);

DROP INDEX IF EXISTS published_artifacts_tenant_sync_updated_idx CASCADE;
CREATE INDEX published_artifacts_tenant_sync_updated_idx ON published_artifacts (tenant_id, sync_status, updated_at);

ALTER TABLE memories SET (schema_locked = true);
ALTER TABLE memory_audit_events SET (schema_locked = true);
ALTER TABLE harvest_runs SET (schema_locked = true);
ALTER TABLE memory_candidates SET (schema_locked = true);
ALTER TABLE published_artifacts SET (schema_locked = true);
