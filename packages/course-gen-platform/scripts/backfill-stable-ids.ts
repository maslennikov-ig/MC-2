#!/usr/bin/env tsx
/**
 * Backfill Stable IDs for Course Structures
 * @module scripts/backfill-stable-ids
 *
 * One-time migration script that ensures all sections and lessons
 * in existing course_structure JSON have stable IDs (sec_* / lsn_*).
 *
 * - Reads courses in batches of 50
 * - Applies ensureStableIdsInMemory() to each course_structure
 * - Skips courses where all IDs are already present
 * - Uses optimistic concurrency (updated_at check) to avoid overwriting
 *   concurrent modifications
 *
 * Usage:
 *   pnpm tsx scripts/backfill-stable-ids.ts
 */

import 'dotenv/config';
import { getSupabaseAdmin } from '../src/shared/supabase/admin';
import { ensureStableIdsInMemory } from '../src/stages/stage5-generation/utils/course-structure-editor';
import type { CourseStructure, Json } from '@megacampus/shared-types';

const BATCH_SIZE = 50;

interface Metrics {
  courses_scanned: number;
  courses_updated: number;
  courses_skipped: number;
  id_conflicts: number;
  errors: number;
  retry_count: number;
}

async function main(): Promise<void> {
  const supabase = getSupabaseAdmin();

  const metrics: Metrics = {
    courses_scanned: 0,
    courses_updated: 0,
    courses_skipped: 0,
    retry_count: 0,
    id_conflicts: 0,
    errors: 0,
  };

  const errorCourseIds: string[] = []; // actual DB/exception errors
  const conflictCourseIds: string[] = []; // optimistic concurrency conflicts

  console.log('=== Backfill Stable IDs ===');
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log('');

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    // Fetch a batch of courses with non-null course_structure
    const { data: courses, error: fetchError } = await supabase
      .from('courses')
      .select('id, course_structure, updated_at')
      .not('course_structure', 'is', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (fetchError) {
      console.error(`Failed to fetch courses at offset ${offset}:`, fetchError.message);
      metrics.errors++;
      break;
    }

    if (!courses || courses.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`Processing batch: offset=${offset}, count=${courses.length}`);

    for (const course of courses) {
      metrics.courses_scanned++;

      try {
        const originalStructure = course.course_structure as unknown as CourseStructure;

        if (!originalStructure || !originalStructure.sections) {
          metrics.courses_skipped++;
          continue;
        }

        const updatedStructure = ensureStableIdsInMemory(originalStructure);

        // Deep equality check via JSON.stringify
        const originalJson = JSON.stringify(originalStructure);
        const updatedJson = JSON.stringify(updatedStructure);

        if (originalJson === updatedJson) {
          metrics.courses_skipped++;
          continue;
        }

        // Update with optimistic concurrency: only succeed if updated_at has not changed
        const { data: updateResult, error: updateError } = await supabase
          .from('courses')
          .update({
            course_structure: updatedStructure as unknown as Json,
            updated_at: new Date().toISOString(),
          })
          .eq('id', course.id)
          .eq('updated_at', course.updated_at ?? '')
          .select('id');

        if (updateError) {
          console.error(`  Error updating course ${course.id}:`, updateError.message);
          metrics.errors++;
          errorCourseIds.push(course.id);
          continue;
        }

        // Check if the update actually affected a row (optimistic concurrency)
        if (!updateResult || updateResult.length === 0) {
          console.log(`  Conflict on course ${course.id} (updated_at changed). Skipping.`);
          metrics.id_conflicts++;
          conflictCourseIds.push(course.id);
          continue;
        }

        metrics.courses_updated++;
        console.log(`  Updated course ${course.id}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  Exception processing course ${course.id}: ${message}`);
        metrics.errors++;
      }
    }

    // If we got fewer than BATCH_SIZE rows, we have reached the end
    if (courses.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      offset += BATCH_SIZE;
    }
  }

  // Retry pass for failed/conflicted courses (plan:132)
  const allFailedIds = [...errorCourseIds, ...conflictCourseIds];
  const errorIdSet = new Set(errorCourseIds);
  if (allFailedIds.length > 0) {
    console.log('');
    console.log(
      `=== Retry pass for ${allFailedIds.length} failed courses (${errorCourseIds.length} errors, ${conflictCourseIds.length} conflicts) ===`
    );

    for (const courseId of allFailedIds) {
      metrics.retry_count++;

      try {
        const { data: course, error: fetchError } = await supabase
          .from('courses')
          .select('id, course_structure, updated_at')
          .eq('id', courseId)
          .single();

        if (fetchError || !course) {
          console.error(`  Retry: Failed to fetch course ${courseId}`);
          continue;
        }

        const originalStructure = course.course_structure as unknown as CourseStructure;
        if (!originalStructure?.sections) continue;

        const updatedStructure = ensureStableIdsInMemory(originalStructure);
        if (JSON.stringify(originalStructure) === JSON.stringify(updatedStructure)) {
          metrics.courses_skipped++;
          // If this was an error course, the data is already correct (transient error resolved)
          if (errorIdSet.has(courseId)) {
            metrics.errors--;
          }
          continue;
        }

        const { data: updateResult, error: updateError } = await supabase
          .from('courses')
          .update({
            course_structure: updatedStructure as unknown as Json,
            updated_at: new Date().toISOString(),
          })
          .eq('id', courseId)
          .eq('updated_at', course.updated_at ?? '')
          .select('id');

        if (updateError || !updateResult || updateResult.length === 0) {
          console.error(`  Retry: Still failed for course ${courseId}`);
          continue;
        }

        metrics.courses_updated++;
        if (errorIdSet.has(courseId)) {
          metrics.errors--;
        }
        console.log(`  Retry: Updated course ${courseId}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  Retry exception for course ${courseId}: ${message}`);
      }
    }
  }

  // Print summary
  console.log('');
  console.log('=== Summary ===');
  console.log(`  Courses scanned:  ${metrics.courses_scanned}`);
  console.log(`  Courses updated:  ${metrics.courses_updated}`);
  console.log(`  Courses skipped:  ${metrics.courses_skipped}`);
  console.log(`  ID conflicts:     ${metrics.id_conflicts}`);
  console.log(`  Retry count:      ${metrics.retry_count}`);
  console.log(`  Errors:           ${metrics.errors}`);

  if (metrics.errors > 0) {
    console.log('');
    console.log('Completed with errors.');
    process.exit(1);
  }

  console.log('');
  console.log('Completed successfully.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
