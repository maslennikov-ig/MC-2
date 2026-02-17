/**
 * Content quality and learning objective checks
 * @module stages/stage6-lesson-content/judge/filters/content-quality
 */

import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { FilterCheckResult } from './types';

// ============================================================================
// LEARNING OBJECTIVE COVERAGE
// ============================================================================

/**
 * Common words to exclude when extracting key terms
 */
const COMMON_WORDS = new Set([
  'the',
  'and',
  'for',
  'that',
  'this',
  'with',
  'from',
  'have',
  'will',
  'been',
  'would',
  'could',
  'should',
  'into',
  'about',
  'more',
  'when',
  'than',
  'also',
  'only',
  'their',
  'which',
  'each',
  'other',
  'being',
  'able',
  'after',
  'before',
  'must',
  'need',
  'such',
  'what',
  'both',
]);

/**
 * Extract key terms from text (words 4+ chars, not common words)
 *
 * @param text - Text to extract terms from
 * @returns Array of key terms
 */
function extractKeyTerms(text: string): string[] {
  const words = text.toLowerCase().match(/\b[a-zA-Z]{4,}\b/g) || [];
  return words.filter(w => !COMMON_WORDS.has(w));
}

/**
 * Check learning objective coverage - each objective is checked individually
 *
 * Unlike pooled keyword coverage, this checks that each learning objective
 * from the spec is individually addressed in the content. An objective is
 * considered covered if 50%+ of its key terms are present in the content.
 *
 * @param content - Content to check (markdown string)
 * @param lessonSpec - Lesson specification with learning objectives
 * @returns Filter check result with coverage details
 */
export function checkLearningObjectiveCoverage(
  content: string,
  lessonSpec: LessonSpecificationV2
): FilterCheckResult & {
  objectiveCoverage: number;
  coveredObjectives: number;
  totalObjectives: number;
} {
  const objectives = lessonSpec.learning_objectives;

  // No objectives to check - return perfect score
  if (!objectives || objectives.length === 0) {
    return {
      passed: true,
      actual: '100%',
      scoreContribution: 1.0,
      objectiveCoverage: 1.0,
      coveredObjectives: 0,
      totalObjectives: 0,
    };
  }

  const contentLower = content.toLowerCase();
  let coveredCount = 0;

  for (const objective of objectives) {
    // Extract key terms from objective (words 4+ chars, not common words)
    const keyTerms = extractKeyTerms(objective.objective);

    if (keyTerms.length === 0) {
      // No key terms to check - consider covered
      coveredCount++;
      continue;
    }

    // Check if at least 50% of key terms are present in content
    const matchedTerms = keyTerms.filter(term => contentLower.includes(term.toLowerCase()));
    const coverage = matchedTerms.length / keyTerms.length;

    if (coverage >= 0.5) {
      coveredCount++;
    }
  }

  const objectiveCoverage = coveredCount / objectives.length;
  // Pass threshold: >= 70% of objectives covered
  const passed = objectiveCoverage >= 0.7;
  const scoreContribution = objectiveCoverage;

  const result: FilterCheckResult & {
    objectiveCoverage: number;
    coveredObjectives: number;
    totalObjectives: number;
  } = {
    passed,
    actual: `${(objectiveCoverage * 100).toFixed(0)}%`,
    scoreContribution,
    objectiveCoverage,
    coveredObjectives: coveredCount,
    totalObjectives: objectives.length,
  };

  if (!passed) {
    // Severity: 'major' if < 50%, 'minor' if 50-70%
    const severity = objectiveCoverage < 0.5 ? 'major' : 'minor';
    result.failure = {
      filter: 'learningObjectiveCoverage',
      expected: '70%+',
      actual: `${(objectiveCoverage * 100).toFixed(0)}%`,
      severity,
    };
    result.suggestion = `Low learning objective coverage (${coveredCount}/${objectives.length} objectives). Review the spec and ensure content addresses each learning objective with relevant terms.`;
  }

  return result;
}

// ============================================================================
// LANGUAGE CONSISTENCY CHECK (Self-Review Pre-filter)
// ============================================================================

/**
 * Unicode ranges for script detection
 */
const UNICODE_SCRIPTS = {
  /** Cyrillic script range (Russian, Ukrainian, etc.) */
  CYRILLIC: /[\u0400-\u04FF]/g,
  /** CJK Unified Ideographs (Chinese, Japanese Kanji, Korean Hanja) */
  CJK: /[\u4E00-\u9FFF\u3400-\u4DBF]/g,
  /** Basic Latin letters */
  LATIN: /[a-zA-Z]/g,
  /** Arabic script */
  ARABIC: /[\u0600-\u06FF]/g,
  /** Devanagari (Hindi, Sanskrit) */
  DEVANAGARI: /[\u0900-\u097F]/g,
} as const;

/**
 * Language to unexpected (foreign) scripts mapping
 * These scripts should NEVER appear in content of given language
 */
const LANGUAGE_UNEXPECTED_SCRIPTS: Record<string, (keyof typeof UNICODE_SCRIPTS)[]> = {
  ru: ['CJK', 'ARABIC', 'DEVANAGARI'], // Chinese in Russian is always wrong
  en: ['CJK', 'CYRILLIC', 'ARABIC', 'DEVANAGARI'], // Non-Latin in English
  zh: ['CYRILLIC', 'ARABIC', 'DEVANAGARI'], // Non-CJK in Chinese
};

/**
 * Scripts that require ZERO tolerance (any occurrence is a failure)
 * These are completely incompatible scripts that never appear legitimately
 */
export const ZERO_TOLERANCE_SCRIPTS: Set<string> = new Set([
  'CJK', // Chinese/Japanese/Korean ideographs
  'ARABIC', // Arabic script
  'DEVANAGARI', // Hindi/Sanskrit script
]);

/**
 * Extract text content from markdown, excluding code blocks
 * Code blocks can legitimately contain any characters
 */
function extractProseText(content: string): string {
  // Remove code blocks (``` ... ```)
  const withoutCodeBlocks = content.replace(/```[\s\S]*?```/g, '');
  // Remove inline code (`...`)
  const withoutInlineCode = withoutCodeBlocks.replace(/`[^`]+`/g, '');
  return withoutInlineCode;
}

/**
 * Check language consistency using Unicode script detection
 *
 * Detects unexpected script mixing:
 * - Chinese characters in Russian text
 * - Cyrillic in English text
 * - etc.
 *
 * IMPORTANT: Code blocks are EXCLUDED from checks (technical terms are valid)
 *
 * @param content - Lesson content (markdown string)
 * @param expectedLanguage - Expected language code (ru, en, zh, etc.)
 * @returns Filter check result with foreign character details
 */
export function checkLanguageConsistency(
  content: string,
  expectedLanguage: string
): FilterCheckResult & {
  foreignCharacters: number;
  foreignSamples: string[];
  scriptsFound: string[];
} {
  // Extract prose text (exclude code blocks)
  const proseText = extractProseText(content);

  // Get unexpected scripts for this language
  const unexpectedScriptKeys = LANGUAGE_UNEXPECTED_SCRIPTS[expectedLanguage] || [];

  let totalForeignCount = 0;
  const allSamples: string[] = [];
  const scriptsFound: string[] = [];

  for (const scriptKey of unexpectedScriptKeys) {
    const pattern = UNICODE_SCRIPTS[scriptKey];
    const matches = proseText.match(pattern) || [];

    if (matches.length > 0) {
      totalForeignCount += matches.length;
      scriptsFound.push(scriptKey);
      // Collect unique samples (up to 3 per script)
      const uniqueSamples = [...new Set(matches)].slice(0, 3);
      allSamples.push(...uniqueSamples);
    }
  }

  /** Threshold for minor language issues (>5 chars = failed check) */
  const MINOR_LANGUAGE_THRESHOLD = 5;
  /** Divisor for language score contribution calculation */
  const LANGUAGE_SCORE_DIVISOR = 20;

  // Check if any zero-tolerance scripts were found
  // CJK, Arabic, Devanagari should NEVER appear in incompatible languages
  const hasZeroToleranceViolation = scriptsFound.some(script => ZERO_TOLERANCE_SCRIPTS.has(script));

  // For zero-tolerance scripts: ANY occurrence is a failure
  // For other scripts (e.g., Latin in Russian): allow up to 5 chars as typos
  const passed = hasZeroToleranceViolation
    ? totalForeignCount === 0
    : totalForeignCount <= MINOR_LANGUAGE_THRESHOLD;

  // Score contribution: 1.0 if clean, reduces based on foreign count
  const scoreContribution =
    totalForeignCount === 0 ? 1.0 : Math.max(0, 1 - totalForeignCount / LANGUAGE_SCORE_DIVISOR);

  const result: FilterCheckResult & {
    foreignCharacters: number;
    foreignSamples: string[];
    scriptsFound: string[];
  } = {
    passed,
    actual: totalForeignCount,
    scoreContribution,
    foreignCharacters: totalForeignCount,
    foreignSamples: allSamples.slice(0, 5),
    scriptsFound,
  };

  if (!passed) {
    result.failure = {
      filter: 'languageConsistency',
      expected: `No unexpected ${scriptsFound.join('/')} characters`,
      actual: `${totalForeignCount} foreign characters found`,
      severity: hasZeroToleranceViolation || totalForeignCount > 20 ? 'critical' : 'major',
    };
    result.suggestion = `Content contains ${totalForeignCount} unexpected characters from ${scriptsFound.join(', ')} script(s). Examples: "${allSamples.slice(0, 3).join('", "')}". Remove or replace these characters.`;
  }

  return result;
}
