-- ============================================================================
-- Migration: Add Clarifying Questions (Stage 4 Phase 0.5)
-- Purpose: Enable clarifying questions workflow before Stage 4 Analysis
-- Date: 2026-01-25
-- Related: Stage 4 Phase 0.5 - Clarifying Questions feature
-- ============================================================================

-- ============================================================================
-- Step 1: Add 'stage_4_clarifying' to generation_status enum
-- ============================================================================
ALTER TYPE generation_status ADD VALUE IF NOT EXISTS 'stage_4_clarifying' AFTER 'stage_4_init';

-- ============================================================================
-- Step 2: Create clarifying_questions table
-- ============================================================================
CREATE TABLE IF NOT EXISTS clarifying_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

  -- Question
  question_text TEXT NOT NULL,
  question_priority TEXT NOT NULL CHECK (question_priority IN ('critical', 'important', 'nice_to_have')),
  question_category TEXT, -- topic: audience, content, depth, format, etc.

  -- Suggested answers from AI
  suggested_answers JSONB DEFAULT '[]'::jsonb,
  -- Format: [{ "text": "...", "rationale": "..." }, ...]

  -- User answer
  user_answer TEXT,
  answer_source TEXT CHECK (answer_source IN ('suggested', 'modified', 'custom')),
  -- suggested = accepted AI suggestion as-is
  -- modified = adjusted/extended AI suggestion
  -- custom = wrote completely custom answer
  selected_suggestion_index INTEGER, -- if suggested/modified
  user_modification TEXT, -- addition to suggested (for 'modified')

  -- Metadata
  iteration_round INTEGER NOT NULL DEFAULT 1 CHECK (iteration_round IN (1, 2)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'skipped')),
  order_index INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  answered_at TIMESTAMPTZ,

  -- Additional data
  metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- Step 3: Indexes for clarifying_questions
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_clarifying_questions_course
  ON clarifying_questions(course_id, iteration_round);

CREATE INDEX IF NOT EXISTS idx_clarifying_questions_status
  ON clarifying_questions(course_id, status);

CREATE INDEX IF NOT EXISTS idx_clarifying_questions_priority
  ON clarifying_questions(course_id, question_priority);

CREATE INDEX IF NOT EXISTS idx_clarifying_questions_order
  ON clarifying_questions(course_id, order_index);

-- ============================================================================
-- Step 4: RLS Policies for clarifying_questions
-- ============================================================================
ALTER TABLE clarifying_questions ENABLE ROW LEVEL SECURITY;

-- Owner can read their course's questions
CREATE POLICY clarifying_questions_owner_select ON clarifying_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = clarifying_questions.course_id
      AND courses.user_id = auth.uid()
    )
  );

-- Owner can update (answer) their course's questions
CREATE POLICY clarifying_questions_owner_update ON clarifying_questions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = clarifying_questions.course_id
      AND courses.user_id = auth.uid()
    )
  );

-- Admin can read all
CREATE POLICY clarifying_questions_admin_select ON clarifying_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'superadmin')
    )
  );

-- Service can insert/update (for backend workers)
CREATE POLICY clarifying_questions_service_all ON clarifying_questions
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- Step 5: Update FSM validation function
-- ============================================================================
CREATE OR REPLACE FUNCTION validate_generation_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_valid_transitions JSONB;
  v_bypass TEXT;
BEGIN
  v_bypass := current_setting('app.bypass_fsm_validation', true);
  IF v_bypass = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.generation_status IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.generation_status = OLD.generation_status THEN
    RETURN NEW;
  END IF;

  -- ==========================================================================
  -- COMPLETE FSM TRANSITION MAP (with stage_4_clarifying)
  -- ==========================================================================
  v_valid_transitions := '{
    "pending": ["stage_2_init", "stage_3_init", "stage_4_init", "cancelled"],

    "stage_2_init": ["stage_2_processing", "stage_2_complete", "stage_2_awaiting_approval", "stage_4_init", "failed", "cancelled"],
    "stage_2_processing": ["stage_2_complete", "stage_2_awaiting_approval", "failed", "cancelled"],
    "stage_2_complete": ["stage_2_awaiting_approval", "stage_3_init", "stage_3_summarizing", "stage_4_init", "failed", "cancelled"],
    "stage_2_awaiting_approval": ["stage_3_init", "stage_3_summarizing", "stage_4_init", "cancelled"],

    "stage_3_init": ["stage_3_summarizing", "stage_3_complete", "stage_3_awaiting_approval", "stage_2_complete", "failed", "cancelled"],
    "stage_3_summarizing": ["stage_3_complete", "stage_3_awaiting_approval", "stage_2_complete", "failed", "cancelled"],
    "stage_3_complete": ["stage_3_awaiting_approval", "stage_4_init", "failed", "cancelled"],
    "stage_3_awaiting_approval": ["stage_4_init", "cancelled"],

    "stage_4_init": ["stage_4_clarifying", "stage_4_analyzing", "stage_4_complete", "stage_4_awaiting_approval", "failed", "cancelled"],
    "stage_4_clarifying": ["stage_4_analyzing", "stage_4_complete", "failed", "cancelled"],
    "stage_4_analyzing": ["stage_4_complete", "stage_4_awaiting_approval", "failed", "cancelled"],
    "stage_4_complete": ["stage_4_awaiting_approval", "stage_5_init", "failed", "cancelled"],
    "stage_4_awaiting_approval": ["stage_5_init", "cancelled"],

    "stage_5_init": ["stage_5_generating", "stage_5_complete", "stage_5_awaiting_approval", "failed", "cancelled"],
    "stage_5_generating": ["stage_5_complete", "stage_5_awaiting_approval", "failed", "cancelled"],
    "stage_5_complete": ["stage_5_awaiting_approval", "stage_6_init", "finalizing", "failed", "cancelled"],
    "stage_5_awaiting_approval": ["stage_5_complete", "stage_6_init", "finalizing", "cancelled"],

    "stage_6_init": ["stage_6_generating", "stage_6_complete", "failed", "cancelled"],
    "stage_6_generating": ["stage_6_complete", "completed", "failed", "cancelled"],
    "stage_6_complete": ["finalizing", "completed", "failed", "cancelled"],

    "finalizing": ["completed", "failed", "cancelled"],

    "completed": ["pending", "stage_2_init", "stage_3_init", "stage_4_init", "stage_5_init", "stage_6_init"],
    "failed": ["pending", "stage_2_init", "stage_3_init", "stage_4_init", "stage_5_init", "stage_6_init"],
    "cancelled": ["pending", "stage_2_init", "stage_3_init", "stage_4_init", "stage_5_init", "stage_6_init"]
  }'::JSONB;

  IF NOT (v_valid_transitions->OLD.generation_status::text) ? NEW.generation_status::text THEN
    RAISE EXCEPTION 'Invalid generation status transition: % -> % (course_id: %)',
      OLD.generation_status,
      NEW.generation_status,
      NEW.id
    USING HINT = 'Valid transitions from ' || OLD.generation_status || ': ' ||
                  (v_valid_transitions->OLD.generation_status::text)::text;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

COMMENT ON FUNCTION validate_generation_status_transition() IS
  'FSM validation for course generation status. Updated 2026-01-25: Added stage_4_clarifying for Phase 0.5 clarifying questions';

-- ============================================================================
-- Step 6: Add phase_name to llm_model_config constraint
-- ============================================================================
-- First drop existing constraint
ALTER TABLE llm_model_config DROP CONSTRAINT IF EXISTS llm_model_config_phase_name_check;

-- Add updated constraint with ALL existing phase_names + stage_4_clarifying
ALTER TABLE llm_model_config ADD CONSTRAINT llm_model_config_phase_name_check
  CHECK (phase_name = ANY (ARRAY[
    -- Chat phases
    'chat_full_regeneration',
    'chat_global_guidance',
    'chat_node_refinement',
    -- Global/fallback
    'emergency',
    'global_default',
    'quality_fallback',
    -- Stage 2
    'stage_2_summarization',
    -- Stage 3
    'stage_3_classification',
    -- Stage 4 (including new clarifying)
    'stage_4_clarifying',
    'stage_4_classification',
    'stage_4_expert',
    'stage_4_scope',
    'stage_4_synthesis',
    -- Stage 5
    'stage_5_escalation',
    'stage_5_metadata',
    'stage_5_sections',
    'stage_5_tier1',
    -- Stage 6
    'stage_6_arbiter',
    'stage_6_delta_judge',
    'stage_6_judge',
    'stage_6_patcher',
    'stage_6_rag_planning',
    'stage_6_refinement',
    'stage_6_section_expander',
    -- Stage 7
    'stage_7_audio',
    'stage_7_card',
    'stage_7_cover',
    'stage_7_presentation',
    'stage_7_quiz',
    'stage_7_video',
    -- Legacy (for backward compatibility)
    'phase_1_classification',
    'phase_2_scope',
    'phase_3_expert',
    'phase_4_synthesis',
    'phase_6_rag_planning'
  ]::text[]));

-- ============================================================================
-- Step 7: Insert default model config for stage_4_clarifying
-- ============================================================================
INSERT INTO llm_model_config (
  config_type,
  phase_name,
  model_id,
  fallback_model_id,
  temperature,
  max_tokens,
  is_active,
  version
) VALUES (
  'global',
  'stage_4_clarifying',
  'google/gemini-2.0-flash-thinking-exp-01-21',
  'anthropic/claude-sonnet-4',
  0.5,
  4000,
  true,
  1
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- Step 8: Insert prompt template for clarifying questions
-- ============================================================================
INSERT INTO prompt_templates (
  stage,
  prompt_key,
  prompt_name,
  prompt_description,
  prompt_template,
  variables,
  version,
  is_active
) VALUES (
  'stage_4',
  'clarifying_questions',
  'Generate Clarifying Questions',
  'Generates smart clarifying questions based on course context to gather additional user preferences',
  E'You are an expert course designer helping to create a tailored learning experience.

Based on the provided course context, generate 3-7 clarifying questions that will help create a better course.

<context>
Course Title: {{course_title}}
Course Description: {{course_description}}
Target Audience: {{target_audience}}
Language: {{language}}

Document Context (condensed):
{{condensed_context}}

{{#if previous_answers}}
Previous Round Answers:
{{previous_answers}}
{{/if}}
</context>

<instructions>
1. Generate questions that will genuinely improve the course design
2. Categorize each question by priority:
   - critical: Must be answered for quality course (e.g., target skill level, key outcomes)
   - important: Will significantly improve course (e.g., preferred learning style, time constraints)
   - nice_to_have: Optional enhancements (e.g., specific tools/technologies preferences)

3. For each question, provide 2-4 suggested answers with rationale
4. Focus on questions that cannot be inferred from the provided context
5. Avoid generic questions - be specific to this course topic

Output Format (JSON):
{
  "questions": [
    {
      "question_text": "...",
      "question_priority": "critical|important|nice_to_have",
      "question_category": "audience|content|depth|format|outcome|tool",
      "suggested_answers": [
        { "text": "...", "rationale": "..." },
        { "text": "...", "rationale": "..." }
      ]
    }
  ]
}
</instructions>',
  '[
    {"name": "course_title", "description": "Course title", "required": true},
    {"name": "course_description", "description": "Course description", "required": false},
    {"name": "target_audience", "description": "Target audience level", "required": false},
    {"name": "language", "description": "Course language code", "required": true},
    {"name": "condensed_context", "description": "Condensed document context from Budget Allocator", "required": true},
    {"name": "previous_answers", "description": "Answers from previous round (for round 2)", "required": false}
  ]'::jsonb,
  1,
  true
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- Step 9: Comments
-- ============================================================================
COMMENT ON TABLE clarifying_questions IS 'Clarifying questions for Stage 4 Phase 0.5 - collects user preferences before analysis';
COMMENT ON COLUMN clarifying_questions.question_priority IS 'Question priority: critical (must answer), important (should answer), nice_to_have (optional)';
COMMENT ON COLUMN clarifying_questions.answer_source IS 'How user answered: suggested (AI choice), modified (AI+custom), custom (fully custom)';
COMMENT ON COLUMN clarifying_questions.iteration_round IS 'Round number (1 or 2, max 2 rounds allowed)';

-- ============================================================================
-- Migration Complete
-- ============================================================================
