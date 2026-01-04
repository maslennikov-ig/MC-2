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
import { logger } from '@/shared/logger';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { createStage7Queue, addEnrichmentJob } from '../factory';
import type { Stage7JobInput } from '../types';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Priority for card jobs (higher priority = processed earlier) */
const CARD_JOB_PRIORITY = 1; // High priority - cards should generate before other enrichments

/** Whether auto-card generation is enabled */
const AUTO_CARD_ENABLED = process.env.AUTO_CARD_GENERATION !== 'false';

// Lazy-loaded queue instance
let stage7Queue: Awaited<ReturnType<typeof createStage7Queue>> | null = null;

/**
 * Get or create the Stage7 queue instance
 */
async function getQueue() {
  if (!stage7Queue) {
    stage7Queue = createStage7Queue();
  }
  return stage7Queue;
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
  let { courseId, lessonId, userId, organizationId } = params;

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
        logger.error(
          { courseId, error: courseError?.message },
          'Failed to fetch course for card trigger'
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

    // Create enrichment record
    const enrichmentId = randomUUID();
    const { error: insertError } = await supabase
      .from('lesson_enrichments')
      .insert({
        id: enrichmentId,
        lesson_id: lessonId,
        course_id: courseId,
        enrichment_type: 'card',
        status: 'pending',
        order_index: 0, // Cards have highest display priority
        generation_attempt: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      logger.error(
        { lessonId, courseId, error: insertError.message },
        'Failed to create lesson card enrichment record'
      );
      return null;
    }

    // Queue Stage7 job
    const jobInput: Stage7JobInput = {
      enrichmentId,
      enrichmentType: 'card',
      lessonId,
      courseId,
      userId,
      organizationId,
      retryAttempt: 0,
    };

    const queue = await getQueue();
    await addEnrichmentJob(queue, jobInput, {
      priority: CARD_JOB_PRIORITY,
    });

    const durationMs = Date.now() - startTime;

    logger.info(
      { lessonId, courseId, enrichmentId, durationMs },
      'Lesson card generation triggered'
    );

    return enrichmentId;
  } catch (error) {
    logger.error(
      {
        lessonId,
        courseId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to trigger lesson card generation'
    );
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
  let { courseId, userId, organizationId } = params;

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
        logger.error(
          { courseId, error: courseError?.message },
          'Failed to fetch course for card trigger'
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

    // Create enrichment record for course card
    // Mark it with title='course-card' to identify it as a course-level card
    const enrichmentId = randomUUID();
    const { error: insertError } = await supabase
      .from('lesson_enrichments')
      .insert({
        id: enrichmentId,
        lesson_id: firstLesson.id,
        course_id: courseId,
        enrichment_type: 'card',
        status: 'pending',
        order_index: 0,
        title: 'course-card', // Marker for course-level card
        settings: { isCourseCard: true }, // Additional marker in settings
        generation_attempt: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      logger.error(
        { courseId, error: insertError.message },
        'Failed to create course card enrichment record'
      );
      return null;
    }

    // Queue Stage7 job
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
    await addEnrichmentJob(queue, jobInput, {
      priority: CARD_JOB_PRIORITY,
    });

    const durationMs = Date.now() - startTime;

    logger.info(
      { courseId, enrichmentId, lessonId: firstLesson.id, durationMs },
      'Course card generation triggered'
    );

    return enrichmentId;
  } catch (error) {
    logger.error(
      {
        courseId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to trigger course card generation'
    );
    return null;
  }
}

// ============================================================================
// BATCH TRIGGER (for all lessons)
// ============================================================================

/**
 * Trigger card generation for all lessons in a course
 *
 * Useful for backfilling cards on existing courses.
 *
 * @param params - Batch trigger parameters
 * @returns Array of created enrichment IDs
 */
export async function triggerAllLessonCards(params: {
  courseId: string;
  userId: string;
  organizationId: string;
}): Promise<string[]> {
  const { courseId, userId, organizationId } = params;

  try {
    const supabase = getSupabaseAdmin();

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
      return [];
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
    const results: string[] = [];

    for (const lesson of lessons) {
      if (!existingLessonIds.has(lesson.id)) {
        const enrichmentId = await triggerLessonCard({
          courseId,
          lessonId: lesson.id,
          userId,
          organizationId,
        });

        if (enrichmentId) {
          results.push(enrichmentId);
        }
      }
    }

    logger.info(
      { courseId, triggeredCount: results.length, totalLessons: lessons.length },
      'Batch lesson card trigger completed'
    );

    return results;
  } catch (error) {
    logger.error(
      {
        courseId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to trigger batch lesson cards'
    );
    return [];
  }
}
