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
 * Everything gated here is counted over EVIDENCE ATOMS — the declared facts an
 * answer needs — and never over chunks. A chunk is an artefact of the strategy
 * under test, so any metric whose numerator or denominator counts chunks
 * measures the strategy's cutting, not its retrieval: dividing by
 * `relevantTotal` penalises a finer cut, and counting `relevantInTopK` rewards
 * one, because five fragments repeating one answer score five times the chunk
 * that contains it whole. The atom set is identical for every strategy, so
 * coverage, `atomMrrAtK` and `atomDcgAtK` are directly comparable.
 *
 * The chunk-level Recall@K, MRR and nDCG@K remain in every outcome, correctly
 * computed (Recall divides by ALL relevant chunks and prints its reachable
 * ceiling beside it), purely as description. They are not a verdict.
 *
 * @module shared/embeddings/retrieval-metrics
 */

import { QDRANT_BM25_OPTIONS } from '../qdrant/config.js';

/**
 * One indivisible fact the answer needs, identified independently of chunking.
 *
 * This is the unit every gated metric counts, and the reason it exists: a chunk
 * is not a unit of truth. Counting relevant CHUNKS rewards a strategy for
 * duplicating one answer across five fragments and punishes one that keeps it
 * whole, so "more relevant chunks retrieved" can mean strictly less information
 * delivered. An atom is declared in the corpus manifest, is the same set for
 * every strategy, and is either covered by the top-k or not — so it cannot be
 * inflated by cutting the document differently.
 */
export interface EvidenceAtom {
  id: string;
  /** ALL of these must appear in one chunk for that chunk to carry the atom. */
  tokens: string[];
  /** Optional Docling refs a carrying chunk should be built from. */
  refs?: string[];
}

/** One ground-truth question and the distinct facts its answer needs. */
export interface GroundTruthQuestion {
  id: string;
  query: string;
  evidence: EvidenceAtom[];
}

/** Minimal chunk shape the scorer needs. */
export interface ScorableChunk {
  chunk_id: string;
  content: string;
  heading_path?: string;
  provenance?: { self_refs: string[] } | undefined;
}

export interface AtomOutcome {
  id: string;
  /** 1-based rank of the first top-k chunk carrying this atom, else null. */
  rank: number | null;
  /**
   * No chunk in the whole corpus carries it. That is a chunking defect — the
   * fact was split across a boundary — and it is reported separately from a
   * ranking miss, because the two have different fixes.
   */
  unreachable: boolean;
}

export interface QuestionOutcome {
  id: string;
  atoms: AtomOutcome[];
  /** Declared atoms. Fixed per question, so every ratio below is comparable. */
  atomsTotal: number;
  atomsCoveredInTopK: number;
  /** Covered / declared. The gated coverage metric. */
  atomCoverageAtK: number;
  /** Mean over DECLARED atoms of `1 / rank`, 0 for an uncovered atom. */
  atomMrrAtK: number;
  /** Mean over DECLARED atoms of `1 / log2(rank + 1)`, 0 for an uncovered atom. */
  atomDcgAtK: number;
  /** The scored top-k, best first, so a claim about ranking can be re-checked. */
  rankedChunkIds: string[];
  /** 1-based rank of the first chunk carrying any atom, or null. */
  firstRelevantRank: number | null;
  /** DESCRIPTIVE chunk-level view below this line. None of it is gated. */
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
  atomCoverageAtK: number;
  atomMrrAtK: number;
  atomDcgAtK: number;
  /** `question/atom` pairs no chunk of this strategy can carry. */
  unreachableAtoms: string[];
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
  metric: 'atom-coverage' | 'atom-mrr' | 'atom-dcg' | 'question-missing';
  before: number;
  after: number;
}

/**
 * The guarded metrics, all counted over DECLARED evidence atoms.
 *
 * Two earlier versions of this gate were wrong in the same direction, and both
 * failures were about the denominator. Gating the Recall@K RATIO compared
 * `relevantInTopK / relevantTotal` across strategies whose `relevantTotal`
 * differed only because they cut the document differently. Gating the COUNT
 * `relevantInTopK` fixed the denominator but kept the numerator corrupt: five
 * fragments repeating one answer scored five times a single chunk containing
 * it, so duplication read as quality.
 *
 * Atoms remove both. The denominator is the number of facts DECLARED for the
 * question — identical for every strategy, fixed before any run. The numerator
 * counts distinct facts covered, so a fact retrieved five times counts once and
 * a fact retrieved never is a loss no duplication can compensate for. Rank is
 * kept by two discounted variants over the same fixed denominator.
 *
 * The scenario that motivated a strict epsilon — losing one item from a large
 * evidence set — is a coverage drop, and a strategy that splits a fact across a
 * chunk boundary until no chunk carries it whole shows up as an uncovered atom
 * instead of hiding behind its siblings.
 */
const GUARDED_METRICS: Array<{
  name: Exclude<RetrievalRegression['metric'], 'question-missing'>;
  read: (outcome: QuestionOutcome) => number;
}> = [
  { name: 'atom-coverage', read: outcome => outcome.atomCoverageAtK },
  { name: 'atom-mrr', read: outcome => outcome.atomMrrAtK },
  { name: 'atom-dcg', read: outcome => outcome.atomDcgAtK },
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
  return `${regression.questionId}/${regression.metric} ${regression.before.toFixed(3)}→${regression.after.toFixed(3)}`;
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

/** A chunk carries an atom when it contains every token of that atom. */
function carriesAtom(chunk: ScorableChunk, atom: EvidenceAtom): boolean {
  const haystack = normalize(`${chunk.heading_path ?? ''} ${chunk.content}`);
  return atom.tokens.every(token => haystack.includes(normalize(token)));
}

/** Chunk-level relevance, kept only for the descriptive half of the report. */
function isRelevant(chunk: ScorableChunk, question: GroundTruthQuestion): boolean {
  return question.evidence.some(atom => carriesAtom(chunk, atom));
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

  const atoms: AtomOutcome[] = question.evidence.map(atom => {
    const position = topK.findIndex(chunk => carriesAtom(chunk, atom));
    return {
      id: atom.id,
      rank: position >= 0 ? position + 1 : null,
      unreachable: !corpus.some(chunk => carriesAtom(chunk, atom)),
    };
  });

  const atomsTotal = atoms.length;
  const mean = (values: number[]): number =>
    atomsTotal > 0 ? values.reduce((sum, value) => sum + value, 0) / atomsTotal : 0;

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

  const expectedRefs = question.evidence.flatMap(atom => atom.refs ?? []);
  const refMatched =
    expectedRefs.length > 0
      ? topK.some(chunk => expectedRefs.some(ref => chunk.provenance?.self_refs.includes(ref)))
      : null;

  return {
    id: question.id,
    atoms,
    atomsTotal,
    atomsCoveredInTopK: atoms.filter(atom => atom.rank !== null).length,
    atomCoverageAtK: mean(atoms.map(atom => (atom.rank === null ? 0 : 1))),
    atomMrrAtK: mean(atoms.map(atom => (atom.rank === null ? 0 : 1 / atom.rank))),
    // `1 / log2(rank + 1)` is 1.0 at rank 1 and decays with depth, so the ideal
    // needs no corpus-derived normaliser: every atom's best possible outcome is
    // "carried by the top result", which is the same target for every strategy.
    atomDcgAtK: mean(atoms.map(atom => (atom.rank === null ? 0 : 1 / Math.log2(atom.rank + 1)))),
    rankedChunkIds: topK.map(chunk => chunk.chunk_id),
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
    atomCoverageAtK: mean(outcomes.map(outcome => outcome.atomCoverageAtK)),
    atomMrrAtK: mean(outcomes.map(outcome => outcome.atomMrrAtK)),
    atomDcgAtK: mean(outcomes.map(outcome => outcome.atomDcgAtK)),
    unreachableAtoms: outcomes.flatMap(outcome =>
      outcome.atoms.filter(atom => atom.unreachable).map(atom => `${outcome.id}/${atom.id}`)
    ),
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
