/**
 * Lesson Content tRPC Router
 * @module server/routers/lesson-content
 *
 * Provides API endpoints for lesson content generation workflow (Stage 6).
 * This router handles enqueueing lesson generation jobs to the BullMQ queue,
 * monitoring progress, retrying failed lessons, and retrieving generated content.
 *
 * Procedures:
 * - start: Enqueue all lessons for parallel processing
 * - getProgress: Get progress for all lessons in a course
 * - retryLesson: Retry a failed lesson generation
 * - getLessonContent: Retrieve generated lesson content
 * - cancel: Cancel all pending jobs for a course
 *
 * Access Control:
 * - All endpoints enforce organization-level RLS via ctx.user.organizationId
 * - Course ownership/access is verified before operations
 *
 * @see stages/stage6-lesson-content/handler.ts - BullMQ handler
 * @see specs/010-stages-456-pipeline/data-model.md - Data model specification
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc';
import { protectedProcedure } from '../middleware/auth';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { logger } from '../../shared/logger/index.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { nanoid } from 'nanoid';
import { addJob } from '../../orchestrator/queue';
import { JobType } from '@megacampus/shared-types';
import type { LessonContentJobData, Language } from '@megacampus/shared-types';
import { LessonSpecificationV2Schema } from '@megacampus/shared-types/lesson-specification-v2';
import { getQueue } from '../../orchestrator/queue';
import { resolveLessonIdOrUuid } from '../../shared/database/lesson-resolver';

// ============================================================================
// Input Schemas
// ============================================================================

/**
 * Input schema for startStage6 procedure
 */
export const startStage6InputSchema = z.object({
  /** Course ID to generate lessons for */
  courseId: z.string().uuid('Invalid course ID'),

  /** Array of lesson specifications to process */
  lessonSpecs: z.array(LessonSpecificationV2Schema).min(1, 'At least one lesson specification required'),

  /** Job priority (1-10, higher = more priority) */
  priority: z.number().int().min(1).max(10).default(5),
});

/**
 * Input schema for getProgress procedure
 */
export const getProgressInputSchema = z.object({
  /** Course ID to get progress for */
  courseId: z.string().uuid('Invalid course ID'),
});

/**
 * Input schema for retryLesson procedure
 */
export const retryLessonInputSchema = z.object({
  /** Course ID the lesson belongs to */
  courseId: z.string().uuid('Invalid course ID'),

  /** Lesson ID to retry */
  lessonId: z.string().min(1, 'Lesson ID is required'),

  /** Lesson specification for retry */
  lessonSpec: LessonSpecificationV2Schema,
});

/**
 * Input schema for getLessonContent procedure
 * Supports two formats for lessonId:
 * - "section.lesson" format (e.g., "1.2", "2.3") - matched via section/lesson order_index
 * - UUID format - matched directly via lesson_id
 */
export const getLessonContentInputSchema = z.object({
  /** Course ID the lesson belongs to */
  courseId: z.string().uuid('Invalid course ID'),

  /** Lesson ID: either "section.lesson" format (e.g., "1.2") or lesson UUID */
  lessonId: z.string().min(1, 'Lesson ID is required'),
});

/**
 * Input schema for cancelStage6 procedure
 */
export const cancelStage6InputSchema = z.object({
  /** Course ID to cancel jobs for */
  courseId: z.string().uuid('Invalid course ID'),
});

/**
 * Input schema for partialGenerate procedure
 */
export const partialGenerateInputSchema = z.object({
  /** Course ID to generate lessons for */
  courseId: z.string().uuid('Invalid course ID'),

  /** Array of lesson IDs in format "section.lesson" (e.g., ["1.1", "1.2", "2.1"]) */
  lessonIds: z.array(z.string().regex(/^\d+\.\d+$/, 'Lesson ID must be in format "section.lesson"')).optional(),

  /** Array of section numbers (e.g., [1, 2, 3]) to generate all lessons in those sections */
  sectionIds: z.array(z.number().int().min(1, 'Section ID must be at least 1')).optional(),

  /** Job priority (1-10, higher = more priority) */
  priority: z.number().int().min(1).max(10).default(5),
}).refine(
  data => (data.lessonIds && data.lessonIds.length > 0) || (data.sectionIds && data.sectionIds.length > 0),
  { message: 'Must provide either lessonIds or sectionIds' }
);

/**
 * Input schema for approveLesson procedure
 */
export const approveLessonInputSchema = z.object({
  /** Course ID the lesson belongs to */
  courseId: z.string().uuid('Invalid course ID'),

  /** Lesson ID: either "section.lesson" format (e.g., "1.2") or lesson UUID */
  lessonId: z.string().min(1, 'Lesson ID is required'),
});

/**
 * Lesson content validation schema
 * Validates the structure and limits of user-provided lesson content
 */
const lessonContentSchema = z.object({
  /** Optional introduction text */
  intro: z.string().max(10000, 'Introduction too long (max 10000 characters)').optional(),

  /** Lesson sections with title and content */
  sections: z
    .array(
      z.object({
        title: z.string().max(500, 'Section title too long (max 500 characters)'),
        content: z.string().max(100000, 'Section content too long (max 100000 characters)'),
      })
    )
    .max(50, 'Too many sections (max 50)')
    .optional(),

  /** Optional summary text */
  summary: z.string().max(10000, 'Summary too long (max 10000 characters)').optional(),

  /** Optional exercises array (not validated deeply for flexibility) */
  exercises: z.array(z.unknown()).max(100, 'Too many exercises (max 100)').optional(),
}).strict(); // Reject unknown fields

/**
 * Input schema for updateLessonContent procedure
 */
export const updateLessonContentInputSchema = z.object({
  /** Course ID the lesson belongs to */
  courseId: z.string().uuid('Invalid course ID'),

  /** Lesson ID: either "section.lesson" format (e.g., "1.2") or lesson UUID */
  lessonId: z.string().min(1, 'Lesson ID is required'),

  /** The updated lesson content object */
  content: lessonContentSchema,
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Verify user has access to course (course owner or same organization)
 *
 * @param courseId - Course UUID
 * @param userId - User UUID
 * @param organizationId - User's organization UUID
 * @param requestId - Request ID for logging
 * @returns Course data if access allowed
 * @throws TRPCError if course not found or access denied
 */
async function verifyCourseAccess(
  courseId: string,
  userId: string,
  organizationId: string,
  requestId: string
): Promise<{ id: string; user_id: string; organization_id: string; language: Language }> {
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
    language: (course.language || 'en') as Language, // Default to English if not set
  };
}

/**
 * Build minimal LessonSpecificationV2 from course_structure lesson data
 *
 * Creates a simplified but valid LessonSpecificationV2 object from the basic
 * lesson data stored in course_structure. This is used for partial regeneration
 * when full semantic scaffolding specs are not available.
 *
 * @param lessonId - Lesson ID in format "section.lesson"
 * @param lesson - Lesson data from course_structure
 * @param sectionNumber - Section number (1-based)
 * @param requestId - Request ID for logging
 * @returns Minimal but valid LessonSpecificationV2 object
 */
function buildMinimalLessonSpec(
  lessonId: string,
  lesson: {
    lesson_title: string;
    lesson_objectives?: string[];
    key_topics?: string[];
    estimated_duration_minutes?: number;
    difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
  },
  _sectionNumber: number,
  requestId: string
): import('@megacampus/shared-types/lesson-specification-v2').LessonSpecificationV2 {
  // Build learning objectives with minimal structure
  const learningObjectives = (lesson.lesson_objectives || ['Complete this lesson']).map((text, idx) => ({
    id: `LO-${lessonId}-${idx + 1}`,
    objective: text.length >= 10 ? text : `Learn about ${lesson.lesson_title}`,
    bloom_level: 'understand' as const,
  }));

  // Build key points from key_topics
  const keyPoints = (lesson.key_topics || [lesson.lesson_title]).map(topic =>
    topic.length >= 5 ? topic : `Introduction to ${topic}`
  );

  logger.debug({
    requestId,
    lessonId,
    title: lesson.lesson_title,
    objectivesCount: learningObjectives.length,
    keyPointsCount: keyPoints.length,
  }, 'Building minimal lesson spec from course_structure');

  // Return minimal but valid LessonSpecificationV2
  return {
    lesson_id: lessonId,
    title: lesson.lesson_title,
    description: (lesson.lesson_objectives || [])[0] || `This lesson covers ${lesson.lesson_title}`,
    metadata: {
      target_audience: 'practitioner',
      tone: 'conversational-professional',
      compliance_level: 'standard',
      content_archetype: 'concept_explainer',
    },
    learning_objectives: learningObjectives,
    intro_blueprint: {
      hook_strategy: 'question',
      hook_topic: lesson.lesson_title,
      key_learning_objectives: learningObjectives.map(lo => lo.objective).join(', '),
    },
    sections: [
      {
        title: 'Main Content',
        content_archetype: 'concept_explainer',
        rag_context_id: 'default',
        constraints: {
          depth: 'detailed_analysis',
          required_keywords: lesson.key_topics || [],
          prohibited_terms: [],
        },
        key_points_to_cover: keyPoints,
      },
    ],
    exercises: [],
    rag_context: {
      primary_documents: ['default-course-document'],
      search_queries: lesson.key_topics || [lesson.lesson_title],
      expected_chunks: 7,
    },
    estimated_duration_minutes: lesson.estimated_duration_minutes || 15,
    difficulty_level: lesson.difficulty_level || 'intermediate',
  };
}

// ============================================================================
// Router Definition
// ============================================================================

/**
 * Lesson content router
 *
 * Provides endpoints for lesson content generation:
 * - start: Enqueue lessons for parallel processing
 * - getProgress: Monitor generation progress
 * - retryLesson: Retry failed lessons
 * - getLessonContent: Retrieve generated content
 * - cancel: Cancel pending jobs
 */
export const lessonContentRouter = router({
  /**
   * Start Stage 6 generation for a course
   *
   * Purpose: Enqueues all lesson specifications for parallel processing via BullMQ.
   * Each lesson is processed independently by the Stage 6 worker with 30 concurrent workers.
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - courseId: UUID of the course to generate lessons for
   * - lessonSpecs: Array of LessonSpecificationV2 objects
   * - priority (optional): Job priority 1-10, default 5
   *
   * Output:
   * - success: Boolean success flag
   * - jobCount: Number of jobs enqueued
   * - jobIds: Array of BullMQ job IDs for tracking
   *
   * Validation:
   * - Course exists and user has access
   * - At least one lesson specification provided
   * - All lesson specs pass LessonSpecificationV2 validation
   *
   * Error Handling:
   * - Course not found -> 404 NOT_FOUND
   * - Access denied -> 403 FORBIDDEN
   * - Invalid lesson specs -> 400 BAD_REQUEST
   * - Queue error -> 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const result = await trpc.lessonContent.startStage6.mutate({
   *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
   *   lessonSpecs: [lessonSpec1, lessonSpec2],
   *   priority: 7,
   * });
   * // { success: true, jobCount: 2, jobIds: ['job1', 'job2'] }
   * ```
   */
  startStage6: protectedProcedure
    .use(createRateLimiter({ requests: 5, window: 60 })) // 5 Stage 6 starts per minute
    .input(startStage6InputSchema)
    .mutation(async ({ ctx, input }) => {
      const { courseId, lessonSpecs, priority } = input;
      const requestId = nanoid();

      // ctx.user is guaranteed non-null by protectedProcedure middleware
      const currentUser = ctx.user;

      logger.info({
        requestId,
        courseId,
        userId: currentUser.id,
        organizationId: currentUser.organizationId,
        lessonCount: lessonSpecs.length,
        priority,
      }, 'Stage 6 start request');

      try {
        // Step 1: Verify course access and get course language
        const course = await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

        // Step 2: Enqueue all lessons using addJob with deduplication
        const jobs = await Promise.all(
          lessonSpecs.map((spec) => {
            const jobData: LessonContentJobData = {
              organizationId: currentUser.organizationId,
              courseId,
              userId: currentUser.id,
              jobType: JobType.LESSON_CONTENT,
              createdAt: new Date().toISOString(),
              lessonSpec: spec,
              ragChunks: [], // Deprecated: RAG chunks are now fetched by handler via retrieveLessonContext()
              ragContextId: null,
              language: course.language, // Pass course language for content generation
            };

            // Deterministic job ID for deduplication
            // Format: stage6:{courseId}:{lessonId}
            const deduplicationId = `stage6:${courseId}:${spec.lesson_id}`;

            return addJob(JobType.LESSON_CONTENT, jobData, {
              priority,
              deduplication: {
                id: deduplicationId,
                ttl: 150000, // 2.5 minutes - half of job timeout to allow faster retries
              },
            });
          })
        );

        // Step 3: Log success
        logger.info({
          requestId,
          courseId,
          lessonsEnqueued: jobs.length,
          jobIds: jobs.map((j) => j.id),
        }, 'Stage 6 jobs enqueued');

        return {
          success: true,
          jobCount: jobs.length,
          jobIds: jobs.map((j) => j.id).filter((id): id is string => id !== undefined),
        };
      } catch (error) {
        // Re-throw tRPC errors as-is
        if (error instanceof TRPCError) {
          throw error;
        }

        // Log and wrap unexpected errors
        logger.error({
          requestId,
          courseId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Stage 6 start failed');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start Stage 6 generation',
        });
      }
    }),

  /**
   * Get progress for all lessons in a course
   *
   * Purpose: Retrieves progress information for all lessons in a course.
   * Returns counts for completed, failed, and in-progress lessons along
   * with individual lesson status.
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - courseId: UUID of the course to get progress for
   *
   * Output:
   * - total: Total number of lessons
   * - completed: Number of completed lessons
   * - failed: Number of failed lessons
   * - inProgress: Number of lessons currently processing
   * - progressPercent: Overall completion percentage (0-100)
   * - lessons: Array of lesson status objects
   *
   * Error Handling:
   * - Course not found -> 404 NOT_FOUND
   * - Access denied -> 403 FORBIDDEN
   *
   * @example
   * ```typescript
   * const progress = await trpc.lessonContent.getProgress.query({
   *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
   * });
   * // { total: 10, completed: 7, failed: 1, inProgress: 2, progressPercent: 70, lessons: [...] }
   * ```
   */
  getProgress: protectedProcedure
    .use(createRateLimiter({ requests: 30, window: 60 })) // 30 progress checks per minute
    .input(getProgressInputSchema)
    .query(async ({ ctx, input }) => {
      const { courseId } = input;
      const requestId = nanoid();

      // ctx.user is guaranteed non-null by protectedProcedure middleware
      const currentUser = ctx.user;

      try {
        // Step 1: Verify course access
        await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

        // Step 2: Query lesson status from database
        // Note: Using lessons table until lesson_contents table is available
        // Join through sections to filter by course_id (lessons -> sections -> course)
        const supabase = getSupabaseAdmin();

        const { data: lessons, error } = await supabase
          .from('lessons')
          .select('id, content, updated_at, sections!inner(course_id)')
          .eq('sections.course_id', courseId);

        if (error) {
          logger.error({
            requestId,
            courseId,
            error: error.message,
          }, 'Failed to fetch lesson progress');

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch lesson progress',
          });
        }

        // Step 3: Calculate progress metrics
        // For now, a lesson is "completed" if it has content
        const lessonsWithStatus = (lessons || []).map((lesson) => ({
          lesson_id: lesson.id,
          status: lesson.content ? 'completed' : 'pending',
          generated_at: lesson.content ? lesson.updated_at : null,
        }));

        const total = lessonsWithStatus.length;
        const completed = lessonsWithStatus.filter((l) => l.status === 'completed').length;
        const failed = 0; // Will be tracked separately when lesson_contents table is available
        const inProgress = total - completed - failed;

        logger.debug({
          requestId,
          courseId,
          total,
          completed,
          failed,
          inProgress,
        }, 'Retrieved lesson progress');

        return {
          total,
          completed,
          failed,
          inProgress,
          progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
          lessons: lessonsWithStatus,
        };
      } catch (error) {
        // Re-throw tRPC errors as-is
        if (error instanceof TRPCError) {
          throw error;
        }

        // Log and wrap unexpected errors
        logger.error({
          requestId,
          courseId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Failed to get Stage 6 progress');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get lesson progress',
        });
      }
    }),

  /**
   * Retry a failed lesson
   *
   * Purpose: Re-enqueues a failed lesson for generation with high priority.
   * Useful for recovering from transient failures or after fixing issues.
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - courseId: UUID of the course
   * - lessonId: ID of the lesson to retry
   * - lessonSpec: Updated lesson specification
   *
   * Output:
   * - success: Boolean success flag
   * - jobId: New BullMQ job ID
   *
   * Error Handling:
   * - Course not found -> 404 NOT_FOUND
   * - Access denied -> 403 FORBIDDEN
   * - Queue error -> 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const result = await trpc.lessonContent.retryLesson.mutate({
   *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
   *   lessonId: '1.1',
   *   lessonSpec: updatedSpec,
   * });
   * // { success: true, jobId: 'job_retry_123' }
   * ```
   */
  retryLesson: protectedProcedure
    .use(createRateLimiter({ requests: 10, window: 60 })) // 10 retries per minute
    .input(retryLessonInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { courseId, lessonId, lessonSpec } = input;
      const requestId = nanoid();

      // ctx.user is guaranteed non-null by protectedProcedure middleware
      const currentUser = ctx.user;

      logger.info({
        requestId,
        courseId,
        lessonId,
        userId: currentUser.id,
      }, 'Stage 6 retry request');

      try {
        // Step 1: Verify course access and get course language
        const course = await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

        // Step 2: Enqueue with high priority for retries
        const jobData: LessonContentJobData = {
          organizationId: currentUser.organizationId,
          courseId,
          userId: currentUser.id,
          jobType: JobType.LESSON_CONTENT,
          createdAt: new Date().toISOString(),
          lessonSpec,
          ragChunks: [], // Deprecated: RAG chunks are now fetched by handler via retrieveLessonContext()
          ragContextId: null,
          language: course.language, // Pass course language for content generation
        };

        // Unique deduplication ID for retries (includes timestamp)
        // Format: stage6:retry:{courseId}:{lessonId}:{timestamp}
        // This ensures retries are never deduplicated
        const deduplicationId = `stage6:retry:${courseId}:${lessonId}:${Date.now()}`;

        const job = await addJob(JobType.LESSON_CONTENT, jobData, {
          priority: 1, // High priority for retries
          deduplication: {
            id: deduplicationId,
            ttl: 150000, // 2.5 minutes - half of job timeout to allow faster retries
          },
        });

        logger.info({
          requestId,
          courseId,
          lessonId,
          jobId: job.id,
        }, 'Stage 6 retry job enqueued');

        return {
          success: true,
          jobId: job.id,
        };
      } catch (error) {
        // Re-throw tRPC errors as-is
        if (error instanceof TRPCError) {
          throw error;
        }

        // Log and wrap unexpected errors
        logger.error({
          requestId,
          courseId,
          lessonId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Stage 6 retry failed');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retry lesson generation',
        });
      }
    }),

  /**
   * Get lesson content
   *
   * Purpose: Retrieves the generated content for a specific lesson.
   * Returns the full lesson content including sections, examples, and exercises.
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - courseId: UUID of the course
   * - lessonId: ID of the lesson to retrieve
   *
   * Output:
   * - Lesson content object or null if not generated
   *
   * Error Handling:
   * - Course not found -> 404 NOT_FOUND
   * - Access denied -> 403 FORBIDDEN
   * - Lesson not found -> returns null
   *
   * @example
   * ```typescript
   * const content = await trpc.lessonContent.getLessonContent.query({
   *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
   *   lessonId: '1.1',
   * });
   * // { id: '...', content: '...', ... }
   * ```
   */
  getLessonContent: protectedProcedure
    .use(createRateLimiter({ requests: 60, window: 60 })) // 60 content fetches per minute
    .input(getLessonContentInputSchema)
    .query(async ({ ctx, input }) => {
      const { courseId, lessonId } = input;
      const requestId = nanoid();

      // ctx.user is guaranteed non-null by protectedProcedure middleware
      const currentUser = ctx.user;

      try {
        // Step 1: Verify course access
        await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

        const supabase = getSupabaseAdmin();

        // Step 2: Resolve lesson UUID from lessonId
        // Check if lessonId is in "section.lesson" format (e.g., "1.2")
        const sectionLessonMatch = lessonId.match(/^(\d+)\.(\d+)$/);
        let lessonUuid: string | null = null;

        if (sectionLessonMatch) {
          // Format: "section.lesson" - resolve to UUID via sections/lessons tables
          const sectionNum = parseInt(sectionLessonMatch[1], 10);
          const lessonNum = parseInt(sectionLessonMatch[2], 10);

          const { data: lessonData, error: lessonError } = await supabase
            .from('lessons')
            .select('id, sections!inner(course_id, order_index)')
            .eq('sections.course_id', courseId)
            .eq('sections.order_index', sectionNum)
            .eq('order_index', lessonNum)
            .single();

          if (lessonError || !lessonData) {
            logger.debug({
              requestId,
              courseId,
              lessonId,
              sectionNum,
              lessonNum,
            }, 'Lesson not found by section.lesson format');
            return null;
          }

          lessonUuid = lessonData.id;
        } else {
          // Assume it's already a UUID
          lessonUuid = lessonId;
        }

        // Step 3: Query lesson_contents for the latest version
        // Get the most recent content for this lesson (highest created_at)
        const { data, error } = await supabase
          .from('lesson_contents')
          .select('*')
          .eq('course_id', courseId)
          .eq('lesson_id', lessonUuid)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = not found
          logger.error({
            requestId,
            courseId,
            lessonId,
            lessonUuid,
            error: error.message,
          }, 'Failed to fetch lesson content from lesson_contents');

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch lesson content',
          });
        }

        logger.debug({
          requestId,
          courseId,
          lessonId,
          lessonUuid,
          found: !!data,
          contentLength: data?.content ? JSON.stringify(data.content).length : 0,
        }, 'Retrieved lesson content from lesson_contents');

        return data;
      } catch (error) {
        // Re-throw tRPC errors as-is
        if (error instanceof TRPCError) {
          throw error;
        }

        // Log and wrap unexpected errors
        logger.error({
          requestId,
          courseId,
          lessonId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Failed to get lesson content');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get lesson content',
        });
      }
    }),

  /**
   * Cancel all pending jobs for a course
   *
   * Purpose: Cancels all pending Stage 6 jobs for a course.
   * Already completed or in-progress jobs are not affected.
   * Jobs that have transitioned to active state between fetching and removal
   * will be reported in failedJobIds but won't fail the operation.
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - courseId: UUID of the course to cancel jobs for
   *
   * Output:
   * - success: Boolean success flag
   * - cancelledJobsCount: Number of jobs successfully cancelled
   * - failedJobIds: Array of job IDs that couldn't be cancelled (optional, only if any failed)
   *
   * Error Handling:
   * - Course not found -> 404 NOT_FOUND
   * - Access denied -> 403 FORBIDDEN
   *
   * @example
   * ```typescript
   * const result = await trpc.lessonContent.cancelStage6.mutate({
   *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
   * });
   * // { success: true, cancelledJobsCount: 5 }
   * ```
   */
  cancelStage6: protectedProcedure
    .use(createRateLimiter({ requests: 5, window: 60 })) // 5 cancels per minute
    .input(cancelStage6InputSchema)
    .mutation(async ({ ctx, input }) => {
      const { courseId } = input;
      const requestId = nanoid();

      // ctx.user is guaranteed non-null by protectedProcedure middleware
      const currentUser = ctx.user;

      logger.info({
        requestId,
        courseId,
        userId: currentUser.id,
      }, 'Stage 6 cancel request');

      try {
        // Step 1: Verify course access
        await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

        // Step 2: Get the main course-generation queue and find jobs for this course
        const queue = getQueue();

        // Get all pending jobs (waiting and delayed states)
        const pendingJobs = await queue.getJobs(['waiting', 'delayed']);

        // Filter jobs by courseId
        const courseJobs = pendingJobs.filter(job => job.data?.courseId === courseId);

        logger.info({
          requestId,
          courseId,
          totalPendingJobs: pendingJobs.length,
          courseJobsFound: courseJobs.length,
        }, 'Found pending jobs to cancel');

        // Step 3: Remove each matching job
        let cancelledCount = 0;
        const failedJobIds: string[] = [];

        for (const job of courseJobs) {
          try {
            await job.remove();
            cancelledCount++;
            const lessonId = job.data?.jobType === JobType.LESSON_CONTENT
              ? (job.data).lessonSpec?.lesson_id
              : undefined;
            logger.debug({
              requestId,
              jobId: job.id,
              lessonId,
            }, 'Cancelled job');
          } catch (jobError) {
            // Job might have moved to active state between getJobs and remove
            const jobId = job.id ?? 'unknown';
            failedJobIds.push(jobId);
            logger.warn({
              requestId,
              jobId,
              error: jobError instanceof Error ? jobError.message : String(jobError),
            }, 'Failed to remove job (may have started processing)');
          }
        }

        // Step 4: Update lesson_contents status if table exists
        // Note: This is optional - only update if records exist
        const supabaseAdmin = getSupabaseAdmin();
        let dbUpdatedCount = 0;

        try {
          const { data } = await supabaseAdmin
            .from('lessons')
            .update({
              updated_at: new Date().toISOString(),
            })
            .eq('course_id', courseId)
            .is('content', null) // Only update lessons without content (still pending)
            .select('id');

          dbUpdatedCount = data?.length ?? 0;
        } catch (dbError) {
          // Non-critical - log and continue
          logger.warn({
            requestId,
            courseId,
            error: dbError instanceof Error ? dbError.message : String(dbError),
          }, 'Failed to update lesson records (non-critical)');
        }

        logger.info({
          requestId,
          courseId,
          cancelledCount,
          failedCount: failedJobIds.length,
          dbUpdatedCount,
        }, 'Stage 6 cancellation completed');

        return {
          success: true,
          cancelledJobsCount: cancelledCount,
          failedJobIds: failedJobIds.length > 0 ? failedJobIds : undefined,
        };
      } catch (error) {
        // Re-throw tRPC errors as-is
        if (error instanceof TRPCError) {
          throw error;
        }

        // Log and wrap unexpected errors
        logger.error({
          requestId,
          courseId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Stage 6 cancel failed');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to cancel Stage 6 generation',
        });
      }
    }),

  /**
   * Partial Stage 6 generation for selected lessons
   *
   * Purpose: Regenerate specific lessons or sections without requiring frontend
   * to provide full lesson specifications. Fetches lesson data from course_structure
   * and builds minimal LessonSpecificationV2 objects for selected lessons.
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - courseId: UUID of the course
   * - lessonIds (optional): Array of lesson IDs in format "section.lesson" (e.g., ["1.1", "2.3"])
   * - sectionIds (optional): Array of section numbers to generate all lessons (e.g., [1, 3])
   * - priority (optional): Job priority 1-10, default 5
   *
   * Output:
   * - success: Boolean success flag
   * - jobCount: Number of jobs enqueued
   * - jobIds: Array of BullMQ job IDs for tracking
   * - selectedLessonIds: Array of lesson IDs that were enqueued
   *
   * Validation:
   * - Course exists and user has access
   * - Course has completed Stage 5 (course_structure exists)
   * - Must provide either lessonIds OR sectionIds (not both empty)
   * - Lesson IDs must exist in course_structure
   *
   * Error Handling:
   * - Course not found -> 404 NOT_FOUND
   * - Access denied -> 403 FORBIDDEN
   * - Course structure missing -> 400 BAD_REQUEST
   * - Invalid lesson IDs -> 400 BAD_REQUEST
   * - Queue error -> 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * // Regenerate specific lessons
   * const result = await trpc.lessonContent.partialGenerate.mutate({
   *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
   *   lessonIds: ['1.1', '1.2', '2.1'],
   *   priority: 7,
   * });
   * // { success: true, jobCount: 3, jobIds: [...], selectedLessonIds: ['1.1', '1.2', '2.1'] }
   *
   * // Regenerate all lessons in sections
   * const result2 = await trpc.lessonContent.partialGenerate.mutate({
   *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
   *   sectionIds: [1, 3],
   * });
   * // { success: true, jobCount: 8, jobIds: [...], selectedLessonIds: ['1.1', '1.2', ..., '3.1', '3.2'] }
   * ```
   */
  partialGenerate: protectedProcedure
    .use(createRateLimiter({ requests: 10, window: 60 })) // 10 partial generations per minute
    .input(partialGenerateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { courseId, lessonIds, sectionIds, priority } = input;
      const requestId = nanoid();

      // ctx.user is guaranteed non-null by protectedProcedure middleware
      const currentUser = ctx.user;

      logger.info({
        requestId,
        courseId,
        userId: currentUser.id,
        organizationId: currentUser.organizationId,
        lessonIds,
        sectionIds,
        priority,
      }, 'Partial Stage 6 generation request');

      try {
        // Step 1: Verify course access
        await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

        // Step 2: Fetch course_structure and language from database
        const supabase = getSupabaseAdmin();

        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('course_structure, language')
          .eq('id', courseId)
          .single();

        if (courseError || !course) {
          logger.error({
            requestId,
            courseId,
            error: courseError,
          }, 'Failed to fetch course structure');

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch course structure',
          });
        }

        // Step 3: Validate course_structure exists
        const courseStructure = course.course_structure as {
          sections: Array<{
            section_number: number;
            section_title: string;
            lessons: Array<{
              lesson_number: number;
              lesson_title: string;
              lesson_objectives?: string[];
              key_topics?: string[];
              estimated_duration_minutes?: number;
              difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
            }>;
          }>;
        } | null;

        if (!courseStructure || !courseStructure.sections) {
          logger.warn({
            requestId,
            courseId,
          }, 'Course structure is missing - Stage 5 may not be completed');

          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Course structure not found. Please complete Stage 5 generation first.',
          });
        }

        // Step 3.5: Auto-approve Stage 5 if awaiting approval
        // When user triggers partial generation, structure is implicitly approved
        const { data: statusData } = await supabase
          .from('courses')
          .select('generation_status')
          .eq('id', courseId)
          .single();

        const currentStatus = statusData?.generation_status;
        if (currentStatus === 'stage_5_awaiting_approval') {
          logger.info({
            requestId,
            courseId,
            currentStatus,
          }, 'Auto-approving Stage 5 - structure approved for partial generation');

          // Update status to stage_5_complete (Stage 6 work proceeds from here)
          const { error: updateError } = await supabase
            .from('courses')
            .update({ generation_status: 'stage_5_complete' })
            .eq('id', courseId);

          if (updateError) {
            logger.error({
              requestId,
              courseId,
              error: updateError,
            }, 'Failed to update generation_status');
          }
        }

        // Step 3.6: Materialize sections and lessons from course_structure if not exists
        // This runs regardless of status - ensures DB has actual section/lesson records
        const { data: existingSections } = await supabase
          .from('sections')
          .select('id')
          .eq('course_id', courseId)
          .limit(1);

        if (!existingSections || existingSections.length === 0) {
          logger.info({
            requestId,
            courseId,
          }, 'Materializing sections and lessons from course_structure');

          // Create sections
          for (const section of courseStructure.sections) {
            const { data: newSection, error: sectionError } = await supabase
              .from('sections')
              .insert({
                course_id: courseId,
                title: section.section_title,
                order_index: section.section_number,
              })
              .select('id')
              .single();

            if (sectionError || !newSection) {
              logger.error({
                requestId,
                courseId,
                sectionNumber: section.section_number,
                error: sectionError,
              }, 'Failed to create section');
              continue;
            }

            // Create lessons for this section
            for (const lesson of section.lessons) {
              const { error: lessonError } = await supabase
                .from('lessons')
                .insert({
                  section_id: newSection.id,
                  title: lesson.lesson_title,
                  order_index: lesson.lesson_number,
                  lesson_type: 'text',
                  duration_minutes: lesson.estimated_duration_minutes || 15,
                  objectives: lesson.lesson_objectives || [],
                });

              if (lessonError) {
                logger.error({
                  requestId,
                  courseId,
                  lessonId: `${section.section_number}.${lesson.lesson_number}`,
                  error: lessonError,
                }, 'Failed to create lesson');
              }
            }
          }

          logger.info({
            requestId,
            courseId,
            sectionsCount: courseStructure.sections.length,
          }, 'Sections and lessons materialized successfully');
        }

        // Step 4: Build list of lesson IDs to generate
        const lessonIdsToGenerate: string[] = [];

        if (lessonIds && lessonIds.length > 0) {
          // Use provided lesson IDs
          lessonIdsToGenerate.push(...lessonIds);
        } else if (sectionIds && sectionIds.length > 0) {
          // Build lesson IDs from section IDs
          for (const sectionId of sectionIds) {
            const section = courseStructure.sections.find(s => s.section_number === sectionId);
            if (section) {
              for (const lesson of section.lessons) {
                lessonIdsToGenerate.push(`${sectionId}.${lesson.lesson_number}`);
              }
            }
          }
        }

        if (lessonIdsToGenerate.length === 0) {
          logger.warn({
            requestId,
            courseId,
            lessonIds,
            sectionIds,
          }, 'No lessons found to generate');

          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No valid lessons found for the provided IDs',
          });
        }

        // Step 5: Build lesson specifications from course_structure
        const lessonSpecs: import('@megacampus/shared-types/lesson-specification-v2').LessonSpecificationV2[] = [];

        for (const lessonId of lessonIdsToGenerate) {
          const [sectionNumStr, lessonNumStr] = lessonId.split('.');
          const sectionNum = parseInt(sectionNumStr, 10);
          const lessonNum = parseInt(lessonNumStr, 10);

          const section = courseStructure.sections.find(s => s.section_number === sectionNum);
          if (!section) {
            logger.warn({
              requestId,
              lessonId,
              sectionNum,
            }, 'Section not found in course_structure');
            continue;
          }

          const lesson = section.lessons.find(l => l.lesson_number === lessonNum);
          if (!lesson) {
            logger.warn({
              requestId,
              lessonId,
              sectionNum,
              lessonNum,
            }, 'Lesson not found in course_structure');
            continue;
          }

          const spec = buildMinimalLessonSpec(lessonId, lesson, sectionNum, requestId);
          lessonSpecs.push(spec);
        }

        if (lessonSpecs.length === 0) {
          logger.warn({
            requestId,
            courseId,
            lessonIdsToGenerate,
          }, 'No lesson specifications built from course_structure');

          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Failed to build lesson specifications from course structure',
          });
        }

        // Step 6: Enqueue all lessons using addJob with deduplication
        const courseLanguage = (course.language || 'en') as Language;
        const jobs = await Promise.all(
          lessonSpecs.map((spec) => {
            const jobData: LessonContentJobData = {
              organizationId: currentUser.organizationId,
              courseId,
              userId: currentUser.id,
              jobType: JobType.LESSON_CONTENT,
              createdAt: new Date().toISOString(),
              lessonSpec: spec,
              ragChunks: [], // Deprecated: RAG chunks are now fetched by handler via retrieveLessonContext()
              ragContextId: null,
              language: courseLanguage, // Pass course language for content generation
            };

            // Deterministic job ID for deduplication
            // Format: stage6:{courseId}:{lessonId}
            const deduplicationId = `stage6:${courseId}:${spec.lesson_id}`;

            return addJob(JobType.LESSON_CONTENT, jobData, {
              priority,
              deduplication: {
                id: deduplicationId,
                ttl: 150000, // 2.5 minutes - half of job timeout to allow faster retries
              },
            });
          })
        );

        // Step 7: Log success
        logger.info({
          requestId,
          courseId,
          lessonsEnqueued: jobs.length,
          jobIds: jobs.map((j) => j.id),
          selectedLessonIds: lessonSpecs.map(s => s.lesson_id),
        }, 'Partial Stage 6 jobs enqueued');

        return {
          success: true,
          jobCount: jobs.length,
          jobIds: jobs.map((j) => j.id).filter((id): id is string => id !== undefined),
          selectedLessonIds: lessonSpecs.map(s => s.lesson_id),
        };
      } catch (error) {
        // Re-throw tRPC errors as-is
        if (error instanceof TRPCError) {
          throw error;
        }

        // Log and wrap unexpected errors
        logger.error({
          requestId,
          courseId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Partial Stage 6 generation failed');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start partial generation',
        });
      }
    }),

  /**
   * Approve a lesson after review
   *
   * Purpose: Marks a lesson as approved after user review. Updates lesson_contents
   * status to 'approved' and records approval metadata.
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - courseId: UUID of the course
   * - lessonId: ID of the lesson to approve (format: "section.lesson" or UUID)
   *
   * Output:
   * - success: Boolean success flag
   *
   * Error Handling:
   * - Course not found -> 404 NOT_FOUND
   * - Access denied -> 403 FORBIDDEN
   * - Lesson not found -> 404 NOT_FOUND
   *
   * @example
   * ```typescript
   * const result = await trpc.lessonContent.approveLesson.mutate({
   *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
   *   lessonId: '1.2',
   * });
   * // { success: true }
   * ```
   */
  approveLesson: protectedProcedure
    .use(createRateLimiter({ requests: 30, window: 60 })) // 30 approvals per minute
    .input(approveLessonInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { courseId, lessonId } = input;
      const requestId = nanoid();
      const currentUser = ctx.user;

      logger.info({ requestId, courseId, lessonId, userId: currentUser.id }, 'Approve lesson request');

      try {
        // Step 1: Verify course access
        await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

        // Step 2: Resolve lesson UUID
        const lessonUuid = await resolveLessonIdOrUuid(courseId, lessonId);
        if (!lessonUuid) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Lesson not found' });
        }

        // Step 3: Fetch current lesson content to preserve metadata
        const supabase = getSupabaseAdmin();
        const { data: currentLesson, error: fetchError } = await supabase
          .from('lesson_contents')
          .select('metadata')
          .eq('course_id', courseId)
          .eq('lesson_id', lessonUuid)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          logger.error({ requestId, error: fetchError.message }, 'Failed to fetch current lesson');
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch lesson' });
        }

        // Step 4: Update lesson_contents status to approved
        const updatedMetadata = {
          ...(currentLesson?.metadata as object || {}),
          approved_at: new Date().toISOString(),
          approved_by: currentUser.id,
        };

        const { error } = await supabase
          .from('lesson_contents')
          .update({
            status: 'approved',
            updated_at: new Date().toISOString(),
            metadata: updatedMetadata,
          })
          .eq('course_id', courseId)
          .eq('lesson_id', lessonUuid);

        if (error) {
          logger.error({ requestId, error: error.message }, 'Failed to approve lesson');
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to approve lesson' });
        }

        logger.info({ requestId, courseId, lessonId }, 'Lesson approved successfully');
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        logger.error({ requestId, error: error instanceof Error ? error.message : String(error) }, 'Approve lesson failed');
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to approve lesson' });
      }
    }),

  /**
   * Update lesson content (manual edits)
   *
   * Purpose: Allows users to save manual edits to lesson content. Updates the
   * content field in lesson_contents table and records update metadata.
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - courseId: UUID of the course
   * - lessonId: ID of the lesson to update (format: "section.lesson" or UUID)
   * - content: The updated lesson content object
   *
   * Output:
   * - success: Boolean success flag
   *
   * Error Handling:
   * - Course not found -> 404 NOT_FOUND
   * - Access denied -> 403 FORBIDDEN
   * - Lesson not found -> 404 NOT_FOUND
   *
   * @example
   * ```typescript
   * const result = await trpc.lessonContent.updateLessonContent.mutate({
   *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
   *   lessonId: '1.2',
   *   content: { title: 'Updated Title', sections: [...] },
   * });
   * // { success: true }
   * ```
   */
  updateLessonContent: protectedProcedure
    .use(createRateLimiter({ requests: 20, window: 60 })) // 20 updates per minute
    .input(updateLessonContentInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { courseId, lessonId, content } = input;
      const requestId = nanoid();
      const currentUser = ctx.user;

      logger.info({ requestId, courseId, lessonId, userId: currentUser.id }, 'Update lesson content request');

      try {
        // Step 1: Verify course access
        await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

        // Step 2: Resolve lesson UUID
        const lessonUuid = await resolveLessonIdOrUuid(courseId, lessonId);
        if (!lessonUuid) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Lesson not found' });
        }

        // Step 3: Fetch current lesson to preserve metadata
        const supabase = getSupabaseAdmin();
        const { data: currentLesson, error: fetchError } = await supabase
          .from('lesson_contents')
          .select('metadata')
          .eq('course_id', courseId)
          .eq('lesson_id', lessonUuid)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          logger.error({ requestId, error: fetchError.message }, 'Failed to fetch current lesson');
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch lesson' });
        }

        // Step 4: Update lesson content with updated metadata
        const updatedMetadata = {
          ...(currentLesson?.metadata as object || {}),
          updated_by: currentUser.id,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('lesson_contents')
          .update({
            content: content as any, // Content is JSONB in database
            updated_at: new Date().toISOString(),
            metadata: updatedMetadata as any, // Metadata is JSONB in database
          })
          .eq('course_id', courseId)
          .eq('lesson_id', lessonUuid);

        if (error) {
          logger.error({ requestId, error: error.message }, 'Failed to update lesson content');
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update lesson content' });
        }

        logger.info({ requestId, courseId, lessonId }, 'Lesson content updated successfully');
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        logger.error({ requestId, error: error instanceof Error ? error.message : String(error) }, 'Update lesson failed');
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update lesson content' });
      }
    }),
});

/**
 * Type export for router type inference
 */
export type LessonContentRouter = typeof lessonContentRouter;
