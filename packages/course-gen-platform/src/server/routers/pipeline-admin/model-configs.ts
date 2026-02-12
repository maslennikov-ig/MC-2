/**
 * Model Configs Router
 * @module server/routers/pipeline-admin/model-configs
 *
 * Provides procedures for managing LLM model configurations.
 * All procedures require superadmin role.
 *
 * Handler logic is extracted to model-configs-helpers.ts to keep
 * this router file slim (procedure definitions + input schemas only).
 *
 * Procedures:
 * - listModelConfigs: Get all active model configurations
 * - updateModelConfig: Create a new version with updated values
 * - getModelConfigHistory: Get version history for a phase
 * - revertModelConfigToVersion: Revert to a specific version
 * - resetModelConfigToDefault: Reset to hardcoded default values
 * - listJudgeConfigs: Get judge configurations grouped by language
 * - updateJudgeConfig: Update a single judge configuration
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { superadminProcedure } from '../../procedures';
import type { PhaseName } from '@megacampus/shared-types';
import { phaseNameSchema } from '@megacampus/shared-types';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import {
  handleListModelConfigs,
  handleUpdateModelConfig,
  handleRevertModelConfigToVersion,
  handleResetModelConfigToDefault,
  handleListJudgeConfigs,
  handleUpdateJudgeConfig,
  withTrpcErrorHandling,
} from './model-configs-helpers';

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
   */
  listModelConfigs: superadminProcedure.query(async () => {
    return withTrpcErrorHandling('listModelConfigs', undefined, () => handleListModelConfigs());
  }),

  /**
   * Update model configuration (T026)
   *
   * Creates a new version with updated values.
   * Validates that modelId exists in OpenRouter cache before updating.
   * Deactivates current version and inserts new active version.
   *
   * Authorization: Superadmin only
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
      if (!ctx.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
      }
      return withTrpcErrorHandling('updateModelConfig', input, () =>
        handleUpdateModelConfig(input, ctx.user!.id)
      );
    }),

  /**
   * Get model config history for a phase (T027)
   *
   * Retrieves all versions for a specific phase, ordered by version DESC.
   * Shows complete version history including deactivated configs.
   *
   * Authorization: Superadmin only
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
      return withTrpcErrorHandling('getModelConfigHistory', input, async () => {
        const supabase = getSupabaseAdmin();

        let query = supabase
          .from('llm_model_config')
          .select(
            'id, version, model_id, fallback_model_id, temperature, max_tokens, created_at, created_by, users:created_by(email)'
          )
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

        return (data || []).map(item => ({
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
      });
    }),

  /**
   * Revert model config to specific version (T028)
   *
   * Deactivates current active config and creates a new version
   * by copying settings from the target version.
   *
   * Authorization: Superadmin only
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
      if (!ctx.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
      }
      return withTrpcErrorHandling('revertModelConfigToVersion', input, () =>
        handleRevertModelConfigToVersion(
          { ...input, phaseName: input.phaseName as PhaseName },
          ctx.user!.id
        )
      );
    }),

  /**
   * Reset model config to hardcoded default (T029)
   *
   * Deactivates current config and inserts hardcoded default as new version.
   * Uses DEFAULT_MODEL_CONFIGS constant.
   *
   * Authorization: Superadmin only
   */
  resetModelConfigToDefault: superadminProcedure
    .input(
      z.object({
        phaseName: phaseNameSchema,
        expectedCurrentVersion: z.number().int().positive().optional(), // Optimistic locking
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
      }
      return withTrpcErrorHandling('resetModelConfigToDefault', input, () =>
        handleResetModelConfigToDefault(
          { ...input, phaseName: input.phaseName as PhaseName },
          ctx.user!.id
        )
      );
    }),

  /**
   * List judge configurations (T030)
   *
   * Returns active judge model configurations for CLEV voting system.
   * Judges are grouped by language (ru, en, any) with primary/secondary/tiebreaker roles.
   *
   * Authorization: Superadmin only
   */
  listJudgeConfigs: superadminProcedure
    .input(
      z
        .object({
          language: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      return withTrpcErrorHandling('listJudgeConfigs', input, () =>
        handleListJudgeConfigs(input ?? undefined)
      );
    }),

  /**
   * Update judge configuration (T031)
   *
   * Updates a single judge model configuration.
   * Validates that modelId exists in OpenRouter cache if changed.
   * Clears model config cache after successful update.
   *
   * Authorization: Superadmin only
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
      if (!ctx.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
      }
      return withTrpcErrorHandling('updateJudgeConfig', input, () =>
        handleUpdateJudgeConfig(input, ctx.user!.id)
      );
    }),
});
