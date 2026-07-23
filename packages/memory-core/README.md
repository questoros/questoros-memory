# @questoros-memory/memory-core

**Status:** Placeholder — implementation pending.

## Responsibility

This package will contain:

- Memory extraction and summarization logic.
- Semantic ranking and relevance scoring.
- Memory provenance tracking and versioning.
- Context assembly for AI agent prompts.
- Retention policy evaluation.

## What it must not do

- Must not perform direct UI rendering.
- Must not contain database connection logic (see `@questoros-memory/database`).
- Must not contain secrets or credentials.

## Security boundaries

- All memory content should be treated as potentially untrusted input.
- Provenance data should be tamper-evident.
- Ranking must account for tenant and scope isolation.
