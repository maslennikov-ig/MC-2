/**
 * Chat Router for Course Refinement/Regeneration
 * @module server/routers/generation/editing/chat
 *
 * Provides conversational interface for course content refinement and regeneration.
 * Supports two modes:
 * - Node-level: Refine specific Stage 4/5 content blocks
 * - Global: Course-wide guidance and regeneration triggers
 *
 * Intent classification:
 * - 'refine': Inline content refinement (generates proposal for confirm-then-apply)
 * - 'regenerate': Full regeneration trigger (may spawn async job)
 *
 * Confirm-then-Apply Flow:
 * 1. User sends refinement request
 * 2. AI responds with proposed changes (proposal)
 * 3. User clicks [Accept] to apply via applyProposal or [Continue] to refine further
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { instructorProcedure } from '../../../procedures';
import { createRateLimiter } from '../../../middleware/rate-limit';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import {
  createAuthenticatedClient,
  extractAccessToken,
} from '../../../../shared/supabase/authenticated';
import { logger } from '../../../../shared/logger/index.js';
import { nanoid } from 'nanoid';
import {
  chatRequestSchema,
  proposalSchema,
  type ChatResponse,
} from '@megacampus/shared-types/chat-types';
import {
  deleteElement as deleteStructureElement,
  moveElement as moveStructureElement,
  ensureStableIdsInMemory,
} from '../../../../stages/stage5-generation/utils/course-structure-editor';
import { assertCourseAccess, buildAuthContext } from '../../../helpers/course-authorization';
import {
  applyFieldUpdatesProposal,
  applyLessonPatchProposal,
  applyStructuralOperationProposal,
} from './chat-apply-helpers';
import {
  validateConversationOwnership,
  assertGenerationNotActive,
  fetchConversationHistory,
  persistUserMessage,
  executeLegacyLLMFlow,
} from './chat-mutation-helpers';
import { executeIntentClassificationFlow, executeFullRegenerate } from './chat-intent-flow';
import { writeCourseNodes } from '../../../../shared/course-nodes/writer';
import {
  resolveStructure,
  hasResolvedStructure,
} from '../../../../shared/course-nodes/structure-resolver';

// ============================================================================
// Rate Limiting Configuration
// ============================================================================

/**
 * Rate limiter for chat endpoint to prevent abuse and control LLM costs.
 * Configuration:
 * - 20 requests per minute per user
 * - Uses Redis for distributed rate limiting across instances
 * - Fail-open strategy: if Redis is down, requests are allowed
 */
const chatRateLimiter = createRateLimiter({
  requests: 20,
  window: 60, // 1 minute
  keyPrefix: 'chat-rate-limit',
});

/**
 * P2-4: Rate limiter for direct action endpoint (DELETE/MOVE operations).
 * More restrictive than chat since these are destructive operations.
 */
const directActionRateLimiter = createRateLimiter({
  requests: 10, // Max 10 structural changes per minute
  window: 60,
  keyPrefix: 'direct-action-rate-limit',
});

// ============================================================================
// Intent Classification Configuration
// ============================================================================

/**
 * P3-1: Confidence thresholds for intent classification routing.
 * Extracted as constants for easier tuning and testing.
 */
const INTENT_CONFIDENCE_THRESHOLDS = {
  /** Minimum confidence for direct execution intents (DELETE, MOVE) */
  DIRECT_EXECUTION: 0.7,
  /** Minimum confidence for GET_INFO queries */
  GET_INFO: 0.7,
  /** Minimum confidence for LLM-required intents (REWRITE, EXPAND, etc.) */
  LLM_REQUIRED: 0.5,
} as const;

// ============================================================================
// Fallback Configuration
// ============================================================================

/**
 * Default fallback configuration for chat when ModelConfigService is unavailable.
 * Can be overridden via environment variables for flexibility without redeployment.
 *
 * Environment variables:
 * - CHAT_FALLBACK_MODEL: OpenRouter model ID (default: xiaomi/mimo-v2-flash)
 * - CHAT_FALLBACK_TEMPERATURE: Temperature 0-1 (default: 0.7)
 * - CHAT_FALLBACK_MAX_TOKENS: Max tokens (default: 8192)
 */
const CHAT_FALLBACK_CONFIG = {
  // Use same model as Stage 4/5 for potential OpenRouter prompt caching
  modelId: process.env.CHAT_FALLBACK_MODEL || 'xiaomi/mimo-v2-flash',
  temperature: parseFloat(process.env.CHAT_FALLBACK_TEMPERATURE || '0.7'),
  // Increased from 4096 to handle large course structures (49+ lessons)
  maxTokens: parseInt(process.env.CHAT_FALLBACK_MAX_TOKENS || '8192', 10),
} as const;

// ============================================================================
// Input Schemas
// ============================================================================

/** Input schema for applyProposal endpoint */
const applyProposalInputSchema = z.object({
  courseId: z.string().uuid(),
  conversationId: z.string().uuid(),
  proposal: proposalSchema,
});

/** Input schema for applyDirectAction endpoint */
const applyDirectActionInputSchema = z.object({
  courseId: z.string().uuid(),
  action: z.enum(['DELETE', 'MOVE']),
  targetPath: z.string(),
  destinationPath: z.string().optional(),
});

// ============================================================================
// Chat Router
// ============================================================================

export const chatRouter = {
  /**
   * Chat endpoint for course refinement/regeneration.
   *
   * Flow:
   * 1. Validate input and verify course ownership
   * 2. Classify intent (refine vs regenerate)
   * 3. Save user message to conversation history
   * 4. Get model config for chat phase
   * 5. Build context-aware prompt
   * 6. Generate LLM response
   * 7. Save assistant message with metrics
   * 8. Return response with intent and metrics
   */
  chat: instructorProcedure
    .use(chatRateLimiter)
    .input(chatRequestSchema)
    .mutation(async ({ ctx, input }): Promise<ChatResponse> => {
      return executeChatMutation(ctx, input);
    }),

  /**
   * Apply a proposal from chat refinement.
   *
   * Supports proposal types:
   * - field_updates: Apply multiple field changes to Stage 4 or Stage 5 data
   * - lesson_patch: Apply patched content to a Stage 6 lesson section
   * - direct_action: Apply structural changes (handled by applyDirectAction)
   *
   * Authorization: Requires course ownership or org admin access.
   */
  applyProposal: instructorProcedure
    .input(applyProposalInputSchema)
    .mutation(async ({ ctx, input }) => {
      return executeApplyProposal(ctx, input);
    }),

  /**
   * Apply direct action (DELETE/MOVE) from chat.
   *
   * Executes structural changes without LLM generation:
   * - DELETE: Remove lesson or section
   * - MOVE: Relocate lesson or section
   *
   * Automatically handles lesson renumbering and duration recalculation.
   */
  applyDirectAction: instructorProcedure
    .use(directActionRateLimiter)
    .input(applyDirectActionInputSchema)
    .mutation(async ({ ctx, input }) => {
      return executeApplyDirectAction(ctx, input);
    }),
};

// ============================================================================
// Chat Mutation Implementation
// ============================================================================

/** Context type from tRPC procedures */
type ProcedureCtx = {
  user: { id: string; email: string; role: string; organizationId: string } | null;
  req: Request;
};

/**
 * Execute the chat mutation.
 * Validates input, loads context, routes via intent classification, and returns response.
 */
async function executeChatMutation(
  ctx: ProcedureCtx,
  input: z.infer<typeof chatRequestSchema>
): Promise<ChatResponse> {
  const { courseId, chatType, conversationId, nodeContext, previousOutput, intent } = input;
  const requestId = nanoid();
  const userId = ctx.user?.id;

  // Semantic validation
  const userMessage = input.userMessage.trim();
  if (!userMessage) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Message cannot be empty or whitespace only',
    });
  }

  // Validate previousOutput size (prevent memory issues, 1MB limit)
  if (previousOutput && previousOutput.length > 1_000_000) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Previous output too large (max 1MB)' });
  }

  if (!userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  const accessToken = extractAccessToken(ctx.req);
  if (!accessToken) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication token required' });
  }

  // Use authenticated client for course queries (RLS enforcement)
  const supabaseAuth = createAuthenticatedClient(accessToken);
  // Use admin client for chat message inserts (no user-facing RLS on chat_messages)
  const supabaseAdmin = getSupabaseAdmin();

  // Validate conversation ownership
  await validateConversationOwnership(supabaseAdmin, conversationId, courseId);

  // Query course using authenticated client (RLS enforces ownership)
  const { data: course, error: courseError } = await supabaseAuth
    .from('courses')
    .select(
      'id, user_id, title, language, style, analysis_result, course_structure, generation_status'
    )
    .eq('id', courseId)
    .single();

  if (courseError || !course) {
    logger.warn(
      { requestId, userId, courseId, error: courseError },
      'Course not found or access denied'
    );
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found or access denied' });
  }

  // Block chat during active generation phases
  assertGenerationNotActive(course.generation_status, requestId, courseId);

  const convId = conversationId || crypto.randomUUID();

  // Fetch conversation history and save user message
  const history = await fetchConversationHistory(supabaseAdmin, convId, requestId, courseId);

  await persistUserMessage(supabaseAdmin, {
    courseId,
    convId,
    userMessage,
    chatType,
    nodeContext: nodeContext || null,
    intent,
    requestId,
  });

  logger.info(
    {
      requestId,
      courseId,
      chatType,
      intent,
      conversationId: convId,
      messageLength: userMessage.length,
      historyMessageCount: history?.length || 0,
    },
    'Chat: Processing message'
  );

  // --- Intent Routing (Phase 1: auto-intent classification) ---

  // Explicit 'regenerate' → skip classification, enqueue async regeneration job directly
  if (intent === 'regenerate') {
    logger.info(
      { requestId, courseId },
      'Chat: Explicit regenerate intent, enqueuing regeneration job'
    );
    return executeFullRegenerate({
      courseId,
      userId,
      convId,
      chatType,
      nodeContext,
      requestId,
      supabaseAdmin,
    });
  }

  // Auto-intent classification pipeline (Tier 0 regex + Tier 1 LLM)
  // Enabled by default; disable with CHAT_INTENT_ROUTING_ENABLED=false
  if (
    process.env.CHAT_INTENT_ROUTING_ENABLED !== 'false' &&
    hasResolvedStructure(course.course_structure)
  ) {
    // Phase 4: resolve from course_nodes if enabled, fallback to JSONB
    const resolved = await resolveStructure(courseId, course.course_structure, supabaseAdmin);
    // Inject stable IDs in-memory for legacy structures without IDs
    const courseStructureWithIds = ensureStableIdsInMemory(resolved!);

    const classificationResult = await executeIntentClassificationFlow({
      userMessage,
      courseStructure: courseStructureWithIds,
      courseLanguage: course.language,
      courseId,
      nodeContext,
      convId,
      chatType,
      intent,
      requestId,
      supabaseAdmin,
      userId: userId,
      fallbackConfig: CHAT_FALLBACK_CONFIG,
      thresholds: INTENT_CONFIDENCE_THRESHOLDS,
      generationStatus: course.generation_status,
    });

    if (classificationResult) {
      return classificationResult;
    }
    // Fallback to legacy flow if classification returned null (UNKNOWN/low confidence)
  }

  // Legacy LLM flow (fallback for unclassified intents or no course_structure)
  return executeLegacyLLMFlow({
    courseId,
    course,
    userMessage,
    chatType,
    nodeContext,
    previousOutput,
    intent,
    convId,
    history,
    requestId,
    supabaseAdmin,
    fallbackConfig: CHAT_FALLBACK_CONFIG,
  });
}

// ============================================================================
// Apply Proposal Implementation
// ============================================================================

/**
 * Execute the applyProposal mutation.
 * Routes to the appropriate handler based on proposal type.
 */
async function executeApplyProposal(
  ctx: ProcedureCtx,
  input: z.infer<typeof applyProposalInputSchema>
): Promise<{
  success: boolean;
  appliedUpdates?: number;
  lessonId?: string;
  sectionId?: string;
  updatedAt: string;
}> {
  const { courseId, conversationId } = input;
  const proposal = input.proposal;
  const requestId = nanoid();
  const userId = ctx.user?.id;

  if (!userId || !ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  const supabase = getSupabaseAdmin();

  // Fetch course for authorization and data
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, user_id, organization_id, analysis_result, course_structure')
    .eq('id', courseId)
    .single();

  if (courseError || !course) {
    logger.warn({ requestId, userId, courseId, error: courseError }, 'Course not found');
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
  }

  // Check authorization: superadmin/admin/owner can apply proposals
  assertCourseAccess(
    buildAuthContext(ctx.user as Parameters<typeof buildAuthContext>[0]),
    course,
    'apply proposal'
  );

  logger.info(
    { requestId, courseId, conversationId, proposalType: proposal.type },
    'applyProposal: Starting'
  );

  try {
    switch (proposal.type) {
      case 'field_updates':
        return await applyFieldUpdatesProposal(supabase, courseId, course, proposal, requestId);

      case 'lesson_patch':
        return await applyLessonPatchProposal(
          supabase,
          courseId,
          proposal,
          conversationId,
          requestId,
          ctx.user as Parameters<typeof buildAuthContext>[0]
        );

      case 'structural_operation': {
        // Phase 4: resolve from course_nodes if enabled, fallback to JSONB
        const currentStructure = await resolveStructure(
          courseId,
          course.course_structure,
          supabase
        );
        if (!currentStructure) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot apply structural operation: course_structure is empty',
          });
        }
        return await applyStructuralOperationProposal(
          supabase,
          courseId,
          currentStructure,
          proposal,
          requestId
        );
      }

      case 'direct_action':
        // Direct actions should use the applyDirectAction endpoint instead
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Use applyDirectAction endpoint for direct actions',
        });

      default:
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown proposal type' });
    }
  } catch (error) {
    if (error instanceof TRPCError) throw error;

    logger.error(
      { requestId, courseId, error: error instanceof Error ? error.message : String(error) },
      'applyProposal: Unexpected error'
    );
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to apply proposal' });
  }
}

// ============================================================================
// Apply Direct Action Implementation
// ============================================================================

/**
 * Execute the applyDirectAction mutation.
 * Applies structural changes (DELETE/MOVE) to the course structure.
 */
async function executeApplyDirectAction(
  ctx: ProcedureCtx,
  input: z.infer<typeof applyDirectActionInputSchema>
): Promise<{
  success: boolean;
  recalculated?: {
    lessonNumbers?: Record<string, number>;
    courseDuration?: number;
    sectionDuration?: number;
  };
  updatedAt: string;
}> {
  const { courseId, action, targetPath, destinationPath } = input;
  const requestId = nanoid();
  const userId = ctx.user?.id;

  if (!userId || !ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  const supabase = getSupabaseAdmin();

  // Fetch course
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, user_id, organization_id, course_structure')
    .eq('id', courseId)
    .single();

  if (courseError || !course) {
    logger.warn({ requestId, userId, courseId, error: courseError }, 'Course not found');
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
  }

  // Check authorization
  assertCourseAccess(
    buildAuthContext(ctx.user as Parameters<typeof buildAuthContext>[0]),
    course,
    'apply direct action'
  );

  // Phase 4: resolve from course_nodes if enabled, fallback to JSONB
  const courseStructure = await resolveStructure(courseId, course.course_structure, supabase);
  if (!courseStructure) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Course structure is empty' });
  }

  logger.info(
    { requestId, courseId, action, targetPath, destinationPath },
    'applyDirectAction: Starting'
  );

  try {
    let result;

    if (action === 'DELETE') {
      result = deleteStructureElement(courseStructure, targetPath);
    } else if (action === 'MOVE') {
      if (!destinationPath) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Destination path required for MOVE action',
        });
      }
      result = moveStructureElement(courseStructure, targetPath, destinationPath);
    } else {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid action' });
    }

    // Save updated structure
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('courses')
      .update({ course_structure: result.updatedStructure, updated_at: now })
      .eq('id', courseId);

    if (updateError) {
      logger.error(
        { requestId, courseId, action, error: updateError },
        'applyDirectAction: Database update failed'
      );
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to apply action' });
    }

    // Phase 4: Dual-write to course_nodes (non-blocking, non-fatal)
    await writeCourseNodes(courseId, result.updatedStructure, supabase, logger).catch(err =>
      logger.warn(
        { courseId, error: err instanceof Error ? err.message : String(err) },
        'course_nodes dual-write failed (non-fatal)'
      )
    );

    logger.info(
      { requestId, courseId, action, targetPath, recalculated: result.recalculated },
      'applyDirectAction: Applied successfully'
    );

    return { success: true, recalculated: result.recalculated, updatedAt: now };
  } catch (error) {
    if (error instanceof TRPCError) throw error;

    logger.error(
      { requestId, courseId, error: error instanceof Error ? error.message : String(error) },
      'applyDirectAction: Unexpected error'
    );
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to apply action' });
  }
}
