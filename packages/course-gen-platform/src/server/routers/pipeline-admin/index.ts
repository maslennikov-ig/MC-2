/**
 * Pipeline Admin Router - Main Entry Point
 * @module server/routers/pipeline-admin
 *
 * Provides superadmin-only procedures for viewing and managing pipeline configuration.
 * All procedures require superadmin role and provide comprehensive visibility into
 * pipeline stages, model configs, prompts, and statistics.
 *
 * This module merges all sub-routers into a single pipelineAdminRouter.
 */

import { router } from '../../trpc';

// Import all sub-routers
import { stagesRouter } from './stages';
import { statsRouter } from './stats';
import { modelConfigsRouter } from './model-configs';
import { openrouterModelsRouter } from './openrouter-models';
import { promptsRouter } from './prompts';
import { globalSettingsRouter } from './global-settings';
import { exportImportRouter } from './export-import';
import { backupsRouter } from './backups';
import { apiKeysRouter } from './api-keys';
import { refinementConfigsRouter } from './refinement-configs';
import { contextReserveRouter } from './context-reserve';

// Re-export constants for use by other modules
export { PIPELINE_STAGES, DEFAULT_MODEL_CONFIGS } from './constants';
export type { PipelineStageDefinition, DefaultModelConfig } from './constants';

/**
 * Pipeline Admin Router
 *
 * Merges all sub-routers into a single router that maintains the same API surface
 * as the original monolithic pipeline-admin.ts file.
 *
 * Sub-routers:
 * - stages: getStagesInfo
 * - stats: getPipelineStats
 * - modelConfigs: listModelConfigs, updateModelConfig, getModelConfigHistory, revertModelConfigToVersion, resetModelConfigToDefault
 * - openrouterModels: listOpenRouterModels, refreshOpenRouterModels
 * - prompts: listPromptTemplates, getPromptTemplate, updatePromptTemplate, getPromptHistory, revertPromptToVersion
 * - globalSettings: getGlobalSettings, updateGlobalSettings
 * - exportImport: exportConfiguration, validateImport, importConfiguration
 * - backups: listBackups, restoreFromBackup
 * - apiKeys: getApiKeyStatus, testApiKey, updateApiKeyConfig
 * - refinementConfigs: listRefinementConfigs, updateRefinementConfig, getRefinementConfigHistory, revertRefinementConfigToVersion, resetRefinementConfigToDefault
 */
export const pipelineAdminRouter = router({
  // Stages (1 procedure)
  ...stagesRouter._def.procedures,

  // Stats (1 procedure)
  ...statsRouter._def.procedures,

  // Model Configs (5 procedures)
  ...modelConfigsRouter._def.procedures,

  // OpenRouter Models (2 procedures)
  ...openrouterModelsRouter._def.procedures,

  // Prompts (5 procedures)
  ...promptsRouter._def.procedures,

  // Global Settings (2 procedures)
  ...globalSettingsRouter._def.procedures,

  // Export/Import (3 procedures)
  ...exportImportRouter._def.procedures,

  // Backups (2 procedures)
  ...backupsRouter._def.procedures,

  // API Keys (3 procedures)
  ...apiKeysRouter._def.procedures,

   // Refinement Configs (5 procedures)
  ...refinementConfigsRouter._def.procedures,

  // Context Reserve Settings (3 procedures)
  ...contextReserveRouter._def.procedures,
});

export type PipelineAdminRouter = typeof pipelineAdminRouter;
