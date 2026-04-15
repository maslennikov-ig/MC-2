import { logger } from '@/shared/logger';
import { createOpenRouterModel } from '@/shared/llm/langchain-models';
import { getLanguageName } from '@megacampus/shared-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import {
  STAGE6_TIER_MODELS,
  TRUNCATION_CONTINUATION_MAX_TOKENS,
  TRUNCATION_CONTINUATION_PROMPT_TEMPLATE,
  TRUNCATION_CONTINUATION_TAIL_CHARS,
} from './generator-constants';
import { extractTokenUsageWithFallback } from './generator-helpers';
import { selectStage6ModelTier } from './model-selector';

/**
 * Generate cheap continuation/repair text for truncation-only failures.
 */
export async function generateTruncationContinuation(
  lessonSpec: LessonSpecificationV2,
  currentContent: string,
  language: string,
  courseId?: string
): Promise<{
  mergedContent: string;
  continuation: string;
  tokensUsed: number;
  modelUsed: string;
}> {
  const lessonId = lessonSpec.lesson_id;
  const tailContext = currentContent.slice(-TRUNCATION_CONTINUATION_TAIL_CHARS);
  const sectionsList = lessonSpec.sections.map((s, i) => `${i + 1}. ${s.title}`).join('\n');

  const modelId = await resolveContinuationModelId(lessonSpec, courseId);
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

async function resolveContinuationModelId(
  lessonSpec: LessonSpecificationV2,
  courseId?: string
): Promise<string> {
  try {
    const tierResult = await selectStage6ModelTier(lessonSpec, courseId);
    return tierResult.model;
  } catch (error) {
    const difficultyLevel = lessonSpec.difficulty_level || 'intermediate';
    const moduleNumber = lessonSpec.lesson_id?.split('.')[0] || '';
    const fallbackTier =
      moduleNumber === '1'
        ? 'complex'
        : difficultyLevel === 'advanced'
          ? 'complex'
          : difficultyLevel === 'beginner'
            ? 'simple'
            : 'normal';

    logger.warn(
      {
        lessonId: lessonSpec.lesson_id,
        difficultyLevel,
        fallbackTier,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to resolve continuation model from config, using hardcoded fallback'
    );
    return STAGE6_TIER_MODELS[fallbackTier];
  }
}

export function mergeContinuationContent(existingContent: string, continuationRaw: string): string {
  const continuation = continuationRaw.trim();
  if (continuation.length === 0) {
    return existingContent;
  }

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
