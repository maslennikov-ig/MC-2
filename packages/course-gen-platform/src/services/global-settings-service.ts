/**
 * Global Settings Service
 *
 * Provides access to pipeline_global_settings with caching and fallbacks.
 *
 * @module services/global-settings-service
 */

import { getSupabaseAdmin } from '../shared/supabase/admin';
import logger from '../shared/logger';

/**
 * Default values for global settings
 * These match the production values in pipeline_global_settings table
 */
export const DEFAULT_GLOBAL_SETTINGS = {
  /**
   * RAG token budget - matches production DB value for consistency during fallback
   * @see qdrant-search.ts TOKEN_BUDGET.RAG_MAX_TOKENS
   */
  ragTokenBudget: 40000,
} as const;

// Cache for global settings
interface SettingsCache {
  data: Map<string, unknown>;
  timestamp: number;
}

let settingsCache: SettingsCache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get a global setting value with caching and fallback
 *
 * @param key - Setting key (snake_case as stored in DB)
 * @param defaultValue - Fallback value if not found
 * @returns Setting value from DB or default
 */
export async function getGlobalSetting<T>(
  key: string,
  defaultValue: T
): Promise<T> {
  const now = Date.now();

  // Check cache
  if (settingsCache && now - settingsCache.timestamp < CACHE_TTL_MS) {
    const cached = settingsCache.data.get(key);
    if (cached !== undefined) {
      return cached as T;
    }
  }

  try {
    // Fetch from database
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('pipeline_global_settings')
      .select('setting_value')
      .eq('setting_key', key)
      .single();

    if (error || !data) {
      logger.warn({ key, error }, 'Failed to fetch global setting, using default');
      return defaultValue;
    }

    // Update cache
    if (!settingsCache) {
      settingsCache = { data: new Map(), timestamp: now };
    }
    settingsCache.data.set(key, data.setting_value);
    settingsCache.timestamp = now;

    logger.debug({ key, value: data.setting_value }, 'Loaded global setting from database');
    return data.setting_value as T;
  } catch (error) {
    logger.error({ key, error }, 'Error fetching global setting');
    return defaultValue;
  }
}

/**
 * Get RAG token budget from global settings
 *
 * @returns RAG token budget (default: 40000)
 */
export async function getRagTokenBudget(): Promise<number> {
  const value = await getGlobalSetting<number>(
    'rag_token_budget',
    DEFAULT_GLOBAL_SETTINGS.ragTokenBudget
  );
  return typeof value === 'number' ? value : DEFAULT_GLOBAL_SETTINGS.ragTokenBudget;
}

/**
 * Clear settings cache
 */
export function clearGlobalSettingsCache(): void {
  settingsCache = null;
  logger.debug('Global settings cache cleared');
}
