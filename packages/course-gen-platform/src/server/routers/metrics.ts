/**
 * Metrics Router
 * @module server/routers/metrics
 *
 * Provides endpoints for monitoring system health and performance:
 *
 * **Outbox/FSM Metrics (Public - for monitoring systems):**
 * - FSM initialization metrics (success rate, cache hit rate, durations)
 * - Outbox processor metrics (queue depth, batch processing, errors)
 * - Defense layer fallback metrics (Layer 2 & 3 activations)
 * - System health checks for load balancers
 *
 * **Stage Metrics (Protected/Admin):**
 * - Per-course stage execution metrics (duration, quality, status)
 * - Aggregated metrics across all courses (admin only)
 * - Stage performance summaries (admin only)
 *
 * **Cost Tracking (Protected/Admin):**
 * - Per-course LLM cost summaries with token breakdown
 * - Total cost across all courses with stage/model breakdown (admin only)
 *
 * Public endpoints require no auth for Prometheus/Grafana integration.
 * Protected endpoints require valid JWT. Admin endpoints require admin role.
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { metricsStore } from '@/orchestrator/metrics';
import { outboxProcessor } from '@/orchestrator/outbox-processor';
import { stageMetricsCollector } from '@/shared/metrics/stage-metrics';
import { costTracker } from '@/shared/metrics/cost-tracker';
import { protectedProcedure } from '../middleware/auth';
import { adminProcedure } from '../procedures';

/**
 * Metrics router
 *
 * Provides comprehensive metrics for system monitoring and observability.
 *
 * **Public Procedures (no auth required - for monitoring systems):**
 * - `metrics.getAll` - Get all metrics (FSM, outbox, fallbacks, jobs, health)
 * - `metrics.getFSM` - Get FSM initialization metrics only
 * - `metrics.getOutbox` - Get outbox processor metrics and health
 * - `metrics.getFallbacks` - Get defense layer fallback metrics
 * - `metrics.healthCheck` - Get system health status (for load balancers)
 *
 * **Protected Procedures (requires authentication):**
 * - `metrics.getCourseMetrics` - Get stage metrics for a specific course
 * - `metrics.getCourseCost` - Get cost summary for a specific course
 *
 * **Admin Procedures (requires admin role):**
 * - `metrics.getAggregatedMetrics` - Get aggregated metrics across all courses
 * - `metrics.getStagePerformance` - Get stage performance summary
 * - `metrics.getTotalCost` - Get total cost across all courses
 */
export const metricsRouter = router({
  /**
   * Get all metrics
   *
   * Returns comprehensive metrics for FSM init, outbox processor, and defense layers.
   * Public endpoint for monitoring systems (e.g., Grafana, Prometheus).
   *
   * Response includes:
   * - fsm: FSM initialization metrics (success rate, cache hit rate, durations, failures)
   * - outbox: Outbox processor metrics (queue depth, batch stats, errors)
   * - fallbacks: Defense layer metrics (Layer 2/3 activations, successes/failures)
   * - jobs: BullMQ job metrics (existing job type metrics)
   * - outboxHealth: Outbox processor health status
   * - timestamp: Current timestamp
   */
  getAll: publicProcedure.query(async () => {
    const fsmMetrics = metricsStore.getFSMMetrics();
    const outboxMetrics = metricsStore.getOutboxMetrics();
    const fallbackMetrics = metricsStore.getFallbackMetrics();
    const jobMetrics = metricsStore.getAllMetrics();
    const outboxHealth = outboxProcessor.getHealth();

    return {
      fsm: {
        ...fsmMetrics,
        // Convert Map to plain object for JSON serialization
        failureReasons: Object.fromEntries(fsmMetrics.failureReasons),
      },
      outbox: {
        ...outboxMetrics,
        // Convert Map to plain object for JSON serialization
        errors: Object.fromEntries(outboxMetrics.errors),
      },
      fallbacks: fallbackMetrics,
      jobs: jobMetrics,
      outboxHealth: {
        ...outboxHealth,
        lastProcessed: outboxHealth.lastProcessed.toISOString(),
      },
      timestamp: new Date().toISOString(),
    };
  }),

  /**
   * Get FSM initialization metrics only
   *
   * Returns metrics for FSM initialization including:
   * - Total initializations (success + failed)
   * - Success rate (%)
   * - Cache hit rate (%)
   * - Duration statistics
   * - Failure reasons breakdown
   *
   * Useful for monitoring FSM initialization performance and debugging
   * cache effectiveness.
   */
  getFSM: publicProcedure.query(async () => {
    const metrics = metricsStore.getFSMMetrics();

    return {
      ...metrics,
      // Convert Map to plain object for JSON serialization
      failureReasons: Object.fromEntries(metrics.failureReasons),
    };
  }),

  /**
   * Get outbox processor health and metrics
   *
   * Returns metrics for the background outbox processor including:
   * - Batch processing statistics (batches, jobs created/failed)
   * - Queue depth history and average
   * - Processing duration statistics
   * - Error breakdown by type
   * - Processor health status (alive, last processed, current queue depth)
   *
   * Useful for monitoring outbox processor performance and detecting
   * queue buildup or processing issues.
   */
  getOutbox: publicProcedure.query(async () => {
    const metrics = metricsStore.getOutboxMetrics();
    const health = outboxProcessor.getHealth();

    return {
      metrics: {
        ...metrics,
        // Convert Map to plain object for JSON serialization
        errors: Object.fromEntries(metrics.errors),
      },
      health: {
        ...health,
        lastProcessed: health.lastProcessed.toISOString(),
      },
    };
  }),

  /**
   * Get defense layer fallback metrics
   *
   * Returns metrics for the 3-layer defense-in-depth system:
   * - Layer 2 (QueueEvents backup): Activations, successes, failures
   * - Layer 3 (Worker validation): Activations, successes, failures
   * - Recent activations (last 5 minutes)
   * - Historical timestamps (last 100 activations)
   *
   * Useful for monitoring fallback frequency and identifying issues
   * with the primary FSM initialization path (Layer 1).
   */
  getFallbacks: publicProcedure.query(async () => {
    const metrics = metricsStore.getFallbackMetrics();

    return {
      ...metrics,
      // Convert timestamps to ISO strings
      timestamps: metrics.timestamps.map(ts => ts.toISOString()),
    };
  }),

  /**
   * Check if system is healthy (for load balancers)
   *
   * Returns a boolean health status based on key metrics:
   * - Outbox processor is alive
   * - FSM success rate > 95%
   * - Average queue depth < 1000
   * - Last processed within 5 minutes
   *
   * Response includes:
   * - healthy: boolean (true if all checks pass)
   * - checks: individual check results
   *
   * Load balancers can use this endpoint to determine if the instance
   * is healthy and should receive traffic.
   */
  healthCheck: publicProcedure.query(async () => {
    const outboxHealth = outboxProcessor.getHealth();
    const fsmMetrics = metricsStore.getFSMMetrics();
    const outboxMetrics = metricsStore.getOutboxMetrics();

    const timeSinceLastProcessed = Date.now() - outboxHealth.lastProcessed.getTime();

    // Health criteria
    const checks = {
      outboxAlive: outboxHealth.alive,
      fsmSuccessRate: fsmMetrics.successRate,
      fsmSuccessRateOk: fsmMetrics.total === 0 || fsmMetrics.successRate > 95, // OK if no data yet
      queueDepth: outboxMetrics.avgQueueDepth,
      queueDepthOk: outboxMetrics.avgQueueDepth < 1000,
      lastProcessed: outboxHealth.lastProcessed.toISOString(),
      lastProcessedOk: timeSinceLastProcessed < 300000, // 5 minutes
    };

    const isHealthy =
      checks.outboxAlive &&
      checks.fsmSuccessRateOk &&
      checks.queueDepthOk &&
      checks.lastProcessedOk;

    return {
      healthy: isHealthy,
      checks,
      timestamp: new Date().toISOString(),
    };
  }),

  // ==========================================================================
  // STAGE METRICS ENDPOINTS
  // ==========================================================================

  /**
   * Get stage metrics for a course
   *
   * Returns all stage metrics tracked for a specific course, including:
   * - Stage execution times and durations
   * - Quality scores
   * - Document/lesson counts
   * - Status (running/completed/failed)
   *
   * Requires authentication (any authenticated user can view their course metrics).
   *
   * @param courseId - UUID of the course to retrieve metrics for
   * @returns Array of stage metrics with dates serialized to ISO strings
   */
  getCourseMetrics: protectedProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .query(async ({ input }) => {
      const metrics = stageMetricsCollector.getCourseMetrics(input.courseId);

      // Serialize Date objects to ISO strings for JSON response
      return metrics.map((m) => ({
        ...m,
        startedAt: m.startedAt.toISOString(),
        completedAt: m.completedAt?.toISOString() ?? null,
      }));
    }),

  /**
   * Get aggregated metrics across all courses
   *
   * Returns system-wide aggregated metrics including:
   * - Total courses and stage executions
   * - Average duration and cost per course
   * - Average quality score
   * - Total documents processed and lessons generated
   * - Overall success rate
   *
   * Admin only - provides system-wide visibility.
   *
   * @returns Aggregated metrics object
   */
  getAggregatedMetrics: adminProcedure.query(async () => {
    return stageMetricsCollector.getAggregatedMetrics();
  }),

  /**
   * Get stage performance summary
   *
   * Returns performance breakdown by stage name, useful for identifying:
   * - Slow stages (avg/max duration)
   * - Unreliable stages (low success rate)
   * - Quality issues (low avg quality score)
   *
   * Sorted by execution count (most used stages first).
   * Admin only - operational visibility.
   *
   * @returns Array of stage performance summaries
   */
  getStagePerformance: adminProcedure.query(async () => {
    return stageMetricsCollector.getStagePerformanceSummary();
  }),

  // ==========================================================================
  // COST TRACKING ENDPOINTS
  // ==========================================================================

  /**
   * Get cost summary for a course
   *
   * Returns detailed cost breakdown for a specific course including:
   * - Total cost in USD
   * - Total tokens used
   * - Per-stage cost breakdown with model info
   * - Start and completion timestamps
   *
   * Requires authentication (any authenticated user can view their course costs).
   *
   * @param courseId - UUID of the course to retrieve cost data for
   * @returns Course cost summary with dates serialized to ISO strings, or null if not tracked
   */
  getCourseCost: protectedProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .query(async ({ input }) => {
      const summary = costTracker.getCourseSummary(input.courseId);

      if (!summary) {
        return null;
      }

      // Serialize Date objects to ISO strings for JSON response
      return {
        ...summary,
        startedAt: summary.startedAt.toISOString(),
        completedAt: summary.completedAt?.toISOString() ?? null,
        stageCosts: summary.stageCosts.map((sc) => ({
          ...sc,
          timestamp: sc.timestamp.toISOString(),
        })),
      };
    }),

  /**
   * Get total cost across all courses (admin only)
   *
   * Returns system-wide cost metrics including:
   * - Total cost in USD across all tracked courses
   * - Cost breakdown by pipeline stage
   * - Cost breakdown by LLM model
   *
   * Useful for budget monitoring and cost optimization.
   * Admin only - financial visibility.
   *
   * @returns Object with totalCostUsd, costByStage, and costByModel
   */
  getTotalCost: adminProcedure.query(async () => {
    const costByStage = costTracker.getCostByStage();
    const costByModel = costTracker.getCostByModel();

    return {
      totalCostUsd: costTracker.getTotalCostAllCourses(),
      // Convert Map to plain object for JSON serialization
      costByStage: Object.fromEntries(costByStage),
      costByModel: Object.fromEntries(costByModel),
    };
  }),
});
