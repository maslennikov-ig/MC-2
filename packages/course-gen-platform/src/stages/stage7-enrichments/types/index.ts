/**
 * Stage 7 Enrichments Job Types
 * @module stages/stage7-enrichments/types
 *
 * TypeScript types for Stage 7 BullMQ job input, output, and progress updates.
 * Handles enrichment generation (quiz, audio, presentation, video, document).
 */

import type {
  EnrichmentType,
  EnrichmentStatus,
  EnrichmentContent,
  EnrichmentMetadata,
} from '@megacampus/shared-types';

/**
 * Stage 7 job input structure
 * Contains enrichment specification and context for generation
 */
export interface Stage7JobInput {
  /** Enrichment UUID from database */
  enrichmentId: string;

  /** Type of enrichment to generate */
  enrichmentType: EnrichmentType;

  /** Parent lesson UUID */
  lessonId: string;

  /** Parent course UUID */
  courseId: string;

  /** User UUID who initiated the generation */
  userId: string;

  /** Organization UUID for billing/tracking */
  organizationId: string;

  /** Optional type-specific generation settings */
  settings?: Record<string, unknown>;

  /** Current retry attempt number (0-based) */
  retryAttempt?: number;

  /** Whether this is a draft phase generation (two-stage types) */
  isDraftPhase?: boolean;
}

/**
 * Stage 7 job result structure
 * Returned after job completion (success or failure)
 */
export interface Stage7JobResult {
  /** Enrichment UUID */
  enrichmentId: string;

  /** Success flag */
  success: boolean;

  /** Final status of the enrichment */
  status: EnrichmentStatus;

  /** Supabase Storage asset UUID (for audio/video) */
  assetId?: string;

  /** Generated content (for quiz/presentation) */
  content?: EnrichmentContent;

  /** Error message on failure */
  error?: string;

  /** Generation metrics */
  metrics: {
    /** Total duration in milliseconds */
    durationMs: number;

    /** Tokens used (for LLM-based enrichments) */
    tokensUsed?: number;

    /** Estimated cost in USD */
    costUsd?: number;

    /** Model used for generation */
    modelUsed?: string;

    /** Quality score from validation (0-1) */
    qualityScore?: number;
  };
}

/**
 * Progress update structure for streaming
 * Sent via job.updateProgress() during processing
 */
export interface Stage7ProgressUpdate {
  /** Current processing phase */
  phase:
    | 'init'
    | 'fetching_context'
    | 'generating'
    | 'draft_ready'
    | 'uploading'
    | 'validating'
    | 'complete'
    | 'error';

  /** Progress percentage (0-100) */
  progress: number;

  /** Human-readable status message */
  message?: string;

  /** Current step details */
  details?: {
    /** Current step within phase */
    step?: string;

    /** Items processed so far */
    itemsProcessed?: number;

    /** Total items to process */
    totalItems?: number;
  };
}

/**
 * Enrichment with lesson context for generation
 */
export interface EnrichmentWithContext {
  /** Enrichment record from database */
  enrichment: {
    id: string;
    lesson_id: string;
    course_id: string;
    enrichment_type: EnrichmentType;
    status: EnrichmentStatus;
    order_index: number;
    title: string | null;
    content: EnrichmentContent | null;
    metadata: EnrichmentMetadata | null;
    settings: Record<string, unknown> | null;
    generation_attempt: number;
    error_message: string | null;
    error_details: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
  };

  /** Parent lesson data */
  lesson: {
    id: string;
    title: string;
    content: string | null;
    course_id: string;
  };

  /** Parent course data */
  course: {
    id: string;
    title: string;
    language: string;
    /** Course description for context */
    course_description?: string | null;
    /** Visual style for consistent imagery */
    visual_style?: Record<string, unknown> | null;
    /** Legacy settings (may contain visual_style) */
    settings?: Record<string, unknown> | null;
  };
}

/**
 * Handler input for enrichment generation
 */
export interface EnrichmentHandlerInput {
  /** Enrichment with full context */
  enrichmentContext: EnrichmentWithContext;

  /** Type-specific settings */
  settings: Record<string, unknown>;

  /** Signal for cancellation checking */
  signal?: AbortSignal;
}

/**
 * Draft result for two-stage enrichments (presentation, video)
 */
export interface DraftResult {
  /** Draft content (e.g., presentation outline, video script) */
  draftContent: unknown;

  /** Draft metadata */
  metadata: {
    /** Generation duration in milliseconds */
    durationMs: number;

    /** Tokens used */
    tokensUsed?: number;

    /** Model used */
    modelUsed?: string;
  };
}

/**
 * Final generation result from enrichment handler
 */
export interface GenerateResult {
  /** Generated content */
  content: EnrichmentContent;

  /** Asset buffer (for audio/video) */
  assetBuffer?: Buffer;

  /** Asset MIME type */
  assetMimeType?: string;

  /** Asset file extension */
  assetExtension?: string;

  /** Generation metadata */
  metadata: EnrichmentMetadata;
}

/**
 * Model configuration for enrichment generation
 */
export interface ModelConfig {
  /** Primary model to use */
  primary: string;

  /** Fallback model if primary fails */
  fallback: string;
}
