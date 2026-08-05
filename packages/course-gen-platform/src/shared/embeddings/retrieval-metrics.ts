/**
 * Offline retrieval scoring for chunking A/B.
 *
 * Production retrieval is hybrid: Jina v3 dense vectors plus Qdrant's server-side
 * `qdrant/bm25` sparse vectors. This module reproduces only the lexical half,
 * offline and deterministically, with the same BM25 parameters the collection is
 * configured with. It is therefore a PROXY, not a replay of production ranking:
 * it can show which chunking strategy puts the expected evidence in reach of a
 * query, and it cannot show what the dense half would do. Any report built on it
 * must say so.
 *
 * Recall@K here is the textbook definition — retrieved relevant divided by ALL
 * relevant chunks, never by `min(relevantTotal, k)`. Dividing by the capped
 * count reports a full score whenever the top-k happens to be saturated, which
 * turns "5 of 8 relevant chunks were retrieved" into 1.00 and hides the miss.
 * The consequence is that Recall@K is NOT comparable across strategies that cut
 * the same document into different numbers of chunks: a finer strategy raises
 * `relevantTotal` and mechanically lowers its own ceiling. `recallCeilingAtK`
 * reports that ceiling so a reader can see the effect instead of inferring it,
 * and cross-strategy conclusions belong to the rank-based metrics.
 *
 * @module shared/embeddings/retrieval-metrics
 */

import { QDRANT_BM25_OPTIONS } from '../qdrant/config.js';

/** One ground-truth question with the evidence it must retrieve. */
export interface GroundTruthQuestion {
  id: string;
  query: string;
  /** Substrings that identify a chunk as carrying the expected evidence. */
  expectedTokens: string[];
  /** Optional Docling refs the retrieved chunk should be built from. */
  expectedRefs?: string[];
}

/** Minimal chunk shape the scorer needs. */
export interface ScorableChunk {
  chunk_id: string;
  content: string;
  heading_path?: string;
  provenance?: { self_refs: string[] } | undefined;
}

export interface QuestionOutcome {
  id: string;
  /** 1-based rank of the first relevant chunk, or null when none was found. */
  firstRelevantRank: number | null;
  relevantInTopK: number;
  relevantTotal: number;
  /** Retrieved relevant / ALL relevant. Bounded by `recallCeilingAtK`. */
  recallAtK: number;
  /** `min(relevantTotal, k) / relevantTotal`: the best Recall@K reachable here. */
  recallCeilingAtK: number;
  reciprocalRank: number;
  ndcgAtK: number;
  /** True when a retrieved top-k chunk also matched an expected ref. */
  refMatched: boolean | null;
}

export interface RetrievalReport {
  k: number;
  questions: QuestionOutcome[];
  recallAtK: number;
  /** Mean of the per-question ceilings; a Recall@K below it is a real miss. */
  recallCeilingAtK: number;
  mrr: number;
  ndcgAtK: number;
  /** Questions whose evidence exists in no chunk at all. */
  unreachableQuestions: string[];
}

/**
 * Slack allowed before a per-question drop counts as a regression.
 *
 * This is floating-point noise and nothing else. It must NOT be sized to "a
 * drop too small to matter": Recall@K can fall by a genuine miss of less than
 * one percentage point — losing 1 of 101 relevant chunks is a drop of 0.0099 —
 * so a 0.01 tolerance would silently absorb a real loss on any question with a
 * large relevant set. The metrics are ratios of small integers and sums of
 * reciprocal logs, so 1e-9 covers representation error with room to spare.
 */
export const RETRIEVAL_REGRESSION_EPSILON = 1e-9;

/** One per-question metric drop, or a question that vanished entirely. */
export interface RetrievalRegression {
  questionId: string;
  metric: 'relevant-in-top-k' | 'mrr' | 'ndcg@k' | 'question-missing';
  before: number;
  after: number;
}

/**
 * The guarded metrics, all of them independent of how the corpus was cut.
 *
 * `relevantInTopK` — the COUNT of relevant chunks retrieved — is guarded rather
 * than the Recall@K RATIO, and this is a deliberate, load-bearing choice.
 * Recall@K divides by `relevantTotal`, which is a property of the chunking
 * strategy, not of the retrieval: cutting the same document finer produces more
 * chunks that match the same phrase, so the ratio falls even when the top-k is
 * byte-for-byte as useful. Measured case: on `sci-hypothesis` the legacy
 * splitter retrieved 5 relevant chunks out of 8 that existed (0.625) and the
 * hybrid chunker retrieved 5 out of 9 (0.556) — the same five answers, in the
 * same order, with identical MRR and nDCG, scored as a 7-point "regression".
 *
 * Guarding the count keeps every real loss: retrieving fewer relevant chunks,
 * or the same ones lower down, still trips the gate. The user-facing scenario
 * that motivated a strict epsilon — losing 1 of 101 relevant chunks — is a
 * count of 5 falling to 4, and is caught. What it no longer reports is a
 * denominator that moved on its own. The ratio and its ceiling stay in every
 * report, so nothing is hidden; they are descriptive, not a verdict.
 */
const GUARDED_METRICS: Array<{
  name: Exclude<RetrievalRegression['metric'], 'question-missing'>;
  read: (outcome: QuestionOutcome) => number;
}> = [
  { name: 'relevant-in-top-k', read: outcome => outcome.relevantInTopK },
  { name: 'mrr', read: outcome => outcome.reciprocalRank },
  { name: 'ndcg@k', read: outcome => outcome.ndcgAtK },
];

/**
 * Lists every way `after` is worse than `before` on the same control questions.
 *
 * All three metrics are guarded. Guarding the reciprocal rank alone passes a
 * strategy that keeps the first hit first while losing the rest of the
 * evidence. A question present in `before` and absent from `after` is itself a
 * regression: a shrinking control set must never read as a clean run.
 */
export function detectRetrievalRegressions(
  before: RetrievalReport,
  after: RetrievalReport,
  epsilon: number = RETRIEVAL_REGRESSION_EPSILON
): RetrievalRegression[] {
  const afterById = new Map(after.questions.map(outcome => [outcome.id, outcome]));

  return before.questions.flatMap<RetrievalRegression>(previous => {
    const current = afterById.get(previous.id);
    if (!current) {
      return [{ questionId: previous.id, metric: 'question-missing', before: 1, after: 0 }];
    }
    return GUARDED_METRICS.flatMap<RetrievalRegression>(metric => {
      const was = metric.read(previous);
      const is = metric.read(current);
      return was - is > epsilon
        ? [{ questionId: previous.id, metric: metric.name, before: was, after: is }]
        : [];
    });
  });
}

/** Human-readable one-liner for a regression, used in reports and assertions. */
export function formatRetrievalRegression(regression: RetrievalRegression): string {
  if (regression.metric === 'question-missing') {
    return `${regression.questionId}/отсутствует в прогоне`;
  }
  const digits = regression.metric === 'relevant-in-top-k' ? 0 : 3;
  return `${regression.questionId}/${regression.metric} ${regression.before.toFixed(digits)}→${regression.after.toFixed(digits)}`;
}

function normalize(value: string): string {
  return value.toLocaleLowerCase('ru-RU').replace(/\s+/gu, ' ').trim();
}

/**
 * Multilingual-ish tokenizer: letters and digits in any script, lowercased.
 * Mirrors the intent of the collection's `tokenizer: multilingual` setting.
 */
export function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(token => token.length > 1);
}

interface Bm25Index {
  documents: Array<{ chunk: ScorableChunk; frequencies: Map<string, number>; length: number }>;
  documentFrequency: Map<string, number>;
  averageLength: number;
}

function buildIndex(chunks: readonly ScorableChunk[]): Bm25Index {
  const documents = chunks.map(chunk => {
    const tokens = tokenize(`${chunk.heading_path ?? ''} ${chunk.content}`);
    const frequencies = new Map<string, number>();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    return { chunk, frequencies, length: tokens.length };
  });

  const documentFrequency = new Map<string, number>();
  for (const document of documents) {
    for (const token of document.frequencies.keys()) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const totalLength = documents.reduce((sum, document) => sum + document.length, 0);
  return {
    documents,
    documentFrequency,
    averageLength: documents.length > 0 ? totalLength / documents.length : 0,
  };
}

function score(index: Bm25Index, query: string): Array<{ chunk: ScorableChunk; score: number }> {
  const { k, b } = { k: QDRANT_BM25_OPTIONS.k, b: QDRANT_BM25_OPTIONS.b };
  const queryTokens = tokenize(query);
  const total = index.documents.length;
  const averageLength = index.averageLength || QDRANT_BM25_OPTIONS.avg_len;

  return index.documents
    .map(document => {
      let value = 0;
      for (const token of queryTokens) {
        const frequency = document.frequencies.get(token);
        if (!frequency) continue;
        const documentFrequency = index.documentFrequency.get(token) ?? 0;
        const idf = Math.log(1 + (total - documentFrequency + 0.5) / (documentFrequency + 0.5));
        value +=
          idf *
          ((frequency * (k + 1)) /
            (frequency + k * (1 - b + (b * document.length) / averageLength)));
      }
      return { chunk: document.chunk, score: value };
    })
    .sort((left, right) =>
      right.score === left.score
        ? left.chunk.chunk_id.localeCompare(right.chunk.chunk_id)
        : right.score - left.score
    );
}

function isRelevant(chunk: ScorableChunk, question: GroundTruthQuestion): boolean {
  const haystack = normalize(`${chunk.heading_path ?? ''} ${chunk.content}`);
  return question.expectedTokens.every(token => haystack.includes(normalize(token)));
}

/**
 * Scores one already-ranked result list against one question.
 *
 * Shared by the offline BM25 proxy and the live dense+sparse evaluation so both
 * report the same quantities: a metric fixed in one place cannot stay broken in
 * the other, and the two runs stay directly comparable.
 *
 * @param ranked - Retrieved chunks, best first, already truncated or not.
 * @param corpus - Every chunk of the strategy, for the relevant-total denominator.
 */
export function scoreQuestion(
  ranked: readonly ScorableChunk[],
  corpus: readonly ScorableChunk[],
  question: GroundTruthQuestion,
  k: number
): QuestionOutcome {
  const relevantTotal = corpus.filter(chunk => isRelevant(chunk, question)).length;
  const topK = ranked.slice(0, k);

  let firstRelevantRank: number | null = null;
  let relevantInTopK = 0;
  let discounted = 0;

  topK.forEach((chunk, position) => {
    if (!isRelevant(chunk, question)) return;
    relevantInTopK += 1;
    if (firstRelevantRank === null) firstRelevantRank = position + 1;
    discounted += 1 / Math.log2(position + 2);
  });

  let ideal = 0;
  for (let position = 0; position < Math.min(relevantTotal, k); position += 1) {
    ideal += 1 / Math.log2(position + 2);
  }

  const refMatched = question.expectedRefs
    ? topK.some(chunk =>
        question.expectedRefs!.some(ref => chunk.provenance?.self_refs.includes(ref))
      )
    : null;

  return {
    id: question.id,
    firstRelevantRank,
    relevantInTopK,
    relevantTotal,
    recallAtK: relevantTotal > 0 ? relevantInTopK / relevantTotal : 0,
    recallCeilingAtK: relevantTotal > 0 ? Math.min(relevantTotal, k) / relevantTotal : 0,
    reciprocalRank: firstRelevantRank === null ? 0 : 1 / firstRelevantRank,
    ndcgAtK: ideal > 0 ? discounted / ideal : 0,
    refMatched,
  };
}

/** Aggregates per-question outcomes into a report. */
export function buildRetrievalReport(outcomes: QuestionOutcome[], k: number): RetrievalReport {
  const mean = (values: number[]): number =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

  return {
    k,
    questions: outcomes,
    recallAtK: mean(outcomes.map(outcome => outcome.recallAtK)),
    recallCeilingAtK: mean(outcomes.map(outcome => outcome.recallCeilingAtK)),
    mrr: mean(outcomes.map(outcome => outcome.reciprocalRank)),
    ndcgAtK: mean(outcomes.map(outcome => outcome.ndcgAtK)),
    unreachableQuestions: outcomes
      .filter(outcome => outcome.relevantTotal === 0)
      .map(outcome => outcome.id),
  };
}

/**
 * Scores a chunk set against ground-truth questions with the BM25 proxy.
 */
export function evaluateRetrieval(
  chunks: readonly ScorableChunk[],
  questions: readonly GroundTruthQuestion[],
  k = 5
): RetrievalReport {
  const index = buildIndex(chunks);

  return buildRetrievalReport(
    questions.map(question =>
      scoreQuestion(
        score(index, question.query).map(entry => entry.chunk),
        chunks,
        question,
        k
      )
    ),
    k
  );
}
