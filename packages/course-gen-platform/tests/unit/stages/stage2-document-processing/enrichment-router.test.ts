import { describe, expect, it } from 'vitest';

import {
  CHART_CLASSIFICATION_MIN_CONFIDENCE,
  decideEnrichments,
  mergeEnrichment,
  needsClassificationPass,
  REJECTED_CAPABILITIES,
} from '@/stages/stage2-document-processing/docling/enrichment-router';
import { ENRICHMENT_MODELS, resolveConversionProfile } from '@/shared/embeddings/chunking-strategy';
import type {
  DoclingDocument,
  DoclingPicture,
  DoclingText,
} from '@/stages/stage2-document-processing/docling/types';

function text(overrides: Partial<DoclingText> & Pick<DoclingText, 'id'>): DoclingText {
  return { text: '', type: 'text', page_no: 1, ...overrides };
}

function picture(overrides: Partial<DoclingPicture> & Pick<DoclingPicture, 'id'>): DoclingPicture {
  return { bbox: [0, 0, 10, 10], page_no: 1, ...overrides };
}

function document(parts: Partial<DoclingDocument> = {}): DoclingDocument {
  return {
    schema_version: '1.10.0',
    name: 'fixture',
    pages: [],
    texts: [],
    pictures: [],
    tables: [],
    metadata: { page_count: 1, processing: {} },
    ...parts,
  };
}

describe('decideEnrichments', () => {
  it('asks for nothing when the baseline already answered everything', () => {
    const decision = decideEnrichments(
      document({
        texts: [text({ id: '#/texts/0', type: 'code', code_language: 'Python', text: 'x = 1' })],
        pictures: [
          picture({
            id: '#/pictures/0',
            enrichment: {
              classification: { class_name: 'bar_chart', confidence: 0.99 },
              chart: { rows: [['Альфа', '12']] },
            },
          }),
        ],
      })
    );

    expect(decision.requested).toEqual([]);
    expect(decision.signals).toEqual([]);
  });

  it('asks for a language only when the code block lacks one', () => {
    // Docling labels code without running any model but leaves the language
    // `unknown`; that gap is the signal, not the presence of code.
    for (const language of [undefined, '', 'unknown']) {
      const decision = decideEnrichments(
        document({ texts: [text({ id: '#/texts/0', type: 'code', code_language: language })] })
      );
      expect(decision.requested).toEqual(['code']);
      expect(decision.signals[0].refs).toEqual(['#/texts/0']);
    }
  });

  it('asks for a formula only when the region came back empty', () => {
    const empty = decideEnrichments(
      document({ texts: [text({ id: '#/texts/0', type: 'formula', text: '   ' })] })
    );
    expect(empty.requested).toEqual(['formula']);

    const alreadyRead = decideEnrichments(
      document({ texts: [text({ id: '#/texts/0', type: 'formula', text: 'x = a + b' })] })
    );
    expect(alreadyRead.requested).toEqual([]);
  });

  it('does not spend the chart model on series the source file already declares', () => {
    // A PPTX carries its series as XML and Docling reads them with no model at
    // all. Re-reading exact numbers with a vision model is strictly worse.
    const decision = decideEnrichments(
      document({
        pictures: [
          picture({
            id: '#/pictures/0',
            enrichment: {
              classification: { class_name: 'bar_chart', confidence: 0.99 },
              chart: { rows: [['Квартал 1', '10']] },
            },
          }),
        ],
      })
    );
    expect(decision.requested).toEqual([]);
  });

  it('does not spend the chart model on a picture that is not a chart', () => {
    const decision = decideEnrichments(
      document({
        pictures: [
          picture({
            id: '#/pictures/0',
            enrichment: { classification: { class_name: 'photograph', confidence: 0.99 } },
          }),
        ],
      })
    );
    expect(decision.requested).toEqual([]);
  });

  it('does not spend the chart model on a low-confidence guess', () => {
    const decision = decideEnrichments(
      document({
        pictures: [
          picture({
            id: '#/pictures/0',
            enrichment: {
              classification: {
                class_name: 'bar_chart',
                confidence: CHART_CLASSIFICATION_MIN_CONFIDENCE - 0.01,
              },
            },
          }),
        ],
      })
    );
    expect(decision.requested).toEqual([]);
  });

  it('cannot ask for chart extraction before anything classified the picture', () => {
    // Without the cheap classification pass a photograph and a bar chart look
    // identical, and guessing costs an 8 GB model.
    const decision = decideEnrichments(document({ pictures: [picture({ id: '#/pictures/0' })] }));
    expect(decision.requested).toEqual([]);
  });

  it('suppresses a rejected capability and says why', () => {
    const decision = decideEnrichments(
      document({
        pictures: [
          picture({
            id: '#/pictures/0',
            enrichment: { classification: { class_name: 'bar_chart', confidence: 0.99 } },
          }),
        ],
      }),
      { allowRejected: false }
    );
    // Chart extraction is not rejected, so it still goes through.
    expect(decision.requested).toEqual(['chart']);
    expect(REJECTED_CAPABILITIES.get('picture_description')).toMatch(/invents titles/u);
  });

  it('reports every justified capability at once', () => {
    const decision = decideEnrichments(
      document({
        texts: [
          text({ id: '#/texts/0', type: 'code', code_language: 'unknown' }),
          text({ id: '#/texts/1', type: 'formula', text: '' }),
        ],
        pictures: [
          picture({
            id: '#/pictures/0',
            enrichment: { classification: { class_name: 'line_chart', confidence: 0.9 } },
          }),
        ],
      })
    );
    expect(decision.requested.sort()).toEqual(['chart', 'code', 'formula']);
  });
});

describe('needsClassificationPass', () => {
  it('is true only while a picture has no classification', () => {
    expect(needsClassificationPass(document({ pictures: [picture({ id: '#/pictures/0' })] }))).toBe(
      true
    );
    expect(
      needsClassificationPass(
        document({
          pictures: [
            picture({
              id: '#/pictures/0',
              enrichment: { classification: { class_name: 'photograph' } },
            }),
          ],
        })
      )
    ).toBe(false);
    expect(needsClassificationPass(document())).toBe(false);
  });
});

describe('mergeEnrichment', () => {
  const accepted = document({
    texts: [
      text({ id: '#/texts/0', type: 'code', text: 'def f():', code_language: 'unknown' }),
      text({ id: '#/texts/1', type: 'formula', text: '' }),
      text({ id: '#/texts/2', text: 'Обычный абзац' }),
    ],
    pictures: [picture({ id: '#/pictures/0', caption: 'Диаграмма' })],
  });

  it('fills the holes the pass was asked to fill', () => {
    const { document: merged, matched } = mergeEnrichment(
      accepted,
      document({
        texts: [
          text({ id: '#/texts/0', type: 'code', text: 'def f():', code_language: 'Python' }),
          text({ id: '#/texts/1', type: 'formula', text: 'x = \\frac { 1 } { 2 }' }),
        ],
        pictures: [
          picture({
            id: '#/pictures/0',
            enrichment: { chart: { rows: [['Альфа', '12']] } },
          }),
        ],
      })
    );

    expect(merged.texts[0].code_language).toBe('Python');
    expect(merged.texts[1].text).toBe('x = \\frac { 1 } { 2 }');
    expect(merged.pictures[0].enrichment?.chart?.rows).toEqual([['Альфа', '12']]);
    expect(matched).toBe(3);
  });

  it('never overwrites text the baseline already read', () => {
    // The accepted artifact is the one the pipeline committed to. An advanced
    // pass may only add what was missing.
    const { document: merged } = mergeEnrichment(
      accepted,
      document({ texts: [text({ id: '#/texts/2', text: 'ПЕРЕПИСАННЫЙ АБЗАЦ' })] })
    );
    expect(merged.texts[2].text).toBe('Обычный абзац');
  });

  it('keeps the accepted caption and adds enrichment beside it', () => {
    const { document: merged } = mergeEnrichment(
      accepted,
      document({
        pictures: [
          picture({
            id: '#/pictures/0',
            caption: 'другая подпись',
            enrichment: { classification: { class_name: 'bar_chart', confidence: 0.99 } },
          }),
        ],
      })
    );
    expect(merged.pictures[0].caption).toBe('Диаграмма');
    expect(merged.pictures[0].enrichment?.classification?.class_name).toBe('bar_chart');
  });

  it('matches by ref, so a shifted second conversion cannot cross-attach', () => {
    // The failure this prevents: pairing the first picture of one run with the
    // first of another attaches a chart's series to an unrelated photograph.
    const { document: merged, unmatched } = mergeEnrichment(
      accepted,
      document({
        pictures: [
          picture({
            id: '#/pictures/7',
            enrichment: { chart: { rows: [['НЕ ТА', '999']] } },
          }),
        ],
      })
    );
    expect(merged.pictures[0].enrichment).toBeUndefined();
    expect(unmatched).toBeGreaterThan(0);
  });
});

describe('resolveConversionProfile with enrichment', () => {
  it('is unchanged when nothing was enriched', () => {
    expect(resolveConversionProfile({} as NodeJS.ProcessEnv)).toBe('baseline');
    expect(resolveConversionProfile({} as NodeJS.ProcessEnv, { capabilities: [] })).toBe(
      'baseline'
    );
  });

  it('separates an enriched artifact from the baseline one', () => {
    // Without this, a cached baseline document answers a request for the
    // enriched one — the same shape of bug as the Stage A MCP cache key that
    // hashed only the source and returned the previous profile's artifact.
    const baseline = resolveConversionProfile({} as NodeJS.ProcessEnv);
    const enriched = resolveConversionProfile({} as NodeJS.ProcessEnv, {
      capabilities: ['code', 'formula'],
    });
    expect(enriched).not.toBe(baseline);
    expect(enriched).toContain('CodeFormulaV2');
  });

  it('is stable under capability order', () => {
    expect(
      resolveConversionProfile({} as NodeJS.ProcessEnv, { capabilities: ['formula', 'code'] })
    ).toBe(
      resolveConversionProfile({} as NodeJS.ProcessEnv, { capabilities: ['code', 'formula'] })
    );
  });

  it('names the model, so swapping one invalidates the identity', () => {
    const chart = resolveConversionProfile({} as NodeJS.ProcessEnv, { capabilities: ['chart'] });
    expect(chart).toContain(ENRICHMENT_MODELS.chart);
    expect(chart).not.toBe(
      resolveConversionProfile({} as NodeJS.ProcessEnv, { capabilities: ['code'] })
    );
  });

  it('still separates the heading-inference profile underneath', () => {
    const withHeadings = resolveConversionProfile(
      { DOCLING_MCP_PDF_HEADING_HIERARCHY: 'true' } as unknown as NodeJS.ProcessEnv,
      { capabilities: ['code'] }
    );
    expect(withHeadings).toContain('pdf-heading-hierarchy');
    expect(withHeadings).not.toBe(
      resolveConversionProfile({} as NodeJS.ProcessEnv, { capabilities: ['code'] })
    );
  });
});
