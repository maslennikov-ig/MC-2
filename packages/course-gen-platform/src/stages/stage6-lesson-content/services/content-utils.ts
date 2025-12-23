import type { LessonContent } from '@megacampus/shared-types/lesson-content';

/**
 * Extract markdown content from LessonContent structure
 *
 * Converts the structured LessonContent into a markdown string
 * for storage and rendering.
 *
 * @param content - LessonContent object
 * @returns Markdown string representation
 */
export function extractContentMarkdown(content: LessonContent): string {
  const parts: string[] = [];

  // Add introduction
  if (content.content.intro) {
    parts.push(content.content.intro);
    parts.push('');
  }

  // Add sections
  for (const section of content.content.sections) {
    parts.push(`## ${section.title}`);
    parts.push('');
    parts.push(section.content);
    parts.push('');
  }

  // Add examples
  if (content.content.examples.length > 0) {
    parts.push('## Examples');
    parts.push('');
    for (const example of content.content.examples) {
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
  if (content.content.exercises.length > 0) {
    parts.push('## Exercises');
    parts.push('');
    for (let i = 0; i < content.content.exercises.length; i++) {
      const exercise = content.content.exercises[i];
      parts.push(`### Exercise ${i + 1}`);
      parts.push('');
      parts.push(exercise.question);
      if (exercise.hints && exercise.hints.length > 0) {
        parts.push('');
        parts.push('**Hints:**');
        for (const hint of exercise.hints) {
          parts.push(`- ${hint}`);
        }
      }
      parts.push('');
    }
  }

  return parts.join('\n');
}
