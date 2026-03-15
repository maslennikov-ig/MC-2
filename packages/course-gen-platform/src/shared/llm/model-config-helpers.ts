/**
 * Model resolution and helper functions
 * @module shared/llm/model-config-helpers
 *
 * Extracted from model-config-service.ts to comply with max-lines rule.
 */

import * as ModelConfigDB from './model-config-db';
import logger from '@/shared/logger';

// ============================================================================
// HELPER: EFFECTIVE STAGE CONFIG
// ============================================================================

const DEFAULT_STAGE_CONFIG = ModelConfigDB.DEFAULT_STAGE_CONFIG;

/**
 * Get effective stage config with defaults applied
 *
 * @param config - Phase config from database (may have null values)
 * @returns Config with defaults applied for null values
 */
export function getEffectiveStageConfig(config: ModelConfigDB.PhaseModelConfig): {
  qualityThreshold: number;
  maxRetries: number;
  timeoutMs: number | null;
} {
  return {
    qualityThreshold: config.qualityThreshold ?? DEFAULT_STAGE_CONFIG.qualityThreshold,
    maxRetries: config.maxRetries ?? DEFAULT_STAGE_CONFIG.maxRetries,
    timeoutMs: config.timeoutMs ?? DEFAULT_STAGE_CONFIG.timeoutMs,
  };
}

// ============================================================================
// HELPER: MODEL RESOLUTION WITH FALLBACK
// ============================================================================

/**
 * Minimal interface for ModelConfigService to avoid circular imports
 */
interface ModelConfigServiceLike {
  getModelForPhase(phaseName: string, courseId?: string): Promise<{ modelId: string }>;
}

/**
 * Options for model resolution
 */
export interface ResolveModelOptions {
  /** Model from user settings (explicit override) - highest priority */
  settingsModel?: string;
  /** Phase name for database lookup */
  phaseName: string;
  /** Course ID for course-specific overrides */
  courseId?: string;
  /** Fallback model if all else fails */
  fallbackModel: string;
  /** Logger context for debugging */
  logContext?: Record<string, unknown>;
  /** ModelConfigService instance (avoids circular import) */
  modelConfigService?: ModelConfigServiceLike;
}

/**
 * Resolve model ID with priority: settings → database → fallback
 *
 * Optimization: skips database call entirely if settingsModel is provided.
 *
 * Priority order:
 * 1. settingsModel (user explicit override) - skip DB call
 * 2. database config (phaseConfig.modelId) via provided modelConfigService
 * 3. fallbackModel (hardcoded default)
 *
 * @param options - Resolution options
 * @returns Resolved model ID
 *
 * @example
 * ```typescript
 * const model = await resolveModelWithFallback({
 *   settingsModel: settings.model as string | undefined,
 *   phaseName: 'stage_7_video',
 *   courseId: enrichmentContext.course.id,
 *   fallbackModel: DEFAULT_MODEL_ID,
 *   logContext: { lessonId, enrichmentId },
 *   modelConfigService: createModelConfigService(),
 * });
 * ```
 */
export async function resolveModelWithFallback(options: ResolveModelOptions): Promise<string> {
  const {
    settingsModel,
    phaseName,
    courseId,
    fallbackModel,
    logContext = {},
    modelConfigService,
  } = options;

  // Priority 1: User explicitly set model in settings - use it directly, skip DB call
  if (settingsModel) {
    logger.debug(
      { ...logContext, model: settingsModel, source: 'settings' },
      'Using model from settings (explicit override)'
    );
    return settingsModel;
  }

  // Priority 2: Try to get from database config
  if (modelConfigService) {
    try {
      const phaseConfig = await modelConfigService.getModelForPhase(phaseName, courseId);
      const model = phaseConfig.modelId || fallbackModel;

      logger.debug(
        { ...logContext, model, source: phaseConfig.modelId ? 'database' : 'fallback', phaseName },
        'Model resolved from database config'
      );
      return model;
    } catch (configError) {
      logger.warn(
        {
          ...logContext,
          phaseName,
          fallbackModel,
          error: configError instanceof Error ? configError.message : String(configError),
        },
        'Failed to get model config from database, using fallback'
      );
      return fallbackModel;
    }
  }

  // Priority 3: No service provided - use fallback directly
  logger.debug(
    { ...logContext, model: fallbackModel, source: 'fallback', phaseName },
    'No modelConfigService provided, using fallback model'
  );
  return fallbackModel;
}
