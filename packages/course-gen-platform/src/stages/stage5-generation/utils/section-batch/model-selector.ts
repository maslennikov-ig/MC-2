import type { QdrantClient } from '@qdrant/js-client-rest';
import type { GenerationJobInput } from '@megacampus/shared-types';
import type { SectionBreakdown } from '@megacampus/shared-types/analysis-schemas';
import { createModelConfigService } from '../../../../shared/llm/model-config-service';
import { getRagTokenBudget } from '../../../../services/global-settings-service';
import logger from '@/shared/logger';
import { ModelTier } from './types';
import { MODELS, TOKEN_BUDGET, QUALITY_THRESHOLDS } from './constants';
import { normalizeLanguageCode } from '@/shared/utils/language-utils';

/**
 * Calculate complexity score for pre-routing (RT-001)
 */
export function calculateComplexityScore(section: SectionBreakdown): number {
  let score = 0;

  const topicCount = section.key_topics?.length || 0;
  if (topicCount >= 8) {
    score += 0.4;
  } else if (topicCount >= 5) {
    score += 0.25;
  } else {
    score += 0.1;
  }

  const objectiveCount = section.learning_objectives?.length || 0;
  if (objectiveCount >= 5) {
    score += 0.3;
  } else if (objectiveCount >= 3) {
    score += 0.2;
  } else {
    score += 0.1;
  }

  const estimatedLessons = section.estimated_lessons || 0;
  if (estimatedLessons >= 5) {
    score += 0.3;
  } else if (estimatedLessons >= 3) {
    score += 0.2;
  } else {
    score += 0.1;
  }

  return Math.min(1.0, score);
}

/**
 * Assess criticality for pre-routing (RT-001)
 */
export function assessCriticality(section: SectionBreakdown): number {
  let score = 0;

  const importance = section.importance || 'optional';
  if (importance === 'core') {
    score += 0.6;
  } else if (importance === 'important') {
    score += 0.3;
  } else {
    score += 0.1;
  }

  const sectionName = section.area?.toLowerCase() || '';
  if (
    sectionName.includes('introduction') ||
    sectionName.includes('fundamental') ||
    sectionName.includes('basics') ||
    sectionName.includes('getting started')
  ) {
    score += 0.4;
  } else {
    score += 0.2;
  }

  return Math.min(1.0, score);
}

/**
 * Estimate context length for Tier 3 routing
 */
export async function estimateContextLength(
  input: GenerationJobInput,
  qdrantClient?: QdrantClient
): Promise<number> {
  let estimatedTokens =
    TOKEN_BUDGET.BASE_PROMPT + TOKEN_BUDGET.STYLE_PROMPT + TOKEN_BUDGET.SECTION_CONTEXT;

  if (qdrantClient && input.vectorized_documents) {
    const ragMaxTokens = await getRagTokenBudget();
    estimatedTokens += ragMaxTokens;
  }

  return estimatedTokens;
}

/**
 * Select model tier based on complexity, criticality, and language
 */
export async function selectModelTier(
  complexityScore: number,
  criticalityScore: number,
  input: GenerationJobInput,
  qdrantClient: QdrantClient | undefined,
  language: string
): Promise<ModelTier> {
  const estimatedContextLength = await estimateContextLength(input, qdrantClient);

  if (estimatedContextLength > TOKEN_BUDGET.GEMINI_TRIGGER_INPUT) {
    return {
      model: MODELS.tier3_gemini,
      tier: 'tier3_gemini',
      reason: `Context overflow: ${estimatedContextLength} tokens > ${TOKEN_BUDGET.GEMINI_TRIGGER_INPUT} threshold`,
    };
  }

  if (
    complexityScore >= QUALITY_THRESHOLDS.complexity ||
    criticalityScore >= QUALITY_THRESHOLDS.criticality
  ) {
    try {
      const langCode = normalizeLanguageCode(language, 'en');
      const modelConfigService = createModelConfigService();
      const config = await modelConfigService.getModelForPhase(
        'stage_5_sections',
        undefined,
        estimatedContextLength,
        langCode
      );
      const modelId = config.modelId || MODELS.lessons_fallback;

      const isRussian = langCode === 'ru';
      const tierName = isRussian ? 'tier2_ru_lessons' : 'tier2_en_lessons';

      logger.info({
        msg: 'Tier 2 model selection via getModelForPhase',
        language: langCode,
        modelId,
        phase: 'stage_5_sections',
        complexityScore,
        criticalityScore,
      });

      return {
        model: modelId,
        tier: tierName,
        reason: `High complexity (${complexityScore.toFixed(2)}) or criticality (${criticalityScore.toFixed(2)}) - using ${language}-optimized model (${modelId})`,
      };
    } catch (error) {
      logger.warn({
        msg: 'getModelForPhase failed for tier2, using hardcoded fallback',
        language,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      const langCode = normalizeLanguageCode(language, 'en');
      const isRussian = langCode === 'ru';
      const model = isRussian ? MODELS.ru_lessons_primary : MODELS.en_lessons_primary;
      const tierName = isRussian ? 'tier2_ru_lessons' : 'tier2_en_lessons';

      return {
        model,
        tier: tierName,
        reason: `High complexity (${complexityScore.toFixed(2)}) or criticality (${criticalityScore.toFixed(2)}) - using ${language}-optimized model (${model}, hardcoded fallback)`,
      };
    }
  }

  // Tier 1: Standard complexity - try to get model from database
  const langCode = normalizeLanguageCode(language, 'en');
  try {
    const modelConfigService = createModelConfigService();
    const tier1Config = await modelConfigService.getModelForPhase(
      'stage_5_tier1',
      undefined,
      estimatedContextLength,
      langCode
    );
    const tier1Model = tier1Config.modelId || MODELS.tier1_oss120b;

    logger.info({
      msg: 'Tier 1 model selection via getModelForPhase',
      phase: 'stage_5_tier1',
      modelId: tier1Model,
      source: tier1Config.source,
      complexityScore,
      criticalityScore,
    });

    return {
      model: tier1Model,
      tier: 'tier1_oss120b',
      reason: `Standard section (model from ${tier1Config.source}: ${tier1Model}): complexity=${complexityScore.toFixed(2)}, criticality=${criticalityScore.toFixed(2)}`,
    };
  } catch (error) {
    logger.warn({
      msg: 'getModelForPhase failed for tier1, using hardcoded fallback',
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      model: MODELS.tier1_oss120b,
      tier: 'tier1_oss120b',
      reason: `Standard section (hardcoded fallback): complexity=${complexityScore.toFixed(2)}, criticality=${criticalityScore.toFixed(2)}`,
    };
  }
}
