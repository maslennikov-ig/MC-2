/**
 * Multi-Phase Analysis Orchestrator
 *
 * Coordinates all 7 phases of Stage 4 Analysis workflow:
 * - Phase 0 (Pre-Flight): Stage 3 barrier validation, input validation (0-10%)
 * - Phase 1: Basic Classification (10-20%)
 * - Phase 2: Scope Analysis (20-35%) - includes minimum 10 lessons check
 * - Phase 3: Deep Expert Analysis (35-60%)
 * - Phase 4: Document Synthesis (60-75%)
 * - Phase 6: RAG Planning (75-85%) - document-to-section mapping for Generation
 * - Phase 5: Final Assembly (85-100%)
 *
 * Key Features:
 * - Real-time progress updates (Russian messages)
 * - Stage 3 barrier enforcement (FR-016)
 * - Minimum 10 lessons validation (FR-015)
 * - OpenRouter failure handling (FR-013)
 * - Extended observability metrics (FR-014)
 * - Multi-model orchestration (FR-017)
 * - RAG planning for 45x cost savings in Generation (Analyze Enhancement)
 *
 * Split from original 555-line file to comply with 300-line constitution principle.
 * Validation logic extracted to analysis-validators.ts.
 *
 * @module analysis-orchestrator
 */

import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { runPhase1Classification } from './phases/phase-1-classifier';
import { runPhase2Scope } from './phases/phase-2-scope';
import { runPhase3Expert } from './phases/phase-3-expert';
import { runPhase4Synthesis } from './phases/phase-4-synthesis';
import { runPhase6RagPlanning } from './phases/phase-6-rag-planning';
import { assembleAnalysisResult } from './phases/phase-5-assembly';
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

/**
 * Main orchestration function for Stage 4 Analysis
 *
 * Executes all 7 phases sequentially with real-time progress tracking.
 * Enforces Stage 3 barrier and minimum 10 lessons constraint.
 *
 * Workflow:
 * 1. Phase 0: Pre-flight validation (Stage 3 barrier check)
 * 2. Phase 1: Basic classification (20B model)
 * 3. Phase 2: Scope analysis (20B model, minimum 10 lessons validation)
 * 4. Phase 3: Deep expert analysis (120B model - ALWAYS)
 * 5. Phase 4: Document synthesis (Adaptive: 20B/120B based on document count)
 * 6. Phase 6: RAG planning (20B model, only if documents exist)
 * 7. Phase 5: Final assembly (no LLM, pure data combination)
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
 *     answers: 'Target audience: government procurement specialists',
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
export async function runAnalysisOrchestration(
  job: StructureAnalysisJob
): Promise<AnalysisResult> {
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
    durationMs: 0
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
      throw new Error(`BARRIER_FAILED: ${barrierResult.errorMessage}`);
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
      budgetAllocation = allocateStage4Budget(documentInfos, input.language as 'ru' | 'en');

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
    // PHASE 1: Basic Classification (10-25%)
    // =================================================================
    await startPhase(1, courseId, supabase, orchestrationLogger);

    const phase1Output: Phase1Output = await runPhase1Classification({
      course_id: courseId,
      language: input.language,
      topic: input.topic,
      answers: input.answers || null,
      document_summaries: input.document_summaries?.map(ds => ({
        document_id: ds.document_id,
        file_name: ds.file_name,
        processed_content: ds.processed_content,
      })) || null,
      target_audience: input.target_audience,
      lesson_duration_minutes: input.lesson_duration_minutes,
    });

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
      tokensUsed: phase1Output.phase_metadata.tokens.input + phase1Output.phase_metadata.tokens.output,
      modelUsed: phase1Output.phase_metadata.model_used,
      durationMs: phase1Output.phase_metadata.duration_ms
    });

    // Log pedagogical_patterns if present (Analyze Enhancement A20)
    if (phase1Output.pedagogical_patterns) {
      orchestrationLogger.info(
        {
          primary_strategy: phase1Output.pedagogical_patterns.primary_strategy,
          theory_practice_ratio: phase1Output.pedagogical_patterns.theory_practice_ratio,
          assessment_types: phase1Output.pedagogical_patterns.assessment_types,
          key_patterns_count: phase1Output.pedagogical_patterns.key_patterns.length,
        },
        'Phase 1: Pedagogical patterns generated'
      );
    }

    // =================================================================
    // PHASE 2: Scope Analysis (25-45%)
    // =================================================================
    await startPhase(2, courseId, supabase, orchestrationLogger);

    const phase2Output: Phase2Output = await runPhase2Scope({
      course_id: courseId,
      language: input.language,
      topic: input.topic,
      answers: input.answers || null,
      document_summaries: input.document_summaries?.map(ds => ds.processed_content) || null,
      phase1_output: phase1Output,
    });

    // Minimum 10 lessons validation happens inside runPhase2Scope (FR-015)

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
      tokensUsed: phase2Output.phase_metadata.tokens.input + phase2Output.phase_metadata.tokens.output,
      modelUsed: phase2Output.phase_metadata.model_used,
      durationMs: phase2Output.phase_metadata.duration_ms
    });

    // =================================================================
    // PHASE 3: Deep Expert Analysis (45-75%)
    // =================================================================
    await startPhase(3, courseId, supabase, orchestrationLogger);

    const documentSummariesText = input.document_summaries?.map(ds => ds.processed_content) || null;

    const phase3Output: Phase3Output = await runPhase3Expert({
      course_id: courseId,
      language: input.language,
      topic: input.topic,
      answers: input.answers || null,
      document_summaries: documentSummariesText,
      phase1_output: phase1Output,
      phase2_output: phase2Output,
    });

    await completePhase(3, courseId, supabase, orchestrationLogger, {
      teaching_style: phase3Output.pedagogical_strategy.teaching_style,
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
      tokensUsed: phase3Output.phase_metadata.tokens.input + phase3Output.phase_metadata.tokens.output,
      modelUsed: phase3Output.phase_metadata.model_used,
      durationMs: phase3Output.phase_metadata.duration_ms
    });

    // =================================================================
    // PHASE 4: Document Synthesis (75-90%)
    // =================================================================
    await startPhase(4, courseId, supabase, orchestrationLogger);

    const phase4Output: Phase4Output = await runPhase4Synthesis({
      course_id: courseId,
      language: input.language,
      topic: input.topic,
      answers: input.answers || null,
      document_summaries: input.document_summaries || null,
      phase1_output: phase1Output,
      phase2_output: phase2Output,
      phase3_output: phase3Output,
    });

    await completePhase(4, courseId, supabase, orchestrationLogger, {
      content_strategy: phase4Output.content_strategy,
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
      tokensUsed: phase4Output.phase_metadata.tokens.input + phase4Output.phase_metadata.tokens.output,
      modelUsed: phase4Output.phase_metadata.model_used,
      durationMs: phase4Output.phase_metadata.duration_ms
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
    // PHASE 6: RAG Planning (75-85%) - CONDITIONAL
    // =================================================================
    // Only run if documents exist (required for RAG mapping)
    let phase6Output: Phase6Output | null = null;

    if (input.document_summaries && input.document_summaries.length > 0) {
      await startPhase(6, courseId, supabase, orchestrationLogger);

      try {
        phase6Output = await runPhase6RagPlanning({
          course_id: courseId,
          language: input.language,
          sections_breakdown: phase2Output.recommended_structure.sections_breakdown,
          document_summaries: input.document_summaries.map(ds => ({
            document_id: ds.document_id,
            file_name: ds.file_name,
            processed_content: ds.processed_content,
          })),
        });

        // Calculate aggregate stats for logging (Analyze Enhancement A20)
        const totalSearchTerms = Object.values(phase6Output.document_relevance_mapping)
          .reduce((sum, mapping) => sum + (mapping.key_search_terms?.length ?? 0), 0);
        const totalTopics = Object.values(phase6Output.document_relevance_mapping)
          .reduce((sum, mapping) => sum + (mapping.expected_topics?.length ?? 0), 0);

        await completePhase(6, courseId, supabase, orchestrationLogger, {
          sections_mapped: Object.keys(phase6Output.document_relevance_mapping).length,
          documents_total: input.document_summaries.length,
          duration_ms: phase6Output.phase_metadata.duration_ms,
          model_used: phase6Output.phase_metadata.model_used,
          total_search_terms: totalSearchTerms,
          total_topics: totalTopics,
        });

        // Get trace data (raw prompt/completion) stored by phase function
        const phase6TraceData = getAndClearTraceData(courseId, 'stage_6_rag_planning');

        await logTrace({
          courseId,
          stage: 'stage_4',
          phase: 'rag_planning',
          stepName: 'rag_planning',
          inputData: { documentsTotal: input.document_summaries.length },
          outputData: phase6Output, // Full phase output for complete visibility
          promptText: phase6TraceData?.promptText,
          completionText: phase6TraceData?.completionText,
          tokensUsed: phase6Output.phase_metadata.tokens.input + phase6Output.phase_metadata.tokens.output,
          modelUsed: phase6Output.phase_metadata.model_used,
          durationMs: phase6Output.phase_metadata.duration_ms
        });

      } catch (phase6Error) {
        // Phase 6 failed - log warning and continue with degraded functionality (Analyze Enhancement A19)
        orchestrationLogger.warn(
          {
            error: phase6Error instanceof Error ? phase6Error.message : String(phase6Error),
            phase: 'stage_6_rag_planning',
          },
          'Phase 6 (RAG Planning) failed - continuing without document_relevance_mapping. Generation will use NAIVE mode instead of SMART mode.'
        );

        await logTrace({
          courseId,
          stage: 'stage_4',
          phase: 'rag_planning',
          stepName: 'rag_planning',
          inputData: { documentsTotal: input.document_summaries.length },
          errorData: { error: phase6Error instanceof Error ? phase6Error.message : String(phase6Error) },
          durationMs: 0
        });

        // Set to null to indicate Phase 6 was attempted but failed
        // (undefined means Phase 6 was skipped due to no documents)
        phase6Output = null;

        // Complete phase with error status
        await completePhase(6, courseId, supabase, orchestrationLogger, {
          error: phase6Error instanceof Error ? phase6Error.message : String(phase6Error),
          fallback_mode: 'NAIVE',
        });
      }
    } else {
      orchestrationLogger.info('Skipping Phase 6 (RAG Planning): No documents available');
    }

    // =================================================================
    // PHASE 5: Final Assembly (85-100%)
    // =================================================================
    await startPhase(5, courseId, supabase, orchestrationLogger);

    // Calculate cumulative metrics
    const totalDurationMs = Date.now() - startTime;
    const totalTokens = {
      input:
        phase1Output.phase_metadata.tokens.input +
        phase2Output.phase_metadata.tokens.input +
        phase3Output.phase_metadata.tokens.input +
        phase4Output.phase_metadata.tokens.input +
        (phase6Output?.phase_metadata.tokens.input || 0),
      output:
        phase1Output.phase_metadata.tokens.output +
        phase2Output.phase_metadata.tokens.output +
        phase3Output.phase_metadata.tokens.output +
        phase4Output.phase_metadata.tokens.output +
        (phase6Output?.phase_metadata.tokens.output || 0),
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
      answers: input.answers || null,
      document_summaries: documentSummariesText,
      phase1_output: phase1Output,
      phase2_output: phase2Output,
      phase3_output: phase3Output,
      phase4_output: phase4Output,
      phase6_output: phase6Output,
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
        phases_completed: phase6Output ? 7 : 6,
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
      durationMs: totalDurationMs
    });

    return analysisResult;

  } catch (error) {
    // =================================================================
    // ERROR HANDLING (FR-013)
    // =================================================================
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
      durationMs: Date.now() - startTime
    });

    // Update course progress to failed state
    const errorMessage = formatErrorMessage(error as Error);

    await updateCourseProgress(courseId, 'failed', 0, errorMessage, supabase);

    // Re-throw error for worker handler to process
    // Worker handler will:
    // 1. Determine error code (BARRIER_FAILED, MINIMUM_LESSONS_NOT_MET, LLM_ERROR)
    // 2. Send notification to technical support via admin panel (FR-013)
    // 3. Mark job as failed with detailed metadata (FR-014)
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
