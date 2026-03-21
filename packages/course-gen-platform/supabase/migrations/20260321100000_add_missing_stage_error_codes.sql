-- Add missing error codes to stage_error_code enum
-- Bug: TypeScript PipelineErrorCode type includes values not in PostgreSQL enum
-- Caused: PG error 22P02 "invalid input value for enum stage_error_code: 'LLM_ERROR'"

ALTER TYPE stage_error_code ADD VALUE IF NOT EXISTS 'LLM_ERROR';
ALTER TYPE stage_error_code ADD VALUE IF NOT EXISTS 'MINIMUM_LESSONS_NOT_MET';
ALTER TYPE stage_error_code ADD VALUE IF NOT EXISTS 'CONTENT_POLICY_VIOLATION';
ALTER TYPE stage_error_code ADD VALUE IF NOT EXISTS 'NETWORK_ERROR';
ALTER TYPE stage_error_code ADD VALUE IF NOT EXISTS 'RATE_LIMIT_ERROR';
