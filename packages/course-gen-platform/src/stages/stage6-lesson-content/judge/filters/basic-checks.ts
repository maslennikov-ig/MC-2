/**
 * Basic content quality checks
 * @module stages/stage6-lesson-content/judge/filters/basic-checks
 */

import type { HeuristicFilterConfig, FilterCheckResult } from './types';
import { calculateFleschKincaidGrade, calculateFleschReadingEase } from './text-metrics';

// ============================================================================
// INDIVIDUAL FILTER FUNCTIONS
// ============================================================================

/**
 * Check word count is within acceptable range
 *
 * @param content - Content to check
 * @param config - Word count configuration
 * @returns Filter check result
 */
export function checkWordCount(
  content: string,
  config: HeuristicFilterConfig['wordCount']
): FilterCheckResult {
  const words = content.match(/\b[a-zA-Z]+\b/g) || [];
  const wordCount = words.length;

  // IMPORTANT: Only content BELOW min is a blocking failure
  // Content exceeding max is just a warning (non-blocking)
  const passedMin = wordCount >= config.min;
  const passedMax = wordCount <= config.max;
  const passed = passedMin; // Only min check determines pass/fail

  // Calculate score contribution (1.0 if in range, scaled otherwise)
  let scoreContribution = 1.0;
  if (wordCount < config.min) {
    scoreContribution = wordCount / config.min;
  } else if (wordCount > config.max) {
    // Exceeding max: reduce score slightly but not critically
    // 150% of max = 0.9 score, 200% of max = 0.8 score, etc.
    scoreContribution = Math.max(0.7, 1 - (wordCount - config.max) / (config.max * 2));
  }

  const result: FilterCheckResult = {
    passed,
    actual: wordCount,
    scoreContribution,
  };

  // Only add failure if BELOW minimum (requires regeneration)
  if (!passedMin) {
    result.failure = {
      filter: 'wordCount',
      expected: { min: config.min, max: config.max },
      actual: wordCount,
      // Severity based on how far below minimum
      severity: wordCount < config.min * 0.5 ? 'critical' : 'major',
    };
    result.suggestion = `Content is too short (${wordCount} words). Add more detail, examples, or expand explanations to reach at least ${config.min} words.`;
  } else if (!passedMax) {
    // Exceeding max: just a suggestion, not a failure
    result.suggestion = `Content exceeds recommended length (${wordCount} words vs max ${config.max}). Consider condensing if possible, but this is not blocking.`;
  }

  return result;
}

/**
 * Check Flesch-Kincaid readability is within target range
 *
 * @param content - Content to check
 * @param config - Flesch-Kincaid configuration
 * @returns Filter check result with grade level
 */
export function checkFleschKincaid(
  content: string,
  config: HeuristicFilterConfig['fleschKincaid']
): FilterCheckResult & { gradeLevel: number; readingEase: number } {
  const gradeLevel = calculateFleschKincaidGrade(content);
  const readingEase = calculateFleschReadingEase(content);

  const passed = gradeLevel >= config.min && gradeLevel <= config.max;

  // Score based on how close to target (1.0 = exactly target)
  const deviation = Math.abs(gradeLevel - config.target);
  const maxDeviation = Math.max(config.target - config.min, config.max - config.target);
  const scoreContribution = Math.max(0, 1 - deviation / maxDeviation);

  const result: FilterCheckResult & { gradeLevel: number; readingEase: number } = {
    passed,
    actual: gradeLevel,
    gradeLevel,
    readingEase,
    scoreContribution,
  };

  if (!passed) {
    result.failure = {
      filter: 'fleschKincaid',
      expected: { min: config.min, max: config.max },
      actual: Number(gradeLevel.toFixed(1)),
      severity: gradeLevel < config.min - 2 || gradeLevel > config.max + 2 ? 'major' : 'minor',
    };
    result.suggestion =
      gradeLevel < config.min
        ? `Content readability is too simple (grade ${gradeLevel.toFixed(1)}). Use more sophisticated vocabulary and complex sentence structures.`
        : `Content readability is too complex (grade ${gradeLevel.toFixed(1)}). Simplify sentences, break up long paragraphs, and define technical terms.`;
  }

  return result;
}

/**
 * Section header synonyms - alternative terms that satisfy the requirement
 * Supports multilingual content and common variations
 */
const SECTION_SYNONYMS: Record<string, string[]> = {
  conclusion: [
    'summary',
    'заключение',
    'итог',
    'wrap-up',
    'wrap up',
    'key takeaways',
    'key takeaway',
    'closing',
    'резюме',
  ],
  introduction: ['введение', 'вступление', 'intro', 'overview', 'обзор'],
};

/**
 * Check that required section headers are present
 *
 * @param content - Content to check
 * @param requiredSections - List of required section keywords
 * @returns Filter check result with found/missing sections
 */
export function checkSectionHeaders(
  content: string,
  requiredSections: string[]
): FilterCheckResult & { foundSections: string[]; missingSections: string[] } {
  const contentLower = content.toLowerCase();

  // Find all markdown headers
  const headerMatches = content.match(/^#+\s+(.+)$/gm) || [];
  const headers = headerMatches.map(h => h.replace(/^#+\s+/, '').toLowerCase());

  const foundSections: string[] = [];
  const missingSections: string[] = [];

  for (const required of requiredSections) {
    const requiredLower = required.toLowerCase();

    // Get synonyms for this section (if any)
    const synonyms = SECTION_SYNONYMS[requiredLower] || [];
    const allTerms = [requiredLower, ...synonyms];

    // Check if any of the terms (required or synonyms) are found
    const found = allTerms.some(
      term => headers.some(header => header.includes(term)) || contentLower.includes(term)
    );

    if (found) {
      foundSections.push(required);
    } else {
      missingSections.push(required);
    }
  }

  const passed = missingSections.length === 0;
  const scoreContribution =
    requiredSections.length > 0 ? foundSections.length / requiredSections.length : 1.0;

  const result: FilterCheckResult & { foundSections: string[]; missingSections: string[] } = {
    passed,
    actual: `${foundSections.length}/${requiredSections.length}`,
    foundSections,
    missingSections,
    scoreContribution,
  };

  if (!passed) {
    result.failure = {
      filter: 'sectionHeaders',
      expected: requiredSections.join(', '),
      actual: foundSections.join(', ') || 'none',
      severity: missingSections.length > requiredSections.length / 2 ? 'critical' : 'major',
    };
    result.suggestion = `Missing required sections: ${missingSections.join(', ')}. Add these sections to improve content structure.`;
  }

  return result;
}

/**
 * Calculate keyword coverage from learning objectives
 *
 * @param content - Content to check
 * @param keywords - Keywords to look for (extracted from learning objectives)
 * @returns Filter check result with coverage percentage
 */
export function checkKeywordCoverage(
  content: string,
  keywords: string[]
): FilterCheckResult & { coverage: number; foundKeywords: string[]; missingKeywords: string[] } {
  if (keywords.length === 0) {
    return {
      passed: true,
      actual: '100%',
      scoreContribution: 1.0,
      coverage: 1.0,
      foundKeywords: [],
      missingKeywords: [],
    };
  }

  const contentLower = content.toLowerCase();
  const foundKeywords: string[] = [];
  const missingKeywords: string[] = [];

  for (const keyword of keywords) {
    if (contentLower.includes(keyword.toLowerCase())) {
      foundKeywords.push(keyword);
    } else {
      missingKeywords.push(keyword);
    }
  }

  const coverage = foundKeywords.length / keywords.length;
  const passed = coverage >= 0.5; // At least 50% coverage
  const scoreContribution = coverage;

  const result: FilterCheckResult & {
    coverage: number;
    foundKeywords: string[];
    missingKeywords: string[];
  } = {
    passed,
    actual: `${(coverage * 100).toFixed(0)}%`,
    scoreContribution,
    coverage,
    foundKeywords,
    missingKeywords,
  };

  if (!passed) {
    result.failure = {
      filter: 'keywordCoverage',
      expected: '50%+',
      actual: `${(coverage * 100).toFixed(0)}%`,
      severity: coverage < 0.25 ? 'critical' : 'major',
    };
    result.suggestion = `Low keyword coverage (${(coverage * 100).toFixed(0)}%). Missing: ${missingKeywords.slice(0, 5).join(', ')}${missingKeywords.length > 5 ? '...' : ''}`;
  }

  return result;
}

/**
 * Check content density (words per section)
 *
 * @param content - Content to check
 * @param threshold - Minimum words per section
 * @returns Filter check result with density metrics
 */
export function checkContentDensity(
  content: string,
  threshold: number
): FilterCheckResult & { avgWordsPerSection: number; sectionCount: number } {
  // Find all sections (markdown headers)
  const sections = content.split(/^#+\s+/m).filter(s => s.trim().length > 0);
  const sectionCount = Math.max(1, sections.length);

  // Calculate total words and average per section
  const words = content.match(/\b[a-zA-Z]+\b/g) || [];
  const totalWords = words.length;
  const avgWordsPerSection = totalWords / sectionCount;

  const passed = avgWordsPerSection >= threshold;
  const scoreContribution = Math.min(1, avgWordsPerSection / threshold);

  const result: FilterCheckResult & { avgWordsPerSection: number; sectionCount: number } = {
    passed,
    actual: Math.round(avgWordsPerSection),
    scoreContribution,
    avgWordsPerSection,
    sectionCount,
  };

  if (!passed) {
    result.failure = {
      filter: 'contentDensity',
      expected: threshold,
      actual: Math.round(avgWordsPerSection),
      severity: avgWordsPerSection < threshold * 0.5 ? 'major' : 'minor',
    };
    result.suggestion = `Sections are too sparse (avg ${Math.round(avgWordsPerSection)} words). Expand content with more detail, examples, or explanations.`;
  }

  return result;
}
