/**
 * Unit tests for stripLLMMetadata
 * @module tests/unit/stages/stage6-lesson-content/strip-llm-metadata
 *
 * Tests the pure stripLLMMetadata function which removes trailing LLM
 * meta-information (summaries of changes, scores, checklists) from the
 * end of generated lesson content.
 *
 * No mocking required — this is a pure string-transformation function.
 */

import { describe, it, expect } from 'vitest';
import {
  stripLLMMetadata,
  stripLOCodes,
} from '../../../../src/stages/stage6-lesson-content/judge/strip-metadata';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a string of N non-metadata lines for padding. */
function buildPaddingLines(count: number): string {
  return Array.from({ length: count }, (_, i) => `Line ${i + 1} of lesson content.`).join('\n');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('stripLLMMetadata', () => {
  it('does not modify clean content without any metadata', () => {
    const content = [
      '# Introduction to TypeScript',
      '',
      'TypeScript is a typed superset of JavaScript.',
      '',
      '## Key Concepts',
      '',
      '- Static typing',
      '- Interfaces',
      '- Generics',
      '',
      'This concludes the introduction.',
    ].join('\n');

    expect(stripLLMMetadata(content)).toBe(content);
  });

  it('strips "## SUMMARY OF CHANGES (Iteration 2)" followed by bullet points', () => {
    const lessonBody = [
      '# Lesson: Variables',
      '',
      'A variable is a named container for a value.',
      '',
      '## Examples',
      '',
      '```js',
      'const x = 42;',
      '```',
    ].join('\n');

    const metadata = [
      '',
      '## SUMMARY OF CHANGES (Iteration 2)',
      '',
      'Fixed Issues:',
      '- Clarified variable scoping rules',
      '- Added missing code example',
    ].join('\n');

    const content = lessonBody + '\n' + metadata;
    const result = stripLLMMetadata(content);

    expect(result).toBe(lessonBody);
    expect(result).not.toContain('SUMMARY OF CHANGES');
    expect(result).not.toContain('Fixed Issues:');
  });

  it('strips "### Changes Made" followed by bullet points', () => {
    const lessonBody = [
      '# Lesson: Functions',
      '',
      'Functions encapsulate reusable logic.',
      '',
      'Use `function` keyword or arrow syntax.',
      '',
      'End of lesson content.',
    ].join('\n');

    const metadata = [
      '',
      '### Changes Made',
      '',
      '- Rewrote introduction paragraph',
      '- Added arrow function examples',
    ].join('\n');

    const content = lessonBody + '\n' + metadata;
    const result = stripLLMMetadata(content);

    expect(result).toBe(lessonBody);
    expect(result).not.toContain('Changes Made');
  });

  it('strips metadata that follows a "---" horizontal rule separator', () => {
    const lessonBody = [
      '# Lesson: Async/Await',
      '',
      'Async functions always return a Promise.',
      '',
      '```js',
      'async function fetchData() {',
      '  const data = await fetch(url);',
      '  return data.json();',
      '}',
      '```',
      '',
      'Await can only be used inside async functions.',
    ].join('\n');

    const separatorAndMeta = [
      '',
      '---',
      '',
      '## SUMMARY OF CHANGES',
      '',
      'Improved code examples and explanation.',
    ].join('\n');

    const content = lessonBody + '\n' + separatorAndMeta;
    const result = stripLLMMetadata(content);

    expect(result).toBe(lessonBody);
    expect(result).not.toContain('---');
    expect(result).not.toContain('SUMMARY OF CHANGES');
  });

  it('strips "Final Score: 100%" as a standalone trailing metadata line', () => {
    const lessonBody = [
      '# Lesson: Closures',
      '',
      'A closure gives access to an outer function scope from an inner function.',
      '',
      'Closures are created every time a function is created.',
      '',
      'They are widely used in event handlers and callbacks.',
    ].join('\n');

    const content = lessonBody + '\n\nFinal Score: 100%';
    const result = stripLLMMetadata(content);

    expect(result).toBe(lessonBody);
    expect(result).not.toContain('Final Score');
  });

  it('does not false-positive on "## Summary" that appears in the middle of long content', () => {
    // Place ## Summary more than MAX_TRAILING_SCAN_LINES (40) lines from the end
    // so it falls outside the scan window. We put it at line ~5, then pad 45+
    // lines of real content after it.
    const header = [
      '# Lesson: Modules',
      '',
      '## Summary',
      '',
      'Modules allow code to be split into reusable files.',
      '',
    ].join('\n');

    // 45 lines of real content after the Summary heading — pushes it outside the window
    const body = buildPaddingLines(45);

    const content = header + body;
    const result = stripLLMMetadata(content);

    expect(result).toBe(content);
    expect(result).toContain('## Summary');
  });

  it('handles empty string correctly', () => {
    expect(stripLLMMetadata('')).toBe('');
  });

  it('is idempotent — running twice yields the same result', () => {
    const content = [
      '# Lesson: Promises',
      '',
      'A Promise represents an eventual completion or failure of an async operation.',
      '',
      'Use .then() and .catch() to handle outcomes.',
      '',
      '## SUMMARY OF CHANGES',
      '',
      'Fixed Issues:',
      '- Improved wording',
    ].join('\n');

    const once = stripLLMMetadata(content);
    const twice = stripLLMMetadata(once);

    expect(twice).toBe(once);
  });

  it('handles a real-world lesson ending with a full metadata block', () => {
    const lessonBody = [
      '# Lesson: Error Handling',
      '',
      'In JavaScript, errors are objects that carry a message and a stack trace.',
      '',
      '## Try / Catch',
      '',
      '```js',
      'try {',
      '  riskyOperation();',
      '} catch (err) {',
      "  console.error('Something went wrong', err);",
      '}',
      '```',
      '',
      '## Custom Errors',
      '',
      'You can extend the built-in `Error` class:',
      '',
      '```js',
      'class ValidationError extends Error {',
      "  constructor(message) { super(message); this.name = 'ValidationError'; }",
      '}',
      '```',
      '',
      'Always prefer specific error types over generic ones.',
    ].join('\n');

    // Exactly the block described in the task specification
    const realisticMetadata = [
      '',
      '---',
      '',
      '## SUMMARY OF CHANGES (Iteration 2)',
      '',
      'Fixed Issues:',
      '- Improved clarity of introduction',
      '- Added more examples',
      '',
      'Preserved Improvements:',
      '- Kept the interactive exercises from iteration 1',
      '',
      'Final Score: 85%',
    ].join('\n');

    const content = lessonBody + '\n' + realisticMetadata;
    const result = stripLLMMetadata(content);

    expect(result).toBe(lessonBody);
    expect(result).not.toContain('---');
    expect(result).not.toContain('SUMMARY OF CHANGES');
    expect(result).not.toContain('Fixed Issues:');
    expect(result).not.toContain('Preserved Improvements:');
    expect(result).not.toContain('Final Score');

    // Core lesson content must be intact
    expect(result).toContain('Try / Catch');
    expect(result).toContain('Custom Errors');
    expect(result).toContain('Always prefer specific error types over generic ones.');
  });
});

// ---------------------------------------------------------------------------
// stripLOCodes tests
// ---------------------------------------------------------------------------

describe('stripLOCodes', () => {
  it('does not modify clean content without LO-codes', () => {
    const content = [
      '# Introduction',
      '',
      'This lesson covers key concepts in data analysis.',
      '',
      '## Key Takeaways',
      '',
      '- Understand the basics',
      '- Apply in practice',
    ].join('\n');

    expect(stripLOCodes(content)).toBe(content);
  });

  it('strips **LO-6.2.2** — from inline text', () => {
    const input = 'Один из ключевых аспектов **LO-6.2.2** — анализ отчетов';
    const result = stripLOCodes(input);
    expect(result).toBe('Один из ключевых аспектов анализ отчетов');
    expect(result).not.toContain('LO-');
  });

  it('strips trailing **LO-1.3-2** after text and collapses double spaces', () => {
    const input = 'чтобы выполнить **LO-1.3-2**. После прохождения';
    const result = stripLOCodes(input);
    expect(result).toBe('чтобы выполнить . После прохождения');
    expect(result).not.toContain('LO-');
    expect(result).not.toContain('  ');
  });

  it('strips LO-code from heading: #### **1. LO-1.2-1: Построить**', () => {
    const input = '#### **1. LO-1.2-1: Построить матрицу «Red Bull 6×3»**';
    const result = stripLOCodes(input);
    expect(result).toBe('#### **1. Построить матрицу «Red Bull 6×3»**');
    expect(result).not.toContain('LO-');
  });

  it('strips **(LO-6.4-3)** in bold parens', () => {
    const input = 'Упражнение **(LO-6.4-3)** для практики';
    const result = stripLOCodes(input);
    expect(result).toBe('Упражнение для практики');
    expect(result).not.toContain('LO-');
  });

  it('strips (LO-2.5-2): in parens with colon', () => {
    const input = '**Уровень «Применить» (LO-2.5-2):** описание';
    const result = stripLOCodes(input);
    expect(result).toBe('**Уровень «Применить» ** описание');
    expect(result).not.toContain('LO-');
  });

  it('collapses whitespace artifacts after stripping', () => {
    const input = 'выполнить **LO-1.3-2** задание';
    const result = stripLOCodes(input);
    expect(result).toBe('выполнить задание');
    expect(result).not.toContain('  ');
  });

  it('strips [LO-1.2-3] bracket format from prompts', () => {
    const input = '[LO-1.2-3] Understand basic concepts';
    const result = stripLOCodes(input);
    expect(result).toBe('Understand basic concepts');
    expect(result).not.toContain('LO-');
  });

  it('strips bare LO-code with word boundary', () => {
    const input = 'Refer to LO-3.1-2 for more details';
    const result = stripLOCodes(input);
    expect(result).toBe('Refer to for more details');
    expect(result).not.toContain('LO-');
  });

  it('does not touch words containing LO- as part of another token', () => {
    const input = 'Use HELLO-1.2.3 for configuration';
    expect(stripLOCodes(input)).toBe(input);
  });

  it('is idempotent — running twice yields the same result', () => {
    const input = 'Check **LO-1.3-2** and (LO-2.5-2): in text';
    const once = stripLOCodes(input);
    const twice = stripLOCodes(once);
    expect(twice).toBe(once);
    expect(once).not.toContain('LO-');
  });

  it('handles multiple LO-codes in one document', () => {
    const input = [
      '#### **1. LO-1.2-1: Построить матрицу**',
      '',
      'Текст с **LO-2.5-2** — пояснение.',
      '',
      'Упражнение **(LO-6.4-3)** для практики.',
    ].join('\n');

    const result = stripLOCodes(input);
    expect(result).not.toContain('LO-');
    expect(result).toContain('Построить матрицу');
    expect(result).toContain('пояснение');
    expect(result).toContain('для практики');
  });

  it('preserves paragraph breaks when LO-code is at end of line', () => {
    const input = 'Paragraph about **LO-1.2-3**\n\nNext paragraph starts here.';
    const result = stripLOCodes(input);
    expect(result).toContain('\n\n');
    expect(result).not.toContain('LO-');
    // Trailing space before \n is acceptable artifact (original: "about **LO**\n\n")
    expect(result).toBe('Paragraph about \n\nNext paragraph starts here.');
  });

  it('handles comma-separated LO-codes', () => {
    const input = 'Objectives LO-1.2-3, LO-4.5-6, and more';
    const result = stripLOCodes(input);
    expect(result).not.toContain('LO-');
    expect(result).toContain('and more');
  });

  it('handles real DB example from PPG-9154', () => {
    const input =
      'Используйте полученные знания, чтобы выполнить **LO-1.3-2**. После прохождения этого урока вы сможете применить метод SHS на практике.';
    const result = stripLOCodes(input);
    expect(result).toBe(
      'Используйте полученные знания, чтобы выполнить . После прохождения этого урока вы сможете применить метод SHS на практике.'
    );
    expect(result).not.toContain('LO-');
    expect(result).not.toContain('  ');
  });

  it('handles empty string', () => {
    expect(stripLOCodes('')).toBe('');
  });

  it('handles LO-codes with dotted sub-numbering (LO-6.2.2)', () => {
    const input = '**LO-6.2.2**: Анализ отчетов компании';
    const result = stripLOCodes(input);
    expect(result).toBe('Анализ отчетов компании');
    expect(result).not.toContain('LO-');
  });
});
