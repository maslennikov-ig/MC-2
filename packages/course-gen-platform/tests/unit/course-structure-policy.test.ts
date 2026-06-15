import { describe, expect, it } from 'vitest';
import {
  normalizeRecommendedStructure,
  resolveCourseStructureProfile,
} from '@/shared/course-structure-policy';

const baseStructure = {
  estimated_content_hours: 12.5,
  scope_reasoning:
    'The source material is broad, but the course should stay focused on the smallest complete learning path.',
  lesson_duration_minutes: 15,
  calculation_explanation: '50 lessons x 15 minutes = 12.5 hours',
  total_lessons: 50,
  total_sections: 10,
  scope_warning: null,
  sections_breakdown: Array.from({ length: 10 }, (_, index) => ({
    area: `Section ${index + 1}`,
    estimated_lessons: 5,
    importance: 'normal' as const,
    learning_objectives: ['Explain the role practice', 'Apply the role practice'],
    key_topics: ['topic one', 'topic two', 'topic three'],
    pedagogical_approach:
      'Focused practical sequence with examples, guided practice, and job-context reflection.',
    section_id: `${index + 1}`,
    estimated_duration_hours: 1.25,
    difficulty: 'intermediate' as const,
  })),
};

describe('course structure policy', () => {
  it('resolves auto courses to the general auto profile', () => {
    const profile = resolveCourseStructureProfile({
      courseSize: 'auto',
      settings: {},
    });

    expect(profile.id).toBe('general_auto');
    expect(profile.hardMaxLessons).toBe(40);
  });

  it('resolves Career Playbook bridge courses to the compact role bridge profile', () => {
    const profile = resolveCourseStructureProfile({
      courseSize: 'auto',
      settings: { source: 'career_playbook', bridgeVersion: 1 },
    });

    expect(profile.id).toBe('role_playbook_bridge');
    expect(profile.hardMaxLessons).toBe(30);
  });

  it('normalizes general auto structures to the hard lesson cap and recomputes totals', () => {
    const profile = resolveCourseStructureProfile({ courseSize: 'auto', settings: {} });
    const normalized = normalizeRecommendedStructure(baseStructure, profile);

    expect(normalized.total_lessons).toBeLessThanOrEqual(40);
    expect(normalized.total_lessons).toBe(
      normalized.sections_breakdown.reduce((sum, section) => sum + section.estimated_lessons, 0)
    );
    expect(normalized.estimated_content_hours).toBeCloseTo(
      (normalized.total_lessons * normalized.lesson_duration_minutes) / 60,
      2
    );
  });

  it('normalizes Career Playbook bridge structures to 30 lessons or fewer', () => {
    const profile = resolveCourseStructureProfile({
      courseSize: 'auto',
      settings: { source: 'career_playbook', bridgeVersion: 1 },
    });
    const normalized = normalizeRecommendedStructure(baseStructure, profile);

    expect(normalized.total_lessons).toBeLessThanOrEqual(30);
    expect(normalized.total_sections).toBeGreaterThanOrEqual(5);
    expect(normalized.total_sections).toBeLessThanOrEqual(7);
    expect(normalized.scope_warning).toContain('role_playbook_bridge');
  });
});
