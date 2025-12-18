/**
 * tRPC Procedure Contracts for Stage 4-6 Pipeline
 *
 * This file defines the API contracts for course generation stages.
 * Implementation in: packages/course-gen-platform/src/server/routers/
 *
 * @module contracts/trpc-procedures
 */

import { z } from 'zod';

// ============================================================================
// Shared Schemas
// ============================================================================

export const DifficultyLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);
export const LanguageSchema = z.enum(['en', 'ru']);
export const ContentArchetypeSchema = z.enum(['code_tutorial', 'concept_explainer', 'case_study', 'legal_warning']);
export const LessonStatusSchema = z.enum(['pending', 'generating', 'completed', 'failed', 'review_required']);

// ============================================================================
// Document Prioritization (Stage 2 Enhancement)
// ============================================================================

/**
 * Input for document classification
 * Called after document upload, before summarization
 */
export const ClassifyDocumentsInputSchema = z.object({
  course_id: z.string().uuid(),
  file_ids: z.array(z.string().uuid()).min(1),
});

export const DocumentPrioritySchema = z.object({
  file_id: z.string().uuid(),
  priority: z.enum(['HIGH', 'LOW']),
  importance_score: z.number().min(0).max(1),
  order: z.number().int().positive(),
  classification_rationale: z.string(),
});

export const ClassifyDocumentsOutputSchema = z.object({
  course_id: z.string().uuid(),
  priorities: z.array(DocumentPrioritySchema),
  total_high_priority_tokens: z.number().int().nonnegative(),
  total_low_priority_tokens: z.number().int().nonnegative(),
});

// ============================================================================
// Budget Allocation (Stage 3 Enhancement)
// ============================================================================

export const AllocateBudgetInputSchema = z.object({
  course_id: z.string().uuid(),
});

export const BudgetAllocationSchema = z.object({
  course_id: z.string().uuid(),
  selected_model: z.enum(['oss-120b', 'gemini-flash']),
  high_budget: z.number().int().positive(),
  low_budget: z.number().int().nonnegative(),
  total_high_priority_tokens: z.number().int().nonnegative(),
  total_low_priority_tokens: z.number().int().nonnegative(),
});

// ============================================================================
// Analysis Stage (Stage 4 Enhancement)
// ============================================================================

export const SectionRAGPlanSchema = z.object({
  primary_documents: z.array(z.string().uuid()),
  search_queries: z.array(z.string()).min(1),
  expected_topics: z.array(z.string()),
  confidence: z.enum(['high', 'medium']),
  note: z.string().optional(),
});

export const DocumentRelevanceMappingSchema = z.record(z.string(), SectionRAGPlanSchema);

export const GenerationGuidanceSchema = z.object({
  tone: z.enum(['conversational but precise', 'formal academic', 'casual friendly', 'technical professional']),
  use_analogies: z.boolean(),
  specific_analogies: z.array(z.string()).optional(),
  avoid_jargon: z.array(z.string()),
  include_visuals: z.array(z.enum(['diagrams', 'flowcharts', 'code examples', 'screenshots'])),
  exercise_types: z.array(z.enum(['coding', 'conceptual', 'case_study', 'debugging', 'design'])),
  contextual_language_hints: z.string(),
  real_world_examples: z.array(z.string()).optional(),
});

/**
 * Enhanced AnalysisResult with RAG Planning
 */
export const AnalysisResultEnhancedSchema = z.object({
  // Existing fields preserved...
  course_category: z.object({
    primary: z.string(),
    secondary: z.array(z.string()),
    rationale: z.string(),
  }),
  recommended_structure: z.object({
    total_lessons: z.number().int().min(10),
    total_sections: z.number().int().min(3).max(7),
    estimated_content_hours: z.number().positive(),
    difficulty_level: DifficultyLevelSchema,
  }),
  sections_breakdown: z.array(z.object({
    section_id: z.string(),
    area: z.string(),
    estimated_lessons: z.number().int().min(3).max(5),
    importance: z.enum(['core', 'important', 'optional']),
    learning_objectives: z.array(z.string()),
    key_topics: z.array(z.string()),
    pedagogical_approach: z.string(),
    difficulty_progression: z.enum(['flat', 'gradual', 'steep']),
    // NEW fields
    estimated_duration_hours: z.number().positive(),
    difficulty: DifficultyLevelSchema,
    prerequisites: z.array(z.string()),
  })),
  // NEW: RAG Planning output
  document_relevance_mapping: DocumentRelevanceMappingSchema.optional(),
  // NEW: Structured guidance
  generation_guidance: GenerationGuidanceSchema,
});

// ============================================================================
// Generation Stage (Stage 5 Enhancement)
// ============================================================================

export const LearningObjectiveSchema = z.object({
  verb: z.string(),
  content: z.string(),
  bloom_level: z.enum(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']),
});

export const IntroBlueprintSchema = z.object({
  hook_strategy: z.enum(['analogy', 'statistic', 'challenge', 'question']),
  hook_topic: z.string(),
  key_learning_objectives: z.string(),
});

export const SectionConstraintsSchema = z.object({
  depth: z.enum(['summary', 'detailed_analysis', 'comprehensive']),
  required_keywords: z.array(z.string()),
  prohibited_terms: z.array(z.string()),
});

export const SectionSpecV2Schema = z.object({
  title: z.string(),
  content_archetype: ContentArchetypeSchema,
  rag_context_id: z.string().uuid(),
  constraints: SectionConstraintsSchema,
  key_points_to_cover: z.array(z.string()).min(1),
  analogies_to_use: z.string().optional(),
});

export const RubricCriterionSchema = z.object({
  criteria: z.array(z.string()),
  weight: z.number().min(0).max(100),
});

export const ExerciseSpecV2Schema = z.object({
  type: z.enum(['coding', 'conceptual', 'case_study', 'debugging', 'design']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  learning_objective_id: z.string(),
  structure_template: z.string(),
  rubric_criteria: z.array(RubricCriterionSchema),
});

export const LessonMetadataSchema = z.object({
  target_audience: z.enum(['executive', 'practitioner', 'novice']),
  tone: z.enum(['formal', 'conversational-professional']),
  compliance_level: z.enum(['strict', 'standard']),
  content_archetype: ContentArchetypeSchema,
});

export const LessonRAGContextSchema = z.object({
  primary_documents: z.array(z.string().uuid()),
  search_queries: z.array(z.string()),
  expected_chunks: z.number().int().min(5).max(10),
});

/**
 * V2 LessonSpecification with Semantic Scaffolding
 */
export const LessonSpecificationV2Schema = z.object({
  lesson_id: z.string(),
  title: z.string(),
  description: z.string(),
  metadata: LessonMetadataSchema,
  learning_objectives: z.array(LearningObjectiveSchema).min(1),
  intro_blueprint: IntroBlueprintSchema,
  sections: z.array(SectionSpecV2Schema).min(1),
  exercises: z.array(ExerciseSpecV2Schema).min(1),
  rag_context: LessonRAGContextSchema,
  estimated_duration_minutes: z.number().int().min(10).max(60),
  difficulty_level: DifficultyLevelSchema,
});

// ============================================================================
// Lesson Content Generation (Stage 6 - NEW)
// ============================================================================

export const CitationSchema = z.object({
  document: z.string(),
  page_or_section: z.string(),
});

export const ContentSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  citations: z.array(CitationSchema).optional(),
});

export const ContentExampleSchema = z.object({
  title: z.string(),
  content: z.string(),
  code: z.string().optional(),
  citations: z.array(z.string()).optional(),
});

export const GradingRubricSchema = z.object({
  criteria: z.string(),
  points: z.number().int().positive(),
});

export const ContentExerciseSchema = z.object({
  question: z.string(),
  hints: z.array(z.string()).optional(),
  solution: z.string(),
  grading_rubric: z.array(GradingRubricSchema).optional(),
});

export const LessonContentBodySchema = z.object({
  intro: z.string(),
  sections: z.array(ContentSectionSchema).min(1),
  examples: z.array(ContentExampleSchema),
  exercises: z.array(ContentExerciseSchema).min(1),
});

export const LessonContentMetadataSchema = z.object({
  total_words: z.number().int().positive(),
  total_tokens: z.number().int().positive(),
  cost_usd: z.number().nonnegative(),
  quality_score: z.number().min(0).max(1),
  rag_chunks_used: z.number().int().nonnegative(),
  generation_duration_ms: z.number().int().positive(),
  model_used: z.string(),
  archetype_used: ContentArchetypeSchema,
  temperature_used: z.number().min(0).max(1),
});

export const LessonContentSchema = z.object({
  lesson_id: z.string(),
  course_id: z.string().uuid(),
  content: LessonContentBodySchema,
  metadata: LessonContentMetadataSchema,
  status: LessonStatusSchema,
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

// ============================================================================
// Stage 6 Job Management
// ============================================================================

/**
 * Start Stage 6 generation for a course
 */
export const StartStage6InputSchema = z.object({
  course_id: z.string().uuid(),
  lesson_ids: z.array(z.string()).optional(), // If empty, all lessons
});

export const StartStage6OutputSchema = z.object({
  course_id: z.string().uuid(),
  jobs_created: z.number().int().nonnegative(),
  lesson_ids: z.array(z.string()),
});

/**
 * Get Stage 6 progress
 */
export const GetStage6ProgressInputSchema = z.object({
  course_id: z.string().uuid(),
});

export const Stage6ProgressSchema = z.object({
  course_id: z.string().uuid(),
  total_lessons: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  generating: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  review_required: z.number().int().nonnegative(),
  progress_percent: z.number().min(0).max(100),
  estimated_completion_seconds: z.number().int().nonnegative().nullable(),
});

/**
 * Retry failed lesson
 */
export const RetryLessonInputSchema = z.object({
  course_id: z.string().uuid(),
  lesson_id: z.string(),
  force_model: z.string().optional(), // Override model selection
});

export const RetryLessonOutputSchema = z.object({
  job_id: z.string(),
  lesson_id: z.string(),
  retry_count: z.number().int(),
});

/**
 * Get lesson content
 */
export const GetLessonContentInputSchema = z.object({
  course_id: z.string().uuid(),
  lesson_id: z.string(),
});

// ============================================================================
// Concurrency Control
// ============================================================================

/**
 * Check if generation is in progress
 */
export const CheckGenerationLockInputSchema = z.object({
  course_id: z.string().uuid(),
});

export const GenerationLockStatusSchema = z.object({
  course_id: z.string().uuid(),
  is_locked: z.boolean(),
  locked_by_stage: z.enum(['stage4', 'stage5', 'stage6']).nullable(),
  locked_at: z.coerce.date().nullable(),
  message: z.string().optional(),
});

// ============================================================================
// Type Exports
// ============================================================================

// ============================================================================
// INSUFFICIENT_CONTEXT Refusal (Stage 6)
// ============================================================================

export const RefusalResultSchema = z.object({
  status: z.literal('INSUFFICIENT_CONTEXT'),
  missing_topics: z.array(z.string()),
  suggested_queries: z.array(z.string()),
  partial_content: z.string().optional(),
});

// ============================================================================
// V1 → V2 Migration Utilities
// ============================================================================

/**
 * V1 LessonSpecification (deprecated, for backward compatibility)
 */
export const LessonSpecificationV1Schema = z.object({
  lesson_id: z.string(),
  title: z.string(),
  learning_objectives: z.array(z.object({
    verb: z.string(),
    content: z.string(),
    bloom_level: z.string(),
  })),
  content_structure: z.object({
    intro: z.object({
      hook: z.string(),  // V1: exact text
      context: z.string(),
    }),
    main_sections: z.array(z.object({
      section: z.string(),
      rag_query: z.string(),  // V1: query string
      expected_content_type: z.string(),
      word_count: z.number(),  // V1: exact number
    })),
    examples: z.array(z.object({
      type: z.string(),
      topic: z.string(),
      rag_query: z.string(),
      format: z.string(),
    })),
    exercises: z.array(z.object({
      type: z.string(),
      difficulty: z.string(),
      specification: z.string(),
      rag_query: z.string(),
      grading_rubric: z.string().optional(),  // V1: string
    })),
  }),
  rag_context: z.object({
    primary_documents: z.array(z.string()),
    search_queries: z.array(z.string()),
    expected_chunks: z.number(),
  }),
  estimated_duration_minutes: z.number(),
});

/**
 * Transform V1 → V2 LessonSpecification
 * Used for backward compatibility with existing courses
 */
export const V1toV2TransformConfigSchema = z.object({
  default_target_audience: z.enum(['executive', 'practitioner', 'novice']).default('practitioner'),
  default_tone: z.enum(['formal', 'conversational-professional']).default('conversational-professional'),
  default_compliance_level: z.enum(['strict', 'standard']).default('standard'),
});

// ============================================================================
// Prompt Architecture (Stage 6)
// ============================================================================

export const Stage6PromptStructureSchema = z.object({
  system_role: z.string(),
  critical_instructions: z.object({
    grounding: z.literal('Use ONLY <rag_context>. No hallucinations.'),
    tone: z.string(),
    format: z.literal('Markdown (## sections, ### subsections)'),
    refusal: z.literal('If RAG insufficient, output "INSUFFICIENT_CONTEXT"'),
  }),
  lesson_blueprint: LessonSpecificationV2Schema,
  rag_context: z.array(z.object({
    chunk_id: z.string(),
    content: z.string(),
    document_name: z.string(),
    relevance_score: z.number(),
  })),
  generation_steps: z.array(z.string()),
  output_format: z.literal('Markdown only. No JSON wrapper.'),
});

// ============================================================================
// Type Exports
// ============================================================================

export type DocumentPriority = z.infer<typeof DocumentPrioritySchema>;
export type BudgetAllocation = z.infer<typeof BudgetAllocationSchema>;
export type SectionRAGPlan = z.infer<typeof SectionRAGPlanSchema>;
export type DocumentRelevanceMapping = z.infer<typeof DocumentRelevanceMappingSchema>;
export type GenerationGuidance = z.infer<typeof GenerationGuidanceSchema>;
export type AnalysisResultEnhanced = z.infer<typeof AnalysisResultEnhancedSchema>;
export type LessonSpecificationV2 = z.infer<typeof LessonSpecificationV2Schema>;
export type LessonSpecificationV1 = z.infer<typeof LessonSpecificationV1Schema>;
export type LessonContent = z.infer<typeof LessonContentSchema>;
export type Stage6Progress = z.infer<typeof Stage6ProgressSchema>;
export type GenerationLockStatus = z.infer<typeof GenerationLockStatusSchema>;
export type RefusalResult = z.infer<typeof RefusalResultSchema>;
export type Stage6PromptStructure = z.infer<typeof Stage6PromptStructureSchema>;
