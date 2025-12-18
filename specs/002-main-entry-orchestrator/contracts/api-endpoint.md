# API Contract: POST /api/coursegen/generate

**Version**: 1.0
**Status**: Draft
**Last Updated**: 2025-10-20

## Overview

This endpoint replaces the n8n Main Entry webhook, accepting course generation requests from the Next.js frontend and queuing appropriate BullMQ jobs based on file presence.

---

## Endpoint Details

**URL**: `/api/coursegen/generate`

**Method**: `POST`

**Content-Type**: `application/json`

**Authentication**: JWT Bearer token (Supabase Auth)

---

## Request

### Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Authorization` | string | ✅ Yes | Bearer token from Supabase Auth session |
| `Content-Type` | string | ✅ Yes | Must be `application/json` |

**Example**:
```http
POST /api/coursegen/generate HTTP/1.1
Host: api.megacampusai.com
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Body

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `courseId` | string | ✅ Yes | Valid UUID | Course ID to generate |
| `webhookUrl` | string | ❌ No | Valid URL or null | Optional callback URL for progress updates |

**JSON Schema**:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["courseId"],
  "properties": {
    "courseId": {
      "type": "string",
      "format": "uuid",
      "description": "UUID of the course to generate"
    },
    "webhookUrl": {
      "type": ["string", "null"],
      "format": "uri",
      "description": "Optional callback URL for progress updates"
    }
  },
  "additionalProperties": false
}
```

**Example**:
```json
{
  "courseId": "550e8400-e29b-41d4-a716-446655440000",
  "webhookUrl": null
}
```

---

## Response

### Success (200 OK)

**Status Code**: `200 OK`

**Body**:
```typescript
{
  success: true,
  jobId: string,
  message?: string
}
```

**Example**:
```json
{
  "success": true,
  "jobId": "course-gen-1234567890",
  "message": "Генерация курса инициализирована"
}
```

---

### Error Responses

#### 400 Bad Request - Invalid Payload

**Status Code**: `400 Bad Request`

**Causes**:
- Missing `courseId` field
- Invalid UUID format
- Invalid JSON body

**Body**:
```typescript
{
  error: string,
  details?: Record<string, unknown>
}
```

**Example**:
```json
{
  "error": "Invalid courseId format",
  "details": {
    "field": "courseId",
    "value": "not-a-uuid",
    "expected": "Valid UUID string"
  }
}
```

---

#### 401 Unauthorized - Missing or Invalid Token

**Status Code**: `401 Unauthorized`

**Causes**:
- Missing `Authorization` header
- Invalid JWT token
- Expired token
- Token signature verification failed

**Body**:
```typescript
{
  error: string
}
```

**Example**:
```json
{
  "error": "Unauthorized: Invalid or missing authentication token"
}
```

---

#### 403 Forbidden - Course Ownership Violation

**Status Code**: `403 Forbidden`

**Causes**:
- Course belongs to different user
- User trying to access another user's course

**Body**:
```typescript
{
  error: string
}
```

**Example**:
```json
{
  "error": "Forbidden: You do not have access to this course"
}
```

---

#### 404 Not Found - Course Not Found

**Status Code**: `404 Not Found`

**Causes**:
- `courseId` does not exist in database
- Course was deleted

**Body**:
```typescript
{
  error: string
}
```

**Example**:
```json
{
  "error": "Course not found"
}
```

---

#### 429 Too Many Requests - Concurrency Limit

**Status Code**: `429 Too Many Requests`

**Causes**:
- User exceeded per-tier concurrent job limit
- Global concurrency limit reached

**Body**:
```typescript
{
  error: string,
  details: {
    tier: string,
    user_limit: number,
    current_user_jobs: number,
    global_limit?: number,
    global_active_jobs?: number
  }
}
```

**Example (User Limit)**:
```json
{
  "error": "Too many concurrent jobs. FREE tier allows 1 concurrent course generation.",
  "details": {
    "tier": "FREE",
    "user_limit": 1,
    "current_user_jobs": 1
  }
}
```

**Example (Global Limit)**:
```json
{
  "error": "System at capacity. Please try again in a few minutes.",
  "details": {
    "tier": "BASIC",
    "user_limit": 2,
    "current_user_jobs": 1,
    "global_limit": 3,
    "global_active_jobs": 3
  }
}
```

---

#### 500 Internal Server Error - System Failure

**Status Code**: `500 Internal Server Error`

**Causes**:
- RPC `update_course_progress` failed after 3 retries
- Redis connection failure
- BullMQ job creation failed

**Body**:
```typescript
{
  error: string
}
```

**Example**:
```json
{
  "error": "Не удалось инициализировать генерацию курса. Попробуйте позже."
}
```

**Note**: User-facing message in Russian for frontend compatibility. Internal error details logged via Pino and written to `system_metrics` table.

---

## Business Logic

### Authentication Flow

1. Extract JWT token from `Authorization: Bearer {token}` header
2. Validate token using Supabase Auth: `supabase.auth.getUser(token)`
3. Extract `userId` from validated JWT
4. Extract `tier` from `user.user_metadata.tier` or query `user_profiles` table
5. If validation fails → Return 401 Unauthorized

### Authorization Flow

1. Query `courses` table WHERE `id = courseId`
2. Check if `course.user_id === userId` from JWT
3. If mismatch → Return 403 Forbidden
4. If not found → Return 404 Not Found

### Concurrency Check Flow

1. Get user tier limit: `TIER_LIMITS[tier]`
2. Get global concurrency limit from config (hardcoded `3` in Stage 1)
3. Execute Redis Lua script for atomic check-and-reserve:
   - Check `concurrency:user:{userId}` < user_limit
   - Check `concurrency:global` < global_limit
   - If both pass: INCR both counters, return success
   - If either fails: return limit type
4. If user limit exceeded → Return 429 with user_limit details
5. If global limit exceeded → Return 429 with global_limit details

### Workflow Branching Logic

1. Query `generation_progress.files` from course record
2. Check if `files` is non-empty array:
   - **Has files** → Queue `DOCUMENT_PROCESSING` job
   - **No files** (null or empty array) → Queue `STRUCTURE_ANALYSIS` job
3. Set job priority based on tier:
   - FREE: priority = 1
   - BASIC: priority = 3
   - STANDARD: priority = 5
   - TRIAL: priority = 5
   - PREMIUM: priority = 10

### Job Creation Flow

1. Prepare job data:
   ```typescript
   {
     jobType: hasFiles ? 'DOCUMENT_PROCESSING' : 'STRUCTURE_ANALYSIS',
     organizationId: course.organization_id || userId,
     courseId: courseId,
     userId: userId,
     createdAt: new Date().toISOString(),
     // Include all course fields for worker context
     title: course.title,
     language: course.language,
     style: course.style,
     course_description: course.course_description,
     target_audience: course.target_audience,
     difficulty: course.difficulty,
     lesson_duration_minutes: course.lesson_duration_minutes,
     learning_outcomes: course.learning_outcomes,
     estimated_lessons: course.estimated_lessons,
     estimated_sections: course.estimated_sections,
     content_strategy: course.content_strategy,
     output_formats: course.output_formats
   }
   ```

2. Add job to BullMQ:
   ```typescript
   const job = await queue.add(jobType, jobData, {
     priority: TIER_PRIORITY[tier],
     jobId: `course-gen-${Date.now()}-${nanoid(6)}`
   });
   ```

3. Store `jobId` for subsequent operations

### Progress Update Flow (Saga Pattern)

1. Call RPC `update_course_progress` with retry:
   ```typescript
   await retryWithBackoff(async () => {
     return await supabase.rpc('update_course_progress', {
       p_course_id: courseId,
       p_step_id: 1,
       p_status: 'completed',
       p_message: 'Инициализация завершена',
       p_metadata: {
         job_id: jobId,
         executor: 'orchestrator',
         tier: tier,
         priority: TIER_PRIORITY[tier]
       }
     });
   }, {
     attempts: 3,
     backoff: [100, 200, 400] // exponential backoff in ms
   });
   ```

2. On retry failure → Execute compensation:
   - Remove BullMQ job: `await job.remove()`
   - Release concurrency slots (Redis DECR)
   - Write to `system_metrics`:
     ```typescript
     await supabase.from('system_metrics').insert({
       event_type: 'job_rollback',
       severity: 'error',
       user_id: userId,
       course_id: courseId,
       job_id: jobId,
       metadata: {
         reason: 'rpc_update_course_progress_failed',
         attempts: 3,
         last_error: error.message
       }
     });
     ```
   - Return 500 Internal Server Error

3. On success → Return 200 OK with jobId

---

## Rate Limiting

**Per-User Limits** (enforced by concurrency check):
- FREE: 1 concurrent job
- BASIC: 2 concurrent jobs
- STANDARD: 3 concurrent jobs
- TRIAL: 5 concurrent jobs
- PREMIUM: 5 concurrent jobs

**Global Limit** (shared across all users):
- Stage 1: Hardcoded to `3` concurrent jobs
- Stage 8: Dynamic (3-10) based on system load

**Time Window**: Not time-based, count-based (concurrent jobs)

**429 Response Headers** (optional for Stage 2+):
```
Retry-After: 60
X-RateLimit-Limit: 1
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1698765432
```

---

## Security

### Authentication

- **Method**: JWT Bearer token from Supabase Auth
- **Validation**: `supabase.auth.getUser(token)`
- **Token Location**: `Authorization` header
- **Token Format**: `Bearer {access_token}`

### Authorization

- **Row-Level Security**: Course ownership verified via RLS policy
- **Manual Check**: `course.user_id === auth.uid()` in application layer
- **Forbidden Actions**:
  - Accessing another user's course
  - Generating course without authentication

### Data Sanitization

- **Input Validation**: Zod schema validation for all fields
- **UUID Validation**: Reject malformed UUIDs
- **URL Validation**: Validate `webhookUrl` format if provided

### Secrets

- **JWT Signing Key**: Managed by Supabase (not exposed)
- **Database Credentials**: Service role key (env variable)
- **Redis Password**: Stored in env variable

---

## Performance

### Latency Targets

- **P50**: < 200ms (excluding job processing)
- **P95**: < 500ms
- **P99**: < 1000ms

### Optimization Strategies

1. **Redis Lua Script**: Atomic concurrency check (single round-trip)
2. **Early Validation**: Fail fast on bad input before database queries
3. **Async Job Queue**: Return immediately after queueing (fire-and-forget)
4. **RPC Function**: Single round-trip for progress update (vs 3+ client-side)

### Scalability

- **Horizontal Scaling**: Stateless endpoint, can run on multiple instances
- **Redis**: Handles millions of ops/second for concurrency tracking
- **BullMQ**: Distributed queue scales with Redis cluster
- **Database**: Supabase handles concurrent connections

---

## Observability

### Logging

All requests logged with Pino structured JSON:

```typescript
logger.child({
  requestId: nanoid(),
  userId: userId,
  tier: tier,
  courseId: courseId,
  endpoint: '/api/coursegen/generate'
}).info('Course generation request received');
```

### Metrics

Written to `system_metrics` table:
- `job_rollback` - RPC failure after retries
- `concurrency_limit_hit` - 429 responses
- `rpc_retry_exhausted` - All 3 RPC attempts failed

### Error Tracking

- **Pino Logs**: All errors with stack traces
- **System Metrics**: Critical errors to database
- **Stage 8 Dashboard**: Aggregated metrics and alerts

---

## Testing

### Unit Tests

```typescript
describe('POST /api/coursegen/generate', () => {
  it('should return 200 OK with valid request', async () => {
    const response = await request(app)
      .post('/api/coursegen/generate')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ courseId: validCourseId });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.jobId).toBeDefined();
  });

  it('should return 401 for missing token', async () => {
    const response = await request(app)
      .post('/api/coursegen/generate')
      .send({ courseId: validCourseId });

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Unauthorized');
  });

  it('should return 403 for course owned by different user', async () => {
    const response = await request(app)
      .post('/api/coursegen/generate')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ courseId: userBCourseId });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('Forbidden');
  });

  it('should return 429 when user exceeds concurrency limit', async () => {
    // Start job 1 for FREE tier user
    await request(app)
      .post('/api/coursegen/generate')
      .set('Authorization', `Bearer ${freeUserToken}`)
      .send({ courseId: course1Id });

    // Attempt job 2 (should fail for FREE tier with limit 1)
    const response = await request(app)
      .post('/api/coursegen/generate')
      .set('Authorization', `Bearer ${freeUserToken}`)
      .send({ courseId: course2Id });

    expect(response.status).toBe(429);
    expect(response.body.details.tier).toBe('FREE');
    expect(response.body.details.user_limit).toBe(1);
  });
});
```

### Integration Tests

```typescript
describe('Course Generation Integration', () => {
  it('should create job and update progress', async () => {
    const response = await request(app)
      .post('/api/coursegen/generate')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ courseId: courseId });

    expect(response.status).toBe(200);

    // Verify job in BullMQ
    const job = await queue.getJob(response.body.jobId);
    expect(job).toBeDefined();
    expect(job.data.courseId).toBe(courseId);

    // Verify progress updated in database
    const { data: course } = await supabase
      .from('courses')
      .select('generation_progress')
      .eq('id', courseId)
      .single();

    expect(course.generation_progress.steps[0].status).toBe('completed');
    expect(course.generation_progress.current_step).toBe(1);
  });
});
```

### Contract Tests

```typescript
describe('API Contract Validation', () => {
  it('should match OpenAPI schema for 200 response', () => {
    const response = {
      success: true,
      jobId: 'course-gen-1234',
      message: 'Генерация курса инициализирована'
    };

    expect(response).toMatchSchema(schemas.post_coursegen_generate_200);
  });

  it('should match OpenAPI schema for 429 response', () => {
    const response = {
      error: 'Too many concurrent jobs',
      details: {
        tier: 'FREE',
        user_limit: 1,
        current_user_jobs: 1
      }
    };

    expect(response).toMatchSchema(schemas.post_coursegen_generate_429);
  });
});
```

---

## Frontend Integration

### React Example (Next.js App Router)

```typescript
'use client';

import { useSupabase } from '@/lib/supabase/client';
import { toast } from 'sonner';

export function GenerateCourseButton({ courseId }: { courseId: string }) {
  const supabase = useSupabase();

  async function handleGenerate() {
    try {
      // Get JWT token from Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Необходима авторизация');
        return;
      }

      // Call backend API
      const response = await fetch('/api/coursegen/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          courseId: courseId,
          webhookUrl: null // Optional
        })
      });

      if (!response.ok) {
        const error = await response.json();

        if (response.status === 429) {
          toast.error(`Превышен лимит: ${error.details.tier} (${error.details.user_limit} одновременных курсов)`);
        } else {
          toast.error(error.error || 'Ошибка инициализации генерации');
        }
        return;
      }

      const result = await response.json();
      toast.success('Генерация курса запущена!');

      // Redirect to progress page
      window.location.href = `/courses/${courseId}/progress`;

    } catch (error) {
      console.error('Failed to start generation:', error);
      toast.error('Не удалось запустить генерацию курса');
    }
  }

  return (
    <button onClick={handleGenerate}>
      Начать генерацию
    </button>
  );
}
```

---

## Changelog

### Version 1.0 (2025-10-20)

- Initial API contract specification
- JWT Bearer authentication
- Concurrency limit enforcement
- Saga pattern for RPC failures
- Frontend compatibility maintained

---

## References

- **Feature Spec**: `specs/002-main-entry-orchestrator/spec.md`
- **Data Model**: `specs/002-main-entry-orchestrator/data-model.md`
- **Research**: `specs/002-main-entry-orchestrator/research.md`
- **Pricing Tiers**: `/docs/PRICING-TIERS.md` (if exists)
- **BullMQ Docs**: https://docs.bullmq.io/
- **Supabase Auth**: https://supabase.com/docs/guides/auth
