/**
 * Phase 5: Embedding Generation
 *
 * Generates embeddings for chunks using late chunking strategy for improved
 * semantic coherence across chunk boundaries.
 *
 * @module stages/stage2-document-processing/phases/phase-5-embedding
 */

import { Job } from 'bullmq';
import type { DocumentProcessingJobData } from '@megacampus/shared-types';
import { generateEmbeddingsWithLateChunking } from '../../../shared/embeddings/generate.js';
import type { EnrichedChunk } from '../../../shared/embeddings/metadata-enricher.js';
import { logger } from '../../../shared/logger/index.js';

/**
 * Execute embedding generation phase
 *
 * Generates embeddings using late chunking strategy for better semantic quality
 *
 * @param enrichedChunks - Chunks enriched with metadata
 * @param job - BullMQ job instance for progress tracking
 * @returns Batch result with embeddings and token usage
 */
export async function executeEmbeddingGeneration(
  enrichedChunks: EnrichedChunk[],
  job: Job<DocumentProcessingJobData>
): Promise<ReturnType<typeof generateEmbeddingsWithLateChunking>> {
  // Generate embeddings with late chunking (60-80% progress)
  const batchResult = await generateEmbeddingsWithLateChunking(
    enrichedChunks,
    'retrieval.passage',
    true // late_chunking enabled
  );

  await job.updateProgress(80);

  logger.debug({
    jobId: job.id,
    embeddingCount: batchResult.embeddings.length,
    totalTokens: batchResult.total_tokens,
  }, 'Embeddings generated');

  return batchResult;
}
