# Contributing

QuestorOS Memory is an early hackathon project. Contributions are welcome but must follow the guidelines below.

## Before contributing

1. Read [`README.md`](README.md) to understand the project status and scope.
2. Read [`docs/pre-existing-work.md`](docs/pre-existing-work.md) to understand how pre-existing QuestorOS work is disclosed.
3. Read [`SECURITY.md`](SECURITY.md) and [`docs/security.md`](docs/security.md) for security boundaries.
4. Read [`docs/threat-model.md`](docs/threat-model.md) for documented threats.

## Pull request requirements

Every pull request must confirm:

- [ ] No secrets (connection strings, passwords, tokens, API keys) are committed.
- [ ] No existing QuestorOS production code has been modified.
- [ ] Any code copied or adapted from pre-existing QuestorOS work is disclosed by file and source commit.
- [ ] All relevant tests pass (or are documented as not yet implemented).
- [ ] Documentation is updated to reflect the change.
- [ ] No claims are made about features that are not fully implemented.
- [ ] No write-enabled CockroachDB Managed MCP changes are included.

## Development setup

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

See [`docs/development.md`](docs/development.md) for full local setup instructions.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
