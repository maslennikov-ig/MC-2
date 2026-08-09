import { logger } from '@/shared/logger';
import {
  createModelConfigService,
  getEffectiveStageConfig,
} from '@/shared/llm/model-config-service';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { DEFAULT_JOB_TIMEOUT_MS } from '../config';

/**
 * Get job timeout from database configuration
 */
export async function getJobTimeout(courseId?: string): Promise<number> {
  try {
    const modelConfigService = createModelConfigService();
    const phaseConfig = await modelConfigService.getModelForPhase('stage_6_content', courseId);
    const effectiveConfig = getEffectiveStageConfig(phaseConfig);

    const timeout = effectiveConfig.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS;

    logger.info(
      {
        timeout,
        source: phaseConfig.source,
      },
      'Using database-driven job timeout config'
    );

    return timeout;
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        fallback: DEFAULT_JOB_TIMEOUT_MS,
      },
      'Failed to load job timeout config, using default'
    );

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
