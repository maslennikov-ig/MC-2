import { logger } from '@/shared/logger';
import {
  getRecommendedTemperatureV2,
  type LessonSpecificationV2,
} from '@megacampus/shared-types/lesson-specification-v2';
import {
  DEFAULT_COURSE_STYLE,
  getContentLabels,
  getLanguageName,
  getStylePrompt,
  getTokenMultiplier,
} from '@megacampus/shared-types';
import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';
import { createPromptService } from '@/shared/prompts/prompt-service';
import { formatRAGContextXML } from '@/shared/prompts';
import { REASONING_DISABLED, type PhaseReasoningConfig } from '@/shared/llm/model-config-service';
import {
  SINGLE_CALL_MAX_TOKENS,
  SINGLE_CALL_MIN_TOKENS,
  SINGLE_CALL_OVERHEAD_MULTIPLIER,
  SINGLE_CALL_RAG_BUDGET_CHARS,
  TOKENS_PER_WORD_RATIO,
  WORDS_PER_MINUTE,
} from './generator-constants';
import { formatGenerationGuidanceXML, formatInterLessonContextXML } from './generator-helpers';
import { selectStage6ModelTier } from './model-selector';

export interface PreparedLessonSingleCallRequest {
  prompt: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
  reasoning: PhaseReasoningConfig;
  labels: ReturnType<typeof getContentLabels>;
  digestHeader: string;
  outputLanguage: string;
  targetWordCount: number;
}

/** Build the exact synchronous request contract without invoking a model. */
export async function prepareLessonSingleCallRequest(
  lessonSpec: LessonSpecificationV2,
  ragChunks: RAGChunk[],
  language: string,
  modelOverride: string | null,
  style: string | null,
  analysisResult: AnalysisResult | null,
  courseId?: string,
  maxTokensOverride?: number
): Promise<PreparedLessonSingleCallRequest> {
  const durationMinutes = Math.max(5, lessonSpec.estimated_duration_minutes || 15);
  const targetWordCount = Math.round(durationMinutes * WORDS_PER_MINUTE);
  const sectionsWordBudget = Math.round(targetWordCount - 200);

  const seen = new Set<string>();
  const deduplicatedChunks = ragChunks.filter(chunk => {
    if (seen.has(chunk.chunk_id)) return false;
    seen.add(chunk.chunk_id);
    return true;
  });
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

  const ragContextXML = formatRAGContextXML(deduplicatedChunks, SINGLE_CALL_RAG_BUDGET_CHARS);
  const interLessonContextXML = formatInterLessonContextXML(lessonSpec.lesson_context);
  const generationGuidanceXML = formatGenerationGuidanceXML(
    analysisResult,
    lessonSpec.lesson_context?.course_position?.lesson_index_in_course
  );

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

  const labels = getContentLabels(language);
  const digestHeader = labels.lessonDigest;
  const outputLanguage = getLanguageName(language);
  const contentSections = lessonSpec.sections.filter(
    section =>
      !section.title.toLowerCase().includes('conclusion') &&
      !section.title.toLowerCase().includes('заключение')
  );
  const sectionsList = contentSections
    .map((section, index) => `${index + 1}. ${section.title}`)
    .join('\n');
  const learningObjectives = lessonSpec.learning_objectives
    .map((objective, index) => `${index + 1}. ${objective.objective}`)
    .join('\n');
  const hookStrategy = lessonSpec.intro_blueprint?.hook_strategy || 'challenge';
  const hookTopic = lessonSpec.intro_blueprint?.hook_topic || lessonSpec.title;

  const prompt = await createPromptService().renderPrompt('stage6_single_call_generator', {
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

  const temperature = getRecommendedTemperatureV2(lessonSpec.metadata.content_archetype);
  let modelId: string;
  let reasoning: PhaseReasoningConfig = REASONING_DISABLED;
  if (modelOverride) {
    modelId = modelOverride;
  } else {
    const tierResult = await selectStage6ModelTier(lessonSpec, courseId);
    modelId = tierResult.model;
    reasoning = tierResult.reasoning ?? REASONING_DISABLED;
  }

  return {
    prompt,
    modelId,
    temperature,
    maxTokens,
    reasoning,
    labels,
    digestHeader,
    outputLanguage,
    targetWordCount,
  };
}
