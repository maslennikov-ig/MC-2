/**
 * Unit tests for auto-classification rules
 *
 * Tests the shouldAutoMute function with all defined patterns and edge cases.
 *
 * @module shared/logger/__tests__/auto-classification.test
 */

import { describe, it, expect } from 'vitest';
import { shouldAutoMute, AUTO_MUTE_RULES } from '@/shared/logger/auto-classification';

describe('shouldAutoMute', () => {
  describe('graceful_shutdown patterns', () => {
    it('should mute "Redis connection ended" messages', () => {
      const result = shouldAutoMute('Redis connection ended, no more reconnections');

      expect(result.mute).toBe(true);
      expect(result.reason).toBe('graceful_shutdown');
      expect(result.description).toContain('Redis disconnects');
    });

    it('should mute "Redis connection closed" messages', () => {
      const result = shouldAutoMute('Redis connection closed unexpectedly');

      expect(result.mute).toBe(true);
      expect(result.reason).toBe('graceful_shutdown');
    });

    it('should be case-insensitive for Redis patterns', () => {
      const result1 = shouldAutoMute('REDIS CONNECTION ENDED');
      const result2 = shouldAutoMute('redis connection closed');

      expect(result1.mute).toBe(true);
      expect(result2.mute).toBe(true);
    });

    it('should mute graceful shutdown messages', () => {
      const result = shouldAutoMute('Server initiated graceful shutdown');

      expect(result.mute).toBe(true);
      expect(result.reason).toBe('graceful_shutdown');
      expect(result.description).toContain('shutdown');
    });
  });

  describe('monitoring_probe patterns', () => {
    it('should mute /api/trpc/health 404 errors', () => {
      const result = shouldAutoMute('GET /api/trpc/health 404 Not Found');

      expect(result.mute).toBe(true);
      expect(result.reason).toBe('monitoring_probe');
      expect(result.description).toContain('Health endpoint probes');
    });

    it('should mute generic /health 404 errors', () => {
      const result = shouldAutoMute('GET /health returned 404');

      expect(result.mute).toBe(true);
      expect(result.reason).toBe('monitoring_probe');
    });

    it('should be case-insensitive for health patterns', () => {
      const result = shouldAutoMute('GET /API/TRPC/HEALTH 404');

      expect(result.mute).toBe(true);
    });
  });

  describe('external_service patterns', () => {
    it('should mute Cloudflare 502 errors', () => {
      const result = shouldAutoMute('Cloudflare returned 502 Bad Gateway');

      expect(result.mute).toBe(true);
      expect(result.reason).toBe('external_service');
      expect(result.description).toContain('Cloudflare');
    });

    it('should mute Cloudflare 503 errors', () => {
      const result = shouldAutoMute('Cloudflare 503 Service Unavailable');

      expect(result.mute).toBe(true);
      expect(result.reason).toBe('external_service');
    });

    it('should mute Cloudflare 521 errors', () => {
      const result = shouldAutoMute('Cloudflare error 521 - Web server is down');

      expect(result.mute).toBe(true);
    });

    it('should mute ECONNRESET external errors', () => {
      const result = shouldAutoMute('ECONNRESET error when calling external API');

      expect(result.mute).toBe(true);
      expect(result.reason).toBe('external_service');
      expect(result.description).toContain('connection resets');
    });
  });

  describe('non-matching patterns (should NOT be muted)', () => {
    it('should not mute database constraint violations', () => {
      const result = shouldAutoMute('Database constraint violation: unique key already exists');

      expect(result.mute).toBe(false);
      expect(result.reason).toBeUndefined();
      expect(result.description).toBeUndefined();
    });

    it('should not mute regular API errors', () => {
      const result = shouldAutoMute('API call failed with status 500');

      expect(result.mute).toBe(false);
    });

    it('should not mute authentication errors', () => {
      const result = shouldAutoMute('Authentication failed: invalid token');

      expect(result.mute).toBe(false);
    });

    it('should not mute validation errors', () => {
      const result = shouldAutoMute('Validation error: email format is invalid');

      expect(result.mute).toBe(false);
    });

    it('should not mute ECONNRESET without external context', () => {
      const result = shouldAutoMute('ECONNRESET error occurred');

      expect(result.mute).toBe(false);
    });

    it('should not mute health endpoint success (only 404)', () => {
      const result = shouldAutoMute('/api/trpc/health returned 200 OK');

      expect(result.mute).toBe(false);
    });

    it('should not mute generic Redis errors', () => {
      const result = shouldAutoMute('Redis command timed out');

      expect(result.mute).toBe(false);
    });

    it('should not mute empty messages', () => {
      const result = shouldAutoMute('');

      expect(result.mute).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle messages with special characters', () => {
      const result = shouldAutoMute('Redis connection ended [code=123] {reason: "normal"}');

      expect(result.mute).toBe(true);
    });

    it('should handle multiline messages', () => {
      const result = shouldAutoMute('Error occurred:\nRedis connection ended\nStack trace follows');

      expect(result.mute).toBe(true);
    });

    it('should handle messages with unicode', () => {
      const result = shouldAutoMute('Redis connection ended — ошибка соединения');

      expect(result.mute).toBe(true);
    });

    it('should return first matching rule only', () => {
      // Message that could match multiple patterns
      const result = shouldAutoMute('graceful shutdown due to Redis connection ended');

      // Should match graceful_shutdown first (Redis pattern comes first in array)
      expect(result.mute).toBe(true);
      expect(result.reason).toBe('graceful_shutdown');
    });

    it('should not mute whitespace-only messages', () => {
      const result1 = shouldAutoMute('   ');
      const result2 = shouldAutoMute('\n\t\r');

      expect(result1.mute).toBe(false);
      expect(result2.mute).toBe(false);
    });

    it('should handle null input gracefully', () => {
      const result = shouldAutoMute(null as unknown as string);
      expect(result.mute).toBe(false);
    });

    it('should handle undefined input gracefully', () => {
      const result = shouldAutoMute(undefined as unknown as string);
      expect(result.mute).toBe(false);
    });

    it('should handle very long error messages efficiently', () => {
      const longMessage = 'Redis connection ended' + ' extra data'.repeat(10000);
      const result = shouldAutoMute(longMessage);

      expect(result.mute).toBe(true);
      expect(result.reason).toBe('graceful_shutdown');
    });

    it('should not mute messages that almost match patterns', () => {
      // Missing "connection" keyword
      const result1 = shouldAutoMute('Redis ended');
      // Missing "ended" or "closed"
      const result2 = shouldAutoMute('Redis connection lost');

      expect(result1.mute).toBe(false);
      expect(result2.mute).toBe(false);
    });
  });

  describe('expected_behavior patterns', () => {
    it('should auto-mute "Job not found" polling errors', () => {
      const result = shouldAutoMute('Job 272 not found');
      expect(result.mute).toBe(true);
      expect(result.reason).toBe('expected_behavior');
    });

    it('should auto-mute "Failed to log generation trace"', () => {
      const result = shouldAutoMute('Failed to log generation trace');
      expect(result.mute).toBe(true);
      expect(result.reason).toBe('expected_behavior');
    });
  });

  describe('graceful_fallback patterns', () => {
    it('should auto-mute "Patcher REJECTED truncated"', () => {
      const result = shouldAutoMute(
        'Patcher: REJECTED - content was truncated, returning original'
      );
      expect(result.mute).toBe(true);
      expect(result.reason).toBe('graceful_fallback');
    });

    it('should auto-mute preprocessing failures with fallback', () => {
      const result = shouldAutoMute('Preprocessing failed, using raw output');
      expect(result.mute).toBe(true);
      expect(result.reason).toBe('graceful_fallback');
    });
  });

  describe('Stage 5 model fallbacks', () => {
    it('should auto-mute Stage 5 primary model failures', () => {
      const result = shouldAutoMute('Stage 5: Primary model attempt failed');
      expect(result.mute).toBe(true);
      expect(result.reason).toBe('cascading_repair');
    });
  });

  describe('job_lifecycle new patterns', () => {
    it('should auto-mute "could not renew lock for job" errors', () => {
      const result = shouldAutoMute('could not renew lock for job 12345');
      expect(result.mute).toBe(true);
      expect(result.reason).toBe('job_lifecycle');
    });

    it('should auto-mute "Missing key for job moveToDelayed" errors', () => {
      const result = shouldAutoMute('Missing key for job 456. Command: moveToDelayed');
      expect(result.mute).toBe(true);
      expect(result.reason).toBe('job_lifecycle');
    });
  });

  describe('heuristic false positive patterns', () => {
    it('should auto-mute "Critical language consistency failure" errors', () => {
      const result = shouldAutoMute('Critical language consistency failure: detected Cyrillic');
      expect(result.mute).toBe(true);
      expect(result.reason).toBe('expected_behavior');
    });

    it('should auto-mute "Critical heuristic failures detected skipping LLM review" errors', () => {
      const result = shouldAutoMute('Critical heuristic failures detected, skipping LLM review');
      expect(result.mute).toBe(true);
      expect(result.reason).toBe('expected_behavior');
    });
  });

  describe('AUTO_MUTE_RULES configuration', () => {
    it('should have rules defined (auto-mute patterns)', () => {
      // At least 20 rules expected - exact count changes as rules are added
      expect(AUTO_MUTE_RULES.length).toBeGreaterThanOrEqual(20);
    });

    it('should have valid structure for all rules', () => {
      for (const rule of AUTO_MUTE_RULES) {
        expect(rule.pattern).toBeInstanceOf(RegExp);
        expect(typeof rule.reason).toBe('string');
        expect(typeof rule.description).toBe('string');
        expect(rule.reason.length).toBeGreaterThan(0);
        expect(rule.description.length).toBeGreaterThan(0);
      }
    });

    it('should have unique patterns', () => {
      const patternStrings = AUTO_MUTE_RULES.map(r => r.pattern.source);
      const uniquePatterns = new Set(patternStrings);
      expect(uniquePatterns.size).toBe(AUTO_MUTE_RULES.length);
    });
  });
});
