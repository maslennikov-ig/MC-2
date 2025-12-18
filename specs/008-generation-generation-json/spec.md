# Feature Specification: Generation Phase - Course Structure JSON Generation

**Feature Branch**: `008-generation-generation-json`
**Created**: 2025-11-05
**Status**: Draft
**Input**: User description: "Develop the Generation phase that generates course JSON structure from Analyze stage results and client data, serving as both client interface and technical specification for lesson generation"

## Clarifications

### Session 2025-11-05

- Q: The system processes user-supplied content (course titles, learning outcomes, target audience descriptions) and passes it to LLMs. What is the expected behavior for potentially harmful or inappropriate user input? → A: DEFERRED - Future task created (`docs/FUTURE/CONTENT-SAFETY-MODERATION.md`) implementing OpenAI Moderation API pre-generation check with user dispute workflow and admin review queue. Not blocking for Stage 5 production deployment (low priority). To be implemented post-Stage 6.

- Q: Спецификация упоминает отслеживание качества (quality_scores) и стоимости (cost_usd) в метаданных генерации, но не описывает стратегию логирования и алертинга. Как должны обрабатываться критические ситуации в процессе генерации? → A: REUSE EXISTING - Следовать архитектуре Stage 4 (specs/007-stage-4-analyze/spec.md:441): Pino structured logging (реализовано в Stage 0), метрики в generation_metadata + system_metrics таблицах (БД структура готова), Sentry для ошибок (запланировано), админ-панель дашборд для real-time мониторинга (docs/ADMIN-PANEL-SPEC.md). Логировать: длительность генерации, использованные токены, выбранная модель, статус (success/fail), batch_count, retry_count, quality_scores, cost_usd. Критические события (токены >90%, качество <0.75, fallback на Gemini) записывать в system_metrics с severity=warn/error.

- Q: Спецификация описывает multi-model архитектуру (OSS 20B → OSS 120B → qwen3-max → Gemini fallback), но детали обработки сбоев OpenRouter API не полностью раскрыты. Какое поведение ожидается при недоступности моделей? → A: REUSE EXISTING - Следовать паттерну Stage 4 (specs/007-stage-4-analyze/spec.md:437, FR-013): 3 retry attempts с экспоненциальной задержкой (2^n секунд) для транзитных ошибок API (timeout, rate limit, service unavailable), отдельно от валидационных retry. После исчерпания попыток: отправить уведомление технической поддержке через админ-панель (направление на email/Slack/webhook), пометить job как failed с кодом LLM_ERROR и детальными метаданными. Retry логика НЕ применяется к валидационным ошибкам (invalid JSON, schema mismatch) - они обрабатываются отдельной логикой с более строгими промптами (FR-020).

- Q: Какое ожидается поведение при одновременной генерации нескольких курсов? → A: REUSE EXISTING - Следовать архитектуре Stage 0 (docs/IMPLEMENTATION_ROADMAP_EN.md:127, docs/REQUIREMENTS.md:324-361): BullMQ queue с concurrency limits по тарифам (TRIAL=5, FREE=1, BASIC=2, STANDARD=5, PREMIUM=10 одновременных генераций на пользователя). Redis-based atomic check-and-increment через Lua script (1h TTL). Внутри одной генерации: секции обрабатываются группами по 2 параллельно (PARALLEL_BATCH_SIZE=2), задержка 2 секунды между группами. Worker concurrency: 5 (Stage 0 - T042). Если лимит превышен: 429 Too Many Requests с русскоязычным сообщением "Превышен лимит одновременных генераций для вашего тарифа".

- Q: Какие максимальные ограничения размера курса следует применять? → A: ARCHITECTURE DECISION - НЕТ максимальных лимитов на количество уроков/секций ни по тарифам, ни технически (specs/007-stage-4-analyze/spec.md:240, docs/PRICING-TIERS.md:68 обновлено). **Per-batch архитектура** (SECTIONS_PER_BATCH = 1, FR-016) означает, что размер курса не влияет на токен-бюджет — каждый batch генерируется с независимым контекстным окном. 8 секций = 8 batches, 50 секций = 50 batches, 200 секций = 200 batches. Per-batch budget 120K tokens (SC-005) позволяет использовать OSS 20B/120B/Qwen3-max (128K context) для 95%+ batches. Zod-валидация допускает max 50 секций, max 25 уроков на секцию (docs/REQUIREMENTS.md:190-195), но это soft limits для схемы. При RAG-heavy scenarios (>40K context per batch): Gemini fallback (1M context) + логирование в system_metrics. Стоимость отслеживается, но не блокирует генерацию.

- Q: Как система должна разрешать конфликты между рекомендациями Analyze stage и пользовательскими параметрами (например, desired_lessons_count vs recommended_structure, или user difficulty vs AI-determined difficulty)? → A: ARCHITECTURE PRINCIPLE - **Analyze Stage is authoritative** (specs/008-generation-generation-json/spec.md:98,104). Frontend параметры — это guidance (рекомендации), НЕ constraints (ограничения), кроме явно обозначенных как constraints (learning_outcomes). Приоритет: (1) Pedagogical soundness from Analyze Phase 3, (2) Structural recommendations from Analyze Phase 2, (3) User guidance параметры (desired_*) как hints. Логировать deviation с rationale. **FUTURE**: Поле `difficulty` будет убрано из frontend полностью (docs/FUTURE/REMOVE-DIFFICULTY-FIELD-FROM-FRONTEND.md, post-Stage 5) — AI определяет difficulty автоматически в Analyze Phase 1, пользовательский ввод создаёт конфликты и менее точен. Style параметры (tone, language) применяются как linguistic guidance без противоречия педагогике.

- Q: Какие автоматические алерты и действия должны срабатывать при деградации качества генерации (например, частое использование Gemini fallback, низкие quality_scores, высокий retry_count)? → A: REUSE EXISTING - Следовать паттерну Stage 4 (specs/007-stage-4-analyze/spec.md:226-227,234,302,438): Логирование в `system_metrics` таблицу для админ-панели visualization + alerting. После исчерпания retry: отправить notification технической поддержке через админ-панель (routing на email/Slack/webhook). Alert conditions из Stage 4: частое использование Emergency model (>5 Gemini fallbacks/hour), низкие success rates (<80% per batch). Адаптивное поведение НЕ применяется (нет автоматического переключения 20B→120B без validation failure). Модельная селекция: OSS 20B по умолчанию (95%+ batches), OSS 120B только после validation failures (как в Analyze Phase 1-2), Gemini ТОЛЬКО при per-batch token overflow (>108K per batch, 90% от 120K budget). FR-017: Qwen3-max strategy определяется через research task ПОСЛЕ понимания Generation архитектуры — investigate minimal context scenarios, high-sensitivity parameters, quality-critical decision points.

- Q: Как определить, что lesson technical specifications (lesson_objectives, key_topics, estimated_duration_minutes) содержат достаточно деталей для Stage 6 (Lesson Generation), БЕЗ необходимости дожидаться Stage 6? → A: **HYBRID LAYERED VALIDATION** (industry best practice, see `docs/generation/LLM-VALIDATION-BEST-PRACTICES.md`). **Layer 1 - Type Validation** (Zod schema, FREE, instant): Length constraints (objectives 15-200 chars, topics 5-100 chars), count constraints (1-5 objectives, 2-10 topics), type safety. **Layer 2 - Rule-Based Structural Validation** (Zod `.refine()`, FREE, <1ms): (1) **Bloom's Taxonomy action verb requirement** - objectives MUST start with measurable action verbs (whitelist: ~100 verbs including "explain", "analyze", "design", "implement", etc. for EN+RU), compliance with Quality Matters educational standards, (2) Placeholder detection (reject: TODO, TBD, Example, XXX, FIXME), (3) Generic topic filtering (reject single-word topics like "Introduction", "Overview"), (4) Content requirements (objectives ≥4 words), (5) Duration proportionality (≥2.5 min per topic). **Layer 3 - Selective Semantic Validation** (Jina-v3 embeddings, ~$0.003-0.010 per course, OPTIONAL): Applied ONLY for high-risk scenarios (title-only generation, retry failures, premium tier) - validates objective relevance to course title via cosine similarity, detects overly generic objectives. Rationale: Layers 1-2 provide ~90% problem coverage with zero runtime cost, following Instructor library pattern (3M+ downloads). Layer 3 reserved for critical cases per production economics best practices. Self-healing retry mechanism (FR-020) uses validation errors as learning signal for LLM correction.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Minimal Input Course Generation (Priority: P1)

The system generates a complete course structure when given only a course title, demonstrating robustness and intelligent defaults.

**Why this priority**: This is the critical baseline - if the system cannot generate courses with minimal data, it cannot function in production. This represents the most challenging edge case and validates core generation capabilities.

**Independent Test**: Can be fully tested by creating a course with only a title field populated, then verifying that a complete, valid course structure JSON is generated with proper hierarchy (modules → lessons), reasonable content, and all required metadata fields.

**Acceptance Scenarios**:

1. **Given** a course with only title "Introduction to Machine Learning" (minimal user input), **When** Analyze stage generates analysis_result and Generation phase executes with that analysis_result, **Then** system generates complete course structure with 4-10 sections, 10+ lessons total, learning outcomes, and lesson-level technical specifications
2. **Given** a course title in Russian "Основы Python программирования" (minimal user input), **When** Analyze stage generates analysis_result and Generation phase executes with that analysis_result, **Then** system generates Russian-language course structure with culturally appropriate content and proper Cyrillic text handling
3. **Given** a minimal course input (title only) where Analyze stage produces analysis_result with basic metadata, **When** Generation phase executes with that analysis_result, **Then** system uses Analyze-provided pedagogical strategy, content recommendations, and course metadata to generate structure. Note: Generation never synthesizes defaults - it always receives guidance from Analyze

---

### User Story 2 - Rich Context Course Generation (Priority: P2)

The system leverages Analyze stage results, frontend parameters, and vectorized documents to create highly contextualized course structures aligned with user requirements.

**Why this priority**: While baseline generation is critical, most production courses will have rich context. This validates the system's ability to utilize all available data sources for optimal results.

**Independent Test**: Can be tested by providing full Analyze stage output (all 6 phases), complete frontend parameters (style, target audience, learning outcomes), and uploaded documents, then verifying the generated course structure reflects this context appropriately.

**Acceptance Scenarios**:

1. **Given** Analyze stage results indicating "professional certification" category and "advanced" difficulty, **When** Generation phase executes, **Then** course structure includes industry-relevant exercises, certification preparation content, and advanced pedagogical strategies
2. **Given** frontend style parameter "gamified" and desired_lessons_count of 25, **When** Generation phase executes, **Then** course structure incorporates gamification elements (challenges, progression), aims for ~25 lessons (±3), and includes style-specific language throughout
3. **Given** 3 uploaded PDF documents about corporate compliance policies, **When** Generation phase with vectorized context executes, **Then** course structure references specific policy details, includes document-based exercises, and aligns lesson content with uploaded materials
4. **Given** user-specified learning_outcomes "Ability to conduct security audits", **When** Generation phase executes, **Then** course structure includes practical audit exercises, assessment strategies aligned with outcomes, and lessons building toward audit competency

---

### User Story 3 - Multi-Model Orchestration Strategy (Priority: P3)

The system intelligently selects between OSS 20B (fast/cheap), OSS 120B (powerful), Qwen3-max (critical decisions), and Gemini (per-batch token overflow) models based on task complexity and per-batch token budget (120K).

**Why this priority**: While functional generation is possible with a single model, optimal cost-performance requires intelligent orchestration. This is a production optimization rather than core functionality.

**Independent Test**: Can be tested by monitoring model selection during generation (via logs/metrics), verifying OSS 20B handles routine batches, OSS 120B handles validation failures, Qwen3-max handles critical decision points (FR-017 research task), and Gemini triggers only when per-batch tokens exceed 108K (RAG-heavy scenarios).

**Acceptance Scenarios**:

1. **Given** standard course generation task with 6 sections, **When** Generation phase executes 6 batches (SECTIONS_PER_BATCH = 1), **Then** system uses OSS 20B for 95%+ of batches (per-batch <120K tokens), OSS 120B for validation failures, and logs model selection rationale per batch
2. **Given** generation task with minimal input data (title only) requiring critical assumptions, **When** Generation phase reaches metadata synthesis decision point, **Then** system invokes Qwen3-max for course category/structure decisions (FR-017 research task) and logs cost justification
3. **Given** a RAG-heavy batch with >40K document context, **When** per-batch token estimate exceeds 108K (90% of 120K budget), **Then** system switches to Gemini for that specific batch (1M context) and logs fallback trigger reason, subsequent batches revert to OSS models

---

### User Story 4 - Style Integration & Customization (Priority: P2)

The system applies one of 21 content styles (conversational, academic, professional, storytelling, etc.) consistently across course metadata, section descriptions, and lesson technical specifications.

**Why this priority**: Style consistency is a key differentiator for user experience and required for production quality. The infrastructure exists (from PHASE_STYLE_INTEGRATION.md), making this high-value, low-risk.

**Independent Test**: Can be tested by generating courses with different style parameters, then validating that generated text consistently matches the selected style's tone, structure, and linguistic patterns defined in style-prompts.ts.

**Acceptance Scenarios**:

1. **Given** course with style="academic", **When** Generation phase executes, **Then** course structure uses scholarly tone, formal language, includes citations/references, and lesson specs request research-oriented content
2. **Given** course with style="storytelling", **When** Generation phase executes, **Then** course structure incorporates narrative elements, character-driven examples, and lesson specs include story arcs
3. **Given** course with invalid style="nonexistent", **When** Generation phase executes, **Then** system defaults to "conversational" style, logs validation warning, and continues generation
4. **Given** course with no style parameter, **When** Generation phase executes, **Then** system applies default "conversational" style and generates user-friendly, dialogue-based content

---

### Edge Cases

- **What happens when Analyze stage results are missing or incomplete?** This scenario should not occur in normal operation - Generation is ALWAYS triggered after Analyze completes. If analysis_result is somehow null/missing (system error), Generation should FAIL with clear error message and NOT attempt to generate without Analyze guidance. The correct flow is: retry Analyze → then retry Generation. Log missing analysis_result as critical error requiring investigation.

- **What happens when per-batch token budget (120K total) is exceeded?** System should switch to Gemini model (1M context) for THAT BATCH ONLY when input tokens exceed 108K (90% threshold) OR total tokens exceed 115K (96% safety margin). Subsequent batches revert to OSS models. Track cost overruns and log fallback trigger with reason (RAG-heavy context, complex generation).

- **What happens when LLM returns invalid JSON structure?** System should attempt JSON repair (4 levels, proven pattern from previous implementation), validate against Zod schema, retry with stricter prompt (max 3 attempts), then fail with detailed error if unrecoverable.

- **What happens when desired_lessons_count (user preference) conflicts with Analyze phase recommendation?** System applies conflict resolution algorithm: (1) Compare user desired_X with Analyze recommended_Y, (2) IF deviation >20% AND pedagogical_strategy indicates specific structure needed THEN use Analyze recommendation, (3) ELSE use user guidance as target with ±3 tolerance, (4) Log deviation with rationale: "User desired X lessons, Analyze recommended Y, using Z because [pedagogical reason OR user preference within tolerance]". Analyze phase recommendations are AUTHORITATIVE for pedagogical structure (section count, difficulty progression), user preferences are GUIDANCE for targets (total lesson count, duration).

- **What happens when vectorized documents are in different language than course language?** System applies multilingual RAG strategy: (1) Query Qdrant with semantic search (language-agnostic via Jina-v3 multilingual embeddings), (2) For each retrieved chunk, detect language using simple heuristics (Cyrillic = Russian, Latin + common words = English, etc.), (3) IF chunk language matches course language OR chunk contains technical terms/code (language-neutral) THEN include in context, (4) IF chunk language differs AND is purely text THEN skip (cross-language noise), (5) Log language filtering decisions for debugging. Rationale: Technical content (code, diagrams, formulas) transcends language barriers, pure text content in wrong language adds noise.

- **What happens when generated course has fewer than 10 lessons (minimum requirement)?** System should validate total lesson count across all sections, retry generation with explicit "minimum 10 lessons" constraint if violated, fail generation if minimum still not met after retry.

- **What happens when style prompt integration produces content that contradicts pedagogical strategy?** System should prioritize pedagogical soundness from Analyze Phase 3, use style as tone/linguistic guidance only, and log conflicts for review.

## Requirements _(mandatory)_

### Functional Requirements

#### Input Data Handling

- **FR-001**: System MUST accept Analyze stage results (analysis_result JSONB) as primary input source, including all 6 phases: classification, scope, expert, synthesis, topic analysis, and content strategy
- **FR-002**: System MUST extract minimum required field (course title) from courses table, treating all other fields (language, style, target_audience, settings) as optional with documented defaults
- **FR-003**: System MUST handle minimal user input scenarios where Analyze stage receives only a course title. Note: Generation ALWAYS receives analysis_result from Analyze - there is NO title-only mode for Generation itself. Even with minimal user input (title only), the flow is: User Input (title) → Stage 4 Analyze (generates full analysis_result) → Stage 5 Generation (receives analysis_result)
- **FR-004**: System MUST retrieve document summaries from file_catalog table when vectorized=true, supporting RAG-enhanced generation with RAG context capped at 40K tokens per batch (validated in T003-R token budget analysis), dynamically adjusted to fit within per-batch input budget of ≤90K tokens
- **FR-005**: System MUST apply style parameter (21 available styles) from style-prompts.ts to all generated content, defaulting to "conversational" if missing or invalid
- **FR-006**: System MUST incorporate optional frontend parameters: desired_lessons_count (guidance), desired_modules_count (guidance), learning_outcomes (constraints), lesson_duration_minutes (target)

#### JSON Structure Generation

- **FR-007**: System MUST generate course_structure JSONB conforming to schema defined in REQUIREMENTS.md:3.1, including course metadata, sections array, lessons array, practical_exercises array, and generation_metadata
- **FR-008**: System MUST generate minimum 10 lessons total across all sections (FR-015 from REQUIREMENTS.md), enforcing this via validation and retry logic
- **FR-009**: System MUST assign sequential numbering to sections (1, 2, 3...) and lessons within sections (1, 2, 3... per section)
- **FR-010**: System MUST generate 3-5 practical exercises per lesson, with exercise_type from enumerated list: self_assessment, case_study, hands_on, discussion, quiz, simulation, reflection
- **FR-011**: System MUST populate lesson-level "technical specifications" - lesson_objectives, key_topics, estimated_duration_minutes - that serve as detailed prompts for subsequent lesson content generation
- **FR-012**: System MUST generate learning_outcomes (3-15 items) at course level and learning_objectives (1-5 items) at section level, ensuring alignment and pedagogical hierarchy

#### LLM Orchestration

- **FR-013**: System MUST implement multi-model orchestration: OSS 20B (default), OSS 120B (complex tasks), Qwen3-max (critical decisions), Gemini (per-batch token overflow fallback)
- **FR-014**: System MUST track token usage per batch (metadata generation, section batches) and enforce **120K total per-batch token budget (input + output combined)** for 128K context models (OSS 20B/120B/Qwen3-max). Recommended allocation: ≤90K input tokens + ≤30K output tokens per batch to stay within 120K total. See `.tmp/current/plans/.token-budget-allocation.md` (T003-R) for detailed budget breakdown and Gemini fallback triggers: input >108K (90% threshold) OR total >115K (96% safety margin). RAG context allocation (0-40K tokens per batch, dynamically adjusted per FR-004) fits within input budget. Per-batch architecture means course size does not impact token budget — each batch is independent.
- **FR-015**: System MUST calculate and track cost in USD for all LLM calls using OpenRouter pricing, storing total in generation_metadata.cost_usd
- **FR-016**: System MUST implement batch generation strategy for sections (SECTIONS_PER_BATCH = 1, fixed as per REQUIREMENTS.md:327) with PARALLEL_BATCH_SIZE = 2 to prevent truncation and ensure schema compliance, as proven in previous proof-of-concept. Each batch has independent context window.
- **FR-017**: System MUST define and document Qwen3-max (128K context, high-quality reasoning) invocation strategy through research task during implementation - investigate which generation steps are most critical based on: (1) minimal input context scenarios requiring knowledge expansion (title-only courses), (2) high-sensitivity parameters that must be correct (pedagogical structure, learning objectives alignment), (3) quality-critical decision points identified during development. Strategy to be determined after Generation architecture is understood, before production deployment. **Success criteria**: Strategy must achieve >10% quality improvement (Jina-v3 semantic similarity) for <50% cost increase on title-only courses, with measurable impact on SC-002 (80%+ quality threshold). Qwen3-max fits within per-batch budget (120K), suitable for complex reasoning without token overflow.

#### Validation & Quality

- **FR-018**: System MUST validate generated JSON against Zod schema before database commit, rejecting incomplete or malformed structures
- **FR-019**: System MUST implement JSON repair logic (4 levels: brace counting, quote fixing, trailing comma removal, comment stripping) when LLM returns invalid JSON
- **FR-020**: System MUST retry failed generations maximum 3 times with progressively stricter prompts: (1) standard, (2) explicit schema requirements, (3) minimal examples
- **FR-021**: System MUST calculate quality scores using semantic similarity validation (Jina-v3 embeddings, cosine similarity) between input requirements and generated content, storing in generation_metadata.quality_scores
- **FR-022**: System MUST enforce MINIMUM field length constraints per schema: course_title (≥10 chars), lesson_title (≥5 chars), section_description (≥20 chars), lesson_objectives (≥15 chars each), key_topics (≥5 chars each), etc. MAXIMUM lengths increased 3-5x for flexibility: course_title (≤1000 chars), lesson_title (≤500 chars), section_description (≤2000 chars). Enforcement occurs at TWO points: (1) Zod schema validation (runtime rejection of invalid structures), (2) LLM prompt guidance (explicit minimum length requirements in generation prompts to reduce validation failures)

#### Data Persistence & State

- **FR-023**: System MUST store generated course_structure JSONB in courses.course_structure column atomically (all-or-nothing commit)
- **FR-024**: System MUST update courses.status to "content_generated" on successful generation, "generation_failed" on unrecoverable errors
- **FR-025**: System MUST persist generation_metadata including: model_used, total_tokens, cost_usd, duration_ms, quality_scores, batch_count, retry_count, created_at timestamp
- **FR-026**: System MUST support incremental section regeneration workflow via API endpoint `generation.regenerateSection(courseId, sectionNumber)`. Implementation: (1) Read current course_structure JSONB, (2) Remove target section from sections array, (3) Generate NEW section using SectionBatchGenerator, (4) Insert new section at sectionNumber position, (5) Recalculate sequential lesson_number for ALL lessons across ALL sections (global numbering), (6) Update course_structure via atomic JSONB UPDATE using jsonb_set(). Preserves all other sections unchanged. Essential for production editing workflow.

#### Style & Localization

- **FR-027**: System MUST generate all course content (titles, descriptions, objectives) in target language specified by courses.language field, supporting multilingual course creation
- **FR-028**: System MUST apply style-specific prompts from STYLE_PROMPTS map to guide LLM tone, structure, and linguistic patterns throughout generation
- **FR-029**: System MUST validate style parameter against 21 allowed values, logging warning and defaulting to "conversational" for invalid inputs
- **FR-030**: System MUST integrate style guidance into lesson technical specifications so subsequent lesson generation maintains consistent tone

### Key Entities

**Terminology Note**: Throughout this document, terms are used with specific meanings:
- **Prose (human-readable)**: "Analyze stage results", "course structure" (lowercase, natural language variation)
- **Database columns**: `analysis_result`, `course_structure` (snake_case JSONB columns in courses table)
- **TypeScript types**: `AnalysisResult`, `CourseStructure` (PascalCase types from shared-types)
- **Zod schemas**: `AnalysisResultSchema`, `CourseStructureSchema` (PascalCase validation schemas)

---

- **Course Structure (Output)**: Complete hierarchical JSON containing course metadata (title, description, outcomes, prerequisites), sections array (numbered, titled, with objectives), lessons array (nested in sections, with technical specs), practical exercises (nested in lessons, typed), and generation metadata (cost tracking, quality scores). **Technical reference**: `courses.course_structure` JSONB column, `CourseStructure` TypeScript type.

- **Analyze Results (Input)**: Six-phase analysis output from Stage 4 containing: classification (category, difficulty, contextual language), scope analysis (recommended structure, lesson breakdown), expert analysis (pedagogical strategy, research flags), synthesis (final scope instructions), topic analysis (determined topic, key concepts), content strategy (expand vs create from scratch). **Technical reference**: `courses.analysis_result` JSONB column (nullable), `AnalysisResult` TypeScript type.

- **Frontend Parameters (Input)**: Optional user preferences including style (21 types), target_audience (free text), desired_lessons_count (guidance), desired_modules_count (guidance), learning_outcomes (user expectations), lesson_duration_minutes (target per lesson)

- **Generation Metadata**: Telemetry data tracking model selection per batch (OSS 20B/120B, Qwen3-max, Gemini), token consumption per batch (input + output ≤ 120K budget), total pipeline cost (USD), quality scores (semantic similarity), batch processing (count = sections count, size = SECTIONS_PER_BATCH = 1), retry attempts per batch, duration per batch and total, timestamp

- **Style Configuration**: Mapping of 21 style types to comprehensive prompt descriptions defining tone, structure, linguistic patterns (academic, conversational, practical, storytelling, gamified, socratic, problem-based, etc.)

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: System generates valid course structure JSON for 95%+ of courses with Analyze results, as measured by Zod schema validation pass rate and database commit success
- **SC-002**: System generates valid course structure JSON for 80%+ of minimal-input courses (where Analyze received only title and produced basic analysis_result), demonstrating robust handling of sparse Analyze output. Note: This measures Generation's ability to work with minimal Analyze results, NOT Generation working without Analyze
- **SC-003**: Course structure generation completes within 150 seconds for standard courses (8 sections, 20-30 lessons), measured from job start to database commit. Metadata generation timing varies by model: OSS 20B (~5-8s), OSS 120B (~8-12s), qwen3-max (~15-25s due to 2-3x slower latency per research.md). Total pipeline target: <150s regardless of metadata model choice.
- **SC-004**: Generated courses meet minimum quality threshold of 0.75 semantic similarity score (Jina-v3 cosine) between input requirements and generated content
- **SC-005**: System stays within 120K per-batch token budget for 95%+ of batches using OSS 20B/120B/Qwen3-max models (128K context window), with remaining 5% triggering Gemini fallback for RAG-heavy scenarios (>40K context per batch)
- **SC-006**: 100% of generated courses contain minimum 10 lessons (FR-015 enforcement), validated across all sections
- **SC-007**: Generated lesson technical specifications provide sufficient detail for subsequent lesson generation (validated by successful Stage 6 execution in future)
- **SC-008**: System correctly applies selected style (manual validation via sampling, no automated measurement required — trust LLM to follow style prompts from style-prompts.ts)
- **SC-009**: JSON repair logic successfully recovers from LLM formatting errors in 85%+ of malformed responses, reducing total generation failures
- **SC-010**: Cost per course generation averages between $0.15 and $0.40 USD (matching previous proof-of-concept baseline) with multi-model optimization, tracked via generation_metadata.cost_usd

## Assumptions

1. **Analyze Stage Integration**: Assume Stage 4 (Analyze) is fully operational and reliably produces analysis_result JSONB with all 6 phases populated. Generation ALWAYS requires analysis_result - if missing, Generation must fail with error (not degrade to title-only mode). The correct flow is always: User Input → Analyze → Generation.

2. **LangChain/LangGraph Foundation**: Assume LangChain + LangGraph orchestration framework from Stage 4 is reusable for Generation phase, leveraging proven multi-model architecture and structured output patterns.

3. **Style Prompt Availability**: Assume style-prompts.ts file exists or will be created during implementation, porting 21 style definitions from workflows n8n/style.js to TypeScript format.

4. **Vector Database Access**: Assume Qdrant vector database with Jina-v3 embeddings is operational for RAG-enhanced generation when documents are uploaded. If vector search fails, generation continues without RAG context (degraded mode).

5. **Token Budget Enforcement**: Assume OpenRouter tracks token usage accurately and 200K token limit per generation job is sufficient for 90%+ of courses. Gemini model (no token limit) is available for overflow scenarios.

6. **Batch Processing Stability**: Assume batch generation strategy (1-2 sections per LLM call) from previous proof-of-concept is more reliable than single-call full generation, based on proof-of-concept experience with truncation issues.

7. **Zod Schema Validation**: Assume Zod validation library is integrated into project for runtime JSON schema enforcement, catching generation errors before database commit.

8. **Lesson Generation Compatibility**: Assume generated lesson technical specifications (lesson_objectives, key_topics) provide sufficient detail for Stage 6 (Lesson Generation) to produce quality content without requiring additional context retrieval.

9. **Multilingual Support**: Assume LLM models (OSS 20B/120B, qwen3-max, Gemini) support target languages from courses.language field, particularly Russian (primary user base) and English.

10. **qwen3-max Model Access**: Confirmed access to qwen/qwen3-max via OpenRouter API with sufficient rate limits for production use. Model available for critical decision points identified during implementation (see FR-017 research task).

11. **Metadata vs Sections Generation**: Assume two-phase generation (metadata first, then sections in batches) is more reliable than single-pass full generation, based on previous workflow analysis showing separate metadata generation step.

12. **Exercise Type Taxonomy**: Assume 7 exercise types (self_assessment, case_study, hands_on, discussion, quiz, simulation, reflection) cover sufficient pedagogical scenarios. This list is extensible without breaking changes.

## Research Tasks _(to be completed during implementation)_

### RT-001: qwen3-max Invocation Strategy

**Priority**: High (blocking production deployment)
**Timing**: After Generation architecture implementation, before production release
**Owner**: Implementation team

**Objective**: Determine optimal trigger points for qwen3-max model invocation to balance quality and cost.

**Investigation Areas**:

1. **Minimal Context Scenarios**
   - Analyze generation quality when input is title-only vs. full Analyze results
   - Measure quality degradation (semantic similarity scores) for minimal input
   - Hypothesis: qwen3-max's extensive knowledge base can compensate for missing context
   - Test: Generate 10 title-only courses with OSS 120B, then with qwen3-max, compare quality scores

2. **High-Sensitivity Parameters**
   - Identify which generated fields most impact downstream lesson generation quality
   - Candidates: learning_outcomes (drives course direction), pedagogical_strategy (affects teaching approach), section structure (affects content flow)
   - Measure: Track Stage 6 lesson generation success rate correlated with Generation phase quality by parameter
   - Test: Generate courses with different model assignments per parameter, measure downstream impact

3. **Quality-Critical Decision Points**
   - Map Generation workflow to identify decision branches where errors are costly
   - Examples: choosing course category when ambiguous, resolving conflicts between user preferences and pedagogical best practices, determining appropriate difficulty progression
   - Test: Introduce edge cases (contradictory user input, ambiguous topics), measure error recovery with OSS 120B vs. qwen3-max

**Deliverables**:

1. **Strategy Document**: `docs/generation/qwen3-max-strategy.md` containing:
   - List of specific trigger conditions for qwen3-max invocation
   - Cost-benefit analysis (quality improvement vs. cost increase)
   - Fallback strategy if qwen3-max unavailable
   - Monitoring metrics to validate strategy in production

2. **Implementation Update**: Code changes to FR-017 with concrete model selection logic

3. **Test Suite**: Integration tests validating qwen3-max is invoked at documented trigger points

**Success Criteria**:
- Strategy achieves 95%+ quality score (Jina-v3 similarity) on title-only courses
- Cost increase is justified by measurable quality improvement (>10% quality gain for <50% cost increase)
- Decision logic is deterministic and testable

**Estimated Effort**: 1-2 days (40 test generations, analysis, documentation)
