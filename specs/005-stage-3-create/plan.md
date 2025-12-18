# Implementation Plan: Stage 3 - Document Summarization

**Branch**: `005-stage-3-create` | **Date**: 2025-10-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-stage-3-create/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Stage 3 implements document summarization to reduce token costs for downstream stages (Stage 4-6). System must generate high-quality summaries for uploaded documents using generative LLM, validate quality using semantic similarity (Jina-v3 embeddings), and handle multilingual content (Russian + English). This is the first stage using generative AI (previous stages used only embeddings). Implementation follows research-first approach to select optimal AI framework, summarization strategy, and model before production coding.

**Key Requirements**:
- Research-validated AI framework selection (LangChain/LangGraph/direct API/Vercel AI SDK)
- Summarization strategy benchmarking (Map-Reduce/Refine/Map-Rerank/Hierarchical)
- Quality validation via semantic similarity (>0.75 cosine similarity threshold)
- Multilingual support (Russian + English with language-specific token estimation)
- Cost optimization (bypass summarization for small documents, track API usage)
- Reliability (reuse Stage 0/1 error handler pattern with LLM-specific retry logic)

## Technical Context

**Language/Version**: TypeScript 5.3.3 (Node.js 20+)
**Primary Dependencies**:
- **AI Framework**: NEEDS CLARIFICATION (LangChain.js / LangGraph / direct OpenRouter API / Vercel AI SDK)
- **LLM Provider**: OpenRouter API (or selected provider from research)
- **Model**: NEEDS CLARIFICATION (MVP: `openai/gpt-oss-20b` Llama 3.3 70B, alternatives: GPT-4 Turbo, Claude 3.5, Gemini 1.5)
- **Embeddings**: Jina-v3 (768D, multilingual) - existing from Stage 2
- **Orchestration**: BullMQ with Redis
- **Database**: PostgreSQL (Supabase) for metadata, Qdrant for vectors
- **Logging**: Pino structured JSON
- **Vector DB**: Qdrant Cloud (HNSW index, existing from Stage 0)

**Storage**:
- Summaries → `file_catalog.processed_content` (TEXT field, overwrite strategy)
- Metadata → `file_catalog` table (processing_method, timestamps, cost data)
- Vectors → Qdrant collections (reuse existing Jina-v3 embeddings from Stage 2)
- Error logs → `error_logs` table

**Testing**:
- Unit: Vitest (token estimation, language detection, quality validation logic)
- Integration: Full workflow tests (E2E from job → summary → DB save → quality check)
- Contract: tRPC endpoint validation
- Research: Human eval (10-15 docs) + semantic similarity benchmark (50-100 docs)

**Target Platform**: Linux server (Node.js 20+), Supabase cloud, Qdrant cloud, Redis cloud

**Project Type**: Monorepo (3 packages: course-gen-platform, shared-types, trpc-client-sdk)

**Performance Goals**:
- Small documents (<threshold TBD): <30 seconds processing
- Large documents (200 pages): NEEDS CLARIFICATION (MVP assumes <5 minutes, research will validate)
- Semantic similarity quality: >0.75 cosine similarity (original text vs summary)
- API error rate: <1% (excluding rate limits)
- Uptime: 99.5% for summarization jobs

**Constraints**:
- No PII filtering for MVP (user responsibility, future Anonymizer integration)
- No real-time streaming (batch/async via BullMQ)
- No multi-document synthesis (1:1 file_id → summary mapping)
- No interactive refinement (one-shot summarization)
- Stage 4 strict barrier (ALL documents must be 100% complete before Stage 4 starts)

**Scale/Scope**:
- Tier-based concurrency: TRIAL/STANDARD=5, FREE=1, BASIC=2, PREMIUM=10
- Token budget: NEEDS CLARIFICATION (MVP: 3K no-summary threshold, 200K final size)
- Multilingual: Russian + English (MVP: 19 language ratios may simplify to 3-5)
- Cost tracking per organization for tier-based billing

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### ✅ I. Reliability First (PASS)
- **Retry logic**: Reuse Stage 0/1 error handler pattern (`error-handler.ts:35`) with LLM-specific transient patterns (rate limit, 429, quota exceeded)
- **Exponential backoff**: 3 attempts, 1s base delay (existing pattern)
- **Circuit breaker**: After retries exhausted → mark failed, keep in queue for manual intervention (no automatic fallback)
- **Quality gate**: Semantic similarity >0.75 with hybrid escalation retry (P2: switch strategy → upgrade model → increase tokens)
- **Stage 4 barrier**: Strict 100% completion requirement (ALL N documents must succeed before Stage 4 starts)
- **Progress persistence**: BullMQ job state + `file_catalog` metadata

### ✅ II. Atomicity & Modularity (PASS)
- **New modules planned** (<200-300 lines each):
  - `summarization-worker.ts` - BullMQ worker for summarization jobs
  - `summarization-service.ts` - Business logic (select strategy, call LLM, validate quality)
  - `token-estimator.ts` - Language detection and token counting
  - `quality-validator.ts` - Semantic similarity check using Jina-v3
  - `llm-client.ts` - Framework abstraction layer (selected in research)
- **Reuse existing**: `error-handler.ts`, `logger.ts`, `course-progress.ts`, Qdrant client
- **No monoliths**: Each summarization strategy (Map-Reduce, Refine, etc.) in separate file

### ✅ III. Spec-Driven Development (PASS)
- **Spec**: `/specs/005-stage-3-create/spec.md` ✅ COMPLETE (7 clarifications documented)
- **Plan**: This file (plan.md) - generated by `/speckit.plan`
- **Research**: Phase 1 will produce `research.md` with architecture decision
- **Data model**: Phase 2 will produce `data-model.md`
- **Contracts**: Phase 2 will generate tRPC schemas in `/contracts/`
- **Tasks**: Phase 3 via `/speckit.tasks` (not part of this command)

### ⚠️ IV. Incremental Testing (DEFERRED to Phase 1)
- **Research phase (P0)**: Human eval (10-15 docs) + semantic similarity benchmark (50-100 docs)
- **Basic integration (P1)**: Integration tests for E2E workflow (job → summary → DB save)
- **Production optimization (P2)**: Quality gate tests, retry logic tests
- **TDD**: Encouraged but not enforced
- **Coverage**: Track but don't block (constitution principle)

### ✅ V. Observability & Monitoring (PASS)
- **Structured logs**: Pino JSON with correlation IDs (reuse existing logger)
- **LLM call logging**: Request ID, model, input/output tokens, latency, cost, error classification
- **Quality metrics**: Semantic similarity score, retry attempts, processing time
- **Progress tracking**: `update_course_progress` RPC with Russian step names
- **BullMQ dashboard**: Real-time job monitoring at `/admin/queues`
- **Cost tracking**: Per-document API usage for tier-based billing (P3)

### ✅ VI. Multi-Tenancy & Scalability (PASS)
- **RLS**: Existing organization-level isolation via JWT custom claims
- **Tier-based concurrency**: Reuse Stage 1 pattern (TRIAL/STANDARD=5, PREMIUM=10)
- **Horizontal scaling**: BullMQ worker processes (existing infrastructure)
- **Token usage tracking**: Per organization for billing
- **File isolation**: Existing `/uploads/{organizationId}/{courseId}/` structure

### ⚠️ VII. AI Model Flexibility (PARTIALLY ADDRESSED - Research needed)
- **Framework abstraction**: NEEDS CLARIFICATION (research will select framework)
- **Model selection**: NEEDS CLARIFICATION (research will benchmark models)
- **Prompt externalization**: TBD in research phase
- **Cost estimation**: NEEDS CLARIFICATION (depends on model pricing)
- **Fallback models**: TBD in research phase
- **Embeddings**: ✅ Reuse existing Jina-v3 from Stage 2 for quality validation

### ✅ VIII. Production-Ready Security (PASS)
- **Authentication**: Existing JWT with Supabase Auth (reuse)
- **RLS policies**: Existing organization-level isolation
- **No PII filtering**: Documented limitation (MVP: user responsibility, future Anonymizer integration)
- **API security**: Existing tRPC authentication middleware
- **Audit trail**: Structured logs with user_id, organization_id, correlation IDs

### 📋 Architecture Standards Compliance

| Standard | Compliance | Notes |
|----------|-----------|-------|
| **Data Storage** | ✅ PASS | PostgreSQL for metadata, Qdrant for vectors (existing) |
| **Orchestration** | ✅ PASS | BullMQ with Saga pattern, retry logic, progress tracking |
| **API Layer** | ✅ PASS | tRPC for internal APIs, Pino logging, correlation IDs |
| **Embeddings & Vector Search** | ✅ PASS | Reuse existing Jina-v3 + Qdrant for quality validation |

### Gate Result: ✅ PASS (with research-first approach)

**Justification**: All constitution principles are addressed. Remaining NEEDS CLARIFICATION markers are intentionally deferred to P0 research phase as documented in spec. No complexity violations - research phase will resolve framework/model selection before implementation.

## Project Structure

### Documentation (this feature)

```
specs/005-stage-3-create/
├── spec.md              # ✅ COMPLETE (7 clarifications, P0-P3 user stories)
├── plan.md              # ✅ THIS FILE (Phase 0-2 complete)
├── research/            # Phase 1 output (created below)
│   └── architecture-decision.md  # Framework, strategy, model selection with benchmarks
├── data-model.md        # Phase 2 output (created below)
├── quickstart.md        # Phase 2 output (created below)
├── contracts/           # Phase 2 output (created below)
│   ├── summarization-job.schema.json
│   ├── summarization-result.schema.json
│   └── trpc-routes.md
└── tasks.md             # Phase 3 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
packages/
├── course-gen-platform/           # Main application package
│   ├── src/
│   │   ├── orchestrator/          # Existing BullMQ orchestrator
│   │   │   ├── workers/
│   │   │   │   ├── stage2-document-processing.worker.ts  # ✅ Existing (Stage 2)
│   │   │   │   └── stage3-summarization.worker.ts        # 🆕 NEW (this feature)
│   │   │   ├── services/
│   │   │   │   ├── error-handler.ts                      # ✅ Existing (reuse)
│   │   │   │   ├── logger.ts                             # ✅ Existing (reuse)
│   │   │   │   ├── course-progress.ts                    # ✅ Existing (reuse)
│   │   │   │   ├── summarization-service.ts              # 🆕 NEW (business logic)
│   │   │   │   ├── token-estimator.ts                    # 🆕 NEW (language detection, counting)
│   │   │   │   ├── quality-validator.ts                  # 🆕 NEW (semantic similarity)
│   │   │   │   └── llm-client.ts                         # 🆕 NEW (framework abstraction)
│   │   │   └── strategies/                               # 🆕 NEW (research-validated)
│   │   │       ├── map-reduce.ts                         # If selected in research
│   │   │       ├── refine.ts                             # If selected in research
│   │   │       └── index.ts                              # Strategy factory
│   │   ├── server/                # Existing Next.js app
│   │   │   └── trpc/
│   │   │       └── routers/
│   │   │           └── summarization.ts                  # 🆕 NEW (status endpoints)
│   │   └── shared/                # Existing shared utilities
│   │       └── integrations/
│   │           └── qdrant/
│   │               └── client.ts                         # ✅ Existing (reuse for quality check)
│   ├── supabase/
│   │   └── migrations/
│   │       └── 20251028_stage3_summary_metadata.sql      # 🆕 NEW (processed_content metadata)
│   └── package.json
├── shared-types/                  # Existing shared types
│   └── src/
│       ├── summarization-job.ts                          # 🆕 NEW
│       ├── summarization-result.ts                       # 🆕 NEW
│       └── index.ts                                      # Update exports
└── trpc-client-sdk/               # Existing tRPC client
    └── src/
        └── routes/
            └── summarization.ts                          # 🆕 NEW (client types)

tests/                             # Test structure
├── unit/
│   ├── token-estimator.test.ts                           # 🆕 NEW
│   └── quality-validator.test.ts                         # 🆕 NEW
└── integration/
    └── stage3-summarization.test.ts                      # 🆕 NEW (E2E workflow)
```

**Structure Decision**:
- **Monorepo architecture**: 3 packages (course-gen-platform, shared-types, trpc-client-sdk)
- **Worker location**: `packages/course-gen-platform/src/orchestrator/workers/` (consistent with Stage 2)
- **Service layer**: `packages/course-gen-platform/src/orchestrator/services/` (reuse existing error handler, logger)
- **Strategy pattern**: `packages/course-gen-platform/src/orchestrator/strategies/` (research will determine which strategies to implement)
- **Shared types**: `packages/shared-types/src/` (job schemas, result types)
- **Database migrations**: `packages/course-gen-platform/supabase/migrations/` (existing pattern)

## Orchestration Strategy

_Added by Phase 0 of /speckit.plan - Used by /speckit.tasks to generate Phase 0 delegation plan_

### Available Subagents

List subagents available in `.claude/agents/`:

- ✅ **database-architect** - Database migrations, RPC functions, schema design
  - **Use for**: Stage 3 migration (processed_content metadata columns)

- ✅ **api-builder** - tRPC/REST endpoints, authentication, API validation
  - **Use for**: Summarization status endpoint, tRPC route creation

- ✅ **infrastructure-specialist** - Redis, BullMQ, worker config, queue management
  - **Use for**: Stage 3 worker setup, BullMQ job type registration, retry configuration

- ✅ **fullstack-nextjs-specialist** - Complex Next.js frontend + backend integration
  - **Use for**: Progress UI updates (if needed), tRPC integration with frontend

- ✅ **integration-tester** - E2E workflow testing, contract validation
  - **Use for**: Stage 3 E2E tests, quality validation tests, research benchmarking

- ✅ **code-reviewer** - Quality validation, constitution compliance checks
  - **Use for**: Final review before merge (P2/P3 completion)

- ❌ **qdrant-specialist** - Vector DB operations, embedding lifecycle
  - **NOT NEEDED**: Reuse existing Qdrant client from Stage 2, no new collections

- ❌ **problem-investigator** - Deep debugging, root cause analysis
  - **NOT NEEDED**: Only invoke if complex issues arise during implementation

### Executor Assignment Rules

**Phase 0 of /speckit.tasks will use these rules to annotate tasks with MANDATORY executor directives:**

| Task Domain | Complexity | Executor | Rationale |
|-------------|------------|----------|-----------|
| **Research & Benchmarking** | All | integration-tester | Human eval + automated semantic similarity benchmark on 50-100 docs |
| **Database migrations** | All | database-architect | `processed_content` metadata columns, migration expertise |
| **BullMQ worker setup** | Complex | infrastructure-specialist | Job type registration, retry config, worker lifecycle |
| **BullMQ worker logic** | Simple edits | MAIN | Minor updates to existing worker patterns |
| **LLM service layer** | Complex | MAIN | Business logic with research-validated framework |
| **Token estimation** | All | MAIN | Language detection, character→token conversion logic |
| **Quality validation** | All | MAIN | Semantic similarity computation using existing Qdrant client |
| **tRPC endpoints** | Simple CRUD | MAIN | Status check endpoints, basic queries |
| **tRPC endpoints** | Complex | api-builder | Authentication, validation, error handling if needed |
| **Type definitions** | All | MAIN | Job schemas, result types in shared-types package |
| **Unit tests** | All | MAIN | Token estimator tests, quality validator tests |
| **Integration tests** | E2E workflows | integration-tester | Full Stage 3 workflow validation, quality gate tests |
| **Frontend progress UI** | Minor edits | MAIN | Update existing progress component with "X/N documents" |
| **Frontend progress UI** | Complex state | fullstack-nextjs-specialist | If new React patterns needed |
| **Final review** | All | code-reviewer | Constitution compliance, code quality, documentation |

### Parallelization Strategy

**Parallel Groups** (tasks that MUST run together for efficiency):

- **PARALLEL-GROUP-A (Research Phase - P0)**:
  - Framework benchmarking (LangChain vs LangGraph vs direct API vs Vercel AI SDK)
  - Model benchmarking (Llama 3.3 vs GPT-4 vs Claude 3.5 vs Gemini 1.5)
  - Strategy benchmarking (Map-Reduce vs Refine vs Map-Rerank)
  - _Rationale_: Independent research tasks on different document samples

- **PARALLEL-GROUP-B (Type Definitions - P1)**:
  - Create `summarization-job.ts` in shared-types
  - Create `summarization-result.ts` in shared-types
  - Create migration schema draft
  - _Rationale_: No dependencies between type files

- **PARALLEL-GROUP-C (Service Layer - P2)**:
  - Implement `token-estimator.ts` + unit tests
  - Implement `quality-validator.ts` + unit tests
  - Implement `llm-client.ts` abstraction
  - _Rationale_: Independent utilities with separate unit tests

- **PARALLEL-GROUP-D (Validation & Polish - P3)**:
  - Code review
  - Integration test runs
  - Quickstart.md testing
  - Documentation updates
  - _Rationale_: Final validation tasks can run concurrently

**Sequential Blocks** (tasks that MUST run alone):

- **Database migration**: T003 (Create migration) → BLOCKS → All implementation tasks
  - _Rationale_: Schema must exist before worker can save data

- **Worker implementation**: T010 (Worker skeleton) → T011 (Service integration) → T012 (Quality gate)
  - _Rationale_: Sequential build-up of worker functionality

- **Research phase**: P0 research → BLOCKS → P1/P2 implementation
  - _Rationale_: Cannot implement until framework/strategy/model selected

**Blocking Tasks** (prevent next phase from starting):

- **P0 Research (User Story 1)** → BLOCKS → P1 Basic Integration
  - Architecture decision must complete before implementation begins

- **P1 Basic Integration (User Story 2)** → BLOCKS → P2 Production Optimization
  - Basic LLM workflow must work before adding quality gates

- **P2 Production Optimization (User Story 3)** → OPTIONAL → P3 Cost Optimization
  - Quality validation must be solid before cost tracking (P3 can partially overlap)

- **Database migration (T003)** → BLOCKS → All worker tasks
  - Schema must exist before worker implementation

## Complexity Tracking

_Fill ONLY if Constitution Check has violations that must be justified_

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|-----------|--------------------------------------|
| _No violations detected_ | N/A | N/A |

**Notes**:
- Research-first approach defers framework selection (not a violation - constitution allows research phase)
- No new infrastructure components (reuse BullMQ, Qdrant, PostgreSQL)
- No repository pattern (direct database access via Supabase client - constitution compliant)
- Strategy pattern for summarization approaches (justified by research need to compare multiple approaches)
