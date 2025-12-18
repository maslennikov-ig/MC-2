/**
 * Model Configs Router
 * @module server/routers/pipeline-admin/model-configs
 *
 * Provides procedures for managing LLM model configurations.
 * All procedures require superadmin role.
 *
 * Procedures:
 * - listModelConfigs: Get all active model configurations
 * - updateModelConfig: Create a new version with updated values
 * - getModelConfigHistory: Get version history for a phase
 * - revertModelConfigToVersion: Revert to a specific version
 * - resetModelConfigToDefault: Reset to hardcoded default values
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { superadminProcedure } from '../../procedures';
import type { ModelConfigWithVersion, PhaseName } from '@megacampus/shared-types';
import { phaseNameSchema } from '@megacampus/shared-types';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { logPipelineAction } from '../../../services/pipeline-audit';
import { getOpenRouterModels } from '../../../services/openrouter-models';
import { DEFAULT_MODEL_CONFIGS } from './constants';
import { createModelConfigService } from '../../../shared/llm/model-config-service';

// =============================================================================
// Model Configs Router
// =============================================================================

export const modelConfigsRouter = router({
  /**
   * List all active model configurations (T025)
   *
   * Returns all active (is_active=true) model configurations.
   * Each config includes version info and creator email.
   *
   * Authorization: Superadmin only
   *
   * Output: Array of ModelConfigWithVersion objects
   *
   * @example
   * ```typescript
   * const configs = await trpc.pipelineAdmin.modelConfigs.listModelConfigs.query();
   * // [{ id: '...', phaseName: 'stage_4_classification', modelId: '...', version: 3, ... }]
   * ```
   */
  listModelConfigs: superadminProcedure.query(async (): Promise<ModelConfigWithVersion[]> => {
    try {
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

      return (data || []).map((config) => ({
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
        createdByEmail: (config.users as { email: string } | null)?.email || null,
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
      }));
    } catch (error: unknown) {
      if (error instanceof TRPCError) {
        throw error;
      }

      logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        'Unexpected error in listModelConfigs'
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to list model configurations',
      });
    }
  }),

  /**
   * Update model configuration (T026)
   *
   * Creates a new version with updated values.
   * Validates that modelId exists in OpenRouter cache before updating.
   * Deactivates current version and inserts new active version.
   *
   * Authorization: Superadmin only
   *
   * Input:
   * - id: Current config UUID
   * - modelId: New model ID (optional)
   * - fallbackModelId: New fallback model ID (optional)
   * - temperature: New temperature (optional)
   * - maxTokens: New max tokens (optional)
   * - courseId: For course-specific override (optional)
   *
   * Output: New ModelConfigWithVersion
   *
   * @example
   * ```typescript
   * const updated = await trpc.pipelineAdmin.modelConfigs.updateModelConfig.mutate({
   *   id: 'config-uuid',
   *   modelId: 'openai/gpt-4',
   *   temperature: 0.5,
   * });
   * ```
   */
  updateModelConfig: superadminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        modelId: z.string().optional(),
        fallbackModelId: z.string().nullable().optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().min(1).max(128000).optional(),
        courseId: z.string().uuid().nullable().optional(),
        expectedVersion: z.number().int().positive().optional(), // Optimistic locking
        // Per-stage settings (optional, null = use default)
        qualityThreshold: z.number().min(0).max(1).nullable().optional(),
        maxRetries: z.number().int().min(0).max(10).nullable().optional(),
        timeoutMs: z.number().int().min(1000).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
        }

        const supabase = getSupabaseAdmin();

        // 1. Get current config
        const { data: currentConfig, error: fetchError } = await supabase
          .from('llm_model_config')
          .select('*')
          .eq('id', input.id)
          .single();

        if (fetchError || !currentConfig) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Model configuration not found',
          });
        }

        // 2. Optimistic locking: check version
        if (input.expectedVersion !== undefined && currentConfig.version !== input.expectedVersion) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Configuration was modified by another user. Expected version ${input.expectedVersion}, but current version is ${currentConfig.version}. Please refresh and try again.`,
          });
        }

        // 3. Validate new modelId exists in OpenRouter cache (if changed)
        if (input.modelId && input.modelId !== currentConfig.model_id) {
          const { models } = await getOpenRouterModels();
          const modelExists = models.some((m) => m.id === input.modelId);

          if (!modelExists) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Model "${input.modelId}" not found in OpenRouter catalog`,
            });
          }
        }

        // 4. Deactivate current version
        const { error: deactivateError } = await supabase
          .from('llm_model_config')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', input.id);

        if (deactivateError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to deactivate current config: ${deactivateError.message}`,
          });
        }

        // 5. Insert new version with incremented version number
        const newVersion = currentConfig.version + 1;
        const newConfig = {
          config_type: currentConfig.config_type,
          phase_name: currentConfig.phase_name,
          course_id: input.courseId !== undefined ? input.courseId : currentConfig.course_id,
          model_id: input.modelId || currentConfig.model_id,
          fallback_model_id:
            input.fallbackModelId !== undefined ? input.fallbackModelId : currentConfig.fallback_model_id,
          temperature: input.temperature !== undefined ? input.temperature : currentConfig.temperature,
          max_tokens: input.maxTokens !== undefined ? input.maxTokens : currentConfig.max_tokens,
          version: newVersion,
          is_active: true,
          created_by: ctx.user.id,
          // Preserve Wave 1 fields from current config
          stage_number: currentConfig.stage_number,
          language: currentConfig.language,
          context_tier: currentConfig.context_tier,
          max_context_tokens: currentConfig.max_context_tokens,
          threshold_tokens: currentConfig.threshold_tokens,
          cache_read_enabled: currentConfig.cache_read_enabled,
          primary_display_name: currentConfig.primary_display_name,
          fallback_display_name: currentConfig.fallback_display_name,
          // CLEV Judge fields (only for judge configs)
          judge_role: currentConfig.judge_role,
          weight: currentConfig.weight,
          // Per-stage settings (update if provided, otherwise preserve)
          quality_threshold:
            input.qualityThreshold !== undefined ? input.qualityThreshold : currentConfig.quality_threshold,
          max_retries: input.maxRetries !== undefined ? input.maxRetries : currentConfig.max_retries,
          timeout_ms: input.timeoutMs !== undefined ? input.timeoutMs : currentConfig.timeout_ms,
        };

        const { data: insertedConfig, error: insertError } = await supabase
          .from('llm_model_config')
          .insert(newConfig)
          .select('*, users:created_by(email)')
          .single();

        if (insertError || !insertedConfig) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to insert new config version: ${insertError?.message}`,
          });
        }

        // 6. Log to audit
        await logPipelineAction(
          ctx.user.id,
          'update_model_config',
          'model_config',
          insertedConfig.id,
          {
            phaseName: currentConfig.phase_name,
            oldVersion: currentConfig.version,
            newVersion,
            oldModelId: currentConfig.model_id,
            newModelId: insertedConfig.model_id,
          },
          { failOnError: true }
        );

        logger.info(
          {
            userId: ctx.user.id,
            configId: insertedConfig.id,
            phaseName: insertedConfig.phase_name,
            version: newVersion,
          },
          'Model config updated'
        );

        // Invalidate cache to ensure per-stage config changes take effect immediately
        let cacheCleared = true;

        try {
          const modelConfigService = createModelConfigService();
          modelConfigService.clearCache();
          logger.debug({ phaseName: insertedConfig.phase_name }, 'Model config cache cleared after update');
        } catch (cacheErr) {
          // Non-blocking - cache will eventually expire naturally (5 min TTL)
          logger.warn({ cacheErr, phaseName: insertedConfig.phase_name }, 'Failed to clear model config cache after update');
          cacheCleared = false;
        }

        // Return formatted response
        return {
          id: insertedConfig.id,
          configType: insertedConfig.config_type,
          phaseName: insertedConfig.phase_name as PhaseName,
          courseId: insertedConfig.course_id,
          modelId: insertedConfig.model_id,
          fallbackModelId: insertedConfig.fallback_model_id,
          temperature: insertedConfig.temperature,
          maxTokens: insertedConfig.max_tokens,
          version: insertedConfig.version,
          isActive: insertedConfig.is_active,
          createdAt: insertedConfig.created_at,
          updatedAt: insertedConfig.updated_at,
          createdBy: insertedConfig.created_by,
          createdByEmail: (insertedConfig.users as { email: string } | null)?.email || null,
          // Wave 1 fields
          stageNumber: insertedConfig.stage_number,
          language: insertedConfig.language,
          contextTier: insertedConfig.context_tier,
          maxContextTokens: insertedConfig.max_context_tokens,
          thresholdTokens: insertedConfig.threshold_tokens,
          cacheReadEnabled: insertedConfig.cache_read_enabled,
          primaryDisplayName: insertedConfig.primary_display_name,
          fallbackDisplayName: insertedConfig.fallback_display_name,
          // CLEV Judge fields
          judgeRole: insertedConfig.judge_role as 'primary' | 'secondary' | 'tiebreaker' | null,
          weight: insertedConfig.weight,
          // Per-stage settings
          qualityThreshold: insertedConfig.quality_threshold,
          maxRetries: insertedConfig.max_retries,
          timeoutMs: insertedConfig.timeout_ms,
          // Cache invalidation status
          cacheCleared,
        };
      } catch (error: unknown) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in updateModelConfig'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update model configuration',
        });
      }
    }),

  /**
   * Get model config history for a phase (T027)
   *
   * Retrieves all versions for a specific phase, ordered by version DESC.
   * Shows complete version history including deactivated configs.
   *
   * Authorization: Superadmin only
   *
   * Input:
   * - phaseName: Phase identifier
   * - configType: 'global' or 'course_override' (default: 'global')
   * - courseId: Required if configType = 'course_override'
   *
   * Output: Array of ModelConfigHistoryItem objects
   *
   * @example
   * ```typescript
   * const history = await trpc.pipelineAdmin.modelConfigs.getModelConfigHistory.query({
   *   phaseName: 'stage_4_classification',
   *   configType: 'global',
   * });
   * // [{ version: 3, modelId: '...', createdAt: '...', createdByEmail: '...' }, ...]
   * ```
   */
  getModelConfigHistory: superadminProcedure
    .input(
      z.object({
        phaseName: phaseNameSchema,
        configType: z.enum(['global', 'course_override']).default('global'),
        courseId: z.string().uuid().nullable().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const supabase = getSupabaseAdmin();

        let query = supabase
          .from('llm_model_config')
          .select('id, version, model_id, fallback_model_id, temperature, max_tokens, created_at, created_by, users:created_by(email)')
          .eq('phase_name', input.phaseName)
          .eq('config_type', input.configType)
          .order('version', { ascending: false });

        // Add course_id filter
        if (input.configType === 'course_override' && input.courseId) {
          query = query.eq('course_id', input.courseId);
        } else if (input.configType === 'global') {
          query = query.is('course_id', null);
        }

        const { data, error } = await query;

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch config history: ${error.message}`,
          });
        }

        return (data || []).map((item) => ({
          id: item.id,
          version: item.version,
          modelId: item.model_id,
          fallbackModelId: item.fallback_model_id,
          temperature: item.temperature,
          maxTokens: item.max_tokens,
          createdAt: item.created_at,
          createdBy: item.created_by,
          createdByEmail: (item.users as { email: string } | null)?.email || null,
        }));
      } catch (error: unknown) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in getModelConfigHistory'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch model config history',
        });
      }
    }),

  /**
   * Revert model config to specific version (T028)
   *
   * Deactivates current active config and creates a new version
   * by copying settings from the target version.
   *
   * Authorization: Superadmin only
   *
   * Input:
   * - phaseName: Phase identifier
   * - targetVersion: Version number to revert to
   *
   * Output: New active ModelConfigWithVersion
   *
   * @example
   * ```typescript
   * const reverted = await trpc.pipelineAdmin.modelConfigs.revertModelConfigToVersion.mutate({
   *   phaseName: 'stage_4_classification',
   *   targetVersion: 2,
   * });
   * ```
   */
  revertModelConfigToVersion: superadminProcedure
    .input(
      z.object({
        phaseName: phaseNameSchema,
        targetVersion: z.number().int().positive(),
        expectedCurrentVersion: z.number().int().positive().optional(), // Optimistic locking
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
        }

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

        if (fetchError || !targetConfig) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Version ${input.targetVersion} not found for phase ${input.phaseName}`,
          });
        }

        // 2. Get current active config to deactivate
        const { data: currentActive, error: currentError } = await supabase
          .from('llm_model_config')
          .select('id, version')
          .eq('phase_name', input.phaseName)
          .eq('config_type', 'global')
          .is('course_id', null)
          .eq('is_active', true)
          .single();

        if (currentError || !currentActive) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No active config found to deactivate',
          });
        }

        // 3. Optimistic locking: check current version
        if (input.expectedCurrentVersion !== undefined && currentActive.version !== input.expectedCurrentVersion) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Configuration was modified by another user. Expected version ${input.expectedCurrentVersion}, but current version is ${currentActive.version}. Please refresh and try again.`,
          });
        }

        // 4. Deactivate current active
        const { error: deactivateError } = await supabase
          .from('llm_model_config')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', currentActive.id);

        if (deactivateError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to deactivate current config: ${deactivateError.message}`,
          });
        }

        // 5. Insert copy of target as new version (is_active=true)
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
          created_by: ctx.user.id,
          // Preserve Wave 1 fields from target config
          stage_number: targetConfig.stage_number,
          language: targetConfig.language,
          context_tier: targetConfig.context_tier,
          max_context_tokens: targetConfig.max_context_tokens,
          threshold_tokens: targetConfig.threshold_tokens,
          cache_read_enabled: targetConfig.cache_read_enabled,
          primary_display_name: targetConfig.primary_display_name,
          fallback_display_name: targetConfig.fallback_display_name,
          // CLEV Judge fields
          judge_role: targetConfig.judge_role,
          weight: targetConfig.weight,
        };

        const { data: insertedConfig, error: insertError } = await supabase
          .from('llm_model_config')
          .insert(newConfig)
          .select('*, users:created_by(email)')
          .single();

        if (insertError || !insertedConfig) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to insert reverted config: ${insertError?.message}`,
          });
        }

        // 6. Audit log
        await logPipelineAction(ctx.user.id, 'update_model_config', 'model_config', insertedConfig.id, {
          action: 'revert',
          phaseName: input.phaseName,
          targetVersion: input.targetVersion,
          newVersion,
        }, { failOnError: true });

        logger.info(
          {
            userId: ctx.user.id,
            phaseName: input.phaseName,
            targetVersion: input.targetVersion,
            newVersion,
          },
          'Model config reverted to version'
        );

        return {
          id: insertedConfig.id,
          configType: insertedConfig.config_type,
          phaseName: insertedConfig.phase_name as PhaseName,
          courseId: insertedConfig.course_id,
          modelId: insertedConfig.model_id,
          fallbackModelId: insertedConfig.fallback_model_id,
          temperature: insertedConfig.temperature,
          maxTokens: insertedConfig.max_tokens,
          version: insertedConfig.version,
          isActive: insertedConfig.is_active,
          createdAt: insertedConfig.created_at,
          updatedAt: insertedConfig.updated_at,
          createdBy: insertedConfig.created_by,
          createdByEmail: (insertedConfig.users as { email: string } | null)?.email || null,
        };
      } catch (error: unknown) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in revertModelConfigToVersion'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to revert model configuration',
        });
      }
    }),

  /**
   * Reset model config to hardcoded default (T029)
   *
   * Deactivates current config and inserts hardcoded default as new version.
   * Uses DEFAULT_MODEL_CONFIGS constant.
   *
   * Authorization: Superadmin only
   *
   * Input:
   * - phaseName: Phase identifier
   *
   * Output: New active ModelConfigWithVersion
   *
   * @example
   * ```typescript
   * const reset = await trpc.pipelineAdmin.modelConfigs.resetModelConfigToDefault.mutate({
   *   phaseName: 'stage_4_classification',
   * });
   * ```
   */
  resetModelConfigToDefault: superadminProcedure
    .input(
      z.object({
        phaseName: phaseNameSchema,
        expectedCurrentVersion: z.number().int().positive().optional(), // Optimistic locking
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
        }

        const supabase = getSupabaseAdmin();

        // Get hardcoded default for phase
        const defaultConfig = DEFAULT_MODEL_CONFIGS[input.phaseName];
        if (!defaultConfig) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `No default configuration found for phase ${input.phaseName}`,
          });
        }

        // Get current active to find next version
        const { data: currentActive } = await supabase
          .from('llm_model_config')
          .select('id, version')
          .eq('phase_name', input.phaseName)
          .eq('config_type', 'global')
          .is('course_id', null)
          .eq('is_active', true)
          .maybeSingle();

        // Optimistic locking: check current version if provided
        if (input.expectedCurrentVersion !== undefined && currentActive && currentActive.version !== input.expectedCurrentVersion) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Configuration was modified by another user. Expected version ${input.expectedCurrentVersion}, but current version is ${currentActive.version}. Please refresh and try again.`,
          });
        }

        // If no active config exists, start at version 1
        const nextVersion = currentActive ? currentActive.version + 1 : 1;

        // Deactivate current if exists
        if (currentActive) {
          const { error: deactivateError } = await supabase
            .from('llm_model_config')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', currentActive.id);

          if (deactivateError) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: `Failed to deactivate current config: ${deactivateError.message}`,
            });
          }
        }

        // Insert default as new version
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
          created_by: ctx.user.id,
        };

        const { data: insertedConfig, error: insertError } = await supabase
          .from('llm_model_config')
          .insert(newConfig)
          .select('*, users:created_by(email)')
          .single();

        if (insertError || !insertedConfig) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to insert default config: ${insertError?.message}`,
          });
        }

        // Audit log
        await logPipelineAction(ctx.user.id, 'update_model_config', 'model_config', insertedConfig.id, {
          action: 'reset_to_default',
          phaseName: input.phaseName,
          newVersion: nextVersion,
        }, { failOnError: true });

        logger.info(
          {
            userId: ctx.user.id,
            phaseName: input.phaseName,
            newVersion: nextVersion,
          },
          'Model config reset to default'
        );

        return {
          id: insertedConfig.id,
          configType: insertedConfig.config_type,
          phaseName: insertedConfig.phase_name as PhaseName,
          courseId: insertedConfig.course_id,
          modelId: insertedConfig.model_id,
          fallbackModelId: insertedConfig.fallback_model_id,
          temperature: insertedConfig.temperature,
          maxTokens: insertedConfig.max_tokens,
          version: insertedConfig.version,
          isActive: insertedConfig.is_active,
          createdAt: insertedConfig.created_at,
          updatedAt: insertedConfig.updated_at,
          createdBy: insertedConfig.created_by,
          createdByEmail: (insertedConfig.users as { email: string } | null)?.email || null,
        };
      } catch (error: unknown) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in resetModelConfigToDefault'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reset model configuration',
        });
      }
    }),

  /**
   * List judge configurations (T030)
   *
   * Returns active judge model configurations for CLEV voting system.
   * Judges are grouped by language (ru, en, any) with primary/secondary/tiebreaker roles.
   * Optionally filter by language.
   *
   * Authorization: Superadmin only
   *
   * Input:
   * - language: Optional language filter ('ru', 'en', 'any')
   *
   * Output: Array of JudgeConfigsByLanguage objects
   *
   * @example
   * ```typescript
   * const judges = await trpc.pipelineAdmin.modelConfigs.listJudgeConfigs.query({ language: 'ru' });
   * // [{ language: 'ru', primary: {...}, secondary: {...}, tiebreaker: {...} }]
   * ```
   */
  listJudgeConfigs: superadminProcedure
    .input(
      z.object({
        language: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      try {
        const supabase = getSupabaseAdmin();

        // Build query for judge configs
        let query = supabase
          .from('llm_model_config')
          .select('*')
          .eq('phase_name', 'stage_6_judge')
          .not('judge_role', 'is', null)
          .eq('is_active', true)
          .order('language')
          .order('judge_role');

        // Apply language filter if provided
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

        // Group judges by language
        const groupedByLanguage = new Map<string, {
          primary?: typeof data[0];
          secondary?: typeof data[0];
          tiebreaker?: typeof data[0];
        }>();

        for (const config of data) {
          const lang = config.language || 'any';
          if (!groupedByLanguage.has(lang)) {
            groupedByLanguage.set(lang, {});
          }
          const group = groupedByLanguage.get(lang)!;

          if (config.judge_role === 'primary') {
            group.primary = config;
          } else if (config.judge_role === 'secondary') {
            group.secondary = config;
          } else if (config.judge_role === 'tiebreaker') {
            group.tiebreaker = config;
          }
        }

        // Convert to output format
        const result = [];
        for (const [language, judges] of groupedByLanguage.entries()) {
          // Only include if all three judges are present
          if (judges.primary && judges.secondary && judges.tiebreaker) {
            result.push({
              language,
              primary: {
                id: judges.primary.id,
                modelId: judges.primary.model_id,
                displayName: judges.primary.primary_display_name || judges.primary.model_id,
                language: judges.primary.language || 'any',
                judgeRole: 'primary' as const,
                weight: judges.primary.weight || 0.75,
                temperature: judges.primary.temperature || 0.3,
                maxTokens: judges.primary.max_tokens || 4096,
                fallbackModelId: judges.primary.fallback_model_id,
                isActive: judges.primary.is_active,
              },
              secondary: {
                id: judges.secondary.id,
                modelId: judges.secondary.model_id,
                displayName: judges.secondary.primary_display_name || judges.secondary.model_id,
                language: judges.secondary.language || 'any',
                judgeRole: 'secondary' as const,
                weight: judges.secondary.weight || 0.73,
                temperature: judges.secondary.temperature || 0.3,
                maxTokens: judges.secondary.max_tokens || 4096,
                fallbackModelId: judges.secondary.fallback_model_id,
                isActive: judges.secondary.is_active,
              },
              tiebreaker: {
                id: judges.tiebreaker.id,
                modelId: judges.tiebreaker.model_id,
                displayName: judges.tiebreaker.primary_display_name || judges.tiebreaker.model_id,
                language: judges.tiebreaker.language || 'any',
                judgeRole: 'tiebreaker' as const,
                weight: judges.tiebreaker.weight || 0.72,
                temperature: judges.tiebreaker.temperature || 0.3,
                maxTokens: judges.tiebreaker.max_tokens || 4096,
                fallbackModelId: judges.tiebreaker.fallback_model_id,
                isActive: judges.tiebreaker.is_active,
              },
            });
          }
        }

        return result;
      } catch (error: unknown) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in listJudgeConfigs'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list judge configurations',
        });
      }
    }),

  /**
   * Update judge configuration (T031)
   *
   * Updates a single judge model configuration.
   * Validates that modelId exists in OpenRouter cache if changed.
   * Clears model config cache after successful update.
   *
   * Authorization: Superadmin only
   *
   * Input:
   * - id: Judge config UUID
   * - modelId: New model ID (optional)
   * - weight: New weight value 0-1 (optional)
   * - temperature: New temperature (optional)
   * - maxTokens: New max tokens (optional)
   * - isActive: Enable/disable judge (optional)
   *
   * Output: Updated judge config
   *
   * @example
   * ```typescript
   * const updated = await trpc.pipelineAdmin.modelConfigs.updateJudgeConfig.mutate({
   *   id: 'judge-uuid',
   *   weight: 0.76,
   *   temperature: 0.2,
   * });
   * ```
   */
  updateJudgeConfig: superadminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        modelId: z.string().optional(),
        weight: z.number().min(0).max(1).optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().positive().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
        }

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

        // Validate this is actually a judge config
        if (currentConfig.phase_name !== 'stage_6_judge' || !currentConfig.judge_role) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'This configuration is not a judge model config',
          });
        }

        // 2. Validate new modelId exists in OpenRouter cache and get display name (if changed)
        let newDisplayName: string | undefined;
        if (input.modelId && input.modelId !== currentConfig.model_id) {
          const { models } = await getOpenRouterModels();
          const model = models.find((m) => m.id === input.modelId);

          if (!model) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Model "${input.modelId}" not found in OpenRouter catalog`,
            });
          }
          // Extract display name from model
          newDisplayName = model.name;
        }

        // 3. Build update object
        const updates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (input.modelId !== undefined) {
          updates.model_id = input.modelId;
          // Also update display name when model changes
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

        // 4. Update the config (in-place, no versioning for judges)
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

        // 5. Clear model config cache to ensure changes take effect immediately
        const { createModelConfigService } = await import('../../../shared/llm/model-config-service');
        createModelConfigService().clearCache();

        // 6. Log to audit
        await logPipelineAction(
          ctx.user.id,
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
            userId: ctx.user.id,
            configId: updatedConfig.id,
            judgeRole: updatedConfig.judge_role,
            language: updatedConfig.language,
          },
          'Judge config updated'
        );

        // Return formatted response
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
      } catch (error: unknown) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in updateJudgeConfig'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update judge configuration',
        });
      }
    }),
});
