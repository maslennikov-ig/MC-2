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
import { TRPCError } from '@trpc/server';
import { JobType } from '@megacampus/shared-types';
import type { JobData } from '@megacampus/shared-types';
import { addJob, removeJobsByCourseId } from '../../../../orchestrator/queue';
import { buildStage5JobInput } from '../_shared/helpers';
import { logger } from '../../../../shared/logger/index.js';
import type { ChatResponse } from '@megacampus/shared-types/chat-types';
import type { CourseStructure, Database } from '@megacampus/shared-types';
import {
  classifyIntent,
  classifyWithHeuristics,
  isDirectExecutionIntent,
  isLLMRequiredIntent,
} from '../../../../shared/intent';
import { isMissingChatPhaseConfigError } from '../../../../shared/llm/model-config-service';
import {
  persistAssistantMessage,
  type ChatFallbackConfig,
  type IntentConfidenceThresholds,
} from './chat-mutation-helpers';
import {
  handleDirectExecutionRoute,
  handleInfoQueryRoute,
  handleLLMRequiredRoute,
  handleStructuralIntentRoute,
  isStructuralIntent,
  type IntentRouteMsgParams,
} from './chat-intent-handlers';

// ============================================================================
// Full Regeneration Handler (shared between explicit intent and classified)
// ============================================================================

/** Parameters for the full regeneration handler */
export interface FullRegenerateParams {
  courseId: string;
  userId: string;
  convId: string;
  chatType: 'node' | 'global';
  nodeContext?: { stageId: string; nodeId?: string; blockPath?: string } | null;
  requestId: string;
  supabaseAdmin: SupabaseClient<Database>;
}

/**
 * Execute a full course regeneration: restart_from_stage + enqueue Stage 5 job.
 * Shared between explicit `intent='regenerate'` and classified FULL_REGENERATE.
 */
export async function executeFullRegenerate(params: FullRegenerateParams): Promise<ChatResponse> {
  const { courseId, userId, convId, chatType, nodeContext, requestId, supabaseAdmin } = params;

  try {
    // Reset course status via RPC
    const { error: rpcError } = await supabaseAdmin.rpc(
      'restart_from_stage' as unknown as never,
      {
        p_course_id: courseId,
        p_stage_number: 5,
        p_user_id: userId,
      } as unknown as never
    );

    if (rpcError) {
      logger.error(
        { requestId, courseId, error: rpcError },
        'FULL_REGENERATE: RPC restart_from_stage failed'
      );
      throw new Error('Failed to reset course status');
    }

    // Clean up existing jobs
    try {
      await removeJobsByCourseId(courseId);
    } catch (cleanupError) {
      logger.warn(
        { requestId, courseId, error: cleanupError },
        'FULL_REGENERATE: Failed to clean up jobs'
      );
    }

    // Build and enqueue Stage 5 job
    const { jobInput } = await buildStage5JobInput(supabaseAdmin, courseId, userId, requestId);
    const job = await addJob(JobType.STRUCTURE_GENERATION, jobInput as unknown as JobData);

    const regenMessage = 'Запускаю полную перегенерацию курса. Это может занять некоторое время.';

    await persistAssistantMessage(supabaseAdmin, {
      courseId,
      convId,
      content: regenMessage,
      chatType,
      nodeContext: nodeContext || null,
      intent: 'regenerate',
      modelUsed: 'system',
      inputTokens: 0,
      outputTokens: 0,
      requestId,
    });

    logger.info({ requestId, courseId, jobId: job.id }, 'Chat: FULL_REGENERATE — job enqueued');

    return {
      conversationId: convId,
      assistantMessage: regenMessage,
      intent: 'regenerate',
      jobId: job.id,
      modelUsed: 'system',
      inputTokens: 0,
      outputTokens: 0,
    };
  } catch (error) {
    logger.error(
      {
        requestId,
        courseId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Chat: FULL_REGENERATE failed'
    );

    const errorMessage = 'Не удалось запустить перегенерацию. Попробуйте ещё раз.';

    await persistAssistantMessage(supabaseAdmin, {
      courseId,
      convId,
      content: errorMessage,
      chatType,
      nodeContext: nodeContext || null,
      intent: 'regenerate',
      modelUsed: 'system',
      inputTokens: 0,
      outputTokens: 0,
      requestId,
    });

    return {
      conversationId: convId,
      assistantMessage: errorMessage,
      intent: 'regenerate',
      modelUsed: 'system',
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

function isFeatureFlagEnabled(flagValue: string | undefined): boolean {
  return flagValue === 'true';
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
  /** User-provided intent. Optional — when omitted, auto-classified by backend. */
  intent?: 'refine' | 'regenerate';
  requestId: string;
  supabaseAdmin: SupabaseClient<Database>;
  /** Authenticated user ID, required for FULL_REGENERATE to enqueue jobs */
  userId: string;
  fallbackConfig: ChatFallbackConfig;
  thresholds: IntentConfidenceThresholds;
  /** Course generation status for Stage 6 CTA */
  generationStatus?: string | null;
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
    requestId,
    supabaseAdmin,
    userId,
    fallbackConfig,
    thresholds,
    generationStatus,
  } = params;

  // Step 1a: Tier 0 — Regex heuristics (0ms, $0, covers ~40-50% of messages)
  const heuristicResult = classifyWithHeuristics(userMessage);

  let classifiedIntent;
  if (heuristicResult) {
    classifiedIntent = heuristicResult;
    logger.info(
      {
        requestId,
        classifiedIntent: classifiedIntent.intent,
        confidence: classifiedIntent.confidence,
        tier: 0,
      },
      'Chat: Intent classified via Tier 0 heuristics'
    );
  } else {
    // Step 1b: Tier 1 — Cheap LLM classification (~200 tokens, ~$0.00005)
    try {
      classifiedIntent = await classifyIntent(
        courseId,
        userMessage,
        nodeContext
          ? {
              stageId: nodeContext.stageId,
              path: nodeContext.blockPath,
              elementType: nodeContext.nodeId?.includes('lesson') ? 'lesson' : 'section',
            }
          : undefined
      );
    } catch (classifyError) {
      // Plan requirement: chat phase misconfig → explicit 503 (not masked as 500)
      if (isMissingChatPhaseConfigError(classifyError)) {
        throw new TRPCError({
          code: 'SERVICE_UNAVAILABLE',
          message: classifyError.message,
          cause: classifyError,
        });
      }
      throw classifyError;
    }

    logger.info(
      {
        requestId,
        classifiedIntent: classifiedIntent.intent,
        confidence: classifiedIntent.confidence,
        target: classifiedIntent.target,
        tier: 1,
      },
      'Chat: Intent classified via Tier 1 LLM'
    );
  }

  // Derive response intent from classification
  const responseIntent: 'refine' | 'regenerate' =
    classifiedIntent.intent === 'FULL_REGENERATE' ? 'regenerate' : 'refine';

  const msgParams: IntentRouteMsgParams = {
    convId,
    chatType,
    nodeContext: nodeContext || null,
    responseIntent,
  };

  // Step 2: FULL_REGENERATE → enqueue async regeneration job
  if (classifiedIntent.intent === 'FULL_REGENERATE') {
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

  // Step 3: Handle direct execution intents (DELETE, MOVE) - 0 tokens
  // Gated by CHAT_STRUCTURAL_PROPOSALS_ENABLED for phased rollout
  const structuralProposalsEnabled = isFeatureFlagEnabled(
    process.env.CHAT_STRUCTURAL_PROPOSALS_ENABLED
  );

  if (
    structuralProposalsEnabled &&
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

  // Step 4: Handle GET_INFO queries - no LLM needed
  if (
    classifiedIntent.intent === 'GET_INFO' &&
    classifiedIntent.confidence >= thresholds.GET_INFO
  ) {
    return handleInfoQueryRoute(userMessage, courseStructure, supabaseAdmin, courseId, msgParams);
  }

  // Step 5: Clarification for ambiguous intent.
  // Plan requirement (plan:208): confidence < 0.6 => clarification response.
  // Also clarify UNKNOWN intent instead of falling back to legacy flow.
  const needsClarification =
    classifiedIntent.intent === 'UNKNOWN' || classifiedIntent.confidence < thresholds.CLARIFICATION;

  if (needsClarification) {
    logger.info(
      {
        requestId,
        classifiedIntent: classifiedIntent.intent,
        confidence: classifiedIntent.confidence,
        threshold: thresholds.CLARIFICATION,
        reason: classifiedIntent.intent === 'UNKNOWN' ? 'unknown_intent' : 'low_confidence_intent',
      },
      'Chat: Returning clarification instead of legacy/LLM routing'
    );

    const clarificationMessage =
      'Не совсем понял ваш запрос. Уточните, пожалуйста, что именно вы хотите сделать: ' +
      'изменить структуру курса, переписать содержимое, добавить/удалить элемент или что-то другое?';

    await supabaseAdmin.from('course_chat_messages').insert({
      course_id: courseId,
      conversation_id: convId,
      role: 'assistant',
      content: clarificationMessage,
      chat_type: chatType,
      node_context: nodeContext || null,
      intent: 'refine',
      model_used: 'intent_classifier',
      input_tokens: 200,
      output_tokens: 30,
    });

    return {
      conversationId: convId,
      assistantMessage: clarificationMessage,
      intent: 'refine' as const,
      modelUsed: 'intent_classifier',
      inputTokens: 200,
      outputTokens: 30,
      metadata: { clarificationType: 'ambiguous_intent' as const },
    };
  }

  // Step 6: Structural intents (ADD_LESSON, ADD_SECTION) - LLM with ID remapping
  // Also gated by CHAT_STRUCTURAL_PROPOSALS_ENABLED
  if (
    structuralProposalsEnabled &&
    isStructuralIntent(classifiedIntent.intent) &&
    classifiedIntent.confidence >= thresholds.LLM_REQUIRED
  ) {
    return handleStructuralIntentRoute(
      classifiedIntent,
      userMessage,
      courseStructure,
      courseLanguage,
      courseId,
      supabaseAdmin,
      fallbackConfig,
      requestId,
      msgParams,
      generationStatus
    );
  }

  // Step 7: Other LLM-required intents with TARGETED context
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

  // Fallback: unhandled classification path - use legacy flow
  logger.info(
    {
      requestId,
      classifiedIntent: classifiedIntent.intent,
      confidence: classifiedIntent.confidence,
    },
    'Chat: Unhandled classification route, falling back to legacy flow'
  );

  return null;
}
