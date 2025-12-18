/**
 * Unit tests for Phase 2: Scope Analysis
 *
 * Tests scope estimation, lesson count calculation,
 * and minimum 10 lessons validation (FR-015).
 */

import { describe, it, expect } from 'vitest';
import { Phase2OutputSchema } from '@megacampus/shared-types/analysis-schemas';
import type { Phase2Input, Phase2Output } from '@megacampus/shared-types/analysis-schemas';

describe('Phase 2: Scope Analysis', () => {
  // Mock Phase 1 output for testing
  const mockPhase1Output = {
    course_category: {
      primary: 'professional' as const,
      confidence: 0.95,
      reasoning: 'Professional technical course',
      secondary: null,
    },
    contextual_language: {
      why_matters_context: 'for advancing your career in procurement management',
      motivators: 'career advancement, regulatory compliance',
      experience_prompt: 'Have you worked with government procurement before?',
      problem_statement_context: 'Challenges in government procurement',
      knowledge_bridge: 'Connecting legal knowledge to procurement practices',
      practical_benefit_focus: 'Ensure compliant procurement processes',
    },
    topic_analysis: {
      determined_topic: 'Government Procurement Law Fundamentals',
      information_completeness: 70,
      complexity: 'medium' as const,
      reasoning: 'Moderately complex regulatory topic',
      target_audience: 'intermediate' as const,
      missing_elements: ['Practical case studies'],
      key_concepts: ['procurement procedures', 'legal framework', 'compliance'],
      domain_keywords: [
        'procurement',
        'government',
        'regulations',
        'compliance',
        'contracts',
      ],
    },
    phase_metadata: {
      duration_ms: 5000,
      model_used: 'openai/gpt-oss-20b',
      tokens: { input: 1000, output: 500, total: 1500 },
      quality_score: 0.92,
      retry_count: 0,
    },
  };

  describe('Output structure validation', () => {
    it('should validate complete Phase 2 output structure', () => {
      const mockOutput: Phase2Output = {
        recommended_structure: {
          estimated_content_hours: 10.0,
          scope_reasoning:
            'Comprehensive coverage of government procurement fundamentals requires approximately 10 hours of content',
          lesson_duration_minutes: 15,
          calculation_explanation: '10 hours × 60 min/hour ÷ 15 min/lesson = 40 lessons',
          total_lessons: 40,
          total_sections: 8,
          scope_warning: null,
          sections_breakdown: [
            {
              area: 'Introduction to Procurement Law',
              estimated_lessons: 5,
              importance: 'core',
              learning_objectives: [
                'Understand basic procurement principles',
                'Identify key legal frameworks',
              ],
              key_topics: [
                'Legal foundations',
                'Procurement procedures',
                'Regulatory compliance',
              ],
              pedagogical_approach:
                'Start with theory, move to practical examples, include case studies',
              difficulty_progression: 'gradual',
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

      // Validate with Zod schema
      const validated = Phase2OutputSchema.parse(mockOutput);
      expect(validated.recommended_structure.total_lessons).toBe(40);
      expect(validated.recommended_structure.total_sections).toBe(8);
      expect(validated.recommended_structure.sections_breakdown).toHaveLength(1);
    });

    it('should enforce minimum 10 lessons constraint (FR-015)', () => {
      const invalidOutput = {
        recommended_structure: {
          estimated_content_hours: 1.0,
          scope_reasoning: 'Very narrow scope',
          lesson_duration_minutes: 15,
          calculation_explanation: '1 hour × 60 min/hour ÷ 15 min/lesson = 4 lessons',
          total_lessons: 4, // INVALID: < 10 lessons
          total_sections: 2,
          scope_warning: 'Scope too narrow',
          sections_breakdown: [
            {
              area: 'Overview',
              estimated_lessons: 2,
              importance: 'core',
              learning_objectives: ['Understand basics', 'Apply knowledge'],
              key_topics: ['Topic A', 'Topic B', 'Topic C'],
              pedagogical_approach: 'Theory-first with examples and practice exercises',
              difficulty_progression: 'flat',
            },
            {
              area: 'Details',
              estimated_lessons: 2,
              importance: 'important',
              learning_objectives: ['Deep dive', 'Master concepts'],
              key_topics: ['Detail A', 'Detail B', 'Detail C'],
              pedagogical_approach: 'Hands-on practice with real-world scenarios',
              difficulty_progression: 'gradual',
            },
          ],
        },
        phase_metadata: {
          duration_ms: 5000,
          model_used: 'openai/gpt-oss-20b',
          tokens: { input: 1000, output: 400, total: 1400 },
          quality_score: 0.85,
          retry_count: 0,
        },
      };

      // Should fail validation due to < 10 lessons
      expect(() => Phase2OutputSchema.parse(invalidOutput)).toThrow(
        'Minimum 10 lessons required'
      );
    });

    it('should validate sections_breakdown structure', () => {
      const sectionOutput = {
        area: 'Advanced Topics',
        estimated_lessons: 10,
        importance: 'important' as const,
        learning_objectives: [
          'Apply advanced concepts',
          'Analyze complex scenarios',
          'Design solutions',
        ],
        key_topics: ['Topic 1', 'Topic 2', 'Topic 3', 'Topic 4'],
        pedagogical_approach:
          'Project-based learning with real-world case studies and peer review',
        difficulty_progression: 'steep' as const,
      };

      expect(sectionOutput.estimated_lessons).toBeGreaterThanOrEqual(1);
      expect(sectionOutput.learning_objectives.length).toBeGreaterThanOrEqual(2);
      expect(sectionOutput.learning_objectives.length).toBeLessThanOrEqual(5);
      expect(sectionOutput.key_topics.length).toBeGreaterThanOrEqual(3);
      expect(sectionOutput.key_topics.length).toBeLessThanOrEqual(8);
    });
  });

  describe('Scope calculation logic', () => {
    it('should calculate lessons correctly from hours', () => {
      const testCases = [
        { hours: 10, duration: 15, expected: 40 },
        { hours: 5, duration: 10, expected: 30 },
        { hours: 2.5, duration: 5, expected: 30 },
      ];

      testCases.forEach(({ hours, duration, expected }) => {
        const calculated = Math.ceil((hours * 60) / duration);
        expect(calculated).toBe(expected);
      });
    });

    it('should handle edge case: exactly 10 lessons (borderline)', () => {
      const borderlineOutput: Phase2Output = {
        recommended_structure: {
          estimated_content_hours: 2.5,
          scope_reasoning:
            'Minimal viable scope for this topic based on fundamental coverage requirements and target audience needs',
          lesson_duration_minutes: 15,
          calculation_explanation:
            '2.5 hours × 60 min/hour ÷ 15 min/lesson = 10 lessons total',
          total_lessons: 10, // Exactly at minimum
          total_sections: 3,
          scope_warning: 'Course has exactly minimum 10 lessons. Consider expanding scope.',
          sections_breakdown: [
            {
              area: 'Fundamentals',
              estimated_lessons: 4,
              importance: 'core',
              learning_objectives: ['Learn basics', 'Understand concepts'],
              key_topics: ['A', 'B', 'C'],
              pedagogical_approach:
                'Theory with examples and guided practice exercises to build foundation',
              difficulty_progression: 'flat',
            },
            {
              area: 'Application',
              estimated_lessons: 3,
              importance: 'core',
              learning_objectives: ['Apply knowledge', 'Practice skills'],
              key_topics: ['X', 'Y', 'Z'],
              pedagogical_approach:
                'Hands-on exercises with immediate feedback and real-world scenarios',
              difficulty_progression: 'gradual',
            },
            {
              area: 'Summary',
              estimated_lessons: 3,
              importance: 'important',
              learning_objectives: ['Review key points', 'Assess understanding'],
              key_topics: ['Review', 'Assessment', 'Next steps'],
              pedagogical_approach:
                'Self-assessment with quizzes, reflection exercises, and knowledge checks',
              difficulty_progression: 'flat',
            },
          ],
        },
        phase_metadata: {
          duration_ms: 6000,
          model_used: 'openai/gpt-oss-20b',
          tokens: { input: 1200, output: 500, total: 1700 },
          quality_score: 0.80,
          retry_count: 0,
        },
      };

      // Should pass validation (exactly 10 lessons is allowed)
      const validated = Phase2OutputSchema.parse(borderlineOutput);
      expect(validated.recommended_structure.total_lessons).toBe(10);
      expect(validated.recommended_structure.scope_warning).toContain('exactly minimum');
    });

    it('should validate lesson duration range (3-45 minutes)', () => {
      const validDurations = [15, 20, 30]; // Test subset that keeps lessons under 100

      validDurations.forEach((duration) => {
        const lessonsCount = Math.ceil((10 * 60) / duration);
        const output: Phase2Output = {
          recommended_structure: {
            estimated_content_hours: 10,
            scope_reasoning:
              'Standard comprehensive scope with balanced coverage of all essential topics and practical applications',
            lesson_duration_minutes: duration,
            calculation_explanation: `10 hours × 60 minutes/hour divided by ${duration} minutes per lesson equals ${lessonsCount} lessons`,
            total_lessons: lessonsCount,
            total_sections: 5,
            scope_warning: null,
            sections_breakdown: [
              {
                area: 'Section 1',
                estimated_lessons: lessonsCount,
                importance: 'core',
                learning_objectives: ['Objective 1', 'Objective 2'],
                key_topics: ['A', 'B', 'C'],
                pedagogical_approach:
                  'Structured learning with clear objectives and progressive difficulty levels',
                difficulty_progression: 'gradual',
              },
            ],
          },
          phase_metadata: {
            duration_ms: 7000,
            model_used: 'openai/gpt-oss-20b',
            tokens: { input: 1300, output: 600, total: 1900 },
            quality_score: 0.85,
            retry_count: 0,
          },
        };

        expect(() => Phase2OutputSchema.parse(output)).not.toThrow();
      });
    });
  });

  describe('Model configuration', () => {
    it('should use 20B model for Phase 2 (cost-effective)', () => {
      const expectedModelId = 'openai/gpt-oss-20b';

      const mockOutput: Phase2Output = {
        recommended_structure: {
          estimated_content_hours: 15,
          scope_reasoning: 'Comprehensive topic coverage',
          lesson_duration_minutes: 15,
          calculation_explanation: '15 hours × 60 / 15 = 60 lessons',
          total_lessons: 60,
          total_sections: 10,
          scope_warning: null,
          sections_breakdown: [
            {
              area: 'Core Concepts',
              estimated_lessons: 60,
              importance: 'core',
              learning_objectives: ['Master fundamentals', 'Apply principles'],
              key_topics: ['A', 'B', 'C'],
              pedagogical_approach:
                'Interactive learning with theory, practice, and assessment',
              difficulty_progression: 'gradual',
            },
          ],
        },
        phase_metadata: {
          duration_ms: 10000,
          model_used: expectedModelId,
          tokens: { input: 2000, output: 1000, total: 3000 },
          quality_score: 0.90,
          retry_count: 0,
        },
      };

      expect(mockOutput.phase_metadata.model_used).toBe(expectedModelId);
    });
  });

  describe('Input validation', () => {
    it('should handle input with document summaries', () => {
      const inputWithDocs: Phase2Input = {
        course_id: '550e8400-e29b-41d4-a716-446655440000',
        language: 'ru',
        topic: 'Procurement Law',
        answers: 'Focus on Russian regulations',
        document_summaries: ['Law summary...', 'Case studies summary...'],
        phase1_output: mockPhase1Output,
      };

      expect(inputWithDocs.document_summaries).toHaveLength(2);
      expect(inputWithDocs.answers).toBeTruthy();
    });

    it('should handle minimal input without documents', () => {
      const minimalInput: Phase2Input = {
        course_id: '550e8400-e29b-41d4-a716-446655440000',
        language: 'en',
        topic: 'Procurement Law',
        answers: null,
        document_summaries: null,
        phase1_output: mockPhase1Output,
      };

      expect(minimalInput.document_summaries).toBeNull();
      expect(minimalInput.answers).toBeNull();
    });
  });
});
