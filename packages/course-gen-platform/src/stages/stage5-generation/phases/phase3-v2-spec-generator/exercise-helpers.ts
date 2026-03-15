/**
 * Exercise specification helpers for V2 Spec Generator
 * @module stages/stage5-generation/phases/phase3-v2-spec-generator/exercise-helpers
 *
 * Extracted from phase3-v2-spec-generator.ts to comply with max-lines rule.
 */

import type {
  LearningObjectiveV2,
  ExerciseSpecV2,
  BloomLevelV2,
  ExerciseTypeV2,
  ExerciseDifficultyV2,
} from '@megacampus/shared-types/lesson-specification-v2';
import type { SectionBreakdown, AnalysisResult } from '@megacampus/shared-types/analysis-result';

/**
 * Map analysis exercise type to V2 exercise type
 */
export function mapExerciseType(
  analysisType: string | undefined,
  bloomLevel: BloomLevelV2
): ExerciseTypeV2 {
  if (analysisType) {
    const typeMap: Record<string, ExerciseTypeV2> = {
      coding: 'coding',
      debugging: 'debugging',
      refactoring: 'coding',
      analysis: 'conceptual',
      derivation: 'conceptual',
      interpretation: 'case_study',
    };
    if (typeMap[analysisType]) {
      return typeMap[analysisType];
    }
  }

  const bloomTypeMap: Record<BloomLevelV2, ExerciseTypeV2> = {
    remember: 'conceptual',
    understand: 'conceptual',
    apply: 'coding',
    analyze: 'case_study',
    evaluate: 'design',
    create: 'design',
  };

  return bloomTypeMap[bloomLevel];
}

/**
 * Infer exercise difficulty from Bloom's level and position
 */
export function inferExerciseDifficulty(
  bloomLevel: BloomLevelV2,
  position: number
): ExerciseDifficultyV2 {
  const difficultyMap: Record<BloomLevelV2, ExerciseDifficultyV2> = {
    remember: 'easy',
    understand: 'easy',
    apply: 'medium',
    analyze: 'medium',
    evaluate: 'hard',
    create: 'hard',
  };

  const baseDifficulty = difficultyMap[bloomLevel];
  if (position > 0 && baseDifficulty === 'easy') {
    return 'medium';
  }
  if (position > 0 && baseDifficulty === 'medium') {
    return 'hard';
  }

  return baseDifficulty;
}

/**
 * Generate exercise structure template
 */
export function generateExerciseTemplate(
  exerciseType: ExerciseTypeV2,
  area: string,
  objective: string
): string {
  const templates: Record<ExerciseTypeV2, string> = {
    coding: `Given a [specific scenario related to ${area}], implement a solution that [requirement based on: ${objective}]. Your code should [acceptance criteria].`,
    conceptual: `Based on your understanding of ${area}, explain [key concept] and describe how it relates to [application]. Your answer should demonstrate [criterion based on: ${objective}].`,
    case_study: `Analyze the following case study about ${area}: [scenario description]. Identify the key challenges and propose solutions that address [requirement based on: ${objective}].`,
    debugging: `The following code related to ${area} contains errors: [code snippet]. Identify and fix the bugs to make it correctly [expected behavior based on: ${objective}].`,
    design: `Design a solution for ${area} that addresses [problem statement]. Your design should include [components] and meet [requirements based on: ${objective}].`,
  };

  return templates[exerciseType];
}

/**
 * Generate rubric criteria for an exercise
 */
export function generateRubricCriteria(
  exerciseType: ExerciseTypeV2,
  _bloomLevel: BloomLevelV2
): ExerciseSpecV2['rubric_criteria'] {
  const criteriaByType: Record<ExerciseTypeV2, { criteria: string[]; weight: number }[]> = {
    coding: [
      { criteria: ['Code correctness and functionality'], weight: 40 },
      { criteria: ['Code quality and readability'], weight: 30 },
      { criteria: ['Handling edge cases'], weight: 30 },
    ],
    conceptual: [
      { criteria: ['Accuracy of explanation'], weight: 40 },
      { criteria: ['Depth of understanding demonstrated'], weight: 35 },
      { criteria: ['Clarity and organization'], weight: 25 },
    ],
    case_study: [
      { criteria: ['Analysis quality and insights'], weight: 40 },
      { criteria: ['Proposed solutions relevance'], weight: 35 },
      { criteria: ['Supporting evidence and reasoning'], weight: 25 },
    ],
    debugging: [
      { criteria: ['Bug identification accuracy'], weight: 40 },
      { criteria: ['Fix correctness'], weight: 40 },
      { criteria: ['Explanation of root cause'], weight: 20 },
    ],
    design: [
      { criteria: ['Design completeness and feasibility'], weight: 40 },
      { criteria: ['Meeting requirements'], weight: 35 },
      { criteria: ['Innovation and best practices'], weight: 25 },
    ],
  };

  return criteriaByType[exerciseType];
}

/**
 * Generate exercise specifications with rubric criteria
 */
export function generateExerciseSpecs(
  section: SectionBreakdown,
  objectives: LearningObjectiveV2[],
  analysisResult: AnalysisResult
): ExerciseSpecV2[] {
  if (objectives.length === 0) {
    return [];
  }

  const exercises: ExerciseSpecV2[] = [];
  const exerciseTypes = analysisResult.generation_guidance?.exercise_types || [];
  const numExercises = Math.min(2, objectives.length);

  for (let i = 0; i < numExercises; i++) {
    const objective = objectives[i];
    const exerciseType = mapExerciseType(
      exerciseTypes[i % exerciseTypes.length],
      objective.bloom_level
    );
    const difficulty = inferExerciseDifficulty(objective.bloom_level, i);

    exercises.push({
      type: exerciseType,
      difficulty,
      learning_objective_id: objective.id,
      structure_template: generateExerciseTemplate(exerciseType, section.area, objective.objective),
      rubric_criteria: generateRubricCriteria(exerciseType, objective.bloom_level),
    });
  }

  return exercises;
}
