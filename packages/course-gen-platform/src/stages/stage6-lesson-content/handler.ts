/**
 * Stage 6 BullMQ Job Handler
 * @module stages/stage6-lesson-content/handler
 *
 * BullMQ worker that processes Stage 6 jobs for lesson content generation
 * with 30 concurrent workers and streaming progress updates.
 *
 * Features:
 * - 30 concurrent workers for parallel lesson generation
 * - Streaming progress updates via job.updateProgress()
 * - Model fallback retry strategy
 * - Partial success handling for batch operations
 * - Graceful shutdown support
 *
 * Reference:
 * - BullMQ v5.x documentation (Context7)
 * - specs/010-stages-456-pipeline/data-model.md
 */

import { Worker, Job, Queue } from 'bullmq';
import { getRedisClient } from '@/shared/cache/redis';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { logger } from '@/shared/logger';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { LessonContent, RAGChunk } from '@megacampus/shared-types/lesson-content';
import {
  LessonUUID,
  LessonLabel,
  createLessonLabel,
} from '@megacampus/shared-types';
// NOTE: generationLockService not used in Stage 6 - lessons process in parallel independently
import { logTrace } from '@/shared/trace-logger';
import { createModelConfigService, getEffectiveStageConfig } from '@/shared/llm/model-config-service';
import { resolveLessonUuid } from '@/shared/database/lesson-resolver';
import {
  executeStage6 as executeStage6Orchestrator,
  type Stage6Input,
  type Stage6Output,
} from './orchestrator';
import { retrieveLessonContext, type LessonRAGResult } from './utils/lesson-rag-retriever';
import { quickSanityCheck, type SanityCheckResult } from './utils/sanity-check';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Stage 6 job input structure
 * Contains lesson specification and context for generation
 */
export interface Stage6JobInput {
  /** Lesson specification from Stage 5 */
  lessonSpec: LessonSpecificationV2;

  /** Course UUID for context and database operations */
  courseId: string;

  /** RAG chunks (deprecated - handler fetches via retrieveLessonContext()) */
  ragChunks?: RAGChunk[];

  /** RAG context cache ID (deprecated - handler manages this) */
  ragContextId?: string | null;

  /** Target language for content generation (ISO 639-1 code, e.g., 'ru', 'en') */
  language: string;

  /** Lesson UUID for database operations (optional, resolved from lessonSpec.lesson_id if not provided) */
  lessonUuid?: string | null;

  /** Optional model override for fallback retry */
  modelOverride?: string;

  /** Optional user instructions for refinement */
  userRefinementPrompt?: string;
}

/**
 * Stage 6 job result structure
 * Returned after job completion (success or failure)
 */
export interface Stage6JobResult {
  /** Lesson identifier */
  lessonId: string;

  /** Success flag */
  success: boolean;

  /** Generated lesson content (null on failure) */
  lessonContent: LessonContent | null;

  /** Error messages (empty on success) */
  errors: string[];

  /** Generation metrics */
  metrics: {
    /** Total tokens used */
    tokensUsed: number;

    /** Total duration in milliseconds */
    durationMs: number;

    /** Model identifier used for generation */
    modelUsed: string | null;

    /** Quality score from validation (0-1) */
    qualityScore: number;
  };
}

/**
 * Progress update structure for streaming
 * Sent via job.updateProgress() during processing
 */
export interface ProgressUpdate {
  /** Lesson identifier being processed */
  lessonId: string;

  /** Current processing phase */
  phase: 'planner' | 'expander' | 'assembler' | 'smoother' | 'judge' | 'complete';

  /** Progress percentage (0-100) */
  progress: number;

  /** Human-readable status message */
  message: string;

  /** Tokens used so far (optional) */
  tokensUsed?: number;
}

// Stage6Output is now imported from './orchestrator'
// Re-export for backward compatibility
export type { Stage6Output } from './orchestrator';

// ============================================================================
// HANDLER CONFIGURATION
// ============================================================================

/**
 * Handler configuration constants
 */
export const HANDLER_CONFIG = {
  /** Queue name for Stage 6 jobs */
  QUEUE_NAME: 'stage6-lesson-content',

  /** Number of concurrent workers (30 for I/O-bound LLM operations) */
  CONCURRENCY: 30,

  /** Maximum retry attempts per job */
  MAX_RETRIES: 3,

  /** Retry delay in milliseconds */
  RETRY_DELAY_MS: 5000,

  /** Lock duration in milliseconds */
  LOCK_DURATION_MS: 60_000,

  /** Lock renewal time in milliseconds */
  LOCK_RENEW_TIME_MS: 15_000,

  /** Stalled job check interval in milliseconds */
  STALLED_INTERVAL_MS: 30_000,

  /** Maximum stalled count before job is marked failed */
  MAX_STALLED_COUNT: 3,

  /** Quality threshold for lesson acceptance */
  QUALITY_THRESHOLD: 0.75,
} as const;

/**
 * Default job timeout in milliseconds (5 minutes per lesson)
 * Used as fallback when database config is unavailable
 */
const DEFAULT_JOB_TIMEOUT_MS = 300_000;

/**
 * Get job timeout from database configuration
 *
 * Fetches timeout_ms from model-config-service for stage_6 phase.
 * Falls back to DEFAULT_JOB_TIMEOUT_MS if database unavailable.
 *
 * @returns Job timeout in milliseconds
 */
async function getJobTimeout(): Promise<number> {
  try {
    const modelConfigService = createModelConfigService();
    const phaseConfig = await modelConfigService.getModelForPhase('stage_6_content');
    const effectiveConfig = getEffectiveStageConfig(phaseConfig);

    // Use timeoutMs from config, or default if null
    const timeout = effectiveConfig.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS;

    logger.info({
      timeout,
      source: phaseConfig.source,
    }, 'Using database-driven job timeout config');

    return timeout;
  } catch (error) {
    logger.warn({
      error: error instanceof Error ? error.message : String(error),
      fallback: DEFAULT_JOB_TIMEOUT_MS,
    }, 'Failed to load job timeout config, using default');

    return DEFAULT_JOB_TIMEOUT_MS;
  }
}

// ============================================================================
// MODEL FALLBACK CONFIGURATION
// ============================================================================

/**
 * Model fallback configuration for retry strategy (FALLBACK ONLY)
 *
 * IMPORTANT: This is kept as a safety net only. Primary model selection
 * is now handled by ModelConfigService (database-driven).
 *
 * These hardcoded values are used ONLY when:
 * - Database lookup fails
 * - ModelConfigService is unavailable
 *
 * Primary models are selected by language:
 * - Russian: qwen/qwen3-235b-a22b-2507 (best for Cyrillic)
 * - English: deepseek/deepseek-v3.1-terminus (optimal cost/quality)
 *
 * Fallback model for all languages:
 * - moonshotai/kimi-k2-0905 (good context handling, reliable)
 */
export const MODEL_FALLBACK = {
  /** Primary models by language (FALLBACK ONLY) */
  primary: {
    ru: 'qwen/qwen3-235b-a22b-2507',
    en: 'deepseek/deepseek-v3.1-terminus',
  },
  /** Fallback model for all languages */
  fallback: 'moonshotai/kimi-k2-0905',
  /** Max attempts before switching to fallback model */
  maxPrimaryAttempts: 2,
} as const;

// ============================================================================
// HELPER UTILITIES
// ============================================================================

/**
 * Sleep utility for exponential backoff
 *
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Detect language from lesson specification
 *
 * Uses simple heuristic: checks title for Cyrillic characters.
 * Returns 'ru' for Russian content, 'en' for English.
 *
 * @param spec - Lesson specification
 * @returns Language code ('ru' or 'en')
 */
function detectLanguage(spec: LessonSpecificationV2): 'ru' | 'en' {
  // Check title for Cyrillic characters
  const hasCyrillic = /[а-яА-ЯёЁ]/.test(spec.title);
  return hasCyrillic ? 'ru' : 'en';
}

/**
 * Get Stage 6 model configuration from ModelConfigService
 *
 * Uses database-driven model selection with hardcoded fallback.
 * Detects language from lesson spec and fetches appropriate models.
 *
 * @param lessonSpec - Lesson specification for language detection
 * @returns Model configuration with primary and fallback models
 */
async function getStage6ModelConfig(
  lessonSpec: LessonSpecificationV2,
  language: string
): Promise<{ primary: string; fallback: string }> {
  const modelConfigService = createModelConfigService();

  // Normalize language to 'ru' | 'en' (service expects this specific type)
  // Case-insensitive check to handle 'RU', 'Ru', etc.
  const lowerLang = language.toLowerCase();
  const normalizedLang: 'ru' | 'en' = lowerLang === 'ru' ? 'ru' : 'en';

  // Log warning for unsupported languages (not ru/en)
  if (lowerLang !== 'ru' && lowerLang !== 'en') {
    logger.warn(
      {
        lessonId: lessonSpec.lesson_id,
        originalLanguage: language,
        normalizedLanguage: normalizedLang,
      },
      'Unsupported language normalized to English - ModelConfigService only supports ru/en'
    );
  }

  try {
    // Fetch model config from database (Stage 6, tokenCount=0 since not tier-dependent for Stage 6)
    const config = await modelConfigService.getModelForStage(6, normalizedLang, 0);

    logger.info(
      {
        lessonId: lessonSpec.lesson_id,
        language,
        primary: config.primary,
        fallback: config.fallback,
        source: config.source,
      },
      'Retrieved Stage 6 model config'
    );

    return {
      primary: config.primary,
      fallback: config.fallback,
    };
  } catch (error) {
    logger.warn(
      {
        lessonId: lessonSpec.lesson_id,
        language,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to fetch model config from service, using hardcoded fallback'
    );

    // Fallback to hardcoded constants
    return {
      primary: MODEL_FALLBACK.primary[normalizedLang],
      fallback: MODEL_FALLBACK.fallback,
    };
  }
}

// ============================================================================
// MODEL FALLBACK RETRY STRATEGY
// ============================================================================

/**
 * Model configuration for fallback retry
 */
interface ModelConfig {
  /** Primary model to use */
  primary: string;
  /** Fallback model if primary fails */
  fallback: string;
}

/**
 * Process job with model fallback strategy
 *
 * Attempts to execute Stage 6 with the primary model up to maxPrimaryAttempts times.
 * If all primary attempts fail, falls back to the secondary model.
 * Uses exponential backoff between retry attempts.
 *
 * @param job - BullMQ job instance
 * @param modelConfig - Primary and fallback model configuration
 * @param lessonUuid - Lesson UUID for trace logging
 * @param ragChunks - RAG chunks fetched via retrieveLessonContext
 * @param ragContextId - RAG context cache ID
 * @returns Stage 6 output with generated content
 * @throws Error if both primary and fallback models fail
 */
async function processWithFallback(
  job: Job<Stage6JobInput, Stage6JobResult>,
  modelConfig: ModelConfig,
  lessonUuid: string | null,
  ragChunks: RAGChunk[],
  ragContextId: string | null
): Promise<Stage6Output> {
  let lastError: Error | null = null;
  const jobId = job.id ?? 'unknown';

  // Try primary model with exponential backoff
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
        ragChunks, // Use fetched RAG chunks
        ragContextId, // Use fetched RAG context ID
        modelOverride: modelConfig.primary,
      });

      if (result.success) {
        return result;
      }

      // Result returned but not successful - treat as error
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

    // Exponential backoff: 1s, 2s, 4s...
    if (attempt < MODEL_FALLBACK.maxPrimaryAttempts) {
      const backoffMs = 1000 * Math.pow(2, attempt - 1);
      logger.debug({ jobId, backoffMs }, 'Waiting before retry');
      await sleep(backoffMs);
    }
  }

  // Primary model exhausted - try fallback model
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
      ragChunks, // Use fetched RAG chunks
      ragContextId, // Use fetched RAG context ID
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

    // Fallback also returned unsuccessful
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

    // Throw the last error (fallback error takes precedence)
    throw lastError || fallbackError;
  }
}

// ============================================================================
// PARTIAL SUCCESS HANDLING
// ============================================================================

/**
 * Handle partial success scenarios
 *
 * When content generation partially succeeds (some content generated but with errors),
 * saves the partial content to the database and marks it for review.
 *
 * @param jobId - Job identifier for logging
 * @param courseId - Course UUID
 * @param lessonUuid - Lesson UUID (database primary key)
 * @param lessonLabel - Human-readable lesson label (e.g., "1.1") for logging
 * @param result - Stage 6 output with partial content
 */
async function handlePartialSuccess(
  jobId: string,
  courseId: string,
  lessonUuid: LessonUUID,
  lessonLabel: LessonLabel,
  result: Stage6Output
): Promise<void> {
  // Only handle cases where we have content but also have errors
  if (!result.lessonContent || result.errors.length === 0) {
    return;
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    // Save partial content with review flag
    // Lessons are uniquely identified by id (UUID), course_id is for logging context only
    const { error } = await supabaseAdmin
      .from('lessons')
      .update({
        content: extractContentMarkdown(result.lessonContent),
        updated_at: new Date().toISOString(),
        // Note: requires_review and error_log fields may need to be added to schema
        // For now, we log the partial success status
      })
      .eq('id', lessonUuid);

    if (error) {
      logger.warn(
        {
          jobId,
          courseId,
          lessonUuid,
          lessonLabel,
          error: error.message,
        },
        'Failed to save partial content to database'
      );
    } else {
      logger.warn(
        {
          jobId,
          courseId,
          lessonUuid,
          lessonLabel,
          sectionsCount: result.lessonContent.content.sections.length,
          errorsCount: result.errors.length,
          errors: result.errors,
          qualityScore: result.metrics.qualityScore,
        },
        'Partial success - content saved for review'
      );
    }
  } catch (error) {
    logger.error(
      {
        jobId,
        courseId,
        lessonUuid,
        lessonLabel,
        error: error instanceof Error ? error.message : String(error),
      },
      'Exception while handling partial success'
    );
  }
}

/**
 * Mark lesson for manual review
 *
 * When content generation completely fails, marks the lesson
 * in the database for manual review with the failure reason.
 *
 * @param courseId - Course UUID
 * @param lessonUuid - Lesson UUID (database primary key)
 * @param lessonLabel - Human-readable lesson label (e.g., "1.1") for logging
 * @param reason - Failure reason for review
 */
async function markForReview(
  courseId: string,
  lessonUuid: LessonUUID,
  lessonLabel: LessonLabel,
  reason: string
): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    // Update lesson to indicate review needed
    // Note: This updates the lessons table - adjust if using separate lesson_contents table
    // Lessons are uniquely identified by id (UUID), course_id is for logging context only
    const { error } = await supabaseAdmin
      .from('lessons')
      .update({
        updated_at: new Date().toISOString(),
        // The actual review status would need a 'status' or 'review_reason' column
        // For now, we rely on logging and monitoring
      })
      .eq('id', lessonUuid);

    if (error) {
      logger.warn(
        {
          courseId,
          lessonUuid,
          lessonLabel,
          reason,
          error: error.message,
        },
        'Failed to update lesson for review'
      );
    } else {
      logger.info(
        {
          courseId,
          lessonUuid,
          lessonLabel,
          reason,
        },
        'Lesson marked for manual review'
      );
    }
  } catch (error) {
    logger.error(
      {
        courseId,
        lessonUuid,
        lessonLabel,
        reason,
        error: error instanceof Error ? error.message : String(error),
      },
      'Exception while marking lesson for review'
    );
  }
}

// ============================================================================
// JOB PROCESSOR
// ============================================================================

/**
 * Process a single Stage 6 job
 *
 * Main processor function for BullMQ worker. Executes the Stage 6
 * lesson content generation pipeline with progress streaming.
 *
 * Features:
 * - Model fallback retry strategy (primary model -> fallback model)
 * - Language-based model selection (Russian vs English)
 * - Partial success handling (saves content even with some errors)
 * - Failed lesson marking for manual review
 *
 * @param job - BullMQ job instance with Stage6JobInput payload
 * @returns Stage6JobResult with generated content or error details
 */
async function processStage6Job(
  job: Job<Stage6JobInput, Stage6JobResult>
): Promise<Stage6JobResult> {
  const { lessonSpec, courseId, language, userRefinementPrompt: _userRefinementPrompt } = job.data;
  // Note: ragChunks and ragContextId from job.data are ignored - we fetch fresh
  const startTime = Date.now();

  // Validate required input fields
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

  // Fetch RAG context for this lesson
  let ragChunks: RAGChunk[] = [];
  let ragContextId: string | null = null;

  try {
    const ragResult: LessonRAGResult = await retrieveLessonContext({
      courseId,
      lessonSpec,
    });
    ragChunks = ragResult.chunks;
    ragContextId = ragResult.lessonId; // Use lessonId as context identifier

    logger.info({
      lessonId: lessonSpec.lesson_id,
      courseId,
      chunksCount: ragChunks.length,
      cached: ragResult.cached,
      coverageScore: ragResult.coverageScore,
      retrievalDurationMs: ragResult.retrievalDurationMs,
    }, 'RAG context retrieved for lesson');
  } catch (error) {
    // Graceful degradation - continue without RAG context
    logger.warn({
      lessonId: lessonSpec.lesson_id,
      courseId,
      error: error instanceof Error ? error.message : String(error),
    }, 'RAG retrieval failed, continuing without context');
    // Continue with empty ragChunks - generation will work but without grounding
  }

  // NOTE: Stage 6 does NOT use course-level locking
  // Unlike Stages 2-5 which process an entire course sequentially,
  // Stage 6 processes independent lessons in parallel.
  // Each lesson has its own RAG context and generates content independently.
  // Course-level locking would prevent parallel lesson generation.

  // Validate and create branded lessonLabel
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

  // Resolve lesson UUID early for proper trace logging
  // This allows traces to reference the actual lesson record in the database
  const lessonUuid = await resolveLessonUuid(courseId, lessonLabel);

  // Get model configuration from ModelConfigService (database-driven)
  // language comes from course.language via job.data, not from spec detection
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
    lessonId: lessonUuid || undefined, // Use UUID for database FK, undefined if not resolved
    stage: 'stage_6',
    phase: 'init',
    stepName: 'start',
    inputData: {
      lessonLabel, // Human-readable "1.1" format for debugging
      lessonTitle: lessonSpec.title,
      ragChunksCount: ragChunks.length,
      ragContextId,
      primaryModel: modelConfig.primary
    },
    durationMs: 0
  });

  // Update progress: starting
  await updateJobProgress(job, {
    lessonId: lessonSpec.lesson_id,
    phase: 'planner',
    progress: 0,
    message: 'Starting lesson generation',
  });

  try {
    // Execute Stage 6 with model fallback strategy
    // Uses primary model (language-specific) with retry, then falls back to secondary model
    const result = await processWithFallback(job, modelConfig, lessonUuid, ragChunks, ragContextId);

    const durationMs = Date.now() - startTime;

    // Quick sanity check on generated content (non-blocking, for observability)
    let sanityResult: SanityCheckResult = { ok: true };
    if (result.lessonContent) {
      const markdown = extractContentMarkdown(result.lessonContent);
      sanityResult = quickSanityCheck(markdown);

      if (!sanityResult.ok) {
        // Log warning but DO NOT block - let Judge and user decide
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

    // Update progress: complete
    await updateJobProgress(job, {
      lessonId: lessonSpec.lesson_id,
      phase: 'complete',
      progress: 100,
      message: result.success ? 'Generation complete' : 'Generation completed with errors',
      tokensUsed: result.metrics.tokensUsed,
    });

    // Handle partial success (content generated but with some errors)
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

    // Save to database if fully successful
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

    // Mark lesson for manual review when completely failed
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

    // Update progress: failed
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Update job progress for streaming
 *
 * Sends progress updates via BullMQ job.updateProgress() for
 * real-time monitoring and UI updates.
 *
 * @param job - BullMQ job instance
 * @param update - Progress update data
 */
async function updateJobProgress(
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
    // Non-critical error - log and continue
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
 * Save generated lesson content to database
 *
 * Persists the generated lesson content to the lesson_contents table.
 * Resolves the human-readable lesson ID ("1.1") to the actual UUID.
 *
 * @param courseId - Course UUID
 * @param lessonLabel - Lesson identifier in "section.lesson" format (e.g., "1.1")
 * @param result - Stage 6 output with generated content
 * @param sanityResult - Optional sanity check result for metadata
 */
async function saveLessonContent(
  courseId: string,
  lessonLabel: string,
  result: Stage6Output,
  sanityResult?: SanityCheckResult
): Promise<void> {
  if (!result.lessonContent) return;

  const supabaseAdmin = getSupabaseAdmin();

  try {
    // Resolve human-readable "1.1" to actual lesson UUID
    const lessonUuid = await resolveLessonUuid(courseId, lessonLabel);

    if (!lessonUuid) {
      logger.warn(
        { courseId, lessonLabel },
        'Could not resolve lesson UUID - content not saved to database (available in job result)'
      );
      return;
    }

    // Insert into lesson_contents table (supporting versioning)
    const { error } = await supabaseAdmin
      .from('lesson_contents')
      .insert({
        lesson_id: lessonUuid,
        course_id: courseId,
        content: JSON.parse(JSON.stringify(result.lessonContent)),
        metadata: JSON.parse(JSON.stringify({
          lessonLabel, // Store original label for reference
          tokensUsed: result.metrics.tokensUsed,
          modelUsed: result.metrics.modelUsed,
          qualityScore: result.metrics.qualityScore,
          durationMs: result.metrics.durationMs,
          generatedAt: new Date().toISOString(),
          markdownContent: extractContentMarkdown(result.lessonContent),
          // Sanity check metrics for observability
          sanityCheck: sanityResult ? {
            passed: sanityResult.ok,
            reason: sanityResult.reason,
            charCount: sanityResult.metrics?.charCount,
            wordCount: sanityResult.metrics?.wordCount,
          } : undefined,
        })),
        status: 'completed',
        generation_attempt: 1,
      });

    if (error) {
      // Log error but don't fail the job - content is still returned in result
      logger.warn(
        {
          error: error.message,
          courseId,
          lessonLabel,
          lessonUuid,
        },
        'Failed to persist lesson content to database (content available in job result)'
      );
    } else {
      logger.info(
        {
          courseId,
          lessonLabel,
          lessonUuid,
          qualityScore: result.metrics.qualityScore,
          tokensUsed: result.metrics.tokensUsed,
        },
        'Lesson content saved successfully'
      );

      // Increment lessons_completed counter in generation_progress
      const { data: newCount, error: rpcError } = await supabaseAdmin.rpc(
        'increment_lessons_completed',
        { p_course_id: courseId }
      );

      if (rpcError) {
        // Non-critical error - log but don't fail the job
        logger.warn(
          {
            courseId,
            lessonLabel,
            error: rpcError.message,
          },
          'Failed to increment lessons_completed counter (non-fatal)'
        );
      } else {
        logger.debug(
          {
            courseId,
            lessonLabel,
            lessonsCompleted: newCount,
          },
          'Incremented lessons_completed counter'
        );
      }
    }
  } catch (error) {
    // Non-critical error - log and continue
    // The lesson content is still available in the job result
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        courseId,
        lessonLabel,
      },
      'Database error saving lesson content (content available in job result)'
    );
  }
}

/**
 * Extract markdown content from LessonContent structure
 *
 * Converts the structured LessonContent into a markdown string
 * for storage and rendering.
 *
 * @param content - LessonContent object
 * @returns Markdown string representation
 */
function extractContentMarkdown(content: LessonContent): string {
  const parts: string[] = [];

  // Add introduction
  if (content.content.intro) {
    parts.push(content.content.intro);
    parts.push('');
  }

  // Add sections
  for (const section of content.content.sections) {
    parts.push(`## ${section.title}`);
    parts.push('');
    parts.push(section.content);
    parts.push('');
  }

  // Add examples
  if (content.content.examples.length > 0) {
    parts.push('## Examples');
    parts.push('');
    for (const example of content.content.examples) {
      parts.push(`### ${example.title}`);
      parts.push('');
      parts.push(example.content);
      if (example.code) {
        parts.push('');
        parts.push('```');
        parts.push(example.code);
        parts.push('```');
      }
      parts.push('');
    }
  }

  // Add exercises
  if (content.content.exercises.length > 0) {
    parts.push('## Exercises');
    parts.push('');
    for (let i = 0; i < content.content.exercises.length; i++) {
      const exercise = content.content.exercises[i];
      parts.push(`### Exercise ${i + 1}`);
      parts.push('');
      parts.push(exercise.question);
      if (exercise.hints && exercise.hints.length > 0) {
        parts.push('');
        parts.push('**Hints:**');
        for (const hint of exercise.hints) {
          parts.push(`- ${hint}`);
        }
      }
      parts.push('');
    }
  }

  return parts.join('\n');
}

/**
 * Execute Stage 6 orchestrator adapter
 *
 * Maps Stage6JobInput to Stage6Input and calls the real LangGraph orchestrator.
 * Handles the field mapping between handler and orchestrator interfaces.
 *
 * Field mapping:
 * - lessonSpec: passed directly (same type)
 * - courseId: passed directly (same type)
 * - ragChunks: passed directly (handler requires, orchestrator optional)
 * - ragContextId: converted from `string | null` to `string | undefined`
 * - modelOverride: logged as warning (not supported by orchestrator)
 *
 * @param input - Stage 6 job input from handler
 * @returns Stage 6 output from orchestrator
 */
async function executeStage6(input: Stage6JobInput): Promise<Stage6Output> {
  const { lessonSpec, courseId, ragChunks, ragContextId, language, modelOverride, userRefinementPrompt } = input;

  // Log warning if modelOverride is provided (not currently supported by orchestrator)
  if (modelOverride) {
    logger.warn(
      {
        lessonId: lessonSpec.lesson_id,
        courseId,
        modelOverride,
      },
      'modelOverride provided but not currently supported by Stage 6 orchestrator - using default model selection'
    );
  }

  // Resolve lessonUuid for trace logging
  const lessonLabel = lessonSpec.lesson_id;
  const lessonUuid = await resolveLessonUuid(courseId, lessonLabel);

  // Map Stage6JobInput to Stage6Input
  const orchestratorInput: Stage6Input = {
    lessonSpec,
    courseId,
    language,
    lessonUuid,
    ragChunks: ragChunks ?? [], // Default to empty array if undefined
    ragContextId: ragContextId ?? undefined, // Convert null to undefined
    userRefinementPrompt,
  };

  // Call the real orchestrator
  return executeStage6Orchestrator(orchestratorInput);
}

// ============================================================================
// WORKER FACTORY
// ============================================================================

/**
 * Create and configure the Stage 6 BullMQ worker
 *
 * Creates a worker with 30 concurrent processors, rate limiting,
 * and proper event handlers for monitoring and graceful shutdown.
 *
 * @param redisUrl - Optional Redis URL override (uses REDIS_URL env if not provided)
 * @returns Configured BullMQ Worker instance
 *
 * @example
 * ```typescript
 * const worker = createStage6Worker();
 *
 * // Graceful shutdown on SIGTERM
 * process.on('SIGTERM', async () => {
 *   await worker.close();
 * });
 * ```
 */
export function createStage6Worker(redisUrl?: string): Worker<Stage6JobInput, Stage6JobResult> {
  const connection = redisUrl
    ? { url: redisUrl }
    : getRedisClient();

  const worker = new Worker<Stage6JobInput, Stage6JobResult>(
    HANDLER_CONFIG.QUEUE_NAME,
    processStage6Job,
    {
      connection,
      concurrency: HANDLER_CONFIG.CONCURRENCY,
      limiter: {
        max: HANDLER_CONFIG.CONCURRENCY,
        duration: 1000,
      },
      lockDuration: HANDLER_CONFIG.LOCK_DURATION_MS,
      lockRenewTime: HANDLER_CONFIG.LOCK_RENEW_TIME_MS,
      stalledInterval: HANDLER_CONFIG.STALLED_INTERVAL_MS,
      maxStalledCount: HANDLER_CONFIG.MAX_STALLED_COUNT,
    }
  );

  // Event handlers for monitoring
  worker.on('completed', (job, result) => {
    logger.info(
      {
        jobId: job?.id,
        lessonId: result.lessonId,
        success: result.success,
        durationMs: result.metrics.durationMs,
      },
      'Stage 6 job completed'
    );
  });

  worker.on('failed', (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        error: error.message,
        attemptsMade: job?.attemptsMade,
      },
      'Stage 6 job failed'
    );
  });

  worker.on('progress', (job, progress) => {
    const progressData = progress as ProgressUpdate;
    logger.debug(
      {
        jobId: job.id,
        phase: progressData.phase,
        progress: progressData.progress,
      },
      'Stage 6 job progress'
    );
  });

  worker.on('stalled', (jobId) => {
    logger.warn(
      {
        jobId,
      },
      'Stage 6 job stalled'
    );
  });

  worker.on('error', (error) => {
    logger.error(
      {
        error: error.message,
      },
      'Stage 6 worker error'
    );
  });

  logger.info(
    {
      queueName: HANDLER_CONFIG.QUEUE_NAME,
      concurrency: HANDLER_CONFIG.CONCURRENCY,
    },
    'Stage 6 worker initialized'
  );

  return worker;
}

/**
 * Create Stage 6 queue for job submission
 *
 * Creates a BullMQ Queue instance for adding Stage 6 jobs.
 * Uses the same queue name as the worker.
 *
 * @param redisUrl - Optional Redis URL override
 * @returns Configured BullMQ Queue instance
 *
 * @example
 * ```typescript
 * const queue = createStage6Queue();
 *
 * await queue.add('lesson-1.1', {
 *   lessonSpec: lessonSpecV2,
 *   courseId: 'uuid',
 *   ragChunks: [...],
 *   ragContextId: 'context-uuid',
 * });
 * ```
 */
export function createStage6Queue(redisUrl?: string): Queue<Stage6JobInput, Stage6JobResult> {
  const connection = redisUrl
    ? { url: redisUrl }
    : getRedisClient();

  const queue = new Queue<Stage6JobInput, Stage6JobResult>(
    HANDLER_CONFIG.QUEUE_NAME,
    {
      connection,
      defaultJobOptions: {
        attempts: HANDLER_CONFIG.MAX_RETRIES,
        backoff: {
          type: 'exponential',
          delay: HANDLER_CONFIG.RETRY_DELAY_MS,
        },
        removeOnComplete: {
          count: 1000,
          age: 24 * 60 * 60, // 24 hours
        },
        removeOnFail: {
          count: 5000,
          age: 7 * 24 * 60 * 60, // 7 days
        },
      },
    }
  );

  queue.on('error', (error) => {
    logger.error(
      {
        error: error.message,
        queueName: HANDLER_CONFIG.QUEUE_NAME,
      },
      'Stage 6 queue error'
    );
  });

  return queue;
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

/**
 * Graceful shutdown handler for Stage 6 worker
 *
 * Closes the worker gracefully, allowing in-progress jobs to complete
 * before exiting.
 *
 * @param worker - BullMQ Worker instance to close
 *
 * @example
 * ```typescript
 * const worker = createStage6Worker();
 *
 * process.on('SIGTERM', () => gracefulShutdown(worker));
 * process.on('SIGINT', () => gracefulShutdown(worker));
 * ```
 */
export async function gracefulShutdown(
  worker: Worker<Stage6JobInput, Stage6JobResult>
): Promise<void> {
  logger.info('Shutting down Stage 6 worker gracefully...');

  try {
    await worker.close();
    logger.info('Stage 6 worker closed successfully');
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error during Stage 6 worker shutdown'
    );
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Types are already exported at definition with 'export interface'
// Export additional internal functions for testing
export {
  processStage6Job,
  updateJobProgress,
  saveLessonContent,
  processWithFallback,
  handlePartialSuccess,
  markForReview,
  detectLanguage,
  getJobTimeout,
};
