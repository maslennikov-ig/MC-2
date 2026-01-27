/**
 * Pipeline Error Classes Tests
 *
 * Tests for custom error hierarchy with instanceof checking.
 *
 * @module shared/errors/__tests__/pipeline-errors.test
 */

import { describe, it, expect } from 'vitest';
import {
  // Base classes
  PipelineError,
  PipelineInterrupt,
  PipelineValidationError,
  PipelineTransientError,
  PipelineInternalError,

  // Concrete classes
  ClarifyingQuestionsInterrupt,
  BarrierFailedError,
  MinimumLessonsNotMetError,
  QualityThresholdNotMetError,
  LLMError,
  NetworkError,
  RateLimitError,
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
} from '@/shared/errors';

describe('Pipeline Error Classes', () => {
  // ===========================================================================
  // INSTANCEOF TESTS
  // ===========================================================================

  describe('instanceof checks', () => {
    describe('ClarifyingQuestionsInterrupt', () => {
      it('should be instanceof PipelineInterrupt', () => {
        const error = new ClarifyingQuestionsInterrupt(2, 5, 'course-123');
        expect(error instanceof PipelineInterrupt).toBe(true);
        expect(error instanceof PipelineError).toBe(true);
        expect(error instanceof Error).toBe(true);
      });

      it('should NOT be instanceof other error types', () => {
        const error = new ClarifyingQuestionsInterrupt(2, 5, 'course-123');
        expect(error instanceof PipelineValidationError).toBe(false);
        expect(error instanceof PipelineTransientError).toBe(false);
        expect(error instanceof PipelineInternalError).toBe(false);
      });
    });

    describe('BarrierFailedError', () => {
      it('should be instanceof PipelineValidationError', () => {
        const error = new BarrierFailedError(3, 5, 10);
        expect(error instanceof PipelineValidationError).toBe(true);
        expect(error instanceof PipelineError).toBe(true);
        expect(error instanceof Error).toBe(true);
      });
    });

    describe('MinimumLessonsNotMetError', () => {
      it('should be instanceof PipelineValidationError', () => {
        const error = new MinimumLessonsNotMetError(5, 10);
        expect(error instanceof PipelineValidationError).toBe(true);
        expect(error instanceof PipelineError).toBe(true);
      });
    });

    describe('QualityThresholdNotMetError', () => {
      it('should be instanceof PipelineValidationError', () => {
        const error = new QualityThresholdNotMetError(0.6, 0.75);
        expect(error instanceof PipelineValidationError).toBe(true);
        expect(error instanceof PipelineError).toBe(true);
      });
    });

    describe('LLMError', () => {
      it('should be instanceof PipelineTransientError', () => {
        const error = new LLMError('Rate limit exceeded', 'openrouter', 'gpt-4', 429);
        expect(error instanceof PipelineTransientError).toBe(true);
        expect(error instanceof PipelineError).toBe(true);
      });
    });

    describe('NetworkError', () => {
      it('should be instanceof PipelineTransientError', () => {
        const error = new NetworkError('Connection refused', 'https://api.example.com');
        expect(error instanceof PipelineTransientError).toBe(true);
        expect(error instanceof PipelineError).toBe(true);
      });
    });

    describe('RateLimitError', () => {
      it('should be instanceof PipelineTransientError', () => {
        const error = new RateLimitError('Too many requests', 'openrouter', 60000);
        expect(error instanceof PipelineTransientError).toBe(true);
        expect(error instanceof PipelineError).toBe(true);
      });
    });

    describe('OrchestrationFailedError', () => {
      it('should be instanceof PipelineInternalError', () => {
        const error = new OrchestrationFailedError('StateGraph failed', 'phase_1');
        expect(error instanceof PipelineInternalError).toBe(true);
        expect(error instanceof PipelineError).toBe(true);
      });
    });

    describe('ValidationFailedError', () => {
      it('should be instanceof PipelineInternalError', () => {
        const error = new ValidationFailedError('Schema validation failed', 'CourseStructure');
        expect(error instanceof PipelineInternalError).toBe(true);
        expect(error instanceof PipelineError).toBe(true);
      });
    });

    describe('DatabaseError', () => {
      it('should be instanceof PipelineInternalError', () => {
        const error = new DatabaseError('Insert failed', 'insert', 'courses');
        expect(error instanceof PipelineInternalError).toBe(true);
        expect(error instanceof PipelineError).toBe(true);
      });
    });
  });

  // ===========================================================================
  // METADATA TESTS
  // ===========================================================================

  describe('metadata propagation', () => {
    it('ClarifyingQuestionsInterrupt should have metadata fields', () => {
      const error = new ClarifyingQuestionsInterrupt(3, 7, 'course-abc');

      expect(error.criticalCount).toBe(3);
      expect(error.totalCount).toBe(7);
      expect(error.courseId).toBe('course-abc');
      expect(error.metadata.criticalCount).toBe(3);
      expect(error.metadata.totalCount).toBe(7);
      expect(error.metadata.courseId).toBe('course-abc');
    });

    it('BarrierFailedError should have metadata fields', () => {
      const error = new BarrierFailedError(3, 5, 10);

      expect(error.stage).toBe(3);
      expect(error.completedDocs).toBe(5);
      expect(error.totalDocs).toBe(10);
      expect(error.metadata.stage).toBe(3);
    });

    it('LLMError should have metadata fields', () => {
      const error = new LLMError('API error', 'openrouter', 'claude-3', 500);

      expect(error.provider).toBe('openrouter');
      expect(error.model).toBe('claude-3');
      expect(error.statusCode).toBe(500);
      expect(error.metadata.provider).toBe('openrouter');
    });

    it('should have timestamp', () => {
      const before = new Date();
      const error = new BarrierFailedError(3, 5, 10);
      const after = new Date();

      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ===========================================================================
  // RETRYABLE / SEVERITY TESTS
  // ===========================================================================

  describe('retryable and severity fields', () => {
    describe('PipelineInterrupt', () => {
      it('should have retryable=false and severity=INFO', () => {
        const error = new ClarifyingQuestionsInterrupt(1, 2, 'course-1');
        expect(error.retryable).toBe(false);
        expect(error.severity).toBe('INFO');
      });
    });

    describe('PipelineValidationError', () => {
      it('should have retryable=false and severity=ERROR', () => {
        const error1 = new BarrierFailedError(3, 5, 10);
        const error2 = new MinimumLessonsNotMetError(5);
        const error3 = new QualityThresholdNotMetError(0.5);

        expect(error1.retryable).toBe(false);
        expect(error1.severity).toBe('ERROR');
        expect(error2.retryable).toBe(false);
        expect(error2.severity).toBe('ERROR');
        expect(error3.retryable).toBe(false);
        expect(error3.severity).toBe('ERROR');
      });
    });

    describe('PipelineTransientError', () => {
      it('should have retryable=true and severity=WARNING', () => {
        const error1 = new LLMError('timeout', 'openrouter');
        const error2 = new NetworkError('ECONNREFUSED');
        const error3 = new RateLimitError('429', 'api');

        expect(error1.retryable).toBe(true);
        expect(error1.severity).toBe('WARNING');
        expect(error2.retryable).toBe(true);
        expect(error2.severity).toBe('WARNING');
        expect(error3.retryable).toBe(true);
        expect(error3.severity).toBe('WARNING');
      });
    });

    describe('PipelineInternalError', () => {
      it('should have retryable=false and severity=CRITICAL', () => {
        const error1 = new OrchestrationFailedError('failed');
        const error2 = new ValidationFailedError('invalid');
        const error3 = new DatabaseError('db error');

        expect(error1.retryable).toBe(false);
        expect(error1.severity).toBe('CRITICAL');
        expect(error2.retryable).toBe(false);
        expect(error2.severity).toBe('CRITICAL');
        expect(error3.retryable).toBe(false);
        expect(error3.severity).toBe('CRITICAL');
      });
    });
  });

  // ===========================================================================
  // ERROR CODE TESTS
  // ===========================================================================

  describe('error codes', () => {
    it('each class should have unique code', () => {
      expect(new ClarifyingQuestionsInterrupt(1, 1, 'x').code).toBe('AWAITING_CLARIFYING_ANSWERS');
      expect(new BarrierFailedError(3, 0, 1).code).toBe('BARRIER_FAILED');
      expect(new MinimumLessonsNotMetError(5).code).toBe('MINIMUM_LESSONS_NOT_MET');
      expect(new QualityThresholdNotMetError(0.5).code).toBe('QUALITY_THRESHOLD_NOT_MET');
      expect(new LLMError('x', 'y').code).toBe('LLM_ERROR');
      expect(new NetworkError('x').code).toBe('NETWORK_ERROR');
      expect(new RateLimitError('x', 'y').code).toBe('RATE_LIMIT_ERROR');
      expect(new OrchestrationFailedError('x').code).toBe('ORCHESTRATION_FAILED');
      expect(new ValidationFailedError('x').code).toBe('VALIDATION_FAILED');
      expect(new DatabaseError('x').code).toBe('DATABASE_ERROR');
    });
  });

  // ===========================================================================
  // TYPE GUARD TESTS
  // ===========================================================================

  describe('type guards', () => {
    describe('isPipelineInterrupt', () => {
      it('should return true for ClarifyingQuestionsInterrupt', () => {
        const error = new ClarifyingQuestionsInterrupt(1, 2, 'course-1');
        expect(isPipelineInterrupt(error)).toBe(true);
      });

      it('should return false for other PipelineErrors', () => {
        expect(isPipelineInterrupt(new BarrierFailedError(3, 0, 1))).toBe(false);
        expect(isPipelineInterrupt(new LLMError('x', 'y'))).toBe(false);
        expect(isPipelineInterrupt(new DatabaseError('x'))).toBe(false);
      });

      it('should return false for regular Error', () => {
        expect(isPipelineInterrupt(new Error('test'))).toBe(false);
      });

      it('should return false for non-Error', () => {
        expect(isPipelineInterrupt('error string')).toBe(false);
        expect(isPipelineInterrupt(null)).toBe(false);
        expect(isPipelineInterrupt(undefined)).toBe(false);
      });
    });

    describe('isPipelineError', () => {
      it('should return true for all PipelineError subclasses', () => {
        expect(isPipelineError(new ClarifyingQuestionsInterrupt(1, 1, 'x'))).toBe(true);
        expect(isPipelineError(new BarrierFailedError(3, 0, 1))).toBe(true);
        expect(isPipelineError(new LLMError('x', 'y'))).toBe(true);
        expect(isPipelineError(new DatabaseError('x'))).toBe(true);
      });

      it('should return false for regular Error', () => {
        expect(isPipelineError(new Error('test'))).toBe(false);
      });
    });

    describe('isRetryableError', () => {
      it('should return true for transient errors', () => {
        expect(isRetryableError(new LLMError('x', 'y'))).toBe(true);
        expect(isRetryableError(new NetworkError('x'))).toBe(true);
        expect(isRetryableError(new RateLimitError('x', 'y'))).toBe(true);
      });

      it('should return false for validation errors', () => {
        expect(isRetryableError(new BarrierFailedError(3, 0, 1))).toBe(false);
        expect(isRetryableError(new MinimumLessonsNotMetError(5))).toBe(false);
      });

      it('should return false for interrupts', () => {
        expect(isRetryableError(new ClarifyingQuestionsInterrupt(1, 1, 'x'))).toBe(false);
      });

      it('should return false for regular Error', () => {
        expect(isRetryableError(new Error('test'))).toBe(false);
      });
    });

    describe('shouldLogAsError', () => {
      it('should return false for interrupts (INFO level)', () => {
        expect(shouldLogAsError(new ClarifyingQuestionsInterrupt(1, 1, 'x'))).toBe(false);
      });

      it('should return false for transient errors (WARNING level)', () => {
        expect(shouldLogAsError(new LLMError('x', 'y'))).toBe(false);
        expect(shouldLogAsError(new NetworkError('x'))).toBe(false);
      });

      it('should return true for validation errors (ERROR level)', () => {
        expect(shouldLogAsError(new BarrierFailedError(3, 0, 1))).toBe(true);
        expect(shouldLogAsError(new MinimumLessonsNotMetError(5))).toBe(true);
      });

      it('should return true for internal errors (CRITICAL level)', () => {
        expect(shouldLogAsError(new DatabaseError('x'))).toBe(true);
        expect(shouldLogAsError(new OrchestrationFailedError('x'))).toBe(true);
      });

      it('should return true for regular Error', () => {
        expect(shouldLogAsError(new Error('test'))).toBe(true);
      });
    });
  });

  // ===========================================================================
  // UTILITY FUNCTION TESTS
  // ===========================================================================

  describe('getErrorCode', () => {
    it('should return code for PipelineError', () => {
      expect(getErrorCode(new ClarifyingQuestionsInterrupt(1, 1, 'x'))).toBe(
        'AWAITING_CLARIFYING_ANSWERS'
      );
      expect(getErrorCode(new BarrierFailedError(3, 0, 1))).toBe('BARRIER_FAILED');
      expect(getErrorCode(new LLMError('x', 'y'))).toBe('LLM_ERROR');
    });

    it('should return UNKNOWN for regular Error', () => {
      expect(getErrorCode(new Error('test'))).toBe('UNKNOWN');
    });

    it('should return UNKNOWN for non-Error', () => {
      expect(getErrorCode('string error')).toBe('UNKNOWN');
      expect(getErrorCode(null)).toBe('UNKNOWN');
    });
  });

  // ===========================================================================
  // TO LOG OBJECT TESTS
  // ===========================================================================

  describe('toLogObject', () => {
    it('should return structured log object', () => {
      const error = new BarrierFailedError(3, 5, 10);
      const logObj = error.toLogObject();

      expect(logObj).toHaveProperty('name', 'BarrierFailedError');
      expect(logObj).toHaveProperty('code', 'BARRIER_FAILED');
      expect(logObj).toHaveProperty('message');
      expect(logObj).toHaveProperty('retryable', false);
      expect(logObj).toHaveProperty('severity', 'ERROR');
      expect(logObj).toHaveProperty('timestamp');
      expect(logObj).toHaveProperty('metadata');
      expect(logObj).toHaveProperty('stack');
    });
  });

  // ===========================================================================
  // MESSAGE FORMAT TESTS
  // ===========================================================================

  describe('error messages', () => {
    it('ClarifyingQuestionsInterrupt should have descriptive message', () => {
      const error = new ClarifyingQuestionsInterrupt(3, 7, 'course-123');
      expect(error.message).toContain('3');
      expect(error.message).toContain('7');
    });

    it('BarrierFailedError should have descriptive message', () => {
      const error = new BarrierFailedError(3, 5, 10);
      expect(error.message).toContain('Stage 3');
      expect(error.message).toContain('5/10');
    });

    it('MinimumLessonsNotMetError should have descriptive message', () => {
      const error = new MinimumLessonsNotMetError(5, 10);
      expect(error.message).toContain('5 lessons');
      expect(error.message).toContain('minimum 10');
    });

    it('QualityThresholdNotMetError should have descriptive message', () => {
      const error = new QualityThresholdNotMetError(0.6, 0.75);
      expect(error.message).toContain('0.60');
      expect(error.message).toContain('0.75');
    });
  });
});
