import type { LessonGraphStateType } from '../state';
import type { LessonContent, LessonContentBody } from '@megacampus/shared-types/lesson-content';
import { logger } from '@/shared/logger';
import { safeJSONParse } from '@/shared/utils/json-repair';
import { parseMarkdownContent } from '../utils/markdown-parser';

/**
 * Extract LessonContentBody from state
 * Uses the structured lessonContent.content from generator node
 */
export function extractContentBody(state: LessonGraphStateType): LessonContentBody | null {
  // Primary path: use lessonContent.content from generator node
  if (state.lessonContent?.content) {
    return state.lessonContent.content;
  }

  // Fallback: if lessonContent not available but generatedContent exists
  // This can happen in edge cases or tests
  if (!state.generatedContent) {
    return null;
  }

  try {
    // If generatedContent is already parsed, validate structure before casting
    if (
      typeof state.generatedContent === 'object' &&
      state.generatedContent !== null &&
      !Array.isArray(state.generatedContent) &&
      'intro' in state.generatedContent &&
      'sections' in state.generatedContent
    ) {
      return state.generatedContent as LessonContentBody;
    }

    // Try to parse JSON from string (for backward compatibility)
    // safeJSONParse handles markdown code blocks, thinking tags, and JSON repair
    const parsed = safeJSONParse(state.generatedContent);
    if (parsed && typeof parsed === 'object') {
      const body = parsed as LessonContentBody;
      if (!Array.isArray(body.sections)) {
        body.sections = [];
      }
      if (!Array.isArray(body.examples)) {
        body.examples = [];
      }
      if (!Array.isArray(body.exercises)) {
        body.exercises = [];
      }
      if (!body.intro) {
        body.intro = '';
      }
      return body;
    }
    return null;
  } catch {
    // JSON parsing failed, try markdown parser
    logger.debug('Failed to parse JSON, trying markdown parser');

    // NEW: Parse markdown content using the markdown parser
    // This is the primary path for the new generator node which outputs markdown
    const parsedMarkdown = parseMarkdownContent(state.generatedContent);

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

    // Convert ParsedMarkdown to LessonContentBody
    const contentBody: LessonContentBody = {
      intro: parsedMarkdown.introduction || parsedMarkdown.summary || '',
      sections: parsedMarkdown.sections,
      examples: [], // Markdown doesn't have structured examples
      exercises: parsedMarkdown.exercises.map(exerciseText => ({
        question: exerciseText,
        solution: 'См. содержание урока для получения рекомендаций.',
        hints: [],
      })),
    };

    logger.info(
      {
        title: parsedMarkdown.title,
        sectionsCount: contentBody.sections.length,
        exercisesCount: contentBody.exercises.length,
        introLength: contentBody.intro.length,
        wordCount: parsedMarkdown.wordCount,
      },
      'Successfully parsed markdown to LessonContentBody'
    );

    return contentBody;
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
  qualityScore: number
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
    },
    status: 'completed',
    created_at: now,
    updated_at: now,
  };
}
