/**
 * Scoring for an OCR engine A/B.
 *
 * Two things this module refuses to do, because both would decide the gate
 * dishonestly:
 *
 * 1. **It does not score on substring presence alone.** A recognizer that
 *    returns half a phrase and a recognizer that returns all of it would
 *    otherwise both score zero on "contains", which hides the whole difference
 *    the comparison exists to measure. Phrases are scored by character
 *    similarity against the ground truth, so partial reads are visible.
 * 2. **It does not normalize Cyrillic and Latin together.** `РОСТ` and `POCT`
 *    look identical in most fonts and differ in every byte. A recognizer with a
 *    Latin-only dictionary returns the second for the first, confidently. If
 *    normalization folded them, that failure would score as a perfect read —
 *    so homoglyphs are counted and reported separately.
 *
 * @module stages/stage2-document-processing/docling/ocr-assertions
 */

export interface OcrTableExpectation {
  /** Expected rows, cell by cell, in reading order. */
  rows: string[][];
}

export interface OcrExpectation {
  /** Phrases that must be recovered, verbatim in the source. */
  phrases?: string[];
  /** A ruled table whose cells must survive both OCR and structure. */
  table?: OcrTableExpectation;
  /** Minimum mean cell similarity for the table to count as read. Default 0.8. */
  minimumTableCellAccuracy?: number;
  /**
   * Minimum mean phrase similarity for this case to count as read.
   * Absent means the case is measured but does not gate.
   */
  minimumPhraseSimilarity?: number;
}

export interface OcrPhraseScore {
  expected: string;
  /** Best-matching window found in the output. */
  recovered: string;
  /** 0..1 character similarity against the expectation. */
  similarity: number;
  /** True when the recovered text is Latin where the source is Cyrillic. */
  homoglyphSubstitution: boolean;
}

export interface OcrScore {
  phrases: OcrPhraseScore[];
  meanPhraseSimilarity: number;
  /** Fraction of expected table cells found in one row, in order. */
  tableCellAccuracy: number | null;
  /** Cyrillic characters in the whole output; zero means the alphabet was lost. */
  cyrillicCharacters: number;
  homoglyphSubstitutions: number;
}

const CYRILLIC = /[Ѐ-ӿ]/u;

/** Latin letters that are visually identical to a Cyrillic letter. */
const HOMOGLYPHS: Readonly<Record<string, string>> = {
  A: 'А',
  B: 'В',
  C: 'С',
  E: 'Е',
  H: 'Н',
  K: 'К',
  M: 'М',
  O: 'О',
  P: 'Р',
  T: 'Т',
  X: 'Х',
  Y: 'У',
};

function normalize(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().toLocaleUpperCase('ru-RU');
}

/** Levenshtein distance, iterative with a single row of state. */
function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const substitution = previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      current[j] = Math.min(substitution, previous[j] + 1, current[j - 1] + 1);
    }
    previous = current;
  }
  return previous[right.length];
}

function similarity(expected: string, candidate: string): number {
  if (expected.length === 0) return candidate.length === 0 ? 1 : 0;
  return Math.max(0, 1 - editDistance(expected, candidate) / expected.length);
}

/**
 * Finds the window of `haystack` that best matches `needle`.
 *
 * Scanning windows rather than searching for an exact substring is what makes a
 * partial read measurable: a phrase read with two wrong letters scores near 1,
 * not 0.
 */
function bestWindow(haystack: string, needle: string): { text: string; score: number } {
  if (needle.length === 0 || haystack.length === 0) {
    return { text: '', score: 0 };
  }

  const exact = haystack.indexOf(needle);
  if (exact >= 0) return { text: needle, score: 1 };

  // Starts BELOW zero so that the first real candidate always wins. Starting at
  // zero silently returned an empty string whenever every window scored zero —
  // which is exactly the homoglyph case, where the recovered text shares no
  // character with the expectation and is the single most important thing to
  // report rather than to discard.
  let best = { text: '', score: -1 };
  // A window the length of the needle, plus slack for inserted characters.
  const window = needle.length;
  const slack = Math.max(2, Math.round(window * 0.2));
  for (let start = 0; start <= haystack.length - 1; start += 1) {
    for (const width of [window - slack, window, window + slack]) {
      if (width <= 0 || start + width > haystack.length) continue;
      const candidate = haystack.slice(start, start + width);
      const score = similarity(needle, candidate);
      // On a tie, prefer the window closest in length to what was expected.
      // Without that, a homoglyph read settles on the shortest window — every
      // window scores zero, the first one wins, and the report shows `PO` for
      // `РОСТ` instead of the `POCT` that explains what the engine did.
      const better =
        score > best.score ||
        (score === best.score &&
          Math.abs(candidate.length - needle.length) < Math.abs(best.text.length - needle.length));
      if (better) best = { text: candidate, score };
      if (best.score === 1) return best;
    }
  }
  return best.score < 0 ? { text: '', score: 0 } : best;
}

/**
 * True when `candidate` is `expected` with Cyrillic letters read as Latin.
 *
 * Scored on the POSITIONS folding can explain, not on overall similarity. The
 * first version demanded `similarity(expected, folded) >= 0.8`, which no real
 * phrase can reach: only twelve letters have a Latin twin, so a sentence is at
 * most ~75% foldable and the threshold was unreachable by construction. It
 * never fired once across six benchmark runs — including on the one genuine
 * inversion in the corpus, `POCT И РOCT` for `РОСТ и POCT` — while its unit
 * test passed because a four-letter word IS 100% foldable.
 *
 * The question that actually matters is narrower: of the characters that
 * DIFFER, how many are explained by a Latin twin? A recognizer with no Cyrillic
 * dictionary produces a candidate where nearly all of them are.
 */
function isHomoglyphSubstitution(expected: string, candidate: string): boolean {
  if (!CYRILLIC.test(expected)) return false;
  if (candidate.length === 0) return false;

  const folded = [...candidate].map(character => HOMOGLYPHS[character] ?? character).join('');
  const before = similarity(expected, candidate);
  const after = similarity(expected, folded);
  // Folding has to help at all, or this is an ordinary misread.
  if (after <= before) return false;

  // Compare position by position over the overlap: a substitution keeps length,
  // so alignment is meaningful here in a way it would not be for a dropped run.
  const length = Math.min(expected.length, candidate.length);
  let mismatched = 0;
  let explained = 0;
  for (let index = 0; index < length; index += 1) {
    if (expected[index] === candidate[index]) continue;
    mismatched += 1;
    if (folded[index] === expected[index]) explained += 1;
  }

  // At least a third of the phrase must be Latin-for-Cyrillic, and most of what
  // went wrong must be exactly that. Both halves are needed: the first stops a
  // single coincidental letter from firing it, the second stops a badly mangled
  // read that happens to contain one `O` from counting as a substitution.
  if (mismatched === 0) return false;
  return explained >= Math.max(2, Math.ceil(length / 3)) && explained / mismatched >= 0.6;
}

/** Cells of one Markdown table row, pipes and padding removed. */
function markdownRowCells(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return [];
  return trimmed
    .replace(/^\||\|$/gu, '')
    .split('|')
    .map(cell => normalize(cell));
}

/**
 * Table accuracy, scored per character like the phrases are.
 *
 * This used to ask whether the row's text CONTAINED each cell — the exact
 * "substring presence" this module's own docstring rejects for phrases, applied
 * to cells. A cell read as `l18` instead of `118` scored zero, the same as a
 * cell that never arrived, so the metric could not tell a near-miss from a
 * total loss. That inconsistency mattered: table accuracy is the half of the
 * comparison where the CANDIDATE engine wins, so the weaker metric was working
 * against it.
 */
function scoreTable(output: string, expectation: OcrTableExpectation): number {
  const rows = output
    .split('\n')
    .map(markdownRowCells)
    .filter(cells => cells.length > 0);
  let score = 0;
  let total = 0;

  for (const expectedRow of expectation.rows) {
    total += expectedRow.length;
    // Best-matching row, then cell against cell in position: a row is the only
    // place cells stay adjacent, and position is what distinguishes a plan from
    // a fact in the same table.
    const best = rows.reduce((winner, cells) => {
      const rowScore = expectedRow.reduce(
        (sum, expectedCell, index) => sum + similarity(normalize(expectedCell), cells[index] ?? ''),
        0
      );
      return rowScore > winner ? rowScore : winner;
    }, 0);
    score += best;
  }

  return total === 0 ? 1 : score / total;
}

/** Scores one conversion output against a fixture's OCR ground truth. */
export function scoreOcr(output: string, expectation: OcrExpectation): OcrScore {
  const haystack = normalize(output);
  const phrases: OcrPhraseScore[] = (expectation.phrases ?? []).map(phrase => {
    const expected = normalize(phrase);
    const { text, score } = bestWindow(haystack, expected);
    return {
      expected: phrase,
      recovered: text,
      similarity: Number(score.toFixed(4)),
      homoglyphSubstitution: isHomoglyphSubstitution(expected, text),
    };
  });

  const meanPhraseSimilarity =
    phrases.length === 0
      ? 1
      : Number(
          (phrases.reduce((total, entry) => total + entry.similarity, 0) / phrases.length).toFixed(
            4
          )
        );

  return {
    phrases,
    meanPhraseSimilarity,
    tableCellAccuracy: expectation.table
      ? Number(scoreTable(output, expectation.table).toFixed(4))
      : null,
    cyrillicCharacters: [...output].filter(character => CYRILLIC.test(character)).length,
    homoglyphSubstitutions: phrases.filter(entry => entry.homoglyphSubstitution).length,
  };
}

export interface OcrCheck {
  name: string;
  passed: boolean;
  details?: string;
}

/**
 * Turns a score into pass/fail checks.
 *
 * The alphabet check is unconditional and blocking: an engine that returns zero
 * Cyrillic characters for a Cyrillic document has not read it, whatever its
 * similarity numbers say.
 */
export function checkOcr(score: OcrScore, expectation: OcrExpectation): OcrCheck[] {
  const checks: OcrCheck[] = [];

  if ((expectation.phrases ?? []).length > 0) {
    checks.push({
      name: 'ocr-alphabet',
      passed: score.cyrillicCharacters > 0,
      details: `${score.cyrillicCharacters} Cyrillic characters recovered`,
    });
    checks.push({
      name: 'ocr-no-homoglyph-substitution',
      passed: score.homoglyphSubstitutions === 0,
      details:
        score.homoglyphSubstitutions === 0
          ? undefined
          : score.phrases
              .filter(entry => entry.homoglyphSubstitution)
              .map(entry => `"${entry.expected}" read as "${entry.recovered}"`)
              .join('; '),
    });
  }

  if (expectation.minimumPhraseSimilarity !== undefined) {
    checks.push({
      name: 'ocr-phrase-similarity',
      passed: score.meanPhraseSimilarity >= expectation.minimumPhraseSimilarity,
      details: `${score.meanPhraseSimilarity} of at least ${expectation.minimumPhraseSimilarity}`,
    });
  }

  if (score.tableCellAccuracy !== null) {
    // `> 0` passed on one cell out of twelve. A table that lost most of itself
    // is not a table that was read.
    const minimum = expectation.minimumTableCellAccuracy ?? 0.8;
    checks.push({
      name: 'ocr-table-cells',
      passed: score.tableCellAccuracy >= minimum,
      details: `${score.tableCellAccuracy} of at least ${minimum}`,
    });
  }

  return checks;
}
