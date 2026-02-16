/**
 * Stage 5 -> Stage 6 RAG Pipeline Integration Test
 *
 * Validates the full RAG pipeline when `document_relevance_mapping` is empty
 * (the normal case for all courses since Phase 6 RAG Planning was removed).
 *
 * Pipeline under test:
 * 1. Stage 5 `convertSectionToV2Specs()` generates `LessonSpecificationV2` with `rag_context`
 * 2. Stage 6 `buildLessonQueries()` extracts search queries from lesson spec
 * 3. Stage 6 `retrieveLessonContext()` uses those queries to search Qdrant
 * 4. The `filteringByDocs` logic in `retriever.ts` correctly handles `primary_documents: []`
 *
 * Mocking strategy:
 * - Mock Qdrant searchChunks, document-availability, ragContextCache, logger, trace-logger
 * - Mock semantic-scaffolding (inferSemanticScaffolding -> null)
 * - Do NOT mock the actual business logic functions being tested
 *
 * Test execution: pnpm test tests/integration/stage5-6-rag-pipeline.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Section, GenerationJobInput } from '@megacampus/shared-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { SearchResponse, SearchResult } from '@/shared/qdrant/search-types';

// ============================================================================
// Module mocks (must be before imports of modules that use them)
// ============================================================================

vi.mock('@/shared/qdrant/search', () => ({
  searchChunks: vi.fn(),
}));

vi.mock('@/shared/rag/document-availability', () => ({
  checkCourseHasIndexedDocuments: vi.fn(),
}));

vi.mock('@/stages/stage5-generation/utils/rag-context-cache', () => ({
  ragContextCache: {
    get: vi.fn().mockResolvedValue(null),
    store: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/stages/stage5-generation/utils/semantic-scaffolding', () => ({
  inferSemanticScaffolding: vi.fn().mockReturnValue(null),
}));

vi.mock('@/shared/logger', () => {
  const noop = vi.fn();
  return {
    default: { debug: noop, info: noop, warn: noop, error: noop },
    logger: { debug: noop, info: noop, warn: noop, error: noop },
  };
});

vi.mock('@/shared/trace-logger', () => ({
  logTrace: vi.fn().mockResolvedValue(undefined),
}));

// Mock reranking to pass through (sort by score, take top N)
vi.mock('@/stages/stage6-lesson-content/rag/reranking', () => ({
  rerankChunks: vi.fn().mockImplementation(
    (chunks: Array<{ similarity_score: number }>, _queries: string[], _lessonId: string, topN: number) =>
      Promise.resolve(
        [...chunks]
          .sort((a, b) => b.similarity_score - a.similarity_score)
          .slice(0, topN)
      )
  ),
}));

// Mock coverage to return a fixed score
vi.mock('@/stages/stage6-lesson-content/rag/coverage', () => ({
  calculateLessonCoverage: vi.fn().mockReturnValue(0.75),
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { convertSectionToV2Specs } from '@/stages/stage5-generation/utils/section-batch/v2-converter';
import { buildLessonQueries } from '@/stages/stage6-lesson-content/rag/helpers';
import { retrieveLessonContext } from '@/stages/stage6-lesson-content/rag/retriever';
import { searchChunks } from '@/shared/qdrant/search';
import { checkCourseHasIndexedDocuments } from '@/shared/rag/document-availability';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Creates a minimal Section fixture with realistic data
 */
function createTestSection(overrides?: Partial<Section>): Section {
  return {
    section_number: 1,
    section_title: 'Introduction to Machine Learning Fundamentals',
    section_description: 'This section covers the core principles and foundational concepts of machine learning.',
    learning_objectives: [
      'Explain the difference between supervised and unsupervised learning approaches',
      'Apply basic classification algorithms to structured datasets for prediction tasks',
    ],
    lessons: [
      {
        lesson_title: 'What is Machine Learning',
        lesson_objectives: [
          'Explain the core concepts of machine learning and its applications',
          'Describe the difference between supervised and unsupervised learning',
        ],
        key_topics: [
          'Machine Learning definition',
          'Supervised learning overview',
          'Unsupervised learning overview',
        ],
        estimated_duration_minutes: 10,
        difficulty_level: 'beginner',
      },
      {
        lesson_title: 'Supervised Learning Algorithms',
        lesson_objectives: [
          'Apply linear regression to simple prediction problems',
          'Compare decision trees and random forests for classification',
        ],
        key_topics: [
          'Linear regression fundamentals',
          'Decision trees and random forests',
          'Model evaluation metrics',
        ],
        estimated_duration_minutes: 15,
        difficulty_level: 'intermediate',
      },
    ],
    estimated_duration_minutes: 25,
    ...overrides,
  } as Section;
}

/**
 * Creates a minimal GenerationJobInput fixture with empty document_relevance_mapping
 */
function createTestJobInput(overrides?: Partial<GenerationJobInput>): GenerationJobInput {
  return {
    course_id: '00000000-0000-0000-0000-000000000001',
    organization_id: '00000000-0000-0000-0000-000000000002',
    user_id: '00000000-0000-0000-0000-000000000003',
    analysis_result: {
      topic_analysis: {
        determined_topic: 'Machine Learning',
        information_completeness: 80,
        complexity: 'intermediate',
        key_concepts: ['supervised learning', 'unsupervised learning', 'neural networks'],
        content_analysis: 'Comprehensive coverage of ML fundamentals with practical applications.',
      },
      recommended_structure: {
        estimated_content_hours: 5,
        scope_reasoning:
          'A comprehensive introduction to machine learning covering supervised, unsupervised, and deep learning approaches with practical examples and hands-on exercises throughout the course.',
        lesson_duration_minutes: 10,
        sections_breakdown: [
          {
            area: 'Machine Learning Fundamentals',
            estimated_lessons: 3,
            importance: 'complex' as const,
            learning_objectives: [
              'Explain the core concepts of machine learning and its applications',
              'Describe supervised vs unsupervised learning approaches in detail',
            ],
            key_topics: ['ML basics', 'supervised learning', 'unsupervised learning'],
            pedagogical_approach:
              'Start with high-level concepts, then dive into specific algorithms with practical examples and real-world applications to reinforce learning.',
          },
        ],
      },
      pedagogical_strategy: {
        assessment_approach:
          'Progressive assessment using quizzes after each section, with a final project that integrates all learned concepts into a real-world application.',
        key_pedagogical_principles: [
          'Scaffolded learning with progressive complexity increases throughout the course',
        ],
      },
      document_relevance_mapping: {}, // Empty = normal case
      metadata: {
        analysis_version: '2.0',
        model_used: 'test-model',
        analysis_duration_ms: 1000,
        confidence_score: 0.9,
      },
    } as GenerationJobInput['analysis_result'],
    frontend_parameters: {
      course_title: 'Introduction to Machine Learning',
      language: 'en',
      style: 'conversational',
      target_audience: 'intermediate developers',
      lesson_duration_minutes: 10,
    },
    vectorized_documents: false,
    ...overrides,
  } as GenerationJobInput;
}

/**
 * Creates a mock SearchResponse with realistic chunk data
 */
function createMockSearchResponse(
  query: string,
  numResults: number = 3,
  documentIds?: string[]
): SearchResponse {
  const results: SearchResult[] = Array.from({ length: numResults }, (_, i) => ({
    chunk_id: `chunk-${query.slice(0, 10).replace(/\s/g, '-')}-${i}`,
    parent_chunk_id: null,
    level: 'parent' as const,
    content: `Relevant content about ${query} - section ${i + 1}. This covers important aspects of the topic.`,
    heading_path: `Chapter ${i + 1} > Section ${i + 1}`,
    chapter: `Chapter ${i + 1}`,
    section: `Section ${i + 1}`,
    document_id: documentIds?.[i % documentIds.length] ?? `doc-${i}`,
    document_name: `document-${i}.pdf`,
    page_number: i + 1,
    page_range: [i + 1, i + 2] as [number, number],
    token_count: 150,
    score: 0.85 - i * 0.05,
    metadata: {
      has_code: false,
      has_formulas: false,
      has_tables: false,
      has_images: false,
    },
  }));

  return {
    results,
    metadata: {
      total_results: numResults,
      search_type: 'hybrid',
      embedding_time_ms: 50,
      search_time_ms: 100,
      filters_applied: {},
    },
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Stage 5 -> Stage 6 RAG Pipeline Integration', () => {
  const mockedSearchChunks = vi.mocked(searchChunks);
  const mockedCheckDocs = vi.mocked(checkCourseHasIndexedDocuments);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedCheckDocs.mockResolvedValue(true);
    mockedSearchChunks.mockImplementation((query: string) =>
      Promise.resolve(createMockSearchResponse(query))
    );
  });

  // ==========================================================================
  // Test 1: Stage 5 generates correct RAG context with empty mapping
  // ==========================================================================

  describe('Test 1: Stage 5 generates correct RAG context with empty mapping', () => {
    it('should set primary_documents to empty array when document_relevance_mapping is empty', () => {
      const section = createTestSection();
      const input = createTestJobInput();

      const specs = convertSectionToV2Specs(section, 0, input);

      expect(specs.length).toBe(2);

      for (const spec of specs) {
        expect(spec.rag_context).toBeDefined();
        expect(spec.rag_context.primary_documents).toEqual([]);
      }
    });

    it('should generate search_queries from section area and key_topics', () => {
      const section = createTestSection();
      const input = createTestJobInput();

      const specs = convertSectionToV2Specs(section, 0, input);

      for (const spec of specs) {
        expect(spec.rag_context.search_queries.length).toBeGreaterThan(0);

        // Should contain section area from sections_breakdown[0]
        expect(spec.rag_context.search_queries[0]).toBe('Machine Learning Fundamentals');

        // Should contain key_topics from the section breakdown
        const queries = spec.rag_context.search_queries;
        expect(queries).toContain('ML basics');
        expect(queries).toContain('supervised learning');
        expect(queries).toContain('unsupervised learning');
      }
    });

    it('should set expected_chunks to 7 for empty mapping (fallback value)', () => {
      const section = createTestSection();
      const input = createTestJobInput();

      const specs = convertSectionToV2Specs(section, 0, input);

      for (const spec of specs) {
        expect(spec.rag_context.expected_chunks).toBe(7);
      }
    });

    it('should use topic fallback when sections_breakdown is missing', () => {
      const section = createTestSection();
      const input = createTestJobInput({
        analysis_result: {
          ...createTestJobInput().analysis_result!,
          recommended_structure: {
            estimated_content_hours: 5,
            scope_reasoning:
              'A comprehensive introduction to machine learning covering supervised, unsupervised, and deep learning approaches with practical examples and hands-on exercises throughout the course.',
            lesson_duration_minutes: 10,
            sections_breakdown: [], // Empty sections breakdown
          },
        } as GenerationJobInput['analysis_result'],
      });

      const specs = convertSectionToV2Specs(section, 0, input);

      // When there is no matching section_breakdown, buildFallbackSearchQueries
      // receives undefined and falls back to topic + sectionId
      for (const spec of specs) {
        expect(spec.rag_context.primary_documents).toEqual([]);
        expect(spec.rag_context.search_queries.length).toBeGreaterThan(0);
        // Fallback: "Machine Learning section 1"
        expect(spec.rag_context.search_queries[0]).toContain('Machine Learning');
        expect(spec.rag_context.search_queries[0]).toContain('section');
      }
    });

    it('should never produce primary_documents with sentinel values like ["default"]', () => {
      const section = createTestSection();
      const input = createTestJobInput();

      const specs = convertSectionToV2Specs(section, 0, input);

      for (const spec of specs) {
        expect(spec.rag_context.primary_documents).not.toContain('default');
        expect(spec.rag_context.primary_documents).toEqual([]);
      }
    });
  });

  // ==========================================================================
  // Test 2: Stage 6 buildLessonQueries uses RAG context from Stage 5 output
  // ==========================================================================

  describe('Test 2: buildLessonQueries uses RAG context from Stage 5 output', () => {
    it('should include rag_context.search_queries in the output', () => {
      const section = createTestSection();
      const input = createTestJobInput();
      const specs = convertSectionToV2Specs(section, 0, input);
      const lessonSpec = specs[0];

      const queries = buildLessonQueries(lessonSpec);

      // Should contain the search_queries from rag_context
      for (const ragQuery of lessonSpec.rag_context.search_queries) {
        expect(queries).toContain(ragQuery);
      }
    });

    it('should include learning objectives as search queries', () => {
      const section = createTestSection();
      const input = createTestJobInput();
      const specs = convertSectionToV2Specs(section, 0, input);
      const lessonSpec = specs[0];

      const queries = buildLessonQueries(lessonSpec);

      // Should contain learning objective text
      for (const obj of lessonSpec.learning_objectives) {
        expect(queries).toContain(obj.objective);
      }
    });

    it('should include section key_points_to_cover', () => {
      const section = createTestSection();
      const input = createTestJobInput();
      const specs = convertSectionToV2Specs(section, 0, input);
      const lessonSpec = specs[0];

      const queries = buildLessonQueries(lessonSpec);

      // Should contain key points from sections
      for (const sectionSpec of lessonSpec.sections) {
        for (const point of sectionSpec.key_points_to_cover) {
          expect(queries).toContain(point);
        }
      }
    });

    it('should deduplicate queries', () => {
      const lessonSpec: LessonSpecificationV2 = {
        lesson_id: '1.1',
        title: 'Test Lesson for deduplication',
        description: 'A test lesson to verify query deduplication logic in buildLessonQueries.',
        metadata: {
          target_audience: 'practitioner',
          tone: 'conversational-professional',
          compliance_level: 'standard',
          content_archetype: 'concept_explainer',
        },
        learning_objectives: [
          { id: 'LO-1.1.1', objective: 'Machine Learning basics overview', bloom_level: 'understand' },
        ],
        intro_blueprint: {
          hook_strategy: 'question',
          hook_topic: 'Machine Learning',
          key_learning_objectives: 'Machine Learning basics overview',
        },
        sections: [
          {
            title: 'ML Fundamentals',
            content_archetype: 'concept_explainer',
            rag_context_id: '1',
            constraints: { depth: 'detailed_analysis', required_keywords: [], prohibited_terms: [] },
            key_points_to_cover: ['Machine Learning basics overview'], // Same as learning objective
          },
        ],
        exercises: [],
        rag_context: {
          primary_documents: [],
          search_queries: ['Machine Learning basics overview'], // Same as learning objective and key point
          expected_chunks: 7,
        },
        estimated_duration_minutes: 10,
        difficulty_level: 'beginner',
      };

      const queries = buildLessonQueries(lessonSpec);

      // "Machine Learning basics overview" appears in search_queries, objectives, AND key_points
      // but should only appear once after deduplication
      const duplicateCount = queries.filter(q => q === 'Machine Learning basics overview').length;
      expect(duplicateCount).toBe(1);
    });

    it('should limit queries to MAX_QUERIES (10)', () => {
      const lessonSpec: LessonSpecificationV2 = {
        lesson_id: '1.1',
        title: 'Test Lesson with many queries',
        description: 'A test lesson with many learning objectives to verify the max query limit.',
        metadata: {
          target_audience: 'practitioner',
          tone: 'conversational-professional',
          compliance_level: 'standard',
          content_archetype: 'concept_explainer',
        },
        learning_objectives: Array.from({ length: 5 }, (_, i) => ({
          id: `LO-1.1.${i + 1}`,
          objective: `Learning objective number ${i + 1} for testing query limits in the pipeline`,
          bloom_level: 'understand' as const,
        })),
        intro_blueprint: {
          hook_strategy: 'question',
          hook_topic: 'Testing',
          key_learning_objectives: 'Testing multiple objectives for query limit validation',
        },
        sections: Array.from({ length: 3 }, (_, i) => ({
          title: `Section ${i + 1}`,
          content_archetype: 'concept_explainer' as const,
          rag_context_id: '1',
          constraints: { depth: 'detailed_analysis' as const, required_keywords: [], prohibited_terms: [] },
          key_points_to_cover: [`Key point A for section ${i + 1}`, `Key point B for section ${i + 1}`],
        })),
        exercises: [],
        rag_context: {
          primary_documents: [],
          search_queries: ['query 1', 'query 2', 'query 3', 'query 4', 'query 5'],
          expected_chunks: 7,
        },
        estimated_duration_minutes: 10,
        difficulty_level: 'beginner',
      };

      const queries = buildLessonQueries(lessonSpec);

      // 5 search_queries + 5 objectives + 6 key_points = 16 total, but capped at 10
      expect(queries.length).toBeLessThanOrEqual(10);
    });
  });

  // ==========================================================================
  // Test 3: Stage 6 retriever handles empty primary_documents (no doc filter)
  // ==========================================================================

  describe('Test 3: retrieveLessonContext handles empty primary_documents correctly', () => {
    it('should call searchChunks WITHOUT document_ids filter when primary_documents is empty', async () => {
      const section = createTestSection();
      const input = createTestJobInput();
      const specs = convertSectionToV2Specs(section, 0, input);
      const lessonSpec = specs[0];

      // Verify the spec has empty primary_documents
      expect(lessonSpec.rag_context.primary_documents).toEqual([]);

      const result = await retrieveLessonContext({
        courseId: '00000000-0000-0000-0000-000000000001',
        lessonSpec,
        useCache: false,
      });

      expect(result).toBeDefined();
      expect(result.lessonId).toBe(lessonSpec.lesson_id);

      // Verify searchChunks was called at least once
      expect(mockedSearchChunks).toHaveBeenCalled();

      // Verify NONE of the searchChunks calls included document_ids filter
      for (const call of mockedSearchChunks.mock.calls) {
        const options = call[1];
        expect(options?.filters?.document_ids).toBeUndefined();
      }
    });

    it('should search ALL course documents when primary_documents is empty', async () => {
      const section = createTestSection();
      const input = createTestJobInput();
      const specs = convertSectionToV2Specs(section, 0, input);
      const lessonSpec = specs[0];

      await retrieveLessonContext({
        courseId: 'test-course-id-for-all-docs',
        lessonSpec,
        useCache: false,
      });

      // Verify course_id filter is present but no document_ids
      for (const call of mockedSearchChunks.mock.calls) {
        const options = call[1];
        expect(options?.filters?.course_id).toBe('test-course-id-for-all-docs');
        expect(options?.filters?.document_ids).toBeUndefined();
      }
    });

    it('should return empty result when course has no indexed documents', async () => {
      mockedCheckDocs.mockResolvedValue(false);

      const section = createTestSection();
      const input = createTestJobInput();
      const specs = convertSectionToV2Specs(section, 0, input);
      const lessonSpec = specs[0];

      const result = await retrieveLessonContext({
        courseId: '00000000-0000-0000-0000-000000000001',
        lessonSpec,
        useCache: false,
      });

      expect(result.chunks).toEqual([]);
      expect(result.totalRetrieved).toBe(0);
      expect(result.cached).toBe(false);

      // searchChunks should NOT have been called
      expect(mockedSearchChunks).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Test 4: Stage 6 retriever with non-empty primary_documents filters correctly
  // ==========================================================================

  describe('Test 4: retrieveLessonContext with non-empty primary_documents filters correctly', () => {
    it('should call searchChunks WITH document_ids filter when primary_documents is populated', async () => {
      const targetDocIds = [
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
      ];

      const lessonSpec: LessonSpecificationV2 = {
        lesson_id: '1.1',
        title: 'Test Lesson with document filtering',
        description: 'A test lesson that verifies document-scoped RAG retrieval works correctly.',
        metadata: {
          target_audience: 'practitioner',
          tone: 'conversational-professional',
          compliance_level: 'standard',
          content_archetype: 'concept_explainer',
        },
        learning_objectives: [
          {
            id: 'LO-1.1.1',
            objective: 'Understand ML fundamentals for practical applications',
            bloom_level: 'understand',
          },
        ],
        intro_blueprint: {
          hook_strategy: 'question',
          hook_topic: 'ML Fundamentals',
          key_learning_objectives: 'Understand ML fundamentals for practical applications',
        },
        sections: [
          {
            title: 'ML Fundamentals',
            content_archetype: 'concept_explainer',
            rag_context_id: '1',
            constraints: { depth: 'detailed_analysis', required_keywords: [], prohibited_terms: [] },
            key_points_to_cover: ['ML fundamentals overview'],
          },
        ],
        exercises: [],
        rag_context: {
          primary_documents: targetDocIds,
          search_queries: ['Machine Learning fundamentals'],
          expected_chunks: 7,
        },
        estimated_duration_minutes: 10,
        difficulty_level: 'beginner',
      };

      mockedSearchChunks.mockImplementation((query: string) =>
        Promise.resolve(createMockSearchResponse(query, 3, targetDocIds))
      );

      await retrieveLessonContext({
        courseId: '00000000-0000-0000-0000-000000000001',
        lessonSpec,
        useCache: false,
      });

      expect(mockedSearchChunks).toHaveBeenCalled();

      // Verify ALL searchChunks calls include document_ids filter
      for (const call of mockedSearchChunks.mock.calls) {
        const options = call[1];
        expect(options?.filters?.document_ids).toEqual(targetDocIds);
      }
    });

    it('should NOT filter by documents when primary_documents has exactly zero entries', async () => {
      const lessonSpecEmpty: LessonSpecificationV2 = {
        lesson_id: '2.1',
        title: 'Test Lesson without document filtering',
        description: 'A test lesson that verifies empty primary_documents means no document filtering.',
        metadata: {
          target_audience: 'practitioner',
          tone: 'conversational-professional',
          compliance_level: 'standard',
          content_archetype: 'concept_explainer',
        },
        learning_objectives: [
          {
            id: 'LO-2.1.1',
            objective: 'Analyze data structures and algorithms for performance optimization',
            bloom_level: 'analyze',
          },
        ],
        intro_blueprint: {
          hook_strategy: 'challenge',
          hook_topic: 'Data Structures',
          key_learning_objectives: 'Analyze data structures and algorithms for performance optimization',
        },
        sections: [
          {
            title: 'Data Structures',
            content_archetype: 'concept_explainer',
            rag_context_id: '2',
            constraints: { depth: 'detailed_analysis', required_keywords: [], prohibited_terms: [] },
            key_points_to_cover: ['Data structures overview'],
          },
        ],
        exercises: [],
        rag_context: {
          primary_documents: [], // Empty = search all
          search_queries: ['data structures algorithms'],
          expected_chunks: 7,
        },
        estimated_duration_minutes: 10,
        difficulty_level: 'intermediate',
      };

      await retrieveLessonContext({
        courseId: '00000000-0000-0000-0000-000000000001',
        lessonSpec: lessonSpecEmpty,
        useCache: false,
      });

      for (const call of mockedSearchChunks.mock.calls) {
        const options = call[1];
        expect(options?.filters?.document_ids).toBeUndefined();
      }
    });
  });

  // ==========================================================================
  // Test 5: Full pipeline: Stage 5 output -> Stage 6 queries -> no doc filter
  // ==========================================================================

  describe('Test 5: Full pipeline end-to-end', () => {
    it('should produce meaningful queries from Stage 5 output and skip document filtering', async () => {
      // Step 1: Generate specs via Stage 5
      const section = createTestSection();
      const input = createTestJobInput();
      const specs = convertSectionToV2Specs(section, 0, input);

      expect(specs.length).toBe(2);
      const lessonSpec = specs[0];

      // Step 2: Verify Stage 5 output integrity
      expect(lessonSpec.rag_context.primary_documents).toEqual([]);
      expect(lessonSpec.rag_context.search_queries.length).toBeGreaterThan(0);
      expect(lessonSpec.rag_context.expected_chunks).toBe(7);

      // Step 3: Feed spec to buildLessonQueries
      const queries = buildLessonQueries(lessonSpec);
      expect(queries.length).toBeGreaterThan(0);

      // Queries should be meaningful (not generic placeholders)
      for (const query of queries) {
        expect(query.length).toBeGreaterThan(5);
      }

      // Step 4: Verify retriever would NOT filter by documents
      await retrieveLessonContext({
        courseId: '00000000-0000-0000-0000-000000000001',
        lessonSpec,
        useCache: false,
      });

      // Verify no document filtering was applied
      for (const call of mockedSearchChunks.mock.calls) {
        const options = call[1];
        expect(options?.filters?.document_ids).toBeUndefined();
        expect(options?.filters?.course_id).toBe('00000000-0000-0000-0000-000000000001');
      }
    });

    it('should handle the complete pipeline for all lessons in a section', async () => {
      const section = createTestSection();
      const input = createTestJobInput();
      const specs = convertSectionToV2Specs(section, 0, input);

      // Process all lessons
      for (const lessonSpec of specs) {
        // Verify RAG context
        expect(lessonSpec.rag_context.primary_documents).toEqual([]);
        expect(lessonSpec.rag_context.search_queries.length).toBeGreaterThan(0);

        // Build queries
        const queries = buildLessonQueries(lessonSpec);
        expect(queries.length).toBeGreaterThan(0);
        expect(queries.length).toBeLessThanOrEqual(10);

        // Retrieve context
        vi.clearAllMocks();
        mockedCheckDocs.mockResolvedValue(true);
        mockedSearchChunks.mockImplementation((query: string) =>
          Promise.resolve(createMockSearchResponse(query))
        );

        const result = await retrieveLessonContext({
          courseId: '00000000-0000-0000-0000-000000000001',
          lessonSpec,
          useCache: false,
        });

        expect(result.lessonId).toBe(lessonSpec.lesson_id);
        expect(result.chunks.length).toBeGreaterThan(0);
        expect(result.cached).toBe(false);

        // No document filtering
        for (const call of mockedSearchChunks.mock.calls) {
          const options = call[1];
          expect(options?.filters?.document_ids).toBeUndefined();
        }
      }
    });

    it('should produce different lesson_ids for different lessons', () => {
      const section = createTestSection();
      const input = createTestJobInput();
      const specs = convertSectionToV2Specs(section, 0, input);

      const lessonIds = specs.map(s => s.lesson_id);
      const uniqueIds = new Set(lessonIds);
      expect(uniqueIds.size).toBe(lessonIds.length);

      // sectionIndex=0 so IDs should be "1.1", "1.2"
      expect(lessonIds).toEqual(['1.1', '1.2']);
    });

    it('should include inter-lesson context when allSections is provided', () => {
      const section = createTestSection();
      const input = createTestJobInput();

      // Pass allSections to enable inter-lesson context
      const specs = convertSectionToV2Specs(section, 0, input, [section]);

      // Second lesson should have previous_lesson context
      expect(specs[1].lesson_context).toBeDefined();
      expect(specs[1].lesson_context?.previous_lesson).toBeDefined();
      expect(specs[1].lesson_context?.previous_lesson?.title).toBe('What is Machine Learning');

      // First lesson should have next_lesson context
      expect(specs[0].lesson_context).toBeDefined();
      expect(specs[0].lesson_context?.next_lesson).toBeDefined();
      expect(specs[0].lesson_context?.next_lesson?.title).toBe('Supervised Learning Algorithms');
    });

    it('should generate queries that combine section-level and lesson-level data', () => {
      const section = createTestSection();
      const input = createTestJobInput();
      const specs = convertSectionToV2Specs(section, 0, input);

      const lessonSpec = specs[0]; // "What is Machine Learning"
      const queries = buildLessonQueries(lessonSpec);

      // Should have section-level queries (from rag_context.search_queries via buildFallbackSearchQueries)
      const hasAreaQuery = queries.some(q => q.includes('Machine Learning Fundamentals'));
      expect(hasAreaQuery).toBe(true);

      // Should have lesson-level queries (from learning objectives)
      const hasObjectiveQuery = queries.some(q =>
        q.includes('core concepts of machine learning')
      );
      expect(hasObjectiveQuery).toBe(true);

      // Should have key_points (from sections -> key_points_to_cover)
      const hasKeyPoint = queries.some(q =>
        q.includes('Machine Learning definition')
      );
      expect(hasKeyPoint).toBe(true);
    });
  });
});
