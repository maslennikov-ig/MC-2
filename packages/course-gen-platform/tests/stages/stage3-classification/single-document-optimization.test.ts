/**
 * Unit Tests: Stage 3 Single Document Optimization
 *
 * Tests the optimization that auto-assigns CORE priority to single documents,
 * skipping LLM classification to save tokens and latency.
 *
 * @see packages/course-gen-platform/src/stages/stage3-classification/orchestrator.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Stage3ClassificationOrchestrator } from '../../../src/stages/stage3-classification/orchestrator';

// Mock dependencies
vi.mock('../../../src/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('../../../src/shared/trace-logger', () => ({
  logTrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/shared/logger/index.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../src/stages/stage3-classification/phases/phase-classification', () => ({
  executeDocumentClassificationComparative: vi.fn(),
}));

import { getSupabaseAdmin } from '../../../src/shared/supabase/admin';
import { logTrace } from '../../../src/shared/trace-logger';
import { executeDocumentClassificationComparative } from '../../../src/stages/stage3-classification/phases/phase-classification';

describe('Stage3ClassificationOrchestrator - Single Document Optimization', () => {
  let orchestrator: Stage3ClassificationOrchestrator;
  let mockSupabase: {
    from: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new Stage3ClassificationOrchestrator();

    // Setup mock Supabase client
    mockSupabase = {
      from: vi.fn(),
    };
    vi.mocked(getSupabaseAdmin).mockReturnValue(
      mockSupabase as unknown as ReturnType<typeof getSupabaseAdmin>
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Single document auto-assignment', () => {
    it('should auto-assign CORE priority for single document without calling LLM', async () => {
      const testFileId = '123e4567-e89b-12d3-a456-426614174000';
      const testCourseId = 'course-uuid-123';
      const testOrgId = 'org-uuid-456';

      // Mock: loadDocumentIds returns 1 file
      const selectIdsMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue({
            data: [{ id: testFileId }],
            error: null,
          }),
        }),
      });

      // Mock: load file data for single doc
      const selectFileMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              filename: 'test-document.pdf',
              summary_metadata: { existing: 'metadata' },
            },
            error: null,
          }),
        }),
      });

      // Mock: update file with CORE priority
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          error: null,
        }),
      });

      // Setup from() to return different mocks based on method chain
      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: loadDocumentIds
          return { select: selectIdsMock };
        } else if (callCount === 2) {
          // Second call: load file data
          return { select: selectFileMock };
        } else {
          // Third call: update
          return { update: updateMock };
        }
      });

      // Execute
      const result = await orchestrator.execute({
        courseId: testCourseId,
        organizationId: testOrgId,
      });

      // Assertions
      expect(result.success).toBe(true);
      expect(result.totalDocuments).toBe(1);
      expect(result.coreCount).toBe(1);
      expect(result.importantCount).toBe(0);
      expect(result.supplementaryCount).toBe(0);
      expect(result.classifications).toHaveLength(1);
      expect(result.classifications[0].priority).toBe('CORE');
      expect(result.classifications[0].filename).toBe('test-document.pdf');
      expect(result.classifications[0].rationale).toContain('single document');

      // Verify LLM was NOT called
      expect(executeDocumentClassificationComparative).not.toHaveBeenCalled();

      // Verify trace was logged
      expect(logTrace).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId: testCourseId,
          stage: 'stage_3',
          phase: 'single_document_skip',
          stepName: 'auto_assign_core',
        })
      );
    });

    it('should include processing time in result', async () => {
      const testFileId = '123e4567-e89b-12d3-a456-426614174001';

      // Setup mocks similar to above
      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({
                  data: [{ id: testFileId }],
                  error: null,
                }),
              }),
            }),
          };
        } else if (callCount === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { filename: 'doc.pdf', summary_metadata: null },
                  error: null,
                }),
              }),
            }),
          };
        } else {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
      });

      const result = await orchestrator.execute({
        courseId: 'course-123',
        organizationId: 'org-456',
      });

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.processingTimeMs).toBe('number');
    });

    it('should call onProgress callback with correct percentages', async () => {
      const testFileId = '123e4567-e89b-12d3-a456-426614174002';
      const progressCalls: Array<{ percent: number; message: string }> = [];

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({
                  data: [{ id: testFileId }],
                  error: null,
                }),
              }),
            }),
          };
        } else if (callCount === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { filename: 'doc.pdf', summary_metadata: {} },
                  error: null,
                }),
              }),
            }),
          };
        } else {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
      });

      await orchestrator.execute({
        courseId: 'course-123',
        organizationId: 'org-456',
        onProgress: (percent, message) => {
          progressCalls.push({ percent, message });
        },
      });

      // Should have 3 progress calls: 10% (loading), 50% (single doc), 100% (complete)
      expect(progressCalls.length).toBeGreaterThanOrEqual(2);
      expect(progressCalls.some(c => c.percent === 50)).toBe(true);
      expect(progressCalls.some(c => c.percent === 100)).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should throw error if file not found', async () => {
      const testFileId = '123e4567-e89b-12d3-a456-426614174003';

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({
                  data: [{ id: testFileId }],
                  error: null,
                }),
              }),
            }),
          };
        } else {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Not found' },
                }),
              }),
            }),
          };
        }
      });

      await expect(
        orchestrator.execute({
          courseId: 'course-123',
          organizationId: 'org-456',
        })
      ).rejects.toThrow('Failed to load file');
    });

    it('should throw error if update fails', async () => {
      const testFileId = '123e4567-e89b-12d3-a456-426614174004';

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({
                  data: [{ id: testFileId }],
                  error: null,
                }),
              }),
            }),
          };
        } else if (callCount === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { filename: 'doc.pdf', summary_metadata: {} },
                  error: null,
                }),
              }),
            }),
          };
        } else {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                error: { message: 'Update failed' },
              }),
            }),
          };
        }
      });

      await expect(
        orchestrator.execute({
          courseId: 'course-123',
          organizationId: 'org-456',
        })
      ).rejects.toThrow('Failed to update priority');
    });
  });

  describe('Edge cases', () => {
    it('should preserve existing summary_metadata when adding classification', async () => {
      const testFileId = '123e4567-e89b-12d3-a456-426614174005';
      const existingMetadata = {
        summary_tokens: 500,
        processed_at: '2025-01-01T00:00:00Z',
        custom_field: 'preserved',
      };

      let capturedUpdate: Record<string, unknown> | null = null;

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({
                  data: [{ id: testFileId }],
                  error: null,
                }),
              }),
            }),
          };
        } else if (callCount === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { filename: 'doc.pdf', summary_metadata: existingMetadata },
                  error: null,
                }),
              }),
            }),
          };
        } else {
          return {
            update: vi.fn().mockImplementation(data => {
              capturedUpdate = data;
              return {
                eq: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        }
      });

      await orchestrator.execute({
        courseId: 'course-123',
        organizationId: 'org-456',
      });

      // Verify existing metadata is preserved
      expect(capturedUpdate).not.toBeNull();
      const metadata = capturedUpdate!.summary_metadata as Record<string, unknown>;
      expect(metadata.summary_tokens).toBe(500);
      expect(metadata.processed_at).toBe('2025-01-01T00:00:00Z');
      expect(metadata.custom_field).toBe('preserved');
      expect(metadata.classification).toBeDefined();
    });
  });
});
