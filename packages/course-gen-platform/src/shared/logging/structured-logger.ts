/**
 * Structured Logging Helpers for Course Generation
 * @module shared/logging/structured-logger
 *
 * Provides structured logging utilities with consistent context fields
 * for observability across all stages of course generation.
 *
 * @see FR-031: Stage status tracking
 * @see FR-032: Token/cost tracking per stage
 * @see FR-033: Structured logging format
 */

import { logger } from '@/shared/logger';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Standard context fields for all log entries
 */
export interface LogContext {
  /** Course UUID */
  courseId?: string;
  /** Human-readable generation code (e.g., "ABC-1234") for easy debugging */
  generationCode?: string;
  /** Stage identifier (e.g., 'stage2', 'stage3', 'stage6') */
  stageId?: string;
  /** Stage name for display (e.g., 'Document Processing', 'Summarization') */
  stageName?: string;
  /** Lesson ID for lesson-level operations */
  lessonId?: string;
  /** Job ID for BullMQ job tracking */
  jobId?: string;
  /** Worker ID for distributed processing */
  workerId?: string;
  /** Operation being performed */
  operation?: string;
}

/**
 * Metrics to include in log entries
 */
export interface LogMetrics {
  /** Duration in milliseconds */
  durationMs?: number;
  /** Tokens used */
  tokensUsed?: number;
  /** Cost in USD */
  costUsd?: number;
  /** Quality score (0-1) */
  qualityScore?: number;
  /** Number of items processed */
  itemsProcessed?: number;
  /** Number of items remaining */
  itemsRemaining?: number;
  /** Retry attempt number */
  attempt?: number;
  /** Maximum retries allowed */
  maxAttempts?: number;
}

/**
 * Stage start event data
 */
export interface StageStartEvent extends LogContext {
  /** Input parameters for the stage */
  inputParams?: Record<string, unknown>;
}

/**
 * Stage completion event data
 */
export interface StageCompleteEvent extends LogContext, LogMetrics {
  /** Output summary from the stage */
  outputSummary?: Record<string, unknown>;
}

/**
 * Stage error event data
 */
export interface StageErrorEvent extends LogContext {
  /** Error message */
  error: string;
  /** Error code if available */
  errorCode?: string;
  /** Stack trace */
  stack?: string;
  /** Whether retry will be attempted */
  willRetry?: boolean;
}

// ============================================================================
// STRUCTURED LOGGER CLASS
// ============================================================================

/**
 * StructuredLogger - Centralized logging with consistent context
 *
 * Provides methods for logging stage events with proper structure
 * for observability and debugging.
 *
 * @example
 * ```typescript
 * const log = new StructuredLogger({
 *   courseId: 'course-123',
 *   stageId: 'stage6',
 *   stageName: 'Lesson Content Generation',
 * });
 *
 * log.stageStart({ operation: 'generate_lessons' });
 * log.info('Processing lesson 1.1');
 * log.stageComplete({ durationMs: 5000, tokensUsed: 10000 });
 * ```
 */
export class StructuredLogger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: LogContext): StructuredLogger {
    return new StructuredLogger({ ...this.context, ...additionalContext });
  }

  /**
   * Merge context and metrics into log object
   */
  private buildLogObject(
    data: Record<string, unknown> = {},
    metrics?: LogMetrics
  ): Record<string, unknown> {
    return {
      ...this.context,
      ...metrics,
      ...data,
      timestamp: new Date().toISOString(),
    };
  }

  // ==========================================================================
  // STAGE LIFECYCLE EVENTS
  // ==========================================================================

  /**
   * Log stage start event
   */
  stageStart(event: Omit<StageStartEvent, keyof LogContext> = {}): void {
    const logObj = this.buildLogObject({
      event: 'stage_start',
      ...event,
    });
    logger.info(logObj, `[${this.context.stageName || this.context.stageId}] Stage started`);
  }

  /**
   * Log stage completion event
   */
  stageComplete(event: Omit<StageCompleteEvent, keyof LogContext> = {}): void {
    const { durationMs, tokensUsed, costUsd, qualityScore, ...rest } = event;
    const logObj = this.buildLogObject(
      { event: 'stage_complete', ...rest },
      { durationMs, tokensUsed, costUsd, qualityScore }
    );
    logger.info(logObj, `[${this.context.stageName || this.context.stageId}] Stage completed`);
  }

  /**
   * Log stage error event
   */
  stageError(event: Omit<StageErrorEvent, keyof LogContext>): void {
    const logObj = this.buildLogObject({
      event: 'stage_error',
      ...event,
    });
    logger.error(logObj, `[${this.context.stageName || this.context.stageId}] Stage error: ${event.error}`);
  }

  // ==========================================================================
  // STANDARD LOG LEVELS
  // ==========================================================================

  /**
   * Debug level log
   */
  debug(message: string, data?: Record<string, unknown>): void {
    logger.debug(this.buildLogObject(data), message);
  }

  /**
   * Info level log
   */
  info(message: string, data?: Record<string, unknown>): void {
    logger.info(this.buildLogObject(data), message);
  }

  /**
   * Warning level log
   */
  warn(message: string, data?: Record<string, unknown>): void {
    logger.warn(this.buildLogObject(data), message);
  }

  /**
   * Error level log
   */
  error(message: string, data?: Record<string, unknown>): void {
    logger.error(this.buildLogObject(data), message);
  }

  // ==========================================================================
  // PROGRESS TRACKING
  // ==========================================================================

  /**
   * Log progress update
   */
  progress(metrics: LogMetrics, message?: string): void {
    const logObj = this.buildLogObject({ event: 'progress' }, metrics);
    logger.info(logObj, message || `[${this.context.stageName || this.context.stageId}] Progress update`);
  }

  /**
   * Log retry attempt
   */
  retry(attempt: number, maxAttempts: number, reason: string): void {
    const logObj = this.buildLogObject(
      { event: 'retry', reason },
      { attempt, maxAttempts }
    );
    logger.warn(logObj, `[${this.context.stageName || this.context.stageId}] Retry attempt ${attempt}/${maxAttempts}`);
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a logger for a specific stage
 */
export function createStageLogger(
  courseId: string,
  stageId: string,
  stageName: string,
  generationCode?: string
): StructuredLogger {
  return new StructuredLogger({ courseId, stageId, stageName, generationCode });
}

/**
 * Create a logger for a lesson operation
 */
export function createLessonLogger(
  courseId: string,
  lessonId: string,
  stageName: string = 'Lesson Generation',
  generationCode?: string
): StructuredLogger {
  return new StructuredLogger({
    courseId,
    lessonId,
    stageId: 'stage6',
    stageName,
    generationCode,
  });
}

/**
 * Create a logger for a job/worker operation
 */
export function createJobLogger(
  jobId: string,
  workerId: string,
  courseId?: string,
  generationCode?: string
): StructuredLogger {
  return new StructuredLogger({ jobId, workerId, courseId, generationCode });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format log metrics for display
 */
export function formatLogMetrics(metrics: LogMetrics): string {
  const parts: string[] = [];

  if (metrics.durationMs !== undefined) {
    parts.push(`duration=${(metrics.durationMs / 1000).toFixed(2)}s`);
  }
  if (metrics.tokensUsed !== undefined) {
    parts.push(`tokens=${metrics.tokensUsed}`);
  }
  if (metrics.costUsd !== undefined) {
    parts.push(`cost=$${metrics.costUsd.toFixed(4)}`);
  }
  if (metrics.qualityScore !== undefined) {
    parts.push(`quality=${(metrics.qualityScore * 100).toFixed(1)}%`);
  }
  if (metrics.itemsProcessed !== undefined) {
    parts.push(`processed=${metrics.itemsProcessed}`);
  }

  return parts.join(', ');
}

/**
 * Create a timer for measuring operation duration
 */
export function createLogTimer(): {
  elapsed: () => number;
  stop: () => number;
} {
  const startTime = performance.now();
  let endTime: number | null = null;

  return {
    elapsed: () => Math.round(endTime ?? performance.now() - startTime),
    stop: () => {
      if (endTime === null) {
        endTime = performance.now();
      }
      return Math.round(endTime - startTime);
    },
  };
}
