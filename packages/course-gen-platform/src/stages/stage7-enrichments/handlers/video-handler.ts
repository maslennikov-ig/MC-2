/**
 * Video Enrichment Handler
 * @module stages/stage7-enrichments/handlers/video-handler
 *
 * Two-stage handler for video script generation.
 * Phase 1 (Draft): Generate video script using LLM with prompt template
 * Phase 2 (Final): Convert approved script to final video content format
 *                  (stub - actual video generation deferred)
 *
 * Uses the centralized LLM client with OpenRouter backend for script generation.
 */

import { logger } from '@/shared/logger';
import { llmClient } from '@/shared/llm/client';
import type { EnrichmentHandler } from '../services/enrichment-router';
import type {
  EnrichmentHandlerInput,
  DraftResult,
  GenerateResult,
} from '../types';
import type { VideoEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
import { DEFAULT_MODEL_ID } from '@megacampus/shared-types';
import {
  buildVideoScriptSystemPrompt,
  buildVideoScriptUserMessage,
  videoScriptOutputSchema,
  type VideoScriptOutput,
  type VideoScriptSettings,
} from '../prompts/video-prompt';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Default model for video script generation
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
 * Maximum tokens for script generation response
 */
const MAX_OUTPUT_TOKENS = 4096;

/**
 * Temperature for creative script generation
 */
const SCRIPT_TEMPERATURE = 0.7;

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
 * Parse and validate LLM response as video script output
 *
 * @param content - Raw LLM response content
 * @returns Parsed VideoScriptOutput or null if invalid
 */
function parseScriptResponse(content: string): VideoScriptOutput | null {
  try {
    // Clean up potential markdown code blocks
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(jsonContent);
    const result = videoScriptOutputSchema.safeParse(parsed);

    if (result.success) {
      return result.data;
    }

    logger.warn(
      { errors: result.error.errors },
      'Video script validation failed'
    );
    return null;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to parse video script response as JSON'
    );
    return null;
  }
}

// ============================================================================
// DRAFT GENERATION (Phase 1)
// ============================================================================

/**
 * Generate video script draft using LLM
 *
 * This is Phase 1 of the two-stage flow. Generates a structured video script
 * with intro, sections, and conclusion that can be reviewed and edited
 * before final video generation.
 *
 * @param input - Enrichment handler input with context and settings
 * @returns Draft result with script content and metadata
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
    'Video handler: generating script draft'
  );

  // Build prompts
  const systemPrompt = buildVideoScriptSystemPrompt();

  // Extract video script settings from enrichment settings
  const videoSettings: VideoScriptSettings = {
    tone: (settings.tone as VideoScriptSettings['tone']) || 'conversational',
    pacing: (settings.pacing as VideoScriptSettings['pacing']) || 'moderate',
  };

  // Extract learning objectives from lesson content
  const lessonObjectives = extractLearningObjectives(
    enrichmentContext.lesson.content
  );

  const userPrompt = buildVideoScriptUserMessage({
    lessonTitle: enrichmentContext.lesson.title,
    lessonContent: enrichmentContext.lesson.content || '',
    lessonObjectives,
    language: (enrichmentContext.course.language || 'en') as 'en' | 'ru',
    settings: videoSettings,
  });

  // Get model from settings or use fallback
  // Priority: settings.model → FALLBACK_MODEL (DEFAULT_MODEL_ID)
  // TODO: Add support for llm_model_config table lookup (stage_7_video phase)
  const model = (settings.model as string) || FALLBACK_MODEL;

  try {
    // Generate script via LLM
    const response = await llmClient.generateCompletion(userPrompt, {
      model,
      systemPrompt,
      maxTokens: MAX_OUTPUT_TOKENS,
      temperature: SCRIPT_TEMPERATURE,
    });

    // Parse and validate response
    const scriptOutput = parseScriptResponse(response.content);

    if (!scriptOutput) {
      throw new Error('Failed to parse video script output - invalid JSON structure');
    }

    const durationMs = Date.now() - startTime;

    logger.info(
      {
        enrichmentId: enrichmentContext.enrichment.id,
        durationMs,
        tokensUsed: response.totalTokens,
        estimatedVideoDuration: scriptOutput.metadata.total_duration_seconds,
        sectionCount: scriptOutput.script.sections.length,
      },
      'Video handler: script draft generated successfully'
    );

    return {
      draftContent: scriptOutput,
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
      'Video handler: script draft generation failed'
    );

    throw new Error(`Video script generation failed: ${errorMessage}`);
  }
}

// ============================================================================
// DIRECT GENERATION (Single-stage fallback)
// ============================================================================

/**
 * Generate video content directly (single-stage fallback)
 *
 * Used when two-stage flow is bypassed. Generates script and immediately
 * converts to VideoEnrichmentContent format.
 *
 * @param input - Enrichment handler input
 * @returns Generate result with video content
 */
async function generate(input: EnrichmentHandlerInput): Promise<GenerateResult> {
  const { enrichmentContext } = input;
  const startTime = Date.now();

  logger.info(
    {
      enrichmentId: enrichmentContext.enrichment.id,
      lessonId: enrichmentContext.lesson.id,
    },
    'Video handler: generating video content (single-stage)'
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
    'Video handler: video content generated (single-stage)'
  );

  return finalResult;
}

// ============================================================================
// FINAL GENERATION (Phase 2)
// ============================================================================

/**
 * Convert approved draft to final video content
 *
 * This is Phase 2 of the two-stage flow. Takes the approved (possibly edited)
 * script draft and converts it to VideoEnrichmentContent format.
 *
 * Note: Actual video generation (avatar-based, etc.) is deferred to future
 * implementation. Currently this creates the metadata structure for storage.
 *
 * @param input - Enrichment handler input
 * @param draft - Approved draft result from Phase 1
 * @returns Generate result with video content and metadata
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
    'Video handler: generating final video content from draft'
  );

  // Extract script from draft
  const scriptOutput = draft.draftContent as VideoScriptOutput;

  // Build full script text from structured output
  const scriptParts: string[] = [];

  // Add intro
  scriptParts.push(scriptOutput.script.intro.text);
  scriptParts.push('');

  // Add each section
  for (const section of scriptOutput.script.sections) {
    scriptParts.push(`[${section.title}]`);
    scriptParts.push(section.narration);
    scriptParts.push('');
  }

  // Add conclusion
  scriptParts.push(scriptOutput.script.conclusion.text);

  const fullScript = scriptParts.join('\n\n');

  // Calculate total duration
  const totalDuration = scriptOutput.metadata.total_duration_seconds;

  // Build video content
  const content: VideoEnrichmentContent = {
    type: 'video',
    script: fullScript,
    avatar_id: (settings.avatar_id as string) || undefined,
    estimated_duration_seconds: totalDuration,
    // slides_sync_points would be populated if we had presentation slides to sync
    slides_sync_points: undefined,
  };

  const durationMs = Date.now() - startTime;
  const totalDurationMs = (draft.metadata.durationMs || 0) + durationMs;

  // Build metadata
  const metadata: EnrichmentMetadata = {
    generated_at: new Date().toISOString(),
    generation_duration_ms: totalDurationMs,
    input_tokens: undefined, // Will be set from draft if available
    output_tokens: undefined,
    total_tokens: draft.metadata.tokensUsed,
    estimated_cost_usd: 0, // Would need LLM response to calculate
    model_used: draft.metadata.modelUsed,
    quality_score: 1.0, // Default - would be set by quality validation
    retry_attempts: 0,
    additional_info: {
      tone: scriptOutput.metadata.tone,
      pacing: scriptOutput.metadata.pacing,
      word_count: scriptOutput.metadata.word_count,
      section_count: scriptOutput.script.sections.length,
    },
  };

  logger.info(
    {
      enrichmentId: enrichmentContext.enrichment.id,
      scriptLength: fullScript.length,
      estimatedDuration: totalDuration,
      durationMs,
    },
    'Video handler: final video content generated'
  );

  return {
    content,
    metadata,
    // In future, assetBuffer would contain the generated video file
    // assetBuffer: undefined,
    // assetMimeType: 'video/mp4',
    // assetExtension: 'mp4',
  };
}

// ============================================================================
// HANDLER EXPORT
// ============================================================================

/**
 * Video enrichment handler implementing two-stage flow
 *
 * Stage 1 (Draft): Generate structured video script using LLM
 * Stage 2 (Final): Convert approved script to VideoEnrichmentContent
 *
 * The handler uses the centralized LLM client and follows established
 * patterns from Stage 6 for prompt building and response parsing.
 */
export const videoHandler: EnrichmentHandler = {
  generationFlow: 'two-stage',
  generateDraft,
  generate,
  generateFinal,
};
