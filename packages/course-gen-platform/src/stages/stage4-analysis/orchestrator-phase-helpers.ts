/**
 * Stage 4 Analysis Orchestrator Phase Helpers
 *
 * Individual phase execution functions extracted from orchestrator-helpers.ts
 * to comply with ESLint max-lines rule.
 *
 * @module stages/stage4-analysis/orchestrator-phase-helpers
 */

import { getRedisClient } from '../../shared/cache/redis';
import { runPhase1Classification } from './phases/phase-1-classifier';
import { runPhase2Scope } from './phases/phase-2-scope';
import { runPhase3Expert } from './phases/phase-3-expert';
import { runPhase4Synthesis } from './phases/phase-4-synthesis';
import {
  runPhase05Clarifying,
  getPendingQuestions,
  getAnsweredQuestions,
  getClarifyingConfig,
  autoAnswerAllQuestions,
  extractAnswerString,
} from './phases/phase-0.5-clarifying';
import {
  updateCourseProgress,
  startPhase,
  completePhase,
  PROGRESS_RANGES,
  PROGRESS_MESSAGES,
} from './utils/validators';
import { getAndClearTraceData } from './utils/observability';
import type {
  Phase1Output,
  Phase2Output,
  Phase3Output,
  Phase4Output,
} from '@megacampus/shared-types/analysis-result';
import type pino from 'pino';
import { ClarifyingQuestionsInterrupt } from '@/shared/errors';
import { logTrace } from '../../shared/trace-logger';
import type { AnalysisContext } from './orchestrator-helpers';
import { getErrorMessage } from '../../shared/utils/error-formatter';

/**
 * Complete a phase and log its trace data
 *
 * Consolidates the repeated completePhase + getAndClearTraceData + logTrace pattern
 * used by phases 2, 3, and 4.
 *
 * @param phaseNumber - Phase number (2, 3, or 4)
 * @param tracePhaseName - Phase name for trace lookup (e.g., 'stage_4_scope')
 * @param stepName - Step name for trace logging (e.g., 'scope_analysis')
 * @param context - Analysis context
 * @param output - Phase output with phase_metadata
 * @param completionMetadata - Metadata to pass to completePhase
 * @param inputData - Input data for trace logging
 */
async function completePhaseWithTrace<
  T extends {
    phase_metadata: {
      tokens: { input: number; output: number };
      model_used: string;
      duration_ms: number;
    };
  },
>(
  phaseNumber: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  tracePhaseName: string,
  stepName: string,
  context: AnalysisContext,
  output: T,
  completionMetadata: Record<string, unknown>,
  inputData: Record<string, unknown>
): Promise<void> {
  const { courseId, supabase, orchestrationLogger } = context;

  await completePhase(phaseNumber, courseId, supabase, orchestrationLogger, completionMetadata);

  const traceData = getAndClearTraceData(courseId, tracePhaseName);

  await logTrace({
    courseId,
    stage: 'stage_4',
    phase: tracePhaseName,
    stepName,
    inputData,
    outputData: output,
    promptText: traceData?.promptText,
    completionText: traceData?.completionText,
    tokensUsed: output.phase_metadata.tokens.input + output.phase_metadata.tokens.output,
    modelUsed: output.phase_metadata.model_used,
    durationMs: output.phase_metadata.duration_ms,
  });
}

/**
 * Run Phase 1 classification
 * Phase 1: Basic Classification (12-25%)
 */
export async function runClassificationPhase(context: AnalysisContext): Promise<void> {
  const { courseId, input, supabase, orchestrationLogger } = context;
  const phase1CacheKey = `phase1_cache:${courseId}`;
  const redis = getRedisClient();

  let phase1Output!: Phase1Output;
  let usedCache = false;

  // Check Redis cache
  let cachedPhase1: string | null = null;
  try {
    cachedPhase1 = await redis.get(phase1CacheKey);
  } catch (redisError) {
    orchestrationLogger.warn(
      { error: getErrorMessage(redisError) },
      'Redis get failed for Phase 1 cache'
    );
  }

  if (cachedPhase1) {
    try {
      const parsed = JSON.parse(cachedPhase1) as Phase1Output;
      if (!parsed?.course_category?.primary || !parsed?.topic_analysis) {
        throw new Error('Invalid cached Phase1Output structure');
      }
      phase1Output = parsed;
      usedCache = true;
      orchestrationLogger.info(
        { category: phase1Output.course_category.primary, source: 'redis_cache' },
        'Phase 1: Using cached classification'
      );
    } catch (parseError) {
      orchestrationLogger.warn(
        { error: getErrorMessage(parseError) },
        'Phase 1 cache corrupted, re-executing'
      );
      try {
        await redis.del(phase1CacheKey);
      } catch {
        /* ignore */
      }
    }
  }

  if (!usedCache) {
    await startPhase(1, courseId, supabase, orchestrationLogger);

    phase1Output = await executePhaseWithRetry(
      'phase1_classification',
      () =>
        runPhase1Classification({
          course_id: courseId,
          language: input.language,
          topic: input.topic,
          document_summaries:
            input.document_summaries?.map(ds => ({
              document_id: ds.document_id,
              file_name: ds.file_name,
              processed_content: ds.processed_content,
            })) || null,
          target_audience: input.target_audience,
          lesson_duration_minutes: input.lesson_duration_minutes,
          course_description: input.course_description,
        }),
      orchestrationLogger
    );

    await completePhase(1, courseId, supabase, orchestrationLogger, {
      category: phase1Output.course_category.primary,
      confidence: phase1Output.course_category.confidence,
      complexity: phase1Output.topic_analysis.complexity,
      duration_ms: phase1Output.phase_metadata.duration_ms,
      model_used: phase1Output.phase_metadata.model_used,
    });

    // Cache in Redis
    try {
      await redis.set(phase1CacheKey, JSON.stringify(phase1Output), 'EX', 86400);
    } catch (cacheError) {
      orchestrationLogger.warn(
        { error: getErrorMessage(cacheError) },
        'Failed to cache Phase 1 output'
      );
    }

    const phase1TraceData = getAndClearTraceData(courseId, 'stage_4_classification');

    await logTrace({
      courseId,
      stage: 'stage_4',
      phase: 'stage_4_classification',
      stepName: 'classify',
      inputData: { topic: input.topic },
      outputData: phase1Output,
      promptText: phase1TraceData?.promptText,
      completionText: phase1TraceData?.completionText,
      tokensUsed:
        phase1Output.phase_metadata.tokens.input + phase1Output.phase_metadata.tokens.output,
      modelUsed: phase1Output.phase_metadata.model_used,
      durationMs: phase1Output.phase_metadata.duration_ms,
    });
  }

  context.phase1Output = phase1Output;
}

/**
 * Run Phase 0.5 clarifying questions
 * Phase 0.5: Clarifying Questions (25-28%)
 */
export async function runClarifyingPhase(context: AnalysisContext): Promise<void> {
  const { courseId, input, supabase, orchestrationLogger, budgetAllocation, phase1Output } =
    context;

  if (!phase1Output) {
    throw new Error('Phase 1 output required for clarifying phase');
  }

  const clarifyingConfig = await getClarifyingConfig(courseId);

  if (!clarifyingConfig.enabled || clarifyingConfig.skipped) {
    orchestrationLogger.info('Clarifying questions disabled or skipped');
    return;
  }

  orchestrationLogger.info(
    { isAutomatic: clarifyingConfig.isAutomatic },
    'Clarifying questions enabled'
  );

  const pendingQuestions = await getPendingQuestions(courseId);
  const answeredQuestions = await getAnsweredQuestions(courseId);
  const hasExistingQuestions = pendingQuestions.length > 0 || answeredQuestions.length > 0;

  if (!hasExistingQuestions) {
    // Generate questions
    orchestrationLogger.info('Generating clarifying questions');
    await updateCourseProgress(
      courseId,
      'in_progress',
      PROGRESS_RANGES.step_0_5.start,
      PROGRESS_MESSAGES.step_0_5_start,
      supabase
    );

    await runPhase05Clarifying({
      course_id: courseId,
      budgetAllocation: budgetAllocation,
      courseContext: {
        title: input.topic,
        description: input.course_description,
        target_audience: input.target_audience,
      },
      language: input.language,
      document_summaries: input.document_summaries?.map(ds => ({
        file_name: ds.file_name,
        processed_content: ds.processed_content,
      })),
      phase1_output: phase1Output,
    });

    if (clarifyingConfig.isAutomatic) {
      const answeredCount = await autoAnswerAllQuestions(courseId);
      orchestrationLogger.info({ answeredCount }, 'Automatic mode: auto-answered questions');
      await updateCourseProgress(
        courseId,
        'in_progress',
        PROGRESS_RANGES.step_0_5.end,
        PROGRESS_MESSAGES.step_0_5_complete,
        supabase
      );
    } else {
      // Transition to clarifying status
      const { error: statusError } = await supabase
        .from('courses')
        .update({
          generation_status: 'stage_4_clarifying',
          updated_at: new Date().toISOString(),
        })
        .eq('id', courseId);

      if (statusError) {
        orchestrationLogger.error(
          { error: statusError.message },
          'Failed to transition to stage_4_clarifying'
        );
      }

      const generatedQuestions = await getPendingQuestions(courseId);
      const criticalCount = generatedQuestions.filter(
        q => q.question_priority === 'critical' || q.question_priority === 'important'
      ).length;

      throw new ClarifyingQuestionsInterrupt(criticalCount, generatedQuestions.length, courseId);
    }
  } else if (pendingQuestions.length > 0) {
    const criticalPending = pendingQuestions.filter(
      q => q.question_priority === 'critical' || q.question_priority === 'important'
    );

    if (criticalPending.length > 0) {
      if (clarifyingConfig.isAutomatic) {
        const answeredCount = await autoAnswerAllQuestions(courseId);
        orchestrationLogger.info({ answeredCount }, 'Automatic mode: auto-answered remaining');
      } else {
        throw new ClarifyingQuestionsInterrupt(
          criticalPending.length,
          pendingQuestions.length,
          courseId
        );
      }
    }
  }

  // Collect answered questions
  const clarifyingAnswers = await getAnsweredQuestions(courseId);
  context.clarifyingAnswers = clarifyingAnswers.map(q => ({
    question: q.question_text,
    answer: extractAnswerString(q.user_answer),
    priority: q.question_priority,
    category: q.question_category || 'general',
  }));

  if (context.clarifyingAnswers.length > 0) {
    orchestrationLogger.info(
      { answeredCount: context.clarifyingAnswers.length },
      'Clarifying answers available'
    );
  }

  await updateCourseProgress(
    courseId,
    'in_progress',
    PROGRESS_RANGES.step_0_5.end,
    PROGRESS_MESSAGES.step_0_5_complete,
    supabase
  );
}

/**
 * Run Phase 2 scope analysis
 * Phase 2: Scope Analysis (28-45%)
 */
export async function runScopePhase(context: AnalysisContext): Promise<void> {
  const { courseId, input, supabase, orchestrationLogger, phase1Output, clarifyingAnswers } =
    context;

  if (!phase1Output) {
    throw new Error('Phase 1 output required for scope phase');
  }

  await startPhase(2, courseId, supabase, orchestrationLogger);

  const phase2Output: Phase2Output = await executePhaseWithRetry(
    'phase2_scope',
    () =>
      runPhase2Scope({
        course_id: courseId,
        language: input.language,
        topic: input.topic,
        document_summaries: input.document_summaries?.map(ds => ds.processed_content) || null,
        phase1_output: phase1Output,
        course_size: input.course_size,
        target_lessons: input.target_lessons,
        target_sections: input.target_sections,
        size_guidance: input.size_guidance,
        min_lessons: input.min_lessons,
        max_lessons: input.max_lessons,
        clarifying_answers: clarifyingAnswers,
        course_description: input.course_description,
        learning_outcomes: input.learning_outcomes,
      }),
    orchestrationLogger
  );

  await completePhaseWithTrace(
    2,
    'stage_4_scope',
    'scope_analysis',
    context,
    phase2Output,
    {
      total_lessons: phase2Output.recommended_structure.total_lessons,
      total_sections: phase2Output.recommended_structure.total_sections,
      estimated_hours: phase2Output.recommended_structure.estimated_content_hours,
      duration_ms: phase2Output.phase_metadata.duration_ms,
      model_used: phase2Output.phase_metadata.model_used,
    },
    { topic: input.topic }
  );

  context.phase2Output = phase2Output;
}

/**
 * Run Phase 3 expert analysis
 * Phase 3: Deep Expert Analysis (45-70%)
 */
export async function runExpertPhase(context: AnalysisContext): Promise<void> {
  const {
    courseId,
    input,
    supabase,
    orchestrationLogger,
    phase1Output,
    phase2Output,
    clarifyingAnswers,
  } = context;

  if (!phase1Output || !phase2Output) {
    throw new Error('Phase 1 and 2 outputs required for expert phase');
  }

  await startPhase(3, courseId, supabase, orchestrationLogger);

  const documentSummariesText = input.document_summaries?.map(ds => ds.processed_content) || null;

  const phase3Output: Phase3Output = await executePhaseWithRetry(
    'phase3_expert',
    () =>
      runPhase3Expert({
        course_id: courseId,
        language: input.language,
        topic: input.topic,
        document_summaries: documentSummariesText,
        phase1_output: phase1Output,
        phase2_output: phase2Output,
        clarifying_answers: clarifyingAnswers,
      }),
    orchestrationLogger
  );

  await completePhaseWithTrace(
    3,
    'stage_4_expert',
    'expert_analysis',
    context,
    phase3Output,
    {
      research_flags_count: phase3Output.research_flags.length,
      duration_ms: phase3Output.phase_metadata.duration_ms,
      model_used: phase3Output.phase_metadata.model_used,
    },
    { topic: input.topic }
  );

  context.phase3Output = phase3Output;
}

/**
 * Run Phase 4 synthesis
 * Phase 4: Document Synthesis (70-85%)
 */
export async function runSynthesisPhase(context: AnalysisContext): Promise<void> {
  const {
    courseId,
    input,
    supabase,
    orchestrationLogger,
    phase1Output,
    phase2Output,
    phase3Output,
    clarifyingAnswers,
  } = context;

  if (!phase1Output || !phase2Output || !phase3Output) {
    throw new Error('Phase 1, 2, and 3 outputs required for synthesis phase');
  }

  await startPhase(4, courseId, supabase, orchestrationLogger);

  const phase4Output: Phase4Output = await executePhaseWithRetry(
    'phase4_synthesis',
    () =>
      runPhase4Synthesis({
        course_id: courseId,
        language: input.language,
        topic: input.topic,
        document_summaries: input.document_summaries || null,
        phase1_output: phase1Output,
        phase2_output: phase2Output,
        phase3_output: phase3Output,
        clarifying_answers: clarifyingAnswers,
      }),
    orchestrationLogger
  );

  await completePhaseWithTrace(
    4,
    'stage_4_synthesis',
    'document_synthesis',
    context,
    phase4Output,
    {
      generation_guidance_tone: phase4Output.generation_guidance.tone,
      duration_ms: phase4Output.phase_metadata.duration_ms,
      model_used: phase4Output.phase_metadata.model_used,
      document_count: phase4Output.phase_metadata.document_count,
    },
    { documentCount: phase4Output.phase_metadata.document_count }
  );

  // Log parameter storage
  await logTrace({
    courseId,
    stage: 'stage_4',
    phase: 'completion',
    stepName: 'parameter_store',
    inputData: {
      source: 'phase_4_synthesis',
      hasGenerationGuidance: !!phase4Output.generation_guidance,
    },
    outputData: {
      generation_guidance: phase4Output.generation_guidance,
    },
    durationMs: 0,
  });

  if (phase4Output.generation_guidance) {
    orchestrationLogger.info(
      {
        tone: phase4Output.generation_guidance.tone,
        use_analogies: phase4Output.generation_guidance.use_analogies,
      },
      'Phase 4: Generation guidance created'
    );
  }

  context.phase4Output = phase4Output;
}

/**
 * Execute phase with retry and exponential backoff
 */
export async function executePhaseWithRetry<T>(
  phaseName: string,
  phaseFunc: () => Promise<T>,
  phaseLogger: pino.Logger
): Promise<T> {
  const RETRY_CONFIG = {
    MAX_ATTEMPTS: 3,
    BASE_DELAY_MS: 1000,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= RETRY_CONFIG.MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        phaseLogger.info(
          {
            phase: phaseName,
            attempt,
            maxAttempts: RETRY_CONFIG.MAX_ATTEMPTS,
          },
          `Retry attempt ${attempt} for ${phaseName}`
        );
      }

      return await phaseFunc();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      phaseLogger.warn(
        {
          phase: phaseName,
          attempt,
          maxAttempts: RETRY_CONFIG.MAX_ATTEMPTS,
          error: lastError.message,
        },
        `Phase ${phaseName} attempt ${attempt} failed`
      );

      if (attempt < RETRY_CONFIG.MAX_ATTEMPTS) {
        const delayMs = RETRY_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt - 1);
        phaseLogger.debug(
          {
            phase: phaseName,
            delayMs,
            nextAttempt: attempt + 1,
          },
          `Waiting ${delayMs}ms before retry`
        );
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  throw new Error(
    `Phase ${phaseName} failed after ${RETRY_CONFIG.MAX_ATTEMPTS} attempts: ${lastError?.message || 'Unknown error'}`
  );
}
