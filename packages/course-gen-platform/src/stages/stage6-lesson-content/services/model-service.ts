import { logger } from '@/shared/logger';
import { createModelConfigService, getEffectiveStageConfig } from '@/shared/llm/model-config-service';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { DEFAULT_JOB_TIMEOUT_MS, MODEL_FALLBACK } from '../config';

/**
 * Get job timeout from database configuration
 */
export async function getJobTimeout(): Promise<number> {
  try {
    const modelConfigService = createModelConfigService();
    const phaseConfig = await modelConfigService.getModelForPhase('stage_6_content');
    const effectiveConfig = getEffectiveStageConfig(phaseConfig);

    const timeout = effectiveConfig.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS;

    logger.info({
      timeout,
      source: phaseConfig.source,
    }, 'Using database-driven job timeout config');

    return timeout;
  } catch (error) {
    logger.warn({
      error: error instanceof Error ? error.message : String(error),
      fallback: DEFAULT_JOB_TIMEOUT_MS,
    }, 'Failed to load job timeout config, using default');

    return DEFAULT_JOB_TIMEOUT_MS;
  }
}

/**
 * Detect language from lesson specification
 */
export function detectLanguage(spec: LessonSpecificationV2): 'ru' | 'en' {
  const hasCyrillic = /[а-яА-ЯёЁ]/.test(spec.title);
  return hasCyrillic ? 'ru' : 'en';
}

/**
 * Get Stage 6 model configuration from ModelConfigService
 */
export async function getStage6ModelConfig(
  lessonSpec: LessonSpecificationV2,
  language: string
): Promise<{ primary: string; fallback: string }> {
  const modelConfigService = createModelConfigService();

  const lowerLang = language.toLowerCase();
  const normalizedLang: 'ru' | 'en' = lowerLang === 'ru' ? 'ru' : 'en';

  if (lowerLang !== 'ru' && lowerLang !== 'en') {
    logger.warn(
      {
        lessonId: lessonSpec.lesson_id,
        originalLanguage: language,
        normalizedLanguage: normalizedLang,
      },
      'Unsupported language normalized to English - ModelConfigService only supports ru/en'
    );
  }

  try {
    // Use phase-based config - Stage 6 has multiple phases, not a single stage config
    const phaseConfig = await modelConfigService.getModelForPhase('stage_6_section_expander');

    logger.info(
      {
        lessonId: lessonSpec.lesson_id,
        language,
        primary: phaseConfig.modelId,
        fallback: phaseConfig.fallbackModelId,
        source: phaseConfig.source,
      },
      'Retrieved Stage 6 model config'
    );

    return {
      primary: phaseConfig.modelId,
      fallback: phaseConfig.fallbackModelId ?? MODEL_FALLBACK.fallback,
    };
  } catch (error) {
    logger.warn(
      {
        lessonId: lessonSpec.lesson_id,
        language,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to fetch model config from service, using hardcoded fallback'
    );

    return {
      primary: MODEL_FALLBACK.primary[normalizedLang],
      fallback: MODEL_FALLBACK.fallback,
    };
  }
}
