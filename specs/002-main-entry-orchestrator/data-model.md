# Data Model: Main Entry Orchestrator

**Feature**: Stage 1 - Main Entry Orchestrator
**Branch**: `002-main-entry-orchestrator`
**Date**: 2025-10-20

## Overview

This document defines the data entities, relationships, and database schema changes required for the Main Entry Orchestrator feature. All entities align with the functional requirements in `spec.md`.

---

## Entity Diagram

```
┌─────────────────┐
│  auth.users     │ (Supabase Auth)
│  - id (PK)      │
│  - email        │
│  - user_metadata│ ──> { tier: string }
└─────────────────┘
        │
        │ 1:N
        │
┌─────────────────┐         ┌──────────────────────┐
│   courses       │ 1:N     │  system_metrics      │
│  - id (PK)      │────────>│  - id (PK)           │
│  - user_id (FK) │         │  - event_type (ENUM) │
│  - title        │         │  - severity (ENUM)   │
│  - generation_  │         │  - user_id (FK)      │
│    progress     │         │  - course_id (FK)    │
│  - status       │         │  - job_id            │
│  - created_at   │         │  - metadata (JSONB)  │
└─────────────────┘         │  - timestamp         │
                            └──────────────────────┘
        │
        │ Associated via job_id
        │
┌─────────────────┐
│ BullMQ Jobs     │ (Redis-backed)
│  - job_id       │
│  - type         │
│  - priority     │
│  - data         │
│  - status       │
└─────────────────┘
```

---

## Entities

### 1. User (Existing - Supabase Auth)

**Purpose**: Store user authentication and tier information

**Schema**: Managed by Supabase Auth (`auth.users` table)

**Relevant Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | User unique identifier |
| `email` | TEXT | NOT NULL, UNIQUE | User email address |
| `user_metadata` | JSONB | DEFAULT '{}' | Custom metadata including tier |

**User Metadata Structure**:
```typescript
interface UserMetadata {
  tier: 'FREE' | 'BASIC' | 'STANDARD' | 'TRIAL' | 'PREMIUM';
  // Other metadata fields...
}
```

**Tier Mapping** (from `/docs/PRICING-TIERS.md`):
- `FREE` - Priority: 1, Concurrency: 1
- `BASIC` - Priority: 3, Concurrency: 2
- `STANDARD` - Priority: 5, Concurrency: 3
- `TRIAL` - Priority: 5, Concurrency: 5
- `PREMIUM` - Priority: 10, Concurrency: 5

**Access Pattern**:
- Read via JWT token validation: `supabase.auth.getUser(token)`
- Tier extracted from `user.user_metadata.tier` or separate `user_profiles` table

---

### 2. Course (Existing - Extended)

**Purpose**: Store course metadata and generation progress

**Schema**: `public.courses` table (already exists from Stage 0)

**Relevant Fields for Stage 1**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Course unique identifier |
| `user_id` | UUID | FOREIGN KEY → auth.users(id) | Course owner |
| `title` | TEXT | NOT NULL | Course title |
| `generation_progress` | JSONB | DEFAULT NULL | Progress tracking structure |
| `status` | TEXT | NOT NULL | Course generation status |
| `generation_started_at` | TIMESTAMPTZ | NULL | When generation started |
| `generation_completed_at` | TIMESTAMPTZ | NULL | When generation completed |
| `last_progress_update` | TIMESTAMPTZ | NULL | Last progress update timestamp |
| `webhook_url` | TEXT | NULL | Optional callback URL |
| `error_message` | TEXT | NULL | User-facing error message |
| `error_details` | JSONB | NULL | Detailed error information |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Record update timestamp |

**Generation Progress Structure** (JSONB):
```typescript
interface GenerationProgress {
  steps: Array<{
    id: number;                    // 1-5
    name: string;                  // Russian step names
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    started_at: string | null;     // ISO8601 timestamp
    completed_at: string | null;   // ISO8601 timestamp
    error: string | null;          // Error message if failed
    error_details: Record<string, unknown> | null;
  }>;
  percentage: number;               // 0-100
  current_step: number;             // 1-5
  message: string;                  // Current status message
  total_steps: number;              // Always 5
  has_documents: boolean;           // Files present flag
  lessons_completed: number;        // Progress counter
  lessons_total: number;            // Total lessons
}
```

**Russian Step Names** (Frontend Compatibility):
1. "Запуск генерации" (Launch generation)
2. "Обработка документов" / "Анализ задачи" (Document processing / Task analysis)
3. "Генерация структуры" (Structure generation)
4. "Создание контента" (Content creation)
5. "Финализация" (Finalization)

**Status Values**:
- `'initializing'` - Step 1 in progress
- `'processing_documents'` - Step 2 (with files)
- `'analyzing_task'` - Step 2 (without files)
- `'generating_structure'` - Step 3-4
- `'generating_content'` - Step 5
- `'completed'` - All steps done
- `'failed'` - Error occurred

**Validation Rules**:
- `generation_progress.steps` MUST have exactly 5 elements
- `generation_progress.percentage` MUST be 0-100
- `generation_progress.current_step` MUST be 1-5
- `status` transitions follow linear progression

**Access Pattern**:
- Read: Frontend polling via GET `/api/courses/[slug]/check-status`
- Write: RPC `update_course_progress()` called by orchestrator/worker
- Authorization: RLS policy ensures `user_id = auth.uid()`

---

### 3. System Metrics (New)

**Purpose**: Track critical system events for Stage 8 monitoring and alerting

**Schema**: `public.system_metrics` table (NEW in Stage 1 migration)

**Fields**:
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY DEFAULT gen_random_uuid() | Event unique identifier |
| `event_type` | metric_event_type | NOT NULL | Type of event (ENUM) |
| `severity` | metric_severity | NOT NULL | Event severity (ENUM) |
| `user_id` | UUID | FOREIGN KEY → auth.users(id) | Associated user |
| `course_id` | UUID | FOREIGN KEY → courses(id) ON DELETE CASCADE | Associated course |
| `job_id` | TEXT | NULL | BullMQ job ID |
| `metadata` | JSONB | DEFAULT '{}' | Event-specific data |
| `timestamp` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | Event occurrence time |

**Enums**:
```sql
CREATE TYPE metric_event_type AS ENUM (
  'job_rollback',              -- Job deleted after RPC failure
  'orphaned_job_recovery',     -- Worker recovered incomplete step 1
  'concurrency_limit_hit',     -- User or global limit reached
  'worker_timeout',            -- Job exceeded timeout
  'rpc_retry_exhausted',       -- All 3 RPC retries failed
  'duplicate_job_detected'     -- Same course queued multiple times
);

CREATE TYPE metric_severity AS ENUM (
  'info',     -- Informational, normal operation
  'warn',     -- Warning, requires attention
  'error',    -- Error, user impact
  'fatal'     -- Critical system failure
);
```

**Indexes**:
```sql
CREATE INDEX idx_system_metrics_event_type ON system_metrics(event_type);
CREATE INDEX idx_system_metrics_severity ON system_metrics(severity);
CREATE INDEX idx_system_metrics_timestamp ON system_metrics(timestamp DESC);
CREATE INDEX idx_system_metrics_course ON system_metrics(course_id) WHERE course_id IS NOT NULL;
```

**RLS Policies**:
```sql
-- Admin-only read access (for Stage 8 dashboard)
CREATE POLICY system_metrics_admin_read ON system_metrics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

-- Service role can insert (backend writes)
CREATE POLICY system_metrics_service_insert ON system_metrics
  FOR INSERT WITH CHECK (true); -- Service role bypasses RLS
```

**Metadata Examples**:
```typescript
// Job rollback
{
  reason: 'rpc_update_course_progress_failed',
  attempts: 3,
  last_error: 'Connection timeout',
  rollback_timestamp: '2025-10-20T14:23:45Z'
}

// Orphaned job recovery
{
  recovery_step: 1,
  worker_id: 'worker-instance-1',
  original_executor: 'orchestrator'
}

// Concurrency limit hit
{
  tier: 'FREE',
  user_limit: 1,
  current_user_jobs: 1,
  global_limit: 3,
  global_active_jobs: 3,
  rejected_course_id: 'uuid'
}
```

**Access Pattern**:
- Write: Backend inserts via `supabase.from('system_metrics').insert()`
- Read: Stage 8 admin dashboard queries for analytics
- Retention: Keep all records (enable partitioning in Stage 8 if volume grows)

---

### 4. BullMQ Job (Existing - Extended)

**Purpose**: Queue and process course generation jobs

**Schema**: Stored in Redis via BullMQ (not a SQL table)

**Job Data Structure** (TypeScript):
```typescript
interface JobData {
  jobType: JobType;
  organizationId: string;      // UUID
  courseId: string;            // UUID
  userId: string;              // UUID
  createdAt: string;           // ISO8601

  // Additional course fields for context
  title?: string;
  language?: string;
  style?: string;
  course_description?: string;
  target_audience?: string;
  difficulty?: string;
  lesson_duration_minutes?: number;
  learning_outcomes?: string[];
  estimated_lessons?: number;
  estimated_sections?: number;
  content_strategy?: string;
  output_formats?: string[];

  // File-specific (for DOCUMENT_PROCESSING)
  fileId?: string;
  filePath?: string;
  mimeType?: string;
}

enum JobType {
  INITIALIZE = 'initialize',
  DOCUMENT_PROCESSING = 'document_processing',
  STRUCTURE_ANALYSIS = 'structure_analysis',
  STRUCTURE_GENERATION = 'structure_generation',
  TEXT_GENERATION = 'text_generation',
  FINALIZATION = 'finalization'
}
```

**Job Options**:
```typescript
interface JobOptions {
  jobId?: string;              // Unique identifier
  priority: number;            // 1-10 (based on user tier)
  attempts: number;            // Retry count (default: 3)
  backoff: {
    type: 'exponential';
    delay: number;             // Initial delay in ms
  };
  timeout: number;             // Job timeout in ms
  removeOnComplete: number;    // Keep last N completed jobs
  removeOnFail: boolean;       // Keep failed jobs for debugging
}
```

**Priority Mapping** (from user tier):
- FREE: 1
- BASIC: 3
- STANDARD: 5
- TRIAL: 5
- PREMIUM: 10

**Job Lifecycle**:
1. `waiting` - In queue, not yet picked up
2. `active` - Worker processing
3. `completed` - Successfully finished
4. `failed` - Error occurred (retries exhausted)
5. `delayed` - Scheduled for later (backoff)

**Access Pattern**:
- Write: Orchestrator adds via `queue.add(jobType, jobData, options)`
- Read: BullBoard dashboard, worker polls
- Cleanup: Completed jobs removed after 100 (configurable)

---

### 5. Redis Concurrency Counters (New)

**Purpose**: Track per-user and global concurrent job counts

**Schema**: Redis keys (not a SQL table)

**Key Structure**:
```
concurrency:user:{userId}        → INTEGER (current concurrent jobs)
concurrency:global               → INTEGER (total active jobs)
```

**Operations**:
```typescript
// Reserve slot (atomic check-and-increment)
EVAL lua_script 2 concurrency:user:{userId} concurrency:global {userLimit} {globalLimit}

// Release slot
DECR concurrency:user:{userId}
DECR concurrency:global
```

**TTL**: 1 hour on user keys (auto-cleanup for orphaned counters)

**Access Pattern**:
- Write: Orchestrator before job creation, worker on completion/failure
- Read: Orchestrator during concurrency check
- Reconciliation: Cron job every 5 minutes compares with BullMQ active jobs

---

## Database Functions (RPCs)

### 1. `update_course_progress`

**Purpose**: Atomically update course generation progress

**Signature**:
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
```

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `p_course_id` | UUID | Course to update |
| `p_step_id` | INTEGER | Step number (1-5) |
| `p_status` | TEXT | 'pending', 'in_progress', 'completed', 'failed' |
| `p_message` | TEXT | User-facing message (Russian) |
| `p_error_message` | TEXT | Error message if status='failed' |
| `p_error_details` | JSONB | Detailed error info |
| `p_metadata` | JSONB | Additional context (executor, timestamps) |

**Return Value**: Updated `generation_progress` JSONB

**Side Effects**:
1. Updates `courses.generation_progress` JSONB
2. Updates `courses.last_progress_update` timestamp
3. Calculates and sets `generation_progress.percentage`
4. Sets step timestamps (`started_at`, `completed_at`)

**Idempotency**: Safe to call multiple times with same parameters

**Error Handling**:
- Raises exception if `p_step_id` not in 1-5
- Raises exception if `p_status` not in valid enum
- Returns NULL if course not found

**Security**: `SECURITY DEFINER` - runs with owner privileges, bypasses RLS

**Permissions**: `GRANT EXECUTE TO service_role`

---

## Migrations

### Migration 1: Create `system_metrics` Table

**File**: `courseai-next/supabase/migrations/{timestamp}_create_system_metrics.sql`

**Content**:
```sql
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

-- Admin-only read policy
CREATE POLICY system_metrics_admin_read ON system_metrics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

-- Service role insert policy
CREATE POLICY system_metrics_service_insert ON system_metrics
  FOR INSERT WITH CHECK (true);

-- Add comment
COMMENT ON TABLE system_metrics IS 'Critical system events for Stage 8 monitoring and alerting';
```

---

### Migration 2: Create `update_course_progress` RPC

**File**: `courseai-next/supabase/migrations/{timestamp}_create_update_course_progress_rpc.sql`

**Content**: (See full implementation in `research.md` Section 3)

**Summary**:
- PostgreSQL function with `SECURITY DEFINER`
- Atomic JSONB manipulation using `jsonb_set()`
- Validates step_id (1-5) and status enum
- Calculates percentage (20% per step)
- Updates timestamps conditionally
- Returns updated `generation_progress`

---

## Validation Rules

### Course Progress Validation

1. **Step Count**: `generation_progress.steps.length === 5`
2. **Step IDs**: `steps[i].id === i + 1` (1-indexed)
3. **Status Enum**: `steps[i].status IN ('pending', 'in_progress', 'completed', 'failed')`
4. **Percentage Range**: `0 <= generation_progress.percentage <= 100`
5. **Current Step Range**: `1 <= generation_progress.current_step <= 5`
6. **Timestamp Ordering**: `started_at <= completed_at` (if both present)

### Job Data Validation

1. **UUID Format**: All IDs must be valid UUIDs
2. **Job Type**: Must be valid `JobType` enum value
3. **Priority Range**: `1 <= priority <= 10`
4. **Created At**: Must be valid ISO8601 timestamp

### Concurrency Validation

1. **User Limit**: `current_count < TIER_LIMITS[tier]`
2. **Global Limit**: `global_count < GLOBAL_LIMIT`
3. **Counter Sync**: Reconcile counters every 5 minutes

---

## Data Flow Diagrams

### 1. Job Creation Flow

```
Frontend
   │
   ├──> POST /api/coursegen/generate
   │    { courseId, webhookUrl }
   │    Authorization: Bearer {JWT}
   │
Orchestrator
   ├──> Validate JWT → Extract userId, tier
   ├──> Check concurrency (Redis)
   │    ├─> User limit OK?
   │    └─> Global limit OK?
   ├──> Query course (Supabase)
   ├──> Check generation_progress.files
   ├──> Add BullMQ job (Redis)
   │    ├─> priority = TIER_PRIORITY[tier]
   │    └─> jobType = has_files ? DOCUMENT_PROCESSING : STRUCTURE_ANALYSIS
   ├──> Call RPC update_course_progress (Supabase)
   │    ├─> Retry 3x with backoff
   │    └─> Rollback job if fails
   ├──> Release concurrency slot if error
   │
   └──> Return 200 OK { success: true, jobId }
```

### 2. Progress Update Flow

```
Worker
   │
   ├──> Job starts
   ├──> Check step 1 status (orphan detection)
   ├──> Call RPC update_course_progress
   │    { step_id: N, status: 'in_progress' }
   │
Supabase RPC
   ├──> Validate parameters
   ├──> Update generation_progress JSONB
   │    ├─> Set steps[N].status = 'in_progress'
   │    ├─> Set steps[N].started_at = NOW()
   │    ├─> Calculate percentage
   │    └─> Set current_step = N
   ├──> Update last_progress_update = NOW()
   │
   └──> Return updated generation_progress
   │
Worker
   ├──> Process job
   ├──> Call RPC update_course_progress
   │    { step_id: N, status: 'completed' }
   │
   └──> Release concurrency slot
```

### 3. Error Handling Flow

```
Orchestrator
   │
   ├──> Job creation
   ├──> RPC call fails
   │
   └──> Compensation (Saga Pattern)
        ├──> Remove BullMQ job
        ├──> Release concurrency slot
        ├──> Write system_metrics
        │    { event_type: 'job_rollback' }
        └──> Return 500 error to user
   │
Worker (Fallback)
   │
   ├──> Job starts
   ├──> Detect step 1 status != 'completed'
   │
   └──> Orphaned Job Recovery
        ├──> Call RPC update_course_progress
        │    { step_id: 1, status: 'completed',
        │      metadata: { recovered_by_worker: true } }
        ├──> Write system_metrics
        │    { event_type: 'orphaned_job_recovery' }
        └──> Continue processing
```

---

## Entity Relationships

### Primary Relationships

1. **User → Course** (1:N)
   - A user can create many courses
   - Foreign key: `courses.user_id` → `auth.users.id`
   - Enforced by RLS policies

2. **Course → System Metrics** (1:N)
   - A course can have many system events
   - Foreign key: `system_metrics.course_id` → `courses.id`
   - Cascade delete on course removal

3. **User → System Metrics** (1:N)
   - A user can trigger many system events
   - Foreign key: `system_metrics.user_id` → `auth.users.id`
   - Set NULL on user deletion

### Derived Relationships

4. **Course → BullMQ Job** (1:1 typically, 1:N possible)
   - Associated via `job.data.courseId`
   - No foreign key (Redis storage)
   - Job retention: Last 100 completed, all failed

5. **User → Redis Counters** (1:1)
   - Key: `concurrency:user:{userId}`
   - TTL: 1 hour
   - Reconciled via BullMQ active jobs

---

## Performance Considerations

### Indexes

1. **courses.user_id** - Already indexed (foreign key)
2. **courses.generation_started_at** - Already indexed
3. **system_metrics.event_type** - NEW INDEX (dashboard queries)
4. **system_metrics.timestamp DESC** - NEW INDEX (time-series queries)
5. **system_metrics.course_id** - NEW PARTIAL INDEX (WHERE NOT NULL)

### Query Optimization

1. **Progress polling** - Single SELECT on `courses` with JSONB column
2. **Concurrency check** - Redis Lua script (atomic, <1ms)
3. **Metrics aggregation** - Stage 8 will use materialized views if needed

### Scalability

1. **BullMQ jobs** - Redis handles millions of ops/second
2. **System metrics** - Partition by timestamp in Stage 8 if volume grows
3. **Concurrency counters** - Redis cluster for horizontal scaling

---

## Data Lifecycle

### Course Generation Progress

- **Created**: When course record inserted (Stage 0)
- **Updated**: By orchestrator (step 1) and workers (steps 2-5)
- **Completed**: When `generation_progress.percentage = 100`
- **Retention**: Indefinite (part of course record)

### System Metrics

- **Created**: When critical event occurs
- **Updated**: Never (append-only log)
- **Retention**: Indefinite in Stage 1, partitioned in Stage 8

### BullMQ Jobs

- **Created**: By orchestrator via `queue.add()`
- **Processed**: By worker via job handler
- **Retention**: Last 100 completed, all failed jobs
- **Cleanup**: Configurable via `removeOnComplete` option

### Redis Counters

- **Created**: On first job for user
- **Updated**: INCR on reservation, DECR on release
- **Retention**: 1 hour TTL
- **Cleanup**: Automatic expiration + reconciliation

---

## Type Definitions (TypeScript)

### Frontend Types

```typescript
// courseai-next/types/database.ts (existing, no changes)
interface Course {
  id: string;
  user_id: string;
  title: string;
  generation_progress: GenerationProgress | null;
  status: CourseStatus;
  generation_started_at: string | null;
  generation_completed_at: string | null;
  last_progress_update: string | null;
  webhook_url: string | null;
  error_message: string | null;
  error_details: Record<string, unknown> | null;
  // ... other fields
}

interface GenerationProgress {
  steps: GenerationStep[];
  percentage: number;
  current_step: number;
  message: string;
  total_steps: number;
  has_documents: boolean;
  lessons_completed: number;
  lessons_total: number;
  // ... other fields
}

interface GenerationStep {
  id: number;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  error_details: Record<string, unknown> | null;
}
```

### Backend Types (NEW)

```typescript
// packages/course-gen-platform/src/shared/types/system-metrics.ts (NEW)
export enum MetricEventType {
  JOB_ROLLBACK = 'job_rollback',
  ORPHANED_JOB_RECOVERY = 'orphaned_job_recovery',
  CONCURRENCY_LIMIT_HIT = 'concurrency_limit_hit',
  WORKER_TIMEOUT = 'worker_timeout',
  RPC_RETRY_EXHAUSTED = 'rpc_retry_exhausted',
  DUPLICATE_JOB_DETECTED = 'duplicate_job_detected',
}

export enum MetricSeverity {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

export interface SystemMetric {
  id?: string;
  event_type: MetricEventType;
  severity: MetricSeverity;
  user_id?: string;
  course_id?: string;
  job_id?: string;
  metadata: Record<string, unknown>;
  timestamp?: string;
}

// packages/course-gen-platform/src/shared/types/concurrency.ts (NEW)
export interface TierConcurrencyLimits {
  FREE: number;
  BASIC: number;
  STANDARD: number;
  TRIAL: number;
  PREMIUM: number;
}

export interface ConcurrencyCheckResult {
  allowed: boolean;
  reason?: 'user_limit' | 'global_limit' | 'success';
  current_user_jobs?: number;
  user_limit?: number;
  current_global_jobs?: number;
  global_limit?: number;
}
```

---

## Summary

This data model defines:

1. ✅ **No new tables** - Only `system_metrics` (for monitoring)
2. ✅ **No changes to existing schema** - Course table already has required fields
3. ✅ **Two new RPCs** - `update_course_progress` (atomic JSONB updates)
4. ✅ **Redis counters** - For concurrency tracking (not SQL)
5. ✅ **BullMQ jobs** - Extended data structure (already in shared-types)

**Backward Compatibility**: ✅ All additive, no breaking changes

**Next Step**: Create API contracts (Phase 1 continuation)
