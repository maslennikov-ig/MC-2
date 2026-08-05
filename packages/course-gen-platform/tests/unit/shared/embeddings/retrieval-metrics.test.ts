import { describe, expect, it } from 'vitest';

import {
  detectRetrievalRegressions,
  evaluateRetrieval,
  formatRetrievalRegression,
  RETRIEVAL_REGRESSION_EPSILON,
  tokenize,
  type GroundTruthQuestion,
  type QuestionOutcome,
  type RetrievalReport,
  type ScorableChunk,
} from '../../../../src/shared/embeddings/retrieval-metrics.js';

function chunk(id: string, content: string, headingPath = 'Root'): ScorableChunk {
  return { chunk_id: id, content, heading_path: headingPath };
}

const CHUNKS: ScorableChunk[] = [
  chunk(
    'c1',
    'Сводные показатели точности достигают 98 процентов по контрольной выборке.',
    'Отчёт > Метрики'
  ),
  chunk(
    'c2',
    'Введение описывает постановку задачи и общий контекст исследования.',
    'Отчёт > Введение'
  ),
  chunk(
    'c3',
    'Методология опирается на контролируемый эксперимент и случайное распределение.',
    'Отчёт > Методология'
  ),
  chunk('c4', 'Заключение обобщает результаты работы.', 'Отчёт > Заключение'),
];

const QUESTIONS: GroundTruthQuestion[] = [
  { id: 'q-accuracy', query: 'какая точность в процентах', expectedTokens: ['98', 'процентов'] },
  {
    id: 'q-method',
    query: 'какая методология эксперимента',
    expectedTokens: ['контролируемый эксперимент'],
  },
];

describe('tokenize', () => {
  it('lowercases and keeps letters and digits across scripts', () => {
    expect(tokenize('Точность 98% — Accuracy!')).toEqual(['точность', '98', 'accuracy']);
  });
});

describe('evaluateRetrieval', () => {
  it('ranks the chunk carrying the expected evidence first', () => {
    const report = evaluateRetrieval(CHUNKS, QUESTIONS, 5);
    expect(report.questions.map(question => question.firstRelevantRank)).toEqual([1, 1]);
    expect(report.mrr).toBe(1);
    expect(report.recallAtK).toBe(1);
    expect(report.ndcgAtK).toBe(1);
    expect(report.unreachableQuestions).toEqual([]);
  });

  it('divides by every relevant chunk, not by the top-k window', () => {
    // The bug this replaces: Recall@K divided by `min(relevantTotal, k)`, so a
    // saturated top-k always scored 1.00. Here 8 chunks carry the evidence and
    // only 5 can be retrieved: the honest score is 0.625, not 1.
    const many: ScorableChunk[] = Array.from({ length: 8 }, (_, index) =>
      chunk(`r${index}`, `Сводные показатели точности достигают 98 процентов, вариант ${index}.`)
    );
    const noise: ScorableChunk[] = Array.from({ length: 4 }, (_, index) =>
      chunk(`n${index}`, `Посторонний текст без чисел, фрагмент ${index}.`)
    );
    const report = evaluateRetrieval(
      [...many, ...noise],
      [
        {
          id: 'q-many',
          // BM25 here does no stemming, so the query has to share surface forms
          // with the chunks it is meant to rank.
          query: 'сводные показатели точности 98 процентов',
          expectedTokens: ['98', 'процентов'],
        },
      ],
      5
    );

    const [outcome] = report.questions;
    expect(outcome.relevantTotal).toBe(8);
    expect(outcome.relevantInTopK).toBe(5);
    expect(outcome.recallAtK).toBeCloseTo(0.625, 10);
    // Recall@5 cannot exceed 5/8 here — the ceiling is reported so that a
    // strategy which merely produced more chunks is not read as a regression.
    expect(outcome.recallCeilingAtK).toBeCloseTo(0.625, 10);
    // Rank quality is unaffected: the first relevant chunk is still first.
    expect(outcome.reciprocalRank).toBe(1);
    expect(outcome.ndcgAtK).toBe(1);
  });

  it('keeps the ceiling at 1 when every relevant chunk fits inside k', () => {
    const report = evaluateRetrieval(CHUNKS, QUESTIONS, 5);
    expect(report.recallCeilingAtK).toBe(1);
    expect(report.recallAtK).toBe(1);
  });

  it('reports a question whose evidence is in no chunk as unreachable', () => {
    const report = evaluateRetrieval(
      [chunk('c1', 'Ничего по теме здесь нет.')],
      [{ id: 'q-missing', query: 'точность', expectedTokens: ['98', 'процентов'] }]
    );
    expect(report.unreachableQuestions).toEqual(['q-missing']);
    expect(report.mrr).toBe(0);
  });

  it('scores a strategy that separates evidence from its heading lower', () => {
    // The value and the heading that names it end up in different chunks, and
    // the heading path is lost — the exact failure mode the legacy Markdown
    // splitter produced, where every chunk's heading_path was `Root`.
    const question: GroundTruthQuestion = {
      id: 'q-named-metric',
      query: 'какие сводные показатели точности',
      expectedTokens: ['сводные показатели', '98'],
    };
    const split: ScorableChunk[] = [
      chunk('h', 'Сводные показатели', 'Root'),
      chunk('v', 'точности достигают 98 процентов по контрольной выборке.', 'Root'),
      ...CHUNKS.slice(1).map(existing => ({ ...existing, heading_path: 'Root' })),
    ];

    expect(evaluateRetrieval(CHUNKS, [question], 5).recallAtK).toBe(1);
    expect(evaluateRetrieval(split, [question], 5).recallAtK).toBe(0);
  });

  it('reports whether an expected Docling ref was retrieved', () => {
    const withRefs: ScorableChunk[] = [
      { ...CHUNKS[0], provenance: { self_refs: ['#/tables/0'] } },
      ...CHUNKS.slice(1),
    ];
    const report = evaluateRetrieval(
      withRefs,
      [{ ...QUESTIONS[0], expectedRefs: ['#/tables/0'] }],
      5
    );
    expect(report.questions[0].refMatched).toBe(true);
  });
});

function outcome(id: string, overrides: Partial<QuestionOutcome> = {}): QuestionOutcome {
  return {
    id,
    firstRelevantRank: 1,
    relevantInTopK: 1,
    relevantTotal: 1,
    recallAtK: 1,
    recallCeilingAtK: 1,
    reciprocalRank: 1,
    ndcgAtK: 1,
    refMatched: null,
    ...overrides,
  };
}

function report(questions: QuestionOutcome[]): RetrievalReport {
  const mean = (read: (item: QuestionOutcome) => number): number =>
    questions.length > 0
      ? questions.reduce((sum, item) => sum + read(item), 0) / questions.length
      : 0;
  return {
    k: 5,
    questions,
    recallAtK: mean(item => item.recallAtK),
    recallCeilingAtK: mean(item => item.recallCeilingAtK),
    mrr: mean(item => item.reciprocalRank),
    ndcgAtK: mean(item => item.ndcgAtK),
    unreachableQuestions: [],
  };
}

describe('detectRetrievalRegressions', () => {
  it('catches a relevant chunk lost from the window, however small the ratio move', () => {
    // The scenario a 0.01 tolerance would have absorbed: with 101 relevant
    // chunks, dropping one out of the top-5 moves Recall@5 by 0.0099. The gate
    // guards the COUNT, so the size of the ratio move is irrelevant.
    const before = report([
      outcome('q', { relevantTotal: 101, relevantInTopK: 5, recallAtK: 5 / 101 }),
    ]);
    const after = report([
      outcome('q', { relevantTotal: 101, relevantInTopK: 4, recallAtK: 4 / 101 }),
    ]);

    const regressions = detectRetrievalRegressions(before, after);
    expect(regressions).toHaveLength(1);
    expect(regressions[0]).toMatchObject({ questionId: 'q', metric: 'relevant-in-top-k' });
    expect(before.questions[0].recallAtK - after.questions[0].recallAtK).toBeLessThan(0.01);
  });

  it('does not report a Recall ratio that fell only because the corpus was cut finer', () => {
    // Measured on `sci-hypothesis`: the same five relevant chunks are retrieved
    // in the same order, but the finer strategy created a ninth chunk matching
    // the phrase, so the ratio reads 0.556 against 0.625. Nothing about the
    // answer the user receives got worse, and MRR and nDCG confirm it.
    const before = report([
      outcome('q', { relevantTotal: 8, relevantInTopK: 5, recallAtK: 5 / 8 }),
    ]);
    const after = report([outcome('q', { relevantTotal: 9, relevantInTopK: 5, recallAtK: 5 / 9 })]);

    expect(detectRetrievalRegressions(before, after)).toEqual([]);
    expect(after.questions[0].recallAtK).toBeLessThan(before.questions[0].recallAtK);
  });

  it('reports nothing when the two runs are identical', () => {
    const questions = [outcome('a'), outcome('b', { recallAtK: 0.5, ndcgAtK: 0.4 })];
    expect(detectRetrievalRegressions(report(questions), report(questions))).toEqual([]);
  });

  it('absorbs representation noise but nothing larger', () => {
    const before = report([outcome('q', { ndcgAtK: 1 / 3 })]);
    const noise = report([outcome('q', { ndcgAtK: 1 / 3 - RETRIEVAL_REGRESSION_EPSILON / 2 })]);
    const real = report([outcome('q', { ndcgAtK: 1 / 3 - RETRIEVAL_REGRESSION_EPSILON * 100 })]);

    expect(detectRetrievalRegressions(before, noise)).toEqual([]);
    expect(detectRetrievalRegressions(before, real)).toHaveLength(1);
  });

  it('guards each of the three metrics independently', () => {
    const before = report([
      outcome('found', { relevantTotal: 4, relevantInTopK: 4 }),
      outcome('rank'),
      outcome('gain'),
    ]);
    const after = report([
      outcome('found', { relevantTotal: 4, relevantInTopK: 2 }),
      outcome('rank', { reciprocalRank: 0.5 }),
      outcome('gain', { ndcgAtK: 0.5 }),
    ]);

    expect(detectRetrievalRegressions(before, after).map(item => item.metric)).toEqual([
      'relevant-in-top-k',
      'mrr',
      'ndcg@k',
    ]);
  });

  it('treats a control question that vanished as a regression', () => {
    // A shrinking control set must never read as a clean run.
    const regressions = detectRetrievalRegressions(
      report([outcome('kept'), outcome('dropped')]),
      report([outcome('kept')])
    );
    expect(regressions).toEqual([
      { questionId: 'dropped', metric: 'question-missing', before: 1, after: 0 },
    ]);
    expect(formatRetrievalRegression(regressions[0])).toContain('dropped');
  });

  it('does not report an improvement', () => {
    const before = report([
      outcome('q', { relevantInTopK: 0, reciprocalRank: 0.25, ndcgAtK: 0.3 }),
    ]);
    const after = report([outcome('q')]);
    expect(detectRetrievalRegressions(before, after)).toEqual([]);
  });

  it('formats a drop with both values so the report is checkable', () => {
    expect(
      formatRetrievalRegression({ questionId: 'q', metric: 'ndcg@k', before: 1, after: 0.83 })
    ).toBe('q/ndcg@k 1.000→0.830');
  });
});
