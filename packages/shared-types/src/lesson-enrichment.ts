/**
 * Stage 7 Lesson Enrichment Types
 * @module @megacampus/shared-types/lesson-enrichment
 *
 * Defines main enrichment entity types that mirror the database schema
 * but with typed content fields using discriminated unions.
 *
 * Reference:
 * - specs/022-lesson-enrichments/contracts/enrichment-router.ts
 * - Database table: lesson_enrichments
 */

import { z } from 'zod';
import {
  enrichmentContentSchema,
  enrichmentMetadataSchema,
} from './enrichment-content';

// ============================================================================
// ENUMS (From Database)
// ============================================================================

/**
 * Enrichment type enum (mirrors database enum)
 */
export const enrichmentTypeSchema = z.enum([
  'video',
  'audio',
  'presentation',
  'quiz',
  'document',
  'cover',
]);

export type EnrichmentType = z.infer<typeof enrichmentTypeSchema>;

/**
 * Enrichment status enum (mirrors database enum with two-stage support)
 *
 * State machine:
 * - Single-stage (audio, quiz):
 *   pending -> generating -> completed/failed
 *
 * - Two-stage (video, presentation):
 *   pending -> draft_generating -> draft_ready -> generating -> completed/failed
 *
 * Reference: research.md section 11
 */
export const enrichmentStatusSchema = z.enum([
  'pending',           // Queued for generation
  'draft_generating',  // Phase 1: Generating draft/script (two-stage only)
  'draft_ready',       // Phase 1 complete: Awaiting user review (two-stage only)
  'generating',        // Phase 2: Final content (or single-stage generation)
  'completed',         // Successfully generated
  'failed',            // Generation failed
  'cancelled',         // User cancelled
]);

export type EnrichmentStatus = z.infer<typeof enrichmentStatusSchema>;

// ============================================================================
// LESSON ENRICHMENT (Base Schema)
// ============================================================================

/**
 * Lesson enrichment base schema (mirrors database table)
 *
 * This schema represents the complete enrichment record stored in the
 * `lesson_enrichments` table with typed JSONB fields.
 */
export const lessonEnrichmentBaseSchema = z.object({
  /** Unique enrichment identifier */
  id: z.string().uuid(),

  /** Parent lesson UUID */
  lesson_id: z.string().uuid(),

  /** Parent course UUID (denormalized for efficient queries) */
  course_id: z.string().uuid(),

  /** Enrichment type */
  enrichment_type: enrichmentTypeSchema,

  /** Display order within lesson (1-based) */
  order_index: z.number().int().positive(),

  /** Optional custom title (auto-generated if null) */
  title: z.string().nullable(),

  /** Enrichment-specific content (discriminated union by type) */
  content: enrichmentContentSchema,

  /** Supabase Storage asset UUID (for audio/video files) */
  asset_id: z.string().uuid().nullable(),

  /** Current status of enrichment generation */
  status: enrichmentStatusSchema,

  /** Number of generation attempts (incremented on retry) */
  generation_attempt: z.number().int().nonnegative().default(0),

  /** Error message if status is 'failed' */
  error_message: z.string().nullable(),

  /** Detailed error information (stack trace, context) */
  error_details: z.record(z.unknown()).nullable(),

  /** Generation metadata (costs, tokens, quality scores) */
  metadata: enrichmentMetadataSchema,

  /** Creation timestamp */
  created_at: z.string().datetime(),

  /** Last update timestamp */
  updated_at: z.string().datetime(),

  /** Generation completion timestamp (null until completed) */
  generated_at: z.string().datetime().nullable(),
});

export type LessonEnrichmentBase = z.infer<typeof lessonEnrichmentBaseSchema>;

// ============================================================================
// ENRICHMENT SUMMARY (For React Flow Nodes)
// ============================================================================

/**
 * Lightweight enrichment summary for React Flow node display
 *
 * Used in graph visualization to show enrichment status without
 * loading full content data.
 */
export const enrichmentSummarySchema = z.object({
  /** Enrichment type */
  type: enrichmentTypeSchema,

  /** Current status */
  status: enrichmentStatusSchema,

  /** Whether enrichment has an error */
  hasError: z.boolean(),

  /** Optional custom title */
  title: z.string().optional(),
});

export type EnrichmentSummary = z.infer<typeof enrichmentSummarySchema>;

// ============================================================================
// ENRICHMENT WITH PLAYBACK URL (For Media Preview)
// ============================================================================

/**
 * Enrichment with signed playback URL for media types
 *
 * Used in preview components to display audio/video content.
 */
export const enrichmentWithPlaybackUrlSchema = lessonEnrichmentBaseSchema.extend({
  /** Signed Supabase Storage URL (expires in 1 hour) */
  playback_url: z.string().url().nullable(),

  /** Playback URL expiration timestamp */
  playback_url_expires_at: z.string().datetime().nullable(),
});

export type EnrichmentWithPlaybackUrl = z.infer<
  typeof enrichmentWithPlaybackUrlSchema
>;

// ============================================================================
// ENRICHMENT CREATE INPUT (For tRPC/BullMQ)
// ============================================================================

/**
 * Input data for creating a new enrichment
 *
 * Used in tRPC procedures and BullMQ job payloads.
 */
export const createEnrichmentInputSchema = z.object({
  /** Target lesson UUID */
  lessonId: z.string().uuid(),

  /** Enrichment type to create */
  enrichmentType: enrichmentTypeSchema,

  /** Optional settings for generation (type-specific) */
  settings: z.record(z.unknown()).optional(),

  /** Optional custom title */
  title: z.string().optional(),
});

export type CreateEnrichmentInput = z.infer<typeof createEnrichmentInputSchema>;

// ============================================================================
// BATCH ENRICHMENT INPUT (For Bulk Operations)
// ============================================================================

/**
 * Input data for creating enrichments for multiple lessons
 *
 * Used in "Generate for all lessons" batch operations.
 */
export const createBatchEnrichmentInputSchema = z.object({
  /** Target lesson UUIDs */
  lessonIds: z.array(z.string().uuid()).min(1).max(100),

  /** Enrichment type to create */
  enrichmentType: enrichmentTypeSchema,

  /** Optional settings for generation (type-specific) */
  settings: z.record(z.unknown()).optional(),
});

export type CreateBatchEnrichmentInput = z.infer<
  typeof createBatchEnrichmentInputSchema
>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate lesson enrichment data
 * @param data - Raw data to validate
 * @returns Validation result with parsed data or errors
 */
export function validateLessonEnrichment(data: unknown) {
  return lessonEnrichmentBaseSchema.safeParse(data);
}

/**
 * Validate enrichment summary data
 * @param data - Raw summary data to validate
 * @returns Validation result with parsed data or errors
 */
export function validateEnrichmentSummary(data: unknown) {
  return enrichmentSummarySchema.safeParse(data);
}

/**
 * Type guard for LessonEnrichmentBase
 * @param value - Value to check
 * @returns True if value is a valid LessonEnrichmentBase
 */
export function isLessonEnrichment(value: unknown): value is LessonEnrichmentBase {
  return lessonEnrichmentBaseSchema.safeParse(value).success;
}

/**
 * Type guard for EnrichmentSummary
 * @param value - Value to check
 * @returns True if value is a valid EnrichmentSummary
 */
export function isEnrichmentSummary(value: unknown): value is EnrichmentSummary {
  return enrichmentSummarySchema.safeParse(value).success;
}

/**
 * Check if enrichment requires an asset file (audio/video/cover)
 * @param type - Enrichment type
 * @returns True if type requires Supabase Storage asset
 */
export function requiresAsset(type: EnrichmentType): boolean {
  return type === 'audio' || type === 'video' || type === 'cover';
}

/**
 * Check if enrichment uses two-stage generation flow
 * @param type - Enrichment type
 * @returns True if type uses draft -> final flow
 */
export function isTwoStageType(type: EnrichmentType): boolean {
  return type === 'video' || type === 'presentation';
}

/**
 * Get default title for enrichment type
 * @param type - Enrichment type
 * @param locale - Language code (en/ru)
 * @returns Default title string
 */
export function getDefaultEnrichmentTitle(
  type: EnrichmentType,
  locale: 'en' | 'ru' = 'en'
): string {
  const titles: Record<EnrichmentType, Record<'en' | 'ru', string>> = {
    video: { en: 'Video Lecture', ru: 'Видео-лекция' },
    audio: { en: 'Audio Narration', ru: 'Аудио-озвучка' },
    presentation: { en: 'Presentation Slides', ru: 'Презентация' },
    quiz: { en: 'Knowledge Check Quiz', ru: 'Проверочный тест' },
    document: { en: 'Downloadable Document', ru: 'Документ для скачивания' },
    cover: { en: 'Lesson Cover', ru: 'Обложка урока' },
  };

  return titles[type][locale];
}
