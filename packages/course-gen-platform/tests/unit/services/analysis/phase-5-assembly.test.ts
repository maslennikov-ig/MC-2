/**
 * Phase 5 Assembly Service Tests
 *
 * Tests pure assembly logic (NO LLM calls) for combining phase outputs
 * into final AnalysisResult structure.
 */

import { describe, it, expect } from 'vitest';
import { assembleAnalysisResult } from '@/orchestrator/services/analysis/phase-5-assembly';
import type {
  Phase1Output,
  Phase2Output,
  Phase3Output,
  Phase4Output,
} from '@megacampus/shared-types/analysis-result';

/**
 * Create minimal valid Phase 1 output for testing
 */
function createMockPhase1Output(): Phase1Output {
  return {
    course_category: {
      primary: 'professional',
      confidence: 0.9,
      reasoning: 'Test reasoning',
      secondary: null,
    },
    contextual_language: {
      why_matters_context: 'Test why matters context',
      motivators: 'Test motivators for this category',
      experience_prompt: 'Test experience prompt',
      problem_statement_context: 'Test problem statement',
      knowledge_bridge: 'Test knowledge bridge',
      practical_benefit_focus: 'Test practical benefits',
    },
    topic_analysis: {
      determined_topic: 'Test Topic',
      information_completeness: 75,
      complexity: 'medium',
      reasoning: 'Test topic analysis reasoning',
      target_audience: 'intermediate',
      missing_elements: null,
      key_concepts: ['concept1', 'concept2', 'concept3'],
      domain_keywords: ['kw1', 'kw2', 'kw3', 'kw4', 'kw5'],
    },
    phase_metadata: {
      duration_ms: 5000,
      model_used: 'openai/gpt-oss-20b',
      tokens: { input: 500, output: 300, total: 800 },
      quality_score: 0.85,
      retry_count: 0,
    },
  };
}

/**
 * Create minimal valid Phase 2 output for testing
 */
function createMockPhase2Output(): Phase2Output {
  return {
    recommended_structure: {
      estimated_content_hours: 15,
      scope_reasoning: 'Test scope reasoning explanation',
      lesson_duration_minutes: 15,
      calculation_explanation: 'Test calculation explanation',
      total_lessons: 12, // Must be >= 10
      total_sections: 4,
      scope_warning: null,
      sections_breakdown: [
        {
          area: 'Introduction',
          estimated_lessons: 3,
          importance: 'core',
          learning_objectives: ['obj1', 'obj2'],
          key_topics: ['topic1', 'topic2', 'topic3'],
          pedagogical_approach: 'Test pedagogical approach',
          difficulty_progression: 'gradual',
        },
      ],
    },
    phase_metadata: {
      duration_ms: 8000,
      model_used: 'openai/gpt-oss-20b',
      tokens: { input: 600, output: 400, total: 1000 },
      quality_score: 0.82,
      retry_count: 0,
    },
  };
}

/**
 * Create minimal valid Phase 3 output for testing
 */
function createMockPhase3Output(): Phase3Output {
  return {
    pedagogical_strategy: {
      teaching_style: 'mixed',
      assessment_approach: 'Test assessment approach',
      practical_focus: 'high',
      progression_logic: 'Test progression logic explanation',
      interactivity_level: 'high',
    },
    expansion_areas: [
      {
        area: 'Advanced Topics',
        priority: 'important',
        specific_requirements: ['req1', 'req2'],
        estimated_lessons: 3,
      },
    ],
    research_flags: [
      {
        topic: 'Test regulation',
        reason: 'regulation_updates',
        context: 'This topic requires recent regulatory information',
      },
    ],
    phase_metadata: {
      duration_ms: 12000,
      model_used: 'openai/gpt-oss-120b',
      tokens: { input: 1000, output: 800, total: 1800 },
      quality_score: 0.88,
      retry_count: 1,
    },
  };
}

/**
 * Create minimal valid Phase 4 output for testing
 */
function createMockPhase4Output(): Phase4Output {
  return {
    scope_instructions:
      'Test scope instructions for Stage 5. This needs to be at least 100 characters long to pass validation, so adding more detail here.',
    content_strategy: 'create_from_scratch',
    phase_metadata: {
      duration_ms: 7000,
      model_used: 'openai/gpt-oss-20b',
      tokens: { input: 700, output: 500, total: 1200 },
      quality_score: 0.80,
      retry_count: 0,
      document_count: 2,
    },
  };
}

describe('Phase 5 Assembly Service', () => {
  it('should assemble complete AnalysisResult from all phases', async () => {
    const input = {
      course_id: 'test-course-123',
      language: 'en',
      topic: 'Test Topic',
      answers: 'Test answers',
      document_summaries: ['summary1', 'summary2'],
      phase1_output: createMockPhase1Output(),
      phase2_output: createMockPhase2Output(),
      phase3_output: createMockPhase3Output(),
      phase4_output: createMockPhase4Output(),
      total_duration_ms: 32000, // Sum of all phase durations
      total_tokens: { input: 2800, output: 2000, total: 4800 },
      total_cost_usd: 0.15,
    };

    const result = await assembleAnalysisResult(input);

    // Validate structure from Phase 1
    expect(result.course_category.primary).toBe('professional');
    expect(result.contextual_language.why_matters_context).toBe(
      'Test why matters context'
    );
    expect(result.topic_analysis.determined_topic).toBe('Test Topic');

    // Validate structure from Phase 2
    expect(result.recommended_structure.total_lessons).toBe(12);
    expect(result.recommended_structure.total_sections).toBe(4);

    // Validate structure from Phase 3
    expect(result.pedagogical_strategy.teaching_style).toBe('mixed');
    expect(result.expansion_areas).toHaveLength(1);
    expect(result.research_flags).toHaveLength(1);

    // Validate structure from Phase 4
    expect(result.scope_instructions).toContain('Test scope instructions');
    expect(result.content_strategy).toBe('create_from_scratch');

    // Validate metadata
    expect(result.metadata.analysis_version).toBe('1.0.0');
    expect(result.metadata.total_duration_ms).toBeGreaterThanOrEqual(32000); // Includes assembly time
    expect(result.metadata.phase_durations_ms.phase_1).toBe(5000);
    expect(result.metadata.phase_durations_ms.phase_2).toBe(8000);
    expect(result.metadata.phase_durations_ms.phase_3).toBe(12000);
    expect(result.metadata.phase_durations_ms.phase_4).toBe(7000);
    expect(result.metadata.phase_durations_ms.phase_5).toBeGreaterThanOrEqual(0); // Assembly time (can be 0ms for fast operations)

    expect(result.metadata.model_usage.phase_1).toBe('openai/gpt-oss-20b');
    expect(result.metadata.model_usage.phase_3).toBe('openai/gpt-oss-120b');

    expect(result.metadata.total_tokens.total).toBe(4800);
    expect(result.metadata.total_cost_usd).toBe(0.15);
    expect(result.metadata.retry_count).toBe(1); // Only Phase 3 had a retry
    expect(result.metadata.quality_scores.phase_1).toBe(0.85);

    expect(result.metadata.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
  });

  it('should throw error if Phase 1 output is missing', async () => {
    const input = {
      course_id: 'test-course-123',
      language: 'en',
      topic: 'Test Topic',
      answers: null,
      document_summaries: null,
      phase1_output: null as any, // Intentionally missing
      phase2_output: createMockPhase2Output(),
      phase3_output: createMockPhase3Output(),
      phase4_output: createMockPhase4Output(),
      total_duration_ms: 27000,
      total_tokens: { input: 2300, output: 1700, total: 4000 },
      total_cost_usd: 0.12,
    };

    await expect(assembleAnalysisResult(input)).rejects.toThrow(
      'Phase 1 output is missing'
    );
  });

  it('should throw error if total_lessons < 10 (defensive validation)', async () => {
    const phase2 = createMockPhase2Output();
    phase2.recommended_structure.total_lessons = 8; // Below minimum

    const input = {
      course_id: 'test-course-123',
      language: 'en',
      topic: 'Test Topic',
      answers: null,
      document_summaries: null,
      phase1_output: createMockPhase1Output(),
      phase2_output: phase2,
      phase3_output: createMockPhase3Output(),
      phase4_output: createMockPhase4Output(),
      total_duration_ms: 32000,
      total_tokens: { input: 2800, output: 2000, total: 4800 },
      total_cost_usd: 0.15,
    };

    await expect(assembleAnalysisResult(input)).rejects.toThrow(
      'total_lessons (8) is less than minimum required (10)'
    );
  });

  it('should throw error if scope_instructions too short', async () => {
    const phase4 = createMockPhase4Output();
    phase4.scope_instructions = 'Too short'; // Less than 100 chars

    const input = {
      course_id: 'test-course-123',
      language: 'en',
      topic: 'Test Topic',
      answers: null,
      document_summaries: null,
      phase1_output: createMockPhase1Output(),
      phase2_output: createMockPhase2Output(),
      phase3_output: createMockPhase3Output(),
      phase4_output: phase4,
      total_duration_ms: 32000,
      total_tokens: { input: 2800, output: 2000, total: 4800 },
      total_cost_usd: 0.15,
    };

    await expect(assembleAnalysisResult(input)).rejects.toThrow(
      'scope_instructions too short'
    );
  });

  it('should handle empty research_flags array', async () => {
    const phase3 = createMockPhase3Output();
    phase3.research_flags = []; // Empty but valid

    const input = {
      course_id: 'test-course-123',
      language: 'en',
      topic: 'Test Topic',
      answers: null,
      document_summaries: null,
      phase1_output: createMockPhase1Output(),
      phase2_output: createMockPhase2Output(),
      phase3_output: phase3,
      phase4_output: createMockPhase4Output(),
      total_duration_ms: 32000,
      total_tokens: { input: 2800, output: 2000, total: 4800 },
      total_cost_usd: 0.15,
    };

    const result = await assembleAnalysisResult(input);

    expect(result.research_flags).toEqual([]);
    expect(Array.isArray(result.research_flags)).toBe(true);
  });

  it('should handle null expansion_areas', async () => {
    const phase3 = createMockPhase3Output();
    phase3.expansion_areas = null; // Null but valid

    const input = {
      course_id: 'test-course-123',
      language: 'en',
      topic: 'Test Topic',
      answers: null,
      document_summaries: null,
      phase1_output: createMockPhase1Output(),
      phase2_output: createMockPhase2Output(),
      phase3_output: phase3,
      phase4_output: createMockPhase4Output(),
      total_duration_ms: 32000,
      total_tokens: { input: 2800, output: 2000, total: 4800 },
      total_cost_usd: 0.15,
    };

    const result = await assembleAnalysisResult(input);

    expect(result.expansion_areas).toBeNull();
  });

  it('should calculate cumulative retry count across all phases', async () => {
    const phase1 = createMockPhase1Output();
    phase1.phase_metadata.retry_count = 2;

    const phase2 = createMockPhase2Output();
    phase2.phase_metadata.retry_count = 1;

    const phase3 = createMockPhase3Output();
    phase3.phase_metadata.retry_count = 3;

    const phase4 = createMockPhase4Output();
    phase4.phase_metadata.retry_count = 1;

    const input = {
      course_id: 'test-course-123',
      language: 'en',
      topic: 'Test Topic',
      answers: null,
      document_summaries: null,
      phase1_output: phase1,
      phase2_output: phase2,
      phase3_output: phase3,
      phase4_output: phase4,
      total_duration_ms: 32000,
      total_tokens: { input: 2800, output: 2000, total: 4800 },
      total_cost_usd: 0.15,
    };

    const result = await assembleAnalysisResult(input);

    expect(result.metadata.retry_count).toBe(7); // 2 + 1 + 3 + 1
  });
});
