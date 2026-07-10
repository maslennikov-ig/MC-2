/**
 * Qdrant upload helper functions
 *
 * @module shared/qdrant/upload-helpers
 */

import { createHash } from 'node:crypto';
import type { EmbeddingResult } from '../embeddings/generate';
import { toQdrantPayload } from '../embeddings/metadata-enricher';
import type { QdrantUploadPoint, QdrantUpsertPoint, QdrantNamedVector } from './upload-types';
import { createBm25Document } from './config';

/**
 * Generates a deterministic document-scoped UUIDv8 point ID.
 *
 * Qdrant point IDs are global inside a collection. Hashing only chunk_id made
 * identical chunks from different documents overwrite each other, while the
 * previous 32-bit output also had a small collision space. This keeps 122 bits
 * of a SHA-256 digest and marks the UUID as RFC 9562 version 8.
 */
export function generatePointId(documentId: string, chunkId: string): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([documentId, chunkId]), 'utf8')
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x80;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
    id: generatePointId(chunk.document_id, chunk.chunk_id),
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
