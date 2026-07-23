# Threat Model

> **Status:** Documented threats. No mitigations are implemented in Phase 1.

This document enumerates threats relevant to the QuestorOS Memory project. Each threat is identified with an identifier, description, stage when it applies, and proposed control direction.

## Identified threats

### T-01: Cross-tenant memory leakage

A client from one tenant retrieves memory belonging to another tenant.

- **Stage:** Any memory retrieval operation.
- **Control direction:** Enforce tenant, workspace, and project authorization filters on all database queries.

### T-02: Unauthorized MCP access

An unauthenticated or unauthorized client connects to the customer-facing MCP server and issues memory commands.

- **Stage:** MCP server connection and invocation.
- **Control direction:** Require authentication on all MCP tool calls. Validate client identity.

### T-03: Prompt injection from stored memory

Malicious content stored as memory is retrieved and injected into an AI agent prompt, causing unintended behavior.

- **Stage:** Context assembly and prompt construction.
- **Control direction:** Sanitize and constrain retrieved memory content before inclusion in prompts.

### T-04: Malicious document content

Uploaded documents contain code, scripts, or content designed to exploit retrieval or rendering pipelines.

- **Stage:** Document ingestion and processing.
- **Control direction:** Scan or sandbox document processing. Treat all content as untrusted.

### T-05: Accidental secret logging

Secrets (connection strings, passwords, tokens, API keys) are written to application logs, error messages, or monitoring output.

- **Stage:** Any logging or error-handling code path.
- **Control direction:** Implement secret scrubbing for log output. Never log raw input or credentials.

### T-06: Stale or superseded memory

Outdated or corrected memory is retrieved and treated as current, causing incorrect agent behavior.

- **Stage:** Memory retrieval.
- **Control direction:** Track memory versioning, provenance, and supersession metadata.

### T-07: Deletion failures

A requested memory deletion does not propagate to all storage layers or replicas, leaving orphaned data retrievable.

- **Stage:** Memory deletion.
- **Control direction:** Verify deletion completion. Audit retention of deleted records.

### T-08: Excessive retention

Memory persists beyond policy, regulatory, or user-requested retention limits.

- **Stage:** Storage lifecycle.
- **Control direction:** Enforce retention policies with scheduled cleanup jobs.

### T-09: Unsafe write operations

A write operation performed through the administrative MCP bypasses application safeguards and corrupts data.

- **Stage:** Any write path.
- **Control direction:** The first MCP connection is read-only. Application SQL user access is separate and governed by connection-string security.

### T-10: External-client impersonation

An attacker impersonates a legitimate client to issue memory operations on behalf of another user or tenant.

- **Stage:** API or MCP authentication.
- **Control direction:** Require strong client authentication (API keys, OAuth, or similar).

### T-11: Retrieval without authorization filters

A query executes without tenant, workspace, or project scope filters, returning records from unauthorized scopes.

- **Stage:** Database query construction.
- **Control direction:** Authorization filters must be mandatory in the data-access layer, not optional at the call site.

## Out-of-scope for Phase 1

- Implementation of any mitigation above.
- Compliance certifications (SOC 2, ISO 27001, etc.).
- Penetration testing or formal security review.
- Production infrastructure security hardening.
