/**
 * Unit Tests for v2-converter.ts buildRAGContext
 *
 * Tests the buildRAGContext function through convertSectionToV2Specs.
 * This function was recently fixed to remove the 'default-course-document' sentinel
 * and properly handle RAG context generation (mc2-g5bc).
 *
 * Test Coverage:
 * 1. Empty primary_documents when document_relevance_mapping is missing
 * 2. Section-specific topics (area + key_topics) for search_queries
 * 3. Fallback to topic + section number when sections_breakdown missing
 * 4. Fallback to 'course' when determined_topic missing
 * 5. Use ragPlan data when document_relevance_mapping has entry
 * 6. Empty primary_documents when ragPlan.primary_documents is empty
 * 7. Use key_search_terms when search_queries empty
 * 8. expected_chunks=10 for high confidence, 7 otherwise
 *
 * @module tests/unit/stage5/v2-converter-rag.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { convertSectionToV2Specs } from '@/stages/stage5-generation/utils/section-batch/v2-converter';
import type { Section, GenerationJobInput } from '@megacampus/shared-types';

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

describe('v2-converter buildRAGContext - No document_relevance_mapping', () => {
  it('should return empty primary_documents when document_relevance_mapping is missing', () => {
    const section: Section = {
      section_number: 1,
      section_title: 'Introduction',
      section_description: 'Getting started',
      lessons: [
        {
          lesson_title: 'Lesson 1',
          lesson_objectives: ['Learn basics'],
          key_topics: ['Topic 1'],
        },
      ],
    };

    const input: GenerationJobInput = {
      course_id: 'course-123',
      analysis_result: {
        topic_analysis: {
          determined_topic: 'Machine Learning',
        },
        recommended_structure: {
          sections_breakdown: [
            {
              area: 'Introduction to ML',
              key_topics: ['Supervised Learning', 'Unsupervised Learning'],
              learning_objectives: ['Understand ML basics'],
            },
          ],
        },
        // No document_relevance_mapping
      } as any,
    };

    const result = convertSectionToV2Specs(section, 0, input);

    expect(result).toHaveLength(1);
    expect(result[0].rag_context.primary_documents).toEqual([]);
    expect(result[0].rag_context.primary_documents).not.toContain('default-course-document');
  });

  it('should use section-specific topics (area + key_topics) for search_queries', () => {
    const section: Section = {
      section_number: 1,
      section_title: 'Introduction',
      section_description: 'Getting started',
      lessons: [
        {
          lesson_title: 'Lesson 1',
          lesson_objectives: ['Learn basics'],
          key_topics: ['Topic 1'],
        },
      ],
    };

    const input: GenerationJobInput = {
      course_id: 'course-123',
      analysis_result: {
        topic_analysis: {
          determined_topic: 'Machine Learning',
        },
        recommended_structure: {
          sections_breakdown: [
            {
              area: 'Introduction to ML',
              key_topics: ['Supervised Learning', 'Unsupervised Learning', 'Deep Learning'],
              learning_objectives: ['Understand ML basics'],
            },
          ],
        },
      } as any,
    };

    const result = convertSectionToV2Specs(section, 0, input);

    expect(result).toHaveLength(1);
    expect(result[0].rag_context.search_queries).toEqual([
      'Introduction to ML',
      'Supervised Learning',
      'Unsupervised Learning',
      'Deep Learning',
    ]);
  });

  it('should fallback to topic + section number when sections_breakdown missing', () => {
    const section: Section = {
      section_number: 1,
      section_title: 'Introduction',
      section_description: 'Getting started',
      lessons: [
        {
          lesson_title: 'Lesson 1',
          lesson_objectives: ['Learn basics'],
          key_topics: ['Topic 1'],
        },
      ],
    };

    const input: GenerationJobInput = {
      course_id: 'course-123',
      analysis_result: {
        topic_analysis: {
          determined_topic: 'Machine Learning',
        },
        recommended_structure: {
          sections_breakdown: [], // Empty breakdown
        },
      } as any,
    };

    const result = convertSectionToV2Specs(section, 0, input);

    expect(result).toHaveLength(1);
    expect(result[0].rag_context.search_queries).toEqual(['Machine Learning section 1']);
  });

  it('should fallback to "course" when determined_topic is also missing', () => {
    const section: Section = {
      section_number: 1,
      section_title: 'Introduction',
      section_description: 'Getting started',
      lessons: [
        {
          lesson_title: 'Lesson 1',
          lesson_objectives: ['Learn basics'],
          key_topics: ['Topic 1'],
        },
      ],
    };

    const input: GenerationJobInput = {
      course_id: 'course-123',
      analysis_result: {
        topic_analysis: {
          determined_topic: undefined as any,
        },
        recommended_structure: {
          sections_breakdown: [],
        },
      } as any,
    };

    const result = convertSectionToV2Specs(section, 0, input);

    expect(result).toHaveLength(1);
    expect(result[0].rag_context.search_queries).toEqual(['course section 1']);
  });

  it('should set expected_chunks to 7 when no ragPlan exists', () => {
    const section: Section = {
      section_number: 1,
      section_title: 'Introduction',
      section_description: 'Getting started',
      lessons: [
        {
          lesson_title: 'Lesson 1',
          lesson_objectives: ['Learn basics'],
          key_topics: ['Topic 1'],
        },
      ],
    };

    const input: GenerationJobInput = {
      course_id: 'course-123',
      analysis_result: {
        topic_analysis: {
          determined_topic: 'Machine Learning',
        },
        recommended_structure: {
          sections_breakdown: [
            {
              area: 'Introduction to ML',
              key_topics: ['Supervised Learning'],
              learning_objectives: ['Understand ML basics'],
            },
          ],
        },
      } as any,
    };

    const result = convertSectionToV2Specs(section, 0, input);

    expect(result).toHaveLength(1);
    expect(result[0].rag_context.expected_chunks).toBe(7);
  });
});

describe('v2-converter buildRAGContext - With document_relevance_mapping', () => {
  it('should use ragPlan data when document_relevance_mapping has entry for section', () => {
    const section: Section = {
      section_number: 1,
      section_title: 'Introduction',
      section_description: 'Getting started',
      lessons: [
        {
          lesson_title: 'Lesson 1',
          lesson_objectives: ['Learn basics'],
          key_topics: ['Topic 1'],
        },
      ],
    };

    const input: GenerationJobInput = {
      course_id: 'course-123',
      analysis_result: {
        topic_analysis: {
          determined_topic: 'Machine Learning',
        },
        recommended_structure: {
          sections_breakdown: [
            {
              area: 'Introduction to ML',
              key_topics: ['Supervised Learning'],
              learning_objectives: ['Understand ML basics'],
            },
          ],
        },
        document_relevance_mapping: {
          '1': {
            primary_documents: ['doc-123', 'doc-456'],
            search_queries: ['supervised learning basics', 'ML introduction'],
            key_search_terms: ['machine learning', 'supervised'],
            confidence: 'high',
          },
        },
      } as any,
    };

    const result = convertSectionToV2Specs(section, 0, input);

    expect(result).toHaveLength(1);
    expect(result[0].rag_context.primary_documents).toEqual(['doc-123', 'doc-456']);
    expect(result[0].rag_context.search_queries).toEqual([
      'supervised learning basics',
      'ML introduction',
    ]);
    expect(result[0].rag_context.expected_chunks).toBe(10); // high confidence
  });

  it('should return empty primary_documents when ragPlan.primary_documents is empty', () => {
    const section: Section = {
      section_number: 1,
      section_title: 'Introduction',
      section_description: 'Getting started',
      lessons: [
        {
          lesson_title: 'Lesson 1',
          lesson_objectives: ['Learn basics'],
          key_topics: ['Topic 1'],
        },
      ],
    };

    const input: GenerationJobInput = {
      course_id: 'course-123',
      analysis_result: {
        topic_analysis: {
          determined_topic: 'Machine Learning',
        },
        recommended_structure: {
          sections_breakdown: [
            {
              area: 'Introduction to ML',
              key_topics: ['Supervised Learning'],
              learning_objectives: ['Understand ML basics'],
            },
          ],
        },
        document_relevance_mapping: {
          '1': {
            primary_documents: [], // Empty
            search_queries: ['supervised learning'],
            key_search_terms: ['machine learning'],
            confidence: 'medium',
          },
        },
      } as any,
    };

    const result = convertSectionToV2Specs(section, 0, input);

    expect(result).toHaveLength(1);
    expect(result[0].rag_context.primary_documents).toEqual([]);
    expect(result[0].rag_context.primary_documents).not.toContain('default-course-document');
  });

  it('should use key_search_terms when search_queries is empty', () => {
    const section: Section = {
      section_number: 1,
      section_title: 'Introduction',
      section_description: 'Getting started',
      lessons: [
        {
          lesson_title: 'Lesson 1',
          lesson_objectives: ['Learn basics'],
          key_topics: ['Topic 1'],
        },
      ],
    };

    const input: GenerationJobInput = {
      course_id: 'course-123',
      analysis_result: {
        topic_analysis: {
          determined_topic: 'Machine Learning',
        },
        recommended_structure: {
          sections_breakdown: [
            {
              area: 'Introduction to ML',
              key_topics: ['Supervised Learning'],
              learning_objectives: ['Understand ML basics'],
            },
          ],
        },
        document_relevance_mapping: {
          '1': {
            primary_documents: ['doc-123'],
            search_queries: [], // Empty
            key_search_terms: ['machine learning', 'supervised'], // Fallback
            confidence: 'medium',
          },
        },
      } as any,
    };

    const result = convertSectionToV2Specs(section, 0, input);

    expect(result).toHaveLength(1);
    expect(result[0].rag_context.search_queries).toEqual(['machine learning', 'supervised']);
  });

  it('should fallback to ["course content"] when both search_queries and key_search_terms are missing', () => {
    const section: Section = {
      section_number: 1,
      section_title: 'Introduction',
      section_description: 'Getting started',
      lessons: [
        {
          lesson_title: 'Lesson 1',
          lesson_objectives: ['Learn basics'],
          key_topics: ['Topic 1'],
        },
      ],
    };

    const input: GenerationJobInput = {
      course_id: 'course-123',
      analysis_result: {
        topic_analysis: {
          determined_topic: 'Machine Learning',
        },
        recommended_structure: {
          sections_breakdown: [
            {
              area: 'Introduction to ML',
              key_topics: ['Supervised Learning'],
              learning_objectives: ['Understand ML basics'],
            },
          ],
        },
        document_relevance_mapping: {
          '1': {
            primary_documents: ['doc-123'],
            // No search_queries or key_search_terms fields
            confidence: 'low',
          },
        },
      } as any,
    };

    const result = convertSectionToV2Specs(section, 0, input);

    expect(result).toHaveLength(1);
    expect(result[0].rag_context.search_queries).toEqual(['course content']);
  });

  it('should return empty search_queries when both fields are empty arrays', () => {
    const section: Section = {
      section_number: 1,
      section_title: 'Introduction',
      section_description: 'Getting started',
      lessons: [
        {
          lesson_title: 'Lesson 1',
          lesson_objectives: ['Learn basics'],
          key_topics: ['Topic 1'],
        },
      ],
    };

    const input: GenerationJobInput = {
      course_id: 'course-123',
      analysis_result: {
        topic_analysis: {
          determined_topic: 'Machine Learning',
        },
        recommended_structure: {
          sections_breakdown: [
            {
              area: 'Introduction to ML',
              key_topics: ['Supervised Learning'],
              learning_objectives: ['Understand ML basics'],
            },
          ],
        },
        document_relevance_mapping: {
          '1': {
            primary_documents: ['doc-123'],
            search_queries: [], // Empty array (truthy in JS)
            key_search_terms: [], // Empty array (truthy in JS)
            confidence: 'low',
          },
        },
      } as any,
    };

    const result = convertSectionToV2Specs(section, 0, input);

    expect(result).toHaveLength(1);
    // Empty arrays are truthy in JS, so [] || [] || ['course content'] = []
    expect(result[0].rag_context.search_queries).toEqual([]);
  });

  it('should set expected_chunks to 10 for high confidence', () => {
    const section: Section = {
      section_number: 1,
      section_title: 'Introduction',
      section_description: 'Getting started',
      lessons: [
        {
          lesson_title: 'Lesson 1',
          lesson_objectives: ['Learn basics'],
          key_topics: ['Topic 1'],
        },
      ],
    };

    const input: GenerationJobInput = {
      course_id: 'course-123',
      analysis_result: {
        topic_analysis: {
          determined_topic: 'Machine Learning',
        },
        recommended_structure: {
          sections_breakdown: [
            {
              area: 'Introduction to ML',
              key_topics: ['Supervised Learning'],
              learning_objectives: ['Understand ML basics'],
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
      } as any,
    };

    const result = convertSectionToV2Specs(section, 0, input);

    expect(result).toHaveLength(1);
    expect(result[0].rag_context.expected_chunks).toBe(10);
  });

  it('should set expected_chunks to 7 for medium confidence', () => {
    const section: Section = {
      section_number: 1,
      section_title: 'Introduction',
      section_description: 'Getting started',
      lessons: [
        {
          lesson_title: 'Lesson 1',
          lesson_objectives: ['Learn basics'],
          key_topics: ['Topic 1'],
        },
      ],
    };

    const input: GenerationJobInput = {
      course_id: 'course-123',
      analysis_result: {
        topic_analysis: {
          determined_topic: 'Machine Learning',
        },
        recommended_structure: {
          sections_breakdown: [
            {
              area: 'Introduction to ML',
              key_topics: ['Supervised Learning'],
              learning_objectives: ['Understand ML basics'],
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
      } as any,
    };

    const result = convertSectionToV2Specs(section, 0, input);

    expect(result).toHaveLength(1);
    expect(result[0].rag_context.expected_chunks).toBe(7);
  });

  it('should set expected_chunks to 7 for low confidence', () => {
    const section: Section = {
      section_number: 1,
      section_title: 'Introduction',
      section_description: 'Getting started',
      lessons: [
        {
          lesson_title: 'Lesson 1',
          lesson_objectives: ['Learn basics'],
          key_topics: ['Topic 1'],
        },
      ],
    };

    const input: GenerationJobInput = {
      course_id: 'course-123',
      analysis_result: {
        topic_analysis: {
          determined_topic: 'Machine Learning',
        },
        recommended_structure: {
          sections_breakdown: [
            {
              area: 'Introduction to ML',
              key_topics: ['Supervised Learning'],
              learning_objectives: ['Understand ML basics'],
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
      } as any,
    };

    const result = convertSectionToV2Specs(section, 0, input);

    expect(result).toHaveLength(1);
    expect(result[0].rag_context.expected_chunks).toBe(7);
  });
});

describe('v2-converter buildRAGContext - Edge cases', () => {
  it('should handle multiple lessons in a section (all share same RAG context)', () => {
    const section: Section = {
      section_number: 1,
      section_title: 'Introduction',
      section_description: 'Getting started',
      lessons: [
        {
          lesson_title: 'Lesson 1',
          lesson_objectives: ['Learn basics'],
          key_topics: ['Topic 1'],
        },
        {
          lesson_title: 'Lesson 2',
          lesson_objectives: ['Apply basics'],
          key_topics: ['Topic 2'],
        },
      ],
    };

    const input: GenerationJobInput = {
      course_id: 'course-123',
      analysis_result: {
        topic_analysis: {
          determined_topic: 'Machine Learning',
        },
        recommended_structure: {
          sections_breakdown: [
            {
              area: 'Introduction to ML',
              key_topics: ['Supervised Learning'],
              learning_objectives: ['Understand ML basics'],
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
      } as any,
    };

    const result = convertSectionToV2Specs(section, 0, input);

    expect(result).toHaveLength(2);
    // Both lessons share the same RAG context (section-level)
    expect(result[0].rag_context).toEqual(result[1].rag_context);
    expect(result[0].rag_context.primary_documents).toEqual(['doc-123']);
  });

  it('should slice only first 3 key_topics for fallback search_queries', () => {
    const section: Section = {
      section_number: 1,
      section_title: 'Introduction',
      section_description: 'Getting started',
      lessons: [
        {
          lesson_title: 'Lesson 1',
          lesson_objectives: ['Learn basics'],
          key_topics: ['Topic 1'],
        },
      ],
    };

    const input: GenerationJobInput = {
      course_id: 'course-123',
      analysis_result: {
        topic_analysis: {
          determined_topic: 'Machine Learning',
        },
        recommended_structure: {
          sections_breakdown: [
            {
              area: 'Introduction to ML',
              key_topics: [
                'Topic 1',
                'Topic 2',
                'Topic 3',
                'Topic 4',
                'Topic 5', // More than 3
              ],
              learning_objectives: ['Understand ML basics'],
            },
          ],
        },
      } as any,
    };

    const result = convertSectionToV2Specs(section, 0, input);

    expect(result).toHaveLength(1);
    expect(result[0].rag_context.search_queries).toEqual([
      'Introduction to ML',
      'Topic 1',
      'Topic 2',
      'Topic 3',
    ]);
    expect(result[0].rag_context.search_queries).toHaveLength(4); // area + 3 topics
  });

  it('should handle null analysis_result gracefully (edge case)', () => {
    const section: Section = {
      section_number: 1,
      section_title: 'Introduction',
      section_description: 'Getting started',
      lessons: [
        {
          lesson_title: 'Lesson 1',
          lesson_objectives: ['Learn basics'],
          key_topics: ['Topic 1'],
        },
      ],
    };

    const input: GenerationJobInput = {
      course_id: 'course-123',
      analysis_result: null as any,
    };

    const result = convertSectionToV2Specs(section, 0, input);

    expect(result).toHaveLength(1);
    expect(result[0].rag_context.primary_documents).toEqual([]);
    expect(result[0].rag_context.search_queries).toEqual(['course section 1']);
  });
});
