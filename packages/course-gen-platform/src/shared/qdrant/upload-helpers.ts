/**
 * Qdrant upload helper functions
 *
 * @module shared/qdrant/upload-helpers
 */

import type { EmbeddingResult } from '../embeddings/generate';
import { toQdrantPayload } from '../embeddings/metadata-enricher';
import type { QdrantUploadPoint, QdrantUpsertPoint, QdrantNamedVector } from './upload-types';
import { createBm25Document } from './config';

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

export function compactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== null && value !== undefined)
  );
}

function assertValidDocumentWeight(payload: Record<string, unknown>): void {
  const weight = payload.document_weight;
  if (weight === null || weight === undefined) {
    return;
  }

  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0.5 || weight > 1) {
    throw new RangeError('document_weight must be a finite number between 0.5 and 1.0');
  }
}

/**
 * Converts enriched chunk with embedding to Qdrant point
 */
export function toQdrantPoint(
  embeddingResult: EmbeddingResult,
  enable_sparse: boolean
): QdrantUploadPoint {
  const { chunk, dense_vector } = embeddingResult;
  const rawPayload = toQdrantPayload(chunk);
  assertValidDocumentWeight(rawPayload);

  const vector: QdrantUploadPoint['vector'] = {
    dense: dense_vector,
    ...(enable_sparse ? { sparse: createBm25Document(chunk.content) } : {}),
  };

  return {
    id: generateNumericId(chunk.chunk_id),
    vector,
    payload: compactPayload(rawPayload),
  };
}

/**
 * Converts Qdrant upload points to upsert points with named vectors
 */
export function toUpsertPoints(
  points: QdrantUploadPoint[],
  enable_sparse: boolean
): QdrantUpsertPoint[] {
  return points.map(point => {
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
  return Array.from(new Set(embeddingResults.map(r => r.chunk.document_id)));
}
