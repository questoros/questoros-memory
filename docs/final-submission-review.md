# Final Submission Evidence Review

This document is the final repository-side review for the CockroachDB × AWS Hackathon submission. It separates completed technical evidence from the remaining external submission actions.

## Technical completion status

| Area                                      | Status   | Evidence                                                                                                                                 |
| ----------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| CockroachDB organizational-memory schema  | Complete | tenants, workspaces, projects, actors, memories, immutable revisions, audit events, vectors, source artifacts, runs, and candidates      |
| Distributed Vector Indexing               | Complete | 1,024-dimensional vectors and `memory_embeddings_scope_cosine_idx` using cosine operators                                                |
| CockroachDB Cloud Managed MCP usage       | Complete | separate read-only administrative inspection and diagnostics connection                                                                  |
| Shared authorization and governance layer | Complete | REST and MCP both call `@questoros-memory/memory-service`                                                                                |
| AWS staging deployment                    | Complete | API Gateway, Lambda, S3, CloudWatch, IAM, Budgets, and CDK verification                                                                  |
| Amazon Bedrock reasoning                  | Complete | bounded Nova Micro structured extraction through `us.amazon.nova-micro-v1:0`                                                             |
| Remote MCP                                | Complete | authenticated stateless Streamable HTTP with an exact five-tool read-only allowlist                                                      |
| Cross-session persistence proof           | Complete | separate sessions proved list, search, get, correction, and history                                                                      |
| Scope isolation                           | Complete | cross-project request denied in the live Phase 8D run                                                                                    |
| Governance proof                          | Complete | one harvest candidate, zero automatic authoritative writes, zero approval/rejection/publication actions                                  |
| Exact cleanup                             | Complete | synthetic authoritative and proposal records removed and original active-memory set restored                                             |
| CI                                        | Complete | formatting, lint, typecheck, tests, build, CDK synthesis, and assembly verification passed on `1d64e46dce697a2d6b18d048872ae10f2c5c9c60` |
| Public documentation                      | Complete | README, architecture, security, judge guide, Devpost draft, cost/cleanup, prior-work disclosure, and video script                        |

## Live evidence summary

The Phase 8D reproducible demonstration passed on July 27, 2026.

```text
Credential scope: PROJECT
Remote tool count: 5
Search result count: 1
Revision count: 2
Governed harvest candidates: 1
Authoritative changes from harvest: 0
Approval/rejection/publication actions: 0
Cross-project access denied: true
Remote write blocked: true
Original active-memory set restored: true
Secrets included in report: false
```

The synthetic memory and proposal-side records used for the acceptance run were removed after verification. The live acceptance report deliberately excludes API keys, database URLs, AWS credentials, raw model output, private data, and private chain-of-thought.

## Security review

The submission demonstrates the following controls:

- bearer authentication occurs before MCP initialization and tool discovery;
- credentials are database-backed, scoped, permissioned, revocable, and expirable;
- tenant, workspace, and project boundaries are enforced by the shared service layer;
- browser origins are denied unless explicitly allowlisted;
- remote MCP exposes only `whoami`, `get`, `list`, `search`, and `history`;
- remote create, correct, delete, harvest, review, publish, SQL, and administrative tools are unavailable;
- errors are sanitized and correlated with safe request identifiers;
- model output is validated and stored only as pending proposals;
- no wildcard Bedrock permissions are used;
- API Gateway throttling, CloudWatch alarms, and a $5 monthly AWS budget remain active; and
- the deployed service is described as a controlled staging MVP, not production-ready software.

## Prior-work disclosure review

QuestorOS existed before the hackathon as a broader AI workspace and operating-system concept with internal memory ideas. This repository is a separate standalone implementation created during the hackathon submission period.

The new work includes the CockroachDB schema, distributed vector retrieval, AWS staging infrastructure, REST and MCP interfaces, multi-tenant authorization, immutable revisions, provenance, governed harvesting, external-client acceptance proof, cleanup tooling, and submission package.

See [`pre-existing-work.md`](pre-existing-work.md).

## Remaining external actions

These actions cannot be completed by repository code alone:

1. Provision a dedicated temporary `memory:read` project-scoped judge credential.
2. Provision a stable synthetic judge fixture with two revisions and no private data.
3. Place the credential and fixture identifier only in Devpost's private testing instructions.
4. Record and edit the public demonstration video to less than three minutes.
5. Upload the video publicly to YouTube or Vimeo.
6. Replace the video placeholder in [`devpost-submission.md`](devpost-submission.md).
7. Complete the Devpost form and verify every public link from a signed-out browser.
8. Keep staging available through the official judging period.
9. Revoke the judge credential and remove the judge fixture after judging.

## Final pre-submission gate

Do not submit until every item below is true:

- [ ] Public repository opens without authentication.
- [ ] Apache License 2.0 is visible.
- [ ] README renders correctly, including the Mermaid architecture diagram.
- [ ] Functional endpoint is reachable.
- [ ] Private judge credential is read-only, project-scoped, and expiring.
- [ ] Synthetic fixture is readable through all five expected MCP tools where applicable.
- [ ] Write-tool attempts fail.
- [ ] Video is public and under three minutes.
- [ ] Video shows CockroachDB, remote MCP, revision history, governed Bedrock proposals, and cleanup.
- [ ] No credential, database URL, AWS account identifier, private data, notification, or copyrighted music appears in the video.
- [ ] Devpost identifies both CockroachDB capabilities and all material AWS services.
- [ ] Pre-existing work is disclosed.
- [ ] Private testing instructions contain the endpoint, bearer-key format, expected tools, fixture ID, scope, permissions, expiry, and testing boundaries.
- [ ] Staging availability and post-judging cleanup are scheduled.

## Merge boundary

PR #10 must remain draft and unmerged until:

1. the public video URL and private judge instructions are finalized;
2. the external submission checklist is reviewed;
3. all final CI checks remain green; and
4. explicit approval is given to mark the PR ready and merge it.
