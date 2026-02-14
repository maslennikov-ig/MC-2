/**
 * Structure Resolver — Phase 4 read-path abstraction.
 *
 * When COURSE_NODES_READ_ENABLED=true, reads from course_nodes table
 * and reconstructs CourseStructure. Otherwise falls back to JSONB.
 *
 * Course-level metadata (title, description, tags, etc.) is primarily
 * extracted from JSONB; when JSONB is absent but nodes exist, a safe
 * fallback metadata envelope is synthesized.
 *
 * @module course-nodes/structure-resolver
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, CourseStructure } from '@megacampus/shared-types';
import type { CourseNodeRow } from './types';
import type { CourseMetaFields } from './converters';
import { courseNodesToNestedJson } from './converters';
import { isReadFromNodesEnabled } from './feature-flags';
import { checkStructureParity } from './parity-checker';
import { logger } from '../logger/index.js';

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
    schema_version: (structure as Record<string, unknown>).schema_version as number | undefined,
  };
}

function buildFallbackMetaFromNodes(nodes: CourseNodeRow[]): CourseMetaFields {
  const sectionCount = nodes.filter(node => node.node_type === 'section').length;
  return {
    course_title: sectionCount > 0 ? `Курс (${sectionCount} секций)` : 'Курс',
    course_description: 'Структура курса восстановлена из course_nodes.',
    course_overview: undefined,
    target_audience: undefined,
    estimated_duration_hours: 0,
    difficulty_level: 'beginner',
    prerequisites: [],
    learning_outcomes: [],
    course_tags: [],
    schema_version: 2,
  };
}

/**
 * Resolve course structure from the active source.
 *
 * - If COURSE_NODES_READ_ENABLED=true AND course_nodes rows exist, reads
 *   sections/lessons from course_nodes and merges with course-level meta
 *   from JSONB when available, otherwise uses synthesized fallback meta.
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

  // Try reading from course_nodes
  const { data: nodes, error } = await supabase
    .from('course_nodes')
    .select('*')
    .eq('course_id', courseId);

  if (error || !nodes || nodes.length === 0) {
    // Graceful fallback: no nodes yet → use JSONB if present
    return jsonStructure ?? null;
  }

  const meta = jsonStructure ? extractCourseMeta(jsonStructure) : buildFallbackMetaFromNodes(nodes);
  const reconstructed = courseNodesToNestedJson(nodes as CourseNodeRow[], meta);

  if (jsonStructure) {
    const parity = checkStructureParity(jsonStructure, reconstructed);
    if (!parity.isEqual) {
      logger.warn(
        {
          courseId,
          differenceCount: parity.differences.length,
          differences: parity.differences.slice(0, 5),
          sectionCount: parity.sectionCount,
          lessonCount: parity.lessonCount,
        },
        'course_nodes read parity mismatch, falling back to JSONB course_structure'
      );
      return jsonStructure;
    }
  } else {
    logger.warn(
      {
        courseId,
        nodeCount: nodes.length,
      },
      'course_nodes read path used without JSONB fallback metadata'
    );
  }

  return reconstructed;
}

/**
 * Check whether a resolved course structure is available.
 *
 * Lightweight sync check — does NOT query DB. When read-from-nodes is
 * enabled, this returns true even if JSONB is absent because structure
 * may still be recoverable from course_nodes.
 *
 * @param courseStructureJson The JSONB column value
 * @returns true if course_structure data is available
 */
export function hasResolvedStructure(courseStructureJson: unknown): boolean {
  return courseStructureJson != null || isReadFromNodesEnabled();
}
