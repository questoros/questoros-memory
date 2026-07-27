# Judge Guide

This guide provides the fastest safe path for evaluating QuestorOS Memory without exposing database credentials or enabling remote writes.

## One-minute overview

QuestorOS Memory is a governed persistent-memory service for AI agents. CockroachDB is the system of record for scoped memories, immutable revisions, provenance, audit events, vectors, source artifacts, harvest runs, and pending proposal candidates.

The public staging endpoint runs on AWS API Gateway and Lambda. Amazon Bedrock Nova Micro can extract proposals from bounded source material, but a model cannot directly change authoritative memory.

## Recommended evaluation order

1. Watch the public demonstration video.
2. Review the architecture in [`architecture.md`](architecture.md).
3. Review the live Phase 8D evidence in the pull request and [`phase-8-remote-mcp-demo.md`](phase-8-remote-mcp-demo.md).
4. Connect an MCP-compatible client to the staging endpoint using the temporary read-only credential provided privately through Devpost.
5. Confirm the exact five-tool catalog and retrieve the synthetic fixture.

## Live endpoint

```text
Transport: MCP Streamable HTTP
Endpoint: https://blrt2ds22f.execute-api.ap-southeast-1.amazonaws.com/staging/mcp
Authentication: Authorization: Bearer <private temporary judge key>
```

The key must be obtained from the private Devpost testing instructions. It must never be copied into public issues, screenshots, recordings, or repository files.

## Expected remote tools

```text
questoros_memory_whoami
questoros_memory_get
questoros_memory_list
questoros_memory_search
questoros_memory_history
```

Any other remote tool should be unavailable.

## Suggested checks

### 1. Identity and scope

Call:

```text
questoros_memory_whoami
```

Expected:

- credential scope is `PROJECT`;
- permissions contain only the intended read capability;
- tenant, workspace, and project identifiers are returned;
- no raw key or database credential is returned.

### 2. List the synthetic project fixture

Call:

```text
questoros_memory_list
```

Use the project scope values returned by `whoami` and a small limit.

Expected:

- the provisioned synthetic judge fixture is returned;
- no memory outside the credential's project is returned.

### 3. Explainable search

Call:

```text
questoros_memory_search
```

Suggested query:

```text
Harborview continuity milestone
```

Expected:

- the synthetic fixture is returned;
- the result includes an explanation object rather than an opaque similarity score alone.

### 4. Get current memory

Call:

```text
questoros_memory_get
```

Use the fixture memory ID from the private testing instructions or list result.

Expected:

- current corrected content is returned;
- provenance and metadata remain attached;
- the record remains project-scoped.

### 5. Review immutable history

Call:

```text
questoros_memory_history
```

Use the same memory ID.

Expected:

- revision 1 contains the original synthetic milestone;
- revision 2 contains the controlled correction;
- revision history is append-only.

### 6. Confirm write denial

Attempting a non-allowlisted tool such as `questoros_memory_create` should fail through the MCP protocol. The judge credential also lacks write permissions in the database-backed authorization record.

## CockroachDB verification

The video and repository demonstrate two required CockroachDB capabilities:

1. **Distributed Vector Indexing** — 1,024-dimensional embeddings and the `memory_embeddings_scope_cosine_idx` cosine index support scoped retrieval.
2. **CockroachDB Cloud Managed MCP Server** — a separate read-only administrative connection is used for schema inspection, index verification, retrieval diagnostics, and recommendations.

The customer-facing QuestorOS Memory MCP endpoint is not the CockroachDB Managed MCP Server and does not expose raw SQL.

## AWS verification

The staging path uses:

- API Gateway for HTTPS ingress and throttling;
- Lambda for REST, remote MCP, and governed harvesting;
- Bedrock Nova Micro for bounded structured extraction;
- S3 for bounded source artifacts;
- CloudWatch for logs and alarms;
- IAM for least-privilege access; and
- AWS Budgets for a $5 monthly staging boundary.

## Governance checks

The Phase 8D live run proved:

- one Bedrock harvest created one pending proposal candidate;
- authoritative memory did not change;
- no approval, rejection, or publication action occurred;
- cross-project access was denied;
- a remote write tool remained blocked; and
- exact cleanup restored the original active-memory set.

## Failure behavior

Expected safe failures include:

| Condition | Expected result |
| --- | --- |
| Missing bearer key | `AUTH_REQUIRED` |
| Invalid, revoked, or expired key | sanitized authentication error |
| Another project requested | `SCOPE_DENIED` |
| Write tool requested | tool unavailable or protocol error |
| Browser origin not allowlisted | `MCP_ORIGIN_DENIED` |
| Invalid input | `VALIDATION_ERROR` |

Errors must not reveal API keys, database URLs, AWS credentials, raw headers, stack traces, model output, or private chain-of-thought.

## Testing boundaries

- Use only the synthetic fixture.
- Do not publish the temporary key.
- Do not attempt load, penetration, destructive, or cost-amplification testing.
- Do not send private, regulated, customer, or confidential data.
- The endpoint is a controlled staging MVP and may be rate-limited.

## Availability

The staging service is intended to remain available through the official judging period. After judging, the temporary judge key and synthetic fixture will be removed according to [`cost-and-cleanup.md`](cost-and-cleanup.md).
