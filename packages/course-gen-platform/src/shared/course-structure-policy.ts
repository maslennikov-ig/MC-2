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
  const changed = originalLessons !== totalLessons || originalSections !== sections.length;
  const warning = changed
    ? `Normalized by ${profile.id}: ${originalLessons} lessons/${originalSections} sections -> ${totalLessons} lessons/${sections.length} sections.`
    : structure.scope_warning;

  return {
    ...structure,
    sections_breakdown: sections,
    total_lessons: totalLessons,
    total_sections: sections.length,
    estimated_content_hours: Number(((totalLessons * lessonDuration) / 60).toFixed(2)),
    calculation_explanation: `${totalLessons} lessons x ${lessonDuration} minutes = ${Number(
      ((totalLessons * lessonDuration) / 60).toFixed(2)
    )} hours (${profile.label} profile)`,
    scope_warning: changed
      ? [structure.scope_warning, warning].filter(Boolean).join(' ')
      : structure.scope_warning,
  };
}
