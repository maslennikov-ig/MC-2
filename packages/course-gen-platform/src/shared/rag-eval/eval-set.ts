/**
 * The evaluation set retrieval quality is measured against.
 *
 * The repository had no number for whether retrieval finds the right thing. The
 * calibration path that was planned for one — a shadow cohort in production
 * (`mc2-wxun`) — produced zero rows in two months, so this set is built offline
 * from the live corpus instead and checked into the repository as data. A
 * measurement that cannot be repeated cheaply will not be repeated.
 *
 * Two kinds of query, because they answer different questions and only one of
 * them can carry ground truth:
 *
 * - `known-answer`: a chunk sampled from the indexed corpus, plus a question
 *   derived from it. The sampled chunk is the truth and its neighbours in the
 *   same course are the near misses, which is exactly the discrimination under
 *   test. These are what Recall@k and MRR are computed on.
 * - `lesson-objective`: real wording, taken from the learning objectives Stage 6
 *   turns into search queries (`buildLessonQueries` source 2). These have no
 *   ground truth and are never scored for recall; they exist so that branch
 *   attribution and threshold sensitivity are measured on what the pipeline
 *   really asks, which is where a synthetic set lies.
 *
 * A note on where the wording came from, because the plan for this work assumed
 * otherwise: `generation_trace` rows for `phase = 'rag_retrieval'` record query
 * COUNTS, never the query strings, and `rag_context_cache` is empty. The stored
 * objectives are the same strings by construction — `buildLessonQueries` reads
 * them directly — so they are the authentic wording, recovered from the source
 * the trace only counted.
 *
 * @module shared/rag-eval/eval-set
 */

/** Where a query came from, which decides what it may be scored for. */
export type EvalQuerySource = 'known-answer' | 'lesson-objective';

/**
 * One distinctive phrase the answering chunk must contain.
 *
 * Ground truth is expressed as text rather than as a chunk id because the same
 * text legitimately sits at more than one point: 1486 of this corpus's distinct
 * contents appear under more than one course. A phrase matches every copy; an
 * id matches one arbitrary copy and calls the others a miss.
 */
export interface EvalEvidence {
  id: string;
  /** All of these must appear in a chunk for it to carry the evidence. */
  tokens: string[];
}

export interface EvalQuery {
  id: string;
  source: EvalQuerySource;
  query: string;
  course_id: string;
  organization_id: string;
  /** Documents the retrieving stage would have been scoped to, when known. */
  document_ids?: string[];
  /** The chunk this query was derived from; empty for real-wording queries. */
  target_chunk_id?: string;
  /**
   * What a correct answer has to contain. Empty for `lesson-objective`, which
   * is why those queries are excluded from every recall statistic rather than
   * silently scored as zero — a query with no truth is not a failed query.
   */
  evidence: EvalEvidence[];
}

export interface EvalSet {
  /** Bumped when the shape changes; a run refuses a version it cannot read. */
  version: number;
  /** ISO timestamp of the build, for the report's provenance line. */
  built_at: string;
  /** Logical collection the set was sampled from. */
  collection: string;
  /** Points in that collection at build time, so a drifted corpus is visible. */
  corpus_points: number;
  /** Model that derived the known-answer questions, named for reproducibility. */
  question_model: string;
  queries: EvalQuery[];
}

export const EVAL_SET_VERSION = 1;

/** Query-embedding vectors, keyed by the query text they belong to. */
export interface EvalEmbeddings {
  version: number;
  /** Jina model and task the vectors were produced with. */
  model: string;
  task: string;
  dimensions: number;
  /** Query text -> vector. Rounded, see `roundVector`. */
  vectors: Record<string, number[]>;
}

/**
 * Rounding applied before a vector is written to the repository.
 *
 * Six decimals on a unit-norm 768-dimensional vector moves a cosine score by
 * less than 1e-6, which is four orders of magnitude below the smallest
 * threshold step this work measures (0.05), and it roughly halves the file.
 * The rounding is applied on the way in AND kept for the run, so the cached
 * vector and the measured number are the same object rather than two that
 * agree to within a tolerance nobody stated.
 */
export function roundVector(vector: readonly number[]): number[] {
  return vector.map(value => Math.round(value * 1e6) / 1e6);
}

/** A structural check with a message that says which query is wrong. */
export function assertEvalSet(set: EvalSet): void {
  if (set.version !== EVAL_SET_VERSION) {
    throw new Error(
      `Evaluation set version ${set.version} cannot be read by this build (expected ${EVAL_SET_VERSION})`
    );
  }
  if (set.queries.length === 0) {
    throw new Error('Evaluation set is empty');
  }
  const seen = new Set<string>();
  for (const query of set.queries) {
    if (seen.has(query.id)) throw new Error(`Duplicate evaluation query id: ${query.id}`);
    seen.add(query.id);
    if (query.query.trim().length === 0) {
      throw new Error(`Evaluation query ${query.id} has no text`);
    }
    if (query.source === 'known-answer' && query.evidence.length === 0) {
      throw new Error(`Known-answer query ${query.id} carries no evidence to be scored against`);
    }
  }
}

/** The queries that carry ground truth, i.e. the ones recall may be read from. */
export function scorableQueries(set: EvalSet): EvalQuery[] {
  return set.queries.filter(query => query.evidence.length > 0);
}
