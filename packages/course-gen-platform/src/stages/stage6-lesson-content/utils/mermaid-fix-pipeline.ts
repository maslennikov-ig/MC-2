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
 *   A[\"Start\"] -> B[\"Process\"]
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
import { validateMermaidSyntax } from './mermaid-validator';
// Note: cleanupDOMGlobals intentionally not imported/called here.
// Mermaid is a singleton that caches DOMPurify reference at first initialization.
// Calling cleanup would break subsequent pipeline calls with "DOMPurify.addHook is not a function".
// Memory is safe: JSDOM instance is reused via idempotent ensureDOMGlobals().
import { logger } from '@/shared/logger';
import { wrapRawMermaidBlocks } from './mermaid-raw-wrapping';
import {
  wrapMermaidBlock,
  simplifyMermaidDiagram,
  splitMermaidDiagramIntoTwo,
} from './mermaid-remediation';

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
  | 'STRIP'
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
  /** Course to charge an LLM repair to; without it the repair is unpriced. */
  courseId?: string;
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
  _blockIndex: number
): Promise<MermaidPipelineValidation> {
  // Parse validation is the reliable truth gate.
  // JSDOM render validation was removed as a hard gate because JSDOM has limited
  // SVG support, causing valid diagrams to be rejected and replaced with text fallback.
  // Real browsers handle parse-valid diagrams correctly.
  const parseResult = await validateMermaidSyntax(code);

  if (!parseResult.valid) {
    return {
      valid: false,
      errors: parseResult.errors.length > 0 ? parseResult.errors : ['Mermaid parse failed'],
      diagramType: parseResult.diagramType,
      failureStage: 'parse',
    };
  }

  return {
    valid: true,
    errors: [],
    diagramType: parseResult.diagramType,
    failureStage: null,
  };
}

// ============================================================================
// EXTRACTION HELPERS
// ============================================================================

/**
 * Extract all Mermaid blocks from content with their positions
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
 * @param content - Markdown content with potential Mermaid blocks
 * @param options - Pipeline configuration options
 * @returns Pipeline result with metrics and fixed content
 */
type RemediationMetric =
  | 'diagramsFixedRegex'
  | 'diagramsFixedLLM'
  | 'diagramsSimplified'
  | 'diagramsSplit'
  | 'diagramsFallback';

interface BlockOutcome {
  /** What replaces this block in the document. Empty string means the diagram is stripped. */
  replacement: string;
  /** Whether anything about this block changed. Drives the pipeline's `modified` flag. */
  modified: boolean;
  /** Which counter to bump, or `null` when the block was already valid and untouched. */
  metric: RemediationMetric | null;
  /** The per-lesson LLM budget after this block, which the next block inherits. */
  llmFixCount: number;
}

/** Output the model must never be allowed to smuggle into rendered markdown. */
const XSS_PATTERNS = ['<script', 'javascript:', 'onerror=', 'onclick='] as const;

/**
 * Stage 3: ask successively stronger models to repair the diagram.
 *
 * Escalation is by RESULT, not by error: a tier that returns something which still fails
 * validation hands over to the next one, and so does a tier whose output carries an XSS
 * pattern or which throws outright. `llmFixCount` is the per-lesson budget and is shared
 * across every block in the lesson, so it is threaded through rather than held in a closure.
 *
 * `modified` goes true the moment any model output is ACCEPTED, even if it then fails
 * revalidation and the block falls through to the remediation stages below — that output is
 * already in `code` at that point, and the original is gone.
 */
async function applyLlmCascade(
  code: string,
  validation: MermaidPipelineValidation,
  blockIndex: number,
  llmFixCount: number,
  options: MermaidPipelineOptions | undefined
): Promise<{
  code: string;
  validation: MermaidPipelineValidation;
  llmFixCount: number;
  fixed: boolean;
  modified: boolean;
}> {
  const MODEL_TIERS: import('./mermaid-llm-fixer').MermaidModelTier[] = [
    'primary',
    'secondary',
    'ultimate',
  ];
  let modified = false;

  for (const tier of MODEL_TIERS) {
    if (llmFixCount >= MAX_LLM_FIXES_PER_LESSON) {
      logger.warn({ blockIndex, llmFixCount, tier }, 'Mermaid pipeline: LLM budget exhausted');
      break;
    }

    logger.info(
      { blockIndex, error: validation.errors[0], llmFixCount, tier },
      `Mermaid pipeline: Attempting LLM fix (${tier})`
    );
    logPipelineStage('LLM_FIX', blockIndex, { attempting: true, tier });

    try {
      const llmResult = await fixMermaidWithLLM(
        code,
        validation.errors[0],
        { llmFixCount, courseId: options?.courseId },
        tier
      );

      if (!llmResult.fixed) continue;

      if (XSS_PATTERNS.some(pattern => llmResult.content.includes(pattern))) {
        logger.warn(
          { blockIndex, tier, snippet: getDiagramSnippet(llmResult.content) },
          'Mermaid pipeline: LLM output contains XSS patterns, trying next tier'
        );
        continue;
      }

      code = llmResult.content;
      llmFixCount++;
      modified = true;

      validation = await validateBlockForPipeline(code, blockIndex);
      logPipelineStage('REVALIDATE', blockIndex, {
        valid: validation.valid,
        failureStage: validation.failureStage,
        tier,
      });

      if (validation.valid) {
        logger.info(
          { blockIndex, diagramType: validation.diagramType, tier },
          `Mermaid pipeline: Fixed by LLM (${tier})`
        );
        return { code, validation, llmFixCount, fixed: true, modified };
      }

      logger.warn(
        { blockIndex, tier, errors: validation.errors },
        `Mermaid pipeline: LLM fix (${tier}) still invalid, escalating`
      );
    } catch (error) {
      logger.warn(
        { blockIndex, tier, error: error instanceof Error ? error.message : String(error) },
        `Mermaid pipeline: LLM fix (${tier}) failed`
      );
    }
  }

  return { code, validation, llmFixCount, fixed: false, modified };
}

/**
 * Stage 5A/5B: deterministic remediation, tried in order of how much of the diagram survives.
 *
 * Simplify first — it only downgrades styling — then split a flowchart in two. A simplify that
 * does not itself validate is still kept as the working code, because it is strictly closer to
 * valid than what came in, and the split stage gets a better input for it.
 */
async function remediateWithoutLlm(
  code: string,
  blockIndex: number
): Promise<{ code: string; replacement: string | null; metric: RemediationMetric | null }> {
  const simplifiedCode = simplifyMermaidDiagram(code);
  const simplifyApplied = simplifiedCode !== code;
  logPipelineStage('SIMPLIFY', blockIndex, { applied: simplifyApplied });

  if (simplifyApplied) {
    const simplifiedValidation = await validateBlockForPipeline(simplifiedCode, blockIndex);
    if (simplifiedValidation.valid) {
      logger.info(
        { blockIndex, diagramType: simplifiedValidation.diagramType },
        'Mermaid pipeline: Recovered diagram via simplify stage'
      );
      return {
        code: simplifiedCode,
        replacement: wrapMermaidBlock(simplifiedCode),
        metric: 'diagramsSimplified',
      };
    }
    code = simplifiedCode;
  }

  const splitCandidate = splitMermaidDiagramIntoTwo(code);
  if (!splitCandidate) {
    logPipelineStage('SPLIT', blockIndex, { attempted: false, reason: 'unsupported_or_too_small' });
    return { code, replacement: null, metric: null };
  }

  logPipelineStage('SPLIT', blockIndex, { attempted: true, parts: 2 });
  const [firstValidation, secondValidation] = await Promise.all([
    validateBlockForPipeline(splitCandidate.firstDiagram, blockIndex),
    validateBlockForPipeline(splitCandidate.secondDiagram, blockIndex),
  ]);

  if (firstValidation.valid && secondValidation.valid) {
    logger.info(
      {
        blockIndex,
        firstDiagramType: firstValidation.diagramType,
        secondDiagramType: secondValidation.diagramType,
      },
      'Mermaid pipeline: Recovered diagram via split stage'
    );
    return {
      code,
      replacement: `${wrapMermaidBlock(splitCandidate.firstDiagram)}\n\n${wrapMermaidBlock(splitCandidate.secondDiagram)}`,
      metric: 'diagramsSplit',
    };
  }

  return { code, replacement: null, metric: null };
}

/**
 * One diagram through the whole cascade: regex, validate, LLM tiers, simplify, split, strip.
 *
 * A diagram that survives none of them is REMOVED rather than replaced with an apology. Text
 * like "Diagram unavailable (auto-remediated)" is worth nothing to a reader and looks like a
 * bug, which is a decision recorded in the original Stage 5C comment and kept here.
 */
async function remediateBlock(
  block: { code: string; startIndex: number; endIndex: number },
  blockIndex: number,
  llmFixCount: number,
  options: MermaidPipelineOptions | undefined
): Promise<BlockOutcome> {
  logger.debug({ blockIndex, codeLength: block.code.length }, 'Mermaid pipeline: Processing block');
  logPipelineStage('START', blockIndex, { codeLength: block.code.length });

  // Stage 1: regex sanitization, applied to the fenced form and then unwrapped again.
  const { content: sanitized, modified: regexModified } = sanitizeMermaidBlocks(
    `\`\`\`mermaid\n${block.code}\n\`\`\``
  );
  let code = sanitized
    .replace(/```mermaid\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  if (regexModified) {
    logger.debug({ blockIndex }, 'Mermaid pipeline: Regex sanitization modified block');
  }
  logPipelineStage('REGEX_SANITIZE', blockIndex, { modified: regexModified });

  // Stage 2: validation.
  let validation = await validateBlockForPipeline(code, blockIndex);
  logger.debug(
    {
      blockIndex,
      valid: validation.valid,
      diagramType: validation.diagramType,
      failureStage: validation.failureStage,
    },
    'Mermaid pipeline: Initial validation'
  );
  logPipelineStage('VALIDATE', blockIndex, {
    valid: validation.valid,
    diagramType: validation.diagramType,
    failureStage: validation.failureStage,
  });

  if (validation.valid) {
    if (regexModified) {
      logger.info(
        { blockIndex, diagramType: validation.diagramType },
        'Mermaid pipeline: Fixed by regex'
      );
    }
    return {
      replacement: wrapMermaidBlock(code),
      modified: regexModified,
      metric: regexModified ? 'diagramsFixedRegex' : null,
      llmFixCount,
    };
  }

  if (validation.failureStage === 'render') {
    logger.warn(
      { blockIndex, diagramType: validation.diagramType, errors: validation.errors },
      'Mermaid pipeline: Parse passed but render integrity failed'
    );
  }

  // Stage 3: the model cascade, unless the caller has switched it off.
  //
  // No running `modified` flag past this point: an invalid block reaches exactly three
  // endings — recovered by the LLM, recovered by simplify/split, or stripped — and all
  // three change the document, so every return below reports `modified: true`.
  if (options?.skipLLM) {
    logger.debug({ blockIndex }, 'Mermaid pipeline: Skipping LLM fix (skipLLM option)');
  } else if (validation.errors.length > 0) {
    const llm = await applyLlmCascade(code, validation, blockIndex, llmFixCount, options);
    code = llm.code;
    validation = llm.validation;
    llmFixCount = llm.llmFixCount;

    if (llm.fixed) {
      return {
        replacement: wrapMermaidBlock(code),
        modified: true,
        metric: 'diagramsFixedLLM',
        llmFixCount,
      };
    }
  }

  // Stage 5A/5B: deterministic remediation.
  const remediated = await remediateWithoutLlm(code, blockIndex);
  if (remediated.replacement !== null) {
    return {
      replacement: remediated.replacement,
      modified: true,
      metric: remediated.metric,
      llmFixCount,
    };
  }

  // Stage 5C: nothing worked. Remove the diagram.
  logger.error(
    {
      blockIndex,
      errors: validation.errors,
      originalCode: getDiagramSnippet(block.code, 500),
    },
    'Mermaid pipeline: All remediation stages failed, stripping diagram from content'
  );
  logPipelineStage('STRIP', blockIndex, { reason: 'all_fixes_failed' });

  return { replacement: '', modified: true, metric: 'diagramsFallback', llmFixCount };
}

/**
 * Splice every replacement back into the document.
 *
 * The indices are checked first and the splicing runs backwards, because each replacement
 * changes the length of everything after it. A block whose indices are inverted or which
 * overlaps its neighbour is a bug in extraction, not something to paper over, so it throws.
 */
function applyReplacements(content: string, processedBlocks: ProcessedBlock[]): string {
  processedBlocks.forEach((processed, index) => {
    const current = processed.block;

    if (current.startIndex >= current.endIndex) {
      logger.error(
        {
          blockIndex: index,
          startIndex: current.startIndex,
          endIndex: current.endIndex,
          snippet: getDiagramSnippet(current.code),
        },
        'Invalid block indices'
      );
      throw new Error(
        `Invalid block indices at position ${index}: start=${current.startIndex} >= end=${current.endIndex}`
      );
    }

    const next = processedBlocks[index + 1]?.block;
    if (next && current.endIndex > next.startIndex) {
      logger.error(
        { currentEnd: current.endIndex, nextStart: next.startIndex },
        'Overlapping blocks detected'
      );
      throw new Error(
        `Overlapping mermaid blocks: block ${index} ends at ${current.endIndex}, block ${index + 1} starts at ${next.startIndex}`
      );
    }
  });

  let finalContent = content;
  for (let i = processedBlocks.length - 1; i >= 0; i--) {
    const { block, replacement } = processedBlocks[i];
    finalContent =
      finalContent.slice(0, block.startIndex) + replacement + finalContent.slice(block.endIndex);
  }
  return finalContent;
}

export async function runMermaidFixPipeline(
  content: string,
  options?: MermaidPipelineOptions
): Promise<MermaidPipelineResult> {
  const startTime = Date.now();

  logger.info(
    { contentLength: content.length, skipLLM: options?.skipLLM ?? false },
    'Mermaid pipeline: Starting fix pipeline'
  );

  try {
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

    // Stage 0: auto-wrap raw Mermaid that was never code-fenced.
    const wrapResult = wrapRawMermaidBlocks(content);
    const processableContent = wrapResult.content;

    if (wrapResult.wrappedCount > 0) {
      metrics.diagramsAutoWrapped = wrapResult.wrappedCount;
      logger.info(
        { wrappedCount: wrapResult.wrappedCount },
        'Mermaid pipeline: Stage 0 - Wrapped raw Mermaid blocks'
      );
    }

    const blocks = extractMermaidBlocks(processableContent);
    metrics.diagramsTotal = blocks.length;

    if (blocks.length === 0) {
      logger.info({}, 'Mermaid pipeline: No Mermaid blocks found');
      metrics.durationMs = Date.now() - startTime;
      return {
        content: processableContent,
        modified: wrapResult.wrappedCount > 0,
        metrics,
      };
    }

    logger.info({ blockCount: blocks.length }, 'Mermaid pipeline: Processing blocks');

    // The LLM budget is per lesson, so it is carried from one block to the next.
    let llmFixCount = 0;
    let anyModified = false;
    const processedBlocks: ProcessedBlock[] = [];

    for (const [blockIndex, block] of blocks.entries()) {
      const outcome = await remediateBlock(block, blockIndex, llmFixCount, options);

      llmFixCount = outcome.llmFixCount;
      anyModified = anyModified || outcome.modified;
      if (outcome.metric) metrics[outcome.metric]++;
      processedBlocks.push({ block, replacement: outcome.replacement });
    }

    const finalContent = anyModified
      ? applyReplacements(processableContent, processedBlocks)
      : processableContent;

    metrics.durationMs = Date.now() - startTime;
    const modified = anyModified || wrapResult.wrappedCount > 0;

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
        modified,
        durationMs: metrics.durationMs,
      },
      'Mermaid pipeline: Pipeline complete'
    );

    return { content: finalContent, modified, metrics };
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
