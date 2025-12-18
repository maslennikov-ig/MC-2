/**
 * OpenRouter Models Service with 1-hour In-Memory Caching
 *
 * Fetches available models from OpenRouter API and caches results
 * for 1 hour to reduce API calls. Returns cached data on API failure
 * with warning metadata.
 *
 * @module services/openrouter-models
 *
 * Features:
 * - 1-hour in-memory cache (60 * 60 * 1000ms)
 * - Provider extraction from model ID (e.g., "openai/gpt-4" → "openai")
 * - Context size range filtering
 * - Price range filtering (per million tokens)
 * - Search by model name/description
 * - Graceful fallback to cached data on API errors
 *
 * @example
 * ```typescript
 * const { models, fromCache, cacheAge } = await getOpenRouterModels();
 * console.log(`Fetched ${models.length} models (from cache: ${fromCache})`);
 *
 * // Force refresh
 * const fresh = await getOpenRouterModels(true);
 *
 * // Apply filters
 * const filtered = filterModels(models, {
 *   providers: ['openai', 'anthropic'],
 *   minContextLength: 32000,
 *   maxPricePerMillion: 10,
 * });
 * ```
 */

import type {
  OpenRouterModel,
  OpenRouterModelsResponse,
  ModelFilter,
} from '@megacampus/shared-types';
import { logger } from '../shared/logger';

// ============================================================================
// TYPES
// ============================================================================

interface OpenRouterRawModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string;
  };
  pricing?: {
    prompt?: string;
    completion?: string;
    image?: string;
    request?: string;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * OpenRouter API endpoint for fetching available models
 */
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/models';

/**
 * Cache TTL: 1 hour in milliseconds
 */
const CACHE_TTL = 60 * 60 * 1000;

/**
 * Request timeout: 10 seconds
 */
const REQUEST_TIMEOUT = 10000;

// ============================================================================
// CACHE STATE
// ============================================================================

/**
 * In-memory cache for OpenRouter models
 */
interface CachedModels {
  data: OpenRouterModel[];
  fetchedAt: number;
}

/**
 * Global cache instance (null = not yet fetched)
 */
let cache: CachedModels | null = null;

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Fetch OpenRouter models with 1-hour caching
 *
 * Returns cached data if available and fresh (within CACHE_TTL).
 * On API failure, returns stale cache with warning metadata.
 *
 * @param forceRefresh - If true, bypass cache and fetch fresh data
 * @returns Models list with cache metadata
 * @throws Error if API fails and no cache available
 *
 * @example
 * ```typescript
 * const { models, fromCache, cacheAge } = await getOpenRouterModels();
 * if (cacheAge && cacheAge > 3600000) {
 *   console.warn('Cache is stale');
 * }
 * ```
 */
export async function getOpenRouterModels(
  forceRefresh = false
): Promise<OpenRouterModelsResponse> {
  const now = Date.now();

  // Check cache validity
  const isCacheValid = cache && now - cache.fetchedAt < CACHE_TTL;

  // Return cached data if valid and not forcing refresh
  if (!forceRefresh && isCacheValid && cache) {
    logger.debug(
      {
        cacheAge: now - cache.fetchedAt,
        modelsCount: cache.data.length,
      },
      'Returning cached OpenRouter models'
    );

    return {
      models: cache.data,
      fromCache: true,
      cacheAge: now - cache.fetchedAt,
      lastFetchedAt: new Date(cache.fetchedAt).toISOString(),
    };
  }

  // Fetch fresh data from API
  try {
    logger.info({ forceRefresh }, 'Fetching OpenRouter models from API');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    // Prepare headers with optional authentication
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // Add API key if available (for higher rate limits)
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
      logger.debug('Using authenticated OpenRouter API request');
    } else {
      logger.warn(
        'OPENROUTER_API_KEY environment variable is not set. ' +
        'API requests will be rate-limited. Set OPENROUTER_API_KEY for production use.'
      );
    }

    const response = await fetch(OPENROUTER_API_URL, {
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const rawData = (await response.json()) as { data: OpenRouterRawModel[] };

    // Transform API response to OpenRouterModel format
    const models = rawData.data.map((model): OpenRouterModel => {
      // Extract provider from model ID (e.g., "openai/gpt-4" → "openai")
      const provider = model.id.split('/')[0] || 'unknown';

      return {
        id: model.id,
        name: model.name,
        description: model.description || '',
        contextLength: model.context_length,
        architecture: {
          modality: model.architecture?.modality || 'text',
          tokenizer: model.architecture?.tokenizer || 'unknown',
          instructType: model.architecture?.instruct_type || null,
        },
        pricing: {
          prompt: parseFloat(model.pricing?.prompt || '0'),
          completion: parseFloat(model.pricing?.completion || '0'),
          image: model.pricing?.image ? parseFloat(model.pricing.image) : undefined,
          request: model.pricing?.request ? parseFloat(model.pricing.request) : undefined,
        },
        provider,
      };
    });

    // Update cache
    cache = {
      data: models,
      fetchedAt: now,
    };

    logger.info(
      { modelsCount: models.length },
      'Successfully fetched and cached OpenRouter models'
    );

    return {
      models,
      fromCache: false,
      lastFetchedAt: new Date(now).toISOString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        error: errorMessage,
        hasCachedData: !!cache,
      },
      'Failed to fetch OpenRouter models'
    );

    // Fallback to stale cache if available
    if (cache) {
      logger.warn(
        {
          cacheAge: now - cache.fetchedAt,
          modelsCount: cache.data.length,
        },
        'Returning stale cached data after API failure'
      );

      return {
        models: cache.data,
        fromCache: true,
        cacheAge: now - cache.fetchedAt,
        lastFetchedAt: new Date(cache.fetchedAt).toISOString(),
      };
    }

    // No cache available - throw error
    throw new Error(`Failed to fetch OpenRouter models and no cache available: ${errorMessage}`);
  }
}

/**
 * Filter models by various criteria
 *
 * Filters OpenRouter models by provider, context size, price, and search query.
 * All filters are applied cumulatively (AND logic).
 *
 * @param models - Array of models to filter
 * @param filter - Filter criteria
 * @returns Filtered models array
 *
 * @example
 * ```typescript
 * const filtered = filterModels(allModels, {
 *   providers: ['openai', 'anthropic'],
 *   minContextLength: 32000,
 *   maxPricePerMillion: 10,
 *   search: 'gpt',
 * });
 * ```
 */
export function filterModels(
  models: OpenRouterModel[],
  filter: ModelFilter
): OpenRouterModel[] {
  let result = models;

  // Filter by providers
  if (filter.providers && filter.providers.length > 0) {
    result = result.filter((m) => filter.providers!.includes(m.provider));
  }

  // Filter by context length range
  if (filter.minContextLength !== undefined) {
    result = result.filter((m) => m.contextLength >= filter.minContextLength!);
  }
  if (filter.maxContextLength !== undefined) {
    result = result.filter((m) => m.contextLength <= filter.maxContextLength!);
  }

  // Filter by price (USD per million tokens)
  if (filter.maxPricePerMillion !== undefined) {
    result = result.filter((m) => {
      // Calculate average price per million tokens
      const avgPricePerToken = (m.pricing.prompt + m.pricing.completion) / 2;
      const pricePerMillion = avgPricePerToken * 1_000_000;
      return pricePerMillion <= filter.maxPricePerMillion!;
    });
  }

  // Filter by search query (case-insensitive partial match)
  if (filter.search && filter.search.trim() !== '') {
    const searchLower = filter.search.toLowerCase();
    result = result.filter(
      (m) =>
        m.id.toLowerCase().includes(searchLower) ||
        m.name.toLowerCase().includes(searchLower) ||
        (m.description && m.description.toLowerCase().includes(searchLower))
    );
  }

  return result;
}

/**
 * Get unique providers from models list
 *
 * Extracts unique provider names, sorted alphabetically.
 *
 * @param models - Array of models
 * @returns Sorted array of unique provider names
 *
 * @example
 * ```typescript
 * const providers = getUniqueProviders(models);
 * // ['anthropic', 'google', 'openai', 'qwen']
 * ```
 */
export function getUniqueProviders(models: OpenRouterModel[]): string[] {
  const providers = new Set(models.map((m) => m.provider));
  return Array.from(providers).sort();
}

/**
 * Clear the model cache
 *
 * Useful for testing or forcing a full refresh.
 *
 * @example
 * ```typescript
 * clearModelCache();
 * const fresh = await getOpenRouterModels(); // Will fetch from API
 * ```
 */
export function clearModelCache(): void {
  cache = null;
  logger.debug('OpenRouter models cache cleared');
}
