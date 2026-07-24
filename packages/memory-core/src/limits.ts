/** Canonical size and pagination limits for memory contracts. */

export const MAX_CONTENT_BYTES = 64 * 1024; // 64 KiB
export const MAX_METADATA_BYTES = 32 * 1024; // 32 KiB
export const MAX_METADATA_DEPTH = 8;
export const MAX_TITLE_LENGTH = 200;
export const MAX_REASON_BYTES = 4 * 1024; // 4 KiB
export const MAX_QUERY_TEXT_BYTES = 8 * 1024; // 8 KiB
export const MAX_OUTCOME_SUMMARY_LENGTH = 4_000;
export const MAX_LESSON_LENGTH = 2_000;
export const MAX_LESSONS = 32;
export const MAX_RELATED_MEMORY_IDS = 32;
export const MAX_EMBEDDING_MODEL_LENGTH = 256;
export const MAX_CURSOR_LENGTH = 4096;
export const EMBEDDING_DIMENSIONS = 1024;
export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 100;
export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_SEARCH_LIMIT = 100;
export const DEFAULT_EMBEDDING_MODEL = 'amazon.titan-embed-text-v2:0';

export const EXECUTION_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;

export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];
