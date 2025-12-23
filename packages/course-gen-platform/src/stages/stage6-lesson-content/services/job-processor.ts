import { Job } from 'bullmq';
import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { resolveLessonUuid } from '@/shared/database/lesson-resolver';
import {
  executeStage6 as executeStage6Orchestrator,
  type Stage6Input,
  type Stage6Output,
} from '../orchestrator';
import { retrieveLessonContext, type LessonRAGResult } from '../utils/lesson-rag-retriever';
import { quickSanityCheck, type SanityCheckResult } from '../utils/sanity-check';
import { createLessonLabel, LessonLabel } from '@megacampus/shared-types';

import { Stage6JobInput, Stage6JobResult, ProgressUpdate, ModelConfig } from '../types';
import { MODEL_FALLBACK } from '../config';
import { getStage6ModelConfig } from './model-service';
import { handlePartialSuccess, markForReview, saveLessonContent } from './database-service';
import { extractContentMarkdown } from './content-utils';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Update job progress for streaming
 */
export async function updateJobProgress(
  job: Job,
  update: ProgressUpdate
): Promise<void> {
  try {
    await job.updateProgress(update);

    logger.debug(
      {
        jobId: job.id,
        phase: update.phase,
        progress: update.progress,
      },
      'Progress update sent'
    );
  } catch (error) {
    logger.warn(
      {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to update job progress'
    );
  }
}

/**
 * Execute Stage 6 orchestrator adapter
 */
async function executeStage6(input: Stage6JobInput): Promise<Stage6Output> {
  const { lessonSpec, courseId, ragChunks, ragContextId, language, modelOverride, userRefinementPrompt } = input;

  const lessonLabel = lessonSpec.lesson_id;
  const lessonUuid = await resolveLessonUuid(courseId, lessonLabel);

  const orchestratorInput: Stage6Input = {
    lessonSpec,
    courseId,
    language,
    lessonUuid,
    ragChunks: ragChunks ?? [],
    ragContextId: ragContextId ?? undefined,
    userRefinementPrompt,
    modelOverride,
  };

  return executeStage6Orchestrator(orchestratorInput);
}

/**
 * Process job with model fallback strategy
 */
export async function processWithFallback(
  job: Job<Stage6JobInput, Stage6JobResult>,
  modelConfig: ModelConfig,
  lessonUuid: string | null,
  ragChunks: any[], // Type import issue, using any for now, ideally RAGChunk[]
  ragContextId: string | null
): Promise<Stage6Output> {
  let lastError: Error | null = null;
  const jobId = job.id ?? 'unknown';

  for (let attempt = 1; attempt <= MODEL_FALLBACK.maxPrimaryAttempts; attempt++) {
    try {
      logger.info(
        {
          jobId,
          model: modelConfig.primary,
          attempt,
          maxAttempts: MODEL_FALLBACK.maxPrimaryAttempts,
        },
        'Attempting with primary model'
      );

      const result = await executeStage6({
        ...job.data,
        lessonUuid,
        ragChunks,
        ragContextId,
        modelOverride: modelConfig.primary,
      });

      if (result.success) {
        return result;
      }

      lastError = new Error(result.errors.join(', ') || 'Unknown generation error');
      logger.warn(
        {
          jobId,
          model: modelConfig.primary,
          attempt,
          errors: result.errors,
        },
        'Primary model attempt returned unsuccessful result'
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(
        {
          jobId,
          model: modelConfig.primary,
          attempt,
          error: lastError.message,
        },
        'Primary model attempt failed with exception'
      );
    }

    if (attempt < MODEL_FALLBACK.maxPrimaryAttempts) {
      const backoffMs = 1000 * Math.pow(2, attempt - 1);
      logger.debug({ jobId, backoffMs }, 'Waiting before retry');
      await sleep(backoffMs);
    }
  }

  logger.info(
    {
      jobId,
      fallbackModel: modelConfig.fallback,
      previousError: lastError?.message,
    },
    'Falling back to secondary model'
  );

  try {
    const result = await executeStage6({
      ...job.data,
      lessonUuid,
      ragChunks,
      ragContextId,
      modelOverride: modelConfig.fallback,
    });

    if (result.success) {
      logger.info(
        {
          jobId,
          fallbackModel: modelConfig.fallback,
        },
        'Fallback model succeeded'
      );
      return result;
    }

    const fallbackError = new Error(
      result.errors.join(', ') || 'Fallback model returned unsuccessful result'
    );
    logger.error(
      {
        jobId,
        fallbackModel: modelConfig.fallback,
        errors: result.errors,
      },
      'Fallback model returned unsuccessful result'
    );
    throw fallbackError;
  } catch (error) {
    const fallbackError = error instanceof Error ? error : new Error(String(error));
    logger.error(
      {
        jobId,
        fallbackModel: modelConfig.fallback,
        error: fallbackError.message,
        primaryError: lastError?.message,
      },
      'Both primary and fallback models failed'
    );

    throw lastError || fallbackError;
  }
}

/**
 * Process a single Stage 6 job
 */
export async function processStage6Job(
  job: Job<Stage6JobInput, Stage6JobResult>
): Promise<Stage6JobResult> {
  const { lessonSpec, courseId, language, userRefinementPrompt: _userRefinementPrompt } = job.data;
  const startTime = Date.now();

  if (!lessonSpec || !lessonSpec.lesson_id || !lessonSpec.sections || !Array.isArray(lessonSpec.sections)) {
    const errorMsg = 'Invalid job input: lessonSpec must have lesson_id and sections array';
    logger.error({ jobId: job.id, lessonSpec }, errorMsg);
    return {
      lessonId: lessonSpec?.lesson_id || 'unknown',
      success: false,
      lessonContent: null,
      errors: [errorMsg],
      metrics: {
        tokensUsed: 0,
        durationMs: Date.now() - startTime,
        modelUsed: null,
        qualityScore: 0,
      },
    };
  }

  let ragChunks: any[] = [];
  let ragContextId: string | null = null;

  try {
    const ragResult: LessonRAGResult = await retrieveLessonContext({
      courseId,
      lessonSpec,
    });
    ragChunks = ragResult.chunks;
    ragContextId = ragResult.lessonId;

    logger.info({
      lessonId: lessonSpec.lesson_id,
      courseId,
      chunksCount: ragChunks.length,
      cached: ragResult.cached,
      coverageScore: ragResult.coverageScore,
      retrievalDurationMs: ragResult.retrievalDurationMs,
    }, 'RAG context retrieved for lesson');
  } catch (error) {
    logger.warn({
      lessonId: lessonSpec.lesson_id,
      courseId,
      error: error instanceof Error ? error.message : String(error),
    }, 'RAG retrieval failed, continuing without context');
  }

  let lessonLabel: LessonLabel;
  try {
    lessonLabel = createLessonLabel(lessonSpec.lesson_id);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      { lessonId: lessonSpec.lesson_id, error: errorMsg },
      'Invalid lesson_id format - cannot process job'
    );
    return {
      lessonId: lessonSpec.lesson_id,
      success: false,
      lessonContent: null,
      errors: ['Invalid lesson_id format: ' + errorMsg],
      metrics: {
        tokensUsed: 0,
        durationMs: Date.now() - startTime,
        modelUsed: null,
        qualityScore: 0,
      },
    };
  }

  const lessonUuid = await resolveLessonUuid(courseId, lessonLabel);
  const modelConfig: ModelConfig = await getStage6ModelConfig(lessonSpec, language);

  const jobLogger = logger.child({
    jobId: job.id,
    lessonId: lessonLabel,
    lessonUuid,
    courseId,
    attempt: job.attemptsMade + 1,
    language,
    primaryModel: modelConfig.primary,
  });

  jobLogger.info(
    {
      lessonTitle: lessonSpec.title,
      sectionsCount: lessonSpec.sections.length,
      ragChunksCount: ragChunks.length,
    },
    'Processing Stage 6 job'
  );

  await logTrace({
    courseId,
    lessonId: lessonUuid || undefined,
    stage: 'stage_6',
    phase: 'init',
    stepName: 'start',
    inputData: {
      lessonLabel,
      lessonTitle: lessonSpec.title,
      ragChunksCount: ragChunks.length,
      ragContextId,
      primaryModel: modelConfig.primary
    },
    durationMs: 0
  });

  await updateJobProgress(job, {
    lessonId: lessonSpec.lesson_id,
    phase: 'planner',
    progress: 0,
    message: 'Starting lesson generation',
  });

  try {
    const result = await processWithFallback(job, modelConfig, lessonUuid, ragChunks, ragContextId);

    const durationMs = Date.now() - startTime;

    let sanityResult: SanityCheckResult = { ok: true };
    if (result.lessonContent) {
      const markdown = extractContentMarkdown(result.lessonContent);
      sanityResult = quickSanityCheck(markdown);

      if (!sanityResult.ok) {
        jobLogger.warn(
          {
            reason: sanityResult.reason,
            metrics: sanityResult.metrics,
            qualityScore: result.metrics.qualityScore,
          },
          'Content failed sanity check (non-blocking warning)'
        );
      } else {
        jobLogger.debug(
          { metrics: sanityResult.metrics },
          'Content passed sanity check'
        );
      }
    }

    await updateJobProgress(job, {
      lessonId: lessonSpec.lesson_id,
      phase: 'complete',
      progress: 100,
      message: result.success ? 'Generation complete' : 'Generation completed with errors',
      tokensUsed: result.metrics.tokensUsed,
    });

    if (result.lessonContent && result.errors.length > 0) {
      if (lessonUuid) {
        await handlePartialSuccess(
          job.id ?? 'unknown',
          courseId,
          lessonUuid,
          lessonLabel,
          result
        );
      } else {
        jobLogger.warn(
          { lessonLabel },
          'Cannot save partial success - lessonUuid not resolved'
        );
      }
    }

    if (result.success && result.lessonContent) {
      await saveLessonContent(courseId, lessonSpec.lesson_id, result, sanityResult);
    }

    jobLogger.info(
      {
        success: result.success,
        durationMs,
        tokensUsed: result.metrics.tokensUsed,
        qualityScore: result.metrics.qualityScore,
        modelUsed: result.metrics.modelUsed,
        hasPartialContent: result.lessonContent !== null && result.errors.length > 0,
      },
      'Stage 6 job processed'
    );

    await logTrace({
      courseId,
      lessonId: lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'complete',
      stepName: 'finish',
      inputData: { lessonLabel },
      outputData: {
        qualityScore: result.metrics.qualityScore,
        modelUsed: result.metrics.modelUsed,
        tokensUsed: result.metrics.tokensUsed
      },
      durationMs
    });

    return {
      lessonId: lessonSpec.lesson_id,
      success: result.success,
      lessonContent: result.lessonContent,
      errors: result.errors,
      metrics: {
        ...result.metrics,
        durationMs,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startTime;

    jobLogger.error(
      {
        error: errorMsg,
        durationMs,
        primaryModel: modelConfig.primary,
        fallbackModel: modelConfig.fallback,
      },
      'Stage 6 job failed after all retry attempts'
    );

    await logTrace({
      courseId,
      lessonId: lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'complete',
      stepName: 'failed',
      inputData: { lessonLabel },
      errorData: { error: errorMsg },
      durationMs
    });

    if (lessonUuid) {
      await markForReview(
        courseId,
        lessonUuid,
        lessonLabel,
        `Generation failed after model fallback: ${errorMsg}`
      );
    } else {
      jobLogger.warn(
        { lessonLabel, errorMsg },
        'Cannot mark for review - lessonUuid not resolved'
      );
    }

    await updateJobProgress(job, {
      lessonId: lessonSpec.lesson_id,
      phase: 'planner',
      progress: 0,
      message: `Generation failed: ${errorMsg}`,
    });

    return {
      lessonId: lessonSpec.lesson_id,
      success: false,
      lessonContent: null,
      errors: [errorMsg],
      metrics: {
        tokensUsed: 0,
        durationMs,
        modelUsed: null,
        qualityScore: 0,
      },
    };
  }
}
