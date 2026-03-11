/**
 * Strip LLM Metadata from generated content
 * @module stages/stage6-lesson-content/judge/strip-metadata
 *
 * Defense-in-depth sanitizer that removes trailing LLM meta-information
 * (summaries of changes, scores, checklists) that should never appear
 * in user-facing lesson content.
 *
 * Only strips from the END of the document — never removes content
 * from the middle to avoid false positives on legitimate headings.
 */

import { logger } from '../../../shared/logger';

/**
 * Patterns that indicate the start of trailing LLM metadata.
 * Each pattern is tested against lines at the END of the content.
 * Order matters: more specific patterns first.
 */
const METADATA_HEADING_PATTERNS: RegExp[] = [
  // "## SUMMARY OF CHANGES (Iteration 2)" and variations
  /^#{1,3}\s*SUMMARY\s+OF\s+CHANGES/i,
  // "### Changes Made"
  /^#{1,3}\s*Changes\s+Made/i,
  // "### Summary of Changes" / "## Summary"
  /^#{1,3}\s*Summary\s+of\s+Changes/i,
  /^#{1,3}\s*Summary$/i,
  // "## Quality Checklist" / "### Quality Check"
  /^#{1,3}\s*Quality\s+(Checklist|Check)/i,
  // "## Revision Notes" / "### Revision Summary"
  /^#{1,3}\s*Revision\s+(Notes|Summary)/i,
  // "## Issues Addressed"
  /^#{1,3}\s*Issues\s+Addressed/i,
];

/**
 * Standalone line patterns that indicate metadata (not headings).
 * These are checked only in the trailing portion of the document.
 */
const METADATA_LINE_PATTERNS: RegExp[] = [
  // "Final Score: 95%" or "Score: 100%"
  /^(?:Final\s+)?Score:\s*\d+/i,
  // "Fixed Issues:" as a standalone label
  /^Fixed\s+Issues:\s*$/i,
  // "Preserved Improvements:" as a standalone label
  /^Preserved\s+Improvements:\s*$/i,
  // "Issues Addressed:" as a standalone label
  /^Issues\s+Addressed:\s*$/i,
];

/**
 * Maximum number of lines to scan from the end for metadata.
 * Prevents scanning entire documents for false positives.
 */
const MAX_TRAILING_SCAN_LINES = 40;

/**
 * Strip trailing LLM metadata from generated content.
 *
 * Scans the last portion of the content for metadata headings/patterns
 * and truncates everything from the first metadata marker to the end.
 *
 * @param content - Raw LLM output content
 * @returns Cleaned content with trailing metadata removed
 */
export function stripLLMMetadata(content: string): string {
  if (!content) return content;

  const lines = content.split('\n');

  // Don't scan very short content
  if (lines.length < 5) return content;

  // Determine scan window: only look at the last N lines
  const scanStart = Math.max(0, lines.length - MAX_TRAILING_SCAN_LINES);

  // Find the earliest metadata marker in the trailing window
  let cutIndex = -1;

  for (let i = scanStart; i < lines.length; i++) {
    const trimmedLine = lines[i].trim();

    // Skip empty lines — they don't start metadata blocks
    if (!trimmedLine) continue;

    // Check for --- separator followed by ALL-CAPS heading
    if (trimmedLine === '---' && i + 1 < lines.length) {
      const nextNonEmpty = findNextNonEmptyLine(lines, i + 1);
      if (nextNonEmpty !== -1) {
        const nextLine = lines[nextNonEmpty].trim();
        if (isMetadataHeading(nextLine)) {
          cutIndex = i;
          break;
        }
      }
    }

    // Check heading patterns
    if (isMetadataHeading(trimmedLine)) {
      cutIndex = i;
      break;
    }

    // Check standalone metadata line patterns
    if (isMetadataLine(trimmedLine)) {
      cutIndex = i;
      break;
    }
  }

  if (cutIndex === -1) {
    return content;
  }

  // Strip trailing empty lines before the cut point
  let endIndex = cutIndex;
  while (endIndex > 0 && lines[endIndex - 1].trim() === '') {
    endIndex--;
  }

  return lines.slice(0, endIndex).join('\n');
}

/**
 * Check if a line matches any metadata heading pattern.
 */
function isMetadataHeading(line: string): boolean {
  return METADATA_HEADING_PATTERNS.some(pattern => pattern.test(line));
}

/**
 * Check if a line matches any standalone metadata line pattern.
 */
function isMetadataLine(line: string): boolean {
  return METADATA_LINE_PATTERNS.some(pattern => pattern.test(line));
}

/**
 * Find the next non-empty line index starting from a given position.
 */
function findNextNonEmptyLine(lines: string[], startFrom: number): number {
  for (let i = startFrom; i < lines.length && i < startFrom + 3; i++) {
    if (lines[i].trim()) return i;
  }
  return -1;
}

// ============================================================================
// LO-CODE STRIPPING (defense-in-depth)
// ============================================================================

/**
 * Pattern matching internal Learning Objective codes in all observed formats:
 *  1. **LO-X.X-X** —    (bold + trailing punct)
 *  2. **(LO-X.X-X)**    (bold parens)
 *  3. (LO-X.X-X):       (parens + colon)
 *  4. [LO-X.X-X]        (brackets — from prompt format)
 *  5. LO-X.X-X:         (bare ref with word boundary)
 *
 * Captures optional surrounding **, (), [] and trailing separators (—–:,-).
 */
const LO_CODE_PATTERN =
  /\*{0,2}\[?\(?\bLO-\d+\.\d+[-.]?\d*\b\)?\]?\*{0,2}[^\S\n]*[—–:,\-]?[^\S\n]*/g;

/**
 * Strip internal Learning Objective codes from generated content.
 *
 * Unlike stripLLMMetadata (trailing-only), this scans the ENTIRE document
 * because LO-codes can appear inline (headings, paragraphs, exercises).
 *
 * @param content - Content potentially containing LO-code references
 * @returns Cleaned content with LO-codes removed
 */
export function stripLOCodes(content: string): string {
  if (!content) return content;
  return content.replace(LO_CODE_PATTERN, '').replace(/ {2,}/g, ' ');
}

/**
 * Strip LO-codes with logging.
 * Use this wrapper in production code paths for observability.
 *
 * @param content - Raw LLM output
 * @param context - Logging context (sectionId, component name, etc.)
 * @returns Cleaned content
 */
export function stripLOCodesWithLogging(
  content: string,
  context: { sectionId?: string; component?: string }
): string {
  const cleaned = stripLOCodes(content);

  if (cleaned.length < content.length) {
    const strippedBytes = content.length - cleaned.length;

    logger.warn(
      {
        event: 'lo_codes_stripped',
        component: context.component || 'unknown',
        sectionId: context.sectionId,
        strippedBytes,
      },
      `Stripped ${strippedBytes} bytes of LO-code references from output`
    );
  }

  return cleaned;
}

// ============================================================================
// LOGGING WRAPPERS
// ============================================================================

/**
 * Strip LLM metadata with logging.
 * Use this wrapper in production code paths for observability.
 *
 * @param content - Raw LLM output
 * @param context - Logging context (sectionId, component name, etc.)
 * @returns Cleaned content
 */
export function stripLLMMetadataWithLogging(
  content: string,
  context: { sectionId?: string; component?: string }
): string {
  const cleaned = stripLLMMetadata(content);

  if (cleaned.length < content.length) {
    const strippedBytes = content.length - cleaned.length;
    const strippedFragment = content.slice(cleaned.length, cleaned.length + 200);

    logger.warn(
      {
        event: 'llm_metadata_stripped',
        component: context.component || 'unknown',
        sectionId: context.sectionId,
        strippedBytes,
        strippedFragment,
      },
      `Stripped ${strippedBytes} bytes of LLM metadata from output`
    );
  }

  return cleaned;
}
