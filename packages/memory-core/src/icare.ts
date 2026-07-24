/**
 * ICARE³™ domain contract for agentic organizational memory.
 *
 * Public lifecycle:
 *   Issue → Context → Analysis → Recommendations → Evaluation → Execution → Evaluation
 *
 * Internal identifiers distinguish the two Evaluation stages:
 *   RECOMMENDATION_EVALUATION — assesses recommendations before action
 *   EXECUTION_EVALUATION — measures execution, outcomes, evidence, lessons
 *
 * Schema decision: no new migration. Lifecycle and chain fields are stored under
 * `metadata.icare` on the existing Memory model. Title is stored as
 * `metadata.title`. Provenance continues to use sourceArtifactId, actorId,
 * revisions, and audit events. `memoryType` remains content classification.
 */

export const ICARE_PRODUCT_NAME = 'ICARE³™';
export const ICARE_PRODUCT_TAGLINE = 'Agentic Persistent Memory for Organizational Intelligence';

export const ICARE_ELEVATOR_PITCH =
  'ICARE³ gives organizations agentic memory that preserves reasoning, decisions, actions, and outcomes—so every AI interaction improves the next.';

export const ICARE_PUBLIC_LIFECYCLE =
  'Issue → Context → Analysis → Recommendations → Evaluation → Execution → Evaluation';

export const ICARE_LIFECYCLE_STAGES = [
  'ISSUE',
  'CONTEXT',
  'ANALYSIS',
  'RECOMMENDATIONS',
  'RECOMMENDATION_EVALUATION',
  'EXECUTION',
  'EXECUTION_EVALUATION',
] as const;

export type IcareLifecycleStage = (typeof ICARE_LIFECYCLE_STAGES)[number];

/** Public-facing labels. Both evaluation stages display as "Evaluation". */
export const ICARE_PUBLIC_STAGE_LABELS: Record<IcareLifecycleStage, string> = {
  ISSUE: 'Issue',
  CONTEXT: 'Context',
  ANALYSIS: 'Analysis',
  RECOMMENDATIONS: 'Recommendations',
  RECOMMENDATION_EVALUATION: 'Evaluation',
  EXECUTION: 'Execution',
  EXECUTION_EVALUATION: 'Evaluation',
};

export const ICARE_METADATA_KEY = 'icare' as const;
export const TITLE_METADATA_KEY = 'title' as const;

export interface IcareMetadata {
  icareStage: IcareLifecycleStage;
  reasoningChainId?: string;
  relatedMemoryIds?: string[];
  evaluationTargetMemoryId?: string;
  executionStatus?: string;
  outcomeSummary?: string;
  lessonsLearned?: string[];
}

export function isIcareLifecycleStage(value: unknown): value is IcareLifecycleStage {
  return typeof value === 'string' && (ICARE_LIFECYCLE_STAGES as readonly string[]).includes(value);
}

export function getIcarePublicLabel(stage: IcareLifecycleStage): string {
  return ICARE_PUBLIC_STAGE_LABELS[stage];
}

export function extractIcareMetadata(
  metadata: Record<string, unknown> | null | undefined,
): IcareMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = metadata[ICARE_METADATA_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (!isIcareLifecycleStage(record.icareStage)) return null;

  const result: IcareMetadata = { icareStage: record.icareStage };

  if (typeof record.reasoningChainId === 'string') {
    result.reasoningChainId = record.reasoningChainId;
  }
  if (typeof record.evaluationTargetMemoryId === 'string') {
    result.evaluationTargetMemoryId = record.evaluationTargetMemoryId;
  }
  if (typeof record.executionStatus === 'string') {
    result.executionStatus = record.executionStatus;
  }
  if (typeof record.outcomeSummary === 'string') {
    result.outcomeSummary = record.outcomeSummary;
  }
  if (Array.isArray(record.relatedMemoryIds)) {
    result.relatedMemoryIds = record.relatedMemoryIds.filter(
      (id): id is string => typeof id === 'string',
    );
  }
  if (Array.isArray(record.lessonsLearned)) {
    result.lessonsLearned = record.lessonsLearned.filter(
      (lesson): lesson is string => typeof lesson === 'string',
    );
  }

  return result;
}

export function extractTitle(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const title = metadata[TITLE_METADATA_KEY];
  return typeof title === 'string' ? title : null;
}

export interface IcareRequestFields {
  title?: string;
  icareStage?: IcareLifecycleStage;
  reasoningChainId?: string;
  relatedMemoryIds?: string[];
  evaluationTargetMemoryId?: string;
  executionStatus?: string;
  outcomeSummary?: string;
  lessonsLearned?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Merge freeform metadata with ICARE³ request fields into a single metadata object.
 * Top-level ICARE request fields overwrite `metadata.icare` keys of the same name.
 */
export function mergeMemoryMetadata(input: IcareRequestFields): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ...(input.metadata ?? {}),
  };

  if (input.title !== undefined) {
    base[TITLE_METADATA_KEY] = input.title;
  }

  const existingIcare =
    base[ICARE_METADATA_KEY] &&
    typeof base[ICARE_METADATA_KEY] === 'object' &&
    !Array.isArray(base[ICARE_METADATA_KEY])
      ? { ...(base[ICARE_METADATA_KEY] as Record<string, unknown>) }
      : {};

  const nextIcare: Record<string, unknown> = { ...existingIcare };

  if (input.icareStage !== undefined) nextIcare.icareStage = input.icareStage;
  if (input.reasoningChainId !== undefined) {
    nextIcare.reasoningChainId = input.reasoningChainId;
  }
  if (input.relatedMemoryIds !== undefined) {
    nextIcare.relatedMemoryIds = input.relatedMemoryIds;
  }
  if (input.evaluationTargetMemoryId !== undefined) {
    nextIcare.evaluationTargetMemoryId = input.evaluationTargetMemoryId;
  }
  if (input.executionStatus !== undefined) {
    nextIcare.executionStatus = input.executionStatus;
  }
  if (input.outcomeSummary !== undefined) {
    nextIcare.outcomeSummary = input.outcomeSummary;
  }
  if (input.lessonsLearned !== undefined) {
    nextIcare.lessonsLearned = input.lessonsLearned;
  }

  if (Object.keys(nextIcare).length > 0) {
    const wroteIcareFields =
      input.icareStage !== undefined ||
      input.reasoningChainId !== undefined ||
      input.relatedMemoryIds !== undefined ||
      input.evaluationTargetMemoryId !== undefined ||
      input.executionStatus !== undefined ||
      input.outcomeSummary !== undefined ||
      input.lessonsLearned !== undefined ||
      Object.keys(existingIcare).length > 0;

    if (wroteIcareFields && typeof nextIcare.icareStage !== 'string') {
      throw new Error('icareStage is required when ICARE³ metadata fields are present.');
    }
    if (typeof nextIcare.icareStage === 'string') {
      base[ICARE_METADATA_KEY] = nextIcare;
    }
  }

  return base;
}

export function collectRelatedMemoryIds(fields: IcareRequestFields): string[] {
  const ids = new Set<string>();
  for (const id of fields.relatedMemoryIds ?? []) ids.add(id);
  if (fields.evaluationTargetMemoryId) ids.add(fields.evaluationTargetMemoryId);
  const fromMeta = extractIcareMetadata(fields.metadata ?? {});
  for (const id of fromMeta?.relatedMemoryIds ?? []) ids.add(id);
  if (fromMeta?.evaluationTargetMemoryId) ids.add(fromMeta.evaluationTargetMemoryId);
  return [...ids];
}
