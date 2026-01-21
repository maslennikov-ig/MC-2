# Redis Retry Strategy Code Review

**Generated**: 2026-01-21T12:00:00Z
**File Reviewed**: `packages/course-gen-platform/src/shared/cache/redis.ts`
**Lines**: 25-56 (retryStrategy and reconnectOnError functions)
**Recent Changes**: Commits 22111bb, a12150b
**Reviewer**: Claude Code (code-reviewer pattern)
**Context**: Shared Redis client for BullMQ workers in production

---

## Executive Summary

The Redis retry strategy implementation has been recently updated to add a circuit-breaker pattern using `process.exit(1)` after 60 failed reconnection attempts (~20 minutes). Overall, the implementation follows ioredis best practices with exponential backoff and appropriate error handling. However, there are **3 critical issues** and **4 high-priority concerns** that should be addressed before production deployment.

### Key Findings

- ⚠️ **3 Critical Issues**: Race conditions, BullMQ job loss risk, timing calculation errors
- ⚠️ **4 High Priority Issues**: Missing graceful shutdown, edge case handling, logging gaps
- ✅ **2 Medium Issues**: Code documentation, testing gaps
- ✅ **3 Low Priority Items**: Minor optimizations

### Overall Assessment

**Status**: ⚠️ **NEEDS FIXES** - Critical issues must be resolved before production use

---

## Critical Issues (Must Fix)

### 1. Race Condition: process.exit() During Active Job Processing

**Severity**: CRITICAL
**File**: `redis.ts:42`
**Category**: Concurrency / Data Integrity

**Issue**:
The `process.exit(1)` call in `retryStrategy` can terminate the process while BullMQ workers are actively processing jobs, leading to:

- **Job data loss** (jobs marked as "stalled" by BullMQ)
- **Orphaned locks** (Redis locks not released)
- **Corrupt job state** (partial writes to Supabase)
- **No cleanup handlers executed** (gracefulShutdown bypassed)

**Current Code**:

```typescript
if (times >= 60) {
  logger.error(
    { attempts: times, totalTimeMinutes: '~20' },
    'Redis unavailable for extended period, exiting for container restart'
  );
  // Use setImmediate to allow the log to flush before exit
  setImmediate(() => process.exit(1));
  return null; // Stop retrying (process will exit anyway)
}
```

**Why This Is Dangerous**:

1. **BullMQ workers** don't get a chance to call `worker.close()` to finish in-flight jobs
2. **Stage 6/7 workers** have explicit `gracefulShutdown()` handlers that are bypassed
3. **File handles, DB connections** may leak or corrupt

**Impact**:

- Jobs generating lessons (Stage 6) may leave partial content in database
- Multi-stage pipelines may enter inconsistent state
- Users see "generation stalled" errors requiring manual intervention

**Recommended Fix**:

```typescript
// Option 1: Emit event for graceful shutdown coordination
if (times >= 60) {
  logger.error(
    { attempts: times, totalTimeMinutes: '~20' },
    'Redis unavailable for extended period, initiating graceful shutdown'
  );

  // Emit shutdown event that workers can listen to
  process.emit('REDIS_UNAVAILABLE' as any);

  // Give workers 30s to finish, then force exit
  setTimeout(() => {
    logger.error('Forced exit after Redis unavailable timeout');
    process.exit(1);
  }, 30000);

  return null; // Stop retrying
}
```

**Alternative**: Create a module-level flag and check it in worker entrypoints:

```typescript
// redis.ts
let shutdownRequested = false;
export function isShutdownRequested() {
  return shutdownRequested;
}

if (times >= 60) {
  shutdownRequested = true;
  logger.error('Redis unavailable, requesting graceful shutdown');
  return null;
}

// worker-entrypoint.ts
import { isShutdownRequested } from '@/shared/cache/redis';

setInterval(() => {
  if (isShutdownRequested()) {
    logger.info('Redis shutdown requested, closing workers');
    gracefulShutdown(worker).then(() => process.exit(1));
  }
}, 5000);
```

**Context7 Validation**:
According to ioredis documentation, `retryStrategy` returning `null` stops reconnection attempts. The documentation does NOT recommend calling `process.exit()` from within `retryStrategy` - this is a custom pattern that bypasses standard Node.js shutdown mechanisms.

---

### 2. Timing Calculation Error: Not Actually ~20 Minutes

**Severity**: CRITICAL
**File**: `redis.ts:34-39`
**Category**: Logic Error / Incorrect Assumption

**Issue**:
The comment states "~20 minutes" but the actual time is approximately **30 minutes**, creating operational confusion and incorrect timeout expectations.

**Calculation**:

```typescript
// Exponential backoff: 100ms * 2^(times-1), capped at 30s
// Attempt 1:  100ms
// Attempt 2:  200ms
// Attempt 3:  400ms
// Attempt 4:  800ms
// Attempt 5:  1.6s
// Attempt 6:  3.2s
// Attempt 7:  6.4s
// Attempt 8:  12.8s
// Attempt 9:  25.6s
// Attempt 10: 51.2s → capped at 30s
// Attempts 10-60: all 30s delays

// Total time = sum(1-9) + 30s * 51 attempts
// = 0.1 + 0.2 + 0.4 + 0.8 + 1.6 + 3.2 + 6.4 + 12.8 + 25.6 + (30 * 51)
// = 51.1s + 1530s
// = 1581.1s
// = 26.35 minutes
```

**Actual Calculation** (with cap at 30s from attempt 10+):

- Attempts 1-9: ~51 seconds
- Attempts 10-60: 51 attempts × 30s = 1,530 seconds (25.5 minutes)
- **Total: ~26 minutes** (not 20 minutes)

**Impact**:

- Misleading documentation for operations team
- Monitoring alerts may use wrong thresholds
- Downstream logic may expect different timing

**Recommended Fix**:

```typescript
// After ~26 minutes of trying (60 attempts with exponential backoff to 30s max),
// exit process to let Docker restart us with a fresh state
if (times >= 60) {
  logger.error(
    {
      attempts: times,
      estimatedMinutes: 26,
      actualMinutesNote: '~26 min (exponential backoff: 100ms→30s)'
    },
    'Redis unavailable for extended period, exiting for container restart'
  );
```

---

### 3. Missing Reconnection State Tracking

**Severity**: CRITICAL
**File**: `redis.ts:25-47`
**Category**: Observability / Debugging

**Issue**:
There's no way to monitor reconnection health externally. The existing `isRedisConnected()` function only checks if status === 'ready', but doesn't expose:

- Current reconnection attempt count
- Time since first failure
- Whether shutdown is imminent

**Impact**:

- **Monitoring/alerting** cannot distinguish between "transient blip" and "about to exit"
- **Health checks** (`/health` endpoint) may report "healthy" while approaching forced exit
- **Operations team** has no visibility into reconnection state

**Recommended Fix**:

```typescript
// Module-level tracking
let reconnectionAttempts = 0;
let firstFailureTime: number | null = null;

export function getRedisHealth(): {
  connected: boolean;
  status: string;
  reconnectionAttempts: number;
  minutesSinceFirstFailure: number | null;
  shutdownImminent: boolean;
} {
  return {
    connected: isRedisConnected(),
    status: redisClient?.status || 'not-initialized',
    reconnectionAttempts,
    minutesSinceFirstFailure: firstFailureTime
      ? (Date.now() - firstFailureTime) / 60000
      : null,
    shutdownImminent: reconnectionAttempts >= 50, // Warning threshold
  };
}

retryStrategy(times) {
  reconnectionAttempts = times;
  if (times === 1) {
    firstFailureTime = Date.now();
  }

  const delay = Math.min(100 * Math.pow(2, times - 1), 30000);

  if (times % 10 === 0) {
    const minutesElapsed = firstFailureTime
      ? (Date.now() - firstFailureTime) / 60000
      : 0;
    logger.warn({
      attempts: times,
      nextDelayMs: delay,
      minutesElapsed: minutesElapsed.toFixed(1)
    }, 'Redis reconnecting...');
  }

  if (times >= 60) {
    logger.error(
      {
        attempts: times,
        minutesElapsed: firstFailureTime ? ((Date.now() - firstFailureTime) / 60000).toFixed(1) : 'unknown'
      },
      'Redis unavailable for extended period, exiting for container restart'
    );
    setImmediate(() => process.exit(1));
    return null;
  }

  return delay;
},

// Reset on successful connection
redisClient.on('connect', () => {
  reconnectionAttempts = 0;
  firstFailureTime = null;
  logger.info('Redis connected successfully');
});
```

---

## High Priority Issues (Should Fix)

### 4. DNS Error Handling May Not Work as Expected

**Severity**: HIGH
**File**: `redis.ts:48-56`
**Category**: Error Handling / Reliability

**Issue**:
The `reconnectOnError` function checks for DNS errors ('EAI_AGAIN', 'ENOTFOUND') by string matching on `err.message`, but:

1. **Error codes** should be checked via `err.code`, not `err.message`
2. **Message format** varies by Node.js version and error context
3. **Case sensitivity** may cause misses (e.g., "EAI_AGAIN" vs "eai_again")

**Current Code**:

```typescript
reconnectOnError(err) {
  const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'];
  if (targetErrors.some(e => err.message.includes(e))) {
    logger.warn({ error: err.message }, 'Redis reconnecting on error');
    return true;
  }
  return false;
}
```

**Why This May Fail**:

- `err.message` might be: `"getaddrinfo EAI_AGAIN redis.example.com"` (contains code)
- Or: `"DNS lookup failed"` (doesn't contain code)
- Or: `"Redis connection error: EAI_AGAIN"` (contains code)

**Context7 Best Practice**:
ioredis documentation examples only check for Redis-specific errors like "READONLY", not DNS errors. For DNS errors, the error object structure is:

```javascript
{
  code: 'EAI_AGAIN',
  errno: -3001,
  syscall: 'getaddrinfo',
  message: 'getaddrinfo EAI_AGAIN redis.example.com'
}
```

**Recommended Fix**:

```typescript
reconnectOnError(err) {
  // Check error code property first (for DNS/network errors)
  const errorCode = (err as NodeJS.ErrnoException).code;
  if (errorCode) {
    const networkErrors = ['EAI_AGAIN', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT'];
    if (networkErrors.includes(errorCode)) {
      logger.warn({ error: err.message, code: errorCode }, 'Redis reconnecting on network error');
      return true;
    }
  }

  // Fallback to message check for Redis-specific errors (READONLY has no code)
  const redisErrors = ['READONLY'];
  if (redisErrors.some(e => err.message.includes(e))) {
    logger.warn({ error: err.message }, 'Redis reconnecting on Redis error');
    return true;
  }

  return false;
}
```

---

### 5. enableOfflineQueue + process.exit() = Potential Job Loss

**Severity**: HIGH
**File**: `redis.ts:20, redis.ts:42`
**Category**: Data Integrity / BullMQ Compatibility

**Issue**:
The configuration uses `enableOfflineQueue: true`, which means Redis commands are queued in memory while disconnected. When `process.exit(1)` is called:

1. **Queued commands are lost** (never sent to Redis when it reconnects)
2. **BullMQ job state updates** (progress, completion) may be in the queue
3. **No warning/error** is logged about discarded queue

**Current Code**:

```typescript
redisClient = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableOfflineQueue: true, // Always enable for resilience - allows commands to queue while reconnecting
  lazyConnect: true,
  // ... later ...
  setImmediate(() => process.exit(1)); // Queue is discarded here
```

**Context7 Validation**:
According to ioredis docs:

> When `enableOfflineQueue` is `true`, commands will be added to a queue and flushed once the connection is established. Setting to `false` will reject commands immediately with an error.

**Impact**:

- BullMQ job marked as "completed" but state not written to Redis
- Job appears "active" in Redis but worker has exited
- Job gets marked as "stalled" after timeout, causing retry

**Recommended Fix**:

Option 1: Disable offline queue when approaching exit:

```typescript
let offlineQueueEnabled = true;

retryStrategy(times) {
  // ... existing backoff logic ...

  if (times >= 50) {
    // Approaching exit threshold, stop queuing commands
    if (offlineQueueEnabled) {
      logger.warn('Redis connection unstable, disabling offline queue');
      offlineQueueEnabled = false;
      // Note: Can't change enableOfflineQueue at runtime, but can track state
    }
  }

  if (times >= 60) {
    const queueLength = (redisClient as any).offlineQueue?.length || 0;
    if (queueLength > 0) {
      logger.error(
        { queuedCommands: queueLength },
        'WARNING: Exiting with queued Redis commands - potential data loss!'
      );
    }
    logger.error('Redis unavailable for extended period, exiting for container restart');
    setImmediate(() => process.exit(1));
    return null;
  }

  return delay;
}
```

Option 2: Flush queue before exit:

```typescript
if (times >= 60) {
  logger.error('Redis unavailable, attempting queue flush before exit');

  // Try one last time to connect and flush queue
  setImmediate(async () => {
    try {
      await redisClient.connect();
      await new Promise(resolve => setTimeout(resolve, 5000)); // Give queue time to flush
    } catch (e) {
      logger.error('Failed to flush Redis queue');
    }
    process.exit(1);
  });

  return null;
}
```

**Recommended**: Use Option 1 with additional monitoring/alerting for queue size.

---

### 6. No Graceful Handling of Docker "Stopping" State

**Severity**: HIGH
**File**: `redis.ts` (missing logic)
**Category**: Production / Docker Integration

**Issue**:
When Docker sends `SIGTERM` to stop the container, the retry loop continues trying to reconnect. This creates a race condition:

- Worker receives `SIGTERM` → starts graceful shutdown
- Redis client still in retry loop → may attempt 30s delays
- Docker `stop_grace_period` (typically 10s) expires → `SIGKILL` sent
- Process killed before graceful shutdown completes

**Current Behavior**:

1. Redis loses connection
2. `retryStrategy` starts exponential backoff (up to 30s delays)
3. Docker sends `SIGTERM`
4. Worker's `gracefulShutdown()` handler tries to close worker
5. Redis client still waiting for next retry (may be in 30s sleep)
6. Docker timeout → `SIGKILL` → incomplete shutdown

**Impact**:

- Jobs marked as "stalled" unnecessarily
- Locks not released
- Logs show "forced shutdown" instead of clean exit

**Recommended Fix**:

```typescript
// Track shutdown state
let isShuttingDown = false;

// Add SIGTERM/SIGINT handlers in redis.ts
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, will stop Redis reconnection attempts');
  isShuttingDown = true;
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, will stop Redis reconnection attempts');
  isShuttingDown = true;
});

retryStrategy(times) {
  // Stop retrying if graceful shutdown is in progress
  if (isShuttingDown) {
    logger.info('Shutdown in progress, stopping Redis reconnection');
    return null;
  }

  // ... existing backoff logic ...
}
```

**Docker Best Practice**:
Ensure `docker-compose.yml` has appropriate `stop_grace_period`:

```yaml
services:
  orchestrator:
    stop_grace_period: 45s # Allow time for 30s retry + shutdown
```

---

### 7. Logging: Missing Critical Context in Error Events

**Severity**: HIGH
**File**: `redis.ts:59-77`
**Category**: Observability / Debugging

**Issue**:
The event listeners log errors but don't include critical context that would help diagnose production issues:

- **No connection URL** (which Redis instance failed?)
- **No attempt count** (is this first failure or 50th?)
- **No timestamp** (when did issue start?)
- **No correlation ID** (which worker/job was affected?)

**Current Code**:

```typescript
redisClient.on('error', err => {
  logger.error({ err: err }, 'Redis connection error');
});

redisClient.on('reconnecting', (delay: number) => {
  logger.warn(`Redis reconnecting in ${delay}ms`);
});
```

**Impact**:
When investigating production incidents, logs lack context to answer:

- "Which Redis instance is failing?"
- "How long has this been happening?"
- "Is this affecting all workers or just one?"

**Recommended Fix**:

```typescript
// Sanitize Redis URL for logging (hide credentials)
function sanitizeRedisUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return 'invalid-url';
  }
}

const redisUrlSanitized = sanitizeRedisUrl(redisUrl);

redisClient.on('error', err => {
  logger.error(
    {
      err: err,
      redisUrl: redisUrlSanitized,
      reconnectionAttempts,
      minutesSinceFirstFailure: firstFailureTime
        ? ((Date.now() - firstFailureTime) / 60000).toFixed(2)
        : null,
      clientStatus: redisClient.status,
    },
    'Redis connection error'
  );
});

redisClient.on('reconnecting', (delay: number) => {
  logger.warn(
    {
      delayMs: delay,
      redisUrl: redisUrlSanitized,
      reconnectionAttempts,
    },
    'Redis reconnecting...'
  );
});

redisClient.on('end', () => {
  logger.error(
    {
      redisUrl: redisUrlSanitized,
      finalReconnectionAttempts: reconnectionAttempts,
      totalMinutesDown: firstFailureTime
        ? ((Date.now() - firstFailureTime) / 60000).toFixed(2)
        : null,
    },
    'Redis connection ended, no more reconnections'
  );
});
```

---

## Medium Priority Issues

### 8. Function Documentation Gaps

**Severity**: MEDIUM
**File**: `redis.ts:25-56`
**Category**: Code Quality / Maintainability

**Issue**:
The `retryStrategy` and `reconnectOnError` functions have inline comments but lack:

- **JSDoc headers** explaining parameters and return values
- **Examples** of when each function triggers
- **References** to ioredis documentation
- **Links** to related configuration (maxRetriesPerRequest, enableOfflineQueue)

**Impact**:

- Future maintainers may not understand subtle interactions
- New team members need to read ioredis docs separately
- Easy to introduce bugs when modifying

**Recommended Fix**:

```typescript
/**
 * Custom retry strategy for Redis connection failures.
 *
 * Implements exponential backoff (100ms → 30s max) with circuit breaker:
 * - Returns delay (ms) to wait before next retry attempt
 * - Returns null to stop retrying (triggers circuit breaker)
 *
 * @param times - Retry attempt number (1-indexed)
 * @returns Delay in milliseconds, or null to stop retrying
 *
 * @see https://github.com/redis/ioredis#auto-reconnect
 * @see maxRetriesPerRequest - Controls per-command retry behavior
 * @see enableOfflineQueue - Commands queue while reconnecting
 *
 * Circuit Breaker:
 * - After 60 attempts (~26 min), calls process.exit(1)
 * - Relies on Docker restart policy (restart: unless-stopped)
 *
 * @example
 * // Attempt 1: wait 100ms
 * // Attempt 5: wait 1.6s
 * // Attempt 10+: wait 30s (capped)
 * // Attempt 60: exit process
 */
retryStrategy(times) {
  // ...
}

/**
 * Determines if Redis should reconnect after specific errors.
 *
 * Called when a Redis command fails with an error. Returns:
 * - true (or 1): Reconnect to Redis
 * - 2: Reconnect and resend the failed command
 * - false (or 0): Don't reconnect, propagate error
 *
 * @param err - Error object from failed Redis command
 * @returns true to reconnect, false to propagate error
 *
 * @see https://github.com/redis/ioredis#reconnect-on-error
 *
 * Handled Errors:
 * - READONLY: Redis is read-only (e.g., replica during failover)
 * - ECONNRESET: Connection reset by peer
 * - ETIMEDOUT: Connection timed out
 * - EAI_AGAIN: DNS temporary failure (transient)
 * - ENOTFOUND: DNS permanent failure (hostname invalid)
 *
 * Note: This is separate from retryStrategy. This handles errors
 * on established connections; retryStrategy handles connection failures.
 *
 * @example
 * // AWS ElastiCache failover: READONLY error → reconnect to new primary
 * // DNS intermittent issue: EAI_AGAIN → retry lookup
 */
reconnectOnError(err) {
  // ...
}
```

---

### 9. No Unit Tests for Retry Logic

**Severity**: MEDIUM
**File**: `redis.ts` (missing test file)
**Category**: Testing / Quality Assurance

**Issue**:
There are no unit tests for:

- Exponential backoff calculation
- Circuit breaker threshold (60 attempts)
- DNS error detection in `reconnectOnError`
- Edge cases (times=0, times=negative, etc.)

**Impact**:

- Changes to retry logic may introduce subtle bugs
- Hard to verify timing calculations (is it really ~26 min?)
- Regression risk when refactoring

**Recommended Fix**:

Create `packages/course-gen-platform/tests/unit/shared/cache/redis.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Redis retryStrategy', () => {
  it('should calculate exponential backoff correctly', () => {
    const delays = [1, 2, 3, 4, 5, 10, 20, 50].map(times =>
      Math.min(100 * Math.pow(2, times - 1), 30000)
    );

    expect(delays[0]).toBe(100); // 100ms
    expect(delays[1]).toBe(200); // 200ms
    expect(delays[4]).toBe(1600); // 1.6s
    expect(delays[7]).toBe(30000); // capped at 30s
  });

  it('should exit process after 60 attempts', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // Simulate retryStrategy call with times=60
    // (Need to refactor to make testable)

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should calculate total retry time as ~26 minutes', () => {
    let totalMs = 0;
    for (let times = 1; times <= 60; times++) {
      const delay = Math.min(100 * Math.pow(2, times - 1), 30000);
      totalMs += delay;
    }

    const totalMinutes = totalMs / 60000;
    expect(totalMinutes).toBeGreaterThan(25);
    expect(totalMinutes).toBeLessThan(27);
  });
});

describe('Redis reconnectOnError', () => {
  it('should reconnect on DNS errors', () => {
    const errors = [
      { message: 'getaddrinfo EAI_AGAIN redis.local', code: 'EAI_AGAIN' },
      { message: 'getaddrinfo ENOTFOUND redis.local', code: 'ENOTFOUND' },
    ];

    // Test reconnectOnError logic
    // (Need to export for testing)
  });

  it('should reconnect on network errors', () => {
    const errors = [
      { message: 'Connection reset by peer', code: 'ECONNRESET' },
      { message: 'Connection timed out', code: 'ETIMEDOUT' },
    ];

    // Test reconnectOnError logic
  });

  it('should reconnect on READONLY error', () => {
    const error = { message: "READONLY You can't write against a read only replica." };

    // Test reconnectOnError logic
  });

  it('should NOT reconnect on authentication errors', () => {
    const error = { message: 'ERR invalid password' };

    // Test reconnectOnError logic
    // expect(reconnectOnError(error)).toBe(false);
  });
});
```

**Note**: Current code structure makes testing difficult because functions are inline. Consider refactoring:

```typescript
export function calculateRetryDelay(times: number): number | null {
  if (times >= 60) return null;
  return Math.min(100 * Math.pow(2, times - 1), 30000);
}

export function shouldReconnectOnError(err: Error): boolean {
  // ... logic ...
}

// Then use in Redis config
retryStrategy: (times) => {
  const delay = calculateRetryDelay(times);
  if (delay === null) {
    logger.error('Redis unavailable, exiting');
    setImmediate(() => process.exit(1));
  }
  return delay;
},
reconnectOnError: shouldReconnectOnError,
```

---

## Low Priority Issues

### 10. Magic Number: 60 Should Be Constant

**Severity**: LOW
**File**: `redis.ts:36`
**Category**: Code Style / Configuration

**Issue**:
The circuit breaker threshold (60 attempts) is hardcoded. Should be a named constant for:

- Easier tuning
- Better readability
- Consistent reference if used elsewhere

**Recommended Fix**:

```typescript
const REDIS_MAX_RECONNECT_ATTEMPTS = 60; // ~26 minutes with exponential backoff
const REDIS_BACKOFF_BASE_MS = 100;
const REDIS_BACKOFF_MAX_MS = 30000;

retryStrategy(times) {
  const delay = Math.min(
    REDIS_BACKOFF_BASE_MS * Math.pow(2, times - 1),
    REDIS_BACKOFF_MAX_MS
  );

  if (times % 10 === 0) {
    logger.warn({ attempts: times, nextDelayMs: delay }, 'Redis reconnecting...');
  }

  if (times >= REDIS_MAX_RECONNECT_ATTEMPTS) {
    logger.error(
      {
        attempts: times,
        thresholdMinutes: Math.ceil(calculateTotalRetryTime(REDIS_MAX_RECONNECT_ATTEMPTS) / 60000)
      },
      'Redis unavailable for extended period, exiting for container restart'
    );
    setImmediate(() => process.exit(1));
    return null;
  }

  return delay;
}

// Helper to calculate total time for documentation
function calculateTotalRetryTime(maxAttempts: number): number {
  let totalMs = 0;
  for (let i = 1; i <= maxAttempts; i++) {
    totalMs += Math.min(REDIS_BACKOFF_BASE_MS * Math.pow(2, i - 1), REDIS_BACKOFF_MAX_MS);
  }
  return totalMs;
}
```

---

### 11. Consider Environment-Specific Timeouts

**Severity**: LOW
**File**: `redis.ts:36`
**Category**: Configuration / Production Flexibility

**Issue**:
The 60-attempt threshold is hardcoded. Different environments may want different thresholds:

- **Development**: Shorter timeout (fail fast, restart quickly)
- **Staging**: Medium timeout (match production, but faster iteration)
- **Production**: Longer timeout (avoid unnecessary restarts during maintenance)

**Recommended Fix**:

```typescript
const REDIS_MAX_RECONNECT_ATTEMPTS = parseInt(process.env.REDIS_MAX_RECONNECT_ATTEMPTS || '60', 10);

if (isNaN(REDIS_MAX_RECONNECT_ATTEMPTS) || REDIS_MAX_RECONNECT_ATTEMPTS < 1) {
  throw new Error('REDIS_MAX_RECONNECT_ATTEMPTS must be a positive integer');
}

logger.info({ maxAttempts: REDIS_MAX_RECONNECT_ATTEMPTS }, 'Redis retry strategy initialized');
```

**Environment Examples**:

```bash
# Development
REDIS_MAX_RECONNECT_ATTEMPTS=20  # ~5 minutes

# Staging
REDIS_MAX_RECONNECT_ATTEMPTS=40  # ~15 minutes

# Production
REDIS_MAX_RECONNECT_ATTEMPTS=60  # ~26 minutes
```

---

### 12. Logging Frequency Could Be Dynamic

**Severity**: LOW
**File**: `redis.ts:30-32`
**Category**: Performance / Observability

**Issue**:
Logging every 10 attempts is hardcoded. When approaching the threshold, more frequent logging would help diagnose issues:

- Attempts 1-40: Log every 10 attempts (less spam)
- Attempts 41-60: Log every attempt (imminent exit, need details)

**Recommended Fix**:

```typescript
if (times % 10 === 0 || times >= REDIS_MAX_RECONNECT_ATTEMPTS - 10) {
  const urgency = times >= REDIS_MAX_RECONNECT_ATTEMPTS - 10 ? 'URGENT' : 'info';
  logger.warn(
    {
      attempts: times,
      nextDelayMs: delay,
      urgency,
      remainingAttempts: REDIS_MAX_RECONNECT_ATTEMPTS - times,
    },
    'Redis reconnecting...'
  );
}
```

---

## Best Practices Validation (Context7)

### ioredis Pattern Compliance

**Library**: ioredis v5.4.0
**Context7 Status**: ✅ Available
**Documentation Source**: https://github.com/redis/ioredis

#### Pattern: Exponential Backoff in retryStrategy

**Status**: ✅ **Correct Implementation**

The implementation correctly uses exponential backoff with a cap:

```typescript
const delay = Math.min(100 * Math.pow(2, times - 1), 30000);
```

This matches the recommended pattern from Context7:

```javascript
retryStrategy(times) {
  const delay = Math.min(times * 50, 2000);
  return delay;
}
```

**Difference**: This implementation uses exponential growth (2^n) instead of linear (n\*50), which is **more aggressive** but appropriate for production resilience.

#### Pattern: maxRetriesPerRequest: null for BullMQ

**Status**: ✅ **Correct Implementation**

```typescript
maxRetriesPerRequest: null, // Required for BullMQ
```

Context7 confirms this is correct for BullMQ:

> Setting this to `null` allows commands to wait indefinitely for the connection to be restored.

**Why**: BullMQ jobs have their own retry logic at the job level, so individual Redis commands should wait for reconnection rather than failing immediately.

#### Pattern: enableOfflineQueue

**Status**: ⚠️ **Correct but Risky with process.exit()**

```typescript
enableOfflineQueue: true, // Always enable for resilience
```

Context7 notes:

> When `enableOfflineQueue` is `true`, commands will be added to a queue and flushed once the connection is established.

**Issue**: Commands queued during reconnection attempts will be **lost** when `process.exit(1)` is called. This creates a data loss risk (see Critical Issue #5).

#### Pattern: reconnectOnError

**Status**: ⚠️ **Partially Correct**

Context7 examples only show checking for Redis-specific errors like "READONLY":

```javascript
reconnectOnError(err) {
  const targetError = "READONLY";
  if (err.message.includes(targetError)) {
    return true;
  }
  return false;
}
```

This implementation extends to DNS/network errors, which is reasonable but:

- Should check `err.code` instead of `err.message` for DNS errors
- DNS errors (ENOTFOUND) might be permanent, not transient

#### Anti-Pattern: process.exit() in retryStrategy

**Status**: ❌ **Not Recommended by ioredis**

ioredis documentation shows returning `null` to stop retrying:

```javascript
retryStrategy(times) {
  return null; // Stop retrying
}
```

But does **not** recommend calling `process.exit()` from within the callback. This bypasses:

- Node.js shutdown hooks
- Graceful termination
- Resource cleanup

**Alternative Pattern**: Let the connection fail naturally, then handle at application level:

```javascript
redisClient.on('end', () => {
  logger.error('Redis connection ended permanently');
  gracefulShutdown().then(() => process.exit(1));
});
```

---

## BullMQ Integration Analysis

### Job Safety Assessment

**Context**: This Redis client is used by BullMQ workers (Stage 6, Stage 7, Orchestrator)

#### Scenario 1: Redis Disconnects During Job Processing

**Current Behavior**:

1. Job starts processing (e.g., generating lesson content)
2. Redis connection lost
3. Commands queue in `enableOfflineQueue`
4. Worker continues processing (unaware of connection loss)
5. Job completes, calls `job.progress()` or `job.complete()` → queued
6. If Redis reconnects within 60 attempts: commands flush → ✅ Success
7. If not reconnected after 60 attempts: `process.exit(1)` → ❌ Commands lost

**Risk**: Job marked as "stalled" by BullMQ, retried from scratch

#### Scenario 2: Redis Disconnects at Startup

**Current Behavior**:

1. Worker starts, calls `getRedisClient()`
2. Redis unavailable
3. `lazyConnect: true` → client created but not connected
4. Worker tries to create Queue/Worker → hangs or times out
5. `retryStrategy` keeps trying in background

**Risk**: Worker appears "started" but isn't actually processing jobs

**Recommended**: Check Redis connectivity in worker startup:

```typescript
// worker-entrypoint.ts
const redisHealthy = await ensureRedisConnection(10000);
if (!redisHealthy) {
  logger.error('Redis unavailable at startup, exiting');
  process.exit(1);
}
```

#### Scenario 3: Redis Reconnects After Job Stalls

**Current Behavior**:

1. Redis down for 10 minutes
2. Job marked "stalled" (default: 30s stalled check interval)
3. BullMQ moves job to "failed" or "waiting" for retry
4. Redis reconnects
5. Worker picks up job again (if auto-retry enabled)

**Risk**: Job runs twice if not idempotent

**Recommendation**: Ensure all BullMQ jobs are idempotent (check for existing results before regenerating)

---

## Docker Integration Analysis

### Container Restart Behavior

**Current Setup** (from code review):

```yaml
restart: unless-stopped
```

**Process Flow**:

1. Redis unavailable for ~26 minutes
2. `process.exit(1)` called
3. Docker detects exit code 1 (failure)
4. Docker restarts container (per `restart: unless-stopped`)
5. Container starts fresh, reconnects to Redis

**Risks**:

- **Restart loop**: If Redis never comes back, container restarts every 26 minutes forever
- **Resource churn**: Repeated starts/stops consume resources
- **No alerting**: Docker just keeps restarting silently

**Recommended**:

1. Add restart backoff policy (Docker Compose v3+):

   ```yaml
   restart: on-failure:5 # Retry max 5 times, then stop
   ```

2. Or use health checks to prevent restart loop:

   ```yaml
   healthcheck:
     test:
       [
         'CMD',
         'node',
         '-e',
         "require('./dist/shared/cache/redis').isRedisConnected() || process.exit(1)",
       ]
     interval: 30s
     timeout: 10s
     retries: 3
     start_period: 60s
   ```

3. Add monitoring alert for repeated exits:
   ```bash
   # Grafana alert: "Container restart count > 3 in 1 hour"
   ```

---

## Security Assessment

### Credentials in Logs

**Status**: ✅ **No Issues Found**

Redis URL is read from environment variable:

```typescript
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
```

Logs don't print the URL, so credentials (if included in URL) are not exposed.

**Recommendation**: Add sanitization for future log messages (see Issue #7).

### Resource Exhaustion

**Status**: ⚠️ **Potential Issue**

**Issue**: `enableOfflineQueue: true` with no size limit means memory can grow unbounded if:

1. Redis down for 20+ minutes
2. Application continues sending commands
3. Offline queue grows until OOM

**Impact**: Node.js heap exhaustion → process crash

**Recommended**: Monitor offline queue size:

```typescript
setInterval(() => {
  const queueLength = (redisClient as any).offlineQueue?.length || 0;
  if (queueLength > 1000) {
    logger.warn({ queueLength }, 'Redis offline queue growing large');
  }
}, 10000);
```

---

## Performance Assessment

### Connection Pool

**Status**: ✅ **Not Applicable**

ioredis uses a single connection per instance by default. For BullMQ:

- Each Queue/Worker creates its own Redis connection
- Connection pooling happens at the BullMQ level
- This shared client is for app-level caching only

**No performance issues** identified.

### Backoff Timing

**Status**: ✅ **Reasonable**

Exponential backoff (100ms → 30s) is appropriate for:

- Transient network issues (quick recovery)
- Planned maintenance (wait out downtime)
- Permanent failures (stop before timeout)

**Alternative**: Could use `Jittered Exponential Backoff` to avoid thundering herd:

```typescript
const jitter = Math.random() * 1000; // 0-1s jitter
const delay = Math.min(100 * Math.pow(2, times - 1), 30000) + jitter;
```

But not critical for this use case (single client, not thousands of workers).

---

## Recommendations Summary

### Critical Actions (Must Do Before Production)

1. **Fix process.exit() race condition** (Issue #1)
   - Implement graceful shutdown coordination with workers
   - Give in-flight jobs time to complete
   - Estimated effort: 2-3 hours

2. **Fix timing calculation comment** (Issue #2)
   - Update "~20 minutes" to "~26 minutes"
   - Add actual calculation to comment
   - Estimated effort: 5 minutes

3. **Add reconnection state tracking** (Issue #3)
   - Export `getRedisHealth()` function
   - Integrate with `/health` endpoint
   - Add monitoring alerts
   - Estimated effort: 1 hour

### High Priority Actions (Should Do Before Production)

4. **Fix DNS error detection** (Issue #4)
   - Check `err.code` instead of `err.message`
   - Test with actual DNS failures
   - Estimated effort: 30 minutes

5. **Add offline queue monitoring** (Issue #5)
   - Log queue size before exit
   - Alert on large queue sizes
   - Estimated effort: 30 minutes

6. **Handle SIGTERM gracefully** (Issue #6)
   - Stop retry loop on shutdown signal
   - Coordinate with Docker stop_grace_period
   - Estimated effort: 1 hour

7. **Improve logging context** (Issue #7)
   - Add sanitized URL, attempt count, timestamps
   - Estimated effort: 30 minutes

### Medium Priority (Post-Launch)

8. Add JSDoc documentation (Issue #8) - 1 hour
9. Write unit tests (Issue #9) - 2-3 hours

### Low Priority (Nice to Have)

10. Extract magic numbers to constants (Issue #10) - 15 minutes
11. Make timeout configurable (Issue #11) - 30 minutes
12. Dynamic logging frequency (Issue #12) - 15 minutes

---

## Testing Recommendations

### Manual Testing

**Test Case 1: Redis Disconnect During Job**

1. Start worker with job in progress
2. Stop Redis: `docker-compose stop redis`
3. Verify job continues (offline queue)
4. Restart Redis: `docker-compose start redis`
5. Verify job completes successfully

**Test Case 2: Extended Outage**

1. Start worker
2. Stop Redis
3. Wait 30 minutes
4. Verify process exits with code 1
5. Verify Docker restarts container
6. Verify container reconnects after restart

**Test Case 3: DNS Failures**

1. Configure Redis URL with invalid hostname
2. Start worker
3. Verify `reconnectOnError` triggers
4. Verify EAI_AGAIN errors are handled
5. Monitor logs for 30 minutes

### Automated Testing

**Integration Test**:

```typescript
describe('Redis connection resilience', () => {
  it('should survive Redis restart', async () => {
    const cache = new RedisCache();
    await cache.set('test', 'value');

    // Simulate Redis restart
    await closeRedisClient();
    await new Promise(resolve => setTimeout(resolve, 2000));
    await ensureRedisConnection();

    const value = await cache.get('test');
    expect(value).toBe('value');
  });

  it('should handle offline queue correctly', async () => {
    const cache = new RedisCache();

    // Disconnect Redis
    await closeRedisClient();

    // Queue commands
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');

    // Reconnect and verify flush
    await ensureRedisConnection();
    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(await cache.get('key1')).toBe('value1');
    expect(await cache.get('key2')).toBe('value2');
  });
});
```

---

## Comparison with Previous Version

### What Changed (Commit 22111bb)

**Before** (commit a12150b):

```typescript
retryStrategy(times) {
  // Never return null - keep trying forever
  const delay = Math.min(100 * Math.pow(2, times - 1), 30000);
  if (times % 10 === 0) {
    logger.warn({ attempts: times, nextDelayMs: delay }, 'Redis reconnecting...');
  }
  return delay; // Always retry
}
```

**After** (commit 22111bb):

```typescript
retryStrategy(times) {
  const delay = Math.min(100 * Math.pow(2, times - 1), 30000);
  if (times % 10 === 0) {
    logger.warn({ attempts: times, nextDelayMs: delay }, 'Redis reconnecting...');
  }

  // NEW: Circuit breaker
  if (times >= 60) {
    logger.error(
      { attempts: times, totalTimeMinutes: '~20' },
      'Redis unavailable for extended period, exiting for container restart'
    );
    setImmediate(() => process.exit(1));
    return null;
  }

  return delay;
}

// NEW: Also added DNS errors to reconnectOnError
reconnectOnError(err) {
  const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'];
  // Previously: ['READONLY', 'ECONNRESET', 'ETIMEDOUT']
  // ...
}
```

### Assessment of Change

**Motivation**: Previous behavior ("retry forever") could leave workers in zombie state during extended Redis outages.

**Pros of New Approach**:

- ✅ Prevents infinite retry loops
- ✅ Relies on Docker restart for fresh state
- ✅ Handles DNS failures explicitly

**Cons of New Approach**:

- ❌ Can lose in-flight BullMQ jobs (see Issue #1)
- ❌ No coordination with graceful shutdown (see Issue #6)
- ❌ Timing calculation error (see Issue #2)

**Overall**: Good intent, but implementation needs refinement for production safety.

---

## Metrics & Monitoring

### Recommended Metrics

**Application Metrics** (expose via `/metrics` endpoint):

```typescript
redis_connection_state{status="connected|disconnected|reconnecting"} 1
redis_reconnection_attempts{} <count>
redis_minutes_since_first_failure{} <minutes>
redis_offline_queue_length{} <count>
redis_commands_sent{operation="get|set|del"} <count>
redis_commands_failed{operation="get|set|del"} <count>
```

**Grafana Alerts**:

```yaml
- alert: RedisReconnecting
  expr: redis_reconnection_attempts > 10
  for: 5m
  annotations:
    summary: 'Redis connection unstable ({{ $value }} reconnect attempts)'

- alert: RedisShutdownImminent
  expr: redis_reconnection_attempts > 50
  for: 1m
  annotations:
    summary: 'Redis unavailable, worker will exit in ~5 minutes'

- alert: RedisOfflineQueueLarge
  expr: redis_offline_queue_length > 1000
  for: 2m
  annotations:
    summary: 'Redis offline queue growing ({{ $value }} commands queued)'
```

---

## Edge Cases

### Edge Case 1: Redis Restarts Exactly at Attempt 60

**Scenario**:

1. Worker at attempt 59, waiting 30s
2. Redis comes back online
3. Worker reconnects successfully
4. Next command triggers attempt 60 logic → process.exit()

**Impact**: Worker exits even though Redis is healthy

**Fix**: Reset attempt counter on successful connection:

```typescript
redisClient.on('connect', () => {
  reconnectionAttempts = 0;
  firstFailureTime = null;
  logger.info('Redis connected successfully');
});
```

### Edge Case 2: Multiple Redis Clients

**Scenario**: BullMQ creates its own Redis connections, separate from shared `getRedisClient()`

**Impact**:

- Shared client exits at 60 attempts
- BullMQ clients still trying to reconnect
- Worker process exits, orphaning BullMQ connections

**Fix**: Already handled by Docker restart (all connections reset)

### Edge Case 3: Redis Network Partition

**Scenario**: Redis is reachable but slow (network latency 5s+)

**Current Behavior**:

- `connectTimeout: 10000` → connection fails after 10s
- Triggers `retryStrategy`
- Eventually exits after 60 attempts

**Issue**: Slow Redis != unavailable Redis. Jobs could complete, just slowly.

**Recommended**:

- Add `commandTimeout` to detect slow commands:
  ```typescript
  commandTimeout: 5000, // Fail commands after 5s
  ```
- Monitor command latency separately from connection health

---

## Conclusion

The Redis retry strategy implementation demonstrates good understanding of production resilience patterns (exponential backoff, circuit breaker, DNS error handling). However, there are **3 critical issues** that must be addressed before production deployment:

1. **Race condition with process.exit()** - Can lose BullMQ jobs
2. **Incorrect timing calculation** - Says 20 min, actually 26 min
3. **Missing health monitoring** - No visibility into reconnection state

Additionally, **4 high-priority issues** should be fixed for production safety (DNS error detection, offline queue monitoring, SIGTERM handling, logging improvements).

The code follows ioredis best practices for the most part, but the `process.exit()` pattern is non-standard and requires careful integration with BullMQ workers' graceful shutdown logic.

### Next Steps

1. **Immediate** (before next deploy):
   - Fix timing comment (Issue #2) - 5 minutes
   - Add SIGTERM handling (Issue #6) - 1 hour

2. **Before production** (within 1 week):
   - Implement graceful shutdown coordination (Issue #1) - 2-3 hours
   - Add reconnection health monitoring (Issue #3) - 1 hour
   - Fix DNS error detection (Issue #4) - 30 minutes
   - Add offline queue monitoring (Issue #5) - 30 minutes
   - Improve logging (Issue #7) - 30 minutes

3. **Post-launch** (technical debt):
   - Add documentation (Issue #8) - 1 hour
   - Write unit tests (Issue #9) - 2-3 hours
   - Extract constants and make configurable (Issues #10, #11) - 1 hour

**Total Estimated Effort**: 8-10 hours for production readiness

---

## References

- **ioredis Documentation**: https://github.com/redis/ioredis
- **Context7 ioredis Reference**: /redis/ioredis
- **BullMQ Connection Options**: https://docs.bullmq.io/guide/connections
- **Docker Restart Policies**: https://docs.docker.com/config/containers/start-containers-automatically/
- **Node.js Process Signals**: https://nodejs.org/api/process.html#signal-events

---

**Review Complete**
For questions or clarifications, reference the specific issue numbers above.
