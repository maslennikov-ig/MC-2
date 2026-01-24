-- Migration: Create course_chat_messages table
-- Purpose: Store chat conversation history for course refinement/regeneration
-- Part of: Chat Router implementation (Phase 1)

-- ============================================================================
-- Table: course_chat_messages
-- ============================================================================

CREATE TABLE IF NOT EXISTS course_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  chat_type TEXT NOT NULL CHECK (chat_type IN ('node', 'global')),
  node_context JSONB,
  intent TEXT CHECK (intent IN ('refine', 'regenerate')),
  model_used TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Primary lookup: get conversation messages for a course
CREATE INDEX idx_course_chat_messages_course_conv
  ON course_chat_messages(course_id, conversation_id, created_at);

-- List all conversations for a course
CREATE INDEX idx_course_chat_messages_course_id
  ON course_chat_messages(course_id, created_at DESC);

-- Filter by chat type
CREATE INDEX idx_course_chat_messages_chat_type
  ON course_chat_messages(course_id, chat_type, created_at DESC);

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE course_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own course chat messages
CREATE POLICY course_chat_messages_select_policy ON course_chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = course_chat_messages.course_id
      AND c.user_id = auth.uid()
    )
  );

-- Policy: Users can insert messages for their own courses
CREATE POLICY course_chat_messages_insert_policy ON course_chat_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = course_chat_messages.course_id
      AND c.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE course_chat_messages IS 'Stores chat conversation history for course refinement/regeneration';
COMMENT ON COLUMN course_chat_messages.conversation_id IS 'Groups messages into conversations';
COMMENT ON COLUMN course_chat_messages.role IS 'Message role: user, assistant, or system';
COMMENT ON COLUMN course_chat_messages.chat_type IS 'Chat mode: node (block-level) or global (course-level)';
COMMENT ON COLUMN course_chat_messages.node_context IS 'Context for node-level chats: stageId, nodeId, blockPath';
COMMENT ON COLUMN course_chat_messages.intent IS 'Classified intent: refine or regenerate';
COMMENT ON COLUMN course_chat_messages.model_used IS 'LLM model used for assistant responses';
COMMENT ON COLUMN course_chat_messages.input_tokens IS 'Input tokens consumed for assistant responses';
COMMENT ON COLUMN course_chat_messages.output_tokens IS 'Output tokens generated for assistant responses';
