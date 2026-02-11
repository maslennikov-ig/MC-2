/**
 * Pipeline Errors Module
 *
 * Re-exports all pipeline error classes and utilities.
 *
 * @module shared/errors
 */

export {
  // Base classes
  PipelineError,
  PipelineInterrupt,
  PipelineValidationError,
  PipelineTransientError,
  PipelineInternalError,

  // Interrupt classes
  ClarifyingQuestionsInterrupt,

  // Validation error classes
  BarrierFailedError,
  ContentPolicyError,
  MinimumLessonsNotMetError,
  QualityThresholdNotMetError,

  // Transient error classes
  LLMError,
  NetworkError,
  RateLimitError,

  // Internal error classes
  OrchestrationFailedError,
  ValidationFailedError,
  DatabaseError,

  // Type guards
  isPipelineInterrupt,
  isPipelineError,
  isRetryableError,
  shouldLogAsError,

  // Utilities
  getErrorCode,
  classifyPipelineError,

  // Types
  type PipelineErrorSeverity,
  type PipelineErrorCode,
  type PipelineErrorMetadata,
} from './pipeline-errors';
