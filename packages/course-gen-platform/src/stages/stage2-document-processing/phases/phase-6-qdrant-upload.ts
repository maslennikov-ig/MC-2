/**
 * Phase 6: Qdrant Upload
 *
 * Uploads chunk embeddings to Qdrant vector database for RAG retrieval.
 * Updates vector_status to 'indexed' on successful upload.
 *
 * Features:
 * - Timeout protection to prevent stuck 'indexing' status
 * - Retry logic with exponential backoff
 * - Automatic status update to 'failed' on timeout/error
 *
 * @module stages/stage2-document-processing/phases/phase-6-qdrant-upload
 */

import { Job } from 'bullmq';
import type { DocumentProcessingJobData } from '@megacampus/shared-types';
import { uploadChunksToQdrant, updateVectorStatus } from '../../../shared/qdrant/upload.js';
import type { EmbeddingResult } from '../../../shared/embeddings/generate.js';
import { logger } from '../../../shared/logger/index.js';
import { getSupabaseAdmin } from '../../../shared/supabase/admin.js';

/** Qdrant upload timeout in milliseconds (configurable via env) */
const QDRANT_UPLOAD_TIMEOUT_MS = parseInt(process.env.QDRANT_UPLOAD_TIMEOUT_MS || '60000', 10);

/** Maximum retry attempts for Qdrant upload (configurable via env) */
const MAX_QDRANT_RETRIES = parseInt(process.env.MAX_QDRANT_RETRIES || '3', 10);

/** Base delay for exponential backoff in ms (configurable via env) */
const BASE_RETRY_DELAY_MS = parseInt(process.env.QDRANT_BASE_RETRY_DELAY_MS || '2000', 10);

// Log configuration on module load (debug level)
logger.debug(
  {
    timeout: QDRANT_UPLOAD_TIMEOUT_MS,
    maxRetries: MAX_QDRANT_RETRIES,
    baseDelay: BASE_RETRY_DELAY_MS,
  },
  'Qdrant upload configuration loaded'
);

/**
 * Helper to add timeout to a promise
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs)),
  ]);
}

/**
 * Get unique document IDs from embeddings
 * @throws Error if no valid document IDs found (data integrity issue)
 */
function getDocumentIds(embeddings: EmbeddingResult[]): string[] {
  const ids = new Set<string>();
  for (const embedding of embeddings) {
    if (embedding.chunk?.document_id) {
      ids.add(embedding.chunk.document_id);
    }
  }

  const documentIds = Array.from(ids);

  // Validate we found at least one document ID
  if (documentIds.length === 0 && embeddings.length > 0) {
    logger.error(
      { embeddingCount: embeddings.length },
      'No valid document IDs found in embeddings - data integrity issue'
    );
    throw new Error(
      `No valid document IDs found in ${embeddings.length} embeddings. ` +
        `This indicates a data integrity issue in the chunking phase.`
    );
  }

  return documentIds;
}

/**
 * Execute Qdrant upload phase
 *
 * Uploads embeddings to Qdrant vector database in batches with timeout protection.
 * If upload times out or fails, retries with exponential backoff.
 * After MAX_RETRIES, marks documents as 'failed' to prevent stuck 'indexing' status.
 *
 * @param embeddings - Chunks with generated embeddings
 * @param job - BullMQ job instance for progress tracking
 * @returns Upload result with points uploaded, batch count, and duration
 */
export async function executeQdrantUpload(
  embeddings: EmbeddingResult[],
  job: Job<DocumentProcessingJobData>
): Promise<ReturnType<typeof uploadChunksToQdrant>> {
  const documentIds = getDocumentIds(embeddings);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_QDRANT_RETRIES; attempt++) {
    try {
      logger.info(
        {
          jobId: job.id,
          attempt,
          maxRetries: MAX_QDRANT_RETRIES,
          pointsCount: embeddings.length,
        },
        'Starting Qdrant upload attempt'
      );

      // Upload vectors to Qdrant with timeout protection
      const uploadResult = await withTimeout(
        uploadChunksToQdrant(embeddings, {
          batch_size: 100,
          wait: true,
          enable_sparse: true, // Enable BM25 sparse vectors for hybrid search
        }),
        QDRANT_UPLOAD_TIMEOUT_MS,
        `Qdrant upload timed out after ${QDRANT_UPLOAD_TIMEOUT_MS}ms`
      );

      await job.updateProgress(95);

      logger.debug(
        {
          jobId: job.id,
          pointsUploaded: uploadResult.points_uploaded,
          batchCount: uploadResult.batch_count,
          durationMs: uploadResult.duration_ms,
        },
        'Vectors uploaded to Qdrant'
      );

      return uploadResult;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      logger.warn(
        {
          jobId: job.id,
          attempt,
          maxRetries: MAX_QDRANT_RETRIES,
          error: lastError.message,
        },
        'Qdrant upload failed, will retry'
      );

      // Don't retry if this was the last attempt
      if (attempt < MAX_QDRANT_RETRIES) {
        const retryDelay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        logger.info({ retryDelay, nextAttempt: attempt + 1 }, 'Waiting before retry');
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  // All retries exhausted - build comprehensive error with context
  const baseErrorMessage = lastError?.message || 'Qdrant upload failed after all retries';
  const enhancedErrorMessage =
    `Qdrant upload failed after ${MAX_QDRANT_RETRIES} retries: ${baseErrorMessage}. ` +
    `Affected documents: ${documentIds.join(', ')} (${embeddings.length} points total)`;

  logger.error(
    {
      jobId: job.id,
      documentIds,
      pointCount: embeddings.length,
      error: baseErrorMessage,
      attemptsExhausted: MAX_QDRANT_RETRIES,
    },
    'Qdrant upload failed after all retries, marking documents as failed'
  );

  // Batch update all documents' vector_status to 'failed' in single query
  try {
    const supabase = getSupabaseAdmin();
    const { error: batchUpdateError } = await supabase
      .from('file_catalog')
      .update({
        vector_status: 'failed',
        error_message: baseErrorMessage.substring(0, 1000),
        updated_at: new Date().toISOString(),
      })
      .in('id', documentIds);

    if (batchUpdateError) {
      logger.error(
        { documentIds, error: batchUpdateError.message },
        'Failed to batch update document vector_status to failed'
      );
      // Fallback to individual updates
      for (const documentId of documentIds) {
        try {
          await updateVectorStatus(documentId, 'failed', baseErrorMessage);
        } catch (updateError) {
          logger.error({ documentId, error: updateError }, 'Individual status update also failed');
        }
      }
    } else {
      logger.info(
        { documentIds, count: documentIds.length },
        'Batch updated all document statuses to failed'
      );
    }
  } catch (err) {
    // Catastrophic failure - log and continue
    logger.error({ documentIds, error: err }, 'Exception during batch status update');
  }

  // Re-throw with enhanced error message for better debugging
  throw new Error(enhancedErrorMessage);
}
