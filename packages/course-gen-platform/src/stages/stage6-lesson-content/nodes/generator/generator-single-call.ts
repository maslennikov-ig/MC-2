/**
 * Single-Call Lesson Generation Module
 * @module stages/stage6-lesson-content/nodes/generator/generator-single-call
 *
 * Implements complete lesson generation in a single LLM call, optimized for
 * shorter lessons (3-15 minutes) where coherence across sections is critical.
 *
 * Exports:
 * - generateLessonSingleCall(): Main generation function
 * - extractLessonDigest(): Digest extraction helper
 */

import { logger } from '@/shared/logger';
import { createOpenRouterModel } from '@/shared/llm/langchain-models';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';
import { extractTokenUsageWithFallback } from './generator-helpers';
import {
  buildIntroCorrectivePrompt,
  INTRO_STRUCTURE_GUARD_ERROR_CODE,
  validateIntroStructure,
} from './generator-intro-guard';
import { extractLessonDigest, stripUnwantedConclusionSections } from './generator-postprocess';
import { prepareLessonSingleCallRequest } from './generator-request';
import type { Stage6PrefetchedGeneratorResponse } from '../../types';

/**
 * Generate complete lesson content in a single LLM call
 *
 * Optimized for shorter lessons where maintaining coherent narrative
 * across sections is critical. Includes all sections, exercises, and
 * a lesson digest in one generation pass.
 *
 * The digest is extracted from the generated content and returned separately
 * for storage in the database.
 *
 * @param lessonSpec - Complete lesson specification from Stage 5
 * @param ragChunks - Retrieved RAG context chunks
 * @param language - ISO language code ('en', 'ru', etc.)
 * @param modelOverride - Optional model ID override (null = use configured model)
 * @param style - Course style identifier (null = use default)
 * @param analysisResult - Stage 4 analysis result for generation guidance
 * @returns Generated lesson content, extracted digest, and token usage
 */
export async function generateLessonSingleCall(
  lessonSpec: LessonSpecificationV2,
  ragChunks: RAGChunk[],
  language: string,
  modelOverride: string | null,
  style: string | null,
  analysisResult: AnalysisResult | null,
  courseId?: string,
  maxTokensOverride?: number,
  prefetchedResponse?: Stage6PrefetchedGeneratorResponse
): Promise<{
  content: string;
  lessonDigest: string;
  tokensUsed: number;
  modelUsed: string;
}> {
  logger.info(
    {
      lessonId: lessonSpec.lesson_id,
      sectionCount: lessonSpec.sections.length,
      ragChunkCount: ragChunks.length,
      durationMinutes: lessonSpec.estimated_duration_minutes,
    },
    'Starting single-call lesson generation'
  );

  const baseModelOverride = prefetchedResponse
    ? (prefetchedResponse.baseModelUsed ?? prefetchedResponse.modelUsed.replace(/:batch$/u, ''))
    : modelOverride;
  const prepared = await prepareLessonSingleCallRequest(
    lessonSpec,
    ragChunks,
    language,
    baseModelOverride,
    style,
    analysisResult,
    courseId,
    maxTokensOverride
  );
  const {
    prompt,
    modelId,
    temperature,
    maxTokens,
    reasoning,
    labels,
    digestHeader,
    outputLanguage,
    targetWordCount,
  } = prepared;

  // Step 13: Invoke LLM
  logger.info(
    {
      lessonId: lessonSpec.lesson_id,
      modelId,
      temperature,
      maxTokens,
      reasoning: reasoning.enabled ? reasoning : undefined,
    },
    'Invoking LLM for single-call generation'
  );

  let model: ReturnType<typeof createOpenRouterModel> | null = null;
  let responseContent: string;
  let totalTokensUsed: number;
  let modelUsedForAccounting: string;
  let effectivePrompt = prompt;

  if (prefetchedResponse) {
    responseContent = prefetchedResponse.content;
    totalTokensUsed = prefetchedResponse.tokensUsed;
    modelUsedForAccounting = prefetchedResponse.modelUsed;
    effectivePrompt = prefetchedResponse.prompt;
    logger.info(
      {
        lessonId: lessonSpec.lesson_id,
        modelId: prefetchedResponse.modelUsed,
        tokensUsed: totalTokensUsed,
      },
      'Using prefetched Batch API response for single-call generation'
    );
  } else {
    model = createOpenRouterModel(modelId, temperature, maxTokens, undefined, reasoning);
    const response = await model.invoke(prompt);
    responseContent =
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    // Step 14: Extract tokens
    const tokenResult = extractTokenUsageWithFallback(response, prompt, language);
    totalTokensUsed = tokenResult.tokens;
    modelUsedForAccounting = modelId;
    if (tokenResult.isEstimated) {
      logger.debug(
        { lessonId: lessonSpec.lesson_id, estimatedTokens: tokenResult.tokens },
        'Token usage estimated for single-call'
      );
    }
  }

  // Step 14.5: Intro structure guard with one focused corrective retry
  const introValidation = validateIntroStructure(
    responseContent,
    labels.introduction,
    lessonSpec.lesson_context?.next_lesson?.title ?? null,
    language
  );
  if (introValidation.issues.length > 0) {
    logger.warn(
      {
        lessonId: lessonSpec.lesson_id,
        introIssues: introValidation.issues,
        introWordCount: introValidation.introWordCount,
        prefaceWordCount: introValidation.prefaceWordCount,
      },
      'Single-call output failed intro structure guard, running one corrective retry'
    );

    const correctivePrompt = buildIntroCorrectivePrompt(
      effectivePrompt,
      responseContent,
      labels.introduction,
      outputLanguage,
      introValidation.issues
    );
    const correctiveModel =
      model ?? createOpenRouterModel(modelId, temperature, maxTokens, undefined, reasoning);
    const retryResponse = await correctiveModel.invoke(correctivePrompt);
    const retryContent =
      typeof retryResponse.content === 'string'
        ? retryResponse.content
        : JSON.stringify(retryResponse.content);

    const retryTokenResult = extractTokenUsageWithFallback(
      retryResponse,
      correctivePrompt,
      language
    );
    totalTokensUsed += retryTokenResult.tokens;
    if (retryTokenResult.isEstimated) {
      logger.debug(
        { lessonId: lessonSpec.lesson_id, estimatedTokens: retryTokenResult.tokens },
        'Token usage estimated for intro corrective retry'
      );
    }

    const retryValidation = validateIntroStructure(
      retryContent,
      labels.introduction,
      lessonSpec.lesson_context?.next_lesson?.title ?? null,
      language
    );
    if (retryValidation.issues.length > 0) {
      const issueCodes = [...new Set(retryValidation.issues)].sort().join(',');
      throw new Error(`${INTRO_STRUCTURE_GUARD_ERROR_CODE}:${issueCodes}`);
    }

    responseContent = retryContent;
  }

  // Step 14.7: Strip unwanted conclusion/summary sections (safety net)
  responseContent = stripUnwantedConclusionSections(responseContent, labels);

  // Step 15: Extract digest (pass the exact header we asked the model to use)
  const { content, digest } = extractLessonDigest(responseContent, digestHeader);

  // Step 16: Log and return
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  logger.info(
    {
      lessonId: lessonSpec.lesson_id,
      wordCount,
      targetWordCount,
      hasDigest: digest.length > 0,
      tokensUsed: totalTokensUsed,
    },
    'Single-call lesson generation complete'
  );

  return {
    content,
    lessonDigest: digest,
    tokensUsed: totalTokensUsed,
    modelUsed: modelUsedForAccounting,
  };
}
export { generateTruncationContinuation, mergeContinuationContent } from './generator-truncation';
export { extractLessonDigest } from './generator-postprocess';
