/**
 * Phase 4: Hierarchical Chunking
 *
 * Chunks markdown content using hierarchical strategy (parent + child chunks)
 * and enriches with metadata for RAG retrieval.
 *
 * @module stages/stage2-document-processing/phases/phase-4-chunking
 */

import { Job } from 'bullmq';
import type { DocumentProcessingJobData, DocumentPriorityLevel } from '@megacampus/shared-types';
import {
  selectIndexableChunks,
  DEFAULT_CHUNKING_CONFIG,
} from '../../../shared/embeddings/markdown-chunker.js';
import {
  chunkWithStrategy,
  type NativeChunkingInput,
  type StrategyChunkingResult,
} from '../../../shared/embeddings/chunking-strategy.js';
import { enrichChunks } from '../../../shared/embeddings/metadata-enricher.js';
import type { DoclingDocument } from '../docling/types.js';
import { logger } from '../../../shared/logger/index.js';

/**
 * Metadata to enrich chunks with
 */
export interface ChunkMetadata {
  document_id: string;
  document_name: string;
  organization_id: string;
  course_id: string;
  /**
   * Document priority from file_catalog
   * Used for priority boosting during RAG retrieval
   * @see docs/tasks/REFACTOR-RAG-PRIORITY-BASED-RETRIEVAL.md
   */
  document_priority: DocumentPriorityLevel;
  /**
   * Document weight for priority boosting
   * 1.0 for CORE, 0.8 for IMPORTANT, 0.5 for SUPPLEMENTARY
   */
  document_weight: number;
}

/**
 * Chunking result
 */
export interface ChunkingResult {
  chunks: StrategyChunkingResult;
  enrichedChunks: ReturnType<typeof enrichChunks>;
}

/** Optional Docling inputs that enable structure-aware chunking. */
export interface ChunkingSource {
  /** Accepted conversion identity; absent for plain-text/fallback paths. */
  docling?: NativeChunkingInput;
  /** Normalized Docling document, used to enrich chunk metadata. */
  docling_json?: DoclingDocument;
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
  job: Job<DocumentProcessingJobData>,
  source: ChunkingSource = {}
): Promise<ChunkingResult> {
  // Step 1: Chunk markdown content (50-55% progress)
  const chunkingResult = await chunkWithStrategy(markdown, {
    source: source.docling,
    config: DEFAULT_CHUNKING_CONFIG,
  });

  // Chunks worth embedding: a parent whose text is exactly its only child's
  // text is skipped, since indexing it would store and pay for the same vector
  // twice and return the same passage twice in every search.
  const allChunks = selectIndexableChunks(chunkingResult);
  const skippedParents =
    chunkingResult.parent_chunks.length + chunkingResult.child_chunks.length - allChunks.length;

  logger.info(
    {
      jobId: job.id,
      strategy: chunkingResult.strategy,
      chunkingProfileId: chunkingResult.chunkingProfileId,
      parentChunks: chunkingResult.parent_chunks.length,
      childChunks: chunkingResult.child_chunks.length,
      skippedDuplicateParents: skippedParents,
      totalChunks: allChunks.length,
      refCoverage: Number(chunkingResult.coverage.refCoverage.toFixed(4)),
      locationCoverage: Number(chunkingResult.coverage.locationCoverage.toFixed(4)),
      locationEligible: chunkingResult.coverage.locationEligible,
    },
    'Document chunked'
  );

  // Step 2: Enrich chunks with metadata (55-60% progress)
  await job.updateProgress(55);

  const enrichedChunks = enrichChunks(allChunks, {
    document_id: metadata.document_id,
    document_name: metadata.document_name,
    organization_id: metadata.organization_id,
    course_id: metadata.course_id,
    document_priority: metadata.document_priority,
    document_weight: metadata.document_weight,
    // The normalized Docling document never reached enrichment before, so page
    // metadata was silently null for every chunk of every document.
    ...(source.docling_json ? { docling_json: source.docling_json } : {}),
  });

  await job.updateProgress(60);

  const result: ChunkingResult = {
    chunks: chunkingResult,
    enrichedChunks,
  };

  return result;
}
