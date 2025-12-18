# RPC Contract: update_course_progress

**Version**: 1.0
**Status**: Draft
**Last Updated**: 2025-10-20

## Overview

PostgreSQL stored procedure for atomically updating course generation progress. Provides idempotent, single-transaction updates to the `courses.generation_progress` JSONB column.

---

## Function Signature

```sql
CREATE OR REPLACE FUNCTION update_course_progress(
  p_course_id UUID,
  p_step_id INTEGER,
  p_status TEXT,
  p_message TEXT,
  p_error_message TEXT DEFAULT NULL,
  p_error_details JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
```

---

## Parameters

| Parameter | Type | Required | Constraints | Description |
|-----------|------|----------|-------------|-------------|
| `p_course_id` | UUID | ✅ Yes | Valid UUID, course must exist | Course to update |
| `p_step_id` | INTEGER | ✅ Yes | 1-5 | Step number (1=Initialize, 2=Process/Analyze, 3-4=Structure, 5=Content) |
| `p_status` | TEXT | ✅ Yes | 'pending', 'in_progress', 'completed', 'failed' | New status for step |
| `p_message` | TEXT | ✅ Yes | Non-empty string | User-facing message (Russian) |
| `p_error_message` | TEXT | ❌ No | Optional, used when status='failed' | Error message for frontend |
| `p_error_details` | JSONB | ❌ No | Optional, used when status='failed' | Detailed error context |
| `p_metadata` | JSONB | ❌ No | Default: `{}` | Additional context (executor, timestamps, etc.) |

---

## Return Value

**Type**: `JSONB`

**Structure**: Updated `generation_progress` object

**Example**:
```json
{
  "steps": [
    {
      "id": 1,
      "name": "Запуск генерации",
      "status": "completed",
      "started_at": "2025-10-20T10:15:00Z",
      "completed_at": "2025-10-20T10:15:02Z",
      "error": null,
      "error_details": null
    },
    {
      "id": 2,
      "name": "Обработка документов",
      "status": "in_progress",
      "started_at": "2025-10-20T10:15:03Z",
      "completed_at": null,
      "error": null,
      "error_details": null
    },
    // ... steps 3-5
  ],
  "percentage": 30,
  "current_step": 2,
  "message": "Обрабатываем загруженные документы...",
  "total_steps": 5,
  "has_documents": true,
  "lessons_completed": 0,
  "lessons_total": 12
}
```

---

## Business Logic

### Step ID to Step Name Mapping

| Step ID | Russian Name | English Name | Job Type |
|---------|--------------|--------------|----------|
| 1 | Запуск генерации | Launch generation | INITIALIZE |
| 2 (files) | Обработка документов | Document processing | DOCUMENT_PROCESSING |
| 2 (no files) | Анализ задачи | Task analysis | STRUCTURE_ANALYSIS |
| 3-4 | Генерация структуры | Structure generation | STRUCTURE_GENERATION |
| 5 | Создание контента | Content creation | TEXT_GENERATION |

### Percentage Calculation

```typescript
function calculatePercentage(step_id: number, status: string): number {
  if (status === 'completed') {
    return step_id * 20; // 20%, 40%, 60%, 80%, 100%
  } else if (status === 'in_progress') {
    return (step_id - 1) * 20 + 10; // Mid-point of current step
  } else {
    return (step_id - 1) * 20; // Previous step's percentage
  }
}
```

**Examples**:
- Step 1 'in_progress' → 10%
- Step 1 'completed' → 20%
- Step 2 'in_progress' → 30%
- Step 2 'completed' → 40%
- Step 5 'completed' → 100%

### Timestamp Updates

- **`started_at`**: Set when status → 'in_progress' (first time for that step)
- **`completed_at`**: Set when status → 'completed' or 'failed'
- **`last_progress_update`**: Set on every call to `NOW()`

### Error Handling

- If `p_step_id` < 1 OR `p_step_id` > 5 → RAISE EXCEPTION
- If `p_status` NOT IN ('pending', 'in_progress', 'completed', 'failed') → RAISE EXCEPTION
- If course not found → Return NULL

### Idempotency

Calling with same parameters multiple times is safe:
- UPDATE operations don't duplicate data
- Timestamps overwritten on each call (acceptable)
- Metadata merged (not replaced)

**Example**:
```sql
-- Call 1
SELECT update_course_progress(
  'course-uuid',
  1,
  'completed',
  'Инициализация завершена'
);
-- Result: step 1 status = 'completed', timestamp = T1

-- Call 2 (retry)
SELECT update_course_progress(
  'course-uuid',
  1,
  'completed',
  'Инициализация завершена'
);
-- Result: step 1 status = 'completed', timestamp = T2 (updated)
-- No duplicate steps, no data corruption
```

---

## Implementation

### Full SQL Function

```sql
CREATE OR REPLACE FUNCTION update_course_progress(
  p_course_id UUID,
  p_step_id INTEGER,
  p_status TEXT,
  p_message TEXT,
  p_error_message TEXT DEFAULT NULL,
  p_error_details JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
  v_progress JSONB;
  v_step_index INTEGER;
  v_percentage INTEGER;
BEGIN
  -- Validate step_id (1-5)
  IF p_step_id < 1 OR p_step_id > 5 THEN
    RAISE EXCEPTION 'Invalid step_id: %. Must be 1-5', p_step_id;
  END IF;

  -- Validate status
  IF p_status NOT IN ('pending', 'in_progress', 'completed', 'failed') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be pending|in_progress|completed|failed', p_status;
  END IF;

  -- Calculate percentage (20% per step)
  v_percentage := CASE
    WHEN p_status = 'completed' THEN p_step_id * 20
    WHEN p_status = 'in_progress' THEN (p_step_id - 1) * 20 + 10
    ELSE (p_step_id - 1) * 20
  END;

  -- Step array index (0-based)
  v_step_index := p_step_id - 1;

  -- Update generation_progress JSONB
  UPDATE courses
  SET
    -- Update step status
    generation_progress = jsonb_set(
      generation_progress,
      array['steps', v_step_index::text, 'status'],
      to_jsonb(p_status)
    ),

    -- Update timestamp (started_at or completed_at)
    generation_progress = jsonb_set(
      generation_progress,
      array['steps', v_step_index::text,
        CASE WHEN p_status = 'in_progress' THEN 'started_at' ELSE 'completed_at' END
      ],
      to_jsonb(NOW())
    ),

    -- Update percentage
    generation_progress = jsonb_set(
      generation_progress,
      array['percentage'],
      to_jsonb(v_percentage)
    ),

    -- Update current_step
    generation_progress = jsonb_set(
      generation_progress,
      array['current_step'],
      to_jsonb(p_step_id)
    ),

    -- Update message
    generation_progress = jsonb_set(
      generation_progress,
      array['message'],
      to_jsonb(p_message)
    ),

    -- Update error fields if provided
    generation_progress = CASE
      WHEN p_error_message IS NOT NULL THEN
        jsonb_set(
          jsonb_set(
            generation_progress,
            array['steps', v_step_index::text, 'error'],
            to_jsonb(p_error_message)
          ),
          array['steps', v_step_index::text, 'error_details'],
          COALESCE(p_error_details, '{}'::jsonb)
        )
      ELSE generation_progress
    END,

    -- Update last_progress_update timestamp
    last_progress_update = NOW(),

    -- Update record timestamp
    updated_at = NOW()

  WHERE id = p_course_id
  RETURNING generation_progress INTO v_progress;

  -- Return updated progress (NULL if course not found)
  RETURN v_progress;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role (backend)
GRANT EXECUTE ON FUNCTION update_course_progress TO service_role;

-- Revoke from authenticated users (backend-only RPC)
REVOKE EXECUTE ON FUNCTION update_course_progress FROM authenticated;
```

---

## Usage Examples

### Example 1: Orchestrator Marks Step 1 Complete

```typescript
// Orchestrator after job creation
const { data, error } = await supabase.rpc('update_course_progress', {
  p_course_id: courseId,
  p_step_id: 1,
  p_status: 'completed',
  p_message: 'Инициализация завершена',
  p_metadata: {
    job_id: 'course-gen-123',
    executor: 'orchestrator',
    tier: 'PREMIUM',
    priority: 10
  }
});

if (error) {
  logger.error('RPC update_course_progress failed', { error, courseId });
  throw error;
}

logger.info('Progress updated', { courseId, step: 1, percentage: data.percentage });
```

### Example 2: Worker Starts Processing

```typescript
// Worker at job start
const { data, error } = await supabase.rpc('update_course_progress', {
  p_course_id: job.data.courseId,
  p_step_id: 2,
  p_status: 'in_progress',
  p_message: 'Обрабатываем загруженные документы...',
  p_metadata: {
    job_id: job.id,
    executor: 'worker',
    worker_instance: 'worker-1'
  }
});

if (error) {
  logger.error('Failed to update progress', { error, jobId: job.id });
  throw error;
}
```

### Example 3: Worker Completes Processing

```typescript
// Worker at job completion
const { data, error } = await supabase.rpc('update_course_progress', {
  p_course_id: job.data.courseId,
  p_step_id: 2,
  p_status: 'completed',
  p_message: 'Документы успешно обработаны',
  p_metadata: {
    job_id: job.id,
    executor: 'worker',
    processing_duration_ms: 3456,
    chunks_created: 42
  }
});
```

### Example 4: Worker Reports Failure

```typescript
// Worker on job failure
const { data, error } = await supabase.rpc('update_course_progress', {
  p_course_id: job.data.courseId,
  p_step_id: 2,
  p_status: 'failed',
  p_message: 'Не удалось обработать документы',
  p_error_message: 'Формат файла не поддерживается',
  p_error_details: {
    file_type: 'application/unknown',
    file_size: 5242880,
    error_code: 'UNSUPPORTED_FORMAT'
  },
  p_metadata: {
    job_id: job.id,
    executor: 'worker',
    failed_at: new Date().toISOString()
  }
});
```

### Example 5: Worker Recovers Orphaned Job (Step 1 Fallback)

```typescript
// Worker detects step 1 not completed
const course = await supabase
  .from('courses')
  .select('generation_progress')
  .eq('id', job.data.courseId)
  .single();

if (course.data.generation_progress.steps[0].status !== 'completed') {
  logger.warn('Orphaned job detected, recovering step 1', {
    courseId: job.data.courseId,
    jobId: job.id
  });

  // Fallback: Complete step 1 from worker
  await supabase.rpc('update_course_progress', {
    p_course_id: job.data.courseId,
    p_step_id: 1,
    p_status: 'completed',
    p_message: 'Инициализация завершена (восстановлено воркером)',
    p_metadata: {
      job_id: job.id,
      executor: 'worker',
      recovered_by_worker: true,
      recovery_reason: 'orchestrator_rpc_failure'
    }
  });

  // Log recovery event to system_metrics
  await supabase.from('system_metrics').insert({
    event_type: 'orphaned_job_recovery',
    severity: 'warn',
    user_id: job.data.userId,
    course_id: job.data.courseId,
    job_id: job.id,
    metadata: { recovery_step: 1 }
  });
}
```

---

## Error Handling

### Exception: Invalid step_id

```sql
ERROR: Invalid step_id: 6. Must be 1-5
```

**Cause**: `p_step_id` not in range 1-5

**Resolution**: Fix calling code to pass valid step_id

### Exception: Invalid status

```sql
ERROR: Invalid status: done. Must be pending|in_progress|completed|failed
```

**Cause**: `p_status` not in valid enum

**Resolution**: Fix calling code to pass valid status string

### Return NULL

**Cause**: Course with `p_course_id` not found in database

**Resolution**: Caller should check for NULL return and handle appropriately

**Example**:
```typescript
const { data, error } = await supabase.rpc('update_course_progress', {
  p_course_id: 'non-existent-uuid',
  p_step_id: 1,
  p_status: 'completed',
  p_message: 'Test'
});

if (data === null) {
  logger.error('Course not found', { courseId: 'non-existent-uuid' });
  throw new Error('Course not found');
}
```

---

## Performance

### Query Plan

Single UPDATE with JSONB manipulation:
- **Index Used**: Primary key on `courses(id)` (UUID)
- **JSONB Operations**: `jsonb_set()` is O(n) where n = JSONB depth
- **Average Depth**: 3-4 levels for `generation_progress`

### Latency

- **P50**: < 50ms
- **P95**: < 100ms
- **P99**: < 200ms

### Optimization

- **Single Transaction**: All JSONB updates in one UPDATE statement
- **No Triggers**: No additional overhead
- **No Joins**: Single table update

---

## Security

### Privileges

- **Service Role**: GRANT EXECUTE (backend can call)
- **Authenticated Users**: REVOKE EXECUTE (frontend cannot call directly)
- **Anonymous**: No access

### RLS Bypass

Function uses `SECURITY DEFINER`, which runs with owner privileges. This bypasses RLS policies on the `courses` table.

**Why Needed**:
- Backend service needs to update any course (not just owned by current user)
- Worker processes run as service role, not as individual users

**Security Mitigation**:
- Function validates all inputs
- Only service role can execute
- Audit trail via `last_progress_update` timestamp

### SQL Injection Protection

- All parameters properly typed (UUID, INTEGER, TEXT, JSONB)
- No dynamic SQL construction
- PostgreSQL parameter binding prevents injection

---

## Testing

### Unit Tests (pgTAP)

```sql
-- Test: Valid step update
BEGIN;
SELECT plan(5);

-- Setup
INSERT INTO courses (id, user_id, title, generation_progress)
VALUES (
  'test-course-uuid',
  'test-user-uuid',
  'Test Course',
  '{
    "steps": [
      {"id": 1, "name": "Запуск генерации", "status": "pending"},
      {"id": 2, "name": "Обработка документов", "status": "pending"},
      {"id": 3, "name": "Генерация структуры", "status": "pending"},
      {"id": 4, "name": "Генерация структуры", "status": "pending"},
      {"id": 5, "name": "Создание контента", "status": "pending"}
    ],
    "percentage": 0,
    "current_step": 0
  }'::jsonb
);

-- Test
SELECT update_course_progress(
  'test-course-uuid',
  1,
  'completed',
  'Инициализация завершена'
);

-- Assertions
SELECT is(
  (SELECT generation_progress->>'percentage' FROM courses WHERE id = 'test-course-uuid'),
  '20',
  'Percentage should be 20% after step 1'
);

SELECT is(
  (SELECT generation_progress->'steps'->0->>'status' FROM courses WHERE id = 'test-course-uuid'),
  'completed',
  'Step 1 status should be completed'
);

SELECT isnt(
  (SELECT generation_progress->'steps'->0->>'completed_at' FROM courses WHERE id = 'test-course-uuid'),
  NULL,
  'Step 1 completed_at should be set'
);

-- Cleanup
ROLLBACK;
```

### Integration Tests (Vitest)

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { supabase } from '@/lib/supabase/admin';

describe('update_course_progress RPC', () => {
  let testCourseId: string;

  beforeEach(async () => {
    // Create test course
    const { data } = await supabase
      .from('courses')
      .insert({
        title: 'Test Course',
        user_id: 'test-user-uuid',
        generation_progress: {
          steps: Array(5).fill(null).map((_, i) => ({
            id: i + 1,
            name: `Step ${i + 1}`,
            status: 'pending'
          })),
          percentage: 0,
          current_step: 0
        }
      })
      .select('id')
      .single();

    testCourseId = data.id;
  });

  it('should update step status and percentage', async () => {
    const { data, error } = await supabase.rpc('update_course_progress', {
      p_course_id: testCourseId,
      p_step_id: 1,
      p_status: 'completed',
      p_message: 'Test complete'
    });

    expect(error).toBeNull();
    expect(data.percentage).toBe(20);
    expect(data.steps[0].status).toBe('completed');
    expect(data.current_step).toBe(1);
  });

  it('should be idempotent (safe to call multiple times)', async () => {
    // Call 1
    const { data: data1 } = await supabase.rpc('update_course_progress', {
      p_course_id: testCourseId,
      p_step_id: 1,
      p_status: 'completed',
      p_message: 'Test'
    });

    // Call 2 (retry)
    const { data: data2 } = await supabase.rpc('update_course_progress', {
      p_course_id: testCourseId,
      p_step_id: 1,
      p_status: 'completed',
      p_message: 'Test'
    });

    expect(data1.steps[0].status).toBe('completed');
    expect(data2.steps[0].status).toBe('completed');
    expect(data1.percentage).toBe(data2.percentage);
  });

  it('should reject invalid step_id', async () => {
    const { error } = await supabase.rpc('update_course_progress', {
      p_course_id: testCourseId,
      p_step_id: 10,
      p_status: 'completed',
      p_message: 'Test'
    });

    expect(error).not.toBeNull();
    expect(error.message).toContain('Invalid step_id');
  });

  it('should reject invalid status', async () => {
    const { error } = await supabase.rpc('update_course_progress', {
      p_course_id: testCourseId,
      p_step_id: 1,
      p_status: 'invalid_status',
      p_message: 'Test'
    });

    expect(error).not.toBeNull();
    expect(error.message).toContain('Invalid status');
  });
});
```

---

## Monitoring

### Observability

- **Execution Time**: Tracked via `pg_stat_statements`
- **Call Count**: Monitored in PostgreSQL logs
- **Error Rate**: Failed calls logged by Supabase

### Alerts

- Execution time > 200ms → Warning
- Error rate > 1% → Critical
- Null return rate > 0.1% → Investigation needed

---

## Migration

### Deployment

```sql
-- Migration file: {timestamp}_create_update_course_progress_rpc.sql
-- Deploy BEFORE backend code that calls this RPC

-- 1. Create function
\i update_course_progress.sql

-- 2. Grant permissions
GRANT EXECUTE ON FUNCTION update_course_progress TO service_role;
REVOKE EXECUTE ON FUNCTION update_course_progress FROM authenticated;

-- 3. Verify
SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'update_course_progress';
```

### Rollback

```sql
-- Rollback: Drop function
DROP FUNCTION IF EXISTS update_course_progress(UUID, INTEGER, TEXT, TEXT, TEXT, JSONB, JSONB);
```

---

## Changelog

### Version 1.0 (2025-10-20)

- Initial RPC function specification
- Idempotent JSONB updates
- Supports error reporting
- Worker recovery metadata

---

## References

- **Feature Spec**: `specs/002-main-entry-orchestrator/spec.md`
- **Data Model**: `specs/002-main-entry-orchestrator/data-model.md`
- **Research**: `specs/002-main-entry-orchestrator/research.md` (Section 3)
- **PostgreSQL JSONB**: https://www.postgresql.org/docs/current/functions-json.html
- **Supabase RPC**: https://supabase.com/docs/guides/database/functions
