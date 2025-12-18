# Phase 0: Task Analysis & Delegation Strategy

**Feature**: Stage 1 - Main Entry Orchestrator
**Date**: 2025-10-21
**Status**: T-000 Complete

## Task Classification Matrix

| Task | Domain | Complexity | Executor | Parallel Group | Depends On | Rationale |
|------|--------|------------|----------|----------------|------------|-----------|
| T001 | Setup | Simple | MAIN | None | None | Simple pnpm add command |
| T002 | Validation | Simple | MAIN | Can parallel with T001 | None | Validation checks only |
| **T003** | **Database** | **Complex SQL** | **database-architect** | None | T002 | ENUM types, JSONB, indexes, RLS |
| **T004** | **Database** | **Complex RPC** | **database-architect** | None | T003 | PostgreSQL function, JSONB manipulation |
| **T005** | **Database** | **Migration execution** | **database-architect** | None | T004 | Apply migrations, verify schema |
| T006 | Utilities | Simple file edit | MAIN | **A** (with T007,T008) | T005 | Drop-in replacement ~30 lines |
| T007 | Utilities | Type definitions | MAIN | **A** (with T006,T008) | T005 | TypeScript enums and interfaces |
| T008 | Utilities | Type definitions | MAIN | **A** (with T006,T007) | T005 | TypeScript interfaces |
| T009 | Utilities | Simple function | MAIN | None | T005 | Pure retry function <50 lines |
| **T010** | **Infrastructure** | **Complex Redis** | **infrastructure-specialist** | None | T008 | Redis Lua scripts, atomic operations |
| **T011** | **API** | **Complex endpoint** | **fullstack-nextjs-specialist** | None | T010 | Next.js 15 App Router, REST endpoint, JWT, Zod |
| **T012** | **API** | **Auth logic** | **fullstack-nextjs-specialist** | None | T011 | Supabase Auth JWT validation |
| **T013** | **API** | **Authorization** | **fullstack-nextjs-specialist** | None | T012 | Course ownership RLS verification |
| **T014** | **API** | **Concurrency check** | **fullstack-nextjs-specialist** | None | T013 | Integrate concurrency tracker |
| **T015** | **API** | **Branching logic** | **fullstack-nextjs-specialist** | None | T014 | Workflow decision based on files |
| **T016** | **API** | **BullMQ integration** | **fullstack-nextjs-specialist** | None | T015 | Job creation with priority |
| **T017** | **API** | **RPC call** | **fullstack-nextjs-specialist** | None | T016 | Supabase RPC with retry pattern |
| **T018** | **API** | **Saga compensation** | **fullstack-nextjs-specialist** | None | T017 | Rollback logic on failure |
| **T019** | **API** | **Success response** | **fullstack-nextjs-specialist** | None | T018 | Final Next.js Response |
| T020 | Worker | Small edit (~50 lines) | MAIN | None | T019 | Add orphan detection check |
| T021 | Worker | Small edit | MAIN | None | T020 | Add RPC lifecycle calls |
| T022 | Worker | Small edit | MAIN | None | T021 | Add cleanup in finally block |
| T023 | Frontend | Verification only | MAIN | **B** (with T024) | T022 | Read and verify JSONB structure |
| T024 | Frontend | Verification only | MAIN | **B** (with T023) | T022 | Verify status transitions |
| T025 | Frontend | Simple header edit | MAIN | None | T024 | Add Authorization header |
| T026 | Frontend | Env variable | MAIN | None | T025 | Update .env.local |
| T027 | Polish | Error review | MAIN | **C** (with T028,T030,T031) | T026 | Review error handling |
| T028 | Polish | Config check | MAIN | **C** (with T027,T030,T031) | T026 | Verify LOG_LEVEL env |
| T029 | Polish | Sequential validation | MAIN | None | T028 | Follow quickstart manual tests |
| T030 | Polish | Code cleanup | MAIN | **C** (with T027,T028,T031) | T026 | Type-check, lint, format |
| T031 | Polish | Checklist verification | MAIN | **C** (with T027,T028,T030) | T026 | Verify n8n parity |

## Executor Summary

### Subagent Tasks (13 tasks via subagents)
- **database-architect**: T003, T004, T005 (3 tasks) - Database migrations and RPC
- **infrastructure-specialist**: T010 (1 task) - Redis concurrency tracker
- **fullstack-nextjs-specialist**: T011-T019 (9 tasks) - Next.js App Router API endpoint implementation

### MAIN Agent Tasks (20 tasks)
- Setup: T001, T002
- Utilities: T006, T007, T008, T009
- Worker: T020, T021, T022
- Frontend: T023, T024, T025, T026
- Polish: T027, T028, T029, T030, T031

## Parallel Execution Groups

### Group A: Foundational Utilities (After T005)
**Tasks**: T006, T007, T008
**Executor**: MAIN
**Reason**: All create different files, no dependencies, can run concurrently
**Launch**: Single message with 3 tool calls

### Group B: Frontend Verification (After T022)
**Tasks**: T023, T024
**Executor**: MAIN
**Reason**: Both verification-only, read different parts of frontend code
**Launch**: Single message with 2 tool calls

### Group C: Polish Tasks (After T026)
**Tasks**: T027, T028, T030, T031
**Executor**: MAIN
**Reason**: Different domains (errors, logging, formatting, validation), no file conflicts
**Launch**: Single message with 4 tool calls

## Sequential Blocks (MUST run alone)

### Block 1: Database Migrations (BLOCKING ALL USER STORIES)
**Tasks**: T003 → T004 → T005
**Executor**: database-architect
**Reason**: Migration order matters, RPC depends on table existing
**Blocks**: All of Phase 3-6 (user stories)

### Block 2: Concurrency Tracker
**Task**: T010
**Executor**: infrastructure-specialist
**Reason**: Redis Lua scripts, atomic operations, needs T008 types
**Blocks**: Phase 3 (API endpoint needs this)

### Block 3: API Endpoint Incremental Build
**Tasks**: T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019
**Executor**: api-builder
**Reason**: Building single route.ts file incrementally
**Alternative**: Could batch into layers (T011-T015 validation, T016-T019 business logic)

### Block 4: Worker Updates
**Tasks**: T020 → T021 → T022
**Executor**: MAIN
**Reason**: Sequential edits to same handler file

### Block 5: Frontend Changes
**Tasks**: T025 → T026
**Executor**: MAIN
**Reason**: T026 depends on T025 completion

## Execution Roadmap

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 0: Orchestration Planning (MAIN)                     │
│ T-000 → T-000.1 → T-000.2 (Sequential, this document)      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Setup (MAIN)                                       │
│ T001 → T002 (Can parallel, 30 min)                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Foundational (BLOCKING - Mixed Executors)         │
│ ├─ T003→T004→T005 (database-architect, SEQUENTIAL, 2h)     │
│ │   ⚠️ BLOCKS ALL USER STORIES                             │
│ ├─ After T005: [PARALLEL-GROUP-A] (3 tool calls in 1 msg)  │
│ │   ├─ T006 (MAIN) - Replace logger                        │
│ │   ├─ T007 (MAIN) - System metrics types                  │
│ │   └─ T008 (MAIN) - Concurrency types                     │
│ ├─ T009 (MAIN, standalone, 30 min) - Retry utility         │
│ └─ T010 (infrastructure-specialist, after T008, 1h)         │
│     ⚠️ BLOCKS Phase 3                                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: User Story 1 (api-builder)                        │
│ T011→T012→T013→T014→T015→T016→T017→T018→T019              │
│ (Sequential build, 4-5 hours, 1 subagent call)             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 4-5: User Stories 2-3 (MAIN)                         │
│ ├─ T020→T021→T022 (Sequential, 1-2h)                       │
│ ├─ [PARALLEL-GROUP-B] (2 tool calls in 1 msg)              │
│ │   ├─ T023 (MAIN) - Verify JSONB structure                │
│ │   └─ T024 (MAIN) - Verify status transitions             │
│ └─ T025→T026 (Sequential, 1h)                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 6: Polish (MAIN)                                     │
│ ├─ [PARALLEL-GROUP-C] (4 tool calls in 1 msg)              │
│ │   ├─ T027 - Error handling                               │
│ │   ├─ T028 - Log level config                             │
│ │   ├─ T030 - Code cleanup                                 │
│ │   └─ T031 - n8n parity                                   │
│ └─ T029 (Sequential validation after T028)                 │
└─────────────────────────────────────────────────────────────┘
```

## Subagent Call Strategy

### database-architect (1 call for 3 tasks)
**Single invocation** for T003-T005:
- Reads data-model.md, contracts/rpc-update-course-progress.md
- Creates both migration files
- Applies migrations
- Verifies schema

### infrastructure-specialist (1 call for 1 task)
**Single invocation** for T010:
- Reads quickstart.md Section 4.2
- Reads T008 output (concurrency types)
- Implements ConcurrencyTracker class with Redis Lua scripts
- Returns singleton instance

### api-builder (1 call for 9 tasks)
**Single invocation** for T011-T019:
- Reads contracts/api-endpoint.md
- Reads quickstart.md Section 4.4
- Builds complete route.ts incrementally
- Implements all validation, auth, concurrency, job creation, RPC, rollback
- Returns complete endpoint

**Total subagent calls**: 3 (instead of 11 individual tasks)

## Token Efficiency Calculation

**Without subagents (MAIN does all)**:
- ~150k tokens for migrations + API + concurrency (complex implementations)
- High context usage
- Sequential execution (can't parallelize complex tasks)

**With subagents (proper delegation)**:
- database-architect: ~20k tokens (isolated to DB context)
- infrastructure-specialist: ~15k tokens (Redis-focused)
- api-builder: ~30k tokens (API-focused)
- MAIN: ~20k tokens (simple utilities, coordination)
- **Total**: ~85k tokens
- **Savings**: ~65k tokens (43% reduction)
- **Parallelization**: Group A (3 tasks), Group B (2 tasks), Group C (4 tasks) run concurrently

## Critical Path

**MVP (User Story 1 only)**:
```
T001 → T002 → T003-T005 (database-architect) → T010 (infrastructure-specialist) →
T011-T019 (api-builder) → DONE (MVP ready for testing)
```

**Duration**: ~8-10 hours (with proper subagent delegation)

## Next Step (T-000.1)

Update tasks.md with MANDATORY annotations for each task using this analysis.
