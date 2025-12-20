/**
 * Unit Tests for buildMinimalLessonSpec (lesson-content/helpers.ts)
 *
 * Tests the fallback logic for primary_documents and search_queries
 * when analysisResult parameter is undefined, missing section mapping,
 * or has empty arrays.
 *
 * Test Scenarios:
 * 1. Course without analysis_result (undefined)
 * 2. Course with analysis_result but no mapping for section
 * 3. Course with empty primary_documents array
 * 4. Course with valid primary_documents
 * 5. Course with valid search_queries
 * 6. Course with both valid primary_documents and search_queries
 * 7. Edge cases: empty key_topics, missing lesson_objectives
 *
 * @module tests/unit/helpers/build-minimal-lesson-spec.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildMinimalLessonSpec } from '@/server/routers/lesson-content/helpers';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';

// Mock logger
vi.mock('@/shared/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('buildMinimalLessonSpec', () => {
  const baseLesson = {
    lesson_title: 'Introduction to Machine Learning',
    lesson_objectives: ['Understand ML fundamentals', 'Learn basic algorithms'],
    key_topics: ['supervised learning', 'unsupervised learning', 'neural networks'],
    estimated_duration_minutes: 30,
    difficulty_level: 'intermediate' as const,
  };

  const lessonId = '1.1';
  const sectionNumber = 1;
  const requestId = 'req-test-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('primary_documents fallback logic', () => {
    it('should return empty primary_documents when analysisResult is undefined', () => {
      const spec = buildMinimalLessonSpec(
        lessonId,
        baseLesson,
        sectionNumber,
        requestId,
        undefined
      );

      expect(spec.rag_context.primary_documents).toEqual([]);
      expect(spec.rag_context.search_queries).toEqual(baseLesson.key_topics);
    });

    it('should return empty primary_documents when document_relevance_mapping is undefined', () => {
      const analysisResult = {
        // Missing document_relevance_mapping
        course_category: {
          primary: 'professional' as const,
          confidence: 0.9,
          reasoning: 'Test',
        },
      } as unknown as AnalysisResult;

      const spec = buildMinimalLessonSpec(
        lessonId,
        baseLesson,
        sectionNumber,
        requestId,
        analysisResult
      );

      expect(spec.rag_context.primary_documents).toEqual([]);
      expect(spec.rag_context.search_queries).toEqual(baseLesson.key_topics);
    });

    it('should return empty primary_documents when section mapping does not exist', () => {
      const analysisResult = {
        document_relevance_mapping: {
          '2': {
            // Section 2, not Section 1
            primary_documents: ['doc-uuid-1', 'doc-uuid-2'],
            search_queries: ['query1', 'query2'],
            expected_topics: ['topic1'],
            confidence: 'high' as const,
          },
        },
      } as unknown as AnalysisResult;

      const spec = buildMinimalLessonSpec(
        lessonId,
        baseLesson,
        sectionNumber, // Section 1 (no mapping)
        requestId,
        analysisResult
      );

      expect(spec.rag_context.primary_documents).toEqual([]);
      expect(spec.rag_context.search_queries).toEqual(baseLesson.key_topics);
    });

    it('should return empty primary_documents when primary_documents array is empty', () => {
      const analysisResult = {
        document_relevance_mapping: {
          '1': {
            primary_documents: [], // Empty array
            search_queries: ['custom query 1', 'custom query 2'],
            expected_topics: ['topic1'],
            confidence: 'medium' as const,
          },
        },
      } as unknown as AnalysisResult;

      const spec = buildMinimalLessonSpec(
        lessonId,
        baseLesson,
        sectionNumber,
        requestId,
        analysisResult
      );

      expect(spec.rag_context.primary_documents).toEqual([]);
      // Should still use custom search_queries from mapping
      expect(spec.rag_context.search_queries).toEqual(['custom query 1', 'custom query 2']);
    });

    it('should use primary_documents when available in section mapping', () => {
      const analysisResult = {
        document_relevance_mapping: {
          '1': {
            primary_documents: [
              '550e8400-e29b-41d4-a716-446655440000',
              '550e8400-e29b-41d4-a716-446655440001',
            ],
            search_queries: ['machine learning basics', 'ML algorithms'],
            expected_topics: ['ML fundamentals'],
            confidence: 'high' as const,
          },
        },
      } as unknown as AnalysisResult;

      const spec = buildMinimalLessonSpec(
        lessonId,
        baseLesson,
        sectionNumber,
        requestId,
        analysisResult
      );

      expect(spec.rag_context.primary_documents).toEqual([
        '550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440001',
      ]);
      expect(spec.rag_context.search_queries).toEqual(['machine learning basics', 'ML algorithms']);
    });
  });

  describe('search_queries fallback logic', () => {
    it('should fallback to key_topics when search_queries is undefined', () => {
      const analysisResult = {
        document_relevance_mapping: {
          '1': {
            primary_documents: ['doc-uuid-1'],
            // Missing search_queries
            expected_topics: ['topic1'],
            confidence: 'high' as const,
          } as any, // Allow partial object for testing
        },
      } as unknown as AnalysisResult;

      const spec = buildMinimalLessonSpec(
        lessonId,
        baseLesson,
        sectionNumber,
        requestId,
        analysisResult
      );

      expect(spec.rag_context.search_queries).toEqual(baseLesson.key_topics);
    });

    it('should fallback to key_topics when search_queries is empty array', () => {
      const analysisResult = {
        document_relevance_mapping: {
          '1': {
            primary_documents: ['doc-uuid-1'],
            search_queries: [], // Empty array
            expected_topics: ['topic1'],
            confidence: 'high' as const,
          },
        },
      } as unknown as AnalysisResult;

      const spec = buildMinimalLessonSpec(
        lessonId,
        baseLesson,
        sectionNumber,
        requestId,
        analysisResult
      );

      expect(spec.rag_context.search_queries).toEqual(baseLesson.key_topics);
    });

    it('should use search_queries when available and non-empty', () => {
      const analysisResult = {
        document_relevance_mapping: {
          '1': {
            primary_documents: [],
            search_queries: ['advanced ML techniques', 'deep learning intro'],
            expected_topics: ['ML', 'DL'],
            confidence: 'high' as const,
          },
        },
      } as unknown as AnalysisResult;

      const spec = buildMinimalLessonSpec(
        lessonId,
        baseLesson,
        sectionNumber,
        requestId,
        analysisResult
      );

      expect(spec.rag_context.search_queries).toEqual(['advanced ML techniques', 'deep learning intro']);
    });

    it('should use empty array when key_topics is empty (not fallback to lesson_title)', () => {
      const lessonNoTopics = {
        lesson_title: 'Advanced Neural Networks',
        lesson_objectives: ['Learn neural networks'],
        key_topics: [], // Empty - remains empty (truthy in JS)
      };

      const spec = buildMinimalLessonSpec(
        lessonId,
        lessonNoTopics,
        sectionNumber,
        requestId,
        undefined
      );

      // Empty array is truthy, so no fallback happens
      expect(spec.rag_context.search_queries).toEqual([]);
    });

    it('should fallback to lesson_title when key_topics is undefined', () => {
      const lessonNoTopics = {
        lesson_title: 'Deep Learning Basics',
        lesson_objectives: ['Learn deep learning'],
        // key_topics is undefined
      };

      const spec = buildMinimalLessonSpec(
        lessonId,
        lessonNoTopics,
        sectionNumber,
        requestId,
        undefined
      );

      expect(spec.rag_context.search_queries).toEqual(['Deep Learning Basics']);
    });
  });

  describe('complete LessonSpecificationV2 validation', () => {
    it('should return valid LessonSpecificationV2 structure', () => {
      const spec = buildMinimalLessonSpec(
        lessonId,
        baseLesson,
        sectionNumber,
        requestId,
        undefined
      );

      // Validate structure
      expect(spec.lesson_id).toBe(lessonId);
      expect(spec.title).toBe(baseLesson.lesson_title);
      expect(spec.description).toBe(baseLesson.lesson_objectives[0]);
      expect(spec.metadata).toBeDefined();
      expect(spec.metadata.target_audience).toBe('practitioner');
      expect(spec.metadata.tone).toBe('conversational-professional');
      expect(spec.metadata.compliance_level).toBe('standard');
      expect(spec.metadata.content_archetype).toBe('concept_explainer');

      expect(spec.learning_objectives).toBeDefined();
      expect(spec.learning_objectives).toHaveLength(2);
      expect(spec.learning_objectives[0].id).toBe('LO-1.1-1');
      expect(spec.learning_objectives[0].objective).toBe('Understand ML fundamentals');
      expect(spec.learning_objectives[0].bloom_level).toBe('understand');

      expect(spec.intro_blueprint).toBeDefined();
      expect(spec.intro_blueprint.hook_strategy).toBe('question');
      expect(spec.intro_blueprint.hook_topic).toBe(baseLesson.lesson_title);

      expect(spec.sections).toBeDefined();
      expect(spec.sections).toHaveLength(1);
      expect(spec.sections[0].title).toBe('Main Content');
      expect(spec.sections[0].content_archetype).toBe('concept_explainer');
      expect(spec.sections[0].rag_context_id).toBe('default');
      expect(spec.sections[0].constraints.required_keywords).toEqual(baseLesson.key_topics);
      expect(spec.sections[0].key_points_to_cover).toHaveLength(3);

      expect(spec.exercises).toEqual([]);
      expect(spec.rag_context).toBeDefined();
      expect(spec.rag_context.expected_chunks).toBe(7);
      expect(spec.estimated_duration_minutes).toBe(30);
      expect(spec.difficulty_level).toBe('intermediate');
    });

    it('should use default values when optional fields are missing', () => {
      const minimalLesson = {
        lesson_title: 'Minimal Lesson',
        // No objectives, topics, duration, difficulty
      };

      const spec = buildMinimalLessonSpec(
        lessonId,
        minimalLesson,
        sectionNumber,
        requestId,
        undefined
      );

      // Default learning objectives
      expect(spec.learning_objectives).toHaveLength(1);
      expect(spec.learning_objectives[0].objective).toBe('Complete this lesson');

      // Default key points (from lesson_title)
      expect(spec.sections[0].key_points_to_cover).toEqual(['Minimal Lesson']);
      expect(spec.sections[0].constraints.required_keywords).toEqual([]);

      // Default rag_context
      expect(spec.rag_context.primary_documents).toEqual([]);
      expect(spec.rag_context.search_queries).toEqual(['Minimal Lesson']);

      // Default metadata
      expect(spec.estimated_duration_minutes).toBe(15);
      expect(spec.difficulty_level).toBe('intermediate');
    });

    it('should create learning objectives with minimum length validation (>= 10 chars)', () => {
      const lessonShortObjectives = {
        lesson_title: 'Test Lesson',
        lesson_objectives: ['Short', 'Valid objective'], // 'Short' < 10, 'Valid objective' >= 10
        key_topics: ['topic'],
      };

      const spec = buildMinimalLessonSpec(
        lessonId,
        lessonShortObjectives,
        sectionNumber,
        requestId,
        undefined
      );

      // First objective should be augmented (< 10 chars)
      expect(spec.learning_objectives[0].objective).toBe('Learn about Test Lesson');
      // Second objective should remain as-is (>= 10 chars)
      expect(spec.learning_objectives[1].objective).toBe('Valid objective');
    });

    it('should create key points with minimum length validation (>= 5 chars)', () => {
      const lessonShortTopics = {
        lesson_title: 'Data Science',
        key_topics: ['ML', 'AI', 'stats', 'python'], // 'ML' (2), 'AI' (2), 'stats' (5), 'python' (6)
      };

      const spec = buildMinimalLessonSpec(
        lessonId,
        lessonShortTopics,
        sectionNumber,
        requestId,
        undefined
      );

      // Topics < 5 chars get augmented, >= 5 remain as-is
      expect(spec.sections[0].key_points_to_cover).toEqual([
        'Introduction to ML',
        'Introduction to AI',
        'stats', // Exactly 5 chars, stays as-is
        'python', // 6 chars, stays as-is
      ]);
    });
  });

  describe('section number string conversion', () => {
    it('should handle section number as numeric string in mapping', () => {
      const analysisResult = {
        document_relevance_mapping: {
          '3': {
            // Section 3 as string
            primary_documents: ['doc-uuid-section-3'],
            search_queries: ['section 3 query'],
            expected_topics: ['topic3'],
            confidence: 'high' as const,
          },
        },
      } as unknown as AnalysisResult;

      const spec = buildMinimalLessonSpec(
        '3.1',
        baseLesson,
        3, // Section 3 as number
        requestId,
        analysisResult
      );

      expect(spec.rag_context.primary_documents).toEqual(['doc-uuid-section-3']);
      expect(spec.rag_context.search_queries).toEqual(['section 3 query']);
    });

    it('should handle multiple sections in mapping', () => {
      const analysisResult = {
        document_relevance_mapping: {
          '1': {
            primary_documents: ['doc-s1-1'],
            search_queries: ['section 1'],
            expected_topics: ['s1'],
            confidence: 'high' as const,
          },
          '2': {
            primary_documents: ['doc-s2-1', 'doc-s2-2'],
            search_queries: ['section 2'],
            expected_topics: ['s2'],
            confidence: 'medium' as const,
          },
        },
      } as unknown as AnalysisResult;

      // Section 1
      const spec1 = buildMinimalLessonSpec('1.1', baseLesson, 1, requestId, analysisResult);
      expect(spec1.rag_context.primary_documents).toEqual(['doc-s1-1']);

      // Section 2
      const spec2 = buildMinimalLessonSpec('2.1', baseLesson, 2, requestId, analysisResult);
      expect(spec2.rag_context.primary_documents).toEqual(['doc-s2-1', 'doc-s2-2']);
    });
  });

  describe('edge cases and boundary conditions', () => {
    it('should handle null lesson_objectives', () => {
      const lessonNullObjectives = {
        lesson_title: 'Test',
        lesson_objectives: null as any,
        key_topics: ['topic1'],
      };

      const spec = buildMinimalLessonSpec(
        lessonId,
        lessonNullObjectives,
        sectionNumber,
        requestId,
        undefined
      );

      expect(spec.learning_objectives).toHaveLength(1);
      expect(spec.learning_objectives[0].objective).toBe('Complete this lesson');
    });

    it('should handle null key_topics', () => {
      const lessonNullTopics = {
        lesson_title: 'Lesson Title',
        lesson_objectives: ['objective1'],
        key_topics: null as any,
      };

      const spec = buildMinimalLessonSpec(
        lessonId,
        lessonNullTopics,
        sectionNumber,
        requestId,
        undefined
      );

      expect(spec.sections[0].key_points_to_cover).toEqual(['Lesson Title']);
      expect(spec.rag_context.search_queries).toEqual(['Lesson Title']);
    });

    it('should handle very long lesson_title gracefully', () => {
      const longTitle = 'A'.repeat(500);
      const lessonLongTitle = {
        lesson_title: longTitle,
      };

      const spec = buildMinimalLessonSpec(
        lessonId,
        lessonLongTitle,
        sectionNumber,
        requestId,
        undefined
      );

      expect(spec.title).toBe(longTitle);
      expect(spec.intro_blueprint.hook_topic).toBe(longTitle);
    });

    it('should handle special characters in lesson data', () => {
      const lessonSpecialChars = {
        lesson_title: 'C++ & <JavaScript>: "Advanced" Programming',
        lesson_objectives: ['Learn C++ syntax & features', 'Master <templates>'],
        key_topics: ['pointers & references', '<generics>', '"const" keyword'],
      };

      const spec = buildMinimalLessonSpec(
        lessonId,
        lessonSpecialChars,
        sectionNumber,
        requestId,
        undefined
      );

      expect(spec.title).toBe('C++ & <JavaScript>: "Advanced" Programming');
      expect(spec.learning_objectives[0].objective).toBe('Learn C++ syntax & features');
      expect(spec.sections[0].key_points_to_cover).toEqual([
        'pointers & references',
        '<generics>',
        '"const" keyword',
      ]);
    });

    it('should handle empty analysisResult document_relevance_mapping object', () => {
      const analysisResult = {
        document_relevance_mapping: {}, // Empty object, no sections
      } as unknown as AnalysisResult;

      const spec = buildMinimalLessonSpec(
        lessonId,
        baseLesson,
        sectionNumber,
        requestId,
        analysisResult
      );

      expect(spec.rag_context.primary_documents).toEqual([]);
      expect(spec.rag_context.search_queries).toEqual(baseLesson.key_topics);
    });
  });

  describe('description fallback logic', () => {
    it('should use first lesson_objective as description', () => {
      const lesson = {
        lesson_title: 'Test',
        lesson_objectives: ['First objective', 'Second objective'],
      };

      const spec = buildMinimalLessonSpec(lessonId, lesson, sectionNumber, requestId, undefined);

      expect(spec.description).toBe('First objective');
    });

    it('should fallback to generated description when no objectives', () => {
      const lesson = {
        lesson_title: 'Advanced TypeScript',
        lesson_objectives: [],
      };

      const spec = buildMinimalLessonSpec(lessonId, lesson, sectionNumber, requestId, undefined);

      expect(spec.description).toBe('This lesson covers Advanced TypeScript');
    });

    it('should fallback to generated description when objectives is undefined', () => {
      const lesson = {
        lesson_title: 'React Hooks',
      };

      const spec = buildMinimalLessonSpec(lessonId, lesson, sectionNumber, requestId, undefined);

      expect(spec.description).toBe('This lesson covers React Hooks');
    });
  });
});
