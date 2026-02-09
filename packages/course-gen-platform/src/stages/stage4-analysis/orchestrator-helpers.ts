/**
 * Stage 4 Analysis Orchestrator Helpers
 *
 * Helper functions extracted from orchestrator.ts to comply with ESLint rules.
 * Decomposes the 576-line runAnalysisOrchestration function into sequential phases.
 *
 * @module stages/stage4-analysis/orchestrator-helpers
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@megacampus/shared-types';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { getRedisClient } from '../../shared/cache/redis';
import { assembleAnalysisResult } from './phases/phase-5-assembly';
import {
  updateCourseProgress,
  validateStage3Barrier,
  startPhase,
  completePhase,
  PROGRESS_RANGES,
} from './utils/validators';
import {
  allocateStage4Budget,
  validateStage4Budget,
  type Stage4BudgetAllocation,
  type Stage4DocumentInfo,
} from './phases/stage4-budget-allocator';
import logger from '../../shared/logger';
import { logTrace } from '../../shared/trace-logger';
import type { StructureAnalysisJob } from '@megacampus/shared-types';
import type {
  AnalysisResult,
  Phase1Output,
  Phase2Output,
  Phase3Output,
  Phase4Output,
} from '@megacampus/shared-types/analysis-result';
import type pino from 'pino';
import { validateLocale } from '@/shared/validation';
import { prepareDocumentInfos } from './orchestrator-phase-helpers';

/**
 * Analysis orchestration context
 * Passed between phases to maintain state
 */
export interface AnalysisContext {
  courseId: string;
  organizationId: string;
  userId: string;
  input: StructureAnalysisJob['input'];
  startTime: number;
  supabase: SupabaseClient<Database>;
  orchestrationLogger: pino.Logger;
  budgetAllocation: Stage4BudgetAllocation | null;
  phase1Output?: Phase1Output;
  phase2Output?: Phase2Output;
  phase3Output?: Phase3Output;
  phase4Output?: Phase4Output;
  clarifyingAnswers: Array<{
    question: string;
    answer: string;
    priority: string;
    category: string;
  }>;
}

/**
 * Initialize analysis context and validate prerequisites
 * Phase 0: Pre-flight validation (0-10%)
 */
export async function initializeAnalysis(job: StructureAnalysisJob): Promise<AnalysisContext> {
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

  // Phase 0: Pre-flight validation
  await startPhase(0, courseId, supabase, orchestrationLogger);

  // Stage 3 barrier check
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
    const { BarrierFailedError } = await import('@/shared/errors');
    throw new BarrierFailedError(3, barrierResult.completedFiles, barrierResult.totalFiles);
  }

  await completePhase(0, courseId, supabase, orchestrationLogger, {
    totalFiles: barrierResult.totalFiles,
    completedFiles: barrierResult.completedFiles,
  });

  // Budget allocation
  let budgetAllocation: Stage4BudgetAllocation | null = null;

  if (input.document_summaries && input.document_summaries.length > 0) {
    orchestrationLogger.info('Starting budget allocation');

    const documentInfos: Stage4DocumentInfo[] = prepareDocumentInfos(input.document_summaries);
    budgetAllocation = allocateStage4Budget(documentInfos, validateLocale(input.language));
    validateStage4Budget(budgetAllocation);

    orchestrationLogger.info(
      {
        modelId: budgetAllocation.modelSelection.modelId,
        totalTokens: budgetAllocation.totalTokens,
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
        totalTokens: budgetAllocation.totalTokens,
      },
      durationMs: 0,
    });
  }

  return {
    courseId,
    organizationId: job.organization_id,
    userId: job.user_id,
    input,
    startTime,
    supabase,
    orchestrationLogger,
    budgetAllocation,
    clarifyingAnswers: [],
  };
}

/**
 * Finalize analysis and assemble result
 * Phase 5: Final Assembly (85-100%)
 */
export async function finalizeAnalysis(context: AnalysisContext): Promise<AnalysisResult> {
  const {
    courseId,
    input,
    supabase,
    orchestrationLogger,
    startTime,
    phase1Output,
    phase2Output,
    phase3Output,
    phase4Output,
  } = context;

  if (!phase1Output || !phase2Output || !phase3Output || !phase4Output) {
    throw new Error('All phase outputs required for finalization');
  }

  await startPhase(5, courseId, supabase, orchestrationLogger);

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
    total: 0,
  };
  totalTokens.total = totalTokens.input + totalTokens.output;

  const documentSummariesText = input.document_summaries?.map(ds => ds.processed_content) || null;

  const analysisResult: AnalysisResult = assembleAnalysisResult({
    course_id: courseId,
    language: input.language,
    topic: input.topic,
    document_summaries: documentSummariesText,
    phase1_output: phase1Output,
    phase2_output: phase2Output,
    phase3_output: phase3Output,
    phase4_output: phase4Output,
    phase6_output: null,
    min_lessons: input.min_lessons,
    total_duration_ms: totalDurationMs,
    total_tokens: totalTokens,
    total_cost_usd: 0,
  });

  await completePhase(5, courseId, supabase, orchestrationLogger, {
    total_duration_ms: analysisResult.metadata.total_duration_ms,
    total_tokens: analysisResult.metadata.total_tokens.total,
    total_cost_usd: analysisResult.metadata.total_cost_usd,
    total_lessons: analysisResult.recommended_structure.total_lessons,
    category: analysisResult.course_category.primary,
    research_flags_count: analysisResult.research_flags.length,
  });

  orchestrationLogger.info(
    {
      total_duration_ms: totalDurationMs,
      phases_completed: 5,
    },
    'Stage 4 analysis orchestration completed successfully'
  );

  await logTrace({
    courseId,
    stage: 'stage_4',
    phase: 'complete',
    stepName: 'finish',
    inputData: { courseId },
    outputData: analysisResult,
    costUsd: analysisResult.metadata.total_cost_usd,
    tokensUsed: analysisResult.metadata.total_tokens.total,
    durationMs: totalDurationMs,
  });

  // Log parameter propagation
  await logTrace({
    courseId,
    stage: 'stage_4',
    phase: 'complete',
    stepName: 'parameter_propagate',
    inputData: {
      targetStage: 'stage_5',
      parameterTypes: ['generation_guidance'],
    },
    outputData: {
      generation_guidance: analysisResult.generation_guidance,
      recommended_structure: analysisResult.recommended_structure,
    },
    durationMs: 0,
  });

  // Clean up Phase 1 Redis cache
  const redis = getRedisClient();
  try {
    await redis.del(`phase1_cache:${courseId}`);
  } catch {
    /* non-blocking */
  }

  return analysisResult;
}

// Re-export phase functions for orchestrator.ts
export {
  runClassificationPhase,
  runClarifyingPhase,
  runScopePhase,
  runExpertPhase,
  runSynthesisPhase,
} from './orchestrator-phase-helpers';
