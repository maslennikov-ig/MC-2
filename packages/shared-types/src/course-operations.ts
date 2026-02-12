/**
 * Course Operations — Surgical editing operations schema
 * @module @megacampus/shared-types/course-operations
 *
 * Discriminated union of atomic operations that can be applied to a course structure.
 * All ID references use stable IDs (sec_xxx, lsn_xxx).
 * For new elements, LLM uses tempIds (__new_1__), backend maps to real IDs.
 * Positions use afterId|null pattern (no index paths).
 */

import { z } from 'zod';

// ============================================================================
// Individual Operation Schemas
// ============================================================================

/**
 * Add a lesson to a section.
 * LLM uses tempId (__new_1__, __new_2__) for new elements.
 * Backend maps tempId → real lsn_ ID after validation.
 */
export const addLessonOperationSchema = z.object({
  type: z.literal('add_lesson'),
  /** LLM reasoning for why this lesson should be added */
  reasoning: z.string(),
  /** Temporary ID placeholder (e.g., __new_1__) — mapped to real ID by backend */
  tempId: z.string(),
  /** Stable ID of parent section */
  parentSectionId: z.string(),
  /** Insert after this lesson ID, or null for first position */
  afterLessonId: z.string().nullable(),
  /** Lesson title */
  title: z.string(),
  /** Learning objectives for the new lesson */
  objectives: z.array(z.string()).optional(),
  /** Key topics for the new lesson */
  keyTopics: z.array(z.string()).optional(),
  /** Estimated duration in minutes */
  estimatedDuration: z.number().int().min(3).max(45).optional(),
});

/**
 * Add a section to the course.
 */
export const addSectionOperationSchema = z.object({
  type: z.literal('add_section'),
  /** LLM reasoning for why this section should be added */
  reasoning: z.string(),
  /** Temporary ID placeholder — mapped to real ID by backend */
  tempId: z.string(),
  /** Insert after this section ID, or null for first position */
  afterSectionId: z.string().nullable(),
  /** Section title */
  title: z.string(),
  /** Section description */
  description: z.string().optional(),
});

/**
 * Update a field on an existing element (section or lesson).
 */
export const updateFieldOperationSchema = z.object({
  type: z.literal('update_field'),
  /** Stable ID of target element (sec_xxx or lsn_xxx) */
  targetId: z.string(),
  /** Field name to update (e.g., "lesson_title", "section_description") */
  field: z.string(),
  /** New value for the field */
  newValue: z.unknown(),
});

/**
 * Delete an element (section or lesson) by its stable ID.
 */
export const deleteElementOperationSchema = z.object({
  type: z.literal('delete_element'),
  /** Stable ID of element to delete */
  targetId: z.string(),
});

/**
 * Move an element to a new position.
 */
export const moveElementOperationSchema = z.object({
  type: z.literal('move_element'),
  /** Stable ID of element to move */
  targetId: z.string(),
  /** New parent section ID (for moving lessons between sections) */
  newParentId: z.string().optional(),
  /** Insert after this element ID, or null for first position */
  afterId: z.string().nullable(),
});

// ============================================================================
// CourseOperation Discriminated Union
// ============================================================================

/**
 * Discriminated union of all surgical course operations.
 *
 * Operations are applied atomically as a batch by the backend sequencer.
 * Pre-flight validation ensures all referenced IDs exist and constraints are met.
 */
export const courseOperationSchema = z.discriminatedUnion('type', [
  addLessonOperationSchema,
  addSectionOperationSchema,
  updateFieldOperationSchema,
  deleteElementOperationSchema,
  moveElementOperationSchema,
]);

// ============================================================================
// Type Exports
// ============================================================================

export type AddLessonOperation = z.infer<typeof addLessonOperationSchema>;
export type AddSectionOperation = z.infer<typeof addSectionOperationSchema>;
export type UpdateFieldOperation = z.infer<typeof updateFieldOperationSchema>;
export type DeleteElementOperation = z.infer<typeof deleteElementOperationSchema>;
export type MoveElementOperation = z.infer<typeof moveElementOperationSchema>;
export type CourseOperation = z.infer<typeof courseOperationSchema>;

// ============================================================================
// Validation Constants
// ============================================================================

/** Maximum number of operations in a single batch */
export const MAX_OPERATIONS_PER_BATCH = 15;

/** Maximum number of delete operations in a single batch */
export const MAX_DELETES_PER_BATCH = 3;

/** Maximum percentage of content that can be deleted in one batch (0-1) */
export const MAX_DELETE_CONTENT_RATIO = 0.5;
