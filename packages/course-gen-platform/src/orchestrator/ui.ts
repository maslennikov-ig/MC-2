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
import { workerReadiness, getUploadsPath } from './worker-readiness';
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
const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => (req: Request, res: Response, next: NextFunction): void => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Centralized error handler middleware for the metrics router
 *
 * Must be registered last in the router chain.
 * Logs errors and returns consistent error response format.
 */
const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
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

    logger.info({
      basePath: '/admin/queues',
    }, 'Bull Board UI initialized');
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
  router.get('/health', healthLimiter, asyncHandler(async (_req, res) => {
    try {
      const queue = getQueue();

      // Check if queue is ready by getting job counts
      const counts = await queue.getJobCounts();

      logger.info({
        endpoint: '/health',
        status: 'healthy',
        queueCounts: counts
      }, 'Health check successful');

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
  }));

  /**
   * GET /readiness - Worker readiness check endpoint
   *
   * Returns whether the worker is ready to process jobs:
   * - Pre-flight checks completed
   * - Uploads directory accessible
   * - All required services initialized
   *
   * Use this endpoint to determine if the "Start Generation" button
   * should be enabled in the UI.
   */
  router.get('/readiness', readinessLimiter, (_req, res) => {
    try {
      const status = workerReadiness.getStatus();

      // Determine HTTP status code
      const httpStatus = status.ready ? 200 : 503;

      logger.info({
        endpoint: '/readiness',
        ready: status.ready,
        checksCount: status.checks.length,
      }, 'Readiness check completed');

      res.status(httpStatus).json({
        success: status.ready,
        data: {
          ready: status.ready,
          uploadsPath: getUploadsPath(),
          checks: status.checks,
          startedAt: status.startedAt?.toISOString() || null,
          readyAt: status.readyAt?.toISOString() || null,
          lastCheckAt: status.lastCheckAt.toISOString(),
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
  });

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
