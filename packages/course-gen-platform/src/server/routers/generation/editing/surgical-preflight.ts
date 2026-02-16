import type { CourseStructure, Lesson, Section } from '@megacampus/shared-types';
import type { CourseOperation } from '@megacampus/shared-types/course-operations';
import {
  MAX_DELETES_PER_BATCH,
  MAX_DELETE_CONTENT_RATIO,
  MAX_OPERATIONS_PER_BATCH,
} from '@megacampus/shared-types/course-operations';

export interface PreflightError {
  operationIndex: number;
  operationType: string;
  message: string;
}

type ElementLookup =
  | { type: 'section'; sectionIndex: number }
  | { type: 'lesson'; sectionIndex: number; lessonIndex: number };

interface ValidationContext {
  operation: CourseOperation;
  operationIndex: number;
  simulation: CourseStructure;
  knownTempIds: Set<string>;
  errors: PreflightError[];
}

function deepClone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function findSectionIndexById(structure: CourseStructure, id: string): number | null {
  for (let i = 0; i < structure.sections.length; i++) {
    if (structure.sections[i].id === id) {
      return i;
    }
  }
  return null;
}

function findLessonLocationById(
  structure: CourseStructure,
  id: string
): { sectionIndex: number; lessonIndex: number } | null {
  for (let sectionIndex = 0; sectionIndex < structure.sections.length; sectionIndex++) {
    const section = structure.sections[sectionIndex];
    for (let lessonIndex = 0; lessonIndex < section.lessons.length; lessonIndex++) {
      if (section.lessons[lessonIndex].id === id) {
        return { sectionIndex, lessonIndex };
      }
    }
  }
  return null;
}

function findElementById(structure: CourseStructure, id: string): ElementLookup | null {
  const sectionIndex = findSectionIndexById(structure, id);
  if (sectionIndex !== null) {
    return { type: 'section', sectionIndex };
  }

  const lessonLocation = findLessonLocationById(structure, id);
  if (lessonLocation) {
    return { type: 'lesson', ...lessonLocation };
  }

  return null;
}

function countElements(structure: CourseStructure): number {
  let count = structure.sections.length;
  for (const section of structure.sections) {
    count += section.lessons.length;
  }
  return count;
}

/** Runtime type validators for known fields */
const FIELD_TYPE_VALIDATORS: Record<string, (value: unknown) => boolean> = {
  // Number fields
  estimated_duration_minutes: v => typeof v === 'number' && v >= 0 && v <= 600,

  // String fields
  lesson_title: v => typeof v === 'string' && v.length > 0 && v.length <= 500,
  section_title: v => typeof v === 'string' && v.length > 0 && v.length <= 600,
  section_description: v => typeof v === 'string' && v.length <= 2000,
  difficulty_level: v =>
    typeof v === 'string' && ['beginner', 'intermediate', 'advanced'].includes(v),

  // Array fields
  lesson_objectives: v =>
    Array.isArray(v) &&
    v.length >= 1 &&
    v.length <= 20 &&
    v.every(item => typeof item === 'string' && item.length >= 10 && item.length <= 600),
  key_topics: v =>
    Array.isArray(v) &&
    v.length >= 2 &&
    v.length <= 30 &&
    v.every(item => typeof item === 'string' && item.length >= 5 && item.length <= 300),
  learning_objectives: v =>
    Array.isArray(v) &&
    v.length >= 1 &&
    v.length <= 20 &&
    v.every(item => typeof item === 'string' && item.length >= 10 && item.length <= 600),
};

/** Map of friendly field names to actual field names */
const FRIENDLY_FIELD_NAMES: Record<string, string> = {
  title: 'lesson_title',
  objectives: 'lesson_objectives',
  topics: 'key_topics',
  description: 'section_description',
  duration: 'estimated_duration_minutes',
  difficulty: 'difficulty_level',
};

function addError(ctx: ValidationContext, message: string): void {
  ctx.errors.push({
    operationIndex: ctx.operationIndex,
    operationType: ctx.operation.type,
    message,
  });
}

function validateBatchConstraints(operations: CourseOperation[], errors: PreflightError[]): void {
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
}

function validateAddOperationTempId(ctx: ValidationContext, tempId: string): void {
  if (ctx.knownTempIds.has(tempId)) {
    throw new Error(`Duplicate tempId "${tempId}" — each add operation must have a unique tempId`);
  }
  ctx.knownTempIds.add(tempId);
}

function makeValidationSection(op: Extract<CourseOperation, { type: 'add_section' }>): Section {
  return {
    id: op.tempId,
    section_title: op.title,
    section_description: op.description ?? '',
    learning_objectives: [],
    lessons: [],
    estimated_duration_minutes: 0,
  };
}

function makeValidationLesson(op: Extract<CourseOperation, { type: 'add_lesson' }>): Lesson {
  return {
    id: op.tempId,
    lesson_title: op.title,
    lesson_objectives: [],
    key_topics: [],
    estimated_duration_minutes: op.estimatedDuration ?? 15,
  };
}

function applyAddSectionValidation(ctx: ValidationContext): void {
  if (ctx.operation.type !== 'add_section') return;
  const op = ctx.operation;

  validateAddOperationTempId(ctx, op.tempId);

  let insertIndex: number;
  if (op.afterSectionId === null) {
    insertIndex = 0;
  } else {
    const afterSectionIndex = findSectionIndexById(ctx.simulation, op.afterSectionId);
    if (afterSectionIndex === null) {
      throw new Error(`afterSectionId "${op.afterSectionId}" not found`);
    }
    insertIndex = afterSectionIndex + 1;
  }

  ctx.simulation.sections.splice(insertIndex, 0, makeValidationSection(op));
}

function applyAddLessonValidation(ctx: ValidationContext): void {
  if (ctx.operation.type !== 'add_lesson') return;
  const op = ctx.operation;

  validateAddOperationTempId(ctx, op.tempId);

  const parent = findElementById(ctx.simulation, op.parentSectionId);
  if (!parent) {
    throw new Error(`parentSectionId "${op.parentSectionId}" not found in course structure`);
  }
  if (parent.type !== 'section') {
    throw new Error(`parentSectionId "${op.parentSectionId}" is not a valid section`);
  }

  const parentSection = ctx.simulation.sections[parent.sectionIndex];
  let insertIndex = 0;
  if (op.afterLessonId !== null) {
    const afterLesson = findElementById(ctx.simulation, op.afterLessonId);
    if (!afterLesson) {
      throw new Error(`afterLessonId "${op.afterLessonId}" not found in course structure`);
    }
    if (afterLesson.type !== 'lesson') {
      throw new Error(
        `afterLessonId "${op.afterLessonId}" is a ${afterLesson.type}, expected a lesson`
      );
    }
    if (afterLesson.sectionIndex !== parent.sectionIndex) {
      throw new Error(
        `afterLessonId "${op.afterLessonId}" is not in parentSection "${op.parentSectionId}"`
      );
    }
    insertIndex = afterLesson.lessonIndex + 1;
  }

  parentSection.lessons.splice(insertIndex, 0, makeValidationLesson(op));
}

function applyUpdateFieldValidation(ctx: ValidationContext): void {
  if (ctx.operation.type !== 'update_field') return;
  const op = ctx.operation;

  if (!findElementById(ctx.simulation, op.targetId)) {
    throw new Error(`targetId "${op.targetId}" not found in course structure`);
  }

  // Resolve friendly field names to actual field names
  const resolvedFieldName = FRIENDLY_FIELD_NAMES[op.field] || op.field;

  // Validate field value type and size limits
  const validator = FIELD_TYPE_VALIDATORS[resolvedFieldName];
  if (validator && !validator(op.newValue)) {
    throw new Error(
      `Field "${op.field}" has invalid value type or exceeds size limits (resolved to "${resolvedFieldName}")`
    );
  }
}

function applyDeleteValidation(ctx: ValidationContext): number {
  if (ctx.operation.type !== 'delete_element') return 0;
  const op = ctx.operation;

  const target = findElementById(ctx.simulation, op.targetId);
  if (!target) {
    throw new Error(`targetId "${op.targetId}" not found in course structure`);
  }

  if (target.type === 'section') {
    const removedSection = ctx.simulation.sections[target.sectionIndex];
    const removedCount = 1 + removedSection.lessons.length;
    ctx.simulation.sections.splice(target.sectionIndex, 1);
    return removedCount;
  }

  ctx.simulation.sections[target.sectionIndex].lessons.splice(target.lessonIndex, 1);
  return 1;
}

function resolveMoveParentSection(
  simulation: CourseStructure,
  op: Extract<CourseOperation, { type: 'move_element' }>,
  sourceSectionIndex: number
): Section {
  if (!op.newParentId) {
    return simulation.sections[sourceSectionIndex];
  }

  const parent = findElementById(simulation, op.newParentId);
  if (!parent) {
    throw new Error(`newParentId "${op.newParentId}" not found in course structure`);
  }
  if (parent.type !== 'section') {
    throw new Error(`newParentId "${op.newParentId}" is not a valid section`);
  }

  return simulation.sections[parent.sectionIndex];
}

function applyMoveValidation(ctx: ValidationContext): void {
  if (ctx.operation.type !== 'move_element') return;
  const op = ctx.operation;

  if (op.afterId && op.afterId === op.targetId) {
    throw new Error(`afterId "${op.afterId}" cannot equal targetId "${op.targetId}"`);
  }

  const target = findElementById(ctx.simulation, op.targetId);
  if (!target) {
    throw new Error(`targetId "${op.targetId}" not found in structure`);
  }

  if (target.type === 'lesson') {
    const sourceSection = ctx.simulation.sections[target.sectionIndex];
    const [movedLesson] = sourceSection.lessons.splice(target.lessonIndex, 1);
    if (!movedLesson) {
      throw new Error(`targetId "${op.targetId}" not found in structure`);
    }

    const targetSection = resolveMoveParentSection(ctx.simulation, op, target.sectionIndex);

    let insertIndex = 0;
    if (op.afterId !== null) {
      const after = findElementById(ctx.simulation, op.afterId);
      if (!after) {
        throw new Error(`afterId "${op.afterId}" not found in structure`);
      }
      if (after.type !== 'lesson') {
        throw new Error(
          `afterId "${op.afterId}" is a ${after.type}, expected a lesson (target is a lesson)`
        );
      }
      if (ctx.simulation.sections[after.sectionIndex] !== targetSection) {
        throw new Error(
          `afterId "${op.afterId}" is not in the target section "${targetSection.id ?? 'unknown'}"`
        );
      }
      insertIndex = after.lessonIndex + 1;
    }

    targetSection.lessons.splice(insertIndex, 0, movedLesson);
    return;
  }

  if (op.newParentId) {
    if (op.newParentId === op.targetId) {
      throw new Error(`circular relation — cannot move section "${op.targetId}" into itself`);
    }

    const newParent = findElementById(ctx.simulation, op.newParentId);
    if (!newParent) {
      throw new Error(`newParentId "${op.newParentId}" not found in course structure`);
    }
    if (newParent.type !== 'section') {
      throw new Error(`newParentId "${op.newParentId}" is not a valid section`);
    }
  }

  const [movedSection] = ctx.simulation.sections.splice(target.sectionIndex, 1);
  if (!movedSection) {
    throw new Error(`targetId "${op.targetId}" not found in structure`);
  }

  let insertIndex = 0;
  if (op.afterId !== null) {
    const after = findElementById(ctx.simulation, op.afterId);
    if (!after) {
      throw new Error(`afterId "${op.afterId}" not found in structure`);
    }
    if (after.type !== 'section') {
      throw new Error(
        `afterId "${op.afterId}" is a ${after.type}, expected a section (target is a section)`
      );
    }
    insertIndex = after.sectionIndex + 1;
  }

  ctx.simulation.sections.splice(insertIndex, 0, movedSection);
}

export function validateOperations(
  operations: CourseOperation[],
  structure: CourseStructure
): PreflightError[] {
  const errors: PreflightError[] = [];
  validateBatchConstraints(operations, errors);

  const simulation = deepClone(structure);
  const knownTempIds = new Set<string>();
  const initialElementCount = countElements(structure);
  let deletedElements = 0;

  for (let operationIndex = 0; operationIndex < operations.length; operationIndex++) {
    const ctx: ValidationContext = {
      operation: operations[operationIndex],
      operationIndex,
      simulation,
      knownTempIds,
      errors,
    };

    try {
      switch (ctx.operation.type) {
        case 'add_lesson':
          applyAddLessonValidation(ctx);
          break;

        case 'add_section':
          applyAddSectionValidation(ctx);
          break;

        case 'update_field':
          applyUpdateFieldValidation(ctx);
          break;

        case 'delete_element':
          deletedElements += applyDeleteValidation(ctx);
          break;

        case 'move_element':
          applyMoveValidation(ctx);
          break;

        default: {
          const _exhaustive: never = ctx.operation;
          throw new Error(`Unknown operation type: ${(_exhaustive as { type: string }).type}`);
        }
      }
    } catch (error) {
      addError(ctx, error instanceof Error ? error.message : String(error));
    }
  }

  if (initialElementCount > 0 && deletedElements / initialElementCount > MAX_DELETE_CONTENT_RATIO) {
    errors.push({
      operationIndex: -1,
      operationType: 'batch',
      message: `Delete operations would remove >${Math.round(MAX_DELETE_CONTENT_RATIO * 100)}% of content (${deletedElements} elements affected out of ${initialElementCount} total)`,
    });
  }

  return errors;
}
