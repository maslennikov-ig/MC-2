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
import { nestedJsonToCourseNodes } from './converters.js';
import { isDualWriteEnabled } from './feature-flags.js';

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

  if (nodes.length === 0) {
    log.debug({ courseId }, 'course_nodes dual-write: no nodes to write (empty structure)');
    return;
  }

  // Delete existing nodes for this course
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
}
