import { describe, expect, it } from 'vitest';

import {
  analyzeMarkdownHeadings,
  evaluateHeadingHierarchy,
  maximumHeadingDepth,
} from '../../../../src/shared/embeddings/heading-hierarchy.js';

const ONLY_H2 = [
  '## Первый раздел',
  '',
  'Текст раздела.',
  '',
  '## Второй раздел',
  '',
  'Ещё текст.',
].join('\n');

const TWO_DISTINCT_LEVELS = [
  '# Заголовок документа',
  '',
  'Введение.',
  '',
  '## Раздел',
  '',
  'Тело раздела.',
].join('\n');

const THREE_DISTINCT_LEVELS = [TWO_DISTINCT_LEVELS, '', '### Подраздел', '', 'Детали.'].join('\n');

describe('analyzeMarkdownHeadings', () => {
  it('reports the distinct heading levels actually present', () => {
    expect(analyzeMarkdownHeadings(ONLY_H2).distinctLevels).toEqual([2]);
    expect(analyzeMarkdownHeadings(TWO_DISTINCT_LEVELS).distinctLevels).toEqual([1, 2]);
    expect(analyzeMarkdownHeadings(THREE_DISTINCT_LEVELS).distinctLevels).toEqual([1, 2, 3]);
  });

  it('counts each level separately', () => {
    expect(analyzeMarkdownHeadings(ONLY_H2).countsByLevel).toEqual({ 2: 2 });
  });

  it('ignores hashes inside fenced code blocks', () => {
    const markdown = ['# Настоящий заголовок', '', '```python', '## not a heading', '```'].join(
      '\n'
    );
    expect(analyzeMarkdownHeadings(markdown).distinctLevels).toEqual([1]);
  });

  it('ignores hashes that are not followed by a space', () => {
    expect(analyzeMarkdownHeadings('#hashtag\n\nplain text').distinctLevels).toEqual([]);
  });
});

describe('evaluateHeadingHierarchy', () => {
  // The bug this replaces: the benchmark asserted `maximumHeadingDepth >= 2`, which a
  // document containing only H2 satisfies without having any hierarchy at all.
  it('refuses to call a document with only H2 a two-level hierarchy', () => {
    expect(maximumHeadingDepth(ONLY_H2)).toBe(2);

    const verdict = evaluateHeadingHierarchy(ONLY_H2, { minimumDistinctLevels: 2 });
    expect(verdict.passed).toBe(false);
    expect(verdict.distinctLevels).toEqual([2]);
    expect(verdict.details).toContain('2');
  });

  it('accepts a document that really carries two distinct levels', () => {
    const verdict = evaluateHeadingHierarchy(TWO_DISTINCT_LEVELS, { minimumDistinctLevels: 2 });
    expect(verdict.passed).toBe(true);
  });

  it('checks an exact expected level set when one is declared', () => {
    expect(
      evaluateHeadingHierarchy(THREE_DISTINCT_LEVELS, { expectedLevels: [1, 2, 3] }).passed
    ).toBe(true);
    expect(
      evaluateHeadingHierarchy(TWO_DISTINCT_LEVELS, { expectedLevels: [1, 2, 3] }).passed
    ).toBe(false);
  });

  it('is unsatisfiable by an empty document', () => {
    expect(evaluateHeadingHierarchy('', { minimumDistinctLevels: 1 }).passed).toBe(false);
  });
});
