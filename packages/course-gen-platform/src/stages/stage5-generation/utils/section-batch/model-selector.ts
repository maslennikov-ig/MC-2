import type { QdrantClient } from '@qdrant/js-client-rest';
import type { GenerationJobInput } from '@megacampus/shared-types';
import type { SectionBreakdown } from '@megacampus/shared-types/analysis-schemas';
import { createModelConfigService } from '../../../../shared/llm/model-config-service';
import { getRagTokenBudget } from '../../../../services/global-settings-service';
import logger from '@/shared/logger';
import { ModelTier } from './types';
import { MODELS, TOKEN_BUDGET } from './constants';
import { normalizeLanguageCode } from '@megacampus/shared-utils';

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
 * Select model tier based on section importance and first-section rule.
 *
 * 3-tier routing (importance-based):
 * - simple: cheap model for trivial sections (importance=simple)
 * - normal: main workhorse for standard sections (importance=normal)
 * - complex: premium model for complex sections + first section of every course
 * - tier3_gemini: context overflow fallback (>108K tokens)
 *
 * First section (sectionIndex=0) always gets the complex tier for best quality.
 */
export async function selectModelTier(
  input: GenerationJobInput,
  qdrantClient: QdrantClient | undefined,
  language: string,
  sectionIndex: number,
  section: SectionBreakdown
): Promise<ModelTier> {
  const estimatedContextLength = await estimateContextLength(input, qdrantClient);
  const langCode = normalizeLanguageCode(language, 'en');

  // 1. Context overflow → Gemini (unchanged)
  if (estimatedContextLength > TOKEN_BUDGET.GEMINI_TRIGGER_INPUT) {
    return {
      model: MODELS.tier3_gemini,
      tier: 'tier3_gemini',
      reason: `Context overflow: ${estimatedContextLength} tokens > ${TOKEN_BUDGET.GEMINI_TRIGGER_INPUT} threshold`,
    };
  }

  // 2. Determine target tier based on importance + first-section rule
  const importance = section.importance || 'normal';
  const isFirstSection = sectionIndex === 0;

  let targetTier: 'simple' | 'normal' | 'complex';
  let tierReason: string;

  if (isFirstSection) {
    targetTier = 'complex';
    tierReason = 'First section always uses premium model for best quality';
  } else if (importance === 'complex') {
    targetTier = 'complex';
    tierReason = `Section importance=${importance} (complex material)`;
  } else if (importance === 'simple') {
    targetTier = 'simple';
    tierReason = `Section importance=${importance} (trivial content)`;
  } else {
    targetTier = 'normal';
    tierReason = `Section importance=${importance} (standard content)`;
  }

  // 3. Resolve model from DB config
  const phaseNameMap: Record<string, string> = {
    simple: 'stage_5_simple',
    normal: 'stage_5_normal',
    complex: 'stage_5_complex',
  };

  const phaseName = phaseNameMap[targetTier];

  try {
    const modelConfigService = createModelConfigService();
    const config = await modelConfigService.getModelForPhase(
      phaseName,
      undefined,
      estimatedContextLength,
      langCode
    );
    const modelId = config.modelId || MODELS[targetTier];

    logger.info({
      msg: `Model tier selection: ${targetTier}`,
      tier: targetTier,
      phase: phaseName,
      modelId,
      source: config.source,
      sectionIndex,
      isFirstSection,
      importance,
    });

    return {
      model: modelId,
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
      model: MODELS[targetTier],
      tier: targetTier,
      reason: `${tierReason} → ${MODELS[targetTier]} (hardcoded fallback)`,
    };
  }
}
