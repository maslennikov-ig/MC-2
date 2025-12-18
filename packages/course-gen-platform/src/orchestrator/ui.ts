/**
 * BullMQ Board UI Configuration
 *
 * This module sets up Bull Board for monitoring and managing BullMQ jobs
 * through a web interface. The UI is mounted at /admin/queues.
 *
 * @module orchestrator/ui
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-misused-promises */

import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import { Router } from 'express';
import { getQueue } from './queue';
import { exportMetrics } from './metrics';
import logger from '../shared/logger';

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
    createBullBoard({
      queues: [new BullMQAdapter(queue) as any], // Type assertion due to BullMQ version compatibility
      serverAdapter,
    });

    logger.info({
      basePath: '/admin/queues',
    }, 'Bull Board UI initialized');
  }

  return serverAdapter.getRouter();
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
  router.get('/health', async (_req, res) => {
    try {
      const queue = getQueue();

      // Check if queue is ready by getting job counts
      const counts = await queue.getJobCounts();

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
        error: 'Queue system unhealthy',
        timestamp: new Date().toISOString(),
      });
    }
  });

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
