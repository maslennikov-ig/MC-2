-- Migration: auto_mute_cascade_retry_and_digest
-- Purpose: Mark existing Phase retry warnings and digest section warnings as auto_muted
-- Related: mc2-ppyx - Add auto-mute rules for Stage 4 cascade warnings and digest section warning

-- ============================================================================
-- Mark existing errors as auto_muted
-- ============================================================================

-- Phase retry warnings (cascading_repair)
-- Use DISTINCT ON to avoid duplicate fingerprints in single INSERT
INSERT INTO log_issue_status (log_type, log_id, status, fingerprint, notes, updated_at)
SELECT DISTINCT ON (el.fingerprint) 'error_log', el.id, 'auto_muted', el.fingerprint,
       'cascading_repair: Intermediate retry warning from executePhaseWithRetry',
       NOW()
FROM error_logs el
LEFT JOIN log_issue_status lis ON lis.log_id = el.id AND lis.log_type = 'error_log'
WHERE el.error_message ~* 'Phase phase\d+_\w+ attempt \d+ failed'
  AND lis.id IS NULL
ORDER BY el.fingerprint, el.created_at DESC
ON CONFLICT (fingerprint) WHERE fingerprint IS NOT NULL
DO UPDATE SET updated_at = NOW();

-- No digest section found (graceful_fallback)
INSERT INTO log_issue_status (log_type, log_id, status, fingerprint, notes, updated_at)
SELECT DISTINCT ON (el.fingerprint) 'error_log', el.id, 'auto_muted', el.fingerprint,
       'graceful_fallback: Stage 6 returns empty digest when no digest section exists',
       NOW()
FROM error_logs el
LEFT JOIN log_issue_status lis ON lis.log_id = el.id AND lis.log_type = 'error_log'
WHERE el.error_message ILIKE '%No digest section found%'
  AND lis.id IS NULL
ORDER BY el.fingerprint, el.created_at DESC
ON CONFLICT (fingerprint) WHERE fingerprint IS NOT NULL
DO UPDATE SET updated_at = NOW();
