/**
 * Tier Settings Types - Single Source of Truth
 * @module tier-settings
 *
 * This module provides TypeScript interfaces for the tier_settings table.
 * Settings are fetched from the database with fallback to hardcoded defaults.
 */

import type { TierKey } from './file-upload-constants';
import {
  FILE_SIZE_LIMITS_BY_TIER,
  FILE_COUNT_LIMITS_BY_TIER,
  MIME_TYPES_BY_TIER,
  FILE_EXTENSIONS_BY_TIER,
} from './file-upload-constants';

// Re-export TierKey for convenience
export type { TierKey };

// ============================================================================
// DEFAULT VALUES - Single Source of Truth
// ============================================================================

/**
 * Default storage quotas by tier (in bytes)
 */
export const DEFAULT_STORAGE_QUOTAS: Record<TierKey, number> = {
  trial: 1073741824, // 1 GB (same as standard - full features for evaluation)
  free: 10485760, // 10 MB
  basic: 104857600, // 100 MB
  standard: 1073741824, // 1 GB
  premium: 10737418240, // 10 GB
};

/**
 * Default concurrent job limits by tier
 */
export const DEFAULT_CONCURRENT_JOBS: Record<TierKey, number> = {
  trial: 5,
  free: 1,
  basic: 2,
  standard: 5,
  premium: 10,
};

/**
 * Default display names for tiers
 */
export const DEFAULT_DISPLAY_NAMES: Record<TierKey, string> = {
  trial: 'Trial',
  free: 'Free',
  basic: 'Basic',
  standard: 'Standard',
  premium: 'Premium',
};

/**
 * Default monthly prices in cents
 * Must match migration seed values in 20251221120000_create_tier_settings.sql
 */
export const DEFAULT_MONTHLY_PRICES: Record<TierKey, number> = {
  trial: 0,
  free: 0,
  basic: 1900, // $19.00
  standard: 4900, // $49.00
  premium: 14900, // $149.00
};

/**
 * All tier keys in order
 */
export const ALL_TIER_KEYS: TierKey[] = ['trial', 'free', 'basic', 'standard', 'premium'];

/**
 * Get default TierSettings for a given tier key
 */
export function getDefaultTierSettingsForKey(tierKey: TierKey): TierSettings {
  return {
    tierKey,
    displayName: DEFAULT_DISPLAY_NAMES[tierKey],
    storageQuotaBytes: DEFAULT_STORAGE_QUOTAS[tierKey],
    maxFileSizeBytes: FILE_SIZE_LIMITS_BY_TIER[tierKey],
    maxFilesPerCourse: FILE_COUNT_LIMITS_BY_TIER[tierKey],
    maxConcurrentJobs: DEFAULT_CONCURRENT_JOBS[tierKey],
    allowedMimeTypes: [...MIME_TYPES_BY_TIER[tierKey]],
    allowedExtensions: [...FILE_EXTENSIONS_BY_TIER[tierKey]],
    monthlyPriceCents: DEFAULT_MONTHLY_PRICES[tierKey],
    features: {},
    isActive: true,
  };
}

/**
 * Get all default TierSettings
 */
export function getAllDefaultTierSettings(): TierSettings[] {
  return ALL_TIER_KEYS.map(getDefaultTierSettingsForKey);
}

/**
 * Tier settings fetched from the database
 *
 * Maps to the tier_settings table with camelCase property names
 */
export interface TierSettings {
  /** Tier identifier matching the tier enum */
  tierKey: TierKey;
  /** Human-readable tier name for UI display */
  displayName: string;
  /** Maximum storage allowed per organization in bytes */
  storageQuotaBytes: number;
  /** Maximum size of a single uploaded file in bytes */
  maxFileSizeBytes: number;
  /** Maximum number of files allowed per course (0 means no file uploads) */
  maxFilesPerCourse: number;
  /** Maximum number of parallel generation jobs allowed */
  maxConcurrentJobs: number;
  /** Array of allowed MIME types for file uploads */
  allowedMimeTypes: string[];
  /** Array of allowed file extensions for UI display */
  allowedExtensions: string[];
  /** Monthly subscription price in cents (e.g., 4900 = $49.00) */
  monthlyPriceCents: number;
  /** JSONB object for additional tier features */
  features: Record<string, unknown>;
  /** Whether this tier is currently available for new subscriptions */
  isActive: boolean;
}

/**
 * Database row type for tier_settings table (snake_case)
 */
export interface TierSettingsRow {
  id: string;
  tier_key: TierKey;
  display_name: string;
  storage_quota_bytes: number;
  max_file_size_bytes: number;
  max_files_per_course: number;
  max_concurrent_jobs: number;
  allowed_mime_types: string[];
  allowed_extensions: string[];
  monthly_price_cents: number | null;
  features: Record<string, unknown> | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Convert database row to TierSettings interface
 */
export function toTierSettings(row: TierSettingsRow): TierSettings {
  return {
    tierKey: row.tier_key,
    displayName: row.display_name,
    storageQuotaBytes: row.storage_quota_bytes,
    maxFileSizeBytes: row.max_file_size_bytes,
    maxFilesPerCourse: row.max_files_per_course,
    maxConcurrentJobs: row.max_concurrent_jobs,
    allowedMimeTypes: row.allowed_mime_types,
    allowedExtensions: row.allowed_extensions,
    monthlyPriceCents: row.monthly_price_cents ?? 0,
    features: row.features ?? {},
    isActive: row.is_active ?? true,
  };
}
