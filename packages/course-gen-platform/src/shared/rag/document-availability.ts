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
import { qdrantClient } from '@/shared/qdrant/client';
import { PipelineInternalError } from '@/shared/errors';

// ============================================================================
// CACHE
// ============================================================================

/**
 * In-memory cache for course document availability
 * TTL: 5 minutes (documents don't change frequently during generation)
 */
const courseDocumentCache = new Map<string, { hasDocuments: boolean; timestamp: number }>();
const DOCUMENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const QDRANT_HEALTH_CACHE_TTL_MS = 30 * 1000; // 30 seconds

let qdrantHealthCache:
  | {
      reachable: boolean;
      timestamp: number;
    }
  | null = null;

export type CourseRagAvailability =
  | 'optional_no_documents'
  | 'ready'
  | 'required_unavailable';

export type CourseRagAvailabilityReason =
  | 'no_uploaded_documents'
  | 'rag_ready'
  | 'no_indexed_documents'
  | 'document_query_failed'
  | 'qdrant_unavailable';

export interface CourseRagAvailabilityResult {
  availability: CourseRagAvailability;
  ragRequired: boolean;
  hasUploadedDocuments: boolean;
  hasIndexedDocuments: boolean;
  reason: CourseRagAvailabilityReason;
}

export class RequiredRagUnavailableError extends PipelineInternalError {
  readonly code = 'NETWORK_ERROR';

  constructor(
    courseId: string,
    public readonly reason: CourseRagAvailabilityReason,
    originalError?: string
  ) {
    super('RAG is required for this course, but Qdrant is unavailable', {
      courseId,
      service: 'qdrant',
      reason,
      originalError,
    });
  }
}

async function isQdrantCollectionReachable(): Promise<boolean> {
  if (qdrantHealthCache && Date.now() - qdrantHealthCache.timestamp < QDRANT_HEALTH_CACHE_TTL_MS) {
    return qdrantHealthCache.reachable;
  }

  try {
    await qdrantClient.getCollection('course_embeddings');
    qdrantHealthCache = { reachable: true, timestamp: Date.now() };
    return true;
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      '[RAG] Qdrant collection health check failed'
    );
    qdrantHealthCache = { reachable: false, timestamp: Date.now() };
    return false;
  }
}

export async function resolveCourseRagAvailability(
  courseId: string
): Promise<CourseRagAvailabilityResult> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('file_catalog')
      .select('id, vector_status')
      .eq('course_id', courseId);

    if (error) {
      logger.warn(
        {
          courseId,
          error: error.message,
        },
        '[RAG] Failed to resolve course document availability'
      );

      return {
        availability: 'required_unavailable',
        ragRequired: true,
        hasUploadedDocuments: true,
        hasIndexedDocuments: false,
        reason: 'document_query_failed',
      };
    }

    const rows = Array.isArray(data) ? data : [];
    const hasUploadedDocuments = rows.length > 0;
    const hasIndexedDocuments = rows.some(row => row.vector_status === 'indexed');

    if (!hasUploadedDocuments) {
      return {
        availability: 'optional_no_documents',
        ragRequired: false,
        hasUploadedDocuments: false,
        hasIndexedDocuments: false,
        reason: 'no_uploaded_documents',
      };
    }

    if (!hasIndexedDocuments) {
      return {
        availability: 'required_unavailable',
        ragRequired: true,
        hasUploadedDocuments: true,
        hasIndexedDocuments: false,
        reason: 'no_indexed_documents',
      };
    }

    const qdrantReachable = await isQdrantCollectionReachable();
    if (!qdrantReachable) {
      return {
        availability: 'required_unavailable',
        ragRequired: true,
        hasUploadedDocuments: true,
        hasIndexedDocuments: true,
        reason: 'qdrant_unavailable',
      };
    }

    return {
      availability: 'ready',
      ragRequired: true,
      hasUploadedDocuments: true,
      hasIndexedDocuments: true,
      reason: 'rag_ready',
    };
  } catch (error) {
    logger.warn(
      {
        courseId,
        error: error instanceof Error ? error.message : String(error),
      },
      '[RAG] Unexpected failure while resolving availability'
    );

    return {
      availability: 'required_unavailable',
      ragRequired: true,
      hasUploadedDocuments: true,
      hasIndexedDocuments: false,
      reason: 'document_query_failed',
    };
  }
}

export async function assertCourseRagReady(courseId: string): Promise<CourseRagAvailabilityResult> {
  const result = await resolveCourseRagAvailability(courseId);

  if (result.availability === 'required_unavailable') {
    throw new RequiredRagUnavailableError(courseId, result.reason);
  }

  return result;
}

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
    const availability = await resolveCourseRagAvailability(courseId);
    const hasDocuments = availability.hasIndexedDocuments;

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
  qdrantHealthCache = null;
  logger.debug('[RAG] Cleared all document availability cache');
}
