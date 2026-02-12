/**
 * Export/Import Router Helpers
 * @module server/routers/pipeline-admin/export-import-helpers
 *
 * Helper functions extracted from export-import.ts to reduce file size
 * and function complexity. Contains business logic for:
 * - Import configuration handler
 */

import { TRPCError } from '@trpc/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@megacampus/shared-types';
import { logger } from '../../../shared/logger/index.js';
import { logPipelineAction } from '../../../services/pipeline-audit';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../../../../package.json') as { version: string };
const PLATFORM_VERSION = packageJson.version;

type PipelineGlobalSetting = Database['public']['Tables']['pipeline_global_settings']['Row'];
type Json = PipelineGlobalSetting['setting_value'];

/**
 * Import configuration input type
 */
export interface ImportConfigInput {
  exportData?: unknown;
  options: {
    importModelConfigs: boolean;
    importPromptTemplates: boolean;
    importGlobalSettings: boolean;
    createBackup: boolean;
  };
}

/**
 * Import configuration result type
 */
export interface ImportConfigResult {
  success: boolean;
}

/**
 * Handle import configuration operation
 *
 * This function:
 * 1. Validates export data schema
 * 2. Creates backup if requested
 * 3. Imports model configs (with versioning)
 * 4. Imports prompt templates (with versioning)
 * 5. Imports global settings
 * 6. Logs to audit
 *
 * @param supabase - Supabase admin client
 * @param input - Import configuration input
 * @param userId - Current user ID
 * @returns Import configuration result
 */
export async function handleImportConfiguration(
  supabase: SupabaseClient<Database>,
  input: ImportConfigInput,
  userId: string
): Promise<ImportConfigResult> {
  const { configExportDataSchema } = await import('@megacampus/shared-types');
  const parsed = configExportDataSchema.safeParse(input.exportData);

  if (!parsed.success) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Invalid export data format: ${parsed.error.errors.map(e => e.message).join(', ')}`,
    });
  }

  const exportData = parsed.data;

  // 1. Create backup if requested
  if (input.options.createBackup) {
    await createBackup(supabase, userId);
  }

  // 2. Import model configs (use versioning pattern)
  if (input.options.importModelConfigs) {
    await importModelConfigs(supabase, exportData, userId);
  }

  // 3. Import prompt templates (similar versioning pattern)
  if (input.options.importPromptTemplates) {
    await importPromptTemplates(supabase, exportData, userId);
  }

  // 4. Import global settings
  if (input.options.importGlobalSettings) {
    await importGlobalSettings(supabase, exportData, userId);
  }

  // 5. Log to audit
  await logPipelineAction(
    userId,
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
      userId,
      importedModels: input.options.importModelConfigs,
      importedPrompts: input.options.importPromptTemplates,
      importedSettings: input.options.importGlobalSettings,
    },
    'Configuration imported successfully'
  );

  return { success: true };
}

/**
 * Create backup before import
 */
async function createBackup(supabase: SupabaseClient<Database>, userId: string): Promise<void> {
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

  const backupData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    exportedBy: userId,
    platformVersion: PLATFORM_VERSION,
    data: {
      modelConfigs: currentModels || [],
      promptTemplates: currentPrompts || [],
      globalSettings: currentSettings || [],
    },
  };

  const { error: backupError } = await supabase.from('config_backups').insert({
    backup_name: `auto_pre_import_${new Date().toISOString()}`,
    backup_type: 'auto_pre_import',
    description: `Automatic backup before import at ${new Date().toISOString()}`,
    backup_data: backupData as unknown as Json,
    created_by: userId,
  });

  if (backupError) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to create backup: ${backupError.message}`,
    });
  }

  logger.info({ userId }, 'Backup created before import');
}

/**
 * Import model configs
 */
async function importModelConfigs(
  supabase: SupabaseClient<Database>,
  exportData: {
    data: {
      modelConfigs: Array<{
        configType: string;
        courseId: string | null;
        phaseName: string;
        modelId: string;
        fallbackModelId: string | null;
        temperature: number;
        maxTokens: number;
      }>;
    };
  },
  userId: string
): Promise<void> {
  for (const config of exportData.data.modelConfigs.filter(
    c => c.configType === 'global' && c.courseId === null
  )) {
    const { data: currentActive } = await supabase
      .from('llm_model_config')
      .select('id, version')
      .eq('phase_name', config.phaseName)
      .eq('config_type', 'global')
      .is('course_id', null)
      .eq('is_active', true)
      .maybeSingle();

    const nextVersion = currentActive ? currentActive.version + 1 : 1;

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
      created_by: userId,
    });

    if (insertError) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to import config for ${config.phaseName}: ${insertError.message}`,
      });
    }
  }

  logger.info({ userId, count: exportData.data.modelConfigs.length }, 'Model configs imported');
}

/**
 * Import prompt templates
 */
async function importPromptTemplates(
  supabase: SupabaseClient<Database>,
  exportData: {
    data: {
      promptTemplates: Array<{
        stage: string;
        promptKey: string;
        promptName: string;
        promptDescription: string | null;
        promptTemplate: string;
        variables: unknown;
      }>;
    };
  },
  userId: string
): Promise<void> {
  for (const template of exportData.data.promptTemplates) {
    const { data: currentActive } = await supabase
      .from('prompt_templates')
      .select('id, version')
      .eq('stage', template.stage)
      .eq('prompt_key', template.promptKey)
      .eq('is_active', true)
      .maybeSingle();

    const nextVersion = currentActive ? currentActive.version + 1 : 1;

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

    const { error: insertError } = await supabase.from('prompt_templates').insert({
      stage: template.stage,
      prompt_key: template.promptKey,
      prompt_name: template.promptName,
      prompt_description: template.promptDescription,
      prompt_template: template.promptTemplate,
      variables: template.variables as Json,
      version: nextVersion,
      is_active: true,
      created_by: userId,
    });

    if (insertError) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to import prompt ${template.stage}/${template.promptKey}: ${insertError.message}`,
      });
    }
  }

  logger.info(
    { userId, count: exportData.data.promptTemplates.length },
    'Prompt templates imported'
  );
}

/**
 * Import global settings
 */
async function importGlobalSettings(
  supabase: SupabaseClient<Database>,
  exportData: { data: { globalSettings: { ragTokenBudget: number } } },
  userId: string
): Promise<void> {
  const settings = exportData.data.globalSettings;

  const updates = [{ key: 'rag_token_budget', value: settings.ragTokenBudget }];

  for (const { key, value } of updates) {
    const { error } = await supabase
      .from('pipeline_global_settings')
      .update({
        setting_value: value as unknown as Json,
        created_by: userId,
      })
      .eq('setting_key', key);

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to import setting ${key}: ${error.message}`,
      });
    }
  }

  logger.info({ userId }, 'Global settings imported');
}
