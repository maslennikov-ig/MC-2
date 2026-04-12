import { logger } from '@/shared/logger';
import {
  assertCourseRagReady,
  type CourseRagAvailabilityResult,
  RequiredRagUnavailableError,
} from './document-availability';

const REQUIRED_RAG_RETRY_DELAYS_MS = [1000, 3000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function assertCourseRagReadyWithRetry(
  courseId: string
): Promise<CourseRagAvailabilityResult> {
  let lastError: RequiredRagUnavailableError | null = null;

  for (let attempt = 0; attempt <= REQUIRED_RAG_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await assertCourseRagReady(courseId);
    } catch (error) {
      if (!(error instanceof RequiredRagUnavailableError)) {
        throw error;
      }

      lastError = error;

      if (!error.retryable || attempt === REQUIRED_RAG_RETRY_DELAYS_MS.length) {
        throw error;
      }

      const delayMs = REQUIRED_RAG_RETRY_DELAYS_MS[attempt];
      logger.warn(
        {
          courseId,
          reason: error.reason,
          attempt: attempt + 1,
          retryInMs: delayMs,
        },
        '[RAG] Required-RAG preflight failed transiently, retrying'
      );
      await sleep(delayMs);
    }
  }

  throw (
    lastError ??
    new RequiredRagUnavailableError(courseId, 'qdrant_service_unavailable', 'Unknown retry failure')
  );
}

export { REQUIRED_RAG_RETRY_DELAYS_MS };
