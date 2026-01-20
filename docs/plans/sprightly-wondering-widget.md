# Plan: Stage 6 Dedicated Queue Implementation

**Issue:** mc2-p10c
**Goal:** Активировать dedicated Stage 6 queue с 30 concurrent workers

## Summary

Код для 30-worker Stage 6 queue **уже существует** в `factory.ts`, но не используется.
Нужно подключить его к job creation flow.

## Implementation Steps

### Step 1: Create Stage 6 Queue Export

**File:** `packages/course-gen-platform/src/stages/stage6-lesson-content/factory.ts`

Добавить функцию для создания queue (не только worker):

```typescript
export function createStage6Queue(): Queue<Stage6JobInput, Stage6JobResult> {
  const connection = getRedisClient();
  return new Queue(HANDLER_CONFIG.QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: HANDLER_CONFIG.MAX_RETRIES,
      backoff: {
        type: 'exponential',
        delay: HANDLER_CONFIG.RETRY_DELAY_MS,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });
}
```

### Step 2: Update start.ts to Use Stage 6 Queue

**File:** `packages/course-gen-platform/src/server/routers/lesson-content/procedures/start.ts`

```typescript
// Replace:
import { addJob } from '../../../../orchestrator/queue';

// With:
import { createStage6Queue } from '@/stages/stage6-lesson-content/factory';

// In mutation:
const stage6Queue = createStage6Queue();
const jobs = await Promise.all(
  lessonSpecs.map(spec => {
    const jobData: Stage6JobInput = { ... };
    return stage6Queue.add(
      `lesson:${spec.lesson_id}`,
      jobData,
      { priority }
    );
  })
);
```

### Step 3: Add Stage 6 Worker Mode to Entrypoint

**File:** `packages/course-gen-platform/src/orchestrator/worker-entrypoint.ts`

```typescript
import { createStage6Worker } from '@/stages/stage6-lesson-content/factory';

async function main() {
  // ... existing setup ...

  if (process.env.STAGE6_WORKER === 'true') {
    logger.info('Starting dedicated Stage 6 worker (30 concurrent)');
    const worker = createStage6Worker();
    // ... lifecycle handling ...
    return;
  }

  // ... existing general worker code ...
}
```

### Step 4: Update Docker Compose

**File:** `docker-compose.yml`

```yaml
services:
  # Existing worker for general jobs
  worker:
    # ... existing config ...

  # New dedicated Stage 6 worker
  stage6-worker:
    image: course-gen-platform
    command: pnpm start:worker
    environment:
      - STAGE6_WORKER=true
      - REDIS_URL=${REDIS_URL}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
    depends_on:
      - redis
    deploy:
      replicas: 1 # One worker with 30 concurrent
```

## Files to Modify

| File                                                | Changes                          |
| --------------------------------------------------- | -------------------------------- |
| `stages/stage6-lesson-content/factory.ts`           | Add `createStage6Queue()` export |
| `server/routers/lesson-content/procedures/start.ts` | Use Stage 6 queue                |
| `orchestrator/worker-entrypoint.ts`                 | Add STAGE6_WORKER mode           |
| `docker-compose.yml`                                | Add stage6-worker service        |

## Verification

1. **Type check:** `pnpm type-check`
2. **Build:** `pnpm build`
3. **Local test:**
   - Start main worker: `pnpm dev:worker`
   - Start Stage 6 worker: `STAGE6_WORKER=true pnpm dev:worker`
   - Trigger Stage 6 generation
   - Check Redis: `redis-cli LLEN bull:stage6-lesson-content:active`
4. **Expected:** Up to 30 concurrent jobs in Stage 6 queue

## Rollback

Если что-то пойдёт не так:

1. Убрать `STAGE6_WORKER=true` из deployment
2. Вернуть `addJob()` в start.ts
3. Jobs автоматически пойдут через общую очередь
