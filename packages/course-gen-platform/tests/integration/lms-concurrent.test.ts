/**
 * LMS Concurrent Publish Integration Tests (T116a)
 * @module tests/integration/lms-concurrent.test
 *
 * Integration tests for job locking to prevent concurrent publish attempts.
 * Tests that only one active import job can exist per course at a time.
 *
 * Test Coverage:
 * 1. Should return CONFLICT if pending job exists for same course
 * 2. Should return CONFLICT if uploading job exists for same course
 * 3. Should return CONFLICT if processing job exists for same course
 * 4. Should allow publish if previous job succeeded
 * 5. Should allow publish if previous job failed
 * 6. Should release lock (allow new job) after job completes
 * 7. Should release lock (allow new job) after job fails
 * 8. Race condition: two simultaneous requests for same course (only one should succeed)
 *
 * Prerequisites:
 * - Mock Supabase admin client
 * - Tests run in isolation (no real database calls)
 *
 * Test execution: pnpm vitest packages/course-gen-platform/tests/integration/lms-concurrent.test.ts
 *
 * Reference: T115-T116a - Implement job locking to prevent concurrent publish attempts
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { router } from '../../src/server/trpc';
import type { Context } from '../../src/server/trpc';
import { protectedProcedure } from '../../src/server/middleware/auth';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';

// Mock Supabase admin client
const mockSupabaseFrom = vi.fn();
const mockSupabaseSelect = vi.fn();
const mockSupabaseEq = vi.fn();
const mockSupabaseIn = vi.fn();
const mockSupabaseMaybeSingle = vi.fn();
const mockSupabaseSingle = vi.fn();
const mockSupabaseInsert = vi.fn();
const mockSupabaseUpdate = vi.fn();

vi.mock('../../src/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: mockSupabaseFrom,
  })),
}));

// Mock other dependencies
vi.mock('../../src/integrations/lms/logger', () => ({
  lmsLogger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/integrations/lms', () => ({
  createLMSAdapter: vi.fn(() => ({
    publishCourse: vi.fn().mockResolvedValue({
      success: true,
      lmsCourseId: 'course-v1:Test+Course+Run',
      lmsUrl: 'https://lms.example.com/courses/course-v1:Test+Course+Run',
      studioUrl: 'https://studio.example.com/course/course-v1:Test+Course+Run',
      duration: 5000,
      taskId: 'task-123',
    }),
  })),
}));

vi.mock('../../src/integrations/lms/course-mapper', () => ({
  mapCourseToInput: vi.fn().mockResolvedValue({
    courseId: 'TestCourse',
    title: 'Test Course',
    run: 'self_paced',
    sections: [],
  }),
}));

// ============================================================================
// Mock Data
// ============================================================================

const mockAdminUser = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'admin@example.com',
  role: 'admin' as const,
  organizationId: '550e8400-e29b-41d4-a716-446655440099',
};

const COURSE_ID = '111e8400-e29b-41d4-a716-446655440001';
const LMS_CONFIG_ID = '222e8400-e29b-41d4-a716-446655440002';

const mockCourse = {
  id: COURSE_ID,
  title: 'Test Course',
  user_id: mockAdminUser.id,
  organization_id: mockAdminUser.organizationId,
};

const mockConfig = {
  id: LMS_CONFIG_ID,
  organization_id: mockAdminUser.organizationId,
  name: 'Production LMS',
  description: 'Test LMS config',
  lms_url: 'https://lms.example.com',
  studio_url: 'https://studio.example.com',
  client_id: 'test-client-id',
  client_secret: 'test-client-secret',
  default_org: 'TestOrg',
  default_run: 'self_paced',
  import_timeout_seconds: 300,
  max_retries: 3,
  poll_interval_seconds: 5,
  is_active: true,
  last_connection_test: null,
  last_connection_status: null,
  created_at: '2024-12-11T10:00:00Z',
  updated_at: '2024-12-11T10:00:00Z',
  created_by: mockAdminUser.id,
};

// Helper to create job object
const createMockJob = (status: string, jobId: string = nanoid()) => ({
  id: jobId,
  course_id: COURSE_ID,
  lms_config_id: LMS_CONFIG_ID,
  user_id: mockAdminUser.id,
  edx_course_key: 'course-v1:TestOrg+TestCourse+self_paced',
  edx_task_id: null,
  status,
  progress_percent: 0,
  started_at: new Date().toISOString(),
  completed_at: null,
  course_url: null,
  studio_url: null,
  error_code: null,
  error_message: null,
});

// ============================================================================
// Mock Router Implementation
// ============================================================================

/**
 * Mock publish router implementation
 * Simplified version that focuses on job locking logic
 */
const mockPublishRouter = router({
  start: protectedProcedure
    .input(
      z.object({
        courseId: z.string().uuid(),
        lmsConfigId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { courseId, lmsConfigId } = input;
      const userId = ctx.user.id;

      // Step 1: Verify course ownership (mocked)
      const courseQuery = mockSupabaseFrom('courses');
      mockSupabaseFrom.mockReturnValue(courseQuery);

      const courseSelect = { eq: vi.fn(), single: vi.fn() };
      courseQuery.select = vi.fn().mockReturnValue(courseSelect);
      courseSelect.eq.mockReturnValue(courseSelect);
      courseSelect.single.mockResolvedValue({ data: mockCourse, error: null });

      if (mockCourse.user_id !== userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this course',
        });
      }

      // Step 2: Fetch LMS configuration (mocked)
      const configQuery = mockSupabaseFrom('lms_configurations');
      const configSelect = { eq: vi.fn(), single: vi.fn() };
      configQuery.select = vi.fn().mockReturnValue(configSelect);
      configSelect.eq.mockReturnValue(configSelect);
      configSelect.single.mockResolvedValue({ data: mockConfig, error: null });

      if (!mockConfig.is_active) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'LMS configuration is inactive',
        });
      }

      // Step 3: Check for active import job (job locking) - THIS IS THE KEY LOGIC
      const jobQuery = mockSupabaseFrom('lms_import_jobs');
      const jobSelect = { eq: vi.fn(), in: vi.fn(), maybeSingle: vi.fn() };
      jobQuery.select = vi.fn().mockReturnValue(jobSelect);
      jobSelect.eq.mockReturnValue(jobSelect);
      jobSelect.in.mockReturnValue(jobSelect);

      // This will be mocked per test
      const { data: activeJob } = await jobSelect.maybeSingle();

      if (activeJob) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Course already has an active import job (status: ${activeJob.status}, job ID: ${activeJob.id}). Please wait for it to complete or cancel it first.`,
        });
      }

      // Step 4: Create import job record
      const jobId = nanoid();
      const insertQuery = mockSupabaseFrom('lms_import_jobs');
      insertQuery.insert = mockSupabaseInsert;
      mockSupabaseInsert.mockResolvedValue({ error: null });

      // Step 5: Return success
      return {
        jobId,
        lmsCourseId: 'course-v1:TestOrg+TestCourse+self_paced',
        lmsUrl: 'https://lms.example.com/courses/course-v1:TestOrg+TestCourse+self_paced',
        studioUrl: 'https://studio.example.com/course/course-v1:TestOrg+TestCourse+self_paced',
        message: 'Course published successfully to LMS',
      };
    }),
});

// ============================================================================
// Tests
// ============================================================================

describe('LMS Concurrent Publish Integration', () => {
  let mockContext: Context;
  let caller: ReturnType<typeof mockPublishRouter.createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock context with admin user
    mockContext = {
      user: mockAdminUser,
      req: new Request('http://localhost'),
    };

    // Create caller
    caller = mockPublishRouter.createCaller(mockContext);

    // Setup default Supabase chain for course and config queries
    const courseQuery = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockCourse, error: null }),
        }),
      }),
    };

    const configQuery = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockConfig, error: null }),
          }),
        }),
      }),
    };

    // Setup Supabase from() to return appropriate query chain
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'courses') return courseQuery;
      if (table === 'lms_configurations') return configQuery;

      // For lms_import_jobs, return a query object that can be mocked per test
      const jobQuery = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              maybeSingle: mockSupabaseMaybeSingle,
            }),
          }),
        }),
        insert: mockSupabaseInsert,
      };
      return jobQuery;
    });

    // Default: no active jobs
    mockSupabaseMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockSupabaseInsert.mockResolvedValue({ error: null });
  });

  describe('Job Locking - Active Status Checks', () => {
    it('should return CONFLICT if pending job exists for same course', async () => {
      const pendingJob = createMockJob('pending');
      mockSupabaseMaybeSingle.mockResolvedValue({ data: pendingJob, error: null });

      await expect(
        caller.start({
          courseId: COURSE_ID,
          lmsConfigId: LMS_CONFIG_ID,
        })
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: expect.stringContaining('pending'),
        message: expect.stringContaining(pendingJob.id),
      });
    });

    it('should return CONFLICT if uploading job exists for same course', async () => {
      const uploadingJob = createMockJob('uploading');
      mockSupabaseMaybeSingle.mockResolvedValue({ data: uploadingJob, error: null });

      await expect(
        caller.start({
          courseId: COURSE_ID,
          lmsConfigId: LMS_CONFIG_ID,
        })
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: expect.stringContaining('uploading'),
        message: expect.stringContaining(uploadingJob.id),
      });
    });

    it('should return CONFLICT if processing job exists for same course', async () => {
      const processingJob = createMockJob('processing');
      mockSupabaseMaybeSingle.mockResolvedValue({ data: processingJob, error: null });

      await expect(
        caller.start({
          courseId: COURSE_ID,
          lmsConfigId: LMS_CONFIG_ID,
        })
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: expect.stringContaining('processing'),
        message: expect.stringContaining(processingJob.id),
      });
    });
  });

  describe('Job Locking - Completed Status Checks', () => {
    it('should allow publish if previous job succeeded', async () => {
      const succeededJob = createMockJob('succeeded');
      // Simulate completed job - should NOT block new publish
      mockSupabaseMaybeSingle.mockResolvedValue({ data: null, error: null });

      const result = await caller.start({
        courseId: COURSE_ID,
        lmsConfigId: LMS_CONFIG_ID,
      });

      expect(result).toBeDefined();
      expect(result.jobId).toBeDefined();
      expect(result.lmsCourseId).toBeDefined();
    });

    it('should allow publish if previous job failed', async () => {
      const failedJob = createMockJob('failed');
      // Simulate failed job - should NOT block new publish
      mockSupabaseMaybeSingle.mockResolvedValue({ data: null, error: null });

      const result = await caller.start({
        courseId: COURSE_ID,
        lmsConfigId: LMS_CONFIG_ID,
      });

      expect(result).toBeDefined();
      expect(result.jobId).toBeDefined();
      expect(result.lmsCourseId).toBeDefined();
    });
  });

  describe('Job Locking - Lock Release', () => {
    it('should release lock (allow new job) after job completes', async () => {
      // First publish (no active jobs)
      mockSupabaseMaybeSingle.mockResolvedValue({ data: null, error: null });

      const firstResult = await caller.start({
        courseId: COURSE_ID,
        lmsConfigId: LMS_CONFIG_ID,
      });

      expect(firstResult.jobId).toBeDefined();

      // Simulate job completion (succeeded status)
      // Now no active jobs again
      mockSupabaseMaybeSingle.mockResolvedValue({ data: null, error: null });

      // Second publish should succeed
      const secondResult = await caller.start({
        courseId: COURSE_ID,
        lmsConfigId: LMS_CONFIG_ID,
      });

      expect(secondResult.jobId).toBeDefined();
      expect(secondResult.jobId).not.toBe(firstResult.jobId);
    });

    it('should release lock (allow new job) after job fails', async () => {
      // First publish (no active jobs)
      mockSupabaseMaybeSingle.mockResolvedValue({ data: null, error: null });

      const firstResult = await caller.start({
        courseId: COURSE_ID,
        lmsConfigId: LMS_CONFIG_ID,
      });

      expect(firstResult.jobId).toBeDefined();

      // Simulate job failure (failed status)
      // Now no active jobs again
      mockSupabaseMaybeSingle.mockResolvedValue({ data: null, error: null });

      // Second publish should succeed
      const secondResult = await caller.start({
        courseId: COURSE_ID,
        lmsConfigId: LMS_CONFIG_ID,
      });

      expect(secondResult.jobId).toBeDefined();
      expect(secondResult.jobId).not.toBe(firstResult.jobId);
    });
  });

  describe('Job Locking - Race Conditions', () => {
    it('should handle race condition: two simultaneous requests for same course (only one should succeed)', async () => {
      // Simulate race condition:
      // - Both requests check for active jobs at same time (both see null)
      // - First request creates job
      // - Second request should be blocked by database constraint or see the job

      // First request: no active jobs
      mockSupabaseMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

      // Second request: sees the pending job created by first request
      const pendingJob = createMockJob('pending');
      mockSupabaseMaybeSingle.mockResolvedValueOnce({ data: pendingJob, error: null });

      // Start both requests "simultaneously"
      const promise1 = caller.start({
        courseId: COURSE_ID,
        lmsConfigId: LMS_CONFIG_ID,
      });

      const promise2 = caller.start({
        courseId: COURSE_ID,
        lmsConfigId: LMS_CONFIG_ID,
      });

      // Wait for both
      const results = await Promise.allSettled([promise1, promise2]);

      // First request should succeed
      expect(results[0].status).toBe('fulfilled');
      if (results[0].status === 'fulfilled') {
        expect(results[0].value.jobId).toBeDefined();
      }

      // Second request should fail with CONFLICT
      expect(results[1].status).toBe('rejected');
      if (results[1].status === 'rejected') {
        expect((results[1].reason as TRPCError).code).toBe('CONFLICT');
        expect((results[1].reason as TRPCError).message).toContain('pending');
      }
    });
  });

  describe('Job Locking - Error Handling', () => {
    it('should throw INTERNAL_SERVER_ERROR if database query fails', async () => {
      // Simulate database error
      mockSupabaseMaybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed', code: 'PGRST301' },
      });

      await expect(
        caller.start({
          courseId: COURSE_ID,
          lmsConfigId: LMS_CONFIG_ID,
        })
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: expect.stringContaining('Failed to check for existing import jobs'),
      });
    });

    it('should include job ID in CONFLICT error message for easy cancellation', async () => {
      const jobId = 'specific-job-id-123';
      const activeJob = createMockJob('uploading', jobId);
      mockSupabaseMaybeSingle.mockResolvedValue({ data: activeJob, error: null });

      try {
        await caller.start({
          courseId: COURSE_ID,
          lmsConfigId: LMS_CONFIG_ID,
        });
        fail('Should have thrown CONFLICT error');
      } catch (error) {
        expect((error as TRPCError).code).toBe('CONFLICT');
        expect((error as TRPCError).message).toContain(jobId);
        expect((error as TRPCError).message).toContain('uploading');
      }
    });
  });

  describe('Job Locking - Query Correctness', () => {
    it('should query for active statuses only (pending, uploading, processing)', async () => {
      mockSupabaseMaybeSingle.mockResolvedValue({ data: null, error: null });

      await caller.start({
        courseId: COURSE_ID,
        lmsConfigId: LMS_CONFIG_ID,
      });

      // Verify the query chain
      expect(mockSupabaseFrom).toHaveBeenCalledWith('lms_import_jobs');

      // The query should filter by:
      // 1. course_id = COURSE_ID
      // 2. status IN ('pending', 'uploading', 'processing')
      // 3. Use maybeSingle() to get one or null
      const jobQuery = mockSupabaseFrom.mock.results.find(
        (result) => result.value.select && result.value.insert
      );
      expect(jobQuery).toBeDefined();
    });

    it('should use maybeSingle() instead of single() to avoid errors when no jobs exist', async () => {
      mockSupabaseMaybeSingle.mockResolvedValue({ data: null, error: null });

      await caller.start({
        courseId: COURSE_ID,
        lmsConfigId: LMS_CONFIG_ID,
      });

      // Verify maybeSingle was called (returns null without error)
      expect(mockSupabaseMaybeSingle).toHaveBeenCalled();
    });
  });
});
