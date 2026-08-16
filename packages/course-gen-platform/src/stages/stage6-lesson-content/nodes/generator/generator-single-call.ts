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
import { attachCostRecording } from '@/shared/llm/model-cost-callbacks';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';
import { extractTokenSplit, extractTokenUsageWithFallback } from './generator-helpers';
import { calculateLlmCostUsd } from '@/shared/metrics/llm-cost';
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
  /** What this lesson actually cost, when it can be known. */
  costUsd?: number | null;
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
    phaseName,
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
  let costUsd: number | null | undefined;

  if (prefetchedResponse) {
    responseContent = prefetchedResponse.content;
    totalTokensUsed = prefetchedResponse.tokensUsed;
    modelUsedForAccounting = prefetchedResponse.modelUsed;
    effectivePrompt = prefetchedResponse.prompt;
    costUsd = prefetchedResponse.costUsd;
    logger.info(
      {
        lessonId: lessonSpec.lesson_id,
        modelId: prefetchedResponse.modelUsed,
        tokensUsed: totalTokensUsed,
      },
      'Using prefetched Batch API response for single-call generation'
    );
  } else {
    // The largest cost line in the pipeline. It priced itself only when a Batch
    // API response arrived pre-priced, which is off by default, so every
    // ordinary run wrote a trace row with tokens and no price and the course
    // total silently omitted lesson generation (mc2-4wiot). Pricing happens at
    // the call because that is the only place holding the input/output split.
    model = attachCostRecording(
      createOpenRouterModel(modelId, temperature, maxTokens, undefined, reasoning),
      modelId,
      phaseName,
      courseId
    );
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
    // Reusing the live model reuses its cost callback, so the retry prices
    // itself. `model` is null only on the Batch path, where the fresh instance
    // is deliberately left unpriced and the retry is added to the batch item's
    // own figure below.
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

    // The retry is a full synchronous call at the base tariff, and the content
    // that ships is now its content, not the batch's. Leaving both facts on the
    // `:batch` model would bill this half price and credit a model that did not
    // write the lesson (mc2-jv7pc).
    if (prefetchedResponse) {
      modelUsedForAccounting = modelId;
      const retrySplit = extractTokenSplit(retryResponse);
      const retryCost = retrySplit
        ? calculateLlmCostUsd({ model: modelId, ...retrySplit })
        : undefined;
      if (retryCost === undefined) {
        logger.warn(
          { lessonId: lessonSpec.lesson_id, modelId, hasSplit: retrySplit !== null },
          'Intro corrective retry could not be priced; lesson cost covers the batch attempt only'
        );
      } else {
        costUsd = (costUsd ?? 0) + retryCost;
      }
    }

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
    costUsd,
  };
}
export { generateTruncationContinuation, mergeContinuationContent } from './generator-truncation';
export { extractLessonDigest } from './generator-postprocess';
