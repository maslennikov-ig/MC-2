# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.31.0] - 2026-02-24

### Added

- telegram notifications, lesson materials switcher, and media player improvements (6d3fc26f)
- universalize Gastown commands and add /onboard (efd0299d)
- **stage7**: harden NLM pipeline with local media storage, async lifecycle, and recovery (515a4be0)
- **stage7**: harden NLM audio/video generation pipeline (0e312599)
- **enrichments**: add nlm audio/video generation via notebooklm bridge (b2b88294)
- **course-gen-platform**: add notebooklm bridge FastAPI service (35f2696d)
- **admin**: add generation trace audit page (086e0dd6)

### Fixed

- add data/secrets to gitignore and fix lint errors in scripts/tests (7bf94132)
- **release**: exclude .venv and .gemini/tmp from package.json discovery and gitignore (93782443)
- **analysis**: handle forceRestart in active stage4 states (4e9ae01f)
- **enrichments**: add nlm types to ordered arrays in generation-graph (95570d8f)
- **enrichments**: resolve nlm audio/video contract and type issues (05031c95)
- **ci**: build notebooklm-bridge image for deploy (b70e1ca3)
- **stage6**: add deterministic markdown table remediation (4a623e72)
- **web**: normalize malformed markdown tables (e2a904bd)

### Other

- update Gemini and Codex instruction files with Gastown workflow (fe79fcb0)
- expand Gastown cheatsheet into comprehensive command reference (39401ec9)
- add Gastown analysis and update CLAUDE.md for multi-agent orchestration (9716ae4f)
- **dev**: make start-dev always run local notebooklm bridge (d2fbeb15)
- **dev**: add optional local notebooklm bridge to start-dev (79800965)
- **infra**: wire notebooklm bridge configs and runbook (d60e7237)

## [0.30.11] - 2026-02-20

### Fixed

- **stage6**: improve mermaid diagram remediation pipeline and rendering (f802fe1e)
- **stage6**: prevent intro-vs-section content duplication in lesson generation (b3f0205d)
- **logs**: address code review findings — rate limiter bug, logWarningToDb bypass, inconsistent logger (de935b97)
- **logs**: reduce error log volume with pre-insert filters and double-logging elimination (e53701af)
- **logs**: fix Job not found auto-mute regex and add Redis/Jina patterns (6c574664)

### Other

- add plans and review reports (ef753f3e)
- **logs**: remove dead code — dbLog:false, handleJobStalled, handleJobTimeout (759e0dce)

## [0.30.10] - 2026-02-19

### Fixed

- **stage6**: remove synthetic conclusion flow and guard recap overlap (770b331d)

### Other

- update docs (08e431ea)

## [0.30.9] - 2026-02-19

### Added

- tester feedback fixes — CJK patching, header replacement, mermaid wrapping, sidebar descriptions (a438ae3f)
- **stage6**: add truncation continuation path and reject telemetry (f39c8abe)
- **stage6**: track actual model usage in traces and metadata (245ab0ac)

### Fixed

- code review fixes — mermaid false positives, sidebar i18n, regex safety (bdcd1e32)
- **stage6**: persist regenerationMode to lesson_contents metadata (5ae797ad)
- **stage6**: replace broken upsert with insert in markForReview and handlePartialSuccess (5b19a875)
- **stage6**: set status=published when course generation completes (4a430bbb)
- **web**: fix false-positive unhealthy status in health endpoint (e94dacdd)
- **stage6**: remaining P3 recommendations and test gap coverage (eaeb9d7a)
- **stage6**: code review fixes — P1 regenerationMode bug, upsert alignment, dedup (361618bf)
- **stage6**: fail-open regenerate caps and persist model telemetry (1451017c)
- **stage6**: cap regenerate loops on repeated truncation (0684e10a)
- **stage6**: finalize on terminal lesson statuses (e19810db)
- **stage6**: ignore rejected lessons in completion check (41d00aee)
- **stage6**: run completion check during in-flight partial retries (3ea8f93d)
- **stage6**: make keyword coverage language-aware (5395aee9)
- **stage6**: improve russian keyword coverage heuristics (d2122fea)
- **stage6**: wire 3-tier model routing into job processor (9ff4df80)
- **stage6**: remove stale BullMQ jobs before re-generation (944e00f3)
- **ci**: replace deprecated set-output with GITHUB_OUTPUT env file (d4ee871a)

### Other

- add unit tests for tester feedback fixes — 4 test suites, 66 tests (1957305a)
- Merge branch 'fix/stage6-ru-keyword-coverage' into develop (aa4be5e4)
- retrigger pipeline after flaky contract test failure (fec2bd5f)

## [0.30.8] - 2026-02-18

### Changed

- **stage6**: consolidate helpers, extract FSM transition, batch section queries (92931de2)

### Fixed

- **stage6**: use keyTopics for key_concepts, guard currentIdx=-1, fix import order (6600f8fd)
- **stage6,web**: add lesson_context to partialGenerate, make next-lesson card clickable (089de18a)
- **web**: fix callout block detection in markdown renderers (67425ae6)
- **stage6,web**: deduplicate lesson objectives, improve conclusion, add next-lesson card (a4dbcecc)
- **stage6**: use dedicated stage6 queue for partialGenerate (9ebde8a9)
- **stage6**: skip completion check for partialGenerate jobs (fbd40ebe)
- **json-repair**: downgrade log from ERROR to WARN when all repair strategies fail (783ce4f6)
- **stage6**: pass course style to partialGenerate job data (e82a2bad)

## [0.30.7] - 2026-02-17

### Added

- **stage6**: add cache_hit trace event and document edge cases (8d13c986)
- **stage6**: add tier1_pass trace event and max score logging (6553e278)
- **stage6**: add Two-Tier RAG retrieval to eliminate 75% wasted queries (b4610a8c)

### Fixed

- **course-gen-platform**: update 10 source file(s), update docs, +1 more (f21f46d4)
- **stage7**: increase hardcoded MAX_OUTPUT_TOKENS in quiz/video handlers (23adf3d7)
- **llm**: increase max_tokens for LLM phases and add defensive question filtering (dd4feb9c)
- **llm**: resolve config-seed.json ESM loading error in dev mode (9ba1db0b)
- **types**: add stage_6_rag_planning to Record<PhaseName> fallback configs (1a69ccae)

### Other

- remove stale root-level report files (c084586f)
- **web**: fix dev warnings — allowedDevOrigins, pino externals, baseline-browser-mapping (f57cabc3)
- **stage6**: add unit tests for Two-Tier RAG retrieval (1cb3cdb6)
- **llm**: add stage_6_rag_planning to model config documentation (e2aa5a38)

## [0.30.6] - 2026-02-17

### Added

- **llm**: Gemini caching, config-seed auto-load, code review fixes (4b53bc8c)
- **llm**: replace all Gemini models with gemini-3-flash-preview (bd2f5176)
- **stage6**: update CLEV judge and delta judge models (d7630b49)
- **stage6**: add spelling & typo detection to self-reviewer Phase 2.5 (11b7fdeb)

### Changed

- **stage6**: code review improvements — DRY, logging, readability (7849a10f)

### Fixed

- **types**: add stage_6_rag_planning to PhaseName and CHECK constraint (582fed06)
- **stage6**: correct misleading comment in protectMarkdownElements restore (54f4ceb9)
- **stage6**: address code review findings for CJK auto-fix (5c7bf8a7)
- **deploy**: restart workers during Blue/Green deployment (95917804)
- **stage6**: add 3-layer CJK character auto-fix in self-reviewer (8c2521b7)

### Other

- **llm**: add unit tests for loadDefaultPhaseConfigs config-seed loader (3f278e3f)

## [0.30.5] - 2026-02-17

### Fixed

- **stages**: add non-retryable bail-out to Stage 4 and Stage 6 retry loops (470d07ed)

### Other

- update docs (01bff0ae)

## [0.30.4] - 2026-02-17

### Fixed

- **stage5**: prevent infinite retry loop on section count mismatch (68855d98)
- **stage4**: use Stage 3 LLM priorities in prepareDocumentInfos instead of size heuristic (4f16a5c1)
- **web**: add startup grace period to health check endpoint (1b1616db)
- **stage4**: pass tokenCount to getModelForPhase in Phase 0.5 and Phase 2 (6b063e10)
- **ci**: distinguish cancelled/skipped from failed in Telegram notifications (a68b3393)
- **ci**: repair deploy verification and test failures (cccef329)
- **tests**: unskip 3 generate-on-demand tests by fixing mock gaps (d6637870)
- **tests**: repair 4 pre-existing test failures (17eaa977)

### Other

- update 1 skill(s), update docs (aa46d0e1)
- **stage4**: add runtime validation for Stage 3 priority values (141f5b12)
- **process-logs**: sync auto-mute docs with code (53 → 56 rules) (bc7e9788)

## [0.30.3] - 2026-02-16

### Fixed

- **course-gen-platform**: add warning logs when preprocessing filters short tags/prerequisites (63a3483c)

### Other

- **course-gen-platform**: update auto-mute rule count comment (52 → 54) (f3690a92)
- **course-gen-platform**: add unit tests for Phase 3 Zod validation repair path (8a179117)

## [0.30.2] - 2026-02-16

### Fixed

- **course-gen-platform**: route Zod validation through UnifiedRegenerator, fix metadata min-length, add auto-mute rules (f0fb8a8b)
- **course-gen-platform**: sync thin stage5 prompt in db (12228ef2)

### Other

- update docs (cbbbbb60)

## [0.30.1] - 2026-02-16

### Fixed

- **course-gen-platform**: update 3 source file(s), update 1 test(s), +1 more (52424970)

## [0.30.0] - 2026-02-16

### Added

- add 1 skill(s), update 5 agent(s), +2 more (b5c7ea70)
- **stage4**: migrate phases 1, 3, 4 to PromptService with typed contracts (6be9a309)
- **prompts**: add type-safe PromptVariableMap + contract validation tests (308e6e9f)
- **stages 4-5**: add pedagogical guidance, optimize prompts, migrate to PromptService (99fb2260)
- **stage6**: coherence patcher rejection tests + mermaid pipeline admin monitoring (ca6f625b)
- **stage5**: sequential section generation with digest accumulation (dd770d06)
- **stage4**: budget-aware Phase 3 truncation + system prompt reserve (9b3e5407)
- **stage4**: wire Budget Allocator to phases + DB-driven model config (ac50c93e)
- **stage5**: add overlap retry loop for cross-section deduplication (2d18962f)
- **stage4**: add semantic overlap detection to Phase 2 sections_breakdown (44dbac89)
- **stage6**: add course position awareness to lesson generation (61348bf6)
- **stage6**: persist lessonDigest and enrich summary_preview from DB (f7f66473)

### Changed

- **stage5**: extract shared buildFallbackSearchQueries + add Stage 5→6 integration test (c85b11e2)
- **stage4**: remove dead logDuplicateKeyTopics function (57007f63)

### Fixed

- **health**: return 503 when heap usage exceeds 90% (491f1098)
- health check — 18 bugs fixed (3 critical, 5 high, 7 medium, 3 low) (69b00fbc)
- **web**: MermaidDirect error state recovery on chart prop change (354d636f)
- **stage6**: add try/catch to mermaid pipeline calls + update README (1023339b)
- **stage6**: upgrade targeted refinement to full mermaid fix pipeline (d582272b)
- **stage6**: add prompt template validation to section-regenerator and coherence patcher (38d926b6)
- **shared-types**: fix LessonRAGContextV2 Zod schema rejecting empty primary_documents (520e9bdc)
- **stage5**: fix RAG sentinel bug, remove dead code, deprecate document_relevance_mapping (478f5c20)
- **stage5**: code review fixes — sanitization, edge cases, dead code cleanup (a5ff8242)
- **web**: fix 40 failing tests across 17 test files (14ec3938)
- **stage4**: code review fixes — warning logs, ordering invariant, doc headers (a641d4be)
- **web**: thread courseLanguage to admin generation-graph panels (6cde4647)
- **web**: parse and localize markdown callout blocks ([!TIP], [!WARNING], etc.) (abca7614)
- **stage4**: budget allocator overflow + context handler improvements (41a50c79)
- **web**: remove y-axis animation to prevent scroll jump on lesson load (b2a5c078)
- **tests**: update lesson-context and classifier tests for new behavior (5611533b)
- **stage5**: use const for non-reassigned variable (lint) (3cdaea5e)
- **web**: resolve empty mermaid SVG caused by render race condition (0bda5335)
- **stage6**: add mermaid sanitization to all LLM content paths (61526476)
- **pipeline**: correct JOB_TYPE_TO_STEP mapping, progress messages, and error metadata (b83078c5)
- **stage5**: filter short course_tags before RT-006 validation (10cc23e5)
- **course-gen-platform**: complete code review fixes for single-call generation (ec9ebbae)
- **course-gen-platform**: address code review findings for single-call generation (49927618)

### Other

- **web**: add 42 unit tests for MermaidDirect component (c40ef2a7)
- **stage4**: clarify PromptService migration status for each phase (b529fcee)
- **stage6**: clarify log-only vs reject validation pattern in section-regenerator (184b51b9)
- **stage5**: remove dead enrichBatchContext tests from qdrant-search.test.ts (a7a0e720)
- **stage5**: add unit tests for buildSectionDigest and sanitizeDigest (8fdbd909)
- update i18n guide with current namespaces, content labels, and stage 7 migration status (0e804b61)
- add missing Stage 4 DB records for ru + extended tiers (89ed4f56)
- switch Stage 4 Synthesis from kimi-k2-0905 to cheap models (0d4ca72a)
- **overlap**: add end-to-end overlap retry flow tests for Stage 4 and Stage 5 (95e0b53d)
- **overlap**: add unit tests for Stage 4 and Stage 5 overlap detection (dfab0a52)
- **beads**: migrate to Dolt backend with CGO support (1bfb8eb5)
- **beads**: add bd hooks to husky and configure sync-branch (3a8a3a21)
- **beads**: update gitignore for bd 0.50.3 patterns (2c5f91fd)
- **beads**: fix doctor warnings — gitignore, stale molecules, role (4ccb4d24)
- **beads**: sync issues — create tasks for stage6 audit findings (d92b0ad2)
- bd daemon export: 2026-02-15 15:31:39 (149149f6)
- bd daemon export: 2026-02-15 15:31:38 (98c3b100)
- bd daemon export: 2026-02-15 15:31:37 (cd339768)
- bd daemon export: 2026-02-15 15:31:36 (866c6147)
- bd daemon export: 2026-02-15 10:59:58 (ce158b28)
- bd daemon export: 2026-02-15 10:58:28 (678bb7c8)
- bd daemon export: 2026-02-15 10:56:34 (599672a4)
- bd daemon export: 2026-02-15 10:56:29 (99628273)
- bd daemon export: 2026-02-15 10:56:27 (bfc24841)

## [0.29.15] - 2026-02-14

### Added

- **course-gen-platform**: replace section-by-section with single-call lesson generation (1fc3eb1d)

### Fixed

- **course-gen-platform**: refactor chat editing system + code review fixes (52de40d6)
- **course-gen-platform**: fix chat config duplicates + Phase 0.5 Zod validation + auto-mute rules (5e5d1950)

### Other

- bd daemon export: 2026-02-14 22:06:55 (4f0ac1e9)
- bd daemon export: 2026-02-14 21:37:39 (a8c57b33)
- bd daemon export: 2026-02-14 21:37:34 (99418aa9)
- bd daemon export: 2026-02-14 20:50:10 (17584cef)
- bd daemon export: 2026-02-14 20:50:09 (63945abd)
- bd daemon export: 2026-02-14 20:42:41 (077647d3)
- bd daemon export: 2026-02-14 20:42:36 (b98a47a5)
- bd daemon export: 2026-02-14 20:42:35 (d78abdac)
- bd daemon export: 2026-02-14 20:32:25 (443fa13a)
- bd daemon export: 2026-02-14 20:32:24 (33532dda)
- bd daemon export: 2026-02-14 20:32:23 (9e3bbaaa)
- bd daemon export: 2026-02-14 20:23:02 (cd543475)
- bd daemon export: 2026-02-14 20:23:00 (01ec7943)
- bd daemon export: 2026-02-14 20:22:46 (f32305e6)

## [0.29.14] - 2026-02-14

### Fixed

- **course-gen-platform**: update 4 source file(s), update docs (c07a0301)

## [0.29.13] - 2026-02-14

### Fixed

- **course-gen-platform**: update 15 source file(s), update docs (1676f109)

## [0.29.12] - 2026-02-14

### Added

- Phase 4 course_nodes flat relational migration with dual-write (c19f7493)
- **web**: add Stage 6 content generation CTA for newly added lessons (605ef19f)
- protect 23 LLM-facing z.enum() with createLLMEnumSchema helper (8832032a)
- **chat**: Phase 3 — context optimization with course skeleton (7ebf2f25)
- **chat**: Phase 2 — surgical operations with stable IDs (b06e0907)
- **chat**: Phase 1 — remove toggle, auto-intent classification (abc08ece)
- **chat**: Phase 0 — stable IDs + chat model config foundation (5a812b65)

### Changed

- **web**: extract shared toActionError, replace Russian strings, use client-logger (4f5ee892)

### Fixed

- **course-gen-platform**: update 3 source file(s), update 1 test(s), +2 more (948f6167)
- distinguish transient DB failure from missing config in fetchPhaseConfigFromDb (870c2fd8)
- address round 16 code review findings (fail-fast + clarification cards) (7a439a3b)
- address round 15 code review findings (4 fixes) (bc8107aa)
- address round 14 code review findings (FULL_REGENERATE regex + lesson_number format) (fc14c264)
- resolve positional reference ambiguity when both element types present (66d84db0)
- add positional reference resolution (first/last) to target-resolver (34381819)
- address round 11 code review findings (Phase 4 alignment + heuristics) (71ad9044)
- add chat phase hardcoded fallbacks + guard content.sections iteration (7e2bbc1f)
- address 7 code review findings (round 10) (16abf3cc)
- address round 9 code review findings (flaky regex + false-green + stubs) (d729f69c)
- address round 8 code review findings (integration tests + backfill retry) (d030449c)
- address round 7 code review findings (backfill retry + integration tests) (f33a9454)
- address 5 code review findings (round 6) (18ca5223)
- address 8 code review findings (round 5) (7dc211f4)
- address 6 code review findings (round 4) + parent integrity trigger (6b940537)
- address 6 code review findings (round 3) (be776de3)
- align implementation with plan requirements (9 findings) (90ef4914)
- targeted Stage 6 content generation for new lessons + parity monitoring (b653146c)
- count actual affected elements in delete ratio validation (48b70569)
- ensure stable IDs before course_nodes dual-write (f79ada3c)
- **chat**: route explicit intent=regenerate to actual job queue instead of legacy LLM flow (102df930)
- **web**: add NextIntlClientProvider wrapper to useRefinement tests (e5bd9384)
- **chat**: complete Phase 2-3 audit — prompt caching, structural flag, token benchmark, Stage 6 CTA (86f9faae)
- **chat**: audit fixes — FULL_REGENERATE job, stable ID proposals, ensureStableIds in apply, Stage 6 CTA (6b39e6e0)
- resolve generation.initiate failure, Stage 5 enum mismatch, CSP blocking (4c20b638)
- **web**: correct misleading "exponential backoff" comment (0ba464ad)

### Other

- remove LLM benchmarks (migrated to aidevteam) (f4aea6f6)
- bd daemon export: 2026-02-14 12:29:29 (2ae61e53)
- bd daemon export: 2026-02-14 12:29:28 (70107b1f)
- bd daemon export: 2026-02-14 12:26:25 (e6f0314b)
- bd daemon export: 2026-02-14 12:26:21 (6476bdfc)
- bd daemon export: 2026-02-14 12:25:12 (41bfc6b7)
- bd daemon export: 2026-02-14 12:25:11 (8ef4fd54)
- bd daemon sync: 2026-02-13 08:02:14 (ed0ed0fc)
- **chat**: add unit tests for executeFullRegenerate function (9d51b43d)
- code review improvements — tests, clarity, body parser guard (abd4868b)
- bd daemon export: 2026-02-12 17:33:30 (906c17d5)
- bd daemon export: 2026-02-12 17:33:29 (9170ede9)
- bd daemon export: 2026-02-12 17:26:06 (47f0a555)
- bd daemon export: 2026-02-12 17:26:04 (255485b0)
- bd daemon export: 2026-02-12 17:26:03 (433cb654)
- bd daemon export: 2026-02-12 17:18:47 (759d6fc4)
- bd daemon export: 2026-02-12 17:18:43 (6345df32)
- bd daemon export: 2026-02-12 17:18:35 (979a891a)
- bd daemon export: 2026-02-12 17:12:53 (72ea70ca)
- bd daemon export: 2026-02-12 17:03:09 (672231e9)
- bd daemon export: 2026-02-12 17:02:57 (c72ab05e)
- bd daemon export: 2026-02-12 17:02:39 (e5ca197e)
- bd daemon export: 2026-02-12 17:00:35 (48b72c77)
- bd daemon export: 2026-02-12 17:00:26 (66f37c22)
- bd daemon export: 2026-02-12 16:11:59 (5ffaa301)
- bd daemon export: 2026-02-12 16:11:52 (8584e2c6)
- bd daemon export: 2026-02-12 16:10:53 (cb5278e6)
- bd daemon export: 2026-02-12 16:10:33 (1c100a45)
- bd daemon export: 2026-02-12 16:10:24 (57b98c9c)
- bd daemon export: 2026-02-12 16:10:17 (74e5b233)
- bd daemon export: 2026-02-12 16:10:08 (37dc98e0)
- bd daemon export: 2026-02-12 16:10:03 (bf2e3325)
- bd daemon export: 2026-02-12 16:09:54 (4fdd29eb)
- bd daemon export: 2026-02-12 16:09:47 (5dff7ab5)
- bd daemon export: 2026-02-12 16:09:41 (a82dcdf9)
- bd daemon export: 2026-02-12 15:58:15 (bde62498)
- bd daemon export: 2026-02-12 15:53:33 (8b40a6c4)
- bd daemon export: 2026-02-12 15:53:25 (6485c521)
- bd daemon export: 2026-02-12 15:53:17 (b48db32f)
- bd daemon export: 2026-02-12 15:53:16 (58f93277)
- bd daemon export: 2026-02-12 15:53:14 (0a6d1e62)

## [0.29.11] - 2026-02-12

### Changed

- **web**: remove 25 as-any casts from tRPC-migrated server actions (c0a0a91d)

### Fixed

- **web**: fix build blocker, remove upload as-any casts, rewrite enrichment tests (a25490c8)
- **web**: migrate client-side hooks from raw fetch to tRPC client (Phase 4) (c50c8765)
- **web**: migrate raw fetch() calls to tRPC client (Phases 1-3) (5afeb289)

### Other

- update docs (e5d83f73)
- **web**: remove duplicate useEnrichmentGeneration test (6838da38)
- bd daemon export: 2026-02-12 14:59:32 (1d4f1199)
- bd daemon export: 2026-02-12 14:52:53 (dcc0f0cf)
- bd daemon export: 2026-02-12 14:52:50 (01b10f7d)
- bd daemon export: 2026-02-12 14:49:22 (5f9a8efa)
- bd daemon export: 2026-02-12 14:41:57 (a0af09dc)
- bd daemon export: 2026-02-12 14:41:56 (3717d8b9)
- bd daemon export: 2026-02-12 14:41:52 (ede19129)
- bd daemon export: 2026-02-12 14:20:18 (fa1c3968)
- bd daemon export: 2026-02-12 14:20:17 (9d7373bd)
- bd daemon export: 2026-02-12 14:20:15 (5b2e0975)
- bd daemon export: 2026-02-12 14:20:10 (a8f0b6d7)

## [0.29.10] - 2026-02-12

### Fixed

- staging deploy chown + contract tests BullMQ ESM crash (7382f3fc)

### Other

- update docs (ab8d778e)

## [0.29.9] - 2026-02-12

### Added

- **web**: add 3 source file(s), update 1 source file(s), +1 more (01c0da53)
- **jina**: replace in-process rate/concurrency limiters with Redis-based distributed versions (7648f119)

### Fixed

- **tests**: remove BullMQ worker from contract tests (e88226ca)
- **auth**: add local JWT verification fallback for test environments (dd939dc9)
- **tests**: remove fake session_id from mock JWT + fix reregeneration typo (aeff1b60)
- **tests**: fix 32 CI contract test failures — JWT secret, stale enums, wrong namespace (3e82eb2c)
- **stage4**: add .default() to SuggestedAnswerSchema.rationale for LLM output resilience (f7eb27b8)

### Other

- upgrade Node.js from 20 to 22 (Active LTS) (2537f573)
- bd daemon export: 2026-02-12 11:16:38 (b62c830d)
- bd daemon export: 2026-02-12 11:09:51 (7b3fa017)
- bd daemon export: 2026-02-12 11:08:30 (e7eca65b)
- bd daemon export: 2026-02-12 10:57:27 (e8f08eff)
- bd daemon export: 2026-02-12 10:20:09 (4dab1a64)
- bd daemon export: 2026-02-12 10:20:05 (85d40d18)
- bd daemon export: 2026-02-12 09:53:10 (5e58e11c)
- bd daemon export: 2026-02-12 09:49:27 (6aed30b4)
- bd daemon export: 2026-02-12 09:49:22 (699ded6e)
- bd daemon export: 2026-02-12 09:47:31 (ece5ebe5)
- bd daemon export: 2026-02-12 09:16:29 (2dc4e559)
- bd daemon export: 2026-02-12 09:16:24 (4c878e24)
- bd daemon export: 2026-02-12 09:11:13 (aa39a70b)
- bd daemon export: 2026-02-12 08:42:58 (49b9a731)
- bd daemon export: 2026-02-11 22:10:34 (3991eabd)
- bd daemon export: 2026-02-11 22:10:30 (bc784560)

## [0.29.8] - 2026-02-11

### Changed

- code review tech debt — DRY model constants, ModelConfigService migration, startup validation (315f882f)

### Fixed

- **lint**: resolve 23 ESLint errors across web package + suppress test false positives (55d7d2f8)
- **chat**: address code review findings CR-004/005/006/007/009/010 (5ac360d6)
- **chat**: fix 500 error, add stage-specific models, replace deprecated models (276b4646)
- **refinement-chat**: improve JSON content detection (46f16985)
- **bunker**: use randomUUID for atomic temp files instead of process.pid (e5225d64)
- **logger,stage4**: LKG race condition, error serialization, rationale validation (c8dff77c)
- **chat**: improve JSON detection + add trim guard + telemetry (code review) (c4e6707e)
- **chat**: prevent empty chat bubbles and blank lesson content (EGT-1521, GDK-6714) (dfa17983)

### Other

- bd daemon export: 2026-02-11 21:52:43 (3d800f1b)
- bd daemon export: 2026-02-11 21:52:41 (1654f52c)
- bd daemon export: 2026-02-11 21:52:39 (35217c54)
- bd daemon export: 2026-02-11 21:45:52 (3e9498b2)
- bd daemon export: 2026-02-11 21:45:51 (68d3fd63)
- bd daemon export: 2026-02-11 21:45:50 (e8a730b5)
- bd daemon export: 2026-02-11 21:24:19 (b077fde3)
- bd daemon export: 2026-02-11 21:24:16 (f35165b6)
- bd daemon export: 2026-02-11 21:24:14 (9c4ca116)
- bd daemon export: 2026-02-11 20:29:41 (e2b12d27)
- bd daemon export: 2026-02-11 20:09:29 (a9469a4a)
- bd daemon export: 2026-02-11 20:09:24 (2a3d2137)
- bd daemon export: 2026-02-11 14:12:42 (8e8a3172)
- bd daemon export: 2026-02-11 13:59:32 (dbd54580)
- bd daemon export: 2026-02-11 13:59:28 (152d9b8f)
- bd daemon export: 2026-02-11 12:09:01 (808148c9)
- bd daemon export: 2026-02-11 12:06:36 (52bf5ed0)
- bd daemon export: 2026-02-11 12:05:39 (cb94a0ab)
- bd daemon export: 2026-02-11 11:55:40 (71aa03b1)
- bd daemon export: 2026-02-11 11:50:32 (5ab168a7)
- bd daemon export: 2026-02-11 11:50:27 (cfc19876)
- update aidevteam server audit — all fixes applied (da56ad23)

## [0.29.7] - 2026-02-10

### Security

- aidevteam server audit — cryptominer killed, ports fixed (d4e4bc9d)
- server hardening — SSH, Bull Board, nginx, kernel update (70a483b3)

### Added

- add CategoryBadge to ClarifyingPanel wizard + bulk error log cleanup (54c35dbe)
- **logs**: add auto-resolve RPC for stale to_verify fingerprints (00818944)

### Changed

- split 5 largest files into modular structure (5b1d9451)
- split prompt-registry.ts into per-stage modules (1e0ed052)

### Fixed

- **chat**: empty assistant bubble + irrelevant proposals in refinement chat (508572ae)
- add ARIA labels + 44 unit tests for CategoryBadge (235a2077)
- address code review findings from refactoring (cc4c3917)
- **tests**: update 14 stale judge tests to match current implementations (0410c481)
- **tests**: mock Supabase Auth tokens locally to eliminate flaky CI failures (dd917931)
- **i18n**: extract hardcoded strings from RefinementChat + useRefinement (74f123b5)

### Other

- update docs (88d76615)
- bd daemon export: 2026-02-10 20:49:37 (6aa279d7)
- bd daemon export: 2026-02-10 20:46:27 (2767810f)
- bd daemon export: 2026-02-10 20:45:42 (7a1883b9)
- bd daemon export: 2026-02-10 20:45:41 (82ac41ea)
- bd daemon export: 2026-02-10 20:45:32 (94533fcd)
- bd daemon export: 2026-02-10 20:45:31 (b8be08a3)
- bd daemon export: 2026-02-10 20:06:57 (56103e90)
- bd daemon export: 2026-02-10 20:01:29 (88fe294b)
- bd daemon export: 2026-02-10 20:01:23 (25c3e3bc)
- bd daemon export: 2026-02-10 18:03:39 (7484b8c8)
- bd daemon export: 2026-02-10 16:37:05 (f0f0f8a9)
- bd daemon export: 2026-02-10 16:36:53 (55424fc2)
- bd daemon export: 2026-02-10 16:36:51 (2337b500)
- bd daemon export: 2026-02-10 16:36:50 (a48c69ae)
- bd daemon export: 2026-02-10 16:35:08 (8eae646b)
- bd daemon export: 2026-02-10 16:35:01 (bf33995f)
- bd daemon export: 2026-02-10 16:35:00 (e5227d1a)
- bd daemon export: 2026-02-10 16:34:59 (a088f4cb)
- bd daemon export: 2026-02-10 16:28:03 (e72b8955)
- bd daemon export: 2026-02-10 16:14:02 (24df61cf)
- bd daemon export: 2026-02-10 16:08:15 (0b344e91)
- bd daemon export: 2026-02-10 16:03:03 (d99c30dc)
- bd daemon export: 2026-02-10 16:02:55 (3077763c)
- bd daemon export: 2026-02-10 16:00:16 (df09f066)

## [0.29.6] - 2026-02-10

### Added

- add Phase 0.5 unit tests + Admin Clarifying Q&A tab (c128250a)
- **stage4**: pass course_description to Phase 1/2 + expand Phase 0.5 clarifying system (690cfe54)

### Fixed

- **chat**: code review v2 — dedup ChatMessage, fix rejectProposal cleanup, add 6 tests (4bfa2e30)
- **chat**: address code review findings — skeleton, redundant check, generic message (f16d1c1e)
- **chat**: add Reject button + post-accept guidance message (22dd7ef4)
- **chat**: improve chat UX — remove toast, keep proposal after accept, add Stage 6 per-lesson chat (a745089a)
- **stage4**: address code review findings for Phase 0.5 multi-round clarification (0910efae)

### Other

- bd daemon export: 2026-02-10 15:21:19 (d2edf982)
- bd daemon export: 2026-02-10 14:39:07 (37188049)
- bd daemon export: 2026-02-10 14:31:59 (59134ad5)
- bd daemon export: 2026-02-10 14:31:53 (e7352656)

## [0.29.5] - 2026-02-10

### Security

- add authentication to Telegram webhook endpoint (mc2-gqfj) (d7fcd587)

### Added

- **web**: sync full_name to auth metadata on profile save (524564e5)

### Fixed

- **worker**: resolve log warnings from course generation QGN-6607 (eebd44ef)
- address code review HIGH findings — IPv6 SSRF + cleanup audit trail (fb149c4b)
- healthcheck cycle — auth, types, atomic deletion, security hardening (54e55885)
- **web**: replace i18n 'as any' with '@ts-expect-error' + add SSRF protection (1d489750)
- **security**: timing-safe metrics API key comparison (236a379b)
- healthcheck batch 2 — 6 bugs fixed, bundle optimization (98caead2)
- **web**: improve auth sync error handling + sync avatar_url (3e920773)
- **security**: healthcheck — 9 bugs fixed (5 critical, 3 high, 1 medium) (74122fa8)

### Other

- update 5 agent(s), update docs (7674eb7b)
- bd daemon export: 2026-02-10 12:18:21 (9d145f6a)
- bd daemon export: 2026-02-10 12:10:12 (6fa1ba10)
- bd daemon export: 2026-02-10 12:10:06 (260dbd4a)
- bd daemon export: 2026-02-10 12:10:05 (d5d974b7)
- bd daemon export: 2026-02-10 12:10:03 (8636d76b)
- bd daemon export: 2026-02-10 11:20:29 (855cfb1e)
- bd daemon export: 2026-02-10 11:12:23 (c6b3b95a)
- add healthcheck code review report (Feb 2026) (fc2aef15)
- bd daemon export: 2026-02-10 09:40:04 (1967a9d8)
- bd daemon export: 2026-02-10 09:39:59 (fc519acd)
- bd daemon export: 2026-02-10 09:39:56 (b67630c1)
- bd daemon export: 2026-02-10 09:39:55 (ad8892d1)
- bd daemon export: 2026-02-10 09:39:53 (fd3bdf9a)
- bd daemon export: 2026-02-10 09:39:48 (60a25ca5)
- bd daemon export: 2026-02-10 09:39:47 (5277e8bc)
- bd daemon export: 2026-02-10 09:39:46 (5425dcc9)
- bd daemon export: 2026-02-10 09:39:47 (4fa325c4)
- bd daemon export: 2026-02-10 09:39:46 (490204b9)
- bd daemon export: 2026-02-10 09:33:06 (fbf48c85)
- bd daemon export: 2026-02-10 09:33:02 (e7dfd747)
- bd daemon export: 2026-02-10 09:30:20 (45f33478)
- bd daemon export: 2026-02-10 09:29:30 (6905c2e6)
- bd daemon export: 2026-02-10 09:25:11 (e290e87f)
- bd daemon export: 2026-02-10 09:21:05 (49da4317)
- bd daemon export: 2026-02-10 09:17:57 (0513c064)
- bd daemon export: 2026-02-10 09:17:54 (0c2899f6)
- bd daemon export: 2026-02-10 09:17:52 (373fdb60)
- bd daemon export: 2026-02-10 09:11:12 (ff43aa6a)
- bd daemon export: 2026-02-10 09:11:09 (333d5f79)
- bd daemon export: 2026-02-10 09:11:02 (67671465)
- bd daemon export: 2026-02-10 08:58:10 (76a1ef8d)
- bd daemon export: 2026-02-10 08:58:08 (9945f9c0)
- bd daemon export: 2026-02-10 08:58:07 (6a18e531)
- bd daemon export: 2026-02-10 08:58:05 (dfb79c23)
- bd daemon export: 2026-02-10 08:58:04 (aef19004)
- bd daemon export: 2026-02-10 08:58:03 (7df23771)
- bd daemon export: 2026-02-10 08:57:41 (7f193a99)
- bd daemon export: 2026-02-10 08:57:08 (f90d1157)
- bd daemon export: 2026-02-10 08:57:07 (adf5da53)
- bd daemon export: 2026-02-10 08:57:05 (ef50b7eb)
- bd daemon export: 2026-02-10 08:48:56 (a2aa6c8e)
- bd daemon export: 2026-02-10 08:48:21 (6a7ca752)
- bd daemon export: 2026-02-10 08:47:33 (00354b19)
- bd daemon export: 2026-02-10 08:46:28 (f355e3f9)
- bd daemon export: 2026-02-10 08:45:45 (2ba6c105)
- bd daemon export: 2026-02-10 08:45:43 (3e60eb52)
- bd daemon export: 2026-02-10 08:45:41 (d41b32c4)
- bd daemon export: 2026-02-10 08:45:40 (26590a86)
- bd daemon export: 2026-02-10 08:45:37 (eb6ece5b)
- bd daemon export: 2026-02-10 08:45:31 (1e4de84d)
- bd daemon export: 2026-02-10 08:45:28 (fec05c27)
- bd daemon export: 2026-02-10 08:45:24 (0403aeb3)
- bd daemon export: 2026-02-10 08:45:21 (567f8dce)
- bd daemon export: 2026-02-10 08:45:18 (5368eee1)
- bd daemon export: 2026-02-10 08:45:16 (c98f1df8)
- bd daemon export: 2026-02-10 08:45:14 (c7ee2621)
- bd daemon export: 2026-02-10 08:45:11 (6e5f13e8)
- bd daemon export: 2026-02-10 08:31:40 (09b48e00)
- bd daemon export: 2026-02-10 08:29:53 (da0a5d09)
- bd daemon export: 2026-02-10 08:29:30 (efca56e7)
- bd daemon export: 2026-02-10 08:28:31 (712e9871)
- bd daemon export: 2026-02-10 08:28:30 (34f4719b)
- bd daemon export: 2026-02-10 08:25:53 (01932ca4)
- bd daemon export: 2026-02-10 08:25:51 (3ec9bdc1)
- bd daemon export: 2026-02-10 08:25:50 (fc862953)
- bd daemon export: 2026-02-10 08:25:46 (ec369e48)
- bd daemon export: 2026-02-10 08:25:44 (45aeda16)
- bd daemon export: 2026-02-10 08:25:42 (7c0f6927)
- bd daemon export: 2026-02-10 08:25:41 (9f6cd325)
- bd daemon export: 2026-02-10 08:25:39 (734e3dce)
- bd daemon export: 2026-02-10 08:25:33 (1764d911)
- bd daemon export: 2026-02-10 08:25:32 (37e182f3)
- bd daemon export: 2026-02-10 08:25:30 (a36b9f45)
- bd daemon export: 2026-02-10 08:25:29 (07a4d00f)
- bd daemon export: 2026-02-10 08:25:27 (b4ef01ef)

## [0.29.4] - 2026-02-09

### Added

- **stage6**: pass lessonSpec to LessonInspector Blueprint tab (3407df8a)
- **pipeline**: add unified course-level token tracking (31e2a1aa)
- **ui**: add token aggregation to ModuleDashboard (daff2fb4)
- **error-handling**: standardize wrapTRPCError with AppError/PipelineError support (6d8e716a)
- **shared-utils**: create shared-utils package and migrate imports (0cfb492c)
- **web**: migrate env.ts to @t3-oss/env-nextjs with Zod validation (0c2c37c4)

### Changed

- **dry**: extract completePhaseWithTrace, getErrorMessage, progress constants (8bee6c4b)
- **lint**: structural batch 3 — extract 14 top-warning files into helpers (158→119 warnings) (9a0026cd)
- **review**: implement code review recommendations — type safety, constants, docs (1165a065)
- **lint**: structural batch 2 addendum — split phase-2-scope + phase-6-summarization (8 warnings fixed) (4b0f68ef)
- **lint**: structural batch 2 — split 7 large files (30 warnings fixed) (9f1772c8)
- **lint**: structural batch 1 — split 3 largest router files (18 warnings fixed) (50e5d51d)
- **stage4**: remove dead Phase 6 RAG Planning code (1e93bc5e)
- remove dead code InitializeJobHandler (mc2-qt9i) (01ccb5c9)
- **api**: split lifecycle.router.ts into lifecycle/ subdirectory (280c0097)
- **web**: consolidate validation-utils.ts into validation.ts (3496658d)
- **shared-utils**: narrow normalizeLanguageCode return type, remove unknown code passthrough (e6d40e06)
- **shared-utils**: code review improvements — named constants, JSDoc, fallback param, tests (36041574)
- consolidate formatNumber, formatFileSize, sanitization configs to shared packages (a3404e16)
- **course-gen-platform**: replace `as string` assertions with getTextContent() for LangChain messages (c72aab21)

### Fixed

- **web**: update 1 source file(s), update 5 agent(s), +1 more (64483538)
- **ci**: build shared packages before lint to resolve type-aware rules (bb2608ff)
- **lint**: add JSDoc and standardize error handling in batch 3 helpers (bc5ca4f5)
- **web**: refetch traces on stage restart to clear stale error nodes (d9dc62be)
- **tests**: replace inline getAuthToken with centralized singleton in generation contract tests (c6faa188)
- **lint**: code review fixes — Supabase types, re-exports, floating promise (45baee55)
- **web**: resolve TS7030 in GlobalCourseChat useEffect — not all code paths return value (1d8f5359)
- prevent test errors in prod logs + auto-mute rules for infra errors (a7262256)
- cap totalSections to available sections in Stage 5 (B1) (b8e5dea7)
- clean up courseEntries on eviction and metrics on cancellation (CR follow-up) (7736ff96)
- memory/resource leak audit fixes (mc2-yqyx) (7e5284cc)
- **docker**: add shared-utils to both API and Web Dockerfiles (64fcf0ce)
- **lint**: batch 6 — fix all 108 remaining fixable ESLint warnings (5c03b042)
- **ui**: rename misleading "Regenerate All" button to "Retry Failed" (116f23f4)
- **web**: extract uuid-validation to avoid jsdom in API route bundles (910c4fa1)
- **pipeline**: idempotent token tracking — no double-count on retry (CR-006) (d34afe7a)
- add missing migration file and fix zero-token display (CR-001, CR-009) (779a08a0)
- **lint**: batch 5 — fix 39 ESLint warnings in 7 files (ee4bafc1)
- **ci**: add shared-utils build step to CI pipeline (3eb45e91)
- **api**: apply 3 remaining code review improvements (77e01b78)
- **course-gen-platform**: fix 82 ESLint warnings in batch 4 (10 files) (61f76741)
- **api**: apply code review fixes to lifecycle sub-routers (f2f10997)
- **course-gen-platform**: fix 81 ESLint warnings in batch 3 (handlers, routers, judges, prompts) (73c0c3c5)
- **course-gen-platform**: fix 85 ESLint warnings in batch 2 (logger, client, routers, sanitizer) (88f5ccf9)
- **course-gen-platform**: fix 135 ESLint warnings in benchmarks, regeneration and chat routers (126fa6f6)
- **web**: address code review findings for env migration (deff7008)
- **course-gen-platform**: code review follow-up improvements (e04e3227)

### Other

- bd daemon export: 2026-02-09 21:05:27 (1f16f3b1)
- bd daemon export: 2026-02-09 21:05:20 (814bb49f)
- bd daemon export: 2026-02-09 21:05:14 (8a3884cc)
- bd daemon export: 2026-02-09 19:48:08 (4d66166d)
- bd daemon export: 2026-02-09 19:40:36 (3008222e)
- bd daemon export: 2026-02-09 19:40:31 (058c5330)
- bd daemon export: 2026-02-09 19:09:42 (b07cd76c)
- bd daemon export: 2026-02-09 19:09:40 (4a29906d)
- bd daemon export: 2026-02-09 19:07:48 (b412f386)
- bd daemon export: 2026-02-09 19:07:47 (b14a8aa6)
- bd daemon export: 2026-02-09 18:55:52 (b7def577)
- bd daemon export: 2026-02-09 18:55:50 (ad1a6075)
- bd daemon export: 2026-02-09 18:50:54 (5691e5cf)
- bd daemon export: 2026-02-09 18:12:51 (879e394b)
- bd daemon export: 2026-02-09 17:57:19 (0cfc94f8)
- bd daemon export: 2026-02-09 17:47:29 (9899cf0b)
- bd daemon export: 2026-02-09 17:47:25 (e0bbe876)
- bd daemon export: 2026-02-09 17:41:45 (d878ccc9)
- bd daemon export: 2026-02-09 17:39:36 (095b0e4e)
- bd daemon export: 2026-02-09 17:39:32 (fa30bd7b)
- bd daemon export: 2026-02-09 17:22:04 (f36ef46a)
- bd daemon export: 2026-02-09 17:18:23 (8121b1ed)
- bd daemon export: 2026-02-09 17:18:18 (6b65a5aa)
- bd daemon export: 2026-02-09 17:17:46 (4fef387b)
- bd daemon export: 2026-02-09 17:10:28 (ea2b2c18)
- bd daemon export: 2026-02-09 17:09:11 (bbe39dde)
- bd daemon export: 2026-02-09 17:09:01 (642b3c95)
- bd daemon export: 2026-02-09 17:01:54 (bb7358be)
- bd daemon export: 2026-02-09 17:01:53 (66b9889a)
- add tests for muteTestEnvironmentLog + new auto-mute rules + fix rule count (09aa8947)
- bd daemon export: 2026-02-09 16:56:52 (2628944a)
- bd daemon export: 2026-02-09 16:56:51 (aca963e4)
- bd daemon export: 2026-02-09 16:56:44 (f8a943f3)
- bd daemon export: 2026-02-09 16:56:03 (0e3c379a)
- bd daemon export: 2026-02-09 16:35:38 (fd0de306)
- bd daemon export: 2026-02-09 16:35:31 (e0878981)
- bd daemon export: 2026-02-09 16:33:13 (6290d191)
- bd daemon export: 2026-02-09 16:20:25 (dcd43b13)
- bd daemon export: 2026-02-09 16:19:30 (761cf11a)
- **deps**: align tRPC 11.8→11.9 in course-gen-platform (9f0dc6b8)
- bd daemon export: 2026-02-09 16:19:11 (a4817c10)
- bd daemon export: 2026-02-09 16:19:07 (a5c5a0e8)
- bd daemon export: 2026-02-09 16:15:14 (f1ce7b28)
- bd daemon export: 2026-02-09 16:15:00 (490a7d8a)
- bd daemon export: 2026-02-09 16:11:36 (dd669e0f)
- bd daemon export: 2026-02-09 16:09:16 (a1da9d8c)
- **deps**: update react-resizable-panels 3.0.6 → 4.6.2 (76b9ab7c)
- bd daemon export: 2026-02-09 16:06:18 (07f8cef8)
- bd daemon export: 2026-02-09 15:55:49 (8c5c6546)
- clean up remaining Phase 6 RAG Planning references (73cbf27c)
- bd daemon export: 2026-02-09 15:42:51 (157d699c)
- bd daemon export: 2026-02-09 15:36:03 (7e2eb254)
- bd daemon export: 2026-02-09 15:26:42 (f1224e6f)
- bd daemon export: 2026-02-09 15:25:29 (5175a5e7)
- bd daemon export: 2026-02-09 15:23:18 (5b3793f1)
- bd daemon export: 2026-02-09 15:23:14 (38ddf8bd)
- bd daemon export: 2026-02-09 15:21:02 (3a5ae00b)
- bd daemon export: 2026-02-09 15:17:15 (2def7415)
- bd daemon export: 2026-02-09 14:58:55 (31ce9b48)
- bd daemon export: 2026-02-09 14:49:35 (4fab649b)
- bd daemon export: 2026-02-09 14:49:20 (04186206)
- bd daemon export: 2026-02-09 14:49:16 (e51554a9)
- bd daemon export: 2026-02-09 14:45:56 (6de0d39d)
- bd daemon export: 2026-02-09 14:41:09 (e186c09c)
- bd daemon export: 2026-02-09 14:34:15 (616a73ed)
- bd daemon export: 2026-02-09 14:27:40 (5c8813d2)
- bd daemon export: 2026-02-09 14:25:11 (1f2ffb70)
- bd daemon export: 2026-02-09 14:18:18 (1beffbe0)
- bd daemon export: 2026-02-09 14:18:12 (0429ff5a)
- bd daemon export: 2026-02-09 14:18:05 (471992ac)
- bd daemon export: 2026-02-09 14:17:28 (2e7a10fa)
- bd daemon export: 2026-02-09 14:17:23 (c4e7e59f)
- bd daemon export: 2026-02-09 14:09:02 (d30841db)
- bd daemon export: 2026-02-09 14:08:57 (28dbd840)
- bd daemon export: 2026-02-09 14:08:48 (ce05657e)
- bd daemon export: 2026-02-09 14:04:29 (a9fbe9a4)
- bd daemon export: 2026-02-09 14:00:32 (77714e2d)
- bd daemon export: 2026-02-09 13:58:08 (d789d9d6)
- **deps**: upgrade @langchain/langgraph 1.0.5 → 1.1.4 (1e0ed153)
- bd daemon export: 2026-02-09 13:58:02 (97c8c456)
- bd daemon export: 2026-02-09 13:57:56 (509b28a9)
- bd daemon export: 2026-02-09 13:56:49 (2edc1233)
- bd daemon export: 2026-02-09 13:56:45 (ce6dab67)
- bd daemon export: 2026-02-09 13:56:32 (fe4e9e8d)
- bd daemon export: 2026-02-09 13:56:27 (2dc0f212)
- bd daemon export: 2026-02-09 13:56:22 (a1ebd5bf)
- bd daemon export: 2026-02-09 13:55:55 (8465dde1)
- bd daemon export: 2026-02-09 13:55:44 (cfbec119)
- bd daemon export: 2026-02-09 13:52:50 (ca29998e)
- bd daemon export: 2026-02-09 13:50:17 (75c25983)
- bd daemon export: 2026-02-09 13:50:12 (d968e948)
- bd daemon export: 2026-02-09 13:48:53 (3d7dfa02)
- bd daemon export: 2026-02-09 13:47:12 (db9ff622)
- bd daemon export: 2026-02-09 13:39:27 (04c16b1d)
- bd daemon export: 2026-02-09 13:39:23 (b1072b3d)
- bd daemon export: 2026-02-09 13:39:17 (810d3977)
- bd daemon export: 2026-02-09 13:34:16 (d9ca3445)
- bd daemon export: 2026-02-09 13:33:30 (8f884b3d)
- bd daemon export: 2026-02-09 13:31:25 (afd07ff5)
- bd daemon export: 2026-02-09 13:31:21 (d64f568e)
- bd daemon export: 2026-02-09 13:27:03 (7b57e52b)
- bd daemon export: 2026-02-09 13:20:12 (12a9ec31)
- bd daemon export: 2026-02-09 13:20:10 (585dd140)
- bd daemon export: 2026-02-09 13:20:08 (8d1f3430)
- bd daemon export: 2026-02-09 13:13:13 (c656f1e0)
- bd daemon export: 2026-02-09 13:11:59 (4c8027dd)
- bd daemon export: 2026-02-09 13:11:53 (d98ec99d)
- bd daemon export: 2026-02-09 13:11:46 (54583dc1)
- bd daemon export: 2026-02-09 13:09:16 (3ee39ab0)
- bd daemon export: 2026-02-09 13:09:11 (c82b0464)
- bd daemon export: 2026-02-09 13:09:09 (013d6e0f)
- bd daemon export: 2026-02-09 13:09:07 (9a9a1287)
- bd daemon export: 2026-02-09 13:09:06 (f4014e29)
- bd daemon export: 2026-02-09 11:51:56 (3fd640dd)
- bd daemon export: 2026-02-09 10:28:25 (87dbdc88)
- **web**: extract env schemas + add env variables guide (e96e8bf5)
- bd daemon export: 2026-02-09 10:14:42 (5a139960)
- bd daemon export: 2026-02-09 10:14:19 (526c8e7e)
- bd daemon export: 2026-02-09 10:00:05 (4fbeb96a)
- bd daemon export: 2026-02-09 10:00:01 (01cfa73e)
- bd daemon export: 2026-02-09 09:59:51 (de12ba6b)
- bd daemon export: 2026-02-09 09:14:04 (b6621249)
- bd daemon export: 2026-02-09 09:06:22 (09745c1d)
- bd daemon export: 2026-02-09 09:05:17 (4b77f28b)
- bd daemon export: 2026-02-09 09:05:14 (981c22e7)
- bd daemon export: 2026-02-09 09:00:51 (739e0ecd)
- bd daemon export: 2026-02-09 08:54:34 (52516a87)
- bd daemon export: 2026-02-09 08:54:23 (30f7aa8a)
- bd daemon export: 2026-02-09 08:30:13 (1b225281)

## [0.29.3] - 2026-02-09

### Changed

- add Redis LLM cache, optimize API queries, parallelize retry (ce467d21)

### Fixed

- **course-gen-platform**: update 28 source file(s), update 2 test(s), +2 more (4c02bb76)
- address remaining code review issues #6-#15 (4b5dd107)
- address code review issues for perf optimization (40349eaa)

### Other

- bd daemon export: 2026-02-09 08:24:24 (15ab3a0a)
- bd daemon export: 2026-02-09 08:22:20 (6a8a581d)
- bd daemon export: 2026-02-09 08:22:12 (bb47c73e)
- bd daemon export: 2026-02-09 08:18:55 (2a4a8b11)
- bd daemon export: 2026-02-09 08:15:06 (225eb02e)
- bd daemon export: 2026-02-09 08:14:59 (fbcfa081)
- bd daemon export: 2026-02-09 08:11:29 (ff2ed051)
- bd daemon export: 2026-02-09 08:08:13 (808aea38)
- bd daemon export: 2026-02-09 08:01:43 (465e0985)
- bd daemon sync: 2026-02-09 07:48:12 (df5b16e6)

## [0.29.2] - 2026-02-08

### Added

- **course-gen-platform**: add 1 source file(s), add 2 test(s), +1 more (5bdbf2ef)
- 3-tier model routing for Stage 5 based on section importance (7a7a067c)

### Changed

- remove dead complexity/criticality scoring from Stage 5 (d1065cd4)
- extract regex to PATTERNS constant, add SSOT JSDoc, fix lastIndex bug (11a61c17)
- migrate tRPC architecture to @trpc/react-query with typesafe hooks (ec8c8b6e)
- expand optimizePackageImports with all Radix UI + framer-motion (2d59ec84)

### Fixed

- harden sanitize.fileName, fix tests, extract CONTROL_CHAR_REGEX (b81fc39a)
- **ci**: build course-gen-platform before type-check (aa5d0654)
- remove type safety bypasses in ClarifyingPanel (#4, #5) (fbbf6378)
- address code review findings for tRPC migration (dd0b1caf)
- **tests**: repair unit test suite — 83/83 pass, no hanging (e4eb3e33)
- **tests**: repair 10 pre-existing broken unit tests after deduplication (0289aa25)

### Other

- cleanup from code review — remove dead code, fix test assertions (fc239e70)
- consolidate Zod schemas — delete dead code, use shared languageSchema (0be33c62)
- **tests**: remove duplicate trpc test file (28f45c2f)
- bd daemon export: 2026-02-08 16:53:12 (f2218a42)
- bd daemon export: 2026-02-08 16:53:10 (19fe301a)
- bd daemon export: 2026-02-08 16:53:07 (1a7cf2a4)
- bd daemon export: 2026-02-08 16:43:32 (c7915994)
- bd daemon export: 2026-02-08 16:38:49 (f5375682)
- bd daemon export: 2026-02-08 16:36:36 (579ddf70)
- bd daemon export: 2026-02-08 16:29:31 (6c2785f4)
- bd daemon export: 2026-02-08 16:26:58 (eb4770e2)
- bd daemon export: 2026-02-08 16:26:57 (76ee74f7)
- bd daemon export: 2026-02-08 16:26:55 (aa1a2142)
- bd daemon export: 2026-02-08 16:26:54 (cefb4952)
- bd daemon export: 2026-02-08 16:26:53 (3f377ad1)
- bd daemon export: 2026-02-08 16:26:52 (70dbd2d9)
- bd daemon export: 2026-02-08 16:26:50 (b06428ec)
- bd daemon export: 2026-02-08 16:26:47 (78d95783)
- bd daemon export: 2026-02-08 16:26:09 (15329d25)
- clean up stale docs, empty dirs, and leftover test artifacts (8e6e9eac)
- bd daemon export: 2026-02-08 16:16:06 (f3eb7449)
- bd daemon export: 2026-02-08 15:48:54 (10b9253e)
- bd daemon export: 2026-02-08 15:48:49 (b0704eab)
- bd daemon export: 2026-02-08 15:48:46 (5ec81ec6)
- bd daemon export: 2026-02-08 15:48:36 (f93b41bb)
- bd daemon export: 2026-02-08 15:48:33 (1f525aa3)
- bd daemon export: 2026-02-08 15:48:30 (37ef6419)
- bd daemon export: 2026-02-08 15:48:23 (fb31fa2b)
- bd daemon export: 2026-02-08 15:48:19 (5b57fa23)
- bd daemon export: 2026-02-08 15:48:17 (23c6ff99)
- bd daemon export: 2026-02-08 15:48:04 (5fabdcbb)
- bd daemon export: 2026-02-08 15:48:00 (fb52d602)
- bd daemon export: 2026-02-08 15:47:57 (8d31861d)
- bd daemon export: 2026-02-08 15:47:48 (c5f96695)
- bd daemon export: 2026-02-08 15:47:46 (367f3d75)
- bd daemon export: 2026-02-08 15:47:43 (c01db15a)

## [0.29.1] - 2026-02-08

### Other

- sync all pending changes from multi-agent work (b9fd2c1b)

## [0.28.62] - 2026-02-07

### Added

- **stage4**: swap Phase 1 and Phase 0.5 for data-driven clarifying questions (8939e47b)
- **web**: show classification_rationale in Stage 3 & pedagogical_patterns in Stage 4 (264b6191)

### Changed

- **stage4**: move Visual Style to accordion, remove deprecated Document Relations (a2c91488)
- **pipeline**: remove dead content_strategy field from analysis_result (b8d49516)

### Fixed

- **shared-types,web**: add pedagogical_patterns to editable whitelist & guard empty .in() (a6a18fe4)
- **stage4,stage5**: retry pull-fallback + accept any assessment_types type (a8e6f5f6)

### Other

- bd daemon export: 2026-02-07 20:05:04 (c1e2092b)
- bd daemon export: 2026-02-07 20:00:25 (399798f6)
- bd daemon export: 2026-02-07 20:00:20 (6cf6b958)
- bd daemon export: 2026-02-07 19:38:45 (d7749bf2)
- **stage4**: remove content_strategy from README (b085102a)
- bd daemon export: 2026-02-07 19:29:41 (bd9001b0)
- bd daemon export: 2026-02-07 19:29:36 (ca8c70b0)
- bd daemon export: 2026-02-07 19:28:13 (05c50d3d)
- bd daemon export: 2026-02-07 19:07:28 (8c24ea49)
- bd daemon export: 2026-02-07 18:45:49 (333ca892)
- bd daemon export: 2026-02-07 18:45:47 (5c2e12a7)
- bd daemon export: 2026-02-07 18:43:20 (09aaba04)
- bd daemon export: 2026-02-07 18:43:16 (1dd92a52)
- bd daemon export: 2026-02-07 18:37:00 (3b3b3c3e)
- bd daemon export: 2026-02-07 18:36:57 (7f2181ce)
- bd daemon export: 2026-02-07 18:36:55 (dd59d0de)
- bd daemon export: 2026-02-07 18:36:54 (de059ea9)
- bd daemon export: 2026-02-07 18:36:52 (0c4e9bea)
- bd daemon export: 2026-02-07 18:36:45 (21f2f541)
- bd daemon export: 2026-02-07 18:36:41 (560e53fb)
- bd daemon export: 2026-02-07 18:36:38 (9021dff7)
- bd daemon export: 2026-02-07 18:36:36 (12d60349)
- bd daemon export: 2026-02-07 18:07:13 (ad02288f)
- remove deprecated assessment_types field from entire codebase (e30c54bf)
- bd daemon export: 2026-02-07 17:52:29 (6066348c)
- bd daemon export: 2026-02-07 17:52:04 (a9c107f6)
- bd daemon export: 2026-02-07 17:03:27 (7c2c589f)

## [0.28.61] - 2026-02-07

### Fixed

- **pipeline**: sync course style injection across all generation stages (40f07187)
- **stage4**: pass document content to clarifying questions prompt (973ae217)

### Other

- bd daemon export: 2026-02-07 16:47:02 (bb67f311)
- bd daemon export: 2026-02-07 16:45:49 (6eb0b288)
- bd daemon export: 2026-02-07 16:45:45 (a4948922)
- bd daemon export: 2026-02-07 16:30:11 (abddf8a1)
- bd daemon export: 2026-02-07 16:30:07 (5223ca45)

## [0.28.60] - 2026-02-07

### Added

- **web**: add 1 source file(s), update 12 source file(s), +1 more (3a5a24f5)

### Fixed

- **userback**: use identify() for form pre-fill instead of init options (76e8d600)

### Other

- bd daemon export: 2026-02-07 15:58:05 (cbcac66f)
- bd daemon export: 2026-02-07 15:57:58 (b6f9471b)

## [0.28.59] - 2026-02-07

### Fixed

- **course-gen-platform**: update 1 source file(s), update docs (51a92b9b)
- **graph**: fix Stage 4 results spinner — shared ref race condition + missing complete statuses (669b8010)
- **stage7**: fix double retry bug causing enrichments stuck in generating (3368a98b)
- **anti-overlap**: remaining code review issues (1.3, 2.3, 5.3, security, i18n) (1eab7489)
- **anti-overlap**: address code review findings for overlap detection (3c1b418f)
- **pipeline**: prevent duplicate lessons via anti-overlap prompts and cross-section detection (c78ef5ac)

### Other

- bd daemon export: 2026-02-07 15:30:59 (5ecc937e)
- **stage7**: add unit tests for retry logic and time guard (d958676a)
- bd daemon export: 2026-02-07 15:30:41 (2d68f8df)
- bd daemon export: 2026-02-07 15:30:33 (67d3c246)
- bd daemon export: 2026-02-07 15:23:25 (3b37fd71)
- **stage7**: remove redundant retryAttempt field from Stage7JobInput (2ef7f8f6)
- bd daemon export: 2026-02-07 15:20:55 (fbddd7b2)
- bd daemon export: 2026-02-07 15:20:54 (e14c30d3)
- bd daemon export: 2026-02-07 15:20:47 (c069621b)
- bd daemon export: 2026-02-07 15:20:07 (92c43b12)
- bd daemon export: 2026-02-07 15:09:49 (06b456ce)
- bd daemon export: 2026-02-07 15:01:27 (75d54694)
- bd daemon export: 2026-02-07 15:01:23 (c7527f10)
- bd daemon export: 2026-02-07 14:57:48 (48c488e3)
- bd daemon export: 2026-02-07 14:53:39 (5f2bebf7)
- bd daemon export: 2026-02-07 14:53:33 (bd56edca)
- bd daemon export: 2026-02-07 13:36:30 (876c36f3)
- bd daemon export: 2026-02-07 13:28:35 (072f6a33)
- bd daemon export: 2026-02-07 13:28:31 (0893f023)

## [0.28.58] - 2026-02-07

### Fixed

- **userback**: localize widget greeting to Russian (e01f3118)

## [0.28.57] - 2026-02-07

### Fixed

- **userback**: add font-src CSP and prefill email/name in widget (7ddb716f)

### Other

- update docs (f9f846cb)

## [0.28.56] - 2026-02-06

### Fixed

- **csp**: add static.userback.io to style-src and connect-src (6b5a5e3c)

### Other

- update docs (b74f44ae)
- bd daemon export: 2026-02-06 22:28:52 (9150a34f)
- bd daemon export: 2026-02-06 22:28:45 (2750b793)

## [0.28.55] - 2026-02-06

### Fixed

- **auth**: code review fixes — security, i18n, UX improvements (d59f78e3)

### Other

- add Userback env vars to Docker build and CI/CD pipeline (87e5e60a)
- bd daemon export: 2026-02-06 20:39:59 (b3a551a5)

## [0.28.54] - 2026-02-06

### Added

- **web**: add 4 source file(s), update 5 source file(s), +2 more (abd0f463)
- **web**: embed Userback feedback widget with SPA support and CSP (b0708fdb)

### Fixed

- remove unused InvitationType imports + fix NODE_ENV test assertions (c281d10e)
- health check phase 2 - 13 deferred bugs fixed (2ce5fb94)
- health check - 8 bugs fixed (mc2-wisp-0t4) (18f64595)
- **worker**: use actual path in EACCES fix instructions (ba1eb1c4)
- shared Jina rate limiter (100 RPM) + EACCES improvements + auto-mute rules (ff86957d)

### Other

- bd daemon export: 2026-02-06 20:10:43 (d40d2b70)
- bd daemon export: 2026-02-06 20:06:05 (ad71bbd9)
- bd daemon export: 2026-02-06 20:05:48 (dda1de70)
- bd daemon export: 2026-02-06 19:52:20 (8b0366f2)
- bd daemon export: 2026-02-06 19:52:18 (489770ef)
- bd daemon export: 2026-02-06 19:52:17 (4986ee8a)
- bd daemon export: 2026-02-06 19:43:58 (3602ee91)
- bd daemon export: 2026-02-06 19:43:50 (157c671b)
- bd daemon export: 2026-02-06 19:43:46 (a0ede9b8)
- bd daemon export: 2026-02-06 14:17:09 (7337a248)
- bd daemon export: 2026-02-06 14:16:53 (7d62222c)
- bd daemon export: 2026-02-06 14:16:41 (bc545786)
- bd daemon export: 2026-02-06 14:10:19 (deb251f0)
- bd daemon export: 2026-02-06 14:10:13 (ce38f0c3)
- bd daemon export: 2026-02-06 14:06:43 (0381d5c8)
- bd daemon export: 2026-02-06 14:06:38 (0590a2d2)
- bd daemon export: 2026-02-06 14:06:22 (3c7a0816)
- bd daemon export: 2026-02-06 14:04:11 (ec1b292d)
- bd daemon export: 2026-02-06 14:03:45 (4918a733)
- bd daemon export: 2026-02-06 14:03:34 (32861fb1)
- bd daemon export: 2026-02-06 14:03:08 (fe92ce20)
- bd daemon export: 2026-02-06 14:03:05 (f2be86a5)
- bd daemon export: 2026-02-06 14:03:02 (833424cf)
- bd daemon export: 2026-02-06 14:02:59 (74b8acf7)
- bd daemon export: 2026-02-06 14:02:55 (f7b54cf3)
- bd daemon export: 2026-02-06 14:02:48 (83f7b335)
- bd daemon export: 2026-02-06 14:02:44 (bdb6b9c5)
- bd daemon export: 2026-02-06 12:18:56 (7a780f32)
- bd daemon export: 2026-02-06 12:17:44 (fe799c4a)
- bd daemon export: 2026-02-06 12:17:40 (cd1a0a6c)
- bd daemon export: 2026-02-06 12:17:27 (110a99fe)
- bd daemon export: 2026-02-06 12:16:01 (2844be0c)
- bd daemon export: 2026-02-06 12:15:56 (b99396ae)

## [0.28.53] - 2026-02-06

### Added

- **orchestrator**: add BLOCK_REGENERATION job type and Sentry monitoring (bea0acd4)
- **lesson-editor**: add inline markdown editor for lesson content (6c6f7034)
- **generation-graph**: implement NodeDetailsDrawer action handlers (1e0b66f4)
- **logger**: add 2 new auto-mute rules for expected errors (3ef9dbf7)

### Fixed

- **block-regen**: optimistic locking, cache limit, shared setNestedValue (19a14297)
- **orchestrator**: address code review findings for BLOCK_REGENERATION (fef61064)
- **ci**: add concurrency group and paths-ignore for .beads (097adf4c)
- **lesson-editor**: concurrent save guard, draft toast, save feedback, ARIA (bb47fc8f)
- **lesson-editor**: CSS, dark mode, autosave, context refactor, and tests (0d9d95bf)
- **lesson-editor**: address code review findings (e0f9025c)
- resolve 3 production error categories (348b2462)
- **workflow**: merge stage1CourseData with traces for Stage 1 nodes (ae729a95)

### Other

- update docs (053d760b)
- bd daemon export: 2026-02-06 11:52:40 (e40c5a8d)
- bd daemon export: 2026-02-06 11:52:38 (964ee345)
- bd daemon export: 2026-02-06 11:52:36 (27e41292)
- bd daemon export: 2026-02-06 11:44:03 (de2937cd)
- bd daemon export: 2026-02-06 11:43:52 (cb0bbcd1)
- bd daemon export: 2026-02-06 11:43:51 (62ecd354)
- bd daemon export: 2026-02-06 10:37:46 (d3c6ba0e)
- bd daemon export: 2026-02-06 10:37:45 (916877af)
- bd daemon export: 2026-02-06 10:09:49 (23855dad)
- bd daemon export: 2026-02-06 10:09:48 (42414ac5)
- bd daemon export: 2026-02-06 09:50:37 (1dc54c24)
- bd daemon export: 2026-02-06 09:50:35 (82a2d53f)
- bd daemon export: 2026-02-06 09:48:59 (563d3bab)
- bd daemon export: 2026-02-06 09:48:57 (39d5e946)
- bd daemon export: 2026-02-06 09:48:52 (3a8328b6)
- bd daemon export: 2026-02-06 09:48:51 (328b1d71)
- bd daemon export: 2026-02-06 09:41:05 (5ede5241)
- bd daemon export: 2026-02-06 09:37:23 (58543776)
- bd daemon export: 2026-02-06 09:35:16 (facf43cf)
- bd daemon export: 2026-02-06 09:31:20 (3d5788da)
- bd daemon export: 2026-02-06 09:31:15 (faf4c39c)
- bd daemon export: 2026-02-06 09:30:00 (e366119d)
- bd daemon export: 2026-02-06 09:29:19 (6941ad0b)
- bd daemon export: 2026-02-06 09:19:56 (5e117377)
- bd daemon export: 2026-02-06 09:19:51 (e335756a)
- bd daemon export: 2026-02-06 09:17:35 (7f400430)
- bd daemon export: 2026-02-06 09:17:28 (d92aa335)
- bd daemon export: 2026-02-06 09:17:26 (3904a17e)
- bd daemon export: 2026-02-06 09:17:25 (918338dc)
- bd daemon export: 2026-02-06 09:17:23 (069633b0)
- bd daemon export: 2026-02-06 09:12:39 (a9ed145c)
- bd daemon export: 2026-02-06 09:12:34 (dc364a0e)
- bd daemon export: 2026-02-05 22:32:36 (c05ebd6c)
- bd daemon export: 2026-02-05 22:20:55 (0c7db4f2)
- bd daemon export: 2026-02-05 22:19:20 (4e17da55)
- bd daemon export: 2026-02-05 22:19:13 (e6d97f1d)
- bd daemon export: 2026-02-05 22:12:23 (a8b1600e)
- bd daemon export: 2026-02-05 22:11:41 (4dedce7d)
- bd daemon export: 2026-02-05 22:11:40 (bd5cfe78)
- bd daemon export: 2026-02-05 22:11:31 (88dc13ff)
- bd daemon export: 2026-02-05 22:05:31 (4aa2aac2)
- bd daemon export: 2026-02-05 21:57:25 (9f49ec2c)
- bd daemon export: 2026-02-05 21:57:16 (1a1fb759)
- bd daemon export: 2026-02-05 21:57:07 (838ec327)
- bd daemon export: 2026-02-05 21:56:58 (35c6aa9d)
- bd daemon export: 2026-02-05 14:22:52 (38c92a88)
- remove deprecated assessment_types field from pedagogical_patterns (a472b968)
- bd daemon export: 2026-02-05 14:13:03 (bb643af1)
- bd daemon export: 2026-02-05 14:12:50 (e2b95603)

## [0.28.52] - 2026-02-04

### Changed

- **chat**: extract getUpdatedFieldsForProposal helper function (524e1e30)
- **stage4**: move suggested_answers normalization to Zod z.preprocess() (da3a51d7)
- **export-lessons**: optimize DB query with lessons_with_latest_content view (c80ff3dd)

### Fixed

- **chat**: resolve message duplication and data not refreshing after apply (f4c9d9fb)
- **tests**: sync test data with updated Zod schemas (9 failing tests) (47ca6e6f)
- **tests**: fix fetch mocking in jina-reranker-client unit test (5180e8bc)
- **admin**: fix null filters breaking /admin/logs page (500 error) (e39ead00)
- **stage4**: enforce min length + filter invalid answers in normalization (08d12455)
- process error logs — 3 bug fixes + 3 auto-mute rules (d4e3e078)
- **stage6**: prevent "sections is not iterable" error in judge (bfbe3b66)

### Other

- bd daemon export: 2026-02-04 21:41:47 (565ca490)
- **chat**: add unit tests for RefinementChat and useRefinement fixes (bc98dac6)
- **migration**: add post-deployment verification queries (e6c91935)
- bd daemon export: 2026-02-04 21:37:32 (7d896575)
- **export-lessons**: code review fixes + integration tests (0ed9f21b)
- bd daemon export: 2026-02-04 21:36:07 (118eb231)
- bd daemon export: 2026-02-04 21:34:56 (5913f12d)
- bd daemon export: 2026-02-04 21:34:50 (db1b2aa4)
- bd daemon export: 2026-02-04 21:34:48 (dd2964e8)
- bd daemon export: 2026-02-04 21:26:24 (4068ff9e)
- bd daemon export: 2026-02-04 21:26:01 (0baba67b)
- bd daemon export: 2026-02-04 21:25:59 (3a0b18f8)
- bd daemon export: 2026-02-04 21:24:29 (d29e234c)
- bd daemon export: 2026-02-04 21:24:25 (0b387833)
- bd daemon export: 2026-02-04 21:18:36 (e7ae2f43)
- bd daemon export: 2026-02-04 21:09:59 (fe7fab51)
- bd daemon export: 2026-02-04 21:05:09 (6565ec64)
- **tests**: remove dead `answers` field from test fixtures (b3a49e0d)
- bd daemon export: 2026-02-04 20:42:22 (e6e2e666)
- bd daemon export: 2026-02-04 20:42:19 (70aee722)
- bd daemon export: 2026-02-04 20:27:27 (9e9b7c8b)
- bd daemon export: 2026-02-04 20:19:12 (ea766792)
- bd daemon export: 2026-02-04 20:17:08 (541b0af1)
- bd daemon export: 2026-02-04 20:13:04 (0b5da826)
- bd daemon export: 2026-02-04 19:33:01 (d2a8a7a2)
- bd daemon export: 2026-02-04 19:32:56 (5b27658a)
- bd daemon export: 2026-02-04 19:16:12 (f086c83b)
- bd daemon export: 2026-02-04 19:16:10 (93865f61)
- bd daemon export: 2026-02-04 19:16:04 (80d7f0ca)
- bd daemon export: 2026-02-04 19:13:19 (d40e6e14)
- bd daemon export: 2026-02-04 19:13:18 (b2f2e3dc)
- bd daemon export: 2026-02-04 19:13:16 (7a9517f1)
- bd daemon export: 2026-02-04 19:11:12 (6c1372ec)
- bd daemon export: 2026-02-04 19:09:30 (35037f26)
- bd daemon export: 2026-02-04 19:09:03 (f48b409f)
- bd daemon export: 2026-02-04 19:07:37 (1abbca4b)
- bd daemon export: 2026-02-04 19:07:36 (b6adea5d)
- bd daemon export: 2026-02-04 19:07:34 (4602bbed)

## [0.28.51] - 2026-02-04

### Fixed

- **i18n**: address code review findings for i18n headers (acd8676b)
- **i18n**: replace hardcoded English headers with localized labels (59773c47)
- **markdown**: escape currency dollar signs to prevent LaTeX math misinterpretation (2d13fc48)

### Other

- update docs (b171b3b5)
- bd daemon export: 2026-02-04 16:54:49 (8bb214b6)
- **i18n**: add unit tests for content labels and validateLanguageCode (0a65bf0c)
- bd daemon export: 2026-02-04 16:15:14 (ff6f9f5b)
- bd daemon export: 2026-02-04 16:11:03 (77e1e489)
- bd daemon export: 2026-02-04 16:04:11 (e87f3bce)
- bd daemon export: 2026-02-04 14:39:35 (593c27b4)
- bd daemon export: 2026-02-04 14:30:22 (1964e7d8)
- bd daemon export: 2026-02-04 14:30:17 (c239fe6e)

## [0.28.50] - 2026-02-03

### Added

- **chat**: implement code review recommendations P1-2, P2-2, P3 (45d8b92e)
- **chat**: implement intent classification for chat optimization (4e975cb3)
- добавлено UI предупреждение о необходимости CORE документа (23aa1d01)
- implement remaining code review recommendations (5b6d7877)
- migrate user preferences to Supabase and add section-expander validation (3ff01e75)

### Fixed

- **chat**: address code review issues for intent classification (ad800968)
- **chat**: optimize chat fallback config for large courses (6100da61)
- **ci**: add forceExit to shared-types vitest config (107a17fc)
- **ci**: resolve test timeouts and hanging processes (1a5d1410)
- очистка localStorage после создания курса (0fcf6cac)
- добавлена валидация приоритетов документов при переходе Stage 3→4 (cb3e320e)
- resolve CI/CD test failures blocking Dev deploy (509bf3ae)
- address code review findings for user-preferences (1ea73461)

### Other

- misc updates (docs, config, experiments) (5a043710)
- bd daemon export: 2026-02-03 22:22:35 (b06e60f3)
- bd daemon export: 2026-02-03 22:22:33 (5fbd1c8a)
- bd daemon export: 2026-02-03 22:21:06 (e985fac3)
- bd daemon export: 2026-02-03 22:18:35 (256232c6)
- bd daemon export: 2026-02-03 22:14:36 (d4c2e6f4)
- bd daemon export: 2026-02-03 22:14:22 (2d1e7436)
- bd daemon export: 2026-02-03 22:13:54 (f2d0e436)
- bd daemon export: 2026-02-03 22:13:52 (b8a4061d)
- bd daemon export: 2026-02-03 22:12:52 (5e0a8dc5)
- bd daemon export: 2026-02-03 22:12:42 (371b0ce1)
- bd daemon export: 2026-02-03 22:12:38 (7eb469d8)
- bd daemon export: 2026-02-03 22:12:33 (5f37c23a)
- add comprehensive unit tests for Intent Classification system (61341d5f)
- bd daemon export: 2026-02-03 21:57:20 (51de2a04)
- bd daemon export: 2026-02-03 21:50:23 (8b8ed444)
- bd daemon export: 2026-02-03 21:40:32 (cefb0d35)
- bd daemon export: 2026-02-03 21:39:37 (5538df79)
- bd daemon export: 2026-02-03 21:39:36 (0b4c99e5)
- bd daemon export: 2026-02-03 21:34:32 (c076339b)
- bd daemon export: 2026-02-03 21:26:26 (bef65e21)
- bd daemon export: 2026-02-03 21:25:47 (8b680b5b)
- add model configuration guide with SQL examples (ba2677a1)
- move llm-model-config.md to .claude/docs and add reference in CLAUDE.md (9dd022db)
- update chat fallback config in llm-model-config.md (00a524e7)
- bd daemon export: 2026-02-03 13:08:29 (47ac348f)
- bd daemon export: 2026-02-03 13:05:14 (61f55395)
- bd daemon export: 2026-02-03 13:02:18 (9e1e7d82)
- bd daemon export: 2026-02-03 13:01:13 (cca981e0)
- bd daemon export: 2026-02-03 13:01:11 (f57029c8)
- bd daemon export: 2026-02-03 13:00:07 (8ff90f01)
- bd daemon export: 2026-02-03 12:59:53 (f0dc497c)
- bd daemon export: 2026-02-03 12:59:51 (91183220)
- bd daemon export: 2026-02-03 12:59:50 (9a0a1a88)
- bd daemon export: 2026-02-03 12:01:48 (fcc2261c)
- bd daemon export: 2026-02-03 11:53:03 (1e22fc4f)
- bd daemon export: 2026-02-03 11:52:58 (720a38a5)
- bd daemon export: 2026-02-02 21:30:10 (ff5ee7e9)
- bd daemon export: 2026-02-02 21:30:09 (cef76f0e)
- bd daemon export: 2026-02-02 21:30:08 (98bdf25e)
- bd daemon export: 2026-02-02 21:30:07 (5944c626)
- bd daemon export: 2026-02-02 21:30:06 (886ce4c6)
- bd daemon export: 2026-02-02 21:25:51 (4accef5e)
- bd daemon export: 2026-02-02 21:25:39 (3d8f08d7)
- bd daemon export: 2026-02-02 21:25:38 (fcc7c350)
- bd daemon export: 2026-02-02 21:25:37 (77d9f072)
- bd daemon export: 2026-02-02 21:25:35 (b386ca31)
- bd daemon export: 2026-02-02 21:25:33 (00ec1d4b)
- bd daemon export: 2026-02-02 21:11:00 (112ba40a)
- bd daemon export: 2026-02-02 21:10:59 (695cb004)
- bd daemon export: 2026-02-02 21:10:58 (97feb982)
- bd daemon export: 2026-02-02 21:10:57 (8888f4d7)
- bd daemon export: 2026-02-02 21:07:45 (32b4072c)
- bd daemon export: 2026-02-02 21:07:37 (2722120b)
- bd daemon export: 2026-02-02 21:07:36 (1da206ca)
- bd daemon export: 2026-02-02 21:07:34 (4e645885)
- bd daemon export: 2026-02-02 21:07:33 (2ebf5218)
- bd daemon export: 2026-02-02 20:13:47 (713ecbf6)
- bd daemon export: 2026-02-02 20:06:49 (b9a46a21)

## [0.28.49] - 2026-02-02

### Added

- **useLessonActions**: add i18n and loading states UI (P2 improvements) (89f2139f)
- **ModuleDashboard**: implement tRPC mutations for lesson actions (59f06cc3)
- implement storage helper for EnrichmentCard audio playback (452c8839)
- **observability**: add ConcurrencyLimiter metrics, tests, and enrichments health check (d53aebe5)

### Changed

- **chat**: use PAUSABLE_STATUSES for generation blocking (65a75fe4)
- **admin**: optimize get_grouped_error_logs RPC statement timeout (fb9c7feb)

### Fixed

- **useLessonActions**: fix P0/P1 race conditions and memory leaks (a5bc8820)
- **docling**: graceful fallback for unsupported format + clarify cover prompts design (266b73db)
- **orchestrator**: pass BullMQ job token correctly in sandboxed processor (fab77821)
- **AMX-5817**: resolve bucket, chat blocking, and Jina rate limit issues (a735b205)
- **web**: only show approve button when generationStatus is awaiting_approval (18db0a43)
- **stage1**: graceful fallback when vector duplication has no vectors (e649fe98)

### Other

- update docs (021c9fe6)
- bd daemon export: 2026-02-02 19:28:00 (aa3b316d)
- bd daemon export: 2026-02-02 19:25:28 (88036d28)
- bd daemon export: 2026-02-02 19:25:19 (2112c15e)
- bd daemon export: 2026-02-02 19:25:15 (f7be2ba7)
- bd daemon export: 2026-02-02 19:25:06 (06896617)
- bd daemon export: 2026-02-02 18:46:31 (e7318539)
- bd daemon export: 2026-02-02 18:43:46 (ea772402)
- bd daemon export: 2026-02-02 18:43:40 (6418e461)
- bd daemon export: 2026-02-02 18:38:30 (e9733220)
- bd daemon export: 2026-02-02 18:33:34 (4bea775c)
- bd daemon export: 2026-02-02 18:33:32 (b6d9391d)
- bd daemon export: 2026-02-02 17:54:17 (4924fec7)
- bd daemon export: 2026-02-02 17:54:15 (148dd765)
- bd daemon export: 2026-02-02 17:54:14 (c1406c3d)
- bd daemon export: 2026-02-02 17:53:40 (70fd1945)
- bd daemon export: 2026-02-02 17:49:33 (cd6c5fee)
- bd daemon export: 2026-02-02 17:49:31 (c66a9dd8)
- bd daemon export: 2026-02-02 17:49:29 (a6d11ccf)
- bd daemon export: 2026-02-02 17:09:29 (abe7e6d5)
- code quality cleanup - fix tests, remove dead code (bf184c05)
- bd daemon export: 2026-02-02 14:53:54 (d7499c73)
- bd daemon export: 2026-02-02 14:53:53 (dbc81505)
- bd daemon export: 2026-02-02 14:53:51 (1c53f992)
- bd daemon export: 2026-02-02 14:53:36 (368686c5)
- bd daemon export: 2026-02-02 14:53:32 (0c01c15c)
- bd daemon export: 2026-02-02 14:53:27 (ed056f38)
- bd daemon export: 2026-02-02 14:53:26 (3d484038)
- bd daemon export: 2026-02-02 14:53:25 (c1bed523)
- bd daemon export: 2026-02-02 14:53:23 (c023070f)
- bd daemon export: 2026-02-02 14:53:19 (813687be)
- bd daemon export: 2026-02-02 14:53:17 (b70355cd)
- bd daemon export: 2026-02-02 14:53:16 (f1aa0160)
- bd daemon export: 2026-02-02 14:53:15 (d02f1e93)
- bd daemon export: 2026-02-02 14:52:03 (eb40b8f8)
- bd daemon export: 2026-02-02 13:56:11 (97e3bff6)
- bd daemon export: 2026-02-02 13:39:31 (3a3eda22)
- bd daemon export: 2026-02-02 13:19:37 (c270656f)
- bd daemon export: 2026-02-02 13:17:37 (1c504284)
- bd daemon export: 2026-02-02 13:17:23 (c0312847)
- bd daemon export: 2026-02-02 13:16:38 (aca8f339)
- bd daemon export: 2026-02-02 13:15:11 (107370cf)
- bd daemon export: 2026-02-02 13:15:05 (cdbd8aa5)
- bd daemon export: 2026-02-02 13:15:03 (e2ed6c5b)
- bd daemon export: 2026-02-02 13:10:43 (41b7548e)
- bd daemon export: 2026-02-02 12:49:01 (62466f2e)
- bd daemon export: 2026-02-02 12:48:54 (7c8267a1)
- bd daemon export: 2026-02-02 12:48:50 (e83459fa)
- bd daemon export: 2026-02-02 12:48:45 (8ac6d8aa)
- bd daemon export: 2026-02-02 12:48:37 (03333e92)
- bd daemon export: 2026-02-02 12:48:30 (7e395b6d)
- bd daemon export: 2026-02-02 12:39:29 (ebed56ec)
- bd daemon export: 2026-02-02 12:38:30 (324d1cf5)
- bd daemon export: 2026-02-02 12:34:56 (6a8ad158)
- bd daemon export: 2026-02-02 09:12:07 (2c464f08)
- bd daemon export: 2026-02-02 09:11:17 (f6e56451)
- bd daemon export: 2026-02-02 09:10:40 (abcc7f23)
- bd daemon export: 2026-02-02 09:10:23 (ed26747a)
- bd daemon sync: 2026-02-02 08:57:07 (29895d11)

## [0.28.48] - 2026-02-01

### Added

- **stage5**: distinguish retryable vs non-retryable errors (3fcaf0b2)

### Fixed

- **docling**: switch transport from SSE to Streamable HTTP (20844280)
- **docling**: update to docling-mcp 1.3.4 and mcp 1.26.0 (96134d87)
- **config**: change DOCLING_MCP_URL from /sse to /mcp (50c7f55c)
- **stage2**: add missing pdf-parse dependency for fallback extraction (dfaf7b6f)
- **db**: allow anonymous users to insert PWA analytics events (3ca0e7a5)
- **tests**: centralize auth token helper with exponential backoff (dd8a96c5)
- **deploy**: force remove containers by name before blue-green deploy (2ac1c110)
- **deploy**: cleanup leftover containers before blue-green deploy (0e213bd7)
- **types**: replace error: any with proper instanceof checks (d4fd3cfb)
- **types**: replace explicit any with proper types in production code (137f2ad8)
- **ci**: add always() condition to Deploy to Production job (1c9863c1)
- **types**: replace any with Record<string, unknown> for JSONB fields (0fc47692)
- **web**: correct vitest test:integration command (abcf0a4a)
- **ci**: resolve flaky CI/CD tests with timeouts and rate limiting (02730598)
- **realtime**: handle empty error objects in skeleton traces fetch (f93b4378)

### Other

- update docs (a3097b15)
- save remaining local changes (3d6b4530)
- save local changes before deploy (b7e2e5b6)
- bd sync: 2026-02-01 15:37:25 (5b6ea75d)
- bd sync: 2026-02-01 15:31:05 (f3bb6129)
- bd sync: 2026-02-01 15:20:59 (afe2d946)
- bd sync: 2026-02-01 14:55:05 (747b51c1)
- bd sync: 2026-02-01 14:52:29 (54e4a8f7)
- merge develop into master (5604c169)
- bd sync: 2026-02-01 12:42:13 (3479dd99)
- bd sync: 2026-02-01 12:41:27 (6eeb3608)
- bd sync: 2026-02-01 11:26:05 (bb2eb733)

## [0.28.47] - 2026-02-01

### Other

- update project files (4fcb3a41)
- bd sync: 2026-02-01 11:15:49 (94e646ea)
- merge develop into master (773781da)
- merge develop into master (00b5ea60)

## [0.28.46] - 2026-01-31

### Fixed

- **docling**: switch MCP transport from Streamable HTTP to SSE (2bb7faac)
- **stage2**: implement remaining code review recommendations (9be4d2da)
- **stage2**: address code review findings for reliability improvements (3b46e553)
- **stage2**: improve Docling session retry and add fallback extraction (e77777e8)
- **tests**: clean up broken unit tests and improve test stability (d5c23015)

### Other

- update docs (c6195dc6)
- bd sync: 2026-01-31 15:33:40 (a7c2b98c)
- bd sync: 2026-01-31 15:23:17 (fb9d97e4)
- bd sync: 2026-01-31 14:42:04 (67724425)
- bd sync: 2026-01-31 14:31:26 (5488fda0)
- bd sync: 2026-01-31 14:27:03 (82567b58)

## [0.28.45] - 2026-01-30

### Added

- **web**: complete code review improvements for course data updates (19f811ea)

### Changed

- **web**: standardize logging and add structure change detection (L2, M3) (5497d018)

### Fixed

- **course-gen-platform**: update 2 source file(s) (0889ceab)
- **ci**: reduce unit tests timeout to 5min (695d4f44)
- **ci**: add always() to downstream jobs for workflow-level cancellation (0c25b405)
- **web**: address code review issues for course data update (40b47496)
- **ci**: update test job dependencies to allow cancelled unit tests (b6b3f3dd)
- **web**: UI now updates after course data changes (Stage 4/5) (c6d2e939)
- **ci**: allow unit tests timeout in CI Success gate (34209e43)
- **ci**: add continue-on-error for unit tests (hanging process issue) (4d2776d9)
- **ci**: mock Redis in unit tests to prevent hanging (388a9520)
- **ci**: remove Redis from unit tests (bd8b84bf)
- **ci**: fix poller tests and increase unit test timeout (d7e9cd77)
- **ci**: add teardown for unit tests to close Redis (264b36dd)
- **ci**: separate vitest config for unit tests (6fe0c30a)
- **ci**: run contract tests sequentially after unit tests (3cb16ef7)
- **ci**: use real secrets for contract and integration tests (246a264c)
- **ci**: add env vars for contract and integration tests (97546e21)
- **ci**: add Redis service for test jobs (a985fc93)
- **ci**: add course-gen-platform build before tests (eb4cfdbc)

### Other

- bd sync: 2026-01-30 22:13:38 (97ece389)
- bd sync: 2026-01-30 22:08:07 (f278483b)
- bd sync: 2026-01-30 21:49:53 (c9e52250)
- add code review report and plan for course data update fix (a7339372)
- bd sync: 2026-01-30 21:18:25 (393b7f65)
- Merge branch 'develop' (b6a7a5d6)
- merge develop into master (a4cae6a3)
- resolve merge conflict in UserTasks.md (afc69d13)

## [0.28.44] - 2026-01-30

### Security

- remove unused debug and test endpoints (513879fe)

### Added

- **ci**: implement tiered testing strategy (071b1daf)
- **admin**: persist log filters in URL params (f0207a8e)
- **i18n**: migrate CascadeStageDeleteModal to next-intl (6f162f27)
- **skills**: add documentation check to /work skill (618b7120)
- **skills**: add /work skill for task management (0bd74f54)

### Other

- update docs (60fe71ed)
- bd sync: 2026-01-30 15:09:06 (5f9c89c5)
- bd sync: 2026-01-30 15:06:33 (2d3e43d0)
- bd sync: 2026-01-30 15:05:12 (ed944cea)
- bd sync: 2026-01-30 15:03:50 (0fe98376)
- bd sync: 2026-01-30 15:02:49 (658954c7)
- bd sync: 2026-01-30 15:01:43 (d5929005)
- bd sync: 2026-01-30 14:50:43 (cf274657)
- bd sync: 2026-01-30 14:50:16 (9e02f5dc)
- bd sync: 2026-01-30 14:18:13 (47718329)
- bd sync: 2026-01-30 14:14:44 (3461cb89)
- bd sync: 2026-01-30 14:03:44 (ff93582c)
- bd sync: 2026-01-30 13:56:33 (5b3b9df1)
- bd sync: 2026-01-30 13:55:21 (3a3fb496)

## [0.28.43] - 2026-01-30

### Added

- **clarifying**: improve UX - move skip button to navigation, show continue only when complete (baa48dcf)

### Changed

- **clarifying**: simplify to 1 round, increase max questions to 14 (62d6aa3f)

### Fixed

- **clarifying**: address code review findings HIGH-001, HIGH-002, MED-001, MED-002 (6123aeae)

### Other

- update docs (8cd42d78)
- bd sync: 2026-01-30 13:11:39 (e869fef4)
- bd sync: 2026-01-30 12:57:16 (d0496404)
- bd sync: 2026-01-30 12:55:43 (59eaacd9)
- bd sync: 2026-01-30 12:48:01 (e9299725)
- bd sync: 2026-01-30 12:16:52 (3064c9cb)
- bd sync: 2026-01-30 12:10:20 (8f5d8633)

## [0.28.42] - 2026-01-29

### Added

- **course-gen-platform**: add 3 source file(s), update 14 source file(s), +1 more (727c04e5)
- **chat**: add inline feedback messages after applyProposal (c049b7c0)
- **benchmarks**: integrate SampleContentViewer into ranking table (0c3fbfe3)
- **benchmarks**: implement test-model command and sample content viewer (01cc13f0)
- **benchmarks**: add point-based scoring methodology and LLM quality tester skill (ff031819)
- **benchmarks**: add scenario/date filters and expandable rows (81d87881)
- **web**: add public /benchmarks page for LLM model rankings (b4abeddb)
- **refinement-chat**: add default mode selection and tooltips (7887414d)
- **prompts**: add forbidden_patterns section to stage6_serial_generator (d716019e)
- **chat**: implement remaining code review recommendations (8f48f2fd)
- **chat**: implement Confirm-then-Apply flow for Stages 4, 5, 6 (90b27fac)
- **admin/logs**: add course column to grouped view (c2d35e23)
- **logger**: add auto-mute rules for expected errors (ab22c3d2)

### Changed

- **prompts**: soften cliché prevention approach (37698972)
- **clarifying**: code review LOW priority improvements (665b420c)

### Fixed

- **stage4**: prevent duplicate clarifying questions generation (1ed07253)
- **ui**: correctly show deduplicated documents as completed in Stage 2 (8633e40f)
- **benchmarks**: sync scoring criteria across all documents (a435406e)
- **graph**: add answeredCount/questionsCount to shallow compare (499995f9)
- **stage5**: setAtPath now correctly handles array access on object properties (45327515)
- **clarifying**: update node counter without page refresh (213679f6)
- **style-prompts**: update conversational and research styles to avoid rhetorical clichés (c6800a44)
- **refinement**: remove AbortSignal from server action and add localStorage safety (dab15549)
- pass missing proposalError and retryProposal props (1bae8f93)
- additional self-review fixes (70521244)
- **hooks**: add isMountedRef check to acceptProposal (421ef9ab)
- **chat**: address P1 and P2 bugs from code review (a1a1fb5f)
- **server-actions**: remove AbortSignal parameters to fix serialization error (87a40e44)
- **query-client**: add 'use client' directive (845d4ca7)
- **refinement**: allow refinement chat for phase-based nodes (Stage 4, 5, 6) (91b57df0)
- **clarifying**: address code review findings for TanStack Query migration (0d8d5332)
- **clarifying**: migrate to @tanstack/react-query for proper cache sync (15926db0)
- **clarifying**: generate questions without documents + one-click accept (42f38c4b)
- **clarifying**: invalidate getProgress cache during polling (a830f0fa)
- **clarifying**: invalidate getProgress cache to update node in graph (3d16b156)
- **docker**: add NEXT_PUBLIC_COURSEGEN_BACKEND_URL to Dockerfile (5c7059c0)
- **clarifying**: invalidate cache after bulk accept recommendations (6931a3c9)
- **clarifying**: use rounded-sm for multi-choice checkboxes (d7a32112)
- **clarifying**: remove dark mode navigation bar artifact (a38e05e6)
- **clarifying**: invalidate cache before refetch in polling (3dab23cc)
- **clarifying**: poll for questions when cache empty + fix progress on skip (9045c34b)
- **admin/logs**: list view now shows all new errors (6d7c7654)
- **db**: add stage_1 and stage_7 to generation_trace constraint (3b4cf4fd)
- **llm**: migrate from xiaomi/mimo-v2-flash:free to paid version (c539eec9)
- **fsm**: allow stage_4_clarifying → stage_4_analyzing transition (6a7f4a2e)

### Other

- bd sync: 2026-01-29 21:10:49 (09c792dd)
- bd sync: 2026-01-29 21:05:47 (1b98be8e)
- bd sync: 2026-01-29 20:46:54 (642f893c)
- **benchmarks**: fix criteria mismatch in scoring system docs (7187081b)
- bd sync: 2026-01-29 19:01:31 (da710a35)
- bd sync: 2026-01-29 12:43:27 (0439cb8a)
- bd sync: 2026-01-29 12:36:05 (95e4206f)
- **benchmarks**: update README with scenario/date filters (7f2b2ea6)
- bd sync: 2026-01-29 10:22:35 (96d57e04)
- bd sync: 2026-01-29 10:19:20 (0a7f8990)
- bd sync: 2026-01-28 21:23:20 (66142eed)
- bd sync: 2026-01-28 21:11:24 (90a7e340)
- bd sync: 2026-01-28 21:10:22 (ab6eaa77)
- bd sync: 2026-01-28 20:13:43 (3edb686a)
- bd sync: 2026-01-28 19:53:22 (04871c29)
- bd sync: 2026-01-28 19:36:43 (14861528)
- bd sync: 2026-01-28 19:33:20 (a8091869)
- bd sync: 2026-01-28 19:32:11 (1a796fe4)
- bd sync: 2026-01-28 19:15:19 (fc233f1c)
- bd sync: 2026-01-28 19:12:07 (462af7af)
- bd sync: 2026-01-28 19:10:37 (9256c6b7)
- bd sync: 2026-01-28 18:41:24 (63721d94)
- bd sync: 2026-01-28 18:40:44 (a85f8f5f)
- bd sync: 2026-01-28 18:22:35 (b8bfeedc)
- bd sync: 2026-01-28 18:13:15 (5f3429c2)
- bd sync: 2026-01-28 18:00:11 (ca931f56)
- bd sync: 2026-01-28 17:58:43 (6af6985c)
- bd sync: 2026-01-28 17:45:39 (96d98fba)
- bd sync: 2026-01-28 15:56:32 (9ac3bbe6)
- bd sync: 2026-01-28 15:42:54 (d5d3dba5)
- bd sync: 2026-01-28 15:32:06 (2eeea3b0)
- bd sync: 2026-01-28 14:42:57 (d22f12d7)
- bd sync: 2026-01-28 14:42:45 (08af4676)
- bd sync: 2026-01-28 14:31:01 (345b6ee1)
- bd sync: 2026-01-28 14:17:49 (4ffc34a1)
- bd sync: 2026-01-28 12:15:35 (e971294f)
- bd sync: 2026-01-28 12:14:53 (9c262ab3)
- bd sync: 2026-01-28 11:57:34 (ce56f63a)
- bd sync: 2026-01-28 11:55:36 (d95a6cf4)

## [0.28.41] - 2026-01-27

### Added

- add 1 skill(s), update docs (2cdd126c)
- **clarifying**: implement Wizard UI layout for Stage 4 (4f064dba)
- **mocks**: add theme toggle and AppThemeProvider support (ace644ad)
- **clarifying-redesign**: add mock comparison page for Stage 4 UI redesign (f7f1621c)
- **trace-logger**: add logTrace() to Stages 1 and 3 for Admin Monitor visibility (81eeff06)
- **lifecycle**: add logTrace for Stage 2 skip path (be537842)
- **clarifying**: add custom input for single/multi choice questions + MissionControlBanner clarifying mode (57acaad2)
- **clarifying**: add ClarifyingBanner component with progress tracking (7184e878)
- **db**: add race condition fix, GIN index, and rollback migrations (0b4c4645)
- **clarifying**: add multi-type questions support (open, single_choice, multi_choice) (b8b9c376)
- **errors**: implement pipeline error class hierarchy (4e3b1905)

### Changed

- **clarifying**: simplify QuestionCard styles for minimalist design (1a537241)
- **stage5,stage6**: use unified safeJSONParse for LLM output (a5012d73)

### Fixed

- **mocks**: add middleware exclusion and proper layout for /mocks routes (c4813a27)
- **clarifying**: use staleTime Infinity - questions never change after generation (ab0b0017)
- **clarifying**: prevent unwanted refetches causing UI reset during editing (5b7f4911)
- **clarifying**: fix useEffect deps array size mismatch error (8557a451)
- **clarifying**: persist confetti shown state in localStorage (b9ea2ec5)
- **clarifying**: fix infinite loader and confetti showing on every open (eb8fcea2)
- **clarifying**: force cache invalidation on answer save for immediate UI update (0b644be0)
- **clarifying**: fix multi_choice with custom answer validation + UI update after edit (d69f471d)
- **clarifying**: refetch questions after answer saved (12ad3550)
- **clarifying**: optimistically switch to answered mode after confirm (866ddb4e)
- **clarifying**: don't override editing mode in useEffect (9d818863)
- **clarifying**: fix infinite loop in useEffect (b33bb6b1)
- **clarifying**: fix UI state sync bugs (efde24f3)
- **clarifying**: code review fixes MEDIUM-002/003/005 + LOW-002 (b5c5ba87)
- **clarifying**: batch endpoint and atomic autoAnswer (HIGH-002, HIGH-003) (fc53d7a2)
- **types**: replace unsafe any cast with proper JSONB types for clarifying_questions (f1f5cf75)
- **clarifying**: address code review issues (CRITICAL-003, HIGH-001,004,005, MEDIUM-004,006) (0185b025)
- **clarifying**: prevent auto-scroll from hijacking user scroll (9968d8bc)
- **clarifying**: fix [object Object] display and add selectedSuggestionIndex (e7e88f55)
- **clarifying**: add query caching to prevent rate limit spam (055e0672)
- **stage4**: log ClarifyingQuestionsInterrupt as INFO instead of ERROR (8a841954)
- **errors**: address code review feedback for pipeline errors (f7699ea9)
- **ui**: show clarifying node fallback when status is stage_4_clarifying (e5f952c1)
- **stage4**: preserve stage_4_clarifying status on AWAITING_CLARIFYING_ANSWERS (5c9c6a6e)
- **stage4**: prevent retry loop for AWAITING_CLARIFYING_ANSWERS + add JSON repair (9ebfcd68)

### Other

- bd sync: 2026-01-27 22:15:09 (bd5b8031)
- bd sync: 2026-01-27 21:15:13 (44a35e5a)
- bd sync: 2026-01-27 21:02:33 (d7fe648f)
- bd sync: 2026-01-27 19:08:27 (265b6ef1)
- bd sync: 2026-01-27 18:54:22 (0316a206)
- bd sync: 2026-01-27 17:48:41 (f9434ce4)
- bd sync: 2026-01-27 17:47:41 (636053b0)
- bd sync: 2026-01-27 17:31:55 (acc5d8ef)
- bd sync: 2026-01-27 17:23:31 (7f76a250)
- bd sync: 2026-01-27 17:14:02 (f3b918a6)
- bd sync: 2026-01-27 16:51:43 (ae81be17)
- bd sync: 2026-01-27 16:51:28 (f6ada813)
- **stage4**: add tests for interrupt vs error logging behavior (5b024e0d)
- bd sync: 2026-01-27 14:23:34 (db8ad151)
- bd sync: 2026-01-27 14:09:35 (21e7f519)
- **errors**: standardize error messages to active voice (06d53b4e)
- bd sync: 2026-01-27 14:05:21 (dcba6821)
- bd sync: 2026-01-27 14:03:40 (f6130d09)
- bd sync: 2026-01-27 14:01:59 (6244e1d1)
- bd sync: 2026-01-27 13:59:42 (507df08f)
- bd sync: 2026-01-27 13:57:12 (5a105f01)
- bd sync: 2026-01-27 13:50:09 (759d281c)
- bd sync: 2026-01-27 13:15:17 (07ac116c)
- bd sync: 2026-01-27 09:54:31 (d602fa29)
- **stage4**: remove broken json-repair test (86d39b31)

## [0.28.40] - 2026-01-26

### Added

- **web**: add clarifying questions info to StageResultsPreview (20ff98e7)
- **backend**: add dev:worker:stage6 script for Stage 6 worker (b7eaa887)
- **stage4**: add self-reflection auto-answer in automatic mode (91552cba)

### Fixed

- **web**: update 4 source file(s), update MCP configs, +3 more (9fdd52ef)
- **stage4**: classify AbortError as LLM_ERROR for proper retry (0b1ffaf1)
- **stage4**: prevent BullMQ retry for AWAITING_CLARIFYING_ANSWERS (6808e381)
- **graph**: connect clarifying node from Stage 4 bottom handle (9a71fd23)
- **graph**: position clarifying node BELOW Stage 4 (95c6a9b8)
- **stage4**: increase clarifying LLM timeout to 5 minutes (e7d70aa3)
- **web**: position clarifying node as side branch below Stage 4 (273687df)
- **db**: add stage_4_clarifying status to FSM (ca24f522)
- **web**: add pipelineStatus param to useDocumentsWithStatus (ac1cdb9b)
- **web**: fix Clarifying Questions node display and auto-open issues (dfce9e2d)
- **web**: prevent rate limit for clarifying.getProgress (19ae4114)
- **dev**: add Stage 6 worker to start-dev.sh (26a9683e)
- **web**: improve error handling in RealtimeProvider (6e579b89)
- **api**: revert to simple JSON format for restart-stage tRPC call (32aa0793)
- **api**: use tRPC batch format for restart-stage endpoint (11568a6b)
- **api**: correct tRPC endpoint path for restart-stage (9d8957fa)
- **web**: resolve ESLint errors in NodeDetailsDrawer (a8184926)
- **web**: resolve 405 error and hydration warnings in restart-stage (143b9e82)
- **stage4**: address medium/low code review findings (db67b053)
- **stage4**: address code review findings for self-reflection (1c3ab8ad)
- **web**: use correct tRPC GET input format in getChatTokenEstimates (60448086)
- **i18n**: use correct ICU interpolation format {var} instead of {{var}} (c01af199)
- **config**: switch xiaomi/mimo-v2-flash from free to paid tier (b8a8dad5)

### Other

- bd sync: 2026-01-26 18:20:56 (9e27ecbe)
- bd sync: 2026-01-26 18:20:17 (1caee731)
- bd sync: 2026-01-26 14:50:44 (d739ecb7)
- bd sync: 2026-01-26 14:36:20 (60ab6b15)
- **i18n**: add Generation Graph section after P3.3 migration (988ec98c)

## [0.28.39] - 2026-01-26

### Changed

- **web**: P3.3 migrate i18n from GRAPH_TRANSLATIONS to next-intl (a88b6d9a)

### Fixed

- **shared-types**: update 1 source file(s), update docs (bf2c554b)
- **web**: TypeScript errors in P3.3 i18n migration (d0f6e648)
- **web**: P3 code review fixes + course regeneration flow (1178d618)

### Other

- bd sync: 2026-01-26 10:44:17 (19fcf9ba)
- update README to reflect next-intl migration (8bde1b06)

## [0.28.38] - 2026-01-25

### Added

- **stage4**: Phase 0.5 security and reliability improvements (ec8f8694)
- **stage4**: implement Phase 0.5 Clarifying Questions (8a67c19b)
- **chat**: require intent selection before send + Stage 6 inline editing (3372c834)

### Changed

- **hooks**: extract useFieldStatusTracking and useCascadeStageDelete (fac701b0)

### Fixed

- **stage4**: change clarifying fallback to Gemini 3 Flash (4b11db4f)
- **stage4**: fix clarifying config stage_number and swap models (f314029d)
- **stage4**: Phase 0.5 final improvements from code review (95da6804)
- **stage4**: Phase 0.5 backlog improvements (1eddf68f)
- **stage4**: Phase 0.5 Clarifying Questions - critical fixes Phase 2 (61821678)
- **stage4**: critical fixes for Phase 0.5 Clarifying Questions (c096b082)
- **chat**: code review fixes - P1-P3 improvements (76d34f9c)
- **chat**: code review fixes for cascade and auth (f0c28707)
- **chat**: resolve 401/404 errors and add cascade stage deletion (e05435fc)
- **share**: update Share API URL to new [orgSlug]/[courseSlug] format (637409e1)
- **urls**: fix API routes and add code review report (5d9d149b)
- **web**: remove fallback to old URLs in viewer components (de783f55)
- **media**: fix 404 on progress API and add polling for image generation (9e93af69)
- **urls**: update course URLs to new format /courses/{org}/{course} (17aba1cc)
- **auth**: add superadmin role and public course access for anon users (573d20c9)
- **web**: keep hover panel visible when visibility dropdown is open (b920dd2f)
- **auth**: add role-based authorization for course operations (1ec6fb2a)
- **web**: fix courseSlug param name in remaining graph components (74db7779)
- **web**: approval button not showing on Stage 5 (2da9cc9a)

### Other

- update docs (48c152ce)
- update llm-model-config with actual DB values (051ba5ec)
- add QA testing guide for 2026-01-25 release (ae75e593)
- bd sync: 2026-01-25 20:13:03 (fde2db69)
- bd sync: 2026-01-25 19:38:02 (dc0144d7)
- bd sync: 2026-01-25 18:21:34 (314851ba)
- bd sync: 2026-01-25 18:21:19 (14527b40)
- bd sync: 2026-01-25 17:57:10 (15e344df)
- bd sync: 2026-01-25 17:55:27 (9718ed71)
- bd sync: 2026-01-25 17:54:55 (817e239c)
- bd sync: 2026-01-25 17:39:11 (79389240)
- bd sync: 2026-01-25 17:29:19 (55a614f3)
- bd sync: 2026-01-25 17:05:24 (591cb42a)
- bd sync: 2026-01-25 17:05:11 (ee714ec9)
- bd sync: 2026-01-25 16:43:32 (a3ef5dcd)
- bd sync: 2026-01-25 16:43:21 (4066df07)
- bd sync: 2026-01-25 15:36:29 (bcdee229)
- bd sync: 2026-01-25 14:54:27 (3d0ac6bc)
- bd sync: 2026-01-25 14:42:02 (10cbecb6)
- bd sync: 2026-01-25 14:35:26 (8a230ab3)
- bd sync: 2026-01-25 14:30:19 (4aca8c43)
- bd sync: 2026-01-25 11:31:06 (15ce0d17)
- bd sync: 2026-01-25 11:28:02 (7b95fd51)
- bd sync: 2026-01-25 09:39:01 (546f0552)
- bd sync: 2026-01-25 09:38:40 (4191e0c5)

## [0.28.37] - 2026-01-24

### Fixed

- **deploy**: add docling-mcp image check before deploy (b2cf9efc)
- **admin/logs**: default to status='new' in list view (2b99aaf0)
- **deploy**: add automatic Docker cleanup after each deploy (7866287a)
- **graph**: auto-refresh UI when stage reaches awaiting_approval (cdcc360e)
- **infra**: add uploads-dev mount to docling and BARRIER_FAILED enum (5d6d05c7)
- **changelog**: sort versions in correct descending order (8d2abbd9)

### Other

- **deploy**: add docling-mcp image management section (f25184fb)
- bd sync: 2026-01-24 22:08:37 (ee74bd37)
- bd sync: 2026-01-24 22:04:35 (8682bdd8)
- bd sync: 2026-01-24 21:48:08 (f166ee0f)
- **deploy**: add Dev Environment section to deployment guide (8bc58c84)

## [0.28.36] - 2026-01-24

### Fixed

- **slug**: prevent suffix truncation in generateSlug (db151980)

### Other

- update docs (38da8487)
- **ADR-004**: fix branch names and add port details (caba9b99)

## [0.28.35] - 2026-01-24

### Added

- **stage5**: make tier1 and escalation models configurable via admin panel (7be3a4b7)
- **i18n**: add i18n support for quick action prompts in GlobalCourseChat (84e537be)
- **llm**: upgrade stage_4_expert, stage_4_synthesis, stage_5_metadata to KIMI K2 (e736be7a)
- **routes**: migrate course URLs to /courses/{org}/{course} (d393065b)
- **chat**: replace keyword classification with explicit UI mode selection (169e280e)
- **chat**: add authenticated Supabase client and rate limiting (f1ad5c46)
- **chat**: add conversation history to LLM prompts (bf2e38d8)
- **form**: add frontend validation limits for course creation (da4402cd)

### Changed

- **chat**: code review improvements - type guards, constants, utilities, a11y (0b4807f4)
- **chat**: configurable fallback model and extract magic numbers (9958fcfe)

### Fixed

- **web**: update 1 source file(s), update docs (ca6d8137)
- **routes**: complete URL migration with full sanitization (9c0a4d91)
- **routes**: remove legacy [slug] routes and add slug validation (e9e5b378)
- **chat**: address code review findings for intent selection (d8caa922)
- **llm**: update fallback to google/gemini-3-flash-preview for premium phases (98af5bd6)
- **tests**: update section-batch-generator tests for current implementation (1274c2fa)
- duplicate key violation and FSM transition errors (946cec54)
- **web**: add Zod validation and HTTP error mapping to chat server action (66f3af3c)
- **stage5**: address code review issues for constraints implementation (1840a2ea)
- **chat**: address code review findings (e4bc9e2a)
- **chat**: fix race condition in GlobalCourseChat and add error boundary (3352e255)
- **stage5**: respect Stage 4 user-edited constraints (total_lessons, total_sections) (5b364c36)
- **migrations**: remove duplicate course_chat_messages migration (371d3ef9)

### Other

- bd sync: 2026-01-24 18:04:45 (3c4c649f)
- bd sync: 2026-01-24 18:00:22 (b1662eb6)
- bd sync: 2026-01-24 17:59:39 (3ba6ebf8)
- bd sync: 2026-01-24 17:47:42 (9a844ab3)
- bd sync: 2026-01-24 17:02:46 (e4330ba0)
- bd sync: 2026-01-24 16:44:24 (b2cae8c2)
- bd sync: 2026-01-24 16:41:58 (b27ff54d)
- bd sync: 2026-01-24 16:39:30 (b998eb67)
- bd sync: 2026-01-24 16:33:00 (f4c19734)
- **stage5**: add unit tests for CourseConstraints implementation (618b229e)
- bd sync: 2026-01-24 16:22:21 (3c1aaedd)
- bd sync: 2026-01-24 16:19:44 (faf5a649)
- bd sync: 2026-01-24 15:08:11 (84eefb27)
- bd sync: 2026-01-24 15:07:58 (084fe7f2)
- bd sync: 2026-01-24 14:59:34 (6e6b6386)
- bd sync: 2026-01-24 14:58:45 (0361ea7e)
- bd sync: 2026-01-24 14:51:54 (dd1dbd25)
- bd sync: 2026-01-24 14:47:04 (8a44639b)
- bd sync: 2026-01-24 14:39:42 (dbbf260d)
- bd sync: 2026-01-24 14:33:33 (ebd5f07d)
- increase form field limits (00062ffd)
- bd sync: 2026-01-24 14:25:30 (fe036c99)
- bd sync: 2026-01-24 14:19:26 (ad574901)

## [0.28.34] - 2026-01-24

### Added

- **course-gen-platform**: add 1 source file(s), update 3 source file(s), +1 more (ddd54cf3)

### Fixed

- **generation**: use all form fields in course generation prompts (6f0f99df)

## [0.28.33] - 2026-01-23

### Added

- **types**: add TypeScript types for GenerationProgress (55839d00)
- **stage3**: auto-assign CORE priority for single document (16857bc7)
- **web**: add navigation to lessons page (Toolbar + Sidebar) (874dfb35)

### Changed

- **locks**: extract lock pattern to shared utility (9ae0234e)

### Fixed

- **generation**: stage 3 now runs for deduplicated documents (5a98a616)
- **web**: use vector_status for document processing status (513996b9)
- **stage2**: enhance filePath validation for empty strings (37df4e54)
- **stage2**: add filePath validation before document processing (07700f6b)
- **stage6**: sync generation_progress.steps[] on completion (ccb72221)
- **locks**: remove double releaseLock in Stage 4 and Stage 5 handlers (283c3d5c)
- **nginx**: add rewrite for /api/trpc to /trpc (99a3baa0)

### Other

- update docs (7c88dbd4)
- bd sync: 2026-01-23 22:16:16 (b5007724)
- bd sync: 2026-01-23 21:54:35 (3e1c1be6)
- bd sync: 2026-01-23 21:54:09 (54def15c)
- bd sync: 2026-01-23 21:50:10 (183713ff)
- bd sync: 2026-01-23 21:49:10 (605feff6)
- bd sync: 2026-01-23 21:46:54 (e5633e2d)
- bd sync: 2026-01-23 21:43:10 (b325400f)
- add code review report for session fixes (d1406535)
- bd sync: 2026-01-23 21:28:07 (d4d30af0)
- bd sync: 2026-01-23 21:26:40 (e230c5e2)
- **stage3**: add unit tests for single document optimization (d4450842)
- add product discovery answers (ru) (7791a6a5)
- merge develop into master (3e453a60)

## [0.28.32] - 2026-01-23

### Other

- add system configuration analysis 2026 report (5cbec50d)

## [0.28.31] - 2026-01-23

### Fixed

- **cover**: use 21:9 cinematic ratio in lightbox preview (ee1883c7)

## [0.28.30] - 2026-01-23

### Added

- **cover**: switch to 21:9 cinematic aspect ratio for lesson covers (a08a5597)

## [0.28.29] - 2026-01-23

### Added

- **web**: expand rotating status messages with type-specific content (13c70d2a)

### Fixed

- **web**: update 15 source file(s), update docs (dcfe7f27)

## [0.28.28] - 2026-01-23

### Security

- fix critical vulnerabilities in local-storage-service (56f6691e)

### Added

- **web**: smooth image loading with skeleton placeholders (6df01294)
- **enrichments**: fix cover/banner generation UX - show variant selection at draft_ready (99eb6800)
- **web**: improve EnrichmentGeneratingCard with shimmer and rotating messages (91ba5b8c)
- add asymptotic crawl to useSmoothProgress hook (688a8934)
- add Next.js rewrite for local enrichments proxy (dc9e46f9)
- **storage**: add unified storage service with auto-backend switching (7c4da690)
- **scripts**: enhance migration script with safety features (17d1bae3)
- **storage**: migrate enrichment images from Supabase to local storage (19fba129)

### Changed

- **cover**: remove two-stage dead code from CoverPreview (9fdd9cd9)
- **enrichments**: simplify cover/banner to single-stage generation (8db572cc)
- improve enrichment handlers and add nginx rate limiting (a5a9651b)

### Fixed

- **enrichments**: remove dead approveCoverDraft code (981976e0)
- **web**: resolve CSP error for enrichment generation in production (dbfc4934)
- move nginx configs to deploy/nginx as single source of truth (ecd696db)
- **db**: remove unused tables and fix performance warnings (93cccce3)
- **enrichment**: reuse cancelled/failed enrichments for regeneration (e60d2ddc)
- **enrichment**: allow cancelling draft_ready enrichments and fix resume race condition (d73bea67)
- **db**: complete Supabase security and performance optimizations (c4b5dde9)
- **web**: replace missing /api/auth/me endpoint with useAuth hook (469aea87)
- **db**: apply Supabase performance and security optimizations (389e7f2e)
- security vulnerabilities and code cleanup (mc2-wisp-157) (b9553cd6)

### Other

- bd sync: 2026-01-23 13:57:06 (a7067856)
- bd sync: 2026-01-23 13:45:03 (760b57ad)
- bd sync: 2026-01-23 12:50:42 (7775492e)
- update deployment guide with nginx single source of truth (07568863)
- bd sync: 2026-01-23 12:47:20 (b0ef627e)
- merge develop into master (b4c32ce8)
- bd sync: 2026-01-23 12:11:13 (4b02c872)
- bd sync: 2026-01-23 12:10:38 (1b416160)
- bd sync: 2026-01-23 12:08:44 (70de28bc)
- bd sync: 2026-01-23 12:03:38 (7eee8b9c)
- **database**: comprehensive code review of 2026-01-23 migrations (ead781d0)
- bd sync: 2026-01-23 12:03:03 (9e1df107)
- bd sync: 2026-01-23 11:57:28 (d2fc8216)
- bd sync: 2026-01-23 11:53:55 (ff0c3c53)
- bd sync: 2026-01-23 11:52:47 (6856cd6c)
- bd sync: 2026-01-23 11:41:37 (6078e650)
- bd sync: 2026-01-23 11:34:22 (092d01e4)
- bd sync: 2026-01-23 11:16:11 (ca0b0a64)
- bd sync: 2026-01-23 11:15:44 (0b1811e7)
- bd sync: 2026-01-23 10:59:28 (0b9e1ca8)
- bd sync: 2026-01-23 10:58:12 (ba266705)
- merge develop into master (3c38aaed)
- bd sync: 2026-01-22 21:09:12 (a4054d5f)
- bd sync: 2026-01-22 21:08:26 (719a92be)
- bd sync: 2026-01-22 20:48:24 (42405720)
- bd sync: 2026-01-22 20:41:50 (ae42a5db)

## [0.28.27] - 2026-01-22

### Added

- **logger**: add type guards, discriminated unions, and usage guide (5f48f29)
- **logger**: add centralized domain-specific logging architecture (cc7bdff)

### Changed

- **validation**: improve logging and type safety in validation-orchestrator (29e06e2)

### Fixed

- **enrichments**: address code review MEDIUM/LOW priority issues (aa59a54)
- **enrichments**: address code review HIGH priority issues (9c4c694)
- **enrichments**: restore generation progress on page reload (8b6781a)
- **logger**: address HIGH priority code review findings (bb57e7e)
- **logging**: improve LLM error logging and add TTL timeout auto-mute (3e9e10e)

### Other

- update 1 skill(s), update docs, +1 more (6cc2744)
- bd sync: 2026-01-22 20:22:57 (9ce5c1c)
- bd sync: 2026-01-22 20:21:11 (8d475ed)
- bd sync: 2026-01-22 20:06:50 (8f389e1)
- bd sync: 2026-01-22 20:04:47 (281e733)
- bd sync: 2026-01-22 19:13:36 (a5daf74)
- bd sync: 2026-01-22 19:07:31 (24c7ec2)
- bd sync: 2026-01-22 18:51:25 (96f760c)
- bd sync: 2026-01-22 18:30:21 (6ddfe85)
- bd sync: 2026-01-22 18:28:11 (c178a10)
- bd sync: 2026-01-22 16:28:35 (29cc292)
- bd sync: 2026-01-22 16:28:24 (1139cd5)

## [0.28.26] - 2026-01-22

### Added

- **enrichment**: add grayscale placeholder with hover color reveal (3fdb463)

### Changed

- fix CPU/memory issues in course generation page (086efcf)
- **template-whitelist**: optimize Helm function matching with Set lookup (6864a32)

### Fixed

- **web**: update 4 source file(s), update docs (002342f)
- address code review issues for performance optimization (9543318)
- sprint bug fixes - template whitelist, patcher retry, banner flow, status validation (2466f45)

### Other

- bd sync: 2026-01-22 16:21:29 (f271e2c)
- bd sync: 2026-01-22 16:21:19 (aebc91b)
- bd sync: 2026-01-22 16:19:05 (e0335f1)
- bd sync: 2026-01-22 16:16:30 (91931f2)
- bd sync: 2026-01-22 16:15:55 (e086cc9)
- bd sync: 2026-01-22 15:03:17 (8645448)
- bd sync: 2026-01-22 15:03:08 (4ca7f9d)
- bd sync: 2026-01-22 14:51:05 (206ff2f)
- bd sync: 2026-01-22 14:09:18 (26a7654)
- bd sync: 2026-01-22 13:59:04 (6ac77ac)
- bd sync: 2026-01-22 13:58:40 (96d8980)
- remove demo pages (ae8c454)

## [0.28.25] - 2026-01-22

### Added

- **lessons**: add progress card to lessons page header (091c133)
- **#14**: add parameter flow dashboard with real-time updates (02e6bd7)
- **lessons**: add course lessons page with cards grid (5c5f17b)
- **#16**: add course edit history for diff view (4de7689)
- **demo**: add placeholder vs generated comparison page (8228b30)
- **logging**: add parameter tracking and validation logging (#12, #13) (4b01105)
- **a11y**: implement keyboard navigation for generation graph UI (00e17c2)
- **skills**: add /process-issues skill for GitHub Issues workflow (b80d910)

### Changed

- **enrichment**: unify all 6 cards into single grid section (63cd31a)

### Fixed

- **web**: update 1 source file(s), update 5 test(s), +1 more (b938ed5)
- **lessons**: address code review issues for lessons page (593de91)
- **progress**: address code review findings for Stage 6 progress bar (63f4dfc)
- **code-review**: address P1 and P2 issues from review (38f750d)
- **progress**: update percentage during Stage 6 lesson generation (b89d608)
- **generation-graph**: implement GitHub Issues #10, #11, #17 (1339f0f)
- **enrichment**: resolve cover/banner generation issues (e476020)
- **enrichment**: unify grid layout for all enrichment cards (a984f77)
- **pipeline**: implement per-field save status and fix type compatibility (dc4062e)

### Other

- bd sync: 2026-01-22 13:47:23 (58d77ce)
- bd sync: 2026-01-22 13:43:39 (ef02ae6)
- bd sync: 2026-01-22 13:43:11 (e5e0bd2)
- bd sync: 2026-01-22 13:40:27 (bfd0a50)
- bd sync: 2026-01-22 13:35:08 (8d4e306)
- bd sync: 2026-01-22 13:26:41 (fb7366a)
- bd sync: 2026-01-22 13:20:53 (89a7ba4)
- bd sync: 2026-01-22 13:15:00 (985726f)
- bd sync: 2026-01-22 13:11:28 (8f2f14c)
- bd sync: 2026-01-22 13:06:27 (9d27401)
- bd sync: 2026-01-22 12:52:57 (56a7642)
- bd sync: 2026-01-22 12:41:58 (da8152a)
- bd sync: 2026-01-22 12:38:22 (6c7bcbf)
- bd sync: 2026-01-22 12:37:00 (4c6ab14)
- bd sync: 2026-01-22 12:22:05 (092961a)
- **plans**: mark Stage 4 persistence plan as completed (5489c26)
- bd sync: 2026-01-22 12:01:59 (3bf95b3)
- bd sync: 2026-01-22 12:00:58 (cbaa4b1)

## [0.28.24] - 2026-01-22

### Added

- **types**: add Zod validation for AnalysisResult type (82dc244)
- **enrichments**: unify placeholder cards to Hover Reveal style (7f1bfb7)
- **pipeline**: pass user-edited params between stages (7b226f6)

### Changed

- **enrichment**: split UnifiedEnrichmentCard into subcomponents (da794bf)
- **enrichment**: P3 improvements - extract LabelWithTooltip, use type guards (1b78cbc)

### Fixed

- **pipeline**: persist Stage 4 edits and show per-field save status (a877e7c)
- **enrichments**: address code review issues for UnifiedEnrichmentCard (df28103)

### Other

- bd sync: 2026-01-22 11:52:05 (292da7b)
- bd sync: 2026-01-22 11:47:56 (be8620f)
- bd sync: 2026-01-22 11:42:40 (0a8d55a)
- bd sync: 2026-01-22 11:39:45 (96712f1)
- bd sync: 2026-01-22 11:38:04 (a33430b)
- bd sync: 2026-01-22 11:36:23 (441a616)
- bd sync: 2026-01-22 11:27:37 (2430bcf)
- bd sync: 2026-01-22 10:47:23 (df7ee52)
- bd sync: 2026-01-22 10:46:21 (6abb58c)

## [0.28.23] - 2026-01-21

### Added

- **file-upload**: implement tier-based file limits with upgrade suggestions (fd1f355)
- **ui**: add glassmorphism for course cards with light/dark theme support (8ec0c6d)
- **visuals**: add lesson card (1:1) generation to Media section (7b5b71f)

### Changed

- **course-viewer**: open course in new tab for instant navigation (5664ee3)

### Fixed

- **stage6**: suppress false RAG warning for courses without documents (801a0a7)
- **stage5**: whitelist Helm/Go template syntax in placeholder validator (RT-008) (9b22334)
- **deploy**: explicitly remove dev containers before recreate (3d5e546)
- **admin-logs**: align list view status=new filter with grouped view logic (029e62d)
- **logs**: increase file upload limit + add Redis reconnect auto-mute (bb671d7)
- **logs+qdrant**: improve error handling for transient failures (91a9867)
- **docker**: permanent fix for Redis DNS failure (97a0fab)
- **ui+pipeline**: improve badge contrast and save target_audience in Stage 4 (bfe0841)
- **i18n**: add missing video.estimatedTime and improve cover/card descriptions (9f52278)
- **images**: use Next.js optimizer instead of Supabase render (43f635d)
- **visuals**: address code review issues for lesson cards media (0b93573)

### Other

- fix eslint error and stage pending changes (4799ac0)
- bd sync: 2026-01-21 21:35:33 (86304e8)
- bd sync: 2026-01-21 21:34:01 (ab5247e)
- **logs**: add auto-mute rules for RAG chunks and Mermaid fallback (59c89ee)
- bd sync: 2026-01-21 21:32:22 (0ff46e9)
- bd sync: 2026-01-21 21:15:09 (d9776fd)
- bd sync: 2026-01-21 21:14:15 (4e52f10)
- bd sync: 2026-01-21 21:09:50 (323d19d)
- bd sync: 2026-01-21 16:50:34 (c75d862)
- **code-review**: add file upload tier limits review report (0a22cca)
- bd sync: 2026-01-21 16:44:40 (d5d21cf)
- bd sync: 2026-01-21 16:06:00 (1a6b1a1)
- bd sync: 2026-01-21 16:05:56 (83019aa)
- bd sync: 2026-01-21 15:44:17 (49b7f36)
- bd sync: 2026-01-21 15:43:19 (46062c2)
- **logs**: add auto-mute rules for cascading repair and corrupted jobs (3372662)
- bd sync: 2026-01-21 15:38:11 (0afac53)
- bd sync: 2026-01-21 15:31:35 (9c6a417)
- bd sync: 2026-01-21 15:27:01 (e59dce5)
- bd sync: 2026-01-21 15:26:16 (331e700)
- bd sync: 2026-01-21 15:20:55 (4ec4664)
- bd sync: 2026-01-21 15:20:07 (a47560a)
- bd sync: 2026-01-21 14:00:00 (7452b0e)
- bd sync: 2026-01-21 13:59:04 (ea4b3c1)
- bd sync: 2026-01-21 13:40:25 (eb0e0f2)

## [0.28.22] - 2026-01-21

### Added

- **courses**: integrate course cover images into UI (4a50c9a)
- **redis**: add graceful shutdown coordination with BullMQ workers (f25336c)

### Fixed

- **generation**: add token validation warnings and pause delay tracking (eae916e)
- **generation**: address code review findings for pause/stop/resume (fc09aca)
- **redis**: improve retry strategy with graceful shutdown and health monitoring (861a7a9)
- **generation**: make pause/stop/resume controls work correctly (f85870f)
- **redis**: exit process after extended connection failure (~20 min) (22111bb)
- **redis**: never give up on reconnection, use exponential backoff (a12150b)

### Other

- update docs (a3a01e1)
- add comprehensive progress report for January 2026 (f9131af)
- bd sync: 2026-01-21 13:29:35 (a9ebad2)
- bd sync: 2026-01-21 13:25:34 (897cbeb)
- bd sync: 2026-01-21 13:24:28 (bbf959a)
- bd sync: 2026-01-21 13:16:13 (0e81dd7)
- bd sync: 2026-01-21 13:16:05 (b36e895)
- bd sync: 2026-01-21 13:08:13 (6acd831)
- bd sync: 2026-01-21 13:07:23 (76fc306)
- bd sync: 2026-01-21 13:05:52 (50ac75d)
- bd sync: 2026-01-21 12:56:35 (b4a4e65)
- bd sync: 2026-01-21 12:54:12 (6fd6f14)
- bd sync: 2026-01-21 12:53:42 (9c177d1)
- bd sync: 2026-01-21 12:43:55 (2c5a740)
- merge develop into master (4dd1bc8)

## [0.28.21] - 2026-01-21

### Added

- **scripts**: add full lesson A/B test with Mermaid generation (14bdceb)
- **db**: add trigger to auto-reopen resolved errors on recurrence (b4b6a4c)
- **scripts**: add validation script for existing lesson content (f10e6d8)
- **scripts**: improve A/B test script for lesson generation (65ef641)
- **stage6**: comprehensive content quality validation (8d593dd)

### Fixed

- **scripts**: correct Xiaomi model ID in Stage 6 quality tests (5ea1412)
- **stage6**: add null checks to prevent TypeError in formatInterLessonContextXML (58155a3)
- **scripts**: add dotenv import to test-lesson-generation (27ce4b0)
- **mermaid**: improve dark mode contrast for edge labels and text (38195b8)

### Other

- update 1 skill(s), update docs (fa9bde2)
- bd sync: 2026-01-21 10:07:08 (ef1f42c)
- bd sync: 2026-01-21 10:06:55 (4dd794c)
- merge develop into master (e60c6a9)
- Merge develop: fix target_queue filtering in OutboxProcessor (1ceb274)
- merge develop into master (2b584d3)

## [0.28.20] - 2026-01-20

### Added

- **llm**: Add hardcoded fallback for Model Config Service (7b7ed82)

### Fixed

- **web**: Use i18n Link for correct SPA navigation (8aa703c)
- **stage2**: Add courseId to Phase 6 summarization error logs (de3420c)

### Other

- update docs (b0577b6)
- bd sync: 2026-01-20 19:12:01 (bdbf540)
- bd sync: 2026-01-20 19:07:43 (e122f3e)

## [0.28.19] - 2026-01-20

### Added

- **logger**: Add auto-mute rules for deploy-related errors (cdf7107)

### Fixed

- **stage7**: Use || instead of ?? for empty string handling in card prompts (705c3fb)
- **web**: Fix Link+Button nesting issues across generation-graph (5ac8d5f)
- **web**: Fix navigation in EndNodePanel "Open Course" button (ca96b58)
- **stage6**: fix TypeScript types in checkAndSetStage6Complete (afbb457)

### Other

- update project files (456d039)
- bd sync: 2026-01-20 17:48:04 (da436e8)

## [0.28.18] - 2026-01-20

### Fixed

- **course-gen-platform**: update 1 source file(s), update docs (31d410f)
- **generation-graph**: correct course_size and notifications display on progress page (a559628)
- **docker**: add BULLMQ_STAGE7_QUEUE_NAME to worker-dev for Stage 7 queue isolation (053927a)

### Other

- bd sync: 2026-01-20 16:45:52 (92b2a8f)
- bd sync: 2026-01-20 16:23:35 (bdc239d)
- **form**: add debug logging for form preferences (49d401f)

## [0.28.17] - 2026-01-20

### Fixed

- **web**: update 1 source file(s), update docs (d2a15ec)
- **docker**: add BULLMQ_STAGE6_QUEUE_NAME to worker-dev for Stage 6 queue isolation (a3eee0f)

### Other

- bd sync: 2026-01-20 16:13:30 (bacd526)
- bd sync: 2026-01-20 16:13:06 (4c0d004)
- **claude**: add rule to never discard uncommitted changes on /push (3f49637)

## [0.28.16] - 2026-01-20

### Added

- **web**: persist all form settings to localStorage (31e5209)
- **web**: replace upload progress bar with fullscreen overlay modal (9f1e360)
- **web**: add file upload progress bar on course creation (7f8fb60)

### Changed

- **stage4**: remove Phase 6 RAG Planning (b635475)
- **web**: unify toast notifications to use Sonner (fc92464)
- **create-course**: reorganize form with GenerationSettingsSection (566473b)

### Fixed

- **upload-overlay**: prevent layout shift when switching files (082620e)
- **model-config**: update stage_number Zod constraint from max(6) to max(7) (1abba23)
- **i18n**: persist selected language in user settings (244f288)
- **deploy**: remove redundant env var from docker-compose (44e5042)
- **deploy**: add NEXT_SERVER_ACTIONS_ENCRYPTION_KEY for persistent Server Actions (69e4aaf)
- **docker**: add uploads-dev mount to docling-mcp for dev environment (60e5bac)

### Other

- bd sync: 2026-01-20 16:09:29 (9552308)
- bd sync: 2026-01-20 16:01:38 (acb01a6)
- bd sync: 2026-01-20 15:50:45 (64e0879)
- bd sync: 2026-01-20 15:44:13 (6e2e59c)
- bd sync: 2026-01-20 15:24:58 (1b344e8)
- bd sync: 2026-01-20 15:24:25 (a7a22c4)
- bd sync: 2026-01-20 15:21:12 (7b52a33)
- bd sync: 2026-01-20 14:52:04 (37aa46e)
- bd sync: 2026-01-20 14:36:49 (c726e54)
- bd sync: 2026-01-20 14:29:53 (fce6b17)
- bd sync: 2026-01-20 13:45:03 (e4f4317)
- bd sync: 2026-01-20 13:29:01 (64ca166)
- bd sync: 2026-01-20 12:49:39 (6e424c9)
- bd sync: 2026-01-20 12:19:12 (0f80012)
- bd sync: 2026-01-20 12:17:46 (80cc7c0)
- bd sync: 2026-01-20 12:16:43 (bda495e)
- bd sync: 2026-01-20 12:14:37 (b11294d)
- bd sync: 2026-01-20 12:13:36 (32644de)
- bd sync: 2026-01-20 12:11:10 (d247ab0)
- bd sync: 2026-01-20 12:03:07 (7329c82)
- bd sync: 2026-01-20 12:01:49 (2878f11)

## [0.28.15] - 2026-01-20

### Added

- **web**: add 5 source file(s), update 8 source file(s), +1 more (5d225ae)
- **create-course**: reorganize UI/UX for course creation form (f4d27e9)
- **i18n**: add image generation translations for enrichments (19701aa)

### Fixed

- **docker**: add DOCLING_UPLOADS_BASE_PATH override for document processing (36e7af1)
- **web**: fix type-check by excluding tests from tsconfig (85086bb)
- **stage6**: add dedicated worker service and queue isolation for dev (2a87bc4)

### Other

- bd sync: 2026-01-20 11:33:31 (a352c32)
- bd sync: 2026-01-20 11:32:59 (e6c89a8)
- bd sync: 2026-01-20 11:30:47 (eb7c108)

## [0.28.14] - 2026-01-20

### Added

- **image-gen**: add quality parameter for GPT-5 Image Mini cost optimization (41543af)
- **stage6**: add person and case agreement grammar rules for Russian (0dc553b)

### Fixed

- **enrichments**: disable auto lesson card/cover generation (6d5f2e3)
- **admin/logs**: fix status filter not working in flat view (0a7ab30)
- **Stage4**: pass course_size via job data to avoid race condition (35f848d)
- **Stage5**: use 'intermediate' as default difficulty instead of undefined (7a01fe8)
- **skill**: dev server errors should be investigated, not bulk resolved (f1e4522)

### Other

- **course-gen-platform**: update 81 test(s) (306f6b1)
- Revert "feat(image-gen): add quality parameter for GPT-5 Image Mini cost optimization" (12ea702)
- bd sync: 2026-01-20 09:11:38 (082955a)
- bd sync: 2026-01-20 08:53:14 (b574be8)
- bd sync: 2026-01-20 08:47:41 (c00d8e8)
- **skill**: add environment filtering to process-logs skill (3bc0103)
- bd sync: 2026-01-20 08:43:30 (12047bf)
- bd sync: 2026-01-19 22:07:55 (427cd88)
- **deps**: update docling-mcp to >=1.3.3 (df4f144)

## [0.28.14] - 2026-01-20

### Added

- **image-gen**: add quality parameter for GPT-5 Image Mini cost optimization (41543af)
- **stage6**: add person and case agreement grammar rules for Russian (0dc553b)

### Fixed

- **admin/logs**: fix status filter not working in flat view (0a7ab30)
- **Stage4**: pass course_size via job data to avoid race condition (35f848d)
- **Stage5**: use 'intermediate' as default difficulty instead of undefined (7a01fe8)
- **skill**: dev server errors should be investigated, not bulk resolved (f1e4522)

### Other

- Revert "feat(image-gen): add quality parameter for GPT-5 Image Mini cost optimization" (12ea702)
- bd sync: 2026-01-20 09:11:38 (082955a)
- bd sync: 2026-01-20 08:53:14 (b574be8)
- bd sync: 2026-01-20 08:47:41 (c00d8e8)
- **skill**: add environment filtering to process-logs skill (3bc0103)
- bd sync: 2026-01-20 08:43:30 (12047bf)
- bd sync: 2026-01-19 22:07:55 (427cd88)
- **deps**: update docling-mcp to >=1.3.3 (df4f144)

## [0.28.13] - 2026-01-19

### Added

- **stage6**: route auto-approval jobs to dedicated queue (08c5bdc)
- **stage6**: activate dedicated queue with 30 concurrent workers (46ac12d)

### Fixed

- **orchestrator**: support snake_case in job cleanup logic (ddc663e)
- **orchestrator**: support snake_case job data fields in queue-events-backup (f6e7383)
- **orchestrator**: prevent attempts exceeding max_attempts constraint violation (7b66da1)

### Other

- bd sync: 2026-01-19 20:55:33 (3482258)
- bd sync: 2026-01-19 20:16:44 (1f81652)
- bd sync: 2026-01-19 20:00:55 (3469b3c)
- bd sync: 2026-01-19 20:00:36 (01699f2)
- bd sync: 2026-01-19 19:57:57 (5ff6918)

## [0.28.12] - 2026-01-19

### Added

- **course-gen-platform**: add 1 source file(s), update docs (12d1b16)
- **stage5**: dynamic min/max lessons validation from course_size presets (eb47b3a)

### Fixed

- **stage2**: add hardcoded fallback for model config in Phase 6 (3eee06f)
- **stage2**: store fallback processed_content on summarization failure (7c1edf4)
- **auto-approval**: correct FSM transitions for automatic mode (ded56e3)
- **course-size**: remove hardcoded min 10 lessons from CourseStructureSchema (eadb0c8)
- **auto-approval**: correct status suffix for all stages + release locks early (21e7f2b)
- **stage2**: handle SandboxedJob missing getState() method (1fe074f)
- **phase-2**: respect course_size preset constraints (MICRO/MINI/COMPACT) (e1efdc1)
- **docling**: transform local paths to container paths for Docker (aa647dc)

### Other

- bd sync: 2026-01-19 19:53:34 (865e208)
- bd sync: 2026-01-19 19:53:08 (765989c)
- bd sync: 2026-01-19 16:58:41 (99a56aa)
- bd sync: 2026-01-19 16:53:56 (eead28b)
- **stage5**: add unit tests for MinimumLessonsValidator (70875b9)
- bd sync: 2026-01-19 16:34:15 (be14505)
- bd sync: 2026-01-19 16:33:38 (d017d79)
- bd sync: 2026-01-19 14:41:24 (4710644)
- bd sync: 2026-01-19 14:41:08 (01c7a53)

## [0.28.11] - 2026-01-19

### Added

- **course-gen-platform**: add 1 source file(s), update 2 source file(s) (4a72f07)

### Fixed

- **stage4**: respect course_size constraints for MICRO/MINI/COMPACT (mc2-usg3) (299c5b3)
- **pipeline**: comprehensive Stage 5 retry and placeholder handling (9ced45b)

### Other

- bd sync: 2026-01-19 13:38:09 (e61aa86)
- bd sync: 2026-01-19 13:35:18 (0bafd9a)
- bd sync: 2026-01-19 13:25:26 (9f3a586)
- bd sync: 2026-01-19 13:21:02 (0c4388c)

## [0.28.10] - 2026-01-19

### Added

- **course-gen-platform**: add 1 source file(s), update 8 source file(s), +3 more (8dc939b)
- **stage5**: remove redundant fields to save ~10K-15K tokens per course (4988cee)
- **stage5**: add auto-approval support for automatic generation mode (e437736)
- **course-gen**: add E2E test for automatic mode express generation (ba506e4)
- **auto-approval**: add case 6 for Stage 6 lesson content generation (7a8c844)
- **processor**: add bundle monitoring, health check, and docs (615e266)
- **logger**: add auto-mute rules for job lifecycle warnings (3b584f8)

### Changed

- **stage4**: remove conflicting pedagogical_strategy fields (162feab)
- **stage4-5**: eliminate over-engineering and fix bugs (9d91a7b)
- **stage4**: parallelize Phase 3 and Phase 6 execution (4bdc25e)

### Fixed

- **stage5**: update JSDoc and fix test import path (4246db8)
- **stage4**: remove conflicting pedagogical_strategy fields from Phase 3 (aa8cfe1)
- **auto-approval**: address code review issues CR-001 through CR-015 (5631bf7)
- **course-gen**: repair JSON parsing and validation failures (f848f29)
- **auto-approval**: add two-step FSM transition for automatic mode (b833f2f)
- **web**: image loader width param and logo aspect ratio (4ebd5a1)
- **processor**: bundle with tsup for BullMQ ESM compatibility (59527e4)
- **deploy**: add orphan container cleanup before dev deploy (5c8bdf7)
- **logs**: return status from RPC to fix filter mismatch (7fa1955)
- **processor**: add missing .js extension to error-service import (5bc28ab)

### Other

- bd sync: 2026-01-19 09:37:34 (28ac21a)
- bd sync: 2026-01-19 09:35:00 (808bb5e)
- bd sync: 2026-01-19 09:09:45 (f53fd5e)
- bd sync: 2026-01-19 08:41:34 (030e2e6)
- bd sync: 2026-01-19 08:41:20 (8d5a16b)
- bd sync: 2026-01-19 08:33:04 (3b1f048)
- bd sync: 2026-01-19 08:21:31 (cbe291e)
- bd sync: 2026-01-19 08:16:15 (addc1f3)
- bd sync: 2026-01-19 08:01:04 (af782cb)
- bd sync: 2026-01-18 22:36:49 (620ea79)
- bd sync: 2026-01-18 22:36:31 (bd4c3ce)
- bd sync: 2026-01-18 21:43:28 (20ecdf0)
- bd sync: 2026-01-18 21:36:25 (949b4c9)
- bd sync: 2026-01-18 21:05:54 (f5d8896)
- bd sync: 2026-01-18 20:55:42 (7dfe20e)
- bd sync: 2026-01-18 20:45:56 (ef1cad8)
- **processor**: add integration tests and bundle analysis (a029d20)
- bd sync: 2026-01-18 20:39:24 (7855416)
- bd sync: 2026-01-18 20:12:34 (917a07b)
- bd sync: 2026-01-18 20:11:24 (886cde6)
- trigger deploy after Docker cleanup (118fd17)
- bd sync: 2026-01-18 19:15:59 (4631701)
- bd sync: 2026-01-18 19:03:12 (1a56b1a)
- bd sync: 2026-01-18 19:00:34 (828f49a)
- bd sync: 2026-01-18 18:58:16 (d3b5ac4)
- bd sync: 2026-01-18 18:54:18 (aeba136)

## [0.28.9] - 2026-01-18

### Added

- add 1 agent(s) (2151956)

### Fixed

- **Stage5**: validate style against enum before Zod validation (ce21433)
- **Stage5**: handle null DB fields in frontend_parameters validation (e8b79c6)

### Other

- bd sync: 2026-01-18 12:46:32 (b37edb2)
- bd sync: 2026-01-18 12:44:51 (e3dd93f)
- bd sync: 2026-01-18 12:05:33 (1284709)
- **deploy**: increase deploy-dev timeout to 20 minutes (382b0dc)
- bd sync: 2026-01-18 11:19:44 (6a0795e)
- bd sync: 2026-01-18 11:18:17 (d712f16)
- bd sync: 2026-01-18 11:17:08 (c6e78b3)

## [0.28.8] - 2026-01-18

### Added

- **GenerationProgress**: auto-start generation in automatic mode (e574d05)
- **generation**: merge automatic and semi-automatic control panels into unified MissionControlBanner (d0b5d19)

### Fixed

- **GenerationProgress**: pause/resume now updates UI in real-time (00fe5fd)
- **GraphHeader**: show fingerprint button with courseId fallback when generationCode is null (f94e667)
- **MissionControlBanner**: address code review P1-P2 issues (2721e94)
- **worker**: log errors to DB inside sandbox before stack trace is lost (6ee2a5d)

### Other

- update project files (e7a3c0f)
- bd sync: 2026-01-18 10:13:47 (0a61c99)
- bd sync: 2026-01-18 09:56:01 (f02d043)
- bd sync: 2026-01-18 09:55:42 (967e274)
- bd sync: 2026-01-17 21:17:32 (bbca538)
- bd sync: 2026-01-17 21:14:33 (e8eff22)
- bd sync: 2026-01-17 21:01:40 (af48ca0)
- bd sync: 2026-01-17 20:52:37 (024ec73)

## [0.28.7] - 2026-01-17

### Fixed

- **admin-logs**: list view now considers fingerprint-based status (1a9aa88)
- **web**: prevent profile learning_style from overriding user's form selection (6aecc35)

### Other

- update project files (9e559b3)
- bd sync: 2026-01-17 18:12:35 (d526e32)

## [0.28.6] - 2026-01-17

### Added

- **course-viewer**: add deep-linking, breadcrumbs, and server progress sync (585d07d)
- **orchestrator**: add processor health check, TTL timeout, and Stage 6 JobResult wrapper (deb6c0e)

### Fixed

- **web**: update 2 source file(s) (5f9543c)
- **logger**: use upsert for duplicate problem_id in error logging (d4591fa)
- **processor**: resolve ESM directory import error in sandboxed processor (53666ca)
- **course-viewer**: complete remaining code review fixes CR-005 through CR-022 (60c1f29)
- **course-viewer**: address code review issues CR-001 through CR-018 (7495849)
- **a11y**: add ARIA labels and null checks to BreadcrumbNav (67111bb)
- **orchestrator**: improve sandboxed processor type safety and reliability (70a796c)

### Other

- bd sync: 2026-01-17 17:23:56 (ea31f03)
- bd sync: 2026-01-17 16:43:04 (2c9eb02)
- bd sync: 2026-01-17 13:22:01 (d358125)
- bd sync: 2026-01-17 11:24:30 (a0094e1)
- bd sync: 2026-01-17 11:21:28 (3dad75d)
- bd sync: close CR-005 through CR-022 tasks (68f9435)
- add code review report for course-viewer improvements (82f7a45)
- bd sync: 2026-01-17 09:47:58 (0b26b11)
- bd sync: 2026-01-17 09:33:22 (b0a1f8d)
- bd sync: 2026-01-17 09:25:41 (811b69b)
- bd sync: 2026-01-17 09:11:46 (c816e58)

## [0.28.5] - 2026-01-17

### Added

- **course-gen-platform**: add 1 source file(s), update 1 source file(s) (15359e4)

### Fixed

- **web**: allow micro course size in validation schema (c930e76)

### Other

- bd sync: 2026-01-17 09:09:53 (855c505)

## [0.28.4] - 2026-01-17

### Added

- **ui**: add missing user settings to Stage 1 Input Tab (6c24b97)
- **export**: implement module lessons export as Markdown (2c36776)
- **db**: add trigger to auto-sync fingerprint in log_issue_status (0a7679e)

### Changed

- **ui**: DRY Stage2Group with utility functions + accessibility (ed1a1d4)
- code quality improvements from review (P2.4, P3.2-P3.6) (0e2bec4)
- **logging**: address code review findings for auto_muted (fb0d96d)

### Fixed

- **course-gen-platform**: update 3 source file(s), update 1 agent(s), +3 more (bccdfb4)
- **types**: add type casts in NodeDetailsDrawer for Stage props (0498f9b)
- **generation**: save generation_mode from form + display writing style on Stage 4 (b5d695d)
- **ui**: complete Stage2Group skipped styling from code review (65f4e64)
- **ui**: add strikethrough style to Stage2Group when skipped (722faa5)
- **export**: security and performance improvements from code review (c9c1cba)
- **ui**: resolve single-click/double-click UX conflict in ModuleGroup (4eeab94)
- add concurrency limiter for Jina API and job.name validation (087fbda)
- **stage5**: remove partial-regen layer and add lock cleanup (b2b1a77)
- **stage5**: prevent infinite retry loop and fix validation errors (5cbfccc)

### Other

- bd sync: 2026-01-17 08:24:06 (089dce5)
- bd sync: 2026-01-17 08:15:57 (3887e14)
- bd sync: 2026-01-17 08:06:39 (d01e493)
- bd sync: 2026-01-17 08:00:58 (ff4b0fb)
- bd sync: 2026-01-17 07:50:09 (34455ad)
- bd sync: 2026-01-16 21:49:24 (694cff0)
- bd sync: 2026-01-16 21:46:31 (b4505a8)
- bd sync: 2026-01-16 21:33:15 (e9f715f)
- bd sync: 2026-01-16 20:39:35 (a34c7d1)
- bd sync: 2026-01-16 18:52:14 (6af452c)
- bd sync: 2026-01-16 18:07:11 (367abf2)
- **skill**: update process-logs to check both error_logs and generation_trace (42598fd)
- bd sync: 2026-01-16 17:21:03 (bda4576)
- bd sync: 2026-01-16 17:18:32 (735fbef)
- bd sync: 2026-01-16 17:05:15 (9111962)
- bd sync: 2026-01-16 16:45:52 (481e8de)
- bd sync: 2026-01-16 16:45:07 (e03e2bd)
- bd sync: 2026-01-16 16:42:38 (2036092)
- **skill**: sync process-logs SKILL.md with auto-mute rules (e769af1)
- bd sync: 2026-01-16 16:24:08 (1d4a657)
- bd sync: 2026-01-16 16:22:55 (49cd4e2)
- **logging**: add performance optimization strategy and docs sync test (6dea902)

## [0.28.3] - 2026-01-16

### Added

- **logging**: add auto_muted status for expected errors (922ec20)
- **lesson-approval**: add migration and tests for batch approval RPC (20dd213)
- **stage4**: add course_description and learning_outcomes to analysis input (16d9817)
- **admin**: add error log grouping by fingerprint (1eced9b)
- **generation**: добавить difficulty в Stage 5 FrontendParameters (36c7766)
- **enrichments**: add optimistic UI + improve error messages (5068594)
- **pipeline**: add language support to Stage 4-5 model selection (aba14e4)
- **logs**: add full-text search for similar problems v1.5.0 (38a894e)

### Changed

- **stage4**: remove unused answers field (afff891)
- **target_audience**: unify data source to courses.target_audience column (84cc1f5)
- **llm**: add actualLanguage tracking, LanguageCode type, language detection (7db570d)

### Fixed

- **shared-types**: update 4 source file(s), update 1 agent(s), +2 more (5e3b89c)
- **logs**: implement server-side grouping with RPC + code review fixes (d8125d7)
- **stage4**: use actual target_audience from DB instead of hardcoded value (4235f29)
- **generation**: передавать course_size и description в Input стадии 5 (782482a)
- **logs**: improve PostgrestError logging with full error details (b647a80)
- **web**: navigation sheet not working in fullscreen mode (c906dfb)
- **enrichment**: address code review issues #5-#7 (91ac950)
- **enrichments**: address code review findings (1af32e4)
- **web**: cleanup unused type and debug comment in EnrichmentsPanel refactoring (55be3e3)

### Other

- bd sync: 2026-01-16 15:56:44 (1b6e087)
- bd sync: 2026-01-16 15:54:13 (5ed0655)
- **logging**: verify auto_muted implementation end-to-end (7755348)
- bd sync: 2026-01-16 15:45:39 (e9462e0)
- bd sync: 2026-01-16 15:43:00 (b586e58)
- bd sync: 2026-01-16 15:41:33 (55317b9)
- bd sync: 2026-01-16 15:26:36 (1b40f56)
- bd sync: 2026-01-16 13:23:26 (13f1de7)
- bd sync: 2026-01-16 13:21:42 (4c7c9ea)
- bd sync: 2026-01-16 13:18:38 (485538e)
- bd sync: 2026-01-16 13:17:59 (b64e009)
- bd sync: 2026-01-16 13:02:42 (d86e8a0)
- bd sync: 2026-01-16 12:54:53 (17890f3)
- bd sync: 2026-01-16 12:45:54 (cf165d8)
- bd sync: 2026-01-16 12:29:13 (2d6399e)
- bd sync: 2026-01-16 12:28:16 (6c9ee6c)
- merge develop into master (d8f962d)
- bd sync: 2026-01-16 11:42:59 (615a9e0)
- bd sync: 2026-01-15 21:23:56 (97c4702)
- bd sync: 2026-01-15 20:43:31 (77c55b9)
- bd sync: 2026-01-15 20:42:27 (01f0503)
- bd sync: 2026-01-15 19:59:47 (15bce39)
- bd sync: 2026-01-15 19:59:42 (45f5c94)
- bd sync: 2026-01-15 19:57:21 (f75692f)
- **web**: split EnrichmentsPanel into smaller modules (06d68dd)
- merge develop into master (0bc0cc5)
- **skills**: add log notes requirements to process-logs v1.4.0 (2e8dd60)
- merge develop into master (de354d6)
- merge develop into master (48b5614)

## [0.28.2] - 2026-01-15

### Added

- **skills**: add process-logs skill for automated error log processing (e379384)
- **logging**: enhance error logging with full diagnostic context (52f3003)

### Fixed

- **stage6**: rename generator.ts to avoid ESM directory conflict (59fcab5)

### Other

- **skills**: add bug fixing principles to process-logs v1.3.0 (5cff6ab)
- **skills**: clarify task complexity routing in process-logs (5dc35eb)
- **skills**: make process-logs instructions mandatory (340debc)
- **skills**: update process-logs with orchestrator instructions (dee78e6)
- bd sync: 2026-01-15 17:10:33 (5ebf671)
- bd sync: 2026-01-15 16:56:50 (de1bf06)

## [0.28.1] - 2026-01-15

### Added

- **admin-logs**: show course name and workflow link in logs table (8a9e641)
- **course-size**: add 'micro' size option and show lesson ranges (fa807d4)

### Changed

- **stage6**: modularize lesson-rag-retriever.ts (bbd8a74)
- **stage6**: modularize orchestrator.ts into nodes and helpers (cc46c43)
- **ui**: move generation mode to advanced settings section (54ab2bd)

### Fixed

- **stage6**: resolve circular dependency in orchestrator (7e2aee7)
- remove unused LessonGraphNode import in judge-node.ts (66c29f7)
- **stage5**: show both content and teaching styles in blueprint preview (cfc1eb0)
- **stage5**: show user-selected style instead of LLM analysis style (14a2356)
- **stage5**: show exact lesson count instead of fake range (5749578)
- **stage6**: fix lessons.content query and add warn/error DB logging (f4b1a95)

### Other

- update project files (098788b)
- bd sync: 2026-01-15 16:50:38 (92ab001)
- **stage6**: remove type assertion in isCoursePaused (3f0417b)
- bd sync: 2026-01-15 16:01:05 (77bf140)
- bd sync: 2026-01-15 16:00:08 (91a0b98)
- **gemini**: add project context and hooks for Gemini CLI (8251819)
- bd sync: 2026-01-15 14:54:38 (e3c2af9)
- bd sync: 2026-01-15 14:37:49 (f1f4334)

## [0.28.0] - 2026-01-15

### Added

- **logging**: add generationCode to worker logs (7950f90)
- **styles**: add 7 new course styles (9bae9b0)
- **monitoring**: add Telegram bot health check to admin dashboard (6e479bb)

### Changed

- **stage6**: address code review findings for style propagation (4c80046)
- **styles**: reduce course styles from 19 to 12 (d77aefb)

### Fixed

- **RT-007**: use word boundaries in hasNonMeasurableVerb (9cdae74)
- **types**: cast course.style to CourseStyle type (b261250)
- **stage4**: remove size hints from AUTO mode prompt (72869b5)
- **stage4**: add explicit AUTO mode guidance for course size determination (f202b8e)
- **stage4**: enforce course size as mandatory constraint with ±20% tolerance (a2aaff6)
- **admin-logs**: implement status filter functionality (9a247a3)
- **stage6**: improve style field validation and error handling (80d8421)
- **stage4**: reduce motivators min length from 100 to 50 chars (ea7357f)
- **stage5**: make TODO pattern case-sensitive (d6b82ce)
- **styles**: add 'microlearning' course style (2731b96)
- **stage6**: pass course style to lesson content generation (17bb9d8)

### Other

- update project files (1be6d48)
- bd sync: 2026-01-15 10:36:02 (6c9d81e)
- bd sync: 2026-01-15 10:29:51 (ed4527d)
- bd sync: 2026-01-15 09:40:24 (0325eb6)
- bd sync: 2026-01-15 09:39:21 (d33c967)
- bd sync: 2026-01-15 09:35:32 (f67e305)
- bd sync: 2026-01-15 09:32:52 (3e18b33)
- bd sync: 2026-01-15 09:31:00 (5a40bef)
- Revert "fix(styles): add 'microlearning' course style" (d3aac55)
- bd sync: 2026-01-15 09:26:56 (1dc8ee6)
- bd sync: 2026-01-15 09:19:18 (fc6b067)
- bd sync: 2026-01-15 09:18:37 (84d8cc7)
- bd sync: 2026-01-15 09:13:29 (59616f4)
- bd sync: 2026-01-15 09:13:18 (d7019ec)
- bd sync: 2026-01-15 09:04:16 (ff7f4a1)
- bd sync: 2026-01-14 22:07:39 (455fc49)
- bd sync: 2026-01-14 21:50:39 (4e75343)
- merge develop into master (0d45f4f)
- Merge branch 'develop' (e73fa0e)
- Merge branch 'develop' (8cb2e60)
- Merge branch 'develop' (fa4c463)
- Merge remote-tracking branch 'origin/develop' (967e210)
- .gitattributes for beads config protection (ac301a3)

## [0.27.11] - 2026-01-14

### Added

- **telegram**: add webhook handler for bot commands (7356498)
- **profile**: add Telegram notification settings section (226b5b6)
- **shared-types**: add i18n UI labels for CourseSizeSelector (c1a8d29)
- **web**: add form validation for courseSize/estimatedLessons dependency (431b06a)
- **course-size**: add 'auto' option as default selection (c5f527f)
- **course-size**: add course size presets (mini/compact/standard/comprehensive) (3ad6b73)

### Changed

- **profile**: simplify Telegram connection with Login Widget (266c539)

### Fixed

- **types**: resolve TypeScript build errors (2554554)
- **lint**: resolve remaining ESLint errors in web package (0ed1af4)
- **lint**: resolve all ESLint errors across packages (0359353)
- **course-size**: address code review findings (0afdb0d)

### Other

- bd sync: 2026-01-14 19:15:49 (292251f)
- bd sync: 2026-01-14 16:51:47 (5d38fbf)
- bd sync: 2026-01-14 16:48:53 (8a00a48)
- bd sync: 2026-01-14 16:44:37 (85e28aa)
- bd sync: 2026-01-14 16:43:52 (22240ef)
- bd sync: 2026-01-14 16:41:31 (5b305d4)
- bd sync: 2026-01-14 16:40:55 (6dab329)
- bd sync: 2026-01-14 16:34:47 (8e85937)
- bd sync: 2026-01-14 16:25:01 (c40b157)
- bd sync: 2026-01-14 16:24:36 (1fda912)
- bd sync: 2026-01-14 16:11:11 (49bf611)
- bd sync: 2026-01-14 16:08:41 (32e963e)
- bd sync: 2026-01-14 14:37:21 (c4a9b3f)

## [0.27.10] - 2026-01-14

### Fixed

- **course-gen-platform**: update 2 source file(s) (72e1f27)

## [0.27.9] - 2026-01-14

### Added

- **course-gen-platform**: add 2 source file(s), update 7 source file(s), +1 more (b9bf595)
- **graph**: add readOnly prop for automatic generation mode (cc6f097)
- **notifications**: add stage completion notifications to stages 2-4 (98efd8e)
- **generation**: integrate AutomaticModeControlPanel into generation progress page (d2f8ee5)

### Other

- bd sync: 2026-01-14 13:47:01 (e0b84e6)
- bd sync: 2026-01-14 13:46:45 (dafb4f0)
- bd sync: 2026-01-14 13:34:36 (b80c0f2)

## [0.27.8] - 2026-01-14

### Added

- **generation**: add automatic generation mode with auto-approval (fd1fc7d)
- add notification services for automatic generation mode (7f17872)
- **web**: add generation mode UI components to course creation form (9108238)

### Fixed

- **course-gen-platform**: update 1 source file(s) (8384a82)
- **stage6**: send completion notifications when all lessons generated (264155d)

### Other

- bd sync: 2026-01-14 13:11:39 (2e04059)

## [0.27.7] - 2026-01-14

### Added

- **generation**: complete pause/stop code review improvements (5a62438)
- **generation**: add pause/resume/stop controls for course generation (3d462c1)
- **stage6**: add stage_6 status transitions in backend (b738e6b)
- **db**: add stage_6 enum values to generation_status (8eca224)
- **enrichments**: implement on-demand generation from course viewer (b6a7254)

### Changed

- **config**: move LKG config from .tmp/ to .local/ (d214b4e)
- **db**: cleanup unused lesson content structures (26bb90c)
- **config**: convert require() to ES imports in next.config.ts (f991a9e)

### Fixed

- **web**: show Stage 6 spinner only when actively generating (5df73f5)
- **stage6,stage7**: align database queries with lesson_contents table (0ae9339)
- **generation**: address code review issues for pause/stop feature (2ef6f45)
- comprehensive health check - fix all vulnerabilities and bugs (745243e)
- **workflow**: Stage 4/5 phases now display lazy-loaded trace data (4769f78)
- **web**: health check - fix React hooks violations and code quality issues (ed01c62)
- **tools**: fix PostgREST query in retrigger-enrichments script (a3a1445)
- **stage7**: fix enrichment creation and lesson query issues (a1a8e59)
- **pwa**: correct cleanUpOutdatedCaches typo (fafc6d3)
- **stage7**: fix course card constraint and enrichment triggers (5d2518d)
- **stage7**: correct lessons query in triggerCourseCard and triggerAllLessonCovers (29d03fd)
- **web**: convert require to ES imports and prevent lint-staged rollback (308305b)
- **lint**: resolve ESLint errors and improve code quality (831dacf)
- **logging**: improve error context with userId capture and metadata standardization (a80e21b)
- **enrichments**: address code review findings for on-demand generation (84a91b2)
- **ui**: Stage 6 progress bar shows real lesson completion percentage (98d5f91)
- **generation**: improve success overlay UX and fix lint errors (ed26de5)
- **logging**: add comprehensive error_logs DB logging to all API routes (177b1ba)
- **generation**: improve success overlay UX (5fdefe6)
- **admin**: lazy load trace details for Input/Output Data (0a28be7)

### Other

- bd sync: 2026-01-14 11:50:16 (8909156)
- bd sync: 2026-01-14 11:36:56 (90e39e2)
- bd sync: 2026-01-14 10:22:40 (7e07991)
- bd sync: 2026-01-14 10:19:20 (7fdf8ff)
- bd sync: 2026-01-14 08:27:00 (8e2c519)
- bd sync: 2026-01-14 07:45:22 (554dc85)
- bd sync: 2026-01-14 07:32:33 (e6fa069)
- bd sync: 2026-01-13 21:15:00 (66f86f3)
- **enrichments**: add unit tests for on-demand enrichment generation (def3fc2)
- bd sync: 2026-01-13 21:11:03 (b81a061)
- bd sync: 2026-01-13 21:10:12 (b8e794c)
- bd sync: 2026-01-13 21:07:26 (89dc93c)
- bd sync: 2026-01-13 20:38:53 (6e96aaf)
- bd sync: 2026-01-13 20:36:09 (833194e)
- bd sync: 2026-01-13 20:32:34 (811ba92)
- bd sync: apply DB changes after import (ebb913a)
- bd sync: 2026-01-13 20:30:45 (d00e07a)
- bd sync: 2026-01-13 20:27:39 (a1ae5d5)
- bd sync: 2026-01-13 20:23:08 (809287b)
- **types**: add stage_6 values to generation_status enum (ac0b79e)
- bd sync: 2026-01-13 18:37:40 (da05b1c)
- bd sync: 2026-01-13 18:34:18 (c0f4e91)
- **enrichments**: clarify auto-generated vs on-demand enrichment types (d262e5e)

## [0.27.6] - 2026-01-13

### Added

- **viewer**: add on-demand enrichment placeholder cards UI (3478de2)

### Fixed

- **ui**: Stage 6 UX improvements - hide regenerate, add finalize button (2f59272)
- **ui**: fix accordion content clipping when open (8b39b34)
- **logging**: add error_logs DB logging to more API routes (05be83e)
- **admin**: fix invisible Input Data content in trace viewer (8c6be80)
- **logging**: add error_logs DB logging to BullMQ job failures (a0d6b8b)
- **courses**: allow superadmin to view workflow of any course (873d892)
- **security**: add SuperAdmin role check for cross-org analytics (814dbdf)
- **pipeline**: skip RAG retrieval for courses without documents (abb3c52)

### Other

- bd sync: 2026-01-13 18:19:39 (fa03e63)
- bd sync: 2026-01-13 18:17:24 (5fbfba1)
- bd sync: 2026-01-13 18:10:04 (2c4ab9d)
- bd sync: 2026-01-13 16:50:23 (dde02c3)
- bd sync: 2026-01-13 16:49:38 (f5ec43d)
- bd sync: 2026-01-13 16:45:44 (5e95cb1)
- bd sync: 2026-01-13 16:35:16 (e737220)

## [0.27.5] - 2026-01-13

### Added

- **admin**: add clickable help tooltips for pipeline stages and phases (9041662)
- **web**: add error logging to all API routes for admin visibility (55e5c5f)

### Fixed

- **web**: reduce noisy health check logs (be5d801)

### Other

- bd sync: 2026-01-13 15:50:59 (c0f1abd)
- bd sync: 2026-01-13 15:39:35 (546caec)

## [0.27.4] - 2026-01-13

### Fixed

- **web**: update 2 source file(s) (9e05eab)

## [0.27.3] - 2026-01-13

### Fixed

- **web**: update 1 source file(s) (d3efc47)
- **web**: add database error logging to admin logs (7a44d3d)

### Other

- bd sync: 2026-01-13 15:09:03 (8dc5609)

## [0.27.2] - 2026-01-13

### Added

- **courses**: increase course catalog cards from 10 to 12 (804cba0)

## [0.27.1] - 2026-01-13

### Added

- **styles**: reorder course styles for B2B focus with professional as default (aae0cf9)

## [0.27.0] - 2026-01-13

### Added

- **admin**: replace polling with Supabase Realtime for logs page (9f0f5a2)
- **db**: add generation_trace lifecycle management (74562e0)
- **admin**: enhanced logs page with problem ID, environment, copy button (293b9c0)

### Changed

- **admin**: extract SeverityBadge component (0626954)

### Fixed

- **scripts**: use temp files instead of pipes in release.sh (fd7c6c4)
- **scripts**: ignore SIGPIPE to prevent exit 141 in release.sh (231e324)
- **scripts**: replace tail with safe_tail_from to avoid SIGPIPE (850bb76)
- **admin**: move Refresh/Live buttons above filter card (c9a560e)
- **admin**: move Refresh/Live to top row with filters (e02285b)
- **admin**: move Refresh and Live buttons inside filter card (3e4e3e8)
- **web**: memory leak on course generation page (4GB RAM, 100% CPU) (d818948)
- **scripts**: fix deploy.sh SIGPIPE and non-interactive mode (2538456)
- **admin**: prevent infinite loop in logs page refresh (35bce6e)
- **admin**: code review fixes for logs page (719f86b)
- **auth**: remove redundant client-side session refresh (c672292)
- **scripts**: improve release.sh auto-commit error handling (c1bf14d)

### Other

- bd sync: 2026-01-13 14:26:47 (83d6232)
- bd sync: 2026-01-13 13:17:13 (c1ba424)
- bd sync: 2026-01-13 13:06:07 (c2e871d)
- bd sync: 2026-01-13 13:03:03 (d20d004)
- bd sync: 2026-01-13 12:58:50 (5c9852a)
- bd sync: 2026-01-13 12:36:49 (fc127ed)
- bd sync: 2026-01-13 12:26:37 (6f22764)
- bd sync: 2026-01-13 12:03:19 (8ccec0f)
- bd sync: 2026-01-13 11:48:44 (aa89ab5)

## [0.26.84] - 2026-01-13

### Fixed

- **web**: remove excessive full-page loaders from fast pages (7464e9d)
- **db**: allow both lesson cards and course cards on same lesson (6c301f8)
- **web**: prevent Select/RadioGroup controlled/uncontrolled switching (53075f3)
- **security**: restrict RLS INSERT policies for users and service tables (670f4bf)

### Other

- **beads**: close mc2-kfa (Leaked Password Protection requires Pro Plan) (b45a9b3)
- **scripts**: add trigger-stage5.ts for E2E testing (6832415)

## [0.26.83] - 2026-01-12

### Added

- **worker**: make BullMQ queue names configurable via env vars (cb5c359)
- add dev environment deployment (dev.ai.megacampus.ru) (2295af7)
- **dx**: add Husky + lint-staged for pre-commit checks (3787dc9)
- **deploy**: split docker-compose for Blue/Green deployment (d898d9b)
- **deploy**: configure Blue/Green deployment infrastructure (d30cb44)
- add Blue/Green deployment infrastructure (36a08e4)
- **beads**: add directory-labels, exclusive-lock, protected-branches, patrols, molecule-bonds (7228303)
- update Blue/Green deployment documentation and add branching strategy RFC (a2bafc1)
- add Blue/Green rollback script and update deployment workflow (c5f2575)
- implement Blue/Green deployment strategy with GitHub Actions and Nginx configuration (684bc17)

### Changed

- **styles**: reorder course styles by popularity (3d1a9f1)
- **admin**: extract user validators to shared module (5f0236b)

### Fixed

- **worker**: increase maxListeners to prevent AbortSignal warning (a87137c)
- **docker**: create /app/data directory with correct permissions (d80b5e8)
- **validation**: add underscore synonyms for primary_strategy and teaching_style (8670eac)
- **deploy**: add worker services to DEV compose with queue isolation (40b4f0e)
- **web**: reduce preloader hang on back navigation (c8d2d6f)
- **deploy**: don't remove shared infrastructure in dev deploy (7217a28)
- convert scripts to Unix line endings (LF) (8aaa2e2)
- **lint**: resolve ESLint errors in admin users components (daba85b)
- **upload**: increase rate limit and add retry queue for bulk uploads (c5215fb)
- **admin**: allow admins to delete students and instructors (3870f1f)
- **admin**: allow admins to toggle user activation status (e687f16)
- enable Docker build on develop branch (24439a0)
- **ci**: verify deployment with correct Blue/Green port (adabd2b)
- **deploy**: add docker login to GHCR before pull (dfb61eb)
- **scripts**: make Blue/Green scripts executable (3bc87e0)
- **deploy**: update scripts for multi-service Blue/Green (25c8da9)
- improve formatting and clarity in branching strategy documentation (6b34398)
- update scripts and config to use master instead of main (5969c7b)
- **beads**: restore config.yaml with new features (no duplicates) (464685b)

### Other

- bd sync: 2026-01-12 19:10:05 (f66f48a)
- bd sync: 2026-01-12 18:58:14 (be433f1)
- bd sync: 2026-01-12 18:54:00 (49b1d4f)
- bd sync: 2026-01-12 18:48:21 (0291c99)
- bd sync: 2026-01-12 16:11:57 (5fab794)
- bd sync: 2026-01-12 14:29:52 (c67021f)
- bd sync: 2026-01-12 13:34:27 (d9f7d0f)
- bd sync: 2026-01-11 21:51:24 (00c3335)
- bd sync: 2026-01-11 21:43:09 (0415a61)
- **web**: install prettier-plugin-tailwindcss (b7b8938)
- bd sync: 2026-01-11 21:42:36 (5b0c52d)
- clarify deployment vs release workflow (a94ebe9)
- bd sync: 2026-01-11 21:36:52 (ee94c03)
- update /deploy command with Blue/Green details (c1d26e1)
- bd sync: 2026-01-11 21:31:39 (6ef67f2)
- update deployment documentation (aabaf6d)
- **beads**: add docker-compose split task (mc2-qq8) (8b74c01)
- **beads**: add ci-cd.yml switch task and update dependencies (9c46b95)
- **beads**: enrich deployment tasks with full context (48990ab)
- **beads**: add documentation and ADR tasks for deployment (8dd8d17)
- bd sync: new tasks for Blue/Green deployment (f845c6e)
- **beads**: add .gitattributes with merge=ours for config.yaml (83d7e7e)
- beads config.yaml with new features (329ef77)
- merge develop into master (78596c3)

## [0.26.82] - 2026-01-11

### Added

- add 1 command(s), update scripts, +1 more (ad3da96)
- batch improvements - graceful shutdown, source docs UI, RAG docs (552846e)
- **embeddings**: implement token-aware batching for Jina API (fb505ed)
- **stage6**: enable priority boosting and save source_documents attribution (74ef973)
- **rag**: implement priority-based retrieval and Stage 3 deprecation (3f09f84)
- **stage6**: add RAG relevance validation to generator prompt (81bc18c)
- **stage7**: add 19-language support for image alt text (a5c3561)
- **i18n**: add full 19-language support for lesson content labels (2a81903)
- **stage6**: add reviewInfo for UI warnings and fix Mermaid parsing (e9aeda8)
- **skills**: add improvements support to code-review-inline v1.1.0 (ecff0f3)
- **skills**: add code-review-inline skill with Beads integration (3980b90)
- **beads**: integrate Beads workflow into all health check skills (16af043)

### Fixed

- code review improvements - race conditions, validation, memory leaks (2ee43d6)
- **rag**: address code review findings for priority-based retrieval (eab7985)
- **stage6**: resolve ESM module resolution conflict for generator import (94510a7)
- **queue**: clean up orphaned jobs with missing data during course deletion (3c1be32)
- **queue**: handle undefined jobs in removeJobsByCourseId (bc4d6bf)
- **cleanup**: add orphaned Redis data cleanup to course deletion (c527a68)
- **queue**: include prioritized queue in removeJobsByCourseId cleanup (4f01211)
- add BullMQ job cleanup to course deletion and fix local dev fetch timeout (133d909)
- **stage6**: resolve multiple production issues in lesson generation (133ce29)
- **stage6**: add 19-language support to markdown parser (56e7205)
- **stage6**: use getContentLabels for section-regenerator titles (26a1eb9)
- **stage6**: localize section headers and exercise labels for Russian (a442d99)
- **stage6**: resolve exercises parsing, factual verification, and sec_global issues (e25d2f4)
- **stage6**: resolve multiple production issues in lesson generation (3ad1ae4)

### Other

- bd sync: 2026-01-11 12:54:17 (cbf7d47)
- bd daemon export: 2026-01-11 12:23:02 (1c4002b)
- bd daemon export: 2026-01-11 12:21:53 (e585d0c)
- bd daemon export: 2026-01-11 12:14:10 (3c1e175)
- bd daemon export: 2026-01-11 12:10:08 (b67dd76)
- bd daemon export: 2026-01-11 12:10:06 (8dd2180)
- bd daemon export: 2026-01-11 12:09:28 (b561032)
- bd daemon export: 2026-01-11 12:07:11 (15beb0c)
- bd daemon export: 2026-01-11 12:05:53 (f461b60)
- bd daemon export: 2026-01-11 12:05:51 (3274a7f)
- bd daemon export: 2026-01-11 12:05:49 (7707848)
- bd daemon export: 2026-01-11 12:05:48 (c32a54a)
- bd daemon export: 2026-01-11 12:05:47 (fc7c89a)
- bd sync: 2026-01-11 12:02:18 (df856c9)
- bd daemon export: 2026-01-11 11:59:54 (eb3fcef)
- bd daemon export: 2026-01-11 11:59:36 (35b19cb)
- bd daemon export: 2026-01-11 11:59:27 (b80ecd6)
- bd daemon export: 2026-01-11 11:59:13 (66467b5)
- bd daemon export: 2026-01-11 11:59:05 (12e669f)
- **i18n**: update Stage 3 description to reflect optional nature (300a7be)
- bd daemon export: 2026-01-11 11:56:42 (0a82a4b)
- bd daemon export: 2026-01-11 11:56:18 (1ee5729)
- bd daemon export: 2026-01-11 11:54:56 (5630859)
- bd daemon export: 2026-01-11 11:54:54 (39f1934)
- bd daemon export: 2026-01-11 11:54:53 (2d9f3ae)
- bd daemon export: 2026-01-11 11:51:45 (4c62463)
- bd daemon export: 2026-01-11 11:47:02 (d0bae8a)
- bd daemon export: 2026-01-11 11:45:31 (4e6e856)
- bd daemon export: 2026-01-11 11:45:22 (bb89601)
- bd daemon export: 2026-01-11 11:45:21 (4ad4641)
- bd daemon export: 2026-01-11 11:45:20 (9c09d8c)
- bd daemon export: 2026-01-11 11:45:18 (1c72811)
- bd daemon export: 2026-01-11 11:45:17 (b28d5e2)
- bd daemon export: 2026-01-11 11:45:16 (1c82f4e)
- bd daemon export: 2026-01-11 11:37:43 (9104c21)
- bd daemon export: 2026-01-11 11:37:17 (eae08a7)
- bd daemon export: 2026-01-11 11:37:07 (9b47c4e)
- bd daemon export: 2026-01-11 11:36:56 (7fa364e)
- bd daemon export: 2026-01-11 11:36:54 (a33dcdd)
- bd daemon export: 2026-01-11 11:24:01 (6347dd0)
- bd daemon export: 2026-01-11 11:14:55 (48b69f6)
- **beads**: enhance integration and add RAG refactoring task (7ea817b)
- bd sync: 2026-01-11 10:58:36 (cb8d788)
- **beads**: add Health Check Workflows section to quickstart (4e3bee2)

## [0.26.81] - 2026-01-08

### Added

- **course-gen-platform**: add 14 source file(s), update 18 source file(s), +5 more (908aec2)

### Other

- bd sync: 2026-01-08 16:37:48 (e123ce3)
- **video-pipeline**: complete research phase, add avatar decision (5f14e8a)

## [0.26.80] - 2026-01-08

### Fixed

- **course-gen-platform**: update 28 source file(s), update docs (076aeea)

## [0.26.79] - 2026-01-07

### Added

- **web**: add 1 source file(s), update 5 source file(s) (2ffe537)

## [0.26.78] - 2026-01-07

### Fixed

- **web**: update 1 source file(s) (9f733b8)

## [0.26.77] - 2026-01-07

### Fixed

- **web**: update 2 source file(s) (2622bf0)

## [0.26.76] - 2026-01-06

### Fixed

- **course-gen-platform**: update 5 source file(s), update 2 test(s), +2 more (76f8d11)

## [0.26.75] - 2026-01-06

### Fixed

- **web**: update 13 source file(s), update docs (7159e0c)

### Other

- **web**: remove duplicate default exports (075fe22)

## [0.26.74] - 2026-01-06

### Added

- **web**: add 5 source file(s), update 4 source file(s), +1 more (7592229)

## [0.26.73] - 2026-01-06

### Fixed

- **web**: filter progress summary by current node to preserve details without duplication (8955baf)

## [0.26.72] - 2026-01-06

### Fixed

- **web**: remove duplicate self-review display in quality assessment (73f7493)

## [0.26.71] - 2026-01-06

### Fixed

- **web**: code review improvements for visual style feature (822b09e)

## [0.26.70] - 2026-01-06

### Added

- **web**: add 1 source file(s), update 8 source file(s) (fe95a64)

## [0.26.69] - 2026-01-06

### Fixed

- **course-gen-platform**: update 1 source file(s) (ec89219)

## [0.26.68] - 2026-01-06

### Added

- **web**: add 1 source file(s), update 4 source file(s), +1 more (ad3a71b)

## [0.26.67] - 2026-01-06

### Added

- **web**: add 4 source file(s), update 41 source file(s), +3 more (d80723a)

## [0.26.66] - 2026-01-05

### Fixed

- **course-gen-platform**: update 7 source file(s), cleanup 2 file(s) (0e43ce6)
- **ci**: use pnpm store cache instead of artifacts, fix rollback --pull flag (bcd99ac)

## [0.26.65] - 2026-01-05

### Other

- update project files (04ba405)

## [0.26.64] - 2026-01-05

### Fixed

- **shared-types**: update 5 source file(s), update docs (7b391f7)

### Other

- add Mermaid LLM Fixer upgrade investigation (9fff859)

## [0.26.63] - 2026-01-05

### Fixed

- **course-gen-platform**: update 9 source file(s), add 1 test(s), +3 more (d8cb89c)

## [0.26.62] - 2026-01-05

### Fixed

- **web**: update 2 source file(s) (300914d)

## [0.26.61] - 2026-01-04

### Changed

- **ci**: enable Docker layer cache for web build (b69c5e8)

### Fixed

- **web**: update 3 source file(s) (ed91e87)

## [0.26.60] - 2026-01-04

### Fixed

- **web**: prevent hydration error by not removing initial-loader from DOM (a1cc5b5)

## [0.26.59] - 2026-01-04

### Fixed

- **web**: unify theme management with hydration-safe useThemeSync hook (6f3d1c8)

## [0.26.58] - 2026-01-04

### Fixed

- **web**: revert enableSystem to fix hydration errors (2ae6b19)

## [0.26.57] - 2026-01-04

### Fixed

- **nginx**: add no-cache headers to prevent stale HTML errors (921faeb)

## [0.26.56] - 2026-01-04

### Fixed

- **web**: add smart cache invalidator on version change (e2dcaf4)

## [0.26.55] - 2026-01-04

### Fixed

- **web**: remove obsolete KillSwitch script (PWA disabled) (b4d126d)

## [0.26.54] - 2026-01-04

### Fixed

- **web**: update 1 source file(s) (3994dee)

## [0.26.53] - 2026-01-04

### Fixed

- **web**: update 1 source file(s) (84d9edb)

## [0.26.52] - 2026-01-04

### Added

- **web**: add 24 source file(s), update 4 source file(s) (60b2610)

### Fixed

- **api**: use Redis-based readiness check for cross-process sync (bda855c)
- **generation-ui**: show Stage 1 as completed when awaiting launch (d30a3dd)
- **worker-readiness**: add Redis sync for cross-process readiness status (4c98de3)

## [0.26.51] - 2026-01-04

### Fixed

- **course-gen-platform**: update 5 source file(s), add 1 test(s), +1 more (d64a5e2)

## [0.26.50] - 2026-01-04

### Added

- **course-gen-platform**: add 1 source file(s), update 3 source file(s) (5548b8c)

## [0.26.49] - 2026-01-04

### Added

- **course-gen-platform**: add 5 source file(s), update 7 source file(s) (b38051a)

## [0.26.48] - 2026-01-03

### Added

- **stage7**: add card enrichment handler for 1:1 course/lesson thumbnails (56e3fb0)
- **stage7**: switch image generation from Seedream 4.5 to Gemini 2.5 Flash (f86736a)

### Fixed

- **stage7**: allow text in generated images (12f76e8)

## [0.26.47] - 2026-01-03

### Fixed

- **stage7**: fix two-stage cover flow and delete extension mapping (13e84a3)

## [0.26.46] - 2026-01-03

### Fixed

- **stage7**: add image_config for proper aspect ratio and resolution (f7e98d2)

## [0.26.45] - 2026-01-01

### Added

- **web**: add 5 source file(s), update 19 source file(s) (455a30b)
- **stage7**: add cover preview and delete button for enrichments (764d0ec)
- **docker**: add Stage 7 enrichment worker to production compose (5e2541a)

### Fixed

- **stage7**: use unoptimized images for cover preview (f86769a)
- **nginx**: increase proxy buffers to fix 502 errors (e209173)
- **stage7**: handle OpenRouter chat completion image format (df9779c)
- **stage7**: handle different OpenRouter image response formats (89347a5)

### Other

- **release**: v0.26.45 (0fc6d7f)

## [0.26.44] - 2025-12-31

### Added

- **web**: add 1 source file(s), update 2 source file(s) (95c0121)
- **admin**: add Stage 7 (Enrichments) to admin pipeline page (7be1400)
- **enrichments**: add cover option to all enrichment UI locations (8930c9d)

### Changed

- **admin**: apply code review improvements (8ed8510)

## [0.26.43] - 2025-12-31

### Fixed

- **web**: update 1 source file(s) (66d58eb)

## [0.26.42] - 2025-12-31

### Added

- **.claude**: add 19 source file(s), update docs (14e84c5)
- **enrichments**: add cover image generation for lessons (fff0838)

### Changed

- **enrichments**: apply code review improvements to cover feature (8bea531)

### Fixed

- **web**: add APP_VERSION to container for proper logging (2ef0527)
- **web**: disable PWA + add Kill Switch to fix 502 errors (404d3c5)

### Other

- add PWA disabled context and recovery plan (67ba69e)
- **release**: v0.26.42 (8cfc89e)

## [0.26.41] - 2025-12-30

### Fixed

- **web**: update 1 source file(s), update docs (cfeff98)

## [0.26.40] - 2025-12-30

### Changed

- **web**: remove empty UI blocks and add intro section styling (e342066)

### Fixed

- **web**: update 1 source file(s) (593c474)
- **web**: improve mermaid text readability on light backgrounds in dark theme (610aa49)
- **web**: load lesson content from lesson_contents table (03d0894)

## [0.26.39] - 2025-12-30

### Added

- **web**: add 48 source file(s), update 46 source file(s), +6 more (ed8d876)
- **stage7**: add deep-link integration for enrichment inspector (55ca2c0)
- **stage7**: add enrichment inspector panel with Stack Navigator pattern (fee3163)
- **stage7**: implement presentation enrichment with two-stage flow (73d1bdc)
- **stage7**: implement audio enrichment with OpenAI TTS (993e9ba)
- **stage7**: implement quiz enrichment handler with Bloom's taxonomy (226140b)
- **stage7**: add unified VideoScriptPanel for video enrichments (e6df67b)
- **stage7**: add video handler with two-stage script generation (b0f1a7e)
- **stage7**: add video script prompt template for enrichments (aa3b3a9)
- **stage7**: add Asset Dock visual foundation for enrichments (bd31e13)
- **stage7**: add tRPC enrichment router with 12 procedures (aa82ac4)
- **stage7**: add BullMQ worker infrastructure for enrichments (1d48563)
- **stage7**: add enrichment types, schemas, and database migration (cc492f9)
- add 4 skill(s), add 1 command(s), +4 more (2372fca)
- **web**: add 1 source file(s), update 2 source file(s), +1 more (fd0b8b0)
- **scripts**: add --message flag to release.sh for custom commit messages (24397ec)
- **commands**: update slash commands (135c4cf)
- **agents**: add lead-research-assistant agent (0898b23)
- **skills**: add 3 new skills (SKILL.md, ...) (2be4354)

### Fixed

- **stage7**: code review low priority improvements (1ad3d1a)
- **stage7**: code review medium priority improvements (29fd163)
- **stage7**: address code review issues for enrichment inspector (048f138)
- **stage7**: use DEFAULT_MODEL_ID instead of hardcoded model (b312101)
- **stage7**: production-grade improvements for enrichment pipeline (81b4eb4)
- **stage7**: code review fixes for AssetDock and enrichment infrastructure (0e4dd96)
- **pwa**: remove JS/CSS from SW cache to prevent 502 after deploy (9d8c6c7)
- **web**: add emergency SW cleanup for stuck users with stale cache (6bce501)
- **gitignore**: unignore admin/logs page route (b105489)
- **graph**: fix completed lessons showing as pending on initial load (819c91f)

### Other

- **release**: v0.26.37 (c9700de)
- **release**: v0.26.36 (80709a5)
- **release**: v0.26.35 (900a87e)
- **release**: v0.26.34 (1dac0ae)
- **release**: v0.26.33 (ceacf61)
- update docs (5e9ac1c)
- **release**: v0.26.32 (87f10e9)
- cleanup 1 file(s) (bd1711b)
- **release**: v0.26.31 (8bac38d)
- update project files (b28dca2)
- **release**: v0.26.30 (8db394b)
- update scripts (f3a19f5)
- **release**: v0.26.29 (b6e73fc)
- **release**: v0.26.28 (e68be84)
- **release**: v0.26.27 (c242544)
- **release**: v0.26.26 (415da21)
- update documentation (d0a6e79)
- **release**: v0.26.25 (3259506)
- update documentation (4b7f511)
- **release**: v0.26.24 (c28819f)
- update documentation (114d4a1)
- **release**: v0.26.22 (882e3df)
- update documentation (1a81ada)

## [0.26.37] - 2025-12-28

### Fixed

- **pwa**: remove JS/CSS from SW cache to prevent 502 after deploy (9d8c6c7)

## [0.26.36] - 2025-12-28

### Added

- add 4 skill(s), add 1 command(s), +4 more (2372fca)

## [0.26.35] - 2025-12-28

### Fixed

- **web**: add emergency SW cleanup for stuck users with stale cache (6bce501)

## [0.26.34] - 2025-12-28

### Added

- **web**: add 1 source file(s), update 2 source file(s), +1 more (fd0b8b0)
- **scripts**: add --message flag to release.sh for custom commit messages (24397ec)

## [0.26.33] - 2025-12-27

### Fixed

- **gitignore**: unignore admin/logs page route (b105489)

### Other

- update docs (5e9ac1c)

## [0.26.32] - 2025-12-27

### Other

- cleanup 1 file(s) (bd1711b)

## [0.26.31] - 2025-12-26

### Other

- update project files (b28dca2)

## [0.26.30] - 2025-12-26

### Other

- update scripts (f3a19f5)

## [0.26.29] - 2025-12-26

### Added

- **commands**: update slash commands (135c4cf)

## [0.26.28] - 2025-12-26

### Added

- **agents**: add lead-research-assistant agent (0898b23)

### Fixed

- **graph**: fix completed lessons showing as pending on initial load (819c91f)

## [0.26.27] - 2025-12-26

### Added

- **skills**: add 3 new skills (SKILL.md, ...) (2be4354)

## [0.26.26] - 2025-12-26

### Other

- update documentation (d0a6e79)

## [0.26.25] - 2025-12-25

### Other

- update documentation (4b7f511)

## [0.26.24] - 2025-12-25

### Other

- update documentation (114d4a1)
- **release**: v0.26.22 (882e3df)
- update documentation (1a81ada)

## [0.26.22] - 2025-12-24

### Other

- update documentation (1a81ada)

## [0.26.21] - 2025-12-24

### Other

- update documentation (89fc07d)

## [0.26.20] - 2025-12-23

### Other

- update documentation (7b3e38b)

## [0.26.19] - 2025-12-23

### Other

- update project files (d69b46c)

## [0.26.18] - 2025-12-23

### Other

- update documentation (7fecc4f)

## [0.26.17] - 2025-12-23

### Other

- update project files (6f65a1c)

## [0.26.16] - 2025-12-23

### Other

- update project files (78b1d44)

## [0.26.15] - 2025-12-22

### Other

- update documentation (61aa40e)

## [0.26.14] - 2025-12-22

### Other

- update documentation (b94d5b7)

## [0.26.13] - 2025-12-21

### Other

- update project files (fa26a69)

## [0.26.12] - 2025-12-21

### Fixed

- **bunker**: ESM \_\_dirname compatibility and config path alignment (2541596)

### Other

- update project files (89de372)

## [0.26.11] - 2025-12-21

### Fixed

- **generation**: remove unused long-running notification feature (6b36081)

### Other

- update project files (83359c4)

## [0.26.10] - 2025-12-21

### Other

- update documentation (fbdf974)

## [0.26.9] - 2025-12-20

### Added

- **error-pages**: add shared error state components with i18n and theme support (aaa0990)
- **models**: centralize default model config with Xiaomi MiMo V2 Flash (a9566b2)
- **approval-controls**: unify approval UI with regenerate support (d857c80)
- **stage5-6**: add structure approval flow and generate all button (4e0fea1)
- **deploy**: add Telegram notifications for deploy status (8fb0dff)

### Changed

- **web**: skip eslint during builds for faster CI (e64a6d8)

### Fixed

- **courses**: cleanup external resources when deleting course (f53ad93)
- **docker**: add shared-logger package to web Dockerfile (dd8f160)
- **docker**: add shared-logger package to Docker build (01839ff)
- **ci**: add shared-logger build step to CI workflow (1474970)
- **llm**: optimize model config service with parallel fetch and token utility (fb95a94)
- **stage5**: show ApprovalControls when stage awaiting approval (cfb92e3)
- **docker**: disable healthcheck for worker container (2584444)
- **deploy**: skip docling-mcp pull, improve rollback (5855fa5)
- Use lowercase mc-2 for ghcr.io image paths (52be950)
- **deploy**: fix case sensitivity in ghcr.io paths (MC-2 not mc-2) (1d303ff)
- **deploy**: add pull_policy for docling-mcp, use mc-2 registry (03c3310)
- **deploy**: fix YAML syntax in Telegram notification (33d957d)
- **deploy**: use megacampusai registry for docling-mcp (too large to rebuild) (a7275f7)
- **deploy**: update image paths to mc-2 registry (b1cdfad)

### Other

- **scripts**: update automation scripts (51eef5a)
- **agents**: update agent configurations (3007100)
- **agents**: update agent configurations (101d02c)
- Initial commit: MegaCampus 2.0 AI Course Generation Platform (d502e3a)

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

## [0.26.2] - 2025-12-15

### Added

- **agents**: add 2 new agents (deployment-engineer, docling-devops)

### Fixed

- **mcp-client**: fix reconnection for 'Not connected' errors in Docling client
- **worker**: increase retry count and delay for MCP connection stability

## [0.26.1] - 2025-12-15

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

## [0.22.43] - 2025-12-09

### Added

- **web**: implement Stage 6 "Glass Factory" UI for lesson generation (a064a83)

### Fixed

- **stage6-ui**: query lesson_contents via sections/lessons tables (ab57b46)
- **stage6-ui**: resolve module data loading and lesson double-click (a879d49)

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

## [0.18.1] - 2025-11-16

## [0.18.0] - 2025-11-16

### Added

- **cleanup**: implement automated draft course cleanup system (1f3a43b)
- **frontend**: remove difficulty selection and fix RLS recursion (1eb4d5e)

### Changed

- **worktree**: simplify file sync using rsync instead of config-based approach (0deb66a)

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
- API endpoint documentation (generation.\*, tRPC router)
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
