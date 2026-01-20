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
    | 'LONG_TEXT_WRAPPED';
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
 * Maximum node text length before wrapping is enabled
 * Longer texts will be converted to Markdown strings for automatic wrapping
 */
const MAX_NODE_TEXT_LENGTH = 40;

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

/**
 * Escape quotes inside quoted labels using entity codes
 *
 * Mermaid allows node labels like: A["text with quotes"]
 * But nested quotes break parsing: A["text "nested" quotes"] ❌
 * This function escapes nested quotes: A["text #quot;nested#quot; quotes"] ✅
 *
 * **Algorithm:**
 * 1. Match pattern: [" followed by any characters and a quote
 * 2. Count total quotes in match (subtract 1 for opening quote)
 * 3. If > 1 remaining quotes, escape all except the first
 *
 * **Edge cases:**
 * - A["simple"] → no change (1 quote = closing quote)
 * - A["has "one" nested"] → A["has #quot;one#quot; nested"]
 * - A["has "two" "nested""] → all inner quotes escaped
 *
 * @param content - Mermaid diagram content
 * @returns Content with escaped quotes in labels
 *
 * @example
 * // Single nested quote
 * escapeQuotesInLabels('A["Contact: "John""]');
 * // Returns: 'A["Contact: #quot;John#quot;"]'
 *
 * @example
 * // Multiple nested quotes
 * escapeQuotesInLabels('B["Say "hello" and "goodbye""]');
 * // Returns: 'B["Say #quot;hello#quot; and #quot;goodbye#quot;"]'
 */
function escapeQuotesInLabels(content: string): string {
  return content.replace(/\["([^"]*)"/g, (match, prefix) => {
    // Count how many quotes remain after the first opening quote
    const remainingQuotes = (match.match(/"/g) || []).length - 1; // Subtract the opening quote

    if (remainingQuotes > 1) {
      // Has nested quotes - escape all quotes after the first one
      return `["${prefix}#quot;`.replace(/"/g, (q, offset) => {
        // Keep the first quote (after bracket), escape the rest
        return offset === 0 ? q : '#quot;';
      });
    }

    return match;
  });
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

  const fixes: MermaidFix[] = [];
  let blocksProcessed = 0;
  let modified = false;

  const sanitizedContent = content.replace(
    MERMAID_BLOCK_REGEX,
    (_match, mermaidContent: string) => {
      const blockIndex = blocksProcessed++;
      let sanitized = mermaidContent;

      // -------------------------------------------------------------------------
      // Fix 1: Remove escaped quotes (existing functionality)
      // -------------------------------------------------------------------------
      let escapedQuotesFixed = 0;
      sanitized = sanitized.replace(/\\"/g, () => {
        escapedQuotesFixed++;
        return '';
      });

      if (escapedQuotesFixed > 0) {
        fixes.push({
          type: 'ESCAPED_QUOTE_REMOVED',
          count: escapedQuotesFixed,
          blockIndex,
        });
        modified = true;

        logger.debug(
          {
            blockIndex,
            quotesRemoved: escapedQuotesFixed,
          },
          'Mermaid sanitizer: fixed escaped quotes'
        );
      }

      // -------------------------------------------------------------------------
      // Fix 2: Arrow syntax (-> to -->)
      // Safe version without lookbehind ReDoS vulnerability
      // -------------------------------------------------------------------------
      let arrowsFixed = 0;
      // Uses loop to manually check context instead of vulnerable regex lookbehind
      let arrowFixedContent = '';
      let lastIndex = 0;

      for (let i = 0; i < sanitized.length - 1; i++) {
        if (sanitized[i] === '-' && sanitized[i + 1] === '>') {
          const before = sanitized[i - 1] || '';
          const after = sanitized[i + 2] || '';

          // Don't replace if part of: --> or -.-> or ->> or .->
          if (before === '-' || before === '.' || after === '-' || after === '>') {
            continue;
          }

          // Add content before this match
          arrowFixedContent += sanitized.slice(lastIndex, i);
          // Add the replacement
          arrowFixedContent += '-->';
          arrowsFixed++;
          // Skip the original '->'
          lastIndex = i + 2;
        }
      }
      // Add remaining content
      arrowFixedContent += sanitized.slice(lastIndex);
      sanitized = arrowFixedContent;

      if (arrowsFixed > 0) {
        fixes.push({
          type: 'ARROW_FIXED',
          count: arrowsFixed,
          blockIndex,
        });
        modified = true;

        logger.debug(
          {
            blockIndex,
            arrowsFixed,
          },
          'Mermaid sanitizer: fixed arrow syntax'
        );
      }

      // -------------------------------------------------------------------------
      // Fix 3: Bracket balancing
      // -------------------------------------------------------------------------
      const openBrackets = (sanitized.match(/\[/g) || []).length;
      const closeBrackets = (sanitized.match(/\]/g) || []).length;
      const bracketsToAdd = openBrackets - closeBrackets;

      if (bracketsToAdd > 0) {
        sanitized += ']'.repeat(bracketsToAdd);
        fixes.push({
          type: 'BRACKET_BALANCED',
          count: bracketsToAdd,
          blockIndex,
        });
        modified = true;

        logger.debug(
          {
            blockIndex,
            bracketsAdded: bracketsToAdd,
          },
          'Mermaid sanitizer: balanced brackets'
        );
      }

      // -------------------------------------------------------------------------
      // Fix 4: Brace balancing
      // -------------------------------------------------------------------------
      const openBraces = (sanitized.match(/\{/g) || []).length;
      const closeBraces = (sanitized.match(/\}/g) || []).length;
      const bracesToAdd = openBraces - closeBraces;

      if (bracesToAdd > 0) {
        sanitized += '}'.repeat(bracesToAdd);
        fixes.push({
          type: 'BRACE_BALANCED',
          count: bracesToAdd,
          blockIndex,
        });
        modified = true;

        logger.debug(
          {
            blockIndex,
            bracesAdded: bracesToAdd,
          },
          'Mermaid sanitizer: balanced braces'
        );
      }

      // -------------------------------------------------------------------------
      // Fix 5: Unicode normalization (remove invisible characters)
      // -------------------------------------------------------------------------
      const beforeUnicode = sanitized;
      sanitized = sanitized.replace(INVISIBLE_UNICODE_REGEX, '');
      const unicodeCharsRemoved = beforeUnicode.length - sanitized.length;

      if (unicodeCharsRemoved > 0) {
        fixes.push({
          type: 'UNICODE_CLEANED',
          count: unicodeCharsRemoved,
          blockIndex,
        });
        modified = true;

        logger.debug(
          {
            blockIndex,
            unicodeCharsRemoved,
          },
          'Mermaid sanitizer: removed invisible Unicode characters'
        );
      }

      // -------------------------------------------------------------------------
      // Fix 6: Auto-quote node labels with special characters
      // -------------------------------------------------------------------------
      let labelsQuoted = 0;
      sanitized = sanitized.replace(/(\w+)\[([^\]"]*[(){}|<>][^\]"]*)\]/g, (_, id, label) => {
        labelsQuoted++;
        return `${id}["${label}"]`;
      });

      if (labelsQuoted > 0) {
        fixes.push({
          type: 'LABEL_QUOTED',
          count: labelsQuoted,
          blockIndex,
        });
        modified = true;

        logger.debug(
          {
            blockIndex,
            labelsQuoted,
          },
          'Mermaid sanitizer: quoted labels with special characters'
        );
      }

      // -------------------------------------------------------------------------
      // Fix 7: Escape quotes inside quoted labels with entity codes
      // -------------------------------------------------------------------------
      const beforeEntityEscape = sanitized;
      sanitized = escapeQuotesInLabels(sanitized);
      const entityEscapesApplied = beforeEntityEscape !== sanitized ? 1 : 0;

      if (entityEscapesApplied > 0) {
        fixes.push({
          type: 'ENTITY_ESCAPED',
          count: entityEscapesApplied,
          blockIndex,
        });
        modified = true;

        logger.debug(
          {
            blockIndex,
            entityEscapesApplied,
          },
          'Mermaid sanitizer: escaped nested quotes with entity codes'
        );
      }

      // -------------------------------------------------------------------------
      // Fix 8: Subgraph end keyword balancing
      // -------------------------------------------------------------------------
      const subgraphCount = (sanitized.match(/\bsubgraph\b/g) || []).length;
      const endCount = (sanitized.match(/\bend\b/g) || []).length;
      const endsToAdd = subgraphCount - endCount;

      if (endsToAdd > 0) {
        sanitized += '\n' + 'end\n'.repeat(endsToAdd);
        fixes.push({
          type: 'SUBGRAPH_END_ADDED',
          count: endsToAdd,
          blockIndex,
        });
        modified = true;

        logger.debug(
          {
            blockIndex,
            endsAdded: endsToAdd,
          },
          'Mermaid sanitizer: added missing subgraph end keywords'
        );
      }

      // -------------------------------------------------------------------------
      // Fix 9: Remove raw quotes from node labels (not escaped with \)
      // Pattern: A[Text: "quoted"] → A[Text: quoted]
      // These cause 'got STR' parse errors in Mermaid
      // -------------------------------------------------------------------------
      let rawQuotesRemoved = 0;
      sanitized = sanitized.replace(
        /(\w+)\[([^\]]*)"([^\]"]*)"([^\]]*)\]/g,
        (_, id, before, quoted, after) => {
          rawQuotesRemoved++;
          // Remove the quotes, keep the content
          return `${id}[${before}${quoted}${after}]`;
        }
      );

      if (rawQuotesRemoved > 0) {
        fixes.push({
          type: 'RAW_QUOTE_REMOVED',
          count: rawQuotesRemoved,
          blockIndex,
        });
        modified = true;

        logger.debug(
          {
            blockIndex,
            rawQuotesRemoved,
          },
          'Mermaid sanitizer: removed raw quotes from node labels'
        );
      }

      // -------------------------------------------------------------------------
      // Fix 10: Escape special characters in edge labels |...|
      // Pattern: -->|Text (with parens)| → -->|Text with parens|
      // Parentheses in edge labels cause 'got PS' parse errors
      // -------------------------------------------------------------------------
      let edgeLabelsFixed = 0;
      sanitized = sanitized.replace(/\|([^|]*[()][^|]*)\|/g, (_, label) => {
        edgeLabelsFixed++;
        // Remove parentheses from edge labels
        const cleaned = label.replace(/[()]/g, '');
        return `|${cleaned}|`;
      });

      if (edgeLabelsFixed > 0) {
        fixes.push({
          type: 'EDGE_LABEL_ESCAPED',
          count: edgeLabelsFixed,
          blockIndex,
        });
        modified = true;

        logger.debug(
          {
            blockIndex,
            edgeLabelsFixed,
          },
          'Mermaid sanitizer: fixed special characters in edge labels'
        );
      }

      // -------------------------------------------------------------------------
      // Fix 11: Convert long node texts to Markdown strings for auto-wrapping
      // Mermaid Markdown strings automatically wrap long text
      //
      // Supported node types:
      //   A["text"] / A[text]     → rectangle
      //   A("text") / A(text)     → stadium (rounded rectangle)
      //   A{"text"} / A{text}     → rhombus (decision)
      //   A(("text")) / A((text)) → circle
      // -------------------------------------------------------------------------
      let longTextsWrapped = 0;

      /**
       * Helper to wrap long text in markdown string format
       */
      const wrapLongText = (text: string): string | null => {
        if (text.length > MAX_NODE_TEXT_LENGTH && !text.startsWith('`') && !text.endsWith('`')) {
          return `\`${text}\``;
        }
        return null;
      };

      // 1. Rectangle with quotes: A["Long text"] → A["`Long text`"]
      sanitized = sanitized.replace(/(\w+)\["([^"]+)"\]/g, (match, id, text) => {
        const wrapped = wrapLongText(text);
        if (wrapped) {
          longTextsWrapped++;
          return `${id}["${wrapped}"]`;
        }
        return match;
      });

      // 2. Rectangle without quotes: A[Long text] → A["`Long text`"]
      // Skip if contains shape indicators: (), {}
      sanitized = sanitized.replace(/(\w+)\[([^\]"``({}]+)\]/g, (match, id, text) => {
        const wrapped = wrapLongText(text);
        if (wrapped) {
          longTextsWrapped++;
          return `${id}["${wrapped}"]`;
        }
        return match;
      });

      // 3. Stadium (rounded) with quotes: A("Long text") → A("`Long text`")
      sanitized = sanitized.replace(/(\w+)\("([^"]+)"\)/g, (match, id, text) => {
        const wrapped = wrapLongText(text);
        if (wrapped) {
          longTextsWrapped++;
          return `${id}("${wrapped}")`;
        }
        return match;
      });

      // 4. Stadium without quotes: A(Long text) → A("`Long text`")
      // Must not start with ( to avoid matching circles A((text))
      sanitized = sanitized.replace(/(\w+)\(([^()"``][^)"``]*)\)/g, (match, id, text) => {
        // Skip if it looks like a circle indicator or is too short
        if (text.startsWith('(') || text.endsWith(')')) {
          return match;
        }
        const wrapped = wrapLongText(text);
        if (wrapped) {
          longTextsWrapped++;
          return `${id}("${wrapped}")`;
        }
        return match;
      });

      // 5. Rhombus (decision) with quotes: A{"Long text"} → A{"`Long text`"}
      sanitized = sanitized.replace(/(\w+)\{"([^"]+)"\}/g, (match, id, text) => {
        const wrapped = wrapLongText(text);
        if (wrapped) {
          longTextsWrapped++;
          return `${id}{"${wrapped}"}`;
        }
        return match;
      });

      // 6. Rhombus without quotes: A{Long text} → A{"`Long text`"}
      // Must not start with { to avoid matching hexagons A{{text}}
      sanitized = sanitized.replace(/(\w+)\{([^{}"``][^}"``]*)\}/g, (match, id, text) => {
        // Skip if it looks like a hexagon indicator
        if (text.startsWith('{') || text.endsWith('}')) {
          return match;
        }
        const wrapped = wrapLongText(text);
        if (wrapped) {
          longTextsWrapped++;
          return `${id}{"${wrapped}"}`;
        }
        return match;
      });

      // 7. Circle with quotes: A(("Long text")) → A(("`Long text`"))
      sanitized = sanitized.replace(/(\w+)\(\("([^"]+)"\)\)/g, (match, id, text) => {
        const wrapped = wrapLongText(text);
        if (wrapped) {
          longTextsWrapped++;
          return `${id}(("${wrapped}"))`;
        }
        return match;
      });

      // 8. Circle without quotes: A((Long text)) → A(("`Long text`"))
      sanitized = sanitized.replace(/(\w+)\(\(([^)"``]+)\)\)/g, (match, id, text) => {
        const wrapped = wrapLongText(text);
        if (wrapped) {
          longTextsWrapped++;
          return `${id}(("${wrapped}"))`;
        }
        return match;
      });

      if (longTextsWrapped > 0) {
        fixes.push({
          type: 'LONG_TEXT_WRAPPED',
          count: longTextsWrapped,
          blockIndex,
        });
        modified = true;

        logger.debug(
          {
            blockIndex,
            longTextsWrapped,
          },
          'Mermaid sanitizer: converted long texts to markdown strings for wrapping'
        );
      }

      return `\`\`\`mermaid\n${sanitized}\`\`\``;
    }
  );

  if (modified) {
    logger.info(
      {
        blocksProcessed,
        totalFixes: fixes.length,
        fixDetails: fixes,
      },
      'Mermaid sanitizer: content modified'
    );
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
    if (/\w+\[[^\]]*"[^\]"]*"[^\]]*\]/.test(block)) {
      return true;
    }

    // Check for parentheses in edge labels (causes 'got PS' errors)
    if (/\|[^|]*[()][^|]*\|/.test(block)) {
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
