/**
 * Markdown Structure Filter for Stage 6 Judge System
 * @module stages/stage6-lesson-content/judge/markdown-structure-filter
 *
 * Provides FREE markdown structure validation BEFORE expensive LLM evaluation.
 * Uses markdownlint library to:
 * - Detect structural issues (headings, code blocks, lists)
 * - Auto-fix trivial issues (trailing spaces, tabs, blank lines)
 * - Convert non-fixable issues to JudgeIssue format for Patcher
 *
 * This is Phase 10 of Stage 6 Targeted Refinement System:
 * 1. Heuristic pre-filters (word count, readability) - Phase 9
 * 2. **Markdown structure validation (FREE)** - Phase 10 ← THIS MODULE
 * 3. LLM Judge evaluation - Phase 11+
 *
 * Integration Flow:
 * ```
 * HeuristicFilter → MarkdownStructureFilter → LLM Judge
 *       FREE              FREE                  PAID
 *    (500 tokens)      (0 tokens)          (1500 tokens)
 * ```
 *
 * Token Savings:
 * - Typical lesson: ~3000 words = ~4000 tokens
 * - Markdown errors add ~500-1000 tokens to judge prompt
 * - Early rejection saves ~1500-2000 tokens (including judge response)
 * - At 50% filter rate: ~750-1000 tokens saved per lesson on average
 *
 * Reference:
 * - specs/018-judge-targeted-refinement/quickstart.md (Phase 10)
 * - specs/018-judge-targeted-refinement/spec.md (FR-034)
 * - docs/research/018-markdownlint-judge-integration/
 * - https://github.com/DavidAnson/markdownlint
 *
 * @see {@link ./markdownlint-config.ts} - Rule configuration and severity mapping
 * @see {@link ./markdownlint-severity.ts} - Severity classification and penalties
 * @see {@link ./heuristic-filter.ts} - Previous filter in cascade
 */

import { lint } from 'markdownlint/sync';
import { applyFixes, type LintError } from 'markdownlint';
import type { JudgeIssue, IssueSeverity } from '@megacampus/shared-types/judge-types';
import type { JudgeCriterion } from '@megacampus/shared-types/judge-rubric';
import { logger } from '@/shared/logger';

import {
  LESSON_MARKDOWNLINT_CONFIG,
  type MarkdownLintValidationError,
} from './markdownlint-config';
import {
  getRuleSeverity,
  isAutoFixable,
  calculatePenalty,
  type MarkdownLintSeverity,
} from './markdownlint-severity';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result from markdown structure validation
 *
 * Comprehensive result including:
 * - Pass/fail status (based on critical/major errors)
 * - Quality score (penalized by issue severity)
 * - Issues classified by severity
 * - Auto-fixed issues (trivial cosmetic fixes)
 * - Patcher issues (non-fixable, need LLM intervention)
 */
export interface MarkdownStructureResult {
  /** Whether validation passed (no critical/major errors) */
  passed: boolean;

  /** Quality score (0-1), penalized by issues */
  score: number;

  /** All lint issues found */
  issues: MarkdownLintValidationError[];

  /** Issues grouped by severity for prioritization */
  issuesBySeverity: {
    critical: MarkdownLintValidationError[];
    major: MarkdownLintValidationError[];
    minor: MarkdownLintValidationError[];
  };

  /** Rule IDs that were auto-fixed (cosmetic only) */
  autoFixedIssues: string[];

  /** Issues that need Patcher intervention (non-fixable) */
  patcherIssues: JudgeIssue[];

  /** Duration of validation in milliseconds */
  durationMs: number;
}

/**
 * Result from applying markdown auto-fixes
 *
 * Auto-fixes only apply to cosmetic issues that don't change content meaning:
 * - MD009: Trailing spaces
 * - MD010: Hard tabs → spaces
 * - MD012: Multiple blank lines → single
 * - MD047: Add trailing newline
 */
export interface MarkdownAutoFixResult {
  /** Fixed markdown content */
  content: string;

  /** Rule IDs that were fixed */
  fixedRules: string[];
}

// ============================================================================
// RULE TO CRITERION MAPPING
// ============================================================================

/**
 * Map markdown lint rules to judge criteria
 *
 * This mapping determines which JudgeCriterion a markdown rule violation
 * should be classified under when converting to JudgeIssue format.
 *
 * Mapping rationale:
 * - **pedagogical_structure**: Heading hierarchy, document outline
 * - **clarity_readability**: Code formatting, list formatting, general readability
 * - **completeness**: Accessibility requirements (alt text)
 */
const RULE_TO_CRITERION: Record<string, JudgeCriterion> = {
  // Heading structure → pedagogical_structure
  MD001: 'pedagogical_structure', // heading-increment (skipping levels confuses structure)
  MD003: 'pedagogical_structure', // heading-style (inconsistent styles reduce clarity)
  MD022: 'pedagogical_structure', // blanks-around-headings (readability of structure)
  MD025: 'pedagogical_structure', // single-title (document hierarchy)

  // Code blocks → clarity_readability
  MD031: 'clarity_readability', // blanks-around-fences (readability)
  MD040: 'clarity_readability', // fenced-code-language (syntax highlighting)
  MD046: 'clarity_readability', // code-block-style (consistency)

  // Lists → clarity_readability
  MD004: 'clarity_readability', // ul-style (consistency)
  MD005: 'clarity_readability', // list-indent (readability)
  MD007: 'clarity_readability', // ul-indent (readability)
  MD032: 'clarity_readability', // blanks-around-lists (readability)

  // Whitespace → clarity_readability
  MD009: 'clarity_readability', // no-trailing-spaces (formatting)
  MD010: 'clarity_readability', // no-hard-tabs (formatting)
  MD012: 'clarity_readability', // no-multiple-blanks (formatting)
  MD047: 'clarity_readability', // single-trailing-newline (formatting)

  // Accessibility → completeness
  MD045: 'completeness', // no-alt-text (accessibility requirement)
};

/**
 * Map markdown lint severity to judge issue severity
 *
 * Markdown severities are more granular, so we map them to judge severities:
 * - critical → critical
 * - major → major
 * - minor → minor
 */
const MARKDOWN_TO_JUDGE_SEVERITY: Record<MarkdownLintSeverity, IssueSeverity> = {
  critical: 'critical',
  major: 'major',
  minor: 'minor',
};

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

/**
 * Validate markdown structure using markdownlint
 *
 * Runs markdownlint synchronously on content to detect structural issues.
 * Categorizes issues by severity and calculates quality score with penalties.
 *
 * Pass/Fail Logic:
 * - **PASS**: No critical or major errors
 * - **FAIL**: One or more critical/major errors present
 *
 * Scoring:
 * - Start with 1.0 (perfect score)
 * - Subtract penalties: critical (10), major (3), minor (1)
 * - Formula: `score = 1 - (totalPenalty / 100)`
 * - Clamp to [0, 1]
 *
 * @param content - Markdown content to validate
 * @returns Comprehensive validation result with issues and score
 *
 * @example
 * ```typescript
 * const result = validateMarkdownStructure(lessonMarkdown);
 *
 * if (!result.passed) {
 *   console.error('Markdown validation failed:');
 *   console.error('Critical issues:', result.issuesBySeverity.critical.length);
 *   console.error('Major issues:', result.issuesBySeverity.major.length);
 *   console.error('Score:', result.score);
 * }
 *
 * // Convert to Patcher format for LLM fix
 * for (const issue of result.patcherIssues) {
 *   console.log(`${issue.severity}: ${issue.description}`);
 *   console.log(`Fix: ${issue.suggestedFix}`);
 * }
 * ```
 */
export function validateMarkdownStructure(content: string): MarkdownStructureResult {
  const startTime = Date.now();

  // Run markdownlint validation
  const lintResults = lint({
    strings: { content },
    config: LESSON_MARKDOWNLINT_CONFIG,
  });

  const lintErrors: LintError[] = lintResults.content || [];

  // Convert to our validation error format
  const issues: MarkdownLintValidationError[] = lintErrors.map((error) => ({
    lineNumber: error.lineNumber,
    ruleNames: error.ruleNames,
    ruleDescription: error.ruleDescription,
    errorDetail: error.errorDetail ?? null,
    errorContext: error.errorContext ?? null,
    errorRange: error.errorRange ? (error.errorRange as [number, number]) : null,
  }));

  // Classify by severity
  const issuesBySeverity: MarkdownStructureResult['issuesBySeverity'] = {
    critical: [],
    major: [],
    minor: [],
  };

  for (const issue of issues) {
    const ruleId = issue.ruleNames[0]; // First name is the canonical rule ID (e.g., "MD001")
    const severity = getRuleSeverity(ruleId);
    issuesBySeverity[severity].push(issue);
  }

  // Calculate penalty-based score
  const ruleIds = issues.map((issue) => issue.ruleNames[0]);
  const totalPenalty = calculatePenalty(ruleIds);
  const score = Math.max(0, Math.min(1, 1 - totalPenalty / 100));

  // Pass if no critical or major errors
  const passed = issuesBySeverity.critical.length === 0 && issuesBySeverity.major.length === 0;

  // Convert non-fixable issues to JudgeIssue format for Patcher
  const patcherIssues: JudgeIssue[] = [];
  for (const issue of issues) {
    const ruleId = issue.ruleNames[0];
    if (!isAutoFixable(ruleId)) {
      patcherIssues.push(toJudgeIssue(issue));
    }
  }

  const durationMs = Date.now() - startTime;

  logger.info({
    msg: 'Markdown structure validation complete',
    passed,
    score: score.toFixed(3),
    totalIssues: issues.length,
    criticalIssues: issuesBySeverity.critical.length,
    majorIssues: issuesBySeverity.major.length,
    minorIssues: issuesBySeverity.minor.length,
    patcherIssues: patcherIssues.length,
    durationMs,
  });

  return {
    passed,
    score,
    issues,
    issuesBySeverity,
    autoFixedIssues: [], // Populated by applyMarkdownAutoFixes
    patcherIssues,
    durationMs,
  };
}

// ============================================================================
// AUTO-FIX FUNCTION
// ============================================================================

/**
 * Apply markdown auto-fixes to content
 *
 * Uses markdownlint's applyFixes to automatically correct cosmetic issues
 * that don't change content meaning:
 * - MD009: Remove trailing spaces
 * - MD010: Convert hard tabs to spaces
 * - MD012: Collapse multiple blank lines
 * - MD047: Add trailing newline
 *
 * **IMPORTANT**: Only auto-fixable rules are corrected. Structural issues
 * (headings, code blocks) require manual intervention via Patcher.
 *
 * @param content - Original markdown content
 * @returns Fixed content and list of fixed rule IDs
 *
 * @example
 * ```typescript
 * const original = "# Title\n\n\n\nContent with  trailing spaces  \n\tAnd hard tabs";
 * const { content: fixed, fixedRules } = applyMarkdownAutoFixes(original);
 *
 * console.log(fixedRules); // ['MD012', 'MD009', 'MD010']
 * console.log(fixed);
 * // # Title
 * //
 * // Content with trailing spaces
 * //   And hard tabs (converted to spaces)
 * ```
 */
export function applyMarkdownAutoFixes(content: string): MarkdownAutoFixResult {
  // Run lint to get issues with fix information
  const lintResults = lint({
    strings: { content },
    config: LESSON_MARKDOWNLINT_CONFIG,
  });

  const lintErrors: LintError[] = lintResults.content || [];

  // Filter to only auto-fixable rules
  const fixableErrors = lintErrors.filter((error) => {
    const ruleId = error.ruleNames[0];
    return isAutoFixable(ruleId) && error.fixInfo;
  });

  // Track which rules were fixed
  const fixedRulesSet = new Set<string>();
  for (const error of fixableErrors) {
    fixedRulesSet.add(error.ruleNames[0]);
  }

  // Apply fixes (only processes errors with fixInfo)
  const fixedContent = applyFixes(content, lintErrors);

  return {
    content: fixedContent,
    fixedRules: Array.from(fixedRulesSet),
  };
}

// ============================================================================
// CONVERSION TO JUDGE FORMAT
// ============================================================================

/**
 * Convert markdownlint error to JudgeIssue format
 *
 * Maps markdown lint errors to the judge system's issue format for Patcher.
 * Each markdown rule is mapped to:
 * - Appropriate JudgeCriterion (pedagogical_structure, clarity_readability, etc.)
 * - Severity level (critical, major, minor)
 * - Actionable fix suggestion based on rule type
 *
 * Rule Mappings:
 * - **MD001, MD025, MD022** → pedagogical_structure (heading issues)
 * - **MD040, MD031, MD046** → clarity_readability (code formatting)
 * - **MD045** → completeness (accessibility - alt text)
 * - **Others** → clarity_readability (general formatting)
 *
 * @param error - Markdownlint validation error
 * @param sectionId - Optional section ID for location context
 * @returns JudgeIssue ready for Patcher
 *
 * @example
 * ```typescript
 * const mdError: MarkdownLintValidationError = {
 *   lineNumber: 42,
 *   ruleNames: ['MD001', 'heading-increment'],
 *   ruleDescription: 'Heading levels should increment by one',
 *   errorDetail: 'Expected h2, found h3',
 *   errorContext: '### Skipped to h3',
 *   errorRange: [0, 15],
 * };
 *
 * const judgeIssue = toJudgeIssue(mdError, 'section-2');
 * console.log(judgeIssue);
 * // {
 * //   criterion: 'pedagogical_structure',
 * //   severity: 'critical',
 * //   location: 'Line 42 (section-2)',
 * //   description: 'Heading levels should increment by one: Expected h2, found h3',
 * //   quotedText: '### Skipped to h3',
 * //   suggestedFix: 'Adjust heading level to maintain proper hierarchy...',
 * // }
 * ```
 */
export function toJudgeIssue(
  error: MarkdownLintValidationError,
  sectionId?: string
): JudgeIssue {
  const ruleId = error.ruleNames[0]; // Canonical rule ID (e.g., "MD001")
  const ruleName = error.ruleNames[1] ?? ruleId; // Human-readable name (e.g., "heading-increment")

  // Map to criterion and severity
  const criterion = RULE_TO_CRITERION[ruleId] ?? 'clarity_readability';
  const markdownSeverity = getRuleSeverity(ruleId);
  const severity = MARKDOWN_TO_JUDGE_SEVERITY[markdownSeverity];

  // Build location string
  const location = sectionId
    ? `Line ${error.lineNumber} (${sectionId})`
    : `Line ${error.lineNumber}`;

  // Build description
  const description = error.errorDetail
    ? `${error.ruleDescription}: ${error.errorDetail}`
    : error.ruleDescription;

  // Build suggested fix based on rule
  const suggestedFix = getSuggestedFix(ruleId, ruleName, error);

  return {
    criterion,
    severity,
    location,
    description,
    quotedText: error.errorContext ?? undefined,
    suggestedFix,
  };
}

/**
 * Get suggested fix for markdown lint rule
 *
 * Provides actionable fix suggestions based on rule type.
 * Suggestions are specific to the rule and include examples where helpful.
 *
 * @param ruleId - Markdown lint rule ID (e.g., "MD001")
 * @param ruleName - Human-readable rule name (e.g., "heading-increment")
 * @param error - Full error object for context
 * @returns Actionable fix suggestion
 */
function getSuggestedFix(
  ruleId: string,
  ruleName: string,
  _error: MarkdownLintValidationError
): string {
  // Rule-specific fix suggestions
  switch (ruleId) {
    case 'MD001':
      return 'Adjust heading level to maintain proper hierarchy. Headings should increment by one level (h1 → h2 → h3), not skip levels (h1 → h3).';

    case 'MD003':
      return 'Use consistent ATX-style headings (# Heading) throughout the document, not Setext-style (underlined headings).';

    case 'MD004':
      return 'Use consistent list markers. Change all unordered lists to use dashes (-) for bullet points.';

    case 'MD005':
    case 'MD007':
      return 'Adjust list indentation to be consistent. Nested lists should use 2-space indentation.';

    case 'MD009':
      return 'Remove trailing spaces at the end of this line. (This should be auto-fixed)';

    case 'MD010':
      return 'Replace hard tabs with spaces. Use 2 spaces for indentation. (This should be auto-fixed)';

    case 'MD012':
      return 'Reduce multiple consecutive blank lines to a single blank line. (This should be auto-fixed)';

    case 'MD022':
      return 'Add blank lines before and after this heading to improve readability and parsing consistency.';

    case 'MD025':
      return 'Remove duplicate H1 headings. The document should have only one top-level heading (# Title).';

    case 'MD031':
      return 'Add blank lines before and after fenced code blocks to separate them from surrounding content.';

    case 'MD032':
      return 'Add blank lines before and after lists to separate them from surrounding content.';

    case 'MD040':
      return 'Add a language identifier to the code fence (e.g., ```typescript, ```python). This enables syntax highlighting and improves accessibility.';

    case 'MD045':
      return 'Add descriptive alt text to this image for accessibility. Format: ![Alt text description](image-url). Alt text should describe the image content for screen readers.';

    case 'MD046':
      return 'Use fenced code blocks (```) consistently instead of indented code blocks (4-space indent).';

    case 'MD047':
      return 'Add a single newline at the end of the file (POSIX compliance). (This should be auto-fixed)';

    default:
      return `Fix ${ruleName} violation. See markdownlint documentation: https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md#${ruleId.toLowerCase()}`;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { MarkdownLintValidationError };
