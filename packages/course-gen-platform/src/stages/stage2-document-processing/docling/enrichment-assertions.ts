/**
 * Ground-truth checks for advanced enrichment output.
 *
 * Two tiers, and the split is the point. A model that INVENTS a value is a
 * blocking failure (FR-014): a fabricated chart label or a formula symbol that
 * appears nowhere in the source is worse than no enrichment at all, because a
 * downstream lesson will quote it. A model that MISSES part of a value is an
 * accuracy result: it is recorded with the exact delta and does not, by itself,
 * fail the corpus.
 *
 * Keeping the two apart is what stops the gate from being quietly relaxed to
 * whatever the current model happens to produce. The recorded misses stay in
 * the report where a reader can see them.
 *
 * @module stages/stage2-document-processing/docling/enrichment-assertions
 */

import type { DoclingDocument } from './types.js';

export interface EnrichmentExpectation {
  code?: {
    language: string;
    mustContain: string[];
  };
  formula?: {
    /** What the fixture actually draws, verbatim. */
    groundTruth: string;
    /** Structural fragments a correct reading must contain. */
    mustContain: string[];
    /** Symbols absent from the source; their presence is a fabrication. */
    forbiddenSymbols: string[];
  };
  classification?: {
    className: string;
    minimumConfidence: number;
  };
  chart?: {
    /** Expected label/value pairs, order-insensitive. */
    rows: string[][];
  };
}

export interface EnrichmentCheck {
  name: string;
  passed: boolean;
  /** False for a recorded accuracy result that must not fail the corpus. */
  blocking: boolean;
  details?: string;
}

function normalize(value: string): string {
  return value.toLocaleLowerCase('ru-RU').replace(/\s+/gu, ' ').trim();
}

/** Collapses LaTeX spacing so `b ^ { 2 }` and `b^{2}` compare equal. */
function normalizeLatex(value: string): string {
  return value.replace(/\s+/gu, '').toLowerCase();
}

function checkCode(
  document: DoclingDocument,
  expected: NonNullable<EnrichmentExpectation['code']>
): EnrichmentCheck[] {
  const codeItems = document.texts.filter(text => text.type === 'code');
  if (codeItems.length === 0) {
    return [
      { name: 'enrichment-code', passed: false, blocking: true, details: 'no code item was found' },
    ];
  }

  const languages = codeItems.map(item => item.code_language ?? 'unknown');
  const body = codeItems.map(item => item.text).join('\n');
  const missing = expected.mustContain.filter(fragment => !body.includes(fragment));

  return [
    {
      name: 'enrichment-code-language',
      passed: languages.includes(expected.language),
      blocking: true,
      details: `expected ${expected.language}, got ${languages.join(', ')}`,
    },
    {
      name: 'enrichment-code-text',
      passed: missing.length === 0,
      blocking: true,
      details: missing.length === 0 ? undefined : `missing: ${missing.join(' | ')}`,
    },
  ];
}

function checkFormula(
  document: DoclingDocument,
  expected: NonNullable<EnrichmentExpectation['formula']>
): EnrichmentCheck[] {
  const formulas = document.texts.filter(text => text.type === 'formula');
  const recovered = formulas.map(item => item.text).join(' ');
  if (recovered.trim().length === 0) {
    return [
      {
        name: 'enrichment-formula',
        passed: false,
        blocking: true,
        details: 'formula region came back empty',
      },
    ];
  }

  const flat = normalizeLatex(recovered);
  const missingStructure = expected.mustContain.filter(
    fragment => !flat.includes(normalizeLatex(fragment))
  );
  const fabricated = expected.forbiddenSymbols.filter(symbol =>
    flat.includes(normalizeLatex(symbol))
  );

  return [
    {
      // Blocking: a symbol that is not in the source means the model wrote
      // mathematics the document never contained.
      name: 'enrichment-formula-no-fabrication',
      passed: fabricated.length === 0,
      blocking: true,
      details: fabricated.length === 0 ? undefined : `fabricated: ${fabricated.join(', ')}`,
    },
    {
      name: 'enrichment-formula-structure',
      passed: missingStructure.length === 0,
      blocking: true,
      details:
        missingStructure.length === 0 ? undefined : `missing: ${missingStructure.join(' | ')}`,
    },
    {
      // Recorded, not blocking: an exact match is the goal, and falling short
      // of it is a measurement about the model rather than a broken pipeline.
      name: 'enrichment-formula-exact',
      passed: normalizeLatex(expected.groundTruth) === flat,
      blocking: false,
      details: `ground truth ${expected.groundTruth} | recovered ${recovered}`,
    },
  ];
}

function checkClassification(
  document: DoclingDocument,
  expected: NonNullable<EnrichmentExpectation['classification']>
): EnrichmentCheck[] {
  const classifications = document.pictures
    .map(picture => picture.enrichment?.classification)
    .filter((value): value is NonNullable<typeof value> => value !== undefined);
  const match = classifications.find(value => value.class_name === expected.className);

  return [
    {
      name: 'enrichment-picture-classification',
      passed: match !== undefined && (match.confidence ?? 1) >= expected.minimumConfidence,
      blocking: true,
      details:
        match === undefined
          ? `expected ${expected.className}, got ${classifications.map(c => c.class_name).join(', ') || 'none'}`
          : `${match.class_name} @ ${(match.confidence ?? 1).toFixed(4)}`,
    },
  ];
}

function checkChart(
  document: DoclingDocument,
  expected: NonNullable<EnrichmentExpectation['chart']>
): EnrichmentCheck[] {
  const charts = document.pictures
    .map(picture => picture.enrichment?.chart)
    .filter((value): value is NonNullable<typeof value> => value !== undefined);
  if (charts.length === 0) {
    return [
      {
        name: 'enrichment-chart',
        passed: false,
        blocking: true,
        details: 'no chart data recovered',
      },
    ];
  }

  const cells = charts.flatMap(chart => chart.rows.flat()).map(normalize);
  const found = expected.rows.filter(([label, value]) => {
    // Both halves of the pair must be present: a model that reports the right
    // numbers against the wrong labels has not read the chart.
    const labelIndex = cells.indexOf(normalize(label));
    return labelIndex >= 0 && cells.includes(normalize(value));
  });
  const missing = expected.rows.filter(row => !found.includes(row));

  // A value that appears nowhere in the ground truth is an invented number, and
  // an invented number in a chart is exactly what FR-014 blocks.
  const expectedCells = new Set(expected.rows.flat().map(normalize));
  const numericCells = cells.filter(cell => /^-?\d+([.,]\d+)?$/u.test(cell));
  const invented = numericCells.filter(cell => !expectedCells.has(cell));

  return [
    {
      name: 'enrichment-chart-no-invented-values',
      passed: invented.length === 0,
      blocking: true,
      details: invented.length === 0 ? undefined : `invented: ${invented.join(', ')}`,
    },
    {
      name: 'enrichment-chart-series',
      passed: missing.length === 0,
      blocking: true,
      details:
        missing.length === 0
          ? `${found.length}/${expected.rows.length} pairs`
          : `missing: ${missing.map(row => row.join('=')).join(', ')}`,
    },
  ];
}

/** Runs every expectation the fixture declares against the enriched document. */
export function checkEnrichment(
  document: DoclingDocument,
  expectation: EnrichmentExpectation
): EnrichmentCheck[] {
  return [
    ...(expectation.code ? checkCode(document, expectation.code) : []),
    ...(expectation.formula ? checkFormula(document, expectation.formula) : []),
    ...(expectation.classification
      ? checkClassification(document, expectation.classification)
      : []),
    ...(expectation.chart ? checkChart(document, expectation.chart) : []),
  ];
}
