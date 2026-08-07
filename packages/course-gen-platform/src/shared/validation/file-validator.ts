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
  MIME_TYPES_BY_EXTENSION,
  TIER_ORDER,
  canonicalMimeTypeForExtension,
  fileExtensionOf,
  mimeTypeMatchesExtension,
} from '@megacampus/shared-types';
import { ValidationError } from '../../server/errors/typed-errors';
import { getEffectiveTier, type Role } from '../tier/superadmin-bypass';
import { formatFileSize } from '@/shared/workspace-utils';

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
    extension: ValidationResult;
  };
  /**
   * MIME type the platform should store, derived from the extension rather than
   * from the client. Present only when validation passed.
   */
  canonicalMimeType?: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum file size in megabytes (for display)
 */
const MAX_FILE_SIZE_MB = MAX_FILE_SIZE_BYTES / (1024 * 1024);

/**
 * Tiers a customer can actually be told to move TO.
 *
 * `free` is not a destination and `trial` is a seven-day evaluation, not a
 * plan. `TIER_ORDER` places trial between basic and standard, so a naive walk
 * of the hierarchy answers "PDF requires Trial" — true by the ordering and
 * useless as advice, because the customer cannot buy it and it expires.
 */
const UPGRADE_TIERS: readonly Tier[] = TIER_ORDER.filter(
  (tier): tier is Tier => tier !== 'free' && tier !== 'trial'
);

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
const TIER_NAMES: Record<Tier, string> = {
  trial: 'Trial',
  free: 'Free',
  basic: 'Basic',
  standard: 'Standard',
  premium: 'Premium',
};

/**
 * Display name for a tier, total over unknown values.
 *
 * An organization row can carry a tier string the constants no longer define.
 * Rendering that verbatim is better than rendering `undefined` at the user.
 */
function tierName(tier: Tier): string {
  return TIER_NAMES[tier] ?? String(tier);
}

// ============================================================================
// Helper Functions
// ============================================================================

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
  return ` Upgrade to ${tierName(suggested)} to unlock this feature.`;
}

/**
 * Get allowed extensions for display
 * @param tier - Organization tier
 * @returns Formatted list of allowed file extensions
 */
function allowedExtensionsFor(tier: Tier): readonly string[] {
  // A tier the constants do not know about allows nothing. It used to throw a
  // TypeError here instead, which reached the API as a 500 on what is really a
  // configuration problem — an organization row carrying a tier value that no
  // longer exists.
  return (FILE_EXTENSIONS_BY_TIER[tier] as readonly string[] | undefined) ?? [];
}

function getAllowedExtensionsDisplay(tier: Tier): string {
  const extensions = allowedExtensionsFor(tier);
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
 * @param userRole - Optional user role (superadmins bypass tier restrictions)
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = validateFileSize(50 * 1024 * 1024, 'standard');
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 *
 * // Superadmin bypass
 * const superadminResult = validateFileSize(50 * 1024 * 1024, 'free', 'superadmin');
 * // Returns valid: true (uses premium tier limits)
 * ```
 */
export function validateFileSize(fileSize: number, tier: Tier, userRole?: Role): ValidationResult {
  // Apply superadmin bypass - use effective tier
  const effectiveTier = getEffectiveTier(userRole, tier);

  // Free tier doesn't allow uploads
  if (effectiveTier === 'free') {
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

  // Get tier-specific file size limit
  const tierLimit = FILE_SIZE_LIMITS_BY_TIER[effectiveTier];
  const tierLimitMB = tierLimit / (1024 * 1024);

  // Check against tier-specific file size limit
  if (fileSize > tierLimit) {
    // Find next tier with higher limit for upgrade suggestion
    let suggestedTier: Tier | undefined;
    const tierOrder: Tier[] = ['basic', 'standard', 'premium'];
    for (const nextTier of tierOrder) {
      const nextTierLimit = FILE_SIZE_LIMITS_BY_TIER[nextTier];
      if (nextTierLimit > tierLimit && fileSize <= nextTierLimit) {
        suggestedTier = nextTier;
        break;
      }
    }

    const upgradeMsg = suggestedTier
      ? ` Upgrade to ${tierName(suggestedTier)} to upload files up to ${FILE_SIZE_LIMITS_BY_TIER[suggestedTier] / (1024 * 1024)} MB.`
      : '';

    return {
      valid: false,
      error: `File size (${formatFileSize(fileSize)}) exceeds ${tier} tier limit (${tierLimitMB} MB)`,
      userMessage: `File is too large. Your ${tierName(tier)} plan allows files up to ${tierLimitMB} MB (your file: ${formatFileSize(fileSize)}).${upgradeMsg}`,
      suggestedTier,
    };
  }

  // Also check against absolute maximum (premium tier max)
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
 * @param userRole - Optional user role (superadmins bypass tier restrictions)
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = validateFileMimeType('application/pdf', 'basic_plus');
 * if (!result.valid) {
 *   console.error(result.userMessage);
 * }
 *
 * // Superadmin bypass
 * const superadminResult = validateFileMimeType('image/png', 'basic', 'superadmin');
 * // Returns valid: true (uses premium tier MIME types)
 * ```
 */
export function validateFileMimeType(
  mimeType: string,
  tier: Tier,
  userRole?: Role
): ValidationResult {
  // Apply superadmin bypass - use effective tier
  const effectiveTier = getEffectiveTier(userRole, tier);

  const allowedMimeTypes =
    (MIME_TYPES_BY_TIER[effectiveTier] as readonly string[] | undefined) ?? [];
  const allowedExtensions = getAllowedExtensionsDisplay(effectiveTier);

  // Free tier doesn't allow uploads
  if (effectiveTier === 'free') {
    return {
      valid: false,
      error: 'File uploads not allowed for free tier',
      userMessage: `Your Free tier plan does not support file uploads.${getUpgradeMessage(tier)}`,
      suggestedTier: 'basic',
    };
  }

  // Check if MIME type is in allowed list
  if (!allowedMimeTypes.includes(mimeType)) {
    // Walk the DECLARED hierarchy, not the object's key order. `MIME_TYPES_BY_TIER`
    // happens to list `trial` first, so iterating its entries recommended Trial
    // for a PDF when Basic-to-Standard is the honest upgrade — a suggestion that
    // is both wrong and unhelpful, since Trial expires in seven days.
    const suggestedTier = UPGRADE_TIERS.find(tierKey =>
      (MIME_TYPES_BY_TIER[tierKey] as readonly string[]).includes(mimeType)
    );

    const upgradeMsg = suggestedTier
      ? ` Upgrade to ${tierName(suggestedTier)} to upload this file type.`
      : ' This file type is not supported on any tier.';

    return {
      valid: false,
      error: `File type '${mimeType}' not allowed for ${tier} tier`,
      userMessage: `File type not supported. Your ${tierName(tier)} plan allows: ${allowedExtensions}.${upgradeMsg}`,
      suggestedTier,
    };
  }

  return {
    valid: true,
  };
}

/**
 * Validate that the filename's extension is allowed and that the declared MIME
 * type agrees with it (FR-017).
 *
 * Two distinct failures live here, and they are worth keeping distinct:
 *
 * - an extension no tier accepts, or one this tier does not accept yet;
 * - an extension this tier accepts, announced as a type it cannot be.
 *
 * The second is the spoof case. Without it the server trusted whatever MIME the
 * client sent: a file could be called `report.pdf`, declared `text/plain` and
 * routed to the plain-text extractor, or called `notes.txt`, declared
 * `application/pdf` and sent to Docling. Nothing downstream re-checked, because
 * `mime_type` from `file_catalog` is what the processing stage routes on.
 *
 * @param filename - Original filename, extension included
 * @param mimeType - MIME type declared by the client
 * @param tier - Organization tier
 * @param userRole - Optional user role (superadmins bypass tier restrictions)
 */
export function validateFileExtension(
  filename: string,
  mimeType: string,
  tier: Tier,
  userRole?: Role
): ValidationResult {
  const effectiveTier = getEffectiveTier(userRole, tier);

  if (effectiveTier === 'free') {
    return {
      valid: false,
      error: 'File uploads not allowed for free tier',
      userMessage: `Your Free tier plan does not support file uploads.${getUpgradeMessage(tier)}`,
      suggestedTier: 'basic',
    };
  }

  const extension = fileExtensionOf(filename);
  if (!extension) {
    return {
      valid: false,
      error: `Filename '${filename}' has no extension`,
      userMessage: `File "${filename}" has no extension, so its format cannot be determined. Rename it with the correct extension and upload again.`,
    };
  }

  const allowedExtensions = allowedExtensionsFor(effectiveTier);
  if (!allowedExtensions.includes(extension)) {
    const suggestedTier = UPGRADE_TIERS.find(tierKey =>
      (FILE_EXTENSIONS_BY_TIER[tierKey] as readonly string[]).includes(extension)
    );

    const upgradeMsg = suggestedTier
      ? ` Upgrade to ${tierName(suggestedTier)} to upload this file type.`
      : ' This file type is not supported on any tier.';

    return {
      valid: false,
      error: `File extension '.${extension}' not allowed for ${tier} tier`,
      userMessage: `File type not supported. Your ${tierName(tier)} plan allows: ${getAllowedExtensionsDisplay(effectiveTier)}.${upgradeMsg}`,
      suggestedTier,
    };
  }

  if (!mimeTypeMatchesExtension(extension, mimeType)) {
    const expected = MIME_TYPES_BY_EXTENSION[extension]?.join(', ') ?? 'none';
    return {
      valid: false,
      error: `Declared MIME type '${mimeType}' does not match extension '.${extension}' (expected one of: ${expected})`,
      userMessage: `File "${filename}" declares a type that does not match its .${extension.toUpperCase()} extension. Upload the original file without renaming it.`,
    };
  }

  return { valid: true };
}

/**
 * Validate file count against tier limits
 *
 * @param currentCount - Current number of files in the course
 * @param tier - Organization tier
 * @param userRole - Optional user role (superadmins bypass tier restrictions)
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = validateFileCount(2, 'basic_plus');
 * if (!result.valid) {
 *   throw new ValidationError(result.userMessage);
 * }
 *
 * // Superadmin bypass
 * const superadminResult = validateFileCount(5, 'basic', 'superadmin');
 * // Returns valid: true (uses premium tier file count limit of 10)
 * ```
 */
export function validateFileCount(
  currentCount: number,
  tier: Tier,
  userRole?: Role
): ValidationResult {
  // Apply superadmin bypass - use effective tier
  const effectiveTier = getEffectiveTier(userRole, tier);

  const limit = FILE_COUNT_LIMITS_BY_TIER[effectiveTier] ?? 0;

  // Free tier doesn't allow uploads
  if (effectiveTier === 'free') {
    return {
      valid: false,
      error: 'File uploads not allowed for free tier',
      userMessage: `Your Free tier plan does not support file uploads.${getUpgradeMessage(tier)}`,
      suggestedTier: 'basic',
    };
  }

  // Check if current count exceeds limit
  if (currentCount >= limit) {
    // First tier ABOVE this one in the declared hierarchy that allows more
    // files. Iterating object keys recommended Trial to a Basic customer.
    const suggestedTier = UPGRADE_TIERS.slice(UPGRADE_TIERS.indexOf(effectiveTier) + 1).find(
      tierKey => FILE_COUNT_LIMITS_BY_TIER[tierKey] > limit
    );

    const upgradeMsg = suggestedTier
      ? ` Upgrade to ${tierName(suggestedTier)} to upload more files (up to ${FILE_COUNT_LIMITS_BY_TIER[suggestedTier]} per course).`
      : '';

    return {
      valid: false,
      error: `File count limit reached for ${tier} tier (${limit} files)`,
      userMessage: `File upload limit reached. Your ${tierName(tier)} plan allows ${limit} file${limit === 1 ? '' : 's'} per course.${upgradeMsg}`,
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
 * @param userRole - Optional user role (superadmins bypass tier restrictions)
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
 *
 * // Superadmin bypass - all tier restrictions use premium limits
 * const superadminResult = validateFile(
 *   { filename: 'image.png', fileSize: 50 * 1024 * 1024, mimeType: 'image/png' },
 *   'free',
 *   5,
 *   'superadmin'
 * );
 * // Returns valid: true
 * ```
 */
export function validateFile(
  file: FileInput,
  tier: Tier,
  currentFileCount: number,
  userRole?: Role
): FileValidationResult {
  // Perform individual validation checks (userRole is passed to each for superadmin bypass)
  const sizeCheck = validateFileSize(file.fileSize, tier, userRole);
  const countCheck = validateFileCount(currentFileCount, tier, userRole);
  const extensionCheck = validateFileExtension(file.filename, file.mimeType, tier, userRole);

  // Once the extension is known good and the declared type agrees with it, the
  // TIER gate is about the format, not about which of that format's accepted
  // spellings the browser happened to send. Checking the canonical type is what
  // lets `.tex` announced as `application/x-tex` through while keeping the tier
  // list itself down to one entry per format.
  const extension = fileExtensionOf(file.filename);
  const canonicalMimeType =
    extensionCheck.valid && extension ? canonicalMimeTypeForExtension(extension) : null;
  const mimeTypeCheck = validateFileMimeType(canonicalMimeType ?? file.mimeType, tier, userRole);

  // Determine overall validity
  const valid = sizeCheck.valid && mimeTypeCheck.valid && countCheck.valid && extensionCheck.valid;

  // Collect error messages (prioritize count, then MIME type, then size)
  let error: string | undefined;
  let userMessage: string | undefined;
  let suggestedTier: Tier | undefined;

  if (!countCheck.valid) {
    error = countCheck.error;
    userMessage = countCheck.userMessage;
    suggestedTier = countCheck.suggestedTier;
  } else if (!extensionCheck.valid) {
    error = extensionCheck.error;
    userMessage = extensionCheck.userMessage;
    suggestedTier = extensionCheck.suggestedTier;
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
    ...(valid && canonicalMimeType ? { canonicalMimeType } : {}),
    checks: {
      size: sizeCheck,
      mimeType: mimeTypeCheck,
      count: countCheck,
      extension: extensionCheck,
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
 * @param userRole - Optional user role (superadmins bypass tier restrictions)
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
 *
 * // Superadmin bypass
 * validateFileOrThrow(fileInput, 'free', 5, 'superadmin');
 * // No error thrown - uses premium tier limits
 * ```
 */
export function validateFileOrThrow(
  file: FileInput,
  tier: Tier,
  currentFileCount: number,
  userRole?: Role
): void {
  const result = validateFile(file, tier, currentFileCount, userRole);

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
 * @param userRole - Optional user role (superadmins get premium tier limits)
 * @returns File upload limits and restrictions
 *
 * @example
 * ```typescript
 * const limits = getFileUploadLimits('standard');
 * console.log(`Max files: ${limits.maxFiles}`);
 * console.log(`Allowed formats: ${limits.allowedExtensions.join(', ')}`);
 *
 * // Superadmin gets premium limits
 * const superadminLimits = getFileUploadLimits('free', 'superadmin');
 * // Returns premium tier limits
 * ```
 */
export function getFileUploadLimits(tier: Tier, userRole?: Role) {
  // Apply superadmin bypass - use effective tier
  const effectiveTier = getEffectiveTier(userRole, tier);

  const maxFileSize = FILE_SIZE_LIMITS_BY_TIER[effectiveTier] || MAX_FILE_SIZE_BYTES;
  return {
    maxFiles: FILE_COUNT_LIMITS_BY_TIER[effectiveTier],
    maxFileSize,
    maxFileSizeMB: maxFileSize / (1024 * 1024),
    allowedMimeTypes: MIME_TYPES_BY_TIER[effectiveTier],
    allowedExtensions: FILE_EXTENSIONS_BY_TIER[effectiveTier],
    allowedExtensionsDisplay: getAllowedExtensionsDisplay(effectiveTier),
    uploadsEnabled: effectiveTier !== 'free',
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
  // `TIER_ORDER` is the hierarchy; the local array this used to carry put
  // `trial` first and therefore answered "TXT requires Trial" when Basic has it.
  return (
    UPGRADE_TIERS.find(tier =>
      (MIME_TYPES_BY_TIER[tier] as readonly string[]).includes(mimeType)
    ) ?? null
  );
}
