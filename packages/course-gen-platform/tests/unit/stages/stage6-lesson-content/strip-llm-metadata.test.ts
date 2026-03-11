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
import { stripLLMMetadata } from '../../../../src/stages/stage6-lesson-content/judge/strip-metadata';

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
