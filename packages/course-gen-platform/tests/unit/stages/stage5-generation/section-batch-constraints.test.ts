import { describe, expect, it } from 'vitest';
import type { GenerationJobInput } from '@megacampus/shared-types';
import { resolveSectionCourseConstraints } from '@/stages/stage5-generation/utils/section-batch-generator';
import { createFullAnalysisResult } from '../../../fixtures/analysis-result-fixture';

describe('resolveSectionCourseConstraints', () => {
  it('uses Stage 4 per-section estimated_lessons instead of a uniform average', () => {
    const analysisResult = createFullAnalysisResult('Role Bridge Course');
    analysisResult.recommended_structure.total_sections = 3;
    analysisResult.recommended_structure.total_lessons = 15;
    analysisResult.recommended_structure.sections_breakdown = [
      {
        area: 'Compact foundation',
        estimated_lessons: 3,
        importance: 'simple',
        learning_objectives: ['Understand operating context', 'Identify role boundaries'],
        key_topics: ['context', 'boundaries', 'handoffs'],
        pedagogical_approach:
          'Short orientation lessons with concrete examples and quick checks for understanding.',
        section_id: '1',
        estimated_duration_hours: 0.75,
        difficulty: 'beginner',
      },
      {
        area: 'Complex senior practice',
        estimated_lessons: 7,
        importance: 'complex',
        learning_objectives: ['Diagnose performance gaps', 'Design senior-level interventions'],
        key_topics: ['metrics', 'attribution', 'stakeholder alignment'],
        pedagogical_approach:
          'Scenario-based practice with applied analysis and role-specific decision points.',
        section_id: '2',
        estimated_duration_hours: 1.75,
        difficulty: 'advanced',
      },
      {
        area: 'Operating cadence',
        estimated_lessons: 5,
        importance: 'normal',
        learning_objectives: ['Build cadence', 'Review execution quality'],
        key_topics: ['cadence', 'review', 'quality'],
        pedagogical_approach:
          'Practical workflow lessons with self-review and manager-ready artifacts.',
        section_id: '3',
        estimated_duration_hours: 1.25,
        difficulty: 'intermediate',
      },
    ];

    const constraints = resolveSectionCourseConstraints(
      {
        course_id: 'course-123',
        organization_id: 'org-456',
        user_id: 'user-789',
        analysis_result: analysisResult,
        frontend_parameters: {
          course_title: 'Role Bridge Course',
        },
        vectorized_documents: false,
      } as GenerationJobInput,
      1
    );

    expect(constraints?.lessonsPerSectionBudget).toBe(7);
  });
});
