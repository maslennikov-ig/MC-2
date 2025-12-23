import type { Section } from '@megacampus/shared-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';

/**
 * Model tier selection result
 */
export interface ModelTier {
  model: string;
  tier: 'tier1_oss120b' | 'tier2_ru_lessons' | 'tier2_en_lessons' | 'fallback_kimi' | 'tier3_gemini';
  reason: string;
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
  complexityScore: number;
  criticalityScore: number;
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
  complexityScore: number;
  criticalityScore: number;
  /** Regeneration metrics from UnifiedRegenerator (RT-005) */
  regenerationMetrics?: {
    layerUsed: string;
    repairSuccessRate: number;
    tokensSaved: number;
    qualityPassed: boolean;
  };
}
