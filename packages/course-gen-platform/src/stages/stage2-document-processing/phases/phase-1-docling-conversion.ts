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
import { convertDocumentToMarkdown, processImages, extractSectionBoundaries, calculateSectionStatistics } from '../../../shared/embeddings/index.js';
import { DocumentProcessingResult } from '../types';

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
