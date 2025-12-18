/**
 * Router module - Routes tasks to appropriate executors
 *
 * The Router decides how to fix identified issues and creates
 * parallel execution batches for optimal performance.
 *
 * Note: parseSectionIndex is exported from arbiter/section-utils
 */
export { routeTask, createExecutionBatches } from './route-task';
