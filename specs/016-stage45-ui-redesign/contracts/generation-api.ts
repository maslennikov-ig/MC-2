/**
 * API Contracts: Stage 4-5 UI Redesign
 *
 * New tRPC endpoints for the generation router
 * Location: packages/course-gen-platform/src/server/routers/generation.ts
 */

import { z } from 'zod';

// ============================================================================
// Input Schemas
// ============================================================================

/**
 * Update a single field in Stage 4/5 result
 */
export const updateFieldInputSchema = z.object({
  courseId: z.string().uuid(),
  stageId: z.enum(['stage_4', 'stage_5']),
  fieldPath: z.string().min(1).max(200), // e.g., "topic_analysis.key_concepts"
  value: z.unknown(),
});

/**
 * Regenerate a specific block using AI
 */
export const regenerateBlockInputSchema = z.object({
  courseId: z.string().uuid(),
  stageId: z.enum(['stage_4', 'stage_5']),
  blockPath: z.string().min(1).max(200),
  userInstruction: z.string().min(1).max(500),
});

/**
 * Get dependencies for a block
 */
export const getBlockDependenciesInputSchema = z.object({
  courseId: z.string().uuid(),
  blockPath: z.string().min(1).max(200),
});

/**
 * Cascade update after changing a parent element
 */
export const cascadeUpdateInputSchema = z.object({
  courseId: z.string().uuid(),
  blockPath: z.string().min(1).max(200),
  mode: z.enum(['mark_stale', 'auto_regenerate', 'review_each']),
});

/**
 * Estimate regeneration cost in tokens
 */
export const estimateRegenerationCostInputSchema = z.object({
  courseId: z.string().uuid(),
  stageId: z.enum(['stage_4', 'stage_5']),
  blockPath: z.string().min(1).max(200),
  userInstruction: z.string().min(1).max(500),
});

// ============================================================================
// Output Schemas
// ============================================================================

/**
 * Response after updating a field
 */
export const updateFieldOutputSchema = z.object({
  success: z.boolean(),
  updatedAt: z.string().datetime(),
  newValue: z.unknown(),
  // Recalculated values (if applicable)
  recalculated: z.object({
    sectionDuration: z.number().optional(),
    courseDuration: z.number().optional(),
    lessonNumbers: z.record(z.string(), z.number()).optional(),
  }).optional(),
});

/**
 * Response after regenerating a block
 */
export const regenerateBlockOutputSchema = z.object({
  regeneratedContent: z.unknown(),
  pedagogicalChangeLog: z.string(),
  alignmentScore: z.number().int().min(1).max(5),
  bloomLevelPreserved: z.boolean(),
  conceptsAdded: z.array(z.string()),
  conceptsRemoved: z.array(z.string()),
  tokensUsed: z.number().int(),
  contextTier: z.enum(['atomic', 'local', 'structural', 'global']),
});

/**
 * Dependency graph for a block
 */
export const dependencyNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['course', 'section', 'lesson', 'objective']),
  label: z.string(),
  parentId: z.string().nullable(),
});

export const dependencyEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(['PARENT_OF', 'ALIGNS_TO', 'ASSESSES', 'PREREQUISITE_FOR']),
});

export const getBlockDependenciesOutputSchema = z.object({
  upstream: z.array(dependencyNodeSchema),
  downstream: z.array(dependencyNodeSchema),
  edges: z.array(dependencyEdgeSchema),
  totalAffected: z.number().int(),
});

/**
 * Cascade update result
 */
export const cascadeUpdateOutputSchema = z.object({
  mode: z.enum(['mark_stale', 'auto_regenerate', 'review_each']),
  affectedNodes: z.array(z.object({
    nodeId: z.string(),
    label: z.string(),
    status: z.enum(['marked_stale', 'regenerated', 'pending_review']),
  })),
  totalProcessed: z.number().int(),
  // For 'review_each' mode, return list for step-by-step review
  reviewQueue: z.array(z.object({
    nodeId: z.string(),
    label: z.string(),
    currentContent: z.unknown(),
    suggestedUpdate: z.unknown().optional(),
  })).optional(),
});

/**
 * Cost estimation for regeneration
 */
export const estimateRegenerationCostOutputSchema = z.object({
  estimatedTokens: z.number().int(),
  contextTier: z.enum(['atomic', 'local', 'structural', 'global']),
  estimatedCostUsd: z.number(), // approximate cost
  userBalance: z.number().int().optional(), // tokens remaining (if tracked)
  canProceed: z.boolean(),
  warningMessage: z.string().optional(),
});

// ============================================================================
// Endpoint Signatures (for documentation)
// ============================================================================

/**
 * generation.updateField
 *
 * Purpose: Update a single field in Stage 4 or Stage 5 result
 * Authorization: Course owner only
 * Rate limit: None (debounced on frontend)
 *
 * Input: updateFieldInputSchema
 * Output: updateFieldOutputSchema
 *
 * Side effects:
 * - Recalculates durations if lesson duration changed
 * - Renumbers lessons if lesson added/removed
 * - Updates courses.analysis_result or courses.course_structure in DB
 */

/**
 * generation.regenerateBlock
 *
 * Purpose: Regenerate a specific block using AI with user instruction
 * Authorization: Course owner only
 * Rate limit: Token-based (check balance before execution)
 *
 * Input: regenerateBlockInputSchema
 * Output: regenerateBlockOutputSchema
 *
 * Flow:
 * 1. Detect context tier from instruction
 * 2. Assemble context based on tier
 * 3. Build XML-structured prompt
 * 4. Call LLM with structured output schema
 * 5. Validate Bloom's level preservation
 * 6. Generate semantic diff
 * 7. Return for user approval (not auto-saved)
 */

/**
 * generation.getBlockDependencies
 *
 * Purpose: Get upstream and downstream dependencies for a block
 * Authorization: Course owner or org admin (read-only)
 *
 * Input: getBlockDependenciesInputSchema
 * Output: getBlockDependenciesOutputSchema
 *
 * Use case: Show impact analysis before editing
 */

/**
 * generation.cascadeUpdate
 *
 * Purpose: Handle cascade updates after changing a parent element
 * Authorization: Course owner only
 *
 * Input: cascadeUpdateInputSchema
 * Output: cascadeUpdateOutputSchema
 *
 * Modes:
 * - mark_stale: Just mark children as stale (yellow/red indicators)
 * - auto_regenerate: Regenerate all children automatically
 * - review_each: Return queue for step-by-step review
 */

/**
 * generation.estimateRegenerationCost
 *
 * Purpose: Estimate token cost before regeneration
 * Authorization: Course owner only
 *
 * Input: estimateRegenerationCostInputSchema
 * Output: estimateRegenerationCostOutputSchema
 *
 * Use case: Show user estimated cost in UI before proceeding
 */

// ============================================================================
// Type Exports
// ============================================================================

export type UpdateFieldInput = z.infer<typeof updateFieldInputSchema>;
export type UpdateFieldOutput = z.infer<typeof updateFieldOutputSchema>;
export type RegenerateBlockInput = z.infer<typeof regenerateBlockInputSchema>;
export type RegenerateBlockOutput = z.infer<typeof regenerateBlockOutputSchema>;
export type GetBlockDependenciesInput = z.infer<typeof getBlockDependenciesInputSchema>;
export type GetBlockDependenciesOutput = z.infer<typeof getBlockDependenciesOutputSchema>;
export type CascadeUpdateInput = z.infer<typeof cascadeUpdateInputSchema>;
export type CascadeUpdateOutput = z.infer<typeof cascadeUpdateOutputSchema>;
export type EstimateRegenerationCostInput = z.infer<typeof estimateRegenerationCostInputSchema>;
export type EstimateRegenerationCostOutput = z.infer<typeof estimateRegenerationCostOutputSchema>;

// ============================================================================
// Additional Endpoints (FR-011a, FR-011b)
// ============================================================================

/**
 * Add a new lesson or section using AI (FR-011b)
 */
export const addElementInputSchema = z.object({
  courseId: z.string().uuid(),
  elementType: z.enum(['lesson', 'section']),
  parentPath: z.string(), // For lesson: section path (e.g., "sections[0]")
  position: z.enum(['start', 'end']).default('end'),
  userInstruction: z.string().min(1).max(500), // "Какой урок добавить?"
});

export const addElementOutputSchema = z.object({
  success: z.boolean(),
  newElement: z.unknown(), // LessonSpecification or SectionSpecification
  newElementPath: z.string(),
  tokensUsed: z.number().int(),
  renumberedLessons: z.array(z.object({
    lessonPath: z.string(),
    oldNumber: z.number(),
    newNumber: z.number(),
  })),
});

export type AddElementInput = z.infer<typeof addElementInputSchema>;
export type AddElementOutput = z.infer<typeof addElementOutputSchema>;

/**
 * Delete a lesson or section (FR-011, FR-011a)
 *
 * Smart confirmation logic:
 * - If element has content (learning_objectives, key_topics not empty) → require confirmDeletion=true
 * - If element is empty → delete immediately without confirmation
 */
export const deleteElementInputSchema = z.object({
  courseId: z.string().uuid(),
  elementPath: z.string(), // e.g., "sections[0].lessons[2]"
  confirmDeletion: z.boolean().default(false),
});

export const deleteElementOutputSchema = z.object({
  success: z.boolean(),
  deleted: z.boolean(),
  requiresConfirmation: z.boolean().optional(), // true if confirmDeletion was false but element has content
  deletedElementLabel: z.string().optional(),
  renumberedLessons: z.array(z.object({
    lessonPath: z.string(),
    oldNumber: z.number(),
    newNumber: z.number(),
  })),
  recalculatedDurations: z.object({
    sectionDuration: z.number().optional(),
    courseDuration: z.number().optional(),
  }).optional(),
});

export type DeleteElementInput = z.infer<typeof deleteElementInputSchema>;
export type DeleteElementOutput = z.infer<typeof deleteElementOutputSchema>;

/**
 * generation.addElement
 *
 * Purpose: Add a new lesson or section using AI
 * Authorization: Course owner only
 *
 * Flow:
 * 1. User clicks "+ Урок" or "+ Секция"
 * 2. Opens mini-chat: "Какой урок добавить?"
 * 3. AI generates element in the style of existing course
 * 4. Element is added to structure
 * 5. Lessons are renumbered
 */

/**
 * generation.deleteElement
 *
 * Purpose: Delete a lesson or section
 * Authorization: Course owner only
 *
 * Smart confirmation (FR-011a):
 * - If element has content → return requiresConfirmation=true, don't delete
 * - If confirmDeletion=true → delete and return success
 * - If element is empty → delete immediately
 *
 * Side effects:
 * - Renumber subsequent lessons
 * - Recalculate section/course durations
 *
 * Note: No minimum 10 lessons restriction for manual deletion (FR-011)
 */

// ============================================================================
// Quick Actions (FR-014)
// ============================================================================

/**
 * Predefined quick action prompts for block regeneration
 */
export const QUICK_ACTIONS = {
  simplify: {
    id: 'simplify',
    label: { ru: 'Упростить', en: 'Simplify' },
    prompt: 'Сделай проще и понятнее, используй более простые слова и короткие предложения',
    icon: 'Sparkles',
  },
  expand: {
    id: 'expand',
    label: { ru: 'Расширить', en: 'Expand' },
    prompt: 'Добавь больше деталей, примеров и пояснений',
    icon: 'Plus',
  },
  shorten: {
    id: 'shorten',
    label: { ru: 'Сократить', en: 'Shorten' },
    prompt: 'Сделай более лаконичным, убери лишние детали, оставь только ключевую информацию',
    icon: 'Minus',
  },
  examples: {
    id: 'examples',
    label: { ru: 'Примеры', en: 'Examples' },
    prompt: 'Добавь конкретные практические примеры из реальной жизни или бизнеса',
    icon: 'BookOpen',
  },
  professional: {
    id: 'professional',
    label: { ru: 'Профессионализм', en: 'Professional' },
    prompt: 'Сделай более профессиональным, добавь отраслевую терминологию и экспертный тон',
    icon: 'Briefcase',
  },
} as const;

export type QuickActionId = keyof typeof QUICK_ACTIONS;
export type QuickAction = typeof QUICK_ACTIONS[QuickActionId];
