/**
 * RAG Context Cleanup Service
 *
 * Handles deletion of RAG context after course completion per FR-034, FR-035, FR-036:
 * - Delete immediately after successful course completion
 * - Scheduled cleanup for contexts older than 1 hour after course_completed_at
 * - Handle cleanup failures gracefully
 *
 * @module shared/rag/rag-cleanup
 * @see specs/010-stages-456-pipeline/data-model.md
 */

import { logger } from '@/shared/logger';
import { ragContextCache } from '@/stages/stage5-generation/utils/rag-context-cache';
import { getSupabaseAdmin } from '@/shared/supabase/admin';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of a cleanup operation for a single course
 */
export interface CleanupResult {
  /** Course UUID that was cleaned */
  courseId: string;
  /** Number of entries deleted */
  entriesDeleted: number;
  /** Whether cleanup succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Source of cleanup (memory, supabase, both) */
  source?: 'memory' | 'supabase' | 'both';
}

/**
 * Result of bulk expired context cleanup
 */
export interface BulkCleanupResult {
  /** Total entries deleted across all courses */
  totalDeleted: number;
  /** Number of courses cleaned */
  coursesProcessed: number;
  /** Individual results per course */
  results: CleanupResult[];
  /** Any errors encountered */
  errors: string[];
  /** Timestamp when cleanup ran */
  timestamp: Date;
}

/**
 * Options for cleanup operations
 */
export interface CleanupOptions {
  /** Whether to clear from memory cache */
  clearMemory?: boolean;
  /** Whether to clear from Supabase */
  clearSupabase?: boolean;
  /** Dry run mode - don't actually delete */
  dryRun?: boolean;
}

// ============================================================================
// SUPABASE TABLE TYPES
// ============================================================================

// _RAGContextCacheRow removed as it was unused and actual types are in Database definition

// ============================================================================
// MAIN CLEANUP FUNCTIONS
// ============================================================================

/**
 * Delete RAG context for a completed course
 *
 * Called immediately after successful course completion (FR-034).
 * Clears both in-memory cache and Supabase persistence.
 *
 * @param courseId - Course UUID to clean up
 * @param options - Cleanup options
 * @returns Result of the cleanup operation
 *
 * @example
 * ```typescript
 * // After course generation completes successfully
 * const result = await cleanupCourseRagContext(courseId);
 * if (result.success) {
 *   logger.info({ entriesDeleted: result.entriesDeleted }, 'RAG context cleaned');
 * }
 * ```
 */
export async function cleanupCourseRagContext(
  courseId: string,
  options: CleanupOptions = {}
): Promise<CleanupResult> {
  const {
    clearMemory = true,
    clearSupabase = true,
    dryRun = false,
  } = options;

  logger.debug({
    courseId,
    clearMemory,
    clearSupabase,
    dryRun,
  }, '[RAG Cleanup] Starting course cleanup');

  let memoryDeleted = 0;
  let supabaseDeleted = 0;
  const errors: string[] = [];

  try {
    // Clear from in-memory cache
    if (clearMemory) {
      const stats = ragContextCache.getStats();
      const beforeCount = stats.totalEntries;

      if (!dryRun) {
        await ragContextCache.clearCourse(courseId);
      }

      const afterStats = ragContextCache.getStats();
      memoryDeleted = beforeCount - afterStats.totalEntries;

      logger.debug({
        courseId,
        memoryDeleted,
        dryRun,
      }, '[RAG Cleanup] Memory cache cleared');
    }

    // Clear from Supabase
    if (clearSupabase) {
      const supabaseResult = await clearCourseFromSupabase(courseId, dryRun);
      if (supabaseResult.success) {
        supabaseDeleted = supabaseResult.deleted;
      } else if (supabaseResult.error) {
        errors.push(supabaseResult.error);
      }
    }

    const totalDeleted = memoryDeleted + supabaseDeleted;
    const source = clearMemory && clearSupabase
      ? 'both'
      : clearMemory
        ? 'memory'
        : 'supabase';

    logger.info({
      courseId,
      memoryDeleted,
      supabaseDeleted,
      totalDeleted,
      dryRun,
    }, '[RAG Cleanup] Course cleanup complete');

    return {
      courseId,
      entriesDeleted: totalDeleted,
      success: errors.length === 0,
      error: errors.length > 0 ? errors.join('; ') : undefined,
      source,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error({
      err: errorMessage,
      courseId,
    }, '[RAG Cleanup] Course cleanup failed');

    return {
      courseId,
      entriesDeleted: memoryDeleted + supabaseDeleted,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Cleanup all expired RAG contexts
 *
 * Scheduled cleanup for contexts older than expirationHours (default: 1 hour)
 * after course_completed_at (FR-035, FR-036).
 *
 * @param expirationHours - Hours after which context expires (default: 1)
 * @param options - Cleanup options
 * @returns Bulk cleanup result with all courses processed
 *
 * @example
 * ```typescript
 * // Run as scheduled job
 * const result = await cleanupExpiredRagContexts(1);
 * logger.info({
 *   totalDeleted: result.totalDeleted,
 *   coursesProcessed: result.coursesProcessed,
 * }, 'Expired RAG contexts cleaned');
 * ```
 */
export async function cleanupExpiredRagContexts(
  expirationHours: number = 1,
  options: CleanupOptions = {}
): Promise<BulkCleanupResult> {
  const { dryRun = false } = options;
  const timestamp = new Date();
  const results: CleanupResult[] = [];
  const errors: string[] = [];

  logger.info({
    expirationHours,
    dryRun,
  }, '[RAG Cleanup] Starting expired context cleanup');

  try {
    // Get expired courses from Supabase
    const expiredCourses = await getExpiredCourses(expirationHours);

    if (expiredCourses.length === 0) {
      logger.debug('[RAG Cleanup] No expired contexts found');
      return {
        totalDeleted: 0,
        coursesProcessed: 0,
        results: [],
        errors: [],
        timestamp,
      };
    }

    logger.debug({
      expiredCount: expiredCourses.length,
    }, '[RAG Cleanup] Found expired courses');

    // Process each expired course
    for (const courseId of expiredCourses) {
      try {
        const result = await cleanupCourseRagContext(courseId, {
          ...options,
          clearMemory: true,
          clearSupabase: true,
        });
        results.push(result);

        if (!result.success && result.error) {
          errors.push(`Course ${courseId}: ${result.error}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Course ${courseId}: ${errorMessage}`);
        results.push({
          courseId,
          entriesDeleted: 0,
          success: false,
          error: errorMessage,
        });
      }
    }

    const totalDeleted = results.reduce((sum, r) => sum + r.entriesDeleted, 0);

    logger.info({
      totalDeleted,
      coursesProcessed: results.length,
      errorsCount: errors.length,
      dryRun,
    }, '[RAG Cleanup] Expired context cleanup complete');

    return {
      totalDeleted,
      coursesProcessed: results.length,
      results,
      errors,
      timestamp,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error({
      err: errorMessage,
    }, '[RAG Cleanup] Expired context cleanup failed');

    return {
      totalDeleted: 0,
      coursesProcessed: 0,
      results,
      errors: [errorMessage, ...errors],
      timestamp,
    };
  }
}

/**
 * Check if a course has RAG context that can be cleaned
 *
 * Checks both in-memory cache and Supabase.
 *
 * @param courseId - Course UUID to check
 * @returns True if context exists
 *
 * @example
 * ```typescript
 * if (await hasRagContext(courseId)) {
 *   await cleanupCourseRagContext(courseId);
 * }
 * ```
 */
export async function hasRagContext(courseId: string): Promise<boolean> {
  // Check in-memory cache (via stats - no direct method exposed)
  // We'll rely on Supabase check primarily
  try {
    const supabase = getSupabaseAdmin();

    const { count, error } = await supabase
      .from('rag_context_cache')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', courseId);

    if (error) {
      logger.warn({
        err: error.message,
        courseId,
      }, '[RAG Cleanup] Failed to check context existence');
      return false;
    }

    return (count ?? 0) > 0;
  } catch (error) {
    logger.warn({
      err: error instanceof Error ? error.message : String(error),
      courseId,
    }, '[RAG Cleanup] Context existence check failed');
    return false;
  }
}

/**
 * Get count of RAG context entries for a course
 *
 * @param courseId - Course UUID
 * @returns Number of cached entries
 */
export async function getRagContextCount(courseId: string): Promise<number> {
  try {
    const supabase = getSupabaseAdmin();

    const { count, error } = await supabase
      .from('rag_context_cache')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', courseId);

    if (error) {
      logger.warn({
        err: error.message,
        courseId,
      }, '[RAG Cleanup] Failed to get context count');
      return 0;
    }

    return count ?? 0;
  } catch (error) {
    logger.warn({
      err: error instanceof Error ? error.message : String(error),
      courseId,
    }, '[RAG Cleanup] Context count check failed');
    return 0;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Clear course entries from Supabase
 *
 * @param courseId - Course UUID
 * @param dryRun - If true, don't actually delete
 * @returns Result with deleted count
 */
async function clearCourseFromSupabase(
  courseId: string,
  dryRun: boolean = false
): Promise<{ success: boolean; deleted: number; error?: string }> {
  try {
    const supabase = getSupabaseAdmin();

    // First, count entries to be deleted
    const { count, error: countError } = await supabase
      .from('rag_context_cache')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', courseId);

    if (countError) {
      return {
        success: false,
        deleted: 0,
        error: `Count failed: ${countError.message}`,
      };
    }

    const toDelete = count ?? 0;

    if (dryRun) {
      logger.debug({
        courseId,
        wouldDelete: toDelete,
      }, '[RAG Cleanup] Dry run - would delete from Supabase');
      return { success: true, deleted: toDelete };
    }

    if (toDelete === 0) {
      return { success: true, deleted: 0 };
    }

    // Delete entries
    const { error: deleteError } = await supabase
      .from('rag_context_cache')
      .delete()
      .eq('course_id', courseId);

    if (deleteError) {
      return {
        success: false,
        deleted: 0,
        error: `Delete failed: ${deleteError.message}`,
      };
    }

    logger.debug({
      courseId,
      deleted: toDelete,
    }, '[RAG Cleanup] Cleared from Supabase');

    return { success: true, deleted: toDelete };
  } catch (error) {
    return {
      success: false,
      deleted: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get list of course IDs with expired RAG context
 *
 * @param expirationHours - Hours after which context expires
 * @returns Array of course IDs to clean up
 */
async function getExpiredCourses(expirationHours: number): Promise<string[]> {
  try {
    const supabase = getSupabaseAdmin();

    // Calculate expiration threshold
    const expirationThreshold = new Date(
      Date.now() - expirationHours * 60 * 60 * 1000
    );

    // Query for expired entries, group by course_id
    const { data, error } = await supabase
      .from('rag_context_cache')
      .select('course_id')
      .or(`expires_at.lt.${expirationThreshold.toISOString()},expires_at.is.null`)
      .lt('created_at', expirationThreshold.toISOString());

    if (error) {
      logger.warn({
        err: error.message,
      }, '[RAG Cleanup] Failed to get expired courses');
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Get unique course IDs
    const courseIdSet = new Set<string>();
    for (const row of data) {
      courseIdSet.add(row.course_id);
    }
    const courseIds = Array.from(courseIdSet);

    logger.debug({
      expiredCoursesCount: courseIds.length,
      threshold: expirationThreshold.toISOString(),
    }, '[RAG Cleanup] Found expired courses');

    return courseIds;
  } catch (error) {
    logger.warn({
      err: error instanceof Error ? error.message : String(error),
    }, '[RAG Cleanup] Failed to query expired courses');
    return [];
  }
}

/**
 * Delete all expired entries directly (without grouping by course)
 *
 * More efficient for bulk cleanup when you don't need per-course results.
 *
 * @param expirationHours - Hours after which context expires
 * @param dryRun - If true, don't actually delete
 * @returns Number of entries deleted
 */
export async function deleteExpiredEntriesDirect(
  expirationHours: number = 1,
  dryRun: boolean = false
): Promise<{ deleted: number; success: boolean; error?: string }> {
  try {
    const supabase = getSupabaseAdmin();

    const expirationThreshold = new Date(
      Date.now() - expirationHours * 60 * 60 * 1000
    );

    // Count first
    const { count, error: countError } = await supabase
      .from('rag_context_cache')
      .select('*', { count: 'exact', head: true })
      .or(`expires_at.lt.${expirationThreshold.toISOString()},expires_at.is.null`)
      .lt('created_at', expirationThreshold.toISOString());

    if (countError) {
      return { deleted: 0, success: false, error: countError.message };
    }

    const toDelete = count ?? 0;

    if (dryRun || toDelete === 0) {
      return { deleted: toDelete, success: true };
    }

    // Delete expired entries
    const { error: deleteError } = await supabase
      .from('rag_context_cache')
      .delete()
      .or(`expires_at.lt.${expirationThreshold.toISOString()},expires_at.is.null`)
      .lt('created_at', expirationThreshold.toISOString());

    if (deleteError) {
      return { deleted: 0, success: false, error: deleteError.message };
    }

    logger.info({
      deleted: toDelete,
      threshold: expirationThreshold.toISOString(),
    }, '[RAG Cleanup] Deleted expired entries directly');

    return { deleted: toDelete, success: true };
  } catch (error) {
    return {
      deleted: 0,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
