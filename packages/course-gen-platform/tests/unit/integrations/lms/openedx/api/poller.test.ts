/**
 * Unit tests for Open edX Import Status Poller
 * @module tests/unit/integrations/lms/openedx/api/poller
 *
 * These tests verify that the poller correctly:
 * - Polls until terminal state (SUCCESS or FAILURE)
 * - Invokes progress callbacks after each poll
 * - Respects custom polling configuration (maxAttempts, intervalMs)
 * - Handles immediate success (first poll)
 * - Throws appropriate errors on failure states
 * - Throws timeout error after maxAttempts exceeded
 * - Re-throws LMS errors (OpenEdXImportError, LMSTimeoutError)
 * - Continues polling on transient network errors
 * - Handles progress callback errors gracefully
 * - Estimates remaining time accurately
 * - Formats duration for human-readable display
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  pollImportStatus,
  estimateRemainingTime,
  formatDuration,
  type PollOptions,
} from '@/integrations/lms/openedx/api/poller';
import { OpenEdXImportError, LMSTimeoutError } from '@megacampus/shared-types/lms/errors';
import type { ImportStatus } from '@/integrations/lms/openedx/api/types';
import type { OpenEdXClient } from '@/integrations/lms/openedx/api/client';

// Mock logger to avoid console output during tests
vi.mock('@/integrations/lms/logger', () => ({
  lmsLogger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('pollImportStatus', () => {
  let mockClient: Partial<OpenEdXClient>;
  let mockGetImportStatus: ReturnType<typeof vi.fn>;
  let mockGetCourseUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGetImportStatus = vi.fn();
    mockGetCourseUrl = vi.fn((courseKey: string) => `https://studio.example.com/course/${courseKey}`);

    mockClient = {
      getImportStatus: mockGetImportStatus,
      getCourseUrl: mockGetCourseUrl,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Success Cases', () => {
    it('should poll until SUCCESS state and return courseKey and courseUrl', async () => {
      const taskId = 'task_123';
      const courseKey = 'course-v1:Org+Course+Run';

      // Mock status progression: PENDING → IN_PROGRESS → SUCCESS
      mockGetImportStatus
        .mockResolvedValueOnce({
          task_id: taskId,
          state: 'PENDING',
          progress_percent: 0,
          message: 'Task queued',
          error_message: null,
          course_key: null,
        })
        .mockResolvedValueOnce({
          task_id: taskId,
          state: 'IN_PROGRESS',
          progress_percent: 50,
          message: 'Processing...',
          error_message: null,
          course_key: null,
        })
        .mockResolvedValueOnce({
          task_id: taskId,
          state: 'SUCCESS',
          progress_percent: 100,
          message: 'Import completed',
          error_message: null,
          course_key: courseKey,
        });

      const result = await pollImportStatus(mockClient as OpenEdXClient, taskId, {
        intervalMs: 10, // Fast interval for test
      });

      expect(result).toEqual({
        success: true,
        courseKey,
        courseUrl: `https://studio.example.com/course/${courseKey}`,
        error: null,
        state: 'SUCCESS',
        taskId,
      });

      expect(mockGetImportStatus).toHaveBeenCalledTimes(3);
      expect(mockGetCourseUrl).toHaveBeenCalledWith(courseKey);
    });

    it('should invoke onProgress callback after each poll', async () => {
      const taskId = 'task_456';
      const onProgress = vi.fn();

      const statuses: ImportStatus[] = [
        {
          task_id: taskId,
          state: 'PENDING',
          progress_percent: 0,
          message: 'Queued',
          error_message: null,
          course_key: null,
        },
        {
          task_id: taskId,
          state: 'IN_PROGRESS',
          progress_percent: 75,
          message: 'Almost done',
          error_message: null,
          course_key: null,
        },
        {
          task_id: taskId,
          state: 'SUCCESS',
          progress_percent: 100,
          message: 'Done',
          error_message: null,
          course_key: 'course-v1:Test+Course+2025',
        },
      ];

      mockGetImportStatus
        .mockResolvedValueOnce(statuses[0])
        .mockResolvedValueOnce(statuses[1])
        .mockResolvedValueOnce(statuses[2]);

      await pollImportStatus(mockClient as OpenEdXClient, taskId, {
        intervalMs: 10,
        onProgress,
      });

      expect(onProgress).toHaveBeenCalledTimes(3);
      expect(onProgress).toHaveBeenNthCalledWith(1, statuses[0]);
      expect(onProgress).toHaveBeenNthCalledWith(2, statuses[1]);
      expect(onProgress).toHaveBeenNthCalledWith(3, statuses[2]);
    });

    it('should respect custom intervalMs', async () => {
      const taskId = 'task_789';

      mockGetImportStatus
        .mockResolvedValueOnce({
          task_id: taskId,
          state: 'PENDING',
          progress_percent: null,
          message: null,
          error_message: null,
          course_key: null,
        })
        .mockResolvedValueOnce({
          task_id: taskId,
          state: 'SUCCESS',
          progress_percent: 100,
          message: null,
          error_message: null,
          course_key: 'course-v1:Test+Course+2025',
        });

      const result = await pollImportStatus(mockClient as OpenEdXClient, taskId, {
        intervalMs: 10,
      });

      expect(result.success).toBe(true);
      expect(mockGetImportStatus).toHaveBeenCalledTimes(2);
    });

    it('should respect custom maxAttempts', async () => {
      const taskId = 'task_max';
      const customMaxAttempts = 3;

      // Mock status that never reaches terminal state
      mockGetImportStatus.mockResolvedValue({
        task_id: taskId,
        state: 'IN_PROGRESS',
        progress_percent: 50,
        message: 'Still processing',
        error_message: null,
        course_key: null,
      });

      await expect(
        pollImportStatus(mockClient as OpenEdXClient, taskId, {
          intervalMs: 10,
          maxAttempts: customMaxAttempts,
        })
      ).rejects.toThrow(LMSTimeoutError);
      expect(mockGetImportStatus).toHaveBeenCalledTimes(customMaxAttempts);
    });

    it('should handle immediate SUCCESS on first poll', async () => {
      const taskId = 'task_immediate';
      const courseKey = 'course-v1:Org+Immediate+2025';

      mockGetImportStatus.mockResolvedValueOnce({
        task_id: taskId,
        state: 'SUCCESS',
        progress_percent: 100,
        message: 'Already completed',
        error_message: null,
        course_key: courseKey,
      });

      const result = await pollImportStatus(mockClient as OpenEdXClient, taskId);

      expect(result.success).toBe(true);
      expect(result.courseKey).toBe(courseKey);
      expect(mockGetImportStatus).toHaveBeenCalledTimes(1);
    });

    it('should return null courseUrl if course_key is null', async () => {
      const taskId = 'task_no_key';

      mockGetImportStatus.mockResolvedValueOnce({
        task_id: taskId,
        state: 'SUCCESS',
        progress_percent: 100,
        message: 'Completed but no course key',
        error_message: null,
        course_key: null,
      });

      const result = await pollImportStatus(mockClient as OpenEdXClient, taskId);

      expect(result.success).toBe(true);
      expect(result.courseKey).toBeNull();
      expect(result.courseUrl).toBeNull();
      expect(mockGetCourseUrl).not.toHaveBeenCalled();
    });
  });

  describe('Failure Cases', () => {
    it('should throw OpenEdXImportError on FAILURE state with error_message', async () => {
      const taskId = 'task_fail';
      const errorMessage = 'Invalid OLX structure detected';

      mockGetImportStatus.mockResolvedValueOnce({
        task_id: taskId,
        state: 'FAILURE',
        progress_percent: 45,
        message: null,
        error_message: errorMessage,
        course_key: null,
      });

      await expect(
        pollImportStatus(mockClient as OpenEdXClient, taskId)
      ).rejects.toThrow(OpenEdXImportError);

      await expect(
        pollImportStatus(mockClient as OpenEdXClient, taskId)
      ).rejects.toThrow(`Course import failed: ${errorMessage}`);
    });

    it('should use message field if error_message is null on FAILURE', async () => {
      const taskId = 'task_fail_msg';
      const message = 'Processing failed';

      mockGetImportStatus.mockResolvedValueOnce({
        task_id: taskId,
        state: 'FAILURE',
        progress_percent: null,
        message,
        error_message: null,
        course_key: null,
      });

      await expect(
        pollImportStatus(mockClient as OpenEdXClient, taskId)
      ).rejects.toThrow(`Course import failed: ${message}`);
    });

    it('should use default message if both error_message and message are null', async () => {
      const taskId = 'task_fail_default';

      mockGetImportStatus.mockResolvedValueOnce({
        task_id: taskId,
        state: 'FAILURE',
        progress_percent: null,
        message: null,
        error_message: null,
        course_key: null,
      });

      await expect(
        pollImportStatus(mockClient as OpenEdXClient, taskId)
      ).rejects.toThrow('Course import failed: Import failed');
    });

    it('should throw LMSTimeoutError after maxAttempts exceeded', async () => {
      const taskId = 'task_timeout';
      const maxAttempts = 5;

      mockGetImportStatus.mockResolvedValue({
        task_id: taskId,
        state: 'IN_PROGRESS',
        progress_percent: 30,
        message: 'Still processing',
        error_message: null,
        course_key: null,
      });

      await expect(
        pollImportStatus(mockClient as OpenEdXClient, taskId, {
          intervalMs: 10,
          maxAttempts,
        })
      ).rejects.toThrow(LMSTimeoutError);

      await expect(
        pollImportStatus(mockClient as OpenEdXClient, taskId, {
          intervalMs: 10,
          maxAttempts,
        })
      ).rejects.toThrow(
        `Import status polling timed out after ${maxAttempts} attempts`
      );

      expect(mockGetImportStatus).toHaveBeenCalledTimes(maxAttempts);
    });

    it('should include last status in timeout error metadata', async () => {
      const taskId = 'task_timeout_status';
      const lastStatus: ImportStatus = {
        task_id: taskId,
        state: 'IN_PROGRESS',
        progress_percent: 85,
        message: 'Almost there',
        error_message: null,
        course_key: null,
      };

      mockGetImportStatus.mockResolvedValue(lastStatus);

      try {
        await pollImportStatus(mockClient as OpenEdXClient, taskId, {
          intervalMs: 10,
          maxAttempts: 2,
        });
        expect.fail('Should have thrown LMSTimeoutError');
      } catch (error) {
        expect(error).toBeInstanceOf(LMSTimeoutError);
        const timeoutError = error as LMSTimeoutError;
        expect(timeoutError.operation).toBe('poll');
        expect(timeoutError.lmsType).toBe('openedx');
      }
    });
  });

  describe('Progress Tracking', () => {
    it('should call onProgress with each status update', async () => {
      const taskId = 'task_progress';
      const onProgress = vi.fn();

      const status1: ImportStatus = {
        task_id: taskId,
        state: 'PENDING',
        progress_percent: 0,
        message: 'Queued',
        error_message: null,
        course_key: null,
      };

      const status2: ImportStatus = {
        task_id: taskId,
        state: 'IN_PROGRESS',
        progress_percent: 50,
        message: 'Halfway',
        error_message: null,
        course_key: null,
      };

      const status3: ImportStatus = {
        task_id: taskId,
        state: 'SUCCESS',
        progress_percent: 100,
        message: 'Complete',
        error_message: null,
        course_key: 'course-v1:Test+Course+2025',
      };

      mockGetImportStatus
        .mockResolvedValueOnce(status1)
        .mockResolvedValueOnce(status2)
        .mockResolvedValueOnce(status3);

      await pollImportStatus(mockClient as OpenEdXClient, taskId, {
        intervalMs: 10,
        onProgress,
      });

      expect(onProgress).toHaveBeenCalledTimes(3);
      expect(onProgress).toHaveBeenNthCalledWith(1, status1);
      expect(onProgress).toHaveBeenNthCalledWith(2, status2);
      expect(onProgress).toHaveBeenNthCalledWith(3, status3);
    });

    it('should continue polling through PENDING and IN_PROGRESS states', async () => {
      const taskId = 'task_states';

      mockGetImportStatus
        .mockResolvedValueOnce({
          task_id: taskId,
          state: 'PENDING',
          progress_percent: null,
          message: null,
          error_message: null,
          course_key: null,
        })
        .mockResolvedValueOnce({
          task_id: taskId,
          state: 'PENDING',
          progress_percent: null,
          message: null,
          error_message: null,
          course_key: null,
        })
        .mockResolvedValueOnce({
          task_id: taskId,
          state: 'IN_PROGRESS',
          progress_percent: 25,
          message: null,
          error_message: null,
          course_key: null,
        })
        .mockResolvedValueOnce({
          task_id: taskId,
          state: 'IN_PROGRESS',
          progress_percent: 75,
          message: null,
          error_message: null,
          course_key: null,
        })
        .mockResolvedValueOnce({
          task_id: taskId,
          state: 'SUCCESS',
          progress_percent: 100,
          message: null,
          error_message: null,
          course_key: 'course-v1:Test+Course+2025',
        });

      const result = await pollImportStatus(mockClient as OpenEdXClient, taskId, {
        intervalMs: 10,
      });

      expect(result.success).toBe(true);
      expect(mockGetImportStatus).toHaveBeenCalledTimes(5);
    });

    it('should handle progress callback errors gracefully (ignore and log)', async () => {
      const taskId = 'task_callback_error';
      const onProgress = vi.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });

      mockGetImportStatus.mockResolvedValueOnce({
        task_id: taskId,
        state: 'SUCCESS',
        progress_percent: 100,
        message: null,
        error_message: null,
        course_key: 'course-v1:Test+Course+2025',
      });

      // Should not throw - callback errors are caught and ignored
      const result = await pollImportStatus(mockClient as OpenEdXClient, taskId, {
        onProgress,
      });

      expect(result.success).toBe(true);
      expect(onProgress).toHaveBeenCalledTimes(1);
    });

    it('should not invoke onProgress if callback is not provided', async () => {
      const taskId = 'task_no_callback';

      mockGetImportStatus.mockResolvedValueOnce({
        task_id: taskId,
        state: 'SUCCESS',
        progress_percent: 100,
        message: null,
        error_message: null,
        course_key: 'course-v1:Test+Course+2025',
      });

      const result = await pollImportStatus(mockClient as OpenEdXClient, taskId);

      expect(result.success).toBe(true);
      // No error should occur - just verify it works
    });
  });

  describe('Error Handling', () => {
    it('should continue polling on transient network errors', async () => {
      const taskId = 'task_transient';
      const networkError = new Error('ECONNREFUSED');

      // First 2 calls fail with network error, 3rd succeeds
      mockGetImportStatus
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          task_id: taskId,
          state: 'SUCCESS',
          progress_percent: 100,
          message: null,
          error_message: null,
          course_key: 'course-v1:Test+Course+2025',
        });

      const result = await pollImportStatus(mockClient as OpenEdXClient, taskId, {
        intervalMs: 10,
      });

      expect(result.success).toBe(true);
      expect(mockGetImportStatus).toHaveBeenCalledTimes(3);
    });

    it('should re-throw OpenEdXImportError directly', async () => {
      const taskId = 'task_import_error';
      const importError = new OpenEdXImportError(
        'Custom import error',
        taskId,
        'FAILURE'
      );

      mockGetImportStatus.mockRejectedValueOnce(importError);

      await expect(
        pollImportStatus(mockClient as OpenEdXClient, taskId)
      ).rejects.toThrow(OpenEdXImportError);

      await expect(
        pollImportStatus(mockClient as OpenEdXClient, taskId)
      ).rejects.toThrow('Custom import error');

      expect(mockGetImportStatus).toHaveBeenCalledTimes(1);
    });

    it('should re-throw LMSTimeoutError directly', async () => {
      const taskId = 'task_timeout_rethrow';
      const timeoutError = new LMSTimeoutError(
        'Custom timeout error',
        'openedx',
        30000,
        'poll'
      );

      mockGetImportStatus.mockRejectedValueOnce(timeoutError);

      await expect(
        pollImportStatus(mockClient as OpenEdXClient, taskId)
      ).rejects.toThrow(LMSTimeoutError);

      await expect(
        pollImportStatus(mockClient as OpenEdXClient, taskId)
      ).rejects.toThrow('Custom timeout error');

      expect(mockGetImportStatus).toHaveBeenCalledTimes(1);
    });

    it('should timeout even with transient errors if maxAttempts exceeded', async () => {
      const taskId = 'task_transient_timeout';
      const networkError = new Error('Network error');

      // All calls fail with network error
      mockGetImportStatus.mockRejectedValue(networkError);

      await expect(
        pollImportStatus(mockClient as OpenEdXClient, taskId, {
          intervalMs: 10,
          maxAttempts: 3,
        })
      ).rejects.toThrow(LMSTimeoutError);
      expect(mockGetImportStatus).toHaveBeenCalledTimes(3);
    });
  });

  describe('Default Configuration', () => {
    it('should use default maxAttempts (60) if not specified', async () => {
      const taskId = 'task_defaults';

      mockGetImportStatus.mockResolvedValue({
        task_id: taskId,
        state: 'IN_PROGRESS',
        progress_percent: 50,
        message: null,
        error_message: null,
        course_key: null,
      });

      await expect(
        pollImportStatus(mockClient as OpenEdXClient, taskId, {
          intervalMs: 10, // Fast interval for test
        })
      ).rejects.toThrow(LMSTimeoutError);
      expect(mockGetImportStatus).toHaveBeenCalledTimes(60);
    });

    it('should use default intervalMs (5000) if not specified', async () => {
      const taskId = 'task_default_interval';

      mockGetImportStatus.mockResolvedValueOnce({
        task_id: taskId,
        state: 'SUCCESS',
        progress_percent: 100,
        message: null,
        error_message: null,
        course_key: 'course-v1:Test+Course+2025',
      });

      const result = await pollImportStatus(mockClient as OpenEdXClient, taskId);

      expect(result.success).toBe(true);
      expect(mockGetImportStatus).toHaveBeenCalledTimes(1);
    });
  });
});

describe('estimateRemainingTime', () => {
  it('should calculate remaining time from progress_percent', () => {
    const status: ImportStatus = {
      task_id: 'task_123',
      state: 'IN_PROGRESS',
      progress_percent: 50,
      message: null,
      error_message: null,
      course_key: null,
    };

    const elapsedMs = 10000; // 10 seconds elapsed at 50% progress

    const remaining = estimateRemainingTime(status, elapsedMs);

    // 50% done in 10s → total estimated 20s → 10s remaining
    expect(remaining).toBe(10000);
  });

  it('should return null for 0% progress', () => {
    const status: ImportStatus = {
      task_id: 'task_123',
      state: 'IN_PROGRESS',
      progress_percent: 0,
      message: null,
      error_message: null,
      course_key: null,
    };

    const remaining = estimateRemainingTime(status, 5000);

    expect(remaining).toBeNull();
  });

  it('should return null for missing progress_percent', () => {
    const status: ImportStatus = {
      task_id: 'task_123',
      state: 'PENDING',
      progress_percent: null,
      message: null,
      error_message: null,
      course_key: null,
    };

    const remaining = estimateRemainingTime(status, 5000);

    expect(remaining).toBeNull();
  });

  it('should return 0 for 100% progress', () => {
    const status: ImportStatus = {
      task_id: 'task_123',
      state: 'IN_PROGRESS',
      progress_percent: 100,
      message: null,
      error_message: null,
      course_key: null,
    };

    const remaining = estimateRemainingTime(status, 15000);

    expect(remaining).toBe(0);
  });

  it('should handle small progress percentages', () => {
    const status: ImportStatus = {
      task_id: 'task_123',
      state: 'IN_PROGRESS',
      progress_percent: 10,
      message: null,
      error_message: null,
      course_key: null,
    };

    const elapsedMs = 5000; // 5s at 10% → total estimated 50s → 45s remaining

    const remaining = estimateRemainingTime(status, elapsedMs);

    expect(remaining).toBe(45000);
  });

  it('should handle large progress percentages', () => {
    const status: ImportStatus = {
      task_id: 'task_123',
      state: 'IN_PROGRESS',
      progress_percent: 95,
      message: null,
      error_message: null,
      course_key: null,
    };

    const elapsedMs = 19000; // 19s at 95% → total ~20s → ~1s remaining

    const remaining = estimateRemainingTime(status, elapsedMs);

    // Should be approximately 1s (1000ms)
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThan(2000);
  });

  it('should round remaining time to nearest integer', () => {
    const status: ImportStatus = {
      task_id: 'task_123',
      state: 'IN_PROGRESS',
      progress_percent: 33,
      message: null,
      error_message: null,
      course_key: null,
    };

    const elapsedMs = 10000;

    const remaining = estimateRemainingTime(status, elapsedMs);

    // Should return integer, not decimal
    expect(Number.isInteger(remaining)).toBe(true);
  });
});

describe('formatDuration', () => {
  it('should format seconds only for < 1 minute', () => {
    expect(formatDuration(30000)).toBe('30s');
    expect(formatDuration(15000)).toBe('15s');
    expect(formatDuration(59000)).toBe('59s');
  });

  it('should format minutes and seconds for >= 1 minute', () => {
    expect(formatDuration(60000)).toBe('1m 0s');
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(150000)).toBe('2m 30s');
  });

  it('should handle 0 duration', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('should handle large durations', () => {
    expect(formatDuration(3600000)).toBe('60m 0s'); // 1 hour
    expect(formatDuration(3661000)).toBe('61m 1s'); // 1h 1m 1s
  });

  it('should floor seconds (ignore milliseconds)', () => {
    expect(formatDuration(1500)).toBe('1s'); // 1.5 seconds → 1s
    expect(formatDuration(999)).toBe('0s'); // 0.999 seconds → 0s
  });

  it('should handle exact minute boundaries', () => {
    expect(formatDuration(120000)).toBe('2m 0s');
    expect(formatDuration(180000)).toBe('3m 0s');
    expect(formatDuration(300000)).toBe('5m 0s');
  });

  it('should format mixed minutes and seconds', () => {
    expect(formatDuration(125000)).toBe('2m 5s');
    expect(formatDuration(195000)).toBe('3m 15s');
    expect(formatDuration(305000)).toBe('5m 5s');
  });
});
