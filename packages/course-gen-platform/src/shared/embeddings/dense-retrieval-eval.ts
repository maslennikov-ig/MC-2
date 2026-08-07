/**
 * Live dense+sparse retrieval scoring for the chunking A/B.
 *
 * Where `retrieval-metrics.ts` reproduces only the lexical half offline, this
 * module measures what production actually does: it calls
 * `generateEmbeddingsWithLateChunking` exactly as
 * `phase-5-embedding.ts` does — ONE call, every chunk, `late_chunking: true` —
 * and uploads the result into a throwaway Qdrant collection built from the SAME
 * `COLLECTION_CREATE_PARAMS` as the production one, then queries through the
 * production `searchChunks` path with `enable_hybrid` — server-side BM25 and
 * dense prefetch fused by RRF.
 *
 * The first version split parents and children into two calls with different
 * `late_chunking` flags, following a helper's docblock rather than the
 * production call site. Under late chunking the request input IS the context,
 * so two calls produce different vectors from the one production makes: the
 * benchmark would have ranked an embedding policy nobody runs.
 *
 * It calls a PAID external API (`api.jina.ai`). Nothing here runs unless a
 * caller explicitly asks for it, and the temporary collection is always dropped.
 * Existing collections are never read or written: the collection name is
 * generated per run and refused if it collides with the production alias.
 *
 * @module shared/embeddings/dense-retrieval-eval
 */

import { qdrantClient } from '../qdrant/client.js';
import { COLLECTION_CREATE_PARAMS, PAYLOAD_INDEXES } from '../qdrant/collection-schema.js';
import { QDRANT_COLLECTION_ALIAS } from '../qdrant/config.js';
import { searchChunks } from '../qdrant/search.js';
import { toQdrantPoint, toUpsertPoints } from '../qdrant/upload-helpers.js';
import { logger } from '../logger/index.js';
import { generateEmbeddingsWithLateChunking } from './generate.js';
import type { EnrichedChunk } from './metadata-enricher.js';
import {
  buildRetrievalReport,
  scoreQuestion,
  type GroundTruthQuestion,
  type RetrievalReport,
  type ScorableChunk,
} from './retrieval-metrics.js';

/** Matches the production uploader's default and stays under strict mode's 128. */
const UPSERT_BATCH_SIZE = 100;

export interface DenseRetrievalEvalOptions {
  /** Throwaway collection name; must not be the production alias. */
  collectionName: string;
  k?: number;
  /** Tokens billed to the Jina account, accumulated across calls. */
  onTokens?: (tokens: number) => void;
}

export interface DenseRetrievalEvalResult {
  report: RetrievalReport;
  /** Embedding tokens actually billed for this evaluation. */
  billedTokens: number;
  pointsUploaded: number;
}

function toScorable(chunk: EnrichedChunk): ScorableChunk {
  return {
    chunk_id: chunk.chunk_id,
    content: chunk.content,
    heading_path: chunk.heading_path,
    provenance: chunk.provenance ? { self_refs: chunk.provenance.self_refs } : undefined,
  };
}

/**
 * Embeds a chunk set, indexes it, and scores the ground-truth questions
 * through the production hybrid search path.
 *
 * The embedding call is byte-for-byte the one `phase-5-embedding.ts` makes.
 * Measuring a different embedding policy than production uses would answer a
 * question nobody asked.
 */
export async function evaluateDenseRetrieval(
  chunks: readonly EnrichedChunk[],
  questions: readonly GroundTruthQuestion[],
  options: DenseRetrievalEvalOptions
): Promise<DenseRetrievalEvalResult> {
  const { collectionName } = options;
  const k = options.k ?? 5;

  if (collectionName === QDRANT_COLLECTION_ALIAS) {
    throw new Error(
      `Refusing to run the benchmark against the production alias ${QDRANT_COLLECTION_ALIAS}`
    );
  }

  let billedTokens = 0;

  await qdrantClient.createCollection(collectionName, COLLECTION_CREATE_PARAMS);

  try {
    // The production collection's payload indexes are not decoration: with
    // `strict_mode_config.unindexed_filtering_retrieve: false`, a filtered query
    // against an unindexed field is rejected outright, and hybrid search
    // silently degrades to its dense-only fallback. An index-less copy would
    // have measured a different engine than the one production runs. Creating
    // them inside the `try` keeps a failed index from leaking the collection.
    for (const index of PAYLOAD_INDEXES) {
      await qdrantClient.createPayloadIndex(collectionName, {
        field_name: index.field_name,
        field_schema: index.field_schema,
        wait: true,
      });
    }

    const embedded = await generateEmbeddingsWithLateChunking(
      [...chunks],
      'retrieval.passage',
      true
    );
    billedTokens = embedded.total_tokens;
    options.onTokens?.(billedTokens);

    // Upserted through the production point builders, but NOT through
    // `uploadChunksToQdrant`: that also writes `vector_status` back to the
    // document catalog, and a benchmark over throwaway ids has no business
    // touching a real database. The vectors and payloads are identical.
    const points = toUpsertPoints(
      embedded.embeddings.map(result => toQdrantPoint(result, true)),
      true
    );
    // Batched exactly like the production uploader: the collection's strict mode
    // caps an upsert at 128 points, so a single call for a 20-page PDF is
    // rejected with a bare `Bad Request`.
    for (let offset = 0; offset < points.length; offset += UPSERT_BATCH_SIZE) {
      await qdrantClient.upsert(collectionName, {
        wait: true,
        points: points.slice(offset, offset + UPSERT_BATCH_SIZE),
      });
    }

    // Only children are retrievable units in production RAG; parents are
    // fetched by id once a child matches. Scoring parents as if they competed
    // for the same slots would flatter whichever strategy makes fewer of them.
    const corpus = chunks.filter(chunk => chunk.level === 'child').map(toScorable);

    const outcomes = [];
    for (const question of questions) {
      const response = await searchChunks(question.query, {
        collection_name: collectionName,
        limit: k,
        score_threshold: 0,
        enable_hybrid: true,
        include_payload: true,
        filters: { level: 'child' },
      });

      // A silent fallback to dense-only would answer a different question than
      // "how does production's hybrid ranking behave", so it fails the run.
      if (response.metadata.fallback_used || response.metadata.search_type !== 'hybrid') {
        throw new Error(
          `Hybrid search degraded to ${response.metadata.search_type} (fallback=${response.metadata.fallback_used}) for question ${question.id}`
        );
      }

      const byId = new Map(corpus.map(chunk => [chunk.chunk_id, chunk]));
      const ranked = response.results
        .map(result => byId.get(result.chunk_id))
        .filter((chunk): chunk is ScorableChunk => chunk !== undefined);

      outcomes.push(scoreQuestion(ranked, corpus, question, k));
    }

    logger.debug(
      { collectionName, billedTokens, points: points.length },
      'Dense retrieval evaluation completed'
    );

    return {
      report: buildRetrievalReport(outcomes, k),
      billedTokens,
      pointsUploaded: points.length,
    };
  } finally {
    await qdrantClient.deleteCollection(collectionName).catch((error: unknown) => {
      logger.warn(
        { collectionName, err: error instanceof Error ? error.message : String(error) },
        'Failed to drop the temporary benchmark collection'
      );
    });
  }
}
