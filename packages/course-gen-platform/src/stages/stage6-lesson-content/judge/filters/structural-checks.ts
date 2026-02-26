/**
 * Structural content checks (truncation, Mermaid syntax)
 * @module stages/stage6-lesson-content/judge/filters/structural-checks
 */

import type { FilterCheckResult } from './types';
import { MERMAID_BLOCK_REGEX } from '../../utils/mermaid-sanitizer';
import { countMermaidFallbackComments } from '../../utils/mermaid-fallback-marker';

// ============================================================================
// CONTENT TRUNCATION CHECK (Self-Review Pre-filter)
// ============================================================================

/**
 * Check if content appears truncated or incomplete
 *
 * Signs of truncation:
 * - Last section doesn't end with proper punctuation (. ! ? 。 ！ ？)
 * - Unmatched code blocks (odd number of ```)
 * - Incomplete sentences (ends with comma, "and", "or", etc.)
 * - Suspiciously short last section
 *
 * @param content - Lesson content (markdown string)
 * @returns Filter check result with truncation issues
 */
export function checkContentTruncation(content: string): FilterCheckResult & {
  truncationIssues: string[];
  lastCharacter: string;
  hasMatchedCodeBlocks: boolean;
} {
  const issues: string[] = [];

  // Check 1: Proper ending punctuation
  const trimmedContent = content.trim();

  // Get last meaningful character (skip closing markdown like **)
  let lastMeaningfulIndex = trimmedContent.length - 1;
  while (lastMeaningfulIndex > 0 && /[*_`#\s]/.test(trimmedContent[lastMeaningfulIndex])) {
    lastMeaningfulIndex--;
  }
  const lastMeaningfulChar = trimmedContent[lastMeaningfulIndex];

  const validEndingPunctuation = /[.!?。！？:]/;
  if (!validEndingPunctuation.test(lastMeaningfulChar)) {
    issues.push(
      `Content does not end with proper punctuation (last char: "${lastMeaningfulChar}")`
    );
  }

  // Check 2: Matched code blocks
  const codeBlockCount = (content.match(/```/g) || []).length;
  const hasMatchedCodeBlocks = codeBlockCount % 2 === 0;
  if (!hasMatchedCodeBlocks) {
    issues.push(
      `Unmatched code blocks detected (${codeBlockCount} markers found, expected even number)`
    );
  }

  // Check 3: Incomplete sentence patterns at the end
  const lastSentence = trimmedContent.slice(-100);
  const incompletePatterns = [
    /,\s*$/, // Ends with comma
    /\band\s*$/i, // Ends with "and"
    /\bor\s*$/i, // Ends with "or"
    /\bthe\s*$/i, // Ends with "the"
    /\ba\s*$/i, // Ends with "a"
    /\bto\s*$/i, // Ends with "to"
    /\bof\s*$/i, // Ends with "of"
    /\bи\s*$/i, // Russian "and"
    /\bили\s*$/i, // Russian "or"
    /\bчто\s*$/i, // Russian "that"
  ];

  for (const pattern of incompletePatterns) {
    if (pattern.test(lastSentence)) {
      issues.push('Content appears to end mid-sentence');
      break;
    }
  }

  // Check 4: Very short content (less than 200 characters suggests truncation)
  if (trimmedContent.length < 200) {
    issues.push(`Content suspiciously short (${trimmedContent.length} characters)`);
  }

  const passed = issues.length === 0;

  // Score: 1.0 if clean, reduces based on number of issues
  const scoreContribution = Math.max(0, 1 - issues.length * 0.25);

  const result: FilterCheckResult & {
    truncationIssues: string[];
    lastCharacter: string;
    hasMatchedCodeBlocks: boolean;
  } = {
    passed,
    actual: issues.length === 0 ? 'no truncation detected' : `${issues.length} issues`,
    scoreContribution,
    truncationIssues: issues,
    lastCharacter: lastMeaningfulChar,
    hasMatchedCodeBlocks,
  };

  if (!passed) {
    result.failure = {
      filter: 'contentTruncation',
      expected: 'Complete, properly terminated content',
      actual: `${issues.length} truncation issues`,
      severity: issues.length > 2 ? 'critical' : 'major',
    };
    result.suggestion = `Content appears truncated: ${issues.join('; ')}. Ensure all content is complete and properly terminated.`;
  }

  return result;
}

// ============================================================================
// MERMAID SYNTAX CHECK (Self-Review Pre-filter)
// ============================================================================

// Note: MERMAID_BLOCK_REGEX imported from ../../utils/mermaid-sanitizer (DRY)

/**
 * Check Mermaid diagrams for syntax issues
 *
 * Detects common Mermaid syntax problems:
 * - Escaped quotes `\"` that break rendering
 * - Unclosed brackets [] or braces {}
 * - Invalid arrow syntax (-> should be -->)
 *
 * IMPORTANT: This runs AFTER the sanitizer, so it catches edge cases
 * that slipped through automated fixing.
 *
 * @param content - Lesson content (markdown string)
 * @returns Filter check result with Mermaid issues
 */
export function checkMermaidSyntax(content: string): FilterCheckResult & {
  mermaidIssues: string[];
  affectedDiagrams: number;
  totalDiagrams: number;
  fallbackComments: number;
} {
  const issues: string[] = [];
  let affectedDiagrams = 0;
  let totalDiagrams = 0;
  const fallbackComments = countMermaidFallbackComments(content);

  // Extract all Mermaid blocks
  const mermaidBlocks: string[] = [];
  content.replace(MERMAID_BLOCK_REGEX, (_, mermaidContent: string) => {
    mermaidBlocks.push(mermaidContent);
    return '';
  });

  totalDiagrams = mermaidBlocks.length;

  // Fallback comment means Mermaid rendering failed and was manually masked.
  // Treat this as a critical integrity signal even when no fenced blocks remain.
  if (fallbackComments > 0) {
    issues.push(
      `Detected ${fallbackComments} Mermaid fallback comment(s): diagram could not be rendered`
    );
    affectedDiagrams += fallbackComments;
  }

  // No Mermaid blocks and no fallback comments - return perfect score
  if (totalDiagrams === 0 && fallbackComments === 0) {
    return {
      passed: true,
      actual: 'no mermaid diagrams',
      scoreContribution: 1.0,
      mermaidIssues: [],
      affectedDiagrams: 0,
      totalDiagrams: 0,
      fallbackComments: 0,
    };
  }

  for (let i = 0; i < mermaidBlocks.length; i++) {
    const block = mermaidBlocks[i];
    let hasIssues = false;

    // Check for escaped quotes (primary issue)
    if (/\\"/.test(block)) {
      issues.push(`Diagram ${i + 1}: Contains escaped quotes (\\") that break rendering`);
      hasIssues = true;
    }

    // Check for unclosed brackets
    const openBrackets = (block.match(/\[/g) || []).length;
    const closeBrackets = (block.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      issues.push(
        `Diagram ${i + 1}: Unclosed brackets (${openBrackets} open, ${closeBrackets} close)`
      );
      hasIssues = true;
    }

    // Check for unclosed braces
    const openBraces = (block.match(/\{/g) || []).length;
    const closeBraces = (block.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      issues.push(`Diagram ${i + 1}: Unclosed braces (${openBraces} open, ${closeBraces} close)`);
      hasIssues = true;
    }

    // Check for invalid arrow syntax (-> without proper format)
    // Valid: -->, -.->  Invalid: -> (naked arrow)
    // Pattern: not preceded by - or . and followed by space or letter
    if (/(?<![-.])->(?![->])/.test(block)) {
      issues.push(`Diagram ${i + 1}: Invalid arrow syntax (use --> instead of ->)`);
      hasIssues = true;
    }

    if (hasIssues) {
      affectedDiagrams++;
    }
  }

  const passed = issues.length === 0;
  // Score: 1.0 if clean, reduces by 0.25 per issue (max 4 issues = 0)
  const scoreContribution = Math.max(0, 1 - issues.length * 0.25);

  const result: FilterCheckResult & {
    mermaidIssues: string[];
    affectedDiagrams: number;
    totalDiagrams: number;
    fallbackComments: number;
  } = {
    passed,
    actual: issues.length === 0 ? 'all diagrams valid' : `${issues.length} issues`,
    scoreContribution,
    mermaidIssues: issues,
    affectedDiagrams,
    totalDiagrams,
    fallbackComments,
  };

  if (!passed) {
    // Severity: 'major' for rendering-breaking issues
    result.failure = {
      filter: 'mermaidSyntax',
      expected: 'Valid Mermaid syntax',
      actual: `${issues.length} Mermaid integrity issues (${affectedDiagrams} affected items, ${fallbackComments} fallback comments)`,
      severity: fallbackComments > 0 ? 'critical' : 'major',
    };
    const fallbackHint =
      fallbackComments > 0
        ? ' Remove fallback comments by regenerating/fixing the original Mermaid blocks.'
        : '';
    result.suggestion = `Mermaid syntax issues detected: ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3} more)` : ''}. Fix escaped quotes and ensure proper bracket matching.${fallbackHint}`;
  }

  return result;
}
