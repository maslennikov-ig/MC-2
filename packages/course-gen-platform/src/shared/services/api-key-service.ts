/**
 * Centralized API Key Service
 * @module shared/services/api-key-service
 *
 * Single source of truth for API key retrieval.
 * Prioritizes database-stored keys over environment variables.
 *
 * Key resolution order:
 * 1. Database (pipeline_global_settings) if source='database' and value exists
 * 2. Environment variable (OPENROUTER_API_KEY, JINA_API_KEY)
 *
 * This service is the ONLY place where API keys should be retrieved from.
 * All LLM clients, embedding services, etc. should use this service.
 */

import crypto from 'crypto';
import { getSupabaseAdmin } from '../supabase/admin';
import logger from '../logger';

/**
 * API key types supported by the service
 */
export type ApiKeyType = 'openrouter' | 'jina';

/**
 * API key configuration stored in database
 */
interface ApiKeyConfig {
  source: 'env' | 'database';
  env_var: string;
  is_configured?: boolean;
  value?: string;
}

/**
 * Cache for API keys to avoid repeated database queries
 * Keys are cached for 5 minutes
 */
const apiKeyCache: Map<ApiKeyType, { key: string; expiresAt: number }> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Cache statistics for monitoring
 */
let cacheStats = { hits: 0, misses: 0 };

/**
 * Encryption configuration
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const ENCRYPTED_PREFIX = 'enc:v1:'; // Prefix to identify encrypted values

/**
 * Check if a value is encrypted
 * @param value - Value to check
 * @returns true if the value starts with the encryption prefix
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Encrypt an API key using AES-256-GCM
 * @param apiKey - Plain text API key to encrypt
 * @returns Encrypted API key string with format: enc:v1:iv:authTag:encryptedData
 * @throws Error if ENCRYPTION_KEY environment variable is not set
 */
export function encryptApiKey(apiKey: string): string {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is required for API key encryption');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(encryptionKey, 'hex'),
    iv
  );

  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  // Format: prefix + iv:authTag:encryptedData
  return `${ENCRYPTED_PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an API key using AES-256-GCM
 * @param encrypted - Encrypted API key string
 * @returns Decrypted API key string
 * @throws Error if ENCRYPTION_KEY environment variable is not set or format is invalid
 */
export function decryptApiKey(encrypted: string): string {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is required for API key decryption');
  }

  // Remove prefix if present
  const data = encrypted.startsWith(ENCRYPTED_PREFIX)
    ? encrypted.slice(ENCRYPTED_PREFIX.length)
    : encrypted;

  const parts = data.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted key format');
  }

  const [ivHex, authTagHex, encryptedData] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(encryptionKey, 'hex'),
    iv
  );
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Get the setting key for a given API key type
 */
function getSettingKey(keyType: ApiKeyType): string {
  return keyType === 'openrouter' ? 'openrouter_api_key' : 'jina_api_key';
}

/**
 * Get the environment variable name for a given API key type
 */
function getEnvVarName(keyType: ApiKeyType): string {
  return keyType === 'openrouter' ? 'OPENROUTER_API_KEY' : 'JINA_API_KEY';
}

/**
 * Mask API key for safe logging
 * Shows first 8 chars and last 4 chars, rest replaced with '...'
 * @param key - API key to mask
 * @returns Masked key string
 */
function maskApiKey(key: string): string {
  if (key.length < 12) return '***';
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

/**
 * Get API key from cache if available and not expired
 */
function getCachedKey(keyType: ApiKeyType): string | null {
  const cached = apiKeyCache.get(keyType);
  if (cached && cached.expiresAt > Date.now()) {
    cacheStats.hits++;
    return cached.key;
  }
  cacheStats.misses++;
  return null;
}

/**
 * Cache an API key
 */
function cacheKey(keyType: ApiKeyType, key: string): void {
  apiKeyCache.set(keyType, {
    key,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Invalidate cache for a specific key type
 * Call this when the key is updated via admin panel
 */
export function invalidateApiKeyCache(keyType?: ApiKeyType): void {
  if (keyType) {
    apiKeyCache.delete(keyType);
    logger.debug({ keyType }, 'API key cache invalidated');
  } else {
    apiKeyCache.clear();
    cacheStats = { hits: 0, misses: 0 }; // Reset stats on full clear
    logger.debug('All API key caches invalidated');
  }
}

/**
 * Get cache metrics for monitoring
 * @returns Cache statistics including hit rate
 */
export function getCacheMetrics() {
  const total = cacheStats.hits + cacheStats.misses;
  return {
    hits: cacheStats.hits,
    misses: cacheStats.misses,
    hitRate: total > 0 ? cacheStats.hits / total : 0,
    cacheSize: apiKeyCache.size,
  };
}

/**
 * Get API key with database-first resolution
 *
 * Resolution order:
 * 1. Check cache
 * 2. Query database for configuration
 * 3. If source='database' and value exists, use database value
 * 4. Otherwise, use environment variable
 *
 * @param keyType - Type of API key to retrieve
 * @returns API key string or null if not configured
 *
 * @example
 * ```typescript
 * const openRouterKey = await getApiKey('openrouter');
 * if (!openRouterKey) {
 *   throw new Error('OpenRouter API key not configured');
 * }
 * ```
 */
export async function getApiKey(keyType: ApiKeyType): Promise<string | null> {
  // Check cache first
  const cachedKey = getCachedKey(keyType);
  if (cachedKey) {
    return cachedKey;
  }

  try {
    const supabase = getSupabaseAdmin();
    const settingKey = getSettingKey(keyType);
    const envVarName = getEnvVarName(keyType);

    // Query database for configuration
    const { data: setting, error } = await supabase
      .from('pipeline_global_settings')
      .select('setting_value')
      .eq('setting_key', settingKey)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned
      logger.warn({ keyType, error: error.message }, 'Failed to query API key config from database');
    }

    const config = (setting?.setting_value as unknown as ApiKeyConfig) || { source: 'env' };

    let apiKey: string | undefined;

    // Resolve key based on source
    if (config.source === 'database' && config.value) {
      // Check if value is encrypted and decrypt if needed
      if (isEncrypted(config.value)) {
        try {
          apiKey = decryptApiKey(config.value);
          logger.debug({ keyType, source: 'database', encrypted: true }, 'API key resolved and decrypted from database');
        } catch (err) {
          logger.error(
            { keyType, error: err instanceof Error ? err.message : String(err) },
            'Failed to decrypt API key from database'
          );
          // Fall through to undefined so it will use env var as fallback
        }
      } else {
        // Legacy plain text value - use as-is but log warning
        apiKey = config.value;
        logger.warn(
          { keyType, source: 'database' },
          'API key stored in plain text (legacy format). Please re-save the key through admin UI to encrypt it.'
        );
      }
    } else {
      apiKey = process.env[envVarName];
      logger.debug({ keyType, source: 'env', envVar: envVarName }, 'API key resolved from environment');
    }

    if (apiKey) {
      cacheKey(keyType, apiKey);
      logger.debug({ keyType, keyPreview: maskApiKey(apiKey) }, 'API key resolved and cached');
    }

    return apiKey || null;
  } catch (err) {
    // Fallback to env var on any error
    const envVarName = getEnvVarName(keyType);
    const fallbackKey = process.env[envVarName];

    logger.warn(
      { keyType, error: err instanceof Error ? err.message : String(err) },
      'Database query failed, falling back to environment variable'
    );

    if (fallbackKey) {
      cacheKey(keyType, fallbackKey);
    }

    return fallbackKey || null;
  }
}

/**
 * Get OpenRouter API key (convenience wrapper)
 *
 * @returns OpenRouter API key or null
 *
 * @example
 * ```typescript
 * const apiKey = await getOpenRouterApiKey();
 * const client = new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });
 * ```
 */
export async function getOpenRouterApiKey(): Promise<string | null> {
  return getApiKey('openrouter');
}

/**
 * Get Jina API key (convenience wrapper)
 *
 * @returns Jina API key or null
 */
export async function getJinaApiKey(): Promise<string | null> {
  return getApiKey('jina');
}

/**
 * Check if an API key is configured (either in database or env)
 *
 * @param keyType - Type of API key to check
 * @returns true if key is configured
 */
export async function isApiKeyConfigured(keyType: ApiKeyType): Promise<boolean> {
  const key = await getApiKey(keyType);
  return !!key;
}

/**
 * Get API key synchronously from environment variable only
 * Use this only when async is not possible (e.g., constructor initialization)
 *
 * IMPORTANT: This bypasses database configuration!
 * Only use when absolutely necessary.
 *
 * @param keyType - Type of API key to retrieve
 * @returns API key from environment variable or undefined
 */
export function getApiKeySync(keyType: ApiKeyType): string | undefined {
  // Try cache first
  const cached = getCachedKey(keyType);
  if (cached) {
    return cached;
  }

  const envVarName = getEnvVarName(keyType);
  const key = process.env[envVarName];

  // Cache the result if found
  if (key) {
    cacheKey(keyType, key);
  }

  return key;
}
