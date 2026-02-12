-- ============================================================================
-- Migration: 20260213000000_create_course_nodes_table.sql
-- Purpose: Create flat relational course_nodes table to replace nested JSONB
--          course_structure column in courses table (Phase 4 normalization)
--
-- Design:
--   course_nodes stores sections and lessons in a flat adjacency-list model.
--   Sections are root nodes (parent_id IS NULL), lessons are children
--   (parent_id references their section). Ordering uses fractional indexing
--   keys (order_key TEXT) for O(1) reordering without renumbering siblings.
--
-- Key constraints:
--   - CHECK: sections must have parent_id IS NULL, lessons must have parent_id IS NOT NULL
--   - Partial unique indexes enforce unique order_key within scope:
--       * Root sections: UNIQUE(course_id, order_key) WHERE parent_id IS NULL
--       * Lessons in section: UNIQUE(course_id, parent_id, order_key) WHERE parent_id IS NOT NULL
--
-- RLS: Follows existing sections_all pattern with superadmin bypass,
--       course_belongs_to_org / course_belongs_to_user helper functions,
--       and (SELECT auth.uid()) init-plan optimization.
--
-- Date: 2026-02-13
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS course_nodes (
    id TEXT PRIMARY KEY,                        -- sec_hY7a3fRx / lsn_kM9b2cQw
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES course_nodes(id) ON DELETE CASCADE,
    node_type TEXT NOT NULL CHECK (node_type IN ('section', 'lesson')),
    order_key TEXT NOT NULL,                    -- fractional indexing key
    title TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',           -- all other fields (description, etc.)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE course_nodes IS 'Flat relational representation of course structure (sections + lessons). Replaces nested JSONB course_structure column. Phase 4 normalization.';
COMMENT ON COLUMN course_nodes.id IS 'Prefixed nanoid: sec_ for sections, lsn_ for lessons';
COMMENT ON COLUMN course_nodes.parent_id IS 'NULL for sections (root nodes), section id for lessons';
COMMENT ON COLUMN course_nodes.node_type IS 'Discriminator: section or lesson';
COMMENT ON COLUMN course_nodes.order_key IS 'Fractional indexing key for O(1) reordering';
COMMENT ON COLUMN course_nodes.data IS 'Flexible JSONB for node-type-specific fields (description, objectives, etc.)';

-- ============================================================================
-- PART 2: CONSTRAINTS
-- ============================================================================

-- Enforce: sections have no parent, lessons always have a parent
ALTER TABLE course_nodes
    ADD CONSTRAINT chk_course_nodes_parent_type
    CHECK (
        (node_type = 'section' AND parent_id IS NULL)
        OR
        (node_type = 'lesson' AND parent_id IS NOT NULL)
    );

-- ============================================================================
-- PART 3: INDEXES
-- ============================================================================

-- Get all nodes for a course (primary access pattern)
CREATE INDEX idx_course_nodes_course
    ON course_nodes(course_id);

-- Get children of a node (lessons within a section)
CREATE INDEX idx_course_nodes_parent
    ON course_nodes(parent_id)
    WHERE parent_id IS NOT NULL;

-- Filter nodes by type within a course
CREATE INDEX idx_course_nodes_type
    ON course_nodes(course_id, node_type);

-- Unique ordering for root-level sections within a course
CREATE UNIQUE INDEX idx_course_nodes_section_order
    ON course_nodes(course_id, order_key)
    WHERE parent_id IS NULL;

-- Unique ordering for lessons within a section
CREATE UNIQUE INDEX idx_course_nodes_lesson_order
    ON course_nodes(course_id, parent_id, order_key)
    WHERE parent_id IS NOT NULL;

-- ============================================================================
-- PART 4: TRIGGER (updated_at)
-- ============================================================================

-- Reuse existing update_updated_at_column() function from initial_schema
CREATE TRIGGER update_course_nodes_updated_at
    BEFORE UPDATE ON course_nodes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PART 5: ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE course_nodes ENABLE ROW LEVEL SECURITY;

-- Single unified policy following the sections_all pattern:
-- SuperAdmin bypass + CASE on JWT role with init-plan optimized auth calls
CREATE POLICY course_nodes_all ON course_nodes
FOR ALL TO authenticated
USING (
    -- SuperAdmin: Access ALL course_nodes across all organizations
    is_superadmin((SELECT auth.uid()))
    OR
    -- Role-based access via course ownership/membership
    CASE ((SELECT auth.jwt()) ->> 'role')
        WHEN 'admin' THEN
            -- Admins: access nodes for courses in their organization
            course_belongs_to_org(course_id, (((SELECT auth.jwt()) ->> 'organization_id')::uuid))
        WHEN 'instructor' THEN
            -- Instructors: access nodes for courses in their organization
            course_belongs_to_org(course_id, (((SELECT auth.jwt()) ->> 'organization_id')::uuid))
        WHEN 'student' THEN
            -- Students: access nodes for enrolled courses
            is_enrolled_in_course((SELECT auth.uid()), course_id)
        ELSE false
    END
)
WITH CHECK (
    -- SuperAdmin: Can modify ALL course_nodes
    is_superadmin((SELECT auth.uid()))
    OR
    -- Role-based write access
    CASE ((SELECT auth.jwt()) ->> 'role')
        WHEN 'admin' THEN
            -- Admins: modify nodes for org courses
            course_belongs_to_org(course_id, (((SELECT auth.jwt()) ->> 'organization_id')::uuid))
        WHEN 'instructor' THEN
            -- Instructors: modify nodes only for own courses
            course_belongs_to_user(course_id, (SELECT auth.uid()))
        ELSE false
    END
);

COMMENT ON POLICY course_nodes_all ON course_nodes IS
    'Unified policy: SuperAdmin full access, admin/instructor org-scoped access, students read-only for enrolled courses. Follows sections_all pattern with init-plan optimization.';

-- ============================================================================
-- PART 6: ADD REALTIME (optional, for live collaboration)
-- ============================================================================

-- Enable Supabase Realtime for course_nodes to support live structure updates
-- This follows the same pattern as courses table (20251126143000_add_courses_to_realtime.sql)
ALTER PUBLICATION supabase_realtime ADD TABLE course_nodes;

-- ============================================================================
-- PART 7: UPDATE restart_from_stage RPC
-- ============================================================================
-- When restarting from stage 5 or earlier, course_nodes data must be cleared
-- because Stage 5 is where course_structure (and now course_nodes) is generated.

CREATE OR REPLACE FUNCTION public.restart_from_stage(
  p_course_id UUID,
  p_stage_number INTEGER,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course RECORD;
  v_target_status TEXT;
  v_old_status TEXT;
  v_result JSONB;
  v_deleted_traces INTEGER;
  v_deleted_nodes INTEGER;
BEGIN
  -- 1. Validate stage number (2-6 are valid, 1 is initialization)
  IF p_stage_number < 2 OR p_stage_number > 6 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid stage number. Must be between 2 and 6.',
      'code', 'INVALID_STAGE'
    );
  END IF;

  -- 2. Get course and verify ownership
  SELECT id, user_id, generation_status, organization_id
  INTO v_course
  FROM courses
  WHERE id = p_course_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Course not found',
      'code', 'NOT_FOUND'
    );
  END IF;

  -- 3. Verify ownership
  IF v_course.user_id != p_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Access denied. You do not own this course.',
      'code', 'FORBIDDEN'
    );
  END IF;

  -- 4. Determine target status based on stage
  v_target_status := CASE p_stage_number
    WHEN 2 THEN 'stage_2_init'
    WHEN 3 THEN 'stage_3_init'
    WHEN 4 THEN 'stage_4_init'
    WHEN 5 THEN 'stage_5_init'
    WHEN 6 THEN 'stage_5_complete' -- Stage 6 starts from Stage 5 complete
  END;

  -- 5. Store old status for logging
  v_old_status := v_course.generation_status::TEXT;

  -- 6. Check if restart is allowed from current status
  -- Allow restart from ANY state except 'pending' (nothing to restart)
  IF v_course.generation_status = 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot restart from pending status. Generation has not started yet.',
      'code', 'INVALID_STATE'
    );
  END IF;

  -- 7. Disable trigger temporarily and update status
  PERFORM set_config('app.bypass_fsm_validation', 'true', true);

  -- 8. Clear stage-specific data based on target stage
  UPDATE courses
  SET
    generation_status = v_target_status::generation_status,
    -- Clear error fields
    error_message = NULL,
    error_details = NULL,
    error_code = NULL,
    failed_at_stage = NULL,
    -- Clear stage 4+ data if restarting from stage 4 or earlier
    analysis_result = CASE
      WHEN p_stage_number <= 4 THEN NULL
      ELSE analysis_result
    END,
    -- Clear stage 5+ data if restarting from stage 5 or earlier
    course_structure = CASE
      WHEN p_stage_number <= 5 THEN NULL
      ELSE course_structure
    END,
    -- Reset completion timestamp
    generation_completed_at = NULL,
    completed_at = NULL,
    -- Update timestamps
    last_progress_update = NOW(),
    updated_at = NOW()
  WHERE id = p_course_id;

  -- Reset bypass flag
  PERFORM set_config('app.bypass_fsm_validation', 'false', true);

  -- 9. Delete course_nodes for stage 5+ restart (course_nodes are generated in Stage 5)
  v_deleted_nodes := 0;
  IF p_stage_number <= 5 THEN
    DELETE FROM course_nodes WHERE course_id = p_course_id;
    GET DIAGNOSTICS v_deleted_nodes = ROW_COUNT;
  END IF;

  -- 10. Delete generation_trace records for stages >= target
  DELETE FROM generation_trace
  WHERE course_id = p_course_id
    AND (
      (p_stage_number <= 2 AND stage LIKE 'stage_2%')
      OR (p_stage_number <= 3 AND stage LIKE 'stage_3%')
      OR (p_stage_number <= 4 AND stage LIKE 'stage_4%')
      OR (p_stage_number <= 5 AND stage LIKE 'stage_5%')
      OR (p_stage_number <= 6 AND stage LIKE 'stage_6%')
    );

  GET DIAGNOSTICS v_deleted_traces = ROW_COUNT;

  -- 11. Log the transition
  INSERT INTO generation_status_history (
    course_id,
    old_status,
    new_status,
    changed_by,
    trigger_source,
    metadata
  ) VALUES (
    p_course_id,
    v_old_status::generation_status,
    v_target_status::generation_status,
    p_user_id,
    'restart_from_stage_rpc',
    jsonb_build_object(
      'stage_number', p_stage_number,
      'initiated_at', NOW(),
      'data_cleared', jsonb_build_object(
        'analysis_result', p_stage_number <= 4,
        'course_structure', p_stage_number <= 5,
        'course_nodes_deleted', v_deleted_nodes,
        'traces_deleted', v_deleted_traces
      )
    )
  );

  -- 12. Return success
  v_result := jsonb_build_object(
    'success', true,
    'courseId', p_course_id,
    'previousStatus', v_old_status,
    'newStatus', v_target_status,
    'stageNumber', p_stage_number,
    'organizationId', v_course.organization_id,
    'dataCleared', jsonb_build_object(
      'analysisResult', p_stage_number <= 4,
      'courseStructure', p_stage_number <= 5,
      'courseNodesDeleted', v_deleted_nodes,
      'tracesDeleted', v_deleted_traces
    )
  );

  RETURN v_result;
END;
$$;

-- Update comment
COMMENT ON FUNCTION public.restart_from_stage IS
'Restart course generation from a specific stage.
Allows restart from any state except pending.
Clears stage-specific data: analysis_result (stage 4+), course_structure (stage 5+), course_nodes (stage 5+).
Deletes generation_trace records for restarted stages.
Bypasses FSM validation. Stage 2-6 supported. Ownership validated.';

-- ============================================================================
-- PART 8: MIGRATION VALIDATION
-- ============================================================================

DO $$
DECLARE
  v_table_exists BOOLEAN;
  v_constraint_exists BOOLEAN;
  v_policy_exists BOOLEAN;
  v_index_count INTEGER;
BEGIN
  -- Verify table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'course_nodes'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'Migration failed: course_nodes table not created';
  END IF;

  -- Verify CHECK constraint
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'course_nodes'
      AND constraint_name = 'chk_course_nodes_parent_type'
      AND constraint_type = 'CHECK'
  ) INTO v_constraint_exists;

  IF NOT v_constraint_exists THEN
    RAISE EXCEPTION 'Migration failed: chk_course_nodes_parent_type constraint not found';
  END IF;

  -- Verify RLS is enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'course_nodes' AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'Migration failed: RLS not enabled on course_nodes';
  END IF;

  -- Verify policy exists
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'course_nodes' AND policyname = 'course_nodes_all'
  ) INTO v_policy_exists;

  IF NOT v_policy_exists THEN
    RAISE EXCEPTION 'Migration failed: course_nodes_all RLS policy not found';
  END IF;

  -- Verify indexes
  SELECT COUNT(*) INTO v_index_count
  FROM pg_indexes
  WHERE tablename = 'course_nodes'
    AND indexname IN (
      'idx_course_nodes_course',
      'idx_course_nodes_parent',
      'idx_course_nodes_type',
      'idx_course_nodes_section_order',
      'idx_course_nodes_lesson_order'
    );

  IF v_index_count < 5 THEN
    RAISE EXCEPTION 'Migration failed: Expected 5 indexes, found %', v_index_count;
  END IF;

  -- Verify restart_from_stage was updated
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'restart_from_stage'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'Migration failed: restart_from_stage function not found';
  END IF;

  RAISE NOTICE 'Migration 20260213000000_create_course_nodes_table completed successfully';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - course_nodes table with TEXT PK (prefixed nanoid)';
  RAISE NOTICE '  - CHECK constraint: sections have no parent, lessons require parent';
  RAISE NOTICE '  - 5 indexes (course, parent, type, section_order, lesson_order)';
  RAISE NOTICE '  - RLS policy: course_nodes_all (superadmin + role-based)';
  RAISE NOTICE '  - Realtime enabled';
  RAISE NOTICE '  - updated_at trigger';
  RAISE NOTICE '  - restart_from_stage RPC updated to clear course_nodes on stage <= 5';
END;
$$;
