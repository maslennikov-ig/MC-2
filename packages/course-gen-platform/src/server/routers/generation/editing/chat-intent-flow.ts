/**
 * Chat Intent Classification Flow
 * @module server/routers/generation/editing/chat-intent-flow
 *
 * Handles the intent classification flow for the chat mutation.
 * Routes classified intents to appropriate handlers:
 * - Direct execution (DELETE, MOVE) - no LLM needed
 * - Info queries (GET_INFO) - no LLM needed
 * - LLM-required intents (REWRITE, EXPAND, etc.) - targeted context
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../../../../shared/logger/index.js';
import type { ChatResponse, Proposal } from '@megacampus/shared-types/chat-types';
import type { CourseStructure, Database } from '@megacampus/shared-types';
import {
  classifyIntent,
  isDirectExecutionIntent,
  isLLMRequiredIntent,
} from '../../../../shared/intent';
import { llmClient } from '../../../../shared/llm/client';
import { createModelConfigService } from '../../../../shared/llm/model-config-service';
import {
  handleDirectIntent,
  handleInfoQuery,
  buildTargetedRefinementPrompt,
  parseProposalFromLLMResponse,
  resolveTargetedContext,
} from './chat-helpers';
import {
  persistAssistantMessage,
  type ChatFallbackConfig,
  type IntentConfidenceThresholds,
} from './chat-mutation-helpers';

// ============================================================================
// Types
// ============================================================================

/** Common message parameters for all intent routes */
interface IntentRouteMsgParams {
  convId: string;
  chatType: 'node' | 'global';
  nodeContext?: { stageId: string; nodeId?: string; blockPath?: string } | null;
  intent: 'refine' | 'regenerate';
}

// ============================================================================
// Intent Route Handlers
// ============================================================================

/**
 * Handle direct execution intents (DELETE, MOVE) within the intent classification flow.
 * Returns ChatResponse for direct intents with high confidence.
 */
async function handleDirectExecutionRoute(
  classifiedIntent: Awaited<ReturnType<typeof classifyIntent>>,
  courseStructure: CourseStructure,
  nodeContextBlockPath: string | undefined,
  supabaseAdmin: SupabaseClient<Database>,
  courseId: string,
  params: IntentRouteMsgParams
): Promise<ChatResponse> {
  const directResult = handleDirectIntent(classifiedIntent, courseStructure, nodeContextBlockPath);

  // Save assistant message
  await supabaseAdmin.from('course_chat_messages').insert({
    course_id: courseId,
    conversation_id: params.convId,
    role: 'assistant',
    content: directResult.message,
    chat_type: params.chatType,
    node_context: params.nodeContext || null,
    intent: params.intent,
    model_used: 'intent_classifier',
    input_tokens: 200, // Approximate classification tokens
    output_tokens: 50,
  });

  return {
    conversationId: params.convId,
    assistantMessage: directResult.message,
    intent: params.intent,
    proposal: directResult.proposal as Proposal | undefined,
    modelUsed: 'intent_classifier',
    inputTokens: 200,
    outputTokens: 50,
  };
}

/**
 * Handle GET_INFO queries within the intent classification flow.
 * Returns ChatResponse for info queries without LLM generation.
 */
async function handleInfoQueryRoute(
  userMessage: string,
  courseStructure: CourseStructure,
  supabaseAdmin: SupabaseClient<Database>,
  courseId: string,
  params: IntentRouteMsgParams
): Promise<ChatResponse> {
  const infoResult = handleInfoQuery(userMessage, courseStructure);

  await supabaseAdmin.from('course_chat_messages').insert({
    course_id: courseId,
    conversation_id: params.convId,
    role: 'assistant',
    content: infoResult.message,
    chat_type: params.chatType,
    node_context: params.nodeContext || null,
    intent: params.intent,
    model_used: 'info_query',
    input_tokens: 0,
    output_tokens: 0,
  });

  return {
    conversationId: params.convId,
    assistantMessage: infoResult.message,
    intent: params.intent,
    modelUsed: 'info_query',
    inputTokens: 0,
    outputTokens: 0,
  };
}

/**
 * Handle LLM-required intents with TARGETED context (~500 tokens vs 42K).
 * Resolves targeted context, builds prompt, calls LLM, and parses proposal.
 */
async function handleLLMRequiredRoute(
  classifiedIntent: Awaited<ReturnType<typeof classifyIntent>>,
  userMessage: string,
  courseStructure: CourseStructure,
  courseLanguage: string | null,
  courseId: string,
  nodeContextBlockPath: string | undefined,
  supabaseAdmin: SupabaseClient<Database>,
  fallbackConfig: ChatFallbackConfig,
  requestId: string,
  params: IntentRouteMsgParams
): Promise<ChatResponse> {
  const { targetedContext, allowedFieldsForTarget, targetPath } = resolveTargetedContext({
    classifiedIntent,
    courseStructure,
    nodeContextBlockPath,
  });

  // Build targeted prompt
  const targetedSystemPrompt = buildTargetedRefinementPrompt(
    classifiedIntent.intent,
    targetedContext,
    allowedFieldsForTarget,
    targetPath
  );

  // Get model config
  const modelConfigService = createModelConfigService();
  let targetedModelId = fallbackConfig.modelId;
  let targetedTemperature = fallbackConfig.temperature;
  const targetedMaxTokens = 2048; // Much smaller for targeted response

  try {
    const config = await modelConfigService.getModelForPhase(
      'chat_node_refinement',
      courseId,
      undefined,
      (courseLanguage as 'ru' | 'en') || 'ru'
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

  // Ensure targetedMessage is always human-readable, never raw JSON
  let targetedMessage = targetedProposal?.summary;
  if (!targetedMessage?.trim() && targetedProposal) {
    targetedMessage = targetedProposal.updates
      .map(u => u.description)
      .filter(Boolean)
      .join('; ');
  }
  if (!targetedMessage?.trim()) {
    targetedMessage = targetedLLMResponse.content;
  }
  if (!targetedMessage?.trim()) {
    targetedMessage = 'Предложены изменения. Проверьте детали ниже.';
  }

  await persistAssistantMessage(supabaseAdmin, {
    courseId,
    convId: params.convId,
    content: targetedMessage,
    chatType: params.chatType,
    nodeContext: params.nodeContext,
    intent: params.intent,
    modelUsed: targetedModelId,
    inputTokens: targetedLLMResponse.inputTokens,
    outputTokens: targetedLLMResponse.outputTokens,
    requestId,
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
    conversationId: params.convId,
    assistantMessage: targetedMessage,
    intent: params.intent,
    proposal: targetedProposal || undefined,
    modelUsed: targetedModelId,
    inputTokens: targetedLLMResponse.inputTokens || 0,
    outputTokens: targetedLLMResponse.outputTokens || 0,
  };
}

// ============================================================================
// Main Intent Classification Flow
// ============================================================================

/** Parameters for the intent classification flow */
export interface IntentClassificationParams {
  userMessage: string;
  courseStructure: CourseStructure;
  courseLanguage: string | null;
  courseId: string;
  nodeContext?: { stageId: string; nodeId?: string; blockPath?: string };
  convId: string;
  chatType: 'node' | 'global';
  intent: 'refine' | 'regenerate';
  requestId: string;
  supabaseAdmin: SupabaseClient<Database>;
  fallbackConfig: ChatFallbackConfig;
  thresholds: IntentConfidenceThresholds;
}

/**
 * Execute the intent classification flow.
 * Classifies the user message and routes to the appropriate handler.
 * Returns null if the intent cannot be handled (falls back to legacy flow).
 */
export async function executeIntentClassificationFlow(
  params: IntentClassificationParams
): Promise<ChatResponse | null> {
  const {
    userMessage,
    courseStructure,
    courseLanguage,
    courseId,
    nodeContext,
    convId,
    chatType,
    intent,
    requestId,
    supabaseAdmin,
    fallbackConfig,
    thresholds,
  } = params;

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

  const msgParams: IntentRouteMsgParams = {
    convId,
    chatType,
    nodeContext: nodeContext || null,
    intent,
  };

  // Step 2: Handle direct execution intents (DELETE, MOVE) - 0 tokens
  if (
    isDirectExecutionIntent(classifiedIntent.intent) &&
    classifiedIntent.confidence >= thresholds.DIRECT_EXECUTION
  ) {
    return handleDirectExecutionRoute(
      classifiedIntent,
      courseStructure,
      nodeContext?.blockPath,
      supabaseAdmin,
      courseId,
      msgParams
    );
  }

  // Step 3: Handle GET_INFO queries - no LLM needed
  if (
    classifiedIntent.intent === 'GET_INFO' &&
    classifiedIntent.confidence >= thresholds.GET_INFO
  ) {
    return handleInfoQueryRoute(userMessage, courseStructure, supabaseAdmin, courseId, msgParams);
  }

  // Step 4: LLM-required intents with TARGETED context
  if (
    isLLMRequiredIntent(classifiedIntent.intent) &&
    classifiedIntent.confidence >= thresholds.LLM_REQUIRED
  ) {
    return handleLLMRequiredRoute(
      classifiedIntent,
      userMessage,
      courseStructure,
      courseLanguage,
      courseId,
      nodeContext?.blockPath,
      supabaseAdmin,
      fallbackConfig,
      requestId,
      msgParams
    );
  }

  // Fallback: UNKNOWN intent with low confidence - return null to use legacy flow
  logger.info(
    {
      requestId,
      classifiedIntent: classifiedIntent.intent,
      confidence: classifiedIntent.confidence,
    },
    'Chat: Low confidence or UNKNOWN, falling back to legacy flow'
  );

  return null;
}
