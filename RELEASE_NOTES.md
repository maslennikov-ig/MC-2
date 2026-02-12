# Release Notes - v0.26.29

_Released on 2025-12-26_

## v0.29.11

_Released on 2026-02-12_

### 🔧 Improvements

- **web**: Remove 25 as-any casts from tRPC-migrated server actions

### 🐛 Bug Fixes

- **web**: Fix build blocker, remove upload as-any casts, rewrite enrichment tests
- **web**: Migrate client-side hooks from raw fetch to tRPC client (Phase 4)
- **web**: Migrate raw fetch() calls to tRPC client (Phases 1-3)

---

_This release was automatically generated from 17 commits._

## v0.29.10

_Released on 2026-02-12_

### 🐛 Bug Fixes

- Staging deploy chown + contract tests BullMQ ESM crash

---

_This release was automatically generated from 2 commits._

## v0.29.9

_Released on 2026-02-12_

### ✨ New Features

- **web**: Add 3 source file(s), update 1 source file(s), +1 more
- **jina**: Replace in-process rate/concurrency limiters with Redis-based distributed versions

### 🐛 Bug Fixes

- **tests**: Remove BullMQ worker from contract tests
- **Authentication**: Add local JWT verification fallback for test environments
- **tests**: Remove fake session_id from mock JWT + fix reregeneration typo
- **tests**: Fix 32 CI contract test failures — JWT secret, stale enums, wrong namespace
- **stage4**: Add .default() to SuggestedAnswerSchema.rationale for LLM output resilience

---

_This release was automatically generated from 24 commits._

## v0.29.8

_Released on 2026-02-11_

### 🔧 Improvements

- Code review tech debt — DRY model constants, ModelConfigService migration, startup validation

### 🐛 Bug Fixes

- **lint**: Resolve 23 ESLint errors across web package + suppress test false positives
- **chat**: Address code review findings CR-004/005/006/007/009/010
- **chat**: Fix 500 error, add stage-specific models, replace deprecated models
- **refinement-chat**: Improve JSON content detection
- **bunker**: Use randomUUID for atomic temp files instead of process.pid
- **logger,stage4**: LKG race condition, error serialization, rationale validation
- **chat**: Improve JSON detection + add trim guard + telemetry (code review)
- **chat**: Prevent empty chat bubbles and blank lesson content (EGT-1521, GDK-6714)

---

_This release was automatically generated from 31 commits._

## v0.29.7

_Released on 2026-02-10_

### ✨ New Features

- Add CategoryBadge to ClarifyingPanel wizard + bulk error log cleanup
- **logs**: Add auto-resolve RPC for stale to_verify fingerprints

### 🔧 Improvements

- Split 5 largest files into modular structure
- Split prompt-registry.ts into per-stage modules

### 🔒 Security

- Aidevteam server audit — cryptominer killed, ports fixed
- Server hardening — SSH, Bull Board, nginx, kernel update

### 🐛 Bug Fixes

- **chat**: Empty assistant bubble + irrelevant proposals in refinement chat
- Add ARIA labels + 44 unit tests for CategoryBadge
- Address code review findings from refactoring
- **tests**: Update 14 stale judge tests to match current implementations
- **tests**: Mock Supabase Auth tokens locally to eliminate flaky CI failures
- **i18n**: Extract hardcoded strings from RefinementChat + useRefinement

---

_This release was automatically generated from 37 commits._

## v0.29.6

_Released on 2026-02-10_

### ✨ New Features

- Add Phase 0.5 unit tests + Admin Clarifying Q&A tab
- **stage4**: Pass course_description to Phase 1/2 + expand Phase 0.5 clarifying system

### 🐛 Bug Fixes

- **chat**: Code review v2 — dedup ChatMessage, fix rejectProposal cleanup, add 6 tests
- **chat**: Address code review findings — skeleton, redundant check, generic message
- **chat**: Add Reject button + post-accept guidance message
- **chat**: Improve chat UX — remove toast, keep proposal after accept, add Stage 6 per-lesson chat
- **stage4**: Address code review findings for Phase 0.5 multi-round clarification

---

_This release was automatically generated from 11 commits._

## v0.29.5

_Released on 2026-02-10_

### ✨ New Features

- **web**: Sync full_name to auth metadata on profile save

### 🔒 Security

- Add authentication to Telegram webhook endpoint (mc2-gqfj)

### 🐛 Bug Fixes

- **worker**: Resolve log warnings from course generation QGN-6607
- Address code review HIGH findings — IPv6 SSRF + cleanup audit trail
- Healthcheck cycle — auth, types, atomic deletion, security hardening
- **web**: Replace i18n 'as any' with '@ts-expect-error' + add SSRF protection
- **Security**: Timing-safe metrics API key comparison
- Healthcheck batch 2 — 6 bugs fixed, bundle optimization
- **web**: Improve auth sync error handling + sync avatar_url
- **Security**: Healthcheck — 9 bugs fixed (5 critical, 3 high, 1 medium)

---

_This release was automatically generated from 86 commits._

## v0.29.4

_Released on 2026-02-09_

### ✨ New Features

- **stage6**: Pass lessonSpec to LessonInspector Blueprint tab
- **pipeline**: Add unified course-level token tracking
- **Interface**: Add token aggregation to ModuleDashboard
- **error-handling**: Standardize wrapTRPCError with AppError/PipelineError support
- **shared-utils**: Create shared-utils package and migrate imports
- **web**: Migrate env.ts to @t3-oss/env-nextjs with Zod validation

### 🔧 Improvements

- **dry**: Extract completePhaseWithTrace, getErrorMessage, progress constants
- **lint**: Structural batch 3 — extract 14 top-warning files into helpers (158→119 warnings)
- **review**: Implement code review recommendations — type safety, constants, docs
- **lint**: Structural batch 2 addendum — split phase-2-scope + phase-6-summarization (8 warnings fixed)
- **lint**: Structural batch 2 — split 7 large files (30 warnings fixed)
- **lint**: Structural batch 1 — split 3 largest router files (18 warnings fixed)
- **stage4**: Remove dead Phase 6 RAG Planning code
- Remove dead code InitializeJobHandler (mc2-qt9i)
- **API**: Split lifecycle.router.ts into lifecycle/ subdirectory
- **web**: Consolidate validation-utils.ts into validation.ts
- **shared-utils**: Narrow normalizeLanguageCode return type, remove unknown code passthrough
- **shared-utils**: Code review improvements — named constants, JSDoc, fallback param, tests
- Consolidate formatNumber, formatFileSize, sanitization configs to shared packages
- **course-gen-platform**: Replace `as string` assertions with getTextContent() for LangChain messages

### 🐛 Bug Fixes

- **web**: Update 1 source file(s), update 5 agent(s), +1 more
- **CI/CD**: Build shared packages before lint to resolve type-aware rules
- **lint**: Add JSDoc and standardize error handling in batch 3 helpers
- **web**: Refetch traces on stage restart to clear stale error nodes
- **tests**: Replace inline getAuthToken with centralized singleton in generation contract tests
- **lint**: Code review fixes — Supabase types, re-exports, floating promise
- **web**: Resolve TS7030 in GlobalCourseChat useEffect — not all code paths return value
- Prevent test errors in prod logs + auto-mute rules for infra errors
- Cap totalSections to available sections in Stage 5 (B1)
- Clean up courseEntries on eviction and metrics on cancellation (CR follow-up)
- Memory/resource leak audit fixes (mc2-yqyx)
- **docker**: Add shared-utils to both API and Web Dockerfiles
- **lint**: Batch 6 — fix all 108 remaining fixable ESLint warnings
- **Interface**: Rename misleading "Regenerate All" button to "Retry Failed"
- **web**: Extract uuid-validation to avoid jsdom in API route bundles
- **pipeline**: Idempotent token tracking — no double-count on retry (CR-006)
- Add missing migration file and fix zero-token display (CR-001, CR-009)
- **lint**: Batch 5 — fix 39 ESLint warnings in 7 files
- **CI/CD**: Add shared-utils build step to CI pipeline
- **API**: Apply 3 remaining code review improvements
- **course-gen-platform**: Fix 82 ESLint warnings in batch 4 (10 files)
- **API**: Apply code review fixes to lifecycle sub-routers
- **course-gen-platform**: Fix 81 ESLint warnings in batch 3 (handlers, routers, judges, prompts)
- **course-gen-platform**: Fix 85 ESLint warnings in batch 2 (logger, client, routers, sanitizer)
- **course-gen-platform**: Fix 135 ESLint warnings in benchmarks, regeneration and chat routers
- **web**: Address code review findings for env migration
- **course-gen-platform**: Code review follow-up improvements

---

_This release was automatically generated from 176 commits._

## v0.29.3

_Released on 2026-02-09_

### 🔧 Improvements

- Add Redis LLM cache, optimize API queries, parallelize retry

### 🐛 Bug Fixes

- **course-gen-platform**: Update 28 source file(s), update 2 test(s), +2 more
- Address remaining code review issues #6-#15
- Address code review issues for perf optimization

---

_This release was automatically generated from 14 commits._

## v0.29.2

_Released on 2026-02-08_

### ✨ New Features

- **course-gen-platform**: Add 1 source file(s), add 2 test(s), +1 more
- 3-tier model routing for Stage 5 based on section importance

### 🔧 Improvements

- Expand optimizePackageImports with all Radix UI + framer-motion
- Remove dead complexity/criticality scoring from Stage 5
- Extract regex to PATTERNS constant, add SSOT JSDoc, fix lastIndex bug
- Migrate tRPC architecture to @trpc/react-query with typesafe hooks

### 🐛 Bug Fixes

- Harden sanitize.fileName, fix tests, extract CONTROL_CHAR_REGEX
- **CI/CD**: Build course-gen-platform before type-check
- Remove type safety bypasses in ClarifyingPanel (#4, #5)
- Address code review findings for tRPC migration
- **tests**: Repair unit test suite — 83/83 pass, no hanging
- **tests**: Repair 10 pre-existing broken unit tests after deduplication

---

_This release was automatically generated from 48 commits._

## v0.29.1

_Released on 2026-02-08_

---

_This release was automatically generated from 1 commits._

## v0.28.62

_Released on 2026-02-07_

### ✨ New Features

- **stage4**: Swap Phase 1 and Phase 0.5 for data-driven clarifying questions
- **web**: Show classification_rationale in Stage 3 & pedagogical_patterns in Stage 4

### 🔧 Improvements

- **stage4**: Move Visual Style to accordion, remove deprecated Document Relations
- **pipeline**: Remove dead content_strategy field from analysis_result

### 🐛 Bug Fixes

- **shared-types,web**: Add pedagogical_patterns to editable whitelist & guard empty .in()
- **stage4,stage5**: Retry pull-fallback + accept any assessment_types type

---

_This release was automatically generated from 33 commits._

## v0.28.61

_Released on 2026-02-07_

### 🐛 Bug Fixes

- **pipeline**: Sync course style injection across all generation stages
- **stage4**: Pass document content to clarifying questions prompt

---

_This release was automatically generated from 7 commits._

## v0.28.60

_Released on 2026-02-07_

### ✨ New Features

- **web**: Add 1 source file(s), update 12 source file(s), +1 more

### 🐛 Bug Fixes

- **userback**: Use identify() for form pre-fill instead of init options

---

_This release was automatically generated from 4 commits._

## v0.28.59

_Released on 2026-02-07_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 1 source file(s), update docs
- **graph**: Fix Stage 4 results spinner — shared ref race condition + missing complete statuses
- **stage7**: Fix double retry bug causing enrichments stuck in generating
- **anti-overlap**: Remaining code review issues (1.3, 2.3, 5.3, security, i18n)
- **anti-overlap**: Address code review findings for overlap detection
- **pipeline**: Prevent duplicate lessons via anti-overlap prompts and cross-section detection

---

_This release was automatically generated from 25 commits._

## v0.28.58

_Released on 2026-02-07_

### 🐛 Bug Fixes

- **userback**: Localize widget greeting to Russian

---

_This release was automatically generated from 1 commits._

## v0.28.57

_Released on 2026-02-07_

### 🐛 Bug Fixes

- **userback**: Add font-src CSP and prefill email/name in widget

---

_This release was automatically generated from 2 commits._

## v0.28.56

_Released on 2026-02-06_

### 🐛 Bug Fixes

- **csp**: Add static.userback.io to style-src and connect-src

---

_This release was automatically generated from 4 commits._

## v0.28.55

_Released on 2026-02-06_

### 🐛 Bug Fixes

- **Authentication**: Code review fixes — security, i18n, UX improvements

---

_This release was automatically generated from 3 commits._

## v0.28.54

_Released on 2026-02-06_

### ✨ New Features

- **web**: Add 4 source file(s), update 5 source file(s), +2 more
- **web**: Embed Userback feedback widget with SPA support and CSP

### 🐛 Bug Fixes

- Remove unused InvitationType imports + fix NODE_ENV test assertions
- Health check phase 2 - 13 deferred bugs fixed
- Health check - 8 bugs fixed (mc2-wisp-0t4)
- **worker**: Use actual path in EACCES fix instructions
- Shared Jina rate limiter (100 RPM) + EACCES improvements + auto-mute rules

---

_This release was automatically generated from 40 commits._

## v0.28.53

_Released on 2026-02-06_

### ✨ New Features

- **orchestrator**: Add BLOCK_REGENERATION job type and Sentry monitoring
- **lesson-editor**: Add inline markdown editor for lesson content
- **generation-graph**: Implement NodeDetailsDrawer action handlers
- **logger**: Add 2 new auto-mute rules for expected errors

### 🐛 Bug Fixes

- **block-regen**: Optimistic locking, cache limit, shared setNestedValue
- **orchestrator**: Address code review findings for BLOCK_REGENERATION
- **CI/CD**: Add concurrency group and paths-ignore for .beads
- **lesson-editor**: Concurrent save guard, draft toast, save feedback, ARIA
- **lesson-editor**: CSS, dark mode, autosave, context refactor, and tests
- **lesson-editor**: Address code review findings
- Resolve 3 production error categories
- **workflow**: Merge stage1CourseData with traces for Stage 1 nodes

---

_This release was automatically generated from 62 commits._

## v0.28.52

_Released on 2026-02-04_

### 🔧 Improvements

- **export-lessons**: Optimize DB query with lessons_with_latest_content view
- **chat**: Extract getUpdatedFieldsForProposal helper function
- **stage4**: Move suggested_answers normalization to Zod z.preprocess()

### 🐛 Bug Fixes

- **chat**: Resolve message duplication and data not refreshing after apply
- **tests**: Sync test data with updated Zod schemas (9 failing tests)
- **tests**: Fix fetch mocking in jina-reranker-client unit test
- **admin**: Fix null filters breaking /admin/logs page (500 error)
- **stage4**: Enforce min length + filter invalid answers in normalization
- Process error logs — 3 bug fixes + 3 auto-mute rules
- **stage6**: Prevent "sections is not iterable" error in judge

---

_This release was automatically generated from 48 commits._

## v0.28.51

_Released on 2026-02-04_

### 🐛 Bug Fixes

- **i18n**: Address code review findings for i18n headers
- **i18n**: Replace hardcoded English headers with localized labels
- **markdown**: Escape currency dollar signs to prevent LaTeX math misinterpretation

---

_This release was automatically generated from 12 commits._

## v0.28.50

_Released on 2026-02-03_

### ✨ New Features

- **chat**: Implement code review recommendations P1-2, P2-2, P3
- **chat**: Implement intent classification for chat optimization
- добавлено UI предупреждение о необходимости CORE документа
- Implement remaining code review recommendations
- Migrate user preferences to Supabase and add section-expander validation

### 🐛 Bug Fixes

- **chat**: Address code review issues for intent classification
- **chat**: Optimize chat fallback config for large courses
- **CI/CD**: Add forceExit to shared-types vitest config
- **CI/CD**: Resolve test timeouts and hanging processes
- очистка localStorage после создания курса
- добавлена валидация приоритетов документов при переходе Stage 3→4
- Resolve CI/CD test failures blocking Dev deploy
- Address code review findings for user-preferences

---

_This release was automatically generated from 72 commits._

## v0.28.49

_Released on 2026-02-02_

### ✨ New Features

- **useLessonActions**: Add i18n and loading states UI (P2 improvements)
- **ModuleDashboard**: Implement tRPC mutations for lesson actions
- Implement storage helper for EnrichmentCard audio playback
- **observability**: Add ConcurrencyLimiter metrics, tests, and enrichments health check

### 🔧 Improvements

- **admin**: Optimize get_grouped_error_logs RPC statement timeout
- **chat**: Use PAUSABLE_STATUSES for generation blocking

### 🐛 Bug Fixes

- **useLessonActions**: Fix P0/P1 race conditions and memory leaks
- **docling**: Graceful fallback for unsupported format + clarify cover prompts design
- **orchestrator**: Pass BullMQ job token correctly in sandboxed processor
- **AMX-5817**: Resolve bucket, chat blocking, and Jina rate limit issues
- **web**: Only show approve button when generationStatus is awaiting_approval
- **stage1**: Graceful fallback when vector duplication has no vectors

---

_This release was automatically generated from 71 commits._

## v0.28.48

_Released on 2026-02-01_

### ✨ New Features

- **stage5**: Distinguish retryable vs non-retryable errors

### 🐛 Bug Fixes

- **docling**: Switch transport from SSE to Streamable HTTP
- **docling**: Update to docling-mcp 1.3.4 and mcp 1.26.0
- **config**: Change DOCLING_MCP_URL from /sse to /mcp
- **stage2**: Add missing pdf-parse dependency for fallback extraction
- **Database**: Allow anonymous users to insert PWA analytics events
- **tests**: Centralize auth token helper with exponential backoff
- **deploy**: Force remove containers by name before blue-green deploy
- **deploy**: Cleanup leftover containers before blue-green deploy
- **types**: Replace error: any with proper instanceof checks
- **types**: Replace explicit any with proper types in production code
- **CI/CD**: Add always() condition to Deploy to Production job
- **types**: Replace any with Record<string, unknown> for JSONB fields
- **web**: Correct vitest test:integration command
- **CI/CD**: Resolve flaky CI/CD tests with timeouts and rate limiting
- **realtime**: Handle empty error objects in skeleton traces fetch

---

_This release was automatically generated from 28 commits._

## v0.28.47

_Released on 2026-02-01_

---

_This release was automatically generated from 4 commits._

## v0.28.46

_Released on 2026-01-31_

### 🐛 Bug Fixes

- **docling**: Switch MCP transport from Streamable HTTP to SSE
- **stage2**: Implement remaining code review recommendations
- **stage2**: Address code review findings for reliability improvements
- **stage2**: Improve Docling session retry and add fallback extraction
- **tests**: Clean up broken unit tests and improve test stability

---

_This release was automatically generated from 11 commits._

## v0.28.45

_Released on 2026-01-30_

### ✨ New Features

- **web**: Complete code review improvements for course data updates

### 🔧 Improvements

- **web**: Standardize logging and add structure change detection (L2, M3)

### 🐛 Bug Fixes

- **course-gen-platform**: Update 2 source file(s)
- **CI/CD**: Reduce unit tests timeout to 5min
- **CI/CD**: Add always() to downstream jobs for workflow-level cancellation
- **web**: Address code review issues for course data update
- **CI/CD**: Update test job dependencies to allow cancelled unit tests
- **web**: UI now updates after course data changes (Stage 4/5)
- **CI/CD**: Allow unit tests timeout in CI Success gate
- **CI/CD**: Add continue-on-error for unit tests (hanging process issue)
- **CI/CD**: Mock Redis in unit tests to prevent hanging
- **CI/CD**: Remove Redis from unit tests
- **CI/CD**: Fix poller tests and increase unit test timeout
- **CI/CD**: Add teardown for unit tests to close Redis
- **CI/CD**: Separate vitest config for unit tests
- **CI/CD**: Run contract tests sequentially after unit tests
- **CI/CD**: Use real secrets for contract and integration tests
- **CI/CD**: Add env vars for contract and integration tests
- **CI/CD**: Add Redis service for test jobs
- **CI/CD**: Add course-gen-platform build before tests

---

_This release was automatically generated from 28 commits._

## v0.28.44

_Released on 2026-01-30_

### ✨ New Features

- **CI/CD**: Implement tiered testing strategy
- **admin**: Persist log filters in URL params
- **i18n**: Migrate CascadeStageDeleteModal to next-intl
- **Skills**: Add documentation check to /work skill
- **Skills**: Add /work skill for task management

### 🔒 Security

- Remove unused debug and test endpoints

---

_This release was automatically generated from 20 commits._

## v0.28.43

_Released on 2026-01-30_

### ✨ New Features

- **clarifying**: Improve UX - move skip button to navigation, show continue only when complete

### 🔧 Improvements

- **clarifying**: Simplify to 1 round, increase max questions to 14

### 🐛 Bug Fixes

- **clarifying**: Address code review findings HIGH-001, HIGH-002, MED-001, MED-002

---

_This release was automatically generated from 10 commits._

## v0.28.42

_Released on 2026-01-29_

### ✨ New Features

- **course-gen-platform**: Add 3 source file(s), update 14 source file(s), +1 more
- **chat**: Add inline feedback messages after applyProposal
- **benchmarks**: Integrate SampleContentViewer into ranking table
- **benchmarks**: Implement test-model command and sample content viewer
- **benchmarks**: Add point-based scoring methodology and LLM quality tester skill
- **benchmarks**: Add scenario/date filters and expandable rows
- **web**: Add public /benchmarks page for LLM model rankings
- **refinement-chat**: Add default mode selection and tooltips
- **prompts**: Add forbidden_patterns section to stage6_serial_generator
- **chat**: Implement remaining code review recommendations
- **chat**: Implement Confirm-then-Apply flow for Stages 4, 5, 6
- **admin/logs**: Add course column to grouped view
- **logger**: Add auto-mute rules for expected errors

### 🔧 Improvements

- **prompts**: Soften cliché prevention approach
- **clarifying**: Code review LOW priority improvements

### 🐛 Bug Fixes

- **stage4**: Prevent duplicate clarifying questions generation
- **Interface**: Correctly show deduplicated documents as completed in Stage 2
- **benchmarks**: Sync scoring criteria across all documents
- **graph**: Add answeredCount/questionsCount to shallow compare
- **stage5**: SetAtPath now correctly handles array access on object properties
- **clarifying**: Update node counter without page refresh
- **style-prompts**: Update conversational and research styles to avoid rhetorical clichés
- **refinement**: Remove AbortSignal from server action and add localStorage safety
- Pass missing proposalError and retryProposal props
- Additional self-review fixes
- **hooks**: Add isMountedRef check to acceptProposal
- **chat**: Address P1 and P2 bugs from code review
- **server-actions**: Remove AbortSignal parameters to fix serialization error
- **query-client**: Add 'use client' directive
- **refinement**: Allow refinement chat for phase-based nodes (Stage 4, 5, 6)
- **clarifying**: Address code review findings for TanStack Query migration
- **clarifying**: Migrate to @tanstack/react-query for proper cache sync
- **clarifying**: Generate questions without documents + one-click accept
- **clarifying**: Invalidate getProgress cache during polling
- **clarifying**: Invalidate getProgress cache to update node in graph
- **docker**: Add NEXT_PUBLIC_COURSEGEN_BACKEND_URL to Dockerfile
- **clarifying**: Invalidate cache after bulk accept recommendations
- **clarifying**: Use rounded-sm for multi-choice checkboxes
- **clarifying**: Remove dark mode navigation bar artifact
- **clarifying**: Invalidate cache before refetch in polling
- **clarifying**: Poll for questions when cache empty + fix progress on skip
- **admin/logs**: List view now shows all new errors
- **Database**: Add stage_1 and stage_7 to generation_trace constraint
- **llm**: Migrate from xiaomi/mimo-v2-flash:free to paid version
- **fsm**: Allow stage_4_clarifying → stage_4_analyzing transition

---

_This release was automatically generated from 84 commits._

## v0.28.41

_Released on 2026-01-27_

### ✨ New Features

- Add 1 skill(s), update docs
- **clarifying**: Implement Wizard UI layout for Stage 4
- **mocks**: Add theme toggle and AppThemeProvider support
- **clarifying-redesign**: Add mock comparison page for Stage 4 UI redesign
- **trace-logger**: Add logTrace() to Stages 1 and 3 for Admin Monitor visibility
- **lifecycle**: Add logTrace for Stage 2 skip path
- **clarifying**: Add custom input for single/multi choice questions + MissionControlBanner clarifying mode
- **clarifying**: Add ClarifyingBanner component with progress tracking
- **Database**: Add race condition fix, GIN index, and rollback migrations
- **clarifying**: Add multi-type questions support (open, single_choice, multi_choice)
- **errors**: Implement pipeline error class hierarchy

### 🔧 Improvements

- **clarifying**: Simplify QuestionCard styles for minimalist design
- **stage5,stage6**: Use unified safeJSONParse for LLM output

### 🐛 Bug Fixes

- **mocks**: Add middleware exclusion and proper layout for /mocks routes
- **clarifying**: Use staleTime Infinity - questions never change after generation
- **clarifying**: Prevent unwanted refetches causing UI reset during editing
- **clarifying**: Fix useEffect deps array size mismatch error
- **clarifying**: Persist confetti shown state in localStorage
- **clarifying**: Fix infinite loader and confetti showing on every open
- **clarifying**: Force cache invalidation on answer save for immediate UI update
- **clarifying**: Fix multi_choice with custom answer validation + UI update after edit
- **clarifying**: Refetch questions after answer saved
- **clarifying**: Optimistically switch to answered mode after confirm
- **clarifying**: Don't override editing mode in useEffect
- **clarifying**: Fix infinite loop in useEffect
- **clarifying**: Fix UI state sync bugs
- **clarifying**: Code review fixes MEDIUM-002/003/005 + LOW-002
- **clarifying**: Batch endpoint and atomic autoAnswer (HIGH-002, HIGH-003)
- **types**: Replace unsafe any cast with proper JSONB types for clarifying_questions
- **clarifying**: Address code review issues (CRITICAL-003, HIGH-001,004,005, MEDIUM-004,006)
- **clarifying**: Prevent auto-scroll from hijacking user scroll
- **clarifying**: Fix [object Object] display and add selectedSuggestionIndex
- **clarifying**: Add query caching to prevent rate limit spam
- **stage4**: Log ClarifyingQuestionsInterrupt as INFO instead of ERROR
- **errors**: Address code review feedback for pipeline errors
- **Interface**: Show clarifying node fallback when status is stage_4_clarifying
- **stage4**: Preserve stage_4_clarifying status on AWAITING_CLARIFYING_ANSWERS
- **stage4**: Prevent retry loop for AWAITING_CLARIFYING_ANSWERS + add JSON repair

---

_This release was automatically generated from 63 commits._

## v0.28.40

_Released on 2026-01-26_

### ✨ New Features

- **web**: Add clarifying questions info to StageResultsPreview
- **backend**: Add dev:worker:stage6 script for Stage 6 worker
- **stage4**: Add self-reflection auto-answer in automatic mode

### 🐛 Bug Fixes

- **web**: Update 4 source file(s), update MCP configs, +3 more
- **stage4**: Classify AbortError as LLM_ERROR for proper retry
- **stage4**: Prevent BullMQ retry for AWAITING_CLARIFYING_ANSWERS
- **graph**: Connect clarifying node from Stage 4 bottom handle
- **graph**: Position clarifying node BELOW Stage 4
- **stage4**: Increase clarifying LLM timeout to 5 minutes
- **web**: Position clarifying node as side branch below Stage 4
- **Database**: Add stage_4_clarifying status to FSM
- **web**: Add pipelineStatus param to useDocumentsWithStatus
- **web**: Fix Clarifying Questions node display and auto-open issues
- **web**: Prevent rate limit for clarifying.getProgress
- **dev**: Add Stage 6 worker to start-dev.sh
- **web**: Improve error handling in RealtimeProvider
- **API**: Revert to simple JSON format for restart-stage tRPC call
- **API**: Use tRPC batch format for restart-stage endpoint
- **API**: Correct tRPC endpoint path for restart-stage
- **web**: Resolve ESLint errors in NodeDetailsDrawer
- **web**: Resolve 405 error and hydration warnings in restart-stage
- **stage4**: Address medium/low code review findings
- **stage4**: Address code review findings for self-reflection
- **web**: Use correct tRPC GET input format in getChatTokenEstimates
- **i18n**: Use correct ICU interpolation format {var} instead of {{var}}
- **config**: Switch xiaomi/mimo-v2-flash from free to paid tier

---

_This release was automatically generated from 31 commits._

## v0.28.39

_Released on 2026-01-26_

### 🔧 Improvements

- **web**: P3.3 migrate i18n from GRAPH_TRANSLATIONS to next-intl

### 🐛 Bug Fixes

- **shared-types**: Update 1 source file(s), update docs
- **web**: TypeScript errors in P3.3 i18n migration
- **web**: P3 code review fixes + course regeneration flow

---

_This release was automatically generated from 6 commits._

## v0.28.38

_Released on 2026-01-25_

### ✨ New Features

- **stage4**: Phase 0.5 security and reliability improvements
- **stage4**: Implement Phase 0.5 Clarifying Questions
- **chat**: Require intent selection before send + Stage 6 inline editing

### 🔧 Improvements

- **hooks**: Extract useFieldStatusTracking and useCascadeStageDelete

### 🐛 Bug Fixes

- **stage4**: Change clarifying fallback to Gemini 3 Flash
- **stage4**: Fix clarifying config stage_number and swap models
- **stage4**: Phase 0.5 final improvements from code review
- **stage4**: Phase 0.5 backlog improvements
- **stage4**: Phase 0.5 Clarifying Questions - critical fixes Phase 2
- **stage4**: Critical fixes for Phase 0.5 Clarifying Questions
- **chat**: Code review fixes - P1-P3 improvements
- **chat**: Code review fixes for cascade and auth
- **chat**: Resolve 401/404 errors and add cascade stage deletion
- **share**: Update Share API URL to new [orgSlug]/[courseSlug] format
- **urls**: Fix API routes and add code review report
- **web**: Remove fallback to old URLs in viewer components
- **media**: Fix 404 on progress API and add polling for image generation
- **urls**: Update course URLs to new format /courses/{org}/{course}
- **Authentication**: Add superadmin role and public course access for anon users
- **web**: Keep hover panel visible when visibility dropdown is open
- **Authentication**: Add role-based authorization for course operations
- **web**: Fix courseSlug param name in remaining graph components
- **web**: Approval button not showing on Stage 5

---

_This release was automatically generated from 48 commits._

## v0.28.37

_Released on 2026-01-24_

### 🐛 Bug Fixes

- **deploy**: Add docling-mcp image check before deploy
- **admin/logs**: Default to status='new' in list view
- **deploy**: Add automatic Docker cleanup after each deploy
- **graph**: Auto-refresh UI when stage reaches awaiting_approval
- **infra**: Add uploads-dev mount to docling and BARRIER_FAILED enum
- **changelog**: Sort versions in correct descending order

---

_This release was automatically generated from 11 commits._

## v0.28.36

_Released on 2026-01-24_

### 🐛 Bug Fixes

- **slug**: Prevent suffix truncation in generateSlug

---

_This release was automatically generated from 3 commits._

## v0.28.35

_Released on 2026-01-24_

### ✨ New Features

- **stage5**: Make tier1 and escalation models configurable via admin panel
- **i18n**: Add i18n support for quick action prompts in GlobalCourseChat
- **llm**: Upgrade stage_4_expert, stage_4_synthesis, stage_5_metadata to KIMI K2
- **routes**: Migrate course URLs to /courses/{org}/{course}
- **chat**: Replace keyword classification with explicit UI mode selection
- **chat**: Add authenticated Supabase client and rate limiting
- **chat**: Add conversation history to LLM prompts
- **form**: Add frontend validation limits for course creation

### 🔧 Improvements

- **chat**: Code review improvements - type guards, constants, utilities, a11y
- **chat**: Configurable fallback model and extract magic numbers

### 🐛 Bug Fixes

- **web**: Update 1 source file(s), update docs
- **routes**: Complete URL migration with full sanitization
- **routes**: Remove legacy [slug] routes and add slug validation
- **chat**: Address code review findings for intent selection
- **llm**: Update fallback to google/gemini-3-flash-preview for premium phases
- **tests**: Update section-batch-generator tests for current implementation
- Duplicate key violation and FSM transition errors
- **web**: Add Zod validation and HTTP error mapping to chat server action
- **stage5**: Address code review issues for constraints implementation
- **chat**: Address code review findings
- **chat**: Fix race condition in GlobalCourseChat and add error boundary
- **stage5**: Respect Stage 4 user-edited constraints (total_lessons, total_sections)
- **migrations**: Remove duplicate course_chat_messages migration

---

_This release was automatically generated from 46 commits._

## v0.28.34

_Released on 2026-01-24_

### ✨ New Features

- **course-gen-platform**: Add 1 source file(s), update 3 source file(s), +1 more

### 🐛 Bug Fixes

- **generation**: Use all form fields in course generation prompts

---

_This release was automatically generated from 2 commits._

## v0.28.33

_Released on 2026-01-23_

### ✨ New Features

- **types**: Add TypeScript types for GenerationProgress
- **stage3**: Auto-assign CORE priority for single document
- **web**: Add navigation to lessons page (Toolbar + Sidebar)

### 🔧 Improvements

- **locks**: Extract lock pattern to shared utility

### 🐛 Bug Fixes

- **generation**: Stage 3 now runs for deduplicated documents
- **web**: Use vector_status for document processing status
- **stage2**: Enhance filePath validation for empty strings
- **stage2**: Add filePath validation before document processing
- **stage6**: Sync generation_progress.steps[] on completion
- **locks**: Remove double releaseLock in Stage 4 and Stage 5 handlers
- **nginx**: Add rewrite for /api/trpc to /trpc

---

_This release was automatically generated from 25 commits._

## v0.28.32

_Released on 2026-01-23_

---

_This release was automatically generated from 1 commits._

## v0.28.31

_Released on 2026-01-23_

### 🐛 Bug Fixes

- **cover**: Use 21:9 cinematic ratio in lightbox preview

---

_This release was automatically generated from 1 commits._

## v0.28.30

_Released on 2026-01-23_

### ✨ New Features

- **cover**: Switch to 21:9 cinematic aspect ratio for lesson covers

---

_This release was automatically generated from 1 commits._

## v0.28.29

_Released on 2026-01-23_

### ✨ New Features

- **web**: Expand rotating status messages with type-specific content

### 🐛 Bug Fixes

- **web**: Update 15 source file(s), update docs

---

_This release was automatically generated from 2 commits._

## v0.28.28

_Released on 2026-01-23_

### ✨ New Features

- **web**: Smooth image loading with skeleton placeholders
- **enrichments**: Fix cover/banner generation UX - show variant selection at draft_ready
- **web**: Improve EnrichmentGeneratingCard with shimmer and rotating messages
- Add asymptotic crawl to useSmoothProgress hook
- Add Next.js rewrite for local enrichments proxy
- **storage**: Add unified storage service with auto-backend switching
- **scripts**: Enhance migration script with safety features
- **storage**: Migrate enrichment images from Supabase to local storage

### 🔧 Improvements

- **cover**: Remove two-stage dead code from CoverPreview
- **enrichments**: Simplify cover/banner to single-stage generation
- Improve enrichment handlers and add nginx rate limiting

### 🔒 Security

- Fix critical vulnerabilities in local-storage-service

### 🐛 Bug Fixes

- **enrichments**: Remove dead approveCoverDraft code
- **web**: Resolve CSP error for enrichment generation in production
- Move nginx configs to deploy/nginx as single source of truth
- **Database**: Remove unused tables and fix performance warnings
- **enrichment**: Reuse cancelled/failed enrichments for regeneration
- **enrichment**: Allow cancelling draft_ready enrichments and fix resume race condition
- **Database**: Complete Supabase security and performance optimizations
- **web**: Replace missing /api/auth/me endpoint with useAuth hook
- **Database**: Apply Supabase performance and security optimizations
- Security vulnerabilities and code cleanup (mc2-wisp-157)

---

_This release was automatically generated from 48 commits._

## v0.28.27

_Released on 2026-01-22_

### ✨ New Features

- **logger**: Add type guards, discriminated unions, and usage guide
- **logger**: Add centralized domain-specific logging architecture

### 🔧 Improvements

- **validation**: Improve logging and type safety in validation-orchestrator

### 🐛 Bug Fixes

- **enrichments**: Address code review MEDIUM/LOW priority issues
- **enrichments**: Address code review HIGH priority issues
- **enrichments**: Restore generation progress on page reload
- **logger**: Address HIGH priority code review findings
- **logging**: Improve LLM error logging and add TTL timeout auto-mute

---

_This release was automatically generated from 20 commits._

## v0.28.26

_Released on 2026-01-22_

### ✨ New Features

- **enrichment**: Add grayscale placeholder with hover color reveal

### 🔧 Improvements

- Fix CPU/memory issues in course generation page
- **template-whitelist**: Optimize Helm function matching with Set lookup

### 🐛 Bug Fixes

- **web**: Update 4 source file(s), update docs
- Address code review issues for performance optimization
- Sprint bug fixes - template whitelist, patcher retry, banner flow, status validation

---

_This release was automatically generated from 18 commits._

## v0.28.25

_Released on 2026-01-22_

### ✨ New Features

- **lessons**: Add progress card to lessons page header
- **#14**: Add parameter flow dashboard with real-time updates
- **lessons**: Add course lessons page with cards grid
- **#16**: Add course edit history for diff view
- **demo**: Add placeholder vs generated comparison page
- **logging**: Add parameter tracking and validation logging (#12, #13)
- **a11y**: Implement keyboard navigation for generation graph UI
- **Skills**: Add /process-issues skill for GitHub Issues workflow

### 🔧 Improvements

- **enrichment**: Unify all 6 cards into single grid section

### 🐛 Bug Fixes

- **web**: Update 1 source file(s), update 5 test(s), +1 more
- **lessons**: Address code review issues for lessons page
- **progress**: Address code review findings for Stage 6 progress bar
- **code-review**: Address P1 and P2 issues from review
- **progress**: Update percentage during Stage 6 lesson generation
- **generation-graph**: Implement GitHub Issues #10, #11, #17
- **enrichment**: Resolve cover/banner generation issues
- **enrichment**: Unify grid layout for all enrichment cards
- **pipeline**: Implement per-field save status and fix type compatibility

---

_This release was automatically generated from 36 commits._

## v0.28.24

_Released on 2026-01-22_

### ✨ New Features

- **types**: Add Zod validation for AnalysisResult type
- **enrichments**: Unify placeholder cards to Hover Reveal style
- **pipeline**: Pass user-edited params between stages

### 🔧 Improvements

- **enrichment**: Split UnifiedEnrichmentCard into subcomponents
- **enrichment**: P3 improvements - extract LabelWithTooltip, use type guards

### 🐛 Bug Fixes

- **pipeline**: Persist Stage 4 edits and show per-field save status
- **enrichments**: Address code review issues for UnifiedEnrichmentCard

---

_This release was automatically generated from 16 commits._

## v0.28.23

_Released on 2026-01-21_

### ✨ New Features

- **file-upload**: Implement tier-based file limits with upgrade suggestions
- **Interface**: Add glassmorphism for course cards with light/dark theme support
- **visuals**: Add lesson card (1:1) generation to Media section

### 🔧 Improvements

- **course-viewer**: Open course in new tab for instant navigation

### 🐛 Bug Fixes

- **stage6**: Suppress false RAG warning for courses without documents
- **stage5**: Whitelist Helm/Go template syntax in placeholder validator (RT-008)
- **deploy**: Explicitly remove dev containers before recreate
- **admin-logs**: Align list view status=new filter with grouped view logic
- **logs**: Increase file upload limit + add Redis reconnect auto-mute
- **logs+qdrant**: Improve error handling for transient failures
- **docker**: Permanent fix for Redis DNS failure
- **ui+pipeline**: Improve badge contrast and save target_audience in Stage 4
- **i18n**: Add missing video.estimatedTime and improve cover/card descriptions
- **images**: Use Next.js optimizer instead of Supabase render
- **visuals**: Address code review issues for lesson cards media

---

_This release was automatically generated from 40 commits._

## v0.28.22

_Released on 2026-01-21_

### ✨ New Features

- **courses**: Integrate course cover images into UI
- **redis**: Add graceful shutdown coordination with BullMQ workers

### 🐛 Bug Fixes

- **generation**: Add token validation warnings and pause delay tracking
- **generation**: Address code review findings for pause/stop/resume
- **redis**: Improve retry strategy with graceful shutdown and health monitoring
- **generation**: Make pause/stop/resume controls work correctly
- **redis**: Exit process after extended connection failure (~20 min)
- **redis**: Never give up on reconnection, use exponential backoff

---

_This release was automatically generated from 23 commits._

## v0.28.21

_Released on 2026-01-21_

### ✨ New Features

- **scripts**: Add full lesson A/B test with Mermaid generation
- **Database**: Add trigger to auto-reopen resolved errors on recurrence
- **scripts**: Add validation script for existing lesson content
- **scripts**: Improve A/B test script for lesson generation
- **stage6**: Comprehensive content quality validation

### 🐛 Bug Fixes

- **scripts**: Correct Xiaomi model ID in Stage 6 quality tests
- **stage6**: Add null checks to prevent TypeError in formatInterLessonContextXML
- **scripts**: Add dotenv import to test-lesson-generation
- **mermaid**: Improve dark mode contrast for edge labels and text

---

_This release was automatically generated from 15 commits._

## v0.28.20

_Released on 2026-01-20_

### ✨ New Features

- **llm**: Add hardcoded fallback for Model Config Service

### 🐛 Bug Fixes

- **web**: Use i18n Link for correct SPA navigation
- **stage2**: Add courseId to Phase 6 summarization error logs

---

_This release was automatically generated from 6 commits._

## v0.28.19

_Released on 2026-01-20_

### ✨ New Features

- **logger**: Add auto-mute rules for deploy-related errors

### 🐛 Bug Fixes

- **stage7**: Use || instead of ?? for empty string handling in card prompts
- **web**: Fix Link+Button nesting issues across generation-graph
- **web**: Fix navigation in EndNodePanel "Open Course" button
- **stage6**: Fix TypeScript types in checkAndSetStage6Complete

---

_This release was automatically generated from 7 commits._

## v0.28.18

_Released on 2026-01-20_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 1 source file(s), update docs
- **generation-graph**: Correct course_size and notifications display on progress page
- **docker**: Add BULLMQ_STAGE7_QUEUE_NAME to worker-dev for Stage 7 queue isolation

---

_This release was automatically generated from 6 commits._

## v0.28.17

_Released on 2026-01-20_

### 🐛 Bug Fixes

- **web**: Update 1 source file(s), update docs
- **docker**: Add BULLMQ_STAGE6_QUEUE_NAME to worker-dev for Stage 6 queue isolation

---

_This release was automatically generated from 5 commits._

## v0.28.16

_Released on 2026-01-20_

### ✨ New Features

- **web**: Persist all form settings to localStorage
- **web**: Replace upload progress bar with fullscreen overlay modal
- **web**: Add file upload progress bar on course creation

### 🔧 Improvements

- **stage4**: Remove Phase 6 RAG Planning
- **web**: Unify toast notifications to use Sonner
- **create-course**: Reorganize form with GenerationSettingsSection

### 🐛 Bug Fixes

- **upload-overlay**: Prevent layout shift when switching files
- **model-config**: Update stage_number Zod constraint from max(6) to max(7)
- **i18n**: Persist selected language in user settings
- **deploy**: Remove redundant env var from docker-compose
- **deploy**: Add NEXT_SERVER_ACTIONS_ENCRYPTION_KEY for persistent Server Actions
- **docker**: Add uploads-dev mount to docling-mcp for dev environment

---

_This release was automatically generated from 33 commits._

## v0.28.15

_Released on 2026-01-20_

### ✨ New Features

- **web**: Add 5 source file(s), update 8 source file(s), +1 more
- **create-course**: Reorganize UI/UX for course creation form
- **i18n**: Add image generation translations for enrichments

### 🐛 Bug Fixes

- **docker**: Add DOCLING_UPLOADS_BASE_PATH override for document processing
- **web**: Fix type-check by excluding tests from tsconfig
- **stage6**: Add dedicated worker service and queue isolation for dev

---

_This release was automatically generated from 9 commits._

## v0.28.14

_Released on 2026-01-20_

### ✨ New Features

- **image-gen**: Add quality parameter for GPT-5 Image Mini cost optimization
- **stage6**: Add person and case agreement grammar rules for Russian

### 🐛 Bug Fixes

- **enrichments**: Disable auto lesson card/cover generation
- **admin/logs**: Fix status filter not working in flat view
- **Stage4**: Pass course_size via job data to avoid race condition
- **Stage5**: Use 'intermediate' as default difficulty instead of undefined
- **skill**: Dev server errors should be investigated, not bulk resolved

---

_This release was automatically generated from 16 commits._

## v0.28.14

_Released on 2026-01-20_

### ✨ New Features

- **image-gen**: Add quality parameter for GPT-5 Image Mini cost optimization
- **stage6**: Add person and case agreement grammar rules for Russian

### 🐛 Bug Fixes

- **admin/logs**: Fix status filter not working in flat view
- **Stage4**: Pass course_size via job data to avoid race condition
- **Stage5**: Use 'intermediate' as default difficulty instead of undefined
- **skill**: Dev server errors should be investigated, not bulk resolved

---

_This release was automatically generated from 14 commits._

## v0.28.13

_Released on 2026-01-19_

### ✨ New Features

- **stage6**: Route auto-approval jobs to dedicated queue
- **stage6**: Activate dedicated queue with 30 concurrent workers

### 🐛 Bug Fixes

- **orchestrator**: Support snake_case in job cleanup logic
- **orchestrator**: Support snake_case job data fields in queue-events-backup
- **orchestrator**: Prevent attempts exceeding max_attempts constraint violation

---

_This release was automatically generated from 10 commits._

## v0.28.12

_Released on 2026-01-19_

### ✨ New Features

- **course-gen-platform**: Add 1 source file(s), update docs
- **stage5**: Dynamic min/max lessons validation from course_size presets

### 🐛 Bug Fixes

- **stage2**: Add hardcoded fallback for model config in Phase 6
- **stage2**: Store fallback processed_content on summarization failure
- **auto-approval**: Correct FSM transitions for automatic mode
- **course-size**: Remove hardcoded min 10 lessons from CourseStructureSchema
- **auto-approval**: Correct status suffix for all stages + release locks early
- **stage2**: Handle SandboxedJob missing getState() method
- **phase-2**: Respect course_size preset constraints (MICRO/MINI/COMPACT)
- **docling**: Transform local paths to container paths for Docker

---

_This release was automatically generated from 19 commits._

## v0.28.11

_Released on 2026-01-19_

### ✨ New Features

- **course-gen-platform**: Add 1 source file(s), update 2 source file(s)

### 🐛 Bug Fixes

- **stage4**: Respect course_size constraints for MICRO/MINI/COMPACT (mc2-usg3)
- **pipeline**: Comprehensive Stage 5 retry and placeholder handling

---

_This release was automatically generated from 7 commits._

## v0.28.10

_Released on 2026-01-19_

### ✨ New Features

- **course-gen-platform**: Add 1 source file(s), update 8 source file(s), +3 more
- **stage5**: Remove redundant fields to save ~10K-15K tokens per course
- **stage5**: Add auto-approval support for automatic generation mode
- **course-gen**: Add E2E test for automatic mode express generation
- **auto-approval**: Add case 6 for Stage 6 lesson content generation
- **processor**: Add bundle monitoring, health check, and docs
- **logger**: Add auto-mute rules for job lifecycle warnings

### 🔧 Improvements

- **stage4**: Parallelize Phase 3 and Phase 6 execution
- **stage4**: Remove conflicting pedagogical_strategy fields
- **stage4-5**: Eliminate over-engineering and fix bugs

### 🐛 Bug Fixes

- **stage5**: Update JSDoc and fix test import path
- **stage4**: Remove conflicting pedagogical_strategy fields from Phase 3
- **auto-approval**: Address code review issues CR-001 through CR-015
- **course-gen**: Repair JSON parsing and validation failures
- **auto-approval**: Add two-step FSM transition for automatic mode
- **web**: Image loader width param and logo aspect ratio
- **processor**: Bundle with tsup for BullMQ ESM compatibility
- **deploy**: Add orphan container cleanup before dev deploy
- **logs**: Return status from RPC to fix filter mismatch
- **processor**: Add missing .js extension to error-service import

---

_This release was automatically generated from 46 commits._

## v0.28.9

_Released on 2026-01-18_

### ✨ New Features

- Add 1 agent(s)

### 🐛 Bug Fixes

- **Stage5**: Validate style against enum before Zod validation
- **Stage5**: Handle null DB fields in frontend_parameters validation

---

_This release was automatically generated from 10 commits._

## v0.28.8

_Released on 2026-01-18_

### ✨ New Features

- **GenerationProgress**: Auto-start generation in automatic mode
- **generation**: Merge automatic and semi-automatic control panels into unified MissionControlBanner

### 🐛 Bug Fixes

- **GenerationProgress**: Pause/resume now updates UI in real-time
- **GraphHeader**: Show fingerprint button with courseId fallback when generationCode is null
- **MissionControlBanner**: Address code review P1-P2 issues
- **worker**: Log errors to DB inside sandbox before stack trace is lost

---

_This release was automatically generated from 14 commits._

## v0.28.7

_Released on 2026-01-17_

### 🐛 Bug Fixes

- **admin-logs**: List view now considers fingerprint-based status
- **web**: Prevent profile learning_style from overriding user's form selection

---

_This release was automatically generated from 4 commits._

## v0.28.6

_Released on 2026-01-17_

### ✨ New Features

- **course-viewer**: Add deep-linking, breadcrumbs, and server progress sync
- **orchestrator**: Add processor health check, TTL timeout, and Stage 6 JobResult wrapper

### 🐛 Bug Fixes

- **web**: Update 2 source file(s)
- **logger**: Use upsert for duplicate problem_id in error logging
- **processor**: Resolve ESM directory import error in sandboxed processor
- **course-viewer**: Complete remaining code review fixes CR-005 through CR-022
- **course-viewer**: Address code review issues CR-001 through CR-018
- **a11y**: Add ARIA labels and null checks to BreadcrumbNav
- **orchestrator**: Improve sandboxed processor type safety and reliability

---

_This release was automatically generated from 20 commits._

## v0.28.5

_Released on 2026-01-17_

### ✨ New Features

- **course-gen-platform**: Add 1 source file(s), update 1 source file(s)

### 🐛 Bug Fixes

- **web**: Allow micro course size in validation schema

---

_This release was automatically generated from 3 commits._

## v0.28.4

_Released on 2026-01-17_

### ✨ New Features

- **Interface**: Add missing user settings to Stage 1 Input Tab
- **export**: Implement module lessons export as Markdown
- **Database**: Add trigger to auto-sync fingerprint in log_issue_status

### 🔧 Improvements

- **Interface**: DRY Stage2Group with utility functions + accessibility
- Code quality improvements from review (P2.4, P3.2-P3.6)
- **logging**: Address code review findings for auto_muted

### 🐛 Bug Fixes

- **course-gen-platform**: Update 3 source file(s), update 1 agent(s), +3 more
- **types**: Add type casts in NodeDetailsDrawer for Stage props
- **generation**: Save generation_mode from form + display writing style on Stage 4
- **Interface**: Complete Stage2Group skipped styling from code review
- **Interface**: Add strikethrough style to Stage2Group when skipped
- **export**: Security and performance improvements from code review
- **Interface**: Resolve single-click/double-click UX conflict in ModuleGroup
- Add concurrency limiter for Jina API and job.name validation
- **stage5**: Remove partial-regen layer and add lock cleanup
- **stage5**: Prevent infinite retry loop and fix validation errors

---

_This release was automatically generated from 38 commits._

## v0.28.3

_Released on 2026-01-16_

### ✨ New Features

- **logging**: Add auto_muted status for expected errors
- **lesson-approval**: Add migration and tests for batch approval RPC
- **stage4**: Add course_description and learning_outcomes to analysis input
- **admin**: Add error log grouping by fingerprint
- **generation**: добавить difficulty в Stage 5 FrontendParameters
- **enrichments**: Add optimistic UI + improve error messages
- **pipeline**: Add language support to Stage 4-5 model selection
- **logs**: Add full-text search for similar problems v1.5.0

### 🔧 Improvements

- **stage4**: Remove unused answers field
- **target_audience**: Unify data source to courses.target_audience column
- **llm**: Add actualLanguage tracking, LanguageCode type, language detection

### 🐛 Bug Fixes

- **shared-types**: Update 4 source file(s), update 1 agent(s), +2 more
- **logs**: Implement server-side grouping with RPC + code review fixes
- **stage4**: Use actual target_audience from DB instead of hardcoded value
- **generation**: передавать course_size и description в Input стадии 5
- **logs**: Improve PostgrestError logging with full error details
- **web**: Navigation sheet not working in fullscreen mode
- **enrichment**: Address code review issues #5-#7
- **enrichments**: Address code review findings
- **web**: Cleanup unused type and debug comment in EnrichmentsPanel refactoring

---

_This release was automatically generated from 49 commits._

## v0.28.2

_Released on 2026-01-15_

### ✨ New Features

- **Skills**: Add process-logs skill for automated error log processing
- **logging**: Enhance error logging with full diagnostic context

### 🐛 Bug Fixes

- **stage6**: Rename generator.ts to avoid ESM directory conflict

---

_This release was automatically generated from 9 commits._

## v0.28.1

_Released on 2026-01-15_

### ✨ New Features

- **admin-logs**: Show course name and workflow link in logs table
- **course-size**: Add 'micro' size option and show lesson ranges

### 🔧 Improvements

- **stage6**: Modularize lesson-rag-retriever.ts
- **stage6**: Modularize orchestrator.ts into nodes and helpers
- **Interface**: Move generation mode to advanced settings section

### 🐛 Bug Fixes

- **stage6**: Resolve circular dependency in orchestrator
- Remove unused LessonGraphNode import in judge-node.ts
- **stage5**: Show both content and teaching styles in blueprint preview
- **stage5**: Show user-selected style instead of LLM analysis style
- **stage5**: Show exact lesson count instead of fake range
- **stage6**: Fix lessons.content query and add warn/error DB logging

---

_This release was automatically generated from 19 commits._

## v0.28.0

_Released on 2026-01-15_

### ✨ New Features

- **logging**: Add generationCode to worker logs
- **styles**: Add 7 new course styles
- **monitoring**: Add Telegram bot health check to admin dashboard

### 🔧 Improvements

- **stage6**: Address code review findings for style propagation
- **styles**: Reduce course styles from 19 to 12

### 🐛 Bug Fixes

- **RT-007**: Use word boundaries in hasNonMeasurableVerb
- **types**: Cast course.style to CourseStyle type
- **stage4**: Remove size hints from AUTO mode prompt
- **stage4**: Add explicit AUTO mode guidance for course size determination
- **stage4**: Enforce course size as mandatory constraint with ±20% tolerance
- **admin-logs**: Implement status filter functionality
- **stage6**: Improve style field validation and error handling
- **stage4**: Reduce motivators min length from 100 to 50 chars
- **stage5**: Make TODO pattern case-sensitive
- **styles**: Add 'microlearning' course style
- **stage6**: Pass course style to lesson content generation

---

_This release was automatically generated from 39 commits._

## v0.27.11

_Released on 2026-01-14_

### ✨ New Features

- **telegram**: Add webhook handler for bot commands
- **profile**: Add Telegram notification settings section
- **shared-types**: Add i18n UI labels for CourseSizeSelector
- **web**: Add form validation for courseSize/estimatedLessons dependency
- **course-size**: Add 'auto' option as default selection
- **course-size**: Add course size presets (mini/compact/standard/comprehensive)

### 🔧 Improvements

- **profile**: Simplify Telegram connection with Login Widget

### 🐛 Bug Fixes

- **types**: Resolve TypeScript build errors
- **lint**: Resolve remaining ESLint errors in web package
- **lint**: Resolve all ESLint errors across packages
- **course-size**: Address code review findings

---

_This release was automatically generated from 24 commits._

## v0.27.10

_Released on 2026-01-14_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 2 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.27.9

_Released on 2026-01-14_

### ✨ New Features

- **course-gen-platform**: Add 2 source file(s), update 7 source file(s), +1 more
- **graph**: Add readOnly prop for automatic generation mode
- **notifications**: Add stage completion notifications to stages 2-4
- **generation**: Integrate AutomaticModeControlPanel into generation progress page

---

_This release was automatically generated from 7 commits._

## v0.27.8

_Released on 2026-01-14_

### ✨ New Features

- **generation**: Add automatic generation mode with auto-approval
- Add notification services for automatic generation mode
- **web**: Add generation mode UI components to course creation form

### 🐛 Bug Fixes

- **course-gen-platform**: Update 1 source file(s)
- **stage6**: Send completion notifications when all lessons generated

---

_This release was automatically generated from 6 commits._

## v0.27.7

_Released on 2026-01-14_

### ✨ New Features

- **generation**: Complete pause/stop code review improvements
- **generation**: Add pause/resume/stop controls for course generation
- **stage6**: Add stage_6 status transitions in backend
- **Database**: Add stage_6 enum values to generation_status
- **enrichments**: Implement on-demand generation from course viewer

### 🔧 Improvements

- **config**: Move LKG config from .tmp/ to .local/
- **Database**: Cleanup unused lesson content structures
- **config**: Convert require() to ES imports in next.config.ts

### 🐛 Bug Fixes

- **web**: Show Stage 6 spinner only when actively generating
- **stage6,stage7**: Align database queries with lesson_contents table
- **generation**: Address code review issues for pause/stop feature
- Comprehensive health check - fix all vulnerabilities and bugs
- **workflow**: Stage 4/5 phases now display lazy-loaded trace data
- **web**: Health check - fix React hooks violations and code quality issues
- **tools**: Fix PostgREST query in retrigger-enrichments script
- **stage7**: Fix enrichment creation and lesson query issues
- **pwa**: Correct cleanUpOutdatedCaches typo
- **stage7**: Fix course card constraint and enrichment triggers
- **stage7**: Correct lessons query in triggerCourseCard and triggerAllLessonCovers
- **web**: Convert require to ES imports and prevent lint-staged rollback
- **lint**: Resolve ESLint errors and improve code quality
- **logging**: Improve error context with userId capture and metadata standardization
- **enrichments**: Address code review findings for on-demand generation
- **Interface**: Stage 6 progress bar shows real lesson completion percentage
- **generation**: Improve success overlay UX and fix lint errors
- **logging**: Add comprehensive error_logs DB logging to all API routes
- **generation**: Improve success overlay UX
- **admin**: Lazy load trace details for Input/Output Data

---

_This release was automatically generated from 51 commits._

## v0.27.6

_Released on 2026-01-13_

### ✨ New Features

- **viewer**: Add on-demand enrichment placeholder cards UI

### 🐛 Bug Fixes

- **Interface**: Stage 6 UX improvements - hide regenerate, add finalize button
- **Interface**: Fix accordion content clipping when open
- **logging**: Add error_logs DB logging to more API routes
- **admin**: Fix invisible Input Data content in trace viewer
- **logging**: Add error_logs DB logging to BullMQ job failures
- **courses**: Allow superadmin to view workflow of any course
- **Security**: Add SuperAdmin role check for cross-org analytics
- **pipeline**: Skip RAG retrieval for courses without documents

---

_This release was automatically generated from 16 commits._

## v0.27.5

_Released on 2026-01-13_

### ✨ New Features

- **admin**: Add clickable help tooltips for pipeline stages and phases
- **web**: Add error logging to all API routes for admin visibility

### 🐛 Bug Fixes

- **web**: Reduce noisy health check logs

---

_This release was automatically generated from 5 commits._

## v0.27.4

_Released on 2026-01-13_

### 🐛 Bug Fixes

- **web**: Update 2 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.27.3

_Released on 2026-01-13_

### 🐛 Bug Fixes

- **web**: Update 1 source file(s)
- **web**: Add database error logging to admin logs

---

_This release was automatically generated from 3 commits._

## v0.27.2

_Released on 2026-01-13_

### ✨ New Features

- **courses**: Increase course catalog cards from 10 to 12

---

_This release was automatically generated from 1 commits._

## v0.27.1

_Released on 2026-01-13_

### ✨ New Features

- **styles**: Reorder course styles for B2B focus with professional as default

---

_This release was automatically generated from 1 commits._

## v0.27.0

_Released on 2026-01-13_

### ✨ New Features

- **admin**: Replace polling with Supabase Realtime for logs page
- **Database**: Add generation_trace lifecycle management
- **admin**: Enhanced logs page with problem ID, environment, copy button

### 🔧 Improvements

- **admin**: Extract SeverityBadge component

### 🐛 Bug Fixes

- **scripts**: Use temp files instead of pipes in release.sh
- **scripts**: Ignore SIGPIPE to prevent exit 141 in release.sh
- **scripts**: Replace tail with safe_tail_from to avoid SIGPIPE
- **admin**: Move Refresh/Live buttons above filter card
- **admin**: Move Refresh/Live to top row with filters
- **admin**: Move Refresh and Live buttons inside filter card
- **web**: Memory leak on course generation page (4GB RAM, 100% CPU)
- **scripts**: Fix deploy.sh SIGPIPE and non-interactive mode
- **admin**: Prevent infinite loop in logs page refresh
- **admin**: Code review fixes for logs page
- **Authentication**: Remove redundant client-side session refresh
- **scripts**: Improve release.sh auto-commit error handling

---

_This release was automatically generated from 25 commits._

## v0.26.83

_Released on 2026-01-12_

### ✨ New Features

- **worker**: Make BullMQ queue names configurable via env vars
- Add dev environment deployment (dev.ai.megacampus.ru)
- **dx**: Add Husky + lint-staged for pre-commit checks
- **deploy**: Split docker-compose for Blue/Green deployment
- **deploy**: Configure Blue/Green deployment infrastructure
- Add Blue/Green deployment infrastructure
- **beads**: Add directory-labels, exclusive-lock, protected-branches, patrols, molecule-bonds
- Update Blue/Green deployment documentation and add branching strategy RFC
- Add Blue/Green rollback script and update deployment workflow
- Implement Blue/Green deployment strategy with GitHub Actions and Nginx configuration

### 🔧 Improvements

- **styles**: Reorder course styles by popularity
- **admin**: Extract user validators to shared module

### 🐛 Bug Fixes

- **worker**: Increase maxListeners to prevent AbortSignal warning
- **docker**: Create /app/data directory with correct permissions
- **validation**: Add underscore synonyms for primary_strategy and teaching_style
- **deploy**: Add worker services to DEV compose with queue isolation
- **web**: Reduce preloader hang on back navigation
- **deploy**: Don't remove shared infrastructure in dev deploy
- Convert scripts to Unix line endings (LF)
- **lint**: Resolve ESLint errors in admin users components
- **upload**: Increase rate limit and add retry queue for bulk uploads
- **admin**: Allow admins to delete students and instructors
- **admin**: Allow admins to toggle user activation status
- Enable Docker build on develop branch
- **CI/CD**: Verify deployment with correct Blue/Green port
- **deploy**: Add docker login to GHCR before pull
- **scripts**: Make Blue/Green scripts executable
- **deploy**: Update scripts for multi-service Blue/Green
- Improve formatting and clarity in branching strategy documentation
- Update scripts and config to use master instead of main
- **beads**: Restore config.yaml with new features (no duplicates)

---

_This release was automatically generated from 55 commits._

## v0.26.82

_Released on 2026-01-11_

### ✨ New Features

- Add 1 command(s), update scripts, +1 more
- Batch improvements - graceful shutdown, source docs UI, RAG docs
- **embeddings**: Implement token-aware batching for Jina API
- **stage6**: Enable priority boosting and save source_documents attribution
- **rag**: Implement priority-based retrieval and Stage 3 deprecation
- **stage6**: Add RAG relevance validation to generator prompt
- **stage7**: Add 19-language support for image alt text
- **i18n**: Add full 19-language support for lesson content labels
- **stage6**: Add reviewInfo for UI warnings and fix Mermaid parsing
- **Skills**: Add improvements support to code-review-inline v1.1.0
- **Skills**: Add code-review-inline skill with Beads integration
- **beads**: Integrate Beads workflow into all health check skills

### 🐛 Bug Fixes

- Code review improvements - race conditions, validation, memory leaks
- **rag**: Address code review findings for priority-based retrieval
- **stage6**: Resolve ESM module resolution conflict for generator import
- **queue**: Clean up orphaned jobs with missing data during course deletion
- **queue**: Handle undefined jobs in removeJobsByCourseId
- **cleanup**: Add orphaned Redis data cleanup to course deletion
- **queue**: Include prioritized queue in removeJobsByCourseId cleanup
- Add BullMQ job cleanup to course deletion and fix local dev fetch timeout
- **stage6**: Resolve multiple production issues in lesson generation
- **stage6**: Add 19-language support to markdown parser
- **stage6**: Use getContentLabels for section-regenerator titles
- **stage6**: Localize section headers and exercise labels for Russian
- **stage6**: Resolve exercises parsing, factual verification, and sec_global issues
- **stage6**: Resolve multiple production issues in lesson generation

---

_This release was automatically generated from 70 commits._

## v0.26.81

_Released on 2026-01-08_

### ✨ New Features

- **course-gen-platform**: Add 14 source file(s), update 18 source file(s), +5 more

---

_This release was automatically generated from 3 commits._

## v0.26.80

_Released on 2026-01-08_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 28 source file(s), update docs

---

_This release was automatically generated from 1 commits._

## v0.26.79

_Released on 2026-01-07_

### ✨ New Features

- **web**: Add 1 source file(s), update 5 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.78

_Released on 2026-01-07_

### 🐛 Bug Fixes

- **web**: Update 1 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.77

_Released on 2026-01-07_

### 🐛 Bug Fixes

- **web**: Update 2 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.76

_Released on 2026-01-06_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 5 source file(s), update 2 test(s), +2 more

---

_This release was automatically generated from 1 commits._

## v0.26.75

_Released on 2026-01-06_

### 🐛 Bug Fixes

- **web**: Update 13 source file(s), update docs

---

_This release was automatically generated from 2 commits._

## v0.26.74

_Released on 2026-01-06_

### ✨ New Features

- **web**: Add 5 source file(s), update 4 source file(s), +1 more

---

_This release was automatically generated from 1 commits._

## v0.26.73

_Released on 2026-01-06_

### 🐛 Bug Fixes

- **web**: Filter progress summary by current node to preserve details without duplication

---

_This release was automatically generated from 1 commits._

## v0.26.72

_Released on 2026-01-06_

### 🐛 Bug Fixes

- **web**: Remove duplicate self-review display in quality assessment

---

_This release was automatically generated from 1 commits._

## v0.26.71

_Released on 2026-01-06_

### 🐛 Bug Fixes

- **web**: Code review improvements for visual style feature

---

_This release was automatically generated from 1 commits._

## v0.26.70

_Released on 2026-01-06_

### ✨ New Features

- **web**: Add 1 source file(s), update 8 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.69

_Released on 2026-01-06_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 1 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.68

_Released on 2026-01-06_

### ✨ New Features

- **web**: Add 1 source file(s), update 4 source file(s), +1 more

---

_This release was automatically generated from 1 commits._

## v0.26.67

_Released on 2026-01-06_

### ✨ New Features

- **web**: Add 4 source file(s), update 41 source file(s), +3 more

---

_This release was automatically generated from 1 commits._

## v0.26.66

_Released on 2026-01-05_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 7 source file(s), cleanup 2 file(s)
- **CI/CD**: Use pnpm store cache instead of artifacts, fix rollback --pull flag

---

_This release was automatically generated from 2 commits._

## v0.26.65

_Released on 2026-01-05_

---

_This release was automatically generated from 1 commits._

## v0.26.64

_Released on 2026-01-05_

### 🐛 Bug Fixes

- **shared-types**: Update 5 source file(s), update docs

---

_This release was automatically generated from 2 commits._

## v0.26.63

_Released on 2026-01-05_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 9 source file(s), add 1 test(s), +3 more

---

_This release was automatically generated from 1 commits._

## v0.26.62

_Released on 2026-01-05_

### 🐛 Bug Fixes

- **web**: Update 2 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.61

_Released on 2026-01-04_

### 🔧 Improvements

- **CI/CD**: Enable Docker layer cache for web build

### 🐛 Bug Fixes

- **web**: Update 3 source file(s)

---

_This release was automatically generated from 2 commits._

## v0.26.60

_Released on 2026-01-04_

### 🐛 Bug Fixes

- **web**: Prevent hydration error by not removing initial-loader from DOM

---

_This release was automatically generated from 1 commits._

## v0.26.59

_Released on 2026-01-04_

### 🐛 Bug Fixes

- **web**: Unify theme management with hydration-safe useThemeSync hook

---

_This release was automatically generated from 1 commits._

## v0.26.58

_Released on 2026-01-04_

### 🐛 Bug Fixes

- **web**: Revert enableSystem to fix hydration errors

---

_This release was automatically generated from 1 commits._

## v0.26.57

_Released on 2026-01-04_

### 🐛 Bug Fixes

- **nginx**: Add no-cache headers to prevent stale HTML errors

---

_This release was automatically generated from 1 commits._

## v0.26.56

_Released on 2026-01-04_

### 🐛 Bug Fixes

- **web**: Add smart cache invalidator on version change

---

_This release was automatically generated from 1 commits._

## v0.26.55

_Released on 2026-01-04_

### 🐛 Bug Fixes

- **web**: Remove obsolete KillSwitch script (PWA disabled)

---

_This release was automatically generated from 1 commits._

## v0.26.54

_Released on 2026-01-04_

### 🐛 Bug Fixes

- **web**: Update 1 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.53

_Released on 2026-01-04_

### 🐛 Bug Fixes

- **web**: Update 1 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.52

_Released on 2026-01-04_

### ✨ New Features

- **web**: Add 24 source file(s), update 4 source file(s)

### 🐛 Bug Fixes

- **API**: Use Redis-based readiness check for cross-process sync
- **generation-ui**: Show Stage 1 as completed when awaiting launch
- **worker-readiness**: Add Redis sync for cross-process readiness status

---

_This release was automatically generated from 4 commits._

## v0.26.51

_Released on 2026-01-04_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 5 source file(s), add 1 test(s), +1 more

---

_This release was automatically generated from 1 commits._

## v0.26.50

_Released on 2026-01-04_

### ✨ New Features

- **course-gen-platform**: Add 1 source file(s), update 3 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.49

_Released on 2026-01-04_

### ✨ New Features

- **course-gen-platform**: Add 5 source file(s), update 7 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.48

_Released on 2026-01-03_

### ✨ New Features

- **stage7**: Add card enrichment handler for 1:1 course/lesson thumbnails
- **stage7**: Switch image generation from Seedream 4.5 to Gemini 2.5 Flash

### 🐛 Bug Fixes

- **stage7**: Allow text in generated images

---

_This release was automatically generated from 3 commits._

## v0.26.47

_Released on 2026-01-03_

### 🐛 Bug Fixes

- **stage7**: Fix two-stage cover flow and delete extension mapping

---

_This release was automatically generated from 1 commits._

## v0.26.46

_Released on 2026-01-03_

### 🐛 Bug Fixes

- **stage7**: Add image_config for proper aspect ratio and resolution

---

_This release was automatically generated from 1 commits._

## v0.26.45

_Released on 2026-01-01_

### ✨ New Features

- **web**: Add 5 source file(s), update 19 source file(s)
- **stage7**: Add cover preview and delete button for enrichments
- **docker**: Add Stage 7 enrichment worker to production compose

### 🐛 Bug Fixes

- **stage7**: Use unoptimized images for cover preview
- **nginx**: Increase proxy buffers to fix 502 errors
- **stage7**: Handle OpenRouter chat completion image format
- **stage7**: Handle different OpenRouter image response formats

---

_This release was automatically generated from 8 commits._

## v0.26.44

_Released on 2025-12-31_

### ✨ New Features

- **web**: Add 1 source file(s), update 2 source file(s)
- **admin**: Add Stage 7 (Enrichments) to admin pipeline page
- **enrichments**: Add cover option to all enrichment UI locations

### 🔧 Improvements

- **admin**: Apply code review improvements

---

_This release was automatically generated from 4 commits._

## v0.26.43

_Released on 2025-12-31_

### 🐛 Bug Fixes

- **web**: Update 1 source file(s)

---

_This release was automatically generated from 1 commits._

## v0.26.42

_Released on 2025-12-31_

### ✨ New Features

- **.claude**: Add 19 source file(s), update docs
- **enrichments**: Add cover image generation for lessons

### 🔧 Improvements

- **enrichments**: Apply code review improvements to cover feature

### 🐛 Bug Fixes

- **web**: Add APP_VERSION to container for proper logging
- **web**: Disable PWA + add Kill Switch to fix 502 errors

---

_This release was automatically generated from 7 commits._

## v0.26.41

_Released on 2025-12-30_

### 🐛 Bug Fixes

- **web**: Update 1 source file(s), update docs

---

_This release was automatically generated from 1 commits._

## v0.26.40

_Released on 2025-12-30_

### 🔧 Improvements

- **web**: Remove empty UI blocks and add intro section styling

### 🐛 Bug Fixes

- **web**: Update 1 source file(s)
- **web**: Improve mermaid text readability on light backgrounds in dark theme
- **web**: Load lesson content from lesson_contents table

---

_This release was automatically generated from 4 commits._

## v0.26.39

_Released on 2025-12-30_

### ✨ New Features

- **web**: Add 48 source file(s), update 46 source file(s), +6 more
- **stage7**: Add deep-link integration for enrichment inspector
- **stage7**: Add enrichment inspector panel with Stack Navigator pattern
- **stage7**: Implement presentation enrichment with two-stage flow
- **stage7**: Implement audio enrichment with OpenAI TTS
- **stage7**: Implement quiz enrichment handler with Bloom's taxonomy
- **stage7**: Add unified VideoScriptPanel for video enrichments
- **stage7**: Add video handler with two-stage script generation
- **stage7**: Add video script prompt template for enrichments
- **stage7**: Add Asset Dock visual foundation for enrichments
- **stage7**: Add tRPC enrichment router with 12 procedures
- **stage7**: Add BullMQ worker infrastructure for enrichments
- **stage7**: Add enrichment types, schemas, and database migration
- Add 4 skill(s), add 1 command(s), +4 more
- **web**: Add 1 source file(s), update 2 source file(s), +1 more
- **scripts**: Add --message flag to release.sh for custom commit messages
- **Commands**: Update slash commands
- **AI Agents**: Add lead-research-assistant agent
- **Skills**: Add 3 new skills (SKILL.md, ...)

### 🐛 Bug Fixes

- **stage7**: Code review low priority improvements
- **stage7**: Code review medium priority improvements
- **stage7**: Address code review issues for enrichment inspector
- **stage7**: Use DEFAULT_MODEL_ID instead of hardcoded model
- **stage7**: Production-grade improvements for enrichment pipeline
- **stage7**: Code review fixes for AssetDock and enrichment infrastructure
- **pwa**: Remove JS/CSS from SW cache to prevent 502 after deploy
- **web**: Add emergency SW cleanup for stuck users with stale cache
- **gitignore**: Unignore admin/logs page route
- **graph**: Fix completed lessons showing as pending on initial load

---

_This release was automatically generated from 52 commits._

## v0.26.37

_Released on 2025-12-28_

### 🐛 Bug Fixes

- **pwa**: Remove JS/CSS from SW cache to prevent 502 after deploy

---

_This release was automatically generated from 1 commits._

## v0.26.36

_Released on 2025-12-28_

### ✨ New Features

- Add 4 skill(s), add 1 command(s), +4 more

---

_This release was automatically generated from 1 commits._

## v0.26.35

_Released on 2025-12-28_

### 🐛 Bug Fixes

- **web**: Add emergency SW cleanup for stuck users with stale cache

---

_This release was automatically generated from 1 commits._

## v0.26.34

_Released on 2025-12-28_

### ✨ New Features

- **web**: Add 1 source file(s), update 2 source file(s), +1 more
- **scripts**: Add --message flag to release.sh for custom commit messages

---

_This release was automatically generated from 2 commits._

## v0.26.33

_Released on 2025-12-27_

### 🐛 Bug Fixes

- **gitignore**: Unignore admin/logs page route

---

_This release was automatically generated from 2 commits._

## v0.26.32

_Released on 2025-12-27_

---

_This release was automatically generated from 1 commits._

## v0.26.31

_Released on 2025-12-26_

---

_This release was automatically generated from 1 commits._

## v0.26.30

_Released on 2025-12-26_

---

_This release was automatically generated from 1 commits._
