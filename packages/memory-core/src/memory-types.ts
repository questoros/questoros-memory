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
  'GOAL',
  'CONSTRAINT',
  'ACTION_RESULT',
  'CHECKPOINT',
  'ARTIFACT_SUMMARY',
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
  'DRIVE',
  'UPLOAD',
  'HARVEST',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

// ── Candidate statuses ───────────────────────────────────────
export const CANDIDATE_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CONFLICT',
  'DUPLICATE',
  'NEAR_DUPLICATE',
] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

// ── Harvest run statuses ─────────────────────────────────────
export const HARVEST_RUN_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as const;
export type HarvestRunStatus = (typeof HARVEST_RUN_STATUSES)[number];

// ── Publish sync directions / statuses ───────────────────────
export const SYNC_DIRECTIONS = ['EXPORT_ONLY', 'IMPORT_ONLY', 'BIDIRECTIONAL_REVIEWED'] as const;
export type SyncDirection = (typeof SYNC_DIRECTIONS)[number];

export const SYNC_STATUSES = [
  'PENDING',
  'PUBLISHED',
  'EXTERNAL_CHANGED',
  'SYNC_CONFLICT',
  'REPUBLISHED',
  'FAILED',
] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

// ── Audit outcomes ───────────────────────────────────────────
export const AUDIT_OUTCOMES = ['SUCCESS', 'DENIED', 'FAILED'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];
