/**
 * Billing helper functions and constants
 * @module server/utils/billing-helpers
 *
 * Shared utilities for billing and quota management.
 */

import type { Database } from '@megacampus/shared-types';

/**
 * Tier to storage quota mapping (in bytes)
 * Based on T017 database schema
 */
export const STORAGE_QUOTA_BY_TIER: Record<Database['public']['Enums']['tier'], number> = {
  trial: 104857600, // 100 MB (same as basic)
  free: 10485760, // 10 MB
  basic: 104857600, // 100 MB
  standard: 1073741824, // 1 GB
  premium: 10737418240, // 10 GB
};

/**
 * Convert bytes to human-readable format
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.5 GB", "500 MB", "10 KB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Get next tier upgrade path
 * @param currentTier - Current organization tier
 * @returns Next tier or null if already at premium
 */
export function getNextTier(
  currentTier: Database['public']['Enums']['tier']
): Database['public']['Enums']['tier'] | null {
  const tierOrder: Database['public']['Enums']['tier'][] = [
    'trial',
    'free',
    'basic',
    'standard',
    'premium',
  ];

  const currentIndex = tierOrder.indexOf(currentTier);
  if (currentIndex === -1 || currentIndex === tierOrder.length - 1) {
    return null; // Already at premium or invalid tier
  }

  return tierOrder[currentIndex + 1];
}

/**
 * Format tier name for display
 * @param tier - Tier enum value
 * @returns Human-readable tier name (e.g., "Basic Plus")
 */
export function formatTierName(tier: Database['public']['Enums']['tier']): string {
  return tier
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
