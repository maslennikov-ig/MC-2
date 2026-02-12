/**
 * Lifecycle Router
 * @module server/routers/generation/lifecycle
 *
 * Handles course generation lifecycle operations:
 * - initiate: Start course generation from Stage 2 (with documents) or Stage 4 (no documents)
 * - generate: Initiate Stage 5 structure generation after Stage 4 analysis
 * - restartStage: Restart generation from a specific stage (2-6)
 * - cleanupCourse: Clean up external resources before deleting a course
 * - switchToManualMode: Switch from automatic to manual generation mode
 * - cancelGeneration: Cancel an in-progress generation
 */

import { router } from '../../trpc';
import { initiateRouter } from './lifecycle/initiate.router';
import { generateRouter } from './lifecycle/generate.router';
import { restartStageRouter } from './lifecycle/restart-stage.router';
import { cleanupRouter } from './lifecycle/cleanup.router';
import { switchModeRouter } from './lifecycle/switch-mode.router';
import { cancelRouter } from './lifecycle/cancel.router';

export const lifecycleRouter = router({
  ...initiateRouter,
  ...generateRouter,
  ...restartStageRouter,
  ...cleanupRouter,
  ...switchModeRouter,
  ...cancelRouter,
});

/**
 * Type export for router type inference
 */
export type LifecycleRouter = typeof lifecycleRouter;
