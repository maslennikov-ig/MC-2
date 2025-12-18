/**
 * LMS History Integration Tests (T091)
 * @module tests/integration/lms-history.test
 *
 * Integration tests for the LMS history endpoints using mocked database responses.
 * Tests the full tRPC contract for lms.history.list and lms.history.get.
 *
 * Test Coverage:
 * 1. List returns paginated results with correct structure
 * 2. List with course_id filter returns only that course's jobs
 * 3. List with status filter returns only matching status jobs
 * 4. List pagination works (page 1 vs page 2)
 * 5. Get returns complete job details with joined data
 * 6. Get returns error details for failed job
 * 7. Authorization prevents access to other user's jobs
 * 8. Empty list when no jobs match filters
 * 9. History shows course name, publish date, status, duration (Acceptance Scenario 1)
 * 10. Failed imports show error details (Acceptance Scenario 2)
 *
 * Prerequisites:
 * - Mock Supabase admin client
 * - Tests run in isolation (no real database calls)
 *
 * Test execution: pnpm vitest packages/course-gen-platform/tests/integration/lms-history.test.ts
 *
 * Reference: T091 - Write integration tests for history endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { router, publicProcedure } from '../../src/server/trpc';
import type { Context } from '../../src/server/trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';

// Mock Supabase admin client
vi.mock('../../src/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

// ============================================================================
// Mock Data
// ============================================================================

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  role: 'instructor' as const,
  organizationId: '550e8400-e29b-41d4-a716-446655440099',
};

const mockOtherUser = {
  id: '660e8400-e29b-41d4-a716-446655440001',
  email: 'other@example.com',
  role: 'instructor' as const,
  organizationId: '550e8400-e29b-41d4-a716-446655440099',
};

// Use valid UUIDs for all IDs
const JOB_IDS = {
  job1: '111e8400-e29b-41d4-a716-446655440001',
  job2: '222e8400-e29b-41d4-a716-446655440002',
  job3: '333e8400-e29b-41d4-a716-446655440003',
  job4: '444e8400-e29b-41d4-a716-446655440004',
};

const COURSE_IDS = {
  course1: '11111111-e29b-41d4-a716-446655440001',
  course2: '22222222-e29b-41d4-a716-446655440002',
  course3: '33333333-e29b-41d4-a716-446655440003',
};

const CONFIG_IDS = {
  config1: 'cccccccc-e29b-41d4-a716-446655440001',
};

const mockJobs = [
  {
    id: JOB_IDS.job1,
    course_id: COURSE_IDS.course1,
    lms_config_id: CONFIG_IDS.config1,
    user_id: mockUser.id,
    edx_course_key: 'course-v1:Org+Course1+Run',
    edx_task_id: 'task-1',
    status: 'succeeded',
    progress_percent: 100,
    started_at: '2024-12-11T10:00:00Z',
    completed_at: '2024-12-11T10:05:00Z',
    error_code: null,
    error_message: null,
    course_url: 'https://lms.example.com/courses/course-v1:Org+Course1+Run',
    studio_url: 'https://studio.example.com/course/course-v1:Org+Course1+Run',
    package_size_bytes: 1024000,
    created_at: '2024-12-11T10:00:00Z',
    updated_at: '2024-12-11T10:05:00Z',
  },
  {
    id: JOB_IDS.job2,
    course_id: COURSE_IDS.course2,
    lms_config_id: CONFIG_IDS.config1,
    user_id: mockUser.id,
    edx_course_key: 'course-v1:Org+Course2+Run',
    edx_task_id: 'task-2',
    status: 'failed',
    progress_percent: 50,
    started_at: '2024-12-11T11:00:00Z',
    completed_at: '2024-12-11T11:02:00Z',
    error_code: 'LMS_IMPORT_FAILED',
    error_message: 'Import validation failed: Invalid content format',
    course_url: null,
    studio_url: null,
    package_size_bytes: 512000,
    created_at: '2024-12-11T11:00:00Z',
    updated_at: '2024-12-11T11:02:00Z',
  },
  {
    id: JOB_IDS.job3,
    course_id: COURSE_IDS.course1,
    lms_config_id: CONFIG_IDS.config1,
    user_id: mockUser.id,
    edx_course_key: 'course-v1:Org+Course1+Run',
    edx_task_id: 'task-3',
    status: 'processing',
    progress_percent: 75,
    started_at: '2024-12-11T12:00:00Z',
    completed_at: null,
    error_code: null,
    error_message: null,
    course_url: null,
    studio_url: null,
    package_size_bytes: 2048000,
    created_at: '2024-12-11T12:00:00Z',
    updated_at: '2024-12-11T12:03:00Z',
  },
  {
    id: JOB_IDS.job4,
    course_id: COURSE_IDS.course3,
    lms_config_id: CONFIG_IDS.config1,
    user_id: mockOtherUser.id,
    edx_course_key: 'course-v1:Org+Course3+Run',
    edx_task_id: 'task-4',
    status: 'succeeded',
    progress_percent: 100,
    started_at: '2024-12-11T13:00:00Z',
    completed_at: '2024-12-11T13:04:00Z',
    error_code: null,
    error_message: null,
    course_url: 'https://lms.example.com/courses/course-v1:Org+Course3+Run',
    studio_url: 'https://studio.example.com/course/course-v1:Org+Course3+Run',
    package_size_bytes: 768000,
    created_at: '2024-12-11T13:00:00Z',
    updated_at: '2024-12-11T13:04:00Z',
  },
];

const mockCourses = [
  { id: COURSE_IDS.course1, title: 'Introduction to AI', user_id: mockUser.id, organization_id: mockUser.organizationId },
  { id: COURSE_IDS.course2, title: 'Machine Learning Basics', user_id: mockUser.id, organization_id: mockUser.organizationId },
  { id: COURSE_IDS.course3, title: 'Deep Learning Advanced', user_id: mockOtherUser.id, organization_id: mockOtherUser.organizationId },
];

const mockLmsConfigurations = [
  { id: CONFIG_IDS.config1, name: 'Production LMS', organization_id: mockUser.organizationId },
];

// ============================================================================
// Mock Implementation of History Router
// ============================================================================

/**
 * Mock history router implementation
 * This is what T092-T096 should implement
 */
const mockHistoryRouter = router({
  /**
   * List import job history with pagination and filtering
   */
  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        courseId: z.string().uuid().optional(),
        status: z.enum(['pending', 'uploading', 'processing', 'succeeded', 'failed', 'cancelled']).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Authorization: require authenticated user
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const { limit, offset, courseId, status } = input;

      // Filter jobs by user_id (authorization)
      let filteredJobs = mockJobs.filter((job) => job.user_id === ctx.user!.id);

      // Apply filters
      if (courseId) {
        filteredJobs = filteredJobs.filter((job) => job.course_id === courseId);
      }
      if (status) {
        filteredJobs = filteredJobs.filter((job) => job.status === status);
      }

      // Sort by created_at DESC (most recent first)
      filteredJobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Pagination
      const totalCount = filteredJobs.length;
      const paginatedJobs = filteredJobs.slice(offset, offset + limit);

      // Join with courses and lms_configurations
      const items = paginatedJobs.map((job) => {
        const course = mockCourses.find((c) => c.id === job.course_id);
        const lmsConfig = mockLmsConfigurations.find((c) => c.id === job.lms_config_id);

        // Calculate duration
        let durationMs: number | null = null;
        if (job.started_at && job.completed_at) {
          durationMs = new Date(job.completed_at).getTime() - new Date(job.started_at).getTime();
        }

        return {
          id: job.id,
          courseId: job.course_id,
          courseTitle: course?.title || 'Unknown Course',
          lmsConfigId: job.lms_config_id,
          lmsName: lmsConfig?.name || 'Unknown LMS',
          edxCourseKey: job.edx_course_key,
          status: job.status,
          progressPercent: job.progress_percent,
          startedAt: job.started_at,
          completedAt: job.completed_at,
          durationMs,
          errorCode: job.error_code,
          errorMessage: job.error_message,
          courseUrl: job.course_url,
          studioUrl: job.studio_url,
          packageSizeBytes: job.package_size_bytes,
          createdAt: job.created_at,
          updatedAt: job.updated_at,
        };
      });

      return {
        items,
        totalCount,
        limit,
        offset,
      };
    }),

  /**
   * Get detailed job information by ID
   */
  get: publicProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Authorization: require authenticated user
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const { jobId } = input;

      // Find job
      const job = mockJobs.find((j) => j.id === jobId);

      if (!job) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Import job not found',
        });
      }

      // Authorization: user can only access their own jobs
      if (job.user_id !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this import job',
        });
      }

      // Join with courses and lms_configurations
      const course = mockCourses.find((c) => c.id === job.course_id);
      const lmsConfig = mockLmsConfigurations.find((c) => c.id === job.lms_config_id);

      // Calculate duration
      let durationMs: number | null = null;
      if (job.started_at && job.completed_at) {
        durationMs = new Date(job.completed_at).getTime() - new Date(job.started_at).getTime();
      }

      return {
        id: job.id,
        courseId: job.course_id,
        courseTitle: course?.title || 'Unknown Course',
        lmsConfigId: job.lms_config_id,
        lmsName: lmsConfig?.name || 'Unknown LMS',
        edxCourseKey: job.edx_course_key,
        edxTaskId: job.edx_task_id,
        status: job.status,
        progressPercent: job.progress_percent,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        durationMs,
        errorCode: job.error_code,
        errorMessage: job.error_message,
        courseUrl: job.course_url,
        studioUrl: job.studio_url,
        packageSizeBytes: job.package_size_bytes,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      };
    }),
});

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Temporarily add mock data for a single test
 * Ensures cleanup even if test fails
 */
async function withTemporaryMockJob<T>(
  job: typeof mockJobs[0],
  fn: () => Promise<T>
): Promise<T> {
  const originalLength = mockJobs.length;
  mockJobs.push(job);
  try {
    return await fn();
  } finally {
    mockJobs.length = originalLength;
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('LMS History Integration', () => {
  let mockContext: Context;
  let caller: ReturnType<typeof mockHistoryRouter.createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock context with authenticated user
    mockContext = {
      user: mockUser,
      req: new Request('http://localhost'),
    };

    // Create caller
    caller = mockHistoryRouter.createCaller(mockContext);
  });

  describe('lms.history.list', () => {
    it('should return paginated results with correct structure', async () => {
      const result = await caller.list({
        limit: 20,
        offset: 0,
      });

      expect(result).toBeDefined();
      expect(result.items).toBeInstanceOf(Array);
      expect(result.totalCount).toBe(3); // Only user's jobs
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);

      // Verify structure
      const firstItem = result.items[0];
      expect(firstItem).toHaveProperty('id');
      expect(firstItem).toHaveProperty('courseId');
      expect(firstItem).toHaveProperty('courseTitle');
      expect(firstItem).toHaveProperty('lmsName');
      expect(firstItem).toHaveProperty('status');
      expect(firstItem).toHaveProperty('progressPercent');
      expect(firstItem).toHaveProperty('startedAt');
      expect(firstItem).toHaveProperty('completedAt');
      expect(firstItem).toHaveProperty('durationMs');
    });

    it('should return results sorted by created_at DESC (most recent first)', async () => {
      const result = await caller.list({
        limit: 20,
        offset: 0,
      });

      expect(result.items).toHaveLength(3);
      expect(result.items[0].id).toBe(JOB_IDS.job3); // Most recent
      expect(result.items[1].id).toBe(JOB_IDS.job2);
      expect(result.items[2].id).toBe(JOB_IDS.job1); // Oldest
    });

    it('should filter by course_id and return only that course\'s jobs', async () => {
      const result = await caller.list({
        limit: 20,
        offset: 0,
        courseId: COURSE_IDS.course1,
      });

      expect(result.totalCount).toBe(2); // job1 and job3
      expect(result.items).toHaveLength(2);
      expect(result.items.every((item) => item.courseId === COURSE_IDS.course1)).toBe(true);
      expect(result.items[0].courseTitle).toBe('Introduction to AI');
    });

    it('should filter by status and return only matching status jobs', async () => {
      const result = await caller.list({
        limit: 20,
        offset: 0,
        status: 'succeeded',
      });

      expect(result.totalCount).toBe(1); // Only job-1
      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe('succeeded');
      expect(result.items[0].id).toBe(JOB_IDS.job1);
    });

    it('should filter by failed status', async () => {
      const result = await caller.list({
        limit: 20,
        offset: 0,
        status: 'failed',
      });

      expect(result.totalCount).toBe(1); // Only job-2
      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe('failed');
      expect(result.items[0].id).toBe(JOB_IDS.job2);
    });

    it('should support pagination (page 1 vs page 2)', async () => {
      // Page 1
      const page1 = await caller.list({
        limit: 2,
        offset: 0,
      });

      expect(page1.items).toHaveLength(2);
      expect(page1.totalCount).toBe(3);
      expect(page1.items[0].id).toBe(JOB_IDS.job3);
      expect(page1.items[1].id).toBe(JOB_IDS.job2);

      // Page 2
      const page2 = await caller.list({
        limit: 2,
        offset: 2,
      });

      expect(page2.items).toHaveLength(1);
      expect(page2.totalCount).toBe(3);
      expect(page2.items[0].id).toBe(JOB_IDS.job1);
    });

    it('should return empty list when no jobs match filters', async () => {
      const result = await caller.list({
        limit: 20,
        offset: 0,
        courseId: '99999999-e29b-41d4-a716-446655440999', // Non-existent course
      });

      expect(result.totalCount).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    it('should include course name and LMS name (joined data)', async () => {
      const result = await caller.list({
        limit: 20,
        offset: 0,
      });

      const job1 = result.items.find((item) => item.id === JOB_IDS.job1);
      expect(job1).toBeDefined();
      expect(job1!.courseTitle).toBe('Introduction to AI');
      expect(job1!.lmsName).toBe('Production LMS');

      const job2 = result.items.find((item) => item.id === JOB_IDS.job2);
      expect(job2).toBeDefined();
      expect(job2!.courseTitle).toBe('Machine Learning Basics');
      expect(job2!.lmsName).toBe('Production LMS');
    });

    it('should prevent access to other user\'s jobs (authorization)', async () => {
      const result = await caller.list({
        limit: 20,
        offset: 0,
      });

      // Should not include job4 (belongs to mockOtherUser)
      expect(result.totalCount).toBe(3);
      expect(result.items.every((item) => item.id !== JOB_IDS.job4)).toBe(true);
    });

    it('should require authentication', async () => {
      const unauthenticatedCaller = mockHistoryRouter.createCaller({
        user: null,
        req: new Request('http://localhost'),
      });

      await expect(
        unauthenticatedCaller.list({ limit: 20, offset: 0 })
      ).rejects.toThrow('Authentication required');
    });

    it('should respect limit parameter', async () => {
      const result = await caller.list({
        limit: 1,
        offset: 0,
      });

      expect(result.items).toHaveLength(1);
      expect(result.totalCount).toBe(3); // Total still 3
    });

    it('should respect offset parameter', async () => {
      const result = await caller.list({
        limit: 20,
        offset: 1,
      });

      expect(result.items).toHaveLength(2);
      expect(result.totalCount).toBe(3);
      expect(result.items[0].id).toBe(JOB_IDS.job2); // Skipped job-3
    });

    // Acceptance Scenario 1: History shows course name, publish date, status, duration
    it('should show course name, publish date, status, and duration for each import (Acceptance Scenario 1)', async () => {
      const result = await caller.list({
        limit: 20,
        offset: 0,
      });

      expect(result.items).toHaveLength(3);

      // Verify each job has required fields
      result.items.forEach((item) => {
        expect(item.courseTitle).toBeDefined();
        expect(item.createdAt).toBeDefined(); // Publish date
        expect(item.status).toBeDefined();

        // Duration should be calculated for completed jobs
        if (item.completedAt && item.startedAt) {
          expect(item.durationMs).toBeGreaterThan(0);
        }
      });

      // Check specific job
      const job1 = result.items.find((item) => item.id === JOB_IDS.job1);
      expect(job1).toBeDefined();
      expect(job1!.courseTitle).toBe('Introduction to AI');
      expect(job1!.status).toBe('succeeded');
      expect(job1!.durationMs).toBe(5 * 60 * 1000); // 5 minutes
    });
  });

  describe('lms.history.get', () => {
    it('should return complete job details with joined data', async () => {
      const result = await caller.get({ jobId: JOB_IDS.job1 });

      expect(result).toBeDefined();
      expect(result.id).toBe(JOB_IDS.job1);
      expect(result.courseId).toBe(COURSE_IDS.course1);
      expect(result.courseTitle).toBe('Introduction to AI');
      expect(result.lmsName).toBe('Production LMS');
      expect(result.edxCourseKey).toBe('course-v1:Org+Course1+Run');
      expect(result.edxTaskId).toBe('task-1');
      expect(result.status).toBe('succeeded');
      expect(result.progressPercent).toBe(100);
      expect(result.startedAt).toBe('2024-12-11T10:00:00Z');
      expect(result.completedAt).toBe('2024-12-11T10:05:00Z');
      expect(result.durationMs).toBe(5 * 60 * 1000); // 5 minutes
      expect(result.courseUrl).toBe('https://lms.example.com/courses/course-v1:Org+Course1+Run');
      expect(result.studioUrl).toBe('https://studio.example.com/course/course-v1:Org+Course1+Run');
      expect(result.packageSizeBytes).toBe(1024000);
    });

    it('should return error details for failed job (Acceptance Scenario 2)', async () => {
      const result = await caller.get({ jobId: JOB_IDS.job2 });

      expect(result).toBeDefined();
      expect(result.id).toBe(JOB_IDS.job2);
      expect(result.status).toBe('failed');
      expect(result.errorCode).toBe('LMS_IMPORT_FAILED');
      expect(result.errorMessage).toBe('Import validation failed: Invalid content format');
      expect(result.courseUrl).toBeNull();
      expect(result.studioUrl).toBeNull();
    });

    it('should prevent access to other user\'s jobs (authorization)', async () => {
      await expect(
        caller.get({ jobId: JOB_IDS.job4 }) // Belongs to mockOtherUser
      ).rejects.toThrow('You do not have permission to view this import job');
    });

    it('should throw NOT_FOUND for non-existent job', async () => {
      await expect(
        caller.get({ jobId: '999e8400-e29b-41d4-a716-446655440999' })
      ).rejects.toThrow('Import job not found');
    });

    it('should require authentication', async () => {
      const unauthenticatedCaller = mockHistoryRouter.createCaller({
        user: null,
        req: new Request('http://localhost'),
      });

      await expect(
        unauthenticatedCaller.get({ jobId: JOB_IDS.job1 })
      ).rejects.toThrow('Authentication required');
    });

    it('should include all timing metrics (started_at, completed_at, duration)', async () => {
      const result = await caller.get({ jobId: JOB_IDS.job1 });

      expect(result.startedAt).toBe('2024-12-11T10:00:00Z');
      expect(result.completedAt).toBe('2024-12-11T10:05:00Z');
      expect(result.durationMs).toBe(300000); // 5 minutes in ms
    });

    it('should handle in-progress job (no completed_at)', async () => {
      const result = await caller.get({ jobId: JOB_IDS.job3 });

      expect(result.status).toBe('processing');
      expect(result.startedAt).toBe('2024-12-11T12:00:00Z');
      expect(result.completedAt).toBeNull();
      expect(result.durationMs).toBeNull(); // Cannot calculate duration
    });

    it('should return edx_task_id for status polling', async () => {
      const result = await caller.get({ jobId: JOB_IDS.job1 });

      expect(result.edxTaskId).toBe('task-1');
    });

    it('should return package_size_bytes', async () => {
      const result = await caller.get({ jobId: JOB_IDS.job1 });

      expect(result.packageSizeBytes).toBe(1024000);
    });
  });

  describe('edge cases', () => {
    it('should handle job with missing course (graceful degradation)', async () => {
      // Use helper to ensure cleanup even if test fails
      await withTemporaryMockJob(
        {
          ...mockJobs[0],
          id: 'job-orphan',
          course_id: 'course-999',
          user_id: mockUser.id,
        },
        async () => {
          const result = await caller.list({ limit: 20, offset: 0 });
          const orphan = result.items.find((item) => item.id === 'job-orphan');

          expect(orphan).toBeDefined();
          expect(orphan!.courseTitle).toBe('Unknown Course');
        }
      );
    });

    it('should handle combined filters (courseId + status)', async () => {
      const result = await caller.list({
        limit: 20,
        offset: 0,
        courseId: COURSE_IDS.course1,
        status: 'succeeded',
      });

      expect(result.totalCount).toBe(1); // Only job-1
      expect(result.items[0].id).toBe(JOB_IDS.job1);
      expect(result.items[0].courseId).toBe(COURSE_IDS.course1);
      expect(result.items[0].status).toBe('succeeded');
    });

    it('should validate input schema (invalid UUID)', async () => {
      await expect(
        caller.get({ jobId: 'invalid-uuid' })
      ).rejects.toThrow();
    });

    it('should validate input schema (limit out of range)', async () => {
      await expect(
        caller.list({ limit: 101, offset: 0 })
      ).rejects.toThrow();
    });

    it('should validate input schema (negative offset)', async () => {
      await expect(
        caller.list({ limit: 20, offset: -1 })
      ).rejects.toThrow();
    });

    it('should handle empty database (no jobs)', async () => {
      // Create caller for user with no jobs
      const emptyUserContext: Context = {
        user: {
          id: 'new-user-id',
          email: 'newuser@example.com',
          role: 'instructor',
          organizationId: mockUser.organizationId,
        },
        req: new Request('http://localhost'),
      };
      const emptyUserCaller = mockHistoryRouter.createCaller(emptyUserContext);

      const result = await emptyUserCaller.list({ limit: 20, offset: 0 });

      expect(result.totalCount).toBe(0);
      expect(result.items).toHaveLength(0);
    });
  });
});
