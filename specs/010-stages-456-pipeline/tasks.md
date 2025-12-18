# Tasks: Stage 4-6 Course Generation Pipeline

**Input**: Design documents from `/specs/010-stages-456-pipeline/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/trpc-procedures.ts, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `packages/course-gen-platform/src/`, `packages/shared-types/src/`
- **Tests**: `tests/unit/`, `tests/contract/`, `tests/integration/`
- **Migrations**: `packages/course-gen-platform/supabase/migrations/`

---

## Phase 0: Planning

**Purpose**: Prepare for implementation by analyzing requirements, creating necessary agents, and assigning executors.

- [X] P001 Analyze all tasks and identify required agent types and capabilities
  → Artifacts: Analysis complete, 5 missing agents identified
- [X] P002 Create missing agents using meta-agent-v3 (launch N calls in single message, 1 per agent), then ask user restart
  → Artifacts: [langgraph-specialist](.claude/agents/development/workers/langgraph-specialist.md), [rag-specialist](.claude/agents/infrastructure/workers/rag-specialist.md), [stage-pipeline-specialist](.claude/agents/development/workers/stage-pipeline-specialist.md), [bullmq-worker-specialist](.claude/agents/infrastructure/workers/bullmq-worker-specialist.md), [judge-specialist](.claude/agents/development/workers/judge-specialist.md)
- [X] P003 Assign executors to all tasks: MAIN (trivial only), existing agents (100% match), or specific agent names
  → Artifacts: All 94 tasks annotated with [EXECUTOR: agent-name]
- [X] P004 Resolve research tasks: simple (solve with tools now), complex (create prompts in research/)
  → Artifacts: LLM Judge research exists at docs/research/010-stage6-generation-strategy/

**Rules**:
- **MAIN executor**: ONLY for trivial tasks (1-2 line fixes, simple imports, single npm install)
- **Existing agents**: ONLY if 100% capability match after thorough examination
- **Agent creation**: Launch all meta-agent-v3 calls in single message for parallel execution
- **After P002**: Must restart claude-code before proceeding to P003

**Artifacts**:
- Updated tasks.md with [EXECUTOR: name], [SEQUENTIAL]/[PARALLEL-GROUP-X] annotations
- .claude/agents/{domain}/{type}/{name}.md (if new agents created)
- research/*.md (if complex research identified)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and configure project structure

- [X] T001 [EXECUTOR: MAIN] Install @langchain/langgraph, @langchain/core, @langchain/openai dependencies in packages/course-gen-platform/package.json
  → Artifacts: [package.json](packages/course-gen-platform/package.json)
- [X] T002 [P] [EXECUTOR: MAIN] Create directory structure for Stage 6 at packages/course-gen-platform/src/stages/stage6-lesson-content/
  → Artifacts: [stage6-lesson-content/](packages/course-gen-platform/src/stages/stage6-lesson-content/)
- [X] T003 [P] [EXECUTOR: MAIN] Create README.md for Stage 6 at packages/course-gen-platform/src/stages/stage6-lesson-content/README.md
  → Artifacts: [README.md](packages/course-gen-platform/src/stages/stage6-lesson-content/README.md)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types, schemas, and shared infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

### Shared Types (packages/shared-types/src/)

- [X] T004 [P] [EXECUTOR: typescript-types-specialist] Create DocumentPriority and BudgetAllocation types in packages/shared-types/src/document-prioritization.ts
  → Artifacts: [document-prioritization.ts](packages/shared-types/src/document-prioritization.ts)
- [X] T005 [P] [EXECUTOR: typescript-types-specialist] Create LessonSpecificationV2 schema with Semantic Scaffolding in packages/shared-types/src/lesson-specification-v2.ts
  → Artifacts: [lesson-specification-v2.ts](packages/shared-types/src/lesson-specification-v2.ts)
- [X] T006 [P] [EXECUTOR: typescript-types-specialist] Create LessonContent and RAGContextCache types in packages/shared-types/src/lesson-content.ts
  → Artifacts: [lesson-content.ts](packages/shared-types/src/lesson-content.ts)
- [X] T007 [P] [EXECUTOR: typescript-types-specialist] Enhance AnalysisResult with DocumentRelevanceMapping and GenerationGuidance in packages/shared-types/src/analysis-result.ts
  → Artifacts: [analysis-result.ts](packages/shared-types/src/analysis-result.ts)
- [X] T008 [P] [EXECUTOR: typescript-types-specialist] Enhance BullMQ job types with Stage6Job in packages/shared-types/src/bullmq-jobs.ts
  → Artifacts: [bullmq-jobs.ts](packages/shared-types/src/bullmq-jobs.ts)
- [X] T009 [EXECUTOR: MAIN] Update shared-types index.ts to export all new types in packages/shared-types/src/index.ts
  → Artifacts: [index.ts](packages/shared-types/src/index.ts)

### Database Migrations (Supabase)

- [X] T010 [P] [EXECUTOR: database-architect] Create migration for document_priorities table in packages/course-gen-platform/supabase/migrations/
  → Artifacts: [20251122123313_create_document_priorities_table](supabase/migrations/)
- [X] T011 [P] [EXECUTOR: database-architect] Create migration for lesson_contents table in packages/course-gen-platform/supabase/migrations/
  → Artifacts: [20251122123324_create_lesson_contents_table](supabase/migrations/)
- [X] T012 [P] [EXECUTOR: database-architect] Create migration for rag_context_cache table in packages/course-gen-platform/supabase/migrations/
  → Artifacts: [20251122123323_create_rag_context_cache](supabase/migrations/)
- [X] T013 [P] [EXECUTOR: database-architect] Create migration for generation_locks table (concurrency control) in packages/course-gen-platform/supabase/migrations/
  → Artifacts: [20251122123328_create_generation_locks_table](supabase/migrations/)

### LLM Parameters Infrastructure

- [X] T014 [EXECUTOR: llm-service-specialist] Create LLM parameters selector with archetype-based temperature routing in packages/course-gen-platform/src/shared/llm/llm-parameters.ts
  → Artifacts: [llm-parameters.ts](packages/course-gen-platform/src/shared/llm/llm-parameters.ts)
- [X] T015 [P] [EXECUTOR: llm-service-specialist] Create model selector with language-aware routing (RU/EN) in packages/course-gen-platform/src/shared/llm/model-selector.ts
  → Artifacts: [model-selector.ts](packages/course-gen-platform/src/shared/llm/model-selector.ts)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Course Creator Uploads Documents (Priority: P1) MVP

**Goal**: Document prioritization - classify documents as HIGH/LOW priority and allocate processing budgets

**Independent Test**: Upload 3 documents of varying sizes and types, verify classification and budget allocation

### Implementation for User Story 1

- [X] T016 [P] [US1] [EXECUTOR: stage-pipeline-specialist] Create document classification phase in packages/course-gen-platform/src/stages/stage2-document-processing/phases/phase-classification.ts
  → Artifacts: [phase-classification.ts](packages/course-gen-platform/src/stages/stage2-document-processing/phases/phase-classification.ts)
- [X] T017 [P] [US1] [EXECUTOR: stage-pipeline-specialist] Create budget allocator in packages/course-gen-platform/src/stages/stage3-summarization/phases/budget-allocator.ts
  → Artifacts: [budget-allocator.ts](packages/course-gen-platform/src/stages/stage3-summarization/phases/budget-allocator.ts)
- [X] T018 [US1] [EXECUTOR: stage-pipeline-specialist] Integrate classification into Stage 2 orchestrator in packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator.ts
  → Artifacts: [orchestrator.ts](packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator.ts)
- [X] T019 [US1] [EXECUTOR: stage-pipeline-specialist] Integrate budget allocation into Stage 3 orchestrator in packages/course-gen-platform/src/stages/stage3-summarization/orchestrator.ts
  → Artifacts: [orchestrator.ts](packages/course-gen-platform/src/stages/stage3-summarization/orchestrator.ts)
- [X] T020 [US1] [EXECUTOR: stage-pipeline-specialist] Implement adaptive summarization based on priority (HIGH: 10K balanced, LOW: 5K aggressive) in packages/course-gen-platform/src/stages/stage3-summarization/phases/
  → Artifacts: [phase-adaptive-strategy.ts](packages/course-gen-platform/src/stages/stage3-summarization/phases/phase-adaptive-strategy.ts)
- [X] T021 [US1] [EXECUTOR: stage-pipeline-specialist] Update vectorization to use ORIGINAL text (not summaries) for RAG in packages/course-gen-platform/src/stages/stage3-summarization/
  → Artifacts: [vectorization-validator.ts](packages/course-gen-platform/src/stages/stage3-summarization/phases/vectorization-validator.ts)
- [X] T022 [US1] [EXECUTOR: api-builder] Add tRPC procedures for classifyDocuments and allocateBudget in packages/course-gen-platform/src/server/routers/course.ts
  → Artifacts: [course.ts](packages/course-gen-platform/src/server/routers/course.ts)
- [X] T023 [US1] [EXECUTOR: MAIN] Add structured logging for document prioritization in packages/course-gen-platform/src/stages/stage2-document-processing/
  → Artifacts: Included in T016 (phase-classification.ts with pino logging)

**Checkpoint**: User Story 1 complete - documents can be classified and budgets allocated

---

## Phase 4: User Story 2 - Analysis Stage Structures Course (Priority: P1)

**Goal**: RAG Planning - map sections to documents with search queries and confidence levels

**Independent Test**: Run analysis on processed documents, verify section breakdown and RAG plan generation

### Implementation for User Story 2

- [X] T024 [P] [US2] [EXECUTOR: stage-pipeline-specialist] Create Phase 6 (RAG Planning) in packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-6-rag-planning.ts
  → Artifacts: Enhanced [phase-6-rag-planning.ts](packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-6-rag-planning.ts) with confidence levels
- [X] T025 [US2] [EXECUTOR: orchestration-logic-specialist] Integrate Phase 6 into Stage 4 orchestrator with Stage 3 barrier validation in packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts
  → Artifacts: Already implemented in orchestrator.ts (Stage 3 barrier + Phase 6 integration)
- [X] T026 [US2] [EXECUTOR: stage-pipeline-specialist] Implement document-to-section mapping logic with confidence levels in packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-6-rag-planning.ts
  → Artifacts: Merged with T024 - confidence:'high'|'medium' based on processing_mode
- [X] T027 [US2] [EXECUTOR: stage-pipeline-specialist] Generate search queries from section objectives in packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-6-rag-planning.ts
  → Artifacts: Merged with T024 - search_queries field added to SectionRAGPlan
- [X] T028 [US2] [EXECUTOR: stage-pipeline-specialist] Create GenerationGuidance output (replacing deprecated scope_instructions) in packages/course-gen-platform/src/stages/stage4-analysis/
  → Artifacts: Already implemented in phase-4-synthesis.ts and phase-5-assembly.ts
- [X] T029 [US2] [EXECUTOR: stage-pipeline-specialist] Update AnalysisResult output to include document_relevance_mapping in packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts
  → Artifacts: Already implemented - Phase 6 output merged in orchestrator
- [X] T030 [US2] [EXECUTOR: MAIN] Add structured logging for RAG planning phase in packages/course-gen-platform/src/stages/stage4-analysis/
  → Artifacts: Logging already present in phase-6-rag-planning.ts

**Checkpoint**: User Story 2 complete - analysis produces RAG plan with section-document mapping

---

## Phase 5: User Story 3 - Generation Stage Creates Lesson Specifications (Priority: P1)

**Goal**: V2 LessonSpecification with Semantic Scaffolding and section-level RAG retrieval

**Independent Test**: Run generation on analysis results, verify lesson breakdown with content structure and RAG queries

### Implementation for User Story 3

- [X] T031 [P] [US3] [EXECUTOR: stage-pipeline-specialist] Create semantic scaffolding utilities (inferContentArchetype, inferHookStrategy, mapDepth) in packages/course-gen-platform/src/stages/stage5-generation/utils/semantic-scaffolding.ts
  → Artifacts: [semantic-scaffolding.ts](packages/course-gen-platform/src/stages/stage5-generation/utils/semantic-scaffolding.ts) (506 lines)
- [X] T032 [P] [US3] [EXECUTOR: rag-specialist] Create section-level RAG retrieval service (20-30 chunks per section) in packages/course-gen-platform/src/stages/stage5-generation/utils/section-rag-retriever.ts
  → Artifacts: [section-rag-retriever.ts](packages/course-gen-platform/src/stages/stage5-generation/utils/section-rag-retriever.ts) (542 lines)
- [X] T033 [US3] [EXECUTOR: stage-pipeline-specialist] Enhance Phase 3 to generate V2 LessonSpecification in packages/course-gen-platform/src/stages/stage5-generation/phases/
  → Artifacts: [phase3-v2-spec-generator.ts](packages/course-gen-platform/src/stages/stage5-generation/phases/phase3-v2-spec-generator.ts) (1000 lines), [generation-phases.ts](packages/course-gen-platform/src/stages/stage5-generation/phases/generation-phases.ts) (updated)
- [X] T034 [US3] [EXECUTOR: rag-specialist] Implement RAG context caching (store retrieved chunks by rag_context_id) in packages/course-gen-platform/src/stages/stage5-generation/utils/rag-context-cache.ts
  → Artifacts: [rag-context-cache.ts](packages/course-gen-platform/src/stages/stage5-generation/utils/rag-context-cache.ts) (760 lines)
- [X] T035 [US3] [EXECUTOR: stage-pipeline-specialist] Update section-batch-generator to produce V2 output in packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch-generator.ts
  → Artifacts: [section-batch-generator.ts](packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch-generator.ts) (updated with generateBatchV2, SectionBatchResultV2)
- [X] T036 [US3] [EXECUTOR: quality-validator-specialist] Add validation for minimum 10 lessons total in packages/course-gen-platform/src/stages/stage5-generation/validators/
  → Artifacts: [minimum-lessons-validator.ts](packages/course-gen-platform/src/stages/stage5-generation/validators/minimum-lessons-validator.ts) (320 lines)
- [X] T037 [US3] [EXECUTOR: quality-validator-specialist] Integrate quality validation (0.75 threshold) with LLM Judge 3x voting (temp 0.0) in packages/course-gen-platform/src/stages/stage5-generation/orchestrator.ts
  → Artifacts: [orchestrator.ts](packages/course-gen-platform/src/stages/stage5-generation/orchestrator.ts) (updated with quality gate, QUALITY_CONFIG)
- [X] T038 [US3] [EXECUTOR: MAIN] Add structured logging for V2 generation in packages/course-gen-platform/src/stages/stage5-generation/
  → Artifacts: Included in all V2 files (159 logger calls across 14 files)

**Checkpoint**: User Story 3 complete - V2 LessonSpecifications generated with RAG context

---

## Phase 6: User Story 4 - Lesson Content Generation in Parallel (Priority: P2)

**Goal**: Stage 6 parallel lesson content generation via BullMQ workers + LangGraph state machine

**Independent Test**: Run Stage 6 on lesson specifications, verify parallel execution and content quality

### Stage 6 Core Infrastructure

- [X] T039 [P] [US4] [EXECUTOR: langgraph-specialist] Create LangGraph state definition (LessonGraphState) in packages/course-gen-platform/src/stages/stage6-lesson-content/state.ts
  → Artifacts: [state.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/state.ts) (245 lines, Annotation.Root with reducers)
- [X] T040 [P] [US4] [EXECUTOR: langgraph-specialist] Create Planner node (outline generation) in packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/planner.ts
  → Artifacts: [planner.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/planner.ts)
- [X] T041 [P] [US4] [EXECUTOR: langgraph-specialist] Create Expander node (parallel section expansion) in packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/expander.ts
  → Artifacts: [expander.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/expander.ts)
- [X] T042 [P] [US4] [EXECUTOR: langgraph-specialist] Create Assembler node (content assembly) in packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/assembler.ts
  → Artifacts: [assembler.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/assembler.ts)
- [X] T043 [P] [US4] [EXECUTOR: langgraph-specialist] Create Smoother node (transition refinement) in packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/smoother.ts
  → Artifacts: [smoother.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/smoother.ts), [nodes/index.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/index.ts)

### Stage 6 Orchestration

- [X] T044 [US4] [EXECUTOR: langgraph-specialist] Create LangGraph orchestrator (StateGraph with nodes and edges) in packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts
  → Artifacts: [orchestrator.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts) (StateGraph: START→planner→expander→assembler→smoother→END)
- [X] T045 [US4] [EXECUTOR: bullmq-worker-specialist] Create BullMQ job handler with 30 concurrent workers and streaming progress in packages/course-gen-platform/src/stages/stage6-lesson-content/handler.ts
  → Artifacts: [handler.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/handler.ts) (Worker concurrency: 30)
- [X] T046 [US4] [EXECUTOR: rag-specialist] Implement lesson-level RAG retrieval (5-10 chunks per lesson) in packages/course-gen-platform/src/stages/stage6-lesson-content/utils/lesson-rag-retriever.ts
  → Artifacts: [lesson-rag-retriever.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/utils/lesson-rag-retriever.ts) (TARGET_CHUNKS: 7, score threshold: 0.75)

### Stage 6 Utilities

- [X] T047 [P] [US4] [EXECUTOR: stage-pipeline-specialist] Create prompt templates (Context-First XML strategy) in packages/course-gen-platform/src/stages/stage6-lesson-content/utils/prompt-templates.ts
  → Artifacts: [prompt-templates.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/utils/prompt-templates.ts) (buildPlannerPrompt, buildExpanderPrompt, buildAssemblerPrompt, buildSmootherPrompt)
- [X] T048 [P] [US4] [EXECUTOR: llm-service-specialist] Create dynamic parameter selector (archetype-based temperature) in packages/course-gen-platform/src/stages/stage6-lesson-content/utils/parameter-selector.ts
  → Artifacts: [parameter-selector.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/utils/parameter-selector.ts) (ARCHETYPE_CONFIGS with temperature routing)
- [X] T049 [P] [US4] [EXECUTOR: stage-pipeline-specialist] Create markdown output parser in packages/course-gen-platform/src/stages/stage6-lesson-content/utils/markdown-parser.ts
  → Artifacts: [markdown-parser.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/utils/markdown-parser.ts) (parseMarkdownContent, extractSections, countWords)
- [X] T050 [P] [US4] [EXECUTOR: quality-validator-specialist] Create citation builder from RAG chunks in packages/course-gen-platform/src/stages/stage6-lesson-content/utils/citation-builder.ts
  → Artifacts: [citation-builder.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/utils/citation-builder.ts) (buildCitations, formatCitationsAsFootnotes)

### Stage 6 Validation

- [X] T051 [P] [US4] [EXECUTOR: quality-validator-specialist] Create content validator (quality score calculation) in packages/course-gen-platform/src/stages/stage6-lesson-content/validators/content-validator.ts
  → Artifacts: [content-validator.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/validators/content-validator.ts) (5 criteria, 0.75 threshold)
- [X] T052 [P] [US4] [EXECUTOR: utility-builder] Create XSS sanitizer (DOMPurify integration) in packages/course-gen-platform/src/stages/stage6-lesson-content/validators/xss-sanitizer.ts
  → Artifacts: [xss-sanitizer.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/validators/xss-sanitizer.ts) (DOMPurify + jsdom for Node.js)
- [X] T053 [US4] [EXECUTOR: quality-validator-specialist] Implement INSUFFICIENT_CONTEXT refusal logic in packages/course-gen-platform/src/stages/stage6-lesson-content/validators/
  → Artifacts: [insufficient-context.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/validators/insufficient-context.ts)

### Stage 6 Integration

- [X] T054 [US4] [EXECUTOR: api-builder] Create tRPC procedures for startStage6, getProgress, retryLesson, getLessonContent in packages/course-gen-platform/src/server/routers/stage6.ts
  → Artifacts: [stage6.ts](packages/course-gen-platform/src/server/routers/stage6.ts), [app-router.ts](packages/course-gen-platform/src/server/app-router.ts) (updated)
- [X] T055 [US4] [EXECUTOR: bullmq-worker-specialist] Implement model fallback retry strategy (primary -> fallback model) in packages/course-gen-platform/src/stages/stage6-lesson-content/handler.ts
  → Artifacts: [handler.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/handler.ts) (MODEL_FALLBACK: qwen3/deepseek → kimi-k2)
- [X] T056 [US4] [EXECUTOR: bullmq-worker-specialist] Implement partial success handling (save successful, mark failed for review) in packages/course-gen-platform/src/stages/stage6-lesson-content/
  → Artifacts: [handler.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/handler.ts) (handlePartialSuccess, markForReview)
- [X] T057 [US4] [EXECUTOR: MAIN] Add structured logging for Stage 6 (tokens, cost, duration, quality) in packages/course-gen-platform/src/stages/stage6-lesson-content/
  → Artifacts: 102+ logger calls across 14 Stage 6 files (included in all T039-T056 implementations)

**Checkpoint**: User Story 4 complete - parallel lesson generation operational

---

## Phase 6.5: LLM Judge for Stage 6 Content Validation (Research-Based)

**Purpose**: Implement automated quality assurance for generated lesson content based on Deep Research findings

**Research Reference**: `docs/research/010-stage6-generation-strategy/LLM Judge Implementation*.md`

### Judge Core Infrastructure

- [X] T081 [P] [US4] [EXECUTOR: typescript-types-specialist] Create OSCQR-based evaluation rubric types in packages/shared-types/src/judge-rubric.ts
  → Artifacts: [judge-rubric.ts](packages/shared-types/src/judge-rubric.ts) (JudgeCriterion, CriterionConfig, OSCQRRubric, BloomsTaxonomyLevel)
- [X] T082 [P] [US4] [EXECUTOR: typescript-types-specialist] Create Judge result types (JudgeVerdict, CriteriaScores, FixRecommendation) in packages/shared-types/src/judge-types.ts
  → Artifacts: [judge-types.ts](packages/shared-types/src/judge-types.ts) (JudgeVerdict, JudgeAggregatedResult, JudgeIssue, FixRecommendation)
- [X] T083 [US4] [EXECUTOR: judge-specialist] Create CLEV voting orchestrator (2 judges + conditional 3rd) in packages/course-gen-platform/src/stages/stage6-lesson-content/judge/clev-voter.ts
  → Artifacts: [clev-voter.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/judge/clev-voter.ts) (executeCLEVVoting, selectJudgeModels, language-aware model selection)
- [X] T084 [US4] [EXECUTOR: judge-specialist] Create cascading evaluation logic (single pass → voting for borderline) in packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade-evaluator.ts
  → Artifacts: [cascade-evaluator.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade-evaluator.ts) (3-stage cascade: heuristics→single judge→CLEV)

### Hallucination Detection

- [X] T085 [US4] [EXECUTOR: judge-specialist] Create Logprob Entropy calculator for hallucination pre-filtering in packages/course-gen-platform/src/stages/stage6-lesson-content/judge/entropy-detector.ts
  → Artifacts: [entropy-detector.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/judge/entropy-detector.ts) (analyzeContentEntropy, detectHighEntropySpans)
- [X] T086 [US4] [EXECUTOR: judge-specialist] Integrate entropy-based conditional RAG verification in packages/course-gen-platform/src/stages/stage6-lesson-content/judge/factual-verifier.ts
  → Artifacts: [factual-verifier.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/judge/factual-verifier.ts) (executeFactualVerification, verifyClaimWithRAG)

### Targeted Refinement

- [X] T087 [P] [US4] [EXECUTOR: judge-specialist] Create fix prompt templates with context preservation in packages/course-gen-platform/src/stages/stage6-lesson-content/judge/fix-templates.ts
  → Artifacts: [fix-templates.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/judge/fix-templates.ts) (3 templates: structured_refinement, targeted_section, coherence_preserving)
- [X] T088 [US4] [EXECUTOR: judge-specialist] Create targeted self-refinement loop (max 2 iterations) in packages/course-gen-platform/src/stages/stage6-lesson-content/judge/refinement-loop.ts
  → Artifacts: [refinement-loop.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/judge/refinement-loop.ts) (executeRefinementLoop, shouldContinueRefinement)
- [X] T089 [US4] [EXECUTOR: judge-specialist] Implement score-based decision tree (accept/fix/regenerate/escalate) in packages/course-gen-platform/src/stages/stage6-lesson-content/judge/decision-engine.ts
  → Artifacts: [decision-engine.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/judge/decision-engine.ts) (makeDecision, DecisionAction, buildRegenerationFeedback)

### Judge Integration

- [X] T090 [US4] [EXECUTOR: orchestration-logic-specialist] Integrate Judge into Stage 6 orchestrator after Smoother node in packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts
  → Artifacts: [orchestrator.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts) (judgeNode, flow: planner→expander→assembler→smoother→judge→END)
- [X] T091 [US4] [EXECUTOR: judge-specialist] Create manual review queue for persistent low-quality lessons in packages/course-gen-platform/src/stages/stage6-lesson-content/judge/review-queue.ts
  → Artifacts: [review-queue.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/judge/review-queue.ts) (ReviewQueueService, shouldEscalateToReview, EscalationReason)
- [X] T092 [US4] [EXECUTOR: MAIN] Add Judge-specific structured logging (scores, iterations, decisions) in packages/course-gen-platform/src/stages/stage6-lesson-content/judge/
  → Artifacts: 61+ logger calls across 11 judge files (included in all T081-T091 implementations)

### Cost Optimization

- [X] T093 [P] [US4] [EXECUTOR: judge-specialist] Create heuristic pre-filters (Flesch-Kincaid, length, section headers) in packages/course-gen-platform/src/stages/stage6-lesson-content/judge/heuristic-filter.ts
  → Artifacts: [heuristic-filter.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/judge/heuristic-filter.ts) (runHeuristicFilters, checkFleschKincaid, checkKeywordCoverage)
- [X] T094 [US4] [EXECUTOR: judge-specialist] Implement prompt caching for Judge rubric and few-shot examples in packages/course-gen-platform/src/stages/stage6-lesson-content/judge/prompt-cache.ts
  → Artifacts: [prompt-cache.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/judge/prompt-cache.ts) (PromptCacheService, JUDGE_STATIC_PROMPTS, 60-90% cost reduction)

**Checkpoint**: LLM Judge operational - automated quality assurance for Stage 6 content

---

## Phase 7: User Story 5 - Semantic Scaffolding for Quality Content (Priority: P2)

**Goal**: V2 schema features - hook_strategy, depth constraints, prohibited_terms validation

**Independent Test**: Generate lessons using V2 specifications, compare quality to V1 baseline

### Implementation for User Story 5

- [X] T058 [P] [US5] [EXECUTOR: stage-pipeline-specialist] Implement hook_strategy prompt injection (analogy/statistic/challenge/question) in packages/course-gen-platform/src/stages/stage6-lesson-content/utils/prompt-templates.ts
  → Artifacts: [prompt-templates.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/utils/prompt-templates.ts) (HOOK_STRATEGY_GUIDANCE constant, getHookStrategyGuidance helper, updated buildPlannerPrompt and buildAssemblerPrompt)
- [X] T059 [P] [US5] [EXECUTOR: langgraph-specialist] Implement depth constraint handling (summary/detailed/comprehensive) in packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/expander.ts
  → Artifacts: [expander.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/expander.ts) (DEPTH_TOKEN_LIMITS, DEPTH_PROMPT_GUIDANCE constants, fixed model selection bug)
- [X] T060 [US5] [EXECUTOR: quality-validator-specialist] Implement prohibited_terms validation in content output in packages/course-gen-platform/src/stages/stage6-lesson-content/validators/content-validator.ts
  → Artifacts: [content-validator.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/validators/content-validator.ts) (calculateProhibitedTermsScore method, prohibitedTermsScore in criteriaScores)
- [X] T061 [US5] [EXECUTOR: quality-validator-specialist] Implement required_keywords validation in packages/course-gen-platform/src/stages/stage6-lesson-content/validators/content-validator.ts
  → Artifacts: [content-validator.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/validators/content-validator.ts) (enhanced calculateKeywordCoverage with per-section logging and missing keywords tracking)
- [X] T062 [US5] [EXECUTOR: rag-specialist] Pre-retrieve RAG context by rag_context_id for retries in packages/course-gen-platform/src/stages/stage6-lesson-content/utils/
  → Artifacts: [lesson-rag-retriever.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/utils/lesson-rag-retriever.ts) (preRetrieveSectionContexts, getCachedSectionContext, SectionContextPreRetrievalResult)

**Checkpoint**: User Story 5 complete - V2 Semantic Scaffolding features operational

---

## Phase 8: User Story 6 - Cost-Effective Model Selection (Priority: P3)

**Goal**: Automatic model selection based on document volume and content requirements

**Independent Test**: Process courses with varying document sizes, verify appropriate model selection

### Implementation for User Story 6

- [X] T063 [P] [US6] [EXECUTOR: llm-service-specialist] Implement model selection logic based on 80K threshold in packages/course-gen-platform/src/shared/llm/model-selector.ts
  → Artifacts: [model-selector.ts](packages/course-gen-platform/src/shared/llm/model-selector.ts) (DOCUMENT_SIZE_THRESHOLD, MODEL_TIERS, selectModelByDocumentSize, getModelTierInfo)
- [X] T064 [P] [US6] [EXECUTOR: llm-service-specialist] Create cost tracking service (tokens consumed, cost per stage) in packages/course-gen-platform/src/shared/metrics/cost-tracker.ts
  → Artifacts: [cost-tracker.ts](packages/course-gen-platform/src/shared/metrics/cost-tracker.ts), [index.ts](packages/course-gen-platform/src/shared/metrics/index.ts) (CostTracker class, MODEL_PRICING)
- [X] T065 [US6] [EXECUTOR: stage-pipeline-specialist] Integrate model selection into budget allocation in packages/course-gen-platform/src/stages/stage3-summarization/phases/budget-allocator.ts
  → Artifacts: [phase-adaptive-strategy.ts](packages/course-gen-platform/src/stages/stage3-summarization/phases/phase-adaptive-strategy.ts) (dynamic model selection, language routing, cost estimation)
- [X] T066 [US6] [EXECUTOR: stage-pipeline-specialist] Add cost metrics to LessonContentMetadata output in packages/course-gen-platform/src/stages/stage6-lesson-content/
  → Artifacts: [state.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/state.ts) (totalCostUsd, nodeCosts fields, NodeCost interface)
- [X] T067 [US6] [EXECUTOR: llm-service-specialist] Add cost alerting (log warning if cost > $0.50 per course) in packages/course-gen-platform/src/shared/metrics/
  → Artifacts: [cost-tracker.ts](packages/course-gen-platform/src/shared/metrics/cost-tracker.ts) (COST_ALERT_THRESHOLDS, checkCostAlerts, configureAlerts)

**Checkpoint**: User Story 6 complete - cost-effective model routing operational

---

## Phase 9: Concurrency & Observability

**Purpose**: Cross-cutting concerns for production readiness

### Concurrency Control (FR-037, FR-038)

- [X] T068 [P] [EXECUTOR: orchestration-logic-specialist] Create generation lock service (prevent concurrent generation) in packages/course-gen-platform/src/shared/locks/generation-lock.ts
  → Artifacts: [generation-lock.ts](packages/course-gen-platform/src/shared/locks/generation-lock.ts), [index.ts](packages/course-gen-platform/src/shared/locks/index.ts) (GenerationLockService, Redis-backed atomic locks)
- [X] T069 [EXECUTOR: orchestration-logic-specialist] Integrate lock checks into Stage 4, 5, 6 handlers in packages/course-gen-platform/src/stages/
  → Artifacts: [stage4/handler.ts](packages/course-gen-platform/src/stages/stage4-analysis/handler.ts), [stage5/handler.ts](packages/course-gen-platform/src/stages/stage5-generation/handler.ts), [stage6/handler.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/handler.ts) (try/finally lock pattern)
- [X] T070 [EXECUTOR: api-builder] Add tRPC procedure for checkGenerationLock in packages/course-gen-platform/src/server/routers/
  → Artifacts: [locks.ts](packages/course-gen-platform/src/server/routers/locks.ts), [app-router.ts](packages/course-gen-platform/src/server/app-router.ts) (isLocked, getLock, getAllLocks, forceRelease)

### RAG Context Lifecycle (FR-034, FR-035, FR-036)

- [X] T071 [EXECUTOR: rag-specialist] Implement RAG context deletion (immediately after course completion success OR via scheduled cleanup for course_completed_at + 1 hour) in packages/course-gen-platform/src/shared/rag/
  → Artifacts: [rag-cleanup.ts](packages/course-gen-platform/src/shared/rag/rag-cleanup.ts), [index.ts](packages/course-gen-platform/src/shared/rag/index.ts) (cleanupCourseRagContext, cleanupExpiredRagContexts)
- [X] T072 [EXECUTOR: rag-specialist] Create cleanup job for expired RAG context in packages/course-gen-platform/src/jobs/
  → Artifacts: [rag-cleanup-job.ts](packages/course-gen-platform/src/jobs/rag-cleanup-job.ts), [index.ts](packages/course-gen-platform/src/jobs/index.ts) (executeRagCleanupJob, startScheduledCleanup)

### Observability (FR-031, FR-032, FR-033)

- [X] T073 [P] [EXECUTOR: MAIN] Add structured logging helpers with course_id and stage identifiers in packages/course-gen-platform/src/shared/logging/
  → Artifacts: [structured-logger.ts](packages/course-gen-platform/src/shared/logging/structured-logger.ts), [index.ts](packages/course-gen-platform/src/shared/logging/index.ts) (StructuredLogger, createStageLogger, createLessonLogger)
- [X] T074 [P] [EXECUTOR: llm-service-specialist] Create metrics collection for tokens, cost, duration, quality in packages/course-gen-platform/src/shared/metrics/
  → Artifacts: [stage-metrics.ts](packages/course-gen-platform/src/shared/metrics/stage-metrics.ts) (StageMetricsCollector, formatDuration, calculateQualityScore)
- [X] T075 [EXECUTOR: api-builder] Add metrics endpoints for monitoring in packages/course-gen-platform/src/server/routers/
  → Artifacts: [metrics.ts](packages/course-gen-platform/src/server/routers/metrics.ts) (getCourseMetrics, getAggregatedMetrics, getStagePerformance, getCourseCost, getTotalCost)

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T076 [P] [EXECUTOR: bullmq-worker-specialist] Update worker.ts to handle Stage 6 job types in packages/course-gen-platform/src/orchestrator/worker.ts
  → Artifacts: [worker.ts](packages/course-gen-platform/src/orchestrator/worker.ts) (processStage6Job import, JobType.LESSON_CONTENT registration), [bullmq-jobs.ts](packages/shared-types/src/bullmq-jobs.ts) (LESSON_CONTENT enum, LessonContentJobDataSchema), [base-handler.ts](packages/course-gen-platform/src/orchestrator/handlers/base-handler.ts) (JOB_TYPE_TO_STEP entry)
- [X] T077 [P] [EXECUTOR: MAIN] Run type-check and fix any TypeScript errors across all stages
  → Artifacts: [planner.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/planner.ts), [assembler.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/assembler.ts), [smoother.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/smoother.ts) (fixed DEFAULT_*_MODEL constants)
- [X] T078 [P] [EXECUTOR: MAIN] Run build and verify no compilation errors
  → Note: Stage 6 build passes. Pre-existing DB type errors (job_status, system_metrics tables) require separate Supabase migration.
- [X] T079 [EXECUTOR: MAIN] Run quickstart.md validation (manual verification of code snippets)
  → Artifacts: [quickstart.md](specs/010-stages-456-pipeline/quickstart.md) (conceptual patterns verified against implementation)
- [X] T080 [EXECUTOR: MAIN] Update Stage 6 README.md with final architecture in packages/course-gen-platform/src/stages/stage6-lesson-content/README.md
  → Artifacts: [README.md](packages/course-gen-platform/src/stages/stage6-lesson-content/README.md) (added Job Registration, Generation Locks, Cost Tracking, Model Selection, Structured Logging)

**Checkpoint**: Phase 10 complete - all polish tasks done

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-8)**: All depend on Foundational phase completion
  - US1, US2, US3 are P1 priority - implement first
  - US4, US5 are P2 priority - implement after P1 stories
  - US6 is P3 priority - implement last
- **Phase 6.5 (LLM Judge)**: Depends on Phase 6 (US4) - integrates into Stage 6 orchestrator
- **Concurrency & Observability (Phase 9)**: Can run in parallel with Phase 8
- **Polish (Phase 10)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 3 (P1)**: Can start after Foundational - Uses RAG plan from US2 but can be tested independently
- **User Story 4 (P2)**: Depends on US3 (V2 LessonSpecifications) - Core Stage 6 implementation
- **Phase 6.5 (LLM Judge)**: Depends on US4 (Stage 6 core nodes must exist) - Integrates after Smoother
- **User Story 5 (P2)**: Depends on US4 (Stage 6 infrastructure) - V2 features integration
- **User Story 6 (P3)**: Can start after Foundational - Cost optimization layer

### Within Each User Story

- Types/schemas before implementation
- Core logic before validation
- Orchestrator integration after individual phases
- Logging as final step per story

### Parallel Opportunities

- All Foundational type definitions (T004-T009) can run in parallel
- All Foundational migrations (T010-T013) can run in parallel
- LLM parameters infrastructure (T014-T015) can run in parallel
- Stage 6 node implementations (T040-T043) can run in parallel
- Stage 6 utilities (T047-T050) can run in parallel
- Stage 6 validators (T051-T052) can run in parallel
- LLM Judge types (T081-T082) can run in parallel
- LLM Judge fix templates (T087) can run in parallel with core infrastructure

---

## Parallel Example: Foundational Types

```bash
# Launch all shared type definitions together:
Task: "Create DocumentPriority and BudgetAllocation types in packages/shared-types/src/document-prioritization.ts"
Task: "Create LessonSpecificationV2 schema with Semantic Scaffolding in packages/shared-types/src/lesson-specification-v2.ts"
Task: "Create LessonContent and RAGContextCache types in packages/shared-types/src/lesson-content.ts"
Task: "Enhance AnalysisResult with DocumentRelevanceMapping in packages/shared-types/src/analysis-result.ts"
Task: "Enhance BullMQ job types with Stage6Job in packages/shared-types/src/bullmq-jobs.ts"
```

## Parallel Example: Stage 6 Nodes

```bash
# Launch all LangGraph nodes together:
Task: "Create Planner node in packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/planner.ts"
Task: "Create Expander node in packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/expander.ts"
Task: "Create Assembler node in packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/assembler.ts"
Task: "Create Smoother node in packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/smoother.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1-3 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Document Prioritization)
4. Complete Phase 4: User Story 2 (RAG Planning)
5. Complete Phase 5: User Story 3 (V2 LessonSpecification)
6. **STOP and VALIDATE**: Test Stages 2-5 end-to-end
7. Deploy/demo if ready

### Full Feature Delivery

1. Complete MVP (US1-3)
2. Complete Phase 6: User Story 4 (Stage 6 core)
3. Complete Phase 6.5: LLM Judge (quality assurance for Stage 6)
4. Complete Phase 7: User Story 5 (Semantic Scaffolding features)
5. Complete Phase 8: User Story 6 (Cost optimization)
6. Complete Phase 9: Concurrency & Observability
7. Complete Phase 10: Polish

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 + User Story 4
   - Developer B: User Story 2 + User Story 5
   - Developer C: User Story 3 + User Story 6
3. Stories complete and integrate independently

---

## Summary

| Metric | Value |
|--------|-------|
| Total Tasks | 99 |
| Phase 0 (Planning) | 4 |
| Phase 1 (Setup) | 3 |
| Phase 2 (Foundational) | 12 |
| Phase 3 (US1 - Document Prioritization) | 8 |
| Phase 4 (US2 - RAG Planning) | 7 |
| Phase 5 (US3 - V2 LessonSpec) | 8 |
| Phase 6 (US4 - Stage 6 Core) | 19 |
| **Phase 6.5 (LLM Judge - Research-Based)** | **14** |
| Phase 7 (US5 - Semantic Scaffolding) | 5 |
| Phase 8 (US6 - Cost Optimization) | 5 |
| Phase 9 (Concurrency & Observability) | 8 |
| Phase 10 (Polish) | 5 |
| Phase 11 (Code Review Fixes) | 5 |
| Parallel Opportunities | 52+ tasks marked [P] |

**MVP Scope**: US1 + US2 + US3 (Phases 1-5) = 38 tasks
**Full Scope**: All user stories (Phases 1-11 + 6.5) = 99 tasks

---

## Phase 11: Code Review Fixes (Post-Implementation)

**Purpose**: Address issues identified during comprehensive code review

- [X] CR001 [EXECUTOR: bullmq-worker-specialist] Replace mock executeStage6 with real orchestrator import in packages/course-gen-platform/src/stages/stage6-lesson-content/handler.ts
  → Artifacts: [handler.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/handler.ts) (adapter function, type mapping Stage6JobInput → Stage6Input)
- [X] CR002 [EXECUTOR: api-builder] Implement cancelStage6 BullMQ job cancellation in packages/course-gen-platform/src/server/routers/stage6.ts
  → Artifacts: [stage6.ts](packages/course-gen-platform/src/server/routers/stage6.ts) (getQueue singleton, job removal, cancelledJobsCount return)
- [X] CR003 [EXECUTOR: typescript-types-specialist] Consolidate ARCHETYPE_TEMPERATURES to Single Source of Truth in packages/course-gen-platform/src/shared/llm/model-selector.ts
  → Artifacts: [model-selector.ts](packages/course-gen-platform/src/shared/llm/model-selector.ts) (re-export from @megacampus/shared-types)
- [X] CR004 [EXECUTOR: MAIN] Convert dynamic require() to static imports in packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-6-rag-planning.ts
  → Artifacts: [phase-6-rag-planning.ts](packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-6-rag-planning.ts) (ESM-compatible static imports)
- [X] CR005 [EXECUTOR: MAIN] Standardize logger imports to named export `{ logger }` across Stage 6
  → Artifacts: handler.ts, xss-sanitizer.ts, content-validator.ts, insufficient-context.ts, factual-verifier.ts, entropy-detector.ts (6 files fixed)

**Checkpoint**: Phase 11 complete - all code review issues resolved

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group using `/push patch`
- Quality gates: type-check + build must pass before commit
- XSS sanitization mandatory for all generated content (FR-024)
