-- Migration: Add question_type and convert user_answer to JSONB
-- Purpose: Support different question types (open, single_choice, multi_choice)
-- for Clarifying Questions feature
--
-- Changes:
-- 1. Add question_type column with CHECK constraint
-- 2. Convert user_answer from TEXT to JSONB for structured answers
-- 3. Migrate existing data: "text" -> {"value": "text"}
-- 4. Add index for question_type filtering
--
-- Backwards compatible: existing code reading user_answer as string
-- will need to be updated to read from JSONB

-- ============================================================================
-- STEP 1: Add question_type column with CHECK constraint
-- ============================================================================

-- Add column if not exists (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'clarifying_questions'
        AND column_name = 'question_type'
    ) THEN
        ALTER TABLE clarifying_questions
        ADD COLUMN question_type TEXT NOT NULL DEFAULT 'open';

        RAISE NOTICE 'Added question_type column';
    ELSE
        RAISE NOTICE 'question_type column already exists';
    END IF;
END $$;

-- Add CHECK constraint if not exists (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'clarifying_questions_question_type_check'
        AND conrelid = 'clarifying_questions'::regclass
    ) THEN
        ALTER TABLE clarifying_questions
        ADD CONSTRAINT clarifying_questions_question_type_check
        CHECK (question_type IN ('open', 'single_choice', 'multi_choice'));

        RAISE NOTICE 'Added CHECK constraint for question_type';
    ELSE
        RAISE NOTICE 'CHECK constraint already exists';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Convert user_answer from TEXT to JSONB
-- ============================================================================

-- Check current column type and convert if needed
DO $$
DECLARE
    current_type TEXT;
BEGIN
    SELECT data_type INTO current_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'clarifying_questions'
    AND column_name = 'user_answer';

    IF current_type = 'text' THEN
        -- Convert TEXT to JSONB with data migration
        -- Old: "some text" -> New: {"value": "some text"}
        -- NULL remains NULL
        ALTER TABLE clarifying_questions
        ALTER COLUMN user_answer TYPE JSONB
        USING CASE
            WHEN user_answer IS NULL THEN NULL
            ELSE jsonb_build_object('value', user_answer)
        END;

        RAISE NOTICE 'Converted user_answer from TEXT to JSONB';
    ELSIF current_type = 'jsonb' THEN
        RAISE NOTICE 'user_answer is already JSONB';
    ELSE
        RAISE NOTICE 'user_answer has unexpected type: %', current_type;
    END IF;
END $$;

-- ============================================================================
-- STEP 3: Add index for question_type (for filtering queries)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_clarifying_questions_question_type
ON clarifying_questions (course_id, question_type);

-- ============================================================================
-- STEP 4: Add documentation comments
-- ============================================================================

COMMENT ON COLUMN clarifying_questions.question_type IS
'Question type determines UI rendering and answer validation:
- open: Free text input with AI recommendation (default)
- single_choice: Radio buttons, select one option
- multi_choice: Checkboxes, select multiple options';

COMMENT ON COLUMN clarifying_questions.user_answer IS
'User answer in JSONB format:
- For open/single_choice: {"value": "answer text"}
- For multi_choice: {"values": ["opt1", "opt2"]}
- NULL if not yet answered';

COMMENT ON INDEX idx_clarifying_questions_question_type IS
'Index for filtering questions by type within a course.
Supports queries like: WHERE course_id = X AND question_type = Y';

-- ============================================================================
-- VERIFICATION: Log migration results
-- ============================================================================

DO $$
DECLARE
    question_type_check BOOLEAN;
    user_answer_type TEXT;
    index_exists BOOLEAN;
BEGIN
    -- Check question_type column
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'clarifying_questions'
        AND column_name = 'question_type'
    ) INTO question_type_check;

    -- Check user_answer type
    SELECT data_type INTO user_answer_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'clarifying_questions'
    AND column_name = 'user_answer';

    -- Check index
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_clarifying_questions_question_type'
    ) INTO index_exists;

    RAISE NOTICE '=== Migration Verification ===';
    RAISE NOTICE 'question_type column exists: %', question_type_check;
    RAISE NOTICE 'user_answer column type: %', user_answer_type;
    RAISE NOTICE 'question_type index exists: %', index_exists;
    RAISE NOTICE '==============================';
END $$;
