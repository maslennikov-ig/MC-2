/**
 * Unit tests for get-generation-status enrichment tRPC procedure
 *
 * These tests verify:
 * - Input validation (enrichmentId)
 * - Access control (authentication, enrichment access verification)
 * - Status mapping (status to progress percentage)
 * - Error message handling for failed enrichments
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { router } from '../../../src/server/trpc';
import type { Context } from '../../../src/server/trpc';

// ============================================================================
// MOCKS
// ============================================================================

// Mock nanoid for predictable request IDs
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test-request-id'),
}));

// Mock logger
vi.mock('@/shared/logger/index.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock Supabase admin
const mockSupabaseFrom = vi.fn();
const mockSupabaseSelect = vi.fn();
const mockSupabaseEq = vi.fn();
const mockSupabaseSingle = vi.fn();

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: mockSupabaseFrom.mockReturnValue({
      select: mockSupabaseSelect.mockReturnValue({
        eq: mockSupabaseEq.mockReturnValue({
          single: mockSupabaseSingle,
        }),
      }),
    }),
  })),
}));

// Mock access control helper - use hoisted mock
vi.mock('@/server/routers/enrichment/helpers', () => ({
  verifyEnrichmentAccess: vi.fn(),
}));

// Import the mocked function for test configuration
import { verifyEnrichmentAccess } from '../../../src/server/routers/enrichment/helpers';
const mockVerifyEnrichmentAccess = vi.mocked(verifyEnrichmentAccess);

// ============================================================================
// TEST SETUP
// ============================================================================

// Import procedure after mocks
import { getGenerationStatus } from '../../../src/server/routers/enrichment/procedures/get-generation-status';

// Create test router
const testRouter = router({
  getGenerationStatus,
});

// Mock context helpers
function createAuthenticatedContext(): Context {
  return {
    user: {
      id: 'user-123',
      email: 'test@example.com',
      role: 'instructor',
      organizationId: 'org-123',
    },
  };
}

function createUnauthenticatedContext(): Context {
  return {
    user: null,
  };
}

// Mock enrichment data
const mockEnrichment = {
  id: 'enrichment-123',
  lesson_id: 'lesson-123',
  course_id: 'course-123',
  enrichment_type: 'quiz',
  status: 'pending' as const,
  order_index: 1,
  asset_id: null,
  generation_attempt: 0,
  content: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// TESTS
// ============================================================================

describe('getGenerationStatus', () => {
  describe('Input Validation', () => {
    it('should reject invalid enrichmentId (not UUID)', async () => {
      const caller = testRouter.createCaller(createAuthenticatedContext());

      await expect(caller.getGenerationStatus({ enrichmentId: 'not-a-uuid' })).rejects.toThrow();
    });

    it('should accept valid UUID enrichmentId', async () => {
      mockVerifyEnrichmentAccess.mockResolvedValueOnce({
        ...mockEnrichment,
        status: 'completed',
      });

      const caller = testRouter.createCaller(createAuthenticatedContext());
      const result = await caller.getGenerationStatus({
        enrichmentId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('progress');
    });
  });

  describe('Access Control', () => {
    it('should throw UNAUTHORIZED if no session', async () => {
      const caller = testRouter.createCaller(createUnauthenticatedContext());

      await expect(
        caller.getGenerationStatus({
          enrichmentId: '550e8400-e29b-41d4-a716-446655440000',
        })
      ).rejects.toThrow(TRPCError);

      try {
        await caller.getGenerationStatus({
          enrichmentId: '550e8400-e29b-41d4-a716-446655440000',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        if (error instanceof TRPCError) {
          expect(error.code).toBe('UNAUTHORIZED');
        }
      }
    });

    it('should throw FORBIDDEN if user lacks access to enrichment', async () => {
      const forbiddenError = new TRPCError({
        code: 'FORBIDDEN',
        message: 'Access denied to enrichment',
      });
      mockVerifyEnrichmentAccess.mockRejectedValue(forbiddenError);

      const caller = testRouter.createCaller(createAuthenticatedContext());

      try {
        await caller.getGenerationStatus({
          enrichmentId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        if (error instanceof TRPCError) {
          expect(error.code).toBe('FORBIDDEN');
        }
      }
    });

    it('should succeed if user has access', async () => {
      mockVerifyEnrichmentAccess.mockResolvedValueOnce({
        ...mockEnrichment,
        status: 'completed',
      });

      const caller = testRouter.createCaller(createAuthenticatedContext());
      const result = await caller.getGenerationStatus({
        enrichmentId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result.status).toBe('completed');
    });
  });

  describe('Status Mapping', () => {
    it.each([
      ['pending', 0],
      ['draft_generating', 25],
      ['draft_ready', 50],
      ['generating', 75],
      ['completed', 100],
      ['failed', 0],
      ['cancelled', 0],
    ])('should return progress %d for status "%s"', async (status, expectedProgress) => {
      mockVerifyEnrichmentAccess.mockResolvedValueOnce({
        ...mockEnrichment,
        status,
      });

      // Mock error message fetch for failed status
      if (status === 'failed') {
        mockSupabaseSingle.mockResolvedValueOnce({
          data: { error_message: 'Generation failed' },
          error: null,
        });
      }

      const caller = testRouter.createCaller(createAuthenticatedContext());
      const result = await caller.getGenerationStatus({
        enrichmentId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result.status).toBe(status);
      expect(result.progress).toBe(expectedProgress);
    });
  });

  describe('Error Message Handling', () => {
    it('should return error message for failed status', async () => {
      mockVerifyEnrichmentAccess.mockResolvedValueOnce({
        ...mockEnrichment,
        status: 'failed',
      });

      mockSupabaseSingle.mockResolvedValueOnce({
        data: { error_message: 'LLM API rate limited' },
        error: null,
      });

      const caller = testRouter.createCaller(createAuthenticatedContext());
      const result = await caller.getGenerationStatus({
        enrichmentId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result.status).toBe('failed');
      expect(result.error).toBe('LLM API rate limited');
    });

    it('should return default error message if none in database', async () => {
      mockVerifyEnrichmentAccess.mockResolvedValueOnce({
        ...mockEnrichment,
        status: 'failed',
      });

      mockSupabaseSingle.mockResolvedValueOnce({
        data: { error_message: null },
        error: null,
      });

      const caller = testRouter.createCaller(createAuthenticatedContext());
      const result = await caller.getGenerationStatus({
        enrichmentId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result.error).toBe('Generation failed');
    });
  });

  describe('Time Estimation', () => {
    it('should return estimated time for pending status', async () => {
      mockVerifyEnrichmentAccess.mockResolvedValueOnce({
        ...mockEnrichment,
        status: 'pending',
      });

      const caller = testRouter.createCaller(createAuthenticatedContext());
      const result = await caller.getGenerationStatus({
        enrichmentId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result.estimatedTimeRemaining).toBe(30);
    });

    it('should return estimated time for generating status', async () => {
      mockVerifyEnrichmentAccess.mockResolvedValueOnce({
        ...mockEnrichment,
        status: 'generating',
      });

      const caller = testRouter.createCaller(createAuthenticatedContext());
      const result = await caller.getGenerationStatus({
        enrichmentId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result.estimatedTimeRemaining).toBe(10);
    });

    it('should not return estimated time for completed status', async () => {
      mockVerifyEnrichmentAccess.mockResolvedValueOnce({
        ...mockEnrichment,
        status: 'completed',
      });

      const caller = testRouter.createCaller(createAuthenticatedContext());
      const result = await caller.getGenerationStatus({
        enrichmentId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result.estimatedTimeRemaining).toBeUndefined();
    });
  });

  describe('Not Found Handling', () => {
    it('should throw NOT_FOUND if enrichment does not exist', async () => {
      mockVerifyEnrichmentAccess.mockRejectedValueOnce(
        new TRPCError({
          code: 'NOT_FOUND',
          message: 'Enrichment not found',
        })
      );

      const caller = testRouter.createCaller(createAuthenticatedContext());

      try {
        await caller.getGenerationStatus({
          enrichmentId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        if (error instanceof TRPCError) {
          expect(error.code).toBe('NOT_FOUND');
        }
      }
    });
  });

  describe('Response Structure', () => {
    it('should return all required fields', async () => {
      mockVerifyEnrichmentAccess.mockResolvedValueOnce({
        ...mockEnrichment,
        status: 'generating',
      });

      const caller = testRouter.createCaller(createAuthenticatedContext());
      const result = await caller.getGenerationStatus({
        enrichmentId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('progress');
      expect(result).toHaveProperty('currentStep');
      // estimatedTimeRemaining is optional but should be present for generating
      expect(result).toHaveProperty('estimatedTimeRemaining');
    });
  });
});
