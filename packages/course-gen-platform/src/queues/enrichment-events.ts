/**
 * Stage 7 Enrichment Queue Events
 * @module queues/enrichment-events
 *
 * BullMQ QueueEvents for monitoring enrichment job lifecycle.
 * Provides event listeners for completed, failed, progress, and other job events.
 */

import { QueueEvents } from 'bullmq';
import { getRedisClient } from '@/shared/cache/redis';
import { logger } from '@/shared/logger';
import { STAGE7_CONFIG } from '@/stages/stage7-enrichments/config';

/**
 * Create QueueEvents instance for enrichment queue monitoring
 *
 * @param redisUrl - Optional Redis URL (uses default if not provided)
 * @returns Configured QueueEvents instance
 */
export function createEnrichmentQueueEvents(redisUrl?: string): QueueEvents {
  const connection = redisUrl ? { url: redisUrl } : getRedisClient();

  const queueEvents = new QueueEvents(STAGE7_CONFIG.QUEUE_NAME, {
    connection,
  });

  // Log when QueueEvents is ready
  queueEvents.on('error', (error) => {
    logger.error(
      {
        error: error.message,
        queueName: STAGE7_CONFIG.QUEUE_NAME,
      },
      'Enrichment QueueEvents error'
    );
  });

  logger.info(
    {
      queueName: STAGE7_CONFIG.QUEUE_NAME,
    },
    'Enrichment QueueEvents initialized'
  );

  return queueEvents;
}

/**
 * Event data for completed jobs (matches BullMQ QueueEvents signature)
 */
export interface EnrichmentCompletedEvent {
  jobId: string;
  returnvalue: string; // JSON stringified result
  prev?: string;
}

/**
 * Event data for failed jobs (matches BullMQ QueueEvents signature)
 */
export interface EnrichmentFailedEvent {
  jobId: string;
  failedReason: string;
  prev?: string;
}

/**
 * BullMQ JobProgress type (can be number, string, object, or boolean)
 */
type JobProgress = number | string | object | boolean;

/**
 * Event data for job progress (matches BullMQ QueueEvents signature)
 */
export interface EnrichmentProgressEvent {
  jobId: string;
  data: JobProgress; // Progress data
}

/**
 * Enrichment event handler callbacks (matches BullMQ QueueEvents signature)
 */
export interface EnrichmentEventHandlers {
  onCompleted?: (event: EnrichmentCompletedEvent, id: string) => void;
  onFailed?: (event: EnrichmentFailedEvent, id: string) => void;
  onProgress?: (event: EnrichmentProgressEvent, id: string) => void;
  onActive?: (event: { jobId: string; prev?: string }, id: string) => void;
  onWaiting?: (event: { jobId: string; prev?: string }, id: string) => void;
  onStalled?: (event: { jobId: string }, id: string) => void;
  onDrained?: () => void;
}

/**
 * Attach event handlers to QueueEvents
 *
 * @param queueEvents - QueueEvents instance
 * @param handlers - Event handler callbacks
 * @returns Cleanup function to remove handlers
 */
export function attachEnrichmentEventHandlers(
  queueEvents: QueueEvents,
  handlers: EnrichmentEventHandlers
): () => void {
  const {
    onCompleted,
    onFailed,
    onProgress,
    onActive,
    onWaiting,
    onStalled,
    onDrained,
  } = handlers;

  if (onCompleted) {
    queueEvents.on('completed', onCompleted);
  }

  if (onFailed) {
    queueEvents.on('failed', onFailed);
  }

  if (onProgress) {
    queueEvents.on('progress', onProgress);
  }

  if (onActive) {
    queueEvents.on('active', onActive);
  }

  if (onWaiting) {
    queueEvents.on('waiting', onWaiting);
  }

  if (onStalled) {
    queueEvents.on('stalled', onStalled);
  }

  if (onDrained) {
    queueEvents.on('drained', onDrained);
  }

  // Return cleanup function
  return () => {
    if (onCompleted) {
      queueEvents.off('completed', onCompleted);
    }
    if (onFailed) {
      queueEvents.off('failed', onFailed);
    }
    if (onProgress) {
      queueEvents.off('progress', onProgress);
    }
    if (onActive) {
      queueEvents.off('active', onActive);
    }
    if (onWaiting) {
      queueEvents.off('waiting', onWaiting);
    }
    if (onStalled) {
      queueEvents.off('stalled', onStalled);
    }
    if (onDrained) {
      queueEvents.off('drained', onDrained);
    }
  };
}

/**
 * Wait for a specific job to complete
 *
 * @param queueEvents - QueueEvents instance
 * @param jobId - Job ID to wait for
 * @param timeoutMs - Timeout in milliseconds (default: 5 minutes)
 * @returns Promise that resolves with job result or rejects on failure/timeout
 */
export function waitForEnrichmentJob(
  queueEvents: QueueEvents,
  jobId: string,
  timeoutMs: number = 300_000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Job ${jobId} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const onCompleted = (event: EnrichmentCompletedEvent, _id: string) => {
      if (event.jobId === jobId) {
        cleanup();
        resolve(event.returnvalue);
      }
    };

    const onFailed = (event: EnrichmentFailedEvent, _id: string) => {
      if (event.jobId === jobId) {
        cleanup();
        reject(new Error(event.failedReason));
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      queueEvents.off('completed', onCompleted);
      queueEvents.off('failed', onFailed);
    };

    queueEvents.on('completed', onCompleted);
    queueEvents.on('failed', onFailed);
  });
}

/**
 * Close QueueEvents instance
 *
 * @param queueEvents - QueueEvents instance to close
 */
export async function closeEnrichmentQueueEvents(
  queueEvents: QueueEvents
): Promise<void> {
  try {
    await queueEvents.close();
    logger.info(
      { queueName: STAGE7_CONFIG.QUEUE_NAME },
      'Enrichment QueueEvents closed'
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        queueName: STAGE7_CONFIG.QUEUE_NAME,
      },
      'Error closing Enrichment QueueEvents'
    );
  }
}
