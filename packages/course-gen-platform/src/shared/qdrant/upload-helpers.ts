/**
 * Qdrant upload helper functions
 *
 * @module shared/qdrant/upload-helpers
 */

import type { EmbeddingResult } from '../embeddings/generate';
import { getGlobalBM25Scorer, type SparseVector } from '../embeddings/bm25';
import type { QdrantUploadPoint, QdrantUpsertPoint, QdrantNamedVector } from './upload-types';
import { logger } from '../logger/index.js';

/**
 * Generates a numeric ID from chunk_id string
 */
export function generateNumericId(chunk_id: string): number {
  let hash = 0;
  for (let i = 0; i < chunk_id.length; i++) {
    const char = chunk_id.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Builds corpus statistics from embedding results
 */
export function buildCorpusStatistics(embeddingResults: EmbeddingResult[]): void {
  const bm25Scorer = getGlobalBM25Scorer();

  // Extract all document texts for corpus statistics
  const documents = embeddingResults.map((result) => result.chunk.content);

  // Build corpus statistics (calculates IDF, avg doc length, etc.)
  logger.info({ documentCount: documents.length }, 'Building corpus statistics');
  bm25Scorer.addDocuments(documents);

  const stats = bm25Scorer.getCorpusStats();
  logger.info({
    totalDocuments: stats.total_documents,
    uniqueTerms: stats.document_frequencies.size,
    avgDocLength: Number(stats.average_document_length.toFixed(2)),
    totalTokens: stats.total_tokens
  }, 'Corpus statistics calculated');
}

/**
 * Generates production BM25 sparse vector from text
 */
export function generateBM25SparseVector(text: string): SparseVector {
  const bm25Scorer = getGlobalBM25Scorer();
  return bm25Scorer.generateSparseVector(text);
}

/**
 * Converts enriched chunk with embedding to Qdrant point
 */
export function toQdrantPoint(
  embeddingResult: EmbeddingResult,
  enable_sparse: boolean
): QdrantUploadPoint {
  const { chunk, dense_vector } = embeddingResult;

  // Generate numeric ID from chunk_id
  const id = generateNumericId(chunk.chunk_id);

  // Prepare vector
  const vector: QdrantUploadPoint['vector'] = {
    dense: dense_vector,
  };

  // Add sparse vector if enabled
  if (enable_sparse) {
    vector.sparse = generateBM25SparseVector(chunk.content);
  }

  // Prepare payload (comprehensive metadata)
  const rawPayload = {
    // Chunk metadata
    chunk_id: chunk.chunk_id,
    parent_chunk_id: chunk.parent_chunk_id,
    sibling_chunk_ids: chunk.sibling_chunk_ids,
    level: chunk.level,
    content: chunk.content,
    token_count: chunk.token_count,
    char_count: chunk.char_count,
    chunk_index: chunk.chunk_index,
    total_chunks: chunk.total_chunks,
    chunk_strategy: chunk.chunk_strategy,
    overlap_tokens: chunk.overlap_tokens,

    // Document hierarchy
    heading_path: chunk.heading_path,
    chapter: chunk.chapter,
    section: chunk.section,

    // Document metadata
    document_id: chunk.document_id,
    document_name: chunk.document_name,
    document_version: chunk.document_version,
    version_hash: chunk.version_hash,

    // Source location
    page_number: chunk.page_number,
    page_range: chunk.page_range,

    // Content metadata
    has_code: chunk.has_code,
    has_formulas: chunk.has_formulas,
    has_tables: chunk.has_tables,
    has_images: chunk.has_images,

    // Multi-tenancy
    organization_id: chunk.organization_id,
    course_id: chunk.course_id,

    // Timestamps
    indexed_at: chunk.indexed_at,
    last_updated: chunk.last_updated,

    // References
    image_refs: chunk.image_refs,
    table_refs: chunk.table_refs,
  };

  // Filter out null/undefined values to avoid Qdrant validation errors
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawPayload)) {
    if (value !== null && value !== undefined) {
      payload[key] = value;
    }
  }

  return { id, vector, payload };
}

/**
 * Converts Qdrant upload points to upsert points with named vectors
 */
export function toUpsertPoints(
  points: QdrantUploadPoint[],
  enable_sparse: boolean
): QdrantUpsertPoint[] {
  return points.map((point) => {
    // Build named vector structure
    const namedVector: QdrantNamedVector = { dense: point.vector.dense };

    // Add sparse vector if enabled
    if (enable_sparse && point.vector.sparse) {
      namedVector.sparse = point.vector.sparse;
    }

    return {
      id: point.id,
      vector: namedVector,
      payload: point.payload,
    };
  });
}

/**
 * Gets unique document IDs from embedding results
 */
export function getUniqueDocumentIds(embeddingResults: EmbeddingResult[]): string[] {
  return Array.from(new Set(embeddingResults.map((r) => r.chunk.document_id)));
}
