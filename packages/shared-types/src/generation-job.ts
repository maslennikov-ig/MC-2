/**
 * Stage 5 Generation Job Input Schemas
 * @module @megacampus/shared-types/generation-job
 *
 * Defines BullMQ job input schemas for course generation (Stage 5).
 * Handles both full analysis results (FR-001) and title-only scenarios (FR-003).
 */

import { z } from 'zod';
import { CourseStyleSchema } from './style-prompts';
// Import unified schemas from analysis-schemas (Single Source of Truth)
// AnalysisResultSchema and AnalysisResult are now defined in analysis-schemas.ts
// to avoid duplication and ensure consistency across Stage 4 and Stage 5
import { AnalysisResultSchema, type AnalysisResult } from './analysis-schemas';

// Re-export for backward compatibility
export { AnalysisResultSchema, type AnalysisResult };

// ============================================================================
// FRONTEND PARAMETERS (from courses table)
// ============================================================================

/**
 * Frontend Parameters Schema - User inputs from courses table
 *
 * IMPORTANT: course_title is the ONLY guaranteed field (FR-002)
 * All other fields are optional and may be null/undefined.
 *
 * Reference: specs/008-generation-generation-json/spec.md lines 95, 104
 */
export const FrontendParametersSchema = z.object({
  // Required
  course_title: z.string().min(1).describe('Course title (ONLY guaranteed field per spec)'),

  // Optional (may be null/undefined)
  language: z.string().optional().describe('Target language (defaults to contextual_language from Analyze)'),
  style: CourseStyleSchema.optional().describe('Content style (defaults to conversational)'),
  target_audience: z.string().optional().describe('Target audience description'),

  // Guidance parameters (NOT constraints per spec.md clarifications)
  desired_lessons_count: z.number().int().positive().optional()
    .describe('User preference for lesson count (guidance, not constraint)'),

  desired_modules_count: z.number().int().positive().optional()
    .describe('User preference for module/section count (guidance, not constraint)'),

  lesson_duration_minutes: z.number().int().min(3).max(45).optional()
    .describe('Target duration per lesson (defaults to 5 minutes)'),

  // Constraints (MUST be satisfied)
  learning_outcomes: z.array(z.string()).optional()
    .describe('User-specified learning outcomes (constraints, not guidance)'),
});

export type FrontendParameters = z.infer<typeof FrontendParametersSchema>;

// ============================================================================
// DOCUMENT SUMMARIES (for RAG context)
// ============================================================================

/**
 * Generation Document Summary Schema - For RAG context (FR-004)
 *
 * Provides context from uploaded documents to enrich lesson generation.
 * Retrieved from file_catalog table when vectorized_documents=true.
 *
 * Note: This is a simplified schema for generation. Stage 4 uses a more
 * detailed DocumentSummary with processing_method and summary_metadata.
 */
export const GenerationDocumentSummarySchema = z.object({
  file_id: z.string().uuid().describe('File UUID from file_catalog'),
  file_name: z.string().describe('Original filename for reference'),
  summary: z.string().describe('Summarized content from Stage 3'),
  key_topics: z.array(z.string()).describe('Extracted key topics/concepts'),
});

export type GenerationDocumentSummary = z.infer<typeof GenerationDocumentSummarySchema>;

// ============================================================================
// GENERATION JOB INPUT
// ============================================================================

/**
 * Generation Job Input Schema - Complete input for Stage 5 generation
 *
 * Combines analysis results, frontend parameters, and optional RAG context.
 *
 * Key handling rules:
 * - analysis_result: nullable (null for title-only scenario FR-003)
 * - frontend_parameters: always present (course_title guaranteed)
 * - vectorized_documents: defaults to false
 * - document_summaries: optional (only when vectorized_documents=true)
 *
 * Reference: specs/008-generation-generation-json/data-model.md lines 423-446
 */
export const GenerationJobInputSchema = z.object({
  // Course identification
  course_id: z.string().uuid().describe('Course UUID'),
  organization_id: z.string().uuid().describe('Organization UUID (for RLS)'),
  user_id: z.string().uuid().describe('User UUID (for audit trail)'),

  // Input data (FR-001, FR-002)
  analysis_result: AnalysisResultSchema.nullable()
    .describe('Results from Stage 4 analysis (nullable for title-only scenario)'),

  frontend_parameters: FrontendParametersSchema
    .describe('Parameters from courses table'),

  // Optional RAG context (FR-004)
  vectorized_documents: z.boolean().default(false)
    .describe('Whether to use RAG context from uploaded documents'),

  document_summaries: z.array(GenerationDocumentSummarySchema).optional()
    .describe('Document summaries from file_catalog (if vectorized)'),
});

export type GenerationJobInput = z.infer<typeof GenerationJobInputSchema>;

// ============================================================================
// BULLMQ JOB DATA
// ============================================================================

/**
 * Generation Job Data - BullMQ wrapper for job queue
 *
 * Standard BullMQ job structure with metadata for tracking and retry logic.
 *
 * Reference: specs/008-generation-generation-json/data-model.md lines 454-462
 */
export interface GenerationJobData {
  /** BullMQ job ID */
  jobId: string;

  /** Complete job input payload */
  input: GenerationJobInput;

  /** Job metadata for tracking */
  metadata: {
    /** Job creation timestamp (ISO 8601) */
    created_at: string;

    /** Tier-based priority (1=high, 3=low) */
    priority: number;

    /** Current attempt number (1-3) */
    attempt: number;
  };
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate generation job input
 * @param input - Raw input data to validate
 * @returns Validation result with parsed data or errors
 */
export function validateGenerationJobInput(input: unknown) {
  return GenerationJobInputSchema.safeParse(input);
}

/**
 * Validate frontend parameters
 * @param params - Raw frontend parameters to validate
 * @returns Validation result with parsed data or errors
 */
export function validateFrontendParameters(params: unknown) {
  return FrontendParametersSchema.safeParse(params);
}

/**
 * Validate analysis result
 * @param result - Raw analysis result to validate
 * @returns Validation result with parsed data or errors
 */
export function validateAnalysisResult(result: unknown) {
  return AnalysisResultSchema.safeParse(result);
}
