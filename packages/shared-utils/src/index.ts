/**
 * Document display name resolution.
 * Priority: generated_title > original_name > filename.
 * Supports both snake_case (DB) and camelCase (TypeScript).
 *
 * @example getDocumentDisplayName({ generated_title: 'AI Title' }) // "AI Title"
 */
export {
  type DocumentNameFields,
  getDocumentDisplayName,
  hasHumanReadableName,
  truncateDisplayName,
} from './document-display-name';

/**
 * Formatting utilities for durations, numbers, and file sizes.
 *
 * @example formatDuration(2500) // "2.5s"
 * @example formatNumber(1500) // "1.5K"
 * @example formatFileSize(1536) // "1.5 KB"
 */
export { formatDuration, formatNumber, formatFileSize } from './format';

/**
 * Language normalization: ISO 639-1 codes, full names, fallback handling.
 *
 * @example normalizeLanguageCode('Russian') // "ru"
 * @example normalizeLanguageForReserve('fr') // "any"
 */
export {
  type SupportedLanguage,
  type LanguageCode,
  type ReserveLanguage,
  LANGUAGE_NAME_TO_CODE,
  LANGUAGE_FALLBACK,
  normalizeLanguageCode,
  normalizeLanguageForReserve,
} from './language';
