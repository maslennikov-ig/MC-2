/**
 * Markdownlint Severity Classification
 * @module stages/stage6-lesson-content/judge/markdownlint-severity
 *
 * Classifies markdown lint rules by severity for:
 * 1. Scoring - Different penalties for different severities
 * 2. Routing - Critical issues go to LLM fix, minor issues can be auto-fixed
 * 3. Filtering - Skip minor issues in certain modes
 *
 * Severity Definitions:
 * - **CRITICAL** (10 points) - Structural issues affecting comprehension/accessibility
 * - **MAJOR** (3 points) - Formatting issues degrading quality
 * - **MINOR** (1 point) - Cosmetic issues, typically auto-fixable
 *
 * Reference:
 * - specs/018-judge-targeted-refinement/quickstart.md (Phase 10)
 * - specs/018-judge-targeted-refinement/spec.md (FR-034)
 * - https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Markdown lint rule severity levels
 */
export type MarkdownLintSeverity = 'critical' | 'major' | 'minor';

// ============================================================================
// SEVERITY MAPPINGS
// ============================================================================

/**
 * Severity classification for markdown lint rules
 *
 * Classification rationale:
 *
 * **CRITICAL** - Structural issues that affect comprehension or accessibility:
 * - MD001: Heading increment - Skipping heading levels (h1→h3) confuses readers and breaks document outline
 * - MD025: Single h1 - Multiple h1 tags break document hierarchy and SEO
 * - MD045: Image alt text - Missing alt text is an accessibility violation (WCAG requirement)
 *
 * **MAJOR** - Formatting issues that degrade quality but don't break structure:
 * - MD003: Heading style - Inconsistent heading styles (ATX vs Setext) reduce readability
 * - MD004: Unordered list style - Inconsistent list markers (*, -, +) look unprofessional
 * - MD040: Fenced code language - Code blocks without language prevent syntax highlighting
 * - MD031: Blanks around fenced code - Cramped code blocks harder to read
 * - MD032: Blanks around lists - Cramped lists harder to scan
 * - MD046: Code block style - Inconsistent code block styles (fenced vs indented) reduce consistency
 *
 * **MINOR** - Cosmetic issues, typically auto-fixable by markdownlint:
 * - MD009: Trailing spaces - Auto-fixable, purely cosmetic
 * - MD010: Hard tabs - Auto-fixable, purely cosmetic
 * - MD012: Multiple blank lines - Auto-fixable, style preference
 * - MD047: Single trailing newline - Auto-fixable, POSIX compliance
 * - MD005: List indent - Auto-fixable, style preference
 * - MD007: Unordered list indent - Auto-fixable, style preference
 * - MD022: Blanks around headings - Auto-fixable, style preference
 */
export const RULE_SEVERITY: Record<string, MarkdownLintSeverity> = {
  // CRITICAL - Structural issues affecting comprehension/accessibility
  MD001: 'critical', // heading-increment - Skipping heading levels confuses document structure
  MD025: 'critical', // single-title/single-h1 - Multiple h1 breaks hierarchy
  MD045: 'critical', // no-alt-text - Missing image alt text is accessibility violation

  // MAJOR - Formatting issues degrading quality
  MD003: 'major', // heading-style - Inconsistent heading styles (ATX vs Setext)
  MD004: 'major', // ul-style - Inconsistent unordered list markers (*, -, +)
  MD040: 'major', // fenced-code-language - Code blocks without language specification
  MD031: 'major', // blanks-around-fences - Missing blank lines around fenced code blocks
  MD032: 'major', // blanks-around-lists - Missing blank lines around lists
  MD046: 'major', // code-block-style - Inconsistent code block styles (fenced vs indented)

  // MINOR - Cosmetic issues, auto-fixable
  MD009: 'minor', // no-trailing-spaces - Trailing spaces (auto-fixable)
  MD010: 'minor', // no-hard-tabs - Hard tabs instead of spaces (auto-fixable)
  MD012: 'minor', // no-multiple-blanks - Multiple consecutive blank lines (auto-fixable)
  MD047: 'minor', // single-trailing-newline - File should end with single newline (auto-fixable)
  MD005: 'minor', // list-indent - Inconsistent list indentation (style preference)
  MD007: 'minor', // ul-indent - Unordered list indentation (style preference)
  MD022: 'minor', // blanks-around-headings - Blank lines around headings (auto-fixable)
};

// ============================================================================
// PENALTY CONFIGURATION
// ============================================================================

/**
 * Score penalties for different severity levels
 *
 * Used in markdown scoring calculations to penalize lessons with lint issues.
 * Critical issues have 10x penalty vs minor issues to reflect their impact.
 */
export const SEVERITY_PENALTIES = {
  critical: 10,
  major: 3,
  minor: 1,
} as const;

// ============================================================================
// AUTO-FIXABLE RULES
// ============================================================================

/**
 * Markdown lint rules that can be auto-fixed by markdownlint
 *
 * These rules have programmatic fixes available via markdownlint's --fix flag.
 * Router can skip LLM fix for these rules and use auto-fix instead.
 *
 * Current auto-fixable rules:
 * - MD009: Trailing spaces can be automatically removed
 * - MD010: Hard tabs can be automatically converted to spaces
 * - MD012: Multiple blank lines can be automatically collapsed
 * - MD047: Missing trailing newline can be automatically added
 */
export const AUTO_FIXABLE_RULES = new Set<string>([
  'MD009', // no-trailing-spaces
  'MD010', // no-hard-tabs
  'MD012', // no-multiple-blanks
  'MD047', // single-trailing-newline
]);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get severity level for a markdown lint rule
 *
 * Returns the severity classification for a given rule ID.
 * Defaults to 'minor' for unknown rules (defensive fallback).
 *
 * @param ruleId - Markdown lint rule ID (e.g., "MD001", "MD025")
 * @returns Severity level: 'critical', 'major', or 'minor'
 *
 * @example
 * ```typescript
 * getRuleSeverity('MD001') // => 'critical'
 * getRuleSeverity('MD040') // => 'major'
 * getRuleSeverity('MD009') // => 'minor'
 * getRuleSeverity('MD999') // => 'minor' (unknown rule, defensive fallback)
 * ```
 */
export function getRuleSeverity(ruleId: string): MarkdownLintSeverity {
  return RULE_SEVERITY[ruleId] ?? 'minor';
}

/**
 * Check if a markdown lint rule is auto-fixable
 *
 * Auto-fixable rules can be corrected programmatically by markdownlint's --fix flag.
 * Router uses this to determine if LLM fix is needed or if auto-fix is sufficient.
 *
 * @param ruleId - Markdown lint rule ID (e.g., "MD009", "MD001")
 * @returns true if rule can be auto-fixed, false otherwise
 *
 * @example
 * ```typescript
 * isAutoFixable('MD009') // => true (trailing spaces)
 * isAutoFixable('MD001') // => false (heading structure needs manual fix)
 * ```
 */
export function isAutoFixable(ruleId: string): boolean {
  return AUTO_FIXABLE_RULES.has(ruleId);
}

/**
 * Calculate total penalty score for markdown lint issues
 *
 * Sums up penalties for all issues based on their severity.
 * Used in quality scoring to penalize lessons with markdown issues.
 *
 * @param issues - Array of rule IDs that have violations
 * @returns Total penalty score
 *
 * @example
 * ```typescript
 * calculatePenalty(['MD001', 'MD009']) // => 11 (critical:10 + minor:1)
 * calculatePenalty(['MD040', 'MD040']) // => 6 (major:3 + major:3)
 * ```
 */
export function calculatePenalty(issues: string[]): number {
  return issues.reduce((total, ruleId) => {
    const severity = getRuleSeverity(ruleId);
    return total + SEVERITY_PENALTIES[severity];
  }, 0);
}
