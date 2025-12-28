/**
 * Quiz Enrichment Handler
 * @module stages/stage7-enrichments/handlers/quiz-handler
 *
 * Single-stage handler for quiz generation.
 * Generates a structured quiz with questions, answers, and explanations
 * directly from lesson content using LLM.
 *
 * Unlike video/presentation which have two-stage flows (draft → final),
 * quiz generation is direct: lesson content → quiz content.
 *
 * Uses the centralized LLM client with OpenRouter backend.
 */

import { logger } from '@/shared/logger';
import { llmClient } from '@/shared/llm/client';
import type { EnrichmentHandler } from '../services/enrichment-router';
import type {
  EnrichmentHandlerInput,
  GenerateResult,
} from '../types';
import type { QuizEnrichmentContent, EnrichmentMetadata } from '@megacampus/shared-types';
import { DEFAULT_MODEL_ID } from '@megacampus/shared-types';
import {
  buildQuizSystemPrompt,
  buildQuizUserMessage,
  quizOutputSchema,
  type QuizSettings,
} from '../prompts/quiz-prompt';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Default model for quiz generation
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
 * Maximum tokens for quiz generation response
 */
const MAX_OUTPUT_TOKENS = 4096;

/**
 * Temperature for quiz generation
 * Lower temperature (0.5) ensures consistent, accurate questions/answers
 */
const QUIZ_TEMPERATURE = 0.5;

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
 * Parse and validate LLM response as quiz content
 *
 * @param content - Raw LLM response content
 * @returns Parsed QuizEnrichmentContent or null if invalid
 */
function parseQuizResponse(content: string): QuizEnrichmentContent | null {
  try {
    // Clean up potential markdown code blocks
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(jsonContent);
    const result = quizOutputSchema.safeParse(parsed);

    if (result.success) {
      return result.data;
    }

    logger.warn(
      { errors: result.error.errors },
      'Quiz validation failed'
    );
    return null;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to parse quiz response as JSON'
    );
    return null;
  }
}

// ============================================================================
// SINGLE-STAGE GENERATION
// ============================================================================

/**
 * Generate quiz content directly from lesson
 *
 * This is a single-stage flow: lesson content → quiz content.
 * No draft phase required - quiz is generated and ready for use.
 *
 * @param input - Enrichment handler input with context and settings
 * @returns Generate result with quiz content and metadata
 */
async function generate(input: EnrichmentHandlerInput): Promise<GenerateResult> {
  const { enrichmentContext, settings } = input;
  const startTime = Date.now();

  logger.info(
    {
      enrichmentId: enrichmentContext.enrichment.id,
      lessonId: enrichmentContext.lesson.id,
      lessonTitle: enrichmentContext.lesson.title,
    },
    'Quiz handler: generating quiz'
  );

  // Build prompts
  const systemPrompt = buildQuizSystemPrompt();

  // Extract quiz settings from enrichment settings
  const quizSettings: QuizSettings = {
    questionCount: (settings.questionCount as number) || undefined,
    difficultyBias: (settings.difficultyBias as QuizSettings['difficultyBias']) || undefined,
    questionTypes: (settings.questionTypes as QuizSettings['questionTypes']) || undefined,
    passingScore: (settings.passingScore as number) || undefined,
    timeLimitMinutes: (settings.timeLimitMinutes as number) || undefined,
  };

  // Extract learning objectives from lesson content
  const lessonObjectives = extractLearningObjectives(
    enrichmentContext.lesson.content
  );

  const userPrompt = buildQuizUserMessage({
    lessonTitle: enrichmentContext.lesson.title,
    lessonContent: enrichmentContext.lesson.content || '',
    lessonObjectives,
    language: (enrichmentContext.course.language || 'en') as 'en' | 'ru',
    settings: quizSettings,
  });

  // Get model from settings or use fallback
  // Priority: settings.model → FALLBACK_MODEL (DEFAULT_MODEL_ID)
  // TODO: Add support for llm_model_config table lookup (stage_7_quiz phase)
  const model = (settings.model as string) || FALLBACK_MODEL;

  try {
    // Generate quiz via LLM
    const response = await llmClient.generateCompletion(userPrompt, {
      model,
      systemPrompt,
      maxTokens: MAX_OUTPUT_TOKENS,
      temperature: QUIZ_TEMPERATURE,
    });

    // Parse and validate response
    const quizContent = parseQuizResponse(response.content);

    if (!quizContent) {
      throw new Error('Failed to parse quiz output - invalid JSON structure');
    }

    const durationMs = Date.now() - startTime;

    logger.info(
      {
        enrichmentId: enrichmentContext.enrichment.id,
        durationMs,
        tokensUsed: response.totalTokens,
        questionCount: quizContent.questions.length,
        totalPoints: quizContent.metadata?.total_points,
      },
      'Quiz handler: quiz generated successfully'
    );

    // Build metadata
    const metadata: EnrichmentMetadata = {
      generated_at: new Date().toISOString(),
      generation_duration_ms: durationMs,
      input_tokens: response.inputTokens,
      output_tokens: response.outputTokens,
      total_tokens: response.totalTokens,
      estimated_cost_usd: 0, // Would need pricing info to calculate
      model_used: response.model,
      quality_score: 1.0, // Default - would be set by quality validation
      retry_attempts: 0,
      additional_info: {
        question_count: quizContent.questions.length,
        total_points: quizContent.metadata?.total_points,
        estimated_minutes: quizContent.metadata?.estimated_minutes,
        bloom_coverage: quizContent.metadata?.bloom_coverage,
        difficulty_bias: quizSettings.difficultyBias || 'balanced',
      },
    };

    return {
      content: quizContent,
      metadata,
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
      'Quiz handler: quiz generation failed'
    );

    throw new Error(`Quiz generation failed: ${errorMessage}`);
  }
}

// ============================================================================
// HANDLER EXPORT
// ============================================================================

/**
 * Quiz enrichment handler implementing single-stage flow
 *
 * Generates quiz content directly from lesson content using LLM.
 * No draft phase - quiz is ready for immediate use after generation.
 *
 * The handler uses the centralized LLM client and follows established
 * patterns from Stage 6 for prompt building and response parsing.
 */
export const quizHandler: EnrichmentHandler = {
  generationFlow: 'single-stage',
  generate,
  // No generateDraft or generateFinal for single-stage
};
