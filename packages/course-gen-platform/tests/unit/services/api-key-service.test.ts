/**
 * API Key Service Tests
 * @module shared/services/__tests__/api-key-service.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getApiKey,
  getApiKeySync,
  invalidateApiKeyCache,
  getCacheMetrics,
  encryptApiKey,
  decryptApiKey,
  isEncrypted,
  getOpenRouterApiKey,
  getJinaApiKey,
  isApiKeyConfigured,
} from '../../../src/shared/services/api-key-service';

// Mock Supabase admin client
const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('../../../src/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: mockFrom,
  })),
}));

// Mock logger to prevent console output
vi.mock('../../../src/shared/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('api-key-service', () => {
  // Store original env vars to restore later
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear cache before each test
    invalidateApiKeyCache();
    vi.clearAllMocks();

    // Reset environment variables
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('encryption', () => {
    it('encrypts and decrypts API key correctly', () => {
      process.env.ENCRYPTION_KEY = 'a'.repeat(64); // Valid 32-byte hex key
      const original = 'sk-or-v1-test123456';

      const encrypted = encryptApiKey(original);
      expect(encrypted).toMatch(/^enc:v1:/);

      const decrypted = decryptApiKey(encrypted);
      expect(decrypted).toBe(original);
    });

    it('produces different encrypted values on each call', () => {
      process.env.ENCRYPTION_KEY = 'a'.repeat(64);
      const original = 'sk-or-v1-test123456';

      const encrypted1 = encryptApiKey(original);
      const encrypted2 = encryptApiKey(original);

      // Should be different due to random IV
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to same value
      expect(decryptApiKey(encrypted1)).toBe(original);
      expect(decryptApiKey(encrypted2)).toBe(original);
    });

    it('throws when ENCRYPTION_KEY missing during encryption', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => encryptApiKey('test')).toThrow('ENCRYPTION_KEY');
    });

    it('throws when ENCRYPTION_KEY missing during decryption', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => decryptApiKey('enc:v1:abc:def:ghi')).toThrow('ENCRYPTION_KEY');
    });

    it('throws on invalid encrypted format', () => {
      process.env.ENCRYPTION_KEY = 'a'.repeat(64);

      // Missing parts
      expect(() => decryptApiKey('enc:v1:abc:def')).toThrow('Invalid encrypted key format');

      // Invalid hex
      expect(() => decryptApiKey('enc:v1:invalid:hex:data')).toThrow();
    });

    it('handles decryption with or without prefix', () => {
      process.env.ENCRYPTION_KEY = 'a'.repeat(64);
      const original = 'sk-or-v1-test123456';
      const encrypted = encryptApiKey(original);

      // Extract parts after prefix
      const withoutPrefix = encrypted.slice('enc:v1:'.length);

      // Should decrypt both formats
      expect(decryptApiKey(encrypted)).toBe(original);
      expect(decryptApiKey(withoutPrefix)).toBe(original);
    });
  });

  describe('isEncrypted', () => {
    it('returns true for encrypted values', () => {
      expect(isEncrypted('enc:v1:abc:def:ghi')).toBe(true);
    });

    it('returns false for plain text', () => {
      expect(isEncrypted('sk-or-v1-plaintext')).toBe(false);
      expect(isEncrypted('plain-api-key')).toBe(false);
      expect(isEncrypted('')).toBe(false);
    });
  });

  describe('getCacheMetrics', () => {
    it('tracks cache hits and misses', async () => {
      // Setup: ensure cache is empty
      invalidateApiKeyCache();

      const metrics1 = getCacheMetrics();
      expect(metrics1.cacheSize).toBe(0);
      expect(metrics1.hits).toBe(0);
      expect(metrics1.misses).toBe(0);
      expect(metrics1.hitRate).toBe(0);

      // Mock database response
      mockSingle.mockResolvedValueOnce({
        data: {
          setting_value: {
            source: 'env',
            env_var: 'OPENROUTER_API_KEY',
          },
        },
        error: null,
      });

      process.env.OPENROUTER_API_KEY = 'test-key';

      // First call should miss cache
      await getApiKey('openrouter');
      const metrics2 = getCacheMetrics();
      expect(metrics2.misses).toBe(1);
      expect(metrics2.hits).toBe(0);
      expect(metrics2.cacheSize).toBe(1);

      // Second call should hit cache
      await getApiKey('openrouter');
      const metrics3 = getCacheMetrics();
      expect(metrics3.misses).toBe(1);
      expect(metrics3.hits).toBe(1);
      expect(metrics3.hitRate).toBe(0.5); // 1 hit / 2 total
    });

    it('resets statistics on full cache invalidation', async () => {
      process.env.OPENROUTER_API_KEY = 'test-key';

      mockSingle.mockResolvedValue({
        data: {
          setting_value: { source: 'env', env_var: 'OPENROUTER_API_KEY' },
        },
        error: null,
      });

      // Generate some cache activity
      await getApiKey('openrouter');
      await getApiKey('openrouter');

      const metricsBefore = getCacheMetrics();
      expect(metricsBefore.hits).toBeGreaterThan(0);

      // Full invalidation
      invalidateApiKeyCache();

      const metricsAfter = getCacheMetrics();
      expect(metricsAfter.hits).toBe(0);
      expect(metricsAfter.misses).toBe(0);
      expect(metricsAfter.cacheSize).toBe(0);
    });
  });

  describe('invalidateApiKeyCache', () => {
    it('clears specific key', async () => {
      process.env.OPENROUTER_API_KEY = 'test-openrouter';
      process.env.JINA_API_KEY = 'test-jina';

      mockSingle.mockResolvedValue({
        data: { setting_value: { source: 'env' } },
        error: null,
      });

      // Cache both keys
      await getApiKey('openrouter');
      await getApiKey('jina');

      expect(getCacheMetrics().cacheSize).toBe(2);

      // Invalidate only openrouter
      invalidateApiKeyCache('openrouter');

      expect(getCacheMetrics().cacheSize).toBe(1);

      // Verify jina still cached
      await getApiKey('jina');
      const metrics = getCacheMetrics();
      expect(metrics.hits).toBeGreaterThan(0); // Cache hit for jina
    });

    it('clears all keys when no argument', async () => {
      process.env.OPENROUTER_API_KEY = 'test-openrouter';
      process.env.JINA_API_KEY = 'test-jina';

      mockSingle.mockResolvedValue({
        data: { setting_value: { source: 'env' } },
        error: null,
      });

      // Cache both keys
      await getApiKey('openrouter');
      await getApiKey('jina');

      expect(getCacheMetrics().cacheSize).toBe(2);

      // Clear all
      invalidateApiKeyCache();

      expect(getCacheMetrics().cacheSize).toBe(0);
    });
  });

  describe('getApiKey', () => {
    it('returns key from database when source=database', async () => {
      process.env.ENCRYPTION_KEY = 'a'.repeat(64);
      const dbKey = 'sk-or-v1-database-key';
      const encrypted = encryptApiKey(dbKey);

      mockSingle.mockResolvedValueOnce({
        data: {
          setting_value: {
            source: 'database',
            value: encrypted,
          },
        },
        error: null,
      });

      const result = await getApiKey('openrouter');
      expect(result).toBe(dbKey);
    });

    it('returns plain text key from database for legacy format', async () => {
      const dbKey = 'sk-or-v1-legacy-plain-text';

      mockSingle.mockResolvedValueOnce({
        data: {
          setting_value: {
            source: 'database',
            value: dbKey, // Plain text (legacy)
          },
        },
        error: null,
      });

      const result = await getApiKey('openrouter');
      expect(result).toBe(dbKey);
    });

    it('falls back to env var when source=env', async () => {
      process.env.OPENROUTER_API_KEY = 'sk-or-v1-env-key';

      mockSingle.mockResolvedValueOnce({
        data: {
          setting_value: {
            source: 'env',
            env_var: 'OPENROUTER_API_KEY',
          },
        },
        error: null,
      });

      const result = await getApiKey('openrouter');
      expect(result).toBe('sk-or-v1-env-key');
    });

    it('falls back to env var on database error', async () => {
      process.env.OPENROUTER_API_KEY = 'sk-or-v1-fallback';

      mockSingle.mockRejectedValueOnce(new Error('Database connection failed'));

      const result = await getApiKey('openrouter');
      expect(result).toBe('sk-or-v1-fallback');
    });

    it('returns null when decryption fails', async () => {
      process.env.OPENROUTER_API_KEY = 'sk-or-v1-fallback';
      process.env.ENCRYPTION_KEY = 'a'.repeat(64);

      mockSingle.mockResolvedValueOnce({
        data: {
          setting_value: {
            source: 'database',
            value: 'enc:v1:corrupted:data:here', // Invalid encrypted format
          },
        },
        error: null,
      });

      const result = await getApiKey('openrouter');
      // When decryption fails and source is 'database', returns null
      // (does not fall back to env var in this case)
      expect(result).toBeNull();
    });

    it('uses cache when available (no DB query)', async () => {
      process.env.OPENROUTER_API_KEY = 'sk-or-v1-test';

      mockSingle.mockResolvedValueOnce({
        data: { setting_value: { source: 'env' } },
        error: null,
      });

      // First call - should query DB
      await getApiKey('openrouter');
      expect(mockSingle).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      await getApiKey('openrouter');
      expect(mockSingle).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('returns null when no key configured', async () => {
      delete process.env.OPENROUTER_API_KEY;

      mockSingle.mockResolvedValueOnce({
        data: { setting_value: { source: 'env' } },
        error: null,
      });

      const result = await getApiKey('openrouter');
      expect(result).toBeNull();
    });

    it('handles PGRST116 error (no rows) gracefully', async () => {
      process.env.OPENROUTER_API_KEY = 'sk-or-v1-fallback';

      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'No rows returned' },
      });

      const result = await getApiKey('openrouter');
      expect(result).toBe('sk-or-v1-fallback');
    });

    it('caches result after database query', async () => {
      process.env.OPENROUTER_API_KEY = 'sk-or-v1-test';

      mockSingle.mockResolvedValueOnce({
        data: { setting_value: { source: 'env' } },
        error: null,
      });

      const metricsBefore = getCacheMetrics();
      expect(metricsBefore.cacheSize).toBe(0);

      await getApiKey('openrouter');

      const metricsAfter = getCacheMetrics();
      expect(metricsAfter.cacheSize).toBe(1);
    });
  });

  describe('getApiKeySync', () => {
    it('uses cache when available', async () => {
      process.env.OPENROUTER_API_KEY = 'sk-or-v1-cached';

      // First populate cache via async call
      mockSingle.mockResolvedValueOnce({
        data: { setting_value: { source: 'env' } },
        error: null,
      });

      await getApiKey('openrouter');

      // Now sync call should use cache
      const result = getApiKeySync('openrouter');
      expect(result).toBe('sk-or-v1-cached');
    });

    it('returns env var when cache miss', () => {
      invalidateApiKeyCache();
      process.env.JINA_API_KEY = 'jina-test-key';

      const result = getApiKeySync('jina');
      expect(result).toBe('jina-test-key');
    });

    it('caches result after first call', () => {
      invalidateApiKeyCache();
      process.env.OPENROUTER_API_KEY = 'sk-or-v1-sync';

      const metricsBefore = getCacheMetrics();
      expect(metricsBefore.cacheSize).toBe(0);

      getApiKeySync('openrouter');

      const metricsAfter = getCacheMetrics();
      expect(metricsAfter.cacheSize).toBe(1);

      // Second call should hit cache
      getApiKeySync('openrouter');
      expect(getCacheMetrics().hits).toBeGreaterThan(0);
    });

    it('returns undefined when env var not set', () => {
      invalidateApiKeyCache();
      delete process.env.OPENROUTER_API_KEY;

      const result = getApiKeySync('openrouter');
      expect(result).toBeUndefined();
    });
  });

  describe('getOpenRouterApiKey', () => {
    it('returns openrouter key', async () => {
      process.env.OPENROUTER_API_KEY = 'sk-or-v1-test';

      mockSingle.mockResolvedValueOnce({
        data: { setting_value: { source: 'env' } },
        error: null,
      });

      const result = await getOpenRouterApiKey();
      expect(result).toBe('sk-or-v1-test');
    });
  });

  describe('getJinaApiKey', () => {
    it('returns jina key', async () => {
      process.env.JINA_API_KEY = 'jina-test-key';

      mockSingle.mockResolvedValueOnce({
        data: { setting_value: { source: 'env' } },
        error: null,
      });

      const result = await getJinaApiKey();
      expect(result).toBe('jina-test-key');
    });
  });

  describe('isApiKeyConfigured', () => {
    it('returns true when key exists', async () => {
      process.env.OPENROUTER_API_KEY = 'sk-or-v1-test';

      mockSingle.mockResolvedValueOnce({
        data: { setting_value: { source: 'env' } },
        error: null,
      });

      const result = await isApiKeyConfigured('openrouter');
      expect(result).toBe(true);
    });

    it('returns false when key not configured', async () => {
      delete process.env.JINA_API_KEY;

      mockSingle.mockResolvedValueOnce({
        data: { setting_value: { source: 'env' } },
        error: null,
      });

      const result = await isApiKeyConfigured('jina');
      expect(result).toBe(false);
    });
  });

  describe('cache expiration', () => {
    it('expires cache after TTL', async () => {
      process.env.OPENROUTER_API_KEY = 'sk-or-v1-test';

      mockSingle.mockResolvedValue({
        data: { setting_value: { source: 'env' } },
        error: null,
      });

      // First call - populates cache
      await getApiKey('openrouter');
      expect(mockSingle).toHaveBeenCalledTimes(1);

      // Mock time advancement (5 minutes + 1ms)
      const originalDateNow = Date.now;
      const startTime = Date.now();
      Date.now = vi.fn(() => startTime + 5 * 60 * 1000 + 1);

      try {
        // Second call - cache should be expired
        await getApiKey('openrouter');
        expect(mockSingle).toHaveBeenCalledTimes(2); // Called again
      } finally {
        Date.now = originalDateNow;
      }
    });

    it('does not expire cache before TTL', async () => {
      process.env.OPENROUTER_API_KEY = 'sk-or-v1-test';

      mockSingle.mockResolvedValue({
        data: { setting_value: { source: 'env' } },
        error: null,
      });

      // First call - populates cache
      await getApiKey('openrouter');
      expect(mockSingle).toHaveBeenCalledTimes(1);

      // Mock time advancement (4 minutes - before TTL)
      const originalDateNow = Date.now;
      const startTime = Date.now();
      Date.now = vi.fn(() => startTime + 4 * 60 * 1000);

      try {
        // Second call - cache should still be valid
        await getApiKey('openrouter');
        expect(mockSingle).toHaveBeenCalledTimes(1); // Not called again
      } finally {
        Date.now = originalDateNow;
      }
    });
  });

  describe('database value priority', () => {
    it('prioritizes database value over env var when source=database', async () => {
      process.env.ENCRYPTION_KEY = 'a'.repeat(64);
      process.env.OPENROUTER_API_KEY = 'sk-or-v1-env-key';

      const dbKey = 'sk-or-v1-database-key';
      const encrypted = encryptApiKey(dbKey);

      mockSingle.mockResolvedValueOnce({
        data: {
          setting_value: {
            source: 'database',
            value: encrypted,
            env_var: 'OPENROUTER_API_KEY',
          },
        },
        error: null,
      });

      const result = await getApiKey('openrouter');
      expect(result).toBe(dbKey);
      expect(result).not.toBe(process.env.OPENROUTER_API_KEY);
    });

    it('uses env var when source=database but no value', async () => {
      process.env.OPENROUTER_API_KEY = 'sk-or-v1-env-key';

      mockSingle.mockResolvedValueOnce({
        data: {
          setting_value: {
            source: 'database',
            // No value field
            env_var: 'OPENROUTER_API_KEY',
          },
        },
        error: null,
      });

      const result = await getApiKey('openrouter');
      expect(result).toBe('sk-or-v1-env-key');
    });
  });
});
