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

/** True when `candidate` is `expected` with Cyrillic letters read as Latin. */
function isHomoglyphSubstitution(expected: string, candidate: string): boolean {
  if (!CYRILLIC.test(expected)) return false;
  if (candidate.length === 0) return false;

  const folded = [...candidate].map(character => HOMOGLYPHS[character] ?? character).join('');
  // Folding must make it materially better, and the candidate must have lost
  // the alphabet in the first place, or this is just a normal misread.
  const before = similarity(expected, candidate);
  const after = similarity(expected, folded);
  return after > before && after >= 0.8;
}

function scoreTable(output: string, expectation: OcrTableExpectation): number {
  const lines = output.split('\n');
  let found = 0;
  let total = 0;

  for (const row of expectation.rows) {
    total += row.length;
    // A Markdown table row is the only place cells stay adjacent, so the row is
    // scored as a unit rather than cell by cell across the whole document.
    const best = lines.reduce((winner, line) => {
      const normalizedLine = normalize(line);
      const hits = row.filter(cell => normalizedLine.includes(normalize(cell))).length;
      return hits > winner ? hits : winner;
    }, 0);
    found += best;
  }

  return total === 0 ? 1 : found / total;
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
    checks.push({
      name: 'ocr-table-cells',
      passed: score.tableCellAccuracy > 0,
      details: `${score.tableCellAccuracy} of the expected cells`,
    });
  }

  return checks;
}
