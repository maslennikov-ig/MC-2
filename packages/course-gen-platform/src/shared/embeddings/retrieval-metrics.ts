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
  recallAtK: number;
  reciprocalRank: number;
  ndcgAtK: number;
  /** True when a retrieved top-k chunk also matched an expected ref. */
  refMatched: boolean | null;
}

export interface RetrievalReport {
  k: number;
  questions: QuestionOutcome[];
  recallAtK: number;
  mrr: number;
  ndcgAtK: number;
  /** Questions whose evidence exists in no chunk at all. */
  unreachableQuestions: string[];
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
 * Scores a chunk set against ground-truth questions.
 */
export function evaluateRetrieval(
  chunks: readonly ScorableChunk[],
  questions: readonly GroundTruthQuestion[],
  k = 5
): RetrievalReport {
  const index = buildIndex(chunks);
  const unreachableQuestions: string[] = [];

  const outcomes = questions.map<QuestionOutcome>(question => {
    const ranked = score(index, question.query);
    const relevantTotal = chunks.filter(chunk => isRelevant(chunk, question)).length;
    if (relevantTotal === 0) unreachableQuestions.push(question.id);

    const topK = ranked.slice(0, k);
    let firstRelevantRank: number | null = null;
    let relevantInTopK = 0;
    let discounted = 0;

    topK.forEach((entry, position) => {
      if (!isRelevant(entry.chunk, question)) return;
      relevantInTopK += 1;
      if (firstRelevantRank === null) firstRelevantRank = position + 1;
      discounted += 1 / Math.log2(position + 2);
    });

    const idealCount = Math.min(relevantTotal, k);
    let ideal = 0;
    for (let position = 0; position < idealCount; position += 1) {
      ideal += 1 / Math.log2(position + 2);
    }

    const refMatched = question.expectedRefs
      ? topK.some(entry =>
          question.expectedRefs!.some(ref => entry.chunk.provenance?.self_refs.includes(ref))
        )
      : null;

    return {
      id: question.id,
      firstRelevantRank,
      relevantInTopK,
      relevantTotal,
      recallAtK: relevantTotal > 0 ? relevantInTopK / Math.min(relevantTotal, k) : 0,
      reciprocalRank: firstRelevantRank === null ? 0 : 1 / firstRelevantRank,
      ndcgAtK: ideal > 0 ? discounted / ideal : 0,
      refMatched,
    };
  });

  const mean = (values: number[]): number =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

  return {
    k,
    questions: outcomes,
    recallAtK: mean(outcomes.map(outcome => outcome.recallAtK)),
    mrr: mean(outcomes.map(outcome => outcome.reciprocalRank)),
    ndcgAtK: mean(outcomes.map(outcome => outcome.ndcgAtK)),
    unreachableQuestions,
  };
}
