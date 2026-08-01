/**
 * Phase 1: Docling Conversion
 *
 * Converts documents (PDF, DOCX, PPTX, HTML) to DoclingDocument JSON format
 * using Docling MCP server. Includes OCR, table extraction, and formula processing.
 *
 * @module stages/stage2-document-processing/phases/phase-1-docling-conversion
 */

import { Job } from 'bullmq';
import type { DocumentProcessingJobData } from '@megacampus/shared-types';
import {
  convertDocumentToMarkdown,
  processImages,
  extractSectionBoundaries,
  calculateSectionStatistics,
} from '../../../shared/embeddings/index.js';
import { DocumentProcessingResult } from '../types';

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
        'The file is most likely a scan with no text layer, which only OCR can read.'
    );
    this.name = 'EmptyConversionError';
  }
}

/**
 * Refuse a conversion that succeeded and returned nothing.
 *
 * MEASURED 2026-07-31: Docling turned a scanned PDF into fourteen characters and reported success.
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
