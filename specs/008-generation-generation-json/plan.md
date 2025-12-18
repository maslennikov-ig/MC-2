# Implementation Plan: Generation Phase - Course Structure JSON Generation

**Branch**: `008-generation-generation-json` | **Date**: 2025-11-05 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/008-generation-generation-json/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement Stage 5 of the MegaCampusAI migration: course structure JSON generation phase that transforms Stage 4 analysis results into complete course JSON serving as both client interface and technical specification for Stage 6 lesson generation. The system will leverage the existing LangChain + LangGraph multi-model architecture (established in Stage 4) to generate course metadata, sections, lessons, and lesson-level technical specifications. Key features include: (1) multi-model orchestration (OSS 20B default, OSS 120B for validation failures, Gemini for per-batch token overflow, qwen3-max strategy determined via RT-001 research task), (2) per-batch architecture (SECTIONS_PER_BATCH = 1, independent 120K token budget per batch), (3) style integration (21 content styles from style-prompts.ts), (4) quality validation via Jina-v3 semantic similarity, (5) minimum 10 lessons enforcement (FR-015), and (6) handling of minimal input scenarios where Analyze produces basic analysis_result from title-only user input. Note: Generation ALWAYS receives analysis_result from Analyze - there is no title-only mode for Generation itself.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js 20+
**Primary Dependencies**:
- **LLM Orchestration**: @langchain/core v0.3+, @langchain/langgraph, @langchain/openai (custom OpenRouter baseURL)
- **Validation**: Zod schemas (runtime JSON validation)
- **Vector DB**: Qdrant SDK (optional RAG context, FR-004)
- **Embeddings**: Jina-v3 API (quality validation, FR-021)
- **Queue**: BullMQ (STRUCTURE_GENERATION job type, implemented in Stage 0)
- **Database**: Supabase client (course_structure JSONB, generation_metadata)
- **Utilities**: DOMPurify (XSS sanitization for LLM outputs)

**Storage**:
- Supabase PostgreSQL (MegaCampusAI project: diqooqbuchsliypgwksu)
- Tables: `courses` (course_structure JSONB, analysis_result JSONB, generation_metadata JSONB), `file_catalog` (vectorized documents)
- Vector DB: Qdrant Cloud (document context retrieval, optional per FR-004)

**Testing**:
- Unit tests: Vitest (service logic, validation functions)
- Contract tests: tRPC endpoint validation (RLS enforcement)
- Integration tests: BullMQ worker end-to-end (STRUCTURE_GENERATION job)

**Target Platform**: Linux server (Node.js backend, production deployment via Docker/Railway)

**Project Type**: Backend service (monorepo package: `course-gen-platform`)

**Performance Goals**:
- Metadata generation: <10 seconds (single LLM call)
- Section batches: <120 seconds total for 8 sections (SECTIONS_PER_BATCH = 1, 2 parallel)
- Per-batch token budget: 120K tokens (SC-005, 90% threshold = 108K triggers Gemini fallback)
- Total pipeline: <150 seconds for standard course (8 sections, 20-30 lessons)

**Constraints**:
- Per-batch token budget: 120K tokens maximum (OSS 20B/120B/Qwen3-max have 128K context)
- Token overflow fallback: Gemini 2.5 Flash (1M context window)
- Quality threshold: 0.75 semantic similarity (Jina-v3 cosine, FR-021)
- Minimum lessons: 10 total across all sections (FR-015, validation + retry)
- JSON repair: 4-level strategy (brace counting, quote fixing, trailing commas, comments)
- Retry logic: Maximum 3 attempts per generation with progressively stricter prompts

**Scale/Scope**:
- Standard course: 8 sections, 20-30 lessons, 3-5 exercises per lesson
- Minimal-input scenario: Generate complete structure when Analyze received only title (FR-003 applies to Analyze, not Generation). Generation always works with analysis_result provided by Analyze
- Multi-language: Russian (primary), English, 13+ languages via language detection
- Style variations: 21 content styles from style-prompts.ts (academic, conversational, storytelling, etc.)
- Concurrent generation: Tier-based limits (TRIAL=5, FREE=1, BASIC=2, STANDARD=5, PREMIUM=10)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### I. Reliability First ✅ PASS
- **99.9% uptime**: Target met via BullMQ retry (3 attempts, exponential backoff), Saga pattern compensation
- **Error scenarios**: Graceful degradation for title-only generation (FR-003), JSON repair (4 levels), model fallback (20B → 120B → Gemini)
- **Data integrity**: Atomic JSONB commit to `course_structure`, all-or-nothing validation
- **Automatic recovery**: BullMQ retry + orphan recovery (implemented in Stage 1)
- **Idempotent operations**: Course generation can be re-run without data corruption
- **Saga pattern**: Generation stages with compensation (rollback on failure)

### II. Atomicity & Modularity ✅ PASS
- **File size limit**: Target 200-300 lines maximum per module
- **Single responsibility**: Separate services for metadata generation, section generation, validation, style integration
- **Reusable modules**: Leverage Stage 4 patterns (LangChain orchestrator, multi-model selector, quality validator)
- **Independent testability**: Unit tests for each service without mocking

### III. Spec-Driven Development ✅ PASS
- **Feature spec**: `specs/008-generation-generation-json/spec.md` (exists, comprehensive)
- **Implementation plan**: `plan.md` (this file, being generated)
- **Research findings**: `research.md` (Phase 1 output, will document qwen3-max strategy per RT-001)
- **Data model**: `data-model.md` (Phase 2 output, course_structure JSONB schema)
- **API contracts**: `contracts/` (Phase 2 output, tRPC generation endpoints)
- **Tasks**: `tasks.md` (Phase 3 output via /speckit.tasks)

### IV. Incremental Testing ✅ PASS
- **Unit tests**: Service logic (metadata generator, section generator, validators) - MANDATORY
- **Integration tests**: BullMQ worker end-to-end (STRUCTURE_GENERATION job) - MANDATORY
- **Contract tests**: tRPC endpoint compliance (RLS enforcement) - MANDATORY
- **E2E tests**: Title-only generation, full Analyze → Generate workflow - REQUIRED for production

### V. Observability & Monitoring ✅ PASS
- **Structured logs**: Pino JSON logging (implemented in Stage 1)
- **Correlation IDs**: Request tracing via job_id (BullMQ job identifier)
- **Key metrics**: Token usage per batch, model selection, quality scores, retry counts, cost tracking (generation_metadata JSONB)
- **System metrics**: FR-020 quality validation failures, FR-015 minimum lessons violations, Gemini fallback triggers
- **Alerts**: Token budget approaching (108K/120K), quality < 0.75, retry exhaustion

### VI. Multi-Tenancy & Scalability ✅ PASS
- **Organization-level isolation**: RLS policies on courses table (implemented in Stage 0)
- **JWT custom claims**: user_id, role, organization_id (implemented in Stage 1)
- **Production-grade RLS**: 50%+ performance improvement (Stage 1)
- **Horizontal scaling**: BullMQ worker concurrency (5 workers, configurable)
- **Tier-based concurrency**: TRIAL=5, FREE=1, BASIC=2, STANDARD=5, PREMIUM=10 (implemented in Stage 1)

### VII. AI Model Flexibility ✅ PASS
- **Multi-model architecture**: OSS 20B (default), OSS 120B (validation failures), Qwen3-max (critical decisions per RT-001), Gemini (token overflow)
- **Configurable per use-case**: Admin panel (Stage 8) will allow model selection per generation phase
- **Fallback models**: Progressive escalation (20B → 120B → Gemini)
- **Externalized prompts**: Style integration via style-prompts.ts, versioned
- **Cost estimation**: generation_metadata.cost_usd tracking per FR-015

### VIII. Production-Ready Security ✅ PASS
- **JWT authentication**: Supabase Auth (implemented in Stage 1)
- **Custom claims**: user_id, role, organization_id (Stage 1)
- **RBAC enforcement**: Admin, Instructor, Student, SuperAdmin (Stage 1)
- **XSS sanitization**: DOMPurify for all LLM outputs (learning from Stage 4)
- **RLS policies**: Comprehensive on courses table (Stage 0)
- **Audit trail**: generation_metadata JSONB tracks all generation parameters

**GATE RESULT**: ✅ **PASS** - All constitution principles satisfied. Reuse Stage 4 architecture patterns (LangChain + LangGraph, multi-model orchestration, quality validation).

---

## POST-DESIGN CONSTITUTION CHECK RE-EVALUATION

_Date: 2025-11-05 (After Phase 1-2 Complete)_

### Re-evaluation Results

✅ **I. Reliability First** - PASS (reinforced by design)
- BullMQ retry with 3 attempts + exponential backoff (confirmed in worker handler)
- JSON repair with 4-level strategy (detailed in data-model.md)
- Multi-model fallback chain: OSS 20B → OSS 120B → qwen3-max → Gemini (documented in research.md)
- Quality validation with retry on <0.75 similarity (implemented in orchestrator)
- Minimum lessons validator with retry (FR-015 enforcement)

✅ **II. Atomicity & Modularity** - PASS (validated in design)
- 8 service modules, each <300 lines target (metadata-generator, section-batch-generator, etc.)
- Single responsibility confirmed: metadata generation separate from section generation
- Reusable utilities: json-repair.ts, minimum-lessons-validator.ts
- Independent testability: 5+ unit test files planned

✅ **III. Spec-Driven Development** - PASS (artifacts complete)
- ✅ Feature spec (spec.md) - EXISTS
- ✅ Implementation plan (plan.md) - COMPLETE
- ✅ Research findings (research.md) - COMPLETE (RT-001 qwen3-max strategy)
- ✅ Data model (data-model.md) - COMPLETE (Zod schemas, database migration)
- ✅ API contracts (contracts/) - COMPLETE (2 tRPC endpoints)
- ✅ Quickstart (quickstart.md) - COMPLETE (developer onboarding)
- ⏭️ Tasks (tasks.md) - TO BE GENERATED via /speckit.tasks

✅ **IV. Incremental Testing** - PASS (strategy defined)
- Unit tests: 5 files planned (metadata-generator, section-batch-generator, quality-validator, json-repair, minimum-lessons-validator)
- Integration tests: 1 file planned (stage5-generation-worker.test.ts)
- Contract tests: 1 file planned (generation.tRPC.test.ts)
- E2E tests: Documented in quickstart.md (title-only, full Analyze, different styles)

✅ **V. Observability & Monitoring** - PASS (Pino logging confirmed)
- Pino structured logging (reuse from Stage 1)
- Correlation IDs via BullMQ job.id
- Key metrics: model_used, total_tokens, cost_usd, quality_scores (in generation_metadata JSONB)
- System metrics: quality validation failures, retry counts, Gemini fallback triggers

✅ **VI. Multi-Tenancy & Scalability** - PASS (RLS verified)
- RLS policies on courses table (existing from Stage 0)
- JWT custom claims (user_id, organization_id) from Stage 1
- Tier-based concurrency (TRIAL=5, FREE=1, BASIC=2, STANDARD=5, PREMIUM=10)
- Horizontal scaling via BullMQ (5 workers configurable)

✅ **VII. AI Model Flexibility** - PASS (multi-model confirmed)
- 4 models: OSS 20B (default), OSS 120B (validation), qwen3-max (metadata + critical), Gemini (overflow)
- Configurable via llm_model_config table (Stage 4 infrastructure)
- Externalized prompts: style-prompts.ts (21 styles, version controlled)
- Cost tracking per model in generation_metadata

✅ **VIII. Production-Ready Security** - PASS (XSS sanitization added)
- JWT authentication (Stage 1)
- RLS enforcement (Stage 0-1)
- XSS sanitization with DOMPurify (confirmed in quickstart.md)
- Audit trail via generation_metadata.created_at + user_id

### New Concerns Identified

**None** - Design phase validated all constitution principles. No new architectural complexity introduced.

### Final Gate Decision

✅ **APPROVED FOR IMPLEMENTATION** - All gates passed both pre-design and post-design checks. Proceed to Phase 3 (tasks.md generation via /speckit.tasks).

## Project Structure

### Documentation (this feature)

```
specs/008-generation-generation-json/
├── spec.md              # Feature specification (EXISTS)
├── plan.md              # This file (Phase 0 output)
├── research.md          # Phase 1 output (qwen3-max strategy per RT-001)
├── data-model.md        # Phase 2 output (course_structure JSONB schema)
├── quickstart.md        # Phase 2 output (developer onboarding guide)
├── contracts/           # Phase 2 output (tRPC generation endpoints)
│   ├── generation.tRPC.md        # generation.generate endpoint
│   └── generation-status.tRPC.md # generation.getStatus endpoint
├── tasks.md             # Phase 3 output (/speckit.tasks - NOT created by /speckit.plan)
└── REQUIREMENTS.md      # Detailed requirements (EXISTS)
```

### Source Code (repository root)

Monorepo structure with backend service in `packages/course-gen-platform/`:

```
packages/course-gen-platform/
├── src/
│   ├── orchestrator/
│   │   ├── handlers/
│   │   │   ├── document-processing.ts      # Stage 2 (IMPLEMENTED)
│   │   │   ├── stage3-summarization.ts     # Stage 3 (IMPLEMENTED)
│   │   │   ├── stage4-analysis.ts          # Stage 4 (IMPLEMENTED)
│   │   │   └── stage5-generation.ts        # Stage 5 (THIS FEATURE - NEW)
│   │   ├── worker.ts                       # BullMQ worker (EXISTING)
│   │   └── queue.ts                        # BullMQ queue (EXISTING)
│   ├── services/
│   │   ├── stage5/                         # NEW: Generation services
│   │   │   ├── generation-orchestrator.ts  # LangGraph StateGraph workflow
│   │   │   ├── metadata-generator.ts       # Course metadata generation
│   │   │   ├── section-batch-generator.ts  # Section batch generation (per-batch architecture)
│   │   │   ├── style-integrator.ts         # Style prompt integration
│   │   │   ├── quality-validator.ts        # Jina-v3 semantic similarity
│   │   │   ├── json-repair.ts              # 4-level JSON repair strategy
│   │   │   ├── minimum-lessons-validator.ts # FR-015 enforcement
│   │   │   └── model-selector.ts           # Multi-model selection logic
│   │   ├── llm/                            # Stage 4 (REUSE)
│   │   │   ├── langchain-client.ts
│   │   │   └── model-config-loader.ts
│   │   ├── qdrant/                         # Stage 0 (REUSE, optional)
│   │   │   └── qdrant-search.ts
│   │   └── embeddings/                     # Stage 0 (REUSE)
│   │       └── jina-client.ts
│   ├── trpc/
│   │   └── routers/
│   │       └── generation.ts               # NEW: tRPC generation router
│   └── utils/
│       ├── logger.ts                       # Stage 1 (REUSE)
│       └── retry.ts                        # Stage 1 (REUSE)
├── supabase/
│   └── migrations/
│       └── 20251105000000_stage5_generation.sql # NEW: generation_metadata columns
└── tests/
    ├── unit/
    │   ├── metadata-generator.test.ts
    │   ├── section-batch-generator.test.ts
    │   ├── style-integrator.test.ts
    │   └── json-repair.test.ts
    ├── contract/
    │   └── generation.tRPC.test.ts
    └── integration/
        └── stage5-generation-worker.test.ts

packages/shared-types/
├── generation-job.ts           # NEW: STRUCTURE_GENERATION job type
├── generation-result.ts        # NEW: Course structure JSON schema
├── generation-metadata.ts      # NEW: Generation metadata schema
└── style-prompts.ts            # NEW: 21 style definitions (port from workflows n8n/style.js)
```

**Structure Decision**: Backend monorepo package (`course-gen-platform`) with new `services/stage5/` directory for generation logic. Reuses LangChain infrastructure from Stage 4, embeddings/Qdrant from Stage 0-2, BullMQ/tRPC from Stage 1. Style prompts ported to shared-types as TypeScript module for version control and type safety.

## Orchestration Strategy

_Added by Phase 0 of /speckit.plan - Used by /speckit.tasks to generate Phase 0 delegation plan_

### Available Subagents

Specialists available in `.claude/agents/` relevant to Stage 5 implementation:

- ✅ **database-architect** - Database migrations, RPC functions, JSONB schema design (for generation_metadata)
- ✅ **api-builder** - tRPC/REST endpoints, authentication, API validation (for generation.ts router)
- ✅ **infrastructure-specialist** - Redis, BullMQ, worker config (for STRUCTURE_GENERATION job)
- ✅ **llm-service-specialist** - LLM integration, token estimation, OpenRouter configuration (Stage 3 creation)
- ✅ **quality-validator-specialist** - Semantic similarity validation, Jina-v3 embeddings (Stage 3 creation)
- ✅ **cost-calculator-specialist** - OpenRouter cost calculation, tier analytics (Stage 3 creation)
- ✅ **typescript-types-specialist** - TypeScript interfaces, Zod schemas, shared types (Stage 3 creation)
- ✅ **orchestration-logic-specialist** - LangGraph workflows, stage transitions (Stage 3 creation)
- ✅ **integration-tester** - E2E workflow testing, contract validation
- ✅ **code-reviewer** - Quality validation, constitution compliance checks
- ✅ **fullstack-nextjs-specialist** - Complex frontend + backend integration (if UI changes needed)

### Executor Assignment Rules

**Phase 0 of /speckit.tasks will use these rules to annotate tasks with MANDATORY executor directives:**

| Task Domain | Complexity | Executor | Rationale |
|-------------|------------|----------|-----------|
| Database migrations (generation_metadata JSONB) | All | database-architect | JSONB schema design, migration expertise |
| tRPC generation router | Complex | api-builder | Authentication, RLS enforcement, validation |
| BullMQ worker handler (stage5-generation.ts) | Complex | infrastructure-specialist | Worker lifecycle, job processing, error handling |
| LangGraph orchestration workflow | Complex | orchestration-logic-specialist | StateGraph patterns, phase transitions, reuse Stage 4 |
| Metadata generator service | Medium | llm-service-specialist | LLM prompts, token estimation, OpenRouter |
| Section batch generator service | Complex | llm-service-specialist | Per-batch architecture, parallel processing |
| Style integrator service | Simple | MAIN | Read style-prompts.ts, inject into prompts |
| Quality validator service | Complex | quality-validator-specialist | Jina-v3 embeddings, semantic similarity |
| JSON repair utility | Medium | MAIN | String manipulation, regex patterns |
| Minimum lessons validator | Simple | MAIN | Count validation, retry logic |
| Cost calculator integration | Medium | cost-calculator-specialist | OpenRouter pricing, generation_metadata.cost_usd |
| Shared types (generation-job, generation-result) | Medium | typescript-types-specialist | Zod schemas, cross-package types |
| Style prompts TypeScript module | Simple | MAIN | Port from style.js to style-prompts.ts |
| Unit tests (services) | All | MAIN | Standard Vitest patterns |
| Contract tests (tRPC) | All | MAIN | Standard tRPC test patterns |
| Integration tests (BullMQ worker E2E) | Complex | integration-tester | Full workflow validation |
| Documentation (quickstart, contracts) | All | MAIN | Markdown writing |
| Code review & polish | All | code-reviewer | Constitution compliance, quality gates |

### Parallelization Strategy

**Parallel Groups** (tasks that CAN run together for efficiency):

- **PARALLEL-GROUP-A**: Shared types creation (no dependencies)
  - generation-job.ts + generation-result.ts + generation-metadata.ts + style-prompts.ts
- **PARALLEL-GROUP-B**: Service layer development (after types ready)
  - metadata-generator.ts + section-batch-generator.ts (different services)
  - style-integrator.ts + json-repair.ts (different concerns)
- **PARALLEL-GROUP-C**: Validation services (after core services)
  - quality-validator.ts + minimum-lessons-validator.ts + cost-calculator integration
- **PARALLEL-GROUP-D**: Tests (after implementation)
  - Unit tests + Contract tests (can run in parallel)

**Sequential Blocks** (tasks that MUST run in order):

1. **Foundation Phase** (MUST complete before services):
   - Database migration (generation_metadata JSONB columns)
   - Shared types (generation-job, generation-result, generation-metadata, style-prompts)
2. **Core Services Phase** (depends on foundation):
   - LangGraph orchestration workflow (master orchestrator)
   - Metadata generator service
   - Section batch generator service
3. **Enhancement Services Phase** (depends on core):
   - Style integrator (reads style-prompts.ts)
   - Quality validator (uses Jina-v3)
   - JSON repair utility
4. **Worker Integration Phase** (depends on all services):
   - BullMQ worker handler (stage5-generation.ts)
   - tRPC generation router
5. **Testing Phase** (depends on implementation):
   - Unit tests
   - Contract tests
   - Integration tests (LAST - requires full system)

**Blocking Tasks** (prevent next phase from starting):

- Database migration → BLOCKS → All implementation tasks
- Shared types → BLOCKS → All service development
- LangGraph orchestration → BLOCKS → Worker handler creation
- Worker handler + tRPC router → BLOCKS → Integration tests

## Complexity Tracking

_Fill ONLY if Constitution Check has violations that must be justified_

**NO VIOLATIONS** - All Constitution Check gates passed. Stage 5 leverages existing infrastructure:
- LangChain + LangGraph architecture from Stage 4 (proven 8.4/10 selection)
- Multi-model orchestration from Stage 4 (40-50% cost savings)
- BullMQ + tRPC + Supabase from Stage 0-1 (production-ready)
- Quality validation patterns from Stage 3-4 (Jina-v3 semantic similarity)
- Security hardening from Stage 1 (JWT custom claims, RLS, XSS sanitization)

No new architectural complexity introduced. Following established patterns and reusing proven components.
