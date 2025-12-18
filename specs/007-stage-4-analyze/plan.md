# Implementation Plan: Stage 4 - Course Content Analysis

**Branch**: `007-stage-4-analyze` | **Date**: 2025-10-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-stage-4-analyze/spec.md`

## Summary

Stage 4 (Analyze) processes course materials (topic, documents, requirements) and generates a comprehensive English-language analysis prompt for Stage 5 (Generation). The system synthesizes user input, document summaries from Stage 3, and LLM knowledge to create structured generation requirements. Key features include multi-phase multi-model orchestration (cheap models for simple tasks, expensive models for expert analysis), research flag detection for time-sensitive content, and Stage 3 barrier enforcement (100% document processing completion required).

**Technical Approach**:
- Multi-phase analysis with per-phase model selection (20B for classification/scope, 120B for deep expert analysis, adaptive for document synthesis)
- **LangChain + LangGraph** for multi-phase orchestration (StateGraph with conditional routing)
- **OpenRouter integration** via ChatOpenAI with custom baseURL
- **Custom Supabase observability** (token tracking, cost calculation) - NO LangSmith
- Real-time progress tracking via WebSocket/polling (6 phases, 30s-10min window)
- Quality validation via semantic similarity (patterns from Stage 3)
- Strict Stage 3 barrier enforcement via RPC

## Technical Context

**Language/Version**: TypeScript 5.x + Node.js 20+
**Primary Dependencies**:
- **@langchain/core v0.3+** - LangChain TypeScript framework
- **@langchain/openai** - ChatOpenAI wrapper for OpenRouter
- **@langchain/langgraph** - StateGraph for workflow orchestration
- OpenRouter API (300+ models via custom baseURL)
- Jina-v3 embeddings (quality validation, semantic similarity) - inherited from Stage 0
- BullMQ (worker orchestration) - inherited from Stage 0
- Zod (schema validation) - inherited from Stage 3
- Supabase PostgreSQL (database, RPCs, custom metrics)

**Architectural Decision**: [ADR-001](../../docs/ADR-001-LLM-ORCHESTRATION-FRAMEWORK.md) - LangChain selected after evaluating 11 frameworks (scored 8.4/10)

**Storage**:
- PostgreSQL (courses, file_catalog, llm_model_config tables)
- Analysis output stored in JSONB fields (courses.analysis_result)
- Progress tracking via generation_progress JSONB

**Testing**: Vitest (unit), Supertest (contract), BullMQ test harness (integration)
**Target Platform**: Linux server (production), Docker (development)
**Project Type**: Monorepo (packages/course-gen-platform)

**Performance Goals**:
- Analysis completion: 30s-10min (quality over speed, 10min = technical timeout)
- Minimum 10 lessons constraint enforcement (hard validation)
- 90%+ retry resolution rate (quality gates with model escalation)
- <5% research flag rate (conservative flagging)

**Constraints**:
- MUST use English for analysis output (internal processing language)
- MUST enforce Stage 3 barrier (100% document processing completion)
- MUST validate minimum 10 lessons (hard failure if <10)
- MUST use multi-phase multi-model orchestration (cost optimization + quality)
- Real-time progress updates required (6 phases, WebSocket/polling)

**Scale/Scope**:
- 5 analysis phases (pre-flight, classification, scope, expert, synthesis)
- 3-tier model strategy (20B, 120B, Emergency Gemini)
- Multi-language input (13 languages), English output
- 30s-10min processing window per course

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Principle I: Reliability First (PASS ✅)
- ✅ **Stage 3 barrier enforcement** (100% document completion before analysis starts)
- ✅ **Retry mechanisms** (2 attempts per phase + model escalation)
- ✅ **Progress tracking** (6-phase progress updates via RPC)
- ✅ **Quality gates** (semantic similarity validation patterns from Stage 3)
- ✅ **Minimum lesson validation** (hard failure if <10 lessons, user must refine)
- ✅ **Error handling** (OpenRouter failures → 3 retries with exponential backoff + technical support notification)

**Justification**: Analysis errors cascade to Stages 5-7. Stage 3 barrier prevents garbage-in-garbage-out. Quality gates ensure reliable output.

### Principle II: Atomicity & Modularity (PASS ✅)
- ✅ **File size limit**: Max 200-300 lines per module
- ✅ **Multi-phase orchestration**: 5 discrete phases with clear boundaries
- ✅ **Service separation**: phase-1-classifier, phase-2-scope, phase-3-expert, phase-4-synthesis, phase-5-assembly
- ✅ **Reusable utilities**: llm-client (Stage 3), quality-validator (Stage 3), token-estimator (Stage 3)

**Justification**: Each phase = independent module. Patterns from Stage 3 proven at scale.

### Principle III: Spec-Driven Development (PASS ✅)
- ✅ **Feature spec**: `specs/007-stage-4-analyze/spec.md` (complete)
- ✅ **Implementation plan**: This file (plan.md)
- ✅ **Research findings**: To be captured in research.md
- ✅ **Data models**: To be documented in data-model.md
- ✅ **API contracts**: To be defined in contracts/

**Status**: Specification complete with 10 resolved clarifications (Session 2025-10-31).

### Principle IV: Incremental Testing (PASS ✅)
- ✅ **Unit tests**: Phase-specific logic (classification, scope estimation, research flags)
- ✅ **Contract tests**: tRPC endpoint validation (analysis.start, analysis.getStatus)
- ✅ **Integration tests**: End-to-end BullMQ workflow with Stage 3 barrier validation
- ✅ **Quality gates**: Semantic similarity validation per phase output

**Approach**: TDD for critical paths (barrier enforcement, minimum lesson validation). Integration tests validate multi-phase orchestration.

### Principle V: Observability & Monitoring (PASS ✅)
- ✅ **Structured logging**: Pino JSON logs with correlation IDs (inherited from Stage 1)
- ✅ **Extended metrics**: Analysis duration, tokens used, model IDs, research flags count, document coverage, validation status
- ✅ **Progress tracking**: 6-phase real-time updates via WebSocket/polling
- ✅ **System metrics**: Job failures, barrier violations, model escalations logged to system_metrics table
- ✅ **Cost tracking**: Per-phase model usage + token counts (patterns from Stage 3)

**Implementation**: Extended observability requirements (FR-014) include target language, research flag count, course category, document coverage percentage.

### Principle VI: Multi-Tenancy & Scalability (PASS ✅)
- ✅ **Organization isolation**: Row-Level Security via JWT custom claims (inherited from Stage 1)
- ✅ **Queue priorities**: Tier-based (FREE=1, PREMIUM=10) - inherited from Stage 1
- ✅ **Horizontal scaling**: BullMQ worker concurrency (5 concurrent analysis jobs)
- ✅ **Per-organization tracking**: Token usage, analysis duration tracked by organization_id

**Status**: Multi-tenancy infrastructure complete in Stage 0-1. No additional work required.

### Principle VII: AI Model Flexibility (PASS ✅ - KEY INNOVATION)
- ✅ **Multi-phase multi-model orchestration** (NEW ARCHITECTURE):
  - Phase 1 (Classification): 20B (simple task)
  - Phase 2 (Scope): 20B (mathematical)
  - Phase 3 (Expert Analysis): 120B ALWAYS (no compromise on quality)
  - Phase 4 (Synthesis): Adaptive (20B <3 docs, 120B ≥3 docs)
  - Phase 5 (Assembly): No LLM (code logic)
- ✅ **Per-phase model configuration**: Admin panel (global defaults + per-course overrides)
- ✅ **Quality-based escalation**: Cheap phases (20B) → 2 attempts → escalate to 120B
- ✅ **Emergency model**: Gemini 2.5 Flash for context overflow (<1% usage expected)
- ✅ **Direct OpenAI SDK**: Zero framework overhead (inherited from Stage 3)

**Justification**: ~40-50% cost reduction vs always using 120B. Critical decisions (pedagogy, research flags) get best model from start. Extensible pattern for Stages 5-7.

### Principle VIII: Production-Ready Security (PASS ✅)
- ✅ **JWT authentication**: Inherited from Stage 1
- ✅ **RLS policies**: Organization-level isolation with JWT custom claims (50%+ faster)
- ✅ **Role-based authorization**: Admin, Instructor, Student, SuperAdmin
- ✅ **API security**: tRPC with authentication middleware
- ✅ **Data validation**: Zod schemas for all LLM outputs (inherited from Stage 3)

**Status**: Security infrastructure complete in Stage 0-1. No violations.

### Architecture Standards (PASS ✅)

**Data Storage**:
- ✅ PostgreSQL courses table with analysis_result JSONB column
- ✅ llm_model_config table for per-phase model configuration
- ✅ file_catalog for Stage 3 barrier validation (processing_status, processed_content)

**Orchestration**:
- ✅ BullMQ STRUCTURE_ANALYSIS job type (inherited from Stage 0)
- ✅ Retry logic with exponential backoff (inherited from Stage 1)
- ✅ Progress tracking via update_course_progress RPC (inherited from Stage 1)

**LLM Integration**:
- ✅ Direct OpenAI SDK (inherited from Stage 3)
- ✅ OpenRouter multi-model support (GPT OSS 20B/120B, Gemini 2.5 Flash)
- ✅ Quality validation via Jina-v3 semantic similarity (inherited from Stage 3)
- ✅ Token estimation (inherited from Stage 3)

**Embeddings & Vector Search**:
- ✅ Jina-v3 for quality validation (inherited from Stage 0)
- ✅ NOT required for Stage 4 RAG (deferred to Stage 5 Generation)

### Violations & Justifications

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| None | N/A | Constitution fully satisfied |

**Summary**: Stage 4 fully complies with all constitution principles. Multi-phase multi-model orchestration aligns with Principle VII (AI Model Flexibility) and introduces production-ready cost optimization pattern for Stages 5-7.

## Project Structure

### Documentation (this feature)

```
specs/007-stage-4-analyze/
├── spec.md              # Feature specification (COMPLETE)
├── plan.md              # This file (/speckit.plan Phase 0-2 output)
├── research.md          # Phase 1 output (to be generated)
├── data-model.md        # Phase 2 output (to be generated)
├── contracts/           # Phase 2 output (to be generated)
│   ├── analysis-start-request.schema.json
│   ├── analysis-result.schema.json
│   └── progress-update.schema.json
├── quickstart.md        # Phase 2 output (to be generated)
└── tasks.md             # Phase 3 output (/speckit.tasks - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
packages/course-gen-platform/
├── src/
│   ├── services/
│   │   ├── llm-client.ts                    # [EXISTS] Stage 3 - Direct OpenAI SDK
│   │   ├── token-estimator.ts               # [EXISTS] Stage 3 - Token counting
│   │   ├── quality-validator.ts             # [EXISTS] Stage 3 - Semantic similarity
│   │   ├── cost-calculator.ts               # [EXISTS] Stage 3 - Cost tracking
│   │   ├── stage-barrier.ts                 # [EXISTS] Stage 3 - Stage 3 barrier
│   │   ├── analysis/
│   │   │   ├── phase-1-classifier.ts        # [NEW] Course category + audience inference
│   │   │   ├── phase-2-scope.ts             # [NEW] Lesson count + hours estimation
│   │   │   ├── phase-3-expert.ts            # [NEW] Research flags + pedagogy (120B)
│   │   │   ├── phase-4-synthesis.ts         # [NEW] Document synthesis (adaptive)
│   │   │   ├── phase-5-assembly.ts          # [NEW] Final assembly (no LLM)
│   │   │   ├── research-flag-detector.ts    # [NEW] Conservative research flagging
│   │   │   ├── contextual-language.ts       # [NEW] Category-specific motivators
│   │   │   └── analysis-orchestrator.ts     # [NEW] Multi-phase coordinator
│   │   └── model-selector.ts                # [NEW] Per-phase model selection
│   ├── orchestrator/
│   │   ├── handlers/
│   │   │   └── stage4-analysis.ts           # [NEW] BullMQ worker handler
│   │   └── worker.ts                        # [UPDATE] Register STRUCTURE_ANALYSIS
│   ├── trpc/
│   │   └── routers/
│   │       └── analysis.ts                  # [NEW] tRPC router (start, getStatus, getResult)
│   └── types/
│       ├── analysis-job.ts                  # [NEW] Job payload types
│       ├── analysis-result.ts               # [NEW] Output types
│       └── model-config.ts                  # [NEW] Per-phase model config
├── tests/
│   ├── unit/
│   │   ├── phase-1-classifier.test.ts       # [NEW] Classification logic
│   │   ├── phase-2-scope.test.ts            # [NEW] Scope estimation
│   │   ├── phase-3-expert.test.ts           # [NEW] Research flag detection
│   │   ├── phase-4-synthesis.test.ts        # [NEW] Document synthesis
│   │   ├── research-flag-detector.test.ts   # [NEW] Conservative flagging
│   │   └── contextual-language.test.ts      # [NEW] Category-specific adaptation
│   ├── contract/
│   │   └── analysis.contract.test.ts        # [NEW] tRPC endpoint contracts
│   └── integration/
│       ├── stage4-analysis.test.ts          # [NEW] End-to-end BullMQ workflow
│       └── stage3-barrier.test.ts           # [NEW] Barrier enforcement validation
└── supabase/
    └── migrations/
        ├── 20251031100000_stage4_model_config.sql  # [NEW] llm_model_config table
        └── 20251031110000_stage4_analysis_fields.sql # [NEW] analysis_result JSONB

shared-types/
└── src/
    ├── analysis-job.ts                      # [NEW] Shared job types
    ├── analysis-result.ts                   # [NEW] Shared result types
    └── model-config.ts                      # [NEW] Shared config types
```

**Structure Decision**: Monorepo structure inherited from Stage 0. Analysis services organized into `services/analysis/` subdirectory with one file per phase (~150-250 lines each). Worker handler follows Stage 2-3 patterns. Shared types in `shared-types` package for cross-package consistency.

## Orchestration Strategy

_Added by Phase 0 of /speckit.plan - Used by /speckit.tasks to generate Phase 0 delegation plan_

### Available Subagents

List subagents available in `.claude/agents/`:

- ✅ **llm-service-specialist** - LLM client integration, token estimation, OpenRouter configuration (created in Stage 3)
- ✅ **quality-validator-specialist** - Semantic similarity validation, quality gates, Jina-v3 integration (created in Stage 3)
- ✅ **cost-calculator-specialist** - Token-based cost tracking, model pricing, analytics (created in Stage 3)
- ✅ **typescript-types-specialist** - Type definitions, Zod schemas, shared types (created in Stage 3)
- ✅ **orchestration-logic-specialist** - Multi-phase workflows, stage transitions, progress tracking (created in Stage 3)
- ✅ **database-architect** - Migrations, RPC functions, schema design (created in Stage 0)
- ✅ **api-builder** - tRPC endpoints, authentication, validation (created in Stage 0)
- ✅ **infrastructure-specialist** - BullMQ workers, Redis, queue management (created in Stage 0)
- ✅ **integration-tester** - E2E workflow testing, barrier validation (created in Stage 0)
- ✅ **code-reviewer** - Quality validation, constitution compliance (created in Stage 0)

### Executor Assignment Rules

**Phase 0 of /speckit.tasks will use these rules to annotate tasks with MANDATORY executor directives:**

| Task Domain | Complexity | Executor | Rationale |
|-------------|------------|----------|-----------|
| Database migrations | All | database-architect | llm_model_config, analysis_result JSONB column |
| RPC functions | N/A | N/A | No new RPCs (reuse update_course_progress from Stage 1) |
| LLM integration | Multi-phase orchestration | llm-service-specialist | Per-phase model selection, OpenRouter client, token estimation |
| Quality validation | Semantic similarity | quality-validator-specialist | Phase output validation (patterns from Stage 3) |
| Cost tracking | Per-phase analytics | cost-calculator-specialist | Model usage, token counts per phase |
| Type definitions | Complex schemas | typescript-types-specialist | Analysis job, result, model config types + Zod schemas |
| Multi-phase workflow | Orchestration logic | orchestration-logic-specialist | Phase transitions, progress tracking, barrier enforcement |
| tRPC endpoints | Analysis API | api-builder | analysis.start, analysis.getStatus, analysis.getResult |
| BullMQ worker | STRUCTURE_ANALYSIS handler | MAIN | Worker handler follows Stage 2-3 patterns (straightforward) |
| Phase services | Individual phase logic | MAIN | Phase-1 classifier, Phase-2 scope, Phase-3 expert, Phase-4 synthesis, Phase-5 assembly |
| Research flag detection | Conservative logic | MAIN | Simple rule-based detection (conservatism = avoid false positives) |
| Contextual language | Category adaptation | MAIN | Template-based adaptation for 6 categories |
| Model selector | Per-phase selection | MAIN | Simple lookup logic with fallback |
| Integration tests | E2E validation | integration-tester | Stage 3 barrier, multi-phase workflow, minimum lesson constraint |
| Code review | Final validation | code-reviewer | Constitution compliance, quality gates |

### Parallelization Strategy

**Parallel Groups** (tasks that can run concurrently):

- **PARALLEL-GROUP-A**: Type definitions (analysis-job.ts, analysis-result.ts, model-config.ts) - independent files, no dependencies
- **PARALLEL-GROUP-B**: Phase services (phase-1-classifier.ts, phase-2-scope.ts, phase-3-expert.ts, phase-4-synthesis.ts, phase-5-assembly.ts) - different phases, can develop simultaneously
- **PARALLEL-GROUP-C**: Utility services (research-flag-detector.ts, contextual-language.ts, model-selector.ts) - independent logic

**Sequential Blocks** (tasks that MUST run sequentially):

1. **Foundation Block**: Database migrations → Type definitions → Shared types package update
2. **Service Block**: Phase services + utilities → Multi-phase orchestrator (orchestrator depends on phases)
3. **Worker Block**: Orchestrator → BullMQ worker handler (worker depends on orchestrator)
4. **API Block**: Worker handler → tRPC endpoints (endpoints depend on worker)
5. **Testing Block**: All implementation → Unit tests → Contract tests → Integration tests

**Blocking Tasks** (prevent next phase from starting):

- Database migrations (llm_model_config, analysis_result) → BLOCKS → All implementation
- Type definitions + Zod schemas → BLOCKS → Phase services
- Phase services + Multi-phase orchestrator → BLOCKS → Worker handler
- Worker handler registration → BLOCKS → Integration tests

## Complexity Tracking

_Fill ONLY if Constitution Check has violations that must be justified_

**No violations identified.** Stage 4 fully complies with all constitution principles. Multi-phase multi-model orchestration is an innovation aligned with Principle VII (AI Model Flexibility).
