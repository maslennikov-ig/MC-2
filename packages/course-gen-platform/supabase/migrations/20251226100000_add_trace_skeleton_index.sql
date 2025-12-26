-- ============================================================================
-- Migration: Add skeleton index for trace graph loading
-- Purpose: Optimize the skeleton query that fetches all traces without heavy JSONB
-- Applied: 2025-12-26 via Supabase MCP
-- ============================================================================

-- Create composite index for skeleton query
-- This index covers: WHERE course_id = X ORDER BY created_at DESC
-- INCLUDE adds small columns that can be fetched from index (Index-Only Scan)
-- Note: error_data excluded from INCLUDE as JSONB can exceed index row limit
CREATE INDEX IF NOT EXISTS idx_trace_skeleton
ON generation_trace (course_id, created_at DESC)
INCLUDE (id, stage, phase, step_name, duration_ms, tokens_used, lesson_id, retry_attempt);

-- Create partial index for critical data query (Stage 4/5 complete phases)
-- This makes filtering Stage 4/5 complete phases very fast
-- Note: output_data NOT in INCLUDE as it exceeds 8KB index limit
CREATE INDEX IF NOT EXISTS idx_trace_critical_phases
ON generation_trace (course_id, stage, phase)
WHERE stage IN ('stage_4', 'stage_5') AND phase = 'complete';

-- Add comments for documentation
COMMENT ON INDEX idx_trace_skeleton IS
'Composite index for skeleton trace loading - covers metadata columns without heavy JSONB';

COMMENT ON INDEX idx_trace_critical_phases IS
'Partial index for Stage 4/5 complete phases - fast filter for critical results';
