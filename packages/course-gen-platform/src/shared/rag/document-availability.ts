/**
 * Document Availability Check for RAG
 *
 * Provides optimized check for whether a course has indexed documents
 * before attempting expensive Qdrant queries.
 *
 * @module shared/rag/document-availability
 */

import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { logger } from '@/shared/logger';

// ============================================================================
// CACHE
// ============================================================================

/**
 * In-memory cache for course document availability
 * TTL: 5 minutes (documents don't change frequently during generation)
 */
const courseDocumentCache = new Map<string, { hasDocuments: boolean; timestamp: number }>();
const DOCUMENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Check if a course has indexed documents available for RAG
 *
 * This optimization prevents expensive Qdrant queries when a course
 * has no uploaded documents. Saves ~100 seconds per lesson generation.
 *
 * The result is cached for 5 minutes in memory.
 *
 * @param courseId - Course UUID to check
 * @returns True if course has at least one indexed document
 *
 * @example
 * ```typescript
 * const hasDocuments = await checkCourseHasIndexedDocuments(courseId);
 * if (!hasDocuments) {
 *   logger.info('Skipping RAG - no documents');
 *   return emptyResult;
 * }
 * // Proceed with RAG retrieval...
 * ```
 */
export async function checkCourseHasIndexedDocuments(courseId: string): Promise<boolean> {
  // Check cache first
  const cached = courseDocumentCache.get(courseId);
  if (cached && Date.now() - cached.timestamp < DOCUMENT_CACHE_TTL_MS) {
    return cached.hasDocuments;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('file_catalog')
      .select('id')
      .eq('course_id', courseId)
      .eq('vector_status', 'indexed')
      .limit(1);

    if (error) {
      logger.warn(
        {
          courseId,
          error: error.message,
        },
        '[RAG] Failed to check document availability, proceeding with retrieval'
      );
      return true; // Assume documents exist on error to avoid skipping RAG
    }

    const hasDocuments = (data?.length ?? 0) > 0;

    // Cache the result
    courseDocumentCache.set(courseId, {
      hasDocuments,
      timestamp: Date.now(),
    });

    logger.debug(
      {
        courseId,
        hasDocuments,
      },
      '[RAG] Document availability check'
    );

    return hasDocuments;
  } catch (error) {
    logger.warn(
      {
        courseId,
        error: error instanceof Error ? error.message : String(error),
      },
      '[RAG] Error checking document availability'
    );
    return true; // Assume documents exist on error
  }
}

/**
 * Clear the document availability cache for a specific course
 * Call this when documents are uploaded or deleted
 *
 * @param courseId - Course UUID to clear cache for
 */
export function clearDocumentAvailabilityCache(courseId: string): void {
  courseDocumentCache.delete(courseId);
  logger.debug({ courseId }, '[RAG] Cleared document availability cache');
}

/**
 * Clear the entire document availability cache
 * Useful for testing or after bulk operations
 */
export function clearAllDocumentAvailabilityCache(): void {
  courseDocumentCache.clear();
  logger.debug('[RAG] Cleared all document availability cache');
}
