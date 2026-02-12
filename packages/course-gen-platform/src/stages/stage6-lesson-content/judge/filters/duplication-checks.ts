/**
 * Section duplication detection
 * @module stages/stage6-lesson-content/judge/filters/duplication-checks
 */

import type { FilterCheckResult } from './types';
import { logger } from '@/shared/logger';

// ============================================================================
// SECTION DUPLICATION CHECK
// ============================================================================

/**
 * Check for duplicate or near-duplicate section titles
 *
 * Detects when LLM generates the same section multiple times,
 * which indicates generation loop or hallucination.
 *
 * Uses Levenshtein similarity - titles > 80% similar are considered duplicates.
 *
 * @param content - Content to check (markdown string)
 * @returns Filter check result with duplicate details
 */
export function checkSectionDuplication(content: string): FilterCheckResult & {
  duplicatePairs: Array<{ title1: string; title2: string; similarity: number }>;
  totalSections: number;
} {
  // Extract all section headers (## and ### only, skip # which is lesson title)
  const headerMatches = content.match(/^#{2,3}\s+(.+)$/gm) || [];
  const headers = headerMatches.map(h => h.replace(/^#{2,3}\s+/, '').trim());

  const duplicatePairs: Array<{ title1: string; title2: string; similarity: number }> = [];

  // Compare each pair of headers for similarity
  for (let i = 0; i < headers.length; i++) {
    for (let j = i + 1; j < headers.length; j++) {
      const similarity = calculateSimilarity(headers[i], headers[j]);
      if (similarity > 0.8) {
        duplicatePairs.push({
          title1: headers[i],
          title2: headers[j],
          similarity,
        });
      }
    }
  }

  const passed = duplicatePairs.length === 0;
  // Each duplicate pair reduces score by 25% (max 4 pairs = 0 score)
  const scoreContribution = Math.max(0, 1 - duplicatePairs.length * 0.25);

  const result: FilterCheckResult & {
    duplicatePairs: Array<{ title1: string; title2: string; similarity: number }>;
    totalSections: number;
  } = {
    passed,
    actual: passed ? 'no duplicates' : `${duplicatePairs.length} duplicate pairs`,
    scoreContribution,
    duplicatePairs,
    totalSections: headers.length,
  };

  if (!passed) {
    result.failure = {
      filter: 'sectionDuplication',
      expected: '0 duplicate sections',
      actual: `${duplicatePairs.length} duplicate pairs`,
      severity: duplicatePairs.length > 2 ? 'critical' : 'major',
    };
    const examples = duplicatePairs
      .slice(0, 2)
      .map(p => `"${p.title1}" ≈ "${p.title2}"`)
      .join('; ');
    result.suggestion = `Duplicate sections detected: ${examples}${duplicatePairs.length > 2 ? ` (+${duplicatePairs.length - 2} more)` : ''}. Remove duplicates to improve content structure.`;
  }

  if (duplicatePairs.length > 0) {
    logger.warn({
      msg: 'Section duplication detected',
      duplicatePairs: duplicatePairs.slice(0, 5),
      totalSections: headers.length,
    });
  }

  return result;
}

/**
 * Calculate similarity between two strings (0-1)
 * Uses Levenshtein distance normalized by max length
 */
function calculateSimilarity(s1: string, s2: string): number {
  const s1Lower = s1.toLowerCase();
  const s2Lower = s2.toLowerCase();

  if (s1Lower === s2Lower) return 1.0;

  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(s1Lower, s2Lower);
  return 1 - distance / maxLen;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  // Use two-row optimization for memory efficiency
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}
