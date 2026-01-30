/**
 * Stage 3: Document Classification Orchestrator
 *
 * Coordinates document classification for a course:
 * 1. Loads all documents for the course with processed summaries
 * 2. Executes comparative classification (CORE/IMPORTANT/SUPPLEMENTARY)
 * 3. Stores classification results back to file_catalog
 * 4. Returns classification summary
 *
 * Classification ensures proper priority distribution:
 * - Exactly 1 CORE document (most important)
 * - Up to 30% IMPORTANT documents
 * - Remaining SUPPLEMENTARY documents
 *
 * @module stages/stage3-classification/orchestrator
 */

import { logger } from '../../shared/logger/index.js';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { executeDocumentClassificationComparative } from './phases/phase-classification';
import { logTrace } from '../../shared/trace-logger';
import type { Stage3Input, Stage3Output } from './types';
import type { DocumentPriority, DocumentPriorityLevel } from '@megacampus/shared-types';

/**
 * Feature flag to disable LLM-based Stage 3 classification
 *
 * When set to 'true', Stage 3 completes immediately as a no-op,
 * relying on user-assigned or default priorities instead of LLM classification.
 *
 * This is part of the RAG refactoring to eliminate LLM classification errors
 * and use priority boosting during retrieval instead.
 *
 * @see docs/tasks/REFACTOR-RAG-PRIORITY-BASED-RETRIEVAL.md
 * @default 'false' - LLM classification is enabled by default
 */
const SKIP_STAGE3_CLASSIFICATION = process.env.SKIP_STAGE3_CLASSIFICATION === 'true';

/**
 * Stage 3 Classification Orchestrator
 *
 * Orchestrates document classification using comparative ranking
 */
export class Stage3ClassificationOrchestrator {
  /**
   * Execute Stage 3 classification pipeline
   *
   * @param input - Classification input with course ID and organization ID
   * @returns Classification output with priority assignments
   */
  async execute(input: Stage3Input): Promise<Stage3Output> {
    const { courseId, organizationId, onProgress } = input;
    const startTime = Date.now();

    // Check feature flag to skip LLM classification
    if (SKIP_STAGE3_CLASSIFICATION) {
      // SECURITY AUDIT: Log feature flag bypass for observability
      logger.warn(
        {
          courseId,
          organizationId,
          featureFlag: 'SKIP_STAGE3_CLASSIFICATION',
          reason: 'LLM classification bypassed via environment variable',
        },
        'SECURITY: Stage 3 classification bypassed via feature flag'
      );

      // Log to trace system for full observability
      await logTrace({
        courseId,
        stage: 'stage_3',
        phase: 'classification_skip',
        stepName: 'feature_flag_triggered',
        inputData: {
          organizationId,
          reason: 'SKIP_STAGE3_CLASSIFICATION=true',
          triggeredBy: 'environment_variable',
        },
        durationMs: 0,
      });

      if (onProgress) {
        onProgress(100, 'Classification skipped (using existing priorities)');
      }

      // Return success with empty classifications (relies on existing file_catalog.priority)
      return await this.skipClassification(courseId, startTime);
    }

    logger.info({ courseId, organizationId }, 'Starting Stage 3 document classification');

    await logTrace({
      courseId,
      stage: 'stage_3',
      phase: 'init',
      stepName: 'start',
      inputData: { organizationId },
      durationMs: 0,
    });

    if (onProgress) {
      onProgress(10, 'Loading documents...');
    }

    // Step 1: Load all documents for the course
    const fileIds = await this.loadDocumentIds(courseId);

    if (fileIds.length === 0) {
      logger.warn({ courseId }, 'No documents found for classification');
      return {
        success: false,
        courseId,
        classifications: [],
        totalDocuments: 0,
        coreCount: 0,
        importantCount: 0,
        supplementaryCount: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Single document optimization: auto-assign CORE priority (skip LLM classification)
    if (fileIds.length === 1) {
      logger.info(
        { courseId, fileId: fileIds[0] },
        'Single document detected - auto-assigning CORE priority (skipping LLM classification)'
      );

      if (onProgress) {
        onProgress(50, 'Single document - assigning CORE priority...');
      }

      const result = await this.assignSingleDocumentAsCORE(courseId, fileIds[0], startTime);

      if (onProgress) {
        onProgress(100, 'Classification complete (single document)');
      }

      return result;
    }

    logger.info({ courseId, documentCount: fileIds.length }, 'Documents loaded for classification');

    await logTrace({
      courseId,
      stage: 'stage_3',
      phase: 'loading',
      stepName: 'documents_loaded',
      inputData: { organizationId },
      outputData: { documentCount: fileIds.length },
      durationMs: Date.now() - startTime,
    });

    if (onProgress) {
      onProgress(30, `Classifying ${fileIds.length} documents...`);
    }

    // Step 2: Execute comparative classification
    const classificationStartTime = Date.now();
    const classificationResults: DocumentPriority[] =
      await executeDocumentClassificationComparative(courseId, fileIds, organizationId);

    if (onProgress) {
      onProgress(80, 'Classification complete, preparing results...');
    }

    // Step 3: Load filenames for output
    const filenames = await this.loadFilenames(fileIds);

    // Step 4: Build output
    const classifications = classificationResults.map(result => ({
      fileId: result.file_id,
      filename: filenames.get(result.file_id) || 'Unknown',
      priority: this.mapPriorityToLevel(result.importance_score),
      rationale: result.classification_rationale,
    }));

    // Count priority levels
    const coreCount = classifications.filter(c => c.priority === 'CORE').length;
    const importantCount = classifications.filter(c => c.priority === 'IMPORTANT').length;
    const supplementaryCount = classifications.filter(c => c.priority === 'SUPPLEMENTARY').length;

    await logTrace({
      courseId,
      stage: 'stage_3',
      phase: 'classification',
      stepName: 'llm_classification_complete',
      inputData: { documentCount: fileIds.length },
      outputData: {
        coreCount,
        importantCount,
        supplementaryCount,
      },
      durationMs: Date.now() - classificationStartTime,
    });

    const processingTimeMs = Date.now() - startTime;

    logger.info(
      {
        courseId,
        totalDocuments: fileIds.length,
        coreCount,
        importantCount,
        supplementaryCount,
        processingTimeMs,
      },
      'Stage 3 classification complete'
    );

    if (onProgress) {
      onProgress(100, 'Classification finished');
    }

    await logTrace({
      courseId,
      stage: 'stage_3',
      phase: 'complete',
      stepName: 'finish',
      inputData: { documentCount: fileIds.length },
      outputData: {
        coreCount,
        importantCount,
        supplementaryCount,
      },
      durationMs: processingTimeMs,
    });

    return {
      success: true,
      courseId,
      classifications,
      totalDocuments: fileIds.length,
      coreCount,
      importantCount,
      supplementaryCount,
      processingTimeMs,
    };
  }

  /**
   * Load all document IDs for a course
   */
  private async loadDocumentIds(courseId: string): Promise<string[]> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('file_catalog')
      .select('id')
      .eq('course_id', courseId)
      .not('processed_content', 'is', null); // Only documents with summaries

    if (error) {
      logger.error({ error, courseId }, 'Failed to load document IDs');
      throw new Error(`Failed to load document IDs: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map(file => file.id);
  }

  /**
   * Load filenames for documents
   */
  private async loadFilenames(fileIds: string[]): Promise<Map<string, string>> {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('file_catalog')
      .select('id, filename')
      .in('id', fileIds);

    if (error) {
      logger.warn({ error, fileIds }, 'Failed to load filenames');
      return new Map();
    }

    const filenamesMap = new Map<string, string>();
    if (data) {
      for (const file of data) {
        filenamesMap.set(file.id, file.filename);
      }
    }

    return filenamesMap;
  }

  /**
   * Map importance score to DocumentPriorityLevel
   *
   * This mapping aligns with the comparative classification output:
   * - importance_score >= 0.9: CORE
   * - importance_score >= 0.7 and < 0.9: IMPORTANT
   * - importance_score < 0.7: SUPPLEMENTARY
   */
  private mapPriorityToLevel(importanceScore: number): 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY' {
    if (importanceScore >= 0.9) {
      return 'CORE';
    } else if (importanceScore >= 0.7) {
      return 'IMPORTANT';
    } else {
      return 'SUPPLEMENTARY';
    }
  }

  /**
   * Auto-assign CORE priority to single document (skip LLM classification)
   *
   * When only one document is uploaded, it's automatically the most important.
   * No need to call LLM for comparative classification.
   */
  private async assignSingleDocumentAsCORE(
    courseId: string,
    fileId: string,
    startTime: number
  ): Promise<Stage3Output> {
    const supabase = getSupabaseAdmin();

    // Log trace for observability
    await logTrace({
      courseId,
      stage: 'stage_3',
      phase: 'single_document_skip',
      stepName: 'auto_assign_core',
      inputData: {
        fileId,
        reason: 'single_document_auto_core',
      },
      durationMs: 0,
    });

    // Load filename for output
    const { data: fileData, error: fileError } = await supabase
      .from('file_catalog')
      .select('filename, summary_metadata')
      .eq('id', fileId)
      .single();

    if (fileError || !fileData) {
      logger.error(
        { fileId, error: fileError },
        'Failed to load file for single-document CORE assignment'
      );
      throw new Error(`Failed to load file: ${fileError?.message || 'not found'}`);
    }

    // Build classification metadata
    const now = new Date();
    const existingMetadata = (fileData.summary_metadata as Record<string, unknown>) || {};
    const classificationMetadata = {
      ...existingMetadata,
      classification: {
        priority: 'HIGH',
        priority_level: 'CORE',
        importance_score: 1.0, // Max score for single document
        order: 1,
        classification_rationale:
          'Auto-assigned CORE: single document in course (LLM classification skipped)',
        classified_at: now.toISOString(),
      },
    };

    // Update file_catalog with CORE priority
    const { error: updateError } = await supabase
      .from('file_catalog')
      .update({
        priority: 'CORE',
        summary_metadata: classificationMetadata,
        updated_at: now.toISOString(),
      })
      .eq('id', fileId);

    if (updateError) {
      logger.error({ fileId, error: updateError }, 'Failed to update file with CORE priority');
      throw new Error(`Failed to update priority: ${updateError.message}`);
    }

    const processingTimeMs = Date.now() - startTime;

    logger.info(
      {
        courseId,
        fileId,
        filename: fileData.filename,
        processingTimeMs,
      },
      'Single document auto-assigned as CORE'
    );

    return {
      success: true,
      courseId,
      classifications: [
        {
          fileId,
          filename: fileData.filename,
          priority: 'CORE',
          rationale: 'Auto-assigned CORE: single document in course (LLM classification skipped)',
        },
      ],
      totalDocuments: 1,
      coreCount: 1,
      importantCount: 0,
      supplementaryCount: 0,
      processingTimeMs,
    };
  }

  /**
   * Skip LLM classification and return success with existing priorities
   *
   * Called when SKIP_STAGE3_CLASSIFICATION feature flag is enabled.
   * Loads existing priorities from file_catalog and returns them without LLM calls.
   *
   * @see docs/tasks/REFACTOR-RAG-PRIORITY-BASED-RETRIEVAL.md
   */
  private async skipClassification(courseId: string, startTime: number): Promise<Stage3Output> {
    const supabase = getSupabaseAdmin();

    // Load documents with existing priorities
    const { data, error } = await supabase
      .from('file_catalog')
      .select('id, filename, priority')
      .eq('course_id', courseId);

    if (error) {
      logger.error({ error, courseId }, 'Failed to load documents for skip classification');
      throw new Error(`Failed to load documents: ${error.message}`);
    }

    const documents = data || [];

    // Validate: warn if documents are missing priority values
    const documentsWithoutPriority = documents.filter(doc => !doc.priority);
    if (documentsWithoutPriority.length > 0) {
      logger.warn(
        {
          courseId,
          documentCount: documents.length,
          missingPriorityCount: documentsWithoutPriority.length,
          affectedFileIds: documentsWithoutPriority.map(d => d.id),
        },
        'Documents missing priority values when Stage 3 classification skipped - defaulting to SUPPLEMENTARY'
      );
    }

    // Build classifications from existing priorities
    const classifications = documents.map(doc => ({
      fileId: doc.id,
      filename: doc.filename,
      priority: (doc.priority as DocumentPriorityLevel) ?? 'SUPPLEMENTARY',
      rationale: doc.priority
        ? 'Using existing priority (Stage 3 classification skipped)'
        : 'Using default SUPPLEMENTARY (no priority set, Stage 3 skipped)',
    }));

    // Count priority levels
    const coreCount = classifications.filter(c => c.priority === 'CORE').length;
    const importantCount = classifications.filter(c => c.priority === 'IMPORTANT').length;
    const supplementaryCount = classifications.filter(c => c.priority === 'SUPPLEMENTARY').length;

    const processingTimeMs = Date.now() - startTime;

    logger.info(
      {
        courseId,
        totalDocuments: documents.length,
        coreCount,
        importantCount,
        supplementaryCount,
        processingTimeMs,
        skipped: true,
      },
      'Stage 3 classification skipped - using existing priorities'
    );

    return {
      success: true,
      courseId,
      classifications,
      totalDocuments: documents.length,
      coreCount,
      importantCount,
      supplementaryCount,
      processingTimeMs,
    };
  }
}
