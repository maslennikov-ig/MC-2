import { describe, expect, it } from 'vitest';

import {
  evaluateRetrieval,
  tokenize,
  type GroundTruthQuestion,
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
