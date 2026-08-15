import type { CourseMetadata, GenerationJobInput, Section } from '@megacampus/shared-types';
import { getCourseSizePreset } from '@megacampus/shared-types';
import {
  resolveCourseStructureProfile,
  isCareerPlaybookBridgeSettings,
  type CourseStructureProfile,
} from '@/shared/course-structure-policy';

export type StructuralIssueSeverity = 'critical' | 'warning';
type StructuralIssueDetailsValue = string | number | boolean | null | string[] | number[];

export interface StructuralQualityIssue {
  code:
    | 'hard_max_lessons_exceeded'
    | 'soft_max_lessons_exceeded'
    | 'duration_mismatch'
    | 'duplicate_lesson_titles'
    | 'lesson_objective_overload'
    | 'invalid_section_lesson_budget'
    | 'section_count_out_of_bounds'
    | 'senior_role_beginner_level';
  severity: StructuralIssueSeverity;
  message: string;
  details?: Record<string, StructuralIssueDetailsValue>;
}

export interface StructuralQualityResult {
  passed: boolean;
  hasCriticalIssues: boolean;
  profileId: CourseStructureProfile['id'];
  totalLessons: number;
  computedDurationHours: number;
  criticalIssues: StructuralQualityIssue[];
  warnings: StructuralQualityIssue[];
}

interface ValidateStructuralQualityInput {
  input: GenerationJobInput;
  metadata: Pick<CourseMetadata, 'estimated_duration_hours' | 'difficulty_level'>;
  sections: Section[];
}

function getFrontendSettings(input: GenerationJobInput): unknown {
  return (input.frontend_parameters as { settings?: unknown }).settings;
}

/**
 * Judge the structure against the profile it was built to.
 *
 * `resolveCourseStructureProfile` only reaches its explicit-size branch when it
 * is given the size bounds, and Stage 4 gives them: it sizes and normalises the
 * structure from the `course_size` preset. This validator passed the size name
 * alone, silently fell through to `general_auto`, and then called the result
 * critical for obeying Stage 4. A live micro course (mc2-2pplo, 2026-08-15)
 * came out as 1 section and 3 lessons - exactly the micro preset - and was
 * marked `section_count_out_of_bounds` because `general_auto` wants 4-8
 * sections, which hard-blocks Stage 6.
 */
function resolveProfile(input: GenerationJobInput): CourseStructureProfile {
  const courseSize = input.frontend_parameters?.course_size;
  const preset = courseSize ? getCourseSizePreset(courseSize) : undefined;
  return resolveCourseStructureProfile({
    courseSize,
    settings: getFrontendSettings(input),
    minLessons: preset?.minLessons,
    maxLessons: preset?.maxLessons,
    targetLessons: preset?.targetLessons,
    targetSections: preset?.targetSections,
  });
}

function isSeniorRoleCourse(input: GenerationJobInput): boolean {
  const settings = getFrontendSettings(input);
  if (!isCareerPlaybookBridgeSettings(settings)) return false;

  const text = [
    input.frontend_parameters?.course_title,
    input.frontend_parameters?.target_audience,
    input.analysis_result?.topic_analysis?.determined_topic,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return /senior|lead|head|principal|director|руковод|лид|старш/.test(text);
}

function maxObjectivesForDuration(durationMinutes: number): number {
  return durationMinutes <= 15 ? 3 : 5;
}

function pushIssue(
  issues: StructuralQualityIssue[],
  severity: StructuralIssueSeverity,
  code: StructuralQualityIssue['code'],
  message: string,
  details?: Record<string, StructuralIssueDetailsValue>
): void {
  issues.push({ severity, code, message, ...(details ? { details } : {}) });
}

export function validateStructuralQuality({
  input,
  metadata,
  sections,
}: ValidateStructuralQualityInput): StructuralQualityResult {
  const profile = resolveProfile(input);
  const issues: StructuralQualityIssue[] = [];
  const totalLessons = sections.reduce((sum, section) => sum + (section.lessons?.length ?? 0), 0);
  const totalSections = sections.length;
  const computedDurationMinutes = sections.reduce(
    (sum, section) =>
      sum +
      (section.lessons ?? []).reduce(
        (lessonSum, lesson) => lessonSum + (lesson.estimated_duration_minutes || 0),
        0
      ),
    0
  );
  const computedDurationHours = Number((computedDurationMinutes / 60).toFixed(2));

  if (totalLessons > profile.hardMaxLessons) {
    pushIssue(
      issues,
      'critical',
      'hard_max_lessons_exceeded',
      `Course has ${totalLessons} lessons; ${profile.id} allows at most ${profile.hardMaxLessons}.`,
      { totalLessons, hardMaxLessons: profile.hardMaxLessons }
    );
  } else if (totalLessons > profile.softMaxLessons) {
    pushIssue(
      issues,
      'warning',
      'soft_max_lessons_exceeded',
      `Course has ${totalLessons} lessons; ${profile.id} target is ${profile.softMaxLessons} or fewer.`,
      { totalLessons, softMaxLessons: profile.softMaxLessons }
    );
  }

  if (totalSections < profile.minSections || totalSections > profile.maxSections) {
    pushIssue(
      issues,
      'critical',
      'section_count_out_of_bounds',
      `Course has ${totalSections} sections; ${profile.id} requires ${profile.minSections}-${profile.maxSections}.`,
      {
        totalSections,
        minSections: profile.minSections,
        maxSections: profile.maxSections,
      }
    );
  }

  const metadataDuration = metadata.estimated_duration_hours;
  if (typeof metadataDuration === 'number' && metadataDuration > 0 && computedDurationHours > 0) {
    const mismatchRatio =
      Math.abs(metadataDuration - computedDurationHours) / Math.max(computedDurationHours, 0.1);
    if (mismatchRatio > 0.1 && Math.abs(metadataDuration - computedDurationHours) > 0.25) {
      pushIssue(
        issues,
        'critical',
        'duration_mismatch',
        `Metadata duration ${metadataDuration}h does not match actual ${computedDurationHours}h.`,
        { metadataDuration, computedDurationHours, mismatchRatio }
      );
    }
  }

  const titleCounts = new Map<string, number>();
  for (const section of sections) {
    const lessonCount = section.lessons?.length ?? 0;
    if (lessonCount < 1) {
      pushIssue(
        issues,
        'critical',
        'invalid_section_lesson_budget',
        `Section ${section.section_number ?? '?'} has no lessons.`,
        { sectionNumber: section.section_number ?? null }
      );
    }

    for (const lesson of section.lessons ?? []) {
      const normalizedTitle = lesson.lesson_title.trim().toLowerCase();
      titleCounts.set(normalizedTitle, (titleCounts.get(normalizedTitle) ?? 0) + 1);

      const objectiveCount = lesson.lesson_objectives?.length ?? 0;
      const maxObjectives = maxObjectivesForDuration(lesson.estimated_duration_minutes);
      if (objectiveCount > maxObjectives) {
        pushIssue(
          issues,
          'critical',
          'lesson_objective_overload',
          `Lesson "${lesson.lesson_title}" has ${objectiveCount} objectives; ${lesson.estimated_duration_minutes} min allows ${maxObjectives}.`,
          {
            lessonTitle: lesson.lesson_title,
            objectiveCount,
            maxObjectives,
            durationMinutes: lesson.estimated_duration_minutes,
          }
        );
      }
    }
  }

  const duplicateTitles = Array.from(titleCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([title]) => title);
  if (duplicateTitles.length > 0) {
    pushIssue(
      issues,
      'critical',
      'duplicate_lesson_titles',
      `Duplicate lesson titles found: ${duplicateTitles.join(', ')}.`,
      { duplicateTitles }
    );
  }

  if (isSeniorRoleCourse(input) && metadata.difficulty_level === 'beginner') {
    pushIssue(
      issues,
      'critical',
      'senior_role_beginner_level',
      'Senior role bridge course cannot be classified as purely beginner.',
      { difficultyLevel: metadata.difficulty_level }
    );
  }

  const criticalIssues = issues.filter(issue => issue.severity === 'critical');
  const warnings = issues.filter(issue => issue.severity === 'warning');

  return {
    passed: criticalIssues.length === 0,
    hasCriticalIssues: criticalIssues.length > 0,
    profileId: profile.id,
    totalLessons,
    computedDurationHours,
    criticalIssues,
    warnings,
  };
}

export function reconcileCourseMetadata(
  metadata: CourseMetadata,
  sections: Section[],
  input: GenerationJobInput
): CourseMetadata {
  const computedDurationMinutes = sections.reduce(
    (sum, section) =>
      sum +
      (section.lessons ?? []).reduce(
        (lessonSum, lesson) => lessonSum + (lesson.estimated_duration_minutes || 0),
        0
      ),
    0
  );
  const reconciled: CourseMetadata = {
    ...metadata,
    estimated_duration_hours: Number((computedDurationMinutes / 60).toFixed(2)),
  };

  if (isSeniorRoleCourse(input) && reconciled.difficulty_level === 'beginner') {
    reconciled.difficulty_level = 'intermediate';
  }

  return reconciled;
}
