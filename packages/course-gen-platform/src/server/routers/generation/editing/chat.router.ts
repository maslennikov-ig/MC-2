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
 * - 'refine': Inline content refinement (immediate response)
 * - 'regenerate': Full regeneration trigger (may spawn async job)
 */

import { TRPCError } from '@trpc/server';
import { instructorProcedure } from '../../../procedures';
import { createRateLimiter } from '../../../middleware/rate-limit';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import {
  createAuthenticatedClient,
  extractAccessToken,
} from '../../../../shared/supabase/authenticated';
import { logger } from '../../../../shared/logger/index.js';
import { nanoid } from 'nanoid';
import { chatRequestSchema, type ChatResponse } from '@megacampus/shared-types/chat-types';
import { llmClient } from '../../../../shared/llm/client';
import { createModelConfigService } from '../../../../shared/llm/model-config-service';

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
      const { courseId, chatType, userMessage, conversationId, nodeContext, previousOutput } =
        input;
      const requestId = nanoid();
      const userId = ctx.user?.id;

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

      // Query course using authenticated client - RLS enforces ownership automatically
      const { data: course, error: courseError } = await supabaseAuth
        .from('courses')
        .select('id, user_id, title, language, style, analysis_result, course_structure')
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

      const systemPrompt = `You are an expert instructional designer helping refine course content.
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

      logger.info(
        {
          requestId,
          courseId,
          intent,
          modelUsed: modelId,
          inputTokens: llmResponse.inputTokens,
          outputTokens: llmResponse.outputTokens,
        },
        'Chat: Response generated'
      );

      return {
        conversationId: convId,
        assistantMessage: llmResponse.content,
        intent,
        modelUsed: modelId,
        inputTokens: llmResponse.inputTokens || 0,
        outputTokens: llmResponse.outputTokens || 0,
      };
    }),
};
