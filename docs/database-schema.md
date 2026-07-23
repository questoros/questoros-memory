# Database Schema

## Overview

QuestorOS Memory uses CockroachDB as its primary data store. The schema is designed for multi-tenant isolation, semantic vector retrieval, auditability, and memory lifecycle management.

## Tables

The schema contains nine tables:

| #   | Table                 | Purpose                                        |
| --- | --------------------- | ---------------------------------------------- |
| 1   | `tenants`             | Multi-tenant organizations                     |
| 2   | `workspaces`          | Logical groups within a tenant                 |
| 3   | `projects`            | Projects within a tenant and workspace         |
| 4   | `actors`              | Users, agents, services, and system identities |
| 5   | `source_artifacts`    | Provenance metadata for external documents     |
| 6   | `memories`            | Core memory records                            |
| 7   | `memory_revisions`    | Immutable revision history                     |
| 8   | `memory_embeddings`   | Vector embeddings for semantic retrieval       |
| 9   | `memory_audit_events` | Action audit trail                             |

## Tenant / Workspace / Project Isolation

Every data table includes a `tenant_id` UUID foreign key. All queries **must** filter by `tenant_id` as a mandatory access control measure.

- Workspaces are unique within a tenant (`UNIQUE(tenant_id, slug)`).
- Projects are unique within a tenant and workspace (`UNIQUE(tenant_id, workspace_id, slug)`).

## Composite Tenant-Aware Foreign Keys

CockroachDB supports composite foreign keys. Where a table references both `tenant_id` and another scoping column, the foreign key includes both columns:

```sql
FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id)
FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, id)
```

This ensures referential integrity cannot be bypassed by providing a valid `project_id` from a different tenant.

## Memory Lifecycle

Memories follow a lifecycle:

1. **Created** — `status = ACTIVE`, with `importance` and `confidence` scores.
2. **Superseded** — When corrected, the old memory gets `status = SUPERSEDED` and `superseded_by_id` points to the new memory.
3. **Deleted** — Soft delete sets `deleted_at` and `status = DELETED`. A check constraint ensures `DELETED` status requires a non-null `deleted_at`.

Scope types constrain the relationship between `scope_id`, `workspace_id`, and `project_id`:

| scope_type | scope_id     | workspace_id | project_id |
| ---------- | ------------ | ------------ | ---------- |
| TENANT     | tenant_id    | NULL         | NULL       |
| WORKSPACE  | workspace_id | NOT NULL     | NULL       |
| PROJECT    | project_id   | NOT NULL     | NOT NULL   |

## Provenance

The `source_artifacts` table stores provenance metadata for external documents (conversations, emails, files, etc.). It references S3 URIs for future document storage but does not store raw content.

## Revision History

`memory_revisions` stores immutable snapshots of memory content. Each revision is linked to a memory and has an incrementing `revision_number`. A record of who created the revision is kept via `created_by_actor_id`.

## Audit Events

`memory_audit_events` records every memory action with its outcome (`SUCCESS`, `DENIED`, `FAILED`), the acting actor, the affected memory, and optional reason and request ID.

## Embedding Model Contract

| Property             | Value                           |
| -------------------- | ------------------------------- |
| Model family         | Amazon Titan Text Embeddings V2 |
| Model ID             | `amazon.titan-embed-text-v2:0`  |
| Dimensions           | 1024                            |
| Normalization        | true                            |
| Similarity metric    | Cosine distance                 |
| CockroachDB operator | `<=>`                           |
| Vector opclass       | `vector_cosine_ops`             |

## Vector Index

The `memory_embeddings` table includes a CockroachDB native vector index for efficient cosine similarity search:

```sql
CREATE VECTOR INDEX memory_embeddings_scope_cosine_idx
ON memory_embeddings (
    tenant_id,
    scope_type,
    scope_id,
    embedding vector_cosine_ops
);
```

The prefix columns (`tenant_id`, `scope_type`, `scope_id`) are mandatory in every retrieval query. This enforces tenant and scope isolation at the query level.

## Managed MCP Read-Only Principle

The CockroachDB Cloud Managed MCP server remains read-only throughout development. All schema writes and migrations use the application SQL connection via the local `DATABASE_URL`. This separation ensures:

1. The Managed MCP is always safe for ad-hoc diagnostic queries.
2. Migration operations are controlled, versioned, and traceable.
3. Application credentials are never shared with the MCP configuration.
