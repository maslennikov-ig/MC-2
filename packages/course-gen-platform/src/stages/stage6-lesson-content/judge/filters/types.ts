/**
 * Types and constants for heuristic pre-filters
 * @module stages/stage6-lesson-content/judge/filters/types
 */

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
    /** List of prompt template markers found in content (LLM hallucination) */
    promptMarkersFound: string[];
    /** Language consistency check results */
    languageConsistency?: {
      foreignCharacters: number;
      foreignSamples: string[];
      scriptsFound: string[];
    };
    /** Mermaid syntax check results */
    mermaidSyntax?: {
      mermaidIssues: string[];
      affectedDiagrams: number;
      totalDiagrams: number;
    };
    /** Section duplication check results */
    sectionDuplication?: {
      duplicatePairs: Array<{ title1: string; title2: string; similarity: number }>;
      totalSections: number;
    };
  };
  /** Duration of heuristic check in milliseconds */
  durationMs: number;
}

/**
 * Result from individual filter check
 */
export interface FilterCheckResult {
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
export const FILTER_WEIGHTS = {
  wordCount: 0.07, // basic length check
  fleschKincaid: 0.08, // readability (English only)
  sections: 0.07, // structure check
  keywordCoverage: 0.07, // topic coverage
  contentDensity: 0.05, // section depth
  markdownStructure: 0.1, // formatting
  learningObjectiveCoverage: 0.07, // spec alignment
  prohibitedTerms: 0.05, // term compliance
  promptMarkers: 0.15, // CRITICAL: LLM hallucination detection
  languageConsistency: 0.12, // CRITICAL: CJK in Russian detection
  mermaidSyntax: 0.08, // HIGH: diagram validity
  sectionDuplication: 0.09, // HIGH: duplicate section detection
} as const;
