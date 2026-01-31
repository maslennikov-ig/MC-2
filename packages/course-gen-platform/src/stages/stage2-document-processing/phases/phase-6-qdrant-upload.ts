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

/** Qdrant upload timeout in milliseconds (60 seconds) */
const QDRANT_UPLOAD_TIMEOUT_MS = 60000;

/** Maximum retry attempts for Qdrant upload */
const MAX_QDRANT_RETRIES = 3;

/** Base delay for exponential backoff (ms) */
const BASE_RETRY_DELAY_MS = 2000;

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
 */
function getDocumentIds(embeddings: EmbeddingResult[]): string[] {
  const ids = new Set<string>();
  for (const embedding of embeddings) {
    if (embedding.chunk?.document_id) {
      ids.add(embedding.chunk.document_id);
    }
  }
  return Array.from(ids);
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

  // All retries exhausted - update documents to 'failed' status to prevent stuck 'indexing'
  const errorMessage = lastError?.message || 'Qdrant upload failed after all retries';

  logger.error(
    {
      jobId: job.id,
      documentIds,
      error: errorMessage,
    },
    'Qdrant upload failed after all retries, marking documents as failed'
  );

  // Update each document's vector_status to 'failed'
  for (const documentId of documentIds) {
    try {
      await updateVectorStatus(documentId, 'failed', errorMessage);
    } catch (updateError) {
      logger.error(
        {
          documentId,
          error: updateError instanceof Error ? updateError.message : String(updateError),
        },
        'Failed to update document vector_status to failed'
      );
    }
  }

  // Re-throw the error to mark the job as failed
  throw lastError || new Error('Qdrant upload failed after all retries');
}
