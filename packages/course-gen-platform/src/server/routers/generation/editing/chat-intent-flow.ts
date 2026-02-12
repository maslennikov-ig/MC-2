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
import { JobType } from '@megacampus/shared-types';
import type { JobData } from '@megacampus/shared-types';
import { addJob, removeJobsByCourseId } from '../../../../orchestrator/queue';
import { buildStage5JobInput } from '../_shared/helpers';
import { logger } from '../../../../shared/logger/index.js';
import type {
  ChatResponse,
  StructuralOperationProposal,
} from '@megacampus/shared-types/chat-types';
import type { CourseStructure, Database } from '@megacampus/shared-types';
import { CHAT_PRIMARY_MODEL_ID, CHAT_FALLBACK_MODEL_ID } from '@megacampus/shared-types';
import { courseOperationSchema } from '@megacampus/shared-types/course-operations';
import { z } from 'zod';
import {
  classifyIntent,
  classifyWithHeuristics,
  isDirectExecutionIntent,
  isLLMRequiredIntent,
} from '../../../../shared/intent';
import { llmClient } from '../../../../shared/llm/client';
import { createModelConfigService } from '../../../../shared/llm/model-config-service';
import {
  handleDirectIntent,
  handleInfoQuery,
  buildTargetedRefinementPrompt,
  buildCourseSkeleton,
  parseProposalFromLLMResponse,
  resolveTargetedContext,
} from './chat-helpers';
import {
  persistAssistantMessage,
  type ChatFallbackConfig,
  type IntentConfidenceThresholds,
} from './chat-mutation-helpers';
import {
  buildIdRemapContext,
  remapStructureToSimplified,
  remapOperationsToReal,
} from './surgical-id-remap';
import { validateOperations } from './surgical-operations';

// ============================================================================
// Types
// ============================================================================

/** Common message parameters for all intent routes */
interface IntentRouteMsgParams {
  convId: string;
  chatType: 'node' | 'global';
  nodeContext?: { stageId: string; nodeId?: string; blockPath?: string } | null;
  /** Derived response intent based on classification result */
  responseIntent: 'refine' | 'regenerate';
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
    intent: params.responseIntent,
    model_used: 'intent_classifier',
    input_tokens: 200, // Approximate classification tokens
    output_tokens: 50,
  });

  return {
    conversationId: params.convId,
    assistantMessage: directResult.message,
    intent: params.responseIntent,
    proposal: directResult.proposal,
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
    intent: params.responseIntent,
    model_used: 'info_query',
    input_tokens: 0,
    output_tokens: 0,
  });

  return {
    conversationId: params.convId,
    assistantMessage: infoResult.message,
    intent: params.responseIntent,
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
  const { targetedContext, allowedFieldsForTarget, targetPath, courseSkeleton } =
    resolveTargetedContext({
      classifiedIntent,
      courseStructure,
      nodeContextBlockPath,
    });

  // Build targeted prompt with skeleton context
  const targetedSystemPrompt = buildTargetedRefinementPrompt(
    classifiedIntent.intent,
    targetedContext,
    allowedFieldsForTarget,
    targetPath,
    courseSkeleton
  );

  // Stage-aware model selection: stage_6 → chat_stage_6_refinement, else → chat_stage_5_refinement
  const phaseKey =
    params.nodeContext?.stageId === 'stage_6'
      ? 'chat_stage_6_refinement'
      : 'chat_stage_5_refinement';
  const modelConfigService = createModelConfigService();
  let targetedModelId = CHAT_PRIMARY_MODEL_ID; // Hardcoded fallback primary
  let targetedFallbackModelId = CHAT_FALLBACK_MODEL_ID; // Hardcoded fallback secondary
  let targetedTemperature = fallbackConfig.temperature;
  const targetedMaxTokens = 2048; // Much smaller for targeted response

  try {
    const config = await modelConfigService.getModelForPhase(
      phaseKey,
      courseId,
      undefined,
      (courseLanguage as 'ru' | 'en') || 'ru'
    );
    targetedModelId = config.modelId || targetedModelId;
    targetedFallbackModelId = config.fallbackModelId || targetedFallbackModelId;
    targetedTemperature = config.temperature;

    logger.debug(
      {
        requestId,
        courseId,
        modelId: targetedModelId,
        fallbackModelId: targetedFallbackModelId,
        source: config.source,
      },
      'Resolved model config for intent flow from database'
    );
  } catch (configError) {
    logger.warn(
      {
        requestId,
        courseId,
        error: configError,
        fallbackPrimary: targetedModelId,
        fallbackSecondary: targetedFallbackModelId,
      },
      'Failed to get model config for intent flow, using hardcoded fallback'
    );
  }

  let modelUsed = targetedModelId;
  let targetedLLMResponse;

  // Try primary model (from DB or hardcoded fallback)
  try {
    targetedLLMResponse = await llmClient.generateChatCompletion(
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
  } catch (primaryError) {
    logger.warn(
      {
        requestId,
        courseId,
        primaryModel: targetedModelId,
        error: primaryError instanceof Error ? primaryError.message : String(primaryError),
      },
      'Primary model failed in intent flow, trying fallback'
    );

    // Try fallback model
    try {
      modelUsed = targetedFallbackModelId;
      targetedLLMResponse = await llmClient.generateChatCompletion(
        [
          { role: 'system', content: targetedSystemPrompt },
          { role: 'user', content: userMessage },
        ],
        {
          model: targetedFallbackModelId,
          temperature: targetedTemperature,
          maxTokens: targetedMaxTokens,
        }
      );
    } catch (fallbackError) {
      logger.error(
        {
          requestId,
          courseId,
          primaryModel: targetedModelId,
          fallbackModel: targetedFallbackModelId,
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        },
        'Both primary and fallback models failed in intent flow'
      );
      throw fallbackError;
    }
  }

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
    logger.warn(
      {
        requestId,
        courseId,
        intent: classifiedIntent.intent,
        llmContentPreview: targetedLLMResponse.content?.slice(0, 200),
      },
      'Chat: Empty LLM response after all fallbacks, using hardcoded message'
    );
    targetedMessage = 'Предложены изменения. Проверьте детали ниже.';
  }

  await persistAssistantMessage(supabaseAdmin, {
    courseId,
    convId: params.convId,
    content: targetedMessage,
    chatType: params.chatType,
    nodeContext: params.nodeContext,
    intent: params.responseIntent,
    modelUsed,
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
      modelUsed,
      inputTokens: targetedLLMResponse.inputTokens,
      outputTokens: targetedLLMResponse.outputTokens,
      hasProposal: !!targetedProposal,
    },
    'Chat: Targeted response generated'
  );

  return {
    conversationId: params.convId,
    assistantMessage: targetedMessage,
    intent: params.responseIntent,
    proposal: targetedProposal || undefined,
    modelUsed,
    inputTokens: targetedLLMResponse.inputTokens || 0,
    outputTokens: targetedLLMResponse.outputTokens || 0,
  };
}

// ============================================================================
// Structural Intent Detection
// ============================================================================

/** Intents that produce structural_operation proposals */
const STRUCTURAL_INTENTS = ['ADD_LESSON', 'ADD_SECTION'] as const;

function isStructuralIntent(intent: string): boolean {
  return (STRUCTURAL_INTENTS as readonly string[]).includes(intent);
}

// ============================================================================
// Structural Intent Handler (ADD_LESSON, ADD_SECTION)
// ============================================================================

/**
 * Handle structural intents (ADD_LESSON, ADD_SECTION) via LLM with ID remapping.
 * Returns a structural_operation proposal with CourseOperation[] batch.
 */
async function handleStructuralIntentRoute(
  classifiedIntent: Awaited<ReturnType<typeof classifyIntent>>,
  userMessage: string,
  courseStructure: CourseStructure,
  courseLanguage: string | null,
  courseId: string,
  supabaseAdmin: SupabaseClient<Database>,
  fallbackConfig: ChatFallbackConfig,
  requestId: string,
  params: IntentRouteMsgParams,
  generationStatus?: string | null
): Promise<ChatResponse> {
  // Build ID remap context for LLM-friendly IDs
  const remapCtx = buildIdRemapContext(courseStructure);
  const simplifiedStructure = remapStructureToSimplified(courseStructure, remapCtx);

  // Build compact skeleton with simplified IDs
  const structureSummary = buildCourseSkeleton(simplifiedStructure);

  const isAddLesson = classifiedIntent.intent === 'ADD_LESSON';
  const operationType = isAddLesson ? 'add_lesson' : 'add_section';

  const systemPrompt = `You are a course structure editor. The user wants to ${isAddLesson ? 'add a lesson' : 'add a section'} to their course.

Course: "${simplifiedStructure.course_title}"
Structure:
${structureSummary}

Respond with a JSON object containing:
- "operations": array with one ${operationType} operation
- "summary": human-readable summary in ${courseLanguage === 'en' ? 'English' : 'Russian'}

${
  isAddLesson
    ? `Operation format:
{
  "type": "add_lesson",
  "reasoning": "why this lesson",
  "tempId": "__new_1__",
  "parentSectionId": "sec_N",
  "afterLessonId": "lsn_N" or null,
  "title": "lesson title",
  "objectives": ["objective 1", "objective 2"],
  "keyTopics": ["topic 1", "topic 2"]
}`
    : `Operation format:
{
  "type": "add_section",
  "reasoning": "why this section",
  "tempId": "__new_1__",
  "afterSectionId": "sec_N" or null,
  "title": "section title",
  "description": "section description"
}`
}

Use the simplified IDs (sec_1, lsn_1, etc.) from the structure above.
Respond ONLY with valid JSON, no markdown fences.`;

  // Stage-aware model selection
  const phaseKey =
    params.nodeContext?.stageId === 'stage_6'
      ? 'chat_stage_6_refinement'
      : 'chat_stage_5_refinement';
  const modelConfigService = createModelConfigService();
  let modelId = CHAT_PRIMARY_MODEL_ID;
  let fallbackModelId = CHAT_FALLBACK_MODEL_ID;
  let temperature = fallbackConfig.temperature;

  try {
    const config = await modelConfigService.getModelForPhase(
      phaseKey,
      courseId,
      undefined,
      (courseLanguage as 'ru' | 'en') || 'ru'
    );
    modelId = config.modelId || modelId;
    fallbackModelId = config.fallbackModelId || fallbackModelId;
    temperature = config.temperature;
  } catch {
    logger.warn({ requestId, courseId }, 'Failed to get model config for structural intent');
  }

  // Call LLM with primary/fallback
  let modelUsed = modelId;
  let llmResponse;

  try {
    llmResponse = await llmClient.generateChatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      { model: modelId, temperature, maxTokens: 2048 }
    );
  } catch {
    modelUsed = fallbackModelId;
    llmResponse = await llmClient.generateChatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      { model: fallbackModelId, temperature, maxTokens: 2048 }
    );
  }

  // Parse LLM response into operations
  let proposal: StructuralOperationProposal | undefined;
  let assistantMessage: string;

  try {
    // Strip markdown fences if present
    const raw = llmResponse.content
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();
    const parsed = JSON.parse(raw) as { operations?: unknown[]; summary?: string };

    const operationsResult = z.array(courseOperationSchema).safeParse(parsed.operations);
    if (!operationsResult.success) {
      throw new Error(`Invalid operations: ${operationsResult.error.message}`);
    }

    // Remap simplified IDs back to real
    const realOperations = remapOperationsToReal(operationsResult.data, remapCtx);

    // Pre-flight validation
    const errors = validateOperations(realOperations, courseStructure);
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.map(e => e.message).join('; ')}`);
    }

    proposal = {
      type: 'structural_operation' as const,
      operations: realOperations,
      summary: parsed.summary || `Добавление ${isAddLesson ? 'урока' : 'секции'}`,
    };

    assistantMessage = proposal.summary;

    // Stage 6 CTA: hint that content generation is available for new lessons
    const stage6ReadyStatuses = ['stage_6_complete', 'finalizing', 'completed'];
    const isStage6Ready = generationStatus && stage6ReadyStatuses.includes(generationStatus);
    const hasAddLessonOp = realOperations.some(op => op.type === 'add_lesson');

    if (isStage6Ready && hasAddLessonOp) {
      assistantMessage +=
        '\n\n\u{1F4A1} Контент курса уже сгенерирован. После применения изменений вы сможете сгенерировать контент для новых уроков.';
    }
  } catch (parseError) {
    logger.warn(
      {
        requestId,
        courseId,
        error: parseError instanceof Error ? parseError.message : String(parseError),
        llmPreview: llmResponse.content.slice(0, 300),
      },
      'Chat: Failed to parse structural operation from LLM, returning text response'
    );
    // Fallback: return LLM text without proposal
    assistantMessage =
      llmResponse.content || 'Не удалось создать операцию. Попробуйте уточнить запрос.';
  }

  await persistAssistantMessage(supabaseAdmin, {
    courseId,
    convId: params.convId,
    content: assistantMessage,
    chatType: params.chatType,
    nodeContext: params.nodeContext,
    intent: params.responseIntent,
    modelUsed,
    inputTokens: llmResponse.inputTokens,
    outputTokens: llmResponse.outputTokens,
    requestId,
  });

  logger.info(
    {
      requestId,
      courseId,
      intent: classifiedIntent.intent,
      modelUsed,
      hasProposal: !!proposal,
      operationCount: proposal?.operations?.length ?? 0,
    },
    'Chat: Structural intent response generated'
  );

  return {
    conversationId: params.convId,
    assistantMessage,
    intent: params.responseIntent,
    proposal: proposal || undefined,
    modelUsed,
    inputTokens: llmResponse.inputTokens || 0,
    outputTokens: llmResponse.outputTokens || 0,
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
    classifiedIntent = await classifyIntent(
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
        modelUsed: 'heuristic_classifier',
        inputTokens: 0,
        outputTokens: 0,
        requestId,
      });

      logger.info(
        { requestId, courseId, jobId: job.id, confidence: classifiedIntent.confidence },
        'Chat: FULL_REGENERATE — job enqueued'
      );

      return {
        conversationId: convId,
        assistantMessage: regenMessage,
        intent: 'regenerate',
        jobId: job.id,
        modelUsed: 'heuristic_classifier',
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
        modelUsed: 'heuristic_classifier',
        inputTokens: 0,
        outputTokens: 0,
        requestId,
      });

      return {
        conversationId: convId,
        assistantMessage: errorMessage,
        intent: 'regenerate',
        modelUsed: 'heuristic_classifier',
        inputTokens: 0,
        outputTokens: 0,
      };
    }
  }

  // Step 3: Handle direct execution intents (DELETE, MOVE) - 0 tokens
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

  // Step 4: Handle GET_INFO queries - no LLM needed
  if (
    classifiedIntent.intent === 'GET_INFO' &&
    classifiedIntent.confidence >= thresholds.GET_INFO
  ) {
    return handleInfoQueryRoute(userMessage, courseStructure, supabaseAdmin, courseId, msgParams);
  }

  // Step 5: Structural intents (ADD_LESSON, ADD_SECTION) - LLM with ID remapping
  if (
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

  // Step 6: Other LLM-required intents with TARGETED context
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
