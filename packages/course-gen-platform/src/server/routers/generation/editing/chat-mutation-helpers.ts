/**
 * Chat Mutation Phase Helpers
 * @module server/routers/generation/editing/chat-mutation-helpers
 *
 * Helper functions for the chat mutation phases, extracted from chat.router.ts
 * to reduce file size and cyclomatic complexity. Each function handles a
 * distinct phase of the chat mutation flow:
 * - Input validation and auth checks
 * - Course/context loading
 * - Legacy LLM flow execution
 * - Message persistence
 *
 * Intent classification routing is handled separately in chat-intent-flow.ts.
 */

import { TRPCError } from '@trpc/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../../../../shared/logger/index.js';
import {
  PAUSABLE_STATUSES,
  CHAT_PRIMARY_MODEL_ID,
  CHAT_FALLBACK_MODEL_ID,
  CHAT_STAGE6_PRIMARY_MODEL_ID,
  CHAT_STAGE6_FALLBACK_MODEL_ID,
} from '@megacampus/shared-types';
import type { ChatResponse, Proposal } from '@megacampus/shared-types/chat-types';
import type { Database } from '@megacampus/shared-types';
import { llmClient } from '../../../../shared/llm/client';
import { createModelConfigService } from '../../../../shared/llm/model-config-service';
import { parseProposalFromLLMResponse } from './chat-helpers';
import {
  buildLegacySystemPrompt,
  buildLLMMessages,
  resolveProposalContext,
  type ProposalContext,
} from './chat-legacy-prompt-helpers';

/**
 * Fallback chat model configuration per stage (used when ModelConfigService unavailable)
 * These serve as the ultimate fallback when database is down or phase config is missing.
 */
const CHAT_STAGE_FALLBACK_MODELS: Record<string, { primary: string; fallback: string }> = {
  stage_5: {
    primary: CHAT_PRIMARY_MODEL_ID,
    fallback: CHAT_FALLBACK_MODEL_ID,
  },
  stage_6: {
    primary: CHAT_STAGE6_PRIMARY_MODEL_ID,
    fallback: CHAT_STAGE6_FALLBACK_MODEL_ID,
  },
};

const DEFAULT_CHAT_FALLBACK_MODELS = {
  primary: CHAT_PRIMARY_MODEL_ID,
  fallback: CHAT_FALLBACK_MODEL_ID,
};

// ============================================================================
// Types
// ============================================================================

/** Fallback configuration for LLM when ModelConfigService is unavailable */
export interface ChatFallbackConfig {
  modelId: string;
  temperature: number;
  maxTokens: number;
}

/** Intent classification confidence thresholds */
export interface IntentConfidenceThresholds {
  DIRECT_EXECUTION: number;
  GET_INFO: number;
  LLM_REQUIRED: number;
  /** Below this threshold → clarification response (plan:208) */
  CLARIFICATION: number;
}

// ============================================================================
// Course Loading and Validation
// ============================================================================

/**
 * Validate conversation belongs to the specified course.
 * Returns silently if valid or no conversation exists yet.
 */
export async function validateConversationOwnership(
  supabaseAdmin: SupabaseClient<Database>,
  conversationId: string | undefined,
  courseId: string
): Promise<void> {
  if (!conversationId) return;

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

/**
 * Check if generation is currently active and block chat if so.
 * Uses PAUSABLE_STATUSES from shared-types as Single Source of Truth.
 */
export function assertGenerationNotActive(
  generationStatus: string | null,
  requestId: string,
  courseId: string
): void {
  const status = generationStatus || '';
  const isGenerationActive = (PAUSABLE_STATUSES as readonly string[]).includes(status);

  if (isGenerationActive) {
    logger.info(
      { requestId, courseId, generationStatus: status },
      'Chat blocked: generation is active'
    );
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        'Chat is unavailable during active generation. Please wait for the current stage to complete.',
    });
  }
}

/**
 * Fetch conversation history from database.
 * Returns last 10 messages for context window management.
 */
export async function fetchConversationHistory(
  supabaseAdmin: SupabaseClient<Database>,
  convId: string,
  requestId: string,
  courseId: string
): Promise<Array<{ role: string; content: string }> | null> {
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

  return history;
}

// ============================================================================
// Message Persistence
// ============================================================================

/**
 * Save user message to conversation history.
 * Non-blocking: logs warnings but continues on failure.
 */
export async function persistUserMessage(
  supabaseAdmin: SupabaseClient<Database>,
  params: {
    courseId: string;
    convId: string;
    userMessage: string;
    chatType: 'node' | 'global';
    nodeContext?: { stageId: string; nodeId?: string; blockPath?: string } | null;
    intent?: 'refine' | 'regenerate';
    requestId: string;
  }
): Promise<void> {
  const { error: insertUserMsgError } = await supabaseAdmin.from('course_chat_messages').insert({
    course_id: params.courseId,
    conversation_id: params.convId,
    role: 'user',
    content: params.userMessage,
    chat_type: params.chatType,
    node_context: params.nodeContext || null,
    intent: params.intent,
  });

  if (insertUserMsgError) {
    logger.warn(
      { requestId: params.requestId, courseId: params.courseId, error: insertUserMsgError },
      'Failed to save user message (non-blocking)'
    );
  }
}

/**
 * Save assistant message to conversation history.
 * Non-blocking: logs warnings but continues on failure.
 */
export async function persistAssistantMessage(
  supabaseAdmin: SupabaseClient<Database>,
  params: {
    courseId: string;
    convId: string;
    content: string;
    chatType: 'node' | 'global';
    nodeContext?: { stageId: string; nodeId?: string; blockPath?: string } | null;
    intent?: 'refine' | 'regenerate';
    modelUsed: string;
    inputTokens?: number;
    outputTokens?: number;
    requestId: string;
  }
): Promise<void> {
  const { error: insertAssistantMsgError } = await supabaseAdmin
    .from('course_chat_messages')
    .insert({
      course_id: params.courseId,
      conversation_id: params.convId,
      role: 'assistant',
      content: params.content,
      chat_type: params.chatType,
      node_context: params.nodeContext || null,
      intent: params.intent,
      model_used: params.modelUsed,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
    });

  if (insertAssistantMsgError) {
    logger.warn(
      { requestId: params.requestId, courseId: params.courseId, error: insertAssistantMsgError },
      'Failed to save assistant message (non-blocking)'
    );
  }
}

// ============================================================================
// Legacy LLM Flow
// ============================================================================

/** Parameters for the legacy LLM flow */
export interface LegacyLLMFlowParams {
  courseId: string;
  course: {
    title: string | null;
    language: string | null;
    style: string | null;
    analysis_result: unknown;
    course_structure: unknown;
  };
  userMessage: string;
  chatType: 'node' | 'global';
  nodeContext?: { stageId: string; nodeId?: string; blockPath?: string };
  previousOutput?: string;
  /** User-provided intent. Optional — when omitted, auto-classified by backend. */
  intent?: 'refine' | 'regenerate';
  convId: string;
  history: Array<{ role: string; content: string }> | null;
  requestId: string;
  supabaseAdmin: SupabaseClient<Database>;
  fallbackConfig: ChatFallbackConfig;
}

/** Resolved model configuration for LLM call */
interface ResolvedModelConfig {
  modelId: string;
  fallbackModelId: string;
  temperature: number;
  maxTokens: number;
  phaseName: string;
}

/**
 * Resolve the model configuration for the chat LLM call.
 * Tries ModelConfigService first, falls back to hardcoded constants.
 *
 * Phase name mapping:
 * - chatType='node' + stageId='stage_5' → 'chat_stage_5_refinement'
 * - chatType='node' + stageId='stage_6' → 'chat_stage_6_refinement'
 * - chatType='node' + other stages → 'chat_node_refinement'
 * - chatType='global' → 'chat_global_guidance'
 *
 * @param chatType - Whether this is node-level or global chat
 * @param stageId - Optional stage ID (e.g., 'stage_5', 'stage_6')
 * @param courseId - Course ID for course-specific overrides
 * @param courseLanguage - Course language for language-specific configs
 * @param fallbackConfig - Ultimate fallback config (from hardcoded constants)
 * @param requestId - Request ID for logging
 * @returns Resolved model configuration with primary and fallback models
 */
async function resolveModelConfig(
  chatType: 'node' | 'global',
  stageId: string | undefined,
  courseId: string,
  courseLanguage: string | null,
  fallbackConfig: ChatFallbackConfig,
  requestId: string
): Promise<ResolvedModelConfig> {
  // Determine phase name based on chatType and stageId
  let phaseName: string;
  if (chatType === 'node') {
    if (stageId === 'stage_5') {
      phaseName = 'chat_stage_5_refinement';
    } else if (stageId === 'stage_6') {
      phaseName = 'chat_stage_6_refinement';
    } else {
      phaseName = 'chat_node_refinement';
    }
  } else {
    phaseName = 'chat_global_guidance';
  }

  const modelConfigService = createModelConfigService();

  try {
    const config = await modelConfigService.getModelForPhase(
      phaseName,
      courseId,
      undefined,
      (courseLanguage as 'ru' | 'en') || 'ru'
    );

    // Extract fallback model from DB config, or use hardcoded fallback
    const fallbackModelFromDb = config.fallbackModelId || fallbackConfig.modelId;

    logger.debug(
      {
        requestId,
        phaseName,
        stageId,
        chatType,
        modelId: config.modelId,
        fallbackModelId: fallbackModelFromDb,
        source: config.source,
      },
      'Resolved model config from database'
    );

    return {
      modelId: config.modelId,
      fallbackModelId: fallbackModelFromDb,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      phaseName,
    };
  } catch (configError) {
    // Distinguish missing config (permanent) from transient errors (DB down)
    const errMsg = configError instanceof Error ? configError.message : '';
    const isMissingConfig = errMsg.includes('has no config') || errMsg.includes('no active config');

    if (isMissingConfig) {
      // Plan requirement: chat phases must fail-fast (503) when config is missing
      logger.error(
        { requestId, phaseName, stageId, chatType, error: configError },
        'Chat phase model config missing — returning 503 per plan requirement'
      );
      throw new TRPCError({
        code: 'SERVICE_UNAVAILABLE',
        message: `Model configuration unavailable for chat phase "${phaseName}". Please try again later.`,
      });
    }

    // Transient error (DB down, timeout) — fall back to stage-specific hardcoded models
    const hardcoded = CHAT_STAGE_FALLBACK_MODELS[stageId || ''] || DEFAULT_CHAT_FALLBACK_MODELS;
    logger.warn(
      { requestId, phaseName, stageId, chatType, error: configError },
      'Failed to get model config from database, using hardcoded fallback'
    );

    return {
      modelId: hardcoded.primary,
      fallbackModelId: hardcoded.fallback,
      temperature: fallbackConfig.temperature ?? 0.7,
      maxTokens: fallbackConfig.maxTokens ?? 2000,
      phaseName,
    };
  }
}

/**
 * Parse proposal from LLM response and build the final chat response.
 */
function buildChatResponseWithProposal(
  llmContent: string,
  proposalCtx: ProposalContext,
  requestId: string,
  courseId: string
): { assistantMessage: string; proposal: Proposal | undefined } {
  if (!proposalCtx.shouldGenerateProposal || !proposalCtx.stageId) {
    return { assistantMessage: llmContent, proposal: undefined };
  }

  const parsedProposal = parseProposalFromLLMResponse(
    llmContent,
    proposalCtx.stageId,
    proposalCtx.allowedFields,
    requestId
  );

  if (parsedProposal) {
    logger.info(
      {
        requestId,
        courseId,
        proposalType: parsedProposal.type,
        updateCount: parsedProposal.updates.length,
      },
      'Chat: Proposal generated'
    );

    // Ensure assistantMessage is always human-readable, never raw JSON
    let assistantMessage = parsedProposal.summary;
    if (!assistantMessage?.trim()) {
      // Auto-generate from update descriptions
      assistantMessage = parsedProposal.updates
        .map(u => u.description)
        .filter(Boolean)
        .join('; ');
    }
    if (!assistantMessage?.trim()) {
      logger.warn(
        { requestId, courseId, proposalType: parsedProposal.type },
        'Chat: Empty proposal summary after all fallbacks, using hardcoded message'
      );
      assistantMessage = 'Предложены изменения. Проверьте детали ниже.';
    }

    return {
      assistantMessage,
      proposal: parsedProposal,
    };
  }

  logger.info(
    { requestId, courseId },
    'Chat: No valid proposal extracted, returning text response'
  );
  return {
    assistantMessage: llmContent?.trim() || 'Не удалось получить ответ. Попробуйте ещё раз.',
    proposal: undefined,
  };
}

/**
 * Execute the legacy LLM flow (non-intent-classified).
 * Builds prompts, calls LLM, parses proposals, and persists messages.
 */
export async function executeLegacyLLMFlow(params: LegacyLLMFlowParams): Promise<ChatResponse> {
  const {
    courseId,
    course,
    userMessage,
    chatType,
    nodeContext,
    intent,
    convId,
    history,
    requestId,
    supabaseAdmin,
    fallbackConfig,
  } = params;

  // Resolve model config with stage-specific phase names
  const stageId = nodeContext?.stageId || '';
  const modelConfig = await resolveModelConfig(
    chatType,
    stageId,
    courseId,
    course.language,
    fallbackConfig,
    requestId
  );

  // Resolve proposal context
  const proposalCtx = resolveProposalContext(params);

  // Build system prompt and messages
  const systemPrompt = buildLegacySystemPrompt(params, proposalCtx);
  const messages = buildLLMMessages(systemPrompt, history, userMessage);

  // Get hardcoded fallback models in case DB models fail
  const hardcodedFallback = CHAT_STAGE_FALLBACK_MODELS[stageId] || DEFAULT_CHAT_FALLBACK_MODELS;
  let modelUsed = modelConfig.modelId;

  // Generate LLM response with primary model (from DB or fallback config)
  let llmResponse;
  try {
    llmResponse = await llmClient.generateChatCompletion(messages, {
      model: modelConfig.modelId,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens,
    });
  } catch (primaryError) {
    logger.warn(
      {
        requestId,
        courseId,
        stageId,
        phaseName: modelConfig.phaseName,
        primaryModel: modelConfig.modelId,
        error: primaryError instanceof Error ? primaryError.message : String(primaryError),
      },
      'Primary model failed, trying fallback from DB config'
    );

    // Try fallback model from DB config first
    try {
      modelUsed = modelConfig.fallbackModelId;
      llmResponse = await llmClient.generateChatCompletion(messages, {
        model: modelConfig.fallbackModelId,
        temperature: modelConfig.temperature,
        maxTokens: modelConfig.maxTokens,
      });
    } catch (dbFallbackError) {
      logger.warn(
        {
          requestId,
          courseId,
          stageId,
          phaseName: modelConfig.phaseName,
          dbFallbackModel: modelConfig.fallbackModelId,
          error:
            dbFallbackError instanceof Error ? dbFallbackError.message : String(dbFallbackError),
        },
        'DB fallback model failed, trying hardcoded fallback'
      );

      // Last resort: hardcoded fallback models
      try {
        modelUsed = hardcodedFallback.fallback;
        llmResponse = await llmClient.generateChatCompletion(messages, {
          model: hardcodedFallback.fallback,
          temperature: modelConfig.temperature,
          maxTokens: modelConfig.maxTokens,
        });
      } catch (hardcodedFallbackError) {
        logger.error(
          {
            requestId,
            courseId,
            stageId,
            phaseName: modelConfig.phaseName,
            primaryModel: modelConfig.modelId,
            dbFallbackModel: modelConfig.fallbackModelId,
            hardcodedFallback: hardcodedFallback.fallback,
            error:
              hardcodedFallbackError instanceof Error
                ? hardcodedFallbackError.message
                : String(hardcodedFallbackError),
          },
          'All models failed in chat (primary, DB fallback, hardcoded fallback)'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate response. Please try again.',
        });
      }
    }
  }

  // Save assistant message
  await persistAssistantMessage(supabaseAdmin, {
    courseId,
    convId,
    content: llmResponse.content,
    chatType,
    nodeContext: nodeContext || null,
    intent,
    modelUsed,
    inputTokens: llmResponse.inputTokens,
    outputTokens: llmResponse.outputTokens,
    requestId,
  });

  // Parse proposal and build response
  const { assistantMessage, proposal } = buildChatResponseWithProposal(
    llmResponse.content,
    proposalCtx,
    requestId,
    courseId
  );

  logger.info(
    {
      requestId,
      courseId,
      intent,
      modelUsed,
      inputTokens: llmResponse.inputTokens,
      outputTokens: llmResponse.outputTokens,
      hasProposal: !!proposal,
    },
    'Chat: Response generated'
  );

  // Derive response intent: explicit 'regenerate' stays, otherwise 'refine'
  const responseIntent = intent === 'regenerate' ? 'regenerate' : 'refine';

  return {
    conversationId: convId,
    assistantMessage,
    intent: responseIntent,
    proposal,
    modelUsed,
    inputTokens: llmResponse.inputTokens || 0,
    outputTokens: llmResponse.outputTokens || 0,
  };
}
