/**
 * Field Name Fix Utility
 *
 * Recursively transforms object field names from camelCase to snake_case
 * to normalize LLM outputs that don't follow schema conventions.
 *
 * This is a consolidated utility combining field mappings from:
 * - Stage 4 (Analysis): course categories, topic analysis, pedagogical patterns
 * - Stage 5 (Generation): course structure, lessons, exercises
 *
 * Common LLM field naming issues:
 * - courseTitle -> course_title
 * - lessonObjectives -> lesson_objectives
 * - estimatedDurationMinutes -> estimated_duration_minutes
 * - topicAnalysis -> topic_analysis
 * - pedagogicalStrategy -> pedagogical_strategy
 *
 * @module shared/utils/field-name-fix
 */

import logger from '@/shared/logger';

/**
 * Convert camelCase string to snake_case
 *
 * @param str - camelCase string
 * @returns snake_case string
 *
 * @example
 * ```typescript
 * camelToSnake('courseTitle') // 'course_title'
 * camelToSnake('estimatedDurationMinutes') // 'estimated_duration_minutes'
 * camelToSnake('alreadySnake_case') // 'already_snake_case'
 * ```
 */
function camelToSnake(str: string): string {
  // Replace uppercase letters with underscore + lowercase
  // Remove leading underscore if string starts with uppercase
  return str
    .replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    .replace(/^_/, '');
}

/**
 * Unified field name mappings (camelCase -> snake_case)
 *
 * Combines mappings from:
 * - Stage 4 Analysis (AnalysisResult schema)
 * - Stage 5 Generation (Course structure schema)
 *
 * While automatic conversion handles most cases, explicit mappings
 * ensure consistent transformation for commonly misnamed fields.
 */
const FIELD_MAPPING: Record<string, string> = {
  // ========================================
  // Stage 5 Generation - Course-level fields
  // ========================================
  courseTitle: 'course_title',
  courseDescription: 'course_description',
  courseOverview: 'course_overview',
  targetAudience: 'target_audience',
  estimatedDurationHours: 'estimated_duration_hours',
  difficultyLevel: 'difficulty_level',
  learningOutcomes: 'learning_outcomes',
  assessmentStrategy: 'assessment_strategy',
  courseTags: 'course_tags',

  // Stage 5 Generation - Section-level fields
  sectionNumber: 'section_number',
  sectionTitle: 'section_title',
  sectionDescription: 'section_description',
  estimatedDurationMinutes: 'estimated_duration_minutes',

  // Stage 5 Generation - Lesson-level fields
  lessonNumber: 'lesson_number',
  lessonTitle: 'lesson_title',
  lessonObjectives: 'lesson_objectives',
  keyTopics: 'key_topics',

  // Stage 5 Generation - Exercise fields
  exerciseType: 'exercise_type',
  exerciseTitle: 'exercise_title',
  exerciseDescription: 'exercise_description',
  practicalExercises: 'practical_exercises',

  // Stage 5 Generation - Assessment strategy fields
  quizPerSection: 'quiz_per_section',
  finalExam: 'final_exam',
  practicalProjects: 'practical_projects',
  assessmentDescription: 'assessment_description',

  // ========================================
  // Stage 4 Analysis - Course categorization (Phase 1)
  // ========================================
  courseCategory: 'course_category',
  primaryCategory: 'primary',
  secondaryCategory: 'secondary',

  // Stage 4 Analysis - Contextual language (Phase 1)
  contextualLanguage: 'contextual_language',
  whyMattersContext: 'why_matters_context',
  experiencePrompt: 'experience_prompt',
  problemStatementContext: 'problem_statement_context',
  knowledgeBridge: 'knowledge_bridge',
  practicalBenefitFocus: 'practical_benefit_focus',

  // Stage 4 Analysis - Topic analysis (Phase 1-2)
  topicAnalysis: 'topic_analysis',
  determinedTopic: 'determined_topic',
  informationCompleteness: 'information_completeness',
  missingElements: 'missing_elements',
  domainKeywords: 'domain_keywords',

  // Stage 4 Analysis - Recommended structure (Phase 2)
  recommendedStructure: 'recommended_structure',
  estimatedContentHours: 'estimated_content_hours',
  scopeReasoning: 'scope_reasoning',
  lessonDurationMinutes: 'lesson_duration_minutes',
  calculationExplanation: 'calculation_explanation',
  totalLessons: 'total_lessons',
  totalSections: 'total_sections',
  scopeWarning: 'scope_warning',
  sectionsBreakdown: 'sections_breakdown',

  // Stage 4 Analysis - Section breakdown fields
  sectionId: 'section_id',
  estimatedLessons: 'estimated_lessons',
  learningObjectives: 'learning_objectives',
  pedagogicalApproach: 'pedagogical_approach',
  difficultyProgression: 'difficulty_progression',

  // Stage 4 Analysis - Pedagogical strategy (Phase 3)
  pedagogicalStrategy: 'pedagogical_strategy',
  teachingStyle: 'teaching_style',
  assessmentApproach: 'assessment_approach',
  practicalFocus: 'practical_focus',
  progressionLogic: 'progression_logic',
  interactivityLevel: 'interactivity_level',

  // Stage 4 Analysis - Pedagogical patterns (Phase 1 enhancement)
  pedagogicalPatterns: 'pedagogical_patterns',
  primaryStrategy: 'primary_strategy',
  theoryPracticeRatio: 'theory_practice_ratio',
  assessmentTypes: 'assessment_types',
  keyPatterns: 'key_patterns',

  // Stage 4 Analysis - Generation guidance (Phase 4 enhancement)
  generationGuidance: 'generation_guidance',
  useAnalogies: 'use_analogies',
  specificAnalogies: 'specific_analogies',
  avoidJargon: 'avoid_jargon',
  includeVisuals: 'include_visuals',
  exerciseTypes: 'exercise_types',
  contextualLanguageHints: 'contextual_language_hints',
  realWorldExamples: 'real_world_examples',

  // Stage 4 Analysis - Scope instructions (Phase 5)
  scopeInstructions: 'scope_instructions',

  // Stage 4 Analysis - Content strategy (Phase 5)
  contentStrategy: 'content_strategy',

  // Stage 4 Analysis - Document relevance mapping (Phase 6 enhancement)
  documentRelevanceMapping: 'document_relevance_mapping',
  primaryDocuments: 'primary_documents',
  keySearchTerms: 'key_search_terms',
  expectedTopics: 'expected_topics',
  documentProcessingMethods: 'document_processing_methods',

  // Stage 4 Analysis - Research flags (Phase 4)
  researchFlags: 'research_flags',
  needsResearch: 'needs_research',
  researchAreas: 'research_areas',

  // Stage 4 Analysis - Metadata
  analysisVersion: 'analysis_version',
  totalDurationMs: 'total_duration_ms',
  modelUsed: 'model_used',
  phaseDurations: 'phase_durations',
};

/**
 * Recursively fix field names in object (camelCase -> snake_case)
 *
 * Transforms object keys from camelCase to snake_case for LLM output normalization.
 * Handles nested objects, arrays, and primitive values.
 *
 * @param obj - Object with potentially camelCase field names
 * @returns New object with snake_case field names
 *
 * @example
 * ```typescript
 * // Simple object
 * const input = { courseTitle: "ML Course", targetAudience: "Developers" };
 * const output = fixFieldNames(input);
 * // Returns: { course_title: "ML Course", target_audience: "Developers" }
 *
 * // Nested object
 * const nested = {
 *   courseTitle: "ML Course",
 *   sections: [
 *     { sectionTitle: "Intro", lessonCount: 3 }
 *   ]
 * };
 * const fixed = fixFieldNames(nested);
 * // Returns: {
 * //   course_title: "ML Course",
 * //   sections: [
 * //     { section_title: "Intro", lesson_count: 3 }
 * //   ]
 * // }
 * ```
 */
export function fixFieldNames<T = unknown>(obj: unknown): T {
  // Handle null/undefined
  if (obj === null || obj === undefined) {
    return obj as T;
  }

  // Handle primitives (string, number, boolean)
  if (typeof obj !== 'object') {
    return obj as T;
  }

  // Handle arrays - recursively transform each element
  if (Array.isArray(obj)) {
    return obj.map((item) => fixFieldNames(item)) as unknown as T;
  }

  // Handle objects - transform keys and recursively transform values
  const fixed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Apply explicit mapping first, fallback to automatic conversion
    const newKey = FIELD_MAPPING[key] || camelToSnake(key);

    // Recursively transform nested values
    fixed[newKey] = fixFieldNames(value);
  }

  return fixed as unknown as T;
}

/**
 * Fix field names with logging
 *
 * Same as fixFieldNames but logs transformation for debugging.
 * Useful during development or when troubleshooting LLM output issues.
 *
 * @param obj - Object with potentially camelCase field names
 * @param context - Optional context for logging (e.g., "metadata", "section_1")
 * @returns New object with snake_case field names
 */
export function fixFieldNamesWithLogging<T = unknown>(obj: unknown, context?: string): T {
  const originalKeys = Object.keys((obj as object) || {});
  const fixed = fixFieldNames<T>(obj);
  const fixedKeys = Object.keys((fixed as object) || {});

  // Check if any keys were transformed
  const hasChanges = originalKeys.some(
    (key, index) => key !== fixedKeys[index]
  );

  if (hasChanges) {
    const transformations = originalKeys
      .filter((key, index) => key !== fixedKeys[index])
      .map((key, index) => `${key} -> ${fixedKeys[index]}`);

    logger.info(
      {
        context,
        transformations,
        originalKeyCount: originalKeys.length,
        fixedKeyCount: fixedKeys.length,
      },
      'Field names transformed from camelCase to snake_case'
    );
  } else {
    logger.debug(
      { context },
      'No field name transformations needed (already snake_case)'
    );
  }

  return fixed;
}
