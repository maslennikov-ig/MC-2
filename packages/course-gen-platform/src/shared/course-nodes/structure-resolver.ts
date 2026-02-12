/**
 * Structure Resolver — Phase 4 read-path abstraction.
 *
 * When COURSE_NODES_READ_ENABLED=true, reads from course_nodes table
 * and reconstructs CourseStructure. Otherwise falls back to JSONB.
 *
 * Course-level metadata (title, description, tags, etc.) is always
 * extracted from the JSONB, since it lives on the `courses` row and
 * not inside course_nodes.
 *
 * @module course-nodes/structure-resolver
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, CourseStructure } from '@megacampus/shared-types';
import type { CourseNodeRow } from './types';
import type { CourseMetaFields } from './converters';
import { courseNodesToNestedJson } from './converters';
import { isReadFromNodesEnabled } from './feature-flags';

/**
 * Extract CourseMetaFields from a CourseStructure JSONB.
 * These are course-level fields that are NOT stored in course_nodes.
 */
function extractCourseMeta(structure: CourseStructure): CourseMetaFields {
  return {
    course_title: structure.course_title,
    course_description: structure.course_description,
    course_overview: structure.course_overview,
    target_audience: structure.target_audience,
    estimated_duration_hours: structure.estimated_duration_hours,
    difficulty_level: structure.difficulty_level,
    prerequisites: structure.prerequisites ?? [],
    learning_outcomes: structure.learning_outcomes ?? [],
    course_tags: structure.course_tags ?? [],
  };
}

/**
 * Resolve course structure from the active source.
 *
 * - If COURSE_NODES_READ_ENABLED=true AND course_nodes rows exist, reads
 *   sections/lessons from course_nodes and merges with course-level meta
 *   from JSONB.
 * - Otherwise, returns the JSONB course_structure as-is.
 *
 * @param courseId            UUID of the course
 * @param courseStructureJson The current JSONB value (always needed for meta / fallback)
 * @param supabase           Supabase admin client
 * @returns CourseStructure from the active source, or null
 */
export async function resolveStructure(
  courseId: string,
  courseStructureJson: unknown,
  supabase: SupabaseClient<Database>
): Promise<CourseStructure | null> {
  const jsonStructure = courseStructureJson as CourseStructure | null;

  // Feature flag off → use JSONB
  if (!isReadFromNodesEnabled()) {
    return jsonStructure ?? null;
  }

  // Need JSONB for course-level meta even when reading nodes
  if (!jsonStructure) {
    return null;
  }

  // Try reading from course_nodes
  const { data: nodes, error } = await supabase
    .from('course_nodes')
    .select('*')
    .eq('course_id', courseId);

  if (error || !nodes || nodes.length === 0) {
    // Graceful fallback: no nodes yet → use JSONB
    return jsonStructure;
  }

  const meta = extractCourseMeta(jsonStructure);
  return courseNodesToNestedJson(nodes as CourseNodeRow[], meta);
}

/**
 * Check whether a resolved course structure is available.
 *
 * Lightweight sync check — does NOT query DB. Just verifies that JSONB
 * exists (which is always needed, even when nodes are the primary source,
 * because course-level meta comes from JSONB).
 *
 * @param courseStructureJson The JSONB column value
 * @returns true if course_structure data is available
 */
export function hasResolvedStructure(courseStructureJson: unknown): boolean {
  return courseStructureJson != null;
}
