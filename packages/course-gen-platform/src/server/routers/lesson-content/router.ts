/**
 * Lesson Content Router
 * @module server/routers/lesson-content/router
 *
 * Provides API endpoints for lesson content generation workflow (Stage 6).
 * This router handles enqueueing lesson generation jobs to the BullMQ queue,
 * monitoring progress, retrying failed lessons, and retrieving generated content.
 *
 * Procedures:
 * - startStage6: Enqueue all lessons for parallel processing
 * - getProgress: Get progress for all lessons in a course
 * - retryLesson: Retry a failed lesson generation
 * - getLessonContent: Retrieve generated lesson content
 * - cancelStage6: Cancel all pending jobs for a course
 * - partialGenerate: Regenerate specific lessons or sections
 * - approveLesson: Approve a lesson after review
 * - updateLessonContent: Update lesson content with manual edits
 *
 * Access Control:
 * - All endpoints enforce organization-level RLS via ctx.user.organizationId
 * - Course ownership/access is verified before operations
 *
 * @see stages/stage6-lesson-content/handler.ts - BullMQ handler
 * @see specs/010-stages-456-pipeline/data-model.md - Data model specification
 */

import { router } from '../../trpc';
import { startStage6 } from './procedures/start';
import { getProgress } from './procedures/get-progress';
import { retryLesson } from './procedures/retry-lesson';
import { getLessonContent } from './procedures/get-lesson-content';
import { cancelStage6 } from './procedures/cancel';
import { partialGenerate } from './procedures/partial-generate';
import { approveLesson } from './procedures/approve-lesson';
import { approveLessons } from './procedures/approve-lessons';
import { updateLessonContent } from './procedures/update-content';
import { deleteLesson } from './procedures/delete-lesson';
import { exportLessons } from './procedures/export-lessons';
import { generateMissingContent } from './procedures/generate-missing';

/**
 * Lesson content router
 *
 * Provides endpoints for lesson content generation:
 * - startStage6: Enqueue lessons for parallel processing
 * - getProgress: Monitor generation progress
 * - retryLesson: Retry failed lessons
 * - getLessonContent: Retrieve generated content
 * - cancelStage6: Cancel pending jobs
 * - partialGenerate: Regenerate specific lessons or sections
 * - approveLesson: Approve a single lesson after review
 * - approveLessons: Batch approve lessons for a course or module
 * - updateLessonContent: Update lesson content with manual edits
 * - deleteLesson: Delete a lesson and all related data (cascading)
 * - exportLessons: Export lessons in a module as Markdown
 * - generateMissingContent: Generate content only for lessons without existing content
 */
export const lessonContentRouter = router({
  startStage6,
  getProgress,
  retryLesson,
  getLessonContent,
  cancelStage6,
  partialGenerate,
  approveLesson,
  approveLessons,
  updateLessonContent,
  deleteLesson,
  exportLessons,
  generateMissingContent,
});

/**
 * Type export for router type inference
 */
export type LessonContentRouter = typeof lessonContentRouter;
