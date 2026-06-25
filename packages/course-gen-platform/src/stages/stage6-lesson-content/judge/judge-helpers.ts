import type { LessonGraphStateType } from '../state';
import type {
  LessonContent,
  LessonContentBody,
  LessonQualitySignals,
} from '@megacampus/shared-types/lesson-content';
import { validateLessonContentBody } from '@megacampus/shared-types/lesson-content';
import { logger } from '@/shared/logger';
import { safeJSONParse } from '@/shared/workspace-utils';
import { parseMarkdownContent } from '../utils/markdown-parser';

type LessonContentBodyValidationResult = ReturnType<typeof validateLessonContentBody>;

function validatedContentBody(value: unknown, source: string): LessonContentBody | null {
  const parsed: LessonContentBodyValidationResult = validateLessonContentBody(value);
  if (parsed.success) {
    return parsed.data;
  }

  logger.warn(
    {
      source,
      issues: parsed.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    },
    'Rejected invalid LessonContentBody'
  );
  return null;
}

function isJsonLikeContent(value: string): boolean {
  const trimmed = value.trim();
  const fencedJson = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fencedJson ? fencedJson[1].trim() : trimmed;
  return candidate.startsWith('{') || candidate.startsWith('[');
}

function parseMarkdownContentBody(markdown: string): LessonContentBody | null {
  const parsedMarkdown = parseMarkdownContent(markdown);

  if (parsedMarkdown.sections.length === 0) {
    logger.warn(
      {
        title: parsedMarkdown.title,
        wordCount: parsedMarkdown.wordCount,
        headingCount: parsedMarkdown.headingStructure.length,
      },
      'Markdown parsed but no sections extracted'
    );
    return null;
  }

  const contentBody: LessonContentBody = {
    intro: parsedMarkdown.introduction || parsedMarkdown.summary || '',
    sections: parsedMarkdown.sections,
    examples: [],
    exercises: parsedMarkdown.exercises.map(exerciseText => ({
      question: exerciseText,
      solution: 'См. содержание урока для получения рекомендаций.',
      hints: [],
    })),
  };

  const validated = validatedContentBody(contentBody, 'generatedContent.markdown');
  if (!validated) {
    return null;
  }

  logger.info(
    {
      title: parsedMarkdown.title,
      sectionsCount: validated.sections.length,
      exercisesCount: validated.exercises.length,
      introLength: validated.intro.length,
      wordCount: parsedMarkdown.wordCount,
    },
    'Successfully parsed markdown to LessonContentBody'
  );

  return validated;
}

/**
 * Extract LessonContentBody from state
 * Uses the structured lessonContent.content from generator node
 */
export function extractContentBody(state: LessonGraphStateType): LessonContentBody | null {
  // Primary path: use lessonContent.content from generator node
  if (state.lessonContent?.content) {
    return validatedContentBody(state.lessonContent.content, 'state.lessonContent.content');
  }

  // Fallback: if lessonContent not available but generatedContent exists
  // This can happen in edge cases or tests
  if (!state.generatedContent) {
    return null;
  }

  try {
    // If generatedContent is already parsed, validate structure before casting
    if (typeof state.generatedContent === 'object' && state.generatedContent !== null) {
      return validatedContentBody(state.generatedContent, 'state.generatedContent');
    }

    if (typeof state.generatedContent !== 'string') {
      return null;
    }

    const generatedContent = state.generatedContent.trim();
    if (!generatedContent) return null;

    if (isJsonLikeContent(generatedContent)) {
      try {
        // safeJSONParse handles markdown code blocks, thinking tags, and JSON repair.
        const parsed = safeJSONParse(generatedContent);
        const validated = validatedContentBody(parsed, 'state.generatedContent.json');
        if (validated) {
          return validated;
        }
      } catch {
        logger.debug('Failed to parse generatedContent as JSON, trying markdown parser');
      }
    }

    return parseMarkdownContentBody(generatedContent);
  } catch {
    logger.warn('Failed to extract LessonContentBody from graph state');
    return null;
  }
}

/**
 * Count words in a content body
 */
export function countWords(contentBody: LessonContentBody): number {
  let wordCount = 0;

  // Count intro words
  if (contentBody.intro) {
    wordCount += contentBody.intro.split(/\s+/).filter(Boolean).length;
  }

  // Count section words
  if (Array.isArray(contentBody.sections)) {
    for (const section of contentBody.sections) {
      wordCount += section.title.split(/\s+/).filter(Boolean).length;
      wordCount += section.content.split(/\s+/).filter(Boolean).length;
    }
  }

  // Count example words
  if (Array.isArray(contentBody.examples)) {
    for (const example of contentBody.examples) {
      wordCount += example.title.split(/\s+/).filter(Boolean).length;
      wordCount += example.content.split(/\s+/).filter(Boolean).length;
      if (example.code) {
        wordCount += example.code.split(/\s+/).filter(Boolean).length;
      }
    }
  }

  // Count exercise words
  if (Array.isArray(contentBody.exercises)) {
    for (const exercise of contentBody.exercises) {
      wordCount += exercise.question.split(/\s+/).filter(Boolean).length;
      wordCount += exercise.solution.split(/\s+/).filter(Boolean).length;
      if (exercise.hints) {
        for (const hint of exercise.hints) {
          wordCount += hint.split(/\s+/).filter(Boolean).length;
        }
      }
    }
  }

  return wordCount;
}

/**
 * Build LessonContent from state after successful judge evaluation
 */
export function buildLessonContent(
  state: LessonGraphStateType,
  contentBody: LessonContentBody,
  qualityScore: number,
  qaSignals?: LessonQualitySignals | null
): LessonContent {
  const totalWords = countWords(contentBody);
  const now = new Date();

  return {
    lesson_id: state.lessonSpec.lesson_id,
    course_id: state.courseId,
    content: contentBody,
    metadata: {
      total_words: totalWords,
      total_tokens: state.tokensUsed,
      cost_usd: 0, // Will be calculated by orchestrator or billing service
      quality_score: qualityScore,
      rag_chunks_used: state.ragChunks.length,
      generation_duration_ms: state.durationMs,
      model_used: state.modelUsed ?? 'unknown',
      archetype_used: state.lessonSpec.metadata.content_archetype,
      temperature_used: state.temperature,
      qa_signals: qaSignals ?? state.qaSignals ?? undefined,
    },
    status: 'completed',
    created_at: now,
    updated_at: now,
  };
}
