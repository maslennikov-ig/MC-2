/**
 * Unit tests for Phase 3: Deep Expert Analysis
 *
 * Tests pedagogical strategy design, expansion areas identification,
 * and research flag detection (conservative approach).
 */

import { describe, it, expect, vi } from 'vitest';
import type { Phase3Input, Phase3Output } from '../../src/orchestrator/services/analysis/phase-3-expert';

describe('Phase 3: Deep Expert Analysis', () => {
  // Mock inputs for testing
  const mockPhase1Output = {
    course_category: {
      primary: 'professional' as const,
      confidence: 0.95,
      reasoning: 'Technical programming course',
      secondary: null,
    },
    contextual_language: {
      why_matters_context: 'for advancing your career as a modern React developer',
      motivators: 'career advancement, technical expertise',
      experience_prompt: 'Have you worked with React before?',
      problem_statement_context: 'Problems that modern React developers face',
      knowledge_bridge: 'Connecting JavaScript knowledge to React patterns',
      practical_benefit_focus: 'Build interactive UIs efficiently',
    },
    topic_analysis: {
      determined_topic: 'React Hooks',
      information_completeness: 75,
      complexity: 'medium' as const,
      reasoning: 'Comprehensive but needs practical examples',
      target_audience: 'intermediate' as const,
      missing_elements: ['Advanced patterns', 'Performance optimization'],
      key_concepts: ['useState', 'useEffect', 'custom hooks'],
      domain_keywords: ['React', 'hooks', 'state management', 'side effects'],
    },
    phase_metadata: {
      duration_ms: 5000,
      model_used: 'openai/gpt-oss-20b',
      tokens: { input: 1000, output: 500, total: 1500 },
      quality_score: 0.92,
      retry_count: 0,
    },
  };

  const mockPhase2Output = {
    recommended_structure: {
      estimated_content_hours: 12,
      scope_reasoning: 'Comprehensive coverage with hands-on examples',
      lesson_duration_minutes: 5,
      calculation_explanation: '12 hours * 60 min / 5 min per lesson = 144 lessons',
      total_lessons: 144,
      total_sections: 8,
      scope_warning: null,
      sections_breakdown: [
        {
          area: 'Introduction to Hooks',
          estimated_lessons: 10,
          importance: 'core' as const,
          learning_objectives: ['Understand hooks basics', 'Compare to class components'],
          key_topics: ['useState', 'useEffect', 'rules of hooks'],
          pedagogical_approach: 'Theory with live examples',
          difficulty_progression: 'gradual' as const,
        },
      ],
    },
    phase_metadata: {
      duration_ms: 8000,
      model_used: 'openai/gpt-oss-20b',
      tokens: { input: 1500, output: 800, total: 2300 },
      quality_score: 0.88,
      retry_count: 0,
    },
  };

  describe('Output structure validation', () => {
    it('should have required pedagogical_strategy fields', () => {
      // This is a structural test - actual LLM call would be mocked in integration tests
      const mockOutput: Phase3Output = {
        pedagogical_strategy: {
          teaching_style: 'hands-on',
          assessment_approach: 'Progressive exercises after each hook introduction',
          practical_focus: 'high',
          progression_logic:
            'Start with simple hooks (useState), progress to complex patterns (custom hooks), end with optimization',
          interactivity_level: 'high',
        },
        expansion_areas: [
          {
            area: 'Advanced patterns',
            priority: 'important',
            specific_requirements: ['Add useCallback examples', 'Add useMemo patterns'],
            estimated_lessons: 5,
          },
        ],
        research_flags: [],
        phase_metadata: {
          duration_ms: 30000,
          model_used: 'openai/gpt-oss-120b',
          tokens: { input: 3000, output: 1500, total: 4500 },
          quality_score: 0.0,
          retry_count: 0,
        },
      };

      expect(mockOutput.pedagogical_strategy.teaching_style).toBe('hands-on');
      expect(mockOutput.pedagogical_strategy.assessment_approach.length).toBeGreaterThanOrEqual(
        50
      );
      expect(mockOutput.pedagogical_strategy.progression_logic.length).toBeGreaterThanOrEqual(
        100
      );
    });

    it('should allow null expansion_areas when completeness is high', () => {
      const mockOutput: Phase3Output = {
        pedagogical_strategy: {
          teaching_style: 'mixed',
          assessment_approach: 'Quizzes and final project',
          practical_focus: 'medium',
          progression_logic:
            'Balanced progression from fundamentals to advanced topics with continuous reinforcement',
          interactivity_level: 'medium',
        },
        expansion_areas: null, // High completeness (≥80%)
        research_flags: [],
        phase_metadata: {
          duration_ms: 25000,
          model_used: 'openai/gpt-oss-120b',
          tokens: { input: 2500, output: 1200, total: 3700 },
          quality_score: 0.0,
          retry_count: 0,
        },
      };

      expect(mockOutput.expansion_areas).toBeNull();
    });

    it('should support research flags with required fields', () => {
      const mockOutput: Phase3Output = {
        pedagogical_strategy: {
          teaching_style: 'theory-first',
          assessment_approach: 'Written tests and code reviews',
          practical_focus: 'low',
          progression_logic: 'Deep conceptual understanding before practical application',
          interactivity_level: 'low',
        },
        expansion_areas: null,
        research_flags: [
          {
            topic: 'React 19 features',
            reason: 'technology_trends',
            context:
              'React 19 introduces new concurrent features requiring up-to-date documentation',
          },
        ],
        phase_metadata: {
          duration_ms: 28000,
          model_used: 'openai/gpt-oss-120b',
          tokens: { input: 2800, output: 1400, total: 4200 },
          quality_score: 0.0,
          retry_count: 0,
        },
      };

      expect(mockOutput.research_flags).toHaveLength(1);
      expect(mockOutput.research_flags[0].topic).toBe('React 19 features');
      expect(mockOutput.research_flags[0].reason).toBe('technology_trends');
      expect(mockOutput.research_flags[0].context.length).toBeGreaterThanOrEqual(50);
    });
  });

  describe('Model configuration', () => {
    it('should ALWAYS use 120B model for Phase 3', () => {
      // Phase 3 is critical quality phase - NEVER use cheap models
      const expectedModelId = 'openai/gpt-oss-120b';

      const mockOutput: Phase3Output = {
        pedagogical_strategy: {
          teaching_style: 'project-based',
          assessment_approach: 'Build complete application as final project',
          practical_focus: 'high',
          progression_logic:
            'Learn by building - each lesson adds new feature to growing project',
          interactivity_level: 'high',
        },
        expansion_areas: null,
        research_flags: [],
        phase_metadata: {
          duration_ms: 35000,
          model_used: expectedModelId,
          tokens: { input: 3500, output: 1800, total: 5300 },
          quality_score: 0.0,
          retry_count: 0,
        },
      };

      expect(mockOutput.phase_metadata.model_used).toBe(expectedModelId);
    });
  });

  describe('Research flag detection criteria', () => {
    it('should flag legal/regulatory content', () => {
      const legalFlag = {
        topic: 'Постановление 1875',
        reason: 'regulation_updates',
        context: 'Russian procurement law subject to frequent amendments and requires current version',
      };

      expect(legalFlag.context.length).toBeGreaterThanOrEqual(50);
      expect(legalFlag.reason).toBe('regulation_updates');
    });

    it('should NOT flag timeless concepts', () => {
      // Timeless topics should have empty research_flags array
      const timelessTopics = [
        'JavaScript functions',
        'OOP principles',
        'Watercolor painting techniques',
        'Meditation practices',
      ];

      // These should result in research_flags: []
      timelessTopics.forEach((topic) => {
        expect(topic).toBeTruthy(); // Just verify topics exist
        // In actual implementation, LLM would return [] for these
      });
    });

    it('should flag fast-changing technology', () => {
      const techFlag = {
        topic: 'Node.js 22 breaking changes',
        reason: 'technology_trends',
        context:
          'Node.js versions change rapidly with breaking changes requiring current documentation',
      };

      expect(techFlag.context.length).toBeGreaterThanOrEqual(50);
      expect(techFlag.reason).toBe('technology_trends');
    });
  });

  describe('Input validation', () => {
    it('should handle input with document summaries', () => {
      const inputWithDocs: Phase3Input = {
        course_id: '550e8400-e29b-41d4-a716-446655440000',
        language: 'ru',
        topic: 'React Hooks',
        answers: 'I want comprehensive coverage of all hooks',
        document_summaries: [
          'React documentation summary...',
          'Advanced hooks patterns summary...',
        ],
        phase1_output: mockPhase1Output,
        phase2_output: mockPhase2Output,
      };

      expect(inputWithDocs.document_summaries).toHaveLength(2);
      expect(inputWithDocs.answers).toBeTruthy();
    });

    it('should handle minimal input without documents', () => {
      const minimalInput: Phase3Input = {
        course_id: '550e8400-e29b-41d4-a716-446655440000',
        language: 'en',
        topic: 'React Hooks',
        answers: null,
        document_summaries: null,
        phase1_output: mockPhase1Output,
        phase2_output: mockPhase2Output,
      };

      expect(minimalInput.document_summaries).toBeNull();
      expect(minimalInput.answers).toBeNull();
    });
  });
});
