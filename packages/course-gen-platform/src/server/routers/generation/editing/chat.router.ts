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
import { PAUSABLE_STATUSES } from '@megacampus/shared-types';
import {
  chatRequestSchema,
  proposalSchema,
  type ChatResponse,
  type Proposal,
  type FieldUpdatesProposal,
  type FieldUpdateItem,
  type DirectActionProposal,
} from '@megacampus/shared-types/chat-types';
import {
  STAGE4_EDITABLE_FIELDS,
  STAGE5_EDITABLE_FIELDS,
} from '@megacampus/shared-types/regeneration-types';
import { llmClient } from '../../../../shared/llm/client';
import { createModelConfigService } from '../../../../shared/llm/model-config-service';
import {
  applyFieldUpdate,
  deleteElement as deleteStructureElement,
  moveElement as moveStructureElement,
} from '../../../../stages/stage5-generation/utils/course-structure-editor';
import type { CourseStructure, Section, Lesson } from '@megacampus/shared-types';
import {
  classifyIntent,
  isDirectExecutionIntent,
  isLLMRequiredIntent,
  resolveTargetPath,
  resolveTargetPathWithMatches,
  getElementAtPath,
  isLessonPath,
  generateCourseOutline,
  type ClassifiedIntent,
  type TargetMatch,
} from '../../../../shared/intent';
import { setNestedValue, normalizePathForValidation } from '../_shared/helpers';
import { assertCourseAccess, buildAuthContext } from '../../../helpers/course-authorization';
import { resolveLessonIdOrUuid } from '../../../../shared/database/lesson-resolver';

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
// Proposal Generation Helpers
// ============================================================================

/**
 * Build a refinement prompt that instructs LLM to return structured JSON with field updates.
 * Used for Stage 4 and Stage 5 refinement.
 */
function buildRefinementPrompt(
  targetStageId: 'stage_4' | 'stage_5',
  currentData: unknown,
  allowedFields: readonly string[]
): string {
  const stageDescription =
    targetStageId === 'stage_4' ? 'lesson specifications' : 'course structure';
  return `You are an instructional designer assistant working on ${stageDescription}.
Analyze the user's refinement request and return a JSON object with proposed field updates.

IMPORTANT: You MUST respond with a valid JSON object (no markdown code blocks).

Current content:
${JSON.stringify(currentData, null, 2)}

Editable fields (you can ONLY update these fields):
${allowedFields.join('\n')}

Return JSON in this EXACT format:
{
  "message": "Human-readable explanation of what you're proposing to change",
  "updates": [
    {
      "path": "exact.field.path",
      "newValue": "the new value (can be string, array, object, etc.)",
      "description": "Brief description of this change"
    }
  ]
}

Rules:
1. Only include fields that actually need to change based on user request
2. The "path" must be one of the allowed editable fields
3. For Stage 5 array paths, use exact indices like "sections[0].lessons[1].lesson_title"
4. Always validate your JSON is properly formatted
5. If the user's request doesn't require field changes, return empty updates array with explanation`;
}

/**
 * Parse LLM response to extract proposal.
 * Returns null if parsing fails (graceful fallback to non-proposal response).
 */
function parseProposalFromLLMResponse(
  llmContent: string,
  stageId: 'stage_4' | 'stage_5',
  allowedFields: readonly string[],
  requestId: string
): FieldUpdatesProposal | null {
  try {
    // Try to extract JSON from the response
    let jsonContent = llmContent.trim();

    // Handle markdown code blocks if present
    const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonContent);

    if (!parsed || typeof parsed !== 'object') {
      logger.warn({ requestId }, 'Proposal parsing: invalid JSON structure');
      return null;
    }

    // Extract message and updates
    const message = typeof parsed.message === 'string' ? parsed.message : '';
    const updates = Array.isArray(parsed.updates) ? parsed.updates : [];

    if (updates.length === 0) {
      logger.info({ requestId }, 'Proposal parsing: no updates in response');
      return null;
    }

    // Validate and transform updates
    const validatedUpdates: FieldUpdateItem[] = [];
    for (const update of updates) {
      if (!update || typeof update !== 'object') continue;

      const path = typeof update.path === 'string' ? update.path : '';
      if (!path) continue;

      // Normalize path for validation
      const normalizedPath = stageId === 'stage_5' ? normalizePathForValidation(path) : path;

      // Check if path is in whitelist
      if (!allowedFields.includes(normalizedPath)) {
        logger.warn(
          { requestId, path, normalizedPath, allowedFields },
          'Proposal parsing: field path not in whitelist, skipping'
        );
        continue;
      }

      // Validate newValue exists
      if (update.newValue === undefined) {
        logger.warn({ requestId, path }, 'Proposal parsing: newValue is undefined, skipping');
        continue;
      }

      // Validate newValue is JSON-serializable
      try {
        JSON.stringify(update.newValue);
      } catch {
        logger.warn(
          { requestId, path },
          'Proposal parsing: newValue is not serializable, skipping'
        );
        continue;
      }

      validatedUpdates.push({
        path,
        newValue: update.newValue,
        description: typeof update.description === 'string' ? update.description : undefined,
        oldValue: update.oldValue, // Optional, may be undefined
      });
    }

    if (validatedUpdates.length === 0) {
      logger.info({ requestId }, 'Proposal parsing: no valid updates after validation');
      return null;
    }

    return {
      type: 'field_updates',
      stageId,
      updates: validatedUpdates,
      summary: message,
    };
  } catch (error) {
    logger.warn(
      { requestId, error: error instanceof Error ? error.message : String(error) },
      'Proposal parsing failed, returning without proposal'
    );
    return null;
  }
}

// ============================================================================
// Intent-Based Flow Helpers
// ============================================================================

/**
 * Confidence threshold for accepting a single match without clarification.
 * Matches below this threshold or multiple matches above it require user clarification.
 */
const FUZZY_MATCH_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Format multiple matches as a numbered list for user clarification.
 *
 * @param matches - Array of target matches
 * @returns Formatted message asking user to clarify
 */
function formatMultipleMatchesMessage(matches: TargetMatch[]): string {
  const matchList = matches
    .slice(0, 5) // Limit to 5 options to avoid overwhelming the user
    .map((m, idx) => `${idx + 1}) ${m.displayLabel}: ${m.title}`)
    .join('\n');

  return `Найдено несколько совпадений:\n${matchList}\n\nУточните, какой именно элемент вы имеете в виду.`;
}

/**
 * Handle direct execution intents (DELETE, MOVE) - no LLM generation needed
 * Returns a DirectActionProposal for user confirmation
 *
 * Uses confidence-scored fuzzy matching to handle ambiguous cases:
 * - Single match with confidence >= 0.7: execute directly
 * - Multiple matches: ask user to clarify
 * - No matches: ask for clarification
 */
function handleDirectIntent(
  intent: ClassifiedIntent,
  courseStructure: CourseStructure,
  nodeContextPath?: string
): { message: string; proposal?: DirectActionProposal; requiresClarification?: boolean } {
  // Use confidence-scored matching for better disambiguation
  const matches = resolveTargetPathWithMatches(
    intent.target?.identifier,
    intent.target?.path,
    courseStructure,
    nodeContextPath
  );

  // No matches found
  if (matches.length === 0) {
    return {
      message:
        'Не удалось определить элемент. Уточните, какой именно урок или секцию вы хотите изменить.',
      requiresClarification: true,
    };
  }

  // Check for ambiguous matches (multiple high-confidence matches)
  const highConfidenceMatches = matches.filter(
    m => m.confidence >= FUZZY_MATCH_CONFIDENCE_THRESHOLD
  );

  if (highConfidenceMatches.length > 1) {
    // Multiple matches - need clarification
    return {
      message: formatMultipleMatchesMessage(highConfidenceMatches),
      requiresClarification: true,
    };
  }

  // Single best match - proceed with action
  const bestMatch = matches[0];

  // If best match is below threshold and there are other matches, ask for clarification
  if (bestMatch.confidence < FUZZY_MATCH_CONFIDENCE_THRESHOLD && matches.length > 1) {
    return {
      message: formatMultipleMatchesMessage(matches),
      requiresClarification: true,
    };
  }

  const targetPath = bestMatch.path;

  switch (intent.intent) {
    case 'DELETE_LESSON':
    case 'DELETE_SECTION': {
      const element = getElementAtPath(courseStructure, targetPath);
      if (!element) {
        return { message: 'Элемент не найден.' };
      }

      const isSection = !isLessonPath(targetPath);
      const title = isSection
        ? (element as Section).section_title
        : (element as Lesson).lesson_title;

      const lessonCount = isSection ? (element as Section).lessons.length : 0;

      return {
        message: `Удалить "${title}"?`,
        proposal: {
          type: 'direct_action',
          action: 'DELETE',
          targetPath,
          elementType: isSection ? 'section' : 'lesson',
          title,
          impactSummary: isSection
            ? `Удаление секции удалит ${lessonCount} ${lessonCount === 1 ? 'урок' : 'уроков'}.`
            : 'Нумерация уроков будет пересчитана.',
        },
      };
    }

    case 'MOVE_ELEMENT': {
      if (!intent.destination) {
        return {
          message: 'Куда переместить элемент?',
          requiresClarification: true,
        };
      }

      // Use old resolveTargetPath for destination (typically explicit, no ambiguity)
      const destinationPath = resolveTargetPath(intent.destination, undefined, courseStructure);

      if (!destinationPath) {
        return {
          message: 'Не удалось определить место назначения.',
          requiresClarification: true,
        };
      }

      const element = getElementAtPath(courseStructure, targetPath);
      const title = element
        ? isLessonPath(targetPath)
          ? (element as Lesson).lesson_title
          : (element as Section).section_title
        : 'Элемент';

      return {
        message: `Переместить "${title}" в ${intent.destination}?`,
        proposal: {
          type: 'direct_action',
          action: 'MOVE',
          targetPath,
          destinationPath,
          elementType: isLessonPath(targetPath) ? 'lesson' : 'section',
          title,
        },
      };
    }

    case 'UPDATE_FIELD': {
      if (!intent.fieldName || intent.newValue === undefined) {
        return {
          message: 'Уточните, какое поле и на какое значение изменить.',
          requiresClarification: true,
        };
      }

      // P2-3: Return field_updates proposal for UPDATE_FIELD (not direct_action)
      // This uses existing applyProposal flow which supports field updates
      return {
        message: `Изменить ${String(intent.fieldName)} на "${typeof intent.newValue === 'string' ? intent.newValue : JSON.stringify(intent.newValue)}"?`,
        // Note: This returns without proposal - UPDATE_FIELD should use field_updates
        // via the normal LLM flow or be handled by a separate handler
      };
    }

    default:
      return { message: 'Операция не поддерживается.' };
  }
}

/**
 * Build prompt with targeted context (NOT full course_structure)
 * This is the key optimization: ~500 tokens instead of 42K
 */
function buildTargetedRefinementPrompt(
  intentType: string,
  targetedContext: unknown,
  allowedFields: readonly string[],
  targetPath?: string | null
): string {
  const intentInstructions: Record<string, string> = {
    REWRITE_CONTENT: 'Rewrite the content to be clearer and more engaging.',
    EXPAND_CONTENT: 'Expand the content with more detail and examples.',
    SIMPLIFY_CONTENT: 'Simplify the content for easier understanding.',
    ADD_LESSON: 'Generate a new lesson based on the user request.',
    ADD_SECTION: 'Generate a new section based on the user request.',
  };

  return `You are an instructional designer assistant.
${intentInstructions[intentType] || 'Help the user modify the content.'}

${targetPath ? `Target element path: ${targetPath}` : 'Working at course level.'}

Current content (ONLY the relevant element, not the full course):
${JSON.stringify(targetedContext, null, 2)}

Editable fields:
${allowedFields.join('\n')}

IMPORTANT: Return ONLY valid JSON (no markdown code blocks).

Return JSON in this exact format:
{
  "message": "Human-readable explanation of changes",
  "updates": [
    { "path": "field.path", "newValue": "...", "description": "..." }
  ]
}

Rules:
1. Only modify fields listed above
2. Keep changes focused on user's request
3. Preserve existing structure
4. For Stage 5 array paths, use exact indices like "sections[0].lessons[1].lesson_title"`;
}

/**
 * Handle GET_INFO queries without modification
 */
function handleInfoQuery(
  userMessage: string,
  courseStructure: CourseStructure
): { message: string } {
  const outline = generateCourseOutline(courseStructure);
  const sectionCount = outline.sections.length;
  const lessonCount = outline.sections.reduce((sum, s) => sum + s.lessons.length, 0);

  // Simple pattern matching for common queries
  const lowerMessage = userMessage.toLowerCase();

  if (lowerMessage.includes('сколько') && lowerMessage.includes('урок')) {
    return { message: `В курсе ${lessonCount} уроков.` };
  }

  if (
    lowerMessage.includes('сколько') &&
    (lowerMessage.includes('секц') || lowerMessage.includes('раздел'))
  ) {
    return { message: `В курсе ${sectionCount} секций.` };
  }

  if (
    lowerMessage.includes('продолжительн') ||
    lowerMessage.includes('длительн') ||
    lowerMessage.includes('duration')
  ) {
    return { message: `Общая продолжительность курса: ${outline.total_duration_hours} часов.` };
  }

  // General info
  return {
    message: `Курс "${outline.course_title}" содержит ${sectionCount} секций и ${lessonCount} уроков. Общая продолжительность: ${outline.total_duration_hours} часов.`,
  };
}

// ============================================================================
// Input Schemas
// ============================================================================

/**
 * Input schema for applyProposal endpoint
 */
const applyProposalInputSchema = z.object({
  courseId: z.string().uuid(),
  conversationId: z.string().uuid(),
  proposal: proposalSchema,
});

/**
 * Input schema for applyDirectAction endpoint
 */
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
      const { courseId, chatType, conversationId, nodeContext, previousOutput } = input;
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
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Previous output too large (max 1MB)',
        });
      }

      if (!userId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      // Extract access token for authenticated Supabase client (RLS enforcement)
      const accessToken = extractAccessToken(ctx.req);
      if (!accessToken) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication token required',
        });
      }

      // Use authenticated client for course queries - RLS policies enforce access control
      // This replaces the manual ownership check with database-level security
      const supabaseAuth = createAuthenticatedClient(accessToken);

      // Use admin client for chat message inserts (no user-facing RLS on chat_messages)
      const supabaseAdmin = getSupabaseAdmin();

      // Validate conversationId belongs to this course if provided
      if (conversationId) {
        const { data: existingConv } = await supabaseAdmin
          .from('course_chat_messages')
          .select('course_id')
          .eq('conversation_id', conversationId)
          .limit(1)
          .maybeSingle();

        if (existingConv && existingConv.course_id !== courseId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Conversation does not belong to this course',
          });
        }
      }

      // Query course using authenticated client - RLS enforces ownership automatically
      const { data: course, error: courseError } = await supabaseAuth
        .from('courses')
        .select(
          'id, user_id, title, language, style, analysis_result, course_structure, generation_status'
        )
        .eq('id', courseId)
        .single();

      if (courseError || !course) {
        // RLS returns no data if user doesn't have access, so this covers both not found and forbidden
        logger.warn(
          { requestId, userId, courseId, error: courseError },
          'Course not found or access denied'
        );
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Course not found or access denied',
        });
      }

      // Block chat during active generation phases
      // Uses PAUSABLE_STATUSES from shared-types as Single Source of Truth
      // These are statuses where generation is actively running (not awaiting approval)
      const generationStatus = course.generation_status || '';
      const isGenerationActive = (PAUSABLE_STATUSES as readonly string[]).includes(
        generationStatus
      );

      if (isGenerationActive) {
        logger.info(
          { requestId, courseId, generationStatus },
          'Chat blocked: generation is active'
        );
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'Chat is unavailable during active generation. Please wait for the current stage to complete.',
        });
      }

      // Note: Manual ownership check removed - RLS policy on courses table enforces
      // that users can only select their own courses (user_id = auth.uid())

      // Use explicit intent from request (UI selection, not keyword classification)
      const intent = input.intent;
      const convId = conversationId || crypto.randomUUID();

      // Fetch conversation history before calling LLM
      // Limit to last 10 messages to stay within context window
      const { data: history, error: historyError } = await supabaseAdmin
        .from('course_chat_messages')
        .select('role, content')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })
        .limit(10);

      if (historyError) {
        logger.warn(
          { requestId, courseId, conversationId: convId, error: historyError },
          'Failed to fetch conversation history (non-blocking, will continue without history)'
        );
      }

      // Save user message to conversation history (using admin client - no RLS on chat_messages)
      const { error: insertUserMsgError } = await supabaseAdmin
        .from('course_chat_messages')
        .insert({
          course_id: courseId,
          conversation_id: convId,
          role: 'user',
          content: userMessage,
          chat_type: chatType,
          node_context: nodeContext || null,
          intent,
        });

      if (insertUserMsgError) {
        // Non-blocking: log but continue
        logger.warn(
          { requestId, courseId, error: insertUserMsgError },
          'Failed to save user message (non-blocking)'
        );
      }

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

      // ============================================================================
      // NEW: Intent Classification Flow (feature flag)
      // ============================================================================
      const enableIntentClassification = process.env.ENABLE_INTENT_CLASSIFICATION === 'true';

      if (
        enableIntentClassification &&
        intent === 'refine' &&
        chatType === 'node' &&
        nodeContext?.stageId === 'stage_5' &&
        course.course_structure
      ) {
        const courseStructure = course.course_structure as CourseStructure;

        // Step 1: Classify intent using cheap model (~200 tokens)
        const classifiedIntent = await classifyIntent(
          userMessage,
          nodeContext
            ? {
                stageId: nodeContext.stageId,
                path: nodeContext.blockPath,
                elementType: nodeContext.nodeId?.includes('lesson') ? 'lesson' : 'section',
              }
            : undefined
        );

        logger.info(
          {
            requestId,
            classifiedIntent: classifiedIntent.intent,
            confidence: classifiedIntent.confidence,
            target: classifiedIntent.target,
          },
          'Chat: Intent classified'
        );

        // Step 2: Handle direct execution intents (DELETE, MOVE) - 0 tokens for generation
        if (
          isDirectExecutionIntent(classifiedIntent.intent) &&
          classifiedIntent.confidence >= INTENT_CONFIDENCE_THRESHOLDS.DIRECT_EXECUTION
        ) {
          const directResult = handleDirectIntent(
            classifiedIntent,
            courseStructure,
            nodeContext.blockPath
          );

          // Save assistant message
          await supabaseAdmin.from('course_chat_messages').insert({
            course_id: courseId,
            conversation_id: convId,
            role: 'assistant',
            content: directResult.message,
            chat_type: chatType,
            node_context: nodeContext || null,
            intent,
            model_used: 'intent_classifier',
            input_tokens: 200, // Approximate classification tokens
            output_tokens: 50,
          });

          return {
            conversationId: convId,
            assistantMessage: directResult.message,
            intent,
            proposal: directResult.proposal as Proposal | undefined,
            modelUsed: 'intent_classifier',
            inputTokens: 200,
            outputTokens: 50,
          };
        }

        // Step 3: Handle GET_INFO queries - no LLM needed
        if (
          classifiedIntent.intent === 'GET_INFO' &&
          classifiedIntent.confidence >= INTENT_CONFIDENCE_THRESHOLDS.GET_INFO
        ) {
          const infoResult = handleInfoQuery(userMessage, courseStructure);

          await supabaseAdmin.from('course_chat_messages').insert({
            course_id: courseId,
            conversation_id: convId,
            role: 'assistant',
            content: infoResult.message,
            chat_type: chatType,
            node_context: nodeContext || null,
            intent,
            model_used: 'info_query',
            input_tokens: 0,
            output_tokens: 0,
          });

          return {
            conversationId: convId,
            assistantMessage: infoResult.message,
            intent,
            modelUsed: 'info_query',
            inputTokens: 0,
            outputTokens: 0,
          };
        }

        // Step 4: LLM-required intents with TARGETED context (~500 tokens vs 42K)
        if (
          isLLMRequiredIntent(classifiedIntent.intent) &&
          classifiedIntent.confidence >= INTENT_CONFIDENCE_THRESHOLDS.LLM_REQUIRED
        ) {
          const targetPath = resolveTargetPath(
            classifiedIntent.target?.identifier,
            classifiedIntent.target?.path,
            courseStructure,
            nodeContext.blockPath
          );

          let targetedContext: unknown;
          let allowedFieldsForTarget: readonly string[];

          if (targetPath) {
            // Send only the selected element (~500 tokens)
            targetedContext = getElementAtPath(courseStructure, targetPath);
            const isLesson = isLessonPath(targetPath);
            allowedFieldsForTarget = isLesson
              ? ['lesson_title', 'lesson_objectives', 'key_topics', 'estimated_duration_minutes']
              : ['section_title', 'section_description', 'learning_objectives'];
          } else {
            // No specific element - use lightweight outline
            targetedContext = generateCourseOutline(courseStructure);
            allowedFieldsForTarget = STAGE5_EDITABLE_FIELDS;
          }

          // Build targeted prompt
          const targetedSystemPrompt = buildTargetedRefinementPrompt(
            classifiedIntent.intent,
            targetedContext,
            allowedFieldsForTarget,
            targetPath
          );

          // Get model config
          const modelConfigService = createModelConfigService();
          let targetedModelId = CHAT_FALLBACK_CONFIG.modelId;
          let targetedTemperature = CHAT_FALLBACK_CONFIG.temperature;
          const targetedMaxTokens = 2048; // Much smaller for targeted response

          try {
            const config = await modelConfigService.getModelForPhase(
              'chat_node_refinement',
              courseId,
              undefined,
              (course.language as 'ru' | 'en') || 'ru'
            );
            targetedModelId = config.modelId;
            targetedTemperature = config.temperature;
          } catch {
            // Use fallback
          }

          const targetedLLMResponse = await llmClient.generateChatCompletion(
            [
              { role: 'system', content: targetedSystemPrompt },
              { role: 'user', content: userMessage },
            ],
            {
              model: targetedModelId,
              temperature: targetedTemperature,
              maxTokens: targetedMaxTokens,
            }
          );

          // Parse proposal
          const targetedProposal = parseProposalFromLLMResponse(
            targetedLLMResponse.content,
            'stage_5',
            allowedFieldsForTarget,
            requestId
          );

          const targetedMessage = targetedProposal?.summary || targetedLLMResponse.content;

          await supabaseAdmin.from('course_chat_messages').insert({
            course_id: courseId,
            conversation_id: convId,
            role: 'assistant',
            content: targetedMessage,
            chat_type: chatType,
            node_context: nodeContext || null,
            intent,
            model_used: targetedModelId,
            input_tokens: targetedLLMResponse.inputTokens,
            output_tokens: targetedLLMResponse.outputTokens,
          });

          logger.info(
            {
              requestId,
              courseId,
              classifiedIntent: classifiedIntent.intent,
              targetPath,
              modelUsed: targetedModelId,
              inputTokens: targetedLLMResponse.inputTokens,
              outputTokens: targetedLLMResponse.outputTokens,
              hasProposal: !!targetedProposal,
            },
            'Chat: Targeted response generated'
          );

          return {
            conversationId: convId,
            assistantMessage: targetedMessage,
            intent,
            proposal: targetedProposal || undefined,
            modelUsed: targetedModelId,
            inputTokens: targetedLLMResponse.inputTokens || 0,
            outputTokens: targetedLLMResponse.outputTokens || 0,
          };
        }

        // Fallback: UNKNOWN intent with low confidence - use legacy flow
        logger.info(
          {
            requestId,
            classifiedIntent: classifiedIntent.intent,
            confidence: classifiedIntent.confidence,
          },
          'Chat: Low confidence or UNKNOWN, falling back to legacy flow'
        );
      }
      // ============================================================================
      // END: Intent Classification Flow
      // ============================================================================

      // Get model config for chat phase
      const modelConfigService = createModelConfigService();
      const phaseName = chatType === 'node' ? 'chat_node_refinement' : 'chat_global_guidance';
      let modelId = CHAT_FALLBACK_CONFIG.modelId;
      let temperature = CHAT_FALLBACK_CONFIG.temperature;
      let maxTokens = CHAT_FALLBACK_CONFIG.maxTokens;

      try {
        const config = await modelConfigService.getModelForPhase(
          phaseName,
          courseId,
          undefined, // tokenCount - not needed for chat
          (course.language as 'ru' | 'en') || 'ru'
        );
        modelId = config.modelId;
        temperature = config.temperature;
        maxTokens = config.maxTokens;
      } catch (configError) {
        // Use fallback config if ModelConfigService fails
        logger.warn(
          { requestId, phaseName, error: configError, fallback: CHAT_FALLBACK_CONFIG },
          'Failed to get model config, using fallback'
        );
      }

      // Determine if we should generate a proposal (Stage 4/5 refinement with node context)
      const shouldGenerateProposal =
        intent === 'refine' &&
        chatType === 'node' &&
        nodeContext &&
        (nodeContext.stageId === 'stage_4' || nodeContext.stageId === 'stage_5');

      // Get allowed fields and current data for proposal generation
      let allowedFields: readonly string[] = [];
      let currentData: unknown = null;
      let stageId: 'stage_4' | 'stage_5' | null = null;

      if (shouldGenerateProposal && nodeContext) {
        stageId = nodeContext.stageId as 'stage_4' | 'stage_5';
        allowedFields = stageId === 'stage_4' ? STAGE4_EDITABLE_FIELDS : STAGE5_EDITABLE_FIELDS;
        currentData = stageId === 'stage_4' ? course.analysis_result : course.course_structure;
      }

      // Build context-aware system prompt
      const courseContext = `
<course_context>
  Title: ${course.title || 'Untitled Course'}
  Language: ${course.language || 'ru'}
  Style: ${course.style || 'formal'}
</course_context>`;

      let contentContext = '';
      if (chatType === 'node' && nodeContext && previousOutput) {
        contentContext = `
<current_content>
${previousOutput}
</current_content>

<target_location>
  Stage: ${nodeContext.stageId}
  ${nodeContext.nodeId ? `Node ID: ${nodeContext.nodeId}` : ''}
  ${nodeContext.blockPath ? `Block Path: ${nodeContext.blockPath}` : ''}
</target_location>`;
      }

      // Use refinement prompt for proposal generation, standard prompt otherwise
      let systemPrompt: string;
      if (shouldGenerateProposal && stageId && currentData) {
        systemPrompt = buildRefinementPrompt(stageId, currentData, allowedFields);
      } else {
        systemPrompt = `You are an expert instructional designer helping refine course content.
${courseContext}
${contentContext}

<instructions>
- Respond in the user's language (detect from their message)
- If the user wants to REFINE content: provide specific improvements, suggestions, or refined content
- If the user wants to REGENERATE: acknowledge their request and explain what will be regenerated
- Be concise but helpful
- If returning content, format appropriately for the content type
- For JSON content, return valid JSON without markdown code blocks
- Focus on pedagogical quality and alignment with course goals
</instructions>`;
      }

      // Build messages array for multi-turn conversation
      // Start with system prompt
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];

      // Add conversation history (if available)
      if (history && history.length > 0) {
        for (const msg of history) {
          messages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          });
        }
      }

      // Add current user message
      messages.push({ role: 'user', content: userMessage });

      // Generate LLM response using chat completion (multi-turn conversation support)
      let llmResponse;
      try {
        llmResponse = await llmClient.generateChatCompletion(messages, {
          model: modelId,
          temperature,
          maxTokens,
        });
      } catch (llmError) {
        logger.error(
          {
            requestId,
            courseId,
            modelId,
            error: llmError instanceof Error ? llmError.message : String(llmError),
          },
          'LLM generation failed in chat'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate response. Please try again.',
        });
      }

      // Save assistant message with metrics (using admin client - no RLS on chat_messages)
      const { error: insertAssistantMsgError } = await supabaseAdmin
        .from('course_chat_messages')
        .insert({
          course_id: courseId,
          conversation_id: convId,
          role: 'assistant',
          content: llmResponse.content,
          chat_type: chatType,
          node_context: nodeContext || null,
          intent,
          model_used: modelId,
          input_tokens: llmResponse.inputTokens,
          output_tokens: llmResponse.outputTokens,
        });

      if (insertAssistantMsgError) {
        // Non-blocking: log but continue
        logger.warn(
          { requestId, courseId, error: insertAssistantMsgError },
          'Failed to save assistant message (non-blocking)'
        );
      }

      // Parse proposal from LLM response if we requested one
      let proposal: Proposal | undefined;
      let assistantMessage = llmResponse.content;

      if (shouldGenerateProposal && stageId) {
        const parsedProposal = parseProposalFromLLMResponse(
          llmResponse.content,
          stageId,
          allowedFields,
          requestId
        );

        if (parsedProposal) {
          proposal = parsedProposal;
          // Use the summary as the assistant message for better UX
          assistantMessage = parsedProposal.summary || llmResponse.content;

          logger.info(
            {
              requestId,
              courseId,
              proposalType: proposal.type,
              updateCount: parsedProposal.updates.length,
            },
            'Chat: Proposal generated'
          );
        } else {
          logger.info(
            { requestId, courseId },
            'Chat: No valid proposal extracted, returning text response'
          );
        }
      }

      logger.info(
        {
          requestId,
          courseId,
          intent,
          modelUsed: modelId,
          inputTokens: llmResponse.inputTokens,
          outputTokens: llmResponse.outputTokens,
          hasProposal: !!proposal,
        },
        'Chat: Response generated'
      );

      return {
        conversationId: convId,
        assistantMessage,
        intent,
        proposal,
        modelUsed: modelId,
        inputTokens: llmResponse.inputTokens || 0,
        outputTokens: llmResponse.outputTokens || 0,
      };
    }),

  /**
   * Apply a proposal from chat refinement.
   *
   * Supports two proposal types:
   * - field_updates: Apply multiple field changes to Stage 4 or Stage 5 data
   * - lesson_patch: Apply patched content to a Stage 6 lesson section
   *
   * Authorization: Requires course ownership or org admin access.
   */
  applyProposal: instructorProcedure.input(applyProposalInputSchema).mutation(
    async ({
      ctx,
      input,
    }): Promise<{
      success: boolean;
      appliedUpdates?: number;
      lessonId?: string;
      sectionId?: string;
      updatedAt: string;
    }> => {
      const { courseId, conversationId } = input;
      const proposal = input.proposal;
      const requestId = nanoid();
      const userId = ctx.user?.id;

      if (!userId || !ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
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
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Course not found',
        });
      }

      // Check authorization: superadmin/admin/owner can apply proposals
      assertCourseAccess(buildAuthContext(ctx.user), course, 'apply proposal');

      logger.info(
        {
          requestId,
          courseId,
          conversationId,
          proposalType: proposal.type,
        },
        'applyProposal: Starting'
      );

      try {
        if (proposal.type === 'field_updates') {
          // Apply field updates for Stage 4/5
          const { stageId, updates } = proposal;
          const allowedFields =
            stageId === 'stage_4' ? STAGE4_EDITABLE_FIELDS : STAGE5_EDITABLE_FIELDS;

          const currentData =
            stageId === 'stage_4' ? course.analysis_result : course.course_structure;

          if (!currentData) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Cannot apply updates: ${stageId === 'stage_4' ? 'analysis_result' : 'course_structure'} is empty`,
            });
          }

          // Apply all updates sequentially to build final state
          let updatedData: unknown;
          try {
            updatedData = structuredClone(currentData);
          } catch (cloneError) {
            logger.warn(
              { requestId, courseId, error: cloneError },
              'structuredClone failed, using JSON fallback'
            );
            try {
              updatedData = JSON.parse(JSON.stringify(currentData));
            } catch {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Cannot process data structure',
              });
            }
          }

          for (const update of updates) {
            const normalizedPath =
              stageId === 'stage_5' ? normalizePathForValidation(update.path) : update.path;

            // Validate path is in whitelist
            if (!allowedFields.includes(normalizedPath)) {
              logger.warn(
                { requestId, courseId, path: update.path, normalizedPath },
                'applyProposal: Field path not in whitelist, skipping'
              );
              continue;
            }

            try {
              if (stageId === 'stage_5') {
                const result = applyFieldUpdate(
                  updatedData as CourseStructure,
                  update.path,
                  update.newValue
                );
                updatedData = result.updatedStructure;
              } else {
                setNestedValue(updatedData, update.path, update.newValue);
              }

              logger.info(
                { requestId, courseId, path: update.path },
                'applyProposal: Applied field update'
              );
            } catch (error) {
              logger.warn(
                {
                  requestId,
                  courseId,
                  path: update.path,
                  error: error instanceof Error ? error.message : String(error),
                },
                'applyProposal: Failed to apply field update, skipping'
              );
            }
          }

          // Save updated data to database
          const updateColumn = stageId === 'stage_4' ? 'analysis_result' : 'course_structure';
          const now = new Date().toISOString();

          const { error: updateError } = await supabase
            .from('courses')
            .update({
              [updateColumn]: updatedData,
              updated_at: now,
            })
            .eq('id', courseId);

          if (updateError) {
            logger.error(
              { requestId, courseId, stageId, error: updateError },
              'applyProposal: Database update failed'
            );
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to apply proposal',
            });
          }

          logger.info(
            {
              requestId,
              courseId,
              stageId,
              updateCount: updates.length,
            },
            'applyProposal: Field updates applied successfully'
          );

          return {
            success: true,
            appliedUpdates: updates.length,
            updatedAt: now,
          };
        } else if (proposal.type === 'lesson_patch') {
          // Apply lesson content patch for Stage 6
          const { lessonId, patchedContent, sectionId } = proposal;

          // Fetch course for authorization check
          const { data: lessonCourse, error: lessonCourseError } = await supabase
            .from('courses')
            .select('id, user_id, organization_id')
            .eq('id', courseId)
            .single();

          if (lessonCourseError || !lessonCourse) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
          }

          assertCourseAccess(buildAuthContext(ctx.user), lessonCourse, 'apply proposal');

          // Resolve lesson UUID
          const lessonUuid = await resolveLessonIdOrUuid(courseId, lessonId);
          if (!lessonUuid) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `Lesson ${lessonId} not found`,
            });
          }

          // Fetch current lesson content
          const { data: currentLesson, error: fetchError } = await supabase
            .from('lesson_contents')
            .select('content, metadata')
            .eq('course_id', courseId)
            .eq('lesson_id', lessonUuid)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (fetchError && fetchError.code !== 'PGRST116') {
            logger.error({ requestId, error: fetchError.message }, 'Failed to fetch lesson');
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to fetch lesson content',
            });
          }

          // Build updated content by patching the specific section
          const lessonContent = (currentLesson?.content as {
            sections?: Array<{ title: string; content: string }>;
          }) || { sections: [] };
          const sections = lessonContent.sections || [];

          // Find and update the target section
          const sectionIndex = sections.findIndex(
            (s: { title: string }) =>
              s.title === sectionId || s.title.toLowerCase() === sectionId.toLowerCase()
          );

          let updatedContent: unknown;
          if (sectionIndex >= 0) {
            // Update existing section
            const updatedSections = [...sections];
            updatedSections[sectionIndex] = {
              ...updatedSections[sectionIndex],
              content: patchedContent,
            };
            updatedContent = { ...lessonContent, sections: updatedSections };
          } else {
            // Section not found - append as new section
            updatedContent = {
              ...lessonContent,
              sections: [...sections, { title: sectionId, content: patchedContent }],
            };
          }

          // Update lesson content
          const now = new Date().toISOString();
          const updatedMetadata = {
            ...((currentLesson?.metadata as Record<string, unknown>) || {}),
            updated_by: ctx.user.id,
            updated_at: now,
            patch_applied: {
              sectionId,
              conversationId,
              appliedAt: now,
            },
          };

          const { error: updateError } = await supabase
            .from('lesson_contents')
            .update({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content: updatedContent as any, // JSONB in database
              updated_at: now,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              metadata: updatedMetadata as any, // JSONB in database
            })
            .eq('course_id', courseId)
            .eq('lesson_id', lessonUuid);

          if (updateError) {
            logger.error(
              { requestId, courseId, lessonId, error: updateError },
              'applyProposal: Failed to update lesson content'
            );
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to apply lesson patch',
            });
          }

          logger.info(
            {
              requestId,
              courseId,
              lessonId,
              sectionId,
            },
            'applyProposal: Lesson patch applied successfully'
          );

          return {
            success: true,
            lessonId,
            sectionId,
            updatedAt: now,
          };
        }

        // Unknown proposal type (shouldn't happen due to zod validation)
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Unknown proposal type',
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            requestId,
            courseId,
            error: error instanceof Error ? error.message : String(error),
          },
          'applyProposal: Unexpected error'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to apply proposal',
        });
      }
    }
  ),

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
    .mutation(
      async ({
        ctx,
        input,
      }): Promise<{
        success: boolean;
        recalculated?: {
          lessonNumbers?: Record<string, number>;
          courseDuration?: number;
          sectionDuration?: number;
        };
        updatedAt: string;
      }> => {
        const { courseId, action, targetPath, destinationPath } = input;
        const requestId = nanoid();
        const userId = ctx.user?.id;

        if (!userId || !ctx.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
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
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Course not found',
          });
        }

        // Check authorization
        assertCourseAccess(buildAuthContext(ctx.user), course, 'apply direct action');

        if (!course.course_structure) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Course structure is empty',
          });
        }

        const courseStructure = course.course_structure as CourseStructure;

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
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Invalid action',
            });
          }

          // Save updated structure
          const now = new Date().toISOString();
          const { error: updateError } = await supabase
            .from('courses')
            .update({
              course_structure: result.updatedStructure,
              updated_at: now,
            })
            .eq('id', courseId);

          if (updateError) {
            logger.error(
              { requestId, courseId, action, error: updateError },
              'applyDirectAction: Database update failed'
            );
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to apply action',
            });
          }

          logger.info(
            {
              requestId,
              courseId,
              action,
              targetPath,
              recalculated: result.recalculated,
            },
            'applyDirectAction: Applied successfully'
          );

          return {
            success: true,
            recalculated: result.recalculated,
            updatedAt: now,
          };
        } catch (error) {
          if (error instanceof TRPCError) throw error;

          logger.error(
            {
              requestId,
              courseId,
              error: error instanceof Error ? error.message : String(error),
            },
            'applyDirectAction: Unexpected error'
          );

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to apply action',
          });
        }
      }
    ),
};
