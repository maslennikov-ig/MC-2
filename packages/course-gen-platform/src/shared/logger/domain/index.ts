/**
 * Domain Loggers - Re-exports
 *
 * Централизованный экспорт всех domain-specific логгеров.
 *
 * NOTE: Uses camelCase for TypeScript interfaces (courseId, jobId)
 * but enhanced logger automatically converts to snake_case for DB (course_id, job_id).
 */

// Validation
export {
  logValidationIssue,
  logValidationSuccess,
  logValidationStart,
  isValidationIssueParams,
  isValidationSuccessParams,
  type ValidationIssueParams,
  type ValidationSuccessParams,
} from './validation.logger';

// Pipeline
export {
  logPipelineStart,
  logPipelineComplete,
  logPipelineError,
  logPipelineRetry,
  logStageTransition,
  isPipelineContext,
  type PipelineContext,
} from './pipeline.logger';

// Generation
export {
  logLLMCall,
  logGenerationError,
  logGenerationSuccess,
  logQualityCheck,
  logModelFallback,
  isGenerationContext,
  type GenerationContext,
} from './generation.logger';

// RAG
export {
  logRagSearch,
  logRagError,
  logRagCache,
  logRagEmbedding,
  logRagNoResults,
  isRagContext,
  type RagContext,
} from './rag.logger';

// Job
export {
  logJobStart,
  logJobComplete,
  logJobError,
  logJobProgress,
  logJobRetry,
  logJobStalled,
  isJobContext,
  type JobContext,
} from './job.logger';
