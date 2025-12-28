/**
 * Presentation Enrichment Handler
 * @module stages/stage7-enrichments/handlers/presentation-handler
 *
 * Two-stage handler for presentation slide generation.
 * Phase 1 (Draft): Generate slide outline with titles, key points, and layouts
 * Phase 2 (Final): Generate complete slides with markdown content, speaker notes,
 *                  and visual suggestions from approved outline
 *
 * Uses the centralized LLM client with OpenRouter backend for slide generation.
 */

import { logger } from '@/shared/logger';
import { llmClient } from '@/shared/llm/client';
import type { EnrichmentHandler } from '../services/enrichment-router';
import type {
  EnrichmentHandlerInput,
  DraftResult,
  GenerateResult,
} from '../types';
import type { PresentationEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
import { DEFAULT_MODEL_ID } from '@megacampus/shared-types';
import {
  buildPresentationDraftSystemPrompt,
  buildPresentationDraftUserMessage,
  buildPresentationFinalSystemPrompt,
  buildPresentationFinalUserMessage,
  presentationDraftSchema,
  presentationOutputSchema,
  type PresentationSettings,
  type PresentationDraft,
  type PresentationOutput,
} from '../prompts/presentation-prompt';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Default model for presentation generation
 *
 * NOTE: Model is configurable via enrichment settings or llm_model_config table.
 * This constant is LAST RESORT fallback when no model specified.
 * Primary model comes from: settings.model → llm_model_config → DEFAULT_MODEL_ID
 *
 * @see llm_model_config table for admin-configurable models
 * @see DEFAULT_MODEL_ID from shared-types (Xiaomi MiMo V2 Flash)
 */
const FALLBACK_MODEL = DEFAULT_MODEL_ID;

/**
 * Maximum tokens for draft outline generation response
 */
const MAX_DRAFT_TOKENS = 2048;

/**
 * Maximum tokens for final slide generation response
 */
const MAX_FINAL_TOKENS = 4096;

/**
 * Temperature for creative draft outline generation
 */
const DRAFT_TEMPERATURE = 0.7;

/**
 * Temperature for final slide generation (lower for consistency)
 */
const FINAL_TEMPERATURE = 0.6;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract lesson objectives from content or generate defaults
 *
 * @param lessonContent - The lesson content markdown
 * @returns Array of learning objectives
 */
function extractLearningObjectives(lessonContent: string | null): string[] {
  if (!lessonContent) {
    return ['Understand the key concepts of this lesson'];
  }

  // Try to find objectives section in markdown
  const objectivesMatch = lessonContent.match(
    /(?:## (?:Learning )?Objectives?|## Goals?)\s*\n([\s\S]*?)(?=\n##|$)/i
  );

  if (objectivesMatch) {
    const objectivesText = objectivesMatch[1];
    // Extract bullet points
    const bullets = objectivesText.match(/[-*]\s+(.+)/g);
    if (bullets && bullets.length > 0) {
      return bullets.map((b) => b.replace(/^[-*]\s+/, '').trim()).slice(0, 5);
    }
  }

  // Fallback: generate from content structure
  const sections = lessonContent.match(/^## .+$/gm);
  if (sections && sections.length > 0) {
    return sections
      .filter((s) => !s.match(/introduction|summary|conclusion/i))
      .map((s) => `Learn about ${s.replace(/^## /, '')}`)
      .slice(0, 5);
  }

  return ['Master the concepts presented in this lesson'];
}

/**
 * Parse and validate LLM response as presentation draft outline
 *
 * @param content - Raw LLM response content
 * @returns Parsed PresentationDraft or null if invalid
 */
function parseDraftResponse(content: string): PresentationDraft | null {
  try {
    // Clean up potential markdown code blocks
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(jsonContent);
    const result = presentationDraftSchema.safeParse(parsed);

    if (result.success) {
      return result.data;
    }

    logger.warn(
      { errors: result.error.errors },
      'Presentation draft validation failed'
    );
    return null;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to parse presentation draft response as JSON'
    );
    return null;
  }
}

/**
 * Parse and validate LLM response as final presentation output
 *
 * @param content - Raw LLM response content
 * @returns Parsed PresentationOutput or null if invalid
 */
function parseFinalResponse(content: string): PresentationOutput | null {
  try {
    // Clean up potential markdown code blocks
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(jsonContent);
    const result = presentationOutputSchema.safeParse(parsed);

    if (result.success) {
      return result.data;
    }

    logger.warn(
      { errors: result.error.errors },
      'Presentation final output validation failed'
    );
    return null;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to parse presentation final output response as JSON'
    );
    return null;
  }
}

// ============================================================================
// DRAFT GENERATION (Phase 1)
// ============================================================================

/**
 * Generate presentation draft outline using LLM
 *
 * This is Phase 1 of the two-stage flow. Generates a structured outline with
 * slide titles, key points, and suggested layouts that can be reviewed and
 * edited before final slide generation.
 *
 * @param input - Enrichment handler input with context and settings
 * @returns Draft result with outline content and metadata
 */
async function generateDraft(input: EnrichmentHandlerInput): Promise<DraftResult> {
  const { enrichmentContext, settings } = input;
  const startTime = Date.now();

  logger.info(
    {
      enrichmentId: enrichmentContext.enrichment.id,
      lessonId: enrichmentContext.lesson.id,
      lessonTitle: enrichmentContext.lesson.title,
    },
    'Presentation handler: generating draft outline'
  );

  // Build prompts
  const systemPrompt = buildPresentationDraftSystemPrompt();

  // Extract presentation settings from enrichment settings
  const presentationSettings: PresentationSettings = {
    theme: (settings.theme as PresentationSettings['theme']) || 'default',
    maxSlides: (settings.maxSlides as number) || 15,
    includeVisualSuggestions: (settings.includeVisualSuggestions as boolean) ?? true,
    includeSpeakerNotes: (settings.includeSpeakerNotes as boolean) ?? true,
  };

  // Extract learning objectives from lesson content
  const lessonObjectives = extractLearningObjectives(
    enrichmentContext.lesson.content
  );

  const userPrompt = buildPresentationDraftUserMessage({
    lessonTitle: enrichmentContext.lesson.title,
    lessonContent: enrichmentContext.lesson.content || '',
    lessonObjectives,
    language: (enrichmentContext.course.language || 'en') as 'en' | 'ru',
    settings: presentationSettings,
  });

  // Get model from settings or use fallback
  // Priority: settings.model → FALLBACK_MODEL (DEFAULT_MODEL_ID)
  // TODO: Add support for llm_model_config table lookup (stage_7_presentation phase)
  const model = (settings.model as string) || FALLBACK_MODEL;

  try {
    // Generate draft outline via LLM
    const response = await llmClient.generateCompletion(userPrompt, {
      model,
      systemPrompt,
      maxTokens: MAX_DRAFT_TOKENS,
      temperature: DRAFT_TEMPERATURE,
    });

    // Parse and validate response
    const draftOutput = parseDraftResponse(response.content);

    if (!draftOutput) {
      throw new Error('Failed to parse presentation draft output - invalid JSON structure');
    }

    const durationMs = Date.now() - startTime;

    logger.info(
      {
        enrichmentId: enrichmentContext.enrichment.id,
        durationMs,
        tokensUsed: response.totalTokens,
        estimatedSlides: draftOutput.metadata.estimated_slides,
        outlineItems: draftOutput.outline.length,
        theme: draftOutput.metadata.theme,
      },
      'Presentation handler: draft outline generated successfully'
    );

    return {
      draftContent: draftOutput,
      metadata: {
        durationMs,
        tokensUsed: response.totalTokens,
        modelUsed: response.model,
      },
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        enrichmentId: enrichmentContext.enrichment.id,
        lessonId: enrichmentContext.lesson.id,
        durationMs,
        error: errorMessage,
      },
      'Presentation handler: draft outline generation failed'
    );

    throw new Error(`Presentation draft generation failed: ${errorMessage}`);
  }
}

// ============================================================================
// DIRECT GENERATION (Single-stage fallback)
// ============================================================================

/**
 * Generate presentation content directly (single-stage fallback)
 *
 * Used when two-stage flow is bypassed. Generates draft outline and immediately
 * converts to PresentationEnrichmentContent format.
 *
 * @param input - Enrichment handler input
 * @returns Generate result with presentation content
 */
async function generate(input: EnrichmentHandlerInput): Promise<GenerateResult> {
  const { enrichmentContext } = input;
  const startTime = Date.now();

  logger.info(
    {
      enrichmentId: enrichmentContext.enrichment.id,
      lessonId: enrichmentContext.lesson.id,
    },
    'Presentation handler: generating presentation content (single-stage)'
  );

  // Generate draft first
  const draftResult = await generateDraft(input);

  // Convert draft to final content
  const finalResult = await generateFinal(input, draftResult);

  const durationMs = Date.now() - startTime;

  logger.info(
    {
      enrichmentId: enrichmentContext.enrichment.id,
      durationMs,
    },
    'Presentation handler: presentation content generated (single-stage)'
  );

  return finalResult;
}

// ============================================================================
// FINAL GENERATION (Phase 2)
// ============================================================================

/**
 * Convert approved draft outline to final presentation content
 *
 * This is Phase 2 of the two-stage flow. Takes the approved (possibly edited)
 * draft outline and generates complete slides with markdown content, speaker
 * notes, and visual suggestions.
 *
 * @param input - Enrichment handler input
 * @param draft - Approved draft result from Phase 1
 * @returns Generate result with presentation content and metadata
 */
async function generateFinal(
  input: EnrichmentHandlerInput,
  draft: DraftResult
): Promise<GenerateResult> {
  const { enrichmentContext, settings } = input;
  const startTime = Date.now();

  logger.info(
    {
      enrichmentId: enrichmentContext.enrichment.id,
      lessonId: enrichmentContext.lesson.id,
    },
    'Presentation handler: generating final slides from draft outline'
  );

  // Extract draft outline
  const draftOutput = draft.draftContent as PresentationDraft;

  // Build prompts for final generation
  const systemPrompt = buildPresentationFinalSystemPrompt();

  // Extract presentation settings from enrichment settings
  const presentationSettings: PresentationSettings = {
    theme: (settings.theme as PresentationSettings['theme']) || draftOutput.metadata.theme,
    includeVisualSuggestions: (settings.includeVisualSuggestions as boolean) ?? true,
    includeSpeakerNotes: (settings.includeSpeakerNotes as boolean) ?? true,
  };

  // Extract learning objectives from lesson content
  const lessonObjectives = extractLearningObjectives(
    enrichmentContext.lesson.content
  );

  const userPrompt = buildPresentationFinalUserMessage(
    {
      lessonTitle: enrichmentContext.lesson.title,
      lessonContent: enrichmentContext.lesson.content || '',
      lessonObjectives,
      language: (enrichmentContext.course.language || 'en') as 'en' | 'ru',
      settings: presentationSettings,
    },
    draftOutput
  );

  // Get model from settings or use fallback
  const model = (settings.model as string) || FALLBACK_MODEL;

  try {
    // Generate final slides via LLM
    const response = await llmClient.generateCompletion(userPrompt, {
      model,
      systemPrompt,
      maxTokens: MAX_FINAL_TOKENS,
      temperature: FINAL_TEMPERATURE,
    });

    // Parse and validate response
    const presentationOutput = parseFinalResponse(response.content);

    if (!presentationOutput) {
      throw new Error('Failed to parse presentation final output - invalid JSON structure');
    }

    const durationMs = Date.now() - startTime;
    const totalDurationMs = (draft.metadata.durationMs || 0) + durationMs;

    // Build PresentationEnrichmentContent
    const content: PresentationEnrichmentContent = {
      type: 'presentation',
      theme: presentationOutput.theme,
      slides: presentationOutput.slides,
      total_slides: presentationOutput.slides.length,
    };

    // Build metadata
    const metadata: EnrichmentMetadata = {
      generated_at: new Date().toISOString(),
      generation_duration_ms: totalDurationMs,
      input_tokens: undefined, // Will be set from response if available
      output_tokens: undefined,
      total_tokens: (draft.metadata.tokensUsed || 0) + response.totalTokens,
      estimated_cost_usd: 0, // Would need LLM response to calculate
      model_used: response.model,
      quality_score: 1.0, // Default - would be set by quality validation
      retry_attempts: 0,
      additional_info: {
        slide_count: content.total_slides,
        theme: content.theme,
        has_speaker_notes: content.slides.some((s) => s.speaker_notes),
        estimated_duration_minutes: presentationOutput.metadata.estimated_duration_minutes,
      },
    };

    logger.info(
      {
        enrichmentId: enrichmentContext.enrichment.id,
        slideCount: content.total_slides,
        theme: content.theme,
        estimatedDuration: presentationOutput.metadata.estimated_duration_minutes,
        durationMs,
        totalDurationMs,
      },
      'Presentation handler: final presentation content generated'
    );

    return {
      content,
      metadata,
      // Future: assetBuffer could contain exported PDF/PPTX file
      // assetBuffer: undefined,
      // assetMimeType: 'application/pdf',
      // assetExtension: 'pdf',
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        enrichmentId: enrichmentContext.enrichment.id,
        lessonId: enrichmentContext.lesson.id,
        durationMs,
        error: errorMessage,
      },
      'Presentation handler: final presentation generation failed'
    );

    throw new Error(`Presentation final generation failed: ${errorMessage}`);
  }
}

// ============================================================================
// HANDLER EXPORT
// ============================================================================

/**
 * Presentation enrichment handler implementing two-stage flow
 *
 * Stage 1 (Draft): Generate structured slide outline using LLM
 * Stage 2 (Final): Generate complete slides from approved outline
 *
 * The handler uses the centralized LLM client and follows established
 * patterns from Stage 6 for prompt building and response parsing.
 */
export const presentationHandler: EnrichmentHandler = {
  generationFlow: 'two-stage',
  generateDraft,
  generate,
  generateFinal,
};
