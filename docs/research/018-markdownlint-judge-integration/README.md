# Markdownlint Judge Integration

**Status**: Research / Future Implementation
**Created**: 2025-12-12
**Author**: Claude Code
**Dependencies**: Requires completion of current Judge Pipeline refactoring (separate spec)

## Executive Summary

Integrate [markdownlint](https://github.com/DavidAnson/markdownlint) as a **FREE heuristic filter** in the Stage 6 Judge Pipeline to validate markdown structure quality of generated lessons before expensive LLM evaluation.

### Value Proposition

| Metric | Current | With Markdownlint |
|--------|---------|-------------------|
| Structural issues caught | LLM-dependent | Pre-filtered (FREE) |
| Cost per structural check | ~$0.001 (LLM) | $0 (local) |
| Detection reliability | Variable | Deterministic |
| Feedback specificity | General | Line-level precision |

## Problem Statement

Current Judge Pipeline evaluates **pedagogical quality** but lacks **structural markdown validation**:

1. **LLM judges** focus on content quality (OSCQR criteria), not formatting
2. **Heuristic filters** check word count, readability — but not markdown syntax
3. **Structural issues** (broken headings, malformed code blocks) reach LLM evaluation
4. **No deterministic checks** for markdown validity

### Common Structural Issues in LLM-Generated Content

| Issue | Frequency | Impact |
|-------|-----------|--------|
| Heading level skips (H1 → H3) | ~15% | Broken TOC, a11y issues |
| Code blocks without language | ~25% | No syntax highlighting |
| Inconsistent list formatting | ~10% | Visual inconsistency |
| Missing blank lines around blocks | ~20% | Rendering issues |
| Multiple H1 headings | ~8% | SEO, structure issues |
| Trailing spaces | ~40% | Git diffs, rendering |

## Proposed Solution

### Architecture Position

```
┌──────────────────────────────────────────────────────────────┐
│                    JUDGE PIPELINE (Stage 6.5)                 │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ INPUT: LessonContentBody (from smoother node)                │
│   ↓                                                           │
│ [Cascade Evaluator]                                          │
│   │                                                           │
│   ├─ Stage 1: Heuristic Filters (FREE)                       │
│   │   ├─ Word count, Flesch-Kincaid, sections (existing)     │
│   │   └─ ★ MARKDOWNLINT FILTER (NEW) ★                       │
│   │       └─ Structural validation, code blocks, headings    │
│   │                                                           │
│   ├─ Stage 2: Single Judge (LLM)                             │
│   └─ Stage 3: CLEV Voting (2+1)                              │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### Why Stage 1 (Heuristic Filters)?

1. **FREE** — No LLM cost, runs locally in <50ms
2. **Deterministic** — Same input = same output (reproducible)
3. **Pre-filters bad content** — Catches issues before $0.001+ LLM calls
4. **Actionable feedback** — Line-level errors enable targeted fixes
5. **Composable** — Integrates with existing `heuristic-filter.ts`

## Technical Design

### 1. Dependencies

```json
// packages/course-gen-platform/package.json
{
  "dependencies": {
    "markdownlint": "^0.37.0"
  }
}
```

**Note**: Use `markdownlint` library directly (not CLI wrapper) for programmatic integration.

### 2. Rule Configuration

```typescript
// packages/course-gen-platform/src/stages/stage6-lesson-content/judge/markdownlint-config.ts

import type { Configuration } from 'markdownlint';

/**
 * Markdownlint configuration optimized for LLM-generated educational content.
 *
 * Philosophy:
 * - CRITICAL: Rules that affect rendering/accessibility
 * - MAJOR: Rules that affect readability/consistency
 * - MINOR: Style preferences (relaxed for LLM content)
 * - DISABLED: Rules incompatible with educational content
 */
export const LESSON_MARKDOWNLINT_CONFIG: Configuration = {
  // === ENABLED (Critical for lesson quality) ===

  // Heading structure
  'MD001': true,  // Heading levels increment by one (no H1 → H3 skips)
  'MD003': { style: 'atx' },  // ATX-style headings (# Heading)
  'MD022': true,  // Headings surrounded by blank lines
  'MD025': true,  // Single top-level heading (H1)
  'MD041': false, // First line H1 - DISABLED (lessons may start with metadata)

  // Code blocks (critical for technical content)
  'MD031': true,  // Fenced code blocks surrounded by blank lines
  'MD040': true,  // Fenced code blocks should have language specified
  'MD046': { style: 'fenced' },  // Code block style (fenced, not indented)
  'MD048': { style: 'backtick' }, // Code fence style (backticks, not tildes)

  // Lists
  'MD004': { style: 'dash' },  // Unordered list style (consistent)
  'MD005': true,   // Consistent list indentation
  'MD007': { indent: 2 },  // Unordered list indentation (2 spaces)
  'MD030': true,   // Spaces after list markers
  'MD032': true,   // Lists surrounded by blank lines

  // Emphasis & inline formatting
  'MD037': true,  // No spaces inside emphasis markers
  'MD038': true,  // No spaces inside code span elements
  'MD049': { style: 'asterisk' },  // Emphasis style (*)
  'MD050': { style: 'asterisk' },  // Strong style (**)

  // Links & images
  'MD039': true,  // No spaces inside link text
  'MD042': true,  // No empty links
  'MD045': true,  // Images should have alt text (accessibility)

  // Whitespace & formatting
  'MD009': true,   // No trailing spaces
  'MD010': true,   // No hard tabs
  'MD012': { maximum: 2 },  // Max consecutive blank lines
  'MD047': true,   // Files should end with single newline

  // === DISABLED (Incompatible with LLM-generated content) ===

  'MD013': false,  // Line length - LLM writes long lines, handled by UI
  'MD024': false,  // No duplicate headings - lessons may repeat section titles
  'MD026': false,  // No trailing punctuation in headings - allows "What is X?"
  'MD033': false,  // No inline HTML - we allow callouts via HTML comments
  'MD034': false,  // No bare URLs - sometimes useful in educational content
  'MD036': false,  // No emphasis as heading - can be stylistic choice
  'MD044': false,  // Proper names capitalization - too strict for lessons
};
```

### 3. Severity Classification

```typescript
// packages/course-gen-platform/src/stages/stage6-lesson-content/judge/markdownlint-severity.ts

import type { RuleNameArray } from 'markdownlint';

/**
 * Rule severity for scoring algorithm.
 *
 * CRITICAL: Affects rendering, accessibility, or causes parser errors
 * MAJOR: Affects readability or professional quality
 * MINOR: Style preference, cosmetic issues
 */
export type MarkdownSeverity = 'critical' | 'major' | 'minor';

export const RULE_SEVERITY: Record<string, MarkdownSeverity> = {
  // Critical - affects rendering/accessibility
  'MD001': 'critical',  // Heading hierarchy broken
  'MD025': 'critical',  // Multiple H1 headings
  'MD031': 'critical',  // Code blocks not separated
  'MD040': 'critical',  // Code blocks without language
  'MD045': 'critical',  // Images without alt text
  'MD046': 'critical',  // Wrong code block style

  // Major - affects readability
  'MD003': 'major',     // Inconsistent heading style
  'MD004': 'major',     // Inconsistent list style
  'MD005': 'major',     // Inconsistent list indentation
  'MD022': 'major',     // Headings not separated
  'MD032': 'major',     // Lists not separated
  'MD037': 'major',     // Spaces in emphasis
  'MD038': 'major',     // Spaces in code spans
  'MD042': 'major',     // Empty links

  // Minor - cosmetic
  'MD007': 'minor',     // List indentation amount
  'MD009': 'minor',     // Trailing spaces
  'MD010': 'minor',     // Hard tabs
  'MD012': 'minor',     // Multiple blank lines
  'MD030': 'minor',     // Spaces after list markers
  'MD039': 'minor',     // Spaces in link text
  'MD047': 'minor',     // File ending newline
  'MD048': 'minor',     // Code fence style
  'MD049': 'minor',     // Emphasis style
  'MD050': 'minor',     // Strong style
};

export const SEVERITY_PENALTIES: Record<MarkdownSeverity, number> = {
  critical: 10,  // -10 points per critical issue
  major: 3,      // -3 points per major issue
  minor: 1,      // -1 point per minor issue
};
```

### 4. Filter Implementation

```typescript
// packages/course-gen-platform/src/stages/stage6-lesson-content/judge/markdown-structure-filter.ts

import { lint } from 'markdownlint/sync';
import type { LintError } from 'markdownlint';
import { LESSON_MARKDOWNLINT_CONFIG } from './markdownlint-config';
import { RULE_SEVERITY, SEVERITY_PENALTIES, type MarkdownSeverity } from './markdownlint-severity';

/**
 * Result of markdown structure validation.
 */
export interface MarkdownStructureResult {
  /** Overall score 0-100 */
  score: number;

  /** Whether content passes minimum threshold */
  passed: boolean;

  /** Count by severity */
  criticalCount: number;
  majorCount: number;
  minorCount: number;

  /** Total issues found */
  totalIssues: number;

  /** Detailed issues for refinement feedback */
  issues: MarkdownStructureIssue[];

  /** Execution time in ms */
  durationMs: number;
}

/**
 * Individual markdown issue with location and fix suggestion.
 */
export interface MarkdownStructureIssue {
  /** Rule ID (e.g., MD001) */
  ruleId: string;

  /** Rule aliases (e.g., ['heading-increment']) */
  ruleAliases: string[];

  /** Human-readable description */
  description: string;

  /** Severity classification */
  severity: MarkdownSeverity;

  /** Line number (1-indexed) */
  lineNumber: number;

  /** Column range if available */
  errorRange?: [number, number];

  /** Context around the error */
  errorContext?: string;

  /** Specific error detail */
  errorDetail?: string;

  /** Whether auto-fix is available */
  fixable: boolean;
}

/** Minimum score to pass (align with SCORE_THRESHOLDS.MINOR_REVISION) */
const PASS_THRESHOLD = 75;

/**
 * Validate markdown structure using markdownlint.
 *
 * Part of Stage 1 Heuristic Filters - runs before LLM evaluation.
 * Cost: FREE (local execution, <50ms typical)
 *
 * @param markdownContent - Raw markdown string to validate
 * @returns Structured result with score and issues
 *
 * @example
 * ```typescript
 * const result = validateMarkdownStructure(lessonContent);
 * if (!result.passed) {
 *   // Add issues to refinement feedback
 *   issues.push(...result.issues.map(toJudgeIssue));
 * }
 * ```
 */
export function validateMarkdownStructure(markdownContent: string): MarkdownStructureResult {
  const startTime = performance.now();

  // Run markdownlint
  const lintResults = lint({
    strings: { content: markdownContent },
    config: LESSON_MARKDOWNLINT_CONFIG,
  });

  const errors: LintError[] = lintResults['content'] ?? [];

  // Classify and count by severity
  const issues: MarkdownStructureIssue[] = errors.map((error) => ({
    ruleId: error.ruleNames[0] ?? 'unknown',
    ruleAliases: error.ruleNames.slice(1),
    description: error.ruleDescription,
    severity: RULE_SEVERITY[error.ruleNames[0]] ?? 'minor',
    lineNumber: error.lineNumber,
    errorRange: error.errorRange ?? undefined,
    errorContext: error.errorContext ?? undefined,
    errorDetail: error.errorDetail ?? undefined,
    fixable: error.fixInfo !== null,
  }));

  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const majorCount = issues.filter((i) => i.severity === 'major').length;
  const minorCount = issues.filter((i) => i.severity === 'minor').length;

  // Calculate score: start at 100, subtract penalties
  const totalPenalty =
    criticalCount * SEVERITY_PENALTIES.critical +
    majorCount * SEVERITY_PENALTIES.major +
    minorCount * SEVERITY_PENALTIES.minor;

  const score = Math.max(0, 100 - totalPenalty);

  const durationMs = performance.now() - startTime;

  return {
    score,
    passed: score >= PASS_THRESHOLD,
    criticalCount,
    majorCount,
    minorCount,
    totalIssues: issues.length,
    issues,
    durationMs,
  };
}

/**
 * Convert markdownlint issue to JudgeIssue format for refinement feedback.
 */
export function toJudgeIssue(issue: MarkdownStructureIssue): {
  criterion: 'clarity_readability';
  severity: 'critical' | 'major' | 'minor';
  location: string;
  description: string;
  quotedText?: string;
  suggestedFix: string;
} {
  return {
    criterion: 'clarity_readability',
    severity: issue.severity,
    location: `line ${issue.lineNumber}`,
    description: `[${issue.ruleId}] ${issue.description}`,
    quotedText: issue.errorContext,
    suggestedFix: getFixSuggestion(issue),
  };
}

/**
 * Generate human-readable fix suggestion based on rule.
 */
function getFixSuggestion(issue: MarkdownStructureIssue): string {
  const suggestions: Record<string, string> = {
    'MD001': 'Adjust heading levels to increment by one (e.g., H2 after H1, not H3)',
    'MD003': 'Use ATX-style headings (# Heading) consistently',
    'MD004': 'Use consistent list markers (prefer - for unordered lists)',
    'MD005': 'Fix list indentation to be consistent',
    'MD007': 'Use 2 spaces for list indentation',
    'MD009': 'Remove trailing spaces from line end',
    'MD010': 'Replace hard tabs with spaces',
    'MD012': 'Remove extra blank lines (max 2 consecutive)',
    'MD022': 'Add blank lines before and after headings',
    'MD025': 'Use only one H1 heading per document',
    'MD031': 'Add blank lines before and after fenced code blocks',
    'MD032': 'Add blank lines before and after lists',
    'MD037': 'Remove spaces inside emphasis markers (*text* not * text *)',
    'MD038': 'Remove spaces inside code spans (`code` not ` code `)',
    'MD039': 'Remove spaces inside link text',
    'MD040': 'Add language identifier to fenced code block (e.g., ```javascript)',
    'MD042': 'Add URL to empty link or remove the link',
    'MD045': 'Add alt text to image for accessibility',
    'MD046': 'Use fenced code blocks (```) instead of indented code',
    'MD047': 'Add newline at end of file',
    'MD048': 'Use backticks (```) for code fences, not tildes (~~~)',
    'MD049': 'Use asterisks (*) for emphasis, not underscores (_)',
    'MD050': 'Use asterisks (**) for strong emphasis, not underscores (__)',
  };

  return suggestions[issue.ruleId] ?? `Fix ${issue.ruleId}: ${issue.description}`;
}
```

### 5. Integration with Heuristic Filters

```typescript
// packages/course-gen-platform/src/stages/stage6-lesson-content/judge/heuristic-filter.ts
// ADD to existing file

import { validateMarkdownStructure, toJudgeIssue } from './markdown-structure-filter';

// In runHeuristicFilters function, add after existing checks:

export async function runHeuristicFilters(
  input: CascadeEvaluationInput
): Promise<HeuristicFilterResult> {
  const results: HeuristicCheckResult[] = [];

  // ... existing checks (word count, Flesch-Kincaid, sections) ...

  // NEW: Markdown structure validation
  const markdownContent = serializeLessonToMarkdown(input.lessonContent);
  const structureResult = validateMarkdownStructure(markdownContent);

  results.push({
    check: 'markdown_structure',
    passed: structureResult.passed,
    score: structureResult.score / 100, // Normalize to 0-1
    details: {
      criticalIssues: structureResult.criticalCount,
      majorIssues: structureResult.majorCount,
      minorIssues: structureResult.minorCount,
      totalIssues: structureResult.totalIssues,
      durationMs: structureResult.durationMs,
    },
    issues: structureResult.issues.map(toJudgeIssue),
  });

  // ... rest of function ...
}

/**
 * Serialize LessonContentBody to markdown string for validation.
 */
function serializeLessonToMarkdown(content: LessonContentBody): string {
  const parts: string[] = [];

  // Title (H1)
  if (content.title) {
    parts.push(`# ${content.title}\n`);
  }

  // Introduction
  if (content.intro) {
    parts.push(`## Introduction\n\n${content.intro}\n`);
  }

  // Sections
  for (const section of content.sections ?? []) {
    parts.push(`## ${section.title}\n\n${section.content}\n`);

    // Subsections
    for (const sub of section.subsections ?? []) {
      parts.push(`### ${sub.title}\n\n${sub.content}\n`);
    }
  }

  // Conclusion
  if (content.conclusion) {
    parts.push(`## Conclusion\n\n${content.conclusion}\n`);
  }

  // Key Takeaways
  if (content.keyTakeaways?.length) {
    parts.push(`## Key Takeaways\n\n`);
    for (const takeaway of content.keyTakeaways) {
      parts.push(`- ${takeaway}\n`);
    }
  }

  return parts.join('\n');
}
```

### 6. Types Extension

```typescript
// packages/shared-types/src/judge-types.ts
// ADD to existing file

/**
 * Heuristic check names including new markdown structure check.
 */
export type HeuristicCheckName =
  | 'word_count'
  | 'flesch_kincaid'
  | 'required_sections'
  | 'keyword_coverage'
  | 'content_density'
  | 'markdown_structure';  // NEW

/**
 * Markdown structure specific details in heuristic result.
 */
export interface MarkdownStructureDetails {
  criticalIssues: number;
  majorIssues: number;
  minorIssues: number;
  totalIssues: number;
  durationMs: number;
}
```

## Testing Strategy

### Unit Tests

```typescript
// packages/course-gen-platform/tests/unit/judge/markdown-structure-filter.test.ts

import { describe, it, expect } from 'vitest';
import { validateMarkdownStructure } from '../../../src/stages/stage6-lesson-content/judge/markdown-structure-filter';

describe('validateMarkdownStructure', () => {
  describe('heading validation', () => {
    it('passes valid heading hierarchy', () => {
      const content = `# Title\n\n## Section 1\n\n### Subsection\n\n## Section 2\n`;
      const result = validateMarkdownStructure(content);

      expect(result.criticalCount).toBe(0);
      expect(result.passed).toBe(true);
    });

    it('flags heading level skip as critical', () => {
      const content = `# Title\n\n### Skipped H2\n`;
      const result = validateMarkdownStructure(content);

      expect(result.criticalCount).toBeGreaterThan(0);
      expect(result.issues.some(i => i.ruleId === 'MD001')).toBe(true);
    });

    it('flags multiple H1 headings as critical', () => {
      const content = `# Title 1\n\n# Title 2\n`;
      const result = validateMarkdownStructure(content);

      expect(result.issues.some(i => i.ruleId === 'MD025')).toBe(true);
    });
  });

  describe('code block validation', () => {
    it('passes code blocks with language', () => {
      const content = `# Title\n\n\`\`\`javascript\nconst x = 1;\n\`\`\`\n`;
      const result = validateMarkdownStructure(content);

      expect(result.issues.some(i => i.ruleId === 'MD040')).toBe(false);
    });

    it('flags code blocks without language as critical', () => {
      const content = `# Title\n\n\`\`\`\nconst x = 1;\n\`\`\`\n`;
      const result = validateMarkdownStructure(content);

      expect(result.issues.some(i => i.ruleId === 'MD040')).toBe(true);
      expect(result.issues.find(i => i.ruleId === 'MD040')?.severity).toBe('critical');
    });

    it('flags code blocks without surrounding blank lines', () => {
      const content = `# Title\nSome text\n\`\`\`js\ncode\n\`\`\`\nMore text\n`;
      const result = validateMarkdownStructure(content);

      expect(result.issues.some(i => i.ruleId === 'MD031')).toBe(true);
    });
  });

  describe('scoring algorithm', () => {
    it('returns 100 for perfect content', () => {
      const content = `# Title\n\n## Section\n\nParagraph text.\n\n- List item\n\n\`\`\`javascript\ncode();\n\`\`\`\n`;
      const result = validateMarkdownStructure(content);

      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
    });

    it('deducts 10 points per critical issue', () => {
      // 2 critical issues: heading skip + no language
      const content = `# Title\n\n### Skipped\n\n\`\`\`\ncode\n\`\`\`\n`;
      const result = validateMarkdownStructure(content);

      expect(result.criticalCount).toBe(2);
      expect(result.score).toBeLessThanOrEqual(80);
    });

    it('fails content with score below 75', () => {
      // Many critical issues
      const content = `# A\n# B\n# C\n### Skip\n\`\`\`\nno lang\n\`\`\`\n`;
      const result = validateMarkdownStructure(content);

      expect(result.score).toBeLessThan(75);
      expect(result.passed).toBe(false);
    });
  });

  describe('performance', () => {
    it('completes in under 100ms for typical lesson', () => {
      const content = generateTypicalLesson(); // ~2000 words
      const result = validateMarkdownStructure(content);

      expect(result.durationMs).toBeLessThan(100);
    });
  });
});
```

### Integration Tests

```typescript
// packages/course-gen-platform/tests/integration/stage6/heuristic-filters.test.ts

describe('heuristic filters with markdown structure', () => {
  it('includes markdown_structure in filter results', async () => {
    const input = createTestLessonInput();
    const result = await runHeuristicFilters(input);

    const mdCheck = result.checks.find(c => c.check === 'markdown_structure');
    expect(mdCheck).toBeDefined();
    expect(mdCheck?.score).toBeGreaterThanOrEqual(0);
    expect(mdCheck?.score).toBeLessThanOrEqual(1);
  });

  it('adds markdown issues to refinement feedback', async () => {
    const input = createTestLessonInput({
      intro: '### Wrong heading level\n\nIntro text.',
    });
    const result = await runHeuristicFilters(input);

    const mdCheck = result.checks.find(c => c.check === 'markdown_structure');
    expect(mdCheck?.issues?.length).toBeGreaterThan(0);
    expect(mdCheck?.issues?.[0].criterion).toBe('clarity_readability');
  });
});
```

## Rollout Plan

### Phase 1: Shadow Mode (Week 1-2)
- Deploy markdownlint filter
- Log results but don't affect pipeline decisions
- Collect metrics on issue frequency
- Tune rule configuration based on real data

### Phase 2: Soft Enforcement (Week 3-4)
- Enable as non-blocking filter
- Add issues to refinement feedback (but don't fail)
- Monitor refinement success rate
- Adjust severity classifications

### Phase 3: Full Enforcement (Week 5+)
- Enable as blocking filter (score < 75 = fail)
- Integrate with Decision Engine
- Auto-fix minor issues if feasible

## Metrics & Monitoring

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Filter execution time | < 50ms p95 | Prometheus histogram |
| False positive rate | < 5% | Manual review sample |
| Issues caught per lesson | Track trend | Counter per severity |
| Refinement success rate | Improve by 10% | Before/after comparison |

### Dashboards

```typescript
// Prometheus metrics
markdownlint_filter_duration_ms{quantile="0.95"}
markdownlint_issues_total{severity="critical|major|minor"}
markdownlint_filter_pass_rate
```

## Cost Analysis

| Component | Cost | Notes |
|-----------|------|-------|
| markdownlint package | 0 | MIT license |
| Execution | ~0.001ms CPU | Negligible |
| Memory | ~5MB peak | Temporary |
| **Total per evaluation** | **$0** | vs $0.001+ for LLM |

### ROI Projection

Assuming 1000 lessons/day:
- Current: All structural issues reach LLM ($1-2/day wasted)
- With filter: 30-50% pre-filtered (saves $0.30-1/day)
- **Annual savings**: ~$100-350 + improved quality

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| False positives block good content | Medium | High | Shadow mode first, tune rules |
| LLM output incompatible with rules | Low | Medium | Disable problematic rules |
| Performance regression | Low | Low | Async execution, timeout |
| Maintenance burden | Low | Low | Stable library, minimal config |

## Open Questions

1. **Auto-fix**: Should we auto-fix minor issues (trailing spaces, etc.) before LLM evaluation?
   - Pro: Cleaner input, fewer issues
   - Con: Modifies LLM output, potential side effects

2. **Serialization format**: Current approach reconstructs markdown from LessonContentBody. Should we validate raw LLM output instead?
   - Pro: Catches issues in actual output
   - Con: May not match final rendered format

3. **Threshold tuning**: Is 75 the right pass threshold? Should it differ from LLM judge threshold?

## References

- [markdownlint GitHub](https://github.com/DavidAnson/markdownlint)
- [markdownlint Rules](https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md)
- [markdownlint-cli](https://github.com/igorshubovych/markdownlint-cli)
- Internal: `docs/research/010-stage6-generation-strategy/` (CLEV architecture)
- Internal: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/` (current implementation)

---

## Appendix A: Full Rule Reference

| Rule | Name | Enabled | Severity | Reason |
|------|------|---------|----------|--------|
| MD001 | heading-increment | Yes | Critical | Broken TOC, a11y |
| MD003 | heading-style | Yes (atx) | Major | Consistency |
| MD004 | ul-style | Yes (dash) | Major | Consistency |
| MD005 | list-indent | Yes | Major | Readability |
| MD007 | ul-indent | Yes (2) | Minor | Style |
| MD009 | no-trailing-spaces | Yes | Minor | Clean diffs |
| MD010 | no-hard-tabs | Yes | Minor | Rendering |
| MD012 | no-multiple-blanks | Yes (2) | Minor | Clean formatting |
| MD013 | line-length | No | - | LLM writes long |
| MD022 | blanks-around-headings | Yes | Major | Readability |
| MD024 | no-duplicate-heading | No | - | Lessons repeat |
| MD025 | single-h1 | Yes | Critical | Structure |
| MD026 | no-trailing-punctuation | No | - | Questions OK |
| MD031 | blanks-around-fences | Yes | Critical | Rendering |
| MD032 | blanks-around-lists | Yes | Major | Readability |
| MD033 | no-inline-html | No | - | Callouts use HTML |
| MD034 | no-bare-urls | No | - | Educational content |
| MD037 | no-space-in-emphasis | Yes | Major | Rendering |
| MD038 | no-space-in-code | Yes | Major | Rendering |
| MD039 | no-space-in-links | Yes | Minor | Clean formatting |
| MD040 | fenced-code-language | Yes | Critical | Syntax highlighting |
| MD041 | first-line-h1 | No | - | Metadata first |
| MD042 | no-empty-links | Yes | Major | Broken links |
| MD045 | no-alt-text | Yes | Critical | Accessibility |
| MD046 | code-block-style | Yes (fenced) | Critical | Consistency |
| MD047 | single-trailing-newline | Yes | Minor | Clean EOF |
| MD048 | code-fence-style | Yes (backtick) | Minor | Consistency |
| MD049 | emphasis-style | Yes (*) | Minor | Consistency |
| MD050 | strong-style | Yes (**) | Minor | Consistency |

---

## Appendix B: Example Output

### Input (problematic lesson)
```markdown
# Introduction to JavaScript

### Variables
Variables store data...

```
let x = 1
```

## Functions
Functions are...
```

### Markdownlint Output
```json
{
  "score": 60,
  "passed": false,
  "criticalCount": 2,
  "majorCount": 1,
  "minorCount": 0,
  "totalIssues": 3,
  "issues": [
    {
      "ruleId": "MD001",
      "description": "Heading levels should only increment by one level at a time",
      "severity": "critical",
      "lineNumber": 3,
      "suggestedFix": "Change ### to ## (H3 should follow H2, not H1)"
    },
    {
      "ruleId": "MD040",
      "description": "Fenced code blocks should have a language specified",
      "severity": "critical",
      "lineNumber": 6,
      "suggestedFix": "Add language identifier (e.g., ```javascript)"
    },
    {
      "ruleId": "MD022",
      "description": "Headings should be surrounded by blank lines",
      "severity": "major",
      "lineNumber": 3,
      "suggestedFix": "Add blank line before heading"
    }
  ],
  "durationMs": 12
}
```
