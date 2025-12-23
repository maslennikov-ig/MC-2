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

export {
  cleanupDoclingCache,
  cleanupDoclingCacheForCourse,
  DEFAULT_DOCLING_TTL_HOURS,
} from './docling-cleanup';

export type { DoclingCleanupResult } from './docling-cleanup';
