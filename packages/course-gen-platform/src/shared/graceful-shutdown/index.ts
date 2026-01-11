/**
 * Cleanup Registry for Graceful Shutdown
 * @module shared/graceful-shutdown
 *
 * Provides a centralized registry for cleanup handlers that are executed
 * during graceful shutdown. Each handler is named for logging purposes
 * and runs with error isolation (one failure doesn't prevent others).
 *
 * @example
 * ```typescript
 * // Register a cleanup handler
 * registerCleanupHandler('redis', async () => {
 *   await closeRedisClient();
 * });
 *
 * // During shutdown
 * await runCleanupHandlers();
 * ```
 */

import logger from '../logger';

/**
 * Cleanup handler with name for logging
 */
interface CleanupHandler {
  /** Name of the resource being cleaned up */
  name: string;
  /** Async cleanup function */
  handler: () => Promise<void>;
  /** Priority (lower runs first, default: 100) */
  priority: number;
}

/**
 * Registry of cleanup handlers
 */
const cleanupHandlers: CleanupHandler[] = [];

/**
 * Register a cleanup handler for graceful shutdown
 *
 * Handlers are executed in priority order (lower numbers first).
 * Default priority is 100. Use lower numbers for dependencies
 * that must close before others (e.g., workers before queues).
 *
 * @param name - Human-readable name for logging
 * @param handler - Async cleanup function
 * @param priority - Execution priority (lower = first, default: 100)
 *
 * @example
 * ```typescript
 * // Close workers first (priority 10)
 * registerCleanupHandler('bullmq-workers', stopWorker, 10);
 *
 * // Then close queue (priority 20)
 * registerCleanupHandler('bullmq-queue', closeQueue, 20);
 *
 * // Redis last (default priority 100)
 * registerCleanupHandler('redis', closeRedisClient);
 * ```
 */
export function registerCleanupHandler(
  name: string,
  handler: () => Promise<void>,
  priority: number = 100
): void {
  cleanupHandlers.push({ name, handler, priority });
  logger.debug({ name, priority, totalHandlers: cleanupHandlers.length }, 'Cleanup handler registered');
}

/**
 * Run all registered cleanup handlers
 *
 * Handlers are executed in priority order. Each handler runs with
 * error isolation - failures are logged but don't prevent other
 * handlers from running.
 *
 * @param timeoutMs - Maximum time to wait for all cleanup (default: 25000ms)
 * @returns Summary of cleanup results
 *
 * @example
 * ```typescript
 * const result = await runCleanupHandlers();
 * // { total: 4, succeeded: 3, failed: 1, timedOut: false }
 * ```
 */
export async function runCleanupHandlers(
  timeoutMs: number = 25000
): Promise<{ total: number; succeeded: number; failed: number; timedOut: boolean }> {
  const total = cleanupHandlers.length;

  if (total === 0) {
    logger.info('No cleanup handlers registered');
    return { total: 0, succeeded: 0, failed: 0, timedOut: false };
  }

  logger.info({ total }, 'Running cleanup handlers');

  // Sort by priority (lower first)
  const sortedHandlers = [...cleanupHandlers].sort((a, b) => a.priority - b.priority);

  let succeeded = 0;
  let failed = 0;
  let timedOut = false;

  // Create a timeout promise
  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    setTimeout(() => resolve('timeout'), timeoutMs);
  });

  // Run handlers with timeout
  const cleanupPromise = (async () => {
    for (const { name, handler, priority } of sortedHandlers) {
      const startTime = Date.now();

      try {
        logger.debug({ name, priority }, 'Running cleanup handler');
        await handler();
        const duration = Date.now() - startTime;
        succeeded++;
        logger.info({ name, duration }, 'Cleanup handler completed');
      } catch (error) {
        const duration = Date.now() - startTime;
        failed++;
        logger.error(
          {
            name,
            duration,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
          'Cleanup handler failed'
        );
      }
    }
    return 'done' as const;
  })();

  // Race between cleanup and timeout
  const result = await Promise.race([cleanupPromise, timeoutPromise]);

  if (result === 'timeout') {
    timedOut = true;
    logger.error(
      {
        timeoutMs,
        succeeded,
        failed,
        remaining: total - succeeded - failed,
      },
      'Cleanup handlers timed out'
    );
  } else {
    logger.info({ total, succeeded, failed }, 'All cleanup handlers completed');
  }

  return { total, succeeded, failed, timedOut };
}

/**
 * Clear all registered cleanup handlers
 *
 * Useful for testing to reset state between tests.
 */
export function clearCleanupHandlers(): void {
  cleanupHandlers.length = 0;
  logger.debug('Cleanup handlers cleared');
}

/**
 * Get the count of registered cleanup handlers
 *
 * @returns Number of registered handlers
 */
export function getCleanupHandlerCount(): number {
  return cleanupHandlers.length;
}
