import { CALCULATION_EXPLANATION_MIN_LENGTH, informationLength } from '@megacampus/shared-types';

export type CourseStructureProfileId = 'general_auto' | 'role_playbook_bridge' | 'explicit_size';

export interface CourseStructureProfile {
  id: CourseStructureProfileId;
  label: string;
  minLessons: number;
  targetLessonsMin: number;
  targetLessonsMax: number;
  softMaxLessons: number;
  hardMaxLessons: number;
  minSections: number;
  maxSections: number;
  targetSections: number;
  llmGuidance: string;
}

interface ResolveProfileInput {
  profileId?: CourseStructureProfileId;
  courseSize?: string | null;
  settings?: unknown;
  minLessons?: number;
  maxLessons?: number;
  targetLessons?: number;
  targetSections?: number;
}

type SectionLike = {
  area: string;
  estimated_lessons: number;
  importance: 'simple' | 'normal' | 'complex';
  learning_objectives: string[];
  key_topics: string[];
  pedagogical_approach: string;
  section_id?: string;
  estimated_duration_hours?: number;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
};

type RecommendedStructureLike = {
  estimated_content_hours: number;
  scope_reasoning: string;
  lesson_duration_minutes: number;
  calculation_explanation: string;
  total_lessons: number;
  total_sections: number;
  scope_warning: string | null;
  sections_breakdown: SectionLike[];
};

export const GENERAL_AUTO_PROFILE: CourseStructureProfile = {
  id: 'general_auto',
  label: 'general auto',
  minLessons: 10,
  targetLessonsMin: 16,
  targetLessonsMax: 28,
  softMaxLessons: 32,
  hardMaxLessons: 40,
  minSections: 4,
  maxSections: 8,
  targetSections: 6,
  llmGuidance:
    'AUTO mode must produce the smallest complete course that satisfies the learning outcomes. ' +
    'Target 16-28 lessons in 4-8 sections. Do not broaden the topic just to add more content. ' +
    'Use up to 32 lessons only when the source material clearly requires it; never exceed 40 lessons.',
};

export const ROLE_PLAYBOOK_BRIDGE_PROFILE: CourseStructureProfile = {
  id: 'role_playbook_bridge',
  label: 'Career Playbook role bridge',
  minLessons: 12,
  targetLessonsMin: 18,
  targetLessonsMax: 24,
  softMaxLessons: 24,
  hardMaxLessons: 30,
  minSections: 5,
  maxSections: 7,
  targetSections: 6,
  llmGuidance:
    'Career Playbook bridge courses must be practical onboarding/upskilling paths, not encyclopedic role guides. ' +
    'Target 18-24 lessons in 5-7 sections. Keep only role-critical decisions, workflows, metrics, and practice. ' +
    'Never exceed 30 lessons.',
};

export function isCareerPlaybookBridgeSettings(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object') return false;
  const record = settings as Record<string, unknown>;
  return record.source === 'career_playbook' || record.bridgeVersion === 1;
}

export function resolveCourseStructureProfile(input: ResolveProfileInput): CourseStructureProfile {
  if (input.profileId === 'role_playbook_bridge') {
    return ROLE_PLAYBOOK_BRIDGE_PROFILE;
  }

  if (input.profileId === 'general_auto') {
    return GENERAL_AUTO_PROFILE;
  }

  if (input.courseSize && input.courseSize !== 'auto' && input.maxLessons) {
    const targetLessons = input.targetLessons ?? input.maxLessons;
    const targetSections = input.targetSections ?? Math.max(1, Math.round(targetLessons / 5));
    return {
      id: 'explicit_size',
      label: String(input.courseSize),
      minLessons: input.minLessons ?? 1,
      targetLessonsMin: Math.max(input.minLessons ?? 1, Math.floor(targetLessons * 0.8)),
      targetLessonsMax: Math.min(input.maxLessons, Math.ceil(targetLessons * 1.2)),
      softMaxLessons: input.maxLessons,
      hardMaxLessons: input.maxLessons,
      minSections: Math.max(1, Math.min(targetSections, targetSections - 1)),
      maxSections: targetSections,
      targetSections,
      llmGuidance: `Explicit ${input.courseSize} course size. Stay within ${input.minLessons ?? 1}-${input.maxLessons} lessons and ${targetSections} sections.`,
    };
  }

  if (isCareerPlaybookBridgeSettings(input.settings)) {
    return ROLE_PLAYBOOK_BRIDGE_PROFILE;
  }

  return GENERAL_AUTO_PROFILE;
}

function mergeSectionTail(sections: SectionLike[], maxSections: number): SectionLike[] {
  if (sections.length <= maxSections) return sections;
  const kept = sections.slice(0, Math.max(1, maxSections - 1));
  const tail = sections.slice(Math.max(1, maxSections - 1));
  const firstTail = tail[0];

  kept.push({
    ...firstTail,
    area: `${firstTail.area} and consolidated role practice`,
    estimated_lessons: tail.reduce((sum, section) => sum + section.estimated_lessons, 0),
    learning_objectives: Array.from(
      new Set(tail.flatMap(section => section.learning_objectives))
    ).slice(0, 5),
    key_topics: Array.from(new Set(tail.flatMap(section => section.key_topics))).slice(0, 8),
    section_id: String(kept.length + 1),
    estimated_duration_hours: tail.reduce(
      (sum, section) => sum + (section.estimated_duration_hours ?? 0),
      0
    ),
    difficulty: tail.some(section => section.difficulty === 'advanced')
      ? 'advanced'
      : tail.some(section => section.difficulty === 'intermediate')
        ? 'intermediate'
        : firstTail.difficulty,
  });

  return kept;
}

function expandSectionsToMinimum(sections: SectionLike[], minSections: number): SectionLike[] {
  const expanded = [...sections];

  while (expanded.length < minSections) {
    let splitIndex = -1;
    let largestLessonBudget = 1;

    for (let index = 0; index < expanded.length; index++) {
      if (expanded[index].estimated_lessons > largestLessonBudget) {
        largestLessonBudget = expanded[index].estimated_lessons;
        splitIndex = index;
      }
    }

    if (splitIndex === -1) break;

    const original = expanded[splitIndex];
    const firstBudget = Math.ceil(original.estimated_lessons / 2);
    const secondBudget = original.estimated_lessons - firstBudget;

    expanded.splice(
      splitIndex,
      1,
      {
        ...original,
        area: `${original.area} - foundations`,
        estimated_lessons: firstBudget,
      },
      {
        ...original,
        area: `${original.area} - applied practice`,
        estimated_lessons: Math.max(1, secondBudget),
      }
    );
  }

  return expanded;
}

function distributeLessonBudget(sections: SectionLike[], targetTotal: number): SectionLike[] {
  const currentTotal = sections.reduce((sum, section) => sum + section.estimated_lessons, 0);
  if (currentTotal === targetTotal) return sections;

  const ratio = targetTotal / Math.max(1, currentTotal);
  const normalized = sections.map(section => ({
    ...section,
    estimated_lessons: Math.max(1, Math.floor(section.estimated_lessons * ratio)),
  }));

  let total = normalized.reduce((sum, section) => sum + section.estimated_lessons, 0);
  while (total > targetTotal) {
    const index = normalized.findIndex(section => section.estimated_lessons > 1);
    if (index === -1) break;
    normalized[index].estimated_lessons -= 1;
    total -= 1;
  }
  let cursor = 0;
  while (total < targetTotal && normalized.length > 0) {
    normalized[cursor % normalized.length].estimated_lessons += 1;
    total += 1;
    cursor += 1;
  }

  return normalized;
}

export function normalizeRecommendedStructure<T extends RecommendedStructureLike>(
  structure: T,
  profile: CourseStructureProfile
): T {
  const originalLessons = structure.total_lessons;
  const originalSections = structure.total_sections;
  const lessonDuration = structure.lesson_duration_minutes || 15;

  let sections = structure.sections_breakdown.map(section => ({
    ...section,
    estimated_lessons: Math.max(1, Math.round(section.estimated_lessons || 1)),
  }));

  sections = mergeSectionTail(sections, profile.maxSections);
  sections = expandSectionsToMinimum(sections, profile.minSections);

  let targetTotal = sections.reduce((sum, section) => sum + section.estimated_lessons, 0);
  targetTotal = Math.min(profile.hardMaxLessons, Math.max(profile.minLessons, targetTotal));
  sections = distributeLessonBudget(sections, targetTotal).map((section, index) => ({
    ...section,
    section_id: section.section_id ?? String(index + 1),
    estimated_duration_hours: Number(
      ((section.estimated_lessons * lessonDuration) / 60).toFixed(2)
    ),
  }));

  const totalLessons = sections.reduce((sum, section) => sum + section.estimated_lessons, 0);
  const contentHours = Number(((totalLessons * lessonDuration) / 60).toFixed(2));
  const changed = originalLessons !== totalLessons || originalSections !== sections.length;
  const warning = changed
    ? `Normalized by ${profile.id}: ${originalLessons} lessons/${originalSections} sections -> ${totalLessons} lessons/${sections.length} sections.`
    : structure.scope_warning;

  return {
    ...structure,
    sections_breakdown: sections,
    total_lessons: totalLessons,
    total_sections: sections.length,
    estimated_content_hours: contentHours,
    calculation_explanation: buildCalculationExplanation(structure.calculation_explanation, {
      totalLessons,
      lessonDuration,
      contentHours,
      profile,
    }),
    scope_warning: changed
      ? [structure.scope_warning, warning].filter(Boolean).join(' ')
      : structure.scope_warning,
  };
}

/**
 * Compose the explanation of the scope arithmetic, keeping what the model wrote.
 *
 * Two things have to be true of the result at once, and until 2026-08-25 the
 * first quietly cost the second.
 *
 * It has to describe the structure that survived normalization, not the one the
 * model proposed — those differ whenever a profile bound moves the lesson count,
 * and a stale sum is worse than none. So the arithmetic is recomputed here.
 *
 * And it has to satisfy `Phase2OutputSchema`, which requires
 * `CALCULATION_EXPLANATION_MIN_LENGTH` characters. The old code met the first by
 * overwriting the field with the arithmetic alone, and then met the second by
 * luck: `"6 lessons x 10 minutes = 1 hours (micro profile)"` is 48 characters.
 * Whole-number hours cost two characters, a single-digit duration one more, and
 * a short profile label several — 176 combinations of (profile x duration x
 * lesson count) land under the floor, all of them on explicit-size profiles
 * whose label is a bare word like `micro`. Every course in the database sits at
 * 50 or 51 characters, one character from the edge.
 *
 * When a course fell over it, Zod rejected the second parse in
 * `postProcessAndValidate`, Stage 4 bailed out, BullMQ retried three times and
 * the course died having already been paid for — $0.004728 across six calls on
 * course 7b1837c7, four of them the same scope call (mc2-zwp7f).
 *
 * So: keep the model's sentence, append the recomputed arithmetic, and if the
 * two together are still short, state the profile's own bounds. Every clause is
 * a fact about this course; none is padding. The floor is now met by
 * construction, and `course-structure-policy.test.ts` walks the whole grid to
 * prove it rather than trusting one example.
 */
function buildCalculationExplanation(
  modelExplanation: string | undefined,
  scope: {
    totalLessons: number;
    lessonDuration: number;
    contentHours: number;
    profile: CourseStructureProfile;
  }
): string {
  const { totalLessons, lessonDuration, contentHours, profile } = scope;

  const arithmetic = `Normalized structure: ${totalLessons} lessons x ${lessonDuration} minutes = ${contentHours} hours (${profile.label} profile).`;
  const composed = [modelExplanation?.trim(), arithmetic].filter(Boolean).join(' ');

  // The schema's own predicate, not a restatement of it: `informationLength`
  // weights a Han, Kana or Hangul character as two, so a Chinese explanation is
  // measured the way it will be validated.
  if (informationLength(composed) >= CALCULATION_EXPLANATION_MIN_LENGTH) return composed;

  return `${composed} Profile ${profile.id} allows ${profile.minLessons}-${profile.hardMaxLessons} lessons in ${profile.minSections}-${profile.maxSections} sections.`;
}
