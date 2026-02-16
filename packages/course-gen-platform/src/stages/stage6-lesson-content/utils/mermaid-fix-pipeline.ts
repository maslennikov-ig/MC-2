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
 * - Detect syntax errors with detailed error messages
 *
 * **Stage 3: LLM Fixing** (conditional)
 * - Only if validation fails AND LLM budget available
 * - Use LLM to fix complex syntax issues
 * - Limit: MAX_LLM_FIXES_PER_LESSON to control cost/time
 *
 * **Stage 4: Re-validation**
 * - Validate LLM-fixed diagram
 * - Confirm fix was successful
 *
 * **Stage 5: Fallback**
 * - If all else fails, replace with HTML comment
 * - Prevents broken diagrams from breaking entire lesson
 * - Manual review required
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
import { validateMermaidSyntax } from './mermaid-validator';
import { fixMermaidWithLLM } from './mermaid-llm-fixer';
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
  | 'FALLBACK'
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
    /** Diagrams fixed by regex sanitization only */
    diagramsFixedRegex: number;
    /** Diagrams fixed by LLM after regex failed */
    diagramsFixedLLM: number;
    /** Diagrams that failed all fixes (replaced with fallback) */
    diagramsFallback: number;
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
  fixedCode: string;
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
// FALLBACK GENERATOR
// ============================================================================

/**
 * Generate fallback text for broken diagrams
 *
 * When all fix attempts fail, replace the diagram with an HTML comment
 * that includes the diagram type for manual review.
 *
 * @param brokenDiagram - The diagram code that could not be fixed
 * @returns Fallback HTML comment
 *
 * @example
 * ```typescript
 * const fallback = generateFallbackText('flowchart TD\n  A[Bad syntax');
 * // "<!-- Mermaid flowchart could not be rendered. Please review manually. -->"
 *
 * const fallback2 = generateFallbackText('invalid code');
 * // "<!-- Mermaid diagram could not be rendered. Please review manually. -->"
 * ```
 */
function generateFallbackText(brokenDiagram: string): string {
  // Extract diagram type from first line
  const typeMatch = brokenDiagram.match(
    /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline)/m
  );
  const diagramType = typeMatch ? typeMatch[1] : 'diagram';

  // Sanitize diagram type to prevent XSS injection via --> or script tags
  const safeDiagramType = diagramType.replace(/[<>'"&-]/g, '');

  return `<!-- Mermaid ${safeDiagramType} could not be rendered. Please review manually. -->`;
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
 * 5. Fallback (if all else fails)
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
      diagramsFixedRegex: 0,
      diagramsFixedLLM: 0,
      diagramsFallback: 0,
      durationMs: 0,
    };

    // Extract all Mermaid blocks
    const blocks = extractMermaidBlocks(content);
    metrics.diagramsTotal = blocks.length;

    // Edge case: No Mermaid blocks
    if (blocks.length === 0) {
      logger.info({}, 'Mermaid pipeline: No Mermaid blocks found');
      metrics.durationMs = Date.now() - startTime;
      return {
        content,
        modified: false,
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
      let validation = await validateMermaidSyntax(fixedCode);

      logger.debug(
        {
          blockIndex: i,
          valid: validation.valid,
          diagramType: validation.diagramType,
        },
        'Mermaid pipeline: Initial validation'
      );

      // Log validation result
      logPipelineStage('VALIDATE', i, {
        valid: validation.valid,
        diagramType: validation.diagramType,
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

        processedBlocks.push({ block, fixedCode });
        continue;
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
              validation = await validateMermaidSyntax(fixedCode);

              logger.debug(
                {
                  blockIndex: i,
                  valid: validation.valid,
                },
                'Mermaid pipeline: Re-validation after LLM fix'
              );

              // Log re-validation result
              logPipelineStage('REVALIDATE', i, { valid: validation.valid });

              if (validation.valid) {
                metrics.diagramsFixedLLM++;
                logger.info(
                  {
                    blockIndex: i,
                    diagramType: validation.diagramType,
                  },
                  'Mermaid pipeline: Fixed by LLM'
                );

                processedBlocks.push({ block, fixedCode });
                continue;
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
      // Stage 5: Fallback
      // -------------------------------------------------------------------------
      logger.warn(
        {
          blockIndex: i,
          errors: validation.errors,
          snippet: getDiagramSnippet(block.code),
        },
        'Mermaid pipeline: All fixes failed, using fallback'
      );

      // Log fallback
      logPipelineStage('FALLBACK', i, { reason: 'all_fixes_failed' });

      fixedCode = generateFallbackText(block.code);
      metrics.diagramsFallback++;
      anyModified = true;

      processedBlocks.push({ block, fixedCode });
    }

    // -------------------------------------------------------------------------
    // Replace blocks in original content
    // -------------------------------------------------------------------------
    let finalContent = content;

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
        const { block, fixedCode } = processedBlocks[i];

        // Reconstruct Mermaid block (unless it's a fallback comment)
        const replacement = fixedCode.startsWith('<!--')
          ? fixedCode
          : `\`\`\`mermaid\n${fixedCode}\n\`\`\``;

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
        fixedRegex: metrics.diagramsFixedRegex,
        fixedLLM: metrics.diagramsFixedLLM,
        fallback: metrics.diagramsFallback,
        modified: anyModified,
        durationMs: metrics.durationMs,
      },
      'Mermaid pipeline: Pipeline complete'
    );

    return {
      content: finalContent,
      modified: anyModified,
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
