/**
 * Bidirectional Converters: nested JSONB <-> flat course_nodes rows
 *
 * Phase 4 migration utilities that convert between the legacy nested
 * CourseStructure (stored in courses.course_structure JSONB) and the
 * new flat course_nodes table with fractional-indexing order keys.
 *
 * @module course-nodes/converters
 */

import type {
  CourseStructure,
  Section,
  Lesson,
  LearningObjective,
  Json,
} from '@megacampus/shared-types';

import type { CourseNodeInsert, CourseNodeRow, SectionNodeData, LessonNodeData } from './types';
import { generateInitialOrderKeys } from './order-keys';

// ---------------------------------------------------------------------------
// CourseMetaFields — course-level data NOT stored in nodes
// ---------------------------------------------------------------------------

/**
 * Course-level metadata fields that live on the `courses` table row,
 * not inside course_nodes.  Required when reconstructing a full
 * CourseStructure from flat nodes.
 */
export interface CourseMetaFields {
  course_title: string;
  course_description: string;
  course_overview?: string;
  target_audience?: string;
  estimated_duration_hours: number;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  prerequisites: string[];
  learning_outcomes: LearningObjective[];
  course_tags: string[];
  schema_version?: number;
}

// ---------------------------------------------------------------------------
// nestedJsonToCourseNodes
// ---------------------------------------------------------------------------

/**
 * Convert a nested CourseStructure into flat CourseNodeInsert rows.
 *
 * Precondition: every section and lesson MUST already have a stable `id`
 * (assigned by `ensureStableIdsInMemory`).  Throws if any ID is missing.
 *
 * @param courseId  UUID of the parent course row
 * @param structure Nested CourseStructure with IDs
 * @returns Array of CourseNodeInsert rows (sections first, then their lessons)
 */
export function nestedJsonToCourseNodes(
  courseId: string,
  structure: CourseStructure
): CourseNodeInsert[] {
  const { sections } = structure;

  if (!sections || sections.length === 0) {
    return [];
  }

  const sectionOrderKeys = generateInitialOrderKeys(sections.length);
  const nodes: CourseNodeInsert[] = [];

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];

    if (!section.id) {
      throw new Error(
        `Section at index ${si} ("${section.section_title}") is missing a stable id. ` +
          'Run ensureStableIdsInMemory before converting to course_nodes.'
      );
    }

    const sectionData: SectionNodeData = {
      section_number: section.section_number,
      section_description: section.section_description,
      learning_objectives: section.learning_objectives,
      estimated_duration_minutes: section.estimated_duration_minutes,
    };

    nodes.push({
      id: section.id,
      course_id: courseId,
      parent_id: null,
      node_type: 'section',
      order_key: sectionOrderKeys[si],
      title: section.section_title,
      data: sectionData as unknown as Json,
    });

    // Lessons inside this section
    const { lessons } = section;
    if (!lessons || lessons.length === 0) continue;

    const lessonOrderKeys = generateInitialOrderKeys(lessons.length);

    for (let li = 0; li < lessons.length; li++) {
      const lesson = lessons[li];

      if (!lesson.id) {
        throw new Error(
          `Lesson at index ${li} in section "${section.section_title}" is missing a stable id. ` +
            'Run ensureStableIdsInMemory before converting to course_nodes.'
        );
      }

      const lessonData: LessonNodeData = {
        lesson_number: lesson.lesson_number,
        lesson_objectives: lesson.lesson_objectives,
        key_topics: lesson.key_topics,
        estimated_duration_minutes: lesson.estimated_duration_minutes,
        difficulty_level: lesson.difficulty_level,
      };

      nodes.push({
        id: lesson.id,
        course_id: courseId,
        parent_id: section.id,
        node_type: 'lesson',
        order_key: lessonOrderKeys[li],
        title: lesson.lesson_title,
        data: lessonData as unknown as Json,
      });
    }
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// courseNodesToNestedJson
// ---------------------------------------------------------------------------

/**
 * Reconstruct a nested CourseStructure from flat course_nodes rows
 * plus course-level metadata.
 *
 * - Sections and lessons are sorted by `order_key` (lexicographic).
 * - `section_number` is reassigned as 1-based index.
 * - `lesson_number` is reassigned as global sequential (1.1, 1.2, 2.1 ...).
 * - `section.estimated_duration_minutes` is recalculated as sum of lessons.
 * - `courseMeta.estimated_duration_hours` is recalculated as total / 60.
 *
 * @param nodes     All course_nodes rows for a single course
 * @param courseMeta Course-level fields not stored in nodes
 * @returns Fully reconstructed CourseStructure
 */
export function courseNodesToNestedJson(
  nodes: CourseNodeRow[],
  courseMeta: CourseMetaFields
): CourseStructure {
  // Partition and sort
  const sectionNodes = nodes
    .filter(n => n.node_type === 'section')
    .sort((a, b) => a.order_key.localeCompare(b.order_key));

  const lessonNodes = nodes.filter(n => n.node_type === 'lesson');

  // Index lessons by parent_id for O(1) lookup
  const lessonsByParent = new Map<string, CourseNodeRow[]>();
  for (const ln of lessonNodes) {
    const parentId = ln.parent_id ?? '__orphan__';
    const existing = lessonsByParent.get(parentId) ?? [];
    existing.push(ln);
    lessonsByParent.set(parentId, existing);
  }

  // Sort each group of lessons by order_key
  for (const group of lessonsByParent.values()) {
    group.sort((a, b) => a.order_key.localeCompare(b.order_key));
  }

  let totalDurationMinutes = 0;

  const sections: Section[] = sectionNodes.map((sNode, sIdx) => {
    const sData = sNode.data as unknown as SectionNodeData;
    const childLessons = lessonsByParent.get(sNode.id) ?? [];

    const lessons: Lesson[] = childLessons.map((lNode, lIdx) => {
      const lData = lNode.data as unknown as LessonNodeData;

      return {
        id: lNode.id,
        lesson_number: lIdx + 1,
        lesson_title: lNode.title,
        lesson_objectives: lData.lesson_objectives ?? [],
        key_topics: lData.key_topics ?? [],
        estimated_duration_minutes: lData.estimated_duration_minutes ?? 0,
        difficulty_level: lData.difficulty_level as Lesson['difficulty_level'],
      };
    });

    const sectionDuration = lessons.reduce((sum, l) => sum + l.estimated_duration_minutes, 0);
    totalDurationMinutes += sectionDuration;

    return {
      id: sNode.id,
      section_number: sIdx + 1,
      section_title: sNode.title,
      section_description: sData.section_description ?? '',
      learning_objectives: sData.learning_objectives ?? [],
      lessons,
      estimated_duration_minutes: sectionDuration,
    };
  });

  return {
    course_title: courseMeta.course_title,
    course_description: courseMeta.course_description,
    course_overview: courseMeta.course_overview,
    target_audience: courseMeta.target_audience,
    estimated_duration_hours:
      totalDurationMinutes > 0
        ? Math.round((totalDurationMinutes / 60) * 100) / 100
        : courseMeta.estimated_duration_hours,
    difficulty_level: courseMeta.difficulty_level,
    prerequisites: courseMeta.prerequisites,
    learning_outcomes: courseMeta.learning_outcomes,
    course_tags: courseMeta.course_tags,
    ...(courseMeta.schema_version != null && { schema_version: courseMeta.schema_version }),
    sections,
  };
}
