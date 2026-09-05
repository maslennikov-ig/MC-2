# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.31.43] - 2026-09-05

### Fixed

- **qdrant**: the restore drill asks the live collection before blaming the backup (1f28f2401)

### Other

- **docling**: report the dropped timeout settings upstream instead of waiting (f69bf61be)
- **tracker**: the backlog audit leaves five items, each saying what would end it (525ffde7f)
- **stage6**: delete the mermaid fallback nobody calls, and a catalogue note that aged (cb972e660)
- **tracker**: close the two parked tracks instead of carrying them (bdd8ba6fb)

## [0.31.42] - 2026-09-03

### Fixed

- **cost**: a price move must not turn three tests red, and the sync must notice (07dd3e41f)
- **security**: the fast-uri pin had aged into the advisory it was meant to avoid (60039c998)
- **cost**: the gemini batch rate had the 50% discount applied twice (94751da80)
- **release**: the release notes title named one old version, not the document (a5e41c2b5)

### Other

- **beads**: journal for the mc2-o7tfu closure (cca77ae83)
- **cost**: sync MODEL_CATALOG with the published OpenRouter rates (6cf4a5f36)
- **beads**: journal for the mc2-hsfaj closure (83d7560b7)
- **beads**: journal for the closures of mc2-mlv7w, mc2-xfr6t and mc2-hpful (984d67e91)
- **deploy**: delete the two rolling deploy scripts nothing could run (5c6c67dd9)
- **closeout**: the audit tails are closed and the release loop is alive again (26bcc9c91)

## [0.31.41] - 2026-09-02

### Security

- aidevteam server audit — cryptominer killed, ports fixed (339c85f9c)
- server hardening — SSH, Bull Board, nginx, kernel update (ea656a69a)
- add authentication to Telegram webhook endpoint (mc2-gqfj) (7fc899c8b)
- remove unused debug and test endpoints (f14764e51)
- fix critical vulnerabilities in local-storage-service (af6322574)

### Added

- **career-playbook**: flag a word that changes alphabet in the middle (5000835b1)
- **career-playbook**: "by when" gets an owner, like "how much" and "how often" (8e6a5e6ca)
- **career-playbook**: a reader gets their own guide, and only theirs (3ff023abf)
- **career-playbook**: gate repetition by audience (1b1b2b12a)
- **career-playbook**: add audience-specific role guide views (31ed55a9e)
- **career-playbook**: add semantic repetition baseline tool (ec28d677d)
- **cost**: the ledger had one provider, and retrieval was billed by another (9734a2bc5)
- **routing**: cheapest endpoint that can actually finish (263ae6c37)
- **cost**: the price gate writes the price instead of asking someone to (3a1fb8e68)
- **images**: the lesson banner moves to riverflow, and three things had to change first (abf4209d3)
- **rag**: Stage 6 stops capping results per document (d3d729759)
- **rag**: measure the diversity grouping actually buys, not the diversity it promises (3171328cc)
- **llm**: Stage 6 prose moves to glm-5.3-flash after the deploy (a8df57ecc)
- **llm**: prose phases move to z-ai/glm-5.3-flash (a08e65380)
- **rag**: the half of the Qdrant epic that was never measured (7c9a952c1)
- **llm**: measure z-ai/glm-5.3-flash where luna-pro was going to go (8f393fbaf)
- **llm**: the price ceiling reads today's rate instead of remembering one (d7011d8b0)
- **llm**: the cheap tier is chosen, not inherited from a price sort (4e0ab3486)
- **notebooklm**: the bridge re-mints its own cookies, and says so when it cannot (01d4cec47)
- **docling**: turn on PDF heading inference in both places, or in neither (0a9e639fe)
- **nlm**: three enum values become three working types (dbe094e21)
- **observability**: a worker restart is now visible from the database alone (fb34acb71)
- **db**: three NotebookLM enrichment types the library makes and the enum refused (057ab53d1)
- **routing**: the cheapest judge takes the seat that runs most, and latest is safe to follow again (9a2fbf7f3)
- **images**: a card asks how much detail it is paying for, on the endpoint that has the knob (63c27869d)
- **ops**: alert on host disk, fix the storage counter's starting point, report cost (429a4bc5d)
- **stage6**: batch initial lesson generation through OpenRouter (61c0ca137)
- **llm**: route Gemini work to 3.7-flash instead of 3-flash-preview (2d4a9f1e3)
- **cost**: record what each LLM call costs, against the course that made it (265f669ff)
- **rag**: search the small grain, answer with the large one (217e3d112)
- **ops**: gate config seed drift, reject impossible budgets, name empty RAG (7d95668c3)
- **llm**: make reasoning configurable per phase, with its own token budget (30698654c)
- **llm**: route every phase onto the models OpenRouter actually offers (d43be2460)
- **career-playbook**: make the source-evidence budget measure itself (4487e321f)
- **career-playbook**: catch attribution laundering and cadence drift (fb6c64d75)
- **career-playbook**: close the six defects the editorial read found (fe53e0e60)
- **career-playbook**: enforce the quality contract in the generation tract (01ff7dd04)
- **career-playbook**: add isolated load acceptance (94eaac613)
- **rag**: add disabled shadow retrieval metrics (460784fc8)
- **playbook**: animate reader panels (02bb9a670)
- **qdrant**: add bounded off-host snapshot recovery (428014ee7)
- **career-playbook**: persist viewer block changes (e0572c25b)
- **ops**: give the uploaded sources a second copy, off the production host (54b185f95)
- **docling**: measure both OCR candidates and reject both, on the record (c2dabfb5d)
- **docling**: let seven Premium formats through, and stop trusting the client's MIME (50d398c83)
- **docling**: call the enrichment router from the conversion phase (de3bc084a)
- **docling**: selective enrichments behind a router that must justify itself (431ea5620)
- **docling**: settle the chunking A/B on production ranking, not a proxy (e0aba8457)
- **docling**: structure-aware chunking with real provenance, behind a flag (48704cbea)
- **docling**: migrate processing stack to MCP 2 (e40c3dd18)
- **qdrant**: whitelist the document repair command in the operator (d2314ce9c)
- **qdrant**: add a bulk repair path for documents that indexed no vectors (30b045c91)
- **q12**: drive the never-executed migration children against a restored isolate (mc2-rjy9k) (9018f3ca0)
- **q12**: probe the frozen-env surface of every manifest command (mc2-bh3ef, mc2-rjy9k) (4d89af736)
- **q12**: B3 follows the B1 shape — measure the rewrite, fail only on dependence (mc2-38ivn) (0eb366c33)
- **q12**: B3 names the remedy when the pooler rewrites application_name (mc2-38ivn, mc2-ot8se) (44d479d29)
- **q12**: make the pre-flight load-bearing — cutover gate on a fresh green report (mc2-ot8se) (dbaa8b7b3)
- **q12**: pre-flight group H and the tracked deployed-asset manifest (mc2-ot8se) (e229f5111)
- **q12**: pre-flight groups C/D/E — unrun path, catalog agreement, quiesce feasibility (mc2-ot8se) (50a6985ae)
- **q12**: pre-flight group B — the pooled session (options, session-mode, appname, datdba) (mc2-ot8se) (b98b9b550)
- **q12**: pre-flight group A — privilege reachability on the guarded set (mc2-ot8se) (c7d0737a9)
- **q12**: window pre-flight skeleton with a fail-closed report contract (mc2-ot8se) (bca99f296)
- **orchestration**: detect work that never reached develop (mc2-xxwsu) (38a675c8b)
- **career-playbook**: remove numeric review mode (959ce44de)
- **qdrant**: give the Q12 window a real execution identity and one privileged seam (mc2-1by33) (a83cd4332)
- **qdrant**: derive Q12 accepted coverage from file_catalog truth (mc2-tpdog) (e7fef75d4)
- **qdrant**: amend .13.4.1 dispositions to file_catalog-only bookkeeping (mc2 Q12) (e29dc188b)
- **qdrant**: add .13.4.1 reviewed plan-input generator (d7d9725f5)
- **q12**: wire source.forward acceptance emit into the Q12 forward wrapper tail (W7a defer a) (edac2284e)
- **q12**: add source.forward acceptance emit CLI entrypoint (W7a real-leg invocation) (d7c840048)
- **q12**: add computeSourceForwardAcceptance emit-entrypoint (W7a real-leg write half) (75e2663f6)
- **q12**: wire real read_source_forward_acceptance (W7a real-leg read half) (55d999b15)
- **q12**: W7a inc3 — thread on_source_forward_accepted (source.forward→reindex.plan) (79a88618b)
- **q12**: W7a inc2 — thread on_pg_backup_done in production drive loop (pg.backup→pg.restore) (52f545f69)
- **q12**: W7a inc1 — wire production execute_ordinary seam (real ordinary exec) (989dc473f)
- **q12**: structural D4 real-run acceptance oracle (W2-oracle mc2-j58wi) (52881cbce)
- **q12**: run-root staged-values authority for recover determinism (W2-consistency mc2-j58wi) (16e09b67a)
- **q12**: production-gated staged value resolver + run_live fork (W2-fork mc2-j58wi) (df86ebea1)
- **q12**: lift source-snapshot seam to window executor (W3-struct mc2-58tnx) (bc4726c1e)
- **q12**: expose --stop-after reversible STOP-point on live CLI (W4 mc2-dxcaa) (ffb7da5fc)
- **q12**: wire owner-custody forward-resume executor for live/recover (W1 mc2-yz3xe) (636e96346)
- **q12**: rehearsal-probe.sh — bounded server-mechanics probes (GREEN, #21) (1da467bcf)
- **qdrant**: add Q12 R8 custody rehearsal driver scripts (42ee12df0)
- **q12**: GREEN real cutover cleanup-crash recover convergence runner (eb20896f2)
- **q12**: GREEN real crash+refusal composed-recovery leg + crash seam (28cd13dc3)
- **q12**: drive REAL frozen barrier cleanup off activated state + R8-B-1 seam (be305d809)
- **q12**: GREEN R8-B-1 real ProductionExecutor post-activate file-artifact seam (e2f86f77a)
- **q12**: GREEN R8-I-C same-root standalone-supervisor fixture entrypoint (7b1587bb7)
- **q12**: GREEN — generalized Option A recover head-dispatch (R8-I-B) (9da54357d)
- **q12**: journal the post-activate barrier.cleanup segment, run the real barrier child (R8-I-A) (2d61af8a5)
- **q12**: GREEN — pre-flight post-activate wiring gate at the top of live/recover (R5-F fix) (5d3bfdb80)
- **q12**: GREEN — recover mid-barrier refusal names the supervisor operation (R5-D2) (7f758c569)
- **q12**: GREEN — wire operator-reachable live/recover CLI + production fail-closed post-activate gate (R5-F) (bb8f93679)
- **q12**: GREEN — run_recover resumes a crashed forward cutover (R5-D) (320257631)
- **q12**: GREEN — run_live orchestrates post-activate receipt-only cleanup + resume (R5-E) (942da4f62)
- **q12**: GREEN — run_live writes the cutover-window marker (R5-C) (c5bd9f698)
- **q12**: GREEN — run_live drives full forward window (deploy.commit + activate) (1cda05ad7)
- **q12**: GREEN R5 Sub-round A forward final-writer manifest (FWM) (36f43593c)
- **q12**: GREEN R4 Sub-round B real deployed wrapper barrier claims (70ee913a4)
- **q12**: GREEN R4 Sub-round A injectable ordinary-execution seam (292d51770)
- **q12**: GREEN mode-aware quiesce cutover-window precondition (OQ1 W-amendment) (2e84c12b9)
- **q12**: GREEN R3 resource-manifest 2-step binding via shared Engine primitives (acd759b40)
- **q12**: GREEN R2 baseline.json producer + fail-closed client-override seam (a2799ec63)
- **q12**: GREEN R1 live-controller genesis via shared Engine primitives (2b3a14590)
- **q12**: GREEN allowlist a migration-modified pre-existing function (15bae22f2)
- **q12**: GREEN make catalog reg\*-name checks search_path-independent (14725ee2b)
- **q12**: GREEN lift the drill's read-only override before the migration phase (cad61e062)
- **q12**: GREEN repair frontier assertion for MCP-generated history (4a3c99d3d)
- **q12**: GREEN delta-neutral extras in the completeness gate (fbabbab9c)
- **q12**: GREEN dump-stable completeness identities (e95237dce)
- **q12**: GREEN delta-composed live-hash prediction (§2 method correction) (ee70f8ac5)
- **q12**: GREEN preserve equality-diff payloads behind --keep-equality-diagnostics (c06f3a540)
- **q12**: GREEN structural equality-proof diff diagnostics (5ebeeacaf)
- **q12**: GREEN resolve drill/backup tsx via package shim, fail-closed preflight (a1b24302e)
- **q12**: GREEN drill failure diagnostics + scheduled-mode restore (87d2601ca)
- **q12**: GREEN drill generation preflight contract + run-dir cleanup (53b6fccea)
- **q12**: GREEN production seam lockdown + teardown/coordinator hardening (c6ac3a8d1)
- **q12**: GREEN snapshot-coordinated generation for the drill plan restore (e92ec529f)
- **q12**: GREEN production drill-seam consumption for the live plan restore (a8f355f2a)
- **q12**: GREEN §3 role bootstrap before the isolated restore + dump streaming (6a0825fa2)
- **q12**: GREEN opt-in persist-and-handoff seam on restore-supabase-drill.sh (93f01595e)
- **q12**: GREEN live plan restore/migrate orchestration (2b6b16add)
- **q12**: GREEN plan-mode expected-post-migration-catalog builder (28ec3448e)
- **q12**: deliver Phase B GHCR publication + fix publisher live-run defects (ae9ed1d37)
- **q12**: Task 9 D6 real frame envelope + R-handshake join (312a66748)
- **q12**: Task 9 smoke/observation gate evaluator (08fe52560)
- **q12**: D6 assembleInspect 3-point snapshot discipline (DF1) (2e92660b5)
- **q12**: D6 enforce seal-predecision binding in restart authority (43148991d)
- **q12**: D6 rewind validated secret descriptor before mapping (cd1a7fd1e)
- **q12**: D6 production inspect entrypoint + raw-I/O assembly (F1) (5badf18df)
- **q12**: D6 terminal seal predecision binding check (6742b58d3)
- **q12**: D6 revalidate secret identity after read (1aa627ff8)
- **q12**: D6 canonical NFC normalization for cross-stream hash parity (443d87dec)
- **q12**: D6 probe inspect main flow (1772d5420)
- **q12**: D6 Root post-R closure + restart authority (072cc210e)
- **q12**: D6 runtime FD baseline check (8a897a1a3)
- **q12**: D6 Root predecision + terminal seal (8bee62a74)
- **q12**: D6 CLI argv/env/FD preflight (a96e191fd)
- **q12**: D6 Root pidfd + proc identity gates (a94f6417f)
- **q12**: D6 request schema + protocol state machine (5c04d5a3f)
- **q12**: D6 Root posix_spawn boundary + secret revalidation (374b2789f)
- **q12**: D6 writer-ancestry + Docker observation (cc3ec0eea)
- **q12**: D6 evidence H/N validator (867a9889b)
- **q12**: D6 database/host projection builders (b8106d39c)
- **q12**: D6 managed-provider/session projection (fd920c6e9)
- **q12**: D6 common-lock proof harness (41c17a0d3)
- **q12**: D6 read-only transaction and lock proof (7b0c769f1)
- **q12**: D6 read-only capability projection (6d3464c19)
- **q12**: D6 immutable DB/TLS identity checks (5e90adc6c)
- **q12**: D6 read-only SQL projection bundle (1316e93d0)
- **q12**: D6 canonical JSON + frame envelope + hashing (51dae42fd)
- **q12**: ratify W-tuple field 11 managed-session inventory (72af414cf)
- **q12**: freeze the provisional managed-session inventory (W-tuple field 11) (5836927e5)
- **q12**: add PostgreSQL 17 digests to the document-evidence live gate (b8204cde5)
- **q12**: wire file-only CLI flags into both migration entrypoints (554740a21)
- **q12**: route Q12 migrations through file-only client with same-transaction guards (621a29cf0)
- **q12**: add concurrent observability index packet preflight (79c67c303)
- **q12**: quiesce-aware blue/green handoff wrapper (H stream) (3c76e5a25)
- **q12**: add file-only migration credential contract module (7c4c633d3)
- **q12**: make the genesis-rooted joined prefix the sole resume acceptance (609100534)
- **q12**: extend the partial-capture lever window to k in 1..5 (a240df40e)
- **q12**: add sanctioned partial-durable-capture rollback lever to joined composer (1d66bc56a)
- **q12**: joined install-recovery W positives via the D5 chains dimension (6762fe4f5)
- **q12**: joined rollback W positive (clean prefix 4) over the real Root prefix (8d2d32cf9)
- **q12**: route joined W positives through the deployed wrapper (4d14be708)
- **q12**: joined forward W positive over the real Root prefix (02a5c94ac)
- **q12**: real resume-command suffix bindings and mode-bound FWM path (81d7513d6)
- **q12**: joined rollback profiles with dual FWM and closure coverage (47c7c8973)
- **q12**: joined forward composer and W-composition seam (6b7f1f85c)
- **q12**: dual-path final-writer manifests with Root inventory (9c9ca53e1)
- **q12**: serializer primitives for joined composition (5570e7c90)
- **q12**: ordinary-row grammar and segment-aware bindings (140e91123)
- **q12**: closed substitution domain with single authorities (7f8aeab1e)
- **q12**: expand canonical command manifest to the frozen D5J twenty (1817c5e95)
- **q12**: implement retained barrier provenance (c93d766d9)
- **q12**: publish immutable database terminal proofs (d0962bcd9)
- **q12**: make writer quiesce recovery immutable (5f9f7483f)
- **q12**: validate durable resume capabilities (e042ae6cc)
- **q12**: harden writer recovery (5390a2f6b)
- **q12**: add atomic Supabase backup lifecycle (b03e829f6)
- **qdrant**: add exact-sha operator publisher (2ea571efa)
- **ops**: add fail-closed Supabase backup gate (f241621bc)
- **qdrant**: isolate source recovery runtime (a0dbda4d7)
- **qdrant**: wire recovery-bound reindex adapters (db6199d55)
- **evidence**: preserve unrecoverable source outcomes (f9c9964b1)
- **qdrant**: bind reindex to audited source failures (a95d682c5)
- **qdrant**: add audited source recovery workflow (99920025a)
- **qdrant**: add crash-durable source recovery core (cf51722cd)
- **qdrant**: support local staging snapshots (4405cd676)
- **qdrant**: package immutable operator runtime (48cf8378d)
- **migrations**: add approved evidence runner (61802284c)
- **evidence**: activate document evidence in dev (c50d8420c)
- **observability**: add document evidence signals (f40330c42)
- **evidence**: gate live document evidence rollout (0aad2c20d)
- **qdrant**: add self-hosted observability (8d5d39c7f)
- **qdrant**: automate snapshot recovery drills (580748ef9)
- **qdrant**: add secure self-hosted runtime services (bd6237b35)
- **stage6**: retrieve evidence with accepted decisions (968bcc68a)
- **web**: render document conflicts separately (8ee1547ef)
- **stage5**: enrich baseline with document evidence (a53d5ae45)
- **stage4**: resolve document conflicts explicitly (a86caf7a2)
- **stage4**: add complete document evidence preflight (cad3fe752)
- **evidence**: add durable document evidence contracts (31bb27330)
- **qdrant**: add source-driven reindex workflow (22087ba3c)
- **qdrant**: rank hybrid results with formula and grouping (68cad7332)
- **qdrant**: manage versioned collections through an alias (35909b961)
- **qdrant**: define self-hosted collection contract (91ecd1157)
- **career-playbook**: promote judge to v4-flash in llm_model_config, drop dev env override (mc2-m17al) (d5de5968e)
- **career-playbook**: delta re-judge after batch regeneration (mc2-db696.104.3) (d856aff74)
- **career-playbook**: category-based judge severity rubric + regen gating (mc2-db696.104.1) (de74537a3)
- **career-playbook**: persist live-smoke artifacts for A/B comparability (mc2-db696.104.5) (fa88561be)
- **career-playbook**: skip redundant re-judge when regeneration pass made zero changes (mc2-db696.104.6) (9da928021)
- **career-playbook**: route large-context judge calls fallback-first (mc2-db696.104.2) (c588a9d49)
- **career-playbook**: batch regeneration, LLM call telemetry, env-gated judge A/B (mc2-b7zm3) (b2522a05f)
- **career-playbook**: route on rendered prompt tokens + guard model context (d90d0a91d)
- **career-playbook**: compact quality-warnings summary with details modal (980be186b)
- **career-playbook**: show role-guide image in inspector card, not as hero (3bd67c5c5)
- **career-playbook**: add generated role guide images (4e760e9d4)
- **course-gen**: add structure quality guardrails (d9981d3d7)
- **career-playbook**: default bridge courses to auto size (5d5c0b98f)
- **career-playbook**: create course from role guide (baa528b56)
- **markdown**: add fullscreen mermaid zoom viewer (edc7da3ff)
- **career-playbook**: highlight active contents section (d73df6098)
- **career-playbook**: improve e2e output quality (feeaaa3c6)
- **career-playbook**: show honest generation progress (255e5ef5d)
- **career-playbook**: preserve source evidence context (eb127d21c)
- **web**: unify career playbook input UX (36537a5b7)
- **career-playbook**: limit pasted business notes (65eb72365)
- **career-playbook**: persist wizard progress and context notes (84a3f24ce)
- **career-playbook**: add canonical public urls (c021566c3)
- add career playbook visibility access (c22caf99f)
- **web**: implement production document reader shell (0f64fd169)
- **career-playbook**: refine reader mock (4845cf14c)
- **career-playbook**: add reader variant mock (135063643)
- **career-playbook**: process business context sources (90cfc831e)
- add business context intake for career playbooks (2dc0c2644)
- **career-playbook**: expand popular role suggestions (7aafe6f60)
- **career-playbook**: unify library catalog filters (016888804)
- **career-playbook**: resolve functional area smartly (d86fad5d3)
- **web**: add wikidata role suggestion source (c0f957b46)
- **web**: add esco role suggestion subset (260823b4a)
- **web**: redesign home hero with product split (284120f7f)
- **nav**: add two-product course landing (da21e9c25)
- **career-playbook**: inline all demo sections (2646f5662)
- **career-playbook**: strengthen landing hero proof (61a1cd0fe)
- **career-playbook**: widen landing hero layout (f58295f12)
- **career-playbook**: add smooth landing motion (19fbdf541)
- **career-playbook**: add personalized AI landing section (330bd7f6f)
- **career-playbook**: compact landing outline with full structure (1236a36f7)
- **career-playbook**: show 26-block landing demo (2231f219f)
- **career-playbook**: apply document-first milk redesign (8ad41e8a4)
- **career-playbook**: add constructor ui mock variants (f7bdd14a7)
- **career-playbook**: redesign generation workbench (e116f3034)
- **career-playbook**: improve role source and custom answers (b26c4e32f)
- **career-playbook**: expand role suggestions (99786e8ce)
- **career-playbook**: add role title suggestions (7ff4e0903)
- **career-playbook**: route complex phases to DeepSeek V4 Pro (72f773330)
- **career-playbook**: add role description entry (b1d38076e)
- **career-playbook**: add gated live smoke runner (d7324438e)
- **career-playbook**: add admin cost evidence (8c654c1cb)
- **career-playbook**: add smoke preflight harness (f0d482bab)
- add career playbook course bridge (b7619fdbf)
- **career-playbook**: complete generation status transport (84eb6d129)
- **career-playbook**: add PDF export (d4f1176cf)
- **career-playbook**: add library and public sharing (4937251e7)
- **career-playbook**: wire phase b transport (8724687cc)
- **web**: add career playbook landing (4aa5960e4)
- **career-playbook**: add viewer editor frontend (d03ce6706)
- **career-playbook**: add phase b frontend followups (883df2e46)
- **career-playbook**: add phase a frontend wizard (205ebc23d)
- complete career playbook backend phase 3 (e81b35d0c)
- **career-playbook**: add backend generation stage (8e1e07df1)
- **career-playbook**: add phase 1 foundation (7311469c4)
- add 2 source file(s), update 1 source file(s), +1 more (3322535c6)
- add 2 source file(s), update docs (7256a1429)
- **stage6**: surface quality ladder review history (4bff83ba0)
- **stage6**: add quality recovery execution ladder (4fe2561aa)
- **stage6**: add quality ladder contract (4d773acea)
- **orchestration**: add local contract and dev delivery path (ec0b15d93)
- **cli**: add dev delivery command (13a92d34f)
- **jd**: regenerate sales-manager-b2b v2 with 26 blocks + 3 Mermaid diagrams (5e4aa05ad)
- **skill**: add job-description role guide generator (26 blocks) (204e7cf56)
- **course-gen-platform**: add 1 source file(s), update 2 source file(s), +1 more (319976261)
- **stage6**: add centralized sanitizeContent at DB write layer (8ae38f1fa)
- **skills**: add code-review skill, remove old code-reviewer stubs (a8b26f2d5)
- **flashcards**: redesign FlashcardViewer UI with fullscreen study mode (b0a648bef)
- **enrichments**: refactor enrichment system with all 14 types, batch UI, and i18n (1a48587f6)
- **quiz**: unhide quiz enrichment with multi-select, andragogy, and renamed to Квиз (8d8ff721b)
- **ui**: update enrichments UI, course cards, header and viewer improvements (9a6c3f5ce)
- **viewer**: remove max-width constraints so lesson content fills available space (558cf7009)
- **enrichments**: hide audio, video, presentation, quiz from UI (16dff3d5b)
- **enrichments**: replace MindMapViewer with interactive markmap-view (6b1fa6174)
- **enrichments**: temporarily hide nlm_study_guide from UI (ee62cb671)
- **enrichments**: hide regular audio/video from UI, keep NLM variants only (790f1c879)
- **web**: add unique placeholder images for 4 new NLM enrichment types (968e22f3e)
- **enrichments**: add 4 new NotebookLM enrichment types (99e4b1ab8)
- **bridge**: allow parallel audio + video generation per course (17d0ab003)
- **admin**: add NotebookLM Bridge health check to admin dashboard (cd1b23cd8)
- **enrichments**: fix audio/video playback + expose NLM format options (05f35778a)
- **pipeline**: add Redis read-side cache for Stage 3/4 file content (cf49a83e0)
- **pipeline**: add Redis cache-aside for file and lesson content (eb120bd40)
- redesign enrichment cards with unified grid, single-click video, and compact audio overlay (1c8da0623)
- telegram notifications, lesson materials switcher, and media player improvements (970843f19)
- universalize Gastown commands and add /onboard (cfd06b954)
- **stage7**: harden NLM pipeline with local media storage, async lifecycle, and recovery (0eb123e11)
- **stage7**: harden NLM audio/video generation pipeline (ee977019a)
- **enrichments**: add nlm audio/video generation via notebooklm bridge (15e221f43)
- **course-gen-platform**: add notebooklm bridge FastAPI service (6b9289fe3)
- **admin**: add generation trace audit page (2d74244d0)
- tester feedback fixes — CJK patching, header replacement, mermaid wrapping, sidebar descriptions (0c4648bf9)
- **stage6**: add truncation continuation path and reject telemetry (e0de6a59a)
- **stage6**: track actual model usage in traces and metadata (421549390)
- **stage6**: add cache_hit trace event and document edge cases (e1795132c)
- **stage6**: add tier1_pass trace event and max score logging (0b082a4d7)
- **stage6**: add Two-Tier RAG retrieval to eliminate 75% wasted queries (94025ec42)
- **llm**: Gemini caching, config-seed auto-load, code review fixes (adbd29365)
- **llm**: replace all Gemini models with gemini-3-flash-preview (8f5f5d5c6)
- **stage6**: update CLEV judge and delta judge models (7d946ea3f)
- **stage6**: add spelling & typo detection to self-reviewer Phase 2.5 (db34b7366)
- add 1 skill(s), update 5 agent(s), +2 more (eab85dffb)
- **stage4**: migrate phases 1, 3, 4 to PromptService with typed contracts (60791b366)
- **prompts**: add type-safe PromptVariableMap + contract validation tests (a229a7993)
- **stages 4-5**: add pedagogical guidance, optimize prompts, migrate to PromptService (31700d880)
- **stage6**: coherence patcher rejection tests + mermaid pipeline admin monitoring (e7a4e6e67)
- **stage5**: sequential section generation with digest accumulation (8b4187c9e)
- **stage4**: budget-aware Phase 3 truncation + system prompt reserve (65a8da31b)
- **stage4**: wire Budget Allocator to phases + DB-driven model config (ca3bda920)
- **stage5**: add overlap retry loop for cross-section deduplication (5a5426aa0)
- **stage4**: add semantic overlap detection to Phase 2 sections_breakdown (a3458e9d2)
- **stage6**: add course position awareness to lesson generation (22d7d4b70)
- **stage6**: persist lessonDigest and enrich summary_preview from DB (bde4794ac)
- **course-gen-platform**: replace section-by-section with single-call lesson generation (713a7bde4)
- Phase 4 course_nodes flat relational migration with dual-write (06d2d4e46)
- **web**: add Stage 6 content generation CTA for newly added lessons (26dcc3217)
- protect 23 LLM-facing z.enum() with createLLMEnumSchema helper (64f7974b6)
- **chat**: Phase 3 — context optimization with course skeleton (9b342e033)
- **chat**: Phase 2 — surgical operations with stable IDs (0bc0ab498)
- **chat**: Phase 1 — remove toggle, auto-intent classification (1c18487aa)
- **chat**: Phase 0 — stable IDs + chat model config foundation (496daa22f)
- **web**: add 3 source file(s), update 1 source file(s), +1 more (5c155c51b)
- **jina**: replace in-process rate/concurrency limiters with Redis-based distributed versions (4b44804a5)
- add CategoryBadge to ClarifyingPanel wizard + bulk error log cleanup (2de5e069f)
- **logs**: add auto-resolve RPC for stale to_verify fingerprints (d072b7098)
- add Phase 0.5 unit tests + Admin Clarifying Q&A tab (3eab7f54a)
- **stage4**: pass course_description to Phase 1/2 + expand Phase 0.5 clarifying system (8e4ff008d)
- **web**: sync full_name to auth metadata on profile save (5be9305a2)
- **stage6**: pass lessonSpec to LessonInspector Blueprint tab (e8a77ea22)
- **pipeline**: add unified course-level token tracking (96e17a5af)
- **ui**: add token aggregation to ModuleDashboard (013230075)
- **error-handling**: standardize wrapTRPCError with AppError/PipelineError support (9ba3c22e8)
- **shared-utils**: create shared-utils package and migrate imports (6bae0522c)
- **web**: migrate env.ts to @t3-oss/env-nextjs with Zod validation (5f378c59a)
- **course-gen-platform**: add 1 source file(s), add 2 test(s), +1 more (34bbc3e8b)
- 3-tier model routing for Stage 5 based on section importance (b4e301050)
- **web**: audit remediation — bundle-analyzer, ESLint strictness, image optimization (4e65a5519)
- **i18n**: extract hardcoded Russian strings to translation files (Sprint 2) (c7436c8ff)
- **stage4**: swap Phase 1 and Phase 0.5 for data-driven clarifying questions (bd8acf987)
- **web**: show classification_rationale in Stage 3 & pedagogical_patterns in Stage 4 (1a913459e)
- **web**: add 1 source file(s), update 12 source file(s), +1 more (4018e95d9)
- **web**: add 4 source file(s), update 5 source file(s), +2 more (cea20c270)
- **web**: embed Userback feedback widget with SPA support and CSP (28e944916)
- **orchestrator**: add BLOCK_REGENERATION job type and Sentry monitoring (39a1400fa)
- **lesson-editor**: add inline markdown editor for lesson content (9c6b0cf50)
- **generation-graph**: implement NodeDetailsDrawer action handlers (8159b3f39)
- **logger**: add 2 new auto-mute rules for expected errors (3dac341ef)
- **chat**: implement code review recommendations P1-2, P2-2, P3 (55fcf6566)
- **chat**: implement intent classification for chat optimization (02f4e6c51)
- добавлено UI предупреждение о необходимости CORE документа (d2e586993)
- implement remaining code review recommendations (0a05e9d35)
- migrate user preferences to Supabase and add section-expander validation (cd1ea1023)
- **useLessonActions**: add i18n and loading states UI (P2 improvements) (e2e0df208)
- **ModuleDashboard**: implement tRPC mutations for lesson actions (d67e0e7cb)
- implement storage helper for EnrichmentCard audio playback (eeaca5a91)
- **observability**: add ConcurrencyLimiter metrics, tests, and enrichments health check (fd2cc85fa)
- **stage5**: distinguish retryable vs non-retryable errors (356c05521)
- **web**: complete code review improvements for course data updates (26f8d0cad)
- **ci**: implement tiered testing strategy (51ed1866d)
- **admin**: persist log filters in URL params (22c3abf7a)
- **i18n**: migrate CascadeStageDeleteModal to next-intl (041c1037e)
- **skills**: add documentation check to /work skill (fe4f029c5)
- **skills**: add /work skill for task management (8929a270d)
- **clarifying**: improve UX - move skip button to navigation, show continue only when complete (7a678cbbc)
- **course-gen-platform**: add 3 source file(s), update 14 source file(s), +1 more (5c2659aa0)
- **chat**: add inline feedback messages after applyProposal (cabc2458d)
- **benchmarks**: integrate SampleContentViewer into ranking table (33852eda4)
- **benchmarks**: implement test-model command and sample content viewer (c4e20307e)
- **benchmarks**: add point-based scoring methodology and LLM quality tester skill (36ae4dfd1)
- **benchmarks**: add scenario/date filters and expandable rows (88f6b2a7a)
- **web**: add public /benchmarks page for LLM model rankings (5040c0174)
- **refinement-chat**: add default mode selection and tooltips (ce5b462af)
- **prompts**: add forbidden_patterns section to stage6_serial_generator (9291e9ffc)
- **chat**: implement remaining code review recommendations (b206394cf)
- **chat**: implement Confirm-then-Apply flow for Stages 4, 5, 6 (71ea03cc1)
- **admin/logs**: add course column to grouped view (1a0d26847)
- **logger**: add auto-mute rules for expected errors (5156208b3)
- add 1 skill(s), update docs (4a19c5fa7)
- **clarifying**: implement Wizard UI layout for Stage 4 (5d9eb81eb)
- **mocks**: add theme toggle and AppThemeProvider support (f10ca61b6)
- **clarifying-redesign**: add mock comparison page for Stage 4 UI redesign (427c85427)
- **trace-logger**: add logTrace() to Stages 1 and 3 for Admin Monitor visibility (441fe4758)
- **lifecycle**: add logTrace for Stage 2 skip path (d3707e827)
- **clarifying**: add custom input for single/multi choice questions + MissionControlBanner clarifying mode (eaf620f6f)
- **clarifying**: add ClarifyingBanner component with progress tracking (b23ebec4e)
- **db**: add race condition fix, GIN index, and rollback migrations (5e2a57fe0)
- **clarifying**: add multi-type questions support (open, single_choice, multi_choice) (c4af76e35)
- **errors**: implement pipeline error class hierarchy (4d05f0ef9)
- **web**: add clarifying questions info to StageResultsPreview (970f558d3)
- **backend**: add dev:worker:stage6 script for Stage 6 worker (e0bccac07)
- **stage4**: add self-reflection auto-answer in automatic mode (3e3a4db68)
- **stage4**: Phase 0.5 security and reliability improvements (c01b6a261)
- **stage4**: implement Phase 0.5 Clarifying Questions (ba3772ed9)
- **chat**: require intent selection before send + Stage 6 inline editing (9b357284c)
- **stage5**: make tier1 and escalation models configurable via admin panel (84906fe83)
- **i18n**: add i18n support for quick action prompts in GlobalCourseChat (b689b4e0c)
- **llm**: upgrade stage_4_expert, stage_4_synthesis, stage_5_metadata to KIMI K2 (23bc014fb)
- **routes**: migrate course URLs to /courses/{org}/{course} (fe67d25d9)
- **chat**: replace keyword classification with explicit UI mode selection (f3b1f72b4)
- **chat**: add authenticated Supabase client and rate limiting (4f018038e)
- **chat**: add conversation history to LLM prompts (d22c95069)
- **form**: add frontend validation limits for course creation (29353d5ab)
- **course-gen-platform**: add 1 source file(s), update 3 source file(s), +1 more (ed7216897)
- **types**: add TypeScript types for GenerationProgress (f4a8809a1)
- **stage3**: auto-assign CORE priority for single document (42002fa88)
- **web**: add navigation to lessons page (Toolbar + Sidebar) (c5d42def0)
- **cover**: switch to 21:9 cinematic aspect ratio for lesson covers (a3a61694c)
- **web**: expand rotating status messages with type-specific content (f83088367)
- **web**: smooth image loading with skeleton placeholders (6f8e32564)
- **enrichments**: fix cover/banner generation UX - show variant selection at draft_ready (726361346)
- **web**: improve EnrichmentGeneratingCard with shimmer and rotating messages (c9c90a184)
- add asymptotic crawl to useSmoothProgress hook (4d8077240)
- add Next.js rewrite for local enrichments proxy (8a33beecc)
- **storage**: add unified storage service with auto-backend switching (b66428110)
- **scripts**: enhance migration script with safety features (fe705d556)
- **storage**: migrate enrichment images from Supabase to local storage (6a1dedac5)
- **logger**: add type guards, discriminated unions, and usage guide (e58352551)
- **logger**: add centralized domain-specific logging architecture (30ca0313d)
- **enrichment**: add grayscale placeholder with hover color reveal (65e810aa1)
- **lessons**: add progress card to lessons page header (21369b381)
- **#14**: add parameter flow dashboard with real-time updates (c2fca34b3)
- **lessons**: add course lessons page with cards grid (7b72d6cb7)
- **#16**: add course edit history for diff view (2876195a5)
- **demo**: add placeholder vs generated comparison page (c03bd01e8)
- **logging**: add parameter tracking and validation logging (#12, #13) (3b9582ff5)
- **a11y**: implement keyboard navigation for generation graph UI (10c7df485)
- **skills**: add /process-issues skill for GitHub Issues workflow (9da821d7d)
- **types**: add Zod validation for AnalysisResult type (a8b758bc1)
- **enrichments**: unify placeholder cards to Hover Reveal style (9fbcd8110)
- **pipeline**: pass user-edited params between stages (b1a6135e5)
- **file-upload**: implement tier-based file limits with upgrade suggestions (980aa921e)
- **ui**: add glassmorphism for course cards with light/dark theme support (e3e4e87e9)
- **visuals**: add lesson card (1:1) generation to Media section (f96facc57)
- **courses**: integrate course cover images into UI (29e13d46f)
- **redis**: add graceful shutdown coordination with BullMQ workers (1f561c790)
- **scripts**: add full lesson A/B test with Mermaid generation (19972483d)
- **db**: add trigger to auto-reopen resolved errors on recurrence (8a93a113a)
- **scripts**: add validation script for existing lesson content (aadeabefd)
- **scripts**: improve A/B test script for lesson generation (d8ce70ff7)
- **stage6**: comprehensive content quality validation (6cc61b2ce)
- **llm**: Add hardcoded fallback for Model Config Service (f0c7dbdbf)
- **logger**: Add auto-mute rules for deploy-related errors (2b7b41026)
- **web**: persist all form settings to localStorage (cd8e90c60)
- **web**: replace upload progress bar with fullscreen overlay modal (2d6d53ce8)
- **web**: add file upload progress bar on course creation (ff7d9db6b)
- **web**: add 5 source file(s), update 8 source file(s), +1 more (04cfd02e8)
- **create-course**: reorganize UI/UX for course creation form (5da5906bf)
- **i18n**: add image generation translations for enrichments (59020e3a4)
- **image-gen**: add quality parameter for GPT-5 Image Mini cost optimization (f398930e7)
- **stage6**: add person and case agreement grammar rules for Russian (cc80eb5d2)
- **stage6**: route auto-approval jobs to dedicated queue (e67470ff4)
- **stage6**: activate dedicated queue with 30 concurrent workers (d0a5bca31)
- **course-gen-platform**: add 1 source file(s), update docs (697998d0a)
- **stage5**: dynamic min/max lessons validation from course_size presets (ea5e3feff)
- **course-gen-platform**: add 1 source file(s), update 2 source file(s) (4bc2c4295)
- **course-gen-platform**: add 1 source file(s), update 8 source file(s), +3 more (f3e11ef64)
- **stage5**: remove redundant fields to save ~10K-15K tokens per course (e019f7d3c)
- **stage5**: add auto-approval support for automatic generation mode (faaf9737f)
- **course-gen**: add E2E test for automatic mode express generation (8b74178c1)
- **auto-approval**: add case 6 for Stage 6 lesson content generation (9e7056db1)
- **processor**: add bundle monitoring, health check, and docs (181acb115)
- **logger**: add auto-mute rules for job lifecycle warnings (3e78afe39)
- add 1 agent(s) (8da046206)
- **GenerationProgress**: auto-start generation in automatic mode (23bf58210)
- **generation**: merge automatic and semi-automatic control panels into unified MissionControlBanner (35996fb48)
- **course-viewer**: add deep-linking, breadcrumbs, and server progress sync (28bfe9ad5)
- **orchestrator**: add processor health check, TTL timeout, and Stage 6 JobResult wrapper (f96e69159)
- **course-gen-platform**: add 1 source file(s), update 1 source file(s) (08df8ec62)
- **ui**: add missing user settings to Stage 1 Input Tab (073c58b41)
- **export**: implement module lessons export as Markdown (667afc00f)
- **db**: add trigger to auto-sync fingerprint in log_issue_status (902827bf7)
- **logging**: add auto_muted status for expected errors (3d157d43d)
- **lesson-approval**: add migration and tests for batch approval RPC (e87a9a2f1)
- **stage4**: add course_description and learning_outcomes to analysis input (05555af4b)
- **admin**: add error log grouping by fingerprint (5f5a4aa71)
- **generation**: добавить difficulty в Stage 5 FrontendParameters (7b955f3e8)
- **enrichments**: add optimistic UI + improve error messages (1eab0ecb4)
- **pipeline**: add language support to Stage 4-5 model selection (19729ca77)
- **logs**: add full-text search for similar problems v1.5.0 (4edd3388a)
- **skills**: add process-logs skill for automated error log processing (c54f2c08a)
- **logging**: enhance error logging with full diagnostic context (e1c69ca39)
- **admin-logs**: show course name and workflow link in logs table (2cb510798)
- **course-size**: add 'micro' size option and show lesson ranges (26d61a79d)
- **logging**: add generationCode to worker logs (17453114b)
- **styles**: add 7 new course styles (2ff100c00)
- **monitoring**: add Telegram bot health check to admin dashboard (e32c81ce9)
- **telegram**: add webhook handler for bot commands (508687e5e)
- **profile**: add Telegram notification settings section (35f75a3f7)
- **shared-types**: add i18n UI labels for CourseSizeSelector (c6f37c782)
- **web**: add form validation for courseSize/estimatedLessons dependency (4a041b855)
- **course-size**: add 'auto' option as default selection (d34fe1b48)
- **course-size**: add course size presets (mini/compact/standard/comprehensive) (7f9196191)
- **course-gen-platform**: add 2 source file(s), update 7 source file(s), +1 more (db80d4b7c)
- **graph**: add readOnly prop for automatic generation mode (dd03afcf8)

### Changed

- **career-playbook**: split the live-smoke fixtures at the lint budget (0ceda69e6)
- **career-playbook**: the ramp owner is read off the document, and the scope is a measurement (450299dfd)
- **prompts**: split the career playbook prompt file at the lint budget (88df445c3)
- **prompts**: split block regenerator prompt (95a89c1a2)
- **cost**: the catalogue holds what can be called, not what once was (eeba1a953)
- **cost**: drop thirteen catalogue entries nothing was ever charged for (2be011361)
- **prompts**: five Stage 6 prompts nothing has rendered since the rewrite (45e5fe90d)
- **models**: one table decides which model a phase gets (3cb14ffb6)
- **llm**: a price table nothing read, next to a registry routing uses (612bee38c)
- **stage4**: the last two warnings, and the guard lesson they taught (02c5ebce6)
- **stage4**: the document-evidence phase is a pipeline, not a helper (31f19eef0)
- **stage4**: conflict detection had three subjects in one file (2c6165807)
- **stage4**: the evidence preflight becomes its sequence (21b4a3794)
- **stage6**: the judge's trace row, and one refinement task loop instead of two (d7934c992)
- **stage1,routers**: name the steps, and say what each failure means (20434938e)
- **stage7,stage5**: a card prompt, and three scores that were one function (551dd55af)
- **stage7**: one poll scheduler, one image-format reader (adf310d14)
- **career-playbook,stage4**: split two files by subject, and unblind a guard (d18c151b3)
- **stage6**: break up the job processor — complexity 97 and 55, both gone (ba079ef84)
- **stage6**: the two RAG tiers were running two copies of the same loop (27b505bbb)
- **stage6**: separate "is this lesson saved" from "is this course finished" (a647d2ebf)
- **stage6**: executeStage6 was forty null-defaults wearing a function (80c3e8120)
- **stage6**: split the mermaid fix pipeline into its stages (aefb2a34b)
- **stage6,intent**: a copy table and an extracted duplicate, -2 complexity warnings (a881bb4f5)
- **lint**: re-derive the length and complexity thresholds from this repository (325db2b89)
- **llm**: keep the lint warning budget while adding provider routing (0664c7b07)
- **stage2**: take the course before the model in the title call (57ca8ed17)
- **llm**: drop the stage-level config layer, which had nothing to read (e18fccc88)
- **llm**: move the cost callback out of langchain-models (61c90db10)
- **llm**: give models and prices one source instead of four (55c7d3334)
- **stage5**: centralize structural quality state (1e4caad9f)
- **q12**: extract drive_forward_tail + stop_after seam (behavior-preserving) (f41a20577)
- **q12**: R2 drives the manifest tool via the real host client (Option B) (da5b172a1)
- **q12**: thread per-fixture runId/runRoot through composeWriterFixture (ec1207f7c)
- **career-playbook**: extract canonical-topic and deterministic-check modules to restore lint budget (19e6d8c38)
- **career-playbook**: single source of truth for fillable-placeholder predicates (c9131e6f4)
- **career-playbook**: reuse shared model/token helpers + add pricing health check (3fa152551)
- **migrations**: tail-drift watermark logic for drift gate (72a4ed862)
- **stage6**: split single-call generator helpers (362adae3a)
- **stage6**: unify all lesson enqueue paths through canonical helper (09824d1d7)
- **shared-types**: extract CONCLUSION_HEADINGS to shared constant, remove legacy code (994ebb7af)
- **course-gen-platform**: split 4 files >800 lines into extracted modules (Batch 1) (fb7281c71)
- **course-gen-platform**: split large files to reduce max-lines warnings (dc0d56155)
- **course-gen-platform**: split notebooklm-bridge-client.ts to fix max-lines (06b20cd40)
- **course-gen-platform**: split model-config-bunker.ts to fix max-lines (aa98f295f)
- **course-gen-platform**: split phase-0.5-clarifying.ts to fix max-lines (550b92a22)
- **course-gen-platform**: split generation-phases.ts to fix max-lines (e934c87e6)
- **course-gen-platform**: split stage6-prompts.ts into individual files (08d49ad50)
- replace console logs with structured logger in web and shared-utils (d57e79757)
- **course-gen-platform**: replace console logs with structured logger (aeaceab39)
- **stage6**: replace LO-code IDs with numbered format in prompts (9f5978874)
- extract shared utils/logger, enrichment card overlay UX (26403e775)
- **skills**: remove code-review-inline orchestrator (169138691)
- **enrichments**: extract buildStandardSources helper and add flashcards strict schema (9da912a87)
- migrate 48 router files to shared throwOnSupabaseError utility (c786d2d3b)
- **stage6**: consolidate helpers, extract FSM transition, batch section queries (a5659b96e)
- **stage6**: code review improvements — DRY, logging, readability (553c0e36b)
- **stage5**: extract shared buildFallbackSearchQueries + add Stage 5→6 integration test (77450b7e0)
- **stage4**: remove dead logDuplicateKeyTopics function (8aaf60048)
- **web**: extract shared toActionError, replace Russian strings, use client-logger (952354b53)
- **web**: remove 25 as-any casts from tRPC-migrated server actions (8847de102)
- code review tech debt — DRY model constants, ModelConfigService migration, startup validation (870e1351b)
- split 5 largest files into modular structure (5432cfc4a)
- split prompt-registry.ts into per-stage modules (e0d8f76ff)
- **dry**: extract completePhaseWithTrace, getErrorMessage, progress constants (63953e304)
- **lint**: structural batch 3 — extract 14 top-warning files into helpers (158→119 warnings) (0aede0526)
- **review**: implement code review recommendations — type safety, constants, docs (a646b497a)
- **lint**: structural batch 2 addendum — split phase-2-scope + phase-6-summarization (8 warnings fixed) (b134094c6)
- **lint**: structural batch 2 — split 7 large files (30 warnings fixed) (6f6098890)
- **lint**: structural batch 1 — split 3 largest router files (18 warnings fixed) (f03e11252)
- **stage4**: remove dead Phase 6 RAG Planning code (4a90db360)
- remove dead code InitializeJobHandler (mc2-qt9i) (f4c551ace)
- **api**: split lifecycle.router.ts into lifecycle/ subdirectory (a5fac1c92)
- **web**: consolidate validation-utils.ts into validation.ts (5722ed58d)
- **shared-utils**: narrow normalizeLanguageCode return type, remove unknown code passthrough (9b7364be3)
- **shared-utils**: code review improvements — named constants, JSDoc, fallback param, tests (f91ba669b)
- consolidate formatNumber, formatFileSize, sanitization configs to shared packages (fa9e3f36f)
- **course-gen-platform**: replace `as string` assertions with getTextContent() for LangChain messages (7a1441abb)
- remove dead complexity/criticality scoring from Stage 5 (53736cb23)
- extract regex to PATTERNS constant, add SSOT JSDoc, fix lastIndex bug (316dea7d7)
- migrate tRPC architecture to @trpc/react-query with typesafe hooks (d3b7293eb)
- remove Bloom's Taxonomy dead code, replace with prompt guidance (4b0a0ae3d)
- remove pedagogical_patterns field entirely (e206e9f46)
- **stage4**: remove dead expansion_areas from Phase 3 (da7c11fc2)
- **stage5**: remove dead practical_exercises and assessment_strategy fields (a588388de)
- **stage4**: move Visual Style to accordion, remove deprecated Document Relations (0a1549a13)
- **pipeline**: remove dead content_strategy field from analysis_result (4ab84356f)
- **chat**: extract getUpdatedFieldsForProposal helper function (881893a47)
- **stage4**: move suggested_answers normalization to Zod z.preprocess() (3a82b6baa)
- **chat**: use PAUSABLE_STATUSES for generation blocking (11cbc40d2)
- **web**: standardize logging and add structure change detection (L2, M3) (503ace637)
- **clarifying**: simplify to 1 round, increase max questions to 14 (9df46f903)
- **prompts**: soften cliché prevention approach (c72870900)
- **clarifying**: code review LOW priority improvements (6cb1ccd0f)
- **clarifying**: simplify QuestionCard styles for minimalist design (45bdad8b6)
- **stage5,stage6**: use unified safeJSONParse for LLM output (73d45f696)
- **web**: P3.3 migrate i18n from GRAPH_TRANSLATIONS to next-intl (fb14cfa46)
- **hooks**: extract useFieldStatusTracking and useCascadeStageDelete (1536ddc72)
- **chat**: code review improvements - type guards, constants, utilities, a11y (8a8d0b40a)
- **chat**: configurable fallback model and extract magic numbers (12cc85345)
- **locks**: extract lock pattern to shared utility (9596eb123)
- **cover**: remove two-stage dead code from CoverPreview (da4f2db49)
- **enrichments**: simplify cover/banner to single-stage generation (65d3caa5e)
- improve enrichment handlers and add nginx rate limiting (6b8a2119e)
- **validation**: improve logging and type safety in validation-orchestrator (5af1f5d76)
- **enrichment**: unify all 6 cards into single grid section (5b074bcfc)
- **enrichment**: split UnifiedEnrichmentCard into subcomponents (473e51076)
- **enrichment**: P3 improvements - extract LabelWithTooltip, use type guards (71c2c5a32)
- **stage4**: remove Phase 6 RAG Planning (5a3224b8d)
- **web**: unify toast notifications to use Sonner (db99a5b07)
- **create-course**: reorganize form with GenerationSettingsSection (2cd02ae0a)
- **stage4**: remove conflicting pedagogical_strategy fields (aabdd991e)
- **stage4-5**: eliminate over-engineering and fix bugs (cf317d4ed)
- **ui**: DRY Stage2Group with utility functions + accessibility (36dce453a)
- code quality improvements from review (P2.4, P3.2-P3.6) (bd3e761f7)
- **logging**: address code review findings for auto_muted (4f48fd80a)
- **stage4**: remove unused answers field (96519f5d6)
- **target_audience**: unify data source to courses.target_audience column (226110992)
- **llm**: add actualLanguage tracking, LanguageCode type, language detection (870ff8df6)
- **stage6**: modularize lesson-rag-retriever.ts (cd1128dc1)
- **stage6**: modularize orchestrator.ts into nodes and helpers (fdd6211e3)
- **ui**: move generation mode to advanced settings section (bcda55ef7)
- **stage6**: address code review findings for style propagation (48567b37b)
- **styles**: reduce course styles from 19 to 12 (42378eefe)
- **profile**: simplify Telegram connection with Login Widget (d8afe74c5)
- add lightweight throughput guidance (7599308f8)
- add token-efficient orchestration defaults (11656a205)
- **backup**: hash rows, then sort the digests, instead of sorting the rows (mc2-0rj7i) (3e14f3a55)
- **build**: minify sandboxed processor bundle under 2.5MB CI gate (mc2-smsjx) (567187cda)
- **model-config**: cache-first tier resolution for token-aware phase routing (70e3b87ad)
- **db**: database health cleanup — reduce size 391→153 MB and optimize egress (f1ed43edd)
- add Redis LLM cache, optimize API queries, parallelize retry (166d5b059)
- expand optimizePackageImports with all Radix UI + framer-motion (99e35ee2b)
- **export-lessons**: optimize DB query with lessons_with_latest_content view (6ee9ba765)
- **admin**: optimize get_grouped_error_logs RPC statement timeout (4a796a809)
- fix CPU/memory issues in course generation page (46a601cdc)
- **template-whitelist**: optimize Helm function matching with Set lookup (7901734ab)
- **course-viewer**: open course in new tab for instant navigation (cfd474dcb)
- **stage4**: parallelize Phase 3 and Phase 6 execution (c1d4da90b)

### Fixed

- **release**: a five-month gap breaks the tag, and fills the changelog with delivery noise (311da557f)
- **stage6**: forbid the serial generator from retelling its previous context (5d18decdb)
- **stage6**: drop the heading a truncation continuation repeats at the seam (126df47c3)
- **stage6**: two headers of one numbered series are siblings, not duplicates (b6892c66f)
- **deploy**: compose never reads env_file, so every call needs --env-file (e8e2fdf0f)
- **ci**: a secret that never existed wrote an empty value over a good one (c112940b1)
- **career-playbook**: a shape two paragraphs share on purpose is not a repeat (7e6163493)
- **career-playbook**: the leak detector learns the mood it did not know (c626b6d8d)
- **career-playbook**: a red flag may say how long a symptom has to last (3975fe809)
- **career-playbook**: the proofreader is handed the sections it kept miscounting (d4087c9bb)
- **career-playbook**: the proofreader's findings reach the row it was paid for (e4d2ee640)
- **career-playbook**: block 23 reports a training record, it does not set a policy (d6f0d308e)
- **career-playbook**: the digest hands the model facts, not writing rules (07a7725d7)
- **q12**: re-pin the migration manifest for the proofreader routing change (e985c2610)
- **llm**: the endpoint pin now knows what the call is asking for (e9f96cf4d)
- **career-playbook**: the proofreader asks for its verdict, and a metric reads its own number (f7249d94e)
- **career-playbook**: the checks read a Russian guide, and the ramp block is readable in the form it is written (15b8e64a9)
- **career-playbook**: the FAQ points at a block without narrating that it is pointing (ae0dbfb83)
- **career-playbook**: the ramp finding names no owner block, because the derivation elected the wrong one (eb88046a1)
- **career-playbook**: the route into the regenerator sees the reserve, and the FAQ stops publishing the ramp (4e71d12ab)
- **career-playbook**: the research the run retrieved reaches the ledger, and a full stop separates (cf74f62f0)
- **career-playbook**: a named research house needs a source, and the FAQ stops copying the ramp (87522e960)
- **career-playbook**: the live smoke opens the page instead of asking a query (8dcfdcdbc)
- **markdown**: keep the eslint directive above the any it suppresses (b2c0f7382)
- **markdown**: a red band is a ceiling, and MDX read it as a tag (da92fc620)
- **career-playbook**: two checks blamed a block for writing what the ledger says (980d47ad4)
- **career-playbook**: the judge stops overruling checks that own the question (ff1d6d678)
- **career-playbook**: the publish checklist now names the numbers it never could (b28663b77)
- **career-playbook**: two contract checks billed a regeneration for a correct sentence (4ec3bf1f7)
- **career-playbook**: a bracket in reader-facing prose is a placeholder unless it is markdown (64ae37652)
- **career-playbook**: the calibration table wrote the unfollowable pointers itself (3b81ac197)
- **career-playbook**: the cost ledger records which tier served the call (fa152c385)
- **career-playbook**: the judge may not call the contract's own marker a placeholder (8fb17f578)
- **career-playbook**: the guide's consensus decides a rhythm, not whoever spoke first (4b82731c9)
- **career-playbook**: the cadence ledger degrades, it never aborts a spec (24f269230)
- **career-playbook**: give rhythms an owner, so a disagreement can be repaired (da73e2c7f)
- **career-playbook**: report the repetition, keep the document and the bill (76ab44e96)
- **career-playbook**: carry one line across, written for this block's readers (bd2055393)
- **career-playbook**: a block may only point at a block its reader was given (9e8d96359)
- **career-playbook**: make the digest collect what it claims to collect (f27b227e9)
- **career-playbook**: spend the prior-blocks ceiling once per group, not once per target (7df7fc2d8)
- **jina**: cap the 429 wait per call instead of per batch (889cd7d22)
- **career-playbook**: let the acceptance measurer read production, not a copy (219da3036)
- **career-playbook**: rewrite do_not_repeat directive as an ownership map (b8b622205)
- **career-playbook**: stop scoping contradiction guards by audience (24f2f5e45)
- **career-playbook**: teach the cross-block judge about audiences (239397ed2)
- **career-playbook**: ask the executor whether the semantic gate can still be fixed (6b4499762)
- **role-guide**: fail closed on final repetition (bf7de071f)
- **career-playbook**: copy viewer audience metadata (a5bf8c7d4)
- **career-playbook**: preserve audience scope in regeneration (6a44cc685)
- **career-playbook**: close repetition gate gaps (7d4f2d7fe)
- **career-playbook**: separate baseline and evaluation cohorts (55e39060c)
- **career-playbook**: checkpoint semantic baseline run (e1cd17b6e)
- **cost**: the price sync also needs the workspace packages built (c41c78f09)
- **cost**: the nightly price sync had never delivered a rate (ad7571a3f)
- **ci**: read the metrics group from the host, not from a secret that isn't there (253095758)
- **ops**: mounting the metrics directory is not the same as being able to write it (361264108)
- **stage6**: a gate the whole output fails is not selecting anything (ebea0dc6f)
- **ci**: the dev deploy did not write the variable its compose file demands (47ede80d4)
- **ops**: an alert that aggregates bare cannot say where it came from (20f7eeed1)
- **llm**: the configured timeout reached nothing, and was too short anyway (8d20c3c77)
- **ci**: the seed drift check excluded the phase it should compare (6a9916d88)
- **models**: the phase enum named three phases twice (74941bd66)
- **models**: the phase-name list disagreed with itself in both directions (0dad37594)
- **llm**: prose no longer falls back to the model it was taken from (24d14edd6)
- **cost**: the drift gate could not check the model I had just added to it (19da054fd)
- **images**: the banner ignored its own routing row, and never asked for flex (a37c2751a)
- **llm**: an escalation that went down instead of up, for English only (602c4c075)
- **llm**: the display name beside the model id still said Luna (eee4262a0)
- **ops**: the Q12 asset manifest still pinned the old bridge healthcheck (4268a8e7a)
- **llm**: Stage 6 goes back to luna; the live run measured a stale container (ca56f7458)
- **llm**: the probe cited a bead id that does not exist (563534e0b)
- **ops**: the bridge healthcheck never asked the bridge anything (27790d81d)
- **stage4**: a bound that vetoes our own arithmetic (2e7650f94)
- **cost**: what the wider gate found on its first run (167e8ca50)
- **cost**: the drift gate now asks the code what it can route to (dc1143978)
- **cost**: an unpriced model is not a free one (b076d0667)
- **stage4**: the sentence that killed the course was ours, not the model's (25ccc4426)
- **cost**: the callback already held the key, so it collects the charge (01e03b984)
- **cost**: the guard already had the body open, so it keeps the charge (8f0014d37)
- **cost**: OpenRouter already said what the call cost, so record that (1b6aefc97)
- **cost**: estimate from the endpoint that will bill it, not the mainstream rate (7737acf8e)
- **pricing**: two catalogue rates had drifted, and max_price now bites (d96254fb6)
- **llm**: batch was priced against a call we stopped making (0b9afe173)
- **stage4**: the prompt told the model those fields were "unknown" (f94028b92)
- **scripts**: the dev-run reporter asked courses for a column it does not have (5d55a93c1)
- **llm**: provider routing never left the envelope it was posted in (31a9035bd)
- **notebooklm**: gpsoauth would have left by the wrong door — add PySocks (5e5decea5)
- **notebooklm**: the image cannot re-mint its own cookies — add the [headless] extra (52a72a5d7)
- **ci**: name the branch that moves `:latest`, and run the pre-commit suite (7a06a533a)
- **q12**: the manifest generator printed like a deletion, and the dead venv is gone (0cd6522c1)
- **shared-types**: restore generation-metadata.ts, which the previous commit overwrote (95f394791)
- **lint**: close the ten type-safety warnings, and make the count a ceiling (ed5d539e8)
- **precommit**: lint each staged file with the config its package actually uses (35261d188)
- **web**: the test suite could not parse JSX, so half of it never ran (3df4831ef)
- **notebooklm**: the bridge could not save a refreshed cookie, and its alarm measured the wrong one (e2c55c19c)
- **stage4**: the evidence fallback was given fewer tokens than its answer needs (7dbbdfc5d)
- **ci**: a deploy that goes quiet for five minutes must not lose its session (fcbf86ac1)
- **qdrant-offhost**: retention is one number, and the two copies of it disagreed (fe95095d6)
- **docling**: one version in four files, and now something checks it (c612965a8)
- **prompts**: put the seven stale rows back in line, and judge braces by the template (205f311d2)
- **courses**: the delete that never cleaned up, and two copies of the one that did (eee405d2d)
- **cost**: reconcile against our own generation ids, and a wait Node was free to abandon (0774e17a5)
- **logs**: three warnings, and the nine-month-old prompt row one of them named (7d56ae82b)
- **routing**: the playbook's prose groups go to Luna, on a measurement (2e01e0b02)
- **logs**: two warnings that fired when nothing was wrong, and the playbook A/B (a0a941dfc)
- **career-playbook**: make the catalog card a link, and stop the E2E setup lying (ec56d5d53)
- **routing**: the last-resort path named models the team had stopped choosing (ce55310d7)
- **guards**: three mechanisms existed and nothing ran them (c82a3681b)
- **routing**: a row carries the model twice, and the second copy stayed on DeepSeek (d179a18d0)
- **routing**: the lesson body goes back to Luna, and the model id stops being retyped (c60069a44)
- **judge**: counting words by whitespace is not language-agnostic (9fc838d9d)
- **prompts**: a refined constraint the model cannot see is one it cannot meet (02dc0ef2a)
- **stage4**: enum values are identifiers, and the prompt now says so (1fe476b3b)
- **stage4**: the same Latin-calibrated minimums, one stage earlier (90a2e059f)
- **stage5**: a Chinese course could not pass validation at all (8ebc95dcb)
- **stage7**: the two image rows in llm_model_config are now actually read (589346144)
- **i18n**: two ways a non-ru/en course was checked and budgeted wrong (19102c39b)
- **llm**: a 200 with no completion now says so instead of tripping the parser (4f73da754)
- **stage6**: the automatic path named a document that does not exist (5c79bdd46)
- **stage6**: the one empty-RAG path that said nothing now says what happened (bde28f46e)
- **nlm-bridge**: a name is not a route, and a floor is not a version (1a56006e2)
- **stage6**: a null the model wrote for "nothing here" cost the whole review (cd9b60138)
- **images**: the cost-exempt mark has to sit next to the call it exempts (369346c05)
- **llm**: the reasoning floor moves to the transport, where a clone cannot drop it (7a754ab01)
- **cost**: a stage summary stops carrying a price, and the playbook stops forgetting what it spent first (7c80e479c)
- **routing**: name the endpoint before the call, because a hung one never names itself (a15439a33)
- **cost**: two Stage 5 transports join the instrumented one, and a failed picture leaves a row (5648337e6)
- **cost**: the receipt was dropped by a clone, and Stage 4 rejected its own output (1107fb4bf)
- **cost**: the settled-price counter was reading a column nothing writes (7d40e5a45)
- **cost**: the last invented price, and the alias that moved on its own (2390f3917)
- **llm**: wait for the generation record instead of guessing when it lands (37ecd2047)
- **llm**: price calls from the provider and route around whoever failed them (fe8f40b54)
- **ops**: run the disk metrics publisher through bash, not directly (05a0ee317)
- **migrations**: make the drift gate see the whole history, and the storage quota move (a504d4546)
- **cost**: let the restart, the ledger and the zeros tell the truth (4baa77277)
- **cost**: give editing a stage the database will actually accept (eb939d21f)
- **cost**: record a call that was paid for and produced nothing (c554da79c)
- **cost**: price the model the provider served, not only the one asked for (2d92e1e89)
- **cost**: hand self-review the course it is reviewing (039171247)
- **stage6**: make the progress validator say which field it rejected (ba6eb9d37)
- **cost**: close the remaining unpriced calls, and post a guard (85dbe46ae)
- **quiz**: let a model say "no time limit" the way JSON says it (0b27c9f6f)
- **cost**: put the price of a generated picture where the total can see it (b95202cb2)
- **cost**: charge lesson review to the lesson it reviewed (8ff237ba4)
- **cost**: make writing a lesson pay for itself (cc2156849)
- **stage7**: charge enrichment calls to the course that ordered them (857c3f05e)
- **llm**: fix every request refused for mandatory reasoning, not just the first (6695e33b0)
- **stage6**: stop telling the judge a lesson has no examples (f90e3cd32)
- **logging**: stop dev logs from calling themselves production (d1086bb9c)
- **llm**: learn from a model that refuses to stop thinking (91ac844e0)
- **stage6**: say which field made a judge answer unreadable (2f6026787)
- **observability**: repeat what the database said, and name the unit a reduction lost (88fcd1d60)
- **cost**: count what Stage 6 and Stage 7 spend against the course (015f05afe)
- **stage4**: spend the retry budget on a mapping that drops a claim (f05fd9435)
- **orchestration**: let go of the course before handing it to the next stage (601e6c6d4)
- **stage5**: judge a structure against the profile it was built to (9cbaa8114)
- **stage5**: stop sending ten kilobytes of JSON through a URL (540dba092)
- **stage4**: let automatic mode answer its own questions, and bill in the units the column stores (d578c24a2)
- **llm**: ask for the least reasoning where none is refused (cdb89f558)
- **stage4**: stop conflict detection failing over a wrapper, and say why when it does (87e42f17a)
- **stage4**: read a score the model wrote as text (9d6043d34)
- **stage4**: keep the coercion inside the lint budget (41e8e9a3e)
- **stage4**: stop a course failing over the shape of a word list (1fa79ca8b)
- **cost**: bill a batch lesson's corrective retry at the price it ran at (cfe829987)
- **test**: give the real-controller suites the budget their work needs (6b93d024f)
- **cost**: split a batch price by what each lesson is worth (24a4f5212)
- **cost**: price glm-5.2 from the catalogue, not from one provider (edb6f9dd4)
- **test**: synchronize the Q12 lock contender (92ed3ac0c)
- **cost**: refresh OpenRouter model pricing (545cc3f85)
- **test**: keep WSL unit temps on the Linux filesystem (1f62a3b25)
- **cost**: correct the glm-5.2 price, which the judges bill against (d0b233676)
- **llm**: give a call the time the model actually takes (f2473e350)
- **cost**: record what a failed stage spent, not only a successful one (4946f0c61)
- **llm**: say "no reasoning" instead of saying nothing (511603b34)
- **cost**: import the shared logger the way its other importers do (d45c66b64)
- **stage4**: stop a retry from stranding the answer the user already gave (927448e96)
- **evidence**: let a course with document evidence be deleted at all (5309658b5)
- **deps**: move the nanoid override off the version the advisory names (78b529e73)
- **pipeline**: bound an LLM call, stop double-chunking, delete uploads on cleanup (3351378c5)
- **llm**: carry the phase config to the request, not just the model id (7ad421986)
- **rag**: stop discarding fields by destructuring (20e743cd2)
- **rag**: expand after reranking, and cover the path that was missed (bcbeb4459)
- **llm**: send one reasoning control, not both (8868f44aa)
- **rag**: key the search cache on expansion and its budget (c61187693)
- **chunking**: make the chunker split where it always claimed to (b21c08cd2)
- **rag**: make retrieval actually retrieve (54a5c5e44)
- **ops**: scope the seed drift gate to global routing (43ab557d6)
- **llm**: make the routing uniqueness guard survive a NULL judge_role (501b3be7d)
- **smoke**: make an unreadable status stop killing a paid generation (689315129)
- **routing**: stop Stage 2 routing on a frozen file, and let the seed refresh (721ec38d0)
- **career-playbook**: apply the routing migrations and make the drift gate see (dc1a3766e)
- **career-playbook**: stop the new checks from reporting correct text (56d2343b1)
- **career-playbook**: make the metric-conflict check pay for itself (3d783833b)
- **career-playbook**: render status glyphs and stop two false-positive findings (a3266aed1)
- **career-playbook**: stop a malformed metric ledger from aborting generation (d2f74c6d1)
- **tooling**: preserve pnpm 10 Docker deploy behavior (3122e3e8d)
- **deps**: remove Redis build deprecation (0531c5e3e)
- **tooling**: harden local quality gates (b1f3cf124)
- **deps**: remediate dependency audit findings (d18910ee4)
- **i18n**: localize the signed-out header action (50208b60a)
- **test**: use safe linux temp for backend tests (4474b6f45)
- **stage2**: isolate reindex course progress (339cc6e00)
- **stage6**: count budget-skipped capped tasks (8a613f98f)
- **stage6**: preserve multilingual model routing (4dc9a24e7)
- **career-playbook**: preserve source title language (f52719137)
- **web**: generate valid development CSP origins (99e839520)
- **orchestration**: preserve unsafe cleanup worktrees (9d48cbfcc)
- **runtime**: align compiled api start with tsx (05d7fc7e7)
- **build**: force complete declaration rebuild (858e4a707)
- **deploy**: refresh Q12 asset manifest (2d0ccd6e1)
- **ci**: gate required colour environment variables (02aa50dd0)
- **ci**: limit deploy package permissions (38cf560d5)
- **deploy**: isolate ephemeral GHCR credentials (63b4e2efd)
- **deploy**: serialize host operations (beca7ef72)
- **tests**: make backend bootstrap failures nonzero (f2eab74db)
- **stage6**: detect localized intro teasers (bcb197989)
- **web**: stop Lesson Inspector loading without session (7b29f9d29)
- **stage6**: make empty-section guard reachable (0d551f046)
- **web**: type document failure copy keys (b06f7ff2b)
- **web**: explain document processing failures (13efe27d6)
- **career-playbook**: stop claiming unsaved block edits (26123e324)
- **ops**: regenerate the deployed-asset manifest for the Serve bump (f5c77fa6e)
- **docling**: the chunking profile never recorded a Serve version (1befdb5ac)
- **deploy**: the rollback's own health check could never pass (541eb68d3)
- **ops**: regenerate the deployed-asset manifest for the rollback fix (f3a046cdd)
- **deploy**: ship the Docling rollback override to the host (15ee4a826)
- **docling**: make the rollback real and the OCR gate able to fail (70476eedc)
- **docling**: act on four independent reviews of Stages C-E (985a29766)
- **upload**: stop the new extension gate refusing files that always worked (22eb4fbe1)
- **deploy**: let a SECOND Docling image change through the rollout gate (2dfbf0a09)
- **deploy**: stop the deploy depending on who holds the master branch (495d0ca70)
- **deploy**: let the Docling rollout gate survive its own success (56a9c571c)
- **ops**: regenerate the deployed-asset manifest for the compose change (8311e97b9)
- **docling**: ship the model set the production host can actually hold (409d4bbc6)
- **embeddings**: stop treating a provider rate limit as a lost document (d0660f0b9)
- **docling**: count facts, not chunks, and measure the call production makes (0f8664453)
- **embeddings**: make the cache key mean what the vector is (5b2919f00)
- **docling**: correct Recall@K, widen the regression gate, withdraw the candidate (7e3ebcce3)
- **ci**: isolate Docling MCP 3 package (bae0bb86f)
- **ci**: normalize Docling image repository (5acb3c556)
- **backup**: give the manifest room to finish, sized from measurement (mc2-0rj7i) (e6b3af43d)
- **backup**: repair three defects the mc2-0tcyw fix introduced (e0a76c64d)
- **ci**: point backup-schedule drift at the installer that proves the schedule (c85921084)
- **q12**: re-pin the deployed-asset manifest, and stop CI being blind to the diagnostic (f4dc9d12f)
- **backup**: say why the manifest query failed, and retry a transient instead of paging (151b03cb4)
- **stage2**: say what the file actually is, not what I first assumed (1273fb74a)
- **ci**: move the drift check out of deploy, which was rolling production back (4a802a133)
- **ops**: hold the pinned operator image, and move retention out of dead flags (5e3031c89)
- **stage2**: refuse a conversion that succeeded and returned nothing (27aa968f2)
- **ci**: ship deploy/postgres, whose scripts an enabled production timer runs (ccdeb7142)
- **qdrant**: enqueue the repair under the course owner, not a placeholder (311e90050)
- **ci**: let the monitoring drift gate report without blocking the rollout (6f3406749)
- **tests**: bound the 1,000-source resume case by its real cost, not the default (1527bd1ee)
- **ops**: raise an alert when the nightly Supabase backup stops happening (5a6575265)
- **ci**: measure the deployed monitoring config instead of asserting it (87466a8f0)
- **qdrant**: make the reindex CLI exit, so --rm can reclaim its container (289158b2d)
- **qdrant**: paginate course duplication instead of asking for 10000 points (421d7cd9f)
- **stage2**: give DOCX the fallback extractor PDF already had (a182df581)
- **qdrant**: let the snapshot units own their state directory, not systemd (1f1522063)
- **qdrant**: hand staged operator secrets over last, and take the directory back (d9e574085)
- **qdrant**: stage operator secrets before handing the directory to the tool UID (c5eeb1ced)
- **qdrant**: stop counting a returned job as an indexed document (7811c598d)
- **ops**: keep the snapshot alert note inside the E7 privacy contract (151011975)
- **qdrant**: name every absent target course directory instead of one bare ENOENT (a04c58873)
- **qdrant**: make recovery-bound reindex verify able to run at all (c0c53dabe)
- **alerts**: stop QdrantSnapshotStale claiming an off-host guarantee it never measured (89b4cdd9d)
- **qdrant**: let the operator services reach what their own commands need (a95582715)
- **qdrant**: give the recovery manifest one mode both sides agree on (f8a6f27af)
- **qdrant**: make the ordinary source-recovery route reachable (6dab8d86c)
- **qdrant**: carry a scrubbed reason on REINDEX_ERROR instead of a bare code (6dcc8d874)
- **ci**: make the secrets directory traversable, not just root-readable (617153e3f)
- **deploy**: pin the worker compose to the megacampus project, not the colour one (797976d17)
- **ci**: derive QDRANT_METRICS_GID from the host instead of an unset secret (mc2-c2p8z) (7400607b5)
- **deploy**: create the NotebookLM secrets directory with the privilege that owns it (78f9ff4f0)
- **ci**: unbreak the ordinary production deploy's file copy (mc2-o0g75) (1f99bbedc)
- **q12**: skip the guard event trigger on restore so C4 can replay a guarded dump (mc2-wl5vn) (f0f76e692)
- **q12**: clear the C4 read-only ALTER DATABASE, and carry the restore's reason (mc2-rjy9k) (600d24d47)
- **q12**: give the restore drill a HOME its docker CLI can stat (mc2-1cxna) (56c13c758)
- **q12**: materialize the source-manifest generator's q12 inputs (mc2-1cxna) (ec5faf371)
- **q12**: give the backup's libpq children a HOME they can stat (mc2-1cxna) (847163e68)
- **q12**: fail the backup steps WITH their captured diagnostics (mc2-1cxna) (4bcc4315b)
- **q12**: select C2 writers by compose service, not by whole project (mc2-1kcbv) (479686ad1)
- **q12**: make the C2 controller/child contract real on both sides (mc2-awi6q) (b138c5718)
- **q12**: take deployed-asset identity from the consuming script, not the git bit (mc2-lzft4) (62461e172)
- **q12**: thread the staged callbacks on the recover re-drive path too (mc2-1sns3) (1725a2df3)
- **q12**: close the three B3 scan gaps and prove the pooler resets session state (mc2-38ivn) (fc4953541)
- **q12**: every barrier session states its application_name (mc2-38ivn) (c0c8d03b3)
- **q12**: resolve the asset manifest without assuming a repo-shaped parent path (mc2-ot8se) (6432867a6)
- **q12**: disarm guard triggers by CASCADE and stop trusting pooled startup options (mc2-ipwyc) (9c4281b6b)
- **q12**: open the window snapshot coordinator at pg.backup, not across barrier.install (mc2-6fnrt) (2e867be46)
- **q12**: capture the structural catalog in the barrier's search_path (mc2-2rzf6) (e208bd1ee)
- **q12**: unguard cron.job so C1 can pass on managed Supabase (mc2-34eua) (a5fe79de3)
- **qdrant**: pause and restore cron through pg_cron's own API (e9281ecb4)
- **backup**: accept a bare DSN so the frozen Q12 commands stop contradicting (93da21f57)
- **qdrant**: run the frozen barrier cleanup child from production (bf80a4f71)
- **tests**: pin the privileged-launch sudo probe deterministically (1fa535b16)
- **qdrant**: publish the DB-barrier child input checkpoint from the controller (917374908)
- **qdrant**: report why a frozen child failed instead of a bare status (mc2-94mmf) (2c57ee03e)
- **qdrant**: repair the frozen HOME=/root at the wrapper seam (mc2-wwc9l) (4c1ca026d)
- **career-playbook**: render course brief markdown preview (mc2-sjpbx) (3232e83cf)
- **generation**: open current stage preview (mc2-v31gc) (c97dca206)
- **qdrant**: let the Q12 window publish its own writer-quiesce manifest (mc2-y02tz) (9b0fd1f02)
- **qdrant**: align the D4 oracle and the read seam with the catalog acceptance authority (23dfe973f)
- **qdrant**: accept legacy non-sha256 catalog hashes as disposition predicates (mc2 Q12) (d3cb0ee43)
- **q12**: pin emit tsconfig chain — cwd-independent module resolution for the acceptance emit (2832222cb)
- **q12**: root-safe acceptance publish — close review P1 TOCTOU + P2/P3 (emit wiring) (d640f84d2)
- **deploy**: run qdrant:verify via tsx, not node (ESM resolution) (mc2-smsjx) (379107ea0)
- **deploy**: dev secret reads via sudo + wire source-recovery env into .env.production (mc2-smsjx) (9fc396d1e)
- **lint**: clear clarifying router errors + type-safety/escape warnings (mc2-smsjx) (b3c924ca2)
- **q12**: wire --recovery-run-id + source secret paths into production live/recover CLI (mc2-pj5f0) (09b63b205)
- **q12**: W2/W3 correctness-review corrections (P1 + P2 wave) (4c6d00947)
- **q12**: chown the intermediate trust chain for the trust-bridge probe (#22 cont.) (00cb9a5e8)
- **q12**: rehearsal_make_trust_root chowns the trust root to uid-1000 (found-defect #22) (11e60c2d2)
- **q12**: make R8 rehearsal driver server-self-contained (found-defect #20) (c80cc932a)
- **qdrant**: rehearsal ns-launch shift 3->2 (P1: run_live entrypoint dropped) (a1a542801)
- **q12**: write_install_baseline publish-or-strict-accept (found-defect #16) (9e352261f)
- **q12**: defrost #14 gate active_run OLD.\* reads behind table/op (GREEN) (ba02f3bdd)
- **q12**: defrost #13 alias cron.job restore UPDATE (GREEN pending #14) (c433bcfc0)
- **q12**: make validateTransition baseline-vs-cutover order-symmetric (4 sites) + gate C acceptance (28df24002)
- **q12**: normalize cron.job active in source-manifest relations row_sha256 (822d0457c)
- **q12**: reconcile source-manifest q12_guard allowlist to the real barrier (7321b02ec)
- **q12**: barrier catalog-fd consumption + PG-dialect precedence/scalar fixes (f1c00c372)
- **q12**: exclude auto-generated array types from q12_guard ACL owner-only scans (c4c05d762)
- **env**: numeric QDRANT_METRICS_GID example per Q9 observability contract (cf5bd8666)
- **q12**: D6 session_activity coalesces provider nulls to sentinels (5d72cfcec)
- **q12**: keep D6 coordinator free of scheduling-primitive tokens (618870814)
- **q12**: create the backup lock during schedule installation (da5123226)
- **q12**: drop the derived extensions digest with the actor-normalized section (8f6bb56fb)
- **q12**: extend the platform-actor collapse to view-level schema owners (0095f9333)
- **q12**: replay database-post settings as the superuser (74724171d)
- **q12**: close the remaining provider-plane restore equality gaps (b25a92764)
- **q12**: collapse platform-admin actors before restored-catalog comparison (ee470f981)
- **q12**: exclude vestigial owner-self default ACL rows from comparison (ec2f593f9)
- **q12**: make catalog capture deparse deterministic and upgrade-tolerant (50803934e)
- **q12**: decode COPY text escapes in the drill's JSON query consumers (64643762f)
- **q12**: match the real json array rendering in the isolated setting proof (6aec61ddf)
- **q12**: regenerate connection files after the restart reassigns the port (672e15ac7)
- **q12**: run isolated ALTER SYSTEM overrides as the superuser (950c828f6)
- **q12**: issue isolated cluster overrides as separate statements (81e525f9b)
- **q12**: exempt frozen pgTLE packages from the pre-restore availability gate (d165f4e5c)
- **q12**: omit the default tablespace clause from restore_test creation (ab65e5bb0)
- **q12**: replay only the list-input search_path GUC verbatim (1b8a147e3)
- **q12**: replay role setconfig values verbatim (7767da7c3)
- **q12**: replay superuser-granted memberships before dependent grantors (b580b18b3)
- **q12**: run the drill role bootstrap as the image superuser (ad3e2df1b)
- **q12**: allow the observed backslash-escaped postgres search_path setting (f151927db)
- **q12**: permit allowlisted elevated attributes for image-missing roles (61497d742)
- **q12**: align role allowlists with the observed managed Supabase role plane (309e37c1d)
- **q12**: scope role bootstrap secret scan to the consumed role plane (d65eef8a3)
- **q12**: prove drill readiness on the published loopback port (d866c2f82)
- **q12**: publish the drill loopback port from a masquerade-free network (9c23fab82)
- **q12**: match the pg_dump mid-line control body rendering in the pgTLE scan (270ac971f)
- **q12**: accept the real pg_tle installed version chain (1ece496f6)
- **q12**: scope broad secret-shape scan to the roles export (e4db5cb3c)
- **q12**: materialize the adopted CA into the run directory for TLS consumers (d6fcf4ae8)
- **q12**: make source manifest capture work against the real Supabase PG17 catalog (11f9d7bea)
- **q12**: relax backup service ProtectHome to tmpfs for libpq client-cert default (f896083aa)
- **q12**: decompose backup service file into discrete libpq parameters (dedcc0765)
- **q12**: close review P1/P2 in blue/green handoff wrapper (70bf61037)
- **q12**: project rollback held targets to the never-resumable intent (e8b36aea1)
- **q12**: FWM targets take the opposite blue/green color in W topology order (186b36697)
- **q12**: require Root checkpoint provenance for historical install chains (c456f3e63)
- **q12**: harden durable recovery ancestry (7d38c30b4)
- **q12**: complete retained recovery hardening (541ae20b4)
- **q12**: harden retained lifecycle recovery (e6a8440a2)
- **q12**: preserve reviewed provenance bytes (4601dd249)
- **q12**: accept exact retained recovery chains (21cff2d0b)
- **q12**: bind retained barrier history (b99a85744)
- **q12**: close barrier capability classifier (fd676ccb1)
- **q12**: accept linked recovery orphans (dc7f2f8d3)
- **q12**: close recovery proof gaps (e7422043f)
- **q12**: harden writer barrier recovery (827bd3831)
- **q12**: harden D4 writer recovery validation (091eb479c)
- **q12**: harden backup and restore trust boundaries (ad52ae4d8)
- **q12**: harden backup recovery lifecycle (3de6c5b21)
- **qdrant**: make publisher cleanup signal-safe (35101aed8)
- **qdrant**: harden operator publication (a81d13e5c)
- **ops**: reject multiline PostgreSQL versions (3f580218b)
- **ops**: pin Supabase backups to PostgreSQL 17 (3b68a65ca)
- **ops**: bind backup directory identity (c6b3c5b59)
- **ops**: harden Supabase backup publication (616ca3b31)
- **qdrant**: fsync reused recovery journal (94cc669a3)
- **qdrant**: reconcile recovery crash residue (798038598)
- **qdrant**: close source recovery runtime review (976ae43fb)
- **qdrant**: reject unrelated recovery ledgers (6cff8c0da)
- **evidence**: validate terminal answer values (96ca10f4a)
- **evidence**: allow terminal source decisions (b6cf46ebe)
- **evidence**: materialize terminal source decisions (d2bd3acea)
- **evidence**: harden unrecoverable source handling (a9ab248fc)
- **qdrant**: close reindex correction gaps (91ae126f8)
- **qdrant**: harden recovery-bound reindex resume (e84cfc20b)
- **recovery**: close workflow safety gaps (25ae4ed2d)
- **qdrant**: verify recovery manifest identity (d44bcfe66)
- **qdrant**: bind source recovery audit state (ddd775601)
- **qdrant**: persist local snapshots across recreate (fe1818bfe)
- **qdrant**: use local staging snapshots (a0ddb285f)
- **deploy**: bind rollback to current release (3e14c9223)
- **qdrant**: publish and pin operator releases (4267deeee)
- **qdrant**: close operator isolation gaps (76caa6e54)
- **migrations**: complete evidence catalog gate (5c74869f6)
- **migrations**: close evidence gate review gaps (cb7f44908)
- **deploy**: close rollback hardening gaps (7d893d42a)
- **deploy**: preserve coherent rollback snapshots (17dbd4f4e)
- **qdrant**: install secrets for exact consumers (e7130b3ea)
- **qdrant**: deliver monitoring secrets fail closed (7f72c7e12)
- **deploy**: make staging rollback immutable (7157fcdcf)
- **qdrant**: make staging deploy fail closed (8e8b1f303)
- **observability**: verify terminal coverage totals (7a7d54aeb)
- **observability**: defer terminal insert totals (59dc6cad6)
- **observability**: unify evidence migrations (036a642da)
- **observability**: reconcile durable Stage 4 totals (a566bfa00)
- **migrations**: add concurrent index runner (c7ced6b0b)
- **observability**: use kernel locks for textfiles (9a1c0893b)
- **observability**: restore validated type guards (dc832db96)
- **observability**: make evidence metrics replay safe (2048357c4)
- **qdrant**: harden observability contracts (151e4e1aa)
- **qdrant**: align recovery metrics directory contract (c4e0a0f34)
- **qdrant**: enforce restore drill verification (c3f61942a)
- **qdrant**: bind runtime to amd64 image lock (14322c8f6)
- **evidence**: recover legacy conflict side identity (5201a786e)
- **evidence**: persist durable conflict side identity (8f4e6b95c)
- **stage6**: enforce exact accepted evidence scope (d04b9aee3)
- **web**: preserve document decision state (6c6e3c448)
- **stage5**: require exact chunk evidence refs (cf4388269)
- **stage5**: harden document evidence enrichment (cf3e0d2fd)
- **stage5**: guard evidence snapshot persistence (a3cb3db8d)
- **stage4**: close document evidence scale boundaries (1cf6e4503)
- **stage4**: enforce exact evidence token bounds (14277d8ad)
- **stage4**: bound per-card evidence hierarchy (4378d1c4a)
- **stage4**: bound downstream evidence context (3dedd5c0a)
- **stage4**: make evidence preflight resume durable (a8e64800e)
- **evidence**: harden durable evidence ledger (bc439c633)
- **evidence**: enforce durable evidence isolation (8a48c7ed4)
- **qdrant**: align integration point IDs (49e5e8d75)
- **ci**: make pinned Qdrant gate blocking (8e86368f2)
- **qdrant**: index document weight for strict formula (464795e66)
- **qdrant**: harden source reindex recovery (78a1bfb33)
- **ci**: make pinned Qdrant gate blocking (3c36a6a1b)
- **qdrant**: index document weight for strict formula (d9e01ac00)
- **qdrant**: address hybrid review findings (4159c2f43)
- **qdrant**: enforce alias-safe collection lifecycle (7c3702d3b)
- **qdrant**: address native ingestion review findings (bc0ceacfe)
- **qdrant**: ingest native BM25 and complete priority payloads (8eb7ae283)
- **career-playbook**: stop final assembler appending stub diagrams next to rich ones (mc2-db696.104.4) (15c477954)
- **career-playbook**: prompt fixes for content artifacts (mc2-db696.104.4) (8967b2db3)
- **career-playbook**: canonical 26-block topic layout as single source of truth (mc2-1slzl) (4db7cd971)
- **career-playbook**: persist follow-up-questions LLM cost into cost_breakdown (d8ef574fe)
- **career-playbook**: capture real usage on structured-output LLM path (eb6be867b)
- **career-playbook**: flag wrong-language and unresolved placeholders in judge (18e001beb)
- **career-playbook**: cap CAREER_PLAYBOOK job attempts to stop TTL cost runaway (c7dd2cac4)
- **career-playbook**: data-drive graph nodes and re-derive finalMarkdown (d13f55370)
- **career-playbook**: record real LLM cost/token usage per node (43070a6fc)
- harden career playbook generation timeout (80c9e1f26)
- **ci**: harden deploy gates and scope web docker build (e381f5dd0)
- **career-playbook**: preserve fresh starts and CTA layout (8fce37ddf)
- **career-playbook**: reduce numeric review noise (87acbc9d7)
- **ci**: keep backend lint warning budget stable (db3786cc6)
- **career-playbook**: stabilize generation and delivery (7cbf74d74)
- **migrations**: fail open on DB connectivity errors in drift gate (70b9efe56)
- **career-playbook**: keep library catalog up when image columns missing (d07ad42a4)
- **qdrant**: stabilize dev endpoint wiring (4f13aa4b4)
- **career-playbook**: harden live smoke generation (ac7987de7)
- **career-playbook**: deploy linked course CTA copy (fc679d3cb)
- **generation**: harden career playbook course generation (f06e427c2)
- **career-playbook**: keep mermaid sanitizer lint-clean (c8b5dfd27)
- **career-playbook**: harden mermaid remediation (95c8c0034)
- **career-playbook**: open existing generated course (de3a81f50)
- **career-playbook**: harden quality issues and public URLs (469aa5eff)
- **ci**: restore model matrix delivery gates (9244ee6eb)
- **web**: align completed module pill colors (f5d54a1e6)
- **course-gen**: replace retired default model ids (3a93f1f37)
- **course-generation**: keep structural quality in sync after edits (8fa923b94)
- **web**: make auto card status badges non-interactive (00d88a287)
- **career-playbook**: skip single-source course review gates (863f24d14)
- **delivery**: use bd dolt push in push-dev (f53319138)
- **career-playbook**: use valid bridge processing method (787b228ff)
- **career-playbook**: split source evidence helper (c7d8534b6)
- **career-playbook**: prevent visibility dropdown scroll jump (615e7da59)
- **security**: clear dependency audit findings (e66e3c1a1)
- **ci**: stabilize career playbook dev delivery (3d6e7f443)
- **ci**: keep career playbook lint within budget (dc494d573)
- **courses**: align landing CTA with light theme (89891b15e)
- **career-playbook**: enforce follow-up language (6edb4980f)
- **deploy**: avoid orphan removal during rollback (dfba4dbe1)
- **ci**: add bounded integration smoke gate (97c72ab08)
- **ci**: add qdrant service to integration job (b34e1eeb9)
- repair career playbook dev visibility migration (7db4255aa)
- add playbook reader visibility control (a982edd75)
- **career-playbook**: map library detail for viewer (4c1609d70)
- **career-playbook**: reduce source lint warnings (c41270173)
- harden career playbook business context (f36f23cde)
- **career-playbook**: tolerate malformed judge verdicts (b594cf19b)
- **career-playbook**: accept blank optional spec fields (a9e901f1c)
- **career-playbook**: retry invalid spec builder output (5f6f09e24)
- **career-playbook**: repair department selection UX (b42da2d1b)
- **catalog**: compact statistics cards (50498515a)
- **career-playbook**: align library card actions with catalog UX (c0dd0f240)
- **career-playbook**: remove option card text caret (2c5193383)
- **career-playbook**: harden bridge quota and CI qdrant (f0b37ce9c)
- **career-playbook**: use BullMQ-safe generation job ids (b463031f3)
- **career-playbook**: clarify completeness readiness (af90258b5)
- **career-playbook**: align follow-up progress bar (c9247f2ef)
- **career-playbook**: make option cards clickable (0c7f2f9cc)
- start fresh career playbook drafts explicitly (43c604a31)
- align role guide library search field (2e6b47e97)
- **web**: tune hero card title scale (7f3fb28f2)
- **ci**: restrict rollback to deploy failures (#59) (d9b138539)
- **nav**: preserve locale in product IA review fixes (30b286801)
- **nav**: preserve locale in product IA review fixes (a81c0801e)
- **ui**: align catalog and header buttons (a64d9ccdb)
- **auth**: hide decorative login blob on small screens (cd96580e6)
- **career-playbook**: refine landing pre-start section (8fc392b05)
- **career-playbook**: clarify methodology source blocks (7500d5fa5)
- **career-playbook**: localize methodology examples (282e57309)
- **career-playbook**: keep landing hero full viewport (cf1b17cd9)
- **career-playbook**: align landing demo with dark styling (647cfeb38)
- **career-playbook**: prevent landing demo overlap (d69c9f72d)
- **career-playbook**: make mock variants deployable (447027bae)
- **web**: remove existing lint warnings (389dd0807)
- **header**: standardize app navigation surfaces (65b4b5b62)
- **career-playbook**: polish constructor and shared header (d2faacde5)
- **career-playbook**: simplify russian role language (7ea281dae)
- **career-playbook**: hide unstable question totals (4e0a6fcbe)
- **career-playbook**: align wizard progress to steps (4b0ac3df4)
- **career-playbook**: require dedicated staging smoke queue (88dd5ea8c)
- **career-playbook**: enforce bridge organization scope (84d06d15e)
- **career-playbook**: harden backend job handler (df7ba8008)
- **career-playbook**: harden pdf export review findings (973ac3ea9)
- **graph**: stabilize workflow viewport and module defaults (ae8cced46)
- **stage6**: resolve review flag after approval (68e85f0c0)
- **workflow**: stabilize graph viewport and module spacing (29ace5051)
- **web**: improve review-required inspector ux (58c8e2bd3)
- **web**: prevent lesson regeneration no-op clicks (d040ea07d)
- **deploy**: normalize dev qdrant container (791e60f37)
- **stage6**: harden factual gate and dev delivery (6458318e8)
- **stage6**: relax markdown gate for generated diagrams (0add84351)
- **stage6**: avoid truncation false positives on markdown tails (3c9e71f10)
- **stage6**: preserve pre-header markdown introduction (db59ab32f)
- **stage6**: canonicalize review and terminal acceptance (223810d94)
- **stage6**: classify ambiguous footer tails conservatively (f3632dbb4)
- **stage6**: restore database service review contract (48c854772)
- **stage6**: harden truncation heuristics and terminal state (4ecda98b2)
- **stage6**: channel-safe terminal state for section-regeneration cap exceeded (8e0500fc9)
- **stage6**: move escalation/terminal logic from conditional-edge to self-reviewer node (d1fcf7324)
- **stage6**: recover lost review_required state from LangGraph conditional-edge mutations (07c5e17b4)
- **stage6**: escalate truncation_continuation to full_regenerate before fail-open (975cf1f63)
- **stage6**: harden rag coverage and truncation continuation (707c07dad)
- **web**: keep rejected stage6 content out of success ui (a0f98de6b)
- **stage6**: strengthen visual element requirements in single-call prompt (f5c71345f)
- **stage6**: preserve max_tokens ceiling semantics (a56f2cce5)
- **stage6**: close adapter gap, ESLint test coverage, regression test (224f7bcfb)
- **stage6**: wire phase maxTokens to generator, fix bunker seed path (eb759ea85)
- **stage6**: token budget, model config, ladder retry, admin FK (7660ef417)
- **stage6**: satisfy admin regeneration lint rules (c9a6303b6)
- **stage6**: use canonical lesson specs in admin regeneration (d0af8545e)
- **web**: unify viewer-ready lesson content loading (c5520335f)
- **web**: show approved lessons in course viewer (2fe3124e4)
- **stage6**: align review approval and progress semantics (1c37c452c)
- **stage6**: restore remediation contexts for retry paths (9948835e4)
- **stage6**: allow regeneration on completed courses, surface no-op jobs as failed (3b6bb8f16)
- **stage6**: preserve escalation fallback topology (c8646c465)
- **stage6**: honor course overrides and usable content (2dc236c84)
- **generation**: harden stage4 restart recovery (98c105b75)
- **web**: surface latest review-required lesson state (42e39bd83)
- **platform**: refine required rag retry classification (5605323d9)
- harden required rag retries (e26a8ee54)
- **platform**: tighten rag fail-fast boundaries (c3f2463b4)
- **course-gen-platform**: surface rag preflight errors (0799158d8)
- **platform**: fail fast when required rag is unavailable (dfb2b3d42)
- **web**: clarify stage6 review-required graph states (441b185ce)
- **web**: clarify stage6 quality and human escalation (51913bdc2)
- prevent false Stage 2 success after Qdrant failure (1f46f4ba5)
- **stage6**: keep mismatch quality failures on ladder (6305a8e08)
- **api**: resolve ESM module conflict between helpers.ts and helpers/ directory (cc75a34d1)
- **deploy**: staged container startup and diagnostic logging (bedb11d19)
- **web**: derive stage6 ladder models from persisted history (85688810e)
- **web**: cherry-pick 2 minor fixes from stale branches (1aa649f1d)
- **web**: simplify quality recovery hook imports (d96ebace1)
- **web**: align quality ladder shared-type imports (9aae44309)
- **stage6**: show explicit review empty state (e8a9222bc)
- **web**: preserve collapsed lesson inspector split (2387d0c24)
- **web**: add lesson inspector split fallback (d44a4f030)
- **web**: reconcile stuck stage6 course status (bb4ee6679)
- **cli**: make push-dev cleanup pipefail-safe (d973d4ff4)
- **cli**: restore push-dev cleanup trap (86b5d0f63)
- **stage6**: restore lesson preview and review-required state (4c2d78a12)
- **tests**: fix lint errors in targeted-refinement-orchestrator test (41dc8b9f9)
- **stage6**: fix token budget telemetry and deduplicate budget check (a704b89bf)
- **stage6**: address final review findings for quality hardening (8969303e4)
- **stage6,web**: fix dead sectionCount check, callout whitespace, cleanup (07f1e7f8a)
- **web**: repair broken markdown table rows with split quoted text (798a114d6)
- **stage6,web**: fix PRO TIP callout, section validation, and CI blocker (ed5b7d1c6)
- **web**: resolve lint errors in profile pages and i18n (7975bb8f5)
- **stage6**: fix systemic content quality issues in lesson generation (5a2367a0c)
- **tests**: ensure Qdrant collection exists before integration tests (7331b9dc4)
- **enrichments**: break infinite realtime subscription loop in Stage 7 inspector (0eadefe1a)
- **nlm**: replace broken CDP auth script with official notebooklm login (8e42bfd11)
- **jd**: update CTA link to https://ai.megacampus.ru in JD and skill (d1b9b3bb6)
- **pipeline**: harden Stage 6 quality pipeline — fix 6 root causes (7d963a89c)
- **pipeline**: definitive FSM with all transitions + bypass support (f6ec71b91)
- **pipeline**: restore all lost FSM transitions from original migration (afec00581)
- **auth**: add admin/superadmin bypass to restart-stage endpoint (4191d0de9)
- **pipeline**: correct FSM status names to match actual enum values (e07c8816d)
- **pipeline**: add awaiting_approval to init state transitions (2ae7e5db3)
- **course-gen-platform**: update 6 source file(s), update docs (8261a1769)
- **pipeline**: allow FSM pending → stage_3/4_init for pre-processed docs (5f62b59bf)
- **stage6**: eliminate mermaid text fallback + add 3-tier model cascade (78065d8ed)
- **web**: truncate long lesson titles to prevent horizontal scroll (47959ac0f)
- **pipeline**: add FSM transition + missing enum values + auto-mute rules (7855f319a)
- **pipeline**: extend sanitization to strip surrogate pairs before PG storage (4dd63692f)
- **pipeline**: strip null bytes from Docling output before PostgreSQL storage (2abee1460)
- **pipeline**: add DB-level race condition guard to FSM initialization (fa2c88884)
- **pipeline**: address code review findings for FSM guard + progress fix (f8ddac205)
- **pipeline**: prevent duplicate FSM init + fix clarifying progress message (46522cc96)
- **web**: make getUserFavorites async to fix Next.js Server Actions build (3e38aed3b)
- **auth**: unify course authorization to allow org members across all actions (5ea17c202)
- **enrichments**: allow org members to manage enrichments, not just course owner (de9732b54)
- **nlm-bridge**: add lesson_id field to MediaGenerationRequest model (29b996abe)
- **pipeline**: increase LLM timeouts across all stages to prevent OpenRouter AbortErrors (638b2cd0f)
- **pipeline**: increase Phase 0.5 LLM timeout to 30min with adaptive scaling (f83f2a7e9)
- **shared-types**: add post-build script to fix ESM import extensions (cc5570562)
- **pipeline**: inline shared-utils in tsup bundle to fix ESM resolution (74a86881f)
- **pipeline**: improve extractErrorMessage comment explaining \_sandboxError reliability (58759bde5)
- **pipeline**: address code review findings for sandbox error capture (719275a49)
- **pipeline**: fix sandbox error capture with prependListener and cleanup dead code (2a5aaa5ba)
- **pipeline**: address code review findings for sandbox error pattern (c31cc9f71)
- **pipeline**: fix BullMQ sandbox error message loss in Stage 2 (ae6a48968)
- **admin**: fix Docling MCP 404 and stuck courses false positives in health monitor (b9f16dba1)
- **course-gen-platform**: update 11 source file(s) (b4ab4cf3a)
- **stage5**: make lesson materialization idempotent (454f4797f)
- **stage6**: tighten MERMAID_SYNTAX_PATTERNS to reduce false positives (440b8c1bd)
- **course-gen-platform**: add barrel index.ts files for split modules (c746e59df)
- **ci**: fix PostCSS config and mermaid regex breaking CI pipeline (304b66589)
- **pipeline**: fix error message propagation + monitoring blind spots (b5aa297d8)
- **web**: fix remaining 18 ESLint warnings (no-img-element, alt-text, unused-disable) (c94864e33)
- **web**: resolve all @typescript-eslint/no-explicit-any warnings (final retry) (e585865cb)
- **web**: use imported tailwindcss plugin in postcss.config.mjs for Vite 7 compat (23e7be2ff)
- **web**: handle /sse endpoint in Docling health check URL derivation (5231f857f)
- **infra**: prevent Docling proxy DNS caching + add auto-mute rule (754706d22)
- **worker**: capture uncaught exceptions in sandbox processor for 9MB DOCX crash (e402dacd4)
- **web**: normalize course status for i18n translation keys (ecb2f8481)
- **stage1**: handle QuotaExceededError before duck-type checks in orchestrator (c7e56e2b9)
- **tests**: fix basic_plus tier enum and PGRST116 handling in quota-enforcer (436720b35)
- **tests**: reset Redis concurrency counters in contract generation tests (f282175ed)
- **tests**: fix multiple test failures across integration, e2e, and contract suites (8c2d95d32)
- **logger**: add auto-mute pattern for Mermaid render-invalid warnings (6ba9ed31f)
- **worker**: preserve error message/stack in BullMQ sandbox serialization (13dbe8f47)
- **worker**: add safety net for stuck courses on sandbox crash (dfb2882d5)
- **ci**: resolve test timeouts and hanging process issues (fae28b5e1)
- **web**: fix PostCSS config and shared-utils barrel import breaking build (d13c5307d)
- **shared-logger**: replace tsup --dts with tsc --emitDeclarationOnly (738ec9b4a)
- **stage6**: prevent LO_CODE_PATTERN from consuming newlines (1b54e7a8b)
- **stage6**: strip LO-code references leaking into lesson content (8998ccb72)
- **stage6**: strip LLM metadata leaking into lesson content (7d16a0321)
- **logger**: add auto-mute for Zod→Regenerator, Phase5 fallback, outbox transients (1334ee669)
- **logger**: add auto-mute for Redis/Queue transient errors during restarts (ac6323f48)
- **logger**: expand auto-mute patterns for Mermaid render failures and systemHealth probes (a3dfa29e3)
- **deploy**: remove --remove-orphans that killed Redis on every deploy (8a0ec5447)
- **tests**: resolve TS module alias resolution errors in IDE (6d658d8b0)
- **tests**: resolve lint and typescript strict mode errors in new tests (3f0a538f5)
- **tests**: stabilize test suite — PostCSS import, test assertions, coverage config (c228f3b1f)
- **mind-map**: CSS fullscreen with shared state, fix fold depth, remove duplicate close button (7d55b073b)
- **mind-map**: match video aspect ratio for inline preview, fullscreen for View Full Map (2271f2f62)
- **web**: update 12 source file(s), update 2 test(s), +1 more (e01107ce9)
- **mind-map**: unify display to markmap SVG and fix interactivity in dialog (05595e9f4)
- **quiz**: address remaining code review findings (CR-003,007,008,011,015) (d3edd70ca)
- **i18n**: propagate locale to STAGE_CONFIG and downstream components (b582c9dc5)
- **i18n**: convert ContentPreviewPanel and LessonMatrix to useTranslations (67917d13e)
- **i18n**: fix remaining hardcoded Russian strings missed in initial pass (419d09522)
- **i18n**: replace hardcoded Russian strings in generation panel components (b4e6243ff)
- **i18n**: replace hardcoded Russian in catalog, workflow stages, and clarifying questions (d4636b3a7)
- **i18n**: replace hardcoded Russian strings with i18n keys across 12+ components (dacda293c)
- **pipeline**: translate course title to target language in Stage 5 (a91c92a27)
- **enrichments**: use correct placeholder images for NLM enrichment types (9bba954ee)
- **enrichments**: remove audio/video from remaining UI components (5ed072a69)
- **enrichments**: add image_base64 to bridge media payload detection (4e926dda1)
- **logger**: enhance auto-mute to check metadata.message for tRPC errors (ebf4bedef)
- **enrichments**: pass explicit timeout to wait_for_completion for 3 NLM artifact types (dbd938a5b)
- **enrichments**: increase NLM queue wait timeout to 72h and async polling to 76h (8f9fb6a26)
- **enrichments**: resolve NLM bridge failures and add enrichment types to materials switcher (e6013252e)
- **enrichments**: change NLM audio default format from deep_dive to debate (4a776601e)
- **mind-map**: remove content truncation, add iterative depth-safe validation (aec15ec09)
- **enrichments**: address code review findings for NLM enrichment types (e889d7de7)
- **infra**: share enrichments storage between Dev and Staging (31e9a2923)
- **lint**: raise eslint function size and complexity limits (938b4b90f)
- **web**: stabilize media UX in course viewer (c54fbb7ac)
- **admin**: log fallback URL in bridge health check (I5) (2475800a7)
- **admin**: address code review issues for bridge health check (89995e480)
- **bridge**: add SOCKS5 proxy and fix config for Stage bridge (2c6f7e55b)
- **enrichments**: persist generation state across lesson navigation (ff0677286)
- **pipeline**: address code review issues in Redis cache-aside (c42a896d3)
- **nginx**: add video/mp4 and audio/mpeg MIME types for enrichment storage (1aaaf891c)
- **web**: restore enrichment generation state after page navigation (ac0af8b91)
- **web**: dynamic import vidstack to prevent intermittent chunk loading errors (3c42e32b8)
- code review follow-ups — proper backoff, PGRST116 guards, regression tests (34f6316ad)
- stop misclassifying network errors as "enrichment not found" during polling (26b66a25e)
- **nlm-bridge**: strip bloated metadata from bridge responses and harden recovery logic (29b4ec17d)
- enrichment card transition after generation + audio single-click play + metadata perf (2f808b441)
- prevent Select dropdown from closing in enrichment card hover panel (7f113ff91)
- add data/secrets to gitignore and fix lint errors in scripts/tests (27f388074)
- **release**: exclude .venv and .gemini/tmp from package.json discovery and gitignore (7a1603302)
- **analysis**: handle forceRestart in active stage4 states (6a7661bd4)
- **enrichments**: add nlm types to ordered arrays in generation-graph (f2c4aa477)
- **enrichments**: resolve nlm audio/video contract and type issues (81410bf21)
- **ci**: build notebooklm-bridge image for deploy (0f510faa0)
- **stage6**: add deterministic markdown table remediation (e36fb5fec)
- **web**: normalize malformed markdown tables (88cc20ffa)
- **stage6**: improve mermaid diagram remediation pipeline and rendering (0629a151e)
- **stage6**: prevent intro-vs-section content duplication in lesson generation (506674c49)
- **logs**: address code review findings — rate limiter bug, logWarningToDb bypass, inconsistent logger (cb097f54a)
- **logs**: reduce error log volume with pre-insert filters and double-logging elimination (7a816442b)
- **logs**: fix Job not found auto-mute regex and add Redis/Jina patterns (c100ae51b)
- **stage6**: remove synthetic conclusion flow and guard recap overlap (46a1c4234)
- code review fixes — mermaid false positives, sidebar i18n, regex safety (30cc67b8c)
- **stage6**: persist regenerationMode to lesson_contents metadata (bd3f71fa0)
- **stage6**: replace broken upsert with insert in markForReview and handlePartialSuccess (d50ce36da)
- **stage6**: set status=published when course generation completes (b4425a017)
- **web**: fix false-positive unhealthy status in health endpoint (c00bef704)
- **stage6**: remaining P3 recommendations and test gap coverage (94fdf6ce8)
- **stage6**: code review fixes — P1 regenerationMode bug, upsert alignment, dedup (22903fac3)
- **stage6**: fail-open regenerate caps and persist model telemetry (0dc4ad782)
- **stage6**: cap regenerate loops on repeated truncation (4bfdbfa22)
- **stage6**: finalize on terminal lesson statuses (116b23e3f)
- **stage6**: ignore rejected lessons in completion check (3da1aec47)
- **stage6**: run completion check during in-flight partial retries (86009e572)
- **stage6**: make keyword coverage language-aware (f9cc62a8e)
- **stage6**: improve russian keyword coverage heuristics (9ee752027)
- **stage6**: wire 3-tier model routing into job processor (18aab094f)
- **stage6**: remove stale BullMQ jobs before re-generation (4e7987ec0)
- **ci**: replace deprecated set-output with GITHUB_OUTPUT env file (249cdca60)
- **stage6**: use keyTopics for key_concepts, guard currentIdx=-1, fix import order (5cdf46956)
- **stage6,web**: add lesson_context to partialGenerate, make next-lesson card clickable (157ca9b18)
- **web**: fix callout block detection in markdown renderers (38ecb6e16)
- **stage6,web**: deduplicate lesson objectives, improve conclusion, add next-lesson card (3dab4c45e)
- **stage6**: use dedicated stage6 queue for partialGenerate (fded4560f)
- **stage6**: skip completion check for partialGenerate jobs (0137e3043)
- **json-repair**: downgrade log from ERROR to WARN when all repair strategies fail (c4cae1b9a)
- **stage6**: pass course style to partialGenerate job data (6e03db600)
- **course-gen-platform**: update 10 source file(s), update docs, +1 more (f6d66105b)
- **stage7**: increase hardcoded MAX_OUTPUT_TOKENS in quiz/video handlers (3f194d0cc)
- **llm**: increase max_tokens for LLM phases and add defensive question filtering (6343e45de)
- **llm**: resolve config-seed.json ESM loading error in dev mode (0b5c20d3f)
- **types**: add stage_6_rag_planning to Record<PhaseName> fallback configs (db6d0eb0a)
- **types**: add stage_6_rag_planning to PhaseName and CHECK constraint (99081e00b)
- **stage6**: correct misleading comment in protectMarkdownElements restore (7514ee9a9)
- **stage6**: address code review findings for CJK auto-fix (5330d888b)
- **deploy**: restart workers during Blue/Green deployment (560271dba)
- **stage6**: add 3-layer CJK character auto-fix in self-reviewer (cf1f13b40)
- **stages**: add non-retryable bail-out to Stage 4 and Stage 6 retry loops (927835bd4)
- **stage5**: prevent infinite retry loop on section count mismatch (7900c3b32)
- **stage4**: use Stage 3 LLM priorities in prepareDocumentInfos instead of size heuristic (3b688b765)
- **web**: add startup grace period to health check endpoint (0e76e8b03)
- **stage4**: pass tokenCount to getModelForPhase in Phase 0.5 and Phase 2 (ab4a844ca)
- **ci**: distinguish cancelled/skipped from failed in Telegram notifications (522f0bcb3)
- **ci**: repair deploy verification and test failures (d58f5f94c)
- **tests**: unskip 3 generate-on-demand tests by fixing mock gaps (76bc39fba)
- **tests**: repair 4 pre-existing test failures (5969d5b92)
- **course-gen-platform**: add warning logs when preprocessing filters short tags/prerequisites (8a9b6daff)
- **course-gen-platform**: route Zod validation through UnifiedRegenerator, fix metadata min-length, add auto-mute rules (0e5cc6e44)
- **course-gen-platform**: sync thin stage5 prompt in db (1f5e4c74c)
- **course-gen-platform**: update 3 source file(s), update 1 test(s), +1 more (822f064f9)
- **health**: return 503 when heap usage exceeds 90% (477eda7ea)
- health check — 18 bugs fixed (3 critical, 5 high, 7 medium, 3 low) (26194bfce)
- **web**: MermaidDirect error state recovery on chart prop change (07699be16)
- **stage6**: add try/catch to mermaid pipeline calls + update README (72d875d45)
- **stage6**: upgrade targeted refinement to full mermaid fix pipeline (84fa9aa4f)
- **stage6**: add prompt template validation to section-regenerator and coherence patcher (ce0cc1414)
- **shared-types**: fix LessonRAGContextV2 Zod schema rejecting empty primary_documents (951ba3223)
- **stage5**: fix RAG sentinel bug, remove dead code, deprecate document_relevance_mapping (784b62bc9)
- **stage5**: code review fixes — sanitization, edge cases, dead code cleanup (8b583941c)
- **web**: fix 40 failing tests across 17 test files (da3aab7c3)
- **stage4**: code review fixes — warning logs, ordering invariant, doc headers (460736b07)
- **web**: thread courseLanguage to admin generation-graph panels (7e42145e0)
- **web**: parse and localize markdown callout blocks ([!TIP], [!WARNING], etc.) (ea1625530)
- **stage4**: budget allocator overflow + context handler improvements (9fa9ce754)
- **web**: remove y-axis animation to prevent scroll jump on lesson load (4325ab0fc)
- **tests**: update lesson-context and classifier tests for new behavior (09fccedc8)
- **stage5**: use const for non-reassigned variable (lint) (3ef9c58f6)
- **web**: resolve empty mermaid SVG caused by render race condition (0f6019105)
- **stage6**: add mermaid sanitization to all LLM content paths (a5c73a735)
- **pipeline**: correct JOB_TYPE_TO_STEP mapping, progress messages, and error metadata (a871efecf)
- **stage5**: filter short course_tags before RT-006 validation (3cf6dd244)
- **course-gen-platform**: complete code review fixes for single-call generation (a6354df70)
- **course-gen-platform**: address code review findings for single-call generation (8c52f05e3)
- **course-gen-platform**: refactor chat editing system + code review fixes (d5f66fe47)
- **course-gen-platform**: fix chat config duplicates + Phase 0.5 Zod validation + auto-mute rules (b138570db)
- **course-gen-platform**: update 4 source file(s), update docs (6ee1802a8)
- **course-gen-platform**: update 15 source file(s), update docs (4c2075bfa)
- **course-gen-platform**: update 3 source file(s), update 1 test(s), +2 more (13fb4def0)
- distinguish transient DB failure from missing config in fetchPhaseConfigFromDb (711f0a5a9)
- address round 16 code review findings (fail-fast + clarification cards) (eeb8ea5d7)
- address round 15 code review findings (4 fixes) (ef60b9351)
- address round 14 code review findings (FULL_REGENERATE regex + lesson_number format) (334fe7aa5)
- resolve positional reference ambiguity when both element types present (d1e5a05b0)
- add positional reference resolution (first/last) to target-resolver (04d863ea6)
- address round 11 code review findings (Phase 4 alignment + heuristics) (dbbae5d20)
- add chat phase hardcoded fallbacks + guard content.sections iteration (1d60222bf)
- address 7 code review findings (round 10) (490b90319)
- address round 9 code review findings (flaky regex + false-green + stubs) (fed73e270)
- address round 8 code review findings (integration tests + backfill retry) (3d90056bb)
- address round 7 code review findings (backfill retry + integration tests) (d05c6c158)
- address 5 code review findings (round 6) (2dcc37860)
- address 8 code review findings (round 5) (cc4ebe793)
- address 6 code review findings (round 4) + parent integrity trigger (9f8adc55b)
- address 6 code review findings (round 3) (d5e9e64e8)
- align implementation with plan requirements (9 findings) (66270c026)
- targeted Stage 6 content generation for new lessons + parity monitoring (32037dec8)
- count actual affected elements in delete ratio validation (55d47d6df)
- ensure stable IDs before course_nodes dual-write (d8e1da1f0)
- **chat**: route explicit intent=regenerate to actual job queue instead of legacy LLM flow (27678de62)
- **web**: add NextIntlClientProvider wrapper to useRefinement tests (c4c58674a)
- **chat**: complete Phase 2-3 audit — prompt caching, structural flag, token benchmark, Stage 6 CTA (fd0efde42)
- **chat**: audit fixes — FULL_REGENERATE job, stable ID proposals, ensureStableIds in apply, Stage 6 CTA (596a448e4)
- resolve generation.initiate failure, Stage 5 enum mismatch, CSP blocking (d6c809f35)
- **web**: correct misleading "exponential backoff" comment (dd068ff6f)
- **web**: fix build blocker, remove upload as-any casts, rewrite enrichment tests (1f14f892d)
- **web**: migrate client-side hooks from raw fetch to tRPC client (Phase 4) (797ffb661)
- **web**: migrate raw fetch() calls to tRPC client (Phases 1-3) (facc2c7b6)
- staging deploy chown + contract tests BullMQ ESM crash (0b8b96e0c)
- **tests**: remove BullMQ worker from contract tests (8434e19f2)
- **auth**: add local JWT verification fallback for test environments (966bc1039)
- **tests**: remove fake session_id from mock JWT + fix reregeneration typo (7594472e9)
- **tests**: fix 32 CI contract test failures — JWT secret, stale enums, wrong namespace (dbde3497f)
- **stage4**: add .default() to SuggestedAnswerSchema.rationale for LLM output resilience (3abde7c9b)
- **lint**: resolve 23 ESLint errors across web package + suppress test false positives (328751412)
- **chat**: address code review findings CR-004/005/006/007/009/010 (bed98840a)
- **chat**: fix 500 error, add stage-specific models, replace deprecated models (9416bce7e)
- **refinement-chat**: improve JSON content detection (46c24a554)
- **bunker**: use randomUUID for atomic temp files instead of process.pid (f59c0d60a)
- **logger,stage4**: LKG race condition, error serialization, rationale validation (779306ab6)
- **chat**: improve JSON detection + add trim guard + telemetry (code review) (8ec440125)
- **chat**: prevent empty chat bubbles and blank lesson content (EGT-1521, GDK-6714) (f06cd9d8d)
- **chat**: empty assistant bubble + irrelevant proposals in refinement chat (093e1a543)
- add ARIA labels + 44 unit tests for CategoryBadge (c6509ec34)
- address code review findings from refactoring (b246b28aa)
- **tests**: update 14 stale judge tests to match current implementations (8d527c3d1)
- **tests**: mock Supabase Auth tokens locally to eliminate flaky CI failures (2e198bae7)
- **i18n**: extract hardcoded strings from RefinementChat + useRefinement (4d2c2f578)
- **chat**: code review v2 — dedup ChatMessage, fix rejectProposal cleanup, add 6 tests (d7bce287a)
- **chat**: address code review findings — skeleton, redundant check, generic message (07bea8f2f)
- **chat**: add Reject button + post-accept guidance message (646e0ac4a)
- **chat**: improve chat UX — remove toast, keep proposal after accept, add Stage 6 per-lesson chat (b89c8ebc0)
- **stage4**: address code review findings for Phase 0.5 multi-round clarification (c7bc99ad3)
- **worker**: resolve log warnings from course generation QGN-6607 (6aaf190ae)
- address code review HIGH findings — IPv6 SSRF + cleanup audit trail (1b0540847)
- healthcheck cycle — auth, types, atomic deletion, security hardening (4a5be98f3)
- **web**: replace i18n 'as any' with '@ts-expect-error' + add SSRF protection (e6f261d1f)
- **security**: timing-safe metrics API key comparison (87cc448a6)
- healthcheck batch 2 — 6 bugs fixed, bundle optimization (6ce6cd439)
- **web**: improve auth sync error handling + sync avatar_url (e2fdaab72)
- **security**: healthcheck — 9 bugs fixed (5 critical, 3 high, 1 medium) (e1cb429bd)
- **web**: update 1 source file(s), update 5 agent(s), +1 more (631e14dcd)
- **ci**: build shared packages before lint to resolve type-aware rules (c2f61fffe)
- **lint**: add JSDoc and standardize error handling in batch 3 helpers (c303c0f80)
- **web**: refetch traces on stage restart to clear stale error nodes (3d92ad369)
- **tests**: replace inline getAuthToken with centralized singleton in generation contract tests (dcd7e494b)
- **lint**: code review fixes — Supabase types, re-exports, floating promise (35cb1720f)
- **web**: resolve TS7030 in GlobalCourseChat useEffect — not all code paths return value (327fce274)
- prevent test errors in prod logs + auto-mute rules for infra errors (1e875889e)
- cap totalSections to available sections in Stage 5 (B1) (3e707ca76)
- clean up courseEntries on eviction and metrics on cancellation (CR follow-up) (4dc6d7871)
- memory/resource leak audit fixes (mc2-yqyx) (2102260fa)
- **docker**: add shared-utils to both API and Web Dockerfiles (ea636dd41)
- **lint**: batch 6 — fix all 108 remaining fixable ESLint warnings (aa6ad189a)
- **ui**: rename misleading "Regenerate All" button to "Retry Failed" (e773d3282)
- **web**: extract uuid-validation to avoid jsdom in API route bundles (b8ed8ef4e)
- **pipeline**: idempotent token tracking — no double-count on retry (CR-006) (78421f728)
- add missing migration file and fix zero-token display (CR-001, CR-009) (c0a07d966)
- **lint**: batch 5 — fix 39 ESLint warnings in 7 files (613af6b2e)
- **ci**: add shared-utils build step to CI pipeline (a27e03c4d)
- **api**: apply 3 remaining code review improvements (fc3a8e870)
- **course-gen-platform**: fix 82 ESLint warnings in batch 4 (10 files) (10d8c2a9f)
- **api**: apply code review fixes to lifecycle sub-routers (bc3b596a4)
- **course-gen-platform**: fix 81 ESLint warnings in batch 3 (handlers, routers, judges, prompts) (6421d747a)
- **course-gen-platform**: fix 85 ESLint warnings in batch 2 (logger, client, routers, sanitizer) (1fd1e6fc2)
- **course-gen-platform**: fix 135 ESLint warnings in benchmarks, regeneration and chat routers (41f4ecd65)
- **web**: address code review findings for env migration (ec6a5822f)
- **course-gen-platform**: code review follow-up improvements (b66724b8e)
- **course-gen-platform**: update 28 source file(s), update 2 test(s), +2 more (34f2737c9)
- address remaining code review issues #6-#15 (719f59305)
- address code review issues for perf optimization (fdd8f9891)
- harden sanitize.fileName, fix tests, extract CONTROL_CHAR_REGEX (5b611f031)
- **ci**: build course-gen-platform before type-check (d9ff141f5)
- remove type safety bypasses in ClarifyingPanel (#4, #5) (27cc45181)
- address code review findings for tRPC migration (ab75d256b)
- **tests**: repair unit test suite — 83/83 pass, no hanging (910495448)
- **tests**: repair 10 pre-existing broken unit tests after deduplication (82961e548)
- **i18n**: extract remaining hardcoded Russian strings, remove orphaned vapid script (522213406)
- **auth**: wrap login schema in useMemo to prevent recreation on every render (2f437c676)
- **stage4**: Redis resilience + code review fixes (IMP-001/002/003, MED-002/003, MIN-003/005/006) (adbae1c62)
- **stage4**: broken test imports + Redis cache for Phase 1 + Phase 0.5 progress (cb1391d40)
- **test**: update stale 'hands-on' assertion in context-assembler test (039d71e0c)
- **stage4**: update docstrings to reflect Phase 1→0.5 ordering (0b647decd)
- **shared-types,web**: add pedagogical_patterns to editable whitelist & guard empty .in() (178efe576)
- **stage4,stage5**: retry pull-fallback + accept any assessment_types type (56d882724)
- **pipeline**: sync course style injection across all generation stages (1807f109b)
- **stage4**: pass document content to clarifying questions prompt (9f482fefd)
- **userback**: use identify() for form pre-fill instead of init options (da2a33675)
- **course-gen-platform**: update 1 source file(s), update docs (7f61aad2a)
- **graph**: fix Stage 4 results spinner — shared ref race condition + missing complete statuses (e14fcdafa)
- **stage7**: fix double retry bug causing enrichments stuck in generating (a994eee76)
- **anti-overlap**: remaining code review issues (1.3, 2.3, 5.3, security, i18n) (12a397e8b)
- **anti-overlap**: address code review findings for overlap detection (5dafe2980)
- **pipeline**: prevent duplicate lessons via anti-overlap prompts and cross-section detection (96e4210a1)
- **userback**: localize widget greeting to Russian (458d065d2)
- **userback**: add font-src CSP and prefill email/name in widget (111913e9b)
- **csp**: add static.userback.io to style-src and connect-src (19489eada)
- **auth**: code review fixes — security, i18n, UX improvements (736826647)
- remove unused InvitationType imports + fix NODE_ENV test assertions (2ab0c370f)
- health check phase 2 - 13 deferred bugs fixed (644c58280)
- health check - 8 bugs fixed (mc2-wisp-0t4) (f914e87ff)
- **worker**: use actual path in EACCES fix instructions (208d40550)
- shared Jina rate limiter (100 RPM) + EACCES improvements + auto-mute rules (002efd484)
- **block-regen**: optimistic locking, cache limit, shared setNestedValue (50c67eb24)
- **orchestrator**: address code review findings for BLOCK_REGENERATION (a038ac3e2)
- **ci**: add concurrency group and paths-ignore for .beads (1aef46068)
- **lesson-editor**: concurrent save guard, draft toast, save feedback, ARIA (21fe25b49)
- **lesson-editor**: CSS, dark mode, autosave, context refactor, and tests (106fe43e5)
- **lesson-editor**: address code review findings (0f27ef55c)
- resolve 3 production error categories (b40229a0c)
- **workflow**: merge stage1CourseData with traces for Stage 1 nodes (5cc8f5f83)
- **chat**: resolve message duplication and data not refreshing after apply (fa5b40b6b)
- **tests**: sync test data with updated Zod schemas (9 failing tests) (82d587f26)
- **tests**: fix fetch mocking in jina-reranker-client unit test (2426b294c)
- **admin**: fix null filters breaking /admin/logs page (500 error) (1f68861f1)
- **stage4**: enforce min length + filter invalid answers in normalization (0c1706d69)
- process error logs — 3 bug fixes + 3 auto-mute rules (f9a92cf19)
- **stage6**: prevent "sections is not iterable" error in judge (0d6133f10)
- **i18n**: address code review findings for i18n headers (e8342b816)
- **i18n**: replace hardcoded English headers with localized labels (13abcad84)
- **markdown**: escape currency dollar signs to prevent LaTeX math misinterpretation (8989ab169)
- **chat**: address code review issues for intent classification (d0015fec4)
- **chat**: optimize chat fallback config for large courses (9f3e7f059)
- **ci**: add forceExit to shared-types vitest config (0f237e533)
- **ci**: resolve test timeouts and hanging processes (a0e00fe68)
- очистка localStorage после создания курса (3f7d3949c)
- добавлена валидация приоритетов документов при переходе Stage 3→4 (25d176c05)
- resolve CI/CD test failures blocking Dev deploy (0105ea6f0)
- address code review findings for user-preferences (bb1ec6d16)
- **useLessonActions**: fix P0/P1 race conditions and memory leaks (e770dc295)
- **docling**: graceful fallback for unsupported format + clarify cover prompts design (0fb01f1b6)
- **orchestrator**: pass BullMQ job token correctly in sandboxed processor (a8a4d5bbc)
- **AMX-5817**: resolve bucket, chat blocking, and Jina rate limit issues (b081dd0aa)
- **web**: only show approve button when generationStatus is awaiting_approval (f4c79fe72)
- **stage1**: graceful fallback when vector duplication has no vectors (a692450ca)
- **docling**: switch transport from SSE to Streamable HTTP (b02b77104)
- **docling**: update to docling-mcp 1.3.4 and mcp 1.26.0 (bcb38c0b7)
- **config**: change DOCLING_MCP_URL from /sse to /mcp (cb5b5061c)
- **stage2**: add missing pdf-parse dependency for fallback extraction (005a36b7d)
- **db**: allow anonymous users to insert PWA analytics events (14bbe8740)
- **tests**: centralize auth token helper with exponential backoff (0fce0ac9e)
- **deploy**: force remove containers by name before blue-green deploy (d5b883e8c)
- **deploy**: cleanup leftover containers before blue-green deploy (90335c114)
- **types**: replace error: any with proper instanceof checks (a0d17dd09)
- **types**: replace explicit any with proper types in production code (470148503)
- **ci**: add always() condition to Deploy to Production job (2d69dc617)
- **types**: replace any with Record<string, unknown> for JSONB fields (73d0dc256)
- **web**: correct vitest test:integration command (d2662a98d)
- **ci**: resolve flaky CI/CD tests with timeouts and rate limiting (069d4f6a3)
- **realtime**: handle empty error objects in skeleton traces fetch (923ea78e6)
- **docling**: switch MCP transport from Streamable HTTP to SSE (650374fba)
- **stage2**: implement remaining code review recommendations (39530e049)
- **stage2**: address code review findings for reliability improvements (cadcc862b)
- **stage2**: improve Docling session retry and add fallback extraction (108b4e853)
- **tests**: clean up broken unit tests and improve test stability (95692e15e)
- **course-gen-platform**: update 2 source file(s) (d49fba3fa)
- **ci**: reduce unit tests timeout to 5min (89900f3b5)
- **ci**: add always() to downstream jobs for workflow-level cancellation (92ce617fc)
- **web**: address code review issues for course data update (42f0e6a0f)
- **ci**: update test job dependencies to allow cancelled unit tests (e0c35f4eb)
- **web**: UI now updates after course data changes (Stage 4/5) (19880087a)
- **ci**: allow unit tests timeout in CI Success gate (5a51ddc30)
- **ci**: add continue-on-error for unit tests (hanging process issue) (2bfc77371)
- **ci**: mock Redis in unit tests to prevent hanging (bcb5bc6d8)
- **ci**: remove Redis from unit tests (f0b76f787)
- **ci**: fix poller tests and increase unit test timeout (e01a12b22)
- **ci**: add teardown for unit tests to close Redis (48e248ba8)
- **ci**: separate vitest config for unit tests (4ce85e931)
- **ci**: run contract tests sequentially after unit tests (7b2f1d044)
- **ci**: use real secrets for contract and integration tests (9578ba8ef)
- **ci**: add env vars for contract and integration tests (6ebe3e940)
- **ci**: add Redis service for test jobs (53b8030a9)
- **ci**: add course-gen-platform build before tests (3ea63adf7)
- **clarifying**: address code review findings HIGH-001, HIGH-002, MED-001, MED-002 (bbd42adeb)
- **stage4**: prevent duplicate clarifying questions generation (db3c16a70)
- **ui**: correctly show deduplicated documents as completed in Stage 2 (68e3ee457)
- **benchmarks**: sync scoring criteria across all documents (c78a96b85)
- **graph**: add answeredCount/questionsCount to shallow compare (fe47fbf9c)
- **stage5**: setAtPath now correctly handles array access on object properties (9abbe7f0d)
- **clarifying**: update node counter without page refresh (8e5baf26c)
- **style-prompts**: update conversational and research styles to avoid rhetorical clichés (93aa4f3fd)
- **refinement**: remove AbortSignal from server action and add localStorage safety (2127fb659)
- pass missing proposalError and retryProposal props (89ca285b4)
- additional self-review fixes (3a35dd0b8)
- **hooks**: add isMountedRef check to acceptProposal (f6ed2fb74)
- **chat**: address P1 and P2 bugs from code review (adfb7779a)
- **server-actions**: remove AbortSignal parameters to fix serialization error (252bb2a32)
- **query-client**: add 'use client' directive (1162bc295)
- **refinement**: allow refinement chat for phase-based nodes (Stage 4, 5, 6) (45d1fc3d9)
- **clarifying**: address code review findings for TanStack Query migration (f3a2cf8bc)
- **clarifying**: migrate to @tanstack/react-query for proper cache sync (c4c412a45)
- **clarifying**: generate questions without documents + one-click accept (6e8e56bea)
- **clarifying**: invalidate getProgress cache during polling (5fdb16823)
- **clarifying**: invalidate getProgress cache to update node in graph (425d301ac)
- **docker**: add NEXT_PUBLIC_COURSEGEN_BACKEND_URL to Dockerfile (b5c8bffb6)
- **clarifying**: invalidate cache after bulk accept recommendations (0e2896259)
- **clarifying**: use rounded-sm for multi-choice checkboxes (5e92ab064)
- **clarifying**: remove dark mode navigation bar artifact (5db92559f)
- **clarifying**: invalidate cache before refetch in polling (22876c503)
- **clarifying**: poll for questions when cache empty + fix progress on skip (4f2bd25bd)
- **admin/logs**: list view now shows all new errors (51e6580e4)
- **db**: add stage_1 and stage_7 to generation_trace constraint (e2ed2018f)
- **llm**: migrate from xiaomi/mimo-v2-flash:free to paid version (faab93cbb)
- **fsm**: allow stage_4_clarifying → stage_4_analyzing transition (b332bdf43)
- **mocks**: add middleware exclusion and proper layout for /mocks routes (e7e8b7426)
- **clarifying**: use staleTime Infinity - questions never change after generation (2559e0569)
- **clarifying**: prevent unwanted refetches causing UI reset during editing (7303d069a)
- **clarifying**: fix useEffect deps array size mismatch error (d5c28e73d)
- **clarifying**: persist confetti shown state in localStorage (50c2bc0aa)
- **clarifying**: fix infinite loader and confetti showing on every open (143fb0856)
- **clarifying**: force cache invalidation on answer save for immediate UI update (eb913b8b7)
- **clarifying**: fix multi_choice with custom answer validation + UI update after edit (c15c97e41)
- **clarifying**: refetch questions after answer saved (70a8ef7e1)
- **clarifying**: optimistically switch to answered mode after confirm (ecf532e69)
- **clarifying**: don't override editing mode in useEffect (2313026b2)
- **clarifying**: fix infinite loop in useEffect (7829b987b)
- **clarifying**: fix UI state sync bugs (3b7b02d81)
- **clarifying**: code review fixes MEDIUM-002/003/005 + LOW-002 (c761cb724)
- **clarifying**: batch endpoint and atomic autoAnswer (HIGH-002, HIGH-003) (d69f7bbb6)
- **types**: replace unsafe any cast with proper JSONB types for clarifying_questions (d5995d5d9)
- **clarifying**: address code review issues (CRITICAL-003, HIGH-001,004,005, MEDIUM-004,006) (eae4f43ec)
- **clarifying**: prevent auto-scroll from hijacking user scroll (61b7f34e9)
- **clarifying**: fix [object Object] display and add selectedSuggestionIndex (5bc7e4211)
- **clarifying**: add query caching to prevent rate limit spam (77ff130d5)
- **stage4**: log ClarifyingQuestionsInterrupt as INFO instead of ERROR (5f753d5dd)
- **errors**: address code review feedback for pipeline errors (b137884be)
- **ui**: show clarifying node fallback when status is stage_4_clarifying (a2e3c142b)
- **stage4**: preserve stage_4_clarifying status on AWAITING_CLARIFYING_ANSWERS (5d5697134)
- **stage4**: prevent retry loop for AWAITING_CLARIFYING_ANSWERS + add JSON repair (4cc09ab44)
- **web**: update 4 source file(s), update MCP configs, +3 more (e71100740)
- **stage4**: classify AbortError as LLM_ERROR for proper retry (7ea62dc08)
- **stage4**: prevent BullMQ retry for AWAITING_CLARIFYING_ANSWERS (671b5f9e1)
- **graph**: connect clarifying node from Stage 4 bottom handle (bddc908c4)
- **graph**: position clarifying node BELOW Stage 4 (f7bc2e285)
- **stage4**: increase clarifying LLM timeout to 5 minutes (af8e7eca9)
- **web**: position clarifying node as side branch below Stage 4 (4e49db10c)
- **db**: add stage_4_clarifying status to FSM (ba4bf826c)
- **web**: add pipelineStatus param to useDocumentsWithStatus (7f55b7bad)
- **web**: fix Clarifying Questions node display and auto-open issues (d092d057e)
- **web**: prevent rate limit for clarifying.getProgress (37e7e28bc)
- **dev**: add Stage 6 worker to start-dev.sh (dd840e312)
- **web**: improve error handling in RealtimeProvider (796e46f8a)
- **api**: revert to simple JSON format for restart-stage tRPC call (1cff41d79)
- **api**: use tRPC batch format for restart-stage endpoint (a89f4c6ba)
- **api**: correct tRPC endpoint path for restart-stage (73a161fdc)
- **web**: resolve ESLint errors in NodeDetailsDrawer (0e67074b1)
- **web**: resolve 405 error and hydration warnings in restart-stage (3c6e06220)
- **stage4**: address medium/low code review findings (41c4e0814)
- **stage4**: address code review findings for self-reflection (3e5d174ff)
- **web**: use correct tRPC GET input format in getChatTokenEstimates (4d5f7ea38)
- **i18n**: use correct ICU interpolation format {var} instead of {{var}} (71faa270f)
- **config**: switch xiaomi/mimo-v2-flash from free to paid tier (eb3a1b685)
- **shared-types**: update 1 source file(s), update docs (c689cdd00)
- **web**: TypeScript errors in P3.3 i18n migration (1d012f084)
- **web**: P3 code review fixes + course regeneration flow (806bb7b74)
- **stage4**: change clarifying fallback to Gemini 3 Flash (760c39a13)
- **stage4**: fix clarifying config stage_number and swap models (26b5f432f)
- **stage4**: Phase 0.5 final improvements from code review (f0217ff88)
- **stage4**: Phase 0.5 backlog improvements (cd45a97ed)
- **stage4**: Phase 0.5 Clarifying Questions - critical fixes Phase 2 (60ed0de0e)
- **stage4**: critical fixes for Phase 0.5 Clarifying Questions (30753da85)
- **chat**: code review fixes - P1-P3 improvements (a860ff893)
- **chat**: code review fixes for cascade and auth (c632d7f2a)
- **chat**: resolve 401/404 errors and add cascade stage deletion (2cd282c77)
- **share**: update Share API URL to new [orgSlug]/[courseSlug] format (3221a5eec)
- **urls**: fix API routes and add code review report (53b9c10a3)
- **web**: remove fallback to old URLs in viewer components (2510bfe4f)
- **media**: fix 404 on progress API and add polling for image generation (1f6d00d30)
- **urls**: update course URLs to new format /courses/{org}/{course} (15bc33128)
- **auth**: add superadmin role and public course access for anon users (9c39d32ab)
- **web**: keep hover panel visible when visibility dropdown is open (7c0b55e4b)
- **auth**: add role-based authorization for course operations (ed07561b8)
- **web**: fix courseSlug param name in remaining graph components (4908b607f)
- **web**: approval button not showing on Stage 5 (c27ab7c22)
- **deploy**: add docling-mcp image check before deploy (9bdaa07d9)
- **admin/logs**: default to status='new' in list view (5793edd7a)
- **deploy**: add automatic Docker cleanup after each deploy (852a9191d)
- **graph**: auto-refresh UI when stage reaches awaiting_approval (c79b3e5f3)
- **infra**: add uploads-dev mount to docling and BARRIER_FAILED enum (8d20a4ce2)
- **changelog**: sort versions in correct descending order (3e7b73c72)
- **slug**: prevent suffix truncation in generateSlug (bdb514394)
- **web**: update 1 source file(s), update docs (08687fb4c)
- **routes**: complete URL migration with full sanitization (2be27f8df)
- **routes**: remove legacy [slug] routes and add slug validation (1f996a4ea)
- **chat**: address code review findings for intent selection (b18a0e896)
- **llm**: update fallback to google/gemini-3-flash-preview for premium phases (133f78040)
- **tests**: update section-batch-generator tests for current implementation (fef6ee11e)
- duplicate key violation and FSM transition errors (0cd686193)
- **web**: add Zod validation and HTTP error mapping to chat server action (a060dd238)
- **stage5**: address code review issues for constraints implementation (48ac93695)
- **chat**: address code review findings (d868b393f)
- **chat**: fix race condition in GlobalCourseChat and add error boundary (4a6b40894)
- **stage5**: respect Stage 4 user-edited constraints (total_lessons, total_sections) (444a47edd)
- **migrations**: remove duplicate course_chat_messages migration (7bb6b435f)
- **generation**: use all form fields in course generation prompts (ec38c51cb)
- **generation**: stage 3 now runs for deduplicated documents (97c657db9)
- **web**: use vector_status for document processing status (6301114fc)
- **stage2**: enhance filePath validation for empty strings (b6793ad81)
- **stage2**: add filePath validation before document processing (bdd90ef8a)
- **stage6**: sync generation_progress.steps[] on completion (48ce029be)
- **locks**: remove double releaseLock in Stage 4 and Stage 5 handlers (07e2e0b5f)
- **nginx**: add rewrite for /api/trpc to /trpc (2b0f51ddb)
- **cover**: use 21:9 cinematic ratio in lightbox preview (eb02f4186)
- **web**: update 15 source file(s), update docs (02657d79f)
- **enrichments**: remove dead approveCoverDraft code (dfae793a5)
- **web**: resolve CSP error for enrichment generation in production (63b536228)
- move nginx configs to deploy/nginx as single source of truth (f09610370)
- **db**: remove unused tables and fix performance warnings (8d6ee5a53)
- **enrichment**: reuse cancelled/failed enrichments for regeneration (977b9bec3)
- **enrichment**: allow cancelling draft_ready enrichments and fix resume race condition (90689c508)
- **db**: complete Supabase security and performance optimizations (c01be79d6)
- **web**: replace missing /api/auth/me endpoint with useAuth hook (2425d3259)
- **db**: apply Supabase performance and security optimizations (4f3c9bab9)
- security vulnerabilities and code cleanup (mc2-wisp-157) (67b1812b3)
- **enrichments**: address code review MEDIUM/LOW priority issues (b81c219cc)
- **enrichments**: address code review HIGH priority issues (fc484c1ee)
- **enrichments**: restore generation progress on page reload (f498761da)
- **logger**: address HIGH priority code review findings (69007a4cb)
- **logging**: improve LLM error logging and add TTL timeout auto-mute (48ae876ea)
- **web**: update 4 source file(s), update docs (5d4c07b45)
- address code review issues for performance optimization (40c90872e)
- sprint bug fixes - template whitelist, patcher retry, banner flow, status validation (f83393f6a)
- **web**: update 1 source file(s), update 5 test(s), +1 more (647a58873)
- **lessons**: address code review issues for lessons page (c35d73c40)
- **progress**: address code review findings for Stage 6 progress bar (f383167fd)
- **code-review**: address P1 and P2 issues from review (778e726f0)
- **progress**: update percentage during Stage 6 lesson generation (75235b968)
- **generation-graph**: implement GitHub Issues #10, #11, #17 (f9c6ef5ee)
- **enrichment**: resolve cover/banner generation issues (95f4d35ad)
- **enrichment**: unify grid layout for all enrichment cards (44424fb08)
- **pipeline**: implement per-field save status and fix type compatibility (03565247f)
- **pipeline**: persist Stage 4 edits and show per-field save status (f5a9c412c)
- **enrichments**: address code review issues for UnifiedEnrichmentCard (95e17d90e)
- **stage6**: suppress false RAG warning for courses without documents (65048052a)
- **stage5**: whitelist Helm/Go template syntax in placeholder validator (RT-008) (692a4b8ca)
- **deploy**: explicitly remove dev containers before recreate (26bb98473)
- **admin-logs**: align list view status=new filter with grouped view logic (2c894a18d)
- **logs**: increase file upload limit + add Redis reconnect auto-mute (8afbd95cf)
- **logs+qdrant**: improve error handling for transient failures (23765f642)
- **docker**: permanent fix for Redis DNS failure (da2dbfc45)
- **ui+pipeline**: improve badge contrast and save target_audience in Stage 4 (a0de684d8)
- **i18n**: add missing video.estimatedTime and improve cover/card descriptions (ae405515d)
- **images**: use Next.js optimizer instead of Supabase render (df2b92907)
- **visuals**: address code review issues for lesson cards media (6aa9da76d)
- **generation**: add token validation warnings and pause delay tracking (733c6f435)
- **generation**: address code review findings for pause/stop/resume (1677e2420)
- **redis**: improve retry strategy with graceful shutdown and health monitoring (a8201d21b)
- **generation**: make pause/stop/resume controls work correctly (289ba98ec)
- **redis**: exit process after extended connection failure (~20 min) (086cd601c)
- **redis**: never give up on reconnection, use exponential backoff (52be1dd68)
- **scripts**: correct Xiaomi model ID in Stage 6 quality tests (f05757d04)
- **stage6**: add null checks to prevent TypeError in formatInterLessonContextXML (23ca69858)
- **scripts**: add dotenv import to test-lesson-generation (3a931675d)
- **mermaid**: improve dark mode contrast for edge labels and text (7925e7192)
- **web**: Use i18n Link for correct SPA navigation (7efc5d404)
- **stage2**: Add courseId to Phase 6 summarization error logs (791394ef2)
- **stage7**: Use || instead of ?? for empty string handling in card prompts (c71ba9b32)
- **web**: Fix Link+Button nesting issues across generation-graph (4f42c0b50)
- **web**: Fix navigation in EndNodePanel "Open Course" button (6392bf68d)
- **stage6**: fix TypeScript types in checkAndSetStage6Complete (ccac61256)
- **course-gen-platform**: update 1 source file(s), update docs (d6774f604)
- **generation-graph**: correct course_size and notifications display on progress page (0cfd376a3)
- **docker**: add BULLMQ_STAGE7_QUEUE_NAME to worker-dev for Stage 7 queue isolation (3fccb2fdc)
- **web**: update 1 source file(s), update docs (1722e3c2d)
- **docker**: add BULLMQ_STAGE6_QUEUE_NAME to worker-dev for Stage 6 queue isolation (a87048113)
- **upload-overlay**: prevent layout shift when switching files (ce50c55c5)
- **model-config**: update stage_number Zod constraint from max(6) to max(7) (0a8bc4e70)
- **i18n**: persist selected language in user settings (cc480cd64)
- **deploy**: remove redundant env var from docker-compose (8fb85307f)
- **deploy**: add NEXT_SERVER_ACTIONS_ENCRYPTION_KEY for persistent Server Actions (4e1d74e60)
- **docker**: add uploads-dev mount to docling-mcp for dev environment (8f478b048)
- **docker**: add DOCLING_UPLOADS_BASE_PATH override for document processing (25b8df3b9)
- **web**: fix type-check by excluding tests from tsconfig (010eb4768)
- **stage6**: add dedicated worker service and queue isolation for dev (df2ef69a6)
- **enrichments**: disable auto lesson card/cover generation (eda22f46c)
- **admin/logs**: fix status filter not working in flat view (3b9f806fc)
- **Stage4**: pass course_size via job data to avoid race condition (36e9a4673)
- **Stage5**: use 'intermediate' as default difficulty instead of undefined (fd5fc724c)
- **skill**: dev server errors should be investigated, not bulk resolved (c0ab1e90d)
- **orchestrator**: support snake_case in job cleanup logic (19e94f005)
- **orchestrator**: support snake_case job data fields in queue-events-backup (7b8738322)
- **orchestrator**: prevent attempts exceeding max_attempts constraint violation (fcb2b5ed1)
- **stage2**: add hardcoded fallback for model config in Phase 6 (7f0827ada)
- **stage2**: store fallback processed_content on summarization failure (20efd480b)
- **auto-approval**: correct FSM transitions for automatic mode (0db4392cb)
- **course-size**: remove hardcoded min 10 lessons from CourseStructureSchema (7ba4f2254)
- **auto-approval**: correct status suffix for all stages + release locks early (a0895dc69)
- **stage2**: handle SandboxedJob missing getState() method (1b7af9296)
- **phase-2**: respect course_size preset constraints (MICRO/MINI/COMPACT) (046e0d19e)
- **docling**: transform local paths to container paths for Docker (e3e564405)
- **stage4**: respect course_size constraints for MICRO/MINI/COMPACT (mc2-usg3) (c3cd53794)
- **pipeline**: comprehensive Stage 5 retry and placeholder handling (e2767891d)
- **stage5**: update JSDoc and fix test import path (53b52c705)
- **stage4**: remove conflicting pedagogical_strategy fields from Phase 3 (0f1006fef)
- **auto-approval**: address code review issues CR-001 through CR-015 (4ac851c8e)
- **course-gen**: repair JSON parsing and validation failures (764881ea1)
- **auto-approval**: add two-step FSM transition for automatic mode (ea747357d)
- **web**: image loader width param and logo aspect ratio (e2abcd423)
- **processor**: bundle with tsup for BullMQ ESM compatibility (48d86eafb)
- **deploy**: add orphan container cleanup before dev deploy (ae92b2f16)
- **logs**: return status from RPC to fix filter mismatch (fd4681038)
- **processor**: add missing .js extension to error-service import (0c98add07)
- **Stage5**: validate style against enum before Zod validation (dd572a49f)
- **Stage5**: handle null DB fields in frontend_parameters validation (4a8789df3)
- **GenerationProgress**: pause/resume now updates UI in real-time (c24b86d43)
- **GraphHeader**: show fingerprint button with courseId fallback when generationCode is null (d01f7c27a)
- **MissionControlBanner**: address code review P1-P2 issues (60d638af8)
- **worker**: log errors to DB inside sandbox before stack trace is lost (e8648cc4c)
- **admin-logs**: list view now considers fingerprint-based status (3a2f27cd9)
- **web**: prevent profile learning_style from overriding user's form selection (e1239a8c0)
- **web**: update 2 source file(s) (0bba2a766)
- **logger**: use upsert for duplicate problem_id in error logging (07099a510)
- **processor**: resolve ESM directory import error in sandboxed processor (a79d63b2e)
- **course-viewer**: complete remaining code review fixes CR-005 through CR-022 (fdb0628cc)
- **course-viewer**: address code review issues CR-001 through CR-018 (02344e4ad)
- **a11y**: add ARIA labels and null checks to BreadcrumbNav (7d0811c23)
- **orchestrator**: improve sandboxed processor type safety and reliability (d7485011f)
- **web**: allow micro course size in validation schema (a690fcae6)
- **course-gen-platform**: update 3 source file(s), update 1 agent(s), +3 more (95a97cb00)
- **types**: add type casts in NodeDetailsDrawer for Stage props (fa31e0ffa)
- **generation**: save generation_mode from form + display writing style on Stage 4 (082611366)
- **ui**: complete Stage2Group skipped styling from code review (4c41364bc)
- **ui**: add strikethrough style to Stage2Group when skipped (6863c4edc)
- **export**: security and performance improvements from code review (3019bdf65)
- **ui**: resolve single-click/double-click UX conflict in ModuleGroup (1b7000195)
- add concurrency limiter for Jina API and job.name validation (67fb0d21b)
- **stage5**: remove partial-regen layer and add lock cleanup (c21da01c4)
- **stage5**: prevent infinite retry loop and fix validation errors (9f837c39d)
- **shared-types**: update 4 source file(s), update 1 agent(s), +2 more (4fa300edc)
- **logs**: implement server-side grouping with RPC + code review fixes (90d0a4846)
- **stage4**: use actual target_audience from DB instead of hardcoded value (e5ac9ce33)
- **generation**: передавать course_size и description в Input стадии 5 (8a4532591)
- **logs**: improve PostgrestError logging with full error details (fd9e1593d)
- **web**: navigation sheet not working in fullscreen mode (82cb45190)
- **enrichment**: address code review issues #5-#7 (584c6993b)
- **enrichments**: address code review findings (b55fb6002)
- **web**: cleanup unused type and debug comment in EnrichmentsPanel refactoring (66c197d25)
- **stage6**: rename generator.ts to avoid ESM directory conflict (5d819e043)
- **stage6**: resolve circular dependency in orchestrator (9b62e5b07)
- remove unused LessonGraphNode import in judge-node.ts (51f062a13)
- **stage5**: show both content and teaching styles in blueprint preview (762e01ca1)
- **stage5**: show user-selected style instead of LLM analysis style (31ea012c7)
- **stage5**: show exact lesson count instead of fake range (77eafd472)
- **stage6**: fix lessons.content query and add warn/error DB logging (683d93218)
- **RT-007**: use word boundaries in hasNonMeasurableVerb (737865cb4)
- **types**: cast course.style to CourseStyle type (0d8bb4dff)
- **stage4**: remove size hints from AUTO mode prompt (7fdc4b672)
- **stage4**: add explicit AUTO mode guidance for course size determination (6480da38e)
- **stage4**: enforce course size as mandatory constraint with ±20% tolerance (1cc2668df)
- **admin-logs**: implement status filter functionality (a3af15e1b)
- **stage6**: improve style field validation and error handling (39af54f3c)
- **stage4**: reduce motivators min length from 100 to 50 chars (95a3399f5)
- **stage5**: make TODO pattern case-sensitive (f6e1e016d)
- **styles**: add 'microlearning' course style (ab16332df)
- **stage6**: pass course style to lesson content generation (8477e0658)
- **types**: resolve TypeScript build errors (de5a6293e)
- **lint**: resolve remaining ESLint errors in web package (900cba853)
- **lint**: resolve all ESLint errors across packages (f8f0fa82e)
- **course-size**: address code review findings (7b4961d1c)
- **course-gen-platform**: update 2 source file(s) (f839b4b1d)

### Other

- **beads**: journal for the mc2-kkimo closure (e8c99f662)
- **beads**: journal for the tracker closures made during this stage (38f493460)
- **unit**: a silent exclude is not coverage (4d7aa176e)
- **ci**: record that the resolved gid was measured against the host (81127351a)
- **plan**: record the audit-tails plan and its prompt, and the beads journal (8c426f980)
- **agents**: name the order of /push and /deploy so the release loop cannot die again (622aa216a)
- **stages**: remove six stage directories that never got a summary (1681ab7d9)
- **handoff**: 640 lines of history back to 271 lines of current state (9a25b1d37)
- **failure-modes**: record what the archived runs taught, not that they happened (0c9b19f79)
- **career-playbook**: move the handoff chronicle out whole instead of shortening it (341a9b31d)
- **handoff**: six open defects closed, and the release is what is left (d238aee4e)
- **career-playbook**: a critical count at one run per arm is not a measurement (49f9c4b4d)
- the four fixes are verified in live documents, and the runs found three more things (2aedb4e89)
- record the Jina key replacement and the compose interpolation trap (896dc204b)
- record the Jina balance block ahead of the verification runs (c8e9d0d22)
- **career-playbook**: record the 2026-09-01 verification runs and correct block 13 (e0ff8bc37)
- **deps**: pin browserslist above the 2026-09-01 advisory (3deb7636b)
- **routing**: the proofreader runs the model its sibling judge runs (1d41f195d)
- **beads**: sync issue state (36cc6ba65)
- **beads**: sync issue state (ea1cd4f7b)
- **beads**: sync issue state (0358d512e)
- **handoff**: what the fifth arm proved, and what it broke (f36dacf82)
- **beads**: sync issue state (fa53a9e73)
- **career-playbook**: the fourth arm, measured and not oversold (1f0208fcf)
- **beads**: sync issue state (0c39ccfc5)
- **handoff**: what reading the run found, and the two halves fixed (149dbb426)
- **beads**: sync issue state (d33e749ed)
- **beads**: sync issue state (7350a5e61)
- **career-playbook**: the third arm, and the browser step that never had to block (5fc0c4f1e)
- **beads**: sync issue state (0d4557b99)
- **handoff**: the five fixes, measured on two paid runs of the same role (36512b824)
- **career-playbook**: two spec fixtures gain the field the schema now defaults (cf328ba25)
- **career-playbook**: record the audience-aware citation rule in the contract (451420550)
- **handoff**: digest collector measured and capped; audience views cannot ship yet (88317b9eb)
- **career-playbook**: measure the audience split on stored playbooks (51ce98bb4)
- **handoff**: three career-playbook follow-ups closed, two new bugs recorded (b942ce1b7)
- **beads**: sync interaction log (070b19865)
- **beads**: sync interaction log after review closeout (1393e5387)
- **beads**: sync interaction log (f47467891)
- **handoff**: prompt batch delivered, validation blocked on a browser JWT (9e7f1abdf)
- **handoff**: batch the three prompt-side items behind one paid run (16f180f74)
- **handoff**: record the review's open items (8cad81bfc)
- **handoff**: record the do_not_repeat selectivity defer (161fe70af)
- **role-guide**: pin the semantic gate to its own issue text (bb3f5ab99)
- **role-guide**: keep graph evidence reproducible (2766415a9)
- **role-guide**: align graph closeout counts (7949b30ba)
- **role-guide**: record measured audience acceptance (d422f1cf8)
- **orchestration**: accept role guide implementation streams (82be82f9f)
- **career-playbook**: document audience repetition flow (eae656b85)
- **orchestration**: accept role guide audiences (1a7db7837)
- **orchestration**: record role guide baseline (d7bcf302d)
- **orchestration**: accept role guide baseline (c2a07152f)
- **orchestration**: start role guide audience stage (c6e004a6e)
- **playbook**: spec for three readers, and a repetition that can be measured (9250c1be9)
- **beads**: close mc2-11jn5, file mc2-kkimo (7b1c7cb61)
- **beads**: close mc2-rhyac, file mc2-o7tfu (e2e29e507)
- **cost**: sync MODEL_CATALOG with the published OpenRouter rates (605c44601)
- **beads**: sync interaction log after closeout (e54c54d75)
- a one-off acceptance script that was committed by its temp name (1658585f9)
- **handoff**: compact to current state, and Graphify does refresh now (f39d7bba5)
- **handoff**: the five prompts are gone from the code and off the admin screen (fe8489240)
- **rag**: length is not the criterion, and the exercise answer is (a0c234872)
- **rag**: the callout gate is off the lessons, and the prompt raised the callouts (5c5491275)
- **prompts**: the handoff for verifying the callout fix on a live run (ea7e07191)
- **handoff**: dev evidence metrics reach Prometheus labelled as dev (2b72b8783)
- **rag**: the Mermaid fallback is a March scar, not a live defect (9738fd780)
- **handoff**: the prose fallback is Luna, not the model prose was taken from (ae208ce5c)
- **handoff**: the routable set is the live set, and slow endpoints are passed over (b58a0f6b8)
- **handoff**: the model registries are one registry now (2ee4aa13b)
- **handoff**: current state after two days of model work (46f7a02a1)
- **images**: finish the search instead of stopping where it looked good (dda0f53f3)
- **images**: the probe was judging a job the product does not do (186a5e870)
- **rag**: the package for verifying the retrieval change on a lesson (0c3b09172)
- **failure-modes**: two lessons from measuring retrieval (df1989c72)
- **handoff**: the manifest pins the tree, and the host had to be told (1336c8c96)
- **rag**: the half of the Qdrant epic that was never measured (d24740abd)
- **plans**: what the tail of the cost work actually found (0c2d940bd)
- **cost**: the fourth copy of a rate that moves weekly (594a7be81)
- **plans**: what the live run measured, and which counter still means something (377a6c25f)
- **plans**: spec and handoff for the LangChain cost passthrough (9eac7b02d)
- **llm**: flex IS batch pricing, so there was never anything to stack (59a16082e)
- **plans**: luna-pro costs the same per token and 2-4x per call (47f8f2e00)
- **plans**: the batch flex row is advertised, not reachable (3ee3bc5f6)
- **plans**: record what the live run found, including the envelope defect (84e8e7d12)
- **bd**: record the 2026-08-25 epic closeout (f376802cc)
- **handoff**: the epic closed, and one measurement the tickets did not cover (e4931e187)
- **handoff**: the debt epic is six of six, and two claims in here were false (6f645a5a6)
- **handoff**: current state after the 2026-08-24 debt epic (7a6d208fd)
- **bd**: record the four issues closed in the 2026-08-24 debt epic (88490e415)
- **debt**: correct the two items the work proved wrong (bfc523153)
- **debt**: the 2026-08-24 inventory, with the evidence for each item (c19f80c90)
- **q12**: re-pin the deployed-asset manifest for the compose mount change (d6af429bb)
- **notebooklm**: the CDP route is closed by design, with the measurements that prove it (2e7075d74)
- **notebooklm**: the cookie route is closed, and admin was not the missing piece (de3b5a9ed)
- **notebooklm**: record the server account, which was written down nowhere (f37761c85)
- **notebooklm**: --browser chrome does not reuse your Chrome, and the one that does needs admin (9bded917b)
- **notebooklm**: a storage path under /tmp can never work, and the error says nothing (6ad7d583e)
- **notebooklm**: the auth-refresh runbook could not be followed as written (47692be04)
- **handoff**: move the durable half out, and correct what today made untrue (ca0b9e634)
- **orchestration**: park the fix branch that was handed over, not merged (2277d986f)
- **prompts**: name the rows no guard can see, and retire the five that were dead (7a481129e)
- **orchestration**: park the Helixa branches with a reason, not a red gate (8a3b8a23f)
- **handoff**: the Docling stack moved as one set, and three guards came with it (45d874cf4)
- **plans**: record the Docling 1.31 plan this branch executed (38422f2f5)
- **docling**: what the 1.31.0 set actually changed, measured on our own corpus (1c4448601)
- **docling**: the corpus had no content control, so it could not see the fix (ac7e141f4)
- **docling**: one coordinated jump to the set upstream tested together (3e430f466)
- **handoff**: phase 2 accepted on a paid run whose log carried one line, and it was the true one (935363f44)
- **handoff**: the eight warnings are diagnosed, and one of them was a nine-month regression (0a7cb3b92)
- **docling**: docling-mcp 3.0.0 -> 3.1.0, and most of the cache-key wrapper goes (1018f49b3)
- **handoff**: four owner decisions, and the fourteen override rows are gone (d2e4467ce)
- **handoff**: six phases landed, and one prescribed method turns out not to work (6e9021a8c)
- **plan**: three of the four owner decisions arrived, and each carries a trap (0ca001bcb)
- **handoff**: the writing model is settled, and a finished plan stops being current state (9aa3dc16e)
- **handoff**: phase 4 turned out to be five defects of one shape (1654a9f22)
- **migrations**: re-pin the manifest for the two enum additions (78e815ab0)
- four of five phases done, and four lessons that outlive them (4885be7d4)
- **stage7**: name the list that gates enrichment types, and the one that does not (a3051a1e6)
- run the NotebookLM bridge tests, which no workflow ever did (407d8d1f4)
- **plan**: five phases, and the one that has to go first (d7f6fcc06)
- **failure-modes**: three lessons from the day the tunnel turned out to be dead (1e06a5a33)
- **handoff**: three tracks closed, one blocked on a host nobody owns (d9b2a33b1)
- **runbook**: uploading a document no longer breaks the reconciliation (75c30c43d)
- **plan**: four tracks, and two migrations that turned out not to be needed (320fc3503)
- **handoff**: six owner answers, and what each one turns into (cdc4bed57)
- **handoff**: the owner-decisions section was two-thirds stale (10dca7ce4)
- **handoff**: back under the 308-line cap (bef19800d)
- **branches**: the local side too — duplicate backups, a laptop-only promise, four stashes (d74ec0634)
- **handoff**: the branches are swept, so the next session runs the paid acceptance (615ffff33)
- **branches**: delete what delivery leaves behind, and stop it accumulating (8e421cd8d)
- **branches**: write down the 190 shas before deleting the branches that point at them (e0da2bd5d)
- **handoff**: compact to the line limit, and record the standing authorization (c8d5cca4e)
- **beads**: the epic gains the run that proves it and the comparison it unblocks (ef960e4f4)
- **plan**: the next session's acceptance, and what one run cannot show (19e30cb5e)
- **routing**: routing stays on the pinned snapshot, and now for two reasons (27d4453da)
- **handoff**: the cheap judge was the dearest model, and two of three gates were dead (944befd85)
- **handoff**: the attempt names its endpoint, because a hung one never names itself (ec36a0d94)
- add missing orchestration stage templates (71cfa9356)
- make Claude adapter inherit AGENTS (7eb81c739)
- **plan,handoff**: the proof came back negative, and the fix went through the public API (aca67c2ba)
- **plan**: the receipt reaches one call in fifteen, and Stage 4 rejects its own output (f9f0bc20d)
- **runbook**: separate what the last run proved from what this one must test (fee134c93)
- **plan**: the last invented price, and the pin that was never restored (19bf21b16)
- **handoff**: images are priced by a second table, and the 2026-08-20 split was wrong (f499b563b)
- **handoff**: record the 2026-08-21 run, where the reconciliation became arithmetic (aadbe9e9f)
- **handoff**: record the 2026-08-20 paid run and compact what it superseded (cfd50c96a)
- **plan**: why the deepseek calls started hanging, and what to do about it (6a16cc3dd)
- adopt verification evidence v2 (b46c01fe8)
- **beads**: sync interaction log (ee67ef3f2)
- **agents**: a missing local graph is not permission to hand-search (77fa31276)
- **runbook**: how to prove the cost ledger with one paid run (5cf98fbdb)
- **orchestration**: record what the second paid run settled (5330c6e2e)
- **orchestration**: record the rule the cost fixes settled on (04d3bd992)
- **orchestration**: record what the paid run proved and what it exposed (e5f00bacd)
- **orchestration**: record what dev and staging are actually running (ec36b6ce0)
- **orchestration**: name the real reason Stage 7 was unpriced (11a8469b5)
- **stage6**: cover the other judge prompt, not only one of the two (499aa5ac9)
- **orchestration**: the live-run epic is closed; no stage is active (3bd89d0d5)
- **orchestration**: defer the live confirmation the cost fixes still need (65dedf4c4)
- **orchestration**: record the run's second harvest and what is still unproven (fbb091f77)
- **test**: quiet require-await on the stub processors (65e3ea42f)
- **bd**: record the live run and what it found (3579e4cb4)
- **bd**: close mc2-jv7pc (e506ba97e)
- **orchestration**: record the Q12 suite budget and close out mc2-bvynv (77c72a448)
- **bd**: record the review session's issue updates (de962e93f)
- **orchestration**: bring the handoff back to current state (2990d3dbf)
- **orchestration**: record what the live run proved and what still blocks it (6848d1d7c)
- **llm**: state that reasoning-off is said, not implied (aca5a586d)
- **routers**: carry QUEUE_NAME through the queue mock (97b5fa4e8)
- **prompts**: store the pipeline-repair start prompt where start prompts live (d2d58763b)
- **plan**: put the checked handoff prompt in the plan (7262d7224)
- **orchestration**: record what shipped and point at the cost epic (dd75b6b9e)
- **web**: let entrance animations settle instead of springing back (532f00cad)
- **web**: serve the fonts from the repository instead of Google (8a7dfc1c7)
- **orchestration**: record the live run and hand off the follow-up epic (19ba489fe)
- **orchestration**: make the handoff line limit the one that is enforced (2c4487b86)
- **orchestration**: record the phase-config audit and unblock the course run (05c8a7666)
- **orchestration**: hand off the config audit and the course run (f719ee8e8)
- **beads**: close mc2-see4m (3df505a57)
- **rag**: record the live A/B for spec 027 (fec9951ff)
- **rag**: say what the expansion budget actually bounds (e79d65322)
- **orchestration**: record the parent context expansion delivery (96b6ce00c)
- **orchestration**: trim the handoff back under its line limit (ec3078240)
- **orchestration**: record what the two chunking checks actually found (d6c1594fa)
- **orchestration**: correct the duplicate-vector cause and close the two open items (f6f43024d)
- **orchestration**: record the production delivery and the snapshot finding (6bd488412)
- **orchestration**: trim the handoff to current state and record the RAG repair (dbb6d0510)
- **orchestration**: record the routing follow-ups and what they proved (acbc6a1ad)
- **orchestration**: record the model routing rebuild and what must not drift back (6d2bb77a3)
- **orchestration**: record the last two Career Playbook follow-ups (b64f43fe3)
- **orchestration**: record what the drift gate found once it could see (ba3ecbd15)
- **orchestration**: record the accepted quality result (1ca44931c)
- **career-playbook**: specify the v3 fixes and hand them off (1bc8d78f0)
- **career-playbook**: record the editorial read and correct the acceptance (688749159)
- **orchestration**: add the mc2-db696.110 stage summary (abac1ff2b)
- **orchestration**: record the quality v2 acceptance result (7fa676ec5)
- **orchestration**: record career-playbook quality v2 delivery (dfdc2526d)
- **career-playbook**: specify quality v2 and slice the work (7de9ff9d6)
- **career-playbook**: record representative quality review (09cb0b60f)
- **beads**: close pnpm Docker deploy correction (40fbaed28)
- **tooling**: use latest pnpm 10 patch (50a42267d)
- **beads**: close pnpm deprecation upgrade (af1d2d126)
- **tooling**: upgrade pnpm to 10.33.4 (5b6264cac)
- **beads**: close Redis deprecation trace (ad4f50e90)
- **orchestration**: record local gate acceptance (2d624cd97)
- **ocr**: reject tiled fallback above memory gate (95a1f2f46)
- **ocr**: reject docling rapidocr on outlined pdf (ca93b93b4)
- **ocr**: measure outlined PDF engine alternatives (1357e8c71)
- **stage2**: record outlined pdf ocr decision (1e34a1060)
- **orchestration**: record staging delivery (7b11f7d4d)
- **stage4**: allow evidence resume under CI load (567566726)
- **orchestration**: close dependency audit stage (57fadc122)
- **orchestration**: close the release audit stage (e7b015675)
- **orchestration**: record staging delivery (fe9652ba5)
- **orchestration**: record release acceptance (998782668)
- **orchestration**: record console integration (cdddd356a)
- **q12**: guard long catalog identities (c36adc111)
- **career-playbook**: cover follow-up transition (22234881b)
- **e2e**: document current Playwright suites (968d8d513)
- **orchestration**: record prompt checker compatibility fix (7d8e4b8eb)
- **qdrant**: split reindex coverage for lint (e1857fadc)
- **orchestration**: record formatting delivery (242f351fd)
- **format**: restore monorepo Prettier baseline (9916d22c9)
- **orchestration**: close qdrant off-host stage (0ce2963e1)
- **orchestration**: close mc2-c2p8z (dfb9f4503)
- **orchestration**: start mc2-c2p8z (7980536d5)
- **orchestration**: close mc2-2vtmk (d17630b76)
- **orchestration**: record GHCR root cause (dc0eb563f)
- **orchestration**: start GHCR credential stage (28cd39c46)
- **orchestration**: close mc2-q1ggs (1b8fec54b)
- **orchestration**: start mc2-q1ggs (43e98f24b)
- **orchestration**: close mc2-3sz3d (46e64e30c)
- **orchestration**: start mc2-3sz3d (d92394728)
- **orchestration**: close mc2-sznhi (d88dd3dbb)
- **orchestration**: start mc2-sznhi (a1d2019d1)
- **orchestration**: close mc2-dqbw1 (a50cef60f)
- **orchestration**: start mc2-dqbw1 (5f4941eb9)
- **orchestration**: close mc2-1ugj1 (244a24ffe)
- **orchestration**: start mc2-1ugj1 (da60d5bb6)
- **orchestration**: close mc2-raw1i (9eaf5148a)
- **orchestration**: start mc2-raw1i (11ac9b720)
- **orchestration**: close mc2-bswhl (775582add)
- **orchestration**: start mc2-bswhl (aaf849939)
- **orchestration**: close mc2-ekaup (7723b1874)
- **orchestration**: sync run_stage_closeout.py to the current harness template (8a071921b)
- **specs**: re-rank the remaining work by consequence, after the triage (f225267fa)
- **handoff**: the uploads now have an off-host copy, and nine sources are gone (7b8bd6634)
- **handoff**: record the owner's LanguageTool retirement, 62 -> 53 (2b71de50e)
- **orchestration**: sync run_stage_closeout.py to the current harness template (b17f56a25)
- **orchestration**: mark the triage stage accepted in its own summary (72a618d0b)
- **orchestration**: triage the backlog against the code, 89 -> 62 (489cfa1a8)
- **specs**: specify the remaining-debt work, triage first (ad80c7c95)
- **ops**: Serve 1.30.0 is live; the Docling wrapper debt is half repaid (915c27456)
- **docling**: the overlay now pins docling-core DOWN, and why that is deliberate (468d3bd9f)
- **docling**: take the upstream heading-hierarchy fix, drop our wrapper (326651b33)
- **beads**: record today's Docling verifications and the deferral (5232f7eae)
- **ops**: one wrapper's upstream fix has shipped, and the tests did not say so (b2d558edf)
- **ops**: chart extraction is owner-deferred long-term, not "next" (6b9696ac1)
- **ops**: the serve-version fix is deployed and verified live (70a6d9c8f)
- **orchestration**: stop committing closeout lock files (8e49d4a0a)
- **docling**: three probes, not two (59a64e111)
- **docling**: record the new-document probe the criterion asked for (56240e87b)
- **docling**: accept Stage E on what was actually measured (021f9e067)
- **ops**: record the chunk-strategy flip and what still proves it (fe0661dd0)
- **beads**: close the rollback rehearsal on measured evidence (51ade2fe9)
- **ops**: the rollback is repaired but still unrehearsed (435628730)
- **beads**: close the five review findings, file the rollback rehearsal (8cbb61920)
- **ops**: carry the review findings into the handoff (3aa9cdfa5)
- **ops**: record the Stage E image deploy and the flip that is still pending (3debb8bf4)
- **beads**: close Stage D on the measured rejection (01d1d75b8)
- **beads**: record Stage D reconnaissance on mc2-1sobq.4 (0732e3bb6)
- **beads**: close Stage C on delivered evidence (cafacecd3)
- **docling**: record the Stage C acceptance at the delivered head (57d995956)
- **beads**: close the rollout gate bug on delivered evidence (fe4589114)
- **ops**: record the parallelism-timeout test that is not a stop (8058c5e9c)
- **docling**: record the graph review at the delivered head (93d6d5fb1)
- **docling**: accept Stage B with the router wired (b0935c935)
- **docling**: record Stage B and retire two plans it supersedes (161b1ea33)
- **docling**: record the graph review at the delivered head (cede45d93)
- **docling**: accept Stage A on evidence that measures production (62fb9d169)
- **docling**: record the graph review at the delivered head (a0dc1da44)
- **docling**: withdraw the chunking candidate and reopen Stage A (92f0a9270)
- **docling**: correct the harness docblock and record the graph review (3a5019603)
- **docling**: record production rollout (3a708cefe)
- **backup**: record the lever that stopped existing, and the red that was hiding behind a label (402b7692d)
- **ops**: stop reading a real red as the parallelism flake it is not (2afc897f2)
- **stage**: record the measurement, the raised ceiling, and what it does not fix (c88ca5420)
- **handoff**: move the durable lessons out from under the current-state cap (cd99daba1)
- **stage**: record the review round, and replace the cause guess with a measurement (39611f212)
- **beads**: record the mc2-0tcyw interaction log (35ea2ab00)
- **stage**: record the mc2-0tcyw closeout, and why the transient itself is still unnamed (50b8478f6)
- **agents**: stop the contract from contradicting its own verification cadence (dc7a75bbe)
- **stage**: record the mc2-jz6y0 closeout, including the graph refresh the contract requires (f826b3a7e)
- **backup**: record the owner's local-for-now decision, and the one thing it does not cover (4e34530fb)
- **qdrant**: retire the Q12 track bead by bead, and stop recommending a bug that does not exist (6e8362747)
- **qdrant**: record the rollback my own gate caused, and the real PDF diagnosis (6e3d33eb8)
- **qdrant**: restore the handoff fields the process check requires (f16b04dc1)
- **qdrant**: record the repair, the proven backup chain, and the two delivery gaps (553fd807b)
- **qdrant**: record the partial reindex, the last four defects, and the backup state (76c41b7bc)
- **qdrant**: record the partial reindex, the nine defects, and the enabled timers (6bcb162dd)
- **qdrant**: record the completed recovery, the five defects, and the real counts (0cf1ddf3b)
- **q12**: retire the window track and record what still blocks the reindex (9f9e6b92a)
- **lint**: make pnpm lint and lint-staged agree (519a6e503)
- **q12**: hand off the remaining Qdrant reindex work to a new orchestrator (331f8504e)
- **ci**: assert the worker compose project pinning, not just its old literal (ecc43dc9d)
- **q12**: record the C4 restore fix and the comparison blocker it uncovered (mc2-fxlne) (829ee29d1)
- **q12**: regenerate the deployed-asset manifest at the delivered tree (mc2-wl5vn) (8b7887c2e)
- **harness**: согласовать текст правил bd и сообщение closeout (44d368f15)
- **harness**: убрать дублирование CLAUDE.md <-> AGENTS.md, снять мандат на push (9b785320d)
- **q12**: regenerate the deployed-asset manifest at the delivered tree (mc2-rjy9k) (1b0a4f596)
- **q12**: regenerate the deployed-asset manifest at the delivered tree (mc2-bh3ef) (da2ee79ac)
- **q12**: plan and orchestrator prompt for establishing the window env before opening it (8ed6aad26)
- **q12**: record attempt #16 — C3 cleared, C4 hit the same frozen-HOME cause (62e2df6ea)
- **q12**: regenerate the deployed-asset manifest at the delivered tree (mc2-1cxna) (288ded39d)
- **q12**: record attempts #14/#15 — both C3 causes named and fixed (mc2-1cxna) (3dff3377c)
- **q12**: regenerate the deployed-asset manifest at the delivered tree (mc2-1cxna) (da96c56ac)
- **q12**: regenerate the deployed-asset manifest at the delivered tree (mc2-1cxna) (46d9cc374)
- **q12**: record attempts #12/#13 — C1 and C2 now pass, blocker at C3 (mc2-1cxna) (262ea5911)
- **q12**: regenerate the deployed-asset manifest at the delivered tree (mc2-1cxna) (e2461b89e)
- **q12**: regenerate the deployed-asset manifest at the delivered tree (mc2-1kcbv) (63b138167)
- **q12**: regenerate the deployed-asset manifest at the delivered tree (mc2-awi6q) (bca4d8672)
- **beads**: close the delivered mc2-2rzf6 (search_path fix is probe D1) (9a6344710)
- **beads**: record the attempt #11 round (mc2-awi6q, mc2-ivjyb, mc2-lzft4 closed) (1d3cbf586)
- **q12**: record window attempt #11 and the mc2-awi6q C2 blocker (e382f7b5a)
- **q12**: gate the W7a head-1 recover leg on the uid-1000 run-root identity (8b53e9e43)
- **q12**: record window attempt #10 and the mc2-lzft4 blocker (d7471efe9)
- **q12**: record the mc2-1sns3 recover-threading round and the window rulings (9c94287e2)
- **q12**: settle the window identity and capability rulings, close mc2-1sns3 (4c6ff0d91)
- **q12**: orchestrator prompt for finishing the window, and correct the handoff's readiness claim (e36ff27e1)
- **beads**: record the mc2-38ivn review round (58356e307)
- **q12**: handoff points at the current green pre-flight report (mc2-38ivn) (fd3a5f019)
- **q12**: regenerate the deployed-asset manifest at the delivered tree (mc2-38ivn) (089cc7880)
- **beads**: record the mc2-38ivn session (7ff70d579)
- **q12**: handoff and stage summary record the delivered B3 fix and the green report (mc2-38ivn) (49e935b5f)
- **q12**: regenerate the deployed-asset manifest at the delivered tree (mc2-38ivn) (1435aab94)
- **beads**: record mc2-ot8se session interactions (56e85348e)
- **q12**: keep the handoff current-state only and under its 200-line cap (mc2-ot8se) (cc6a45a7a)
- **q12**: handoff names the pre-flight command, the fresh run root and the B3 blocker (mc2-ot8se) (4d2697f88)
- **q12**: move the #7-#9 defect chronology to the stage summary, keeping handoff under 200 lines (mc2-ot8se) (0020aa30a)
- **q12**: shared managed-privilege fixture (non-superuser role, foreign owners) (mc2-ot8se) (7bc64793b)
- **q12**: backtick the globs so prettier stops escaping them in the prompt (f5570c43b)
- **q12**: grant the pre-flight full authority and extend it to a green report (mc2-ot8se) (9de76ab2f)
- **q12**: bind the pre-flight contract to its bead id (mc2-ot8se) (50bf9f927)
- **q12**: window pre-flight contract, plan and orchestrator prompt (mc2-ot8se) (5c0ed51de)
- **handoff**: record attempts #7-#9, the production restore, and the two P0 fixes (82cd388b5)
- **q12**: record the completed pre-window steps (mc2-34eua) (1b289dc4e)
- **q12**: point the rehearsal README at the current barrier sha f4f90361 (0ad4b7409)
- **qdrant**: record window attempt #6 and the ACCESS EXCLUSIVE lock wall (caf87f6d0)
- **qdrant**: the window is unblocked again — all seven blockers closed (7bcc4d736)
- **qdrant**: record window attempt #5 and the cron.job permission blocker (1fcdc2577)
- **qdrant**: record window attempt #4 and the frozen DSN contradiction (a7975dea2)
- **qdrant**: the window is unblocked — record all five 2026-07-27 fixes (b69248eb6)
- **qdrant**: separate --release-sha from --operator-digest in the window record (890cfd987)
- **beads**: close mc2-f2il0 (CI sudo-probe determinism) (ada003722)
- **qdrant**: record the C1 barrier-input fix and two new window blockers (4e65d123f)
- **qdrant**: record the three window attempts and the C1 barrier-input blocker (ec43105c1)
- **qdrant**: record the Q12 window preflight failure and its root cause (mc2-wwc9l) (399470d92)
- **qdrant**: record the Q12 pre-flight stop and the two release-pin blockers (5aae4d767)
- **beads**: record the branch-audit and stranded-commit interactions (d40f3e0ed)
- **codex**: record the 2026-07-27 branch audit outcome (9b459d168)
- **codex**: retire the stale plan branch and record the develop consolidation (90364b2a7)
- **qdrant**: record the root-owned writer-resume precondition found by the host smoke (b24f5639f)
- **codex**: record the Q12 execution-identity amendment and the revised pre-window sequence (ce2c3aede)
- **codex**: record the Q12 window controller fix and pre-window staging state (e2e61f23e)
- **codex**: restore current-state-only handoff; move history to the stage summary (701587c03)
- **qdrant**: Q12 pre-window staging complete; record C5/C6 accepted-coverage hard gate (mc2 Q12) (af5e4b3d2)
- **qdrant**: delta-review PASS for d3cb0ee43; fold hash-constant dedup into post-window defer (mc2-af1ay) (e840c1280)
- **qdrant**: record independent review PASS + P2 schema-consolidation defer (mc2-af1ay) (19953fdcb)
- **qdrant**: Q12 W7 handoff v2026-07-24 + staging-complete state (mc2 Q12) (f384b1621)
- **qdrant**: pin generator→operator byte contract with a round-trip test (72f0aa378)
- **q12**: record .13.4.1 staging leg — generator delivered, hard-gate finding on career_playbook_sources (096dddbad)
- **q12**: record 2026-07-23 window-prep checkpoint — re-deploy done, fresh plan green, .13.4.1 staging gap (a06790241)
- **q12**: record emit-wiring review closure + protected_hardlinks precondition (74fe35cd5)
- **q12**: record acceptance-emit wiring closure + new window preconditions (mc2-1sns3) (fd9f0f886)
- **q12**: W7 live-window orchestrator readiness handoff (mc2-i9h3y) (f1a820a5b)
- **q12**: record W7a real-leg code seam delivery + remaining window defers (mc2-1sns3) (62d8c2bd2)
- **q12**: declare develop as single source of truth (owner-directed) (8961364f4)
- **beads**: record delivered Q12 .13.7 gate closures (cfdb53daa)
- **beads**: close Q12 local correction wave (W/M/H/D5J), block live tail (30b3b3b5c)
- reconcile orchestration baseline v2.16 (2da3a5114)
- **q12**: record W7a real source.forward acceptance emit as bounded W5/W7 defer (10f29b912)
- **q12**: W7a inc4 — production staged threading is recover re-drive-safe (10132f5aa)
- **release**: bump to 0.31.41 — deploy self-hosted Qdrant platform to dev (50f670b9b)
- **q12**: gate the round-12 equality-diagnostics run-dir suite too (mc2-smsjx) (c8624cd9b)
- **q12**: gate real-controller ops suites for generic CI; require Python 3.13 (mc2-smsjx) (531a8e4b8)
- **deploy-contract**: anchor operator-digest ordering check to the main blue/green flow (mc2-smsjx) (28a308b0b)
- **handoff**: Q12 window W2/W3/W5/W6 + CLI wiring delivered; only owner-gated W7 remains (75074f85c)
- **q12**: window operator runbook v2 (W6 mc2-naz8j) (e3b5148e5)
- **q12**: W5 production value machinery rehearsal on disposable PG17 (mc2-v68w6) (27d5b2e12)
- **q12**: executable W2/W3 staged-execution plan + beads sequencing (7c792f311)
- **q12**: empirical W2/W3 grounding — real PG17 path verified, scope pinned (9c49d8599)
- **q12**: W2+W3 staged-execution co-design + W4 delivery handoff (149977fab)
- **handoff**: Q12 window wiring — W0+W1 delivered, W2/W3/W4 coupling found (4f8d22473)
- **q12**: fix wrapped constraint bullet in handoff prompt (aeb9cb14a)
- **q12**: handoff package — live-window execution wiring is un-done (verified) (d8739f57e)
- **q12**: artifact — rehearsal driver v (bounded server-mechanics probes, #21) (0e5b8808f)
- **q12**: re-scope R8 server rehearsal to bounded mechanics probes (#21) (4fc67c912)
- **q12**: rehearsal server-mechanics probes (RED — driver v, found-defect #21) (d7812d2d1)
- **q12**: rehearsal import-surface — skip **pycache** in deploy-subset copy (P2) (63a92c72b)
- **q12**: rehearsal import-surface — skip **pycache** in deploy-subset copy (P2) (bf917d51d)
- **q12**: assert rehearsal driver server-import surface (found-defect #20) (29133e10f)
- **q12**: rehearsal driver + review artifacts (P1 fixed, safety design PASS) (4b7aff7c7)
- **qdrant**: Q12 R8 rehearsal driver runbook + delegated artifact (471e312a5)
- **qdrant**: cover Q12 R8 rehearsal driver (no-docker) + captured run-root fixture (d3521d9df)
- **q12**: pin the RATIFIED R8 server custody rehearsal driver blueprint (4a1a29101)
- **q12**: R8-B closing review artifact (PASS/PASS, 2 informational) (9d7c00ac0)
- **q12**: DECISION-2 operator-truth sweep + (c) rehearsal defer for found-defect #19 (2d845235b)
- **q12**: RED gated real cutover cleanup-crash recover convergence probe (d4c390b65)
- **q12**: R8-B-2-iv-2 artifact + plan-log; P3-1/P3-2 label fixes (d0f30b987)
- **q12**: RED gated real-PG17 composed-recovery crash+refusal probe (ef518f4d9)
- **q12**: remove the one-off alert-secrets install workflow (done — files on server 0400 nobody) (a997a7019)
- **q12**: trigger the one-off alert-secrets install on branch push (6f2727ec1)
- **q12**: one-off workflow to install Alertmanager Telegram secrets (reuses deploy bot) (57dc0a4a5)
- **q12**: R8-B-2-iv-1 review artifact (PASS/PASS, 3 informational) (ab0d8865b)
- **q12**: iv-PART-1 FULL GREEN — #16 + #17 fixed, finalize artifact (b5c79c61f)
- **q12**: iv-PART-1 FULL GREEN — cleanup-child trust-view rewrite (#17) (16068fc77)
- **q12**: record #16 fix + iv-PART-1 resume hard stop at cleanup (#17) (f17427db6)
- **q12**: RED strict-accept unit for write_install_baseline (#16) (f59b17934)
- **q12**: record R8-B-2-iv-1 found-defect #16 + sanctioned hard stop (e8696ab63)
- **q12**: R8-B-2-iv-1 full-window run_live harness reaches found-defect #16 (baseline collision) (49f415251)
- **q12**: RED R8-B-2-iv-1 full-window real run_live probe (DUAL-BIND fusion) (4fd3dd26b)
- **q12**: amend iv-PART-1 blueprint step 4 per ratified found-defect #15 (dual-bind) (8537c6000)
- **q12**: pin the R8-B-2-iv-1 build blueprint (OPTION-2 split, execution-ready) (f7c25ffa5)
- **q12**: mark the R8-B-2-iii guard_residue_db live query LOAD-BEARING (stage-iii review P3-1) (a4e75118e)
- **q12**: R8-B-2-iii review artifact (PASS/PASS, 3 informational) (e3618db0e)
- **q12**: record R8-B-2-iii real barrier cleanup + R8-B-1 seam artifact + plan log (f508b31be)
- **q12**: RED — extend real verify-chain with barrier cleanup + R8-B-1 seam + SQLSTATE probe (1cbe848c6)
- **q12**: R8-B-1/2-i backfill review artifact (PASS/PASS, informational only) (4c90aee86)
- **q12**: defrost frozen-byte review artifact (PASS/PASS at adc927305) (d48a6441e)
- **q12**: R8-B-2-ii defrost cascade — W-tuple {4,5,6} succession + artifact (adc927305)
- **q12**: R8-B-2-ii real prepare-recovery + activate + #14 anti-weakening probe (28aafa738)
- **q12**: RED repro for defect #13 cron.job restore-loop ambiguity (R8-B-2-ii defrost) (bc765ba56)
- **q12**: record R8-B-2-i verify-extended chain artifact + plan-log (81d83c9f5)
- **q12**: real-PG17 barrier verify-extended chain (R8-B-2-i) (ec58f75e4)
- **q12**: R8-B-1 real ProductionExecutor file-artifact seam artifact + plan-log (a15f54eef)
- **q12**: RED R8-B-1 real ProductionExecutor post-activate file-artifact seam (365b5b745)
- **q12**: R8-I round review artifact (PASS/PASS, P3 derive_run_id resolved as fixture-scope) (c52106c29)
- **q12**: R8-I-C §6b.6 derived-journal oracle + found defects #11/#12 + artifact (8e8bd08f5)
- **q12**: RED R8-I-C §6b.6 composed mid-barrier recovery probes (ef68d9059)
- **q12**: R8-I-B artifact + plan-log + §6b.2/§5.5 implementation landmarks (c8f1ad3d9)
- **q12**: RED for R8-I-B generalized Option A recover dispatch (1f9ac9c82)
- **q12**: record the R8-I-A journaled cleanup-segment round (58813fc50)
- **q12**: RED for the journaled post-activate barrier.cleanup segment (R8-I-A) (ff511e255)
- **q12**: sync R8 amendment review artifact (interdiff-duty verification line added by reviewer) (b4d2ae1ee)
- **q12**: R8 amendment review artifact (PASS/PASS at 94ede2145, P3-1 resolved) (1a56fa6bf)
- **q12**: R8 post-activation design amendment on clean R5 base (journal-based, [awaiting review]) (94ede2145)
- **q12**: R5 round pre-merge review artifact (PASS/PASS, 2 P3 defers to R8) (7e873c2e2)
- **q12**: record R5-F pre-flight gate-placement fix (plan log) (704944cdc)
- **q12**: RED — pre-flight post-activate wiring gate for live/recover (R5-F fix) (94645fdae)
- **q12**: R5-D2 — composed recover operator procedure (design §5.5) + plan log (944945885)
- **q12**: RED — recover mid-barrier refusal points to the supervisor operation (R5-D2) (501fc065a)
- **q12**: record R5 Sub-round F — operator-reachable live/recover CLI + production fail-closed post-activate gate (79edaf25b)
- **q12**: RED — operator-reachable live/recover CLI routing + production fail-closed post-activate gate (R5-F) (9bcc3a38e)
- **q12**: record R5 Sub-round D — run_recover (RULING 2 RECOVER SCOPE) (f1334bf6c)
- **q12**: RED — run_recover resumes C7/crash-after-FWM, fails closed elsewhere (R5-D) (78e8d797e)
- **q12**: record R5 Sub-round E — post-activate receipt-only cleanup + resume (7f7458259)
- **q12**: RED — run_live records post-activate receipt-only cleanup + resume (R5-E) (1ca451f56)
- **q12**: record R5 Sub-round C — run_live cutover-window marker write (89a8495ef)
- **q12**: RED — run_live writes the cutover-window marker (R5-C) (4070ed81e)
- **q12**: record R5 Sub-round B — run_live full 76-row forward twin (e7461d4cf)
- **q12**: RED — run_live full 76-row forward twin (R5-B deploy.commit + activate) (c48f2ca93)
- **q12**: record R5 Sub-round A forward FWM parity (done) (39c4542c4)
- **q12**: RED R5 Sub-round A forward final-writer manifest (FWM) parity (5bc73c08f)
- **q12**: succession notes on design/spec barrier-sha citations (134255ce -> 3673ee49) (98219084e)
- **q12**: record cascade round evidence + frozen-sha sweep classification (cf4383e66)
- **q12**: add load-bearing CI guard for W-tuple frozen-byte fields (59ee69f96)
- **q12**: amend W-tuple field-4 to the ratified fixed barrier sha (4774558b4)
- **q12**: source-manifest round review PASS/PASS (2 P3 + 1 informational) (fcd981b10)
- **q12**: record defect-7 four-site order-symmetry fix + C acceptance rc=0 (bb069e590)
- **q12**: RED — validateTransition baseline-vs-cutover order asymmetry (4 sites) (432fe3bd0)
- **q12**: record defect-4 fold-in (cron.job active row_sha256 normalization) (18cb2fa8d)
- **q12**: RED — focused real-PG17 proof of cron.job active row_sha256 defect (f7af63e0c)
- **q12**: record guard-surface reconciliation round evidence (4b6758c80)
- **q12**: RED — no-docker proof of stale q12_guard source-manifest allowlist (f64e3ff05)
- **q12**: barrier-fix review PASS/PASS (2 P2 follow-ups, 1 P3) (defe14fbe)
- **q12**: record frozen-barrier-fix round (maintenance_guarded acceptance) (3596aa729)
- **q12**: RED frozen-barrier-fix round — real-PG17 acceptance harness (aee28c6ec)
- **q12**: record R4 Sub-round C sanctioned hard stop (real barrier defect) (6e86d5387)
- **q12**: RED R4 Sub-round C real barrier install vs validateTransition (270f62a46)
- **q12**: record R4 Sub-round B real deployed wrapper barrier claims (done) (11e8c29c7)
- **q12**: RED R4 Sub-round B real deployed wrapper barrier claims (605d359b2)
- **q12**: pin non-negotiable pre-window server-side run_live rehearsal gate (2991666a5)
- **q12**: record R4 Sub-round A ordinary-execution seam (done) (5b4365181)
- **q12**: RED R4 Sub-round A ordinary-execution seam coverage (a478a2106)
- **q12**: W-amendment review PASS/PASS (2 P3 + 1 informational) (e506a5283)
- **q12**: record OQ1 W-amendment round artifact (mode-aware quiesce) (241ee4e2f)
- **q12**: RED OQ1 mode-aware quiesce cutover-window coverage (P2-1/P2-1b) (fd7d2273e)
- **q12**: W-amendment note — expanded P2-1/P2-1b relaxation surface (note-first) (35b9e9118)
- **q12**: record R3 done (resource-manifest 2-step binding + C7-boundary ruling) (7defce2a9)
- **q12**: RED R3 resource-manifest 2-step binding + full-forward parity (a29357b09)
- **q12**: record R2 Option-B revision (tool byte-untouched, real host client) (4bff09fd7)
- **q12**: record R2 done (baseline producer + client-override seam lockdown) (85b91e9ba)
- **q12**: RED R2 baseline.json producer + client-override seam lockdown (4dd31e5fb)
- **q12**: pin deferred full validateTransition-positive as R4 acceptance criterion (bb37a4bd9)
- **q12**: record R2 build spec + R3 exclusion/topology constraint (ff2fee7d1)
- **q12**: record ratification refinements (in-process barriers, OQ6 producer/timing, parity) (7da2225a3)
- **q12**: live-controller design review PASS/PASS (P2 x1, P3 x2) (6664f44b9)
- **q12**: record R1 done + parity-wording correction + barrier-orch question (e6240dd43)
- **q12**: RED R1 live-controller genesis parity + production seam (264fefe0c)
- **q12**: OQ1 quiesce window-mode amendment mechanism note (19d8ac15b)
- **q12**: draft Task-9 live-controller design + plan (OQ1-OQ6) (f1f771a50)
- **q12**: record window blockage — live controller remains Task-9 scope (5e0574b41)
- **q12**: window-operator procedure research — six open questions block window open (c8749ce0a)
- **q12**: rounds 8-19 independent review PASS/PASS, C1 clear (5ea2b359c)
- **q12**: record rehearsal #13 success and rounds 8-19 review-in-progress in handoff (aa655464f)
- **q12**: record round-19 migration-modified-identity allowlist (545cde114)
- **q12**: RED round-19 allowlist a migration-modified pre-existing function (7e60ae67c)
- **q12**: record round-18 search_path-independent catalog reg\*-name checks (994ef961d)
- **q12**: RED round-18 pgcrypto digest check must be search_path-independent (f3bff0caa)
- **q12**: record round-17 read-only override lift before migration phase (cf18da61e)
- **q12**: RED round-17 isolate left read-only after drill restore (f78e03a85)
- **q12**: record round-16 frontier assertion repair for MCP-generated history (e6551d637)
- **q12**: RED round-16 repair frontier assertion for MCP-generated history (37368792a)
- **q12**: record round-15 delta-neutral extras in the completeness gate (5fff4b67c)
- **q12**: RED round-15 delta-neutral extras in completeness gate (163c73644)
- **q12**: record round-14 dump-stable completeness identities + per-section table (2d1049d2e)
- **q12**: RED round-14 dump-stable completeness identities (07d158ba6)
- **q12**: record round-13 delta-composed live-hash prediction (§2 method correction) (3dc9b5204)
- **q12**: RED round-13 delta-composed live-hash prediction (461409a75)
- **q12**: record round-12 equality-diagnostics preservation (dccd3897d)
- **q12**: RED round-12 preserve equality-diff payloads behind argv flag (33e277947)
- **q12**: record round-11 structural equality-proof diff diagnostics (0c50c1904)
- **q12**: RED round-11 structural equality-proof diff diagnostics (d28bdae1e)
- **q12**: record round-10 tsx runner fix + resolution sweep (2f1eb758d)
- **q12**: RED round-10 drill tsx runner resolves via package shim (268677a1b)
- **q12**: record round-9 drill diagnostics + scheduled-mode + post-preflight sweep (66da5d00a)
- **q12**: RED round-9 drill failure diagnostics + q12_guard reproduction (4e3fc6fbe)
- **q12**: record round-8 drill generation preflight contract + item-4 (18b754dbf)
- **q12**: RED round-8 drill generation contract + run-dir cleanup (0791805ed)
- **q12**: record C0 owner approval, plan-builder reviews, handoff for pre-C1 rehearsal (2c74b4fb4)
- **q12**: fix round-7 summary formatting (glob notation broke markdown) (7764cfb48)
- **q12**: record round-7 review hardening (P2-1/P2-2, P3 a-d, notes) (7cab00ff4)
- **q12**: RED production seam lockdown + persist-handle write/read binding (4e752470f)
- **q12**: record snapshot coordinator + roles-consistency fix (1ee6a6651)
- **q12**: RED snapshot coordinator fails closed on a malformed id (b32ce5ed8)
- **q12**: record marker-gated readiness fix + four-run stability (3c5f13dac)
- **q12**: record production drill-seam consumption + dbname routing (5fcea1d8a)
- **q12**: RED drill-seam consumption + restore_test dbname routing (0e2cae749)
- **q12**: record §3 role bootstrap fix, P2 streaming, P3 loopback confirmation (7b92ccf2c)
- **q12**: RED §3 allowlisted role bootstrap in the live restore leg (dc0d9cc66)
- **q12**: record P3 hardening + restore-drill persist seam; scope drill consumption (6336586a1)
- **q12**: RED restore-drill persist-and-handoff seam (28e75d8c8)
- **q12**: fail-closed capture seam inputs + bool-as-int pin (reviewer P3) (864da98ff)
- **q12**: record delivered live plan orchestration in stage artifact (950d6a839)
- **q12**: RED live plan restore/migrate orchestration suite (ee04d5551)
- **q12**: record plan-builder stage artifact mc2-jz6y0.13-plan-builder (9f9a32c8f)
- **q12**: RED plan-mode expected-catalog builder suite (a46c61732)
- **q12**: assemble Task C0 live-cutover window packet (owner gate) (c1d0ca611)
- **q12**: conform review artifacts to the orchestration artifact schema (266de3d74)
- **q12**: close Root .13.13 join — reviews, integration deltas, Phase A wrap (35f0a2d3a)
- **q12**: record Task 9 joined controller smoke/observation + D6 frame join (dc6c2093a)
- **q12**: RED Task 9 D6 real frame envelope + R-handshake join (0f3721892)
- **q12**: RED Task 9 smoke/observation gate evaluator (5f34150aa)
- **q12**: record the D6 integration — artifact, reviews, handoff, summary (8717f7ac7)
- **q12**: RED D6 3-point snapshot discipline (DF1) (687ad0cbf)
- **q12**: RED D6 restart authority enforces seal-predecision binding (91f254b27)
- **q12**: RED D6 rewind validated secret descriptor for child read (83bf8b724)
- **q12**: RED D6 production inspect entrypoint + E2E assembly (F1) (ab5d43325)
- **q12**: RED D6 terminal seal binds its predecision hash (a0d6c0ef8)
- **q12**: RED D6 secret identity revalidated after read (a5b8ba85d)
- **q12**: RED D6 canonical NFC cross-stream hash parity (a370fc2b5)
- **q12**: RED D6 session_activity sentinel coalesce (F2/F3) (2fa497dbe)
- **q12**: RED D6 full-run classification scenarios (PG17) (6856b8400)
- **q12**: RED D6 D5 post-R narrowing + race + restart authority (06d50ac0c)
- **q12**: RED D6 runtime FD baseline (e7dc83fe6)
- **q12**: RED D6 predecision/optional-R/terminal-seal authority (8b1164660)
- **q12**: RED D6 production CLI/env/FD negatives (a1071e628)
- **q12**: RED D6 pidfd/ptrace/proc/OFD gates (b7f1769a3)
- **q12**: RED D6 request + frame payloads + protocol (1c0e88f58)
- **q12**: RED D6 writer ancestry + 10+5 Docker truth (3257f9855)
- **q12**: RED D6 H/N evidence table (d0ffd1c34)
- **q12**: RED D6 db/host projection key sets + invariants (dc790f26f)
- **q12**: RED D6 managed inventory + session projection + drift (83e0861aa)
- **q12**: RED D6 common-lock conflict + ordering (normal/recovery) (d28d05a33)
- **q12**: RED D6 posix_spawn FD map/close-from under pressure (b7176bffd)
- **q12**: RED D6 transaction + full-catalog SHARE + allowlist (ecd5dc5ee)
- **q12**: RED D6 capability/lock-privilege/visibility gates (4399fe8dc)
- **q12**: prove five retained commands/hashes unchanged under D6 (aeebaff17)
- **q12**: RED D6 connection identity + TLS asserts (db49b95bf)
- **q12**: RED D6 SQL projection allowlist + hash bind (00f37d570)
- **q12**: RED canonical/frame envelope for D6 probe (243382ea2)
- **q12**: RED ratified managed-session inventory pin (W-tuple field 11) (6515c5bf2)
- **q12**: restore the required next-stage handoff phrase (1535a56b9)
- **q12**: trim handoff to the 200-line budget (dff63c45d)
- **q12**: point the handoff starter at the full-completion package (dd214dd5d)
- **q12**: author the full-completion spec, plan, and orchestrator prompt (c8da2f786)
- **q12**: compress superseded handoff bullets under the line budget (4fd2bdfa9)
- **q12**: point the live-window handoff at the provisional field-11 freeze (2a950bb4e)
- **q12**: record delivered .13.7 gate in handoff and stage summary (ad57a2411)
- **q12**: record the delivered .13.7 backup/restore gate in the runbook (b97a827b4)
- **q12**: bound manifest array diff samples with per-path totals (f839778cf)
- **q12**: report manifest array diffs as canonical sets (6d106e55b)
- **q12**: surface pg_dump stderr on scheduled dump failure (8422fa2c0)
- **q12**: print truncated diff paths on manifest comparison mismatch (850ecf151)
- **q12**: report the observed GUC triple on isolated setting proof mismatch (f90f73427)
- **q12**: record W/M/H/D5J local completion, blocked live tail, release matrix (73a7b6ee3)
- **q12**: close three P2 review findings on the live-cutover surface (29d73d045)
- **q12**: fix field-1 reproduction recipe (base commit, not branch HEAD) (43fddcea8)
- **q12**: record field-10 canonicalization as lead-ratified pending review (1fe3a267e)
- **q12**: DB-gated guard-ordering test + document barrier-owned rollback teardown (2ebd2461e)
- **q12**: apply tuple rulings — field 2 resolved, Option A two-layer, assets (d36d9a336)
- **q12**: mark the activation common-lock mechanical proof delivered (2e9e39406)
- **q12**: mechanical PG17 proof of the activation common-lock control-flow (2143bfd01)
- **q12**: prove connection-source mutual exclusion in the runnable unit suite (2d2ecd008)
- **q12**: freeze the accepted-W activation tuple evidence (fields 1-10 derived, 11 stopped) (97086b06b)
- **q12**: fix D6 plan Task 15 + Global Constraint 4 for the accepted twenty-command manifest successor (6183d87b8)
- **q12**: freeze D6 activation-truth contract + implementation plan (a200c072a)
- **q12**: migrate the last 8 fabricated-path resume cases to joined (a75c8b15d)
- **q12**: reshape the section-5 phase/entry-mutator negatives onto joined-append (673be7214)
- **q12**: cover rollback held=5 via the extended partial-capture lever (514cc128c)
- **q12**: D2 duplicate-FWM-pair as a native section-5 joined-mutation negative (fba4eff3e)
- **q12**: migrate the rollback held-target cases onto the partial-capture lever (c26adc59a)
- **q12**: rebuild the six direct-journal D3 structural negatives on joined (14cdd2bb0)
- **q12**: migrate the category-B forward runtime negatives to joined (6c7184f42)
- **q12**: migrate the last two category-A positives (launcher-env, created-no-health) (d2fc5107f)
- **q12**: migrate the resume recovery-epoch + terminal-crash positives to joined (38a484583)
- **q12**: migrate the DB pre-issuance orphan positive onto the joined prefix (4c9f53874)
- **q12**: pin the exact resolved barrier.install hash in migrated install positives (4afb6a5c2)
- **q12**: migrate the barrier.install completed-capability positives to joined (a6adaa0f4)
- **q12**: migrate core forward resume positives onto the joined prefix (bd29003cd)
- **orchestration**: record D5J amendment acceptance and integration (51126cee8)
- **q12**: close correctness-review P3s (probe /tmp cleanup, reload-delta traceability) (bf27f5952)
- **q12**: close docs-review findings in the D5J artifact (0728d96b1)
- **q12**: record D5J implementation evidence in the stage artifact (101f811b7)
- **q12**: add reviewed D5J joined-fixture implementation plan (0ac42bc23)
- **q12**: freeze D5J ordinary command bindings and dual FWM authority (93badbf43)
- **orchestration**: finalize Fable handoff review (905dad02d)
- **orchestration**: add Fable Q12 handoff (ccecf0858)
- **orchestration**: record D5J product-truth gap (038ed4c5d)
- **orchestration**: record D5J specification approval (0356098bc)
- **orchestration**: record D5J exact approval gate (562215989)
- **q12**: freeze joined retained-barrier fixture design (1197224c3)
- **orchestration**: refresh Q12 handoff state (90d2ba319)
- **q12**: record D5/W seam integration (c150a4c22)
- **q12**: secure retained barrier fixture seam (3dd9ad53a)
- **q12**: record Root D5 cleanup (ce77a416c)
- **q12**: accept Root D5 integration (420038765)
- **q12**: reconcile R3 review evidence (fa6172fc7)
- **q12**: accept retained provenance plan (8156b6adb)
- **q12**: accept retained provenance design (09fe24ad1)
- **q12**: freeze retained barrier provenance candidate (815c4bffc)
- **q12**: record retained provenance decision gate (e4a7abdb1)
- **q12**: fix D4 handoff next action (11ac0f0cf)
- **q12**: accept durable recovery projections (2a4b28a83)
- **q12**: finalize reviewed D4 candidate (d523bf383)
- **q12**: refine D4 recovery contract (f013743cd)
- **q12**: record D4 contract review iterations (3a284dd46)
- **q12**: record G7 workspace cleanup (9d3f3a1cb)
- **q12**: accept recoverable Supabase backups (cf6174239)
- **q12**: record journal contract delivery (69297183c)
- **q12**: freeze journal publication contract (0717366fa)
- **q12**: record final normative addendum (31b9e6eb1)
- **q12**: record final G7 review addendum (84ae6c26b)
- **q12**: avoid recursive head metadata (7a7992402)
- **q12**: record lifecycle contract delivery (fa5afca1f)
- **q12**: freeze recoverable lifecycle contract (099fc44b9)
- **q12**: refresh lifecycle handoff (835ca1953)
- **q12**: approve recoverable lifecycle addendum (c8d22c2a7)
- **q12**: record recoverable lifecycle gate (9a407ba2f)
- **q12**: record managed Supabase barrier boundary (f6bacc4c2)
- **q12**: plan approved cutover corrections (dfdcdcc7d)
- **q12**: specify fail-closed live cutover (2fdf2fc30)
- **ops**: stabilize Graphify closeout metadata (c8f400ce8)
- **ops**: record final Graphify evidence (44426e480)
- **ops**: accept Supabase backup packet (3d23c6041)
- **review**: accept Supabase packet correction (a0c12554b)
- **ops**: supersede stale backup commands (7b446d7d4)
- **review**: reject stale Supabase execution evidence (0430e9964)
- **ops**: prepare verified Supabase backup gate (1782858f0)
- **review**: accept PostgreSQL restore pin correction (321199d26)
- **ops**: close PostgreSQL restore volume gap (9bef1a9fd)
- **review**: record PostgreSQL restore pin gap (714b6da8f)
- **ops**: pin PostgreSQL 17 restore target (ba4bb5e1b)
- **ops**: accept PostgreSQL 17 version correction (1e41adc24)
- **ops**: record PostgreSQL 17 review finding (c64e2fa93)
- **orchestration**: complete child mini-closeouts (71a4b14d4)
- **orchestration**: stabilize graph closeout evidence (51b5c399f)
- **orchestration**: finalize local closeout state (4385078ac)
- **orchestration**: record final local acceptance (95a2ef254)
- **review**: approve final q12 activation packet (a869bcb47)
- **ops**: close q12 activation packet findings (4422df013)
- **review**: approve staging activation contract (f065dc727)
- **ops**: align staging activation contract (f347ee26b)
- **db**: record final postgres migration evidence (02c245da4)
- **review**: flag final q12 activation gaps (f5844a0ae)
- **qdrant**: record final local infrastructure evidence (0591311bc)
- **ops**: record final focused no-go (a0a25799a)
- **ops**: accept credential discovery evidence (e033465ea)
- **ops**: record q12 credential discovery gate (2081bc341)
- **qdrant**: accept source recovery integration (1ba3b9e63)
- **review**: approve recovery acceptance correction (7a808fc21)
- **qdrant**: compose recovery adapter in acceptance (30d28ef27)
- **review**: flag recovery acceptance gaps (91a9f36f3)
- **qdrant**: add exact source recovery acceptance (fe1a5cfc1)
- **ops**: accept local database backup gate (a65935ff7)
- **ops**: approve backup gate corrections (684bddc61)
- **ops**: flag backup publication gaps (306f65307)
- **qdrant**: add exact-count acceptance join (25397d4cf)
- **qdrant**: accept recovery crash matrix (5dbb3c107)
- **review**: approve recovery journal fsync fix (679ea7512)
- **review**: flag journal replay fsync gap (fc0ebedfe)
- **review**: record recovery crash matrix gaps (406b442c0)
- **qdrant**: add recovery crash matrix (6ec75e993)
- **qdrant**: accept source recovery runtime (60a2c0bc0)
- **qdrant**: approve source recovery runtime (6f1339eee)
- **qdrant**: review source recovery runtime (73bdf7655)
- **qdrant**: decompose database backup gate (dd3e6c76e)
- **qdrant**: accept recovery reindex adapters (1c999f3d9)
- **qdrant**: accept recovery ledger scope fix (2feeb516f)
- **qdrant**: flag recovery ledger scope gap (275b463d5)
- **qdrant**: record database backup blocker (adf94d029)
- **qdrant**: record task five decomposition (e0980e7fd)
- **qdrant**: accept failed evidence recovery (f4a1d0ae9)
- **qdrant**: approve terminal answer validation (2f8905586)
- **qdrant**: accept recovery-bound reindex (57eb880cd)
- **qdrant**: approve final reindex corrections (22504b15d)
- **qdrant**: review terminal decision RPC (8d9c0886b)
- **qdrant**: accept source recovery workflow (8ce5d416e)
- **qdrant**: correct workflow rereview metadata (00808ca05)
- **qdrant**: accept source recovery workflow correction (3e603096b)
- **qdrant**: finalize source recovery workflow artifact (d21b92663)
- **qdrant**: rereview reindex recovery corrections (2c9e3adb5)
- **qdrant**: final-review evidence terminal correction (bda007ac6)
- **qdrant**: re-review source recovery evidence correction (a0f192940)
- **qdrant**: record reindex review gate (e2fc6a576)
- **qdrant**: review source recovery reindex (fe692b1f9)
- **qdrant**: record source recovery review gates (fa6c897bd)
- **qdrant**: review source recovery workflow (bc517bad4)
- **qdrant**: review source recovery evidence (40392827c)
- **qdrant**: record Node recovery primitives (1b40e1444)
- **qdrant**: record accepted recovery core (abf1adb9c)
- **qdrant**: accept source recovery core (cfce2c1c3)
- **qdrant**: approve source recovery core (7f3446ec2)
- **qdrant**: harden source recovery contract (3b7d54874)
- **qdrant**: re-review source recovery core (c1ef4f86c)
- **qdrant**: review source recovery core (5baba7842)
- **qdrant**: plan audited source recovery (b553292fe)
- **qdrant**: refresh recovery graph evidence (9a2acb8a8)
- **qdrant**: specify exact source recovery (df11f33aa)
- **qdrant**: record accepted Q12 review state (01e76d0f1)
- **qdrant**: record current Q12 recovery truth (75ac58c94)
- **qdrant**: record handoff graph correction (d072ae50b)
- **qdrant**: approve Q12 documentation corrections (2ecee880e)
- **qdrant**: audit current Q12 documentation truth (b777c5b38)
- **qdrant**: approve recovery transport isolation (040261fdc)
- **qdrant**: isolate snapshot recovery transport (e2ffbccbe)
- **qdrant**: approve snapshot persistence correction (8333acb2e)
- **qdrant**: accept crash-durable recovery contract (4b2ecd53e)
- **qdrant**: make recovery manifest crash durable (6f732c183)
- **qdrant**: verify source recovery audit (e857a456b)
- **qdrant**: record source recovery audit (db18bdf5c)
- **qdrant**: block ephemeral local snapshots (146429bc9)
- **qdrant**: record local graph refresh (52269005d)
- **qdrant**: accept Q12 runbook reconciliation (0613bfed0)
- **review**: approve Q12 activation runbooks (9bcca13a1)
- **qdrant**: reconcile Q12 activation runbooks (9e8403490)
- **deploy**: document rollback release argument (723aa97fe)
- **qdrant**: accept release-bound rollback (c8eaf0394)
- **qdrant**: audit Q12 activation runbooks (2943a9422)
- **qdrant**: flag stale rollback transaction (6bdaf6c2d)
- **qdrant**: accept operator runtime (4f7f2d226)
- **qdrant**: render immutable integration images (8b2873757)
- **qdrant**: record operator re-review acceptance (843465b83)
- **migrations**: accept evidence gate (df086b479)
- **review**: approve evidence migration gate (16d84cd9f)
- **qdrant**: audit operator runtime (345c2dc49)
- **review**: retain migration gate blockers (760adf032)
- **deploy**: accept immutable rollback gate (55bf764bf)
- **qdrant**: accept rollback hardening (4138b630d)
- **review**: block unsafe evidence migration gate (47b7623e8)
- **qdrant**: audit immutable rollback follow-up (f8ab13c08)
- **qdrant**: audit Q12 deploy remediation (597bfbe42)
- **qdrant**: define Q12 acceptance gate (3951106d8)
- **qdrant**: map Q12 staging preflight (866eee229)
- **qdrant**: record Q12 authoritative deployment shapes (d695db997)
- **qdrant**: finalize Q11 delivery state (ebdf9c2eb)
- **qdrant**: record safe cleanup boundary (06021400f)
- **qdrant**: record rebased Q11 delivery (fcbea1969)
- **qdrant**: close Q11 local verification (49c928a20)
- **qdrant**: record Q11 acceptance truth (803788253)
- **qdrant**: accept Q11 local matrix (563301e10)
- **qdrant**: record Q11 pinned infra matrix (aacad65ab)
- **evidence**: record Q11 PostgreSQL matrix (716c59fcf)
- **qdrant**: record Q11 focused evidence (4f94cebf4)
- **qdrant**: stabilize graph evidence (2717885ef)
- **qdrant**: record Q10 graph refresh (32e6bf7f3)
- **qdrant**: accept Q10 documentation (bf89f22e2)
- **qdrant**: make recovery commands reproducible (42ed13227)
- **qdrant**: fix operations review findings (0a6ebc33d)
- **qdrant**: reconcile self-hosted operations guidance (fa5723e99)
- **evidence**: record E7 graph refresh (d7be7adc3)
- **evidence**: accept full dev activation (677f35ee7)
- **evidence**: update dev activation status (d34176104)
- **evidence**: quote stale rollout scan safely (e373aa0ef)
- **evidence**: record full dev activation (76f3bfeea)
- **evidence**: preserve E7 review gate (cfc7a56fe)
- **evidence**: require exact dev activation values (ba27d5730)
- **evidence**: correct dev activation checks (f37906ac3)
- **evidence**: plan full dev activation (84e6c065d)
- **evidence**: approve full dev activation (55218aff5)
- **orchestration**: record Q10 Q11 readiness (d40dee25a)
- **evidence**: record local E7 acceptance (a5a657e31)
- **orchestration**: accept E7 documentation (9284529a6)
- **evidence**: remove stale integration blockers (82831b6f2)
- **evidence**: record accepted observability integration (3c00508d5)
- **orchestration**: accept E7 observability (c7a519963)
- **evidence**: update final observability SHA (29e3bb8c2)
- **evidence**: align runbook with unified observability (e235000e5)
- **evidence**: correct observability rollout contract (3b60fa173)
- **evidence**: gate observability semantics on remediation (0ef671096)
- **evidence**: gate privacy guarantee on remediation (58c66f1c2)
- **evidence**: clarify rollback and privacy boundaries (7be91ac6f)
- **evidence**: record rollout cleanup (c65ff5a12)
- **evidence**: accept rollout gate (0dab9df71)
- **evidence**: document advisory rollout and recovery (3408a4670)
- **evidence**: record Stage 5 rollout delivery (b7359f32d)
- **orchestration**: accept Q8 and Q9 (7b542c8de)
- **qdrant**: record observability hardening (9f64b59b2)
- **qdrant**: record observability delivery (3fc86d52e)
- **orchestration**: refresh Q6 graph evidence (26fcf065a)
- **orchestration**: clean Q6 workspace (9a2164036)
- **orchestration**: accept Q6 runtime (f63384a23)
- **orchestration**: accept Qdrant runtime preflight (7bc04a14a)
- **qdrant**: map runtime implementation preflight (99e08364b)
- **qdrant**: record observability pin decision (b7c386388)
- **orchestration**: stabilize graph evidence (b88b179a1)
- **orchestration**: record final graph refresh (c9be78e0e)
- **orchestration**: record rebased E6 integration (7c83a8adb)
- **orchestration**: accept Stage 6 evidence retrieval (d0a1d8f39)
- **orchestration**: correct E4 integration references (ed84baa16)
- **orchestration**: accept document conflict UI (68587541d)
- **web**: disambiguate conflict wizard navigation (2538bb5ce)
- **orchestration**: accept Stage 5 evidence enrichment (a54797f09)
- **orchestration**: accept document evidence decisions (d1d185c55)
- **stage4**: verify document gate payload bound (89a7948eb)
- **orchestration**: correct E2 integration references (8e8b53077)
- **orchestration**: accept document evidence preflight (f9510c2d1)
- **orchestration**: close document evidence foundation (06c90b131)
- **orchestration**: accept document evidence contracts (fc0d56203)
- **orchestration**: close qdrant reindex recovery (d64f14839)
- **orchestration**: accept pinned Qdrant gate (4fa2b3854)
- **qdrant**: gate pinned native retrieval (134ae797e)
- **qdrant**: stage Formula index runtime correction (0d91d2c86)
- **qdrant**: plan document evidence expansion (cd6f0984c)
- **qdrant**: design advisory document evidence flow (a3f241571)
- **orchestration**: accept pinned Qdrant gate (58945de3e)
- **qdrant**: gate pinned native retrieval (5b6e965ff)
- **qdrant**: stage Formula index runtime correction (5e9ca7589)
- **qdrant**: accept Q2 collection lifecycle (ea2f15816)
- **qdrant**: accept Q4 hybrid retrieval (39f9681cf)
- **qdrant**: accept Q3 native ingestion (ed18f17c3)
- **qdrant**: record authoritative implementation constraints (6219caae1)
- **qdrant**: accept Q1 collection contract (cb6b25624)
- **qdrant**: start self-hosted implementation stage (01f2c0904)
- **qdrant**: close planning stage (8645db922)
- **qdrant**: add self-hosted implementation handoff (77e3ebf40)
- **handoff**: staging aligned via /deploy (4128a938), runbook de-hardcoded (1233be568)
- **career-playbook**: de-hardcode live-smoke runbook (070f3c138)
- **handoff**: verification run dea26647 — DB-served judge=flash confirmed, stub diagrams gone (15.6 min / $0.078 / 5 regens) (b250d9b7a)
- **handoff**: mc2-m17al closed — judge promoted to flash in DB, regenerator stays on pro (3d786708c)
- **handoff**: epic mc2-db696.104 CLOSED — A/B run e12a46ad passed all gates (-56% time, -47% cost, 0 timeouts) (134a9f418)
- **handoff**: epic mc2-db696.104 code-complete — 7 tasks landed, gates green; A/B live run pending owner go-ahead (14efe1e08)
- **career-playbook**: document prompt serving source — hardcoded registry (mc2-93rrp) (59ef88d5e)
- **beads**: coverage audit — .104.6 (skip redundant re-judge), 93rrp->P2 blocks .104.1/.104.4, scope additions (a83008423)
- **beads**: epic mc2-db696.104 — judge/regen fix package (5 tasks + deps, fix plans) (09ff576e0)
- **beads**: file mc2-1slzl (spec vs hardcoded block topics); finalJudge flash-timeout root cause on mc2-m17al (d12a0c446)
- **handoff**: A/B run PASSED — 44.4 min vs 73.4 (-40%), $0.24 vs $0.50 (-52%); close mc2-b7zm3, unblock mc2-m17al (17c1bc4da)
- **beads**: b7zm3 in_progress; file mc2-m17al (judge->flash DB promotion post-A/B) + mc2-93rrp (hardcoded prompt fallback) (b1a21a263)
- **beads**: file mc2-b7zm3 (speed up career-playbook gen without increasing failures; audit retries) (4a3ff7e69)
- **handoff**: root-cause the 73-min run (judge<->regenerator loop, not early-phase latency) (8a94b5608)
- **handoff**: criterion #1 PASSED on real dev run; close irt6v/zpcdk, file mc2-1nots (abd8d3fd1)
- **beads**: file mc2-zpcdk (dev career-playbook generation stall found during criterion #1 run) (feab59795)
- **beads**: close mc2-irt6v (dev+staging availability recovered) (d9e2905d4)
- **beads**: close gusxd + t5auh, update handoff (follow-ups delivered) (243285efd)
- **beads**: record db696.61 evaluation + file mc2-t5auh follow-up cost persistence gap (42d73625a)
- **handoff**: record db696.62 delivery + dev deploy, criterion #1 runbook, irt6v recovery (5848e0c02)
- **beads**: close db696.62, file mc2-gusxd cache-aware routing follow-up (321d7b68d)
- **beads**: close career-playbook improvement + follow-up tasks (b33868553)
- **career-playbook**: localize N1 finalMarkdown fixture for new judge language check (8d9fa8431)
- **ops**: record server availability incident (b58d52431)
- **beads**: close production delivery task (9a225aca5)
- **orchestration**: refresh delivery handoff (1be45ba92)
- **orchestration**: record career playbook delivery (db8e2fcb2)
- **beads**: record interactions for career-playbook UI changes (a2926203d)
- **migrations**: add migration drift gate to deploy pipeline (fb2a37cbb)
- **beads**: start career playbook live smoke fixes (b359ad92c)
- **beads**: record career playbook live e2e (2fe4e7d4d)
- close career playbook image delivery (f9b4e735c)
- **beads**: track career playbook image delivery (b0b8a778b)
- **beads**: record career playbook e2e closeout (04a1487b8)
- **beads**: audit active task statuses (478d87e7e)
- **web**: trigger linked course CTA dev deploy (a6e97dfc0)
- **stage6**: align self-reviewer canonical fixtures (a315f29c0)
- **career-playbook**: trigger dev deploy (68ca9b97a)
- **career-playbook**: update router supabase mock (68eae8af7)
- **career-playbook**: align visibility slug mock with canonical policy (94c0716b6)
- **beads**: close verified delivery blocker (4eeefbc33)
- **beads**: record model matrix delivery follow-up (b3506687a)
- **course-gen**: replace retired model ids (b584be8e1)
- **orchestration**: record model config db update (c2a0dafeb)
- **e2e**: record career playbook bridge blocker (cf35a6708)
- **orchestration**: close tavily deploy detector stage (2c30890e2)
- deploy on workflow config changes (a84d32cee)
- propagate tavily secret to deploy env (25976b2af)
- **orchestration**: record auto course size delivery (72ec70cff)
- **orchestration**: avoid stale delivery hashes (c01ad33df)
- **orchestration**: close push-dev beads sync fix (4de1c41f7)
- **orchestration**: close course bridge dev delivery (a408ce857)
- **career-playbook**: expose course bridge trigger (a9eff1346)
- **orchestration**: clean repo and gate deploys (89eff6c7e)
- **orchestration**: update generation progress handoff (c99ccdf4f)
- **courses**: cover landing CTA theme regression (25f2f5c2f)
- **beads**: track delivery status (76102c76a)
- **orchestration**: record career playbook delivery request (693b521c6)
- **career-playbook**: stabilize authenticated e2e (f2b9c218e)
- **career-playbook**: add local e2e audit coverage (0b8a47d94)
- **orchestration**: record career playbook delivery (f01a1eb2f)
- **career-playbook**: cover canonical public url routing (da2636c4a)
- **beads**: close qdrant ci task (e13aab4b2)
- close career playbook migration drift (1e54d9201)
- **delivery**: record career playbook visibility deploy (b751a481c)
- update career playbook visibility transport expectations (8813cfb61)
- **delivery**: record reader shell deploy (b76c6c7ce)
- **beads**: track reader shell delivery (67758fe6c)
- **career-playbook**: record viewer fix closeout (8127fbee0)
- persist beads hook metadata (912f0c17e)
- enable graphify knowledge graph (c342e8f5c)
- correct business context review test count (e8113bf0e)
- enable graphify knowledge graph (a5e5966a9)
- **orchestration**: record compact catalog dev delivery [skip ci] (fc42e6270)
- **orchestration**: record career playbook card actions dev delivery (c27881f8e)
- **orchestration**: record career playbook dev delivery (2031605ff)
- **beads**: record CI actions update closure (dc9aefbfc)
- update actions to node 24 runtime (907406fd4)
- **orchestration**: record wikidata dev push (5db4ee8b0)
- **orchestration**: record wikidata dev merge (6e0d4ff0b)
- **beads**: close esco role suggestions task (5d88716e4)
- **beads**: close hero typography task (5d80fb27e)
- **web**: increase hero card typography (df414c840)
- **orchestration**: record hero dev delivery (bb51e53a4)
- **orchestration**: update product IA delivery handoff (6f4fb3f65)
- **beads**: record orchestration task closure (0560dc52e)
- **orchestration**: refresh baseline contract (05fc0bb5d)
- **orchestration**: record landing demo fix (2cd3386b7)
- **orchestration**: record career playbook dev delivery (c6de8d6bb)
- **career-playbook**: record ui polish pr (c377a14a5)
- **orchestration**: record career playbook pr (679dec422)
- **orchestration**: record career playbook delivery (a1a82bd31)
- **career-playbook**: define role suggestion upgrade (dc004d140)
- **orchestration**: neutralize v4 pro PR handoff state (ab54c7558)
- **orchestration**: record v4 pro routing PR (966a7c09c)
- **orchestration**: record role description ui follow-up (72baa597f)
- **beads**: record role description ui closure (200ec9ec6)
- **orchestration**: align cleanup handoff with develop (b5a0aae69)
- **orchestration**: record primary worktree cleanup (2d0ae7df4)
- **career-playbook**: record live smoke PR (ad9d6b5af)
- **career-playbook**: record live smoke closeout triage (b524cbe03)
- **career-playbook**: prepare readiness handoff for merge (e56bcb6b2)
- **career-playbook**: record readiness pr (3c8ce857f)
- **career-playbook**: persist smoke model routing (99b1f4609)
- **career-playbook**: configure smoke model routing (a5e145329)
- **career-playbook**: record staging readiness (f8cc435d2)
- **orchestration**: mark cost evidence cleanup (e84fa3e34)
- **orchestration**: update PR 37 verification evidence (8888d2f7d)
- **orchestration**: record PR 37 readiness review (8a46f8e27)
- preserve Beads export after develop merge (e07483561)
- **orchestration**: prepare handoff after PR 36 (def0f2074)
- scope Playwright install to course platform (488026f3a)
- install Playwright Chromium for unit tests (f24e5c53b)
- **orchestration**: update Career Playbook handoff after PR 35 (151b90222)
- **career-playbook**: trigger landing ci (0e2287616)
- **career-playbook**: trigger viewer editor ci (e5000482b)
- **career-playbook**: trigger phase b transport ci (179db3173)
- **orchestration**: refresh career playbook baseline (b738ecfcc)
- **orchestration**: record career playbook stack readiness (134c39c62)
- **orchestration**: record career playbook smoke PR (161039339)
- update career playbook bridge handoff (af0aa6599)
- **career-playbook**: enable token-backed e2e auth (de8efa066)
- **beads**: record phase 8 closure (c21f96e82)
- **orchestration**: close phase 8 artifacts (ccdd6c6b4)
- ignore local worktrees (7ef1a8888)
- **beads**: record supabase mcp setup tasks (16902baf3)
- **orchestration**: refresh baseline for career playbook (b55a86c9f)
- bd init: initialize beads issue tracking (92f8ae2c9)
- add 2026-05-10 pre-sync and deploy post-mortem (f3c173822)
- **beads**: stop tracking local dolt cache (35e069875)
- **stage6**: align patcher fallback expectation (64b08cc2f)
- **contract**: isolate regenerateSection success path (bb942e1a5)
- **stage6**: drop orchestration prompt artifacts (91b961a58)
- record rag retry post-review corrections (076af92f6)
- save orchestration progress (0cee5a972)
- add rag fail-fast design (03790cac8)
- **release**: v0.31.40 (3475fb999)
- **release**: v0.31.39 (959fba886)
- update project files (3bf22bb5e)
- **release**: v0.31.38 (5bc45884b)
- update docs (cdaf15760)
- **release**: v0.31.37 (bad19ec61)
- **web**: stabilize quality ladder ui assertions (b69ab0f0a)
- **release**: v0.31.36 (9880b8bb9)
- **release**: v0.31.35 (5d4b3f526)
- add .agents/ and .codex/ to .gitignore (ad262ea44)
- **stage6**: bump bundle size threshold from 2.0 to 2.5 MB (c054f8733)
- **release**: v0.31.34 (6cad4e68f)
- **release**: v0.31.33 (d945042de)
- **release**: v0.31.32 (0886f6f52)
- **release**: v0.31.31 (cd2ea361f)
- **release**: v0.31.30 (e4a4a39f8)
- **release**: v0.31.29 (f6162f912)
- trigger rebuild for server action hash fix (d613736e4)
- **release**: v0.31.28 (7ee120caa)
- **release**: v0.31.27 (fccd8114b)
- **release**: v0.31.26 (af5c331dc)
- **docker**: upgrade Docling to v2.80+ in MCP server image (1e5579586)
- **release**: v0.31.25 (0d3892f61)
- **release**: v0.31.24 (25f109ee4)
- **release**: v0.31.23 (6332ac724)
- update docs (5754aaf78)
- update Stage 2 sandbox fix plan with investigation findings (aa0a2c037)
- **release**: v0.31.22 (150aee560)
- **release**: v0.31.21 (433b95b3d)
- **release**: v0.31.20 (70f29c2e7)
- triage TODO/FIXME markers and update eslint max-warnings (850→95) (188839b71)
- **web**: remove unused-vars across package (c937e268c)
- eslint auto-fix across web and course-gen-platform (6e19c5a61)
- fix DOCLING_MCP_URL default in deployment guide (/sse → /mcp) (26bd39384)
- **release**: v0.31.19 (bdb42aa4e)
- add Jina API key rotation guide (f345fd08a)
- add critical operational rules to deployment guide + server security audit (62d4c4b45)
- **course-gen-platform**: add comprehensive MetricsStore tests (853 LOC module) (87d83a821)
- **course-gen-platform**: add minimum-lessons-validator, mermaid-validator, source-doc-validator, logger-utils tests (7887513af)
- **course-gen-platform**: add section-utils arbiter + content-utils tests (7a13e66b6)
- **course-gen-platform**: add pure tests for text-utils syllable counter and flesch-kincaid (eaae2f1dc)
- **course-gen-platform**: add pure tests for validators and table-fix pipeline (53944c081)
- **course-gen-platform**: add unit tests for stage5/stage6 pure utilities (1928c825f)
- **coverage**: fix failing tests + 139 new shared utility tests (c98789b18)
- fix code metrics — 580K+ lines, 6,300+ tests (dcd0f7d03)
- **release**: v0.31.18 (6311fca73)
- update docs, cleanup 190 file(s) (8e1f5f4df)
- fix generation time, add planned features from catalog (c565dafbe)
- add strategic vision document, update investor overview (11ba30cc0)
- update investor overview with comprehensive improvements (989d6aedf)
- add investor overview document with full platform analysis (6fdfb59db)
- **release**: v0.31.17 (ed44b8c18)
- **release**: v0.31.16 (c096c7770)
- **release**: v0.31.15 (7e65a110d)
- **release**: v0.31.14 (75f816973)
- **release**: v0.31.13 (1ccda6faa)
- update docs (cb6f92500)
- **release**: v0.31.12 (a0574e075)
- **release**: v0.31.11 (ea961b287)
- **release**: v0.31.10 (8ab445278)
- **release**: v0.31.9 (a0e879649)
- **release**: v0.31.8 (c8bb7202c)
- **release**: v0.31.7 (e19df785c)
- **release**: v0.31.6 (52e8c982a)
- update project files (c728ca2ee)
- **release**: v0.31.5 (14533af58)
- add plan files, architecture docs, and gitignore .agent/ (0d3864750)
- update deployment guide (56b41fc0f)
- **release**: v0.31.4 (181073945)
- **release**: v0.31.3 (094103857)
- **release**: v0.31.2 (9e66b7ab0)
- **release**: v0.31.1 (707d26d72)
- update docker-compose and deploy scripts (b7c4543af)
- fix Windows NTFS compatibility and normalize line endings (b195ac3cf)
- add cross-platform line ending rules to .gitattributes (e0d542885)
- **release**: v0.31.0 (b53228966)
- update Gemini and Codex instruction files with Gastown workflow (bc6eb5c25)
- expand Gastown cheatsheet into comprehensive command reference (96d53ab30)
- add Gastown analysis and update CLAUDE.md for multi-agent orchestration (c6b5eb791)
- **dev**: make start-dev always run local notebooklm bridge (c45f5b3b3)
- **dev**: add optional local notebooklm bridge to start-dev (0966839ae)
- **infra**: wire notebooklm bridge configs and runbook (5f498f090)
- **release**: v0.30.11 (21f5c806b)
- add plans and review reports (5909e343d)
- **logs**: remove dead code — dbLog:false, handleJobStalled, handleJobTimeout (a3e18c804)
- **release**: v0.30.10 (1a0e027b7)
- update docs (440435387)
- **release**: v0.30.9 (87e3fc316)
- add unit tests for tester feedback fixes — 4 test suites, 66 tests (43d29262b)
- retrigger pipeline after flaky contract test failure (688fa6f94)
- **release**: v0.30.8 (7b3c2484c)
- **release**: v0.30.7 (72d98ac70)
- remove stale root-level report files (34ca6f598)
- **web**: fix dev warnings — allowedDevOrigins, pino externals, baseline-browser-mapping (517c04f90)
- **stage6**: add unit tests for Two-Tier RAG retrieval (913e70c23)
- **llm**: add stage_6_rag_planning to model config documentation (6c2c74f12)
- **release**: v0.30.6 (ddded3792)
- **llm**: add unit tests for loadDefaultPhaseConfigs config-seed loader (15312def2)
- **release**: v0.30.5 (fe6b5b286)
- update docs (6d0e2b942)
- **release**: v0.30.4 (5135afd9d)
- update 1 skill(s), update docs (8bf21bedf)
- **stage4**: add runtime validation for Stage 3 priority values (4db0eb42c)
- **process-logs**: sync auto-mute docs with code (53 → 56 rules) (18729cfdb)
- **release**: v0.30.3 (3875c89a7)
- **course-gen-platform**: update auto-mute rule count comment (52 → 54) (31105dc77)
- **course-gen-platform**: add unit tests for Phase 3 Zod validation repair path (62c836e7e)
- **release**: v0.30.2 (d6d134f7c)
- update docs (498d39263)
- **release**: v0.30.1 (1122195fb)
- **release**: v0.30.0 (0f0ef6929)
- **web**: add 42 unit tests for MermaidDirect component (948243eb0)
- **stage4**: clarify PromptService migration status for each phase (d3ab9ea71)
- **stage6**: clarify log-only vs reject validation pattern in section-regenerator (5549c9750)
- **stage5**: remove dead enrichBatchContext tests from qdrant-search.test.ts (f549d276b)
- **stage5**: add unit tests for buildSectionDigest and sanitizeDigest (73d59c589)
- update i18n guide with current namespaces, content labels, and stage 7 migration status (eaee39498)
- add missing Stage 4 DB records for ru + extended tiers (482f05e58)
- switch Stage 4 Synthesis from kimi-k2-0905 to cheap models (974e073fa)
- **overlap**: add end-to-end overlap retry flow tests for Stage 4 and Stage 5 (0effa8a7f)
- **overlap**: add unit tests for Stage 4 and Stage 5 overlap detection (50c0cde3c)
- **beads**: migrate to Dolt backend with CGO support (5274ecdcd)
- **beads**: add bd hooks to husky and configure sync-branch (67727b8af)
- **beads**: update gitignore for bd 0.50.3 patterns (7bbdccdc3)
- **beads**: fix doctor warnings — gitignore, stale molecules, role (03d1ed7d4)
- **beads**: sync issues — create tasks for stage6 audit findings (060cf3b87)
- bd daemon export: 2026-02-15 15:31:39 (7d7846369)
- bd daemon export: 2026-02-15 15:31:38 (360f903d1)
- bd daemon export: 2026-02-15 15:31:37 (754003043)
- bd daemon export: 2026-02-15 15:31:36 (535147d95)
- bd daemon export: 2026-02-15 10:59:58 (dd8a19e07)
- bd daemon export: 2026-02-15 10:58:28 (b2cc967ff)
- bd daemon export: 2026-02-15 10:56:34 (247a6a2be)
- bd daemon export: 2026-02-15 10:56:29 (ff32d33b0)
- bd daemon export: 2026-02-15 10:56:27 (d976282d4)
- **release**: v0.29.15 (ce18e030f)
- bd daemon export: 2026-02-14 22:06:55 (c973d700e)
- bd daemon export: 2026-02-14 21:37:39 (1c689d8a1)
- bd daemon export: 2026-02-14 21:37:34 (0e612738d)
- bd daemon export: 2026-02-14 20:50:10 (442267a8b)
- bd daemon export: 2026-02-14 20:50:09 (38c5ccb8c)
- bd daemon export: 2026-02-14 20:42:41 (c9a668d44)
- bd daemon export: 2026-02-14 20:42:36 (1e46f8e4a)
- bd daemon export: 2026-02-14 20:42:35 (5d4f470c4)
- bd daemon export: 2026-02-14 20:32:25 (fe8fc2c31)
- bd daemon export: 2026-02-14 20:32:24 (f98119a46)
- bd daemon export: 2026-02-14 20:32:23 (e4995b316)
- bd daemon export: 2026-02-14 20:23:02 (f58b196e4)
- bd daemon export: 2026-02-14 20:23:00 (6b5cc0740)
- bd daemon export: 2026-02-14 20:22:46 (884cd7349)
- **release**: v0.29.14 (fbc272946)
- **release**: v0.29.13 (29b3c4241)
- **release**: v0.29.12 (fe86a063f)
- remove LLM benchmarks (migrated to aidevteam) (ef2a75b67)
- bd daemon export: 2026-02-14 12:29:29 (ed600f4c0)
- bd daemon export: 2026-02-14 12:29:28 (2e4c09fd6)
- bd daemon export: 2026-02-14 12:26:25 (b5cc73dd1)
- bd daemon export: 2026-02-14 12:26:21 (3ccebd20e)
- bd daemon export: 2026-02-14 12:25:12 (e0860acf4)
- bd daemon export: 2026-02-14 12:25:11 (d9cc29976)
- bd daemon sync: 2026-02-13 08:02:14 (145bb090d)
- **chat**: add unit tests for executeFullRegenerate function (592561d49)
- code review improvements — tests, clarity, body parser guard (54ece3fd9)
- bd daemon export: 2026-02-12 17:33:30 (4510b5d92)
- bd daemon export: 2026-02-12 17:33:29 (0cf910257)
- bd daemon export: 2026-02-12 17:26:06 (6bbfda306)
- bd daemon export: 2026-02-12 17:26:04 (2a9fe4d4c)
- bd daemon export: 2026-02-12 17:26:03 (2ca9cf006)
- bd daemon export: 2026-02-12 17:18:47 (10f54257a)
- bd daemon export: 2026-02-12 17:18:43 (b425a9f8d)
- bd daemon export: 2026-02-12 17:18:35 (19db96f05)
- bd daemon export: 2026-02-12 17:12:53 (1d5b4958a)
- bd daemon export: 2026-02-12 17:03:09 (f3f6da980)
- bd daemon export: 2026-02-12 17:02:57 (8f962410a)
- bd daemon export: 2026-02-12 17:02:39 (159b67c51)
- bd daemon export: 2026-02-12 17:00:35 (fbe0b30d5)
- bd daemon export: 2026-02-12 17:00:26 (aaeb8e3b1)
- bd daemon export: 2026-02-12 16:11:59 (5517a1fa3)
- bd daemon export: 2026-02-12 16:11:52 (89a755746)
- bd daemon export: 2026-02-12 16:10:53 (341ab2a49)
- bd daemon export: 2026-02-12 16:10:33 (b16ff8a41)
- bd daemon export: 2026-02-12 16:10:24 (9cf66805e)
- bd daemon export: 2026-02-12 16:10:17 (5a3cf8c4e)
- bd daemon export: 2026-02-12 16:10:08 (16da5cedf)
- bd daemon export: 2026-02-12 16:10:03 (7ff995a51)
- bd daemon export: 2026-02-12 16:09:54 (17b6c244c)
- bd daemon export: 2026-02-12 16:09:47 (1380cbcd6)
- bd daemon export: 2026-02-12 16:09:41 (696ca699f)
- bd daemon export: 2026-02-12 15:58:15 (902d3c767)
- bd daemon export: 2026-02-12 15:53:33 (e0f479b86)
- bd daemon export: 2026-02-12 15:53:25 (fc77908d7)
- bd daemon export: 2026-02-12 15:53:17 (936d77dd1)
- bd daemon export: 2026-02-12 15:53:16 (5a54727b3)
- bd daemon export: 2026-02-12 15:53:14 (fe56128f3)
- **release**: v0.29.11 (44ffc95fd)
- update docs (b846079a4)
- **web**: remove duplicate useEnrichmentGeneration test (2519398a8)
- bd daemon export: 2026-02-12 14:59:32 (6a4b48ae3)
- bd daemon export: 2026-02-12 14:52:53 (e20d0671e)
- bd daemon export: 2026-02-12 14:52:50 (a674f73c8)
- bd daemon export: 2026-02-12 14:49:22 (7ae75aeaa)
- bd daemon export: 2026-02-12 14:41:57 (25bf476ad)
- bd daemon export: 2026-02-12 14:41:56 (8be71ebf3)
- bd daemon export: 2026-02-12 14:41:52 (840ff4dbd)
- bd daemon export: 2026-02-12 14:20:18 (4581ec4e1)
- bd daemon export: 2026-02-12 14:20:17 (f5ae9ff44)
- bd daemon export: 2026-02-12 14:20:15 (d0eb2d367)
- bd daemon export: 2026-02-12 14:20:10 (f73ff2cba)
- **release**: v0.29.10 (316bd2136)
- update docs (ab4a626d4)
- **release**: v0.29.9 (6b8d3a813)
- upgrade Node.js from 20 to 22 (Active LTS) (9f1e9fa41)
- bd daemon export: 2026-02-12 11:16:38 (a4d192a34)
- bd daemon export: 2026-02-12 11:09:51 (838ebb72a)
- bd daemon export: 2026-02-12 11:08:30 (571176878)
- bd daemon export: 2026-02-12 10:57:27 (2b2b19961)
- bd daemon export: 2026-02-12 10:20:09 (e741c6c70)
- bd daemon export: 2026-02-12 10:20:05 (a0faf9014)
- bd daemon export: 2026-02-12 09:53:10 (b09b52276)
- bd daemon export: 2026-02-12 09:49:27 (f24619e50)
- bd daemon export: 2026-02-12 09:49:22 (051e6f71d)
- bd daemon export: 2026-02-12 09:47:31 (380ea9eb4)
- bd daemon export: 2026-02-12 09:16:29 (fe495343f)
- bd daemon export: 2026-02-12 09:16:24 (074222d4d)
- bd daemon export: 2026-02-12 09:11:13 (db425d8d4)
- bd daemon export: 2026-02-12 08:42:58 (1f1f4d336)
- bd daemon export: 2026-02-11 22:10:34 (80edf2d3d)
- bd daemon export: 2026-02-11 22:10:30 (489721689)
- **release**: v0.29.8 (d8cc92b75)
- bd daemon export: 2026-02-11 21:52:43 (6b7749879)
- bd daemon export: 2026-02-11 21:52:41 (2ffff728a)
- bd daemon export: 2026-02-11 21:52:39 (f1ae4a46a)
- bd daemon export: 2026-02-11 21:45:52 (5ba4176db)
- bd daemon export: 2026-02-11 21:45:51 (3f3fad371)
- bd daemon export: 2026-02-11 21:45:50 (098b3c0b1)
- bd daemon export: 2026-02-11 21:24:19 (33e6c49a0)
- bd daemon export: 2026-02-11 21:24:16 (997b14f6a)
- bd daemon export: 2026-02-11 21:24:14 (e6172ae55)
- bd daemon export: 2026-02-11 20:29:41 (fb441673a)
- bd daemon export: 2026-02-11 20:09:29 (0f379355d)
- bd daemon export: 2026-02-11 20:09:24 (52791d936)
- bd daemon export: 2026-02-11 14:12:42 (44b9e7c8e)
- bd daemon export: 2026-02-11 13:59:32 (4df269391)
- bd daemon export: 2026-02-11 13:59:28 (8e6c00e61)
- bd daemon export: 2026-02-11 12:09:01 (0a3d0221b)
- bd daemon export: 2026-02-11 12:06:36 (f66609bf8)
- bd daemon export: 2026-02-11 12:05:39 (7b2bd12f8)
- bd daemon export: 2026-02-11 11:55:40 (101b30431)
- bd daemon export: 2026-02-11 11:50:32 (ed10fd9de)
- bd daemon export: 2026-02-11 11:50:27 (0a6f21405)
- update aidevteam server audit — all fixes applied (73058e587)
- **release**: v0.29.7 (975daeba2)
- update docs (5857f95c3)
- bd daemon export: 2026-02-10 20:49:37 (8250c8fad)
- bd daemon export: 2026-02-10 20:46:27 (e878ac6db)
- bd daemon export: 2026-02-10 20:45:42 (f06351c59)
- bd daemon export: 2026-02-10 20:45:41 (104176164)
- bd daemon export: 2026-02-10 20:45:32 (8dc5cb618)
- bd daemon export: 2026-02-10 20:45:31 (cd980f179)
- bd daemon export: 2026-02-10 20:06:57 (a62f61c74)
- bd daemon export: 2026-02-10 20:01:29 (352d5b995)
- bd daemon export: 2026-02-10 20:01:23 (f03c7ed6e)
- bd daemon export: 2026-02-10 18:03:39 (06b208792)
- bd daemon export: 2026-02-10 16:37:05 (1dd693962)
- bd daemon export: 2026-02-10 16:36:53 (f8555b56c)
- bd daemon export: 2026-02-10 16:36:51 (4a1fe7a2c)
- bd daemon export: 2026-02-10 16:36:50 (7c425986d)
- bd daemon export: 2026-02-10 16:35:08 (ec9ca4a0f)
- bd daemon export: 2026-02-10 16:35:01 (f6f000ba9)
- bd daemon export: 2026-02-10 16:35:00 (9e2f3a5b3)
- bd daemon export: 2026-02-10 16:34:59 (813eaf6fc)
- bd daemon export: 2026-02-10 16:28:03 (8de501bce)
- bd daemon export: 2026-02-10 16:14:02 (73d7288c0)
- bd daemon export: 2026-02-10 16:08:15 (dc149a5db)
- bd daemon export: 2026-02-10 16:03:03 (d8a4ded0e)
- bd daemon export: 2026-02-10 16:02:55 (ba2acd290)
- bd daemon export: 2026-02-10 16:00:16 (f4c79481f)
- **release**: v0.29.6 (29bc11cfb)
- bd daemon export: 2026-02-10 15:21:19 (af7aa82a1)
- bd daemon export: 2026-02-10 14:39:07 (f5f42adc1)
- bd daemon export: 2026-02-10 14:31:59 (0cc4e4a39)
- bd daemon export: 2026-02-10 14:31:53 (cfeb7cea8)
- **release**: v0.29.5 (62ee602d3)
- update 5 agent(s), update docs (ccefa7fdd)
- bd daemon export: 2026-02-10 12:18:21 (c8b6c38b2)
- bd daemon export: 2026-02-10 12:10:12 (c5adfee14)
- bd daemon export: 2026-02-10 12:10:06 (79ad51160)
- bd daemon export: 2026-02-10 12:10:05 (052045e85)
- bd daemon export: 2026-02-10 12:10:03 (a9e0ed699)
- bd daemon export: 2026-02-10 11:20:29 (c5cd2205c)
- bd daemon export: 2026-02-10 11:12:23 (69eb0a661)
- add healthcheck code review report (Feb 2026) (b0e535732)
- bd daemon export: 2026-02-10 09:40:04 (a9ca9b07a)
- bd daemon export: 2026-02-10 09:39:59 (3ad59cf22)
- bd daemon export: 2026-02-10 09:39:56 (0dfce5675)
- bd daemon export: 2026-02-10 09:39:55 (ae1fa5600)
- bd daemon export: 2026-02-10 09:39:53 (748c3f33d)
- bd daemon export: 2026-02-10 09:39:48 (f726250c7)
- bd daemon export: 2026-02-10 09:39:47 (aa1c31eb9)
- bd daemon export: 2026-02-10 09:39:46 (f88863272)
- bd daemon export: 2026-02-10 09:39:47 (bbe951fd2)
- bd daemon export: 2026-02-10 09:39:46 (5d56f1d0d)
- bd daemon export: 2026-02-10 09:33:06 (14d81e627)
- bd daemon export: 2026-02-10 09:33:02 (29e633adb)
- bd daemon export: 2026-02-10 09:30:20 (bb928df2c)
- bd daemon export: 2026-02-10 09:29:30 (53daad4a2)
- bd daemon export: 2026-02-10 09:25:11 (3370aa23d)
- bd daemon export: 2026-02-10 09:21:05 (3e4945078)
- bd daemon export: 2026-02-10 09:17:57 (dd5af5431)
- bd daemon export: 2026-02-10 09:17:54 (3324e1f78)
- bd daemon export: 2026-02-10 09:17:52 (3cdb09342)
- bd daemon export: 2026-02-10 09:11:12 (178e1b789)
- bd daemon export: 2026-02-10 09:11:09 (30af861bc)
- bd daemon export: 2026-02-10 09:11:02 (b7c93b8e1)
- bd daemon export: 2026-02-10 08:58:10 (d3ced38f4)
- bd daemon export: 2026-02-10 08:58:08 (f022e149e)
- bd daemon export: 2026-02-10 08:58:07 (b47efecdf)
- bd daemon export: 2026-02-10 08:58:05 (fe8f250ce)
- bd daemon export: 2026-02-10 08:58:04 (a518d77ee)
- bd daemon export: 2026-02-10 08:58:03 (8ffec4ba8)
- bd daemon export: 2026-02-10 08:57:41 (7b937c605)
- bd daemon export: 2026-02-10 08:57:08 (e50ddae8e)
- bd daemon export: 2026-02-10 08:57:07 (1b45c8954)
- bd daemon export: 2026-02-10 08:57:05 (31d48303e)
- bd daemon export: 2026-02-10 08:48:56 (070eca954)
- bd daemon export: 2026-02-10 08:48:21 (abb8482a6)
- bd daemon export: 2026-02-10 08:47:33 (150d80516)
- bd daemon export: 2026-02-10 08:46:28 (989715c11)
- bd daemon export: 2026-02-10 08:45:45 (c214b6dad)
- bd daemon export: 2026-02-10 08:45:43 (e91088af1)
- bd daemon export: 2026-02-10 08:45:41 (3009eda04)
- bd daemon export: 2026-02-10 08:45:40 (a0bbe90a0)
- bd daemon export: 2026-02-10 08:45:37 (a0822bba1)
- bd daemon export: 2026-02-10 08:45:31 (58e5fc80a)
- bd daemon export: 2026-02-10 08:45:28 (6d71b82d0)
- bd daemon export: 2026-02-10 08:45:24 (7beb02bad)
- bd daemon export: 2026-02-10 08:45:21 (2c85150f6)
- bd daemon export: 2026-02-10 08:45:18 (43a6b9e05)
- bd daemon export: 2026-02-10 08:45:16 (90f216c8a)
- bd daemon export: 2026-02-10 08:45:14 (cdbea54b5)
- bd daemon export: 2026-02-10 08:45:11 (6630cf701)
- bd daemon export: 2026-02-10 08:31:40 (e9e8075a4)
- bd daemon export: 2026-02-10 08:29:53 (44b419020)
- bd daemon export: 2026-02-10 08:29:30 (23c77c76b)
- bd daemon export: 2026-02-10 08:28:31 (ab185870f)
- bd daemon export: 2026-02-10 08:28:30 (b8528da58)
- bd daemon export: 2026-02-10 08:25:53 (a53896867)
- bd daemon export: 2026-02-10 08:25:51 (bb2730066)
- bd daemon export: 2026-02-10 08:25:50 (bda58d85a)
- bd daemon export: 2026-02-10 08:25:46 (fd007fe4c)
- bd daemon export: 2026-02-10 08:25:44 (bd0512eba)
- bd daemon export: 2026-02-10 08:25:42 (b1c00b938)
- bd daemon export: 2026-02-10 08:25:41 (351ed62be)
- bd daemon export: 2026-02-10 08:25:39 (f9004db73)
- bd daemon export: 2026-02-10 08:25:33 (bf0f2bb57)
- bd daemon export: 2026-02-10 08:25:32 (fe1975d66)
- bd daemon export: 2026-02-10 08:25:30 (f755b2964)
- bd daemon export: 2026-02-10 08:25:29 (996b5ca76)
- bd daemon export: 2026-02-10 08:25:27 (cc7a65a88)
- **release**: v0.29.4 (5b1acad5c)
- bd daemon export: 2026-02-09 21:05:27 (454b05d7d)
- bd daemon export: 2026-02-09 21:05:20 (f87d3bcfa)
- bd daemon export: 2026-02-09 21:05:14 (1e52afad6)
- bd daemon export: 2026-02-09 19:48:08 (3fbf2046a)
- bd daemon export: 2026-02-09 19:40:36 (644af9a6a)
- bd daemon export: 2026-02-09 19:40:31 (178607c45)
- bd daemon export: 2026-02-09 19:09:42 (ba4bf54a6)
- bd daemon export: 2026-02-09 19:09:40 (444518921)
- bd daemon export: 2026-02-09 19:07:48 (5fa3114a8)
- bd daemon export: 2026-02-09 19:07:47 (026c1a6fb)
- bd daemon export: 2026-02-09 18:55:52 (a24a3b13c)
- bd daemon export: 2026-02-09 18:55:50 (3e4940cd0)
- bd daemon export: 2026-02-09 18:50:54 (0d89b9ca8)
- bd daemon export: 2026-02-09 18:12:51 (2ada08091)
- bd daemon export: 2026-02-09 17:57:19 (975cc91ac)
- bd daemon export: 2026-02-09 17:47:29 (37619a3cb)
- bd daemon export: 2026-02-09 17:47:25 (8139cafdd)
- bd daemon export: 2026-02-09 17:41:45 (fa5607df6)
- bd daemon export: 2026-02-09 17:39:36 (3387771f8)
- bd daemon export: 2026-02-09 17:39:32 (715d1e6aa)
- bd daemon export: 2026-02-09 17:22:04 (116e46c45)
- bd daemon export: 2026-02-09 17:18:23 (6df368018)
- bd daemon export: 2026-02-09 17:18:18 (be23e0e3e)
- bd daemon export: 2026-02-09 17:17:46 (c5d5e5170)
- bd daemon export: 2026-02-09 17:10:28 (a74df6d71)
- bd daemon export: 2026-02-09 17:09:11 (02fe9973a)
- bd daemon export: 2026-02-09 17:09:01 (a43acd7f5)
- bd daemon export: 2026-02-09 17:01:54 (e74324070)
- bd daemon export: 2026-02-09 17:01:53 (52fdcd9ba)
- add tests for muteTestEnvironmentLog + new auto-mute rules + fix rule count (7c437693b)
- bd daemon export: 2026-02-09 16:56:52 (b00dfa38d)
- bd daemon export: 2026-02-09 16:56:51 (fe3ac767d)
- bd daemon export: 2026-02-09 16:56:44 (fd0a3813e)
- bd daemon export: 2026-02-09 16:56:03 (b1bdd4ceb)
- bd daemon export: 2026-02-09 16:35:38 (ed784737e)
- bd daemon export: 2026-02-09 16:35:31 (a32050042)
- bd daemon export: 2026-02-09 16:33:13 (b7392bb3d)
- bd daemon export: 2026-02-09 16:20:25 (9c38bc1e4)
- bd daemon export: 2026-02-09 16:19:30 (456c00f69)
- **deps**: align tRPC 11.8→11.9 in course-gen-platform (83873e0de)
- bd daemon export: 2026-02-09 16:19:11 (b96768560)
- bd daemon export: 2026-02-09 16:19:07 (bbfdce16a)
- bd daemon export: 2026-02-09 16:15:14 (6b3e4de99)
- bd daemon export: 2026-02-09 16:15:00 (224d8fc69)
- bd daemon export: 2026-02-09 16:11:36 (4e6295dcc)
- bd daemon export: 2026-02-09 16:09:16 (e5bef7300)
- **deps**: update react-resizable-panels 3.0.6 → 4.6.2 (f78ede6f0)
- bd daemon export: 2026-02-09 16:06:18 (ee28863c1)
- bd daemon export: 2026-02-09 15:55:49 (7ced5bee7)
- clean up remaining Phase 6 RAG Planning references (25aea1b79)
- bd daemon export: 2026-02-09 15:42:51 (b1fa69c2e)
- bd daemon export: 2026-02-09 15:36:03 (a43d210e4)
- bd daemon export: 2026-02-09 15:26:42 (7c2a493c0)
- bd daemon export: 2026-02-09 15:25:29 (513d431c6)
- bd daemon export: 2026-02-09 15:23:18 (c670e952f)
- bd daemon export: 2026-02-09 15:23:14 (705b92c41)
- bd daemon export: 2026-02-09 15:21:02 (8e58d1965)
- bd daemon export: 2026-02-09 15:17:15 (8a8c8bf5e)
- bd daemon export: 2026-02-09 14:58:55 (5bd017973)
- bd daemon export: 2026-02-09 14:49:35 (235a42e12)
- bd daemon export: 2026-02-09 14:49:20 (7eb11fdd7)
- bd daemon export: 2026-02-09 14:49:16 (1872dd4a4)
- bd daemon export: 2026-02-09 14:45:56 (ca279e9b8)
- bd daemon export: 2026-02-09 14:41:09 (64bb1c93d)
- bd daemon export: 2026-02-09 14:34:15 (e2624a030)
- bd daemon export: 2026-02-09 14:27:40 (4675cbaf2)
- bd daemon export: 2026-02-09 14:25:11 (ca14f9e32)
- bd daemon export: 2026-02-09 14:18:18 (4c1513bfe)
- bd daemon export: 2026-02-09 14:18:12 (5d166ac31)
- bd daemon export: 2026-02-09 14:18:05 (ce986b05f)
- bd daemon export: 2026-02-09 14:17:28 (640f57a34)
- bd daemon export: 2026-02-09 14:17:23 (129b88a69)
- bd daemon export: 2026-02-09 14:09:02 (1677a95fc)
- bd daemon export: 2026-02-09 14:08:57 (f225c3954)
- bd daemon export: 2026-02-09 14:08:48 (0eb6419c3)
- bd daemon export: 2026-02-09 14:04:29 (f815ba6ef)
- bd daemon export: 2026-02-09 14:00:32 (ee3e3f644)
- bd daemon export: 2026-02-09 13:58:08 (e25185488)
- **deps**: upgrade @langchain/langgraph 1.0.5 → 1.1.4 (eedba48bf)
- bd daemon export: 2026-02-09 13:58:02 (05f3638c5)
- bd daemon export: 2026-02-09 13:57:56 (0c05b2590)
- bd daemon export: 2026-02-09 13:56:49 (851e4b017)
- bd daemon export: 2026-02-09 13:56:45 (d46ef8d90)
- bd daemon export: 2026-02-09 13:56:32 (e19fef239)
- bd daemon export: 2026-02-09 13:56:27 (b4221cd3c)
- bd daemon export: 2026-02-09 13:56:22 (ae5c4cdbc)
- bd daemon export: 2026-02-09 13:55:55 (d179fea7e)
- bd daemon export: 2026-02-09 13:55:44 (8c188d098)
- bd daemon export: 2026-02-09 13:52:50 (ed7ed216f)
- bd daemon export: 2026-02-09 13:50:17 (88d2e13b6)
- bd daemon export: 2026-02-09 13:50:12 (a44aaa195)
- bd daemon export: 2026-02-09 13:48:53 (8de469171)
- bd daemon export: 2026-02-09 13:47:12 (0c94d8cdf)
- bd daemon export: 2026-02-09 13:39:27 (fd77e0af8)
- bd daemon export: 2026-02-09 13:39:23 (2317aafec)
- bd daemon export: 2026-02-09 13:39:17 (3d7742a89)
- bd daemon export: 2026-02-09 13:34:16 (7c96484bf)
- bd daemon export: 2026-02-09 13:33:30 (fc3ddad6a)
- bd daemon export: 2026-02-09 13:31:25 (38c4f4129)
- bd daemon export: 2026-02-09 13:31:21 (4f49d754e)
- bd daemon export: 2026-02-09 13:27:03 (bd1caf697)
- bd daemon export: 2026-02-09 13:20:12 (c78d8f380)
- bd daemon export: 2026-02-09 13:20:10 (f0da451ae)
- bd daemon export: 2026-02-09 13:20:08 (de0b87a63)
- bd daemon export: 2026-02-09 13:13:13 (f28c3b59c)
- bd daemon export: 2026-02-09 13:11:59 (6cb78f71f)
- bd daemon export: 2026-02-09 13:11:53 (1f2ba9633)
- bd daemon export: 2026-02-09 13:11:46 (9de5eb4a8)
- bd daemon export: 2026-02-09 13:09:16 (8e450b801)
- bd daemon export: 2026-02-09 13:09:11 (4f80960b7)
- bd daemon export: 2026-02-09 13:09:09 (9aba13035)
- bd daemon export: 2026-02-09 13:09:07 (f14f8d4ac)
- bd daemon export: 2026-02-09 13:09:06 (a6f0fc1f5)
- bd daemon export: 2026-02-09 11:51:56 (271d83a0a)
- bd daemon export: 2026-02-09 10:28:25 (cdbff8d19)
- **web**: extract env schemas + add env variables guide (447dc8e4f)
- bd daemon export: 2026-02-09 10:14:42 (2f770ad11)
- bd daemon export: 2026-02-09 10:14:19 (9f9f50c36)
- bd daemon export: 2026-02-09 10:00:05 (9b4010252)
- bd daemon export: 2026-02-09 10:00:01 (c71c2f9c8)
- bd daemon export: 2026-02-09 09:59:51 (69c8676d6)
- bd daemon export: 2026-02-09 09:14:04 (c02e773a7)
- bd daemon export: 2026-02-09 09:06:22 (955097a5d)
- bd daemon export: 2026-02-09 09:05:17 (d569254c5)
- bd daemon export: 2026-02-09 09:05:14 (a2c94393d)
- bd daemon export: 2026-02-09 09:00:51 (78df0c10a)
- bd daemon export: 2026-02-09 08:54:34 (71c0bb6a6)
- bd daemon export: 2026-02-09 08:54:23 (981411f55)
- bd daemon export: 2026-02-09 08:30:13 (4d293cb6e)
- **release**: v0.29.3 (ccb4b3254)
- bd daemon export: 2026-02-09 08:24:24 (aff341515)
- bd daemon export: 2026-02-09 08:22:20 (a2ae513d1)
- bd daemon export: 2026-02-09 08:22:12 (1be965284)
- bd daemon export: 2026-02-09 08:18:55 (135ca3f04)
- bd daemon export: 2026-02-09 08:15:06 (1a785b4c5)
- bd daemon export: 2026-02-09 08:14:59 (de01a50d7)
- bd daemon export: 2026-02-09 08:11:29 (b6b2ab03a)
- bd daemon export: 2026-02-09 08:08:13 (951ede3ec)
- bd daemon export: 2026-02-09 08:01:43 (860083c62)
- bd daemon sync: 2026-02-09 07:48:12 (f39599358)
- **release**: v0.29.2 (07b2fa924)
- cleanup from code review — remove dead code, fix test assertions (e2a4fa0b3)
- consolidate Zod schemas — delete dead code, use shared languageSchema (fa347c80d)
- **tests**: remove duplicate trpc test file (662b211b7)
- bd daemon export: 2026-02-08 16:53:12 (f2e553352)
- bd daemon export: 2026-02-08 16:53:10 (b6c0da1a4)
- bd daemon export: 2026-02-08 16:53:07 (8e050c8aa)
- bd daemon export: 2026-02-08 16:43:32 (102d3c5ca)
- bd daemon export: 2026-02-08 16:38:49 (12941673e)
- bd daemon export: 2026-02-08 16:36:36 (350afbd7d)
- bd daemon export: 2026-02-08 16:29:31 (f2db086cf)
- bd daemon export: 2026-02-08 16:26:58 (af2f2384d)
- bd daemon export: 2026-02-08 16:26:57 (df65cd233)
- bd daemon export: 2026-02-08 16:26:55 (23414aeae)
- bd daemon export: 2026-02-08 16:26:54 (7543b0a7a)
- bd daemon export: 2026-02-08 16:26:53 (c3fdcae98)
- bd daemon export: 2026-02-08 16:26:52 (159401361)
- bd daemon export: 2026-02-08 16:26:50 (fcae2d761)
- bd daemon export: 2026-02-08 16:26:47 (322ce7244)
- bd daemon export: 2026-02-08 16:26:09 (c95940181)
- clean up stale docs, empty dirs, and leftover test artifacts (9e5d9cd8e)
- bd daemon export: 2026-02-08 16:16:06 (6b4685094)
- bd daemon export: 2026-02-08 15:48:54 (50b68c0ae)
- bd daemon export: 2026-02-08 15:48:49 (194863f7f)
- bd daemon export: 2026-02-08 15:48:46 (287c96ae5)
- bd daemon export: 2026-02-08 15:48:36 (9ee1743aa)
- bd daemon export: 2026-02-08 15:48:33 (387532b33)
- bd daemon export: 2026-02-08 15:48:30 (5b4ee5f01)
- bd daemon export: 2026-02-08 15:48:23 (83dab1a9d)
- bd daemon export: 2026-02-08 15:48:19 (e3485ba4b)
- bd daemon export: 2026-02-08 15:48:17 (6c3943acf)
- bd daemon export: 2026-02-08 15:48:04 (3205e91de)
- bd daemon export: 2026-02-08 15:48:00 (f2e18dbe3)
- bd daemon export: 2026-02-08 15:47:57 (546513c93)
- bd daemon export: 2026-02-08 15:47:48 (8225f5005)
- bd daemon export: 2026-02-08 15:47:46 (9f430db6d)
- bd daemon export: 2026-02-08 15:47:43 (1ae5c8633)
- **release**: v0.29.1 (c415f85d4)
- sync all pending changes from multi-agent work (e17da70e7)
- **release**: v0.29.0 (dabf5e07a)
- bd daemon export: 2026-02-08 14:31:56 (00d4d353f)
- bd daemon export: 2026-02-08 14:27:02 (5cd53d554)
- bd daemon export: 2026-02-08 13:39:33 (b4e328ee5)
- make `test` run unit tests by default, add `test:full` for all (9f5830a28)
- bd daemon export: 2026-02-08 13:30:22 (377a61278)
- bd daemon export: 2026-02-08 13:24:26 (ce8ae7464)
- bd daemon export: 2026-02-08 13:21:43 (f4acc9ac9)
- bd daemon export: 2026-02-08 13:21:42 (2870c93e8)
- bd daemon export: 2026-02-08 13:21:37 (01891c182)
- bd daemon export: 2026-02-08 13:11:47 (a2081cf8a)
- bd daemon export: 2026-02-08 13:11:42 (86b6508af)
- bd daemon export: 2026-02-08 12:44:42 (229e5123a)
- bd daemon export: 2026-02-08 12:44:40 (da11bff84)
- bd daemon export: 2026-02-08 12:44:39 (693ab1900)
- bd daemon export: 2026-02-08 12:44:37 (d8559ff00)
- Sprint 4 — safe dep updates, performance opts, storage cleanup trigger, type safety audit (c691ea280)
- bd daemon export: 2026-02-08 12:37:07 (a8e12c4b5)
- Sprint 3 — TS standardization, localhost cleanup, Zustand dedup, legacy trpc removal (b53c33a69)
- bd daemon export: 2026-02-08 12:31:28 (fc079939a)
- bd daemon export: 2026-02-08 12:23:46 (4027b6275)
- bd daemon export: 2026-02-08 12:19:18 (d960a2fb3)
- bd daemon export: 2026-02-08 12:13:22 (6431773bb)
- bd daemon export: 2026-02-08 12:04:11 (6915059ff)
- fix typo docs/archieve → docs/archive (31e3871b8)
- audit Sprint 1 — security fixes, dead code cleanup, unused deps removal (0b4e6b92c)
- bd daemon export: 2026-02-08 11:56:31 (edc746bd5)
- bd daemon export: 2026-02-08 11:56:28 (f6809c83c)
- bd daemon export: 2026-02-08 11:56:26 (9fe98ac38)
- bd daemon export: 2026-02-08 11:54:28 (44cb170b5)
- bd daemon export: 2026-02-08 11:54:26 (8f160b7f1)
- bd daemon export: 2026-02-08 11:54:25 (3b3dbf392)
- bd daemon export: 2026-02-08 11:51:29 (179d8b1b4)
- bd daemon export: 2026-02-08 11:48:07 (c603abc71)
- bd daemon export: 2026-02-08 11:48:03 (a9adbebd9)
- bd daemon export: 2026-02-08 11:48:00 (0517e0605)
- bd daemon export: 2026-02-08 11:47:56 (7e1b2b3a7)
- bd daemon export: 2026-02-08 11:47:46 (57e32ffea)
- bd daemon export: 2026-02-08 11:47:43 (7f36c9943)
- bd daemon export: 2026-02-08 11:47:40 (53aaf913f)
- bd daemon export: 2026-02-08 11:47:32 (3f8ac9ddc)
- bd daemon export: 2026-02-08 11:47:29 (b82377f18)
- bd daemon export: 2026-02-08 11:47:25 (6c54bf48d)
- bd daemon export: 2026-02-08 11:47:16 (dbb63d1a5)
- bd daemon export: 2026-02-08 11:47:14 (af25c7037)
- bd daemon export: 2026-02-08 11:47:08 (99a72e279)
- bd daemon export: 2026-02-08 11:46:59 (b3132fd14)
- bd daemon export: 2026-02-08 11:46:55 (5e875465c)
- bd daemon export: 2026-02-08 11:46:53 (4263a9a3e)
- bd daemon export: 2026-02-08 10:56:03 (3152e0d83)
- bd daemon export: 2026-02-08 10:51:27 (197816355)
- bd daemon export: 2026-02-08 10:48:21 (ce5e6dcb6)
- bd daemon export: 2026-02-07 21:54:05 (887269e5b)
- bd daemon export: 2026-02-07 21:50:49 (87fa327ee)
- bd daemon export: 2026-02-07 21:50:44 (056e435ab)
- bd daemon export: 2026-02-07 21:46:14 (741fa884d)
- bd daemon export: 2026-02-07 21:36:09 (bf9172e17)
- bd daemon export: 2026-02-07 21:36:05 (69642b4fe)
- bd daemon export: 2026-02-07 21:31:24 (ec5d200c9)
- bd daemon export: 2026-02-07 20:26:11 (b3de4979a)
- bd daemon export: 2026-02-07 20:26:09 (9e78a36a4)
- bd daemon export: 2026-02-07 20:08:14 (5119e2044)
- **release**: v0.28.62 (702beff3e)
- bd daemon export: 2026-02-07 20:05:04 (07dc7937e)
- bd daemon export: 2026-02-07 20:00:25 (0a9e2cb18)
- bd daemon export: 2026-02-07 20:00:20 (eeccfed27)
- bd daemon export: 2026-02-07 19:38:45 (232b381a6)
- **stage4**: remove content_strategy from README (131199b6e)
- bd daemon export: 2026-02-07 19:29:41 (6d910ee6c)
- bd daemon export: 2026-02-07 19:29:36 (d0146f6a3)
- bd daemon export: 2026-02-07 19:28:13 (baf103aee)
- bd daemon export: 2026-02-07 19:07:28 (aec035330)
- bd daemon export: 2026-02-07 18:45:49 (c3f509161)
- bd daemon export: 2026-02-07 18:45:47 (5df6ba193)
- bd daemon export: 2026-02-07 18:43:20 (9749ac310)
- bd daemon export: 2026-02-07 18:43:16 (93cf14656)
- bd daemon export: 2026-02-07 18:37:00 (8252407bd)
- bd daemon export: 2026-02-07 18:36:57 (c103fddd6)
- bd daemon export: 2026-02-07 18:36:55 (60f8fa20c)
- bd daemon export: 2026-02-07 18:36:54 (6079d651b)
- bd daemon export: 2026-02-07 18:36:52 (827d9b5a7)
- bd daemon export: 2026-02-07 18:36:45 (df1bcdfb0)
- bd daemon export: 2026-02-07 18:36:41 (3155239c3)
- bd daemon export: 2026-02-07 18:36:38 (3a4092177)
- bd daemon export: 2026-02-07 18:36:36 (91429ecc8)
- bd daemon export: 2026-02-07 18:07:13 (385d884db)
- remove deprecated assessment_types field from entire codebase (68155a0a3)
- bd daemon export: 2026-02-07 17:52:29 (0d87c666d)
- bd daemon export: 2026-02-07 17:52:04 (626173419)
- bd daemon export: 2026-02-07 17:03:27 (eedfa5ddf)
- **release**: v0.28.61 (72fe9ed0c)
- bd daemon export: 2026-02-07 16:47:02 (542c91618)
- bd daemon export: 2026-02-07 16:45:49 (c813d2899)
- bd daemon export: 2026-02-07 16:45:45 (d7dbd5638)
- bd daemon export: 2026-02-07 16:30:11 (f71f008cc)
- bd daemon export: 2026-02-07 16:30:07 (a1096cab4)
- **release**: v0.28.60 (bd8606697)
- bd daemon export: 2026-02-07 15:58:05 (13f5ff3cc)
- bd daemon export: 2026-02-07 15:57:58 (e41af9665)
- **release**: v0.28.59 (ecc07fd2d)
- bd daemon export: 2026-02-07 15:30:59 (d75b4205a)
- **stage7**: add unit tests for retry logic and time guard (c129516d5)
- bd daemon export: 2026-02-07 15:30:41 (0144984ce)
- bd daemon export: 2026-02-07 15:30:33 (4f2c1f868)
- bd daemon export: 2026-02-07 15:23:25 (0e82f46a0)
- **stage7**: remove redundant retryAttempt field from Stage7JobInput (6d02004fe)
- bd daemon export: 2026-02-07 15:20:55 (a23e16424)
- bd daemon export: 2026-02-07 15:20:54 (8f340f247)
- bd daemon export: 2026-02-07 15:20:47 (3af9c343c)
- bd daemon export: 2026-02-07 15:20:07 (66bbb1939)
- bd daemon export: 2026-02-07 15:09:49 (0d148b004)
- bd daemon export: 2026-02-07 15:01:27 (38d8212c0)
- bd daemon export: 2026-02-07 15:01:23 (331c4715a)
- bd daemon export: 2026-02-07 14:57:48 (00e548685)
- bd daemon export: 2026-02-07 14:53:39 (ffb9883c8)
- bd daemon export: 2026-02-07 14:53:33 (e0a7e24ee)
- bd daemon export: 2026-02-07 13:36:30 (8a9a9e0e9)
- bd daemon export: 2026-02-07 13:28:35 (709796cce)
- bd daemon export: 2026-02-07 13:28:31 (bb3762f7e)
- **release**: v0.28.58 (c2e613b21)
- **release**: v0.28.57 (5d22f88f7)
- update docs (261ad8155)
- **release**: v0.28.56 (343129a04)
- update docs (3bd024971)
- bd daemon export: 2026-02-06 22:28:52 (1d56f86c9)
- bd daemon export: 2026-02-06 22:28:45 (15fda24bd)
- **release**: v0.28.55 (19759aaad)
- add Userback env vars to Docker build and CI/CD pipeline (a8ae09665)
- bd daemon export: 2026-02-06 20:39:59 (cc0a62871)
- **release**: v0.28.54 (21e9cc135)
- bd daemon export: 2026-02-06 20:10:43 (03cc17749)
- bd daemon export: 2026-02-06 20:06:05 (a7603322d)
- bd daemon export: 2026-02-06 20:05:48 (8600b4184)
- bd daemon export: 2026-02-06 19:52:20 (2ebad3c53)
- bd daemon export: 2026-02-06 19:52:18 (a75537567)
- bd daemon export: 2026-02-06 19:52:17 (e09d0ed3b)
- bd daemon export: 2026-02-06 19:43:58 (9e644477f)
- bd daemon export: 2026-02-06 19:43:50 (375f16882)
- bd daemon export: 2026-02-06 19:43:46 (3f35f81a1)
- bd daemon export: 2026-02-06 14:17:09 (1664f216a)
- bd daemon export: 2026-02-06 14:16:53 (3a620ec47)
- bd daemon export: 2026-02-06 14:16:41 (276f238f8)
- bd daemon export: 2026-02-06 14:10:19 (fe7082199)
- bd daemon export: 2026-02-06 14:10:13 (8453f0162)
- bd daemon export: 2026-02-06 14:06:43 (fc1b468df)
- bd daemon export: 2026-02-06 14:06:38 (9c76154fa)
- bd daemon export: 2026-02-06 14:06:22 (a9a7ae067)
- bd daemon export: 2026-02-06 14:04:11 (c7cdbba23)
- bd daemon export: 2026-02-06 14:03:45 (1d038bb03)
- bd daemon export: 2026-02-06 14:03:34 (86f38d5f5)
- bd daemon export: 2026-02-06 14:03:08 (a31360c4a)
- bd daemon export: 2026-02-06 14:03:05 (d3062aaba)
- bd daemon export: 2026-02-06 14:03:02 (6f432c4b1)
- bd daemon export: 2026-02-06 14:02:59 (598e51bcc)
- bd daemon export: 2026-02-06 14:02:55 (15b4255a1)
- bd daemon export: 2026-02-06 14:02:48 (756409399)
- bd daemon export: 2026-02-06 14:02:44 (5e2bc8949)
- bd daemon export: 2026-02-06 12:18:56 (3a9ebbbd0)
- bd daemon export: 2026-02-06 12:17:44 (a09c55af2)
- bd daemon export: 2026-02-06 12:17:40 (2409a9d97)
- bd daemon export: 2026-02-06 12:17:27 (21a25ae7f)
- bd daemon export: 2026-02-06 12:16:01 (4cd513eb0)
- bd daemon export: 2026-02-06 12:15:56 (c85ac8ddc)
- **release**: v0.28.53 (46c020b55)
- update docs (f763c0325)
- bd daemon export: 2026-02-06 11:52:40 (c58cac581)
- bd daemon export: 2026-02-06 11:52:38 (bf47dcacd)
- bd daemon export: 2026-02-06 11:52:36 (6bb0d8cc5)
- bd daemon export: 2026-02-06 11:44:03 (52f3e5830)
- bd daemon export: 2026-02-06 11:43:52 (f7d8b4d76)
- bd daemon export: 2026-02-06 11:43:51 (ad5eead28)
- bd daemon export: 2026-02-06 10:37:46 (50ff5d421)
- bd daemon export: 2026-02-06 10:37:45 (0532388a8)
- bd daemon export: 2026-02-06 10:09:49 (add37f1a2)
- bd daemon export: 2026-02-06 10:09:48 (4bf1f26ca)
- bd daemon export: 2026-02-06 09:50:37 (458eb78d5)
- bd daemon export: 2026-02-06 09:50:35 (f7aec31bf)
- bd daemon export: 2026-02-06 09:48:59 (28da735de)
- bd daemon export: 2026-02-06 09:48:57 (11fd26724)
- bd daemon export: 2026-02-06 09:48:52 (e0e75b8fd)
- bd daemon export: 2026-02-06 09:48:51 (e777758ae)
- bd daemon export: 2026-02-06 09:41:05 (e3bf9e766)
- bd daemon export: 2026-02-06 09:37:23 (f53ad0dab)
- bd daemon export: 2026-02-06 09:35:16 (ce8be4ce8)
- bd daemon export: 2026-02-06 09:31:20 (ea548ae2a)
- bd daemon export: 2026-02-06 09:31:15 (d53bdca2b)
- bd daemon export: 2026-02-06 09:30:00 (a6a4c34f0)
- bd daemon export: 2026-02-06 09:29:19 (626c7d373)
- bd daemon export: 2026-02-06 09:19:56 (4cf3daf57)
- bd daemon export: 2026-02-06 09:19:51 (28921cd33)
- bd daemon export: 2026-02-06 09:17:35 (87512b728)
- bd daemon export: 2026-02-06 09:17:28 (88fbb62d6)
- bd daemon export: 2026-02-06 09:17:26 (f5041dd45)
- bd daemon export: 2026-02-06 09:17:25 (7132daeb5)
- bd daemon export: 2026-02-06 09:17:23 (298218cd9)
- bd daemon export: 2026-02-06 09:12:39 (3bdccde28)
- bd daemon export: 2026-02-06 09:12:34 (0e3b07e4d)
- bd daemon export: 2026-02-05 22:32:36 (0dcd1d937)
- bd daemon export: 2026-02-05 22:20:55 (6439eb064)
- bd daemon export: 2026-02-05 22:19:20 (cb0e18cc3)
- bd daemon export: 2026-02-05 22:19:13 (5d95ff602)
- bd daemon export: 2026-02-05 22:12:23 (9f461bdaf)
- bd daemon export: 2026-02-05 22:11:41 (bf2f9b9a6)
- bd daemon export: 2026-02-05 22:11:40 (7a33e9df0)
- bd daemon export: 2026-02-05 22:11:31 (5054861c4)
- bd daemon export: 2026-02-05 22:05:31 (a1874773d)
- bd daemon export: 2026-02-05 21:57:25 (2166de5f2)
- bd daemon export: 2026-02-05 21:57:16 (43bb312a3)
- bd daemon export: 2026-02-05 21:57:07 (4526f27bd)
- bd daemon export: 2026-02-05 21:56:58 (8ecfc237a)
- bd daemon export: 2026-02-05 14:22:52 (74aa6205a)
- remove deprecated assessment_types field from pedagogical_patterns (31cb8547c)
- bd daemon export: 2026-02-05 14:13:03 (b63b9e2dc)
- bd daemon export: 2026-02-05 14:12:50 (bce6ef6fd)
- **release**: v0.28.52 (069f422b7)
- bd daemon export: 2026-02-04 21:41:47 (e28ade644)
- **chat**: add unit tests for RefinementChat and useRefinement fixes (6d04c5b48)
- **migration**: add post-deployment verification queries (376312cad)
- bd daemon export: 2026-02-04 21:37:32 (36d3bd348)
- **export-lessons**: code review fixes + integration tests (88b530e45)
- bd daemon export: 2026-02-04 21:36:07 (307164383)
- bd daemon export: 2026-02-04 21:34:56 (4c482f7e2)
- bd daemon export: 2026-02-04 21:34:50 (1ee7adfa1)
- bd daemon export: 2026-02-04 21:34:48 (6d70936c2)
- bd daemon export: 2026-02-04 21:26:24 (3d9618425)
- bd daemon export: 2026-02-04 21:26:01 (b45ae3bb4)
- bd daemon export: 2026-02-04 21:25:59 (4db068f08)
- bd daemon export: 2026-02-04 21:24:29 (180143f34)
- bd daemon export: 2026-02-04 21:24:25 (77bb8fea3)
- bd daemon export: 2026-02-04 21:18:36 (382303523)
- bd daemon export: 2026-02-04 21:09:59 (07b5b2eea)
- bd daemon export: 2026-02-04 21:05:09 (d68adf32a)
- **tests**: remove dead `answers` field from test fixtures (b3a7618ef)
- bd daemon export: 2026-02-04 20:42:22 (a673df571)
- bd daemon export: 2026-02-04 20:42:19 (4fbb325d7)
- bd daemon export: 2026-02-04 20:27:27 (284b53830)
- bd daemon export: 2026-02-04 20:19:12 (08c58f0b3)
- bd daemon export: 2026-02-04 20:17:08 (91d38dc86)
- bd daemon export: 2026-02-04 20:13:04 (fe37745a1)
- bd daemon export: 2026-02-04 19:33:01 (be24f9486)
- bd daemon export: 2026-02-04 19:32:56 (60bd40ead)
- bd daemon export: 2026-02-04 19:16:12 (966000108)
- bd daemon export: 2026-02-04 19:16:10 (6a7c4003a)
- bd daemon export: 2026-02-04 19:16:04 (b5170acf8)
- bd daemon export: 2026-02-04 19:13:19 (5974fcf6c)
- bd daemon export: 2026-02-04 19:13:18 (7d8af1b10)
- bd daemon export: 2026-02-04 19:13:16 (88a4b3c2d)
- bd daemon export: 2026-02-04 19:11:12 (e25b04050)
- bd daemon export: 2026-02-04 19:09:30 (8b9a3fe39)
- bd daemon export: 2026-02-04 19:09:03 (462eb8fab)
- bd daemon export: 2026-02-04 19:07:37 (520c999d7)
- bd daemon export: 2026-02-04 19:07:36 (e5ddee612)
- bd daemon export: 2026-02-04 19:07:34 (3b934ecd3)
- **release**: v0.28.51 (5fc13cfdb)
- update docs (3da8a699d)
- bd daemon export: 2026-02-04 16:54:49 (d69509610)
- **i18n**: add unit tests for content labels and validateLanguageCode (7f1a5fb99)
- bd daemon export: 2026-02-04 16:15:14 (965eaeaee)
- bd daemon export: 2026-02-04 16:11:03 (d184f53ec)
- bd daemon export: 2026-02-04 16:04:11 (ca64f1103)
- bd daemon export: 2026-02-04 14:39:35 (30d8dc4af)
- bd daemon export: 2026-02-04 14:30:22 (7134f62b0)
- bd daemon export: 2026-02-04 14:30:17 (cc1755f10)
- **release**: v0.28.50 (5e8e5a294)
- misc updates (docs, config, experiments) (c9e75f187)
- bd daemon export: 2026-02-03 22:22:35 (05dd5b84e)
- bd daemon export: 2026-02-03 22:22:33 (ea7cb855c)
- bd daemon export: 2026-02-03 22:21:06 (2c1c454cb)
- bd daemon export: 2026-02-03 22:18:35 (9b847ec79)
- bd daemon export: 2026-02-03 22:14:36 (13d857304)
- bd daemon export: 2026-02-03 22:14:22 (069e05c9c)
- bd daemon export: 2026-02-03 22:13:54 (3d60b48be)
- bd daemon export: 2026-02-03 22:13:52 (f775abb9f)
- bd daemon export: 2026-02-03 22:12:52 (810050d39)
- bd daemon export: 2026-02-03 22:12:42 (a08811b48)
- bd daemon export: 2026-02-03 22:12:38 (707a68449)
- bd daemon export: 2026-02-03 22:12:33 (54b6f98aa)
- add comprehensive unit tests for Intent Classification system (5cdde7ec5)
- bd daemon export: 2026-02-03 21:57:20 (b2b982314)
- bd daemon export: 2026-02-03 21:50:23 (415c4a7c7)
- bd daemon export: 2026-02-03 21:40:32 (6a5c2e86b)
- bd daemon export: 2026-02-03 21:39:37 (3d02d724c)
- bd daemon export: 2026-02-03 21:39:36 (237c243df)
- bd daemon export: 2026-02-03 21:34:32 (6ed67bf62)
- bd daemon export: 2026-02-03 21:26:26 (bc880c450)
- bd daemon export: 2026-02-03 21:25:47 (010e36b04)
- add model configuration guide with SQL examples (07fe5fd8c)
- move llm-model-config.md to .claude/docs and add reference in CLAUDE.md (c12c63c25)
- update chat fallback config in llm-model-config.md (21f947986)
- bd daemon export: 2026-02-03 13:08:29 (bdcca7763)
- bd daemon export: 2026-02-03 13:05:14 (5d41fccbb)
- bd daemon export: 2026-02-03 13:02:18 (9a9caa537)
- bd daemon export: 2026-02-03 13:01:13 (0476d0d0f)
- bd daemon export: 2026-02-03 13:01:11 (3cc9d9107)
- bd daemon export: 2026-02-03 13:00:07 (5bef4ed77)
- bd daemon export: 2026-02-03 12:59:53 (15a770533)
- bd daemon export: 2026-02-03 12:59:51 (3d97be427)
- bd daemon export: 2026-02-03 12:59:50 (b293c1fa5)
- bd daemon export: 2026-02-03 12:01:48 (f6046ca3d)
- bd daemon export: 2026-02-03 11:53:03 (1dc2f924b)
- bd daemon export: 2026-02-03 11:52:58 (c7d6614c0)
- bd daemon export: 2026-02-02 21:30:10 (347e442cb)
- bd daemon export: 2026-02-02 21:30:09 (dc97bb4d1)
- bd daemon export: 2026-02-02 21:30:08 (0c24a793d)
- bd daemon export: 2026-02-02 21:30:07 (d897cbb3a)
- bd daemon export: 2026-02-02 21:30:06 (266935188)
- bd daemon export: 2026-02-02 21:25:51 (4b0d1fd0f)
- bd daemon export: 2026-02-02 21:25:39 (1f517a520)
- bd daemon export: 2026-02-02 21:25:38 (d62a52165)
- bd daemon export: 2026-02-02 21:25:37 (b38c7e5d0)
- bd daemon export: 2026-02-02 21:25:35 (031957b93)
- bd daemon export: 2026-02-02 21:25:33 (edc6cce95)
- bd daemon export: 2026-02-02 21:11:00 (91ffc6ee5)
- bd daemon export: 2026-02-02 21:10:59 (4450ea11f)
- bd daemon export: 2026-02-02 21:10:58 (5b26bd049)
- bd daemon export: 2026-02-02 21:10:57 (2bced66d0)
- bd daemon export: 2026-02-02 21:07:45 (f2731d921)
- bd daemon export: 2026-02-02 21:07:37 (a1700f38c)
- bd daemon export: 2026-02-02 21:07:36 (f6d00b0bb)
- bd daemon export: 2026-02-02 21:07:34 (e5460eacc)
- bd daemon export: 2026-02-02 21:07:33 (4bfd9f387)
- bd daemon export: 2026-02-02 20:13:47 (0166e4794)
- bd daemon export: 2026-02-02 20:06:49 (166a904b4)
- **release**: v0.28.49 (29874aca0)
- update docs (a980aa864)
- bd daemon export: 2026-02-02 19:28:00 (05d5afbe8)
- bd daemon export: 2026-02-02 19:25:28 (5c316cfdb)
- bd daemon export: 2026-02-02 19:25:19 (62d67074d)
- bd daemon export: 2026-02-02 19:25:15 (eedede4be)
- bd daemon export: 2026-02-02 19:25:06 (af4cc666f)
- bd daemon export: 2026-02-02 18:46:31 (95f7ff518)
- bd daemon export: 2026-02-02 18:43:46 (504f6d690)
- bd daemon export: 2026-02-02 18:43:40 (a8eb572ce)
- bd daemon export: 2026-02-02 18:38:30 (15069b38e)
- bd daemon export: 2026-02-02 18:33:34 (45fff8795)
- bd daemon export: 2026-02-02 18:33:32 (3fac38900)
- bd daemon export: 2026-02-02 17:54:17 (7f60739ee)
- bd daemon export: 2026-02-02 17:54:15 (12fd56940)
- bd daemon export: 2026-02-02 17:54:14 (73f4a194f)
- bd daemon export: 2026-02-02 17:53:40 (2e6ecf759)
- bd daemon export: 2026-02-02 17:49:33 (bb94f4052)
- bd daemon export: 2026-02-02 17:49:31 (7b5d79793)
- bd daemon export: 2026-02-02 17:49:29 (7faaec70c)
- bd daemon export: 2026-02-02 17:09:29 (d180e6e78)
- code quality cleanup - fix tests, remove dead code (9f71887fc)
- bd daemon export: 2026-02-02 14:53:54 (8e2fdb6a8)
- bd daemon export: 2026-02-02 14:53:53 (8918cc84d)
- bd daemon export: 2026-02-02 14:53:51 (8ec3a215b)
- bd daemon export: 2026-02-02 14:53:36 (0470e099b)
- bd daemon export: 2026-02-02 14:53:32 (92528d668)
- bd daemon export: 2026-02-02 14:53:27 (60b25c9ac)
- bd daemon export: 2026-02-02 14:53:26 (770ee4ac5)
- bd daemon export: 2026-02-02 14:53:25 (0da6681a0)
- bd daemon export: 2026-02-02 14:53:23 (2807aa232)
- bd daemon export: 2026-02-02 14:53:19 (2cb043e51)
- bd daemon export: 2026-02-02 14:53:17 (109cceaad)
- bd daemon export: 2026-02-02 14:53:16 (44c000976)
- bd daemon export: 2026-02-02 14:53:15 (22ad0da3a)
- bd daemon export: 2026-02-02 14:52:03 (45373a381)
- bd daemon export: 2026-02-02 13:56:11 (15a01807a)
- bd daemon export: 2026-02-02 13:39:31 (4ec0907bb)
- bd daemon export: 2026-02-02 13:19:37 (ba14191d7)
- bd daemon export: 2026-02-02 13:17:37 (95783bb8b)
- bd daemon export: 2026-02-02 13:17:23 (eada7005e)
- bd daemon export: 2026-02-02 13:16:38 (db87f6f9b)
- bd daemon export: 2026-02-02 13:15:11 (63b7e6f74)
- bd daemon export: 2026-02-02 13:15:05 (2e0597b87)
- bd daemon export: 2026-02-02 13:15:03 (e613c72fa)
- bd daemon export: 2026-02-02 13:10:43 (8c48f3d63)
- bd daemon export: 2026-02-02 12:49:01 (849183c29)
- bd daemon export: 2026-02-02 12:48:54 (1c218589b)
- bd daemon export: 2026-02-02 12:48:50 (af67640e4)
- bd daemon export: 2026-02-02 12:48:45 (59190e60f)
- bd daemon export: 2026-02-02 12:48:37 (9b6fddf95)
- bd daemon export: 2026-02-02 12:48:30 (5442db3b5)
- bd daemon export: 2026-02-02 12:39:29 (d9aa9e0af)
- bd daemon export: 2026-02-02 12:38:30 (aa5a7b4d5)
- bd daemon export: 2026-02-02 12:34:56 (f7d6f0ecc)
- bd daemon export: 2026-02-02 09:12:07 (c7fc006cc)
- bd daemon export: 2026-02-02 09:11:17 (5353b5171)
- bd daemon export: 2026-02-02 09:10:40 (55e84b3d6)
- bd daemon export: 2026-02-02 09:10:23 (4cedf63e5)
- bd daemon sync: 2026-02-02 08:57:07 (650254a5b)
- **release**: v0.28.48 (840384eb0)
- update docs (bb1f7b59c)
- save remaining local changes (870ff8b24)
- save local changes before deploy (b0c0850d2)
- **release**: v0.28.47 (4d1998a48)
- **release**: v0.28.46 (cb8993401)
- update docs (beee0a962)
- **release**: v0.28.45 (07960aa0e)
- add code review report and plan for course data update fix (4f8b3d066)
- resolve merge conflict in UserTasks.md (c822385f8)
- **release**: v0.28.44 (d6608694d)
- update docs (808dff89a)
- **release**: v0.28.43 (b08b925b8)
- update docs (31c4390ce)
- **release**: v0.28.42 (709b54d25)
- **benchmarks**: fix criteria mismatch in scoring system docs (7b5d40bd4)
- **benchmarks**: update README with scenario/date filters (cccb7cae5)
- **release**: v0.28.41 (9c426fd84)
- **stage4**: add tests for interrupt vs error logging behavior (1c65a8559)
- **errors**: standardize error messages to active voice (606cce9bd)
- **stage4**: remove broken json-repair test (9b4631b6b)
- **release**: v0.28.40 (8b7402d4d)
- **i18n**: add Generation Graph section after P3.3 migration (bf4a38c01)
- **release**: v0.28.39 (2e1d40552)
- update README to reflect next-intl migration (a9c4c53c3)
- **release**: v0.28.38 (5b7d708ab)
- update docs (a95f1ae25)
- update llm-model-config with actual DB values (eedbf64f2)
- add QA testing guide for 2026-01-25 release (bf9855f06)
- **release**: v0.28.37 (333eb4ff6)
- **deploy**: add docling-mcp image management section (b4245001d)
- **deploy**: add Dev Environment section to deployment guide (2245944ff)
- **release**: v0.28.36 (9547f7380)
- update docs (3a1faa099)
- **ADR-004**: fix branch names and add port details (1f430f515)
- **release**: v0.28.35 (1d7ba4459)
- **stage5**: add unit tests for CourseConstraints implementation (d18fd7ad1)
- increase form field limits (d205f486d)
- **release**: v0.28.34 (33b190dc2)
- **release**: v0.28.33 (8ce26af74)
- update docs (51ee88e03)
- add code review report for session fixes (556f87c95)
- **stage3**: add unit tests for single document optimization (7b92d549d)
- add product discovery answers (ru) (3b3c642d3)
- **release**: v0.28.32 (887394b37)
- add system configuration analysis 2026 report (0767a4212)
- **release**: v0.28.31 (6ae49cf7c)
- **release**: v0.28.30 (6669f9ad7)
- **release**: v0.28.29 (8c9c11c12)
- **release**: v0.28.28 (3800f3f65)
- update deployment guide with nginx single source of truth (949fa2995)
- **database**: comprehensive code review of 2026-01-23 migrations (c627ed481)
- **release**: v0.28.27 (2266af420)
- update 1 skill(s), update docs, +1 more (3a36bb71b)
- **release**: v0.28.26 (2c6b15631)
- remove demo pages (fd0402053)
- **release**: v0.28.25 (8940ffcd7)
- **plans**: mark Stage 4 persistence plan as completed (1a9cf1c76)
- **release**: v0.28.24 (2cc713f2e)
- **release**: v0.28.23 (a5700dba5)
- fix eslint error and stage pending changes (80a2d1049)
- **logs**: add auto-mute rules for RAG chunks and Mermaid fallback (5f1f4014d)
- **code-review**: add file upload tier limits review report (fa851491f)
- **logs**: add auto-mute rules for cascading repair and corrupted jobs (102f77074)
- **release**: v0.28.22 (37e02d1ec)
- update docs (a90e46dde)
- add comprehensive progress report for January 2026 (a0145a45a)
- **release**: v0.28.21 (a32d4c6d7)
- update 1 skill(s), update docs (7fec36223)
- **release**: v0.28.20 (7293eaa63)
- update docs (bff4c3d83)
- **release**: v0.28.19 (925348258)
- **release**: v0.28.18 (fb0f0c6a5)
- **form**: add debug logging for form preferences (036696912)
- **release**: v0.28.17 (89e294786)
- **claude**: add rule to never discard uncommitted changes on /push (ca2dbf517)
- **release**: v0.28.16 (ba5c24e67)
- **release**: v0.28.15 (71fd637b3)
- **release**: v0.28.14 (b599f0eed)
- **course-gen-platform**: update 81 test(s) (dc5da541f)
- Revert "feat(image-gen): add quality parameter for GPT-5 Image Mini cost optimization" (e47ce29c7)
- **skill**: add environment filtering to process-logs skill (3dccd981a)
- **deps**: update docling-mcp to >=1.3.3 (4f7911751)
- **release**: v0.28.13 (4a18d5574)
- **release**: v0.28.12 (2e845be10)
- **stage5**: add unit tests for MinimumLessonsValidator (8e2af69a7)
- **release**: v0.28.11 (b5280a161)
- **release**: v0.28.10 (702b1d856)
- **processor**: add integration tests and bundle analysis (82005facd)
- **release**: v0.28.9 (6faaeb72d)
- **deploy**: increase deploy-dev timeout to 20 minutes (2831aee14)
- **release**: v0.28.8 (df69dbb42)
- **release**: v0.28.7 (d23aa3a0c)
- **release**: v0.28.6 (c04819555)
- add code review report for course-viewer improvements (790c89a87)
- **release**: v0.28.5 (cb036d872)
- **release**: v0.28.4 (6c4ffa775)
- **skill**: update process-logs to check both error_logs and generation_trace (b144f3d03)
- **skill**: sync process-logs SKILL.md with auto-mute rules (137bf88f1)
- **logging**: add performance optimization strategy and docs sync test (aa91c1f42)
- **release**: v0.28.3 (612d9edeb)
- **logging**: verify auto_muted implementation end-to-end (4f65ea012)
- **web**: split EnrichmentsPanel into smaller modules (736cb6312)
- **skills**: add log notes requirements to process-logs v1.4.0 (d2abd21df)
- **release**: v0.28.2 (61ad2c250)
- **skills**: add bug fixing principles to process-logs v1.3.0 (dc360b49c)
- **skills**: clarify task complexity routing in process-logs (e79c44f66)
- **skills**: make process-logs instructions mandatory (2c6af396a)
- **skills**: update process-logs with orchestrator instructions (925e2f54e)
- **release**: v0.28.1 (c2fffb97b)
- **stage6**: remove type assertion in isCoursePaused (9935b9271)
- **gemini**: add project context and hooks for Gemini CLI (928e143c9)
- **release**: v0.28.0 (d2784f1f9)
- Revert "fix(styles): add 'microlearning' course style" (7c8e63cc1)
- **release**: v0.27.11 (f365e6485)
- **release**: v0.27.10 (6311585fb)
- **release**: v0.27.9 (0ac8d739d)

### Added

- **career-playbook**: add configurable Playwright E2E harness, read-only backend smoke preflight, and Phase 11 verification docs.

## [0.31.40] - 2026-04-10

### Added

- add 2 source file(s), update 1 source file(s), +1 more (568b7a64)

### Fixed

- **api**: resolve ESM module conflict between helpers.ts and helpers/ directory (be088c89)
- **deploy**: staged container startup and diagnostic logging (91d942fd)

## [0.31.39] - 2026-04-07

### Fixed

- **web**: derive stage6 ladder models from persisted history (6bb53377)

### Other

- update project files (6afec96f)

## [0.31.38] - 2026-04-07

### Fixed

- **web**: cherry-pick 2 minor fixes from stale branches (242d2cc0)

### Other

- update docs (3f615923)

## [0.31.37] - 2026-04-07

### Added

- add 2 source file(s), update docs (70b51d27)
- **stage6**: surface quality ladder review history (650b5aa7)
- **stage6**: add quality recovery execution ladder (2ca4b1f4)
- **stage6**: add quality ladder contract (f1bfc65c)
- **orchestration**: add local contract and dev delivery path (23e7c2a9)
- **cli**: add dev delivery command (b4c33792)

### Fixed

- **web**: simplify quality recovery hook imports (c9eccd3d)
- **web**: align quality ladder shared-type imports (31464c90)
- **stage6**: show explicit review empty state (3f9dbe09)
- **web**: preserve collapsed lesson inspector split (463d234c)
- **web**: add lesson inspector split fallback (33b6e94c)
- **web**: reconcile stuck stage6 course status (d5befcb9)
- **cli**: make push-dev cleanup pipefail-safe (370f80aa)
- **cli**: restore push-dev cleanup trap (a08764ec)
- **stage6**: restore lesson preview and review-required state (8cb1b502)

### Other

- **web**: stabilize quality ladder ui assertions (e59232a4)

## [0.31.36] - 2026-04-04

### Fixed

- **tests**: fix lint errors in targeted-refinement-orchestrator test (895b319e)
- **stage6**: fix token budget telemetry and deduplicate budget check (bd99787d)

## [0.31.35] - 2026-04-04

### Fixed

- **stage6**: address final review findings for quality hardening (29d57296)
- **stage6,web**: fix dead sectionCount check, callout whitespace, cleanup (a64f4ff0)

### Other

- add .agents/ and .codex/ to .gitignore (eee37ba6)
- **stage6**: bump bundle size threshold from 2.0 to 2.5 MB (9303f714)

## [0.31.34] - 2026-04-03

### Fixed

- **web**: repair broken markdown table rows with split quoted text (86b85e21)
- **stage6,web**: fix PRO TIP callout, section validation, and CI blocker (bdb6680a)

## [0.31.33] - 2026-04-01

### Changed

- **shared-types**: extract CONCLUSION_HEADINGS to shared constant, remove legacy code (d9553bc0)

## [0.31.32] - 2026-04-01

### Fixed

- **web**: resolve lint errors in profile pages and i18n (8606e0eb)
- **stage6**: fix systemic content quality issues in lesson generation (ca08480d)

## [0.31.31] - 2026-03-31

### Fixed

- **tests**: ensure Qdrant collection exists before integration tests (8243d429)

## [0.31.30] - 2026-03-31

### Added

- **jd**: regenerate sales-manager-b2b v2 with 26 blocks + 3 Mermaid diagrams (b8dc606f)
- **skill**: add job-description role guide generator (26 blocks) (2ccd8173)

### Fixed

- **enrichments**: break infinite realtime subscription loop in Stage 7 inspector (c9832c52)
- **nlm**: replace broken CDP auth script with official notebooklm login (6165122f)
- **jd**: update CTA link to https://ai.megacampus.ru in JD and skill (ef2893c1)

## [0.31.29] - 2026-03-21

### Fixed

- **pipeline**: harden Stage 6 quality pipeline — fix 6 root causes (55662f8c)
- **pipeline**: definitive FSM with all transitions + bypass support (2cc1b6cc)
- **pipeline**: restore all lost FSM transitions from original migration (5fa0581c)
- **auth**: add admin/superadmin bypass to restart-stage endpoint (4d3af215)
- **pipeline**: correct FSM status names to match actual enum values (02fc286a)
- **pipeline**: add awaiting_approval to init state transitions (74a2bcb1)

### Other

- trigger rebuild for server action hash fix (1698f7df)

## [0.31.28] - 2026-03-21

### Fixed

- **course-gen-platform**: update 6 source file(s), update docs (cd94b2b2)
- **pipeline**: allow FSM pending → stage_3/4_init for pre-processed docs (80cd2a4d)

## [0.31.27] - 2026-03-21

### Fixed

- **stage6**: eliminate mermaid text fallback + add 3-tier model cascade (9378d327)
- **web**: truncate long lesson titles to prevent horizontal scroll (64741a37)

## [0.31.26] - 2026-03-21

### Fixed

- **pipeline**: add FSM transition + missing enum values + auto-mute rules (925c0afb)
- **pipeline**: extend sanitization to strip surrogate pairs before PG storage (c2f572d4)
- **pipeline**: strip null bytes from Docling output before PostgreSQL storage (11397c33)

### Other

- **docker**: upgrade Docling to v2.80+ in MCP server image (8c81bfbf)

## [0.31.25] - 2026-03-19

### Fixed

- **pipeline**: add DB-level race condition guard to FSM initialization (9891db8b)
- **pipeline**: address code review findings for FSM guard + progress fix (892ffc0a)
- **pipeline**: prevent duplicate FSM init + fix clarifying progress message (de500dc0)
- **web**: make getUserFavorites async to fix Next.js Server Actions build (430bdcd1)

## [0.31.24] - 2026-03-18

### Added

- **course-gen-platform**: add 1 source file(s), update 2 source file(s), +1 more (ed7fb505)

### Fixed

- **auth**: unify course authorization to allow org members across all actions (5ee1695a)
- **enrichments**: allow org members to manage enrichments, not just course owner (ee213ee4)
- **nlm-bridge**: add lesson_id field to MediaGenerationRequest model (86ca665b)

## [0.31.23] - 2026-03-17

### Fixed

- **pipeline**: increase LLM timeouts across all stages to prevent OpenRouter AbortErrors (117f493d)
- **pipeline**: increase Phase 0.5 LLM timeout to 30min with adaptive scaling (0739e69c)
- **shared-types**: add post-build script to fix ESM import extensions (66f5aa03)
- **pipeline**: inline shared-utils in tsup bundle to fix ESM resolution (cfc8e209)
- **pipeline**: improve extractErrorMessage comment explaining \_sandboxError reliability (03f7bae8)
- **pipeline**: address code review findings for sandbox error capture (235b3b39)
- **pipeline**: fix sandbox error capture with prependListener and cleanup dead code (affbb29c)

### Other

- update docs (67424fb5)
- update Stage 2 sandbox fix plan with investigation findings (4c9da0f3)

## [0.31.22] - 2026-03-17

### Fixed

- **pipeline**: address code review findings for sandbox error pattern (cee6a008)
- **pipeline**: fix BullMQ sandbox error message loss in Stage 2 (44c1d688)
- **admin**: fix Docling MCP 404 and stuck courses false positives in health monitor (b7e9b9c9)

## [0.31.21] - 2026-03-16

### Fixed

- **course-gen-platform**: update 11 source file(s) (7050c721)
- **stage5**: make lesson materialization idempotent (c921511b)
- **stage6**: tighten MERMAID_SYNTAX_PATTERNS to reduce false positives (bac9096b)

## [0.31.20] - 2026-03-16

### Added

- **stage6**: add centralized sanitizeContent at DB write layer (9f1c6b7e)

### Changed

- **course-gen-platform**: split 4 files >800 lines into extracted modules (Batch 1) (00b6a442)
- **course-gen-platform**: split large files to reduce max-lines warnings (0167faef)
- **course-gen-platform**: split notebooklm-bridge-client.ts to fix max-lines (b9b811f4)
- **course-gen-platform**: split model-config-bunker.ts to fix max-lines (232f1ace)
- **course-gen-platform**: split phase-0.5-clarifying.ts to fix max-lines (e5557507)
- **course-gen-platform**: split generation-phases.ts to fix max-lines (1e323f35)
- **course-gen-platform**: split stage6-prompts.ts into individual files (563dffc7)
- replace console logs with structured logger in web and shared-utils (6baec5c9)
- **course-gen-platform**: replace console logs with structured logger (a6d651f8)
- **stage6**: replace LO-code IDs with numbered format in prompts (023cb43c)

### Fixed

- **course-gen-platform**: add barrel index.ts files for split modules (9da0e080)
- **ci**: fix PostCSS config and mermaid regex breaking CI pipeline (6538873b)
- **pipeline**: fix error message propagation + monitoring blind spots (76d4d0b0)
- **web**: fix remaining 18 ESLint warnings (no-img-element, alt-text, unused-disable) (2b9dc708)
- **web**: resolve all @typescript-eslint/no-explicit-any warnings (final retry) (89b219db)
- **web**: use imported tailwindcss plugin in postcss.config.mjs for Vite 7 compat (e9971abe)
- **web**: handle /sse endpoint in Docling health check URL derivation (ca6228d5)
- **infra**: prevent Docling proxy DNS caching + add auto-mute rule (9a32658e)
- **worker**: capture uncaught exceptions in sandbox processor for 9MB DOCX crash (1793044b)
- **web**: normalize course status for i18n translation keys (4292cc5a)
- **stage1**: handle QuotaExceededError before duck-type checks in orchestrator (87a31b28)
- **tests**: fix basic_plus tier enum and PGRST116 handling in quota-enforcer (9dee4c1d)
- **tests**: reset Redis concurrency counters in contract generation tests (faca0495)
- **tests**: fix multiple test failures across integration, e2e, and contract suites (b30586ab)
- **logger**: add auto-mute pattern for Mermaid render-invalid warnings (d0c97f2b)
- **worker**: preserve error message/stack in BullMQ sandbox serialization (5d9ab227)
- **worker**: add safety net for stuck courses on sandbox crash (702d0fea)
- **ci**: resolve test timeouts and hanging process issues (7751007b)
- **web**: fix PostCSS config and shared-utils barrel import breaking build (3c1c5c91)
- **shared-logger**: replace tsup --dts with tsc --emitDeclarationOnly (9f0c7400)
- **stage6**: prevent LO_CODE_PATTERN from consuming newlines (ece1d0db)
- **stage6**: strip LO-code references leaking into lesson content (9e3c2d31)
- **stage6**: strip LLM metadata leaking into lesson content (31e681eb)

### Other

- triage TODO/FIXME markers and update eslint max-warnings (850→95) (bb392701)
- **web**: remove unused-vars across package (fcf81de8)
- eslint auto-fix across web and course-gen-platform (e3aefcd6)
- fix DOCLING_MCP_URL default in deployment guide (/sse → /mcp) (e8508320)

## [0.31.19] - 2026-03-11

### Changed

- extract shared utils/logger, enrichment card overlay UX (2d880559)

### Fixed

- **logger**: add auto-mute for Zod→Regenerator, Phase5 fallback, outbox transients (2ecde367)
- **logger**: add auto-mute for Redis/Queue transient errors during restarts (921fd82a)
- **logger**: expand auto-mute patterns for Mermaid render failures and systemHealth probes (2c9b4721)
- **deploy**: remove --remove-orphans that killed Redis on every deploy (2252ea96)
- **tests**: resolve TS module alias resolution errors in IDE (8a959ac6)
- **tests**: resolve lint and typescript strict mode errors in new tests (865b5337)
- **tests**: stabilize test suite — PostCSS import, test assertions, coverage config (708d61cb)

### Other

- add Jina API key rotation guide (1cbc9afc)
- add critical operational rules to deployment guide + server security audit (a678ab2e)
- **course-gen-platform**: add comprehensive MetricsStore tests (853 LOC module) (ed89c39a)
- **course-gen-platform**: add minimum-lessons-validator, mermaid-validator, source-doc-validator, logger-utils tests (9016d116)
- **course-gen-platform**: add section-utils arbiter + content-utils tests (33661f1f)
- **course-gen-platform**: add pure tests for text-utils syllable counter and flesch-kincaid (285ee145)
- **course-gen-platform**: add pure tests for validators and table-fix pipeline (d7d0d57a)
- **course-gen-platform**: add unit tests for stage5/stage6 pure utilities (16883fb9)
- **coverage**: fix failing tests + 139 new shared utility tests (ff75ecf1)
- fix code metrics — 580K+ lines, 6,300+ tests (1df625b0)

## [0.31.18] - 2026-03-05

### Added

- **skills**: add code-review skill, remove old code-reviewer stubs (3d07abf3)

### Changed

- **skills**: remove code-review-inline orchestrator (ee6e974c)

### Other

- update docs, cleanup 190 file(s) (65a39450)
- fix generation time, add planned features from catalog (750429d2)
- add strategic vision document, update investor overview (6e2932b5)
- update investor overview with comprehensive improvements (d9997312)
- add investor overview document with full platform analysis (e0d2f9b9)

## [0.31.17] - 2026-03-02

### Added

- **flashcards**: redesign FlashcardViewer UI with fullscreen study mode (1d57148c)

## [0.31.16] - 2026-03-02

### Fixed

- **mind-map**: CSS fullscreen with shared state, fix fold depth, remove duplicate close button (f6a4bc57)
- **mind-map**: match video aspect ratio for inline preview, fullscreen for View Full Map (7569a300)

## [0.31.15] - 2026-03-01

### Added

- **enrichments**: refactor enrichment system with all 14 types, batch UI, and i18n (c5770308)

### Fixed

- **web**: update 12 source file(s), update 2 test(s), +1 more (662f0ce4)
- **mind-map**: unify display to markmap SVG and fix interactivity in dialog (faa8ea62)

## [0.31.14] - 2026-03-01

### Added

- **quiz**: unhide quiz enrichment with multi-select, andragogy, and renamed to Квиз (7c96c1df)

### Fixed

- **quiz**: address remaining code review findings (CR-003,007,008,011,015) (b9f0160b)
- **i18n**: propagate locale to STAGE_CONFIG and downstream components (d73ad142)
- **i18n**: convert ContentPreviewPanel and LessonMatrix to useTranslations (ec0e6293)
- **i18n**: fix remaining hardcoded Russian strings missed in initial pass (cc0234d5)
- **i18n**: replace hardcoded Russian strings in generation panel components (046fcfdc)
- **i18n**: replace hardcoded Russian in catalog, workflow stages, and clarifying questions (b1d7e03e)

## [0.31.13] - 2026-03-01

### Fixed

- **i18n**: replace hardcoded Russian strings with i18n keys across 12+ components (f3df93fc)

### Other

- update docs (701e4ee1)

## [0.31.12] - 2026-03-01

### Added

- **ui**: update enrichments UI, course cards, header and viewer improvements (f0b7363c)

## [0.31.11] - 2026-03-01

### Added

- **viewer**: remove max-width constraints so lesson content fills available space (180a9ee4)

## [0.31.10] - 2026-02-28

### Fixed

- **pipeline**: translate course title to target language in Stage 5 (92891dae)

## [0.31.9] - 2026-02-28

### Added

- **enrichments**: hide audio, video, presentation, quiz from UI (ba0498c3)

## [0.31.8] - 2026-02-28

### Added

- **enrichments**: replace MindMapViewer with interactive markmap-view (0300dd19)
- **enrichments**: temporarily hide nlm_study_guide from UI (dfa093ad)
- **enrichments**: hide regular audio/video from UI, keep NLM variants only (c191b5d9)
- **web**: add unique placeholder images for 4 new NLM enrichment types (7f0ab042)
- **enrichments**: add 4 new NotebookLM enrichment types (6612daa0)

### Changed

- **enrichments**: extract buildStandardSources helper and add flashcards strict schema (b0e18c00)

### Fixed

- **enrichments**: use correct placeholder images for NLM enrichment types (6b1c8ce1)
- **enrichments**: remove audio/video from remaining UI components (a34adeb0)
- **enrichments**: add image_base64 to bridge media payload detection (d365ba9c)
- **logger**: enhance auto-mute to check metadata.message for tRPC errors (f513042b)
- **enrichments**: pass explicit timeout to wait_for_completion for 3 NLM artifact types (fa44afcb)
- **enrichments**: increase NLM queue wait timeout to 72h and async polling to 76h (91ca8bc4)
- **enrichments**: resolve NLM bridge failures and add enrichment types to materials switcher (0d028cac)
- **enrichments**: change NLM audio default format from deep_dive to debate (5272824f)
- **mind-map**: remove content truncation, add iterative depth-safe validation (83e59648)
- **enrichments**: address code review findings for NLM enrichment types (a56958ce)
- **infra**: share enrichments storage between Dev and Staging (0d48627f)
- **lint**: raise eslint function size and complexity limits (96003381)

## [0.31.7] - 2026-02-27

### Added

- **bridge**: allow parallel audio + video generation per course (9912059d)
- **admin**: add NotebookLM Bridge health check to admin dashboard (2c6a1cf1)

### Fixed

- **web**: stabilize media UX in course viewer (220cf7bd)
- **admin**: log fallback URL in bridge health check (I5) (0838478a)
- **admin**: address code review issues for bridge health check (0bf5a123)
- **bridge**: add SOCKS5 proxy and fix config for Stage bridge (73f07326)

## [0.31.6] - 2026-02-26

### Other

- update project files (ce0b8a2d)

## [0.31.5] - 2026-02-26

### Added

- **enrichments**: fix audio/video playback + expose NLM format options (f292a138)
- **pipeline**: add Redis read-side cache for Stage 3/4 file content (27ecea1e)
- **pipeline**: add Redis cache-aside for file and lesson content (a6c05555)

### Fixed

- **enrichments**: persist generation state across lesson navigation (f17acdfa)
- **pipeline**: address code review issues in Redis cache-aside (ce1029df)
- **nginx**: add video/mp4 and audio/mpeg MIME types for enrichment storage (b8ab32d0)

### Other

- add plan files, architecture docs, and gitignore .agent/ (53f3caae)
- update deployment guide (ae039e79)

## [0.31.4] - 2026-02-26

### Fixed

- **web**: restore enrichment generation state after page navigation (0c960ac6)

## [0.31.3] - 2026-02-26

### Changed

- migrate 48 router files to shared throwOnSupabaseError utility (2529b769)
- **db**: database health cleanup — reduce size 391→153 MB and optimize egress (2dc55a9d)

### Fixed

- **web**: dynamic import vidstack to prevent intermittent chunk loading errors (78f5bf58)
- code review follow-ups — proper backoff, PGRST116 guards, regression tests (2cd52755)
- stop misclassifying network errors as "enrichment not found" during polling (4bc6ddeb)

## [0.31.2] - 2026-02-26

### Fixed

- **nlm-bridge**: strip bloated metadata from bridge responses and harden recovery logic (34714ead)
- enrichment card transition after generation + audio single-click play + metadata perf (db2e322f)
- prevent Select dropdown from closing in enrichment card hover panel (b3f850c5)

## [0.31.1] - 2026-02-25

### Added

- redesign enrichment cards with unified grid, single-click video, and compact audio overlay (b9365d9a)

### Other

- update docker-compose and deploy scripts (573fa689)
- fix Windows NTFS compatibility and normalize line endings (070b5743)
- add cross-platform line ending rules to .gitattributes (d4bb9eac)

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
