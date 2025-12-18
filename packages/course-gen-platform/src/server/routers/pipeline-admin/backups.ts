/**
 * Pipeline Admin Backups Router
 * @module server/routers/pipeline-admin/backups
 *
 * Provides superadmin-only procedures for managing configuration backups.
 *
 * Procedures:
 * - listBackups: List all configuration backups (T055)
 * - restoreFromBackup: Restore configuration from backup (T056)
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { superadminProcedure } from '../../procedures';
import type { Database } from '@megacampus/shared-types';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { logPipelineAction } from '../../../services/pipeline-audit';

// Type aliases for Database tables
type PipelineGlobalSetting = Database['public']['Tables']['pipeline_global_settings']['Row'];
type Json = PipelineGlobalSetting['setting_value'];

export const backupsRouter = router({
  /**
   * List all configuration backups (T055)
   *
   * Retrieves all configuration backups ordered by creation date (newest first).
   * Returns last 50 backups with metadata and creator information.
   *
   * Authorization: Superadmin only
   *
   * Output: Array of ConfigBackup objects
   *
   * @example
   * ```typescript
   * const backups = await trpc.pipelineAdmin.listBackups.query();
   * // [{ id: '...', backupName: '...', backupType: 'manual', createdAt: '...', ... }]
   * ```
   */
  listBackups: superadminProcedure.query(async () => {
    try {
      const supabase = getSupabaseAdmin();

      const { data: backups, error } = await supabase
        .from('config_backups')
        .select(
          `
          id,
          backup_name,
          backup_type,
          description,
          created_at,
          created_by,
          users!created_by (email)
        `
        )
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch backups: ${error.message}`,
        });
      }

      // Transform to ConfigBackup[] type
      return (backups || []).map((b) => ({
        id: b.id,
        backupName: b.backup_name,
        backupType: b.backup_type as 'manual' | 'auto_pre_import' | 'scheduled',
        description: b.description,
        createdAt: b.created_at,
        createdBy: b.created_by,
        createdByEmail: (b.users as { email: string } | null)?.email || null,
      }));
    } catch (error: unknown) {
      if (error instanceof TRPCError) {
        throw error;
      }

      logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
        },
        'Unexpected error in listBackups'
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to list backups',
      });
    }
  }),

  /**
   * Restore configuration from backup (T056)
   *
   * Restores configuration from a backup with selective restore options.
   * Creates automatic pre-restore backup before applying changes.
   *
   * Authorization: Superadmin only
   *
   * Input:
   * - backupId: UUID of backup to restore
   * - options: Object with restore flags
   *   - restoreModelConfigs: Restore model configurations (default: true)
   *   - restorePromptTemplates: Restore prompt templates (default: true)
   *   - restoreGlobalSettings: Restore global settings (default: true)
   *
   * Output: { success: true, restoredFrom: string }
   *
   * @example
   * ```typescript
   * const result = await trpc.pipelineAdmin.restoreFromBackup.mutate({
   *   backupId: 'backup-uuid',
   *   options: {
   *     restoreModelConfigs: true,
   *     restorePromptTemplates: true,
   *     restoreGlobalSettings: true,
   *   },
   * });
   * ```
   */
  restoreFromBackup: superadminProcedure
    .input(
      z.object({
        backupId: z.string().uuid(),
        options: z.object({
          restoreModelConfigs: z.boolean().default(true),
          restorePromptTemplates: z.boolean().default(true),
          restoreGlobalSettings: z.boolean().default(true),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        if (!ctx.user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
        }

        const supabase = getSupabaseAdmin();

        // 1. Get backup
        const { data: backup, error } = await supabase
          .from('config_backups')
          .select('*')
          .eq('id', input.backupId)
          .single();

        if (error || !backup) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Backup not found' });
        }

        // Validate backup data structure
        const { configExportDataSchema } = await import('@megacampus/shared-types');
        const parsed = configExportDataSchema.safeParse(backup.backup_data);

        if (!parsed.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid backup data format: ${parsed.error.errors.map((e) => e.message).join(', ')}`,
          });
        }

        const backupData = parsed.data;

        // 2. Create pre-restore backup
        // Get current config for backup
        const { data: currentModels } = await supabase
          .from('llm_model_config')
          .select('*')
          .eq('is_active', true);

        const { data: currentPrompts } = await supabase.from('prompt_templates').select('*').eq('is_active', true);

        const { data: currentSettings } = await supabase.from('pipeline_global_settings').select('setting_key, setting_value');

        // Build pre-restore backup data
        const preRestoreBackupData = {
          version: '1.0',
          exportedAt: new Date().toISOString(),
          exportedBy: ctx.user.id,
          platformVersion: '0.22.3',
          data: {
            modelConfigs: currentModels || [],
            promptTemplates: currentPrompts || [],
            globalSettings: currentSettings || [],
          },
        };

        // Insert pre-restore backup
        const { error: preRestoreError } = await supabase.from('config_backups').insert({
          backup_name: `auto_pre_restore_${new Date().toISOString()}`,
          backup_type: 'auto_pre_import',
          description: `Automatic backup before restoring from ${backup.backup_name}`,
          backup_data: preRestoreBackupData as unknown as Json,
          created_by: ctx.user.id,
        });

        if (preRestoreError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to create pre-restore backup: ${preRestoreError.message}`,
          });
        }

        logger.info({ userId: ctx.user.id, backupId: input.backupId }, 'Pre-restore backup created');

        // 3. Restore model configs
        if (input.options.restoreModelConfigs && backupData.data.modelConfigs) {
          for (const config of backupData.data.modelConfigs) {
            // Deactivate current active config
            await supabase
              .from('llm_model_config')
              .update({ is_active: false })
              .eq('phase_name', config.phaseName)
              .eq('config_type', config.configType)
              .eq('is_active', true);

            // Get max version for this phase
            const { data: maxVersionRow } = await supabase
              .from('llm_model_config')
              .select('version')
              .eq('phase_name', config.phaseName)
              .eq('config_type', config.configType)
              .order('version', { ascending: false })
              .limit(1)
              .single();

            const nextVersion = (maxVersionRow?.version || 0) + 1;

            // Insert restored version
            await supabase.from('llm_model_config').insert({
              phase_name: config.phaseName,
              config_type: config.configType,
              course_id: config.courseId,
              model_id: config.modelId,
              fallback_model_id: config.fallbackModelId || null,
              temperature: config.temperature,
              max_tokens: config.maxTokens,
              version: nextVersion,
              is_active: true,
              created_by: ctx.user.id,
            });
          }

          logger.info({ userId: ctx.user.id, count: backupData.data.modelConfigs.length }, 'Model configs restored');
        }

        // 4. Restore prompt templates
        if (input.options.restorePromptTemplates && backupData.data.promptTemplates) {
          for (const prompt of backupData.data.promptTemplates) {
            // Deactivate current active prompt
            await supabase
              .from('prompt_templates')
              .update({ is_active: false })
              .eq('stage', prompt.stage)
              .eq('prompt_key', prompt.promptKey)
              .eq('is_active', true);

            // Get max version for this prompt
            const { data: maxVersionRow } = await supabase
              .from('prompt_templates')
              .select('version')
              .eq('stage', prompt.stage)
              .eq('prompt_key', prompt.promptKey)
              .order('version', { ascending: false })
              .limit(1)
              .single();

            const nextVersion = (maxVersionRow?.version || 0) + 1;

            // Insert restored version
            await supabase.from('prompt_templates').insert({
              stage: prompt.stage,
              prompt_key: prompt.promptKey,
              prompt_name: prompt.promptName,
              prompt_description: prompt.promptDescription,
              prompt_template: prompt.promptTemplate,
              variables: prompt.variables,
              version: nextVersion,
              is_active: true,
              created_by: ctx.user.id,
            });
          }

          logger.info({ userId: ctx.user.id, count: backupData.data.promptTemplates.length }, 'Prompt templates restored');
        }

        // 5. Restore global settings
        if (input.options.restoreGlobalSettings && backupData.data.globalSettings) {
          const settings = backupData.data.globalSettings;

          // Update each setting
          await supabase.from('pipeline_global_settings').upsert([
            { setting_key: 'rag_token_budget', setting_value: settings.ragTokenBudget },
          ]);

          logger.info({ userId: ctx.user.id }, 'Global settings restored');
        }

        // 6. Audit log
        await logPipelineAction(ctx.user.id, 'restore_backup', 'config_backup', input.backupId, {
          backupName: backup.backup_name,
          restoredModels: input.options.restoreModelConfigs,
          restoredPrompts: input.options.restorePromptTemplates,
          restoredSettings: input.options.restoreGlobalSettings,
          modelConfigsCount: backupData.data.modelConfigs?.length || 0,
          promptTemplatesCount: backupData.data.promptTemplates?.length || 0,
        }, { failOnError: true });

        logger.info(
          {
            userId: ctx.user.id,
            backupId: input.backupId,
            backupName: backup.backup_name,
          },
          'Configuration restored from backup'
        );

        return { success: true, restoredFrom: backup.backup_name };
      } catch (error: unknown) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in restoreFromBackup'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to restore from backup',
        });
      }
    }),
});
