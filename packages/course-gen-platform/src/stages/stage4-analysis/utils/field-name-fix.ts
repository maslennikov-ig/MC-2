/**
 * Field Name Fix Utility - Re-export from shared/utils
 *
 * DEPRECATED: This module has been moved to @/shared/utils/field-name-fix
 * The unified version includes mappings for both Analysis (Stage 4) and Generation (Stage 5).
 * This file exists for backward compatibility.
 *
 * @deprecated Use '@/shared/utils/field-name-fix' instead
 * @module stages/stage4-analysis/utils/field-name-fix
 */

export {
  fixFieldNames,
  fixFieldNamesWithLogging,
} from '@/shared/utils/field-name-fix';
