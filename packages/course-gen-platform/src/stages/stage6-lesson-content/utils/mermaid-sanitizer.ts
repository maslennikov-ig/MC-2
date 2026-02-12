/**
 * Mermaid Diagram Sanitizer
 * @module stages/stage6-lesson-content/utils/mermaid-sanitizer
 *
 * Automatically fixes common Mermaid syntax issues after LLM generation.
 * Primary issue: LLMs generate escaped quotes `\"...\"` inside node labels,
 * which breaks Mermaid rendering.
 *
 * Solutions:
 * - Remove escaped quotes entirely (preferred for simplicity)
 * - Replace with entity codes `#quot;` for cases where quotes are meaningful
 *
 * Reference: https://mermaid.js.org/syntax/flowchart.html#entity-codes-to-escape-characters
 */

import { logger } from '@/shared/logger';
import { processMermaidBlock } from './mermaid-sanitizer-helpers';

// ============================================================================
// TYPES
// ============================================================================

export interface MermaidSanitizeResult {
  /** Sanitized content */
  content: string;
  /** Whether any changes were made */
  modified: boolean;
  /** Number of Mermaid blocks processed */
  blocksProcessed: number;
  /** Details of fixes applied */
  fixes: MermaidFix[];
}

export interface MermaidFix {
  /** Type of fix applied */
  type:
    | 'ESCAPED_QUOTE_REMOVED'
    | 'ESCAPED_QUOTE_ENTITY'
    | 'ARROW_FIXED'
    | 'BRACKET_BALANCED'
    | 'BRACE_BALANCED'
    | 'UNICODE_CLEANED'
    | 'LABEL_QUOTED'
    | 'ENTITY_ESCAPED'
    | 'SUBGRAPH_END_ADDED'
    | 'RAW_QUOTE_REMOVED'
    | 'EDGE_LABEL_ESCAPED'
    | 'LONG_TEXT_WRAPPED'
    | 'BACKTICK_IN_LABEL_REMOVED';
  /** Number of occurrences fixed */
  count: number;
  /** Block index (0-based) */
  blockIndex: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum content size for sanitization (50KB)
 * Prevents ReDoS and memory issues with very large content
 */
const MAX_CONTENT_SIZE_FOR_SANITIZATION = 50_000;

/**
 * Regex to match Mermaid code blocks in markdown
 * Captures the content between ```mermaid and ``` delimiters
 * Exported for reuse in heuristic-filter.ts
 */
export const MERMAID_BLOCK_REGEX = /```mermaid\s*([\s\S]*?)```/g;

/**
 * Invisible Unicode characters to remove from Mermaid diagrams.
 * These characters are often copy-pasted from rich text and break parsing:
 * - \u200B: Zero-width space
 * - \u200C: Zero-width non-joiner
 * - \u200D: Zero-width joiner
 * - \uFEFF: Zero-width no-break space (BOM)
 */
const INVISIBLE_UNICODE_REGEX = /[\u200B-\u200D\uFEFF]/g;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if content contains invalid arrow syntax (-> instead of -->)
 * Safe version without lookbehind ReDoS vulnerability
 *
 * @param content - Mermaid diagram content
 * @returns True if invalid arrow syntax is found
 */
function hasInvalidArrowSyntax(content: string): boolean {
  for (let i = 0; i < content.length - 1; i++) {
    if (content[i] === '-' && content[i + 1] === '>') {
      const before = content[i - 1] || '';
      const after = content[i + 2] || '';

      // Invalid if NOT part of: --> or -.-> or ->> or .->
      if (before !== '-' && before !== '.' && after !== '-' && after !== '>') {
        return true;
      }
    }
  }
  return false;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Sanitize Mermaid blocks in markdown content
 *
 * Finds all Mermaid code blocks and fixes common syntax issues:
 * - Removes escaped quotes `\"` that break rendering
 * - Fixes arrow syntax: `->` to `-->`
 * - Balances unclosed brackets `[]`
 * - Balances unclosed braces `{}`
 * - Removes invisible Unicode characters
 * - Auto-quotes node labels containing special characters
 * - Escapes nested quotes with entity codes
 * - Balances subgraph/end keywords
 *
 * @param content - Raw markdown content with potential Mermaid blocks
 * @returns Sanitized content with fix details
 *
 * @example
 * ```typescript
 * const raw = `
 * \`\`\`mermaid
 * flowchart TD
 *     A[Контакт: \\"Обещал ответ\\"]
 *     A -> B
 *     C[Label (with special chars)
 * \`\`\`
 * `;
 *
 * const result = sanitizeMermaidBlocks(raw);
 * // result.content contains:
 * // A[Контакт: Обещал ответ]
 * // A --> B
 * // C["Label (with special chars)"]
 * // result.modified === true
 * // result.fixes includes multiple fix types
 * ```
 */
export function sanitizeMermaidBlocks(content: string): MermaidSanitizeResult {
  // Guard: Content size limit to prevent ReDoS
  if (content.length > MAX_CONTENT_SIZE_FOR_SANITIZATION) {
    logger.warn(
      { contentLength: content.length, limit: MAX_CONTENT_SIZE_FOR_SANITIZATION },
      'Mermaid sanitizer: Content too large, skipping sanitization'
    );
    return {
      content,
      modified: false,
      blocksProcessed: 0,
      fixes: [],
    };
  }

  const allFixes: MermaidFix[] = [];
  let blocksProcessed = 0;
  let modified = false;

  const sanitizedContent = content.replace(
    MERMAID_BLOCK_REGEX,
    (_match, mermaidContent: string) => {
      const blockIndex = blocksProcessed++;

      // Process block through all fix phases
      const result = processMermaidBlock(mermaidContent, blockIndex);

      // Accumulate fixes
      allFixes.push(...result.fixes);
      if (result.modified) {
        modified = true;
      }

      return `\`\`\`mermaid\n${result.sanitized}\`\`\``;
    }
  );

  if (modified) {
    logger.info(
      {
        blocksProcessed,
        totalFixes: allFixes.length,
        fixDetails: allFixes,
      },
      'Mermaid sanitizer: content modified'
    );
  }

  return {
    content: sanitizedContent,
    modified,
    blocksProcessed,
    fixes: allFixes,
  };
}

/**
 * Check if content contains potentially broken Mermaid syntax
 *
 * Quick check without modification - useful for pre-validation.
 *
 * @param content - Content to check
 * @returns True if broken Mermaid syntax detected
 */
export function hasBrokenMermaidSyntax(content: string): boolean {
  // Extract all Mermaid blocks
  const mermaidBlocks: string[] = [];
  content.replace(MERMAID_BLOCK_REGEX, (_, mermaidContent: string) => {
    mermaidBlocks.push(mermaidContent);
    return '';
  });

  // Check each block for issues
  for (const block of mermaidBlocks) {
    // Check for escaped quotes
    if (/\\"/.test(block)) {
      return true;
    }

    // Check for invalid arrow syntax (-> instead of -->)
    // Uses safe helper function instead of vulnerable regex lookbehind
    if (hasInvalidArrowSyntax(block)) {
      return true;
    }

    // Check for unclosed brackets
    const openBrackets = (block.match(/\[/g) || []).length;
    const closeBrackets = (block.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      return true;
    }

    // Check for unclosed braces
    const openBraces = (block.match(/\{/g) || []).length;
    const closeBraces = (block.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      return true;
    }

    // Check for invisible Unicode characters
    if (INVISIBLE_UNICODE_REGEX.test(block)) {
      // Reset lastIndex after test() on global regex
      INVISIBLE_UNICODE_REGEX.lastIndex = 0;
      return true;
    }

    // Check for unquoted labels with special characters
    if (/(\w+)\[([^\]"]*[(){}|<>][^\]"]*)\]/.test(block)) {
      return true;
    }

    // Check for unbalanced subgraph/end keywords
    const subgraphCount = (block.match(/\bsubgraph\b/g) || []).length;
    const endCount = (block.match(/\bend\b/g) || []).length;
    if (subgraphCount !== endCount) {
      return true;
    }

    // Check for raw quotes in node labels (causes 'got STR' errors)
    // Pattern: A[text: "quoted"] → BAD (quotes in middle of label)
    // But NOT: A["text"] or A["`text`"] → OK (quoted labels / markdown strings)
    // The difference: content exists BEFORE the first quote
    if (/\w+\[[^\]"]+[""][^\]"]*[""][^\]]*\]/.test(block)) {
      return true;
    }

    // Check for parentheses in edge labels (causes 'got PS' errors)
    if (/\|[^|]*[()][^|]*\|/.test(block)) {
      return true;
    }

    // Check for backticks inside node labels (causes parse errors)
    // Pattern: [`text`] is invalid Mermaid syntax
    if (/\[`[^`\]]*`\]/.test(block)) {
      return true;
    }
  }

  return false;
}

/**
 * Count Mermaid blocks in content
 *
 * @param content - Markdown content
 * @returns Number of Mermaid blocks found
 */
export function countMermaidBlocks(content: string): number {
  const matches = content.match(MERMAID_BLOCK_REGEX);
  return matches ? matches.length : 0;
}
