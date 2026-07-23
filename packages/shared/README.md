# @questoros-memory/shared

**Status:** Placeholder — implementation pending.

## Responsibility

This package will contain:

- Shared TypeScript types and interfaces for memory data models.
- Zod or similar validation schemas.
- Constants (tenant scopes, limits, error codes).
- Utility functions shared across services.

## What it must not do

- Must not contain environment-specific secrets, connection strings, or credentials.
- Must not contain business logic specific to a single service.

## Security boundaries

- Validation schemas must enforce input constraints to prevent injection.
- Type exports must not inadvertently leak internal implementation details.
