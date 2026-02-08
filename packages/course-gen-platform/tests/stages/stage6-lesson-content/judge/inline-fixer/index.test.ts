/**
 * InlineFixer Unit Tests
 * @module tests/stages/stage6-lesson-content/judge/inline-fixer
 *
 * Tests for zero-token surgical fixes module (Stage 6 - P1 Fix)
 *
 * Specification: docs/plans/2026-01-stage6-fixes-test-spec.md Section 2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { TargetedIssue, JudgeCriterion } from '@megacampus/shared-types';
import {
  isEligibleForInlineFix,
  applyInlineFix,
  processInlineFixes,
  type InlineFixResult,
  type ApplyFixResult,
} from '@/stages/stage6-lesson-content/judge/inline-fixer';
import { logger } from '@/shared/logger';

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Factory function for creating test TargetedIssue objects
 */
function createIssue(overrides: Partial<TargetedIssue> = {}): TargetedIssue {
  return {
    id: randomUUID(),
    criterion: 'clarity_readability',
    severity: 'minor',
    location: 'sec_1',
    description: 'Test issue description',
    quotedText: 'test text',
    suggestedFix: 'Test suggested fix',
    inlineReplacement: 'replacement text',
    targetSectionId: 'sec_1',
    fixAction: 'SURGICAL_EDIT',
    contextWindow: { scope: 'paragraph' },
    fixInstructions: 'Test instructions',
    ...overrides,
  };
}

// ============================================================================
// ELIGIBILITY TESTS (Section 2.1)
// ============================================================================

describe('InlineFixer - Eligibility', () => {
  describe('isEligibleForInlineFix', () => {
    it('should return true for issue with quotedText and inlineReplacement', () => {
      const issue = createIssue({
        quotedText: 'синергетический эффект',
        inlineReplacement: 'совместный эффект',
      });

      expect(isEligibleForInlineFix(issue)).toBe(true);
    });

    it('should return false when missing inlineReplacement', () => {
      const issue = createIssue({ inlineReplacement: undefined });
      expect(isEligibleForInlineFix(issue)).toBe(false);
    });

    it('should return false when missing quotedText', () => {
      const issue = createIssue({ quotedText: undefined });
      expect(isEligibleForInlineFix(issue)).toBe(false);
    });

    it('should return false for blacklisted criteria (pedagogical_structure)', () => {
      const issue = createIssue({
        criterion: 'pedagogical_structure' as JudgeCriterion,
        quotedText: 'some text',
        inlineReplacement: 'fixed text',
      });
      expect(isEligibleForInlineFix(issue)).toBe(false);
    });

    it('should return false for blacklisted criteria (engagement_examples)', () => {
      const issue = createIssue({
        criterion: 'engagement_examples' as JudgeCriterion,
        quotedText: 'some text',
        inlineReplacement: 'fixed text',
      });
      expect(isEligibleForInlineFix(issue)).toBe(false);
    });

    it('should return false for blacklisted criteria (completeness)', () => {
      const issue = createIssue({
        criterion: 'completeness' as JudgeCriterion,
        quotedText: 'some text',
        inlineReplacement: 'fixed text',
      });
      expect(isEligibleForInlineFix(issue)).toBe(false);
    });

    it('should return false when replacement is >2x original length', () => {
      const issue = createIssue({
        quotedText: 'short',
        inlineReplacement: 'this is a much much longer replacement text',
      });
      expect(isEligibleForInlineFix(issue)).toBe(false);
    });

    it('should return false when replacement is <50% original length', () => {
      const issue = createIssue({
        quotedText: 'this is a long original text that will be replaced',
        inlineReplacement: 'tiny',
      });
      expect(isEligibleForInlineFix(issue)).toBe(false);
    });

    it('should return false when replacement exceeds 300 chars', () => {
      const issue = createIssue({
        quotedText: 'a'.repeat(250),
        inlineReplacement: 'b'.repeat(350),
      });
      expect(isEligibleForInlineFix(issue)).toBe(false);
    });

    it('should return true for whitelisted criteria (factual_accuracy)', () => {
      const issue = createIssue({
        criterion: 'factual_accuracy' as JudgeCriterion,
        quotedText: 'incorrect fact',
        inlineReplacement: 'correct fact',
      });
      expect(isEligibleForInlineFix(issue)).toBe(true);
    });

    it('should return true when length ratio is exactly 0.5 (boundary)', () => {
      const issue = createIssue({
        quotedText: 'original text here',
        inlineReplacement: 'text here',
      });
      // Length ratio = 9/18 = 0.5
      expect(isEligibleForInlineFix(issue)).toBe(true);
    });

    it('should return true when length ratio is exactly 2.0 (boundary)', () => {
      const issue = createIssue({
        quotedText: 'text',
        inlineReplacement: 'texttext',
      });
      // Length ratio = 8/4 = 2.0
      expect(isEligibleForInlineFix(issue)).toBe(true);
    });

    it('should return true when replacement is exactly 300 chars (boundary)', () => {
      const issue = createIssue({
        quotedText: 'a'.repeat(250),
        inlineReplacement: 'b'.repeat(300),
      });
      expect(isEligibleForInlineFix(issue)).toBe(true);
    });
  });
});

// ============================================================================
// CASCADE SEARCH TESTS (Section 2.2)
// ============================================================================

describe('InlineFixer - Cascade Search', () => {
  describe('applyInlineFix', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should find and replace exact text match', () => {
      const content = 'The синергетический эффект was studied.';
      const issue = createIssue({
        quotedText: 'синергетический эффект',
        inlineReplacement: 'совместный эффект',
      });

      const result = applyInlineFix(content, issue);

      expect(result.success).toBe(true);
      expect(result.content).toBe('The совместный эффект was studied.');
    });

    it('should handle flexible whitespace matching', () => {
      const content = 'The  text   with   extra    spaces  here.';
      const issue = createIssue({
        quotedText: 'text   with   extra    spaces', // Match actual spaces in content
        inlineReplacement: 'normalized text',
      });

      const result = applyInlineFix(content, issue);

      expect(result.success).toBe(true);
      expect(result.content).toContain('normalized text');
    });

    it('should fail when text not found', () => {
      const content = 'Some completely different content.';
      const issue = createIssue({
        quotedText: 'nonexistent text',
        inlineReplacement: 'replacement',
      });

      const result = applyInlineFix(content, issue);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('text_not_found');
      expect(result.content).toBe(content); // Original preserved
    });

    it('should fail when multiple occurrences found', () => {
      const content = 'The word appears here. The word appears again.';
      const issue = createIssue({
        quotedText: 'word appears',
        inlineReplacement: 'term shows',
      });

      const result = applyInlineFix(content, issue);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('multiple_occurrences');
      expect(result.content).toBe(content); // Original preserved
    });

    it('should rollback when markdown integrity is broken (unbalanced bold)', () => {
      const content = 'Text with **bold** formatting.';
      const issue = createIssue({
        quotedText: '**bold**',
        inlineReplacement: '**broken', // Missing closing **
      });

      const result = applyInlineFix(content, issue);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('markdown_broken');
      expect(result.content).toBe(content); // Original preserved
    });

    it('should rollback when markdown integrity is broken (unbalanced code)', () => {
      const content = 'Text with `code` inline.';
      const issue = createIssue({
        quotedText: '`code`',
        inlineReplacement: '`broken', // Missing closing `
      });

      const result = applyInlineFix(content, issue);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('markdown_broken');
      expect(result.content).toBe(content); // Original preserved
    });

    it('should rollback when markdown integrity is broken (unbalanced code blocks)', () => {
      const content = 'Text with ```code block``` here.';
      const issue = createIssue({
        quotedText: '```code block```',
        inlineReplacement: '```broken', // Missing closing ```
      });

      const result = applyInlineFix(content, issue);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('markdown_broken');
      expect(result.content).toBe(content); // Original preserved
    });

    it('should fail when missing inlineReplacement', () => {
      const content = 'Some content here.';
      const issue = createIssue({
        quotedText: 'content',
        inlineReplacement: undefined,
      });

      const result = applyInlineFix(content, issue);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('missing_replacement');
      expect(result.content).toBe(content); // Original preserved
    });

    it('should fail when missing quotedText', () => {
      const content = 'Some content here.';
      const issue = createIssue({
        quotedText: undefined,
        inlineReplacement: 'replacement',
      });

      const result = applyInlineFix(content, issue);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('missing_replacement');
      expect(result.content).toBe(content); // Original preserved
    });

    it('should preserve balanced markdown after successful replacement', () => {
      const content = 'Text with **bold** and `code` here.';
      const issue = createIssue({
        quotedText: 'here',
        inlineReplacement: 'there',
      });

      const result = applyInlineFix(content, issue);

      expect(result.success).toBe(true);
      expect(result.content).toBe('Text with **bold** and `code` there.');
    });

    it('should handle special regex characters in quoted text', () => {
      const content = 'Price is $100 (approx. €90).';
      const issue = createIssue({
        quotedText: '$100 (approx. €90)',
        inlineReplacement: '$120 (approx. €110)',
      });

      const result = applyInlineFix(content, issue);

      expect(result.success).toBe(true);
      expect(result.content).toBe('Price is $120 (approx. €110).');
    });
  });
});

// ============================================================================
// BATCH PROCESSING TESTS (Section 2.3)
// ============================================================================

describe('InlineFixer - Batch Processing', () => {
  describe('processInlineFixes', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should apply multiple inline fixes in sequence', () => {
      const content = 'First typo here. Second typo there.';
      const issues = [
        createIssue({
          id: '1',
          quotedText: 'First typo',
          inlineReplacement: 'First correction',
        }),
        createIssue({
          id: '2',
          quotedText: 'Second typo',
          inlineReplacement: 'Second correction',
        }),
      ];

      const result = processInlineFixes(content, issues);

      expect(result.appliedFixes).toHaveLength(2);
      expect(result.appliedFixes).toEqual(['1', '2']);
      expect(result.failedFixes).toHaveLength(0);
      expect(result.content).toBe('First correction here. Second correction there.');
      expect(result.metrics.tokensSaved).toBe(3000); // 2 * 1500
      expect(result.success).toBe(true);
    });

    it('should return failed fixes for ineligible issues', () => {
      const content = 'Some content here.';
      const issues = [
        createIssue({
          id: '1',
          quotedText: 'Some content',
          inlineReplacement: 'Fixed content',
        }),
        createIssue({
          id: '2',
          criterion: 'pedagogical_structure', // Blacklisted
          quotedText: 'here',
          inlineReplacement: 'there',
        }),
      ];

      const result = processInlineFixes(content, issues);

      expect(result.appliedFixes).toHaveLength(1);
      expect(result.appliedFixes).toEqual(['1']);
      expect(result.failedFixes).toHaveLength(1);
      expect(result.failedFixes[0].id).toBe('2');
      expect(result.content).toBe('Fixed content here.');
      expect(result.success).toBe(false); // Not all issues fixed
    });

    it('should calculate correct token savings metrics', () => {
      const content = 'Text A and text B and text C.';
      const issues = [
        createIssue({ id: '1', quotedText: 'Text A', inlineReplacement: 'Item 1' }),
        createIssue({ id: '2', quotedText: 'text B', inlineReplacement: 'item 2' }),
        createIssue({ id: '3', quotedText: 'nonexistent text', inlineReplacement: 'other phrase' }), // Not found but passes eligibility
      ];

      const result = processInlineFixes(content, issues);

      // 'attempted' counts only eligible issues that pass isEligibleForInlineFix
      expect(result.metrics.attempted).toBe(3);
      expect(result.metrics.succeeded).toBe(2);
      expect(result.metrics.failed).toBe(1); // Issue 3 failed (text not found)
      expect(result.metrics.tokensSaved).toBe(3000); // 2 * 1500
      expect(result.appliedFixes).toHaveLength(2);
      expect(result.failedFixes).toHaveLength(1);
    });

    it('should handle all issues being ineligible', () => {
      const content = 'Some content here.';
      const issues = [
        createIssue({
          id: '1',
          criterion: 'pedagogical_structure', // Blacklisted
          quotedText: 'content',
          inlineReplacement: 'text',
        }),
        createIssue({
          id: '2',
          criterion: 'engagement_examples', // Blacklisted
          quotedText: 'here',
          inlineReplacement: 'there',
        }),
      ];

      const result = processInlineFixes(content, issues);

      expect(result.appliedFixes).toHaveLength(0);
      expect(result.failedFixes).toHaveLength(2);
      expect(result.metrics.attempted).toBe(0);
      expect(result.metrics.succeeded).toBe(0);
      expect(result.metrics.failed).toBe(0);
      expect(result.metrics.tokensSaved).toBe(0);
      expect(result.content).toBe(content); // Unchanged
      expect(result.success).toBe(false);
    });

    it('should handle empty issues array', () => {
      const content = 'Some content here.';
      const issues: TargetedIssue[] = [];

      const result = processInlineFixes(content, issues);

      expect(result.appliedFixes).toHaveLength(0);
      expect(result.failedFixes).toHaveLength(0);
      expect(result.metrics.attempted).toBe(0);
      expect(result.metrics.succeeded).toBe(0);
      expect(result.metrics.failed).toBe(0);
      expect(result.metrics.tokensSaved).toBe(0);
      expect(result.content).toBe(content); // Unchanged
      expect(result.success).toBe(true); // No failures
    });

    it('should handle all issues being successful', () => {
      const content = 'First issue. Second issue. Third issue.';
      const issues = [
        createIssue({ id: '1', quotedText: 'First issue', inlineReplacement: 'First fixed' }),
        createIssue({ id: '2', quotedText: 'Second issue', inlineReplacement: 'Second fixed' }),
        createIssue({ id: '3', quotedText: 'Third issue', inlineReplacement: 'Third fixed' }),
      ];

      const result = processInlineFixes(content, issues);

      expect(result.appliedFixes).toHaveLength(3);
      expect(result.failedFixes).toHaveLength(0);
      expect(result.metrics.attempted).toBe(3);
      expect(result.metrics.succeeded).toBe(3);
      expect(result.metrics.failed).toBe(0);
      expect(result.metrics.tokensSaved).toBe(4500); // 3 * 1500
      expect(result.content).toBe('First fixed. Second fixed. Third fixed.');
      expect(result.success).toBe(true);
    });

    it('should fail subsequent fixes when earlier fix causes text not found', () => {
      const content = 'The word appears once.';
      const issues = [
        createIssue({ id: '1', quotedText: 'word', inlineReplacement: 'term' }),
        createIssue({ id: '2', quotedText: 'word', inlineReplacement: 'phrase' }), // Will fail
      ];

      const result = processInlineFixes(content, issues);

      expect(result.appliedFixes).toHaveLength(1);
      expect(result.appliedFixes).toEqual(['1']);
      expect(result.failedFixes).toHaveLength(1);
      expect(result.failedFixes[0].id).toBe('2');
      expect(result.content).toBe('The term appears once.');
      expect(result.metrics.succeeded).toBe(1);
      expect(result.metrics.failed).toBe(1);
    });

    it('should handle mixed eligibility and success states', () => {
      const content = 'Text A and Text B and Text C.';
      const issues = [
        createIssue({ id: '1', quotedText: 'Text A', inlineReplacement: 'Item 1' }), // Success
        createIssue({
          id: '2',
          criterion: 'pedagogical_structure', // Ineligible (blacklisted)
          quotedText: 'Text B',
          inlineReplacement: 'Item 2',
        }),
        createIssue({ id: '3', quotedText: 'nonexistent text', inlineReplacement: 'other phrase' }), // Eligible but fails (text not found)
        createIssue({ id: '4', quotedText: 'Text C', inlineReplacement: 'Item 3' }), // Success
      ];

      const result = processInlineFixes(content, issues);

      expect(result.appliedFixes).toHaveLength(2);
      expect(result.appliedFixes).toEqual(['1', '4']);
      expect(result.failedFixes).toHaveLength(2);
      expect(result.failedFixes.map(f => f.id)).toEqual(['2', '3']);
      expect(result.metrics.attempted).toBe(3); // Only 1, 3, 4 attempted (not 2, ineligible)
      expect(result.metrics.succeeded).toBe(2);
      expect(result.metrics.failed).toBe(1); // Issue 3 failed
      expect(result.metrics.tokensSaved).toBe(3000);
    });
  });
});

// ============================================================================
// LOGGING TESTS
// ============================================================================

describe('InlineFixer - Logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should log debug message when text not found', () => {
    const loggerDebugSpy = vi.spyOn(logger, 'debug');
    const content = 'Some content here.';
    const issue = createIssue({
      id: 'test-id-123',
      quotedText: 'nonexistent',
      inlineReplacement: 'replacement',
    });

    applyInlineFix(content, issue);

    expect(loggerDebugSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: 'test-id-123',
        quotedText: expect.any(String),
      }),
      expect.stringContaining('text not found')
    );
  });

  it('should log debug message when multiple occurrences found', () => {
    const loggerDebugSpy = vi.spyOn(logger, 'debug');
    const content = 'word word word';
    const issue = createIssue({
      id: 'test-id-456',
      quotedText: 'word',
      inlineReplacement: 'term',
    });

    applyInlineFix(content, issue);

    expect(loggerDebugSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: 'test-id-456',
        occurrences: 3,
      }),
      expect.stringContaining('multiple occurrences')
    );
  });

  it('should log warn message when markdown integrity broken', () => {
    const loggerWarnSpy = vi.spyOn(logger, 'warn');
    const content = 'Text with **bold** here.';
    const issue = createIssue({
      id: 'test-id-789',
      quotedText: '**bold**',
      inlineReplacement: '**broken',
    });

    applyInlineFix(content, issue);

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: 'test-id-789',
      }),
      expect.stringContaining('markdown')
    );
  });

  it('should log info message when fix applied successfully', () => {
    const loggerInfoSpy = vi.spyOn(logger, 'info');
    const content = 'Test content here.';
    const issue = createIssue({
      id: 'test-id-success',
      criterion: 'clarity_readability',
      quotedText: 'content',
      inlineReplacement: 'text',
    });

    applyInlineFix(content, issue);

    expect(loggerInfoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: 'test-id-success',
        criterion: 'clarity_readability',
        originalLength: 7,
        replacementLength: 4,
        searchMethod: 'exact',
      }),
      expect.stringContaining('successfully applied')
    );
  });

  it('should log info message with batch metrics after processing', () => {
    const loggerInfoSpy = vi.spyOn(logger, 'info');
    const content = 'First text. Second text.';
    const issues = [
      createIssue({ id: '1', quotedText: 'First', inlineReplacement: 'Primary' }),
      createIssue({ id: '2', quotedText: 'Second', inlineReplacement: 'Secondary' }),
    ];

    processInlineFixes(content, issues);

    expect(loggerInfoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        metrics: expect.objectContaining({
          attempted: 2,
          succeeded: 2,
          failed: 0,
          tokensSaved: 3000,
        }),
        appliedFixIds: ['1', '2'],
      }),
      expect.stringContaining('batch processing complete')
    );
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('InlineFixer - Edge Cases', () => {
  it('should handle Unicode text correctly (Cyrillic)', () => {
    const content = 'Синергетический эффект в системе.';
    const issue = createIssue({
      quotedText: 'Синергетический эффект',
      inlineReplacement: 'Совместный эффект',
    });

    const result = applyInlineFix(content, issue);

    expect(result.success).toBe(true);
    expect(result.content).toBe('Совместный эффект в системе.');
  });

  it('should handle Unicode text correctly (CJK)', () => {
    const content = '这是一个测试文本。';
    const issue = createIssue({
      quotedText: '测试文本',
      inlineReplacement: '示例文本',
    });

    const result = applyInlineFix(content, issue);

    expect(result.success).toBe(true);
    expect(result.content).toBe('这是一个示例文本。');
  });

  it('should handle empty content string', () => {
    const content = '';
    const issue = createIssue({
      quotedText: 'text',
      inlineReplacement: 'replacement',
    });

    const result = applyInlineFix(content, issue);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('text_not_found');
  });

  it('should handle very long content (stress test)', () => {
    const content = 'start ' + 'x '.repeat(10000) + 'target text ' + 'y '.repeat(10000) + 'end';
    const issue = createIssue({
      quotedText: 'target text',
      inlineReplacement: 'replaced text',
    });

    const result = applyInlineFix(content, issue);

    expect(result.success).toBe(true);
    expect(result.content).toContain('replaced text');
  });

  it('should handle newlines in quoted text', () => {
    const content = 'Line 1\nLine 2\nLine 3';
    const issue = createIssue({
      quotedText: 'Line 1\nLine 2',
      inlineReplacement: 'First\nSecond',
    });

    const result = applyInlineFix(content, issue);

    expect(result.success).toBe(true);
    expect(result.content).toBe('First\nSecond\nLine 3');
  });

  it('should handle tabs in quoted text', () => {
    const content = 'Col1\tCol2\tCol3';
    const issue = createIssue({
      quotedText: 'Col1\tCol2',
      inlineReplacement: 'Column1\tColumn2',
    });

    const result = applyInlineFix(content, issue);

    expect(result.success).toBe(true);
    expect(result.content).toBe('Column1\tColumn2\tCol3');
  });

  it('should handle replacement at start of content', () => {
    const content = 'Start text in the middle and at the end.';
    const issue = createIssue({
      quotedText: 'Start text',
      inlineReplacement: 'Beginning text',
    });

    const result = applyInlineFix(content, issue);

    expect(result.success).toBe(true);
    expect(result.content).toBe('Beginning text in the middle and at the end.');
  });

  it('should handle replacement at end of content', () => {
    const content = 'Text in the middle and at the end.';
    const issue = createIssue({
      quotedText: 'the end.',
      inlineReplacement: 'the finish.',
    });

    const result = applyInlineFix(content, issue);

    expect(result.success).toBe(true);
    expect(result.content).toBe('Text in the middle and at the finish.');
  });
});
