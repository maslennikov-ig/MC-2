/**
 * Stage 2 Document Processing Fallback Helpers
 *
 * Functions for handling fallback text extraction when Docling fails:
 * - PDF fallback extraction
 * - Plain text fallback
 * - Minimal document structure creation
 * - Fallback content storage
 *
 * @module stages/stage2-document-processing/orchestrator-fallback-helpers
 */

import type { DocumentProcessingResult } from './types';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { logger } from '../../shared/logger/index.js';
import { logTrace } from '../../shared/trace-logger';
import { getTranslator, type Locale } from '../../shared/i18n/translator';

/**
 * Attempt fallback text extraction when Docling fails
 */
export async function attemptFallbackExtraction(
  fileId: string,
  filePath: string,
  mimeType: string,
  originalError: string
): Promise<DocumentProcessingResult | null> {
  const startTime = Date.now();
  let courseId: string | null = null;

  try {
    const supabase = getSupabaseAdmin();
    const { data: fileData } = await supabase
      .from('file_catalog')
      .select('course_id')
      .eq('id', fileId)
      .single();
    courseId = fileData?.course_id ?? null;
  } catch {
    // Continue without trace
  }

  try {
    // Try PDF fallback
    if (mimeType === 'application/pdf') {
      logger.info({ fileId, filePath }, 'Attempting PDF fallback extraction');

      const { PDFParse } = await import('pdf-parse');
      const fs = await import('fs/promises');
      const buffer = await fs.readFile(filePath);
      const parser = new PDFParse({ data: buffer });
      const textResult = await parser.getText();

      if (textResult.text && textResult.text.length > 50) {
        const markdown = `# Document\n\n${textResult.text}`;

        if (courseId) {
          await logTrace({
            courseId,
            stage: 'stage_2',
            phase: 'processing',
            stepName: 'fallback_extraction_success',
            inputData: { fileId, mimeType, fallbackMethod: 'pdf-parse' },
            outputData: { markdownLength: markdown.length, pages: textResult.total },
            durationMs: Date.now() - startTime,
          }).catch(err => logger.debug({ err }, 'Failed to log fallback trace'));
        }

        return {
          markdown,
          json: createMinimalDoclingDocument(filePath, textResult.total),
          images: [],
          stats: {
            markdown_length: markdown.length,
            pages: textResult.total || 1,
            images: 0,
            tables: 0,
            sections: 0,
            processing_time_ms: 0,
          },
        };
      }
    }

    // Try plain text fallback
    if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');

      if (content.length > 10) {
        return {
          markdown: content,
          json: createMinimalDoclingDocument(filePath, 1),
          images: [],
          stats: {
            markdown_length: content.length,
            pages: 1,
            images: 0,
            tables: 0,
            sections: 0,
            processing_time_ms: 0,
          },
        };
      }
    }

    logger.warn({ fileId, mimeType }, 'No fallback extraction available');

    if (courseId) {
      await logTrace({
        courseId,
        stage: 'stage_2',
        phase: 'processing',
        stepName: 'fallback_extraction_unavailable',
        inputData: { fileId, mimeType },
        errorData: { reason: 'no_fallback_available', originalError },
        durationMs: Date.now() - startTime,
      }).catch(err => logger.debug({ err }, 'Failed to log fallback trace'));
    }

    return null;
  } catch (fallbackError) {
    logger.error(
      {
        fileId,
        mimeType,
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        originalError,
      },
      'Fallback text extraction also failed'
    );

    if (courseId) {
      await logTrace({
        courseId,
        stage: 'stage_2',
        phase: 'processing',
        stepName: 'fallback_extraction_error',
        inputData: { fileId, mimeType },
        errorData: {
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          originalError,
        },
        durationMs: Date.now() - startTime,
      }).catch(err => logger.debug({ err }, 'Failed to log fallback trace'));
    }

    return null;
  }
}

/**
 * Create minimal DoclingDocument structure
 */
function createMinimalDoclingDocument(
  filePath: string,
  pageCount: number
): DocumentProcessingResult['json'] {
  return {
    schema_version: '2.0' as const,
    name: filePath,
    pages: [],
    texts: [],
    pictures: [],
    tables: [],
    metadata: {
      page_count: pageCount,
      format: 'fallback',
      processing: {
        timestamp: new Date().toISOString(),
      },
    },
  };
}

/**
 * Store fallback processed_content when extraction fails
 */
export async function storeFallbackProcessedContent(
  fileId: string,
  errorMessage: string,
  locale: Locale = 'ru'
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const t = getTranslator(locale);

    const fallbackContent =
      `[${t('errors.fallback_header')}]\n\n` +
      `${t('errors.fallback_body')}\n` +
      `${t('errors.fallback_reason', { reason: errorMessage })}\n\n` +
      t('errors.fallback_recommendations');

    const { error: updateError } = await supabase
      .from('file_catalog')
      .update({
        processed_content: fallbackContent,
        processing_method: 'full_text',
        vector_status: 'failed',
        error_message: errorMessage.substring(0, 1000),
        summary_metadata: {
          error: errorMessage,
          fallback_reason: 'docling_failed',
          quality_score: 0,
          is_fallback: true,
          timestamp: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', fileId);

    if (updateError) {
      logger.error(
        { fileId, error: updateError.message },
        'Failed to store fallback processed_content'
      );
    } else {
      logger.info({ fileId }, 'Stored fallback processed_content');
    }
  } catch (err) {
    logger.error(
      {
        fileId,
        error: err instanceof Error ? err.message : String(err),
      },
      'Exception while storing fallback processed_content'
    );
  }
}
