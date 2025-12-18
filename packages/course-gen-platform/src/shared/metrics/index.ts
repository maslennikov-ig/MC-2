/**
 * Metrics Module
 * @module shared/metrics
 *
 * Provides cost tracking and metrics services for the course generation platform:
 * - LLM cost tracking per stage and per course
 * - Budget monitoring and threshold alerts
 * - Cost breakdown by model and stage
 * - Stage duration and performance tracking
 * - Quality score collection and aggregation
 */

// Cost Tracker
export {
  // Types
  type TokenUsage,
  type StageCost,
  type CourseCostSummary,
  type CostAlertConfig,

  // Constants
  MODEL_PRICING,
  COURSE_COST_THRESHOLDS,
  COST_ALERT_THRESHOLDS,

  // Class
  CostTracker,

  // Singleton
  costTracker,

  // Utility Functions
  formatCostUsd,
  estimateCost,
  getModelPricing,
  isKnownModel,
  createTokenUsage,
} from './cost-tracker';

// Stage Metrics
export {
  // Types
  type StageMetrics,
  type StageMetricsData,
  type AggregatedMetrics,
  type StagePerformanceSummary,

  // Class
  StageMetricsCollector,

  // Singleton
  stageMetricsCollector,

  // Utility Functions
  formatDuration,
  calculateQualityScore,
  createTimer,
} from './stage-metrics';
