/**
 * Chat Types for Course Refinement/Regeneration
 * @module @megacampus/shared-types/chat-types
 *
 * Defines types and schemas for the conversational interface
 * that allows instructors to refine or regenerate course content.
 */

import { z } from 'zod';

// ============================================================================
// Proposal Schemas (Confirm-then-Apply Flow)
// ============================================================================

/**
 * Single field update in a proposal.
 * Used for Stage 4/5 field-level edits.
 */
export const fieldUpdateItemSchema = z.object({
  /** JSON path to the field (e.g., "course_title", "sections[0].section_title") */
  path: z.string(),
  /** Previous value (for diff display) */
  oldValue: z.unknown().optional(),
  /** New proposed value */
  newValue: z.unknown(),
  /** Human-readable description of the change */
  description: z.string().optional(),
});

/**
 * Field updates proposal for Stages 4 and 5.
 * Contains multiple field-level changes to be applied atomically.
 */
export const fieldUpdatesProposalSchema = z.object({
  type: z.literal('field_updates'),
  /** Stage where changes apply (stage_4 or stage_5) */
  stageId: z.enum(['stage_4', 'stage_5']),
  /** List of field updates */
  updates: z.array(fieldUpdateItemSchema),
  /** Human-readable summary of all changes */
  summary: z.string(),
});

/**
 * Lesson patch proposal for Stage 6.
 * Contains patched lesson content section.
 */
export const lessonPatchProposalSchema = z.object({
  type: z.literal('lesson_patch'),
  /** Lesson ID in format "module.lesson" (e.g., "1.2") */
  lessonId: z.string(),
  /** Section ID within the lesson content being patched */
  sectionId: z.string(),
  /** Patched section content (markdown) */
  patchedContent: z.string(),
  /** Human-readable diff summary */
  diffSummary: z.string(),
});

/**
 * Direct action proposal for immediate execution without LLM generation.
 * Used for DELETE, MOVE operations that can be executed directly.
 */
export const directActionProposalSchema = z.object({
  type: z.literal('direct_action'),
  /** Action type */
  action: z.enum(['DELETE', 'MOVE']),
  /** Path to target element (e.g., "sections[0].lessons[2]") */
  targetPath: z.string(),
  /** Destination path for MOVE operations */
  destinationPath: z.string().optional(),
  /** Element type being affected */
  elementType: z.enum(['lesson', 'section']).optional(),
  /** Title of the element (for confirmation display) */
  title: z.string().optional(),
  /** Human-readable impact summary */
  impactSummary: z.string().optional(),
});

/**
 * Discriminated union of all proposal types.
 * - field_updates: For Stage 4/5 analysis_result and course_structure edits
 * - lesson_patch: For Stage 6 lesson content edits
 * - direct_action: For DELETE/MOVE operations without LLM generation
 */
export const proposalSchema = z.discriminatedUnion('type', [
  fieldUpdatesProposalSchema,
  lessonPatchProposalSchema,
  directActionProposalSchema,
]);

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
 * Chat response schema with intent classification, proposals, and token metrics.
 *
 * Confirm-then-Apply flow:
 * - When intent='refine', response may include a proposal with suggested changes
 * - User can Accept (apply changes) or Continue (refine further)
 * - Proposal is applied via separate applyProposal endpoint
 */
export const chatResponseSchema = z.object({
  /** Conversation ID for continuity */
  conversationId: z.string().uuid(),

  /** Assistant response message */
  assistantMessage: z.string(),

  /** Classified intent: refine (inline edit) or regenerate (full regen) */
  intent: z.enum(['refine', 'regenerate']),

  /**
   * Proposed changes for Confirm-then-Apply flow.
   * Present when intent='refine' and AI has concrete changes to suggest.
   * User must explicitly accept to apply these changes.
   */
  proposal: proposalSchema.optional(),

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

// Proposal types
export type FieldUpdateItem = z.infer<typeof fieldUpdateItemSchema>;
export type FieldUpdatesProposal = z.infer<typeof fieldUpdatesProposalSchema>;
export type LessonPatchProposal = z.infer<typeof lessonPatchProposalSchema>;
export type DirectActionProposal = z.infer<typeof directActionProposalSchema>;
export type Proposal = z.infer<typeof proposalSchema>;

/**
 * Type guard for ChatIntent validation.
 * Use for runtime validation of intent values from external sources.
 *
 * @param value - Unknown value to validate
 * @returns True if value is a valid ChatIntent
 *
 * @example
 * if (isValidIntent(userInput)) {
 *   // userInput is now typed as ChatIntent
 * }
 */
export function isValidIntent(value: unknown): value is ChatIntent {
  return value === 'refine' || value === 'regenerate';
}

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
