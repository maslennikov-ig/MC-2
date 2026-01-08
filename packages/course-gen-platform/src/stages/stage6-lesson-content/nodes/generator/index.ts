/**
 * Generator Module Re-exports
 * @module stages/stage6-lesson-content/nodes/generator
 *
 * Centralized exports for the generator node components.
 */

// Constants and Configuration
export {
  DEPTH_TOKEN_LIMITS,
  DEPTH_SCALE_FACTORS,
  DEPTH_PROMPT_GUIDANCE,
  VALID_DEPTHS,
  CONTEXT_WINDOW_CHARS,
  DYNAMIC_CONTEXT_BASE_CHARS,
  DYNAMIC_CONTEXT_CHARS_PER_MINUTE,
  DYNAMIC_CONTEXT_MAX_CHARS,
  DYNAMIC_CONTEXT_MIN_DURATION,
  calculateDynamicContextWindow,
} from './generator-constants';

// Helper Functions
export {
  formatKeyPointsList,
  estimateTokensFromText,
  extractTokenUsage,
  extractTokenUsageWithFallback,
  formatInterLessonContextXML,
  extractContextWindow,
  calculateMaxTokensForSection,
} from './generator-helpers';

// Content Generation (Intro/Summary)
export {
  generateIntroduction,
  generateSummary,
} from './generator-content';

// Section Generation
export {
  generateSection,
} from './generator-section';
