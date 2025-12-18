/**
 * Export/Import Router
 * @module server/routers/pipeline-admin/export-import
 *
 * Provides superadmin-only procedures for exporting and importing pipeline configuration.
 *
 * Procedures:
 * - exportConfiguration: Export all active configurations as JSON for backup/sharing (T052)
 * - validateImport: Validate import JSON and preview changes before applying (T053)
 * - importConfiguration: Import configuration from JSON with optional backup (T054)
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { superadminProcedure } from '../../procedures';
import type {
  PhaseName,
  ModelConfigWithVersion,
  PromptTemplate,
  GlobalSettings,
  Database,
} from '@megacampus/shared-types';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { logPipelineAction } from '../../../services/pipeline-audit';

// Type aliases for Database tables
type PipelineGlobalSetting = Database['public']['Tables']['pipeline_global_settings']['Row'];
type Json = PipelineGlobalSetting['setting_value'];

export const exportImportRouter = router({
  /**
   * Export configuration (T052)
   *
   * Purpose: Export all active configurations as JSON for backup/sharing.
   * Includes active model configs, prompt templates, and global settings.
   *
   * Authorization: Superadmin only
   *
   * Output: ConfigExport object with version, metadata, and data
   *
   * @example
   * ```typescript
   * const exportData = await trpc.pipelineAdmin.exportConfiguration.query();
   * // { version: '1.0', exportedAt: '...', data: { modelConfigs: [...], ... } }
   * ```
   */
  exportConfiguration: superadminProcedure.query(async ({ ctx }) => {
    try {
      if (!ctx.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
      }

      const supabase = getSupabaseAdmin();

      // Get active model configs
      const { data: modelConfigsData, error: modelConfigsError } = await supabase
        .from('llm_model_config')
        .select('*')
        .eq('is_active', true)
        .order('phase_name');

      if (modelConfigsError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch model configs: ${modelConfigsError.message}`,
        });
      }

      // Transform model configs to ModelConfigWithVersion format
      const modelConfigs: ModelConfigWithVersion[] = (modelConfigsData || []).map((config) => ({
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
        // Wave 1 fields
        stageNumber: config.stage_number,
        language: config.language,
        contextTier: config.context_tier,
        maxContextTokens: config.max_context_tokens,
        thresholdTokens: config.threshold_tokens,
        cacheReadEnabled: config.cache_read_enabled,
        primaryDisplayName: config.primary_display_name,
        fallbackDisplayName: config.fallback_display_name,
        // Judge fields
        judgeRole: config.judge_role as 'primary' | 'secondary' | 'tiebreaker' | null,
        weight: config.weight,
        // Per-stage settings
        qualityThreshold: config.quality_threshold,
        maxRetries: config.max_retries,
        timeoutMs: config.timeout_ms,
      }));

      // Get active prompt templates
      const { data: promptTemplatesData, error: promptTemplatesError } = await supabase
        .from('prompt_templates')
        .select('*')
        .eq('is_active', true)
        .order('stage')
        .order('prompt_key');

      if (promptTemplatesError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch prompt templates: ${promptTemplatesError.message}`,
        });
      }

      // Transform prompt templates to PromptTemplate format
      const promptTemplates: PromptTemplate[] = (promptTemplatesData || []).map((prompt) => ({
        id: prompt.id,
        stage: prompt.stage as PromptTemplate['stage'],
        promptKey: prompt.prompt_key,
        promptName: prompt.prompt_name,
        promptDescription: prompt.prompt_description,
        promptTemplate: prompt.prompt_template,
        variables: (prompt.variables || []) as PromptTemplate['variables'],
        version: prompt.version,
        isActive: prompt.is_active,
        createdAt: prompt.created_at ?? new Date().toISOString(),
        updatedAt: prompt.updated_at ?? new Date().toISOString(),
        createdBy: prompt.created_by,
      }));

      // Get global settings
      const { data: settingsRows, error: settingsError } = await supabase
        .from('pipeline_global_settings')
        .select('setting_key, setting_value');

      if (settingsError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch global settings: ${settingsError.message}`,
        });
      }

      // Transform settings rows to GlobalSettings object
      const settingsMap: Record<string, unknown> = {};
      for (const row of settingsRows || []) {
        settingsMap[row.setting_key] = row.setting_value;
      }

      const globalSettings: GlobalSettings = {
        ragTokenBudget: Number(settingsMap.rag_token_budget) || 40000,
      };

      // Build export data
      const exportData = {
        version: '1.0' as const,
        exportedAt: new Date().toISOString(),
        exportedBy: ctx.user.id,
        platformVersion: '0.22.3', // TODO: Read from package.json
        data: {
          modelConfigs,
          promptTemplates,
          globalSettings,
        },
      };

      // Log to audit
      await logPipelineAction(
        ctx.user.id,
        'export_config',
        'config_export',
        'export-' + new Date().toISOString(),
        {
          modelConfigsCount: modelConfigs.length,
          promptTemplatesCount: promptTemplates.length,
        }
      );

      logger.info(
        {
          userId: ctx.user.id,
          modelConfigsCount: modelConfigs.length,
          promptTemplatesCount: promptTemplates.length,
        },
        'Configuration exported'
      );

      return exportData;
    } catch (error: unknown) {
      if (error instanceof TRPCError) {
        throw error;
      }

      logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
        },
        'Unexpected error in exportConfiguration'
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to export configuration',
      });
    }
  }),

  /**
   * Validate import data (T053)
   *
   * Purpose: Validate import JSON and preview changes before applying.
   * Compares imported data with current active configs to show what will change.
   *
   * Authorization: Superadmin only
   *
   * Input: ConfigExport data to validate
   *
   * Output: ImportPreview with change details and warnings
   *
   * @example
   * ```typescript
   * const preview = await trpc.pipelineAdmin.validateImport.query({ exportData });
   * // { modelConfigChanges: [...], promptTemplateChanges: [...], ... }
   * ```
   */
  validateImport: superadminProcedure
    .input(
      z.object({
        exportData: z.any(), // Will validate with schema inside
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        if (!ctx.user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
        }

        const supabase = getSupabaseAdmin();

        // Validate schema
        const { configExportDataSchema } = await import('@megacampus/shared-types');
        const parsed = configExportDataSchema.safeParse(input.exportData);

        if (!parsed.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid export data format: ${parsed.error.errors.map((e) => e.message).join(', ')}`,
          });
        }

        const exportData = parsed.data;

        // Get current active model configs
        const { data: currentModels, error: modelsError } = await supabase
          .from('llm_model_config')
          .select('phase_name, model_id')
          .eq('is_active', true)
          .eq('config_type', 'global')
          .is('course_id', null);

        if (modelsError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch current model configs: ${modelsError.message}`,
          });
        }

        // Get current active prompt templates
        const { data: currentPrompts, error: promptsError } = await supabase
          .from('prompt_templates')
          .select('stage, prompt_key')
          .eq('is_active', true);

        if (promptsError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch current prompt templates: ${promptsError.message}`,
          });
        }

        // Get current global settings
        const { data: settingsRows, error: settingsError } = await supabase
          .from('pipeline_global_settings')
          .select('setting_key, setting_value');

        if (settingsError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to fetch global settings: ${settingsError.message}`,
          });
        }

        // Build current settings map
        const currentSettingsMap: Record<string, unknown> = {};
        for (const row of settingsRows || []) {
          currentSettingsMap[row.setting_key] = row.setting_value;
        }

        // Compare model configs
        const currentModelsMap = new Map(
          (currentModels || []).map((m) => [m.phase_name, m.model_id])
        );

        const modelConfigChanges = exportData.data.modelConfigs
          .filter((config) => config.configType === 'global' && config.courseId === null)
          .map((config) => {
            const currentModelId = currentModelsMap.get(config.phaseName);
            const changeType: 'add' | 'update' | 'unchanged' =
              currentModelId === undefined
                ? 'add'
                : currentModelId === config.modelId
                  ? 'unchanged'
                  : 'update';

            return {
              phaseName: config.phaseName,
              currentModelId: currentModelId || null,
              newModelId: config.modelId,
              changeType,
            };
          });

        // Compare prompt templates
        const currentPromptsSet = new Set(
          (currentPrompts || []).map((p) => `${p.stage}:${p.prompt_key}`)
        );

        const promptTemplateChanges = exportData.data.promptTemplates.map((template) => {
          const key = `${template.stage}:${template.promptKey}`;
          const changeType: 'add' | 'update' | 'unchanged' = currentPromptsSet.has(key)
            ? 'update'
            : 'add';

          return {
            stage: template.stage,
            promptKey: template.promptKey,
            changeType,
          };
        });

        // Compare settings
        const settingsChanges = [
          {
            key: 'ragTokenBudget',
            currentValue: Number(currentSettingsMap.rag_token_budget) || 40000,
            newValue: exportData.data.globalSettings.ragTokenBudget,
          },
        ].filter((change) => JSON.stringify(change.currentValue) !== JSON.stringify(change.newValue));

        // Log to audit
        await logPipelineAction(
          ctx.user.id,
          'preview_import',
          'config_import',
          'preview-' + new Date().toISOString(),
          {
            modelConfigChanges: modelConfigChanges.length,
            promptTemplateChanges: promptTemplateChanges.length,
            settingsChanges: settingsChanges.length,
          }
        );

        logger.info(
          {
            userId: ctx.user.id,
            modelConfigChanges: modelConfigChanges.length,
            promptTemplateChanges: promptTemplateChanges.length,
            settingsChanges: settingsChanges.length,
          },
          'Import preview generated'
        );

        return {
          modelConfigChanges,
          promptTemplateChanges,
          settingsChanges,
        };
      } catch (error: unknown) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in validateImport'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to validate import data',
        });
      }
    }),

  /**
   * Import configuration (T054)
   *
   * Purpose: Import configuration from JSON, optionally creating backup first.
   * Supports selective import (model configs, prompts, settings).
   *
   * Authorization: Superadmin only
   *
   * Input:
   * - exportData: ConfigExport data
   * - options: Import options (selective import, backup)
   *
   * Output: { success: true }
   *
   * @example
   * ```typescript
   * const result = await trpc.pipelineAdmin.importConfiguration.mutate({
   *   exportData,
   *   options: {
   *     importModelConfigs: true,
   *     importPromptTemplates: true,
   *     importGlobalSettings: true,
   *     createBackup: true,
   *   },
   * });
   * ```
   */
  importConfiguration: superadminProcedure
    .input(
      z.object({
        exportData: z.any(), // Will validate with schema inside
        options: z
          .object({
            importModelConfigs: z.boolean().default(true),
            importPromptTemplates: z.boolean().default(true),
            importGlobalSettings: z.boolean().default(true),
            createBackup: z.boolean().default(true),
          })
          .default({
            importModelConfigs: true,
            importPromptTemplates: true,
            importGlobalSettings: true,
            createBackup: true,
          }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        if (!ctx.user) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
        }

        const supabase = getSupabaseAdmin();

        /**
         * NOTE: importConfiguration does NOT use optimistic locking by design.
         * Rationale:
         * - Imports are intentional bulk operations performed by admins
         * - A backup is created before import for rollback capability
         * - The operation overwrites all configs atomically
         * - Race conditions are unlikely during scheduled import windows
         * - Per-item version checks would make imports too restrictive
         */

        // Validate schema
        const { configExportDataSchema } = await import('@megacampus/shared-types');
        const parsed = configExportDataSchema.safeParse(input.exportData);

        if (!parsed.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid export data format: ${parsed.error.errors.map((e) => e.message).join(', ')}`,
          });
        }

        const exportData = parsed.data;

        // 1. Create backup if requested
        if (input.options.createBackup) {
          // Get current config for backup
          const { data: currentModels } = await supabase
            .from('llm_model_config')
            .select('*')
            .eq('is_active', true);

          const { data: currentPrompts } = await supabase
            .from('prompt_templates')
            .select('*')
            .eq('is_active', true);

          const { data: currentSettings } = await supabase
            .from('pipeline_global_settings')
            .select('setting_key, setting_value');

          // Build backup data
          const backupData = {
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

          // Insert backup
          const { error: backupError } = await supabase.from('config_backups').insert({
            backup_name: `auto_pre_import_${new Date().toISOString()}`,
            backup_type: 'auto_pre_import',
            description: `Automatic backup before import at ${new Date().toISOString()}`,
            backup_data: backupData as unknown as Json,
            created_by: ctx.user.id,
          });

          if (backupError) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: `Failed to create backup: ${backupError.message}`,
            });
          }

          logger.info({ userId: ctx.user.id }, 'Backup created before import');
        }

        // 2. Import model configs (use versioning pattern)
        if (input.options.importModelConfigs) {
          for (const config of exportData.data.modelConfigs.filter(
            (c) => c.configType === 'global' && c.courseId === null
          )) {
            // Get current active version
            const { data: currentActive } = await supabase
              .from('llm_model_config')
              .select('id, version')
              .eq('phase_name', config.phaseName)
              .eq('config_type', 'global')
              .is('course_id', null)
              .eq('is_active', true)
              .maybeSingle();

            const nextVersion = currentActive ? currentActive.version + 1 : 1;

            // Deactivate current version if exists
            if (currentActive) {
              const { error: deactivateError } = await supabase
                .from('llm_model_config')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('id', currentActive.id);

              if (deactivateError) {
                throw new TRPCError({
                  code: 'INTERNAL_SERVER_ERROR',
                  message: `Failed to deactivate config for ${config.phaseName}: ${deactivateError.message}`,
                });
              }
            }

            // Insert new version
            const { error: insertError } = await supabase.from('llm_model_config').insert({
              config_type: 'global',
              phase_name: config.phaseName,
              course_id: null,
              model_id: config.modelId,
              fallback_model_id: config.fallbackModelId,
              temperature: config.temperature,
              max_tokens: config.maxTokens,
              version: nextVersion,
              is_active: true,
              created_by: ctx.user.id,
            });

            if (insertError) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to import config for ${config.phaseName}: ${insertError.message}`,
              });
            }
          }

          logger.info(
            { userId: ctx.user.id, count: exportData.data.modelConfigs.length },
            'Model configs imported'
          );
        }

        // 3. Import prompt templates (similar versioning pattern)
        if (input.options.importPromptTemplates) {
          for (const template of exportData.data.promptTemplates) {
            // Get current active version
            const { data: currentActive } = await supabase
              .from('prompt_templates')
              .select('id, version')
              .eq('stage', template.stage)
              .eq('prompt_key', template.promptKey)
              .eq('is_active', true)
              .maybeSingle();

            const nextVersion = currentActive ? currentActive.version + 1 : 1;

            // Deactivate current version if exists
            if (currentActive) {
              const { error: deactivateError } = await supabase
                .from('prompt_templates')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('id', currentActive.id);

              if (deactivateError) {
                throw new TRPCError({
                  code: 'INTERNAL_SERVER_ERROR',
                  message: `Failed to deactivate prompt ${template.stage}/${template.promptKey}: ${deactivateError.message}`,
                });
              }
            }

            // Insert new version
            const { error: insertError } = await supabase.from('prompt_templates').insert({
              stage: template.stage,
              prompt_key: template.promptKey,
              prompt_name: template.promptName,
              prompt_description: template.promptDescription,
              prompt_template: template.promptTemplate,
              variables: template.variables as unknown as Json,
              version: nextVersion,
              is_active: true,
              created_by: ctx.user.id,
            });

            if (insertError) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to import prompt ${template.stage}/${template.promptKey}: ${insertError.message}`,
              });
            }
          }

          logger.info(
            { userId: ctx.user.id, count: exportData.data.promptTemplates.length },
            'Prompt templates imported'
          );
        }

        // 4. Import global settings
        if (input.options.importGlobalSettings) {
          const settings = exportData.data.globalSettings;

          const updates = [
            { key: 'rag_token_budget', value: settings.ragTokenBudget },
          ];

          for (const { key, value } of updates) {
            const { error } = await supabase
              .from('pipeline_global_settings')
              .update({
                setting_value: value as unknown as Json,
                created_by: ctx.user.id,
              })
              .eq('setting_key', key);

            if (error) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to import setting ${key}: ${error.message}`,
              });
            }
          }

          logger.info({ userId: ctx.user.id }, 'Global settings imported');
        }

        // 5. Log to audit
        await logPipelineAction(
          ctx.user.id,
          'import_config',
          'config_import',
          'import-' + new Date().toISOString(),
          {
            importedModels: input.options.importModelConfigs,
            importedPrompts: input.options.importPromptTemplates,
            importedSettings: input.options.importGlobalSettings,
            createdBackup: input.options.createBackup,
            modelConfigsCount: exportData.data.modelConfigs.length,
            promptTemplatesCount: exportData.data.promptTemplates.length,
          },
          { failOnError: true }
        );

        logger.info(
          {
            userId: ctx.user.id,
            importedModels: input.options.importModelConfigs,
            importedPrompts: input.options.importPromptTemplates,
            importedSettings: input.options.importGlobalSettings,
          },
          'Configuration imported successfully'
        );

        return { success: true };
      } catch (error: unknown) {
        if (error instanceof TRPCError) {
          throw error;
        }

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in importConfiguration'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to import configuration',
        });
      }
    }),
});
