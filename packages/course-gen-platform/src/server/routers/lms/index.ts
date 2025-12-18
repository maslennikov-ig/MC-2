/**
 * LMS Router - Main Entry Point
 * @module server/routers/lms
 *
 * Aggregates all LMS-related tRPC routers into a single namespace.
 * Provides endpoints for:
 * - Publishing courses to LMS platforms
 * - Managing course publish status
 * - Handling LMS operations
 *
 * Router Structure:
 * ```
 * lms
 * ├── publish
 * │   ├── start    - Start course publish operation
 * │   └── cancel   - Cancel in-progress publish
 * ├── course
 * │   ├── status   - Get course publish status
 * │   └── delete   - Delete course from LMS (soft delete)
 * ├── config
 * │   └── testConnection - Test LMS connectivity
 * └── history
 *     ├── list     - List import job history
 *     └── get      - Get detailed job information
 * ```
 *
 * @example
 * ```typescript
 * // Publish a course
 * const result = await trpc.lms.publish.start.mutate({
 *   courseId: '123e4567-e89b-12d3-a456-426614174000',
 *   lmsConfigId: '987fcdeb-51a2-43d7-89ab-456789abcdef',
 * });
 *
 * // Check publish status
 * const status = await trpc.lms.course.status.query({
 *   courseId: '123e4567-e89b-12d3-a456-426614174000',
 * });
 *
 * // Cancel publish
 * await trpc.lms.publish.cancel.mutate({ jobId: result.jobId });
 *
 * // Delete course
 * await trpc.lms.course.delete.mutate({
 *   courseId: '123e4567-e89b-12d3-a456-426614174000',
 *   lmsConfigId: '987fcdeb-51a2-43d7-89ab-456789abcdef',
 * });
 *
 * // Test LMS connection
 * const connectionResult = await trpc.lms.config.testConnection.mutate({
 *   id: '987fcdeb-51a2-43d7-89ab-456789abcdef',
 * });
 * ```
 */

import { router } from '../../trpc';
import { publishRouter } from './publish.router';
import { courseRouter } from './course.router';
import { configRouter } from './config.router';
import { historyRouter } from './history.router';

/**
 * LMS Router
 *
 * Combines publish, course, config, and history routers into a single LMS namespace.
 * All LMS operations are accessible under the `lms` prefix.
 */
export const lmsRouter = router({
  /**
   * Publish router
   * Handles course publishing and job management
   */
  publish: publishRouter,

  /**
   * Course router
   * Handles course-level operations and status
   */
  course: courseRouter,

  /**
   * Config router
   * Handles LMS configuration management and testing
   */
  config: configRouter,

  /**
   * History router
   * Handles import job history queries with filtering and pagination
   */
  history: historyRouter,
});

/**
 * Type export for router type inference
 * Use this for type-safe tRPC client generation
 */
export type LmsRouter = typeof lmsRouter;
