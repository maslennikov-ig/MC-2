/**
 * Phase 1: Docling Conversion
 *
 * Converts documents (PDF, DOCX, PPTX, HTML) to DoclingDocument JSON format
 * using Docling MCP server. Includes OCR, table extraction, and formula processing.
 *
 * @module stages/stage2-document-processing/phases/phase-1-docling-conversion
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Job } from 'bullmq';
import type { DocumentProcessingJobData } from '@megacampus/shared-types';
import { logger } from '../../../shared/logger/index.js';
import {
  convertDocumentToMarkdown,
  processImages,
  extractSectionBoundaries,
  calculateSectionStatistics,
} from '../../../shared/embeddings/index.js';
import { DocumentProcessingResult } from '../types';
import {
  applyEnrichment,
  DoclingServeEnricher,
  enrichmentEnabled,
} from '../docling/enrichment-router.js';
import type { DoclingDocument } from '../docling/types.js';

/**
 * Runs the enrichment router over an accepted conversion, if it is enabled.
 *
 * Returns the input document on every path that is not a clean success, so
 * turning enrichment on can add metadata and can never cost a conversion the
 * pipeline already accepted.
 */
async function enrichAcceptedDocument(
  document: DoclingDocument,
  filePath: string
): Promise<DoclingDocument> {
  if (!enrichmentEnabled()) return document;

  const baseUrl = process.env.DOCLING_SERVE_URL;
  const advancedUrl = process.env.DOCLING_SERVE_ADVANCED_URL;
  if (!baseUrl || !advancedUrl) {
    logger.warn(
      { hasBaseUrl: Boolean(baseUrl), hasAdvancedUrl: Boolean(advancedUrl) },
      'DOCLING_ENRICHMENT_ENABLED is set but a Serve URL is missing; skipping enrichment'
    );
    return document;
  }

  try {
    const bytes = await fs.readFile(filePath);
    const result = await applyEnrichment(
      document,
      { name: path.basename(filePath), bytes },
      new DoclingServeEnricher({ baseUrl, advancedUrl }),
      { documentKey: document.name }
    );
    return result.document;
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error), filePath },
      'Docling enrichment could not run; keeping the accepted document'
    );
    return document;
  }
}

/**
 * Shortest conversion this pipeline will treat as a document.
 *
 * The same floor the fallback extractors apply, so the primary path cannot hand downstream text
 * that a fallback would have refused.
 */
export const MINIMUM_EXTRACTED_TEXT_LENGTH = 50;

export class EmptyConversionError extends Error {
  constructor(
    readonly filePath: string,
    readonly extractedLength: number
  ) {
    super(
      `Conversion produced no usable text for ${filePath}: ${extractedLength} characters. ` +
        'It carries no extractable text layer: either a scan, or a diagram whose type was ' +
        'converted to curves. Only OCR can read it, and OCR did not find anything either.'
    );
    this.name = 'EmptyConversionError';
  }
}

/**
 * Refuse a conversion that succeeded and returned nothing.
 *
 * MEASURED 2026-07-31/08-01: Docling turned a one-page PDF into fourteen characters and reported
 * success. The 16 documents this affects are not scans but exported diagrams, 4296pt tall, whose
 * type was converted to curves, so they carry no text layer for any extractor to find.
 * Nothing threw, so the fallback extractor never ran; there were no chunks, so nothing was
 * uploaded; nothing was uploaded, so vector_status stayed 'indexing' and finalization refused. The
 * operator was left with 'Failed to convert document to markdown', which is the last true statement
 * about the document and points at the wrong step (mc2-3gz2m).
 */
export function assertConversionProducedText(markdown: string, filePath: string): void {
  const text = markdown.replace(/^#\s*Document\s*$/gmu, '').trim();
  if (text.length < MINIMUM_EXTRACTED_TEXT_LENGTH) {
    throw new EmptyConversionError(filePath, text.length);
  }
}

/**
 * Execute Docling conversion phase
 *
 * Converts document to DoclingDocument JSON with markdown, images, and metadata
 *
 * @param filePath - Absolute path to document file
 * @param tier - Organization tier (determines feature availability)
 * @param job - BullMQ job instance for progress tracking
 * @returns Document processing result with markdown, JSON, images, and stats
 */
export async function executeDoclingConversion(
  filePath: string,
  _tier: string,
  job: Job<DocumentProcessingJobData>
): Promise<DocumentProcessingResult> {
  // Phase 1a: Docling MCP conversion (10-40% progress)
  const conversionResult = await convertDocumentToMarkdown(filePath, {
    include_images: true,
    include_tables: true,
    include_ocr: true,
    include_formulas: true,
    max_heading_level: 6,
    include_page_markers: false,
  });

  // Before anything downstream spends time on it: an empty conversion is not a conversion.
  // Throwing here is what lets the fallback extractor run at all.
  assertConversionProducedText(conversionResult.markdown, filePath);

  // Phase 1a': selective enrichment. Off unless DOCLING_ENRICHMENT_ENABLED is
  // set, and additive when on: the accepted document above is what everything
  // downstream uses either way, and a failed pass returns it untouched.
  const enriched = await enrichAcceptedDocument(conversionResult.json, filePath);
  conversionResult.json = enriched;

  await job.updateProgress(40);

  // Phase 1b: Image processing (40-60% progress)
  await job.updateProgress(40);
  const imageProcessingResult = processImages(conversionResult.json, {
    extract_data: false,
    include_ocr: true,
    min_ocr_length: 10,
    generate_descriptions: false, // Premium feature deferred to future
  });

  await job.updateProgress(60);

  // Phase 1c: Section analysis (60-80% progress)
  const sectionBoundaries = extractSectionBoundaries(
    conversionResult.markdown,
    conversionResult.structure
  );
  const sectionStats = calculateSectionStatistics(sectionBoundaries);

  await job.updateProgress(80);

  return {
    markdown: conversionResult.markdown,
    json: conversionResult.json,
    images: conversionResult.images,
    docling_source: conversionResult.docling_source,
    stats: {
      markdown_length: conversionResult.markdown.length,
      pages: conversionResult.metadata.pages_processed,
      images: imageProcessingResult.total,
      tables: conversionResult.metadata.tables_extracted,
      sections: sectionStats.total_sections,
      processing_time_ms:
        conversionResult.metadata.processing_time_ms +
        imageProcessingResult.metadata.processing_time_ms,
    },
  };
}
