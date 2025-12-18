/**
 * Global Settings Router
 * @module server/routers/pipeline-admin/global-settings
 *
 * Provides superadmin-only procedures for managing pipeline global settings.
 * Extracted from pipeline-admin.ts for better code organization.
 *
 * Procedures:
 * - getGlobalSettings: Get all global settings (T048)
 * - updateGlobalSettings: Update global settings (T049)
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { superadminProcedure } from '../../procedures';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import type { GlobalSettings, Database } from '@megacampus/shared-types';
import { logPipelineAction } from '../../../services/pipeline-audit';
import { clearSettingsCache } from '../../../services/prompt-loader';

// Type aliases for Database tables
type PipelineGlobalSetting = Database['public']['Tables']['pipeline_global_settings']['Row'];
type Json = PipelineGlobalSetting['setting_value'];

export const globalSettingsRouter = router({
  /**
   * Get global settings (T048)
   *
   * Purpose: Retrieve all pipeline global settings from the database.
   * Transforms key-value rows into a structured GlobalSettings object.
   *
   * Authorization: Superadmin only
   *
   * Output: GlobalSettings object with all configuration values
   *
   * @example
   * ```typescript
   * const settings = await trpc.pipelineAdmin.getGlobalSettings.query();
   * // { ragTokenBudget: 40000, qualityThreshold: 0.85, ... }
   * ```
   */
  getGlobalSettings: superadminProcedure.query(async (): Promise<GlobalSettings> => {
    try {
      const supabase = getSupabaseAdmin();

      // Query all settings from pipeline_global_settings table
      const { data: settings, error } = await supabase
        .from('pipeline_global_settings')
        .select('setting_key, setting_value');

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch global settings: ${error.message}`,
        });
      }

      // Transform key-value rows to GlobalSettings object
      const settingsMap: Record<string, unknown> = {};
      for (const row of settings || []) {
        settingsMap[row.setting_key] = row.setting_value;
      }

      // Build GlobalSettings with defaults for missing values
      const result: GlobalSettings = {
        ragTokenBudget: Number(settingsMap.rag_token_budget) || 40000,
      };

      return result;
    } catch (error: unknown) {
      if (error instanceof TRPCError) {
        throw error;
      }

      logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
        },
        'Unexpected error in getGlobalSettings'
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch global settings',
      });
    }
  }),

  /**
   * Update global settings (T049)
   *
   * Purpose: Update one or more global pipeline settings.
   * Validates input, updates database, and logs changes to audit log.
   *
   * Authorization: Superadmin only
   *
   * Input: Partial GlobalSettings (only fields to update)
   *
   * Output: Updated GlobalSettings object
   *
   * @example
   * ```typescript
   * const updated = await trpc.pipelineAdmin.updateGlobalSettings.mutate({
   *   ragTokenBudget: 30000,
   *   qualityThreshold: 0.9,
   * });
   * ```
   */
  updateGlobalSettings: superadminProcedure
    .input(
      z.object({
        ragTokenBudget: z.number().min(1000).max(100000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        if (!ctx.user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
        }

        const supabase = getSupabaseAdmin();

        // Build list of updates from input
        const updates: Array<{ key: string; value: unknown }> = [];

        if (input.ragTokenBudget !== undefined) {
          updates.push({ key: 'rag_token_budget', value: input.ragTokenBudget });
        }

        // Update each setting in the database
        for (const { key, value } of updates) {
          const { error } = await supabase
            .from('pipeline_global_settings')
            .update({
              setting_value: value as Json,
              created_by: ctx.user.id,
            })
            .eq('setting_key', key);

          if (error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: `Failed to update setting ${key}: ${error.message}`,
            });
          }
        }

        // Log to audit (using a unique ID for global settings)
        await logPipelineAction(
          ctx.user.id,
          'update_global_settings',
          'global_settings',
          '00000000-0000-0000-0000-000000000000', // Fixed UUID for global settings
          {
            updates: updates.map(({ key, value }) => ({ key, value })),
          },
          { failOnError: true }
        );

        // Invalidate prompt loader settings cache to ensure fresh feature flags
        clearSettingsCache();

        logger.info(
          {
            userId: ctx.user.id,
            updatedKeys: updates.map((u) => u.key),
          },
          'Global settings updated'
        );

        // Return updated settings by re-querying
        const { data: settings, error: fetchError } = await supabase
          .from('pipeline_global_settings')
          .select('setting_key, setting_value');

        if (fetchError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch updated settings: ${fetchError.message}`,
          });
        }

        // Transform to GlobalSettings object
        const settingsMap: Record<string, unknown> = {};
        for (const row of settings || []) {
          settingsMap[row.setting_key] = row.setting_value;
        }

        const result: GlobalSettings = {
          ragTokenBudget: Number(settingsMap.rag_token_budget) || 40000,
        };

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
          'Unexpected error in updateGlobalSettings'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update global settings',
        });
      }
    }),
});
