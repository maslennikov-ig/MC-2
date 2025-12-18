/**
 * LessonSpecificationV2 Schema with Semantic Scaffolding
 * @module lesson-specification-v2
 *
 * This module implements the Semantic Scaffolding approach for lesson generation.
 * Semantic Scaffolding provides structured blueprints that guide LLM content generation
 * while preserving creative flexibility within defined constraints.
 *
 * Key Principles:
 * 1. **Structure over Content**: Define WHAT to cover, not HOW to say it
 * 2. **Temperature Routing**: ContentArchetype determines generation temperature
 * 3. **RAG Integration**: Each section specifies its own RAG context requirements
 * 4. **Rubric-Driven Exercises**: Exercises include assessment criteria for consistency
 *
 * NOTE: This module defines V2-specific types that are distinct from existing types
 * in other modules (lesson-content.ts, generation-result.ts). The V2 suffix indicates
 * this is part of the new Semantic Scaffolding system for Stage 6 generation.
 *
 * @see data-model.md for the complete specification
 * @see Stage 6 Generation Strategy for implementation details
 */

import { z } from 'zod';

// Re-export ContentArchetype from lesson-content.ts for convenience
// This is the canonical source for content archetypes
export { ContentArchetypeSchema, type ContentArchetype } from './lesson-content';

// ============================================================================
// V2-Specific Enums and Types (Semantic Scaffolding)
// These are distinct from existing types and use V2 suffix where needed
// ============================================================================

/**
 * Difficulty level for V2 lesson specifications.
 * Uses same values as existing DifficultyLevel but defined here
 * for self-contained V2 schema.
 */
export const LessonDifficultyLevelV2Schema = z.enum(['beginner', 'intermediate', 'advanced']);

/**
 * Exercise types supported by V2 Semantic Scaffolding.
 * Different from legacy exercise types - designed for rubric-driven assessment.
 */
export const ExerciseTypeV2Schema = z.enum([
  'coding',
  'conceptual',
  'case_study',
  'debugging',
  'design',
]);

/**
 * Bloom's Taxonomy levels for learning objectives.
 * Ordered from lower-order to higher-order thinking skills.
 */
export const BloomLevelV2Schema = z.enum([
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
]);

/**
 * Target audience for V2 Semantic Scaffolding content adaptation.
 * Different from TargetAudience in analysis-job.ts (which uses beginner/intermediate/advanced/mixed).
 * V2 uses executive/practitioner/novice for business context.
 */
export const TargetAudienceV2Schema = z.enum(['executive', 'practitioner', 'novice']);

/**
 * Content tone for generation guidance
 */
export const ContentToneV2Schema = z.enum(['formal', 'conversational-professional']);

/**
 * Compliance level affects how strictly content follows templates
 */
export const ComplianceLevelV2Schema = z.enum(['strict', 'standard']);

/**
 * Hook strategy for lesson introductions
 */
export const HookStrategyV2Schema = z.enum(['analogy', 'statistic', 'challenge', 'question']);

/**
 * Section depth determines content detail level
 */
export const SectionDepthV2Schema = z.enum(['summary', 'detailed_analysis', 'comprehensive']);

/**
 * Exercise difficulty for progressive challenge
 */
export const ExerciseDifficultyV2Schema = z.enum(['easy', 'medium', 'hard']);

// ============================================================================
// Learning Objective V2 Schema
// ============================================================================

/**
 * Learning objective with Bloom's Taxonomy classification for V2.
 * Each objective must be measurable and aligned to a cognitive level.
 *
 * This is distinct from LearningObjective in generation-result.ts which includes
 * additional fields like estimatedDuration and targetAudienceLevel.
 */
export const LearningObjectiveV2Schema = z.object({
  /** Unique identifier for cross-referencing with exercises (e.g., "LO-1.1.1") */
  id: z.string().min(1, 'Learning objective ID is required'),

  /** Clear, measurable objective statement starting with action verb */
  objective: z
    .string()
    .min(10, 'Objective must be at least 10 characters')
    .max(500, 'Objective too long'),

  /**
   * Bloom's Taxonomy level indicating cognitive complexity.
   * Higher levels (analyze, evaluate, create) indicate deeper learning.
   */
  bloom_level: BloomLevelV2Schema,
});

// ============================================================================
// Lesson Metadata V2 Schema
// ============================================================================

/**
 * Lesson metadata controls generation parameters and content adaptation.
 * These settings influence temperature routing and style selection.
 */
export const LessonMetadataV2Schema = z.object({
  /**
   * Target audience affects vocabulary complexity and example depth.
   * - executive: High-level, business-focused, minimal technical detail
   * - practitioner: Technical, hands-on, implementation-focused
   * - novice: Foundational, step-by-step, extensive explanations
   */
  target_audience: TargetAudienceV2Schema,

  /**
   * Content tone for generation.
   * - formal: Academic, third-person, structured
   * - conversational-professional: Second-person, engaging, professional
   */
  tone: ContentToneV2Schema,

  /**
   * Compliance level affects template adherence.
   * - strict: Exact template following (legal, compliance content)
   * - standard: Flexible within guidelines
   */
  compliance_level: ComplianceLevelV2Schema,

  /**
   * Primary content archetype for temperature routing.
   * Determines base generation temperature for the entire lesson.
   * Uses ContentArchetypeSchema from lesson-content.ts
   */
  content_archetype: z.enum(['code_tutorial', 'concept_explainer', 'case_study', 'legal_warning']),
});

// ============================================================================
// Introduction Blueprint Schema
// ============================================================================

/**
 * Blueprint for lesson introduction generation.
 * Provides semantic scaffolding for creating engaging lesson openers.
 */
export const IntroBlueprintV2Schema = z.object({
  /**
   * Hook strategy determines the opening approach.
   * - analogy: Start with relatable comparison
   * - statistic: Lead with surprising data
   * - challenge: Present a problem to solve
   * - question: Open with thought-provoking question
   */
  hook_strategy: HookStrategyV2Schema,

  /** Topic or theme for the hook (e.g., "building blocks", "90% failure rate") */
  hook_topic: z.string().min(1, 'Hook topic is required').max(200, 'Hook topic too long'),

  /** Comma-separated key learning objectives to highlight in intro */
  key_learning_objectives: z
    .string()
    .min(10, 'Key learning objectives must be at least 10 characters'),
});

// ============================================================================
// Section Constraints Schema
// ============================================================================

/**
 * Constraints for section content generation.
 * Defines boundaries and requirements for LLM output.
 */
export const SectionConstraintsV2Schema = z.object({
  /**
   * Content depth level.
   * - summary: Brief overview (200-400 words)
   * - detailed_analysis: In-depth coverage (500-1000 words)
   * - comprehensive: Exhaustive treatment (1000+ words)
   */
  depth: SectionDepthV2Schema,

  /** Keywords that MUST appear in generated content */
  required_keywords: z.array(z.string().min(1)).default([]),

  /** Terms to AVOID in generated content (competitor names, outdated terminology) */
  prohibited_terms: z.array(z.string().min(1)).default([]),
});

// ============================================================================
// Section Specification V2 Schema
// ============================================================================

/**
 * Section specification with semantic scaffolding.
 * Each section is a self-contained unit with its own RAG context and generation parameters.
 */
export const SectionSpecV2Schema = z.object({
  /** Section title for navigation and headers */
  title: z.string().min(1, 'Section title is required').max(200, 'Section title too long'),

  /**
   * Content archetype for this specific section.
   * Overrides lesson-level archetype for temperature routing.
   */
  content_archetype: z.enum(['code_tutorial', 'concept_explainer', 'case_study', 'legal_warning']),

  /**
   * Reference to RAG context in lesson's rag_context.
   * Links to primary_documents for context injection.
   */
  rag_context_id: z.string().min(1, 'RAG context ID is required'),

  /** Generation constraints for this section */
  constraints: SectionConstraintsV2Schema,

  /**
   * Key points that MUST be covered in this section.
   * LLM must address each point (semantic requirement, not verbatim).
   */
  key_points_to_cover: z
    .array(z.string().min(5, 'Key point must be at least 5 characters'))
    .min(1, 'Must have at least 1 key point'),

  /**
   * Optional analogies to incorporate for concept explanation.
   * Provides creative direction while maintaining consistency.
   */
  analogies_to_use: z.string().max(500, 'Analogies too long').optional(),
});

// ============================================================================
// Rubric Criterion Schema
// ============================================================================

/**
 * Rubric criterion for exercise assessment.
 * Ensures consistent grading across generated exercises.
 */
export const RubricCriterionV2Schema = z.object({
  /** Assessment criteria descriptions */
  criteria: z.array(z.string().min(5, 'Criterion must be at least 5 characters')).min(1),

  /**
   * Weight for this criterion (0-100).
   * All weights in an exercise's rubric must sum to 100.
   */
  weight: z
    .number()
    .int('Weight must be an integer')
    .min(0, 'Weight must be at least 0')
    .max(100, 'Weight cannot exceed 100'),
});

// ============================================================================
// Exercise Specification V2 Schema
// ============================================================================

/**
 * Exercise specification with rubric-driven assessment.
 * Exercises are linked to learning objectives for alignment tracking.
 */
export const ExerciseSpecV2Schema = z.object({
  /** Exercise type determines format and interaction model */
  type: ExerciseTypeV2Schema,

  /** Difficulty level for progressive challenge */
  difficulty: ExerciseDifficultyV2Schema,

  /**
   * Reference to learning objective this exercise assesses.
   * Must match an id in lesson's learning_objectives array.
   */
  learning_objective_id: z.string().min(1, 'Learning objective ID is required'),

  /**
   * Structure template for exercise generation.
   * Provides scaffolding for consistent exercise format.
   * Example: "Given [scenario], implement [requirement] that [acceptance criteria]"
   */
  structure_template: z
    .string()
    .min(20, 'Structure template must be at least 20 characters')
    .max(1000, 'Structure template too long'),

  /**
   * Rubric criteria for assessment.
   * Weights must sum to 100 for valid rubric.
   */
  rubric_criteria: z
    .array(RubricCriterionV2Schema)
    .min(1, 'Must have at least 1 rubric criterion')
    .superRefine((criteria, ctx) => {
      const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
      if (totalWeight !== 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Rubric weights must sum to 100, got ${totalWeight}`,
        });
      }
    }),
});

// ============================================================================
// Lesson RAG Context Schema
// ============================================================================

/**
 * RAG context specification for lesson generation.
 * Defines retrieval parameters and expected chunk counts.
 */
export const LessonRAGContextV2Schema = z.object({
  /**
   * Primary document IDs from file_catalog.
   * These documents provide the authoritative source material.
   */
  primary_documents: z.array(z.string().min(1)).min(1, 'Must have at least 1 primary document'),

  /**
   * Search queries for vector retrieval.
   * Used to fetch relevant chunks from the knowledge base.
   */
  search_queries: z.array(z.string().min(3, 'Search query must be at least 3 characters')).min(1),

  /**
   * Expected number of chunks to retrieve.
   * Typical range: 5-10 chunks per lesson.
   * Affects context window usage and generation quality.
   */
  expected_chunks: z
    .number()
    .int('Expected chunks must be an integer')
    .min(5, 'Minimum 5 chunks expected')
    .max(10, 'Maximum 10 chunks expected'),
});

// ============================================================================
// Main Lesson Specification V2 Schema
// ============================================================================

/**
 * Complete LessonSpecificationV2 schema with Semantic Scaffolding.
 *
 * This schema defines the blueprint for lesson generation in Stage 6.
 * It provides structured guidance for LLM content creation while
 * preserving creative flexibility within defined constraints.
 *
 * The Semantic Scaffolding approach ensures:
 * 1. Consistent lesson structure across the course
 * 2. Proper RAG context integration per section
 * 3. Temperature-optimized generation via content archetypes
 * 4. Assessment alignment through learning objective linking
 *
 * @example
 * ```typescript
 * const lessonSpec: LessonSpecificationV2 = {
 *   lesson_id: "1.1",
 *   title: "Introduction to TypeScript",
 *   description: "Learn the fundamentals of TypeScript type system",
 *   metadata: {
 *     target_audience: "practitioner",
 *     tone: "conversational-professional",
 *     compliance_level: "standard",
 *     content_archetype: "code_tutorial"
 *   },
 *   learning_objectives: [
 *     { id: "LO-1.1.1", objective: "Explain type inference", bloom_level: "understand" }
 *   ],
 *   // ... rest of specification
 * };
 * ```
 */
export const LessonSpecificationV2Schema = z.object({
  /**
   * Unique lesson identifier within the course.
   * Format: "section.lesson" (e.g., "1.1", "2.3", "3.10")
   */
  lesson_id: z
    .string()
    .min(1, 'Lesson ID is required')
    .regex(/^\d+\.\d+$/, 'Lesson ID must be in format "section.lesson" (e.g., "1.1")'),

  /** Lesson title for display and navigation */
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title too long'),

  /** Brief lesson description for course outline */
  description: z
    .string()
    .min(20, 'Description must be at least 20 characters')
    .max(1000, 'Description too long'),

  /** Metadata controlling generation parameters */
  metadata: LessonMetadataV2Schema,

  /**
   * Learning objectives aligned to Bloom's Taxonomy.
   * Each objective must be measurable and assessable.
   */
  learning_objectives: z.array(LearningObjectiveV2Schema).min(1, 'Must have at least 1 learning objective'),

  /** Blueprint for lesson introduction generation */
  intro_blueprint: IntroBlueprintV2Schema,

  /**
   * Section specifications with semantic scaffolding.
   * Each section is independently configurable for RAG and temperature.
   */
  sections: z.array(SectionSpecV2Schema).min(1, 'Must have at least 1 section'),

  /**
   * Exercise specifications with rubric-driven assessment.
   * Exercises are linked to learning objectives for alignment tracking.
   */
  exercises: z.array(ExerciseSpecV2Schema).default([]),

  /** RAG context specification for lesson content retrieval */
  rag_context: LessonRAGContextV2Schema,

  /**
   * Estimated lesson duration in minutes.
   * Used for course planning and pacing.
   */
  estimated_duration_minutes: z
    .number()
    .int('Duration must be an integer')
    .min(3, 'Minimum lesson duration: 3 minutes')
    .max(45, 'Maximum lesson duration: 45 minutes (FR-014)'),

  /** Overall lesson difficulty level */
  difficulty_level: LessonDifficultyLevelV2Schema,
});

// ============================================================================
// Type Exports (V2 Specific)
// ============================================================================

/** Difficulty level for V2 lessons */
export type LessonDifficultyLevelV2 = z.infer<typeof LessonDifficultyLevelV2Schema>;

/** Exercise type enumeration for V2 */
export type ExerciseTypeV2 = z.infer<typeof ExerciseTypeV2Schema>;

/** Bloom's Taxonomy level for V2 */
export type BloomLevelV2 = z.infer<typeof BloomLevelV2Schema>;

/** Target audience type for V2 (executive/practitioner/novice) */
export type TargetAudienceV2 = z.infer<typeof TargetAudienceV2Schema>;

/** Content tone type for V2 */
export type ContentToneV2 = z.infer<typeof ContentToneV2Schema>;

/** Compliance level type for V2 */
export type ComplianceLevelV2 = z.infer<typeof ComplianceLevelV2Schema>;

/** Hook strategy type for V2 */
export type HookStrategyV2 = z.infer<typeof HookStrategyV2Schema>;

/** Section depth type for V2 */
export type SectionDepthV2 = z.infer<typeof SectionDepthV2Schema>;

/** Exercise difficulty type for V2 */
export type ExerciseDifficultyV2 = z.infer<typeof ExerciseDifficultyV2Schema>;

/** Learning objective interface for V2 */
export type LearningObjectiveV2 = z.infer<typeof LearningObjectiveV2Schema>;

/** Lesson metadata interface for V2 */
export type LessonMetadataV2 = z.infer<typeof LessonMetadataV2Schema>;

/** Introduction blueprint interface for V2 */
export type IntroBlueprintV2 = z.infer<typeof IntroBlueprintV2Schema>;

/** Section constraints interface for V2 */
export type SectionConstraintsV2 = z.infer<typeof SectionConstraintsV2Schema>;

/** Section specification V2 interface */
export type SectionSpecV2 = z.infer<typeof SectionSpecV2Schema>;

/** Rubric criterion interface for V2 */
export type RubricCriterionV2 = z.infer<typeof RubricCriterionV2Schema>;

/** Exercise specification V2 interface */
export type ExerciseSpecV2 = z.infer<typeof ExerciseSpecV2Schema>;

/** Lesson RAG context interface for V2 */
export type LessonRAGContextV2 = z.infer<typeof LessonRAGContextV2Schema>;

/** Complete lesson specification V2 interface */
export type LessonSpecificationV2 = z.infer<typeof LessonSpecificationV2Schema>;

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate a lesson specification with detailed error reporting.
 *
 * @param data - Raw lesson specification data to validate
 * @returns Validated LessonSpecificationV2 or throws ZodError
 *
 * @example
 * ```typescript
 * try {
 *   const validSpec = validateLessonSpecificationV2(rawData);
 *   console.log('Valid lesson:', validSpec.lesson_id);
 * } catch (error) {
 *   if (error instanceof z.ZodError) {
 *     console.error('Validation errors:', error.errors);
 *   }
 * }
 * ```
 */
export function validateLessonSpecificationV2(data: unknown): LessonSpecificationV2 {
  return LessonSpecificationV2Schema.parse(data);
}

/**
 * Safely validate a lesson specification without throwing.
 *
 * @param data - Raw lesson specification data to validate
 * @returns SafeParseResult with success status and data/error
 *
 * @example
 * ```typescript
 * const result = safeParseLessonSpecificationV2(rawData);
 * if (result.success) {
 *   console.log('Valid:', result.data.lesson_id);
 * } else {
 *   console.error('Invalid:', result.error.issues);
 * }
 * ```
 */
export function safeParseLessonSpecificationV2(
  data: unknown
): z.SafeParseReturnType<unknown, LessonSpecificationV2> {
  return LessonSpecificationV2Schema.safeParse(data);
}

/**
 * Temperature mapping for content archetypes.
 * Used by generation workers to set appropriate LLM temperature.
 *
 * Single Source of Truth for archetype temperature configuration.
 * Re-exported as ARCHETYPE_TEMPERATURES in course-gen-platform for backwards compatibility.
 *
 * NOTE: Uses inline type to avoid circular import with lesson-content.ts
 */
export const CONTENT_ARCHETYPE_TEMPERATURES_V2: Record<
  'code_tutorial' | 'concept_explainer' | 'case_study' | 'legal_warning',
  { min: number; max: number; default: number }
> = {
  code_tutorial: { min: 0.2, max: 0.3, default: 0.25 },
  concept_explainer: { min: 0.6, max: 0.7, default: 0.65 },
  case_study: { min: 0.5, max: 0.6, default: 0.55 },
  legal_warning: { min: 0.0, max: 0.1, default: 0.05 },
};

/**
 * Get recommended temperature for a content archetype.
 *
 * @param archetype - The content archetype
 * @returns Middle value of the temperature range (default: 0.5 for unknown archetypes)
 */
export function getRecommendedTemperatureV2(
  archetype: string
): number {
  const range = CONTENT_ARCHETYPE_TEMPERATURES_V2[archetype as keyof typeof CONTENT_ARCHETYPE_TEMPERATURES_V2];
  if (!range) {
    // Default temperature for unknown archetypes
    return 0.5;
  }
  return (range.min + range.max) / 2;
}
