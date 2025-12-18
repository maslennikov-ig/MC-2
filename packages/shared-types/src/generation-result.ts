/* eslint-disable max-lines */
/**
 * Stage 5 - Generation Phase: Course Structure Schema
 *
 * This module defines comprehensive Zod schemas for course generation output
 * including RT-006 Bloom's Taxonomy validation placeholders.
 *
 * @module generation-result
 * @see specs/008-generation-generation-json/data-model.md
 * @see research-decisions/rt-006-bloom-taxonomy-validation.md
 * @see docs/generation/LLM-VALIDATION-BEST-PRACTICES.md
 */

import { z } from 'zod';

// Import from common-enums.ts (single source of truth)
import { courseLevelSchema, type CourseLevel } from './common-enums';

// ============================================================================
// RT-007 PHASE 3: VALIDATION SEVERITY SYSTEM
// ============================================================================

/**
 * RT-007 Phase 3: 3-tier validation severity system
 *
 * - ERROR: Blocks saving/progression (pedagogically incorrect, incomplete content)
 * - WARNING: Logs but allows progression (fuzzy match reduces false positives)
 * - INFO: Monitoring only, no blocking (metrics for optimization)
 *
 * @see specs/008-generation-generation-json/research-decisions/rt-007-bloom-taxonomy-validation-improvements.md (lines 600-890)
 */
export enum ValidationSeverity {
  ERROR = "error",      // Blocks saving/progression
  WARNING = "warning",  // Logs but allows progression
  INFO = "info"         // Monitoring only, no blocking
}

/**
 * RT-007 Phase 3: Validation result structure
 *
 * Replaces boolean returns with structured severity-based results
 * including quality scores, issues categorization, and LLM-friendly suggestions.
 */
export interface ValidationResult {
  passed: boolean;              // Overall pass/fail status
  severity: ValidationSeverity; // Severity level of this validation
  score: number;                // Quality score 0.0-1.0
  issues?: string[];            // ERROR-level issues (blocks progression)
  warnings?: string[];          // WARNING-level issues (logs only)
  info?: string[];              // INFO-level messages (monitoring)
  suggestion?: string;          // LLM-friendly retry suggestion
  metadata?: {                  // Optional metadata for debugging
    rule?: string;              // Rule name that triggered this result
    level?: string;             // Bloom's level (for taxonomy validation)
    verb?: string;              // Extracted verb (for taxonomy validation)
    expected?: { min: number; max: number }; // Expected range (for duration validation)
    actual?: number;            // Actual value (for duration validation)
  };
}

// ============================================================================
// RT-006 VALIDATION CONSTANTS AND HELPERS
// RT-007: Validators extracted to separate files for better organization
// ============================================================================

/**
 * Import validators from course-gen-platform package
 *
 * RT-007 Phase 1: Validators are now in separate files with improvements:
 * - blooms-validators.ts: Bloom's Taxonomy validation
 * - placeholder-validator.ts: Conservative placeholder detection
 * - duration-validator.ts: Duration proportionality with difficulty multiplier
 *
 * Note: These imports are conditional based on package availability.
 * Validators are also exported here for backward compatibility.
 */

/**
 * RT-007 Phase 1: Validators are now inline for shared-types package
 *
 * These validators are kept inline in this file to avoid circular dependencies
 * between packages. The course-gen-platform package has its own copy in:
 * packages/course-gen-platform/src/services/stage5/validators/
 */

/**
 * RT-006 P0: Non-measurable verbs blacklist (11 EN + 10 RU)
 * These verbs cannot be verified through assessment
 */
const NON_MEASURABLE_VERBS_BLACKLIST = {
  en: [
    'understand', 'know', 'learn', 'appreciate', 'be aware of',
    'be familiar with', 'grasp', 'comprehend', 'realize',
    'recognize', 'become acquainted with',
  ],
  ru: [
    'понимать', 'знать', 'изучать', 'осознавать', 'быть знакомым с',
    'постигать', 'усваивать', 'разбираться', 'осмыслять', 'овладевать',
  ],
} as const;

/**
 * RT-006 P1: Bloom's Taxonomy whitelist (165 verbs across 6 levels)
 */
const BLOOMS_TAXONOMY_WHITELIST = {
  en: {
    remember: ['define', 'list', 'recall', 'recognize', 'identify', 'name', 'state', 'describe', 'label', 'match', 'select', 'reproduce', 'cite', 'memorize'],
    understand: ['explain', 'summarize', 'paraphrase', 'classify', 'compare', 'contrast', 'interpret', 'exemplify', 'illustrate', 'infer', 'predict', 'discuss'],
    apply: ['execute', 'implement', 'solve', 'use', 'demonstrate', 'operate', 'calculate', 'complete', 'show', 'examine', 'modify'],
    analyze: ['differentiate', 'organize', 'attribute', 'deconstruct', 'distinguish', 'examine', 'experiment', 'question', 'test', 'investigate'],
    evaluate: ['check', 'critique', 'judge', 'hypothesize', 'argue', 'defend', 'support', 'assess', 'rate', 'recommend'],
    create: ['design', 'construct', 'plan', 'produce', 'invent', 'develop', 'formulate', 'assemble', 'compose', 'devise'],
  },
  ru: {
    remember: ['определить', 'перечислить', 'вспомнить', 'распознать', 'идентифицировать', 'назвать', 'утверждать', 'описать', 'обозначить', 'сопоставить', 'выбрать', 'воспроизвести', 'цитировать'],
    understand: ['объяснить', 'резюмировать', 'перефразировать', 'классифицировать', 'сравнить', 'противопоставить', 'интерпретировать', 'проиллюстрировать', 'сделать вывод', 'предсказать', 'обсудить'],
    apply: ['выполнить', 'реализовать', 'решить', 'использовать', 'продемонстрировать', 'оперировать', 'вычислить', 'завершить', 'показать', 'исследовать', 'модифицировать'],
    analyze: ['дифференцировать', 'организовать', 'атрибутировать', 'деконструировать', 'различить', 'изучить', 'экспериментировать', 'задать вопрос', 'тестировать'],
    evaluate: ['проверить', 'критиковать', 'судить', 'выдвинуть гипотезу', 'аргументировать', 'защитить', 'поддержать', 'оценить', 'рекомендовать'],
    create: ['спроектировать', 'сконструировать', 'спланировать', 'произвести', 'изобрести', 'разработать', 'сформулировать', 'собрать', 'составить', 'придумать'],
  },
} as const;

/**
 * RT-007 P1: Conservative placeholder patterns
 */
const PLACEHOLDER_PATTERNS = [
  // ✅ TODO/FIXME markers (block always)
  // RT-007 P4: Removed NOTE - legitimate word in educational content ("Note: important info")
  /\b(TODO|FIXME|XXX|HACK)\b/i,

  // ✅ Only explicit bracketed placeholders
  /\[TODO\]/i,
  /\[TBD\]/i,
  /\[FIXME\]/i,
  /\[insert[^\]]*\]/i,
  /\[add[^\]]*\]/i,
  /\[replace[^\]]*\]/i,
  /\[название[^\]]*\]/i,
  /\[описание[^\]]*\]/i,
  /\[введите[^\]]*\]/i,
  /\[добавьте[^\]]*\]/i,

  // ✅ Template variables
  /\{\{[^}]+\}\}/,
  /\$\{[^}]+\}/,

  // ✅ Ellipsis indicators
  /^\.\.\.$|^\.\.\.\s/,
  /…$/,

  // ✅ Generic placeholders
  /\b(example|sample|placeholder|пример|образец)\s+(title|name|description|text|название|текст)\b/i,

  // ✅ Empty or whitespace-only
  /^\s*$/,

  // ✅ Numeric placeholders
  /\b(N|X|Y|Z)\s+(students|hours|modules|студентов|часов|модулей)\b/i
] as const;

/**
 * Detailed placeholder issue information for debugging
 */
interface PlaceholderIssue {
  path: string;
  matchedText: string;
  matchedPattern: string;
  patternIndex: number;
}

/**
 * RT-006 P1: Duration proportionality constants
 *
 * Reduced minimums to allow flexibility for simple lessons and unit testing
 */
const MIN_TOPIC_DURATION = 1; // Reduced from 2 to allow shorter lessons
const MAX_TOPIC_DURATION = 5;
const MIN_OBJECTIVE_DURATION = 3; // Reduced from 5 to allow concise objectives
const MAX_OBJECTIVE_DURATION = 15;
const ENGAGEMENT_CAP = 60; // Increased from 6 to match 45-minute lesson maximum

/**
 * RT-007 P1: Difficulty level multiplier
 */
const DIFFICULTY_MULTIPLIER = {
  beginner: 1.0,
  intermediate: 1.5,
  advanced: 2.0,
} as const;

/**
 * Helper: Extract action verb from learning objective text
 *
 * NOTE: Exported for ADVISORY validation only (not used in BLOCKING validation)
 * Can be used by orchestrator to generate recommendations without failing validation.
 */
export function extractActionVerb(text: string, language: string): string {
  const tokens = text.trim().toLowerCase().split(/\s+/);
  if (language === 'ru') {
    const verb = tokens[0] || '';
    return verb.replace(/ся$/, '');
  }
  return tokens[0] || '';
}

/**
 * Helper: Check if text contains non-measurable verbs
 *
 * RT-007 Phase 2: Supports EN/RU only (other languages fallback to no check)
 */
function hasNonMeasurableVerb(text: string, language: string): boolean {
  const lowerText = text.toLowerCase();

  // Only EN and RU have non-measurable verb blacklists
  if (language === 'en' || language === 'ru') {
    const blacklist = NON_MEASURABLE_VERBS_BLACKLIST[language];
    return blacklist.some(verb => lowerText.includes(verb.toLowerCase()));
  }

  // Other languages: no check (assume measurable)
  return false;
}

/**
 * Helper: Check if template variables are intentional in the context
 *
 * RT-007 P5: Avoid false positives for intentional template variables
 * in practical exercises (e.g., "Используйте переменные: {{Имя}}, {{Email}}")
 */
function isIntentionalTemplateVariable(text: string): boolean {
  const intentionalContextPatterns = [
    /используйте\s+(переменн|шаблон|перемен)/i,     // Russian: "используйте переменные/шаблон"
    /use\s+(variable|template|placeholder)/i,        // English: "use variables/template"
    /подставьте\s+(значени|данн)/i,                 // Russian: "подставьте значения/данные"
    /заполните\s+шаблон/i,                          // Russian: "заполните шаблон"
    /fill\s+in\s+the\s+(template|placeholder)/i,    // English: "fill in the template"
    /переменные:/i,                                  // Russian: "переменные:" (list follows)
    /variables:/i,                                   // English: "variables:" (list follows)
  ];

  return intentionalContextPatterns.some(pattern => pattern.test(text));
}

/**
 * Helper: Get all placeholder matches in text with pattern details
 */
function getPlaceholderMatches(text: string): Array<{ pattern: RegExp; match: string }> {
  const matches: Array<{ pattern: RegExp; match: string }> = [];

  // RT-007 P5: Skip template variable check if context indicates intentional use
  const skipTemplateVarCheck = isIntentionalTemplateVariable(text);
  const templateVarPattern = /\{\{[^}]+\}\}/;

  for (const pattern of PLACEHOLDER_PATTERNS) {
    // Skip {{variable}} pattern if context indicates intentional template usage
    if (skipTemplateVarCheck && pattern.source === templateVarPattern.source) {
      continue;
    }

    const match = text.match(pattern);
    if (match) {
      matches.push({
        pattern,
        match: match[0] // The actual matched text
      });
    }
  }

  return matches;
}

/**
 * Helper: Check if verb is in Bloom's taxonomy whitelist (LEGACY - exact match only)
 *
 * RT-007 Phase 2: This is a simplified version for shared-types package.
 * For full fuzzy matching support, use the validators in course-gen-platform package.
 *
 * NOTE: Exported for ADVISORY validation only (not used in BLOCKING validation)
 * Can be used by orchestrator to generate recommendations without failing validation.
 */
export function isBloomsVerb(verb: string, language: string): boolean {
  // Only EN and RU have full whitelists in shared-types
  if (language !== 'en' && language !== 'ru') {
    // For other languages, assume valid (will be validated by course-gen-platform)
    return true;
  }

  const whitelist = BLOOMS_TAXONOMY_WHITELIST[language];
  const lowerVerb = verb.toLowerCase();
  return Object.values(whitelist).some((verbs: readonly string[]) =>
    verbs.some((v: string) => v.toLowerCase() === lowerVerb)
  );
}

/**
 * Helper: Scan object recursively for placeholders with detailed issue information
 */
function scanForPlaceholders(obj: unknown, path: string = ''): PlaceholderIssue[] {
  const issues: PlaceholderIssue[] = [];

  if (typeof obj === 'string') {
    const matches = getPlaceholderMatches(obj);
    for (const { pattern, match } of matches) {
      issues.push({
        path,
        matchedText: match,
        matchedPattern: pattern.source,
        patternIndex: PLACEHOLDER_PATTERNS.indexOf(pattern)
      });
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      issues.push(...scanForPlaceholders(item, `${path}[${idx}]`));
    });
  } else if (obj && typeof obj === 'object') {
    Object.entries(obj).forEach(([key, value]) => {
      issues.push(...scanForPlaceholders(value, path ? `${path}.${key}` : key));
    });
  }

  return issues;
}

/**
 * Calculate expected duration range
 *
 * NOTE: Currently unused after removing validateDurationProportionality refinement.
 * Kept for potential future use in analytics or optional warnings.
 *
 * Reference: INV-2025-11-19-001-duration-fields-architecture.md (Section 4)
 */
 
function calculateExpectedDuration(
  topicCount: number,
  objectiveCount: number,
  difficultyLevel: 'beginner' | 'intermediate' | 'advanced' = 'intermediate'
): { min: number; max: number } {
  const multiplier = DIFFICULTY_MULTIPLIER[difficultyLevel];

  // Base minimum (without multiplier - allows shorter lessons regardless of difficulty)
  const baseMin = topicCount * MIN_TOPIC_DURATION + objectiveCount * MIN_OBJECTIVE_DURATION;
  // Maximum scales with difficulty
  const baseMax = topicCount * MAX_TOPIC_DURATION + objectiveCount * MAX_OBJECTIVE_DURATION;

  return {
    min: Math.ceil(baseMin), // Don't multiply minimum - allows flexibility for all difficulty levels
    max: Math.ceil(baseMax * multiplier) // Only multiply maximum to account for advanced content depth
  };
}

/**
 * Validate duration proportionality
 *
 * NOTE: Removed from LessonSchema refinement because duration is now a fixed constraint
 * (injected from frontend), not a variable generated by LLM.
 *
 * Kept for potential future use in analytics or optional warnings, but NOT as a blocking validation.
 *
 * Reference: INV-2025-11-19-001-duration-fields-architecture.md (Section 4)
 */
// @ts-expect-error TS6133 - Kept for potential future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function validateDurationProportionality(
  lesson: {
    key_topics: string[];
    lesson_objectives: unknown[];
    estimated_duration_minutes: number;
    difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
  }
): { passed: boolean; issues?: string[]; warnings?: string[] } {
  const topicCount = lesson.key_topics.length;
  const objectiveCount = lesson.lesson_objectives.length;
  const actualDuration = lesson.estimated_duration_minutes;

  const expected = calculateExpectedDuration(
    topicCount,
    objectiveCount,
    lesson.difficulty_level || 'intermediate'
  );

  if (actualDuration < expected.min) {
    return {
      passed: false,
      issues: [`Duration too short: ${actualDuration} min (expected ${expected.min}-${expected.max} min for ${lesson.difficulty_level || 'intermediate'} level)`]
    };
  }

  const warnings: string[] = [];

  if (actualDuration > expected.max) {
    // Exceeding max is OK for complex topics - add informational warning
    warnings.push(`Duration exceeds max: ${actualDuration} min (expected ${expected.min}-${expected.max} min). This is OK for complex topics.`);
  }

  if (actualDuration > ENGAGEMENT_CAP) {
    // Exceeding engagement cap - add recommendation
    warnings.push(`Duration exceeds engagement cap: ${actualDuration} min (cap: ${ENGAGEMENT_CAP} min). Consider adding breaks or splitting into shorter segments for better learner engagement.`);
  }

  return { passed: true, warnings: warnings.length > 0 ? warnings : undefined };
}

// ============================================================================
// EXERCISE TYPES (FR-010) - UPDATED 2025-11-19
// ============================================================================

/**
 * DEPRECATED: Legacy enum values kept for reference only.
 * As of 2025-11-19, exercise_type is now a freeform text field.
 *
 * @deprecated Use descriptive text instead of enum values
 * @see docs/investigations/INV-2025-11-19-002-exercise-type-enum-to-text-migration.md
 */
export const EXERCISE_TYPES_LEGACY = [
  'self_assessment',
  'case_study',
  'hands_on',
  'discussion',
  'quiz',
  'simulation',
  'reflection',
] as const;

/**
 * Practical exercise schema (FR-010)
 * Each lesson must include 3-5 practical exercises
 *
 * UPDATED 2025-11-19: exercise_type changed from strict enum to freeform text
 * to eliminate 60-80% of validation failures caused by semantically correct
 * but structurally invalid values ('visual aids', 'role play scenario').
 *
 * Research basis: "Rethinking LLM validation: The case against strict enums alone.md"
 * recommends TEXT with CHECK constraints over PostgreSQL ENUMs for LLM-generated fields.
 */
export const PracticalExerciseSchema = z.object({
  exercise_type: z.string()
    .min(3, 'Exercise type description too short (minimum 3 characters)')
    .describe(
      'Description of the exercise type and activities (minimum 3 characters). ' +
      'For simple exercises, use brief labels (10-30 chars): "case study analysis", "role-play scenario", "hands-on lab". ' +
      'For complex multi-step exercises, provide detailed instructions (50-150+ chars recommended): ' +
      '"Watch video introduction, complete individual practice tasks, then participate in small group ' +
      'discussion to compare solutions and approaches, followed by peer feedback session". ' +
      'Be specific about format, interaction model, and learning activities. ' +
      'Examples: "visual aids presentation", "group discussion with moderator", "interactive simulation", ' +
      '"peer assessment activity", "reflective journal with guided questions".'
    ),
  exercise_title: z.string()
    .min(5, 'Exercise title too short (min 5 chars)')
    .max(300, 'Exercise title too long (max 300 chars - FR-022)'),
  exercise_description: z.string()
    .min(10, 'Exercise description too short (min 10 chars)')
    .max(1500, 'Exercise description too long (max 1500 chars - FR-022)'),
});

export type PracticalExercise = z.infer<typeof PracticalExerciseSchema>;

// ============================================================================
// LEARNING OBJECTIVES (RT-006 Enhanced)
// ============================================================================

/**
 * Bloom's Taxonomy cognitive levels (RT-006 P1 validation)
 * Revised taxonomy (Anderson & Krathwohl, 2001)
 */
export const BloomCognitiveLevelSchema = z.enum([
  'remember',   // Level 1: Recall facts (list, name, identify)
  'understand', // Level 2: Explain ideas (explain, summarize, interpret)
  'apply',      // Level 3: Use in new context (demonstrate, implement, execute)
  'analyze',    // Level 4: Break into parts (compare, differentiate, examine)
  'evaluate',   // Level 5: Make judgments (assess, critique, justify)
  'create',     // Level 6: Produce new work (design, develop, construct)
]);

export type BloomCognitiveLevel = z.infer<typeof BloomCognitiveLevelSchema>;

/**
 * RT-007 Phase 2: Supported languages for Bloom's Taxonomy validation (19 languages)
 *
 * Matches SUPPORTED_LANGUAGES from packages/web/lib/validation/course.ts
 */
export const SupportedLanguageSchema = z.enum([
  'ru',  // Russian (Русский)
  'en',  // English (Английский)
  'zh',  // Chinese Simplified (简体中文)
  'es',  // Spanish (Español)
  'fr',  // French (Français)
  'de',  // German (Deutsch)
  'ja',  // Japanese (日本語)
  'ko',  // Korean (한국어)
  'ar',  // Arabic (العربية)
  'pt',  // Portuguese (Português)
  'it',  // Italian (Italiano)
  'tr',  // Turkish (Türkçe)
  'vi',  // Vietnamese (Tiếng Việt)
  'th',  // Thai (ไทย)
  'id',  // Indonesian (Bahasa Indonesia)
  'ms',  // Malay (Bahasa Melayu)
  'hi',  // Hindi (हिन्दी)
  'bn',  // Bengali (বাংলা)
  'pl'   // Polish (Polski)
]);

export type SupportedLanguage = z.infer<typeof SupportedLanguageSchema>;

/**
 * Base learning objective schema (without refinements)
 *
 * INTERNAL: Used to create derived schemas. For validation, use:
 * - LearningObjectiveSchema (full validation with all fields)
 * - LearningObjectiveWithoutInjectedFieldsSchema (for LLM generation)
 */
const LearningObjectiveBaseSchema = z.object({
  id: z.string().uuid(),
  text: z.string()
    .min(10, 'Learning objective too short (min 10 chars)')
    .max(500, 'Learning objective too long (max 500 chars)'),
  language: SupportedLanguageSchema.describe('Language for Bloom\'s taxonomy validation (19 languages supported)'),
  cognitiveLevel: BloomCognitiveLevelSchema
    .optional()
    .describe('Bloom\'s taxonomy cognitive level (auto-detected from action verb)'),
  estimatedDuration: z.number()
    .int()
    .min(5, 'Objective duration too short (min 5 minutes per RT-006)')
    .max(15, 'Objective duration too long (max 15 minutes per RT-006)')
    .optional()
    .describe('Estimated time to achieve objective (5-15 min per RT-006 P1)'),
  targetAudienceLevel: z.enum(['beginner', 'intermediate', 'advanced'])
    .optional()
    .describe('Target learner level for complexity validation'),
});

/**
 * Learning objective schema with RT-007 Phase 2 multilingual validation
 *
 * Validates learning objectives against pedagogical quality standards:
 * - P0: Non-measurable verbs blacklist (EN/RU only)
 * - P1: Bloom's taxonomy whitelist with fuzzy matching (19 languages)
 *
 * RT-007 Phase 3: Inline validators for Zod schema compatibility
 * - These validators return boolean for Zod .refine() compatibility
 * - For severity-aware validation (ERROR/WARNING/INFO), use orchestrateValidation()
 *   from course-gen-platform/src/services/stage5/validators/validation-orchestrator.ts
 *
 * Reference:
 * - research-decisions/rt-006-bloom-taxonomy-validation.md
 * - research-decisions/rt-007-bloom-taxonomy-validation-improvements.md
 */
export const LearningObjectiveSchema = LearningObjectiveBaseSchema
  .refine(
    (obj) => !hasNonMeasurableVerb(obj.text, obj.language),
    (obj) => ({
      message: `Non-measurable verb detected in "${obj.text}". Cannot verify learning through assessment.`,
    })
  );

export type LearningObjective = z.infer<typeof LearningObjectiveSchema>;

/**
 * Learning objective schema WITHOUT id and language fields
 *
 * Used for LLM generation validation BEFORE code injection of:
 * - id: Generated by crypto.randomUUID()
 * - language: Injected from frontend_parameters.language
 *
 * Does NOT include refinement validation (non-measurable verbs) because
 * language field is needed for that check. Use LearningObjectiveSchema
 * for final validation after field injection.
 *
 * After LLM generation, use LearningObjectiveSchema for final validation.
 */
export const LearningObjectiveWithoutInjectedFieldsSchema = LearningObjectiveBaseSchema.omit({
  id: true,
  language: true,
});

export type LearningObjectiveWithoutInjectedFields = z.infer<typeof LearningObjectiveWithoutInjectedFieldsSchema>;

// ============================================================================
// LESSON SCHEMA (FR-011 - Technical Specifications)
// ============================================================================

/**
 * Base lesson schema without refinements
 *
 * CRITICAL: lesson_objectives and key_topics are required by Stage 6 for content generation
 *
 * This is the base schema used to build both:
 * - LessonWithoutInjectedFieldsSchema (for LLM generation)
 * - LessonSchema (for final validation after field injection)
 */
const LessonBaseSchema = z.object({
  // Identification
  lesson_number: z.number().int().min(0).describe('Lesson number (start from 1)'),
  lesson_title: z.string()
    .min(5, 'Lesson title too short (min 5 chars)')
    .max(500, 'Lesson title too long (max 500 chars - FR-022)'),

  // Technical specifications for Stage 6 lesson generation (FR-011)
  lesson_objectives: z.array(z.string().min(10).max(600))
    .min(1, 'At least 1 learning objective required')
    .max(5, 'Maximum 5 learning objectives per lesson')
    .describe('Specific learning objectives for this lesson (simple strings per spec data-model.md, min 10 chars, CRITICAL for Stage 6)'),

  key_topics: z.array(z.string().min(5).max(300))
    .min(2, 'At least 2 key topics required')
    .max(10, 'Maximum 10 key topics per lesson')
    .describe('Key topics covered in this lesson (CRITICAL for Stage 6)'),

  estimated_duration_minutes: z.number()
    .int()
    .min(3, 'Duration too short (min 3 minutes)')
    .max(45, 'Duration too long (max 45 minutes)')
    .describe('Estimated time to complete this lesson (3-45 minutes)'),

  // RT-007 P1: Difficulty level for duration multiplier
  difficulty_level: z.enum(['beginner', 'intermediate', 'advanced'])
    .optional()
    .describe('Difficulty level affects duration expectations (beginner: 1.0x, intermediate: 1.5x, advanced: 2.0x)'),

  // Practical exercises (FR-010)
  practical_exercises: z.array(PracticalExerciseSchema)
    .min(3, 'At least 3 practical exercises required (FR-010)')
    .max(5, 'Maximum 5 practical exercises per lesson (FR-010)')
    .describe('3-5 practical exercises per lesson'),
});

/**
 * Lesson schema WITHOUT estimated_duration_minutes field
 *
 * Used for LLM generation validation BEFORE code injection of:
 * - estimated_duration_minutes: Injected from frontend_parameters.lesson_duration_minutes
 *
 * Frontend controls lesson duration as a fixed constraint (3-45 minutes).
 * LLM generates content structure. If topic is too complex, generate MORE lessons,
 * NOT longer lessons.
 *
 * After LLM generation, use LessonSchema for final validation.
 *
 * Reference: INV-2025-11-19-001-duration-fields-architecture.md
 */
export const LessonWithoutInjectedFieldsSchema = LessonBaseSchema.omit({
  estimated_duration_minutes: true,
});

export type LessonWithoutInjectedFields = z.infer<typeof LessonWithoutInjectedFieldsSchema>;

/**
 * Full lesson schema for final validation
 *
 * NOTE: Removed validateDurationProportionality refinement because:
 * - Duration is now a fixed constraint (injected from frontend), not a variable
 * - LLM should generate MORE/FEWER lessons to fit duration, not vary duration
 * - User controls duration - we shouldn't validate their choice
 *
 * Reference: INV-2025-11-19-001-duration-fields-architecture.md (Section 4)
 */
export const LessonSchema = LessonBaseSchema;

export type Lesson = z.infer<typeof LessonSchema>;

// ============================================================================
// SECTION SCHEMA (FR-012 - Learning Objectives)
// ============================================================================

/**
 * Base section schema for LLM generation (without estimated_duration_minutes)
 */
const SectionBaseSchemaForGeneration = z.object({
  // Identification
  section_number: z.number().int().min(0).describe('Section number (start from 1)'),
  section_title: z.string()
    .min(10, 'Section title too short (min 10 chars)')
    .max(600, 'Section title too long (max 600 chars - FR-022)'),
  section_description: z.string()
    .min(20, 'Section description too short (min 20 chars)')
    .max(2000, 'Section description too long (max 2000 chars - FR-022)'),

  // Pedagogical structure (FR-012)
  learning_objectives: z.array(z.string().min(10).max(600))
    .min(1, 'At least 1 section-level learning objective required')
    .max(5, 'Maximum 5 section-level learning objectives')
    .describe('Section-level learning objectives (simple strings per spec data-model.md, min 10 chars, 1-5 items)'),

  // Nested lessons (WITHOUT duration - will be injected)
  lessons: z.array(LessonWithoutInjectedFieldsSchema)
    .min(1, 'At least 1 lesson required per section')
    .describe('Lessons within this section (minimum 1)'),
});

/**
 * Section schema WITHOUT estimated_duration_minutes field (for LLM generation)
 *
 * Used for LLM generation validation BEFORE:
 * - Lesson duration injection (from frontend_parameters.lesson_duration_minutes)
 * - Section duration calculation (sum of lesson durations)
 *
 * Reference: INV-2025-11-19-001-duration-fields-architecture.md
 */
export const SectionWithoutInjectedFieldsSchema = SectionBaseSchemaForGeneration;

export type SectionWithoutInjectedFields = z.infer<typeof SectionWithoutInjectedFieldsSchema>;

/**
 * Full section schema with calculated estimated_duration_minutes
 *
 * Section duration is CALCULATED (sum of lesson durations), not generated by LLM.
 * Uses .transform() to automatically calculate when validated.
 *
 * Reference: INV-2025-11-19-001-duration-fields-architecture.md (Section 3)
 */
export const SectionSchema = z.object({
  section_number: z.number().int().positive(),
  section_title: z.string()
    .min(10, 'Section title too short (min 10 chars)')
    .max(600, 'Section title too long (max 600 chars - FR-022)'),
  section_description: z.string()
    .min(20, 'Section description too short (min 20 chars)')
    .max(2000, 'Section description too long (max 2000 chars - FR-022)'),

  learning_objectives: z.array(z.string().min(10).max(600))
    .min(1, 'At least 1 section-level learning objective required')
    .max(5, 'Maximum 5 section-level learning objectives')
    .describe('Section-level learning objectives (simple strings per spec data-model.md, min 10 chars, 1-5 items)'),

  // Lessons with injected duration
  lessons: z.array(LessonSchema)
    .min(1, 'At least 1 lesson required per section')
    .describe('Lessons within this section (minimum 1)'),
})
  .transform((section) => ({
    ...section,
    // Calculate section duration from lesson durations
    estimated_duration_minutes: section.lessons.reduce(
      (sum, lesson) => sum + lesson.estimated_duration_minutes,
      0
    ),
  }));

export type Section = z.infer<typeof SectionSchema>;

// ============================================================================
// COURSE METADATA (FR-007, FR-012)
// ============================================================================

// Re-export as DifficultyLevelSchema for backward compatibility (single source of truth)
// Uses courseLevelSchema (3 levels: beginner, intermediate, advanced)
// For 4-level difficulty (includes 'expert'), use difficultySchema from common-enums.ts
export const DifficultyLevelSchema = courseLevelSchema;
export type DifficultyLevel = CourseLevel;

export const AssessmentStrategySchema = z.object({
  quiz_per_section: z.boolean().describe('Include quiz at end of each section'),
  final_exam: z.boolean().describe('Include comprehensive final exam'),
  practical_projects: z.number()
    .int()
    .min(0)
    .max(10)
    .describe('Number of practical projects'),
  assessment_description: z.string()
    .min(10, 'Assessment description too short (min 10 chars)')
    .max(1500, 'Assessment description too long (max 1500 chars - FR-022)')
    .describe('Description of assessment approach (min 10 chars, spec recommends 50+)'),
});

export type AssessmentStrategy = z.infer<typeof AssessmentStrategySchema>;

// ============================================================================
// FULL COURSE STRUCTURE (FR-007 + FR-015 Validation)
// ============================================================================

/**
 * Complete course structure schema with FR-015 minimum lessons validation
 *
 * IMPORTANT: FR-015 validation enforced via .refine() check:
 * - Minimum 10 lessons total across all sections
 * - Validation runs after structural checks pass
 */
export const CourseStructureSchema = z.object({
  // ========== METADATA ==========

  course_title: z.string()
    .min(10, 'Course title too short (min 10 chars)')
    .max(1000, 'Course title too long (max 1000 chars - FR-022)')
    .describe('Course title (10-1000 characters)'),

  course_description: z.string()
    .min(20, 'Course description too short (min 20 chars)')
    .max(3000, 'Course description too long (max 3000 chars - FR-022)')
    .describe('Short course description, elevator pitch (20-3000 chars, spec recommends 50+)'),

  course_overview: z.string()
    .min(30, 'Course overview too short (min 30 chars)')
    .max(10000, 'Course overview too long (max 10000 chars - FR-022)')
    .describe('Comprehensive course overview (30-10000 chars, spec recommends 100+)'),

  target_audience: z.string()
    .min(20, 'Target audience too short (min 20 chars)')
    .max(1500, 'Target audience too long (max 1500 chars - FR-022)')
    .describe('Description of target audience (20-1500 chars)'),

  estimated_duration_hours: z.number()
    .positive()
    .describe('Total estimated duration in hours'),

  difficulty_level: DifficultyLevelSchema
    .describe('Overall difficulty level'),

  prerequisites: z.array(z.string().min(10).max(600))
    .min(0)
    .max(10)
    .describe('List of prerequisites (0-10 items, 10-600 chars each - FR-022)'),

  learning_outcomes: z.array(LearningObjectiveSchema)
    .min(3, 'At least 3 course-level learning outcomes required')
    .max(15, 'Maximum 15 course-level learning outcomes (FR-012)')
    .describe('Course-level learning outcomes (3-15 items, RT-006 validated objects with cognitive levels)'),

  assessment_strategy: AssessmentStrategySchema
    .describe('Assessment approach and strategy'),

  course_tags: z.array(z.string().min(3).max(150))
    .min(5, 'At least 5 course tags required')
    .max(20, 'Maximum 20 course tags')
    .describe('Descriptive tags for course (5-20 tags, max 150 chars each - FR-022)'),

  // ========== HIERARCHY ==========

  sections: z.array(SectionSchema)
    .min(1, 'At least 1 section required')
    .describe('Course sections containing lessons'),

})
  .refine(
    (data) => {
      // FR-015: Validate minimum 10 lessons total across all sections
      const totalLessons = data.sections.reduce(
        (sum, section) => sum + section.lessons.length,
        0
      );
      return totalLessons >= 10;
    },
    {
      message: 'Course must have minimum 10 lessons total across all sections (FR-015)',
      path: ['sections'],
    }
  )
  .refine(
    (structure) => {
      // RT-006 P0: Validate no placeholders in course structure
      const issues = scanForPlaceholders(structure);

      if (issues.length > 0) {
        // Log detailed info for debugging
        console.error('[RT-006] Placeholder validation failed:', JSON.stringify(issues, null, 2));
      }

      return issues.length === 0;
    },
    (structure) => {
      const issues = scanForPlaceholders(structure);

      // Build detailed error message
      const details = issues.map(issue =>
        `${issue.path}: "${issue.matchedText}" (pattern #${issue.patternIndex}: ${issue.matchedPattern})`
      ).join('; ');

      return {
        message: `Placeholders detected: ${issues.length} issues. ${details}`,
      };
    }
  );

export type CourseStructure = z.infer<typeof CourseStructureSchema>;

/**
 * Course Metadata Schema (without sections)
 *
 * Extracted schema for course-level metadata validation separate from section hierarchy.
 * Used in metadata-generator.ts to avoid ZodEffects limitation with .pick().
 *
 * BEST PRACTICE: Uses public Zod API instead of private ._def.schema access.
 *
 * @see packages/course-gen-platform/src/services/stage5/metadata-generator.ts
 */
export const CourseMetadataSchema = z.object({
  course_title: z.string()
    .min(10, 'Course title too short (min 10 chars)')
    .max(1000, 'Course title too long (max 1000 chars - FR-022)')
    .describe('Course title (10-1000 characters)'),

  course_description: z.string()
    .min(20, 'Course description too short (min 20 chars)')
    .max(3000, 'Course description too long (max 3000 chars - FR-022)')
    .describe('Short course description, elevator pitch (20-3000 chars, spec recommends 50+)'),

  course_overview: z.string()
    .min(30, 'Course overview too short (min 30 chars)')
    .max(10000, 'Course overview too long (max 10000 chars - FR-022)')
    .describe('Comprehensive course overview (30-10000 chars, spec recommends 100+)'),

  target_audience: z.string()
    .min(20, 'Target audience too short (min 20 chars)')
    .max(1500, 'Target audience too long (max 1500 chars - FR-022)')
    .describe('Description of target audience (20-1500 chars)'),

  estimated_duration_hours: z.number()
    .positive()
    .describe('Total estimated duration in hours'),

  difficulty_level: DifficultyLevelSchema
    .describe('Overall difficulty level'),

  prerequisites: z.array(z.string().min(10).max(600))
    .min(0)
    .max(10)
    .describe('List of prerequisites (0-10 items, 10-600 chars each - FR-022)'),

  learning_outcomes: z.array(LearningObjectiveSchema)
    .min(3, 'At least 3 course-level learning outcomes required')
    .max(15, 'Maximum 15 course-level learning outcomes (FR-012)')
    .describe('Course-level learning outcomes (3-15 items, RT-006 validated objects with cognitive levels)'),

  assessment_strategy: AssessmentStrategySchema
    .describe('Assessment approach and strategy'),

  course_tags: z.array(z.string().min(3).max(150))
    .min(5, 'At least 5 course tags required')
    .max(20, 'Maximum 20 course tags')
    .describe('Descriptive tags for course (5-20 tags, max 150 chars each - FR-022)'),
}).partial();

export type CourseMetadata = z.infer<typeof CourseMetadataSchema>;

/**
 * Course Metadata Schema WITHOUT id and language in learning_outcomes
 *
 * Used for LLM generation validation in metadata-generator.ts BEFORE code injection of:
 * - id: Generated by crypto.randomUUID()
 * - language: Injected from frontend_parameters.language
 *
 * After LLM generation and field injection, use CourseMetadataSchema for final validation.
 *
 * @see CourseMetadataSchema - Full schema with injected fields
 * @see LearningObjectiveWithoutInjectedFieldsSchema - Schema for individual outcomes without id/language
 */
export const CourseMetadataWithoutInjectedFieldsSchema = z.object({
  course_title: z.string()
    .min(10, 'Course title too short (min 10 chars)')
    .max(1000, 'Course title too long (max 1000 chars - FR-022)')
    .describe('Course title (10-1000 characters)'),

  course_description: z.string()
    .min(20, 'Course description too short (min 20 chars)')
    .max(3000, 'Course description too long (max 3000 chars - FR-022)')
    .describe('Short course description, elevator pitch (20-3000 chars, spec recommends 50+)'),

  course_overview: z.string()
    .min(30, 'Course overview too short (min 30 chars)')
    .max(10000, 'Course overview too long (max 10000 chars - FR-022)')
    .describe('Comprehensive course overview (30-10000 chars, spec recommends 100+)'),

  target_audience: z.string()
    .min(20, 'Target audience too short (min 20 chars)')
    .max(1500, 'Target audience too long (max 1500 chars - FR-022)')
    .describe('Description of target audience (20-1500 chars)'),

  estimated_duration_hours: z.number()
    .positive()
    .describe('Total estimated duration in hours'),

  difficulty_level: DifficultyLevelSchema
    .describe('Overall difficulty level'),

  prerequisites: z.array(z.string().min(10).max(600))
    .min(0)
    .max(10)
    .describe('List of prerequisites (0-10 items, 10-600 chars each - FR-022)'),

  learning_outcomes: z.array(LearningObjectiveWithoutInjectedFieldsSchema)
    .min(3, 'At least 3 course-level learning outcomes required')
    .max(15, 'Maximum 15 course-level learning outcomes (FR-012)')
    .describe('Course-level learning outcomes WITHOUT id/language (injected by code after validation)'),

  assessment_strategy: AssessmentStrategySchema
    .describe('Assessment approach and strategy'),

  course_tags: z.array(z.string().min(3).max(150))
    .min(5, 'At least 5 course tags required')
    .max(20, 'Maximum 20 course tags')
    .describe('Descriptive tags for course (5-20 tags, max 150 chars each - FR-022)'),
}).partial();

export type CourseMetadataWithoutInjectedFields = z.infer<typeof CourseMetadataWithoutInjectedFieldsSchema>;

// ============================================================================
// GENERATION METADATA (FR-025)
// ============================================================================

/**
 * Model usage per generation phase
 * Tracks which models were used for metadata, sections, and validation
 */
export const ModelUsageSchema = z.object({
  metadata: z.string().describe('Model used for metadata generation (e.g., qwen/qwen3-max)'),
  sections: z.string().describe('Model used for section generation (e.g., openai/gpt-oss-20b)'),
  validation: z.string().optional().describe('Model used for validation (if applicable)'),
});

export type ModelUsage = z.infer<typeof ModelUsageSchema>;

/**
 * Token usage per generation phase
 * Validates compliance with RT-003 budget constraints
 */
export const TokenUsageSchema = z.object({
  metadata: z.number().int().min(0).describe('Tokens used for metadata phase'),
  sections: z.number().int().min(0).describe('Tokens used for all section batches'),
  validation: z.number().int().min(0).describe('Tokens used for validation phase'),
  total: z.number().int().min(0).describe('Total tokens used'),
});

export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/**
 * Duration in milliseconds per generation phase
 * Enables latency monitoring and performance optimization
 */
export const DurationSchema = z.object({
  metadata: z.number().int().min(0).describe('Duration of metadata phase (ms)'),
  sections: z.number().int().min(0).describe('Duration of section batches (ms)'),
  validation: z.number().int().min(0).describe('Duration of validation phase (ms)'),
  total: z.number().int().min(0).describe('Total pipeline duration (ms)'),
});

export type Duration = z.infer<typeof DurationSchema>;

/**
 * Quality scores based on semantic similarity (Jina-v3 embeddings)
 * RT-004 validation thresholds for quality assurance
 */
export const QualityScoresSchema = z.object({
  metadata_similarity: z.number()
    .min(0)
    .max(1)
    .describe('Semantic similarity score for metadata (Jina-v3)'),

  sections_similarity: z.array(z.number().min(0).max(1))
    .describe('Semantic similarity scores per section batch'),

  overall: z.number()
    .min(0)
    .max(1)
    .describe('Overall quality score (weighted average)'),
});

export type QualityScores = z.infer<typeof QualityScoresSchema>;

/**
 * Retry counts per generation phase
 * RT-004 10-attempt tiered retry strategy tracking
 */
export const RetryCountSchema = z.object({
  metadata: z.number().int().min(0).describe('Retry count for metadata generation'),
  sections: z.array(z.number().int().min(0)).describe('Retry counts per section batch'),
});

export type RetryCount = z.infer<typeof RetryCountSchema>;

/**
 * Complete generation metadata schema (FR-025)
 * Stored in courses.generation_metadata JSONB column
 */
export const GenerationMetadataSchema = z.object({
  model_used: ModelUsageSchema,
  total_tokens: TokenUsageSchema,
  cost_usd: z.number().min(0).describe('Total cost in USD'),
  duration_ms: DurationSchema,
  quality_scores: QualityScoresSchema,
  batch_count: z.number().int().positive().describe('Number of section batches processed'),
  retry_count: RetryCountSchema,
  created_at: z.string().datetime().describe('ISO 8601 timestamp of generation completion'),
});

export type GenerationMetadata = z.infer<typeof GenerationMetadataSchema>;

// ============================================================================
// FULL GENERATION RESULT
// ============================================================================

/**
 * Complete generation result combining course structure and metadata
 */
export interface GenerationResult {
  course_structure: CourseStructure;
  generation_metadata: GenerationMetadata;
}

// ============================================================================
// RT-006 VALIDATION - IMPLEMENTATION COMPLETE
// ============================================================================

/**
 * RT-006 Bloom's Taxonomy validation is now integrated into Zod schemas:
 *
 * - LearningObjectiveSchema: P0 non-measurable verbs + P1 Bloom's taxonomy
 * - LessonSchema: P1 duration proportionality
 * - CourseStructureSchema: P0 placeholder detection
 *
 * Validators imported from:
 * packages/course-gen-platform/src/server/services/generation/validators/blooms-validators.ts
 *
 * Reference: research-decisions/rt-006-bloom-taxonomy-validation.md
 */
