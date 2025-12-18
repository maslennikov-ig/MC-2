/**
 * Quick Sanity Check for Generated Content
 * @module stages/stage6-lesson-content/utils/sanity-check
 *
 * Lightweight pre-save validation to catch obvious generation failures.
 * NOT a replacement for LLM Judge - just catches catastrophic failures.
 *
 * Checks:
 * - Empty or near-empty content
 * - Missing headings (LLM returned plain text)
 * - Critically short content (< 200 words)
 */

import { logger } from '@/shared/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface SanityCheckResult {
  /** Whether content passes basic sanity checks */
  ok: boolean;
  /** Failure reason code (if not ok) */
  reason?: 'EMPTY_OR_NEAR_EMPTY' | 'NO_HEADINGS' | 'TOO_SHORT';
  /** Basic metrics extracted during check */
  metrics?: {
    charCount: number;
    wordCount: number;
    hasHeadings: boolean;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SANITY_THRESHOLDS = {
  /** Minimum character count to not be "empty" */
  MIN_CHARS: 100,
  /** Minimum word count for valid lesson content */
  MIN_WORDS: 200,
} as const;

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Quick sanity check for generated markdown content
 *
 * Performs lightweight validation to catch obvious generation failures:
 * - Empty or near-empty content (< 100 chars)
 * - No headings at all (LLM returned unstructured text)
 * - Too short (< 200 words)
 *
 * This is NOT a replacement for LLM Judge - it only catches catastrophic
 * failures that indicate something went wrong with generation.
 *
 * @param markdown - Raw markdown content to check
 * @returns Sanity check result with ok flag and optional reason
 *
 * @example
 * ```typescript
 * const result = quickSanityCheck(generatedMarkdown);
 * if (!result.ok) {
 *   logger.warn({ reason: result.reason }, 'Content failed sanity check');
 * }
 * ```
 */
export function quickSanityCheck(markdown: string): SanityCheckResult {
  // 1. Empty or near-empty check
  const trimmed = (markdown || '').trim();
  const charCount = trimmed.length;

  if (charCount < SANITY_THRESHOLDS.MIN_CHARS) {
    logger.debug(
      { charCount, threshold: SANITY_THRESHOLDS.MIN_CHARS },
      'Sanity check: content too short (chars)'
    );
    return {
      ok: false,
      reason: 'EMPTY_OR_NEAR_EMPTY',
      metrics: { charCount, wordCount: 0, hasHeadings: false },
    };
  }

  // 2. No headings check (LLM returned unstructured plain text)
  const hasHeadings = /^#{1,6}\s+.+/m.test(trimmed);

  if (!hasHeadings) {
    logger.debug({ charCount }, 'Sanity check: no headings found');
    return {
      ok: false,
      reason: 'NO_HEADINGS',
      metrics: { charCount, wordCount: 0, hasHeadings: false },
    };
  }

  // 3. Word count check (excluding code blocks for fair count)
  const textWithoutCode = trimmed
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/`[^`]+`/g, ''); // Remove inline code

  const wordCount = textWithoutCode.split(/\s+/).filter((w) => w.length > 0).length;

  if (wordCount < SANITY_THRESHOLDS.MIN_WORDS) {
    logger.debug(
      { wordCount, threshold: SANITY_THRESHOLDS.MIN_WORDS },
      'Sanity check: content too short (words)'
    );
    return {
      ok: false,
      reason: 'TOO_SHORT',
      metrics: { charCount, wordCount, hasHeadings: true },
    };
  }

  // All checks passed
  return {
    ok: true,
    metrics: { charCount, wordCount, hasHeadings: true },
  };
}
