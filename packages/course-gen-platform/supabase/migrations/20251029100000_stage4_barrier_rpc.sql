-- Stage 4 Barrier RPC Function
-- Consolidates Stage 4 barrier queries into atomic database operation
-- Replaces client-side filtering with efficient database-side counting
-- Part of Phase 9 production readiness improvements

-- Drop function if it exists (for idempotent migrations)
DROP FUNCTION IF EXISTS check_stage4_barrier(UUID);

-- Create RPC function for Stage 4 barrier check
-- Returns total count, completed count, and whether to proceed
CREATE OR REPLACE FUNCTION check_stage4_barrier(p_course_id UUID)
RETURNS TABLE(
  total_count BIGINT,
  completed_count BIGINT,
  can_proceed BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_count,
    COUNT(*) FILTER (WHERE processed_content IS NOT NULL)::BIGINT AS completed_count,
    (COUNT(*) FILTER (WHERE processed_content IS NOT NULL) = COUNT(*) AND COUNT(*) > 0)::BOOLEAN AS can_proceed
  FROM file_catalog
  WHERE course_id = p_course_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION check_stage4_barrier(UUID) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION check_stage4_barrier(UUID) IS
  'Stage 4 barrier validation: Atomically checks if all documents are summarized. ' ||
  'Returns total_count, completed_count, and can_proceed boolean. ' ||
  'Used by orchestration logic to determine if Stage 4 can start.';
