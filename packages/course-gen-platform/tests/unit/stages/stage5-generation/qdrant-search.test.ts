/**
 * Unit Tests for Stage 5 RAG Integration (qdrant-search.ts)
 *
 * Tests:
 * 1. createSearchDocumentsTool definition and handler
 * 2. Graceful degradation on Qdrant failures
 *
 * Note: enrichBatchContext and TOKEN_BUDGET tests removed — dead code cleaned in mc2-cwzb.
 *
 * @module tests/unit/stage5/qdrant-search.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSearchDocumentsTool } from '@/stages/stage5-generation/utils/qdrant-search';
import * as qdrantSearch from '@/shared/qdrant/search';

// Mock dependencies
vi.mock('@/shared/qdrant/search');
vi.mock('@/shared/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('qdrant-search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSearchDocumentsTool', () => {
    const courseId = 'test-course-456';

    it('should create valid tool definition', () => {
      const tool = createSearchDocumentsTool(courseId);

      expect(tool.name).toBe('search_documents');
      expect(tool.description).toContain('SPARINGLY');
      expect(tool.description).toContain('exact formulas');
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.properties.query).toBeDefined();
      expect(tool.parameters.properties.limit).toBeDefined();
      expect(tool.parameters.required).toContain('query');
      expect(typeof tool.handler).toBe('function');
    });

    it('should execute search with default parameters', async () => {
      const tool = createSearchDocumentsTool(courseId);

      const mockSearchResponse = {
        results: [
          {
            chunk_id: 'chunk-1',
            parent_chunk_id: null,
            level: 'child' as const,
            content: 'Formula: E = mc^2',
            heading_path: 'Physics > Special Relativity',
            chapter: 'Chapter 1',
            section: null,
            document_id: 'physics-doc',
            document_name: 'Physics Textbook',
            page_number: 10,
            page_range: null,
            token_count: 8,
            score: 0.92,
            metadata: {
              has_code: false,
              has_formulas: true,
              has_tables: false,
              has_images: false,
            },
          },
        ],
        metadata: {
          total_results: 1,
          search_type: 'hybrid' as const,
          embedding_time_ms: 100,
          search_time_ms: 110,
          filters_applied: {
            course_id: courseId,
          },
        },
      };

      vi.mocked(qdrantSearch.searchChunks).mockResolvedValue(mockSearchResponse);

      const result = await tool.handler({ query: 'mass-energy equivalence formula' });

      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].content).toBe('Formula: E = mc^2');
      expect(result.chunks[0].document).toBe('Physics Textbook');
      expect(result.chunks[0].score).toBe(0.92);
      expect(result.metadata.total_results).toBe(1);
      expect(result.metadata.search_type).toBe('hybrid');

      expect(qdrantSearch.searchChunks).toHaveBeenCalledWith(
        'mass-energy equivalence formula',
        expect.objectContaining({
          limit: 3, // default
          score_threshold: 0.7,
          enable_hybrid: true,
          filters: { course_id: courseId },
        })
      );
    });

    it('should execute search with custom limit and filters', async () => {
      const tool = createSearchDocumentsTool(courseId);

      const mockSearchResponse = {
        results: [],
        metadata: {
          total_results: 0,
          search_type: 'hybrid' as const,
          embedding_time_ms: 50,
          search_time_ms: 60,
          filters_applied: {
            course_id: courseId,
            section_id: '2',
          },
        },
      };

      vi.mocked(qdrantSearch.searchChunks).mockResolvedValue(mockSearchResponse);

      await tool.handler({
        query: 'test query',
        limit: 8,
        filter: { section_id: '2' },
      });

      expect(qdrantSearch.searchChunks).toHaveBeenCalledWith(
        'test query',
        expect.objectContaining({
          limit: 8,
          filters: {
            course_id: courseId,
            section_id: '2',
          },
        })
      );
    });

    it('should cap limit at 10 chunks maximum', async () => {
      const tool = createSearchDocumentsTool(courseId);

      const mockSearchResponse = {
        results: [],
        metadata: {
          total_results: 0,
          search_type: 'hybrid' as const,
          embedding_time_ms: 50,
          search_time_ms: 60,
          filters_applied: { course_id: courseId },
        },
      };

      vi.mocked(qdrantSearch.searchChunks).mockResolvedValue(mockSearchResponse);

      await tool.handler({
        query: 'test query',
        limit: 50, // Should be capped at 10
      });

      expect(qdrantSearch.searchChunks).toHaveBeenCalledWith(
        'test query',
        expect.objectContaining({
          limit: 10, // capped
        })
      );
    });

    it('should handle search failures gracefully (return error response)', async () => {
      const tool = createSearchDocumentsTool(courseId);

      vi.mocked(qdrantSearch.searchChunks).mockRejectedValue(new Error('Qdrant unavailable'));

      const result = await tool.handler({ query: 'test query' });

      expect(result.error).toBeDefined();
      expect(result.error).toContain('Search unavailable');
      expect(result.chunks).toEqual([]);
      expect(result.metadata.total_results).toBe(0);
      expect(result.metadata.search_type).toBe('error');
    });
  });
});
