/**
 * Refinement Configs Router
 * @module server/routers/pipeline-admin/refinement-configs
 *
 * Provides procedures for managing Stage 6 targeted refinement configurations.
 * All procedures require superadmin role.
 *
 * Procedures:
 * - listRefinementConfigs: Get all active refinement configurations
 * - updateRefinementConfig: Create a new version with updated values
 * - getRefinementConfigHistory: Get version history for an operation mode
 * - revertRefinementConfigToVersion: Revert to a specific version
 * - resetRefinementConfigToDefault: Reset to hardcoded default values
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { superadminProcedure } from '../../procedures';
import type { RefinementConfigDb, OperationMode, Json } from '@megacampus/shared-types';
import { operationModeSchema, refinementConfigUpdateSchema, REFINEMENT_CONFIG } from '@megacampus/shared-types';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { logPipelineAction } from '../../../services/pipeline-audit';

// Table name constant (created by migration 20251211140000_add_refinement_config_table)
const REFINEMENT_CONFIG_TABLE = 'refinement_config' as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Map database row to RefinementConfigDb type
 */
function mapDbRowToConfig(row: Record<string, unknown>): RefinementConfigDb {
  return {
    id: row.id as string,
    configType: row.config_type as 'global' | 'course_override',
    courseId: row.course_id as string | null,
    operationMode: row.operation_mode as OperationMode,

    // Mode-specific thresholds
    acceptThreshold: Number(row.accept_threshold),
    goodEnoughThreshold: Number(row.good_enough_threshold),
    onMaxIterations: row.on_max_iterations as 'escalate' | 'best_effort',
    escalationEnabled: row.escalation_enabled as boolean,

    // Hard limits
    maxIterations: row.max_iterations as number,
    maxTokens: row.max_tokens as number,
    timeoutMs: row.timeout_ms as number,

    // Quality control
    regressionTolerance: Number(row.regression_tolerance),
    sectionLockAfterEdits: row.section_lock_after_edits as number,
    convergenceThreshold: Number(row.convergence_threshold),

    // Parallel execution
    maxConcurrentPatchers: row.max_concurrent_patchers as number,
    adjacentSectionGap: row.adjacent_section_gap as number,
    sequentialForRegenerations: row.sequential_for_regenerations as boolean,

    // Krippendorff's Alpha thresholds
    krippendorffHighAgreement: Number(row.krippendorff_high_agreement),
    krippendorffModerateAgreement: Number(row.krippendorff_moderate_agreement),

    // JSONB fields
    tokenCosts: row.token_costs as RefinementConfigDb['tokenCosts'],
    readability: row.readability as RefinementConfigDb['readability'],

    // Versioning
    version: row.version as number,
    isActive: row.is_active as boolean,

    // Audit
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    createdBy: row.created_by as string | null,
    createdByEmail: (row.users as { email: string } | null)?.email || null,
  };
}

/**
 * Get default config for an operation mode from REFINEMENT_CONFIG constant
 */
function getDefaultConfig(operationMode: OperationMode): Partial<RefinementConfigDb> {
  const modeConfig = REFINEMENT_CONFIG.modes[operationMode];

  return {
    operationMode,
    acceptThreshold: modeConfig.acceptThreshold,
    goodEnoughThreshold: modeConfig.goodEnoughThreshold,
    onMaxIterations: modeConfig.onMaxIterations,
    escalationEnabled: modeConfig.escalationEnabled,

    maxIterations: REFINEMENT_CONFIG.limits.maxIterations,
    maxTokens: REFINEMENT_CONFIG.limits.maxTokens,
    timeoutMs: REFINEMENT_CONFIG.limits.timeoutMs,

    regressionTolerance: REFINEMENT_CONFIG.quality.regressionTolerance,
    sectionLockAfterEdits: REFINEMENT_CONFIG.quality.sectionLockAfterEdits,
    convergenceThreshold: REFINEMENT_CONFIG.quality.convergenceThreshold,

    maxConcurrentPatchers: REFINEMENT_CONFIG.parallel.maxConcurrentPatchers,
    adjacentSectionGap: REFINEMENT_CONFIG.parallel.adjacentSectionGap,
    sequentialForRegenerations: REFINEMENT_CONFIG.parallel.sequentialForRegenerations,

    krippendorffHighAgreement: REFINEMENT_CONFIG.krippendorff.highAgreement,
    krippendorffModerateAgreement: REFINEMENT_CONFIG.krippendorff.moderateAgreement,

    tokenCosts: { ...REFINEMENT_CONFIG.tokenCosts },
    readability: { ...REFINEMENT_CONFIG.readability },
  };
}

// =============================================================================
// Refinement Configs Router
// =============================================================================

export const refinementConfigsRouter = router({
  /**
   * List all active refinement configurations
   *
   * Returns all active (is_active=true) refinement configurations.
   * Each config includes version info and creator email.
   *
   * Authorization: Superadmin only
   *
   * Output: Array of RefinementConfigDb objects
   */
  listRefinementConfigs: superadminProcedure.query(async (): Promise<RefinementConfigDb[]> => {
    try {
      const supabase = getSupabaseAdmin();

      
      const { data, error } = await supabase
        .from(REFINEMENT_CONFIG_TABLE)
        .select('*, users:created_by(email)')
        .eq('is_active', true)
        .order('operation_mode');

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch refinement configs: ${error.message}`,
        });
      }

      return (data || []).map(mapDbRowToConfig);
    } catch (error: unknown) {
      if (error instanceof TRPCError) {
        throw error;
      }

      logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        'Unexpected error in listRefinementConfigs'
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to list refinement configurations',
      });
    }
  }),

  /**
   * Update refinement configuration
   *
   * Creates a new version with updated values.
   * Deactivates current version and inserts new active version.
   *
   * Authorization: Superadmin only
   */
  updateRefinementConfig: superadminProcedure
    .input(refinementConfigUpdateSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
        }

        const supabase = getSupabaseAdmin();

        // 1. Get current config (type cast needed until migration applied)
        const { data: currentConfig, error: fetchError } = await supabase
          .from(REFINEMENT_CONFIG_TABLE)
          .select('*')
          .eq('id', input.id)
          .single();

        if (fetchError || !currentConfig) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Refinement configuration not found',
          });
        }

        // 2. Optimistic locking: check version
        if (input.expectedVersion !== undefined && currentConfig.version !== input.expectedVersion) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Configuration was modified by another user. Expected version ${input.expectedVersion}, but current version is ${currentConfig.version}. Please refresh and try again.`,
          });
        }

        // 3. Deactivate current version
        const { error: deactivateError } = await supabase
          .from(REFINEMENT_CONFIG_TABLE)
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', input.id);

        if (deactivateError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to deactivate current config: ${deactivateError.message}`,
          });
        }

        // 4. Insert new version with incremented version number
        const newVersion = currentConfig.version + 1;
        const newConfig = {
          config_type: currentConfig.config_type,
          course_id: currentConfig.course_id,
          operation_mode: currentConfig.operation_mode,

          // Updated or preserved fields
          accept_threshold: input.acceptThreshold ?? currentConfig.accept_threshold,
          good_enough_threshold: input.goodEnoughThreshold ?? currentConfig.good_enough_threshold,
          on_max_iterations: input.onMaxIterations ?? currentConfig.on_max_iterations,
          escalation_enabled: input.escalationEnabled ?? currentConfig.escalation_enabled,

          max_iterations: input.maxIterations ?? currentConfig.max_iterations,
          max_tokens: input.maxTokens ?? currentConfig.max_tokens,
          timeout_ms: input.timeoutMs ?? currentConfig.timeout_ms,

          regression_tolerance: input.regressionTolerance ?? currentConfig.regression_tolerance,
          section_lock_after_edits: input.sectionLockAfterEdits ?? currentConfig.section_lock_after_edits,
          convergence_threshold: input.convergenceThreshold ?? currentConfig.convergence_threshold,

          max_concurrent_patchers: input.maxConcurrentPatchers ?? currentConfig.max_concurrent_patchers,
          adjacent_section_gap: input.adjacentSectionGap ?? currentConfig.adjacent_section_gap,
          sequential_for_regenerations: input.sequentialForRegenerations ?? currentConfig.sequential_for_regenerations,

          krippendorff_high_agreement: input.krippendorffHighAgreement ?? currentConfig.krippendorff_high_agreement,
          krippendorff_moderate_agreement: input.krippendorffModerateAgreement ?? currentConfig.krippendorff_moderate_agreement,

          token_costs: currentConfig.token_costs,
          readability: currentConfig.readability,

          version: newVersion,
          is_active: true,
          created_by: ctx.user.id,
        };

        const { data: insertedConfig, error: insertError } = await supabase
          .from(REFINEMENT_CONFIG_TABLE)
          .insert(newConfig)
          .select('*, users:created_by(email)')
          .single();

        if (insertError || !insertedConfig) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to insert new config version: ${insertError?.message}`,
          });
        }

        // 5. Log to audit
        await logPipelineAction(
          ctx.user.id,
          'update_refinement_config',
          'refinement_config',
          insertedConfig.id,
          {
            operationMode: currentConfig.operation_mode,
            oldVersion: currentConfig.version,
            newVersion,
            changes: Object.keys(input).filter((k) => k !== 'id' && k !== 'expectedVersion'),
          },
          { failOnError: true }
        );

        logger.info(
          {
            userId: ctx.user.id,
            configId: insertedConfig.id,
            operationMode: insertedConfig.operation_mode,
            version: newVersion,
          },
          'Refinement config updated'
        );

        return mapDbRowToConfig(insertedConfig);
      } catch (error: unknown) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in updateRefinementConfig'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update refinement configuration',
        });
      }
    }),

  /**
   * Get refinement config history for an operation mode
   *
   * Retrieves all versions for a specific operation mode, ordered by version DESC.
   */
  getRefinementConfigHistory: superadminProcedure
    .input(
      z.object({
        operationMode: operationModeSchema,
        configType: z.enum(['global', 'course_override']).default('global'),
        courseId: z.string().uuid().nullable().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const supabase = getSupabaseAdmin();

        // Type cast needed until migration is applied and types regenerated
        let query = supabase
          .from(REFINEMENT_CONFIG_TABLE)
          .select('id, version, accept_threshold, good_enough_threshold, max_iterations, created_at, created_by, users:created_by(email)')
          .eq('operation_mode', input.operationMode)
          .eq('config_type', input.configType)
          .order('version', { ascending: false });

        if (input.configType === 'course_override' && input.courseId) {
          query = query.eq('course_id', input.courseId);
        } else if (input.configType === 'global') {
          query = query.is('course_id', null);
        }

        const { data, error } = await query as { data: any[] | null; error: any };

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch config history: ${error.message}`,
          });
        }

        return (data || []).map((item) => ({
          id: item.id,
          version: item.version,
          acceptThreshold: Number(item.accept_threshold),
          goodEnoughThreshold: Number(item.good_enough_threshold),
          maxIterations: item.max_iterations,
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
          'Unexpected error in getRefinementConfigHistory'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch refinement config history',
        });
      }
    }),

  /**
   * Revert refinement config to specific version
   */
  revertRefinementConfigToVersion: superadminProcedure
    .input(
      z.object({
        operationMode: operationModeSchema,
        targetVersion: z.number().int().positive(),
        expectedCurrentVersion: z.number().int().positive().optional(),
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
          .from(REFINEMENT_CONFIG_TABLE)
          .select('*')
          .eq('operation_mode', input.operationMode)
          .eq('config_type', 'global')
          .is('course_id', null)
          .eq('version', input.targetVersion)
          .single();

        if (fetchError || !targetConfig) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Version ${input.targetVersion} not found for mode ${input.operationMode}`,
          });
        }

        // 2. Get current active config
        const { data: currentActive, error: currentError } = await supabase
          .from(REFINEMENT_CONFIG_TABLE)
          .select('id, version')
          .eq('operation_mode', input.operationMode)
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

        // 3. Optimistic locking
        if (input.expectedCurrentVersion !== undefined && currentActive.version !== input.expectedCurrentVersion) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Configuration was modified. Expected version ${input.expectedCurrentVersion}, but current is ${currentActive.version}.`,
          });
        }

        // 4. Deactivate current
        await supabase
          .from(REFINEMENT_CONFIG_TABLE)
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', currentActive.id);

        // 5. Insert copy of target as new version
        const newVersion = currentActive.version + 1;
        const { id: _id, created_at: _ca, updated_at: _ua, created_by: _cb, ...targetFields } = targetConfig;

        const { data: insertedConfig, error: insertError } = await supabase
          .from(REFINEMENT_CONFIG_TABLE)
          .insert({
            ...targetFields,
            version: newVersion,
            is_active: true,
            created_by: ctx.user.id,
          })
          .select('*, users:created_by(email)')
          .single();

        if (insertError || !insertedConfig) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to insert reverted config: ${insertError?.message}`,
          });
        }

        await logPipelineAction(ctx.user.id, 'update_refinement_config', 'refinement_config', insertedConfig.id, {
          action: 'revert',
          operationMode: input.operationMode,
          targetVersion: input.targetVersion,
          newVersion,
        }, { failOnError: true });

        logger.info(
          {
            userId: ctx.user.id,
            operationMode: input.operationMode,
            targetVersion: input.targetVersion,
            newVersion,
          },
          'Refinement config reverted to version'
        );

        return mapDbRowToConfig(insertedConfig);
      } catch (error: unknown) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in revertRefinementConfigToVersion'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to revert refinement configuration',
        });
      }
    }),

  /**
   * Reset refinement config to hardcoded default
   */
  resetRefinementConfigToDefault: superadminProcedure
    .input(
      z.object({
        operationMode: operationModeSchema,
        expectedCurrentVersion: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
        }

        const supabase = getSupabaseAdmin();

        // Get hardcoded default for mode
        const defaultConfig = getDefaultConfig(input.operationMode);

        // Get current active
        const { data: currentActive } = await supabase
          .from(REFINEMENT_CONFIG_TABLE)
          .select('id, version')
          .eq('operation_mode', input.operationMode)
          .eq('config_type', 'global')
          .is('course_id', null)
          .eq('is_active', true)
          .maybeSingle();

        // Optimistic locking
        if (input.expectedCurrentVersion !== undefined && currentActive && currentActive.version !== input.expectedCurrentVersion) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Configuration was modified. Expected version ${input.expectedCurrentVersion}, but current is ${currentActive.version}.`,
          });
        }

        const nextVersion = currentActive ? currentActive.version + 1 : 1;

        // Deactivate current if exists
        if (currentActive) {
          await supabase
            .from(REFINEMENT_CONFIG_TABLE)
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', currentActive.id);
        }

        // Insert default as new version
        const newConfig = {
          config_type: 'global',
          course_id: null,
          operation_mode: input.operationMode,
          accept_threshold: defaultConfig.acceptThreshold,
          good_enough_threshold: defaultConfig.goodEnoughThreshold,
          on_max_iterations: defaultConfig.onMaxIterations,
          escalation_enabled: defaultConfig.escalationEnabled,
          max_iterations: defaultConfig.maxIterations,
          max_tokens: defaultConfig.maxTokens,
          timeout_ms: defaultConfig.timeoutMs,
          regression_tolerance: defaultConfig.regressionTolerance,
          section_lock_after_edits: defaultConfig.sectionLockAfterEdits,
          convergence_threshold: defaultConfig.convergenceThreshold,
          max_concurrent_patchers: defaultConfig.maxConcurrentPatchers,
          adjacent_section_gap: defaultConfig.adjacentSectionGap,
          sequential_for_regenerations: defaultConfig.sequentialForRegenerations,
          krippendorff_high_agreement: defaultConfig.krippendorffHighAgreement,
          krippendorff_moderate_agreement: defaultConfig.krippendorffModerateAgreement,
          token_costs: defaultConfig.tokenCosts as unknown as Json,
          readability: defaultConfig.readability as unknown as Json,
          version: nextVersion,
          is_active: true,
          created_by: ctx.user.id,
        };

        const { data: insertedConfig, error: insertError } = await supabase
          .from(REFINEMENT_CONFIG_TABLE)
          .insert(newConfig)
          .select('*, users:created_by(email)')
          .single();

        if (insertError || !insertedConfig) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to insert default config: ${insertError?.message}`,
          });
        }

        await logPipelineAction(ctx.user.id, 'update_refinement_config', 'refinement_config', insertedConfig.id, {
          action: 'reset_to_default',
          operationMode: input.operationMode,
          newVersion: nextVersion,
        }, { failOnError: true });

        logger.info(
          {
            userId: ctx.user.id,
            operationMode: input.operationMode,
            newVersion: nextVersion,
          },
          'Refinement config reset to default'
        );

        return mapDbRowToConfig(insertedConfig);
      } catch (error: unknown) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in resetRefinementConfigToDefault'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reset refinement configuration',
        });
      }
    }),
});
