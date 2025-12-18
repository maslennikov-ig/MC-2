/**
 * Type definitions for system_metrics table
 * @module types/system-metrics
 */

export enum MetricEventType {
  // Stage 8: System monitoring events
  JOB_ROLLBACK = 'job_rollback',
  ORPHANED_JOB_RECOVERY = 'orphaned_job_recovery',
  CONCURRENCY_LIMIT_HIT = 'concurrency_limit_hit',
  WORKER_TIMEOUT = 'worker_timeout',
  RPC_RETRY_EXHAUSTED = 'rpc_retry_exhausted',
  DUPLICATE_JOB_DETECTED = 'duplicate_job_detected',

  // Stage 4: Observability events
  LLM_PHASE_EXECUTION = 'llm_phase_execution',
  JSON_REPAIR_EXECUTION = 'json_repair_execution',
}

export enum MetricSeverity {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

export interface SystemMetric {
  id?: string;
  event_type: MetricEventType;
  severity: MetricSeverity;
  user_id?: string;
  course_id?: string;
  job_id?: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}
