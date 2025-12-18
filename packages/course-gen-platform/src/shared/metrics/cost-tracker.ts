/**
 * Cost Tracking Service for LLM Token and Cost Monitoring
 *
 * Tracks LLM costs across all stages for budget monitoring and optimization.
 * Target: $0.20-$0.50 per course (all stages).
 *
 * @module shared/metrics/cost-tracker
 * @see FR-033: Structured logging with cost metrics
 * @see docs/MODEL-SELECTION-DECISIONS.md
 */

import { logger } from '@/shared/logger';
import { recordTrace } from '../../services/token-tracking-service';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Token usage for a single LLM call
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Cost record for a single stage/phase execution
 */
export interface StageCost {
  stageId: string;
  stageName: string;
  modelId: string;
  tokenUsage: TokenUsage;
  costUsd: number;
  durationMs: number;
  timestamp: Date;
}

/**
 * Aggregated cost summary for an entire course generation
 */
export interface CourseCostSummary {
  courseId: string;
  totalCostUsd: number;
  totalTokens: number;
  stageCosts: StageCost[];
  startedAt: Date;
  completedAt?: Date;
}

// ============================================================================
// MODEL PRICING CONFIGURATION
// ============================================================================

/**
 * Model pricing per 1M tokens (USD)
 *
 * Pricing sourced from:
 * - OpenRouter API documentation (2025-11)
 * - docs/MODEL-SELECTION-DECISIONS.md
 *
 * @see https://openrouter.ai/docs#pricing
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Primary generation models (language-aware routing)
  'qwen/qwen3-235b-a22b-2507': { input: 0.11, output: 0.60 },
  'deepseek/deepseek-v3.1-terminus': { input: 0.27, output: 1.10 },

  // Fallback model
  'moonshotai/kimi-k2-0905': { input: 0.55, output: 2.25 },

  // Large context model
  'x-ai/grok-4-fast': { input: 0.20, output: 0.50 },

  // Legacy/alternative models
  'openrouter/kimi-k2-instruct': { input: 0.15, output: 0.60 },
  'anthropic/claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'google/gemini-2.0-flash-001': { input: 0.10, output: 0.40 },
  'google/gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'google/gemini-2.5-flash-preview': { input: 0.10, output: 0.40 },

  // OSS models (unified pricing)
  'openai/gpt-oss-20b': { input: 0.20, output: 0.20 },
  'openai/gpt-oss-120b': { input: 0.20, output: 0.20 },

  // Stage 6 judge models
  'minimax/minimax-m2': { input: 0.255, output: 1.02 },
  'z-ai/glm-4.6': { input: 0.20, output: 0.80 },

  // Legacy models
  'qwen/qwen3-max': { input: 1.20, output: 6.00 },
  'anthropic/claude-3.5-sonnet': { input: 3.00, output: 15.00 },
  'openai/gpt-4-turbo': { input: 10.00, output: 30.00 },

  // Default for unknown models (conservative estimate)
  'default': { input: 1.00, output: 3.00 },
};

/**
 * Cost budget thresholds per course (USD)
 *
 * FR-033: Target $0.20-$0.50 per course
 */
export const COURSE_COST_THRESHOLDS = {
  /** Target minimum cost per course */
  TARGET_MIN: 0.20,
  /** Target maximum cost per course */
  TARGET_MAX: 0.50,
  /** Warning threshold */
  WARNING: 0.75,
  /** Hard limit - abort if exceeded */
  HARD_LIMIT: 1.00,
} as const;

/**
 * Cost alerting thresholds per course (USD)
 *
 * US6: Add cost alerting (log warning if cost > $0.50 per course)
 */
export const COST_ALERT_THRESHOLDS = {
  /** Log warning when exceeded */
  WARNING: 0.50,
  /** Log error when exceeded */
  CRITICAL: 1.00,
} as const;

/**
 * Configuration for cost alert callbacks
 */
export interface CostAlertConfig {
  /** Called when course cost exceeds WARNING threshold */
  onWarning?: (courseId: string, currentCost: number) => void;
  /** Called when course cost exceeds CRITICAL threshold */
  onCritical?: (courseId: string, currentCost: number) => void;
}

// ============================================================================
// COST TRACKER CLASS
// ============================================================================

/**
 * Service for tracking LLM costs across course generation stages
 *
 * Features:
 * - Per-stage cost tracking with token breakdown
 * - Aggregated course-level cost summaries
 * - Budget monitoring with threshold alerts
 * - Memory-efficient with manual cleanup
 *
 * @example
 * ```typescript
 * import { costTracker } from '@/shared/metrics/cost-tracker';
 *
 * // Record stage cost
 * costTracker.recordStageCost('course-123', {
 *   stageId: 'stage2',
 *   stageName: 'Document Processing',
 *   modelId: 'qwen/qwen3-235b-a22b-2507',
 *   tokenUsage: { inputTokens: 5000, outputTokens: 1000, totalTokens: 6000 },
 *   costUsd: 0.0011,
 *   durationMs: 2500,
 * });
 *
 * // Check budget
 * if (!costTracker.isWithinBudget('course-123', 0.50)) {
 *   logger.warn('Course exceeds budget');
 * }
 *
 * // Get summary
 * const summary = costTracker.getCourseSummary('course-123');
 * logger.info({ summary }, 'Course cost summary');
 *
 * // Cleanup after completion
 * costTracker.clearCourse('course-123');
 * ```
 */
export class CostTracker {
  private courseCosts: Map<string, CourseCostSummary> = new Map();
  private alertConfig: CostAlertConfig = {};
  /** Track which alerts have been fired to avoid duplicate alerts */
  private firedAlerts: Map<string, { warning: boolean; critical: boolean }> = new Map();

  /**
   * Configure cost alert callbacks
   *
   * @param config - Alert callback configuration
   *
   * @example
   * ```typescript
   * costTracker.configureAlerts({
   *   onWarning: (courseId, cost) => {
   *     notificationService.send(`Course ${courseId} cost warning: $${cost.toFixed(2)}`);
   *   },
   *   onCritical: (courseId, cost) => {
   *     notificationService.sendUrgent(`Course ${courseId} cost critical: $${cost.toFixed(2)}`);
   *   },
   * });
   * ```
   */
  configureAlerts(config: CostAlertConfig): void {
    this.alertConfig = { ...this.alertConfig, ...config };
    logger.debug({
      event: 'cost_alerts_configured',
      hasWarningCallback: !!config.onWarning,
      hasCriticalCallback: !!config.onCritical,
    });
  }

  /**
   * Calculate cost for token usage with a specific model
   *
   * @param modelId - OpenRouter model identifier
   * @param usage - Token usage breakdown
   * @returns Cost in USD
   */
  calculateCost(modelId: string, usage: TokenUsage): number {
    const pricing = MODEL_PRICING[modelId] || MODEL_PRICING['default'];

    const inputCost = (usage.inputTokens * pricing.input) / 1_000_000;
    const outputCost = (usage.outputTokens * pricing.output) / 1_000_000;

    return inputCost + outputCost;
  }

  /**
   * Record cost for a stage execution
   *
   * Automatically creates course tracking entry if not exists.
   * Logs cost data for structured monitoring (FR-033).
   *
   * @param courseId - Course identifier
   * @param stageCost - Stage cost data (without timestamp)
   */
  recordStageCost(
    courseId: string,
    stageCost: Omit<StageCost, 'timestamp'>
  ): void {
    const costRecord: StageCost = {
      ...stageCost,
      timestamp: new Date(),
    };

    let summary = this.courseCosts.get(courseId);

    if (!summary) {
      summary = {
        courseId,
        totalCostUsd: 0,
        totalTokens: 0,
        stageCosts: [],
        startedAt: new Date(),
      };
      this.courseCosts.set(courseId, summary);
    }

    summary.stageCosts.push(costRecord);
    summary.totalCostUsd += costRecord.costUsd;
    summary.totalTokens += costRecord.tokenUsage.totalTokens;

    // Structured logging for cost metrics (FR-033)
    logger.info({
      event: 'stage_cost_recorded',
      courseId,
      stageId: costRecord.stageId,
      stageName: costRecord.stageName,
      modelId: costRecord.modelId,
      tokens: costRecord.tokenUsage,
      costUsd: costRecord.costUsd,
      durationMs: costRecord.durationMs,
      totalCourseCostUsd: summary.totalCostUsd,
      totalCourseTokens: summary.totalTokens,
    });

    // Check cost alert thresholds (US6)
    this.checkCostAlerts(courseId, summary.totalCostUsd);

    // Warn if approaching budget limits (legacy behavior)
    if (summary.totalCostUsd >= COURSE_COST_THRESHOLDS.WARNING) {
      logger.warn({
        event: 'course_cost_warning',
        courseId,
        totalCostUsd: summary.totalCostUsd,
        threshold: COURSE_COST_THRESHOLDS.WARNING,
        hardLimit: COURSE_COST_THRESHOLDS.HARD_LIMIT,
      });
    }

    // Non-blocking persist to database
    // Extract stage number from stageId (format: 'stageN' or 'stage_N')
    const stageMatch = costRecord.stageId.match(/\d+/);
    const stageNumber = stageMatch ? parseInt(stageMatch[0], 10) : 0;

    recordTrace({
      courseId,
      stageNumber,
      phaseName: costRecord.stageName,
      modelId: costRecord.modelId,
      inputTokens: costRecord.tokenUsage.inputTokens,
      outputTokens: costRecord.tokenUsage.outputTokens,
      costUsd: costRecord.costUsd,
      durationMs: costRecord.durationMs,
    }).catch((err) => {
      logger.warn({ err, courseId, stageId: costRecord.stageId }, 'Failed to persist trace to database');
    });
  }

  /**
   * Check cost alert thresholds and fire alerts if exceeded
   *
   * Alerts are only fired once per course per threshold level.
   * Uses COST_ALERT_THRESHOLDS (WARNING: $0.50, CRITICAL: $1.00).
   *
   * @param courseId - Course identifier
   * @param currentCost - Current total cost in USD
   */
  private checkCostAlerts(courseId: string, currentCost: number): void {
    // Get or initialize alert tracking for this course
    let alerts = this.firedAlerts.get(courseId);
    if (!alerts) {
      alerts = { warning: false, critical: false };
      this.firedAlerts.set(courseId, alerts);
    }

    // Check CRITICAL threshold first (higher priority)
    if (currentCost >= COST_ALERT_THRESHOLDS.CRITICAL && !alerts.critical) {
      alerts.critical = true;

      // FR-033 structured logging format
      logger.error({
        courseId,
        currentCostUsd: formatCostUsd(currentCost),
        threshold: COST_ALERT_THRESHOLDS.CRITICAL,
        message: 'Course cost exceeds critical threshold',
      }, '[CostTracker] Cost alert: CRITICAL threshold exceeded');

      // Fire callback if configured
      if (this.alertConfig.onCritical) {
        try {
          this.alertConfig.onCritical(courseId, currentCost);
        } catch (error) {
          logger.error({ error, courseId }, '[CostTracker] Error in onCritical callback');
        }
      }
    }

    // Check WARNING threshold
    if (currentCost >= COST_ALERT_THRESHOLDS.WARNING && !alerts.warning) {
      alerts.warning = true;

      // FR-033 structured logging format
      logger.warn({
        courseId,
        currentCostUsd: formatCostUsd(currentCost),
        threshold: COST_ALERT_THRESHOLDS.WARNING,
        message: 'Course cost exceeds warning threshold',
      }, '[CostTracker] Cost alert: WARNING threshold exceeded');

      // Fire callback if configured
      if (this.alertConfig.onWarning) {
        try {
          this.alertConfig.onWarning(courseId, currentCost);
        } catch (error) {
          logger.error({ error, courseId }, '[CostTracker] Error in onWarning callback');
        }
      }
    }
  }

  /**
   * Get cost summary for a course
   *
   * @param courseId - Course identifier
   * @returns Course cost summary or undefined if not tracked
   */
  getCourseSummary(courseId: string): CourseCostSummary | undefined {
    return this.courseCosts.get(courseId);
  }

  /**
   * Check if course is within budget
   *
   * @param courseId - Course identifier
   * @param maxBudgetUsd - Maximum allowed cost in USD
   * @returns True if within budget or not tracked
   */
  isWithinBudget(courseId: string, maxBudgetUsd: number): boolean {
    const summary = this.courseCosts.get(courseId);
    if (!summary) {
      return true; // Not tracked, assume within budget
    }
    return summary.totalCostUsd <= maxBudgetUsd;
  }

  /**
   * Mark course as completed and set completion timestamp
   *
   * @param courseId - Course identifier
   */
  markCompleted(courseId: string): void {
    const summary = this.courseCosts.get(courseId);
    if (summary) {
      summary.completedAt = new Date();

      // Log final cost summary
      logger.info({
        event: 'course_cost_completed',
        courseId,
        totalCostUsd: summary.totalCostUsd,
        totalTokens: summary.totalTokens,
        stageCount: summary.stageCosts.length,
        durationMs: summary.completedAt.getTime() - summary.startedAt.getTime(),
        withinTarget: summary.totalCostUsd <= COURSE_COST_THRESHOLDS.TARGET_MAX,
      });
    }
  }

  /**
   * Clear course tracking data (after completion or for cleanup)
   *
   * Also clears alert tracking state for the course.
   *
   * @param courseId - Course identifier
   */
  clearCourse(courseId: string): void {
    this.courseCosts.delete(courseId);
    this.firedAlerts.delete(courseId);
    logger.debug({ event: 'course_cost_cleared', courseId });
  }

  /**
   * Get all active course IDs being tracked
   *
   * @returns Array of course IDs
   */
  getActiveCourseIds(): string[] {
    return Array.from(this.courseCosts.keys());
  }

  /**
   * Get total cost across all tracked courses
   *
   * @returns Total cost in USD
   */
  getTotalCostAllCourses(): number {
    let total = 0;
    for (const summary of this.courseCosts.values()) {
      total += summary.totalCostUsd;
    }
    return total;
  }

  /**
   * Get cost breakdown by stage across all courses
   *
   * Useful for identifying expensive stages for optimization.
   *
   * @returns Map of stage name to total cost
   */
  getCostByStage(): Map<string, number> {
    const stageCosts = new Map<string, number>();

    for (const summary of this.courseCosts.values()) {
      for (const stage of summary.stageCosts) {
        const current = stageCosts.get(stage.stageName) || 0;
        stageCosts.set(stage.stageName, current + stage.costUsd);
      }
    }

    return stageCosts;
  }

  /**
   * Get cost breakdown by model across all courses
   *
   * Useful for cost optimization and model selection analysis.
   *
   * @returns Map of model ID to total cost
   */
  getCostByModel(): Map<string, number> {
    const modelCosts = new Map<string, number>();

    for (const summary of this.courseCosts.values()) {
      for (const stage of summary.stageCosts) {
        const current = modelCosts.get(stage.modelId) || 0;
        modelCosts.set(stage.modelId, current + stage.costUsd);
      }
    }

    return modelCosts;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Singleton cost tracker instance
 *
 * Use this for all cost tracking across the application.
 */
export const costTracker = new CostTracker();

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format cost as USD string with 4 decimal places
 *
 * @param cost - Cost in USD
 * @returns Formatted string (e.g., "$0.0011")
 */
export function formatCostUsd(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

/**
 * Estimate cost for a model given estimated token count
 *
 * Assumes 50/50 split between input and output tokens.
 *
 * @param modelId - OpenRouter model identifier
 * @param estimatedTokens - Total estimated tokens
 * @returns Estimated cost in USD
 */
export function estimateCost(modelId: string, estimatedTokens: number): number {
  const pricing = MODEL_PRICING[modelId] || MODEL_PRICING['default'];

  // Assume 50/50 split for estimation
  const halfTokens = estimatedTokens / 2;
  const inputCost = (halfTokens * pricing.input) / 1_000_000;
  const outputCost = (halfTokens * pricing.output) / 1_000_000;

  return inputCost + outputCost;
}

/**
 * Get pricing for a specific model
 *
 * @param modelId - OpenRouter model identifier
 * @returns Pricing object or default pricing if unknown
 */
export function getModelPricing(
  modelId: string
): { input: number; output: number } {
  return MODEL_PRICING[modelId] || MODEL_PRICING['default'];
}

/**
 * Check if a model is known in the pricing table
 *
 * @param modelId - OpenRouter model identifier
 * @returns True if model has specific pricing configured
 */
export function isKnownModel(modelId: string): boolean {
  return modelId in MODEL_PRICING && modelId !== 'default';
}

/**
 * Create TokenUsage from input/output counts
 *
 * Helper for creating TokenUsage objects from LLM responses.
 *
 * @param inputTokens - Input token count
 * @param outputTokens - Output token count
 * @returns TokenUsage object
 */
export function createTokenUsage(
  inputTokens: number,
  outputTokens: number
): TokenUsage {
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}
