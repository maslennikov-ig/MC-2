# tRPC Contract: generation.getStatus

**Endpoint**: `generation.getStatus`
**Type**: Query
**Handler**: `packages/course-gen-platform/src/trpc/routers/generation.ts`

## 1. Overview

Polls the current status of an ongoing course structure generation. Returns generation progress, current phase, and estimated time remaining. Frontend uses this endpoint for progress bar updates and completion detection.

**Related Endpoints**:
- `generation.initiate` - Start generation
- `generation.getResult` - Retrieve completed structure

---

## 2. Input Schema

```typescript
import { z } from 'zod';

const GetStatusInputSchema = z.object({
  courseId: z.string().uuid()
    .describe('Course UUID to check status for'),
});

type GetStatusInput = z.infer<typeof GetStatusInputSchema>;
```

**Example Request**:
```typescript
const status = await trpc.generation.getStatus.query({
  courseId: '123e4567-e89b-12d3-a456-426614174000',
});
```

---

## 3. Authorization

### 3.1 Authentication
- **Required**: JWT bearer token in Authorization header
- **Claims**: `user_id`, `role`, `organization_id`

### 3.2 Authorization Rules

**RLS Enforcement**:
```sql
-- User must own the course OR be in same organization
SELECT EXISTS (
  SELECT 1 FROM courses
  WHERE id = courseId
  AND (
    user_id = auth.uid() OR
    organization_id IN (
      SELECT organization_id FROM user_organizations
      WHERE user_id = auth.uid()
    )
  )
)
```

**Error Codes**:
- `UNAUTHORIZED` (401): Invalid/missing JWT token
- `FORBIDDEN` (403): User does not have access to course
- `NOT_FOUND` (404): Course not found

---

## 4. Business Logic

### 4.1 Status Retrieval

```typescript
// Step 1: Fetch course with generation metadata
const course = await supabase
  .from('courses')
  .select(`
    id,
    status,
    generation_status,
    generation_metadata,
    created_at,
    updated_at
  `)
  .eq('id', courseId)
  .single();

if (!course) {
  throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
}

// Step 2: Determine current phase and progress
const generationState = determineGenerationState(
  course.status,
  course.generation_status,
  course.generation_metadata
);

// Step 3: Calculate estimated time remaining
const estimatedRemaining = calculateEstimatedTimeRemaining(
  generationState.phase,
  course.created_at,
  course.updated_at
);

// Step 4: Build response
return {
  courseId: course.id,
  status: generationState.status,
  phase: generationState.phase,
  progress: generationState.progress,
  message: generationState.message,
  estimatedRemainingSeconds: estimatedRemaining,
  startedAt: course.created_at,
  lastUpdatedAt: course.updated_at,
  metadata: generationState.metadata,
};
```

### 4.2 Generation State Machine

```typescript
type GenerationStatus =
  | 'idle'           // Not started
  | 'queued'         // In BullMQ queue
  | 'generating'     // Processing
  | 'completed'      // Success
  | 'failed'         // Error
  | 'cancelled';     // User cancelled

type GenerationPhase =
  | 'metadata'       // Phase 1: Metadata generation
  | 'sections'       // Phase 2: Section batches
  | 'validation'     // Phase 3: Quality validation
  | 'saving';        // Phase 4: Database commit

function determineGenerationState(
  courseStatus: string,
  generationStatus: GenerationStatus,
  generationMetadata: GenerationMetadata | null
): GenerationState {
  // Case 1: Not started
  if (generationStatus === 'idle') {
    return {
      status: 'idle',
      phase: null,
      progress: 0,
      message: 'Генерация не начата',
      metadata: null,
    };
  }

  // Case 2: Queued
  if (generationStatus === 'queued') {
    return {
      status: 'queued',
      phase: null,
      progress: 0,
      message: 'Ожидание в очереди',
      metadata: null,
    };
  }

  // Case 3: Generating (in progress)
  if (generationStatus === 'generating' && generationMetadata) {
    const phase = determineCurrentPhase(generationMetadata);
    const progress = calculateProgress(phase, generationMetadata);

    return {
      status: 'generating',
      phase,
      progress,
      message: getPhaseMessage(phase, progress),
      metadata: {
        batchesCompleted: generationMetadata.batch_count || 0,
        totalBatches: generationMetadata.total_batches || 8,
        currentModel: getCurrentModel(phase, generationMetadata),
        qualityScore: generationMetadata.quality_scores?.overall,
      },
    };
  }

  // Case 4: Completed
  if (generationStatus === 'completed') {
    return {
      status: 'completed',
      phase: 'saving',
      progress: 100,
      message: 'Генерация завершена',
      metadata: {
        totalLessons: generationMetadata?.total_lessons,
        totalSections: generationMetadata?.total_sections,
        cost: generationMetadata?.cost_usd,
        duration: generationMetadata?.duration_ms?.total,
        qualityScore: generationMetadata?.quality_scores?.overall,
      },
    };
  }

  // Case 5: Failed
  if (generationStatus === 'failed') {
    return {
      status: 'failed',
      phase: generationMetadata?.last_phase || null,
      progress: generationMetadata?.last_progress || 0,
      message: 'Ошибка генерации',
      metadata: {
        error: generationMetadata?.error_message,
        retryable: generationMetadata?.retryable || false,
      },
    };
  }

  // Case 6: Cancelled
  if (generationStatus === 'cancelled') {
    return {
      status: 'cancelled',
      phase: null,
      progress: 0,
      message: 'Генерация отменена',
      metadata: null,
    };
  }

  throw new Error(`Unknown generation status: ${generationStatus}`);
}

function determineCurrentPhase(metadata: GenerationMetadata): GenerationPhase {
  // Check which phase has most recent activity
  if (metadata.duration_ms?.saving > 0) return 'saving';
  if (metadata.duration_ms?.validation > 0) return 'validation';
  if (metadata.duration_ms?.sections > 0) return 'sections';
  if (metadata.duration_ms?.metadata > 0) return 'metadata';
  return 'metadata'; // Default to first phase
}

function calculateProgress(
  phase: GenerationPhase,
  metadata: GenerationMetadata
): number {
  // Phase weights (total = 100%)
  const weights = {
    metadata: 10,   // 0-10%
    sections: 70,   // 10-80%
    validation: 15, // 80-95%
    saving: 5,      // 95-100%
  };

  const baseProgress = {
    metadata: 0,
    sections: 10,
    validation: 80,
    saving: 95,
  };

  // Calculate progress within current phase
  if (phase === 'sections') {
    const batchProgress = (metadata.batch_count || 0) / (metadata.total_batches || 8);
    return baseProgress.sections + (weights.sections * batchProgress);
  }

  if (phase === 'validation') {
    return baseProgress.validation + weights.validation * 0.5; // Assume 50% through validation
  }

  if (phase === 'saving') {
    return baseProgress.saving + weights.saving * 0.5; // Assume 50% through saving
  }

  return baseProgress[phase] || 0;
}

function getPhaseMessage(phase: GenerationPhase, progress: number): string {
  const messages = {
    metadata: 'Генерация метаданных курса',
    sections: `Генерация секций (${Math.floor((progress - 10) / 0.7)}% завершено)`,
    validation: 'Проверка качества',
    saving: 'Сохранение результатов',
  };

  return messages[phase] || 'Обработка';
}
```

---

## 5. Output Schema

```typescript
const GetStatusOutputSchema = z.object({
  courseId: z.string().uuid(),

  status: z.enum(['idle', 'queued', 'generating', 'completed', 'failed', 'cancelled'])
    .describe('Overall generation status'),

  phase: z.enum(['metadata', 'sections', 'validation', 'saving']).nullable()
    .describe('Current phase (null if not generating)'),

  progress: z.number().int().min(0).max(100)
    .describe('Progress percentage (0-100)'),

  message: z.string()
    .describe('User-friendly status message in Russian'),

  estimatedRemainingSeconds: z.number().int().min(0).nullable()
    .describe('Estimated time remaining (null if not generating)'),

  startedAt: z.string().datetime()
    .describe('ISO 8601 timestamp when generation started'),

  lastUpdatedAt: z.string().datetime()
    .describe('ISO 8601 timestamp of last status update'),

  metadata: z.object({
    // During generation
    batchesCompleted: z.number().int().optional(),
    totalBatches: z.number().int().optional(),
    currentModel: z.string().optional(),
    qualityScore: z.number().min(0).max(1).optional(),

    // After completion
    totalLessons: z.number().int().optional(),
    totalSections: z.number().int().optional(),
    cost: z.number().optional(),
    duration: z.number().int().optional(),

    // On failure
    error: z.string().optional(),
    retryable: z.boolean().optional(),
  }).nullable(),
});

type GetStatusOutput = z.infer<typeof GetStatusOutputSchema>;
```

**Example Response (Generating)**:
```json
{
  "courseId": "123e4567-e89b-12d3-a456-426614174000",
  "status": "generating",
  "phase": "sections",
  "progress": 45,
  "message": "Генерация секций (50% завершено)",
  "estimatedRemainingSeconds": 75,
  "startedAt": "2025-11-05T12:00:00.000Z",
  "lastUpdatedAt": "2025-11-05T12:01:15.000Z",
  "metadata": {
    "batchesCompleted": 4,
    "totalBatches": 8,
    "currentModel": "openai/gpt-oss-20b",
    "qualityScore": 0.87
  }
}
```

**Example Response (Completed)**:
```json
{
  "courseId": "123e4567-e89b-12d3-a456-426614174000",
  "status": "completed",
  "phase": "saving",
  "progress": 100,
  "message": "Генерация завершена",
  "estimatedRemainingSeconds": null,
  "startedAt": "2025-11-05T12:00:00.000Z",
  "lastUpdatedAt": "2025-11-05T12:02:30.000Z",
  "metadata": {
    "totalLessons": 24,
    "totalSections": 8,
    "cost": 0.28,
    "duration": 150000,
    "qualityScore": 0.88
  }
}
```

**Example Response (Failed)**:
```json
{
  "courseId": "123e4567-e89b-12d3-a456-426614174000",
  "status": "failed",
  "phase": "sections",
  "progress": 35,
  "message": "Ошибка генерации",
  "estimatedRemainingSeconds": null,
  "startedAt": "2025-11-05T12:00:00.000Z",
  "lastUpdatedAt": "2025-11-05T12:01:45.000Z",
  "metadata": {
    "error": "Token budget exceeded, Gemini fallback failed",
    "retryable": true
  }
}
```

---

## 6. Integration Examples

### 6.1 Frontend Polling (React Hook)

```typescript
'use client';

import { trpc } from '@/lib/trpc';
import { useEffect, useState } from 'react';

export function useGenerationStatus(courseId: string) {
  const [isPolling, setIsPolling] = useState(true);

  // Poll every 2 seconds
  const { data: status, refetch } = trpc.generation.getStatus.useQuery(
    { courseId },
    {
      refetchInterval: isPolling ? 2000 : false,
      enabled: isPolling,
    }
  );

  // Stop polling when completed/failed/cancelled
  useEffect(() => {
    if (status?.status && ['completed', 'failed', 'cancelled'].includes(status.status)) {
      setIsPolling(false);
    }
  }, [status?.status]);

  return {
    status,
    isPolling,
    refetch,
    stopPolling: () => setIsPolling(false),
    startPolling: () => setIsPolling(true),
  };
}

// Usage in component
export function GenerationProgress({ courseId }: { courseId: string }) {
  const { status, isPolling } = useGenerationStatus(courseId);

  if (!status) return <div>Загрузка...</div>;

  return (
    <div className="generation-progress">
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${status.progress}%` }}
        />
      </div>

      <p className="status-message">{status.message}</p>

      {status.estimatedRemainingSeconds && (
        <p className="eta">
          Осталось ~{Math.ceil(status.estimatedRemainingSeconds / 60)} мин
        </p>
      )}

      {status.metadata?.qualityScore && (
        <p className="quality">
          Качество: {(status.metadata.qualityScore * 100).toFixed(0)}%
        </p>
      )}

      {status.status === 'failed' && status.metadata?.retryable && (
        <button onClick={() => retryGeneration(courseId)}>
          Повторить попытку
        </button>
      )}
    </div>
  );
}
```

### 6.2 Backend Worker Status Updates

```typescript
// In stage5-generation.ts worker handler
export async function handleStructureGeneration(job: Job<GenerationJobData>) {
  const { input } = job.data;

  // Update progress throughout workflow
  const updateProgress = async (
    phase: GenerationPhase,
    batchesCompleted?: number
  ) => {
    await supabase
      .from('courses')
      .update({
        generation_metadata: {
          ...job.data.metadata,
          last_phase: phase,
          batch_count: batchesCompleted,
          updated_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.course_id);
  };

  // Phase 1: Metadata
  await updateProgress('metadata');
  const metadata = await generateMetadata(input);

  // Phase 2: Sections (batch by batch)
  await updateProgress('sections', 0);
  for (let i = 0; i < totalBatches; i++) {
    const batch = await generateSectionBatch(input, i);
    await updateProgress('sections', i + 1);
  }

  // Phase 3: Validation
  await updateProgress('validation');
  const qualityScores = await validateQuality(result);

  // Phase 4: Saving
  await updateProgress('saving');
  await saveToDatabase(result);
}
```

---

## 7. Testing

### 7.1 Contract Test

```typescript
import { describe, it, expect } from 'vitest';

describe('generation.getStatus contract', () => {
  it('should return status for generating course', async () => {
    const status = await caller.generation.getStatus({
      courseId: 'generating-course-id',
    });

    expect(status).toMatchObject({
      courseId: 'generating-course-id',
      status: 'generating',
      phase: expect.stringMatching(/metadata|sections|validation|saving/),
      progress: expect.any(Number),
      message: expect.any(String),
      estimatedRemainingSeconds: expect.any(Number),
    });

    expect(status.progress).toBeGreaterThanOrEqual(0);
    expect(status.progress).toBeLessThanOrEqual(100);
  });

  it('should return completed status', async () => {
    const status = await caller.generation.getStatus({
      courseId: 'completed-course-id',
    });

    expect(status).toMatchObject({
      status: 'completed',
      progress: 100,
      metadata: {
        totalLessons: expect.any(Number),
        totalSections: expect.any(Number),
        cost: expect.any(Number),
        qualityScore: expect.any(Number),
      },
    });
  });

  it('should reject unauthorized access', async () => {
    const unauthCaller = factory({ user: null });

    await expect(
      unauthCaller.generation.getStatus({ courseId: 'test-course-id' })
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
```

---

## 8. Performance Considerations

### 8.1 Caching Strategy

```typescript
// Cache status for 1 second to reduce database load
const statusCache = new Map<string, { status: GetStatusOutput; timestamp: number }>();

const CACHE_TTL = 1000; // 1 second

async function getCachedStatus(courseId: string): Promise<GetStatusOutput | null> {
  const cached = statusCache.get(courseId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.status;
  }
  return null;
}

async function setCachedStatus(courseId: string, status: GetStatusOutput) {
  statusCache.set(courseId, { status, timestamp: Date.now() });
}
```

### 8.2 Database Query Optimization

```sql
-- Index for fast status lookups
CREATE INDEX IF NOT EXISTS idx_courses_generation_status
ON courses (id, generation_status, updated_at)
WHERE generation_status IN ('queued', 'generating');

-- Partial index for active generations only
CREATE INDEX IF NOT EXISTS idx_active_generations
ON courses (user_id, generation_status)
WHERE generation_status IN ('queued', 'generating');
```

---

## 9. Related Documentation

- [generation.initiate.tRPC.md](generation.initiate.tRPC.md) - Start generation
- [data-model.md](../data-model.md) - GenerationMetadata schema
- [BullMQ Job Status](https://docs.bullmq.io/guide/jobs/job-status) - Job state machine
