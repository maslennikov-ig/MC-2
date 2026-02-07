/**
 * Multi-Phase Analysis Orchestrator
 *
 * Coordinates all 5 phases of Stage 4 Analysis workflow:
 * - Phase 0 (Pre-Flight): Stage 3 barrier validation, input validation (0-10%)
 * - Phase 1: Basic Classification (12-25%)
 * - Phase 0.5: Clarifying Questions (25-28%) - enriched with Phase 1 data
 * - Phase 2: Scope Analysis (28-45%) - includes minimum 10 lessons check
 * - Phase 3: Deep Expert Analysis (45-70%)
 * - Phase 4: Document Synthesis (70-85%)
 * - Phase 5: Final Assembly (85-100%)
 *
 * DEPRECATED: Phase 6 (RAG Planning) - removed in mc2-u9fb
 * Vector search with priority boosting (mc2-zac) replaces LLM-based
 * document-to-section mapping. Benefits:
 * - No LLM error propagation risk
 * - Dynamic relevance scoring per lesson
 * - ~5-10 seconds + 2-5K tokens saved per course
 *
 * Key Features:
 * - Real-time progress updates (Russian messages)
 * - Stage 3 barrier enforcement (FR-016)
 * - Minimum 10 lessons validation (FR-015)
 * - OpenRouter failure handling (FR-013)
 * - Extended observability metrics (FR-014)
 * - Multi-model orchestration (FR-017)
 *
 * Split from original 555-line file to comply with 300-line constitution principle.
 * Validation logic extracted to analysis-validators.ts.
 *
 * @module analysis-orchestrator
 */

import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { runPhase1Classification } from './phases/phase-1-classifier';
import { runPhase2Scope, logDuplicateKeyTopics } from './phases/phase-2-scope';
import { runPhase3Expert } from './phases/phase-3-expert';
import { runPhase4Synthesis } from './phases/phase-4-synthesis';
// Phase 6 RAG Planning deprecated (mc2-u9fb) - vector search with priority boosting used instead
// import { runPhase6RagPlanning } from './phases/phase-6-rag-planning';
import { assembleAnalysisResult } from './phases/phase-5-assembly';
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
  validateStage3Barrier,
  formatErrorMessage,
  validateJobInput,
  startPhase,
  completePhase,
  PROGRESS_RANGES,
} from './utils/validators';
import { getAndClearTraceData } from './utils/observability';
import {
  allocateStage4Budget,
  validateStage4Budget,
  type Stage4DocumentInfo,
  type Stage4BudgetAllocation,
} from './phases/stage4-budget-allocator';
import logger from '../../shared/logger';
import { logTrace } from '../../shared/trace-logger';
import type { StructureAnalysisJob, DocumentSummary } from '@megacampus/shared-types';
import type {
  AnalysisResult,
  Phase1Output,
  Phase2Output,
  Phase3Output,
  Phase4Output,
} from '@megacampus/shared-types/analysis-result';
import type { Phase6Output } from './phases/phase-6-rag-planning';
import type pino from 'pino';
import { validateLocale } from '@/shared/validation';
import {
  ClarifyingQuestionsInterrupt,
  BarrierFailedError,
  isPipelineInterrupt,
} from '@/shared/errors';

/**
 * RT-004 style retry configuration for Stage 4 phases
 * Matches Stage 5 pattern for consistency
 *
 * @see specs/008-generation-generation-json/research-decisions/rt-004-retry-strategy.md
 */
const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY_MS: 1000,
} as const;

/**
 * Execute a phase with retry and exponential backoff
 *
 * Wraps LLM phase execution with retry logic to handle transient failures
 * (rate limits, timeouts, temporary API errors).
 *
 * @param phaseName - Phase identifier for logging
 * @param phaseFunc - Async function that executes the phase
 * @param phaseLogger - Logger instance with context
 * @returns Phase output
 * @throws Error if all retry attempts fail
 */
async function executePhaseWithRetry<T>(
  phaseName: string,
  phaseFunc: () => Promise<T>,
  phaseLogger: pino.Logger
): Promise<T> {
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

/**
 * Main orchestration function for Stage 4 Analysis
 *
 * Executes all 5 phases sequentially with real-time progress tracking.
 * Enforces Stage 3 barrier and minimum 10 lessons constraint.
 *
 * Workflow:
 * 1. Phase 0: Pre-flight validation (Stage 3 barrier check)
 * 2. Phase 1: Basic classification (model from database)
 * 3. Phase 2: Scope analysis (model from database, minimum 10 lessons validation)
 * 4. Phase 3: Deep expert analysis (model from database)
 * 5. Phase 4: Document synthesis (model from database)
 * 6. Phase 5: Final assembly (no LLM, pure data combination)
 *
 * NOTE: Phase 6 (RAG Planning) deprecated - vector search with priority boosting used instead
 *
 * Error Handling (FR-013):
 * - LLM failures: Automatic retry with exponential backoff (handled by phase services)
 * - After exhausting retries: Throw error with detailed metadata
 * - Caller (worker handler) sends notification to technical support
 *
 * Observability (FR-014):
 * - Logs extended metrics per phase (duration, tokens, model_id, quality_score)
 * - Tracks cumulative metrics (total_duration_ms, total_tokens, total_cost_usd)
 * - Records retry attempts, fallback model usage, validation errors
 *
 * @param job - Structure analysis job payload
 * @returns Complete analysis result ready for storage in courses.analysis_result
 * @throws Error if Stage 3 barrier fails (BARRIER_FAILED)
 * @throws Error if minimum 10 lessons not met (MINIMUM_LESSONS_NOT_MET)
 * @throws Error if LLM processing fails after retries (LLM_ERROR)
 *
 * @example
 * const result = await runAnalysisOrchestration({
 *   course_id: '550e8400-e29b-41d4-a716-446655440000',
 *   organization_id: '660e8400-e29b-41d4-a716-446655440000',
 *   user_id: '770e8400-e29b-41d4-a716-446655440000',
 *   input: {
 *     topic: 'Procurement law fundamentals',
 *     language: 'ru',
 *     style: 'professional',
 *     target_audience: 'intermediate',
 *     difficulty: 'intermediate',
 *     lesson_duration_minutes: 15,
 *     document_summaries: [...]
 *   },
 *   priority: 10,
 *   attempt_count: 0,
 *   created_at: '2025-11-01T12:00:00Z'
 * });
 */
export async function runAnalysisOrchestration(job: StructureAnalysisJob): Promise<AnalysisResult> {
  const { course_id: courseId, input } = job;
  const startTime = Date.now();
  const supabase = getSupabaseAdmin();

  const orchestrationLogger = logger.child({
    courseId,
    organizationId: job.organization_id,
    userId: job.user_id,
    jobAttempt: job.attempt_count,
  });

  orchestrationLogger.info(
    {
      topic: input.topic,
      language: input.language,
      documentCount: input.document_summaries?.length || 0,
    },
    'Starting Stage 4 analysis orchestration'
  );

  await logTrace({
    courseId,
    stage: 'stage_4',
    phase: 'init',
    stepName: 'start',
    inputData: {
      topic: input.topic,
      language: input.language,
      documentCount: input.document_summaries?.length || 0,
    },
    durationMs: 0,
  });

  try {
    // =================================================================
    // PHASE 0: Pre-Flight Validation (0-10%)
    // =================================================================
    await startPhase(0, courseId, supabase, orchestrationLogger);

    // Input validation
    validateJobInput(input);

    // Stage 3 barrier check (FR-016)
    const barrierResult = await validateStage3Barrier(courseId, supabase);

    if (!barrierResult.canProceed) {
      orchestrationLogger.error({ barrierResult }, 'Stage 3 barrier validation failed');
      await updateCourseProgress(
        courseId,
        'failed',
        PROGRESS_RANGES.step_0.start,
        barrierResult.errorMessage || 'Обработка документов не завершена',
        supabase
      );
      throw new BarrierFailedError(3, barrierResult.completedFiles, barrierResult.totalFiles);
    }

    await completePhase(0, courseId, supabase, orchestrationLogger, {
      totalFiles: barrierResult.totalFiles,
      completedFiles: barrierResult.completedFiles,
    });

    // =================================================================
    // BUDGET ALLOCATION: Calculate token budget BEFORE Phase 1
    // =================================================================
    let budgetAllocation: Stage4BudgetAllocation | null = null;

    if (input.document_summaries && input.document_summaries.length > 0) {
      orchestrationLogger.info('Starting budget allocation for document processing');

      // Get document info from input.document_summaries
      const documentInfos: Stage4DocumentInfo[] = await prepareDocumentInfos(
        input.document_summaries
      );

      // Allocate budget
      budgetAllocation = allocateStage4Budget(documentInfos, validateLocale(input.language));

      // Validate allocation
      validateStage4Budget(budgetAllocation);

      // Log budget allocation
      orchestrationLogger.info(
        {
          modelId: budgetAllocation.modelSelection.modelId,
          tier: budgetAllocation.modelSelection.tier,
          totalTokens: budgetAllocation.totalTokens,
          coreTokens: budgetAllocation.breakdown.core.tokens,
          importantFullText: budgetAllocation.breakdown.important.fullTextCount,
          importantSummary: budgetAllocation.breakdown.important.summaryCount,
          supplementaryCount: budgetAllocation.breakdown.supplementary.count,
          documentCount: input.document_summaries.length,
        },
        'Budget allocation complete'
      );

      await logTrace({
        courseId,
        stage: 'stage_4',
        phase: 'budget_allocation',
        stepName: 'allocate_budget',
        inputData: {
          documentCount: input.document_summaries.length,
          language: input.language,
        },
        outputData: {
          modelId: budgetAllocation.modelSelection.modelId,
          tier: budgetAllocation.modelSelection.tier,
          totalTokens: budgetAllocation.totalTokens,
          breakdown: budgetAllocation.breakdown,
        },
        durationMs: 0,
      });
    } else {
      orchestrationLogger.info('Skipping budget allocation: No documents available');
    }

    // =================================================================
    // PHASE 1: Basic Classification (12-25%)
    // =================================================================
    await startPhase(1, courseId, supabase, orchestrationLogger);

    const phase1Output: Phase1Output = await executePhaseWithRetry(
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

    // Get trace data (raw prompt/completion) stored by phase function
    const phase1TraceData = getAndClearTraceData(courseId, 'stage_4_classification');

    await logTrace({
      courseId,
      stage: 'stage_4',
      phase: 'stage_4_classification',
      stepName: 'classify',
      inputData: { topic: input.topic },
      outputData: phase1Output, // Full phase output for complete visibility
      promptText: phase1TraceData?.promptText,
      completionText: phase1TraceData?.completionText,
      tokensUsed:
        phase1Output.phase_metadata.tokens.input + phase1Output.phase_metadata.tokens.output,
      modelUsed: phase1Output.phase_metadata.model_used,
      durationMs: phase1Output.phase_metadata.duration_ms,
    });

    // Log pedagogical_patterns if present (Analyze Enhancement A20)
    if (phase1Output.pedagogical_patterns) {
      orchestrationLogger.info(
        {
          primary_strategy: phase1Output.pedagogical_patterns.primary_strategy,
          theory_practice_ratio: phase1Output.pedagogical_patterns.theory_practice_ratio,
          key_patterns_count: phase1Output.pedagogical_patterns.key_patterns.length,
        },
        'Phase 1: Pedagogical patterns generated'
      );
    }

    // =================================================================
    // PHASE 0.5: Clarifying Questions (25-28%) (if enabled and not skipped)
    // =================================================================
    const clarifyingConfig = await getClarifyingConfig(courseId);

    if (clarifyingConfig.enabled && !clarifyingConfig.skipped) {
      orchestrationLogger.info(
        { isAutomatic: clarifyingConfig.isAutomatic },
        'Clarifying questions enabled - checking status'
      );

      const pendingQuestions = await getPendingQuestions(courseId);
      const answeredQuestions = await getAnsweredQuestions(courseId);

      // Check if questions were ever generated (prevents duplicate generation)
      // Bug fix: pendingQuestions.length === 0 could mean either:
      // A) First run - no questions generated yet
      // B) All questions answered (status changed from 'pending' to 'answered')
      const hasExistingQuestions = pendingQuestions.length > 0 || answeredQuestions.length > 0;

      if (!hasExistingQuestions) {
        // First time - no questions at all - generate
        orchestrationLogger.info('No questions found - generating clarifying questions');

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

        // AUTOMATIC MODE: Auto-answer all questions and proceed without pause
        if (clarifyingConfig.isAutomatic) {
          const answeredCount = await autoAnswerAllQuestions(courseId);
          orchestrationLogger.info(
            { answeredCount },
            'Automatic mode: auto-answered questions, proceeding to Phase 2'
          );
          // No pause - continue directly to Phase 2
        } else {
          // SEMI-AUTOMATIC MODE: Pause for user input
          // Transition to clarifying status and pause
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
          } else {
            orchestrationLogger.info('Transitioned to stage_4_clarifying - awaiting user answers');
          }

          // Fetch generated questions to get counts
          const generatedQuestions = await getPendingQuestions(courseId);
          const criticalCount = generatedQuestions.filter(
            q => q.question_priority === 'critical' || q.question_priority === 'important'
          ).length;

          // Throw custom interrupt to pause execution
          throw new ClarifyingQuestionsInterrupt(
            criticalCount,
            generatedQuestions.length,
            courseId
          );
        }
      } else if (pendingQuestions.length > 0) {
        // Questions exist and some are still pending
        const criticalPending = pendingQuestions.filter(
          q => q.question_priority === 'critical' || q.question_priority === 'important'
        );

        if (criticalPending.length > 0) {
          // In automatic mode, auto-answer any pending questions
          if (clarifyingConfig.isAutomatic) {
            const answeredCount = await autoAnswerAllQuestions(courseId);
            orchestrationLogger.info(
              { answeredCount, criticalPending: criticalPending.length },
              'Automatic mode: auto-answered remaining questions'
            );
          } else {
            orchestrationLogger.info(
              {
                criticalPendingCount: criticalPending.length,
                totalPendingCount: pendingQuestions.length,
              },
              'Critical/important questions pending - pausing analysis'
            );

            throw new ClarifyingQuestionsInterrupt(
              criticalPending.length,
              pendingQuestions.length,
              courseId
            );
          }
        }
      }
      // else: pendingQuestions.length === 0 && answeredQuestions.length > 0
      // → All questions answered, proceed to analysis phases

      // All critical/important questions answered - continue
      orchestrationLogger.info(
        { answeredCount: answeredQuestions.length },
        'All critical/important questions answered - proceeding to Phase 2'
      );
    } else {
      orchestrationLogger.info(
        {
          enabled: clarifyingConfig.enabled,
          skipped: clarifyingConfig.skipped,
        },
        'Clarifying questions disabled or skipped - proceeding to Phase 2'
      );
    }

    // Collect answered questions for injection into Phase 2-5
    const clarifyingAnswers = await getAnsweredQuestions(courseId);

    if (clarifyingAnswers.length > 0) {
      orchestrationLogger.info(
        {
          answeredCount: clarifyingAnswers.length,
        },
        'Clarifying answers available for Phase 2-5'
      );
    }

    // =================================================================
    // PHASE 2: Scope Analysis (28-45%)
    // =================================================================
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
          // Course size constraint fields (critical for MICRO/MINI/COMPACT presets)
          course_size: input.course_size,
          target_lessons: input.target_lessons,
          target_sections: input.target_sections,
          size_guidance: input.size_guidance,
          min_lessons: input.min_lessons,
          max_lessons: input.max_lessons,
          // NEW: Pass clarifying answers from Phase 0.5
          clarifying_answers: clarifyingAnswers.map(q => ({
            question: q.question_text,
            answer: extractAnswerString(q.user_answer),
            priority: q.question_priority,
            category: q.question_category,
          })),
        }),
      orchestrationLogger
    );

    // Minimum 10 lessons validation happens inside runPhase2Scope (FR-015)

    // Log duplicate key_topics warnings for observability (non-blocking)
    logDuplicateKeyTopics(phase2Output.recommended_structure.sections_breakdown, logger);

    await completePhase(2, courseId, supabase, orchestrationLogger, {
      total_lessons: phase2Output.recommended_structure.total_lessons,
      total_sections: phase2Output.recommended_structure.total_sections,
      estimated_hours: phase2Output.recommended_structure.estimated_content_hours,
      duration_ms: phase2Output.phase_metadata.duration_ms,
      model_used: phase2Output.phase_metadata.model_used,
    });

    // Get trace data (raw prompt/completion) stored by phase function
    const phase2TraceData = getAndClearTraceData(courseId, 'stage_4_scope');

    await logTrace({
      courseId,
      stage: 'stage_4',
      phase: 'stage_4_scope',
      stepName: 'scope_analysis',
      inputData: { topic: input.topic },
      outputData: phase2Output, // Full phase output for complete visibility
      promptText: phase2TraceData?.promptText,
      completionText: phase2TraceData?.completionText,
      tokensUsed:
        phase2Output.phase_metadata.tokens.input + phase2Output.phase_metadata.tokens.output,
      modelUsed: phase2Output.phase_metadata.model_used,
      durationMs: phase2Output.phase_metadata.duration_ms,
    });

    // =================================================================
    // PHASE 6 DEPRECATED: RAG Planning removed in favor of priority boosting
    // =================================================================
    // Phase 6 (RAG Planning) has been deprecated as of mc2-u9fb.
    // Reason: LLM-based document-to-section mapping introduced systematic risk
    // of errors that propagate to all lessons in a section.
    //
    // Vector search with priority boosting (mc2-zac) now handles document
    // retrieval dynamically at generation time, providing:
    // - No LLM error propagation risk
    // - Dynamic relevance scoring per lesson
    // - CORE/IMPORTANT document boosting (+20%/+12%)
    //
    // Savings: ~5-10 seconds + 2-5K tokens per course
    // See: docs/plans/abundant-sparking-sloth.md

    const documentSummariesText = input.document_summaries?.map(ds => ds.processed_content) || null;

    // Phase 6 is now always skipped - return empty mapping
    orchestrationLogger.info(
      'Phase 6 (RAG Planning) skipped: deprecated in favor of vector search with priority boosting (mc2-zac)'
    );

    // =================================================================
    // PHASE 3: Deep Expert Analysis (45-70%)
    // =================================================================
    await startPhase(3, courseId, supabase, orchestrationLogger);

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
          // NEW: Pass clarifying answers from Phase 0.5
          clarifying_answers: clarifyingAnswers.map(q => ({
            question: q.question_text,
            answer: extractAnswerString(q.user_answer),
            priority: q.question_priority,
            category: q.question_category,
          })),
        }),
      orchestrationLogger
    );

    await completePhase(3, courseId, supabase, orchestrationLogger, {
      research_flags_count: phase3Output.research_flags.length,
      expansion_areas_count: phase3Output.expansion_areas?.length || 0,
      duration_ms: phase3Output.phase_metadata.duration_ms,
      model_used: phase3Output.phase_metadata.model_used,
    });

    // Get trace data (raw prompt/completion) stored by phase function
    const phase3TraceData = getAndClearTraceData(courseId, 'stage_4_expert');

    await logTrace({
      courseId,
      stage: 'stage_4',
      phase: 'stage_4_expert',
      stepName: 'expert_analysis',
      inputData: { topic: input.topic },
      outputData: phase3Output, // Full phase output for complete visibility
      promptText: phase3TraceData?.promptText,
      completionText: phase3TraceData?.completionText,
      tokensUsed:
        phase3Output.phase_metadata.tokens.input + phase3Output.phase_metadata.tokens.output,
      modelUsed: phase3Output.phase_metadata.model_used,
      durationMs: phase3Output.phase_metadata.duration_ms,
    });

    // =================================================================
    // PHASE 4: Document Synthesis (70-85%)
    // =================================================================
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
          // NEW: Pass clarifying answers from Phase 0.5
          clarifying_answers: clarifyingAnswers.map(q => ({
            question: q.question_text,
            answer: extractAnswerString(q.user_answer),
            priority: q.question_priority,
            category: q.question_category,
          })),
        }),
      orchestrationLogger
    );

    await completePhase(4, courseId, supabase, orchestrationLogger, {
      generation_guidance_tone: phase4Output.generation_guidance.tone,
      duration_ms: phase4Output.phase_metadata.duration_ms,
      model_used: phase4Output.phase_metadata.model_used,
      document_count: phase4Output.phase_metadata.document_count,
    });

    // Get trace data (raw prompt/completion) stored by phase function
    const phase4TraceData = getAndClearTraceData(courseId, 'stage_4_synthesis');

    await logTrace({
      courseId,
      stage: 'stage_4',
      phase: 'stage_4_synthesis',
      stepName: 'document_synthesis',
      inputData: { documentCount: phase4Output.phase_metadata.document_count },
      outputData: phase4Output, // Full phase output for complete visibility
      promptText: phase4TraceData?.promptText,
      completionText: phase4TraceData?.completionText,
      tokensUsed:
        phase4Output.phase_metadata.tokens.input + phase4Output.phase_metadata.tokens.output,
      modelUsed: phase4Output.phase_metadata.model_used,
      durationMs: phase4Output.phase_metadata.duration_ms,
    });

    // T012: Log parameter storage after Phase 4 completion
    await logTrace({
      courseId,
      stage: 'stage_4',
      phase: 'completion',
      stepName: 'parameter_store',
      inputData: {
        source: 'phase_4_synthesis',
        hasGenerationGuidance: !!phase4Output.generation_guidance,
        hasPedagogicalPatterns: !!phase1Output.pedagogical_patterns,
      },
      outputData: {
        generation_guidance: phase4Output.generation_guidance,
        pedagogical_patterns: phase1Output.pedagogical_patterns,
      },
      durationMs: 0,
    });

    // Log generation_guidance if present (Analyze Enhancement A20)
    if (phase4Output.generation_guidance) {
      orchestrationLogger.info(
        {
          tone: phase4Output.generation_guidance.tone,
          use_analogies: phase4Output.generation_guidance.use_analogies,
          include_visuals: phase4Output.generation_guidance.include_visuals,
          exercise_types: phase4Output.generation_guidance.exercise_types,
          avoid_jargon_count: phase4Output.generation_guidance.avoid_jargon.length,
        },
        'Phase 4: Generation guidance created'
      );
    }

    // =================================================================
    // PHASE 6 OUTPUT: Always null (deprecated)
    // =================================================================
    // Phase 6 is deprecated - always pass null to assembly
    // Stage 5/6 RAG retrieval uses priority boosting instead
    const phase6Output: Phase6Output | null = null;

    // =================================================================
    // PHASE 5: Final Assembly (85-100%)
    // =================================================================
    await startPhase(5, courseId, supabase, orchestrationLogger);

    // Calculate cumulative metrics (Phase 6 deprecated - no tokens counted)
    const totalDurationMs = Date.now() - startTime;
    const totalTokens = {
      input:
        phase1Output.phase_metadata.tokens.input +
        phase2Output.phase_metadata.tokens.input +
        phase3Output.phase_metadata.tokens.input +
        phase4Output.phase_metadata.tokens.input,
      output:
        phase1Output.phase_metadata.tokens.output +
        phase2Output.phase_metadata.tokens.output +
        phase3Output.phase_metadata.tokens.output +
        phase4Output.phase_metadata.tokens.output,
      total: 0, // Will be calculated in assembly
    };
    totalTokens.total = totalTokens.input + totalTokens.output;

    // Note: Phase metadata doesn't include cost_usd field yet
    // Cost calculation will be handled in Phase 5 assembly based on token usage
    const totalCostUsd = 0;

    const analysisResult: AnalysisResult = await assembleAnalysisResult({
      course_id: courseId,
      language: input.language,
      topic: input.topic,
      document_summaries: documentSummariesText,
      phase1_output: phase1Output,
      phase2_output: phase2Output,
      phase3_output: phase3Output,
      phase4_output: phase4Output,
      phase6_output: phase6Output,
      // Pass min_lessons from course_size preset (default 10 for AUTO mode)
      min_lessons: input.min_lessons,
      total_duration_ms: totalDurationMs,
      total_tokens: totalTokens,
      total_cost_usd: totalCostUsd,
    });

    await completePhase(5, courseId, supabase, orchestrationLogger, {
      total_duration_ms: analysisResult.metadata.total_duration_ms,
      total_tokens: analysisResult.metadata.total_tokens.total,
      total_cost_usd: analysisResult.metadata.total_cost_usd,
      total_lessons: analysisResult.recommended_structure.total_lessons,
      category: analysisResult.course_category.primary,
      research_flags_count: analysisResult.research_flags.length,
    });

    // =================================================================
    // SUCCESS: Return complete analysis result
    // =================================================================
    orchestrationLogger.info(
      {
        total_duration_ms: totalDurationMs,
        phases_completed: 5, // Phase 6 deprecated
      },
      'Stage 4 analysis orchestration completed successfully'
    );

    await logTrace({
      courseId,
      stage: 'stage_4',
      phase: 'complete',
      stepName: 'finish',
      inputData: { courseId },
      outputData: analysisResult, // Full AnalysisResult for UI display
      costUsd: analysisResult.metadata.total_cost_usd,
      tokensUsed: analysisResult.metadata.total_tokens.total,
      durationMs: totalDurationMs,
    });

    // T012: Log parameter propagation to Stage 5
    await logTrace({
      courseId,
      stage: 'stage_4',
      phase: 'complete',
      stepName: 'parameter_propagate',
      inputData: {
        targetStage: 'stage_5',
        parameterTypes: ['generation_guidance', 'pedagogical_patterns'],
      },
      outputData: {
        generation_guidance: analysisResult.generation_guidance,
        pedagogical_patterns: analysisResult.pedagogical_patterns,
        recommended_structure: analysisResult.recommended_structure,
      },
      durationMs: 0,
    });

    return analysisResult;
  } catch (error) {
    // =================================================================
    // ERROR HANDLING (FR-013)
    // =================================================================

    // Check if this is an interrupt (control flow, NOT an error)
    const isInterrupt = isPipelineInterrupt(error);

    // Log at appropriate level - INFO for interrupts, ERROR for real errors
    if (isInterrupt) {
      orchestrationLogger.info(
        {
          code: error.code,
          message: error.message,
          courseId,
          duration_ms: Date.now() - startTime,
        },
        'Stage 4 paused (interrupt)'
      );

      await logTrace({
        courseId,
        stage: 'stage_4',
        phase: 'complete',
        stepName: 'paused',
        inputData: { code: error.code },
        durationMs: Date.now() - startTime,
      });

      // Status is already stage_4_clarifying, just log
      orchestrationLogger.info(
        { courseId },
        'Orchestration paused for clarifying questions - status preserved as stage_4_clarifying'
      );
    } else {
      // Real error - log at ERROR level
      orchestrationLogger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          duration_ms: Date.now() - startTime,
        },
        'Stage 4 analysis orchestration failed'
      );

      await logTrace({
        courseId,
        stage: 'stage_4',
        phase: 'complete',
        stepName: 'failed',
        errorData: { error: error instanceof Error ? error.message : String(error) },
        durationMs: Date.now() - startTime,
      });

      // Only update status to failed for real errors
      const errorMessage = formatErrorMessage(error as Error);
      await updateCourseProgress(courseId, 'failed', 0, errorMessage, supabase);
    }

    // Re-throw error for worker handler to process
    // Worker handler will:
    // 1. Determine error code (BARRIER_FAILED, MINIMUM_LESSONS_NOT_MET, LLM_ERROR)
    // 2. Send notification to technical support via admin panel (FR-013)
    // 3. Mark job as failed with detailed metadata (FR-014)
    // Note: For AWAITING_CLARIFYING_ANSWERS, error-handler returns success:true (no retry)
    throw error;
  }
}

/**
 * Prepare document info for budget allocation
 * Reads token counts from DocumentSummary metadata
 *
 * Note: Since Stage 4 doesn't have document priority classification yet,
 * we use a simple heuristic:
 * - First document (largest) = CORE
 * - Documents with quality_score > 0.7 = IMPORTANT
 * - Remaining documents = SUPPLEMENTARY
 *
 * @param documentSummaries - Document summaries from input
 * @returns Stage4DocumentInfo array with priority classification
 */
async function prepareDocumentInfos(
  documentSummaries: DocumentSummary[] | undefined
): Promise<Stage4DocumentInfo[]> {
  if (!documentSummaries || documentSummaries.length === 0) {
    return [];
  }

  // Sort documents by original_tokens DESC to identify the largest (most comprehensive)
  const sortedDocs = [...documentSummaries].sort(
    (a, b) => b.summary_metadata.original_tokens - a.summary_metadata.original_tokens
  );

  return sortedDocs.map((doc, index) => {
    // Priority heuristic (will be replaced with explicit classification in future tasks)
    let priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
    if (index === 0) {
      // Largest document is CORE
      priority = 'CORE';
    } else if (doc.summary_metadata.quality_score > 0.7) {
      // High quality documents are IMPORTANT
      priority = 'IMPORTANT';
    } else {
      // Others are SUPPLEMENTARY
      priority = 'SUPPLEMENTARY';
    }

    return {
      file_id: doc.document_id,
      priority,
      original_tokens: doc.summary_metadata.original_tokens,
      summary_tokens: doc.summary_metadata.summary_tokens,
      importance_score: doc.summary_metadata.quality_score,
    };
  });
}
