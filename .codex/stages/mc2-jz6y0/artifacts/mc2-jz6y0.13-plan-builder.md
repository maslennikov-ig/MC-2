---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-plan-builder
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-plan-builder
base_branch: codex/self-hosted-qdrant-platform
base_commit: c1d0ca611fb5106d2a6752e3a755817948be92fd
worktree: /home/me/code/mc2/.worktrees/q12-plan-builder
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: >-
  Isolated worktree /home/me/code/mc2/.worktrees/q12-plan-builder and branch
  codex/q12-plan-builder left in place for orchestrator integration; no push.
  Disposable postgres:17.10-bookworm resources from the real-PG17 suites are
  reclaimed on each run (executor teardown + fake-drill/test cleanup); post-run
  docker filters show zero leftovers.
risk_level: medium
verification:
  - 'R2 (live-controller) baseline.json producer + fail-closed client-override seam RED->GREEN: 4dd31e5f -> a2799ec6. Adds LivePlanExecutor.produce_run_root_baseline (OQ6): reuse the held-snapshot coordinator + q12-source-manifest.ts capture (its own projection, which validateTransition diffs the backup-time cutover against; with no --baseline it sets baseline==cutover==the capture, :1449), extract .baseline -> run-root baseline.json 0400, intermediate written under the run root then removed. Must run BEFORE barrier.install, the maintenance edge (deactivates cron :1513, sets read-only :1531/:1548; captures q12_guard.baseline pre-mutation :952-969), so the capture records cron active + writable. SECURITY-SURFACE CHANGE (flagged for review): q12-source-manifest.ts hardcodes the production client /usr/lib/postgresql/17/bin/psql (a deliberate hardening of the server backup path); local real-PG17 needs a container client, so a fixture-only MC2_Q12_MANIFEST_PSQL override is added under the SAME plan-mode production-seam lockdown. LOCKDOWN PROOF (3 pure tests, no DB): (1) fixture-namespace --output (/tmp/mc2-q12-) + var -> the override binary IS invoked (sentinel wrapper touched); (2) production-shaped --output + var -> HARD FAIL with the named error "MC2_Q12_MANIFEST_PSQL is a fixture-only client override and is refused outside the /tmp/mc2-q12- output namespace", and the override is NEVER invoked (sentinel absent — fail-closed, no silent fallback); (3) production --output + no var -> the hardcoded client is used (query-failure, not the refusal). Inert in production: the var is never set there and the hardcoded path is byte-unchanged without it. Real-PG17 producer proof: baseline.json 0400, 8 active cron captured, intermediate removed. Gate bites with 3 DISTINCT named validateTransition negatives: no-q12_guard cutover -> "q12_guard schema"; 7-active-cron -> "cron cardinality"; lossy database-barrier-baseline.json digest projection -> "baseline.cron_jobs must be an array". The full baseline->real-barrier.install-cutover validateTransition POSITIVE is deferred to R4 as a NON-NEGOTIABLE pinned acceptance (validateTransition needs the complete q12_guard machinery + guarded-relations delta, which only the real barrier.install produces on a full-Supabase source — R4 builds that harness anyway). Real-PG17 q12-live-baseline-producer.test.ts: 4 passed, zero leftover containers. No-docker ops: 902 passed, 1 PRE-EXISTING failure (qdrant-observability-contract QDRANT_METRICS_GID — Q9, outside surface). tsc 0; frozen bytes aaec6fc2…/134255ce…/0b8a943f… byte-identical (q12-source-manifest.ts is NOT frozen-sha-pinned); no catalog/consumer change.'
  - 'Round-19 allowlist a migration-modified pre-existing function RED->GREEN: 7e60ae67 -> 15bae22f. Fixes rehearsal #12 (the base CLI applied end-to-end in the isolate for the first time, then the composer fail-closed at "[functions] non-additive delta: migration modified a pre-existing entry: schema=public|name=auto_answer_questions_atomic|identity_arguments=p_course_id uuid|kind=f"). Product truth: the release window 20260711120000 AND 20260711130000 both CREATE OR REPLACE public.auto_answer_questions_atomic(p_course_id uuid), which pre-exists in prod (history 20260127143610 / repo 20260127200000_auto_answer_questions_atomic_rpc.sql), and 120000 re-GRANTs EXECUTE — an INTENDED in-place modification, so strictly-additive was too strict; it is the ONLY pre-existing identity the window modifies (verified against the preserved rehearsal-12 source payload). Fix: frozen MIGRATION_MODIFIED_IDENTITY_ALLOWLIST (dict[str, frozenset[str]]) with exactly one entry (section functions, identity schema=public|name=auto_answer_questions_atomic|identity_arguments=p_course_id uuid|kind=f — the exact _compose_identity string, verified byte-exact by the RED error). For an allowlisted MODIFIED identity the composer takes ISOLATE POST content: the migration replaces it, identical SQL parsed on the pinned PG 17.6 renders pg_get_functiondef byte-identically on both sides, the ACL baseline restores from source and identical GRANTs (grantor postgres both) apply on both sides, CREATE OR REPLACE preserves owner. Non-allowlisted modification -> hard stop; REMOVED pre-existing -> always fatal (allowlist covers modification only); migration_history stays append-only. Diagnosability: all non-additive violations across every section are now collected and reported together before failing (fail-once, not fail-fast). CI PROOF (§4, real-PG17): a disposable source seeded with the OLD function from the exact prod-producing repo file BEFORE the window; the window then CREATE-OR-REPLACEs it -> composed == real post-migration SOURCE hash byte-EQUAL at both checkpoints (the RED first reproduced the exact rehearsal-12 message before the fix; §5 completeness accepts the allowlisted entry with divergent content, no missing/extra). Test-harness fidelity: the fakeDrill now creates the Supabase app roles before restoring database.dump, mirroring the real drill restoring generation/roles.sql first (the seeded function GRANTs to authenticated/service_role, and the real prod source already carries them — rehearsal #12 restore succeeded). Real-PG17 q12-migration-plan.test.ts: 70 passed, zero leftover containers. No-docker ops: 897 passed, 1 PRE-EXISTING failure (qdrant-observability-contract QDRANT_METRICS_GID placeholder in .env.production.example — Q9, outside the round-19 surface). tsc 0; frozen bytes aaec6fc2…/134255ce… AND q12-structural-catalog.sql 0b8a943f… byte-identical; catalog schema/consumers untouched; no OIDs/timestamps introduced.'
  - 'Round-18 search_path-independent catalog reg*-name checks RED->GREEN: f3bff0ca -> 14725ee2. Fixes rehearsal #11 (Required extensions.pgcrypto digest dependency does not match): assertPgcryptoDigestDependency (document-evidence-approved.ts) compared to_regprocedure(extensions.digest(bytea,text))::text against the qualified literal, but ::text DROPS the schema when extensions is on the session search_path — and the §3-allowlisted postgres role carries search_path="$user", public, extensions in BOTH cloud and the drill-replayed isolate (verified at the SQL level: with extensions on path ::text renders digest(bytea,text); without it renders extensions.digest(bytea,text)) — so the check failed against every real environment (a fourth never-executed-path defect that would kill live C5). Repair: resolve by QUALIFIED name (to_regprocedure resolution is search_path-safe) + assert explicit catalog facts (procedure present, pg_namespace(pronamespace)==extensions, proname==digest, pg_get_function_identity_arguments==\"bytea, text\", prorettype::regtype::text==bytea [pg_catalog types always unqualified], language c, secdef false, proconfig []); keep extversion/extension-schema. SWEEP both CLIs for the same class: the four to_regclass(...)::text-vs-literal helpers (requireSupabaseHistory x2, relationExists, totalsRelationExists) -> to_regclass(...) IS NOT NULL (search_path-independent); assertProcedures only null-checks (safe); ::regclass/::regprocedure in WHERE are resolution (safe). supabase_migrations is never on the postgres search_path (verified) so those were safe but latent; fixed anyway. Docker-free real-DB unit (pgcrypto in extensions schema): the check passes in BOTH search_path shapes and still fails closed on a wrong extension schema (3 passed). Integration suite: 13 failures are all the pre-existing image-pinned security-manifest apply-path failures (12 \"does not match\" + 1 \"residue\"), NONE from the IS NOT NULL / pgcrypto changes. The plan real-PG17 composed==real already runs with extensions on the postgres search_path (DRILL_SOURCE_SCHEMA seeds ALTER ROLE postgres SET search_path) and holds byte-exact (round-17 64 passed, plan path unchanged). Known benign: extension/function OWNER postgres->supabase_admin isolate divergence — content non-fatal, absent from composed entries; no action. tsc 0; frozen bytes aaec6fc2…/134255ce… AND q12-structural-catalog.sql byte-identical; catalog schema untouched; CLIs .ts not manifest-pinned.'
  - 'Round-17 lift the drill read-only override before the migration phase RED->GREEN: f78e03a8 -> cad61e06. Fixes rehearsal #10 (cannot execute CREATE TABLE in a read-only transaction): the drill leaves the restored DB with default_transaction_read_only=on (one of its three documented overrides). Before the base packet, the drill-path plan runs ALTER DATABASE <dbname> SET default_transaction_read_only TO off (with PGOPTIONS read-only off for that write, mirroring the drill actor) and verifies on a FRESH connection that the default is off, failing closed otherwise. Only the drill path. NOT restored afterward: teardown destroys the isolate, and the frozen structural settings hash EXCLUDES this GUC (q12-structural-catalog.sql:69) so checkpoint captures are unaffected — the composed==real-source proof holds byte-exact WITH the flip, validating the exclusion end-to-end. Sweep: the drill's only other post-restore overrides are ALTER SYSTEM cron.database_name/cron.launch_active_jobs (inert for our migrations) + the source-replayed DB/role GUCs (what the migrations already run under in prod); nothing else blocks the apply. RED: the fake drill now leaves restore_test read-only -> the migrate test failed with "cannot execute CREATE ROLE in a read-only transaction". GREEN: real-PG17 q12-migration-plan.test.ts 64 passed (migrate + composed==real with the flip). tsc 0; frozen bytes aaec6fc2…/134255ce… AND q12-structural-catalog.sql byte-identical; catalog schema/consumers untouched.'
  - 'Round-16 repair frontier assertion for MCP-generated history RED->GREEN: 37368792 -> 4a3c99d3. Fixes rehearsal #9 (the real base CLI fail-closed with "Supabase repository migration frontier contains unknown history"): assertRepositoryMigrationFrontier (document-evidence-approved.ts) required every history version to be a 14-digit repo FILENAME version, but this projects prod migrations are applied via the Supabase MCP with apply-time version timestamps that have no same-named repo file (300+ of 317 rows) — the premise "history subset of repo filenames" is false and can NEVER pass against the real DB (a never-executed-path defect that would kill the live C-window identically). Repair: pin APPROVED_HISTORY_FRONTIER=20260704150249; replace the per-row filename + earlier-pending + ambiguous-count checks with "no non-chain history version above the frontier" (also forbids any version strictly between the frontier and the first chain version) + no duplicates; keep the chain-prefix logic and loadRepositoryMigrations + REPOSITORY_MIGRATION_MANIFEST_SHA256 (repo-tree pin) EXACTLY. Swept the observability CLI (no history-subset-repo premise; per-version readHistory only). The CLIs .ts bytes are NOT security-manifest-pinned (the manifest hashes SQL/function bodies), so this is safe. Docker-free unit (mock client): MCP-style history tolerated (prefix 0); NEWER-than-frontier/between-frontier/gapped-prefix/duplicate fail (5 passed). Integration negatives throw at the frontier before the pinned-image apply (the full apply is image-gated, cannot run on vanilla PG17 — pre-existing). Plan real-PG17 composed==real-source now runs with MCP-shaped source history and holds byte-exact (64 passed). Document-evidence unit suites 19 passed. tsc 0; frozen bytes aaec6fc2…/134255ce… AND q12-structural-catalog.sql byte-identical; REPOSITORY_MIGRATION_MANIFEST_SHA256 unchanged.'
  - 'Round-15 delta-neutral extras in the completeness gate RED->GREEN: 163c7364 -> fbabbab9. Fixes rehearsal #8 ([default_acls] extra 2 — the Supabase image manufactures default ACLs on restore-created schemas tests/test_overrides that were dropped in the cloud source). Completeness gate now: MISSING (source object absent from isolate) -> absolutely fatal (unchanged); EXTRA (isolate identity absent from source) -> tolerated iff DELTA-NEUTRAL. The additive-delta check in _compose_predicted_payload already hard-stops any extra that changes/disappears across the pre/base/observability checkpoints, and composition now EXCLUDES tolerated extras from the composed payload (they are not in the live source) so composed still == real. Tolerated extras reported: plan result JSON gets observed_extra_identities [{section,identity}] + each named on stderr (assemble ignores the evidence key -> catalog bytes unchanged; no result consumer validates keys). Real-PG17 q12-migration-plan.test.ts: 64 passed — incl. an isolate-only extra tolerated+reported with the composed catalog still byte-matching the real post-migration source; a MISSING object still fatal (+ diagnostics preserved under --keep-equality-diagnostics); repurposed injectDrift->tolerated, injectMissing->fatal. No-docker adds 3 engine cases (extra collection, composition exclusion, mutating-extra fatal). tsc 0; frozen bytes aaec6fc2…/134255ce… AND q12-structural-catalog.sql byte-identical; validate_expected_catalog/catalog schema untouched.'
  - 'Round-14 dump-stable completeness identities RED->GREEN: 07d158ba -> e95237dc. Fixes rehearsal #7 false positive ([columns] missing 92 extra 92 — SAME columns, different attnum). Production tables carry dropped-column gaps: the source keeps attnums as holes, pg_restore compacts them, so a pre-existing column has a different `position` and a column comment a different `subobject_id` in the isolate. _COMPOSE_IDENTITY_KEYS now EXCLUDES those dump-unstable attnum fields (they stay in entry CONTENT, so composition still takes SOURCE content for pre-existing entries); a column comment is matched by its `identity` (pg_identify_object schema.table.column, carrying the column NAME). Invariants re-verified: within-section order still byte-matches live (dropping a column preserves the relative order of survivors -> isolate order == live order), additive-delta check internally consistent (isolate pre/post share compacted attnums). CI PROOF: the composed==real-source proof holds byte-EQUAL WITH a dropped-column gap + a post-gap column comment on a pre-existing table the migrations never touch (public.organizations). Real-PG17 q12-migration-plan.test.ts: 61 passed. No-docker adds 3 engine cases (position/subobject_id tolerance + name-match composition). tsc 0; frozen bytes aaec6fc2…/134255ce… AND q12-structural-catalog.sql all byte-identical.'
  - 'Round-13 delta-composed live-hash prediction (§2 method correction) RED->GREEN: 461409a7 -> ee70f8ac. Ruling (rehearsal #6 full payloads): the divergence is dump-round-trip EXPRESSION RENORMALIZATION, not arch/version drift — e.g. public.check_processing_method source `= ANY (ARRAY[..::character varying]::text[])` vs restored `= ANY (ARRAY[..::character varying::text])`; also [columns] ~117 (defaults) + db comment. So the raw-isolate-hash equality of design §2 is empirically unsound (an isolate can never byte-predict live hashes for pre-existing objects). Replaced with the sound construction. Gating verified against the FROZEN q12-structural-catalog.sql: NO OIDs in payload entries, NO timestamps in migration_history (version/name/statements only, :1190-1196), every section ORDER BY is identity-determined (a renormalizable expression never reorders a section) -> composition is byte-exact; no stop-and-report needed. (1) Equality proof -> object-completeness: _assert_restore_object_complete requires the isolate pre-migration identity-set == source per section (missing/extra -> hard stop); content divergence is expected + non-fatal (drill compare guards fidelity). (2) Checkpoint hashes -> delta-composed: each in-isolate delta must be strictly ADDITIVE (no removed/modified pre-existing, migration_history append-only) -> hard stop; predicted = SOURCE pre-existing content + isolate FRESH content in isolate SQL order, hashed THROUGH postgres (capture.py --render-hash, jsonb::text canonicalization byte-identical to live); baseline_structural_sha256 stays raw SOURCE. barrier/manifest/structural SQL + validate_expected_catalog untouched, hashes stay 64-hex. CI PROOF (strong): applying the same five migration files to the SOURCE container yields a hash byte-EQUAL to the composed prediction even with a seeded renormalizing check constraint (the old raw-isolate method would have differed); negative: an in-isolate ALTER of a pre-existing column default hard-stops naming [columns]. Real-PG17 q12-migration-plan.test.ts: 58 passed. No-docker adds 4 engine cases (compose/object-complete/non-additive). tsc 0; frozen bytes aaec6fc2…/134255ce… AND q12-structural-catalog.sql all byte-identical.'
  - 'Round-12 preserve equality-diff payloads RED->GREEN: 33e27794 -> c06f3a54. Surgical argv-gated seam so the full cloud-source-vs-pinned-image divergence survives for a product-truth ruling (the first-10 summary died with the workdir). New plan flag --keep-equality-diagnostics (argv, NOT env — production seam lockdown still rejects env seams): on equality failure the plan writes 3 owner-only files into <run_root>/equality-diagnostics/ (0700 dir, 0600 files) — source + isolate canonical payloads + the FULL unbounded diff (_structural_catalog_diff gained max_ids/max_lines=None); run_plan preserves the created run dir when diagnostics were written (else removed as before). No scrub needed: the frozen SQL stores subscription conninfo as connection_sha256 and carries no cron/row data, so the payload is secret-free by construction. Real-PG17 q12-migration-plan.test.ts: 52 passed — incl. flag-on preserves the 3 files with q12_drift_probe in the isolate payload + full diff; flag-off writes no diag dir. No-docker adds 2 cases (unbounded diff = 50 identifiers; run-dir preservation exception). tsc 0; frozen bytes aaec6fc2…/134255ce… AND q12-structural-catalog.sql all byte-identical.'
  - 'Round-11 structural equality-proof diff diagnostics RED->GREEN: d28bdae1 -> 5ebeeaca. Makes the opaque structural-sha mismatch (rehearsal #4) self-diagnosing WITHOUT touching the frozen q12-structural-catalog.sql (verified byte-identical). capture.py --structural-payload selects the query's `payload` column (the exact pre-hash jsonb); the plan eagerly captures the source payload in the snapshot window and, on equality failure, captures the isolate payload and raises a bounded per-section diff (identifiers + sha digests only; statements/values never shown). Real-PG17 q12-migration-plan.test.ts: 49 passed — incl. the round-11 negative where a fake-drill injectDrift creates a function ONLY in the isolate and the error names [functions] + q12_drift_probe; the happy path survives the eager source-payload capture. No-docker adds 2 diff-engine cases (per-section add/remove/change identifiers + digests, 64-hex scrub, bounded output). tsc 0; frozen bytes aaec6fc2…/134255ce… AND q12-structural-catalog.sql all byte-identical.'
  - 'Round-10 drill/backup tsx runner RED->GREEN: 268677a1 -> a1b24302. Fixes the rehearsal #3 killer: tsx is a devDependency of packages/course-gen-platform only and is NOT hoisted to the workspace root, so `pnpm exec tsx` from the repo root is unresolvable (ERR_PNPM). run_ts now invokes the package pnpm shim ($PROJECT_ROOT/packages/course-gen-platform/node_modules/.bin/tsx) with cwd=$PROJECT_ROOT + a fail-closed preflight naming the missing shim; backup-supabase.sh gets the same fix (bytes not sha-pinned). Drill suite supabase-restore-drill.test.ts: 47 passed (46 UNMODIFIED + 1 new RED-through-real-bytes runner test that extracts run_ts and proves it resolves via the package shim, not pnpm). Backup suites (operator+schedule): 65 passed (test-mode injection untouched). Plan suite: no-docker 39, real-PG17 46 passed (fake-drill path unaffected). tsc 0; drill+backup bash -n OK; frozen bytes aaec6fc2…/134255ce… intact (backup path in q12-command-manifest.json unchanged).'
  - 'Round-9 drill diagnostics + scheduled-mode RED->GREEN: 4e3fc6fb -> 87d2601c. Real-PG17 q12-migration-plan.test.ts: 46 passed — the end-to-end drill-seam test now proves the plan restores via the drill SCHEDULED mode; the fake drill mirrors the real drill Q12 activation cleanup (runs the real q12_guard.verify_capability() extracted from run-restore-cleanup.ts) in q12 mode and skips it in scheduled mode, reproducing the pre-C1 rehearsal failure (q12) and proving the fix (scheduled). No-docker adds a diagnostics case (_drill_failure_detail labeled stdout+stderr tails, secrets scrubbed, empty-stderr symptom). Drill suite supabase-restore-drill.test.ts: 46 passed UNMODIFIED (persist-seam extension to scheduled mode is env-gated + default byte-identical). tsc exit 0. Frozen bytes aaec6fc2… / 134255ce… intact.'
  - 'Round-8 drill-generation preflight RED->GREEN: 0791805e -> 53b6fcce. Closes the whole generation preflight the server pre-C1 rehearsal fail-closed on (generation basename is invalid). Real-PG17 q12-migration-plan.test.ts: 45 passed — the end-to-end drill-seam test now drives production _produce_generation output through a fake drill that MIRRORS the real drill preflight (basename ERE + validate_generation Python block, both extracted verbatim from the drill bytes), sweeping the full set: generation-<UTCstamp>Z-<uuid> basename, 4-file layout, 0600 modes, checksums schema/generation/files/sha256/size, source-manifest schema. No-docker adds 5 round-8 cases (contract + item-4 run-dir cleanup). Drill suite supabase-restore-drill.test.ts: 46 passed UNMODIFIED. tsc exit 0. Frozen bytes aaec6fc2… / 134255ce… intact.'
  - 'Round-8 broad no-docker ops set (tests/unit/ops/): 876 passed | 59 skipped, 1 pre-existing failure in qdrant-observability-contract.test.ts (Q9 observability: .env.production.example lacks QDRANT_METRICS_GID) — outside the round-8 change surface (round-8 touched only q12-lifecycle-core.py + q12-migration-plan.test.ts + the plan runner fixture; the observability test and its ops/qdrant inputs are untouched).'
  - 'Round-7 hardening RED->GREEN: 4e752470 -> c6ac3a8d (P2-1 seam lockdown, P2-2 handle write/read binding, P3 a-d). Snapshot coordinator: b32ce5ed -> e92ec529. Drill-seam consumption: 0e2cae74 -> a8f355f2. §3 role bootstrap: dc0d9cc6 -> 6a0825fa. Persist seam: 28e75d8c -> 93f01595. Live orchestration: ee04d555 -> 2b6b16ad. Builder: a46c6173 -> 28ec3448.'
  - 'Round-7 real-PG17: 40 passed (all gated tests, drill positive still ends clean through the enhanced teardown + label sweep). No-docker suites: 79 passed | 7 skipped (adds 12 P2-1 seam-lockdown cases + 2 P2-2 handle-binding cases). tsc exit 0.'
  - 'Real-PG17 (MC2_Q12_REAL_PG17=1): 26 passed clean (first try) — incl. the drill-consumption positive that binds source capture + pg_dump to one exported snapshot via the coordinator, and the malformed-snapshot negative that hard-stops before the drill is invoked.'
  - 'Unit + drill (no docker): q12-migration-plan.test.ts + supabase-restore-drill.test.ts = 65 passed | 7 skipped.'
  - 'Real-PG17 (MC2_Q12_REAL_PG17=1): 25 passed — capture, direct-mode end-to-end, drill-seam consumption (fake drill: correct drill argv + persist-handle env, restore_test dbname routing, migrate/capture through the handle, teardown of container/network/volume + handle + generation), malformed-handle fail-closed with zero leaked resource, plus equality-mismatch and teardown-override negatives.'
  - '44 existing drill tests pass UNMODIFIED (default byte-identical); pnpm type-check / tsc --noEmit exit 0; python3 compile OK; drill bash -n OK.'
  - 'Frozen bytes unchanged: q12-command-manifest.json aaec6fc2…, q12-database-barrier.sh 134255ce…; q12-live-cutover.test.ts and all existing tests untouched; frozen pg.restore argv untouched.'
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - deploy/qdrant/q12-live-cutover.sh
  - deploy/qdrant/q12-migration-plan-capture.py
  - deploy/qdrant/q12-migration-plan-roles.py
  - deploy/postgres/restore-supabase-drill.sh
  - deploy/postgres/backup-supabase.sh
  - packages/course-gen-platform/tests/unit/ops/q12-migration-plan.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-migration-plan-runner.py
  - packages/course-gen-platform/tests/unit/ops/supabase-restore-drill.test.ts
  - packages/course-gen-platform/scripts/migrations/document-evidence-approved.ts
  - packages/course-gen-platform/scripts/migrations/document-evidence-observability-index.ts
  - packages/course-gen-platform/tests/unit/scripts/document-evidence-frontier.test.ts
  - packages/course-gen-platform/tests/unit/scripts/document-evidence-pgcrypto.test.ts
  - packages/course-gen-platform/tests/integration/document-evidence-approved-migrations.test.ts
  - deploy/postgres/q12-source-manifest.ts
  - packages/course-gen-platform/tests/unit/ops/q12-live-controller.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-live-baseline-producer.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-baseline-producer-runner.py
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts
explicit_defers:
  - "Supabase-image-only leg (real drill restore of the real source on the pinned image + real migration CLIs) is CI-unreproducible: the drill checks the pinned image digest / Supabase role bootstrap / extension versions, and the CLIs' security manifests are pinned to the isolated restore of generation-20260716T105950Z (document-evidence-approved.ts:1250-1356). Validated by the owner's server-side pre-C1 `q12-live-cutover.sh plan` run (read-only on the source, fail-closed everywhere, so a defect blocks the window rather than corrupting anything). Loopback needs no --confirm/--allow-remote (document-evidence-approved.ts:648 returns early for 127.0.0.1/localhost/::1 before the remote gate). If prod schema drifted since that generation the manifests fail closed — a correct product-truth outcome, not to be relaxed."
---

# Summary

Round-19 allowlists exactly one migration-modified pre-existing function
(`7e60ae67` -> `15bae22f`). Rehearsal #12 confirmed round-18 worked — the base CLI applied its
migrations end-to-end in the isolate for the first time — and then the composer fail-closed at
`[functions] non-additive delta: migration modified a pre-existing entry:
schema=public|name=auto_answer_questions_atomic|identity_arguments=p_course_id uuid|kind=f`.
This is a genuine composition gap, not a defect: the release window's `20260711120000` and
`20260711130000` both `CREATE OR REPLACE public.auto_answer_questions_atomic(p_course_id uuid)`,
which pre-exists in prod (history `20260127143610` / repo
`20260127200000_auto_answer_questions_atomic_rpc.sql`), and `120000` re-GRANTs EXECUTE — an
intended in-place modification. It is the only pre-existing identity the window modifies, so the
round-13 "strictly additive" rule was too strong.

Fix: a frozen `MIGRATION_MODIFIED_IDENTITY_ALLOWLIST` (section -> frozenset of the composer's
exact `_compose_identity` strings) with the single entry above. For an allowlisted MODIFIED
identity the composer now takes the ISOLATE POST-migration content instead of the live SOURCE
content: the migration replaces the object, both sides parse the identical migration SQL on the
pinned PostgreSQL 17.6 so `pg_get_functiondef` renders byte-identically, the ACL baseline
restores from the source and the identical GRANTs (grantor `postgres` on both) apply on both
sides, and `CREATE OR REPLACE` preserves the owner — so the isolate render equals the live
render. Everything else stays fail-closed: any non-allowlisted modification is a hard stop, a
REMOVED pre-existing entry is always fatal (the allowlist covers modification only), and
`migration_history` stays append-only. Diagnosability now collects all non-additive violations
across every section and reports them together before failing (fail-once, not fail-fast), so a
future window that trips several sections surfaces them in one rehearsal instead of one per
~20-minute cycle.

CI proof (§4) seeds a disposable source with the OLD function from the exact prod-producing repo
file BEFORE applying the window, then asserts the composed prediction stays byte-EQUAL to the
real post-migration source hash at both checkpoints — the RED first reproduced the exact
rehearsal-12 message, empirically pinning both the allowlist identity string and the
replace-rendering identity. The fakeDrill gained one fidelity fix (create the Supabase app roles
before restoring `database.dump`, mirroring the real drill restoring `generation/roles.sql`
first) so the seeded function's GRANTs resolve, exactly as the real prod restore already does.
The composer touches no catalog schema or consumer, introduces no OIDs or timestamps, and the
frozen bytes (`aaec6fc2…`, `134255ce…`, `q12-structural-catalog.sql` `0b8a943f…`) are unchanged.

Round-18 makes the migration CLIs' catalog reg\*-name checks search_path-independent
(`f3bff0ca` -> `14725ee2`). Rehearsal #11 confirmed the read-only lift works — the base CLI
applied further and fail-closed at `assertPgcryptoDigestDependency`
(`Required extensions.pgcrypto digest dependency does not match`). Everything the check
queries is actually correct in both cloud and isolate (pgcrypto 1.3, schema extensions,
language c, secdef false, proconfig null); the only real source-vs-isolate delta is the
extension/function OWNER `postgres`->`supabase_admin`, which the check does not examine
(a KNOWN benign isolate divergence — content non-fatal under the completeness gate, absent
from composed entries; no action). The failing clause was
`to_regprocedure('extensions.digest(bytea,text)')::text !== 'extensions.digest(bytea,text)'`:
`::text` renders the name WITHOUT its schema when `extensions` is on the session
search_path, and the §3-allowlisted `postgres` role carries
`search_path="$user", public, extensions` in both the real cloud and the drill-replayed
isolate. Verified at the SQL level: with `extensions` on the path,
`to_regprocedure('extensions.digest(bytea,text)')::text` = `digest(bytea,text)`; without it,
`extensions.digest(bytea,text)`. So the check failed against every real environment — a
fourth never-executed-path defect that would also kill live C5. Resolution by qualified name
is search_path-safe; only the TEXT RENDERING isn't.

Fix: `assertPgcryptoDigestDependency` now resolves `extensions.digest(bytea,text)` by its
qualified name (kept in the `to_regprocedure(...)` JOIN) and asserts explicit catalog facts —
procedure present, `pg_namespace(pronamespace).nspname == 'extensions'`, `proname ==
'digest'`, `pg_get_function_identity_arguments(oid) == 'bytea, text'`,
`prorettype::regtype::text == 'bytea'` (pg_catalog types always render unqualified), language
`c`, `prosecdef == false`, `proconfig == []` — keeping the `extversion == '1.3'` and
extension-schema clauses.

Sweep of both CLIs for the same class (every `reg*::text` rendering compared against a
literal):

| site                                               | before                                                                                 | after                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------- | -------------------------------- |
| approved assertPgcryptoDigestDependency            | `to_regprocedure('extensions.digest(bytea,text)')::text` vs `'extensions.digest(...)'` | explicit catalog facts (namespace/name/args/rettype/…) |
| approved requireSupabaseHistory                    | `to_regclass('supabase_migrations.schema_migrations')::text` vs qualified literal      | `to_regclass(...) IS NOT NULL` (existence)             |
| observability requireSupabaseHistory               | same                                                                                   | `to_regclass(...) IS NOT NULL`                         |
| approved relationExists                            | `to_regclass($1)::text` vs `public.`-stripped name                                     | `to_regclass($1) IS NOT NULL`                          |
| observability totalsRelationExists                 | `to_regclass('public...')::text` vs unqualified name                                   | `to_regclass(...) IS NOT NULL`                         |
| approved assertProcedures                          | `to_regprocedure('public.'                                                             |                                                        | sig)::text`— only`=== null` checked | unchanged (existence-only, safe) |
| both CLIs `::regclass` / `::regprocedure` in WHERE | resolution by qualified name                                                           | unchanged (resolution is search_path-safe)             |
| `prorettype::regtype::text`                        | pg_catalog type — always unqualified                                                   | unchanged (safe)                                       |

The `supabase_migrations`-qualified comparisons were safe today (that schema is never on the
`postgres` role's search_path — verified) but latent; the `public`-relative ones relied on
`public` being on the path (true, but latent); both are now search_path-independent.

Proven: a docker-free real-DB unit suite (pgcrypto created in an `extensions` schema) runs
the real `assertPgcryptoDigestDependency` in BOTH search_path shapes (with and without
`extensions` on the path) and still fails closed on a wrong extension schema. The integration
suite's 13 failures on a vanilla PG17 are all the pre-existing image-pinned security-manifest
apply-path failures — none from these changes. The plan's real-PG17 composed==real-source
proof already runs with `extensions` on the `postgres` search_path (`DRILL_SOURCE_SCHEMA`
seeds `ALTER ROLE postgres SET search_path`) and holds byte-exact; the plan path is unchanged
this round (the fake apply seam does not run the CLIs). The CLIs' `.ts` bytes are not
security-manifest-pinned.

Round-17 lifts the drill's read-only override before the migration phase (`f78e03a8` ->
`cad61e06`). Rehearsal #10 confirmed the frontier repair works — the base CLI passed the
frontier and reached apply, then fail-closed with `cannot execute CREATE TABLE in a
read-only transaction`. Per the drill contract, the drill deliberately sets the restored
database's `default_transaction_read_only=on` (one of its three documented overrides —
exactly the ones the frozen structural SQL excludes from the settings hash at
`q12-structural-catalog.sql:69`). The plan must lift it for its own migration phase.

- Before the base packet, the drill-path plan runs `ALTER DATABASE "<dbname>" SET
default_transaction_read_only TO off` in the isolate. That ALTER is itself a write, so the
  connection issuing it uses `PGOPTIONS=-c default_transaction_read_only=off` (mirroring the
  drill's own restore actor), then a FRESH connection verifies `SHOW
default_transaction_read_only` is `off`, failing closed otherwise. Only the drill path does
  this; the direct/test path never sets the override.
- It is NOT restored afterward, and that is safe on two independent grounds (both stated):
  teardown destroys the disposable, loopback-only isolate immediately after the catalog is
  bound; and the frozen structural settings hash EXCLUDES `default_transaction_read_only`
  (line 69), so lifting it changes no checkpoint capture. This round validates that
  exclusion end-to-end: the composed==real-source proof holds byte-exact WITH the flip.
- Sweep (item 3): the drill's only other post-restore overrides are the two `ALTER SYSTEM`
  cron GUCs (`cron.database_name`, `cron.launch_active_jobs`) — inert for our migrations —
  and the source-replayed database/role GUCs (the settings the migrations already run under
  in production). Nothing else blocks the apply, so nothing else is pre-empted.

RED reproduced the exact rehearsal failure: the fake drill now leaves `restore_test`
read-only after restore, and the migrate test failed with `cannot execute CREATE ROLE in a
read-only transaction`. GREEN: real-PG17 64 passed (the scheduled-mode migrate path and the
composed==real proof both run through the flip).

Round-16 repairs the real migration CLI's frontier assertion (`37368792` -> `4a3c99d3`).
Rehearsal #9 got past completeness and the real base migration CLI fail-closed with
`Supabase repository migration frontier contains unknown history`. The owner's read-only
probes showed prod history is 317 rows with max == the pinned frontier `20260704150249`
(no newer history), but `assertRepositoryMigrationFrontier` required every history version
to be a 14-digit repository FILENAME version. In this project production migrations are
applied via the Supabase MCP, which stamps history rows with its OWN apply-time version
timestamps that have no same-named repo file (300+ of the 317 rows), so the premise
"history ⊆ repo filenames" is false and can NEVER pass against the real database — another
never-executed-path defect that would kill the live C-window identically. This repairs the
live window, not just plan mode.

The repair gives equivalent anti-drift protection without the false premise:

- Pin `APPROVED_HISTORY_FRONTIER = '20260704150249'` (the reviewed max pre-chain history
  version — note it is NOT a repo file; the last pre-chain repo file is `20260704150000`).
- Replace the three false-premise checks — per-row "history version is a repo filename",
  the `expectedPrevious` "earlier pending repo migration must match by name", and the
  "history count == expectedPrevious + prefix" ambiguity check — with: no non-chain history
  version may be strictly ABOVE the frontier (which also forbids any version strictly
  between the frontier and the first chain version), plus the existing no-duplicate check.
- Keep the chain-prefix logic EXACTLY (our five versions must form a supported prefix of
  history: none → apply all; partial → continue; gap → fail, with `assertExactHistory`),
  and keep `loadRepositoryMigrations` + `REPOSITORY_MIGRATION_MANIFEST_SHA256` EXACTLY (the
  repo-tree pin stays; it just no longer cross-references DB history rows it cannot know).
  Rationale: the pinned frontier gives the same protection the filename cross-check
  intended (no unknown NEWER history can precede the chain; the reviewed frontier is the
  anchor), while the old check mismodeled how this project's history versions are generated.
- Swept `document-evidence-observability-index.ts`: it has no history⊆repo premise (it uses
  per-version `readHistory` for its own migration versions only). The CLIs' `.ts` bytes are
  NOT security-manifest-pinned — the manifest hashes SQL file contents / function bodies
  (not the runner source) — so editing the frontier function is safe. Frozen
  barrier/manifest/structural SQL untouched.

Proven: a docker-free unit suite drives `assertRepositoryMigrationFrontier` with a mock
client — MCP-style history (versions absent from repo files, max == frontier) is tolerated
(returns prefix 0), while NEWER-than-frontier, between-frontier, gapped-prefix, and
duplicate history each fail. The integration negatives throw at the frontier before the
pinned-image apply (the full apply is gated on the image's security manifest and cannot run
on a vanilla PG17 — pre-existing). The plan's real-PG17 composed==real-source proof now runs
with MCP-shaped source history and still holds byte-exact, proving the whole flow against
the real history shape.

Round-15 makes the completeness gate tolerate DELTA-NEUTRAL EXTRAS (`163c7364` ->
`fbabbab9`). Rehearsal #8 passed columns completeness but failed `[default_acls] missing 0
extra 2`: the isolate had two extra default-ACL entries (object_type=f schema=tests and
schema=test_overrides, role=supabase_admin) absent from the source. Cause: the Supabase
image's schema-creation machinery (a supautils-style event trigger) manufactures default
ACLs when the restore CREATES those schemas; in the cloud source they had been dropped.
This is a benign artifact of the restore, not a lost object.

Ruling implemented for the completeness gate (our construction, not the frozen proof):

- (a) MISSING is absolutely fatal — the restore must reproduce every source object.
- (b) EXTRA identities (isolate has, source lacks) are tolerated ONLY if delta-neutral: the
  extra must be present and byte-identical in the isolate pre-migration AND every post-
  checkpoint capture, so it cancels out of every delta and never enters the composed
  payload. Any extra that appears/changes/disappears across checkpoints is fatal.

Implementation:

- `_check_restore_completeness` (renamed from the assert) raises ONLY on missing and RETURNS
  the extras as [{section, identity}].
- The additive-delta check in `_compose_predicted_payload` already enforces delta-neutrality
  for extras: an extra is `in isolate_pre`, so if it disappears in a checkpoint it is a
  `removed` hard-stop, and if it changes it is a `modified` hard-stop.
- Composition now classifies each isolate-checkpoint entry three ways: in source ->
  pre-existing (SOURCE content); not source but in isolate_pre -> tolerated EXTRA
  (EXCLUDED, since it is not in the live source); not source and not in isolate_pre ->
  FRESH (isolate content). Excluding extras keeps composed == live (the live source has no
  restore artifacts), and removing them from the isolate order preserves the live order of
  the remaining entries.
- Behavioral risk is already covered fail-closed: if an extra changed what a migration
  produced, the isolate delta would diverge from live and the composed hash would not match
  at cutover — the barrier blocks, never corrupts.
- Reporting: the plan RESULT JSON gains `observed_extra_identities` (array of
  {section, identity}) and each tolerated extra is named on stderr for the rehearsal log.
  This is a result field only — `assemble_expected_catalog` reads a fixed key set and
  ignores it, so the frozen CATALOG file bytes are unchanged, and no consumer validates the
  plan-result key set. `validate_expected_catalog` and the catalog schema are untouched.

Proven end-to-end: an isolate-only extra (a function the source lacks) is tolerated +
reported, and the composed catalog still byte-matches the real post-migration source (the
extra cancels); a missing source object stays fatal (and preserves diagnostics under
--keep-equality-diagnostics); a mutating extra hard-stops.

Round-14 makes the object-completeness identity DUMP-STABLE (`07d158ba` -> `e95237dc`).
Rehearsal #7 engaged the composed-prediction machinery correctly but object-completeness
false-positived: `[columns] missing 92 extra 92` — the SAME columns with different
`position` (attnum). Root cause: production tables carry DROPPED columns; the source keeps
their attnum slots as holes, but pg_restore recreates the tables without them and attnums
compact. So a pre-existing column has a source attnum ≠ isolate attnum, and my completeness
identity keyed on `position` (attnum) read the same column as one missing + one extra.

Fix: the composition identity now EXCLUDES the dump-unstable attnum fields (they remain in
entry CONTENT so composition still takes SOURCE content for pre-existing entries and renders
the correct live hash). Per-section identity after the sweep (identity fields only; all
other fields are content):

| section                                                                  | identity keys (dump-stable)                                    |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| columns                                                                  | schema, relation, name (was ...+position=attnum)               |
| comments (incl. on columns)                                              | object_type, schema, name, identity (was ...+subobject_id)     |
| security_labels                                                          | object_type, schema, name, identity, provider (was ...+subobj) |
| relations / sequences / indexes / extended*statistics / text_search*\*   | schema, name                                                   |
| constraints                                                              | schema, name, relation_schema, relation_name                   |
| functions / aggregates                                                   | schema, name, identity_arguments                               |
| triggers / rules / policies                                              | schema, relation, name (name-keyed, no ordinal)                |
| extensions / access_methods / languages / fdw / servers / event_triggers | name                                                           |
| types / collations / conversions / operators(+family/class)              | schema, name (+encoding/access_method)                         |
| casts / transforms                                                       | source_type, target_type / language                            |
| publications / subscriptions                                             | name                                                           |
| default_acls                                                             | role, schema, object_type                                      |
| parameter_acls                                                           | parameter, role                                                |
| migration_history                                                        | version                                                        |
| database                                                                 | singleton (field-wise)                                         |

The dump-unstable components removed are exactly `position` (column attnum) and
`subobject_id` (a column comment/label attnum); no other section keys on an attnum,
subobject, ordinal, or oid. A column comment stays uniquely identified by its `identity`
(pg_identify_object `schema.table.column`, which carries the column NAME, not the attnum).

Invariants re-verified (item 2): (a) within-section ORDER still byte-matches live — dropping
a column preserves the relative order of the surviving columns, so the isolate's SQL order
(by compacted attnum) equals the live order (by gapped attnum) for the survivors, and the
composed content carries the SOURCE attnums; (b) the additive-delta check compares isolate
pre vs post, which share the same compacted attnums, so it is internally consistent and
unaffected. Both are proven end-to-end by the composed==real-source CI proof running WITH a
dropped-column gap + a post-gap column comment on public.organizations (a pre-existing table
the migrations never touch): the composed hash is byte-EQUAL to the real post-migration
source hash, which proves attnum gaps do not break the composed live-hash prediction.

Round-13 is the orchestrator's design-§2 METHOD CORRECTION (`461409a7` -> `ee70f8ac`),
issued as a product-truth ruling after rehearsal #6 preserved the full payloads. This is
the decisive round.

Ruling + evidence (value-level): the structural divergence is dump-round-trip EXPRESSION
RENORMALIZATION, not architecture/version drift (source is PG 17.6 aarch64, image 17.6
x86_64 — same PG). The stored parse trees of pre-existing objects (created under older PG
parsers) deparse one way on the live source, but `pg_restore` re-parses the SQL text under
17.6 into equivalent-but-differently-spelled trees. Verbatim example —
`public.check_processing_method`:
source `= ANY (ARRAY['full_text'::character varying, 'hierarchical'::character varying]::text[])`
isolate `= ANY (ARRAY['full_text'::character varying::text, 'hierarchical'::character varying::text])`
Also `[columns] ~117` (the same class via column defaults) and the database comment. So an
isolate can NEVER byte-predict the live hash of a pre-existing object, and design §2's
raw-isolate-hash equality method is empirically unsound. The purpose of §2 is preserved;
the frozen barrier/manifest/structural-SQL bytes are untouched.

The sound construction — delta-composed prediction:

1. The equality proof is replaced by two fail-closed checks. (a) OBJECT-COMPLETENESS: the
   isolate's per-section identity-set (structural key fields — a superset of every
   section's ORDER BY key) must exactly equal the source's; a missing or extra identity is
   a hard stop (it proves the restore is object-complete). (b) Content-hash divergence on
   pre-existing entries is expected (renormalization) and no longer fatal — pre-existing
   content is taken from the SOURCE, and the drill's own catalog compare (which passed)
   remains the content-fidelity guard for the restore.
2. Checkpoint hash prediction. For each checkpoint the in-isolate delta (I_checkpoint −
   I_pre by identity) must be strictly ADDITIVE: no removed and no modified pre-existing
   entry in any section, migration_history append-only — any modification of a pre-existing
   entry is a hard stop (its live form is unpredictable). The predicted live payload is
   composed as SOURCE pre-existing content + isolate FRESH content, placed in the isolate
   checkpoint's SQL order (identity-determined = live order), then hashed THROUGH postgres
   (`capture.py --render-hash` evaluates `encode(digest($composed::jsonb::text,'sha256'))`
   so the jsonb::text canonicalization is byte-identical to the live side). These become
   `migrations[].catalog_sha256` and `expected_post_migration_catalog_sha256`;
   `baseline_structural_sha256` stays the raw SOURCE hash (install-time compare is
   source-vs-source). `validate_expected_catalog` and the catalog schema/consumers are
   untouched; all hashes stay 64-hex.
3. Gating analysis (item 3), verified against the frozen SQL before proceeding — all three
   conditions for byte-exactness hold, so NO stop-and-report was needed:
   - migration_history rows are `{version, name, statements}` ordered by version — NO
     timestamps (:1190-1196).
   - NO payload entry embeds an OID (only CTE join/order helpers reference oids; guarded\_
     relations, which does carry oids, is a SEPARATE source-only projection, not the
     structural payload). Fresh objects therefore have identical content live vs isolate.
   - Every top-level section's ORDER BY is by identity fields (schema/name/identity-args/
     attnum/version), never a renormalizable expression — so the check_processing_method
     deparse difference cannot reorder a section, and the composed order equals the live
     order.
4. CI proof (fully reproducible, the strong part): after the plan composes its prediction
   against a seeded source, the test applies the SAME five migration files to the SOURCE
   container itself (the live window) and asserts its real post-migration structural hash
   is byte-EQUAL to the composed prediction. The source is seeded with a check constraint
   written so PG 17.6 renormalizes it on restore (the check_processing_method class), so
   the old raw-isolate method would have FAILED while the composed method passes. Negative:
   an in-isolate migration that ALTERs a pre-existing column default hard-stops naming
   `[columns]`.

Fail-closed properties: object-incompleteness (missing/extra), a non-additive delta
(removed/modified pre-existing), an identity collision, a malformed rendered hash, and a
failed render all hard-stop with a bounded, scrubbed, named diagnostic; on
`--keep-equality-diagnostics` the full payloads + diff are preserved.

Round-12 preserves the FULL equality-diff evidence for a product-truth ruling
(`33e27794` -> `c06f3a54`). Rehearsal #5 emitted the round-11 named per-section diff
(extensions ~5, functions ~46, relations/types/schemas/constraints/indexes deltas, a db
comment delta, a courses.difficulty subobject only in the isolate). The source is
PostgreSQL 17.6 on AARCH64, the pinned image is 17.6 on x86_64 — same PG version, so this
is not simple version drift but per-arch/glibc + TLE-restore + deparse artifacts; the
owner needs the full payloads, which previously died with the workdir.

- New plan subcommand flag `--keep-equality-diagnostics` — argv, NOT an env seam, so
  `assert_production_seam_lockdown` still rejects every `MC2_Q12_PLAN_*` env seam in a
  production run. When set AND the equality proof fails, the plan writes exactly three
  owner-only files into `<run_root>/equality-diagnostics/` (0700 dir, 0600 files): the
  source and isolate canonical structural payloads and the FULL unbounded per-entry diff
  (`_structural_catalog_diff` now takes `max_ids`/`max_lines`; None = unbounded).
- `run_plan`s failed-run cleanup gains a documented exception: it preserves the run dir it
  created when equality diagnostics were written under it; everything else
  (containers/volume/network/handle/generation/workdir) is still torn down. Flag off ⇒
  behavior byte-identical to before.
- Scrub confirmation (item 2): reading the frozen SQL's payload assembly, subscription
  conninfo is stored as `connection_sha256` (pre-hashed, never plaintext), and the payload
  carries no cron command text or table row data (structural = schema only). The only free
  text is our own migration-history statements. So the payload is secret-free by
  construction and the preserved copies are written verbatim — scrubbing would corrupt the
  exact diagnostic the ruling needs. The hash/proof itself is untouched.

Round-11 makes the plan's structural-sha equality proof self-diagnosing (`d28bdae1` ->
`5ebeeaca`), after rehearsal #4 got the real drill to complete end-to-end on the pinned
image but the plan's own gate rejected the restore with an opaque
`isolated pre-migration structural catalog differs from the read-only source catalog`.
The drill's OWN baseline-equality compare passed, so the divergence lives in what
q12-structural-catalog.sql hashes BEYOND the drill's compare set.

- Diagnostic capture (no SQL change): the frozen `q12-structural-catalog.sql` emits BOTH
  `payload` (the canonical jsonb) and `structural_sha256` (its hash); the capture helper
  previously selected only the sha. A new `--structural-payload` projection selects the
  `payload` column instead — the exact pre-hash catalog — leaving the SQL byte-identical.
- Self-diagnosis: `_capture_source` eagerly captures the source's structural payload while
  the snapshot window is open (owner-only, under workdir), because the window closes before
  the equality proof runs. On mismatch the plan captures the isolate payload and raises a
  bounded, labeled diff — per top-level section the +added/-removed/~changed counts and up
  to 10 differing identifiers, each with a source/isolate sha digest. It emits ONLY
  identifiers + digests: no data values, no credentials, migration statements collapse to
  their object digest. Both payloads may sit 0600 under the workdir (teardown reclaims
  them); the error tail is the surviving evidence.
- Design sanity-check (item 3): the structural hash is a SUPERSET of the drill's own
  compare. The drill compares source-manifest vs restored catalog for the cutover_snapshot
  and baseline VIEWS (database identity, guarded relations, triggers, cron rows, extensions
  present) and passed. The structural hash additionally binds the full catalog surface the
  drill does NOT compare: extension VERSIONS and their instantiated function/catalog rows
  (the pinned self-hosted image instantiates CREATE EXTENSION at the image's version,
  which can differ from the managed cloud source), publications/subscriptions, comments,
  security labels, event triggers, collations/types/operators, and migration_history
  statements. Those are exactly the diff categories to expect. The structural SQL already
  excludes only the three drill overrides + is database-name-agnostic (line 69 / db_row);
  NO new exclusion or allowlist was added — the frozen barrier consumes the same hash at
  the live window, so weakening the proof would poison the catalog. If rehearsal #5's
  named diff shows a real irreconcilable divergence (e.g. image extension versions), that is
  a product-truth finding for the owner to rule on, not something to paper over.
- RED reproduces it: a fake-drill `injectDrift` variant creates a function ONLY in the
  isolate, so the isolate catalog diverges from the source and the equality proof must fail
  naming `[functions]` + the injected identifier.

Round-10 fixes the drill's tsx runner, which the round-9 diagnostics exposed on rehearsal
#3 (`268677a1` -> `a1b24302`). The self-describing tail read
`ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL / Command "tsx" not found`.

- Root cause: `run_ts()` did `(cd "$PROJECT_ROOT" && /usr/bin/pnpm exec tsx "$@")`, but tsx
  is a devDependency of `packages/course-gen-platform` ONLY, not hoisted to the workspace
  root, and there is no hoist config — `pnpm exec tsx` from the repo root is unresolvable
  everywhere (server AND dev; `node_modules/.bin/tsx` at the root is absent). The drill's
  tsx leg had never been executable in reality; the fake pnpm in the suite masked it. This
  also broke the real C-window drill run and the scheduled backup (both run as root with
  PATH=/usr/sbin:/usr/bin:/sbin:/bin), so the fix repairs the live cutover path, not just
  plan mode.
- Fix: `run_ts()` invokes the package's own pnpm-generated shim directly
  (`$PROJECT_ROOT/packages/course-gen-platform/node_modules/.bin/tsx`), keeping
  cwd=$PROJECT_ROOT for the scripts' relative-path expectations. The shim is a `#!/bin/sh`
  script that execs `node` (resolved on PATH — /usr/bin/node on the server) with tsx's
  cli.mjs, and each machine's pnpm install regenerates it with that machine's absolute
  NODE_PATH. A fail-closed preflight in `parse_arguments` names the missing shim instead of
  surfacing an opaque ERR_PNPM mid-restore. NOTE: the team-lead's assumed shim shebang
  `#!/usr/bin/env node` is actually `#!/bin/sh` + internal `exec node` — the node-on-PATH
  assumption still holds and is stated in the script comment.
- Sweep of other pnpm-exec/tsx/node resolution in the drill + helpers:
  - `backup-supabase.sh:585` had the SAME `/usr/bin/pnpm exec tsx` bug (scheduled backup +
    cutover backup). Its bytes are NOT sha-pinned (only its PATH string appears in the
    frozen `q12-command-manifest.json`, whose sha is unchanged), so it is fixed with the
    same shim + preflight; its test-mode injection (which bypasses this line) is untouched
    and its 65 tests pass.
  - The plan's own node/tsx sites (`_produce_source_manifest`, `_apply_real_cli`) use
    `node --import tsx` with cwd=packages/course-gen-platform, so tsx resolves from the
    package's node_modules — consistent with the shim rule; they worked on the server and
    are left as-is (noted).
  - The helper shebangs (`#!/usr/bin/env -S pnpm exec tsx` on run-restore-cleanup.ts,
    q12-source-manifest.ts, generate-role-bootstrap.ts) are the same broken pattern but
    COSMETIC — every call site invokes them via a runner (tsx/`node --import tsx`), never
    executes them directly — so they are left unchanged and noted.
- RED reproduces the killer honestly: a new drill-suite test extracts the real `run_ts()`
  bytes and runs them in an env with the package shim present but NO root-resolvable tsx;
  the old runner fails, the shim runner succeeds.

Round-9 adds drill failure diagnostics and fixes the next mock-reality drift the pre-C1
rehearsal exposed (`4e3fc6fb` -> `87d2601c`). Rehearsal #2 passed the generation preflight
but died at the drill with an EMPTY detail (`isolated drill restore failed:` with nothing
after it); teardown was again perfect, which also destroyed the evidence.

- Diagnostics (primary): `_restore_via_drill` streams the drill's stdout AND stderr to
  owner-only (0600) files under the plan workdir and, on failure, raises a LifecycleError
  carrying the labeled last-60-line tail of BOTH streams with secret shapes scrubbed
  (`_scrub_plan_secret_text`: libpq URIs, service/pgpass passwords, 64-hex secrets,
  JWT/service-key shapes). The empty stderr was the symptom of a mid-drill step run
  without a `|| fail` wrapper: `set -e` exits with the reason on stdout, which the old
  code never captured. The tail now lands in the caller's log even though teardown
  reclaims the files.
- Root-cause fix (the concrete killer the sweep found): the plan restores a read-only
  PRE-cutover source, which has no `q12_guard` schema, but the drill's Q12 activation
  cleanup requires it — `run-restore-cleanup.ts` runs `q12_guard.verify_capability()` and
  `generate_cleanup_sql` emits `DROP SCHEMA q12_guard CASCADE`. The fake drill skipped
  that whole path, so CI never saw it. The plan now uses the drill's SCHEDULED mode (no
  capability, no activation cleanup — the same restore/role-bootstrap/extension/catalog
  compare), and the opt-in persist seam is extended to scheduled mode so the live isolate
  is still handed back to capture and migrate. Q12 mode and the real cutover path are
  untouched; the seam stays default byte-identical. `_prepare_capability` and the synthetic
  capability are removed. RED reproduces it via a fake drill that mirrors the real Q12
  activation cleanup (running the real `verify_capability()` extracted from the helper
  bytes) in q12 mode and skips it in scheduled mode.

Post-preflight sweep of the drill's Q12 path (each check vs the plan's scheduled-mode
generation; verified against the drill + helper bytes):

- generation basename / 4-file layout / 0600 modes / checksums schema+generation+sha256 /
  source-manifest schema — satisfied (round-8, enforced end-to-end by the mirrored fake
  drill).
- capability file content/shape — no longer applicable: scheduled mode takes no capability
  (`scheduled restore must not receive a Q12 capability`), and the capability CONTENT was
  only consumed by `run-restore-cleanup.ts` in Q12 mode, which the plan no longer uses.
- roles.sql / §3 role bootstrap (`generate-role-bootstrap.ts` + `verify-inventory`) — runs
  identically in scheduled mode; the source-manifest roles are the real
  `q12-source-manifest.ts` output. Satisfied on a faithful restore (server-validated).
- `create_database_sql` (cutover_snapshot.database name==postgres, owner, encoding, locale,
  acl, settings, role_settings) and `verify_extensions_and_toc` (cutover_snapshot.extensions
  - pinned image defaults) — consumed from the real manifest; mode-independent. Server-validated.
- archive TOC (`pg_restore --list`) + pgTLE offline scan + strict `pg_restore` restore — run
  in both modes; the fake drill exercises its own `pg_restore` into restore_test, but the
  pinned-image (17.6) `pg_restore` of the host `pg_dump` (17.x) archive is NOT CI-reproducible
  (needs the pinned Supabase image). FLAGGED: a host `pg_dump` newer than the image
  `pg_restore` could fail with an unsupported archive-format-version header exactly here; the
  new diagnostics will name it if it is the next failure. This stays on the server-validated
  boundary (decision B).
- Q12 activation cleanup (`generate_cleanup_sql` + `run-restore-cleanup.ts`) — REMOVED from
  the plan path by the scheduled-mode switch (the fix above).

Round-8 closes the whole drill generation preflight (`0791805e` -> `53b6fcce`), after
the server pre-C1 rehearsal fail-closed at the real drill with `generation basename is
invalid` (teardown was clean, so the safety contract held — this is the mock-reality
drift class the rehearsal is designed to catch).

- Root cause + fix: `_produce_generation` named the dir `generation-<16hex>`, but the
  drill requires `^generation-[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}$`
  (`restore-supabase-drill.sh` parse_arguments). `_generation_dirname` now builds
  `generation-<UTCstamp>Z-<run uuid>`; the stamp is bound once per run in `capture()`
  (deterministic per run, not per retry).
- Second latent mismatch (would have failed the very next check): the drill's
  `validate_generation` requires `checksums.json` carry `generation == basename`;
  `_write_checksums` omitted it. Now recorded.
- Full-set sweep instead of one field: the fake drill now MIRRORS the real drill's
  preflight — the basename ERE and the `validate_generation` Python block are extracted
  verbatim from the drill bytes (the P2-2 real-bytes technique) and run against the
  plan's actual generation before any resource is created. The real-PG17 end-to-end
  drill test therefore enforces the identical set the server drill does: 4-file layout,
  0600 modes, `checksums` schema/generation/files/sha256/size, `source-manifest` schema.
  A future drill preflight change now fails CI, not the live window. (The one real-drill
  check not mirrorable in CI — `pg_restore --list` TOC + pgTLE offline scan — needs the
  pinned Supabase image; the fake drill still does its own `pg_restore` into
  `restore_test`, and the real leg stays validated by the server pre-C1 run.)
- item-4 (leftover run dir): a failed pre-emission `run_plan` now removes ONLY a run dir
  it created; a caller-provided/pre-existing dir is preserved. The rehearsal's leftover
  `/opt/megacampus/backups/q12/49eca245-…` was an empty run dir left after teardown
  reclaimed capability/secrets; a failed pre-emission run now cleans the dir it made.

Round-7 is the final review-hardening pass (`4e752470` -> `c6ac3a8d`): 2 P2 + 4 P3.

- P2-1 production seam lockdown: `assert_production_seam_lockdown` makes a production
  plan run (run root under `/opt/megacampus/backups/q12`) reject any set
  `MC2_Q12_PLAN_...` test-seam environment variable by name, which also pins the
  drill restore mode and the pinned image (those diverge from the default only when
  their seam is set). Test seams stay usable with an explicit `/tmp/mc2-q12-plan-...`
  run root, which the seam-driven CI suites use.
- P2-2 anti mock-drift: a docker-free test drives the REAL `write_persist_handle`
  from `restore-supabase-drill.sh` and asserts the REAL `_read_handle` accepts its
  exact bytes and rejects a dropped field, so a future drill handle-field change
  fails CI instead of the live window.
- P3a: a bounded `select()` timeout on the snapshot-coordinator readline (a stalled
  source psql fails closed instead of blocking). P3b: teardown reclaims the synthetic
  capability file and the plan-created secrets dir. P3c: `teardown()` is declared in
  the `PlanExecutor` Protocol. P3d: teardown does a second-pass docker sweep by both
  the plan isolate label and the drill restore label for the run id, so a
  malformed-handle-after-persist path cannot leak a resource whose name never
  reached us.
- Notes: ownership checks on the binary-override seams were intentionally skipped —
  subsumed by P2-1 rejecting those seams in production. The §3 helper's documented
  divergence from `generate-role-bootstrap.ts` (the capture projection drops the
  PostgreSQL built-in roles and edges rather than doing the TS `pg_participants`
  cross-check) is recorded in `q12-migration-plan-roles.py` with rationale.

Round-6 fixed a real production-path defect and added snapshot coordination
(`b32ce5ed` -> `e92ec529`): `_produce_source_manifest` called
`q12-source-manifest.ts capture` with no `--snapshot`, which the CLI hard-rejects
(q12-source-manifest.ts:1440-1441). Rather than only add a flag, the generation
production now mirrors the reviewed backup coordinator (backup-supabase.sh:853-883):
`_open_snapshot_coordinator` opens ONE `REPEATABLE READ READ ONLY` session on the
source (host psql over the libpq service in production, `docker exec` for CI),
exports and fail-closed validates a `pg_export_snapshot()` id
(`^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9]+$`), and keeps it open until the source
capture, dump, and manifest all read that instant. The source
structural/guarded/cron/frontier capture (`q12-migration-plan-capture.py` gained a
validated `--snapshot` -> `SET TRANSACTION SNAPSHOT`), `pg_dump --snapshot=`, and
the manifest `capture --snapshot` all bind to the exported snapshot; a dead
coordinator or malformed id hard-stops before any restore, and teardown closes the
session (COMMIT + `\q`). Cluster roles are not MVCC-snapshotted, so — like the
reviewed backup (backup-supabase.sh:589-614) — `roles.sql` is exported before and
after the snapshot-bound work and must be byte-identical after removing only the
PG17 `\restrict`/`\unrestrict` nonce pair; role drift during the window hard-stops.

Wired production `LivePlanExecutor` to restore through the reviewed
`restore-supabase-drill.sh` via its persist seam instead of the direct
`pg_dump | pg_restore` path (now a test-only seam, `MC2_Q12_PLAN_RESTORE_MODE=direct`).
Round-5 RED->GREEN: `0e2cae74` -> `a8f355f2`.

- `_produce_generation`: a diagnostic backup generation (NOT the accepted
  recoverable backup) — `database.dump` and `roles.sql` streamed read-only,
  `source-manifest.json` via the reviewed `q12-source-manifest.ts` in production
  (placeholder under a CI source container), `checksums.json` computed.
- `_restore_via_drill`: invoke the drill with a synthetic run capability and
  `MC2_Q12_RESTORE_PERSIST_HANDLE`, then parse and fail-closed validate the
  owner-only 0400 handle (schema_version / run_id / host / int port / restore_test).
- `_read_handle` + dbname routing: migrate and capture run against the handle's
  `restore_test` connection; the capture helper gained a validated `--dbname`
  (`q12-migration-plan-capture.py`) so it never silently reads `postgres` when the
  drill restored into `restore_test`. Source `guarded_relations`/`cron_jobs`/
  `baseline`/`frontier` still come from the SOURCE capture (live OIDs the barrier
  re-matches); the isolate contributes only checkpoint structural shas and relation
  deltas.
- `teardown` reclaims the drill's container/network/volume PLUS the persist handle
  and the diagnostic generation; a teardown failure overrides success.

Load-bearing justification for reusing the drill's `restore_test` (team-lead item 3):
`q12-structural-catalog.sql` has no database-name field in `database_row`
(lines 33-88 build owner/encoding/locale/acl/settings/comment/… but never
`datname`; `current_database()` appears only in the WHERE at line 88) and excludes
the three drill overrides from the settings hash (`default_transaction_read_only`,
`cron.database_name`, `cron.launch_active_jobs` at line 69), so the source
`postgres` and the isolated `restore_test` yield the same structural sha — the
pre-migration equality proof holds against the drill restore. The one real
database-property difference the real drill replicates is the db comment; the CI
fake drill replicates it too.

# Verification

- Drill-consumption RED (`0e2cae74`, impl absent): both fake-drill tests failed
  (no drill invocation). GREEN (`a8f355f2`) they pass.
- Real-PG17 (`MC2_Q12_REAL_PG17=1`): `25 passed`. The fake-drill test restores into
  `restore_test`, publishes a 0400 handle, and asserts LivePlanExecutor passed the
  drill `--run-id`/`--generation`/`--q12-db-capability-file` argv + the
  `MC2_Q12_RESTORE_PERSIST_HANDLE` env, migrated/captured `restore_test` through the
  handle, emitted a barrier-valid catalog (76 guarded, observability delta =
  `document_evidence_observability_totals`), and tore down container+network+volume
  - handle + generation (zero leftovers). The malformed-handle case fails closed
    with no leaked resource. Direct-mode end-to-end, equality-mismatch, and
    teardown-override still hold; the §3 role bootstrap still gates the restore.
- Unit + drill (no docker): `65 passed | 6 skipped`; 44 existing drill tests
  unmodified; `tsc` exit 0; frozen bytes re-verified; `q12-live-cutover.test.ts`
  untouched.
- P3 (team-lead item 4): the migration CLIs run in loopback mode with only
  `SUPABASE_DB_URL` — `validateDocumentEvidenceApprovedMigrationTarget`
  (document-evidence-approved.ts:634) returns at :648 for 127.0.0.1/localhost/::1
  BEFORE the `--allow-remote`/`--confirm`/sslmode gate; `apply` applies all three
  base files and observability `apply-all` applies both. Loopback accepts the
  `restore_test` dbname (the URL path segment is the database).

# Risks / Follow-ups

- The Supabase-image-only leg (real drill + real source + real CLIs, and the real
  `q12-source-manifest.ts` generation) is server-validated per decision B; CI proves
  the whole consumption mechanics with a fake drill on vanilla PG17. This boundary
  is intentional and fail-closed (the pre-C1 run is read-only on the source), so a
  defect blocks the window rather than corrupting anything — see `explicit_defers`.
- The gated real-PG17 suite's container-readiness race is fixed: EVERY `pg_isready`
  wait in the file (the round-2 capture test at :387, both `beforeAll` sources at
  :652/:1053, and the fake-drill script at :1123) is now marker-gated on
  "PostgreSQL init process complete; ready for start up." — the temp init server
  stops before that line prints, so a post-marker `pg_isready` reflects only the
  final server and setup can never land in the restart window. Re-verified stable
  across four consecutive `MC2_Q12_REAL_PG17=1` runs (25 passed each). The suite is
  skipped without the flag, so the default path is deterministic and docker-free.
- The drill persist seam (round 3) and the direct restore + §3 bootstrap (round 4)
  remain: the seam is the reuse point this stream consumes; the direct path stays as
  the CI seam and is not reachable in production.
