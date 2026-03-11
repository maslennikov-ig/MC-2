/**
 * Tests for shared/errors/pipeline-errors.ts
 *
 * Covers the full error hierarchy:
 * - PipelineError base class
 * - Interrupt types (ClarifyingQuestionsInterrupt)
 * - Validation errors (BarrierFailed, MinimumLessons, QualityThreshold, ContentPolicy)
 * - Transient errors (LLM, Network, RateLimit)
 * - Internal errors (OrchestrationFailed, ValidationFailed, Database)
 * - Type guards (isPipelineInterrupt, isPipelineError, isRetryableError, shouldLogAsError)
 * - Classification helpers (getErrorCode, classifyPipelineError)
 *
 * Also covers shared/utils/error-formatter.ts (getErrorMessage)
 */

import { describe, it, expect } from 'vitest';
import {
  ClarifyingQuestionsInterrupt,
  BarrierFailedError,
  MinimumLessonsNotMetError,
  QualityThresholdNotMetError,
  ContentPolicyError,
  LLMError,
  NetworkError,
  RateLimitError,
  OrchestrationFailedError,
  DatabaseError,
  isPipelineInterrupt,
  isPipelineError,
  isRetryableError,
  shouldLogAsError,
  getErrorCode,
  classifyPipelineError,
} from '@/shared/errors/pipeline-errors';
import { getErrorMessage } from '@megacampus/shared-utils';

// ─────────────────────────────────────────────────────────────────────────────
// Error hierarchy and properties
// ─────────────────────────────────────────────────────────────────────────────

describe('ClarifyingQuestionsInterrupt', () => {
  it('has correct code, retryable=false, severity=INFO', () => {
    const err = new ClarifyingQuestionsInterrupt(2, 5, 'course-1');
    expect(err.code).toBe('AWAITING_CLARIFYING_ANSWERS');
    expect(err.retryable).toBe(false);
    expect(err.severity).toBe('INFO');
  });

  it('stores counts and courseId in metadata', () => {
    const err = new ClarifyingQuestionsInterrupt(2, 5, 'course-1');
    expect(err.criticalCount).toBe(2);
    expect(err.totalCount).toBe(5);
    expect(err.courseId).toBe('course-1');
  });

  it('produces a descriptive message', () => {
    const err = new ClarifyingQuestionsInterrupt(2, 5, 'course-1');
    expect(err.message).toContain('2');
    expect(err.message).toContain('5');
  });

  it('is instanceof Error and PipelineError', () => {
    const err = new ClarifyingQuestionsInterrupt(1, 1, 'c-1');
    expect(err).toBeInstanceOf(Error);
    expect(isPipelineError(err)).toBe(true);
    expect(isPipelineInterrupt(err)).toBe(true);
  });
});

describe('BarrierFailedError', () => {
  it('has code BARRIER_FAILED, retryable=false', () => {
    const err = new BarrierFailedError(3, 5, 8);
    expect(err.code).toBe('BARRIER_FAILED');
    expect(err.retryable).toBe(false);
  });

  it('stores stage and document counts', () => {
    const err = new BarrierFailedError(3, 5, 8);
    expect(err.stage).toBe(3);
    expect(err.completedDocs).toBe(5);
    expect(err.totalDocs).toBe(8);
  });
});

describe('MinimumLessonsNotMetError', () => {
  it('has code MINIMUM_LESSONS_NOT_MET', () => {
    const err = new MinimumLessonsNotMetError(7);
    expect(err.code).toBe('MINIMUM_LESSONS_NOT_MET');
  });

  it('uses default minimum of 10', () => {
    const err = new MinimumLessonsNotMetError(7);
    expect(err.minimumRequired).toBe(10);
    expect(err.estimatedLessons).toBe(7);
  });

  it('accepts custom minimum', () => {
    const err = new MinimumLessonsNotMetError(3, 5);
    expect(err.minimumRequired).toBe(5);
  });
});

describe('QualityThresholdNotMetError', () => {
  it('has code QUALITY_THRESHOLD_NOT_MET', () => {
    const err = new QualityThresholdNotMetError(0.5);
    expect(err.code).toBe('QUALITY_THRESHOLD_NOT_MET');
  });

  it('uses default threshold of 0.75', () => {
    const err = new QualityThresholdNotMetError(0.5);
    expect(err.requiredScore).toBe(0.75);
  });

  it('includes score in message', () => {
    const err = new QualityThresholdNotMetError(0.5);
    expect(err.message).toContain('0.50');
  });
});

describe('ContentPolicyError', () => {
  it('has code CONTENT_POLICY_VIOLATION', () => {
    const err = new ContentPolicyError('inappropriate content');
    expect(err.code).toBe('CONTENT_POLICY_VIOLATION');
    expect(err.retryable).toBe(false);
  });

  it('includes reason in message', () => {
    const err = new ContentPolicyError('adult content detected');
    expect(err.message).toContain('adult content detected');
  });
});

describe('LLMError', () => {
  it('has code LLM_ERROR, retryable=true', () => {
    const err = new LLMError('timeout', 'openai', 'gpt-4', 429);
    expect(err.code).toBe('LLM_ERROR');
    expect(err.retryable).toBe(true);
    expect(err.severity).toBe('WARNING');
  });

  it('stores provider, model, and statusCode', () => {
    const err = new LLMError('timeout', 'openai', 'gpt-4', 429);
    expect(err.provider).toBe('openai');
    expect(err.model).toBe('gpt-4');
    expect(err.statusCode).toBe(429);
  });
});

describe('NetworkError', () => {
  it('has code NETWORK_ERROR, retryable=true', () => {
    const err = new NetworkError('ECONNREFUSED', 'https://api.example.com');
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.retryable).toBe(true);
  });
});

describe('RateLimitError', () => {
  it('has code RATE_LIMIT_ERROR, retryable=true', () => {
    const err = new RateLimitError('too many requests', 'openai', 5000);
    expect(err.code).toBe('RATE_LIMIT_ERROR');
    expect(err.retryable).toBe(true);
    expect(err.retryAfterMs).toBe(5000);
  });
});

describe('OrchestrationFailedError', () => {
  it('has code ORCHESTRATION_FAILED, retryable=false, severity=CRITICAL', () => {
    const err = new OrchestrationFailedError('worker crashed', 'stage-5');
    expect(err.code).toBe('ORCHESTRATION_FAILED');
    expect(err.retryable).toBe(false);
    expect(err.severity).toBe('CRITICAL');
  });
});

describe('DatabaseError', () => {
  it('has code DATABASE_ERROR, retryable=false', () => {
    const err = new DatabaseError('upsert failed', 'INSERT', 'courses', 'unique violation');
    expect(err.code).toBe('DATABASE_ERROR');
    expect(err.retryable).toBe(false);
  });

  it('stores operation and table', () => {
    const err = new DatabaseError('failed', 'SELECT', 'enrichments');
    expect(err.operation).toBe('SELECT');
    expect(err.table).toBe('enrichments');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toLogObject / toJSON
// ─────────────────────────────────────────────────────────────────────────────

describe('PipelineError.toLogObject', () => {
  it('returns structured log object with required fields', () => {
    const err = new LLMError('rate limit', 'openai');
    const log = err.toLogObject();
    expect(log.code).toBe('LLM_ERROR');
    expect(log.retryable).toBe(true);
    expect(log.severity).toBe('WARNING');
    expect(log.message).toBe('rate limit');
    expect(typeof log.timestamp).toBe('string');
  });

  it('toJSON returns same as toLogObject', () => {
    const err = new DatabaseError('fail');
    expect(err.toJSON()).toEqual(err.toLogObject());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Type guards
// ─────────────────────────────────────────────────────────────────────────────

describe('isPipelineInterrupt', () => {
  it('returns true for ClarifyingQuestionsInterrupt', () => {
    expect(isPipelineInterrupt(new ClarifyingQuestionsInterrupt(1, 1, 'c'))).toBe(true);
  });

  it('returns false for validation error', () => {
    expect(isPipelineInterrupt(new BarrierFailedError(1, 2, 3))).toBe(false);
  });

  it('returns false for plain Error', () => {
    expect(isPipelineInterrupt(new Error('plain'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isPipelineInterrupt(null)).toBe(false);
  });
});

describe('isPipelineError', () => {
  it('returns true for any PipelineError subclass', () => {
    expect(isPipelineError(new LLMError('err', 'openai'))).toBe(true);
    expect(isPipelineError(new BarrierFailedError(1, 2, 3))).toBe(true);
    expect(isPipelineError(new ClarifyingQuestionsInterrupt(1, 1, 'c'))).toBe(true);
  });

  it('returns false for plain Error', () => {
    expect(isPipelineError(new Error('plain'))).toBe(false);
  });

  it('returns false for string', () => {
    expect(isPipelineError('string error')).toBe(false);
  });
});

describe('isRetryableError', () => {
  it('returns true for LLMError', () => {
    expect(isRetryableError(new LLMError('err', 'openai'))).toBe(true);
  });

  it('returns true for NetworkError', () => {
    expect(isRetryableError(new NetworkError('conn failed'))).toBe(true);
  });

  it('returns false for validation errors', () => {
    expect(isRetryableError(new BarrierFailedError(1, 2, 3))).toBe(false);
  });

  it('returns false for interrupt', () => {
    expect(isRetryableError(new ClarifyingQuestionsInterrupt(1, 1, 'c'))).toBe(false);
  });

  it('returns false for plain Error', () => {
    expect(isRetryableError(new Error('plain'))).toBe(false);
  });
});

describe('shouldLogAsError', () => {
  it('returns false for interrupt (INFO level)', () => {
    expect(shouldLogAsError(new ClarifyingQuestionsInterrupt(1, 1, 'c'))).toBe(false);
  });

  it('returns false for transient errors (WARNING level)', () => {
    expect(shouldLogAsError(new LLMError('err', 'openai'))).toBe(false);
    expect(shouldLogAsError(new NetworkError('err'))).toBe(false);
    expect(shouldLogAsError(new RateLimitError('err', 'svc'))).toBe(false);
  });

  it('returns true for validation errors (ERROR level)', () => {
    expect(shouldLogAsError(new BarrierFailedError(1, 2, 3))).toBe(true);
    expect(shouldLogAsError(new ContentPolicyError('bad'))).toBe(true);
  });

  it('returns true for internal errors (CRITICAL level)', () => {
    expect(shouldLogAsError(new DatabaseError('fail'))).toBe(true);
    expect(shouldLogAsError(new OrchestrationFailedError('fail'))).toBe(true);
  });

  it('returns true for unknown errors', () => {
    expect(shouldLogAsError(new Error('unknown'))).toBe(true);
    expect(shouldLogAsError('string error')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Classification helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('getErrorCode', () => {
  it('returns error code for PipelineError instances', () => {
    expect(getErrorCode(new LLMError('err', 'openai'))).toBe('LLM_ERROR');
    expect(getErrorCode(new DatabaseError('fail'))).toBe('DATABASE_ERROR');
    expect(getErrorCode(new BarrierFailedError(1, 2, 3))).toBe('BARRIER_FAILED');
  });

  it('returns UNKNOWN for non-pipeline errors', () => {
    expect(getErrorCode(new Error('plain'))).toBe('UNKNOWN');
    expect(getErrorCode(null)).toBe('UNKNOWN');
    expect(getErrorCode('string')).toBe('UNKNOWN');
  });
});

describe('classifyPipelineError', () => {
  it('returns code for known PipelineError', () => {
    const err = new LLMError('err', 'openai');
    expect(classifyPipelineError(err)).toBe('LLM_ERROR');
  });

  it('returns MINIMUM_LESSONS_NOT_MET code', () => {
    const err = new MinimumLessonsNotMetError(5);
    expect(classifyPipelineError(err)).toBe('MINIMUM_LESSONS_NOT_MET');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// error-formatter: getErrorMessage
// ─────────────────────────────────────────────────────────────────────────────

describe('getErrorMessage', () => {
  it('returns message from Error instance', () => {
    expect(getErrorMessage(new Error('test error'))).toBe('test error');
  });

  it('returns String() for non-Error values', () => {
    expect(getErrorMessage('simple string')).toBe('simple string');
    expect(getErrorMessage(42)).toBe('42');
    expect(getErrorMessage(null)).toBe('null');
    expect(getErrorMessage(undefined)).toBe('undefined');
  });

  it('works with pipeline error subclasses', () => {
    const err = new LLMError('LLM timeout', 'openai');
    expect(getErrorMessage(err)).toBe('LLM timeout');
  });
});
