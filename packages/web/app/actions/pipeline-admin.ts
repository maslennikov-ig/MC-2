'use server';

import { getBackendAuthHeaders, TRPC_URL } from '@/lib/auth';

/**
 * Get pipeline stages information
 */
export async function getStagesInfo() {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/pipelineAdmin.getStagesInfo`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch stages info');
  }

  return response.json();
}

/**
 * Get pipeline statistics
 */
export async function getPipelineStats(periodDays?: number) {
  const headers = await getBackendAuthHeaders();

  const url = new URL(`${TRPC_URL}/pipelineAdmin.getPipelineStats`);
  if (periodDays !== undefined) {
    url.searchParams.set('input', JSON.stringify({ periodDays }));
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch pipeline stats');
  }

  return response.json();
}

/**
 * List active model configurations (T025)
 */
export async function listModelConfigs() {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/pipelineAdmin.listModelConfigs`, {
    method: 'GET',
    headers,
    cache: 'no-store', // Disable caching to always get fresh data
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch model configs');
  }

  return response.json();
}

/**
 * Update model configuration (T026)
 */
export async function updateModelConfig(input: {
  id: string;
  modelId?: string;
  fallbackModelId?: string | null;
  temperature?: number;
  maxTokens?: number;
  courseId?: string | null;
  qualityThreshold?: number | null;
  maxRetries?: number | null;
  timeoutMs?: number | null;
}) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/pipelineAdmin.updateModelConfig`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update model config');
  }

  return response.json();
}

/**
 * Get model config history (T027)
 */
export async function getModelConfigHistory(input: {
  phaseName: string;
  configType?: 'global' | 'course_override';
  courseId?: string | null;
}) {
  const headers = await getBackendAuthHeaders();

  const url = new URL(`${TRPC_URL}/pipelineAdmin.getModelConfigHistory`);
  url.searchParams.set('input', JSON.stringify(input));

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch config history');
  }

  return response.json();
}

/**
 * Revert model config to specific version (T028)
 */
export async function revertModelConfigToVersion(input: {
  phaseName: string;
  targetVersion: number;
}) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/pipelineAdmin.revertModelConfigToVersion`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to revert config');
  }

  return response.json();
}

/**
 * Reset model config to hardcoded default (T029)
 */
export async function resetModelConfigToDefault(input: { phaseName: string }) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/pipelineAdmin.resetModelConfigToDefault`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to reset config');
  }

  return response.json();
}

/**
 * List OpenRouter models with filters (T030)
 */
export async function listOpenRouterModels(filters?: {
  provider?: string;
  minContextSize?: number;
  maxContextSize?: number;
  maxPricePerMillion?: number;
}) {
  const headers = await getBackendAuthHeaders();

  const url = new URL(`${TRPC_URL}/pipelineAdmin.listOpenRouterModels`);
  if (filters) {
    url.searchParams.set('input', JSON.stringify(filters));
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch OpenRouter models');
  }

  return response.json();
}

/**
 * Refresh OpenRouter models cache (T031)
 */
export async function refreshOpenRouterModels() {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/pipelineAdmin.refreshOpenRouterModels`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to refresh models');
  }

  return response.json();
}

/**
 * List prompt templates grouped by stage (T038)
 */
export async function listPromptTemplates() {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/pipelineAdmin.listPromptTemplates`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch prompts');
  }

  return response.json();
}

/**
 * Update prompt template (T040)
 */
export async function updatePromptTemplate(input: {
  id: string;
  promptTemplate?: string;
  promptName?: string;
  promptDescription?: string | null;
}) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/pipelineAdmin.updatePromptTemplate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update prompt');
  }

  return response.json();
}

/**
 * Get prompt template history (T041)
 */
export async function getPromptHistory(input: {
  stage: string;
  promptKey: string;
}) {
  const headers = await getBackendAuthHeaders();

  const url = new URL(`${TRPC_URL}/pipelineAdmin.getPromptHistory`);
  url.searchParams.set('input', JSON.stringify(input));

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch prompt history');
  }

  return response.json();
}

/**
 * Revert prompt template to specific version (T042)
 */
export async function revertPromptToVersion(input: {
  stage: string;
  promptKey: string;
  targetVersion: number;
}) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/pipelineAdmin.revertPromptToVersion`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to revert prompt');
  }

  return response.json();
}

/**
 * Get global pipeline settings (T048)
 */
export async function getGlobalSettings() {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/pipelineAdmin.getGlobalSettings`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch settings');
  }

  return response.json();
}

/**
 * Update global pipeline settings (T049)
 */
export async function updateGlobalSettings(input: {
  ragTokenBudget?: number;
}) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/pipelineAdmin.updateGlobalSettings`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update settings');
  }

  return response.json();
}

/**
 * Export configuration (T052)
 */
export async function exportConfiguration() {
  const headers = await getBackendAuthHeaders();
  const response = await fetch(`${TRPC_URL}/pipelineAdmin.exportConfiguration`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to export configuration');
  }
  return response.json();
}

/**
 * Validate import (T053)
 */
export async function validateImport(input: { exportData: unknown }) {
  const headers = await getBackendAuthHeaders();
  const url = new URL(`${TRPC_URL}/pipelineAdmin.validateImport`);
  url.searchParams.set('input', JSON.stringify(input));
  const response = await fetch(url.toString(), { method: 'GET', headers, cache: 'no-store' });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to validate import');
  }
  return response.json();
}

/**
 * Import configuration (T054)
 */
export async function importConfiguration(input: {
  exportData: unknown;
  options: {
    importModelConfigs: boolean;
    importPromptTemplates: boolean;
    importGlobalSettings: boolean;
    createBackup: boolean;
  };
}) {
  const headers = await getBackendAuthHeaders();
  const response = await fetch(`${TRPC_URL}/pipelineAdmin.importConfiguration`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to import configuration');
  }
  return response.json();
}

/**
 * List backups (T055)
 */
export async function listBackups() {
  const headers = await getBackendAuthHeaders();
  const response = await fetch(`${TRPC_URL}/pipelineAdmin.listBackups`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to list backups');
  }
  return response.json();
}

/**
 * Restore from backup (T056)
 */
export async function restoreFromBackup(input: {
  backupId: string;
  options: {
    restoreModelConfigs: boolean;
    restorePromptTemplates: boolean;
    restoreGlobalSettings: boolean;
  };
}) {
  const headers = await getBackendAuthHeaders();
  const response = await fetch(`${TRPC_URL}/pipelineAdmin.restoreFromBackup`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to restore from backup');
  }
  return response.json();
}

/**
 * Get API key status (jina_api_key, openrouter_api_key)
 */
export async function getApiKeyStatus() {
  const headers = await getBackendAuthHeaders();
  const response = await fetch(`${TRPC_URL}/pipelineAdmin.getApiKeyStatus`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch API key status');
  }
  const result = await response.json();
  return result.result?.data || result.result || result;
}

/**
 * Update API key configuration
 */
export async function updateApiKeyConfig(
  keyType: 'jina' | 'openrouter',
  source: 'env' | 'database',
  value?: string
) {
  const headers = await getBackendAuthHeaders();
  const response = await fetch(`${TRPC_URL}/pipelineAdmin.updateApiKeyConfig`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ keyType, source, value }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update API key config');
  }
  return response.json();
}

/**
 * Test API key connection
 */
export async function testApiKey(keyType: 'jina' | 'openrouter') {
  const headers = await getBackendAuthHeaders();
  const response = await fetch(`${TRPC_URL}/pipelineAdmin.testApiKey`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ keyType }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to test API key');
  }
  const result = await response.json();
  return result.result?.data || result.result || result;
}

/**
 * List judge configurations for CLEV voting system (T030)
 */
export async function listJudgeConfigs(language?: string) {
  const headers = await getBackendAuthHeaders();

  const url = new URL(`${TRPC_URL}/pipelineAdmin.listJudgeConfigs`);
  if (language) {
    url.searchParams.set('input', JSON.stringify({ language }));
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch judge configs');
  }

  return response.json();
}

/**
 * Update judge configuration (T031)
 */
export async function updateJudgeConfig(input: {
  id: string;
  modelId?: string;
  weight?: number;
  temperature?: number;
  maxTokens?: number;
  isActive?: boolean;
}) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/pipelineAdmin.updateJudgeConfig`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update judge config');
  }

  return response.json();
}

/**
 * List context reserve settings
 */
export async function listContextReserveSettings() {
  const headers = await getBackendAuthHeaders();
  const response = await fetch(`${TRPC_URL}/pipelineAdmin.listContextReserveSettings`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch context reserve settings');
  }
  return response.json();
}

/**
 * Update context reserve setting
 */
export async function updateContextReserveSetting(input: {
  language: 'en' | 'ru' | 'any';
  reservePercent: number;
}) {
  const headers = await getBackendAuthHeaders();
  const response = await fetch(`${TRPC_URL}/pipelineAdmin.updateContextReserveSetting`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update context reserve setting');
  }
  return response.json();
}

/**
 * Get reserve percentage for a language
 */
export async function getReservePercent(language: string) {
  const headers = await getBackendAuthHeaders();
  const url = new URL(`${TRPC_URL}/pipelineAdmin.getReservePercent`);
  url.searchParams.set('input', JSON.stringify({ language }));
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers,
    cache: 'no-store',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch reserve percent');
  }
  return response.json();
}
