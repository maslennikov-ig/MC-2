# Release Notes

User-facing release notes for all versions.

## v0.31.41

_Released on 2026-09-02_

### ✨ New Features

- **career-playbook**: Flag a word that changes alphabet in the middle
- **career-playbook**: "by when" gets an owner, like "how much" and "how often"
- **career-playbook**: A reader gets their own guide, and only theirs
- **career-playbook**: Gate repetition by audience
- **career-playbook**: Add audience-specific role guide views
- **career-playbook**: Add semantic repetition baseline tool
- **cost**: The ledger had one provider, and retrieval was billed by another
- **routing**: Cheapest endpoint that can actually finish
- **cost**: The price gate writes the price instead of asking someone to
- **images**: The lesson banner moves to riverflow, and three things had to change first
- **rag**: Stage 6 stops capping results per document
- **rag**: Measure the diversity grouping actually buys, not the diversity it promises
- **llm**: Stage 6 prose moves to glm-5.3-flash after the deploy
- **llm**: Prose phases move to z-ai/glm-5.3-flash
- **rag**: The half of the Qdrant epic that was never measured
- **llm**: Measure z-ai/glm-5.3-flash where luna-pro was going to go
- **llm**: The price ceiling reads today's rate instead of remembering one
- **llm**: The cheap tier is chosen, not inherited from a price sort
- **notebooklm**: The bridge re-mints its own cookies, and says so when it cannot
- **docling**: Turn on PDF heading inference in both places, or in neither
- **nlm**: Three enum values become three working types
- **observability**: A worker restart is now visible from the database alone
- **Database**: Three NotebookLM enrichment types the library makes and the enum refused
- **routing**: The cheapest judge takes the seat that runs most, and latest is safe to follow again
- **images**: A card asks how much detail it is paying for, on the endpoint that has the knob
- **ops**: Alert on host disk, fix the storage counter's starting point, report cost
- **stage6**: Batch initial lesson generation through OpenRouter
- **llm**: Route Gemini work to 3.7-flash instead of 3-flash-preview
- **cost**: Record what each LLM call costs, against the course that made it
- **rag**: Search the small grain, answer with the large one
- **ops**: Gate config seed drift, reject impossible budgets, name empty RAG
- **llm**: Make reasoning configurable per phase, with its own token budget
- **llm**: Route every phase onto the models OpenRouter actually offers
- **career-playbook**: Make the source-evidence budget measure itself
- **career-playbook**: Catch attribution laundering and cadence drift
- **career-playbook**: Close the six defects the editorial read found
- **career-playbook**: Enforce the quality contract in the generation tract
- **career-playbook**: Add isolated load acceptance
- **rag**: Add disabled shadow retrieval metrics
- **playbook**: Animate reader panels
- **qdrant**: Add bounded off-host snapshot recovery
- **career-playbook**: Persist viewer block changes
- **ops**: Give the uploaded sources a second copy, off the production host
- **docling**: Measure both OCR candidates and reject both, on the record
- **docling**: Let seven Premium formats through, and stop trusting the client's MIME
- **docling**: Call the enrichment router from the conversion phase
- **docling**: Selective enrichments behind a router that must justify itself
- **docling**: Settle the chunking A/B on production ranking, not a proxy
- **docling**: Structure-aware chunking with real provenance, behind a flag
- **docling**: Migrate processing stack to MCP 2
- **qdrant**: Whitelist the document repair command in the operator
- **qdrant**: Add a bulk repair path for documents that indexed no vectors
- **q12**: Drive the never-executed migration children against a restored isolate (mc2-rjy9k)
- **q12**: Probe the frozen-env surface of every manifest command (mc2-bh3ef, mc2-rjy9k)
- **q12**: B3 follows the B1 shape — measure the rewrite, fail only on dependence (mc2-38ivn)
- **q12**: B3 names the remedy when the pooler rewrites application_name (mc2-38ivn, mc2-ot8se)
- **q12**: Make the pre-flight load-bearing — cutover gate on a fresh green report (mc2-ot8se)
- **q12**: Pre-flight group H and the tracked deployed-asset manifest (mc2-ot8se)
- **q12**: Pre-flight groups C/D/E — unrun path, catalog agreement, quiesce feasibility (mc2-ot8se)
- **q12**: Pre-flight group B — the pooled session (options, session-mode, appname, datdba) (mc2-ot8se)
- **q12**: Pre-flight group A — privilege reachability on the guarded set (mc2-ot8se)
- **q12**: Window pre-flight skeleton with a fail-closed report contract (mc2-ot8se)
- **orchestration**: Detect work that never reached develop (mc2-xxwsu)
- **career-playbook**: Remove numeric review mode
- **qdrant**: Give the Q12 window a real execution identity and one privileged seam (mc2-1by33)
- **qdrant**: Derive Q12 accepted coverage from file_catalog truth (mc2-tpdog)
- **qdrant**: Amend .13.4.1 dispositions to file_catalog-only bookkeeping (mc2 Q12)
- **qdrant**: Add .13.4.1 reviewed plan-input generator
- **q12**: Wire source.forward acceptance emit into the Q12 forward wrapper tail (W7a defer a)
- **q12**: Add source.forward acceptance emit CLI entrypoint (W7a real-leg invocation)
- **q12**: Add computeSourceForwardAcceptance emit-entrypoint (W7a real-leg write half)
- **q12**: Wire real read_source_forward_acceptance (W7a real-leg read half)
- **q12**: W7a inc3 — thread on_source_forward_accepted (source.forward→reindex.plan)
- **q12**: W7a inc2 — thread on_pg_backup_done in production drive loop (pg.backup→pg.restore)
- **q12**: W7a inc1 — wire production execute_ordinary seam (real ordinary exec)
- **q12**: Structural D4 real-run acceptance oracle (W2-oracle mc2-j58wi)
- **q12**: Run-root staged-values authority for recover determinism (W2-consistency mc2-j58wi)
- **q12**: Production-gated staged value resolver + run_live fork (W2-fork mc2-j58wi)
- **q12**: Lift source-snapshot seam to window executor (W3-struct mc2-58tnx)
- **q12**: Expose --stop-after reversible STOP-point on live CLI (W4 mc2-dxcaa)
- **q12**: Wire owner-custody forward-resume executor for live/recover (W1 mc2-yz3xe)
- **q12**: Rehearsal-probe.sh — bounded server-mechanics probes (GREEN, #21)
- **qdrant**: Add Q12 R8 custody rehearsal driver scripts
- **q12**: GREEN real cutover cleanup-crash recover convergence runner
- **q12**: GREEN real crash+refusal composed-recovery leg + crash seam
- **q12**: Drive REAL frozen barrier cleanup off activated state + R8-B-1 seam
- **q12**: GREEN R8-B-1 real ProductionExecutor post-activate file-artifact seam
- **q12**: GREEN R8-I-C same-root standalone-supervisor fixture entrypoint
- **q12**: GREEN — generalized Option A recover head-dispatch (R8-I-B)
- **q12**: Journal the post-activate barrier.cleanup segment, run the real barrier child (R8-I-A)
- **q12**: GREEN — pre-flight post-activate wiring gate at the top of live/recover (R5-F fix)
- **q12**: GREEN — recover mid-barrier refusal names the supervisor operation (R5-D2)
- **q12**: GREEN — wire operator-reachable live/recover CLI + production fail-closed post-activate gate (R5-F)
- **q12**: GREEN — run_recover resumes a crashed forward cutover (R5-D)
- **q12**: GREEN — run_live orchestrates post-activate receipt-only cleanup + resume (R5-E)
- **q12**: GREEN — run_live writes the cutover-window marker (R5-C)
- **q12**: GREEN — run_live drives full forward window (deploy.commit + activate)
- **q12**: GREEN R5 Sub-round A forward final-writer manifest (FWM)
- **q12**: GREEN R4 Sub-round B real deployed wrapper barrier claims
- **q12**: GREEN R4 Sub-round A injectable ordinary-execution seam
- **q12**: GREEN mode-aware quiesce cutover-window precondition (OQ1 W-amendment)
- **q12**: GREEN R3 resource-manifest 2-step binding via shared Engine primitives
- **q12**: GREEN R2 baseline.json producer + fail-closed client-override seam
- **q12**: GREEN R1 live-controller genesis via shared Engine primitives
- **q12**: GREEN allowlist a migration-modified pre-existing function
- **q12**: GREEN make catalog reg\*-name checks search_path-independent
- **q12**: GREEN lift the drill's read-only override before the migration phase
- **q12**: GREEN repair frontier assertion for MCP-generated history
- **q12**: GREEN delta-neutral extras in the completeness gate
- **q12**: GREEN dump-stable completeness identities
- **q12**: GREEN delta-composed live-hash prediction (§2 method correction)
- **q12**: GREEN preserve equality-diff payloads behind --keep-equality-diagnostics
- **q12**: GREEN structural equality-proof diff diagnostics
- **q12**: GREEN resolve drill/backup tsx via package shim, fail-closed preflight
- **q12**: GREEN drill failure diagnostics + scheduled-mode restore
- **q12**: GREEN drill generation preflight contract + run-dir cleanup
- **q12**: GREEN production seam lockdown + teardown/coordinator hardening
- **q12**: GREEN snapshot-coordinated generation for the drill plan restore
- **q12**: GREEN production drill-seam consumption for the live plan restore
- **q12**: GREEN §3 role bootstrap before the isolated restore + dump streaming
- **q12**: GREEN opt-in persist-and-handoff seam on restore-supabase-drill.sh
- **q12**: GREEN live plan restore/migrate orchestration
- **q12**: GREEN plan-mode expected-post-migration-catalog builder
- **q12**: Deliver Phase B GHCR publication + fix publisher live-run defects
- **q12**: Task 9 D6 real frame envelope + R-handshake join
- **q12**: Task 9 smoke/observation gate evaluator
- **q12**: D6 assembleInspect 3-point snapshot discipline (DF1)
- **q12**: D6 enforce seal-predecision binding in restart authority
- **q12**: D6 rewind validated secret descriptor before mapping
- **q12**: D6 production inspect entrypoint + raw-I/O assembly (F1)
- **q12**: D6 terminal seal predecision binding check
- **q12**: D6 revalidate secret identity after read
- **q12**: D6 canonical NFC normalization for cross-stream hash parity
- **q12**: D6 probe inspect main flow
- **q12**: D6 Root post-R closure + restart authority
- **q12**: D6 runtime FD baseline check
- **q12**: D6 Root predecision + terminal seal
- **q12**: D6 CLI argv/env/FD preflight
- **q12**: D6 Root pidfd + proc identity gates
- **q12**: D6 request schema + protocol state machine
- **q12**: D6 Root posix_spawn boundary + secret revalidation
- **q12**: D6 writer-ancestry + Docker observation
- **q12**: D6 evidence H/N validator
- **q12**: D6 database/host projection builders
- **q12**: D6 managed-provider/session projection
- **q12**: D6 common-lock proof harness
- **q12**: D6 read-only transaction and lock proof
- **q12**: D6 read-only capability projection
- **q12**: D6 immutable DB/TLS identity checks
- **q12**: D6 read-only SQL projection bundle
- **q12**: D6 canonical JSON + frame envelope + hashing
- **q12**: Ratify W-tuple field 11 managed-session inventory
- **q12**: Freeze the provisional managed-session inventory (W-tuple field 11)
- **q12**: Add PostgreSQL 17 digests to the document-evidence live gate
- **q12**: Wire file-only CLI flags into both migration entrypoints
- **q12**: Route Q12 migrations through file-only client with same-transaction guards
- **q12**: Add concurrent observability index packet preflight
- **q12**: Quiesce-aware blue/green handoff wrapper (H stream)
- **q12**: Add file-only migration credential contract module
- **q12**: Make the genesis-rooted joined prefix the sole resume acceptance
- **q12**: Extend the partial-capture lever window to k in 1..5
- **q12**: Add sanctioned partial-durable-capture rollback lever to joined composer
- **q12**: Joined install-recovery W positives via the D5 chains dimension
- **q12**: Joined rollback W positive (clean prefix 4) over the real Root prefix
- **q12**: Route joined W positives through the deployed wrapper
- **q12**: Joined forward W positive over the real Root prefix
- **q12**: Real resume-command suffix bindings and mode-bound FWM path
- **q12**: Joined rollback profiles with dual FWM and closure coverage
- **q12**: Joined forward composer and W-composition seam
- **q12**: Dual-path final-writer manifests with Root inventory
- **q12**: Serializer primitives for joined composition
- **q12**: Ordinary-row grammar and segment-aware bindings
- **q12**: Closed substitution domain with single authorities
- **q12**: Expand canonical command manifest to the frozen D5J twenty
- **q12**: Implement retained barrier provenance
- **q12**: Publish immutable database terminal proofs
- **q12**: Make writer quiesce recovery immutable
- **q12**: Validate durable resume capabilities
- **q12**: Harden writer recovery
- **q12**: Add atomic Supabase backup lifecycle
- **qdrant**: Add exact-sha operator publisher
- **ops**: Add fail-closed Supabase backup gate
- **qdrant**: Isolate source recovery runtime
- **qdrant**: Wire recovery-bound reindex adapters
- **evidence**: Preserve unrecoverable source outcomes
- **qdrant**: Bind reindex to audited source failures
- **qdrant**: Add audited source recovery workflow
- **qdrant**: Add crash-durable source recovery core
- **qdrant**: Support local staging snapshots
- **qdrant**: Package immutable operator runtime
- **migrations**: Add approved evidence runner
- **evidence**: Activate document evidence in dev
- **observability**: Add document evidence signals
- **evidence**: Gate live document evidence rollout
- **qdrant**: Add self-hosted observability
- **qdrant**: Automate snapshot recovery drills
- **qdrant**: Add secure self-hosted runtime services
- **stage6**: Retrieve evidence with accepted decisions
- **web**: Render document conflicts separately
- **stage5**: Enrich baseline with document evidence
- **stage4**: Resolve document conflicts explicitly
- **stage4**: Add complete document evidence preflight
- **evidence**: Add durable document evidence contracts
- **qdrant**: Add source-driven reindex workflow
- **qdrant**: Rank hybrid results with formula and grouping
- **qdrant**: Manage versioned collections through an alias
- **qdrant**: Define self-hosted collection contract
- **career-playbook**: Promote judge to v4-flash in llm_model_config, drop dev env override (mc2-m17al)
- **career-playbook**: Delta re-judge after batch regeneration (mc2-db696.104.3)
- **career-playbook**: Category-based judge severity rubric + regen gating (mc2-db696.104.1)
- **career-playbook**: Persist live-smoke artifacts for A/B comparability (mc2-db696.104.5)
- **career-playbook**: Skip redundant re-judge when regeneration pass made zero changes (mc2-db696.104.6)
- **career-playbook**: Route large-context judge calls fallback-first (mc2-db696.104.2)
- **career-playbook**: Batch regeneration, LLM call telemetry, env-gated judge A/B (mc2-b7zm3)
- **career-playbook**: Route on rendered prompt tokens + guard model context
- **career-playbook**: Compact quality-warnings summary with details modal
- **career-playbook**: Show role-guide image in inspector card, not as hero
- **career-playbook**: Add generated role guide images
- **course-gen**: Add structure quality guardrails
- **career-playbook**: Default bridge courses to auto size
- **career-playbook**: Create course from role guide
- **markdown**: Add fullscreen mermaid zoom viewer
- **career-playbook**: Highlight active contents section
- **career-playbook**: Improve e2e output quality
- **career-playbook**: Show honest generation progress
- **career-playbook**: Preserve source evidence context
- **web**: Unify career playbook input UX
- **career-playbook**: Limit pasted business notes
- **career-playbook**: Persist wizard progress and context notes
- **career-playbook**: Add canonical public urls
- Add career playbook visibility access
- **web**: Implement production document reader shell
- **career-playbook**: Refine reader mock
- **career-playbook**: Add reader variant mock
- **career-playbook**: Process business context sources
- Add business context intake for career playbooks
- **career-playbook**: Expand popular role suggestions
- **career-playbook**: Unify library catalog filters
- **career-playbook**: Resolve functional area smartly
- **web**: Add wikidata role suggestion source
- **web**: Add esco role suggestion subset
- **web**: Redesign home hero with product split
- **nav**: Add two-product course landing
- **career-playbook**: Inline all demo sections
- **career-playbook**: Strengthen landing hero proof
- **career-playbook**: Widen landing hero layout
- **career-playbook**: Add smooth landing motion
- **career-playbook**: Add personalized AI landing section
- **career-playbook**: Compact landing outline with full structure
- **career-playbook**: Show 26-block landing demo
- **career-playbook**: Apply document-first milk redesign
- **career-playbook**: Add constructor ui mock variants
- **career-playbook**: Redesign generation workbench
- **career-playbook**: Improve role source and custom answers
- **career-playbook**: Expand role suggestions
- **career-playbook**: Add role title suggestions
- **career-playbook**: Route complex phases to DeepSeek V4 Pro
- **career-playbook**: Add role description entry
- **career-playbook**: Add gated live smoke runner
- **career-playbook**: Add admin cost evidence
- **career-playbook**: Add smoke preflight harness
- Add career playbook course bridge
- **career-playbook**: Complete generation status transport
- **career-playbook**: Add PDF export
- **career-playbook**: Add library and public sharing
- **career-playbook**: Wire phase b transport
- **web**: Add career playbook landing
- **career-playbook**: Add viewer editor frontend
- **career-playbook**: Add phase b frontend followups
- **career-playbook**: Add phase a frontend wizard
- Complete career playbook backend phase 3
- **career-playbook**: Add backend generation stage
- **career-playbook**: Add phase 1 foundation
- Add 2 source file(s), update 1 source file(s), +1 more
- Add 2 source file(s), update docs
- **stage6**: Surface quality ladder review history
- **stage6**: Add quality recovery execution ladder
- **stage6**: Add quality ladder contract
- **orchestration**: Add local contract and dev delivery path
- **cli**: Add dev delivery command
- **jd**: Regenerate sales-manager-b2b v2 with 26 blocks + 3 Mermaid diagrams
- **skill**: Add job-description role guide generator (26 blocks)
- **course-gen-platform**: Add 1 source file(s), update 2 source file(s), +1 more
- **stage6**: Add centralized sanitizeContent at DB write layer
- **Skills**: Add code-review skill, remove old code-reviewer stubs
- **flashcards**: Redesign FlashcardViewer UI with fullscreen study mode
- **enrichments**: Refactor enrichment system with all 14 types, batch UI, and i18n
- **quiz**: Unhide quiz enrichment with multi-select, andragogy, and renamed to Квиз
- **Interface**: Update enrichments UI, course cards, header and viewer improvements
- **viewer**: Remove max-width constraints so lesson content fills available space
- **enrichments**: Hide audio, video, presentation, quiz from UI
- **enrichments**: Replace MindMapViewer with interactive markmap-view
- **enrichments**: Temporarily hide nlm_study_guide from UI
- **enrichments**: Hide regular audio/video from UI, keep NLM variants only
- **web**: Add unique placeholder images for 4 new NLM enrichment types
- **enrichments**: Add 4 new NotebookLM enrichment types
- **bridge**: Allow parallel audio + video generation per course
- **admin**: Add NotebookLM Bridge health check to admin dashboard
- **enrichments**: Fix audio/video playback + expose NLM format options
- **pipeline**: Add Redis read-side cache for Stage 3/4 file content
- **pipeline**: Add Redis cache-aside for file and lesson content
- Redesign enrichment cards with unified grid, single-click video, and compact audio overlay
- Telegram notifications, lesson materials switcher, and media player improvements
- Universalize Gastown commands and add /onboard
- **stage7**: Harden NLM pipeline with local media storage, async lifecycle, and recovery
- **stage7**: Harden NLM audio/video generation pipeline
- **enrichments**: Add nlm audio/video generation via notebooklm bridge
- **course-gen-platform**: Add notebooklm bridge FastAPI service
- **admin**: Add generation trace audit page
- Tester feedback fixes — CJK patching, header replacement, mermaid wrapping, sidebar descriptions
- **stage6**: Add truncation continuation path and reject telemetry
- **stage6**: Track actual model usage in traces and metadata
- **stage6**: Add cache_hit trace event and document edge cases
- **stage6**: Add tier1_pass trace event and max score logging
- **stage6**: Add Two-Tier RAG retrieval to eliminate 75% wasted queries
- **llm**: Gemini caching, config-seed auto-load, code review fixes
- **llm**: Replace all Gemini models with gemini-3-flash-preview
- **stage6**: Update CLEV judge and delta judge models
- **stage6**: Add spelling & typo detection to self-reviewer Phase 2.5
- Add 1 skill(s), update 5 agent(s), +2 more
- **stage4**: Migrate phases 1, 3, 4 to PromptService with typed contracts
- **prompts**: Add type-safe PromptVariableMap + contract validation tests
- **stages 4-5**: Add pedagogical guidance, optimize prompts, migrate to PromptService
- **stage6**: Coherence patcher rejection tests + mermaid pipeline admin monitoring
- **stage5**: Sequential section generation with digest accumulation
- **stage4**: Budget-aware Phase 3 truncation + system prompt reserve
- **stage4**: Wire Budget Allocator to phases + DB-driven model config
- **stage5**: Add overlap retry loop for cross-section deduplication
- **stage4**: Add semantic overlap detection to Phase 2 sections_breakdown
- **stage6**: Add course position awareness to lesson generation
- **stage6**: Persist lessonDigest and enrich summary_preview from DB
- **course-gen-platform**: Replace section-by-section with single-call lesson generation
- Phase 4 course_nodes flat relational migration with dual-write
- **web**: Add Stage 6 content generation CTA for newly added lessons
- Protect 23 LLM-facing z.enum() with createLLMEnumSchema helper
- **chat**: Phase 3 — context optimization with course skeleton
- **chat**: Phase 2 — surgical operations with stable IDs
- **chat**: Phase 1 — remove toggle, auto-intent classification
- **chat**: Phase 0 — stable IDs + chat model config foundation
- **web**: Add 3 source file(s), update 1 source file(s), +1 more
- **jina**: Replace in-process rate/concurrency limiters with Redis-based distributed versions
- Add CategoryBadge to ClarifyingPanel wizard + bulk error log cleanup
- **logs**: Add auto-resolve RPC for stale to_verify fingerprints
- Add Phase 0.5 unit tests + Admin Clarifying Q&A tab
- **stage4**: Pass course_description to Phase 1/2 + expand Phase 0.5 clarifying system
- **web**: Sync full_name to auth metadata on profile save
- **stage6**: Pass lessonSpec to LessonInspector Blueprint tab
- **pipeline**: Add unified course-level token tracking
- **Interface**: Add token aggregation to ModuleDashboard
- **error-handling**: Standardize wrapTRPCError with AppError/PipelineError support
- **shared-utils**: Create shared-utils package and migrate imports
- **web**: Migrate env.ts to @t3-oss/env-nextjs with Zod validation
- **course-gen-platform**: Add 1 source file(s), add 2 test(s), +1 more
- 3-tier model routing for Stage 5 based on section importance
- **web**: Audit remediation — bundle-analyzer, ESLint strictness, image optimization
- **i18n**: Extract hardcoded Russian strings to translation files (Sprint 2)
- **stage4**: Swap Phase 1 and Phase 0.5 for data-driven clarifying questions
- **web**: Show classification_rationale in Stage 3 & pedagogical_patterns in Stage 4
- **web**: Add 1 source file(s), update 12 source file(s), +1 more
- **web**: Add 4 source file(s), update 5 source file(s), +2 more
- **web**: Embed Userback feedback widget with SPA support and CSP
- **orchestrator**: Add BLOCK_REGENERATION job type and Sentry monitoring
- **lesson-editor**: Add inline markdown editor for lesson content
- **generation-graph**: Implement NodeDetailsDrawer action handlers
- **logger**: Add 2 new auto-mute rules for expected errors
- **chat**: Implement code review recommendations P1-2, P2-2, P3
- **chat**: Implement intent classification for chat optimization
- добавлено UI предупреждение о необходимости CORE документа
- Implement remaining code review recommendations
- Migrate user preferences to Supabase and add section-expander validation
- **useLessonActions**: Add i18n and loading states UI (P2 improvements)
- **ModuleDashboard**: Implement tRPC mutations for lesson actions
- Implement storage helper for EnrichmentCard audio playback
- **observability**: Add ConcurrencyLimiter metrics, tests, and enrichments health check
- **stage5**: Distinguish retryable vs non-retryable errors
- **web**: Complete code review improvements for course data updates
- **CI/CD**: Implement tiered testing strategy
- **admin**: Persist log filters in URL params
- **i18n**: Migrate CascadeStageDeleteModal to next-intl
- **Skills**: Add documentation check to /work skill
- **Skills**: Add /work skill for task management
- **clarifying**: Improve UX - move skip button to navigation, show continue only when complete
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
- **web**: Add clarifying questions info to StageResultsPreview
- **backend**: Add dev:worker:stage6 script for Stage 6 worker
- **stage4**: Add self-reflection auto-answer in automatic mode
- **stage4**: Phase 0.5 security and reliability improvements
- **stage4**: Implement Phase 0.5 Clarifying Questions
- **chat**: Require intent selection before send + Stage 6 inline editing
- **stage5**: Make tier1 and escalation models configurable via admin panel
- **i18n**: Add i18n support for quick action prompts in GlobalCourseChat
- **llm**: Upgrade stage_4_expert, stage_4_synthesis, stage_5_metadata to KIMI K2
- **routes**: Migrate course URLs to /courses/{org}/{course}
- **chat**: Replace keyword classification with explicit UI mode selection
- **chat**: Add authenticated Supabase client and rate limiting
- **chat**: Add conversation history to LLM prompts
- **form**: Add frontend validation limits for course creation
- **course-gen-platform**: Add 1 source file(s), update 3 source file(s), +1 more
- **types**: Add TypeScript types for GenerationProgress
- **stage3**: Auto-assign CORE priority for single document
- **web**: Add navigation to lessons page (Toolbar + Sidebar)
- **cover**: Switch to 21:9 cinematic aspect ratio for lesson covers
- **web**: Expand rotating status messages with type-specific content
- **web**: Smooth image loading with skeleton placeholders
- **enrichments**: Fix cover/banner generation UX - show variant selection at draft_ready
- **web**: Improve EnrichmentGeneratingCard with shimmer and rotating messages
- Add asymptotic crawl to useSmoothProgress hook
- Add Next.js rewrite for local enrichments proxy
- **storage**: Add unified storage service with auto-backend switching
- **scripts**: Enhance migration script with safety features
- **storage**: Migrate enrichment images from Supabase to local storage
- **logger**: Add type guards, discriminated unions, and usage guide
- **logger**: Add centralized domain-specific logging architecture
- **enrichment**: Add grayscale placeholder with hover color reveal
- **lessons**: Add progress card to lessons page header
- **#14**: Add parameter flow dashboard with real-time updates
- **lessons**: Add course lessons page with cards grid
- **#16**: Add course edit history for diff view
- **demo**: Add placeholder vs generated comparison page
- **logging**: Add parameter tracking and validation logging (#12, #13)
- **a11y**: Implement keyboard navigation for generation graph UI
- **Skills**: Add /process-issues skill for GitHub Issues workflow
- **types**: Add Zod validation for AnalysisResult type
- **enrichments**: Unify placeholder cards to Hover Reveal style
- **pipeline**: Pass user-edited params between stages
- **file-upload**: Implement tier-based file limits with upgrade suggestions
- **Interface**: Add glassmorphism for course cards with light/dark theme support
- **visuals**: Add lesson card (1:1) generation to Media section
- **courses**: Integrate course cover images into UI
- **redis**: Add graceful shutdown coordination with BullMQ workers
- **scripts**: Add full lesson A/B test with Mermaid generation
- **Database**: Add trigger to auto-reopen resolved errors on recurrence
- **scripts**: Add validation script for existing lesson content
- **scripts**: Improve A/B test script for lesson generation
- **stage6**: Comprehensive content quality validation
- **llm**: Add hardcoded fallback for Model Config Service
- **logger**: Add auto-mute rules for deploy-related errors
- **web**: Persist all form settings to localStorage
- **web**: Replace upload progress bar with fullscreen overlay modal
- **web**: Add file upload progress bar on course creation
- **web**: Add 5 source file(s), update 8 source file(s), +1 more
- **create-course**: Reorganize UI/UX for course creation form
- **i18n**: Add image generation translations for enrichments
- **image-gen**: Add quality parameter for GPT-5 Image Mini cost optimization
- **stage6**: Add person and case agreement grammar rules for Russian
- **stage6**: Route auto-approval jobs to dedicated queue
- **stage6**: Activate dedicated queue with 30 concurrent workers
- **course-gen-platform**: Add 1 source file(s), update docs
- **stage5**: Dynamic min/max lessons validation from course_size presets
- **course-gen-platform**: Add 1 source file(s), update 2 source file(s)
- **course-gen-platform**: Add 1 source file(s), update 8 source file(s), +3 more
- **stage5**: Remove redundant fields to save ~10K-15K tokens per course
- **stage5**: Add auto-approval support for automatic generation mode
- **course-gen**: Add E2E test for automatic mode express generation
- **auto-approval**: Add case 6 for Stage 6 lesson content generation
- **processor**: Add bundle monitoring, health check, and docs
- **logger**: Add auto-mute rules for job lifecycle warnings
- Add 1 agent(s)
- **GenerationProgress**: Auto-start generation in automatic mode
- **generation**: Merge automatic and semi-automatic control panels into unified MissionControlBanner
- **course-viewer**: Add deep-linking, breadcrumbs, and server progress sync
- **orchestrator**: Add processor health check, TTL timeout, and Stage 6 JobResult wrapper
- **course-gen-platform**: Add 1 source file(s), update 1 source file(s)
- **Interface**: Add missing user settings to Stage 1 Input Tab
- **export**: Implement module lessons export as Markdown
- **Database**: Add trigger to auto-sync fingerprint in log_issue_status
- **logging**: Add auto_muted status for expected errors
- **lesson-approval**: Add migration and tests for batch approval RPC
- **stage4**: Add course_description and learning_outcomes to analysis input
- **admin**: Add error log grouping by fingerprint
- **generation**: добавить difficulty в Stage 5 FrontendParameters
- **enrichments**: Add optimistic UI + improve error messages
- **pipeline**: Add language support to Stage 4-5 model selection
- **logs**: Add full-text search for similar problems v1.5.0
- **Skills**: Add process-logs skill for automated error log processing
- **logging**: Enhance error logging with full diagnostic context
- **admin-logs**: Show course name and workflow link in logs table
- **course-size**: Add 'micro' size option and show lesson ranges
- **logging**: Add generationCode to worker logs
- **styles**: Add 7 new course styles
- **monitoring**: Add Telegram bot health check to admin dashboard
- **telegram**: Add webhook handler for bot commands
- **profile**: Add Telegram notification settings section
- **shared-types**: Add i18n UI labels for CourseSizeSelector
- **web**: Add form validation for courseSize/estimatedLessons dependency
- **course-size**: Add 'auto' option as default selection
- **course-size**: Add course size presets (mini/compact/standard/comprehensive)
- **course-gen-platform**: Add 2 source file(s), update 7 source file(s), +1 more
- **graph**: Add readOnly prop for automatic generation mode

### 🔧 Improvements

- Add lightweight throughput guidance
- Add token-efficient orchestration defaults
- **backup**: Hash rows, then sort the digests, instead of sorting the rows (mc2-0rj7i)
- **build**: Minify sandboxed processor bundle under 2.5MB CI gate (mc2-smsjx)
- **model-config**: Cache-first tier resolution for token-aware phase routing
- **Database**: Database health cleanup — reduce size 391→153 MB and optimize egress
- Add Redis LLM cache, optimize API queries, parallelize retry
- Expand optimizePackageImports with all Radix UI + framer-motion
- **export-lessons**: Optimize DB query with lessons_with_latest_content view
- **admin**: Optimize get_grouped_error_logs RPC statement timeout
- Fix CPU/memory issues in course generation page
- **template-whitelist**: Optimize Helm function matching with Set lookup
- **course-viewer**: Open course in new tab for instant navigation
- **stage4**: Parallelize Phase 3 and Phase 6 execution
- **career-playbook**: Split the live-smoke fixtures at the lint budget
- **career-playbook**: The ramp owner is read off the document, and the scope is a measurement
- **prompts**: Split the career playbook prompt file at the lint budget
- **prompts**: Split block regenerator prompt
- **cost**: The catalogue holds what can be called, not what once was
- **cost**: Drop thirteen catalogue entries nothing was ever charged for
- **prompts**: Five Stage 6 prompts nothing has rendered since the rewrite
- **models**: One table decides which model a phase gets
- **llm**: A price table nothing read, next to a registry routing uses
- **stage4**: The last two warnings, and the guard lesson they taught
- **stage4**: The document-evidence phase is a pipeline, not a helper
- **stage4**: Conflict detection had three subjects in one file
- **stage4**: The evidence preflight becomes its sequence
- **stage6**: The judge's trace row, and one refinement task loop instead of two
- **stage1,routers**: Name the steps, and say what each failure means
- **stage7,stage5**: A card prompt, and three scores that were one function
- **stage7**: One poll scheduler, one image-format reader
- **career-playbook,stage4**: Split two files by subject, and unblind a guard
- **stage6**: Break up the job processor — complexity 97 and 55, both gone
- **stage6**: The two RAG tiers were running two copies of the same loop
- **stage6**: Separate "is this lesson saved" from "is this course finished"
- **stage6**: ExecuteStage6 was forty null-defaults wearing a function
- **stage6**: Split the mermaid fix pipeline into its stages
- **stage6,intent**: A copy table and an extracted duplicate, -2 complexity warnings
- **lint**: Re-derive the length and complexity thresholds from this repository
- **llm**: Keep the lint warning budget while adding provider routing
- **stage2**: Take the course before the model in the title call
- **llm**: Drop the stage-level config layer, which had nothing to read
- **llm**: Move the cost callback out of langchain-models
- **llm**: Give models and prices one source instead of four
- **stage5**: Centralize structural quality state
- **q12**: Extract drive_forward_tail + stop_after seam (behavior-preserving)
- **q12**: R2 drives the manifest tool via the real host client (Option B)
- **q12**: Thread per-fixture runId/runRoot through composeWriterFixture
- **career-playbook**: Extract canonical-topic and deterministic-check modules to restore lint budget
- **career-playbook**: Single source of truth for fillable-placeholder predicates
- **career-playbook**: Reuse shared model/token helpers + add pricing health check
- **migrations**: Tail-drift watermark logic for drift gate
- **stage6**: Split single-call generator helpers
- **stage6**: Unify all lesson enqueue paths through canonical helper
- **shared-types**: Extract CONCLUSION_HEADINGS to shared constant, remove legacy code
- **course-gen-platform**: Split 4 files >800 lines into extracted modules (Batch 1)
- **course-gen-platform**: Split large files to reduce max-lines warnings
- **course-gen-platform**: Split notebooklm-bridge-client.ts to fix max-lines
- **course-gen-platform**: Split model-config-bunker.ts to fix max-lines
- **course-gen-platform**: Split phase-0.5-clarifying.ts to fix max-lines
- **course-gen-platform**: Split generation-phases.ts to fix max-lines
- **course-gen-platform**: Split stage6-prompts.ts into individual files
- Replace console logs with structured logger in web and shared-utils
- **course-gen-platform**: Replace console logs with structured logger
- **stage6**: Replace LO-code IDs with numbered format in prompts
- Extract shared utils/logger, enrichment card overlay UX
- **Skills**: Remove code-review-inline orchestrator
- **enrichments**: Extract buildStandardSources helper and add flashcards strict schema
- Migrate 48 router files to shared throwOnSupabaseError utility
- **stage6**: Consolidate helpers, extract FSM transition, batch section queries
- **stage6**: Code review improvements — DRY, logging, readability
- **stage5**: Extract shared buildFallbackSearchQueries + add Stage 5→6 integration test
- **stage4**: Remove dead logDuplicateKeyTopics function
- **web**: Extract shared toActionError, replace Russian strings, use client-logger
- **web**: Remove 25 as-any casts from tRPC-migrated server actions
- Code review tech debt — DRY model constants, ModelConfigService migration, startup validation
- Split 5 largest files into modular structure
- Split prompt-registry.ts into per-stage modules
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
- Remove dead complexity/criticality scoring from Stage 5
- Extract regex to PATTERNS constant, add SSOT JSDoc, fix lastIndex bug
- Migrate tRPC architecture to @trpc/react-query with typesafe hooks
- Remove Bloom's Taxonomy dead code, replace with prompt guidance
- Remove pedagogical_patterns field entirely
- **stage4**: Remove dead expansion_areas from Phase 3
- **stage5**: Remove dead practical_exercises and assessment_strategy fields
- **stage4**: Move Visual Style to accordion, remove deprecated Document Relations
- **pipeline**: Remove dead content_strategy field from analysis_result
- **chat**: Extract getUpdatedFieldsForProposal helper function
- **stage4**: Move suggested_answers normalization to Zod z.preprocess()
- **chat**: Use PAUSABLE_STATUSES for generation blocking
- **web**: Standardize logging and add structure change detection (L2, M3)
- **clarifying**: Simplify to 1 round, increase max questions to 14
- **prompts**: Soften cliché prevention approach
- **clarifying**: Code review LOW priority improvements
- **clarifying**: Simplify QuestionCard styles for minimalist design
- **stage5,stage6**: Use unified safeJSONParse for LLM output
- **web**: P3.3 migrate i18n from GRAPH_TRANSLATIONS to next-intl
- **hooks**: Extract useFieldStatusTracking and useCascadeStageDelete
- **chat**: Code review improvements - type guards, constants, utilities, a11y
- **chat**: Configurable fallback model and extract magic numbers
- **locks**: Extract lock pattern to shared utility
- **cover**: Remove two-stage dead code from CoverPreview
- **enrichments**: Simplify cover/banner to single-stage generation
- Improve enrichment handlers and add nginx rate limiting
- **validation**: Improve logging and type safety in validation-orchestrator
- **enrichment**: Unify all 6 cards into single grid section
- **enrichment**: Split UnifiedEnrichmentCard into subcomponents
- **enrichment**: P3 improvements - extract LabelWithTooltip, use type guards
- **stage4**: Remove Phase 6 RAG Planning
- **web**: Unify toast notifications to use Sonner
- **create-course**: Reorganize form with GenerationSettingsSection
- **stage4**: Remove conflicting pedagogical_strategy fields
- **stage4-5**: Eliminate over-engineering and fix bugs
- **Interface**: DRY Stage2Group with utility functions + accessibility
- Code quality improvements from review (P2.4, P3.2-P3.6)
- **logging**: Address code review findings for auto_muted
- **stage4**: Remove unused answers field
- **target_audience**: Unify data source to courses.target_audience column
- **llm**: Add actualLanguage tracking, LanguageCode type, language detection
- **stage6**: Modularize lesson-rag-retriever.ts
- **stage6**: Modularize orchestrator.ts into nodes and helpers
- **Interface**: Move generation mode to advanced settings section
- **stage6**: Address code review findings for style propagation
- **styles**: Reduce course styles from 19 to 12
- **profile**: Simplify Telegram connection with Login Widget

### 🔒 Security

- Aidevteam server audit — cryptominer killed, ports fixed
- Server hardening — SSH, Bull Board, nginx, kernel update
- Add authentication to Telegram webhook endpoint (mc2-gqfj)
- Remove unused debug and test endpoints
- Fix critical vulnerabilities in local-storage-service

### 🐛 Bug Fixes

- **release**: A five-month gap breaks the tag, and fills the changelog with delivery noise
- **stage6**: Forbid the serial generator from retelling its previous context
- **stage6**: Drop the heading a truncation continuation repeats at the seam
- **stage6**: Two headers of one numbered series are siblings, not duplicates
- **deploy**: Compose never reads env_file, so every call needs --env-file
- **CI/CD**: A secret that never existed wrote an empty value over a good one
- **career-playbook**: A shape two paragraphs share on purpose is not a repeat
- **career-playbook**: The leak detector learns the mood it did not know
- **career-playbook**: A red flag may say how long a symptom has to last
- **career-playbook**: The proofreader is handed the sections it kept miscounting
- **career-playbook**: The proofreader's findings reach the row it was paid for
- **career-playbook**: Block 23 reports a training record, it does not set a policy
- **career-playbook**: The digest hands the model facts, not writing rules
- **q12**: Re-pin the migration manifest for the proofreader routing change
- **llm**: The endpoint pin now knows what the call is asking for
- **career-playbook**: The proofreader asks for its verdict, and a metric reads its own number
- **career-playbook**: The checks read a Russian guide, and the ramp block is readable in the form it is written
- **career-playbook**: The FAQ points at a block without narrating that it is pointing
- **career-playbook**: The ramp finding names no owner block, because the derivation elected the wrong one
- **career-playbook**: The route into the regenerator sees the reserve, and the FAQ stops publishing the ramp
- **career-playbook**: The research the run retrieved reaches the ledger, and a full stop separates
- **career-playbook**: A named research house needs a source, and the FAQ stops copying the ramp
- **career-playbook**: The live smoke opens the page instead of asking a query
- **markdown**: Keep the eslint directive above the any it suppresses
- **markdown**: A red band is a ceiling, and MDX read it as a tag
- **career-playbook**: Two checks blamed a block for writing what the ledger says
- **career-playbook**: The judge stops overruling checks that own the question
- **career-playbook**: The publish checklist now names the numbers it never could
- **career-playbook**: Two contract checks billed a regeneration for a correct sentence
- **career-playbook**: A bracket in reader-facing prose is a placeholder unless it is markdown
- **career-playbook**: The calibration table wrote the unfollowable pointers itself
- **career-playbook**: The cost ledger records which tier served the call
- **career-playbook**: The judge may not call the contract's own marker a placeholder
- **career-playbook**: The guide's consensus decides a rhythm, not whoever spoke first
- **career-playbook**: The cadence ledger degrades, it never aborts a spec
- **career-playbook**: Give rhythms an owner, so a disagreement can be repaired
- **career-playbook**: Report the repetition, keep the document and the bill
- **career-playbook**: Carry one line across, written for this block's readers
- **career-playbook**: A block may only point at a block its reader was given
- **career-playbook**: Make the digest collect what it claims to collect
- **career-playbook**: Spend the prior-blocks ceiling once per group, not once per target
- **jina**: Cap the 429 wait per call instead of per batch
- **career-playbook**: Let the acceptance measurer read production, not a copy
- **career-playbook**: Rewrite do_not_repeat directive as an ownership map
- **career-playbook**: Stop scoping contradiction guards by audience
- **career-playbook**: Teach the cross-block judge about audiences
- **career-playbook**: Ask the executor whether the semantic gate can still be fixed
- **role-guide**: Fail closed on final repetition
- **career-playbook**: Copy viewer audience metadata
- **career-playbook**: Preserve audience scope in regeneration
- **career-playbook**: Close repetition gate gaps
- **career-playbook**: Separate baseline and evaluation cohorts
- **career-playbook**: Checkpoint semantic baseline run
- **cost**: The price sync also needs the workspace packages built
- **cost**: The nightly price sync had never delivered a rate
- **CI/CD**: Read the metrics group from the host, not from a secret that isn't there
- **ops**: Mounting the metrics directory is not the same as being able to write it
- **stage6**: A gate the whole output fails is not selecting anything
- **CI/CD**: The dev deploy did not write the variable its compose file demands
- **ops**: An alert that aggregates bare cannot say where it came from
- **llm**: The configured timeout reached nothing, and was too short anyway
- **CI/CD**: The seed drift check excluded the phase it should compare
- **models**: The phase enum named three phases twice
- **models**: The phase-name list disagreed with itself in both directions
- **llm**: Prose no longer falls back to the model it was taken from
- **cost**: The drift gate could not check the model I had just added to it
- **images**: The banner ignored its own routing row, and never asked for flex
- **llm**: An escalation that went down instead of up, for English only
- **llm**: The display name beside the model id still said Luna
- **ops**: The Q12 asset manifest still pinned the old bridge healthcheck
- **llm**: Stage 6 goes back to luna; the live run measured a stale container
- **llm**: The probe cited a bead id that does not exist
- **ops**: The bridge healthcheck never asked the bridge anything
- **stage4**: A bound that vetoes our own arithmetic
- **cost**: What the wider gate found on its first run
- **cost**: The drift gate now asks the code what it can route to
- **cost**: An unpriced model is not a free one
- **stage4**: The sentence that killed the course was ours, not the model's
- **cost**: The callback already held the key, so it collects the charge
- **cost**: The guard already had the body open, so it keeps the charge
- **cost**: OpenRouter already said what the call cost, so record that
- **cost**: Estimate from the endpoint that will bill it, not the mainstream rate
- **pricing**: Two catalogue rates had drifted, and max_price now bites
- **llm**: Batch was priced against a call we stopped making
- **stage4**: The prompt told the model those fields were "unknown"
- **scripts**: The dev-run reporter asked courses for a column it does not have
- **llm**: Provider routing never left the envelope it was posted in
- **notebooklm**: Gpsoauth would have left by the wrong door — add PySocks
- **notebooklm**: The image cannot re-mint its own cookies — add the [headless] extra
- **CI/CD**: Name the branch that moves `:latest`, and run the pre-commit suite
- **q12**: The manifest generator printed like a deletion, and the dead venv is gone
- **shared-types**: Restore generation-metadata.ts, which the previous commit overwrote
- **lint**: Close the ten type-safety warnings, and make the count a ceiling
- **precommit**: Lint each staged file with the config its package actually uses
- **web**: The test suite could not parse JSX, so half of it never ran
- **notebooklm**: The bridge could not save a refreshed cookie, and its alarm measured the wrong one
- **stage4**: The evidence fallback was given fewer tokens than its answer needs
- **CI/CD**: A deploy that goes quiet for five minutes must not lose its session
- **qdrant-offhost**: Retention is one number, and the two copies of it disagreed
- **docling**: One version in four files, and now something checks it
- **prompts**: Put the seven stale rows back in line, and judge braces by the template
- **courses**: The delete that never cleaned up, and two copies of the one that did
- **cost**: Reconcile against our own generation ids, and a wait Node was free to abandon
- **logs**: Three warnings, and the nine-month-old prompt row one of them named
- **routing**: The playbook's prose groups go to Luna, on a measurement
- **logs**: Two warnings that fired when nothing was wrong, and the playbook A/B
- **career-playbook**: Make the catalog card a link, and stop the E2E setup lying
- **routing**: The last-resort path named models the team had stopped choosing
- **guards**: Three mechanisms existed and nothing ran them
- **routing**: A row carries the model twice, and the second copy stayed on DeepSeek
- **routing**: The lesson body goes back to Luna, and the model id stops being retyped
- **judge**: Counting words by whitespace is not language-agnostic
- **prompts**: A refined constraint the model cannot see is one it cannot meet
- **stage4**: Enum values are identifiers, and the prompt now says so
- **stage4**: The same Latin-calibrated minimums, one stage earlier
- **stage5**: A Chinese course could not pass validation at all
- **stage7**: The two image rows in llm_model_config are now actually read
- **i18n**: Two ways a non-ru/en course was checked and budgeted wrong
- **llm**: A 200 with no completion now says so instead of tripping the parser
- **stage6**: The automatic path named a document that does not exist
- **stage6**: The one empty-RAG path that said nothing now says what happened
- **nlm-bridge**: A name is not a route, and a floor is not a version
- **stage6**: A null the model wrote for "nothing here" cost the whole review
- **images**: The cost-exempt mark has to sit next to the call it exempts
- **llm**: The reasoning floor moves to the transport, where a clone cannot drop it
- **cost**: A stage summary stops carrying a price, and the playbook stops forgetting what it spent first
- **routing**: Name the endpoint before the call, because a hung one never names itself
- **cost**: Two Stage 5 transports join the instrumented one, and a failed picture leaves a row
- **cost**: The receipt was dropped by a clone, and Stage 4 rejected its own output
- **cost**: The settled-price counter was reading a column nothing writes
- **cost**: The last invented price, and the alias that moved on its own
- **llm**: Wait for the generation record instead of guessing when it lands
- **llm**: Price calls from the provider and route around whoever failed them
- **ops**: Run the disk metrics publisher through bash, not directly
- **migrations**: Make the drift gate see the whole history, and the storage quota move
- **cost**: Let the restart, the ledger and the zeros tell the truth
- **cost**: Give editing a stage the database will actually accept
- **cost**: Record a call that was paid for and produced nothing
- **cost**: Price the model the provider served, not only the one asked for
- **cost**: Hand self-review the course it is reviewing
- **stage6**: Make the progress validator say which field it rejected
- **cost**: Close the remaining unpriced calls, and post a guard
- **quiz**: Let a model say "no time limit" the way JSON says it
- **cost**: Put the price of a generated picture where the total can see it
- **cost**: Charge lesson review to the lesson it reviewed
- **cost**: Make writing a lesson pay for itself
- **stage7**: Charge enrichment calls to the course that ordered them
- **llm**: Fix every request refused for mandatory reasoning, not just the first
- **stage6**: Stop telling the judge a lesson has no examples
- **logging**: Stop dev logs from calling themselves production
- **llm**: Learn from a model that refuses to stop thinking
- **stage6**: Say which field made a judge answer unreadable
- **observability**: Repeat what the database said, and name the unit a reduction lost
- **cost**: Count what Stage 6 and Stage 7 spend against the course
- **stage4**: Spend the retry budget on a mapping that drops a claim
- **orchestration**: Let go of the course before handing it to the next stage
- **stage5**: Judge a structure against the profile it was built to
- **stage5**: Stop sending ten kilobytes of JSON through a URL
- **stage4**: Let automatic mode answer its own questions, and bill in the units the column stores
- **llm**: Ask for the least reasoning where none is refused
- **stage4**: Stop conflict detection failing over a wrapper, and say why when it does
- **stage4**: Read a score the model wrote as text
- **stage4**: Keep the coercion inside the lint budget
- **stage4**: Stop a course failing over the shape of a word list
- **cost**: Bill a batch lesson's corrective retry at the price it ran at
- **test**: Give the real-controller suites the budget their work needs
- **cost**: Split a batch price by what each lesson is worth
- **cost**: Price glm-5.2 from the catalogue, not from one provider
- **test**: Synchronize the Q12 lock contender
- **cost**: Refresh OpenRouter model pricing
- **test**: Keep WSL unit temps on the Linux filesystem
- **cost**: Correct the glm-5.2 price, which the judges bill against
- **llm**: Give a call the time the model actually takes
- **cost**: Record what a failed stage spent, not only a successful one
- **llm**: Say "no reasoning" instead of saying nothing
- **cost**: Import the shared logger the way its other importers do
- **stage4**: Stop a retry from stranding the answer the user already gave
- **evidence**: Let a course with document evidence be deleted at all
- **deps**: Move the nanoid override off the version the advisory names
- **pipeline**: Bound an LLM call, stop double-chunking, delete uploads on cleanup
- **llm**: Carry the phase config to the request, not just the model id
- **rag**: Stop discarding fields by destructuring
- **rag**: Expand after reranking, and cover the path that was missed
- **llm**: Send one reasoning control, not both
- **rag**: Key the search cache on expansion and its budget
- **chunking**: Make the chunker split where it always claimed to
- **rag**: Make retrieval actually retrieve
- **ops**: Scope the seed drift gate to global routing
- **llm**: Make the routing uniqueness guard survive a NULL judge_role
- **smoke**: Make an unreadable status stop killing a paid generation
- **routing**: Stop Stage 2 routing on a frozen file, and let the seed refresh
- **career-playbook**: Apply the routing migrations and make the drift gate see
- **career-playbook**: Stop the new checks from reporting correct text
- **career-playbook**: Make the metric-conflict check pay for itself
- **career-playbook**: Render status glyphs and stop two false-positive findings
- **career-playbook**: Stop a malformed metric ledger from aborting generation
- **tooling**: Preserve pnpm 10 Docker deploy behavior
- **deps**: Remove Redis build deprecation
- **tooling**: Harden local quality gates
- **deps**: Remediate dependency audit findings
- **i18n**: Localize the signed-out header action
- **test**: Use safe linux temp for backend tests
- **stage2**: Isolate reindex course progress
- **stage6**: Count budget-skipped capped tasks
- **stage6**: Preserve multilingual model routing
- **career-playbook**: Preserve source title language
- **web**: Generate valid development CSP origins
- **orchestration**: Preserve unsafe cleanup worktrees
- **runtime**: Align compiled api start with tsx
- **build**: Force complete declaration rebuild
- **deploy**: Refresh Q12 asset manifest
- **CI/CD**: Gate required colour environment variables
- **CI/CD**: Limit deploy package permissions
- **deploy**: Isolate ephemeral GHCR credentials
- **deploy**: Serialize host operations
- **tests**: Make backend bootstrap failures nonzero
- **stage6**: Detect localized intro teasers
- **web**: Stop Lesson Inspector loading without session
- **stage6**: Make empty-section guard reachable
- **web**: Type document failure copy keys
- **web**: Explain document processing failures
- **career-playbook**: Stop claiming unsaved block edits
- **ops**: Regenerate the deployed-asset manifest for the Serve bump
- **docling**: The chunking profile never recorded a Serve version
- **deploy**: The rollback's own health check could never pass
- **ops**: Regenerate the deployed-asset manifest for the rollback fix
- **deploy**: Ship the Docling rollback override to the host
- **docling**: Make the rollback real and the OCR gate able to fail
- **docling**: Act on four independent reviews of Stages C-E
- **upload**: Stop the new extension gate refusing files that always worked
- **deploy**: Let a SECOND Docling image change through the rollout gate
- **deploy**: Stop the deploy depending on who holds the master branch
- **deploy**: Let the Docling rollout gate survive its own success
- **ops**: Regenerate the deployed-asset manifest for the compose change
- **docling**: Ship the model set the production host can actually hold
- **embeddings**: Stop treating a provider rate limit as a lost document
- **docling**: Count facts, not chunks, and measure the call production makes
- **embeddings**: Make the cache key mean what the vector is
- **docling**: Correct Recall@K, widen the regression gate, withdraw the candidate
- **CI/CD**: Isolate Docling MCP 3 package
- **CI/CD**: Normalize Docling image repository
- **backup**: Give the manifest room to finish, sized from measurement (mc2-0rj7i)
- **backup**: Repair three defects the mc2-0tcyw fix introduced
- **CI/CD**: Point backup-schedule drift at the installer that proves the schedule
- **q12**: Re-pin the deployed-asset manifest, and stop CI being blind to the diagnostic
- **backup**: Say why the manifest query failed, and retry a transient instead of paging
- **stage2**: Say what the file actually is, not what I first assumed
- **CI/CD**: Move the drift check out of deploy, which was rolling production back
- **ops**: Hold the pinned operator image, and move retention out of dead flags
- **stage2**: Refuse a conversion that succeeded and returned nothing
- **CI/CD**: Ship deploy/postgres, whose scripts an enabled production timer runs
- **qdrant**: Enqueue the repair under the course owner, not a placeholder
- **CI/CD**: Let the monitoring drift gate report without blocking the rollout
- **tests**: Bound the 1,000-source resume case by its real cost, not the default
- **ops**: Raise an alert when the nightly Supabase backup stops happening
- **CI/CD**: Measure the deployed monitoring config instead of asserting it
- **qdrant**: Make the reindex CLI exit, so --rm can reclaim its container
- **qdrant**: Paginate course duplication instead of asking for 10000 points
- **stage2**: Give DOCX the fallback extractor PDF already had
- **qdrant**: Let the snapshot units own their state directory, not systemd
- **qdrant**: Hand staged operator secrets over last, and take the directory back
- **qdrant**: Stage operator secrets before handing the directory to the tool UID
- **qdrant**: Stop counting a returned job as an indexed document
- **ops**: Keep the snapshot alert note inside the E7 privacy contract
- **qdrant**: Name every absent target course directory instead of one bare ENOENT
- **qdrant**: Make recovery-bound reindex verify able to run at all
- **alerts**: Stop QdrantSnapshotStale claiming an off-host guarantee it never measured
- **qdrant**: Let the operator services reach what their own commands need
- **qdrant**: Give the recovery manifest one mode both sides agree on
- **qdrant**: Make the ordinary source-recovery route reachable
- **qdrant**: Carry a scrubbed reason on REINDEX_ERROR instead of a bare code
- **CI/CD**: Make the secrets directory traversable, not just root-readable
- **deploy**: Pin the worker compose to the megacampus project, not the colour one
- **CI/CD**: Derive QDRANT_METRICS_GID from the host instead of an unset secret (mc2-c2p8z)
- **deploy**: Create the NotebookLM secrets directory with the privilege that owns it
- **CI/CD**: Unbreak the ordinary production deploy's file copy (mc2-o0g75)
- **q12**: Skip the guard event trigger on restore so C4 can replay a guarded dump (mc2-wl5vn)
- **q12**: Clear the C4 read-only ALTER DATABASE, and carry the restore's reason (mc2-rjy9k)
- **q12**: Give the restore drill a HOME its docker CLI can stat (mc2-1cxna)
- **q12**: Materialize the source-manifest generator's q12 inputs (mc2-1cxna)
- **q12**: Give the backup's libpq children a HOME they can stat (mc2-1cxna)
- **q12**: Fail the backup steps WITH their captured diagnostics (mc2-1cxna)
- **q12**: Select C2 writers by compose service, not by whole project (mc2-1kcbv)
- **q12**: Make the C2 controller/child contract real on both sides (mc2-awi6q)
- **q12**: Take deployed-asset identity from the consuming script, not the git bit (mc2-lzft4)
- **q12**: Thread the staged callbacks on the recover re-drive path too (mc2-1sns3)
- **q12**: Close the three B3 scan gaps and prove the pooler resets session state (mc2-38ivn)
- **q12**: Every barrier session states its application_name (mc2-38ivn)
- **q12**: Resolve the asset manifest without assuming a repo-shaped parent path (mc2-ot8se)
- **q12**: Disarm guard triggers by CASCADE and stop trusting pooled startup options (mc2-ipwyc)
- **q12**: Open the window snapshot coordinator at pg.backup, not across barrier.install (mc2-6fnrt)
- **q12**: Capture the structural catalog in the barrier's search_path (mc2-2rzf6)
- **q12**: Unguard cron.job so C1 can pass on managed Supabase (mc2-34eua)
- **qdrant**: Pause and restore cron through pg_cron's own API
- **backup**: Accept a bare DSN so the frozen Q12 commands stop contradicting
- **qdrant**: Run the frozen barrier cleanup child from production
- **tests**: Pin the privileged-launch sudo probe deterministically
- **qdrant**: Publish the DB-barrier child input checkpoint from the controller
- **qdrant**: Report why a frozen child failed instead of a bare status (mc2-94mmf)
- **qdrant**: Repair the frozen HOME=/root at the wrapper seam (mc2-wwc9l)
- **career-playbook**: Render course brief markdown preview (mc2-sjpbx)
- **generation**: Open current stage preview (mc2-v31gc)
- **qdrant**: Let the Q12 window publish its own writer-quiesce manifest (mc2-y02tz)
- **qdrant**: Align the D4 oracle and the read seam with the catalog acceptance authority
- **qdrant**: Accept legacy non-sha256 catalog hashes as disposition predicates (mc2 Q12)
- **q12**: Pin emit tsconfig chain — cwd-independent module resolution for the acceptance emit
- **q12**: Root-safe acceptance publish — close review P1 TOCTOU + P2/P3 (emit wiring)
- **deploy**: Run qdrant:verify via tsx, not node (ESM resolution) (mc2-smsjx)
- **deploy**: Dev secret reads via sudo + wire source-recovery env into .env.production (mc2-smsjx)
- **lint**: Clear clarifying router errors + type-safety/escape warnings (mc2-smsjx)
- **q12**: Wire --recovery-run-id + source secret paths into production live/recover CLI (mc2-pj5f0)
- **q12**: W2/W3 correctness-review corrections (P1 + P2 wave)
- **q12**: Chown the intermediate trust chain for the trust-bridge probe (#22 cont.)
- **q12**: Rehearsal_make_trust_root chowns the trust root to uid-1000 (found-defect #22)
- **q12**: Make R8 rehearsal driver server-self-contained (found-defect #20)
- **qdrant**: Rehearsal ns-launch shift 3->2 (P1: run_live entrypoint dropped)
- **q12**: Write_install_baseline publish-or-strict-accept (found-defect #16)
- **q12**: Defrost #14 gate active_run OLD.\* reads behind table/op (GREEN)
- **q12**: Defrost #13 alias cron.job restore UPDATE (GREEN pending #14)
- **q12**: Make validateTransition baseline-vs-cutover order-symmetric (4 sites) + gate C acceptance
- **q12**: Normalize cron.job active in source-manifest relations row_sha256
- **q12**: Reconcile source-manifest q12_guard allowlist to the real barrier
- **q12**: Barrier catalog-fd consumption + PG-dialect precedence/scalar fixes
- **q12**: Exclude auto-generated array types from q12_guard ACL owner-only scans
- **env**: Numeric QDRANT_METRICS_GID example per Q9 observability contract
- **q12**: D6 session_activity coalesces provider nulls to sentinels
- **q12**: Keep D6 coordinator free of scheduling-primitive tokens
- **q12**: Create the backup lock during schedule installation
- **q12**: Drop the derived extensions digest with the actor-normalized section
- **q12**: Extend the platform-actor collapse to view-level schema owners
- **q12**: Replay database-post settings as the superuser
- **q12**: Close the remaining provider-plane restore equality gaps
- **q12**: Collapse platform-admin actors before restored-catalog comparison
- **q12**: Exclude vestigial owner-self default ACL rows from comparison
- **q12**: Make catalog capture deparse deterministic and upgrade-tolerant
- **q12**: Decode COPY text escapes in the drill's JSON query consumers
- **q12**: Match the real json array rendering in the isolated setting proof
- **q12**: Regenerate connection files after the restart reassigns the port
- **q12**: Run isolated ALTER SYSTEM overrides as the superuser
- **q12**: Issue isolated cluster overrides as separate statements
- **q12**: Exempt frozen pgTLE packages from the pre-restore availability gate
- **q12**: Omit the default tablespace clause from restore_test creation
- **q12**: Replay only the list-input search_path GUC verbatim
- **q12**: Replay role setconfig values verbatim
- **q12**: Replay superuser-granted memberships before dependent grantors
- **q12**: Run the drill role bootstrap as the image superuser
- **q12**: Allow the observed backslash-escaped postgres search_path setting
- **q12**: Permit allowlisted elevated attributes for image-missing roles
- **q12**: Align role allowlists with the observed managed Supabase role plane
- **q12**: Scope role bootstrap secret scan to the consumed role plane
- **q12**: Prove drill readiness on the published loopback port
- **q12**: Publish the drill loopback port from a masquerade-free network
- **q12**: Match the pg_dump mid-line control body rendering in the pgTLE scan
- **q12**: Accept the real pg_tle installed version chain
- **q12**: Scope broad secret-shape scan to the roles export
- **q12**: Materialize the adopted CA into the run directory for TLS consumers
- **q12**: Make source manifest capture work against the real Supabase PG17 catalog
- **q12**: Relax backup service ProtectHome to tmpfs for libpq client-cert default
- **q12**: Decompose backup service file into discrete libpq parameters
- **q12**: Close review P1/P2 in blue/green handoff wrapper
- **q12**: Project rollback held targets to the never-resumable intent
- **q12**: FWM targets take the opposite blue/green color in W topology order
- **q12**: Require Root checkpoint provenance for historical install chains
- **q12**: Harden durable recovery ancestry
- **q12**: Complete retained recovery hardening
- **q12**: Harden retained lifecycle recovery
- **q12**: Preserve reviewed provenance bytes
- **q12**: Accept exact retained recovery chains
- **q12**: Bind retained barrier history
- **q12**: Close barrier capability classifier
- **q12**: Accept linked recovery orphans
- **q12**: Close recovery proof gaps
- **q12**: Harden writer barrier recovery
- **q12**: Harden D4 writer recovery validation
- **q12**: Harden backup and restore trust boundaries
- **q12**: Harden backup recovery lifecycle
- **qdrant**: Make publisher cleanup signal-safe
- **qdrant**: Harden operator publication
- **ops**: Reject multiline PostgreSQL versions
- **ops**: Pin Supabase backups to PostgreSQL 17
- **ops**: Bind backup directory identity
- **ops**: Harden Supabase backup publication
- **qdrant**: Fsync reused recovery journal
- **qdrant**: Reconcile recovery crash residue
- **qdrant**: Close source recovery runtime review
- **qdrant**: Reject unrelated recovery ledgers
- **evidence**: Validate terminal answer values
- **evidence**: Allow terminal source decisions
- **evidence**: Materialize terminal source decisions
- **evidence**: Harden unrecoverable source handling
- **qdrant**: Close reindex correction gaps
- **qdrant**: Harden recovery-bound reindex resume
- **recovery**: Close workflow safety gaps
- **qdrant**: Verify recovery manifest identity
- **qdrant**: Bind source recovery audit state
- **qdrant**: Persist local snapshots across recreate
- **qdrant**: Use local staging snapshots
- **deploy**: Bind rollback to current release
- **qdrant**: Publish and pin operator releases
- **qdrant**: Close operator isolation gaps
- **migrations**: Complete evidence catalog gate
- **migrations**: Close evidence gate review gaps
- **deploy**: Close rollback hardening gaps
- **deploy**: Preserve coherent rollback snapshots
- **qdrant**: Install secrets for exact consumers
- **qdrant**: Deliver monitoring secrets fail closed
- **deploy**: Make staging rollback immutable
- **qdrant**: Make staging deploy fail closed
- **observability**: Verify terminal coverage totals
- **observability**: Defer terminal insert totals
- **observability**: Unify evidence migrations
- **observability**: Reconcile durable Stage 4 totals
- **migrations**: Add concurrent index runner
- **observability**: Use kernel locks for textfiles
- **observability**: Restore validated type guards
- **observability**: Make evidence metrics replay safe
- **qdrant**: Harden observability contracts
- **qdrant**: Align recovery metrics directory contract
- **qdrant**: Enforce restore drill verification
- **qdrant**: Bind runtime to amd64 image lock
- **evidence**: Recover legacy conflict side identity
- **evidence**: Persist durable conflict side identity
- **stage6**: Enforce exact accepted evidence scope
- **web**: Preserve document decision state
- **stage5**: Require exact chunk evidence refs
- **stage5**: Harden document evidence enrichment
- **stage5**: Guard evidence snapshot persistence
- **stage4**: Close document evidence scale boundaries
- **stage4**: Enforce exact evidence token bounds
- **stage4**: Bound per-card evidence hierarchy
- **stage4**: Bound downstream evidence context
- **stage4**: Make evidence preflight resume durable
- **evidence**: Harden durable evidence ledger
- **evidence**: Enforce durable evidence isolation
- **qdrant**: Align integration point IDs
- **CI/CD**: Make pinned Qdrant gate blocking
- **qdrant**: Index document weight for strict formula
- **qdrant**: Harden source reindex recovery
- **CI/CD**: Make pinned Qdrant gate blocking
- **qdrant**: Index document weight for strict formula
- **qdrant**: Address hybrid review findings
- **qdrant**: Enforce alias-safe collection lifecycle
- **qdrant**: Address native ingestion review findings
- **qdrant**: Ingest native BM25 and complete priority payloads
- **career-playbook**: Stop final assembler appending stub diagrams next to rich ones (mc2-db696.104.4)
- **career-playbook**: Prompt fixes for content artifacts (mc2-db696.104.4)
- **career-playbook**: Canonical 26-block topic layout as single source of truth (mc2-1slzl)
- **career-playbook**: Persist follow-up-questions LLM cost into cost_breakdown
- **career-playbook**: Capture real usage on structured-output LLM path
- **career-playbook**: Flag wrong-language and unresolved placeholders in judge
- **career-playbook**: Cap CAREER_PLAYBOOK job attempts to stop TTL cost runaway
- **career-playbook**: Data-drive graph nodes and re-derive finalMarkdown
- **career-playbook**: Record real LLM cost/token usage per node
- Harden career playbook generation timeout
- **CI/CD**: Harden deploy gates and scope web docker build
- **career-playbook**: Preserve fresh starts and CTA layout
- **career-playbook**: Reduce numeric review noise
- **CI/CD**: Keep backend lint warning budget stable
- **career-playbook**: Stabilize generation and delivery
- **migrations**: Fail open on DB connectivity errors in drift gate
- **career-playbook**: Keep library catalog up when image columns missing
- **qdrant**: Stabilize dev endpoint wiring
- **career-playbook**: Harden live smoke generation
- **career-playbook**: Deploy linked course CTA copy
- **generation**: Harden career playbook course generation
- **career-playbook**: Keep mermaid sanitizer lint-clean
- **career-playbook**: Harden mermaid remediation
- **career-playbook**: Open existing generated course
- **career-playbook**: Harden quality issues and public URLs
- **CI/CD**: Restore model matrix delivery gates
- **web**: Align completed module pill colors
- **course-gen**: Replace retired default model ids
- **course-generation**: Keep structural quality in sync after edits
- **web**: Make auto card status badges non-interactive
- **career-playbook**: Skip single-source course review gates
- **delivery**: Use bd dolt push in push-dev
- **career-playbook**: Use valid bridge processing method
- **career-playbook**: Split source evidence helper
- **career-playbook**: Prevent visibility dropdown scroll jump
- **Security**: Clear dependency audit findings
- **CI/CD**: Stabilize career playbook dev delivery
- **CI/CD**: Keep career playbook lint within budget
- **courses**: Align landing CTA with light theme
- **career-playbook**: Enforce follow-up language
- **deploy**: Avoid orphan removal during rollback
- **CI/CD**: Add bounded integration smoke gate
- **CI/CD**: Add qdrant service to integration job
- Repair career playbook dev visibility migration
- Add playbook reader visibility control
- **career-playbook**: Map library detail for viewer
- **career-playbook**: Reduce source lint warnings
- Harden career playbook business context
- **career-playbook**: Tolerate malformed judge verdicts
- **career-playbook**: Accept blank optional spec fields
- **career-playbook**: Retry invalid spec builder output
- **career-playbook**: Repair department selection UX
- **catalog**: Compact statistics cards
- **career-playbook**: Align library card actions with catalog UX
- **career-playbook**: Remove option card text caret
- **career-playbook**: Harden bridge quota and CI qdrant
- **career-playbook**: Use BullMQ-safe generation job ids
- **career-playbook**: Clarify completeness readiness
- **career-playbook**: Align follow-up progress bar
- **career-playbook**: Make option cards clickable
- Start fresh career playbook drafts explicitly
- Align role guide library search field
- **web**: Tune hero card title scale
- **CI/CD**: Restrict rollback to deploy failures (#59)
- **nav**: Preserve locale in product IA review fixes
- **nav**: Preserve locale in product IA review fixes
- **Interface**: Align catalog and header buttons
- **Authentication**: Hide decorative login blob on small screens
- **career-playbook**: Refine landing pre-start section
- **career-playbook**: Clarify methodology source blocks
- **career-playbook**: Localize methodology examples
- **career-playbook**: Keep landing hero full viewport
- **career-playbook**: Align landing demo with dark styling
- **career-playbook**: Prevent landing demo overlap
- **career-playbook**: Make mock variants deployable
- **web**: Remove existing lint warnings
- **header**: Standardize app navigation surfaces
- **career-playbook**: Polish constructor and shared header
- **career-playbook**: Simplify russian role language
- **career-playbook**: Hide unstable question totals
- **career-playbook**: Align wizard progress to steps
- **career-playbook**: Require dedicated staging smoke queue
- **career-playbook**: Enforce bridge organization scope
- **career-playbook**: Harden backend job handler
- **career-playbook**: Harden pdf export review findings
- **graph**: Stabilize workflow viewport and module defaults
- **stage6**: Resolve review flag after approval
- **workflow**: Stabilize graph viewport and module spacing
- **web**: Improve review-required inspector ux
- **web**: Prevent lesson regeneration no-op clicks
- **deploy**: Normalize dev qdrant container
- **stage6**: Harden factual gate and dev delivery
- **stage6**: Relax markdown gate for generated diagrams
- **stage6**: Avoid truncation false positives on markdown tails
- **stage6**: Preserve pre-header markdown introduction
- **stage6**: Canonicalize review and terminal acceptance
- **stage6**: Classify ambiguous footer tails conservatively
- **stage6**: Restore database service review contract
- **stage6**: Harden truncation heuristics and terminal state
- **stage6**: Channel-safe terminal state for section-regeneration cap exceeded
- **stage6**: Move escalation/terminal logic from conditional-edge to self-reviewer node
- **stage6**: Recover lost review_required state from LangGraph conditional-edge mutations
- **stage6**: Escalate truncation_continuation to full_regenerate before fail-open
- **stage6**: Harden rag coverage and truncation continuation
- **web**: Keep rejected stage6 content out of success ui
- **stage6**: Strengthen visual element requirements in single-call prompt
- **stage6**: Preserve max_tokens ceiling semantics
- **stage6**: Close adapter gap, ESLint test coverage, regression test
- **stage6**: Wire phase maxTokens to generator, fix bunker seed path
- **stage6**: Token budget, model config, ladder retry, admin FK
- **stage6**: Satisfy admin regeneration lint rules
- **stage6**: Use canonical lesson specs in admin regeneration
- **web**: Unify viewer-ready lesson content loading
- **web**: Show approved lessons in course viewer
- **stage6**: Align review approval and progress semantics
- **stage6**: Restore remediation contexts for retry paths
- **stage6**: Allow regeneration on completed courses, surface no-op jobs as failed
- **stage6**: Preserve escalation fallback topology
- **stage6**: Honor course overrides and usable content
- **generation**: Harden stage4 restart recovery
- **web**: Surface latest review-required lesson state
- **platform**: Refine required rag retry classification
- Harden required rag retries
- **platform**: Tighten rag fail-fast boundaries
- **course-gen-platform**: Surface rag preflight errors
- **platform**: Fail fast when required rag is unavailable
- **web**: Clarify stage6 review-required graph states
- **web**: Clarify stage6 quality and human escalation
- Prevent false Stage 2 success after Qdrant failure
- **stage6**: Keep mismatch quality failures on ladder
- **API**: Resolve ESM module conflict between helpers.ts and helpers/ directory
- **deploy**: Staged container startup and diagnostic logging
- **web**: Derive stage6 ladder models from persisted history
- **web**: Cherry-pick 2 minor fixes from stale branches
- **web**: Simplify quality recovery hook imports
- **web**: Align quality ladder shared-type imports
- **stage6**: Show explicit review empty state
- **web**: Preserve collapsed lesson inspector split
- **web**: Add lesson inspector split fallback
- **web**: Reconcile stuck stage6 course status
- **cli**: Make push-dev cleanup pipefail-safe
- **cli**: Restore push-dev cleanup trap
- **stage6**: Restore lesson preview and review-required state
- **tests**: Fix lint errors in targeted-refinement-orchestrator test
- **stage6**: Fix token budget telemetry and deduplicate budget check
- **stage6**: Address final review findings for quality hardening
- **stage6,web**: Fix dead sectionCount check, callout whitespace, cleanup
- **web**: Repair broken markdown table rows with split quoted text
- **stage6,web**: Fix PRO TIP callout, section validation, and CI blocker
- **web**: Resolve lint errors in profile pages and i18n
- **stage6**: Fix systemic content quality issues in lesson generation
- **tests**: Ensure Qdrant collection exists before integration tests
- **enrichments**: Break infinite realtime subscription loop in Stage 7 inspector
- **nlm**: Replace broken CDP auth script with official notebooklm login
- **jd**: Update CTA link to https://ai.megacampus.ru in JD and skill
- **pipeline**: Harden Stage 6 quality pipeline — fix 6 root causes
- **pipeline**: Definitive FSM with all transitions + bypass support
- **pipeline**: Restore all lost FSM transitions from original migration
- **Authentication**: Add admin/superadmin bypass to restart-stage endpoint
- **pipeline**: Correct FSM status names to match actual enum values
- **pipeline**: Add awaiting_approval to init state transitions
- **course-gen-platform**: Update 6 source file(s), update docs
- **pipeline**: Allow FSM pending → stage_3/4_init for pre-processed docs
- **stage6**: Eliminate mermaid text fallback + add 3-tier model cascade
- **web**: Truncate long lesson titles to prevent horizontal scroll
- **pipeline**: Add FSM transition + missing enum values + auto-mute rules
- **pipeline**: Extend sanitization to strip surrogate pairs before PG storage
- **pipeline**: Strip null bytes from Docling output before PostgreSQL storage
- **pipeline**: Add DB-level race condition guard to FSM initialization
- **pipeline**: Address code review findings for FSM guard + progress fix
- **pipeline**: Prevent duplicate FSM init + fix clarifying progress message
- **web**: Make getUserFavorites async to fix Next.js Server Actions build
- **Authentication**: Unify course authorization to allow org members across all actions
- **enrichments**: Allow org members to manage enrichments, not just course owner
- **nlm-bridge**: Add lesson_id field to MediaGenerationRequest model
- **pipeline**: Increase LLM timeouts across all stages to prevent OpenRouter AbortErrors
- **pipeline**: Increase Phase 0.5 LLM timeout to 30min with adaptive scaling
- **shared-types**: Add post-build script to fix ESM import extensions
- **pipeline**: Inline shared-utils in tsup bundle to fix ESM resolution
- **pipeline**: Improve extractErrorMessage comment explaining \_sandboxError reliability
- **pipeline**: Address code review findings for sandbox error capture
- **pipeline**: Fix sandbox error capture with prependListener and cleanup dead code
- **pipeline**: Address code review findings for sandbox error pattern
- **pipeline**: Fix BullMQ sandbox error message loss in Stage 2
- **admin**: Fix Docling MCP 404 and stuck courses false positives in health monitor
- **course-gen-platform**: Update 11 source file(s)
- **stage5**: Make lesson materialization idempotent
- **stage6**: Tighten MERMAID_SYNTAX_PATTERNS to reduce false positives
- **course-gen-platform**: Add barrel index.ts files for split modules
- **CI/CD**: Fix PostCSS config and mermaid regex breaking CI pipeline
- **pipeline**: Fix error message propagation + monitoring blind spots
- **web**: Fix remaining 18 ESLint warnings (no-img-element, alt-text, unused-disable)
- **web**: Resolve all @typescript-eslint/no-explicit-any warnings (final retry)
- **web**: Use imported tailwindcss plugin in postcss.config.mjs for Vite 7 compat
- **web**: Handle /sse endpoint in Docling health check URL derivation
- **infra**: Prevent Docling proxy DNS caching + add auto-mute rule
- **worker**: Capture uncaught exceptions in sandbox processor for 9MB DOCX crash
- **web**: Normalize course status for i18n translation keys
- **stage1**: Handle QuotaExceededError before duck-type checks in orchestrator
- **tests**: Fix basic_plus tier enum and PGRST116 handling in quota-enforcer
- **tests**: Reset Redis concurrency counters in contract generation tests
- **tests**: Fix multiple test failures across integration, e2e, and contract suites
- **logger**: Add auto-mute pattern for Mermaid render-invalid warnings
- **worker**: Preserve error message/stack in BullMQ sandbox serialization
- **worker**: Add safety net for stuck courses on sandbox crash
- **CI/CD**: Resolve test timeouts and hanging process issues
- **web**: Fix PostCSS config and shared-utils barrel import breaking build
- **shared-logger**: Replace tsup --dts with tsc --emitDeclarationOnly
- **stage6**: Prevent LO_CODE_PATTERN from consuming newlines
- **stage6**: Strip LO-code references leaking into lesson content
- **stage6**: Strip LLM metadata leaking into lesson content
- **logger**: Add auto-mute for Zod→Regenerator, Phase5 fallback, outbox transients
- **logger**: Add auto-mute for Redis/Queue transient errors during restarts
- **logger**: Expand auto-mute patterns for Mermaid render failures and systemHealth probes
- **deploy**: Remove --remove-orphans that killed Redis on every deploy
- **tests**: Resolve TS module alias resolution errors in IDE
- **tests**: Resolve lint and typescript strict mode errors in new tests
- **tests**: Stabilize test suite — PostCSS import, test assertions, coverage config
- **mind-map**: CSS fullscreen with shared state, fix fold depth, remove duplicate close button
- **mind-map**: Match video aspect ratio for inline preview, fullscreen for View Full Map
- **web**: Update 12 source file(s), update 2 test(s), +1 more
- **mind-map**: Unify display to markmap SVG and fix interactivity in dialog
- **quiz**: Address remaining code review findings (CR-003,007,008,011,015)
- **i18n**: Propagate locale to STAGE_CONFIG and downstream components
- **i18n**: Convert ContentPreviewPanel and LessonMatrix to useTranslations
- **i18n**: Fix remaining hardcoded Russian strings missed in initial pass
- **i18n**: Replace hardcoded Russian strings in generation panel components
- **i18n**: Replace hardcoded Russian in catalog, workflow stages, and clarifying questions
- **i18n**: Replace hardcoded Russian strings with i18n keys across 12+ components
- **pipeline**: Translate course title to target language in Stage 5
- **enrichments**: Use correct placeholder images for NLM enrichment types
- **enrichments**: Remove audio/video from remaining UI components
- **enrichments**: Add image_base64 to bridge media payload detection
- **logger**: Enhance auto-mute to check metadata.message for tRPC errors
- **enrichments**: Pass explicit timeout to wait_for_completion for 3 NLM artifact types
- **enrichments**: Increase NLM queue wait timeout to 72h and async polling to 76h
- **enrichments**: Resolve NLM bridge failures and add enrichment types to materials switcher
- **enrichments**: Change NLM audio default format from deep_dive to debate
- **mind-map**: Remove content truncation, add iterative depth-safe validation
- **enrichments**: Address code review findings for NLM enrichment types
- **infra**: Share enrichments storage between Dev and Staging
- **lint**: Raise eslint function size and complexity limits
- **web**: Stabilize media UX in course viewer
- **admin**: Log fallback URL in bridge health check (I5)
- **admin**: Address code review issues for bridge health check
- **bridge**: Add SOCKS5 proxy and fix config for Stage bridge
- **enrichments**: Persist generation state across lesson navigation
- **pipeline**: Address code review issues in Redis cache-aside
- **nginx**: Add video/mp4 and audio/mpeg MIME types for enrichment storage
- **web**: Restore enrichment generation state after page navigation
- **web**: Dynamic import vidstack to prevent intermittent chunk loading errors
- Code review follow-ups — proper backoff, PGRST116 guards, regression tests
- Stop misclassifying network errors as "enrichment not found" during polling
- **nlm-bridge**: Strip bloated metadata from bridge responses and harden recovery logic
- Enrichment card transition after generation + audio single-click play + metadata perf
- Prevent Select dropdown from closing in enrichment card hover panel
- Add data/secrets to gitignore and fix lint errors in scripts/tests
- **release**: Exclude .venv and .gemini/tmp from package.json discovery and gitignore
- **analysis**: Handle forceRestart in active stage4 states
- **enrichments**: Add nlm types to ordered arrays in generation-graph
- **enrichments**: Resolve nlm audio/video contract and type issues
- **CI/CD**: Build notebooklm-bridge image for deploy
- **stage6**: Add deterministic markdown table remediation
- **web**: Normalize malformed markdown tables
- **stage6**: Improve mermaid diagram remediation pipeline and rendering
- **stage6**: Prevent intro-vs-section content duplication in lesson generation
- **logs**: Address code review findings — rate limiter bug, logWarningToDb bypass, inconsistent logger
- **logs**: Reduce error log volume with pre-insert filters and double-logging elimination
- **logs**: Fix Job not found auto-mute regex and add Redis/Jina patterns
- **stage6**: Remove synthetic conclusion flow and guard recap overlap
- Code review fixes — mermaid false positives, sidebar i18n, regex safety
- **stage6**: Persist regenerationMode to lesson_contents metadata
- **stage6**: Replace broken upsert with insert in markForReview and handlePartialSuccess
- **stage6**: Set status=published when course generation completes
- **web**: Fix false-positive unhealthy status in health endpoint
- **stage6**: Remaining P3 recommendations and test gap coverage
- **stage6**: Code review fixes — P1 regenerationMode bug, upsert alignment, dedup
- **stage6**: Fail-open regenerate caps and persist model telemetry
- **stage6**: Cap regenerate loops on repeated truncation
- **stage6**: Finalize on terminal lesson statuses
- **stage6**: Ignore rejected lessons in completion check
- **stage6**: Run completion check during in-flight partial retries
- **stage6**: Make keyword coverage language-aware
- **stage6**: Improve russian keyword coverage heuristics
- **stage6**: Wire 3-tier model routing into job processor
- **stage6**: Remove stale BullMQ jobs before re-generation
- **CI/CD**: Replace deprecated set-output with GITHUB_OUTPUT env file
- **stage6**: Use keyTopics for key_concepts, guard currentIdx=-1, fix import order
- **stage6,web**: Add lesson_context to partialGenerate, make next-lesson card clickable
- **web**: Fix callout block detection in markdown renderers
- **stage6,web**: Deduplicate lesson objectives, improve conclusion, add next-lesson card
- **stage6**: Use dedicated stage6 queue for partialGenerate
- **stage6**: Skip completion check for partialGenerate jobs
- **json-repair**: Downgrade log from ERROR to WARN when all repair strategies fail
- **stage6**: Pass course style to partialGenerate job data
- **course-gen-platform**: Update 10 source file(s), update docs, +1 more
- **stage7**: Increase hardcoded MAX_OUTPUT_TOKENS in quiz/video handlers
- **llm**: Increase max_tokens for LLM phases and add defensive question filtering
- **llm**: Resolve config-seed.json ESM loading error in dev mode
- **types**: Add stage_6_rag_planning to Record<PhaseName> fallback configs
- **types**: Add stage_6_rag_planning to PhaseName and CHECK constraint
- **stage6**: Correct misleading comment in protectMarkdownElements restore
- **stage6**: Address code review findings for CJK auto-fix
- **deploy**: Restart workers during Blue/Green deployment
- **stage6**: Add 3-layer CJK character auto-fix in self-reviewer
- **stages**: Add non-retryable bail-out to Stage 4 and Stage 6 retry loops
- **stage5**: Prevent infinite retry loop on section count mismatch
- **stage4**: Use Stage 3 LLM priorities in prepareDocumentInfos instead of size heuristic
- **web**: Add startup grace period to health check endpoint
- **stage4**: Pass tokenCount to getModelForPhase in Phase 0.5 and Phase 2
- **CI/CD**: Distinguish cancelled/skipped from failed in Telegram notifications
- **CI/CD**: Repair deploy verification and test failures
- **tests**: Unskip 3 generate-on-demand tests by fixing mock gaps
- **tests**: Repair 4 pre-existing test failures
- **course-gen-platform**: Add warning logs when preprocessing filters short tags/prerequisites
- **course-gen-platform**: Route Zod validation through UnifiedRegenerator, fix metadata min-length, add auto-mute rules
- **course-gen-platform**: Sync thin stage5 prompt in db
- **course-gen-platform**: Update 3 source file(s), update 1 test(s), +1 more
- **health**: Return 503 when heap usage exceeds 90%
- Health check — 18 bugs fixed (3 critical, 5 high, 7 medium, 3 low)
- **web**: MermaidDirect error state recovery on chart prop change
- **stage6**: Add try/catch to mermaid pipeline calls + update README
- **stage6**: Upgrade targeted refinement to full mermaid fix pipeline
- **stage6**: Add prompt template validation to section-regenerator and coherence patcher
- **shared-types**: Fix LessonRAGContextV2 Zod schema rejecting empty primary_documents
- **stage5**: Fix RAG sentinel bug, remove dead code, deprecate document_relevance_mapping
- **stage5**: Code review fixes — sanitization, edge cases, dead code cleanup
- **web**: Fix 40 failing tests across 17 test files
- **stage4**: Code review fixes — warning logs, ordering invariant, doc headers
- **web**: Thread courseLanguage to admin generation-graph panels
- **web**: Parse and localize markdown callout blocks ([!TIP], [!WARNING], etc.)
- **stage4**: Budget allocator overflow + context handler improvements
- **web**: Remove y-axis animation to prevent scroll jump on lesson load
- **tests**: Update lesson-context and classifier tests for new behavior
- **stage5**: Use const for non-reassigned variable (lint)
- **web**: Resolve empty mermaid SVG caused by render race condition
- **stage6**: Add mermaid sanitization to all LLM content paths
- **pipeline**: Correct JOB_TYPE_TO_STEP mapping, progress messages, and error metadata
- **stage5**: Filter short course_tags before RT-006 validation
- **course-gen-platform**: Complete code review fixes for single-call generation
- **course-gen-platform**: Address code review findings for single-call generation
- **course-gen-platform**: Refactor chat editing system + code review fixes
- **course-gen-platform**: Fix chat config duplicates + Phase 0.5 Zod validation + auto-mute rules
- **course-gen-platform**: Update 4 source file(s), update docs
- **course-gen-platform**: Update 15 source file(s), update docs
- **course-gen-platform**: Update 3 source file(s), update 1 test(s), +2 more
- Distinguish transient DB failure from missing config in fetchPhaseConfigFromDb
- Address round 16 code review findings (fail-fast + clarification cards)
- Address round 15 code review findings (4 fixes)
- Address round 14 code review findings (FULL_REGENERATE regex + lesson_number format)
- Resolve positional reference ambiguity when both element types present
- Add positional reference resolution (first/last) to target-resolver
- Address round 11 code review findings (Phase 4 alignment + heuristics)
- Add chat phase hardcoded fallbacks + guard content.sections iteration
- Address 7 code review findings (round 10)
- Address round 9 code review findings (flaky regex + false-green + stubs)
- Address round 8 code review findings (integration tests + backfill retry)
- Address round 7 code review findings (backfill retry + integration tests)
- Address 5 code review findings (round 6)
- Address 8 code review findings (round 5)
- Address 6 code review findings (round 4) + parent integrity trigger
- Address 6 code review findings (round 3)
- Align implementation with plan requirements (9 findings)
- Targeted Stage 6 content generation for new lessons + parity monitoring
- Count actual affected elements in delete ratio validation
- Ensure stable IDs before course_nodes dual-write
- **chat**: Route explicit intent=regenerate to actual job queue instead of legacy LLM flow
- **web**: Add NextIntlClientProvider wrapper to useRefinement tests
- **chat**: Complete Phase 2-3 audit — prompt caching, structural flag, token benchmark, Stage 6 CTA
- **chat**: Audit fixes — FULL_REGENERATE job, stable ID proposals, ensureStableIds in apply, Stage 6 CTA
- Resolve generation.initiate failure, Stage 5 enum mismatch, CSP blocking
- **web**: Correct misleading "exponential backoff" comment
- **web**: Fix build blocker, remove upload as-any casts, rewrite enrichment tests
- **web**: Migrate client-side hooks from raw fetch to tRPC client (Phase 4)
- **web**: Migrate raw fetch() calls to tRPC client (Phases 1-3)
- Staging deploy chown + contract tests BullMQ ESM crash
- **tests**: Remove BullMQ worker from contract tests
- **Authentication**: Add local JWT verification fallback for test environments
- **tests**: Remove fake session_id from mock JWT + fix reregeneration typo
- **tests**: Fix 32 CI contract test failures — JWT secret, stale enums, wrong namespace
- **stage4**: Add .default() to SuggestedAnswerSchema.rationale for LLM output resilience
- **lint**: Resolve 23 ESLint errors across web package + suppress test false positives
- **chat**: Address code review findings CR-004/005/006/007/009/010
- **chat**: Fix 500 error, add stage-specific models, replace deprecated models
- **refinement-chat**: Improve JSON content detection
- **bunker**: Use randomUUID for atomic temp files instead of process.pid
- **logger,stage4**: LKG race condition, error serialization, rationale validation
- **chat**: Improve JSON detection + add trim guard + telemetry (code review)
- **chat**: Prevent empty chat bubbles and blank lesson content (EGT-1521, GDK-6714)
- **chat**: Empty assistant bubble + irrelevant proposals in refinement chat
- Add ARIA labels + 44 unit tests for CategoryBadge
- Address code review findings from refactoring
- **tests**: Update 14 stale judge tests to match current implementations
- **tests**: Mock Supabase Auth tokens locally to eliminate flaky CI failures
- **i18n**: Extract hardcoded strings from RefinementChat + useRefinement
- **chat**: Code review v2 — dedup ChatMessage, fix rejectProposal cleanup, add 6 tests
- **chat**: Address code review findings — skeleton, redundant check, generic message
- **chat**: Add Reject button + post-accept guidance message
- **chat**: Improve chat UX — remove toast, keep proposal after accept, add Stage 6 per-lesson chat
- **stage4**: Address code review findings for Phase 0.5 multi-round clarification
- **worker**: Resolve log warnings from course generation QGN-6607
- Address code review HIGH findings — IPv6 SSRF + cleanup audit trail
- Healthcheck cycle — auth, types, atomic deletion, security hardening
- **web**: Replace i18n 'as any' with '@ts-expect-error' + add SSRF protection
- **Security**: Timing-safe metrics API key comparison
- Healthcheck batch 2 — 6 bugs fixed, bundle optimization
- **web**: Improve auth sync error handling + sync avatar_url
- **Security**: Healthcheck — 9 bugs fixed (5 critical, 3 high, 1 medium)
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
- **course-gen-platform**: Update 28 source file(s), update 2 test(s), +2 more
- Address remaining code review issues #6-#15
- Address code review issues for perf optimization
- Harden sanitize.fileName, fix tests, extract CONTROL_CHAR_REGEX
- **CI/CD**: Build course-gen-platform before type-check
- Remove type safety bypasses in ClarifyingPanel (#4, #5)
- Address code review findings for tRPC migration
- **tests**: Repair unit test suite — 83/83 pass, no hanging
- **tests**: Repair 10 pre-existing broken unit tests after deduplication
- **i18n**: Extract remaining hardcoded Russian strings, remove orphaned vapid script
- **Authentication**: Wrap login schema in useMemo to prevent recreation on every render
- **stage4**: Redis resilience + code review fixes (IMP-001/002/003, MED-002/003, MIN-003/005/006)
- **stage4**: Broken test imports + Redis cache for Phase 1 + Phase 0.5 progress
- **test**: Update stale 'hands-on' assertion in context-assembler test
- **stage4**: Update docstrings to reflect Phase 1→0.5 ordering
- **shared-types,web**: Add pedagogical_patterns to editable whitelist & guard empty .in()
- **stage4,stage5**: Retry pull-fallback + accept any assessment_types type
- **pipeline**: Sync course style injection across all generation stages
- **stage4**: Pass document content to clarifying questions prompt
- **userback**: Use identify() for form pre-fill instead of init options
- **course-gen-platform**: Update 1 source file(s), update docs
- **graph**: Fix Stage 4 results spinner — shared ref race condition + missing complete statuses
- **stage7**: Fix double retry bug causing enrichments stuck in generating
- **anti-overlap**: Remaining code review issues (1.3, 2.3, 5.3, security, i18n)
- **anti-overlap**: Address code review findings for overlap detection
- **pipeline**: Prevent duplicate lessons via anti-overlap prompts and cross-section detection
- **userback**: Localize widget greeting to Russian
- **userback**: Add font-src CSP and prefill email/name in widget
- **csp**: Add static.userback.io to style-src and connect-src
- **Authentication**: Code review fixes — security, i18n, UX improvements
- Remove unused InvitationType imports + fix NODE_ENV test assertions
- Health check phase 2 - 13 deferred bugs fixed
- Health check - 8 bugs fixed (mc2-wisp-0t4)
- **worker**: Use actual path in EACCES fix instructions
- Shared Jina rate limiter (100 RPM) + EACCES improvements + auto-mute rules
- **block-regen**: Optimistic locking, cache limit, shared setNestedValue
- **orchestrator**: Address code review findings for BLOCK_REGENERATION
- **CI/CD**: Add concurrency group and paths-ignore for .beads
- **lesson-editor**: Concurrent save guard, draft toast, save feedback, ARIA
- **lesson-editor**: CSS, dark mode, autosave, context refactor, and tests
- **lesson-editor**: Address code review findings
- Resolve 3 production error categories
- **workflow**: Merge stage1CourseData with traces for Stage 1 nodes
- **chat**: Resolve message duplication and data not refreshing after apply
- **tests**: Sync test data with updated Zod schemas (9 failing tests)
- **tests**: Fix fetch mocking in jina-reranker-client unit test
- **admin**: Fix null filters breaking /admin/logs page (500 error)
- **stage4**: Enforce min length + filter invalid answers in normalization
- Process error logs — 3 bug fixes + 3 auto-mute rules
- **stage6**: Prevent "sections is not iterable" error in judge
- **i18n**: Address code review findings for i18n headers
- **i18n**: Replace hardcoded English headers with localized labels
- **markdown**: Escape currency dollar signs to prevent LaTeX math misinterpretation
- **chat**: Address code review issues for intent classification
- **chat**: Optimize chat fallback config for large courses
- **CI/CD**: Add forceExit to shared-types vitest config
- **CI/CD**: Resolve test timeouts and hanging processes
- очистка localStorage после создания курса
- добавлена валидация приоритетов документов при переходе Stage 3→4
- Resolve CI/CD test failures blocking Dev deploy
- Address code review findings for user-preferences
- **useLessonActions**: Fix P0/P1 race conditions and memory leaks
- **docling**: Graceful fallback for unsupported format + clarify cover prompts design
- **orchestrator**: Pass BullMQ job token correctly in sandboxed processor
- **AMX-5817**: Resolve bucket, chat blocking, and Jina rate limit issues
- **web**: Only show approve button when generationStatus is awaiting_approval
- **stage1**: Graceful fallback when vector duplication has no vectors
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
- **docling**: Switch MCP transport from Streamable HTTP to SSE
- **stage2**: Implement remaining code review recommendations
- **stage2**: Address code review findings for reliability improvements
- **stage2**: Improve Docling session retry and add fallback extraction
- **tests**: Clean up broken unit tests and improve test stability
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
- **clarifying**: Address code review findings HIGH-001, HIGH-002, MED-001, MED-002
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
- **shared-types**: Update 1 source file(s), update docs
- **web**: TypeScript errors in P3.3 i18n migration
- **web**: P3 code review fixes + course regeneration flow
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
- **deploy**: Add docling-mcp image check before deploy
- **admin/logs**: Default to status='new' in list view
- **deploy**: Add automatic Docker cleanup after each deploy
- **graph**: Auto-refresh UI when stage reaches awaiting_approval
- **infra**: Add uploads-dev mount to docling and BARRIER_FAILED enum
- **changelog**: Sort versions in correct descending order
- **slug**: Prevent suffix truncation in generateSlug
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
- **generation**: Use all form fields in course generation prompts
- **generation**: Stage 3 now runs for deduplicated documents
- **web**: Use vector_status for document processing status
- **stage2**: Enhance filePath validation for empty strings
- **stage2**: Add filePath validation before document processing
- **stage6**: Sync generation_progress.steps[] on completion
- **locks**: Remove double releaseLock in Stage 4 and Stage 5 handlers
- **nginx**: Add rewrite for /api/trpc to /trpc
- **cover**: Use 21:9 cinematic ratio in lightbox preview
- **web**: Update 15 source file(s), update docs
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
- **enrichments**: Address code review MEDIUM/LOW priority issues
- **enrichments**: Address code review HIGH priority issues
- **enrichments**: Restore generation progress on page reload
- **logger**: Address HIGH priority code review findings
- **logging**: Improve LLM error logging and add TTL timeout auto-mute
- **web**: Update 4 source file(s), update docs
- Address code review issues for performance optimization
- Sprint bug fixes - template whitelist, patcher retry, banner flow, status validation
- **web**: Update 1 source file(s), update 5 test(s), +1 more
- **lessons**: Address code review issues for lessons page
- **progress**: Address code review findings for Stage 6 progress bar
- **code-review**: Address P1 and P2 issues from review
- **progress**: Update percentage during Stage 6 lesson generation
- **generation-graph**: Implement GitHub Issues #10, #11, #17
- **enrichment**: Resolve cover/banner generation issues
- **enrichment**: Unify grid layout for all enrichment cards
- **pipeline**: Implement per-field save status and fix type compatibility
- **pipeline**: Persist Stage 4 edits and show per-field save status
- **enrichments**: Address code review issues for UnifiedEnrichmentCard
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
- **generation**: Add token validation warnings and pause delay tracking
- **generation**: Address code review findings for pause/stop/resume
- **redis**: Improve retry strategy with graceful shutdown and health monitoring
- **generation**: Make pause/stop/resume controls work correctly
- **redis**: Exit process after extended connection failure (~20 min)
- **redis**: Never give up on reconnection, use exponential backoff
- **scripts**: Correct Xiaomi model ID in Stage 6 quality tests
- **stage6**: Add null checks to prevent TypeError in formatInterLessonContextXML
- **scripts**: Add dotenv import to test-lesson-generation
- **mermaid**: Improve dark mode contrast for edge labels and text
- **web**: Use i18n Link for correct SPA navigation
- **stage2**: Add courseId to Phase 6 summarization error logs
- **stage7**: Use || instead of ?? for empty string handling in card prompts
- **web**: Fix Link+Button nesting issues across generation-graph
- **web**: Fix navigation in EndNodePanel "Open Course" button
- **stage6**: Fix TypeScript types in checkAndSetStage6Complete
- **course-gen-platform**: Update 1 source file(s), update docs
- **generation-graph**: Correct course_size and notifications display on progress page
- **docker**: Add BULLMQ_STAGE7_QUEUE_NAME to worker-dev for Stage 7 queue isolation
- **web**: Update 1 source file(s), update docs
- **docker**: Add BULLMQ_STAGE6_QUEUE_NAME to worker-dev for Stage 6 queue isolation
- **upload-overlay**: Prevent layout shift when switching files
- **model-config**: Update stage_number Zod constraint from max(6) to max(7)
- **i18n**: Persist selected language in user settings
- **deploy**: Remove redundant env var from docker-compose
- **deploy**: Add NEXT_SERVER_ACTIONS_ENCRYPTION_KEY for persistent Server Actions
- **docker**: Add uploads-dev mount to docling-mcp for dev environment
- **docker**: Add DOCLING_UPLOADS_BASE_PATH override for document processing
- **web**: Fix type-check by excluding tests from tsconfig
- **stage6**: Add dedicated worker service and queue isolation for dev
- **enrichments**: Disable auto lesson card/cover generation
- **admin/logs**: Fix status filter not working in flat view
- **Stage4**: Pass course_size via job data to avoid race condition
- **Stage5**: Use 'intermediate' as default difficulty instead of undefined
- **skill**: Dev server errors should be investigated, not bulk resolved
- **orchestrator**: Support snake_case in job cleanup logic
- **orchestrator**: Support snake_case job data fields in queue-events-backup
- **orchestrator**: Prevent attempts exceeding max_attempts constraint violation
- **stage2**: Add hardcoded fallback for model config in Phase 6
- **stage2**: Store fallback processed_content on summarization failure
- **auto-approval**: Correct FSM transitions for automatic mode
- **course-size**: Remove hardcoded min 10 lessons from CourseStructureSchema
- **auto-approval**: Correct status suffix for all stages + release locks early
- **stage2**: Handle SandboxedJob missing getState() method
- **phase-2**: Respect course_size preset constraints (MICRO/MINI/COMPACT)
- **docling**: Transform local paths to container paths for Docker
- **stage4**: Respect course_size constraints for MICRO/MINI/COMPACT (mc2-usg3)
- **pipeline**: Comprehensive Stage 5 retry and placeholder handling
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
- **Stage5**: Validate style against enum before Zod validation
- **Stage5**: Handle null DB fields in frontend_parameters validation
- **GenerationProgress**: Pause/resume now updates UI in real-time
- **GraphHeader**: Show fingerprint button with courseId fallback when generationCode is null
- **MissionControlBanner**: Address code review P1-P2 issues
- **worker**: Log errors to DB inside sandbox before stack trace is lost
- **admin-logs**: List view now considers fingerprint-based status
- **web**: Prevent profile learning_style from overriding user's form selection
- **web**: Update 2 source file(s)
- **logger**: Use upsert for duplicate problem_id in error logging
- **processor**: Resolve ESM directory import error in sandboxed processor
- **course-viewer**: Complete remaining code review fixes CR-005 through CR-022
- **course-viewer**: Address code review issues CR-001 through CR-018
- **a11y**: Add ARIA labels and null checks to BreadcrumbNav
- **orchestrator**: Improve sandboxed processor type safety and reliability
- **web**: Allow micro course size in validation schema
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
- **shared-types**: Update 4 source file(s), update 1 agent(s), +2 more
- **logs**: Implement server-side grouping with RPC + code review fixes
- **stage4**: Use actual target_audience from DB instead of hardcoded value
- **generation**: передавать course_size и description в Input стадии 5
- **logs**: Improve PostgrestError logging with full error details
- **web**: Navigation sheet not working in fullscreen mode
- **enrichment**: Address code review issues #5-#7
- **enrichments**: Address code review findings
- **web**: Cleanup unused type and debug comment in EnrichmentsPanel refactoring
- **stage6**: Rename generator.ts to avoid ESM directory conflict
- **stage6**: Resolve circular dependency in orchestrator
- Remove unused LessonGraphNode import in judge-node.ts
- **stage5**: Show both content and teaching styles in blueprint preview
- **stage5**: Show user-selected style instead of LLM analysis style
- **stage5**: Show exact lesson count instead of fake range
- **stage6**: Fix lessons.content query and add warn/error DB logging
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
- **types**: Resolve TypeScript build errors
- **lint**: Resolve remaining ESLint errors in web package
- **lint**: Resolve all ESLint errors across packages
- **course-size**: Address code review findings
- **course-gen-platform**: Update 2 source file(s)

---

_This release was automatically generated from 3958 commits._

## v0.31.40

_Released on 2026-04-10_

### ✨ New Features

- Add 2 source file(s), update 1 source file(s), +1 more

### 🐛 Bug Fixes

- **API**: Resolve ESM module conflict between helpers.ts and helpers/ directory
- **deploy**: Staged container startup and diagnostic logging

---

_This release was automatically generated from 3 commits._

## v0.31.39

_Released on 2026-04-07_

### 🐛 Bug Fixes

- **web**: Derive stage6 ladder models from persisted history

---

_This release was automatically generated from 2 commits._

## v0.31.38

_Released on 2026-04-07_

### 🐛 Bug Fixes

- **web**: Cherry-pick 2 minor fixes from stale branches

---

_This release was automatically generated from 2 commits._

## v0.31.37

_Released on 2026-04-07_

### ✨ New Features

- Add 2 source file(s), update docs
- **stage6**: Surface quality ladder review history
- **stage6**: Add quality recovery execution ladder
- **stage6**: Add quality ladder contract
- **orchestration**: Add local contract and dev delivery path
- **cli**: Add dev delivery command

### 🐛 Bug Fixes

- **web**: Simplify quality recovery hook imports
- **web**: Align quality ladder shared-type imports
- **stage6**: Show explicit review empty state
- **web**: Preserve collapsed lesson inspector split
- **web**: Add lesson inspector split fallback
- **web**: Reconcile stuck stage6 course status
- **cli**: Make push-dev cleanup pipefail-safe
- **cli**: Restore push-dev cleanup trap
- **stage6**: Restore lesson preview and review-required state

---

_This release was automatically generated from 16 commits._

## v0.31.36

_Released on 2026-04-04_

### 🐛 Bug Fixes

- **tests**: Fix lint errors in targeted-refinement-orchestrator test
- **stage6**: Fix token budget telemetry and deduplicate budget check

---

_This release was automatically generated from 2 commits._

## v0.31.35

_Released on 2026-04-04_

### 🐛 Bug Fixes

- **stage6**: Address final review findings for quality hardening
- **stage6,web**: Fix dead sectionCount check, callout whitespace, cleanup

---

_This release was automatically generated from 4 commits._

## v0.31.34

_Released on 2026-04-03_

### 🐛 Bug Fixes

- **web**: Repair broken markdown table rows with split quoted text
- **stage6,web**: Fix PRO TIP callout, section validation, and CI blocker

---

_This release was automatically generated from 2 commits._

## v0.31.33

_Released on 2026-04-01_

### 🔧 Improvements

- **shared-types**: Extract CONCLUSION_HEADINGS to shared constant, remove legacy code

---

_This release was automatically generated from 1 commits._

## v0.31.32

_Released on 2026-04-01_

### 🐛 Bug Fixes

- **web**: Resolve lint errors in profile pages and i18n
- **stage6**: Fix systemic content quality issues in lesson generation

---

_This release was automatically generated from 2 commits._

## v0.31.31

_Released on 2026-03-31_

### 🐛 Bug Fixes

- **tests**: Ensure Qdrant collection exists before integration tests

---

_This release was automatically generated from 1 commits._

## v0.31.30

_Released on 2026-03-31_

### ✨ New Features

- **jd**: Regenerate sales-manager-b2b v2 with 26 blocks + 3 Mermaid diagrams
- **skill**: Add job-description role guide generator (26 blocks)

### 🐛 Bug Fixes

- **enrichments**: Break infinite realtime subscription loop in Stage 7 inspector
- **nlm**: Replace broken CDP auth script with official notebooklm login
- **jd**: Update CTA link to https://ai.megacampus.ru in JD and skill

---

_This release was automatically generated from 5 commits._

## v0.31.29

_Released on 2026-03-21_

### 🐛 Bug Fixes

- **pipeline**: Harden Stage 6 quality pipeline — fix 6 root causes
- **pipeline**: Definitive FSM with all transitions + bypass support
- **pipeline**: Restore all lost FSM transitions from original migration
- **Authentication**: Add admin/superadmin bypass to restart-stage endpoint
- **pipeline**: Correct FSM status names to match actual enum values
- **pipeline**: Add awaiting_approval to init state transitions

---

_This release was automatically generated from 7 commits._

## v0.31.28

_Released on 2026-03-21_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 6 source file(s), update docs
- **pipeline**: Allow FSM pending → stage_3/4_init for pre-processed docs

---

_This release was automatically generated from 2 commits._

## v0.31.27

_Released on 2026-03-21_

### 🐛 Bug Fixes

- **stage6**: Eliminate mermaid text fallback + add 3-tier model cascade
- **web**: Truncate long lesson titles to prevent horizontal scroll

---

_This release was automatically generated from 2 commits._

## v0.31.26

_Released on 2026-03-21_

### 🐛 Bug Fixes

- **pipeline**: Add FSM transition + missing enum values + auto-mute rules
- **pipeline**: Extend sanitization to strip surrogate pairs before PG storage
- **pipeline**: Strip null bytes from Docling output before PostgreSQL storage

---

_This release was automatically generated from 4 commits._

## v0.31.25

_Released on 2026-03-19_

### 🐛 Bug Fixes

- **pipeline**: Add DB-level race condition guard to FSM initialization
- **pipeline**: Address code review findings for FSM guard + progress fix
- **pipeline**: Prevent duplicate FSM init + fix clarifying progress message
- **web**: Make getUserFavorites async to fix Next.js Server Actions build

---

_This release was automatically generated from 4 commits._

## v0.31.24

_Released on 2026-03-18_

### ✨ New Features

- **course-gen-platform**: Add 1 source file(s), update 2 source file(s), +1 more

### 🐛 Bug Fixes

- **Authentication**: Unify course authorization to allow org members across all actions
- **enrichments**: Allow org members to manage enrichments, not just course owner
- **nlm-bridge**: Add lesson_id field to MediaGenerationRequest model

---

_This release was automatically generated from 4 commits._

## v0.31.23

_Released on 2026-03-17_

### 🐛 Bug Fixes

- **pipeline**: Increase LLM timeouts across all stages to prevent OpenRouter AbortErrors
- **pipeline**: Increase Phase 0.5 LLM timeout to 30min with adaptive scaling
- **shared-types**: Add post-build script to fix ESM import extensions
- **pipeline**: Inline shared-utils in tsup bundle to fix ESM resolution
- **pipeline**: Improve extractErrorMessage comment explaining \_sandboxError reliability
- **pipeline**: Address code review findings for sandbox error capture
- **pipeline**: Fix sandbox error capture with prependListener and cleanup dead code

---

_This release was automatically generated from 9 commits._

## v0.31.22

_Released on 2026-03-17_

### 🐛 Bug Fixes

- **pipeline**: Address code review findings for sandbox error pattern
- **pipeline**: Fix BullMQ sandbox error message loss in Stage 2
- **admin**: Fix Docling MCP 404 and stuck courses false positives in health monitor

---

_This release was automatically generated from 3 commits._

## v0.31.21

_Released on 2026-03-16_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 11 source file(s)
- **stage5**: Make lesson materialization idempotent
- **stage6**: Tighten MERMAID_SYNTAX_PATTERNS to reduce false positives

---

_This release was automatically generated from 3 commits._

## v0.31.20

_Released on 2026-03-16_

### ✨ New Features

- **stage6**: Add centralized sanitizeContent at DB write layer

### 🔧 Improvements

- **course-gen-platform**: Split 4 files >800 lines into extracted modules (Batch 1)
- **course-gen-platform**: Split large files to reduce max-lines warnings
- **course-gen-platform**: Split notebooklm-bridge-client.ts to fix max-lines
- **course-gen-platform**: Split model-config-bunker.ts to fix max-lines
- **course-gen-platform**: Split phase-0.5-clarifying.ts to fix max-lines
- **course-gen-platform**: Split generation-phases.ts to fix max-lines
- **course-gen-platform**: Split stage6-prompts.ts into individual files
- Replace console logs with structured logger in web and shared-utils
- **course-gen-platform**: Replace console logs with structured logger
- **stage6**: Replace LO-code IDs with numbered format in prompts

### 🐛 Bug Fixes

- **course-gen-platform**: Add barrel index.ts files for split modules
- **CI/CD**: Fix PostCSS config and mermaid regex breaking CI pipeline
- **pipeline**: Fix error message propagation + monitoring blind spots
- **web**: Fix remaining 18 ESLint warnings (no-img-element, alt-text, unused-disable)
- **web**: Resolve all @typescript-eslint/no-explicit-any warnings (final retry)
- **web**: Use imported tailwindcss plugin in postcss.config.mjs for Vite 7 compat
- **web**: Handle /sse endpoint in Docling health check URL derivation
- **infra**: Prevent Docling proxy DNS caching + add auto-mute rule
- **worker**: Capture uncaught exceptions in sandbox processor for 9MB DOCX crash
- **web**: Normalize course status for i18n translation keys
- **stage1**: Handle QuotaExceededError before duck-type checks in orchestrator
- **tests**: Fix basic_plus tier enum and PGRST116 handling in quota-enforcer
- **tests**: Reset Redis concurrency counters in contract generation tests
- **tests**: Fix multiple test failures across integration, e2e, and contract suites
- **logger**: Add auto-mute pattern for Mermaid render-invalid warnings
- **worker**: Preserve error message/stack in BullMQ sandbox serialization
- **worker**: Add safety net for stuck courses on sandbox crash
- **CI/CD**: Resolve test timeouts and hanging process issues
- **web**: Fix PostCSS config and shared-utils barrel import breaking build
- **shared-logger**: Replace tsup --dts with tsc --emitDeclarationOnly
- **stage6**: Prevent LO_CODE_PATTERN from consuming newlines
- **stage6**: Strip LO-code references leaking into lesson content
- **stage6**: Strip LLM metadata leaking into lesson content

---

_This release was automatically generated from 38 commits._

## v0.31.19

_Released on 2026-03-11_

### 🔧 Improvements

- Extract shared utils/logger, enrichment card overlay UX

### 🐛 Bug Fixes

- **logger**: Add auto-mute for Zod→Regenerator, Phase5 fallback, outbox transients
- **logger**: Add auto-mute for Redis/Queue transient errors during restarts
- **logger**: Expand auto-mute patterns for Mermaid render failures and systemHealth probes
- **deploy**: Remove --remove-orphans that killed Redis on every deploy
- **tests**: Resolve TS module alias resolution errors in IDE
- **tests**: Resolve lint and typescript strict mode errors in new tests
- **tests**: Stabilize test suite — PostCSS import, test assertions, coverage config

---

_This release was automatically generated from 18 commits._

## v0.31.18

_Released on 2026-03-05_

### ✨ New Features

- **Skills**: Add code-review skill, remove old code-reviewer stubs

### 🔧 Improvements

- **Skills**: Remove code-review-inline orchestrator

---

_This release was automatically generated from 7 commits._

## v0.31.17

_Released on 2026-03-02_

### ✨ New Features

- **flashcards**: Redesign FlashcardViewer UI with fullscreen study mode

---

_This release was automatically generated from 1 commits._

## v0.31.16

_Released on 2026-03-02_

### 🐛 Bug Fixes

- **mind-map**: CSS fullscreen with shared state, fix fold depth, remove duplicate close button
- **mind-map**: Match video aspect ratio for inline preview, fullscreen for View Full Map

---

_This release was automatically generated from 2 commits._

## v0.31.15

_Released on 2026-03-01_

### ✨ New Features

- **enrichments**: Refactor enrichment system with all 14 types, batch UI, and i18n

### 🐛 Bug Fixes

- **web**: Update 12 source file(s), update 2 test(s), +1 more
- **mind-map**: Unify display to markmap SVG and fix interactivity in dialog

---

_This release was automatically generated from 3 commits._

## v0.31.14

_Released on 2026-03-01_

### ✨ New Features

- **quiz**: Unhide quiz enrichment with multi-select, andragogy, and renamed to Квиз

### 🐛 Bug Fixes

- **quiz**: Address remaining code review findings (CR-003,007,008,011,015)
- **i18n**: Propagate locale to STAGE_CONFIG and downstream components
- **i18n**: Convert ContentPreviewPanel and LessonMatrix to useTranslations
- **i18n**: Fix remaining hardcoded Russian strings missed in initial pass
- **i18n**: Replace hardcoded Russian strings in generation panel components
- **i18n**: Replace hardcoded Russian in catalog, workflow stages, and clarifying questions

---

_This release was automatically generated from 7 commits._

## v0.31.13

_Released on 2026-03-01_

### 🐛 Bug Fixes

- **i18n**: Replace hardcoded Russian strings with i18n keys across 12+ components

---

_This release was automatically generated from 2 commits._

## v0.31.12

_Released on 2026-03-01_

### ✨ New Features

- **Interface**: Update enrichments UI, course cards, header and viewer improvements

---

_This release was automatically generated from 1 commits._

## v0.31.11

_Released on 2026-03-01_

### ✨ New Features

- **viewer**: Remove max-width constraints so lesson content fills available space

---

_This release was automatically generated from 1 commits._

## v0.31.10

_Released on 2026-02-28_

### 🐛 Bug Fixes

- **pipeline**: Translate course title to target language in Stage 5

---

_This release was automatically generated from 1 commits._

## v0.31.9

_Released on 2026-02-28_

### ✨ New Features

- **enrichments**: Hide audio, video, presentation, quiz from UI

---

_This release was automatically generated from 1 commits._

## v0.31.8

_Released on 2026-02-28_

### ✨ New Features

- **enrichments**: Replace MindMapViewer with interactive markmap-view
- **enrichments**: Temporarily hide nlm_study_guide from UI
- **enrichments**: Hide regular audio/video from UI, keep NLM variants only
- **web**: Add unique placeholder images for 4 new NLM enrichment types
- **enrichments**: Add 4 new NotebookLM enrichment types

### 🔧 Improvements

- **enrichments**: Extract buildStandardSources helper and add flashcards strict schema

### 🐛 Bug Fixes

- **enrichments**: Use correct placeholder images for NLM enrichment types
- **enrichments**: Remove audio/video from remaining UI components
- **enrichments**: Add image_base64 to bridge media payload detection
- **logger**: Enhance auto-mute to check metadata.message for tRPC errors
- **enrichments**: Pass explicit timeout to wait_for_completion for 3 NLM artifact types
- **enrichments**: Increase NLM queue wait timeout to 72h and async polling to 76h
- **enrichments**: Resolve NLM bridge failures and add enrichment types to materials switcher
- **enrichments**: Change NLM audio default format from deep_dive to debate
- **mind-map**: Remove content truncation, add iterative depth-safe validation
- **enrichments**: Address code review findings for NLM enrichment types
- **infra**: Share enrichments storage between Dev and Staging
- **lint**: Raise eslint function size and complexity limits

---

_This release was automatically generated from 18 commits._

## v0.31.7

_Released on 2026-02-27_

### ✨ New Features

- **bridge**: Allow parallel audio + video generation per course
- **admin**: Add NotebookLM Bridge health check to admin dashboard

### 🐛 Bug Fixes

- **web**: Stabilize media UX in course viewer
- **admin**: Log fallback URL in bridge health check (I5)
- **admin**: Address code review issues for bridge health check
- **bridge**: Add SOCKS5 proxy and fix config for Stage bridge

---

_This release was automatically generated from 6 commits._

## v0.31.6

_Released on 2026-02-26_

---

_This release was automatically generated from 1 commits._

## v0.31.5

_Released on 2026-02-26_

### ✨ New Features

- **enrichments**: Fix audio/video playback + expose NLM format options
- **pipeline**: Add Redis read-side cache for Stage 3/4 file content
- **pipeline**: Add Redis cache-aside for file and lesson content

### 🐛 Bug Fixes

- **enrichments**: Persist generation state across lesson navigation
- **pipeline**: Address code review issues in Redis cache-aside
- **nginx**: Add video/mp4 and audio/mpeg MIME types for enrichment storage

---

_This release was automatically generated from 8 commits._

## v0.31.4

_Released on 2026-02-26_

### 🐛 Bug Fixes

- **web**: Restore enrichment generation state after page navigation

---

_This release was automatically generated from 1 commits._

## v0.31.3

_Released on 2026-02-26_

### 🔧 Improvements

- **Database**: Database health cleanup — reduce size 391→153 MB and optimize egress
- Migrate 48 router files to shared throwOnSupabaseError utility

### 🐛 Bug Fixes

- **web**: Dynamic import vidstack to prevent intermittent chunk loading errors
- Code review follow-ups — proper backoff, PGRST116 guards, regression tests
- Stop misclassifying network errors as "enrichment not found" during polling

---

_This release was automatically generated from 5 commits._

## v0.31.2

_Released on 2026-02-26_

### 🐛 Bug Fixes

- **nlm-bridge**: Strip bloated metadata from bridge responses and harden recovery logic
- Enrichment card transition after generation + audio single-click play + metadata perf
- Prevent Select dropdown from closing in enrichment card hover panel

---

_This release was automatically generated from 3 commits._

## v0.31.1

_Released on 2026-02-25_

### ✨ New Features

- Redesign enrichment cards with unified grid, single-click video, and compact audio overlay

---

_This release was automatically generated from 4 commits._

## v0.31.0

_Released on 2026-02-24_

### ✨ New Features

- Telegram notifications, lesson materials switcher, and media player improvements
- Universalize Gastown commands and add /onboard
- **stage7**: Harden NLM pipeline with local media storage, async lifecycle, and recovery
- **stage7**: Harden NLM audio/video generation pipeline
- **enrichments**: Add nlm audio/video generation via notebooklm bridge
- **course-gen-platform**: Add notebooklm bridge FastAPI service
- **admin**: Add generation trace audit page

### 🐛 Bug Fixes

- Add data/secrets to gitignore and fix lint errors in scripts/tests
- **release**: Exclude .venv and .gemini/tmp from package.json discovery and gitignore
- **analysis**: Handle forceRestart in active stage4 states
- **enrichments**: Add nlm types to ordered arrays in generation-graph
- **enrichments**: Resolve nlm audio/video contract and type issues
- **CI/CD**: Build notebooklm-bridge image for deploy
- **stage6**: Add deterministic markdown table remediation
- **web**: Normalize malformed markdown tables

---

_This release was automatically generated from 21 commits._

## v0.30.11

_Released on 2026-02-20_

### 🐛 Bug Fixes

- **stage6**: Improve mermaid diagram remediation pipeline and rendering
- **stage6**: Prevent intro-vs-section content duplication in lesson generation
- **logs**: Address code review findings — rate limiter bug, logWarningToDb bypass, inconsistent logger
- **logs**: Reduce error log volume with pre-insert filters and double-logging elimination
- **logs**: Fix Job not found auto-mute regex and add Redis/Jina patterns

---

_This release was automatically generated from 7 commits._

## v0.30.10

_Released on 2026-02-19_

### 🐛 Bug Fixes

- **stage6**: Remove synthetic conclusion flow and guard recap overlap

---

_This release was automatically generated from 2 commits._

## v0.30.9

_Released on 2026-02-19_

### ✨ New Features

- Tester feedback fixes — CJK patching, header replacement, mermaid wrapping, sidebar descriptions
- **stage6**: Add truncation continuation path and reject telemetry
- **stage6**: Track actual model usage in traces and metadata

### 🐛 Bug Fixes

- Code review fixes — mermaid false positives, sidebar i18n, regex safety
- **stage6**: Persist regenerationMode to lesson_contents metadata
- **stage6**: Replace broken upsert with insert in markForReview and handlePartialSuccess
- **stage6**: Set status=published when course generation completes
- **web**: Fix false-positive unhealthy status in health endpoint
- **stage6**: Remaining P3 recommendations and test gap coverage
- **stage6**: Code review fixes — P1 regenerationMode bug, upsert alignment, dedup
- **stage6**: Fail-open regenerate caps and persist model telemetry
- **stage6**: Cap regenerate loops on repeated truncation
- **stage6**: Finalize on terminal lesson statuses
- **stage6**: Ignore rejected lessons in completion check
- **stage6**: Run completion check during in-flight partial retries
- **stage6**: Make keyword coverage language-aware
- **stage6**: Improve russian keyword coverage heuristics
- **stage6**: Wire 3-tier model routing into job processor
- **stage6**: Remove stale BullMQ jobs before re-generation
- **CI/CD**: Replace deprecated set-output with GITHUB_OUTPUT env file

---

_This release was automatically generated from 23 commits._

## v0.30.8

_Released on 2026-02-18_

### 🔧 Improvements

- **stage6**: Consolidate helpers, extract FSM transition, batch section queries

### 🐛 Bug Fixes

- **stage6**: Use keyTopics for key_concepts, guard currentIdx=-1, fix import order
- **stage6,web**: Add lesson_context to partialGenerate, make next-lesson card clickable
- **web**: Fix callout block detection in markdown renderers
- **stage6,web**: Deduplicate lesson objectives, improve conclusion, add next-lesson card
- **stage6**: Use dedicated stage6 queue for partialGenerate
- **stage6**: Skip completion check for partialGenerate jobs
- **json-repair**: Downgrade log from ERROR to WARN when all repair strategies fail
- **stage6**: Pass course style to partialGenerate job data

---

_This release was automatically generated from 9 commits._

## v0.30.7

_Released on 2026-02-17_

### ✨ New Features

- **stage6**: Add cache_hit trace event and document edge cases
- **stage6**: Add tier1_pass trace event and max score logging
- **stage6**: Add Two-Tier RAG retrieval to eliminate 75% wasted queries

### 🐛 Bug Fixes

- **course-gen-platform**: Update 10 source file(s), update docs, +1 more
- **stage7**: Increase hardcoded MAX_OUTPUT_TOKENS in quiz/video handlers
- **llm**: Increase max_tokens for LLM phases and add defensive question filtering
- **llm**: Resolve config-seed.json ESM loading error in dev mode
- **types**: Add stage_6_rag_planning to Record<PhaseName> fallback configs

---

_This release was automatically generated from 12 commits._

## v0.30.6

_Released on 2026-02-17_

### ✨ New Features

- **llm**: Gemini caching, config-seed auto-load, code review fixes
- **llm**: Replace all Gemini models with gemini-3-flash-preview
- **stage6**: Update CLEV judge and delta judge models
- **stage6**: Add spelling & typo detection to self-reviewer Phase 2.5

### 🔧 Improvements

- **stage6**: Code review improvements — DRY, logging, readability

### 🐛 Bug Fixes

- **types**: Add stage_6_rag_planning to PhaseName and CHECK constraint
- **stage6**: Correct misleading comment in protectMarkdownElements restore
- **stage6**: Address code review findings for CJK auto-fix
- **deploy**: Restart workers during Blue/Green deployment
- **stage6**: Add 3-layer CJK character auto-fix in self-reviewer

---

_This release was automatically generated from 11 commits._

## v0.30.5

_Released on 2026-02-17_

### 🐛 Bug Fixes

- **stages**: Add non-retryable bail-out to Stage 4 and Stage 6 retry loops

---

_This release was automatically generated from 2 commits._

## v0.30.4

_Released on 2026-02-17_

### 🐛 Bug Fixes

- **stage5**: Prevent infinite retry loop on section count mismatch
- **stage4**: Use Stage 3 LLM priorities in prepareDocumentInfos instead of size heuristic
- **web**: Add startup grace period to health check endpoint
- **stage4**: Pass tokenCount to getModelForPhase in Phase 0.5 and Phase 2
- **CI/CD**: Distinguish cancelled/skipped from failed in Telegram notifications
- **CI/CD**: Repair deploy verification and test failures
- **tests**: Unskip 3 generate-on-demand tests by fixing mock gaps
- **tests**: Repair 4 pre-existing test failures

---

_This release was automatically generated from 11 commits._

## v0.30.3

_Released on 2026-02-16_

### 🐛 Bug Fixes

- **course-gen-platform**: Add warning logs when preprocessing filters short tags/prerequisites

---

_This release was automatically generated from 3 commits._

## v0.30.2

_Released on 2026-02-16_

### 🐛 Bug Fixes

- **course-gen-platform**: Route Zod validation through UnifiedRegenerator, fix metadata min-length, add auto-mute rules
- **course-gen-platform**: Sync thin stage5 prompt in db

---

_This release was automatically generated from 3 commits._

## v0.30.1

_Released on 2026-02-16_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 3 source file(s), update 1 test(s), +1 more

---

_This release was automatically generated from 1 commits._

## v0.30.0

_Released on 2026-02-16_

### ✨ New Features

- Add 1 skill(s), update 5 agent(s), +2 more
- **stage4**: Migrate phases 1, 3, 4 to PromptService with typed contracts
- **prompts**: Add type-safe PromptVariableMap + contract validation tests
- **stages 4-5**: Add pedagogical guidance, optimize prompts, migrate to PromptService
- **stage6**: Coherence patcher rejection tests + mermaid pipeline admin monitoring
- **stage5**: Sequential section generation with digest accumulation
- **stage4**: Budget-aware Phase 3 truncation + system prompt reserve
- **stage4**: Wire Budget Allocator to phases + DB-driven model config
- **stage5**: Add overlap retry loop for cross-section deduplication
- **stage4**: Add semantic overlap detection to Phase 2 sections_breakdown
- **stage6**: Add course position awareness to lesson generation
- **stage6**: Persist lessonDigest and enrich summary_preview from DB

### 🔧 Improvements

- **stage5**: Extract shared buildFallbackSearchQueries + add Stage 5→6 integration test
- **stage4**: Remove dead logDuplicateKeyTopics function

### 🐛 Bug Fixes

- **health**: Return 503 when heap usage exceeds 90%
- Health check — 18 bugs fixed (3 critical, 5 high, 7 medium, 3 low)
- **web**: MermaidDirect error state recovery on chart prop change
- **stage6**: Add try/catch to mermaid pipeline calls + update README
- **stage6**: Upgrade targeted refinement to full mermaid fix pipeline
- **stage6**: Add prompt template validation to section-regenerator and coherence patcher
- **shared-types**: Fix LessonRAGContextV2 Zod schema rejecting empty primary_documents
- **stage5**: Fix RAG sentinel bug, remove dead code, deprecate document_relevance_mapping
- **stage5**: Code review fixes — sanitization, edge cases, dead code cleanup
- **web**: Fix 40 failing tests across 17 test files
- **stage4**: Code review fixes — warning logs, ordering invariant, doc headers
- **web**: Thread courseLanguage to admin generation-graph panels
- **web**: Parse and localize markdown callout blocks ([!TIP], [!WARNING], etc.)
- **stage4**: Budget allocator overflow + context handler improvements
- **web**: Remove y-axis animation to prevent scroll jump on lesson load
- **tests**: Update lesson-context and classifier tests for new behavior
- **stage5**: Use const for non-reassigned variable (lint)
- **web**: Resolve empty mermaid SVG caused by render race condition
- **stage6**: Add mermaid sanitization to all LLM content paths
- **pipeline**: Correct JOB_TYPE_TO_STEP mapping, progress messages, and error metadata
- **stage5**: Filter short course_tags before RT-006 validation
- **course-gen-platform**: Complete code review fixes for single-call generation
- **course-gen-platform**: Address code review findings for single-call generation

---

_This release was automatically generated from 61 commits._

## v0.29.15

_Released on 2026-02-14_

### ✨ New Features

- **course-gen-platform**: Replace section-by-section with single-call lesson generation

### 🐛 Bug Fixes

- **course-gen-platform**: Refactor chat editing system + code review fixes
- **course-gen-platform**: Fix chat config duplicates + Phase 0.5 Zod validation + auto-mute rules

---

_This release was automatically generated from 17 commits._

## v0.29.14

_Released on 2026-02-14_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 4 source file(s), update docs

---

_This release was automatically generated from 1 commits._

## v0.29.13

_Released on 2026-02-14_

### 🐛 Bug Fixes

- **course-gen-platform**: Update 15 source file(s), update docs

---

_This release was automatically generated from 1 commits._

## v0.29.12

_Released on 2026-02-14_

### ✨ New Features

- Phase 4 course_nodes flat relational migration with dual-write
- **web**: Add Stage 6 content generation CTA for newly added lessons
- Protect 23 LLM-facing z.enum() with createLLMEnumSchema helper
- **chat**: Phase 3 — context optimization with course skeleton
- **chat**: Phase 2 — surgical operations with stable IDs
- **chat**: Phase 1 — remove toggle, auto-intent classification
- **chat**: Phase 0 — stable IDs + chat model config foundation

### 🔧 Improvements

- **web**: Extract shared toActionError, replace Russian strings, use client-logger

### 🐛 Bug Fixes

- **course-gen-platform**: Update 3 source file(s), update 1 test(s), +2 more
- Distinguish transient DB failure from missing config in fetchPhaseConfigFromDb
- Address round 16 code review findings (fail-fast + clarification cards)
- Address round 15 code review findings (4 fixes)
- Address round 14 code review findings (FULL_REGENERATE regex + lesson_number format)
- Resolve positional reference ambiguity when both element types present
- Add positional reference resolution (first/last) to target-resolver
- Address round 11 code review findings (Phase 4 alignment + heuristics)
- Add chat phase hardcoded fallbacks + guard content.sections iteration
- Address 7 code review findings (round 10)
- Address round 9 code review findings (flaky regex + false-green + stubs)
- Address round 8 code review findings (integration tests + backfill retry)
- Address round 7 code review findings (backfill retry + integration tests)
- Address 5 code review findings (round 6)
- Address 8 code review findings (round 5)
- Address 6 code review findings (round 4) + parent integrity trigger
- Address 6 code review findings (round 3)
- Align implementation with plan requirements (9 findings)
- Targeted Stage 6 content generation for new lessons + parity monitoring
- Count actual affected elements in delete ratio validation
- Ensure stable IDs before course_nodes dual-write
- **chat**: Route explicit intent=regenerate to actual job queue instead of legacy LLM flow
- **web**: Add NextIntlClientProvider wrapper to useRefinement tests
- **chat**: Complete Phase 2-3 audit — prompt caching, structural flag, token benchmark, Stage 6 CTA
- **chat**: Audit fixes — FULL_REGENERATE job, stable ID proposals, ensureStableIds in apply, Stage 6 CTA
- Resolve generation.initiate failure, Stage 5 enum mismatch, CSP blocking
- **web**: Correct misleading "exponential backoff" comment

---

_This release was automatically generated from 76 commits._

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
