/**
 * Centralized test fixture for AnalysisResult with full T055 unified schema
 *
 * Usage:
 * - createFullAnalysisResult(title) - Returns complete AnalysisResult with ALL fields
 * - createMinimalAnalysisResult(title) - Alias for backward compatibility
 *
 * @module tests/fixtures/analysis-result-fixture
 */

import type { AnalysisResult } from '@megacampus/shared-types/generation-job';

/**
 * Create a complete AnalysisResult fixture with all required fields
 *
 * This fixture includes:
 * - All nested objects (course_category, contextual_language, topic_analysis, etc.)
 * - 4 REQUIRED enhancement fields from T055 Schema Unification:
 *   1. pedagogical_patterns (REQUIRED)
 *   2. generation_guidance (REQUIRED)
 *   3. document_relevance_mapping (REQUIRED, can be empty object for title-only)
 *   4. document_analysis (REQUIRED)
 *
 * @param title - Course title for the test fixture
 * @returns Complete AnalysisResult object
 */
export function createFullAnalysisResult(title: string): AnalysisResult {
  return {
    // Phase 1: Classification
    course_category: {
      primary: 'professional' as const,
      confidence: 0.9,
      reasoning: 'Test course for unit/contract testing with professional focus',
      secondary: null,
    },

    contextual_language: {
      why_matters_context: 'Understanding this topic is crucial for modern development and practical application',
      motivators: 'Gain practical skills applicable to real-world projects. Master techniques used by industry professionals and build confidence in your abilities.',
      experience_prompt: 'You will learn through hands-on examples and exercises that reinforce key concepts. Each lesson builds on the previous one to create a comprehensive learning journey.',
      problem_statement_context: 'Many developers struggle with this concept initially due to its complexity',
      knowledge_bridge: 'We will connect theoretical concepts to practical implementations through clear examples. You will see how abstract ideas translate into working code.',
      practical_benefit_focus: 'Master techniques used by industry professionals. Apply these skills immediately in your projects to solve real-world problems.',
    },

    topic_analysis: {
      determined_topic: title,
      information_completeness: 80,
      complexity: 'medium' as const,
      reasoning: 'Topic has clear structure with moderate depth, suitable for comprehensive course development',
      target_audience: 'intermediate' as const,
      missing_elements: null,
      key_concepts: ['concept1', 'concept2', 'concept3'],
      domain_keywords: ['keyword1', 'keyword2', 'keyword3', 'keyword4', 'keyword5'],
    },

    // Phase 2: Scope
    recommended_structure: {
      estimated_content_hours: 10,
      scope_reasoning: 'Balanced scope covering fundamentals and practical applications. The structure allows for gradual skill building while maintaining engagement.',
      lesson_duration_minutes: 30,
      calculation_explanation: '20 lessons × 30 minutes = 10 hours total estimated learning time',
      total_lessons: 20,
      total_sections: 5,
      scope_warning: null,
      sections_breakdown: [
        {
          area: 'Introduction to Fundamentals',
          estimated_lessons: 4,
          importance: 'core' as const,
          learning_objectives: [
            'Learn basic principles and core concepts',
            'Understand fundamental terminology',
          ],
          key_topics: ['topic1', 'topic2', 'topic3'],
          pedagogical_approach: 'hands-on learning with guided examples and progressive difficulty',
          difficulty_progression: 'gradual' as const,
        },
        {
          area: 'Advanced Topics and Applications',
          estimated_lessons: 6,
          importance: 'core' as const,
          learning_objectives: [
            'Master advanced concepts and techniques',
            'Apply knowledge to real-world scenarios',
          ],
          key_topics: ['topic4', 'topic5', 'topic6'],
          pedagogical_approach: 'project-based learning with real-world scenarios and practical exercises',
          difficulty_progression: 'gradual' as const,
        },
      ],
    },

    // Phase 3: Expert Analysis
    pedagogical_strategy: {
      teaching_style: 'mixed' as const,
      assessment_approach: 'Combination of quizzes, coding exercises, and practical projects to reinforce learning',
      practical_focus: 'medium' as const,
      progression_logic: 'Start with fundamentals, build to advanced topics incrementally. Each section reinforces previous concepts while introducing new material.',
      interactivity_level: 'medium' as const,
    },

    // Phase 4: Synthesis
    scope_instructions: 'Focus on practical implementation with clear examples. Balance theory and practice to ensure comprehensive understanding.',
    content_strategy: 'create_from_scratch' as const,
    expansion_areas: null,
    research_flags: [],

    // ========================================================================
    // NEW: REQUIRED enhancement fields (T055 Schema Unification)
    // These 4 fields are REQUIRED by AnalysisResultSchema (no .optional())
    // ========================================================================

    pedagogical_patterns: {
      primary_strategy: 'mixed' as const,
      theory_practice_ratio: '40:60',
      assessment_types: ['coding', 'quizzes', 'projects'],
      key_patterns: [
        'learn by doing',
        'incremental complexity',
        'real-world examples',
        'hands-on practice',
      ],
    },

    generation_guidance: {
      tone: 'conversational but precise' as const,
      use_analogies: true,
      specific_analogies: [
        'compare to familiar concepts where appropriate',
        'use everyday examples to explain abstract ideas',
      ],
      avoid_jargon: ['complex technical terms without explanation'],
      include_visuals: ['diagrams', 'code examples', 'flowcharts'],
      exercise_types: ['coding', 'interpretation', 'debugging', 'refactoring'],
      contextual_language_hints: 'Use clear language with practical examples for intermediate learners. Assume basic programming knowledge.',
      real_world_examples: [
        'industry use cases',
        'production scenarios',
        'practical applications',
      ],
    },

    // Empty object for title-only test scenarios (no documents uploaded)
    document_relevance_mapping: {},

    document_analysis: {
      source_materials: ['title', 'description'],  // Title-only scenario
      main_themes: [
        {
          theme: `${title} fundamentals and applications`,
          importance: 'high' as const,
          coverage: 'Comprehensive overview',
        },
      ],
      complexity_assessment: 'Intermediate level with practical focus and hands-on exercises',
      estimated_total_hours: 10,
    },

    // Metadata
    metadata: {
      analysis_version: 'v1.0.0-test',
      total_duration_ms: 5000,
      phase_durations_ms: {
        phase_1: 1000,
        phase_2: 1500,
        phase_3: 1500,
        phase_4: 1000,
      },
      model_usage: {
        phase_1: 'test-model',
        phase_2: 'test-model',
        phase_3: 'test-model',
        phase_4: 'test-model',
      },
      total_tokens: { input: 1000, output: 500, total: 1500 },
      total_cost_usd: 0.01,
      retry_count: 0,
      quality_scores: {
        phase_1: 0.9,
        phase_2: 0.9,
        phase_3: 0.9,
        phase_4: 0.9,
      },
      created_at: new Date().toISOString(),
    },
  };
}

/**
 * Alias for backward compatibility with existing tests
 *
 * @param title - Course title for the test fixture
 * @returns Complete AnalysisResult object
 */
export const createMinimalAnalysisResult = createFullAnalysisResult;

/**
 * Create AnalysisResult with HIGH complexity sections (≥0.75 score)
 *
 * For RT-001 tiered routing tests expecting Tier 2 (qwen3-max) selection.
 * Used when tests require high-complexity generation workflow.
 *
 * Complexity factors calculation:
 * - 9+ key_topics (high breadth) → 0.4 score
 * - 5+ learning_objectives (high learning goals) → 0.3 score
 * - 6+ estimated_lessons (high lesson count) → 0.3 score
 * - Total: 1.0 (capped at 1.0 by calculateComplexityScore)
 *
 * This ensures that complexity calculations in SectionBatchGenerator
 * will evaluate to ≥0.75, triggering Tier 2 (qwen3-max) routing.
 *
 * @param title - Course title
 * @returns AnalysisResult with high-complexity section in sections_breakdown
 *
 * @example
 * ```typescript
 * // For tests that expect high complexity routing to Tier 2
 * const highComplexity = createHighComplexityAnalysisResult('Advanced ML Course');
 * const jobInput: GenerationJobInput = {
 *   analysis_result: highComplexity,
 *   // ... other fields
 * };
 * const generator = new SectionBatchGenerator();
 * const result = await generator.generateBatch(0, 0, 1, jobInput);
 * expect(result.complexityScore).toBeGreaterThanOrEqual(0.75);
 * expect(result.tier).toBe('tier2_qwen3Max');
 * ```
 */
export function createHighComplexityAnalysisResult(title: string): AnalysisResult {
  const base = createFullAnalysisResult(title);

  return {
    ...base,
    recommended_structure: {
      ...base.recommended_structure,
      sections_breakdown: [
        {
          area: 'Advanced Complex Topic Area',
          key_topics: [
            'advanced_concept_1',
            'advanced_concept_2',
            'advanced_concept_3',
            'advanced_concept_4',
            'advanced_concept_5',
            'advanced_concept_6',
            'advanced_concept_7',
            'advanced_concept_8',
            'advanced_concept_9', // 9 topics → 0.4 (high breadth)
          ],
          learning_objectives: [
            'Master advanced techniques and methodologies',
            'Analyze complex scenarios and edge cases',
            'Synthesize knowledge across multiple domains',
            'Evaluate trade-offs in system design',
            'Create innovative solutions to novel problems', // 5 objectives → 0.3 (high goals)
          ],
          estimated_lessons: 6, // 6 lessons → 0.3 (high count)
          importance: 'core' as const,
          pedagogical_approach:
            'project-based learning with real-world scenarios, advanced case studies, and practical exercises',
          difficulty_progression: 'gradual' as const,
        },
      ],
    },
  };
}

/**
 * Create AnalysisResult with LOW complexity sections (<0.75 score)
 *
 * For RT-001 tiered routing tests expecting Tier 1 (OSS 120B) selection.
 * Used when tests require low-complexity generation workflow.
 *
 * Complexity factors calculation:
 * - 1-2 key_topics (low breadth) → 0.1 score
 * - 1-2 learning_objectives (few goals) → 0.1 score
 * - 1-2 estimated_lessons (few lessons) → 0.1 score
 * - Total: 0.3 (well below 0.75 threshold)
 *
 * This ensures that complexity calculations in SectionBatchGenerator
 * will evaluate to <0.75, triggering Tier 1 (OSS 120B) routing
 * (assuming criticality is also low).
 *
 * @param title - Course title
 * @returns AnalysisResult with low-complexity section in sections_breakdown
 *
 * @example
 * ```typescript
 * // For tests that expect low complexity routing to Tier 1
 * const lowComplexity = createLowComplexityAnalysisResult('Beginner Course');
 * const jobInput: GenerationJobInput = {
 *   analysis_result: lowComplexity,
 *   // ... other fields
 * };
 * const generator = new SectionBatchGenerator();
 * const result = await generator.generateBatch(0, 0, 1, jobInput);
 * expect(result.complexityScore).toBeLessThan(0.75);
 * expect(result.tier).toBe('tier1_oss120b');
 * ```
 */
export function createLowComplexityAnalysisResult(title: string): AnalysisResult {
  const base = createFullAnalysisResult(title);

  return {
    ...base,
    // Override topic_analysis to set low complexity
    topic_analysis: {
      ...base.topic_analysis,
      complexity: 'low' as const,
    },
    recommended_structure: {
      ...base.recommended_structure,
      total_lessons: 2,
      total_sections: 1,
      sections_breakdown: [
        {
          area: 'Simple Introduction',
          key_topics: ['topic1', 'topic2'], // 2 topics → 0.1 (low breadth)
          learning_objectives: [
            'Understand basic concepts',
            'Learn fundamental principles', // 2 objectives → 0.1 (few goals)
          ],
          estimated_lessons: 2, // 2 lessons → 0.1 (low count)
          importance: 'optional' as const, // Not core
          pedagogical_approach: 'guided lectures with simple examples',
          difficulty_progression: 'linear' as const,
        },
      ],
    },
  };
}
