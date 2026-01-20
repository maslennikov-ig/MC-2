/**
 * Unit tests for Phase 1 Classification Service
 *
 * @module phase-1-classifier.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runPhase1Classification,
  updatePhase1QualityScore,
} from '../../../../../src/orchestrator/services/analysis/phase-1-classifier';
import type { Phase1Output } from '@megacampus/shared-types/analysis-result';

// Mock dependencies
vi.mock('../../../../../src/orchestrator/services/analysis/langchain-models', () => ({
  getModelForPhase: vi.fn().mockResolvedValue({
    modelName: 'openai/gpt-oss-20b',
    pipe: vi.fn().mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        course_category: {
          primary: 'professional',
          confidence: 0.92,
          reasoning: 'Technical skill development for career advancement',
          secondary: null,
        },
        contextual_language: {
          why_matters_context:
            'Mastering this skill is crucial for career advancement and professional competitiveness in the technology sector',
          motivators:
            'Increased earning potential, enhanced job security, industry recognition, and expanded career opportunities',
          experience_prompt:
            'Consider workplace challenges and professional growth opportunities where these skills will be directly applicable',
          problem_statement_context:
            'Addressing the critical skills gap affecting career progression in software development',
          knowledge_bridge:
            'Practical application in current and future professional roles, with direct impact on daily work responsibilities',
          practical_benefit_focus:
            'Immediate applicability to job responsibilities, project success, and long-term career development goals',
        },
        topic_analysis: {
          determined_topic: 'TypeScript Programming',
          information_completeness: 85,
          complexity: 'medium',
          reasoning:
            'Well-defined topic with clear learning objectives and structured content requirements',
          target_audience: 'intermediate',
          missing_elements: ['Advanced type system patterns', 'Real-world project examples'],
          key_concepts: [
            'Static typing',
            'Interfaces',
            'Generics',
            'Type inference',
            'Decorators',
          ],
          domain_keywords: [
            'TypeScript',
            'JavaScript',
            'static typing',
            'type safety',
            'interfaces',
            'generics',
            'decorators',
            'type guards',
          ],
        },
        usage: {
          prompt_tokens: 1200,
          completion_tokens: 650,
        },
      }),
    }),
  }),
}));

vi.mock('../../../../../src/orchestrator/services/analysis/langchain-observability', () => ({
  trackPhaseExecution: vi.fn().mockImplementation(async (_phase, _courseId, _modelId, fn) => {
    const result = await fn();
    return result.result;
  }),
}));

describe('Phase 1 Classification Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runPhase1Classification', () => {
    it('should successfully classify a professional course', async () => {
      const input = {
        course_id: '550e8400-e29b-41d4-a716-446655440000',
        language: 'en',
        topic: 'TypeScript Programming',
        target_audience: 'intermediate' as const,
        lesson_duration_minutes: 20,
      };

      const result = await runPhase1Classification(input);

      // Validate structure
      expect(result).toBeDefined();
      expect(result.course_category).toBeDefined();
      expect(result.contextual_language).toBeDefined();
      expect(result.topic_analysis).toBeDefined();
      expect(result.phase_metadata).toBeDefined();

      // Validate course category
      expect(result.course_category.primary).toBe('professional');
      expect(result.course_category.confidence).toBeGreaterThanOrEqual(0);
      expect(result.course_category.confidence).toBeLessThanOrEqual(1);
      expect(result.course_category.reasoning).toBeTruthy();

      // Validate contextual language
      expect(result.contextual_language.why_matters_context.length).toBeGreaterThanOrEqual(50);
      expect(result.contextual_language.why_matters_context.length).toBeLessThanOrEqual(300);
      expect(result.contextual_language.motivators.length).toBeGreaterThanOrEqual(100);
      expect(result.contextual_language.motivators.length).toBeLessThanOrEqual(600);

      // Validate topic analysis
      expect(result.topic_analysis.determined_topic).toBeTruthy();
      expect(result.topic_analysis.information_completeness).toBeGreaterThanOrEqual(0);
      expect(result.topic_analysis.information_completeness).toBeLessThanOrEqual(100);
      expect(['narrow', 'medium', 'broad']).toContain(result.topic_analysis.complexity);
      expect(result.topic_analysis.key_concepts.length).toBeGreaterThanOrEqual(3);
      expect(result.topic_analysis.key_concepts.length).toBeLessThanOrEqual(10);
      expect(result.topic_analysis.domain_keywords.length).toBeGreaterThanOrEqual(5);
      expect(result.topic_analysis.domain_keywords.length).toBeLessThanOrEqual(15);

      // Validate metadata
      expect(result.phase_metadata.model_used).toBe('openai/gpt-oss-20b');
      expect(result.phase_metadata.duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.phase_metadata.tokens.total).toBeGreaterThan(0);
      expect(result.phase_metadata.retry_count).toBe(0);
    });

    it('should handle input with document summaries', async () => {
      const input = {
        course_id: '550e8400-e29b-41d4-a716-446655440001',
        language: 'en',
        topic: 'TypeScript Programming',
        document_summaries: [
          {
            document_id: '123e4567-e89b-12d3-a456-426614174000',
            file_name: 'typescript-intro.pdf',
            processed_content: 'Introduction to TypeScript: static typing, interfaces, and generics...',
          },
          {
            document_id: '123e4567-e89b-12d3-a456-426614174001',
            file_name: 'advanced-patterns.pdf',
            processed_content: 'Advanced TypeScript patterns: decorators, mixins, conditional types...',
          },
        ],
      };

      const result = await runPhase1Classification(input);

      expect(result).toBeDefined();
      expect(result.course_category.primary).toBe('professional');
      expect(result.topic_analysis.determined_topic).toBeTruthy();
    });

    it('should handle input with user requirements', async () => {
      const input = {
        course_id: '550e8400-e29b-41d4-a716-446655440002',
        language: 'ru',
        topic: 'Программирование на TypeScript',
        answers: 'Нужен курс для начинающих с акцентом на практические примеры',
        target_audience: 'beginner' as const,
      };

      const result = await runPhase1Classification(input);

      expect(result).toBeDefined();
      expect(result.course_category.primary).toBe('professional');
      // Output should be in English even though input is Russian
      expect(result.contextual_language.why_matters_context).toMatch(/[a-zA-Z]/);
    });
  });

  describe('updatePhase1QualityScore', () => {
    it('should update quality score in phase metadata', () => {
      const originalOutput: Phase1Output = {
        course_category: {
          primary: 'professional',
          confidence: 0.9,
          reasoning: 'Technical professional development',
          secondary: null,
        },
        contextual_language: {
          why_matters_context: 'Career advancement in technology sector',
          motivators: 'Increased earning potential and job security',
          experience_prompt: 'Workplace challenges and professional growth',
          problem_statement_context: 'Skills gap affecting career progression',
          knowledge_bridge: 'Practical application in professional roles',
          practical_benefit_focus: 'Immediate job applicability',
        },
        topic_analysis: {
          determined_topic: 'TypeScript',
          information_completeness: 80,
          complexity: 'medium',
          reasoning: 'Well-defined technical topic',
          target_audience: 'intermediate',
          missing_elements: null,
          key_concepts: ['typing', 'interfaces', 'generics'],
          domain_keywords: ['typescript', 'javascript', 'static-typing', 'type-safety', 'interfaces'],
        },
        phase_metadata: {
          duration_ms: 5000,
          model_used: 'openai/gpt-oss-20b',
          tokens: { input: 1000, output: 500, total: 1500 },
          quality_score: 0.0,
          retry_count: 0,
        },
      };

      const updated = updatePhase1QualityScore(originalOutput, 0.87);

      expect(updated.phase_metadata.quality_score).toBe(0.87);
      expect(updated.course_category).toEqual(originalOutput.course_category);
      expect(updated.contextual_language).toEqual(originalOutput.contextual_language);
      expect(updated.topic_analysis).toEqual(originalOutput.topic_analysis);
    });
  });
});
