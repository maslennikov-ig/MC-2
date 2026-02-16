/**
 * Unit Tests for phase3-v2-spec-generator.ts buildRAGContext
 *
 * Tests the private buildRAGContext method in V2SpecGenerator class.
 * This method was recently fixed to remove the 'default-course-document' sentinel
 * and properly handle RAG context generation (mc2-g5bc).
 *
 * Test Coverage:
 * 1. Empty primary_documents (never ['default-course-document'])
 * 2. Use sectionBreakdown.area + key_topics for fallback queries
 * 3. Fallback to topic + 'fundamentals' when no section breakdown
 * 4. Handle existing ragPlan correctly
 * 5. expected_chunks based on confidence level
 * 6. Search query fallback strategy
 *
 * @module tests/unit/stage5/phase3-v2-spec-generator-rag.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { V2LessonSpecGenerator } from '@/stages/stage5-generation/phases/phase3-v2-spec-generator';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';

// Mock logger
vi.mock('@/shared/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock semantic scaffolding (not under test)
vi.mock('@/stages/stage5-generation/utils/semantic-scaffolding', () => ({
  inferSemanticScaffolding: vi.fn(() => ({
    contentArchetype: 'concept_explainer',
    hookStrategy: 'question',
    depth: 'detailed_analysis',
    targetAudience: 'practitioner',
  })),
}));

describe('V2SpecGenerator buildRAGContext - No document_relevance_mapping', () => {
  let generator: V2LessonSpecGenerator;

  beforeEach(() => {
    generator = new V2LessonSpecGenerator();
    vi.clearAllMocks();
  });

  it('should return empty primary_documents when no ragPlan exists', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [
          {
            section_id: '1',
            area: 'Introduction to ML',
            key_topics: ['Supervised Learning', 'Unsupervised Learning'],
            learning_objectives: ['Understand ML basics'],
            estimated_lessons: 3,
          },
        ],
      },
      // No document_relevance_mapping
    } as any;

    // Access private method using 'as any' pattern
    const result = (generator as any).buildRAGContext('1', analysisResult);

    expect(result.primary_documents).toEqual([]);
    expect(result.primary_documents).not.toContain('default-course-document');
  });

  it('should return default query when no ragPlan and no fallback needed', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [
          {
            section_id: '1',
            area: 'Introduction to ML',
            key_topics: ['Supervised Learning', 'Unsupervised Learning', 'Deep Learning'],
            learning_objectives: ['Understand ML basics'],
            estimated_lessons: 3,
          },
        ],
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    // When no ragPlan, uses default: "${topic} section ${id}"
    // This passes length check (>= 3), so no fallback to section breakdown
    expect(result.search_queries).toEqual(['Machine Learning section 1']);
  });

  it('should slice only first 3 key_topics when fallback is triggered by short query', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [
          {
            section_id: '1',
            area: 'Introduction to ML',
            key_topics: ['Topic 1', 'Topic 2', 'Topic 3', 'Topic 4', 'Topic 5'],
            learning_objectives: ['Understand ML basics'],
            estimated_lessons: 3,
          },
        ],
      },
      document_relevance_mapping: {
        '1': {
          search_queries: ['ab'], // Short query (< 3 chars), triggers fallback
          confidence: 'low',
        },
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    // Fallback to section breakdown triggered
    expect(result.search_queries).toEqual([
      'Introduction to ML',
      'Topic 1',
      'Topic 2',
      'Topic 3',
    ]);
    expect(result.search_queries).toHaveLength(4); // area + 3 topics
  });

  it('should use default query when no section breakdown exists', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [], // No sections
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    // Uses default "${topic} section ${id}" which passes length check
    expect(result.search_queries).toEqual(['Machine Learning section 1']);
  });

  it('should set expected_chunks to 7 when no ragPlan exists', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [
          {
            section_id: '1',
            area: 'Introduction to ML',
            key_topics: ['Supervised Learning'],
            learning_objectives: ['Understand ML basics'],
            estimated_lessons: 3,
          },
        ],
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    expect(result.expected_chunks).toBe(7);
  });
});

describe('V2SpecGenerator buildRAGContext - With document_relevance_mapping', () => {
  let generator: V2LessonSpecGenerator;

  beforeEach(() => {
    generator = new V2LessonSpecGenerator();
    vi.clearAllMocks();
  });

  it('should use ragPlan.primary_documents when available', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [
          {
            section_id: '1',
            area: 'Introduction to ML',
            key_topics: ['Supervised Learning'],
            learning_objectives: ['Understand ML basics'],
            estimated_lessons: 3,
          },
        ],
      },
      document_relevance_mapping: {
        '1': {
          primary_documents: ['doc-123', 'doc-456'],
          search_queries: ['supervised learning basics'],
          confidence: 'high',
        },
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    expect(result.primary_documents).toEqual(['doc-123', 'doc-456']);
  });

  it('should return empty primary_documents when ragPlan.primary_documents is empty', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [
          {
            section_id: '1',
            area: 'Introduction to ML',
            key_topics: ['Supervised Learning'],
            learning_objectives: ['Understand ML basics'],
            estimated_lessons: 3,
          },
        ],
      },
      document_relevance_mapping: {
        '1': {
          primary_documents: [], // Empty
          search_queries: ['supervised learning'],
          confidence: 'medium',
        },
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    expect(result.primary_documents).toEqual([]);
    expect(result.primary_documents).not.toContain('default-course-document');
  });

  it('should use ragPlan.search_queries when available', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [
          {
            section_id: '1',
            area: 'Introduction to ML',
            key_topics: ['Supervised Learning'],
            learning_objectives: ['Understand ML basics'],
            estimated_lessons: 3,
          },
        ],
      },
      document_relevance_mapping: {
        '1': {
          primary_documents: ['doc-123'],
          search_queries: ['supervised learning', 'classification algorithms'],
          confidence: 'high',
        },
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    expect(result.search_queries).toEqual(['supervised learning', 'classification algorithms']);
  });

  it('should fallback to key_search_terms when search_queries is empty or undefined', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [
          {
            section_id: '1',
            area: 'Introduction to ML',
            key_topics: ['Supervised Learning'],
            learning_objectives: ['Understand ML basics'],
            estimated_lessons: 3,
          },
        ],
      },
      document_relevance_mapping: {
        '1': {
          primary_documents: ['doc-123'],
          // search_queries: undefined (not set)
          key_search_terms: ['machine learning', 'supervised'], // Legacy field
          confidence: 'medium',
        },
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    expect(result.search_queries).toEqual(['machine learning', 'supervised']);
  });

  it('should fallback to topic + section id when both search_queries and key_search_terms are missing', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [
          {
            section_id: '1',
            area: 'Introduction to ML',
            key_topics: ['Supervised Learning'],
            learning_objectives: ['Understand ML basics'],
            estimated_lessons: 3,
          },
        ],
      },
      document_relevance_mapping: {
        '1': {
          primary_documents: ['doc-123'],
          // No search_queries or key_search_terms
          confidence: 'low',
        },
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    expect(result.search_queries).toEqual(['Machine Learning section 1']);
  });

  it('should set expected_chunks to 10 for high confidence', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [
          {
            section_id: '1',
            area: 'Introduction to ML',
            key_topics: ['Supervised Learning'],
            learning_objectives: ['Understand ML basics'],
            estimated_lessons: 3,
          },
        ],
      },
      document_relevance_mapping: {
        '1': {
          primary_documents: ['doc-123'],
          search_queries: ['supervised learning'],
          confidence: 'high',
        },
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    expect(result.expected_chunks).toBe(10);
  });

  it('should set expected_chunks to 7 for medium confidence', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [
          {
            section_id: '1',
            area: 'Introduction to ML',
            key_topics: ['Supervised Learning'],
            learning_objectives: ['Understand ML basics'],
            estimated_lessons: 3,
          },
        ],
      },
      document_relevance_mapping: {
        '1': {
          primary_documents: ['doc-123'],
          search_queries: ['supervised learning'],
          confidence: 'medium',
        },
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    expect(result.expected_chunks).toBe(7);
  });

  it('should set expected_chunks to 7 for low confidence', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [
          {
            section_id: '1',
            area: 'Introduction to ML',
            key_topics: ['Supervised Learning'],
            learning_objectives: ['Understand ML basics'],
            estimated_lessons: 3,
          },
        ],
      },
      document_relevance_mapping: {
        '1': {
          primary_documents: ['doc-123'],
          search_queries: ['supervised learning'],
          confidence: 'low',
        },
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    expect(result.expected_chunks).toBe(7);
  });

  it('should set expected_chunks to 7 when confidence is undefined', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [
          {
            section_id: '1',
            area: 'Introduction to ML',
            key_topics: ['Supervised Learning'],
            learning_objectives: ['Understand ML basics'],
            estimated_lessons: 3,
          },
        ],
      },
      document_relevance_mapping: {
        '1': {
          primary_documents: ['doc-123'],
          search_queries: ['supervised learning'],
          // No confidence field
        },
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    expect(result.expected_chunks).toBe(7);
  });
});

describe('V2SpecGenerator buildRAGContext - Search query fallback strategy', () => {
  let generator: V2LessonSpecGenerator;

  beforeEach(() => {
    generator = new V2LessonSpecGenerator();
    vi.clearAllMocks();
  });

  it('should use search_queries when length >= 3 (good quality)', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [
          {
            section_id: '1',
            area: 'Introduction to ML',
            key_topics: ['Supervised Learning'],
            learning_objectives: ['Understand ML basics'],
            estimated_lessons: 3,
          },
        ],
      },
      document_relevance_mapping: {
        '1': {
          primary_documents: [],
          search_queries: ['good query'], // Length >= 3
          confidence: 'medium',
        },
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    expect(result.search_queries).toEqual(['good query']);
  });

  it('should fallback to sectionBreakdown when search_queries has length < 3', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [
          {
            section_id: '1',
            area: 'Introduction to ML',
            key_topics: ['Supervised Learning', 'Classification'],
            learning_objectives: ['Understand ML basics'],
            estimated_lessons: 3,
          },
        ],
      },
      document_relevance_mapping: {
        '1': {
          primary_documents: [],
          search_queries: ['ab'], // Length < 3, poor quality
          confidence: 'medium',
        },
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    // Should fallback to section breakdown
    expect(result.search_queries).toEqual([
      'Introduction to ML',
      'Supervised Learning',
      'Classification',
    ]);
  });

  it('should use section breakdown when triggered by short query', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [
          {
            section_id: '1',
            area: 'Introduction to ML',
            key_topics: ['Supervised Learning', 'Classification', 'Regression'],
            learning_objectives: ['Understand ML basics'],
            estimated_lessons: 3,
          },
        ],
      },
      document_relevance_mapping: {
        '1': {
          search_queries: ['ab'], // Short query triggers fallback
          confidence: 'low',
        },
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    expect(result.search_queries).toEqual([
      'Introduction to ML',
      'Supervised Learning',
      'Classification',
      'Regression',
    ]);
  });

  it('should use default query when section not found', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [
          {
            section_id: '2', // Different ID
            area: 'Advanced ML',
            key_topics: ['Neural Networks'],
            learning_objectives: ['Understand neural networks'],
            estimated_lessons: 3,
          },
        ],
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult); // Looking for '1'

    // Uses default "${topic} section ${id}" which passes length check
    expect(result.search_queries).toEqual(['Machine Learning section 1']);
  });
});

describe('V2SpecGenerator buildRAGContext - Edge cases', () => {
  let generator: V2LessonSpecGenerator;

  beforeEach(() => {
    generator = new V2LessonSpecGenerator();
    vi.clearAllMocks();
  });

  it('should handle section_id as string', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [
          {
            section_id: '1', // String ID
            area: 'Introduction to ML',
            key_topics: ['Supervised Learning'],
            learning_objectives: ['Understand ML basics'],
            estimated_lessons: 3,
          },
        ],
      },
      document_relevance_mapping: {
        '1': {
          primary_documents: ['doc-123'],
          search_queries: ['supervised learning'],
          confidence: 'high',
        },
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    expect(result.primary_documents).toEqual(['doc-123']);
    expect(result.search_queries).toEqual(['supervised learning']);
  });

  it('should handle multiple sections with different IDs', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [
          {
            section_id: '1',
            area: 'Introduction to ML',
            key_topics: ['Supervised Learning'],
            learning_objectives: ['Understand ML basics'],
            estimated_lessons: 3,
          },
          {
            section_id: '2',
            area: 'Advanced ML',
            key_topics: ['Neural Networks'],
            learning_objectives: ['Build neural networks'],
            estimated_lessons: 3,
          },
        ],
      },
      document_relevance_mapping: {
        '1': {
          primary_documents: ['doc-123'],
          search_queries: ['supervised learning'],
          confidence: 'high',
        },
        '2': {
          primary_documents: ['doc-456'],
          search_queries: ['neural networks'],
          confidence: 'medium',
        },
      },
    } as any;

    const result1 = (generator as any).buildRAGContext('1', analysisResult);
    const result2 = (generator as any).buildRAGContext('2', analysisResult);

    expect(result1.primary_documents).toEqual(['doc-123']);
    expect(result1.search_queries).toEqual(['supervised learning']);
    expect(result1.expected_chunks).toBe(10); // high

    expect(result2.primary_documents).toEqual(['doc-456']);
    expect(result2.search_queries).toEqual(['neural networks']);
    expect(result2.expected_chunks).toBe(7); // medium
  });

  it('should never return "default-course-document" sentinel', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: [],
      },
      document_relevance_mapping: {
        '1': {
          primary_documents: [],
          search_queries: [],
          confidence: 'low',
        },
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    expect(result.primary_documents).toEqual([]);
    expect(result.primary_documents).not.toContain('default-course-document');
    expect(result.primary_documents).not.toContain('default');
  });

  it('should handle null recommended_structure gracefully', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: null as any,
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    expect(result.primary_documents).toEqual([]);
    // Uses default query since sections_breakdown is null
    expect(result.search_queries).toEqual(['Machine Learning section 1']);
    expect(result.expected_chunks).toBe(7);
  });

  it('should handle undefined sections_breakdown gracefully', () => {
    const analysisResult: AnalysisResult = {
      topic_analysis: {
        determined_topic: 'Machine Learning',
      },
      recommended_structure: {
        sections_breakdown: undefined as any,
      },
    } as any;

    const result = (generator as any).buildRAGContext('1', analysisResult);

    expect(result.primary_documents).toEqual([]);
    // Uses default query since sections_breakdown is undefined
    expect(result.search_queries).toEqual(['Machine Learning section 1']);
  });
});
