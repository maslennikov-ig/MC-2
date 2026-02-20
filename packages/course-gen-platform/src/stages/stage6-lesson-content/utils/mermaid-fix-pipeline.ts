/**
 * Mermaid Fix Pipeline Orchestrator
 * @module stages/stage6-lesson-content/utils/mermaid-fix-pipeline
 *
 * Orchestrates a 5-stage cascading pipeline for fixing Mermaid diagram syntax:
 *
 * **Stage 1: Regex Sanitization**
 * - Apply regex-based fixes (escaped quotes, arrows, brackets, etc.)
 * - Fast, deterministic, handles common LLM generation issues
 *
 * **Stage 2: Validation**
 * - Parse diagram with official mermaid parser
 * - Render to SVG and verify graph nodes are present
 * - Detect syntax and render-integrity failures
 *
 * **Stage 3: LLM Fixing** (conditional)
 * - Only if validation fails AND LLM budget available
 * - Use LLM to fix complex syntax issues
 * - Limit: MAX_LLM_FIXES_PER_LESSON to control cost/time
 *
 * **Stage 4: Re-validation**
 * - Parse + render validate LLM-fixed diagram
 * - Confirm fix was successful
 *
 * **Stage 5: Adaptive Remediation**
 * - Simplify diagram by stripping fragile directives
 * - Split oversized flowcharts into at most 2 diagrams when possible
 * - If rendering still fails, replace with structured markdown summary
 *
 * **Architecture:**
 * - Extract all mermaid blocks from content
 * - Process each block through cascade
 * - Replace blocks in original content
 * - Track metrics for each stage
 *
 * @example
 * ```typescript
 * import { runMermaidFixPipeline } from './mermaid-fix-pipeline';
 *
 * const content = `# Lesson
 * \`\`\`mermaid
 * flowchart TD
 *   A[\\"Start\\"] -> B[\\"Process\\"]
 * \`\`\`
 * `;
 *
 * const result = await runMermaidFixPipeline(content);
 * // result.modified === true
 * // result.metrics.diagramsFixedRegex === 1
 * // result.content has sanitized diagram
 * ```
 */

import { sanitizeMermaidBlocks, MERMAID_BLOCK_REGEX } from './mermaid-sanitizer';
import { fixMermaidWithLLM } from './mermaid-llm-fixer';
import { validateMermaidBlockRender } from './mermaid-render-validator';
// Note: cleanupDOMGlobals intentionally not imported/called here.
// Mermaid is a singleton that caches DOMPurify reference at first initialization.
// Calling cleanup would break subsequent pipeline calls with "DOMPurify.addHook is not a function".
// Memory is safe: JSDOM instance is reused via idempotent ensureDOMGlobals().
import { logger } from '@/shared/logger';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum number of LLM fixes per lesson to control cost and processing time.
 * Prevents excessive LLM API usage on lessons with many broken diagrams.
 */
const MAX_LLM_FIXES_PER_LESSON = 5;

// ============================================================================
// LOGGING HELPERS
// ============================================================================

/**
 * Get a snippet of diagram code for logging
 * Truncates long diagrams to avoid log bloat
 *
 * @param diagram - Full diagram code
 * @param maxLength - Maximum snippet length (default 100)
 * @returns Truncated diagram or full if short enough
 */
function getDiagramSnippet(diagram: string, maxLength = 100): string {
  if (diagram.length <= maxLength) {
    return diagram.replace(/\n/g, '\\n');
  }
  return diagram.slice(0, maxLength).replace(/\n/g, '\\n') + '... (truncated)';
}

/**
 * Pipeline stage names for structured logging
 */
type PipelineStage =
  | 'START'
  | 'REGEX_SANITIZE'
  | 'VALIDATE'
  | 'LLM_FIX'
  | 'REVALIDATE'
  | 'SIMPLIFY'
  | 'SPLIT'
  | 'STRUCTURED_FALLBACK'
  | 'COMPLETE';

/**
 * Log pipeline stage for observability
 */
function logPipelineStage(
  stage: PipelineStage,
  blockIndex: number,
  data: Record<string, unknown> = {}
): void {
  logger.debug({ stage, blockIndex, ...data }, `Mermaid pipeline stage: ${stage}`);
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of the Mermaid fix pipeline
 */
export interface MermaidPipelineResult {
  /** Content with all Mermaid blocks processed */
  content: string;
  /** Whether any modifications were made */
  modified: boolean;
  /** Detailed metrics for each pipeline stage */
  metrics: {
    /** Total number of Mermaid diagrams found */
    diagramsTotal: number;
    /** Diagrams auto-wrapped from raw text (Stage 0) */
    diagramsAutoWrapped: number;
    /** Diagrams fixed by regex sanitization only */
    diagramsFixedRegex: number;
    /** Diagrams fixed by LLM after regex failed */
    diagramsFixedLLM: number;
    /** Diagrams that failed all fixes (replaced with fallback) */
    diagramsFallback: number;
    /** Diagrams recovered by simplification stage */
    diagramsSimplified?: number;
    /** Diagrams recovered by splitting into two diagrams */
    diagramsSplit?: number;
    /** Diagrams replaced with structured markdown fallback */
    diagramsStructuredFallback?: number;
    /** Total pipeline execution time in milliseconds */
    durationMs: number;
  };
}

/**
 * Options for the Mermaid fix pipeline
 */
export interface MermaidPipelineOptions {
  /** Skip LLM fixing stage (useful for testing or CI environments) */
  skipLLM?: boolean;
}

/**
 * Internal representation of a Mermaid block with position tracking
 */
interface MermaidBlock {
  /** Full matched text including backticks */
  fullMatch: string;
  /** Diagram code without backticks */
  code: string;
  /** Start index in original content */
  startIndex: number;
  /** End index in original content */
  endIndex: number;
}

/**
 * Processed block with fixed code
 */
interface ProcessedBlock {
  block: MermaidBlock;
  replacement: string;
}

interface MermaidPipelineValidation {
  valid: boolean;
  errors: string[];
  diagramType: string | null;
  failureStage: 'parse' | 'render' | null;
}

async function validateBlockForPipeline(
  code: string,
  blockIndex: number
): Promise<MermaidPipelineValidation> {
  const diagnostic = await validateMermaidBlockRender(code, blockIndex);

  if (!diagnostic.parseValid) {
    return {
      valid: false,
      errors: diagnostic.errors,
      diagramType: diagnostic.diagramType,
      failureStage: 'parse',
    };
  }

  if (!diagnostic.renderValid || !diagnostic.svgHasRenderableContent) {
    return {
      valid: false,
      errors:
        diagnostic.errors.length > 0
          ? diagnostic.errors
          : ['Mermaid render validation failed: SVG has no renderable content'],
      diagramType: diagnostic.diagramType,
      failureStage: 'render',
    };
  }

  return {
    valid: true,
    errors: [],
    diagramType: diagnostic.diagramType,
    failureStage: null,
  };
}

// ============================================================================
// RAW MERMAID BLOCK WRAPPING (Stage 0)
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
 * - `/\[.*?\]|\(.*?\)|\{.*?\}/` removed — too broad (matches markdown links,
 *   checkboxes, any parenthesised text)
 * - `subgraph|end\b` split: require "subgraph <Name>" and "end" alone on a line
 * - `class\s+\w+`, `state\s+`, `section\s+` removed — too common in prose
 * - `/^\s+\w/m` removed — any indented line is too broad
 * - Added `/^\s+\w+[\[\({\|]/m` — indented node followed immediately by a
 *   shape bracket, which is unambiguous Mermaid node syntax
 * - Added `/^\s+\w+\s*-->|^\s+\w+\s*---/m` — indented node with arrow,
 *   specific to flowchart/graph diagrams
 */
const MERMAID_SYNTAX_PATTERNS: RegExp[] = [
  /-->|---|-\.->|==>|~~~/, // Mermaid arrows (very specific)
  /^\s+\w+\s*-->|^\s+\w+\s*---/m, // Indented node with arrow (e.g. "  A --> B")
  /subgraph\s+\w/i, // "subgraph Name" (not bare "subgraph" or "end")
  /^\s*end\s*$/m, // "end" alone on a line (Mermaid block closer)
  /^participant\s+\w/im, // "participant Alice" (sequence diagrams)
  /^actor\s+\w/im, // "actor User" (sequence diagrams)
  /"[^"]+"\s*:\s*\d/, // gantt/pie data: "Label" : 42
  /^\s+\w+[\[\({\|]/m, // Indented node with shape bracket: "  A[text]"
];

/**
 * Strict patterns for block continuation after empty lines.
 *
 * A subset of MERMAID_SYNTAX_PATTERNS requiring unambiguous Mermaid syntax.
 * Used when scanning forward past an empty line to decide whether the block
 * is still continuing — prose keywords must never trigger continuation.
 */
const MERMAID_CONTINUATION_PATTERNS: RegExp[] = [
  /-->|---|-\.->|==>|~~~/, // Mermaid arrows
  /^\s+\w+\s*-->|^\s+\w+\s*---/m, // Indented node with arrow
  /^\s*end\s*$/m, // "end" alone on a line
  /"[^"]+"\s*:\s*\d/, // pie/gantt data
  /^\s+\w+[\[\({\|]/m, // Indented node with shape bracket
];

/**
 * Result of wrapping raw Mermaid blocks
 */
interface WrapRawMermaidResult {
  content: string;
  wrappedCount: number;
}

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
function wrapRawMermaidBlocks(content: string): WrapRawMermaidResult {
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

// ============================================================================
// EXTRACTION HELPERS
// ============================================================================

/**
 * Extract all Mermaid blocks from content with their positions
 *
 * Parses content to find all ```mermaid code blocks and records their
 * positions for later replacement.
 *
 * @param content - Markdown content to parse
 * @returns Array of Mermaid blocks with position information
 *
 * @example
 * ```typescript
 * const content = `
 * \`\`\`mermaid
 * graph TD; A-->B;
 * \`\`\`
 * Some text
 * \`\`\`mermaid
 * sequenceDiagram
 * \`\`\`
 * `;
 *
 * const blocks = extractMermaidBlocks(content);
 * // [
 * //   { fullMatch: "```mermaid\ngraph TD; A-->B;\n```", code: "graph TD; A-->B;", startIndex: 1, endIndex: 35 },
 * //   { fullMatch: "```mermaid\nsequenceDiagram\n```", code: "sequenceDiagram", startIndex: 46, endIndex: 78 }
 * // ]
 * ```
 */
function extractMermaidBlocks(content: string): MermaidBlock[] {
  const blocks: MermaidBlock[] = [];
  let match: RegExpExecArray | null;

  // Reset global regex state for clean matching
  MERMAID_BLOCK_REGEX.lastIndex = 0;
  const regex = MERMAID_BLOCK_REGEX;

  while ((match = regex.exec(content)) !== null) {
    const fullMatch = match[0];
    const code = match[1].trim();
    const startIndex = match.index;
    const endIndex = startIndex + fullMatch.length;

    blocks.push({
      fullMatch,
      code,
      startIndex,
      endIndex,
    });
  }

  logger.debug({ blockCount: blocks.length }, 'Mermaid pipeline: Extracted blocks');

  return blocks;
}

// ============================================================================
// ADAPTIVE REMEDIATION HELPERS
// ============================================================================

const MERMAID_EDGE_PATTERN = /-->|-\.->|==>|---|~~~/;
const MERMAID_TYPE_PATTERN =
  /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitgraph|C4Context|C4Container|C4Component|C4Deployment|sankey-beta|xychart-beta|block-beta|packet-beta)\b/i;
const MERMAID_CONTROL_LINE_PATTERN =
  /^\s*(?:%%\{.*\}%%|classDef\b|class\b|style\b|linkStyle\b|click\b)/i;

function wrapMermaidBlock(code: string): string {
  return `\`\`\`mermaid\n${code}\n\`\`\``;
}

function extractDiagramType(code: string): string {
  const firstLine = code.split('\n').find(line => line.trim().length > 0) ?? '';
  const typeMatch = firstLine.match(MERMAID_TYPE_PATTERN);
  return typeMatch ? typeMatch[1] : 'diagram';
}

function normalizeSingleArrows(line: string): string {
  let normalized = '';

  for (let i = 0; i < line.length; i++) {
    if (line[i] === '-' && line[i + 1] === '>') {
      const before = i > 0 ? line[i - 1] : '';
      const after = i + 2 < line.length ? line[i + 2] : '';

      // Keep valid sequence arrows (->>) and existing flow arrows (-->, -.->)
      const isSequenceArrow = after === '>';
      const isAlreadyFlowArrow = before === '-' || before === '.';
      if (!isSequenceArrow && !isAlreadyFlowArrow && after !== '-') {
        normalized += '-->';
        i += 1;
        continue;
      }
    }

    normalized += line[i];
  }

  return normalized;
}

function simplifyMermaidDiagram(code: string): string {
  const lines = code
    .split('\n')
    .map(line => line.trimEnd())
    .filter((line, index) => !(index === 0 && line.trim().length === 0));

  if (lines.length === 0) {
    return code;
  }

  const [header, ...bodyLines] = lines;

  const simplifiedBody = bodyLines
    .map(line => line.replace(/<br\s*\/?>/gi, ' '))
    .map(line => line.replace(/`/g, ''))
    .map(line => normalizeSingleArrows(line))
    .filter(line => !MERMAID_CONTROL_LINE_PATTERN.test(line))
    .map(line => line.replace(/\s{2,}/g, ' ').trimEnd())
    .filter(line => line.trim().length > 0);

  if (simplifiedBody.length === 0) {
    return header.trim();
  }

  return [header.trim(), ...simplifiedBody].join('\n').trim();
}

function isFlowchartHeader(line: string): boolean {
  return /^(flowchart|graph)\b/i.test(line.trim());
}

function isEdgeLine(line: string): boolean {
  return MERMAID_EDGE_PATTERN.test(line);
}

function splitMermaidDiagramIntoTwo(
  code: string
): { firstDiagram: string; secondDiagram: string } | null {
  const lines = code
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.trim().length > 0);

  if (lines.length < 3) {
    return null;
  }

  const header = lines[0].trim();
  if (!isFlowchartHeader(header)) {
    return null;
  }

  const bodyLines = lines.slice(1).filter(line => !MERMAID_CONTROL_LINE_PATTERN.test(line));
  const edgeLines = bodyLines.filter(isEdgeLine);

  if (edgeLines.length < 2) {
    return null;
  }

  const midpoint = Math.ceil(edgeLines.length / 2);
  const firstEdges = edgeLines.slice(0, midpoint);
  const secondEdges = edgeLines.slice(midpoint);

  if (firstEdges.length === 0 || secondEdges.length === 0) {
    return null;
  }

  const sharedNodeLines = bodyLines.filter(line => !isEdgeLine(line));
  const firstDiagram = [header, ...sharedNodeLines, ...firstEdges].join('\n').trim();
  const secondDiagram = [header, ...sharedNodeLines, ...secondEdges].join('\n').trim();

  return { firstDiagram, secondDiagram };
}

function extractFallbackSteps(brokenDiagram: string): string[] {
  const lines = brokenDiagram
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const edgeSteps: string[] = [];

  for (const line of lines) {
    const edgeMatch = line.match(
      /^([A-Za-z0-9_]+)\s*(?:-->|-\.->|==>|---|~~~|->>)\s*(?:\|[^|]*\|\s*)?([A-Za-z0-9_]+)/
    );
    if (edgeMatch) {
      edgeSteps.push(`${edgeMatch[1]} -> ${edgeMatch[2]}`);
    }
  }

  if (edgeSteps.length > 0) {
    return edgeSteps.slice(0, 6);
  }

  const textualSteps = lines
    .slice(1)
    .map(line => line.replace(/[#*`]/g, '').trim())
    .filter(line => line.length > 0)
    .slice(0, 4);

  return textualSteps.length > 0 ? textualSteps : ['No stable flow summary could be extracted.'];
}

function generateStructuredFallbackText(brokenDiagram: string): string {
  const diagramType = extractDiagramType(brokenDiagram);
  const summarySteps = extractFallbackSteps(brokenDiagram);

  return [
    '**Diagram unavailable (auto-remediated)**',
    `The original Mermaid ${diagramType} diagram could not be rendered reliably and was converted to a text summary.`,
    'Key flow:',
    ...summarySteps.map((step, index) => `${index + 1}. ${step}`),
  ].join('\n');
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

/**
 * Run the complete Mermaid fix pipeline on lesson content
 *
 * Orchestrates a 5-stage cascading fix process:
 * 1. Regex sanitization (always)
 * 2. Validation (always)
 * 3. LLM fixing (conditional - if invalid & budget available)
 * 4. Re-validation (after LLM fix)
 * 5. Adaptive remediation:
 *    - simplify diagram
 *    - split into <= 2 diagrams (flowcharts/graphs)
 *    - structured markdown fallback
 *
 * **Processing flow:**
 * - Extract all Mermaid blocks from content
 * - Process each block through the cascade
 * - Replace blocks in original content with fixed versions
 * - Track detailed metrics for reporting
 *
 * **Edge cases handled:**
 * - No Mermaid blocks → return original content unchanged
 * - All diagrams valid → minimal processing
 * - All diagrams broken → apply fallbacks to prevent rendering errors
 * - LLM budget exhausted → skip LLM fixing for remaining diagrams
 *
 * **Performance:**
 * - Regex fixes are fast (~1ms per diagram)
 * - Validation is moderate (~10ms per diagram)
 * - LLM fixes are slow (~2-5s per diagram)
 * - Total time: O(n) for regex + O(n * k) for LLM where k is LLM fix count
 *
 * @param content - Markdown content with potential Mermaid blocks
 * @param options - Pipeline configuration options
 * @returns Pipeline result with metrics and fixed content
 *
 * @example
 * ```typescript
 * // Standard usage
 * const result = await runMermaidFixPipeline(lessonContent);
 * console.log(`Fixed ${result.metrics.diagramsFixedRegex} diagrams with regex`);
 * console.log(`Fixed ${result.metrics.diagramsFixedLLM} diagrams with LLM`);
 * console.log(`Fallback used for ${result.metrics.diagramsFallback} diagrams`);
 *
 * // Skip LLM for CI/testing
 * const testResult = await runMermaidFixPipeline(content, { skipLLM: true });
 * ```
 */
export async function runMermaidFixPipeline(
  content: string,
  options?: MermaidPipelineOptions
): Promise<MermaidPipelineResult> {
  const startTime = Date.now();

  logger.info(
    {
      contentLength: content.length,
      skipLLM: options?.skipLLM ?? false,
    },
    'Mermaid pipeline: Starting fix pipeline'
  );

  try {
    // Initialize metrics
    const metrics = {
      diagramsTotal: 0,
      diagramsAutoWrapped: 0,
      diagramsFixedRegex: 0,
      diagramsFixedLLM: 0,
      diagramsFallback: 0,
      diagramsSimplified: 0,
      diagramsSplit: 0,
      diagramsStructuredFallback: 0,
      durationMs: 0,
    };

    // -------------------------------------------------------------------------
    // Stage 0: Auto-wrap raw Mermaid blocks that aren't code-fenced
    // -------------------------------------------------------------------------
    const wrapResult = wrapRawMermaidBlocks(content);
    const processableContent = wrapResult.content;

    if (wrapResult.wrappedCount > 0) {
      metrics.diagramsAutoWrapped = wrapResult.wrappedCount;
      logger.info(
        { wrappedCount: wrapResult.wrappedCount },
        'Mermaid pipeline: Stage 0 - Wrapped raw Mermaid blocks'
      );
    }

    // Extract all Mermaid blocks (now including auto-wrapped ones)
    const blocks = extractMermaidBlocks(processableContent);
    metrics.diagramsTotal = blocks.length;

    // Edge case: No Mermaid blocks
    if (blocks.length === 0) {
      logger.info({}, 'Mermaid pipeline: No Mermaid blocks found');
      metrics.durationMs = Date.now() - startTime;
      return {
        content: processableContent,
        modified: wrapResult.wrappedCount > 0,
        metrics,
      };
    }

    logger.info(
      {
        blockCount: blocks.length,
      },
      'Mermaid pipeline: Processing blocks'
    );

    // Track LLM usage across all blocks
    let llmFixCount = 0;

    // Process each block through the cascade
    const processedBlocks: ProcessedBlock[] = [];
    let anyModified = false;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];

      logger.debug(
        {
          blockIndex: i,
          codeLength: block.code.length,
        },
        'Mermaid pipeline: Processing block'
      );

      // Log pipeline start
      logPipelineStage('START', i, { codeLength: block.code.length });

      // -------------------------------------------------------------------------
      // Stage 1: Regex Sanitization
      // -------------------------------------------------------------------------
      const { content: sanitized, modified: regexModified } = sanitizeMermaidBlocks(
        `\`\`\`mermaid\n${block.code}\n\`\`\``
      );

      // Extract sanitized code (remove backticks)
      let fixedCode = sanitized
        .replace(/```mermaid\n?/, '')
        .replace(/\n?```$/, '')
        .trim();

      if (regexModified) {
        anyModified = true;
        logger.debug(
          {
            blockIndex: i,
          },
          'Mermaid pipeline: Regex sanitization modified block'
        );
      }

      // Log regex sanitization result
      logPipelineStage('REGEX_SANITIZE', i, { modified: regexModified });

      // -------------------------------------------------------------------------
      // Stage 2: Validation
      // -------------------------------------------------------------------------
      let validation = await validateBlockForPipeline(fixedCode, i);

      logger.debug(
        {
          blockIndex: i,
          valid: validation.valid,
          diagramType: validation.diagramType,
          failureStage: validation.failureStage,
        },
        'Mermaid pipeline: Initial validation'
      );

      // Log validation result
      logPipelineStage('VALIDATE', i, {
        valid: validation.valid,
        diagramType: validation.diagramType,
        failureStage: validation.failureStage,
      });

      if (validation.valid) {
        // Fixed by regex sanitization
        if (regexModified) {
          metrics.diagramsFixedRegex++;
          logger.info(
            {
              blockIndex: i,
              diagramType: validation.diagramType,
            },
            'Mermaid pipeline: Fixed by regex'
          );
        }

        processedBlocks.push({ block, replacement: wrapMermaidBlock(fixedCode) });
        continue;
      }

      if (validation.failureStage === 'render') {
        logger.warn(
          {
            blockIndex: i,
            diagramType: validation.diagramType,
            errors: validation.errors,
          },
          'Mermaid pipeline: Parse passed but render integrity failed'
        );
      }

      // -------------------------------------------------------------------------
      // Stage 3: LLM Fixing (conditional)
      // -------------------------------------------------------------------------
      if (
        !options?.skipLLM &&
        llmFixCount < MAX_LLM_FIXES_PER_LESSON &&
        validation.errors.length > 0
      ) {
        logger.info(
          {
            blockIndex: i,
            error: validation.errors[0],
            llmFixCount,
          },
          'Mermaid pipeline: Attempting LLM fix'
        );

        // Log LLM fix attempt
        logPipelineStage('LLM_FIX', i, { attempting: true });

        try {
          const llmResult = await fixMermaidWithLLM(fixedCode, validation.errors[0], {
            llmFixCount,
          });

          if (llmResult.fixed) {
            // Validate LLM output doesn't contain XSS patterns
            // NOTE: '-->' is VALID Mermaid flowchart syntax (A --> B), NOT an XSS pattern!
            // We only check for actual HTML injection patterns
            const hasXSSPatterns =
              llmResult.content.includes('<script') ||
              llmResult.content.includes('javascript:') ||
              llmResult.content.includes('onerror=') ||
              llmResult.content.includes('onclick=');

            if (hasXSSPatterns) {
              logger.warn(
                { blockIndex: i, snippet: getDiagramSnippet(llmResult.content) },
                'Mermaid pipeline: LLM output contains HTML injection patterns, rejecting fix'
              );
              // Don't use the LLM fix, continue to fallback
            } else {
              fixedCode = llmResult.content;
              llmFixCount++;
              anyModified = true;

              logger.debug(
                {
                  blockIndex: i,
                  llmFixCount,
                },
                'Mermaid pipeline: LLM fix applied'
              );

              // -----------------------------------------------------------------------
              // Stage 4: Re-validation
              // -----------------------------------------------------------------------
              validation = await validateBlockForPipeline(fixedCode, i);

              logger.debug(
                {
                  blockIndex: i,
                  valid: validation.valid,
                  failureStage: validation.failureStage,
                },
                'Mermaid pipeline: Re-validation after LLM fix'
              );

              // Log re-validation result
              logPipelineStage('REVALIDATE', i, {
                valid: validation.valid,
                failureStage: validation.failureStage,
              });

              if (validation.valid) {
                metrics.diagramsFixedLLM++;
                logger.info(
                  {
                    blockIndex: i,
                    diagramType: validation.diagramType,
                  },
                  'Mermaid pipeline: Fixed by LLM'
                );

                processedBlocks.push({ block, replacement: wrapMermaidBlock(fixedCode) });
                continue;
              }

              if (validation.failureStage === 'render') {
                logger.warn(
                  {
                    blockIndex: i,
                    diagramType: validation.diagramType,
                    errors: validation.errors,
                  },
                  'Mermaid pipeline: LLM fix parse-valid but still render-invalid'
                );
              }
            }
          }
        } catch (error) {
          logger.warn(
            {
              blockIndex: i,
              error: error instanceof Error ? error.message : String(error),
            },
            'Mermaid pipeline: LLM fix failed'
          );
        }
      } else if (options?.skipLLM) {
        logger.debug(
          {
            blockIndex: i,
          },
          'Mermaid pipeline: Skipping LLM fix (skipLLM option)'
        );
      } else if (llmFixCount >= MAX_LLM_FIXES_PER_LESSON) {
        logger.warn(
          {
            blockIndex: i,
            llmFixCount,
          },
          'Mermaid pipeline: LLM budget exhausted'
        );
      }

      // -------------------------------------------------------------------------
      // Stage 5A: Simplify (deterministic downgrade before splitting/fallback)
      // -------------------------------------------------------------------------
      const simplifiedCode = simplifyMermaidDiagram(fixedCode);
      const simplifyApplied = simplifiedCode !== fixedCode;
      logPipelineStage('SIMPLIFY', i, { applied: simplifyApplied });

      if (simplifyApplied) {
        const simplifiedValidation = await validateBlockForPipeline(simplifiedCode, i);
        if (simplifiedValidation.valid) {
          logger.info(
            {
              blockIndex: i,
              diagramType: simplifiedValidation.diagramType,
            },
            'Mermaid pipeline: Recovered diagram via simplify stage'
          );

          metrics.diagramsSimplified++;
          anyModified = true;
          processedBlocks.push({ block, replacement: wrapMermaidBlock(simplifiedCode) });
          continue;
        }

        validation = simplifiedValidation;
        fixedCode = simplifiedCode;
      }

      // -------------------------------------------------------------------------
      // Stage 5B: Split into <= 2 diagrams (flowchart/graph only)
      // -------------------------------------------------------------------------
      const splitCandidate = splitMermaidDiagramIntoTwo(fixedCode);
      if (splitCandidate) {
        logPipelineStage('SPLIT', i, { attempted: true, parts: 2 });

        const [firstValidation, secondValidation] = await Promise.all([
          validateBlockForPipeline(splitCandidate.firstDiagram, i),
          validateBlockForPipeline(splitCandidate.secondDiagram, i),
        ]);

        if (firstValidation.valid && secondValidation.valid) {
          logger.info(
            {
              blockIndex: i,
              firstDiagramType: firstValidation.diagramType,
              secondDiagramType: secondValidation.diagramType,
            },
            'Mermaid pipeline: Recovered diagram via split stage'
          );

          metrics.diagramsSplit++;
          anyModified = true;
          processedBlocks.push({
            block,
            replacement: `${wrapMermaidBlock(splitCandidate.firstDiagram)}\n\n${wrapMermaidBlock(splitCandidate.secondDiagram)}`,
          });
          continue;
        }
      } else {
        logPipelineStage('SPLIT', i, { attempted: false, reason: 'unsupported_or_too_small' });
      }

      // -------------------------------------------------------------------------
      // Stage 5C: Structured markdown fallback (no HTML comments)
      // -------------------------------------------------------------------------
      logger.warn(
        {
          blockIndex: i,
          errors: validation.errors,
          snippet: getDiagramSnippet(block.code),
        },
        'Mermaid pipeline: All remediation stages failed, using structured markdown fallback'
      );

      logPipelineStage('STRUCTURED_FALLBACK', i, { reason: 'all_fixes_failed' });

      const fallbackMarkdown = generateStructuredFallbackText(block.code);
      metrics.diagramsFallback++;
      metrics.diagramsStructuredFallback++;
      anyModified = true;

      processedBlocks.push({ block, replacement: fallbackMarkdown });
    }

    // -------------------------------------------------------------------------
    // Replace blocks in original content (Stage 0 wrapping already applied)
    // -------------------------------------------------------------------------
    let finalContent = processableContent;

    if (anyModified) {
      logger.debug({}, 'Mermaid pipeline: Replacing blocks in content');

      // Validate blocks have valid indices and don't overlap
      for (let i = 0; i < processedBlocks.length; i++) {
        const current = processedBlocks[i].block;

        // Validate indices
        if (current.startIndex >= current.endIndex) {
          logger.error(
            {
              blockIndex: i,
              startIndex: current.startIndex,
              endIndex: current.endIndex,
              snippet: getDiagramSnippet(current.code),
            },
            'Invalid block indices'
          );
          throw new Error(
            `Invalid block indices at position ${i}: start=${current.startIndex} >= end=${current.endIndex}`
          );
        }

        // Check for overlaps with next block
        if (i < processedBlocks.length - 1) {
          const next = processedBlocks[i + 1].block;
          if (current.endIndex > next.startIndex) {
            logger.error(
              { currentEnd: current.endIndex, nextStart: next.startIndex },
              'Overlapping blocks detected'
            );
            throw new Error(
              `Overlapping mermaid blocks: block ${i} ends at ${current.endIndex}, block ${i + 1} starts at ${next.startIndex}`
            );
          }
        }
      }

      // Process blocks in reverse order to maintain indices
      for (let i = processedBlocks.length - 1; i >= 0; i--) {
        const { block, replacement } = processedBlocks[i];

        finalContent =
          finalContent.slice(0, block.startIndex) +
          replacement +
          finalContent.slice(block.endIndex);
      }
    }

    // -------------------------------------------------------------------------
    // Finalize metrics
    // -------------------------------------------------------------------------
    metrics.durationMs = Date.now() - startTime;

    logger.info(
      {
        total: metrics.diagramsTotal,
        autoWrapped: metrics.diagramsAutoWrapped,
        fixedRegex: metrics.diagramsFixedRegex,
        fixedLLM: metrics.diagramsFixedLLM,
        simplified: metrics.diagramsSimplified,
        split: metrics.diagramsSplit,
        structuredFallback: metrics.diagramsStructuredFallback,
        fallback: metrics.diagramsFallback,
        modified: anyModified || wrapResult.wrappedCount > 0,
        durationMs: metrics.durationMs,
      },
      'Mermaid pipeline: Pipeline complete'
    );

    return {
      content: finalContent,
      modified: anyModified || wrapResult.wrappedCount > 0,
      metrics,
    };
  } catch (error) {
    // Re-throw after logging - don't swallow errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, 'Mermaid pipeline: Unexpected error during processing');
    throw error;
  }
  // Note: No finally/cleanup block here.
  // DOM globals (JSDOM, DOMPurify) are reused across pipeline calls.
  // Mermaid singleton caches DOMPurify reference - cleanup would break it.
}
