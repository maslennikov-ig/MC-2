/**
 * Stage 7 Lesson Enrichment Content Schemas
 * @module @megacampus/shared-types/enrichment-content
 *
 * Defines Zod schemas and TypeScript types for enrichment-specific content
 * stored in the `content` JSONB column of `lesson_enrichments` table.
 *
 * Content types are discriminated by the `type` field to enable type-safe
 * handling of different enrichment formats.
 *
 * Reference:
 * - specs/022-lesson-enrichments/research.md (sections 3-4)
 * - specs/022-lesson-enrichments/contracts/enrichment-router.ts
 */

import { z } from 'zod';

// ============================================================================
// BLOOM'S TAXONOMY LEVELS
// ============================================================================

/**
 * Bloom's Taxonomy cognitive levels for quiz questions
 *
 * Used to ensure pedagogical alignment and comprehensive skill coverage:
 * - remember: Recall facts and basic concepts
 * - understand: Explain ideas or concepts
 * - apply: Use information in new situations
 * - analyze: Draw connections among ideas
 */
export const bloomLevelSchema = z.enum([
  'remember',
  'understand',
  'apply',
  'analyze',
]);

export type BloomLevel = z.infer<typeof bloomLevelSchema>;

// ============================================================================
// DIFFICULTY LEVELS
// ============================================================================

/**
 * Difficulty level for quiz questions and exercises
 *
 * Note: This is distinct from course-level difficulty (beginner/intermediate/advanced)
 * defined in common-enums.ts. This is specifically for individual quiz questions.
 */
export const questionDifficultySchema = z.enum(['easy', 'medium', 'hard']);

export type QuestionDifficulty = z.infer<typeof questionDifficultySchema>;

// ============================================================================
// QUIZ ENRICHMENT CONTENT
// ============================================================================

/**
 * Question types supported in quiz enrichments
 */
export const quizQuestionTypeSchema = z.enum([
  'multiple_choice',
  'true_false',
  'short_answer',
]);

export type QuizQuestionType = z.infer<typeof quizQuestionTypeSchema>;

/**
 * Multiple choice option
 */
export const quizOptionSchema = z.object({
  /** Unique option identifier */
  id: z.string(),

  /** Option text */
  text: z.string().min(1),
});

export type QuizOption = z.infer<typeof quizOptionSchema>;

/**
 * Individual quiz question
 */
export const quizQuestionSchema = z.object({
  /** Unique question identifier */
  id: z.string(),

  /** Question type */
  type: quizQuestionTypeSchema,

  /** Bloom's taxonomy level */
  bloom_level: bloomLevelSchema,

  /** Question difficulty */
  difficulty: questionDifficultySchema,

  /** Question text */
  question: z.string().min(10),

  /** Multiple choice options (required for multiple_choice type) */
  options: z.array(quizOptionSchema).optional(),

  /** Correct answer (string for MC/short answer, boolean for true/false) */
  correct_answer: z.union([z.string(), z.boolean(), z.number()]),

  /** Explanation of the correct answer */
  explanation: z.string().min(10),

  /** Point value for this question */
  points: z.number().int().positive(),
});

export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

/**
 * Quiz metadata for analytics and display
 */
export const quizMetadataSchema = z.object({
  /** Total points available in the quiz */
  total_points: z.number().int().nonnegative(),

  /** Estimated completion time in minutes */
  estimated_minutes: z.number().int().positive(),

  /** Distribution of Bloom's levels (level -> question count) */
  bloom_coverage: z.record(bloomLevelSchema, z.number().int().nonnegative()),
});

export type QuizMetadata = z.infer<typeof quizMetadataSchema>;

/**
 * Quiz enrichment content structure
 *
 * QTI-aligned format for future LMS export compatibility.
 * Reference: research.md section 4
 */
export const quizEnrichmentContentSchema = z.object({
  /** Content type discriminator */
  type: z.literal('quiz'),

  /** Quiz title */
  quiz_title: z.string().min(3).max(200),

  /** Instructions for students */
  instructions: z.string().min(10),

  /** Quiz questions array */
  questions: z.array(quizQuestionSchema).min(1).max(50),

  /** Passing score percentage (0-100) */
  passing_score: z.number().int().min(0).max(100),

  /** Optional time limit in minutes */
  time_limit_minutes: z.number().int().positive().optional(),

  /** Whether to shuffle question order */
  shuffle_questions: z.boolean().default(false),

  /** Whether to shuffle option order (for multiple choice) */
  shuffle_options: z.boolean().default(false),

  /** Quiz metadata */
  metadata: quizMetadataSchema,
});

export type QuizEnrichmentContent = z.infer<typeof quizEnrichmentContentSchema>;

// ============================================================================
// PRESENTATION ENRICHMENT CONTENT
// ============================================================================

/**
 * Presentation theme options
 */
export const presentationThemeSchema = z.enum(['default', 'dark', 'academic']);

export type PresentationTheme = z.infer<typeof presentationThemeSchema>;

/**
 * Slide layout types
 */
export const slideLayoutSchema = z.enum([
  'title',
  'content',
  'two-column',
  'image',
]);

export type SlideLayout = z.infer<typeof slideLayoutSchema>;

/**
 * Individual presentation slide
 */
export const presentationSlideSchema = z.object({
  /** Slide index (0-based) */
  index: z.number().int().nonnegative(),

  /** Slide title */
  title: z.string().min(1).max(200),

  /** Slide content in Markdown format */
  content: z.string().min(1),

  /** Slide layout type */
  layout: slideLayoutSchema,

  /** Optional speaker notes */
  speaker_notes: z.string().optional(),

  /** Optional visual suggestion (for image layout) */
  visual_suggestion: z.string().optional(),
});

export type PresentationSlide = z.infer<typeof presentationSlideSchema>;

/**
 * Presentation enrichment content structure
 *
 * Stored as reveal.js-compatible JSON format.
 * Reference: research.md section 3
 */
export const presentationEnrichmentContentSchema = z.object({
  /** Content type discriminator */
  type: z.literal('presentation'),

  /** Presentation theme */
  theme: presentationThemeSchema,

  /** Presentation slides array */
  slides: z.array(presentationSlideSchema).min(1).max(100),

  /** Total number of slides */
  total_slides: z.number().int().positive(),
});

export type PresentationEnrichmentContent = z.infer<
  typeof presentationEnrichmentContentSchema
>;

// ============================================================================
// AUDIO ENRICHMENT CONTENT
// ============================================================================

/**
 * Audio enrichment content structure
 *
 * References OpenAI TTS API for generation.
 * Reference: research.md section 1
 */
export const audioEnrichmentContentSchema = z.object({
  /** Content type discriminator */
  type: z.literal('audio'),

  /** OpenAI voice ID used for generation */
  voice_id: z.string(),

  /** Text script that was narrated */
  script: z.string().min(10),

  /** Duration in seconds */
  duration_seconds: z.number().positive(),

  /** Optional audio format (mp3, opus, aac, flac, wav) */
  format: z.enum(['mp3', 'opus', 'aac', 'flac', 'wav']).optional(),
});

export type AudioEnrichmentContent = z.infer<typeof audioEnrichmentContentSchema>;

// ============================================================================
// VIDEO ENRICHMENT CONTENT (Stub for Future)
// ============================================================================

/**
 * Slide synchronization point for video
 */
export const videoSlideSyncPointSchema = z.object({
  /** Timestamp in seconds where slide appears */
  timestamp_seconds: z.number().nonnegative(),

  /** Slide index to display */
  slide_index: z.number().int().nonnegative(),
});

export type VideoSlideSyncPoint = z.infer<typeof videoSlideSyncPointSchema>;

/**
 * Video enrichment content structure
 *
 * Stub implementation - stores script for future video generation.
 * Reference: research.md section 2
 */
export const videoEnrichmentContentSchema = z.object({
  /** Content type discriminator */
  type: z.literal('video'),

  /** Video script text */
  script: z.string().min(10),

  /** Optional avatar ID for video generation */
  avatar_id: z.string().optional(),

  /** Optional slide synchronization points */
  slides_sync_points: z.array(videoSlideSyncPointSchema).optional(),

  /** Optional video duration estimate in seconds */
  estimated_duration_seconds: z.number().positive().optional(),
});

export type VideoEnrichmentContent = z.infer<typeof videoEnrichmentContentSchema>;

// ============================================================================
// DOCUMENT ENRICHMENT CONTENT (Placeholder)
// ============================================================================

/**
 * Document enrichment content structure
 *
 * Placeholder for future document generation (PDF, DOCX, etc.).
 */
export const documentEnrichmentContentSchema = z.object({
  /** Content type discriminator */
  type: z.literal('document'),

  /** Generated document filename */
  file_name: z.string(),

  /** Supabase Storage URL for the document */
  file_url: z.string().url(),

  /** Optional document format */
  format: z.enum(['pdf', 'docx', 'html']).optional(),
});

export type DocumentEnrichmentContent = z.infer<
  typeof documentEnrichmentContentSchema
>;

// ============================================================================
// COVER ENRICHMENT CONTENT (Lesson Hero Image)
// ============================================================================

/**
 * Cover enrichment content structure
 *
 * Stores generated lesson cover/hero image metadata and URL.
 * Image generated via OpenRouter (bytedance-seed/seedream-4.5).
 * Displayed as hero banner at the top of lesson content.
 */
export const coverEnrichmentContentSchema = z.object({
  /** Content type discriminator */
  type: z.literal('cover'),

  /** Generated image URL (Supabase Storage public URL) */
  image_url: z.string().url(),

  /** Image width in pixels */
  width: z.number().int().positive().default(1280),

  /** Image height in pixels */
  height: z.number().int().positive().default(720),

  /** Aspect ratio string (e.g., "16:9") */
  aspect_ratio: z.string().default('16:9'),

  /** The prompt used for image generation (stored for regeneration/debugging) */
  generation_prompt: z.string(),

  /** Optional alt text for accessibility */
  alt_text: z.string().optional(),

  /** Image format */
  format: z.enum(['png', 'jpeg', 'webp']).default('png'),

  /** File size in bytes (optional) */
  file_size_bytes: z.number().int().positive().optional(),
});

export type CoverEnrichmentContent = z.infer<typeof coverEnrichmentContentSchema>;

// ============================================================================
// DISCRIMINATED UNION OF ALL CONTENT TYPES
// ============================================================================

/**
 * Discriminated union of all enrichment content types
 *
 * Enables type-safe handling based on the `type` discriminator field.
 * This is stored in the `content` JSONB column of `lesson_enrichments` table.
 */
export const enrichmentContentSchema = z.discriminatedUnion('type', [
  quizEnrichmentContentSchema,
  presentationEnrichmentContentSchema,
  audioEnrichmentContentSchema,
  videoEnrichmentContentSchema,
  documentEnrichmentContentSchema,
  coverEnrichmentContentSchema,
]);

export type EnrichmentContent = z.infer<typeof enrichmentContentSchema>;

// ============================================================================
// GENERATION METADATA
// ============================================================================

/**
 * Metadata for enrichment generation
 *
 * Tracks generation metrics, costs, and quality scores.
 * Stored in the `metadata` JSONB column of `lesson_enrichments` table.
 */
export const enrichmentMetadataSchema = z.object({
  /** Generation timestamp */
  generated_at: z.string().datetime(),

  /** Generation duration in milliseconds */
  generation_duration_ms: z.number().int().nonnegative(),

  /** Input tokens used (for LLM-based enrichments) */
  input_tokens: z.number().int().nonnegative().optional(),

  /** Output tokens generated (for LLM-based enrichments) */
  output_tokens: z.number().int().nonnegative().optional(),

  /** Total tokens (input + output) */
  total_tokens: z.number().int().nonnegative().optional(),

  /** Estimated cost in USD */
  estimated_cost_usd: z.number().nonnegative(),

  /** Model used for generation */
  model_used: z.string().optional(),

  /** Quality score (0.0-1.0 scale) */
  quality_score: z.number().min(0).max(1).optional(),

  /** Number of retry attempts before success */
  retry_attempts: z.number().int().nonnegative().default(0),

  /** Optional additional metadata */
  additional_info: z.record(z.unknown()).optional(),
});

export type EnrichmentMetadata = z.infer<typeof enrichmentMetadataSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate enrichment content data
 * @param data - Raw data to validate
 * @returns Validation result with parsed data or errors
 */
export function validateEnrichmentContent(data: unknown) {
  return enrichmentContentSchema.safeParse(data);
}

/**
 * Validate enrichment metadata
 * @param data - Raw metadata to validate
 * @returns Validation result with parsed data or errors
 */
export function validateEnrichmentMetadata(data: unknown) {
  return enrichmentMetadataSchema.safeParse(data);
}

/**
 * Type guard for EnrichmentContent
 * @param value - Value to check
 * @returns True if value is valid EnrichmentContent
 */
export function isEnrichmentContent(value: unknown): value is EnrichmentContent {
  return enrichmentContentSchema.safeParse(value).success;
}

/**
 * Type guard for specific enrichment content type
 * @param content - Content to check
 * @param type - Expected type
 * @returns True if content matches the specified type
 */
export function isEnrichmentContentType<T extends EnrichmentContent['type']>(
  content: unknown,
  type: T
): content is Extract<EnrichmentContent, { type: T }> {
  const parsed = enrichmentContentSchema.safeParse(content);
  return parsed.success && parsed.data.type === type;
}
