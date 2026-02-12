# Plan: Distributed Redis-Based Jina API Rate Limiter

**Beads task**: mc2-kffx
**Status**: Ready for implementation

## Context

Jina API limits: **100 RPM** and **2 concurrent requests** per API key. Current limiters (`RateLimiter` and `ConcurrencyLimiter` in `jina-client.ts`) are in-process singletons, but BullMQ's `useWorkerThreads: true` creates separate V8 isolates per thread. With concurrency=5, each thread gets its own limiter instance, allowing up to 5x2=10 concurrent requests (violating the 2-request limit). Additionally, dev and staging servers share the same API key.

## Solution

Replace in-process singletons with Redis-backed distributed limiters using Lua scripts for atomic operations. Keep existing `waitForSlot()` / `acquire()` / `release()` interfaces for full backward compatibility.

## Files to Create

| File                                                             | Purpose                                            |
| ---------------------------------------------------------------- | -------------------------------------------------- |
| `src/shared/jina/distributed-rate-limiter.ts`                    | `DistributedRateLimiter` - ZSET sliding window RPM |
| `src/shared/jina/distributed-concurrency-limiter.ts`             | `DistributedConcurrencyLimiter` - ZSET semaphore   |
| `tests/unit/shared/jina/distributed-rate-limiter.test.ts`        | Unit tests                                         |
| `tests/unit/shared/jina/distributed-concurrency-limiter.test.ts` | Unit tests                                         |

## Files to Modify

| File                                    | Change                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `src/shared/embeddings/jina-client.ts`  | Replace singleton exports with distributed versions                    |
| `src/shared/embeddings/generate.ts:530` | Remove double `rateLimiter.waitForSlot()` before `makeJinaV3Request()` |

## Step-by-Step

### Step 1: Create `distributed-rate-limiter.ts`

Redis key: `jina:rpm:{api_key_hash_8chars}` (ZSET, sliding window)

Lua script (`redis.eval()` pattern from `generation-lock.ts:223`):

1. `ZREMRANGEBYSCORE` - remove entries outside 60s window
2. `ZCARD` - count current requests
3. If count >= 100, return `[0, count, wait_ms]`
4. `ZADD` with `{timestamp}-{uuid}` member
5. `PEXPIRE` 70s for auto-cleanup
6. Return `[1, count+1, 0]`

**Use Redis server time** (`redis.call('TIME')`) inside Lua to avoid clock skew between servers.

Class `DistributedRateLimiter`:

- `waitForSlot()`: Try Lua script. If rate limited, poll every max(waitMs, 500ms). Max 60s total wait, then fail-open.
- Fallback: If `isRedisConnected() === false` or Redis error, use in-process `lastRequestTime` logic (current behavior).
- Reuse: `getRedisClient()` from `shared/cache/redis.ts`, `isRedisConnected()` from same file.

### Step 2: Create `distributed-concurrency-limiter.ts`

Redis key: `jina:sem:{api_key_hash_8chars}` (ZSET, semaphore)

ZSET score = expiration timestamp (ms). Lua scripts:

**Acquire**:

1. `ZREMRANGEBYSCORE 0 {now}` - remove expired slots (crashed processes)
2. `ZCARD` - count active slots
3. If count >= 2, return `[0, count]`
4. `ZADD {expires_at} {slot_uuid}` - add slot
5. Return `[1, count+1]`

**Release**: `ZREM {slot_uuid}` - fire-and-forget

**Extend** (heartbeat): `ZSCORE` check + `ZADD` update expiration

Class `DistributedConcurrencyLimiter`:

- `acquire()`: Try Lua. If full, poll 200-500ms (jitter). Max 2min, then fail-open.
- `release()`: Fire-and-forget Lua release + stop heartbeat
- Heartbeat: `setInterval(10s)` extends slot TTL to prevent expiration during long API calls (Jina timeout is 60s)
- Slot TTL: 30s. Heartbeat every 10s. Crashed process slots reclaimed in max 30s.
- `getStats()` / `reset()`: Same interface as `ConcurrencyLimiterStats`.
- Fallback: In-process semaphore (current behavior).

### Step 3: Modify `jina-client.ts` singleton exports

```typescript
// Replace:
export const jinaRateLimiter = new RateLimiter(600);
export const jinaConcurrencyLimiter = new ConcurrencyLimiter(2);

// With:
import { DistributedRateLimiter } from '../jina/distributed-rate-limiter';
import { DistributedConcurrencyLimiter } from '../jina/distributed-concurrency-limiter';

export const jinaRateLimiter = new DistributedRateLimiter();
export const jinaConcurrencyLimiter = new DistributedConcurrencyLimiter();
```

Keep original `RateLimiter` and `ConcurrencyLimiter` classes in file (not exported as singletons). Consumers (`reranker-client.ts`, `generate.ts`) need zero changes.

### Step 4: Fix double-waitForSlot bug in `generate.ts:530`

`generateQueryEmbedding()` calls `rateLimiter.waitForSlot()` at line 530, then `makeJinaV3Request()` which calls it again internally at line 314. Remove the outer call.

### Step 5: Unit tests

Mock `getRedisClient()` and `isRedisConnected()`. Test:

- Happy path (Redis available, Lua returns allowed)
- Rate limit reached (polling + backoff)
- Concurrency full (polling + slot release)
- Fail-open on Redis disconnect
- Fail-open on Redis error
- Heartbeat start/stop lifecycle
- Stats/metrics tracking

### Step 6: Type-check and build

```bash
pnpm --filter course-gen-platform type-check
pnpm --filter course-gen-platform build
```

## Key Design Decisions

1. **`redis.eval()` not `defineCommand()`** - Avoids duplicate command registration issues. Matches existing codebase pattern (`generation-lock.ts:223`, `tracker.ts:91`).

2. **Redis server time in Lua** - `redis.call('TIME')` ensures all processes use same clock regardless of server time drift.

3. **ZSET for both limiters** - RPM uses ZSET sliding window (proven pattern from `rate-limit.ts`). Concurrency uses ZSET with score=expiration for automatic crash recovery.

4. **Fail-open** - Redis failure degrades to current in-process behavior. Better to occasionally exceed Jina limits (429 + existing retry logic) than block on Redis outage.

5. **No new npm dependencies** - Uses ioredis (already available) only.

## Verification

1. `pnpm --filter course-gen-platform type-check` - passes
2. `pnpm --filter course-gen-platform build` - passes
3. `pnpm --filter course-gen-platform test` - unit tests pass
4. Manual: Watch Redis keys during course generation:
   ```bash
   redis-cli MONITOR | grep "jina:"
   ```
5. Verify no 429 errors in logs after deployment
