import { describe, expect, it } from 'vitest';

import {
  assertConversionProducedText,
  EmptyConversionError,
  MINIMUM_EXTRACTED_TEXT_LENGTH,
} from '@/stages/stage2-document-processing/phases/phase-1-docling-conversion';

// MEASURED 2026-07-31 on megacampus-prod, document 914b5d2c-911b-4333-be85-4ac56273ee48, retried
// alone with no concurrency:
//
//   markdown_length: 14  ->  Document chunked  ->  embeddingCount: 0, totalTokens: 0
//   Starting Qdrant upload attempt pointsCount: 0
//   Vectors uploaded to Qdrant     pointsUploaded: 0, batchCount: 0
//   Refusing to finalize Stage 2 because vector indexing did not complete successfully
//
// Docling converted a scanned PDF into fourteen characters and REPORTED SUCCESS. Because it did not
// throw, the fallback extractor never ran; because there were no chunks, nothing was uploaded;
// because nothing was uploaded, vector_status stayed 'indexing' and finalize refused. Every step
// after the first behaved correctly on an input that was already empty.
//
// The failure the operator sees, 'Failed to convert document to markdown', is the LAST thing that
// is true about it, and it points at the wrong place. This guard makes the first step fail instead,
// which is also what gives the fallback a chance to run (mc2-3gz2m).
describe('assertConversionProducedText', () => {
  it('rejects the near-empty conversion that a scan without a text layer produces', () => {
    expect(() => assertConversionProducedText('# Document\n\n', '/uploads/scan.pdf')).toThrow(
      EmptyConversionError
    );
  });

  it('names the real problem instead of blaming the conversion', () => {
    let caught: unknown;
    try {
      assertConversionProducedText('abc', '/uploads/scan.pdf');
    } catch (error) {
      caught = error;
    }

    expect(String(caught)).toMatch(/3 characters/u);
    expect(String(caught)).toMatch(/text layer/u);
  });

  it('accepts a document that actually carries text', () => {
    const markdown = `# Заголовок\n\n${'слово '.repeat(20)}`;

    expect(markdown.length).toBeGreaterThan(MINIMUM_EXTRACTED_TEXT_LENGTH);
    expect(() => assertConversionProducedText(markdown, '/uploads/real.docx')).not.toThrow();
  });

  it('uses the same floor the fallback extractors already apply', () => {
    // orchestrator-fallback-helpers accepts PDF and DOCX output above 50 characters. A primary
    // conversion held to a lower bar would hand the pipeline text the fallback would have refused.
    expect(MINIMUM_EXTRACTED_TEXT_LENGTH).toBe(50);
  });
});
