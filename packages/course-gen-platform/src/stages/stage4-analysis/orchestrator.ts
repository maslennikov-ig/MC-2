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

import {
  type AnalysisContext,
  initializeAnalysis,
  runClassificationPhase,
  runClarifyingPhase,
  runScopePhase,
  runExpertPhase,
  runSynthesisPhase,
  finalizeAnalysis,
} from './orchestrator-helpers';
import { updateCourseProgress, formatErrorMessage, validateJobInput } from './utils/validators';
import logger from '../../shared/logger';
import { logTrace } from '../../shared/trace-logger';
import type { StructureAnalysisJob } from '@megacampus/shared-types';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';
import { isPipelineInterrupt } from '@/shared/errors';

/**
 * Main orchestration function for Stage 4 Analysis
 *
 * Executes all 5 phases sequentially with real-time progress tracking.
 * Enforces Stage 3 barrier and minimum 10 lessons constraint.
 *
 * Workflow:
 * 1. Phase 0: Pre-flight validation (Stage 3 barrier check)
 * 2. Budget Allocation: Token budget for document summaries
 * 3. Phase 1: Basic classification (model from database, runs BEFORE Phase 0.5)
 * 4. Phase 0.5: Clarifying questions (enriched with Phase 1 output, may PAUSE for user input)
 * 5. Phase 2: Scope analysis (model from database, minimum 10 lessons validation)
 * 6. Phase 3: Deep expert analysis (model from database)
 * 7. Phase 4: Document synthesis (model from database)
 * 8. Phase 5: Final assembly (no LLM, pure data combination)
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

  // Input validation
  validateJobInput(input);

  try {
    // Initialize analysis context
    const context: AnalysisContext = await initializeAnalysis(job);

    // Phase 1: Basic Classification (12-25%)
    await runClassificationPhase(context);

    // Phase 0.5: Clarifying Questions (25-28%)
    await runClarifyingPhase(context);

    // Phase 2: Scope Analysis (28-45%)
    await runScopePhase(context);

    // Phase 3: Deep Expert Analysis (45-70%)
    await runExpertPhase(context);

    // Phase 4: Document Synthesis (70-85%)
    await runSynthesisPhase(context);

    // Phase 5: Final Assembly (85-100%)
    const analysisResult = await finalizeAnalysis(context);

    return analysisResult;
  } catch (error) {
    // Error handling
    const isInterrupt = isPipelineInterrupt(error);

    if (isInterrupt) {
      logger.info(
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
    } else {
      logger.error(
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

      const errorMessage = formatErrorMessage(error as Error);
      const supabase = await import('../../shared/supabase/admin').then(m => m.getSupabaseAdmin());
      await updateCourseProgress(courseId, 'failed', 0, errorMessage, supabase);
    }

    throw error;
  }
}
