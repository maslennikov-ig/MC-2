import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DistributedRateLimiter } from '../../../../src/shared/jina/distributed-rate-limiter';

// Mock Redis
vi.mock('../../../../src/shared/cache/redis', () => ({
  getRedisClient: vi.fn(),
  isRedisConnected: vi.fn(),
}));

// Mock logger to suppress test output
vi.mock('../../../../src/shared/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { getRedisClient, isRedisConnected } from '../../../../src/shared/cache/redis';
import logger from '../../../../src/shared/logger';

describe('DistributedRateLimiter', () => {
  const mockEval = vi.fn();
  const mockRedis = { eval: mockEval };

  beforeEach(() => {
    vi.mocked(getRedisClient).mockReturnValue(mockRedis as any);
    vi.mocked(isRedisConnected).mockReturnValue(true);
    mockEval.mockReset();
    vi.mocked(logger.debug).mockClear();
    vi.mocked(logger.warn).mockClear();
    vi.mocked(logger.error).mockClear();
    vi.mocked(logger.info).mockClear();
    // Set fake JINA_API_KEY for consistent hash
    process.env.JINA_API_KEY = 'test-api-key-12345';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('waitForSlot()', () => {
    it('should acquire slot when allowed', async () => {
      // Mock Redis eval to return: allowed=1, count=5, wait=0
      mockEval.mockResolvedValueOnce([1, 5, 0]);

      const limiter = new DistributedRateLimiter();
      await limiter.waitForSlot();

      expect(mockEval).toHaveBeenCalledOnce();
      expect(mockEval).toHaveBeenCalledWith(
        expect.stringContaining('ZREMRANGEBYSCORE'),
        1,
        expect.stringContaining('jina:rpm:'),
        60000, // windowMs
        100, // maxRequests
        expect.any(String) // memberId
      );
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          currentCount: 5,
          maxRequests: 100,
        }),
        expect.stringContaining('Slot acquired')
      );
    });

    it('should wait and retry when rate limited, then succeed', async () => {
      vi.useFakeTimers();

      // First call: denied, count=100, wait=500ms
      // Second call: allowed, count=99, wait=0
      mockEval.mockResolvedValueOnce([0, 100, 500]).mockResolvedValueOnce([1, 99, 0]);

      const limiter = new DistributedRateLimiter();

      // Start the async operation (don't await yet)
      const promise = limiter.waitForSlot();

      // Advance timers to trigger the setTimeout inside the retry loop
      await vi.advanceTimersByTimeAsync(600);

      // Now await the result
      await promise;

      expect(mockEval).toHaveBeenCalledTimes(2);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          currentCount: 100,
          waitMs: 500,
        }),
        expect.stringContaining('Rate limited, waiting for slot')
      );
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          currentCount: 99,
        }),
        expect.stringContaining('Slot acquired')
      );

      vi.useRealTimers();
    });

    it('should fall back to in-process when Redis disconnected', async () => {
      vi.mocked(isRedisConnected).mockReturnValue(false);

      const limiter = new DistributedRateLimiter();
      await limiter.waitForSlot();

      // Verify Redis eval is NOT called
      expect(mockEval).not.toHaveBeenCalled();

      // Verify logger shows fallback message
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          redisKey: expect.stringContaining('jina:rpm:'),
        }),
        expect.stringContaining('Redis unavailable, using in-process fallback')
      );
    });

    it('should fall back on Redis error', async () => {
      mockEval.mockRejectedValueOnce(new Error('Connection lost'));

      const limiter = new DistributedRateLimiter();
      await limiter.waitForSlot();

      expect(mockEval).toHaveBeenCalledOnce();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Connection lost',
          redisKey: expect.stringContaining('jina:rpm:'),
        }),
        expect.stringContaining('Redis error, using in-process fallback')
      );
    });

    it('should fail open after max wait', async () => {
      vi.useFakeTimers();

      // Always return denied with wait time
      mockEval.mockResolvedValue([0, 100, 100]);

      const limiter = new DistributedRateLimiter();

      // Start the async operation
      const promise = limiter.waitForSlot();

      // Advance timers past 60s max wait time (60000ms)
      // Need to advance in chunks to allow retry loop to progress
      await vi.advanceTimersByTimeAsync(61000);

      // Now await the result
      await promise;

      // Should have logged fail-open warning
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          elapsedMs: expect.any(Number),
          maxWaitMs: 60000,
        }),
        expect.stringContaining('Max wait time exceeded, failing open')
      );

      vi.useRealTimers();
    });

    it('should include API key hash in Redis key', async () => {
      mockEval.mockResolvedValueOnce([1, 1, 0]);

      const limiter = new DistributedRateLimiter();
      await limiter.waitForSlot();

      // Verify the eval call's second argument (redisKey) contains jina:rpm: prefix
      const callArgs = mockEval.mock.calls[0];
      const redisKey = callArgs[2] as string;

      expect(redisKey).toMatch(/^jina:rpm:[a-f0-9]{8}$/);
    });

    it('should use custom options when provided', async () => {
      mockEval.mockResolvedValueOnce([1, 1, 0]);

      const limiter = new DistributedRateLimiter({
        maxRequestsPerWindow: 50,
        windowMs: 30000,
        apiKeyEnvVar: 'CUSTOM_API_KEY',
      });

      process.env.CUSTOM_API_KEY = 'custom-key-value';

      await limiter.waitForSlot();

      expect(mockEval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        expect.stringContaining('jina:rpm:'),
        30000, // custom windowMs
        50, // custom maxRequests
        expect.any(String)
      );
    });

    it('should enforce minimum retry wait of 500ms', async () => {
      vi.useFakeTimers();

      // First call: denied, count=100, wait=100ms (below MIN_RETRY_WAIT_MS=500)
      // Second call: allowed
      mockEval.mockResolvedValueOnce([0, 100, 100]).mockResolvedValueOnce([1, 99, 0]);

      const limiter = new DistributedRateLimiter();

      const promise = limiter.waitForSlot();

      // Should wait at least 500ms despite Redis suggesting 100ms
      await vi.advanceTimersByTimeAsync(600);
      await promise;

      expect(mockEval).toHaveBeenCalledTimes(2);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          waitMs: 500, // enforced minimum
        }),
        expect.stringContaining('Rate limited, waiting for slot')
      );

      vi.useRealTimers();
    });

    it('should handle in-process fallback with proper interval', async () => {
      vi.useFakeTimers();
      vi.mocked(isRedisConnected).mockReturnValue(false);

      const limiter = new DistributedRateLimiter();

      // First call should pass immediately
      await limiter.waitForSlot();

      // Second call should wait FALLBACK_MIN_INTERVAL_MS (600ms)
      const promise = limiter.waitForSlot();

      // Advance time by 600ms
      await vi.advanceTimersByTimeAsync(700);

      await promise;

      expect(mockEval).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should handle multiple retries with progressive waits', async () => {
      vi.useFakeTimers();

      // First call: denied, wait=1000ms
      // Second call: denied, wait=800ms
      // Third call: allowed
      mockEval
        .mockResolvedValueOnce([0, 100, 1000])
        .mockResolvedValueOnce([0, 100, 800])
        .mockResolvedValueOnce([1, 95, 0]);

      const limiter = new DistributedRateLimiter();

      const promise = limiter.waitForSlot();

      // Advance past first wait (1000ms)
      await vi.advanceTimersByTimeAsync(1100);

      // Advance past second wait (800ms)
      await vi.advanceTimersByTimeAsync(900);

      await promise;

      expect(mockEval).toHaveBeenCalledTimes(3);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          currentCount: 95,
        }),
        expect.stringContaining('Slot acquired')
      );

      vi.useRealTimers();
    });
  });
});
