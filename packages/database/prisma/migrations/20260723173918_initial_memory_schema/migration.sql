-- CreateMigration
-- Initial memory schema for QuestorOS Memory
-- CockroachDB native vector index with cosine similarity

-- 1. Tenants
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug STRING NOT NULL,
    name STRING NOT NULL,
    status STRING NOT NULL DEFAULT 'ACTIVE',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tenants_slug_unique UNIQUE (slug),
    CONSTRAINT tenants_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED'))
);

-- 2. Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    slug STRING NOT NULL,
    name STRING NOT NULL,
    status STRING NOT NULL DEFAULT 'ACTIVE',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT workspaces_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT workspaces_tenant_slug_unique UNIQUE (tenant_id, slug),
    CONSTRAINT workspaces_tenant_id_unique UNIQUE (tenant_id, id),
    CONSTRAINT workspaces_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED'))
);

-- 3. Projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    slug STRING NOT NULL,
    name STRING NOT NULL,
    status STRING NOT NULL DEFAULT 'ACTIVE',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT projects_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT projects_tenant_workspace_fkey FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id),
    CONSTRAINT projects_tenant_workspace_slug_unique UNIQUE (tenant_id, workspace_id, slug),
    CONSTRAINT projects_tenant_id_unique UNIQUE (tenant_id, id),
    CONSTRAINT projects_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED'))
);

-- 4. Actors
CREATE TABLE IF NOT EXISTS actors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    external_id STRING NOT NULL,
    actor_type STRING NOT NULL,
    display_name STRING NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT actors_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT actors_tenant_external_id_unique UNIQUE (tenant_id, external_id),
    CONSTRAINT actors_tenant_id_unique UNIQUE (tenant_id, id),
    CONSTRAINT actors_actor_type_check CHECK (actor_type IN ('USER', 'AGENT', 'SERVICE', 'SYSTEM'))
);

-- 5. Source artifacts
CREATE TABLE IF NOT EXISTS source_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    workspace_id UUID NULL,
    project_id UUID NULL,
    source_type STRING NOT NULL,
    source_uri STRING NULL,
    content_type STRING NULL,
    checksum_sha256 STRING NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT source_artifacts_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT source_artifacts_tenant_id_unique UNIQUE (tenant_id, id),
    CONSTRAINT source_artifacts_source_type_check CHECK (source_type IN ('CONVERSATION', 'DOCUMENT', 'EMAIL', 'CALENDAR', 'API', 'MANUAL', 'SYSTEM')),
    CONSTRAINT source_artifacts_project_requires_workspace CHECK (project_id IS NULL OR workspace_id IS NOT NULL)
);

-- Composite foreign keys for source_artifacts (when workspace_id/project_id are present)
CREATE INDEX IF NOT EXISTS source_artifacts_tenant_workspace_idx ON source_artifacts(tenant_id, workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS source_artifacts_tenant_project_idx ON source_artifacts(tenant_id, project_id) WHERE project_id IS NOT NULL;

-- 6. Memories
CREATE TABLE IF NOT EXISTS memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    workspace_id UUID NULL,
    project_id UUID NULL,
    actor_id UUID NULL,
    source_artifact_id UUID NULL,
    scope_type STRING NOT NULL,
    scope_id UUID NOT NULL,
    memory_type STRING NOT NULL,
    status STRING NOT NULL DEFAULT 'ACTIVE',
    content STRING NOT NULL,
    content_hash STRING NOT NULL,
    importance DECIMAL(5,4) NOT NULL DEFAULT 0.5000,
    confidence DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
    sensitivity STRING NOT NULL DEFAULT 'STANDARD',
    valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until TIMESTAMPTZ NULL,
    superseded_by_id UUID NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT memories_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT memories_tenant_id_unique UNIQUE (tenant_id, id),
    CONSTRAINT memories_scope_type_check CHECK (scope_type IN ('TENANT', 'WORKSPACE', 'PROJECT')),
    CONSTRAINT memories_memory_type_check CHECK (memory_type IN ('PROFILE', 'PREFERENCE', 'FACT', 'DECISION', 'TASK', 'EVENT', 'SUMMARY', 'INSTRUCTION')),
    CONSTRAINT memories_status_check CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'DELETED')),
    CONSTRAINT memories_sensitivity_check CHECK (sensitivity IN ('PUBLIC', 'STANDARD', 'SENSITIVE', 'RESTRICTED')),
    CONSTRAINT memories_importance_range CHECK (importance >= 0 AND importance <= 1),
    CONSTRAINT memories_confidence_range CHECK (confidence >= 0 AND confidence <= 1),
    CONSTRAINT memories_valid_until_check CHECK (valid_until IS NULL OR valid_until > valid_from),
    CONSTRAINT memories_project_requires_workspace CHECK (project_id IS NULL OR workspace_id IS NOT NULL),
    CONSTRAINT memories_deleted_requires_deleted_at CHECK (status = 'DELETED' OR deleted_at IS NULL),
    CONSTRAINT memories_non_deleted_null_deleted_at CHECK (status != 'DELETED' OR deleted_at IS NOT NULL),
    CONSTRAINT memories_scope_tenant_check CHECK (
        (scope_type = 'TENANT' AND scope_id = tenant_id AND workspace_id IS NULL AND project_id IS NULL) OR
        (scope_type = 'WORKSPACE' AND scope_id IS NOT NULL AND workspace_id IS NOT NULL AND project_id IS NULL) OR
        (scope_type = 'PROJECT' AND scope_id IS NOT NULL AND workspace_id IS NOT NULL AND project_id IS NOT NULL)
    )
);

-- Composite foreign keys for memories
CREATE INDEX IF NOT EXISTS memories_tenant_workspace_idx ON memories(tenant_id, workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS memories_tenant_project_idx ON memories(tenant_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS memories_tenant_actor_idx ON memories(tenant_id, actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS memories_tenant_source_artifact_idx ON memories(tenant_id, source_artifact_id) WHERE source_artifact_id IS NOT NULL;

-- Self-referential foreign key for supersession
ALTER TABLE memories ADD CONSTRAINT memories_superseded_by_fkey FOREIGN KEY (tenant_id, superseded_by_id) REFERENCES memories(tenant_id, id);

-- Ordinary indexes for memories
CREATE INDEX IF NOT EXISTS memories_scope_lookup_idx ON memories(tenant_id, scope_type, scope_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS memories_actor_lookup_idx ON memories(tenant_id, actor_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS memories_source_artifact_lookup_idx ON memories(tenant_id, source_artifact_id);
CREATE INDEX IF NOT EXISTS memories_content_hash_idx ON memories(tenant_id, content_hash);

-- 7. Memory revisions
CREATE TABLE IF NOT EXISTS memory_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    memory_id UUID NOT NULL,
    revision_number INT4 NOT NULL,
    content STRING NOT NULL,
    content_hash STRING NOT NULL,
    reason STRING NULL,
    created_by_actor_id UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT memory_revisions_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT memory_revisions_memory_fkey FOREIGN KEY (tenant_id, memory_id) REFERENCES memories(tenant_id, id),
    CONSTRAINT memory_revisions_actor_fkey FOREIGN KEY (tenant_id, created_by_actor_id) REFERENCES actors(tenant_id, id),
    CONSTRAINT memory_revisions_unique UNIQUE (tenant_id, memory_id, revision_number),
    CONSTRAINT memory_revisions_revision_positive CHECK (revision_number > 0)
);

-- 8. Memory embeddings (includes vector column and vector index)
CREATE TABLE IF NOT EXISTS memory_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    memory_id UUID NOT NULL,
    scope_type STRING NOT NULL,
    scope_id UUID NOT NULL,
    embedding_model STRING NOT NULL,
    embedding_dimensions INT4 NOT NULL,
    embedding VECTOR(1024) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT memory_embeddings_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT memory_embeddings_memory_fkey FOREIGN KEY (tenant_id, memory_id) REFERENCES memories(tenant_id, id),
    CONSTRAINT memory_embeddings_unique UNIQUE (tenant_id, memory_id, embedding_model, embedding_dimensions),
    CONSTRAINT memory_embeddings_dimensions_check CHECK (embedding_dimensions = 1024),
    CONSTRAINT memory_embeddings_scope_type_check CHECK (scope_type IN ('TENANT', 'WORKSPACE', 'PROJECT'))
);

-- Ordinary index on memory_embeddings
CREATE INDEX IF NOT EXISTS memory_embeddings_memory_idx ON memory_embeddings(tenant_id, memory_id);

-- CockroachDB native vector index for cosine similarity search
-- Prefix columns (tenant_id, scope_type, scope_id) are mandatory in queries
CREATE VECTOR INDEX memory_embeddings_scope_cosine_idx
ON memory_embeddings (
    tenant_id,
    scope_type,
    scope_id,
    embedding vector_cosine_ops
);

-- 9. Memory audit events
CREATE TABLE IF NOT EXISTS memory_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    workspace_id UUID NULL,
    project_id UUID NULL,
    actor_id UUID NULL,
    memory_id UUID NULL,
    action STRING NOT NULL,
    outcome STRING NOT NULL,
    request_id STRING NULL,
    reason STRING NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT memory_audit_events_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT memory_audit_events_outcome_check CHECK (outcome IN ('SUCCESS', 'DENIED', 'FAILED')),
    CONSTRAINT audit_project_requires_workspace CHECK (project_id IS NULL OR workspace_id IS NOT NULL)
);

-- Composite foreign keys for memory_audit_events
CREATE INDEX IF NOT EXISTS audit_events_tenant_workspace_idx ON memory_audit_events(tenant_id, workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_events_tenant_project_idx ON memory_audit_events(tenant_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_events_tenant_actor_idx ON memory_audit_events(tenant_id, actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_events_tenant_memory_idx ON memory_audit_events(tenant_id, memory_id) WHERE memory_id IS NOT NULL;

-- Ordinary index for audit events
CREATE INDEX IF NOT EXISTS audit_events_tenant_created_idx ON memory_audit_events(tenant_id, created_at DESC);
