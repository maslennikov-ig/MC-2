/**
 * Stage 5 - Generation Phase: Course Structure Schema
 *
 * This module defines comprehensive Zod schemas for course generation output
 * including placeholder validation.
 *
 * @module generation-result
 * @see specs/008-generation-generation-json/data-model.md
 * @see docs/generation/LLM-VALIDATION-BEST-PRACTICES.md
 */

import { z } from 'zod';

// Import from common-enums.ts (single source of truth)
import { courseLevelSchema, type CourseLevel } from './common-enums';

// ============================================================================
// VALIDATION SEVERITY SYSTEM
// ============================================================================

/**
 * 3-tier validation severity system
 *
 * - ERROR: Blocks saving/progression (incomplete content)
 * - WARNING: Logs but allows progression
 * - INFO: Monitoring only, no blocking (metrics for optimization)
 */
export enum ValidationSeverity {
  ERROR = 'error', // Blocks saving/progression
  WARNING = 'warning', // Logs but allows progression
  INFO = 'info', // Monitoring only, no blocking
}

/**
 * Validation result structure
 *
 * Structured severity-based results including quality scores,
 * issues categorization, and LLM-friendly suggestions.
 */
export interface ValidationResult {
  passed: boolean; // Overall pass/fail status
  severity: ValidationSeverity; // Severity level of this validation
  score: number; // Quality score 0.0-1.0
  issues?: string[]; // ERROR-level issues (blocks progression)
  warnings?: string[]; // WARNING-level issues (logs only)
  info?: string[]; // INFO-level messages (monitoring)
  suggestion?: string; // LLM-friendly retry suggestion
  metadata?: {
    // Optional metadata for debugging
    rule?: string; // Rule name that triggered this result
    expected?: { min: number; max: number }; // Expected range (for duration validation)
    actual?: number; // Actual value (for duration validation)
  };
}

// ============================================================================
// VALIDATION CONSTANTS AND HELPERS
// ============================================================================

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
  /\b(N|X|Y|Z)\s+(students|hours|modules|студентов|часов|модулей)\b/i,
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
 * Helper: Check if template variables are intentional in the context
 *
 * RT-007 P5: Avoid false positives for intentional template variables
 * in practical exercises (e.g., "Используйте переменные: {{Имя}}, {{Email}}")
 */
function isIntentionalTemplateVariable(text: string): boolean {
  const intentionalContextPatterns = [
    /используйте\s+(переменн|шаблон|перемен)/i, // Russian: "используйте переменные/шаблон"
    /use\s+(variable|template|placeholder)/i, // English: "use variables/template"
    /подставьте\s+(значени|данн)/i, // Russian: "подставьте значения/данные"
    /заполните\s+шаблон/i, // Russian: "заполните шаблон"
    /fill\s+in\s+the\s+(template|placeholder)/i, // English: "fill in the template"
    /переменные:/i, // Russian: "переменные:" (list follows)
    /variables:/i, // English: "variables:" (list follows)
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
        match: match[0], // The actual matched text
      });
    }
  }

  return matches;
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
        patternIndex: PLACEHOLDER_PATTERNS.indexOf(pattern),
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

// PracticalExerciseSchema REMOVED — Stage 6 generates exercises independently from lesson content.
// Stage 5 no longer generates practical_exercises (token savings: ~20-30% of output).
// See: stage6-lesson-content/nodes/generator/generator-content.ts generateExercises()

// ============================================================================
// LEARNING OBJECTIVES
// ============================================================================

/**
 * Supported languages for course generation (19 languages)
 *
 * Matches SUPPORTED_LANGUAGES from packages/web/lib/validation/course.ts
 */
export const SupportedLanguageSchema = z.enum([
  'ru', // Russian (Русский)
  'en', // English (Английский)
  'zh', // Chinese Simplified (简体中文)
  'es', // Spanish (Español)
  'fr', // French (Français)
  'de', // German (Deutsch)
  'ja', // Japanese (日本語)
  'ko', // Korean (한국어)
  'ar', // Arabic (العربية)
  'pt', // Portuguese (Português)
  'it', // Italian (Italiano)
  'tr', // Turkish (Türkçe)
  'vi', // Vietnamese (Tiếng Việt)
  'th', // Thai (ไทย)
  'id', // Indonesian (Bahasa Indonesia)
  'ms', // Malay (Bahasa Melayu)
  'hi', // Hindi (हिन्दी)
  'bn', // Bengali (বাংলা)
  'pl', // Polish (Polski)
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
  text: z
    .string()
    .min(10, 'Learning objective too short (min 10 chars)')
    .max(500, 'Learning objective too long (max 500 chars)'),
  language: SupportedLanguageSchema.describe('Language of the learning objective'),
});

/**
 * Learning objective schema for validation
 */
export const LearningObjectiveSchema = LearningObjectiveBaseSchema;

export type LearningObjective = z.infer<typeof LearningObjectiveSchema>;

/**
 * Learning objective schema WITHOUT id and language fields
 *
 * Used for LLM generation validation BEFORE code injection of:
 * - id: Generated by crypto.randomUUID()
 * - language: Injected from frontend_parameters.language
 *
 * After LLM generation, use LearningObjectiveSchema for final validation.
 */
export const LearningObjectiveWithoutInjectedFieldsSchema = LearningObjectiveBaseSchema.omit({
  id: true,
  language: true,
});

export type LearningObjectiveWithoutInjectedFields = z.infer<
  typeof LearningObjectiveWithoutInjectedFieldsSchema
>;

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
  lesson_number: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Lesson number (optional - can derive from array index)'),
  lesson_title: z
    .string()
    .min(5, 'Lesson title too short (min 5 chars)')
    .max(500, 'Lesson title too long (max 500 chars - FR-022)'),

  // Technical specifications for Stage 6 lesson generation (FR-011)
  lesson_objectives: z
    .array(z.string().min(10).max(600))
    .min(1, 'At least 1 learning objective required')
    .max(5, 'Maximum 5 learning objectives per lesson')
    .describe(
      'Specific learning objectives for this lesson (simple strings per spec data-model.md, min 10 chars, CRITICAL for Stage 6)'
    ),

  key_topics: z
    .array(z.string().min(5).max(300))
    .min(2, 'At least 2 key topics required')
    .max(10, 'Maximum 10 key topics per lesson')
    .describe('Key topics covered in this lesson (CRITICAL for Stage 6)'),

  estimated_duration_minutes: z
    .number()
    .int()
    .min(3, 'Duration too short (min 3 minutes)')
    .max(45, 'Duration too long (max 45 minutes)')
    .describe('Estimated time to complete this lesson (3-45 minutes)'),

  // RT-007 P1: Difficulty level for duration multiplier
  difficulty_level: z
    .enum(['beginner', 'intermediate', 'advanced'])
    .optional()
    .describe(
      'Difficulty level affects duration expectations (beginner: 1.0x, intermediate: 1.5x, advanced: 2.0x)'
    ),

  // practical_exercises REMOVED — Stage 6 generates exercises from lesson content independently
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
  section_number: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Section number (optional - can derive from array index)'),
  section_title: z
    .string()
    .min(10, 'Section title too short (min 10 chars)')
    .max(600, 'Section title too long (max 600 chars - FR-022)'),
  section_description: z
    .string()
    .min(20, 'Section description too short (min 20 chars)')
    .max(2000, 'Section description too long (max 2000 chars - FR-022)'),

  // Pedagogical structure (FR-012)
  learning_objectives: z
    .array(z.string().min(10).max(600))
    .min(1, 'At least 1 section-level learning objective required')
    .max(5, 'Maximum 5 section-level learning objectives')
    .describe(
      'Section-level learning objectives (simple strings per spec data-model.md, min 10 chars, 1-5 items)'
    ),

  // Nested lessons (WITHOUT duration - will be injected)
  lessons: z
    .array(LessonWithoutInjectedFieldsSchema)
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
export const SectionSchema = z
  .object({
    section_number: z.number().int().positive().optional(),
    section_title: z
      .string()
      .min(10, 'Section title too short (min 10 chars)')
      .max(600, 'Section title too long (max 600 chars - FR-022)'),
    section_description: z
      .string()
      .min(20, 'Section description too short (min 20 chars)')
      .max(2000, 'Section description too long (max 2000 chars - FR-022)'),

    learning_objectives: z
      .array(z.string().min(10).max(600))
      .min(1, 'At least 1 section-level learning objective required')
      .max(5, 'Maximum 5 section-level learning objectives')
      .describe(
        'Section-level learning objectives (simple strings per spec data-model.md, min 10 chars, 1-5 items)'
      ),

    // Lessons with injected duration
    lessons: z
      .array(LessonSchema)
      .min(1, 'At least 1 lesson required per section')
      .describe('Lessons within this section (minimum 1)'),
  })
  .transform(section => ({
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

// AssessmentStrategySchema REMOVED — not consumed by Stage 6 or any downstream pipeline.
// Was displayed in UI (CourseStructureView) but didn't influence content generation.

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
export const CourseStructureSchema = z
  .object({
    // ========== METADATA ==========

    course_title: z
      .string()
      .min(10, 'Course title too short (min 10 chars)')
      .max(1000, 'Course title too long (max 1000 chars - FR-022)')
      .describe('Course title (10-1000 characters)'),

    course_description: z
      .string()
      .min(20, 'Course description too short (min 20 chars)')
      .max(3000, 'Course description too long (max 3000 chars - FR-022)')
      .describe('Short course description, elevator pitch (20-3000 chars, spec recommends 50+)'),

    course_overview: z
      .string()
      .min(30, 'Course overview too short (min 30 chars)')
      .max(10000, 'Course overview too long (max 10000 chars - FR-022)')
      .optional()
      .describe(
        'DEPRECATED: Redundant with course_description. Optional for backward compatibility.'
      ),

    target_audience: z
      .string()
      .min(20, 'Target audience too short (min 20 chars)')
      .max(1500, 'Target audience too long (max 1500 chars - FR-022)')
      .optional()
      .describe('Description of target audience (optional - can derive from difficulty_level)'),

    estimated_duration_hours: z.number().positive().describe('Total estimated duration in hours'),

    difficulty_level: DifficultyLevelSchema.describe('Overall difficulty level'),

    prerequisites: z
      .array(z.string().min(10).max(600))
      .min(0)
      .max(10)
      .describe('List of prerequisites (0-10 items, 10-600 chars each - FR-022)'),

    learning_outcomes: z
      .array(LearningObjectiveSchema)
      .min(3, 'At least 3 course-level learning outcomes required')
      .max(15, 'Maximum 15 course-level learning outcomes (FR-012)')
      .describe('Course-level learning outcomes (3-15 items)'),

    // assessment_strategy REMOVED — not consumed by Stage 6 or downstream pipeline

    course_tags: z
      .array(z.string().min(3).max(150))
      .min(5, 'At least 5 course tags required')
      .max(20, 'Maximum 20 course tags')
      .describe('Descriptive tags for course (5-20 tags, max 150 chars each - FR-022)'),

    // ========== HIERARCHY ==========

    sections: z
      .array(SectionSchema)
      .min(1, 'At least 1 section required')
      .describe('Course sections containing lessons'),
  })
  // NOTE: FR-015 (minimum lessons) validation is handled dynamically in Stage 4 Phase 5
  // based on course_size preset (MICRO: 2-4, MINI: 8-16, COMPACT: 15-30, etc.)
  // Hardcoded min 10 check removed to support course_size flexibility
  .refine(
    structure => {
      // Validate no placeholders in course structure
      const issues = scanForPlaceholders(structure);

      if (issues.length > 0 && process.env.NODE_ENV === 'development') {
        // Log detailed info for debugging
        console.error('[Placeholder] Validation failed:', JSON.stringify(issues, null, 2));
      }

      return issues.length === 0;
    },
    structure => {
      const issues = scanForPlaceholders(structure);

      // Build detailed error message
      const details = issues
        .map(
          issue =>
            `${issue.path}: "${issue.matchedText}" (pattern #${issue.patternIndex}: ${issue.matchedPattern})`
        )
        .join('; ');

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
export const CourseMetadataSchema = z
  .object({
    course_title: z
      .string()
      .min(10, 'Course title too short (min 10 chars)')
      .max(1000, 'Course title too long (max 1000 chars - FR-022)')
      .describe('Course title (10-1000 characters)'),

    course_description: z
      .string()
      .min(20, 'Course description too short (min 20 chars)')
      .max(3000, 'Course description too long (max 3000 chars - FR-022)')
      .describe('Short course description, elevator pitch (20-3000 chars, spec recommends 50+)'),

    course_overview: z
      .string()
      .min(30, 'Course overview too short (min 30 chars)')
      .max(10000, 'Course overview too long (max 10000 chars - FR-022)')
      .optional()
      .describe(
        'DEPRECATED: Redundant with course_description. Optional for backward compatibility.'
      ),

    target_audience: z
      .string()
      .min(20, 'Target audience too short (min 20 chars)')
      .max(1500, 'Target audience too long (max 1500 chars - FR-022)')
      .optional()
      .describe('Description of target audience (optional - can derive from difficulty_level)'),

    estimated_duration_hours: z.number().positive().describe('Total estimated duration in hours'),

    difficulty_level: DifficultyLevelSchema.describe('Overall difficulty level'),

    prerequisites: z
      .array(z.string().min(10).max(600))
      .min(0)
      .max(10)
      .describe('List of prerequisites (0-10 items, 10-600 chars each - FR-022)'),

    learning_outcomes: z
      .array(LearningObjectiveSchema)
      .min(3, 'At least 3 course-level learning outcomes required')
      .max(15, 'Maximum 15 course-level learning outcomes (FR-012)')
      .describe('Course-level learning outcomes (3-15 items)'),

    // assessment_strategy REMOVED — not consumed by Stage 6 or downstream pipeline

    course_tags: z
      .array(z.string().min(3).max(150))
      .min(5, 'At least 5 course tags required')
      .max(20, 'Maximum 20 course tags')
      .describe('Descriptive tags for course (5-20 tags, max 150 chars each - FR-022)'),
  })
  .partial();

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
export const CourseMetadataWithoutInjectedFieldsSchema = z
  .object({
    course_title: z
      .string()
      .min(10, 'Course title too short (min 10 chars)')
      .max(1000, 'Course title too long (max 1000 chars - FR-022)')
      .describe('Course title (10-1000 characters)'),

    course_description: z
      .string()
      .min(20, 'Course description too short (min 20 chars)')
      .max(3000, 'Course description too long (max 3000 chars - FR-022)')
      .describe('Short course description, elevator pitch (20-3000 chars, spec recommends 50+)'),

    course_overview: z
      .string()
      .min(30, 'Course overview too short (min 30 chars)')
      .max(10000, 'Course overview too long (max 10000 chars - FR-022)')
      .optional()
      .describe(
        'DEPRECATED: Redundant with course_description. Optional for backward compatibility.'
      ),

    target_audience: z
      .string()
      .min(20, 'Target audience too short (min 20 chars)')
      .max(1500, 'Target audience too long (max 1500 chars - FR-022)')
      .optional()
      .describe('Description of target audience (optional - can derive from difficulty_level)'),

    estimated_duration_hours: z.number().positive().describe('Total estimated duration in hours'),

    difficulty_level: DifficultyLevelSchema.describe('Overall difficulty level'),

    prerequisites: z
      .array(z.string().min(10).max(600))
      .min(0)
      .max(10)
      .describe('List of prerequisites (0-10 items, 10-600 chars each - FR-022)'),

    learning_outcomes: z
      .array(LearningObjectiveWithoutInjectedFieldsSchema)
      .min(3, 'At least 3 course-level learning outcomes required')
      .max(15, 'Maximum 15 course-level learning outcomes (FR-012)')
      .describe(
        'Course-level learning outcomes WITHOUT id/language (injected by code after validation)'
      ),

    // assessment_strategy REMOVED — not consumed by Stage 6 or downstream pipeline

    course_tags: z
      .array(z.string().min(3).max(150))
      .min(5, 'At least 5 course tags required')
      .max(20, 'Maximum 20 course tags')
      .describe('Descriptive tags for course (5-20 tags, max 150 chars each - FR-022)'),
  })
  .partial();

export type CourseMetadataWithoutInjectedFields = z.infer<
  typeof CourseMetadataWithoutInjectedFieldsSchema
>;

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
  metadata_similarity: z
    .number()
    .min(0)
    .max(1)
    .describe('Semantic similarity score for metadata (Jina-v3)'),

  sections_similarity: z
    .array(z.number().min(0).max(1))
    .describe('Semantic similarity scores per section batch'),

  overall: z.number().min(0).max(1).describe('Overall quality score (weighted average)'),
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
// VALIDATION
// ============================================================================

/**
 * Validation is integrated into Zod schemas:
 *
 * - CourseStructureSchema: Placeholder detection
 * - LearningObjectiveSchema: Text length validation
 */
