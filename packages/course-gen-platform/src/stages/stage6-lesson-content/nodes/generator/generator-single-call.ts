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
import { createModelConfigService } from '@/shared/llm/model-config-service';
import {
  getRecommendedTemperatureV2,
  type LessonSpecificationV2,
} from '@megacampus/shared-types/lesson-specification-v2';
import type { PhaseName } from '@megacampus/shared-types/model-config';
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
  SINGLE_CALL_RAG_BUDGET_CHARS,
  STAGE6_TIER_MODELS,
  TRUNCATION_CONTINUATION_TAIL_CHARS,
  TRUNCATION_CONTINUATION_MAX_TOKENS,
  TRUNCATION_CONTINUATION_PROMPT_TEMPLATE,
} from './generator-constants';
import {
  formatInterLessonContextXML,
  extractTokenUsageWithFallback,
  formatGenerationGuidanceXML,
} from './generator-helpers';
import { selectStage6ModelTier } from './model-selector';

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
  analysisResult: AnalysisResult | null
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
  const generationGuidanceXML = formatGenerationGuidanceXML(analysisResult);

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
    outputLanguage: getLanguageName(language),
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
  });

  // Step 11: Calculate maxTokens
  const languageMultiplier = getTokenMultiplier(language);
  const rawTokens = Math.ceil(targetWordCount * TOKENS_PER_WORD_RATIO * languageMultiplier);
  const maxTokens = Math.min(SINGLE_CALL_MAX_TOKENS, Math.max(SINGLE_CALL_MIN_TOKENS, rawTokens));

  logger.debug(
    {
      lessonId: lessonSpec.lesson_id,
      targetWordCount,
      rawTokens,
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
    const tierResult = await selectStage6ModelTier(lessonSpec);
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
  const responseContent =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

  // Step 14: Extract tokens
  const tokenResult = extractTokenUsageWithFallback(response, prompt, language);
  if (tokenResult.isEstimated) {
    logger.debug(
      { lessonId: lessonSpec.lesson_id, estimatedTokens: tokenResult.tokens },
      'Token usage estimated for single-call'
    );
  }

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
      tokensUsed: tokenResult.tokens,
    },
    'Single-call lesson generation complete'
  );

  return {
    content,
    lessonDigest: digest,
    tokensUsed: tokenResult.tokens,
    modelUsed: modelId,
  };
}

/**
 * Generate cheap continuation/repair text for truncation-only failures.
 *
 * This path avoids full lesson regeneration and only appends missing tail content
 * using a small token budget and the Stage 6 simple-tier model.
 */
export async function generateTruncationContinuation(
  lessonSpec: LessonSpecificationV2,
  currentContent: string,
  language: string
): Promise<{
  mergedContent: string;
  continuation: string;
  tokensUsed: number;
  modelUsed: string;
}> {
  const lessonId = lessonSpec.lesson_id;
  const tailContext = currentContent.slice(-TRUNCATION_CONTINUATION_TAIL_CHARS);
  const sectionsList = lessonSpec.sections.map((s, i) => `${i + 1}. ${s.title}`).join('\n');

  const modelId = await resolveContinuationModelId();
  const model = createOpenRouterModel(modelId, 0.2, TRUNCATION_CONTINUATION_MAX_TOKENS);

  const prompt = TRUNCATION_CONTINUATION_PROMPT_TEMPLATE.replace(
    '{{outputLanguage}}',
    getLanguageName(language)
  )
    .replace('{{lessonTitle}}', lessonSpec.title)
    .replace('{{sectionsList}}', sectionsList)
    .replace('{{tailContext}}', tailContext);

  logger.info(
    {
      lessonId,
      modelId,
      tailChars: tailContext.length,
      maxTokens: TRUNCATION_CONTINUATION_MAX_TOKENS,
    },
    'Invoking truncation continuation repair'
  );

  const response = await model.invoke(prompt);
  const responseContent =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  const continuation = responseContent.trim();
  const mergedContent = mergeContinuationContent(currentContent, continuation);

  const tokenResult = extractTokenUsageWithFallback(response, prompt, language);
  if (tokenResult.isEstimated) {
    logger.debug(
      { lessonId, estimatedTokens: tokenResult.tokens },
      'Token usage estimated for truncation continuation'
    );
  }

  return {
    mergedContent,
    continuation,
    tokensUsed: tokenResult.tokens,
    modelUsed: modelId,
  };
}

async function resolveContinuationModelId(): Promise<string> {
  const phase = 'stage_6_simple' as PhaseName;
  try {
    const modelConfigService = createModelConfigService();
    const config = await modelConfigService.getModelForPhase(phase);
    return config.modelId || STAGE6_TIER_MODELS.simple;
  } catch (error) {
    logger.warn(
      {
        phase,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to resolve continuation model from config, using hardcoded fallback'
    );
    return STAGE6_TIER_MODELS.simple;
  }
}

export function mergeContinuationContent(existingContent: string, continuationRaw: string): string {
  const continuation = continuationRaw.trim();
  if (continuation.length === 0) {
    return existingContent;
  }

  // Remove duplicated overlap if model repeats tail text.
  const maxOverlap = Math.min(400, existingContent.length, continuation.length);
  let overlap = 0;

  for (let size = maxOverlap; size >= 40; size--) {
    if (existingContent.slice(-size) === continuation.slice(0, size)) {
      overlap = size;
      break;
    }
  }

  const appendPart = continuation.slice(overlap).trimStart();
  if (appendPart.length === 0) {
    return existingContent;
  }

  return `${existingContent.trimEnd()}\n\n${appendPart}`;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract lesson digest from generated markdown
 *
 * The digest is a ## section at the end of the lesson content containing
 * a 3-5 sentence summary of key concepts. This function removes the digest
 * from the main content and returns both parts separately.
 *
 * @param markdown - Full generated lesson markdown including digest section
 * @param expectedHeader - The localized header we asked the model to generate
 *   (e.g., "Lesson Digest", "Краткое содержание урока", "課程摘要").
 *   If not provided, falls back to matching common EN/RU patterns.
 * @returns Object with main content (without digest) and extracted digest text
 */
export function extractLessonDigest(
  markdown: string,
  expectedHeader?: string
): {
  content: string;
  digest: string;
} {
  // Build pattern: first try the exact localized header, then fallback EN/RU
  const headerAlternatives: string[] = [];
  if (expectedHeader) {
    headerAlternatives.push(escapeRegex(expectedHeader));
  }
  // Always include EN/RU fallbacks for robustness (model may deviate)
  headerAlternatives.push('Lesson Digest', 'Краткое содержание урока', 'Дайджест урока');

  // Deduplicate
  const unique = [...new Set(headerAlternatives)];
  const pattern = new RegExp(`^##\\s+(?:${unique.join('|')}).*$`, 'im');
  const match = markdown.match(pattern);

  if (!match || match.index === undefined) {
    logger.warn('No digest section found in generated content');
    return { content: markdown.trim(), digest: '' };
  }

  const digestStart = match.index;
  const contentBefore = markdown.slice(0, digestStart).trim();
  const digestRaw = markdown.slice(digestStart + match[0].length).trim();

  // Clean up: remove trailing --- or *** separators
  const digestClean = digestRaw
    .replace(/^[\s\n]*---[\s\n]*$/m, '')
    .replace(/^[\s\n]*\*\*\*[\s\n]*$/m, '')
    .trim();

  logger.debug(
    {
      digestLength: digestClean.length,
      contentLength: contentBefore.length,
    },
    'Extracted lesson digest from generated content'
  );

  return {
    content: contentBefore,
    digest: digestClean,
  };
}
