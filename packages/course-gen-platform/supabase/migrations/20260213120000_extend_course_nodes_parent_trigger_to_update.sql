-- ============================================================================
-- Migration: 20260213120000_extend_course_nodes_parent_trigger_to_update.sql
-- Purpose: Extend trg_course_nodes_validate_parent to also fire on UPDATE
--
-- Problem:
--   The trigger created in 20260213110000 only fires on INSERT. If a row's
--   parent_id, course_id, or node_type is modified via UPDATE, the parent
--   integrity checks (same course, parent is a section) are bypassed.
--
-- Solution:
--   Drop the existing trigger and recreate it with
--   BEFORE INSERT OR UPDATE OF parent_id, course_id, node_type
--   so that any change to these columns re-validates parent integrity.
--   The underlying function (validate_course_node_parent) is unchanged.
--
-- Depends on: 20260213110000_add_course_nodes_parent_integrity_trigger
-- Date: 2026-02-13
-- ============================================================================

-- ============================================================================
-- PART 1: DROP EXISTING INSERT-ONLY TRIGGER
-- ============================================================================

DROP TRIGGER IF EXISTS trg_course_nodes_validate_parent ON course_nodes;

-- ============================================================================
-- PART 2: RECREATE TRIGGER FOR INSERT AND UPDATE
-- ============================================================================

CREATE TRIGGER trg_course_nodes_validate_parent
    BEFORE INSERT OR UPDATE OF parent_id, course_id, node_type
    ON course_nodes
    FOR EACH ROW
    EXECUTE FUNCTION validate_course_node_parent();

COMMENT ON TRIGGER trg_course_nodes_validate_parent ON course_nodes IS
    'Validates parent integrity on insert and update of parent_id/course_id/node_type: same course_id and parent must be a section.';

-- ============================================================================
-- PART 3: MIGRATION VALIDATION
-- ============================================================================

DO $$
DECLARE
    v_trigger_exists BOOLEAN;
    v_trigger_events TEXT;
BEGIN
    -- Verify the trigger exists on course_nodes
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_course_nodes_validate_parent'
          AND tgrelid = 'public.course_nodes'::regclass
    ) INTO v_trigger_exists;

    IF NOT v_trigger_exists THEN
        RAISE EXCEPTION 'Migration failed: trg_course_nodes_validate_parent trigger not found on course_nodes';
    END IF;

    -- Verify the trigger fires on both INSERT and UPDATE
    -- pg_trigger.tgtype is a bitmask: bit 2 = BEFORE, bit 3 = INSERT (2+4=6), bit 4 = DELETE, bit 5 = UPDATE (2+16=18)
    -- For BEFORE INSERT OR UPDATE: bits 2 (BEFORE) + 3 (INSERT) + 5 (UPDATE) = 2+4+16 = 22
    -- But with column-specific UPDATE, tgtype should have the UPDATE bit set AND tgattr is non-empty
    SELECT string_agg(event_manipulation, ', ' ORDER BY event_manipulation)
    INTO v_trigger_events
    FROM information_schema.triggers
    WHERE trigger_name = 'trg_course_nodes_validate_parent'
      AND event_object_table = 'course_nodes'
      AND event_object_schema = 'public';

    IF v_trigger_events IS NULL THEN
        RAISE EXCEPTION 'Migration failed: could not read trigger events from information_schema';
    END IF;

    IF v_trigger_events NOT LIKE '%INSERT%' THEN
        RAISE EXCEPTION 'Migration failed: trigger missing INSERT event (got: %)', v_trigger_events;
    END IF;

    IF v_trigger_events NOT LIKE '%UPDATE%' THEN
        RAISE EXCEPTION 'Migration failed: trigger missing UPDATE event (got: %)', v_trigger_events;
    END IF;

    RAISE NOTICE 'Migration 20260213120000_extend_course_nodes_parent_trigger_to_update completed successfully';
    RAISE NOTICE 'Updated:';
    RAISE NOTICE '  - Trigger: trg_course_nodes_validate_parent [BEFORE INSERT OR UPDATE OF parent_id, course_id, node_type]';
    RAISE NOTICE 'Events: %', v_trigger_events;
END;
$$;
