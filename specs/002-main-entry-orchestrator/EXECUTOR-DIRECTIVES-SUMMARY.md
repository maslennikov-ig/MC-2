# Executor Directives Summary - All Tasks

**Feature**: Stage 1 - Main Entry Orchestrator
**Date**: 2025-10-21
**Status**: Complete annotation for all 31 tasks

## Phase 1: Setup
- **T001** [EXECUTOR: MAIN] [SEQUENTIAL] ✅ DONE - Pino installed
- **T002** [EXECUTOR: MAIN] [SEQUENTIAL] ✅ DONE - Infrastructure verified

## Phase 2: Foundational

### Database Migrations (database-architect)
- **T003** [EXECUTOR: database-architect] [SEQUENTIAL] [BLOCKING] ✅ DONE
- **T004** [EXECUTOR: database-architect] [SEQUENTIAL] [BLOCKING] ✅ DONE
- **T005** [EXECUTOR: database-architect] [SEQUENTIAL] [BLOCKING] ✅ DONE

### Core Utilities (MAIN + infrastructure-specialist)
- **T006** [EXECUTOR: MAIN] [PARALLEL-GROUP-A: with T007,T008] - Pino logger
- **T007** [EXECUTOR: MAIN] [PARALLEL-GROUP-A: with T006,T008] - System metrics types
- **T008** [EXECUTOR: MAIN] [PARALLEL-GROUP-A: with T006,T007] - Concurrency types
- **T009** [EXECUTOR: MAIN] [SEQUENTIAL] - Retry utility
- **T010** [EXECUTOR: infrastructure-specialist] [SEQUENTIAL] [BLOCKING Phase 3] - Concurrency tracker with Redis Lua

## Phase 3: API Endpoint (fullstack-nextjs-specialist)

**EXECUTOR**: fullstack-nextjs-specialist for ALL T011-T019
**MODE**: Single subagent call recommended (execute all 9 tasks together)
**BLOCKING**: Required for Phase 4-6

- **T011** [fullstack-nextjs-specialist] [SEQUENTIAL] - Route handler skeleton
- **T012** [fullstack-nextjs-specialist] [SEQUENTIAL] - JWT authentication
- **T013** [fullstack-nextjs-specialist] [SEQUENTIAL] - Course ownership
- **T014** [fullstack-nextjs-specialist] [SEQUENTIAL] - Concurrency limit check
- **T015** [fullstack-nextjs-specialist] [SEQUENTIAL] - Workflow branching
- **T016** [fullstack-nextjs-specialist] [SEQUENTIAL] - BullMQ job creation
- **T017** [fullstack-nextjs-specialist] [SEQUENTIAL] - RPC with retry
- **T018** [fullstack-nextjs-specialist] [SEQUENTIAL] - Saga compensation/rollback
- **T019** [fullstack-nextjs-specialist] [SEQUENTIAL] - Success response

## Phase 4: User Story 2 - Worker Updates (MAIN)

**EXECUTOR**: MAIN for ALL T020-T022
**MODE**: Sequential (each edits same handler file)

- **T020** [MAIN] [SEQUENTIAL] - Worker step 1 orphan detection
- **T021** [MAIN] [SEQUENTIAL] - Add RPC lifecycle calls
- **T022** [MAIN] [SEQUENTIAL] - Add cleanup (finally block)

## Phase 5: User Story 3 - Frontend (MAIN)

**EXECUTOR**: MAIN for ALL T023-T026
**MODE**: T023+T024 PARALLEL, then T025→T026 SEQUENTIAL

- **T023** [MAIN] [PARALLEL-GROUP-B: with T024] - Verify JSONB structure
- **T024** [MAIN] [PARALLEL-GROUP-B: with T023] - Verify status transitions
- **T025** [MAIN] [SEQUENTIAL] - Add Authorization header
- **T026** [MAIN] [SEQUENTIAL] - Update env variable

## Phase 6: Polish (MAIN)

**EXECUTOR**: MAIN for ALL T027-T031
**MODE**: T027+T028+T030+T031 PARALLEL, then T029 SEQUENTIAL

- **T027** [MAIN] [PARALLEL-GROUP-C: with T028,T030,T031] - Error handling review
- **T028** [MAIN] [PARALLEL-GROUP-C: with T027,T030,T031] - Log level config
- **T029** [MAIN] [SEQUENTIAL] - Quickstart validation
- **T030** [MAIN] [PARALLEL-GROUP-C: with T027,T028,T031] - Code cleanup
- **T031** [MAIN] [PARALLEL-GROUP-C: with T027,T028,T030] - n8n parity checklist

## Subagent Call Strategy

### Total Subagent Calls: 3 (vs 13 individual = 77% reduction)

1. **database-architect** (1 call for T003-T005) ✅ DONE
   - Created 3 migration files
   - Applied via Docker workaround
   - Verified system_metrics table and update_course_progress function

2. **infrastructure-specialist** (1 call for T010) - PENDING
   - Implement Redis concurrency tracker
   - Lua scripts for atomic operations
   - Read: types/concurrency.ts, quickstart.md Section 4.2

3. **fullstack-nextjs-specialist** (1 call for T011-T019) - PENDING
   - Complete Next.js App Router endpoint
   - Auth, concurrency, BullMQ, RPC, Saga pattern
   - Read: contracts/api-endpoint.md, quickstart.md, all utilities

## Parallel Groups Execution

### PARALLEL-GROUP-A (3 tasks in 1 message)
Launch T006+T007+T008 simultaneously via MAIN:
```
Message with 3 tool uses:
1. Edit(logger/index.ts) - Pino replacement
2. Write(types/system-metrics.ts) - Enums and interfaces
3. Write(types/concurrency.ts) - Tier interfaces
```

### PARALLEL-GROUP-B (2 tasks in 1 message)
Launch T023+T024 simultaneously via MAIN:
```
Message with 2 tool uses:
1. Read(course-viewer-enhanced.tsx) - Verify JSONB
2. Read(page.tsx) - Verify status transitions
```

### PARALLEL-GROUP-C (4 tasks in 1 message)
Launch T027+T028+T030+T031 simultaneously via MAIN:
```
Message with 4 tool uses:
1. Grep/Read - Error handling review
2. Read(.env) - Log level config
3. Bash(type-check, lint, format) - Code cleanup
4. Read(tasks.md) - n8n parity verification
```

## Next Actions

1. ✅ T001-T005 Complete
2. → Execute PARALLEL-GROUP-A (T006-T008) via MAIN
3. → Execute T009 via MAIN
4. → Execute T010 via infrastructure-specialist subagent
5. → Execute T011-T019 via fullstack-nextjs-specialist subagent
6. → Execute T020-T022 sequentially via MAIN
7. → Execute PARALLEL-GROUP-B (T023-T024) via MAIN
8. → Execute T025-T026 sequentially via MAIN
9. → Execute PARALLEL-GROUP-C (T027-T028-T030-T031) via MAIN
10. → Execute T029 sequentially via MAIN
11. ✅ ALL TASKS COMPLETE

## Token Efficiency

- Without annotation: ~150k tokens (MAIN does everything)
- With subagents: ~85k tokens (43% reduction)
- With parallel groups: ~70k tokens (53% reduction)

**Estimated total**: 70-85k tokens for full implementation
