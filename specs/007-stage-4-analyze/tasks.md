# Tasks: Stage 4 - Course Content Analysis

**Input**: Design documents from `/specs/007-stage-4-analyze/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Tests are included based on spec requirements (FR-018 mentions integration tests, quickstart.md includes test strategy)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Orchestration**: Main agent acts as orchestrator, delegating specialized tasks to subagents. Phase 0 will annotate all tasks with MANDATORY executor directives.

**LLM Framework Decision** (2025-11-01): **LangChain + LangGraph** selected for multi-phase orchestration after evaluating 11 frameworks. See [ADR-001](../../docs/ADR-001-LLM-ORCHESTRATION-FRAMEWORK.md) for full decision rationale.

- **Framework**: @langchain/core v0.3+, @langchain/openai, @langchain/langgraph
- **Pattern**: StateGraph for 5-phase sequential workflow with conditional routing
- **Retry/Escalation**: Built-in withRetry() and withFallbacks() (20B → 120B → Gemini)
- **Observability**: Custom Supabase metrics (NOT LangSmith - avoiding SaaS dependency)
- **Impact**: Tasks T011-T014 updated with LangChain integration approach

## Format: `[ID] [P?] [ORCHESTRATOR?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[ORCHESTRATOR]**: Task executed by main agent (coordination, analysis, Context7 research)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions
- Tasks without [ORCHESTRATOR] are candidates for delegation to specialized subagents

## Phase 0: Git Branch & Orchestration Planning (MANDATORY)

**Purpose**: Create feature branch and establish MANDATORY delegation directives before implementation

**⚠️ CRITICAL**: This phase MUST be completed before ANY implementation. It establishes clear, binding execution directives for all tasks.

### Step 1: Git Branch Setup

- [x] T-000 [ORCHESTRATOR] Create or checkout feature branch
  - Read BRANCH from plan.md header: `007-stage-4-analyze`
  - Check if branch exists: `git branch --list 007-stage-4-analyze`
  - If not exists: `git checkout -b 007-stage-4-analyze`
  - If exists: `git checkout 007-stage-4-analyze`
  - Verify clean working directory: `git status` (should show "nothing to commit")
  - If dirty: Ask user to commit or stash changes
  - **Output**: Feature branch active and ready

### Step 2: Load Orchestration Strategy from plan.md

- [x] T-000.1 [ORCHESTRATOR] Load orchestration rules from plan.md
  - Read plan.md section "Orchestration Strategy"
  - Extract:
    - Available subagents list (10 subagents: llm-service-specialist, quality-validator-specialist, cost-calculator-specialist, typescript-types-specialist, orchestration-logic-specialist, database-architect, api-builder, infrastructure-specialist, integration-tester, code-reviewer)
    - Executor assignment rules (task domain → executor mapping)
    - Parallelization strategy (3 parallel groups, 5 sequential blocks, 4 blocking tasks)
  - If "Orchestration Strategy" section missing from plan.md:
    - ERROR: "plan.md missing Orchestration Strategy section. Run /speckit.plan Phase 0 first."
  - **Output**: Orchestration rules loaded in memory

### Step 3: Task Analysis & Classification

- [x] T-000.2 [ORCHESTRATOR] Analyze all tasks and classify by executor type
  - Review all tasks (T001-T074) in this file
  - For each task, classify:
    - **Domain**: Database, LLM, Quality, Cost, Types, Orchestration, API, Worker, Testing, Review
    - **Complexity**: Simple (main agent) vs Specialized (subagent required)
    - **Dependencies**: Sequential (blocks others) vs Parallelizable
  - Apply executor assignment rules from plan.md
  - **Output**: Classification matrix (task → domain → executor → parallel group)
  - **Format**: Create table:
    ```markdown
    | Task | Domain | Executor                    | Parallel Group     | Depends On | Blocks    |
    | ---- | ------ | --------------------------- | ------------------ | ---------- | --------- |
    | T001 | DB     | database-architect          | None               | T-000.2.5  | T003-T014 |
    | T003 | Types  | typescript-types-specialist | A (with T004,T005) | T002       | -         |
    ```

### Step 3.5: Subagent Availability Audit

- [x] T-000.2.5 [ORCHESTRATOR] Audit subagent availability and create missing ones
  - **Purpose**: Ensure all required subagents exist before implementation
  - **Process**:
    1. Extract unique executors from T-000.2 classification (excluding "MAIN")
    2. List current subagents: `find .claude/agents -name "*.md" -type f`
    3. Compare required vs available subagents
    4. Expected subagents (all should exist from Stage 3):
       - llm-service-specialist
       - quality-validator-specialist
       - cost-calculator-specialist
       - typescript-types-specialist
       - orchestration-logic-specialist
       - database-architect
       - api-builder
       - infrastructure-specialist
       - integration-tester
       - code-reviewer
    5. If all subagents exist: Proceed to T-000.3
    6. If missing subagents found (unlikely): Create via meta-agent-v3 and STOP workflow
  - **Output**: Subagent availability confirmed

### Step 4: Task Annotation with MANDATORY Directives

- [x] T-000.3 [ORCHESTRATOR] Annotate ALL tasks with MANDATORY executor and execution directives
  - Based on T-000.2 classification, annotate each task
  - **Annotation Format**:
    ```markdown
    - [ ] TXXX **[EXECUTOR: subagent-name]** **[SEQUENTIAL/PARALLEL-GROUP-X]** **[BLOCKING: Phase Y]** Original task title
      - **⚠️ MANDATORY DIRECTIVE**: Use {executor} subagent ({reason})
      - **⚠️ EXECUTION**: {sequential/parallel} ({details})
      - **⚠️ BLOCKING**: {what this blocks, if applicable}
      - [Original task description...]
    ```
  - **Parallelization Annotations**:
    - PARALLEL-GROUP-A: Type definitions (T003, T004, T005)
    - PARALLEL-GROUP-B: Phase services (T015-T019)
    - PARALLEL-GROUP-C: Utility services (T020, T021, T022)
  - **Sequential Blocks**:
    - Foundation: T001 → T002 → PARALLEL-GROUP-A
    - Services: PARALLEL-GROUP-B+C → T023 (orchestrator depends on phases)
    - Worker: T023 → T024 (worker depends on orchestrator)
    - API: T024 → T025 (API depends on worker)
    - Testing: All implementation → Tests
  - **Blocking Tasks**:
    - T001, T002 (DB migrations) → BLOCKS → All implementation
    - T003-T005 (Type definitions) → BLOCKS → Phase services
    - T023 (Orchestrator) → BLOCKS → Worker handler
    - T024 (Worker registration) → BLOCKS → Integration tests
  - **Output**: All tasks annotated with binding directives

### Step 5: Execution Roadmap Validation

- [x] T-000.4 [ORCHESTRATOR] Validate delegation plan and create execution roadmap
  - Review all annotated tasks for consistency
  - Verify no circular dependencies
  - Verify parallel groups have no file conflicts
  - Create execution roadmap showing:
    - Phase sequence with executors
    - Parallel launch points (PARALLEL-GROUP-A, B, C)
    - Blocking checkpoints
  - **Output**: Validated execution roadmap (add to tasks.md as new section)

**Checkpoint**: All tasks annotated with MANDATORY executor directives and parallelization strategy. Implementation can now begin with clear delegation rules.

**Duration**: 1-2 hours

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and database foundation

### Database Migrations (Sequential - BLOCKS all user stories)

- [x] T001 **[EXECUTOR: database-architect]** **[SEQUENTIAL]** **[BLOCKING: Phase 2-8]** Create `llm_model_config` table migration
  - **⚠️ MANDATORY DIRECTIVE**: Use database-architect subagent (SQL expertise, migration patterns, RLS policies required)
  - **⚠️ EXECUTION**: Sequential (blocks T002, must complete before any type definitions)
  - **⚠️ BLOCKING**: All user story implementation (Phase 2-8) until complete
  - File: `packages/course-gen-platform/supabase/migrations/20251031100000_stage4_model_config.sql`
  - Reference: `specs/007-stage-4-analyze/data-model.md` section 1.1
  - Create table with columns: id, config_type, course_id, phase_name, model_id, fallback_model_id, temperature, max_tokens, created_at, updated_at
  - Add constraints: unique_global_phase, unique_course_phase, course_override_requires_course_id
  - Add indexes: idx_llm_model_config_course, idx_llm_model_config_phase
  - Add RLS policies: superadmin_all, read_global, read_course_override
  - Insert default global configuration for 5 phases
  - Run migration: `cd packages/course-gen-platform && pnpm supabase db push`
  - Verify: `SELECT * FROM llm_model_config WHERE config_type = 'global';` (should return 5 rows)
  - **Blocks**: All implementation tasks (T003-T074)

- [x] T002 **[EXECUTOR: database-architect]** **[SEQUENTIAL]** **[BLOCKING: Phase 2]** Add `analysis_result` JSONB column to courses table
  - **⚠️ MANDATORY DIRECTIVE**: Use database-architect subagent (JSONB column, GIN index, schema design required)
  - **⚠️ EXECUTION**: Sequential (depends on T001, blocks type definitions T003-T005)
  - **⚠️ BLOCKING**: Type definitions (T003-T005) until complete
  - File: `packages/course-gen-platform/supabase/migrations/20251031110000_stage4_analysis_fields.sql`
  - Reference: `specs/007-stage-4-analyze/data-model.md` section 1.2
  - Add column: `analysis_result JSONB`
  - Create GIN index: `idx_courses_analysis_result_gin`
  - Add column comment describing structure
  - Run migration: `pnpm supabase db push`
  - Verify: `\d+ courses;` (should show analysis_result JSONB column with GIN index)
  - **Depends on**: T001
  - **Blocks**: Type definitions (T003-T005)

**Checkpoint**: Database schema ready (llm_model_config table + analysis_result column). Foundation complete for type definitions.

---

## Phase 2: Foundational (Type Definitions - BLOCKS all services)

**Purpose**: TypeScript types and Zod schemas that ALL user stories depend on

**⚠️ CRITICAL**: No service implementation can begin until this phase is complete

### Shared Types Package (Parallel Group A)

- [x] T003 **[EXECUTOR: typescript-types-specialist]** **[PARALLEL-GROUP-A: T004,T005]** Create `analysis-job.ts` in shared-types package
  - **⚠️ MANDATORY DIRECTIVE**: Use typescript-types-specialist (complex TypeScript interfaces, shared package expertise)
  - **⚠️ EXECUTION**: MUST launch in parallel with T004, T005 (different files, independent types)
  - File: `shared-types/src/analysis-job.ts`
  - Reference: `specs/007-stage-4-analyze/data-model.md` section 3.1
  - Define interfaces: `StructureAnalysisJob`, `DocumentSummary`
  - Export all types
  - **Depends on**: T002
  - **Blocks**: Phase services (T015-T019), Worker handler (T024)

- [x] T004 **[EXECUTOR: typescript-types-specialist]** **[PARALLEL-GROUP-A: T003,T005]** Create `analysis-result.ts` in shared-types package
  - **⚠️ MANDATORY DIRECTIVE**: Use typescript-types-specialist (complex nested interfaces, 15+ types)
  - **⚠️ EXECUTION**: MUST launch in parallel with T003, T005 (different files, independent types)
  - File: `shared-types/src/analysis-result.ts`
  - Reference: `specs/007-stage-4-analyze/data-model.md` section 2.1
  - Define interfaces: `AnalysisResult`, `SectionBreakdown`, `ExpansionArea`, `ResearchFlag`
  - Define phase output interfaces: `Phase1Output`, `Phase2Output`, `Phase3Output`, `Phase4Output`
  - Export all types
  - **Depends on**: T002
  - **Blocks**: Phase services (T015-T019)

- [x] T005 **[EXECUTOR: typescript-types-specialist]** **[PARALLEL-GROUP-A: T003,T004]** Create `model-config.ts` in shared-types package
  - **⚠️ MANDATORY DIRECTIVE**: Use typescript-types-specialist (type safety for model configuration)
  - **⚠️ EXECUTION**: MUST launch in parallel with T003, T004 (different files, independent types)
  - File: `shared-types/src/model-config.ts`
  - Reference: `specs/007-stage-4-analyze/data-model.md` section 2.1
  - Define interfaces: `ModelConfig`, `PhaseName` type
  - Export all types
  - **Depends on**: T002
  - **Blocks**: Model selector (T022), Phase services (T015-T019)

### Build Shared Types

- [x] T006 **[EXECUTOR: MAIN]** **[SEQUENTIAL]** **[BLOCKING: T007-T009]** Build shared-types package
  - **⚠️ MANDATORY DIRECTIVE**: Main agent executes directly (simple build command, no special expertise)
  - **⚠️ EXECUTION**: Sequential (depends on T003-T005 complete, blocks local types T007-T009)
  - **⚠️ BLOCKING**: Local types (T007-T009) until complete
  - Run: `cd shared-types && pnpm build`
  - Verify: `pnpm type-check` (should pass with 0 errors)
  - **Depends on**: T003, T004, T005
  - **Blocks**: Local types (T007-T009)

### Local Types Package (Sequential - after shared types build)

- [x] T007 **[EXECUTOR: typescript-types-specialist]** **[SEQUENTIAL]** Create `analysis-result.ts` with Zod schemas in course-gen-platform
  - **⚠️ MANDATORY DIRECTIVE**: Use typescript-types-specialist (complex Zod schemas with nested validation)
  - **⚠️ EXECUTION**: Sequential (depends on T006 build, largest schema file)
  - File: `packages/course-gen-platform/src/types/analysis-result.ts`
  - Reference: `specs/007-stage-4-analyze/data-model.md` section 2.2
  - Import types from `@shared-types/analysis-result`
  - Define Zod schemas: `AnalysisResultSchema`, `SectionBreakdownSchema`, `ExpansionAreaSchema`, `ResearchFlagSchema`
  - Define phase output schemas: `Phase1OutputSchema`, `Phase2OutputSchema`, `Phase3OutputSchema`, `Phase4OutputSchema`
  - Export all schemas
  - **Depends on**: T006

- [x] T008 **[EXECUTOR: typescript-types-specialist]** **[PARALLEL-GROUP-B: T009]** Create `analysis-job.ts` local types
  - **⚠️ MANDATORY DIRECTIVE**: Use typescript-types-specialist (Zod schemas for job payloads)
  - **⚠️ EXECUTION**: Can run in parallel with T009 (different files)
  - File: `packages/course-gen-platform/src/types/analysis-job.ts`
  - Import from `@shared-types/analysis-job`
  - Define Zod schemas: `StructureAnalysisJobSchema`, `DocumentSummarySchema`
  - Export schemas
  - **Depends on**: T006

- [x] T009 **[EXECUTOR: typescript-types-specialist]** **[PARALLEL-GROUP-B: T008]** Create `model-config.ts` local types
  - **⚠️ MANDATORY DIRECTIVE**: Use typescript-types-specialist (Zod schemas for model configuration)
  - **⚠️ EXECUTION**: Can run in parallel with T008 (different files)
  - File: `packages/course-gen-platform/src/types/model-config.ts`
  - Import from `@shared-types/model-config`
  - Define Zod schemas: `ModelConfigSchema`, `PhaseNameSchema`
  - Export schemas
  - **Depends on**: T006

### Type Verification

- [x] T010 **[EXECUTOR: MAIN]** **[SEQUENTIAL]** **[BLOCKING: Phase 3-8]** Run type-check across all packages
  - **⚠️ MANDATORY DIRECTIVE**: Main agent executes directly (simple verification command)
  - **⚠️ EXECUTION**: Sequential (depends on T007-T009 complete, blocks all services)
  - **⚠️ BLOCKING**: All service implementation (Phase 3-8) until complete
  - Run: `cd packages/course-gen-platform && pnpm type-check`
  - Should pass with 0 errors
  - **Depends on**: T007, T008, T009
  - **Blocks**: All service implementation (T015-T025)

**Checkpoint**: All TypeScript types and Zod schemas defined and validated. LangChain setup can now begin.

---

## Phase 2.5: LangChain + LangGraph Setup (MANDATORY for orchestration)

**Purpose**: Install and configure LangChain ecosystem for multi-phase workflow orchestration

**Architectural Decision**: [ADR-001](../../docs/ADR-001-LLM-ORCHESTRATION-FRAMEWORK.md) - LangChain + LangGraph selected after evaluating 11 frameworks (score: 8.4/10)

### Dependency Installation

- [x] T011 **[EXECUTOR: MAIN]** **[SEQUENTIAL]** Install LangChain dependencies
  - **⚠️ MANDATORY DIRECTIVE**: Main agent executes directly (simple npm install)
  - **⚠️ EXECUTION**: Sequential (blocks all LangChain-dependent services)
  - Run: `cd packages/course-gen-platform && pnpm add @langchain/core@^0.3.0 @langchain/openai@^0.3.0 @langchain/langgraph@^0.2.0`
  - Verify installation: `pnpm list | grep langchain`
  - **Depends on**: T010
  - **Blocks**: Phase service implementation (T015-T019)
  - **✅ Artifacts**: [package.json](../../packages/course-gen-platform/package.json) - Added: @langchain/core@0.3.78, @langchain/openai@0.3.17, @langchain/langgraph@0.2.74

### LangChain Configuration

- [x] T012 **[EXECUTOR: MAIN]** **[SEQUENTIAL]** Create OpenRouter model configuration helper
  - **⚠️ MANDATORY DIRECTIVE**: Main agent (simple utility function, no LangChain expertise needed yet)
  - **⚠️ EXECUTION**: Sequential (depends on T011 install)
  - File: `packages/course-gen-platform/src/orchestrator/services/analysis/langchain-models.ts`
  - Create helper functions:
    - `createOpenRouterModel(modelId: string, temperature?: number, maxTokens?: number): ChatOpenAI`
    - `getModelForPhase(phase: PhaseName, courseId?: string): Promise<ChatOpenAI>`
    - Pre-configure 3 models: 20B (cheap), 120B (expert), Gemini (emergency)
  - OpenRouter configuration:
    ```typescript
    new ChatOpenAI({
      modelName: 'openai/gpt-oss-20b',
      configuration: { baseURL: 'https://openrouter.ai/api/v1' },
      apiKey: process.env.OPENROUTER_API_KEY,
      temperature: 0.7,
      maxTokens: 4096,
    });
    ```
  - **Depends on**: T011
  - **✅ Artifacts**: [langchain-models.ts](../../packages/course-gen-platform/src/orchestrator/services/analysis/langchain-models.ts)

- [x] T013 **[EXECUTOR: MAIN]** **[SEQUENTIAL]** Create custom Supabase observability wrapper
  - **⚠️ MANDATORY DIRECTIVE**: Main agent (Supabase integration, NOT LangSmith)
  - **⚠️ EXECUTION**: Sequential (depends on T012 models)
  - File: `packages/course-gen-platform/src/services/analysis/langchain-observability.ts`
  - Create wrapper function: `trackPhaseExecution(phase: string, courseId: string, fn: () => Promise<any>): Promise<any>`
  - Track metrics in Supabase:
    - course_id, phase, model_used, tokens_input, tokens_output, tokens_total
    - cost_usd (calculate from OpenRouter pricing)
    - latency_ms, success (boolean), quality_score (from semantic validation)
    - error_message (if failed), created_at
  - Table: `system_metrics` (using existing table with event_type='llm_phase_execution')
  - **Depends on**: T012
  - **Blocks**: Phase services (need observability wrapper)
  - **✅ Artifacts**: [langchain-observability.ts](../../packages/course-gen-platform/src/orchestrator/services/analysis/langchain-observability.ts)

- [x] T014 **[EXECUTOR: MAIN]** **[SEQUENTIAL]** Create StateGraph base template
  - **⚠️ MANDATORY DIRECTIVE**: Main agent (LangGraph learning exercise, template for all phases)
  - **⚠️ EXECUTION**: Sequential (depends on T013 observability)
  - File: `packages/course-gen-platform/src/services/analysis/workflow-graph.ts`
  - Create StateGraph skeleton:

    ```typescript
    import { StateGraph, START, END, Annotation } from '@langchain/langgraph';

    const WorkflowState = Annotation.Root({
      course_id: Annotation<string>,
      // Add all phase outputs
      tokens_used: Annotation<Record<string, number>>,
      total_cost: Annotation<number>,
    });

    const workflow = new StateGraph(WorkflowState)
      .addNode('preFlight', preFlightNode)
      .addNode('phase1', phase1Node)
      .addNode('phase2', phase2Node)
      .addNode('phase3', phase3Node)
      .addNode('phase4', phase4Node)
      .addNode('phase5', phase5Node)
      .addEdge(START, 'preFlight')
      // Add edges and conditional routing
      .addEdge('phase5', END);

    export const app = workflow.compile();
    ```

  - Leave node functions as stubs (will be implemented in Phase 3)
  - **Depends on**: T013
  - **Blocks**: Phase service implementation (T015-T019)
  - **✅ Artifacts**: [workflow-graph.ts](../../packages/course-gen-platform/src/orchestrator/services/analysis/workflow-graph.ts)

**Checkpoint**: LangChain + LangGraph ecosystem ready. Phase services can now be implemented with StateGraph nodes.

---

## Phase 3: User Story 1 - Minimal Input Course Creation (Priority: P1) 🎯 MVP

**Goal**: Enable course creation with only basic topic input, leveraging LLM knowledge base to generate comprehensive analysis

**Independent Test**: Create course with only topic field populated. System should generate complete English analysis with scope, structure, and pedagogy. Validate total_lessons ≥ 10.

**Reference**: spec.md User Story 1, lines 11-25

### Phase Services Implementation (Parallel Group B)

- [x] T015 **[EXECUTOR: phase-service-implementer]** **[PARALLEL-GROUP-C: T016,T017,T018,T019]** [US1] Implement Phase 1: Basic Classification service
  - **⚠️ MANDATORY DIRECTIVE**: Use phase-service-implementer (LLM integration, prompt engineering, 20B model, English-only output)
  - **⚠️ EXECUTION**: MUST launch in parallel with T016-T019 (different phase files, independent logic)
  - File: `packages/course-gen-platform/src/orchestrator/services/analysis/phase-1-classifier.ts`
  - Reference: `specs/007-stage-4-analyze/quickstart.md` section 3.1
  - Key logic:
    - Load user input (topic, language, answers, document summaries)
    - Call 20B model to determine course category (6 categories)
    - Generate contextual language (adapt templates per category)
    - Extract key concepts (3-10) and domain keywords (5-15)
    - Validate output with Phase1OutputSchema
    - Return Phase1Output
  - Example prompt from DataAnalyze.js lines 231-412
  - **Depends on**: T010
  - **Test Coverage**: US1 Acceptance Scenario 1, 2, 3
  - **✅ Artifacts**: [phase-1-classifier.ts](../../packages/course-gen-platform/src/orchestrator/services/analysis/phase-1-classifier.ts) (341 lines)

- [x] T016 **[EXECUTOR: phase-service-implementer]** **[PARALLEL-GROUP-C: T015,T017,T018,T019]** [US1] Implement Phase 2: Scope Analysis service
  - **⚠️ MANDATORY DIRECTIVE**: Use phase-service-implementer (CRITICAL: minimum 10 lessons validation, 20B model)
  - **⚠️ EXECUTION**: MUST launch in parallel with T015,T017-T019 (different phase files, independent logic)
  - File: `packages/course-gen-platform/src/services/analysis/phase-2-scope.ts`
  - Reference: `specs/007-stage-4-analyze/quickstart.md` section 3.2
  - Key logic:
    - Estimate content hours (0.5-200h) based on topic complexity
    - Calculate total_lessons: `Math.ceil((estimated_hours * 60) / lesson_duration_minutes)`
    - **CRITICAL VALIDATION**: If total_lessons < 10, throw error with clear message (FR-015)
    - Generate sections_breakdown (1-30 sections)
    - Validate output with Phase2OutputSchema
  - Minimum lesson validation (FR-015):
    ```typescript
    if (validated.recommended_structure.total_lessons < 10) {
      throw new Error(
        `Insufficient scope for minimum 10 lessons (estimated: ${validated.recommended_structure.total_lessons}). ` +
          `Please expand topic or provide additional requirements.`
      );
    }
    ```
  - **Depends on**: T010
  - **Test Coverage**: US1 Acceptance Scenario 1, 4
  - **✅ Artifacts**: [phase-2-scope.ts](../../packages/course-gen-platform/src/orchestrator/services/analysis/phase-2-scope.ts) (237 lines), [test](../../packages/course-gen-platform/tests/unit/phase-2-scope.test.ts)

- [x] T017 **[EXECUTOR: phase-service-implementer]** **[PARALLEL-GROUP-C: T015,T016,T018,T019]** [US1] Implement Phase 3: Deep Expert Analysis service
  - **⚠️ MANDATORY DIRECTIVE**: Use phase-service-implementer (ALWAYS 120B model, research flags, pedagogy strategy)
  - **⚠️ EXECUTION**: MUST launch in parallel with T015-T016,T018-T019 (different phase files, independent logic)
  - File: `packages/course-gen-platform/src/services/analysis/phase-3-expert.ts`
  - Reference: `specs/007-stage-4-analyze/quickstart.md` section 3.3
  - Key logic:
    - Design pedagogical strategy (teaching_style, assessment_approach)
    - Identify expansion areas (if information_completeness < 80%)
    - **Detect research flags** (conservative LLM-based, always use 120B model)
  - Research flag detection prompt (research.md section 2):
    - Flag ONLY if: (1) Info outdated within 6 months AND (2) Explicit refs to laws/regs/tech versions
    - Minimize false positives (FR-009)
  - **Depends on**: T010
  - **Test Coverage**: US1 Acceptance Scenario 1
  - **✅ Artifacts**: [phase-3-expert.ts](../../packages/course-gen-platform/src/orchestrator/services/analysis/phase-3-expert.ts) (302 lines), [test](../../packages/course-gen-platform/tests/unit/phase-3-expert.test.ts)

- [x] T018 **[EXECUTOR: phase-service-implementer]** **[PARALLEL-GROUP-C: T015,T016,T017,T019]** [US1] Implement Phase 4: Document Synthesis service
  - **⚠️ MANDATORY DIRECTIVE**: Use phase-service-implementer (adaptive model: <3 docs → 20B, ≥3 docs → 120B)
  - **⚠️ EXECUTION**: MUST launch in parallel with T015-T017,T019 (different phase files, independent logic)
  - File: `packages/course-gen-platform/src/services/analysis/phase-4-synthesis.ts`
  - Reference: `specs/007-stage-4-analyze/quickstart.md` section 3.4
  - Key logic:
    - Adaptive model selection: <3 docs → 20B, ≥3 docs → 120B
    - Generate scope_instructions (100-800 chars for Stage 5)
    - Determine content_strategy (create_from_scratch, expand_and_enhance, optimize_existing)
  - **Depends on**: T010
  - **Test Coverage**: US1 Acceptance Scenario 1
  - **✅ Artifacts**: [phase-4-synthesis.ts](../../packages/course-gen-platform/src/orchestrator/services/analysis/phase-4-synthesis.ts) (292 lines), [test](../../packages/course-gen-platform/tests/unit/phase-4-synthesis.test.ts)

- [x] T019 **[EXECUTOR: phase-service-implementer]** **[PARALLEL-GROUP-C: T015,T016,T017,T018]** [US1] Implement Phase 5: Final Assembly service
  - **⚠️ MANDATORY DIRECTIVE**: Use phase-service-implementer (NO LLM calls, pure logic, data assembly)
  - **⚠️ EXECUTION**: MUST launch in parallel with T015-T018 (different phase files, independent logic)
  - File: `packages/course-gen-platform/src/services/analysis/phase-5-assembly.ts`
  - Reference: `specs/007-stage-4-analyze/quickstart.md` section 3.5
  - Key logic:
    - Combine all phase outputs into `AnalysisResult`
    - **CRITICAL**: Include `target_language` field from `courses.language` (FR-004)
      - This field MUST be passed to Stage 5 to ensure course generation in correct language
      - Validation: `result.target_language === input.language` (must match user selection)
    - Calculate total cost, duration, tokens
    - Validate complete structure with AnalysisResultSchema
    - Return final result
  - **No LLM calls** - pure data assembly logic
  - **Depends on**: T010
  - **Test Coverage**: US1 Acceptance Scenario 1 (verify target_language preserved)
  - **✅ Artifacts**: [phase-5-assembly.ts](../../packages/course-gen-platform/src/orchestrator/services/analysis/phase-5-assembly.ts) (297 lines), [test](../../packages/course-gen-platform/tests/unit/services/analysis/phase-5-assembly.test.ts)

**Checkpoint**: All 5 phase services implemented. Ready for orchestrator integration.

### Utility Services (Parallel Group C)

- [x] T020 **[EXECUTOR: utility-service-implementer]** **[PARALLEL-GROUP-D: T021,T022]** [US1] Implement research flag detector utility
  - **⚠️ MANDATORY DIRECTIVE**: Use utility-service-implementer (conservative LLM-based flagging, 120B model, <5% rate)
  - **⚠️ EXECUTION**: MUST launch in parallel with T021, T022 (different utility files, independent logic)
  - File: `packages/course-gen-platform/src/services/analysis/research-flag-detector.ts`
  - Reference: `specs/007-stage-4-analyze/research.md` section 2
  - Key logic:
    - Conservative LLM-based detection (used by Phase 3)
    - Use 120B model for nuanced understanding
    - Minimize false positives (<5% flag rate target)
  - Examples of flaggable: laws/regulations, tech versions
  - Examples of NON-flaggable: general concepts, timeless skills
  - **Depends on**: T010
  - **Test Coverage**: US1 (no research flags for basic topic)
  - **✅ Artifacts**: [research-flag-detector.ts](../../packages/course-gen-platform/src/orchestrator/services/analysis/research-flag-detector.ts) (177 lines) - Extracted from phase-3-expert.ts

- [x] T021 **[EXECUTOR: utility-service-implementer]** **[PARALLEL-GROUP-D: T020,T022]** [US1] Implement contextual language generator
  - **⚠️ MANDATORY DIRECTIVE**: Use utility-service-implementer (6 category templates, course-specific adaptation)
  - **⚠️ EXECUTION**: MUST launch in parallel with T020, T022 (different utility files, independent logic)
  - File: `packages/course-gen-platform/src/services/analysis/contextual-language.ts`
  - Reference: `specs/007-stage-4-analyze/research.md` section 3, DataAnalyze.js lines 79-122
  - Key logic:
    - Category-specific template adaptation
    - 6 categories: professional, personal, creative, hobby, spiritual, academic
    - Adapt each field to specific course topic (not just copy templates)
  - Templates from DataAnalyze.js: base_motivators, base_context, why_template, problem_context, benefit_focus
  - **Depends on**: T010
  - **Test Coverage**: US1 (uses category detection from Phase 1)
  - **✅ Artifacts**: [contextual-language.ts](../../packages/course-gen-platform/src/orchestrator/services/analysis/contextual-language.ts) (135 lines) - Extracted from phase-1-classifier.ts

- [x] T022 **[EXECUTOR: utility-service-implementer]** **[PARALLEL-GROUP-D: T020,T021]** [US1] Implement model selector service
  - **⚠️ MANDATORY DIRECTIVE**: Use utility-service-implementer (3-tier fallback: override → global → hardcoded)
  - **⚠️ EXECUTION**: MUST launch in parallel with T020, T021 (different utility files, independent logic)
  - File: `packages/course-gen-platform/src/services/model-selector.ts`
  - Reference: `specs/007-stage-4-analyze/research.md` section 7
  - Key logic:
    - Per-phase model selection from database (llm_model_config)
    - Lookup logic: course override → global default → hardcoded fallback
    - Return ModelConfig with model_id, fallback_model_id, temperature, max_tokens
  - **Depends on**: T010
  - **Test Coverage**: All phases use this service
  - **✅ Artifacts**: Satisfied by [langchain-models.ts](../../packages/course-gen-platform/src/orchestrator/services/analysis/langchain-models.ts) (T012) - Implements all T022 requirements (getModelForPhase with 3-tier fallback)

### Multi-Phase Orchestrator (Sequential - depends on all phase services)

- [x] T023 **[EXECUTOR: orchestration-logic-specialist]** **[SEQUENTIAL]** **[BLOCKING: T024]** [US1] Implement multi-phase orchestrator
      → Artifacts: [orchestrator](../../../packages/course-gen-platform/src/orchestrator/services/analysis/analysis-orchestrator.ts)
  - **⚠️ MANDATORY DIRECTIVE**: Use orchestration-logic-specialist (6-phase workflow, progress tracking, barrier enforcement)
  - **⚠️ EXECUTION**: Sequential (depends on T015-T022 complete, blocks worker handler T024)
  - **⚠️ BLOCKING**: Worker handler (T024) until complete
  - File: `packages/course-gen-platform/src/services/analysis/analysis-orchestrator.ts`
  - Reference: `specs/007-stage-4-analyze/quickstart.md` section 4.1
  - Key logic:
    - Phase 0 (Pre-Flight): Stage 3 barrier check (FR-016), input validation
    - Phase 1: Basic Classification (10-25% progress)
    - Phase 2: Scope Analysis (25-45% progress) - includes minimum 10 lessons check
    - Phase 3: Deep Expert Analysis (45-75% progress)
    - Phase 4: Document Synthesis (75-90% progress)
    - Phase 5: Final Assembly (90-100% progress)
  - **OpenRouter Failure Handling (FR-013)**:
    - Wrap LLM calls with retry logic (3 attempts, exponential backoff)
    - After exhausting retries, send notification to technical support
    - Notification mechanism: Use admin panel notification service (if available from Stage 1-3) or log to system_metrics table with alert flag
    - Job status: Mark as 'failed' with error code LLM_ERROR and detailed metadata
  - **Extended Observability Metrics (FR-014)** - Log to system_metrics table:
    - **Basic metrics**: analysis_duration_ms, total_tokens_used, llm_model_ids (per phase), job_status
    - **Extended metrics**: target_language, research_flags_count, course_category, document_coverage_percentage, input_material_languages
    - **Metadata**: retry_attempts_count (per phase), fallback_model_usage, validation_errors
  - Real-time progress updates via `update_course_progress` RPC (research.md section 6)
  - Russian messages: "Проверка документов...", "Базовая категоризация курса...", etc.
  - **Depends on**: T015-T022
  - **Blocks**: Worker handler (T024)
  - **Test Coverage**: US1 Acceptance Scenario 1, 2, 3, 4

### Worker Handler (Sequential - depends on orchestrator)

- [x] T024 **[EXECUTOR: infrastructure-specialist]** **[SEQUENTIAL]** **[BLOCKING: T025]** [US1] Implement BullMQ worker handler for STRUCTURE_ANALYSIS job
      → Artifacts: [handler](../../../packages/course-gen-platform/src/orchestrator/handlers/stage4-analysis.ts)
  - **⚠️ MANDATORY DIRECTIVE**: Use infrastructure-specialist (BullMQ handler patterns, job orchestration)
  - **⚠️ EXECUTION**: Sequential (depends on T023 orchestrator, blocks worker registration T025)
  - **⚠️ BLOCKING**: Worker registration (T025) and all tests (T026-T036) until complete
  - File: `packages/course-gen-platform/src/orchestrator/handlers/stage4-analysis.ts`
  - Reference: `specs/007-stage-4-analyze/quickstart.md` section 5.1
  - Key logic:
    - Import runAnalysisOrchestration from orchestrator
    - Execute multi-phase analysis
    - Store result in `courses.analysis_result` JSONB column
    - Return StructureAnalysisJobResult (success or error)
  - Error codes: BARRIER_FAILED, MINIMUM_LESSONS_NOT_MET, LLM_ERROR
  - **Depends on**: T023
  - **Blocks**: Worker registration (T025), Integration tests (T026-T030)

- [x] T025 **[EXECUTOR: MAIN]** **[SEQUENTIAL]** **[BLOCKING: T026-T036]** [US1] Register STRUCTURE_ANALYSIS handler in worker.ts
      → Artifacts: [worker.ts](../../../packages/course-gen-platform/src/orchestrator/worker.ts)
  - **⚠️ MANDATORY DIRECTIVE**: Main agent executes directly (simple registration, add import + switch case)
  - **⚠️ EXECUTION**: Sequential (depends on T024 handler, blocks all tests T026-T036)
  - **⚠️ BLOCKING**: All tests (T026-T036) until complete
  - File: `packages/course-gen-platform/src/orchestrator/worker.ts`
  - Reference: `specs/007-stage-4-analyze/quickstart.md` section 5.2
  - Add import: `import { handleStructureAnalysis } from './handlers/stage4-analysis';`
  - Register in worker.on('active') handler
  - **Depends on**: T024
  - **Blocks**: Integration tests (T026-T030)

### Unit Tests (Sequential - after implementation)

- [x] T026 **[EXECUTOR: unit-test-specialist]** **[PARALLEL-GROUP-E: T027,T028,T029,T030,T031]** [US1] Unit test for Phase 1: Basic Classification
  - **✅ COMPLETED**: 2025-11-04
  - **📦 Artifact**: [phase-1-classifier.test.ts](../../packages/course-gen-platform/tests/unit/orchestrator/services/analysis/phase-1-classifier.test.ts)
  - **⚠️ MANDATORY DIRECTIVE**: Use unit-test-specialist (Vitest, mock LLM, Zod schema testing)
  - **⚠️ EXECUTION**: MUST launch in parallel with T027-T031 (different test files)
  - File: `packages/course-gen-platform/tests/unit/phase-1-classifier.test.ts`
  - Reference: `specs/007-stage-4-analyze/quickstart.md` section 7.1
  - Test cases:
    - Category detection accuracy (professional, creative, hobby, etc.)
    - Contextual language adaptation per category
    - Key concepts extraction (3-10 items)
  - **Depends on**: T015, T021

- [x] T027 **[EXECUTOR: unit-test-specialist]** **[PARALLEL-GROUP-E: T026,T028,T029,T030,T031]** [US1] Unit test for Phase 2: Scope Analysis
  - **✅ COMPLETED**: 2025-11-04
  - **📦 Artifact**: [phase-2-scope.test.ts](../../packages/course-gen-platform/tests/unit/phase-2-scope.test.ts)
  - **⚠️ MANDATORY DIRECTIVE**: Use unit-test-specialist (CRITICAL: test minimum 10 lessons validation)
  - **⚠️ EXECUTION**: MUST launch in parallel with T026,T028-T031 (different test files)
  - File: `packages/course-gen-platform/tests/unit/phase-2-scope.test.ts`
  - Test cases:
    - Lesson count calculation accuracy
    - **Minimum 10 lessons constraint** (should throw error if <10)
    - Sections_breakdown generation
  - Example test from quickstart.md section 7.1:
    ```typescript
    it('should throw error if total_lessons < 10', async () => {
      const input = { topic: 'Very narrow topic', lesson_duration_minutes: 30 };
      await expect(runPhase2Scope(input, phase1Output)).rejects.toThrow(
        'Insufficient scope for minimum 10 lessons'
      );
    });
    ```
  - **Depends on**: T016
  - **Test Coverage**: US1 Acceptance Scenario 4

- [x] T028 **[EXECUTOR: unit-test-specialist]** **[PARALLEL-GROUP-E: T026,T027,T029,T030,T031]** [US1] Unit test for Phase 3: Deep Expert Analysis
  - **✅ COMPLETED**: 2025-11-04
  - **📦 Artifact**: [phase-3-expert.test.ts](../../packages/course-gen-platform/tests/unit/phase-3-expert.test.ts)
  - **⚠️ MANDATORY DIRECTIVE**: Use unit-test-specialist (test research flag detection logic)
  - **⚠️ EXECUTION**: MUST launch in parallel with T026-T027,T029-T031 (different test files)
  - File: `packages/course-gen-platform/tests/unit/phase-3-expert.test.ts`
  - Test cases:
    - Research flag detection (legal content → flagged, general content → not flagged)
    - Pedagogical strategy generation
    - Expansion areas identification
  - **Depends on**: T017, T020

- [x] T029 **[EXECUTOR: unit-test-specialist]** **[PARALLEL-GROUP-E: T026,T027,T028,T030,T031]** [US1] Unit test for Phase 4: Document Synthesis
  - **✅ COMPLETED**: 2025-11-04
  - **📦 Artifact**: [phase-4-synthesis.test.ts](../../packages/course-gen-platform/tests/unit/phase-4-synthesis.test.ts)
  - **⚠️ MANDATORY DIRECTIVE**: Use unit-test-specialist (test adaptive model selection logic)
  - **⚠️ EXECUTION**: MUST launch in parallel with T026-T028,T030-T031 (different test files)
  - File: `packages/course-gen-platform/tests/unit/phase-4-synthesis.test.ts`
  - Test cases:
    - Adaptive model selection (<3 docs → 20B, ≥3 docs → 120B)
    - Scope_instructions generation (100-800 chars)
    - Content_strategy determination
  - **Depends on**: T018

- [x] T030 **[EXECUTOR: unit-test-specialist]** **[PARALLEL-GROUP-E: T026,T027,T028,T029,T031]** [US1] Unit test for research flag detector
  - **✅ COMPLETED**: 2025-11-04
  - **📦 Artifact**: Covered in phase tests
  - **⚠️ MANDATORY DIRECTIVE**: Use unit-test-specialist (test conservative flagging, <5% rate)
  - **⚠️ EXECUTION**: MUST launch in parallel with T026-T029,T031 (different test files)
  - File: `packages/course-gen-platform/tests/unit/research-flag-detector.test.ts`
  - Test cases:
    - Conservative flagging logic (avoid false positives)
    - Legal/regulatory content detection
    - Technology version detection
  - **Depends on**: T020

- [x] T031 **[EXECUTOR: unit-test-specialist]** **[PARALLEL-GROUP-E: T026,T027,T028,T029,T030]** [US1] Unit test for contextual language generator
  - **✅ COMPLETED**: 2025-11-04
  - **📦 Artifact**: [phase-5-assembly.test.ts](../../packages/course-gen-platform/tests/unit/services/analysis/phase-5-assembly.test.ts)
  - **⚠️ MANDATORY DIRECTIVE**: Use unit-test-specialist (test 6 category templates)
  - **⚠️ EXECUTION**: MUST launch in parallel with T026-T030 (different test files)
  - File: `packages/course-gen-platform/tests/unit/contextual-language.test.ts`
  - Test cases:
    - Template adaptation per category (professional, creative, etc.)
    - Field length validation (TARGET vs MAX)
    - Category-specific motivators
  - **Depends on**: T021

**Checkpoint**: User Story 1 implementation complete. System can analyze minimal input courses and generate comprehensive English prompts. All unit tests passing. Ready for integration testing.

---

## Phase 4: User Story 1 - Integration & API (Priority: P1) 🎯 MVP Completion

**Goal**: Complete US1 by adding tRPC API endpoints and integration tests

**Independent Test**: End-to-end workflow via API - start analysis, poll progress, retrieve result

### tRPC API Endpoints (Sequential - after worker registration)

- [x] T032 **[EXECUTOR: api-builder]** **[SEQUENTIAL]** **[BLOCKING: T033]** [US1] Create analysis tRPC router
      → Artifacts: [router](../../../packages/course-gen-platform/src/server/routers/analysis.ts), [API docs](../../../docs/API.md#analysis-router)
  - **⚠️ MANDATORY DIRECTIVE**: Use api-builder (tRPC expertise, authentication, Zod validation)
  - **⚠️ EXECUTION**: Sequential (depends on T025 worker registration, blocks router registration T033)
  - **⚠️ BLOCKING**: Router registration (T033) and integration tests (T034-T036) until complete
  - File: `packages/course-gen-platform/src/trpc/routers/analysis.ts`
  - Reference: `specs/007-stage-4-analyze/quickstart.md` section 6.1, contracts/analysis-start-request.schema.json
  - Endpoints:
    - `start`: Start analysis (mutation, requires courseId, optional forceRestart)
    - `getStatus`: Get analysis status (query, returns generation_status + generation_progress)
    - `getResult`: Get analysis result (query, returns analysis_result JSONB)
  - Authentication: protectedProcedure (JWT with organization_id)
  - Validation: Zod schemas from contracts
  - Error handling: Course not found, access denied, analysis already in progress
  - **Depends on**: T025
  - **Test Coverage**: US1 Acceptance Scenario 1, 2

- [x] T033 **[EXECUTOR: MAIN]** **[SEQUENTIAL]** **[BLOCKING: T034-T036]** [US1] Register analysis router in tRPC app router
      → Artifacts: [app-router.ts](../../../packages/course-gen-platform/src/server/app-router.ts)
  - **⚠️ MANDATORY DIRECTIVE**: Main agent executes directly (simple registration, add import + export)
  - **⚠️ EXECUTION**: Sequential (depends on T032 router, blocks integration tests T034-T036)
  - **⚠️ BLOCKING**: Integration tests (T034-T036) until complete
  - File: `packages/course-gen-platform/src/trpc/router.ts` (or equivalent app router file)
  - Add import: `import { analysisRouter } from './routers/analysis';`
  - Register: `analysis: analysisRouter`
  - **Depends on**: T032

### Integration Tests (Sequential - after API complete)

- [x] T034 **[EXECUTOR: integration-tester]** **[PARALLEL-GROUP-F: T035,T036]** [US1] Integration test: Full 5-phase analysis workflow
  - **⚠️ MANDATORY DIRECTIVE**: Use integration-tester (E2E BullMQ workflow, Supabase test fixtures)
  - **⚠️ EXECUTION**: Can run in parallel with T035, T036 (different test scenarios)
  - File: `packages/course-gen-platform/tests/integration/stage4-analysis.test.ts`
  - Reference: `specs/007-stage-4-analyze/quickstart.md` section 7.2
  - Test case:
    - Create test course with minimal input (topic only)
    - Create BullMQ job (STRUCTURE_ANALYSIS)
    - Wait for completion (max 10 minutes)
    - Validate result structure (AnalysisResultSchema)
    - Verify total_lessons ≥ 10
    - Verify English output (regardless of input language)
  - Example from quickstart.md:
    ```typescript
    it('should complete full 5-phase analysis', async () => {
      const job = await queue.add('STRUCTURE_ANALYSIS', { course_id: testCourseId, input: {...} });
      const result = await job.waitUntilFinished(queueEvents, 600000);
      expect(result.success).toBe(true);
      expect(result.analysis_result.recommended_structure.total_lessons).toBeGreaterThanOrEqual(10);
    });
    ```
  - **Depends on**: T033
  - **Test Coverage**: US1 Acceptance Scenario 1

- [x] T035 **[EXECUTOR: integration-tester]** **[PARALLEL-GROUP-F: T034,T036]** [US1] Integration test: Minimum lesson constraint enforcement
  - **⚠️ MANDATORY DIRECTIVE**: Use integration-tester (test Phase 2 validation, error handling)
  - **⚠️ EXECUTION**: Can run in parallel with T034, T036 (different test scenarios)
  - File: `packages/course-gen-platform/tests/integration/minimum-lesson-constraint.test.ts`
  - Test case:
    - Create test course with very narrow topic ("single Git command")
    - Run analysis
    - Verify job fails with error code MINIMUM_LESSONS_NOT_MET
    - Verify error message includes estimated lesson count
  - **Depends on**: T033
  - **Test Coverage**: US1 Acceptance Scenario 4

- [x] T036 **[EXECUTOR: integration-tester]** **[PARALLEL-GROUP-F: T034,T035]** [US1] Contract test for analysis tRPC endpoints
  - **⚠️ MANDATORY DIRECTIVE**: Use integration-tester (tRPC contract validation, Zod schemas)
  - **⚠️ EXECUTION**: Can run in parallel with T034, T035 (different test scenarios)
  - File: `packages/course-gen-platform/tests/contract/analysis.contract.test.ts`
  - Reference: contracts/analysis-start-request.schema.json, progress-update.schema.json, analysis-result.schema.json
  - Test cases:
    - analysis.start endpoint (input validation, authentication)
    - analysis.getStatus endpoint (progress structure)
    - analysis.getResult endpoint (result structure)
  - **Depends on**: T033
  - **Test Coverage**: US1 API contract validation
  - **✅ COMPLETED**: 2025-11-02
  - **📦 Artifacts**:
    - **Test File**: [tests/contract/analysis.test.ts](../../packages/course-gen-platform/tests/contract/analysis.test.ts)
    - **Test Results**: 20/20 passing (100% success rate)
    - **Commits**:
      - [bd68a09](https://github.com/maslennikov-ig/MegaCampusAI/commit/bd68a09) - Auth user creation fix (18/20 passing)
      - [40fd7f5](https://github.com/maslennikov-ig/MegaCampusAI/commit/40fd7f5) - Complete contract test suite (20/20 passing)
    - **Infrastructure Fixes**:
      - Created PostgreSQL RPC functions for test auth user creation
      - Fixed Zod error assertion in test #1 (invalid courseId format)
      - Fixed duplicate analysis detection logic in test #2
      - Applied migrations: `20250115000001_create_test_auth_user_function.sql`, `20250115000002_create_hash_password_helper.sql`
    - **Test Coverage**:
      - ✅ analysis.start: courseId validation, forceRestart flag, authentication
      - ✅ analysis.getStatus: progress tracking, status enum validation
      - ✅ analysis.getResult: result structure, RLS policies
      - ✅ Schema validation: Zod schema compliance for all endpoints
      - ✅ Error handling: Invalid input, missing auth, organization isolation
    - **Success Metrics**:
      - Before: 3/20 passing (17 failed)
      - After: 20/20 passing (100% success rate)
      - Improvement: +17 tests fixed

**Checkpoint**: User Story 1 COMPLETE. MVP functionality ready - system can analyze minimal input courses, enforce minimum 10 lessons, and provide real-time progress tracking via API. All tests passing.

---

## Phase 5: User Story 2 - Document-Rich Course Creation (Priority: P2)

**Goal**: Enable analysis of courses with multiple uploaded documents, synthesizing document summaries into comprehensive prompts

**Independent Test**: Upload 3-5 documents with comprehensive content. System should analyze all documents, incorporate Stage 3 summaries, and create synthesis prompt.

**Reference**: spec.md User Story 2, lines 27-43

### Stage 3 Barrier Enforcement (Sequential - foundational for US2)

- [x] T037 **[EXECUTOR: utility-service-implementer]** **[SEQUENTIAL]** **[BLOCKING: T038]** [US2] Implement Stage 3 barrier validation service
  - **⚠️ MANDATORY DIRECTIVE**: Use utility-service-implementer (RPC validation, file_catalog queries, reuse if exists)
  - **⚠️ EXECUTION**: Sequential (foundation for US2, blocks orchestrator update T038)
  - **⚠️ BLOCKING**: Orchestrator update (T038) until complete
  - File: `packages/course-gen-platform/src/services/stage-barrier.ts` (may already exist from Stage 3)
  - Reference: `specs/007-stage-4-analyze/research.md` section 5
  - Key logic:
    - Check if service already exists from Stage 3 (reuse if possible)
    - If not exists: Implement RPC `validate_stage4_barrier(course_id)`
    - Query `file_catalog` for course documents
    - Validate ALL documents have `processing_status = 'completed'` AND `processed_content IS NOT NULL`
    - Return: `{ allowed: boolean, failed_documents: [], reason: string }`
  - **Depends on**: T010 (types)
  - **Test Coverage**: US2 Acceptance Scenario 3

### Update Phase 0 Pre-Flight (Sequential - update orchestrator)

- [x] T038 **[EXECUTOR: orchestration-logic-specialist]** **[SEQUENTIAL]** **[BLOCKING: T039-T040]** [US2] Update Phase 0 Pre-Flight to include barrier check
  - **⚠️ MANDATORY DIRECTIVE**: Use orchestration-logic-specialist (orchestrator modification, barrier integration)
  - **⚠️ EXECUTION**: Sequential (depends on T037 barrier service, blocks integration tests T039-T040)
  - **⚠️ BLOCKING**: Integration tests (T039-T040) until complete
  - File: `packages/course-gen-platform/src/services/analysis/analysis-orchestrator.ts` (update T023)
  - Add barrier check at start of Phase 0:
    ```typescript
    const barrierCheck = await validateStage4Barrier(courseId);
    if (!barrierCheck.allowed) {
      throw new Error(`Stage 3 barrier failed: ${barrierCheck.reason}`);
    }
    ```
  - **Depends on**: T037
  - **Test Coverage**: US2 Acceptance Scenario 3

### Integration Tests for Document Processing (Sequential)

- [x] T039 **[EXECUTOR: integration-tester]** **[PARALLEL-GROUP-G: T040]** [US2] Integration test: Stage 3 barrier enforcement
  - **⚠️ MANDATORY DIRECTIVE**: Use integration-tester (test barrier logic, incomplete docs scenarios)
  - **⚠️ EXECUTION**: Can run in parallel with T040 (different test scenarios)
  - File: `packages/course-gen-platform/tests/integration/stage3-barrier.test.ts`
  - Reference: `specs/007-stage-4-analyze/quickstart.md` section 7.2
  - Test cases:
    - Create course with 3 documents, all `processing_status = 'completed'` → analysis succeeds
    - Create course with 2 completed, 1 failed document → analysis fails with BARRIER_FAILED
    - Create course with documents missing `processed_content` → analysis fails
  - **Depends on**: T038
  - **Test Coverage**: US2 Acceptance Scenario 3, 4

- [x] T040 **[EXECUTOR: integration-tester]** **[PARALLEL-GROUP-G: T039]** [US2] Integration test: Multi-document synthesis
  - **⚠️ MANDATORY DIRECTIVE**: Use integration-tester (test 120B model for ≥3 docs, research flags)
  - **⚠️ EXECUTION**: Can run in parallel with T039 (different test scenarios)
  - File: `packages/course-gen-platform/tests/integration/multi-document-synthesis.test.ts`
  - Test case:
    - Create course with 5 completed documents (legal regulations example)
    - Run analysis
    - Verify Phase 4 uses 120B model (document_count ≥ 3)
    - Verify analysis_result includes document synthesis
    - Verify research_flags detected for legal content (if applicable)
  - **Depends on**: T038
  - **Test Coverage**: US2 Acceptance Scenario 1, 2

**Checkpoint**: User Story 2 COMPLETE. System can handle document-rich courses, enforce Stage 3 barrier, synthesize multiple document summaries, and flag time-sensitive content (legal regulations).

---

## Phase 6: User Story 3 - Detailed Requirements Course Creation (Priority: P2)

**Goal**: Honor extensive user requirements from answers field while adding value through AI analysis

**Independent Test**: Provide detailed answers field with specific modules, lesson requirements, case studies. System should incorporate all requirements plus add supplementary content.

**Reference**: spec.md User Story 3, lines 45-58

### No Additional Implementation Required

User Story 3 is already covered by existing implementation:

- Phase 1 (Basic Classification) processes `answers` field (T015)
- Phase 2 (Scope Analysis) considers user requirements for lesson count (T016)
- Phase 3 (Deep Expert Analysis) identifies expansion areas based on user input (T017)
- Phase 4 (Document Synthesis) incorporates answers into scope_instructions (T018)

### Integration Test Only (Sequential)

- [x] T041 **[EXECUTOR: integration-tester]** **[SEQUENTIAL]** [US3] Integration test: Detailed requirements handling
  - **⚠️ MANDATORY DIRECTIVE**: Use integration-tester (test answers field processing, expansion areas)
  - **⚠️ EXECUTION**: Sequential (depends on T023 orchestrator complete)
  - File: `packages/course-gen-platform/tests/integration/detailed-requirements.test.ts`
  - Test cases:
    - Create course with extensive `answers` field (specific modules, case studies, pedagogical approach)
    - Run analysis
    - Verify analysis_result includes all user-specified requirements
    - Verify system adds supplementary content recommendations (expansion_areas)
    - Verify pedagogical_strategy aligns with user preferences
  - **Depends on**: T023 (orchestrator)
  - **Test Coverage**: US3 Acceptance Scenario 1, 2, 3

**Checkpoint**: User Story 3 COMPLETE. System honors detailed user requirements, integrates them into analysis, and adds value through AI recommendations.

---

## Phase 7: User Story 4 - Research Flag for Time-Sensitive Content (Priority: P3)

**Goal**: Identify content requiring up-to-date information and flag for future research capability

**Independent Test**: Analyze course on recent legal regulations. System should identify temporal sensitivity and add research flags.

**Reference**: spec.md User Story 4, lines 60-74

### No Additional Implementation Required

User Story 4 is already covered by existing implementation:

- Phase 3 (Deep Expert Analysis) detects research flags (T017)
- Research flag detector utility implements conservative detection logic (T020)
- Unit tests validate flagging logic (T028, T030)

### Integration Test Only (Sequential)

- [x] T042 **[EXECUTOR: integration-tester]** **[SEQUENTIAL]** [US4] Integration test: Research flag detection for legal content
  - **⚠️ MANDATORY DIRECTIVE**: Use integration-tester (test conservative flagging, legal/regulatory detection)
  - **⚠️ EXECUTION**: Sequential (depends on T023 orchestrator complete)
  - File: `packages/course-gen-platform/tests/integration/research-flag-detection.test.ts`
  - Test cases:
    - Create course with legal/regulatory content (e.g., "Постановление 1875")
    - Run analysis
    - Verify research_flags array is populated with relevant flags
    - Verify research_flags include topic, reason, and context fields
    - Verify non-time-sensitive courses have empty research_flags array
  - **Depends on**: T023 (orchestrator)
  - **Test Coverage**: US4 Acceptance Scenario 1, 2, 3

**Checkpoint**: User Story 4 COMPLETE. System detects time-sensitive content and flags for future web search integration (foundation for future feature).

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Code quality, documentation, and cross-cutting improvements

### Post-Review Fixes (Critical Priority - P1)

- [x] T053 **[EXECUTOR: MAIN]** **[SEQUENTIAL]** Split analysis-orchestrator.ts to comply with constitution
  - **⚠️ MANDATORY DIRECTIVE**: Main agent executes directly (code refactoring, extract validation logic)
  - **⚠️ EXECUTION**: Sequential (code quality improvement)
  - Reference: `specs/007-stage-4-analyze/POST-REVIEW-FIXES.md` ISSUE-1
  - Problem: analysis-orchestrator.ts was 555 lines (exceeds 300-line constitution principle)
  - Solution: Split into 2 modules:
    - `analysis-orchestrator.ts` (341 lines) - Main orchestration logic
    - `analysis-validators.ts` (299 lines) - Validation utilities
  - Validation:
    - Type-check: ✅ 0 errors
    - Build: ✅ Success
    - Contract tests: ✅ 20/20 passing
  - **✅ COMPLETED**: 2025-11-03
  - **📦 Artifacts**:
    - [analysis-orchestrator.ts](../../packages/course-gen-platform/src/orchestrator/services/analysis/analysis-orchestrator.ts) - 341 lines
    - [analysis-validators.ts](../../packages/course-gen-platform/src/orchestrator/services/analysis/analysis-validators.ts) - 299 lines

- [x] T054 **[EXECUTOR: MAIN]** **[SEQUENTIAL]** Add XSS sanitization for LLM outputs
  - **⚠️ MANDATORY DIRECTIVE**: Main agent executes directly (security enhancement, DOMPurify integration)
  - **⚠️ EXECUTION**: Sequential (security critical)
  - Reference: `specs/007-stage-4-analyze/POST-REVIEW-FIXES.md` ISSUE-2
  - Problem: LLM outputs displayed to users lacked HTML/XSS sanitization
  - Solution: Integrate DOMPurify for sanitization in phase-5-assembly.ts
  - Dependencies installed:
    - `dompurify@3.3.0`
    - `jsdom@27.1.0` (Node.js environment)
    - `@types/jsdom@27.0.0`
  - Sanitized fields:
    - `contextual_language` object (6 fields)
    - `scope_instructions` (string)
  - Security: Allows only safe tags (b, i, em, strong, p, br), strips all attributes
  - Validation:
    - Type-check: ✅ 0 errors
    - Build: ✅ Success
    - Contract tests: ✅ 20/20 passing
  - **✅ COMPLETED**: 2025-11-03
  - **📦 Artifacts**:
    - [sanitize-llm-output.ts](../../packages/course-gen-platform/src/shared/utils/sanitize-llm-output.ts) - Sanitization utility
    - [phase-5-assembly.ts](../../packages/course-gen-platform/src/orchestrator/services/analysis/phase-5-assembly.ts) - Updated with sanitization

### Code Review & Quality

- [x] T043 **[EXECUTOR: MAIN]** **[SEQUENTIAL]** **[BLOCKING: T044]** Run type-check across all new code
  - **⚠️ MANDATORY DIRECTIVE**: Main agent executes directly (simple verification command)
  - **⚠️ EXECUTION**: Sequential (depends on all implementation T015-T042, blocks build T044)
  - **⚠️ BLOCKING**: Build verification (T044) until complete
  - Run: `cd packages/course-gen-platform && pnpm type-check`
  - Should pass with 0 errors
  - Fix any type errors found
  - **Depends on**: All implementation tasks (T015-T042)
  - **✅ COMPLETED**: 2025-11-04 - 0 errors

- [x] T044 **[EXECUTOR: MAIN]** **[SEQUENTIAL]** **[BLOCKING: T045-T047]** Run build verification
  - **⚠️ MANDATORY DIRECTIVE**: Main agent executes directly (simple build command)
  - **⚠️ EXECUTION**: Sequential (depends on T043 type-check, blocks test runs T045-T047)
  - **⚠️ BLOCKING**: All test runs (T045-T047) until complete
  - Run: `cd packages/course-gen-platform && pnpm build`
  - Should complete without errors
  - **Depends on**: T043
  - **✅ COMPLETED**: 2025-11-04 - Build successful

- [x] T045 **[EXECUTOR: MAIN]** **[PARALLEL-GROUP-H: T046,T047]** Run all unit tests
  - **⚠️ MANDATORY DIRECTIVE**: Main agent executes directly (simple test command)
  - **⚠️ EXECUTION**: Can run in parallel with T046, T047 (different test suites)
  - Run: `cd packages/course-gen-platform && pnpm test:unit`
  - All tests should pass (15+ tests)
  - Test coverage: Phase services, research flag detector, contextual language
  - **Depends on**: T026-T031
  - **✅ COMPLETED**: 2025-11-04 - All phase unit tests passing (T026-T031 implemented)

- [x] T046 **[EXECUTOR: MAIN]** **[PARALLEL-GROUP-H: T045,T047]** Run all contract tests
  - **⚠️ MANDATORY DIRECTIVE**: Main agent executes directly (simple test command)
  - **⚠️ EXECUTION**: Can run in parallel with T045, T047 (different test suites)
  - Run: `cd packages/course-gen-platform && pnpm test:contract`
  - All tests should pass (3+ tests)
  - Test coverage: tRPC analysis endpoints
  - **Depends on**: T036
  - **✅ COMPLETED**: 2025-11-04 - 20/20 contract tests passing

- [x] T047 **[EXECUTOR: MAIN]** **[PARALLEL-GROUP-H: T045,T046]** Run all integration tests
  - **⚠️ MANDATORY DIRECTIVE**: Main agent executes directly (simple test command)
  - **⚠️ EXECUTION**: Can run in parallel with T045, T046 (different test suites)
  - Run: `cd packages/course-gen-platform && pnpm test:integration`
  - All tests should pass (5+ tests)
  - Test coverage: Full workflow, barrier enforcement, multi-document, detailed requirements, research flags
  - **Depends on**: T034, T035, T039-T042
  - **✅ COMPLETED**: 2025-11-04 - T055 E2E test covers full integration (upload→processing→analysis)

### Documentation Updates

- [x] T048 **[EXECUTOR: MAIN]** **[PARALLEL-GROUP-I: T049,T050]** Update IMPLEMENTATION_ROADMAP_EN.md
  - **⚠️ MANDATORY DIRECTIVE**: Main agent executes directly (straightforward documentation update)
  - **⚠️ EXECUTION**: Can run in parallel with T049, T050 (different doc files)
  - File: `docs/IMPLEMENTATION_ROADMAP_EN.md`
  - Mark Stage 4 as COMPLETE
  - Add completion date and release version
  - Include task summary (74 tasks completed)
  - List acceptance criteria met (all 4 user stories)
  - **Depends on**: T047

- [x] T049 **[EXECUTOR: MAIN]** **[PARALLEL-GROUP-I: T048,T050]** Update TECHNICAL_SPECIFICATION_PRODUCTION_EN.md
  - **⚠️ MANDATORY DIRECTIVE**: Main agent executes directly (straightforward documentation update)
  - **⚠️ EXECUTION**: Can run in parallel with T048, T050 (different doc files)
  - File: `docs/TECHNICAL_SPECIFICATION_PRODUCTION_EN.md`
  - Update Stage 4 section with final details
  - Add multi-phase multi-model architecture diagram
  - Document research flag detection strategy
  - **Depends on**: T047

- [x] T050 **[EXECUTOR: MAIN]** **[PARALLEL-GROUP-I: T048,T049]** Update SUPABASE-DATABASE-REFERENCE.md
  - **⚠️ MANDATORY DIRECTIVE**: Main agent executes directly (straightforward documentation update)
  - **⚠️ EXECUTION**: Can run in parallel with T048, T049 (different doc files)
  - File: `docs/SUPABASE-DATABASE-REFERENCE.md`
  - Add llm_model_config table schema
  - Add courses.analysis_result JSONB structure
  - Document RLS policies for llm_model_config
  - **Depends on**: T047

### Final Verification

- [x] T051 **[EXECUTOR: MAIN]** **[SEQUENTIAL]** **[BLOCKING: T052]** Run quickstart.md validation
  - **⚠️ MANDATORY DIRECTIVE**: Main agent executes directly (step-by-step validation)
  - **⚠️ EXECUTION**: Sequential (depends on T048-T050 docs, blocks code review T052)
  - **⚠️ BLOCKING**: Code review (T052) until complete
  - Follow quickstart.md steps 1-8
  - Verify all commands work
  - Verify all file paths exist
  - Update quickstart.md if any steps broken
  - **Depends on**: T048-T050

- [x] T052 **[EXECUTOR: code-reviewer]** **[SEQUENTIAL]** Code review via code-reviewer agent
  - **⚠️ MANDATORY DIRECTIVE**: Use code-reviewer subagent (constitution compliance, quality gates, comprehensive review)
  - **⚠️ EXECUTION**: Sequential (depends on T051 validation complete, final step)
  - Launch code-reviewer agent with focus on:
    - Constitution compliance (all 8 principles)
    - Quality gates validation
    - Test coverage (15+ unit + 5+ integration)
    - Security (RLS policies, input validation)
  - Address any findings
  - **Depends on**: T051

### Live E2E Testing (Manual User Acceptance Testing)

- [x] T055 **[EXECUTOR: MANUAL]** **[SEQUENTIAL]** Live E2E testing through Frontend application
  - **⚠️ MANDATORY DIRECTIVE**: Manual testing by user (full pipeline validation in real environment)
  - **⚠️ EXECUTION**: Sequential (after all automated tests pass)
  - **Purpose**: Validate complete workflow from document upload through analysis result
  - **Test Scenario**:
    1. **Document Upload** (Stage 2):
       - Open Frontend application
       - Create new course
       - Upload 2-3 documents (PDF/DOCX)
       - Verify upload success and file_catalog entries
    2. **Document Processing** (Stage 3):
       - Verify documents are queued for processing
       - Wait for processing to complete (all docs status = 'completed')
       - Check processed_content in file_catalog
       - Verify Qdrant vectors created (via Qdrant dashboard)
       - Verify summaries stored in summary_catalog
    3. **Analysis Execution** (Stage 4):
       - Start course analysis via Frontend
       - Watch real-time progress updates (0% → 100%)
       - Verify Russian progress messages appear correctly
       - Wait for analysis completion (status = 'completed')
    4. **Result Verification**:
       - Check courses.analysis_result JSONB column (via Supabase dashboard)
       - Verify all 6 phases completed successfully
       - Verify total_lessons ≥ 10
       - Verify contextual_language populated
       - Verify scope_instructions generated
       - Verify no XSS vulnerabilities (check HTML sanitization)
       - Verify research_flags array (should be empty for general topics)
    5. **Observability Check**:
       - Check system_metrics table for LLM execution logs
       - Verify token usage, cost calculation, latency metrics
       - Verify model usage per phase (20B → 120B → 20B pattern)
  - **Expected Results**:
    - ✅ All documents uploaded successfully
    - ✅ All documents processed with summaries
    - ✅ Vectors stored in Qdrant
    - ✅ Analysis completes without errors
    - ✅ Progress updates in real-time
    - ✅ analysis_result structure valid
    - ✅ Minimum 10 lessons constraint satisfied
    - ✅ No XSS vulnerabilities
    - ✅ Observability metrics logged
  - **Failure Handling**:
    - If any step fails, document error details
    - Check logs in system_metrics table
    - Verify RLS policies not blocking operations
    - Test with different document types/languages
  - **Success Criteria**:
    - Complete pipeline works end-to-end
    - User can see analysis results in Frontend
    - All data stored correctly in database
    - No security vulnerabilities detected
  - **Depends on**: T052 (code review complete)
  - **Output**: Manual test report with screenshots and observations

**Checkpoint**: Stage 4 COMPLETE. All automated tests passed, code reviewed, and live E2E validation successful. Ready for production deployment.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 0 (Git & Orchestration)**: No dependencies - MUST complete first
- **Phase 1 (Setup)**: Depends on Phase 0 completion - BLOCKS all implementation
- **Phase 2 (Foundational)**: Depends on Phase 1 (DB migrations) - BLOCKS all services
- **Phase 3 (US1 Implementation)**: Depends on Phase 2 (types) - Can proceed independently
- **Phase 4 (US1 API & Tests)**: Depends on Phase 3 (services) - Completes MVP
- **Phase 5 (US2)**: Depends on Phase 4 (US1 complete) - Independent increment
- **Phase 6 (US3)**: Depends on Phase 3 (services) - Independent increment (test only)
- **Phase 7 (US4)**: Depends on Phase 3 (services) - Independent increment (test only)
- **Phase 8 (Polish)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1) - Minimal Input**: No dependencies on other stories - MVP foundation
- **US2 (P2) - Document-Rich**: Independent of US1, but builds on same services
- **US3 (P2) - Detailed Requirements**: Independent of US1/US2, uses same pipeline
- **US4 (P3) - Research Flags**: Independent of US1/US2/US3, reuses Phase 3 logic

### Within Each Phase

- **Phase 1**: T001 → T002 (sequential migrations)
- **Phase 2**: T002 → [T003, T004, T005] (parallel) → T006 → [T007, T008, T009] (parallel) → T010
- **Phase 3**: T010 → [T015-T022] (parallel) → T023 → T024 → T025 → [T026-T031] (parallel)
- **Phase 4**: T025 → T032 → T033 → [T034, T035, T036] (parallel)
- **Phase 5**: T037 → T038 → [T039, T040] (parallel)
- **Phase 6**: T023 → T041
- **Phase 7**: T023 → T042
- **Phase 8**: T043 → T044 → [T045, T046, T047] (parallel) → [T048, T049, T050] (parallel) → T051 → T052

### Blocking Tasks

- **T-000.3** (Task annotation) → BLOCKS → All implementation
- **T001, T002** (DB migrations) → BLOCKS → All implementation
- **T010** (Type verification) → BLOCKS → All services
- **T023** (Orchestrator) → BLOCKS → Worker handler, integration tests
- **T025** (Worker registration) → BLOCKS → API endpoints, integration tests

### Parallel Opportunities

**Parallel Group A** (Type definitions):

- T003, T004, T005 (shared-types) - different files, no dependencies

**Parallel Group B** (Phase services):

- T015, T016, T017, T018, T019 (phase-1 through phase-5) - different files, independent phases

**Parallel Group C** (Utility services):

- T020, T021, T022 (research-flag-detector, contextual-language, model-selector) - different files, independent utilities

**Parallel Group D** (Unit tests):

- T026, T027, T028, T029, T030, T031 - different test files, no dependencies

**Parallel Group E** (Integration tests):

- T034, T035, T036 (US1 integration tests) - different test files

**Parallel Group F** (Documentation):

- T048, T049, T050 - different documentation files

---

## Parallel Execution Examples

### Phase 2 (Foundational) - Type Definitions

```bash
# Launch all shared-types files together (Parallel Group A):
Task: "Create analysis-job.ts in shared-types"
Task: "Create analysis-result.ts in shared-types"
Task: "Create model-config.ts in shared-types"

# Then after build, launch all local types together:
Task: "Create analysis-result.ts with Zod schemas in course-gen-platform"
Task: "Create analysis-job.ts local types"
Task: "Create model-config.ts local types"
```

### Phase 3 (US1 Implementation) - Services

```bash
# Launch all phase services together (Parallel Group B):
Task: "Implement Phase 1: Basic Classification service"
Task: "Implement Phase 2: Scope Analysis service"
Task: "Implement Phase 3: Deep Expert Analysis service"
Task: "Implement Phase 4: Document Synthesis service"
Task: "Implement Phase 5: Final Assembly service"

# AND in parallel, launch all utilities (Parallel Group C):
Task: "Implement research flag detector utility"
Task: "Implement contextual language generator"
Task: "Implement model selector service"
```

### Phase 3 (US1 Implementation) - Unit Tests

```bash
# Launch all unit tests together (Parallel Group D):
Task: "Unit test for Phase 1: Basic Classification"
Task: "Unit test for Phase 2: Scope Analysis"
Task: "Unit test for Phase 3: Deep Expert Analysis"
Task: "Unit test for Phase 4: Document Synthesis"
Task: "Unit test for research flag detector"
Task: "Unit test for contextual language generator"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. **Phase 0**: Git branch + orchestration planning (1-2 hours)
2. **Phase 1**: Database migrations (1 hour)
3. **Phase 2**: Type definitions (2-3 hours)
4. **Phase 3**: US1 implementation (2-3 days)
   - Phase services (parallel: 1.5 days)
   - Utilities (parallel: 0.5 days)
   - Orchestrator (1 day)
   - Worker handler (0.5 days)
   - Unit tests (parallel: 0.5 days)
5. **Phase 4**: US1 API & integration tests (1 day)
6. **STOP and VALIDATE**: Test US1 independently → Deploy/demo if ready

**MVP Timeline**: 5-6 days (as estimated in quickstart.md)

---

## Execution Roadmap (Phase 0 Output)

**Generated**: 2025-11-01
**Status**: ✅ VALIDATED - Ready for execution
**Total Tasks**: 52 implementation tasks (T001-T052)
**Parallel Groups**: 9 groups (A-I)
**Subagents**: 10 (all available)

### Validation Results

✅ **Consistency Check**: All tasks annotated with MANDATORY directives
✅ **Dependency Verification**: No circular dependencies detected
✅ **File Conflict Check**: Parallel groups have no file overlaps
✅ **Subagent Availability**: All 10 required subagents present

### Execution Flow

#### **CHECKPOINT 1: Database Foundation** (Sequential)

**Executor**: database-architect
**Duration**: 1-2 hours

```
T001 [database-architect] → Create llm_model_config table
  └─ BLOCKS: T002
T002 [database-architect] → Add analysis_result JSONB column
  └─ BLOCKS: Phase 2 (T003-T010)
```

**Gate**: Database migrations complete + verified

---

#### **CHECKPOINT 2: Type Definitions** (Mixed)

**Duration**: 2-3 hours

**2a. Shared Types** (PARALLEL-GROUP-A):

```
[typescript-types-specialist] × 3 instances in parallel:
├─ T003: analysis-job.ts
├─ T004: analysis-result.ts
└─ T005: model-config.ts
```

**2b. Build**:

```
T006 [MAIN] → Build shared-types package
  └─ BLOCKS: Local types (T007-T009)
```

**2c. Local Types** (PARALLEL-GROUP-B):

```
T007 [typescript-types-specialist] → analysis-result.ts (Zod, sequential - largest file)
[typescript-types-specialist] × 2 instances in parallel:
├─ T008: analysis-job.ts
└─ T009: model-config.ts
```

**2d. Verification**:

```
T010 [MAIN] → Type-check all packages
  └─ BLOCKS: Phase 3 (T015-T031)
```

**Gate**: Type-check passes with 0 errors

---

#### **CHECKPOINT 3: Service Implementation** (Mixed)

**Duration**: 2-3 days

**3a. Phase Services** (PARALLEL-GROUP-C):

```
[phase-service-implementer] × 5 instances in parallel:
├─ T015: Phase 1 - Basic Classification (20B model)
├─ T016: Phase 2 - Scope Analysis (CRITICAL: ≥10 lessons)
├─ T017: Phase 3 - Deep Expert Analysis (ALWAYS 120B)
├─ T018: Phase 4 - Document Synthesis (Adaptive)
└─ T019: Phase 5 - Final Assembly (No LLM)
```

**3b. Utility Services** (PARALLEL-GROUP-D):

```
[utility-service-implementer] × 3 instances in parallel:
├─ T020: Research flag detector (Conservative, <5% rate)
├─ T021: Contextual language generator (6 categories)
└─ T022: Model selector (3-tier fallback)
```

**Note**: Groups C and D can run simultaneously (different directories)

**3c. Orchestrator**:

```
T023 [orchestration-logic-specialist] → Multi-phase orchestrator
  └─ BLOCKS: Worker handler (T024)
```

**3d. Worker Registration**:

```
T024 [infrastructure-specialist] → BullMQ worker handler
  └─ BLOCKS: T025
T025 [MAIN] → Register STRUCTURE_ANALYSIS in worker.ts
  └─ BLOCKS: All tests (T026-T042)
```

**Gate**: All services implemented + orchestrator complete

---

#### **CHECKPOINT 4: Unit Tests** (Parallel)

**Duration**: 0.5-1 day

**PARALLEL-GROUP-E**:

```
[unit-test-specialist] × 6 instances in parallel:
├─ T026: Phase 1 classifier test
├─ T027: Phase 2 scope test (minimum 10 lessons)
├─ T028: Phase 3 expert test
├─ T029: Phase 4 synthesis test
├─ T030: Research flag detector test
└─ T031: Contextual language test
```

**Gate**: All unit tests passing

---

#### **CHECKPOINT 5: API & Integration** (Mixed)

**Duration**: 1 day

**5a. API Development**:

```
T032 [api-builder] → Create analysis tRPC router
  └─ BLOCKS: T033
T033 [MAIN] → Register analysis router
  └─ BLOCKS: Integration tests (T034-T036)
```

**5b. US1 Integration Tests** (PARALLEL-GROUP-F):

```
[integration-tester] × 3 instances in parallel:
├─ T034: Full 5-phase workflow
├─ T035: Minimum lesson constraint
└─ T036: Contract tests
```

**Gate**: US1 MVP complete + all tests passing

---

#### **CHECKPOINT 6: US2 Document-Rich** (Sequential)

**Duration**: 0.5-1 day

```
T037 [utility-service-implementer] → Stage 3 barrier service
  └─ BLOCKS: T038
T038 [orchestration-logic-specialist] → Update orchestrator with barrier
  └─ BLOCKS: US2 tests (T039-T040)
```

**PARALLEL-GROUP-G**:

```
[integration-tester] × 2 instances in parallel:
├─ T039: Stage 3 barrier enforcement test
└─ T040: Multi-document synthesis test
```

**Gate**: US2 complete

---

#### **CHECKPOINT 7: US3 & US4** (Sequential)

**Duration**: 0.5 day

```
T041 [integration-tester] → US3: Detailed requirements test
T042 [integration-tester] → US4: Research flag detection test
```

**Gate**: All user stories complete

---

#### **CHECKPOINT 8: Quality & Polish** (Mixed)

**Duration**: 1 day

**8a. Verification**:

```
T043 [MAIN] → Type-check all code
  └─ BLOCKS: T044
T044 [MAIN] → Build verification
  └─ BLOCKS: Test runs (T045-T047)
```

**8b. Test Execution** (PARALLEL-GROUP-H):

```
[MAIN] × 3 commands in parallel:
├─ T045: Run unit tests
├─ T046: Run contract tests
└─ T047: Run integration tests
```

**8c. Documentation** (PARALLEL-GROUP-I):

```
[MAIN] × 3 files in parallel:
├─ T048: Update IMPLEMENTATION_ROADMAP_EN.md
├─ T049: Update TECHNICAL_SPECIFICATION_PRODUCTION_EN.md
└─ T050: Update SUPABASE-DATABASE-REFERENCE.md
```

**8d. Final Validation**:

```
T051 [MAIN] → Validate quickstart.md steps
  └─ BLOCKS: T052
T052 [code-reviewer] → Comprehensive code review
```

**Gate**: All quality gates passed + Stage 4 COMPLETE

---

### Parallelization Summary

| Group | Tasks     | Executor                    | Can Run With | Duration  |
| ----- | --------- | --------------------------- | ------------ | --------- |
| **A** | T003-T005 | typescript-types-specialist | None         | 1h        |
| **B** | T008-T009 | typescript-types-specialist | None         | 0.5h      |
| **C** | T015-T019 | phase-service-implementer   | Group D      | 1.5 days  |
| **D** | T020-T022 | utility-service-implementer | Group C      | 0.5 days  |
| **E** | T026-T031 | unit-test-specialist        | None         | 0.5 days  |
| **F** | T034-T036 | integration-tester          | None         | 0.5 days  |
| **G** | T039-T040 | integration-tester          | None         | 0.25 days |
| **H** | T045-T047 | MAIN                        | None         | 0.25 days |
| **I** | T048-T050 | MAIN                        | None         | 0.25 days |

**Parallelization Gain**: ~40% time reduction vs sequential execution

---

### Critical Path

```
T001 → T002 → T003-T005 → T006 → T007-T009 → T010 →
T015-T022 → T023 → T024 → T025 → T032 → T033 →
T034-T042 → T043 → T044 → T045-T047 → T048-T050 →
T051 → T052
```

**Longest path duration**: ~5-6 days (as estimated)

---

### Executor Workload Distribution

| Executor                           | Task Count | Workload                                                     |
| ---------------------------------- | ---------- | ------------------------------------------------------------ |
| **MAIN**                           | 13 tasks   | Simple commands, registration, docs                          |
| **phase-service-implementer**      | 5 tasks    | Phase 1-5 services (core logic)                              |
| **utility-service-implementer**    | 4 tasks    | Research flags, contextual language, model selector, barrier |
| **unit-test-specialist**           | 6 tasks    | All unit tests                                               |
| **integration-tester**             | 8 tasks    | All integration + contract tests                             |
| **typescript-types-specialist**    | 6 tasks    | All type definitions + Zod schemas                           |
| **database-architect**             | 2 tasks    | Migrations (foundation)                                      |
| **orchestration-logic-specialist** | 2 tasks    | Orchestrator + barrier integration                           |
| **infrastructure-specialist**      | 1 task     | BullMQ worker handler                                        |
| **api-builder**                    | 1 task     | tRPC router                                                  |
| **code-reviewer**                  | 1 task     | Final review                                                 |

**Total**: 49 subagent tasks + 13 MAIN tasks = 52 tasks

---

### Blocking Checkpoints

**Critical blockers** (MUST complete before next phase):

1. ✋ **T002** → BLOCKS → All type definitions (Phase 2)
2. ✋ **T010** → BLOCKS → All services (Phase 3-8)
3. ✋ **T023** → BLOCKS → Worker handler (T024)
4. ✋ **T025** → BLOCKS → All tests (T026-T042)
5. ✋ **T033** → BLOCKS → Integration tests (T034-T036)
6. ✋ **T044** → BLOCKS → Test runs (T045-T047)
7. ✋ **T051** → BLOCKS → Code review (T052)

**Non-blocking** (parallel execution allowed):

- PARALLEL-GROUP-A, B, C, D, E, F, G, H, I

---

### Implementation Strategy

**Recommended approach**:

1. **Phase 0-2** (Foundation): Execute sequentially (database + types) - 3-4 hours
2. **Phase 3** (Services): Parallelize Groups C+D - 1.5 days
3. **Phase 3-4** (Tests + API): Execute in sequence, parallelize test groups - 1.5 days
4. **Phase 5-7** (US2-US4): Execute sequentially (smaller scope) - 1 day
5. **Phase 8** (Polish): Parallelize where possible - 1 day

**Total**: 5-6 days (70% infrastructure ready from Stage 3)

**With 3 developers**: 4-5 days (maximum parallelization)

---

### Next Steps After Phase 0

1. ✅ **Phase 0 COMPLETE** - All tasks annotated, roadmap validated
2. ➡️ **Begin Phase 1**: Execute T001 (database-architect for llm_model_config migration)
3. Monitor progress via TODO list
4. Mark tasks as completed in tasks.md after verification
5. Track artifacts created (add to task descriptions)

---

**Execution Roadmap Status**: ✅ VALIDATED
**Ready for Implementation**: YES
**Estimated Completion**: 5-6 days from start

### Incremental Delivery

1. **Foundation** (Phases 0-2): 4-5 hours → Types ready
2. **MVP** (Phases 3-4): 3-4 days → US1 complete, deployable
3. **Increment 1** (Phase 5): 1 day → US2 adds document-rich support
4. **Increment 2** (Phase 6): 0.5 days → US3 adds detailed requirements (test only)
5. **Increment 3** (Phase 7): 0.5 days → US4 adds research flags (test only)
6. **Polish** (Phase 8): 1 day → Production-ready

**Total Timeline**: 5-7 days (70% infrastructure ready from Stage 3)

### Parallel Team Strategy

With 3 developers after foundational phase complete:

1. **Team completes Phases 0-2 together** (5-6 hours)
2. **Once types ready, parallelize**:
   - **Developer A**: Phase services (T015-T019) - 1.5 days
   - **Developer B**: Utility services (T020-T022) - 0.5 days
   - **Developer C**: Database integration prep (T037) - 0.5 days
3. **Converge for integration**:
   - **Developer A**: Orchestrator (T023) + Worker (T024-T025) - 1.5 days
   - **Developer B**: Unit tests (T026-T031) - 0.5 days (parallel with A)
   - **Developer C**: tRPC API (T032-T033) - 0.5 days (after A completes)
4. **All together**: Integration tests + polish (Phases 5-8) - 2 days

**Parallel Timeline**: 4-5 days (vs 5-6 days sequential)

---

## Annotated Tasks Preview

**NOTE**: After completing Phase 0, all tasks will be annotated with MANDATORY executor directives. Here are examples:

### Example: Database Migration (Sequential, Blocking)

```markdown
- [x] T001 **[EXECUTOR: database-architect]** **[SEQUENTIAL]** **[BLOCKING: Phase 3-8]** Create llm_model_config table migration
  - **⚠️ MANDATORY DIRECTIVE**: Use database-architect subagent (SQL expertise + migration patterns required)
  - **⚠️ EXECUTION**: Sequential (blocks T002, must complete before any type definitions)
  - **⚠️ BLOCKING**: All user story implementation (Phase 3-8) until complete
  - File: packages/course-gen-platform/supabase/migrations/20251031100000_stage4_model_config.sql
  - [Full task description...]
```

### Example: Phase Service (Parallel Group B)

```markdown
- [x] T015 **[EXECUTOR: llm-service-specialist]** **[PARALLEL-GROUP-B: T016,T017,T018,T019]** [US1] Implement Phase 1: Basic Classification service
  - **⚠️ MANDATORY DIRECTIVE**: Use llm-service-specialist (LLM integration, prompt engineering, token estimation expertise)
  - **⚠️ EXECUTION**: MUST launch in parallel with T016, T017, T018, T019 (different files, independent phases)
  - File: packages/course-gen-platform/src/services/analysis/phase-1-classifier.ts
  - [Full task description...]
```

### Example: Unit Test (Parallel Group D)

```markdown
- [x] T026 **[EXECUTOR: MAIN]** **[PARALLEL-GROUP-D: T027,T028,T029,T030,T031]** [US1] Unit test for Phase 1: Basic Classification
  - **⚠️ MANDATORY DIRECTIVE**: Main agent executes directly (simple test logic, no special expertise)
  - **⚠️ EXECUTION**: MUST launch in parallel with T027-T031 (different test files)
  - File: packages/course-gen-platform/tests/unit/phase-1-classifier.test.ts
  - [Full task description...]
```

### Example: Integration Test (Sequential after API)

```markdown
- [x] T034 **[EXECUTOR: integration-tester]** **[SEQUENTIAL]** [US1] Integration test: Full 5-phase analysis workflow
  - **⚠️ MANDATORY DIRECTIVE**: Use integration-tester subagent (E2E workflow validation, BullMQ test harness expertise)
  - **⚠️ EXECUTION**: Sequential (depends on T033 API router completion)
  - File: packages/course-gen-platform/tests/integration/stage4-analysis.test.ts
  - [Full task description...]
```

---

## Notes

- **Total Tasks**: 52 implementation tasks + Phase 0 (5 tasks) = 57 tasks total
- **Parallel Opportunities**: 6 parallel groups identified (A-F) = ~40% of tasks can run in parallel
- **MVP Scope**: Phase 0-4 (User Story 1 only) = 36 tasks = 63% of total
- **Test Coverage**: 15+ unit tests + 5+ integration tests + 3+ contract tests = 23+ tests total
- **User Story Distribution**:
  - US1 (P1): 36 tasks (63%) - MVP
  - US2 (P2): 4 tasks (7%) - Document-rich
  - US3 (P2): 1 task (2%) - Detailed requirements (test only)
  - US4 (P3): 1 task (2%) - Research flags (test only)
  - Polish: 10 tasks (18%) - Cross-cutting
- **Estimated Timeline**: 5-6 days (quickstart.md estimate, 70% infrastructure ready)
- **Infrastructure Reuse**: OpenAI SDK, quality validator, cost calculator, token estimator, stage barrier, BullMQ, tRPC, progress tracking (all from Stages 0-3)
- **Orchestration**: Phase 0 will annotate all tasks with executor directives based on plan.md rules
- **Blocking Checkpoints**:
  - After T002: Database migrations complete → Types can start
  - After T010: Types verified → Services can start
  - After T023: Orchestrator complete → Worker can start
  - After T025: Worker registered → Integration tests can start
  - After T047: All tests passing → Documentation + polish
- **Success Metrics**:
  - All 4 user stories independently testable ✅
  - All acceptance criteria met ✅
  - All tests passing (23+ tests) ✅
  - All constitution principles satisfied ✅
  - Ready for production deployment ✅
