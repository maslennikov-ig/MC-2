# tRPC Contract: generation.initiate

**Endpoint**: `generation.initiate`
**Type**: Mutation
**Handler**: `packages/course-gen-platform/src/trpc/routers/generation.ts`

## 1. Overview

Initiates Stage 5 course structure generation by creating a BullMQ `STRUCTURE_GENERATION` job. This endpoint is called after Stage 4 analysis completes to generate the complete course JSON structure. Note: Generation ALWAYS requires analysis_result from Analyze - even minimal user input (title only) goes through Analyze first.

**Related Endpoints**:
- `generation.getStatus` - Poll generation progress
- `generation.getResult` - Retrieve generated course structure

---

## 2. Input Schema

```typescript
import { z } from 'zod';

const GenerateInputSchema = z.object({
  courseId: z.string().uuid()
    .describe('Course UUID to generate structure for'),
});

type GenerateInput = z.infer<typeof GenerateInputSchema>;
```

**Example Request**:
```typescript
const result = await trpc.generation.initiate.mutate({
  courseId: '123e4567-e89b-12d3-a456-426614174000',
});
```

---

## 3. Authorization

### 3.1 Authentication
- **Required**: JWT bearer token in Authorization header
- **Claims**: `user_id`, `role`, `organization_id` (custom claims from Supabase Auth)

### 3.2 Authorization Rules

**RLS Enforcement**:
```sql
-- User must own the course OR be Admin/Instructor in organization
SELECT EXISTS (
  SELECT 1 FROM courses
  WHERE id = courseId
  AND (
    user_id = auth.uid() OR
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'instructor')
    )
  )
)
```

**Validation Checks**:
1. Course must exist
2. Course status must be `analyzing_task_complete` or `creating` (allow retry)
3. User must have generation permission for organization (tier-based)
4. Concurrent generation limit not exceeded (tier-based)

**Error Codes**:
- `UNAUTHORIZED` (401): Invalid/missing JWT token
- `FORBIDDEN` (403): User does not own course
- `NOT_FOUND` (404): Course not found
- `CONFLICT` (409): Course already generating or generation_status != ready
- `TOO_MANY_REQUESTS` (429): Concurrent generation limit exceeded

---

## 4. Business Logic

### 4.1 Pre-Generation Validation

```typescript
// Step 1: Verify course exists and user authorized
const course = await supabase
  .from('courses')
  .select('id, user_id, organization_id, status, generation_status, analysis_result, title, language, style, settings')
  .eq('id', courseId)
  .single();

if (!course) throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });

// Step 2: Check RLS (user owns course OR admin/instructor)
// Handled by Supabase RLS policies automatically

// Step 3: Validate generation status
if (course.generation_status === 'generating') {
  throw new TRPCError({
    code: 'CONFLICT',
    message: 'Course generation already in progress',
  });
}

// Step 4: Check concurrent generation limits (tier-based)
const concurrencyCheck = await checkConcurrencyLimit(
  course.user_id,
  course.organization_id
);

if (!concurrencyCheck.allowed) {
  throw new TRPCError({
    code: 'TOO_MANY_REQUESTS',
    message: `Concurrent generation limit exceeded. Tier: ${concurrencyCheck.tier}, Limit: ${concurrencyCheck.limit}`,
  });
}
```

### 4.2 Job Creation

```typescript
// Step 5: Prepare GenerationJobInput
const jobInput: GenerationJobInput = {
  course_id: course.id,
  organization_id: course.organization_id,
  user_id: course.user_id,

  analysis_result: course.analysis_result, // Should ALWAYS be present - Analyze runs before Generation

  frontend_parameters: {
    course_title: course.title, // ONLY guaranteed field
    language: course.language,
    style: course.style,
    target_audience: course.settings?.target_audience,
    desired_lessons_count: course.settings?.desired_lessons_count,
    desired_modules_count: course.settings?.desired_modules_count,
    lesson_duration_minutes: course.settings?.lesson_duration_minutes,
    learning_outcomes: course.settings?.learning_outcomes,
  },

  vectorized_documents: await hasVectorizedDocuments(course.id),
  document_summaries: await getDocumentSummaries(course.id),
};

// Step 6: Create BullMQ job
const job = await generationQueue.add(
  'STRUCTURE_GENERATION',
  {
    jobId: nanoid(),
    input: jobInput,
    metadata: {
      created_at: new Date().toISOString(),
      priority: getTierPriority(concurrencyCheck.tier),
      attempt: 1,
    },
  },
  {
    priority: getTierPriority(concurrencyCheck.tier),
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  }
);

// Step 7: Update course status
await supabase
  .from('courses')
  .update({
    generation_status: 'generating',
    status: 'generating_structure',
    updated_at: new Date().toISOString(),
  })
  .eq('id', courseId);

// Step 8: Increment concurrency counter
await incrementConcurrencyCounter(course.user_id, course.organization_id);
```

### 4.3 Tier-Based Configuration

| Tier | Priority | Concurrent Limit |
|------|----------|------------------|
| TRIAL | 5 | 5 |
| FREE | 1 | 1 |
| BASIC | 2 | 2 |
| STANDARD | 5 | 5 |
| PREMIUM | 10 | 10 |

---

## 5. Output Schema

```typescript
const GenerateOutputSchema = z.object({
  jobId: z.string()
    .describe('BullMQ job ID for tracking'),

  courseId: z.string().uuid()
    .describe('Course UUID'),

  status: z.enum(['queued', 'processing'])
    .describe('Initial job status'),

  message: z.string()
    .describe('User-friendly status message'),

  estimatedDurationSeconds: z.number().int().positive()
    .describe('Estimated time to completion'),
});

type GenerateOutput = z.infer<typeof GenerateOutputSchema>;
```

**Example Response**:
```json
{
  "jobId": "job_abc123xyz",
  "courseId": "123e4567-e89b-12d3-a456-426614174000",
  "status": "queued",
  "message": "Генерация структуры курса начата",
  "estimatedDurationSeconds": 120
}
```

---

## 6. Error Handling

### 6.1 Error Response Format

```typescript
interface TRPCErrorResponse {
  error: {
    code: string; // TRPC error code
    message: string; // User-friendly message
    data?: {
      zodError?: ZodError; // If validation failed
      details?: string; // Additional context
    };
  };
}
```

### 6.2 Common Errors

**1. Unauthorized** (401):
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

**2. Forbidden** (403):
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to generate this course"
  }
}
```

**3. Course Not Found** (404):
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Course not found"
  }
}
```

**4. Already Generating** (409):
```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Course generation already in progress"
  }
}
```

**5. Concurrency Limit** (429):
```json
{
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Concurrent generation limit exceeded. Tier: STANDARD, Limit: 5"
  }
}
```

**6. Validation Error** (400):
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid input",
    "data": {
      "zodError": {
        "issues": [
          {
            "path": ["courseId"],
            "message": "Invalid UUID format"
          }
        ]
      }
    }
  }
}
```

---

## 7. Integration Examples

### 7.1 Frontend (Next.js with tRPC)

```typescript
'use client';

import { trpc } from '@/lib/trpc';
import { useState } from 'react';

export function GenerateCourseButton({ courseId }: { courseId: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const generateMutation = trpc.generation.initiate.useMutation();

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await generateMutation.mutateAsync({ courseId });
      console.log('Generation started:', result);

      // Start polling for status
      pollGenerationStatus(result.jobId);
    } catch (error) {
      if (error.data?.code === 'TOO_MANY_REQUESTS') {
        alert('Вы достигли лимита одновременных генераций');
      } else {
        alert(`Ошибка: ${error.message}`);
      }
      setIsGenerating(false);
    }
  };

  return (
    <button onClick={handleGenerate} disabled={isGenerating}>
      {isGenerating ? 'Генерация...' : 'Сгенерировать структуру'}
    </button>
  );
}
```

### 7.2 Backend Worker (BullMQ Handler)

```typescript
import { Job } from 'bullmq';
import { GenerationJobData } from '@megacampus/shared-types';

export async function handleStructureGeneration(job: Job<GenerationJobData>) {
  const { input, metadata } = job.data;

  logger.info('Starting structure generation', {
    courseId: input.course_id,
    attempt: metadata.attempt,
  });

  try {
    // Step 1: Run LangGraph orchestration workflow
    const result = await generationOrchestrator.execute(input);

    // Step 2: Validate result
    const validated = CourseStructureSchema.safeParse(result.course_structure);
    if (!validated.success) {
      throw new ValidationError('Invalid course structure', validated.error);
    }

    // Step 3: Save to database
    await supabase
      .from('courses')
      .update({
        course_structure: validated.data,
        generation_metadata: result.generation_metadata,
        status: 'content_generated',
        generation_status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.course_id);

    // Step 4: Decrement concurrency counter
    await decrementConcurrencyCounter(input.user_id, input.organization_id);

    logger.info('Structure generation complete', {
      courseId: input.course_id,
      totalLessons: validated.data.sections.reduce(
        (sum, s) => sum + s.lessons.length,
        0
      ),
      cost: result.generation_metadata.cost_usd,
    });

    return { success: true };
  } catch (error) {
    logger.error('Structure generation failed', {
      courseId: input.course_id,
      error: error.message,
    });

    // Update course status to failed
    await supabase
      .from('courses')
      .update({
        status: 'generation_failed',
        generation_status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.course_id);

    throw error; // Trigger BullMQ retry
  }
}
```

---

## 8. Testing

### 8.1 Contract Test

**Location**: `packages/course-gen-platform/tests/contract/generation.initiate.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createCallerFactory } from '@trpc/server';
import { appRouter } from '@/trpc/router';

describe('generation.initiate contract', () => {
  let caller: ReturnType<typeof createCallerFactory>;

  beforeAll(async () => {
    // Setup test database and auth
    const factory = createCallerFactory(appRouter);
    caller = factory({
      user: { id: 'test-user-id', role: 'instructor' },
    });
  });

  it('should create generation job for valid course', async () => {
    const result = await caller.generation.initiate({
      courseId: 'test-course-id',
    });

    expect(result).toMatchObject({
      jobId: expect.any(String),
      courseId: 'test-course-id',
      status: expect.stringMatching(/queued|processing/),
      message: expect.any(String),
      estimatedDurationSeconds: expect.any(Number),
    });
  });

  it('should reject invalid UUID', async () => {
    await expect(
      caller.generation.initiate({ courseId: 'invalid-uuid' })
    ).rejects.toThrow('Invalid UUID format');
  });

  it('should reject unauthorized user', async () => {
    const unauthCaller = factory({ user: null });

    await expect(
      unauthCaller.generation.initiate({ courseId: 'test-course-id' })
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('should enforce concurrency limits', async () => {
    // Create 6 concurrent jobs (exceeds STANDARD tier limit of 5)
    const jobs = Array.from({ length: 6 }, (_, i) =>
      caller.generation.initiate({ courseId: `course-${i}` })
    );

    await expect(Promise.all(jobs)).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
  });
});
```

---

## 9. RLS Policy (Supabase)

```sql
-- Policy: Users can initiate generation for their own courses
CREATE POLICY "Users can generate own courses"
ON courses FOR UPDATE
USING (
  user_id = auth.uid() OR
  organization_id IN (
    SELECT organization_id FROM user_organizations
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'instructor')
  )
);

-- Policy: SuperAdmin can generate any course
CREATE POLICY "SuperAdmin can generate any course"
ON courses FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role = 'superadmin'
  )
);
```

---

## 10. Monitoring & Observability

### 10.1 Structured Logs

```typescript
logger.info('generation.initiate called', {
  courseId,
  userId: ctx.user.id,
  organizationId: course.organization_id,
  tier: concurrencyCheck.tier,
  currentConcurrent: concurrencyCheck.current,
});

logger.info('generation job created', {
  jobId: job.id,
  courseId,
  priority: getTierPriority(concurrencyCheck.tier),
  estimatedDuration: 120,
});
```

### 10.2 Metrics

- `generation.initiate.calls` (counter): Total endpoint calls
- `generation.initiate.duration` (histogram): Endpoint latency
- `generation.initiate.errors` (counter): Errors by code
- `generation.queue.depth` (gauge): Current queue depth
- `generation.concurrent.count` (gauge): Active generations per tier

---

## 11. Related Documentation

- [data-model.md](../data-model.md) - GenerationJobInput schema
- [generation.getStatus.tRPC.md](generation.getStatus.tRPC.md) - Status polling
- [Stage 1 Main Entry](../../../002-main-entry-orchestrator/) - Similar patterns
- [BullMQ Documentation](https://docs.bullmq.io/) - Queue configuration
