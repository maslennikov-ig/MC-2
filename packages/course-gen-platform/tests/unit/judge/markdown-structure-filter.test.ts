/**
 * Unit tests for Markdown Structure Filter (Phase 10)
 * @module tests/unit/judge/markdown-structure-filter
 *
 * Tests the FREE markdown structure validation that runs BEFORE expensive LLM evaluation.
 * Uses markdownlint library to detect structural issues (headings, code blocks, lists).
 *
 * Test Coverage:
 * - validateMarkdownStructure: Pass/fail logic, scoring, severity classification
 * - applyMarkdownAutoFixes: Auto-fix cosmetic issues (trailing spaces, tabs, blank lines)
 * - toJudgeIssue: Convert markdownlint errors to JudgeIssue format
 *
 * Reference:
 * - specs/018-judge-targeted-refinement/quickstart.md (Phase 10)
 * - specs/018-judge-targeted-refinement/spec.md (FR-034)
 * - src/stages/stage6-lesson-content/judge/markdown-structure-filter.ts
 */

import { describe, it, expect } from 'vitest';
import {
  validateMarkdownStructure,
  applyMarkdownAutoFixes,
  toJudgeIssue,
  type MarkdownStructureResult,
  type MarkdownAutoFixResult,
} from '@/stages/stage6-lesson-content/judge/markdown-structure-filter';
import type { MarkdownLintValidationError } from '@/stages/stage6-lesson-content/judge/markdownlint-config';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create mock MarkdownLintValidationError for testing
 */
function createMockMarkdownError(
  overrides?: Partial<MarkdownLintValidationError>
): MarkdownLintValidationError {
  return {
    lineNumber: 1,
    ruleNames: ['MD001', 'heading-increment'],
    ruleDescription: 'Heading levels should only increment by one level at a time',
    errorDetail: 'Expected: h2; Actual: h3',
    errorContext: '### Skipped to h3',
    errorRange: [0, 15],
    ...overrides,
  };
}

// ============================================================================
// validateMarkdownStructure TESTS
// ============================================================================

describe('validateMarkdownStructure', () => {
  describe('valid markdown', () => {
    it('should pass with perfect score for well-formatted markdown', () => {
      const validMarkdown = `# Main Title

## Section 1

This is a paragraph with proper formatting.

### Subsection 1.1

Here is some content.

- List item 1
- List item 2

\`\`\`typescript
const code = 'example';
\`\`\`

## Section 2

More content here.
`;

      const result: MarkdownStructureResult = validateMarkdownStructure(validMarkdown);

      expect(result.passed).toBe(true);
      expect(result.score).toBe(1.0);
      expect(result.issues).toHaveLength(0);
      expect(result.issuesBySeverity.critical).toHaveLength(0);
      expect(result.issuesBySeverity.major).toHaveLength(0);
      expect(result.issuesBySeverity.minor).toHaveLength(0);
    });

    it('should return empty issues array for valid content', () => {
      const validMarkdown = `# Title

Content here.
`;

      const result = validateMarkdownStructure(validMarkdown);

      expect(result.issues).toEqual([]);
      expect(result.patcherIssues).toEqual([]);
    });
  });

  describe('heading issues', () => {
    it('should detect MD001 (heading increment) as critical', () => {
      const invalidMarkdown = `# Main Title

### Skipped h2 level

Content here.
`;

      const result = validateMarkdownStructure(invalidMarkdown);

      expect(result.passed).toBe(false);
      expect(result.issuesBySeverity.critical.length).toBeGreaterThan(0);

      const md001Issue = result.issues.find((issue) =>
        issue.ruleNames.includes('MD001')
      );
      expect(md001Issue).toBeDefined();
      expect(md001Issue?.ruleDescription).toContain('increment');
    });

    it('should detect MD025 (multiple h1) as critical', () => {
      const invalidMarkdown = `# First Title

Some content.

# Second Title

More content.
`;

      const result = validateMarkdownStructure(invalidMarkdown);

      expect(result.passed).toBe(false);
      expect(result.issuesBySeverity.critical.length).toBeGreaterThan(0);

      const md025Issue = result.issues.find((issue) =>
        issue.ruleNames.includes('MD025')
      );
      expect(md025Issue).toBeDefined();
    });

    it('should fail on critical heading issues', () => {
      const invalidMarkdown = `# Title

### Skipped level

Content.
`;

      const result = validateMarkdownStructure(invalidMarkdown);

      expect(result.passed).toBe(false);
      expect(result.score).toBeLessThan(1.0);
    });
  });

  describe('code block issues', () => {
    it('should detect MD040 (missing code language) as major', () => {
      const invalidMarkdown = `# Title

\`\`\`
const code = 'no language specified';
\`\`\`
`;

      const result = validateMarkdownStructure(invalidMarkdown);

      expect(result.passed).toBe(false);
      expect(result.issuesBySeverity.major.length).toBeGreaterThan(0);

      const md040Issue = result.issues.find((issue) =>
        issue.ruleNames.includes('MD040')
      );
      expect(md040Issue).toBeDefined();
      expect(md040Issue?.ruleDescription).toContain('language');
    });

    it('should detect MD031 (missing blank lines) as major', () => {
      const invalidMarkdown = `# Title
\`\`\`typescript
const code = 'example';
\`\`\`
More content immediately after.
`;

      const result = validateMarkdownStructure(invalidMarkdown);

      expect(result.passed).toBe(false);
      expect(result.issuesBySeverity.major.length).toBeGreaterThan(0);

      const md031Issue = result.issues.find((issue) =>
        issue.ruleNames.includes('MD031')
      );
      expect(md031Issue).toBeDefined();
    });

    it('should fail on major code block issues', () => {
      const invalidMarkdown = `# Title

\`\`\`
const code = 'no language';
\`\`\`
`;

      const result = validateMarkdownStructure(invalidMarkdown);

      expect(result.passed).toBe(false);
      expect(result.score).toBeLessThan(1.0);
    });
  });

  describe('minor issues', () => {
    it('should detect MD009 (trailing spaces) as minor', () => {
      // Note: MD009 config allows 2 trailing spaces for line breaks
      // So we need 3+ spaces or 1 space to trigger the error
      const invalidMarkdown = '# Title\n\nContent with trailing spaces   \n';

      const result = validateMarkdownStructure(invalidMarkdown);

      // Minor issues don't fail validation
      expect(result.passed).toBe(true);
      expect(result.issuesBySeverity.minor.length).toBeGreaterThan(0);

      const md009Issue = result.issues.find((issue) =>
        issue.ruleNames.includes('MD009')
      );
      expect(md009Issue).toBeDefined();
    });

    it('should detect MD010 (hard tabs) as minor', () => {
      // Hard tabs in regular content (not indented code)
      const invalidMarkdown = '# Title\n\nSome\ttabbed\tcontent\n';

      const result = validateMarkdownStructure(invalidMarkdown);

      // Minor issues don't fail validation
      expect(result.passed).toBe(true);
      expect(result.issuesBySeverity.minor.length).toBeGreaterThan(0);

      const md010Issue = result.issues.find((issue) =>
        issue.ruleNames.includes('MD010')
      );
      expect(md010Issue).toBeDefined();
    });

    it('should pass despite minor issues', () => {
      const invalidMarkdown = '# Title\n\nContent  \n\tWith tabs\n';

      const result = validateMarkdownStructure(invalidMarkdown);

      // Minor issues alone don't cause failure
      expect(result.passed).toBe(true);
      expect(result.score).toBeLessThan(1.0); // But score is penalized
      expect(result.issuesBySeverity.critical).toHaveLength(0);
      expect(result.issuesBySeverity.major).toHaveLength(0);
      expect(result.issuesBySeverity.minor.length).toBeGreaterThan(0);
    });
  });

  describe('scoring', () => {
    it('should calculate penalty-based score correctly', () => {
      // MD001 (critical) = 10 penalty
      // Score = 1 - (10 / 100) = 0.9
      const criticalIssue = `# Title

### Skipped h2

Content.
`;

      const result = validateMarkdownStructure(criticalIssue);

      expect(result.score).toBeGreaterThan(0.8);
      expect(result.score).toBeLessThan(1.0);
    });

    it('should clamp score to [0, 1]', () => {
      // Multiple critical issues to potentially exceed penalty limit
      const manyIssues = `# First Title

# Second Title

### Skipped level

\`\`\`
no language
\`\`\`

Content
\tWith tabs
`;

      const result = validateMarkdownStructure(manyIssues);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('should return score of 1.0 for no issues', () => {
      const perfectMarkdown = `# Title

## Section

Content here.
`;

      const result = validateMarkdownStructure(perfectMarkdown);

      expect(result.score).toBe(1.0);
    });
  });

  describe('patcher issues', () => {
    it('should convert non-fixable issues to JudgeIssue format', () => {
      const invalidMarkdown = `# Title

### Skipped h2

Content.
`;

      const result = validateMarkdownStructure(invalidMarkdown);

      expect(result.patcherIssues.length).toBeGreaterThan(0);

      const patcherIssue = result.patcherIssues[0];
      expect(patcherIssue).toHaveProperty('criterion');
      expect(patcherIssue).toHaveProperty('severity');
      expect(patcherIssue).toHaveProperty('location');
      expect(patcherIssue).toHaveProperty('description');
      expect(patcherIssue).toHaveProperty('suggestedFix');
    });

    it('should not include auto-fixable issues in patcherIssues', () => {
      const autoFixableMarkdown = '# Title\n\nContent  \n\tWith tabs\n';

      const result = validateMarkdownStructure(autoFixableMarkdown);

      // MD009 and MD010 are auto-fixable, should not be in patcherIssues
      const md009InPatcher = result.patcherIssues.some((issue) =>
        issue.description.includes('MD009')
      );
      const md010InPatcher = result.patcherIssues.some((issue) =>
        issue.description.includes('MD010')
      );

      expect(md009InPatcher).toBe(false);
      expect(md010InPatcher).toBe(false);
    });
  });

  describe('performance', () => {
    it('should return durationMs', () => {
      const markdown = '# Title\n\nContent.\n';

      const result = validateMarkdownStructure(markdown);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe('number');
    });
  });
});

// ============================================================================
// applyMarkdownAutoFixes TESTS
// ============================================================================

describe('applyMarkdownAutoFixes', () => {
  it('should remove trailing spaces (MD009)', () => {
    // Use 3 trailing spaces (not 2, which is allowed for line breaks)
    const input = '# Title   \n\nContent with trailing spaces   \n';
    const result: MarkdownAutoFixResult = applyMarkdownAutoFixes(input);

    expect(result.fixedRules).toContain('MD009');
    // Should not have 3+ trailing spaces anymore
    expect(result.content).not.toMatch(/   \n/);
    expect(result.content).toContain('# Title');
  });

  it('should convert hard tabs to spaces (MD010)', () => {
    // Tabs in regular content (not indented code blocks)
    const input = '# Title\n\nSome\ttabbed\tcontent\n';
    const result = applyMarkdownAutoFixes(input);

    expect(result.fixedRules).toContain('MD010');
    expect(result.content).not.toContain('\t');
    // Should convert to spaces
    expect(result.content).toContain('Some  tabbed  content');
  });

  it('should collapse multiple blank lines (MD012)', () => {
    const input = '# Title\n\n\n\nContent\n';
    const result = applyMarkdownAutoFixes(input);

    expect(result.fixedRules).toContain('MD012');
    expect(result.content).not.toMatch(/\n\n\n/);
    // Should have max 2 consecutive newlines (1 blank line)
    expect(result.content).toMatch(/# Title\n\nContent/);
  });

  it('should add trailing newline (MD047)', () => {
    const input = '# Title\n\nContent';
    const result = applyMarkdownAutoFixes(input);

    expect(result.fixedRules).toContain('MD047');
    expect(result.content).toMatch(/\n$/);
  });

  it('should NOT fix structural issues like MD001', () => {
    const input = '# Title\n\n### Skipped h2\n'; // MD001 violation
    const result = applyMarkdownAutoFixes(input);

    expect(result.fixedRules).not.toContain('MD001');
    // Content should remain unchanged (still has h3 after h1)
    expect(result.content).toContain('### Skipped h2');
  });

  it('should NOT fix MD040 (missing code language)', () => {
    const input = '# Title\n\n```\nconst code = "example";\n```\n';
    const result = applyMarkdownAutoFixes(input);

    expect(result.fixedRules).not.toContain('MD040');
    // Code block should still be missing language
    expect(result.content).toMatch(/```\n/);
  });

  it('should return empty fixedRules for perfect content', () => {
    const input = '# Title\n\nPerfect content.\n';
    const result = applyMarkdownAutoFixes(input);

    expect(result.fixedRules).toHaveLength(0);
    expect(result.content).toBe(input);
  });

  it('should fix multiple issues at once', () => {
    const input = '# Title   \n\n\n\nSome\ttabbed\tcontent   \n';
    const result = applyMarkdownAutoFixes(input);

    // Should fix MD009, MD010, MD012
    expect(result.fixedRules.length).toBeGreaterThan(0);
    expect(result.content).not.toContain('\t');
    expect(result.content).not.toMatch(/   \n/);
    expect(result.content).not.toMatch(/\n\n\n/);
  });
});

// ============================================================================
// toJudgeIssue TESTS
// ============================================================================

describe('toJudgeIssue', () => {
  it('should map MD001 to pedagogical_structure criterion', () => {
    const error = createMockMarkdownError({
      ruleNames: ['MD001', 'heading-increment'],
      ruleDescription: 'Heading levels should increment by one',
    });

    const judgeIssue = toJudgeIssue(error);

    expect(judgeIssue.criterion).toBe('pedagogical_structure');
  });

  it('should map MD040 to clarity_readability criterion', () => {
    const error = createMockMarkdownError({
      ruleNames: ['MD040', 'fenced-code-language'],
      ruleDescription: 'Fenced code blocks should have a language specified',
    });

    const judgeIssue = toJudgeIssue(error);

    expect(judgeIssue.criterion).toBe('clarity_readability');
  });

  it('should map MD045 to completeness criterion', () => {
    const error = createMockMarkdownError({
      ruleNames: ['MD045', 'no-alt-text'],
      ruleDescription: 'Images should have alternate text (alt text)',
    });

    const judgeIssue = toJudgeIssue(error);

    expect(judgeIssue.criterion).toBe('completeness');
  });

  it('should set severity from rule severity', () => {
    // MD001 is critical
    const criticalError = createMockMarkdownError({
      ruleNames: ['MD001', 'heading-increment'],
    });
    const criticalIssue = toJudgeIssue(criticalError);
    expect(criticalIssue.severity).toBe('critical');

    // MD040 is major
    const majorError = createMockMarkdownError({
      ruleNames: ['MD040', 'fenced-code-language'],
    });
    const majorIssue = toJudgeIssue(majorError);
    expect(majorIssue.severity).toBe('major');

    // MD009 is minor
    const minorError = createMockMarkdownError({
      ruleNames: ['MD009', 'no-trailing-spaces'],
    });
    const minorIssue = toJudgeIssue(minorError);
    expect(minorIssue.severity).toBe('minor');
  });

  it('should include line number in location', () => {
    const error = createMockMarkdownError({
      lineNumber: 42,
    });

    const judgeIssue = toJudgeIssue(error);

    expect(judgeIssue.location).toContain('Line 42');
  });

  it('should include sectionId in location when provided', () => {
    const error = createMockMarkdownError({
      lineNumber: 10,
    });

    const judgeIssue = toJudgeIssue(error, 'section-2');

    expect(judgeIssue.location).toContain('Line 10');
    expect(judgeIssue.location).toContain('section-2');
  });

  it('should provide actionable suggestedFix', () => {
    const error = createMockMarkdownError({
      ruleNames: ['MD001', 'heading-increment'],
    });

    const judgeIssue = toJudgeIssue(error);

    expect(judgeIssue.suggestedFix).toBeDefined();
    expect(judgeIssue.suggestedFix.length).toBeGreaterThan(0);
    expect(judgeIssue.suggestedFix).toContain('heading');
  });

  it('should include errorContext as quotedText', () => {
    const error = createMockMarkdownError({
      errorContext: '### This is the problematic heading',
    });

    const judgeIssue = toJudgeIssue(error);

    expect(judgeIssue.quotedText).toBe('### This is the problematic heading');
  });

  it('should handle missing errorContext gracefully', () => {
    const error = createMockMarkdownError({
      errorContext: null,
    });

    const judgeIssue = toJudgeIssue(error);

    expect(judgeIssue.quotedText).toBeUndefined();
  });

  it('should combine ruleDescription and errorDetail in description', () => {
    const error = createMockMarkdownError({
      ruleDescription: 'Heading levels should increment by one',
      errorDetail: 'Expected: h2; Actual: h3',
    });

    const judgeIssue = toJudgeIssue(error);

    expect(judgeIssue.description).toContain('Heading levels should increment by one');
    expect(judgeIssue.description).toContain('Expected: h2; Actual: h3');
  });

  it('should use only ruleDescription when errorDetail is null', () => {
    const error = createMockMarkdownError({
      ruleDescription: 'Images should have alternate text',
      errorDetail: null,
    });

    const judgeIssue = toJudgeIssue(error);

    expect(judgeIssue.description).toBe('Images should have alternate text');
  });

  it('should provide specific fix suggestions for known rules', () => {
    // Test MD001
    const md001Issue = toJudgeIssue(
      createMockMarkdownError({ ruleNames: ['MD001', 'heading-increment'] })
    );
    expect(md001Issue.suggestedFix).toContain('hierarchy');

    // Test MD040
    const md040Issue = toJudgeIssue(
      createMockMarkdownError({ ruleNames: ['MD040', 'fenced-code-language'] })
    );
    expect(md040Issue.suggestedFix).toContain('language identifier');

    // Test MD045
    const md045Issue = toJudgeIssue(
      createMockMarkdownError({ ruleNames: ['MD045', 'no-alt-text'] })
    );
    expect(md045Issue.suggestedFix).toContain('alt text');
  });

  it('should fallback to generic fix for unknown rules', () => {
    const error = createMockMarkdownError({
      ruleNames: ['MD999', 'unknown-rule'],
    });

    const judgeIssue = toJudgeIssue(error);

    expect(judgeIssue.suggestedFix).toContain('documentation');
  });

  it('should default to clarity_readability for unmapped rules', () => {
    const error = createMockMarkdownError({
      ruleNames: ['MD999', 'unknown-rule'],
    });

    const judgeIssue = toJudgeIssue(error);

    expect(judgeIssue.criterion).toBe('clarity_readability');
  });
});
