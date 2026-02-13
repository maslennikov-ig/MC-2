-- ============================================================================
-- Migration: 20260213110000_add_course_nodes_parent_integrity_trigger.sql
-- Purpose: Add BEFORE INSERT trigger to validate parent integrity on course_nodes
--
-- Problem:
--   The existing schema has a FK constraint (parent_id -> course_nodes.id)
--   and a CHECK constraint (sections have NULL parent, lessons have NOT NULL
--   parent). However, there is NO validation that:
--     1. A child node's parent belongs to the same course (course_id match)
--     2. A child node's parent is actually a section (node_type = 'section')
--
--   Without these checks, it is theoretically possible to:
--     - Create a lesson under a section from a DIFFERENT course
--     - Create a lesson under another lesson (nesting beyond 2 levels)
--
-- Solution:
--   A BEFORE INSERT trigger function that, when parent_id IS NOT NULL,
--   looks up the parent row and validates both conditions. This works
--   correctly with batch inserts because our write pattern inserts
--   parent (section) rows BEFORE child (lesson) rows within the same
--   transaction, so the parent is visible to the trigger.
--
-- Date: 2026-02-13
-- ============================================================================

-- ============================================================================
-- PART 1: TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_course_node_parent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_parent_course_id UUID;
    v_parent_node_type TEXT;
BEGIN
    -- Root sections (parent_id IS NULL) need no parent validation
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Look up the parent row. Since parents are inserted before children
    -- in our batch write pattern (DELETE all + INSERT all with sections first),
    -- the parent row will already exist in the table at this point.
    SELECT course_id, node_type
    INTO v_parent_course_id, v_parent_node_type
    FROM course_nodes
    WHERE id = NEW.parent_id;

    -- Parent must exist (FK already enforces this, but be defensive)
    IF v_parent_course_id IS NULL THEN
        RAISE EXCEPTION 'course_nodes parent integrity violation: parent_id "%" does not exist',
            NEW.parent_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- Check 1: Parent must belong to the same course
    IF v_parent_course_id != NEW.course_id THEN
        RAISE EXCEPTION 'course_nodes parent integrity violation: node "%" (course_id=%) references parent "%" which belongs to a different course (course_id=%)',
            NEW.id, NEW.course_id, NEW.parent_id, v_parent_course_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- Check 2: Parent must be a section (no lesson-under-lesson nesting)
    IF v_parent_node_type != 'section' THEN
        RAISE EXCEPTION 'course_nodes parent integrity violation: node "%" references parent "%" which has node_type="%" (expected "section")',
            NEW.id, NEW.parent_id, v_parent_node_type
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_course_node_parent() IS
    'BEFORE INSERT trigger function for course_nodes. Validates that when parent_id is set: (1) parent belongs to the same course, (2) parent is a section. Prevents cross-course references and deep nesting.';

-- ============================================================================
-- PART 2: CREATE TRIGGER
-- ============================================================================

CREATE TRIGGER trg_course_nodes_validate_parent
    BEFORE INSERT ON course_nodes
    FOR EACH ROW
    EXECUTE FUNCTION validate_course_node_parent();

COMMENT ON TRIGGER trg_course_nodes_validate_parent ON course_nodes IS
    'Validates parent integrity on insert: same course_id and parent must be a section.';

-- ============================================================================
-- PART 3: MIGRATION VALIDATION
-- ============================================================================

DO $$
DECLARE
    v_trigger_exists BOOLEAN;
    v_function_exists BOOLEAN;
BEGIN
    -- Verify the trigger function was created
    SELECT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'validate_course_node_parent'
          AND pronamespace = 'public'::regnamespace
    ) INTO v_function_exists;

    IF NOT v_function_exists THEN
        RAISE EXCEPTION 'Migration failed: validate_course_node_parent() function not created';
    END IF;

    -- Verify the trigger was created on course_nodes
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_course_nodes_validate_parent'
          AND tgrelid = 'public.course_nodes'::regclass
    ) INTO v_trigger_exists;

    IF NOT v_trigger_exists THEN
        RAISE EXCEPTION 'Migration failed: trg_course_nodes_validate_parent trigger not created on course_nodes';
    END IF;

    RAISE NOTICE 'Migration 20260213110000_add_course_nodes_parent_integrity_trigger completed successfully';
    RAISE NOTICE 'Created:';
    RAISE NOTICE '  - Function: validate_course_node_parent() [SECURITY DEFINER, plpgsql]';
    RAISE NOTICE '  - Trigger: trg_course_nodes_validate_parent [BEFORE INSERT, FOR EACH ROW]';
    RAISE NOTICE 'Validates: parent.course_id = child.course_id AND parent.node_type = section';
END;
$$;
