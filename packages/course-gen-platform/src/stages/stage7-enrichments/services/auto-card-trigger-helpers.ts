/**
 * Auto Card Trigger Helpers
 *
 * Helper functions extracted from auto-card-trigger.ts to comply with ESLint rules:
 * - max-lines: Keep main file ≤ 500 lines
 * - max-lines-per-function: Keep functions ≤ 150 lines
 * - complexity: Keep cyclomatic complexity ≤ 20
 *
 * @module stages/stage7-enrichments/services/auto-card-trigger-helpers
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@megacampus/shared-types';
import { randomUUID } from 'crypto';
import type { Queue } from 'bullmq';
import { logger } from '@/shared/logger';
import { addEnrichmentJob } from '../factory';
import type { Stage7JobInput, Stage7JobResult } from '../types';

/** Card job priority (highest - thumbnails needed for UI immediately) */
const CARD_JOB_PRIORITY = 1;

/** Card order index in lesson enrichment list */
const CARD_ORDER_INDEX = 1;

/**
 * Fetch user and organization IDs from course
 */
export async function fetchCourseMetadata(
  courseId: string,
  supabase: SupabaseClient<Database>
): Promise<{ userId: string; organizationId: string } | null> {
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

  if (!course.user_id || !course.organization_id) {
    logger.error(
      { courseId, user_id: course.user_id, organization_id: course.organization_id },
      'Course missing required user_id or organization_id'
    );
    return null;
  }

  return {
    userId: course.user_id,
    organizationId: course.organization_id,
  };
}

/**
 * Get sections for a course
 */
export async function fetchCourseSections(
  courseId: string,
  supabase: SupabaseClient<Database>
): Promise<Array<{ id: string; order_index: number }> | null> {
  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select('id, order_index')
    .eq('course_id', courseId)
    .order('order_index', { ascending: true });

  if (sectionsError || !sections || sections.length === 0) {
    logger.warn(
      { courseId, error: sectionsError?.message },
      'No sections found for course, cannot create course card'
    );
    return null;
  }

  return sections;
}

/**
 * Get first lesson from a section
 */
export async function fetchFirstLesson(
  sectionId: string,
  courseId: string,
  supabase: SupabaseClient<Database>
): Promise<{ id: string; order_index: number } | null> {
  const { data: allLessons, error: lessonError } = await supabase
    .from('lessons')
    .select('id, order_index')
    .eq('section_id', sectionId)
    .order('order_index', { ascending: true })
    .limit(1);

  if (lessonError || !allLessons || allLessons.length === 0) {
    logger.warn(
      { courseId, sectionId, error: lessonError?.message },
      'No lessons found in first section, cannot create course card'
    );
    return null;
  }

  return allLessons[0];
}

/**
 * Check if course card already exists
 */
export async function checkExistingCourseCard(
  courseId: string,
  supabase: SupabaseClient<Database>
): Promise<string | null> {
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

  return null;
}

/**
 * Create course card enrichment record
 */
export async function createCourseCardEnrichment(
  courseId: string,
  lessonId: string,
  supabase: SupabaseClient<Database>
): Promise<{ enrichmentId: string; isRaceCondition: boolean }> {
  const enrichmentId = randomUUID();
  const { error: insertError } = await supabase.from('lesson_enrichments').insert({
    id: enrichmentId,
    lesson_id: lessonId,
    course_id: courseId,
    enrichment_type: 'card',
    status: 'pending',
    order_index: CARD_ORDER_INDEX,
    title: 'course-card',
    metadata: { isCourseCard: true },
    generation_attempt: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (insertError) {
    // 23505 = unique constraint violation (race condition)
    if (insertError.code === '23505') {
      logger.debug(
        { courseId },
        'Course card already exists (race condition handled), skipping job queue'
      );
      return { enrichmentId: '', isRaceCondition: true };
    }

    logCardGenerationFailure({
      enrichmentType: 'card',
      scope: 'course',
      courseId,
      error: insertError,
      phase: 'enrichment-creation',
      context: { errorCode: insertError.code },
    });

    throw insertError;
  }

  return { enrichmentId, isRaceCondition: false };
}

/**
 * Queue course card generation job
 */
export async function queueCourseCardJob(
  params: {
    enrichmentId: string;
    lessonId: string;
    courseId: string;
    userId: string;
    organizationId: string;
  },
  queue: Queue<Stage7JobInput, Stage7JobResult>
): Promise<void> {
  const { enrichmentId, lessonId, courseId, userId, organizationId } = params;

  const jobInput: Stage7JobInput = {
    enrichmentId,
    enrichmentType: 'card',
    lessonId,
    courseId,
    userId,
    organizationId,
    settings: { isCourseCard: true },
  };

  await addEnrichmentJob(queue, jobInput, {
    priority: CARD_JOB_PRIORITY,
    jobId: `card-course-${courseId}`,
  });
}

/**
 * Log structured enrichment generation failure
 */
export function logCardGenerationFailure(params: {
  enrichmentType: 'card' | 'cover';
  scope: 'lesson' | 'course';
  courseId: string;
  lessonId?: string;
  error: unknown;
  phase: 'trigger' | 'queue' | 'enrichment-creation';
  context?: Record<string, unknown>;
}): void {
  const { enrichmentType, scope, courseId, lessonId, error, phase, context } = params;

  let errorMessage: string;
  let errorStack: string | undefined;

  if (error instanceof Error) {
    errorMessage = error.message;
    errorStack = error.stack;
  } else if (error && typeof error === 'object' && 'message' in error) {
    errorMessage = String((error as { message: unknown }).message);
  } else if (error && typeof error === 'object') {
    try {
      errorMessage = JSON.stringify(error);
    } catch {
      errorMessage = '[unserializable object]';
    }
  } else {
    errorMessage = String(error);
  }

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
 * Fetch sections for batch operations
 */
export async function fetchSectionsForBatch(
  courseId: string,
  supabase: SupabaseClient<Database>
): Promise<string[] | null> {
  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select('id')
    .eq('course_id', courseId);

  if (sectionsError || !sections || sections.length === 0) {
    logger.warn({ courseId, error: sectionsError?.message }, 'No sections found for batch trigger');
    return null;
  }

  return sections.map(s => s.id);
}

/**
 * Fetch lessons for batch operations
 */
export async function fetchLessonsForBatch(
  sectionIds: string[],
  courseId: string,
  supabase: SupabaseClient<Database>
): Promise<Array<{ id: string }> | null> {
  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('id')
    .in('section_id', sectionIds);

  if (lessonsError || !lessons || lessons.length === 0) {
    logger.warn({ courseId, error: lessonsError?.message }, 'No lessons found for batch trigger');
    return null;
  }

  return lessons;
}

/**
 * Fetch existing enrichments for batch operations
 */
export async function fetchExistingEnrichments(
  courseId: string,
  enrichmentType: 'card' | 'cover',
  excludeCourseCard: boolean,
  supabase: SupabaseClient<Database>
): Promise<Set<string>> {
  let query = supabase
    .from('lesson_enrichments')
    .select('lesson_id')
    .eq('course_id', courseId)
    .eq('enrichment_type', enrichmentType);

  if (excludeCourseCard) {
    query = query.not('title', 'eq', 'course-card');
  }

  const { data: existingEnrichments } = await query;

  return new Set(existingEnrichments?.map(c => c.lesson_id) || []);
}
