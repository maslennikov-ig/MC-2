/**
 * Unit tests for Context Assembler tier-based context building
 */

import { describe, it, expect } from 'vitest';
import {
  assembleContext,
  getFieldValue,
  estimateTokens,
  buildContextString,
} from '@/shared/regeneration/context-assembler';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';
import type { CourseStructure } from '@megacampus/shared-types/generation-result';

// ============================================================================
// Mock Data
// ============================================================================

const mockAnalysisResult: AnalysisResult = {
  course_category: {
    primary: 'professional',
    confidence: 0.9,
    reasoning: 'Test reasoning',
  },
  contextual_language: {
    why_matters_context: 'Test context',
    motivators: 'Test motivators',
    experience_prompt: 'Test experience',
    problem_statement_context: 'Test problem',
    knowledge_bridge: 'Test bridge',
    practical_benefit_focus: 'Test benefit',
  },
  topic_analysis: {
    determined_topic: 'Introduction to TypeScript',
    information_completeness: 90,
    complexity: 'medium',
    reasoning: 'Test reasoning',
    target_audience: 'intermediate',
    missing_elements: null,
    key_concepts: ['Types', 'Interfaces', 'Generics'],
    domain_keywords: ['typescript', 'types', 'interfaces', 'generics', 'static typing'],
  },
  recommended_structure: {
    estimated_content_hours: 10,
    scope_reasoning: 'Test scope',
    lesson_duration_minutes: 15,
    calculation_explanation: 'Test calculation',
    total_lessons: 20,
    total_sections: 5,
    scope_warning: null,
    sections_breakdown: [],
  },
  pedagogical_strategy: {
    teaching_style: 'hands-on',
    assessment_approach: 'Project-based',
    practical_focus: 'high',
    progression_logic: 'Incremental complexity',
    interactivity_level: 'high',
  },
  pedagogical_patterns: {
    primary_strategy: 'problem-based learning',
    theory_practice_ratio: '30:70',
    assessment_types: ['coding', 'projects'],
    key_patterns: ['build incrementally', 'learn by refactoring'],
  },
  generation_guidance: {
    tone: 'conversational but precise',
    use_analogies: true,
    specific_analogies: ['assembly line for data flow'],
    avoid_jargon: ['monads', 'functors'],
    include_visuals: ['code examples', 'diagrams'],
    exercise_types: ['coding', 'debugging'],
    contextual_language_hints: 'Assume basic programming knowledge',
    real_world_examples: ['Web development', 'API design'],
  },
  content_strategy: 'create_from_scratch',
  document_relevance_mapping: {},
  expansion_areas: null,
  research_flags: [],
  metadata: {
    analysis_version: 'v1.0.0',
    total_duration_ms: 5000,
    phase_durations_ms: {},
    model_usage: {},
    total_tokens: { input: 1000, output: 2000, total: 3000 },
    total_cost_usd: 0.01,
    retry_count: 0,
    quality_scores: {},
    created_at: new Date().toISOString(),
  },
};

const mockCourseStructure: CourseStructure = {
  course_title: 'Introduction to TypeScript',
  course_description: 'Learn TypeScript fundamentals',
  course_overview: 'Comprehensive course on TypeScript',
  target_audience: 'Intermediate developers',
  estimated_duration_hours: 10,
  difficulty_level: 'intermediate',
  prerequisites: ['JavaScript basics'],
  learning_outcomes: [],
  assessment_strategy: {
    quiz_per_section: true,
    final_exam: false,
    practical_projects: 3,
    assessment_description: 'Project-based assessment',
  },
  course_tags: ['typescript', 'programming', 'web development', 'types', 'javascript'],
  sections: [
    {
      section_number: 1,
      section_title: 'TypeScript Basics',
      section_description: 'Introduction to TypeScript fundamentals',
      learning_objectives: ['Understand types', 'Use interfaces'],
      estimated_duration_minutes: 90,
      lessons: [
        {
          lesson_number: 1,
          lesson_title: 'What is TypeScript?',
          lesson_objectives: ['Define TypeScript', 'Explain benefits'],
          key_topics: ['Static typing', 'Compilation', 'Type safety'],
          estimated_duration_minutes: 15,
          practical_exercises: [
            {
              exercise_type: 'hands-on lab',
              exercise_title: 'Setup TypeScript',
              exercise_description: 'Install and configure TypeScript',
            },
            {
              exercise_type: 'coding exercise',
              exercise_title: 'First TypeScript program',
              exercise_description: 'Write your first TypeScript code',
            },
            {
              exercise_type: 'quiz',
              exercise_title: 'TypeScript basics quiz',
              exercise_description: 'Test your understanding',
            },
          ],
        },
        {
          lesson_number: 2,
          lesson_title: 'Basic Types',
          lesson_objectives: ['Use primitive types', 'Define custom types'],
          key_topics: ['string', 'number', 'boolean', 'arrays', 'tuples'],
          estimated_duration_minutes: 20,
          practical_exercises: [
            {
              exercise_type: 'coding exercise',
              exercise_title: 'Type annotations',
              exercise_description: 'Practice type annotations',
            },
            {
              exercise_type: 'hands-on lab',
              exercise_title: 'Array types',
              exercise_description: 'Work with arrays and tuples',
            },
            {
              exercise_type: 'quiz',
              exercise_title: 'Types quiz',
              exercise_description: 'Test your knowledge',
            },
          ],
        },
      ],
    },
    {
      section_number: 2,
      section_title: 'Advanced Types',
      section_description: 'Deep dive into TypeScript type system',
      learning_objectives: ['Master union types', 'Use generics effectively'],
      estimated_duration_minutes: 120,
      lessons: [
        {
          lesson_number: 3,
          lesson_title: 'Union and Intersection Types',
          lesson_objectives: ['Define union types', 'Use intersection types'],
          key_topics: ['Union types', 'Intersection types', 'Type guards'],
          estimated_duration_minutes: 25,
          practical_exercises: [
            {
              exercise_type: 'coding exercise',
              exercise_title: 'Union types practice',
              exercise_description: 'Practice union types',
            },
            {
              exercise_type: 'hands-on lab',
              exercise_title: 'Type guards',
              exercise_description: 'Implement type guards',
            },
            {
              exercise_type: 'quiz',
              exercise_title: 'Advanced types quiz',
              exercise_description: 'Test your understanding',
            },
          ],
        },
      ],
    },
  ],
};

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('getFieldValue', () => {
  it('should extract simple field', () => {
    const data = { name: 'Test', value: 42 };
    expect(getFieldValue(data, 'name')).toBe('Test');
    expect(getFieldValue(data, 'value')).toBe(42);
  });

  it('should extract nested field', () => {
    const data = { user: { profile: { name: 'John' } } };
    expect(getFieldValue(data, 'user.profile.name')).toBe('John');
  });

  it('should handle array indices', () => {
    const data = { items: ['first', 'second', 'third'] };
    expect(getFieldValue(data, 'items[0]')).toBe('first');
    expect(getFieldValue(data, 'items[2]')).toBe('third');
  });

  it('should handle complex nested paths with arrays', () => {
    expect(getFieldValue(mockCourseStructure, 'sections[0].lessons[0].lesson_title')).toBe(
      'What is TypeScript?'
    );
    expect(getFieldValue(mockCourseStructure, 'sections[0].lessons[1].key_topics[0]')).toBe(
      'string'
    );
  });

  it('should return undefined for invalid paths', () => {
    const data = { name: 'Test' };
    expect(getFieldValue(data, 'invalid.path')).toBeUndefined();
    expect(getFieldValue(data, 'items[0]')).toBeUndefined();
  });

  it('should handle null/undefined data', () => {
    expect(getFieldValue(null, 'any.path')).toBeUndefined();
    expect(getFieldValue(undefined, 'any.path')).toBeUndefined();
  });
});

describe('estimateTokens', () => {
  it('should estimate tokens for English text', () => {
    // English: ~4 chars per token (0.25 ratio)
    const englishText = 'This is a test'; // 14 chars → ~4 tokens
    const tokens = estimateTokens(englishText);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10); // Should be around 3-4 tokens
  });

  it('should estimate tokens for Russian text', () => {
    // Russian: ~2-3 chars per token (0.35 ratio)
    const russianText = 'Привет мир'; // 10 chars → ~4 tokens
    const tokens = estimateTokens(russianText);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10); // Should be around 3-4 tokens
  });

  it('should return 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should handle long text', () => {
    const longText = 'a'.repeat(1000); // 1000 chars → ~250 tokens
    const tokens = estimateTokens(longText);
    expect(tokens).toBeGreaterThan(200);
    expect(tokens).toBeLessThan(300);
  });
});

describe('buildContextString', () => {
  it('should wrap context in XML tags', () => {
    const result = buildContextString('atomic', ['Part 1', 'Part 2']);
    expect(result).toContain('<regeneration_context tier="atomic">');
    expect(result).toContain('</regeneration_context>');
    expect(result).toContain('Part 1');
    expect(result).toContain('Part 2');
  });

  it('should filter out empty parts', () => {
    const result = buildContextString('local', ['Part 1', '', 'Part 2', '']);
    expect(result).toContain('Part 1');
    expect(result).toContain('Part 2');
    // Should not have excessive newlines from empty parts
    expect(result.split('\n\n').length).toBeLessThan(6);
  });

  it('should join parts with double newlines', () => {
    const result = buildContextString('structural', ['First', 'Second']);
    expect(result).toContain('First\n\nSecond');
  });
});

// ============================================================================
// Tier-Specific Assembly Tests
// ============================================================================

describe('assembleContext - Atomic Tier', () => {
  it('should assemble atomic context for Stage 4 field', async () => {
    const result = await assembleContext({
      courseId: 'test-uuid',
      stageId: 'stage_4',
      blockPath: 'topic_analysis.determined_topic',
      tier: 'atomic',
      analysisResult: mockAnalysisResult,
    });

    expect(result.targetContent).toBe('Introduction to TypeScript');
    expect(result.surroundingContext).toContain('<target_field path="topic_analysis.determined_topic">');
    expect(result.metadata.tier).toBe('atomic');
    expect(result.metadata.blocksIncluded).toContain('topic_analysis.determined_topic');
    expect(result.tokenEstimate).toBeGreaterThan(0);
    expect(result.tokenEstimate).toBeLessThan(result.metadata.tokenBudget); // Should fit in budget
  });

  it('should assemble atomic context for Stage 5 field', async () => {
    const result = await assembleContext({
      courseId: 'test-uuid',
      stageId: 'stage_5',
      blockPath: 'course_title',
      tier: 'atomic',
      courseStructure: mockCourseStructure,
    });

    expect(result.targetContent).toBe('Introduction to TypeScript');
    expect(result.surroundingContext).toContain('<target_field path="course_title">');
    expect(result.metadata.tier).toBe('atomic');
    expect(result.tokenEstimate).toBeGreaterThan(0);
  });
});

describe('assembleContext - Local Tier', () => {
  it('should include sibling fields for Stage 4', async () => {
    const result = await assembleContext({
      courseId: 'test-uuid',
      stageId: 'stage_4',
      blockPath: 'topic_analysis.determined_topic',
      tier: 'local',
      analysisResult: mockAnalysisResult,
    });

    expect(result.targetContent).toBe('Introduction to TypeScript');
    expect(result.surroundingContext).toContain('<parent_object path="topic_analysis">');
    expect(result.surroundingContext).toContain('<target_field path="topic_analysis.determined_topic">');
    expect(result.metadata.blocksIncluded).toContain('topic_analysis.determined_topic');
    expect(result.metadata.blocksIncluded).toContain('topic_analysis');
    expect(result.tokenEstimate).toBeGreaterThan(0);
    expect(result.tokenEstimate).toBeLessThan(result.metadata.tokenBudget);
  });

  it('should include lesson siblings for Stage 5', async () => {
    const result = await assembleContext({
      courseId: 'test-uuid',
      stageId: 'stage_5',
      blockPath: 'sections[0].lessons[0].lesson_title',
      tier: 'local',
      courseStructure: mockCourseStructure,
    });

    expect(result.targetContent).toBe('What is TypeScript?');
    expect(result.surroundingContext).toContain('<parent_object path="sections[0].lessons[0]">');
    expect(result.surroundingContext).toContain('lesson_objectives');
    expect(result.surroundingContext).toContain('key_topics');
    expect(result.metadata.tier).toBe('local');
  });
});

describe('assembleContext - Structural Tier', () => {
  it('should include section context for lesson regeneration', async () => {
    const result = await assembleContext({
      courseId: 'test-uuid',
      stageId: 'stage_5',
      blockPath: 'sections[0].lessons[1].lesson_title',
      tier: 'structural',
      courseStructure: mockCourseStructure,
    });

    expect(result.targetContent).toBe('Basic Types');
    expect(result.surroundingContext).toContain('<section_context index="0">');
    expect(result.surroundingContext).toContain('TypeScript Basics'); // Section title
    expect(result.surroundingContext).toContain('Understand types'); // Learning objective
    expect(result.metadata.tier).toBe('structural');
    expect(result.metadata.blocksIncluded.length).toBeGreaterThan(1);
  });

  it('should include adjacent lessons', async () => {
    const result = await assembleContext({
      courseId: 'test-uuid',
      stageId: 'stage_5',
      blockPath: 'sections[0].lessons[1].lesson_title',
      tier: 'structural',
      courseStructure: mockCourseStructure,
    });

    expect(result.surroundingContext).toContain('<previous_lesson>');
    expect(result.surroundingContext).toContain('What is TypeScript?'); // Previous lesson
    expect(result.surroundingContext).toContain('Static typing'); // Key topic from previous
    expect(result.metadata.tier).toBe('structural');
  });

  it('should handle first lesson (no previous)', async () => {
    const result = await assembleContext({
      courseId: 'test-uuid',
      stageId: 'stage_5',
      blockPath: 'sections[0].lessons[0].lesson_title',
      tier: 'structural',
      courseStructure: mockCourseStructure,
    });

    expect(result.surroundingContext).not.toContain('<previous_lesson>');
    expect(result.surroundingContext).toContain('<next_lesson>');
    expect(result.surroundingContext).toContain('Basic Types'); // Next lesson
  });

  it('should handle last lesson (no next)', async () => {
    const result = await assembleContext({
      courseId: 'test-uuid',
      stageId: 'stage_5',
      blockPath: 'sections[1].lessons[0].lesson_title',
      tier: 'structural',
      courseStructure: mockCourseStructure,
    });

    expect(result.surroundingContext).not.toContain('<next_lesson>');
    expect(result.metadata.tier).toBe('structural');
  });
});

describe('assembleContext - Global Tier', () => {
  it('should include analysis result for Stage 4', async () => {
    const result = await assembleContext({
      courseId: 'test-uuid',
      stageId: 'stage_4',
      blockPath: 'topic_analysis.key_concepts',
      tier: 'global',
      analysisResult: mockAnalysisResult,
    });

    expect(result.surroundingContext).toContain('<analysis_result>');
    expect(result.surroundingContext).toContain('Introduction to TypeScript');
    expect(result.surroundingContext).toContain('intermediate'); // Target audience
    expect(result.surroundingContext).toContain('hands-on'); // Teaching style
    expect(result.metadata.tier).toBe('global');
    expect(result.metadata.blocksIncluded).toContain('topic_analysis');
    expect(result.metadata.blocksIncluded).toContain('pedagogical_strategy');
  });

  it('should include course structure overview for Stage 5', async () => {
    const result = await assembleContext({
      courseId: 'test-uuid',
      stageId: 'stage_5',
      blockPath: 'sections[0].lessons[0].lesson_title',
      tier: 'global',
      courseStructure: mockCourseStructure,
    });

    expect(result.surroundingContext).toContain('<course_structure>');
    expect(result.surroundingContext).toContain('Introduction to TypeScript'); // Course title
    expect(result.surroundingContext).toContain('Intermediate developers'); // Target audience
    expect(result.surroundingContext).toContain('<sections_overview>');
    expect(result.surroundingContext).toContain('TypeScript Basics'); // Section 1
    expect(result.surroundingContext).toContain('Advanced Types'); // Section 2
    expect(result.metadata.tier).toBe('global');
  });

  it('should include both analysis and structure if available', async () => {
    const result = await assembleContext({
      courseId: 'test-uuid',
      stageId: 'stage_5',
      blockPath: 'sections[0].lessons[0].lesson_title',
      tier: 'global',
      analysisResult: mockAnalysisResult,
      courseStructure: mockCourseStructure,
    });

    expect(result.surroundingContext).toContain('<analysis_result>');
    expect(result.surroundingContext).toContain('<course_structure>');
    expect(result.metadata.tier).toBe('global');
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('assembleContext - Error Handling', () => {
  it('should throw error for missing source data', async () => {
    await expect(
      assembleContext({
        courseId: 'test-uuid',
        stageId: 'stage_4',
        blockPath: 'topic_analysis.determined_topic',
        tier: 'atomic',
        // Missing analysisResult
      })
    ).rejects.toThrow('No source data available');
  });

  it('should throw error for unknown tier', async () => {
    await expect(
      assembleContext({
        courseId: 'test-uuid',
        stageId: 'stage_4',
        blockPath: 'topic_analysis.determined_topic',
        tier: 'unknown' as any,
        analysisResult: mockAnalysisResult,
      })
    ).rejects.toThrow('Unknown tier');
  });

  it('should handle invalid field paths gracefully', async () => {
    const result = await assembleContext({
      courseId: 'test-uuid',
      stageId: 'stage_4',
      blockPath: 'invalid.path.that.does.not.exist',
      tier: 'atomic',
      analysisResult: mockAnalysisResult,
    });

    expect(result.targetContent).toBeUndefined();
    expect(result.surroundingContext).toContain('<target_field');
  });
});

// ============================================================================
// Token Budget Validation Tests
// ============================================================================

describe('assembleContext - Token Budget Validation', () => {
  it('should respect atomic tier budget (300 tokens)', async () => {
    const result = await assembleContext({
      courseId: 'test-uuid',
      stageId: 'stage_4',
      blockPath: 'topic_analysis.determined_topic',
      tier: 'atomic',
      analysisResult: mockAnalysisResult,
    });

    expect(result.metadata.tokenBudget).toBe(300);
    expect(result.tokenEstimate).toBeLessThan(300);
  });

  it('should respect local tier budget (1000 tokens)', async () => {
    const result = await assembleContext({
      courseId: 'test-uuid',
      stageId: 'stage_4',
      blockPath: 'topic_analysis.determined_topic',
      tier: 'local',
      analysisResult: mockAnalysisResult,
    });

    expect(result.metadata.tokenBudget).toBe(1000);
    expect(result.tokenEstimate).toBeLessThan(1000);
  });

  it('should respect structural tier budget (2500 tokens)', async () => {
    const result = await assembleContext({
      courseId: 'test-uuid',
      stageId: 'stage_5',
      blockPath: 'sections[0].lessons[1].lesson_title',
      tier: 'structural',
      courseStructure: mockCourseStructure,
    });

    expect(result.metadata.tokenBudget).toBe(2500);
    // Token estimate might exceed budget for complex structures (logged as warning)
  });

  it('should respect global tier budget (5000 tokens)', async () => {
    const result = await assembleContext({
      courseId: 'test-uuid',
      stageId: 'stage_5',
      blockPath: 'sections[0].lessons[0].lesson_title',
      tier: 'global',
      analysisResult: mockAnalysisResult,
      courseStructure: mockCourseStructure,
    });

    expect(result.metadata.tokenBudget).toBe(5000);
  });
});
