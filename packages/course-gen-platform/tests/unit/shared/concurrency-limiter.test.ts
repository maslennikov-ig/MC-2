/**
 * Unit tests for ConcurrencyLimiter class
 *
 * Tests the semaphore-based concurrency limiter used to enforce Jina API's
 * max concurrent request limit (2 concurrent requests per API key).
 *
 * Coverage:
 * 1. Sequential acquisition when under limit
 * 2. Queueing when at limit
 * 3. Release unblocks waiting requests
 * 4. Exception safety (release in finally)
 * 5. Correct ordering (FIFO queue)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConcurrencyLimiter } from '@/shared/embeddings/jina-client';

describe('ConcurrencyLimiter', () => {
  let limiter: ConcurrencyLimiter;

  beforeEach(() => {
    // Create a fresh limiter for each test
    limiter = new ConcurrencyLimiter(2); // Default: 2 concurrent requests
  });

  describe('Sequential acquisition when under limit', () => {
    it('should immediately acquire slots when under maxConcurrent limit', async () => {
      const startTime = Date.now();

      // Acquire first slot - should be immediate
      await limiter.acquire();
      const firstAcquireTime = Date.now() - startTime;

      // Acquire second slot - should also be immediate
      await limiter.acquire();
      const secondAcquireTime = Date.now() - startTime;

      // Both should complete within 10ms (no waiting)
      expect(firstAcquireTime).toBeLessThan(10);
      expect(secondAcquireTime).toBeLessThan(10);

      // Clean up
      limiter.release();
      limiter.release();
    });

    it('should allow maxConcurrent acquisitions without blocking', async () => {
      const acquisitions = await Promise.all([limiter.acquire(), limiter.acquire()]);

      expect(acquisitions).toHaveLength(2);

      // Clean up
      limiter.release();
      limiter.release();
    });
  });

  describe('Queueing when at limit', () => {
    it('should queue requests when maxConcurrent limit is reached', async () => {
      // Acquire both available slots
      await limiter.acquire();
      await limiter.acquire();

      let thirdAcquired = false;

      // Third acquisition should block
      const thirdAcquisition = limiter.acquire().then(() => {
        thirdAcquired = true;
      });

      // Wait 50ms - third acquisition should still be blocked
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(thirdAcquired).toBe(false);

      // Release one slot - third should now acquire
      limiter.release();
      await thirdAcquisition;
      expect(thirdAcquired).toBe(true);

      // Clean up
      limiter.release();
      limiter.release();
    });

    it('should respect maxConcurrent parameter in constructor', async () => {
      const limiter3 = new ConcurrencyLimiter(3);

      // Should allow 3 concurrent acquisitions
      await Promise.all([limiter3.acquire(), limiter3.acquire(), limiter3.acquire()]);

      let fourthAcquired = false;
      const fourthAcquisition = limiter3.acquire().then(() => {
        fourthAcquired = true;
      });

      // Wait 50ms - fourth should be blocked
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(fourthAcquired).toBe(false);

      // Release one slot
      limiter3.release();
      await fourthAcquisition;
      expect(fourthAcquired).toBe(true);

      // Clean up
      limiter3.release();
      limiter3.release();
      limiter3.release();
    });

    it('should handle maxConcurrent=1 (strict serial execution)', async () => {
      const limiter1 = new ConcurrencyLimiter(1);

      await limiter1.acquire();

      let secondAcquired = false;
      const secondAcquisition = limiter1.acquire().then(() => {
        secondAcquired = true;
      });

      // Second should be blocked
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(secondAcquired).toBe(false);

      limiter1.release();
      await secondAcquisition;
      expect(secondAcquired).toBe(true);

      limiter1.release();
    });
  });

  describe('Release unblocks waiting requests', () => {
    it('should immediately grant slot to next queued request on release', async () => {
      // Fill both slots
      await limiter.acquire();
      await limiter.acquire();

      let thirdAcquired = false;
      let thirdAcquireTime: number | null = null;

      // Queue third request
      const thirdAcquisition = limiter.acquire().then(() => {
        thirdAcquired = true;
        thirdAcquireTime = Date.now();
      });

      // Wait to ensure it's queued
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(thirdAcquired).toBe(false);

      // Release and measure time
      const releaseTime = Date.now();
      limiter.release();
      await thirdAcquisition;

      expect(thirdAcquired).toBe(true);
      expect(thirdAcquireTime).not.toBeNull();

      // Should acquire within 10ms of release (immediate grant)
      const grantDelay = thirdAcquireTime! - releaseTime;
      expect(grantDelay).toBeLessThan(10);

      // Clean up
      limiter.release();
      limiter.release();
    });

    it('should process multiple queued requests in order', async () => {
      // Fill both slots
      await limiter.acquire();
      await limiter.acquire();

      const acquisitionOrder: number[] = [];

      // Queue 3 requests
      const request3 = limiter.acquire().then(() => acquisitionOrder.push(3));
      const request4 = limiter.acquire().then(() => acquisitionOrder.push(4));
      const request5 = limiter.acquire().then(() => acquisitionOrder.push(5));

      // Wait to ensure all are queued
      await new Promise(resolve => setTimeout(resolve, 50));

      // Release first slot - should grant to request3
      limiter.release();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(acquisitionOrder).toEqual([3]);

      // Release second slot - should grant to request4
      limiter.release();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(acquisitionOrder).toEqual([3, 4]);

      // Release third slot - should grant to request5
      limiter.release();
      await request5;
      expect(acquisitionOrder).toEqual([3, 4, 5]);

      // Clean up
      limiter.release();
      limiter.release();
    });

    it('should handle no queued requests on release', () => {
      // Acquire and release without any pending requests
      expect(async () => {
        await limiter.acquire();
        limiter.release();
      }).not.toThrow();
    });
  });

  describe('Exception safety (release in finally)', () => {
    it('should properly release slot even when operation throws error', async () => {
      await limiter.acquire();

      try {
        await limiter.acquire();
        // Simulate error during operation
        throw new Error('Simulated operation failure');
      } catch (error) {
        // Release in finally block pattern
        limiter.release();
      }

      // Should be able to acquire again (slot was released despite error)
      let thirdAcquired = false;
      const thirdAcquisition = limiter.acquire().then(() => {
        thirdAcquired = true;
      });

      await thirdAcquisition;
      expect(thirdAcquired).toBe(true);

      // Clean up
      limiter.release();
      limiter.release();
    });

    it('should not break queue when release happens during error', async () => {
      // Fill both slots
      await limiter.acquire();
      await limiter.acquire();

      const acquisitionOrder: number[] = [];

      // Queue 2 requests
      const request3 = limiter.acquire().then(() => acquisitionOrder.push(3));
      const request4 = limiter.acquire().then(() => acquisitionOrder.push(4));

      // Wait to ensure queued
      await new Promise(resolve => setTimeout(resolve, 50));

      // Simulate error in first operation, but still release
      try {
        throw new Error('Simulated error in slot 1');
      } catch (error) {
        // Error caught but ignored (simulating error handling)
      } finally {
        limiter.release(); // Should grant to request3
      }

      await request3;
      expect(acquisitionOrder).toEqual([3]);

      // Release second slot
      limiter.release();
      await request4;
      expect(acquisitionOrder).toEqual([3, 4]);

      // Clean up
      limiter.release();
      limiter.release();
    });

    it('should support typical try-finally pattern', async () => {
      const results: string[] = [];

      // Simulate 3 concurrent operations (2 run, 1 queued)
      const operation1 = (async () => {
        await limiter.acquire();
        try {
          results.push('op1-start');
          await new Promise(resolve => setTimeout(resolve, 50));
          results.push('op1-end');
        } finally {
          limiter.release();
        }
      })();

      const operation2 = (async () => {
        await limiter.acquire();
        try {
          results.push('op2-start');
          await new Promise(resolve => setTimeout(resolve, 50));
          throw new Error('op2 failed'); // Simulate error
        } finally {
          limiter.release();
        }
      })();

      const operation3 = (async () => {
        await limiter.acquire();
        try {
          results.push('op3-start');
          await new Promise(resolve => setTimeout(resolve, 50));
          results.push('op3-end');
        } finally {
          limiter.release();
        }
      })();

      // Wait for all operations (ignore error from op2)
      await Promise.allSettled([operation1, operation2, operation3]);

      // Verify all operations started and ended (except op2 which threw)
      expect(results).toContain('op1-start');
      expect(results).toContain('op1-end');
      expect(results).toContain('op2-start');
      expect(results).toContain('op3-start');
      expect(results).toContain('op3-end');

      // op2-end should NOT be present (threw error)
      expect(results).not.toContain('op2-end');
    });
  });

  describe('Correct ordering (FIFO queue)', () => {
    it('should process queued requests in FIFO order', async () => {
      // Fill both slots
      await limiter.acquire();
      await limiter.acquire();

      const acquisitionOrder: number[] = [];

      // Queue 5 requests
      const promises = [
        limiter.acquire().then(() => acquisitionOrder.push(1)),
        limiter.acquire().then(() => acquisitionOrder.push(2)),
        limiter.acquire().then(() => acquisitionOrder.push(3)),
        limiter.acquire().then(() => acquisitionOrder.push(4)),
        limiter.acquire().then(() => acquisitionOrder.push(5)),
      ];

      // Wait to ensure all are queued
      await new Promise(resolve => setTimeout(resolve, 50));

      // Release slots one by one
      for (let i = 0; i < 7; i++) {
        limiter.release();
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      await Promise.all(promises);

      // Verify FIFO order
      expect(acquisitionOrder).toEqual([1, 2, 3, 4, 5]);
    });

    it('should maintain FIFO order even with delays', async () => {
      await limiter.acquire();
      await limiter.acquire();

      const acquisitionOrder: number[] = [];

      // Queue first request
      const request1 = limiter.acquire().then(() => acquisitionOrder.push(1));
      await new Promise(resolve => setTimeout(resolve, 20));

      // Queue second request
      const request2 = limiter.acquire().then(() => acquisitionOrder.push(2));
      await new Promise(resolve => setTimeout(resolve, 20));

      // Queue third request
      const request3 = limiter.acquire().then(() => acquisitionOrder.push(3));
      await new Promise(resolve => setTimeout(resolve, 20));

      // Release slots
      limiter.release();
      await new Promise(resolve => setTimeout(resolve, 10));
      limiter.release();
      await new Promise(resolve => setTimeout(resolve, 10));
      limiter.release();

      await Promise.all([request1, request2, request3]);

      // Should maintain insertion order despite delays
      expect(acquisitionOrder).toEqual([1, 2, 3]);

      // Clean up
      limiter.release();
      limiter.release();
      limiter.release();
    });
  });

  describe('Real-world scenario: Jina API with 2 concurrent requests', () => {
    it('should handle 5 sequential API calls with max 2 concurrent', async () => {
      const callLog: Array<{ id: number; event: string; timestamp: number }> = [];

      // Simulate 5 API calls
      const apiCalls = Array.from({ length: 5 }, (_, i) =>
        (async () => {
          const id = i + 1;
          await limiter.acquire();
          try {
            callLog.push({ id, event: 'start', timestamp: Date.now() });

            // Simulate API call duration (50ms)
            await new Promise(resolve => setTimeout(resolve, 50));

            callLog.push({ id, event: 'end', timestamp: Date.now() });
          } finally {
            limiter.release();
          }
        })()
      );

      await Promise.all(apiCalls);

      // Verify all calls completed
      expect(callLog).toHaveLength(10); // 5 starts + 5 ends

      // Count concurrent calls at any point in time
      let maxConcurrent = 0;
      const startEvents = callLog.filter(e => e.event === 'start');
      const endEvents = callLog.filter(e => e.event === 'end');

      for (const startEvent of startEvents) {
        // Count how many calls were running at this start time
        const concurrent = startEvents.filter(
          s => s.timestamp <= startEvent.timestamp && s.timestamp >= startEvent.timestamp
        ).length;

        const ended = endEvents.filter(e => e.timestamp < startEvent.timestamp).length;
        const running = concurrent - ended;

        maxConcurrent = Math.max(maxConcurrent, running);
      }

      // Should never exceed 2 concurrent requests
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('should properly handle mixed success and failure scenarios', async () => {
      const results: Array<{ id: number; status: string }> = [];

      // Simulate 4 API calls (2 succeed, 2 fail)
      const apiCalls = [
        (async () => {
          await limiter.acquire();
          try {
            await new Promise(resolve => setTimeout(resolve, 30));
            results.push({ id: 1, status: 'success' });
          } finally {
            limiter.release();
          }
        })(),
        (async () => {
          await limiter.acquire();
          try {
            await new Promise(resolve => setTimeout(resolve, 30));
            throw new Error('API error');
          } catch {
            results.push({ id: 2, status: 'error' });
          } finally {
            limiter.release();
          }
        })(),
        (async () => {
          await limiter.acquire();
          try {
            await new Promise(resolve => setTimeout(resolve, 30));
            results.push({ id: 3, status: 'success' });
          } finally {
            limiter.release();
          }
        })(),
        (async () => {
          await limiter.acquire();
          try {
            await new Promise(resolve => setTimeout(resolve, 30));
            throw new Error('Another API error');
          } catch {
            results.push({ id: 4, status: 'error' });
          } finally {
            limiter.release();
          }
        })(),
      ];

      await Promise.all(apiCalls);

      // All 4 calls should complete (2 success, 2 error)
      expect(results).toHaveLength(4);
      expect(results.filter(r => r.status === 'success')).toHaveLength(2);
      expect(results.filter(r => r.status === 'error')).toHaveLength(2);
    });
  });

  describe('Edge cases', () => {
    it('should handle rapid acquire/release cycles', async () => {
      const iterations = 100;
      let completed = 0;

      const operations = Array.from({ length: iterations }, async () => {
        await limiter.acquire();
        try {
          // Minimal work
          completed++;
        } finally {
          limiter.release();
        }
      });

      await Promise.all(operations);
      expect(completed).toBe(iterations);
    });

    it('should handle acquire without release (memory leak test)', async () => {
      // This test verifies that forgetting to release doesn't break the limiter
      const limiterLeaky = new ConcurrencyLimiter(2);

      // Acquire both slots
      await limiterLeaky.acquire();
      await limiterLeaky.acquire();

      // Try to acquire third without releasing - should block indefinitely
      let thirdAcquired = false;
      const thirdAcquisition = limiterLeaky.acquire().then(() => {
        thirdAcquired = true;
      });

      // Wait 100ms - should still be blocked
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(thirdAcquired).toBe(false);

      // Note: In production, this would be a bug (forgetting to release)
      // The limiter correctly prevents over-concurrency, but the third request waits forever
    });

    it('should handle multiple releases without corresponding acquires (robustness test)', () => {
      // This tests robustness against misuse (calling release too many times)
      expect(() => {
        limiter.release();
        limiter.release();
        limiter.release();
      }).not.toThrow();

      // Note: This is misuse, but the limiter shouldn't crash
      // In production, proper acquire/release pairing is critical
    });
  });

  describe('Metrics tracking (getStats and reset)', () => {
    it('should track currentRunning and queueLength', async () => {
      // Initial state
      let stats = limiter.getStats();
      expect(stats.currentRunning).toBe(0);
      expect(stats.queueLength).toBe(0);

      // Acquire first slot
      await limiter.acquire();
      stats = limiter.getStats();
      expect(stats.currentRunning).toBe(1);
      expect(stats.queueLength).toBe(0);

      // Acquire second slot
      await limiter.acquire();
      stats = limiter.getStats();
      expect(stats.currentRunning).toBe(2);
      expect(stats.queueLength).toBe(0);

      // Queue third request (should show in queueLength)
      const thirdAcquisition = limiter.acquire();
      await new Promise(resolve => setTimeout(resolve, 10));
      stats = limiter.getStats();
      expect(stats.currentRunning).toBe(2);
      expect(stats.queueLength).toBe(1);

      // Release and verify
      limiter.release();
      await thirdAcquisition;
      stats = limiter.getStats();
      expect(stats.currentRunning).toBe(2);
      expect(stats.queueLength).toBe(0);

      // Clean up
      limiter.release();
      limiter.release();
    });

    it('should track totalAcquired counter', async () => {
      // Initial state
      let stats = limiter.getStats();
      expect(stats.totalAcquired).toBe(0);

      // Acquire and release 3 times
      for (let i = 0; i < 3; i++) {
        await limiter.acquire();
        limiter.release();
      }

      stats = limiter.getStats();
      expect(stats.totalAcquired).toBe(3);

      // Acquire 2 more
      await limiter.acquire();
      await limiter.acquire();

      stats = limiter.getStats();
      expect(stats.totalAcquired).toBe(5);

      // Clean up
      limiter.release();
      limiter.release();
    });

    it('should track totalWaitTimeMs and avgWaitTimeMs', async () => {
      // Fill both slots
      await limiter.acquire();
      await limiter.acquire();

      // Queue 2 requests that will wait
      const request1 = limiter.acquire();
      const request2 = limiter.acquire();

      // Wait 50ms before releasing
      await new Promise(resolve => setTimeout(resolve, 50));
      limiter.release();
      await request1;

      // Wait another 50ms before releasing
      await new Promise(resolve => setTimeout(resolve, 50));
      limiter.release();
      await request2;

      const stats = limiter.getStats();

      // totalWaitTimeMs should be roughly 50ms + 100ms = 150ms (with some tolerance)
      expect(stats.totalWaitTimeMs).toBeGreaterThan(130);
      expect(stats.totalWaitTimeMs).toBeLessThan(200);

      // avgWaitTimeMs should be roughly 75ms (150ms / 2 requests)
      expect(stats.avgWaitTimeMs).toBeGreaterThan(65);
      expect(stats.avgWaitTimeMs).toBeLessThan(100);

      // Clean up
      limiter.release();
      limiter.release();
    });

    it('should return avgWaitTimeMs=0 when no requests have waited', async () => {
      // Acquire and release immediately (no queueing)
      await limiter.acquire();
      limiter.release();
      await limiter.acquire();
      limiter.release();

      const stats = limiter.getStats();
      expect(stats.avgWaitTimeMs).toBe(0);
    });

    it('should reset all statistics counters', async () => {
      // Generate some metrics
      await limiter.acquire();
      await limiter.acquire();

      const queuedRequest = limiter.acquire();
      await new Promise(resolve => setTimeout(resolve, 50));
      limiter.release();
      await queuedRequest;

      // Verify metrics exist
      let stats = limiter.getStats();
      expect(stats.totalAcquired).toBeGreaterThan(0);
      expect(stats.totalWaitTimeMs).toBeGreaterThan(0);

      // Reset
      limiter.reset();

      // Verify all counters are zero
      stats = limiter.getStats();
      expect(stats.totalAcquired).toBe(0);
      expect(stats.totalWaitTimeMs).toBe(0);
      expect(stats.avgWaitTimeMs).toBe(0);

      // currentRunning and queueLength should NOT be affected by reset
      // (they reflect actual state, not historical metrics)
      expect(stats.currentRunning).toBe(2); // Still 2 running from before
      expect(stats.queueLength).toBe(0);

      // Clean up
      limiter.release();
      limiter.release();
    });

    it('should track metrics correctly across multiple cycles', async () => {
      const cycles = 5;

      for (let i = 0; i < cycles; i++) {
        await limiter.acquire();
        limiter.release();
      }

      const stats = limiter.getStats();
      expect(stats.totalAcquired).toBe(cycles);
      expect(stats.currentRunning).toBe(0);
    });

    it('should calculate avgWaitTimeMs correctly with multiple queued requests', async () => {
      await limiter.acquire();
      await limiter.acquire();

      // Queue 3 requests with known wait times
      const request1 = limiter.acquire(); // Will wait ~100ms
      const request2 = limiter.acquire(); // Will wait ~150ms
      const request3 = limiter.acquire(); // Will wait ~200ms

      await new Promise(resolve => setTimeout(resolve, 100));
      limiter.release();
      await request1;

      await new Promise(resolve => setTimeout(resolve, 50));
      limiter.release();
      await request2;

      await new Promise(resolve => setTimeout(resolve, 50));
      limiter.release();
      await request3;

      const stats = limiter.getStats();

      // Total wait time should be roughly 100 + 150 + 200 = 450ms
      expect(stats.totalWaitTimeMs).toBeGreaterThan(400);
      expect(stats.totalWaitTimeMs).toBeLessThan(550);

      // Average should be roughly 150ms (450ms / 3 requests)
      expect(stats.avgWaitTimeMs).toBeGreaterThan(130);
      expect(stats.avgWaitTimeMs).toBeLessThan(190);

      // Clean up
      limiter.release();
      limiter.release();
      limiter.release();
    });
  });

  describe('Integration with exported singleton and helper functions', () => {
    it('should verify ConcurrencyLimiter is exported for testing', () => {
      // Verify class is exported
      expect(ConcurrencyLimiter).toBeDefined();
      expect(typeof ConcurrencyLimiter).toBe('function');

      // Verify we can instantiate it
      const testLimiter = new ConcurrencyLimiter(3);
      expect(testLimiter).toBeInstanceOf(ConcurrencyLimiter);
    });

    it('should support custom maxConcurrent values', async () => {
      const limiter5 = new ConcurrencyLimiter(5);

      // Should allow 5 concurrent acquisitions
      const acquisitions = await Promise.all([
        limiter5.acquire(),
        limiter5.acquire(),
        limiter5.acquire(),
        limiter5.acquire(),
        limiter5.acquire(),
      ]);

      expect(acquisitions).toHaveLength(5);

      const stats = limiter5.getStats();
      expect(stats.currentRunning).toBe(5);
      expect(stats.totalAcquired).toBe(5);

      // Clean up
      for (let i = 0; i < 5; i++) {
        limiter5.release();
      }
    });
  });
});
