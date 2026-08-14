import type { Section } from '@megacampus/shared-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { PhaseReasoningConfig } from '@/shared/llm/model-config-db';

/**
 * Model tier selection result.
 *
 * Carries the whole resolved phase configuration, not just the model id. The
 * tier lookup already reads `temperature`, `maxTokens` and `reasoning` out of
 * `llm_model_config`; returning only `model` left the generator applying its
 * own hardcoded 0.7/30000 to every tier, so `stage_5_normal`'s configured 8000
 * never reached a request and the pipeline-admin screen showed numbers the
 * provider never saw.
 */
export interface ModelTier {
  model: string;
  tier: 'simple' | 'normal' | 'complex' | 'tier3_gemini';
  reason: string;
  temperature: number;
  maxTokens: number;
  reasoning?: PhaseReasoningConfig;
}

/**
 * Section batch generation result
 */
export interface SectionBatchResult {
  sections: Section[];
  modelUsed: string;
  tier: string;
  tokensUsed: number;
  retryCount: number;
  /** Regeneration metrics from UnifiedRegenerator (RT-005) */
  regenerationMetrics?: {
    layerUsed: string;
    repairSuccessRate: number;
    tokensSaved: number;
    qualityPassed: boolean;
  };
}

/**
 * Section batch generation result with V2 LessonSpecification output
 *
 * Used for Stage 6 lesson content generation with Semantic Scaffolding.
 * Converts Section[] output to LessonSpecificationV2[] for compatibility
 * with the new generation pipeline.
 *
 * @see specs/010-stages-456-pipeline/data-model.md
 */
export interface SectionBatchResultV2 {
  lessonSpecs: LessonSpecificationV2[];
  modelUsed: string;
  tier: string;
  tokensUsed: number;
  retryCount: number;
  /** Regeneration metrics from UnifiedRegenerator (RT-005) */
  regenerationMetrics?: {
    layerUsed: string;
    repairSuccessRate: number;
    tokensSaved: number;
    qualityPassed: boolean;
  };
}
