/**
 * Mermaid Sanitizer Helper Functions
 * @module stages/stage6-lesson-content/utils/mermaid-sanitizer-helpers
 *
 * Extracted helper functions to reduce complexity of mermaid-sanitizer.ts
 * These functions represent specific fix types and diagram processing logic.
 */

import { logger } from '@/shared/logger';
import type { MermaidFix } from './mermaid-sanitizer';

/**
 * Maximum node text length before wrapping is enabled
 */
const MAX_NODE_TEXT_LENGTH = 40;

/**
 * Context for processing a single Mermaid block
 */
export interface BlockProcessingContext {
  blockIndex: number;
  sanitized: string;
  fixes: MermaidFix[];
  modified: boolean;
}

/**
 * Fix 1: Remove escaped quotes
 */
export function removeEscapedQuotes(context: BlockProcessingContext): BlockProcessingContext {
  let escapedQuotesFixed = 0;
  const sanitized = context.sanitized.replace(/\\"/g, () => {
    escapedQuotesFixed++;
    return '';
  });

  if (escapedQuotesFixed > 0) {
    context.fixes.push({
      type: 'ESCAPED_QUOTE_REMOVED',
      count: escapedQuotesFixed,
      blockIndex: context.blockIndex,
    });

    logger.debug(
      {
        blockIndex: context.blockIndex,
        quotesRemoved: escapedQuotesFixed,
      },
      'Mermaid sanitizer: fixed escaped quotes'
    );

    return { ...context, sanitized, modified: true };
  }

  return { ...context, sanitized };
}

/**
 * Fix 1.5: Remove backticks inside node labels
 */
export function removeBackticksInLabels(context: BlockProcessingContext): BlockProcessingContext {
  let backticksInLabelsFixed = 0;
  const sanitized = context.sanitized.replace(/\[`([^`\]]*)`\]/g, (_match, content) => {
    backticksInLabelsFixed++;
    return `[${content}]`;
  });

  if (backticksInLabelsFixed > 0) {
    context.fixes.push({
      type: 'BACKTICK_IN_LABEL_REMOVED',
      count: backticksInLabelsFixed,
      blockIndex: context.blockIndex,
    });

    logger.debug(
      {
        blockIndex: context.blockIndex,
        backticksFixed: backticksInLabelsFixed,
      },
      'Mermaid sanitizer: removed backticks from node labels'
    );

    return { ...context, sanitized, modified: true };
  }

  return { ...context, sanitized };
}

/**
 * Fix 2: Arrow syntax (-> to -->)
 */
export function fixArrowSyntax(context: BlockProcessingContext): BlockProcessingContext {
  let arrowsFixed = 0;
  let arrowFixedContent = '';
  let lastIndex = 0;

  for (let i = 0; i < context.sanitized.length - 1; i++) {
    if (context.sanitized[i] === '-' && context.sanitized[i + 1] === '>') {
      const before = context.sanitized[i - 1] || '';
      const after = context.sanitized[i + 2] || '';

      if (before === '-' || before === '.' || after === '-' || after === '>') {
        continue;
      }

      arrowFixedContent += context.sanitized.slice(lastIndex, i);
      arrowFixedContent += '-->';
      arrowsFixed++;
      lastIndex = i + 2;
    }
  }

  arrowFixedContent += context.sanitized.slice(lastIndex);

  if (arrowsFixed > 0) {
    context.fixes.push({
      type: 'ARROW_FIXED',
      count: arrowsFixed,
      blockIndex: context.blockIndex,
    });

    logger.debug(
      {
        blockIndex: context.blockIndex,
        arrowsFixed,
      },
      'Mermaid sanitizer: fixed arrow syntax'
    );

    return { ...context, sanitized: arrowFixedContent, modified: true };
  }

  return { ...context, sanitized: arrowFixedContent };
}

/**
 * Fix 3: Bracket balancing
 */
export function balanceBrackets(context: BlockProcessingContext): BlockProcessingContext {
  const openBrackets = (context.sanitized.match(/\[/g) || []).length;
  const closeBrackets = (context.sanitized.match(/\]/g) || []).length;
  const bracketsToAdd = openBrackets - closeBrackets;

  if (bracketsToAdd > 0) {
    const sanitized = context.sanitized + ']'.repeat(bracketsToAdd);

    context.fixes.push({
      type: 'BRACKET_BALANCED',
      count: bracketsToAdd,
      blockIndex: context.blockIndex,
    });

    logger.debug(
      {
        blockIndex: context.blockIndex,
        bracketsAdded: bracketsToAdd,
      },
      'Mermaid sanitizer: balanced brackets'
    );

    return { ...context, sanitized, modified: true };
  }

  return context;
}

/**
 * Fix 4: Brace balancing
 */
export function balanceBraces(context: BlockProcessingContext): BlockProcessingContext {
  const openBraces = (context.sanitized.match(/\{/g) || []).length;
  const closeBraces = (context.sanitized.match(/\}/g) || []).length;
  const bracesToAdd = openBraces - closeBraces;

  if (bracesToAdd > 0) {
    const sanitized = context.sanitized + '}'.repeat(bracesToAdd);

    context.fixes.push({
      type: 'BRACE_BALANCED',
      count: bracesToAdd,
      blockIndex: context.blockIndex,
    });

    logger.debug(
      {
        blockIndex: context.blockIndex,
        bracesAdded: bracesToAdd,
      },
      'Mermaid sanitizer: balanced braces'
    );

    return { ...context, sanitized, modified: true };
  }

  return context;
}

/**
 * Fix 5: Unicode normalization
 */
export function removeInvisibleUnicode(context: BlockProcessingContext): BlockProcessingContext {
  const INVISIBLE_UNICODE_REGEX = /[\u200B-\u200D\uFEFF]/g;
  const beforeUnicode = context.sanitized;
  const sanitized = context.sanitized.replace(INVISIBLE_UNICODE_REGEX, '');
  const unicodeCharsRemoved = beforeUnicode.length - sanitized.length;

  if (unicodeCharsRemoved > 0) {
    context.fixes.push({
      type: 'UNICODE_CLEANED',
      count: unicodeCharsRemoved,
      blockIndex: context.blockIndex,
    });

    logger.debug(
      {
        blockIndex: context.blockIndex,
        unicodeCharsRemoved,
      },
      'Mermaid sanitizer: removed invisible Unicode characters'
    );

    return { ...context, sanitized, modified: true };
  }

  return { ...context, sanitized };
}

/**
 * Fix 6: Auto-quote node labels with special characters
 */
export function autoQuoteLabels(context: BlockProcessingContext): BlockProcessingContext {
  let labelsQuoted = 0;
  const sanitized = context.sanitized.replace(
    /(\w+)\[([^\]"]*[(){}|<>][^\]"]*)\]/g,
    (_, id, label) => {
      labelsQuoted++;
      return `${id}["${label}"]`;
    }
  );

  if (labelsQuoted > 0) {
    context.fixes.push({
      type: 'LABEL_QUOTED',
      count: labelsQuoted,
      blockIndex: context.blockIndex,
    });

    logger.debug(
      {
        blockIndex: context.blockIndex,
        labelsQuoted,
      },
      'Mermaid sanitizer: quoted labels with special characters'
    );

    return { ...context, sanitized, modified: true };
  }

  return { ...context, sanitized };
}

/**
 * Fix 7: Escape quotes inside quoted labels with entity codes
 */
export function escapeNestedQuotes(context: BlockProcessingContext): BlockProcessingContext {
  const beforeEntityEscape = context.sanitized;
  const sanitized = escapeQuotesInLabels(context.sanitized);
  const entityEscapesApplied = beforeEntityEscape !== sanitized ? 1 : 0;

  if (entityEscapesApplied > 0) {
    context.fixes.push({
      type: 'ENTITY_ESCAPED',
      count: entityEscapesApplied,
      blockIndex: context.blockIndex,
    });

    logger.debug(
      {
        blockIndex: context.blockIndex,
        entityEscapesApplied,
      },
      'Mermaid sanitizer: escaped nested quotes with entity codes'
    );

    return { ...context, sanitized, modified: true };
  }

  return { ...context, sanitized };
}

/**
 * Helper: Escape quotes inside quoted labels
 */
function escapeQuotesInLabels(content: string): string {
  return content.replace(/\["([^"]*)"/g, (match, prefix) => {
    const remainingQuotes = (match.match(/"/g) || []).length - 1;

    if (remainingQuotes > 1) {
      return `["${prefix}#quot;`.replace(/"/g, (q, offset) => {
        return offset === 0 ? q : '#quot;';
      });
    }

    return match;
  });
}

/**
 * Fix 8: Subgraph end keyword balancing
 */
export function balanceSubgraphEnds(context: BlockProcessingContext): BlockProcessingContext {
  const subgraphCount = (context.sanitized.match(/\bsubgraph\b/g) || []).length;
  const endCount = (context.sanitized.match(/\bend\b/g) || []).length;
  const endsToAdd = subgraphCount - endCount;

  if (endsToAdd > 0) {
    const sanitized = context.sanitized + '\n' + 'end\n'.repeat(endsToAdd);

    context.fixes.push({
      type: 'SUBGRAPH_END_ADDED',
      count: endsToAdd,
      blockIndex: context.blockIndex,
    });

    logger.debug(
      {
        blockIndex: context.blockIndex,
        endsAdded: endsToAdd,
      },
      'Mermaid sanitizer: added missing subgraph end keywords'
    );

    return { ...context, sanitized, modified: true };
  }

  return context;
}

/**
 * Fix 9: Remove raw quotes from node labels
 */
export function removeRawQuotes(context: BlockProcessingContext): BlockProcessingContext {
  let rawQuotesRemoved = 0;
  const sanitized = context.sanitized.replace(
    /(\w+)\[([^\]]*)"([^\]"]*)"([^\]]*)\]/g,
    (_, id, before, quoted, after) => {
      rawQuotesRemoved++;
      return `${id}[${before}${quoted}${after}]`;
    }
  );

  if (rawQuotesRemoved > 0) {
    context.fixes.push({
      type: 'RAW_QUOTE_REMOVED',
      count: rawQuotesRemoved,
      blockIndex: context.blockIndex,
    });

    logger.debug(
      {
        blockIndex: context.blockIndex,
        rawQuotesRemoved,
      },
      'Mermaid sanitizer: removed raw quotes from node labels'
    );

    return { ...context, sanitized, modified: true };
  }

  return { ...context, sanitized };
}

/**
 * Fix 10: Escape special characters in edge labels
 */
export function fixEdgeLabels(context: BlockProcessingContext): BlockProcessingContext {
  let edgeLabelsFixed = 0;
  const sanitized = context.sanitized.replace(
    /\|([^|]*[()][^|]*)\|/g,
    (_: string, label: string) => {
      edgeLabelsFixed++;
      const cleaned = label.replace(/[()]/g, '');
      return `|${cleaned}|`;
    }
  );

  if (edgeLabelsFixed > 0) {
    context.fixes.push({
      type: 'EDGE_LABEL_ESCAPED',
      count: edgeLabelsFixed,
      blockIndex: context.blockIndex,
    });

    logger.debug(
      {
        blockIndex: context.blockIndex,
        edgeLabelsFixed,
      },
      'Mermaid sanitizer: fixed special characters in edge labels'
    );

    return { ...context, sanitized, modified: true };
  }

  return { ...context, sanitized };
}

/**
 * Fix 11: Convert long node texts to Markdown strings
 */
export function wrapLongTexts(context: BlockProcessingContext): BlockProcessingContext {
  let longTextsWrapped = 0;
  let sanitized = context.sanitized;

  // Helper to wrap long text
  const wrapLongText = (text: string): string | null => {
    if (text.length > MAX_NODE_TEXT_LENGTH && !text.startsWith('`') && !text.endsWith('`')) {
      return `\`${text}\``;
    }
    return null;
  };

  // 1. Rectangle with quotes: A["Long text"]
  sanitized = sanitized.replace(
    /(\w+)\["([^"]+)"\]/g,
    (match: string, id: string, text: string) => {
      const wrapped = wrapLongText(text);
      if (wrapped) {
        longTextsWrapped++;
        return `${id}["${wrapped}"]`;
      }
      return match;
    }
  );

  // 2. Rectangle without quotes: A[Long text]
  sanitized = sanitized.replace(
    /(\w+)\[([^\]"``({}]+)\]/g,
    (match: string, id: string, text: string) => {
      const wrapped = wrapLongText(text);
      if (wrapped) {
        longTextsWrapped++;
        return `${id}["${wrapped}"]`;
      }
      return match;
    }
  );

  // 3. Stadium with quotes: A("Long text")
  sanitized = sanitized.replace(
    /(\w+)\("([^"]+)"\)/g,
    (match: string, id: string, text: string) => {
      const wrapped = wrapLongText(text);
      if (wrapped) {
        longTextsWrapped++;
        return `${id}("${wrapped}")`;
      }
      return match;
    }
  );

  // 4. Stadium without quotes: A(Long text)
  sanitized = sanitized.replace(
    /(\w+)\(([^()"``][^)"``]*)\)/g,
    (match: string, id: string, text: string) => {
      if (text.startsWith('(') || text.endsWith(')')) {
        return match;
      }
      const wrapped = wrapLongText(text);
      if (wrapped) {
        longTextsWrapped++;
        return `${id}("${wrapped}")`;
      }
      return match;
    }
  );

  // 5. Rhombus with quotes: A{"Long text"}
  sanitized = sanitized.replace(
    /(\w+)\{"([^"]+)"\}/g,
    (match: string, id: string, text: string) => {
      const wrapped = wrapLongText(text);
      if (wrapped) {
        longTextsWrapped++;
        return `${id}{"${wrapped}"}`;
      }
      return match;
    }
  );

  // 6. Rhombus without quotes: A{Long text}
  sanitized = sanitized.replace(
    /(\w+)\{([^{}"``][^}"``]*)\}/g,
    (match: string, id: string, text: string) => {
      if (text.startsWith('{') || text.endsWith('}')) {
        return match;
      }
      const wrapped = wrapLongText(text);
      if (wrapped) {
        longTextsWrapped++;
        return `${id}{"${wrapped}"}`;
      }
      return match;
    }
  );

  // 7. Circle with quotes: A(("Long text"))
  sanitized = sanitized.replace(
    /(\w+)\(\("([^"]+)"\)\)/g,
    (match: string, id: string, text: string) => {
      const wrapped = wrapLongText(text);
      if (wrapped) {
        longTextsWrapped++;
        return `${id}(("${wrapped}"))`;
      }
      return match;
    }
  );

  // 8. Circle without quotes: A((Long text))
  sanitized = sanitized.replace(
    /(\w+)\(\(([^)"``]+)\)\)/g,
    (match: string, id: string, text: string) => {
      const wrapped = wrapLongText(text);
      if (wrapped) {
        longTextsWrapped++;
        return `${id}(("${wrapped}"))`;
      }
      return match;
    }
  );

  if (longTextsWrapped > 0) {
    context.fixes.push({
      type: 'LONG_TEXT_WRAPPED',
      count: longTextsWrapped,
      blockIndex: context.blockIndex,
    });

    logger.debug(
      {
        blockIndex: context.blockIndex,
        longTextsWrapped,
      },
      'Mermaid sanitizer: converted long texts to markdown strings for wrapping'
    );

    return { ...context, sanitized, modified: true };
  }

  return { ...context, sanitized };
}

/**
 * Process a single Mermaid block through all fix phases
 *
 * @param mermaidContent - Raw Mermaid diagram content
 * @param blockIndex - Block index for tracking
 * @returns Processed context with fixes
 */
export function processMermaidBlock(
  mermaidContent: string,
  blockIndex: number
): BlockProcessingContext {
  let context: BlockProcessingContext = {
    blockIndex,
    sanitized: mermaidContent,
    fixes: [],
    modified: false,
  };

  // Apply all fixes in sequence
  context = removeEscapedQuotes(context);
  context = removeBackticksInLabels(context);
  context = fixArrowSyntax(context);
  context = balanceBrackets(context);
  context = balanceBraces(context);
  context = removeInvisibleUnicode(context);
  context = autoQuoteLabels(context);
  context = escapeNestedQuotes(context);
  context = balanceSubgraphEnds(context);
  context = removeRawQuotes(context);
  context = fixEdgeLabels(context);
  context = wrapLongTexts(context);

  return context;
}
