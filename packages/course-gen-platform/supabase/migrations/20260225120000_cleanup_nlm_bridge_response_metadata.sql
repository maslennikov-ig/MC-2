-- Migration: 20260225120000_cleanup_nlm_bridge_response_metadata.sql
-- Purpose: Clean up bloated bridge_response metadata from existing NLM enrichments.
--
-- Each NLM enrichment stores ~28MB in metadata->'additional_info'->'bridge_response'
-- (full bridge HTTP response including base64 audio in the artifact field).
-- 5 enrichments = ~73MB of metadata in PostgreSQL.
--
-- This migration strips bridge_response down to essential tracking fields only,
-- removing artifact.audio_base64, artifact.segments, artifact.transcript, etc.
-- It also cleans up bridge_start_response if present.
--
-- Guard: pg_column_size(metadata) > 100000 ensures we only touch bloated rows (>100KB).
-- Expected savings: ~73MB for existing data.

-- 1. Clean up bridge_response: keep only essential tracking fields
UPDATE lesson_enrichments
SET metadata = jsonb_set(
  metadata,
  '{additional_info,bridge_response}',
  jsonb_build_object(
    'task_id', metadata->'additional_info'->'bridge_response'->>'task_id',
    'status', metadata->'additional_info'->'bridge_response'->>'status',
    'artifact_duration_seconds', metadata->'additional_info'->'bridge_response'->'artifact'->>'duration_seconds',
    'notebook_id', metadata->'additional_info'->'bridge_response'->'artifact'->'metadata'->>'notebook_id',
    'artifact_id', metadata->'additional_info'->'bridge_response'->'artifact'->'metadata'->>'artifact_id',
    'recovery_status', metadata->'additional_info'->'bridge_response'->'artifact'->'metadata'->>'status'
  )
)
WHERE enrichment_type IN ('nlm_audio', 'nlm_video')
  AND metadata->'additional_info'->'bridge_response' IS NOT NULL
  AND pg_column_size(metadata) > 100000;

-- 2. Clean up bridge_start_response (same pattern, sometimes present)
UPDATE lesson_enrichments
SET metadata = jsonb_set(
  metadata,
  '{additional_info,bridge_start_response}',
  jsonb_build_object(
    'task_id', metadata->'additional_info'->'bridge_start_response'->>'task_id',
    'status', metadata->'additional_info'->'bridge_start_response'->>'status'
  )
)
WHERE enrichment_type IN ('nlm_audio', 'nlm_video')
  AND metadata->'additional_info'->'bridge_start_response' IS NOT NULL
  AND pg_column_size(metadata) > 100000;
