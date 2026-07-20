/**
 * Mermaid Raw Block Wrapping (Stage 0)
 * @module stages/stage6-lesson-content/utils/mermaid-raw-wrapping
 *
 * Detects and wraps raw (unfenced) Mermaid blocks in content.
 * Extracted from mermaid-fix-pipeline.ts to comply with max-lines rule.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Mermaid diagram type keywords — all valid diagram openers
 */
const MERMAID_KEYWORDS = [
  'flowchart',
  'graph',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram-v2',
  'stateDiagram',
  'erDiagram',
  'journey',
  'gantt',
  'pie',
  'mindmap',
  'timeline',
  'gitgraph',
  'C4Context',
  'C4Container',
  'C4Component',
  'C4Deployment',
  'sankey-beta',
  'xychart-beta',
  'block-beta',
  'packet-beta',
] as const;

/**
 * Regex that matches a line starting with a Mermaid keyword (with optional direction suffix)
 * Must be at the start of a line; captures the full keyword line.
 */
const RAW_MERMAID_KEYWORD_REGEX = new RegExp(
  `^(${MERMAID_KEYWORDS.join('|')})(?:\\s+(TD|TB|BT|RL|LR))?\\s*$`,
  'im'
);

/**
 * Patterns that indicate actual Mermaid syntax (not just normal prose).
 *
 * These patterns are intentionally specific to avoid false positives on
 * educational text that mentions words like "pie", "timeline", "journey",
 * or "section" in ordinary sentences.
 *
 * Design decisions:
 * - `/\\[.*?\\]|\\(.*?\\)|\\{.*?\\}/` removed — too broad (matches markdown links,
 *   checkboxes, any parenthesised text)
 * - `subgraph|end\\b` split: require "subgraph <Name>" and "end" alone on a line
 * - `class\\s+\\w+`, `state\\s+`, `section\\s+` removed — too common in prose
 * - `/^\\s+\\w/m` removed — any indented line is too broad
 * - Added `/^\\s+\\w+[\\[\\({\\|]/m` — indented node followed immediately by a
 *   shape bracket, which is unambiguous Mermaid node syntax
 * - Added `/^\\s+\\w+\\s*-->|^\\s+\\w+\\s*---/m` — indented node with arrow,
 *   specific to flowchart/graph diagrams
 */
const MERMAID_SYNTAX_PATTERNS: RegExp[] = [
  /-->|-\.->|==>|~~~/, // Mermaid arrows (excluding bare ---)
  /\w\s*---\s*\w/, // Node to node link with ---
  /^\s+\w+\s*-->|^\s+\w+\s*---/m, // Indented node with arrow (e.g. "  A --> B")
  /subgraph\s+\w/i, // "subgraph Name" (not bare "subgraph" or "end")
  /^participant\s+\w/im, // "participant Alice" (sequence diagrams)
  /^actor\s+\w/im, // "actor User" (sequence diagrams)
  /"[^"]+"\s*:\s*\d/, // gantt/pie data: "Label" : 42
  /^\s+\w+[[({|]/m, // Indented node with shape bracket: "  A[text]"
];

/**
 * Strict patterns for block continuation after empty lines.
 *
 * A subset of MERMAID_SYNTAX_PATTERNS requiring unambiguous Mermaid syntax.
 * Used when scanning forward past an empty line to decide whether the block
 * is still continuing — prose keywords must never trigger continuation.
 */
const MERMAID_CONTINUATION_PATTERNS: RegExp[] = [
  /-->|-\.->|==>|~~~/, // Mermaid arrows
  /\w\s*---\s*\w/, // Node to node link with ---
  /^\s+\w+\s*-->|^\s+\w+\s*---/m, // Indented node with arrow
  /^\s*end\s*$/m, // "end" alone on a line remains safe as a block continuation
  /"[^"]+"\s*:\s*\d/, // pie/gantt data
  /^\s+\w+[[({|]/m, // Indented node with shape bracket
];

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of wrapping raw Mermaid blocks
 */
export interface WrapRawMermaidResult {
  content: string;
  wrappedCount: number;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Detect and wrap raw (unfenced) Mermaid blocks in content.
 *
 * Scans the content for lines that look like the start of a Mermaid diagram
 * but are not inside an existing code fence. If the subsequent lines contain
 * recognisable Mermaid syntax the whole block is wrapped in ```mermaid fences.
 *
 * Replacements are applied in reverse order to preserve string indices.
 *
 * @param content - Markdown content to scan
 * @returns Modified content and count of newly wrapped blocks
 */
export function wrapRawMermaidBlocks(content: string): WrapRawMermaidResult {
  // 1. Identify all existing code-fence regions so we don't double-wrap
  const codeFenceRegions: Array<{ start: number; end: number }> = [];
  const codeFenceRegex = /(?:```|~~~)[\s\S]*?(?:```|~~~)/g;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = codeFenceRegex.exec(content)) !== null) {
    codeFenceRegions.push({
      start: fenceMatch.index,
      end: fenceMatch.index + fenceMatch[0].length,
    });
  }

  function isInsideCodeFence(index: number): boolean {
    return codeFenceRegions.some(r => index >= r.start && index < r.end);
  }

  // 2. Split content into lines, tracking byte offsets for each line start
  const lines = content.split('\n');
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1; // +1 for '\n'
  }

  // 3. Find candidate keyword lines
  const replacements: Array<{ start: number; end: number; wrapped: string }> = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineStart = lineOffsets[lineIdx];

    // Must match Mermaid keyword at start of line
    if (!RAW_MERMAID_KEYWORD_REGEX.test(line)) {
      continue;
    }

    // Must NOT be inside an existing code fence
    if (isInsideCodeFence(lineStart)) {
      continue;
    }

    // 4. Validate the following lines contain actual Mermaid syntax
    const lookAheadEnd = Math.min(lineIdx + 20, lines.length);
    const lookAheadLines = lines.slice(lineIdx + 1, lookAheadEnd);
    const hasMermaidSyntax = MERMAID_SYNTAX_PATTERNS.some(pattern =>
      lookAheadLines.some(l => pattern.test(l))
    );

    if (!hasMermaidSyntax) {
      // Keyword appeared in normal prose — skip
      continue;
    }

    // 5. Determine end of the raw block
    let blockEndLineIdx = lineIdx; // inclusive last line of block
    const headerRegex = /^#{1,6}\s/;

    for (let scan = lineIdx + 1; scan < lines.length; scan++) {
      const scanLine = lines[scan];

      // Stop at markdown headings
      if (headerRegex.test(scanLine)) {
        break;
      }

      // Stop at empty line followed by a non-Mermaid-syntax line
      if (scanLine.trim() === '') {
        const nextNonEmpty = lines.slice(scan + 1).find(l => l.trim() !== '');
        if (
          nextNonEmpty === undefined ||
          !MERMAID_CONTINUATION_PATTERNS.some(p => p.test(nextNonEmpty))
        ) {
          break;
        }
      }

      blockEndLineIdx = scan;
    }

    // 6. Determine character offsets for the block
    const blockStart = lineOffsets[lineIdx];
    // End is after the last character of the last block line (before its '\n')
    const blockEnd = lineOffsets[blockEndLineIdx] + lines[blockEndLineIdx].length;

    // Make sure the block doesn't overlap an existing code fence
    if (codeFenceRegions.some(r => blockStart < r.end && blockEnd > r.start)) {
      continue;
    }

    const rawBlock = content.slice(blockStart, blockEnd);
    const wrapped = `\`\`\`mermaid\n${rawBlock}\n\`\`\``;

    replacements.push({ start: blockStart, end: blockEnd, wrapped });

    // Skip processed lines to avoid overlapping replacements
    lineIdx = blockEndLineIdx;
  }

  if (replacements.length === 0) {
    return { content, wrappedCount: 0 };
  }

  // 7. Apply replacements in reverse order
  let result = content;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { start, end, wrapped } = replacements[i];
    result = result.slice(0, start) + wrapped + result.slice(end);
  }

  return { content: result, wrappedCount: replacements.length };
}
