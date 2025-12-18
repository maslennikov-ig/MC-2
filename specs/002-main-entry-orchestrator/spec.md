# Feature Specification: Stage 1 - Main Entry Orchestrator

**Feature Branch**: `002-main-entry-orchestrator`
**Created**: 2025-10-20
**Status**: Draft
**Input**: User description: "Replace n8n Main Entry workflow with backend code-based orchestrator"

## Clarifications

### Session 2025-10-20

- Q: When multiple instructors trigger course generation simultaneously for different courses, should the system process all jobs in parallel, limit concurrency, serialize, or use per-user limits? → A: Priority-based queuing with dynamic concurrency - Priority by tier (FREE=1, BASIC=3, STANDARD=5, TRIAL=5, PREMIUM=10), Per-user concurrency limits (FREE=1, BASIC=2, STANDARD=3, PREMIUM=5), Global dynamic limit 3-10 based on system load, Performance monitor in Stage 8 admin panel for tuning
- Q: What should happen if RPC `update_course_progress` fails after creating BullMQ job - rollback job and return error, leave job and return success, retry then rollback, or fallback to direct UPDATE? → A: Saga pattern with compensation - Retry RPC 3 times with exponential backoff (100ms, 200ms, 400ms), Rollback job (remove from BullMQ) if all retries fail and return 500 error, Worker fallback checks step 1 status and completes it if orchestrator failed, Idempotent RPC design allows safe retries, Stage 8 admin panel monitors orphaned jobs
- Q: How should system handle authentication during migration from n8n - use same HMAC secret for compatibility, create new secret, support both temporarily, or switch to JWT? → A: JWT only (Supabase Auth) - No legacy HMAC support (project in development, no existing users), Authorization: Bearer token header, Extract userId and tier from JWT (cryptographically secure), Integrates with Supabase RLS policies, Industry standard OAuth2/OIDC, Built-in audit trail, No shared secrets to manage
- Q: What structured logging format should system use for Stage 8 monitoring - JSON console logs, Winston/Pino with levels, simple console.log, or database logs? → A: Pino structured logger (hybrid 2-tier) - Primary: Pino JSON logs to stdout → Docker → CloudWatch (10x faster than Winston, child loggers for context propagation, zero-cost disabled levels), Secondary: Critical events to Supabase system_metrics table (job_rollback, orphaned_job_recovery, concurrency_limit_hit), Log levels: info/warn/error/fatal, Metadata: requestId/userId/tier/courseId/jobId/priority, Stage 8 dashboard queries both sources

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Start Course Generation from Frontend (Priority: P1)

As an Instructor using the existing Next.js frontend, I need to initiate course generation so that the backend orchestrator coordinates all workflow stages just like the n8n workflow did.

**Why this priority**: This replaces the core n8n Main Entry webhook. Without this, the entire course generation pipeline is blocked. Frontend already calls this endpoint - must maintain compatibility.

**Independent Test**: Can be fully tested by calling POST `/api/coursegen/generate` with valid JWT Bearer token, verifying BullMQ job is created with correct priority, and confirming correct workflow is queued based on file presence.

**Acceptance Scenarios**:

1. **Given** the existing Next.js frontend calls POST `/api/coursegen/generate`, **When** valid courseId and JWT Bearer token are provided, **Then** the request is accepted and returns 200 OK
2. **Given** a request with invalid or missing JWT token, **When** authentication fails, **Then** the request is rejected with 401 Unauthorized
3. **Given** a request with valid JWT but user exceeds tier concurrency limit, **When** concurrency check fails, **Then** the request is rejected with 429 Too Many Requests
4. **Given** a course with files in `generation_progress.files`, **When** orchestrator processes the request, **Then** DOCUMENT_PROCESSING job is queued in BullMQ with priority based on user tier
5. **Given** a course WITHOUT files in `generation_progress.files`, **When** orchestrator processes the request, **Then** STRUCTURE_ANALYSIS job is queued in BullMQ with priority based on user tier
6. **Given** a queued job, **When** job is created, **Then** RPC `update_course_progress` is called with step_id=1, status='completed', message='Инициализация завершена'
7. **Given** a missing courseId, **When** request is processed, **Then** 400 Bad Request is returned with validation error

---

### User Story 2 - Track Generation Progress for Frontend (Priority: P1)

As the frontend application, I need to receive progress updates from the backend so that users can see real-time generation status in the UI just like with n8n.

**Why this priority**: Frontend expects to read `generation_progress` JSONB column that contains steps array. Backend must update this column when jobs progress. Critical for UX - users abandon if no feedback.

**Independent Test**: Can be fully tested by starting a job, triggering worker progress events, and verifying `generation_progress` column is updated with correct step status, percentage, and message.

**Acceptance Scenarios**:

1. **Given** DOCUMENT_PROCESSING job starts, **When** job handler calls `updateProgress()`, **Then** `generation_progress.steps[1].status` changes to 'in_progress' and `generation_progress.percentage` updates
2. **Given** a job completes a step, **When** worker emits 'completed' event, **Then** corresponding step in `generation_progress.steps` is marked 'completed' with timestamp
3. **Given** a job fails, **When** worker emits 'failed' event, **Then** `generation_progress.steps[currentStep].status = 'failed'` and error message is stored
4. **Given** frontend polls `/api/courses/[slug]/check-status`, **When** backend queries database, **Then** latest `generation_progress` is returned with current step and percentage
5. **Given** multiple jobs for same course, **When** progress updates occur, **Then** updates are atomic and do not conflict (optimistic locking or transactions)
6. **Given** RPC `update_course_progress` is called from worker, **When** step transitions, **Then** `generation_progress.steps`, `generation_progress.current_step`, and `generation_progress.percentage` are updated correctly

---

### User Story 3 - Frontend Compatibility with Existing UI (Priority: P2)

As the development team, I need the new backend to be compatible with the existing frontend so that we can deploy Stage 1 without rewriting the entire Next.js application.

**Why this priority**: Frontend migration is out of scope for Stage 1. Backend must accept existing API calls and maintain existing data structures (`generation_progress` JSONB format). Breaking changes block deployment.

**Independent Test**: Can be fully tested by running the existing frontend against the new backend and verifying all generation flows work identically to n8n.

**Acceptance Scenarios**:

1. **Given** frontend calls POST `/api/coursegen/generate` with n8n-compatible payload, **When** backend processes request, **Then** response matches n8n response format (200 OK with success: true)
2. **Given** frontend expects `generation_progress.steps` array with 5 steps, **When** backend initializes progress, **Then** exact same structure is created (step ids 1-5, names in Russian)
3. **Given** frontend webhook endpoint `/api/webhooks/coursegen` receives updates from n8n, **When** backend jobs progress, **Then** same webhook callback format is used (if webhookUrl is configured)
4. **Given** frontend polls course status, **When** reading `courses.generation_progress` column, **Then** data format matches n8n format (steps, percentage, current_step, message)
5. **Given** frontend expects specific status values ('initializing', 'processing_documents', 'analyzing_task', etc.), **When** backend updates course status, **Then** exact same status strings are used
6. **Given** frontend cancel endpoint exists at `/api/courses/[slug]/cancel`, **When** cancellation is requested, **Then** backend updates generation_progress to reflect cancellation (not just job_status)

---

### Edge Cases

- What happens when frontend calls old n8n webhook URL instead of new backend?
  - Deployment strategy: Run both n8n and new backend in parallel initially
  - Frontend env variable `N8N_WEBHOOK_URL` points to new backend `/api/coursegen/generate`
  - n8n workflow remains active as backup until migration validated

- What happens if course is deleted while job is running?
  - Worker checks if course exists before each major operation
  - If course not found, job is gracefully cancelled
  - Partial artifacts are cleaned up via cascade delete

- How does system handle RPC failure after job creation? (Saga pattern with compensation)
  - Orchestrator retries RPC 3 times with exponential backoff (100ms, 200ms, 400ms)
  - If all retries fail, orchestrator removes BullMQ job and returns 500 error to user
  - Worker has fallback: checks step 1 status on job start, completes it if missing (orphaned job recovery)
  - Idempotent RPC design allows safe retries (UPDATE step 1 'completed' → 'completed' is safe)
  - Stage 8 admin panel will monitor orphaned job metrics for alerting

- What happens when `generation_progress.files` field is null or malformed?
  - Treat null/empty array as "no files" → queue STRUCTURE_ANALYSIS
  - Validate array structure before checking contents
  - Log warning if malformed but continue with fallback logic

- How does system handle webhook URL being null in course record?
  - Webhook callbacks are optional - skip if webhookUrl not configured
  - Only update database `generation_progress` (frontend polls this)
  - Log info message that webhook callback was skipped

- What happens when RPC `update_course_progress` doesn't exist yet?
  - Stage 1 MUST create this RPC as part of database migration
  - If migration not applied, orchestrator initialization should fail-fast
  - Clear error message directing to run migrations

## Requirements _(mandatory)_

### Functional Requirements

**API Endpoint (n8n Replacement):**

- **FR-001**: System MUST provide POST `/api/coursegen/generate` endpoint that accepts courseId and webhookUrl (optional) in request body
- **FR-002**: System MUST validate JWT Bearer token from `Authorization` header using Supabase Auth
- **FR-003**: System MUST reject requests with missing or invalid JWT token (401 Unauthorized)
- **FR-004**: System MUST extract userId and user tier from validated JWT token (user.id and user.user_metadata.tier or from user_profiles table)
- **FR-005**: System MUST validate courseId is a valid UUID format before processing
- **FR-006**: System MUST query Supabase `courses` table to fetch full course record by courseId
- **FR-007**: System MUST verify that course belongs to authenticated user (courseId → userId match for security)
- **FR-008**: System MUST check `generation_progress.files` array to determine workflow branching

**Workflow Orchestration Logic:**

- **FR-009**: System MUST queue DOCUMENT_PROCESSING job if `generation_progress.files` is non-empty array
- **FR-010**: System MUST queue STRUCTURE_ANALYSIS job if `generation_progress.files` is empty/null
- **FR-011**: System MUST pass ALL course fields (title, language, style, course_description, target_audience, difficulty, lesson_duration_minutes, learning_outcomes, estimated_lessons, estimated_sections, content_strategy, output_formats) AND userId to queued job data
- **FR-012**: System MUST assign job priority based on user tier: FREE=1, BASIC=3, STANDARD=5, TRIAL=5, PREMIUM=10 (BullMQ priority field)
- **FR-013**: System MUST enforce per-user concurrent job limits: FREE=1, BASIC=2, STANDARD=3, PREMIUM=5 concurrent course generations
- **FR-014**: System MUST enforce global dynamic concurrency limit (3-10 parallel jobs) based on CPU/Memory metrics (adjustable via admin panel in Stage 8)
- **FR-015**: System MUST reject new job with 429 Too Many Requests if user exceeds their tier concurrency limit
- **FR-016**: System MUST call RPC `update_course_progress(p_course_id, p_step_id: 1, p_status: 'completed', p_message: 'Инициализация завершена', p_metadata: {executionId, timestamp})` after job creation
- **FR-016.1**: System MUST retry RPC `update_course_progress` up to 3 times with exponential backoff (100ms, 200ms, 400ms) on failure
- **FR-016.2**: System MUST rollback (remove) BullMQ job if RPC fails after all 3 retry attempts
- **FR-016.3**: System MUST return 500 Internal Server Error with user-friendly message ('Не удалось инициализировать генерацию курса. Попробуйте позже.') if rollback occurs
- **FR-016.4**: System MUST log each RPC retry attempt using Pino logger with metadata {courseId, attempt, maxRetries, error} at warn level
- **FR-017**: System MUST return 200 OK response immediately after successful job creation AND successful RPC call (total timeout 5 seconds including retries)

**Observability & Logging:**

- **FR-036**: System MUST use Pino structured logger for all application logging (JSON format to stdout)
- **FR-037**: System MUST create child loggers with context propagation for each request (requestId, userId, tier)
- **FR-038**: System MUST create child loggers with job context for each BullMQ job (courseId, jobId, priority)
- **FR-039**: System MUST log at appropriate levels: info (normal flow), warn (retries, recoveries), error (failures), fatal (system crashes)
- **FR-040**: System MUST include standard metadata in all logs: service='course-generator', environment, version, timestamp (ISO8601)
- **FR-041**: System MUST write critical events to Supabase `system_metrics` table: job_rollback, orphaned_job_recovery, concurrency_limit_hit, worker_timeout
- **FR-042**: Critical event records MUST include: event_type, severity, user_id, course_id, job_id, metadata (JSONB), timestamp

**Progress Tracking Integration:**

- **FR-018**: System MUST create database function `update_course_progress(p_course_id UUID, p_step_id INTEGER, p_status TEXT, p_message TEXT, p_error_message TEXT, p_error_details JSONB, p_metadata JSONB)` via migration
- **FR-019**: Function MUST update `courses.generation_progress` JSONB column with step status changes
- **FR-020**: Function MUST update `courses.generation_progress.steps[step_id].status` to match p_status ('pending', 'in_progress', 'completed', 'failed')
- **FR-021**: Function MUST update `courses.generation_progress.steps[step_id].started_at` when status becomes 'in_progress'
- **FR-022**: Function MUST update `courses.generation_progress.steps[step_id].completed_at` when status becomes 'completed' or 'failed'
- **FR-023**: Function MUST update `courses.generation_progress.percentage` based on step progression (step 1 = 20%, step 2 = 40%, step 3 = 60%, step 4 = 80%, step 5 = 100%)
- **FR-024**: Function MUST update `courses.generation_progress.current_step` to p_step_id
- **FR-025**: Function MUST update `courses.generation_progress.message` to p_message

**Worker Integration:**

- **FR-026**: BullMQ worker MUST check if step 1 (initialization) is marked 'completed' before processing job (fallback for orchestrator RPC failure)
- **FR-026.1**: If step 1 status ≠ 'completed', worker MUST call `update_course_progress` RPC to complete step 1 with metadata {recovered_by_worker: true}
- **FR-026.2**: Worker MUST log orphaned job recovery at warn level with Pino logger {courseId, jobId, recoveryType: 'step_1_fallback'} AND write to system_metrics table
- **FR-027**: BullMQ worker MUST call `update_course_progress` RPC at start of each job (step N, status 'in_progress')
- **FR-028**: BullMQ worker MUST call `update_course_progress` RPC on job completion (step N, status 'completed')
- **FR-029**: BullMQ worker MUST call `update_course_progress` RPC on job failure (step N, status 'failed' with error details)
- **FR-030**: Worker MUST map job types to step IDs: INITIALIZE=1, DOCUMENT_PROCESSING=2, STRUCTURE_ANALYSIS=3, STRUCTURE_GENERATION=4, TEXT_GENERATION=5

**Frontend Compatibility:**

- **FR-031**: System MUST maintain exact `generation_progress` JSONB structure expected by frontend (steps array with id, name, status, started_at, completed_at, error fields)
- **FR-032**: System MUST use Russian step names matching n8n: "Запуск генерации", "Обработка документов"/"Анализ задачи", "Генерация структуры", "Создание контента", "Финализация"
- **FR-033**: System MUST update `courses.status` column to match frontend expectations: 'initializing', 'processing_documents', 'analyzing_task', 'generating_structure', 'generating_content', 'finalizing', 'completed', 'failed'
- **FR-034**: System MUST update `courses.generation_started_at` timestamp when first job is queued
- **FR-035**: System MUST update `courses.generation_completed_at` timestamp when all jobs complete or fail

### Key Entities

- **API Request Payload**: Input to POST `/api/coursegen/generate`. Attributes: courseId (UUID, required), webhookUrl (string, optional for callbacks). Note: userId extracted from JWT Bearer token, not from payload.

- **JWT Token**: Supabase Auth access_token passed via `Authorization: Bearer <token>` header. Contains user.id and user.user_metadata.tier (or tier fetched from user_profiles table). Cryptographically signed, cannot be forged.

- **User Record** (existing from Supabase Auth): Attributes include id (UUID), tier (enum: FREE/BASIC/STANDARD/TRIAL/PREMIUM). Tier determines job priority and concurrency limits. Tier stored in user_metadata or separate user_profiles table.

- **Course Record** (existing table from Stage 0): Attributes include id (UUID), generation_progress (JSONB with steps array), status (enum), generation_started_at (timestamp), generation_completed_at (timestamp). This is the SOURCE OF TRUTH for frontend.

- **Generation Progress Structure** (JSONB): Nested object with fields: steps (array of 5 step objects), percentage (integer 0-100), current_step (integer 1-5), message (string). Each step object has: id (1-5), name (Russian string), status ('pending'/'in_progress'/'completed'/'failed'), started_at (timestamp), completed_at (timestamp), error (string optional).

- **BullMQ Job** (already exists from Stage 0): Attributes include job_id (string), course_id (UUID in data payload), job_type (DOCUMENT_PROCESSING or STRUCTURE_ANALYSIS), status (waiting/active/completed/failed), priority (integer 1-10 based on user tier), progress (0-100), created_at, processed_at.

- **RPC Function**: update_course_progress(p_course_id, p_step_id, p_status, p_message, p_error_message, p_error_details, p_metadata). Returns updated generation_progress JSONB. MUST be idempotent (safe to call multiple times with same parameters - UPDATE operations, not INSERT).

- **Tier Concurrency Limits** (configuration): Mapping of tier → max concurrent jobs: {FREE: 1, BASIC: 2, STANDARD: 3, PREMIUM: 5}. Enforced before job creation.

- **Global Concurrency Monitor** (Stage 8 admin panel): Tracks system load (CPU/Memory) and adjusts global concurrency limit (3-10 parallel jobs) dynamically.

- **System Metrics Table** (Supabase): Table `system_metrics` for critical events. Columns: id (UUID), event_type (enum: job_rollback, orphaned_job_recovery, concurrency_limit_hit, worker_timeout), severity (enum: info, warn, error, fatal), user_id (UUID), course_id (UUID), job_id (text), metadata (JSONB), timestamp (timestamptz). Used by Stage 8 dashboard for alerts and analytics.

- **Pino Logger** (application): Structured JSON logger outputting to stdout. Base context: {service, environment, version}. Child loggers propagate context: {requestId, userId, tier, courseId, jobId, priority}. Log levels: debug (dev only), info, warn, error, fatal.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Frontend can successfully trigger course generation via POST `/api/coursegen/generate` with 100% compatibility (no frontend code changes required)
- **SC-002**: Backend webhook endpoint responds within 500ms after queuing job (fire-and-forget pattern)
- **SC-003**: RPC `update_course_progress` updates database `generation_progress` column within 100ms
- **SC-004**: Frontend polling `/api/courses/[slug]/check-status` sees progress updates within 2 seconds of worker emitting progress event
- **SC-005**: Correct workflow is queued based on file presence (DOCUMENT_PROCESSING if files exist, STRUCTURE_ANALYSIS if no files) with 100% accuracy
- **SC-006**: JWT Bearer token validation rejects 100% of invalid/missing tokens (401 Unauthorized)
- **SC-007**: Migration deploys successfully creating `update_course_progress` RPC function and `system_metrics` table without breaking existing database operations
- **SC-008**: Average orchestration overhead (endpoint → queue job) is less than 300ms for 95th percentile requests
- **SC-009**: Jobs are processed in correct priority order (PREMIUM jobs before STANDARD before BASIC before FREE) with 100% accuracy
- **SC-010**: Per-user concurrency limits are enforced correctly - users exceeding tier limits receive 429 Too Many Requests with 100% accuracy
- **SC-011**: System rejects new jobs when global concurrency limit is reached (queue FIFO processing when at capacity)
- **SC-012**: All logs output in structured JSON format with consistent metadata (requestId, userId, tier, courseId, jobId) at appropriate levels
- **SC-013**: Critical events (rollbacks, recoveries, concurrency hits) are written to both Pino logs AND system_metrics table within 1 second
- **SC-014**: Child loggers propagate context correctly - all logs within a request/job contain parent context metadata

## Assumptions _(optional)_

- BullMQ infrastructure from Stage 0 is fully operational (queue, worker, Redis connection, job handlers)
- BullMQ supports priority-based job processing (built-in feature, confirmed available)
- Job types (DOCUMENT_PROCESSING, STRUCTURE_ANALYSIS, etc.) are already defined in `bullmq-jobs.ts`
- Worker handlers exist as stubs that will be implemented in Stages 2-6 (they currently log and return success)
- Supabase Auth JWT validation is available from Stage 0 (supabase.auth.getUser(token) works)
- User tier information is available in Supabase Auth user metadata (user.user_metadata.tier) or separate `user_profiles` table (to be confirmed with Stage 0 database schema)
- Frontend uses Supabase Auth and has valid JWT access_token in session
- Frontend needs minor update: add `Authorization: Bearer ${session.access_token}` header to POST `/api/coursegen/generate` (remove x-webhook-signature header)
- Database migration system is in place (Supabase migrations via `.sql` files)
- Admin dashboard from Stage 0 (BullBoard UI) is sufficient for Stage 1 - advanced concurrency monitoring deferred to Stage 8
- Frontend expects Russian language step names (hardcoded in n8n, must maintain compatibility)
- Webhook callback to frontend (`webhookUrl` parameter) is optional - progress polling is primary method
- Tier concurrency limits and priority mappings are hardcoded constants in Stage 1 - dynamic configuration deferred to Stage 8 admin panel

## Out of Scope _(optional)_

- **Worker implementation logic**: Actual document processing, structure generation, content generation (Stages 2-6)
- **Frontend code changes**: Migrating frontend from n8n webhook calls to native tRPC calls (future enhancement)
- **Advanced progress features**: Estimated time remaining, real-time websocket updates (frontend polling is sufficient)
- **Webhook retry logic**: If `webhookUrl` callback fails, no retries (frontend relies on polling)
- **Multi-job orchestration**: Queuing multiple jobs simultaneously (current scope: single job per course generation request)
- **Dynamic concurrency tuning**: Performance monitor and auto-scaling based on CPU/Memory metrics (deferred to Stage 8 admin panel)
- **Horizontal worker scaling**: Multiple worker instances handling different job types (single worker handles all types for now)
- **Migration from n8n**: Automated cutover or traffic splitting between n8n and new backend (manual switch via env variable)

## Dependencies _(optional)_

**From Stage 0 (VERIFIED COMPLETE):**
- ✅ BullMQ integration with job types defined
- ✅ `courses` table with `generation_progress` JSONB column
- ✅ Redis instance running and connected
- ✅ tRPC server with middleware
- ✅ Supabase Auth with JWT validation
- ✅ BullBoard admin dashboard

**Required for Stage 1:**
- ❌ Database migration MUST CREATE `update_course_progress` RPC function
- ❌ Database migration MUST CREATE `system_metrics` table with event_type enum and indexes
- ❌ Pino logger MUST BE INSTALLED and configured (pino npm package)
- ❌ API endpoint `/api/coursegen/generate` MUST BE IMPLEMENTED
- ❌ JWT Bearer token validation middleware MUST BE IMPLEMENTED (using Supabase Auth)
- ❌ User tier lookup logic MUST BE IMPLEMENTED (from user_metadata or user_profiles table)
- ❌ Priority-based job queueing MUST BE IMPLEMENTED
- ❌ Per-user concurrency limit enforcement MUST BE IMPLEMENTED
- ❌ Structured logging with Pino child loggers MUST BE IMPLEMENTED (requestId, userId, tier, courseId, jobId context)
- ❌ Critical events logging to system_metrics table MUST BE IMPLEMENTED (helper function for dual logging)
- ❌ Worker must call RPC function on job lifecycle events
- ❌ Orchestration logic (file check → correct job queue) MUST BE IMPLEMENTED

**External Dependencies:**
- Next.js frontend (courseai-next) - requires minor update to add Authorization header
- Supabase database with write access for RPC function
- Supabase Auth service for JWT validation

**Blocking Dependencies:**
- None - all prerequisites satisfied

## Open Questions _(optional)_

This section is intentionally empty. All major design decisions have been clarified through the gap analysis.

## Notes _(optional)_

- **Key insight**: Stage 1 is NOT about creating new features - it's about replacing n8n Main Entry with equivalent backend code
- **Migration strategy**: Deploy backend endpoint alongside n8n, switch frontend env variable `N8N_WEBHOOK_URL` to point to new backend, verify, then sunset n8n
- **Progress tracking**: Backend updates `courses.generation_progress` JSONB column, frontend polls this column (same as with n8n)
- **Worker pattern**: Workers call `update_course_progress` RPC at start/end of jobs, RPC handles all JSONB manipulation
- **Russian compatibility**: Step names MUST match exactly: "Запуск генерации", "Обработка документов", "Анализ задачи", "Генерация структуры", "Создание контента", "Финализация"
- **Critical path**: API endpoint → JWT validation → Extract userId + tier from token → Verify course ownership → Check concurrency limits → Check files → Queue correct job with priority → Call RPC with retry (step 1 complete) → Return 200 OK (or rollback job and return 500 if RPC fails)
- **Deployment note**: RPC migration must deploy BEFORE backend code that calls it (migration-first deployment strategy)
- **Priority queuing**: User tier (from `/docs/PRICING-TIERS.md`) determines job priority and concurrency limits - PREMIUM users get highest priority (10) and most concurrent jobs (5)
- **Concurrency enforcement**: Stage 1 implements hardcoded limits (FREE=1, BASIC=2, STANDARD=3, PREMIUM=5); Stage 8 admin panel will add dynamic tuning based on system load
- **Stage 8 integration**: Performance monitor and dynamic global concurrency adjustment (3-10 parallel jobs) will be implemented in Stage 8 Admin Panel
- **Scalability note**: BullMQ priority queue handles bursts well - higher tier users jump queue, lower tier users wait when system is at capacity
- **Saga pattern**: Orchestrator uses compensating transaction pattern - retry RPC 3x with backoff, rollback BullMQ job on failure; Worker has fallback to recover orphaned jobs (step 1 not completed)
- **Idempotency**: RPC `update_course_progress` designed for safe retries - UPDATE operations ensure calling multiple times with same params is safe
- **Observability**: All retry attempts, rollbacks, and orphaned job recoveries MUST be logged for Stage 8 monitoring and alerting
- **JWT vs HMAC**: Using JWT (Supabase Auth) instead of HMAC for better security (user-specific tokens vs shared secret), automatic RLS integration, built-in audit trail, and standard OAuth2/OIDC compliance
- **Frontend migration**: Frontend needs simple 1-line change - add `Authorization: Bearer ${session.access_token}` header, remove userId from payload (extracted from token)
- **Security**: Course ownership verified (JWT userId must match course.user_id) to prevent unauthorized access to other users' courses
- **Logging architecture (2-tier)**: Tier 1 = Pino JSON logs to stdout → Docker → CloudWatch (all events, searchable, trace requests), Tier 2 = Supabase system_metrics table (critical events only: rollbacks, recoveries, limits)
- **Pino advantages**: 10x faster than Winston, child loggers for zero-cost context propagation, JSON structured by default, zero-cost when log level disabled
- **Context propagation**: Request logger (requestId, userId, tier) → Job logger (+ courseId, jobId, priority) - all child logs inherit parent context automatically
- **Stage 8 dashboard**: Queries CloudWatch for real-time log search/filtering + system_metrics table for critical event analytics and alerting (>5 rollbacks/hour → alert)
