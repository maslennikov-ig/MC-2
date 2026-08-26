import { describe, expect, it } from 'vitest';
import {
  COURSE_SIZE_PRESETS,
  Phase2OutputSchema,
  PRESET_COURSE_SIZES,
} from '@megacampus/shared-types';
import {
  normalizeRecommendedStructure,
  resolveCourseStructureProfile,
} from '@/shared/course-structure-policy';

/** The validator Stage 4 actually runs this field through. */
const calculationExplanationSchema =
  Phase2OutputSchema.shape.recommended_structure.shape.calculation_explanation;

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

/**
 * The explanation Stage 4 writes has to pass the schema Stage 4 then validates
 * it with — for every shape of course, not for the one somebody tried.
 *
 * It did not. `normalizeRecommendedStructure` overwrote the field with
 * `"6 lessons x 10 minutes = 1 hours (micro profile)"` — 48 characters against a
 * floor of 50 — and Zod rejected it on the second parse in
 * `postProcessAndValidate`. Stage 4 bailed out, BullMQ retried three times, and
 * a course that had already paid for six calls died (mc2-zwp7f).
 *
 * Whole-number hours cost two characters, a single-digit lesson duration one
 * more, and a bare profile label like `micro` several: 176 combinations landed
 * under the floor and every course in the database sat at 50 or 51 characters,
 * one character from the edge. No single example would have caught that, which
 * is why this walks the grid.
 */
describe('the explanation of the scope arithmetic', () => {
  const PROFILES = [
    resolveCourseStructureProfile({ courseSize: 'auto', settings: {} }),
    resolveCourseStructureProfile({
      courseSize: 'auto',
      settings: { source: 'career_playbook', bridgeVersion: 1 },
    }),
    // The explicit-size profiles, resolved from the real presets the way
    // `phase-2-scope-helpers` resolves them. Their label is a bare word and
    // therefore the shortest, and every failing combination was one of these —
    // `micro` above all, whose preset asks the model for at most one hour, and
    // a whole number of hours is what costs the two characters.
    ...PRESET_COURSE_SIZES.map(courseSize => {
      const preset = COURSE_SIZE_PRESETS[courseSize];
      return resolveCourseStructureProfile({
        courseSize,
        minLessons: preset.minLessons,
        maxLessons: preset.maxLessons,
        targetLessons: preset.targetLessons,
        targetSections: preset.targetSections,
      });
    }),
  ];
  const DURATIONS = [3, 5, 10, 15, 20, 25, 30, 35, 40, 45];

  /** A structure of `sectionCount` sections carrying `lessons` lessons each. */
  function proposing(sectionCount: number, lessonsPerSection: number, duration: number) {
    return {
      ...baseStructure,
      lesson_duration_minutes: duration,
      total_lessons: sectionCount * lessonsPerSection,
      total_sections: sectionCount,
      sections_breakdown: Array.from({ length: sectionCount }, (_, index) => ({
        ...baseStructure.sections_breakdown[0],
        area: `Section ${index + 1}`,
        estimated_lessons: lessonsPerSection,
        section_id: `${index + 1}`,
      })),
    };
  }

  it('satisfies the schema for every profile, duration and course size', () => {
    const rejected: string[] = [];

    for (const profile of PROFILES) {
      for (const duration of DURATIONS) {
        for (let sections = 1; sections <= 8; sections++) {
          for (const lessonsPerSection of [1, 2, 5]) {
            const normalized = normalizeRecommendedStructure(
              proposing(sections, lessonsPerSection, duration),
              profile
            );
            if (!calculationExplanationSchema.safeParse(normalized.calculation_explanation).success)
              rejected.push(
                `${profile.id}/${profile.label} ${sections}x${lessonsPerSection} @${duration}min: ` +
                  `${JSON.stringify(normalized.calculation_explanation)}`
              );
          }
        }
      }
    }

    // Before the fix this listed eight, led by
    // `"4 lessons x 15 minutes = 1 hours (micro profile)"` — 48 characters, and
    // the shape of micro course the preset asks the model for.
    expect(rejected).toEqual([]);
  });

  it('holds when the model wrote nothing to keep', () => {
    // `applyStructureDefaults` fills this in before the first parse, but the
    // normalizer must not depend on somebody upstream having done so.
    const profile = resolveCourseStructureProfile({ courseSize: 'micro', maxLessons: 3 });
    const normalized = normalizeRecommendedStructure(
      { ...proposing(1, 1, 3), calculation_explanation: '' },
      profile
    );

    expect(calculationExplanationSchema.safeParse(normalized.calculation_explanation).success).toBe(
      true
    );
  });

  it('keeps what the model wrote and states the totals that survived normalization', () => {
    const profile = resolveCourseStructureProfile({ courseSize: 'auto', settings: {} });
    const normalized = normalizeRecommendedStructure(baseStructure, profile);

    // The model's sentence is the point of a free-text field; the old code threw
    // it away and kept only the arithmetic.
    expect(normalized.calculation_explanation).toContain(baseStructure.calculation_explanation);
    // And the arithmetic describes the structure that survived — 50 lessons went
    // in, the general auto profile caps at 40.
    expect(normalized.total_lessons).toBe(40);
    expect(normalized.calculation_explanation).toContain('Normalized structure: 40 lessons');
  });

  it('measures a Chinese explanation the way the schema will', () => {
    // A floor in characters is a claim about a writing system. Five of them,
    // each hidden behind the last, once made a correct Chinese course
    // impossible to produce (mc2-v6fqp); this field kept a bare `.min(50)`.
    const profile = resolveCourseStructureProfile({ courseSize: 'micro', maxLessons: 3 });
    const normalized = normalizeRecommendedStructure(
      { ...proposing(1, 3, 15), calculation_explanation: '三节课，每节十五分钟，合计四十五分钟。' },
      profile
    );

    expect(calculationExplanationSchema.safeParse(normalized.calculation_explanation).success).toBe(
      true
    );
    expect(normalized.calculation_explanation).toContain('三节课');
  });
});
