/**
 * Stage 6 Model Tier Selection
 * @module stages/stage6-lesson-content/nodes/generator/model-selector
 *
 * Implements 3-tier model routing for Stage 6 lesson generation based on difficulty_level.
 * Mirrors the Stage 5 importance-based routing pattern but uses lesson difficulty instead.
 *
 * Tier Mapping:
 * - simple: beginner difficulty → `stage_6_simple`
 * - normal: intermediate difficulty → `stage_6_normal`
 * - complex: advanced difficulty + module 1 → `stage_6_complex`
 *
 * The tier picks a PHASE NAME, never a model. Which model answers is
 * `llm_model_config` at runtime, with `STAGE6_TIER_MODELS` only as the offline
 * last resort. This comment named three specific models until 2026-08-23 and had
 * been wrong since the routing shrank on 2026-08-12 (mc2-oofx5); naming them
 * here is how it went stale, so it does not name them now.
 *
 * What the tiers currently differ by is REASONING, not price: all three author
 * the lesson the reader opens, so all three take PROSE_MODEL_ID, and only
 * `stage_6_complex` deliberates. That is the second of the two outcomes
 * mc2-oofx5 asked for — the distinction was chosen rather than allowed to
 * happen by itself.
 *
 * First Module Rule: All lessons in module 1 (lesson_id starts with "1.") always use complex tier
 * for best first impression quality. Stage 5 builds `lesson_id` as
 * `${sectionIdx + 1}.${lessonIdx + 1}`, so the rule fires on the first section.
 */

import {
  createModelConfigService,
  REASONING_DISABLED,
  type PhaseReasoningConfig,
} from '@/shared/llm/model-config-service';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { PhaseName } from '@megacampus/shared-types/model-config';
import { STAGE6_TIER_MODELS, STAGE6_TIER_FALLBACKS } from './generator-constants';
import { logger } from '@/shared/logger';

export interface Stage6ModelTier {
  model: string;
  fallback: string;
  tier: 'simple' | 'normal' | 'complex';
  reason: string;
  phaseName: PhaseName;
  source: string;
  /**
   * Reasoning settings for the selected phase. The complex tier is where
   * deliberation earns its tokens; simple and normal run without it.
   */
  reasoning: PhaseReasoningConfig;
}

/**
 * Select model tier for Stage 6 lesson generation based on difficulty_level.
 *
 * Mapping (to a phase name; the model behind it comes from the database):
 * - beginner → simple → `stage_6_simple`
 * - intermediate → normal → `stage_6_normal`
 * - advanced → complex → `stage_6_complex`
 *
 * First module rule: All lessons in module 1 (lesson_id starts with "1.") always use complex tier.
 *
 * @param lessonSpec - Lesson specification from Stage 5
 * @returns Model tier with selected primary + fallback model IDs and reasoning
 */
export async function selectStage6ModelTier(
  lessonSpec: LessonSpecificationV2,
  courseId?: string
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
    const config = await modelConfigService.getModelForPhase(phaseName, courseId);
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
      phaseName,
      source: config.source,
      reasoning: config.reasoning,
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
      phaseName,
      source: 'hardcoded',
      // No database row means no reasoning budget, and reasoning without a
      // budget truncates the answer instead of improving it.
      reasoning: REASONING_DISABLED,
    };
  }
}
