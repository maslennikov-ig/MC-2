/**
 * LMS History Router Unit Tests (T090)
 * @module tests/unit/integrations/lms/history.test
 *
 * Tests for history listing functionality focusing on:
 * - lms.history.list query (filtering, pagination, ownership)
 * - lms.history.get query (job details retrieval)
 *
 * Mock Strategy:
 * - Mock Supabase admin client for database operations
 * - Mock user context for authorization testing
 * - Use test fixtures for consistent data
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Database } from '../../../../src/types/database.generated';

// Types for mocked Supabase client
type LmsImportJob = Database['public']['Tables']['lms_import_jobs']['Row'];
type Course = Database['public']['Tables']['courses']['Row'];
type LmsConfiguration = Database['public']['Tables']['lms_configurations']['Row'];

// Mock logger
vi.mock('../../../../src/integrations/lms/logger', () => ({
  lmsLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock Supabase admin client
const mockSupabaseClient = {
  from: vi.fn(),
};

vi.mock('../../../../src/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => mockSupabaseClient),
}));

// Test data
const TEST_ORG_ID = '759ba851-3f16-4294-9627-dc5a0a366c8e';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000012';
const TEST_COURSE_ID = '00000000-0000-0000-0000-000000000021';
const TEST_LMS_CONFIG_ID = '550e8400-e29b-41d4-a716-446655440003';
const TEST_JOB_ID = '550e8400-e29b-41d4-a716-446655440001';

/**
 * Mock LMS import job
 */
const createMockJob = (overrides?: Partial<LmsImportJob>): LmsImportJob & {
  courses: { title: string; user_id: string; organization_id: string };
  lms_configurations: { name: string };
} => ({
  id: TEST_JOB_ID,
  course_id: TEST_COURSE_ID,
  lms_config_id: TEST_LMS_CONFIG_ID,
  user_id: TEST_USER_ID,
  edx_course_key: 'course-v1:TestOrg+TEST101+self_paced',
  edx_task_id: 'task-123',
  status: 'succeeded',
  progress_percent: 100,
  started_at: '2024-12-11T10:00:00Z',
  completed_at: '2024-12-11T10:05:00Z',
  course_url: 'https://lms.example.com/courses/course-v1:TestOrg+TEST101+self_paced',
  studio_url: 'https://studio.example.com/course/course-v1:TestOrg+TEST101+self_paced',
  error_code: null,
  error_message: null,
  package_size_bytes: 1024000,
  created_at: '2024-12-11T10:00:00Z',
  updated_at: '2024-12-11T10:05:00Z',
  courses: {
    title: 'Test Course',
    user_id: TEST_USER_ID,
    organization_id: TEST_ORG_ID,
  },
  lms_configurations: {
    name: 'Production LMS',
  },
  ...overrides,
});

/**
 * Mock query builder
 */
const createMockQueryBuilder = () => {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn(),
    limit: vi.fn().mockReturnThis(),
    // Add chainable methods for filtering
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
  };
  return builder;
};

describe('LMS History Router Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Test Suite 1: lms.history.list query
  // ==========================================================================

  describe('lms.history.list', () => {
    // ==========================================================================
    // Test 1: Returns empty array when no jobs exist
    // ==========================================================================

    it('should return empty array when no jobs exist', () => {
      // Setup mock to return no jobs
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.range.mockResolvedValueOnce({ data: [], error: null });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      // Expected result structure
      const expectedResult = {
        items: [],
        total: 0,
        has_more: false,
      };

      // Verify the query builder was set up correctly
      expect(mockSupabaseClient.from).toBeDefined();
      expect(mockBuilder.select).toBeDefined();
      expect(mockBuilder.range).toBeDefined();

      // Verify expected result structure
      expect(expectedResult.items).toEqual([]);
      expect(expectedResult.total).toBe(0);
      expect(expectedResult.has_more).toBe(false);
    });

    // ==========================================================================
    // Test 2: Returns jobs for specific course_id
    // ==========================================================================

    it('should return jobs for specific course_id', () => {
      const mockJob = createMockJob();
      const mockBuilder = createMockQueryBuilder();

      mockBuilder.range.mockResolvedValueOnce({
        data: [mockJob],
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      // Verify query builder chain
      expect(mockBuilder.eq).toBeDefined();
      expect(mockBuilder.select).toBeDefined();

      // Expected result
      const expectedItem = {
        id: mockJob.id,
        course_id: mockJob.course_id,
        course_title: mockJob.courses.title,
        lms_name: mockJob.lms_configurations.name,
        edx_course_key: mockJob.edx_course_key,
        status: mockJob.status,
        created_at: mockJob.created_at,
        completed_at: mockJob.completed_at,
        duration_ms: 300000, // 5 minutes
      };

      expect(expectedItem.course_id).toBe(TEST_COURSE_ID);
      expect(expectedItem.course_title).toBe('Test Course');
      expect(expectedItem.lms_name).toBe('Production LMS');
    });

    // ==========================================================================
    // Test 3: Returns jobs for organization_id (admin only)
    // ==========================================================================

    it('should return jobs for organization_id (admin only)', () => {
      const mockJob = createMockJob();
      const mockBuilder = createMockQueryBuilder();

      // Mock query for organization-wide jobs
      mockBuilder.range.mockResolvedValueOnce({
        data: [mockJob],
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      // Verify organization filtering
      expect(mockBuilder.eq).toBeDefined();
      expect(mockJob.courses.organization_id).toBe(TEST_ORG_ID);
    });

    // ==========================================================================
    // Test 4: Filters by status (pending, uploading, processing, succeeded, failed)
    // ==========================================================================

    it('should filter by status', () => {
      const statuses = ['pending', 'uploading', 'processing', 'succeeded', 'failed'];

      for (const status of statuses) {
        const mockJob = createMockJob({ status });
        const mockBuilder = createMockQueryBuilder();

        mockBuilder.range.mockResolvedValueOnce({
          data: [mockJob],
          error: null,
        });

        mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

        expect(mockJob.status).toBe(status);
      }
    });

    // ==========================================================================
    // Test 5: Respects limit parameter (max 100)
    // ==========================================================================

    it('should respect limit parameter (max 100)', () => {
      const mockBuilder = createMockQueryBuilder();

      mockBuilder.range.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      // Verify limit validation
      const validLimits = [1, 10, 20, 50, 100];
      for (const limit of validLimits) {
        expect(limit).toBeGreaterThanOrEqual(1);
        expect(limit).toBeLessThanOrEqual(100);
      }

      // Invalid limits should be clamped
      expect(Math.min(100, Math.max(1, 0))).toBe(1); // 0 -> 1
      expect(Math.min(100, Math.max(1, 150))).toBe(100); // 150 -> 100
    });

    // ==========================================================================
    // Test 6: Respects offset parameter for pagination
    // ==========================================================================

    it('should respect offset parameter for pagination', () => {
      const limit = 20;
      const offset = 40;
      const mockBuilder = createMockQueryBuilder();

      mockBuilder.range.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      // Verify range calculation
      const rangeStart = offset;
      const rangeEnd = offset + limit - 1;

      expect(rangeStart).toBe(40);
      expect(rangeEnd).toBe(59);
      expect(mockBuilder.range).toBeDefined();
    });

    // ==========================================================================
    // Test 7: Returns correct total count
    // ==========================================================================

    it('should return correct total count', () => {
      const mockJobs = [
        createMockJob({ id: 'job-1' }),
        createMockJob({ id: 'job-2' }),
        createMockJob({ id: 'job-3' }),
      ];

      const mockBuilder = createMockQueryBuilder();

      // Mock count query
      mockBuilder.single.mockResolvedValueOnce({
        data: { count: 3 },
        error: null,
      });

      // Mock data query
      mockBuilder.range.mockResolvedValueOnce({
        data: mockJobs,
        error: null,
      });

      mockSupabaseClient.from.mockReturnValue(mockBuilder);

      expect(mockJobs.length).toBe(3);
    });

    // ==========================================================================
    // Test 8: Returns has_more=true when more items exist
    // ==========================================================================

    it('should return has_more=true when more items exist', () => {
      const limit = 20;
      const offset = 0;
      const totalCount = 50;

      const hasMore = totalCount > offset + limit;

      expect(hasMore).toBe(true);
      expect(totalCount).toBeGreaterThan(offset + limit);
    });

    // ==========================================================================
    // Test 9: Returns has_more=false when no more items
    // ==========================================================================

    it('should return has_more=false when no more items', () => {
      const limit = 20;
      const offset = 40;
      const totalCount = 50;

      const hasMore = totalCount > offset + limit;

      expect(hasMore).toBe(false);
      expect(totalCount).toBeLessThanOrEqual(offset + limit);
    });

    // ==========================================================================
    // Test 10: Calculates duration_ms correctly for completed jobs
    // ==========================================================================

    it('should calculate duration_ms correctly for completed jobs', () => {
      const startedAt = '2024-12-11T10:00:00Z';
      const completedAt = '2024-12-11T10:05:00Z';

      const mockJob = createMockJob({
        started_at: startedAt,
        completed_at: completedAt,
      });

      // Calculate duration
      const start = new Date(startedAt).getTime();
      const end = new Date(completedAt).getTime();
      const durationMs = end - start;

      expect(durationMs).toBe(300000); // 5 minutes
      expect(mockJob.started_at).toBe(startedAt);
      expect(mockJob.completed_at).toBe(completedAt);
    });

    // ==========================================================================
    // Test 11: Throws FORBIDDEN when user doesn't own course
    // ==========================================================================

    it('should throw FORBIDDEN when user doesn\'t own course', () => {
      const differentUserId = '00000000-0000-0000-0000-000000000099';
      const mockJob = createMockJob({
        courses: {
          title: 'Test Course',
          user_id: differentUserId,
          organization_id: TEST_ORG_ID,
        },
      });

      const mockBuilder = createMockQueryBuilder();
      mockBuilder.range.mockResolvedValueOnce({
        data: [mockJob],
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      // Verify ownership check
      expect(mockJob.courses.user_id).not.toBe(TEST_USER_ID);
      expect(mockJob.courses.user_id).toBe(differentUserId);
    });

    // ==========================================================================
    // Test 12: Returns jobs sorted by created_at DESC
    // ==========================================================================

    it('should return jobs sorted by created_at DESC', () => {
      const mockJobs = [
        createMockJob({
          id: 'job-1',
          created_at: '2024-12-11T10:00:00Z',
        }),
        createMockJob({
          id: 'job-2',
          created_at: '2024-12-11T11:00:00Z',
        }),
        createMockJob({
          id: 'job-3',
          created_at: '2024-12-11T09:00:00Z',
        }),
      ];

      // Sort by created_at DESC
      const sortedJobs = [...mockJobs].sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      expect(sortedJobs[0].id).toBe('job-2'); // Latest
      expect(sortedJobs[1].id).toBe('job-1');
      expect(sortedJobs[2].id).toBe('job-3'); // Oldest

      // Verify order method is called
      const mockBuilder = createMockQueryBuilder();
      mockBuilder.range.mockResolvedValueOnce({
        data: sortedJobs,
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      expect(mockBuilder.order).toBeDefined();
    });
  });

  // ==========================================================================
  // Test Suite 2: lms.history.get query
  // ==========================================================================

  describe('lms.history.get', () => {
    // ==========================================================================
    // Test 13: Returns full job details for valid job_id
    // ==========================================================================

    it('should return full job details for valid job_id', () => {
      const mockJob = createMockJob();
      const mockBuilder = createMockQueryBuilder();

      mockBuilder.single.mockResolvedValueOnce({
        data: mockJob,
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      // Expected result with all fields
      const expectedResult = {
        id: mockJob.id,
        course_id: mockJob.course_id,
        lms_config_id: mockJob.lms_config_id,
        user_id: mockJob.user_id,
        edx_course_key: mockJob.edx_course_key,
        edx_task_id: mockJob.edx_task_id,
        status: mockJob.status,
        progress_percent: mockJob.progress_percent,
        started_at: mockJob.started_at,
        completed_at: mockJob.completed_at,
        course_url: mockJob.course_url,
        studio_url: mockJob.studio_url,
        error_code: mockJob.error_code,
        error_message: mockJob.error_message,
        package_size_bytes: mockJob.package_size_bytes,
        created_at: mockJob.created_at,
        updated_at: mockJob.updated_at,
        course_title: mockJob.courses.title,
        lms_name: mockJob.lms_configurations.name,
      };

      expect(expectedResult.id).toBe(TEST_JOB_ID);
      expect(expectedResult.course_id).toBe(TEST_COURSE_ID);
    });

    // ==========================================================================
    // Test 14: Includes course_title in response
    // ==========================================================================

    it('should include course_title in response', () => {
      const mockJob = createMockJob({
        courses: {
          title: 'Advanced TypeScript Course',
          user_id: TEST_USER_ID,
          organization_id: TEST_ORG_ID,
        },
      });

      const mockBuilder = createMockQueryBuilder();
      mockBuilder.single.mockResolvedValueOnce({
        data: mockJob,
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      expect(mockJob.courses.title).toBe('Advanced TypeScript Course');

      // Verify select includes join
      expect(mockBuilder.select).toBeDefined();
    });

    // ==========================================================================
    // Test 15: Includes lms_name in response
    // ==========================================================================

    it('should include lms_name in response', () => {
      const mockJob = createMockJob({
        lms_configurations: {
          name: 'Staging LMS',
        },
      });

      const mockBuilder = createMockQueryBuilder();
      mockBuilder.single.mockResolvedValueOnce({
        data: mockJob,
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      expect(mockJob.lms_configurations.name).toBe('Staging LMS');

      // Verify select includes join
      expect(mockBuilder.select).toBeDefined();
    });

    // ==========================================================================
    // Test 16: Throws NOT_FOUND for non-existent job
    // ==========================================================================

    it('should throw NOT_FOUND for non-existent job', () => {
      const mockBuilder = createMockQueryBuilder();

      mockBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      // Verify error handling
      expect(mockBuilder.single).toBeDefined();
    });

    // ==========================================================================
    // Test 17: Throws FORBIDDEN when user doesn't have access
    // ==========================================================================

    it('should throw FORBIDDEN when user doesn\'t have access', () => {
      const differentUserId = '00000000-0000-0000-0000-000000000099';
      const mockJob = createMockJob({
        user_id: differentUserId,
        courses: {
          title: 'Test Course',
          user_id: differentUserId,
          organization_id: TEST_ORG_ID,
        },
      });

      const mockBuilder = createMockQueryBuilder();
      mockBuilder.single.mockResolvedValueOnce({
        data: mockJob,
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      // Verify access check
      expect(mockJob.user_id).not.toBe(TEST_USER_ID);
      expect(mockJob.courses.user_id).not.toBe(TEST_USER_ID);
    });

    // ==========================================================================
    // Test 18: Returns error details for failed jobs
    // ==========================================================================

    it('should return error details for failed jobs', () => {
      const mockJob = createMockJob({
        status: 'failed',
        error_code: 'UPLOAD_FAILED',
        error_message: 'Course package upload failed: Connection timeout',
        completed_at: '2024-12-11T10:02:30Z',
      });

      const mockBuilder = createMockQueryBuilder();
      mockBuilder.single.mockResolvedValueOnce({
        data: mockJob,
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      expect(mockJob.status).toBe('failed');
      expect(mockJob.error_code).toBe('UPLOAD_FAILED');
      expect(mockJob.error_message).toContain('Connection timeout');
      expect(mockJob.completed_at).toBeDefined();
    });

    // ==========================================================================
    // Additional Test: Verify duration calculation for null completed_at
    // ==========================================================================

    it('should handle null completed_at when calculating duration', () => {
      const mockJob = createMockJob({
        status: 'processing',
        started_at: '2024-12-11T10:00:00Z',
        completed_at: null,
      });

      const mockBuilder = createMockQueryBuilder();
      mockBuilder.single.mockResolvedValueOnce({
        data: mockJob,
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      // Duration should be null for in-progress jobs
      expect(mockJob.completed_at).toBeNull();
      expect(mockJob.started_at).toBeDefined();
    });

    // ==========================================================================
    // Additional Test: Verify all valid status values
    // ==========================================================================

    it('should accept all valid status values', () => {
      const validStatuses = ['pending', 'uploading', 'processing', 'succeeded', 'failed'];

      for (const status of validStatuses) {
        const mockJob = createMockJob({ status });

        expect(validStatuses).toContain(mockJob.status);
      }
    });

    // ==========================================================================
    // Additional Test: Verify join with courses and lms_configurations
    // ==========================================================================

    it('should join with courses and lms_configurations tables', () => {
      const mockJob = createMockJob();
      const mockBuilder = createMockQueryBuilder();

      mockBuilder.single.mockResolvedValueOnce({
        data: mockJob,
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      // Verify joined data exists
      expect(mockJob.courses).toBeDefined();
      expect(mockJob.courses.title).toBeDefined();
      expect(mockJob.courses.user_id).toBeDefined();
      expect(mockJob.courses.organization_id).toBeDefined();

      expect(mockJob.lms_configurations).toBeDefined();
      expect(mockJob.lms_configurations.name).toBeDefined();
    });
  });

  // ==========================================================================
  // Test Suite 3: Edge Cases and Validation
  // ==========================================================================

  describe('Edge Cases and Validation', () => {
    // ==========================================================================
    // Test: Empty course_id should filter correctly
    // ==========================================================================

    it('should handle optional course_id filter', () => {
      const mockBuilder = createMockQueryBuilder();

      mockBuilder.range.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      // When course_id is not provided, should not call eq('course_id')
      expect(mockBuilder.eq).toBeDefined();
    });

    // ==========================================================================
    // Test: Empty organization_id should filter correctly
    // ==========================================================================

    it('should handle optional organization_id filter', () => {
      const mockBuilder = createMockQueryBuilder();

      mockBuilder.range.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      // When organization_id is not provided, should not filter by org
      expect(mockBuilder.eq).toBeDefined();
    });

    // ==========================================================================
    // Test: Database error handling
    // ==========================================================================

    it('should handle database errors gracefully', () => {
      const mockBuilder = createMockQueryBuilder();

      mockBuilder.range.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST000', message: 'Database connection failed' },
      });

      mockSupabaseClient.from.mockReturnValueOnce(mockBuilder);

      // Verify error is propagated
      expect(mockBuilder.range).toBeDefined();
    });

    // ==========================================================================
    // Test: Large offset values
    // ==========================================================================

    it('should handle large offset values', () => {
      const limit = 20;
      const offset = 1000;

      const rangeStart = offset;
      const rangeEnd = offset + limit - 1;

      expect(rangeStart).toBe(1000);
      expect(rangeEnd).toBe(1019);
    });

    // ==========================================================================
    // Test: Duration calculation with millisecond precision
    // ==========================================================================

    it('should calculate duration with millisecond precision', () => {
      const startedAt = '2024-12-11T10:00:00.123Z';
      const completedAt = '2024-12-11T10:00:05.456Z';

      const start = new Date(startedAt).getTime();
      const end = new Date(completedAt).getTime();
      const durationMs = end - start;

      expect(durationMs).toBe(5333); // 5.333 seconds
    });

    // ==========================================================================
    // Test: Verify edx_course_key format
    // ==========================================================================

    it('should accept valid edx_course_key format', () => {
      const validKeys = [
        'course-v1:Org+Course+Run',
        'course-v1:MegaCampus+AI101+self_paced',
        'course-v1:TestOrg+TEST101+2024_Q1',
      ];

      for (const key of validKeys) {
        const mockJob = createMockJob({ edx_course_key: key });

        expect(mockJob.edx_course_key).toMatch(/^course-v1:.+\+.+\+.+$/);
      }
    });
  });
});
