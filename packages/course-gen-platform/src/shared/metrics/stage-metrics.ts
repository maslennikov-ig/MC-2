/**
 * Stage Metrics Collection Service
 *
 * Centralized metrics collection for observability across all pipeline stages.
 * Tracks duration, quality scores, stage performance, and custom metrics.
 *
 * @module shared/metrics/stage-metrics
 * @see FR-033: Structured logging with cost metrics
 */

import { logger } from '@/shared/logger';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Metrics data for a single stage execution
 */
export interface StageMetricsData {
  /** Tokens used during stage execution */
  tokensUsed?: number;
  /** Cost in USD for this stage */
  costUsd?: number;
  /** Quality score (0-1) for stage output */
  qualityScore?: number;
  /** Number of documents processed */
  documentsProcessed?: number;
  /** Number of lessons generated */
  lessonsGenerated?: number;
  /** Number of chunks created */
  chunksCreated?: number;
  /** Number of embeddings generated */
  embeddingsGenerated?: number;
  /** Custom metrics specific to the stage */
  custom?: Record<string, number | string | boolean>;
}

/**
 * Complete stage metrics record
 */
export interface StageMetrics {
  /** Unique stage execution identifier */
  stageId: string;
  /** Human-readable stage name */
  stageName: string;
  /** Course being processed */
  courseId: string;
  /** Timestamp when stage started */
  startedAt: Date;
  /** Timestamp when stage completed (undefined if still running) */
  completedAt?: Date;
  /** Duration in milliseconds (undefined if still running) */
  durationMs?: number;
  /** Current status of the stage */
  status: 'running' | 'completed' | 'failed';
  /** Error message if stage failed */
  error?: string;
  /** Collected metrics data */
  metrics: StageMetricsData;
}

/**
 * Aggregated metrics across all tracked courses
 */
export interface AggregatedMetrics {
  /** Total number of courses being tracked */
  totalCourses: number;
  /** Total number of stage executions */
  totalStageExecutions: number;
  /** Average stage duration in milliseconds */
  avgDurationMs: number;
  /** Average cost in USD per course */
  avgCostUsd: number;
  /** Average quality score across all stages */
  avgQualityScore: number;
  /** Total documents processed */
  totalDocumentsProcessed: number;
  /** Total lessons generated */
  totalLessonsGenerated: number;
  /** Success rate (0-1) */
  successRate: number;
}

/**
 * Stage performance summary
 */
export interface StagePerformanceSummary {
  /** Stage name */
  stageName: string;
  /** Number of executions */
  executionCount: number;
  /** Average duration in milliseconds */
  avgDurationMs: number;
  /** Min duration in milliseconds */
  minDurationMs: number;
  /** Max duration in milliseconds */
  maxDurationMs: number;
  /** Average quality score */
  avgQualityScore: number;
  /** Success rate (0-1) */
  successRate: number;
}

// ============================================================================
// STAGE METRICS COLLECTOR CLASS
// ============================================================================

/**
 * Service for collecting and aggregating stage metrics
 *
 * Features:
 * - Per-stage duration and status tracking
 * - Quality score collection
 * - Custom metrics support
 * - Aggregated performance metrics
 * - Memory-efficient with manual cleanup
 *
 * @example
 * ```typescript
 * import { stageMetricsCollector } from '@/shared/metrics/stage-metrics';
 *
 * // Start tracking a stage
 * stageMetricsCollector.startStage('course-123', 'stage2', 'Document Processing');
 *
 * // Complete with metrics
 * stageMetricsCollector.completeStage('course-123', 'stage2', {
 *   tokensUsed: 5000,
 *   costUsd: 0.0011,
 *   qualityScore: 0.85,
 *   documentsProcessed: 10,
 * });
 *
 * // Get course metrics
 * const metrics = stageMetricsCollector.getCourseMetrics('course-123');
 * ```
 */
export class StageMetricsCollector {
  /** Map of courseId -> stageId -> StageMetrics */
  private courseMetrics: Map<string, Map<string, StageMetrics>> = new Map();

  /**
   * Start tracking a stage execution
   *
   * Creates a new metrics entry with 'running' status and current timestamp.
   * If a stage with the same ID is already running, it will be overwritten.
   *
   * @param courseId - Course identifier
   * @param stageId - Unique stage identifier (e.g., 'stage2', 'stage3-phase1')
   * @param stageName - Human-readable stage name (e.g., 'Document Processing')
   */
  startStage(courseId: string, stageId: string, stageName: string): void {
    // Get or create course metrics map
    let stageMap = this.courseMetrics.get(courseId);
    if (!stageMap) {
      stageMap = new Map();
      this.courseMetrics.set(courseId, stageMap);
    }

    const metrics: StageMetrics = {
      stageId,
      stageName,
      courseId,
      startedAt: new Date(),
      status: 'running',
      metrics: {},
    };

    stageMap.set(stageId, metrics);

    logger.info({
      event: 'stage_started',
      courseId,
      stageId,
      stageName,
      startedAt: metrics.startedAt.toISOString(),
    });
  }

  /**
   * Complete a stage with metrics
   *
   * Updates the stage status to 'completed', calculates duration,
   * and stores the provided metrics.
   *
   * @param courseId - Course identifier
   * @param stageId - Stage identifier (must have been started)
   * @param metrics - Metrics data to record
   * @throws Error if stage was not started
   */
  completeStage(
    courseId: string,
    stageId: string,
    metrics: Partial<StageMetricsData>
  ): void {
    const stageMetrics = this.getStageMetrics(courseId, stageId);

    if (!stageMetrics) {
      logger.warn({
        event: 'stage_complete_not_found',
        courseId,
        stageId,
        message: 'Attempted to complete a stage that was not started',
      });
      // Create a retroactive entry
      this.startStage(courseId, stageId, `Stage ${stageId}`);
      return this.completeStage(courseId, stageId, metrics);
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - stageMetrics.startedAt.getTime();

    stageMetrics.completedAt = completedAt;
    stageMetrics.durationMs = durationMs;
    stageMetrics.status = 'completed';
    stageMetrics.metrics = { ...stageMetrics.metrics, ...metrics };

    logger.info({
      event: 'stage_completed',
      courseId,
      stageId,
      stageName: stageMetrics.stageName,
      durationMs,
      status: 'completed',
      metrics: stageMetrics.metrics,
    });
  }

  /**
   * Mark a stage as failed
   *
   * Updates the stage status to 'failed' and records the error.
   *
   * @param courseId - Course identifier
   * @param stageId - Stage identifier (must have been started)
   * @param error - Error message or description
   */
  failStage(courseId: string, stageId: string, error: string): void {
    const stageMetrics = this.getStageMetrics(courseId, stageId);

    if (!stageMetrics) {
      logger.warn({
        event: 'stage_fail_not_found',
        courseId,
        stageId,
        error,
        message: 'Attempted to fail a stage that was not started',
      });
      return;
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - stageMetrics.startedAt.getTime();

    stageMetrics.completedAt = completedAt;
    stageMetrics.durationMs = durationMs;
    stageMetrics.status = 'failed';
    stageMetrics.error = error;

    logger.error({
      event: 'stage_failed',
      courseId,
      stageId,
      stageName: stageMetrics.stageName,
      durationMs,
      status: 'failed',
      error,
    });
  }

  /**
   * Update metrics for a running stage
   *
   * Allows incremental updates to metrics without completing the stage.
   *
   * @param courseId - Course identifier
   * @param stageId - Stage identifier
   * @param metrics - Partial metrics to merge
   */
  updateMetrics(
    courseId: string,
    stageId: string,
    metrics: Partial<StageMetricsData>
  ): void {
    const stageMetrics = this.getStageMetrics(courseId, stageId);

    if (!stageMetrics) {
      logger.warn({
        event: 'stage_update_not_found',
        courseId,
        stageId,
        message: 'Attempted to update metrics for a stage that was not started',
      });
      return;
    }

    stageMetrics.metrics = { ...stageMetrics.metrics, ...metrics };

    logger.debug({
      event: 'stage_metrics_updated',
      courseId,
      stageId,
      metrics: stageMetrics.metrics,
    });
  }

  /**
   * Get metrics for a specific stage
   *
   * @param courseId - Course identifier
   * @param stageId - Stage identifier
   * @returns Stage metrics or undefined if not found
   */
  getStageMetrics(courseId: string, stageId: string): StageMetrics | undefined {
    const stageMap = this.courseMetrics.get(courseId);
    return stageMap?.get(stageId);
  }

  /**
   * Get all metrics for a course
   *
   * @param courseId - Course identifier
   * @returns Array of stage metrics (empty if course not tracked)
   */
  getCourseMetrics(courseId: string): StageMetrics[] {
    const stageMap = this.courseMetrics.get(courseId);
    if (!stageMap) {
      return [];
    }
    return Array.from(stageMap.values());
  }

  /**
   * Get aggregated metrics across all tracked courses
   *
   * Calculates averages and totals for monitoring and reporting.
   *
   * @returns Aggregated metrics object
   */
  getAggregatedMetrics(): AggregatedMetrics {
    let totalStageExecutions = 0;
    let totalDurationMs = 0;
    let totalCostUsd = 0;
    let totalQualityScore = 0;
    let qualityScoreCount = 0;
    let totalDocumentsProcessed = 0;
    let totalLessonsGenerated = 0;
    let completedCount = 0;
    let failedCount = 0;

    for (const stageMap of this.courseMetrics.values()) {
      for (const metrics of stageMap.values()) {
        totalStageExecutions++;

        if (metrics.durationMs !== undefined) {
          totalDurationMs += metrics.durationMs;
        }

        if (metrics.metrics.costUsd !== undefined) {
          totalCostUsd += metrics.metrics.costUsd;
        }

        if (metrics.metrics.qualityScore !== undefined) {
          totalQualityScore += metrics.metrics.qualityScore;
          qualityScoreCount++;
        }

        if (metrics.metrics.documentsProcessed !== undefined) {
          totalDocumentsProcessed += metrics.metrics.documentsProcessed;
        }

        if (metrics.metrics.lessonsGenerated !== undefined) {
          totalLessonsGenerated += metrics.metrics.lessonsGenerated;
        }

        if (metrics.status === 'completed') {
          completedCount++;
        } else if (metrics.status === 'failed') {
          failedCount++;
        }
      }
    }

    const totalCourses = this.courseMetrics.size;
    const finishedStages = completedCount + failedCount;

    return {
      totalCourses,
      totalStageExecutions,
      avgDurationMs:
        finishedStages > 0 ? totalDurationMs / finishedStages : 0,
      avgCostUsd: totalCourses > 0 ? totalCostUsd / totalCourses : 0,
      avgQualityScore:
        qualityScoreCount > 0 ? totalQualityScore / qualityScoreCount : 0,
      totalDocumentsProcessed,
      totalLessonsGenerated,
      successRate:
        finishedStages > 0 ? completedCount / finishedStages : 0,
    };
  }

  /**
   * Get performance summary grouped by stage name
   *
   * Useful for identifying slow or unreliable stages.
   *
   * @returns Array of stage performance summaries
   */
  getStagePerformanceSummary(): StagePerformanceSummary[] {
    const stageStats = new Map<
      string,
      {
        durations: number[];
        qualityScores: number[];
        completedCount: number;
        failedCount: number;
      }
    >();

    // Collect stats per stage name
    for (const stageMap of this.courseMetrics.values()) {
      for (const metrics of stageMap.values()) {
        let stats = stageStats.get(metrics.stageName);
        if (!stats) {
          stats = {
            durations: [],
            qualityScores: [],
            completedCount: 0,
            failedCount: 0,
          };
          stageStats.set(metrics.stageName, stats);
        }

        if (metrics.durationMs !== undefined) {
          stats.durations.push(metrics.durationMs);
        }

        if (metrics.metrics.qualityScore !== undefined) {
          stats.qualityScores.push(metrics.metrics.qualityScore);
        }

        if (metrics.status === 'completed') {
          stats.completedCount++;
        } else if (metrics.status === 'failed') {
          stats.failedCount++;
        }
      }
    }

    // Build summaries
    const summaries: StagePerformanceSummary[] = [];

    for (const [stageName, stats] of stageStats.entries()) {
      const executionCount = stats.completedCount + stats.failedCount;
      const avgDurationMs =
        stats.durations.length > 0
          ? stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length
          : 0;
      const minDurationMs =
        stats.durations.length > 0 ? Math.min(...stats.durations) : 0;
      const maxDurationMs =
        stats.durations.length > 0 ? Math.max(...stats.durations) : 0;
      const avgQualityScore =
        stats.qualityScores.length > 0
          ? stats.qualityScores.reduce((a, b) => a + b, 0) /
            stats.qualityScores.length
          : 0;
      const successRate =
        executionCount > 0 ? stats.completedCount / executionCount : 0;

      summaries.push({
        stageName,
        executionCount,
        avgDurationMs,
        minDurationMs,
        maxDurationMs,
        avgQualityScore,
        successRate,
      });
    }

    // Sort by execution count (most used stages first)
    return summaries.sort((a, b) => b.executionCount - a.executionCount);
  }

  /**
   * Get all running stages across all courses
   *
   * Useful for monitoring and detecting stuck stages.
   *
   * @returns Array of running stage metrics
   */
  getRunningStages(): StageMetrics[] {
    const running: StageMetrics[] = [];

    for (const stageMap of this.courseMetrics.values()) {
      for (const metrics of stageMap.values()) {
        if (metrics.status === 'running') {
          running.push(metrics);
        }
      }
    }

    return running;
  }

  /**
   * Clear metrics for a specific course
   *
   * Call after course processing is complete to free memory.
   *
   * @param courseId - Course identifier
   */
  clearCourse(courseId: string): void {
    this.courseMetrics.delete(courseId);
    logger.debug({ event: 'course_metrics_cleared', courseId });
  }

  /**
   * Clear all metrics
   *
   * Use with caution - typically for testing or system reset.
   */
  clearAll(): void {
    const courseCount = this.courseMetrics.size;
    this.courseMetrics.clear();
    logger.info({ event: 'all_metrics_cleared', previousCourseCount: courseCount });
  }

  /**
   * Get all tracked course IDs
   *
   * @returns Array of course IDs
   */
  getTrackedCourseIds(): string[] {
    return Array.from(this.courseMetrics.keys());
  }

  /**
   * Export all metrics as JSON for persistence or reporting
   *
   * @returns JSON-serializable metrics snapshot
   */
  exportMetrics(): Record<string, StageMetrics[]> {
    const exported: Record<string, StageMetrics[]> = {};

    for (const [courseId, stageMap] of this.courseMetrics.entries()) {
      exported[courseId] = Array.from(stageMap.values());
    }

    return exported;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Singleton stage metrics collector instance
 *
 * Use this for all stage metrics tracking across the application.
 */
export const stageMetricsCollector = new StageMetricsCollector();

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format duration as human-readable string
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "2.5s", "1m 30s", "1h 5m")
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${(ms / 1000).toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
}

/**
 * Calculate quality score from multiple factors
 *
 * Weighted average of different quality dimensions.
 *
 * @param factors - Quality factor scores (0-1)
 * @returns Combined quality score (0-1)
 */
export function calculateQualityScore(factors: {
  accuracy?: number;
  completeness?: number;
  coherence?: number;
  relevance?: number;
}): number {
  const weights = {
    accuracy: 0.3,
    completeness: 0.25,
    coherence: 0.25,
    relevance: 0.2,
  };

  let totalWeight = 0;
  let weightedSum = 0;

  for (const [factor, weight] of Object.entries(weights)) {
    const value = factors[factor as keyof typeof factors];
    if (value !== undefined) {
      weightedSum += value * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Create a timer utility for measuring stage duration
 *
 * @returns Object with elapsed() method to get duration
 */
export function createTimer(): { elapsed: () => number } {
  const start = Date.now();
  return {
    elapsed: () => Date.now() - start,
  };
}
