/**
 * Lesson presentation helpers for V2 Spec Generator
 * @module stages/stage5-generation/phases/phase3-v2-spec-generator/lesson-helpers
 *
 * Extracted from phase3-v2-spec-generator.ts to comply with max-lines rule.
 */

import type {
  LearningObjectiveV2,
  LessonMetadataV2,
  ContentToneV2,
  ComplianceLevelV2,
  TargetAudienceV2,
} from '@megacampus/shared-types/lesson-specification-v2';
import type { SectionBreakdown, AnalysisResult } from '@megacampus/shared-types/analysis-result';
import { V2_SPEC_DEFAULTS } from './constants';

/**
 * Build lesson metadata
 */
export function buildLessonMetadata(
  targetAudience: TargetAudienceV2,
  contentArchetype: 'code_tutorial' | 'concept_explainer' | 'case_study' | 'legal_warning',
  analysisResult: AnalysisResult
): LessonMetadataV2 {
  const analysisTone = analysisResult.generation_guidance?.tone;
  const tone: ContentToneV2 =
    analysisTone === 'formal academic' ? 'formal' : 'conversational-professional';

  const complianceLevel: ComplianceLevelV2 =
    contentArchetype === 'legal_warning' ? 'strict' : 'standard';

  return {
    target_audience: targetAudience,
    tone,
    compliance_level: complianceLevel,
    content_archetype: contentArchetype,
  };
}

/**
 * Estimate lesson duration based on section data
 */
export function estimateLessonDuration(section: SectionBreakdown, objectiveCount: number): number {
  if (section.estimated_duration_hours) {
    const sectionMinutes = section.estimated_duration_hours * 60;
    const lessonCount = section.estimated_lessons || V2_SPEC_DEFAULTS.DEFAULT_LESSONS_PER_SECTION;
    const baseMinutes = Math.floor(sectionMinutes / lessonCount);
    return Math.min(45, Math.max(3, baseMinutes));
  }

  const baseMinutes = V2_SPEC_DEFAULTS.DEFAULT_LESSON_DURATION_MINUTES;
  const adjusted = baseMinutes + objectiveCount * 3;
  return Math.min(45, Math.max(3, adjusted));
}

/**
 * Generate lesson title
 */
export function generateLessonTitle(
  area: string,
  lessonNumber: number,
  totalLessons: number
): string {
  if (totalLessons === 1) {
    return area;
  }

  const progressions = [
    'Introduction to',
    'Deep Dive:',
    'Advanced',
    'Practical Applications of',
    'Mastering',
  ];

  const progressionIndex = Math.min(lessonNumber - 1, progressions.length - 1);
  return `${progressions[progressionIndex]} ${area}`;
}

/**
 * Generate lesson description
 */
export function generateLessonDescription(
  section: SectionBreakdown,
  lessonNumber: number,
  totalLessons: number,
  objectives: LearningObjectiveV2[]
): string {
  const mainObjective = objectives[0]?.objective || section.area;

  if (totalLessons === 1) {
    return `This lesson covers ${section.area}. You will learn to ${mainObjective.toLowerCase()}.`;
  }

  return `Lesson ${lessonNumber} of ${totalLessons} in the ${section.area} series. Focus: ${mainObjective}`;
}

/**
 * Distribute learning objectives across lessons
 */
export function distributeLearningObjectives(
  objectives: string[],
  lessonIndex: number,
  totalLessons: number
): string[] {
  if (objectives.length === 0) {
    return [];
  }

  if (totalLessons === 1) {
    return objectives;
  }

  const objectivesPerLesson = Math.max(1, Math.ceil(objectives.length / totalLessons));
  const startIndex = lessonIndex * objectivesPerLesson;
  const endIndex = Math.min(startIndex + objectivesPerLesson, objectives.length);

  const lessonObjectives = objectives.slice(startIndex, endIndex);

  if (lessonObjectives.length === 0 && lessonIndex === totalLessons - 1) {
    return [objectives[objectives.length - 1]];
  }

  return lessonObjectives;
}
