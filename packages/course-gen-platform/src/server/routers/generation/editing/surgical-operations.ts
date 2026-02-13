/**
 * Surgical Operations — Backend sequencer for atomic course structure edits
 * @module server/routers/generation/editing/surgical-operations
 *
 * Applies a batch of ID-based surgical operations to a CourseStructure JSONB.
 * Operations reference stable IDs (sec_xxx, lsn_xxx) instead of path-based
 * indices, making them resilient to concurrent edits and reorderings.
 *
 * Flow:
 *   1. validateOperations() — pre-flight check (limits, ID existence, constraints)
 *   2. applySurgicalOperations() — apply batch atomically on deep clone
 *   3. Final cleanup: renumber, recalculate durations
 */

import type { CourseStructure, Section, Lesson } from '@megacampus/shared-types';
import type { CourseOperation } from '@megacampus/shared-types/course-operations';
import {
  MAX_OPERATIONS_PER_BATCH,
  MAX_DELETES_PER_BATCH,
  MAX_DELETE_CONTENT_RATIO,
} from '@megacampus/shared-types/course-operations';
import { nanoid } from 'nanoid';
import { logger } from '../../../../shared/logger/index.js';

// ============================================================================
// Constants
// ============================================================================

const SECTION_ID_PREFIX = 'sec_';
const LESSON_ID_PREFIX = 'lsn_';
const STABLE_ID_LENGTH = 8;

// ============================================================================
// Public Types
// ============================================================================

/** Result of applying surgical operations */
export interface SurgicalResult {
  /** Updated course structure */
  updatedStructure: CourseStructure;
  /** Mapping of tempIds to real IDs generated during add operations */
  tempIdMap: Record<string, string>;
  /** Number of operations applied */
  appliedCount: number;
  /** Summary of applied operations for logging */
  operationSummary: string[];
}

/** Validation error from pre-flight check */
export interface PreflightError {
  operationIndex: number;
  operationType: string;
  message: string;
}

// ============================================================================
// Internal Lookup Types
// ============================================================================

interface SectionLookup {
  section: Section;
  sectionIndex: number;
}

interface LessonLookup {
  lesson: Lesson;
  sectionIndex: number;
  lessonIndex: number;
}

type ElementLookup =
  | { type: 'section'; sectionIndex: number }
  | { type: 'lesson'; sectionIndex: number; lessonIndex: number };

// ============================================================================
// Internal Helpers — Element Lookup by ID
// ============================================================================

/**
 * Find a section by its stable ID.
 * Falls back to tempIdMap for IDs created earlier in the same batch.
 */
function findSectionById(
  structure: CourseStructure,
  id: string,
  tempIdMap: Record<string, string>
): SectionLookup | null {
  const resolvedId = tempIdMap[id] ?? id;

  for (let i = 0; i < structure.sections.length; i++) {
    if (structure.sections[i].id === resolvedId) {
      return { section: structure.sections[i], sectionIndex: i };
    }
  }

  return null;
}

/**
 * Find a lesson by its stable ID across all sections.
 * Falls back to tempIdMap for IDs created earlier in the same batch.
 */
function findLessonById(
  structure: CourseStructure,
  id: string,
  tempIdMap: Record<string, string>
): LessonLookup | null {
  const resolvedId = tempIdMap[id] ?? id;

  for (let si = 0; si < structure.sections.length; si++) {
    const section = structure.sections[si];
    for (let li = 0; li < section.lessons.length; li++) {
      if (section.lessons[li].id === resolvedId) {
        return { lesson: section.lessons[li], sectionIndex: si, lessonIndex: li };
      }
    }
  }

  return null;
}

/**
 * Find any element (section or lesson) by its stable ID.
 * Falls back to tempIdMap for IDs created earlier in the same batch.
 */
function findElementById(
  structure: CourseStructure,
  id: string,
  tempIdMap: Record<string, string>
): ElementLookup | null {
  const sectionResult = findSectionById(structure, id, tempIdMap);
  if (sectionResult) {
    return { type: 'section', sectionIndex: sectionResult.sectionIndex };
  }

  const lessonResult = findLessonById(structure, id, tempIdMap);
  if (lessonResult) {
    return {
      type: 'lesson',
      sectionIndex: lessonResult.sectionIndex,
      lessonIndex: lessonResult.lessonIndex,
    };
  }

  return null;
}

// ============================================================================
// Internal Helpers — Deep Clone
// ============================================================================

/**
 * Deep clone with JSON fallback for environments where structuredClone
 * may not handle all object shapes.
 */
function deepClone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

// ============================================================================
// Internal Helpers — Field Name Mapping
// ============================================================================

/** Map short/friendly field names to actual lesson property names */
const LESSON_FIELD_MAP: Record<string, string> = {
  title: 'lesson_title',
  objectives: 'lesson_objectives',
  topics: 'key_topics',
  duration: 'estimated_duration_minutes',
  // Direct names pass through
  lesson_title: 'lesson_title',
  lesson_objectives: 'lesson_objectives',
  key_topics: 'key_topics',
  estimated_duration_minutes: 'estimated_duration_minutes',
  difficulty_level: 'difficulty_level',
};

/** Map short/friendly field names to actual section property names */
const SECTION_FIELD_MAP: Record<string, string> = {
  title: 'section_title',
  description: 'section_description',
  objectives: 'learning_objectives',
  // Direct names pass through
  section_title: 'section_title',
  section_description: 'section_description',
  learning_objectives: 'learning_objectives',
};

/**
 * Resolve a field name for a given element type.
 * Returns the actual property name, or null if the field is invalid/inapplicable.
 */
function resolveFieldName(field: string, elementType: 'section' | 'lesson'): string | null {
  const map = elementType === 'lesson' ? LESSON_FIELD_MAP : SECTION_FIELD_MAP;
  return map[field] ?? null;
}

// ============================================================================
// Internal Helpers — Duration & Numbering Recalculation
// ============================================================================

/** Recalculate a single section's duration from its lessons */
function recalculateSectionDuration(section: Section): number {
  return section.lessons.reduce((sum, lesson) => sum + lesson.estimated_duration_minutes, 0);
}

/** Recalculate total course duration in hours (rounded to 2 decimals) */
function recalculateCourseDuration(structure: CourseStructure): number {
  const totalMinutes = structure.sections.reduce(
    (sum, section) => sum + section.estimated_duration_minutes,
    0
  );
  return Math.round((totalMinutes / 60) * 100) / 100;
}

/**
 * Renumber all section numbers and lesson numbers in-place.
 * Section numbers: 1, 2, 3, ...
 * Lesson numbers: 1, 2, 3, ... (sequential integers within each section)
 */
function renumberAll(structure: CourseStructure): void {
  for (let si = 0; si < structure.sections.length; si++) {
    const section = structure.sections[si];
    section.section_number = si + 1;

    for (let li = 0; li < section.lessons.length; li++) {
      section.lessons[li].lesson_number = li + 1;
    }
  }
}

/**
 * Recalculate all section durations and the course-level duration in-place.
 */
function recalculateAllDurations(structure: CourseStructure): void {
  for (const section of structure.sections) {
    section.estimated_duration_minutes = recalculateSectionDuration(section);
  }
  structure.estimated_duration_hours = recalculateCourseDuration(structure);
}

// ============================================================================
// Internal Helpers — ID Existence Check (for validation)
// ============================================================================

/**
 * Check whether a given ID exists in the structure.
 * Only checks real IDs — tempIds are not checked here (they are validated
 * by ensuring they reference an earlier add operation in the batch).
 */
function idExistsInStructure(structure: CourseStructure, id: string): boolean {
  return findElementById(structure, id, {}) !== null;
}

/**
 * Count total content elements (sections + lessons) in the structure.
 */
function countElements(structure: CourseStructure): number {
  let count = structure.sections.length;
  for (const section of structure.sections) {
    count += section.lessons.length;
  }
  return count;
}

// ============================================================================
// Pre-flight Validation
// ============================================================================

/**
 * Pre-flight validation for a batch of operations.
 *
 * Checks:
 * - Max 15 operations per batch
 * - Max 3 delete operations per batch
 * - Delete operations don't remove >50% of content
 * - All referenced IDs exist in the structure (or are tempIds from earlier ops)
 * - Move targets are valid (no section-as-lesson or lesson-as-section)
 *
 * @param operations - Array of course operations to validate
 * @param structure - Current course structure to validate against
 * @returns List of errors (empty array means valid)
 */
export function validateOperations(
  operations: CourseOperation[],
  structure: CourseStructure
): PreflightError[] {
  const errors: PreflightError[] = [];

  // --- Batch-level constraints ---

  if (operations.length > MAX_OPERATIONS_PER_BATCH) {
    errors.push({
      operationIndex: -1,
      operationType: 'batch',
      message: `Batch exceeds maximum of ${MAX_OPERATIONS_PER_BATCH} operations (got ${operations.length})`,
    });
  }

  const deleteOps = operations.filter(op => op.type === 'delete_element');
  if (deleteOps.length > MAX_DELETES_PER_BATCH) {
    errors.push({
      operationIndex: -1,
      operationType: 'batch',
      message: `Batch exceeds maximum of ${MAX_DELETES_PER_BATCH} delete operations (got ${deleteOps.length})`,
    });
  }

  // Check delete ratio: count actual elements that would be removed vs total
  // Deleting a section also removes all its lessons, so count those too
  if (deleteOps.length > 0) {
    const totalElements = countElements(structure);
    let affectedElements = 0;
    for (const op of deleteOps) {
      if (op.type !== 'delete_element') continue;
      const element = findElementById(structure, op.targetId, {});
      if (element?.type === 'section') {
        // Section deletion removes the section + all its lessons
        const section = structure.sections[element.sectionIndex];
        affectedElements += 1 + section.lessons.length;
      } else {
        affectedElements += 1;
      }
    }
    if (totalElements > 0 && affectedElements / totalElements > MAX_DELETE_CONTENT_RATIO) {
      errors.push({
        operationIndex: -1,
        operationType: 'batch',
        message: `Delete operations would remove >${Math.round(MAX_DELETE_CONTENT_RATIO * 100)}% of content (${affectedElements} elements affected out of ${totalElements} total)`,
      });
    }
  }

  // --- Per-operation validation ---
  // Track tempIds introduced by earlier add operations so later ops can reference them
  const knownTempIds = new Set<string>();

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const addError = (message: string) => {
      errors.push({ operationIndex: i, operationType: op.type, message });
    };

    /**
     * Check that an ID exists in the structure or was introduced by an
     * earlier add operation in this batch.
     */
    const requireId = (id: string, fieldName: string) => {
      if (!idExistsInStructure(structure, id) && !knownTempIds.has(id)) {
        addError(`${fieldName} "${id}" not found in course structure`);
      }
    };

    /**
     * Check an optional/nullable ID (skip null/undefined).
     */
    const requireOptionalId = (id: string | null | undefined, fieldName: string) => {
      if (id !== null && id !== undefined) {
        requireId(id, fieldName);
      }
    };

    switch (op.type) {
      case 'add_lesson': {
        requireId(op.parentSectionId, 'parentSectionId');
        requireOptionalId(op.afterLessonId, 'afterLessonId');
        // Register tempId for later operations
        knownTempIds.add(op.tempId);
        break;
      }

      case 'add_section': {
        requireOptionalId(op.afterSectionId, 'afterSectionId');
        // Register tempId for later operations
        knownTempIds.add(op.tempId);
        break;
      }

      case 'update_field': {
        requireId(op.targetId, 'targetId');
        break;
      }

      case 'delete_element': {
        requireId(op.targetId, 'targetId');
        break;
      }

      case 'move_element': {
        requireId(op.targetId, 'targetId');
        requireOptionalId(op.newParentId, 'newParentId');
        requireOptionalId(op.afterId, 'afterId');

        // Preflight structural checks (beyond basic ID existence)
        const moveTarget = findElementById(structure, op.targetId, {});
        if (!moveTarget && !knownTempIds.has(op.targetId)) {
          addError(`move_element: targetId "${op.targetId}" not found in structure`);
        }
        if (op.newParentId && !knownTempIds.has(op.newParentId)) {
          const parent = findSectionById(structure, op.newParentId, {});
          if (!parent) {
            addError(`move_element: newParentId "${op.newParentId}" is not a valid section`);
          }
          // Circular check: can't move a section into itself
          if (moveTarget?.type === 'section' && op.newParentId === op.targetId) {
            addError(
              `move_element: circular relation — cannot move section "${op.targetId}" into itself`
            );
          }
        }
        if (op.afterId && !knownTempIds.has(op.afterId)) {
          const afterElement = findElementById(structure, op.afterId, {});
          if (!afterElement) {
            addError(`move_element: afterId "${op.afterId}" not found in structure`);
          } else if (moveTarget) {
            // Validate type match: moving a lesson requires afterId to be a lesson,
            // moving a section requires afterId to be a section
            if (moveTarget.type === 'lesson' && afterElement.type !== 'lesson') {
              addError(
                `move_element: afterId "${op.afterId}" is a ${afterElement.type}, expected a lesson (target is a lesson)`
              );
            }
            if (moveTarget.type === 'section' && afterElement.type !== 'section') {
              addError(
                `move_element: afterId "${op.afterId}" is a ${afterElement.type}, expected a section (target is a section)`
              );
            }
            // Validate context: when moving a lesson, afterId must be in the target section
            if (moveTarget.type === 'lesson' && afterElement.type === 'lesson') {
              const targetParentId =
                op.newParentId || structure.sections[moveTarget.sectionIndex]?.id;
              if (targetParentId && !knownTempIds.has(targetParentId)) {
                const targetParent = findSectionById(structure, targetParentId, {});
                if (targetParent && afterElement.sectionIndex !== targetParent.sectionIndex) {
                  addError(
                    `move_element: afterId "${op.afterId}" is not in the target section "${targetParentId}"`
                  );
                }
              }
            }
          }
        }
        break;
      }

      default: {
        const _exhaustive: never = op;
        addError(`Unknown operation type: ${(_exhaustive as { type: string }).type}`);
      }
    }
  }

  return errors;
}

// ============================================================================
// Operation Applicators
// ============================================================================

/**
 * Apply a single add_lesson operation to the working structure.
 * Mutates the structure in-place (caller provides a clone).
 */
function applyAddLesson(
  structure: CourseStructure,
  op: Extract<CourseOperation, { type: 'add_lesson' }>,
  tempIdMap: Record<string, string>,
  defaultLessonDuration: number
): string {
  const parentLookup = findSectionById(structure, op.parentSectionId, tempIdMap);
  if (!parentLookup) {
    throw new Error(`add_lesson: parentSectionId "${op.parentSectionId}" not found`);
  }

  const { section } = parentLookup;

  // Determine insertion index
  let insertIndex: number;
  if (op.afterLessonId === null) {
    insertIndex = 0;
  } else {
    const afterLookup = findLessonById(structure, op.afterLessonId, tempIdMap);
    if (!afterLookup) {
      throw new Error(`add_lesson: afterLessonId "${op.afterLessonId}" not found`);
    }
    // Ensure the referenced lesson is in the same parent section
    if (structure.sections[afterLookup.sectionIndex] !== section) {
      throw new Error(
        `add_lesson: afterLessonId "${op.afterLessonId}" is not in parentSection "${op.parentSectionId}"`
      );
    }
    insertIndex = afterLookup.lessonIndex + 1;
  }

  // Generate real ID
  const realId = `${LESSON_ID_PREFIX}${nanoid(STABLE_ID_LENGTH)}`;

  // Build lesson object with sensible defaults that satisfy Zod schema minimums
  // (lesson_objectives >= 1, key_topics >= 2)
  const newLesson: Lesson = {
    id: realId,
    lesson_title: op.title,
    lesson_objectives:
      op.objectives && op.objectives.length > 0 ? op.objectives : [`Изучить основы: ${op.title}`],
    key_topics:
      op.keyTopics && op.keyTopics.length >= 2 ? op.keyTopics : [op.title, `Основы ${op.title}`],
    estimated_duration_minutes: op.estimatedDuration ?? defaultLessonDuration,
  };

  section.lessons.splice(insertIndex, 0, newLesson);

  // Record mapping
  tempIdMap[op.tempId] = realId;

  return `add_lesson "${op.title}" (${realId}) in section "${section.section_title}"`;
}

/**
 * Apply a single add_section operation to the working structure.
 * Mutates the structure in-place (caller provides a clone).
 */
function applyAddSection(
  structure: CourseStructure,
  op: Extract<CourseOperation, { type: 'add_section' }>,
  tempIdMap: Record<string, string>
): string {
  // Determine insertion index
  let insertIndex: number;
  if (op.afterSectionId === null) {
    insertIndex = 0;
  } else {
    const afterLookup = findSectionById(structure, op.afterSectionId, tempIdMap);
    if (!afterLookup) {
      throw new Error(`add_section: afterSectionId "${op.afterSectionId}" not found`);
    }
    insertIndex = afterLookup.sectionIndex + 1;
  }

  // Generate real ID
  const realId = `${SECTION_ID_PREFIX}${nanoid(STABLE_ID_LENGTH)}`;

  // Build section object
  // Note: lessons=[] intentionally violates Zod min(1) — new sections start
  // empty and the user adds lessons separately. Schema validation only runs
  // during Stage 5 initial generation, not during chat-based edits.
  const newSection: Section = {
    id: realId,
    section_title: op.title,
    section_description: op.description ?? '',
    learning_objectives: [],
    lessons: [],
    estimated_duration_minutes: 0,
  };

  structure.sections.splice(insertIndex, 0, newSection);

  // Record mapping
  tempIdMap[op.tempId] = realId;

  return `add_section "${op.title}" (${realId}) at index ${insertIndex}`;
}

/**
 * Apply a single update_field operation to the working structure.
 * Mutates the structure in-place (caller provides a clone).
 */
function applyUpdateField(
  structure: CourseStructure,
  op: Extract<CourseOperation, { type: 'update_field' }>,
  tempIdMap: Record<string, string>
): string {
  const element = findElementById(structure, op.targetId, tempIdMap);
  if (!element) {
    throw new Error(`update_field: targetId "${op.targetId}" not found`);
  }

  const resolvedFieldName = resolveFieldName(op.field, element.type);
  if (!resolvedFieldName) {
    throw new Error(`update_field: field "${op.field}" is not valid for ${element.type}`);
  }

  // Get the actual element object and set the field
  if (element.type === 'section') {
    const section = structure.sections[element.sectionIndex];
    (section as unknown as Record<string, unknown>)[resolvedFieldName] = op.newValue;
    return `update_field "${resolvedFieldName}" on section "${section.section_title}"`;
  } else {
    const lesson = structure.sections[element.sectionIndex].lessons[element.lessonIndex];
    (lesson as unknown as Record<string, unknown>)[resolvedFieldName] = op.newValue;
    return `update_field "${resolvedFieldName}" on lesson "${lesson.lesson_title}"`;
  }
}

/**
 * Apply a single delete_element operation to the working structure.
 * Mutates the structure in-place (caller provides a clone).
 */
function applyDeleteElement(
  structure: CourseStructure,
  op: Extract<CourseOperation, { type: 'delete_element' }>,
  tempIdMap: Record<string, string>
): string {
  const element = findElementById(structure, op.targetId, tempIdMap);
  if (!element) {
    throw new Error(`delete_element: targetId "${op.targetId}" not found`);
  }

  if (element.type === 'section') {
    const removed = structure.sections[element.sectionIndex];
    structure.sections.splice(element.sectionIndex, 1);
    return `delete_element section "${removed.section_title}"`;
  } else {
    const section = structure.sections[element.sectionIndex];
    const removed = section.lessons[element.lessonIndex];
    section.lessons.splice(element.lessonIndex, 1);
    return `delete_element lesson "${removed.lesson_title}" from section "${section.section_title}"`;
  }
}

/**
 * Apply a single move_element operation to the working structure.
 * Mutates the structure in-place (caller provides a clone).
 */
function applyMoveElement(
  structure: CourseStructure,
  op: Extract<CourseOperation, { type: 'move_element' }>,
  tempIdMap: Record<string, string>
): string {
  const element = findElementById(structure, op.targetId, tempIdMap);
  if (!element) {
    throw new Error(`move_element: targetId "${op.targetId}" not found`);
  }

  if (element.type === 'lesson') {
    // --- Move Lesson ---
    const sourceSection = structure.sections[element.sectionIndex];
    const movedLesson = sourceSection.lessons[element.lessonIndex];

    // Remove from current position
    sourceSection.lessons.splice(element.lessonIndex, 1);

    // Determine target section
    let targetSection: Section;
    if (op.newParentId) {
      const parentLookup = findSectionById(structure, op.newParentId, tempIdMap);
      if (!parentLookup) {
        throw new Error(`move_element: newParentId "${op.newParentId}" not found`);
      }
      targetSection = parentLookup.section;
    } else {
      targetSection = sourceSection;
    }

    // Determine insertion index
    let insertIndex: number;
    if (op.afterId === null) {
      insertIndex = 0;
    } else {
      const afterLookup = findLessonById(structure, op.afterId, tempIdMap);
      if (!afterLookup) {
        throw new Error(`move_element: afterId "${op.afterId}" not found`);
      }
      // Verify afterId is in the target section
      if (structure.sections[afterLookup.sectionIndex] !== targetSection) {
        throw new Error(`move_element: afterId "${op.afterId}" is not in the target section`);
      }
      insertIndex = afterLookup.lessonIndex + 1;
    }

    targetSection.lessons.splice(insertIndex, 0, movedLesson);

    return `move_element lesson "${movedLesson.lesson_title}" to section "${targetSection.section_title}" at index ${insertIndex}`;
  } else {
    // --- Move Section ---
    const movedSection = structure.sections[element.sectionIndex];

    // Remove from current position
    structure.sections.splice(element.sectionIndex, 1);

    // Determine insertion index
    let insertIndex: number;
    if (op.afterId === null) {
      insertIndex = 0;
    } else {
      const afterLookup = findSectionById(structure, op.afterId, tempIdMap);
      if (!afterLookup) {
        throw new Error(`move_element: afterId "${op.afterId}" not found`);
      }
      insertIndex = afterLookup.sectionIndex + 1;
    }

    structure.sections.splice(insertIndex, 0, movedSection);

    return `move_element section "${movedSection.section_title}" to index ${insertIndex}`;
  }
}

// ============================================================================
// Public API — Apply Surgical Operations
// ============================================================================

/**
 * Apply a batch of surgical operations atomically.
 *
 * Operations are applied in order on a deep clone of the structure.
 * Each operation mutates the working copy. After all operations,
 * durations are recalculated and elements are renumbered.
 *
 * Throws if any operation references a non-existent ID.
 * Caller should run `validateOperations()` first for user-friendly errors.
 *
 * @param operations - Ordered array of course operations
 * @param structure - Current course structure (not mutated)
 * @param defaultLessonDuration - Default lesson duration in minutes (default: 15)
 * @returns SurgicalResult with updated structure, ID mappings, and summary
 *
 * @example
 * ```typescript
 * const errors = validateOperations(ops, structure);
 * if (errors.length > 0) {
 *   throw new Error(`Validation failed: ${errors.map(e => e.message).join('; ')}`);
 * }
 * const result = applySurgicalOperations(ops, structure);
 * // result.updatedStructure — save to DB
 * // result.tempIdMap — return to client for ID resolution
 * ```
 */
export function applySurgicalOperations(
  operations: CourseOperation[],
  structure: CourseStructure,
  defaultLessonDuration: number = 15
): SurgicalResult {
  // Validate first — throw if pre-flight fails
  const preflightErrors = validateOperations(operations, structure);
  if (preflightErrors.length > 0) {
    const summary = preflightErrors
      .map(e => `[${e.operationIndex}:${e.operationType}] ${e.message}`)
      .join('; ');
    throw new Error(`Pre-flight validation failed: ${summary}`);
  }

  // Deep clone to avoid mutating the original
  const working = deepClone(structure);
  const tempIdMap: Record<string, string> = {};
  const operationSummary: string[] = [];

  // Apply each operation sequentially
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];

    try {
      let summary: string;

      switch (op.type) {
        case 'add_lesson':
          summary = applyAddLesson(working, op, tempIdMap, defaultLessonDuration);
          break;

        case 'add_section':
          summary = applyAddSection(working, op, tempIdMap);
          break;

        case 'update_field':
          summary = applyUpdateField(working, op, tempIdMap);
          break;

        case 'delete_element':
          summary = applyDeleteElement(working, op, tempIdMap);
          break;

        case 'move_element':
          summary = applyMoveElement(working, op, tempIdMap);
          break;

        default: {
          const _exhaustive: never = op;
          throw new Error(`Unknown operation type: ${(_exhaustive as { type: string }).type}`);
        }
      }

      operationSummary.push(`#${i + 1} ${summary}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          operationIndex: i,
          operationType: op.type,
          error: message,
          appliedSoFar: i,
        },
        'Surgical operation failed mid-batch'
      );
      throw new Error(`Operation #${i + 1} (${op.type}) failed: ${message}`);
    }
  }

  // --- Final cleanup: recalculate durations and renumber ---
  recalculateAllDurations(working);
  renumberAll(working);

  logger.info(
    {
      appliedCount: operations.length,
      tempIdMappings: Object.keys(tempIdMap).length,
      sectionCount: working.sections.length,
      lessonCount: working.sections.reduce((sum, s) => sum + s.lessons.length, 0),
    },
    'Surgical operations applied successfully'
  );

  return {
    updatedStructure: working,
    tempIdMap,
    appliedCount: operations.length,
    operationSummary,
  };
}
