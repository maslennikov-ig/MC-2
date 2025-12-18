/**
 * Phase 6: Qdrant Upload
 *
 * Uploads chunk embeddings to Qdrant vector database for RAG retrieval.
 * Updates vector_status to 'indexed' on successful upload.
 *
 * @module stages/stage2-document-processing/phases/phase-6-qdrant-upload
 */

import { Job } from 'bullmq';
import type { DocumentProcessingJobData } from '@megacampus/shared-types';
import { uploadChunksToQdrant } from '../../../shared/qdrant/upload.js';
import type { EmbeddingResult } from '../../../shared/embeddings/generate.js';
import { logger } from '../../../shared/logger/index.js';

/**
 * Execute Qdrant upload phase
 *
 * Uploads embeddings to Qdrant vector database in batches
 *
 * @param embeddings - Chunks with generated embeddings
 * @param job - BullMQ job instance for progress tracking
 * @returns Upload result with points uploaded, batch count, and duration
 */
export async function executeQdrantUpload(
  embeddings: EmbeddingResult[],
  job: Job<DocumentProcessingJobData>
): Promise<ReturnType<typeof uploadChunksToQdrant>> {
  // Upload vectors to Qdrant (80-95% progress)
  const uploadResult = await uploadChunksToQdrant(embeddings, {
    batch_size: 100,
    wait: true,
    enable_sparse: false,
  });

  await job.updateProgress(95);

  logger.debug({
    jobId: job.id,
    pointsUploaded: uploadResult.points_uploaded,
    batchCount: uploadResult.batch_count,
    durationMs: uploadResult.duration_ms,
  }, 'Vectors uploaded to Qdrant');

  return uploadResult;
}
