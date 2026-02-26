/**
 * Model Configs Router Helpers
 * @module server/routers/pipeline-admin/model-configs-helpers
 *
 * Extracted handler logic for model config tRPC procedures.
 * Reduces complexity and line count in the main router file.
 *
 * Judge-related handlers are in model-configs-judge-helpers.ts.
 */

import { TRPCError } from '@trpc/server';
import type { ModelConfigWithVersion, PhaseName } from '@megacampus/shared-types';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { logPipelineAction } from '../../../services/pipeline-audit';
import { getOpenRouterModels } from '../../../services/openrouter-models';
import { DEFAULT_MODEL_CONFIGS } from './constants';
import { createModelConfigService } from '../../../shared/llm/model-config-service';
import { throwOnSupabaseError } from '../../utils/supabase-query-guard';

// Re-export judge helpers for unified import from model-configs.ts
export { handleListJudgeConfigs, handleUpdateJudgeConfig } from './model-configs-judge-helpers';

// =============================================================================
// Types
// =============================================================================

/** Row type returned by Supabase for llm_model_config with joined user email */
type ConfigRowWithUser = {
  id: string;
  config_type: string;
  phase_name: string;
  course_id: string | null;
  model_id: string;
  fallback_model_id: string | null;
  temperature: number | null;
  max_tokens: number | null;
  version: number;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  stage_number: number | null;
  language: string | null;
  context_tier: string | null;
  max_context_tokens: number | null;
  threshold_tokens: number | null;
  cache_read_enabled: boolean | null;
  primary_display_name: string | null;
  fallback_display_name: string | null;
  judge_role: string | null;
  weight: number | null;
  quality_threshold: number | null;
  max_retries: number | null;
  timeout_ms: number | null;
  users: { email: string } | null;
};

/** Input for updateModelConfig mutation */
export interface UpdateModelConfigInput {
  id: string;
  modelId?: string;
  fallbackModelId?: string | null;
  temperature?: number;
  maxTokens?: number;
  courseId?: string | null;
  expectedVersion?: number;
  qualityThreshold?: number | null;
  maxRetries?: number | null;
  timeoutMs?: number | null;
}

/** Input for revertModelConfigToVersion mutation */
export interface RevertModelConfigInput {
  phaseName: PhaseName;
  targetVersion: number;
  expectedCurrentVersion?: number;
}

/** Input for resetModelConfigToDefault mutation */
export interface ResetModelConfigInput {
  phaseName: PhaseName;
  expectedCurrentVersion?: number;
}

// =============================================================================
// Mapping Helpers
// =============================================================================

/** Extended ModelConfigWithVersion that includes the createdByEmail join field */
export type ModelConfigWithVersionAndEmail = ModelConfigWithVersion & {
  createdByEmail: string | null;
};

/**
 * Map a database config row (with joined user) to ModelConfigWithVersion + createdByEmail
 */
function mapConfigRowToFull(config: ConfigRowWithUser): ModelConfigWithVersionAndEmail {
  return {
    id: config.id,
    configType: config.config_type,
    phaseName: config.phase_name as PhaseName,
    courseId: config.course_id,
    modelId: config.model_id,
    fallbackModelId: config.fallback_model_id,
    temperature: config.temperature ?? 0.7,
    maxTokens: config.max_tokens ?? 4096,
    version: config.version,
    isActive: config.is_active,
    createdAt: config.created_at ?? new Date().toISOString(),
    updatedAt: config.updated_at ?? new Date().toISOString(),
    createdBy: config.created_by,
    createdByEmail: config.users?.email || null,
    // Wave 1 fields
    stageNumber: config.stage_number,
    language: config.language,
    contextTier: config.context_tier,
    maxContextTokens: config.max_context_tokens,
    thresholdTokens: config.threshold_tokens,
    cacheReadEnabled: config.cache_read_enabled,
    primaryDisplayName: config.primary_display_name,
    fallbackDisplayName: config.fallback_display_name,
    // CLEV Judge fields
    judgeRole: config.judge_role as 'primary' | 'secondary' | 'tiebreaker' | null,
    weight: config.weight,
    // Per-stage settings
    qualityThreshold: config.quality_threshold,
    maxRetries: config.max_retries,
    timeoutMs: config.timeout_ms,
  };
}

/**
 * Map a database config row to a slim response (without Wave 1 / judge fields)
 */
function mapConfigRowToSlim(config: ConfigRowWithUser) {
  return {
    id: config.id,
    configType: config.config_type,
    phaseName: config.phase_name as PhaseName,
    courseId: config.course_id,
    modelId: config.model_id,
    fallbackModelId: config.fallback_model_id,
    temperature: config.temperature,
    maxTokens: config.max_tokens,
    version: config.version,
    isActive: config.is_active,
    createdAt: config.created_at,
    updatedAt: config.updated_at,
    createdBy: config.created_by,
    createdByEmail: config.users?.email || null,
  };
}

// =============================================================================
// Validation & Utility Helpers
// =============================================================================

/**
 * Validate that a model ID exists in the OpenRouter catalog
 * @throws TRPCError with BAD_REQUEST if model not found
 */
async function validateModelIdExists(modelId: string): Promise<void> {
  const { models } = await getOpenRouterModels();
  const modelExists = models.some(m => m.id === modelId);

  if (!modelExists) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Model "${modelId}" not found in OpenRouter catalog`,
    });
  }
}

/**
 * Deactivate a config by ID
 * @throws TRPCError on failure
 */
async function deactivateConfig(configId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('llm_model_config')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', configId);

  if (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to deactivate current config: ${error.message}`,
    });
  }
}

/**
 * Clear the model config cache (non-blocking)
 * @returns true if cache was successfully cleared, false otherwise
 */
function clearModelConfigCache(phaseName: string): boolean {
  try {
    const service = createModelConfigService();
    service.clearCache();
    logger.debug({ phaseName }, 'Model config cache cleared after update');
    return true;
  } catch (cacheErr) {
    logger.warn({ cacheErr, phaseName }, 'Failed to clear model config cache after update');
    return false;
  }
}

// =============================================================================
// Handler: listModelConfigs
// =============================================================================

/**
 * Fetch all active model configurations from the database
 */
export async function handleListModelConfigs(): Promise<ModelConfigWithVersionAndEmail[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('llm_model_config')
    .select('*, users:created_by(email)')
    .eq('is_active', true)
    .order('phase_name');

  if (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to fetch model configs: ${error.message}`,
    });
  }

  return (data || []).map(config => mapConfigRowToFull(config as unknown as ConfigRowWithUser));
}

// =============================================================================
// Handler: updateModelConfig
// =============================================================================

/**
 * Build the new config row from current config + input overrides
 */
function buildUpdatedConfigRow(
  currentConfig: ConfigRowWithUser,
  input: UpdateModelConfigInput,
  userId: string
) {
  return {
    config_type: currentConfig.config_type,
    phase_name: currentConfig.phase_name,
    course_id: input.courseId !== undefined ? input.courseId : currentConfig.course_id,
    model_id: input.modelId || currentConfig.model_id,
    fallback_model_id:
      input.fallbackModelId !== undefined ? input.fallbackModelId : currentConfig.fallback_model_id,
    temperature: input.temperature !== undefined ? input.temperature : currentConfig.temperature,
    max_tokens: input.maxTokens !== undefined ? input.maxTokens : currentConfig.max_tokens,
    version: currentConfig.version + 1,
    is_active: true,
    created_by: userId,
    // Preserve Wave 1 fields
    stage_number: currentConfig.stage_number,
    language: currentConfig.language,
    context_tier: currentConfig.context_tier,
    max_context_tokens: currentConfig.max_context_tokens,
    threshold_tokens: currentConfig.threshold_tokens,
    cache_read_enabled: currentConfig.cache_read_enabled,
    primary_display_name: currentConfig.primary_display_name,
    fallback_display_name: currentConfig.fallback_display_name,
    // CLEV Judge fields
    judge_role: currentConfig.judge_role,
    weight: currentConfig.weight,
    // Per-stage settings
    quality_threshold:
      input.qualityThreshold !== undefined
        ? input.qualityThreshold
        : currentConfig.quality_threshold,
    max_retries: input.maxRetries !== undefined ? input.maxRetries : currentConfig.max_retries,
    timeout_ms: input.timeoutMs !== undefined ? input.timeoutMs : currentConfig.timeout_ms,
  };
}

/**
 * Handle the updateModelConfig mutation logic
 */
export async function handleUpdateModelConfig(input: UpdateModelConfigInput, userId: string) {
  const supabase = getSupabaseAdmin();

  // 1. Get current config
  const { data: currentConfig, error: fetchError } = await supabase
    .from('llm_model_config')
    .select('*')
    .eq('id', input.id)
    .single();

  throwOnSupabaseError(fetchError, 'Model configuration', { configId: input.id });
  if (!currentConfig) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Model configuration not found' });
  }

  // 2. Optimistic locking
  if (input.expectedVersion !== undefined && currentConfig.version !== input.expectedVersion) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `Configuration was modified by another user. Expected version ${input.expectedVersion}, but current version is ${currentConfig.version}. Please refresh and try again.`,
    });
  }

  // 3. Validate new modelId
  if (input.modelId && input.modelId !== currentConfig.model_id) {
    await validateModelIdExists(input.modelId);
  }

  // 4. Deactivate current version
  await deactivateConfig(input.id);

  // 5. Insert new version
  const newConfig = buildUpdatedConfigRow(
    currentConfig as unknown as ConfigRowWithUser,
    input,
    userId
  );

  const { data: insertedConfig, error: insertError } = await supabase
    .from('llm_model_config')
    .insert(newConfig)
    .select('*, users:created_by(email)')
    .single();

  throwOnSupabaseError(insertError, 'Model configuration', {
    configId: input.id,
    phaseName: currentConfig.phase_name,
  });
  if (!insertedConfig) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to insert new config version',
    });
  }

  // 6. Audit log
  await logPipelineAction(
    userId,
    'update_model_config',
    'model_config',
    insertedConfig.id,
    {
      phaseName: currentConfig.phase_name,
      oldVersion: currentConfig.version,
      newVersion: newConfig.version,
      oldModelId: currentConfig.model_id,
      newModelId: insertedConfig.model_id,
    },
    { failOnError: true }
  );

  logger.info(
    {
      userId,
      configId: insertedConfig.id,
      phaseName: insertedConfig.phase_name,
      version: newConfig.version,
    },
    'Model config updated'
  );

  // Invalidate cache
  const cacheCleared = clearModelConfigCache(insertedConfig.phase_name);

  const mapped = mapConfigRowToFull(insertedConfig as unknown as ConfigRowWithUser);
  return {
    ...mapped,
    temperature: insertedConfig.temperature,
    maxTokens: insertedConfig.max_tokens,
    createdAt: insertedConfig.created_at,
    updatedAt: insertedConfig.updated_at,
    cacheCleared,
  };
}

// =============================================================================
// Handler: revertModelConfigToVersion
// =============================================================================

/**
 * Handle the revertModelConfigToVersion mutation logic
 */
export async function handleRevertModelConfigToVersion(
  input: RevertModelConfigInput,
  userId: string
) {
  const supabase = getSupabaseAdmin();

  // 1. Find target version
  const { data: targetConfig, error: fetchError } = await supabase
    .from('llm_model_config')
    .select('*')
    .eq('phase_name', input.phaseName)
    .eq('config_type', 'global')
    .is('course_id', null)
    .eq('version', input.targetVersion)
    .single();

  throwOnSupabaseError(fetchError, 'Model configuration version', {
    phaseName: input.phaseName,
    targetVersion: input.targetVersion,
  });
  if (!targetConfig) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Version ${input.targetVersion} not found for phase ${input.phaseName}`,
    });
  }

  // 2. Get current active config
  const { data: currentActive, error: currentError } = await supabase
    .from('llm_model_config')
    .select('id, version')
    .eq('phase_name', input.phaseName)
    .eq('config_type', 'global')
    .is('course_id', null)
    .eq('is_active', true)
    .single();

  throwOnSupabaseError(currentError, 'Active model configuration', { phaseName: input.phaseName });
  if (!currentActive) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'No active config found to deactivate' });
  }

  // 3. Optimistic locking
  if (
    input.expectedCurrentVersion !== undefined &&
    currentActive.version !== input.expectedCurrentVersion
  ) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `Configuration was modified by another user. Expected version ${input.expectedCurrentVersion}, but current version is ${currentActive.version}. Please refresh and try again.`,
    });
  }

  // 4. Deactivate current
  await deactivateConfig(currentActive.id);

  // 5. Insert copy of target as new version
  const newVersion = currentActive.version + 1;
  const newConfig = {
    config_type: targetConfig.config_type,
    phase_name: targetConfig.phase_name,
    course_id: targetConfig.course_id,
    model_id: targetConfig.model_id,
    fallback_model_id: targetConfig.fallback_model_id,
    temperature: targetConfig.temperature,
    max_tokens: targetConfig.max_tokens,
    version: newVersion,
    is_active: true,
    created_by: userId,
    stage_number: targetConfig.stage_number,
    language: targetConfig.language,
    context_tier: targetConfig.context_tier,
    max_context_tokens: targetConfig.max_context_tokens,
    threshold_tokens: targetConfig.threshold_tokens,
    cache_read_enabled: targetConfig.cache_read_enabled,
    primary_display_name: targetConfig.primary_display_name,
    fallback_display_name: targetConfig.fallback_display_name,
    judge_role: targetConfig.judge_role,
    weight: targetConfig.weight,
  };

  const { data: insertedConfig, error: insertError } = await supabase
    .from('llm_model_config')
    .insert(newConfig)
    .select('*, users:created_by(email)')
    .single();

  throwOnSupabaseError(insertError, 'Model configuration', {
    phaseName: input.phaseName,
    targetVersion: input.targetVersion,
  });
  if (!insertedConfig) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to insert reverted config',
    });
  }

  // 6. Audit log
  await logPipelineAction(
    userId,
    'update_model_config',
    'model_config',
    insertedConfig.id,
    {
      action: 'revert',
      phaseName: input.phaseName,
      targetVersion: input.targetVersion,
      newVersion,
    },
    { failOnError: true }
  );

  logger.info(
    {
      userId,
      phaseName: input.phaseName,
      targetVersion: input.targetVersion,
      newVersion,
    },
    'Model config reverted to version'
  );

  return mapConfigRowToSlim(insertedConfig as unknown as ConfigRowWithUser);
}

// =============================================================================
// Handler: resetModelConfigToDefault
// =============================================================================

/**
 * Handle the resetModelConfigToDefault mutation logic
 */
export async function handleResetModelConfigToDefault(
  input: ResetModelConfigInput,
  userId: string
) {
  const supabase = getSupabaseAdmin();

  const defaultConfig = DEFAULT_MODEL_CONFIGS[input.phaseName];
  if (!defaultConfig) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `No default configuration found for phase ${input.phaseName}`,
    });
  }

  const { data: currentActive } = await supabase
    .from('llm_model_config')
    .select('id, version')
    .eq('phase_name', input.phaseName)
    .eq('config_type', 'global')
    .is('course_id', null)
    .eq('is_active', true)
    .maybeSingle();

  // Optimistic locking
  if (
    input.expectedCurrentVersion !== undefined &&
    currentActive &&
    currentActive.version !== input.expectedCurrentVersion
  ) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `Configuration was modified by another user. Expected version ${input.expectedCurrentVersion}, but current version is ${currentActive.version}. Please refresh and try again.`,
    });
  }

  const nextVersion = currentActive ? currentActive.version + 1 : 1;

  if (currentActive) {
    await deactivateConfig(currentActive.id);
  }

  const newConfig = {
    config_type: 'global',
    phase_name: input.phaseName,
    course_id: null,
    model_id: defaultConfig.modelId,
    fallback_model_id: defaultConfig.fallbackModelId || null,
    temperature: defaultConfig.temperature,
    max_tokens: defaultConfig.maxTokens,
    version: nextVersion,
    is_active: true,
    created_by: userId,
  };

  const { data: insertedConfig, error: insertError } = await supabase
    .from('llm_model_config')
    .insert(newConfig)
    .select('*, users:created_by(email)')
    .single();

  throwOnSupabaseError(insertError, 'Model configuration', { phaseName: input.phaseName });
  if (!insertedConfig) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to insert default config',
    });
  }

  await logPipelineAction(
    userId,
    'update_model_config',
    'model_config',
    insertedConfig.id,
    {
      action: 'reset_to_default',
      phaseName: input.phaseName,
      newVersion: nextVersion,
    },
    { failOnError: true }
  );

  logger.info(
    {
      userId,
      phaseName: input.phaseName,
      newVersion: nextVersion,
    },
    'Model config reset to default'
  );

  return mapConfigRowToSlim(insertedConfig as unknown as ConfigRowWithUser);
}

// =============================================================================
// Error Wrapper
// =============================================================================

/**
 * Wrap a handler function with standard tRPC error handling.
 * Re-throws TRPCError as-is, wraps unknown errors with INTERNAL_SERVER_ERROR.
 */
export async function withTrpcErrorHandling<T>(
  handlerName: string,
  input: unknown,
  handler: () => Promise<T>
): Promise<T> {
  try {
    return await handler();
  } catch (error: unknown) {
    if (error instanceof TRPCError) {
      throw error;
    }

    logger.error(
      { err: error instanceof Error ? error.message : String(error), input },
      `Unexpected error in ${handlerName}`
    );
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to ${handlerName
        .replace(/([A-Z])/g, ' $1')
        .toLowerCase()
        .trim()}`,
    });
  }
}
