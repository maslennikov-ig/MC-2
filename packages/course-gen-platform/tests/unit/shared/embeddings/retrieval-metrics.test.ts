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
  {
    id: 'q-accuracy',
    query: 'какая точность в процентах',
    evidence: [{ id: 'accuracy-98', tokens: ['98', 'процентов'] }],
  },
  {
    id: 'q-method',
    query: 'какая методология эксперимента',
    evidence: [{ id: 'controlled-experiment', tokens: ['контролируемый эксперимент'] }],
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
    expect(report.atomCoverageAtK).toBe(1);
    expect(report.atomMrrAtK).toBe(1);
    expect(report.atomDcgAtK).toBe(1);
    expect(report.unreachableAtoms).toEqual([]);
  });

  it('scores one fact the same however many chunks repeat it', () => {
    // The defect this replaces: the gate counted RELEVANT CHUNKS, so a strategy
    // that scattered one answer across five fragments scored five times the one
    // that kept it whole — duplication read as quality. The atom is the fact,
    // and a fact is covered once.
    const noise: ScorableChunk[] = Array.from({ length: 3 }, (_, index) =>
      chunk(`n${index}`, `Посторонний текст без чисел, фрагмент ${index}.`)
    );
    const question: GroundTruthQuestion = {
      id: 'q-accuracy',
      query: 'сводные показатели точности 98 процентов',
      evidence: [{ id: 'accuracy-98', tokens: ['98', 'процентов'] }],
    };

    const whole = evaluateRetrieval(
      [chunk('w', 'Сводные показатели точности достигают 98 процентов.'), ...noise],
      [question],
      5
    ).questions[0];
    const scattered = evaluateRetrieval(
      [
        ...Array.from({ length: 5 }, (_, index) =>
          chunk(`d${index}`, `Сводные показатели точности достигают 98 процентов, копия ${index}.`)
        ),
        ...noise,
      ],
      [question],
      5
    ).questions[0];

    expect(whole.atomCoverageAtK).toBe(1);
    expect(scattered.atomCoverageAtK).toBe(1);
    expect(whole.atomMrrAtK).toBe(scattered.atomMrrAtK);
    expect(whole.atomDcgAtK).toBe(scattered.atomDcgAtK);
    // The chunk-level count that used to be the gate: five times larger for the
    // scattered corpus, which is exactly why it is now description only.
    expect(whole.relevantInTopK).toBe(1);
    expect(scattered.relevantInTopK).toBe(5);
  });

  it('counts each declared fact separately when one is missed', () => {
    const report = evaluateRetrieval(
      [
        chunk('a', 'Шаг один: собрать данные из источника.'),
        ...Array.from({ length: 6 }, (_, index) =>
          chunk(`f${index}`, `Служебный шаг обработки номер ${index} без содержания.`)
        ),
        chunk('b', 'Шаг два: проверить результат вручную.'),
      ],
      [
        {
          id: 'q-steps',
          query: 'шаг один собрать данные',
          evidence: [
            { id: 'step-one', tokens: ['Шаг один: собрать данные'] },
            { id: 'step-two', tokens: ['Шаг два: проверить результат'] },
          ],
        },
      ],
      1
    );

    const [outcome] = report.questions;
    expect(outcome.atomsTotal).toBe(2);
    expect(outcome.atomsCoveredInTopK).toBe(1);
    expect(outcome.atomCoverageAtK).toBe(0.5);
    expect(outcome.atoms.map(atom => atom.rank)).toEqual([1, null]);
    // Both facts exist in the corpus: this is a ranking miss, not a chunking one.
    expect(report.unreachableAtoms).toEqual([]);
  });

  it('reports a fact split across a chunk boundary as unreachable', () => {
    // The value and the heading that names it end up in different chunks, so no
    // chunk carries the fact whole. That is a chunking defect and is named as
    // one, separately from a ranking miss.
    const question: GroundTruthQuestion = {
      id: 'q-named-metric',
      query: 'какие сводные показатели точности',
      evidence: [{ id: 'summary-98', tokens: ['сводные показатели', '98'] }],
    };
    const split: ScorableChunk[] = [
      chunk('h', 'Сводные показатели', 'Root'),
      chunk('v', 'точности достигают 98 процентов по контрольной выборке.', 'Root'),
    ];

    expect(evaluateRetrieval(CHUNKS, [question], 5).unreachableAtoms).toEqual([]);
    expect(evaluateRetrieval(split, [question], 5).unreachableAtoms).toEqual([
      'q-named-metric/summary-98',
    ]);
    expect(evaluateRetrieval(split, [question], 5).atomCoverageAtK).toBe(0);
  });

  it('discounts a fact retrieved further down the list', () => {
    const report = evaluateRetrieval(
      [
        chunk('top', 'Контролируемый эксперимент и случайное распределение описаны подробно.'),
        chunk('deep', 'Точность равна 98 процентов.'),
      ],
      [
        {
          id: 'q',
          query: 'контролируемый эксперимент',
          evidence: [{ id: 'accuracy-98', tokens: ['98', 'процентов'] }],
        },
      ],
      5
    );

    const [outcome] = report.questions;
    expect(outcome.atoms[0].rank).toBe(2);
    expect(outcome.atomCoverageAtK).toBe(1);
    expect(outcome.atomMrrAtK).toBe(0.5);
    expect(outcome.atomDcgAtK).toBeCloseTo(1 / Math.log2(3), 10);
  });

  it('records the scored top-k so a ranking claim can be re-checked', () => {
    const report = evaluateRetrieval(CHUNKS, [QUESTIONS[0]], 2);
    expect(report.questions[0].rankedChunkIds).toHaveLength(2);
    expect(report.questions[0].rankedChunkIds[0]).toBe('c1');
  });

  it('keeps the descriptive Recall ratio divided by every relevant chunk', () => {
    // Still correct, still printed, no longer a verdict: 8 chunks carry the
    // evidence and only 5 fit, so the honest ratio is 0.625, not the 1.00 the
    // first implementation reported by dividing by `min(relevantTotal, k)`.
    const many: ScorableChunk[] = Array.from({ length: 8 }, (_, index) =>
      chunk(`r${index}`, `Сводные показатели точности достигают 98 процентов, вариант ${index}.`)
    );
    const noise: ScorableChunk[] = Array.from({ length: 4 }, (_, index) =>
      chunk(`n${index}`, `Посторонний текст без чисел, фрагмент ${index}.`)
    );
    const [outcome] = evaluateRetrieval(
      [...many, ...noise],
      [
        {
          id: 'q-many',
          // BM25 here does no stemming, so the query has to share surface forms
          // with the chunks it is meant to rank.
          query: 'сводные показатели точности 98 процентов',
          evidence: [{ id: 'accuracy-98', tokens: ['98', 'процентов'] }],
        },
      ],
      5
    ).questions;

    expect(outcome.relevantTotal).toBe(8);
    expect(outcome.relevantInTopK).toBe(5);
    expect(outcome.recallAtK).toBeCloseTo(0.625, 10);
    expect(outcome.recallCeilingAtK).toBeCloseTo(0.625, 10);
    expect(outcome.reciprocalRank).toBe(1);
  });

  it('reports a question whose evidence is in no chunk as unreachable', () => {
    const report = evaluateRetrieval(
      [chunk('c1', 'Ничего по теме здесь нет.')],
      [
        {
          id: 'q-missing',
          query: 'точность',
          evidence: [{ id: 'accuracy-98', tokens: ['98', 'процентов'] }],
        },
      ]
    );
    expect(report.unreachableQuestions).toEqual(['q-missing']);
    expect(report.atomCoverageAtK).toBe(0);
    expect(report.mrr).toBe(0);
  });

  it('reports whether an expected Docling ref was retrieved', () => {
    const withRefs: ScorableChunk[] = [
      { ...CHUNKS[0], provenance: { self_refs: ['#/tables/0'] } },
      ...CHUNKS.slice(1),
    ];
    const report = evaluateRetrieval(
      withRefs,
      [
        {
          ...QUESTIONS[0],
          evidence: [{ id: 'accuracy-98', tokens: ['98', 'процентов'], refs: ['#/tables/0'] }],
        },
      ],
      5
    );
    expect(report.questions[0].refMatched).toBe(true);
  });
});

function outcome(id: string, overrides: Partial<QuestionOutcome> = {}): QuestionOutcome {
  return {
    id,
    atoms: [{ id: `${id}-atom`, rank: 1, unreachable: false }],
    atomsTotal: 1,
    atomsCoveredInTopK: 1,
    atomCoverageAtK: 1,
    atomMrrAtK: 1,
    atomDcgAtK: 1,
    rankedChunkIds: ['c1'],
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
    atomCoverageAtK: mean(item => item.atomCoverageAtK),
    atomMrrAtK: mean(item => item.atomMrrAtK),
    atomDcgAtK: mean(item => item.atomDcgAtK),
    unreachableAtoms: [],
    recallAtK: mean(item => item.recallAtK),
    recallCeilingAtK: mean(item => item.recallCeilingAtK),
    mrr: mean(item => item.reciprocalRank),
    ndcgAtK: mean(item => item.ndcgAtK),
    unreachableQuestions: [],
  };
}

describe('detectRetrievalRegressions', () => {
  it('catches one fact lost from a large evidence set', () => {
    // The scenario a 0.01 tolerance would have absorbed: 101 declared facts,
    // one of them dropped, a coverage move of 0.0099. Guarded, because the
    // denominator is fixed and the epsilon is representation error only.
    const atoms = (covered: number) =>
      Array.from({ length: 101 }, (_, index) => ({
        id: `a${index}`,
        rank: index < covered ? 1 : null,
        unreachable: false,
      }));
    const before = report([
      outcome('q', { atoms: atoms(101), atomsTotal: 101, atomCoverageAtK: 101 / 101 }),
    ]);
    const after = report([
      outcome('q', { atoms: atoms(100), atomsTotal: 101, atomCoverageAtK: 100 / 101 }),
    ]);

    const regressions = detectRetrievalRegressions(before, after);
    expect(regressions).toHaveLength(1);
    expect(regressions[0]).toMatchObject({ questionId: 'q', metric: 'atom-coverage' });
    expect(before.questions[0].atomCoverageAtK - after.questions[0].atomCoverageAtK).toBeLessThan(
      0.01
    );
  });

  it('does not report chunk-level numbers that moved only with the cut', () => {
    // Measured on `sci-hypothesis`: the finer strategy created one more chunk
    // matching the phrase, so the chunk Recall ratio fell and the chunk count
    // rose — neither means the answer changed. The facts covered are identical.
    const before = report([
      outcome('q', { relevantTotal: 8, relevantInTopK: 5, recallAtK: 5 / 8 }),
    ]);
    const after = report([outcome('q', { relevantTotal: 9, relevantInTopK: 1, recallAtK: 1 / 9 })]);

    expect(detectRetrievalRegressions(before, after)).toEqual([]);
  });

  it('reports nothing when the two runs are identical', () => {
    const questions = [outcome('a'), outcome('b', { atomCoverageAtK: 0.5, atomDcgAtK: 0.4 })];
    expect(detectRetrievalRegressions(report(questions), report(questions))).toEqual([]);
  });

  it('absorbs representation noise but nothing larger', () => {
    const before = report([outcome('q', { atomDcgAtK: 1 / 3 })]);
    const noise = report([outcome('q', { atomDcgAtK: 1 / 3 - RETRIEVAL_REGRESSION_EPSILON / 2 })]);
    const real = report([outcome('q', { atomDcgAtK: 1 / 3 - RETRIEVAL_REGRESSION_EPSILON * 100 })]);

    expect(detectRetrievalRegressions(before, noise)).toEqual([]);
    expect(detectRetrievalRegressions(before, real)).toHaveLength(1);
  });

  it('guards each of the three atom metrics independently', () => {
    const before = report([outcome('found'), outcome('rank'), outcome('gain')]);
    const after = report([
      outcome('found', { atomCoverageAtK: 0.5 }),
      outcome('rank', { atomMrrAtK: 0.5 }),
      outcome('gain', { atomDcgAtK: 0.5 }),
    ]);

    expect(detectRetrievalRegressions(before, after).map(item => item.metric)).toEqual([
      'atom-coverage',
      'atom-mrr',
      'atom-dcg',
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
      outcome('q', { atomCoverageAtK: 0, atomMrrAtK: 0.25, atomDcgAtK: 0.3 }),
    ]);
    const after = report([outcome('q')]);
    expect(detectRetrievalRegressions(before, after)).toEqual([]);
  });

  it('formats a drop with both values so the report is checkable', () => {
    expect(
      formatRetrievalRegression({ questionId: 'q', metric: 'atom-dcg', before: 1, after: 0.83 })
    ).toBe('q/atom-dcg 1.000→0.830');
  });
});
