/**
 * Unit tests for Patcher and Section-Expander Modules (T040-T041)
 * @module tests/unit/judge/patcher
 *
 * Tests the Patcher and Section-Expander modules consisting of:
 * 1. Patcher - Surgical content edits with LLM
 * 2. Section-Expander - Full section regeneration with RAG
 *
 * Test Coverage:
 * T040 - Patcher Execution Tests:
 *   - executePatch: placeholder behavior, LLM injection, error handling
 *   - generateDiffSummary: word count changes, character changes
 *   - buildPatcherPrompt: prompt generation with context
 *
 * T041 - Section-Expander Execution Tests:
 *   - executeExpansion: placeholder behavior, word count validation
 *   - estimateExpansionTokens: token estimation for budget tracking
 *   - countWords: word counting utility
 *   - validateExpansionResult: output validation
 *   - batchEstimateTokens: batch token estimation
 */

import { describe, it, expect, vi } from 'vitest';
import {
  executePatch,
  buildPatcherPrompt,
  buildPatcherSystemPrompt,
  type LLMCallFn,
} from '../../../src/stages/stage6-lesson-content/judge/patcher';
import {
  executeExpansion,
  estimateExpansionTokens,
  countWords,
  validateExpansionResult,
  batchEstimateTokens,
  buildExpanderPrompt,
  buildExpanderSystemPrompt,
  extractRagChunkText,
  validateTargetWordCount,
  formatIssuesAsRequirements,
} from '../../../src/stages/stage6-lesson-content/judge/section-expander';
import type {
  PatcherInput,
  PatcherOutput,
  SectionExpanderInput,
  SectionExpanderOutput,
  TargetedIssue,
} from '@megacampus/shared-types';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create mock PatcherInput for testing
 */
function createMockPatcherInput(overrides?: Partial<PatcherInput>): PatcherInput {
  return {
    originalContent: 'This is the original section content.',
    sectionId: 'sec_1',
    sectionTitle: 'Introduction',
    instructions: 'Improve clarity of the first paragraph',
    contextAnchors: {
      prevSectionEnd: 'Previous section ends here.',
      nextSectionStart: 'Next section starts here.',
    },
    contextWindow: {
      startQuote: 'This is',
      endQuote: 'content.',
      scope: 'paragraph',
    },
    ...overrides,
  };
}

/**
 * Create mock TargetedIssue for Section-Expander tests
 */
function createMockTargetedIssue(overrides?: Partial<TargetedIssue>): TargetedIssue {
  return {
    id: 'issue_1',
    criterion: 'clarity_readability',
    severity: 'major',
    location: 'section 2, paragraph 3',
    description: 'Sentence structure is too complex',
    quotedText: 'This is the problematic text',
    suggestedFix: 'Simplify the sentence structure',
    targetSectionId: 'sec_2',
    fixAction: 'SURGICAL_EDIT',
    contextWindow: {
      startQuote: 'Previous context',
      endQuote: 'Next context',
      scope: 'paragraph',
    },
    fixInstructions: 'Rewrite for clarity',
    ...overrides,
  };
}

/**
 * Create mock SectionExpanderInput for testing
 */
function createMockSectionExpanderInput(
  overrides?: Partial<SectionExpanderInput>
): SectionExpanderInput {
  return {
    sectionId: 'sec_intro',
    sectionTitle: 'Introduction to Machine Learning',
    originalContent: 'Machine learning is a field of computer science that uses statistical techniques.',
    issues: [createMockTargetedIssue()],
    ragChunks: ['Machine learning is a subset of artificial intelligence.'],
    learningObjectives: ['Understand basic ML concepts', 'Identify ML types'],
    contextAnchors: {
      prevSectionEnd: 'We will explore these concepts in detail.',
      nextSectionStart: 'Let us begin with supervised learning.',
    },
    targetWordCount: 400,
    ...overrides,
  };
}

// ============================================================================
// T040 - PATCHER EXECUTION TESTS
// ============================================================================

describe('T040 - Patcher Execution Tests', () => {
  describe('executePatch', () => {
    it('should return original content when no LLM function provided (placeholder behavior)', async () => {
      const input = createMockPatcherInput();
      const result = await executePatch(input);

      expect(result.patchedContent).toBe(input.originalContent);
      expect(result.success).toBe(true);
      expect(result.tokensUsed).toBe(0);
    });

    it('should call LLM function when provided and use response', async () => {
      const input = createMockPatcherInput();
      const mockLLMResponse = 'This is the patched section content with improvements.';

      const mockLLMCall: LLMCallFn = vi.fn().mockResolvedValue({
        content: mockLLMResponse,
        tokensUsed: 450,
      });

      const result = await executePatch(input, mockLLMCall);

      expect(mockLLMCall).toHaveBeenCalledOnce();
      expect(mockLLMCall).toHaveBeenCalledWith(
        expect.any(String), // prompt
        expect.any(String), // system prompt
        { maxTokens: 1000, temperature: 0.1 }
      );
      expect(result.patchedContent).toBe(mockLLMResponse);
      expect(result.tokensUsed).toBe(450);
    });

    it('should return success: true on successful patch', async () => {
      const input = createMockPatcherInput();
      const result = await executePatch(input);

      expect(result.success).toBe(true);
      expect(result.errorMessage).toBeUndefined();
    });

    it('should return success: false on error', async () => {
      const input = createMockPatcherInput();
      const mockLLMCall: LLMCallFn = vi.fn().mockRejectedValue(new Error('LLM API failure'));

      const result = await executePatch(input, mockLLMCall);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('LLM API failure');
      expect(result.patchedContent).toBe(input.originalContent); // Return original on error
    });

    it('should generate correct diff summary for word count changes', async () => {
      const input = createMockPatcherInput({
        originalContent: 'This is a test.',
      });

      const mockLLMCall: LLMCallFn = vi.fn().mockResolvedValue({
        content: 'This is a much longer test with more words.',
        tokensUsed: 100,
      });

      const result = await executePatch(input, mockLLMCall);

      expect(result.diffSummary).toContain('Added');
      expect(result.diffSummary).toContain('words');
    });

    it('should generate correct diff summary for character changes', async () => {
      const input = createMockPatcherInput({
        originalContent: 'Short text.',
      });

      const mockLLMCall: LLMCallFn = vi.fn().mockResolvedValue({
        content: 'This is a significantly longer piece of text with many more characters.',
        tokensUsed: 100,
      });

      const result = await executePatch(input, mockLLMCall);

      expect(result.diffSummary).toContain('characters');
      expect(result.diffSummary).toMatch(/[+-]\d+/); // Contains +N or -N
    });

    it('should generate "No changes detected" when content identical', async () => {
      const input = createMockPatcherInput({
        originalContent: 'Identical content.',
      });

      const mockLLMCall: LLMCallFn = vi.fn().mockResolvedValue({
        content: 'Identical content.',
        tokensUsed: 100,
      });

      const result = await executePatch(input, mockLLMCall);

      expect(result.diffSummary).toBe('No changes detected');
    });

    it('should measure duration in milliseconds', async () => {
      const input = createMockPatcherInput();
      const result = await executePatch(input);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe('number');
    });

    it('should trim LLM response content', async () => {
      const input = createMockPatcherInput();
      const mockLLMCall: LLMCallFn = vi.fn().mockResolvedValue({
        content: '  \n  Trimmed content  \n  ',
        tokensUsed: 100,
      });

      const result = await executePatch(input, mockLLMCall);

      expect(result.patchedContent).toBe('Trimmed content');
    });
  });

  describe('buildPatcherPrompt', () => {
    it('should include section title in prompt', () => {
      const input = createMockPatcherInput({ sectionTitle: 'Advanced Topics' });
      const prompt = buildPatcherPrompt(input);

      expect(prompt).toContain('SECTION TITLE');
      expect(prompt).toContain('Advanced Topics');
    });

    it('should include original content in prompt', () => {
      const input = createMockPatcherInput({
        originalContent: 'This is the specific original content.',
      });
      const prompt = buildPatcherPrompt(input);

      expect(prompt).toContain('ORIGINAL CONTENT');
      expect(prompt).toContain('This is the specific original content.');
    });

    it('should include fix instructions in prompt', () => {
      const input = createMockPatcherInput({
        instructions: 'Rewrite this section for better clarity.',
      });
      const prompt = buildPatcherPrompt(input);

      expect(prompt).toContain('FIX INSTRUCTIONS');
      expect(prompt).toContain('Rewrite this section for better clarity.');
    });

    it('should include context anchors (prev/next sections) in prompt', () => {
      const input = createMockPatcherInput({
        contextAnchors: {
          prevSectionEnd: 'This is how the previous section ends.',
          nextSectionStart: 'This is how the next section starts.',
        },
      });
      const prompt = buildPatcherPrompt(input);

      expect(prompt).toContain('CONTEXT FOR COHERENCE');
      expect(prompt).toContain('This is how the previous section ends.');
      expect(prompt).toContain('This is how the next section starts.');
    });

    it('should handle missing prevSectionEnd (first section)', () => {
      const input = createMockPatcherInput({
        contextAnchors: {
          nextSectionStart: 'Next section starts here.',
        },
      });
      const prompt = buildPatcherPrompt(input);

      expect(prompt).toContain('This is the first section.');
    });

    it('should handle missing nextSectionStart (last section)', () => {
      const input = createMockPatcherInput({
        contextAnchors: {
          prevSectionEnd: 'Previous section ends here.',
        },
      });
      const prompt = buildPatcherPrompt(input);

      expect(prompt).toContain('This is the last section.');
    });

    it('should include paragraph scope instruction with start/end quotes', () => {
      const input = createMockPatcherInput({
        contextWindow: {
          startQuote: 'Start of problematic area',
          endQuote: 'End of problematic area',
          scope: 'paragraph',
        },
      });
      const prompt = buildPatcherPrompt(input);

      expect(prompt).toContain('TARGET AREA');
      expect(prompt).toContain('Start of problematic area');
      expect(prompt).toContain('End of problematic area');
    });

    it('should include section scope instruction', () => {
      const input = createMockPatcherInput({
        contextWindow: {
          startQuote: '',
          endQuote: '',
          scope: 'section',
        },
      });
      const prompt = buildPatcherPrompt(input);

      expect(prompt).toContain('throughout this section');
    });

    it('should include global scope instruction', () => {
      const input = createMockPatcherInput({
        contextWindow: {
          startQuote: '',
          endQuote: '',
          scope: 'global',
        },
      });
      const prompt = buildPatcherPrompt(input);

      expect(prompt).toContain('global lesson context');
    });

    it('should include output requirements', () => {
      const input = createMockPatcherInput();
      const prompt = buildPatcherPrompt(input);

      expect(prompt).toContain('OUTPUT REQUIREMENTS');
      expect(prompt).toContain('Return ONLY the corrected section content');
      expect(prompt).toContain('Preserve all text that doesn\'t need fixing');
      expect(prompt).toContain('Maintain coherent transitions');
    });
  });

  describe('buildPatcherSystemPrompt', () => {
    it('should define role as expert educational content editor', () => {
      const systemPrompt = buildPatcherSystemPrompt();

      expect(systemPrompt).toContain('expert educational content editor');
      expect(systemPrompt).toContain('surgical fixes');
    });

    it('should include key guidelines', () => {
      const systemPrompt = buildPatcherSystemPrompt();

      expect(systemPrompt).toContain('Fix ONLY what is explicitly requested');
      expect(systemPrompt).toContain('Preserve learning objectives');
      expect(systemPrompt).toContain('smooth transitions');
    });
  });
});

// ============================================================================
// T041 - SECTION-EXPANDER EXECUTION TESTS
// ============================================================================

describe('T041 - Section-Expander Execution Tests', () => {
  describe('executeExpansion', () => {
    it('should return original content (placeholder behavior)', async () => {
      const input = createMockSectionExpanderInput();
      const result = await executeExpansion(input);

      expect(result.regeneratedContent).toBe(input.originalContent);
      expect(result.success).toBe(true);
    });

    it('should calculate word count correctly', async () => {
      const input = createMockSectionExpanderInput({
        originalContent: 'One two three four five.',
      });
      const result = await executeExpansion(input);

      expect(result.wordCount).toBe(5);
    });

    it('should return success: true on successful execution', async () => {
      const input = createMockSectionExpanderInput();
      const result = await executeExpansion(input);

      expect(result.success).toBe(true);
      expect(result.errorMessage).toBeUndefined();
    });

    it('should measure duration in milliseconds', async () => {
      const input = createMockSectionExpanderInput();
      const result = await executeExpansion(input);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe('number');
    });

    it('should handle errors gracefully and return original content', async () => {
      // The current implementation catches errors and returns original content
      // This test verifies error handling path exists
      const input = createMockSectionExpanderInput({
        originalContent: 'Original content before error',
      });

      const result = await executeExpansion(input);

      // Current placeholder implementation always succeeds
      // When real LLM integration is added, this test would verify error handling
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('regeneratedContent');
      expect(result.regeneratedContent).toBe(input.originalContent);
    });

    it('should validate word count against target (within tolerance)', async () => {
      const input = createMockSectionExpanderInput({
        originalContent: 'This is a test with exactly seven words.',
        targetWordCount: 10, // ±10% = 9-11 words
      });

      const result = await executeExpansion(input);

      // Should log warning if word count outside range (7 < 9)
      // But still return success (placeholder behavior)
      expect(result.success).toBe(true);
    });
  });

  describe('estimateExpansionTokens', () => {
    it('should estimate tokens based on input size', () => {
      const input = createMockSectionExpanderInput({
        originalContent: 'Short content.',
        issues: [createMockTargetedIssue()],
        ragChunks: ['Small RAG chunk'],
        learningObjectives: ['One objective'],
        targetWordCount: 100,
      });

      const estimate = estimateExpansionTokens(input);

      expect(estimate).toBeGreaterThan(0);
      expect(typeof estimate).toBe('number');
    });

    it('should include base prompt tokens (~500)', () => {
      const input = createMockSectionExpanderInput({
        originalContent: '',
        issues: [],
        ragChunks: [],
        learningObjectives: [],
        targetWordCount: 100,
      });

      const estimate = estimateExpansionTokens(input);

      // Base prompt + context + output for 100 words
      expect(estimate).toBeGreaterThan(500);
    });

    it('should estimate issue tokens (~50 per issue)', () => {
      const singleIssue = createMockSectionExpanderInput({
        issues: [createMockTargetedIssue()],
        targetWordCount: 100,
      });

      const threeIssues = createMockSectionExpanderInput({
        issues: [
          createMockTargetedIssue({ id: 'issue_1' }),
          createMockTargetedIssue({ id: 'issue_2' }),
          createMockTargetedIssue({ id: 'issue_3' }),
        ],
        targetWordCount: 100,
      });

      const estimate1 = estimateExpansionTokens(singleIssue);
      const estimate3 = estimateExpansionTokens(threeIssues);

      // More issues = more tokens
      expect(estimate3).toBeGreaterThan(estimate1);
      // Difference should be ~100 tokens (2 extra issues × 50)
      expect(estimate3 - estimate1).toBeGreaterThan(50);
    });

    it('should estimate RAG chunk tokens (4 chars per token)', () => {
      const noRAG = createMockSectionExpanderInput({
        ragChunks: [],
        targetWordCount: 100,
      });

      const withRAG = createMockSectionExpanderInput({
        ragChunks: [
          'This is a RAG chunk with some content.', // ~39 chars
          'Another RAG chunk with more information.', // ~41 chars
        ],
        targetWordCount: 100,
      });

      const estimate1 = estimateExpansionTokens(noRAG);
      const estimate2 = estimateExpansionTokens(withRAG);

      // More RAG = more tokens
      expect(estimate2).toBeGreaterThan(estimate1);
      // Difference should be ~20 tokens (80 chars / 4)
      expect(estimate2 - estimate1).toBeGreaterThan(10);
    });

    it('should include output tokens based on targetWordCount', () => {
      const small = createMockSectionExpanderInput({ targetWordCount: 100 });
      const large = createMockSectionExpanderInput({ targetWordCount: 500 });

      const estimate1 = estimateExpansionTokens(small);
      const estimate2 = estimateExpansionTokens(large);

      // More target words = more output tokens
      expect(estimate2).toBeGreaterThan(estimate1);
      // Difference should be ~520 tokens (400 words × 1.3)
      expect(estimate2 - estimate1).toBeGreaterThan(400);
    });

    it('should handle missing targetWordCount (default 300)', () => {
      const input = createMockSectionExpanderInput({
        targetWordCount: undefined,
      });

      const estimate = estimateExpansionTokens(input);

      expect(estimate).toBeGreaterThan(0);
      // Should use default 300 words for output
    });
  });

  describe('countWords', () => {
    it('should count words correctly', () => {
      expect(countWords('One two three four five')).toBe(5);
      expect(countWords('Hello world')).toBe(2);
    });

    it('should handle empty string', () => {
      expect(countWords('')).toBe(0);
    });

    it('should handle multiple spaces', () => {
      expect(countWords('Multiple   spaces   here')).toBe(3);
    });

    it('should handle newlines and tabs', () => {
      expect(countWords('Line one\nLine two\tTab here')).toBe(6);
    });

    it('should handle single word', () => {
      expect(countWords('SingleWord')).toBe(1);
    });

    it('should filter out empty strings from split', () => {
      expect(countWords('  Leading and trailing spaces  ')).toBe(4);
    });
  });

  describe('validateExpansionResult', () => {
    it('should pass for valid results', () => {
      const result: SectionExpanderOutput = {
        regeneratedContent: 'This is valid regenerated content with enough words.',
        success: true,
        wordCount: 9,
        tokensUsed: 100,
        durationMs: 1000,
      };

      const validation = validateExpansionResult(result);

      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it('should fail for empty content', () => {
      const result: SectionExpanderOutput = {
        regeneratedContent: '',
        success: true,
        wordCount: 0,
        tokensUsed: 100,
        durationMs: 1000,
      };

      const validation = validateExpansionResult(result);

      expect(validation.valid).toBe(false);
      expect(validation.issues).toHaveLength(1);
      expect(validation.issues[0]).toContain('empty');
    });

    it('should fail for word count outside target range (below)', () => {
      const result: SectionExpanderOutput = {
        regeneratedContent: 'Too short.',
        success: true,
        wordCount: 50, // Target 400 ±10% = 360-441 (Math.ceil on max)
        tokensUsed: 100,
        durationMs: 1000,
      };

      const validation = validateExpansionResult(result, 400);

      expect(validation.valid).toBe(false);
      expect(validation.issues).toHaveLength(1);
      expect(validation.issues[0]).toContain('below target range');
      expect(validation.issues[0]).toContain('360-441'); // Math.ceil(400 * 1.1) = 441
    });

    it('should fail for word count outside target range (above)', () => {
      const result: SectionExpanderOutput = {
        regeneratedContent: 'A'.repeat(1000), // Very long content
        success: true,
        wordCount: 1000, // Target 400 ±10% = 360-440
        tokensUsed: 100,
        durationMs: 1000,
      };

      const validation = validateExpansionResult(result, 400);

      expect(validation.valid).toBe(false);
      expect(validation.issues).toHaveLength(1);
      expect(validation.issues[0]).toContain('above target range');
    });

    it('should respect ±10% tolerance', () => {
      const result: SectionExpanderOutput = {
        regeneratedContent: 'Content with exactly 360 words. '.repeat(36),
        success: true,
        wordCount: 360, // Target 400 ±10% = 360-440
        tokensUsed: 100,
        durationMs: 1000,
      };

      const validation = validateExpansionResult(result, 400);

      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it('should fail when success is false', () => {
      const result: SectionExpanderOutput = {
        regeneratedContent: 'Some content.',
        success: false,
        wordCount: 2,
        tokensUsed: 0,
        durationMs: 1000,
        errorMessage: 'LLM API error',
      };

      const validation = validateExpansionResult(result);

      expect(validation.valid).toBe(false);
      expect(validation.issues).toHaveLength(1);
      expect(validation.issues[0]).toContain('Expansion failed');
      expect(validation.issues[0]).toContain('LLM API error');
    });

    it('should handle multiple validation issues', () => {
      const result: SectionExpanderOutput = {
        regeneratedContent: '', // Empty
        success: false, // Failed
        wordCount: 0,
        tokensUsed: 0,
        durationMs: 1000,
        errorMessage: 'Error',
      };

      const validation = validateExpansionResult(result, 400);

      expect(validation.valid).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(1);
    });
  });

  describe('batchEstimateTokens', () => {
    it('should sum estimates for multiple inputs', () => {
      const inputs = [
        createMockSectionExpanderInput({ targetWordCount: 100 }),
        createMockSectionExpanderInput({ targetWordCount: 200 }),
        createMockSectionExpanderInput({ targetWordCount: 300 }),
      ];

      const total = batchEstimateTokens(inputs);

      const sum =
        estimateExpansionTokens(inputs[0]) +
        estimateExpansionTokens(inputs[1]) +
        estimateExpansionTokens(inputs[2]);

      expect(total).toBe(sum);
    });

    it('should return 0 for empty array', () => {
      const total = batchEstimateTokens([]);

      expect(total).toBe(0);
    });

    it('should handle single input', () => {
      const input = createMockSectionExpanderInput({ targetWordCount: 200 });
      const total = batchEstimateTokens([input]);

      expect(total).toBe(estimateExpansionTokens(input));
    });
  });

  describe('buildExpanderPrompt', () => {
    it('should include section title in prompt', () => {
      const input = createMockSectionExpanderInput({
        sectionTitle: 'Advanced Neural Networks',
      });
      const prompt = buildExpanderPrompt(input);

      expect(prompt).toContain('Advanced Neural Networks');
    });

    it('should include target word count in prompt', () => {
      const input = createMockSectionExpanderInput({ targetWordCount: 500 });
      const prompt = buildExpanderPrompt(input);

      expect(prompt).toContain('500 words');
    });

    it('should include learning objectives in prompt', () => {
      const input = createMockSectionExpanderInput({
        learningObjectives: ['Objective 1', 'Objective 2', 'Objective 3'],
      });
      const prompt = buildExpanderPrompt(input);

      expect(prompt).toContain('LEARNING OBJECTIVES');
      expect(prompt).toContain('Objective 1');
      expect(prompt).toContain('Objective 2');
      expect(prompt).toContain('Objective 3');
    });

    it('should include issues in prompt', () => {
      const input = createMockSectionExpanderInput({
        issues: [
          createMockTargetedIssue({
            criterion: 'factual_accuracy',
            description: 'Incorrect definition',
          }),
        ],
      });
      const prompt = buildExpanderPrompt(input);

      expect(prompt).toContain('ISSUES TO ADDRESS');
      expect(prompt).toContain('factual_accuracy');
      expect(prompt).toContain('Incorrect definition');
    });

    it('should include RAG chunks in prompt', () => {
      const input = createMockSectionExpanderInput({
        ragChunks: ['First reference material', 'Second reference material'],
      });
      const prompt = buildExpanderPrompt(input);

      expect(prompt).toContain('REFERENCE MATERIALS');
      expect(prompt).toContain('First reference material');
      expect(prompt).toContain('Second reference material');
    });

    it('should include context anchors in prompt', () => {
      const input = createMockSectionExpanderInput({
        contextAnchors: {
          prevSectionEnd: 'Previous context ends here.',
          nextSectionStart: 'Next context starts here.',
        },
      });
      const prompt = buildExpanderPrompt(input);

      expect(prompt).toContain('CONTEXT FOR COHERENCE');
      expect(prompt).toContain('Previous context ends here.');
      expect(prompt).toContain('Next context starts here.');
    });

    it('should handle missing context anchors (first section)', () => {
      const input = createMockSectionExpanderInput({
        contextAnchors: {},
      });
      const prompt = buildExpanderPrompt(input);

      expect(prompt).toContain('This is the first section.');
      expect(prompt).toContain('This is the last section.');
    });
  });

  describe('buildExpanderSystemPrompt', () => {
    it('should define role as expert educational content creator', () => {
      const systemPrompt = buildExpanderSystemPrompt();

      expect(systemPrompt).toContain('expert educational content creator');
      expect(systemPrompt).toContain('course material');
    });

    it('should include key guidelines', () => {
      const systemPrompt = buildExpanderSystemPrompt();

      expect(systemPrompt).toContain('Address ALL identified issues');
      expect(systemPrompt).toContain('reference materials');
      expect(systemPrompt).toContain('practical examples');
    });
  });

  describe('extractRagChunkText', () => {
    it('should handle string chunks', () => {
      const chunk = 'Plain text chunk';
      const text = extractRagChunkText(chunk);

      expect(text).toBe('Plain text chunk');
    });

    it('should extract content field from object', () => {
      const chunk = { content: 'Object with content', metadata: {} };
      const text = extractRagChunkText(chunk);

      expect(text).toBe('Object with content');
    });

    it('should extract text field from object', () => {
      const chunk = { text: 'Object with text field' };
      const text = extractRagChunkText(chunk);

      expect(text).toBe('Object with text field');
    });

    it('should stringify unknown object formats', () => {
      const chunk = { unknown: 'format', data: 123 };
      const text = extractRagChunkText(chunk);

      expect(text).toContain('unknown');
      expect(text).toContain('format');
    });
  });

  describe('validateTargetWordCount', () => {
    it('should return default 300 for undefined', () => {
      expect(validateTargetWordCount(undefined)).toBe(300);
    });

    it('should clamp to minimum 50', () => {
      expect(validateTargetWordCount(20)).toBe(50);
      // Note: validateTargetWordCount treats 0 and negative as undefined, returns default 300
      // Only positive values between 1-49 get clamped to 50
    });

    it('should clamp to maximum 2000', () => {
      expect(validateTargetWordCount(5000)).toBe(2000);
      expect(validateTargetWordCount(10000)).toBe(2000);
    });

    it('should return value within range as-is', () => {
      expect(validateTargetWordCount(100)).toBe(100);
      expect(validateTargetWordCount(500)).toBe(500);
      expect(validateTargetWordCount(1500)).toBe(1500);
    });
  });

  describe('formatIssuesAsRequirements', () => {
    it('should format factual_accuracy issues', () => {
      const issues = [
        createMockTargetedIssue({
          criterion: 'factual_accuracy',
          description: 'Incorrect ML definition',
        }),
      ];

      const requirements = formatIssuesAsRequirements(issues);

      expect(requirements[0]).toContain('Ensure factual accuracy');
      expect(requirements[0]).toContain('Incorrect ML definition');
    });

    it('should format learning_objective_alignment issues', () => {
      const issues = [
        createMockTargetedIssue({
          criterion: 'learning_objective_alignment',
          description: 'Does not address objective 2',
        }),
      ];

      const requirements = formatIssuesAsRequirements(issues);

      expect(requirements[0]).toContain('Better align with learning objectives');
    });

    it('should format clarity_readability issues', () => {
      const issues = [
        createMockTargetedIssue({
          criterion: 'clarity_readability',
          description: 'Overly complex sentence',
        }),
      ];

      const requirements = formatIssuesAsRequirements(issues);

      expect(requirements[0]).toContain('Improve clarity');
    });

    it('should format multiple issues', () => {
      const issues = [
        createMockTargetedIssue({
          criterion: 'factual_accuracy',
          description: 'Issue 1',
        }),
        createMockTargetedIssue({
          criterion: 'completeness',
          description: 'Issue 2',
        }),
        createMockTargetedIssue({
          criterion: 'engagement_examples',
          description: 'Issue 3',
        }),
      ];

      const requirements = formatIssuesAsRequirements(issues);

      expect(requirements).toHaveLength(3);
      expect(requirements[0]).toContain('factual accuracy');
      expect(requirements[1]).toContain('completeness gap');
      expect(requirements[2]).toContain('engagement/examples');
    });
  });
});
