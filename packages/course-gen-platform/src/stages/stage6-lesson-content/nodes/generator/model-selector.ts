/**
 * Stage 6 Model Tier Selection
 * @module stages/stage6-lesson-content/nodes/generator/model-selector
 *
 * Implements 3-tier model routing for Stage 6 lesson generation based on difficulty_level.
 * Mirrors the Stage 5 importance-based routing pattern but uses lesson difficulty instead.
 *
 * Tier Mapping:
 * - simple: beginner difficulty → xiaomi/mimo-v2-flash
 * - normal: intermediate difficulty → moonshotai/kimi-k2-thinking
 * - complex: advanced difficulty + module 1 → qwen/qwen3.5-plus-02-15
 *
 * First Module Rule: All lessons in module 1 (lesson_id starts with "1.") always use complex tier
 * for best first impression quality.
 */

import { createModelConfigService } from '@/shared/llm/model-config-service';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { PhaseName } from '@megacampus/shared-types/model-config';
import { STAGE6_TIER_MODELS, STAGE6_TIER_FALLBACKS } from './generator-constants';
import { logger } from '@/shared/logger';

export interface Stage6ModelTier {
  model: string;
  fallback: string;
  tier: 'simple' | 'normal' | 'complex';
  reason: string;
}

/**
 * Select model tier for Stage 6 lesson generation based on difficulty_level.
 *
 * Mapping:
 * - beginner → simple → xiaomi/mimo-v2-flash
 * - intermediate → normal → moonshotai/kimi-k2-thinking
 * - advanced → complex → qwen/qwen3.5-plus-02-15
 *
 * First module rule: All lessons in module 1 (lesson_id starts with "1.") always use complex tier.
 *
 * @param lessonSpec - Lesson specification from Stage 5
 * @returns Model tier with selected primary + fallback model IDs and reasoning
 */
export async function selectStage6ModelTier(
  lessonSpec: LessonSpecificationV2
): Promise<Stage6ModelTier> {
  const difficultyLevel = lessonSpec.difficulty_level || 'intermediate';
  const moduleNumber = lessonSpec.lesson_id?.split('.')[0] || '';
  const isFirstModule = moduleNumber === '1';

  let targetTier: 'simple' | 'normal' | 'complex';
  let tierReason: string;

  if (isFirstModule) {
    targetTier = 'complex';
    tierReason = `Module 1 always uses premium model for best first impression`;
  } else if (difficultyLevel === 'advanced') {
    targetTier = 'complex';
    tierReason = `Difficulty=${difficultyLevel} (advanced material)`;
  } else if (difficultyLevel === 'beginner') {
    targetTier = 'simple';
    tierReason = `Difficulty=${difficultyLevel} (basic content)`;
  } else {
    targetTier = 'normal';
    tierReason = `Difficulty=${difficultyLevel} (standard content)`;
  }

  const phaseName = `stage_6_${targetTier}` as PhaseName;

  try {
    const modelConfigService = createModelConfigService();
    const config = await modelConfigService.getModelForPhase(phaseName);
    const modelId = config.modelId || STAGE6_TIER_MODELS[targetTier];
    const fallbackId = config.fallbackModelId || STAGE6_TIER_FALLBACKS[targetTier];

    logger.info({
      msg: `Stage 6 model tier selection: ${targetTier}`,
      tier: targetTier,
      phase: phaseName,
      modelId,
      fallbackId,
      source: config.source,
      lessonId: lessonSpec.lesson_id,
      difficultyLevel,
      isFirstModule,
    });

    return {
      model: modelId,
      fallback: fallbackId,
      tier: targetTier,
      reason: `${tierReason} → ${modelId} (from ${config.source})`,
    };
  } catch (error) {
    logger.warn({
      msg: `getModelForPhase failed for ${phaseName}, using hardcoded fallback`,
      tier: targetTier,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      model: STAGE6_TIER_MODELS[targetTier],
      fallback: STAGE6_TIER_FALLBACKS[targetTier],
      tier: targetTier,
      reason: `${tierReason} → ${STAGE6_TIER_MODELS[targetTier]} (hardcoded fallback)`,
    };
  }
}
