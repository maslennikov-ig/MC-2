/**
 * Tests for stage6-lesson-content/utils/mermaid-sanitizer-helpers.ts
 *
 * Covers all 11 pure fix functions and the processMermaidBlock orchestrator.
 * No external dependencies — all functions are pure string transformations.
 */

import { describe, it, expect } from 'vitest';
import {
    removeEscapedQuotes,
    removeBackticksInLabels,
    fixArrowSyntax,
    balanceBrackets,
    balanceBraces,
    removeInvisibleUnicode,
    autoQuoteLabels,
    balanceSubgraphEnds,
    removeRawQuotes,
    fixEdgeLabels,
    wrapLongTexts,
    processMermaidBlock,
    type BlockProcessingContext,
} from '@/stages/stage6-lesson-content/utils/mermaid-sanitizer-helpers';

// Helper to create a fresh context
function makeCtx(content: string, blockIndex = 0): BlockProcessingContext {
    return { blockIndex, sanitized: content, fixes: [], modified: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// removeEscapedQuotes
// ─────────────────────────────────────────────────────────────────────────────

describe('removeEscapedQuotes', () => {
    it('removes escaped quotes and marks as modified', () => {
        // Use explicit double backslash to get a single literal backslash in the string
        const ctx = makeCtx('A[\\"Node label\\"]');
        const result = removeEscapedQuotes(ctx);
        expect(result.sanitized).not.toContain('\\"');
        expect(result.modified).toBe(true);
        expect(result.fixes).toHaveLength(1);
        expect(result.fixes[0].type).toBe('ESCAPED_QUOTE_REMOVED');
    });

    it('counts multiple escaped quotes', () => {
        const ctx = makeCtx('A[\\"a\\"] --> B[\\"b\\"]');
        const result = removeEscapedQuotes(ctx);
        expect(result.fixes[0].count).toBe(4); // 2 pairs (opening and closing quote per bracket)
    });

    it('does not modify context with no escaped quotes', () => {
        const ctx = makeCtx('A[Node] --> B[Other]');
        const result = removeEscapedQuotes(ctx);
        expect(result.modified).toBe(false);
        expect(result.fixes).toHaveLength(0);
    });
});



// ─────────────────────────────────────────────────────────────────────────────
// removeBackticksInLabels
// ─────────────────────────────────────────────────────────────────────────────

describe('removeBackticksInLabels', () => {
    it('removes backticks from node labels', () => {
        const ctx = makeCtx('A[`Node label`] --> B');
        const result = removeBackticksInLabels(ctx);
        expect(result.sanitized).toContain('[Node label]');
        expect(result.modified).toBe(true);
        expect(result.fixes[0].type).toBe('BACKTICK_IN_LABEL_REMOVED');
    });

    it('does not modify content without backtick labels', () => {
        const ctx = makeCtx('A[Normal] --> B');
        const result = removeBackticksInLabels(ctx);
        expect(result.modified).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// fixArrowSyntax
// ─────────────────────────────────────────────────────────────────────────────

describe('fixArrowSyntax', () => {
    it('converts single -> to -->', () => {
        const ctx = makeCtx('graph LR\n  A -> B');
        const result = fixArrowSyntax(ctx);
        expect(result.sanitized).toContain('-->');
        expect(result.modified).toBe(true);
        expect(result.fixes[0].type).toBe('ARROW_FIXED');
    });

    it('does not double-convert --> arrows', () => {
        const ctx = makeCtx('A --> B --> C');
        const result = fixArrowSyntax(ctx);
        expect(result.modified).toBe(false);
    });

    it('counts fixed arrows', () => {
        const ctx = makeCtx('A -> B -> C');
        const result = fixArrowSyntax(ctx);
        expect(result.fixes[0].count).toBe(2);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// balanceBrackets
// ─────────────────────────────────────────────────────────────────────────────

describe('balanceBrackets', () => {
    it('adds missing closing brackets', () => {
        const ctx = makeCtx('A[Node --> B');
        const result = balanceBrackets(ctx);
        expect(result.sanitized.endsWith(']')).toBe(true);
        expect(result.modified).toBe(true);
        expect(result.fixes[0].type).toBe('BRACKET_BALANCED');
    });

    it('does not modify balanced brackets', () => {
        const ctx = makeCtx('A[Node] --> B[Other]');
        const result = balanceBrackets(ctx);
        expect(result.modified).toBe(false);
    });

    it('adds exactly the right number of closing brackets', () => {
        const ctx = makeCtx('A[B[C --> D');
        const originalResult = balanceBrackets(ctx);
        expect(originalResult.fixes[0].count).toBe(2);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// balanceBraces
// ─────────────────────────────────────────────────────────────────────────────

describe('balanceBraces', () => {
    it('adds missing closing braces', () => {
        const ctx = makeCtx('A{Decision --> B');
        const result = balanceBraces(ctx);
        expect(result.sanitized).toContain('}');
        expect(result.modified).toBe(true);
        expect(result.fixes[0].type).toBe('BRACE_BALANCED');
    });

    it('does not modify balanced braces', () => {
        const ctx = makeCtx('A{Decision} --> B');
        const result = balanceBraces(ctx);
        expect(result.modified).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// removeInvisibleUnicode
// ─────────────────────────────────────────────────────────────────────────────

describe('removeInvisibleUnicode', () => {
    it('removes zero-width space \\u200B', () => {
        const ctx = makeCtx('A\u200B --> B');
        const result = removeInvisibleUnicode(ctx);
        expect(result.sanitized).not.toContain('\u200B');
        expect(result.modified).toBe(true);
        expect(result.fixes[0].type).toBe('UNICODE_CLEANED');
    });

    it('removes BOM character \\uFEFF', () => {
        const ctx = makeCtx('\uFEFFgraph LR');
        const result = removeInvisibleUnicode(ctx);
        expect(result.sanitized).not.toContain('\uFEFF');
        expect(result.modified).toBe(true);
    });

    it('does not modify content without invisible unicode', () => {
        const ctx = makeCtx('graph LR\n  A --> B');
        const result = removeInvisibleUnicode(ctx);
        expect(result.modified).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// autoQuoteLabels
// ─────────────────────────────────────────────────────────────────────────────

describe('autoQuoteLabels', () => {
    it('quotes labels with parentheses', () => {
        const ctx = makeCtx('A[Node (with parens)] --> B');
        const result = autoQuoteLabels(ctx);
        expect(result.sanitized).toContain('[\"Node (with parens)\"]');
        expect(result.modified).toBe(true);
        expect(result.fixes[0].type).toBe('LABEL_QUOTED');
    });

    it('quotes labels with angle brackets', () => {
        const ctx = makeCtx('A[Node <type>] --> B');
        const result = autoQuoteLabels(ctx);
        expect(result.modified).toBe(true);
    });

    it('does not quote simple labels', () => {
        const ctx = makeCtx('A[Simple] --> B[Other]');
        const result = autoQuoteLabels(ctx);
        expect(result.modified).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// balanceSubgraphEnds
// ─────────────────────────────────────────────────────────────────────────────

describe('balanceSubgraphEnds', () => {
    it('adds missing end keyword', () => {
        const ctx = makeCtx('graph LR\n  subgraph A\n    B --> C');
        const result = balanceSubgraphEnds(ctx);
        expect(result.sanitized).toContain('end');
        expect(result.modified).toBe(true);
        expect(result.fixes[0].type).toBe('SUBGRAPH_END_ADDED');
    });

    it('does not add end when already balanced', () => {
        const ctx = makeCtx('graph LR\n  subgraph A\n    B --> C\n  end');
        const result = balanceSubgraphEnds(ctx);
        expect(result.modified).toBe(false);
    });

    it('adds multiple ends for multiple subgraphs', () => {
        const ctx = makeCtx('graph LR\n  subgraph A\n    B --> C\n  subgraph D\n    E --> F');
        const result = balanceSubgraphEnds(ctx);
        expect(result.fixes[0].count).toBe(2);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// removeRawQuotes
// ─────────────────────────────────────────────────────────────────────────────

describe('removeRawQuotes', () => {
    it('removes raw quotes from node labels', () => {
        const ctx = makeCtx('A[Node "label" here] --> B');
        const result = removeRawQuotes(ctx);
        expect(result.sanitized).not.toContain('"label"');
        expect(result.modified).toBe(true);
        expect(result.fixes[0].type).toBe('RAW_QUOTE_REMOVED');
    });

    it('does not modify content without raw quotes in labels', () => {
        const ctx = makeCtx('A --> B');
        const result = removeRawQuotes(ctx);
        expect(result.modified).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// fixEdgeLabels
// ─────────────────────────────────────────────────────────────────────────────

describe('fixEdgeLabels', () => {
    it('removes parentheses from edge labels', () => {
        const ctx = makeCtx('A -->|calls (async)| B');
        const result = fixEdgeLabels(ctx);
        expect(result.sanitized).not.toContain('(async)');
        expect(result.sanitized).toContain('|calls async|');
        expect(result.modified).toBe(true);
        expect(result.fixes[0].type).toBe('EDGE_LABEL_ESCAPED');
    });

    it('does not modify edge labels without parens', () => {
        const ctx = makeCtx('A -->|simple label| B');
        const result = fixEdgeLabels(ctx);
        expect(result.modified).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// wrapLongTexts
// ─────────────────────────────────────────────────────────────────────────────

describe('wrapLongTexts', () => {
    const LONG_TEXT = 'This is a very long node label that exceeds 40 chars';

    it('wraps long text in rectangle nodes (quoted)', () => {
        const ctx = makeCtx(`A["${LONG_TEXT}"] --> B`);
        const result = wrapLongTexts(ctx);
        expect(result.modified).toBe(true);
        expect(result.fixes[0].type).toBe('LONG_TEXT_WRAPPED');
    });

    it('wraps long text in rectangle nodes (unquoted)', () => {
        const ctx = makeCtx(`A[${LONG_TEXT}] --> B`);
        const result = wrapLongTexts(ctx);
        expect(result.modified).toBe(true);
    });

    it('does not wrap short texts', () => {
        const ctx = makeCtx('A["Short"] --> B["Also short"]');
        const result = wrapLongTexts(ctx);
        expect(result.modified).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// processMermaidBlock (orchestrator)
// ─────────────────────────────────────────────────────────────────────────────

describe('processMermaidBlock', () => {
    it('processes a clean block without modifications', () => {
        const content = 'graph LR\n  A --> B --> C';
        const result = processMermaidBlock(content, 0);
        expect(result.blockIndex).toBe(0);
        expect(result.fixes).toHaveLength(0);
        expect(result.modified).toBe(false);
        expect(result.sanitized).toBe(content);
    });

    it('applies multiple fixes in sequence', () => {
        // Has escaped quote, missing bracket, and --> is fine but escaped quote present
        const content = 'graph LR\n  A[\"Escaped quote\n  B[Open bracket';
        const result = processMermaidBlock(content, 1);
        expect(result.blockIndex).toBe(1);
        // Should have fixes from removeEscapedQuotes and balanceBrackets
        expect(result.fixes.length).toBeGreaterThan(0);
    });

    it('returns correct blockIndex in result', () => {
        const result = processMermaidBlock('graph LR\n  A --> B', 5);
        expect(result.blockIndex).toBe(5);
    });

    it('handles empty content', () => {
        const result = processMermaidBlock('', 0);
        expect(result.sanitized).toBe('');
        expect(result.modified).toBe(false);
    });

    it('fixes invisible unicode characters', () => {
        const content = 'graph LR\n  A\u200B --> B';
        const result = processMermaidBlock(content, 0);
        expect(result.sanitized).not.toContain('\u200B');
        expect(result.modified).toBe(true);
    });
});
