-- Add BARRIER_FAILED to stage_error_code enum
-- This error code is used when Stage 3 → Stage 4 barrier validation fails
-- (e.g., not all documents were successfully processed)

ALTER TYPE stage_error_code ADD VALUE IF NOT EXISTS 'BARRIER_FAILED';

COMMENT ON TYPE stage_error_code IS 'Error codes for course generation stages:
- LOCK_ACQUISITION_FAILED: Could not acquire generation lock
- ORCHESTRATION_FAILED: Stage orchestration failed
- VALIDATION_FAILED: Input/output validation failed
- QUALITY_THRESHOLD_NOT_MET: Quality score below threshold
- DATABASE_ERROR: Database operation failed
- TIMEOUT: Operation timed out
- BARRIER_FAILED: Stage barrier validation failed (e.g., prerequisite stage not complete)
- UNKNOWN: Unclassified error';
