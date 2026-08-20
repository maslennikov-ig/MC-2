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
      // Stage 3: LLM Fixing with model cascade (primary → secondary → ultimate)
      // -------------------------------------------------------------------------
      const MODEL_TIERS: import('./mermaid-llm-fixer').MermaidModelTier[] = [
        'primary',
        'secondary',
        'ultimate',
      ];
      let llmFixedThisBlock = false;

      if (!options?.skipLLM && validation.errors.length > 0) {
        for (const tier of MODEL_TIERS) {
          if (llmFixCount >= MAX_LLM_FIXES_PER_LESSON) {
            logger.warn(
              { blockIndex: i, llmFixCount, tier },
              'Mermaid pipeline: LLM budget exhausted'
            );
            break;
          }

          logger.info(
            { blockIndex: i, error: validation.errors[0], llmFixCount, tier },
            `Mermaid pipeline: Attempting LLM fix (${tier})`
          );

          logPipelineStage('LLM_FIX', i, { attempting: true, tier });

          try {
            const llmResult = await fixMermaidWithLLM(
              fixedCode,
              validation.errors[0],
              { llmFixCount, courseId: options?.courseId },
              tier
            );

            if (llmResult.fixed) {
              const hasXSSPatterns =
                llmResult.content.includes('<script') ||
                llmResult.content.includes('javascript:') ||
                llmResult.content.includes('onerror=') ||
                llmResult.content.includes('onclick=');

              if (hasXSSPatterns) {
                logger.warn(
                  { blockIndex: i, tier, snippet: getDiagramSnippet(llmResult.content) },
                  'Mermaid pipeline: LLM output contains XSS patterns, trying next tier'
                );
                continue;
              }

              fixedCode = llmResult.content;
              llmFixCount++;
              anyModified = true;

              // Re-validate
              validation = await validateBlockForPipeline(fixedCode, i);

              logPipelineStage('REVALIDATE', i, {
                valid: validation.valid,
                failureStage: validation.failureStage,
                tier,
              });

              if (validation.valid) {
                metrics.diagramsFixedLLM++;
                logger.info(
                  { blockIndex: i, diagramType: validation.diagramType, tier },
                  `Mermaid pipeline: Fixed by LLM (${tier})`
                );

                processedBlocks.push({ block, replacement: wrapMermaidBlock(fixedCode) });
                llmFixedThisBlock = true;
                break;
              }

              logger.warn(
                { blockIndex: i, tier, errors: validation.errors },
                `Mermaid pipeline: LLM fix (${tier}) still invalid, escalating`
              );
            }
          } catch (error) {
            logger.warn(
              {
                blockIndex: i,
                tier,
                error: error instanceof Error ? error.message : String(error),
              },
              `Mermaid pipeline: LLM fix (${tier}) failed`
            );
          }
        }
      } else if (options?.skipLLM) {
        logger.debug({ blockIndex: i }, 'Mermaid pipeline: Skipping LLM fix (skipLLM option)');
      }

      if (llmFixedThisBlock) continue;

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
      // Stage 5C: Strip unfixable diagram (instead of text fallback)
      // Text fallback like "Diagram unavailable (auto-remediated)" provides
      // zero value to users. Better to have no diagram than broken text.
      // -------------------------------------------------------------------------
      logger.error(
        {
          blockIndex: i,
          errors: validation.errors,
          originalCode: getDiagramSnippet(block.code, 500),
        },
        'Mermaid pipeline: All remediation stages failed, stripping diagram from content'
      );

      logPipelineStage('STRIP', i, { reason: 'all_fixes_failed' });

      metrics.diagramsFallback++;
      anyModified = true;

      processedBlocks.push({ block, replacement: '' });
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
