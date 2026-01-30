-- Rollback Migration: Revert question_type and JSONB user_answer changes
-- Issue: MEDIUM-007 (mc2-zs11)
-- Purpose: Rollback script for 20260127_question_types.sql migration
--
-- WARNING: This migration should only be run if you need to revert the changes.
-- Data loss will occur for multi_choice answers (arrays will be converted to comma-separated strings).
--
-- Changes reverted:
-- 1. Convert user_answer from JSONB back to TEXT
-- 2. Remove question_type column
-- 3. Remove idx_clarifying_questions_question_type index
-- 4. Remove idx_clarifying_questions_user_answer_gin index (if exists)

-- ============================================================================
-- STEP 1: Drop GIN index (if exists from MEDIUM-001)
-- ============================================================================

DROP INDEX IF EXISTS idx_clarifying_questions_user_answer_gin;

-- ============================================================================
-- STEP 2: Drop question_type index
-- ============================================================================

DROP INDEX IF EXISTS idx_clarifying_questions_question_type;

-- ============================================================================
-- STEP 3: Convert user_answer from JSONB back to TEXT
-- ============================================================================

DO $$
DECLARE
    current_type TEXT;
BEGIN
    SELECT data_type INTO current_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'clarifying_questions'
    AND column_name = 'user_answer';

    IF current_type = 'jsonb' THEN
        -- Convert JSONB back to TEXT
        -- Handle both formats:
        -- - {"value": "text"} -> "text"
        -- - {"values": ["a", "b"]} -> "a, b"
        -- - NULL remains NULL
        ALTER TABLE clarifying_questions
        ALTER COLUMN user_answer TYPE TEXT
        USING CASE
            WHEN user_answer IS NULL THEN NULL
            WHEN user_answer ? 'values' THEN
                -- Multi-choice: join array values with comma
                (SELECT string_agg(elem::text, ', ')
                 FROM jsonb_array_elements_text(user_answer -> 'values') AS elem)
            WHEN user_answer ? 'value' THEN
                -- Single value: extract text
                user_answer ->> 'value'
            ELSE
                -- Fallback: convert entire JSON to text
                user_answer::text
        END;

        RAISE NOTICE 'Converted user_answer from JSONB to TEXT';
    ELSIF current_type = 'text' THEN
        RAISE NOTICE 'user_answer is already TEXT - no conversion needed';
    ELSE
        RAISE NOTICE 'user_answer has unexpected type: % - manual intervention required', current_type;
    END IF;
END $$;

-- ============================================================================
-- STEP 4: Remove question_type CHECK constraint
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'clarifying_questions_question_type_check'
        AND conrelid = 'clarifying_questions'::regclass
    ) THEN
        ALTER TABLE clarifying_questions
        DROP CONSTRAINT clarifying_questions_question_type_check;

        RAISE NOTICE 'Dropped CHECK constraint for question_type';
    ELSE
        RAISE NOTICE 'CHECK constraint does not exist - skipping';
    END IF;
END $$;

-- ============================================================================
-- STEP 5: Remove question_type column
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'clarifying_questions'
        AND column_name = 'question_type'
    ) THEN
        ALTER TABLE clarifying_questions
        DROP COLUMN question_type;

        RAISE NOTICE 'Dropped question_type column';
    ELSE
        RAISE NOTICE 'question_type column does not exist - skipping';
    END IF;
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    question_type_exists BOOLEAN;
    user_answer_type TEXT;
    qt_index_exists BOOLEAN;
    gin_index_exists BOOLEAN;
BEGIN
    -- Check question_type column
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'clarifying_questions'
        AND column_name = 'question_type'
    ) INTO question_type_exists;

    -- Check user_answer type
    SELECT data_type INTO user_answer_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'clarifying_questions'
    AND column_name = 'user_answer';

    -- Check question_type index
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_clarifying_questions_question_type'
    ) INTO qt_index_exists;

    -- Check GIN index
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_clarifying_questions_user_answer_gin'
    ) INTO gin_index_exists;

    RAISE NOTICE '=== Rollback Verification ===';
    RAISE NOTICE 'question_type column removed: %', NOT question_type_exists;
    RAISE NOTICE 'user_answer column type: %', user_answer_type;
    RAISE NOTICE 'question_type index removed: %', NOT qt_index_exists;
    RAISE NOTICE 'GIN index removed: %', NOT gin_index_exists;
    RAISE NOTICE '==============================';

    -- Validation
    IF question_type_exists THEN
        RAISE WARNING 'ROLLBACK INCOMPLETE: question_type column still exists';
    END IF;

    IF user_answer_type != 'text' THEN
        RAISE WARNING 'ROLLBACK INCOMPLETE: user_answer is still %', user_answer_type;
    END IF;
END $$;
