/**
 * Types, schemas, and constants for document classification
 * @module stages/stage3-classification/phases/classification-types
 *
 * Extracted from phase-classification.ts to comply with max-lines rule.
 */

import { z } from 'zod';
import { DocumentPriorityLevelSchema } from '@megacampus/shared-types';

// ============================================================================
// LLM Response Schema
// ============================================================================

/**
 * Schema for LLM classification response (per document)
 */
export const ClassificationResponseSchema = z.object({
  importance_score: z
    .number()
    .min(0.0)
    .max(1.0)
    .describe('Importance score from 0.0 to 1.0. HIGH threshold: >= 0.7'),
  classification_rationale: z
    .string()
    .min(10)
    .describe('Reasoning for the classification decision'),
});

export type ClassificationResponse = z.infer<typeof ClassificationResponseSchema>;

/**
 * Schema for single document in comparative classification
 */
export const ComparativeDocumentClassificationSchema = z.object({
  id: z.string().uuid().describe('Document UUID from database'),
  priority: DocumentPriorityLevelSchema.describe(
    'Priority level: CORE (exactly 1), IMPORTANT (up to 30%), or SUPPLEMENTARY (remaining)'
  ),
  rationale: z
    .string()
    .min(10)
    .describe('Brief explanation of why this document received this priority level'),
});

/**
 * Schema for comparative classification response from LLM
 */
export const ComparativeClassificationResponseSchema = z.object({
  classifications: z
    .array(ComparativeDocumentClassificationSchema)
    .min(1)
    .describe('Classification results for all documents'),
});

export type ComparativeClassificationResponse = z.infer<
  typeof ComparativeClassificationResponseSchema
>;

// ============================================================================
// Input Types
// ============================================================================

/**
 * File metadata for classification
 */
export interface FileMetadata {
  id: string;
  filename: string;
  /** AI-generated meaningful title from Phase 6 summarization */
  generated_title: string | null;
  /** User-provided original filename at upload */
  original_name: string | null;
  mime_type: string;
  file_size: number;
  content_preview: string;
  summary_tokens: number;
}

/**
 * Input for document classification phase
 */
export interface ClassificationInput {
  courseId: string;
  fileIds: string[];
  organizationId: string;
  courseTitle?: string;
  courseDescription?: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Classification input token budget
 * If all document summaries exceed this budget, use two-stage tournament classification
 */
export const CLASSIFICATION_INPUT_BUDGET = 100_000; // tokens

/**
 * Redis cache configuration for document classification
 */
/** TTL for document classification cache. Override via DOC_CLASS_CACHE_TTL env var. */
export const DOC_CLASS_CACHE_TTL = parseInt(
  process.env.DOC_CLASS_CACHE_TTL || String(86400 * 7),
  10
); // default: 7 days
export const DOC_CLASS_CACHE_PREFIX = 'doc_class';
export const DOC_CLASS_CACHE_VERSION = 'v1';
