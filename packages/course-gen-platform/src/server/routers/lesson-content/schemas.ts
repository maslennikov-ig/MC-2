/**
 * Lesson Content Input Schemas
 * @module server/routers/lesson-content/schemas
 *
 * Zod validation schemas for lesson content router procedures.
 * All schemas are exported for use in tests and other modules.
 */

import { z } from 'zod';
import { LessonSpecificationV2Schema } from '@megacampus/shared-types/lesson-specification-v2';

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
export const lessonContentSchema = z.object({
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
