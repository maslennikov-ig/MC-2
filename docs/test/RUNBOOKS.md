# Transactional Outbox Troubleshooting Runbooks

**Purpose:** Step-by-step guides for resolving production issues with the Transactional Outbox pattern.

**Last Updated:** 2025-11-18

---

## Table of Contents

1. [Outbox Queue Buildup](#outbox-queue-buildup)
2. [FSM Initialization Failures](#fsm-initialization-failures)
3. [Outbox Processor Stalled](#outbox-processor-stalled)
4. [Frequent Fallback Activations](#frequent-fallback-activations)
5. [Redis Cache Issues](#redis-cache-issues)
6. [BullMQ Connection Issues](#bullmq-connection-issues)

---

## Outbox Queue Buildup

**Alert:** `OutboxQueueDepthHigh`
**Severity:** Critical
**Threshold:** Queue depth >1000 jobs for 5+ minutes

### Symptoms
- Alert: "Outbox queue depth >1000 jobs"
- Dashboard shows growing pending jobs
- Course generation delays reported by users

### Diagnosis

**1. Check queue depth:**
```sql
SELECT COUNT(*) as pending_jobs
FROM job_outbox
WHERE processed_at IS NULL;
```

**2. Check processor status:**
```bash
curl http://localhost:3000/api/trpc/metrics.getOutbox
# Look for: health.alive, health.lastProcessed
```

**3. Check error patterns:**
```sql
SELECT last_error, COUNT(*) as count
FROM job_outbox
WHERE last_error IS NOT NULL
GROUP BY last_error
ORDER BY count DESC
LIMIT 10;
```

### Root Causes

**Cause 1: Background processor slow/stalled**
- Symptoms: `lastProcessed` timestamp old (>5 minutes)
- Check: CPU/Memory usage of processor
- Action: Restart processor, scale horizontally

**Cause 2: Redis connection issues**
- Symptoms: `last_error` contains "Redis" or "ECONNREFUSED"
- Check: Redis availability and latency
- Action: Fix Redis, processor will auto-recover

**Cause 3: BullMQ connection issues**
- Symptoms: `last_error` contains "BullMQ" or "connection"
- Check: Redis connection from processor
- Action: Check network, Redis config

**Cause 4: High load (normal spike)**
- Symptoms: Queue depth grows temporarily, then shrinks
- Check: Recent course creation rate
- Action: Monitor, may self-resolve

### Resolution Steps

**Step 1: Increase processor parallelism**
```typescript
// src/orchestrator/outbox-processor.ts
private readonly parallelSize = 10; // Increase to 20 or 50
```

**Step 2: Scale processors horizontally**
```bash
# Start additional processor instance
node dist/orchestrator/outbox-processor-standalone.js
```

**Step 3: Temporary: Increase batch size**
```typescript
// src/orchestrator/outbox-processor.ts
private readonly batchSize = 100; // Increase to 500
```

**Step 4: Emergency: Manual job creation**
```sql
-- Get pending jobs
SELECT * FROM job_outbox WHERE processed_at IS NULL LIMIT 100;

-- For each job, manually create BullMQ job via Redis
-- (Last resort only!)
```

### Prevention
- Monitor queue depth proactively (Warning at 500)
- Auto-scale processors based on queue depth
- Configure alerts for early warning

---

## FSM Initialization Failures

**Alert:** `FSMFailureRateHigh`
**Severity:** Critical
**Threshold:** Failure rate >5% for 5+ minutes

### Symptoms
- Alert: "FSM initialization failure rate >5%"
- Users see "Failed to initialize course generation" errors
- Metrics show increasing `fsm_init_failed` count

### Diagnosis

**1. Check recent failures:**
```bash
curl http://localhost:3000/api/trpc/metrics.getFSM
# Look for: failed, failureReasons
```

**2. Check database logs:**
```sql
-- Check recent RPC errors in Supabase logs
SELECT * FROM system_logs
WHERE message LIKE '%initialize_fsm_with_outbox%'
  AND severity = 'ERROR'
ORDER BY created_at DESC
LIMIT 20;
```

**3. Check application logs:**
```bash
grep "FSM initialization failed" logs/app.log | tail -50
```

### Root Causes

**Cause 1: Course doesn't exist**
- Symptoms: `failureReasons` contains "Course not found"
- Check: Race condition in course creation
- Action: Ensure course created before FSM init

**Cause 2: Invalid FSM state transition**
- Symptoms: `failureReasons` contains "Invalid generation status transition"
- Check: Course already in later stage
- Action: Defense layers should catch this (Layer 3)

**Cause 3: Database connection timeout**
- Symptoms: `failureReasons` contains "timeout" or "connection"
- Check: Database connection pool exhaustion
- Action: Increase pool size, check long-running queries

**Cause 4: RPC function error**
- Symptoms: `failureReasons` contains "RPC" or "function"
- Check: Migration not applied, function missing
- Action: Verify migrations, redeploy RPC function

### Resolution Steps

**Step 1: Verify migrations applied**
```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version >= '20251118000000'
ORDER BY version DESC;

-- Should see:
-- 20251118095804 | create_initialize_fsm_with_outbox_rpc
-- 20251118094238 | create_transactional_outbox_tables
```

**Step 2: Verify RPC function exists**
```sql
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name = 'initialize_fsm_with_outbox';

-- Should return 1 row
```

**Step 3: Test RPC function manually**
```sql
SELECT initialize_fsm_with_outbox(
  p_entity_id := '<test-course-uuid>',
  p_user_id := '<test-user-uuid>',
  p_organization_id := '<test-org-uuid>',
  p_idempotency_key := 'manual-test-' || NOW()::text,
  p_initiated_by := 'ADMIN',
  p_initial_state := 'stage_2_init',
  p_job_data := '[]'::jsonb,
  p_metadata := '{}'::jsonb
);

-- Should return JSONB result
```

**Step 4: Check database connection pool**
```typescript
// Increase pool size if needed
const supabase = createClient(url, key, {
  db: {
    pooler: {
      poolSize: 20, // Increase from 10
    }
  }
});
```

### Prevention
- Monitor failure rate continuously
- Validate course exists before FSM init
- Use defense layers (Layer 2/3) as safety net
- Regular migration health checks

---

## Outbox Processor Stalled

**Alert:** `OutboxProcessorStalled`
**Severity:** Critical
**Threshold:** No processing activity >5 minutes

### Symptoms
- Alert: "Outbox processor not running >5 minutes"
- `lastProcessed` timestamp old
- Queue depth growing
- No BullMQ jobs being created

### Diagnosis

**1. Check processor health:**
```bash
curl http://localhost:3000/api/trpc/metrics.healthCheck
# Look for: outboxAlive, lastProcessedOk
```

**2. Check processor logs:**
```bash
grep "Outbox processor" logs/app.log | tail -100
```

**3. Check process running:**
```bash
ps aux | grep "outbox-processor"
# OR
pm2 list | grep "course-gen"
```

### Root Causes

**Cause 1: Process crashed**
- Symptoms: Process not in `ps` output
- Check: Application logs for crash/exception
- Action: Restart application

**Cause 2: Infinite loop / deadlock**
- Symptoms: Process exists but `lastProcessed` not updating
- Check: CPU usage (should be >0% if active)
- Action: Send SIGTERM, restart if no response

**Cause 3: Database connection lost**
- Symptoms: Logs show "connection refused" or "timeout"
- Check: Database connectivity from app server
- Action: Fix network/database, processor will auto-reconnect

**Cause 4: Redis connection lost**
- Symptoms: Logs show Redis errors
- Check: Redis availability
- Action: Processor continues with database-only (graceful degradation)

### Resolution Steps

**Step 1: Restart application**
```bash
pm2 restart course-gen-platform
# OR
systemctl restart course-gen-platform
```

**Step 2: Verify auto-start**
```typescript
// src/orchestrator/index.ts should have:
import './outbox-processor'; // Auto-starts on module load
```

**Step 3: Manual processor start (if needed)**
```bash
node dist/orchestrator/outbox-processor-standalone.js
```

**Step 4: Health check after restart**
```bash
# Wait 10 seconds
sleep 10

# Verify health
curl http://localhost:3000/api/trpc/metrics.healthCheck

# Should see:
# { "healthy": true, "checks": { "outboxAlive": true, ... } }
```

### Prevention
- Process monitoring (pm2, systemd)
- Auto-restart on crash
- Health check probes for orchestration (Kubernetes liveness/readiness)
- Graceful shutdown handlers (SIGTERM)

---

## Frequent Fallback Activations

**Alert:** `WorkerFallbackFrequencyHigh`
**Severity:** Warning
**Threshold:** Layer 2/3 activations >10 in 5 minutes

### Symptoms
- Alert: "Worker fallback activating >10 times/5min"
- Metrics show high `layer2Activations` or `layer3Activations`
- Indicates jobs bypassing Layer 1 (primary path)

### Diagnosis

**1. Check fallback metrics:**
```bash
curl http://localhost:3000/api/trpc/metrics.getFallbacks
# Look for: layer2Activations, layer3Activations, recentActivations
```

**2. Check application logs:**
```bash
# Layer 2 activations
grep "Layer 2: FSM initialized" logs/app.log | tail -50

# Layer 3 activations
grep "Layer 3: FSM initialized" logs/app.log | tail -50
```

**3. Check job creation source:**
```bash
# Look for direct addJob() calls
grep "addJob" src/**/*.ts | grep -v "command"
```

### Root Causes

**Cause 1: Code still using old pattern**
- Symptoms: Direct `addJob()` calls without command handler
- Check: Search codebase for `addJob(` not preceded by command handler
- Action: Refactor to use InitializeFSMCommandHandler

**Cause 2: Admin tools creating jobs manually**
- Symptoms: Layer 2 activations during admin sessions
- Check: Admin panel logs
- Action: Update admin tools to use command handler

**Cause 3: Test scenarios**
- Symptoms: Layer 3 activations during test runs
- Check: Test files creating jobs directly
- Action: Normal for tests, ignore warning

**Cause 4: Race conditions (rare)**
- Symptoms: Sporadic Layer 3 activations
- Check: Database transaction logs
- Action: Investigate timing, may indicate bug

### Resolution Steps

**Step 1: Find non-compliant code**
```bash
# Search for addJob without command handler
rg "addJob\(" --type ts | grep -v "InitializeFSMCommand"
```

**Step 2: Refactor to use command handler**
```typescript
// BEFORE (Layer 2/3 will catch)
await addJob(JobType.STRUCTURE_ANALYSIS, jobData);

// AFTER (Layer 1 - correct)
const handler = new InitializeFSMCommandHandler();
await handler.handle({
  entityId: courseId,
  userId,
  organizationId,
  idempotencyKey: `unique-key-${Date.now()}`,
  initiatedBy: 'API',
  initialState: 'stage_4_init',
  data: { ... },
  jobs: [{ queue: 'structure-analysis', data: jobData, options: { priority: 10 } }],
});
```

**Step 3: Update admin tools (if applicable)**
```typescript
// Admin panel should use same pattern
const result = await trpc.generation.initiate.mutate({ courseId, ... });
// NOT: await addJob(...)
```

**Step 4: Accept as expected for tests**
```typescript
// In tests, Layer 3 fallbacks are expected safety net
// Just ensure tests don't hit Layer 2 (indicates real bypass)
```

### Prevention
- Code review for direct `addJob()` usage
- Linting rule to warn on `addJob` without command handler
- Update developer documentation
- Layer 2/3 remain as safety nets (not errors)

---

## Redis Cache Issues

**Alert:** `FSMCacheHitRateLow`
**Severity:** Warning
**Threshold:** Cache hit rate <20% for 10+ minutes

### Symptoms
- Alert: "FSM cache hit rate <20%"
- Increased database load (more RPC calls)
- Slower response times for duplicate requests

### Diagnosis

**1. Check cache metrics:**
```bash
curl http://localhost:3000/api/trpc/metrics.getFSM
# Look for: cacheHits, cacheMisses, cacheHitRate
```

**2. Check Redis status:**
```bash
redis-cli ping
# Should return: PONG

redis-cli INFO stats
# Look for: keyspace_hits, keyspace_misses
```

**3. Check Redis memory:**
```bash
redis-cli INFO memory
# Look for: used_memory, maxmemory
```

### Root Causes

**Cause 1: Redis evicting keys (memory pressure)**
- Symptoms: `used_memory` near `maxmemory`
- Check: Redis eviction policy
- Action: Increase Redis memory, adjust TTL

**Cause 2: Redis connection issues**
- Symptoms: Application logs show "Redis connection error"
- Check: Network connectivity to Redis
- Action: Fix network, restart Redis

**Cause 3: TTL too short**
- Symptoms: Cache hit rate low even with repeated requests
- Check: Current TTL (24 hours by default)
- Action: Increase TTL if appropriate

**Cause 4: Low request duplication**
- Symptoms: Each request has unique idempotency key
- Check: Idempotency key generation logic
- Action: This is expected, not an error

### Resolution Steps

**Step 1: Increase Redis memory (if needed)**
```bash
# redis.conf
maxmemory 2gb  # Increase from 1gb
```

**Step 2: Check eviction policy**
```bash
# redis.conf
maxmemory-policy allkeys-lru  # Keep most recent
```

**Step 3: Monitor after changes**
```bash
# Wait 10 minutes, check metrics again
curl http://localhost:3000/api/trpc/metrics.getFSM
```

**Step 4: Accept as normal (if appropriate)**
```
If cache hit rate is low because:
- Each course is unique (no duplicate requests)
- Low traffic volume
→ This is expected, not a problem
```

### Prevention
- Monitor Redis memory proactively
- Configure appropriate `maxmemory` based on traffic
- Cache hit rate <20% may be normal for low-traffic systems
- Consider alert threshold adjustment

---

## BullMQ Connection Issues

**Alert:** `OutboxJobFailureRateHigh`
**Severity:** Warning
**Threshold:** Job creation failure rate >10% for 5+ minutes

### Symptoms
- Alert: "Outbox job creation failure rate >10%"
- Metrics show high `outbox_jobs_failed`
- `last_error` in job_outbox shows BullMQ errors
- Workers not receiving jobs

### Diagnosis

**1. Check outbox errors:**
```sql
SELECT last_error, attempts, COUNT(*) as count
FROM job_outbox
WHERE last_error IS NOT NULL
GROUP BY last_error, attempts
ORDER BY count DESC;
```

**2. Check Redis connectivity:**
```bash
redis-cli -h <redis-host> -p 6379 ping
# Should return: PONG
```

**3. Check BullMQ queues:**
```bash
# Via redis-cli
redis-cli KEYS "bull:course-generation:*" | head -20
```

### Root Causes

**Cause 1: Redis connection timeout**
- Symptoms: `last_error` contains "ETIMEDOUT" or "ECONNREFUSED"
- Check: Network latency to Redis
- Action: Fix network, increase timeout

**Cause 2: Redis memory full**
- Symptoms: `last_error` contains "OOM" or "maxmemory"
- Check: `redis-cli INFO memory`
- Action: Increase Redis memory, clear old data

**Cause 3: BullMQ configuration issue**
- Symptoms: Jobs created but not processed
- Check: Worker registration, queue names
- Action: Verify queue names match

**Cause 4: Redis authentication**
- Symptoms: `last_error` contains "NOAUTH" or "authentication"
- Check: REDIS_URL includes password
- Action: Update connection string

### Resolution Steps

**Step 1: Verify Redis connection**
```typescript
// Test connection from app server
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);
await redis.ping(); // Should succeed
```

**Step 2: Check Redis memory**
```bash
redis-cli INFO memory | grep maxmemory
# If used_memory >= maxmemory, increase limit
```

**Step 3: Verify queue configuration**
```typescript
// src/orchestrator/queue.ts
export function getQueue() {
  return new Queue('course-generation', {
    connection: {
      host: 'localhost',
      port: 6379,
      // Ensure connection config is correct
    },
  });
}
```

**Step 4: Retry failed jobs**
```sql
-- Reset attempts for failed jobs (manual intervention)
UPDATE job_outbox
SET attempts = 0, last_error = NULL
WHERE last_error IS NOT NULL
  AND attempts >= 5;

-- Processor will retry on next poll
```

### Prevention
- Monitor Redis health continuously
- Configure Redis with sufficient memory
- Use Redis Sentinel/Cluster for high availability
- BullMQ retries handle transient failures automatically

---

## General Debugging Tips

**1. Check system health:**
```bash
curl http://localhost:3000/api/trpc/metrics.healthCheck
```

**2. View all metrics:**
```bash
curl http://localhost:3000/api/trpc/metrics.getAll | jq .
```

**3. Check database tables:**
```sql
-- Pending jobs
SELECT COUNT(*) FROM job_outbox WHERE processed_at IS NULL;

-- Recent FSM events
SELECT * FROM fsm_events ORDER BY created_at DESC LIMIT 20;

-- Idempotency cache size
SELECT COUNT(*) FROM idempotency_keys;
```

**4. Check application logs:**
```bash
# FSM initialization
grep "FSM initialization" logs/app.log | tail -50

# Outbox processor
grep "Outbox processor" logs/app.log | tail -50

# Defense layers
grep "Layer 2\|Layer 3" logs/app.log | tail -50
```

**5. Database cleanup (if needed):**
```sql
-- Old processed jobs (>30 days)
DELETE FROM job_outbox
WHERE processed_at < NOW() - INTERVAL '30 days';

-- Old idempotency keys (expired)
DELETE FROM idempotency_keys
WHERE expires_at < NOW();

-- Note: fsm_events never deleted (immutable audit log)
```

---

## Escalation

**Level 1:** Outbox queue buildup, cache issues
- Action: Follow runbook, restart services
- Escalate if: No improvement after 30 minutes

**Level 2:** FSM initialization failures, processor stalled
- Action: Check database, verify migrations
- Escalate if: Database issues or persistent failures

**Level 3:** System-wide failures, data corruption
- Action: Enable maintenance mode, investigate root cause
- Contact: Senior engineer, database team

**Contacts:**
- On-call Engineer: PagerDuty rotation
- Database Team: #db-support Slack channel
- Platform Team: #platform-support Slack channel

---

**End of Runbooks** | Last Updated: 2025-11-18
