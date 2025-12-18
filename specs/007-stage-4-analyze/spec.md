# Feature Specification: Stage 4 - Course Content Analysis and Generation Prompt Creation

**Spec Directory**: `specs/007-stage-4-analyze`
**Feature Branch**: `007-stage-4-analyze`
**Created**: 2025-10-31
**Status**: Draft
**Input**: Stage 4 (Analyze) processes all available course materials (from minimal user input to comprehensive documents) and generates a clear, structured English-language prompt for the Generation stage (Stage 5). The output must consolidate user requirements, document summaries, and LLM knowledge into actionable generation requirements, regardless of input language or volume.

## User Scenarios & Testing

### User Story 1 - Minimal Input Course Creation (Priority: P1)

A course creator provides only a basic topic ("I want a course on fishing") without any supporting documents.

**Why this priority**: This is the core use case requiring the system to leverage its own knowledge base to generate a comprehensive course analysis prompt.

**Independent Test**: Create a course with only a topic field populated. System should generate a complete analysis prompt in English with scope, structure recommendations, and pedagogical approach.

**Acceptance Scenarios**:

1. **Given** user provides only topic "fishing basics" and selects "English" as target language, **When** Stage 4 analysis runs, **Then** system generates comprehensive English prompt with estimated scope (10-30 hours), key concepts (equipment, techniques, safety), structure recommendations, and validates total_lessons ≥ 10
2. **Given** topic in English "fishing basics" but user selects "Russian" as target language, **When** Stage 4 runs, **Then** analysis output is in English (internal processing) but specifies Russian as target language for Stage 5 course generation
3. **Given** minimal topic without specific audience, **When** analysis runs, **Then** system infers appropriate target audience (beginner/intermediate/advanced) and difficulty level
4. **Given** topic is too narrow (e.g., "single Git command"), **When** Stage 4 estimates <10 lessons, **Then** job fails with validation error: "Insufficient scope for minimum 10 lessons (estimated: 3). Please expand topic or provide additional requirements."

---

### User Story 2 - Document-Rich Course Creation (Priority: P2)

A course creator uploads multiple documents (PDFs, presentations, legal texts) with detailed material, potentially in mixed languages.

**Why this priority**: Real-world enterprise training often involves existing materials that need to be transformed into courses.

**Independent Test**: Upload 3-5 documents with comprehensive content. System should analyze all documents, generate summaries (from Stage 3), and create a synthesis prompt that references key document content.

**Acceptance Scenarios**:

1. **Given** user uploads 5 PDFs with legal regulations (Постановление 1875), **When** Stage 4 analyzes, **Then** prompt includes document synthesis, identifies critical concepts requiring research, and structures course around regulatory compliance
2. **Given** documents contain time-sensitive information (laws, regulations), **When** analysis runs, **Then** system flags content requiring internet research with marker: `[RESEARCH_REQUIRED: legal_updates]`
3. **Given** 3 documents completed summarization, but 2 documents have `processing_status = 'failed'`, **When** Stage 4 starts, **Then** pre-flight check fails job with error: "Document processing incomplete. 2 documents failed summarization in Stage 3. Please retry document processing before analysis."
4. **Given** all documents have `processing_status = 'completed'` and valid `processed_content`, **When** Stage 4 processes, **Then** output prompt includes all document summaries and balances available material with model knowledge to fill gaps

---

### User Story 3 - Detailed Requirements Course Creation (Priority: P2)

A course creator provides extensive user requirements via the answers field, specifying learning outcomes, structure preferences, and special requirements.

**Why this priority**: Professional course creators need control over pedagogical approach and structure.

**Independent Test**: Provide detailed answers field with specific modules, lesson requirements, and case studies. System should honor these requirements while adding value through analysis.

**Acceptance Scenarios**:

1. **Given** user specifies required modules and judicial case studies, **When** Stage 4 analyzes, **Then** prompt includes all specified requirements plus recommended supplementary content
2. **Given** user requests specific pedagogical approach (hands-on vs theory-first), **When** analysis runs, **Then** prompt encodes this approach for Stage 5 generation
3. **Given** conflicting requirements (too much content for estimated duration), **When** Stage 4 processes, **Then** system flags scope mismatch and suggests prioritization

---

### User Story 4 - Research Flag for Time-Sensitive Content (Priority: P3)

System identifies content requiring up-to-date information and flags for future research capability.

**Why this priority**: Sets foundation for future web search integration without blocking current implementation.

**Independent Test**: Analyze course on recent legal regulations. System should identify temporal sensitivity and add research flags.

**Acceptance Scenarios**:

1. **Given** course involves legal compliance (e.g., procurement law), **When** Stage 4 analyzes, **Then** prompt includes `[RESEARCH_REQUIRED: regulation_updates]` marker
2. **Given** course topic has fast-changing best practices (React Hooks), **When** analysis runs, **Then** system notes research needed but proceeds with current knowledge
3. **Given** research flag present, **When** passed to Stage 5, **Then** Generation stage acknowledges limitation and uses best available information

---

### Edge Cases

- What happens when user selects unsupported target language (e.g., Chinese, Arabic) on frontend?
  - **Expected**: Frontend should only offer supported languages (Russian, English, etc.). If somehow unsupported language reaches backend, Stage 4 fails with clear error: "Unsupported target language: {language}. Supported languages: ru, en."

- How does system handle extremely narrow topics (e.g., "a single Git command")?
  - **Expected**: System analyzes estimated lesson count. If <10 lessons, job fails with error: "Insufficient scope for minimum 10 lessons. Please expand topic or provide additional requirements." User must refine input before retrying.

- What if uploaded documents contradict user-specified requirements?
  - **Expected**: System prioritizes user requirements, notes discrepancies in analysis output

- How does Stage 4 handle documents that failed summarization in Stage 3?
  - **Expected**: Pre-flight check queries `file_catalog` for all course documents. If ANY document has `processing_status = 'failed'`, job fails immediately with error: "Document processing incomplete. {count} documents failed summarization in Stage 3. Please retry document processing before analysis." User must re-run Stage 3 for failed documents before Stage 4 can proceed.

- What if model knowledge is outdated for time-sensitive topic?
  - **Expected**: Research flag added, system proceeds with caveat in prompt

## Terminology

**Canonical Terms** (used consistently throughout implementation):

- **research_flags** (technical layer): Field name in code, API responses, database schema, TypeScript types
  - Type: `Array<{ topic: string; reason: string }>`
  - Example: `research_flags: [{ topic: "procurement_law", reason: "regulation_updates" }]`

- **[RESEARCH_REQUIRED: reason]** (user-facing layer): Format used in LLM prompts, user messages, admin panel, logs
  - Example in prompt: `[RESEARCH_REQUIRED: regulation_updates]`
  - Example in log: `"Analysis flagged 2 topics for research: [RESEARCH_REQUIRED: legal_updates], [RESEARCH_REQUIRED: technology_trends]"`

**Rationale**: Follows industry best practices for separation of technical naming (concise identifiers) and user-facing messaging (descriptive formats). Similar to HTTP status codes (404) vs user messages ("Not Found").

---

## Design Principles

**Core Philosophy**: These principles guide all implementation decisions for Stage 4 Analysis.

### 1. Quality Over Speed

**Principle**: Always prioritize analysis depth and accuracy over processing speed.

**Rationale**:
- Analysis errors cascade downstream to Stages 5-7 (structure generation, enhancement, finalization)
- A poor course structure cannot be fixed with good content - foundation matters most
- Users are willing to wait 5-10 minutes for high-quality analysis
- Re-generating a course due to poor analysis wastes more time than initial thorough analysis

**Implementation**:
- Use powerful LLM models (Tier 2/3) when needed, even if slower
- Perform comprehensive document synthesis, not superficial skimming
- Run full validation checks, don't skip quality gates for speed
- Timeouts (10 minutes) are technical limits, not performance targets

**Trade-offs Rejected**:
- ❌ Shallow analysis to meet <60s target
- ❌ Skipping research flag detection to save LLM tokens
- ❌ Using cheap/fast models when quality suffers

### 2. Data Integrity is Non-Negotiable

**Principle**: Never proceed with partial or corrupted data.

**Rationale**:
- Stage 4 barrier enforcement (FR-016) ensures 100% document processing before analysis
- Failing fast on incomplete data prevents garbage-in-garbage-out scenarios
- Better to fail early with clear error than generate low-quality course

**Implementation**:
- Pre-flight check validates ALL documents have `processing_status = 'completed'`
- Job fails immediately if ANY document missing `processed_content`
- No fallback to raw document content (maintains strict pipeline integrity)

### 3. Multi-Stage Analysis Over Large Context Windows

**Principle**: Break analysis into sequential phases rather than cramming everything into one giant prompt.

**Rationale**:
- Easier to debug when failure occurs in specific phase
- Reduces token costs (smaller prompts = cheaper models work)
- Improves quality (focused prompts produce better results than kitchen-sink prompts)
- Emergency model (Gemini 2.5 Flash) should be <1% usage, not default

**Implementation**:
- Phase 1: Language detection + categorization (small prompt)
- Phase 2: Topic analysis + scope estimation (medium prompt with document summaries)
- Phase 3: Pedagogical strategy + structure recommendations (focused prompt)
- Each phase validates before proceeding to next

### 4. Fail Loudly, Recover Gracefully

**Principle**: Errors should be immediately visible with clear recovery paths.

**Rationale**:
- Users prefer clear "Analysis failed: missing documents" over silent degradation
- Support team needs detailed error context for troubleshooting
- Retry mechanisms only work if error source is identified

**Implementation**:
- Descriptive error messages with root cause (FR-013, FR-015, FR-016)
- Retry logic with adaptive prompts (different approach per attempt)
- Notifications to technical support after exhausting retries
- User-facing error UI with actionable next steps (see FUTURE/FRONTEND-UX-ENHANCEMENTS.md)

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST accept course data with varying levels of input completeness:
  - Minimal: topic only
  - Moderate: topic + user requirements (answers field)
  - Comprehensive: topic + requirements + document summaries

- **FR-002**: System MUST generate analysis output in English regardless of input language (internal processing language)

- **FR-003**: System MUST use explicitly specified target language from `courses.language` field (user-selected on frontend during course creation)
  - Language is NOT auto-detected - user explicitly chooses target language in UI
  - Input materials (topic, answers, documents) can be in any language - system processes them but generates course in specified target language
  - Example: User selects "Russian" → Stage 5 generates Russian course, even if topic/documents are in English

- **FR-004**: System MUST pass target language to Stage 5 generation prompt to ensure final course is generated in correct language

- **FR-005**: System MUST synthesize multiple information sources:
  - User-provided topic and requirements
  - Document summaries from Stage 3 (if available)
  - LLM world knowledge for gaps

- **FR-006**: System MUST estimate content scope in hours and calculate total lessons based on lesson_duration_minutes

- **FR-007**: System MUST identify time-sensitive content and mark with `[RESEARCH_REQUIRED: <reason>]` flags

- **FR-008**: System MUST structure output as comprehensive prompt for Stage 5 with:
  - Topic analysis and key concepts
  - Recommended course structure (sections/modules)
  - Pedagogical strategy aligned with adult learning (andragogy)
  - Scope instructions (100-800 chars)
  - Content strategy (create_from_scratch | expand_and_enhance | optimize_existing)

- **FR-009**: System MUST avoid unnecessary research flags - use only for critical cases (laws, regulations, fast-changing tech)

- **FR-010**: System MUST handle Stage 3 barrier enforcement (100% document processing completion before Stage 4)

- **FR-011**: System MUST support retry logic with adaptive prompts if LLM output validation fails

- **FR-012**: System MUST categorize course type (professional | personal | creative | hobby | spiritual | academic) for contextual language adaptation

- **FR-013**: System MUST handle OpenRouter API failures (timeout, rate limit, service unavailable) with:
  - 3 retry attempts with exponential backoff (separate from validation retries in FR-011)
  - After exhausting retries, send notification to technical support via admin panel
  - Admin panel routes notifications to configured channels (email, Slack, webhook, etc.)
  - Job marked as failed with detailed error metadata for manual intervention

- **FR-014**: System MUST log extended observability metrics for each analysis job:
  - **Basic metrics**: Analysis duration (ms), total tokens used (input + output), LLM model ID, job status (success/failed/timeout)
  - **Extended metrics**: Target language (from courses.language), research flags count, course category classification, document coverage percentage, input material languages (for debugging only, does not affect generation)
  - **Metadata**: Retry attempts count, fallback model usage, validation errors (if any)
  - Metrics stored in `system_metrics` table for admin panel visualization and alerting

- **FR-015**: System MUST validate minimum course size constraint:
  - After generating recommended structure, calculate estimated lesson count
  - If `total_lessons < 10`, fail job with validation error (no retries)
  - Error message: "Insufficient scope for minimum 10 lessons (estimated: {count}). Please expand topic or provide additional requirements."
  - No maximum lesson limit enforced (courses can have unlimited lessons)

- **FR-016**: System MUST validate document processing completeness before analysis:
  - Query `file_catalog` table for course documents before starting analysis
  - Check all documents have `processing_status = 'completed'` AND `processed_content` is NOT NULL
  - If ANY document has `processing_status = 'failed'` OR missing `processed_content`, fail job immediately
  - Error message: "Document processing incomplete. {count} documents failed summarization in Stage 3. Please retry document processing before analysis."
  - Do NOT attempt to use raw document content as fallback - maintain strict data integrity
  - This check happens BEFORE Stage 4 barrier RPC validation (pre-flight check)

- **FR-017**: System MUST implement multi-phase multi-model orchestration strategy:

  **Architecture Philosophy**: Different analysis tasks require different model capabilities. Use appropriate model for each phase from the start, rather than escalation-based approach.

  **Phase-Based Model Assignment**:

  - **Phase 1 - Basic Classification** (Default Model: `openai/gpt-oss-20b`)
    - Tasks: Course category detection, target audience inference, basic topic parsing
    - Complexity: Low - simple classification, pattern matching
    - Why 20B: Fast, cheap, sufficient for straightforward categorization
    - Fallback: If validation fails after 2 attempts → retry with 120B

  - **Phase 2 - Scope Analysis** (Default Model: `openai/gpt-oss-20b`)
    - Tasks: Lesson count estimation, content hours calculation, module breakdown
    - Complexity: Low-Medium - numeric estimation, structure planning
    - Why 20B: Scope calculation is mostly mathematical/logical, doesn't require deep expertise
    - Fallback: If validation fails after 2 attempts → retry with 120B

  - **Phase 3 - Deep Expert Analysis** (Default Model: `openai/gpt-oss-120b` - **ALWAYS**)
    - Tasks: Research flag detection, pedagogical strategy, content expansion areas, contextual language
    - Complexity: High - requires nuance, domain expertise, creativity
    - Why 120B: **No compromise on quality** for critical decisions:
      - Research flags need subtle understanding of time-sensitivity
      - Pedagogical strategy requires teaching expertise
      - Expansion areas need creative insight
    - Fallback: If validation fails after 2 attempts → Emergency model (Gemini 2.5 Flash)
    - **Rationale**: These outputs directly impact course quality; false negatives/positives here cascade downstream

  - **Phase 4 - Document Synthesis** (Adaptive Model Selection)
    - If document_count < 3: Use 20B (simple synthesis)
    - If document_count ≥ 3: Use 120B (complex multi-source synthesis)
    - Complexity: Variable - depends on document quantity and diversity
    - Fallback: If validation fails after 2 attempts → escalate to next tier

  - **Emergency Model** (`google/gemini-2.5-flash`):
    - Used ONLY when context window exceeded or Phase 3 fails on 120B
    - Should trigger <1% of analyses

  **Configuration & Overrides**:
  - Global defaults stored in `llm_model_config` table with per-phase model specification
  - Per-course override via `courses.llm_model_override` (applies to ALL phases for that course)
  - Admin panel allows configuration of default model per phase (SuperAdmin only)

  **Retry Logic**:
  - Cheap phases (1, 2, 4): 2 attempts on primary → escalate to 120B
  - Expensive phase (3): 2 attempts on 120B → escalate to Emergency model
  - If Emergency model fails: Fail job with detailed error

  **Metrics Tracking**:
  - Log model usage per phase (phase_1_model, phase_2_model, phase_3_model, phase_4_model)
  - Track success rates per phase per model
  - Track cost per phase (for ROI analysis)
  - Alert if Phase 3 frequently requires Emergency model (indicates 120B insufficient)

- **FR-018**: System MUST provide real-time progress updates during analysis (30s - 10min window):
  - Display multi-stage progress on Course Management Page (dedicated page, not modal)
  - Show current processing stage with descriptive text matching internal phases:
    - **Phase 0**: "Проверка документов..." (Pre-flight validation: barrier check, document completeness) [0-10%]
    - **Phase 1**: "Базовая категоризация курса..." (Basic classification: category, audience, topic parsing) [10-25%]
    - **Phase 2**: "Оценка объема и структуры..." (Scope analysis: lesson count, hours, module breakdown) [25-45%]
    - **Phase 3**: "Глубокий экспертный анализ..." (Deep expert analysis: research flags, pedagogy, expansion areas) [45-75%]
    - **Phase 4**: "Синтез документов..." (Document synthesis: multi-source integration) [75-90%]
    - **Phase 5**: "Финализация анализа..." (Final assembly: validation, quality checks) [90-100%]
  - Update progress via WebSocket (preferred) or polling (fallback, 5s interval)
  - Each phase reports sub-progress within its range
  - Support for fully automatic mode only (semi-automatic mode deferred to future, see `FUTURE/SEMI-AUTOMATIC-COURSE-CREATION-MODE.md`)
  - Maximum timeout: 10 minutes (600 seconds) before job marked as failed
  - Frontend implementation: Course Management Page serves as progress dashboard for all creation stages (Stages 4-7)

### Key Entities

- **Analysis Input**:
  - `course_id`: Unique identifier
  - `topic`: User-provided topic (any language)
  - `language`: Target language for final course
  - `style`: Pedagogical style (professional, academic, conversational, etc.)
  - `answers`: Optional detailed requirements from user
  - `target_audience`: Beginner, intermediate, advanced, mixed
  - `difficulty`: Course difficulty level
  - `lesson_duration_minutes`: Duration per lesson (3-45 minutes)
  - `document_summaries`: Array of summaries from Stage 3 (optional)

- **Analysis Output** (for Stage 5):
  - `course_category`: Primary/secondary classification with confidence
  - `contextual_language`: Category-specific motivational language
  - `topic_analysis`: Topic completeness, complexity, key concepts, domain keywords
  - `recommended_structure`: Estimated hours, lesson count, sections breakdown
  - `pedagogical_strategy`: Teaching style, assessment approach, progression logic
  - `scope_instructions`: Generation prompt (100-800 chars)
  - `content_strategy`: How to approach generation
  - `expansion_areas`: Optional areas requiring more detail (with priorities)
  - `research_flags`: Array of time-sensitive topics requiring web search (future). Type: `Array<{ topic: string; reason: string }>`. Rendered as `[RESEARCH_REQUIRED: <reason>]` in user-facing prompts.

## Success Criteria

### Measurable Outcomes

- **SC-001**: System successfully generates analysis prompts for 95%+ of courses with minimal input (topic only), excluding courses that fail minimum 10-lesson constraint

- **SC-002**: Analysis output is in English regardless of input language, with 100% consistency

- **SC-003**: Generated prompts enable Stage 5 to create course structures with 85%+ user satisfaction (based on acceptance rate)

- **SC-004**: System correctly identifies time-sensitive content and adds research flags in <5% of courses (avoiding over-flagging)

- **SC-005**: Analysis completes within 10 minutes maximum (technical timeout limit) regardless of complexity. Target times are indicative only: 30-60s for minimal input, 2-5 minutes for document-rich courses, up to 10 minutes for highly complex multi-document courses. **Quality takes precedence over speed** - system should never sacrifice analysis depth for faster completion.

- **SC-006**: Stage 4 processing respects Stage 3 barrier enforcement (0% bypass rate)

- **SC-007**: Retry logic resolves LLM validation errors in 90%+ of cases within 3 attempts

- **SC-008**: Course category classification achieves 90%+ accuracy (verified through manual spot checks)

## Assumptions

- **A-001**: Stage 3 (document summarization) is 100% complete and operational before Stage 4 implementation
- **A-002**: Document summaries are available in `file_catalog.processed_content` field. Stage 4 enforces strict validation: ALL documents MUST have `processing_status = 'completed'` before analysis proceeds (FR-016).
- **A-003**: OpenRouter LLM API is configured and accessible with three-tier model strategy:
  - Primary: `openai/gpt-oss-20b` (fast, cheap - default for 90%+ courses)
  - Fallback: `openai/gpt-oss-120b` (powerful, expensive - escalation after validation failures)
  - Emergency: `google/gemini-2.5-flash` (large context - rare overflow cases only)
  - Configuration stored in `llm_model_config` database table with per-course override capability
- **A-004**: Target language is explicitly provided by user via `courses.language` field (frontend selection, NOT auto-detected)
- **A-005**: Web search/research capability is deferred to future phase; Stage 4 only flags requirements
- **A-006**: BullMQ worker infrastructure from Stage 1 is operational
- **A-007**: Target lesson duration is provided by user or defaults to 5 minutes
- **A-008**: Minimum course size is 10 lessons (MANDATORY constraint - analysis fails if estimated course <10 lessons)
- **A-009**: Contextual language templates are hardcoded initially (professional, personal, creative, hobby, spiritual, academic)
- **A-010**: Admin panel (Stage 8) will provide UI for global LLM model configuration and per-course overrides (SuperAdmin only)

## Dependencies

- **D-001**: Stage 3 summarization completion (v0.13.0)
- **D-002**: Stage 4 barrier RPC (`packages/course-gen-platform/supabase/migrations/20251029100000_stage4_barrier_rpc.sql`)
- **D-003**: OpenRouter LLM client from Stage 3 (`src/services/llm-client.ts`)
- **D-004**: Token estimation utility from Stage 3 (`src/services/token-estimator.ts`)
- **D-005**: BullMQ worker infrastructure from Stage 1
- **D-006**: Course database schema (courses, file_catalog tables)
- **D-007**: Course Management Page (Frontend) - existing page with lesson generation progress, needs extension for multi-stage progress (Stages 4-7)
- **D-008**: Real-time communication infrastructure (WebSocket or polling mechanism) for progress updates

## Out of Scope

- **OS-001**: Actual web search / internet research (deferred to future implementation)
- **OS-002**: Semi-automatic mode with user approval checkpoints (fully automatic mode only for Stage 4 MVP, see `FUTURE/SEMI-AUTOMATIC-COURSE-CREATION-MODE.md`)
- **OS-003**: Interactive course structure refinement during analysis (user reviews finished analysis, no mid-process editing)
- **OS-004**: Multi-modal content analysis (video, audio transcripts)
- **OS-005**: Real-time collaboration on course design (multi-user courses)
- **OS-006**: A/B testing of different pedagogical strategies
- **OS-007**: Integration with external learning management systems (LMS) for requirements import

## Notes

### From MVP Workflow Analysis

The n8n workflow (CAI CourseGen - Course Structure Analyze) provides valuable reference:

1. **Current approach**: Uses Zod schema validation with retry logic (2 attempts)
2. **Model**: x-ai/grok-4-fast via OpenRouter
3. **Output structure**:
   - `topic_analysis` (determined_topic, complexity, key_concepts, domain_keywords)
   - `recommended_structure` (total_lessons, sections_breakdown with pedagogical_approach)
   - `pedagogical_strategy` (teaching_style, progression_logic)
   - `scope_instructions` (100-800 chars for generation)
   - `expansion_areas` (nullable, with priorities)
4. **Andragogy principles**: Self-direction, experience integration, practical application, problem-centered, internal motivation
5. **Contextual language** (v6.2): Category-specific motivators, why_matters_context, problem_statement_context

### Key Improvements Over MVP

- **Explicit target language**: MVP assumed English input/output; new version uses user-selected target language from `courses.language` field, allowing multi-language course generation regardless of input material language
- **Research flagging**: New capability to identify time-sensitive content
- **Stage 3 integration**: Leverages document summaries instead of raw n8n Google Drive access
- **Structured retry**: Enhanced error messages with field-level diagnostics
- **Scope estimation**: AI-driven content_hours calculation (0.5-200h) based on topic complexity
- **Course categorization**: Semantic classification for contextual language adaptation
- **Three-tier LLM model strategy** (FR-017): MVP used single hardcoded model (`x-ai/grok-4-fast`); new version implements cost-optimized escalation:
  - Primary (GPT OSS 20B) for 90%+ courses → reduces cost by ~70% compared to always using powerful models
  - Fallback (GPT OSS 120B) after validation failures → maintains quality for edge cases
  - Emergency (Gemini 2.5 Flash) for context overflow (rare) → prevents total failures
  - Admin panel override capability for troubleshooting and experimentation
  - Philosophy: **Break analysis into stages rather than relying on large context windows**

## Clarifications

### Session 2025-10-31

- **Q**: Когда OpenRouter LLM API выдаёт ошибку (таймаут, rate limit или недоступность сервиса) во время анализа Stage 4, как должна реагировать система?
  **A**: Три попытки с экспоненциальной задержкой (отдельно от валидационных повторов). После этого отправить уведомление технической поддержки через админку, которая направляет уведомления на выбранные каналы связи.

- **Q**: Какие метрики и события должна логировать Stage 4 (анализ курса) для мониторинга и отладки?
  **A**: Расширенные метрики: длительность анализа, использованные токены, модель LLM, статус (success/fail) + обнаруженные языки, количество research-флагов, категория курса, покрытие документов.

- **Q**: Когда система оценивает, что курс не достигнет минимума (10 уроков) или превысит максимум (100 уроков), какое поведение ожидается?
  **A**: Убрать максимальный лимит полностью (не имеет значения). Минимум 10 уроков - обязательное требование с блокировкой: если анализ показывает <10 уроков, задача failed, пользователь должен уточнить/расширить требования.

- **Q**: Какой термин должен быть каноническим для обозначения пометок о необходимости дополнительного исследования?
  **A**: Гибридная модель (best practice): `research_flags` в коде/API/БД (краткий технический термин), `[RESEARCH_REQUIRED: <reason>]` в пользовательских сообщениях/промптах/логах (понятный формат). Разделение internal naming vs user-facing messaging.

- **Q**: Когда Stage 4 анализирует курс с документами, но некоторые документы из Stage 3 имеют статус `summarization_failed`, как должна реагировать система?
  **A**: Блокировать анализ, вернуть failed, требовать повторной обработки документов в Stage 3. Целостность данных критична - анализ должен работать только с полностью обработанными документами.

- **Q**: Какую стратегию выбора LLM модели должен использовать Stage 4 для анализа курсов?
  **A**: Трёхуровневая стратегия с эскалацией: (1) Primary - GPT OSS 20B (быстрая/дешёвая) для первой попытки, (2) Fallback - GPT OSS 120B (мощная/дорогая) после провала валидации на primary модели (2-3 попытки), (3) Emergency - Gemini 2.5 Flash (большой контекст) только если превышено контекстное окно (редкий случай). Философия: лучше делить анализ на этапы, чем запихивать всё в большую модель. Админка должна позволять выбирать модель для конкретных курсов (главная системная админка, не клиентская).

- **Q**: Какое UX поведение должна демонстрировать система во время обработки Stage 4 (30-600 секунд ожидания)?
  **A**: Многоэтапная прогресс-страница управления курсом (вариант B+). Это не просто индикатор, а полноценная страница курса, на которой пользователь видит создание курса в реальном времени. Отображается текущий этап анализа с обновлением через WebSocket/polling ("Обработка документов...", "Оценка сложности...", "Генерация структуры..."). Эта же страница будет использоваться для всех этапов создания курса (Stages 4-7). В будущем на этой странице будет реализован полуавтоматический режим с точками утверждения (см. FUTURE/SEMI-AUTOMATIC-COURSE-CREATION-MODE.md). Сейчас только полностью автоматический режим. Таймаут увеличен с 90 секунд до 10 минут для учета сложных курсов с большим количеством документов.

- **Q**: Как система должна балансировать между глубиной анализа и скоростью обработки?
  **A**: Глубина важнее (вариант B). ВСЕГДА делать полный детальный анализ, даже если это займет 8-10 минут. Качество структуры критично для всего курса - ошибки на этапе анализа каскадируют на Stages 5-7. Философия: "Quality over Speed" - пользователи готовы подождать ради качественного результата. Скорость - вторичный приоритет. Таймауты указаны как максимальные технические ограничения, а не целевые показатели.

- **Q**: ИСПРАВЛЕНИЕ ТРЕБОВАНИЯ - Должна ли система автоматически определять язык входных данных (темы, документов) для выбора языка генерации курса?
  **A**: НЕТ. Язык курса явно указывается пользователем на фронтенде в поле `courses.language` при создании. Stage 4 НЕ определяет язык автоматически - просто использует уже выбранный целевой язык. Входные материалы (тема, документы) могут быть на ЛЮБОМ языке - это не важно. Система обрабатывает их и генерирует курс на языке, указанном пользователем. Пример: пользователь выбрал "Русский" → курс создается на русском, даже если тема и документы на английском. FR-003 исправлено: убрано автоматическое определение языка, добавлено явное использование courses.language.

- **Q**: Какие критерии должны триггерить research flag для идентификации время-чувствительного контента?
  **A**: Production-ready подход с использованием дорогой модели (120B) в Phase 3. НЕ hardcode ключевых слов. Вместо этого: Phase 3 (Deep Expert Analysis) ВСЕГДА использует модель 120B для тонких решений, включая research flag detection. LLM с очень консервативным промптом: ставить флаг ТОЛЬКО если (1) информация устаревает <6 месяцев И (2) есть явные ссылки на законы/регуляции/версии технологий. Минимизировать false positives - лучше пропустить флаг, чем поставить лишний (соответствует FR-009). Это часть общего принципа: **простые задачи → дешевая модель (20B), сложные экспертные задачи → дорогая модель (120B) сразу**. Применимо ко всем LLM-powered stages (4-7). FR-017 переработано: multi-phase multi-model orchestration.
