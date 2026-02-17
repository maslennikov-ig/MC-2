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

// Re-export everything from filters module
export type {
  HeuristicFilterConfig,
  FilterFailure,
  HeuristicFilterResult,
  FilterCheckResult,
} from './filters/types';

export { DEFAULT_HEURISTIC_CONFIG, FILTER_WEIGHTS } from './filters/types';

export {
  countSyllables,
  calculateFleschKincaidGrade,
  calculateFleschReadingEase,
} from './filters/text-metrics';

export {
  checkWordCount,
  checkFleschKincaid,
  checkSectionHeaders,
  checkKeywordCoverage,
  checkContentDensity,
} from './filters/basic-checks';

export {
  checkLearningObjectiveCoverage,
  checkLanguageConsistency,
  ZERO_TOLERANCE_SCRIPTS,
} from './filters/content-quality';

export { checkContentTruncation, checkMermaidSyntax } from './filters/structural-checks';

export { checkProhibitedTerms, checkPromptMarkers } from './filters/prohibited-content';

export { checkSectionDuplication } from './filters/duplication-checks';

export { extractKeywordsFromSpec, runHeuristicFilters } from './filters/orchestrator';
