/**
 * Unit Tests for Analysis Formatters (analysis-formatters.ts)
 *
 * Tests comprehensive coverage of 7 helper functions that format AnalysisResult fields for LLM prompts.
 * Target: 100% code coverage
 *
 * Functions tested:
 * 1. formatCourseCategoryForPrompt (12 tests)
 * 2. formatContextualLanguageForPrompt (18 tests)
 * 3. formatPedagogicalStrategyForPrompt (8 tests)
 * 4. formatPedagogicalPatternsForPrompt (8 tests)
 * 5. formatGenerationGuidanceForPrompt (12 tests)
 * 6. getDifficultyFromAnalysis (6 tests)
 * 7. getCategoryFromAnalysis (3 tests)
 *
 * Total: 67 test cases
 *
 * @module tests/unit/stage5/analysis-formatters.test
 */

import { describe, it, expect } from 'vitest';
import {
  formatCourseCategoryForPrompt,
  formatContextualLanguageForPrompt,
  formatPedagogicalStrategyForPrompt,
  formatPedagogicalPatternsForPrompt,
  formatGenerationGuidanceForPrompt,
  getDifficultyFromAnalysis,
  getCategoryFromAnalysis,
} from '../../../src/stages/stage5-generation/utils/analysis-formatters';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';

/**
 * Helper function to create mock AnalysisResult with full required structure
 */
function createMockAnalysisResult(overrides?: Partial<AnalysisResult>): AnalysisResult {
  return {
    course_category: {
      primary: 'professional',
      confidence: 0.95,
      reasoning: 'This course teaches professional skills for career development',
      secondary: null,
    },
    contextual_language: {
      why_matters_context: 'Understanding this topic is crucial for career advancement',
      motivators: 'You will gain practical skills that employers value',
      experience_prompt: 'By the end you will be able to build real-world applications',
      problem_statement_context: 'Many professionals struggle with outdated tools',
      knowledge_bridge: 'Building on your existing programming knowledge',
      practical_benefit_focus: 'You will be able to solve real business problems',
    },
    topic_analysis: {
      determined_topic: 'Modern Web Development',
      information_completeness: 85,
      complexity: 'medium',
      reasoning: 'Topic is well-defined with clear learning outcomes',
      target_audience: 'beginner',
      missing_elements: null,
      key_concepts: ['React', 'TypeScript', 'API Integration'],
      domain_keywords: ['web', 'frontend', 'javascript', 'component', 'state'],
    },
    recommended_structure: {
      estimated_content_hours: 20,
      scope_reasoning: 'Balanced depth for comprehensive learning',
      lesson_duration_minutes: 15,
      calculation_explanation: 'Based on typical lesson complexity',
      total_lessons: 40,
      total_sections: 8,
      scope_warning: null,
      sections_breakdown: [],
    },
    pedagogical_strategy: {
      teaching_style: 'hands-on',
      assessment_approach: 'Project-based assessments with practical coding exercises',
      practical_focus: 'high',
      progression_logic: 'Start with fundamentals and build incrementally to complex patterns',
      interactivity_level: 'high',
    },
    pedagogical_patterns: {
      primary_strategy: 'problem-based learning',
      theory_practice_ratio: '30:70',
      assessment_types: ['coding', 'projects'],
      key_patterns: ['build incrementally', 'learn by refactoring'],
    },
    scope_instructions: 'Create comprehensive course with practical examples',
    generation_guidance: {
      tone: 'conversational but precise',
      use_analogies: true,
      specific_analogies: ['React components are like LEGO blocks'],
      avoid_jargon: ['monads', 'functors'],
      include_visuals: ['code examples', 'diagrams'],
      exercise_types: ['coding', 'debugging'],
      contextual_language_hints: 'Assume basic programming knowledge',
      real_world_examples: ['Building a shopping cart', 'User authentication flow'],
    },
    content_strategy: 'create_from_scratch',
    expansion_areas: null,
    research_flags: [],
    metadata: {
      analysis_version: 'v1.0.0',
      total_duration_ms: 10000,
      phase_durations_ms: { phase_1: 3000, phase_2: 4000, phase_3: 3000 },
      model_usage: { phase_1: 'openai/gpt-oss-20b' },
      total_tokens: { input: 1000, output: 2000, total: 3000 },
      total_cost_usd: 0.05,
      retry_count: 0,
      quality_scores: { phase_1: 0.95 },
      created_at: '2025-01-01T00:00:00Z',
    },
    ...overrides,
  };
}

// ===========================
// 1. formatCourseCategoryForPrompt (12 tests)
// ===========================

describe('formatCourseCategoryForPrompt', () => {
  it('should format category with confidence and reasoning', () => {
    const category = {
      primary: 'professional' as const,
      confidence: 0.95,
      reasoning: 'This course teaches professional skills',
      secondary: null,
    };

    const result = formatCourseCategoryForPrompt(category);

    expect(result).toContain('Professional (95% confidence)');
    expect(result).toContain('Reasoning: This course teaches professional skills');
  });

  it('should handle professional category', () => {
    const category = {
      primary: 'professional' as const,
      confidence: 0.85,
      reasoning: 'Career-focused content',
      secondary: null,
    };

    const result = formatCourseCategoryForPrompt(category);

    expect(result).toContain('Professional (85% confidence)');
  });

  it('should handle personal category', () => {
    const category = {
      primary: 'personal' as const,
      confidence: 0.92,
      reasoning: 'Self-improvement focused',
      secondary: null,
    };

    const result = formatCourseCategoryForPrompt(category);

    expect(result).toContain('Personal (92% confidence)');
  });

  it('should handle creative category', () => {
    const category = {
      primary: 'creative' as const,
      confidence: 0.88,
      reasoning: 'Artistic skills development',
      secondary: null,
    };

    const result = formatCourseCategoryForPrompt(category);

    expect(result).toContain('Creative (88% confidence)');
  });

  it('should handle hobby category', () => {
    const category = {
      primary: 'hobby' as const,
      confidence: 0.90,
      reasoning: 'Leisure activity learning',
      secondary: null,
    };

    const result = formatCourseCategoryForPrompt(category);

    expect(result).toContain('Hobby (90% confidence)');
  });

  it('should handle spiritual category', () => {
    const category = {
      primary: 'spiritual' as const,
      confidence: 0.87,
      reasoning: 'Mindfulness and inner growth',
      secondary: null,
    };

    const result = formatCourseCategoryForPrompt(category);

    expect(result).toContain('Spiritual (87% confidence)');
  });

  it('should handle academic category', () => {
    const category = {
      primary: 'academic' as const,
      confidence: 0.96,
      reasoning: 'Formal education content',
      secondary: null,
    };

    const result = formatCourseCategoryForPrompt(category);

    expect(result).toContain('Academic (96% confidence)');
  });

  it('should include secondary category if present', () => {
    const category = {
      primary: 'professional' as const,
      confidence: 0.85,
      reasoning: 'Mixed professional and personal',
      secondary: 'personal' as const,
    };

    const result = formatCourseCategoryForPrompt(category);

    expect(result).toContain('Professional (85% confidence)');
    expect(result).toContain('Secondary category: Personal');
    expect(result).toContain('Reasoning: Mixed professional and personal');
  });

  it('should format confidence as percentage (round down)', () => {
    const category = {
      primary: 'professional' as const,
      confidence: 0.874,
      reasoning: 'Test',
      secondary: null,
    };

    const result = formatCourseCategoryForPrompt(category);

    expect(result).toContain('(87% confidence)');
  });

  it('should format confidence as percentage (round up)', () => {
    const category = {
      primary: 'professional' as const,
      confidence: 0.876,
      reasoning: 'Test',
      secondary: null,
    };

    const result = formatCourseCategoryForPrompt(category);

    expect(result).toContain('(88% confidence)');
  });

  it('should handle null secondary category explicitly', () => {
    const category = {
      primary: 'professional' as const,
      confidence: 0.95,
      reasoning: 'Pure professional focus',
      secondary: null,
    };

    const result = formatCourseCategoryForPrompt(category);

    expect(result).not.toContain('Secondary category');
    expect(result).toContain('Professional (95% confidence)');
    expect(result).toContain('Reasoning: Pure professional focus');
  });

  it('should capitalize first letter of category', () => {
    const category = {
      primary: 'hobby' as const,
      confidence: 0.90,
      reasoning: 'Test',
      secondary: 'creative' as const,
    };

    const result = formatCourseCategoryForPrompt(category);

    expect(result).toContain('Hobby (90% confidence)');
    expect(result).toContain('Secondary category: Creative');
  });
});

// ===========================
// 2. formatContextualLanguageForPrompt (18 tests)
// ===========================

describe('formatContextualLanguageForPrompt', () => {
  const mockContextual: AnalysisResult['contextual_language'] = {
    why_matters_context: 'This matters because it solves real problems',
    motivators: 'You will gain valuable skills',
    experience_prompt: 'By the end you will be confident',
    problem_statement_context: 'Many struggle with this topic',
    knowledge_bridge: 'Building on your existing knowledge',
    practical_benefit_focus: 'You will be able to apply immediately',
  };

  // Full strategy (default)
  it('should format all 6 fields with headers (full strategy)', () => {
    const result = formatContextualLanguageForPrompt(mockContextual);

    expect(result).toContain('Why This Matters: This matters because it solves real problems');
    expect(result).toContain('Motivators: You will gain valuable skills');
    expect(result).toContain('Experience Prompt: By the end you will be confident');
    expect(result).toContain('Problem Statement Context: Many struggle with this topic');
    expect(result).toContain('Knowledge Bridge: Building on your existing knowledge');
    expect(result).toContain('Practical Benefit Focus: You will be able to apply immediately');
  });

  it('should use full strategy as default when no strategy provided', () => {
    const result = formatContextualLanguageForPrompt(mockContextual);

    expect(result).toContain('Why This Matters:');
    expect(result).toContain('Motivators:');
    expect(result).toContain('Experience Prompt:');
  });

  it('should use full strategy when explicitly specified', () => {
    const result = formatContextualLanguageForPrompt(mockContextual, 'full');

    expect(result).toContain('Why This Matters:');
    expect(result).toContain('Knowledge Bridge:');
  });

  it('should include all 6 fields in full format', () => {
    const result = formatContextualLanguageForPrompt(mockContextual, 'full');

    // Count field headers
    expect(result.match(/Why This Matters:/g)).toHaveLength(1);
    expect(result.match(/Motivators:/g)).toHaveLength(1);
    expect(result.match(/Experience Prompt:/g)).toHaveLength(1);
    expect(result.match(/Problem Statement Context:/g)).toHaveLength(1);
    expect(result.match(/Knowledge Bridge:/g)).toHaveLength(1);
    expect(result.match(/Practical Benefit Focus:/g)).toHaveLength(1);
  });

  // Summary strategy
  it('should concatenate all fields into single paragraph (summary strategy)', () => {
    const result = formatContextualLanguageForPrompt(mockContextual, 'summary');

    expect(result).toBe(
      'This matters because it solves real problems You will gain valuable skills By the end you will be confident Many struggle with this topic Building on your existing knowledge You will be able to apply immediately'
    );
  });

  it('should not include headers in summary format', () => {
    const result = formatContextualLanguageForPrompt(mockContextual, 'summary');

    expect(result).not.toContain('Why This Matters:');
    expect(result).not.toContain('Motivators:');
  });

  it('should join all fields with spaces in summary', () => {
    const result = formatContextualLanguageForPrompt(mockContextual, 'summary');

    expect(result).toContain(mockContextual.why_matters_context);
    expect(result).toContain(mockContextual.motivators);
    expect(result).toContain(mockContextual.experience_prompt);
  });

  // Specific strategy
  it('should extract only requested fields (specific strategy)', () => {
    const result = formatContextualLanguageForPrompt(mockContextual, 'specific', [
      'why_matters_context',
      'motivators',
    ]);

    expect(result).toContain('Why Matters Context: This matters because it solves real problems');
    expect(result).toContain('Motivators: You will gain valuable skills');
    expect(result).not.toContain('Experience Prompt');
    expect(result).not.toContain('Problem Statement Context');
  });

  it('should handle multiple specific fields', () => {
    const result = formatContextualLanguageForPrompt(mockContextual, 'specific', [
      'why_matters_context',
      'knowledge_bridge',
      'practical_benefit_focus',
    ]);

    expect(result).toContain('Why Matters Context:');
    expect(result).toContain('Knowledge Bridge:');
    expect(result).toContain('Practical Benefit Focus:');
    expect(result).not.toContain('Motivators:');
  });

  it('should handle single specific field', () => {
    const result = formatContextualLanguageForPrompt(mockContextual, 'specific', ['motivators']);

    expect(result).toBe('Motivators: You will gain valuable skills');
  });

  it('should format field names with proper capitalization in specific strategy', () => {
    const result = formatContextualLanguageForPrompt(mockContextual, 'specific', [
      'problem_statement_context',
    ]);

    expect(result).toContain('Problem Statement Context:');
  });

  it('should separate specific fields with double newlines', () => {
    const result = formatContextualLanguageForPrompt(mockContextual, 'specific', [
      'why_matters_context',
      'motivators',
    ]);

    expect(result).toContain('\n\n');
  });

  it('should fall back to full format when specific strategy but no fields provided', () => {
    const result = formatContextualLanguageForPrompt(mockContextual, 'specific', []);

    // Falls back to full format
    expect(result).toContain('Why This Matters:');
    expect(result).toContain('Motivators:');
  });

  it('should fall back to full format when specific strategy but undefined fields', () => {
    const result = formatContextualLanguageForPrompt(mockContextual, 'specific', undefined);

    // Falls back to full format
    expect(result).toContain('Why This Matters:');
  });

  it('should handle all field types in specific strategy', () => {
    const result = formatContextualLanguageForPrompt(mockContextual, 'specific', [
      'why_matters_context',
      'motivators',
      'experience_prompt',
      'problem_statement_context',
      'knowledge_bridge',
      'practical_benefit_focus',
    ]);

    expect(result).toContain('Why Matters Context:');
    expect(result).toContain('Motivators:');
    expect(result).toContain('Experience Prompt:');
    expect(result).toContain('Problem Statement Context:');
    expect(result).toContain('Knowledge Bridge:');
    expect(result).toContain('Practical Benefit Focus:');
  });

  it('should preserve field content exactly in all strategies', () => {
    const fullResult = formatContextualLanguageForPrompt(mockContextual, 'full');
    const summaryResult = formatContextualLanguageForPrompt(mockContextual, 'summary');
    const specificResult = formatContextualLanguageForPrompt(mockContextual, 'specific', [
      'why_matters_context',
    ]);

    expect(fullResult).toContain(mockContextual.why_matters_context);
    expect(summaryResult).toContain(mockContextual.why_matters_context);
    expect(specificResult).toContain(mockContextual.why_matters_context);
  });

  it('should format with newlines between sections in full format', () => {
    const result = formatContextualLanguageForPrompt(mockContextual, 'full');

    // Should have multiple newline sections
    expect(result.split('\n\n').length).toBeGreaterThan(1);
  });

  it('should convert underscores to spaces and capitalize in specific strategy', () => {
    const result = formatContextualLanguageForPrompt(mockContextual, 'specific', [
      'practical_benefit_focus',
    ]);

    expect(result).toContain('Practical Benefit Focus:');
    expect(result).not.toContain('practical_benefit_focus');
  });
});

// ===========================
// 3. formatPedagogicalStrategyForPrompt (8 tests)
// ===========================

describe('formatPedagogicalStrategyForPrompt', () => {
  it('should format all 5 fields with headers', () => {
    const strategy: AnalysisResult['pedagogical_strategy'] = {
      teaching_style: 'hands-on',
      assessment_approach: 'Project-based with coding challenges',
      practical_focus: 'high',
      progression_logic: 'Start simple and build complexity',
      interactivity_level: 'high',
    };

    const result = formatPedagogicalStrategyForPrompt(strategy);

    expect(result).toContain('Teaching Style: hands-on');
    expect(result).toContain('Assessment Approach: Project-based with coding challenges');
    expect(result).toContain('Practical Focus: high');
    expect(result).toContain('Progression Logic: Start simple and build complexity');
    expect(result).toContain('Interactivity Level: high');
  });

  it('should handle hands-on teaching style', () => {
    const strategy: AnalysisResult['pedagogical_strategy'] = {
      teaching_style: 'hands-on',
      assessment_approach: 'Test',
      practical_focus: 'high',
      progression_logic: 'Test',
      interactivity_level: 'high',
    };

    const result = formatPedagogicalStrategyForPrompt(strategy);
    expect(result).toContain('Teaching Style: hands-on');
  });

  it('should handle theory-first teaching style', () => {
    const strategy: AnalysisResult['pedagogical_strategy'] = {
      teaching_style: 'theory-first',
      assessment_approach: 'Test',
      practical_focus: 'low',
      progression_logic: 'Test',
      interactivity_level: 'medium',
    };

    const result = formatPedagogicalStrategyForPrompt(strategy);
    expect(result).toContain('Teaching Style: theory-first');
  });

  it('should handle project-based teaching style', () => {
    const strategy: AnalysisResult['pedagogical_strategy'] = {
      teaching_style: 'project-based',
      assessment_approach: 'Test',
      practical_focus: 'high',
      progression_logic: 'Test',
      interactivity_level: 'high',
    };

    const result = formatPedagogicalStrategyForPrompt(strategy);
    expect(result).toContain('Teaching Style: project-based');
  });

  it('should handle mixed teaching style', () => {
    const strategy: AnalysisResult['pedagogical_strategy'] = {
      teaching_style: 'mixed',
      assessment_approach: 'Test',
      practical_focus: 'medium',
      progression_logic: 'Test',
      interactivity_level: 'medium',
    };

    const result = formatPedagogicalStrategyForPrompt(strategy);
    expect(result).toContain('Teaching Style: mixed');
  });

  it('should format practical focus levels (high/medium/low)', () => {
    const highFocus: AnalysisResult['pedagogical_strategy'] = {
      teaching_style: 'hands-on',
      assessment_approach: 'Test',
      practical_focus: 'high',
      progression_logic: 'Test',
      interactivity_level: 'high',
    };

    const mediumFocus: AnalysisResult['pedagogical_strategy'] = {
      ...highFocus,
      practical_focus: 'medium',
    };

    const lowFocus: AnalysisResult['pedagogical_strategy'] = {
      ...highFocus,
      practical_focus: 'low',
    };

    expect(formatPedagogicalStrategyForPrompt(highFocus)).toContain('Practical Focus: high');
    expect(formatPedagogicalStrategyForPrompt(mediumFocus)).toContain('Practical Focus: medium');
    expect(formatPedagogicalStrategyForPrompt(lowFocus)).toContain('Practical Focus: low');
  });

  it('should format interactivity levels (high/medium/low)', () => {
    const highInteractivity: AnalysisResult['pedagogical_strategy'] = {
      teaching_style: 'hands-on',
      assessment_approach: 'Test',
      practical_focus: 'high',
      progression_logic: 'Test',
      interactivity_level: 'high',
    };

    const mediumInteractivity: AnalysisResult['pedagogical_strategy'] = {
      ...highInteractivity,
      interactivity_level: 'medium',
    };

    const lowInteractivity: AnalysisResult['pedagogical_strategy'] = {
      ...highInteractivity,
      interactivity_level: 'low',
    };

    expect(formatPedagogicalStrategyForPrompt(highInteractivity)).toContain(
      'Interactivity Level: high'
    );
    expect(formatPedagogicalStrategyForPrompt(mediumInteractivity)).toContain(
      'Interactivity Level: medium'
    );
    expect(formatPedagogicalStrategyForPrompt(lowInteractivity)).toContain(
      'Interactivity Level: low'
    );
  });

  it('should preserve line breaks between fields', () => {
    const strategy: AnalysisResult['pedagogical_strategy'] = {
      teaching_style: 'hands-on',
      assessment_approach: 'Test',
      practical_focus: 'high',
      progression_logic: 'Test',
      interactivity_level: 'high',
    };

    const result = formatPedagogicalStrategyForPrompt(strategy);
    const lines = result.split('\n');

    expect(lines).toHaveLength(5);
  });
});

// ===========================
// 4. formatPedagogicalPatternsForPrompt (8 tests)
// ===========================

describe('formatPedagogicalPatternsForPrompt', () => {
  it('should format all fields (primary_strategy, ratio, assessment_types, key_patterns)', () => {
    const patterns: NonNullable<AnalysisResult['pedagogical_patterns']> = {
      primary_strategy: 'problem-based learning',
      theory_practice_ratio: '30:70',
      assessment_types: ['coding', 'projects'],
      key_patterns: ['build incrementally', 'learn by refactoring'],
    };

    const result = formatPedagogicalPatternsForPrompt(patterns);

    expect(result).toContain('Primary Strategy: problem-based learning');
    expect(result).toContain('Theory:Practice Ratio: 30:70');
    expect(result).toContain('Assessment Types: coding, projects');
    expect(result).toContain('Key Patterns:');
    expect(result).toContain('  - build incrementally');
    expect(result).toContain('  - learn by refactoring');
  });

  it('should handle problem-based learning strategy', () => {
    const patterns: NonNullable<AnalysisResult['pedagogical_patterns']> = {
      primary_strategy: 'problem-based learning',
      theory_practice_ratio: '30:70',
      assessment_types: ['coding'],
      key_patterns: ['test'],
    };

    const result = formatPedagogicalPatternsForPrompt(patterns);
    expect(result).toContain('Primary Strategy: problem-based learning');
  });

  it('should handle lecture-based strategy', () => {
    const patterns: NonNullable<AnalysisResult['pedagogical_patterns']> = {
      primary_strategy: 'lecture-based',
      theory_practice_ratio: '70:30',
      assessment_types: ['quizzes'],
      key_patterns: ['test'],
    };

    const result = formatPedagogicalPatternsForPrompt(patterns);
    expect(result).toContain('Primary Strategy: lecture-based');
  });

  it('should handle inquiry-based strategy', () => {
    const patterns: NonNullable<AnalysisResult['pedagogical_patterns']> = {
      primary_strategy: 'inquiry-based',
      theory_practice_ratio: '50:50',
      assessment_types: ['essays'],
      key_patterns: ['test'],
    };

    const result = formatPedagogicalPatternsForPrompt(patterns);
    expect(result).toContain('Primary Strategy: inquiry-based');
  });

  it('should handle project-based strategy', () => {
    const patterns: NonNullable<AnalysisResult['pedagogical_patterns']> = {
      primary_strategy: 'project-based',
      theory_practice_ratio: '20:80',
      assessment_types: ['projects'],
      key_patterns: ['test'],
    };

    const result = formatPedagogicalPatternsForPrompt(patterns);
    expect(result).toContain('Primary Strategy: project-based');
  });

  it('should handle mixed strategy', () => {
    const patterns: NonNullable<AnalysisResult['pedagogical_patterns']> = {
      primary_strategy: 'mixed',
      theory_practice_ratio: '40:60',
      assessment_types: ['coding', 'quizzes', 'projects'],
      key_patterns: ['test'],
    };

    const result = formatPedagogicalPatternsForPrompt(patterns);
    expect(result).toContain('Primary Strategy: mixed');
  });

  it('should format assessment types array with comma separation', () => {
    const patterns: NonNullable<AnalysisResult['pedagogical_patterns']> = {
      primary_strategy: 'mixed',
      theory_practice_ratio: '40:60',
      assessment_types: ['coding', 'quizzes', 'projects', 'essays', 'presentations', 'peer-review'],
      key_patterns: ['test'],
    };

    const result = formatPedagogicalPatternsForPrompt(patterns);
    expect(result).toContain(
      'Assessment Types: coding, quizzes, projects, essays, presentations, peer-review'
    );
  });

  it('should format key_patterns array with bullet points and indentation', () => {
    const patterns: NonNullable<AnalysisResult['pedagogical_patterns']> = {
      primary_strategy: 'problem-based learning',
      theory_practice_ratio: '30:70',
      assessment_types: ['coding'],
      key_patterns: [
        'build incrementally',
        'learn by refactoring',
        'test-driven development',
        'pair programming',
      ],
    };

    const result = formatPedagogicalPatternsForPrompt(patterns);

    expect(result).toContain('Key Patterns:');
    expect(result).toContain('  - build incrementally');
    expect(result).toContain('  - learn by refactoring');
    expect(result).toContain('  - test-driven development');
    expect(result).toContain('  - pair programming');
  });
});

// ===========================
// 5. formatGenerationGuidanceForPrompt (12 tests)
// ===========================

describe('formatGenerationGuidanceForPrompt', () => {
  it('should format all 8 fields', () => {
    const guidance: NonNullable<AnalysisResult['generation_guidance']> = {
      tone: 'conversational but precise',
      use_analogies: true,
      specific_analogies: ['React components are like LEGO blocks'],
      avoid_jargon: ['monads', 'functors'],
      include_visuals: ['code examples', 'diagrams'],
      exercise_types: ['coding', 'debugging'],
      contextual_language_hints: 'Assume basic programming knowledge',
      real_world_examples: ['Building a shopping cart', 'User authentication flow'],
    };

    const result = formatGenerationGuidanceForPrompt(guidance);

    expect(result).toContain('Tone: conversational but precise');
    expect(result).toContain('Use Analogies: Yes');
    expect(result).toContain('Specific Analogies:');
    expect(result).toContain('  - React components are like LEGO blocks');
    expect(result).toContain('Avoid Jargon: monads, functors');
    expect(result).toContain('Include Visuals: code examples, diagrams');
    expect(result).toContain('Exercise Types: coding, debugging');
    expect(result).toContain('Contextual Language Hints: Assume basic programming knowledge');
    expect(result).toContain('Real World Examples:');
    expect(result).toContain('  - Building a shopping cart');
    expect(result).toContain('  - User authentication flow');
  });

  it('should handle all tone variations (conversational but precise)', () => {
    const guidance: NonNullable<AnalysisResult['generation_guidance']> = {
      tone: 'conversational but precise',
      use_analogies: false,
      avoid_jargon: [],
      include_visuals: [],
      exercise_types: [],
      contextual_language_hints: 'test',
    };

    const result = formatGenerationGuidanceForPrompt(guidance);
    expect(result).toContain('Tone: conversational but precise');
  });

  it('should handle formal academic tone', () => {
    const guidance: NonNullable<AnalysisResult['generation_guidance']> = {
      tone: 'formal academic',
      use_analogies: false,
      avoid_jargon: [],
      include_visuals: [],
      exercise_types: [],
      contextual_language_hints: 'test',
    };

    const result = formatGenerationGuidanceForPrompt(guidance);
    expect(result).toContain('Tone: formal academic');
  });

  it('should handle casual friendly tone', () => {
    const guidance: NonNullable<AnalysisResult['generation_guidance']> = {
      tone: 'casual friendly',
      use_analogies: true,
      avoid_jargon: [],
      include_visuals: [],
      exercise_types: [],
      contextual_language_hints: 'test',
    };

    const result = formatGenerationGuidanceForPrompt(guidance);
    expect(result).toContain('Tone: casual friendly');
  });

  it('should handle technical professional tone', () => {
    const guidance: NonNullable<AnalysisResult['generation_guidance']> = {
      tone: 'technical professional',
      use_analogies: false,
      avoid_jargon: [],
      include_visuals: [],
      exercise_types: [],
      contextual_language_hints: 'test',
    };

    const result = formatGenerationGuidanceForPrompt(guidance);
    expect(result).toContain('Tone: technical professional');
  });

  it('should format use_analogies boolean as Yes/No', () => {
    const withAnalogies: NonNullable<AnalysisResult['generation_guidance']> = {
      tone: 'conversational but precise',
      use_analogies: true,
      avoid_jargon: [],
      include_visuals: [],
      exercise_types: [],
      contextual_language_hints: 'test',
    };

    const withoutAnalogies: NonNullable<AnalysisResult['generation_guidance']> = {
      ...withAnalogies,
      use_analogies: false,
    };

    expect(formatGenerationGuidanceForPrompt(withAnalogies)).toContain('Use Analogies: Yes');
    expect(formatGenerationGuidanceForPrompt(withoutAnalogies)).toContain('Use Analogies: No');
  });

  it('should format specific_analogies array with bullet points (REQUIRED field)', () => {
    const guidance: NonNullable<AnalysisResult['generation_guidance']> = {
      tone: 'conversational but precise',
      use_analogies: true,
      specific_analogies: [
        'State management is like a filing cabinet',
        'API calls are like ordering food',
      ],
      avoid_jargon: [],
      include_visuals: [],
      exercise_types: [],
      contextual_language_hints: 'test',
    };

    const result = formatGenerationGuidanceForPrompt(guidance);

    expect(result).toContain('Specific Analogies:');
    expect(result).toContain('  - State management is like a filing cabinet');
    expect(result).toContain('  - API calls are like ordering food');
  });

  it('should handle empty specific_analogies array', () => {
    const guidance: NonNullable<AnalysisResult['generation_guidance']> = {
      tone: 'conversational but precise',
      use_analogies: false,
      specific_analogies: [],
      avoid_jargon: [],
      include_visuals: [],
      exercise_types: [],
      contextual_language_hints: 'test',
    };

    const result = formatGenerationGuidanceForPrompt(guidance);
    expect(result).toContain('Specific Analogies: None provided');
  });

  it('should format real_world_examples array with bullet points (REQUIRED field)', () => {
    const guidance: NonNullable<AnalysisResult['generation_guidance']> = {
      tone: 'conversational but precise',
      use_analogies: false,
      avoid_jargon: [],
      include_visuals: [],
      exercise_types: [],
      contextual_language_hints: 'test',
      real_world_examples: ['E-commerce checkout', 'Social media feed', 'Dashboard analytics'],
    };

    const result = formatGenerationGuidanceForPrompt(guidance);

    expect(result).toContain('Real World Examples:');
    expect(result).toContain('  - E-commerce checkout');
    expect(result).toContain('  - Social media feed');
    expect(result).toContain('  - Dashboard analytics');
  });

  it('should handle empty real_world_examples array', () => {
    const guidance: NonNullable<AnalysisResult['generation_guidance']> = {
      tone: 'conversational but precise',
      use_analogies: false,
      avoid_jargon: [],
      include_visuals: [],
      exercise_types: [],
      contextual_language_hints: 'test',
      real_world_examples: [],
    };

    const result = formatGenerationGuidanceForPrompt(guidance);
    expect(result).toContain('Real World Examples: None provided');
  });

  it('should format avoid_jargon, include_visuals, exercise_types as comma-separated lists', () => {
    const guidance: NonNullable<AnalysisResult['generation_guidance']> = {
      tone: 'conversational but precise',
      use_analogies: false,
      avoid_jargon: ['monads', 'functors', 'isomorphism'],
      include_visuals: ['diagrams', 'flowcharts', 'code examples'],
      exercise_types: ['coding', 'debugging', 'refactoring'],
      contextual_language_hints: 'test',
    };

    const result = formatGenerationGuidanceForPrompt(guidance);

    expect(result).toContain('Avoid Jargon: monads, functors, isomorphism');
    expect(result).toContain('Include Visuals: diagrams, flowcharts, code examples');
    expect(result).toContain('Exercise Types: coding, debugging, refactoring');
  });

  it('should preserve line breaks between all sections', () => {
    const guidance: NonNullable<AnalysisResult['generation_guidance']> = {
      tone: 'conversational but precise',
      use_analogies: true,
      specific_analogies: ['test'],
      avoid_jargon: ['test'],
      include_visuals: ['diagrams'],
      exercise_types: ['coding'],
      contextual_language_hints: 'test',
      real_world_examples: ['test'],
    };

    const result = formatGenerationGuidanceForPrompt(guidance);
    const lines = result.split('\n');

    // Should have multiple lines
    expect(lines.length).toBeGreaterThan(5);
  });
});

// ===========================
// 6. getDifficultyFromAnalysis (6 tests)
// ===========================

describe('getDifficultyFromAnalysis', () => {
  it('should map beginner target_audience to beginner', () => {
    const analysis = createMockAnalysisResult({
      topic_analysis: {
        determined_topic: 'Test',
        information_completeness: 85,
        complexity: 'medium',
        reasoning: 'Test',
        target_audience: 'beginner',
        missing_elements: null,
        key_concepts: [],
        domain_keywords: [],
      },
    });

    const result = getDifficultyFromAnalysis(analysis);
    expect(result).toBe('beginner');
  });

  it('should map intermediate target_audience to intermediate', () => {
    const analysis = createMockAnalysisResult({
      topic_analysis: {
        determined_topic: 'Test',
        information_completeness: 85,
        complexity: 'medium',
        reasoning: 'Test',
        target_audience: 'intermediate',
        missing_elements: null,
        key_concepts: [],
        domain_keywords: [],
      },
    });

    const result = getDifficultyFromAnalysis(analysis);
    expect(result).toBe('intermediate');
  });

  it('should map advanced target_audience to advanced', () => {
    const analysis = createMockAnalysisResult({
      topic_analysis: {
        determined_topic: 'Test',
        information_completeness: 85,
        complexity: 'medium',
        reasoning: 'Test',
        target_audience: 'advanced',
        missing_elements: null,
        key_concepts: [],
        domain_keywords: [],
      },
    });

    const result = getDifficultyFromAnalysis(analysis);
    expect(result).toBe('advanced');
  });

  it('should map mixed target_audience to beginner (default fallback)', () => {
    const analysis = createMockAnalysisResult({
      topic_analysis: {
        determined_topic: 'Test',
        information_completeness: 85,
        complexity: 'medium',
        reasoning: 'Test',
        target_audience: 'mixed',
        missing_elements: null,
        key_concepts: [],
        domain_keywords: [],
      },
    });

    const result = getDifficultyFromAnalysis(analysis);
    expect(result).toBe('beginner');
  });

  it('should return correct difficulty enum value', () => {
    const beginnerAnalysis = createMockAnalysisResult({
      topic_analysis: {
        determined_topic: 'Test',
        information_completeness: 85,
        complexity: 'medium',
        reasoning: 'Test',
        target_audience: 'beginner',
        missing_elements: null,
        key_concepts: [],
        domain_keywords: [],
      },
    });

    const intermediateAnalysis = createMockAnalysisResult({
      topic_analysis: {
        determined_topic: 'Test',
        information_completeness: 85,
        complexity: 'medium',
        reasoning: 'Test',
        target_audience: 'intermediate',
        missing_elements: null,
        key_concepts: [],
        domain_keywords: [],
      },
    });

    const advancedAnalysis = createMockAnalysisResult({
      topic_analysis: {
        determined_topic: 'Test',
        information_completeness: 85,
        complexity: 'medium',
        reasoning: 'Test',
        target_audience: 'advanced',
        missing_elements: null,
        key_concepts: [],
        domain_keywords: [],
      },
    });

    // Type assertion to ensure it's one of the enum values
    const beginnerResult: 'beginner' | 'intermediate' | 'advanced' =
      getDifficultyFromAnalysis(beginnerAnalysis);
    const intermediateResult: 'beginner' | 'intermediate' | 'advanced' =
      getDifficultyFromAnalysis(intermediateAnalysis);
    const advancedResult: 'beginner' | 'intermediate' | 'advanced' =
      getDifficultyFromAnalysis(advancedAnalysis);

    expect(beginnerResult).toBe('beginner');
    expect(intermediateResult).toBe('intermediate');
    expect(advancedResult).toBe('advanced');
  });

  it('should handle all possible target_audience values', () => {
    const audiences: Array<'beginner' | 'intermediate' | 'advanced' | 'mixed'> = [
      'beginner',
      'intermediate',
      'advanced',
      'mixed',
    ];

    for (const audience of audiences) {
      const analysis = createMockAnalysisResult({
        topic_analysis: {
          determined_topic: 'Test',
          information_completeness: 85,
          complexity: 'medium',
          reasoning: 'Test',
          target_audience: audience,
          missing_elements: null,
          key_concepts: [],
          domain_keywords: [],
        },
      });

      const result = getDifficultyFromAnalysis(analysis);
      expect(['beginner', 'intermediate', 'advanced']).toContain(result);
    }
  });
});

// ===========================
// 7. getCategoryFromAnalysis (3 tests)
// ===========================

describe('getCategoryFromAnalysis', () => {
  it('should extract primary category', () => {
    const analysis = createMockAnalysisResult({
      course_category: {
        primary: 'professional',
        confidence: 0.95,
        reasoning: 'Test',
        secondary: null,
      },
    });

    const result = getCategoryFromAnalysis(analysis);
    expect(result).toBe('professional');
  });

  it('should handle all category types', () => {
    const categories: Array<
      'professional' | 'personal' | 'creative' | 'hobby' | 'spiritual' | 'academic'
    > = ['professional', 'personal', 'creative', 'hobby', 'spiritual', 'academic'];

    for (const category of categories) {
      const analysis = createMockAnalysisResult({
        course_category: {
          primary: category,
          confidence: 0.95,
          reasoning: 'Test',
          secondary: null,
        },
      });

      const result = getCategoryFromAnalysis(analysis);
      expect(result).toBe(category);
    }
  });

  it('should return string value', () => {
    const analysis = createMockAnalysisResult({
      course_category: {
        primary: 'professional',
        confidence: 0.95,
        reasoning: 'Test',
        secondary: null,
      },
    });

    const result = getCategoryFromAnalysis(analysis);
    expect(typeof result).toBe('string');
  });
});
