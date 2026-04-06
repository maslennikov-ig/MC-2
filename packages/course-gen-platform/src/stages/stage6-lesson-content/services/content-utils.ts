import type { LessonContent, LessonContentBody } from '@megacampus/shared-types/lesson-content';
import { getContentLabels } from '@megacampus/shared-types';

/**
 * Escapes dollar signs that represent currency amounts to prevent
 * remark-math from interpreting them as LaTeX inline math delimiters.
 */
function escapeCurrencyDollarSigns(content: string): string {
  return content.replace(/(?<!\$)\$(\d+(?:[,.]\d+)*)(?=[^\d\w]|$)/g, '\\$$$1');
}

/**
 * Extract markdown content from LessonContent structure
 *
 * Converts the structured LessonContent into a markdown string
 * for storage and rendering.
 *
 * @param content - LessonContent object
 * @param language - Language code for localized headers (default: 'en')
 * @returns Markdown string representation
 */
export function extractContentBodyMarkdown(
  contentBody: LessonContentBody,
  language: string = 'en'
): string {
  const labels = getContentLabels(language);
  const parts: string[] = [];

  // Add introduction
  if (contentBody.intro) {
    parts.push(contentBody.intro);
    parts.push('');
  }

  // Add sections
  for (const section of contentBody.sections) {
    parts.push(`## ${section.title}`);
    parts.push('');
    parts.push(section.content);
    parts.push('');
  }

  // Add examples
  if (contentBody.examples.length > 0) {
    parts.push(`## ${labels.examples}`);
    parts.push('');
    for (const example of contentBody.examples) {
      parts.push(`### ${example.title}`);
      parts.push('');
      parts.push(example.content);
      if (example.code) {
        parts.push('');
        parts.push('```');
        parts.push(example.code);
        parts.push('```');
      }
      parts.push('');
    }
  }

  // Add exercises
  if (contentBody.exercises.length > 0) {
    parts.push(`## ${labels.exercises}`);
    parts.push('');
    for (let i = 0; i < contentBody.exercises.length; i++) {
      const exercise = contentBody.exercises[i];
      parts.push(`### ${labels.exercise} ${i + 1}`);
      parts.push('');
      parts.push(exercise.question);
      if (exercise.hints && exercise.hints.length > 0) {
        parts.push('');
        parts.push(`**${labels.hints}:**`);
        for (const hint of exercise.hints) {
          parts.push(`- ${hint}`);
        }
      }
      parts.push('');
    }
  }

  return escapeCurrencyDollarSigns(parts.join('\n'));
}

export function extractContentMarkdown(content: LessonContent, language: string = 'en'): string {
  return extractContentBodyMarkdown(content.content, language);
}
