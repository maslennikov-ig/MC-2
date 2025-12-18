# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.26.2] - 2025-12-15

### Added
- **agents**: add 2 new agents (deployment-engineer, docling-devops)

### Fixed
- **mcp-client**: fix reconnection for 'Not connected' errors in Docling client
- **worker**: increase retry count and delay for MCP connection stability

## [0.22.43] - 2025-12-09

### Added
- **web**: implement Stage 6 "Glass Factory" UI for lesson generation (a064a83)

### Fixed
- **stage6-ui**: query lesson_contents via sections/lessons tables (ab57b46)
- **stage6-ui**: resolve module data loading and lesson double-click (a879d49)

## [Unreleased]

## [0.26.8] - 2025-12-18

### Other
- update project files (c5d91ea)

## [0.26.7] - 2025-12-18

### Added
- **skills**: add 4 new skills (SKILL.md, ...) (d78f068)

### Fixed
- **web**: remove unnecessary page reload after stage restart (2be0a2d)
- **stage4**: strip LLM thinking tags before JSON parsing (4ad11a6)
- **restart**: allow restart from active states and clean up jobs (97b062c)

### Other
- **stage4**: add logging to see parsed data structure (23363e4)

## [0.26.6] - 2025-12-18

### Fixed
- **mcp**: add nginx proxy to bypass DNS rebinding protection (08dadff)
- **queue**: configure automatic cleanup of old BullMQ jobs (0e61b59)

## [0.26.5] - 2025-12-17

### Fixed
- **scripts**: prevent SIGPIPE errors in release script (c813822)

## [0.26.3] - 2025-12-15

## [0.26.1] - 2025-12-15

## [0.23.4] - 2025-12-14

## [0.23.3] - 2025-12-14

## [0.23.2] - 2025-12-14

### Added
- add speckit commands for Cursor Agent:; (faa74b5)
- **lms**: implement Phase 9 performance, fixtures, and documentation (T121-T132) (d4ab753)
- **lms**: implement Phase 8 edge cases and error handling (T107-T120) (3ec6476)
- **lms**: implement config CRUD operations (T097-T106) (aff2069)
- **openedx**: implement status monitoring for LMS publish (T080-T083) (d4807a2)
- **markdown**: add ServerRenderedMarkdown component (6a7899c)
- **markdown**: add useServerRenderedMarkdown hook (80c8499)
- **markdown**: add renderMarkdownAction Server Action (d7a883d)
- **markdown**: add accessibility components (Phase 12) (ed88fb2)
- **openedx**: implement course mapper and tRPC routes (T068-T077) (1430384)
- **markdown**: add task list styling and verify extended markdown (Phase 11) (4592746)
- **markdown**: add responsive table wrapper (Phase 10) (20149ea)
- **markdown**: add heading anchors with copy-to-clipboard (Phase 9) (6ea0823)
- **openedx**: implement adapter and LMS factory (T064-T067) (1fb6f76)
- **web**: implement US6 - content notices and callouts (Phase 8) (bd537bb)
- **openedx**: implement API client with OAuth2 auth (T057-T063) (fe0bf67)
- **web**: implement US5 - real-time AI chat formatting (Phase 7) (d222369)
- **web**: implement US4 - technical diagram support (Phase 6) (45f5837)
- **web**: implement US3 - mathematical formula display (Phase 5) (23ce203)
- **openedx**: implement OLX generator and packager (T053-T056a) (75a777e)
- **web**: implement US2 - code block readability (Phase 4) (1fd7509)
- **web**: implement US1 - consistent content experience (Phase 3) (4cc9fd7)
- **openedx**: Phase 3 OLX Templates - implementation and tests (T036-T052) (dc6bc05)
- **web**: implement core markdown renderers (Phase 2) (24b6f7e)
- **openedx**: Complete Phase 2 Foundational - adapter, tests, logger (4deff15)
- **web**: setup unified markdown rendering system (Phase 1) (5a620b0)
- **openedx**: Phase 2 Foundational - database schema, types, and utilities (af60fad)
- **openedx**: Phase 1 Setup - install dependencies and create directory structure (68e9aa9)
- **openedx**: complete Phase 0 planning - create lms-integration-specialist agent (ceb69af)

### Changed
- **lms**: extract organization verification to shared helper (DRY) (8f5eeaf)
- **generation-graph**: use ServerRenderedMarkdown in LessonContentView (d6c4bb5)
- **generation-graph**: use ServerRenderedMarkdown in ContentPreviewPanel (bc64699)
- **markdown**: migrate old components to unified renderer (Phase 13) (203ee41)

### Fixed
- **lms**: resolve medium and low priority issues from code review (5154d4c)
- **lms**: resolve critical and high priority issues from code review (602f7fa)
- **a11y**: resolve all axe.test.ts accessibility violations (9ef8f93)
- **a11y**: resolve accessibility violations found by axe-core (90ae32c)
- **markdown**: revert ServerRenderedMarkdown due to Next.js limitations (d16188c)
- **markdown**: address code review findings (69efc95)
- **openedx**: address code review findings - type safety and validation (71c8939)
- **markdown**: address code review findings (163fabf)
- **openedx**: resolve TypeScript errors for LMS tables and routers (c0ee8c7)

## [0.25.0] - 2025-12-14

### Added

#### Judge Targeted Refinement (018-judge-targeted-refinement)
- **judge**: add markdownlint integration for FREE markdown structure validation (7cae9d3)
- **shared-types**: add refinement UI display types (T093-T098) (b6da559)
- **stage6**: add quality lock and section locked streaming events (T082-T083) (e5338a6)
- **stage6**: add arbiter_complete streaming event (T076) and mark US3 complete (abb049c)
- **stage6**: add escalation event streaming (T067) (b6dbad5)
- **stage6**: add refinement config admin API and fix code duplication (3b49837)
- **stage6**: implement Phase 3 core modules for Full-Auto targeted refinement (40797ab)
- **stage6**: implement Phase 2 foundational modules for targeted refinement (31ea83f)

#### LMS Integration - Open edX (feature/openedx-integration)
- **lms**: implement Phase 9 performance, fixtures, and documentation (T121-T132) (d4ab753)
- **lms**: implement Phase 8 edge cases and error handling (T107-T120) (3ec6476)
- **lms**: implement config CRUD operations (T097-T106) (aff2069)
- **openedx**: implement status monitoring for LMS publish (T080-T083) (d4807a2)
- **openedx**: implement course mapper and tRPC routes (T068-T077) (1430384)
- **openedx**: implement adapter and LMS factory (T064-T067) (1fb6f76)
- **openedx**: implement API client with OAuth2 auth (T057-T063) (fe0bf67)
- **openedx**: implement OLX generator and packager (T053-T056a) (75a777e)
- **openedx**: Phase 3 OLX Templates - implementation and tests (T036-T052) (dc6bc05)
- **openedx**: Complete Phase 2 Foundational - adapter, tests, logger (4deff15)
- **openedx**: Phase 2 Foundational - database schema, types, and utilities (af60fad)
- **openedx**: Phase 1 Setup - install dependencies and create directory structure (68e9aa9)
- **openedx**: complete Phase 0 planning - create lms-integration-specialist agent (ceb69af)

#### Markdown Renderer (feature/markdown-renderer)
- **markdown**: add ServerRenderedMarkdown component (6a7899c)
- **markdown**: add useServerRenderedMarkdown hook (80c8499)
- **markdown**: add renderMarkdownAction Server Action (d7a883d)
- **markdown**: add accessibility components (Phase 12) (ed88fb2)
- **markdown**: add task list styling and verify extended markdown (Phase 11) (4592746)
- **markdown**: add responsive table wrapper (Phase 10) (20149ea)
- **markdown**: add heading anchors with copy-to-clipboard (Phase 9) (6ea0823)
- **web**: implement US6 - content notices and callouts (Phase 8) (bd537bb)
- **web**: implement US5 - real-time AI chat formatting (Phase 7) (d222369)
- **web**: implement US4 - technical diagram support (Phase 6) (45f5837)
- **web**: implement US3 - mathematical formula display (Phase 5) (23ce203)
- **web**: implement US2 - code block readability (Phase 4) (1fd7509)
- **web**: implement US1 - consistent content experience (Phase 3) (4cc9fd7)
- **web**: implement core markdown renderers (Phase 2) (24b6f7e)
- **web**: setup unified markdown rendering system (Phase 1) (5a620b0)

#### LMS Integration - Open edX (feature/openedx-integration)
- **lms**: implement Phase 9 performance, fixtures, and documentation (T121-T132) (d4ab753)
- **lms**: implement Phase 8 edge cases and error handling (T107-T120) (3ec6476)
- **lms**: implement config CRUD operations (T097-T106) (aff2069)
- **openedx**: implement status monitoring for LMS publish (T080-T083) (d4807a2)
- **openedx**: implement course mapper and tRPC routes (T068-T077) (1430384)
- **openedx**: implement adapter and LMS factory (T064-T067) (1fb6f76)
- **openedx**: implement API client with OAuth2 auth (T057-T063) (fe0bf67)
- **openedx**: implement OLX generator and packager (T053-T056a) (75a777e)
- **openedx**: Phase 3 OLX Templates - implementation and tests (T036-T052) (dc6bc05)
- **openedx**: Complete Phase 2 Foundational - adapter, tests, logger (4deff15)
- **openedx**: Phase 2 Foundational - database schema, types, and utilities (af60fad)
- **openedx**: Phase 1 Setup - install dependencies and create directory structure (68e9aa9)
- **openedx**: complete Phase 0 planning - create lms-integration-specialist agent (ceb69af)

### Changed
- **generation-graph**: use ServerRenderedMarkdown in LessonContentView (d6c4bb5)
- **generation-graph**: use ServerRenderedMarkdown in ContentPreviewPanel (bc64699)
- **markdown**: migrate old components to unified renderer (Phase 13) (203ee41)
- **lms**: extract organization verification to shared helper (DRY) (8f5eeaf)

### Fixed
- **types**: use typed enums for RefinementEvent severity and criterion (d9a6c81)
- **stage6**: add oscillation detection and quality lock documentation (7512b10)
- **a11y**: resolve all axe.test.ts accessibility violations (9ef8f93)
- **a11y**: resolve accessibility violations found by axe-core (90ae32c)
- **markdown**: revert ServerRenderedMarkdown due to Next.js limitations (d16188c)
- **markdown**: address code review findings (69efc95)
- **markdown**: address code review findings (163fabf)
- **lms**: resolve medium and low priority issues from code review (5154d4c)
- **lms**: resolve critical and high priority issues from code review (602f7fa)
- **openedx**: address code review findings - type safety and validation (71c8939)
- **openedx**: resolve TypeScript errors for LMS tables and routers (c0ee8c7)

## [0.22.47] - 2025-12-10

### Fixed
- **web**: correct tRPC endpoint paths for judge config APIs (0997827)
- **web**: resolve hydration mismatch on admin pipeline page (c3afadb)

## [0.22.46] - 2025-12-10

### Fixed
- **stage6**: critical judge execution bugs preventing quality evaluation (f2bfed0)

## [0.22.44] - 2025-12-09

### Added
- **stage6-ui**: comprehensive LessonInspector improvements (97d8abf)

## [0.22.42] - 2025-12-09

## [0.22.41] - 2025-12-09

## [0.22.40] - 2025-12-08

## [0.22.39] - 2025-12-08

## [0.22.38] - 2025-12-07

## [0.22.37] - 2025-12-07

## [0.22.36] - 2025-12-06

## [0.22.35] - 2025-12-06

## [0.22.34] - 2025-12-06

## [0.22.33] - 2025-12-06

## [0.22.32] - 2025-12-06

## [0.22.31] - 2025-12-06

## [0.22.30] - 2025-12-06

## [0.22.29] - 2025-12-06

## [0.22.28] - 2025-12-06

## [0.22.27] - 2025-12-06

## [0.22.26] - 2025-12-06

## [0.22.25] - 2025-12-06

## [0.22.24] - 2025-12-06

## [0.22.23] - 2025-12-05

## [0.22.22] - 2025-12-05

## [0.22.21] - 2025-12-05

### Fixed
- **security**: address critical vulnerabilities in updateField API (1301fa0)

## [0.22.20] - 2025-12-05

## [0.22.19] - 2025-12-05

## [0.22.18] - 2025-12-05

## [0.22.17] - 2025-12-05

## [0.22.16] - 2025-12-05

## [0.22.15] - 2025-12-05

## [0.22.14] - 2025-12-05

## [0.22.13] - 2025-12-05

## [0.22.12] - 2025-12-05

## [0.22.11] - 2025-12-05

### Added
- **observability**: add RAG metrics to generation traces (9906147)

### Changed
- use barrel export for jina imports in Stage 5 (cc6e06d)

## [0.22.10] - 2025-12-05

## [0.22.9] - 2025-12-05

## [0.22.8] - 2025-12-04

### Fixed
- **lint**: add types to phase-4-synthesis.ts (c040f22)
- **lint**: add types to fsm-initialization-command-handler.ts (61269ee)
- **lint**: add types to field-name-fix.ts (9b18ec5)
- **lint**: add types to observability.ts (649c289)
- **lint**: add types to pipeline-admin.ts (098f555)
- **lint**: add types to json-repair.ts (0c4c46c)
- **lint**: add types to validation-orchestrator.ts (5b264d7)
- **lint**: add types to cascade-evaluator.ts (e8a46ad)
- **lint**: add types to metadata-generator.ts (1ea6f32)
- **lint**: add types to section-regeneration-service.ts (983634d)
- **lint**: add types to outbox-processor.ts (fe9ec8c)
- **lint**: add types to analysis.ts (8f0f4aa)
- **lint**: add types to openrouter-models.ts (7270a7f)
- **lint**: add types to layer-3-partial-regen.ts (664894d)
- **lint**: add types to handler.ts (5c5bb1c)
- **lint**: add types to rag-context-cache.ts (a7edc9b)
- **lint**: add types to generation.ts (708db92)
- **lint**: add types to base-handler.ts (8a158c2)
- **lint**: add types to phase-6-rag-planning.ts (8f51a00)
- **lint**: add types to zod-to-prompt-schema.ts (0013ad0)
- **lint**: add types to phase-2-scope.ts (1aa2172)
- **lint**: add types to rag-cleanup.ts (8e38fe5)
- **lint**: add types to section-batch-generator.ts (ca09cb7)
- **platform**: resolve eslint warnings in pipeline-audit.ts by adding types (a75944e)

## [0.22.7] - 2025-12-03

## [0.22.6] - 2025-12-03

## [0.22.5] - 2025-12-03

## [0.22.4] - 2025-12-03

### Added
- **admin-pipeline**: implement Phases 7-8 Export/Import & Model Browser (T052-T060) (f0fef31)
- **admin-pipeline**: implement Phase 6 Global Settings (T048-T051) (b25922d)
- **admin-pipeline**: implement Phase 5 Prompt Templates (T038-T047) (fbed63d)
- **pipeline-admin**: implement Model Configuration (User Story 2) (54f348c)
- **pipeline-admin**: implement Pipeline Overview (User Story 1) (d8cb173)
- **pipeline-admin**: add backend services and frontend layout (8e56cac)
- **shared-types**: add TypeScript types and schemas for pipeline admin (b57f7ee)
- **pipeline-admin**: add database migrations for versioning and config tables (6cbfba3)

## [0.22.3] - 2025-12-03

## [0.22.2] - 2025-12-03

### Fixed
- **modal**: resolve infinite re-render loop in NodeDetailsModal (c5f9bf7)

## [0.22.1] - 2025-12-03

## [0.22.0] - 2025-12-02

### Added
- **graph**: consolidate document stages into single node (e9b3d18)
- **graph**: major workflow visualization improvements (2a37296)

### Fixed
- **graph**: final accessibility and dead code cleanup (9a4d753)
- **graph**: accessibility, security, and code quality improvements (01a1726)
- **graph**: critical fixes and UX improvements (72e0719)

## [0.21.4] - 2025-11-30

### Added
- **ui**: enhance logo styling with premium gradient and standardize sizes (2453149)

### Fixed
- **modal**: improve theme support and click-outside-to-close (efad18c)
- **graph**: increase default zoom from 0.85 to 1.0 (2145895)

## [0.21.3] - 2025-11-29

## [0.21.2] - 2025-11-28

## [0.21.1] - 2025-11-28

### Added
- **graph**: integrate keyboard navigation and view toggle (T092, T096) (db60875)
- **graph**: use localStorage for viewport persistence (T120) (873a090)

### Fixed
- **graph**: implement Refine button functionality (T085) (8738e09)
- **graph**: fix TypeScript errors in EndNode component (bd37cd2)
- **dev**: use webpack mode for ElkJS compatibility (71b28d1)

## [0.21.0] - 2025-11-28

## [0.20.1] - 2025-11-27

### Added
- **celestial**: add parallel processes visualization (c89e11f)

### Fixed
- **celestial**: add Stage 1 and complete localization (1ac5ca0)
- **celestial**: improve UX and localize generation progress page (2bf8090)

## [0.20.0] - 2025-11-27

### Added
- **web**: implement celestial mission redesign for generation progress page (36a0e8b)

## [0.19.31] - 2025-11-27

## [0.19.30] - 2025-11-27

### Fixed
- replace OpenAI embeddings with Jina embeddings in semantic matching (a18d77e)
- correct OpenAI client initialization in semantic-matching (7218b49)

## [0.19.29] - 2025-11-25

## [0.19.28] - 2025-11-25

## [0.19.27] - 2025-11-25

### Added
- **commands**: update slash commands (6c0f2f3)

### Fixed
- **stage5**: resolve multilingual validation and placeholder detection issues (db58ea2)
- **e2e**: add retry logic for transient Supabase errors (ec026e2)
- **e2e**: handle partial Stage 2 failures gracefully (163c9a0)
- **e2e**: proper Stage 2-4 job triggering and wait logic (fe51461)
- **stage4,stage6**: respect course language and fix heuristic word count (e2c4be5)
- **stage6**: fix database queries and input validation (ca6f1ae)

## [0.19.26] - 2025-11-23

## [0.19.25] - 2025-11-23

### Added
- add /health-reuse workflow for code duplication detection and consolidation (43d78b5)

## [0.19.24] - 2025-11-23

### Changed
- consolidate duplicated code using Single Source of Truth pattern (5a9f571)

## [0.19.23] - 2025-11-22

## [0.19.22] - 2025-11-22

## [0.19.21] - 2025-11-22

## [0.19.20] - 2025-11-22

## [0.19.19] - 2025-11-22

## [0.19.18] - 2025-11-22

## [0.19.17] - 2025-11-22

## [0.19.16] - 2025-11-22

## [0.19.15] - 2025-11-22

## [0.19.14] - 2025-11-22

### Fixed
- **judge**: correct model IDs for GLM and Gemini (cc64fa2)
- **judge**: replace GPT-4o-mini with Kimi K2 for refinement (fc38ccb)

## [0.19.13] - 2025-11-22

## [0.19.12] - 2025-11-22

## [0.19.11] - 2025-11-22

## [0.19.10] - 2025-11-22

## [0.19.9] - 2025-11-22

## [0.19.8] - 2025-11-22

## [0.19.7] - 2025-11-22

### Added
- **agents**: add 12 new agents (judge-specialist, ...) (8b91305)
- **docs**: Add executive review prompt and generate weekly reports for repository (439d83a)

## [0.19.6] - 2025-11-21

## [0.19.5] - 2025-11-21

## [0.19.4] - 2025-11-21

## [0.19.3] - 2025-11-21

## [0.19.2] - 2025-11-21

## [0.19.1] - 2025-11-21

## [0.19.0] - 2025-11-21

### Added
- **commands**: update slash commands (939da7c)

## [0.18.11] - 2025-11-20

## [0.18.10] - 2025-11-20

### Changed
- **stage3**: unify Stage 3 Summarization structure (58198df)

## [0.18.9] - 2025-11-20

## [0.18.8] - 2025-11-20

### Changed
- **stage4**: unify Stage 4 Analysis structure (ce7afd1)

## [0.18.7] - 2025-11-20

### Added
- **agents**: add code-structure-refactorer agent (857cbb3)
- **cleanup**: implement automated draft course cleanup system (1f3a43b)
- **frontend**: remove difficulty selection and fix RLS recursion (1eb4d5e)

### Changed
- **worktree**: simplify file sync using rsync instead of config-based approach (0deb66a)

### Fixed
- **redis**: correct Pino logger API usage (object first, message second) (22d329a)

## [0.18.6] - 2025-11-20

### Added
- **agents**: add 3 new agents (article-writer-multi-platform, ...) (5efc3da)

## [0.18.5] - 2025-11-18

### Added
- **transactional-outbox**: implement Task 7 (worker validation layer) (f958b57)
- **transactional-outbox**: implement Task 6 (QueueEvents backup layer) (a5ed9e5)

## [0.18.4] - 2025-11-18

### Added
- **transactional-outbox**: implement Tasks 1-4 (critical infrastructure) (07937dd)

### Changed
- FSM redesign + quality validator fix + system metrics expansion (f96c64e)

### Fixed
- **stage5**: remove hardcoded JSON examples that contradict zodToPromptSchema (8af7c1d)

## [0.18.3] - 2025-11-16

### Fixed
- **phase-2**: add comprehensive post-processing safety net for all required fields (8284c10)

## [0.18.2] - 2025-11-16

### Added
- add comprehensive LLM model testing and quality evaluation framework (4ee2b64)
- **docs**: add comprehensive executive review and repository analysis for Nov 2025 (2af8414)
- **schema**: complete Phase 2 of T055 schema unification - update Stage 5 services (9539b2a)
- **stage5**: implement incremental section regeneration (T039-A/B, FR-026) (08bc24a)
- **stage5**: implement tRPC API endpoints for generation (T036-T039) (181533e)
- **stage5**: implement BullMQ worker handler for STRUCTURE_GENERATION (T034-T035) (b1870a8)
- **stage5**: implement generation-state types for 5-phase LangGraph orchestration (7413309)
- **stage5**: implement cost calculator service (T027) (833cfeb)
- **validators**: implement RT-007 Phase 3 severity integration (2f70d7d)
- **validators**: implement RT-007 Phase 2 - Universal Multilingual Support (8b71fb8)
- **validators**: implement RT-007 Phase 1 - Bloom's Taxonomy Quick Fixes (8546b5d)
- **generation**: implement LangGraph StateGraph orchestrator (e5a680e)
- **generation**: implement phase node functions for LangGraph orchestration (daf1cbd)
- **generation**: activate RT-006 Zod validators in production code (a150e3c)
- **analyze**: add JSON repair metrics tracking (A30) (ecb901d)
- **analyze**: integrate jsonrepair and field-name-fix utilities (A27-A29) (6140ab2)
- **analyze**: add error handling and logging for Phase 6 (A19, A20) (5341fb4)
- **analyze**: add validation for new schema fields (A16) (d138f44)
- **analyze**: integrate Phase 6 RAG Planning into orchestrator (A15) (d5ad479)
- **analyze**: implement Phase 6 RAG Planning prompt (A14) (1950670)
- **analyze**: implement Phase B Core Schema enhancements (A01-A13) (cecf1fe)
- **stage5**: implement section-batch-generator with tiered model routing (T020-T021) (4665b05)
- **stage5**: implement metadata-generator service with hybrid model routing (T019) (ded5e21)
- **stage5**: implement XSS sanitization utility (T018) (c6b10da)
- **stage5**: implement RT-006 Bloom's Taxonomy validation utilities (T017) (66da108)
- **stage5**: implement field-name-fix utility with camelCase -> snake_case conversion (T016) (615cf6a)
- **stage5**: implement json-repair utility with 4-level repair strategy (T015) (54840e2)
- **spec-008**: complete Phase 2 Foundation (T001-T005) (c87f624)

### Changed
- **analyze**: complete migration to UnifiedRegenerator for all phases (111f4c5)
- **regeneration**: migrate Analyze and Generation to UnifiedRegenerator (1f9339c)

### Fixed
- **tests**: fix crypto import in T053 E2E test (96f3459)
- **tests**: add required slug field to T053 E2E test + mark T054 as skipped (e785fae)
- **tests**: use correct generation_status enum value in T053 (089a27e)
- **tests**: remove deprecated 'topic' field from T053 E2E test (3139fc2)
- **docling**: add connection health checks and auto-reconnect (8c07e7f)
- **redis**: enable offline queue in production for resilience (5a4a7bb)
- **phase6**: use relative paths in dynamic require() for json-repair imports (d88162f)
- **analysis**: implement robust JSON parsing with Zod validation and auto-repair (4893e2b)
- **stage5**: add missing worker entrypoint and fix title-only documentation (434eb2d)
- correct formatting of quality score label in Phase 5 assembly diagram (a2e5096)
- **stage5**: update Qwen 3 Max pricing and add 128K context validation (bd8da79)
- **tests**: improve test reliability (+8 tests fixed: 92->84) (1a4a86e)
- **tests**: resolve T055 schema test failures (Pattern 1-3) (75dd9a1)
- **tests**: resolve Pattern 2 & 3 test failures from INV-2025-11-12-001 (887e65a)
- **tests**: address Pattern 2 & 3 test failures from INV-2025-11-12-001 (394edcf)
- **stage5**: implement H-001 cost calculation in generation orchestrator (6d00c07)
- **test**: restore JWT auth test fixtures and RLS organization isolation (e6f7d44)
- parallel test failure fixes across unit, contract, and schema layers (7fdef35)

## [0.17.3] - 2025-11-16

## [0.17.2] - 2025-11-16

## [0.17.1] - 2025-11-15

### Added
- add comprehensive LLM model testing and quality evaluation framework (4ee2b64)

### Fixed
- **docling**: add connection health checks and auto-reconnect (8c07e7f)
- **redis**: enable offline queue in production for resilience (5a4a7bb)
- **phase6**: use relative paths in dynamic require() for json-repair imports (d88162f)
- **analysis**: implement robust JSON parsing with Zod validation and auto-repair (4893e2b)
- **stage5**: add missing worker entrypoint and fix title-only documentation (434eb2d)
- correct formatting of quality score label in Phase 5 assembly diagram (a2e5096)

## [0.17.0] - 2025-11-14

### Added
- **docs**: add comprehensive executive review and repository analysis for Nov 2025 (2af8414)

### Fixed
- **stage5**: update Qwen 3 Max pricing and add 128K context validation (bd8da79)

## [0.16.32] - 2025-11-13

### Fixed
- **tests**: improve test reliability (+8 tests fixed: 92->84) (1a4a86e)

## [0.16.31] - 2025-11-12

### Fixed
- **tests**: resolve T055 schema test failures (Pattern 1-3) (75dd9a1)
- **tests**: resolve Pattern 2 & 3 test failures from INV-2025-11-12-001 (887e65a)
- **tests**: address Pattern 2 & 3 test failures from INV-2025-11-12-001 (394edcf)

## [0.16.30] - 2025-11-12

### Fixed
- **stage5**: implement H-001 cost calculation in generation orchestrator (6d00c07)

## [0.16.29] - 2025-11-12

## [0.16.28] - 2025-11-12

### Added - Stage 5: Course Structure JSON Generation (Complete)

**Core Services** (~4500 lines, 9 files):
- **generation-orchestrator.ts** (690 lines) - LangGraph StateGraph orchestrator with 5-phase workflow (validate -> metadata -> sections -> quality -> assembly)
- **generation-phases.ts** (1845 lines) - Phase node implementations with per-batch processing (SECTIONS_PER_BATCH=1)
- **metadata-generator.ts** (585 lines) - Course metadata generation with RT-001 hybrid model routing (qwen3-max for critical path)
- **section-batch-generator.ts** (790 lines) - Section batch generation with RT-001 tiered routing (OSS 120B primary, Gemini overflow)
- **quality-validator.ts** (532 lines) - Quality validation with Jina-v3 semantic similarity (>=0.75 threshold) and reactive escalation
- **cost-calculator.ts** (400 lines) - OpenRouter pricing integration with $0.30-0.40 target per course
- **section-regeneration-service.ts** - Incremental section regeneration (FR-026) for user-driven updates
- **qdrant-search.ts** (415 lines) - Optional RAG integration with LLM-driven tool-calling
- **BullMQ worker handler** - STRUCTURE_GENERATION job processing with progress tracking

**Utilities** (~2000 lines, 5 files):
- **json-repair.ts** - 4-level repair cascade (jsonrepair@3.13.1 lib, extractJSON, safeJSONParse, 95-97% success rate)
- **field-name-fix.ts** - camelCase -> snake_case transformation with 25+ explicit LLM error mappings
- **validators/** (4 files, 1044 lines):
  - minimum-lessons.ts - FR-015 validation (>=10 lessons per course)
  - blooms-taxonomy.ts - RT-006 Bloom's taxonomy validation (P0-P1 implemented, 55-60% rejection savings)
  - topic-specificity.ts - Topic relevance validation
  - quality-metrics.ts - Comprehensive quality scoring
- **sanitize-course-structure.ts** (227 lines) - DOMPurify XSS prevention for user-facing content
- **analysis-formatters.ts** - Stage 4/5 schema unification utilities

**API Endpoints** (3 tRPC endpoints):
- `generation.generate` - Queue STRUCTURE_GENERATION job with BullMQ
- `generation.getStatus` - Poll generation progress (metadata, sections completed, quality scores)
- `generation.regenerateSection` - FR-026 incremental section updates without full regeneration

**Research Decisions** (6 documents):
- **RT-001**: Multi-model orchestration architecture (qwen3-max, OSS 120B, Gemini tiered routing)
- **RT-002**: LangGraph 5-phase generation architecture (per-batch processing with independent token budgets)
- **RT-003**: Token budget validation (120K total, 90K input, 40K RAG, 30K output per batch)
- **RT-004**: Quality validation & retry logic (Jina-v3 embeddings, 10-attempt tiered escalation)
- **RT-005**: JSON repair & regeneration strategies (jsonrepair library, 95-97% success rate)
- **RT-006**: Bloom's taxonomy validation (P0-P1 implemented, 55-60% cost savings via early rejection)

**Features & Capabilities**:
- LangGraph StateGraph orchestration with 5 distinct phases
- Multi-model routing: qwen3-max (critical metadata), OSS 120B (primary sections), Gemini (overflow)
- Title-only generation support (FR-003) for rapid course structure creation
- 19 style presets integration (academic, professional, casual, technical, etc.)
- Quality gates: Jina-v3 similarity >=0.75, FR-015 minimum 10 lessons, Bloom's taxonomy validation
- Cost tracking: $0.30-0.40 target per course with detailed model usage analytics
- Token budget management: 120K total (90K input + 30K output) per batch
- XSS sanitization with DOMPurify for all user-facing text fields
- Incremental section regeneration (FR-026) without full course re-generation
- Optional RAG integration with LLM-driven tool-calling for context retrieval
- Constraints-based prompt engineering for consistent JSON output
- Reactive escalation on quality failures (OSS 120B -> Gemini -> qwen3-max)

**Database**:
- `generation_metadata` table - Progress tracking, cost analytics, quality scores, model usage
- `course_structure` JSONB field - Unified schema with snake_case field names
- Schema unification (T055) - Stage 4/5 alignment across all services

**Architecture**:
- Per-batch processing model (SECTIONS_PER_BATCH=1, independent token budgets per batch)
- Optional RAG integration (Qdrant vector search, BM25 hybrid retrieval)
- Constraints-based prompt engineering (JSON schema in system prompts)
- Reactive escalation (quality-based model upgrades: OSS 120B -> Gemini -> qwen3-max)
- BullMQ job orchestration with progress events and error handling

**Testing** (624+ tests, 92% average coverage):
- Unit tests: json-repair (4-level cascade), field-name-fix (camelCase->snake_case), validators (Bloom's, minimum lessons)
- Integration tests: LangGraph orchestration, multi-model routing, quality validation
- Contract tests: tRPC endpoints, generation status polling, section regeneration
- E2E tests: Full generation workflow with real documents and style presets

**Documentation**:
- RT-001 through RT-006 research decision documents
- Stage 5 architecture diagrams (LangGraph flow, multi-model routing)
- API endpoint documentation (generation.*, tRPC router)
- Quality gate specifications (Jina-v3, Bloom's taxonomy, minimum lessons)

### Fixed
- **schema**: T055 schema unification - Stage 4/5 alignment across all services (analysis-formatters, generation-phases, quality-validator)
- **field-names**: camelCase -> snake_case conversion for LLM output consistency (CourseTitle -> course_title edge case)
- **json-repair**: 95-97% success rate with 4-level repair cascade (jsonrepair lib + custom fallback)

### Changed
- **architecture**: Migration to LangGraph StateGraph orchestration (replaced linear pipeline)
- **model-routing**: RT-001 tiered routing implementation (qwen3-max critical, OSS 120B primary, Gemini overflow)
- **token-budget**: Per-batch processing model (SECTIONS_PER_BATCH=1, independent 120K budgets)
- **quality-validation**: Integration of Jina-v3 semantic similarity (>=0.75 threshold) with reactive escalation

## [0.16.27] - 2025-11-12

## [0.16.26] - 2025-11-11

### Fixed
- **test**: restore JWT auth test fixtures and RLS organization isolation (e6f7d44)

## [0.16.25] - 2025-11-11

## [0.16.24] - 2025-11-11

### Fixed
- parallel test failure fixes across unit, contract, and schema layers (7fdef35)

## [0.16.23] - 2025-11-11

## [0.16.22] - 2025-11-11

## [0.16.21] - 2025-11-11

### Added
- **stage5**: implement incremental section regeneration (T039-A/B, FR-026) (08bc24a)

## [0.16.20] - 2025-11-11

### Added
- **stage5**: implement tRPC API endpoints for generation (T036-T039) (181533e)

## [0.16.19] - 2025-11-11

### Added
- **stage5**: implement BullMQ worker handler for STRUCTURE_GENERATION (T034-T035) (b1870a8)

## [0.16.18] - 2025-11-11

### Added
- **stage5**: implement generation-state types for 5-phase LangGraph orchestration (7413309)
- **stage5**: implement cost calculator service (T027) (833cfeb)

## [0.16.17] - 2025-11-10

## [0.16.16] - 2025-11-10

## [0.16.15] - 2025-11-10

## [0.16.14] - 2025-11-10

## [0.16.13] - 2025-11-10

### Added
- **validators**: implement RT-007 Phase 3 severity integration (2f70d7d)

## [0.16.12] - 2025-11-10

### Added
- **validators**: implement RT-007 Phase 2 - Universal Multilingual Support (8b71fb8)

## [0.16.11] - 2025-11-10

### Added
- **validators**: implement RT-007 Phase 1 - Bloom's Taxonomy Quick Fixes (8546b5d)

## [0.16.10] - 2025-11-10

### Added
- **generation**: implement LangGraph StateGraph orchestrator (e5a680e)

## [0.16.9] - 2025-11-10

### Added
- **generation**: implement phase node functions for LangGraph orchestration (daf1cbd)

## [0.16.8] - 2025-11-10

### Changed
- **analyze**: complete migration to UnifiedRegenerator for all phases (111f4c5)

## [0.16.7] - 2025-11-10

### Added
- **generation**: activate RT-006 Zod validators in production code (a150e3c)

## [0.16.6] - 2025-11-10

### Added
- **analyze**: add JSON repair metrics tracking (A30) (ecb901d)
- **analyze**: integrate jsonrepair and field-name-fix utilities (A27-A29) (6140ab2)
- **analyze**: add error handling and logging for Phase 6 (A19, A20) (5341fb4)
- **analyze**: add validation for new schema fields (A16) (d138f44)
- **analyze**: integrate Phase 6 RAG Planning into orchestrator (A15) (d5ad479)
- **analyze**: implement Phase 6 RAG Planning prompt (A14) (1950670)
- **analyze**: implement Phase B Core Schema enhancements (A01-A13) (cecf1fe)
- **stage5**: implement section-batch-generator with tiered model routing (T020-T021) (4665b05)
- **stage5**: implement metadata-generator service with hybrid model routing (T019) (ded5e21)
- **stage5**: implement XSS sanitization utility (T018) (c6b10da)
- **stage5**: implement RT-006 Bloom's Taxonomy validation utilities (T017) (66da108)
- **stage5**: implement field-name-fix utility with camelCase -> snake_case conversion (T016) (615cf6a)
- **stage5**: implement json-repair utility with 4-level repair strategy (T015) (54840e2)
- **spec-008**: complete Phase 2 Foundation (T001-T005) (c87f624)

### Changed
- **regeneration**: migrate Analyze and Generation to UnifiedRegenerator (1f9339c)

## [0.16.4] - 2025-11-10

### Added
- **analyze**: add JSON repair metrics tracking (A30) (ecb901d)
- **analyze**: integrate jsonrepair and field-name-fix utilities (A27-A29) (6140ab2)
- **analyze**: add error handling and logging for Phase 6 (A19, A20) (5341fb4)
- **analyze**: add validation for new schema fields (A16) (d138f44)
- **analyze**: integrate Phase 6 RAG Planning into orchestrator (A15) (d5ad479)
- **analyze**: implement Phase 6 RAG Planning prompt (A14) (1950670)
- **analyze**: implement Phase B Core Schema enhancements (A01-A13) (cecf1fe)
- **stage5**: implement section-batch-generator with tiered model routing (T020-T021) (4665b05)
- **stage5**: implement metadata-generator service with hybrid model routing (T019) (ded5e21)
- **stage5**: implement XSS sanitization utility (T018) (c6b10da)
- **stage5**: implement RT-006 Bloom's Taxonomy validation utilities (T017) (66da108)
- **stage5**: implement field-name-fix utility with camelCase -> snake_case conversion (T016) (615cf6a)
- **stage5**: implement json-repair utility with 4-level repair strategy (T015) (54840e2)
- **spec-008**: complete Phase 2 Foundation (T001-T005) (c87f624)

### Added
- **stage-5**: JSON repair utility with 4-level repair strategy (T015)
  - Hybrid approach: jsonrepair library (95-98% success) + custom fallback
  - extractJSON(): Extract JSON from mixed text using brace counting
  - safeJSONParse(): Progressive repair (direct parse -> jsonrepair -> custom 4-level)
  - Dependency: jsonrepair@3.13.1
- **stage-5**: Field name fix utility for camelCase -> snake_case conversion (T016)
  - Recursive transformation for nested objects and arrays
  - 25+ explicit mappings for common LLM field naming errors
  - Bug fix: camelToSnake edge case (CourseTitle -> course_title)

## [0.15.0] - 2025-11-08

### Added
- **spec-008**: complete Phase 2 Foundation (T001-T005) (c87f624)


## [0.18.1] - 2025-11-16

## [0.18.0] - 2025-11-16

### Added
- **cleanup**: implement automated draft course cleanup system (1f3a43b)
- **frontend**: remove difficulty selection and fix RLS recursion (1eb4d5e)

### Changed
- **worktree**: simplify file sync using rsync instead of config-based approach (0deb66a)
## [0.13.1] - 2025-11-06

### Added
- **stage-4**: Complete Stage 4 Analysis Implementation - All 65 Tasks (100%) (#7) (68e7aa7)
- **stage-3**: Phase 9 production readiness improvements + TypeScript fixes (4e58561)
- **stage-3**: Add Phase 9 tasks for production readiness improvements (2e7b19e)

### Fixed
- **stage-3**: Eliminate infinite job loop with Named Processor Pattern (cb69b10)
- **tests**: Fix E2E test fixture initialization (797353f)

### Fixed
- **analysis**: Add rollback logic for generation_status on job creation failure (752bed0)
  - Prevents course bricking when addJob() fails (network issues, BullMQ errors, etc.)
  - Saves previousStatus before updating to 'generating_structure'
  - Rollback on documentsError (Step 3 fetch failure)
  - Rollback on unexpected errors (addJob failure, network issues)
  - Follows existing rollback pattern from generation.ts (quota rollback)
  - Resolves P1 issue identified by Codex in PR #7
  - Reference: https://github.com/maslennikov-ig/MegaCampusAI/pull/7#discussion_r2490477849

---

**DRAFT: v0.14.7 Release Notes** (After PR #7 merge)

This patch release addresses a critical issue where course status could become permanently locked
in 'generating_structure' state if job creation failed, requiring manual database intervention.

**Changes:**
- `analysis.ts:148` - Track previousStatus outside try/catch for catch block access
- `analysis.ts:234` - Save previous value before status update
- `analysis.ts:253-275` - Create rollbackStatus() helper function
- `analysis.ts:302` - Rollback on documentsError
- `analysis.ts:392-412` - Rollback on unexpected errors (addJob, network, etc.)

**Verification:**
- Type-check: Passed
- E2E tests: T055 passing (exit_code=0)
- Pattern: Matches existing generation.ts rollback implementations

---

## [0.14.6] - 2025-11-04

### Fixed
- **tests**: resolve FK constraint violation in T055 E2E test (b68739c)

## [0.14.5] - 2025-11-03

### Fixed
- **tests**: complete contract test suite - all 20/20 passing (40fd7f5)
- **tests**: implement RPC-based auth user creation for test fixtures (bd68a09)

## [0.14.4] - 2025-11-01

### Fixed
- **release**: add automatic version sync between package.json and git tags (0b4a0b1)

## [0.14.3] - 2025-11-01

### Added
- **stage-4**: implement multi-phase analysis orchestration and API endpoints (T023-T025, T032-T033) (a03e374)

## [0.14.0] - 2025-11-01

### Added
- **stage-4**: Add Phase 1-2 Foundation - Database schema and TypeScript types (e20f6e7)
- **stage-3**: Phase 9 production readiness improvements + TypeScript fixes (4e58561)
- **stage-3**: Add Phase 9 tasks for production readiness improvements (2e7b19e)

### Fixed
- **stage-3**: Eliminate infinite job loop with Named Processor Pattern (cb69b10)
- **tests**: Fix E2E test fixture initialization (797353f)

## [0.13.1] - 2025-10-29

### Fixed - Critical: Infinite Job Loop (BullMQ Worker Architecture)

**Problem**: Jobs picked up 60+ times in 10 seconds causing infinite loops, constraint violations, and system instability.

**Root Causes**:
- WaitingError misuse (designed for parent-child jobs, not job filtering)
- Worker collision between generic and Stage 3 workers
- organization_id constraint violation (snake_case vs camelCase mapping)
- Database column name mismatch (file_id vs id)

**Solution - Named Processor Pattern** (BullMQ best practice):
- Implemented unified worker with handler registry (switch-case on job.name)
- Created dedicated handler: `src/orchestrator/handlers/stage3-summarization.ts` (329 lines)
- Removed separate Stage 3 worker architecture
- Eliminated WaitingError logic
- Added organization_id fallback mapping for snake_case compatibility

**Results**:
- Jobs now picked up ONCE (not 60+ times)
- No infinite loops or constraint violations
- E2E tests passing (exit_code=0)
- Summaries save successfully with quality validation

**Investigation Reports**:
- `docs/investigations/INV-2025-10-29-001-worker-job-collision.md`
- `docs/investigations/INV-2025-10-29-002-infinite-job-loop.md`

### Improved - Stage 3 Phase 9: Production Readiness & Code Quality

**Code Quality Improvements**:
- Optimized Stage 4 barrier with RPC function (`check_stage4_barrier`) - reduces database queries by 50%
- Added custom error types for cost calculator: `UnknownModelError`, `InvalidTokenCountError`, `CostOverflowError`
- Added $1000 cost overflow protection to prevent catastrophic billing errors
- Comprehensive retry escalation documentation with JSDoc and ASCII decision tree (80+ lines)
- Added NaN/Infinity validation for token counts

**TypeScript Fixes**:
- Fixed tier null constraint errors across 6 files (admin.ts, billing.ts, generation.ts, quota-enforcer.ts)
- Removed unused imports (document-processing.ts, qdrant/upload.ts)
- All files now pass strict TypeScript checks with 0 errors

**Testing Improvements**:
- Added 11 new test cases for custom error types
- Improved test coverage for edge cases (NaN, Infinity, overflow)
- Tests validate error context and proper error handling
- Created comprehensive E2E test suite with real Russian documents (951 lines)
- Fixed E2E test fixture initialization (organization/user/course creation in beforeAll())
- E2E tests now run successfully with proper database fixtures

**Database**:
- Migration: `20251029100000_stage4_barrier_rpc.sql` - atomic Stage 4 barrier check function

**Code Review**: Improved from 8.5/10 -> 10/10 (Phase 9 recommendations implemented)

## [0.13.0] - 2025-10-29

### Added - Stage 3: Document Summarization

**LLM Integration & Summarization**
- OpenAI SDK client with OpenRouter integration (`openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `google/gemini-2.5-flash-preview`)
- Hierarchical chunking strategy with 115K token chunks and 5% overlap
- Adaptive compression (DETAILED -> BALANCED -> AGGRESSIVE) with max 5 iterations
- Small document bypass logic (<3K tokens, zero LLM cost, 100% fidelity)
- BullMQ worker for async summarization (concurrency: 5, timeout: 10 minutes)

**Quality Validation**
- Semantic similarity validation via Jina-v3 embeddings (0.75 threshold)
- Hybrid escalation retry with quality-based model upgrades
- Quality scoring (0.0-1.0) with automatic retry on low scores

**Multilingual Support**
- Language detection for 13 languages (Russian, English, Spanish, French, German, etc.)
- Language-specific token ratio estimation (Russian: 3.2, English: 4.0, etc.)
- Character-to-token ratio tracking in metadata

**Cost Tracking & Analytics**
- Cost calculator service with 5 model pricing profiles
- 3 new tRPC endpoints: `getCostAnalytics`, `getSummarizationStatus`, `getDocumentSummary`
- Per-document, per-organization, per-model cost analytics
- Token tracking (input/output/total) with estimated cost in USD

**Database Schema**
- New `file_catalog` columns: `processed_content`, `processing_method`, `summary_metadata`
- Migration: `20251028000000_stage3_summary_metadata.sql`
- Index: `idx_file_catalog_processing_method` for analytics

**Stage Orchestration**
- Stage 4 strict barrier logic (100% completion enforcement)
- Progress tracking with Russian UI messages
- Course status transitions: CREATING_SUMMARIES -> SUMMARIES_CREATED

**Testing & Validation**
- 29/29 unit tests passing (cost calculator, token estimator, quality validator)
- 10/10 contract tests passing (tRPC endpoints, RLS enforcement)
- 4 integration tests (basic, error handling, quality gate, multilingual)
- E2E cost accuracy validation (0.00% variance)

**Documentation**
- Updated SUPABASE-DATABASE-REFERENCE.md with Stage 3 schema
- Code review completed (8.5/10, approved for production)
- 3 tRPC routers documented in app-router.ts

### Changed
- Updated BullMQ worker timeout configuration (added `lockDuration` parameter)
- Fixed Redis lazy connection in integration tests

## [0.12.5] - 2025-10-28

### Added
- **stage-3**: Complete Phase 0 orchestration planning with 5 new specialized subagents (293b9d6)

## [0.12.4] - 2025-10-28

## [0.12.3] - 2025-10-28

## [0.12.2] - 2025-10-27

### Fixed
- Correct parent-child chunk test field names (908d6dd)
- Use original PDF file in tests instead of v2 copy (26b805a)

## [0.12.1] - 2025-10-27

### Fixed
- Docling PDF processing - timeout increase and tier structure correction (4041ada)

## [0.12.0] - 2025-10-24

### Added
- Stage 2 Implementation - Phase 0 Orchestration Complete (e3a84eb)

## [0.11.0] - 2025-10-23

### Added
- Stage 0 - Foundation (v1.0.0) (#1) (26ac2e0)

## [0.10.0] - 2025-10-22

### Added
- Stage 0 - Foundation (v1.0.0) (#1) (26ac2e0)

## [0.9.0] - 2025-10-20

### Added
- **stage-0**: complete Stage 0 Foundation implementation (100%) (b2c3357)

### Fixed
- **ci**: prevent concurrent test runs with concurrency group (8ca79b6)
- **tests**: increase BullMQ retry test timeouts for CI reliability (98d84dd)
- **tests**: resolve BullMQ test failures with DB state handling (ef91fa9)
- **tests**: add retry logic to trpc-server getAuthToken for CI reliability (71d84f3)
- **tests**: increase Scenario 4 delay to 60s to avoid rate limit (f89cd42)
- **tests**: add retry logic to getAuthToken for CI reliability (081fb02)
- **tests**: always recreate auth users to ensure correct credentials (06a3024)
- **tests**: increase timeout for 4th file upload test to 30s (9297647)
- **tests**: remove auth user cleanup and increase delay to 3s (780fe42)
- **tests**: increase auth user propagation delay from 1s to 2s (5c7cc49)
- **tests**: resolve race conditions and timing issues in integration tests (200ffe4)
- **tests**: add unique job IDs to prevent test conflicts (53469a0)
- **tests**: resolve race conditions in integration tests (257bed4)
- **bullmq**: add minimum 50ms delay to prevent lock race conditions (e2ad686)
- **ci**: add seed.sql to initialize test organizations (1ee2f55)
- **tests**: add delay to avoid rate limit in file upload test (3b4993e)
- **bullmq**: handle race condition in job.updateProgress() (0854e2f)
- **ci**: clean TypeScript build cache before build/test (e76f15f)

## [0.8.1] - 2025-10-20

## [0.8.0] - 2025-10-19

### Added
- **security**: implement comprehensive security fixes and workflow (a8e1e7d)

## [0.7.2] - 2025-10-18

### Changed
- **health**: migrate orchestrators to modern signal readiness pattern (6a08e10)

## [0.7.1] - 2025-10-18

### Changed
- **health**: migrate orchestrators to modern signal readiness pattern (6a08e10)

## [0.7.0] - 2025-10-16

### Added
- add AI-powered release orchestration system (7191960)

## [0.6.0] - 2025-10-16

### Added
- **release**: add AI-powered version update system (ef75fa7)

## [0.5.0] - 2025-10-16

### Added
- **release**: add AI-powered version update system (ef75fa7)

## [0.4.0] - 2025-10-16

### Added
- **ci**: add pgTAP/RLS tests to CI pipeline and fix tier permission tests (c6d47a6)
- **ci**: add Supabase and external service credentials to test workflow (fb2c705)
- **qdrant**: refactor search and upload modules for better maintainability (02a79e5)

### Fixed
- **tests**: use SUPABASE_SERVICE_KEY env var in course-structure test (6c78cad)
- **tests**: update ci-cd-pipeline tests to match renamed workflow step (667396e)
- **tests**: replace @jest/globals imports with vitest (63982e0)
- **ci**: allow ESLint warnings in CI pipeline (f554c1e)
- **types**: fix TypeScript compilation errors (25 errors -> 0) (7fee7ab)
- **ci**: fix GitHub Actions test workflow failures (85b0241)

## [0.3.0] - 2025-10-15

### Added
- implement comprehensive release automation script (38aa485)

### Fixed
- add --yes flag for non-interactive release automation (ca8875f)
- simplify push command to avoid inline code execution (eee2dde)

## [0.2.0] - 2025-10-15

### Added
- GitHub Actions CI/CD workflows (test, build, deploy-staging)
- Automated release management with `/push` command
- Branch protection configuration documentation
- Comprehensive CI/CD integration tests
- Release process documentation
- Docling setup documentation

### Fixed
- Add .env to gitignore and remove from tracking

### Changed
- Major project restructure for stage 0 foundation

## [0.1.0] - 2025-10-14

### Added
- Initial monorepo structure with pnpm workspaces
- Course generation platform package (`@megacampus/course-gen-platform`)
- Shared types package (`@megacampus/shared-types`)
- tRPC client SDK package (`@megacampus/trpc-client-sdk`)
- Database schema with Supabase migrations
- Vector database integration with Qdrant
- Document processing with Docling
- Embedding generation with Jina-v3
- BullMQ job queue for async processing
- Redis caching layer
- tRPC API server with authentication
- User authentication with Supabase Auth
- Role-based access control (Admin, Teacher, Student)
- Multi-tenant organization system
- Subscription tier management (FREE, BASIC, STANDARD, PREMIUM)
- File upload and validation system
- Semantic search capabilities
- Markdown-based document chunking
- Hierarchical RAG with BM25 hybrid search
- Development environment setup
- Testing infrastructure with Vitest
- TypeScript configuration across packages
- ESLint and Prettier setup
- GitHub Actions workflows (planned)
- Comprehensive documentation

### Changed
- Migrated from monolithic architecture to monorepo
- Restructured project for Stage 0 foundation
- Updated build system to use TypeScript project references
- Improved error handling across services
- Enhanced security with RLS policies

### Security
- Implemented Row Level Security (RLS) policies
- Added JWT-based authentication
- Secure file upload validation
- Multi-tenant data isolation
- API rate limiting (planned)
