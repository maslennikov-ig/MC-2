/**
 * Tier Settings Service
 *
 * Fetches tier settings from the database with in-memory caching.
 * Falls back to hardcoded defaults if database is unavailable.
 *
 * @module shared/tier/tier-settings-service
 */

import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { logger } from '@/shared/logger';
import {
  type TierSettings,
  type TierSettingsRow,
  type TierKey,
  toTierSettings,
  getAllDefaultTierSettings,
} from '@megacampus/shared-types';
import type { Database } from '@megacampus/shared-types';

// ============================================================================
// TYPES
// ============================================================================

type Role = Database['public']['Enums']['role'];
type Tier = Database['public']['Enums']['tier'];

interface CacheEntry {
  data: TierSettings[];
  expiresAt: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

// ============================================================================
// CACHE
// ============================================================================

let cache: CacheEntry | null = null;

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Fetch all tier settings from database
 * @internal
 */
async function fetchTierSettingsFromDB(): Promise<TierSettings[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('tier_settings')
    .select('*')
    .order('tier_key');

  if (error) {
    throw new Error(`Failed to fetch tier settings: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('No tier settings found in database');
  }

  return data.map((row) => toTierSettings(row as TierSettingsRow));
}

/**
 * Check if cache is valid
 */
function isCacheValid(): boolean {
  return cache !== null && Date.now() < cache.expiresAt;
}

/**
 * Update cache with new data
 */
function updateCache(data: TierSettings[]): void {
  cache = {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

/**
 * Get all active tier settings
 *
 * Fetches tier settings from database with in-memory caching (5 min TTL).
 * Falls back to hardcoded defaults if database is unavailable.
 *
 * @returns Promise with array of all active tier settings
 *
 * @example
 * ```typescript
 * const tiers = await getAllTierSettings();
 * console.log(`Available tiers: ${tiers.map(t => t.displayName).join(', ')}`);
 * ```
 */
export async function getAllTierSettings(): Promise<TierSettings[]> {
  // Return cached data if valid
  if (isCacheValid() && cache) {
    return cache.data.filter((tier) => tier.isActive);
  }

  try {
    const settings = await fetchTierSettingsFromDB();
    updateCache(settings);
    logger.debug({ count: settings.length }, '[TierSettingsService] Cache updated from database');
    return settings.filter((tier) => tier.isActive);
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      '[TierSettingsService] Database unavailable, using hardcoded defaults'
    );

    // Use defaults but don't cache them (so we retry DB on next call)
    return getAllDefaultTierSettings().filter((tier) => tier.isActive);
  }
}

/**
 * Get tier settings for a specific tier
 *
 * Fetches a single tier's settings from database with caching.
 * Falls back to hardcoded defaults if database is unavailable.
 *
 * @param tierKey - The tier key to fetch settings for
 * @returns Promise with tier settings
 * @throws Error if tier not found (should not happen with valid tier keys)
 *
 * @example
 * ```typescript
 * const settings = await getTierSettings('standard');
 * console.log(`Max file size: ${settings.maxFileSizeBytes} bytes`);
 * ```
 */
export async function getTierSettings(tierKey: TierKey): Promise<TierSettings> {
  // Return cached data if valid
  if (isCacheValid() && cache) {
    const cached = cache.data.find((tier) => tier.tierKey === tierKey);
    if (cached) {
      return cached;
    }
  }

  try {
    const settings = await fetchTierSettingsFromDB();
    updateCache(settings);

    const tierSettings = settings.find((tier) => tier.tierKey === tierKey);
    if (!tierSettings) {
      throw new Error(`Tier settings not found for tier: ${tierKey}`);
    }

    return tierSettings;
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error), tierKey },
      '[TierSettingsService] Database unavailable, using hardcoded defaults'
    );

    // Use defaults but don't cache them (so we retry DB on next call)
    const defaults = getAllDefaultTierSettings();
    const tierSettings = defaults.find((tier) => tier.tierKey === tierKey);

    if (!tierSettings) {
      throw new Error(`Tier settings not found for tier: ${tierKey}`);
    }

    return tierSettings;
  }
}

/**
 * Force refresh the tier settings cache
 *
 * Clears the cache and fetches fresh data from database.
 * Useful when tier settings have been updated in the database.
 *
 * @returns Promise that resolves when cache is refreshed
 *
 * @example
 * ```typescript
 * // After updating tier settings in admin UI
 * await refreshCache();
 * console.log('Tier settings cache refreshed');
 * ```
 */
export async function refreshCache(): Promise<void> {
  cache = null;

  try {
    const settings = await fetchTierSettingsFromDB();
    updateCache(settings);
    logger.info({ count: settings.length }, '[TierSettingsService] Cache refreshed from database');
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      '[TierSettingsService] Failed to refresh cache from database'
    );
    throw error;
  }
}

/**
 * Get effective tier settings for a user
 *
 * If the user is a superadmin, returns premium tier settings.
 * Otherwise returns settings for the organization's tier.
 *
 * @param userRole - The user's role
 * @param orgTier - The organization's tier
 * @returns Promise with effective tier settings
 *
 * @example
 * ```typescript
 * // Superadmin always gets premium settings
 * const settings = await getEffectiveTierSettings('superadmin', 'basic');
 * console.log(settings.tierKey); // 'premium'
 *
 * // Regular users get their org tier settings
 * const settings = await getEffectiveTierSettings('instructor', 'standard');
 * console.log(settings.tierKey); // 'standard'
 * ```
 */
export async function getEffectiveTierSettings(
  userRole: Role | string | undefined | null,
  orgTier: Tier
): Promise<TierSettings> {
  // Superadmins always get premium tier settings
  if (userRole === 'superadmin') {
    return getTierSettings('premium');
  }

  return getTierSettings(orgTier);
}

/**
 * Clear the tier settings cache
 *
 * Used primarily for testing purposes.
 * @internal
 */
export function clearCache(): void {
  cache = null;
}
