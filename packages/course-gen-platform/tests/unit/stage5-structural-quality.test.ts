import { describe, expect, it } from 'vitest';
import type { GenerationJobInput, Section } from '@megacampus/shared-types';
import { validateStructuralQuality } from '@/stages/stage5-generation/validators/structural-quality-validator';
import { createFullAnalysisResult } from '../fixtures/analysis-result-fixture';

function makeLesson(index: number, objectives: string[] = ['Explain one focused concept']) {
  return {
    lesson_number: index,
    lesson_title: `Senior KPI attribution lesson ${index}`,
    lesson_objectives: objectives,
    key_topics: ['attribution model', 'content ROI'],
    estimated_duration_minutes: 15,
  };
}

function makeSection(sectionNumber: number, lessonCount: number): Section {
  return {
    section_number: sectionNumber,
    section_title: `Senior Content Management Section ${sectionNumber}`,
    section_description:
      'Practical senior-level content management capabilities for measurable business impact.',
    learning_objectives: ['Apply senior content management practices in business context'],
    lessons: Array.from({ length: lessonCount }, (_, index) => ({
      ...makeLesson(index + 1),
      lesson_title: `Senior KPI attribution lesson ${sectionNumber}.${index + 1}`,
    })),
    estimated_duration_minutes: lessonCount * 15,
  };
}

function makeInput(): GenerationJobInput {
  const analysis = createFullAnalysisResult('Senior Content Manager');
  analysis.recommended_structure.total_lessons = 24;
  analysis.recommended_structure.total_sections = 6;
  analysis.recommended_structure.lesson_duration_minutes = 15;

  return {
    course_id: '550e8400-e29b-41d4-a716-446655440000',
    organization_id: '550e8400-e29b-41d4-a716-446655440001',
    user_id: '550e8400-e29b-41d4-a716-446655440002',
    analysis_result: analysis,
    frontend_parameters: {
      course_title: 'Senior Content Manager',
      target_audience: 'Senior content manager and content lead',
      course_size: 'auto',
      lesson_duration_minutes: 15,
      settings: {
        source: 'career_playbook',
        bridgeVersion: 1,
      },
    },
    vectorized_documents: false,
  } as GenerationJobInput;
}

describe('Stage 5 structural quality validator', () => {
  it('marks overloaded Career Playbook structures as critical and blocks approval', () => {
    const sections = [makeSection(1, 16), makeSection(2, 16)];
    sections[0].lessons[0].lesson_title = 'Duplicate lesson title';
    sections[1].lessons[0].lesson_title = 'Duplicate lesson title';
    sections[0].lessons[1].lesson_objectives = [
      'Explain one focused concept',
      'Apply one focused concept',
      'Evaluate one focused concept',
      'Create one focused concept',
    ];

    const result = validateStructuralQuality({
      input: makeInput(),
      metadata: {
        estimated_duration_hours: 45,
        difficulty_level: 'beginner',
      },
      sections,
    });

    expect(result.passed).toBe(false);
    expect(result.hasCriticalIssues).toBe(true);
    expect(result.criticalIssues.map(issue => issue.code)).toEqual(
      expect.arrayContaining([
        'hard_max_lessons_exceeded',
        'duration_mismatch',
        'duplicate_lesson_titles',
        'lesson_objective_overload',
        'senior_role_beginner_level',
      ])
    );
  });

  it('passes a focused role bridge structure with consistent duration', () => {
    const sections = [makeSection(1, 4), makeSection(2, 4), makeSection(3, 4), makeSection(4, 4)];

    const result = validateStructuralQuality({
      input: makeInput(),
      metadata: {
        estimated_duration_hours: 4,
        difficulty_level: 'intermediate',
      },
      sections,
    });

    expect(result.passed).toBe(true);
    expect(result.criticalIssues).toHaveLength(0);
  });
});
