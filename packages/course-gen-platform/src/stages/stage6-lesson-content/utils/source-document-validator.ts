/**
 * Source Document Validation Utility
 *
 * Post-generation validation to ensure lesson content uses CORE documents appropriately.
 * This is critical for quality assurance - lessons should primarily use high-priority documents.
 *
 * @module stages/stage6-lesson-content/utils/source-document-validator
 * @see docs/tasks/REFACTOR-RAG-PRIORITY-BASED-RETRIEVAL.md
 */

import { logger } from '../../../shared/logger/index.js';
import type { SourceDocument } from './lesson-rag-retriever';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Validation result for source document usage
 */
export interface SourceDocumentValidationResult {
  /** Whether validation passed all checks */
  passed: boolean;

  /** Whether CORE document was used (required for pass) */
  coreDocumentUsed: boolean;

  /** Total source documents used */
  totalDocuments: number;

  /** Count by priority level */
  priorityCounts: {
    core: number;
    important: number;
    supplementary: number;
  };

  /** Percentage of chunks from CORE documents */
  coreChunkPercentage: number;

  /** Warnings (non-fatal issues) */
  warnings: string[];
}

/**
 * Validation options
 */
export interface ValidationOptions {
  /**
   * Require at least one CORE document
   * @default true
   */
  requireCoreDocument?: boolean;

  /**
   * Minimum percentage of chunks from CORE documents
   * @default 0 (no minimum)
   */
  minCoreChunkPercentage?: number;

  /**
   * Warn if SUPPLEMENTARY-only (no CORE or IMPORTANT)
   * @default true
   */
  warnOnSupplementaryOnly?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_OPTIONS: Required<ValidationOptions> = {
  requireCoreDocument: true,
  minCoreChunkPercentage: 0,
  warnOnSupplementaryOnly: true,
};

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Validate source document usage for a lesson
 *
 * Checks if the lesson content was generated using appropriate source documents.
 * Key validation: CORE documents should be used when available.
 *
 * @param sourceDocuments - Source documents from extractSourceDocuments()
 * @param options - Validation options
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = await retrieveLessonContext(params);
 * const sourceDocuments = extractSourceDocuments(result.chunks);
 * const validation = validateSourceDocuments(sourceDocuments);
 *
 * if (!validation.passed) {
 *   logger.warn({ validation }, 'Source document validation failed');
 * }
 * ```
 */
export function validateSourceDocuments(
  sourceDocuments: SourceDocument[],
  options: ValidationOptions = {}
): SourceDocumentValidationResult {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const warnings: string[] = [];

  // Count by priority
  const priorityCounts = {
    core: 0,
    important: 0,
    supplementary: 0,
  };

  let totalChunks = 0;
  let coreChunks = 0;

  for (const doc of sourceDocuments) {
    totalChunks += doc.chunk_count;

    switch (doc.document_priority) {
      case 'CORE':
        priorityCounts.core++;
        coreChunks += doc.chunk_count;
        break;
      case 'IMPORTANT':
        priorityCounts.important++;
        break;
      case 'SUPPLEMENTARY':
        priorityCounts.supplementary++;
        break;
    }
  }

  const coreDocumentUsed = priorityCounts.core > 0;
  const coreChunkPercentage = totalChunks > 0
    ? Math.round((coreChunks / totalChunks) * 100)
    : 0;

  // Check validation rules
  let passed = true;

  // Rule 1: Require CORE document
  if (config.requireCoreDocument && !coreDocumentUsed) {
    passed = false;
    warnings.push('No CORE document was used in lesson generation');
  }

  // Rule 2: Minimum CORE chunk percentage
  if (config.minCoreChunkPercentage > 0 && coreChunkPercentage < config.minCoreChunkPercentage) {
    passed = false;
    warnings.push(
      `CORE chunk percentage (${coreChunkPercentage}%) is below minimum (${config.minCoreChunkPercentage}%)`
    );
  }

  // Rule 3: Warn on SUPPLEMENTARY-only
  if (
    config.warnOnSupplementaryOnly &&
    priorityCounts.core === 0 &&
    priorityCounts.important === 0 &&
    priorityCounts.supplementary > 0
  ) {
    warnings.push('Lesson uses only SUPPLEMENTARY documents (no CORE or IMPORTANT)');
  }

  // Log validation result
  if (passed) {
    logger.debug({
      totalDocuments: sourceDocuments.length,
      priorityCounts,
      coreChunkPercentage,
    }, 'Source document validation passed');
  } else {
    logger.warn({
      totalDocuments: sourceDocuments.length,
      priorityCounts,
      coreChunkPercentage,
      warnings,
    }, 'Source document validation FAILED');
  }

  return {
    passed,
    coreDocumentUsed,
    totalDocuments: sourceDocuments.length,
    priorityCounts,
    coreChunkPercentage,
    warnings,
  };
}

/**
 * Check if any CORE document exists for a course in the retrieved chunks
 *
 * Utility function to quickly check if CORE documents were available.
 * Useful for debugging when lessons don't use expected documents.
 *
 * @param sourceDocuments - Source documents from extractSourceDocuments()
 * @returns true if at least one CORE document was used
 */
export function hasCoreDocument(sourceDocuments: SourceDocument[]): boolean {
  return sourceDocuments.some((doc) => doc.document_priority === 'CORE');
}

/**
 * Get summary statistics for source documents
 *
 * Useful for logging and metrics.
 *
 * @param sourceDocuments - Source documents from extractSourceDocuments()
 * @returns Summary statistics
 */
export function getSourceDocumentStats(sourceDocuments: SourceDocument[]): {
  totalDocuments: number;
  totalChunks: number;
  coreDocuments: number;
  importantDocuments: number;
  supplementaryDocuments: number;
} {
  let totalChunks = 0;
  let coreDocuments = 0;
  let importantDocuments = 0;
  let supplementaryDocuments = 0;

  for (const doc of sourceDocuments) {
    totalChunks += doc.chunk_count;

    switch (doc.document_priority) {
      case 'CORE':
        coreDocuments++;
        break;
      case 'IMPORTANT':
        importantDocuments++;
        break;
      case 'SUPPLEMENTARY':
        supplementaryDocuments++;
        break;
    }
  }

  return {
    totalDocuments: sourceDocuments.length,
    totalChunks,
    coreDocuments,
    importantDocuments,
    supplementaryDocuments,
  };
}
