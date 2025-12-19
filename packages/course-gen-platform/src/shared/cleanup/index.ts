/**
 * Cleanup utilities for course deletion
 *
 * @module shared/cleanup
 */

export {
  cleanupCourseResources,
  cleanupRedisForCourse,
  deleteUploadedFiles,
  hasUploadedFiles,
} from './course-cleanup';

export type {
  CourseCleanupResult,
  RedisCleanupResult,
  FilesCleanupResult,
} from './course-cleanup';
