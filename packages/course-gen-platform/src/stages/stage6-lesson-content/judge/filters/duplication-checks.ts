/**
 * Section duplication detection
 * @module stages/stage6-lesson-content/judge/filters/duplication-checks
 */

import type { FilterCheckResult } from './types';
import { logger } from '@/shared/logger';

interface DuplicateTitlePair {
  title1: string;
  title2: string;
  similarity: number;
}

interface OverlapPair {
  title1: string;
  title2: string;
  overlap: number;
  sharedNgrams: number;
}

// ============================================================================
// SECTION DUPLICATION CHECK
// ============================================================================

/**
 * Check for duplicate titles and high-overlap section bodies.
 *
 * Detects:
 * - near-duplicate headers (generation loops)
 * - recap-like content repetition across sections (cross-section duplication)
 */
export function checkSectionDuplication(content: string): FilterCheckResult & {
  duplicatePairs: DuplicateTitlePair[];
  overlapPairs: OverlapPair[];
  totalSections: number;
} {
  // Extract all section headers (## and ### only, skip # which is lesson title)
  const headerMatches = content.match(/^#{2,3}\s+(.+)$/gm) || [];
  const headers = headerMatches.map(h => h.replace(/^#{2,3}\s+/, '').trim());

  const duplicatePairs: DuplicateTitlePair[] = [];

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

  const overlapPairs = detectSectionBodyOverlap(content);
  const totalDuplicationPairs = duplicatePairs.length + overlapPairs.length;

  const passed = totalDuplicationPairs === 0;
  // Each duplicate/overlap pair reduces score by 25% (max 4 pairs = 0 score)
  const scoreContribution = Math.max(0, 1 - totalDuplicationPairs * 0.25);

  const result: FilterCheckResult & {
    duplicatePairs: DuplicateTitlePair[];
    overlapPairs: OverlapPair[];
    totalSections: number;
  } = {
    passed,
    actual: passed
      ? 'no duplicates'
      : `${duplicatePairs.length} duplicate title pairs, ${overlapPairs.length} overlap pairs`,
    scoreContribution,
    duplicatePairs,
    overlapPairs,
    totalSections: headers.length,
  };

  if (!passed) {
    result.failure = {
      filter: 'sectionDuplication',
      expected: '0 duplicate sections or high-overlap section bodies',
      actual: `${duplicatePairs.length} duplicate title pairs, ${overlapPairs.length} overlap pairs`,
      severity: totalDuplicationPairs > 2 ? 'critical' : 'major',
    };

    const titleExamples = duplicatePairs
      .slice(0, 2)
      .map(p => `"${p.title1}" ≈ "${p.title2}"`)
      .join('; ');

    const overlapExamples = overlapPairs
      .slice(0, 2)
      .map(p => `"${p.title1}" ↔ "${p.title2}" (${Math.round(p.overlap * 100)}% shared phrasing)`)
      .join('; ');

    const exampleParts = [titleExamples, overlapExamples].filter(Boolean).join('; ');
    result.suggestion = `Duplicate sections detected: ${exampleParts}${totalDuplicationPairs > 2 ? ` (+${totalDuplicationPairs - 2} more)` : ''}. Remove repeated recaps and keep each section unique.`;
  }

  if (totalDuplicationPairs > 0) {
    logger.warn({
      msg: 'Section duplication detected',
      duplicatePairs: duplicatePairs.slice(0, 5),
      overlapPairs: overlapPairs.slice(0, 5),
      totalSections: headers.length,
    });
  }

  return result;
}

/**
 * Extract top-level markdown sections (## headers) with their body content.
 */
function extractTopLevelSections(content: string): Array<{ title: string; content: string }> {
  const lines = content.split('\n');
  const sections: Array<{ title: string; content: string }> = [];

  let currentTitle = '';
  let currentBody: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const headerMatch = line.match(/^##\s+(.+)$/);

    if (headerMatch) {
      if (currentTitle) {
        sections.push({ title: currentTitle, content: currentBody.join('\n').trim() });
      }

      currentTitle = headerMatch[1].trim();
      currentBody = [];
      continue;
    }

    if (currentTitle) {
      currentBody.push(rawLine);
    }
  }

  if (currentTitle) {
    sections.push({ title: currentTitle, content: currentBody.join('\n').trim() });
  }

  return sections;
}

/**
 * Detect high overlap between top-level section bodies via 5-gram containment.
 */
function detectSectionBodyOverlap(content: string): OverlapPair[] {
  const sections = extractTopLevelSections(content).filter(section => {
    const lowerTitle = section.title.toLowerCase();

    // Ignore template-heavy sections that naturally reuse wording.
    return !/(exercise|упражнен|digest|краткое содержание)/i.test(lowerTitle);
  });

  const overlapPairs: OverlapPair[] = [];

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const overlapAnalysis = calculateSectionOverlap(sections[i].content, sections[j].content);
      if (overlapAnalysis.overlap >= 0.32) {
        overlapPairs.push({
          title1: sections[i].title,
          title2: sections[j].title,
          overlap: overlapAnalysis.overlap,
          sharedNgrams: overlapAnalysis.sharedNgrams,
        });
      }
    }
  }

  return overlapPairs;
}

/**
 * Calculate overlap between two section bodies via 5-gram containment.
 */
function calculateSectionOverlap(
  sectionA: string,
  sectionB: string
): { overlap: number; sharedNgrams: number } {
  const tokensA = normalizeTokens(sectionA);
  const tokensB = normalizeTokens(sectionB);

  // Short sections are noisy; skip overlap checks for them.
  if (tokensA.length < 40 || tokensB.length < 40) {
    return { overlap: 0, sharedNgrams: 0 };
  }

  const ngramsA = buildNgramSet(tokensA, 5);
  const ngramsB = buildNgramSet(tokensB, 5);

  if (ngramsA.size === 0 || ngramsB.size === 0) {
    return { overlap: 0, sharedNgrams: 0 };
  }

  let intersection = 0;
  const [smaller, larger] = ngramsA.size < ngramsB.size ? [ngramsA, ngramsB] : [ngramsB, ngramsA];
  for (const gram of smaller) {
    if (larger.has(gram)) intersection++;
  }

  const overlap = intersection / Math.min(ngramsA.size, ngramsB.size);
  return { overlap, sharedNgrams: intersection };
}

function normalizeTokens(content: string): string[] {
  return content
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[[^\]]+\]\([^)]+\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3);
}

function buildNgramSet(tokens: string[], n: number): Set<string> {
  const set = new Set<string>();

  if (tokens.length < n) {
    return set;
  }

  for (let i = 0; i <= tokens.length - n; i++) {
    set.add(tokens.slice(i, i + n).join(' '));
  }

  return set;
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
