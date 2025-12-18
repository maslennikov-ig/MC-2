/**
 * Heuristic Pre-filters for Stage 6 Judge System
 * @module stages/stage6-lesson-content/judge/heuristic-filter
 *
 * Provides fast, FREE pre-filtering before expensive LLM evaluation.
 * Filters 30-50% of content instantly using:
 * - Length checks (min/max word count)
 * - Flesch-Kincaid readability (target grade level)
 * - Keyword coverage (required terms present)
 * - Section headers (intro, conclusion, etc.)
 * - Content density per section
 *
 * This is Stage 1 of the cascading evaluation approach:
 * 1. Heuristic pre-filters (FREE) - filters 30-50% instantly
 * 2. Single cheap judge (50-70% of content passing Stage 1)
 * 3. CLEV voting (15-20% of content with low confidence)
 *
 * Reference:
 * - docs/research/010-stage6-generation-strategy/ (cascade research)
 * - specs/010-stages-456-pipeline/data-model.md
 */

import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { logger } from '@/shared/logger';
import {
  validateMarkdownStructure,
  applyMarkdownAutoFixes,
} from './markdown-structure-filter';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for heuristic pre-filters
 * All thresholds are configurable for different content types
 */
export interface HeuristicFilterConfig {
  /** Word count constraints */
  wordCount: {
    /** Minimum word count (default: 500) */
    min: number;
    /** Maximum word count (default: 10000) */
    max: number;
  };

  /** Flesch-Kincaid readability constraints */
  fleschKincaid: {
    /** Minimum Flesch-Kincaid grade level (default: 6) */
    min: number;
    /** Maximum Flesch-Kincaid grade level (default: 14) */
    max: number;
    /** Target Flesch-Kincaid grade level (default: 10) */
    target: number;
  };

  /** Required section headers that must be present */
  requiredSections: string[];

  /** Minimum keyword coverage ratio (0-1, default: 0.5) */
  keywordCoverageThreshold: number;

  /** Minimum words per section average (default: 100) */
  contentDensityThreshold: number;
}

/**
 * Individual filter failure detail
 */
export interface FilterFailure {
  /** Name of the filter that failed */
  filter: string;
  /** Expected value or range */
  expected: string | number | { min: number; max: number };
  /** Actual value found */
  actual: string | number;
  /** Severity of the failure */
  severity: 'critical' | 'major' | 'minor';
}

/**
 * Result from running all heuristic filters
 */
export interface HeuristicFilterResult {
  /** Whether content passed all filters */
  passed: boolean;
  /** Estimated quality score (0-1) based on heuristics */
  score: number;
  /** List of filter failures */
  failures: FilterFailure[];
  /** Suggestions for improvement */
  suggestions: string[];
  /** Detailed metrics from each filter */
  metrics: {
    /** Actual word count */
    wordCount: number;
    /** Calculated Flesch-Kincaid grade level */
    fleschKincaidGrade: number;
    /** Flesch Reading Ease score (0-100) */
    fleschReadingEase: number;
    /** List of found section headers */
    foundSections: string[];
    /** List of missing required sections */
    missingSections: string[];
    /** Keyword coverage ratio (0-1) */
    keywordCoverage: number;
    /** Average words per section */
    contentDensity: number;
    /** Total number of sections */
    sectionCount: number;
    /** Sentence count */
    sentenceCount: number;
    /** Average sentence length */
    avgSentenceLength: number;
    /** Markdown structure validation results */
    markdownStructure?: {
      score: number;
      totalIssues: number;
      criticalIssues: number;
      majorIssues: number;
      minorIssues: number;
      autoFixedRules: string[];
    };
    /** Learning objective coverage ratio (0-1) */
    learningObjectiveCoverage: number;
    /** Number of learning objectives covered (50%+ key terms matched) */
    coveredObjectives: number;
    /** Total number of learning objectives in spec */
    totalObjectives: number;
    /** List of prohibited terms found in content */
    prohibitedTermsViolations: string[];
  };
  /** Duration of heuristic check in milliseconds */
  durationMs: number;
}

/**
 * Result from individual filter check
 */
interface FilterCheckResult {
  passed: boolean;
  actual: string | number;
  failure?: FilterFailure;
  suggestion?: string;
  /** Contribution to overall score (0-1) */
  scoreContribution: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default heuristic filter configuration
 * Tuned for educational lesson content
 */
export const DEFAULT_HEURISTIC_CONFIG: HeuristicFilterConfig = {
  wordCount: {
    min: 500,
    max: 10000,
  },
  fleschKincaid: {
    min: 6, // At least 6th grade level
    max: 14, // No higher than college freshman
    target: 10, // Target 10th grade level
  },
  requiredSections: ['introduction', 'conclusion'],
  keywordCoverageThreshold: 0.5, // 50% of keywords must be present
  contentDensityThreshold: 100, // At least 100 words per section
};

/**
 * Weights for calculating overall heuristic score
 * Total must sum to 1.0
 */
const FILTER_WEIGHTS = {
  wordCount: 0.12,                   // -0.03
  fleschKincaid: 0.18,               // -0.02
  sections: 0.12,                    // -0.03
  keywordCoverage: 0.13,             // -0.02
  contentDensity: 0.08,              // -0.02
  markdownStructure: 0.22,           // -0.03
  learningObjectiveCoverage: 0.10,   // NEW
  prohibitedTerms: 0.05,             // NEW
} as const;

// ============================================================================
// SYLLABLE AND READABILITY CALCULATIONS
// ============================================================================

/**
 * Count syllables in a word using vowel group approximation
 *
 * Algorithm:
 * 1. Count vowel groups (a, e, i, o, u, y)
 * 2. Subtract 1 for silent 'e' at end
 * 3. Handle common suffixes
 * 4. Minimum 1 syllable per word
 *
 * @param word - Word to count syllables for
 * @returns Estimated syllable count
 */
export function countSyllables(word: string): number {
  const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');

  if (cleanWord.length === 0) return 0;
  if (cleanWord.length <= 3) return 1;

  // Count vowel groups
  const vowelGroups = cleanWord.match(/[aeiouy]+/g) || [];
  let count = vowelGroups.length;

  // Subtract for silent 'e' at end
  if (cleanWord.endsWith('e') && !cleanWord.endsWith('le')) {
    count = Math.max(1, count - 1);
  }

  // Handle common suffixes that don't add syllables
  if (cleanWord.endsWith('es') || cleanWord.endsWith('ed')) {
    const beforeSuffix = cleanWord.slice(0, -2);
    if (!beforeSuffix.match(/[aeiouy]$/)) {
      count = Math.max(1, count - 1);
    }
  }

  return Math.max(1, count);
}

/**
 * Calculate Flesch-Kincaid Grade Level
 *
 * Formula: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
 *
 * Result interpretation:
 * - 5-6: Elementary school
 * - 7-8: Middle school
 * - 9-12: High school
 * - 13-16: College level
 * - 17+: Graduate level
 *
 * @param text - Text content to analyze
 * @returns Flesch-Kincaid grade level
 */
export function calculateFleschKincaidGrade(text: string): number {
  // Split into sentences
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const sentenceCount = Math.max(1, sentences.length);

  // Split into words
  const words = text.match(/\b[a-zA-Z]+\b/g) || [];
  const wordCount = Math.max(1, words.length);

  // Count total syllables
  const syllableCount = words.reduce((sum, word) => sum + countSyllables(word), 0);

  // Calculate Flesch-Kincaid Grade Level
  const gradeLevel =
    0.39 * (wordCount / sentenceCount) + 11.8 * (syllableCount / wordCount) - 15.59;

  // Clamp to reasonable range
  return Math.max(1, Math.min(20, gradeLevel));
}

/**
 * Calculate Flesch Reading Ease score
 *
 * Formula: 206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)
 *
 * Result interpretation:
 * - 90-100: Very easy (5th grade)
 * - 60-70: Standard (8th-9th grade)
 * - 30-50: Difficult (college level)
 * - 0-30: Very difficult (graduate level)
 *
 * @param text - Text content to analyze
 * @returns Flesch Reading Ease score (0-100)
 */
export function calculateFleschReadingEase(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const sentenceCount = Math.max(1, sentences.length);

  const words = text.match(/\b[a-zA-Z]+\b/g) || [];
  const wordCount = Math.max(1, words.length);

  const syllableCount = words.reduce((sum, word) => sum + countSyllables(word), 0);

  const fleschScore =
    206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllableCount / wordCount);

  return Math.max(0, Math.min(100, fleschScore));
}

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

  const passed = wordCount >= config.min && wordCount <= config.max;

  // Calculate score contribution (1.0 if in range, scaled otherwise)
  let scoreContribution = 1.0;
  if (wordCount < config.min) {
    scoreContribution = wordCount / config.min;
  } else if (wordCount > config.max) {
    scoreContribution = Math.max(0, 1 - (wordCount - config.max) / config.max);
  }

  const result: FilterCheckResult = {
    passed,
    actual: wordCount,
    scoreContribution,
  };

  if (!passed) {
    result.failure = {
      filter: 'wordCount',
      expected: { min: config.min, max: config.max },
      actual: wordCount,
      severity: wordCount < config.min * 0.5 || wordCount > config.max * 1.5 ? 'critical' : 'major',
    };
    result.suggestion =
      wordCount < config.min
        ? `Content is too short (${wordCount} words). Add more detail, examples, or expand explanations to reach at least ${config.min} words.`
        : `Content is too long (${wordCount} words). Consider splitting into multiple lessons or reducing redundancy to stay under ${config.max} words.`;
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
  const headers = headerMatches.map((h) => h.replace(/^#+\s+/, '').toLowerCase());

  const foundSections: string[] = [];
  const missingSections: string[] = [];

  for (const required of requiredSections) {
    const requiredLower = required.toLowerCase();
    // Check if the required section is in headers OR mentioned in content
    const found =
      headers.some((header) => header.includes(requiredLower)) ||
      contentLower.includes(requiredLower);

    if (found) {
      foundSections.push(required);
    } else {
      missingSections.push(required);
    }
  }

  const passed = missingSections.length === 0;
  const scoreContribution = requiredSections.length > 0 ? foundSections.length / requiredSections.length : 1.0;

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
  const sections = content.split(/^#+\s+/m).filter((s) => s.trim().length > 0);
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

// ============================================================================
// LEARNING OBJECTIVE COVERAGE
// ============================================================================

/**
 * Common words to exclude when extracting key terms
 */
const COMMON_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'will',
  'been', 'would', 'could', 'should', 'into', 'about', 'more', 'when',
  'than', 'also', 'only', 'their', 'which', 'each', 'other', 'being',
  'able', 'after', 'before', 'must', 'need', 'such', 'what', 'both',
]);

/**
 * Extract key terms from text (words 4+ chars, not common words)
 *
 * @param text - Text to extract terms from
 * @returns Array of key terms
 */
function extractKeyTerms(text: string): string[] {
  const words = text.toLowerCase().match(/\b[a-zA-Z]{4,}\b/g) || [];
  return words.filter((w) => !COMMON_WORDS.has(w));
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
    const matchedTerms = keyTerms.filter((term) =>
      contentLower.includes(term.toLowerCase())
    );
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
// PROHIBITED TERMS CHECK
// ============================================================================

/**
 * Check for prohibited terms from section constraints
 *
 * Checks content for terms specified in section.constraints.prohibited_terms.
 * Returns 1.0 if no violations, reduces by 0.2 per violation (max 5 = 0 score).
 *
 * @param content - Content to check (markdown string)
 * @param lessonSpec - Lesson specification with section constraints
 * @returns Filter check result with violations list
 */
export function checkProhibitedTerms(
  content: string,
  lessonSpec: LessonSpecificationV2
): FilterCheckResult & { violations: string[] } {
  // Collect all prohibited terms from spec sections
  const prohibitedTerms: string[] = [];
  for (const section of lessonSpec.sections) {
    if (section.constraints?.prohibited_terms) {
      prohibitedTerms.push(...section.constraints.prohibited_terms);
    }
  }

  // No prohibited terms defined - perfect score
  if (prohibitedTerms.length === 0) {
    return {
      passed: true,
      actual: 'no violations',
      scoreContribution: 1.0,
      violations: [],
    };
  }

  const contentLower = content.toLowerCase();
  const violations: string[] = [];

  for (const term of prohibitedTerms) {
    if (contentLower.includes(term.toLowerCase())) {
      violations.push(term);
    }
  }

  if (violations.length > 0) {
    logger.debug({
      msg: 'Prohibited terms found in content',
      violations,
      count: violations.length,
    });
  }

  // Each violation reduces score by 20% (max 5 violations = 0 score)
  const scoreContribution = Math.max(0, 1 - violations.length * 0.2);
  const passed = violations.length === 0;

  const result: FilterCheckResult & { violations: string[] } = {
    passed,
    actual: violations.length === 0 ? 'no violations' : `${violations.length} violations`,
    scoreContribution,
    violations,
  };

  if (!passed) {
    result.failure = {
      filter: 'prohibitedTerms',
      expected: '0 violations',
      actual: `${violations.length} violations`,
      severity: 'critical', // Prohibited terms are always critical
    };
    const violationList = violations.slice(0, 5).join(', ');
    const suffix = violations.length > 5 ? ` (+${violations.length - 5} more)` : '';
    result.suggestion = `Content contains prohibited terms: ${violationList}${suffix}. Remove or replace these terms to meet spec constraints.`;
  }

  return result;
}

// ============================================================================
// KEYWORD EXTRACTION
// ============================================================================

/**
 * Extract keywords from learning objectives
 *
 * @param lessonSpec - Lesson specification with learning objectives
 * @returns Array of extracted keywords
 */
export function extractKeywordsFromSpec(lessonSpec: LessonSpecificationV2): string[] {
  const keywords = new Set<string>();
  const commonWords = new Set([
    'the',
    'and',
    'for',
    'that',
    'this',
    'with',
    'from',
    'have',
    'will',
    'able',
    'about',
    'into',
    'more',
    'when',
    'than',
    'also',
    'their',
    'which',
    'each',
    'other',
    'understand',
    'explain',
    'describe',
    'identify',
    'demonstrate',
    'apply',
    'analyze',
    'create',
    'evaluate',
  ]);

  // Extract from learning objectives
  for (const objective of lessonSpec.learning_objectives) {
    const words = objective.objective.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    for (const word of words) {
      if (!commonWords.has(word)) {
        keywords.add(word);
      }
    }
  }

  // Extract from section required keywords
  for (const section of lessonSpec.sections) {
    if (section.constraints?.required_keywords) {
      for (const keyword of section.constraints.required_keywords) {
        keywords.add(keyword.toLowerCase());
      }
    }
  }

  return Array.from(keywords);
}

// ============================================================================
// MAIN HEURISTIC FILTER FUNCTION
// ============================================================================

/**
 * Run all heuristic pre-filters on content
 *
 * Stage 1 of cascade evaluation - filters 30-50% of content instantly.
 * Checks: word count, Flesch-Kincaid, required sections, keywords, content density
 *
 * @param content - Content to evaluate (markdown string)
 * @param lessonSpec - Lesson specification for context (keywords, objectives)
 * @param config - Optional custom configuration
 * @returns Comprehensive filter result with score, failures, and suggestions
 */
export function runHeuristicFilters(
  content: string,
  lessonSpec: LessonSpecificationV2,
  config: Partial<HeuristicFilterConfig> = {}
): HeuristicFilterResult {
  const startTime = Date.now();

  // Merge with defaults
  const finalConfig: HeuristicFilterConfig = {
    ...DEFAULT_HEURISTIC_CONFIG,
    ...config,
    wordCount: { ...DEFAULT_HEURISTIC_CONFIG.wordCount, ...config.wordCount },
    fleschKincaid: { ...DEFAULT_HEURISTIC_CONFIG.fleschKincaid, ...config.fleschKincaid },
  };

  const failures: FilterFailure[] = [];
  const suggestions: string[] = [];
  let weightedScore = 0;

  // Run individual filters
  const wordCountResult = checkWordCount(content, finalConfig.wordCount);
  weightedScore += wordCountResult.scoreContribution * FILTER_WEIGHTS.wordCount;
  if (wordCountResult.failure) failures.push(wordCountResult.failure);
  if (wordCountResult.suggestion) suggestions.push(wordCountResult.suggestion);

  const fleschResult = checkFleschKincaid(content, finalConfig.fleschKincaid);
  weightedScore += fleschResult.scoreContribution * FILTER_WEIGHTS.fleschKincaid;
  if (fleschResult.failure) failures.push(fleschResult.failure);
  if (fleschResult.suggestion) suggestions.push(fleschResult.suggestion);

  const sectionsResult = checkSectionHeaders(content, finalConfig.requiredSections);
  weightedScore += sectionsResult.scoreContribution * FILTER_WEIGHTS.sections;
  if (sectionsResult.failure) failures.push(sectionsResult.failure);
  if (sectionsResult.suggestion) suggestions.push(sectionsResult.suggestion);

  const keywords = extractKeywordsFromSpec(lessonSpec);
  const keywordResult = checkKeywordCoverage(content, keywords);
  weightedScore += keywordResult.scoreContribution * FILTER_WEIGHTS.keywordCoverage;
  if (keywordResult.failure) failures.push(keywordResult.failure);
  if (keywordResult.suggestion) suggestions.push(keywordResult.suggestion);

  const densityResult = checkContentDensity(content, finalConfig.contentDensityThreshold);
  weightedScore += densityResult.scoreContribution * FILTER_WEIGHTS.contentDensity;
  if (densityResult.failure) failures.push(densityResult.failure);
  if (densityResult.suggestion) suggestions.push(densityResult.suggestion);

  // Run markdown structure validation
  const markdownResult = validateMarkdownStructure(content);

  // Apply auto-fixes for cosmetic issues
  const { content: _fixedContent, fixedRules } = applyMarkdownAutoFixes(content);
  markdownResult.autoFixedIssues = fixedRules;

  // Add markdown score contribution
  weightedScore += markdownResult.score * FILTER_WEIGHTS.markdownStructure;

  // Add failures from critical/major markdown issues
  if (markdownResult.issuesBySeverity.critical.length > 0) {
    failures.push({
      filter: 'markdownStructure',
      expected: 'No critical markdown errors',
      actual: `${markdownResult.issuesBySeverity.critical.length} critical errors`,
      severity: 'critical',
    });
  }

  if (markdownResult.issuesBySeverity.major.length > 0) {
    failures.push({
      filter: 'markdownStructure',
      expected: 'No major markdown errors',
      actual: `${markdownResult.issuesBySeverity.major.length} major errors`,
      severity: 'major',
    });
  }

  // Add suggestions for markdown issues
  if (!markdownResult.passed) {
    suggestions.push(
      `Markdown validation failed with ${markdownResult.issues.length} issues. Fix heading hierarchy, add code block languages, and ensure proper formatting.`
    );
  }

  // Run learning objective coverage check
  const objectiveCoverageResult = checkLearningObjectiveCoverage(content, lessonSpec);
  weightedScore += objectiveCoverageResult.scoreContribution * FILTER_WEIGHTS.learningObjectiveCoverage;
  if (objectiveCoverageResult.failure) failures.push(objectiveCoverageResult.failure);
  if (objectiveCoverageResult.suggestion) suggestions.push(objectiveCoverageResult.suggestion);

  // Run prohibited terms check
  const prohibitedTermsResult = checkProhibitedTerms(content, lessonSpec);
  weightedScore += prohibitedTermsResult.scoreContribution * FILTER_WEIGHTS.prohibitedTerms;
  if (prohibitedTermsResult.failure) failures.push(prohibitedTermsResult.failure);
  if (prohibitedTermsResult.suggestion) suggestions.push(prohibitedTermsResult.suggestion);

  // Calculate sentence stats
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = content.match(/\b[a-zA-Z]+\b/g) || [];
  const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : 0;

  const passed = failures.filter((f) => f.severity === 'critical' || f.severity === 'major').length === 0;
  const durationMs = Date.now() - startTime;

  logger.info({
    msg: 'Heuristic pre-filter complete',
    lessonId: lessonSpec.lesson_id,
    passed,
    score: weightedScore.toFixed(3),
    failureCount: failures.length,
    criticalFailures: failures.filter((f) => f.severity === 'critical').length,
    durationMs,
  });

  return {
    passed,
    score: weightedScore,
    failures,
    suggestions,
    metrics: {
      wordCount: typeof wordCountResult.actual === 'number' ? wordCountResult.actual : 0,
      fleschKincaidGrade: fleschResult.gradeLevel,
      fleschReadingEase: fleschResult.readingEase,
      foundSections: sectionsResult.foundSections,
      missingSections: sectionsResult.missingSections,
      keywordCoverage: keywordResult.coverage,
      contentDensity: densityResult.avgWordsPerSection,
      sectionCount: densityResult.sectionCount,
      sentenceCount: sentences.length,
      avgSentenceLength,
      markdownStructure: {
        score: markdownResult.score,
        totalIssues: markdownResult.issues.length,
        criticalIssues: markdownResult.issuesBySeverity.critical.length,
        majorIssues: markdownResult.issuesBySeverity.major.length,
        minorIssues: markdownResult.issuesBySeverity.minor.length,
        autoFixedRules: markdownResult.autoFixedIssues,
      },
      learningObjectiveCoverage: objectiveCoverageResult.objectiveCoverage,
      coveredObjectives: objectiveCoverageResult.coveredObjectives,
      totalObjectives: objectiveCoverageResult.totalObjectives,
      prohibitedTermsViolations: prohibitedTermsResult.violations,
    },
    durationMs,
  };
}
