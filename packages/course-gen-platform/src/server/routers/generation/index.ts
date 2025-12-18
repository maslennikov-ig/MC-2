/**
 * Generation Router
 * @module server/routers/generation
 *
 * Handles course generation workflow operations including test endpoints
 * and job initiation for the BullMQ orchestration system.
 *
 * This module merges all sub-routers into a single generationRouter.
 */

import { router } from '../../trpc';

// Sub-routers
import { testRouter } from './test.router';
import { uploadRouter } from './upload.router';
import { statusRouter } from './status.router';
import { lifecycleRouter } from './lifecycle.router';
import { editingRouter } from './editing.router';
import { dependenciesRouter } from './dependencies.router';

// Re-export schemas for external use
export { initiateGenerationInputSchema, uploadFileInputSchema } from './_shared/schemas';

// Re-export types for external use
export type { CourseSettings, ConcurrencyCheckResult } from './_shared/types';

/**
 * Generation router
 *
 * Provides endpoints for:
 * - Test endpoint (generation.test) - Public, no auth
 * - File upload (generation.uploadFile) - Instructor/Admin only
 * - Initiate generation (generation.initiate) - Instructor/Admin only
 * - Generate structure (generation.generate) - Instructor/Admin only
 * - Get status (generation.getStatus) - Protected
 * - Approve/reject stages - Instructor/Admin only
 * - Edit course structure - Instructor/Admin only
 * - Dependency graph operations - Instructor/Admin only
 * - Restart stages - Instructor/Admin only
 */
export const generationRouter = router({
  // Test router
  ...testRouter._def.procedures,

  // Upload router
  ...uploadRouter._def.procedures,

  // Status router (getStatus, approveStage)
  ...statusRouter._def.procedures,

  // Lifecycle router (initiate, generate, restartStage)
  ...lifecycleRouter._def.procedures,

  // Editing router (updateField, deleteElement, addElement, regenerateBlock, getEditPermissions)
  ...editingRouter._def.procedures,

  // Dependencies router (getBlockDependencies, cascadeUpdate)
  ...dependenciesRouter._def.procedures,
});

/**
 * Type export for router type inference
 */
export type GenerationRouter = typeof generationRouter;
