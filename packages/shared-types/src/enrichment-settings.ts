/**
 * Stage 7 Lesson Enrichment Settings Schemas
 * @module @megacampus/shared-types/enrichment-settings
 *
 * Defines Zod schemas for type-specific generation settings.
 * These settings control the generation parameters for each enrichment type.
 *
 * Reference:
 * - specs/022-lesson-enrichments/research.md (sections 1-4)
 * - specs/022-lesson-enrichments/contracts/enrichment-router.ts
 */

import { z } from 'zod';
import {
  bloomLevelSchema,
  questionDifficultySchema,
  presentationThemeSchema,
} from './enrichment-content';

// ============================================================================
// AUDIO SETTINGS
// ============================================================================

/**
 * OpenAI TTS voice options
 *
 * Reference: research.md section 1 - OpenAI TTS API
 */
export const openAiVoiceSchema = z.enum([
  'alloy',
  'echo',
  'fable',
  'onyx',
  'nova',
  'shimmer',
]);

export type OpenAiVoice = z.infer<typeof openAiVoiceSchema>;

/**
 * Audio enrichment generation settings
 *
 * Controls OpenAI TTS API parameters for audio narration.
 */
export const audioSettingsSchema = z.object({
  /** OpenAI voice ID (default: 'nova' - good for educational content) */
  voice_id: openAiVoiceSchema.default('nova'),

  /** Speech speed multiplier (0.25-4.0, default: 1.0) */
  speed: z.number().min(0.25).max(4.0).default(1.0),

  /** Audio format (default: mp3) */
  response_format: z.enum(['mp3', 'opus', 'aac', 'flac', 'wav']).default('mp3'),

  /** Optional TTS model override (default: tts-1-hd) */
  model: z.enum(['tts-1', 'tts-1-hd']).default('tts-1-hd'),
});

export type AudioSettings = z.infer<typeof audioSettingsSchema>;

// ============================================================================
// QUIZ SETTINGS
// ============================================================================

/**
 * Quiz enrichment generation settings
 *
 * Controls quiz question generation parameters.
 */
export const quizSettingsSchema = z.object({
  /** Number of questions to generate (3-20) */
  question_count: z.number().int().min(3).max(20).default(5),

  /** Difficulty distribution (optional, auto-balanced if not specified) */
  difficulty_mix: z
    .array(questionDifficultySchema)
    .min(1)
    .max(20)
    .optional(),

  /** Include explanations for answers */
  include_explanations: z.boolean().default(true),

  /** Bloom's taxonomy level distribution (optional) */
  bloom_mix: z
    .array(bloomLevelSchema)
    .min(1)
    .max(20)
    .optional(),

  /** Question types to include */
  question_types: z
    .array(z.enum(['multiple_choice', 'true_false', 'short_answer']))
    .min(1)
    .default(['multiple_choice', 'true_false']),

  /** Passing score percentage (default: 70%) */
  passing_score: z.number().int().min(0).max(100).default(70),

  /** Optional time limit in minutes */
  time_limit_minutes: z.number().int().positive().optional(),

  /** Shuffle questions in quiz */
  shuffle_questions: z.boolean().default(true),

  /** Shuffle options in multiple choice questions */
  shuffle_options: z.boolean().default(true),
});

export type QuizSettings = z.infer<typeof quizSettingsSchema>;

// ============================================================================
// PRESENTATION SETTINGS
// ============================================================================

/**
 * Presentation enrichment generation settings
 *
 * Controls slide generation parameters.
 */
export const presentationSettingsSchema = z.object({
  /** Presentation theme (default: 'default') */
  theme: presentationThemeSchema.default('default'),

  /** Maximum number of slides to generate (3-30) */
  max_slides: z.number().int().min(3).max(30).default(10),

  /** Include speaker notes for each slide */
  include_speaker_notes: z.boolean().default(true),

  /** Include visual suggestions for image layout slides */
  include_visual_suggestions: z.boolean().default(false),

  /** Slide layout preference (optional, auto-selected if not specified) */
  preferred_layouts: z
    .array(z.enum(['title', 'content', 'two-column', 'image']))
    .optional(),

  /** Target words per slide (for content density control) */
  words_per_slide: z.number().int().min(20).max(200).default(50),
});

export type PresentationSettings = z.infer<typeof presentationSettingsSchema>;

// ============================================================================
// VIDEO SETTINGS (Stub for Future)
// ============================================================================

/**
 * Video enrichment generation settings
 *
 * Stub for future video generation integration.
 * Reference: research.md section 2
 */
export const videoSettingsSchema = z.object({
  /** Avatar ID for video generation (future: HeyGen, Synthesia, D-ID) */
  avatar_id: z.string().optional(),

  /** Include slides synchronized with narration */
  include_slides: z.boolean().default(true),

  /** Voice ID for narration (reuses audio settings) */
  voice_id: openAiVoiceSchema.default('nova'),

  /** Video resolution (future) */
  resolution: z.enum(['720p', '1080p']).default('720p').optional(),

  /** Video format (future) */
  format: z.enum(['mp4', 'webm']).default('mp4').optional(),
});

export type VideoSettings = z.infer<typeof videoSettingsSchema>;

// ============================================================================
// DOCUMENT SETTINGS (Placeholder)
// ============================================================================

/**
 * Document enrichment generation settings
 *
 * Placeholder for future document generation (PDF, DOCX).
 */
export const documentSettingsSchema = z.object({
  /** Document format */
  format: z.enum(['pdf', 'docx', 'html']).default('pdf').optional(),

  /** Include table of contents */
  include_toc: z.boolean().default(true).optional(),

  /** Include cover page */
  include_cover: z.boolean().default(true).optional(),
});

export type DocumentSettings = z.infer<typeof documentSettingsSchema>;

// ============================================================================
// DISCRIMINATED UNION OF ALL SETTINGS TYPES
// ============================================================================

/**
 * Discriminated union of all enrichment settings
 *
 * Type-safe settings based on enrichment type.
 */
export const enrichmentSettingsSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('audio'), settings: audioSettingsSchema }),
  z.object({ type: z.literal('quiz'), settings: quizSettingsSchema }),
  z.object({ type: z.literal('presentation'), settings: presentationSettingsSchema }),
  z.object({ type: z.literal('video'), settings: videoSettingsSchema }),
  z.object({ type: z.literal('document'), settings: documentSettingsSchema }),
]);

export type EnrichmentSettings = z.infer<typeof enrichmentSettingsSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Get default settings for enrichment type
 * @param type - Enrichment type
 * @returns Default settings object
 */
export function getDefaultSettings(
  type: 'audio' | 'quiz' | 'presentation' | 'video' | 'document'
): z.infer<typeof enrichmentSettingsSchema>['settings'] {
  switch (type) {
    case 'audio':
      return audioSettingsSchema.parse({});
    case 'quiz':
      return quizSettingsSchema.parse({});
    case 'presentation':
      return presentationSettingsSchema.parse({});
    case 'video':
      return videoSettingsSchema.parse({});
    case 'document':
      return documentSettingsSchema.parse({});
  }
}

/**
 * Validate audio settings
 * @param data - Raw settings data
 * @returns Validation result with parsed settings or errors
 */
export function validateAudioSettings(data: unknown) {
  return audioSettingsSchema.safeParse(data);
}

/**
 * Validate quiz settings
 * @param data - Raw settings data
 * @returns Validation result with parsed settings or errors
 */
export function validateQuizSettings(data: unknown) {
  return quizSettingsSchema.safeParse(data);
}

/**
 * Validate presentation settings
 * @param data - Raw settings data
 * @returns Validation result with parsed settings or errors
 */
export function validatePresentationSettings(data: unknown) {
  return presentationSettingsSchema.safeParse(data);
}

/**
 * Validate video settings
 * @param data - Raw settings data
 * @returns Validation result with parsed settings or errors
 */
export function validateVideoSettings(data: unknown) {
  return videoSettingsSchema.safeParse(data);
}

/**
 * Validate document settings
 * @param data - Raw settings data
 * @returns Validation result with parsed settings or errors
 */
export function validateDocumentSettings(data: unknown) {
  return documentSettingsSchema.safeParse(data);
}
