# Feature Specification: Stage 4-6 Course Generation Pipeline

**Feature Branch**: `010-stages-456-pipeline`
**Created**: 2025-11-21
**Status**: Draft
**Input**: "Implement Stage 4 (Analysis), Stage 5 (Generation), Stage 6 (Lesson Content) architecture with Document Prioritization, RAG Planning, Semantic Scaffolding, and parallel lesson content generation"

## Clarifications

### Session 2025-11-22

- Q: When Stage 6 parallel lesson generation has partial failures (e.g., 25/30 lessons succeed, 5 fail after retries), what should the system do? → A: Save successful lessons, mark failed ones for manual review/regeneration. Implement model fallback retry strategy (try alternative models before marking as failed) to minimize failure probability.
- Q: What level of observability should Stage 4-6 pipeline implement? → A: Standard observability - structured logs + key metrics (tokens, cost, duration, quality scores per stage/phase).
- Q: How long should the system store RAG context cache (pre-retrieved chunks)? → A: Store until course generation completes (for retry consistency), then delete. Store query parameters long-term for reproducibility.
- Q: What should system do if user starts course generation while previous generation is still running? → A: Block new request with "generation in progress" message (prevent concurrent generation of same course).
- Q: Какие модели использовать для генерации контента? → A: Language-aware routing: RU → Qwen3 235B (regular), EN/Other → DeepSeek Terminus. Fallback: Kimi K2 (regular). См. docs/MODEL-SELECTION-DECISIONS.md.
- Q: Какая стратегия генерации для Stage 6? → A: **DECISION: Hybrid Map-Reduce-Refine через LangGraph** (production-grade). Чистый Skeleton-of-Thought НЕ используем (40% деградация coherence). Архитектура: Planner → Parallel Expanders → Assembler → Smoother. См. docs/research/010-stage6-generation-strategy/.
- Q: Какие модели для Stage 6 Lesson Content? → A: **RESEARCH COMPLETED** — RU: Qwen3-235B ($0.003/урок), EN: DeepSeek Terminus ($0.005/урок), Fallback: Kimi K2. Стоимость курса $0.025-0.04 (5-20x под бюджетом).
- Q: Document Prioritization входит в скоуп этой спеки? → A: Да, входит. Выполняется ДО суммаризации документа. Определяет, какие документы сохранить целиком (HIGH priority, если помещаются в token budget), а какие агрессивно суммаризировать (LOW priority).
- Q: Нужна ли V1→V2 LessonSpecification совместимость? → A: Нет. Это новый продукт без legacy курсов. Используется только V2 schema. FR-027 удалён.
- Q: На каком уровне определяется content_archetype и кто его определяет? → A: Stage 5 определяет один dominant archetype на весь урок (не per-section). Stage 6 использует единые LLM параметры (temperature и др.) для всего урока.
- Q: Это MVP или production? → A: **PRODUCTION**. Строим production-grade систему с full resilience, не упрощённый MVP.

### Research References

| Topic | Status | Document |
|-------|--------|----------|
| Stage 6 Generation Strategy | ✅ Completed | [Optimal Strategy Report](../docs/research/010-stage6-generation-strategy/Optimal%20Strategy%20for%20Educational%20Lesson%20Content%20Generation%20Research%20Report.md) |
| LLM Content Generation Architecture | ✅ Completed | [LLM Content Generation Strategy](../docs/research/010-stage6-generation-strategy/LLM%20Content%20Generation%20Strategy%20Research.md) |
| Model Selection Decisions | ✅ Documented | [MODEL-SELECTION-DECISIONS.md](../docs/MODEL-SELECTION-DECISIONS.md) |

**Key Research Findings**:
- **Skeleton-of-Thought**: НЕ рекомендован для образовательного контента (40% деградация coherence)
- **Выбранный подход**: **Hybrid Map-Reduce-Refine через LangGraph** (production-grade)
  - Planner → Parallel Expanders → Assembler → Smoother
  - Resilience 8/10 (section-level recovery vs 3/10 для Single-Pass)
  - ~55с латентность (65с buffer до 2-минутного лимита)
- **Стоимость**: ~$0.005 за урок, ~$0.05 за курс (10x под бюджетом $0.20-0.50)
- **Фреймворк**: **LangGraph** (state machine) + BullMQ (30 concurrent workers)
- **Срок реализации**: 4-8 недель (production-grade architecture)

## User Scenarios & Testing

### User Story 1 - Course Creator Uploads Documents (Priority: P1)

A course creator uploads diverse documents (lectures, presentations, regulatory materials) for a new course. The system automatically classifies documents by priority, allocates processing budgets, and prepares them for analysis.

**Independent Test**: Upload 3 documents of varying sizes and types, verify classification and budget allocation.

**Acceptance Scenarios**:

1. **Given** a course with uploaded documents (18K lecture, 12K presentation, 150K regulatory PDF), **When** document processing completes, **Then** lecture and presentation are classified as HIGH priority (core content) and regulatory as LOW priority (reference material)
2. **Given** HIGH priority documents totaling less than 80K tokens, **When** budget allocation runs, **Then** system selects OSS 120B model (cost-effective) for analysis
3. **Given** a HIGH priority document under 50K tokens, **When** processing completes, **Then** full text is preserved for analysis stage
4. **Given** a LOW priority document of any size, **When** processing completes, **Then** an aggressive summary (5K tokens) is created for analysis while original is vectorized for RAG

---

### User Story 2 - Analysis Stage Structures Course (Priority: P1)

After documents are processed, the Analysis stage extracts patterns, creates section-level structure, and generates a RAG plan mapping documents to sections.

**Independent Test**: Run analysis on processed documents, verify section breakdown and RAG plan generation.

**Acceptance Scenarios**:

1. **Given** processed document summaries/full texts from Stage 3, **When** Analysis stage completes, **Then** system produces section-level structure with 3-7 sections and learning objectives per section
2. **Given** analysis completes successfully, **When** RAG planning phase runs, **Then** each section has a document-to-section mapping with search queries and confidence levels
3. **Given** a section mapped to documents seen as full text, **When** RAG plan is generated, **Then** confidence is marked as "high"
4. **Given** a section mapped only to summarized documents, **When** RAG plan is generated, **Then** confidence is marked as "medium" with a note recommending broader search

---

### User Story 3 - Generation Stage Creates Lesson Specifications (Priority: P1)

The Generation stage takes analysis results and RAG access to break down sections into detailed lesson specifications with pedagogical structure.

**Independent Test**: Run generation on analysis results, verify lesson breakdown with content structure and RAG queries.

**Acceptance Scenarios**:

1. **Given** analysis results with RAG plan, **When** Generation stage processes a section, **Then** system retrieves 20-30 relevant chunks from Qdrant based on RAG plan
2. **Given** section context from RAG retrieval, **When** lesson breakdown occurs, **Then** each section produces 3-5 lessons with detailed specifications
3. **Given** lesson specifications are generated, **When** validation runs, **Then** total lessons across all sections is at least 10 (hard requirement)
4. **Given** lesson specifications, **When** quality validation runs, **Then** overall quality score meets or exceeds 0.75 threshold

---

### User Story 4 - Lesson Content Generation in Parallel (Priority: P2)

Stage 6 takes lesson specifications and generates complete lesson content in parallel, using lesson-level RAG for specific details.

**Independent Test**: Run Stage 6 on lesson specifications, verify parallel execution and content quality.

**Acceptance Scenarios**:

1. **Given** lesson specifications from Stage 5, **When** Stage 6 starts, **Then** 10-30 lessons can be generated simultaneously via BullMQ workers
2. **Given** a lesson specification with RAG context, **When** content generation runs, **Then** system retrieves 5-10 specific chunks for the lesson topic
3. **Given** a technical lesson (code_tutorial archetype), **When** content is generated, **Then** LLM temperature is set to 0.2-0.3 for precision
4. **Given** a conceptual lesson with analogies, **When** content is generated, **Then** LLM temperature is set to 0.6-0.7 for creative clarity
5. **Given** generated lesson content, **When** output is produced, **Then** prose is in Markdown format (not JSON) and metadata is in JSON

---

### User Story 5 - Semantic Scaffolding for Quality Content (Priority: P2)

Lesson specifications use Semantic Scaffolding (V2 schema) to guide content generation without over-specifying, allowing model creativity within constraints.

**Independent Test**: Generate lessons using V2 specifications, compare quality to V1 baseline.

**Acceptance Scenarios**:

1. **Given** a lesson specification with hook_strategy (not exact hook text), **When** content is generated, **Then** model produces an appropriate hook matching the strategy (analogy, statistic, challenge, question)
2. **Given** a specification with depth="detailed" instead of exact word count, **When** content is generated, **Then** content has appropriate depth without artificial padding or truncation
3. **Given** RAG context stored by ID (not query strings), **When** lesson generation runs, **Then** system uses pre-retrieved context for grounding
4. **Given** specifications with prohibited_terms constraints, **When** content is generated, **Then** output contains none of the prohibited terms

---

### User Story 6 - Cost-Effective Model Selection (Priority: P3)

The system automatically selects the most cost-effective model based on document volume and content requirements.

**Independent Test**: Process courses with varying document sizes, verify appropriate model selection.

**Acceptance Scenarios**:

1. **Given** HIGH priority documents totaling 30K tokens, **When** model selection runs, **Then** OSS 120B is selected (128K context, $0.20/1M)
2. **Given** HIGH priority documents totaling 200K tokens, **When** model selection runs, **Then** Gemini 2.5 Flash is selected (1M context, $0.15/1M)
3. **Given** cost tracking is enabled, **When** course generation completes, **Then** total cost is between $0.20-$0.50 per course (average)

---

### Edge Cases

- What happens when no documents are uploaded? System generates course from topic only (no RAG)
- How does system handle documents that fail classification? Defaults to LOW priority with aggressive summarization
- What happens when RAG retrieval returns no results? System proceeds with analysis guidance only, marks quality as reduced
- How does system handle lessons that fail quality threshold? Retries up to 3 times with adjusted parameters, then flags for review
- What happens when Stage 6 encounters INSUFFICIENT_CONTEXT? System outputs refusal with clear indication, does not hallucinate

## Requirements

### Functional Requirements

#### Document Prioritization (Stage 2 + Stage 3 Enhancement)

- **FR-001**: System MUST classify uploaded documents as HIGH or LOW priority using LLM-based classification
- **FR-002**: System MUST assign importance_score (0.0-1.0) to each document with HIGH priority threshold at 0.7
- **FR-003**: System MUST allocate token budgets based on total HIGH priority document size (80K threshold for model selection)
- **FR-004**: System MUST preserve full text of HIGH priority documents under 50K tokens
- **FR-005**: System MUST create balanced summaries (10K tokens) for HIGH priority documents over 50K tokens
- **FR-006**: System MUST create aggressive summaries (5K tokens) for LOW priority documents
- **FR-007**: System MUST vectorize ALL documents from ORIGINAL text (not summaries) for RAG retrieval

#### Analysis Stage (Stage 4) Enhancements

- **FR-008**: System MUST implement Phase 6 (RAG Planning) after existing 5 phases
- **FR-009**: System MUST map sections to relevant documents with search queries
- **FR-010**: System MUST mark confidence levels (high/medium) based on document processing mode
- **FR-011**: System MUST generate structured generation_guidance (replacing deprecated scope_instructions)
- **FR-012**: System MUST output analysis results in 5-10K tokens (metadata + RAG plan only, no summary content)

#### Generation Stage (Stage 5) Enhancements

- **FR-013**: System MUST implement section-level RAG retrieval using RAG plan from Analysis
- **FR-014**: System MUST retrieve 20-30 chunks per section (20 for high confidence, 30 for medium)
- **FR-015**: System MUST break down each section into 3-5 lessons with detailed specifications
- **FR-016**: System MUST generate V2 LessonSpecification schema (Semantic Scaffolding)
- **FR-017**: System MUST validate minimum 10 lessons total across all sections
- **FR-018**: System MUST achieve quality score of 0.75 or higher (calculated via LLM Judge with CLEV voting strategy at temperature 0.1)

#### Lesson Content Generation (Stage 6 - New)

- **FR-019**: System MUST create new stage at stages/stage6-lesson-content/ following unified pattern
- **FR-020**: System MUST implement lesson-level RAG retrieval (5-10 chunks per lesson)
- **FR-021**: System MUST support parallel generation of 10-30 lessons via BullMQ workers
- **FR-022**: System MUST route content generation to appropriate LLM parameters based on content_archetype
- **FR-023**: System MUST output prose content in Markdown format (not JSON)
- **FR-024**: System MUST sanitize all generated content for XSS before storage
- **FR-025**: System MUST include citations from RAG chunks in generated content
- **FR-029**: System MUST implement model fallback retry strategy for failed lesson generation (try alternative models before marking as failed)
- **FR-030**: System MUST save successful lessons and mark failed ones for manual review/regeneration (partial success allowed)

#### Schema Updates

- **FR-026**: System MUST implement LessonSpecification V2 schema with hook_strategy, depth, content_archetype, and rag_context_id
- **FR-028**: System MUST update AnalysisResult to include document_relevance_mapping and generation_guidance

> **Note**: V1 backward compatibility (FR-027) removed — это новый продукт без legacy курсов. Используется только V2 schema.

#### Observability

- **FR-031**: System MUST implement structured logging for all stages (4, 5, 6) with consistent format
- **FR-032**: System MUST track and expose key metrics: tokens consumed, cost per stage, duration per phase, quality scores
- **FR-033**: System MUST include course_id and stage identifiers in all log entries for traceability

#### RAG Context Management

- **FR-034**: System MUST store RAG context (retrieved chunks) until course generation completes
- **FR-035**: System MUST delete RAG context cache after successful course generation
- **FR-036**: System MUST persist RAG query parameters (queries, filters) long-term for reproducibility

#### Concurrency Control

- **FR-037**: System MUST prevent concurrent generation of the same course (one active generation per course_id)
- **FR-038**: System MUST return clear "generation in progress" message when blocking duplicate requests

#### LLM Judge for Stage 6 Content Validation (Research-Based)

> Based on Deep Research: See `docs/research/010-stage6-generation-strategy/LLM Judge Implementation*.md`

- **FR-039**: System MUST implement LLM Judge for Stage 6 lesson content validation (specification-only validation insufficient — catches 30-50% additional errors)
- **FR-040**: System MUST use cross-model evaluation (Judge model family MUST differ from Generator to avoid 10-25% self-evaluation bias)
- **FR-041**: System MUST implement CLEV voting strategy: 2 judges always, 3rd judge only when disagreement (reduces cost by 67%)
- **FR-042**: System MUST implement Logprob Entropy detection for hallucination pre-filtering (trigger RAG-based verification only for high-entropy sentences)
- **FR-043**: System MUST implement targeted self-refinement with max 2 iterations before regeneration (preserve successful content sections)
- **FR-044**: System MUST implement cascading evaluation: single pass for clear pass/fail (>0.85 or <0.50), 3x voting only for borderline (0.50-0.85)
- **FR-045**: System MUST use OSCQR-based evaluation rubric with weighted criteria: Factual Integrity (35%), Learning Objective Alignment (25%), Pedagogical Structure (20%), Clarity (10%), Engagement (10%)
- **FR-046**: System MUST output Judge results in structured JSON format with scores, issues, locations, and fix recommendations
- **FR-047**: System MUST escalate to manual review queue when score remains <0.75 after 2 refinement iterations
- **FR-048**: System MUST implement heuristic pre-filters before LLM Judge (Flesch-Kincaid grade level, min/max length, required section headers) to reduce Judge invocations by 30-50%
- **FR-049**: System MUST implement prompt caching for Judge rubric and few-shot examples to reduce evaluation cost by 60-90%

### Key Entities

- **Document**: Uploaded file with priority classification, importance_score, processing_mode (full_text/summary), and vectorized chunks
- **AnalysisResult**: Course structure metadata, sections_breakdown, document_relevance_mapping (RAG plan), and generation_guidance
- **LessonSpecification**: V2 schema with intro_blueprint (hook_strategy, hook_topic), sections with content_archetype and constraints, exercises with structured rubric
- **LessonContent**: Generated content with intro, sections (with citations), examples, exercises (with solutions), and quality metadata
- **RAGContext**: Stored retrieval results identified by rag_context_id, linked to lesson specifications
- **JudgeVerdict**: Evaluation result with overall_score, criteria_scores (factual_integrity, objective_alignment, pedagogical_structure, clarity, engagement), issues array with locations and fix recommendations, and verdict (accept/fix/regenerate/escalate)

## Success Criteria

### Measurable Outcomes

- **SC-001**: 90% or more courses use cost-effective model (HIGH priority documents total 80K tokens or less)
- **SC-002**: 100% of HIGH priority documents under 50K tokens are preserved as full text
- **SC-003**: All document vectorization uses original text (not summaries) for RAG
- **SC-004**: 60-80% cost savings on lightweight courses compared to using large context models universally
- **SC-005**: Section-level RAG retrieves 20-30 relevant chunks per section
- **SC-006**: Quality validation threshold of 0.75 is met on 95% or more of courses
- **SC-007**: Parallel lesson generation processes 10-30 lessons simultaneously
- **SC-008**: Average lesson generation time is under 2 minutes per lesson
- **SC-009**: End-to-end success rate (Document to Lesson Content) is 95% or higher
- **SC-010**: Average total cost per course is between $0.20 and $0.50 (all stages combined)
