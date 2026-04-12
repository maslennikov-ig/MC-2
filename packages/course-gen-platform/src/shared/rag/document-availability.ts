/**
 * Document Availability Check for RAG
 *
 * Provides optimized check for whether a course has indexed documents
 * before attempting expensive Qdrant queries.
 *
 * @module shared/rag/document-availability
 */

import {
  QdrantClientConfigError,
  QdrantClientResourceExhaustedError,
  QdrantClientTimeoutError,
} from '@qdrant/js-client-rest';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { logger } from '@/shared/logger';
import { qdrantClient } from '@/shared/qdrant/client';
import type { PipelineErrorSeverity } from '@/shared/errors';
import { PipelineError } from '@/shared/errors';

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
const QDRANT_PREFLIGHT_TIMEOUT_MS = 10_000;

let qdrantHealthCache:
  | {
      reachable: true;
      timestamp: number;
    }
  | {
      reachable: false;
      timestamp: number;
      error: RequiredRagUnavailableError;
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
  | 'metadata_lookup_failed'
  | 'qdrant_timeout'
  | 'qdrant_rate_limited'
  | 'qdrant_network_error'
  | 'qdrant_service_unavailable'
  | 'qdrant_collection_missing'
  | 'qdrant_invalid_config';

export interface CourseRagAvailabilityResult {
  availability: CourseRagAvailability;
  ragRequired: boolean;
  hasUploadedDocuments: boolean;
  hasIndexedDocuments: boolean;
  reason: CourseRagAvailabilityReason;
}

export type RequiredRagApiErrorCode = 'PRECONDITION_FAILED' | 'SERVICE_UNAVAILABLE';

export class RequiredRagUnavailableError extends PipelineError {
  readonly code = 'NETWORK_ERROR';
  readonly retryable: boolean;
  readonly apiErrorCode: RequiredRagApiErrorCode;
  readonly severity: PipelineErrorSeverity;

  constructor(
    courseId: string,
    public readonly reason: CourseRagAvailabilityReason,
    originalError?: string
  ) {
    const retryable = isRetryableRequiredRagReason(reason);
    const apiErrorCode = retryable ? 'SERVICE_UNAVAILABLE' : 'PRECONDITION_FAILED';
    super(getRequiredRagUnavailableMessage(reason), {
      courseId,
      service: reason === 'metadata_lookup_failed' ? 'supabase:file_catalog' : 'qdrant',
      reason,
      retryable,
      apiErrorCode,
      originalError,
    });

    this.retryable = retryable;
    this.apiErrorCode = apiErrorCode;
    this.severity = retryable ? 'WARNING' : 'CRITICAL';
  }
}

function isRetryableRequiredRagReason(reason: CourseRagAvailabilityReason): boolean {
  return [
    'metadata_lookup_failed',
    'qdrant_timeout',
    'qdrant_rate_limited',
    'qdrant_network_error',
    'qdrant_service_unavailable',
  ].includes(reason);
}

function getRequiredRagUnavailableMessage(reason: CourseRagAvailabilityReason): string {
  switch (reason) {
    case 'no_indexed_documents':
      return 'RAG is required for this course, but indexed documents are unavailable';
    case 'metadata_lookup_failed':
      return 'RAG is required for this course, but document metadata is temporarily unavailable';
    case 'qdrant_timeout':
      return 'RAG is required for this course, but the vector database timed out';
    case 'qdrant_rate_limited':
      return 'RAG is required for this course, but the vector database is rate limited';
    case 'qdrant_collection_missing':
      return 'RAG is required for this course, but the required vector collection is missing';
    case 'qdrant_invalid_config':
      return 'RAG is required for this course, but the vector database configuration is invalid';
    case 'qdrant_network_error':
    case 'qdrant_service_unavailable':
    default:
      return 'RAG is required for this course, but the vector database is temporarily unavailable';
  }
}

export function getRequiredRagApiMessage(error: RequiredRagUnavailableError): string {
  switch (error.reason) {
    case 'no_indexed_documents':
      return 'This course has uploaded documents, but none are indexed for RAG yet. Please finish document processing and try again.';
    case 'metadata_lookup_failed':
      return 'This course has uploaded documents, but document metadata is temporarily unavailable. Please try again later.';
    case 'qdrant_collection_missing':
    case 'qdrant_invalid_config':
      return 'This course requires RAG, but the vector database configuration is invalid. Please contact support.';
    default:
      return 'This course has uploaded documents, but the vector database is temporarily unavailable. Please try again later.';
  }
}

function getUnknownErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return Object.prototype.toString.call(error);
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  if ('status' in error && typeof error.status === 'number') {
    return error.status;
  }

  if ('getActualType' in error && typeof error.getActualType === 'function') {
    try {
      const getActualType = error.getActualType as () => { status?: unknown } | undefined;
      const actual = getActualType?.();
      if (typeof actual?.status === 'number') {
        return actual.status;
      }
    } catch {
      // Ignore typed error extraction failures and fall back to message parsing.
    }
  }

  const message = getUnknownErrorMessage(error);
  const statusMatch = message.match(/\b(\d{3})\b/);
  if (!statusMatch) {
    return undefined;
  }

  const parsed = Number(statusMatch[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isLikelyNetworkError(message: string): boolean {
  const normalized = message.toLowerCase();

  return [
    'fetch failed',
    'network',
    'econnrefused',
    'econnreset',
    'enotfound',
    'etimedout',
    'socket hang up',
    'connect timeout',
    'timed out',
  ].some(pattern => normalized.includes(pattern));
}

function isLikelyConfigError(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes('missing required qdrant environment variables') ||
    normalized.includes('cannot specify both url and host') ||
    normalized.includes('invalid retryafter value')
  );
}

function classifyQdrantAvailabilityError(
  courseId: string,
  error: unknown
): RequiredRagUnavailableError {
  if (error instanceof RequiredRagUnavailableError) {
    return error;
  }

  const message = getUnknownErrorMessage(error);

  if (error instanceof QdrantClientTimeoutError) {
    return new RequiredRagUnavailableError(courseId, 'qdrant_timeout', message);
  }

  if (error instanceof QdrantClientResourceExhaustedError) {
    return new RequiredRagUnavailableError(courseId, 'qdrant_rate_limited', message);
  }

  if (error instanceof QdrantClientConfigError || isLikelyConfigError(message)) {
    return new RequiredRagUnavailableError(courseId, 'qdrant_invalid_config', message);
  }

  const status = getErrorStatus(error);
  if (status === 404 || message.toLowerCase().includes('not found')) {
    return new RequiredRagUnavailableError(courseId, 'qdrant_collection_missing', message);
  }
  if (status === 408) {
    return new RequiredRagUnavailableError(courseId, 'qdrant_timeout', message);
  }
  if (status === 429) {
    return new RequiredRagUnavailableError(courseId, 'qdrant_rate_limited', message);
  }
  if (status !== undefined && status >= 500) {
    return new RequiredRagUnavailableError(courseId, 'qdrant_service_unavailable', message);
  }
  if (status !== undefined && status >= 400) {
    return new RequiredRagUnavailableError(courseId, 'qdrant_invalid_config', message);
  }
  if (isLikelyNetworkError(message)) {
    return new RequiredRagUnavailableError(courseId, 'qdrant_network_error', message);
  }

  return new RequiredRagUnavailableError(courseId, 'qdrant_service_unavailable', message);
}

async function getCollectionWithTimeout(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new QdrantClientTimeoutError(
          `Qdrant preflight timed out after ${QDRANT_PREFLIGHT_TIMEOUT_MS}ms`
        )
      );
    }, QDRANT_PREFLIGHT_TIMEOUT_MS);

    qdrantClient
      .getCollection('course_embeddings')
      .then(() => {
        clearTimeout(timer);
        resolve();
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(getUnknownErrorMessage(error)));
      });
  });
}

async function assertQdrantCollectionReachable(courseId: string): Promise<void> {
  if (qdrantHealthCache && Date.now() - qdrantHealthCache.timestamp < QDRANT_HEALTH_CACHE_TTL_MS) {
    if (qdrantHealthCache.reachable) {
      return;
    }

    if (!qdrantHealthCache.error.retryable) {
      throw qdrantHealthCache.error;
    }
  }

  try {
    await getCollectionWithTimeout();
    qdrantHealthCache = { reachable: true, timestamp: Date.now() };
  } catch (error) {
    const ragError = classifyQdrantAvailabilityError(courseId, error);

    logger.warn(
      {
        courseId,
        reason: ragError.reason,
        retryable: ragError.retryable,
        error: error instanceof Error ? error.message : String(error),
      },
      '[RAG] Qdrant collection health check failed'
    );

    if (!ragError.retryable) {
      qdrantHealthCache = { reachable: false, timestamp: Date.now(), error: ragError };
    } else {
      qdrantHealthCache = null;
    }

    throw ragError;
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
      throw new RequiredRagUnavailableError(courseId, 'metadata_lookup_failed', error.message);
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

    await assertQdrantCollectionReachable(courseId);

    return {
      availability: 'ready',
      ragRequired: true,
      hasUploadedDocuments: true,
      hasIndexedDocuments: true,
      reason: 'rag_ready',
    };
  } catch (error) {
    if (error instanceof RequiredRagUnavailableError) {
      throw error;
    }

    logger.warn(
      {
        courseId,
        error: error instanceof Error ? error.message : String(error),
      },
      '[RAG] Unexpected failure while resolving availability'
    );
    throw new RequiredRagUnavailableError(
      courseId,
      'metadata_lookup_failed',
      error instanceof Error ? error.message : String(error)
    );
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
