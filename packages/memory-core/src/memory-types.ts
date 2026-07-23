/**
 * Memory core constants and types.
 *
 * These are the canonical allowed value sets for memory classification.
 * Do not duplicate these values between packages.
 */

// ── Scope types ──────────────────────────────────────────────
export const SCOPE_TYPES = ['TENANT', 'WORKSPACE', 'PROJECT'] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

// ── Memory types ─────────────────────────────────────────────
export const MEMORY_TYPES = [
  'PROFILE',
  'PREFERENCE',
  'FACT',
  'DECISION',
  'TASK',
  'EVENT',
  'SUMMARY',
  'INSTRUCTION',
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

// ── Memory statuses ──────────────────────────────────────────
export const MEMORY_STATUSES = ['ACTIVE', 'SUPERSEDED', 'DELETED'] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

// ── Sensitivity values ───────────────────────────────────────
export const SENSITIVITY_VALUES = ['PUBLIC', 'STANDARD', 'SENSITIVE', 'RESTRICTED'] as const;
export type SensitivityValue = (typeof SENSITIVITY_VALUES)[number];

// ── Actor types ──────────────────────────────────────────────
export const ACTOR_TYPES = ['USER', 'AGENT', 'SERVICE', 'SYSTEM'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

// ── Source types ─────────────────────────────────────────────
export const SOURCE_TYPES = [
  'CONVERSATION',
  'DOCUMENT',
  'EMAIL',
  'CALENDAR',
  'API',
  'MANUAL',
  'SYSTEM',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

// ── Audit outcomes ───────────────────────────────────────────
export const AUDIT_OUTCOMES = ['SUCCESS', 'DENIED', 'FAILED'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];
