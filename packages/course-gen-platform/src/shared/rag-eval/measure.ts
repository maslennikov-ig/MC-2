/**
 * The four measurements this repository did not have.
 *
 * 1. Recall@k and MRR per entry point, at the settings in force.
 * 2. What the dense threshold keeps and what it throws away, across a sweep.
 * 3. Which branch of the hybrid an accepted result actually came from.
 * 4. What parent expansion adds, in tokens and in relevance.
 *
 * Everything runs against the live collection, read-only, through the real
 * retrieval code. Scoring reuses `shared/embeddings/retrieval-metrics`, which
 * already computes these quantities correctly for the chunking A/B and carries
 * the reasoning for why the denominators are what they are; a second scorer
 * would be a second place for the same bug.
 *
 * @module shared/rag-eval/measure
 */

import { createHash } from 'node:crypto';

import type { Schemas } from '@qdrant/js-client-rest';

import { qdrantClient } from '../qdrant/client';
import { searchChunks } from '../qdrant/search';
import type { SearchResult } from '../qdrant/search-types';
import { STRICT_MODE_MAX_QUERY_LIMIT, buildHybridPrefetch } from '../qdrant/search-operations';
import { expandToSiblingContext } from '../qdrant/context-expansion';
import { extractPayload } from '../qdrant/search-helpers';
import { generateQueryEmbedding } from '../embeddings/generate';
import {
  buildRetrievalReport,
  scoreQuestion,
  type GroundTruthQuestion,
  type RetrievalReport,
  type ScorableChunk,
} from '../embeddings/retrieval-metrics';
import type { EvalQuery, EvalSet } from './eval-set';
import type { EntryPoint } from './entry-points';

/**
 * The largest page the collection will serve, scroll included.
 *
 * Re-exported rather than restated: it is the same ceiling the retrieval code
 * clamps its prefetch to, and a benchmark carrying its own copy would keep
 * scrolling happily after the collection's strict mode changed underneath it.
 */
export const STRICT_MODE_MAX_LIMIT = STRICT_MODE_MAX_QUERY_LIMIT;

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

/**
 * Every chunk of one course, which is the denominator recall is divided by.
 *
 * Course-scoped rather than collection-wide because every retrieving entry
 * point filters by `course_id`: a chunk in another course is not a missed
 * result, it is not a candidate at all, and counting it would understate recall
 * by the ratio of the corpus to the course.
 */
export async function fetchCourseCorpus(
  courseId: string,
  collectionName: string
): Promise<ScorableChunk[]> {
  const chunks: ScorableChunk[] = [];
  // Qdrant's scroll cursor is a point id, and this collection's ids are UUIDs.
  let offset: string | number | undefined;

  do {
    const page = await qdrantClient.scroll(collectionName, {
      filter: { must: [{ key: 'course_id', match: { value: courseId } }] },
      limit: STRICT_MODE_MAX_LIMIT,
      with_payload: true,
      with_vector: false,
      ...(offset === undefined ? {} : { offset }),
    });

    for (const point of page.points) {
      const payload = extractPayload(point);
      chunks.push({
        chunk_id: payload.chunk_id,
        content: payload.content,
        heading_path: payload.heading_path,
      });
    }

    const next = page.next_page_offset;
    offset = typeof next === 'string' || typeof next === 'number' ? next : undefined;
  } while (offset !== undefined);

  return chunks;
}

// ---------------------------------------------------------------------------
// 1 + 2. Recall, MRR and the threshold curve
// ---------------------------------------------------------------------------

export interface QueryRun {
  query: EvalQuery;
  results: SearchResult[];
  /** True when hybrid degraded to dense-only, which changes what was measured. */
  fallbackUsed: boolean;
  searchType: 'dense' | 'hybrid';
}

/** Issues one evaluation query through the entry point's own request builder. */
export async function runQuery(
  point: EntryPoint,
  query: EvalQuery,
  threshold: number,
  collectionName: string
): Promise<QueryRun> {
  const response = await searchChunks(query.query, {
    ...point.buildOptions(query, threshold),
    collection_name: collectionName,
  });

  return {
    query,
    results: response.results,
    fallbackUsed: response.metadata.fallback_used,
    searchType: response.metadata.search_type,
  };
}

function toGroundTruth(query: EvalQuery): GroundTruthQuestion {
  return { id: query.id, query: query.query, evidence: query.evidence };
}

function toScorable(result: SearchResult): ScorableChunk {
  return {
    chunk_id: result.chunk_id,
    content: result.content,
    heading_path: result.heading_path,
  };
}

/**
 * Orders equally-scored results the same way on every run.
 *
 * Measured 2026-08-26: the dense-only entry point returns byte-identical
 * rankings run after run, while both hybrid entry points changed their top-10
 * on about one query in four. The cause is ties, not approximation — an RRF
 * score is a sum of `1/(k + rank)` over at most two branches, so large numbers
 * of candidates share a score exactly, and this corpus makes it worse by
 * holding 4127 duplicate copies of 2729 distinct texts, which score
 * identically in BM25 by construction. Among equal scores Qdrant's order is
 * arbitrary and it varies.
 *
 * Arbitrary is not the same as meaningful: a measurement that moves when
 * nothing changed cannot show that something did.
 *
 * The tie-break is a hash of the chunk id, NOT the id itself. Ordering ties by
 * id looks like the obvious choice — `retrieval-metrics` breaks its offline
 * ties that way — and here it silently inflated recall: the evaluation set
 * samples chunks in id order, so the ground-truth chunk was systematically the
 * one an id-ordered tie-break promoted. Measured: Stage 6 recall@5 read 0.9032
 * under the id tie-break against 0.8387 with no tie-break at all, a difference
 * produced entirely by the scorer agreeing with the sampler. A hash is equally
 * deterministic and carries no such agreement.
 *
 * This orders the measurement, never production: which of two tied candidates
 * a caller receives is Qdrant's business and is not affected by anything here.
 */
function tieKey(chunkId: string): string {
  return createHash('sha1').update(chunkId).digest('hex');
}

function stableOrder(results: readonly SearchResult[]): SearchResult[] {
  return [...results].sort((left, right) =>
    right.score === left.score
      ? tieKey(left.chunk_id).localeCompare(tieKey(right.chunk_id))
      : right.score - left.score
  );
}

export interface ThresholdOutcome {
  threshold: number;
  /** Scored over the queries that carry ground truth. */
  report: RetrievalReport;
  /** Counted over ALL queries, including the real-wording ones. */
  queriesRun: number;
  queriesReturningNothing: number;
  meanResults: number;
  /** Hybrid requests that came back as dense-only. */
  fallbacks: number;
  /**
   * Every ranked list, kept so that "the same chunks in the same order" is a
   * checkable claim rather than a recollection.
   */
  ranked: Array<{ id: string; chunkIds: string[]; scores: number[] }>;
}

/**
 * Runs the whole set at one threshold and scores it.
 *
 * A legitimate zero is data here, not a missing measurement: a query that
 * returns nothing at 0.35 is the finding, and `meanResults` divides by every
 * query rather than only by the ones that answered.
 */
export async function measureAtThreshold(
  point: EntryPoint,
  set: EvalSet,
  threshold: number,
  collectionName: string,
  corpusByCourse: Map<string, ScorableChunk[]>,
  k: number
): Promise<ThresholdOutcome> {
  const outcomes = [];
  const ranked: ThresholdOutcome['ranked'] = [];
  let totalResults = 0;
  let empty = 0;
  let fallbacks = 0;

  for (const query of set.queries) {
    const run = await runQuery(point, query, threshold, collectionName);
    const ordered = stableOrder(run.results);

    totalResults += run.results.length;
    if (run.results.length === 0) empty += 1;
    if (run.fallbackUsed) fallbacks += 1;
    ranked.push({
      id: query.id,
      chunkIds: ordered.map(result => result.chunk_id),
      scores: ordered.map(result => result.score),
    });

    if (query.evidence.length === 0) continue;

    const corpus = corpusByCourse.get(query.course_id);
    if (!corpus) {
      throw new Error(`No corpus loaded for course ${query.course_id} (query ${query.id})`);
    }
    outcomes.push(scoreQuestion(ordered.map(toScorable), corpus, toGroundTruth(query), k));
  }

  return {
    threshold,
    report: buildRetrievalReport(outcomes, k),
    queriesRun: set.queries.length,
    queriesReturningNothing: empty,
    meanResults: set.queries.length > 0 ? totalResults / set.queries.length : 0,
    fallbacks,
    ranked,
  };
}

// ---------------------------------------------------------------------------
// 3. Branch attribution
// ---------------------------------------------------------------------------

export interface BranchAttribution {
  queryId: string;
  /** Accepted results, i.e. what the fused query actually returned. */
  accepted: number;
  fromDenseOnly: number;
  fromSparseOnly: number;
  fromBoth: number;
  /**
   * Accepted, and in neither branch's list even at the deepest legal look.
   *
   * This is not noise and it is not a third retriever. Measured 2026-08-26: a
   * grouped query (`group_by_document`) fills each document's group past what
   * the prefetch returned — 10 of 20 accepted results on one probe came from
   * that fill, and the identical query with grouping off had zero. So for a
   * grouped entry point this bucket is the share of the answer that did not
   * come through hybrid fusion at all, and it is reported rather than folded
   * into whichever branch is nearest.
   *
   * No entry point measured here groups any more — Stage 6 stopped on
   * 2026-08-27 and the bucket went from 124 of 475 to zero — so a non-zero
   * value now means something new and should be looked at rather than assumed.
   */
  fromBeyondBranchDepth: number;
  denseCandidates: number;
  sparseCandidates: number;
}

/**
 * Runs one prefetch branch, at the deepest depth the collection will serve.
 *
 * Deeper than the prefetch the fused query used, deliberately: at exactly the
 * prefetch depth, an accepted result that the grouping step fetched from
 * further down is indistinguishable from one no branch could produce. Looking
 * as deep as strict mode allows makes `fromBeyondBranchDepth` mean what it
 * says instead of meaning "deeper than I looked".
 */
async function runBranch(
  branch: Schemas['Prefetch'],
  collectionName: string
): Promise<Set<string>> {
  const response = await qdrantClient.query(collectionName, {
    query: branch.query,
    ...(branch.using === undefined ? {} : { using: branch.using }),
    ...(branch.filter === undefined ? {} : { filter: branch.filter }),
    ...(branch.score_threshold === undefined ? {} : { score_threshold: branch.score_threshold }),
    limit: STRICT_MODE_MAX_LIMIT,
    with_payload: true,
  });

  return new Set(response.points.map(point => extractPayload(point).chunk_id));
}

/**
 * Splits every accepted result by the branch that could have produced it.
 *
 * The two prefetch branches come from `buildHybridPrefetch`, the same function
 * the hybrid query builds them with, so this measures the branches that ran
 * rather than two that resemble them. A branch that never contributes a UNIQUE
 * accepted result is a branch that is not doing its job, whatever the label on
 * the call says — and that is a condition no metric in this repository can
 * currently report: `megacampus_qdrant_hybrid_fallback_total` counts hard
 * degradation to dense-only, not a branch that runs and contributes nothing.
 */
export async function attributeBranches(
  point: EntryPoint,
  query: EvalQuery,
  threshold: number,
  collectionName: string
): Promise<BranchAttribution> {
  const options = point.buildOptions(query, threshold);
  const run = await runQuery(point, query, threshold, collectionName);
  const accepted = run.results.map(result => result.chunk_id);

  const vector = await generateQueryEmbedding(query.query);
  const [sparseBranch, denseBranch] = buildHybridPrefetch(query.query, vector, {
    limit: options.limit ?? 10,
    score_threshold: threshold,
    collection_name: collectionName,
    enable_hybrid: true,
    include_payload: true,
    filters: options.filters ?? {},
    enable_priority_boost: options.enable_priority_boost ?? false,
    priority_boost_factor: options.priority_boost_factor ?? 0.4,
    group_by_document: options.group_by_document ?? false,
    group_size: options.group_size ?? 2,
  });

  const [sparseIds, denseIds] = await Promise.all([
    runBranch(sparseBranch, collectionName),
    runBranch(denseBranch, collectionName),
  ]);

  let denseOnly = 0;
  let sparseOnly = 0;
  let both = 0;
  let beyond = 0;

  for (const chunkId of accepted) {
    const inDense = denseIds.has(chunkId);
    const inSparse = sparseIds.has(chunkId);
    if (inDense && inSparse) both += 1;
    else if (inDense) denseOnly += 1;
    else if (inSparse) sparseOnly += 1;
    else beyond += 1;
  }

  return {
    queryId: query.id,
    accepted: accepted.length,
    fromDenseOnly: denseOnly,
    fromSparseOnly: sparseOnly,
    fromBoth: both,
    fromBeyondBranchDepth: beyond,
    denseCandidates: denseIds.size,
    sparseCandidates: sparseIds.size,
  };
}

// ---------------------------------------------------------------------------
// 4. Expansion effect
// ---------------------------------------------------------------------------

export interface ExpansionOutcome {
  queryId: string;
  chunkId: string;
  /** The passage must still contain what matched; false is a defect. */
  retainsMatchedText: boolean;
  tokensBefore: number;
  tokensAfter: number;
  /** Siblings the point declares. Zero makes expansion structurally impossible. */
  declaredSiblings: number;
  /** True when every stitched piece shares the matched chunk's heading path. */
  staysInSection: boolean;
}

/**
 * Measures what expansion did to each accepted result.
 *
 * Expansion is called with the entry point's own budget and on the results the
 * entry point would have expanded, so `tokensAfter / tokensBefore` is the
 * multiplier the model is actually charged for. `retainsMatchedText` is the
 * one hard requirement: a passage that no longer contains the fragment that
 * matched has replaced the evidence rather than widened it.
 */
export async function measureExpansion(
  run: QueryRun,
  budgetTokens: number,
  collectionName: string
): Promise<ExpansionOutcome[]> {
  if (run.results.length === 0) return [];

  const before = run.results.map(result => ({
    document_id: result.document_id,
    chunk_id: result.chunk_id,
    parent_chunk_id: result.parent_chunk_id ?? null,
    sibling_chunk_ids: result.sibling_chunk_ids ?? [],
    content: result.content,
    token_count: result.token_count,
    score: result.score,
    heading_path: result.heading_path,
  }));

  const after = await expandToSiblingContext(before, {
    collectionName,
    maxTokens: budgetTokens,
  });

  const originalByChunk = new Map(before.map(chunk => [chunk.chunk_id, chunk]));

  return after.map(expanded => {
    const original = originalByChunk.get(expanded.chunk_id);
    const originalText = (original?.content ?? '').trim();
    return {
      queryId: run.query.id,
      chunkId: expanded.chunk_id,
      // Stitching removes an overlapping prefix from the JOINED piece, never
      // from the matched chunk itself, so containment is the right check.
      retainsMatchedText: originalText.length > 0 && expanded.content.includes(originalText),
      tokensBefore: original?.token_count ?? 0,
      tokensAfter: expanded.token_count,
      declaredSiblings: original?.sibling_chunk_ids.length ?? 0,
      // With one heading path per document this is trivially true; it stops
      // being trivial the moment a document is indexed with real headings, and
      // then it is the check that catches a passage wandering out of section.
      staysInSection: expanded.heading_path === original?.heading_path,
    };
  });
}
