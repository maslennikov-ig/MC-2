/**
 * Integration Tests: Auto-Approval Service
 *
 * Tests for automatic stage transitions when generation_mode = 'automatic'.
 *
 * Test Coverage:
 * 1. Semi-automatic mode: Should set status to stage_X_awaiting_approval (no auto-approve)
 * 2. Automatic mode: Should auto-approve and transition to next stage
 * 3. Job queue failure handling: Should rollback status on queue failure
 * 4. Missing course handling: Should throw error for non-existent course
 * 5. Auto-approval for multiple stages (stage 2, 3, 4)
 *
 * Related Issue: mc2-ppt (Beads Issue #12)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleStageCompletion } from '../../../src/shared/auto-approval/index';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Mocks Setup
// ============================================================================

// Mock Supabase Admin
vi.mock('../../../src/shared/supabase/admin');

// Mock Queue
vi.mock('../../../src/orchestrator/queue');

// Mock Logger
vi.mock('../../../src/shared/logger/index.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import mocked modules after mocking
import { getSupabaseAdmin } from '../../../src/shared/supabase/admin';
import { addJob } from '../../../src/orchestrator/queue';

// ============================================================================
// Test Fixtures
// ============================================================================

const MOCK_COURSE_SEMI_AUTOMATIC = {
  generation_mode: 'semi_automatic',
  user_id: 'user_123',
  organization_id: 'org_123',
  title: 'Test Course',
  settings: {},
  language: 'en',
  style: 'formal',
  target_audience: 'beginners',
  difficulty: 'intermediate',
  analysis_result: null,
  organization: { tier: 'free' },
};

const MOCK_COURSE_AUTOMATIC = {
  generation_mode: 'automatic',
  user_id: 'user_123',
  organization_id: 'org_123',
  title: 'Test Course',
  settings: {},
  language: 'en',
  style: 'formal',
  target_audience: 'beginners',
  difficulty: 'intermediate',
  analysis_result: null,
  organization: { tier: 'premium' },
};

// ============================================================================
// Tests
// ============================================================================

describe('handleStageCompletion', () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock Supabase client
    mockSupabase = {
      from: vi.fn(),
    };

    // Mock getSupabaseAdmin to return our mock client
    vi.mocked(getSupabaseAdmin).mockReturnValue(mockSupabase as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Semi-automatic mode', () => {
    it('should set awaiting_approval status and NOT auto-approve', async () => {
      // Setup: Mock Supabase to return semi_automatic course
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: MOCK_COURSE_SEMI_AUTOMATIC,
            error: null,
          }),
        }),
      });

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        update: mockUpdate,
      });

      // Act: Handle stage 2 completion
      const result = await handleStageCompletion('course_123', 2);

      // Assert: Should NOT auto-approve
      expect(result.autoApproved).toBe(false);
      expect(result.nextStage).toBeUndefined();

      // Assert: Should update status to awaiting_approval
      expect(mockUpdate).toHaveBeenCalledWith({
        generation_status: 'stage_2_awaiting_approval',
        updated_at: expect.any(String),
      });

      // Assert: Should NOT queue any jobs
      expect(addJob).not.toHaveBeenCalled();
    });

    it('should handle stage 3 awaiting_approval correctly', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: MOCK_COURSE_SEMI_AUTOMATIC,
            error: null,
          }),
        }),
      });

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        update: mockUpdate,
      });

      const result = await handleStageCompletion('course_123', 3);

      expect(result.autoApproved).toBe(false);
      expect(mockUpdate).toHaveBeenCalledWith({
        generation_status: 'stage_3_awaiting_approval',
        updated_at: expect.any(String),
      });
    });
  });

  describe('Automatic mode', () => {
    it('should auto-approve and queue next stage job (stage 2 → stage 3)', async () => {
      // Setup: Mock Supabase to return automatic course
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: MOCK_COURSE_AUTOMATIC,
            error: null,
          }),
        }),
      });

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        update: mockUpdate,
      });

      // Mock addJob to succeed
      vi.mocked(addJob).mockResolvedValue({ id: 'job_123' } as any);

      // Act: Handle stage 2 completion
      const result = await handleStageCompletion('course_123', 2);

      // Assert: Should auto-approve
      expect(result.autoApproved).toBe(true);
      expect(result.nextStage).toBe(3);

      // Assert: Should update status to next stage init
      expect(mockUpdate).toHaveBeenCalledWith({
        generation_status: 'stage_3_init',
        updated_at: expect.any(String),
      });

      // Assert: Should queue DOCUMENT_CLASSIFICATION job
      expect(addJob).toHaveBeenCalledWith(
        'document_classification',
        expect.objectContaining({
          organizationId: 'org_123',
          courseId: 'course_123',
          userId: 'user_123',
          jobType: 'document_classification',
        }),
        expect.objectContaining({
          priority: 10, // Premium tier
        })
      );
    });

    it('should auto-approve stage 3 → stage 4 (STRUCTURE_ANALYSIS)', async () => {
      // Setup: Mock course with processed documents
      const mockSelect = vi.fn();

      // First call: get course
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              ...MOCK_COURSE_AUTOMATIC,
              settings: {
                topic: 'Test Topic',
                answers: null,
                lesson_duration_minutes: 30,
              },
            },
            error: null,
          }),
        }),
      });

      // Second call: get documents for stage 4 job
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'doc_1',
                filename: 'test.pdf',
                processed_content: 'Test content',
                processing_method: 'docling',
                summary_metadata: {},
              },
            ],
            error: null,
          }),
        }),
      });

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        update: mockUpdate,
      });

      vi.mocked(addJob).mockResolvedValue({ id: 'job_123' } as any);

      const result = await handleStageCompletion('course_123', 3);

      expect(result.autoApproved).toBe(true);
      expect(result.nextStage).toBe(4);

      // Should queue STRUCTURE_ANALYSIS job with document summaries
      expect(addJob).toHaveBeenCalledWith(
        'structure_analysis',
        expect.objectContaining({
          jobType: 'structure_analysis',
          input: expect.objectContaining({
            topic: 'Test Topic',
            document_summaries: expect.arrayContaining([
              expect.objectContaining({
                document_id: 'doc_1',
                file_name: 'test.pdf',
              }),
            ]),
          }),
        }),
        expect.any(Object)
      );
    });

    it('should auto-approve stage 4 → stage 5 (STRUCTURE_GENERATION)', async () => {
      const mockCourseWithAnalysis = {
        ...MOCK_COURSE_AUTOMATIC,
        analysis_result: {
          course_title: 'Test Course',
          sections: [],
        },
        settings: {
          desired_lessons_count: 10,
          desired_modules_count: 3,
          lesson_duration_minutes: 30,
        },
      };

      const mockSelect = vi.fn();

      // First call: get course
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockCourseWithAnalysis,
            error: null,
          }),
        }),
      });

      // Second call: get vectorized files
      mockSelect.mockReturnValueOnce({
        eq: vi
          .fn()
          .mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'file_1',
                  filename: 'doc.pdf',
                  processed_content: 'Content',
                },
              ],
              error: null,
            }),
          }),
      });

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        update: mockUpdate,
      });

      vi.mocked(addJob).mockResolvedValue({ id: 'job_123' } as any);

      const result = await handleStageCompletion('course_123', 4);

      expect(result.autoApproved).toBe(true);
      expect(result.nextStage).toBe(5);

      // Should queue STRUCTURE_GENERATION job
      expect(addJob).toHaveBeenCalledWith(
        'structure_generation',
        expect.objectContaining({
          course_id: 'course_123',
          analysis_result: mockCourseWithAnalysis.analysis_result,
          vectorized_documents: true,
        }),
        expect.any(Object)
      );
    });

    it('should respect organization tier for job priority', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              ...MOCK_COURSE_AUTOMATIC,
              organization: { tier: 'standard' },
            },
            error: null,
          }),
        }),
      });

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        update: mockUpdate,
      });

      vi.mocked(addJob).mockResolvedValue({ id: 'job_123' } as any);

      await handleStageCompletion('course_123', 2);

      // Standard tier should have priority 5
      expect(addJob).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          priority: 5,
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should throw error for non-existent course', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Course not found' },
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });

      await expect(handleStageCompletion('invalid_course', 2)).rejects.toThrow(
        'Course not found: invalid_course'
      );
    });

    it('should rollback status on job queue failure', async () => {
      // Setup: Mock Supabase to return automatic course
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: MOCK_COURSE_AUTOMATIC,
            error: null,
          }),
        }),
      });

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        update: mockUpdate,
      });

      // Mock addJob to fail
      vi.mocked(addJob).mockRejectedValue(new Error('Queue connection failed'));

      // Act & Assert: Should throw error
      await expect(handleStageCompletion('course_123', 2)).rejects.toThrow(
        'Failed to queue stage 3: Queue connection failed'
      );

      // Assert: Should have attempted to update to stage_3_init
      expect(mockUpdate).toHaveBeenNthCalledWith(1, {
        generation_status: 'stage_3_init',
        updated_at: expect.any(String),
      });

      // Assert: Should have rolled back to stage_2_complete
      expect(mockUpdate).toHaveBeenNthCalledWith(2, {
        generation_status: 'stage_2_complete',
        updated_at: expect.any(String),
      });
    });

    it('should handle database error during status rollback gracefully', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: MOCK_COURSE_AUTOMATIC,
            error: null,
          }),
        }),
      });

      // First update succeeds (stage_3_init), second update fails (rollback)
      const mockUpdate = vi
        .fn()
        .mockReturnValueOnce({
          eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
        })
        .mockReturnValueOnce({
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' },
          }),
        });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        update: mockUpdate,
      });

      vi.mocked(addJob).mockRejectedValue(new Error('Queue failed'));

      // Should still throw the original queue error
      await expect(handleStageCompletion('course_123', 2)).rejects.toThrow(
        'Failed to queue stage 3'
      );
    });
  });

  describe('Unknown stage handling', () => {
    it('should handle unknown next stage gracefully (no job queued)', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: MOCK_COURSE_AUTOMATIC,
            error: null,
          }),
        }),
      });

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        update: mockUpdate,
      });

      // Stage 99 is unknown - should update status but not queue job
      const result = await handleStageCompletion('course_123', 99);

      expect(result.autoApproved).toBe(true);
      expect(result.nextStage).toBe(100);

      // Should update to next stage init
      expect(mockUpdate).toHaveBeenCalledWith({
        generation_status: 'stage_100_init',
        updated_at: expect.any(String),
      });

      // Should not queue any job (unknown stage)
      expect(addJob).not.toHaveBeenCalled();
    });
  });

  describe('Custom Supabase client', () => {
    it('should use provided Supabase client instead of getSupabaseAdmin', async () => {
      const customSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: MOCK_COURSE_SEMI_AUTOMATIC,
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
          }),
        }),
      };

      await handleStageCompletion(
        'course_123',
        2,
        customSupabase as unknown as SupabaseClient
      );

      // Should use custom client
      expect(customSupabase.from).toHaveBeenCalled();

      // Should NOT use mockSupabase (from getSupabaseAdmin)
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });
  });
});
