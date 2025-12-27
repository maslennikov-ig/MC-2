/**
 * Document Processing Job Handler
 *
 * Handles document processing jobs for the RAG pipeline:
 * 1. Converts documents to DoclingDocument JSON using Docling MCP
 * 2. Converts to Markdown format for hierarchical chunking
 * 3. Extracts images with OCR text (basic, free)
 * 4. Stores processed data in file_catalog (parsed_content, markdown_content)
 * 5. Updates vector_status to 'ready' for subsequent chunking (T075)
 *
 * This is T074.3 - the Markdown conversion pipeline implementation.
 * Premium features (semantic image descriptions) are deferred to T074.5.
 *
 * @module stages/stage2-document-processing/handler
 */

import { Job } from 'bullmq';
import { access, constants } from 'fs/promises';
import { JobType, DocumentProcessingJobData } from '@megacampus/shared-types';
import { BaseJobHandler, JobResult } from '../../orchestrator/handlers/base-handler';
import { DocumentProcessingOrchestrator } from './orchestrator';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { logger } from '../../shared/logger/index.js';
import { logPermanentFailure } from '../../shared/logger';

/**
 * Configuration for ENOENT retry logic
 * Handles race conditions where files may not be immediately available
 * after Docker volume mount or container restart
 */
const FILE_ACCESS_RETRY_CONFIG = {
  /** Maximum number of retry attempts for file not found errors */
  maxRetries: 5,
  /** Initial delay between retries in milliseconds */
  initialDelayMs: 2000,
  /** Maximum delay between retries in milliseconds */
  maxDelayMs: 15000,
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: 1.5,
} as const;

/**
 * Document processing job handler
 *
 * Thin wrapper around DocumentProcessingOrchestrator that handles:
 * - FSM initialization fallback (Layer 3)
 * - Error handling and logging
 * - Job result formatting
 */
export class DocumentProcessingHandler extends BaseJobHandler<DocumentProcessingJobData> {
  private orchestrator: DocumentProcessingOrchestrator;

  constructor() {
    super(JobType.DOCUMENT_PROCESSING);
    this.orchestrator = new DocumentProcessingOrchestrator();
  }

  /**
   * Execute document processing
   *
   * Delegates to orchestrator for multi-phase processing, with FSM initialization
   * fallback and comprehensive error handling.
   */
  async execute(
    jobData: DocumentProcessingJobData,
    job: Job<DocumentProcessingJobData>
  ): Promise<JobResult> {
    const { fileId, filePath } = jobData;

    this.log(job, 'info', 'Starting document processing', {
      fileId,
      filePath,
    });

    // Layer 3: Worker validation and fallback initialization
    await this.ensureFsmInitialized(jobData, job);

    // Pre-check: Wait for file to be accessible (handles volume mount race conditions)
    await this.waitForFileAccess(filePath, job);

    try {
      // Delegate to orchestrator for multi-phase processing
      const processingResult = await this.orchestrator.execute(jobData, job);

      return {
        success: true,
        message: 'Document processed successfully',
        data: {
          fileId,
          chunkCount: processingResult.stats.markdown_length, // placeholder - actual count from orchestrator
          ...processingResult.stats,
        },
      };
    } catch (error) {
      // Check if this is a file not found error that should be retried
      if (this.isFileNotFoundError(error)) {
        this.log(job, 'warn', 'File not found during processing, may retry', {
          fileId,
          filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      this.log(job, 'error', 'Document processing failed', { error, fileId });

      // Update vector_status to 'failed'
      await this.updateVectorStatusOnFailure(fileId).catch((err: unknown) => {
        this.log(job, 'error', 'Failed to update vector status to failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

      // Log permanent failure to error_logs table
      await this.logPermanentFailure(jobData, job, error, filePath);

      return {
        success: false,
        message: 'Document processing failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Wait for file to be accessible with exponential backoff
   *
   * Handles race conditions where Docker volume mount may not be
   * immediately ready after container restart.
   *
   * @param filePath - Path to the file to check
   * @param job - BullMQ job for logging
   * @throws Error if file is not accessible after all retries
   */
  private async waitForFileAccess(
    filePath: string,
    job: Job<DocumentProcessingJobData>
  ): Promise<void> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < FILE_ACCESS_RETRY_CONFIG.maxRetries) {
      try {
        await access(filePath, constants.R_OK);
        if (attempt > 0) {
          this.log(job, 'info', 'File became accessible after retry', {
            filePath,
            attempts: attempt + 1,
          });
        }
        return; // File is accessible
      } catch (error) {
        attempt++;
        lastError = error as Error;

        if (attempt >= FILE_ACCESS_RETRY_CONFIG.maxRetries) {
          break; // Max retries reached
        }

        // Calculate delay based on attempt number using exponential backoff formula:
        // baseDelay * multiplier^(attempt-1)
        const delay = Math.min(
          FILE_ACCESS_RETRY_CONFIG.initialDelayMs *
            Math.pow(FILE_ACCESS_RETRY_CONFIG.backoffMultiplier, attempt - 1),
          FILE_ACCESS_RETRY_CONFIG.maxDelayMs
        );

        this.log(job, 'warn', 'File not accessible, waiting for volume mount', {
          filePath,
          attempt,
          maxRetries: FILE_ACCESS_RETRY_CONFIG.maxRetries,
          nextRetryMs: delay,
          error: lastError.message,
        });

        // Wait with exponential backoff
        await this.sleep(delay);
      }
    }

    // All retries exhausted
    this.log(job, 'error', 'File not accessible after all retries', {
      filePath,
      attempts: attempt,
      error: lastError?.message,
    });

    throw new Error(
      `File not accessible after ${attempt} retries: ${filePath}. ` +
      `Error: ${lastError?.message}. ` +
      `This may indicate a Docker volume mount issue.`
    );
  }

  /**
   * Type guard for NodeJS.ErrnoException
   */
  private isErrnoException(error: unknown): error is NodeJS.ErrnoException {
    return (
      error instanceof Error &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
    );
  }

  /**
   * Check if an error is a file not found error (ENOENT)
   */
  private isFileNotFoundError(error: unknown): boolean {
    // First check errno code (most reliable)
    if (this.isErrnoException(error) && error.code === 'ENOENT') {
      return true;
    }

    // Fallback to message matching for non-standard errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('enoent') ||
        message.includes('no such file or directory')
      );
    }

    return false;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Ensure FSM is initialized (Layer 3 fallback)
   *
   * If generation_status is still 'pending', initialize FSM as last resort.
   * This is a safety net - normally FSM should be initialized in Layer 1 or Layer 2.
   */
  private async ensureFsmInitialized(
    jobData: DocumentProcessingJobData,
    job: Job<DocumentProcessingJobData>
  ): Promise<void> {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: course } = await supabaseAdmin
      .from('courses')
      .select('generation_status')
      .eq('id', jobData.courseId)
      .single();

    if (!course) {
      this.log(job, 'error', 'Worker validation: Course not found', { courseId: jobData.courseId });
      throw new Error('Course not found');
    }

    if (course.generation_status === 'pending') {
      // FSM not initialized - last resort fallback
      this.log(job, 'warn', 'Worker validation: FSM still pending, initializing as fallback', {
        courseId: jobData.courseId,
        jobId: job.id,
      });

      try {
        const { InitializeFSMCommandHandler } = await import('../../shared/fsm/fsm-initialization-command-handler');
        const { metricsStore } = await import('../../orchestrator/metrics');

        const commandHandler = new InitializeFSMCommandHandler();
        await commandHandler.handle({
          entityId: jobData.courseId,
          userId: jobData.userId || 'system',
          organizationId: jobData.organizationId || 'unknown',
          idempotencyKey: `worker-fallback-stage2-${job.id}`,
          initiatedBy: 'WORKER',
          initialState: 'stage_2_init',
          data: { trigger: 'worker_fallback_stage2' },
          jobs: [], // Job already exists
        });

        // Track Layer 3 success
        metricsStore.recordLayer3Activation(true, jobData.courseId);

        this.log(job, 'info', 'Worker fallback: FSM initialized successfully', {
          courseId: jobData.courseId,
          jobId: job.id,
        });
      } catch (error) {
        // Track Layer 3 failure
        const { metricsStore } = await import('../../orchestrator/metrics');
        metricsStore.recordLayer3Activation(false, jobData.courseId);

        // Non-fatal: log warning and continue
        this.log(job, 'warn', 'Worker fallback initialization failed (continuing processing)', {
          courseId: jobData.courseId,
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Update vector_status to 'failed' on processing failure
   */
  private async updateVectorStatusOnFailure(fileId: string): Promise<void> {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('file_catalog')
      .update({ vector_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', fileId);

    if (error) {
      logger.error({ err: error, fileId }, 'Failed to update vector status to failed');
      throw new Error(`Failed to update vector status: ${error.message}`);
    }

    logger.info({ fileId, status: 'failed' }, 'Vector status updated to failed');
  }

  /**
   * Log permanent failure to error_logs table
   */
  private async logPermanentFailure(
    jobData: DocumentProcessingJobData,
    job: Job<DocumentProcessingJobData>,
    error: unknown,
    filePath: string
  ): Promise<void> {
    try {
      await logPermanentFailure({
        organization_id: jobData.organizationId,
        user_id: jobData.userId || undefined,
        error_message: error instanceof Error ? error.message : String(error),
        stack_trace: error instanceof Error ? error.stack : undefined,
        severity: 'ERROR',
        file_name: filePath.split('/').pop() || 'unknown',
        file_size: undefined,
        file_format: undefined,
        job_id: job.id,
        job_type: JobType.DOCUMENT_PROCESSING,
        metadata: {
          fileId: jobData.fileId,
          filePath,
          attempt: job.attemptsMade,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
      });
    } catch (logError) {
      this.log(job, 'error', 'Failed to log permanent failure', {
        error: logError instanceof Error ? logError.message : String(logError),
      });
    }
  }
}

/**
 * Singleton instance of the document processing handler
 */
export const documentProcessingHandler = new DocumentProcessingHandler();
