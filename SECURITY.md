# Security Policy

QuestorOS Memory is an early hackathon project and is not production-ready.

## Do not report secrets publicly

Do not include database URLs, SQL passwords, OAuth tokens, AWS credentials, API keys, customer information, or unredacted logs in public issues or pull requests.

## Initial security boundaries

- CockroachDB Cloud Managed MCP access must remain read-only during the initial phase.
- The application SQL user and Managed MCP OAuth identity are separate access paths.
- The customer-facing memory service must not expose raw SQL or unrestricted database access.
- Tenant, workspace, user, and project authorization must be applied before memory retrieval.
- Stored memory and uploaded documents must be treated as potentially hostile input.

## Detailed security documentation

- [`docs/security.md`](docs/security.md) — security overview and access path descriptions.
- [`docs/threat-model.md`](docs/threat-model.md) — enumerated threats and proposed controls.

## Reporting

For a suspected vulnerability, contact the repository owner privately through the security-reporting method configured for this repository. Do not create a public issue containing exploitable details.
