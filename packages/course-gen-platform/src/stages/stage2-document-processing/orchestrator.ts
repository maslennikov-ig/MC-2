/**
 * Stage 2: Document Processing Orchestrator
 *
 * Coordinates the document processing pipeline through 7 phases:
 * 1. Docling conversion (PDF/DOCX → DoclingDocument JSON)
 * 2. Markdown processing (DoclingDocument → Markdown)
 * 3. Image extraction (OCR + metadata)
 * 4. Chunking (hierarchical chunking)
 * 5. Embedding generation (late chunking embeddings)
 * 6. Qdrant upload (vector indexing)
 * 7. Document summarization (quality-validated summaries)
 *
 * Classification is handled in Stage 3 (separate stage).
 *
 * @module stages/stage2-document-processing/orchestrator
 */

import { Job } from 'bullmq';
import type { DocumentProcessingJobData } from '@megacampus/shared-types';
import { DocumentProcessingResult, FileWithOrganization } from './types';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { logger } from '../../shared/logger/index.js';
import { executeDoclingConversion } from './phases/phase-1-docling-conversion';
import { executeChunking } from './phases/phase-4-chunking';
import { executeEmbeddingGeneration } from './phases/phase-5-embedding';
import { executeQdrantUpload } from './phases/phase-6-qdrant-upload';
import { executePhase6Summarization } from './phases/phase-6-summarization';
import { logTrace } from '../../shared/trace-logger';

/**
 * Document Processing Orchestrator
 *
 * Coordinates multi-phase document processing pipeline with tier-based feature gating
 */
export class DocumentProcessingOrchestrator {
  /**
   * Execute complete document processing pipeline
   *
   * @param jobData - Document processing job data
   * @param job - BullMQ job instance (for progress tracking and cancellation)
   * @returns Processing result with markdown, JSON, images, and stats
   */
  async execute(
    jobData: DocumentProcessingJobData,
    job: Job<DocumentProcessingJobData>
  ): Promise<DocumentProcessingResult> {
    const { fileId, filePath, courseId, organizationId } = jobData;
    const startTime = Date.now();

    logger.info({
      fileId,
      filePath,
      courseId,
    }, 'Starting document processing orchestration');

    await logTrace({
      courseId,
      stage: 'stage_2',
      phase: 'init',
      stepName: 'start',
      inputData: { fileId, filePath, organizationId },
      durationMs: 0
    });

    // Step 1: Get file metadata and organization tier (5% progress)
    await this.updateProgress(job, 5, 'Fetching file metadata');
    const { tier, mimeType } = await this.getFileMetadata(fileId);

    logger.info({
      fileId,
      tier,
      mimeType,
    }, 'File metadata retrieved');

    // Step 2: Determine processing strategy based on tier
    const usePlainText = this.shouldUsePlainTextProcessing(tier, mimeType);

    let processingResult: DocumentProcessingResult;
    const processingStartTime = Date.now();

    if (usePlainText) {
      // BASIC tier: Plain text processing (TXT, MD)
      await this.updateProgress(job, 10, 'Reading plain text file');
      processingResult = await this.processPlainText(filePath, mimeType);
      await this.updateProgress(job, 80, 'Plain text processed');

      await logTrace({
        courseId,
        stage: 'stage_2',
        phase: 'processing',
        stepName: 'plaintext_read',
        inputData: { fileId, filePath, mimeType },
        outputData: { markdownLength: processingResult.markdown.length },
        durationMs: Date.now() - processingStartTime
      });
    } else {
      // STANDARD/PREMIUM tier: Docling processing
      // Phase 1: Docling Conversion (10-25% progress)
      await this.updateProgress(job, 10, 'Converting document with Docling');
      processingResult = await executeDoclingConversion(filePath, tier, job);

      await this.checkCancellation(job);
      await this.updateProgress(job, 25, 'Document converted');

      await logTrace({
        courseId,
        stage: 'stage_2',
        phase: 'processing',
        stepName: 'docling_conversion',
        inputData: { fileId, filePath, tier },
        outputData: {
          markdownLength: processingResult.markdown.length,
          pages: processingResult.stats.pages,
          images: processingResult.stats.images
        },
        durationMs: Date.now() - processingStartTime
      });
    }

    // Step 3: Store results in database (30% progress)
    await this.updateProgress(job, 30, 'Storing processed data');
    await this.storeProcessedDocument(fileId, processingResult);

    logger.info({ fileId }, 'Processed data stored in database');

    // Step 4: Update vector_status to 'indexing' (35% progress)
    await this.updateProgress(job, 35, 'Starting vector indexing');
    await this.updateVectorStatus(fileId, 'indexing');

    // Phase 4: Chunking (35-50% progress)
    await this.updateProgress(job, 35, 'Chunking document');
    const chunkingStartTime = Date.now();
    const chunkingResult = await executeChunking(
      processingResult.markdown,
      {
        document_id: fileId,
        document_name: filePath.split('/').pop() || 'unknown',
        organization_id: organizationId,
        course_id: courseId || '',
      },
      job
    );

    logger.info({
      fileId,
      parentChunks: chunkingResult.chunks.parent_chunks.length,
      childChunks: chunkingResult.chunks.child_chunks.length,
      totalChunks: chunkingResult.enrichedChunks.length,
    }, 'Document chunked');

    await logTrace({
      courseId,
      stage: 'stage_2',
      phase: 'chunking',
      stepName: 'hierarchical_chunking',
      inputData: { fileId, markdownLength: processingResult.markdown.length },
      outputData: {
        parentChunks: chunkingResult.chunks.parent_chunks.length,
        childChunks: chunkingResult.chunks.child_chunks.length,
        totalChunks: chunkingResult.enrichedChunks.length
      },
      durationMs: Date.now() - chunkingStartTime
    });

    // Phase 5: Embedding Generation (50-70% progress)
    await this.updateProgress(job, 50, 'Generating embeddings');
    const embeddingStartTime = Date.now();
    const batchResult = await executeEmbeddingGeneration(chunkingResult.enrichedChunks, job);

    logger.info({
      fileId,
      embeddingCount: batchResult.embeddings.length,
      totalTokens: batchResult.total_tokens,
    }, 'Embeddings generated');

    await logTrace({
      courseId,
      stage: 'stage_2',
      phase: 'embedding',
      stepName: 'generate_embeddings',
      inputData: { fileId, chunkCount: chunkingResult.enrichedChunks.length },
      outputData: {
        embeddingCount: batchResult.embeddings.length,
        totalTokens: batchResult.total_tokens
      },
      tokensUsed: batchResult.total_tokens,
      durationMs: Date.now() - embeddingStartTime
    });

    // Phase 6: Qdrant Upload (70-80% progress)
    await this.updateProgress(job, 70, 'Uploading vectors to Qdrant');
    const uploadStartTime = Date.now();
    const uploadResult = await executeQdrantUpload(batchResult.embeddings, job);

    logger.info({
      fileId,
      pointsUploaded: uploadResult.points_uploaded,
      batchCount: uploadResult.batch_count,
      durationMs: uploadResult.duration_ms,
    }, 'Vectors uploaded to Qdrant');

    await logTrace({
      courseId,
      stage: 'stage_2',
      phase: 'indexing',
      stepName: 'qdrant_upload',
      inputData: { fileId, pointsCount: batchResult.embeddings.length },
      outputData: { pointsUploaded: uploadResult.points_uploaded },
      durationMs: Date.now() - uploadStartTime
    });

    // Phase 7: Document Summarization (80-90% progress)
    await this.updateProgress(job, 80, 'Generating document summary');
    const summarizationStartTime = Date.now();

    try {
      const summarizationResult = await executePhase6Summarization(
        courseId,
        fileId,
        organizationId,
        {
          onProgress: (progress, message) => {
            // Map 0-100% to 80-90%
            const mappedProgress = 80 + Math.floor(progress * 0.1);
            // Fire-and-forget: progress updates are non-blocking
            void this.updateProgress(job, mappedProgress, message);
          }
        }
      );

      logger.info({
        fileId,
        method: summarizationResult.processingMethod,
        summaryTokens: summarizationResult.summaryTokens,
        originalTokens: summarizationResult.originalTokens,
        qualityScore: summarizationResult.metadata.qualityScore,
      }, 'Document summarization complete');

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
        durationMs: Date.now() - summarizationStartTime
      });

      // Store summary result in processing result
      processingResult.summarization = {
        success: summarizationResult.success,
        method: summarizationResult.processingMethod,
        summaryTokens: summarizationResult.summaryTokens,
        qualityScore: summarizationResult.metadata.qualityScore,
      };
    } catch (summarizationError) {
      // Summarization failure is non-fatal - Stage 3 classification can use markdown_content
      logger.warn({
        fileId,
        error: summarizationError instanceof Error ? summarizationError.message : String(summarizationError),
      }, 'Document summarization failed (non-fatal), Stage 3 classification will use markdown_content');

      await logTrace({
        courseId,
        stage: 'stage_2',
        phase: 'summarization',
        stepName: 'generate_summary',
        inputData: { fileId },
        errorData: { error: summarizationError instanceof Error ? summarizationError.message : String(summarizationError) },
        durationMs: Date.now() - summarizationStartTime
      });
    }

    // Step 9: Finalize (95% progress)
    await this.updateProgress(job, 95, 'Finalizing indexing');

    logger.info({
      fileId,
      vectorsIndexed: uploadResult.points_uploaded,
      status: 'indexed',
    }, 'Document processing pipeline complete');

    // Update course progress
    const supabase = getSupabaseAdmin();
    await this.updateDocumentProcessingProgress(courseId, supabase);

    // Step 10: Create Stage 3 Summarization job (96% progress)
    // DISABLED for Stage Gates: Manual approval required before Stage 3
    // await this.updateProgress(job, 96, 'Queuing summarization');
    // await this.createSummarizationJob(jobData, job, processingResult, filePath);
    await this.updateProgress(job, 96, 'Waiting for approval');

    // Complete (100% progress)
    await this.updateProgress(job, 100, 'Document processing complete');

    await logTrace({
      courseId,
      stage: 'stage_2',
      phase: 'complete',
      stepName: 'finish',
      inputData: { fileId },
      durationMs: Date.now() - startTime
    });

    return processingResult;
  }

  /**
   * Check if plain text processing should be used (BASIC tier or TXT/MD files)
   */
  private shouldUsePlainTextProcessing(tier: string, mimeType: string): boolean {
    // BASIC tier: plain text only
    if (tier === 'basic') {
      return true;
    }

    // For STANDARD/PREMIUM: use plain text for TXT/MD (Docling doesn't support these)
    if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      return true;
    }

    return false;
  }

  /**
   * Process plain text files (TXT, MD) - direct read, no Docling
   */
  private async processPlainText(
    filePath: string,
    mimeType: string
  ): Promise<DocumentProcessingResult> {
    const fs = await import('fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');

    const basicDoclingDoc = {
      schema_version: '2.0' as const,
      name: filePath,
      pages: [],
      texts: [],
      pictures: [],
      tables: [],
      metadata: {
        page_count: 1,
        format: mimeType,
        processing: {
          timestamp: new Date().toISOString(),
        },
      },
    };

    return {
      markdown: content,
      json: basicDoclingDoc,
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

  /**
   * Get file metadata including organization tier
   */
  private async getFileMetadata(fileId: string): Promise<{ tier: string; mimeType: string }> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('file_catalog')
      .select('mime_type, organization_id, organizations(tier)')
      .eq('id', fileId)
      .single();

    if (error || !data) {
      logger.error({ err: error, fileId }, 'Failed to fetch file metadata');
      throw new Error(`Failed to fetch file metadata: ${error?.message || 'File not found'}`);
    }

    // Type-safe access with proper type assertion
    const fileData = data as unknown as FileWithOrganization;

    // Validate organization data exists
    if (!fileData.organizations?.tier) {
      throw new Error(
        `Organization tier not found for file ${fileId}. ` +
        `Organization ID: ${fileData.organization_id}. ` +
        `This may indicate a database integrity issue.`
      );
    }

    return {
      tier: fileData.organizations.tier,
      mimeType: fileData.mime_type,
    };
  }

  /**
   * Store processed document data in file_catalog
   */
  private async storeProcessedDocument(
    fileId: string,
    processingResult: DocumentProcessingResult
  ): Promise<void> {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('file_catalog')
      .update({
        parsed_content: processingResult.json as any,
        markdown_content: processingResult.markdown,
        updated_at: new Date().toISOString(),
      })
      .eq('id', fileId);

    if (error) {
      logger.error({ err: error, fileId }, 'Failed to store processed document');
      throw new Error(`Failed to store processed document: ${error.message}`);
    }

    logger.info({
      fileId,
      markdown_length: processingResult.markdown.length,
      json_size: JSON.stringify(processingResult.json).length,
    }, 'Processed document stored successfully');
  }

  /**
   * Update vector_status in file_catalog
   */
  private async updateVectorStatus(
    fileId: string,
    status: 'pending' | 'indexing' | 'indexed' | 'failed'
  ): Promise<void> {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('file_catalog')
      .update({ vector_status: status, updated_at: new Date().toISOString() })
      .eq('id', fileId);

    if (error) {
      logger.error({ err: error, fileId, status }, 'Failed to update vector status');
      throw new Error(`Failed to update vector status: ${error.message}`);
    }

    logger.info({ fileId, status }, 'Vector status updated');
  }

  /**
   * Update course progress based on completed document processing jobs
   *
   * IMPORTANT: This method checks the current generation_status before updating
   * to prevent race conditions where Stage 2 jobs complete after the user has
   * already approved Stage 2 and moved to Stage 3+.
   */
  private async updateDocumentProcessingProgress(
    courseId: string,
    supabaseAdmin: ReturnType<typeof getSupabaseAdmin>
  ): Promise<void> {
    try {
      // First, check current generation_status to prevent race conditions
      // If the course has already moved past Stage 2, don't try to update
      const { data: course, error: courseError } = await supabaseAdmin
        .from('courses')
        .select('generation_status')
        .eq('id', courseId)
        .single();

      if (courseError || !course) {
        logger.warn(
          { courseId, error: courseError },
          'Failed to fetch course status for progress update (non-fatal)'
        );
        return;
      }

      const currentStatus = course.generation_status as string;

      // Only update if we're still in early Stage 2 states
      // If already in awaiting_approval or complete, don't try to regress to processing
      const updatableStates = ['stage_2_init', 'stage_2_processing'];
      const terminalStage2States = ['stage_2_complete', 'stage_2_awaiting_approval'];

      if (terminalStage2States.includes(currentStatus)) {
        logger.info(
          { courseId, currentStatus },
          'Course already in terminal Stage 2 state, skipping progress update (normal parallel processing race condition)'
        );
        return;
      }

      if (!updatableStates.includes(currentStatus)) {
        logger.info(
          { courseId, currentStatus },
          'Course already past Stage 2, skipping progress update (normal race condition)'
        );
        return;
      }

      // Count completed documents (vector_status='indexed')
      const { count: completedCount, error: completedError } = await supabaseAdmin
        .from('file_catalog')
        .select('*', { count: 'exact', head: true })
        .eq('course_id', courseId)
        .eq('vector_status', 'indexed');

      if (completedError) {
        logger.error(
          { courseId, error: completedError },
          'Failed to count completed documents (non-fatal)'
        );
        return;
      }

      // Count total documents
      const { count: totalCount, error: totalError } = await supabaseAdmin
        .from('file_catalog')
        .select('*', { count: 'exact', head: true })
        .eq('course_id', courseId);

      if (totalError) {
        logger.error(
          { courseId, error: totalError },
          'Failed to count total documents (non-fatal)'
        );
        return;
      }

      const completed = completedCount || 0;
      const total = totalCount || 0;

      logger.debug(
        { courseId, completedCount: completed, totalCount: total },
        'Course progress calculated'
      );

      if (completed < total) {
        // Still processing documents
        const { error: rpcError } = await supabaseAdmin.rpc('update_course_progress', {
          p_course_id: courseId,
          p_step_id: 2,
          p_status: 'in_progress',
          p_message: `Обработка документов... (${completed}/${total})`,
        });

        if (rpcError) {
          logger.error(
            { courseId, error: rpcError },
            'Failed to update course progress (non-fatal)'
          );
        } else {
          logger.info(
            { courseId, completedCount: completed, totalCount: total },
            'Course progress updated: stage_2_processing'
          );
        }
      } else {
        // All documents complete - update to awaiting_approval
        // Note: This will be blocked by FSM if status already moved past Stage 2
        const { error: rpcError } = await supabaseAdmin.rpc('update_course_progress', {
          p_course_id: courseId,
          p_step_id: 2,
          p_status: 'completed',
          p_message: 'Документы обработаны',
        });

        if (rpcError) {
          // Check if this is an FSM transition error (expected race condition)
          const errorMessage = rpcError.message || '';
          if (errorMessage.includes('Invalid generation status transition')) {
            logger.info(
              { courseId, error: rpcError.message },
              'Stage 2 completion update blocked by FSM (user approved early - normal race condition)'
            );
          } else {
            logger.error(
              { courseId, error: rpcError },
              'Failed to update course progress to stage_2_complete (non-fatal)'
            );
          }
        } else {
          logger.info(
            { courseId, totalCount: total },
            'All documents complete for course'
          );
        }
      }
    } catch (err) {
      logger.error(
        { courseId, error: err },
        'Exception while updating course progress (non-fatal)'
      );
    }
  }

  /**
   * Update job progress
   */
  private async updateProgress(
    job: Job<DocumentProcessingJobData>,
    progress: number,
    message: string
  ): Promise<void> {
    await job.updateProgress(progress);
    logger.debug({
      jobId: job.id,
      progress,
      message,
    }, 'Progress updated');
  }

  /**
   * Check if job has been cancelled
   */
  private async checkCancellation(job: Job<DocumentProcessingJobData>): Promise<void> {
    // Note: BullMQ doesn't have isDiscarded() - check if job state is 'failed' or 'completed'
    const state = await job.getState();
    if (state === 'failed' || state === 'completed') {
      throw new Error('Job cancelled or already completed');
    }
  }
}
