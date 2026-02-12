import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DistributedConcurrencyLimiter } from '../../../../src/shared/jina/distributed-concurrency-limiter';

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

describe('DistributedConcurrencyLimiter', () => {
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
    // Clear all timers before restoring real timers to prevent leaks
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('acquire()', () => {
    it('should acquire slot when available', async () => {
      // Mock eval to return: acquired=1, count=1
      mockEval
        .mockResolvedValueOnce([1, 1]) // Acquire
        .mockResolvedValueOnce(1); // Release (ZREM)

      const limiter = new DistributedConcurrencyLimiter();
      await limiter.acquire();

      expect(mockEval).toHaveBeenCalledOnce();
      expect(mockEval).toHaveBeenCalledWith(
        expect.stringContaining('ZREMRANGEBYSCORE'), // ACQUIRE_SCRIPT
        1,
        expect.stringContaining('jina:sem:'),
        '2', // maxConcurrent
        expect.any(String), // slotId (uuid)
        '30000' // slotTtlMs
      );
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          currentCount: 1,
          slotId: expect.any(String),
        }),
        expect.stringContaining('Slot acquired')
      );

      // Clean up: release to stop heartbeat timer
      limiter.release();
    });

    it('should poll when semaphore full, succeed on retry', async () => {
      vi.useFakeTimers();

      // First call: denied, count=2
      // Second call: acquired, count=2
      // Third call (release): ZREM
      mockEval.mockResolvedValueOnce([0, 2]).mockResolvedValueOnce([1, 2]).mockResolvedValueOnce(1); // ZREM success

      const limiter = new DistributedConcurrencyLimiter();

      const promise = limiter.acquire();

      // Advance timers to trigger retry (200-500ms delay with jitter)
      await vi.advanceTimersByTimeAsync(600);

      await promise;

      expect(mockEval).toHaveBeenCalledTimes(2);

      // Clean up: release to stop heartbeat
      limiter.release();

      vi.useRealTimers();
    });

    it('should fall back to in-process when Redis disconnected', async () => {
      vi.mocked(isRedisConnected).mockReturnValue(false);

      const limiter = new DistributedConcurrencyLimiter();
      await limiter.acquire();

      // Verify Redis eval is NOT called
      expect(mockEval).not.toHaveBeenCalled();

      // Verify logger shows fallback message
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          redisKey: expect.stringContaining('jina:sem:'),
        }),
        expect.stringContaining('Redis unavailable, using in-process fallback')
      );

      // Verify in-process state
      const stats = limiter.getStats();
      expect(stats.currentRunning).toBe(1);
      expect(stats.totalAcquired).toBe(1);
    });

    it('should fall back on Redis error during acquire', async () => {
      mockEval.mockRejectedValueOnce(new Error('Redis connection lost'));

      const limiter = new DistributedConcurrencyLimiter();
      await limiter.acquire();

      expect(mockEval).toHaveBeenCalledOnce();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Redis connection lost',
          redisKey: expect.stringContaining('jina:sem:'),
        }),
        expect.stringContaining('Redis error during acquire, using in-process fallback')
      );

      // Verify fallback worked
      const stats = limiter.getStats();
      expect(stats.totalAcquired).toBe(1);
    });

    it('should fail open after max wait (120s)', async () => {
      // Always return denied
      mockEval.mockResolvedValue([0, 2]);

      // Mock Date.now to simulate time past MAX_WAIT_MS without
      // actually iterating through 300+ polling cycles (which hangs with fake timers).
      // Flow: startTime = call#1, elapsed check = call#2 (returns >120s) → fail open immediately.
      const realNow = Date.now();
      let callCount = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        // First call (startTime): return real time
        if (callCount <= 1) return realNow;
        // All subsequent calls (elapsed check): return time past MAX_WAIT_MS
        return realNow + 121_000;
      });

      const limiter = new DistributedConcurrencyLimiter();
      await limiter.acquire();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          elapsedMs: expect.any(Number),
          currentCount: 2,
        }),
        expect.stringContaining('Max wait exceeded, failing open to in-process fallback')
      );

      // Clean up: release (it fell back to in-process, so safe to release)
      limiter.release();
    });
  });

  describe('release()', () => {
    it('should call ZREM fire-and-forget when Redis connected', async () => {
      // Acquire first
      mockEval.mockResolvedValueOnce([1, 1]);

      const limiter = new DistributedConcurrencyLimiter();
      await limiter.acquire();

      // Clear mock to isolate release call
      mockEval.mockClear();
      mockEval.mockResolvedValueOnce(1); // ZREM returns removed count

      limiter.release();

      // Wait a tick for fire-and-forget promise
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEval).toHaveBeenCalledOnce();
      expect(mockEval).toHaveBeenCalledWith(
        expect.stringContaining('ZREM'), // RELEASE_SCRIPT
        1,
        expect.stringContaining('jina:sem:'),
        expect.any(String) // slotId
      );
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          slotId: expect.any(String),
        }),
        expect.stringContaining('Slot released')
      );
    });

    it('should handle Redis error during release gracefully', async () => {
      // Acquire first
      mockEval.mockResolvedValueOnce([1, 1]);

      const limiter = new DistributedConcurrencyLimiter();
      await limiter.acquire();

      // Clear mock and make release fail
      mockEval.mockClear();
      mockEval.mockRejectedValueOnce(new Error('Release failed'));

      limiter.release();

      // Wait for fire-and-forget error handler
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Release failed',
          slotId: expect.any(String),
        }),
        expect.stringContaining('Failed to release slot in Redis')
      );
    });

    it('should use in-process fallback when no Redis', async () => {
      vi.mocked(isRedisConnected).mockReturnValue(false);

      const limiter = new DistributedConcurrencyLimiter();

      // Acquire with fallback
      await limiter.acquire();
      expect(limiter.getStats().currentRunning).toBe(1);

      // Release with fallback
      limiter.release();
      expect(limiter.getStats().currentRunning).toBe(0);

      // Verify no Redis calls
      expect(mockEval).not.toHaveBeenCalled();
    });
  });

  describe('getStats()', () => {
    it('should return correct metrics after acquisitions', async () => {
      mockEval.mockResolvedValue([1, 1]);

      const limiter = new DistributedConcurrencyLimiter();

      await limiter.acquire();
      await limiter.acquire();

      const stats = limiter.getStats();

      expect(stats.totalAcquired).toBe(2);
      expect(stats.currentRunning).toBe(0); // Not tracked in Redis mode
      expect(stats.queueLength).toBe(0);

      // Clean up: release to stop heartbeat timer
      limiter.release();
    });

    it('should track wait times correctly', async () => {
      vi.useFakeTimers();

      mockEval
        .mockResolvedValueOnce([0, 2]) // First call: denied
        .mockResolvedValueOnce([1, 2]) // Second call: acquired after wait
        .mockResolvedValueOnce(1); // Third call (release): ZREM

      const limiter = new DistributedConcurrencyLimiter();

      const promise = limiter.acquire();

      // Advance by 600ms to guarantee retry fires (jitter range is 200-500ms)
      await vi.advanceTimersByTimeAsync(600);

      await promise;

      const stats = limiter.getStats();

      expect(stats.totalAcquired).toBe(1);
      expect(stats.totalWaitTimeMs).toBeGreaterThan(0);
      expect(stats.avgWaitTimeMs).toBeGreaterThan(0);

      // Clean up: release to stop heartbeat
      limiter.release();

      vi.useRealTimers();
    });
  });

  describe('reset()', () => {
    it('should zero metrics', async () => {
      mockEval.mockResolvedValue([1, 1]);

      const limiter = new DistributedConcurrencyLimiter();

      await limiter.acquire();
      await limiter.acquire();

      expect(limiter.getStats().totalAcquired).toBe(2);

      limiter.reset();

      const stats = limiter.getStats();
      expect(stats.totalAcquired).toBe(0);
      expect(stats.totalWaitTimeMs).toBe(0);
      expect(stats.avgWaitTimeMs).toBe(0);

      // Clean up: release to stop heartbeat timer
      limiter.release();
    });
  });

  describe('heartbeat', () => {
    it('should start heartbeat on acquire', async () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');

      mockEval
        .mockResolvedValueOnce([1, 1]) // Acquire
        .mockResolvedValueOnce(1); // Release

      const limiter = new DistributedConcurrencyLimiter({
        heartbeatIntervalMs: 1000,
      });

      await limiter.acquire();

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        1000 // heartbeatIntervalMs
      );

      // Clean up: release to stop heartbeat
      limiter.release();

      setIntervalSpy.mockRestore();
    });

    it('should stop heartbeat on release', async () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      mockEval
        .mockResolvedValueOnce([1, 1]) // Acquire
        .mockResolvedValueOnce(1); // Release

      const limiter = new DistributedConcurrencyLimiter();

      await limiter.acquire();
      limiter.release();

      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });
  });

  describe('fallback acquire/release cycle', () => {
    it('should work like original ConcurrencyLimiter', async () => {
      vi.mocked(isRedisConnected).mockReturnValue(false);

      const limiter = new DistributedConcurrencyLimiter({ maxConcurrent: 2 });

      // Acquire first two slots immediately
      await limiter.acquire();
      await limiter.acquire();

      expect(limiter.getStats().currentRunning).toBe(2);

      // Third acquire should block (queue)
      const thirdAcquirePromise = limiter.acquire();

      // Let the promise enqueue
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(limiter.getStats().queueLength).toBe(1);

      // Release one slot
      limiter.release();

      // Third acquire should now resolve
      await thirdAcquirePromise;

      expect(limiter.getStats().currentRunning).toBe(2);
      expect(limiter.getStats().queueLength).toBe(0);
    });

    it('should track metrics in fallback mode', async () => {
      vi.mocked(isRedisConnected).mockReturnValue(false);

      const limiter = new DistributedConcurrencyLimiter({ maxConcurrent: 1 });

      await limiter.acquire();

      // Second acquire will queue
      const secondPromise = limiter.acquire();

      await new Promise(resolve => setTimeout(resolve, 10));

      limiter.release();
      await secondPromise;

      const stats = limiter.getStats();

      expect(stats.totalAcquired).toBe(2);
      expect(stats.totalWaitTimeMs).toBeGreaterThan(0);
      expect(stats.avgWaitTimeMs).toBeGreaterThan(0);
    });
  });

  describe('Redis key hashing', () => {
    it('should include API key hash in Redis key', async () => {
      mockEval.mockResolvedValueOnce([1, 1]);

      const limiter = new DistributedConcurrencyLimiter();
      await limiter.acquire();

      const callArgs = mockEval.mock.calls[0];
      const redisKey = callArgs[2] as string;

      expect(redisKey).toMatch(/^jina:sem:[a-f0-9]{8}$/);
    });

    it('should use custom API key env var when provided', async () => {
      mockEval.mockResolvedValueOnce([1, 1]);

      process.env.CUSTOM_JINA_KEY = 'custom-key-value';

      const limiter = new DistributedConcurrencyLimiter({
        apiKeyEnvVar: 'CUSTOM_JINA_KEY',
      });

      await limiter.acquire();

      const callArgs = mockEval.mock.calls[0];
      const redisKey = callArgs[2] as string;

      // Should have different hash than default key
      expect(redisKey).toMatch(/^jina:sem:[a-f0-9]{8}$/);

      delete process.env.CUSTOM_JINA_KEY;
    });
  });

  describe('custom configuration', () => {
    it('should use custom maxConcurrent', async () => {
      mockEval.mockResolvedValueOnce([1, 1]);

      const limiter = new DistributedConcurrencyLimiter({
        maxConcurrent: 5,
      });

      await limiter.acquire();

      expect(mockEval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        expect.any(String),
        '5', // custom maxConcurrent
        expect.any(String),
        expect.any(String)
      );
    });

    it('should use custom slotTtlMs', async () => {
      mockEval.mockResolvedValueOnce([1, 1]);

      const limiter = new DistributedConcurrencyLimiter({
        slotTtlMs: 60000,
      });

      await limiter.acquire();

      expect(mockEval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        expect.any(String),
        expect.any(String),
        expect.any(String),
        '60000' // custom slotTtlMs
      );
    });
  });
});
