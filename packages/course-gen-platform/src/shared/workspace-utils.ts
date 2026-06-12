import * as sharedUtils from '@megacampus/shared-utils';

export type { LanguageCode } from '@megacampus/shared-utils';

type RuntimeObject = Record<string, unknown>;

function isObject(value: unknown): value is RuntimeObject {
  return Boolean(value) && typeof value === 'object';
}

function readRuntimeProperty(value: unknown, key: string): unknown {
  if (!isObject(value)) return undefined;
  try {
    return value[key];
  } catch {
    return undefined;
  }
}

function resolveRuntimeObject(value: unknown): Partial<typeof sharedUtils> {
  const namedFormatFileSize = readRuntimeProperty(value, 'formatFileSize');
  if (typeof namedFormatFileSize === 'function') return value as Partial<typeof sharedUtils>;

  const defaultValue = readRuntimeProperty(value, 'default');
  if (isObject(defaultValue)) return defaultValue as Partial<typeof sharedUtils>;

  return isObject(value) ? (value as Partial<typeof sharedUtils>) : {};
}

const utils = resolveRuntimeObject(sharedUtils);

function readUtilsExport<K extends keyof typeof sharedUtils>(key: K): (typeof sharedUtils)[K] {
  return readRuntimeProperty(utils, key as string) as (typeof sharedUtils)[K];
}

export const LANGUAGE_FALLBACK = readUtilsExport('LANGUAGE_FALLBACK');
export const LANGUAGE_NAME_TO_CODE = readUtilsExport('LANGUAGE_NAME_TO_CODE');
export const formatDuration = readUtilsExport('formatDuration');
export const formatFileSize = readUtilsExport('formatFileSize');
export const formatNumber = readUtilsExport('formatNumber');
export const getDocumentDisplayName = readUtilsExport('getDocumentDisplayName');
export const hasHumanReadableName = readUtilsExport('hasHumanReadableName');
export const normalizeLanguageCode = readUtilsExport('normalizeLanguageCode');
export const normalizeLanguageForReserve = readUtilsExport('normalizeLanguageForReserve');
export const truncateDisplayName = readUtilsExport('truncateDisplayName');
export const getErrorMessage = readUtilsExport('getErrorMessage');
export const fixFieldNames = readUtilsExport('fixFieldNames');
export const fixFieldNamesWithLogging = readUtilsExport('fixFieldNamesWithLogging');
export const findAvailablePort = readUtilsExport('findAvailablePort');
export const generateGenerationCode = readUtilsExport('generateGenerationCode');
export const JSONRepairError = readUtilsExport('JSONRepairError');
export const extractJSON = readUtilsExport('extractJSON');
export const safeJSONParse = readUtilsExport('safeJSONParse');
export const stripThinkingTags = readUtilsExport('stripThinkingTags');
export const setNestedValue = readUtilsExport('setNestedValue');
export const retryWithBackoff = readUtilsExport('retryWithBackoff');
export const hasDangerousContent = readUtilsExport('hasDangerousContent');
export const sanitizeLLMFields = readUtilsExport('sanitizeLLMFields');
export const sanitizeLLMOutput = readUtilsExport('sanitizeLLMOutput');
export const normalizePhase1Output = readUtilsExport('normalizePhase1Output');
export const quickValidatePhase1Structure = readUtilsExport('quickValidatePhase1Structure');
export const estimateSchemaTokens = readUtilsExport('estimateSchemaTokens');
export const formatSchemaForPrompt = readUtilsExport('formatSchemaForPrompt');
export const zodToPromptSchema = readUtilsExport('zodToPromptSchema');
