/**
 * BullMQ Board UI Configuration
 *
 * This module sets up Bull Board for monitoring and managing BullMQ jobs
 * through a web interface. The UI is mounted at /admin/queues.
 *
 * @module orchestrator/ui
 */

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import type { BaseAdapter } from '@bull-board/api/dist/src/queueAdapters/base';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { getQueue } from './queue';
import { exportMetrics } from './metrics';
import logger from '../shared/logger';
import { workerReadiness, getUploadsPath, getReadinessFromRedis } from './worker-readiness';
import { cache } from '../shared/cache/redis';
import { ERROR_MESSAGES } from '../shared/constants/messages';

/**
 * Rate limiter for the /readiness endpoint
 *
 * Limits requests to 10 per 10 seconds per IP to prevent abuse.
 */
const readinessLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  limit: 10, // max 10 requests per window per IP
  message: { success: false, error: ERROR_MESSAGES.TOO_MANY_REQUESTS },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

/**
 * Rate limiter for the /health endpoint
 *
 * Limits requests to 20 per 10 seconds per IP to prevent abuse.
 * Higher limit than readiness since health checks may be more frequent.
 */
const healthLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  limit: 20, // max 20 requests per window per IP
  message: { success: false, error: ERROR_MESSAGES.TOO_MANY_REQUESTS },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

/**
 * Async error handling wrapper for Express routes
 *
 * Catches promise rejections and passes them to Express error middleware.
 * This prevents unhandled rejections from crashing the server.
 *
 * @example
 * router.get('/health', asyncHandler(async (req, res) => {
 *   const data = await someAsyncOperation();
 *   res.json(data);
 * }));
 */
const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/**
 * Centralized error handler middleware for the metrics router
 *
 * Must be registered last in the router chain.
 * Logs errors and returns consistent error response format.
 */
const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction): void => {
  logger.error({ err, path: req.path, method: req.method }, 'Request error');

  if (res.headersSent) {
    return;
  }

  res.status(500).json({
    success: false,
    error: ERROR_MESSAGES.INTERNAL_ERROR,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Bull Board server adapter for Express
 */
let serverAdapter: ExpressAdapter | null = null;

/**
 * Initialize Bull Board UI
 *
 * Creates and configures the Bull Board UI with:
 * - Queue monitoring and management
 * - Job inspection and retrying
 * - Custom metrics endpoint
 *
 * @returns {Router} Express router to be mounted at /admin/queues
 */
export function setupBullBoardUI(): Router {
  if (!serverAdapter) {
    // Create Express adapter
    serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    // Get the queue instance
    const queue = getQueue();

    // Create Bull Board
    // Type assertion needed due to BullMQ v5.66+ JobProgress type including 'string'
    // while @bull-board/api v5.23 expects 'number | object'. This is a known
    // version compatibility issue that doesn't affect runtime behavior.
    createBullBoard({
      queues: [new BullMQAdapter(queue) as unknown as BaseAdapter],
      serverAdapter,
    });

    logger.info(
      {
        basePath: '/admin/queues',
      },
      'Bull Board UI initialized'
    );
  }

  // getRouter() returns `any` in @bull-board/express type definitions
  // but actually returns Express Router, so we cast it properly
  return serverAdapter.getRouter() as Router;
}

/**
 * Create metrics endpoint router
 *
 * Provides a REST API for retrieving job metrics:
 * - GET /metrics - Get all job metrics
 *
 * @returns {Router} Express router for metrics endpoints
 */
export function createMetricsRouter(): Router {
  const router = Router();

  /**
   * GET /metrics - Get all job metrics
   *
   * Returns metrics for all job types including:
   * - Total jobs processed
   * - Success/failure counts and rates
   * - Retry counts
   * - Duration percentiles (p50, p95, p99)
   */
  router.get('/metrics', (_req, res) => {
    try {
      const metrics = exportMetrics();

      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ err: error }, 'Failed to export metrics');
      res.status(500).json({
        success: false,
        error: 'Failed to export metrics',
      });
    }
  });

  /**
   * GET /health - Health check endpoint for the queue system
   *
   * Returns the health status of:
   * - Queue connection
   * - Worker status
   * - Redis connection
   */
  router.get(
    '/health',
    healthLimiter,
    asyncHandler(async (_req, res) => {
      try {
        const queue = getQueue();

        // Check if queue is ready by getting job counts
        const counts = await queue.getJobCounts();

        logger.info(
          {
            endpoint: '/health',
            status: 'healthy',
            queueCounts: counts,
          },
          'Health check successful'
        );

        res.json({
          success: true,
          data: {
            status: 'healthy',
            queue: {
              name: queue.name,
              counts,
            },
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        logger.error({ err: error }, 'Health check failed');
        res.status(503).json({
          success: false,
          error: ERROR_MESSAGES.QUEUE_UNHEALTHY,
          timestamp: new Date().toISOString(),
        });
      }
    })
  );

  /**
   * GET /readiness - Worker readiness check endpoint
   *
   * Returns whether the worker is ready to process jobs:
   * - Pre-flight checks completed
   * - Uploads directory accessible
   * - All required services initialized
   *
   * Uses Redis for cross-process synchronization:
   * - Worker saves readiness status to Redis after pre-flight checks
   * - API server reads status from Redis (separate process)
   * - Falls back to local singleton if Redis unavailable
   *
   * Use this endpoint to determine if the "Start Generation" button
   * should be enabled in the UI.
   */
  router.get(
    '/readiness',
    readinessLimiter,
    asyncHandler(async (_req, res) => {
      try {
        // Try to get status from Redis first (cross-process sync)
        // This is the primary source for worker readiness in production
        const redisStatus = await getReadinessFromRedis();

        // Use Redis status if available, otherwise fall back to local singleton
        // Local singleton will only have data if this is the worker process itself
        const status = redisStatus || workerReadiness.getStatus();
        const source = redisStatus ? 'redis' : 'local';

        // Determine HTTP status code
        const httpStatus = status.ready ? 200 : 503;

        logger.info(
          {
            endpoint: '/readiness',
            ready: status.ready,
            checksCount: status.checks.length,
            source,
          },
          'Readiness check completed'
        );

        res.status(httpStatus).json({
          success: status.ready,
          data: {
            ready: status.ready,
            uploadsPath: getUploadsPath(),
            checks: status.checks,
            startedAt: status.startedAt?.toISOString() || null,
            readyAt: status.readyAt?.toISOString() || null,
            lastCheckAt: status.lastCheckAt.toISOString(),
            source, // Include source for debugging
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error({ err: error }, 'Readiness check failed');
        res.status(503).json({
          success: false,
          error: ERROR_MESSAGES.READINESS_CHECK_FAILED,
          timestamp: new Date().toISOString(),
        });
      }
    })
  );

  /**
   * GET /readiness/stage7 - Stage 7 Worker readiness check endpoint
   *
   * Returns whether the Stage 7 enrichment worker is ready to process jobs.
   * Uses Redis for cross-process synchronization.
   */
  router.get(
    '/readiness/stage7',
    readinessLimiter,
    asyncHandler(async (_req, res) => {
      try {
        // Get Stage 7 worker status from Redis
        const redisStatus = await cache.get<{
          ready: boolean;
          startedAt: string;
          lastHeartbeat: string;
          workerId: string;
          queueName: string;
          concurrency: number;
          enrichmentsDirectory?: {
            exists: boolean;
            writable: boolean;
            path: string;
            error?: string;
          };
        }>('worker-stage7:readiness:status');

        if (!redisStatus) {
          // No status in Redis - worker hasn't started or status expired
          logger.info(
            {
              endpoint: '/readiness/stage7',
              ready: false,
              reason: 'no_status_in_redis',
            },
            'Stage 7 readiness check: no status'
          );

          res.status(503).json({
            success: false,
            data: {
              ready: false,
              message: 'Stage 7 worker status not available (not started or expired)',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const httpStatus = redisStatus.ready ? 200 : 503;

        // Build message based on status
        let message: string | undefined;
        if (!redisStatus.ready && redisStatus.enrichmentsDirectory) {
          if (!redisStatus.enrichmentsDirectory.writable) {
            message = `Enrichments directory not writable: ${redisStatus.enrichmentsDirectory.error || 'permission denied'}`;
          }
        }

        logger.info(
          {
            endpoint: '/readiness/stage7',
            ready: redisStatus.ready,
            workerId: redisStatus.workerId,
            enrichmentsWritable: redisStatus.enrichmentsDirectory?.writable,
          },
          'Stage 7 readiness check completed'
        );

        res.status(httpStatus).json({
          success: redisStatus.ready,
          data: {
            ready: redisStatus.ready,
            message,
            queueName: redisStatus.queueName,
            concurrency: redisStatus.concurrency,
            startedAt: redisStatus.startedAt,
            lastHeartbeat: redisStatus.lastHeartbeat,
            workerId: redisStatus.workerId,
            enrichmentsDirectory: redisStatus.enrichmentsDirectory,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error({ err: error }, 'Stage 7 readiness check failed');
        res.status(503).json({
          success: false,
          error: 'Stage 7 readiness check failed',
          timestamp: new Date().toISOString(),
        });
      }
    })
  );

  /**
   * GET /health/mermaid - Mermaid pipeline health check
   *
   * Tests the Mermaid fix pipeline components:
   * - Validator recognizes valid/invalid diagrams
   * - Sanitizer fixes known issues (escaped quotes, etc.)
   * - Full pipeline orchestration works end-to-end
   *
   * Uses dynamic import to avoid loading stage6 code on server startup.
   */
  router.get(
    '/health/mermaid',
    healthLimiter,
    asyncHandler(async (_req, res) => {
      try {
        const { healthCheckMermaidPipeline } = await import(
          '../stages/stage6-lesson-content/utils/mermaid-health-check'
        );
        const result = await healthCheckMermaidPipeline();

        res.json({
          success: true,
          data: {
            status: result.healthy ? 'healthy' : 'degraded',
            checks: result.checks,
            totalDurationMs: result.totalDurationMs,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        logger.error({ err: error }, 'Mermaid health check failed');
        res.status(503).json({
          success: false,
          error: 'Mermaid health check failed',
        });
      }
    })
  );

  // Add centralized error handler - must be last
  router.use(errorHandler);

  logger.info('Metrics router created');

  return router;
}

/**
 * Add queue to Bull Board
 *
 * Useful for adding additional queues to the UI in the future.
 *
 * @param {Queue} queue - The queue to add to Bull Board
 */
export function addQueueToBullBoard(_queue: Queue): void {
  if (!serverAdapter) {
    throw new Error('Bull Board UI not initialized. Call setupBullBoardUI() first.');
  }

  // Note: This would require reconfiguring the Bull Board
  // For now, we only support the main queue
  logger.warn('addQueueToBullBoard not yet implemented for dynamic queue addition');
}

export default {
  setupBullBoardUI,
  createMetricsRouter,
  addQueueToBullBoard,
};
