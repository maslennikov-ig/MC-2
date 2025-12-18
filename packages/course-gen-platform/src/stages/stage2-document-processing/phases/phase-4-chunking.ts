/**
 * Phase 4: Hierarchical Chunking
 *
 * Chunks markdown content using hierarchical strategy (parent + child chunks)
 * and enriches with metadata for RAG retrieval.
 *
 * @module stages/stage2-document-processing/phases/phase-4-chunking
 */

import { Job } from 'bullmq';
import type { DocumentProcessingJobData } from '@megacampus/shared-types';
import { chunkMarkdown, getAllChunks, DEFAULT_CHUNKING_CONFIG } from '../../../shared/embeddings/markdown-chunker.js';
import { enrichChunks } from '../../../shared/embeddings/metadata-enricher.js';
import { logger } from '../../../shared/logger/index.js';

/**
 * Metadata to enrich chunks with
 */
export interface ChunkMetadata {
  document_id: string;
  document_name: string;
  organization_id: string;
  course_id: string;
}

/**
 * Chunking result
 */
export interface ChunkingResult {
  chunks: Awaited<ReturnType<typeof chunkMarkdown>>;
  enrichedChunks: ReturnType<typeof enrichChunks>;
}

/**
 * Execute hierarchical chunking phase
 *
 * Chunks markdown into parent and child chunks, then enriches with metadata
 *
 * @param markdown - Markdown content to chunk
 * @param metadata - Metadata to attach to chunks
 * @param job - BullMQ job instance for logging
 * @returns Chunking result with parent/child chunks and enriched chunks
 */
export async function executeChunking(
  markdown: string,
  metadata: ChunkMetadata,
  job: Job<DocumentProcessingJobData>
): Promise<ChunkingResult> {
  // Step 1: Chunk markdown content (50-55% progress)
  const chunkingResult = await chunkMarkdown(markdown, DEFAULT_CHUNKING_CONFIG);

  // Get all chunks (parent + child) for embedding
  const allChunks = getAllChunks(chunkingResult);

  logger.debug({
    jobId: job.id,
    parentChunks: chunkingResult.parent_chunks.length,
    childChunks: chunkingResult.child_chunks.length,
    totalChunks: allChunks.length,
  }, 'Document chunked');

  // Step 2: Enrich chunks with metadata (55-60% progress)
  await job.updateProgress(55);

  const enrichedChunks = enrichChunks(allChunks, {
    document_id: metadata.document_id,
    document_name: metadata.document_name,
    organization_id: metadata.organization_id,
    course_id: metadata.course_id,
  });

  await job.updateProgress(60);

  const result: ChunkingResult = {
    chunks: chunkingResult,
    enrichedChunks,
  };

  return result;
}
