/**
 * Heuristic pre-filters for Stage 6 Judge System
 * @module stages/stage6-lesson-content/judge/filters
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

// Re-export types and constants
export type {
  HeuristicFilterConfig,
  FilterFailure,
  HeuristicFilterResult,
  FilterCheckResult,
} from './types';
export { DEFAULT_HEURISTIC_CONFIG, FILTER_WEIGHTS } from './types';

// Re-export text metrics
export {
  countSyllables,
  calculateFleschKincaidGrade,
  calculateFleschReadingEase,
} from './text-metrics';

// Re-export basic checks
export {
  checkWordCount,
  checkFleschKincaid,
  checkSectionHeaders,
  checkKeywordCoverage,
  checkContentDensity,
} from './basic-checks';

// Re-export content quality checks
export { checkLearningObjectiveCoverage, checkLanguageConsistency } from './content-quality';

// Re-export structural checks
export { checkContentTruncation, checkMermaidSyntax } from './structural-checks';

// Re-export prohibited content checks
export { checkProhibitedTerms, checkPromptMarkers } from './prohibited-content';

// Re-export duplication checks
export { checkSectionDuplication } from './duplication-checks';

// Re-export orchestrator functions
export { extractKeywordsFromSpec, runHeuristicFilters } from './orchestrator';
