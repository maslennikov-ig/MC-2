import { logger } from '@/shared/logger';
import { createCostRecordingModel } from '@/shared/llm/langchain-models';
import { getLanguageName } from '@megacampus/shared-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { PhaseName } from '@megacampus/shared-types/model-config';
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

  const { modelId, phaseName } = await resolveContinuationModel(lessonSpec, courseId);
  const model = createCostRecordingModel(
    modelId,
    0.2,
    TRUNCATION_CONTINUATION_MAX_TOKENS,
    phaseName,
    courseId
  );

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

async function resolveContinuationModel(
  lessonSpec: LessonSpecificationV2,
  courseId?: string
): Promise<{ modelId: string; phaseName: PhaseName }> {
  try {
    const tierResult = await selectStage6ModelTier(lessonSpec, courseId);
    return { modelId: tierResult.model, phaseName: tierResult.phaseName };
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
    return {
      modelId: STAGE6_TIER_MODELS[fallbackTier],
      phaseName: `stage_6_${fallbackTier}` as PhaseName,
    };
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

  const appendPart = dropRepeatedHeading(existingContent, continuation.slice(overlap).trimStart());
  if (appendPart.length === 0) {
    return existingContent;
  }

  return `${existingContent.trimEnd()}\n\n${appendPart}`;
}

const HEADING_LINE_PATTERN = /^#{1,6}\s+\S/;

function normalizeHeadingLine(line: string): string {
  return line.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Drop the heading a continuation repeats from the seam.
 *
 * When generation is cut off right after a heading, the continuation restates that heading
 * and the document ends up with it twice ("## Заключение\n\n## Заключение"). The heading
 * line is far shorter than the 40-char overlap floor, so the overlap scan never sees it.
 *
 * Only a heading that is the very last line of the existing content is dropped: if the
 * document already carries body text under that heading, a second copy is a real duplicate
 * and belongs in the judge's report, not in this seam repair.
 */
function dropRepeatedHeading(existingContent: string, appendPart: string): string {
  if (appendPart.length === 0) {
    return appendPart;
  }

  const existingLines = existingContent.trimEnd().split('\n');
  const lastLine = existingLines[existingLines.length - 1] ?? '';
  if (!HEADING_LINE_PATTERN.test(lastLine.trim())) {
    return appendPart;
  }

  const appendLines = appendPart.split('\n');
  if (normalizeHeadingLine(appendLines[0]) !== normalizeHeadingLine(lastLine)) {
    return appendPart;
  }

  return appendLines.slice(1).join('\n').trim();
}
