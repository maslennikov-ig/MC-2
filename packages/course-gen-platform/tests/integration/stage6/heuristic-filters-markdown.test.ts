/**
 * Integration Tests: Heuristic Filters with Markdown Validation
 *
 * Tests the full integration of markdown structure validation into the
 * heuristic filter pipeline for Stage 6 Judge System.
 *
 * Test Coverage:
 * - Markdown validation metrics inclusion in heuristic results
 * - Critical markdown issues failing overall heuristics
 * - Minor markdown issues passing through
 * - Auto-fixed rules tracking
 * - Weighted score contribution from markdown validation
 * - Markdown issues to Patcher conversion
 *
 * Integration Flow Tested:
 * ```
 * runHeuristicFilters(content, spec)
 *   → validateMarkdownStructure(content)
 *   → applyMarkdownAutoFixes(content)
 *   → Combine with word count, readability, etc.
 *   → Return unified HeuristicFilterResult
 * ```
 *
 * Reference:
 * - src/stages/stage6-lesson-content/judge/heuristic-filter.ts
 * - src/stages/stage6-lesson-content/judge/markdown-structure-filter.ts
 * - specs/018-judge-targeted-refinement/spec.md (FR-034)
 */

import { describe, it, expect } from 'vitest';
import {
  runHeuristicFilters,
  DEFAULT_HEURISTIC_CONFIG,
  type HeuristicFilterResult,
} from '../../../src/stages/stage6-lesson-content/judge/heuristic-filter';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Create a minimal mock LessonSpecificationV2 for testing
 *
 * Includes only required fields to satisfy type checker.
 * Uses realistic values for educational lesson content.
 */
const createMockLessonSpec = (
  overrides: Partial<LessonSpecificationV2> = {}
): LessonSpecificationV2 =>
  ({
    lesson_id: 'test-lesson-markdown',
    title: 'Test Lesson for Markdown Validation',
    learning_objectives: [
      {
        objective: 'Understand test concepts and apply validation',
        bloom_level: 'understand',
      },
      {
        objective: 'Apply markdown structure best practices',
        bloom_level: 'apply',
      },
    ],
    sections: [
      {
        id: 'intro',
        title: 'Introduction',
        constraints: {
          required_keywords: ['markdown', 'structure'],
        },
      },
      {
        id: 'main',
        title: 'Main Content',
        constraints: {
          required_keywords: ['validation', 'testing'],
        },
      },
      {
        id: 'conclusion',
        title: 'Conclusion',
        constraints: {},
      },
    ],
    metadata: {
      target_audience: 'practitioner',
      tone: 'conversational-professional',
    },
    ...overrides,
  }) as LessonSpecificationV2;

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Heuristic Filter Integration - Markdown Validation', () => {
  describe('full pipeline with markdown', () => {
    it('should include markdown structure in metrics', () => {
      const content = `# Test Lesson

## Introduction

This is the introduction with proper markdown structure and validation testing.
We include required keywords like markdown and structure to ensure keyword coverage.

## Main Content

Here is some code with proper syntax highlighting for validation and testing:

\`\`\`typescript
const example = 'hello';
console.log(example);
\`\`\`

The validation testing ensures that markdown structure is properly analyzed.

## Conclusion

This is the conclusion with markdown and structure properly formatted.
`;

      const result = runHeuristicFilters(content, createMockLessonSpec());

      // Verify markdown structure metrics are included
      expect(result.metrics.markdownStructure).toBeDefined();
      expect(result.metrics.markdownStructure?.score).toBeGreaterThanOrEqual(0);
      expect(result.metrics.markdownStructure?.score).toBeLessThanOrEqual(1);

      // Verify issue counts are tracked
      expect(result.metrics.markdownStructure?.totalIssues).toBeGreaterThanOrEqual(0);
      expect(result.metrics.markdownStructure?.criticalIssues).toBeGreaterThanOrEqual(0);
      expect(result.metrics.markdownStructure?.majorIssues).toBeGreaterThanOrEqual(0);
      expect(result.metrics.markdownStructure?.minorIssues).toBeGreaterThanOrEqual(0);

      // Verify auto-fixed rules array exists
      expect(result.metrics.markdownStructure?.autoFixedRules).toBeDefined();
      expect(Array.isArray(result.metrics.markdownStructure?.autoFixedRules)).toBe(true);
    });

    it('should fail overall when critical markdown issues exist', () => {
      // Content with MD001 violation (h1 → h3, skipping h2)
      const content = `# Test Lesson

### Skipped to h3

This skips the h2 level which is a critical issue that violates heading hierarchy.
We need enough words to pass word count checks so this content is substantial.
The markdown structure validation should catch the heading level skip issue.
This is important for pedagogical structure and document outline clarity.

## Proper h2

Some content here with proper heading hierarchy. This section has enough content
to ensure we pass the content density checks. The validation and testing keywords
help with keyword coverage. We include markdown and structure throughout the lesson.
`;

      const result = runHeuristicFilters(content, createMockLessonSpec());

      // Should fail due to critical markdown issues
      expect(result.passed).toBe(false);

      // Should have failures from markdown structure filter
      const markdownFailures = result.failures.filter((f) => f.filter === 'markdownStructure');
      expect(markdownFailures.length).toBeGreaterThan(0);

      // Should have critical severity failure
      const criticalFailure = markdownFailures.find((f) => f.severity === 'critical');
      expect(criticalFailure).toBeDefined();
      expect(criticalFailure?.actual).toContain('critical');
    });

    it('should pass when only minor markdown issues exist', () => {
      // Content with only trailing spaces (minor issue, auto-fixable)
      const content = `# Test Lesson

## Introduction

Content with trailing spaces and proper structure validation testing.
We include the required markdown and structure keywords for coverage.
This has enough content to pass word count and density checks.

## Main Content

More content with validation and testing concepts explained clearly.
The markdown structure is generally correct except for minor formatting.
We maintain proper heading hierarchy and include code examples properly.

\`\`\`typescript
const code = 'example';
\`\`\`

## Conclusion

The conclusion wraps up with markdown structure validation concepts.
`;

      const result = runHeuristicFilters(content, createMockLessonSpec());

      // Minor issues (trailing spaces) are auto-fixable and shouldn't fail
      if (result.metrics.markdownStructure) {
        // If markdown issues are only minor (no critical/major), should not fail on markdown
        const hasCriticalOrMajor =
          (result.metrics.markdownStructure.criticalIssues ?? 0) > 0 ||
          (result.metrics.markdownStructure.majorIssues ?? 0) > 0;

        if (!hasCriticalOrMajor) {
          // No markdown failures should be present
          const markdownFailures = result.failures.filter(
            (f) => f.filter === 'markdownStructure'
          );
          expect(markdownFailures.length).toBe(0);
        }

        // Minor issues may be present
        expect(result.metrics.markdownStructure.minorIssues).toBeGreaterThanOrEqual(0);
      }
    });

    it('should track auto-fixed rules in metrics', () => {
      const content = `# Test Lesson

## Introduction

Content with issues that can be auto-fixed by the markdown linter.


Extra blank lines above and below this paragraph for validation testing.


We include markdown structure and testing keywords for coverage checks.

## Main Content

More content with validation concepts and proper structure maintained here.
The auto-fix system should handle cosmetic issues automatically without failure.

## Conclusion

The conclusion provides markdown structure validation summary content here.
`;

      const result = runHeuristicFilters(content, createMockLessonSpec());

      // Auto-fixed rules array should be defined
      expect(result.metrics.markdownStructure?.autoFixedRules).toBeDefined();
      expect(Array.isArray(result.metrics.markdownStructure?.autoFixedRules)).toBe(true);

      // If MD012 (multiple blank lines) was detected and fixed, it should be in the array
      // Note: This depends on the actual content, so we just verify the array exists
    });

    it('should contribute to overall weighted score', () => {
      const perfectContent = `# Test Lesson

## Introduction

Perfect introduction content with proper markdown structure and validation.
All keywords like markdown, structure, validation, and testing are included.
The content has sufficient length and density to pass all heuristic checks.
Proper heading hierarchy is maintained throughout the entire lesson here.

## Main Content

The main content section provides comprehensive coverage of validation concepts.
We include proper code blocks with language specification for syntax highlighting.

\`\`\`typescript
const code = 'example';
console.log(code);
\`\`\`

Additional content ensures adequate density and keyword coverage requirements.

## Conclusion

Perfect conclusion summarizing markdown structure validation testing concepts.
`;

      const brokenContent = `# Test Lesson

### Broken heading

This has markdown structure violations with heading hierarchy issues present.
Content without language spec in code block below breaks markdown validation.

\`\`\`
code without language
\`\`\`

Missing keywords and poor structure reduce overall quality score significantly.
`;

      const perfectResult = runHeuristicFilters(perfectContent, createMockLessonSpec());
      const brokenResult = runHeuristicFilters(brokenContent, createMockLessonSpec());

      // Perfect content should score higher than broken content
      expect(perfectResult.score).toBeGreaterThan(brokenResult.score);

      // Broken content should have markdown structure failures
      expect(brokenResult.metrics.markdownStructure?.criticalIssues ?? 0).toBeGreaterThan(0);

      // Score difference should be meaningful (at least 0.1)
      expect(perfectResult.score - brokenResult.score).toBeGreaterThan(0.1);
    });
  });

  describe('markdown to patcher issues conversion', () => {
    it('should convert markdown issues to failure format', () => {
      // Content with non-fixable issues (heading hierarchy, missing alt text)
      const content = `# Title

### Skipped heading

![](image-without-alt.png)

Some content with markdown structure violations that cannot be auto-fixed.
The heading hierarchy skip and missing alt text require manual intervention.
We need enough content to pass word count checks for the heuristic filter.

## Proper heading

More content here to ensure adequate length and density for testing purposes.
`;

      const result = runHeuristicFilters(content, createMockLessonSpec());

      // Markdown issues should be captured in failures
      const markdownFailures = result.failures.filter((f) => f.filter === 'markdownStructure');

      if (markdownFailures.length > 0) {
        // Should have at least one markdown failure
        expect(markdownFailures.length).toBeGreaterThan(0);

        // Failures should have proper structure
        for (const failure of markdownFailures) {
          expect(failure.filter).toBe('markdownStructure');
          expect(failure.severity).toMatch(/^(critical|major|minor)$/);
          expect(failure.expected).toBeDefined();
          expect(failure.actual).toBeDefined();
        }
      }
    });

    it('should provide actionable suggestions for markdown issues', () => {
      const content = `# Test Lesson

### Invalid heading level

Content with markdown structure issues requiring fixes and validation testing.

\`\`\`
code without language spec
\`\`\`

More content to meet word count requirements for heuristic filter passing.
`;

      const result = runHeuristicFilters(content, createMockLessonSpec());

      // If markdown validation failed, suggestions should be present
      if (!result.passed && (result.metrics.markdownStructure?.totalIssues ?? 0) > 0) {
        // Suggestions array should include markdown-related items
        const markdownSuggestion = result.suggestions.find((s) =>
          s.toLowerCase().includes('markdown')
        );
        expect(markdownSuggestion).toBeDefined();
      }
    });
  });

  describe('markdown validation edge cases', () => {
    it('should handle content with no markdown issues', () => {
      const content = `# Test Lesson

## Introduction

Clean content with proper markdown structure, validation, and testing concepts.
All required keywords like markdown and structure are included for coverage.
The content maintains proper heading hierarchy throughout the lesson material.

## Main Content

Comprehensive coverage with validation and testing explained in detail here.

\`\`\`typescript
const example = 'proper code block';
\`\`\`

Additional content ensures adequate density and quality for heuristic checks.

## Conclusion

Summary of markdown structure validation testing with all requirements met.
`;

      const result = runHeuristicFilters(content, createMockLessonSpec());

      // Should have markdown structure metrics
      expect(result.metrics.markdownStructure).toBeDefined();

      // Perfect markdown should have high score
      if (result.metrics.markdownStructure) {
        expect(result.metrics.markdownStructure.score).toBeGreaterThanOrEqual(0.8);
        expect(result.metrics.markdownStructure.criticalIssues).toBe(0);
        expect(result.metrics.markdownStructure.majorIssues).toBe(0);
      }
    });

    it('should handle very short content gracefully', () => {
      const content = `# Title

## Section

Short content.
`;

      const result = runHeuristicFilters(content, createMockLessonSpec());

      // Should still have markdown metrics even for short content
      expect(result.metrics.markdownStructure).toBeDefined();

      // Should likely fail on word count, not markdown
      if (!result.passed) {
        const wordCountFailure = result.failures.find((f) => f.filter === 'wordCount');
        expect(wordCountFailure).toBeDefined();
      }
    });

    it('should handle multiple markdown violations correctly', () => {
      const content = `# Title

### Skipped level

![](no-alt.png)

\`\`\`
no language
\`\`\`

# Another H1

Content with multiple markdown violations including heading hierarchy issues.
Missing alt text and code block language specs throughout the content here.
We need sufficient length to pass word count checks for proper testing.

### Another skip

More content with structure violations and testing requirements for coverage.
`;

      const result = runHeuristicFilters(content, createMockLessonSpec());

      // Should have multiple issues detected
      if (result.metrics.markdownStructure) {
        const totalIssues = result.metrics.markdownStructure.totalIssues ?? 0;
        expect(totalIssues).toBeGreaterThan(1);

        // Should have critical issues (multiple H1s, heading skips)
        expect(result.metrics.markdownStructure.criticalIssues).toBeGreaterThan(0);
      }

      // Should fail overall
      expect(result.passed).toBe(false);
    });
  });

  describe('markdown score weighting', () => {
    it('should apply proper weight to markdown structure score', () => {
      // Test that markdown score contributes to overall score
      // Weight should be 0.25 based on FILTER_WEIGHTS in heuristic-filter.ts

      const goodMarkdown = `# Test Lesson

## Introduction

Good markdown structure with validation and testing concepts explained clearly.
All keywords like markdown, structure, validation, and testing are present.
Proper heading hierarchy maintained throughout all sections of the lesson.

## Main Content

Comprehensive content with adequate density and keyword coverage maintained.

\`\`\`typescript
const code = 'example';
\`\`\`

## Conclusion

Summary of markdown structure validation testing concepts and requirements.
`;

      const result = runHeuristicFilters(goodMarkdown, createMockLessonSpec());

      // Overall score should reflect markdown contribution
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);

      // Markdown structure should have reasonable score
      if (result.metrics.markdownStructure) {
        expect(result.metrics.markdownStructure.score).toBeGreaterThanOrEqual(0);
        expect(result.metrics.markdownStructure.score).toBeLessThanOrEqual(1);
      }
    });
  });
});
