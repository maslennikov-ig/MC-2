-- Migration: 20260124160000_chat_indexes_validation.sql
-- Purpose: Add JSONB validation constraint and performance indexes for course_chat_messages
-- Beads: mc2-9nsr

-- ============================================================================
-- 1. JSONB Validation Constraint
-- ============================================================================

-- Add CHECK constraint to validate node_context JSONB structure
ALTER TABLE public.course_chat_messages
  ADD CONSTRAINT node_context_structure_check
  CHECK (
    node_context IS NULL
    OR (
      -- Must have stageId if present
      node_context ? 'stageId'
      AND jsonb_typeof(node_context->'stageId') = 'string'
      -- Optional fields must be strings if present
      AND (NOT node_context ? 'nodeId' OR jsonb_typeof(node_context->'nodeId') = 'string')
      AND (NOT node_context ? 'blockPath' OR jsonb_typeof(node_context->'blockPath') = 'string')
    )
  );

COMMENT ON CONSTRAINT node_context_structure_check ON public.course_chat_messages IS
  'Ensures node_context has valid structure: {stageId: string, nodeId?: string, blockPath?: string}';

-- ============================================================================
-- 2. Performance Indexes
-- ============================================================================

-- Index for recent messages query (across all conversations)
CREATE INDEX IF NOT EXISTS idx_chat_messages_course_recent
    ON public.course_chat_messages(course_id, created_at DESC);

-- Partial index for intent analytics (only where intent is not null)
CREATE INDEX IF NOT EXISTS idx_chat_messages_intent_analytics
    ON public.course_chat_messages(course_id, intent)
    WHERE intent IS NOT NULL;

COMMENT ON INDEX idx_chat_messages_course_recent IS
  'Optimizes queries for recent messages across all conversations';

COMMENT ON INDEX idx_chat_messages_intent_analytics IS
  'Optimizes analytics queries filtering by intent';

-- ============================================================================
-- 3. Security Documentation
-- ============================================================================

-- Update column comment with security guidance
COMMENT ON COLUMN public.course_chat_messages.node_context IS
  'JSONB context for node chat: {stageId, nodeId?, blockPath?}. SECURITY: Always use parameterized queries when filtering on node_context fields.';
