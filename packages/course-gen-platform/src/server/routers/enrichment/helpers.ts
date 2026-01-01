/**
 * Enrichment Router Helper Functions
 * @module server/routers/enrichment/helpers
 *
 * Shared utility functions for enrichment router procedures.
 * Provides access verification and common database operations.
 */

import { TRPCError } from '@trpc/server';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import type { EnrichmentStatus } from '@megacampus/shared-types';

/**
 * Verify user has access to an enrichment
 *
 * Checks that the enrichment exists and the user has access to it
 * through course ownership or organization membership.
 *
 * @param enrichmentId - Enrichment UUID
 * @param userId - User UUID
 * @param organizationId - User's organization UUID
 * @param requestId - Request ID for logging
 * @returns Enrichment data if access allowed
 * @throws TRPCError if enrichment not found or access denied
 */
export async function verifyEnrichmentAccess(
  enrichmentId: string,
  userId: string,
  organizationId: string,
  requestId: string
): Promise<{
  id: string;
  lesson_id: string;
  course_id: string;
  enrichment_type: string;
  status: EnrichmentStatus;
  order_index: number;
  asset_id: string | null;
  generation_attempt: number;
  content: Record<string, unknown> | null;
}> {
  const supabase = getSupabaseAdmin();

  // First get the enrichment with its course_id
  const { data: enrichment, error } = await supabase
    .from('lesson_enrichments')
    .select('id, lesson_id, course_id, enrichment_type, status, order_index, asset_id, generation_attempt, content')
    .eq('id', enrichmentId)
    .single();

  if (error || !enrichment) {
    logger.warn({
      requestId,
      enrichmentId,
      userId,
      error,
    }, 'Enrichment not found');

    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Enrichment not found',
    });
  }

  // Verify course access
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, user_id, organization_id')
    .eq('id', enrichment.course_id)
    .single();

  if (courseError || !course) {
    logger.warn({
      requestId,
      enrichmentId,
      courseId: enrichment.course_id,
      userId,
      error: courseError,
    }, 'Course not found for enrichment');

    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Course not found',
    });
  }

  // Check ownership or same organization
  if (course.user_id !== userId && course.organization_id !== organizationId) {
    logger.warn({
      requestId,
      enrichmentId,
      courseId: enrichment.course_id,
      userId,
      organizationId,
      courseOwnerId: course.user_id,
      courseOrgId: course.organization_id,
    }, 'Enrichment access denied');

    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have access to this enrichment',
    });
  }

  return {
    id: enrichment.id,
    lesson_id: enrichment.lesson_id,
    course_id: enrichment.course_id,
    enrichment_type: enrichment.enrichment_type,
    status: enrichment.status as EnrichmentStatus,
    order_index: enrichment.order_index,
    asset_id: enrichment.asset_id,
    generation_attempt: enrichment.generation_attempt ?? 0,
    content: enrichment.content as Record<string, unknown> | null,
  };
}

/**
 * Verify user has access to a course
 *
 * @param courseId - Course UUID
 * @param userId - User UUID
 * @param organizationId - User's organization UUID
 * @param requestId - Request ID for logging
 * @returns Course data if access allowed
 * @throws TRPCError if course not found or access denied
 */
export async function verifyCourseAccess(
  courseId: string,
  userId: string,
  organizationId: string,
  requestId: string
): Promise<{ id: string; user_id: string; organization_id: string; language: string }> {
  const supabase = getSupabaseAdmin();

  const { data: course, error } = await supabase
    .from('courses')
    .select('id, user_id, organization_id, language')
    .eq('id', courseId)
    .single();

  if (error || !course) {
    logger.warn({
      requestId,
      courseId,
      userId,
      error,
    }, 'Course not found');

    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Course not found',
    });
  }

  // Check ownership or same organization
  if (course.user_id !== userId && course.organization_id !== organizationId) {
    logger.warn({
      requestId,
      courseId,
      userId,
      organizationId,
      courseOwnerId: course.user_id,
      courseOrgId: course.organization_id,
    }, 'Course access denied');

    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have access to this course',
    });
  }

  return {
    id: course.id,
    user_id: course.user_id,
    organization_id: course.organization_id,
    language: course.language || 'en',
  };
}

/**
 * Verify user has access to a lesson
 *
 * @param lessonId - Lesson UUID
 * @param userId - User UUID
 * @param organizationId - User's organization UUID
 * @param requestId - Request ID for logging
 * @returns Lesson data with course info if access allowed
 * @throws TRPCError if lesson not found or access denied
 */
export async function verifyLessonAccess(
  lessonId: string,
  userId: string,
  organizationId: string,
  requestId: string
): Promise<{
  id: string;
  course_id: string;
  title: string;
  course: { user_id: string; organization_id: string; language: string };
}> {
  const supabase = getSupabaseAdmin();

  // Get lesson with section and course info (lessons -> sections -> courses)
  const { data: lesson, error } = await supabase
    .from('lessons')
    .select('id, title, section_id, sections!inner(course_id, courses!inner(user_id, organization_id, language))')
    .eq('id', lessonId)
    .single();

  if (error || !lesson) {
    logger.warn({
      requestId,
      lessonId,
      userId,
      error,
    }, 'Lesson not found');

    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Lesson not found',
    });
  }

  // TypeScript: sections is a single object due to !inner join
  const section = lesson.sections as unknown as {
    course_id: string;
    courses: {
      user_id: string;
      organization_id: string;
      language: string;
    };
  };
  const course = section.courses;
  const courseId = section.course_id;

  // Check ownership or same organization
  if (course.user_id !== userId && course.organization_id !== organizationId) {
    logger.warn({
      requestId,
      lessonId,
      courseId,
      userId,
      organizationId,
      courseOwnerId: course.user_id,
      courseOrgId: course.organization_id,
    }, 'Lesson access denied');

    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have access to this lesson',
    });
  }

  return {
    id: lesson.id,
    course_id: courseId,
    title: lesson.title,
    course,
  };
}

/**
 * Get next available order index for enrichments in a lesson
 *
 * @param lessonId - Lesson UUID
 * @returns Next available order index (1-based)
 */
export async function getNextOrderIndex(lessonId: string): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('lesson_enrichments')
    .select('order_index')
    .eq('lesson_id', lessonId)
    .order('order_index', { ascending: false })
    .limit(1);

  if (error) {
    logger.error({
      lessonId,
      error: error.message,
    }, 'Failed to get next order index');
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to get next order index',
    });
  }

  // If no enrichments exist, start at 1
  if (!data || data.length === 0) {
    return 1;
  }

  return data[0].order_index + 1;
}

/**
 * Check if enrichment type uses two-stage generation
 *
 * @param enrichmentType - Type of enrichment
 * @returns True if type uses draft -> final flow
 */
export function isTwoStageType(enrichmentType: string): boolean {
  return enrichmentType === 'video' || enrichmentType === 'presentation' || enrichmentType === 'cover';
}

/**
 * Statuses that can be cancelled
 */
export const CANCELLABLE_STATUSES = ['pending', 'draft_generating', 'generating'] as const;

/**
 * Check if enrichment is in a cancellable state
 *
 * @param status - Current enrichment status
 * @returns True if enrichment can be cancelled
 */
export function isCancellableStatus(status: string): boolean {
  return CANCELLABLE_STATUSES.includes(status as typeof CANCELLABLE_STATUSES[number]);
}

/**
 * Build storage path for enrichment asset
 *
 * @param courseId - Course UUID
 * @param lessonId - Lesson UUID
 * @param enrichmentId - Enrichment UUID
 * @param extension - File extension (e.g., 'mp3')
 * @returns Storage path string
 */
export function buildAssetPath(
  courseId: string,
  lessonId: string,
  enrichmentId: string,
  extension: string
): string {
  return `${courseId}/${lessonId}/${enrichmentId}.${extension}`;
}
