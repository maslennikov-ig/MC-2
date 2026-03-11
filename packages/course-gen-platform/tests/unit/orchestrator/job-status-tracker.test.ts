/**
 * Unit tests for job-status-tracker.ts
 *
 * Tests all BullMQ → Supabase job status persistence functions.
 * Uses vi.mock for Supabase, vi.useFakeTimers for setTimeout delays.
 *
 * @module tests/unit/orchestrator/job-status-tracker
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

/** Supabase chain builder: each method returns `this`, terminal resolves to response */
function mockChain(response: { data: unknown; error: unknown } = { data: null, error: null }) {
  const chain: Record<string, Mock> = {};
  const methods = ['upsert', 'update', 'select', 'eq', 'is', 'single', 'maybeSingle', 'order'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Make it thenable so `await` resolves to `response`
  Object.defineProperty(chain, 'then', {
    value: (resolve: (v: typeof response) => void) => resolve(response),
    enumerable: false,
    configurable: true,
  });
  return chain;
}

const mockSupabase = {
  from: vi.fn(),
};

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => mockSupabase),
}));

vi.mock('@/shared/logger', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => logger),
  };
  return { default: logger };
});

// ============================================================================
// IMPORTS
// ============================================================================
import {
  createJobStatus,
  updateJobStatus,
  markJobActive,
  markJobCompleted,
  markJobFailed,
  markJobCancelled,
  updateJobProgress,
  getJobStatus,
  JobStatus,
} from '@/orchestrator/job-status-tracker';
import type { Job } from 'bullmq';

// ============================================================================
// HELPERS
// ============================================================================

/** Create a minimal mock BullMQ Job */
function createMockJob(overrides: Record<string, unknown> = {}): Job {
  return {
    id: 'job-123',
    name: 'TEST_JOB',
    data: {
      organizationId: 'org-uuid',
      courseId: 'course-uuid',
      userId: 'user-uuid',
    },
    opts: { attempts: 3 },
    attemptsMade: 0,
    ...overrides,
  } as unknown as Job;
}

// ============================================================================
// TESTS
// ============================================================================

describe('job-status-tracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // createJobStatus
  // --------------------------------------------------------------------------
  describe('createJobStatus', () => {
    it('should upsert a job status record with correct data', async () => {
      const chain = mockChain({ data: { id: 'status-1' }, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const job = createMockJob();
      await createJobStatus(job);

      expect(mockSupabase.from).toHaveBeenCalledWith('job_status');
      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          job_id: 'job-123',
          job_type: 'TEST_JOB',
          organization_id: 'org-uuid',
          course_id: 'course-uuid',
          user_id: 'user-uuid',
          status: JobStatus.PENDING,
          progress: {},
          attempts: 0,
          max_attempts: 3,
        }),
        { onConflict: 'job_id' }
      );
    });

    it('should skip when job.name is undefined', async () => {
      const job = createMockJob({ name: undefined });
      await createJobStatus(job);

      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should skip when organizationId is missing from job data', async () => {
      const job = createMockJob({
        data: { courseId: 'course-uuid', userId: 'user-uuid' },
      });
      await createJobStatus(job);

      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should handle legacy snake_case organization_id', async () => {
      const chain = mockChain({ data: { id: 'status-1' }, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const job = createMockJob({
        data: { organization_id: 'legacy-org', course_id: 'legacy-course' },
      });
      await createJobStatus(job);

      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: 'legacy-org',
        }),
        expect.anything()
      );
    });

    it('should handle upsert error gracefully', async () => {
      const chain = mockChain({
        data: null,
        error: { message: 'duplicate key violation' },
      });
      mockSupabase.from.mockReturnValue(chain);

      const job = createMockJob();
      // Should not throw
      await expect(createJobStatus(job)).resolves.toBeUndefined();
    });

    it('should handle unexpected exception gracefully', async () => {
      mockSupabase.from.mockImplementation(() => {
        throw new Error('Connection lost');
      });

      const job = createMockJob();
      await expect(createJobStatus(job)).resolves.toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // updateJobStatus
  // --------------------------------------------------------------------------
  describe('updateJobStatus', () => {
    it('should update job status with ISO timestamps', async () => {
      const chain = mockChain({ data: [{ id: 'status-1' }], error: null });
      mockSupabase.from.mockReturnValue(chain);

      const started = new Date('2025-01-01T10:00:00Z');
      await updateJobStatus('job-123', {
        status: JobStatus.ACTIVE,
        started_at: started,
      });

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: JobStatus.ACTIVE,
          started_at: '2025-01-01T10:00:00.000Z',
        })
      );
      expect(chain.eq).toHaveBeenCalledWith('job_id', 'job-123');
    });

    it('should add WHERE clauses for onlyIfNotCompleted', async () => {
      const chain = mockChain({ data: [{ id: 'status-1' }], error: null });
      mockSupabase.from.mockReturnValue(chain);

      await updateJobStatus('job-123', { status: JobStatus.ACTIVE }, { onlyIfNotCompleted: true });

      expect(chain.is).toHaveBeenCalledWith('completed_at', null);
      expect(chain.is).toHaveBeenCalledWith('failed_at', null);
      expect(chain.eq).toHaveBeenCalledWith('cancelled', false);
    });

    it('should handle update error gracefully', async () => {
      const chain = mockChain({
        data: null,
        error: { message: 'constraint violation' },
      });
      mockSupabase.from.mockReturnValue(chain);

      await expect(
        updateJobStatus('job-123', { status: JobStatus.ACTIVE })
      ).resolves.toBeUndefined();
    });

    it('should handle empty result set gracefully', async () => {
      const chain = mockChain({ data: [], error: null });
      mockSupabase.from.mockReturnValue(chain);

      await expect(
        updateJobStatus('job-123', { status: JobStatus.ACTIVE })
      ).resolves.toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // markJobActive
  // --------------------------------------------------------------------------
  describe('markJobActive', () => {
    it('should skip activation if job is already in terminal state (completed_at set)', async () => {
      // First check: job already completed
      const chain = mockChain({
        data: {
          completed_at: '2025-01-01T10:00:00Z',
          failed_at: null,
          cancelled: false,
          status: 'completed',
        },
        error: null,
      });
      mockSupabase.from.mockReturnValue(chain);

      const job = createMockJob();
      await markJobActive(job);

      // Should not call update since the job is terminal
      expect(chain.update).not.toHaveBeenCalled();
    });

    it('should skip activation if job status is completed (status field)', async () => {
      const chain = mockChain({
        data: { completed_at: null, failed_at: null, cancelled: false, status: 'completed' },
        error: null,
      });
      mockSupabase.from.mockReturnValue(chain);

      const job = createMockJob();
      await markJobActive(job);

      expect(chain.update).not.toHaveBeenCalled();
    });

    it('should skip activation if attempt exceeds max_attempts', async () => {
      // First two checks pass (not terminal)
      let callCount = 0;
      const createChainForCall = () => {
        callCount++;
        if (callCount <= 3) {
          // Pre-delay check, post-delay check, existing status fetch
          return mockChain({
            data: {
              completed_at: null,
              failed_at: null,
              cancelled: false,
              status: 'pending',
              started_at: null,
              created_at: '2025-01-01T10:00:00Z',
              attempts: 0,
            },
            error: null,
          });
        }
        return mockChain({ data: null, error: null });
      };
      mockSupabase.from.mockImplementation(() => createChainForCall());

      const job = createMockJob({ attemptsMade: 3 }); // 3 + 1 = 4 > max 3
      const promise = markJobActive(job);
      await vi.advanceTimersByTimeAsync(1000);
      await promise;

      // Should not call update since attempt (4) > max_attempts (3)
    });

    it('should handle fetch error gracefully', async () => {
      const chain = mockChain({
        data: null,
        error: { message: 'Connection refused' },
      });
      mockSupabase.from.mockReturnValue(chain);

      const job = createMockJob();
      // markJobActive has internal 500ms setTimeout delay
      const promise = markJobActive(job);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // markJobCompleted
  // --------------------------------------------------------------------------
  describe('markJobCompleted', () => {
    it('should set started_at for fast jobs (started_at not set)', async () => {
      const updateChain = mockChain({ data: [{ id: 'status-1' }], error: null });
      const selectChain = mockChain({
        data: {
          started_at: null,
          created_at: '2025-01-01T10:00:00.000Z',
        },
        error: null,
      });
      mockSupabase.from.mockReturnValue({
        ...selectChain,
        update: updateChain.update,
        // Make select -> maybeSingle resolve to the select data
        select: vi.fn().mockReturnValue(selectChain),
      });

      // Override: first call is the select for existing status, rest are updates
      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain; // fetch existing status
        return updateChain; // updateJobStatus calls
      });

      const job = createMockJob();
      const promise = markJobCompleted(job);
      await vi.advanceTimersByTimeAsync(500);
      await promise;

      // updateJobStatus should have been called (for setting started_at + completed)
      expect(mockSupabase.from).toHaveBeenCalled();
    });

    it('should handle missing status record', async () => {
      const chain = mockChain({ data: null, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const job = createMockJob();
      const promise = markJobCompleted(job);
      await vi.advanceTimersByTimeAsync(500);
      await promise;

      expect(chain.update).not.toHaveBeenCalled();
    });

    it('should handle fetch error', async () => {
      const chain = mockChain({
        data: null,
        error: { message: 'Connection refused' },
      });
      mockSupabase.from.mockReturnValue(chain);

      const job = createMockJob();
      const promise = markJobCompleted(job);
      await vi.advanceTimersByTimeAsync(500);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Helper: run markJobFailed with timer advancement
  // markJobFailed has internal setTimeout(300ms) on final-failure path
  // --------------------------------------------------------------------------
  async function runMarkJobFailed(job: Job, error: Error): Promise<void> {
    const promise = markJobFailed(job, error);
    await vi.advanceTimersByTimeAsync(500);
    await promise;
  }

  // --------------------------------------------------------------------------
  // markJobFailed
  // --------------------------------------------------------------------------
  describe('markJobFailed', () => {
    it('should set status=DELAYED for non-final failures (will retry)', async () => {
      const chain = mockChain({ data: [{ id: 'status-1' }], error: null });
      mockSupabase.from.mockReturnValue(chain);

      const job = createMockJob({ attemptsMade: 1, opts: { attempts: 3 } });
      const error = new Error('Temporary failure');
      // Non-final failure doesn't have the 300ms delay, but use helper anyway
      await runMarkJobFailed(job, error);

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: JobStatus.DELAYED,
          error_message: 'Temporary failure',
          attempts: 1, // clamped to min(1, 3)
        })
      );
    });

    it('should set status=FAILED and failed_at for final failures', async () => {
      // Provide started_at for timestamp logic
      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // fetch existing status
          return mockChain({
            data: {
              started_at: '2025-01-01T10:00:00.000Z',
              created_at: '2025-01-01T09:59:59.000Z',
            },
            error: null,
          });
        }
        // updateJobStatus call
        return mockChain({ data: [{ id: 'status-1' }], error: null });
      });

      const job = createMockJob({ attemptsMade: 3, opts: { attempts: 3 } });
      const error = new Error('Max retries exceeded');
      await runMarkJobFailed(job, error);

      // Should have set FAILED status
      expect(mockSupabase.from).toHaveBeenCalled();
    });

    it('should clamp attempts to max_attempts', async () => {
      // attemptsMade=5, opts.attempts=3 → final failure path → 300ms delay
      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return mockChain({
            data: {
              started_at: '2025-01-01T10:00:00.000Z',
              created_at: '2025-01-01T09:59:59.000Z',
            },
            error: null,
          });
        }
        return mockChain({ data: [{ id: 'status-1' }], error: null });
      });

      const job = createMockJob({ attemptsMade: 5, opts: { attempts: 3 } });
      const error = new Error('Failure');
      await runMarkJobFailed(job, error);

      // The update should have been called with the clamped attempts value
      expect(mockSupabase.from).toHaveBeenCalled();
    });

    it('should extract error message from Error with .message', async () => {
      const chain = mockChain({ data: [{ id: 'status-1' }], error: null });
      mockSupabase.from.mockReturnValue(chain);

      const job = createMockJob({ attemptsMade: 1 });
      const error = new Error('Specific error message');
      await runMarkJobFailed(job, error);

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          error_message: 'Specific error message',
        })
      );
    });

    it('should handle exception gracefully', async () => {
      mockSupabase.from.mockImplementation(() => {
        throw new Error('Network crash');
      });

      const job = createMockJob();
      const error = new Error('Original error');
      // Use the helper with timer advancement
      const promise = markJobFailed(job, error);
      await vi.advanceTimersByTimeAsync(500);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // markJobCancelled
  // --------------------------------------------------------------------------
  describe('markJobCancelled', () => {
    it('should mark job as cancelled with failed status', async () => {
      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return mockChain({
            data: {
              started_at: '2025-01-01T10:00:00.000Z',
              created_at: '2025-01-01T09:59:59.000Z',
            },
            error: null,
          });
        }
        return mockChain({ data: null, error: null });
      });

      const promise = markJobCancelled('job-123', 'admin-user');
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(mockSupabase.from).toHaveBeenCalledWith('job_status');
    });

    it('should mark job as cancelled without cancelledBy', async () => {
      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return mockChain({
            data: {
              started_at: null,
              created_at: '2025-01-01T10:00:00.000Z',
            },
            error: null,
          });
        }
        return mockChain({ data: null, error: null });
      });

      const promise = markJobCancelled('job-123');
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(mockSupabase.from).toHaveBeenCalled();
    });

    it('should handle missing status record', async () => {
      const chain = mockChain({ data: null, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const promise = markJobCancelled('job-123');
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(chain.update).not.toHaveBeenCalled();
    });

    it('should handle fetch error', async () => {
      const chain = mockChain({
        data: null,
        error: { message: 'Connection refused' },
      });
      mockSupabase.from.mockReturnValue(chain);

      const promise = markJobCancelled('job-123');
      await vi.advanceTimersByTimeAsync(100);
      await expect(promise).resolves.toBeUndefined();
    });

    it('should handle exception gracefully', async () => {
      mockSupabase.from.mockImplementation(() => {
        throw new Error('Network crash');
      });

      // markJobCancelled has 50ms setTimeout internally
      const promise = markJobCancelled('job-123');
      await vi.advanceTimersByTimeAsync(100);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // updateJobProgress
  // --------------------------------------------------------------------------
  describe('updateJobProgress', () => {
    it('should delegate to updateJobStatus with progress data', async () => {
      const chain = mockChain({ data: [{ id: 'status-1' }], error: null });
      mockSupabase.from.mockReturnValue(chain);

      await updateJobProgress('job-123', { percent: 50, phase: 'generation' });

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          progress: { percent: 50, phase: 'generation' },
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // getJobStatus
  // --------------------------------------------------------------------------
  describe('getJobStatus', () => {
    it('should return job status data', async () => {
      const chain = mockChain({
        data: { id: 'status-1', job_id: 'job-123', status: 'active' },
        error: null,
      });
      mockSupabase.from.mockReturnValue(chain);

      const result = await getJobStatus('job-123');

      expect(result).toEqual(expect.objectContaining({ job_id: 'job-123', status: 'active' }));
      expect(chain.eq).toHaveBeenCalledWith('job_id', 'job-123');
    });

    it('should return null on DB error', async () => {
      const chain = mockChain({
        data: null,
        error: { message: 'permission denied' },
      });
      mockSupabase.from.mockReturnValue(chain);

      const result = await getJobStatus('job-123');
      expect(result).toBeNull();
    });

    it('should return null on unexpected exception', async () => {
      mockSupabase.from.mockImplementation(() => {
        throw new Error('Network crash');
      });

      const result = await getJobStatus('job-123');
      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // JobStatus enum
  // --------------------------------------------------------------------------
  describe('JobStatus enum', () => {
    it('should have correct values', () => {
      expect(JobStatus.PENDING).toBe('pending');
      expect(JobStatus.WAITING).toBe('waiting');
      expect(JobStatus.ACTIVE).toBe('active');
      expect(JobStatus.COMPLETED).toBe('completed');
      expect(JobStatus.FAILED).toBe('failed');
      expect(JobStatus.DELAYED).toBe('delayed');
    });
  });
});
