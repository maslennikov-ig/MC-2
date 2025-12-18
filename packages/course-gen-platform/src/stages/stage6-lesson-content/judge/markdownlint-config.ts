/**
 * Markdownlint Configuration for Lesson Content Validation
 * @module stages/stage6-lesson-content/judge/markdownlint-config
 *
 * FREE markdown structure validation BEFORE expensive LLM evaluation.
 * Catches common formatting issues that would otherwise consume tokens:
 * - Missing heading hierarchy (MD001)
 * - Inconsistent code block fencing (MD031, MD046)
 * - Trailing whitespace and hard tabs (MD009, MD010)
 * - Missing code block language tags (MD040)
 * - List formatting issues (MD004, MD005, MD007)
 * - Missing image alt text (MD045)
 *
 * Integration:
 * - Phase 10 of Stage 6 Targeted Refinement System
 * - Runs in HeuristicFilter BEFORE LLM Judge
 * - Saves ~500-1000 tokens per rejected lesson
 *
 * Based on research:
 * - docs/research/018-markdownlint-judge-integration/
 *
 * @see https://github.com/DavidAnson/markdownlint
 */

import type { Configuration as MarkdownLintConfig } from 'markdownlint';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Markdownlint configuration object (type-safe wrapper)
 *
 * The `Configuration` type from markdownlint library supports:
 * - `default: boolean` - Enable all rules by default
 * - Rule-specific config: `{ "MD001": true }` or `{ "MD040": { "allowed_languages": [...] } }`
 * - `false` to disable a rule
 *
 * Configuration format:
 * ```typescript
 * {
 *   "default": true,       // Enable all rules
 *   "MD013": false,        // Disable line length
 *   "MD040": {             // Configure code block language
 *     "allowed_languages": ["typescript", "javascript", ...]
 *   }
 * }
 * ```
 */
export type LessonMarkdownLintConfig = MarkdownLintConfig;

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Markdownlint configuration for educational lesson content
 *
 * **Philosophy**:
 * - Enable rules that catch STRUCTURAL issues (headings, code blocks, lists)
 * - Disable rules that conflict with educational content needs (line length, HTML)
 * - Focus on issues that impact readability and parsing (not style preferences)
 *
 * **Enabled Rules** (23 total):
 *
 * **Headings** (4 rules):
 * - MD001: Heading levels increment by one (no skipping h1 → h3)
 * - MD003: Heading style consistent (ATX style: `# Heading`)
 * - MD022: Headings surrounded by blank lines
 * - MD025: Single H1 per document
 *
 * **Code Blocks** (3 rules):
 * - MD031: Fenced code blocks surrounded by blank lines
 * - MD040: Fenced code blocks have language specified
 * - MD046: Code block style consistent (fenced, not indented)
 *
 * **Lists** (3 rules):
 * - MD004: Unordered list style consistent (dash `-`)
 * - MD005: List indentation consistent
 * - MD007: Unordered list indentation (2 spaces)
 *
 * **Whitespace** (4 rules):
 * - MD009: No trailing spaces
 * - MD010: No hard tabs
 * - MD012: No multiple consecutive blank lines
 * - MD047: File ends with single newline
 *
 * **Links/Images** (1 rule):
 * - MD045: Images have alt text (accessibility)
 *
 * **Structure** (1 rule):
 * - MD032: Lists surrounded by blank lines
 *
 * **Disabled Rules** (reasoning):
 * - MD013 (line length): Educational content has variable line lengths
 * - MD033 (inline HTML): Some HTML may be needed (e.g., `<details>`, `<sup>`)
 * - MD041 (first line h1): Lessons may start with frontmatter or metadata
 * - MD024 (duplicate headings): Sections may intentionally repeat headers
 *
 * **Token Savings**:
 * - Typical lesson: ~3000 words = ~4000 tokens
 * - Markdown errors add ~500-1000 tokens to judge prompt
 * - Early rejection saves ~1500-2000 tokens (including judge response)
 * - At 50% filter rate: ~750-1000 tokens saved per lesson on average
 *
 * @example
 * ```typescript
 * import { markdownlint } from 'markdownlint';
 * import { LESSON_MARKDOWNLINT_CONFIG } from './markdownlint-config';
 *
 * const results = markdownlint.sync({
 *   strings: {
 *     'lesson.md': lessonMarkdown,
 *   },
 *   config: LESSON_MARKDOWNLINT_CONFIG,
 * });
 *
 * if (results['lesson.md'].length > 0) {
 *   console.error('Markdown validation failed:', results['lesson.md']);
 * }
 * ```
 */
export const LESSON_MARKDOWNLINT_CONFIG: LessonMarkdownLintConfig = {
  // ============================================================================
  // GLOBAL DEFAULT
  // ============================================================================

  /**
   * Enable all rules by default, then selectively disable
   * This ensures new rules added to markdownlint are automatically enabled
   */
  default: true,

  // ============================================================================
  // HEADINGS
  // ============================================================================

  /**
   * MD001: Heading levels increment by one
   * Prevents heading hierarchy issues (h1 → h3 skip)
   *
   * Example FAIL: `# H1` followed by `### H3` (skips h2)
   * Example PASS: `# H1` followed by `## H2`
   */
  MD001: true,

  /**
   * MD003: Heading style consistent (ATX style)
   * Enforces `# Heading` style (not Setext style with underlines)
   *
   * Config: Use ATX style (hash marks)
   */
  MD003: { style: 'atx' },

  /**
   * MD022: Headings surrounded by blank lines
   * Improves readability and parsing consistency
   *
   * Config: Require blank lines above and below headings
   */
  MD022: { lines_above: 1, lines_below: 1 },

  /**
   * MD025: Single H1 per document
   * Ensures clear document structure (one main title)
   *
   * Config: Allow frontmatter before H1
   */
  MD025: { front_matter_title: '' },

  // ============================================================================
  // CODE BLOCKS
  // ============================================================================

  /**
   * MD031: Fenced code blocks surrounded by blank lines
   * Prevents parsing issues and improves readability
   */
  MD031: { list_items: true },

  /**
   * MD040: Fenced code blocks have language specified
   * Enables syntax highlighting and improves accessibility
   *
   * Config: Allow common programming languages used in educational content
   */
  MD040: {
    allowed_languages: [
      // Programming languages
      'typescript',
      'javascript',
      'python',
      'java',
      'csharp',
      'cpp',
      'c',
      'ruby',
      'go',
      'rust',
      'php',
      'swift',
      'kotlin',
      // Web technologies
      'html',
      'css',
      'scss',
      'json',
      'xml',
      'yaml',
      // Markup and config
      'markdown',
      'sql',
      'bash',
      'sh',
      'shell',
      'powershell',
      // Documentation
      'plaintext',
      'text',
      // Allow empty for generic code blocks
      '',
    ],
    // Ignored code fences: Allow empty language for small snippets
    language_only: false,
  },

  /**
   * MD046: Code block style consistent (fenced blocks)
   * Prevents mixing indented and fenced code blocks
   *
   * Config: Prefer fenced blocks (more explicit)
   */
  MD046: { style: 'fenced' },

  // ============================================================================
  // LISTS
  // ============================================================================

  /**
   * MD004: Unordered list style consistent
   * Enforces consistent bullet points (dash `-`)
   *
   * Config: Use dash style (most common in educational content)
   */
  MD004: { style: 'dash' },

  /**
   * MD005: List indentation consistent
   * Ensures all list items at same level have same indentation
   */
  MD005: true,

  /**
   * MD007: Unordered list indentation
   * Standardizes nested list indentation
   *
   * Config: 2-space indentation (common standard)
   */
  MD007: { indent: 2, start_indented: false },

  // ============================================================================
  // WHITESPACE
  // ============================================================================

  /**
   * MD009: No trailing spaces
   * Removes unnecessary whitespace
   *
   * Config: Allow 2 trailing spaces for hard line breaks
   */
  MD009: { br_spaces: 2, list_item_empty_lines: false, strict: false },

  /**
   * MD010: No hard tabs
   * Enforces spaces over tabs for consistency
   *
   * Config: Allow tabs in code blocks only
   */
  MD010: { code_blocks: false, spaces_per_tab: 2 },

  /**
   * MD012: No multiple consecutive blank lines
   * Limits blank lines to improve document density
   *
   * Config: Maximum 1 consecutive blank line
   */
  MD012: { maximum: 1 },

  /**
   * MD047: File ends with single newline
   * Standard file format (POSIX compliance)
   */
  MD047: true,

  // ============================================================================
  // LINKS AND IMAGES
  // ============================================================================

  /**
   * MD045: Images have alt text
   * Ensures accessibility for screen readers
   *
   * This is critical for educational content to be inclusive
   */
  MD045: true,

  // ============================================================================
  // STRUCTURE
  // ============================================================================

  /**
   * MD032: Lists surrounded by blank lines
   * Improves readability and parsing consistency
   */
  MD032: true,

  // ============================================================================
  // DISABLED RULES (Reasoning)
  // ============================================================================

  /**
   * MD013: Line length (DISABLED)
   *
   * Reasoning: Educational content often has:
   * - Long sentences for explanations
   * - Code examples that shouldn't wrap
   * - Tables with wide columns
   * - URLs that exceed line limits
   *
   * Enforcing line length would require excessive reformatting
   * and could harm readability in some cases.
   */
  MD013: false,

  /**
   * MD033: Inline HTML (DISABLED)
   *
   * Reasoning: Educational content may need HTML for:
   * - `<details>` / `<summary>` for collapsible sections
   * - `<sup>` / `<sub>` for mathematical notation
   * - `<mark>` for highlighting important terms
   * - Embedded interactive elements
   *
   * Strict "no HTML" would limit pedagogical options.
   */
  MD033: false,

  /**
   * MD041: First line heading (DISABLED)
   *
   * Reasoning: Lessons may start with:
   * - YAML frontmatter (metadata)
   * - Brief introduction paragraph
   * - Prerequisites or context
   *
   * Requiring H1 as first line is too restrictive.
   */
  MD041: false,

  /**
   * MD024: Duplicate headings (DISABLED)
   *
   * Reasoning: Educational content may intentionally repeat headings:
   * - "Example" sections in different parts
   * - "Summary" at section and document level
   * - Parallel structure across modules
   *
   * Allowing duplicates provides pedagogical flexibility.
   */
  MD024: false,
};

// ============================================================================
// VALIDATION RESULT TYPES
// ============================================================================

/**
 * Markdownlint validation error
 *
 * Extends the native MarkdownLintResult from the library
 */
export interface MarkdownLintValidationError {
  /** Line number where error occurred (1-based) */
  lineNumber: number;
  /** Rule ID (e.g., "MD001") */
  ruleNames: string[];
  /** Human-readable rule description */
  ruleDescription: string;
  /** Specific error details */
  errorDetail: string | null;
  /** Suggested context for the error */
  errorContext: string | null;
  /** Range of error in line (start, length) */
  errorRange: [number, number] | null;
}

/**
 * Result of markdownlint validation
 */
export interface MarkdownLintValidationResult {
  /** Whether validation passed (no errors) */
  passed: boolean;
  /** List of validation errors */
  errors: MarkdownLintValidationError[];
  /** Total error count */
  errorCount: number;
  /** Unique rule violations (for aggregation) */
  ruleViolations: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Critical markdown rules that must pass
 * These rules indicate structural issues that would break rendering
 */
export const CRITICAL_MARKDOWN_RULES = [
  'MD001', // Heading hierarchy
  'MD022', // Blank lines around headings
  'MD031', // Blank lines around code blocks
  'MD046', // Code block style
] as const;

/**
 * Major markdown rules (should pass, but not blocking)
 * These rules indicate quality issues but content is still usable
 */
export const MAJOR_MARKDOWN_RULES = [
  'MD003', // Heading style
  'MD025', // Single H1
  'MD040', // Code block language
  'MD045', // Image alt text
] as const;

/**
 * Minor markdown rules (nice to have)
 * These rules indicate style inconsistencies
 */
export const MINOR_MARKDOWN_RULES = [
  'MD004', // List style
  'MD005', // List indentation
  'MD007', // UL indentation
  'MD009', // Trailing spaces
  'MD010', // Hard tabs
  'MD012', // Multiple blanks
  'MD032', // Blanks around lists
  'MD047', // Single trailing newline
] as const;

/**
 * Mapping from rule ID to severity
 *
 * Used by HeuristicFilter to determine if markdown errors should block evaluation
 */
export const MARKDOWN_RULE_SEVERITY: Record<
  string,
  'critical' | 'major' | 'minor'
> = {
  // Critical: Structural issues
  MD001: 'critical',
  MD022: 'critical',
  MD031: 'critical',
  MD046: 'critical',

  // Major: Quality issues
  MD003: 'major',
  MD025: 'major',
  MD040: 'major',
  MD045: 'major',

  // Minor: Style inconsistencies
  MD004: 'minor',
  MD005: 'minor',
  MD007: 'minor',
  MD009: 'minor',
  MD010: 'minor',
  MD012: 'minor',
  MD032: 'minor',
  MD047: 'minor',
};
