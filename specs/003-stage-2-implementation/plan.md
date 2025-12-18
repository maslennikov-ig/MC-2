# Implementation Plan: Stage 2 Implementation Verification and Completion

**Branch**: `003-stage-2-implementation` | **Date**: 2025-10-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-stage-2-implementation/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

**Primary Requirement**: Verify that all Stage 0-1 infrastructure components (file upload, text extraction, vectorization, worker handler) are correctly implemented for Stage 2 requirements, fix critical database tier mismatches (missing TRIAL tier, incorrect BASIC formats), and create comprehensive integration tests for the DOCUMENT_PROCESSING worker handler.

**Technical Approach**: Use Supabase MCP to audit and migrate database schema, create integration test suite covering all 5 tiers (TRIAL, FREE, BASIC, STANDARD, PREMIUM) with tier-specific validation, validate end-to-end workflow through BullMQ with error handling and retry logic.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 15, Node.js 20+)
**Primary Dependencies**: Next.js, tRPC, Supabase (PostgreSQL), BullMQ, Redis, Qdrant, Jina-v3, Docling
**Storage**: Supabase PostgreSQL (RLS-enabled), Qdrant Cloud (vector storage), Supabase Storage (file uploads)
**Testing**: Vitest (unit tests), Vitest + Supabase MCP (integration tests), pgTAP (RLS policy tests)
**Target Platform**: Linux server (production), WSL2 (development)
**Project Type**: Web application (Next.js monorepo with tRPC backend)
**Performance Goals**: Document processing <30s for <5MB PDFs (aspirational), Qdrant retry <3.5s total, BullMQ stalled recovery <90s
**Constraints**: Defense-in-depth tier validation (frontend + backend), transactional DDL migrations, zero production data migration, standard error logging (error + stack + file/user/org metadata)
**Scale/Scope**: 5 subscription tiers, 4 infrastructure components to verify, 20+ integration test cases (3 positive + 1 negative per tier)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### I. Reliability First ✅ PASS
- **Error scenarios**: Edge cases documented (worker crashes, Qdrant failures, quota violations, timeout handling)
- **Retry mechanisms**: Differentiated retry policies (Qdrant: 5×100-1600ms, Docling: 3×2-8s with 60s timeout)
- **Progress persistence**: BullMQ job state + file_catalog status updates + error_logs table for permanent failures
- **Saga pattern**: Not applicable for this verification feature (no complex multi-stage workflows to implement)
- **Orphan recovery**: BullMQ stalled job detection (stalledInterval: 30s, maxStalledCount: 2, lockDuration: 60s)
- **Idempotency**: Existing worker handler presumed idempotent (verification only, no new implementation)

### II. Atomicity & Modularity ✅ PASS
- **File size limit**: All deliverables are verification/testing artifacts (migrations, tests, validation scripts)
- **No new modules >300 lines**: Integration tests broken down by tier, migrations atomic per change
- **Independent testability**: Integration tests isolated by tier, fixtures reusable from common directory

### III. Spec-Driven Development ✅ PASS
- **Specification**: Complete with 10 clarifications, 3 user stories, 20 functional requirements, 14 success criteria
- **Implementation plan**: This document (plan.md)
- **Data model**: Database tier structure corrections documented in spec (TRIAL addition, BASIC formats)
- **API contracts**: Not applicable (verification of existing worker handler, no new APIs)
- **Tasks**: To be generated via `/speckit.tasks` after planning phase

### IV. Incremental Testing ✅ PASS
- **Unit Tests**: Tier validation logic, file format restrictions, quota checks
- **Integration Tests**: DOCUMENT_PROCESSING worker end-to-end (20+ test cases across 5 tiers)
- **Contract Tests**: Not applicable (no LMS integration in this verification stage)
- **E2E Tests**: Not applicable (verification focused, not full user journey)
- **TDD approach**: Integration tests written to validate existing implementation correctness

### V. Observability & Monitoring ✅ PASS
- **Structured logs**: Pino logging already in place (constitution standard)
- **Correlation IDs**: Existing infrastructure (not modified in this verification)
- **Key metrics**: error_logs table captures permanent failures with standard context (error + stack + file/user/org metadata + severity)
- **System metrics**: BullMQ dashboard already available, stalled job metrics tracked
- **Alerts**: Not in scope for verification (infrastructure validation only)

### VI. Multi-Tenancy & Scalability ✅ PASS
- **RLS enforcement**: Database tier corrections ensure RLS policies work correctly across all 5 tiers
- **JWT custom claims**: Existing auth infrastructure (not modified)
- **Organization isolation**: Verified via integration tests (user_id + organization_id in error_logs)
- **File storage structure**: Existing `/uploads/{organizationId}/{courseId}/` (validated, not changed)
- **Queue priorities**: Not modified in this verification
- **Horizontal scaling**: BullMQ worker configuration unchanged

### VII. AI Model Flexibility ✅ PASS
- **Model abstraction**: Jina-v3 embeddings validated in integration tests (no changes to model layer)
- **Configuration**: Existing Qdrant + Jina-v3 + Docling integration verified
- **Fallback models**: Not applicable (verification only)
- **Prompt externalization**: Not applicable (no AI generation in this verification)

### VIII. Production-Ready Security ✅ PASS
- **JWT authentication**: Tier validation tests verify auth context (user_id, organization_id)
- **RBAC**: Not modified (verification tests use existing roles)
- **Security scanning**: Not in scope (verification focused on infrastructure correctness, not vulnerabilities)
- **RLS policies**: Tier structure corrections ensure RLS works for all 5 tiers (TRIAL, FREE, BASIC, STANDARD, PREMIUM)
- **Defense-in-depth**: FR-016 enforces dual validation (frontend disabled UI + backend 403)

### Architecture Standards ✅ PASS
- **Data Storage**: Qdrant vectors validated, file_catalog metadata verified, error_logs table added (isolated from metrics)
- **Orchestration**: BullMQ DOCUMENT_PROCESSING queue validated with stalled job detection config
- **API Layer**: tRPC endpoints validated (tier restrictions, quota checks)
- **Embeddings**: Jina-v3 (768D) + hierarchical chunking (1500/400/50 tokens) validated in integration tests

**OVERALL STATUS**: ✅ **PASS** - No constitution violations. This is a verification and correction feature that validates existing Stage 0-1 infrastructure compliance with Stage 2 requirements.

## Project Structure

### Documentation (this feature)

```
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
packages/course-gen-platform/
├── supabase/
│   ├── migrations/                      # Database migrations (TRIAL tier, BASIC formats, error_logs table)
│   └── functions/                        # Supabase Edge Functions (if needed)
├── src/
│   ├── orchestrator/
│   │   ├── handlers/
│   │   │   └── document-processing.ts   # Worker handler to validate (existing)
│   │   ├── queues/
│   │   │   └── document-processing.ts   # BullMQ queue config (existing)
│   │   └── types/
│   │       ├── tier.ts                   # Tier types to validate/update
│   │       └── error-logs.ts             # New error_logs types
│   ├── lib/
│   │   ├── tier-validator.ts            # Tier validation logic to verify
│   │   ├── file-validator.ts            # File format validation to verify
│   │   └── logger.ts                     # Pino logger (existing)
│   └── app/
│       └── api/trpc/routers/            # tRPC endpoints to validate
└── tests/
    ├── integration/
    │   ├── document-processing-worker.test.ts  # Main integration test suite
    │   ├── tier-validation.test.ts             # Tier-specific validation tests
    │   └── fixtures/
    │       └── common/                          # Shared test files (PDF, DOCX, TXT, MD)
    └── unit/
        ├── tier-validator.test.ts
        └── file-validator.test.ts

docs/
├── reports/                              # Permanent verification reports
│   └── verification/
│       └── 2025-10/
│           └── 2025-10-24-stage-2-verification.md
└── SUPABASE-DATABASE-REFERENCE.md       # To be updated with tier corrections
```

**Structure Decision**: This is a monorepo web application (Next.js + tRPC + Supabase). The feature primarily involves:
1. **Database migrations** in `supabase/migrations/` (tier corrections + error_logs table)
2. **Integration tests** in `tests/integration/` (worker handler validation)
3. **Type definitions** in `src/orchestrator/types/` (tier and error_logs types)
4. **Validation logic verification** in `src/lib/` (existing tier/file validators)
5. **Documentation updates** in `docs/` (database reference, roadmap)

## Orchestration Strategy

_Added by Phase 0 of /speckit.plan - Used by /speckit.tasks to generate Phase 0 delegation plan_

### Available Subagents

Agents available in `.claude/agents/` for this feature:

- ✅ **database-architect** - Supabase migrations, schema design, RLS policies, error_logs table creation
- ✅ **integration-tester** - Integration test suite creation, BullMQ workflow validation, tier-specific test scenarios
- ✅ **code-reviewer** - Quality validation, constitution compliance checks, type-check/build verification
- ✅ **infrastructure-specialist** - BullMQ config validation, Redis setup, stalled job detection tuning
- ⚠️ **api-builder** - tRPC endpoint validation (minimal usage, mostly verification not creation)
- ⚠️ **fullstack-nextjs-specialist** - Complex frontend tier validation UI (if needed for defense-in-depth testing)

**Note**: Most tasks are verification/validation focused, so MAIN session will handle the majority. Specialists used only for complex domain-specific work.

### Executor Assignment Rules

**Phase 0 of /speckit.tasks will use these rules to annotate tasks with MANDATORY executor directives:**

| Task Domain | Complexity | Executor | Rationale |
|-------------|------------|----------|-----------|
| Database tier audit | All | database-architect | Supabase MCP expertise, schema inspection via SQL |
| Database migrations | All | database-architect | Transactional DDL, ENUM manipulation, error_logs table creation |
| Integration test creation | Complex | integration-tester | BullMQ workflow testing, tier-specific scenarios, fixture management |
| Integration test execution | All | integration-tester | End-to-end validation with Supabase MCP + BullMQ |
| Type definitions | Simple | MAIN | Straightforward TypeScript interfaces (tier types, error_logs types) |
| Validation script creation | Simple | MAIN | Basic SQL queries for tier/quota verification |
| Documentation updates | All | MAIN | Markdown editing (SUPABASE-DATABASE-REFERENCE.md, roadmap) |
| Code inspection | All | MAIN | Reading existing tier-validator.ts, file-validator.ts logic |
| Quality gates | All | code-reviewer | Type-check, build validation, constitution compliance |
| BullMQ config validation | Complex | infrastructure-specialist | Stalled job detection tuning, queue config verification |

### Parallelization Strategy

**Parallel Groups** (tasks that can run concurrently for efficiency):

- **PARALLEL-GROUP-A: Database Audit + Code Inspection** (different domains, no dependencies)
  - Task: Audit database tier structure via Supabase MCP
  - Task: Inspect tier-validator.ts and file-validator.ts logic
  - Task: Inspect document-processing.ts worker handler

- **PARALLEL-GROUP-B: Documentation Prep** (can run during or after Phase 1 research)
  - Task: Create fixtures/common/ directory structure
  - Task: Prepare test data files (sample PDF, DOCX, TXT, MD)
  - Task: Set up docs/reports/verification/2025-10/ directory

**Sequential Blocks** (tasks that MUST run in order):

1. **Phase 1: Database Fixes** (BLOCKING - must complete before tests)
   - Audit database → Create migrations (TRIAL tier) → Create migrations (BASIC formats) → Create error_logs table → Apply migrations → Validate migrations

2. **Phase 2: Integration Tests** (BLOCKED BY Phase 1)
   - Create test fixtures → Write integration tests (tier-by-tier) → Run test suite → Fix any revealed bugs → Re-run tests

3. **Phase 3: Documentation** (BLOCKED BY Phase 2)
   - Update SUPABASE-DATABASE-REFERENCE.md → Update IMPLEMENTATION_ROADMAP_EN.md → Generate verification report

**Blocking Tasks** (prevent next phase from starting):

- ⛔ **Database migrations (Phase 1)** → BLOCKS → Integration tests (Phase 2)
  - Rationale: Tests require correct tier structure (TRIAL, BASIC formats) to validate properly
- ⛔ **Integration test suite passing (Phase 2)** → BLOCKS → Documentation updates (Phase 3)
  - Rationale: Cannot document "Stage 2 complete" until tests prove correctness

**Critical Path** (from spec):
1. Database tier audit via MCP (Phase 1) - **BLOCKS everything**
2. SQL migrations to fix tier structure + create error_logs table (Phase 1) - **BLOCKS integration tests**
3. Integration test creation and validation (Phase 2) - **BLOCKS Stage 2 completion**
4. Documentation updates and final verification (Phase 3) - Final deliverable

## Complexity Tracking

_Fill ONLY if Constitution Check has violations that must be justified_

| Violation                  | Why Needed         | Simpler Alternative Rejected Because |
| -------------------------- | ------------------ | ------------------------------------ |
| [e.g., 4th project]        | [current need]     | [why 3 projects insufficient]        |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient]  |
