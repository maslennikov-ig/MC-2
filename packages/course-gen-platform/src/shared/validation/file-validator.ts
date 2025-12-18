/**
 * File validation utility for course-gen-platform
 * @module shared/validation/file-validator
 *
 * This module provides tier-based file validation for the multi-tenant course generation platform.
 * It enforces file size, MIME type, and file count restrictions based on organization tier.
 *
 * Tier Restrictions:
 * - Free: No uploads allowed
 * - Basic Plus: PDF, TXT, MD only (1 file per course)
 * - Standard: PDF, TXT, MD, DOCX, HTML, PPTX (3 files per course)
 * - Premium: All formats including images (10 files per course)
 *
 * @see packages/shared-types/src/zod-schemas.ts for tier-based constants
 */

import type { Tier } from '@megacampus/shared-types';
import {
  MIME_TYPES_BY_TIER,
  FILE_EXTENSIONS_BY_TIER,
  FILE_COUNT_LIMITS_BY_TIER,
  FILE_SIZE_LIMITS_BY_TIER,
  MAX_FILE_SIZE_BYTES,
} from '@megacampus/shared-types';
import { ValidationError } from '../../server/errors/typed-errors';

// ============================================================================
// Types
// ============================================================================

/**
 * File input for validation
 */
export interface FileInput {
  /** Original filename */
  filename: string;
  /** File size in bytes */
  fileSize: number;
  /** MIME type */
  mimeType: string;
}

/**
 * Validation result indicating success or failure
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** User-friendly error message with upgrade prompt if applicable */
  userMessage?: string;
  /** Suggested tier for upgrade (if applicable) */
  suggestedTier?: Tier;
}

/**
 * Detailed file validation result
 */
export interface FileValidationResult extends ValidationResult {
  /** Validation details for each check */
  checks: {
    size: ValidationResult;
    mimeType: ValidationResult;
    count: ValidationResult;
  };
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum file size in megabytes (for display)
 */
const MAX_FILE_SIZE_MB = MAX_FILE_SIZE_BYTES / (1024 * 1024);

/**
 * Tier upgrade paths
 */
const TIER_UPGRADE_PATH: Record<Tier, Tier | null> = {
  trial: 'basic',
  free: 'basic',
  basic: 'standard',
  standard: 'premium',
  premium: null,
};

/**
 * Tier display names
 */
const TIER_DISPLAY_NAMES: Record<Tier, string> = {
  trial: 'Trial',
  free: 'Free',
  basic: 'Basic',
  standard: 'Standard',
  premium: 'Premium',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format file size for display
 * @param bytes - File size in bytes
 * @returns Formatted file size string
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} bytes`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}

/**
 * Get upgrade message for a tier
 * @param currentTier - Current organization tier
 * @param suggestedTier - Suggested tier to upgrade to
 * @returns Upgrade message
 */
function getUpgradeMessage(currentTier: Tier, suggestedTier?: Tier): string {
  const suggested = suggestedTier || TIER_UPGRADE_PATH[currentTier];
  if (!suggested) {
    return '';
  }
  return ` Upgrade to ${TIER_DISPLAY_NAMES[suggested]} to unlock this feature.`;
}

/**
 * Get allowed extensions for display
 * @param tier - Organization tier
 * @returns Formatted list of allowed file extensions
 */
function getAllowedExtensionsDisplay(tier: Tier): string {
  const extensions = FILE_EXTENSIONS_BY_TIER[tier];
  if (extensions.length === 0) {
    return 'none';
  }
  return extensions.map(ext => ext.toUpperCase()).join(', ');
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate file size against tier limits
 *
 * @param fileSize - File size in bytes
 * @param tier - Organization tier
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = validateFileSize(50 * 1024 * 1024, 'standard');
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 * ```
 */
export function validateFileSize(fileSize: number, tier: Tier): ValidationResult {
  // Free tier doesn't allow uploads
  if (tier === 'free') {
    return {
      valid: false,
      error: 'File uploads not allowed for free tier',
      userMessage: `Your Free tier plan does not support file uploads.${getUpgradeMessage(tier)}`,
      suggestedTier: 'basic',
    };
  }

  // Check if file size is positive
  if (fileSize <= 0) {
    return {
      valid: false,
      error: 'File size must be positive',
      userMessage: 'Invalid file: File size must be greater than 0 bytes.',
    };
  }

  // Check against maximum file size
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE_MB} MB`,
      userMessage: `File is too large. Maximum file size is ${MAX_FILE_SIZE_MB} MB (your file: ${formatFileSize(fileSize)}).`,
    };
  }

  return {
    valid: true,
  };
}

/**
 * Validate file MIME type against tier restrictions
 *
 * @param mimeType - File MIME type
 * @param tier - Organization tier
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = validateFileMimeType('application/pdf', 'basic_plus');
 * if (!result.valid) {
 *   console.error(result.userMessage);
 * }
 * ```
 */
export function validateFileMimeType(mimeType: string, tier: Tier): ValidationResult {
  const allowedMimeTypes = MIME_TYPES_BY_TIER[tier];
  const allowedExtensions = getAllowedExtensionsDisplay(tier);

  // Free tier doesn't allow uploads
  if (tier === 'free') {
    return {
      valid: false,
      error: 'File uploads not allowed for free tier',
      userMessage: `Your Free tier plan does not support file uploads.${getUpgradeMessage(tier)}`,
      suggestedTier: 'basic',
    };
  }

  // Check if MIME type is in allowed list
  if (!(allowedMimeTypes as readonly string[]).includes(mimeType)) {
    // Determine which tier supports this MIME type
    let suggestedTier: Tier | undefined;
    for (const [tierKey, mimeTypes] of Object.entries(MIME_TYPES_BY_TIER)) {
      if ((mimeTypes as readonly string[]).includes(mimeType)) {
        suggestedTier = tierKey as Tier;
        break;
      }
    }

    const upgradeMsg = suggestedTier
      ? ` Upgrade to ${TIER_DISPLAY_NAMES[suggestedTier]} to upload this file type.`
      : ' This file type is not supported on any tier.';

    return {
      valid: false,
      error: `File type '${mimeType}' not allowed for ${tier} tier`,
      userMessage: `File type not supported. Your ${TIER_DISPLAY_NAMES[tier]} plan allows: ${allowedExtensions}.${upgradeMsg}`,
      suggestedTier,
    };
  }

  return {
    valid: true,
  };
}

/**
 * Validate file count against tier limits
 *
 * @param currentCount - Current number of files in the course
 * @param tier - Organization tier
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = validateFileCount(2, 'basic_plus');
 * if (!result.valid) {
 *   throw new ValidationError(result.userMessage);
 * }
 * ```
 */
export function validateFileCount(currentCount: number, tier: Tier): ValidationResult {
  const limit = FILE_COUNT_LIMITS_BY_TIER[tier];

  // Free tier doesn't allow uploads
  if (tier === 'free') {
    return {
      valid: false,
      error: 'File uploads not allowed for free tier',
      userMessage: `Your Free tier plan does not support file uploads.${getUpgradeMessage(tier)}`,
      suggestedTier: 'basic',
    };
  }

  // Check if current count exceeds limit
  if (currentCount >= limit) {
    // Find next tier with higher limit
    let suggestedTier: Tier | undefined;
    for (const [tierKey, tierLimit] of Object.entries(FILE_COUNT_LIMITS_BY_TIER)) {
      if (tierLimit > limit) {
        suggestedTier = tierKey as Tier;
        break;
      }
    }

    const upgradeMsg = suggestedTier
      ? ` Upgrade to ${TIER_DISPLAY_NAMES[suggestedTier]} to upload more files (up to ${FILE_COUNT_LIMITS_BY_TIER[suggestedTier]} per course).`
      : '';

    return {
      valid: false,
      error: `File count limit reached for ${tier} tier (${limit} files)`,
      userMessage: `File upload limit reached. Your ${TIER_DISPLAY_NAMES[tier]} plan allows ${limit} file${limit === 1 ? '' : 's'} per course.${upgradeMsg}`,
      suggestedTier,
    };
  }

  return {
    valid: true,
  };
}

/**
 * Validate a file against all tier-based restrictions
 *
 * This is the main validation function that should be used for file uploads.
 * It performs comprehensive validation including size, MIME type, and count checks.
 *
 * @param file - File input to validate
 * @param tier - Organization tier
 * @param currentFileCount - Current number of files in the course
 * @returns Detailed validation result with all checks
 * @throws {ValidationError} If validation fails (when throwOnError is true)
 *
 * @example
 * ```typescript
 * const result = validateFile(
 *   { filename: 'document.pdf', fileSize: 1024000, mimeType: 'application/pdf' },
 *   'standard',
 *   2
 * );
 *
 * if (!result.valid) {
 *   console.error('Validation failed:', result.error);
 *   console.error('User message:', result.userMessage);
 * }
 * ```
 */
export function validateFile(
  file: FileInput,
  tier: Tier,
  currentFileCount: number
): FileValidationResult {
  // Perform individual validation checks
  const sizeCheck = validateFileSize(file.fileSize, tier);
  const mimeTypeCheck = validateFileMimeType(file.mimeType, tier);
  const countCheck = validateFileCount(currentFileCount, tier);

  // Determine overall validity
  const valid = sizeCheck.valid && mimeTypeCheck.valid && countCheck.valid;

  // Collect error messages (prioritize count, then MIME type, then size)
  let error: string | undefined;
  let userMessage: string | undefined;
  let suggestedTier: Tier | undefined;

  if (!countCheck.valid) {
    error = countCheck.error;
    userMessage = countCheck.userMessage;
    suggestedTier = countCheck.suggestedTier;
  } else if (!mimeTypeCheck.valid) {
    error = mimeTypeCheck.error;
    userMessage = mimeTypeCheck.userMessage;
    suggestedTier = mimeTypeCheck.suggestedTier;
  } else if (!sizeCheck.valid) {
    error = sizeCheck.error;
    userMessage = sizeCheck.userMessage;
    suggestedTier = sizeCheck.suggestedTier;
  }

  return {
    valid,
    error,
    userMessage,
    suggestedTier,
    checks: {
      size: sizeCheck,
      mimeType: mimeTypeCheck,
      count: countCheck,
    },
  };
}

/**
 * Validate a file and throw an error if validation fails
 *
 * Convenience function that wraps `validateFile` and throws a ValidationError
 * if validation fails. Use this in API endpoints where you want automatic error handling.
 *
 * @param file - File input to validate
 * @param tier - Organization tier
 * @param currentFileCount - Current number of files in the course
 * @throws {ValidationError} If validation fails
 *
 * @example
 * ```typescript
 * try {
 *   validateFileOrThrow(fileInput, userTier, existingFileCount);
 *   // Proceed with file upload
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     return res.status(400).json({ error: error.message });
 *   }
 *   throw error;
 * }
 * ```
 */
export function validateFileOrThrow(file: FileInput, tier: Tier, currentFileCount: number): void {
  const result = validateFile(file, tier, currentFileCount);

  if (!result.valid) {
    throw new ValidationError(result.userMessage || result.error || 'File validation failed');
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get file upload limits for a specific tier
 *
 * @param tier - Organization tier
 * @returns File upload limits and restrictions
 *
 * @example
 * ```typescript
 * const limits = getFileUploadLimits('standard');
 * console.log(`Max files: ${limits.maxFiles}`);
 * console.log(`Allowed formats: ${limits.allowedExtensions.join(', ')}`);
 * ```
 */
export function getFileUploadLimits(tier: Tier) {
  const maxFileSize = FILE_SIZE_LIMITS_BY_TIER[tier] || MAX_FILE_SIZE_BYTES;
  return {
    maxFiles: FILE_COUNT_LIMITS_BY_TIER[tier],
    maxFileSize,
    maxFileSizeMB: maxFileSize / (1024 * 1024),
    allowedMimeTypes: MIME_TYPES_BY_TIER[tier],
    allowedExtensions: FILE_EXTENSIONS_BY_TIER[tier],
    allowedExtensionsDisplay: getAllowedExtensionsDisplay(tier),
    uploadsEnabled: tier !== 'free',
  };
}

/**
 * Check if a file type is supported by any tier
 *
 * @param mimeType - MIME type to check
 * @returns True if the MIME type is supported by at least one tier
 */
export function isFileTypeSupported(mimeType: string): boolean {
  return Object.values(MIME_TYPES_BY_TIER).some(mimeTypes =>
    (mimeTypes as readonly string[]).includes(mimeType)
  );
}

/**
 * Get the minimum tier required for a specific file type
 *
 * @param mimeType - MIME type to check
 * @returns Minimum tier required, or null if not supported
 *
 * @example
 * ```typescript
 * const tier = getMinimumTierForFileType('image/png');
 * console.log(`PNG requires: ${tier}`); // 'premium'
 * ```
 */
export function getMinimumTierForFileType(mimeType: string): Tier | null {
  const tierOrder: Tier[] = ['trial', 'free', 'basic', 'standard', 'premium'];

  for (const tier of tierOrder) {
    if ((MIME_TYPES_BY_TIER[tier] as readonly string[]).includes(mimeType)) {
      return tier === 'free' ? null : tier;
    }
  }

  return null;
}
