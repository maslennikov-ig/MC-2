/**
 * Document Processing Job Handler
 *
 * Handles document conversion using Docling MCP server.
 * Converts uploaded documents (PDF, DOCX, PPTX, etc.) to structured DoclingDocument JSON
 * and stores the parsed content in file_catalog for downstream processing.
 *
 * @module orchestrator/handlers/document-processing
 */

import { Job } from 'bullmq';
import { DocumentProcessingJobData, JobType } from '@megacampus/shared-types';
import { BaseJobHandler, JobResult } from './base-handler.js';
import { getDoclingClient, DoclingError, DoclingErrorCode } from '../../shared/mcp/index.js';
import { getSupabaseAdmin } from '../../shared/supabase/admin.js';

/**
 * Document Processing Handler
 *
 * Processes documents through the following stages:
 * 1. Validate file exists and is accessible
 * 2. Call Docling MCP server to convert document
 * 3. Store DoclingDocument JSON in file_catalog.parsed_content
 * 4. Update vector_status to 'indexing' to trigger chunking (T075)
 * 5. Update metadata (page_count, processing_time, etc.)
 *
 * @class DocumentProcessingHandler
 * @extends BaseJobHandler<DocumentProcessingJobData>
 */
export class DocumentProcessingHandler extends BaseJobHandler<DocumentProcessingJobData> {
  constructor() {
    super(JobType.DOCUMENT_PROCESSING);
  }

  /**
   * Execute document processing
   *
   * @param jobData - Document processing job data
   * @param job - BullMQ job instance
   * @returns Job result with processing status
   */
  async execute(
    jobData: DocumentProcessingJobData,
    job: Job<DocumentProcessingJobData>
  ): Promise<JobResult> {
    const { fileId, filePath, mimeType } = jobData;

    this.log(job, 'info', 'Starting document processing', {
      fileId,
      filePath,
      mimeType,
    });

    const supabase = getSupabaseAdmin();

    try {
      // Step 1: Validate file exists in database
      await this.updateProgress(job, 5, 'Validating file...');

      const { data: fileData, error: fileError } = await supabase
        .from('file_catalog')
        .select('id, file_path, mime_type, file_size, vector_status')
        .eq('id', fileId)
        .single();

      if (fileError || !fileData) {
        throw new Error(`File not found in database: ${fileId}`);
      }

      // Check if already processed (skip if vector_status is not 'pending')
      if (fileData.vector_status !== 'pending' && fileData.vector_status !== 'failed') {
        this.log(job, 'info', 'File already in processing or completed, skipping', {
          fileId,
          vector_status: fileData.vector_status,
        });
        return {
          success: true,
          message: 'File already processed or in progress',
          data: { fileId, vector_status: fileData.vector_status },
        };
      }

      // Check for cancellation before expensive operation
      await this.checkCancellation(job);

      // Step 2: Convert document using Docling MCP
      await this.updateProgress(job, 10, 'Connecting to Docling MCP server...');

      const doclingClient = getDoclingClient();
      await doclingClient.connect();

      // Construct absolute file path for MCP server (mounted as /app/uploads)
      const mcpFilePath = `/app/uploads/${filePath}`;

      await this.updateProgress(job, 20, 'Converting document...');

      this.log(job, 'info', 'Calling Docling MCP for document conversion', {
        fileId,
        mcpFilePath,
        mimeType,
      });

      const conversionStartTime = Date.now();

      const doclingDocument = await doclingClient.convertToDoclingDocument(mcpFilePath);

      const conversionDuration = Date.now() - conversionStartTime;

      this.log(job, 'info', 'Document conversion completed', {
        fileId,
        conversionDuration,
        pageCount: doclingDocument.metadata.page_count,
        textElements: doclingDocument.texts.length,
        tables: doclingDocument.tables.length,
        pictures: doclingDocument.pictures.length,
      });

      // Check for cancellation before database update
      await this.checkCancellation(job);

      // Step 3: Store parsed content in database
      await this.updateProgress(job, 80, 'Storing parsed content...');

      const { error: updateError } = await supabase
        .from('file_catalog')
        .update({
          parsed_content: doclingDocument,
          vector_status: 'indexing', // Trigger T075 chunking
          metadata: {
            ...fileData.metadata,
            docling: {
              schema_version: doclingDocument.schema_version,
              page_count: doclingDocument.metadata.page_count,
              language: doclingDocument.metadata.language,
              processing_time_ms: conversionDuration,
              processed_at: new Date().toISOString(),
              text_elements: doclingDocument.texts.length,
              tables: doclingDocument.tables.length,
              pictures: doclingDocument.pictures.length,
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', fileId);

      if (updateError) {
        throw new Error(`Failed to update file_catalog: ${updateError.message}`);
      }

      // Disconnect from MCP server
      await doclingClient.disconnect();

      await this.updateProgress(job, 100, 'Document processing completed');

      this.log(job, 'info', 'Document processing completed successfully', {
        fileId,
        totalDuration: Date.now() - conversionStartTime,
        nextStage: 'chunking (T075)',
      });

      return {
        success: true,
        message: 'Document processed successfully',
        data: {
          fileId,
          pageCount: doclingDocument.metadata.page_count,
          textElements: doclingDocument.texts.length,
          tables: doclingDocument.tables.length,
          pictures: doclingDocument.pictures.length,
          processingTime: conversionDuration,
          vectorStatus: 'indexing',
        },
      };
    } catch (error) {
      this.log(job, 'error', 'Document processing failed', { error });

      // Update file status to failed
      await supabase
        .from('file_catalog')
        .update({
          vector_status: 'failed',
          metadata: {
            error: {
              message: error instanceof Error ? error.message : String(error),
              code:
                error instanceof DoclingError ? error.code : DoclingErrorCode.UNKNOWN_ERROR,
              timestamp: new Date().toISOString(),
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', fileId);

      // Determine if error is retryable
      if (error instanceof DoclingError) {
        const nonRetryableErrors = [
          DoclingErrorCode.FILE_NOT_FOUND,
          DoclingErrorCode.UNSUPPORTED_FORMAT,
          DoclingErrorCode.CORRUPTED_FILE,
        ];

        if (nonRetryableErrors.includes(error.code)) {
          // Don't retry these errors - mark as failed
          return {
            success: false,
            message: error.message,
            error: error.code,
            data: { fileId, retryable: false },
          };
        }
      }

      // Re-throw to let BullMQ handle retries for retryable errors
      throw error;
    }
  }
}

/**
 * Singleton instance of DocumentProcessingHandler
 */
export const documentProcessingHandler = new DocumentProcessingHandler();

export default documentProcessingHandler;
