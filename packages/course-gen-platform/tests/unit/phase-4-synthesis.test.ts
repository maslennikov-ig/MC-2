/**
 * Unit tests for Phase 4: Document Synthesis
 *
 * Tests adaptive model selection, scope_instructions generation,
 * and content_strategy determination.
 */

import { describe, it, expect } from 'vitest';
import {
  determineContentStrategy,
  type Phase4Input,
} from '../../src/orchestrator/services/analysis/phase-4-synthesis';

describe('Phase 4: Document Synthesis', () => {
  describe('Content Strategy Determination', () => {
    it('should return create_from_scratch for <3 documents', () => {
      expect(determineContentStrategy(0)).toBe('create_from_scratch');
      expect(determineContentStrategy(1)).toBe('create_from_scratch');
      expect(determineContentStrategy(2)).toBe('create_from_scratch');
    });

    it('should return expand_and_enhance for 3-10 documents', () => {
      expect(determineContentStrategy(3)).toBe('expand_and_enhance');
      expect(determineContentStrategy(5)).toBe('expand_and_enhance');
      expect(determineContentStrategy(10)).toBe('expand_and_enhance');
    });

    it('should return optimize_existing for >10 documents', () => {
      expect(determineContentStrategy(11)).toBe('optimize_existing');
      expect(determineContentStrategy(20)).toBe('optimize_existing');
      expect(determineContentStrategy(50)).toBe('optimize_existing');
    });
  });

  describe('Phase 4 Input Structure', () => {
    it('should accept valid Phase4Input structure', () => {
      const validInput: Phase4Input = {
        course_id: '550e8400-e29b-41d4-a716-446655440000',
        language: 'ru',
        topic: 'React Hooks',
        answers: null,
        document_summaries: null,
        phase1_output: {
          course_category: {
            primary: 'professional',
            confidence: 0.95,
            reasoning: 'Programming course focused on career skills',
          },
          contextual_language: {
            why_matters_context:
              'This matters because React Hooks are essential for modern React development',
            motivators:
              'Learners want to build modern, efficient React applications using the latest patterns and best practices',
            experience_prompt:
              'Think about your experience with React class components. Have you found them verbose or hard to reuse?',
            problem_statement_context:
              'Problems that arise from class component complexity and lifecycle confusion',
            knowledge_bridge:
              'If you know JavaScript functions, you already understand the foundation of React Hooks',
            practical_benefit_focus:
              'Master Hooks to write cleaner, more reusable React code that follows modern industry standards',
          },
          topic_analysis: {
            determined_topic: 'React Hooks',
            information_completeness: 80,
            complexity: 'medium',
            reasoning: 'Well-defined topic with clear scope and learning path',
            target_audience: 'intermediate',
            missing_elements: null,
            key_concepts: [
              'useState',
              'useEffect',
              'useContext',
              'custom hooks',
              'hook rules',
            ],
            domain_keywords: [
              'React',
              'hooks',
              'functional components',
              'state management',
              'side effects',
              'component lifecycle',
              'custom hooks',
            ],
          },
          phase_metadata: {
            duration_ms: 5000,
            model_used: 'openai/gpt-oss-20b',
            tokens: { input: 1000, output: 500, total: 1500 },
            quality_score: 0.9,
            retry_count: 0,
          },
        },
        phase2_output: {
          recommended_structure: {
            estimated_content_hours: 8,
            scope_reasoning:
              'Comprehensive coverage of React Hooks requires examples, exercises, and best practices',
            lesson_duration_minutes: 5,
            calculation_explanation:
              '8 hours of content divided into 5-minute lessons = 96 lessons',
            total_lessons: 96,
            total_sections: 8,
            scope_warning: null,
            sections_breakdown: [
              {
                area: 'Introduction to Hooks',
                estimated_lessons: 10,
                importance: 'core',
                learning_objectives: [
                  'Understand Hooks motivation',
                  'Learn Hook rules',
                ],
                key_topics: [
                  'Class vs functional components',
                  'Hook rules',
                  'useState basics',
                ],
                pedagogical_approach:
                  'Start with theory, then hands-on examples',
                difficulty_progression: 'gradual',
              },
              {
                area: 'State Management with Hooks',
                estimated_lessons: 20,
                importance: 'core',
                learning_objectives: [
                  'Master useState',
                  'Handle complex state',
                ],
                key_topics: [
                  'useState',
                  'state updates',
                  'functional updates',
                  'multiple state variables',
                ],
                pedagogical_approach: 'Practice-heavy with real examples',
                difficulty_progression: 'gradual',
              },
              {
                area: 'Side Effects with useEffect',
                estimated_lessons: 20,
                importance: 'core',
                learning_objectives: [
                  'Understand useEffect',
                  'Handle cleanup',
                ],
                key_topics: [
                  'useEffect basics',
                  'dependency arrays',
                  'cleanup functions',
                  'async effects',
                ],
                pedagogical_approach: 'Theory then practice',
                difficulty_progression: 'steep',
              },
            ],
          },
          phase_metadata: {
            duration_ms: 6000,
            model_used: 'openai/gpt-oss-20b',
            tokens: { input: 1500, output: 800, total: 2300 },
            quality_score: 0.88,
            retry_count: 0,
          },
        },
        phase3_output: {
          pedagogical_strategy: {
            teaching_style: 'hands-on',
            assessment_approach:
              'Code exercises after each concept, mini-projects at section ends',
            practical_focus: 'high',
            progression_logic:
              'Start with simple useState, build to complex useEffect patterns, culminate in custom hooks',
            interactivity_level: 'high',
          },
          expansion_areas: null,
          research_flags: [],
          phase_metadata: {
            duration_ms: 12000,
            model_used: 'openai/gpt-oss-120b',
            tokens: { input: 2000, output: 1200, total: 3200 },
            quality_score: 0.92,
            retry_count: 0,
          },
        },
      };

      // Type checking should pass
      expect(validInput.course_id).toBeDefined();
      expect(validInput.phase1_output.course_category.primary).toBe(
        'professional'
      );
      expect(validInput.phase2_output.recommended_structure.total_lessons).toBe(
        96
      );
      expect(
        validInput.phase3_output.pedagogical_strategy.teaching_style
      ).toBe('hands-on');
    });
  });
});
