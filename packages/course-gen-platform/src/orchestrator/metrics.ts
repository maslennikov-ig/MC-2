/**
 * Job Metrics Collection
 *
 * This module tracks job execution metrics including duration, success/failure counts,
 * and retry statistics. Metrics are stored in memory for Stage 0 and can be exported
 * to monitoring systems in future stages.
 *
 * @module orchestrator/metrics
 */

import { JobType } from '@megacampus/shared-types';

/**
 * Metrics data structure for a single job type
 */
export interface JobTypeMetrics {
  total: number;
  success: number;
  failed: number;
  retries: number;
  durations: number[]; // Array of job durations in milliseconds
}

/**
 * FSM initialization metrics
 */
export interface FSMInitMetrics {
  total: number;
  success: number;
  failed: number;
  cacheHits: number;
  cacheMisses: number;
  durations: number[]; // milliseconds
  failureReasons: Map<string, number>; // reason -> count
}

/**
 * Outbox processor metrics
 */
export interface OutboxProcessorMetrics {
  batchesProcessed: number;
  jobsCreated: number;
  jobsFailed: number;
  retries: number;
  queueDepthHistory: number[]; // Last 100 queue depths
  processingDurations: number[]; // milliseconds per batch
  errors: Map<string, number>; // error type -> count
}

/**
 * Worker fallback metrics (defense layers)
 */
export interface WorkerFallbackMetrics {
  layer2Activations: number; // QueueEvents backup
  layer3Activations: number; // Worker validation
  layer2Successes: number;
  layer3Successes: number;
  layer2Failures: number;
  layer3Failures: number;
  timestamps: Date[]; // Last 100 fallback activations
}

/**
 * Model fallback metrics (LLM escalation tracking)
 * Tracks when primary model fails and fallback model is used
 */
export interface ModelFallbackMetrics {
  /** Total model fallback activations */
  total: number;
  /** Successful completions after fallback */
  successes: number;
  /** Failed completions after fallback */
  failures: number;
  /** Fallback activations by reason */
  byReason: Map<string, number>; // 'cjk' | 'timeout' | 'rate_limit' | 'error'
  /** Fallback activations by stage */
  byStage: Map<string, number>; // 'stage6' | etc.
  /** Recent fallback timestamps */
  timestamps: Date[];
}

/**
 * Enrichment type for metrics tracking
 */
export type EnrichmentMetricType = 'video' | 'audio' | 'presentation' | 'quiz' | 'document';

/**
 * Enrichment operation metrics (Stage 7)
 * Tracks enrichment generation performance by type
 */
export interface EnrichmentMetrics {
  /** Total enrichment operations started */
  total: number;
  /** Successfully completed enrichments */
  successes: number;
  /** Failed enrichments */
  failures: number;
  /** Enrichments in draft phase (two-stage types) */
  draftsCreated: number;
  /** Drafts approved for final generation */
  draftsApproved: number;
  /** Operations by enrichment type */
  byType: Map<EnrichmentMetricType, { total: number; success: number; failed: number }>;
  /** Operation durations in milliseconds */
  durations: number[];
  /** Token usage for LLM-based enrichments */
  tokensUsed: number;
  /** Cost in USD for LLM-based enrichments */
  costUsd: number;
  /** Recent operation timestamps */
  timestamps: Date[];
}

/**
 * Percentile calculation result
 */
export interface PercentileStats {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
}

/**
 * Metrics store - in-memory storage for job metrics
 */
class MetricsStore {
  private metrics: Map<JobType, JobTypeMetrics> = new Map();
  private readonly MAX_DURATIONS = 1000; // Keep last 1000 durations per job type

  // FSM initialization metrics
  private fsmMetrics: FSMInitMetrics = {
    total: 0,
    success: 0,
    failed: 0,
    cacheHits: 0,
    cacheMisses: 0,
    durations: [],
    failureReasons: new Map(),
  };

  // Outbox processor metrics
  private outboxMetrics: OutboxProcessorMetrics = {
    batchesProcessed: 0,
    jobsCreated: 0,
    jobsFailed: 0,
    retries: 0,
    queueDepthHistory: [],
    processingDurations: [],
    errors: new Map(),
  };

  // Worker fallback metrics
  private fallbackMetrics: WorkerFallbackMetrics = {
    layer2Activations: 0,
    layer3Activations: 0,
    layer2Successes: 0,
    layer3Successes: 0,
    layer2Failures: 0,
    layer3Failures: 0,
    timestamps: [],
  };

  // Model fallback metrics (LLM escalation)
  private modelFallbackMetrics: ModelFallbackMetrics = {
    total: 0,
    successes: 0,
    failures: 0,
    byReason: new Map(),
    byStage: new Map(),
    timestamps: [],
  };

  // Enrichment metrics (Stage 7)
  private enrichmentMetrics: EnrichmentMetrics = {
    total: 0,
    successes: 0,
    failures: 0,
    draftsCreated: 0,
    draftsApproved: 0,
    byType: new Map(),
    durations: [],
    tokensUsed: 0,
    costUsd: 0,
    timestamps: [],
  };

  private readonly MAX_HISTORY = 100; // Keep last 100 historical data points

  /**
   * Initialize metrics for a job type if not exists
   */
  private ensureMetrics(jobType: JobType): JobTypeMetrics {
    if (!this.metrics.has(jobType)) {
      this.metrics.set(jobType, {
        total: 0,
        success: 0,
        failed: 0,
        retries: 0,
        durations: [],
      });
    }
    return this.metrics.get(jobType)!;
  }

  /**
   * Record a job start
   *
   * @param {JobType} jobType - The type of job
   */
  recordJobStart(jobType: JobType): void {
    const metrics = this.ensureMetrics(jobType);
    metrics.total++;
  }

  /**
   * Record a successful job completion
   *
   * @param {JobType} jobType - The type of job
   * @param {number} duration - Job duration in milliseconds
   */
  recordJobSuccess(jobType: JobType, duration: number): void {
    const metrics = this.ensureMetrics(jobType);
    metrics.success++;
    this.recordDuration(jobType, duration);
  }

  /**
   * Record a failed job
   *
   * @param {JobType} jobType - The type of job
   * @param {number} duration - Job duration in milliseconds
   */
  recordJobFailure(jobType: JobType, duration: number): void {
    const metrics = this.ensureMetrics(jobType);
    metrics.failed++;
    this.recordDuration(jobType, duration);
  }

  /**
   * Record a job retry
   *
   * @param {JobType} jobType - The type of job
   */
  recordJobRetry(jobType: JobType): void {
    const metrics = this.ensureMetrics(jobType);
    metrics.retries++;
  }

  /**
   * Record job duration (internal)
   *
   * @private
   * @param {JobType} jobType - The type of job
   * @param {number} duration - Duration in milliseconds
   */
  private recordDuration(jobType: JobType, duration: number): void {
    const metrics = this.ensureMetrics(jobType);
    metrics.durations.push(duration);

    // Keep only the last MAX_DURATIONS entries to prevent memory bloat
    if (metrics.durations.length > this.MAX_DURATIONS) {
      metrics.durations.shift();
    }
  }

  /**
   * Calculate percentile statistics for a job type
   *
   * @param {JobType} jobType - The type of job
   * @returns {PercentileStats | null} Percentile statistics or null if no data
   */
  getPercentiles(jobType: JobType): PercentileStats | null {
    const metrics = this.metrics.get(jobType);
    if (!metrics || metrics.durations.length === 0) {
      return null;
    }

    const sorted = [...metrics.durations].sort((a, b) => a - b);
    const len = sorted.length;

    const getPercentile = (p: number): number => {
      const index = Math.ceil((p / 100) * len) - 1;
      return sorted[Math.max(0, index)];
    };

    const sum = sorted.reduce((acc, val) => acc + val, 0);

    return {
      p50: getPercentile(50),
      p95: getPercentile(95),
      p99: getPercentile(99),
      min: sorted[0],
      max: sorted[len - 1],
      avg: sum / len,
    };
  }

  /**
   * Get success rate for a job type
   *
   * @param {JobType} jobType - The type of job
   * @returns {number} Success rate as a percentage (0-100)
   */
  getSuccessRate(jobType: JobType): number {
    const metrics = this.metrics.get(jobType);
    if (!metrics || metrics.total === 0) {
      return 0;
    }
    return (metrics.success / metrics.total) * 100;
  }

  /**
   * Get failure rate for a job type
   *
   * @param {JobType} jobType - The type of job
   * @returns {number} Failure rate as a percentage (0-100)
   */
  getFailureRate(jobType: JobType): number {
    const metrics = this.metrics.get(jobType);
    if (!metrics || metrics.total === 0) {
      return 0;
    }
    return (metrics.failed / metrics.total) * 100;
  }

  /**
   * Get all metrics for a job type
   *
   * @param {JobType} jobType - The type of job
   * @returns {JobTypeMetrics | null} Job metrics or null if not found
   */
  getMetrics(jobType: JobType): JobTypeMetrics | null {
    return this.metrics.get(jobType) || null;
  }

  /**
   * Get metrics summary for all job types
   *
   * @returns {Record<JobType, object>} Metrics summary for all job types
   */
  getAllMetrics(): Record<string, unknown> {
    const summary: Record<string, unknown> = {};

    for (const [jobType, metrics] of this.metrics.entries()) {
      const percentiles = this.getPercentiles(jobType);
      summary[jobType] = {
        total: metrics.total,
        success: metrics.success,
        failed: metrics.failed,
        retries: metrics.retries,
        successRate: this.getSuccessRate(jobType),
        failureRate: this.getFailureRate(jobType),
        percentiles,
      };
    }

    return summary;
  }

  /**
   * Record FSM initialization
   *
   * @param {boolean} success - Whether initialization succeeded
   * @param {number} duration - Duration in milliseconds
   * @param {boolean} fromCache - Whether result came from cache
   * @param {string} error - Optional error message if failed
   */
  recordFSMInit(success: boolean, duration: number, fromCache: boolean, error?: string): void {
    this.fsmMetrics.total++;

    if (success) {
      this.fsmMetrics.success++;
    } else {
      this.fsmMetrics.failed++;
      if (error) {
        const count = this.fsmMetrics.failureReasons.get(error) || 0;
        this.fsmMetrics.failureReasons.set(error, count + 1);
      }
    }

    if (fromCache) {
      this.fsmMetrics.cacheHits++;
    } else {
      this.fsmMetrics.cacheMisses++;
    }

    this.fsmMetrics.durations.push(duration);
    if (this.fsmMetrics.durations.length > this.MAX_DURATIONS) {
      this.fsmMetrics.durations.shift();
    }
  }

  /**
   * Record outbox batch processing
   *
   * @param {number} jobsCreated - Number of jobs successfully created
   * @param {number} jobsFailed - Number of jobs that failed
   * @param {number} duration - Batch processing duration in milliseconds
   * @param {number} queueDepth - Current queue depth
   */
  recordOutboxBatch(jobsCreated: number, jobsFailed: number, duration: number, queueDepth: number): void {
    this.outboxMetrics.batchesProcessed++;
    this.outboxMetrics.jobsCreated += jobsCreated;
    this.outboxMetrics.jobsFailed += jobsFailed;

    this.outboxMetrics.processingDurations.push(duration);
    if (this.outboxMetrics.processingDurations.length > this.MAX_HISTORY) {
      this.outboxMetrics.processingDurations.shift();
    }

    this.outboxMetrics.queueDepthHistory.push(queueDepth);
    if (this.outboxMetrics.queueDepthHistory.length > this.MAX_HISTORY) {
      this.outboxMetrics.queueDepthHistory.shift();
    }
  }

  /**
   * Record outbox retry attempt
   *
   * @param {string} _jobId - The job ID being retried (unused, for logging context)
   * @param {number} _attempt - Retry attempt number (unused, for logging context)
   */
  recordOutboxRetry(_jobId: string, _attempt: number): void {
    this.outboxMetrics.retries++;
  }

  /**
   * Record outbox error
   *
   * @param {string} errorType - Type or name of the error
   */
  recordOutboxError(errorType: string): void {
    const count = this.outboxMetrics.errors.get(errorType) || 0;
    this.outboxMetrics.errors.set(errorType, count + 1);
  }

  /**
   * Record Layer 2 (QueueEvents backup) activation
   *
   * @param {boolean} success - Whether activation succeeded
   * @param {string} _courseId - Course ID for which fallback was activated (unused, for logging context)
   */
  recordLayer2Activation(success: boolean, _courseId: string): void {
    this.fallbackMetrics.layer2Activations++;
    if (success) {
      this.fallbackMetrics.layer2Successes++;
    } else {
      this.fallbackMetrics.layer2Failures++;
    }

    this.fallbackMetrics.timestamps.push(new Date());
    if (this.fallbackMetrics.timestamps.length > this.MAX_HISTORY) {
      this.fallbackMetrics.timestamps.shift();
    }
  }

  /**
   * Record Layer 3 (Worker validation) activation
   *
   * @param {boolean} success - Whether activation succeeded
   * @param {string} _courseId - Course ID for which fallback was activated (unused, for logging context)
   */
  recordLayer3Activation(success: boolean, _courseId: string): void {
    this.fallbackMetrics.layer3Activations++;
    if (success) {
      this.fallbackMetrics.layer3Successes++;
    } else {
      this.fallbackMetrics.layer3Failures++;
    }

    this.fallbackMetrics.timestamps.push(new Date());
    if (this.fallbackMetrics.timestamps.length > this.MAX_HISTORY) {
      this.fallbackMetrics.timestamps.shift();
    }
  }

  /**
   * Get FSM initialization metrics
   *
   * @returns {object} FSM metrics with calculated rates
   */
  getFSMMetrics(): FSMInitMetrics & { successRate: number; cacheHitRate: number } {
    const successRate = this.fsmMetrics.total > 0
      ? (this.fsmMetrics.success / this.fsmMetrics.total) * 100
      : 0;

    const cacheHitRate = this.fsmMetrics.total > 0
      ? (this.fsmMetrics.cacheHits / this.fsmMetrics.total) * 100
      : 0;

    return {
      ...this.fsmMetrics,
      failureReasons: this.fsmMetrics.failureReasons,
      successRate,
      cacheHitRate,
    };
  }

  /**
   * Get outbox processor metrics
   *
   * @returns {object} Outbox metrics with calculated rates and averages
   */
  getOutboxMetrics(): OutboxProcessorMetrics & { successRate: number; avgQueueDepth: number } {
    const totalJobs = this.outboxMetrics.jobsCreated + this.outboxMetrics.jobsFailed;
    const successRate = totalJobs > 0
      ? (this.outboxMetrics.jobsCreated / totalJobs) * 100
      : 100; // Default to 100% if no jobs yet

    const avgQueueDepth = this.outboxMetrics.queueDepthHistory.length > 0
      ? this.outboxMetrics.queueDepthHistory.reduce((sum, val) => sum + val, 0) / this.outboxMetrics.queueDepthHistory.length
      : 0;

    return {
      ...this.outboxMetrics,
      errors: this.outboxMetrics.errors,
      successRate,
      avgQueueDepth,
    };
  }

  /**
   * Get worker fallback metrics
   *
   * @returns {object} Fallback metrics with recent activation count
   */
  getFallbackMetrics(): WorkerFallbackMetrics & { recentActivations: number } {
    // Count activations in last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentActivations = this.fallbackMetrics.timestamps.filter(
      timestamp => timestamp > fiveMinutesAgo
    ).length;

    return {
      ...this.fallbackMetrics,
      recentActivations,
    };
  }

  /**
   * Record model fallback activation (LLM escalation)
   *
   * Called when primary model fails and fallback model is used.
   *
   * @param {string} reason - Reason for fallback ('cjk' | 'timeout' | 'rate_limit' | 'error')
   * @param {string} stage - Stage where fallback occurred ('stage6')
   */
  recordModelFallback(reason: string, stage: string): void {
    this.modelFallbackMetrics.total++;

    // Track by reason
    const reasonCount = this.modelFallbackMetrics.byReason.get(reason) || 0;
    this.modelFallbackMetrics.byReason.set(reason, reasonCount + 1);

    // Track by stage
    const stageCount = this.modelFallbackMetrics.byStage.get(stage) || 0;
    this.modelFallbackMetrics.byStage.set(stage, stageCount + 1);

    // Track timestamp
    this.modelFallbackMetrics.timestamps.push(new Date());
    if (this.modelFallbackMetrics.timestamps.length > this.MAX_HISTORY) {
      this.modelFallbackMetrics.timestamps.shift();
    }
  }

  /**
   * Record model fallback outcome
   *
   * @param {boolean} success - Whether fallback model succeeded
   */
  recordModelFallbackOutcome(success: boolean): void {
    if (success) {
      this.modelFallbackMetrics.successes++;
    } else {
      this.modelFallbackMetrics.failures++;
    }
  }

  /**
   * Get model fallback metrics
   *
   * @returns {object} Model fallback metrics with calculated rates
   */
  getModelFallbackMetrics(): ModelFallbackMetrics & {
    successRate: number;
    recentActivations: number;
    topReasons: Array<{ reason: string; count: number }>;
  } {
    const successRate = this.modelFallbackMetrics.total > 0
      ? (this.modelFallbackMetrics.successes / this.modelFallbackMetrics.total) * 100
      : 100;

    // Count activations in last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentActivations = this.modelFallbackMetrics.timestamps.filter(
      timestamp => timestamp > fiveMinutesAgo
    ).length;

    // Get top reasons sorted by count
    const topReasons = Array.from(this.modelFallbackMetrics.byReason.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    return {
      ...this.modelFallbackMetrics,
      successRate,
      recentActivations,
      topReasons,
    };
  }

  // ============================================
  // Enrichment Metrics (Stage 7)
  // ============================================

  /**
   * Ensure enrichment type metrics exist
   */
  private ensureEnrichmentTypeMetrics(type: EnrichmentMetricType): { total: number; success: number; failed: number } {
    if (!this.enrichmentMetrics.byType.has(type)) {
      this.enrichmentMetrics.byType.set(type, { total: 0, success: 0, failed: 0 });
    }
    return this.enrichmentMetrics.byType.get(type)!;
  }

  /**
   * Record enrichment operation start
   *
   * @param {EnrichmentMetricType} type - Type of enrichment
   */
  recordEnrichmentStart(type: EnrichmentMetricType): void {
    this.enrichmentMetrics.total++;
    const typeMetrics = this.ensureEnrichmentTypeMetrics(type);
    typeMetrics.total++;

    this.enrichmentMetrics.timestamps.push(new Date());
    if (this.enrichmentMetrics.timestamps.length > this.MAX_HISTORY) {
      this.enrichmentMetrics.timestamps.shift();
    }
  }

  /**
   * Record enrichment success
   *
   * @param {EnrichmentMetricType} type - Type of enrichment
   * @param {number} durationMs - Duration in milliseconds
   * @param {object} usage - Optional token and cost usage
   */
  recordEnrichmentSuccess(
    type: EnrichmentMetricType,
    durationMs: number,
    usage?: { tokensUsed?: number; costUsd?: number }
  ): void {
    this.enrichmentMetrics.successes++;
    const typeMetrics = this.ensureEnrichmentTypeMetrics(type);
    typeMetrics.success++;

    this.enrichmentMetrics.durations.push(durationMs);
    if (this.enrichmentMetrics.durations.length > this.MAX_DURATIONS) {
      this.enrichmentMetrics.durations.shift();
    }

    if (usage?.tokensUsed) {
      this.enrichmentMetrics.tokensUsed += usage.tokensUsed;
    }
    if (usage?.costUsd) {
      this.enrichmentMetrics.costUsd += usage.costUsd;
    }
  }

  /**
   * Record enrichment failure
   *
   * @param {EnrichmentMetricType} type - Type of enrichment
   * @param {number} durationMs - Duration in milliseconds
   */
  recordEnrichmentFailure(type: EnrichmentMetricType, durationMs: number): void {
    this.enrichmentMetrics.failures++;
    const typeMetrics = this.ensureEnrichmentTypeMetrics(type);
    typeMetrics.failed++;

    this.enrichmentMetrics.durations.push(durationMs);
    if (this.enrichmentMetrics.durations.length > this.MAX_DURATIONS) {
      this.enrichmentMetrics.durations.shift();
    }
  }

  /**
   * Record draft creation (two-stage enrichments)
   */
  recordDraftCreated(): void {
    this.enrichmentMetrics.draftsCreated++;
  }

  /**
   * Record draft approval (two-stage enrichments)
   */
  recordDraftApproved(): void {
    this.enrichmentMetrics.draftsApproved++;
  }

  /**
   * Get enrichment metrics with calculated statistics
   *
   * @returns {object} Enrichment metrics with rates and averages
   */
  getEnrichmentMetrics(): EnrichmentMetrics & {
    successRate: number;
    avgDurationMs: number;
    recentOperations: number;
    byTypeStats: Array<{ type: EnrichmentMetricType; total: number; success: number; failed: number; successRate: number }>;
  } {
    const successRate = this.enrichmentMetrics.total > 0
      ? (this.enrichmentMetrics.successes / this.enrichmentMetrics.total) * 100
      : 100;

    const avgDurationMs = this.enrichmentMetrics.durations.length > 0
      ? this.enrichmentMetrics.durations.reduce((sum, d) => sum + d, 0) / this.enrichmentMetrics.durations.length
      : 0;

    // Count operations in last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentOperations = this.enrichmentMetrics.timestamps.filter(
      timestamp => timestamp > fiveMinutesAgo
    ).length;

    // Get stats by type
    const byTypeStats = Array.from(this.enrichmentMetrics.byType.entries())
      .map(([type, stats]) => ({
        type,
        total: stats.total,
        success: stats.success,
        failed: stats.failed,
        successRate: stats.total > 0 ? (stats.success / stats.total) * 100 : 100,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      ...this.enrichmentMetrics,
      successRate,
      avgDurationMs,
      recentOperations,
      byTypeStats,
    };
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.metrics.clear();
    this.fsmMetrics = {
      total: 0,
      success: 0,
      failed: 0,
      cacheHits: 0,
      cacheMisses: 0,
      durations: [],
      failureReasons: new Map(),
    };
    this.outboxMetrics = {
      batchesProcessed: 0,
      jobsCreated: 0,
      jobsFailed: 0,
      retries: 0,
      queueDepthHistory: [],
      processingDurations: [],
      errors: new Map(),
    };
    this.fallbackMetrics = {
      layer2Activations: 0,
      layer3Activations: 0,
      layer2Successes: 0,
      layer3Successes: 0,
      layer2Failures: 0,
      layer3Failures: 0,
      timestamps: [],
    };
    this.modelFallbackMetrics = {
      total: 0,
      successes: 0,
      failures: 0,
      byReason: new Map(),
      byStage: new Map(),
      timestamps: [],
    };
    this.enrichmentMetrics = {
      total: 0,
      successes: 0,
      failures: 0,
      draftsCreated: 0,
      draftsApproved: 0,
      byType: new Map(),
      durations: [],
      tokensUsed: 0,
      costUsd: 0,
      timestamps: [],
    };
  }
}

/**
 * Global metrics store instance
 */
export const metricsStore = new MetricsStore();

/**
 * Export metrics for monitoring systems
 *
 * @returns {Record<string, unknown>} Metrics data in a monitoring-friendly format
 */
export function exportMetrics(): Record<string, unknown> {
  return metricsStore.getAllMetrics();
}

/**
 * Export all metrics including specialized metrics for monitoring systems
 *
 * @returns {Record<string, unknown>} Complete metrics data
 */
export function exportAllMetrics(): Record<string, unknown> {
  return {
    jobTypes: metricsStore.getAllMetrics(),
    fsm: metricsStore.getFSMMetrics(),
    outbox: metricsStore.getOutboxMetrics(),
    fallback: metricsStore.getFallbackMetrics(),
    modelFallback: metricsStore.getModelFallbackMetrics(),
    enrichment: metricsStore.getEnrichmentMetrics(),
  };
}

export default metricsStore;
