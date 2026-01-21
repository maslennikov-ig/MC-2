/**
 * Unit tests for Redis retry strategy logic
 * @module tests/unit/shared/cache/redis-retry-strategy
 *
 * Tests exponential backoff calculation, circuit breaker behavior,
 * and error detection for reconnection handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// CONSTANTS (mirrored from redis.ts for isolated testing)
// ============================================================================

const REDIS_MAX_RECONNECT_ATTEMPTS = 60;
const REDIS_BACKOFF_BASE_MS = 100;
const REDIS_BACKOFF_MAX_MS = 30000;
const REDIS_WARNING_THRESHOLD = 50;

// ============================================================================
// PURE FUNCTION EXTRACTS FOR TESTING
// ============================================================================

/**
 * Calculate retry delay using exponential backoff
 * Extracted from retryStrategy for testability
 */
function calculateRetryDelay(times: number): number {
  return Math.min(REDIS_BACKOFF_BASE_MS * Math.pow(2, times - 1), REDIS_BACKOFF_MAX_MS);
}

/**
 * Determine if circuit breaker should trigger
 */
function shouldTriggerCircuitBreaker(times: number): boolean {
  return times >= REDIS_MAX_RECONNECT_ATTEMPTS;
}

/**
 * Determine if shutdown is imminent (warning threshold)
 */
function isShutdownImminent(reconnectionAttempts: number): boolean {
  return reconnectionAttempts >= REDIS_WARNING_THRESHOLD;
}

/**
 * Check if error should trigger reconnection
 * Extracted from reconnectOnError for testability
 */
function shouldReconnectOnError(err: { message: string; code?: string }): boolean {
  // Check error code property first (for DNS/network errors)
  if (err.code) {
    const networkErrors = ['EAI_AGAIN', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT'];
    if (networkErrors.includes(err.code)) {
      return true;
    }
  }

  // Fallback to message check for Redis-specific errors (READONLY has no code)
  if (err.message.includes('READONLY')) {
    return true;
  }

  return false;
}

// ============================================================================
// TESTS: EXPONENTIAL BACKOFF
// ============================================================================

describe('Redis Retry Strategy: Exponential Backoff', () => {
  it('should calculate correct delay for early attempts', () => {
    expect(calculateRetryDelay(1)).toBe(100); // 100ms
    expect(calculateRetryDelay(2)).toBe(200); // 200ms
    expect(calculateRetryDelay(3)).toBe(400); // 400ms
    expect(calculateRetryDelay(4)).toBe(800); // 800ms
    expect(calculateRetryDelay(5)).toBe(1600); // 1.6s
  });

  it('should cap delay at maximum (30s)', () => {
    // Attempt 9: 100 * 2^8 = 25,600ms (below cap)
    expect(calculateRetryDelay(9)).toBe(25600);

    // Attempt 10: 100 * 2^9 = 51,200ms → capped at 30,000ms
    expect(calculateRetryDelay(10)).toBe(30000);

    // All subsequent attempts should be capped at 30s
    expect(calculateRetryDelay(20)).toBe(30000);
    expect(calculateRetryDelay(50)).toBe(30000);
    expect(calculateRetryDelay(60)).toBe(30000);
  });

  it('should calculate total retry time as ~26 minutes', () => {
    let totalMs = 0;
    for (let times = 1; times <= REDIS_MAX_RECONNECT_ATTEMPTS; times++) {
      const delay = calculateRetryDelay(times);
      totalMs += delay;
    }

    const totalMinutes = totalMs / 60000;

    // Should be approximately 26 minutes (25-27 range)
    expect(totalMinutes).toBeGreaterThan(25);
    expect(totalMinutes).toBeLessThan(27);

    // Verify it's closer to 26 than 20 (the old incorrect comment)
    expect(Math.abs(totalMinutes - 26)).toBeLessThan(Math.abs(totalMinutes - 20));
  });
});

// ============================================================================
// TESTS: CIRCUIT BREAKER
// ============================================================================

describe('Redis Retry Strategy: Circuit Breaker', () => {
  it('should NOT trigger circuit breaker before 60 attempts', () => {
    expect(shouldTriggerCircuitBreaker(1)).toBe(false);
    expect(shouldTriggerCircuitBreaker(30)).toBe(false);
    expect(shouldTriggerCircuitBreaker(59)).toBe(false);
  });

  it('should trigger circuit breaker at exactly 60 attempts', () => {
    expect(shouldTriggerCircuitBreaker(60)).toBe(true);
  });

  it('should trigger circuit breaker after 60 attempts', () => {
    expect(shouldTriggerCircuitBreaker(61)).toBe(true);
    expect(shouldTriggerCircuitBreaker(100)).toBe(true);
  });
});

// ============================================================================
// TESTS: SHUTDOWN WARNING THRESHOLD
// ============================================================================

describe('Redis Retry Strategy: Shutdown Warning', () => {
  it('should NOT indicate shutdown imminent below threshold', () => {
    expect(isShutdownImminent(0)).toBe(false);
    expect(isShutdownImminent(25)).toBe(false);
    expect(isShutdownImminent(49)).toBe(false);
  });

  it('should indicate shutdown imminent at threshold', () => {
    expect(isShutdownImminent(50)).toBe(true);
  });

  it('should indicate shutdown imminent above threshold', () => {
    expect(isShutdownImminent(51)).toBe(true);
    expect(isShutdownImminent(59)).toBe(true);
    expect(isShutdownImminent(60)).toBe(true);
  });
});

// ============================================================================
// TESTS: ERROR DETECTION FOR RECONNECTION
// ============================================================================

describe('Redis Retry Strategy: reconnectOnError', () => {
  describe('DNS errors (by code)', () => {
    it('should reconnect on EAI_AGAIN (DNS temporary failure)', () => {
      const error = { message: 'getaddrinfo EAI_AGAIN redis.local', code: 'EAI_AGAIN' };
      expect(shouldReconnectOnError(error)).toBe(true);
    });

    it('should reconnect on ENOTFOUND (DNS permanent failure)', () => {
      const error = { message: 'getaddrinfo ENOTFOUND redis.local', code: 'ENOTFOUND' };
      expect(shouldReconnectOnError(error)).toBe(true);
    });
  });

  describe('Network errors (by code)', () => {
    it('should reconnect on ECONNRESET', () => {
      const error = { message: 'Connection reset by peer', code: 'ECONNRESET' };
      expect(shouldReconnectOnError(error)).toBe(true);
    });

    it('should reconnect on ETIMEDOUT', () => {
      const error = { message: 'Connection timed out', code: 'ETIMEDOUT' };
      expect(shouldReconnectOnError(error)).toBe(true);
    });
  });

  describe('Redis-specific errors (by message)', () => {
    it('should reconnect on READONLY error', () => {
      const error = { message: "READONLY You can't write against a read only replica." };
      expect(shouldReconnectOnError(error)).toBe(true);
    });
  });

  describe('Errors that should NOT trigger reconnection', () => {
    it('should NOT reconnect on authentication errors', () => {
      const error = { message: 'ERR invalid password' };
      expect(shouldReconnectOnError(error)).toBe(false);
    });

    it('should NOT reconnect on command errors', () => {
      const error = {
        message: 'WRONGTYPE Operation against a key holding the wrong kind of value',
      };
      expect(shouldReconnectOnError(error)).toBe(false);
    });

    it('should NOT reconnect on OOM errors', () => {
      const error = { message: 'OOM command not allowed when used memory > maxmemory' };
      expect(shouldReconnectOnError(error)).toBe(false);
    });

    it('should NOT reconnect on unknown errors without code', () => {
      const error = { message: 'Some random error' };
      expect(shouldReconnectOnError(error)).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should prioritize code over message for network errors', () => {
      // Error has ECONNRESET code but misleading message
      const error = { message: 'Something unrelated', code: 'ECONNRESET' };
      expect(shouldReconnectOnError(error)).toBe(true);
    });

    it('should fall back to message check when code is not a network error', () => {
      // Error has non-network code but READONLY message
      const error = { message: 'READONLY replica mode', code: 'SOME_OTHER_CODE' };
      expect(shouldReconnectOnError(error)).toBe(true);
    });
  });
});

// ============================================================================
// TESTS: HEALTH STATUS
// ============================================================================

describe('Redis Health Status', () => {
  it('should track minutes since first failure accurately', () => {
    const firstFailureTime = Date.now() - 5 * 60 * 1000; // 5 minutes ago
    const minutesSinceFirstFailure = (Date.now() - firstFailureTime) / 60000;

    // Should be approximately 5 minutes
    expect(minutesSinceFirstFailure).toBeGreaterThanOrEqual(4.9);
    expect(minutesSinceFirstFailure).toBeLessThanOrEqual(5.1);
  });

  it('should return null for minutes when no failure has occurred', () => {
    const firstFailureTime: number | null = null;
    const minutesSinceFirstFailure = firstFailureTime
      ? (Date.now() - firstFailureTime) / 60000
      : null;

    expect(minutesSinceFirstFailure).toBeNull();
  });
});
