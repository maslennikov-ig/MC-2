# Phase 0: Execution Directives Summary

**Status**: T-000.2 Complete - Ready for implementation
**Date**: 2025-10-21

## Verified Subagents

✅ All required subagents exist and are properly configured:
- **database-architect** - PostgreSQL migrations, JSONB, RLS, RPC functions
- **infrastructure-specialist** - Redis, BullMQ, Lua scripts, concurrency
- **fullstack-nextjs-specialist** - Next.js 15 App Router, Supabase Auth, REST endpoints

## Execution Strategy

### Phase 1: Setup (MAIN agent)
**Execute immediately**:
- T001: Install Pino (DONE)
- T002: Verify infrastructure (DONE - Redis running, Supabase running)

### Phase 2: Foundational (Mixed executors)

#### Step 1: Database Migrations (database-architect subagent)
**Single Task tool call for T003-T005**:
```
Task(
  subagent_type="database-architect",
  description="Create and apply system_metrics and RPC migrations",
  prompt="Execute T003-T005 from tasks.md:

  1. Create courseai-next/supabase/migrations/{timestamp}_create_system_metrics.sql
     - Copy SQL from data-model.md Section 'Migration 1'
     - Include ENUM types, table schema, indexes, RLS policies

  2. Create courseai-next/supabase/migrations/{timestamp}_create_update_course_progress_rpc.sql
     - Copy SQL from contracts/rpc-update-course-progress.md
     - Include JSONB manipulation function, grants for service_role

  3. Apply migrations:
     - Run: pnpm supabase:migration:up
     - Verify system_metrics table exists
     - Verify update_course_progress RPC function exists

  Read: data-model.md, contracts/rpc-update-course-progress.md, quickstart.md
  Return: Migration files created, applied, verified"
)
```

#### Step 2: PARALLEL-GROUP-A (MAIN agent, 3 tool calls in single message)
**Execute T006+T007+T008 simultaneously**:
- T006: Replace logger with Pino (Edit `src/shared/logger/index.ts`)
- T007: Create system-metrics types (Write `src/shared/types/system-metrics.ts`)
- T008: Create concurrency types (Write `src/shared/types/concurrency.ts`)

#### Step 3: Retry Utility (MAIN agent)
**Execute T009**:
- Write `src/shared/utils/retry.ts` from quickstart.md Section 4.3

#### Step 4: Concurrency Tracker (infrastructure-specialist subagent)
**Single Task tool call for T010**:
```
Task(
  subagent_type="infrastructure-specialist",
  description="Implement Redis concurrency tracker",
  prompt="Execute T010 from tasks.md:

  Create packages/course-gen-platform/src/shared/concurrency/tracker.ts:
  - TIER_LIMITS and TIER_PRIORITY constants
  - ConcurrencyTracker class with checkAndReserve() method
  - Redis Lua script for atomic check-and-increment
  - release() method with DECR operations
  - 1-hour TTL on user keys
  - Export singleton instance

  Read: quickstart.md Section 4.2, types/concurrency.ts (from T008)
  Return: Complete tracker module with Redis Lua scripts"
)
```

### Phase 3: API Endpoint (fullstack-nextjs-specialist subagent)

**Single Task tool call for T011-T019**:
```
Task(
  subagent_type="fullstack-nextjs-specialist",
  description="Implement complete course generation API endpoint",
  prompt="Execute T011-T019 from tasks.md:

  Create courseai-next/app/api/coursegen/generate/route.ts with:
  1. T011: POST handler skeleton with Zod validation (courseId UUID, webhookUrl optional)
  2. T012: JWT authentication via Supabase createClient() and auth.getUser()
  3. T013: Course ownership verification (query courses table, check user_id)
  4. T014: Concurrency limit enforcement (import concurrencyTracker, checkAndReserve)
  5. T015: Workflow branching (hasFiles ? DOCUMENT_PROCESSING : STRUCTURE_ANALYSIS)
  6. T016: BullMQ job creation (addJob with priority from tier)
  7. T017: RPC progress update (supabase.rpc with retryWithBackoff, step_id=1)
  8. T018: Saga compensation (rollback job, release slot, write system_metrics on failure)
  9. T019: Success response (200 OK with jobId and Russian message)

  Read: contracts/api-endpoint.md, quickstart.md Section 4.4, concurrency/tracker.ts, utils/retry.ts
  Return: Complete Next.js App Router endpoint with all features"
)
```

### Phase 4-5: Worker Updates & Frontend (MAIN agent)

**Execute sequentially**:
- T020-T022: Worker handler updates (orphan detection, lifecycle calls, cleanup)
- T023+T024: PARALLEL verification (frontend JSONB structure, status transitions)
- T025-T026: Sequential frontend changes (Authorization header, env variable)

### Phase 6: Polish (MAIN agent)

**PARALLEL-GROUP-C (4 tool calls)**:
- T027+T028+T030+T031 in single message

**Then sequential**:
- T029: Quickstart validation

## Total Subagent Calls

- **3 subagent calls** total (vs 13 if done individually = 77% reduction)
- **2 parallel groups** (9 tool calls executed concurrently)
- **Duration estimate**: 6-8 hours (vs 12-16 hours sequential)

## Next Action

Execute Phase 1-2 starting with database-architect for T003-T005.
