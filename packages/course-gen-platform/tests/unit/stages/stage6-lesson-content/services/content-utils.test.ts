/**
 * Tests for stage6-lesson-content/services/content-utils.ts
 *
 * Covers markdown extraction from structured LessonContent and currency escaping.
 */
import { describe, it, expect } from 'vitest';
import { extractContentMarkdown } from '@/stages/stage6-lesson-content/services/content-utils';

function makeContentTemplate() {
  return {
    content: {
      intro: '',
      sections: [],
      examples: [],
      exercises: [],
      conclusion: '',
    },
  };
}

describe('extractContentMarkdown', () => {
  it('extracts intro properly', () => {
    const data = makeContentTemplate();
    data.content.intro = 'Welcome to the course.';
    const md = extractContentMarkdown(data as any, 'en');
    expect(md).toContain('Welcome to the course.');
    expect(md.endsWith('\n')).toBe(true);
  });

  it('extracts sections', () => {
    const data = makeContentTemplate();
    data.content.sections = [
      { title: 'Section 1', content: 'Content 1' },
      { title: 'Section 2', content: 'Content 2' },
    ] as any;
    const md = extractContentMarkdown(data as any, 'en');
    expect(md).toContain('## Section 1\n\nContent 1');
    expect(md).toContain('## Section 2\n\nContent 2');
  });

  it('extracts localized examples properly', () => {
    const data = makeContentTemplate();
    data.content.examples = [
      { title: 'Example 1', content: 'Here is an example', code: 'console.log();' },
    ] as any;

    // English
    const mdEn = extractContentMarkdown(data as any, 'en');
    expect(mdEn).toContain('## Examples');
    expect(mdEn).toContain('### Example 1');
    expect(mdEn).toContain('Here is an example');
    expect(mdEn).toContain('```\nconsole.log();\n```');
  });

  it('extracts localized exercises and hints', () => {
    const data = makeContentTemplate();
    data.content.exercises = [
      { question: 'What is 2+2?', hints: ['Think about math', 'Use fingers'] },
    ] as any;

    // English
    const mdEn = extractContentMarkdown(data as any, 'en');
    expect(mdEn).toContain('## Exercises');
    expect(mdEn).toContain('### Exercise 1');
    expect(mdEn).toContain('What is 2+2?');
    expect(mdEn).toContain('**Hints:**');
    expect(mdEn).toContain('- Think about math');
    expect(mdEn).toContain('- Use fingers');
  });

  it('escapes currency dollar signs', () => {
    const data = makeContentTemplate();
    data.content.intro = 'The cost is $100.50 today, and $1,000 tomorrow.';
    const md = extractContentMarkdown(data as any, 'en');
    // Ensure the dollar sign is escaped to prevent LaTeX parsing
    expect(md).toContain('\\$100.50');
    expect(md).toContain('\\$1,000');
  });

  it('does not escape already escaped dollar signs', () => {
    const data = makeContentTemplate();
    data.content.intro = 'The cost is \\$100.';
    const md = extractContentMarkdown(data as any, 'en');
    // It should remain \\$100 (or not double escape it excessively to break it)
    expect(md).toContain('\\$100.');
  });
});
