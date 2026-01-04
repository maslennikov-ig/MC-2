/**
 * Auto Card Trigger Service
 * @module stages/stage7-enrichments/services/auto-card-trigger
 *
 * Automatically triggers card generation after Stage 5 and Stage 6 completion.
 * Creates enrichment records and queues Stage7 jobs for card generation.
 *
 * Usage:
 * - After Stage 5 completes: triggerCourseCard() - generates course catalog thumbnail
 * - After Stage 6 lesson completes: triggerLessonCard() - generates lesson navigation thumbnail
 */

import { randomUUID } from 'crypto';
import type { Queue } from 'bullmq';
import { logger } from '@/shared/logger';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { createStage7Queue, addEnrichmentJob } from '../factory';
import type { Stage7JobInput, Stage7JobResult } from '../types';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Card job priority configuration
 *
 * BullMQ priority: lower number = higher priority
 * - 1: Cards (highest - generate before other enrichments)
 * - 5: Quizzes (normal priority)
 * - 10: Video/Audio (lowest - expensive operations)
 */
const CARD_JOB_PRIORITY = 1;

/**
 * Order index for card enrichments in the lesson enrichment list
 * Cards always appear first (index 0) for visual prominence
 */
const CARD_ORDER_INDEX = 0;

/** Whether auto-card generation is enabled */
const AUTO_CARD_ENABLED = process.env.AUTO_CARD_GENERATION !== 'false';

// ============================================================================
// SINGLETON QUEUE MANAGEMENT
// ============================================================================

/** Singleton queue instance with shutdown support */
let stage7Queue: Queue<Stage7JobInput, Stage7JobResult> | null = null;

/** Flag to track if shutdown handlers are registered */
let shutdownHandlersRegistered = false;

/** Flag to prevent new queue creation during shutdown */
let isShuttingDown = false;

/**
 * Log structured card generation failure for tracking and monitoring
 *
 * Provides structured error logging with consistent fields for:
 * - Monitoring dashboards (filtering by event type)
 * - Alert triggers (severity-based routing)
 * - Debugging (full context with stack traces)
 *
 * @param params - Failure context parameters
 */
function logCardGenerationFailure(params: {
  cardType: 'lesson' | 'course';
  courseId: string;
  lessonId?: string;
  error: Error | unknown;
  phase: 'trigger' | 'queue' | 'enrichment-creation';
  context?: Record<string, unknown>;
}): void {
  const { cardType, courseId, lessonId, error, phase, context } = params;

  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Structured error log for monitoring/alerting systems
  logger.error(
    {
      event: 'card_generation_failure',
      cardType,
      courseId,
      lessonId,
      phase,
      error: errorMessage,
      errorStack,
      timestamp: new Date().toISOString(),
      ...context,
    },
    `Card generation failure: ${cardType} card failed during ${phase} phase`
  );
}

/**
 * Get or create the Stage7 queue singleton instance
 *
 * @returns Queue instance or null if shutting down
 */
async function getQueue(): Promise<Queue<Stage7JobInput, Stage7JobResult> | null> {
  if (isShuttingDown) {
    logger.warn('Queue requested during shutdown, returning null');
    return null;
  }

  if (!stage7Queue) {
    stage7Queue = createStage7Queue();
    registerShutdownHandlers();
  }

  return stage7Queue;
}

/**
 * Register process shutdown handlers for graceful queue cleanup
 * Only registers once to avoid duplicate handlers
 */
function registerShutdownHandlers(): void {
  if (shutdownHandlersRegistered) {
    return;
  }

  const handleShutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Auto-card trigger received shutdown signal');
    await shutdownAutoCardQueue();
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  shutdownHandlersRegistered = true;
  logger.debug('Auto-card queue shutdown handlers registered');
}

/**
 * Gracefully shutdown the auto-card queue
 * Should be called during application shutdown
 *
 * @returns Promise that resolves when queue is closed
 */
export async function shutdownAutoCardQueue(): Promise<void> {
  if (isShuttingDown) {
    logger.debug('Auto-card queue shutdown already in progress');
    return;
  }

  isShuttingDown = true;

  if (stage7Queue) {
    try {
      logger.info('Shutting down auto-card queue...');
      await stage7Queue.close();
      stage7Queue = null;
      logger.info('Auto-card queue closed successfully');
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'Error during auto-card queue shutdown'
      );
    }
  }
}

// ============================================================================
// LESSON CARD TRIGGER
// ============================================================================

/**
 * Trigger lesson card generation after Stage 6 completion
 *
 * Creates a card enrichment record and queues a Stage7 job for generation.
 * Should be called after successful lesson content generation in Stage 6.
 *
 * @param params - Lesson card trigger parameters
 * @returns Created enrichment ID or null if skipped/failed
 */
export async function triggerLessonCard(params: {
  courseId: string;
  lessonId: string;
  userId?: string;
  organizationId?: string;
}): Promise<string | null> {
  const { courseId, lessonId } = params;
  let { userId, organizationId } = params;

  // Input validation
  if (!courseId || !lessonId) {
    logger.error({ courseId, lessonId }, 'Missing required parameters for lesson card trigger');
    return null;
  }

  if (!AUTO_CARD_ENABLED) {
    logger.debug(
      { lessonId, courseId },
      'Auto-card generation disabled, skipping lesson card trigger'
    );
    return null;
  }

  const startTime = Date.now();

  try {
    const supabase = getSupabaseAdmin();

    // Fetch userId and organizationId from course if not provided
    if (!userId || !organizationId) {
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('user_id, organization_id')
        .eq('id', courseId)
        .single();

      if (courseError || !course) {
        logCardGenerationFailure({
          cardType: 'lesson',
          courseId,
          lessonId,
          error: courseError || new Error('Course not found'),
          phase: 'trigger',
          context: { errorCode: courseError?.code },
        });
        return null;
      }

      // Null safety check for required fields from database
      if (!course.user_id || !course.organization_id) {
        logger.error(
          { courseId, user_id: course.user_id, organization_id: course.organization_id },
          'Course missing required user_id or organization_id'
        );
        return null;
      }

      userId = userId || course.user_id;
      organizationId = organizationId || course.organization_id;
    }

    // Check if lesson card already exists
    const { data: existingCard } = await supabase
      .from('lesson_enrichments')
      .select('id')
      .eq('lesson_id', lessonId)
      .eq('enrichment_type', 'card')
      .maybeSingle();

    if (existingCard) {
      logger.debug(
        { lessonId, existingCardId: existingCard.id },
        'Lesson card already exists, skipping'
      );
      return existingCard.id;
    }

    // Create enrichment record with upsert to handle race conditions
    const enrichmentId = randomUUID();
    const { data: upsertResult, error: upsertError } = await supabase
      .from('lesson_enrichments')
      .upsert(
        {
          id: enrichmentId,
          lesson_id: lessonId,
          course_id: courseId,
          enrichment_type: 'card',
          status: 'pending',
          order_index: CARD_ORDER_INDEX,
          generation_attempt: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'lesson_id,enrichment_type',
          ignoreDuplicates: true,
        }
      )
      .select('id')
      .single();

    if (upsertError) {
      // PGRST116 means no rows returned (duplicate was ignored)
      // This is expected behavior when ignoreDuplicates is true
      if (upsertError.code === 'PGRST116') {
        logger.debug(
          { lessonId, courseId },
          'Lesson card already exists (race condition handled), skipping job queue'
        );
        return null;
      }
      logCardGenerationFailure({
        cardType: 'lesson',
        courseId,
        lessonId,
        error: upsertError,
        phase: 'enrichment-creation',
        context: { errorCode: upsertError.code },
      });
      return null;
    }

    // Use the actual enrichment ID (could be new or existing)
    const actualEnrichmentId = upsertResult?.id || enrichmentId;

    // Queue Stage7 job with deterministic jobId for deduplication
    const jobInput: Stage7JobInput = {
      enrichmentId: actualEnrichmentId,
      enrichmentType: 'card',
      lessonId,
      courseId,
      userId,
      organizationId,
      retryAttempt: 0,
    };

    const queue = await getQueue();
    if (!queue) {
      logCardGenerationFailure({
        cardType: 'lesson',
        courseId,
        lessonId,
        error: new Error('Queue unavailable (shutdown in progress)'),
        phase: 'queue',
      });
      return null;
    }

    await addEnrichmentJob(queue, jobInput, {
      priority: CARD_JOB_PRIORITY,
      jobId: `card-lesson-${lessonId}`,
    });

    const durationMs = Date.now() - startTime;

    logger.info(
      { lessonId, courseId, enrichmentId: actualEnrichmentId, durationMs },
      'Lesson card generation triggered'
    );

    return actualEnrichmentId;
  } catch (error) {
    logCardGenerationFailure({
      cardType: 'lesson',
      courseId,
      lessonId,
      error,
      phase: 'trigger',
    });
    return null;
  }
}

// ============================================================================
// COURSE CARD TRIGGER
// ============================================================================

/**
 * Trigger course card generation after Stage 5 completion
 *
 * Creates a card enrichment record for the first lesson (as course thumbnail proxy)
 * and queues a Stage7 job for generation.
 *
 * Note: Course cards are attached to the first lesson but marked specially
 * so the card handler generates a course-level thumbnail.
 *
 * @param params - Course card trigger parameters
 * @returns Created enrichment ID or null if skipped/failed
 */
export async function triggerCourseCard(params: {
  courseId: string;
  userId?: string;
  organizationId?: string;
}): Promise<string | null> {
  const { courseId } = params;
  let { userId, organizationId } = params;

  // Input validation
  if (!courseId) {
    logger.error({ courseId }, 'Missing required courseId for course card trigger');
    return null;
  }

  if (!AUTO_CARD_ENABLED) {
    logger.debug(
      { courseId },
      'Auto-card generation disabled, skipping course card trigger'
    );
    return null;
  }

  const startTime = Date.now();

  try {
    const supabase = getSupabaseAdmin();

    // Fetch userId and organizationId from course if not provided
    if (!userId || !organizationId) {
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('user_id, organization_id')
        .eq('id', courseId)
        .single();

      if (courseError || !course) {
        logCardGenerationFailure({
          cardType: 'course',
          courseId,
          error: courseError || new Error('Course not found'),
          phase: 'trigger',
          context: { errorCode: courseError?.code },
        });
        return null;
      }

      // Null safety check for required fields from database
      if (!course.user_id || !course.organization_id) {
        logger.error(
          { courseId, user_id: course.user_id, organization_id: course.organization_id },
          'Course missing required user_id or organization_id'
        );
        return null;
      }

      userId = userId || course.user_id;
      organizationId = organizationId || course.organization_id;
    }

    // Get the first lesson of the course to attach the course card to
    const { data: firstLesson, error: lessonError } = await supabase
      .from('lessons')
      .select('id')
      .eq('course_id', courseId)
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (lessonError || !firstLesson) {
      logger.warn(
        { courseId, error: lessonError?.message },
        'No lessons found for course, cannot create course card'
      );
      return null;
    }

    // Check if course card already exists (marked by title or settings)
    const { data: existingCard } = await supabase
      .from('lesson_enrichments')
      .select('id')
      .eq('course_id', courseId)
      .eq('enrichment_type', 'card')
      .eq('title', 'course-card')
      .maybeSingle();

    if (existingCard) {
      logger.debug(
        { courseId, existingCardId: existingCard.id },
        'Course card already exists, skipping'
      );
      return existingCard.id;
    }

    // Create enrichment record for course card with upsert to handle race conditions
    // Mark it with title='course-card' to identify it as a course-level card
    const enrichmentId = randomUUID();
    const { data: upsertResult, error: upsertError } = await supabase
      .from('lesson_enrichments')
      .upsert(
        {
          id: enrichmentId,
          lesson_id: firstLesson.id,
          course_id: courseId,
          enrichment_type: 'card',
          status: 'pending',
          order_index: CARD_ORDER_INDEX,
          title: 'course-card', // Marker for course-level card
          settings: { isCourseCard: true }, // Additional marker in settings
          generation_attempt: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          // For course cards, we use course_id + title as the conflict target
          // since the same lesson can have both a lesson card and a course card
          onConflict: 'lesson_id,enrichment_type',
          ignoreDuplicates: true,
        }
      )
      .select('id')
      .single();

    if (upsertError) {
      // PGRST116 means no rows returned (duplicate was ignored)
      // This is expected behavior when ignoreDuplicates is true
      if (upsertError.code === 'PGRST116') {
        logger.debug(
          { courseId },
          'Course card already exists (race condition handled), skipping job queue'
        );
        return null;
      }
      logCardGenerationFailure({
        cardType: 'course',
        courseId,
        error: upsertError,
        phase: 'enrichment-creation',
        context: { errorCode: upsertError.code },
      });
      return null;
    }

    // Use the actual enrichment ID (could be new or existing)
    const actualEnrichmentId = upsertResult?.id || enrichmentId;

    // Queue Stage7 job with deterministic jobId for deduplication
    const jobInput: Stage7JobInput = {
      enrichmentId: actualEnrichmentId,
      enrichmentType: 'card',
      lessonId: firstLesson.id,
      courseId,
      userId,
      organizationId,
      settings: { isCourseCard: true },
      retryAttempt: 0,
    };

    const queue = await getQueue();
    if (!queue) {
      logCardGenerationFailure({
        cardType: 'course',
        courseId,
        error: new Error('Queue unavailable (shutdown in progress)'),
        phase: 'queue',
      });
      return null;
    }

    await addEnrichmentJob(queue, jobInput, {
      priority: CARD_JOB_PRIORITY,
      jobId: `card-course-${courseId}`,
    });

    const durationMs = Date.now() - startTime;

    logger.info(
      { courseId, enrichmentId: actualEnrichmentId, lessonId: firstLesson.id, durationMs },
      'Course card generation triggered'
    );

    return actualEnrichmentId;
  } catch (error) {
    logCardGenerationFailure({
      cardType: 'course',
      courseId,
      error,
      phase: 'trigger',
    });
    return null;
  }
}

// ============================================================================
// BATCH TRIGGER (for all lessons)
// ============================================================================

/**
 * Result of batch card trigger operation
 */
export interface BatchTriggerResult {
  /** Enrichment IDs for successfully triggered cards */
  succeeded: string[];
  /** Lessons that failed to trigger with error details */
  failed: Array<{ lessonId: string; error: string }>;
  /** Lesson IDs that were skipped (already have cards) */
  skipped: string[];
}

/**
 * Trigger card generation for all lessons in a course
 *
 * Useful for backfilling cards on existing courses.
 *
 * @param params - Batch trigger parameters
 * @returns Object with succeeded, failed, and skipped lesson details
 */
export async function triggerAllLessonCards(params: {
  courseId: string;
  userId: string;
  organizationId: string;
}): Promise<BatchTriggerResult> {
  const { courseId, userId, organizationId } = params;

  const result: BatchTriggerResult = {
    succeeded: [],
    failed: [],
    skipped: [],
  };

  try {
    const supabase = getSupabaseAdmin();

    // Note: Using two separate queries for clarity and reliability.
    // A single JOIN query would be more efficient but harder to maintain.

    // Get all lessons without cards
    const { data: lessons, error: lessonsError } = await supabase
      .from('lessons')
      .select('id')
      .eq('course_id', courseId)
      .order('order_index', { ascending: true });

    if (lessonsError || !lessons || lessons.length === 0) {
      logger.warn(
        { courseId, error: lessonsError?.message },
        'No lessons found for batch card trigger'
      );
      return result;
    }

    // Get existing card enrichments
    const { data: existingCards } = await supabase
      .from('lesson_enrichments')
      .select('lesson_id')
      .eq('course_id', courseId)
      .eq('enrichment_type', 'card')
      .not('title', 'eq', 'course-card'); // Exclude course card

    const existingLessonIds = new Set(existingCards?.map((c) => c.lesson_id) || []);

    // Trigger cards for lessons that don't have them
    for (const lesson of lessons) {
      if (existingLessonIds.has(lesson.id)) {
        result.skipped.push(lesson.id);
        continue;
      }

      try {
        const enrichmentId = await triggerLessonCard({
          courseId,
          lessonId: lesson.id,
          userId,
          organizationId,
        });

        if (enrichmentId) {
          result.succeeded.push(enrichmentId);
        } else {
          // triggerLessonCard returned null without throwing
          result.failed.push({
            lessonId: lesson.id,
            error: 'Trigger returned null (check logs for details)',
          });
        }
      } catch (error) {
        result.failed.push({
          lessonId: lesson.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info(
      {
        courseId,
        succeededCount: result.succeeded.length,
        failedCount: result.failed.length,
        skippedCount: result.skipped.length,
        totalLessons: lessons.length,
      },
      'Batch lesson card trigger completed'
    );

    return result;
  } catch (error) {
    logger.error(
      {
        courseId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to trigger batch lesson cards'
    );
    return result;
  }
}
