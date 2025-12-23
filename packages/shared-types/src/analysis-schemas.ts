/**
 * Zod schemas for Stage 4 Analysis validation
 * @module analysis-schemas
 *
 * Provides runtime validation for all analysis phase outputs using Zod.
 * Ensures type safety and data integrity across multi-phase LLM orchestration.
 */

import { z } from 'zod';

/**
 * Known visual types for generation guidance.
 * LLM may generate unknown values - they will be filtered with a warning.
 */
export const KNOWN_VISUAL_TYPES = ['diagrams', 'flowcharts', 'code examples', 'screenshots', 'animations', 'plots', 'tables'] as const;
export type VisualType = (typeof KNOWN_VISUAL_TYPES)[number];

/**
 * Known exercise types for generation guidance.
 * LLM may generate unknown values - they will be filtered with a warning.
 *
 * Categories:
 * - Technical: coding, debugging, refactoring, derivation, problem-solving
 * - Analytical: analysis, interpretation, case-study
 * - Interactive: role-play, simulation, scenarios, discussion
 * - Assessment: quiz, practice, reflection, writing, presentation
 * - Visual/Structured: tables, diagrams, flowcharts
 * - Standard formats: fill-in-the-blank, matching, multiple-choice, true-false, short-answer, essay
 */
export const KNOWN_EXERCISE_TYPES = [
  // Technical (for programming/engineering courses)
  'coding', 'derivation', 'debugging', 'refactoring',
  // Analytical (universal)
  'analysis', 'interpretation', 'case-study', 'problem-solving',
  // Interactive (for business/soft-skills courses)
  'role-play', 'simulation', 'scenarios', 'discussion',
  // Assessment (universal)
  'quiz', 'practice', 'reflection', 'writing', 'presentation',
  // Visual/Structured (commonly returned by LLMs)
  'tables', 'diagrams', 'flowcharts',
  // Standard exercise formats
  'fill-in-the-blank', 'matching', 'multiple-choice', 'true-false',
  'short-answer', 'essay',
] as const;
export type ExerciseType = (typeof KNOWN_EXERCISE_TYPES)[number];

/**
 * Helper to create a soft-validating array schema that filters unknown values with warning.
 * Used for LLM-generated enum arrays where unknown values shouldn't crash the pipeline.
 */
function createSoftEnumArraySchema<T extends string>(
  knownValues: readonly T[],
  fieldName: string
): z.ZodEffects<z.ZodArray<z.ZodString>, T[], string[]> {
  return z.array(z.string()).transform((arr) => {
    const known: T[] = [];
    const unknown: string[] = [];

    for (const value of arr) {
      if (knownValues.includes(value as T)) {
        known.push(value as T);
      } else {
        unknown.push(value);
      }
    }

    if (unknown.length > 0) {
      console.warn(
        `[GenerationGuidance] Unknown ${fieldName} values filtered: ${unknown.join(', ')}. ` +
        `Known values: ${knownValues.join(', ')}`
      );
    }

    return known;
  });
}

/**
 * Section breakdown schema (Phase 2)
 * Architectural principle: .min() is critical (blocks), .max() is recommendation (non-blocking)
 */
export const SectionBreakdownSchema = z.object({
  area: z.string().min(1), // Removed .max(200) - allow detailed section names
  estimated_lessons: z.number().int().min(1, 'Section must have at least 1 lesson'),
  importance: z.enum(['core', 'important', 'optional']),
  learning_objectives: z
    .array(z.string().min(1))
    .min(2, 'Must have at least 2 learning objectives'), // Removed .max(5) - encourage comprehensive objectives
  key_topics: z
    .array(z.string().min(1))
    .min(3, 'Must have at least 3 key topics'), // Removed .max(8) - allow extensive topic coverage
  pedagogical_approach: z
    .string()
    .min(20, 'Pedagogical approach must be at least 20 characters'), // Removed .max(200) - encourage detailed approaches
  difficulty_progression: z.enum(['flat', 'gradual', 'steep']),

  // NEW: Analyze Enhancement fields (optional for backward compatibility)
  section_id: z.string().optional(), // Unique identifier (e.g., "1", "2", "3")
  estimated_duration_hours: z.number().min(0.5).max(20).optional(), // Time to complete section
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(), // Difficulty level
  prerequisites: z.array(z.string()).optional(), // section_ids that must be completed first
});

/**
 * Extended SectionBreakdownSchema with key_topics/learning_objectives alignment validation.
 *
 * This ensures that each key_topic has some semantic relationship to at least one
 * learning_objective, preventing Stage 6 regeneration loops caused by mismatch.
 *
 * Validation strategy (soft check - warning, not blocking):
 * - Extract significant words (4+ chars) from learning_objectives
 * - Check if at least 40% of key_topics share a word with objectives
 * - This is a heuristic check; LLM may use synonyms or related concepts
 */
export const SectionBreakdownSchemaWithAlignment = SectionBreakdownSchema.refine(
  (data) => {
    const keyTopics = data.key_topics || [];
    const objectives = data.learning_objectives || [];

    if (keyTopics.length === 0 || objectives.length === 0) {
      return true; // Skip validation if either is empty
    }

    // Common words to exclude (English and Russian verbs/connectors)
    const commonWords = new Set([
      'that', 'this', 'with', 'from', 'have', 'will', 'able', 'about', 'which', 'their',
      'использовать', 'применять', 'понимать', 'уметь', 'знать', 'научиться', 'освоить',
      'применение', 'понимание', 'умение', 'знание',
    ]);

    // Extract keywords from objectives (4+ char words, not common)
    const objectiveKeywords = new Set<string>();
    for (const obj of objectives) {
      // Match both Latin and Cyrillic words
      const words = obj.toLowerCase().match(/[a-zа-яё]{4,}/gi) || [];
      for (const word of words) {
        if (!commonWords.has(word.toLowerCase())) {
          objectiveKeywords.add(word.toLowerCase());
        }
      }
    }

    // Check how many key_topics have keyword overlap
    let matchedTopics = 0;
    for (const topic of keyTopics) {
      const topicWords = topic.toLowerCase().match(/[a-zа-яё]{4,}/gi) || [];
      const hasOverlap = topicWords.some(word =>
        objectiveKeywords.has(word.toLowerCase())
      );
      if (hasOverlap) {
        matchedTopics++;
      }
    }

    // Require at least 40% overlap (soft threshold)
    const coverage = matchedTopics / keyTopics.length;
    return coverage >= 0.4;
  },
  {
    message:
      'key_topics must have semantic alignment with learning_objectives. ' +
      'At least 40% of key_topics should share keywords with objectives. ' +
      'Misalignment causes Stage 6 content generation failures.',
    path: ['key_topics'],
  }
);

// Export the aligned schema as default for new code
export { SectionBreakdownSchemaWithAlignment as SectionBreakdownSchemaAligned };

/**
 * Phase 2 output schema: Scope and structure recommendations
 */
export const Phase2OutputSchema = z.object({
  recommended_structure: z.object({
    estimated_content_hours: z
      .number()
      .min(0.5, 'Minimum content hours: 0.5'), // Removed .max(200) - let LLM decide scope
    scope_reasoning: z
      .string()
      .min(100, 'Scope reasoning must be at least 100 characters'), // Removed .max(500) - encourage detailed reasoning
    lesson_duration_minutes: z
      .number()
      .int()
      .min(3, 'Minimum lesson duration: 3 minutes')
      .max(45, 'Maximum lesson duration: 45 minutes'), // Keep .max(45) - pedagogical constraint per FR-014
    calculation_explanation: z
      .string()
      .min(50, 'Calculation explanation must be at least 50 characters'), // Removed .max(300) - allow thorough explanations
    total_lessons: z
      .number()
      .int()
      .min(10, 'Minimum 10 lessons required (FR-015)'), // Removed .max(100) - let LLM decide optimal count
    total_sections: z.number().int().min(1, 'Minimum 1 section'), // Removed .max(30) - let LLM decide structure
    scope_warning: z.string().nullable(),
    sections_breakdown: z.array(SectionBreakdownSchema).min(1, 'Must have at least 1 section'),
  }),
  phase_metadata: z.object({
    duration_ms: z.number().int().nonnegative(),
    model_used: z.string().min(1),
    tokens: z.object({
      input: z.number().int().nonnegative(),
      output: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
    quality_score: z.number().min(0).max(1),
    retry_count: z.number().int().nonnegative(),
    repair_metadata: z
      .object({
        layer_used: z.enum([
          'none',
          'layer1_repair',
          'layer2_revise',
          'layer3_partial',
          'layer4_120b',
          'layer5_emergency',
        ]),
        repair_attempts: z.number().int().nonnegative(),
        successful_fields: z.array(z.string()).optional(),
        regenerated_fields: z.array(z.string()).optional(),
        models_tried: z.array(z.string()),
      })
      .optional(),
  }),
});

/**
 * Phase 2 input schema: Course classification from Phase 1 + user input
 */
export const Phase2InputSchema = z.object({
  course_id: z.string().uuid('Invalid course ID'),
  language: z.string().min(2).max(10, 'Language code must be 2-10 characters'),
  topic: z.string().min(1, 'Topic is required').max(5000, 'Topic too long'),
  answers: z.string().nullable().optional(),
  document_summaries: z.array(z.string()).nullable().optional(),
  phase1_output: z.object({
    course_category: z.object({
      primary: z.enum(['professional', 'personal', 'creative', 'hobby', 'spiritual', 'academic']),
      confidence: z.number().min(0).max(1),
      reasoning: z.string().min(1),
      secondary: z
        .enum(['professional', 'personal', 'creative', 'hobby', 'spiritual', 'academic'])
        .nullable()
        .optional(),
    }),
    contextual_language: z.object({
      why_matters_context: z.string().min(50), // Removed .max(300) - allow rich context
      motivators: z.string().min(100), // Removed .max(600) - encourage comprehensive motivators
      experience_prompt: z.string().min(100), // Removed .max(600) - allow detailed prompts
      problem_statement_context: z.string().min(50), // Removed .max(300) - encourage thorough problem statements
      knowledge_bridge: z.string().min(100), // Removed .max(600) - allow comprehensive bridging
      practical_benefit_focus: z.string().min(100), // Removed .max(600) - encourage detailed benefits
    }),
    topic_analysis: z.object({
      determined_topic: z.string().min(3), // Removed .max(200) - allow detailed topic descriptions
      information_completeness: z.number().min(0).max(100), // Keep .max(100) - technical constraint (percentage)
      complexity: z.enum(['narrow', 'medium', 'broad']),
      reasoning: z.string().min(50),
      target_audience: z.enum(['beginner', 'intermediate', 'advanced', 'mixed']),
      missing_elements: z.array(z.string()).nullable(),
      key_concepts: z.array(z.string()).min(3), // Removed .max(10) - encourage comprehensive concept lists
      domain_keywords: z.array(z.string()).min(5), // Removed .max(15) - allow extensive keyword coverage
    }),
    phase_metadata: z.object({
      duration_ms: z.number().int().nonnegative(),
      model_used: z.string().min(1),
      tokens: z.object({
        input: z.number().int().nonnegative(),
        output: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
      }),
      quality_score: z.number().min(0).max(1),
      retry_count: z.number().int().nonnegative(),
    }),
  }),
});

/**
 * NEW: Pedagogical patterns schema (Analyze Enhancement)
 */
export const PedagogicalPatternsSchema = z.object({
  primary_strategy: z.enum(['problem-based learning', 'lecture-based', 'inquiry-based', 'project-based', 'mixed']),
  theory_practice_ratio: z.string().regex(/^\d+:\d+$/, 'Must be format "XX:YY" (e.g., "30:70")'),
  assessment_types: z.array(z.enum(['coding', 'quizzes', 'projects', 'essays', 'presentations', 'peer-review'])),
  key_patterns: z.array(z.string()), // e.g., ["build incrementally", "learn by refactoring"]
});

/**
 * Phase 1 output schema: Course classification and contextual language
 * Used to validate Phase 1 output before returning (enables retry-with-escalation)
 */
export const Phase1OutputSchema = z.object({
  course_category: z.object({
    primary: z.enum(['professional', 'personal', 'creative', 'hobby', 'spiritual', 'academic']),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().min(1),
    secondary: z
      .enum(['professional', 'personal', 'creative', 'hobby', 'spiritual', 'academic'])
      .nullable()
      .optional(),
  }),
  contextual_language: z.object({
    why_matters_context: z.string().min(50), // Removed .max(300) - allow rich context
    motivators: z.string().min(100), // Removed .max(600) - encourage comprehensive motivators
    experience_prompt: z.string().min(100), // Removed .max(600) - allow detailed prompts
    problem_statement_context: z.string().min(50), // Removed .max(300) - encourage thorough problem statements
    knowledge_bridge: z.string().min(100), // Removed .max(600) - allow comprehensive bridging
    practical_benefit_focus: z.string().min(100), // Removed .max(600) - encourage detailed benefits
  }),
  topic_analysis: z.object({
    determined_topic: z.string().min(3), // Removed .max(200) - allow detailed topic descriptions
    information_completeness: z.number().min(0).max(100), // Keep .max(100) - technical constraint (percentage)
    complexity: z.enum(['narrow', 'medium', 'broad']),
    reasoning: z.string().min(50),
    target_audience: z.enum(['beginner', 'intermediate', 'advanced', 'mixed']),
    missing_elements: z.array(z.string()).nullable(),
    key_concepts: z.array(z.string()).min(3), // Removed .max(10) - encourage comprehensive concept lists
    domain_keywords: z.array(z.string()).min(5), // Removed .max(15) - allow extensive keyword coverage
  }),
  pedagogical_patterns: PedagogicalPatternsSchema,
  phase_metadata: z.object({
    duration_ms: z.number().int().nonnegative(),
    model_used: z.string().min(1),
    tokens: z.object({
      input: z.number().int().nonnegative(),
      output: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
    quality_score: z.number().min(0).max(1),
    retry_count: z.number().int().nonnegative(),
  }),
});

/**
 * NEW: Generation guidance schema (Analyze Enhancement, replaces scope_instructions)
 *
 * Uses soft validation for include_visuals and exercise_types:
 * - Unknown values are filtered out with a warning (not crash)
 * - Allows LLM flexibility while maintaining type safety
 */
export const GenerationGuidanceSchema = z.object({
  tone: z.enum(['conversational but precise', 'formal academic', 'casual friendly', 'technical professional']),
  use_analogies: z.boolean(),
  specific_analogies: z.array(z.string()).optional(),
  avoid_jargon: z.array(z.string()),
  include_visuals: createSoftEnumArraySchema(KNOWN_VISUAL_TYPES, 'include_visuals'),
  exercise_types: createSoftEnumArraySchema(KNOWN_EXERCISE_TYPES, 'exercise_types'),
  contextual_language_hints: z.string(),
  real_world_examples: z.array(z.string()).optional(),
});

/**
 * Research flag schema (Phase 3)
 * Architectural principle: .min() is critical (blocks), .max() is recommendation (non-blocking)
 */
export const ResearchFlagSchema = z.object({
  topic: z.string().min(3), // Removed .max(100) - let LLM provide detailed topic names
  reason: z.string().min(3), // Removed .max(50) - encourage comprehensive reasoning
  context: z.string().min(50), // Removed .max(200) - allow detailed context
});

/**
 * Expansion area schema (Phase 3)
 */
export const ExpansionAreaSchema = z.object({
  area: z.string().min(3), // Removed .max(100) - allow detailed area descriptions
  priority: z.enum(['critical', 'important', 'nice-to-have']),
  specific_requirements: z.array(z.string()).min(1), // Removed .max(5) - encourage comprehensive requirements
  estimated_lessons: z.number().int().min(1), // Removed .max(10) - let LLM decide optimal count
});

/**
 * Phase 3 output schema: Expert pedagogical analysis
 */
export const Phase3OutputSchema = z.object({
  pedagogical_strategy: z.object({
    teaching_style: z.enum(['hands-on', 'theory-first', 'project-based', 'mixed']),
    assessment_approach: z.string().min(50), // Removed .max(300) - encourage comprehensive approaches
    practical_focus: z.enum(['high', 'medium', 'low']),
    progression_logic: z.string().min(100), // Removed .max(500) - allow detailed logic
    interactivity_level: z.enum(['high', 'medium', 'low']),
  }),
  expansion_areas: z.array(ExpansionAreaSchema).nullable(),
  research_flags: z.array(ResearchFlagSchema),
  phase_metadata: z.object({
    duration_ms: z.number().int().min(0),
    model_used: z.string(),
    tokens: z.object({
      input: z.number().int().min(0),
      output: z.number().int().min(0),
      total: z.number().int().min(0),
    }),
    quality_score: z.number().min(0).max(1),
    retry_count: z.number().int().min(0),
  }),
});

/**
 * Phase 4 output schema: Document synthesis and generation instructions
 */
export const Phase4OutputSchema = z.object({
  generation_guidance: GenerationGuidanceSchema.extend({
    specific_analogies: z.array(z.string()), // REQUIRED in Phase 4 output
    real_world_examples: z.array(z.string()), // REQUIRED in Phase 4 output
  }),
  content_strategy: z.enum(['create_from_scratch', 'expand_and_enhance', 'optimize_existing']),
  phase_metadata: z.object({
    duration_ms: z.number().int().min(0),
    model_used: z.string(),
    tokens: z.object({
      input: z.number().int().min(0),
      output: z.number().int().min(0),
      total: z.number().int().min(0),
    }),
    quality_score: z.number().min(0).max(1),
    retry_count: z.number().int().min(0),
    document_count: z.number().int().min(0),
  }),
});

/**
 * NEW: Section RAG Plan schema (per section mapping)
 *
 * Confidence Rules (from data-model.md):
 * - 'high': All primary_documents have processing_mode='full_text'
 * - 'medium': Any primary_document has processing_mode='summary'
 */
export const SectionRAGPlanSchema = z.object({
  primary_documents: z.array(z.string()), // file_catalog IDs ranked by relevance
  search_queries: z.array(z.string()), // Queries for RAG retrieval
  expected_topics: z.array(z.string()), // Topics to find in chunks
  confidence: z.enum(['high', 'medium']), // Based on processing_mode
  note: z.string().optional(), // Guidance for Generation
  // Legacy field for backward compatibility (deprecated, use search_queries)
  key_search_terms: z.array(z.string()).optional(),
  // Legacy field for backward compatibility (deprecated)
  document_processing_methods: z.record(
    z.string(), // document_id
    z.enum(['full_text', 'hierarchical'])
  ).optional(),
});

/**
 * NEW: Document relevance mapping schema (RAG Planning, CRITICAL for T022)
 */
export const DocumentRelevanceMappingSchema = z.record(
  z.string(), // section_id
  SectionRAGPlanSchema
);

/**
 * Main Analysis Result Schema - validates entire courses.analysis_result JSONB
 * This is the complete schema for Stage 4 output stored in database
 */
export const AnalysisResultSchema = z.object({
  course_category: z.object({
    primary: z.enum(['professional', 'personal', 'creative', 'hobby', 'spiritual', 'academic']),
    confidence: z.number().min(0).max(1), // Keep .max(1) - technical constraint (probability)
    reasoning: z.string().min(50), // Removed .max(200) - encourage detailed reasoning
    secondary: z.enum(['professional', 'personal', 'creative', 'hobby', 'spiritual', 'academic']).optional().nullable(),
  }),

  contextual_language: z.object({
    why_matters_context: z.string().min(50), // Removed .max(300) - allow rich context
    motivators: z.string().min(100), // Removed .max(600) - encourage comprehensive motivators
    experience_prompt: z.string().min(100), // Removed .max(600) - allow detailed prompts
    problem_statement_context: z.string().min(50), // Removed .max(300) - encourage thorough problem statements
    knowledge_bridge: z.string().min(100), // Removed .max(600) - allow comprehensive bridging
    practical_benefit_focus: z.string().min(100), // Removed .max(600) - encourage detailed benefits
  }),

  topic_analysis: z.object({
    determined_topic: z.string().min(3), // Removed .max(200) - allow detailed topic descriptions
    information_completeness: z.number().min(0).max(100), // Keep .max(100) - technical constraint (percentage)
    complexity: z.enum(['narrow', 'medium', 'broad']),
    reasoning: z.string().min(50),
    target_audience: z.enum(['beginner', 'intermediate', 'advanced', 'mixed']),
    missing_elements: z.array(z.string()).nullable(),
    key_concepts: z.array(z.string()).min(3), // Removed .max(10) - encourage comprehensive concept lists
    domain_keywords: z.array(z.string()).min(5), // Removed .max(15) - allow extensive keyword coverage
  }),

  recommended_structure: z.object({
    estimated_content_hours: z.number().min(0.5), // Removed .max(200) - let LLM decide scope
    scope_reasoning: z.string().min(100), // Removed .max(500) - encourage detailed reasoning
    lesson_duration_minutes: z.number().int().min(3).max(45), // Keep .max(45) - pedagogical constraint per FR-014
    calculation_explanation: z.string().min(20), // Removed .max(300) - allow thorough explanations
    total_lessons: z.number().int().min(10), // Removed .max(100) - let LLM decide optimal count per FR-015
    total_sections: z.number().int().min(1), // Removed .max(30) - let LLM decide structure
    scope_warning: z.string().nullable(),
    sections_breakdown: z.array(SectionBreakdownSchema),
  }),

  pedagogical_strategy: z.object({
    teaching_style: z.enum(['hands-on', 'theory-first', 'project-based', 'mixed']),
    assessment_approach: z.string().min(50), // Removed .max(300) - encourage comprehensive approaches
    practical_focus: z.enum(['high', 'medium', 'low']),
    progression_logic: z.string().min(100), // Removed .max(500) - allow detailed logic
    interactivity_level: z.enum(['high', 'medium', 'low']),
  }),

  content_strategy: z.enum(['create_from_scratch', 'expand_and_enhance', 'optimize_existing']),
  expansion_areas: z.array(ExpansionAreaSchema).nullable(),
  research_flags: z.array(ResearchFlagSchema),

  // REQUIRED enhancement fields from Analyze Enhancement (production Best Practice)
  pedagogical_patterns: PedagogicalPatternsSchema,

  generation_guidance: GenerationGuidanceSchema.extend({
    specific_analogies: z.array(z.string()), // REQUIRED
    real_world_examples: z.array(z.string()), // REQUIRED
  }),

  document_relevance_mapping: DocumentRelevanceMappingSchema.default({}),

  metadata: z.object({
    analysis_version: z.string(),
    total_duration_ms: z.number().int().min(0),
    phase_durations_ms: z.record(z.number().int()),
    model_usage: z.record(z.string()),
    total_tokens: z.object({
      input: z.number().int().min(0),
      output: z.number().int().min(0),
      total: z.number().int().min(0),
    }),
    total_cost_usd: z.number().min(0),
    retry_count: z.number().int().min(0),
    quality_scores: z.record(z.number().min(0).max(1)),
    created_at: z.string().datetime(),
  }),
});

/**
 * Type exports for TypeScript inference
 */
export type SectionBreakdown = z.infer<typeof SectionBreakdownSchema>;
export type SectionBreakdownAligned = z.infer<typeof SectionBreakdownSchemaWithAlignment>;
export type Phase1Output = z.infer<typeof Phase1OutputSchema>;
export type Phase2Output = z.infer<typeof Phase2OutputSchema>;
export type Phase2Input = z.infer<typeof Phase2InputSchema>;
export type Phase3Output = z.infer<typeof Phase3OutputSchema>;
export type Phase4Output = z.infer<typeof Phase4OutputSchema>;
export type PedagogicalPatterns = z.infer<typeof PedagogicalPatternsSchema>;
export type GenerationGuidance = z.infer<typeof GenerationGuidanceSchema>;
export type SectionRAGPlan = z.infer<typeof SectionRAGPlanSchema>;
export type DocumentRelevanceMapping = z.infer<typeof DocumentRelevanceMappingSchema>;
export type ResearchFlag = z.infer<typeof ResearchFlagSchema>;
export type ExpansionArea = z.infer<typeof ExpansionAreaSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

/**
 * Input type aliases (for backward compatibility)
 */
export type ResearchFlagInput = z.infer<typeof ResearchFlagSchema>;
export type ExpansionAreaInput = z.infer<typeof ExpansionAreaSchema>;
export type SectionBreakdownInput = z.infer<typeof SectionBreakdownSchema>;
export type AnalysisResultInput = z.infer<typeof AnalysisResultSchema>;
export type Phase1OutputInput = z.infer<typeof Phase1OutputSchema>;
export type Phase2OutputInput = z.infer<typeof Phase2OutputSchema>;
export type Phase3OutputInput = z.infer<typeof Phase3OutputSchema>;
export type Phase4OutputInput = z.infer<typeof Phase4OutputSchema>;
