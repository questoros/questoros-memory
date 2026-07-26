# Architecture

> Current baseline: authenticated REST is deployed to AWS staging, the customer MCP server runs locally over stdio, and live Amazon Bedrock reasoning creates governed proposals without automatic authoritative-memory writes.

## Product path

```text
QuestorOS or third-party AI client
                |
                +-------------------------------+
                |                               |
                v                               v
Local MCP stdio server                 AWS API Gateway (staging)
services/mcp-server                    ap-southeast-1
                |                               |
                +---------------+---------------+
                                |
                                v
             @questoros-memory/memory-service
                  shared business logic
                                |
                                v
       Authentication, permissions, scope enforcement, audit
                                |
             +------------------+------------------+
             |                                     |
             v                                     v
CockroachDB memory, revisions,             Governed harvesting
provenance, and vector storage             and reasoning workflow
             |                                     |
             |                         +-----------+-----------+
             |                         |                       |
             |                         v                       v
             |                  Amazon Bedrock            Amazon S3
             |                  Nova Micro                source artifacts
             |                  us-west-2
             |
             v
Explainable retrieval and controlled lifecycle operations
```

REST and MCP transports must not duplicate business rules or access Prisma directly. Both call the same `memory-service` transport helpers.

## Deployed staging boundary

The deployed AWS staging stack is in Singapore (`ap-southeast-1`) and includes:

- API Gateway for the authenticated REST interface;
- Lambda for the memory API and governed-harvest workflow;
- CloudWatch alarms and operational logging;
- an S3 bucket for bounded source artifacts;
- least-privilege Bedrock invoke permissions; and
- a $5 monthly AWS budget.

The Lambda reasoning client uses `us-west-2` and the approved US cross-Region inference profile `us.amazon.nova-micro-v1:0`. The profile may route only within its permitted US geography.

No production QuestorOS infrastructure is managed by this repository.

## Governed reasoning path

```text
Synthetic or authorized source
            |
            v
Untrusted source artifact
            |
            v
Nova Micro structured extraction
            |
            v
Strict JSON and Zod validation
            |
            v
Candidate proposal records (PENDING)
            |
            v
Human review boundary
            |
     +------+------+
     |             |
     v             v
approved path   rejected path
     |
     v
authoritative write only through explicit governed action
```

The model cannot approve, publish, correct, delete, or directly create authoritative memory. Live Phase 7 verification confirmed proposal creation with zero authoritative-memory writes.

## Phase 8 remote MCP target

Phase 8 adds an authenticated remote MCP transport while preserving the same service boundary:

```text
External MCP client
        |
        v
Remote MCP transport
        |
        v
@questoros-memory/memory-service
        |
        v
Existing authentication, permissions, scope, and audit controls
```

The remote MCP transport must:

- expose only explicitly approved tools;
- use API-key or equivalent authenticated context;
- preserve tenant, workspace, and project scoping;
- avoid raw SQL and unrestricted database access;
- keep protocol output separate from diagnostics;
- return sanitized errors; and
- default governed harvesting to proposal-only behavior.

The existing local stdio MCP server remains supported during Phase 8.

## ICARE³ lifecycle (`metadata.icare`)

Public lifecycle:

> Issue → Context → Analysis → Recommendations → Evaluation → Execution → Evaluation

Internal stages include `RECOMMENDATION_EVALUATION` and `EXECUTION_EVALUATION` for the two evaluation steps.

## Administrative and diagnostic path

```text
Cursor
  |
  v
CockroachDB Cloud Managed MCP Server
  |
  v
Read-only schema inspection and diagnostics
```

The CockroachDB Cloud Managed MCP Server is an administrative and diagnostic tool. It is not the customer-facing QuestorOS Memory MCP product.

## Infrastructure decisions

- CockroachDB plan: Basic;
- CockroachDB cloud and region: AWS Singapore (`ap-southeast-1`);
- AWS staging region: Singapore (`ap-southeast-1`);
- Bedrock reasoning client Region: `us-west-2`;
- approved reasoning profile: `us.amazon.nova-micro-v1:0`;
- provisioned Bedrock throughput: none;
- embedding auto-on-write: disabled;
- existing QuestorOS production infrastructure: outside this repository.
