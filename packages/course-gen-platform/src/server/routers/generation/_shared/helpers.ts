/**
 * Helper functions for the generation router module.
 */

import type { Database, CourseStructure, Section, Lesson } from '@megacampus/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TRPCError } from '@trpc/server';
import { isValidStyle } from '@megacampus/shared-types/style-prompts';
import { ConcurrencyTracker } from '../../../../shared/concurrency/tracker';
import { logger } from '../../../../shared/logger/index.js';
import type { ConcurrencyCheckResult, NormalizedTier, CourseSettings } from './types';

// Re-export from shared utility (single source of truth)
export { setNestedValue } from '../../../../shared/utils/nested-value';

/**
 * Normalize field path for validation against whitelist
 *
 * Replaces array indices like [0], [1] with wildcard [*] to match against
 * the STAGE5_EDITABLE_FIELDS whitelist which uses wildcard patterns.
 *
 * @param path - Field path like "sections[0].lessons[2].lesson_title"
 * @returns Normalized path like "sections[*].lessons[*].lesson_title"
 *
 * @example
 * normalizePathForValidation("sections[0].section_title") // "sections[*].section_title"
 * normalizePathForValidation("sections[0].lessons[2].lesson_title") // "sections[*].lessons[*].lesson_title"
 * normalizePathForValidation("course_title") // "course_title"
 */
export function normalizePathForValidation(path: string): string {
  return path.replace(/\[\d+\]/g, '[*]');
}

/**
 * Get element at path in course structure
 *
 * Traverses the course structure to retrieve a Section or Lesson at the specified path.
 *
 * @param structure - Course structure to traverse
 * @param path - Element path (e.g., "sections[0]" or "sections[0].lessons[2]")
 * @returns Section or Lesson at the path
 * @throws Error if path is invalid or element not found
 *
 * @example
 * getElementAtPath(structure, "sections[0]") // Returns Section
 * getElementAtPath(structure, "sections[0].lessons[2]") // Returns Lesson
 */
export function getElementAtPath(structure: CourseStructure, path: string): Section | Lesson {
  // Parse path like "sections[0]" or "sections[0].lessons[2]"
  const sectionMatch = path.match(/sections\[(\d+)\]/);
  if (!sectionMatch) {
    throw new Error(`Invalid element path: ${path}`);
  }

  const sectionIdx = parseInt(sectionMatch[1], 10);
  if (sectionIdx < 0 || sectionIdx >= structure.sections.length) {
    throw new Error(`Section index ${sectionIdx} out of bounds`);
  }

  const section = structure.sections[sectionIdx];

  const lessonMatch = path.match(/lessons\[(\d+)\]/);
  if (lessonMatch) {
    const lessonIdx = parseInt(lessonMatch[1], 10);
    if (lessonIdx < 0 || lessonIdx >= section.lessons.length) {
      throw new Error(`Lesson index ${lessonIdx} out of bounds in section ${sectionIdx}`);
    }
    return section.lessons[lessonIdx];
  }

  return section;
}

/**
 * Determine if a user can edit a course
 *
 * Edit permissions are granted if:
 * - User is the course owner (course.user_id === user.id), OR
 * - User is an admin in the same organization (future: organization_id match)
 *
 * For now, only the course owner can edit.
 *
 * @param course - Course object with user_id and optional organization_id
 * @param user - User context with id and role
 * @returns true if user can edit the course, false otherwise
 *
 * @example
 * canUserEditCourse({ user_id: 'user-123', organization_id: 'org-1' }, { id: 'user-123', role: 'instructor' })
 * // Returns: true (owner match)
 *
 * canUserEditCourse({ user_id: 'user-123', organization_id: 'org-1' }, { id: 'user-456', role: 'admin' })
 * // Returns: false (not owner, org admin editing not yet implemented)
 */
export function canUserEditCourse(
  course: { user_id: string; organization_id?: string | null },
  user: { id: string; role: Database['public']['Enums']['role'] }
): boolean {
  // Owner can always edit
  if (course.user_id === user.id) return true;

  // Org admins can edit if they're in the same organization
  // (For now, simplified: only owner can edit)
  // Future: Add organization_id check for admin role
  // if (user.role === 'admin' && course.organization_id && user.organizationId === course.organization_id) return true;

  return false;
}

// Re-export for backward compatibility
export type { NormalizedTier } from './types';

const TIER_MAP: Record<string, NormalizedTier> = {
  trial: 'TRIAL',
  free: 'FREE',
  basic: 'BASIC',
  standard: 'STANDARD',
  premium: 'PREMIUM',
};

/**
 * Extract and normalize tier from course with organization join.
 *
 * @param course - Course object with `organization` relation containing `tier`
 * @returns Normalized uppercase tier string
 */
export function extractTierFromOrg(course: {
  organization?: { tier?: string | null } | null;
}): NormalizedTier {
  const dbTier = course.organization?.tier || 'free';
  return TIER_MAP[dbTier] || 'FREE';
}

/**
 * Check concurrency limits and throw if exceeded.
 * Also logs metrics event to system_metrics on limit hit.
 */
export async function checkConcurrencyLimits(params: {
  userId: string;
  tier: NormalizedTier;
  courseId: string;
  requestId: string;
  supabase: SupabaseClient<Database>;
}): Promise<void> {
  const { userId, tier, courseId, requestId, supabase } = params;
  const concurrencyTracker = new ConcurrencyTracker();
  let concurrencyCheck: ConcurrencyCheckResult;

  try {
    concurrencyCheck = await concurrencyTracker.checkAndReserve(userId, tier);
  } catch (concurrencyError) {
    logger.error({ requestId, userId, tier, error: concurrencyError }, 'Concurrency check failed');
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to check concurrency limits',
    });
  }

  if (!concurrencyCheck.allowed) {
    logger.warn({ requestId, userId, tier, concurrencyCheck }, 'Concurrency limit hit');

    await supabase.from('system_metrics').insert({
      event_type: 'concurrency_limit_hit',
      severity: 'warn',
      user_id: userId,
      metadata: {
        tier,
        ...concurrencyCheck,
        rejected_course_id: courseId,
        request_id: requestId,
      },
    });

    const errorMessage =
      concurrencyCheck?.reason === 'user_limit'
        ? `Too many concurrent jobs. ${tier} tier allows ${concurrencyCheck.user_limit} concurrent course generation.`
        : 'System at capacity. Please try again in a few minutes.';

    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: errorMessage,
    });
  }
}

/** Document summary item for Stage 5 job input */
export interface DocumentSummary {
  file_id: string;
  file_name: string;
  summary: string;
  key_topics: string[];
}

/**
 * Query file_catalog for indexed documents and build summaries for Stage 5.
 */
export async function buildDocumentSummaries(
  supabase: SupabaseClient<Database>,
  courseId: string,
  requestId?: string
): Promise<{ hasVectorizedDocs: boolean; documentSummaries: DocumentSummary[] }> {
  const { data: vectorizedFiles, error: filesError } = await supabase
    .from('file_catalog')
    .select('id, filename, processed_content, mime_type')
    .eq('course_id', courseId)
    .eq('vector_status', 'indexed' as unknown as Database['public']['Enums']['vector_status']);

  if (filesError) {
    // Differentiate expected vs unexpected errors
    const isTableNotFound = filesError.code === '42P01'; // relation does not exist
    if (isTableNotFound) {
      logger.debug(
        { requestId, courseId },
        'file_catalog table not available, assuming no documents'
      );
    } else {
      logger.warn(
        { requestId, courseId, error: filesError, code: filesError.code },
        'Failed to query vectorized files, assuming no documents'
      );
    }
  }

  const hasVectorizedDocs = !filesError && vectorizedFiles && vectorizedFiles.length > 0;

  const documentSummaries: DocumentSummary[] = hasVectorizedDocs
    ? (
        vectorizedFiles as Array<{
          id: string;
          filename: string;
          processed_content: string | null;
          mime_type: string;
        }>
      ).map(file => ({
        file_id: file.id,
        file_name: file.filename,
        summary: file.processed_content || '',
        key_topics: [],
      }))
    : [];

  return { hasVectorizedDocs, documentSummaries };
}

/**
 * Build Stage 5 (Structure Generation) job input data.
 * Shared between restartStage and FULL_REGENERATE chat handler.
 *
 * @param supabase - Supabase admin client
 * @param courseId - Course UUID
 * @param userId - User UUID
 * @param requestId - Request ID for logging
 * @returns Job input data and organization ID
 */
export async function buildStage5JobInput(
  supabase: SupabaseClient<Database>,
  courseId: string,
  userId: string,
  requestId: string
): Promise<{ jobInput: Record<string, unknown>; organizationId: string }> {
  const { data: fullCourse, error: fullCourseError } = await supabase
    .from('courses')
    .select(
      'title, settings, language, style, target_audience, difficulty, analysis_result, organization_id'
    )
    .eq('id', courseId)
    .single();

  if (fullCourseError || !fullCourse) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to fetch course data',
    });
  }

  if (!fullCourse.analysis_result) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Course analysis must be completed before generating structure. Please complete Stage 4 analysis first.',
    });
  }

  const { hasVectorizedDocs, documentSummaries } = await buildDocumentSummaries(
    supabase,
    courseId,
    requestId
  );

  const jobInput = {
    course_id: courseId,
    organization_id: fullCourse.organization_id,
    user_id: userId,
    analysis_result: fullCourse.analysis_result,
    frontend_parameters: {
      course_title: fullCourse.title,
      language: fullCourse.language ?? undefined,
      style: fullCourse.style && isValidStyle(fullCourse.style) ? fullCourse.style : undefined,
      target_audience: fullCourse.target_audience ?? undefined,
      difficulty: fullCourse.difficulty ?? 'intermediate',
      desired_lessons_count: (fullCourse.settings as unknown as CourseSettings)
        ?.desired_lessons_count,
      desired_modules_count: (fullCourse.settings as unknown as CourseSettings)
        ?.desired_modules_count,
      lesson_duration_minutes: (fullCourse.settings as unknown as CourseSettings)
        ?.lesson_duration_minutes,
      learning_outcomes: (fullCourse.settings as unknown as CourseSettings)?.learning_outcomes,
    },
    vectorized_documents: hasVectorizedDocs,
    document_summaries: documentSummaries,
  };

  return { jobInput, organizationId: fullCourse.organization_id };
}
