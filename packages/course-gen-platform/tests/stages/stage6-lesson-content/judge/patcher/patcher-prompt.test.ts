/**
 * Tests for Patcher prompt template
 * @module stages/stage6-lesson-content/judge/patcher/patcher-prompt.test
 */

import { describe, it, expect } from 'vitest';
import { isMarkdownStructureIssue, buildPatcherPrompt } from '../../../../../src/stages/stage6-lesson-content/judge/patcher/patcher-prompt.js';
import type { PatcherInput } from '@megacampus/shared-types';

describe('isMarkdownStructureIssue', () => {
  it('should detect MD001 markdown rule', () => {
    const instructions = 'Fix heading hierarchy (MD001): ensure headings increment by one level';
    expect(isMarkdownStructureIssue(instructions)).toBe(true);
  });

  it('should detect MD040 markdown rule', () => {
    const instructions = 'Add language to code blocks (MD040)';
    expect(isMarkdownStructureIssue(instructions)).toBe(true);
  });

  it('should detect MD025 markdown rule', () => {
    const instructions = 'Remove duplicate H1 heading (MD025)';
    expect(isMarkdownStructureIssue(instructions)).toBe(true);
  });

  it('should detect multiple markdown rules', () => {
    const instructions = 'Fix MD031, MD032, and MD045 violations';
    expect(isMarkdownStructureIssue(instructions)).toBe(true);
  });

  it('should return false for non-markdown instructions', () => {
    const instructions = 'Add more examples to this section';
    expect(isMarkdownStructureIssue(instructions)).toBe(false);
  });

  it('should return false for partial matches', () => {
    const instructions = 'Fix the MD section header'; // MD without digits
    expect(isMarkdownStructureIssue(instructions)).toBe(false);
  });
});

describe('buildPatcherPrompt', () => {
  const baseInput: PatcherInput = {
    sectionTitle: 'Introduction to TypeScript',
    originalContent: 'TypeScript is a typed superset of JavaScript.',
    instructions: 'Add more detail about type safety',
    contextWindow: {
      scope: 'paragraph',
      startQuote: 'TypeScript is',
      endQuote: 'of JavaScript.',
    },
    contextAnchors: {
      prevSectionEnd: 'Previous section ends here.',
      nextSectionStart: 'Next section starts here.',
    },
  };

  it('should include markdown guidance for markdown issues', () => {
    const input: PatcherInput = {
      ...baseInput,
      instructions: 'Fix heading hierarchy (MD001)',
    };

    const prompt = buildPatcherPrompt(input);
    expect(prompt).toContain('MARKDOWN STRUCTURE GUIDANCE');
    expect(prompt).toContain('MD001 (heading increment)');
    expect(prompt).toContain('MD040 (code block language)');
  });

  it('should not include markdown guidance for regular issues', () => {
    const prompt = buildPatcherPrompt(baseInput);
    expect(prompt).not.toContain('MARKDOWN STRUCTURE GUIDANCE');
  });

  it('should include all required sections', () => {
    const prompt = buildPatcherPrompt(baseInput);
    expect(prompt).toContain('SECTION TITLE');
    expect(prompt).toContain('ORIGINAL CONTENT');
    expect(prompt).toContain('FIX INSTRUCTIONS');
    expect(prompt).toContain('CONTEXT FOR COHERENCE');
    expect(prompt).toContain('TARGET AREA');
    expect(prompt).toContain('OUTPUT REQUIREMENTS');
  });
});
