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
  type Stage4TierConfig,
} from './phases/stage4-budget-allocator';
import { createModelConfigService } from '../../shared/llm/model-config-service';
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
import type { DocumentSummaryResult } from './handler-helpers';

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
  originalDocumentSummaries: DocumentSummaryResult[];
  resolvedDocumentSummaries: DocumentSummaryResult[];
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
  let tierConfig: Stage4TierConfig | undefined;

  // Extract DocumentSummaryResult[] early — has stage3_priority from fetchDocumentSummaries
  const originalDocumentSummaries =
    (input.document_summaries as unknown as DocumentSummaryResult[]) || [];

  if (originalDocumentSummaries.length > 0) {
    const withStage3 = originalDocumentSummaries.filter(d => d.stage3_priority != null).length;
    orchestrationLogger.info(
      { documentCount: originalDocumentSummaries.length, withStage3Priority: withStage3 },
      'Starting budget allocation'
    );

    // Fetch tier configs from DB (single source of truth)
    try {
      const modelConfigService = createModelConfigService();
      tierConfig = await modelConfigService.getStage4TierConfigs(validateLocale(input.language));
    } catch (tierErr) {
      orchestrationLogger.warn(
        { error: tierErr instanceof Error ? tierErr.message : String(tierErr) },
        'Failed to load tier configs from DB, Budget Allocator will use hardcoded fallback'
      );
    }

    const documentInfos: Stage4DocumentInfo[] = prepareDocumentInfos(originalDocumentSummaries);

    try {
      budgetAllocation = allocateStage4Budget(
        documentInfos,
        validateLocale(input.language),
        tierConfig
      );
      validateStage4Budget(budgetAllocation);
    } catch (budgetError) {
      orchestrationLogger.error(
        {
          error: budgetError instanceof Error ? budgetError.message : String(budgetError),
          documentCount: documentInfos.length,
          priorities: {
            core: documentInfos.filter(d => d.priority === 'CORE').length,
            important: documentInfos.filter(d => d.priority === 'IMPORTANT').length,
            supplementary: documentInfos.filter(d => d.priority === 'SUPPLEMENTARY').length,
          },
          totalOriginalTokens: documentInfos.reduce((sum, d) => sum + d.original_tokens, 0),
          totalSummaryTokens: documentInfos.reduce((sum, d) => sum + d.summary_tokens, 0),
        },
        'Budget allocation failed'
      );
      throw budgetError;
    }

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
        documentCount: originalDocumentSummaries.length,
        language: input.language,
      },
      outputData: {
        modelId: budgetAllocation.modelSelection.modelId,
        totalTokens: budgetAllocation.totalTokens,
      },
      durationMs: 0,
    });
  }

  // Resolve document content: replace processed_content with markdown_content for full_text documents
  let resolvedDocumentSummaries = originalDocumentSummaries;

  if (budgetAllocation) {
    const { resolveDocumentContent } = await import('./handler-helpers');
    resolvedDocumentSummaries = await resolveDocumentContent(
      budgetAllocation,
      originalDocumentSummaries
    );
    orchestrationLogger.info(
      {
        totalDocs: originalDocumentSummaries.length,
        fullTextDocs: budgetAllocation.documents.filter(d => d.mode === 'full_text').length,
      },
      'Document content resolved with budget allocator decisions'
    );
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
    originalDocumentSummaries,
    resolvedDocumentSummaries,
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

/**
 * Prepare document info for budget allocation
 *
 * Uses Stage 3 LLM-based tournament priorities when available (CORE/IMPORTANT/SUPPLEMENTARY).
 * Falls back to size-based heuristic for backward compatibility when Stage 3 data is missing.
 *
 * Stage 3 priorities are stored in `file_catalog.priority` and propagated via
 * `DocumentSummaryResult.stage3_priority`. This ensures the budget allocator loads
 * full text for the most **relevant** document (by content), not the largest one.
 *
 * @param documentSummaries - Document summaries with optional Stage 3 priority data
 * @returns Array of document info objects for budget allocator
 */
export function prepareDocumentInfos(
  documentSummaries: DocumentSummaryResult[] | undefined
): Stage4DocumentInfo[] {
  if (!documentSummaries || documentSummaries.length === 0) {
    return [];
  }

  const hasStage3Priorities = documentSummaries.some(d => d.stage3_priority != null);

  if (hasStage3Priorities) {
    return prepareWithStage3Priorities(documentSummaries);
  }

  // Fallback: size-based heuristic (backward compatibility for courses without Stage 3 data)
  return prepareWithSizeHeuristic(documentSummaries);
}

const VALID_PRIORITIES = new Set(['CORE', 'IMPORTANT', 'SUPPLEMENTARY']);

function isValidPriority(value: unknown): value is 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY' {
  return typeof value === 'string' && VALID_PRIORITIES.has(value);
}

/**
 * Use Stage 3 LLM-determined priorities.
 * Validates exactly 1 CORE document and all values are valid;
 * falls back to size heuristic if inconsistent.
 */
function prepareWithStage3Priorities(
  documentSummaries: DocumentSummaryResult[]
): Stage4DocumentInfo[] {
  // Validate all priority values are recognized
  const invalidDocs = documentSummaries.filter(d => !isValidPriority(d.stage3_priority));
  if (invalidDocs.length > 0) {
    logger.warn(
      {
        invalidDocs: invalidDocs.map(d => ({
          id: d.document_id,
          priority: d.stage3_priority,
        })),
      },
      'Invalid Stage 3 priority values in database, falling back to size heuristic'
    );
    return prepareWithSizeHeuristic(documentSummaries);
  }

  const coreDocs = documentSummaries.filter(d => d.stage3_priority === 'CORE');

  // Validate: exactly 1 CORE expected from Stage 3 tournament
  if (coreDocs.length !== 1) {
    logger.warn(
      {
        coreCount: coreDocs.length,
        totalDocs: documentSummaries.length,
        priorities: documentSummaries.map(d => ({
          id: d.document_id,
          priority: d.stage3_priority,
        })),
      },
      'Stage 3 priorities inconsistent (expected exactly 1 CORE), falling back to size heuristic'
    );
    return prepareWithSizeHeuristic(documentSummaries);
  }

  return documentSummaries.map(doc => ({
    file_id: doc.document_id,
    priority: doc.stage3_priority as 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY',
    original_tokens: doc.summary_metadata.original_tokens,
    summary_tokens: doc.summary_metadata.summary_tokens,
    importance_score: doc.stage3_importance_score ?? doc.summary_metadata.quality_score,
  }));
}

/**
 * Fallback: assign priorities by document size (largest = CORE).
 * Used when Stage 3 classification data is not available.
 */
function prepareWithSizeHeuristic(
  documentSummaries: DocumentSummaryResult[]
): Stage4DocumentInfo[] {
  const sortedDocs = [...documentSummaries].sort(
    (a, b) => b.summary_metadata.original_tokens - a.summary_metadata.original_tokens
  );

  return sortedDocs.map((doc, index) => {
    let priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
    if (index === 0) {
      priority = 'CORE';
    } else if (doc.summary_metadata.quality_score > 0.7) {
      priority = 'IMPORTANT';
    } else {
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

// Re-export phase functions for orchestrator.ts
export {
  runClassificationPhase,
  runClarifyingPhase,
  runScopePhase,
  runExpertPhase,
  runSynthesisPhase,
} from './orchestrator-phase-helpers';
