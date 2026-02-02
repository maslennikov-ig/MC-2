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
  type Proposal,
  type FieldUpdatesProposal,
  type FieldUpdateItem,
} from '@megacampus/shared-types/chat-types';
import {
  STAGE4_EDITABLE_FIELDS,
  STAGE5_EDITABLE_FIELDS,
} from '@megacampus/shared-types/regeneration-types';
import { llmClient } from '../../../../shared/llm/client';
import { createModelConfigService } from '../../../../shared/llm/model-config-service';
import { applyFieldUpdate } from '../../../../stages/stage5-generation/utils/course-structure-editor';
import type { CourseStructure } from '@megacampus/shared-types';
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

// ============================================================================
// Fallback Configuration
// ============================================================================

/**
 * Default fallback configuration for chat when ModelConfigService is unavailable.
 * Can be overridden via environment variables for flexibility without redeployment.
 *
 * Environment variables:
 * - CHAT_FALLBACK_MODEL: OpenRouter model ID (default: openai/gpt-4o-mini)
 * - CHAT_FALLBACK_TEMPERATURE: Temperature 0-1 (default: 0.7)
 * - CHAT_FALLBACK_MAX_TOKENS: Max tokens (default: 4096)
 */
const CHAT_FALLBACK_CONFIG = {
  modelId: process.env.CHAT_FALLBACK_MODEL || 'openai/gpt-4o-mini',
  temperature: parseFloat(process.env.CHAT_FALLBACK_TEMPERATURE || '0.7'),
  maxTokens: parseInt(process.env.CHAT_FALLBACK_MAX_TOKENS || '4096', 10),
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
  void targetStageId; // Used in prompt context
  return `You are an instructional designer assistant.
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
      // Generation is active during _init, _processing, _generating, _classifying phases
      const BLOCKED_PATTERNS = ['_init', '_processing', '_generating', '_classifying'];
      const generationStatus = course.generation_status || '';
      const isGenerationActive = BLOCKED_PATTERNS.some(p => generationStatus.includes(p));

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
};
