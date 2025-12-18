/**
 * Course Structure Editor - Immutable PATCH operations with recalculation
 *
 * Handles PATCH operations on Stage 5 CourseStructure JSON with:
 * 1. Duration recalculation when lesson durations change
 * 2. Lesson renumbering when lessons are added/deleted/reordered
 * 3. Immutable updates using structured cloning pattern
 *
 * @module course-structure-editor
 * @see specs/008-generation-generation-json/data-model.md
 */

import type { CourseStructure, Section, Lesson } from '@megacampus/shared-types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of applying a patch to course structure
 */
export interface PatchResult {
  /** Updated course structure (immutable copy) */
  updatedStructure: CourseStructure;

  /** Recalculated values */
  recalculated: {
    /** Section duration recalculated (path to section) */
    sectionDuration?: number;

    /** Course duration recalculated (hours) */
    courseDuration?: number;

    /** Lesson numbers recalculated (path -> new number) */
    lessonNumbers?: Record<string, number>;
  };
}

/**
 * Parsed field path components
 */
interface ParsedPath {
  /** Array of path segments */
  segments: PathSegment[];
}

/**
 * Path segment (property or array index)
 */
type PathSegment = {
  type: 'property';
  name: string;
} | {
  type: 'array';
  name: string;
  index: number;
};

// ============================================================================
// PATH PARSING
// ============================================================================

/**
 * Parse a field path into segments
 *
 * Examples:
 * - "sections[0].section_title" -> [array(sections, 0), property(section_title)]
 * - "sections[0].lessons[2].lesson_title" -> [array(sections, 0), array(lessons, 2), property(lesson_title)]
 *
 * @param fieldPath - Path like "sections[0].lessons[2].lesson_title"
 * @returns Parsed path segments
 */
function parsePath(fieldPath: string): ParsedPath {
  const segments: PathSegment[] = [];

  // Split by dots, but keep array indices attached
  const parts = fieldPath.split('.');

  for (const part of parts) {
    // Check if this part has an array index: "sections[0]"
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);

    if (arrayMatch) {
      const [, name, indexStr] = arrayMatch;
      segments.push({
        type: 'array',
        name,
        index: parseInt(indexStr, 10),
      });
    } else {
      // Regular property: "section_title"
      segments.push({
        type: 'property',
        name: part,
      });
    }
  }

  return { segments };
}

/**
 * Get section and lesson indices from parsed path
 *
 * @param path - Parsed path
 * @returns Section index and optional lesson index
 */
function getIndicesFromPath(path: ParsedPath): { sectionIndex?: number; lessonIndex?: number } {
  let sectionIndex: number | undefined;
  let lessonIndex: number | undefined;

  for (let i = 0; i < path.segments.length; i++) {
    const segment = path.segments[i];

    if (segment.type === 'array') {
      if (segment.name === 'sections') {
        sectionIndex = segment.index;
      } else if (segment.name === 'lessons') {
        lessonIndex = segment.index;
      }
    }
  }

  return { sectionIndex, lessonIndex };
}

/**
 * Set value at path in object (immutable)
 *
 * @param obj - Object to update
 * @param path - Parsed path
 * @param value - New value
 * @returns New object with value set
 */
function setAtPath(obj: unknown, path: ParsedPath, value: unknown): unknown {
  if (path.segments.length === 0) {
    return value;
  }

  const [firstSegment, ...restSegments] = path.segments;

  if (firstSegment.type === 'property') {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      throw new Error(`Cannot set property "${firstSegment.name}" on non-object`);
    }

    return {
      ...(obj as Record<string, unknown>),
      [firstSegment.name]: setAtPath(
        (obj as Record<string, unknown>)[firstSegment.name],
        { segments: restSegments },
        value
      ),
    };
  } else {
    // Array segment
    if (!Array.isArray(obj)) {
      throw new Error(`Expected array at "${firstSegment.name}"`);
    }

    const newArray = [...obj];
    newArray[firstSegment.index] = setAtPath(
      newArray[firstSegment.index],
      { segments: restSegments },
      value
    );

    return newArray;
  }
}

// ============================================================================
// DURATION CALCULATION
// ============================================================================

/**
 * Recalculate section duration from lesson durations
 *
 * Section duration is the sum of all lesson durations within that section.
 *
 * @param section - Section to calculate
 * @returns Total duration in minutes
 */
export function recalculateSectionDuration(section: Section): number {
  return section.lessons.reduce(
    (sum, lesson) => sum + lesson.estimated_duration_minutes,
    0
  );
}

/**
 * Recalculate total course duration in hours
 *
 * Course duration is the sum of all section durations, converted to hours.
 *
 * @param structure - Course structure
 * @returns Total duration in hours (rounded to 2 decimal places)
 */
export function recalculateCourseDuration(structure: CourseStructure): number {
  const totalMinutes = structure.sections.reduce(
    (sum, section) => sum + section.estimated_duration_minutes,
    0
  );

  // Convert to hours and round to 2 decimal places
  return Math.round((totalMinutes / 60) * 100) / 100;
}

// ============================================================================
// LESSON NUMBERING
// ============================================================================

/**
 * Renumber all lessons after add/delete/reorder
 *
 * Lesson numbering format: section_number.lesson_index
 * Example: Section 1 has lessons 1.1, 1.2, 1.3
 *          Section 2 has lessons 2.1, 2.2
 *
 * @param structure - Course structure
 * @returns Map of path -> new lesson_number (e.g., "sections[0].lessons[0]" -> 1.1)
 */
export function renumberLessons(structure: CourseStructure): Record<string, number> {
  const renumbering: Record<string, number> = {};

  structure.sections.forEach((section, sectionIdx) => {
    section.lessons.forEach((_lesson, lessonIdx) => {
      // Lesson number format: section_number.lesson_index (e.g., 1.1, 1.2, 2.1)
      const lessonNumber = parseFloat(`${section.section_number}.${lessonIdx + 1}`);
      const path = `sections[${sectionIdx}].lessons[${lessonIdx}]`;

      renumbering[path] = lessonNumber;
    });
  });

  return renumbering;
}

/**
 * Apply lesson renumbering to structure (immutable)
 *
 * @param structure - Course structure
 * @param renumbering - Map of path -> lesson_number
 * @returns New structure with updated lesson numbers
 */
function applyLessonRenumbering(
  structure: CourseStructure,
  renumbering: Record<string, number>
): CourseStructure {
  // Deep clone the structure to avoid mutations
  const updatedSections = structure.sections.map((section, sectionIdx) => ({
    ...section,
    lessons: section.lessons.map((lesson, lessonIdx) => {
      const path = `sections[${sectionIdx}].lessons[${lessonIdx}]`;
      const newNumber = renumbering[path];

      if (newNumber !== undefined) {
        return { ...lesson, lesson_number: newNumber };
      }

      return lesson;
    }),
  }));

  return {
    ...structure,
    sections: updatedSections,
  };
}

// ============================================================================
// FIELD UPDATE
// ============================================================================

/**
 * Apply a field update to course structure with recalculation
 *
 * Automatically handles:
 * - Immutable updates using structured cloning
 * - Duration recalculation when estimated_duration_minutes changes
 * - Lesson renumbering when needed
 *
 * @param structure - Current course structure
 * @param fieldPath - Path like "sections[0].lessons[2].lesson_title"
 * @param value - New value
 * @returns PatchResult with updated structure and recalculated values
 *
 * @example
 * ```typescript
 * // Update lesson title
 * const result = applyFieldUpdate(
 *   structure,
 *   "sections[0].lessons[2].lesson_title",
 *   "Introduction to React Hooks"
 * );
 *
 * // Update lesson duration (triggers recalculation)
 * const result2 = applyFieldUpdate(
 *   structure,
 *   "sections[0].lessons[2].estimated_duration_minutes",
 *   30
 * );
 * console.log(result2.recalculated.sectionDuration); // e.g., 90
 * console.log(result2.recalculated.courseDuration); // e.g., 4.5
 * ```
 */
export function applyFieldUpdate(
  structure: CourseStructure,
  fieldPath: string,
  value: unknown
): PatchResult {
  const parsedPath = parsePath(fieldPath);
  const { sectionIndex } = getIndicesFromPath(parsedPath);

  // Apply the field update immutably
  let updatedStructure = setAtPath(structure, parsedPath, value) as CourseStructure;

  const recalculated: PatchResult['recalculated'] = {};

  // Check if duration field was modified
  if (fieldPath.includes('estimated_duration_minutes')) {
    // Recalculate section duration
    if (sectionIndex !== undefined) {
      const section = updatedStructure.sections[sectionIndex];
      const newSectionDuration = recalculateSectionDuration(section);

      // Update section duration
      updatedStructure = {
        ...updatedStructure,
        sections: updatedStructure.sections.map((s, idx) =>
          idx === sectionIndex
            ? { ...s, estimated_duration_minutes: newSectionDuration }
            : s
        ),
      };

      recalculated.sectionDuration = newSectionDuration;
    }

    // Recalculate course duration
    const newCourseDuration = recalculateCourseDuration(updatedStructure);
    updatedStructure = {
      ...updatedStructure,
      estimated_duration_hours: newCourseDuration,
    };

    recalculated.courseDuration = newCourseDuration;
  }

  return {
    updatedStructure,
    recalculated,
  };
}

// ============================================================================
// DELETE ELEMENT
// ============================================================================

/**
 * Delete a lesson or section
 *
 * Automatically handles:
 * - Immutable deletion from array
 * - Lesson renumbering after deletion
 * - Duration recalculation after deletion
 *
 * @param structure - Current course structure
 * @param elementPath - Path to element (e.g., "sections[0].lessons[2]" or "sections[1]")
 * @returns PatchResult with updated structure
 *
 * @example
 * ```typescript
 * // Delete a lesson
 * const result = deleteElement(structure, "sections[0].lessons[2]");
 * console.log(result.recalculated.lessonNumbers); // Updated lesson numbers
 *
 * // Delete a section
 * const result2 = deleteElement(structure, "sections[1]");
 * ```
 */
export function deleteElement(
  structure: CourseStructure,
  elementPath: string
): PatchResult {
  const parsedPath = parsePath(elementPath);
  const { sectionIndex, lessonIndex } = getIndicesFromPath(parsedPath);

  let updatedStructure = structure;
  const recalculated: PatchResult['recalculated'] = {};

  if (lessonIndex !== undefined && sectionIndex !== undefined) {
    // Delete lesson from section
    updatedStructure = {
      ...updatedStructure,
      sections: updatedStructure.sections.map((section, idx) => {
        if (idx === sectionIndex) {
          const newLessons = section.lessons.filter((_, lessonIdx) => lessonIdx !== lessonIndex);
          return { ...section, lessons: newLessons };
        }
        return section;
      }),
    };

    // Recalculate section duration
    const section = updatedStructure.sections[sectionIndex];
    const newSectionDuration = recalculateSectionDuration(section);
    updatedStructure = {
      ...updatedStructure,
      sections: updatedStructure.sections.map((s, idx) =>
        idx === sectionIndex
          ? { ...s, estimated_duration_minutes: newSectionDuration }
          : s
      ),
    };
    recalculated.sectionDuration = newSectionDuration;

    // Renumber lessons
    const renumbering = renumberLessons(updatedStructure);
    updatedStructure = applyLessonRenumbering(updatedStructure, renumbering);
    recalculated.lessonNumbers = renumbering;

  } else if (sectionIndex !== undefined) {
    // Delete entire section
    updatedStructure = {
      ...updatedStructure,
      sections: updatedStructure.sections.filter((_, idx) => idx !== sectionIndex),
    };

    // Renumber lessons (if any sections remain)
    if (updatedStructure.sections.length > 0) {
      const renumbering = renumberLessons(updatedStructure);
      updatedStructure = applyLessonRenumbering(updatedStructure, renumbering);
      recalculated.lessonNumbers = renumbering;
    }
  } else {
    throw new Error(`Invalid element path for deletion: ${elementPath}`);
  }

  // Recalculate course duration
  const newCourseDuration = recalculateCourseDuration(updatedStructure);
  updatedStructure = {
    ...updatedStructure,
    estimated_duration_hours: newCourseDuration,
  };
  recalculated.courseDuration = newCourseDuration;

  return {
    updatedStructure,
    recalculated,
  };
}

// ============================================================================
// ADD ELEMENT
// ============================================================================

/**
 * Add a lesson or section at specified position
 *
 * Automatically handles:
 * - Immutable insertion into array
 * - Lesson renumbering after addition
 * - Duration recalculation after addition
 *
 * @param structure - Current course structure
 * @param parentPath - Path to parent (e.g., "sections[0].lessons" or "sections")
 * @param element - Lesson or Section to add
 * @param position - Position to insert ('start', 'end', or numeric index)
 * @returns PatchResult with updated structure
 *
 * @example
 * ```typescript
 * // Add lesson at end of section
 * const newLesson: Lesson = {
 *   lesson_number: 0, // Will be recalculated
 *   lesson_title: "New Lesson",
 *   // ... other fields
 * };
 * const result = addElement(structure, "sections[0].lessons", newLesson, "end");
 *
 * // Add lesson at start
 * const result2 = addElement(structure, "sections[0].lessons", newLesson, "start");
 *
 * // Add lesson at specific position
 * const result3 = addElement(structure, "sections[0].lessons", newLesson, 2);
 * ```
 */
export function addElement(
  structure: CourseStructure,
  parentPath: string,
  element: Lesson | Section,
  position: 'start' | 'end' | number
): PatchResult {
  const parsedPath = parsePath(parentPath);
  const { sectionIndex } = getIndicesFromPath(parsedPath);

  let updatedStructure = structure;
  const recalculated: PatchResult['recalculated'] = {};

  // Determine if we're adding a lesson or section
  const isLesson = 'lesson_number' in element;

  if (isLesson && sectionIndex !== undefined) {
    // Add lesson to section
    updatedStructure = {
      ...updatedStructure,
      sections: updatedStructure.sections.map((section, idx) => {
        if (idx === sectionIndex) {
          const newLessons = [...section.lessons];

          if (position === 'start') {
            newLessons.unshift(element);
          } else if (position === 'end') {
            newLessons.push(element);
          } else {
            newLessons.splice(position, 0, element);
          }

          return { ...section, lessons: newLessons };
        }
        return section;
      }),
    };

    // Recalculate section duration
    const section = updatedStructure.sections[sectionIndex];
    const newSectionDuration = recalculateSectionDuration(section);
    updatedStructure = {
      ...updatedStructure,
      sections: updatedStructure.sections.map((s, idx) =>
        idx === sectionIndex
          ? { ...s, estimated_duration_minutes: newSectionDuration }
          : s
      ),
    };
    recalculated.sectionDuration = newSectionDuration;

    // Renumber lessons
    const renumbering = renumberLessons(updatedStructure);
    updatedStructure = applyLessonRenumbering(updatedStructure, renumbering);
    recalculated.lessonNumbers = renumbering;

  } else if (!isLesson) {
    // Add section
    const newSections = [...updatedStructure.sections];

    if (position === 'start') {
      newSections.unshift(element);
    } else if (position === 'end') {
      newSections.push(element);
    } else {
      newSections.splice(position, 0, element);
    }

    updatedStructure = {
      ...updatedStructure,
      sections: newSections,
    };

    // Renumber lessons (all sections)
    const renumbering = renumberLessons(updatedStructure);
    updatedStructure = applyLessonRenumbering(updatedStructure, renumbering);
    recalculated.lessonNumbers = renumbering;
  } else {
    throw new Error(`Invalid parent path for addition: ${parentPath}`);
  }

  // Recalculate course duration
  const newCourseDuration = recalculateCourseDuration(updatedStructure);
  updatedStructure = {
    ...updatedStructure,
    estimated_duration_hours: newCourseDuration,
  };
  recalculated.courseDuration = newCourseDuration;

  return {
    updatedStructure,
    recalculated,
  };
}
