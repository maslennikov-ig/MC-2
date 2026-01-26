# Release Notes - v0.26.29

_Released on 2025-12-26_

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
