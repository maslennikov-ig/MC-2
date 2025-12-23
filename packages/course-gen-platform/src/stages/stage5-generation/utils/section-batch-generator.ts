/**
 * Section Batch Generator - Tiered Model Routing for Lesson Generation
 *
 * Implements RT-001 Phase 3 tiered model routing strategy:
 * - Tier 1 (OSS 120B): 70-75% of sections, quality gate ≥0.75, escalate if fails
 * - Tier 2 (qwen3-max): 20-25% of sections, pre-route if complexity ≥0.75 OR criticality ≥0.80
 * - Tier 3 (Gemini 2.5 Flash): 5% overflow, trigger if context >108K tokens
 *
 * Expands section-level structure from Analyze into 3-5 detailed lessons with exercises.
 *
 * @module services/stage5/section-batch-generator
 * @see specs/008-generation-generation-json/research-decisions/rt-001-model-routing.md (Phase 3)
 * @see specs/008-generation-generation-json/research-decisions/rt-002-architecture-balance.md
 */

// Re-export main class
export { SectionBatchGenerator } from './section-batch/section-batch-generator';

// Re-export types for consumers
export type {
  SectionBatchResult,
  SectionBatchResultV2,
  ModelTier
} from './section-batch/types';

// Re-export constants if needed by tests
export {
  MODELS,
  TOKEN_BUDGET,
  QUALITY_THRESHOLDS
} from './section-batch/constants';