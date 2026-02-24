-- Migration: Create course_chat_messages table for in-editor chat feature
-- Task: Course Chat Feature - Phase 1: Backend Foundation
-- Date: 2026-01-24
--
-- This table stores chat messages between users and the AI assistant
-- for course refinement and guidance. Supports two chat types:
-- - 'node': Contextual chat for specific course nodes (sections, lessons, blocks)
-- - 'global': Course-wide guidance and navigation assistance
--
-- Messages are immutable (no UPDATE/DELETE) to preserve conversation history.

-- ============================================================================
-- Create course_chat_messages table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.course_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Course association
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,

    -- Conversation grouping (UUID generated client-side for new conversations)
    conversation_id UUID NOT NULL,

    -- Message content
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,

    -- Chat type: 'node' for contextual refinement, 'global' for course guidance
    chat_type TEXT NOT NULL CHECK (chat_type IN ('node', 'global')),

    -- Context for node-level chat (stageId, nodeId, blockPath)
    -- Example: {"stageId": "stage_5", "nodeId": "section-1", "blockPath": "lessons[0].content"}
    node_context JSONB,

    -- User intent classification for routing
    intent TEXT CHECK (intent IN ('refine', 'regenerate')),

    -- Token tracking for cost analysis
    model_used TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE public.course_chat_messages IS
    'Stores chat messages for in-editor course refinement and guidance features';

COMMENT ON COLUMN public.course_chat_messages.conversation_id IS
    'Groups messages in a single conversation session (UUID generated client-side)';

COMMENT ON COLUMN public.course_chat_messages.chat_type IS
    'Type of chat: "node" for contextual refinement, "global" for course-wide guidance';

COMMENT ON COLUMN public.course_chat_messages.node_context IS
    'JSONB context for node chat: {stageId, nodeId?, blockPath?}';

COMMENT ON COLUMN public.course_chat_messages.intent IS
    'User intent classification: "refine" for minor edits, "regenerate" for full regen';

COMMENT ON COLUMN public.course_chat_messages.model_used IS
    'OpenRouter model ID used for assistant responses';

COMMENT ON COLUMN public.course_chat_messages.input_tokens IS
    'Input token count for cost tracking';

COMMENT ON COLUMN public.course_chat_messages.output_tokens IS
    'Output token count for cost tracking';

-- ============================================================================
-- Indexes
-- ============================================================================

-- Primary query pattern: get conversation messages for a course
CREATE INDEX IF NOT EXISTS idx_chat_messages_course_conversation
    ON public.course_chat_messages(course_id, conversation_id, created_at);

-- Secondary query pattern: filter by chat type
CREATE INDEX IF NOT EXISTS idx_chat_messages_course_type
    ON public.course_chat_messages(course_id, chat_type);

-- ============================================================================
-- Enable RLS
-- ============================================================================

ALTER TABLE public.course_chat_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- Users can SELECT messages for their own courses
CREATE POLICY "chat_messages_select_owner" ON public.course_chat_messages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.courses
            WHERE courses.id = course_chat_messages.course_id
            AND courses.user_id = auth.uid()
        )
    );

-- Users can INSERT messages for their own courses
CREATE POLICY "chat_messages_insert_owner" ON public.course_chat_messages
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.courses
            WHERE courses.id = course_chat_messages.course_id
            AND courses.user_id = auth.uid()
        )
    );

-- No UPDATE policy: messages are immutable
-- No DELETE policy: preserve conversation history

-- ============================================================================
-- Update llm_model_config constraint to include chat phases
-- ============================================================================

-- Drop existing constraint
ALTER TABLE public.llm_model_config DROP CONSTRAINT IF EXISTS llm_model_config_phase_name_check;

-- Add updated constraint with chat phases
ALTER TABLE public.llm_model_config ADD CONSTRAINT llm_model_config_phase_name_check
CHECK (phase_name = ANY (ARRAY[
  -- Global
  'global_default'::text,
  -- Stage 2
  'stage_2_summarization'::text,
  'stage_2_standard_ru'::text, 'stage_2_standard_en'::text,
  'stage_2_extended_ru'::text, 'stage_2_extended_en'::text,
  -- Stage 3
  'stage_3_classification'::text,
  -- Stage 4
  'stage_4_classification'::text, 'stage_4_scope'::text, 'stage_4_expert'::text, 'stage_4_synthesis'::text,
  'stage_4_standard_ru'::text, 'stage_4_standard_en'::text,
  'stage_4_extended_ru'::text, 'stage_4_extended_en'::text,
  -- Stage 5
  'stage_5_metadata'::text, 'stage_5_sections'::text,
  'stage_5_standard_ru'::text, 'stage_5_standard_en'::text,
  'stage_5_extended_ru'::text, 'stage_5_extended_en'::text,
  -- Stage 6
  'stage_6_rag_planning'::text, 'stage_6_judge'::text, 'stage_6_refinement'::text,
  'stage_6_arbiter'::text, 'stage_6_patcher'::text, 'stage_6_section_expander'::text, 'stage_6_delta_judge'::text,
  'stage_6_standard_ru'::text, 'stage_6_standard_en'::text,
  'stage_6_extended_ru'::text, 'stage_6_extended_en'::text,
  -- Stage 7: Enrichments
  'stage_7_cover'::text, 'stage_7_card'::text,
  'stage_7_video'::text, 'stage_7_audio'::text,
  'stage_7_quiz'::text, 'stage_7_presentation'::text, 'stage_7_document'::text,
  -- Chat phases (NEW)
  'chat_node_refinement'::text, 'chat_global_guidance'::text, 'chat_full_regeneration'::text,
  -- Special
  'emergency'::text, 'quality_fallback'::text
]));

COMMENT ON CONSTRAINT llm_model_config_phase_name_check ON public.llm_model_config IS
  'Ensures phase_name matches valid phases including chat phases';

-- ============================================================================
-- Seed chat model configurations
-- ============================================================================

-- Chat Node Refinement (conversational, gpt-4o for quality)
INSERT INTO public.llm_model_config (
    config_type, phase_name, model_id, fallback_model_id,
    temperature, max_tokens, max_context_tokens, context_tier,
    language, is_active
) VALUES (
    'global', 'chat_node_refinement', 'openai/gpt-4o', 'anthropic/claude-sonnet-4',
    0.7, 4096, 128000, 'standard',
    'any', true
);

-- Chat Global Guidance (course-wide advice)
INSERT INTO public.llm_model_config (
    config_type, phase_name, model_id, fallback_model_id,
    temperature, max_tokens, max_context_tokens, context_tier,
    language, is_active
) VALUES (
    'global', 'chat_global_guidance', 'openai/gpt-4o', 'anthropic/claude-sonnet-4',
    0.7, 2048, 128000, 'standard',
    'any', true
);

-- Chat Full Regeneration (premium, async processing)
INSERT INTO public.llm_model_config (
    config_type, phase_name, model_id, fallback_model_id,
    temperature, max_tokens, max_context_tokens, context_tier,
    language, is_active
) VALUES (
    'global', 'chat_full_regeneration', 'anthropic/claude-sonnet-4', 'openai/gpt-4o',
    0.6, 16000, 200000, 'extended',
    'any', true
);

-- ============================================================================
-- ROLLBACK (if needed):
-- ============================================================================
-- DELETE FROM llm_model_config WHERE phase_name LIKE 'chat_%';
-- DROP TABLE IF EXISTS course_chat_messages;
-- ALTER TABLE llm_model_config DROP CONSTRAINT IF EXISTS llm_model_config_phase_name_check;
-- (then restore previous constraint from 20260105120000_seed_stage7_model_configs.sql)
-- ============================================================================
