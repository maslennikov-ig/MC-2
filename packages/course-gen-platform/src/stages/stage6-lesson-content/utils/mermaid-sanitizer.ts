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
  type: 'ESCAPED_QUOTE_REMOVED' | 'ESCAPED_QUOTE_ENTITY';
  /** Number of occurrences fixed */
  count: number;
  /** Block index (0-based) */
  blockIndex: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Regex to match Mermaid code blocks in markdown
 * Captures the content between ```mermaid and ``` delimiters
 * Exported for reuse in heuristic-filter.ts
 */
export const MERMAID_BLOCK_REGEX = /```mermaid\s*([\s\S]*?)```/g;

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Sanitize Mermaid blocks in markdown content
 *
 * Finds all Mermaid code blocks and fixes common syntax issues:
 * - Removes escaped quotes `\"` that break rendering
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
 * \`\`\`
 * `;
 *
 * const result = sanitizeMermaidBlocks(raw);
 * // result.content contains:
 * // A[Контакт: Обещал ответ]
 * // result.modified === true
 * // result.fixes === [{ type: 'ESCAPED_QUOTE_REMOVED', count: 2, blockIndex: 0 }]
 * ```
 */
export function sanitizeMermaidBlocks(content: string): MermaidSanitizeResult {
  const fixes: MermaidFix[] = [];
  let blocksProcessed = 0;
  let modified = false;

  const sanitizedContent = content.replace(MERMAID_BLOCK_REGEX, (_match, mermaidContent: string) => {
    const blockIndex = blocksProcessed++;
    let sanitized = mermaidContent;
    let escapedQuotesFixed = 0;

    // Fix escaped quotes: \" -> remove entirely
    // This is the safest approach - quotes inside node labels are rarely needed
    // Single-pass replacement with counter (performance optimization)
    sanitized = sanitized.replace(/\\"/g, () => {
      escapedQuotesFixed++;
      return '';
    });

    // Track fixes
    if (escapedQuotesFixed > 0) {
      fixes.push({
        type: 'ESCAPED_QUOTE_REMOVED',
        count: escapedQuotesFixed,
        blockIndex,
      });
      modified = true;

      logger.debug({
        blockIndex,
        quotesRemoved: escapedQuotesFixed,
      }, 'Mermaid sanitizer: fixed escaped quotes');
    }

    return `\`\`\`mermaid\n${sanitized}\`\`\``;
  });

  if (modified) {
    logger.info({
      blocksProcessed,
      totalFixes: fixes.length,
      fixDetails: fixes,
    }, 'Mermaid sanitizer: content modified');
  }

  return {
    content: sanitizedContent,
    modified,
    blocksProcessed,
    fixes,
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

    // Check for unclosed brackets (basic check)
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
