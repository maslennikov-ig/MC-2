# Feature Specification: Stage 3 - Document Summarization

**Feature Branch**: `005-stage-3-create`
**Created**: 2025-10-27
**Status**: Draft
**Input**: User description: "Stage 3: Create Summary - Map-Reduce document summarization with LLM"

## Research & Architecture Decisions _(must complete before implementation)_

> **IMPORTANT**: This is the first stage where we use generative LLM (previous stages used only embeddings). The n8n MVP workflow is a REFERENCE, not a blueprint - we need to research optimal approaches for 2025.

### Critical Architecture Decisions

1. **[NEEDS CLARIFICATION: AI Framework Selection]**
   - **Options**:
     - **LangChain.js** - Mature ecosystem, many integrations, may be heavyweight
     - **LangGraph** - Newer, agent-focused, better for complex workflows with state
     - **Direct OpenRouter API** - Lightweight, full control, no framework overhead (like Stage 2 with Jina-v3)
     - **Vercel AI SDK** - Modern, streaming-first, TypeScript-native
   - **Decision criteria**: Developer experience, maintenance overhead, streaming support, cost efficiency
   - **Recommendation needed**: Which framework fits our architecture best?

2. **[NEEDS CLARIFICATION: Summarization Strategy]**
   - **Options** (based on 2025 best practices):
     - **Stuffing** - Single prompt with full document (simple, fast, limited by context)
     - **Map-Reduce** - Parallel chunk summaries → combine (MVP approach, may lose coherence)
     - **Refine** - Iterative refinement with context (coherent, slower, sequential)
     - **Map-Rerank** - Rank chunk relevance before summarizing (quality, complexity)
     - **Hierarchical with semantic clustering** - Group related chunks before summarizing
   - **MVP approach**: Map-Reduce with recursive compression (may be suboptimal)
   - **Research needed**: Benchmark approaches on 50-100 document sample

3. **[NEEDS CLARIFICATION: Model Selection]**
   - **MVP model**: `openai/gpt-oss-20b` (Llama 3.3 70B via OpenRouter)
   - **Alternatives**: GPT-4 Turbo, Claude 3.5 Sonnet, Gemini 1.5 Pro, Mixtral 8x22B
   - **Criteria**: Cost, quality, context window, multilingual support (especially Russian)
   - **Research needed**: Compare on Russian + English document sample

4. **[NEEDS CLARIFICATION: Token Threshold Values]**
   - **MVP values**: 3K (no summary), 115K (chunk size), 200K (final size)
   - **Question**: Are these optimal for 2025 models with 128K+ context windows?
   - **Research needed**: Test different thresholds for quality vs cost tradeoffs

### Assumptions (to validate during research)

- Documents need summarization (vs direct RAG retrieval on full text)
- 200K token limit is appropriate for next stage (Course Structure Analyze)
- Multilingual support requires language-specific token ratios
- Parallel chunk processing is cost-effective (vs sequential)

### Out of Scope (Explicit Exclusions)

> **Purpose**: Define clear boundaries to prevent scope creep and manage expectations

**Stage 3 does NOT include**:

1. **Multi-document synthesis or cross-document analysis**
   - Stage 3 operates on **individual documents only** (1:1 mapping: file_id → summary)
   - For N documents, Stage 3 runs N independent summarization jobs
   - Each summary stored separately in `file_catalog.processed_content`
   - **Cross-document synthesis is Stage 4 responsibility** (Course Structure Analyze)

2. **Custom or structured output formats**
   - Stage 3 produces **plain text summaries only**
   - No structured outputs: JSON, tables, diagrams, bullet lists, or custom formats
   - Summary saved as TEXT to `processed_content` field

3. **Interactive refinement or user feedback loops**
   - Stage 3 is **one-shot summarization** (generate once per file change)
   - No support for user requests like "make it shorter", "add more detail", "focus on X"
   - No iterative refinement based on user feedback
   - Re-summarization only triggered by file content changes (Stage 2 detection)

4. **Real-time or streaming summarization**
   - Stage 3 is **batch/async processing** via BullMQ jobs
   - No real-time streaming of summary generation to UI
   - Progress updates via `update_course_progress` RPC only

5. **Content filtering or moderation**
   - Stage 3 does **not filter sensitive content** (PII, offensive material)
   - Content moderation is out of scope for MVP (future: Anonymizer integration)

**Rationale**: These exclusions keep Stage 3 focused on its core responsibility - generating high-quality individual document summaries efficiently. Advanced features (multi-doc synthesis, custom formats, interactive refinement) belong to later stages or future enhancements.

---

## Clarifications

### Session 2025-10-28

- Q: Data retention and versioning strategy - what happens to old summary when re-summarization runs? → A: Overwrite strategy. Reuse existing Stage 2 file change detection logic (vectorization). If file unchanged, skip summary regeneration and use existing `processed_content`. If file changed, overwrite summary in `processed_content`. No version history needed.

- Q: Security and privacy policy for LLM processing - how to handle documents with sensitive data (PII, confidential information)? → A: No filtering (Option A) for MVP. Send all content to LLM as-is, rely on user responsibility. Future integration with existing Anonymizer project is planned (documented in `/docs/FUTURE/PII-ANONYMIZATION-INTEGRATION.md`).

- Q: Integration failure strategy for prolonged LLM API outages (circuit breaker, fallback) - what happens if OpenRouter unavailable >5 minutes? → A: Circuit breaker + fail (Option B). Reuse existing Stage 0/1 error handling pattern from `error-handler.ts:35` - classify errors (TRANSIENT/PERMANENT/UNKNOWN), retry with exponential backoff (3 attempts, 1s base), mark as failed after exhausting retries. Extend transient patterns for LLM-specific errors (rate limit exceeded, model overloaded, 429, quota exceeded). Failed jobs kept in queue for manual intervention via BullMQ UI. No automatic fallback provider.

- Q: Primary quality metric for summarization acceptance - which metric determines success (ROUGE-L, keyword retention, human eval, composite)? → A: Semantic similarity (embedding-based). Leverage existing Jina-v3 embeddings from Stage 2 - compute cosine similarity between original text vector and summary vector. Threshold: >0.75 (industry standard). Tiered validation strategy: (P0) Human eval on 10-15 docs for ground truth + semantic similarity on 50-100 docs to validate correlation; (P2) Semantic similarity >0.75 as automatic quality gate; (P3) Periodic human audit sampling for production monitoring. Automatic, fast, scalable, semantic (not just n-grams), language-agnostic, leverages existing infrastructure.

- Q: Out-of-scope declarations - what does Stage 3 explicitly NOT do to manage expectations and prevent scope creep? → A: All of the above (Option D). Explicitly exclude: (1) Multi-document synthesis - Stage 3 summarizes individual documents (1:1 file_id → summary in file_catalog.processed_content), does NOT combine/synthesize across multiple documents (that's Stage 4 responsibility); (2) Custom summary formats - produces plain text summaries only, does NOT generate structured outputs (JSON, tables, diagrams); (3) Interactive refinement - one-shot summarization, does NOT support user feedback loop or iterative refinement ("make it shorter/longer"). N documents = N Stage 3 invocations, each independent.

- Q: Semantic similarity validation lifecycle - when should the quality check occur (<0.75 threshold), and what happens if it fails? → A: Hybrid escalation (Option D). P1 (Basic Integration): post-hoc validation only, log warning if <0.75, collect metrics. P2 (Production Quality): pre-save quality gate - compute similarity before saving; if <0.75 for large documents (>threshold): retry #1 switch strategy (e.g., Map-Reduce→Refine), retry #2 upgrade model (e.g., Llama→GPT-4/Claude), retry #3 increase output token budget (less compression), all failed → mark FAILED_QUALITY_CRITICAL, alert engineers; if <0.75 for small documents (<threshold): fallback to full text (OK for Stage 4 context window). P3: async background monitoring for continuous improvement.

- Q: Stage 3→4 coordination and error handling - when can Stage 4 start if N documents are processing, and what happens if some fail? → A: Strict barrier (Option A). Stage 4 CANNOT start until ALL N documents are successfully summarized. If any document fails after all retries → BLOCK Stage 4, require manual intervention for failed documents. Progress tracking shows "X/N documents summarized" until 100% completion. This ensures Stage 4 Course Structure Analyze has complete information (all documents + client input) as required for comprehensive course creation analysis.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Research & Architecture Selection (Priority: P0 - BLOCKING)

Before implementing production solution, team must research and select optimal AI framework, summarization strategy, and model based on quality, cost, and maintainability criteria using sample documents.

**Why this priority**: Architecture decisions are foundational and expensive to change. Wrong choice impacts all future stages using LLM. This is our first generative AI integration - must get it right.

**Independent Test**: Complete architecture decision document with benchmark results (3-5 approaches, 50-100 document sample), cost projections, and rationale. Deliverable: `specs/005-stage-3-create/research/architecture-decision.md`

**Acceptance Scenarios**:

1. **Given** team has 3-5 candidate approaches (LangChain Map-Reduce, LangGraph agent, direct API Refine, etc.), **When** benchmark runs on 50-100 documents, **Then** team produces comparison matrix (quality via semantic similarity >0.75, cost, latency, complexity) with recommended approach
2. **Given** research phase completes, **When** architecture decision is documented, **Then** all [NEEDS CLARIFICATION] markers in this spec are resolved with concrete choices
3. **Given** model selection research completes, **When** Russian + English documents are tested with human eval (10-15 sample) + semantic similarity validation (50-100 docs), **Then** team identifies optimal model for multilingual summarization with cost/quality tradeoff and validates semantic similarity correlation to human judgment

---

### User Story 2 - Basic LLM Integration (Priority: P1)

When a user uploads a small document, system should use selected AI framework to generate a basic summary (proof-of-concept for LLM integration) before implementing production-grade optimizations.

**Why this priority**: Validates end-to-end LLM workflow (prompt → API → response → database) with simplest possible path. Unblocks team to learn framework while research continues.

**Independent Test**: Upload a 5-page Russian document, verify system generates English summary using selected framework/model, stores to `file_catalog.processed_content`. No optimization needed yet.

**Acceptance Scenarios**:

1. **Given** architecture decision is complete (P0), **When** basic LLM integration is implemented, **Then** system can generate summaries for documents under selected threshold using chosen framework
2. **Given** a 5-page document in Russian, **When** summarization runs, **Then** system produces English summary and saves to database within 30 seconds (no optimization yet)
3. **Given** LLM API fails, **When** retry logic triggers, **Then** system retries with exponential backoff (reuse Stage 1 pattern) and logs failure to `error_logs`

---

### User Story 3 - Production-Grade Summarization Strategy (Priority: P2)

When a user uploads large documents (100+ pages), system should use research-validated optimal strategy to generate high-quality summaries efficiently, handling multilingual content and staying within budget constraints.

**Why this priority**: After P0 research validates approach, this implements production-ready solution. Deferred until we know which strategy works best (may not be Map-Reduce!).

**Independent Test**: Upload 200-page technical manual in Russian, verify summarization completes within research-validated SLA (TBD based on chosen approach), summary quality meets benchmarks.

**Acceptance Scenarios**:

1. **Given** research validates optimal strategy (Map-Reduce, Refine, or other), **When** large document processing runs, **Then** system applies validated strategy with documented quality/cost tradeoffs
2. **Given** a 200-page document, **When** summarization begins, **Then** system completes within research-validated SLA (current MVP: 5 minutes, may change)
3. **Given** multilingual documents, **When** token estimation runs, **Then** system uses research-validated language ratios (MVP: 19 languages, may simplify)

---

### User Story 4 - Small Document Optimization (Priority: P3)

When a user uploads very small documents (<threshold TBD), system should bypass summarization entirely and store full text to preserve 100% fidelity and avoid unnecessary API costs.

**Why this priority**: Cost optimization and quality preservation for simple cases. Deferred until P0 research determines optimal threshold.

**Independent Test**: Upload 2-page document, verify system stores full text without calling LLM API, completes in <5 seconds.

**Acceptance Scenarios**:

1. **Given** research determines optimal no-summary threshold (MVP: 3K tokens, may change), **When** document is under threshold, **Then** system stores full text without API call
2. **Given** a 2-page document, **When** processing runs, **Then** system completes in <5 seconds with `processing_method='full_text'`

---

### User Story 5 - Cost Tracking and Budgeting (Priority: P3)

When summarization runs, system should track actual API costs per document and organization to enable tier-based billing and budget alerts.

**Why this priority**: Production requirement for monetization, but not blocking MVP functionality. Can be added after core summarization works.

**Independent Test**: Process 10 documents, verify cost tracking logs show actual OpenRouter charges, match within 15% of estimates.

**Acceptance Scenarios**:

1. **Given** summarization job completes, **When** cost is calculated, **Then** system logs actual API usage (input/output tokens) and estimated cost based on selected model pricing
2. **Given** organization exceeds tier budget, **When** new summarization request arrives, **Then** system logs warning to `system_metrics` (enforcement TBD)

---

### Edge Cases

> **Note**: Edge case handling details will be refined after P0 research phase completes

- **Unchanged files**: Reuse Stage 2 file change detection logic (векторизация) - if file unchanged, skip summarization and return existing `processed_content`. Only regenerate summary when file content changes.
- **Extremely small documents**: Threshold TBD (MVP: <3K tokens) - store full text without API call
- **Null/empty processed_content**: If Stage 2 failed to extract text, skip summarization and log error to `error_logs` table
- **LLM API failures (transient)**: Reuse Stage 0/1 error handler pattern - classify errors, retry with exponential backoff (3 attempts, 1s base delay). LLM-specific transient patterns: rate limit exceeded, model overloaded, 429, quota exceeded, 503/502/504.
- **LLM API failures (prolonged)**: After exhausting retries, mark job as failed, keep in queue for manual inspection via BullMQ UI. No automatic fallback provider (circuit breaker strategy).
- **Timeout on large documents**: Research phase will determine acceptable SLA and timeout strategy
- **Multilingual edge cases**: Research will validate if language-specific token ratios are needed (MVP: 19 languages may be over-engineered)
- **Quality degradation**: P1: If summary quality falls below semantic similarity threshold (<0.75 cosine similarity between original text and summary Jina-v3 embeddings), log warning only. P2+: Pre-save quality gate with hybrid escalation retry - for large documents: retry #1 switch strategy (Map-Reduce→Refine), retry #2 upgrade model (Llama→GPT-4/Claude), retry #3 increase output tokens (less compression); for small documents: fallback to full text storage. All retries failed → mark FAILED_QUALITY_CRITICAL, alert engineers.
- **Failed documents blocking Stage 4**: If any document fails after exhausting ALL retries (transient API errors + quality retries), Stage 4 CANNOT start. System displays "X/N documents completed, Y failed - manual intervention required" and blocks workflow progression until failed documents are resolved or manually skipped by admin.

## Requirements _(mandatory)_

> **Note**: Many requirements are marked [NEEDS CLARIFICATION] until P0 research phase completes. These represent hypotheses to validate, not final specifications.

### Functional Requirements - Research Phase (P0)

- **FR-001**: Team MUST complete architecture decision research comparing 3-5 approaches (LangChain Map-Reduce, LangGraph agent, direct API, etc.) on 50-100 document sample with semantic similarity quality metric (cosine similarity >0.75 between original text and summary Jina-v3 embeddings)
- **FR-002**: Team MUST benchmark at least 3 candidate models (MVP: gpt-oss-20b, alternatives: GPT-4 Turbo, Claude 3.5, Gemini 1.5) on Russian + English documents with cost/quality/latency metrics. Quality validation: human eval on 10-15 docs for ground truth + semantic similarity on 50-100 docs to validate correlation.
- **FR-003**: Team MUST document architecture decision with rationale in `specs/005-stage-3-create/research/architecture-decision.md` including framework choice, strategy choice, model choice, threshold values, and semantic similarity correlation analysis
- **FR-004**: Research deliverables MUST include cost projections for all tiers (TRIAL through PREMIUM) based on realistic document volume assumptions

### Functional Requirements - Basic Integration (P1)

- **FR-005**: System MUST integrate selected AI framework (LangChain/LangGraph/direct API/other) with OpenRouter or chosen provider
- **FR-006**: System MUST check file change status using Stage 2 logic (векторизация) before summarization - skip API call and reuse existing `processed_content` if file unchanged, regenerate only when file content changes (overwrite strategy, no versioning)
- **FR-007**: System MUST generate basic summaries for documents using selected model and strategy (optimizations deferred to P2)
- **FR-008**: System MUST save generated summaries to `file_catalog.processed_content` field with appropriate `processing_method` value (overwrite on file change)
- **FR-009**: System MUST update course progress via `update_course_progress` RPC with Russian step names: "Обработка документов завершена" → "Создание резюме..." (show X/N progress) → "Резюме создано" (only when ALL N documents at 100% completion, no failed jobs)
- **FR-010**: System MUST retry failed LLM API calls using Stage 0/1 error handler pattern (`error-handler.ts`) - classify errors (TRANSIENT/PERMANENT/UNKNOWN), retry transient errors with exponential backoff (3 attempts, 1s base delay), extend transient patterns for LLM-specific errors (rate limit exceeded, model overloaded, 429, quota exceeded)
- **FR-011**: System MUST mark jobs as failed after exhausting retries, keep failed jobs in queue for manual intervention via BullMQ UI (circuit breaker strategy, no automatic fallback provider)
- **FR-012**: System MUST log all LLM API calls to structured logs (Pino) with request ID, model, token counts, latency, cost, and error classification (if failed)

### Functional Requirements - Production Optimization (P2)

- **FR-013**: System MUST implement Hierarchical Chunking with Adaptive Compression strategy (research-validated) with documented quality/cost tradeoffs
- **FR-014**: System MUST validate summary quality using semantic similarity - compute cosine similarity between original text Jina-v3 embedding and summary Jina-v3 embedding, require >0.75 threshold. P1: post-hoc validation (log warning only). P2+: pre-save quality gate (check before saving to database).
- **FR-015**: System MUST implement hybrid escalation retry for failed quality checks (P2+). For large documents (>threshold) with similarity <0.75: Retry #1 switch summarization strategy (e.g., Map-Reduce→Refine), Retry #2 upgrade model (e.g., Llama→GPT-4/Claude), Retry #3 increase output token budget (less aggressive compression). All retries failed → mark job FAILED_QUALITY_CRITICAL, alert engineers. For small documents (<threshold) with similarity <0.75: fallback to full text storage (acceptable for Stage 4 context window).
- **FR-015a**: System MUST log quality metrics (semantic similarity score, input/output token counts, processing time, retry attempts if any) to structured logs for each summarization job
- **FR-016**: System MUST handle documents up to research-validated size limit [NEEDS CLARIFICATION: MVP assumes 200K token output, may change based on Stage 4 needs]
- **FR-017**: System MUST apply research-validated token estimation [NEEDS CLARIFICATION: MVP uses 19 language-specific ratios, may simplify to 3-5 major languages]
- **FR-018**: System MUST process large documents within research-validated SLA [NEEDS CLARIFICATION: MVP assumes 5 minutes for 200 pages, may change]
- **FR-019**: System MUST respect tier-based concurrency limits (reuse Stage 1 pattern: TRIAL/STANDARD=5, FREE=1, BASIC=2, PREMIUM=10) when using parallel processing
- **FR-020**: System MUST implement strict barrier for Stage 3→4 transition - Stage 4 (Course Structure Analyze) CANNOT start until ALL N documents are successfully summarized (100% completion required)
- **FR-021**: System MUST block Stage 4 if any document fails after exhausting all retries (transient + quality retries) - require manual intervention for failed documents before Stage 4 can proceed
- **FR-022**: System MUST track and display completion progress as "X/N documents summarized" until 100% completion achieved

### Functional Requirements - Cost Optimization (P3)

- **FR-023**: System MUST track actual API costs per document [NEEDS CLARIFICATION: pricing depends on model selection in P0]
- **FR-024**: System MUST bypass summarization for documents under research-validated threshold [NEEDS CLARIFICATION: MVP assumes 3K tokens, research may adjust]
- **FR-025**: System SHOULD log cost warnings when organization approaches tier budget limits (enforcement mechanism TBD)
- **FR-026**: System SHOULD implement periodic human audit sampling (P3) - randomly select summaries for manual quality review to validate semantic similarity metric correlation to human judgment over time

### Non-Functional Requirements - Security & Privacy

- **NFR-001**: For MVP, system sends all document content to LLM API without PII filtering or redaction (user responsibility for sensitive content)
- **NFR-002**: System MUST log warning in UI/docs that documents are processed by third-party LLM API (OpenRouter or selected provider) without anonymization
- **NFR-003**: Future integration with Anonymizer project is planned for PII redaction (post-MVP, see `/docs/FUTURE/PII-ANONYMIZATION-INTEGRATION.md`)

### Scope Boundary Requirements (Explicit Exclusions)

- **SBR-001**: Stage 3 MUST NOT perform multi-document synthesis - operates on individual documents only (1:1 file_id → summary mapping), N documents = N independent jobs
- **SBR-002**: Stage 3 MUST save summaries as plain text to `file_catalog.processed_content` - no structured outputs (JSON, tables, diagrams)
- **SBR-003**: Stage 3 MUST NOT support interactive refinement or user feedback loops - one-shot summarization only, re-triggered only on file content changes
- **SBR-004**: Stage 3 MUST NOT implement real-time streaming - batch/async processing via BullMQ with progress updates via `update_course_progress` RPC
- **SBR-005**: Cross-document synthesis, analysis, and aggregation is Stage 4 responsibility (Course Structure Analyze) - Stage 3 produces independent per-file summaries

### Key Entities

> **Note**: Entity definitions will be refined after P0 research phase

- **SummarizationJob**: BullMQ job containing metadata (file_id, course_id, organization_id, selected_strategy, selected_model, language)
- **SummarizationResult**: Output stored in `file_catalog.processed_content` with metadata (`processing_method`, `original_content_length`, timestamps, cost data). Uses overwrite strategy - regenerated only when file content changes (Stage 2 change detection), no version history maintained.
- **ArchitectureDecision**: Research deliverable documenting framework choice, strategy choice, model choice, and rationale
- **[Optional] ChunkMetadata**: Only if research validates chunk-based approach (Map-Reduce, Map-Rerank) - describes chunks for parallel processing

**Strategy Aliases** (database enum → research name):
- `'hierarchical'` (database/type enum) = "Hierarchical Chunking with Adaptive Compression" (research-validated strategy with 5% overlap, adaptive compression levels, recursive iteration)
- `'full_text'` (database/type enum) = "Full Text Storage" (bypass LLM for documents <3K tokens)
- Future: `'chain_of_density'` (see FUTURE/CHAIN-OF-DENSITY-SUMMARIZATION.md)

## Success Criteria _(mandatory)_

> **Note**: Specific numeric targets will be determined by P0 research phase. Values below are hypotheses to validate.

### Measurable Outcomes - Research Phase (P0)

- **SC-001**: Research phase completes within 3-5 days with documented architecture decision comparing 3-5 approaches on 50-100 document sample
- **SC-002**: Architecture decision document includes cost projections showing $X per 1000 documents for each tier (TRIAL through PREMIUM) based on realistic assumptions
- **SC-003**: Benchmark results demonstrate chosen approach meets quality bar: semantic similarity >0.75 (cosine similarity between original text and summary Jina-v3 embeddings) validated against human eval on 10-15 doc sample (correlation analysis documented)
- **SC-004**: Team consensus on architecture decision with rationale documented and approved before P1 implementation begins

### Measurable Outcomes - Basic Integration (P1)

- **SC-005**: Basic LLM integration generates summaries for documents using selected framework within acceptable timeframe [NEEDS CLARIFICATION: <30 seconds for small docs?]
- **SC-006**: System successfully integrates with selected AI provider (OpenRouter or other) with error rate <1% (excluding expected API rate limits)
- **SC-007**: All LLM API calls are logged with structured data (request ID, model, tokens, latency, cost, retry attempts) for observability and debugging
- **SC-007a**: Progress tracking accurately displays "X/N documents summarized" and transitions to "Резюме создано" only at 100% completion with no failed jobs

### Measurable Outcomes - Production Optimization (P2)

- **SC-008**: Large documents (research-validated size) are summarized within research-validated SLA [NEEDS CLARIFICATION: MVP assumes <5 min for 200 pages, TBD]
- **SC-009**: Summarization quality meets semantic similarity threshold: >0.75 cosine similarity between original text and summary Jina-v3 embeddings. P1: post-hoc validation with warning logs. P2+: pre-save quality gate with hybrid escalation retry before failing job.
- **SC-009a**: Stage 4 strict barrier enforced - Stage 4 cannot start until ALL N documents successfully summarized (100% completion, zero failed jobs after all retries)
- **SC-010**: System handles multilingual documents (Russian, English, others) with research-validated token estimation accuracy [NEEDS CLARIFICATION: ±10% variance, TBD]
- **SC-011**: System maintains 99.5% uptime for summarization jobs with automatic retry and recovery from transient API failures

### Measurable Outcomes - Cost Optimization (P3)

- **SC-012**: Actual API costs match research projections within 20% variance across 1000 document sample (validation for billing model)
- **SC-013**: Small documents (under research-validated threshold) bypass summarization, saving API costs while preserving 100% content fidelity
- **SC-014**: Periodic human audit sampling validates semantic similarity metric - correlation >0.80 between semantic similarity scores and human quality ratings on random production samples (monitoring for metric drift)
