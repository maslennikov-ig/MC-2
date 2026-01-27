/**
 * Pipeline Error Hierarchy
 *
 * Custom error classes for Pipeline workflow with instanceof checking.
 * Replaces string matching (error.message.includes(...)) with type-safe classes.
 *
 * Benefits:
 * - Compile-time type checking
 * - IDE finds all usages
 * - Extensible with metadata fields
 * - O(1) instanceof vs O(n) string search
 * - Semantic error types
 *
 * @module shared/errors/pipeline-errors
 */

/**
 * Severity levels for pipeline errors
 */
export type PipelineErrorSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

/**
 * Base abstract class for all pipeline errors
 *
 * All custom pipeline errors inherit from this class.
 * Provides common fields: code, retryable, severity, timestamp, metadata.
 */
export abstract class PipelineError extends Error {
  /** Unique error code for classification */
  abstract readonly code: string;

  /** Whether this error is retryable */
  abstract readonly retryable: boolean;

  /** Error severity level */
  abstract readonly severity: PipelineErrorSeverity;

  /** Timestamp when error occurred */
  readonly timestamp: Date = new Date();

  /** Additional metadata for debugging */
  readonly metadata: Record<string, unknown>;

  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message);
    this.name = this.constructor.name;
    this.metadata = metadata;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Convert to structured log object
   */
  toLogObject(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      severity: this.severity,
      timestamp: this.timestamp.toISOString(),
      metadata: this.metadata,
      stack: this.stack,
    };
  }
}

// =============================================================================
// PIPELINE INTERRUPTS (NOT errors - control flow)
// =============================================================================

/**
 * Base class for pipeline interrupts (control flow, NOT errors)
 *
 * Use for situations where pipeline needs to pause/wait for external action.
 * These are NOT logged as errors.
 */
export abstract class PipelineInterrupt extends PipelineError {
  readonly retryable = false;
  readonly severity: PipelineErrorSeverity = 'INFO';
}

/**
 * Interrupt: Clarifying questions generated, awaiting user input
 *
 * Thrown when Stage 4 generates clarifying questions and needs user answers.
 * NOT an error - pipeline will resume when user answers questions.
 */
export class ClarifyingQuestionsInterrupt extends PipelineInterrupt {
  readonly code = 'AWAITING_CLARIFYING_ANSWERS';

  constructor(
    public readonly criticalCount: number,
    public readonly totalCount: number,
    public readonly courseId: string
  ) {
    super(`Awaiting ${criticalCount} critical questions (${totalCount} total)`, {
      criticalCount,
      totalCount,
      courseId,
    });
  }
}

// =============================================================================
// VALIDATION ERRORS (Business errors - NO RETRY)
// =============================================================================

/**
 * Base class for business validation errors
 *
 * These are NOT retriable - they indicate fundamental issues with input/state.
 */
export abstract class PipelineValidationError extends PipelineError {
  readonly retryable = false;
  readonly severity: PipelineErrorSeverity = 'ERROR';
}

/**
 * Error: Stage barrier not met (e.g., Stage 3 not complete before Stage 4)
 */
export class BarrierFailedError extends PipelineValidationError {
  readonly code = 'BARRIER_FAILED';

  constructor(
    public readonly stage: number,
    public readonly completedDocs: number,
    public readonly totalDocs: number
  ) {
    super(`Stage ${stage} barrier failed: ${completedDocs}/${totalDocs} docs complete`, {
      stage,
      completedDocs,
      totalDocs,
    });
  }
}

/**
 * Error: Course doesn't meet minimum lessons requirement (FR-015)
 */
export class MinimumLessonsNotMetError extends PipelineValidationError {
  readonly code = 'MINIMUM_LESSONS_NOT_MET';

  constructor(
    public readonly estimatedLessons: number,
    public readonly minimumRequired: number = 10
  ) {
    super(
      `Insufficient scope: ${estimatedLessons} lessons estimated, minimum ${minimumRequired} required`,
      { estimatedLessons, minimumRequired }
    );
  }
}

/**
 * Error: Generated content doesn't meet quality threshold (FR-026)
 */
export class QualityThresholdNotMetError extends PipelineValidationError {
  readonly code = 'QUALITY_THRESHOLD_NOT_MET';

  constructor(
    public readonly actualScore: number,
    public readonly requiredScore: number = 0.75
  ) {
    super(`Quality score ${actualScore.toFixed(2)} below threshold ${requiredScore}`, {
      actualScore,
      requiredScore,
    });
  }
}

// =============================================================================
// TRANSIENT ERRORS (Temporary issues - RETRY)
// =============================================================================

/**
 * Base class for transient errors that may succeed on retry
 */
export abstract class PipelineTransientError extends PipelineError {
  readonly retryable = true;
  readonly severity: PipelineErrorSeverity = 'WARNING';
}

/**
 * Error: LLM API call failed (rate limit, timeout, API error)
 */
export class LLMError extends PipelineTransientError {
  readonly code = 'LLM_ERROR';

  constructor(
    message: string,
    public readonly provider: string,
    public readonly model?: string,
    public readonly statusCode?: number
  ) {
    super(message, { provider, model, statusCode });
  }
}

/**
 * Error: Network connectivity issue
 */
export class NetworkError extends PipelineTransientError {
  readonly code = 'NETWORK_ERROR';

  constructor(
    message: string,
    public readonly endpoint?: string,
    public readonly originalError?: string
  ) {
    super(message, { endpoint, originalError });
  }
}

/**
 * Error: Rate limit exceeded
 */
export class RateLimitError extends PipelineTransientError {
  readonly code = 'RATE_LIMIT_ERROR';

  constructor(
    message: string,
    public readonly service: string,
    public readonly retryAfterMs?: number
  ) {
    super(message, { service, retryAfterMs });
  }
}

// =============================================================================
// INTERNAL ERRORS (Bugs - ALERT)
// =============================================================================

/**
 * Base class for internal errors (bugs, unexpected failures)
 */
export abstract class PipelineInternalError extends PipelineError {
  readonly retryable = false;
  readonly severity: PipelineErrorSeverity = 'CRITICAL';
}

/**
 * Error: Orchestration workflow failed
 */
export class OrchestrationFailedError extends PipelineInternalError {
  readonly code = 'ORCHESTRATION_FAILED';

  constructor(
    message: string,
    public readonly phase?: string,
    public readonly originalError?: string
  ) {
    super(message, { phase, originalError });
  }
}

/**
 * Error: Schema validation failed (Zod validation)
 */
export class ValidationFailedError extends PipelineInternalError {
  readonly code = 'VALIDATION_FAILED';

  constructor(
    message: string,
    public readonly schema?: string,
    public readonly issues?: Array<{ path: string; message: string }>
  ) {
    super(message, { schema, issues });
  }
}

/**
 * Error: Database operation failed
 */
export class DatabaseError extends PipelineInternalError {
  readonly code = 'DATABASE_ERROR';

  constructor(
    message: string,
    public readonly operation?: string,
    public readonly table?: string,
    public readonly originalError?: string
  ) {
    super(message, { operation, table, originalError });
  }
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Check if error is a pipeline interrupt (not a real error)
 */
export function isPipelineInterrupt(error: unknown): error is PipelineInterrupt {
  return error instanceof PipelineInterrupt;
}

/**
 * Check if error is a pipeline error
 */
export function isPipelineError(error: unknown): error is PipelineError {
  return error instanceof PipelineError;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof PipelineError) {
    return error.retryable;
  }
  return false;
}

/**
 * Check if error should be logged at ERROR level
 *
 * Returns false for interrupts (INFO level) and transient errors (WARNING level)
 */
export function shouldLogAsError(error: unknown): boolean {
  if (error instanceof PipelineInterrupt) {
    return false; // INFO level
  }
  if (error instanceof PipelineTransientError) {
    return false; // WARNING level
  }
  if (error instanceof PipelineError) {
    return error.severity === 'ERROR' || error.severity === 'CRITICAL';
  }
  return true; // Unknown errors logged as ERROR
}

// =============================================================================
// ERROR CLASSIFICATION HELPER
// =============================================================================

/**
 * Pipeline error codes (all possible values)
 */
export type PipelineErrorCode =
  | 'AWAITING_CLARIFYING_ANSWERS'
  | 'BARRIER_FAILED'
  | 'MINIMUM_LESSONS_NOT_MET'
  | 'QUALITY_THRESHOLD_NOT_MET'
  | 'LLM_ERROR'
  | 'NETWORK_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'ORCHESTRATION_FAILED'
  | 'VALIDATION_FAILED'
  | 'DATABASE_ERROR'
  | 'UNKNOWN';

/**
 * Extract error code from any error
 *
 * Returns the code property for PipelineError instances,
 * or 'UNKNOWN' for other errors.
 */
export function getErrorCode(error: unknown): PipelineErrorCode {
  if (error instanceof PipelineError) {
    return error.code as PipelineErrorCode;
  }
  return 'UNKNOWN';
}
