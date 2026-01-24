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
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';
import { nanoid } from 'nanoid';
import {
  chatRequestSchema,
  REGENERATE_KEYWORDS,
  type ChatResponse,
  type ChatIntent,
} from '@megacampus/shared-types/chat-types';
import { llmClient } from '../../../../shared/llm/client';
import { createModelConfigService } from '../../../../shared/llm/model-config-service';

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
// Intent Classification
// ============================================================================

/**
 * Rule-based intent classification using keyword matching.
 * Returns 'regenerate' if message contains regeneration keywords,
 * otherwise returns 'refine' for inline content refinement.
 *
 * @param message - User message to classify
 * @returns Intent: 'refine' or 'regenerate'
 *
 * @example
 * classifyIntent('Перегенерируй курс') // returns 'regenerate'
 * classifyIntent('Добавь больше примеров') // returns 'refine'
 */
function classifyIntent(message: string): ChatIntent {
  const lowerMessage = message.toLowerCase();
  const isRegenerate = REGENERATE_KEYWORDS.some((keyword: string) =>
    lowerMessage.includes(keyword)
  );
  return isRegenerate ? 'regenerate' : 'refine';
}

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
    .input(chatRequestSchema)
    .mutation(async ({ ctx, input }): Promise<ChatResponse> => {
      const { courseId, chatType, userMessage, conversationId, nodeContext, previousOutput } =
        input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      // Verify course ownership
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('id, user_id, title, language, style, analysis_result, course_structure')
        .eq('id', courseId)
        .single();

      if (courseError || !course) {
        logger.warn({ requestId, userId, courseId, error: courseError }, 'Course not found');
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Course not found',
        });
      }

      if (course.user_id !== userId) {
        logger.warn(
          {
            requestId,
            userId,
            courseId,
            courseOwnerId: course.user_id,
          },
          'Course ownership violation in chat'
        );
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this course',
        });
      }

      // Classify intent
      const intent = classifyIntent(userMessage);
      const convId = conversationId || crypto.randomUUID();

      // Save user message to conversation history
      const { error: insertUserMsgError } = await supabase.from('course_chat_messages').insert({
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

      // Generate LLM response
      let llmResponse;
      try {
        llmResponse = await llmClient.generateCompletion(userMessage, {
          model: modelId,
          temperature,
          maxTokens,
          systemPrompt,
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

      // Save assistant message with metrics
      const { error: insertAssistantMsgError } = await supabase
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
