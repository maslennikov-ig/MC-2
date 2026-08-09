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
import {
  getRecommendedTemperatureV2,
  type LessonSpecificationV2,
} from '@megacampus/shared-types/lesson-specification-v2';
import {
  getLanguageName,
  getTokenMultiplier,
  getStylePrompt,
  getContentLabels,
  DEFAULT_COURSE_STYLE,
} from '@megacampus/shared-types';
import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';
import { createPromptService } from '@/shared/prompts/prompt-service';
import { formatRAGContextXML } from '@/shared/prompts';
import {
  WORDS_PER_MINUTE,
  TOKENS_PER_WORD_RATIO,
  SINGLE_CALL_MIN_TOKENS,
  SINGLE_CALL_MAX_TOKENS,
  SINGLE_CALL_OVERHEAD_MULTIPLIER,
  SINGLE_CALL_RAG_BUDGET_CHARS,
} from './generator-constants';
import {
  formatInterLessonContextXML,
  extractTokenUsageWithFallback,
  formatGenerationGuidanceXML,
} from './generator-helpers';
import {
  buildIntroCorrectivePrompt,
  INTRO_STRUCTURE_GUARD_ERROR_CODE,
  validateIntroStructure,
} from './generator-intro-guard';
import { selectStage6ModelTier } from './model-selector';
import { extractLessonDigest, stripUnwantedConclusionSections } from './generator-postprocess';

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
  maxTokensOverride?: number
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

  // Step 1: Calculate word budget (min 5 min to prevent 0/negative budgets)
  const durationMinutes = Math.max(5, lessonSpec.estimated_duration_minutes || 15);
  const targetWordCount = Math.round(durationMinutes * WORDS_PER_MINUTE);
  const sectionsWordBudget = Math.round(targetWordCount - 200); // Subtract intro overhead

  // Step 2: Prepare RAG context (CRITICAL - user requirement)
  // Deduplicate chunks by chunk_id
  const seen = new Set<string>();
  const deduplicatedChunks = ragChunks.filter(chunk => {
    if (seen.has(chunk.chunk_id)) return false;
    seen.add(chunk.chunk_id);
    return true;
  });

  // Sort by relevance_score descending
  deduplicatedChunks.sort((a, b) => b.relevance_score - a.relevance_score);

  if (ragChunks.length > 0) {
    logger.debug(
      {
        lessonId: lessonSpec.lesson_id,
        totalChunks: ragChunks.length,
        uniqueChunks: deduplicatedChunks.length,
        duplicatesRemoved: ragChunks.length - deduplicatedChunks.length,
      },
      'RAG chunks deduplicated for single-call generation'
    );
  }

  // Format with budget
  const ragContextXML = formatRAGContextXML(deduplicatedChunks, SINGLE_CALL_RAG_BUDGET_CHARS);

  // Step 3: Prepare inter-lesson context
  const interLessonContextXML = formatInterLessonContextXML(lessonSpec.lesson_context);

  // Step 4: Prepare generation guidance
  const generationGuidanceXML = formatGenerationGuidanceXML(
    analysisResult,
    lessonSpec.lesson_context?.course_position?.lesson_index_in_course
  );

  // Step 5: Get style prompt with fallback
  let stylePrompt: string;
  try {
    stylePrompt = getStylePrompt(style);
  } catch (error) {
    logger.warn(
      {
        lessonId: lessonSpec.lesson_id,
        requestedStyle: style,
        fallbackStyle: DEFAULT_COURSE_STYLE,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to get style prompt, using default'
    );
    stylePrompt = getStylePrompt(DEFAULT_COURSE_STYLE);
  }

  // Step 6: Get localized labels (supports all 19 languages)
  const labels = getContentLabels(language);
  const digestHeader = labels.lessonDigest;
  const outputLanguage = getLanguageName(language);

  // Step 7: Build sections list
  // Keep this as a safety net for legacy Stage 5 specs that still include a synthetic conclusion.
  const contentSections = lessonSpec.sections.filter(
    s =>
      !s.title.toLowerCase().includes('conclusion') && !s.title.toLowerCase().includes('заключение')
  );
  const sectionsList = contentSections.map((s, i) => `${i + 1}. ${s.title}`).join('\n');

  // Step 8: Build learning objectives list
  const learningObjectives = lessonSpec.learning_objectives
    .map((lo, i) => `${i + 1}. ${lo.objective}`)
    .join('\n');

  // Step 9: Handle intro_blueprint defensively
  const hookStrategy = lessonSpec.intro_blueprint?.hook_strategy || 'challenge';
  const hookTopic = lessonSpec.intro_blueprint?.hook_topic || lessonSpec.title;

  // Step 10: Render prompt via prompt service
  const promptService = createPromptService();
  const prompt = await promptService.renderPrompt('stage6_single_call_generator', {
    lessonTitle: lessonSpec.title,
    lessonDescription: lessonSpec.description,
    durationMinutes: String(durationMinutes),
    targetWordCount: String(targetWordCount),
    targetAudience: lessonSpec.metadata.target_audience,
    tone: lessonSpec.metadata.tone,
    difficulty: lessonSpec.difficulty_level,
    learningObjectives,
    sectionsList,
    hookStrategy,
    hookTopic,
    ragContext: ragContextXML,
    interLessonContext: interLessonContextXML,
    generationGuidance: generationGuidanceXML,
    stylePrompt,
    outputLanguage,
    introductionHeader: labels.introduction,
    exercisesHeader: labels.exercises,
    exerciseLabel: labels.exercise,
    taskLabel: labels.task,
    scenarioLabel: labels.scenario,
    yourAnswerLabel: labels.yourAnswer,
    hintLabel: labels.hint,
    sampleAnswerLabel: labels.sampleAnswer,
    digestHeader,
    sectionsWordBudget: String(sectionsWordBudget),
    codeBlockInstruction:
      lessonSpec.metadata.content_archetype === 'code_tutorial'
        ? '5. **Code blocks** with filenames when relevant'
        : '',
  });

  // Step 11: Calculate maxTokens
  // Apply language multiplier + structural overhead (headers, exercises, digest, formatting).
  // Phase-config maxTokensOverride remains a ceiling, matching llm_model_config semantics.
  const languageMultiplier = getTokenMultiplier(language);
  const rawTokens = Math.ceil(
    targetWordCount * TOKENS_PER_WORD_RATIO * languageMultiplier * SINGLE_CALL_OVERHEAD_MULTIPLIER
  );
  const configuredCeiling = maxTokensOverride
    ? Math.max(SINGLE_CALL_MIN_TOKENS, Math.min(SINGLE_CALL_MAX_TOKENS, maxTokensOverride))
    : SINGLE_CALL_MAX_TOKENS;
  const maxTokens = Math.max(SINGLE_CALL_MIN_TOKENS, Math.min(configuredCeiling, rawTokens));

  logger.debug(
    {
      lessonId: lessonSpec.lesson_id,
      targetWordCount,
      rawTokens,
      configuredCeiling,
      maxTokens,
      languageMultiplier,
    },
    'Calculated token budget for single-call generation'
  );

  // Step 12: Get model (3-tier routing by difficulty_level)
  const temperature = getRecommendedTemperatureV2(lessonSpec.metadata.content_archetype);
  let modelId: string;
  if (modelOverride) {
    modelId = modelOverride;
  } else {
    const tierResult = await selectStage6ModelTier(lessonSpec, courseId);
    modelId = tierResult.model;
  }

  // Step 13: Invoke LLM
  logger.info(
    {
      lessonId: lessonSpec.lesson_id,
      modelId,
      temperature,
      maxTokens,
    },
    'Invoking LLM for single-call generation'
  );

  const model = createOpenRouterModel(modelId, temperature, maxTokens);
  const response = await model.invoke(prompt);
  let responseContent =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

  // Step 14: Extract tokens
  const tokenResult = extractTokenUsageWithFallback(response, prompt, language);
  let totalTokensUsed = tokenResult.tokens;
  if (tokenResult.isEstimated) {
    logger.debug(
      { lessonId: lessonSpec.lesson_id, estimatedTokens: tokenResult.tokens },
      'Token usage estimated for single-call'
    );
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
      prompt,
      responseContent,
      labels.introduction,
      outputLanguage,
      introValidation.issues
    );
    const retryResponse = await model.invoke(correctivePrompt);
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
    modelUsed: modelId,
  };
}
export { generateTruncationContinuation, mergeContinuationContent } from './generator-truncation';
export { extractLessonDigest } from './generator-postprocess';
