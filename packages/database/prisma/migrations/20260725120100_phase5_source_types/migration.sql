-- Phase 5C: allow Harvester/Publisher source types on source_artifacts

ALTER TABLE source_artifacts SET (schema_locked = false);

ALTER TABLE source_artifacts DROP CONSTRAINT IF EXISTS source_artifacts_source_type_check;
ALTER TABLE source_artifacts ADD CONSTRAINT source_artifacts_source_type_check CHECK (
  source_type IN (
    'CONVERSATION',
    'DOCUMENT',
    'EMAIL',
    'CALENDAR',
    'API',
    'MANUAL',
    'SYSTEM',
    'UPLOAD',
    'HARVEST',
    'DRIVE'
  )
);

ALTER TABLE source_artifacts SET (schema_locked = true);
