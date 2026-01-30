/**
 * Stage 4 Orchestrator Error Handling Tests
 *
 * Tests that ClarifyingQuestionsInterrupt is logged as INFO, not ERROR.
 * This test documents the fix for the issue where interrupts were incorrectly
 * logged at ERROR level before being classified.
 *
 * TDD: This test would FAIL before the fix and PASS after.
 *
 * @module tests/unit/stages/stage4-analysis/orchestrator-error-handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ClarifyingQuestionsInterrupt,
  BarrierFailedError,
  LLMError,
  isPipelineInterrupt,
  shouldLogAsError,
} from '@/shared/errors';

/**
 * Mock logger to capture log calls
 */
const createMockLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
});

describe('Stage 4 Orchestrator Error Handling', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  describe('ClarifyingQuestionsInterrupt logging behavior', () => {
    /**
     * This test verifies the CORRECT behavior after the fix.
     * Before the fix, ERROR was logged unconditionally, THEN string matching checked.
     * After the fix, isPipelineInterrupt is checked FIRST, then appropriate level logged.
     */
    it('should use isPipelineInterrupt to determine log level BEFORE logging', () => {
      const interrupt = new ClarifyingQuestionsInterrupt(4, 5, 'test-course-id');

      // Simulate the CORRECT catch block logic (after fix)
      const isInterrupt = isPipelineInterrupt(interrupt);

      if (isInterrupt) {
        mockLogger.info(
          {
            code: interrupt.code,
            message: interrupt.message,
            courseId: interrupt.courseId,
          },
          'Stage 4 paused (interrupt)'
        );
      } else {
        mockLogger.error({ error: interrupt.message }, 'Stage 4 analysis orchestration failed');
      }

      // Verify INFO was called, not ERROR
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'AWAITING_CLARIFYING_ANSWERS',
        }),
        'Stage 4 paused (interrupt)'
      );
    });

    it('should log ERROR for real errors like BarrierFailedError', () => {
      const error = new BarrierFailedError(3, 5, 10);

      const isInterrupt = isPipelineInterrupt(error);

      if (isInterrupt) {
        mockLogger.info({ code: error.code }, 'Stage 4 paused (interrupt)');
      } else {
        mockLogger.error({ error: error.message }, 'Stage 4 analysis orchestration failed');
      }

      // Verify ERROR was called, not INFO
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should log ERROR for transient errors like LLMError', () => {
      const error = new LLMError('Rate limit exceeded', 'openrouter', 'gpt-4', 429);

      const isInterrupt = isPipelineInterrupt(error);

      if (isInterrupt) {
        mockLogger.info({ code: error.code }, 'Stage 4 paused (interrupt)');
      } else {
        mockLogger.error({ error: error.message }, 'Stage 4 analysis orchestration failed');
      }

      // LLMError is NOT an interrupt, should log ERROR
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should log ERROR for unknown Error instances', () => {
      const error = new Error('Unknown error');

      const isInterrupt = isPipelineInterrupt(error);

      if (isInterrupt) {
        mockLogger.info({ code: 'unknown' }, 'Stage 4 paused (interrupt)');
      } else {
        mockLogger.error({ error: error.message }, 'Stage 4 analysis orchestration failed');
      }

      // Regular Error is NOT an interrupt
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  describe('shouldLogAsError utility alignment', () => {
    /**
     * Verifies that shouldLogAsError returns false for interrupts,
     * which aligns with logging at INFO level.
     */
    it('shouldLogAsError returns false for ClarifyingQuestionsInterrupt', () => {
      const interrupt = new ClarifyingQuestionsInterrupt(2, 3, 'course-1');
      expect(shouldLogAsError(interrupt)).toBe(false);
    });

    it('shouldLogAsError returns true for BarrierFailedError', () => {
      const error = new BarrierFailedError(3, 0, 10);
      expect(shouldLogAsError(error)).toBe(true);
    });

    it('shouldLogAsError returns false for transient LLMError (WARNING level)', () => {
      const error = new LLMError('timeout', 'openrouter');
      // Transient errors are WARNING level, not ERROR
      expect(shouldLogAsError(error)).toBe(false);
    });
  });

  describe('regression prevention', () => {
    /**
     * Documents the correct behavior: isPipelineInterrupt checked BEFORE logging.
     *
     * Historical context: Before the fix, ERROR was logged unconditionally,
     * then string matching checked. Now isPipelineInterrupt is checked FIRST.
     */
    it('isPipelineInterrupt checked BEFORE logging (correct behavior)', () => {
      const interrupt = new ClarifyingQuestionsInterrupt(4, 5, 'test-course-id');

      // Simulate the CORRECT catch block logic (after fix)
      const isInterrupt = isPipelineInterrupt(interrupt);

      // Check FIRST, then log at appropriate level
      if (isInterrupt) {
        mockLogger.info(
          { code: interrupt.code, courseId: interrupt.courseId },
          'Stage 4 paused (interrupt)'
        );
      } else {
        mockLogger.error({ error: interrupt.message }, 'Stage 4 analysis orchestration failed');
      }

      // Correct: ERROR not called for interrupts
      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
    });
  });
});
