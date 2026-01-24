/**
 * Chat Types for Course Refinement/Regeneration
 * @module @megacampus/shared-types/chat-types
 *
 * Defines types and schemas for the conversational interface
 * that allows instructors to refine or regenerate course content.
 */

import { z } from 'zod';

// ============================================================================
// Chat Request/Response Schemas
// ============================================================================

/**
 * Chat request schema for course refinement/regeneration conversations.
 *
 * Two modes:
 * - 'node': Refine specific node content (Stage 4/5 blocks)
 * - 'global': Course-wide guidance and regeneration triggers
 */
export const chatRequestSchema = z.object({
  /** Course ID */
  courseId: z.string().uuid(),

  /** Chat mode: node-level refinement or global course chat */
  chatType: z.enum(['node', 'global']),

  /** User message (1-10000 chars) */
  userMessage: z.string().min(1, 'Message is required').max(10000, 'Message too long'),

  /** Existing conversation ID for context continuity */
  conversationId: z.string().uuid().optional(),

  /** Node context for node-level refinement */
  nodeContext: z
    .object({
      /** Stage ID (stage_4 or stage_5) */
      stageId: z.string(),
      /** Node/block ID for targeted refinement */
      nodeId: z.string().optional(),
      /** JSON path to the block being refined */
      blockPath: z.string().optional(),
    })
    .optional(),

  /** Previous output content for context */
  previousOutput: z.string().optional(),

  /** Explicit user intent: refine (inline edit) or regenerate (full regen) */
  intent: z.enum(['refine', 'regenerate']),
});

/**
 * Chat response schema with intent classification and token metrics.
 */
export const chatResponseSchema = z.object({
  /** Conversation ID for continuity */
  conversationId: z.string().uuid(),

  /** Assistant response message */
  assistantMessage: z.string(),

  /** Classified intent: refine (inline edit) or regenerate (full regen) */
  intent: z.enum(['refine', 'regenerate']),

  /** Job ID for async regeneration (when intent=regenerate) */
  jobId: z.string().optional(),

  /** Model used for response generation */
  modelUsed: z.string(),

  /** Input tokens consumed */
  inputTokens: z.number().int().min(0),

  /** Output tokens generated */
  outputTokens: z.number().int().min(0),
});

// ============================================================================
// Type Exports
// ============================================================================

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type ChatIntent = 'refine' | 'regenerate';
export type ChatType = 'node' | 'global';

// ============================================================================
// Chat Message Types (for database storage)
// ============================================================================

/**
 * Chat message role
 */
export type ChatMessageRole = 'user' | 'assistant' | 'system';

/**
 * Chat message for database storage
 */
export interface ChatMessage {
  id: string;
  courseId: string;
  conversationId: string;
  role: ChatMessageRole;
  content: string;
  chatType: ChatType;
  nodeContext?: {
    stageId: string;
    nodeId?: string;
    blockPath?: string;
  };
  intent?: ChatIntent;
  modelUsed?: string;
  inputTokens?: number;
  outputTokens?: number;
  createdAt: string;
}

