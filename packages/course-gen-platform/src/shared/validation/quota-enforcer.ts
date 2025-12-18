/**
 * Storage quota enforcement utility for multi-tenant course generation platform
 *
 * This module provides real-time storage quota checking and enforcement with atomic
 * operations to prevent race conditions during concurrent file uploads.
 *
 * @module shared/validation/quota-enforcer
 */

import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { QuotaExceededError } from '@/server/errors/typed-errors';
import type { Database } from '@megacampus/shared-types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of quota check operation
 */
export interface QuotaCheckResult {
  /** Whether the file can be uploaded without exceeding quota */
  allowed: boolean;
  /** Current storage usage in bytes */
  currentUsage: number;
  /** Total quota in bytes */
  totalQuota: number;
  /** Available space in bytes */
  availableSpace: number;
  /** Size of file being checked in bytes */
  fileSize: number;
  /** Usage after upload would complete (if allowed) */
  projectedUsage: number;
  /** Human-readable current usage (e.g., "45.2 MB") */
  currentUsageFormatted: string;
  /** Human-readable total quota (e.g., "100 MB") */
  totalQuotaFormatted: string;
  /** Human-readable available space */
  availableSpaceFormatted: string;
}

/**
 * Quota information for an organization
 */
export interface QuotaInfo {
  /** Organization ID */
  organizationId: string;
  /** Current storage usage in bytes */
  storageUsedBytes: number;
  /** Total quota in bytes */
  storageQuotaBytes: number;
  /** Available space in bytes */
  availableBytes: number;
  /** Usage percentage (0-100) */
  usagePercentage: number;
  /** Organization tier */
  tier: Database['public']['Enums']['tier'];
  /** Human-readable usage */
  storageUsedFormatted: string;
  /** Human-readable quota */
  storageQuotaFormatted: string;
  /** Human-readable available space */
  availableFormatted: string;
}

/**
 * Tier-based storage quotas in bytes
 */
export const TIER_QUOTAS: Record<Database['public']['Enums']['tier'], number> = {
  trial: 1073741824, // 1 GB
  free: 10485760, // 10 MB
  basic: 104857600, // 100 MB
  standard: 1073741824, // 1 GB
  premium: 10737418240, // 10 GB
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format bytes to human-readable string
 * @param bytes - Number of bytes to format
 * @returns Formatted string (e.g., "45.2 MB", "1.5 GB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Calculate usage percentage
 * @param used - Bytes used
 * @param total - Total bytes available
 * @returns Percentage (0-100)
 */
export function calculateUsagePercentage(used: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(100, Math.max(0, (used / total) * 100));
}

// ============================================================================
// QUOTA CHECK
// ============================================================================

/**
 * Check if a file upload would exceed organization's storage quota
 *
 * Performs a real-time query to get current usage and compares against quota.
 * This should be called BEFORE starting file upload to prevent quota violations.
 *
 * @param organizationId - UUID of the organization
 * @param fileSize - Size of file to upload in bytes
 * @returns Promise with quota check result
 * @throws Error if database query fails
 *
 * @example
 * ```typescript
 * const result = await checkQuota(orgId, 5242880); // 5 MB file
 * if (!result.allowed) {
 *   throw new QuotaExceededError(
 *     `Upload would exceed quota. Using ${result.currentUsageFormatted} of ${result.totalQuotaFormatted}`
 *   );
 * }
 * ```
 */
export async function checkQuota(
  organizationId: string,
  fileSize: number
): Promise<QuotaCheckResult> {
  const supabase = getSupabaseAdmin();

  // Validate inputs
  if (!organizationId || typeof organizationId !== 'string') {
    throw new Error('Invalid organizationId: must be a non-empty string');
  }
  if (typeof fileSize !== 'number' || fileSize <= 0) {
    throw new Error('Invalid fileSize: must be a positive number');
  }

  // Query organization's current storage usage and quota
  const { data: org, error } = await supabase
    .from('organizations')
    .select('storage_used_bytes, storage_quota_bytes')
    .eq('id', organizationId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch organization quota: ${error.message}`);
  }

  if (!org) {
    throw new Error(`Organization not found: ${organizationId}`);
  }

  const currentUsage = org.storage_used_bytes;
  const totalQuota = org.storage_quota_bytes;
  const projectedUsage = currentUsage + fileSize;
  const availableSpace = totalQuota - currentUsage;
  const allowed = projectedUsage <= totalQuota;

  return {
    allowed,
    currentUsage,
    totalQuota,
    availableSpace,
    fileSize,
    projectedUsage,
    currentUsageFormatted: formatBytes(currentUsage),
    totalQuotaFormatted: formatBytes(totalQuota),
    availableSpaceFormatted: formatBytes(availableSpace),
  };
}

// ============================================================================
// ATOMIC QUOTA OPERATIONS
// ============================================================================

/**
 * Atomically increment organization's storage usage
 *
 * Uses PostgreSQL RPC function for atomic update to prevent race conditions
 * during concurrent uploads. The database constraint ensures usage never exceeds quota.
 *
 * @param organizationId - UUID of the organization
 * @param fileSize - Size to increment in bytes
 * @returns Promise that resolves when increment completes
 * @throws QuotaExceededError if increment would violate quota constraint
 * @throws Error if database operation fails
 *
 * @example
 * ```typescript
 * try {
 *   await incrementQuota(orgId, 5242880); // Add 5 MB
 *   // File upload succeeded, quota updated
 * } catch (error) {
 *   if (error instanceof QuotaExceededError) {
 *     // Handle quota exceeded
 *   }
 * }
 * ```
 */
export async function incrementQuota(organizationId: string, fileSize: number): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Validate inputs
  if (!organizationId || typeof organizationId !== 'string') {
    throw new Error('Invalid organizationId: must be a non-empty string');
  }
  if (typeof fileSize !== 'number' || fileSize <= 0) {
    throw new Error('Invalid fileSize: must be a positive number');
  }

  // Use RPC function for atomic increment with constraint checking
  const { data, error } = await supabase.rpc('increment_storage_quota', {
    org_id: organizationId,
    size_bytes: fileSize,
  });

  if (error) {
    // Check if error is due to constraint violation
    if (error.message.includes('storage_check') || error.message.includes('quota')) {
      const info = await getQuotaInfo(organizationId);
      throw new QuotaExceededError(
        `Storage quota exceeded. Using ${info.storageUsedFormatted} of ${info.storageQuotaFormatted}. ` +
          `Available: ${info.availableFormatted}. Attempted to add: ${formatBytes(fileSize)}.`
      );
    }
    throw new Error(`Failed to increment storage quota: ${error.message}`);
  }

  // RPC function returns false if organization not found
  if (data === false) {
    throw new Error(`Organization not found: ${organizationId}`);
  }
}

/**
 * Atomically decrement organization's storage usage
 *
 * Uses PostgreSQL RPC function for atomic update. Should be called after
 * successful file deletion to free up quota space.
 *
 * @param organizationId - UUID of the organization
 * @param fileSize - Size to decrement in bytes
 * @returns Promise that resolves when decrement completes
 * @throws Error if database operation fails
 *
 * @example
 * ```typescript
 * // After deleting a file
 * await decrementQuota(orgId, deletedFileSize);
 * ```
 */
export async function decrementQuota(organizationId: string, fileSize: number): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Validate inputs
  if (!organizationId || typeof organizationId !== 'string') {
    throw new Error('Invalid organizationId: must be a non-empty string');
  }
  if (typeof fileSize !== 'number' || fileSize <= 0) {
    throw new Error('Invalid fileSize: must be a positive number');
  }

  // Use RPC function for atomic decrement
  const { data, error } = await supabase.rpc('decrement_storage_quota', {
    org_id: organizationId,
    size_bytes: fileSize,
  });

  if (error) {
    throw new Error(`Failed to decrement storage quota: ${error.message}`);
  }

  // RPC function returns false if organization not found
  if (data === false) {
    throw new Error(`Organization not found: ${organizationId}`);
  }
}

// ============================================================================
// QUOTA INFO
// ============================================================================

/**
 * Get comprehensive quota information for an organization
 *
 * Retrieves current storage usage, quota limits, and calculated metrics.
 * Useful for displaying quota status to users.
 *
 * @param organizationId - UUID of the organization
 * @returns Promise with quota information
 * @throws Error if database query fails or organization not found
 *
 * @example
 * ```typescript
 * const info = await getQuotaInfo(orgId);
 * console.log(`Using ${info.usagePercentage.toFixed(1)}% of storage`);
 * console.log(`${info.availableFormatted} remaining`);
 * ```
 */
export async function getQuotaInfo(organizationId: string): Promise<QuotaInfo> {
  const supabase = getSupabaseAdmin();

  // Validate input
  if (!organizationId || typeof organizationId !== 'string') {
    throw new Error('Invalid organizationId: must be a non-empty string');
  }

  // Query organization quota information
  const { data: org, error } = await supabase
    .from('organizations')
    .select('id, tier, storage_used_bytes, storage_quota_bytes')
    .eq('id', organizationId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch organization info: ${error.message}`);
  }

  if (!org) {
    throw new Error(`Organization not found: ${organizationId}`);
  }

  const availableBytes = org.storage_quota_bytes - org.storage_used_bytes;
  const usagePercentage = calculateUsagePercentage(org.storage_used_bytes, org.storage_quota_bytes);

  return {
    organizationId: org.id,
    storageUsedBytes: org.storage_used_bytes,
    storageQuotaBytes: org.storage_quota_bytes,
    availableBytes,
    usagePercentage,
    tier: org.tier || 'free', // Default to 'free' if tier is null
    storageUsedFormatted: formatBytes(org.storage_used_bytes),
    storageQuotaFormatted: formatBytes(org.storage_quota_bytes),
    availableFormatted: formatBytes(availableBytes),
  };
}
