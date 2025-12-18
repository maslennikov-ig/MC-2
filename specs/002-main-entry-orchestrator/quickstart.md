# Quickstart: Main Entry Orchestrator

**Feature**: Stage 1 - Main Entry Orchestrator
**Branch**: `002-main-entry-orchestrator`
**Date**: 2025-10-20

## Overview

This quickstart guide walks you through implementing and testing the Main Entry Orchestrator locally. Follow these steps to get the feature running on your development machine.

---

## Prerequisites

### Required Software

- ✅ **Node.js** 20+ and **pnpm** 8+
- ✅ **Docker** and **Docker Compose**
- ✅ **Supabase CLI** (for local Supabase)
- ✅ **Redis** (via Docker or local install)

### Existing Setup (Stage 0)

Ensure Stage 0 infrastructure is running:
- ✅ Supabase local instance
- ✅ Redis instance
- ✅ BullMQ queue configured
- ✅ tRPC server running

---

## Step 1: Install Dependencies

```bash
# Navigate to backend package
cd packages/course-gen-platform

# Install Pino logger
pnpm add pino@^9.6.0
pnpm add -D pino-pretty@^13.0.0

# Install types
pnpm add -D @types/node
```

---

## Step 2: Run Database Migrations

### Create Migration Files

```bash
# Create migrations directory if not exists
mkdir -p courseai-next/supabase/migrations

# Generate timestamp
TIMESTAMP=$(date +%Y%m%d%H%M%S)

# Create system_metrics table migration
cat > courseai-next/supabase/migrations/${TIMESTAMP}_create_system_metrics.sql << 'EOF'
-- Create ENUM types
CREATE TYPE metric_event_type AS ENUM (
  'job_rollback',
  'orphaned_job_recovery',
  'concurrency_limit_hit',
  'worker_timeout',
  'rpc_retry_exhausted',
  'duplicate_job_detected'
);

CREATE TYPE metric_severity AS ENUM ('info', 'warn', 'error', 'fatal');

-- Create table
CREATE TABLE system_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type metric_event_type NOT NULL,
  severity metric_severity NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  job_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_system_metrics_event_type ON system_metrics(event_type);
CREATE INDEX idx_system_metrics_severity ON system_metrics(severity);
CREATE INDEX idx_system_metrics_timestamp ON system_metrics(timestamp DESC);
CREATE INDEX idx_system_metrics_course ON system_metrics(course_id) WHERE course_id IS NOT NULL;

-- Enable RLS
ALTER TABLE system_metrics ENABLE ROW LEVEL SECURITY;

-- Service role insert policy (backend writes)
CREATE POLICY system_metrics_service_insert ON system_metrics
  FOR INSERT WITH CHECK (true);

COMMENT ON TABLE system_metrics IS 'Critical system events for Stage 8 monitoring and alerting';
EOF

# Create update_course_progress RPC migration
# (Copy full implementation from contracts/rpc-update-course-progress.md)
# Save to: courseai-next/supabase/migrations/${TIMESTAMP}_create_update_course_progress_rpc.sql
```

### Apply Migrations

```bash
# Start Supabase local (if not running)
cd courseai-next
supabase start

# Apply migrations
supabase db reset  # Fresh start
# OR
supabase migration up  # Apply new migrations only

# Verify tables created
supabase db diff --schema public
```

---

## Step 3: Configure Environment Variables

### Backend (.env)

```bash
# packages/course-gen-platform/.env

# Supabase
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Redis
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=debug  # Use 'info' in production
NODE_ENV=development

# App Metadata
APP_VERSION=1.0.0

# Concurrency (Stage 1 hardcoded)
GLOBAL_CONCURRENCY_LIMIT=3
```

### Frontend (.env.local)

```bash
# courseai-next/.env.local

# Supabase (public keys)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# API endpoint (for course generation)
NEXT_PUBLIC_API_URL=http://localhost:3001  # Backend tRPC server
```

---

## Step 4: Implement Core Modules

### 4.1 Pino Logger (Replace Existing)

**File**: `packages/course-gen-platform/src/shared/logger/index.ts`

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'course-generator',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '0.0.0',
  },
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

export default logger;
export { logger };
```

### 4.2 Concurrency Tracker

**File**: `packages/course-gen-platform/src/shared/concurrency/tracker.ts`

```typescript
import { Redis } from 'ioredis';
import { getRedisClient } from '../cache/redis';
import logger from '../logger';

export const TIER_LIMITS = {
  FREE: 1,
  BASIC: 2,
  STANDARD: 3,
  TRIAL: 5,
  PREMIUM: 5,
} as const;

export const TIER_PRIORITY = {
  FREE: 1,
  BASIC: 3,
  STANDARD: 5,
  TRIAL: 5,
  PREMIUM: 10,
} as const;

export type UserTier = keyof typeof TIER_LIMITS;

export interface ConcurrencyCheckResult {
  allowed: boolean;
  reason?: 'user_limit' | 'global_limit' | 'success';
  current_user_jobs?: number;
  user_limit?: number;
  current_global_jobs?: number;
  global_limit?: number;
}

export class ConcurrencyTracker {
  private redis: Redis;
  private globalLimit: number;

  constructor() {
    this.redis = getRedisClient();
    this.globalLimit = parseInt(process.env.GLOBAL_CONCURRENCY_LIMIT || '3');
  }

  async checkAndReserve(userId: string, tier: UserTier): Promise<ConcurrencyCheckResult> {
    const userLimit = TIER_LIMITS[tier];
    const globalLimit = this.globalLimit;

    // Lua script for atomic check-and-increment
    const script = `
      local user_key = KEYS[1]
      local global_key = KEYS[2]
      local user_limit = tonumber(ARGV[1])
      local global_limit = tonumber(ARGV[2])

      local user_count = tonumber(redis.call('GET', user_key) or 0)
      local global_count = tonumber(redis.call('GET', global_key) or 0)

      if user_count >= user_limit then
        return {'0', 'user_limit', tostring(user_count), tostring(user_limit), tostring(global_count), tostring(global_limit)}
      end

      if global_count >= global_limit then
        return {'0', 'global_limit', tostring(user_count), tostring(user_limit), tostring(global_count), tostring(global_limit)}
      end

      redis.call('INCR', user_key)
      redis.call('EXPIRE', user_key, 3600)  -- 1 hour TTL
      redis.call('INCR', global_key)

      return {'1', 'success', tostring(user_count + 1), tostring(user_limit), tostring(global_count + 1), tostring(global_limit)}
    `;

    try {
      const result = await this.redis.eval(
        script,
        2, // 2 keys
        `concurrency:user:${userId}`,
        'concurrency:global',
        userLimit,
        globalLimit
      ) as string[];

      const [success, reason, userCount, userLimitStr, globalCount, globalLimitStr] = result;

      if (success === '1') {
        return {
          allowed: true,
          reason: 'success' as const,
          current_user_jobs: parseInt(userCount),
          user_limit: parseInt(userLimitStr),
          current_global_jobs: parseInt(globalCount),
          global_limit: parseInt(globalLimitStr),
        };
      } else {
        return {
          allowed: false,
          reason: reason as 'user_limit' | 'global_limit',
          current_user_jobs: parseInt(userCount),
          user_limit: parseInt(userLimitStr),
          current_global_jobs: parseInt(globalCount),
          global_limit: parseInt(globalLimitStr),
        };
      }
    } catch (error) {
      logger.error('Concurrency check failed', { error, userId, tier });
      throw error;
    }
  }

  async release(userId: string): Promise<void> {
    try {
      await Promise.all([
        this.redis.decr(`concurrency:user:${userId}`),
        this.redis.decr('concurrency:global')
      ]);

      logger.debug('Concurrency slot released', { userId });
    } catch (error) {
      logger.error('Failed to release concurrency slot', { error, userId });
      // Don't throw - log and continue (counters will reconcile)
    }
  }
}

export const concurrencyTracker = new ConcurrencyTracker();
```

### 4.3 Retry Utility

**File**: `packages/course-gen-platform/src/shared/utils/retry.ts`

```typescript
import logger from '../logger';

export interface RetryOptions {
  attempts: number;
  backoff: number[]; // Array of delays in ms
  onRetry?: (attempt: number, error: Error) => void;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T | null> {
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === options.attempts) {
        logger.error('All retry attempts exhausted', {
          attempts: options.attempts,
          error
        });
        return null;
      }

      const delay = options.backoff[attempt - 1] || 1000;
      logger.warn('Retry attempt failed, backing off', {
        attempt,
        maxAttempts: options.attempts,
        delay,
        error
      });

      if (options.onRetry) {
        options.onRetry(attempt, error as Error);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return null;
}
```

### 4.4 API Endpoint

**File**: `courseai-next/app/api/coursegen/generate/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { addJob, JobType } from '@megacampus/shared-types';
import {
  concurrencyTracker,
  TIER_PRIORITY,
  UserTier
} from '@megacampus/course-gen-platform/src/shared/concurrency/tracker';
import { retryWithBackoff } from '@megacampus/course-gen-platform/src/shared/utils/retry';
import logger from '@megacampus/course-gen-platform/src/shared/logger';
import { nanoid } from 'nanoid';

const RequestSchema = z.object({
  courseId: z.string().uuid(),
  webhookUrl: z.string().url().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const requestId = nanoid();
  const requestLogger = logger.child({ requestId, endpoint: '/api/coursegen/generate' });

  try {
    // 1. Validate request body
    const body = await request.json();
    const validation = RequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { courseId, webhookUrl } = validation.data;

    // 2. Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      requestLogger.warn('Unauthorized request', { authError });
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing authentication token' },
        { status: 401 }
      );
    }

    const userId = user.id;
    const tier = (user.user_metadata?.tier || 'FREE') as UserTier;
    const userLogger = requestLogger.child({ userId, tier, courseId });

    // 3. Fetch course and verify ownership
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .single();

    if (courseError || !course) {
      userLogger.warn('Course not found', { courseError });
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      );
    }

    if (course.user_id !== userId) {
      userLogger.warn('Course ownership violation', { courseOwnerId: course.user_id });
      return NextResponse.json(
        { error: 'Forbidden: You do not have access to this course' },
        { status: 403 }
      );
    }

    // 4. Check concurrency limits
    const concurrencyCheck = await concurrencyTracker.checkAndReserve(userId, tier);

    if (!concurrencyCheck.allowed) {
      userLogger.warn('Concurrency limit hit', { concurrencyCheck });

      // Write to system_metrics
      await supabase.from('system_metrics').insert({
        event_type: 'concurrency_limit_hit',
        severity: 'warn',
        user_id: userId,
        metadata: {
          tier,
          ...concurrencyCheck,
          rejected_course_id: courseId
        }
      });

      const errorMessage = concurrencyCheck.reason === 'user_limit'
        ? `Too many concurrent jobs. ${tier} tier allows ${concurrencyCheck.user_limit} concurrent course generation.`
        : 'System at capacity. Please try again in a few minutes.';

      return NextResponse.json(
        { error: errorMessage, details: concurrencyCheck },
        { status: 429 }
      );
    }

    // 5. Determine job type based on files
    const hasFiles = course.generation_progress?.files &&
                     Array.isArray(course.generation_progress.files) &&
                     course.generation_progress.files.length > 0;

    const jobType = hasFiles ? JobType.DOCUMENT_PROCESSING : JobType.STRUCTURE_ANALYSIS;
    const priority = TIER_PRIORITY[tier];

    // 6. Create BullMQ job
    let jobId: string | null = null;

    try {
      const job = await addJob(jobType, {
        jobType,
        organizationId: userId, // Or course.organization_id if exists
        courseId,
        userId,
        createdAt: new Date().toISOString(),
        // Include course context
        title: course.title,
        language: course.language,
        style: course.style,
        course_description: course.course_description,
        target_audience: course.target_audience,
        difficulty: course.difficulty,
        learning_outcomes: course.learning_outcomes,
        estimated_lessons: course.estimated_lessons,
        estimated_sections: course.estimated_sections,
        content_strategy: course.content_strategy,
        output_formats: course.output_formats,
      }, { priority });

      jobId = job.id!;
      userLogger.info('Job created', { jobId, jobType, priority });

      // 7. Update progress with retry (Saga pattern)
      const updated = await retryWithBackoff(async () => {
        const { data, error } = await supabase.rpc('update_course_progress', {
          p_course_id: courseId,
          p_step_id: 1,
          p_status: 'completed',
          p_message: 'Инициализация завершена',
          p_metadata: {
            job_id: jobId,
            executor: 'orchestrator',
            tier,
            priority
          }
        });

        if (error) throw error;
        return data;
      }, {
        attempts: 3,
        backoff: [100, 200, 400],
        onRetry: (attempt, error) => {
          userLogger.warn('RPC retry', { attempt, error: error.message });
        }
      });

      if (!updated) {
        throw new Error('RPC update_course_progress failed after 3 retries');
      }

      userLogger.info('Progress updated', { step: 1, percentage: updated.percentage });

      // 8. Return success
      return NextResponse.json({
        success: true,
        jobId,
        message: 'Генерация курса инициализирована'
      }, { status: 200 });

    } catch (error) {
      // Compensation: Rollback job
      if (jobId) {
        const queue = getQueue();
        await queue.remove(jobId);
        userLogger.error('Job rollback due to RPC failure', { jobId, error });

        // Write to system_metrics
        await supabase.from('system_metrics').insert({
          event_type: 'job_rollback',
          severity: 'error',
          user_id: userId,
          course_id: courseId,
          job_id: jobId,
          metadata: {
            reason: 'rpc_update_course_progress_failed',
            attempts: 3,
            last_error: String(error)
          }
        });
      }

      // Release concurrency slot
      await concurrencyTracker.release(userId);

      return NextResponse.json(
        { error: 'Не удалось инициализировать генерацию курса. Попробуйте позже.' },
        { status: 500 }
      );
    }

  } catch (error) {
    requestLogger.error('Unexpected error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

## Step 5: Update Worker for Step 1 Recovery

**File**: `packages/course-gen-platform/src/orchestrator/handlers/document-processing.ts` (or base handler)

```typescript
// At start of job handler
async function handleJob(job: Job<JobData>) {
  const { courseId, userId } = job.data;
  const jobLogger = logger.child({ jobId: job.id, courseId, userId });

  try {
    // Check if step 1 was completed (orphan detection)
    const { data: course } = await supabase
      .from('courses')
      .select('generation_progress')
      .eq('id', courseId)
      .single();

    const step1Status = course?.generation_progress?.steps?.[0]?.status;

    if (step1Status !== 'completed') {
      // Orphaned job recovery
      jobLogger.warn('Orphaned job detected, recovering step 1');

      await supabase.rpc('update_course_progress', {
        p_course_id: courseId,
        p_step_id: 1,
        p_status: 'completed',
        p_message: 'Инициализация завершена (восстановлено воркером)',
        p_metadata: {
          recovered_by_worker: true,
          job_id: job.id
        }
      });

      // Log recovery event
      await supabase.from('system_metrics').insert({
        event_type: 'orphaned_job_recovery',
        severity: 'warn',
        user_id: userId,
        course_id: courseId,
        job_id: job.id,
        metadata: { recovery_step: 1 }
      });
    }

    // Continue with job processing...
    jobLogger.info('Job processing started');

  } catch (error) {
    jobLogger.error('Job failed', { error });
    throw error;
  } finally {
    // Release concurrency slot on completion/failure
    await concurrencyTracker.release(userId);
  }
}
```

---

## Step 6: Start Services

### Terminal 1: Redis

```bash
# If using Docker
docker run -d --name redis -p 6379:6379 redis:alpine

# If local Redis
redis-server
```

### Terminal 2: Supabase

```bash
cd courseai-next
supabase start

# Verify running
supabase status
```

### Terminal 3: Backend Worker

```bash
cd packages/course-gen-platform
pnpm dev
```

### Terminal 4: Frontend

```bash
cd courseai-next
pnpm dev
```

---

## Step 7: Test the Feature

### Test 1: Manual API Call (cURL)

```bash
# Get JWT token from Supabase dashboard or login
TOKEN="your-jwt-token-here"
COURSE_ID="your-course-uuid-here"

# Call endpoint
curl -X POST http://localhost:3000/api/coursegen/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"courseId\": \"$COURSE_ID\"}"

# Expected: 200 OK { "success": true, "jobId": "..." }
```

### Test 2: Concurrency Limit (FREE Tier)

```bash
# Start job 1 (should succeed)
curl -X POST http://localhost:3000/api/coursegen/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FREE_USER_TOKEN" \
  -d "{\"courseId\": \"$COURSE_1_ID\"}"

# Start job 2 (should fail with 429)
curl -X POST http://localhost:3000/api/coursegen/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FREE_USER_TOKEN" \
  -d "{\"courseId\": \"$COURSE_2_ID\"}"

# Expected: 429 Too Many Requests
```

### Test 3: Verify Progress Update

```bash
# Query database
psql -U postgres -d megacampusai -c "
  SELECT
    id,
    title,
    generation_progress->'percentage' AS percentage,
    generation_progress->'current_step' AS current_step,
    generation_progress->'steps'->0->'status' AS step_1_status
  FROM courses
  WHERE id = '$COURSE_ID';
"

# Expected: step_1_status = 'completed', percentage = 20
```

### Test 4: Check System Metrics

```bash
# Query system_metrics table
psql -U postgres -d megacampusai -c "
  SELECT
    event_type,
    severity,
    course_id,
    job_id,
    metadata,
    timestamp
  FROM system_metrics
  ORDER BY timestamp DESC
  LIMIT 10;
"
```

### Test 5: BullBoard Dashboard

```bash
# Open browser
open http://localhost:3001/admin/queues

# Verify:
# - Job created with correct priority
# - Job data contains all course fields
# - Job status progresses (waiting → active → completed)
```

---

## Troubleshooting

### Issue: RPC Function Not Found

**Error**: `function update_course_progress(uuid, integer, text, text) does not exist`

**Solution**:
```bash
cd courseai-next
supabase db reset
# Verify migration applied
supabase migration list
```

### Issue: Redis Connection Failed

**Error**: `ECONNREFUSED` on port 6379

**Solution**:
```bash
# Check Redis running
docker ps | grep redis
# Or
redis-cli ping  # Should return PONG

# Restart Redis
docker restart redis
```

### Issue: Concurrency Counter Stuck

**Error**: User always gets 429 even after jobs complete

**Solution**:
```bash
# Reset Redis counters
redis-cli
> GET concurrency:user:{userId}
> DEL concurrency:user:{userId}
> DEL concurrency:global
```

### Issue: 401 Unauthorized

**Error**: JWT token validation fails

**Solution**:
```bash
# Get fresh token
cd courseai-next
pnpm tsx scripts/get-auth-token.ts  # Create this helper script

# Or login via frontend and copy from browser DevTools
# Application tab → Local Storage → supabase.auth.token
```

---

## Next Steps

After successful local testing:

1. ✅ Run integration tests (see `contracts/api-endpoint.md`)
2. ✅ Test with frontend UI (course generation button)
3. ✅ Monitor Pino logs for structured JSON output
4. ✅ Verify system_metrics table populates on errors
5. ✅ Test worker orphan recovery (manually delete Redis counter mid-job)
6. ✅ Deploy to staging environment
7. ✅ Run parallel with n8n for 1 week
8. ✅ Switch frontend env variable to new backend
9. ✅ Monitor production metrics for 1 week
10. ✅ Sunset n8n workflow

---

## Development Tips

### Watch Pino Logs (Pretty Format)

```bash
cd packages/course-gen-platform
pnpm dev | pnpm exec pino-pretty
```

### Monitor Redis Keys

```bash
redis-cli
> KEYS concurrency:*
> GET concurrency:global
> GET concurrency:user:{userId}
> TTL concurrency:user:{userId}
```

### Query Progress in Real-Time

```bash
# Watch progress updates
watch -n 1 "psql -U postgres -d megacampusai -c \"
  SELECT
    title,
    generation_progress->'percentage' AS pct,
    generation_progress->'current_step' AS step,
    last_progress_update
  FROM courses
  WHERE id = '$COURSE_ID';
\""
```

### Test RPC Directly

```bash
psql -U postgres -d megacampusai -c "
  SELECT update_course_progress(
    '$COURSE_ID'::uuid,
    1,
    'completed',
    'Test message',
    NULL,
    NULL,
    '{\"test\": true}'::jsonb
  );
"
```

---

## Summary

You now have:

- ✅ Database migrations applied
- ✅ Pino logger configured
- ✅ Concurrency tracker implemented
- ✅ API endpoint deployed
- ✅ Worker updated for orphan recovery
- ✅ All services running locally
- ✅ Tests passing

**Ready for Task Breakdown** → Proceed to `/speckit.tasks` to generate implementation tasks.

---

## References

- **Feature Spec**: `specs/002-main-entry-orchestrator/spec.md`
- **Data Model**: `specs/002-main-entry-orchestrator/data-model.md`
- **API Contract**: `specs/002-main-entry-orchestrator/contracts/api-endpoint.md`
- **RPC Contract**: `specs/002-main-entry-orchestrator/contracts/rpc-update-course-progress.md`
- **Research**: `specs/002-main-entry-orchestrator/research.md`
