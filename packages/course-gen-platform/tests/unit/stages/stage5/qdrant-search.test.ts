/**
 * Unit Tests for Stage 5 RAG Integration (qdrant-search.ts)
 *
 * Tests:
 * 1. enrichBatchContext with document summaries
 * 2. enrichBatchContext without documents (returns empty)
 * 3. Token budget truncation (>40K → 40K)
 * 4. createSearchDocumentsTool definition and handler
 * 5. Graceful degradation on Qdrant failures
 *
 * @module tests/unit/stage5/qdrant-search.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichBatchContext, createSearchDocumentsTool, TOKEN_BUDGET } from '@/stages/stage5-generation/utils/qdrant-search';
import type { SectionBatchInput } from '@/stages/stage5-generation/utils/qdrant-search';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';
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

  describe('enrichBatchContext', () => {
    const courseId = 'test-course-123';
    const batchInput: SectionBatchInput = {
      sections: [
        {
          section_id: '1',
          area: 'Neural Networks',
          key_topics: ['backpropagation', 'gradients', 'chain rule'],
          learning_objectives: ['Understand backprop algorithm'],
        },
      ],
    };

    it('should return empty string when RAG not applicable (no documents, no research flags)', async () => {
      const analysisResult: Partial<AnalysisResult> = {
        document_relevance_mapping: {},
        research_flags: [],
      };

      const result = await enrichBatchContext(batchInput, courseId, analysisResult as AnalysisResult);

      expect(result).toBe('');
    });

    it('should retrieve and format Qdrant chunks when documents available', async () => {
      const analysisResult: Partial<AnalysisResult> = {
        document_relevance_mapping: {
          '1': {
            primary_documents: ['doc-1', 'doc-2'],
            key_search_terms: ['backprop', 'gradients'],
            expected_topics: ['neural networks'],
            document_processing_methods: {
              'doc-1': 'hierarchical',
              'doc-2': 'full_text',
            },
          },
        },
        research_flags: [],
      };

      const mockSearchResponse = {
        results: [
          {
            chunk_id: 'chunk-1',
            parent_chunk_id: null,
            level: 'child' as const,
            content: 'Backpropagation is the key algorithm for training neural networks.',
            heading_path: 'Chapter 3 > Backpropagation',
            chapter: 'Chapter 3',
            section: null,
            document_id: 'doc-1',
            document_name: 'Neural Networks Textbook',
            page_number: 42,
            page_range: null,
            token_count: 15,
            score: 0.89,
            metadata: {
              has_code: false,
              has_formulas: true,
              has_tables: false,
              has_images: false,
            },
          },
          {
            chunk_id: 'chunk-2',
            parent_chunk_id: null,
            level: 'child' as const,
            content: 'The chain rule is fundamental to computing gradients.',
            heading_path: 'Chapter 2 > Calculus Review',
            chapter: 'Chapter 2',
            section: null,
            document_id: 'doc-2',
            document_name: 'ML Fundamentals',
            page_number: 15,
            page_range: null,
            token_count: 12,
            score: 0.82,
            metadata: {
              has_code: false,
              has_formulas: true,
              has_tables: false,
              has_images: false,
            },
          },
        ],
        metadata: {
          total_results: 2,
          search_type: 'hybrid' as const,
          embedding_time_ms: 120,
          search_time_ms: 150,
          filters_applied: {
            course_id: courseId,
          },
        },
      };

      vi.mocked(qdrantSearch.searchChunks).mockResolvedValue(mockSearchResponse);

      const result = await enrichBatchContext(batchInput, courseId, analysisResult as AnalysisResult);

      expect(result).toContain('REFERENCE MATERIAL');
      expect(result).toContain('AVAILABLE DOCUMENTS');
      expect(result).toContain('DETAILED CHUNKS');
      expect(result).toContain('Neural Networks Textbook');
      expect(result).toContain('Backpropagation is the key algorithm');
      expect(result).toContain('Score: 0.89');
      expect(qdrantSearch.searchChunks).toHaveBeenCalledWith(
        'backpropagation gradients chain rule',
        expect.objectContaining({
          limit: 5,
          score_threshold: 0.7,
          enable_hybrid: true,
          filters: { course_id: courseId },
        })
      );
    });

    it('should truncate RAG context to TOKEN_BUDGET.RAG_MAX_TOKENS', async () => {
      const analysisResult: Partial<AnalysisResult> = {
        document_relevance_mapping: {
          '1': {
            primary_documents: ['doc-large'],
            key_search_terms: ['topic'],
            expected_topics: ['large topic'],
            document_processing_methods: {
              'doc-large': 'hierarchical',
            },
          },
        },
        research_flags: [],
      };

      // Create a large chunk that will exceed 40K tokens
      const largeContent = 'x'.repeat(120_000); // ~48K tokens (120K chars / 2.5)

      const mockSearchResponse = {
        results: [
          {
            chunk_id: 'chunk-large',
            parent_chunk_id: null,
            level: 'child' as const,
            content: largeContent,
            heading_path: 'Chapter 1',
            chapter: 'Chapter 1',
            section: null,
            document_id: 'doc-large',
            document_name: 'Large Document',
            page_number: 1,
            page_range: null,
            token_count: 48000,
            score: 0.95,
            metadata: {
              has_code: false,
              has_formulas: false,
              has_tables: false,
              has_images: false,
            },
          },
        ],
        metadata: {
          total_results: 1,
          search_type: 'hybrid' as const,
          embedding_time_ms: 100,
          search_time_ms: 120,
          filters_applied: { course_id: courseId },
        },
      };

      vi.mocked(qdrantSearch.searchChunks).mockResolvedValue(mockSearchResponse);

      const result = await enrichBatchContext(batchInput, courseId, analysisResult as AnalysisResult);

      // Verify result is truncated (allowing small overhead for header text)
      const estimatedTokens = Math.floor(result.length / 2.5); // Use Math.floor like production code
      const maxTokensWithHeaderMargin = TOKEN_BUDGET.RAG_MAX_TOKENS + 100; // Allow 100 tokens for "REFERENCE MATERIAL..." header
      expect(estimatedTokens).toBeLessThanOrEqual(maxTokensWithHeaderMargin);
    });

    it('should handle Qdrant failures gracefully (return empty string)', async () => {
      const analysisResult: Partial<AnalysisResult> = {
        document_relevance_mapping: {
          '1': {
            primary_documents: ['doc-1'],
            key_search_terms: ['topic'],
            expected_topics: ['test'],
            document_processing_methods: {
              'doc-1': 'full_text',
            },
          },
        },
        research_flags: [],
      };

      vi.mocked(qdrantSearch.searchChunks).mockRejectedValue(new Error('Qdrant connection failed'));

      const result = await enrichBatchContext(batchInput, courseId, analysisResult as AnalysisResult);

      expect(result).toBe('');
    });

    it('should handle title-only scenario (null analysisResult)', async () => {
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

      const result = await enrichBatchContext(batchInput, courseId, null);

      // Should attempt RAG query for title-only
      expect(qdrantSearch.searchChunks).toHaveBeenCalled();
    });

    it('should return document summaries only when no Qdrant chunks found', async () => {
      const analysisResult: Partial<AnalysisResult> = {
        document_relevance_mapping: {
          '1': {
            primary_documents: ['doc-1', 'doc-2'],
            key_search_terms: ['rare-topic'],
            expected_topics: ['obscure'],
            document_processing_methods: {
              'doc-1': 'full_text',
              'doc-2': 'full_text',
            },
          },
        },
        research_flags: [],
      };

      const mockSearchResponse = {
        results: [],
        metadata: {
          total_results: 0,
          search_type: 'hybrid' as const,
          embedding_time_ms: 80,
          search_time_ms: 90,
          filters_applied: { course_id: courseId },
        },
      };

      vi.mocked(qdrantSearch.searchChunks).mockResolvedValue(mockSearchResponse);

      const result = await enrichBatchContext(batchInput, courseId, analysisResult as AnalysisResult);

      expect(result).toContain('AVAILABLE DOCUMENTS');
      expect(result).toContain('doc-1');
      expect(result).toContain('doc-2');
      expect(result).not.toContain('DETAILED CHUNKS');
    });
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

  describe('TOKEN_BUDGET constants', () => {
    it('should export correct token budget values', () => {
      expect(TOKEN_BUDGET.RAG_MAX_TOKENS).toBe(40_000);
      expect(TOKEN_BUDGET.INPUT_BUDGET_MAX).toBe(90_000);
      expect(TOKEN_BUDGET.GEMINI_TRIGGER_INPUT).toBe(108_000);
      expect(TOKEN_BUDGET.TOTAL_BUDGET).toBe(120_000);
    });
  });
});
