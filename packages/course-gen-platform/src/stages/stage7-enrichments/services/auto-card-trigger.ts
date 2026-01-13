/**
 * Auto Card Trigger Service
 * @module stages/stage7-enrichments/services/auto-card-trigger
 *
 * Automatically triggers card and cover generation during the course pipeline.
 * Creates enrichment records and queues Stage7 jobs for visual enrichments.
 *
 * AUTO-GENERATED ENRICHMENTS (Pipeline):
 * - After Stage 5 completes:
 *   - triggerCourseCard() - generates course catalog thumbnail (1024x1024)
 *   - triggerAllLessonCovers() - generates lesson hero images (1280x720)
 * - After Stage 6 lesson completes:
 *   - triggerLessonCard() - generates lesson navigation thumbnail (1024x1024)
 *
 * ON-DEMAND ENRICHMENTS (User-initiated from UI, NOT auto-generated):
 * - quiz: Interactive quizzes
 * - audio: Lesson narration
 * - presentation: Slide decks
 * - video: Video content (not yet implemented)
 * - banner: Decorative headers
 *
 * @see packages/course-gen-platform/src/stages/stage7-enrichments/config/index.ts
 * @see packages/web/app/api/enrichments/generate/route.ts (on-demand API)
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
 * Enrichment job priority configuration
 *
 * BullMQ priority: lower number = higher priority
 *
 * Priority levels:
 * - 1: Cards (highest - thumbnails needed for UI immediately)
 * - 2: Covers (high - hero images for visual appeal)
 * - 3: [RESERVED] - Future: interactive elements
 * - 4: [RESERVED] - Future: documents/presentations
 * - 5: Quizzes (normal - assessment content)
 * - 10: Video/Audio (lowest - expensive operations)
 *
 * Note: Priorities 3-4 are reserved for future enrichment types.
 * When adding new types, use the next available priority.
 */
const CARD_JOB_PRIORITY = 1;

/**
 * Cover job priority configuration
 * Slightly lower priority than cards (2 vs 1) since covers are larger images
 */
const COVER_JOB_PRIORITY = 2;

/**
 * Order index for card enrichments in the lesson enrichment list
 * Cards always appear first (index 1) for visual prominence
 * Note: Database constraint requires order_index > 0
 */
const CARD_ORDER_INDEX = 1;

/**
 * Order index for cover enrichments in the lesson enrichment list
 * Covers appear after cards (index 2) since they're hero images
 */
const COVER_ORDER_INDEX = 2;

/** Whether auto-card generation is enabled */
const AUTO_CARD_ENABLED = process.env.AUTO_CARD_GENERATION !== 'false';

// ============================================================================
// ENRICHMENT TYPE CONFIGURATION
// ============================================================================

/** Supported lesson-level enrichment types for auto-triggering */
type LessonEnrichmentType = 'card' | 'cover';

/** Configuration for each enrichment type */
interface LessonEnrichmentConfig {
  orderIndex: number;
  priority: number;
}

/** Enrichment type configurations */
const LESSON_ENRICHMENT_CONFIG: Record<LessonEnrichmentType, LessonEnrichmentConfig> = {
  card: {
    orderIndex: CARD_ORDER_INDEX,
    priority: CARD_JOB_PRIORITY,
  },
  cover: {
    orderIndex: COVER_ORDER_INDEX,
    priority: COVER_JOB_PRIORITY,
  },
};

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
 * Log structured enrichment generation failure for tracking and monitoring
 *
 * Provides structured error logging with consistent fields for:
 * - Monitoring dashboards (filtering by event type)
 * - Alert triggers (severity-based routing)
 * - Debugging (full context with stack traces)
 *
 * @param params - Failure context parameters
 */
function logCardGenerationFailure(params: {
  enrichmentType: 'card' | 'cover';
  scope: 'lesson' | 'course';
  courseId: string;
  lessonId?: string;
  error: unknown;
  phase: 'trigger' | 'queue' | 'enrichment-creation';
  context?: Record<string, unknown>;
}): void {
  const { enrichmentType, scope, courseId, lessonId, error, phase, context } = params;

  // Handle different error types: Error instances, Supabase errors (plain objects), or primitives
  let errorMessage: string;
  let errorStack: string | undefined;

  if (error instanceof Error) {
    errorMessage = error.message;
    errorStack = error.stack;
  } else if (error && typeof error === 'object' && 'message' in error) {
    // Supabase PostgrestError or similar object with message property
    errorMessage = String((error as { message: unknown }).message);
  } else if (error && typeof error === 'object') {
    // Plain object - try to JSON stringify
    try {
      errorMessage = JSON.stringify(error);
    } catch {
      errorMessage = String(error);
    }
  } else {
    errorMessage = String(error);
  }

  // Structured error log for monitoring/alerting systems
  logger.error(
    {
      event: 'enrichment_generation_failure',
      enrichmentType,
      scope,
      courseId,
      lessonId,
      phase,
      error: errorMessage,
      errorStack,
      timestamp: new Date().toISOString(),
      ...context,
    },
    `Enrichment generation failure: ${scope} ${enrichmentType} failed during ${phase} phase`
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

  process.on('SIGTERM', () => {
    void handleShutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void handleShutdown('SIGINT');
  });

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
// GENERIC LESSON ENRICHMENT TRIGGER (INTERNAL)
// ============================================================================

/**
 * Generic trigger for lesson enrichments (cards, covers, etc.)
 *
 * @internal - Use triggerLessonCard() or triggerLessonCover() instead
 */
async function triggerLessonEnrichment(
  enrichmentType: LessonEnrichmentType,
  params: {
    courseId: string;
    lessonId: string;
    userId?: string;
    organizationId?: string;
  }
): Promise<string | null> {
  const { courseId, lessonId } = params;
  let { userId, organizationId } = params;
  const config = LESSON_ENRICHMENT_CONFIG[enrichmentType];

  // Input validation
  if (!courseId || !lessonId) {
    logger.error(
      { courseId, lessonId },
      `Missing required parameters for lesson ${enrichmentType} trigger`
    );
    return null;
  }

  if (!AUTO_CARD_ENABLED) {
    logger.debug(
      { lessonId, courseId },
      `Auto-card generation disabled, skipping lesson ${enrichmentType} trigger`
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
          enrichmentType,
          scope: 'lesson',
          courseId,
          lessonId,
          error: courseError || new Error('Course not found'),
          phase: 'trigger',
          context: { errorCode: courseError?.code },
        });
        return null;
      }

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

    // Check if enrichment already exists
    const { data: existing } = await supabase
      .from('lesson_enrichments')
      .select('id')
      .eq('lesson_id', lessonId)
      .eq('enrichment_type', enrichmentType)
      .maybeSingle();

    if (existing) {
      logger.debug(
        { lessonId, existingId: existing.id },
        `Lesson ${enrichmentType} already exists, skipping`
      );
      return existing.id;
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
          enrichment_type: enrichmentType,
          status: 'pending',
          order_index: config.orderIndex,
          // Mark auto-generated covers to distinguish from manual banner enrichments
          metadata: enrichmentType === 'cover' ? { isAutoGenerated: true } : undefined,
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
      if (upsertError.code === 'PGRST116') {
        logger.debug(
          { lessonId, courseId },
          `Lesson ${enrichmentType} already exists (race condition handled), skipping job queue`
        );
        return null;
      }
      logCardGenerationFailure({
        enrichmentType,
        scope: 'lesson',
        courseId,
        lessonId,
        error: upsertError,
        phase: 'enrichment-creation',
        context: { errorCode: upsertError.code },
      });
      return null;
    }

    const actualEnrichmentId = upsertResult?.id || enrichmentId;

    // Queue Stage7 job with deterministic jobId for deduplication
    const jobInput: Stage7JobInput = {
      enrichmentId: actualEnrichmentId,
      enrichmentType,
      lessonId,
      courseId,
      userId,
      organizationId,
      retryAttempt: 0,
    };

    const queue = await getQueue();
    if (!queue) {
      logCardGenerationFailure({
        enrichmentType,
        scope: 'lesson',
        courseId,
        lessonId,
        error: new Error('Queue unavailable (shutdown in progress)'),
        phase: 'queue',
      });
      return null;
    }

    await addEnrichmentJob(queue, jobInput, {
      priority: config.priority,
      jobId: `${enrichmentType}-lesson-${lessonId}`,
    });

    const durationMs = Date.now() - startTime;

    logger.info(
      { lessonId, courseId, enrichmentId: actualEnrichmentId, durationMs },
      `Lesson ${enrichmentType} generation triggered`
    );

    return actualEnrichmentId;
  } catch (error) {
    logCardGenerationFailure({
      enrichmentType,
      scope: 'lesson',
      courseId,
      lessonId,
      error,
      phase: 'trigger',
    });
    return null;
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
  return triggerLessonEnrichment('card', params);
}

// ============================================================================
// LESSON COVER TRIGGER
// ============================================================================

/**
 * Trigger lesson cover generation after Stage 5 completion
 *
 * Creates a cover enrichment record and queues a Stage7 job for generation.
 * Can be called immediately after Stage 5 since covers use lesson.objectives
 * instead of lesson.content for keyword extraction.
 *
 * @param params - Lesson cover trigger parameters
 * @returns Created enrichment ID or null if skipped/failed
 */
export async function triggerLessonCover(params: {
  courseId: string;
  lessonId: string;
  userId?: string;
  organizationId?: string;
}): Promise<string | null> {
  return triggerLessonEnrichment('cover', params);
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
    logger.debug({ courseId }, 'Auto-card generation disabled, skipping course card trigger');
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
          enrichmentType: 'card',
          scope: 'course',
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
    // Note: lessons are linked via sections (lessons.section_id -> sections.course_id)
    // PostgREST doesn't support ordering by joined table columns, so we fetch all and sort in JS
    const { data: allLessons, error: lessonError } = await supabase
      .from('lessons')
      .select('id, order_index, sections!inner(course_id, order_index)')
      .eq('sections.course_id', courseId);

    if (lessonError || !allLessons || allLessons.length === 0) {
      logger.warn(
        { courseId, error: lessonError?.message },
        'No lessons found for course, cannot create course card'
      );
      return null;
    }

    // Sort by section order, then lesson order, and get first
    const sortedLessons = allLessons.sort((a, b) => {
      const sectionDiff = (a.sections as any).order_index - (b.sections as any).order_index;
      if (sectionDiff !== 0) return sectionDiff;
      return a.order_index - b.order_index;
    });
    const firstLesson = sortedLessons[0];

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

    // Create enrichment record for course card
    // Mark it with title='course-card' to identify it as a course-level card
    // Note: Unique constraint lesson_enrichments_course_card_unique ensures one per course
    const enrichmentId = randomUUID();
    const { error: insertError } = await supabase.from('lesson_enrichments').insert({
      id: enrichmentId,
      lesson_id: firstLesson.id,
      course_id: courseId,
      enrichment_type: 'card',
      status: 'pending',
      order_index: CARD_ORDER_INDEX,
      title: 'course-card', // Marker for course-level card
      metadata: { isCourseCard: true }, // Additional marker in metadata
      generation_attempt: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (insertError) {
      // 23505 means unique constraint violation (race condition - another process inserted first)
      if (insertError.code === '23505') {
        logger.debug(
          { courseId },
          'Course card already exists (race condition handled), skipping job queue'
        );
        return null;
      }
      logCardGenerationFailure({
        enrichmentType: 'card',
        scope: 'course',
        courseId,
        error: insertError,
        phase: 'enrichment-creation',
        context: { errorCode: insertError.code },
      });
      return null;
    }

    // Queue Stage7 job with deterministic jobId for deduplication
    const jobInput: Stage7JobInput = {
      enrichmentId,
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
        enrichmentType: 'card',
        scope: 'course',
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
      { courseId, enrichmentId, lessonId: firstLesson.id, durationMs },
      'Course card generation triggered'
    );

    return enrichmentId;
  } catch (error) {
    logCardGenerationFailure({
      enrichmentType: 'card',
      scope: 'course',
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
 * Skips lessons that already have card enrichments.
 *
 * @param params - Batch trigger parameters
 * @param params.courseId - Course UUID to generate cards for
 * @param params.userId - User UUID who initiated the generation
 * @param params.organizationId - Organization UUID for billing/tracking
 * @returns Promise resolving to BatchTriggerResult with:
 *   - succeeded: Array of created enrichment IDs
 *   - failed: Array of {lessonId, error} for failed triggers
 *   - skipped: Array of lesson IDs that already have cards
 *
 * @example
 * ```typescript
 * const result = await triggerAllLessonCards({
 *   courseId: '123e4567-e89b-12d3-a456-426614174000',
 *   userId: '123e4567-e89b-12d3-a456-426614174001',
 *   organizationId: '123e4567-e89b-12d3-a456-426614174002'
 * });
 * ```
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

    // Get all lessons via sections join (lessons.section_id -> sections.course_id)
    const { data: lessons, error: lessonsError } = await supabase
      .from('lessons')
      .select('id, order_index, sections!inner(course_id, order_index)')
      .eq('sections.course_id', courseId);

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

    const existingLessonIds = new Set(existingCards?.map(c => c.lesson_id) || []);

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

/**
 * Trigger cover generation for all lessons in a course
 *
 * Called after Stage 5 completes to generate covers in parallel with Stage 6.
 * Skips lessons that already have cover enrichments.
 *
 * @param params - Batch trigger parameters
 * @param params.courseId - Course UUID to generate covers for
 * @param params.userId - User UUID who initiated the generation
 * @param params.organizationId - Organization UUID for billing/tracking
 * @returns Promise resolving to BatchTriggerResult with:
 *   - succeeded: Array of created enrichment IDs
 *   - failed: Array of {lessonId, error} for failed triggers
 *   - skipped: Array of lesson IDs that already have covers
 *
 * @example
 * ```typescript
 * const result = await triggerAllLessonCovers({
 *   courseId: '123e4567-e89b-12d3-a456-426614174000',
 *   userId: '123e4567-e89b-12d3-a456-426614174001',
 *   organizationId: '123e4567-e89b-12d3-a456-426614174002'
 * });
 *
 * console.log(`Triggered: ${result.succeeded.length}`);
 * console.log(`Failed: ${result.failed.length}`);
 * console.log(`Skipped: ${result.skipped.length}`);
 * ```
 */
export async function triggerAllLessonCovers(params: {
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

    // Get all lessons via sections join (lessons.section_id -> sections.course_id)
    // PostgREST doesn't support ordering by joined table columns
    const { data: lessons, error: lessonsError } = await supabase
      .from('lessons')
      .select('id, sections!inner(course_id)')
      .eq('sections.course_id', courseId);

    if (lessonsError || !lessons || lessons.length === 0) {
      logger.warn(
        { courseId, error: lessonsError?.message },
        'No lessons found for batch cover trigger'
      );
      return result;
    }

    // Get existing cover enrichments
    const { data: existingCovers } = await supabase
      .from('lesson_enrichments')
      .select('lesson_id')
      .eq('course_id', courseId)
      .eq('enrichment_type', 'cover');

    const existingLessonIds = new Set(existingCovers?.map(c => c.lesson_id) || []);

    // Trigger covers for lessons that don't have them
    for (const lesson of lessons) {
      if (existingLessonIds.has(lesson.id)) {
        result.skipped.push(lesson.id);
        continue;
      }

      try {
        const enrichmentId = await triggerLessonCover({
          courseId,
          lessonId: lesson.id,
          userId,
          organizationId,
        });

        if (enrichmentId) {
          result.succeeded.push(enrichmentId);
        } else {
          // triggerLessonCover returned null without throwing
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
      'Batch lesson cover trigger completed'
    );

    return result;
  } catch (error) {
    logger.error(
      {
        courseId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to trigger batch lesson covers'
    );
    return result;
  }
}
