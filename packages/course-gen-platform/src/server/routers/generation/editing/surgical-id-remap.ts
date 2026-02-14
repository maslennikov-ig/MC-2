/**
 * Surgical ID Remap — LLM-facing ID simplification for course editing
 * @module server/routers/generation/editing/surgical-id-remap
 *
 * Before sending course structure to LLM, we simplify IDs to reduce token usage
 * and LLM errors (BAML research shows 5-10x fewer errors with simplified IDs):
 *   sec_hY7a3fRx -> sec_1, sec_kM9b2cQw -> sec_2
 *   lsn_kM9b2cQw -> lsn_1, lsn_xY8z3aRw -> lsn_2
 *
 * After receiving LLM response, we map simplified IDs back to real IDs.
 */

import type { CourseStructure } from '@megacampus/shared-types';
import type { CourseOperation } from '@megacampus/shared-types/course-operations';
import { logger } from '../../../../shared/logger/index.js';

// ============================================================================
// Types
// ============================================================================

/** Mapping from real IDs to simplified LLM-facing IDs and vice versa */
export interface IdRemapContext {
  /** real -> simplified (used before LLM call) */
  toSimplified: Map<string, string>;
  /** simplified -> real (used after LLM response) */
  toReal: Map<string, string>;
}

// ============================================================================
// Context Building
// ============================================================================

/**
 * Build ID remap context from course structure.
 *
 * Sections get sec_1, sec_2, ... and lessons get lsn_1, lsn_2, ...
 * Numbering is sequential across the entire course (not per-section).
 * Elements without an `id` field are skipped.
 */
export function buildIdRemapContext(structure: CourseStructure): IdRemapContext {
  const toSimplified = new Map<string, string>();
  const toReal = new Map<string, string>();

  let sectionCounter = 0;
  let lessonCounter = 0;

  for (const section of structure.sections) {
    if (section.id) {
      sectionCounter++;
      const simplified = `sec_${sectionCounter}`;
      toSimplified.set(section.id, simplified);
      toReal.set(simplified, section.id);
    }

    for (const lesson of section.lessons) {
      if (lesson.id) {
        lessonCounter++;
        const simplified = `lsn_${lessonCounter}`;
        toSimplified.set(lesson.id, simplified);
        toReal.set(simplified, lesson.id);
      }
    }
  }

  logger.debug(
    { sectionCount: sectionCounter, lessonCount: lessonCounter },
    'Built ID remap context for surgical editing'
  );

  return { toSimplified, toReal };
}

// ============================================================================
// Structure Remapping (Real -> Simplified)
// ============================================================================

/**
 * Deep-clone helper with JSON fallback for environments where
 * structuredClone may not handle all object shapes.
 */
function deepClone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

/**
 * Remap a course structure to use simplified IDs.
 *
 * Returns a NEW structure (immutable) with simplified IDs.
 * Only remaps the `id` fields on sections and lessons —
 * all other fields are preserved as-is.
 */
export function remapStructureToSimplified(
  structure: CourseStructure,
  ctx: IdRemapContext
): CourseStructure {
  const cloned = deepClone(structure);

  for (const section of cloned.sections) {
    if (section.id) {
      const simplified = ctx.toSimplified.get(section.id);
      if (simplified) {
        (section as { id?: string }).id = simplified;
      }
    }

    for (const lesson of section.lessons) {
      if (lesson.id) {
        const simplified = ctx.toSimplified.get(lesson.id);
        if (simplified) {
          (lesson as { id?: string }).id = simplified;
        }
      }
    }
  }

  return cloned;
}

// ============================================================================
// Operation Remapping (Simplified -> Real)
// ============================================================================

/** Prefix used by LLM for newly created elements */
const NEW_ELEMENT_PREFIX = '__new_';

/**
 * Resolve a single ID from simplified back to real.
 * - IDs starting with `__new_` are left as-is (temp IDs for new elements).
 * - All other IDs are looked up in ctx.toReal.
 * - Throws if an unknown simplified ID is encountered.
 */
function resolveId(
  id: string,
  ctx: IdRemapContext,
  fieldName: string,
  operationType: string
): string {
  if (id.startsWith(NEW_ELEMENT_PREFIX)) {
    return id;
  }

  const realId = ctx.toReal.get(id);
  if (!realId) {
    throw new Error(
      `Unknown simplified ID "${id}" in ${operationType}.${fieldName}. ` +
        `Available mappings: ${[...ctx.toReal.keys()].join(', ')}`
    );
  }

  return realId;
}

/**
 * Resolve an optional/nullable ID field. Returns null/undefined as-is.
 */
function resolveOptionalId(
  id: string | null | undefined,
  ctx: IdRemapContext,
  fieldName: string,
  operationType: string
): string | null | undefined {
  if (id === null || id === undefined) {
    return id;
  }
  return resolveId(id, ctx, fieldName, operationType);
}

/**
 * Remap operations from LLM (using simplified IDs) back to real IDs.
 *
 * Validates that all referenced IDs exist in the remap context.
 * IDs starting with `__new_` are preserved as-is (temp IDs for new elements).
 * Throws if an unknown simplified ID is encountered.
 */
export function remapOperationsToReal(
  operations: CourseOperation[],
  ctx: IdRemapContext
): CourseOperation[] {
  return operations.map((op, index) => {
    try {
      return remapSingleOperation(op, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown remap error';
      logger.error(
        { operationIndex: index, operationType: op.type, error: message },
        'Failed to remap operation ID back to real'
      );
      throw new Error(`Operation #${index + 1} (${op.type}): ${message}`);
    }
  });
}

/**
 * Remap a single operation's ID fields from simplified to real.
 */
function remapSingleOperation(op: CourseOperation, ctx: IdRemapContext): CourseOperation {
  switch (op.type) {
    case 'add_lesson':
      return {
        ...op,
        parentSectionId: resolveId(op.parentSectionId, ctx, 'parentSectionId', 'add_lesson'),
        afterLessonId: resolveOptionalId(op.afterLessonId, ctx, 'afterLessonId', 'add_lesson') as
          | string
          | null,
        // tempId is intentionally NOT remapped — it is a __new_X__ placeholder
      };

    case 'add_section':
      return {
        ...op,
        afterSectionId: resolveOptionalId(
          op.afterSectionId,
          ctx,
          'afterSectionId',
          'add_section'
        ) as string | null,
        // tempId is intentionally NOT remapped
      };

    case 'update_field':
      return {
        ...op,
        targetId: resolveId(op.targetId, ctx, 'targetId', 'update_field'),
      };

    case 'delete_element':
      return {
        ...op,
        targetId: resolveId(op.targetId, ctx, 'targetId', 'delete_element'),
      };

    case 'move_element':
      return {
        ...op,
        targetId: resolveId(op.targetId, ctx, 'targetId', 'move_element'),
        newParentId: resolveOptionalId(op.newParentId, ctx, 'newParentId', 'move_element') as
          | string
          | undefined,
        afterId: resolveOptionalId(op.afterId, ctx, 'afterId', 'move_element') as string | null,
      };

    default: {
      // Exhaustive check — ensures all operation types are handled
      const exhaustiveCheck: never = op;
      throw new Error(
        `Unknown operation type: ${(exhaustiveCheck as unknown as { type: string }).type}`
      );
    }
  }
}
