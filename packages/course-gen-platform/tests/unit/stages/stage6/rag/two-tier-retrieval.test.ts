import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retrieveLessonContext } from '@/stages/stage6-lesson-content/rag/retriever';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { SearchResult } from '@/shared/qdrant/search-types';

// ============================================================================
// MOCKS
// ============================================================================

// Mock dependencies
vi.mock('@/shared/qdrant/search', () => ({
  searchChunks: vi.fn(),
}));

vi.mock('@/shared/rag/document-availability', () => ({
  checkCourseHasIndexedDocuments: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@/stages/stage5-generation/utils/rag-context-cache', () => ({
  ragContextCache: {
    get: vi.fn(() => Promise.resolve(null)),
    store: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@/shared/trace-logger', () => ({
  logTrace: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/shared/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/stages/stage6-lesson-content/rag/reranking', () => ({
  rerankChunks: vi.fn((chunks, queries, lessonId, targetChunks) => {
    // Pass through sorted by similarity_score, slice to target
    return Promise.resolve(
      chunks.sort((a, b) => b.similarity_score - a.similarity_score).slice(0, targetChunks)
    );
  }),
}));

vi.mock('@/stages/stage6-lesson-content/rag/coverage', () => ({
  calculateLessonCoverage: vi.fn(() => 0.5),
}));

// Mock buildLessonQueries to return a controlled set of queries
vi.mock('@/stages/stage6-lesson-content/rag/helpers', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/stages/stage6-lesson-content/rag/helpers')>();
  return {
    ...actual,
    buildLessonQueries: vi.fn(lessonSpec => {
      // Return rag_context.search_queries if provided, otherwise use actual implementation
      if (lessonSpec.rag_context?.search_queries) {
        return lessonSpec.rag_context.search_queries;
      }
      return actual.buildLessonQueries(lessonSpec);
    }),
  };
});

// Import mocked functions
import { searchChunks } from '@/shared/qdrant/search';
import { checkCourseHasIndexedDocuments } from '@/shared/rag/document-availability';
import { ragContextCache } from '@/stages/stage5-generation/utils/rag-context-cache';
import { logTrace } from '@/shared/trace-logger';
import { rerankChunks } from '@/stages/stage6-lesson-content/rag/reranking';
import { calculateLessonCoverage } from '@/stages/stage6-lesson-content/rag/coverage';
import { buildLessonQueries } from '@/stages/stage6-lesson-content/rag/helpers';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a mock LessonSpecificationV2 object for testing
 */
function createMockLessonSpec(overrides?: Partial<LessonSpecificationV2>): LessonSpecificationV2 {
  return {
    lesson_id: '1.1',
    title: 'Test Lesson',
    description: 'A test lesson for unit testing',
    metadata: {
      target_audience: 'practitioner',
      tone: 'conversational-professional',
      compliance_level: 'standard',
      content_archetype: 'concept_explainer',
    },
    learning_objectives: [
      {
        id: 'LO-1.1.1',
        objective: 'Understand testing principles',
        bloom_level: 'understand',
      },
      {
        id: 'LO-1.1.2',
        objective: 'Apply testing to real scenarios',
        bloom_level: 'apply',
      },
    ],
    intro_blueprint: {
      hook_strategy: 'question',
      hook_topic: 'Why testing matters',
      key_learning_objectives: 'Understand testing, Apply testing',
    },
    sections: [
      {
        title: 'Section 1',
        content_archetype: 'concept_explainer',
        rag_context_id: '1',
        constraints: {
          depth: 'detailed_analysis',
          required_keywords: [],
          prohibited_terms: [],
        },
        key_points_to_cover: ['testing basics', 'test types'],
      },
    ],
    exercises: [],
    rag_context: {
      primary_documents: [],
      search_queries: ['topic query', 'objective query'],
      expected_chunks: 7,
    },
    estimated_duration_minutes: 30,
    difficulty_level: 'intermediate',
    ...overrides,
  } as LessonSpecificationV2;
}

/**
 * Create a mock Qdrant SearchResult with configurable chunk count
 */
function createMockSearchResult(chunkCount: number): SearchResult {
  return {
    results: Array.from({ length: chunkCount }, (_, i) => ({
      chunk_id: `chunk-${i}`,
      document_id: `doc-${i}`,
      document_name: `Document ${i}`,
      content: `Content for chunk ${i}`,
      heading_path: `Section > Topic ${i}`,
      score: 0.5 - i * 0.05,
    })),
  };
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Two-Tier RAG Retrieval - retrieveLessonContext()', () => {
  const mockCourseId = 'course-123';

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Reset environment variables to defaults
    delete process.env.RAG_TWO_TIER_ENABLED;
  });

  afterEach(() => {
    // Clean up environment variables after each test
    delete process.env.RAG_TWO_TIER_ENABLED;
  });

  // ==========================================================================
  // TEST 1: Tier 1 Exit (Strike-Two)
  // ==========================================================================

  it('should exit at Tier 1 when both gate queries return 0 results', async () => {
    const lessonSpec = createMockLessonSpec();

    // Mock searchChunks to return empty results for all calls
    vi.mocked(searchChunks).mockResolvedValue(createMockSearchResult(0));

    const result = await retrieveLessonContext({
      courseId: mockCourseId,
      lessonSpec,
      useCache: false, // Disable cache to test retrieval logic
    });

    // Verify searchChunks called exactly 2 times (Tier 1 only)
    expect(searchChunks).toHaveBeenCalledTimes(2);

    // Verify rerankChunks NOT called (early exit before reranking)
    expect(rerankChunks).not.toHaveBeenCalled();

    // Verify result has empty chunks
    expect(result.chunks).toEqual([]);
    expect(result.totalRetrieved).toBe(0);

    // Verify logTrace called with tier1_exit step
    expect(logTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        stepName: 'tier1_exit',
        outputData: expect.objectContaining({
          tier1Exit: true,
          rerankerSkipped: true,
          queriesSaved: expect.any(Number),
        }),
      })
    );
  });

  // ==========================================================================
  // TEST 2: Tier 1 Pass → Tier 2 Full Retrieval
  // ==========================================================================

  it('should proceed to Tier 2 when Tier 1 finds chunks', async () => {
    const lessonSpec = createMockLessonSpec({
      rag_context: {
        primary_documents: [],
        search_queries: [
          'query1',
          'query2',
          'query3',
          'query4',
          'query5',
          'query6',
          'query7',
          'query8',
          'query9',
          'query10',
        ],
        expected_chunks: 7,
      },
    });

    // Mock searchChunks: first call (Tier 1) returns 1 chunk, rest return chunks too
    vi.mocked(searchChunks)
      .mockResolvedValueOnce(createMockSearchResult(1)) // Tier 1 query 1
      .mockResolvedValueOnce(createMockSearchResult(1)) // Tier 1 query 2
      .mockResolvedValue(createMockSearchResult(2)); // All Tier 2 queries

    const result = await retrieveLessonContext({
      courseId: mockCourseId,
      lessonSpec,
      useCache: false,
    });

    // Verify searchChunks called 10 times (2 Tier 1 + 8 Tier 2)
    // Note: We have 10 queries total, Tier 1 uses first 2, Tier 2 uses remaining 8
    expect(searchChunks).toHaveBeenCalledTimes(10);

    // Verify rerankChunks called once (we got chunks, so reranking happens)
    expect(rerankChunks).toHaveBeenCalledTimes(1);

    // Verify result has reranked results
    expect(result.chunks).toBeDefined();
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  // ==========================================================================
  // TEST 3: Strike-Two - One Hit Saves the Day
  // ==========================================================================

  it('should proceed to Tier 2 when only second Tier 1 query finds chunks', async () => {
    const lessonSpec = createMockLessonSpec({
      rag_context: {
        primary_documents: [],
        search_queries: [
          'query1',
          'query2',
          'query3',
          'query4',
          'query5',
          'query6',
          'query7',
          'query8',
          'query9',
          'query10',
        ],
        expected_chunks: 7,
      },
    });

    // Mock searchChunks: call 1 returns [], call 2 returns 1 chunk, rest return chunks
    vi.mocked(searchChunks)
      .mockResolvedValueOnce(createMockSearchResult(0)) // Tier 1 query 1 - empty
      .mockResolvedValueOnce(createMockSearchResult(1)) // Tier 1 query 2 - has chunk
      .mockResolvedValue(createMockSearchResult(2)); // All Tier 2 queries

    const result = await retrieveLessonContext({
      courseId: mockCourseId,
      lessonSpec,
      useCache: false,
    });

    // Verify searchChunks called 10 times (2 Tier 1 + 8 Tier 2)
    expect(searchChunks).toHaveBeenCalledTimes(10);

    // Verify rerankChunks called (second query saved us from early exit)
    expect(rerankChunks).toHaveBeenCalledTimes(1);

    // Verify result has chunks
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  // ==========================================================================
  // TEST 4: Tier 1 Uses Lower Threshold, Tier 2 Uses Standard Threshold
  // ==========================================================================

  it('should use lower threshold (0.15) for Tier 1 and standard threshold (0.25) for Tier 2', async () => {
    const lessonSpec = createMockLessonSpec({
      rag_context: {
        primary_documents: [],
        search_queries: ['query1', 'query2', 'query3', 'query4'],
        expected_chunks: 7,
      },
    });

    // Mock searchChunks to return 1 chunk per query
    vi.mocked(searchChunks).mockResolvedValue(createMockSearchResult(1));

    await retrieveLessonContext({
      courseId: mockCourseId,
      lessonSpec,
      useCache: false,
    });

    // All 4 queries should be executed (2 Tier 1 + 2 Tier 2)
    expect(searchChunks).toHaveBeenCalledTimes(4);

    // Verify Tier 1 queries (first 2 calls) use TIER1_SCORE_THRESHOLD (0.15)
    const tier1Call1Options = vi.mocked(searchChunks).mock.calls[0][1];
    const tier1Call2Options = vi.mocked(searchChunks).mock.calls[1][1];
    expect(tier1Call1Options?.score_threshold).toBe(0.15);
    expect(tier1Call2Options?.score_threshold).toBe(0.15);

    // Verify Tier 2 queries (last 2 calls) use SCORE_THRESHOLD (0.25)
    const tier2Call1Options = vi.mocked(searchChunks).mock.calls[2][1];
    const tier2Call2Options = vi.mocked(searchChunks).mock.calls[3][1];
    expect(tier2Call1Options?.score_threshold).toBe(0.25);
    expect(tier2Call2Options?.score_threshold).toBe(0.25);
  });

  // ==========================================================================
  // TEST 5: Edge Case - Single Query
  // ==========================================================================

  it('should handle single query with Tier 1 using 1 query and Tier 2 using 0', async () => {
    const lessonSpec = createMockLessonSpec({
      rag_context: {
        primary_documents: [],
        search_queries: ['single query'],
        expected_chunks: 7,
      },
    });

    // Mock searchChunks to return 1 chunk
    vi.mocked(searchChunks).mockResolvedValue(createMockSearchResult(1));

    const result = await retrieveLessonContext({
      courseId: mockCourseId,
      lessonSpec,
      useCache: false,
    });

    // With Two-Tier enabled, Tier 1 uses min(2, queries.length) = min(2, 1) = 1 query
    // So only 1 query should be executed (all in Tier 1)
    expect(searchChunks).toHaveBeenCalledTimes(1);

    // Verify rerankChunks called (chunk was found)
    expect(rerankChunks).toHaveBeenCalledTimes(1);

    // Verify result has chunk
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  // ==========================================================================
  // TEST 6: Cache Hit Skips Two-Tier
  // ==========================================================================

  it('should return cached result without executing any queries', async () => {
    const lessonSpec = createMockLessonSpec();

    // Mock cache hit with cached data
    const cachedData = {
      sectionId: '1.1',
      chunks: [
        {
          chunkId: 'cached-chunk-1',
          documentId: 'cached-doc-1',
          documentName: 'Cached Document 1',
          content: 'Cached content',
          headingPath: 'Cached Section',
          score: 0.8,
          matchedQuery: 'cached query',
        },
      ],
      totalRetrieved: 1,
      searchQueriesUsed: ['cached query'],
      coverageScore: 0.6,
      retrievalDurationMs: 100,
    };

    vi.mocked(ragContextCache.get).mockResolvedValue(cachedData);

    const result = await retrieveLessonContext({
      courseId: mockCourseId,
      lessonSpec,
      useCache: true, // Enable cache
    });

    // Verify searchChunks NOT called (cache hit)
    expect(searchChunks).not.toHaveBeenCalled();

    // Verify result came from cache
    expect(result.cached).toBe(true);
    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0].chunk_id).toBe('cached-chunk-1');
  });

  // ==========================================================================
  // TEST 7: Query Failure Resilience
  // ==========================================================================

  it('should continue to Tier 2 when Tier 1 query throws error', async () => {
    const lessonSpec = createMockLessonSpec({
      rag_context: {
        primary_documents: [],
        search_queries: [
          'query1',
          'query2',
          'query3',
          'query4',
          'query5',
          'query6',
          'query7',
          'query8',
          'query9',
          'query10',
        ],
        expected_chunks: 7,
      },
    });

    // Mock searchChunks: call 1 throws Error, call 2 returns 1 chunk, rest return chunks
    vi.mocked(searchChunks)
      .mockRejectedValueOnce(new Error('Qdrant connection failed')) // Tier 1 query 1 - error
      .mockResolvedValueOnce(createMockSearchResult(1)) // Tier 1 query 2 - success
      .mockResolvedValue(createMockSearchResult(2)); // All Tier 2 queries

    const result = await retrieveLessonContext({
      courseId: mockCourseId,
      lessonSpec,
      useCache: false,
    });

    // Verify searchChunks called 10 times (not aborted by error)
    expect(searchChunks).toHaveBeenCalledTimes(10);

    // Verify rerankChunks called (second Tier 1 query saved us)
    expect(rerankChunks).toHaveBeenCalledTimes(1);

    // Verify result has chunks
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  // ==========================================================================
  // TEST 8: Tier 1 Exit Trace Logging
  // ==========================================================================

  it('should log tier1_exit trace with correct data on early exit', async () => {
    const lessonSpec = createMockLessonSpec({
      rag_context: {
        primary_documents: [],
        search_queries: [
          'query1',
          'query2',
          'query3',
          'query4',
          'query5',
          'query6',
          'query7',
          'query8',
          'query9',
          'query10',
        ],
        expected_chunks: 7,
      },
    });

    // Mock searchChunks to return empty results (trigger early exit)
    vi.mocked(searchChunks).mockResolvedValue(createMockSearchResult(0));

    await retrieveLessonContext({
      courseId: mockCourseId,
      lessonSpec,
      useCache: false,
    });

    // Verify logTrace called with tier1_exit step
    expect(logTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        courseId: mockCourseId,
        lessonId: '1.1',
        stage: 'stage_6',
        phase: 'rag_retrieval',
        stepName: 'tier1_exit',
        inputData: expect.objectContaining({
          lessonId: '1.1',
          tier1Queries: 2,
          totalQueries: 10,
          tier1Threshold: 0.15,
        }),
        outputData: expect.objectContaining({
          tier1ChunksFound: 0,
          tier1Exit: true,
          queriesSaved: 8, // 10 total - 2 Tier 1 = 8 saved
          rerankerSkipped: true,
        }),
        durationMs: expect.any(Number),
      })
    );
  });
});
