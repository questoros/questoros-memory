-- Phase 5C: expand memories.memory_type for ICARE³ organizational types
-- (GOAL, CONSTRAINT, ACTION_RESULT, CHECKPOINT, ARTIFACT_SUMMARY)

ALTER TABLE memories SET (schema_locked = false);

ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_memory_type_check;
ALTER TABLE memories ADD CONSTRAINT memories_memory_type_check CHECK (
  memory_type IN (
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
    'ARTIFACT_SUMMARY'
  )
);

ALTER TABLE memories SET (schema_locked = true);
