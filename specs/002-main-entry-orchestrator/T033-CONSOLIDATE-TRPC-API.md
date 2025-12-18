# T033: Consolidate API Logic into tRPC

**Priority**: 🔴 **CRITICAL BLOCKER**
**Status**: Pending
**Executor**: api-builder OR fullstack-nextjs-specialist
**Estimated Time**: 2-3 hours
**Blocks**: T020-T031 (depends on consolidated API)

---

## Problem Statement

Current architecture has **logic duplication**:

1. **tRPC Router** (`packages/course-gen-platform/src/server/routers/generation.ts:171`)
   - `generation.initiate` - minimal placeholder implementation
   - Missing T011-T019 logic (concurrency, validation, progress updates)

2. **Next.js API Route** (`courseai-next/app/api/coursegen/generate/route.ts:49`)
   - **Full T011-T019 implementation** (361 lines)
   - Auth, concurrency checks, job creation, progress updates, rollback
   - **This logic should be in backend, not frontend!**

**Result**: Same business logic in two places = maintenance nightmare.

---

## Architecture Decision

### Option Chosen: **tRPC-First with Multi-Client Support**

**Why tRPC is sufficient for ALL clients** (including PHP/Ruby LMS):

✅ **tRPC = HTTP POST** - Any language can call:
```bash
# PHP, Python, Ruby can call tRPC endpoints:
curl -X POST https://api.megacampus.ai/trpc/generation.initiate \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"courseId":"uuid-here"}'
```

✅ **JWT Auth** - Standard Bearer tokens work across languages
✅ **JSON I/O** - Universal data format
✅ **Type-safe** - TypeScript clients get full type inference
✅ **Language-agnostic** - HTTP client libraries exist for all languages
✅ **No duplication** - Single source of truth for business logic

### Future LMS Integration Strategy

**Stage 1 (Current)**: LMS systems call tRPC directly via HTTP
- Documentation with examples for PHP/Ruby/Python
- Works immediately, no additional implementation needed

**Stage N (Future)**: Optional REST wrapper IF requested
- IF LMS partners request RESTful endpoints (`/api/v1/courses/{id}/generate`)
- THEN create thin Express wrapper that calls tRPC
- Zero logic duplication - REST wrapper = 20 lines per endpoint

See `docs/LMS-INTEGRATION-ROADMAP.md` for migration path.

---

## Implementation Goal

**Consolidate T011-T019 logic into tRPC router**:

1. Move all logic from `courseai-next/app/api/coursegen/generate/route.ts` to tRPC
2. Next.js route becomes thin proxy (5-10 lines)
3. Update documentation for LMS multi-client access

---

## tRPC API Specification

### Endpoint: `generation.initiate` (Enhanced)

**Current Implementation** (placeholder):
```typescript
// packages/course-gen-platform/src/server/routers/generation.ts:171
initiate: instructorProcedure
  .input(initiateGenerationInputSchema)
  .mutation(async ({ ctx, input }) => {
    // Minimal placeholder - just creates INITIALIZE job
    const job = await addJob(JobType.INITIALIZE, jobData);
    return { jobId: job.id, status: 'pending', ... };
  })
```

**Target Implementation** (with T011-T019 logic):
```typescript
initiate: instructorProcedure
  .use(createRateLimiter({ requests: 10, window: 60 }))
  .input(z.object({
    courseId: z.string().uuid(),
    webhookUrl: z.string().url().nullable().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    // T013: Verify course ownership
    const course = await verifyCourseOwnership(input.courseId, ctx.user.id);

    // T014: Check concurrency limits
    const concurrencyCheck = await supabase.rpc('check_and_reserve_concurrency', {
      p_user_id: ctx.user.id,
      p_tier: ctx.user.tier
    });

    if (!concurrencyCheck.allowed) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `Too many concurrent jobs. ${ctx.user.tier} tier allows ${concurrencyCheck.user_limit}.`
      });
    }

    // T015: Determine job type based on files
    const hasFiles = course.generation_progress?.files?.length > 0;
    const jobType = hasFiles ? 'DOCUMENT_PROCESSING' : 'STRUCTURE_ANALYSIS';

    // T016: Create BullMQ job with tier-based priority
    const priority = TIER_PRIORITY[ctx.user.tier];
    const job = await addJob(jobType, {
      courseId: input.courseId,
      userId: ctx.user.id,
      organizationId: ctx.user.organizationId,
      webhookUrl: input.webhookUrl,
      ...courseData
    }, { priority });

    // T017: Update progress with retry (exponential backoff)
    await retryWithBackoff(async () => {
      await supabase.rpc('update_course_progress', {
        p_course_id: input.courseId,
        p_step_id: 1,
        p_status: 'completed',
        p_message: 'Инициализация завершена',
        p_metadata: { job_id: job.id, tier: ctx.user.tier }
      });
    }, { maxRetries: 3, delays: [100, 200, 400] });

    // T019: Success response
    return {
      success: true,
      jobId: job.id,
      message: 'Генерация курса инициализирована',
      courseId: input.courseId
    };
  })
```

---

## Implementation Steps

### Step 1: Create Retry Utility

**File**: `packages/course-gen-platform/src/shared/utils/retry.ts`

```typescript
import { logger } from '../logger';

interface RetryOptions {
  maxRetries: number;
  delays: number[]; // [100, 200, 400] = exponential backoff
  onRetry?: (attempt: number, error: Error) => void;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < options.maxRetries) {
        const delay = options.delays[attempt] || options.delays[options.delays.length - 1];
        logger.warn('Retry attempt', { attempt: attempt + 1, delay, error: lastError.message });
        options.onRetry?.(attempt + 1, lastError);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed after ${options.maxRetries} retries: ${lastError!.message}`);
}
```

### Step 2: Enhance tRPC Router

**File**: `packages/course-gen-platform/src/server/routers/generation.ts`

Move **ALL** T011-T019 logic from Next.js route to tRPC `initiate` mutation:

```typescript
import { retryWithBackoff } from '../../shared/utils/retry';
import { getSupabaseAdmin } from '../../shared/supabase/admin';

// Tier priority mapping
const TIER_PRIORITY: Record<UserTier, number> = {
  FREE: 1,
  BASIC: 3,
  STANDARD: 5,
  TRIAL: 5,
  PREMIUM: 10,
};

export const generationRouter = router({
  // ... existing test endpoint ...

  initiate: instructorProcedure
    .use(createRateLimiter({ requests: 10, window: 60 }))
    .input(z.object({
      courseId: z.string().uuid(),
      webhookUrl: z.string().url().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      logger.info('Course generation request', {
        requestId,
        userId: ctx.user.id,
        tier: ctx.user.tier,
        courseId: input.courseId
      });

      try {
        // T013: Verify course ownership
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('*')
          .eq('id', input.courseId)
          .single();

        if (courseError || !course) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
        }

        if (course.user_id !== ctx.user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this course'
          });
        }

        // T014: Check concurrency limits
        const { data: concurrencyCheck } = await supabase.rpc('check_and_reserve_concurrency', {
          p_user_id: ctx.user.id,
          p_tier: ctx.user.tier
        });

        if (!concurrencyCheck?.allowed) {
          await supabase.from('system_metrics').insert({
            event_type: 'concurrency_limit_hit',
            severity: 'warn',
            user_id: ctx.user.id,
            metadata: { tier: ctx.user.tier, ...concurrencyCheck }
          });

          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: `Too many concurrent jobs. ${ctx.user.tier} tier allows ${concurrencyCheck.user_limit} concurrent course generation.`
          });
        }

        // T015: Determine job type
        const hasFiles = course.generation_progress?.files?.length > 0;
        const jobType = hasFiles ? JobType.DOCUMENT_PROCESSING : JobType.STRUCTURE_ANALYSIS;
        const priority = TIER_PRIORITY[ctx.user.tier as UserTier];

        // T016: Create BullMQ job
        const jobData = {
          jobType,
          organizationId: ctx.user.organizationId,
          courseId: input.courseId,
          userId: ctx.user.id,
          createdAt: new Date().toISOString(),
          webhookUrl: input.webhookUrl || null,
          // Include course data for worker
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
        };

        const job = await addJob(jobType, jobData, { priority });

        logger.info('Job created', { requestId, jobId: job.id, jobType, priority });

        // T017: Update progress with retry
        try {
          await retryWithBackoff(async () => {
            const { error } = await supabase.rpc('update_course_progress', {
              p_course_id: input.courseId,
              p_step_id: 1,
              p_status: 'completed',
              p_message: 'Инициализация завершена',
              p_metadata: {
                job_id: job.id as string,
                executor: 'orchestrator',
                tier: ctx.user.tier,
                priority,
                request_id: requestId
              }
            });

            if (error) throw error;
          }, { maxRetries: 3, delays: [100, 200, 400] });

        } catch (progressError) {
          // T018: Rollback job on RPC failure
          logger.error('Job rollback due to RPC failure', {
            requestId,
            jobId: job.id,
            error: progressError
          });

          await job.remove();
          await supabase.rpc('release_concurrency_slot', { p_user_id: ctx.user.id });

          await supabase.from('system_metrics').insert({
            event_type: 'job_rollback',
            severity: 'error',
            user_id: ctx.user.id,
            course_id: input.courseId,
            job_id: job.id as string,
            metadata: {
              reason: 'rpc_update_course_progress_failed',
              attempts: 3,
              last_error: String(progressError)
            }
          });

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Не удалось инициализировать генерацию курса. Попробуйте позже.'
          });
        }

        // T019: Success response
        logger.info('Course generation initiated successfully', {
          requestId,
          jobId: job.id,
          courseId: input.courseId
        });

        return {
          success: true,
          jobId: job.id as string,
          message: 'Генерация курса инициализирована',
          courseId: input.courseId
        };

      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error('Unexpected error in generation.initiate', {
          requestId,
          error: error instanceof Error ? error.message : String(error)
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error'
        });
      }
    }),

  // ... existing uploadFile endpoint ...
});
```

### Step 3: Simplify Next.js Route (Thin Proxy)

**File**: `courseai-next/app/api/coursegen/generate/route.ts`

**Replace entire file** with thin proxy:

```typescript
/**
 * POST /api/coursegen/generate
 *
 * Thin proxy to tRPC generation.initiate endpoint.
 * All business logic is in packages/course-gen-platform/src/server/routers/generation.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Call tRPC endpoint
    // NOTE: In production, use proper tRPC client setup
    const tRPCUrl = process.env.TRPC_URL || 'http://localhost:3001/trpc';
    const response = await fetch(`${tRPCUrl}/generation.initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': request.headers.get('Authorization') || ''
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });

  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Step 4: Add Dependencies

```bash
cd packages/course-gen-platform
pnpm add nanoid
```

### Step 5: Update Environment Variables

**File**: `packages/course-gen-platform/.env`

```env
# API Server (tRPC)
API_PORT=3001

# Supabase (cloud)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<key>

# Redis
REDIS_URL=redis://localhost:6379
```

**File**: `courseai-next/.env.local`

```env
# tRPC Backend URL
TRPC_URL=http://localhost:3001/trpc

# Supabase (for auth only)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<key>
```

---

## Testing

### Test 1: TypeScript Client (Next.js)

```typescript
// Frontend calls tRPC directly
import { trpc } from '@/lib/trpc';

const result = await trpc.generation.initiate.mutate({
  courseId: 'uuid-here',
  webhookUrl: 'https://optional.com/webhook'
});
```

### Test 2: Direct tRPC Call (PHP LMS Example)

```php
<?php
// PHP LMS calling tRPC endpoint
$jwt_token = getSupabaseJWT(); // Get from Supabase Auth

$ch = curl_init('https://api.megacampus.ai/trpc/generation.initiate');
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $jwt_token,
    'Content-Type: application/json'
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'courseId' => $course_uuid,
    'webhookUrl' => 'https://lms.example.com/webhook'
]));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

$response = curl_exec($ch);
$data = json_decode($response, true);

if ($data['success']) {
    echo "Job ID: " . $data['jobId'];
}
?>
```

### Test 3: Python Client Example

```python
import requests

def initiate_course_generation(jwt_token: str, course_id: str):
    response = requests.post(
        'https://api.megacampus.ai/trpc/generation.initiate',
        headers={
            'Authorization': f'Bearer {jwt_token}',
            'Content-Type': 'application/json'
        },
        json={'courseId': course_id}
    )
    return response.json()
```

---

## Verification Checklist

- [ ] Retry utility created with exponential backoff
- [ ] tRPC `generation.initiate` has full T011-T019 logic
- [ ] Next.js route is thin proxy (<20 lines)
- [ ] Concurrency limits enforced (429 on excess)
- [ ] Progress updates with retry logic
- [ ] Job rollback on RPC failure (Saga pattern)
- [ ] Structured logging with request IDs
- [ ] Type definitions exported for TypeScript clients
- [ ] LMS integration examples documented
- [ ] `docs/API.md` updated with multi-client examples

---

## Benefits

✅ **Single Source of Truth**: Business logic in one place (tRPC)
✅ **No Duplication**: Next.js route = 20 lines instead of 361
✅ **Type-Safe**: TypeScript clients get full inference
✅ **Multi-Client Ready**: PHP/Ruby/Python can call tRPC via HTTP
✅ **Maintainable**: Changes in one place propagate everywhere
✅ **Testable**: Backend logic can be unit tested independently
✅ **Future-Proof**: Optional REST wrapper can be added later if needed

---

## Future Enhancements (Stage N)

If LMS partners request RESTful endpoints:

1. Create thin Express wrapper:
   ```typescript
   app.post('/api/v1/courses/:id/generate', async (req, res) => {
     // Call tRPC internally
     const result = await trpc.generation.initiate(req.body);
     res.json(result);
   });
   ```

2. Add OpenAPI/Swagger documentation
3. Generate client SDKs for multiple languages

See `docs/LMS-INTEGRATION-ROADMAP.md` for details.

---

## Dependencies

**Requires**:
- T032 complete (cloud Supabase configured)

**Unblocks**:
- T020-T031 (worker can use consolidated API)
- LMS integration (PHP/Ruby can call tRPC)
- Mobile app integration (any HTTP client)
