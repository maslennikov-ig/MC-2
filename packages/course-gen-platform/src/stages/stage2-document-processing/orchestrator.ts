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

import type { Job } from 'bullmq';
import type { DocumentProcessingJobData } from '@megacampus/shared-types';
import type { DocumentProcessingResult } from './types';
import {
  type PhaseContext,
  getFileMetadata,
  initializeProcessing,
  processDocument,
  storeProcessedDocument,
  updateVectorStatus,
  executeVectorIndexing,
  executeSummarization,
  finalizeProcessing,
} from './orchestrator-helpers';

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
    const { fileId, filePath, courseId, organizationId, locale = 'ru' } = jobData;
    const startTime = Date.now();

    // Get file metadata
    const { tier, mimeType, priority, priorityWeight } = await getFileMetadata(fileId);

    // Build phase context
    const context: PhaseContext = {
      fileId,
      filePath,
      courseId,
      organizationId,
      locale,
      tier,
      mimeType,
      priority,
      priorityWeight,
      job,
      startTime,
    };

    // Phase 1: Initialize processing
    const { usePlainText } = await initializeProcessing(context);

    // Phase 2: Process document (Docling or plain text)
    const processingResult = await processDocument(context, usePlainText);

    // Phase 3: Store results in database (30%)
    await job.updateProgress(30);
    await storeProcessedDocument(fileId, processingResult, courseId);

    // Phase 4: Update vector_status to 'indexing' (35%)
    await job.updateProgress(35);
    await updateVectorStatus(fileId, 'indexing');

    // Phase 5: Execute vector indexing (chunking, embedding, Qdrant)
    await executeVectorIndexing(context, processingResult);

    // Phase 6: Execute summarization
    await executeSummarization(context, processingResult);

    // Phase 7: Finalize processing
    await finalizeProcessing(context);

    return processingResult;
  }
}
