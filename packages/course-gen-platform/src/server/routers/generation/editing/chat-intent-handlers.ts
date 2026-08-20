/**
 * Chat Intent Route Handlers
 * @module server/routers/generation/editing/chat-intent-handlers
 *
 * Route handler implementations for classified chat intents.
 * Extracted from chat-intent-flow.ts to comply with max-lines rule.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type {
  ChatResponse,
  StructuralOperationProposal,
} from '@megacampus/shared-types/chat-types';
import type { CourseStructure, Database } from '@megacampus/shared-types';
import { CHAT_PRIMARY_MODEL_ID, CHAT_FALLBACK_MODEL_ID } from '@megacampus/shared-types';
import { courseOperationSchema } from '@megacampus/shared-types/course-operations';
import type { classifyIntent } from '../../../../shared/intent';
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
import { persistAssistantMessage, type ChatFallbackConfig } from './chat-mutation-helpers';
import {
  buildIdRemapContext,
  remapStructureToSimplified,
  remapOperationsToReal,
} from './surgical-id-remap';
import { validateOperations } from './surgical-operations';
import { logger } from '../../../../shared/logger/index.js';

// ============================================================================
// Types
// ============================================================================

/** Common message parameters for all intent routes */
export interface IntentRouteMsgParams {
  convId: string;
  chatType: 'node' | 'global';
  nodeContext?: { stageId: string; nodeId?: string; blockPath?: string } | null;
  /** Derived response intent based on classification result */
  responseIntent: 'refine' | 'regenerate';
}

// ============================================================================
// Direct Execution Handler
// ============================================================================

/**
 * Handle direct execution intents (DELETE, MOVE) within the intent classification flow.
 * Returns ChatResponse for direct intents with high confidence.
 */
export async function handleDirectExecutionRoute(
  classifiedIntent: Awaited<ReturnType<typeof classifyIntent>>,
  courseStructure: CourseStructure,
  nodeContextBlockPath: string | undefined,
  supabaseAdmin: SupabaseClient<Database>,
  courseId: string,
  params: IntentRouteMsgParams
): Promise<ChatResponse> {
  const directResult = handleDirectIntent(
    classifiedIntent,
    courseStructure,
    nodeContextBlockPath,
    params.nodeContext?.stageId
  );
  const metadata = directResult.requiresClarification
    ? ({ clarificationType: 'ambiguous_intent' } as const)
    : undefined;

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
    ...(metadata ? { metadata } : {}),
  };
}

// ============================================================================
// Info Query Handler
// ============================================================================

/**
 * Handle GET_INFO queries within the intent classification flow.
 * Returns ChatResponse for info queries without LLM generation.
 */
export async function handleInfoQueryRoute(
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

// ============================================================================
// LLM Required Route Handler
// ============================================================================

/**
 * Handle LLM-required intents with TARGETED context (~500 tokens vs 42K).
 * Resolves targeted context, builds prompt, calls LLM, and parses proposal.
 */
export async function handleLLMRequiredRoute(
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
    // Plan requirement: chat phases must fail-fast (503) when config is unavailable
    logger.error(
      {
        requestId,
        courseId,
        phaseKey,
        error: configError,
      },
      'Chat phase model config unavailable — returning 503 per plan requirement'
    );
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: `Model configuration unavailable for chat phase "${phaseKey}". Please try again later.`,
    });
  }

  let modelUsed = targetedModelId;
  let targetedLLMResponse;

  // A chat turn is paid work on this course; its phase is named after the edit,
  // not a stage, which is why nothing recorded it (mc2-b7olk.5).
  const costContext = { courseId, stage: 'stage_edit' as const, phase: phaseKey };

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
        enableCaching: true,
        costContext,
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
          enableCaching: true,
          costContext,
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
// Structural Intent Handler (ADD_LESSON, ADD_SECTION)
// ============================================================================

/** Intents that produce structural_operation proposals */
const STRUCTURAL_INTENTS = ['ADD_LESSON', 'ADD_SECTION'] as const;

export function isStructuralIntent(intent: string): boolean {
  return (STRUCTURAL_INTENTS as readonly string[]).includes(intent);
}

/**
 * Handle structural intents (ADD_LESSON, ADD_SECTION) via LLM with ID remapping.
 * Returns a structural_operation proposal with CourseOperation[] batch.
 */
export async function handleStructuralIntentRoute(
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
  } catch (configError) {
    // Plan requirement: chat phases must fail-fast (503) when config is unavailable
    logger.error(
      { requestId, courseId, phaseKey, error: configError },
      'Chat phase model config unavailable — returning 503 per plan requirement'
    );
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: `Model configuration unavailable for chat phase "${phaseKey}". Please try again later.`,
    });
  }

  // Call LLM with primary/fallback
  let modelUsed = modelId;
  let llmResponse;

  // See the note in the intent flow above: an edit is spend on the course.
  const costContext = { courseId, stage: 'stage_edit' as const, phase: phaseKey };

  try {
    llmResponse = await llmClient.generateChatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      { model: modelId, temperature, maxTokens: 2048, enableCaching: true, costContext }
    );
  } catch {
    modelUsed = fallbackModelId;
    llmResponse = await llmClient.generateChatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      { model: fallbackModelId, temperature, maxTokens: 2048, enableCaching: true, costContext }
    );
  }

  // Parse LLM response into operations
  let proposal: StructuralOperationProposal | undefined;
  let assistantMessage: string;
  let stage6ContentReady = false;

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

    // Stage 6 CTA: explicit action prompt when content already generated
    // Plan:316-318: additional consistency check via lesson_contents status
    const STAGE6_COMPLETE_STATUSES = ['stage_6_complete', 'finalizing', 'completed'];
    const statusMatch =
      !!generationStatus &&
      STAGE6_COMPLETE_STATUSES.includes(generationStatus) &&
      realOperations.some(op => op.type === 'add_lesson');

    if (statusMatch) {
      // Consistency check (plan:318): verify ratio of lesson_contents with
      // completed/review_required LATEST status per lesson UUID.
      // A majority (>50%) indicates Stage 6 content has actually been generated,
      // not just status set.
      try {
        const { data: lessons, error: lessonsError } = await supabaseAdmin
          .from('lessons')
          .select('id, sections!inner(course_id)')
          .eq('sections.course_id', courseId);

        if (lessonsError) {
          throw lessonsError;
        }

        const lessonIds = (lessons || []).map(lesson => lesson.id);
        if (lessonIds.length === 0) {
          stage6ContentReady = false;
        } else {
          const { data: contents, error: contentsError } = await supabaseAdmin
            .from('lesson_contents')
            .select('lesson_id, status, created_at')
            .eq('course_id', courseId)
            .in('lesson_id', lessonIds)
            .order('created_at', { ascending: false });

          if (contentsError) {
            throw contentsError;
          }

          const latestStatusByLesson = new Map<string, string>();
          for (const row of contents || []) {
            if (!latestStatusByLesson.has(row.lesson_id)) {
              latestStatusByLesson.set(row.lesson_id, row.status);
            }
          }

          let completedLessons = 0;
          for (const lessonId of lessonIds) {
            const latestStatus = latestStatusByLesson.get(lessonId);
            if (latestStatus === 'completed' || latestStatus === 'review_required') {
              completedLessons++;
            }
          }

          stage6ContentReady = completedLessons / lessonIds.length > 0.5;
        }
      } catch (consistencyError) {
        // Non-fatal: keep CTA disabled when consistency check cannot be verified.
        logger.warn(
          {
            requestId,
            courseId,
            error:
              consistencyError instanceof Error
                ? consistencyError.message
                : String(consistencyError),
          },
          'Chat: Stage 6 consistency check failed, CTA disabled'
        );
        stage6ContentReady = false;
      }
    }

    if (stage6ContentReady) {
      assistantMessage +=
        '\n\nКонтент курса уже сгенерирован. Сгенерировать контент для новых уроков после применения изменений?';
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
    ...(stage6ContentReady ? { metadata: { stage6ContentReady: true } } : {}),
  };
}
