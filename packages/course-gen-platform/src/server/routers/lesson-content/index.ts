/**
 * Lesson Content Module Entry Point
 * @module server/routers/lesson-content
 *
 * Re-exports the lesson content router and all input schemas.
 */

// Export router and type
export { lessonContentRouter, type LessonContentRouter } from './router';

// Export all input schemas for use in tests and other modules
export {
  startStage6InputSchema,
  getProgressInputSchema,
  retryLessonInputSchema,
  getLessonContentInputSchema,
  cancelStage6InputSchema,
  partialGenerateInputSchema,
  approveLessonInputSchema,
  updateLessonContentInputSchema,
  lessonContentSchema,
} from './schemas';

// Export helper functions (may be needed by other modules)
export { verifyCourseAccess, buildMinimalLessonSpec } from './helpers';
