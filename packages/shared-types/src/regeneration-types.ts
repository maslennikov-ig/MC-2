import { z } from 'zod';

// ============================================================================
// Context Tiers for Smart Routing
// ============================================================================

export const contextTierSchema = z.enum(['atomic', 'local', 'structural', 'global']);
export type ContextTier = z.infer<typeof contextTierSchema>;

export const TIER_TOKEN_BUDGETS: Record<ContextTier, { target: number; context: number; total: number }> = {
  atomic: { target: 200, context: 100, total: 300 },
  local: { target: 500, context: 500, total: 1000 },
  structural: { target: 1000, context: 1500, total: 2500 },
  global: { target: 2000, context: 3000, total: 5000 },
};

// ============================================================================
// Regeneration Request/Response
// ============================================================================

export const regenerateBlockInputSchema = z.object({
  courseId: z.string().uuid(),
  stageId: z.enum(['stage_4', 'stage_5']),
  blockPath: z.string(), // e.g., "topic_analysis.key_concepts"
  userInstruction: z.string().min(1).max(500),
});
export type RegenerateBlockInput = z.infer<typeof regenerateBlockInputSchema>;

export const regenerationResponseSchema = z.object({
  regenerated_content: z.unknown(), // Type depends on blockPath
  pedagogical_change_log: z.string(),
  alignment_score: z.number().int().min(1).max(5),
  bloom_level_preserved: z.boolean(),
  concepts_added: z.array(z.string()),
  concepts_removed: z.array(z.string()),
});
export type RegenerationResponse = z.infer<typeof regenerationResponseSchema>;

// ============================================================================
// Semantic Diff
// ============================================================================

export interface SemanticDiff {
  changeType: 'simplified' | 'expanded' | 'restructured' | 'refined';
  conceptsAdded: string[];
  conceptsRemoved: string[];
  alignmentScore: 1 | 2 | 3 | 4 | 5;
  bloomLevelPreserved: boolean;
  changeDescription: string; // Human-readable summary
}

// ============================================================================
// Update Field Request
// ============================================================================

/**
 * Whitelist of allowed field paths for Stage 4 (analysis_result) editing.
 * Only these paths can be modified via updateField endpoint.
 */
export const STAGE4_EDITABLE_FIELDS = [
  'course_category.primary',
  'contextual_language.why_matters_context',
  'contextual_language.motivators',
  'topic_analysis.determined_topic',
  'topic_analysis.key_concepts',
  'recommended_structure.total_lessons',
  'recommended_structure.total_sections',
  'pedagogical_strategy.teaching_style',
  'pedagogical_patterns.assessment_types',
  'generation_guidance.use_analogies',
  'generation_guidance.specific_analogies',
] as const;

/**
 * Whitelist of allowed field paths for Stage 5 (course_structure) editing.
 *
 * Uses wildcard pattern [*] for array indices. When validating, replace actual
 * indices like [0], [1] with [*] to match against this whitelist.
 *
 * Course metadata fields:
 * - course_title, course_description, course_overview, target_audience
 *
 * Section-level fields (use sections[*] pattern):
 * - section_title, section_description, learning_objectives (array)
 *
 * Lesson-level fields (use sections[*].lessons[*] pattern):
 * - lesson_title, lesson_objectives (array), key_topics (array)
 * - estimated_duration_minutes (triggers duration recalculation)
 */
export const STAGE5_EDITABLE_FIELDS: readonly string[] = [
  // Course metadata
  'course_title',
  'course_description',
  'course_overview',
  'target_audience',

  // Section-level fields
  'sections[*].section_title',
  'sections[*].section_description',
  'sections[*].learning_objectives',

  // Lesson-level fields
  'sections[*].lessons[*].lesson_title',
  'sections[*].lessons[*].lesson_objectives',
  'sections[*].lessons[*].key_topics',
  'sections[*].lessons[*].estimated_duration_minutes',
] as const;

export const updateFieldInputSchema = z.object({
  courseId: z.string().uuid(),
  stageId: z.enum(['stage_4', 'stage_5']),
  fieldPath: z.string(), // e.g., "topic_analysis.key_concepts[0]"
  value: z.unknown(),
});
export type UpdateFieldInput = z.infer<typeof updateFieldInputSchema>;

export interface UpdateFieldResponse {
  success: boolean;
  fieldPath: string;
  updatedAt: string; // ISO timestamp
  recalculated?: {
    /** Recalculated section duration (minutes) - only for Stage 5 duration updates */
    sectionDuration?: number;
    /** Recalculated course duration (hours) - only for Stage 5 duration updates */
    courseDuration?: number;
    /** Recalculated lesson numbers - only for Stage 5 add/delete/reorder operations */
    lessonNumbers?: Record<string, number>;
  };
}

// ============================================================================
// Delete Element Request/Response
// ============================================================================

/**
 * Input schema for deleting a lesson or section from Stage 5 course structure.
 *
 * Two-phase deletion flow:
 * 1. First call with confirm=false returns confirmation data
 * 2. Second call with confirm=true performs actual deletion
 */
export const deleteElementInputSchema = z.object({
  /** Course ID */
  courseId: z.string().uuid(),

  /** Path to element (e.g., "sections[0].lessons[2]" or "sections[1]") */
  elementPath: z.string().min(1, 'Element path is required'),

  /** If false, return confirmation data only. If true, perform deletion. */
  confirm: z.boolean().default(false),
});

export type DeleteElementInput = z.infer<typeof deleteElementInputSchema>;

/**
 * Confirmation data returned when confirm=false
 */
export interface DeleteElementConfirmation {
  elementType: 'lesson' | 'section';
  title: string;
  lessonCount?: number; // Only for sections
  impactSummary: string;
}

/**
 * Response schema for deleteElement endpoint
 */
export interface DeleteElementResponse {
  /** Confirmation data (when confirm=false) */
  requiresConfirmation?: DeleteElementConfirmation;

  /** Success flag (when confirm=true) */
  success?: boolean;

  /** Update timestamp (when confirm=true) */
  updatedAt?: string;

  /** Recalculated values after deletion (when confirm=true) */
  recalculated?: {
    sectionDuration?: number;
    courseDuration?: number;
    lessonNumbers?: Record<string, number>;
  };
}

// ============================================================================
// Add Element Request/Response
// ============================================================================

/**
 * Input schema for adding a lesson or section to Stage 5 course structure.
 *
 * Uses AI to generate element content based on:
 * - User instruction for what to create
 * - Existing course context (title, audience, difficulty)
 * - Adjacent elements for contextual consistency
 */
export const addElementInputSchema = z.object({
  /** Course ID */
  courseId: z.string().uuid(),

  /** Type of element to add */
  elementType: z.enum(['lesson', 'section']),

  /** Path to parent container (e.g., "sections[0].lessons" for lesson, "sections" for section) */
  parentPath: z.string().min(1, 'Parent path is required'),

  /** Position to insert: start, end, or numeric index */
  position: z.union([
    z.enum(['start', 'end']),
    z.number().int().min(0)
  ]),

  /** AI instruction for content generation (10-1000 chars) */
  userInstruction: z.string().min(10, 'Instruction too short (min 10 chars)').max(1000, 'Instruction too long (max 1000 chars)'),
});

export type AddElementInput = z.infer<typeof addElementInputSchema>;

/**
 * Response schema for addElement endpoint
 */
export interface AddElementResponse {
  success: boolean;
  elementPath: string;
  updatedAt: string;
  generatedElement: unknown; // Lesson or Section JSON
  recalculated?: {
    sectionDuration?: number;
    courseDuration?: number;
    lessonNumbers?: Record<string, number>;
  };
}
