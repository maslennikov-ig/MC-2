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

/** And the one it runs the whole normalized structure through, twice. */
const recommendedStructureSchema = Phase2OutputSchema.shape.recommended_structure;

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

/**
 * Every profile Stage 4 can resolve, every lesson duration the schema allows.
 *
 * The explicit-size ones are resolved from the real presets the way
 * `phase-2-scope-helpers` resolves them. They are where the edges live: their
 * label is a bare word and therefore the shortest, and `micro` allows a single
 * lesson, which is the smallest structure the normalizer can be asked to
 * describe.
 */
const PROFILES = [
  resolveCourseStructureProfile({ courseSize: 'auto', settings: {} }),
  resolveCourseStructureProfile({
    courseSize: 'auto',
    settings: { source: 'career_playbook', bridgeVersion: 1 },
  }),
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

/**
 * The same grid, asking the whole question.
 *
 * `mc2-zwp7f` walked every profile, duration and lesson count and then checked
 * one field of the result. Everything else the normalizer writes went
 * unexamined, and two more of its outputs are bounded by the schema that
 * validates them: `estimated_duration_hours` per section carried
 * `.min(0.5).max(20)`, and `estimated_content_hours` carried `.min(0.5)`.
 *
 * Both are arithmetic on inputs the schema has already validated — lessons x
 * `lesson_duration_minutes` / 60 — so both bounds are a second opinion that can
 * veto the first. A micro course of one 3-minute lesson computes 0.05 hours, ten
 * times under the floor; one section of 40 lessons at 45 minutes computes 30
 * hours, half again over the ceiling. Neither is a wrong number. Rejecting it
 * kills a paid course at the second parse in `postProcessAndValidate`, which is
 * exactly how `mc2-zwp7f` was found (mc2-ythy6).
 *
 * Clamping instead of rejecting would be worse than either: Stage 5 derives
 * lesson lengths back out of this field (`lesson-helpers.ts`), so a section
 * rounded up from 0.05 to 0.5 hands the learner 30-minute lessons the user never
 * asked for.
 */
describe('the structure the normalizer derives', () => {
  it('satisfies the schema whole, for every profile, duration and course size', () => {
    const rejected: string[] = [];

    for (const profile of PROFILES) {
      for (const duration of DURATIONS) {
        for (let sections = 1; sections <= 8; sections++) {
          for (const lessonsPerSection of [1, 2, 5]) {
            const normalized = normalizeRecommendedStructure(
              proposing(sections, lessonsPerSection, duration),
              profile
            );
            const parsed = recommendedStructureSchema.safeParse(normalized);
            if (!parsed.success)
              rejected.push(
                `${profile.id}/${profile.label} ${sections}x${lessonsPerSection} @${duration}min: ` +
                  parsed.error.issues
                    .map(issue => `${issue.path.join('.')} ${issue.message}`)
                    .join('; ')
              );
          }
        }
      }
    }

    // Before the fix this listed 451 of the 1440 combinations, in every profile
    // the repo has: 119 micro, 70 mini, 52 compact, 41 standard, 32
    // comprehensive, 70 general auto, 67 role bridge. 68 of them also broke the
    // course-level `estimated_content_hours` floor and 8 broke the section
    // ceiling from above, so both directions were live at once.
    expect(rejected).toEqual([]);
  });

  it('reports the hours it actually computed for the smallest course', () => {
    const preset = COURSE_SIZE_PRESETS.micro;
    const profile = resolveCourseStructureProfile({
      courseSize: 'micro',
      minLessons: preset.minLessons,
      maxLessons: preset.maxLessons,
      targetLessons: preset.targetLessons,
      targetSections: preset.targetSections,
    });
    const normalized = normalizeRecommendedStructure(proposing(1, 1, 3), profile);

    // One 3-minute lesson is three minutes, not thirty.
    expect(normalized.sections_breakdown[0].estimated_duration_hours).toBe(0.05);
    expect(normalized.estimated_content_hours).toBe(0.05);
  });

  it('reports the hours it actually computed for the longest section', () => {
    const profile = resolveCourseStructureProfile({
      courseSize: 'custom',
      minLessons: 40,
      maxLessons: 40,
      targetLessons: 40,
      targetSections: 1,
    });
    const normalized = normalizeRecommendedStructure(proposing(1, 40, 45), profile);

    expect(normalized.sections_breakdown).toHaveLength(1);
    expect(normalized.sections_breakdown[0].estimated_duration_hours).toBe(30);
    expect(recommendedStructureSchema.safeParse(normalized).success).toBe(true);
  });

  it('keeps the section hours summing to the course hours', () => {
    // The identity the two bounds would have broken the moment either clamped:
    // a section rounded up to the floor no longer belongs to the total beside it.
    for (const profile of PROFILES) {
      for (const duration of [3, 15, 45]) {
        const normalized = normalizeRecommendedStructure(proposing(3, 2, duration), profile);
        const summed = normalized.sections_breakdown.reduce(
          (sum, section) => sum + (section.estimated_duration_hours ?? 0),
          0
        );

        expect(summed).toBeCloseTo(normalized.estimated_content_hours, 2);
      }
    }
  });
});
