/**
 * Judge Config Helpers
 * @module server/routers/pipeline-admin/model-configs-judge-helpers
 *
 * Extracted handler logic for judge-related model config tRPC procedures.
 * Handles listJudgeConfigs and updateJudgeConfig operations.
 */

import { TRPCError } from '@trpc/server';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { logPipelineAction } from '../../../services/pipeline-audit';
import { getOpenRouterModels } from '../../../services/openrouter-models';

// =============================================================================
// Types
// =============================================================================

/** Input for listJudgeConfigs query */
export interface ListJudgeConfigsInput {
  language?: string;
}

/** Input for updateJudgeConfig mutation */
export interface UpdateJudgeConfigInput {
  id: string;
  modelId?: string;
  weight?: number;
  temperature?: number;
  maxTokens?: number;
  isActive?: boolean;
}

/** Judge config output shape */
export interface JudgeConfigOutput {
  id: string;
  modelId: string;
  displayName: string;
  language: string;
  judgeRole: 'primary' | 'secondary' | 'tiebreaker';
  weight: number;
  temperature: number;
  maxTokens: number;
  fallbackModelId: string | null;
  isActive: boolean;
}

/** Judge group output shape for listJudgeConfigs */
export interface JudgeConfigsByLanguage {
  language: string;
  primary: JudgeConfigOutput;
  secondary: JudgeConfigOutput;
  tiebreaker: JudgeConfigOutput;
}

/** Row type for judge config DB row */
type JudgeConfigRow = {
  id: string;
  phase_name: string;
  model_id: string;
  fallback_model_id: string | null;
  temperature: number | null;
  max_tokens: number | null;
  is_active: boolean;
  language: string | null;
  primary_display_name: string | null;
  judge_role: string | null;
  weight: number | null;
};

// =============================================================================
// Mapping Helpers
// =============================================================================

/** Default weights per judge role */
const DEFAULT_JUDGE_WEIGHTS: Record<string, number> = {
  primary: 0.75,
  secondary: 0.73,
  tiebreaker: 0.72,
};

/** Map a raw judge config row to JudgeConfigOutput */
function mapJudgeConfigRow(config: JudgeConfigRow, defaultWeight: number): JudgeConfigOutput {
  return {
    id: config.id,
    modelId: config.model_id,
    displayName: config.primary_display_name || config.model_id,
    language: config.language || 'any',
    judgeRole: config.judge_role as 'primary' | 'secondary' | 'tiebreaker',
    weight: config.weight || defaultWeight,
    temperature: config.temperature || 0.3,
    maxTokens: config.max_tokens || 4096,
    fallbackModelId: config.fallback_model_id,
    isActive: config.is_active,
  };
}

/**
 * Group judge config rows by language and convert to output format.
 * Only includes language groups where all three roles are present.
 */
function groupJudgesByLanguage(data: JudgeConfigRow[]): JudgeConfigsByLanguage[] {
  const groupedByLanguage = new Map<
    string,
    {
      primary?: JudgeConfigRow;
      secondary?: JudgeConfigRow;
      tiebreaker?: JudgeConfigRow;
    }
  >();

  for (const config of data) {
    const lang = config.language || 'any';
    if (!groupedByLanguage.has(lang)) {
      groupedByLanguage.set(lang, {});
    }
    const group = groupedByLanguage.get(lang)!;
    const role = config.judge_role;

    if (role === 'primary' || role === 'secondary' || role === 'tiebreaker') {
      group[role] = config;
    }
  }

  const result: JudgeConfigsByLanguage[] = [];
  for (const [language, judges] of groupedByLanguage.entries()) {
    if (judges.primary && judges.secondary && judges.tiebreaker) {
      result.push({
        language,
        primary: mapJudgeConfigRow(judges.primary, DEFAULT_JUDGE_WEIGHTS.primary),
        secondary: mapJudgeConfigRow(judges.secondary, DEFAULT_JUDGE_WEIGHTS.secondary),
        tiebreaker: mapJudgeConfigRow(judges.tiebreaker, DEFAULT_JUDGE_WEIGHTS.tiebreaker),
      });
    }
  }

  return result;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate model ID and return model display name
 * @throws TRPCError with BAD_REQUEST if model not found
 */
async function validateModelIdAndGetName(modelId: string): Promise<string | undefined> {
  const { models } = await getOpenRouterModels();
  const model = models.find(m => m.id === modelId);

  if (!model) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Model "${modelId}" not found in OpenRouter catalog`,
    });
  }

  return model.name;
}

/**
 * Build the update object for a judge config from input
 */
function buildJudgeUpdates(
  input: UpdateJudgeConfigInput,
  newDisplayName?: string
): Record<string, unknown> {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.modelId !== undefined) {
    updates.model_id = input.modelId;
    if (newDisplayName) {
      updates.primary_display_name = newDisplayName;
    }
  }
  if (input.weight !== undefined) {
    updates.weight = input.weight;
  }
  if (input.temperature !== undefined) {
    updates.temperature = input.temperature;
  }
  if (input.maxTokens !== undefined) {
    updates.max_tokens = input.maxTokens;
  }
  if (input.isActive !== undefined) {
    updates.is_active = input.isActive;
  }

  return updates;
}

// =============================================================================
// Handler: listJudgeConfigs
// =============================================================================

/**
 * Handle the listJudgeConfigs query logic.
 * Fetches active judge configs and groups them by language.
 */
export async function handleListJudgeConfigs(
  input?: ListJudgeConfigsInput
): Promise<JudgeConfigsByLanguage[]> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('llm_model_config')
    .select('*')
    .eq('phase_name', 'stage_6_judge')
    .not('judge_role', 'is', null)
    .eq('is_active', true)
    .order('language')
    .order('judge_role');

  if (input?.language) {
    query = query.eq('language', input.language);
  }

  const { data, error } = await query;

  if (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to fetch judge configs: ${error.message}`,
    });
  }

  if (!data || data.length === 0) {
    return [];
  }

  return groupJudgesByLanguage(data as unknown as JudgeConfigRow[]);
}

// =============================================================================
// Handler: updateJudgeConfig
// =============================================================================

/**
 * Handle the updateJudgeConfig mutation logic.
 * Updates judge config in-place (no versioning for judges).
 */
export async function handleUpdateJudgeConfig(
  input: UpdateJudgeConfigInput,
  userId: string
): Promise<JudgeConfigOutput> {
  const supabase = getSupabaseAdmin();

  // 1. Get current config and validate it's a judge config
  const { data: currentConfig, error: fetchError } = await supabase
    .from('llm_model_config')
    .select('*')
    .eq('id', input.id)
    .single();

  if (fetchError || !currentConfig) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Judge configuration not found',
    });
  }

  if (currentConfig.phase_name !== 'stage_6_judge' || !currentConfig.judge_role) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'This configuration is not a judge model config',
    });
  }

  // 2. Validate new modelId and get display name (if changed)
  let newDisplayName: string | undefined;
  if (input.modelId && input.modelId !== currentConfig.model_id) {
    newDisplayName = await validateModelIdAndGetName(input.modelId);
  }

  // 3. Build and apply update
  const updates = buildJudgeUpdates(input, newDisplayName);

  const { data: updatedConfig, error: updateError } = await supabase
    .from('llm_model_config')
    .update(updates)
    .eq('id', input.id)
    .select('*')
    .single();

  if (updateError || !updatedConfig) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to update judge config: ${updateError?.message}`,
    });
  }

  // 4. Clear model config cache
  const { createModelConfigService } = await import('../../../shared/llm/model-config-service');
  createModelConfigService().clearCache();

  // 5. Log to audit
  await logPipelineAction(
    userId,
    'update_judge_config',
    'model_config',
    updatedConfig.id,
    {
      judgeRole: updatedConfig.judge_role,
      language: updatedConfig.language,
      oldModelId: currentConfig.model_id,
      newModelId: updatedConfig.model_id,
      oldWeight: currentConfig.weight,
      newWeight: updatedConfig.weight,
    },
    { failOnError: true }
  );

  logger.info(
    {
      userId,
      configId: updatedConfig.id,
      judgeRole: updatedConfig.judge_role,
      language: updatedConfig.language,
    },
    'Judge config updated'
  );

  return {
    id: updatedConfig.id,
    modelId: updatedConfig.model_id,
    displayName: updatedConfig.primary_display_name || updatedConfig.model_id,
    language: updatedConfig.language || 'any',
    judgeRole: updatedConfig.judge_role as 'primary' | 'secondary' | 'tiebreaker',
    weight: updatedConfig.weight || 0.75,
    temperature: updatedConfig.temperature || 0.3,
    maxTokens: updatedConfig.max_tokens || 4096,
    fallbackModelId: updatedConfig.fallback_model_id,
    isActive: updatedConfig.is_active,
  };
}
