/**
 * Stage 2 Document Processing Phase Helpers
 *
 * Functions for executing individual processing phases:
 * - Document processing (Docling/plain text)
 * - Vector indexing (chunking, embedding, Qdrant)
 * - Summarization
 * - Finalization
 *
 * @module stages/stage2-document-processing/orchestrator-phase-helpers
 */

import type { Job } from 'bullmq';
import type { DocumentProcessingJobData, DocumentPriorityLevel } from '@megacampus/shared-types';
import type { DocumentProcessingResult } from './types';
import type { Locale } from '../../shared/i18n';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { logger } from '../../shared/logger/index.js';
import { executeDoclingConversion } from './phases/phase-1-docling-conversion';
import { executeChunking } from './phases/phase-4-chunking';
import { executeEmbeddingGeneration } from './phases/phase-5-embedding';
import { executeQdrantUpload } from './phases/phase-6-qdrant-upload';
import { executePhase6Summarization } from './phases/phase-6-summarization';
import { logTrace } from '../../shared/trace-logger';
import { getTranslator } from '../../shared/i18n';
import { processPlainTextDocument } from './plain-text-processing';
import { updateDocumentProcessingProgress } from './orchestrator-progress-helpers';
import { updateCourseProgressForJob } from './orchestrator-job-origin';
import {
  attemptFallbackExtraction,
  storeFallbackProcessedContent,
} from './orchestrator-fallback-helpers';

/**
 * Phase execution context for state threading
 */
export interface PhaseContext {
  fileId: string;
  filePath: string;
  courseId: string;
  organizationId: string;
  locale: Locale;
  tier: string;
  mimeType: string;
  priority: DocumentPriorityLevel;
  priorityWeight: number;
  job: Job<DocumentProcessingJobData>;
  startTime: number;
}

/**
 * Process document (plain text or Docling)
 * Returns processing result with markdown, JSON, stats
 */
export async function processDocument(
  context: PhaseContext,
  usePlainText: boolean
): Promise<DocumentProcessingResult> {
  const { fileId, filePath, courseId, tier, mimeType, locale, job } = context;
  const t = getTranslator(locale);
  const processingStartTime = Date.now();

  if (usePlainText) {
    // BASIC tier: Plain text processing
    await job.updateProgress(10);
    const result = await processPlainTextDocument(filePath, mimeType);
    await job.updateProgress(80);

    await logTrace({
      courseId,
      stage: 'stage_2',
      phase: 'processing',
      stepName: 'plaintext_read',
      inputData: { fileId, filePath, mimeType },
      outputData: { markdownLength: result.markdown.length },
      durationMs: Date.now() - processingStartTime,
    });

    return result;
  }

  // STANDARD/PREMIUM tier: Docling processing
  await job.updateProgress(10);
  await updateCourseProgressForJob(job.id, courseId, t('stage2.docling_start'));

  try {
    const result = await executeDoclingConversion(filePath, tier, job);

    await checkCancellation(job);
    await job.updateProgress(25);
    await updateCourseProgressForJob(job.id, courseId, t('stage2.docling_complete'));

    await logTrace({
      courseId,
      stage: 'stage_2',
      phase: 'processing',
      stepName: 'docling_conversion',
      inputData: { fileId, filePath, tier },
      outputData: {
        markdownLength: result.markdown.length,
        pages: result.stats.pages,
        images: result.stats.images,
      },
      durationMs: Date.now() - processingStartTime,
    });

    return result;
  } catch (doclingError) {
    // Docling failed - attempt fallback
    const errorMessage =
      doclingError instanceof Error ? doclingError.message : String(doclingError);

    logger.error(
      { fileId, filePath, error: errorMessage },
      'Docling conversion failed after retries, attempting fallback text extraction'
    );

    await logTrace({
      courseId,
      stage: 'stage_2',
      phase: 'processing',
      stepName: 'docling_conversion_failed',
      inputData: { fileId, filePath, tier },
      errorData: { error: errorMessage, fallback: 'attempting' },
      durationMs: Date.now() - processingStartTime,
    });

    const fallbackResult = await attemptFallbackExtraction(
      fileId,
      filePath,
      mimeType,
      errorMessage
    );

    if (fallbackResult) {
      logger.info(
        { fileId, markdownLength: fallbackResult.markdown.length },
        'Fallback text extraction succeeded'
      );
      await job.updateProgress(25);
      return fallbackResult;
    }

    // Complete failure - store error message (localized)
    await storeFallbackProcessedContent(fileId, errorMessage, locale);
    throw doclingError;
  }
}

/**
 * Execute chunking, embedding, and vector indexing phases
 */
export async function executeVectorIndexing(
  context: PhaseContext,
  processingResult: DocumentProcessingResult
): Promise<{ chunkCount: number; embeddingCount: number; pointsUploaded: number }> {
  const { fileId, filePath, courseId, organizationId, priority, priorityWeight, locale, job } =
    context;
  const t = getTranslator(locale);

  // Phase 4: Chunking (35-50%)
  await job.updateProgress(35);
  await updateCourseProgressForJob(job.id, courseId, t('stage2.chunking'));
  const chunkingStartTime = Date.now();

  const chunkingResult = await executeChunking(
    processingResult.markdown,
    {
      document_id: fileId,
      document_name: filePath.split('/').pop() || 'unknown',
      organization_id: organizationId,
      course_id: courseId || '',
      document_priority: priority,
      document_weight: priorityWeight,
    },
    job,
    {
      ...(processingResult.docling_source
        ? {
            docling: {
              documentKey: processingResult.docling_source.document_key,
              rawJsonPath: processingResult.docling_source.raw_json_path,
            },
          }
        : {}),
      docling_json: processingResult.json,
    }
  );

  logger.info(
    {
      fileId,
      chunkStrategy: chunkingResult.chunks.strategy,
      parentChunks: chunkingResult.chunks.parent_chunks.length,
      childChunks: chunkingResult.chunks.child_chunks.length,
      totalChunks: chunkingResult.enrichedChunks.length,
    },
    'Document chunked'
  );

  await logTrace({
    courseId,
    stage: 'stage_2',
    phase: 'chunking',
    stepName: 'hierarchical_chunking',
    inputData: { fileId, markdownLength: processingResult.markdown.length },
    outputData: {
      parentChunks: chunkingResult.chunks.parent_chunks.length,
      childChunks: chunkingResult.chunks.child_chunks.length,
      totalChunks: chunkingResult.enrichedChunks.length,
    },
    durationMs: Date.now() - chunkingStartTime,
  });

  // Phase 5: Embedding Generation (50-70%)
  await job.updateProgress(50);
  await updateCourseProgressForJob(job.id, courseId, t('stage2.embedding'));
  const embeddingStartTime = Date.now();

  const batchResult = await executeEmbeddingGeneration(chunkingResult.enrichedChunks, job);

  logger.info(
    {
      fileId,
      embeddingCount: batchResult.embeddings.length,
      totalTokens: batchResult.total_tokens,
    },
    'Embeddings generated'
  );

  await logTrace({
    courseId,
    stage: 'stage_2',
    phase: 'embedding',
    stepName: 'generate_embeddings',
    inputData: { fileId, chunkCount: chunkingResult.enrichedChunks.length },
    outputData: {
      embeddingCount: batchResult.embeddings.length,
      totalTokens: batchResult.total_tokens,
    },
    tokensUsed: batchResult.total_tokens,
    durationMs: Date.now() - embeddingStartTime,
  });

  // Phase 6: Qdrant Upload (70-80%)
  await job.updateProgress(70);
  await updateCourseProgressForJob(job.id, courseId, t('stage2.qdrant'));
  const uploadStartTime = Date.now();

  const uploadResult = await executeQdrantUpload(batchResult.embeddings, job);

  logger.info(
    {
      fileId,
      pointsUploaded: uploadResult.points_uploaded,
      batchCount: uploadResult.batch_count,
      durationMs: uploadResult.duration_ms,
    },
    'Vectors uploaded to Qdrant'
  );

  await logTrace({
    courseId,
    stage: 'stage_2',
    phase: 'indexing',
    stepName: 'qdrant_upload',
    inputData: { fileId, pointsCount: batchResult.embeddings.length },
    outputData: { pointsUploaded: uploadResult.points_uploaded },
    durationMs: Date.now() - uploadStartTime,
  });

  return {
    chunkCount: chunkingResult.enrichedChunks.length,
    embeddingCount: batchResult.embeddings.length,
    pointsUploaded: uploadResult.points_uploaded,
  };
}

/**
 * Execute document summarization phase
 */
export async function executeSummarization(
  context: PhaseContext,
  processingResult: DocumentProcessingResult
): Promise<void> {
  const { fileId, courseId, organizationId, locale, job } = context;
  const t = getTranslator(locale);

  // Phase 7: Document Summarization (80-90%)
  await job.updateProgress(80);
  await updateCourseProgressForJob(job.id, courseId, t('stage2.summarizing'));
  const summarizationStartTime = Date.now();

  try {
    const summarizationResult = await executePhase6Summarization(courseId, fileId, organizationId, {
      onProgress: (progress, _message) => {
        const mappedProgress = 80 + Math.floor(progress * 0.1);
        void job.updateProgress(mappedProgress);
      },
    });

    logger.info(
      {
        fileId,
        method: summarizationResult.processingMethod,
        summaryTokens: summarizationResult.summaryTokens,
        originalTokens: summarizationResult.originalTokens,
        qualityScore: summarizationResult.metadata.qualityScore,
      },
      'Document summarization complete'
    );

    await logTrace({
      courseId,
      stage: 'stage_2',
      phase: 'summarization',
      stepName: 'generate_summary',
      inputData: { fileId, originalTokens: summarizationResult.originalTokens },
      outputData: {
        method: summarizationResult.processingMethod,
        summaryTokens: summarizationResult.summaryTokens,
        qualityScore: summarizationResult.metadata.qualityScore,
      },
      tokensUsed: summarizationResult.summaryTokens,
      durationMs: Date.now() - summarizationStartTime,
    });

    processingResult.summarization = {
      success: summarizationResult.success,
      method: summarizationResult.processingMethod,
      summaryTokens: summarizationResult.summaryTokens,
      qualityScore: summarizationResult.metadata.qualityScore,
    };
  } catch (summarizationError) {
    await handleSummarizationFailure(fileId, courseId, summarizationError, summarizationStartTime);
  }
}

/**
 * Finalize processing and handle course completion
 */
export async function finalizeProcessing(context: PhaseContext): Promise<void> {
  const { fileId, courseId, locale, job, startTime } = context;
  const t = getTranslator(locale);
  const supabase = getSupabaseAdmin();

  // Finalize (95%)
  await job.updateProgress(95);
  await updateCourseProgressForJob(job.id, courseId, t('stage2.finalizing'));
  await assertIndexedBeforeFinalize(fileId, supabase);

  logger.info(
    {
      fileId,
      status: 'indexed',
    },
    'Document processing pipeline complete'
  );

  // Update course progress
  await updateDocumentProcessingProgress(courseId, supabase);

  // Wait for approval
  await job.updateProgress(96);

  // Complete
  await job.updateProgress(100);

  await logTrace({
    courseId,
    stage: 'stage_2',
    phase: 'complete',
    stepName: 'finish',
    inputData: { fileId },
    durationMs: Date.now() - startTime,
  });
}

async function assertIndexedBeforeFinalize(
  fileId: string,
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<void> {
  const { data, error } = await supabase
    .from('file_catalog')
    .select('vector_status, error_message')
    .eq('id', fileId)
    .single();

  if (error) {
    throw new Error(
      `Unable to verify vector_status before finalization for file ${fileId}: ${error.message}`
    );
  }

  if (!data || data.vector_status !== 'indexed') {
    const vectorStatus = data?.vector_status || 'unknown';
    const errorSuffix = data?.error_message ? `: ${data.error_message}` : '';

    logger.error(
      { fileId, vectorStatus, errorMessage: data?.error_message || null },
      'Refusing to finalize Stage 2 because vector indexing did not complete successfully'
    );

    throw new Error(
      `Cannot finalize Stage 2 for file ${fileId} because vector_status is '${vectorStatus}'${errorSuffix}`
    );
  }
}

/**
 * Handle summarization failure with fallback to markdown_content
 */
async function handleSummarizationFailure(
  fileId: string,
  courseId: string,
  summarizationError: unknown,
  startTime: number
): Promise<void> {
  const errorMessage =
    summarizationError instanceof Error ? summarizationError.message : String(summarizationError);

  logger.warn(
    { fileId, error: errorMessage },
    'Document summarization failed (non-fatal), writing markdown_content as fallback'
  );

  try {
    const supabase = getSupabaseAdmin();
    const { data: fileData } = await supabase
      .from('file_catalog')
      .select('markdown_content')
      .eq('id', fileId)
      .single();

    if (fileData?.markdown_content) {
      const { error: updateError } = await supabase
        .from('file_catalog')
        .update({
          processed_content: fileData.markdown_content,
          processing_method: 'full_text',
          summary_metadata: {
            error: errorMessage,
            fallback_reason: 'summarization_failed',
            quality_score: 0,
            is_fallback: true,
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
        logger.info({ fileId }, 'Stored markdown_content as fallback processed_content');
      }
    } else {
      logger.warn({ fileId }, 'No markdown_content available for fallback');
    }
  } catch (fallbackError) {
    logger.error(
      {
        fileId,
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      },
      'Failed to write fallback processed_content'
    );
  }

  await logTrace({
    courseId,
    stage: 'stage_2',
    phase: 'summarization',
    stepName: 'generate_summary',
    inputData: { fileId },
    errorData: { error: errorMessage, fallback: 'attempted' },
    durationMs: Date.now() - startTime,
  });
}

/**
 * Check if job has been cancelled
 */
function checkCancellation(job: Job<DocumentProcessingJobData>): Promise<void> {
  if (typeof (job as { getState?: unknown }).getState !== 'function') {
    return Promise.resolve();
  }

  return job.getState().then(state => {
    if (state === 'failed' || state === 'completed') {
      throw new Error('Job cancelled or already completed');
    }
  });
}
