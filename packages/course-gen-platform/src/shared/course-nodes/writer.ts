/**
 * Dual-write service for course_nodes table.
 *
 * Phase 4 migration: when COURSE_NODES_DUAL_WRITE_ENABLED=true, every write
 * to courses.course_structure is mirrored to the flat course_nodes table.
 *
 * The operation is idempotent (delete-then-insert) and non-fatal: errors are
 * logged but never thrown to callers, so the main pipeline is not affected.
 *
 * @module course-nodes/writer
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, CourseStructure } from '@megacampus/shared-types';
import type { Logger } from 'pino';
import { nestedJsonToCourseNodes, courseNodesToNestedJson } from './converters.js';
import { isDualWriteEnabled, isStableIdsRequired } from './feature-flags.js';
import { checkStructureParity } from './parity-checker.js';
import type { CourseNodeRow } from './types.js';

/**
 * Write course structure to the course_nodes table (dual-write).
 *
 * Deletes existing nodes for the course, then batch-inserts new ones.
 * This is idempotent: calling twice with the same structure produces
 * the same result.
 *
 * Non-fatal: errors are logged but do not throw. Callers should still
 * wrap in `.catch()` as a safety net.
 *
 * @param courseId   UUID of the course
 * @param structure  Nested CourseStructure (must have stable IDs already)
 * @param supabase   Supabase admin client
 * @param log        Pino logger (child logger with job context preferred)
 */
export async function writeCourseNodes(
  courseId: string,
  structure: CourseStructure,
  supabase: SupabaseClient<Database>,
  log: Logger
): Promise<void> {
  if (!isDualWriteEnabled()) return;

  const startTime = Date.now();

  // Guard: when COURSE_STABLE_IDS_REQUIRED=true, reject structures without IDs (plan:433)
  if (isStableIdsRequired()) {
    const hasAllIds = structure.sections?.every(
      s => s.id?.startsWith('sec_') && s.lessons?.every(l => l.id?.startsWith('lsn_'))
    );
    if (!hasAllIds) {
      const err =
        'course_nodes dual-write: structure missing stable IDs (COURSE_STABLE_IDS_REQUIRED=true)';
      log.error({ courseId }, err);
      throw new Error(err);
    }
  }

  // Convert nested JSON to flat rows
  let nodes;
  try {
    nodes = nestedJsonToCourseNodes(courseId, structure);
  } catch (convertError) {
    log.warn(
      {
        courseId,
        error: convertError instanceof Error ? convertError.message : String(convertError),
      },
      'course_nodes dual-write: conversion failed'
    );
    return;
  }

  // Delete existing nodes for this course (always, even if new structure is empty)
  const { error: deleteError } = await supabase
    .from('course_nodes')
    .delete()
    .eq('course_id', courseId);

  if (deleteError) {
    log.warn(
      { courseId, error: deleteError.message },
      'course_nodes dual-write: failed to delete existing nodes'
    );
    return;
  }

  if (nodes.length === 0) {
    log.debug(
      { courseId },
      'course_nodes dual-write: no nodes to write (empty structure), stale rows cleared'
    );
    return;
  }

  // Batch insert new nodes
  const { error: insertError } = await supabase.from('course_nodes').insert(nodes);

  if (insertError) {
    log.warn(
      { courseId, error: insertError.message, nodeCount: nodes.length },
      'course_nodes dual-write: failed to insert nodes'
    );
    return;
  }

  const elapsed = Date.now() - startTime;
  log.info({ courseId, nodeCount: nodes.length, elapsed }, 'course_nodes dual-write: success');

  // Optional parity check: read back and compare (non-fatal, gated by env flag)
  if (process.env.COURSE_NODES_PARITY_CHECK_ENABLED === 'true') {
    try {
      const { data: writtenNodes } = await supabase
        .from('course_nodes')
        .select('*')
        .eq('course_id', courseId);

      if (writtenNodes && writtenNodes.length > 0) {
        const meta = {
          course_title: structure.course_title,
          course_description: structure.course_description,
          course_overview: structure.course_overview,
          target_audience: structure.target_audience,
          estimated_duration_hours: structure.estimated_duration_hours,
          difficulty_level: structure.difficulty_level,
          prerequisites: structure.prerequisites ?? [],
          learning_outcomes: structure.learning_outcomes ?? [],
          course_tags: structure.course_tags ?? [],
          schema_version: (structure as Record<string, unknown>).schema_version as
            | number
            | undefined,
        };
        const reconstructed = courseNodesToNestedJson(writtenNodes as CourseNodeRow[], meta);
        const parity = checkStructureParity(structure, reconstructed);

        if (!parity.isEqual) {
          log.warn(
            {
              courseId,
              differenceCount: parity.differences.length,
              differences: parity.differences.slice(0, 5),
              sectionCount: parity.sectionCount,
              lessonCount: parity.lessonCount,
            },
            'course_nodes parity check FAILED — structure mismatch after dual-write'
          );
        } else {
          log.debug({ courseId }, 'course_nodes parity check passed');
        }
      }
    } catch (parityError) {
      log.debug(
        {
          courseId,
          error: parityError instanceof Error ? parityError.message : String(parityError),
        },
        'course_nodes parity check skipped (error)'
      );
    }
  }
}
