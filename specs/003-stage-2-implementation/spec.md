# Feature Specification: Stage 2 Implementation Verification and Completion

**Feature Branch**: `003-stage-2-implementation`
**Created**: 2025-10-24
**Status**: Draft
**Input**: User description: "Stage 2 implementation verification - validate that tasks marked as completed from Stage 0-1 are correctly implemented for Stage 2 requirements"

## Clarifications

### Session 2025-10-24

- Q: Какое максимально допустимое время обработки PDF-файла размером 5MB в production? → A: Целевое время 30 секунд (желательно, aspirational target), но без жесткого максимума - пользователи могут подождать для фоновой обработки
- Q: Какой подход к rollback миграций базы данных следует использовать? → A: Проект новый, нет production данных (только тестовые). Не требуется сложная стратегия миграции существующих данных. Достаточно транзакционного подхода для DDL операций (автоматический rollback при ошибке)
- Q: Когда FREE tier пытается загрузить файл - что должно произойти? → A: Блокировка на обоих уровнях (defense in depth): фронтенд показывает UI загрузки файлов в неактивном состоянии (disabled) с подсказкой "Недоступно на вашем тарифе" + бэкенд валидирует tier и возвращает 403 Forbidden если запрос все же пришел
- Q: Какую информацию должна содержать запись лога при перманентном failure обработки документа? → A: Стандартная детализация (хороший баланс): error message + stack trace + file metadata (name, size, format) + user_id + organization_id
- Q: Какую retry policy использовать для external services (Qdrant, Docling)? → A: Дифференцированная быстрая (учитывает специфику сервисов): Qdrant: 5 попыток [100ms, 200ms, 400ms, 800ms, 1600ms], timeout 5s/попытку; Docling: 3 попытки [2s, 4s, 8s], timeout 60s/попытку. Опционально: jitter ±20% для избежания thundering herd
- Q: Кто отвечает за обнаружение и восстановление осиротевших задач обработки документов, когда воркер падает в процессе обработки? → A: BullMQ встроенный механизм stalled job detection (stalledInterval: 30s, maxStalledCount: 2, lockDuration: 60s) - production-tested решение для фоновых задач с приемлемой задержкой восстановления
- Q: Нужно ли создавать отдельные тестовые файлы для каждого tier, или можно использовать один набор общих файлов? → A: Один общий набор файлов в fixtures/common/ - варьируем только tier параметр в тестах (минимум дублирования, проще поддержка)
- Q: Какие 3 positive сценария должны покрываться для каждого tier в интеграционных тестах? → A: Базовые форматы: (1) PDF upload, (2) DOCX upload, (3) TXT upload - простое покрытие основных типов файлов
- Q: Где должны храниться error logs для permanent failures обработки документов? → A: В отдельной таблице error_logs в Supabase (изолировано от метрик, простой доступ для админки через SQL-запросы, легкая ротация старых записей)
- Q: Какие параметры hierarchical chunking должны использоваться для валидации корректности parent/child структуры? → A: Использовать параметры из существующего кода (markdown-chunker.ts): parent_chunk_size=1500 tokens, child_chunk_size=400 tokens, child_chunk_overlap=50 tokens - реализованная стратегия из T075 (см. /docs/RAG-CHUNKING-STRATEGY.md)

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Infrastructure Audit and Validation (Priority: P1)

**Purpose**: Verify that all Stage 0-1 infrastructure components claimed as "complete" for Stage 2 are actually functioning correctly and meet Stage 2's specific requirements.

**Why this priority**: This is the foundation for Stage 2 completion. Without validated infrastructure, we cannot confidently mark Stage 2 as complete or proceed safely to Stage 3.

**Independent Test**: Can be tested by running the verification checklist against each infrastructure component (database schema, file upload, text extraction, vectorization, worker handler) and validating against Stage 2 acceptance criteria.

**Acceptance Scenarios**:

1. **Given** Stage 0-1 marked file upload as complete, **When** we test tier-based file validation with TRIAL/FREE/BASIC/STANDARD/PREMIUM tiers, **Then** correct file format restrictions are enforced per tier and storage quotas are respected
2. **Given** Stage 0-1 marked text extraction as complete via Docling, **When** we process PDF/DOCX/PPTX/TXT/MD files, **Then** all files are correctly converted to Markdown with OCR working for scanned documents
3. **Given** Stage 0-1 marked vectorization as complete, **When** we test the full RAG pipeline (chunking + embedding + Qdrant upload), **Then** hierarchical chunking produces correct parent/child structure (parent: 1500 tokens, child: 400 tokens, overlap: 50 tokens), Jina-v3 embeddings are 768-dimensional, and vectors are stored in Qdrant with proper metadata
4. **Given** Stage 0-1 marked worker handler as complete, **When** we trigger DOCUMENT_PROCESSING job via BullMQ, **Then** the handler processes files end-to-end, updates progress via RPC, and stores results in file_catalog

---

### User Story 2 - Database Tier Synchronization (Priority: P1)

**Purpose**: Fix critical mismatches between database schema and PRICING-TIERS.md specification that block Stage 2 completion.

**Why this priority**: The database has incorrect tier structure (missing TRIAL, wrong BASIC formats, naming inconsistency). This prevents proper tier-based validation and breaks the business model.

**Independent Test**: Can be tested by querying the tier ENUM after migrations, verifying TRIAL tier exists, BASIC tier only allows TXT/MD (no PDF), and tier naming is consistent with documentation.

**Acceptance Scenarios**:

1. **Given** database currently lacks TRIAL tier, **When** we apply migration to add TRIAL tier, **Then** organizations can be created with tier='trial' and inherit STANDARD features (1GB quota, all formats except export)
2. **Given** database allows PDF for BASIC tier (incorrect), **When** we update tier documentation and validation, **Then** BASIC tier only allows TXT/MD formats and rejects PDF uploads with clear error message
3. **Given** database schema needs consistent tier naming, **When** we ensure ENUM uses 'basic' (not 'basic_plus'), **Then** schema matches PRICING-TIERS.md and code references are consistent
4. **Given** unclear file limit metrics (per-course vs concurrent), **When** we clarify and document the distinction, **Then** system correctly enforces concurrent upload limits (1/2/5/10 based on tier) separately from per-course file counts

---

### User Story 3 - Integration Test Creation and Validation (Priority: P2)

**Purpose**: Create comprehensive integration test that validates the DOCUMENT_PROCESSING worker handler works correctly end-to-end through BullMQ.

**Why this priority**: While infrastructure is complete, there's no automated test proving the full workflow works. This test provides confidence before replacing the n8n workflow.

**Independent Test**: Can be tested by running `pnpm test:integration document-processing-worker.test.ts` and verifying all test cases pass (file upload → processing → chunking → embedding → Qdrant → status updates). Uses common test fixtures from `fixtures/common/` directory with tier parameter varied per test case.

**Acceptance Scenarios**:

Each tier tested with 3 positive scenarios (PDF upload, DOCX upload, TXT upload - covering basic file formats) + 1 negative scenario (tier-specific restriction violation):

1. **Given** TRIAL tier organization, **When** DOCUMENT_PROCESSING jobs triggered for (a) PDF, (b) DOCX, (c) TXT files, **Then** all files processed with STANDARD features, vectors stored in Qdrant, file_catalog shows vector_status='indexed'
2. **Given** FREE tier organization, **When** DOCUMENT_PROCESSING job triggered for any file, **Then** job fails with clear error message stating FREE tier does not support file uploads (0 files allowed)
3. **Given** BASIC tier organization, **When** DOCUMENT_PROCESSING jobs triggered for (a) PDF (negative), (b) DOCX (negative), (c) TXT (positive), **Then** PDF/DOCX fail with tier restriction error, TXT succeeds with vectorization
4. **Given** STANDARD tier organization, **When** DOCUMENT_PROCESSING jobs triggered for (a) PDF, (b) DOCX, (c) TXT files, **Then** all files processed successfully, vectors stored in Qdrant
5. **Given** PREMIUM tier organization, **When** DOCUMENT_PROCESSING jobs triggered for (a) PDF, (b) DOCX, (c) TXT files, **Then** all files processed with additional PREMIUM features (image OCR if applicable), vectors stored

---

### Edge Cases

- **What happens when** database migration DDL fails partway through (e.g., TRIAL tier added but ENUM constraint fails)? → Transaction automatically rolls back, schema remains unchanged (test data can be recreated)
- **What happens when** worker handler crashes during document processing? → BullMQ's built-in stalled job detection automatically detects crashed workers (checks every 30s via stalledInterval), releases the job lock after 60s (lockDuration), and retries up to maxStalledCount=2 times before marking as permanently failed
- **What happens when** file upload exceeds storage quota during processing? → Atomic quota check should prevent upload, return 429 error, and not leave partial files
- **What happens when** Qdrant service is temporarily unavailable? → Retry logic should attempt reconnection with exponential backoff, and job should not fail permanently until max retries exceeded
- **What happens when** Qdrant service remains unavailable after max retries exhausted (5 attempts: 100/200/400/800/1600ms)? → Job marked as permanently failed, error logged to error_logs table with severity=CRITICAL and standard context (error + stack + file metadata + user/org IDs), file_catalog updated with vector_status='failed', user notified via generation_progress with actionable error message and support contact
- **What happens when** Docling conversion times out for large file? → Timeout handler (60s per attempt) gracefully fails the job after 3 retry attempts (2/4/8s delays), logs error to error_logs table with standard context, and updates file_catalog with error status
- **What happens when** FREE tier user tries to bypass frontend validation and directly call upload API? → Backend validates tier and returns 403 Forbidden with message explaining tier limitation and upgrade path

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST verify that all 4 Stage 0-1 infrastructure components (file upload, text extraction, vectorization, worker handler) function correctly for Stage 2 requirements
- **FR-002**: System MUST identify and document any discrepancies between claimed "complete" tasks and actual Stage 2 requirements
- **FR-003**: Database MUST support all 5 tiers: TRIAL, FREE, BASIC, STANDARD, PREMIUM (currently missing TRIAL)
- **FR-004**: BASIC tier MUST only allow TXT/MD file formats and MUST reject PDF/DOCX/PPTX with validation error (currently allows PDF incorrectly)
- **FR-005**: Database tier ENUM MUST use consistent naming 'basic' (not 'basic_plus') matching PRICING-TIERS.md and codebase
- **FR-006**: System MUST distinguish between concurrent upload limits (TRIAL/STANDARD=5, FREE=1, BASIC=2, PREMIUM=10) and per-course file counts (tracked separately)
- **FR-007**: System MUST provide SQL migrations to add TRIAL tier, rename basic_plus → basic, and enforce tier-specific quotas
- **FR-008**: Integration test MUST validate DOCUMENT_PROCESSING worker handler end-to-end through BullMQ for all tiers with 3 positive file format scenarios (PDF, DOCX, TXT uploads) + 1 negative tier restriction scenario per tier
- **FR-009**: Integration test MUST verify tier-based file format restrictions are enforced correctly during document processing for all 3 basic formats (PDF, DOCX, TXT) across all 5 tiers
- **FR-010**: Integration test MUST validate hierarchical chunking (parent: 1500 tokens, child: 400 tokens, overlap: 50 tokens with parent-child relationships), Jina-v3 embeddings (768-dimensional with late_chunking=true), Qdrant upload, and progress tracking work correctly
- **FR-011**: System MUST update SUPABASE-DATABASE-REFERENCE.md to reflect corrected tier structure and constraints
- **FR-012**: System MUST update IMPLEMENTATION_ROADMAP_EN.md to reflect verification results and actual Stage 2 completion percentage
- **FR-013**: System MUST provide validation scripts to check tier quotas, file format restrictions, and concurrency limits are correctly configured
- **FR-014**: Database migrations MUST use transactional DDL operations with automatic rollback on error (no need for complex data migration strategy as project has only test data)
- **FR-015**: System MUST gracefully handle exhausted retry attempts for external service failures (Qdrant, Docling) by marking jobs as permanently failed, logging detailed error context, and providing user-facing error messages with next steps (retry manually, contact support, check service status)
- **FR-016**: System MUST implement defense-in-depth validation for tier-based file upload restrictions: frontend displays disabled UI with "Недоступно на вашем тарифе" message for FREE tier + backend validates tier and returns 403 Forbidden if request bypasses frontend
- **FR-017**: System MUST log permanent failures to error_logs table in Supabase with standard error context: error message + stack trace + file metadata (name, size, format) + user_id + organization_id + severity level for effective troubleshooting and admin panel access
- **FR-018**: System MUST implement differentiated retry policies for external services: Qdrant (5 attempts: 100/200/400/800/1600ms, timeout 5s per attempt), Docling (3 attempts: 2/4/8s, timeout 60s per attempt), with optional jitter ±20% to prevent thundering herd
- **FR-019**: BullMQ queue for DOCUMENT_PROCESSING MUST be configured with stalled job detection enabled (stalledInterval: 30000ms for 30-second checks, maxStalledCount: 2 max stalls before permanent failure, lockDuration: 60000ms for worker lock retention) to automatically recover from worker crashes
- **FR-020**: Database MUST include error_logs table with schema: id (UUID PK), created_at (timestamptz), user_id (FK to auth.users), organization_id (FK to organizations), error_message (text), stack_trace (text), severity (enum: WARNING/ERROR/CRITICAL), file_name/size/format (text/bigint/text), job_id/job_type (text), with indexes on user_id and organization_id for admin panel queries

### Key Entities

- **Verification Checklist**: Structured document listing all Stage 0-1 tasks claimed as complete for Stage 2, with validation status (passed/failed/blocked) and evidence (test results, code inspection findings)
- **Database Migration**: SQL scripts to add TRIAL tier, rename basic_plus → basic, update tier documentation, and enforce quota constraints via database triggers
- **Integration Test Suite**: Automated tests covering DOCUMENT_PROCESSING worker handler with scenarios for each tier (TRIAL, FREE, BASIC, STANDARD, PREMIUM), including positive and negative cases
- **Tier Configuration**: Mapping of tier names to file format restrictions, storage quotas, concurrent upload limits, and feature flags (with corrections for TRIAL and BASIC)
- **Error Logs Table**: Supabase table `error_logs` storing permanent failures with fields: id, created_at, user_id, organization_id, error_message, stack_trace, severity (WARNING/ERROR/CRITICAL), file metadata (name/size/format), job context (job_id, job_type), indexed for admin panel queries by user/org/date

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Verification checklist completed with 100% of Stage 0-1 infrastructure components validated against Stage 2 requirements (currently 4 components: file upload, text extraction, vectorization, worker handler)
- **SC-002**: Database schema correctly supports all 5 tiers (TRIAL, FREE, BASIC, STANDARD, PREMIUM) with proper ENUM values, quotas, and naming consistency
- **SC-003**: BASIC tier file validation rejects 100% of PDF/DOCX/PPTX uploads and only accepts TXT/MD formats, matching PRICING-TIERS.md specification
- **SC-004**: Integration test suite achieves 100% pass rate across all tier-specific scenarios (minimum 20 test cases: 3 positive file format tests [PDF, DOCX, TXT] + 1 negative tier restriction test per tier for ALL 5 tiers: TRIAL/FREE/BASIC/STANDARD/PREMIUM)
- **SC-005**: Database migration scripts execute successfully in under 5 seconds on test database with transactional DDL, automatic rollback on error, and validation checks confirming correct state
- **SC-006**: Documentation (SUPABASE-DATABASE-REFERENCE.md and IMPLEMENTATION_ROADMAP_EN.md) updated to reflect actual Stage 2 completion status with evidence of validation
- **SC-007**: System correctly enforces tier-based concurrent upload limits with 100% accuracy (blocking excess uploads and returning appropriate 429 errors)
- **SC-008**: DOCUMENT_PROCESSING worker handler completes end-to-end workflow with all steps (upload → Docling → chunking → embedding → Qdrant) successful (aspirational target: under 30 seconds for standard test files < 5MB PDF, but no hard maximum as users can wait for background processing)
- **SC-009**: Zero security vulnerabilities introduced by database migrations or tier validation changes (validated via security scanner)
- **SC-010**: FREE tier file upload blocked on both frontend (disabled UI with tier message) and backend (403 response), with 100% validation coverage
- **SC-011**: All permanent failures logged to error_logs table with complete standard context (error + stack trace + file metadata + user/org IDs + severity) for 100% of failure cases, queryable from admin panel
- **SC-012**: Differentiated retry policies implemented and tested: Qdrant recovers from transient failures in < 3.5s (5 attempts total), Docling retries respect 60s timeout per attempt
- **SC-013**: BullMQ stalled job detection recovers crashed workers within 90 seconds (30s detection interval + 60s lock duration), validated via integration test simulating worker crash mid-processing
- **SC-014**: error_logs table created successfully with all required fields (error_message, stack_trace, severity, file/user/org metadata), proper indexes for admin panel queries (user_id, organization_id), and test query returns results in < 100ms for typical admin panel filters

## Scope and Boundaries

**In Scope for This Verification**:
- Validation of Stage 0-1 infrastructure components claimed as complete for Stage 2
- Database tier structure corrections (TRIAL addition, BASIC format fix, naming consistency)
- Database error_logs table creation for admin panel access to permanent failures
- Integration test creation for DOCUMENT_PROCESSING worker handler
- Documentation updates reflecting actual Stage 2 status

**Out of Scope for This Verification**:
- Implementation of new Stage 2 features not already built in Stage 0-1
- Modifications to existing worker handler logic (only validation/testing)
- Migration of Stage 3-6 workflows from n8n (deferred to future stages)
- AI model integration for summarization, analysis, or generation (Stage 3+ scope)
- LMS integration endpoints (Stage 7 scope)
- Admin panel UI enhancements (Stage 8 scope)

## Dependencies and Assumptions

**Dependencies**:
- Supabase MCP server available for database migrations (mcp__supabase__apply_migration, mcp__supabase__execute_sql)
- Qdrant cloud instance accessible for integration tests
- BullMQ Redis instance running for worker handler tests with stalled job detection configured (stalledInterval: 30000ms, maxStalledCount: 2, lockDuration: 60000ms)
- Test data available: common test fixtures in `fixtures/common/` directory (sample PDF, DOCX, PPTX, TXT, MD files used across all tier test cases)

**Assumptions**:
- Stage 0-1 infrastructure is genuinely 90%+ complete as claimed in roadmap
- Database has migration capability (can add ENUM values, modify constraints, create triggers) with transactional DDL support
- Project is in development phase with only test data (no production data to migrate)
- Integration tests can use development Supabase project without affecting any real user data
- Worker handler code at `packages/course-gen-platform/src/orchestrator/handlers/document-processing.ts` is accessible and testable

## Implementation Notes

**Critical Path**:
1. Database tier audit via MCP (Phase 1) - **BLOCKING** everything else
2. SQL migrations to fix tier structure + create error_logs table (Phase 2) - **BLOCKING** integration tests
3. Integration test creation and validation (Phase 3) - **BLOCKING** Stage 2 completion
4. Documentation updates and final verification (Phase 4) - Final deliverable

**Risk Mitigation**:
- **Risk**: Migration DDL fails and leaves schema inconsistent → **Mitigation**: Use transactional DDL with automatic rollback, test migrations on development database first (test data can be recreated if needed)
- **Risk**: Integration tests reveal critical bugs in worker handler → **Mitigation**: Fix bugs before marking Stage 2 complete, update roadmap to reflect actual status

**Validation Strategy**:
- Automated testing for worker handler (integration tests with BullMQ using common fixtures from `fixtures/common/` - tier parameter varied per test case to minimize file duplication)
- Manual testing for tier migrations (inspect database before/after via MCP)
- Code inspection for tier validation logic (file-validator.ts, tier-config.ts)
- Documentation review for consistency (PRICING-TIERS.md vs SUPABASE-DATABASE-REFERENCE.md vs codebase)

## Notes for Planning Phase

**This specification intentionally focuses on verification and correction, not new feature development.** The user correctly identified that Stage 0-1 may have "over-delivered" on infrastructure but we need to validate correctness for Stage 2's specific requirements.

**During planning phase, create a task to**:
1. Investigate actual database state via MCP queries (see Phase 1 in roadmap)
2. Compare findings against PRICING-TIERS.md and identify all mismatches
3. Create SQL migration tasks for each mismatch (TRIAL addition, BASIC PDF restriction, basic_plus rename) + error_logs table creation
4. Design integration test scenarios covering all tiers with positive and negative cases (3 positive file formats: PDF/DOCX/TXT + 1 negative tier restriction per tier)
5. Validate error logging writes to error_logs table and is queryable from admin panel
6. Plan documentation updates to reflect validation results

**This task should be executed early** (one of the first tasks during implementation) because it's foundational - if infrastructure isn't correctly implemented, all subsequent stages are at risk.
