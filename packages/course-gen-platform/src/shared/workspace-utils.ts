import * as sharedUtils from '@megacampus/shared-utils';

export type { LanguageCode } from '@megacampus/shared-utils';

const sharedUtilsRuntime = sharedUtils as typeof sharedUtils & { default?: typeof sharedUtils };
const hasNamedRuntimeExports =
  typeof (sharedUtils as unknown as Record<string, unknown>).formatFileSize === 'function';
const utils = hasNamedRuntimeExports ? sharedUtils : (sharedUtilsRuntime.default ?? sharedUtils);

export const LANGUAGE_FALLBACK = utils.LANGUAGE_FALLBACK;
export const LANGUAGE_NAME_TO_CODE = utils.LANGUAGE_NAME_TO_CODE;
export const formatDuration = utils.formatDuration;
export const formatFileSize = utils.formatFileSize;
export const formatNumber = utils.formatNumber;
export const getDocumentDisplayName = utils.getDocumentDisplayName;
export const hasHumanReadableName = utils.hasHumanReadableName;
export const normalizeLanguageCode = utils.normalizeLanguageCode;
export const normalizeLanguageForReserve = utils.normalizeLanguageForReserve;
export const truncateDisplayName = utils.truncateDisplayName;
export const getErrorMessage = utils.getErrorMessage;
export const fixFieldNames = utils.fixFieldNames;
export const fixFieldNamesWithLogging = utils.fixFieldNamesWithLogging;
export const findAvailablePort = utils.findAvailablePort;
export const generateGenerationCode = utils.generateGenerationCode;
export const JSONRepairError = utils.JSONRepairError;
export const extractJSON = utils.extractJSON;
export const safeJSONParse = utils.safeJSONParse;
export const stripThinkingTags = utils.stripThinkingTags;
export const setNestedValue = utils.setNestedValue;
export const retryWithBackoff = utils.retryWithBackoff;
export const hasDangerousContent = utils.hasDangerousContent;
export const sanitizeLLMFields = utils.sanitizeLLMFields;
export const sanitizeLLMOutput = utils.sanitizeLLMOutput;
export const normalizePhase1Output = utils.normalizePhase1Output;
export const quickValidatePhase1Structure = utils.quickValidatePhase1Structure;
export const estimateSchemaTokens = utils.estimateSchemaTokens;
export const formatSchemaForPrompt = utils.formatSchemaForPrompt;
export const zodToPromptSchema = utils.zodToPromptSchema;
