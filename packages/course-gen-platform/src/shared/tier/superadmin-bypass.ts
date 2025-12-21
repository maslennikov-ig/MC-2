/**
 * SuperAdmin tier bypass utilities
 *
 * Provides helper functions to check and apply superadmin privileges
 * for bypassing tier-based restrictions in the multi-tenant platform.
 *
 * @module shared/tier/superadmin-bypass
 */

import type { Database } from '@megacampus/shared-types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Organization tier from database enum
 */
export type Tier = Database['public']['Enums']['tier'];

/**
 * User role from database enum
 */
export type Role = Database['public']['Enums']['role'];

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Premium tier used for superadmin bypass
 */
const SUPERADMIN_EFFECTIVE_TIER: Tier = 'premium';

/**
 * Maximum limits for superadmin (equivalent to premium tier values)
 *
 * These limits are applied when a superadmin bypasses tier restrictions:
 * - Storage quota: 10 GB
 * - Max file size: 100 MB
 * - Max files per course: 10
 * - Max concurrent jobs: 10
 */
export const SUPERADMIN_LIMITS = {
  /** Storage quota in bytes (10 GB) */
  storageQuotaBytes: 10737418240,
  /** Maximum file size in bytes (100 MB) */
  maxFileSizeBytes: 104857600,
  /** Maximum files per course */
  maxFilesPerCourse: 10,
  /** Maximum concurrent generation jobs */
  maxConcurrentJobs: 10,
} as const;

// ============================================================================
// FUNCTIONS
// ============================================================================

/**
 * Check if a user role is superadmin
 *
 * @param userRole - The user's role
 * @returns True if the user is a superadmin
 *
 * @example
 * ```typescript
 * if (isSuperAdmin(user.role)) {
 *   // Apply superadmin privileges
 * }
 * ```
 */
export function isSuperAdmin(userRole: Role | undefined | null): userRole is 'superadmin' {
  return userRole === 'superadmin';
}

/**
 * Get effective tier for a user - superadmins get premium tier
 *
 * This function allows superadmins to bypass organization tier restrictions
 * by treating them as if they were on the premium tier.
 *
 * @param userRole - The user's role (optional for backward compatibility)
 * @param orgTier - The organization's actual tier
 * @returns The effective tier to use for validation
 *
 * @example
 * ```typescript
 * // Regular user: uses org tier
 * getEffectiveTier('instructor', 'basic'); // Returns 'basic'
 *
 * // Superadmin: always gets premium
 * getEffectiveTier('superadmin', 'basic'); // Returns 'premium'
 *
 * // Backward compatibility: no role specified
 * getEffectiveTier(undefined, 'basic'); // Returns 'basic'
 * ```
 */
export function getEffectiveTier(
  userRole: Role | undefined | null,
  orgTier: Tier
): Tier {
  if (isSuperAdmin(userRole)) {
    return SUPERADMIN_EFFECTIVE_TIER;
  }
  return orgTier;
}

/**
 * Check if user bypasses tier restrictions
 *
 * Use this when you need a simple boolean check before applying
 * tier-based restrictions.
 *
 * @param userRole - The user's role (optional for backward compatibility)
 * @returns True if the user should bypass tier restrictions
 *
 * @example
 * ```typescript
 * if (shouldBypassTierRestrictions(user.role)) {
 *   // Skip tier validation entirely
 *   return { allowed: true };
 * }
 * // Apply normal tier-based validation
 * ```
 */
export function shouldBypassTierRestrictions(
  userRole: Role | undefined | null
): boolean {
  return isSuperAdmin(userRole);
}

/**
 * Get superadmin storage quota bypass value
 *
 * @returns Storage quota in bytes for superadmin (10 GB)
 */
export function getSuperAdminStorageQuota(): number {
  return SUPERADMIN_LIMITS.storageQuotaBytes;
}

/**
 * Get superadmin max file size bypass value
 *
 * @returns Maximum file size in bytes for superadmin (100 MB)
 */
export function getSuperAdminMaxFileSize(): number {
  return SUPERADMIN_LIMITS.maxFileSizeBytes;
}

/**
 * Get superadmin max files per course bypass value
 *
 * @returns Maximum files per course for superadmin (10)
 */
export function getSuperAdminMaxFilesPerCourse(): number {
  return SUPERADMIN_LIMITS.maxFilesPerCourse;
}

/**
 * Get superadmin max concurrent jobs bypass value
 *
 * @returns Maximum concurrent jobs for superadmin (10)
 */
export function getSuperAdminMaxConcurrentJobs(): number {
  return SUPERADMIN_LIMITS.maxConcurrentJobs;
}
