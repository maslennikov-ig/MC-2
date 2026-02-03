/**
 * Intent Classification Module
 *
 * Provides intent classification and target resolution for chat optimization.
 *
 * @module intent
 */

// Classifier exports
export {
  classifyIntent,
  isDirectExecutionIntent,
  isLLMRequiredIntent,
  IntentSchema,
  DIRECT_EXECUTION_INTENTS,
  LLM_REQUIRED_INTENTS,
  type ClassifiedIntent,
  type DirectExecutionIntent,
  type LLMRequiredIntent,
  type NodeContextForClassification,
} from './classifier';

// Target resolver exports
export {
  resolveTargetPath,
  resolveTargetPathWithMatches,
  getElementAtPath,
  isLessonPath,
  isSectionPath,
  parsePathIndices,
  generateCourseOutline,
  type TargetMatch,
} from './target-resolver';
