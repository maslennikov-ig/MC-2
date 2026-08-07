/**
 * The OCR scorer decides which engine ships, so its own failure modes matter
 * more than its happy path. Two properties are load-bearing: a partial read must
 * score as partial rather than as nothing, and a Cyrillic phrase returned as
 * visually identical Latin must NOT score as a good read.
 */

import { describe, expect, it } from 'vitest';

import { checkOcr, scoreOcr } from '@/stages/stage2-document-processing/docling/ocr-assertions';

describe('scoreOcr phrases', () => {
  it('scores an exact read as 1', () => {
    const score = scoreOcr('## СНИЖЕННОЕ КАЧЕСТВО СКАНА\n\nдалее текст', {
      phrases: ['СНИЖЕННОЕ КАЧЕСТВО СКАНА'],
    });
    expect(score.phrases[0].similarity).toBe(1);
    expect(score.meanPhraseSimilarity).toBe(1);
  });

  it('scores a two-character misread as nearly right, not as zero', () => {
    // A "contains" test would call this a total failure and hide the entire
    // difference between two engines.
    const score = scoreOcr('ПРОВЕРКА УСТОЙЧИВОСТИ РАСПОЗНАВАНИЙ', {
      phrases: ['ПРОВЕРКА УСТОЙЧИВОСТИ РАСПОЗНАВАНИЯ'],
    });
    expect(score.phrases[0].similarity).toBeGreaterThan(0.9);
    expect(score.phrases[0].similarity).toBeLessThan(1);
  });

  it('is case and whitespace insensitive, because the pipeline uppercases', () => {
    const score = scoreOcr('снижённое  качество\n скана', {
      phrases: ['СНИЖЁННОЕ КАЧЕСТВО СКАНА'],
    });
    expect(score.phrases[0].similarity).toBe(1);
  });

  it('scores a phrase that is absent as near zero', () => {
    const score = scoreOcr('совершенно другой текст здесь', {
      phrases: ['СВОДКА ПО НАПРАВЛЕНИЯМ'],
    });
    expect(score.phrases[0].similarity).toBeLessThan(0.5);
  });

  it('counts the Cyrillic that survived at all', () => {
    expect(scoreOcr('ABC 123', { phrases: ['АБВ'] }).cyrillicCharacters).toBe(0);
    expect(scoreOcr('АБВ 123', { phrases: ['АБВ'] }).cyrillicCharacters).toBe(3);
  });
});

describe('scoreOcr homoglyphs', () => {
  it('flags a Cyrillic phrase returned as identical-looking Latin', () => {
    // POCT is four Latin letters; РОСТ is four Cyrillic ones. They render the
    // same and share no bytes, so a naive similarity would call this a miss and
    // a naive normalization would call it a perfect read. Neither is true: it is
    // a specific, nameable failure of a Latin-only recognizer.
    const score = scoreOcr('POCT', { phrases: ['РОСТ'] });
    expect(score.phrases[0].homoglyphSubstitution).toBe(true);
    expect(score.homoglyphSubstitutions).toBe(1);
  });

  it('does not flag an ordinary misread as a homoglyph substitution', () => {
    const score = scoreOcr('РОСГ', { phrases: ['РОСТ'] });
    expect(score.phrases[0].homoglyphSubstitution).toBe(false);
  });

  it('does not flag a phrase that has no Cyrillic to lose', () => {
    const score = scoreOcr('GUID-4821', { phrases: ['GUID-4821'] });
    expect(score.phrases[0].homoglyphSubstitution).toBe(false);
  });
});

describe('scoreOcr tables', () => {
  const table = {
    rows: [
      ['Раздел', 'План', 'Факт'],
      ['Аналитика', '120', '118'],
    ],
  };

  it('counts cells only when they share a row', () => {
    const markdown = [
      '| Раздел | План | Факт |',
      '|---|---|---|',
      '| Аналитика | 120 | 118 |',
    ].join('\n');
    expect(scoreOcr(markdown, { table }).tableCellAccuracy).toBe(1);
  });

  it('does not credit cells scattered across different rows', () => {
    const markdown = ['| Раздел | 120 |', '|---|---|', '| План | 118 |'].join('\n');
    const accuracy = scoreOcr(markdown, { table }).tableCellAccuracy!;
    expect(accuracy).toBeGreaterThan(0);
    expect(accuracy).toBeLessThan(1);
  });

  it('reports null when the fixture declares no table', () => {
    expect(scoreOcr('текст', { phrases: ['текст'] }).tableCellAccuracy).toBeNull();
  });
});

describe('checkOcr', () => {
  it('blocks on a lost alphabet however good the similarity looks', () => {
    const expectation = { phrases: ['РОСТ'], minimumPhraseSimilarity: 0.5 };
    const checks = checkOcr(scoreOcr('POCT', expectation), expectation);
    const alphabet = checks.find(check => check.name === 'ocr-alphabet');
    const homoglyph = checks.find(check => check.name === 'ocr-no-homoglyph-substitution');
    expect(alphabet?.passed).toBe(false);
    expect(homoglyph?.passed).toBe(false);
  });

  it('passes a clean read against its declared threshold', () => {
    const expectation = { phrases: ['СВОДКА ПО НАПРАВЛЕНИЯМ'], minimumPhraseSimilarity: 0.8 };
    const checks = checkOcr(scoreOcr('# СВОДКА ПО НАПРАВЛЕНИЯМ', expectation), expectation);
    expect(checks.filter(check => !check.passed)).toEqual([]);
  });

  it('measures without gating when the fixture declares no threshold', () => {
    const expectation = { phrases: ['СВОДКА'] };
    const checks = checkOcr(scoreOcr('СВОДКА', expectation), expectation);
    expect(checks.map(check => check.name)).not.toContain('ocr-phrase-similarity');
  });
});
