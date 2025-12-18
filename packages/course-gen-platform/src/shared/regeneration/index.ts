/**
 * Unified Regeneration System - Public API
 *
 * Production Implementation: Complete 5-layer JSON regeneration system
 * extracted from Analyze stage and made reusable for all stages.
 *
 * All layers implemented:
 * - Layer 1: Auto-repair (jsonrepair + field-name-fix, 95-98% success, FREE)
 * - Layer 2: Critique-revise (LLM-based feedback, refactored from revision-chain.ts)
 * - Layer 3: Partial regeneration (field-level atomic repair, refactored from partial-regenerator.ts)
 * - Layer 4: Model escalation (20B → 120B, extracted from phase-2-scope.ts)
 * - Layer 5: Emergency fallback (Gemini, extracted from phase-2-scope.ts)
 *
 * Quality validation hooks and metrics tracking included.
 *
 * @module shared/regeneration
 * @see .tmp/current/plans/.a31-production-implementation-requirements.md
 *
 * @example
 * ```typescript
 * import { UnifiedRegenerator, createQualityValidator } from '@/shared/regeneration';
 *
 * // Analyze stage: All 5 layers
 * const regenerator = new UnifiedRegenerator({
 *   enabledLayers: ['auto-repair', 'critique-revise', 'partial-regen', 'model-escalation', 'emergency'],
 *   maxRetries: 2,
 *   schema: Phase2OutputSchema,
 *   model: model,
 *   qualityValidator: createQualityValidator({ completeness: 0.85 }),
 *   metricsTracking: true,
 *   stage: 'analyze',
 *   courseId: 'uuid',
 *   phaseId: 'stage_4_scope',
 * });
 *
 * const result = await regenerator.regenerate({
 *   rawOutput: malformedJSON,
 *   originalPrompt: prompt,
 *   parseError: error.message,
 * });
 *
 * console.log(result.metadata.layerUsed); // Which layer succeeded
 * console.log(result.metadata.modelsUsed); // Models tried
 * ```
 */

export {
  UnifiedRegenerator,
  createQualityValidator,
  type RegenerationConfig,
  type RegenerationInput,
  type RegenerationResult,
  type RegenerationMetadata,
  type RegenerationLayer,
  type RegenerationStage,
  type QualityValidator,
} from './unified-regenerator';

// Re-export layer functions for direct use
export { critiqueAndRevise, type CritiqueReviseResult } from './layers/layer-2-critique-revise';
export {
  regeneratePartialFields,
  type PartialRegenerationResult,
} from './layers/layer-3-partial-regen';
export {
  escalateToLargerModel,
  getEscalationChain,
  type ModelEscalationResult,
} from './layers/layer-4-model-escalation';
export {
  qualityFallback,
  shouldAttemptQualityFallback,
  type QualityFallbackResult,
} from './layers/layer-5-emergency';

// Re-export Bloom's Taxonomy validator
export {
  detectBloomLevel,
  validateBloomPreservation,
  getBloomLevelValue,
  compareBloomLevels,
  type BloomLevel,
  type BloomValidationResult,
  type BloomDetectionResult,
  type BloomValidationConfig,
} from './bloom-validator';

// Re-export semantic diff generator
export {
  generateSemanticDiff,
  type SemanticDiffInput,
} from './semantic-diff-generator';

// Re-export smart context router
export {
  detectContextTier,
  getTokenBudget,
} from './smart-context-router';

// Re-export context assembler
export {
  assembleContext,
  assembleStaticContext,
  assembleDynamicContext,
  getFieldValue,
  buildContextString,
  estimateTokens,
  type AssemblerInput,
  type AssembledContext,
  type StaticContext,
  type DynamicContext,
} from './context-assembler';

// Re-export shared utilities for backwards compatibility
export { safeJSONParse, extractJSON } from '@/shared/utils/json-repair';
export { fixFieldNames, fixFieldNamesWithLogging } from '@/shared/utils/field-name-fix';

// Re-export dependency graph builder (T044)
export {
  buildDependencyGraphWithAnalysis,
  type DependencyGraphExtended,
} from './dependency-graph-builder';
