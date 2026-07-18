---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-source-manifest-guard-surface
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform
base_commit: 3596aa729b3b4b1f86b5d3a286ac1c00e058238f
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: >-
  Commits landed in place on the existing worktree/branch per the task's explicit
  instruction (commit in place; do NOT push). No new worktree/branch created. All
  disposable postgres:17.10-bookworm containers used for real-PG17 evidence were
  removed (`docker rm -f`); zero leftover docker confirmed after every round.
risk_level: medium
docs_reviewed: no-change-needed
docs_review_notes: >-
  This round is a validation-semantics reconciliation inside deploy/postgres/
  q12-source-manifest.ts plus its test/fixtures; no design/spec/plan doc describes
  the q12_guard allowlist's exact contents at this level of detail, and none of the
  frozen contract files (manifest/barrier/structural-catalog) changed.
graph_reviewed: no-change-needed
graph_review_notes: >-
  Change confined to one ops tool file plus ops test/fixtures; no architecture,
  durable workflow, or public-surface change.
verification:
  - 'RED (real-PG17, stale allowlist): MC2_Q12_REAL_PG17=1, real deploy/qdrant/q12-database-barrier.sh install against a disposable postgres:17.10-bookworm source via the q12-live-real-barrier-cutover-runner.py C harness -> capture_rc=1, capture_stderr="source manifest failed: unexpected baseline-to-cutover delta: q12_guard function set" (confirmed reproducible via git stash of the fix, reproduced twice).'
  - 'Allowlist reconciliation (functions/triggers/ACL) verified in three independent ways against the REAL barrier-installed q12_guard surface: (a) the real end-to-end harness advances past every q12_guard-specific check (function set, trigger set, event-trigger absence, types/columns/constraints/indexes, ACL exact-set) after the fix, failing only later on an unrelated, non-q12_guard relation (see STOP-and-report below); (b) a new no-docker unit suite (q12-source-manifest-guard-surface.test.ts) drives the tool''s own `verify-transition` CLI against two committed fixtures whose q12_guard fragment was captured from a disposable PostgreSQL 17.10 container where the barrier''s own q12_guard install program (lines 921-1509 of q12-database-barrier.sh) was replayed byte-for-byte: POSITIVE passes ("baseline-to-cutover transition equality passed"), NEGATIVE (a fabricated 11th function) fails closed ("unexpected baseline-to-cutover delta: q12_guard function set"); (c) direct psql introspection against the same disposable barrier install confirms the exact 4/10/8/4/11/56/62 table/function/trigger/index/constraint/object_acls/object_owners counts and every ACL grantor/grantee/privilege/grantable value.'
  - "Additional, necessary, non-allowlist SQL defect found and fixed (root-caused, not guessed): catalogSql()'s object_owners/object_acls/comments/security_labels UNION ALL blocks mix bare name-typed source columns (n.nspname, c.relname, t.typname, e.extname) with text-computed columns (e.g. function identity via ||) in the same output column; PostgreSQL 17.10 resolves that UNION column to type `name` (confirmed via `SELECT pg_typeof(identity)`), silently truncating every row -- including the text-computed ones -- to NAMEDATALEN-1 (63) bytes. This corrupted extend_guard(...)'s captured identity specifically once the allowlist was complete enough to compare it in full. Fixed with explicit `::text` casts on every bare name-typed branch column feeding those four UNION blocks; reproduced isolated (2-branch minimal repro) and confirmed fixed via `pg_typeof` returning `text` and the full untruncated string."
  - 'STOP-and-report (real, unrelated, out-of-scope defect, NOT fixed here): with both fixes applied, the real end-to-end capture (q12-live-real-barrier-cutover-runner.py) advances past every q12_guard-specific check and fails only on a generic, non-q12_guard-qualified "unexpected baseline-to-cutover delta". A temporary reportManifestDiff probe (reverted, not shipped) isolated it to exactly one relation: cron.job''s row_sha256 differs between baseline and cutover (acl/owner/kind/oid/name identical). This is expected content drift (the barrier deactivates every cron job during cutover, so cron.job''s row bytes legitimately change), but validateTransition only normalizes the separate top-level cron_jobs summary array''s active flag before comparing -- it never normalizes the authoritative relations section''s row-content hash for cron.job the same way. This is a cron-activation-state modeling question, not a q12_guard-surface allowlist question; per the round''s explicit STOP condition it is reported, not guessed at, and left as a distinct, tracked, deferred concern.'
  - 'No-docker suites (q12-live-controller + q12-live-cutover + retained-barrier-quiesce-seam + retained-barrier-w-composition-seam): 303/303, unchanged, both before and after the fix. New no-docker suite q12-source-manifest-guard-surface.test.ts: 2/2. Total no-docker: 305/305.'
  - '`pnpm type-check` (canonical workspace gate, `pnpm -r type-check`): exit 0, before and after. (A bare, non-canonical `pnpm exec tsc --noEmit` at the repo root also picks up deploy/postgres/run-restore-cleanup.ts via a separate, non-package-scoped root tsconfig.json; that file has 4 pre-existing TS2722 errors, confirmed present with q12-source-manifest.ts fully reverted via `git stash`, i.e. unrelated to and unaffected by this round. q12-source-manifest.ts itself has zero errors under that config too.)'
  - 'Frozen bytes unchanged: q12-command-manifest.json sha256 aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841; q12-database-barrier.sh sha256 3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9; q12-structural-catalog.sql sha256 0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e. q12-writer-resume.py and source-recovery-run.sh untouched (git diff --stat empty).'
  - 'Zero leftover docker after every round (docker ps -a --filter name=mc2-q12 empty at each checkpoint and at final handoff).'
  - 'DEFECT-4 FOLD-IN (same source-manifest round). RED (focused fixture, real PostgreSQL 17.10, no barrier): q12-cron-row-hash-normalization-runner.py flips ONLY cron.job.active (true->false) on a real seeded cron.job table and re-captures via the real, unmodified `q12-source-manifest.ts capture`; with the fix reverted (`git stash`), baseline row_sha256 `da72285063b793a44a5f899d8b30b5ef6414eda291d4e54c0f517f88396196f3` != sanctioned (active-only-flip) row_sha256 `2f84f332a4e7e873c665dcf445b71c12fae39c329b801d92d388b712824309eb` -- the exact defect, reproduced live.'
  - 'GREEN (same focused fixture, fix applied): baseline row_sha256 `16c184f52590c81dd6e5485bbae1a6654523f4539fcd0515663a14637fd0e535` == sanctioned (active-only-flip) row_sha256 `16c184f52590c81dd6e5485bbae1a6654523f4539fcd0515663a14637fd0e535` -- identical. Official vitest run: `SUPABASE_URL=... SUPABASE_SERVICE_KEY=... MC2_Q12_REAL_PG17=1 pnpm exec vitest run --config vitest.config.unit.ts tests/unit/ops/q12-cron-row-hash-normalization.test.ts` -> 1 passed (1), 122.01s.'
  - "MANDATORY TAMPER NEGATIVE (same run, fail-closed proof): after the SAME active flip, an additional REAL content mutation (`UPDATE cron.job SET command = command || ' -- tampered' WHERE jobid = 1`) still yields a DIFFERENT row_sha256 (`e42c5688c4227e6eb575f8a3caf9d1c584dbe8c0b3eca1cf37fc58fade6dd317`, distinct from both baseline and sanctioned) -- excluding `active` does not hide `command`/other-column tampering. Asserted in the same test file."
  - 'STOP-AND-REPORT (7th, unrelated, out-of-scope defect surfaced by applying the defect-4 fix to the full C harness): re-running q12-live-real-barrier-cutover-runner.py (MC2_Q12_REAL_PG17=1) with the cron fix applied still yields `capture_rc=1`, `capture_stderr="source manifest failed: unexpected baseline-to-cutover delta"` (barrier_rc=0, receipt_state=maintenance_guarded, unchanged). A temporary, reverted reportManifestDiff probe confirmed the `relations` arrays are now SET-EQUAL (zero source-only/target-only entries -- the cron.job content mismatch is fully resolved) but the derived `relations_sha256` still differs (`a9cfe531...` vs `7c3e09c2...`), because it is order-sensitive while `relations` itself is compared as a set: baseline.relations keeps catalogSql()''s natural SQL order, but validateTransition''s own `cutoverRelations = sortedArray(cutover.relations, ...)` re-sorts the cutover view by `canonical()`-string `localeCompare` (content-driven, not schema/name) before becoming the final `cutover.relations`, so the two arrays are set-equal but sequence-different. This is a relations-ordering/hash-derivation defect in validateTransition itself, wholly unrelated to cron/active, and per the round''s own STOP condition it is reported here, NOT chased or fixed.'
  - 'No-docker suites re-run with the final defect-4 fix in place (q12-live-controller + q12-live-cutover + retained-barrier-quiesce-seam + retained-barrier-w-composition-seam + q12-source-manifest-guard-surface): 305/305, unchanged. `pnpm exec tsc --noEmit -p packages/course-gen-platform` (canonical package-scoped invocation): exit 0. Frozen bytes re-confirmed unchanged (see hashes above); q12-writer-resume.py and source-recovery-run.sh untouched. Zero leftover docker confirmed after every defect-4 run.'
  - 'DEFECT-7 IN-ROUND FIX (same source-manifest round). RED (no-docker fixture, `q12-source-manifest-baseline-order-symmetry.test.ts` + its `-positive.json` fixture, fix reverted via `git stash` of `q12-source-manifest.ts` only): `verify-transition` against a fixture whose baseline `relations`/`schemas` are content-identical to cutover but listed in non-canonical (reverse-of-sorted) order fails closed with the generic `source manifest failed: unexpected baseline-to-cutover delta` (exit 1) -- the order-only defect, reproduced live without any barrier/docker involvement.'
  - "GREEN (same fixture, fix applied): `verify-transition --manifest q12-source-manifest-baseline-order-symmetry-positive.json` -> `baseline-to-cutover transition equality passed` (exit 0). Real-PG17 end-to-end corroboration: driving the REAL `q12-live-real-barrier-cutover-runner.py` harness with the three-site fix applied, `barrier_rc=0`/`receipt_state=maintenance_guarded` unchanged; a temporary, reverted order-aware dump-and-diff probe (the tool's own `reportManifestDiff` cannot surface order-only divergences, since it treats arrays as sets) confirmed the three fixed sites (`relations`, `schemas`, `database.settings`) are fully order-normalized post-fix, with exactly ONE remaining divergence left in the whole manifest: the top-level `cron_jobs` array (see STOP-and-report below)."
  - 'MANDATORY CONTENT-DIVERGENCE NEGATIVE (same fixture pair, fail-closed proof): `q12-source-manifest-baseline-order-symmetry-content-negative.json` -- identical order shuffle PLUS a genuine relation/schema `owner` content change -- still fails (`unexpected baseline-to-cutover delta`, exit 1) both with and without the fix. The symmetric sort reorders only; it does not mask real content deltas.'
  - "database.settings site: NOT independently reproducible as a pass/fail fixture -- immediately after the sort, validateTransition unconditionally overwrites `cutoverDatabase.settings = structuredClone(baselineDatabase.settings)`, so cutover's settings array is always a literal clone of baseline's regardless of pre-sort order; the two can never diverge in sequence at the final comparison by construction. Asserted STRUCTURALLY instead (a dedicated no-docker unit test reads the tool's own source text and asserts the baseline sort line exists and runs strictly before the clone line), per this fix's own documented fallback for a site with no constructible functional case."
  - 'STOP-AND-REPORT (an 8th, unrelated, out-of-scope defect surfaced by this same fix): re-running the FULL real-PG17 end-to-end harness with the three-site fix applied still yields `capture_rc=1`, `capture_stderr="source manifest failed: unexpected baseline-to-cutover delta"` (barrier_rc=0, receipt_state=maintenance_guarded, unchanged). The order-aware diagnostic probe isolated the SOLE remaining divergence to the top-level `cron_jobs` array: validateTransition''s own cron_jobs symmetric-sort idiom (`baselineJobs`/`cutoverJobs`, both `sortedArray()`''d) sorts BOTH sides as LOCAL variables for cardinality/normalization only, and reassigns `cutover.cron_jobs = normalizedCutoverJobs` (built from the sorted `cutoverJobs`), but never reassigns `baseline.cron_jobs` itself to the sorted `baselineJobs` order -- so `baseline.cron_jobs` keeps catalogSql()''s natural SQL capture order (ascending `jobid`) while `cutover.cron_jobs` ends up in `sortedArray()`''s canonical-string order, diverging at the final byte-strict comparison exactly like the three sites this round fixed. Confirmed live: a temporary, reverted diagnostic reassignment of `baseline.cron_jobs` to the sorted order, added ON TOP of the three-site fix, brought the REAL end-to-end capture to `capture_rc=0`. This is a 4th instance of the SAME order-symmetry defect class, at the exact site this round''s own mandate cited as already correct/symmetric -- a wrong premise in the diagnosis, not a new class of bug -- but per this round''s own explicit STOP condition ("do NOT chase beyond the three sort sites") it is reported here, NOT fixed: fixing it would mean editing a 4th site beyond the three pre-approved and reviewed here.'
  - 'No-docker suites re-run with the defect-7 fix in place (q12-live-controller + q12-live-cutover + retained-barrier-quiesce-seam + retained-barrier-w-composition-seam + q12-source-manifest-guard-surface + q12-source-manifest-baseline-order-symmetry): 309/309 (305 previous + 4 new), unchanged/passing. `pnpm exec tsc --noEmit -p packages/course-gen-platform`: exit 0. Frozen bytes re-confirmed unchanged (see hashes above); q12-writer-resume.py and source-recovery-run.sh untouched. Zero leftover docker confirmed after every run (`docker ps -a --filter name=mc2-q12` empty at each checkpoint).'
  - 'FINAL `deploy/postgres/q12-source-manifest.ts` sha256 (defect-7 fix): `bdf08ddef855c733eb4ba9dba431881df45912ebbc2e0b394dc05cde86815a80`.'
changed_files:
  - deploy/postgres/q12-source-manifest.ts
  - packages/course-gen-platform/tests/unit/ops/q12-live-real-barrier-cutover.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-source-manifest-guard-surface.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-source-manifest-guard-surface-positive.json
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-source-manifest-guard-surface-negative.json
  - packages/course-gen-platform/tests/unit/ops/q12-cron-row-hash-normalization.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-cron-row-hash-normalization-runner.py
  - packages/course-gen-platform/tests/unit/ops/q12-source-manifest-baseline-order-symmetry.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-source-manifest-baseline-order-symmetry-positive.json
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-source-manifest-baseline-order-symmetry-content-negative.json
explicit_defers:
  - 'cron.job row_sha256 baseline-vs-cutover drift: FIXED in the defect-4 fold-in below (relationHash() now excludes ONLY the `active` column, ONLY for cron.job).'
  - "FIXED (defect-7 in-round fix, below): validateTransition's `relations_sha256`/`schemas_sha256` digests (and the full-object comparison for `database.settings`) were order-sensitive because only the CUTOVER projections were canonically sorted before comparison; baseline was never sorted the same way. Fixed by sorting the baseline counterpart at all three sites, mirroring the tool's own already-symmetric cron_jobs idiom."
  - "NEW (defect-7 fold-in, 8th defect, STOP-and-report, NOT fixed): the tool's own cron_jobs symmetric-sort idiom sorts baselineJobs/cutoverJobs as LOCAL variables only and never reassigns baseline.cron_jobs to that sorted order (only cutover.cron_jobs is reassigned, to the sorted-then-normalized array), so baseline.cron_jobs vs cutover.cron_jobs still diverge in ORDER at the final byte-strict comparison -- a 4th instance of the same order-symmetry defect class, at a site this round's mandate incorrectly cited as already correct. This is what now blocks true end-to-end `capture_rc=0` against a real barrier.install cutover. Out of scope for this three-site-bounded round; needs its own TDD round (reassign `baseline.cron_jobs = baselineJobs` the same way `baseline.relations`/`baseline.schemas`/`baselineDatabase.settings` were reassigned here). Recommend a dedicated Beads issue."
  - "The same bare-name/text UNION-type-resolution hazard this round fixed for q12_guard's object_owners/object_acls/comments/security_labels branches is a general correctness risk for catalogSql()'s coverage of the REAL production schemas (public/auth/storage/cron/net) too -- any sufficiently long function identity, or any future PostgreSQL version/schema shape where a comment/security-label row's identity exceeds 63 bytes, would silently truncate the same way. This round's ::text casts close the concrete, evidenced case (q12_guard); a broader audit of catalogSql() for the same hazard on non-q12_guard schemas was not performed here (out of scope: the mandate was the q12_guard-surface allowlist) and is worth a follow-up sweep."
---

# Summary

RATIFIED scoped semantics amendment delivered: `deploy/postgres/q12-source-
manifest.ts`'s `q12_guard` guard-surface allowlist (`GUARD_FUNCTIONS`,
`GUARD_TRIGGERS` (new), `approvedGuardIdentity`, `filterApprovedGuardCatalog`,
`validateExactGuardDelta`) is reconciled **to the barrier** — the barrier
(`deploy/qdrant/q12-database-barrier.sh`, frozen, unchanged) is the sole
authority on its own guard surface. Direction is one-way (source-manifest
expectations moved to match the barrier), exact-set fail-closed throughout,
no over-approval.

**Reconciled dimensions** (every one enumerated in the mandate, cross-checked
against the barrier's real CREATE bytes — see provenance table below):

- **Functions**: `GUARD_FUNCTIONS` grew from 5 to the exact 10 the barrier
  installs. The 5 added (all zero-arg): `assert_controller_binding()`,
  `enforce_ddl_barrier()`, `quiesce_client_backends()`,
  `verify_install_resume_state()`, `verify_activated_state()`. A single
  derived `GUARD_FUNCTION_NAMES` constant now feeds every one of the 3 places
  that used to hardcode a separate 5-name array (the exact-set assertion,
  the owner-identity list, the ACL-privilege map), removing the
  duplication-drift risk that caused the original staleness.
- **Triggers**: new `GUARD_TRIGGERS` exact-set constant (8 entries: the 2
  `q12_guard.probe` `q12_guard_row`/`q12_guard_truncate` triggers already
  approved, plus the 6 previously-rejected `q12_guard_immutable`/
  `q12_guard_immutable_truncate` pairs on `active_run`/`baseline`/
  `migration_guards`). `approvedGuardIdentity`'s trigger branch,
  `filterApprovedGuardCatalog`'s triggers branch, the exact-set
  `triggerExpected` array, and `expectedOwnerIdentities`'s trigger entries
  all now derive from this one constant. The external/internal distinction
  (`isExternalGuardTrigger` vs. `GUARD_TRIGGERS`) is preserved unchanged —
  internal q12_guard-schema triggers and the external triggers the barrier
  installs on the 76 guarded relations are never conflated.
- **Event trigger**: confirmed NOT surfaced by the tool's own capture SQL —
  `catalogSql()` never queries `pg_event_trigger` anywhere (verified by
  reading the query text and by inspecting real captured JSON for any trace
  of it: none). No allowlist entry was added or is possible; this is a
  capture-scope fact, not a staleness. (Its backing function,
  `enforce_ddl_barrier()`, IS captured as an ordinary function row and IS
  now approved via the functions fix above.)
- **Types/columns/constraints/indexes**: audited line-by-line against the
  barrier's `CREATE TABLE q12_guard.*` bytes (lines 923-943) — all already
  correct; no changes needed (see provenance table).
- **ACL exact-set** (found necessary for GREEN, derived unambiguously from
  the barrier's own bytes and from real PostgreSQL 17 ACL-materialization
  behavior, not guessed): (1) every real q12*guard ACL row observed
  `is_grantable=false`, not the previously-assumed `true`; (2) PostgreSQL 17
  added the `MAINTAIN` table privilege, so each of the 4 guard tables now
  carries 8 ACL rows, not 7; (3) the 4 implicit array types
  (`_active_run`/`_baseline`/`_migration_guards`/`_probe`) keep an
  un-revocable default `PUBLIC USAGE` grant because PostgreSQL categorically
  refuses `GRANT`/`REVOKE` on array types — this is the barrier's \_own*,
  already-documented exemption (its ACL-lockdown loop and its own
  `verify_expected_guards` both exclude `typcategory='A'` for exactly this
  reason), now mirrored as an explicit, narrow, fail-closed exception in the
  allowlist rather than silently rejected.

**Beyond the enumerated dimensions, two further things were found while
driving this to GREEN against the real barrier** (see Verification for full
detail): a genuine PostgreSQL SQL-authoring defect in `catalogSql()`'s own
UNION ALL queries (name/text type-resolution truncation) was root-caused and
fixed, since it directly blocked exercising the now-complete allowlist; a
second, unrelated `cron.job` row-hash normalization gap was found, diagnosed,
and explicitly **not** fixed (STOP-and-report, per the round's own escape
valve — it is not a guard-surface question).

# Provenance Table

Every barrier line reference is byte-verified against
`deploy/qdrant/q12-database-barrier.sh` at its frozen sha
`3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9`.

| Kind                           | Identity                                                                                                                   | Barrier line(s)                                        | Reconciliation                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| Schema                         | `q12_guard`                                                                                                                | 921                                                    | already correct                                                           |
| Table                          | `active_run`                                                                                                               | 923-930                                                | already correct                                                           |
| Table                          | `baseline`                                                                                                                 | 931-935                                                | already correct                                                           |
| Table                          | `migration_guards`                                                                                                         | 936-942                                                | already correct                                                           |
| Table                          | `probe`                                                                                                                    | 943                                                    | already correct                                                           |
| Function                       | `assert_capability()`                                                                                                      | 971-987                                                | already correct                                                           |
| Function                       | `assert_controller_binding()`                                                                                              | 989-1004                                               | **added**                                                                 |
| Function                       | `enforce_ddl_barrier()`                                                                                                    | 1006-1010                                              | **added**                                                                 |
| Function                       | `enforce_write_barrier()`                                                                                                  | 1050-1067                                              | already correct                                                           |
| Function                       | `quiesce_client_backends()`                                                                                                | 1016-1048                                              | **added**                                                                 |
| Function                       | `extend_guard(p_migration text, p_expected_relations jsonb, p_migration_file_sha256 text, p_expected_catalog_sha256 text)` | 1078-1129                                              | already correct                                                           |
| Function                       | `verify_expected_guards(p_after_migration text)`                                                                           | 1131-1278                                              | already correct (identity args already drop the barrier's `DEFAULT NULL`) |
| Function                       | `verify_install_resume_state()`                                                                                            | 1280-1314                                              | **added**                                                                 |
| Function                       | `verify_activated_state()`                                                                                                 | 1316-1341+                                             | **added**                                                                 |
| Event trigger                  | `q12_guard_ddl_command_start` (on `enforce_ddl_barrier`)                                                                   | 1012-1014                                              | not surfaced by capture SQL — no entry possible/needed                    |
| Trigger                        | `active_run.q12_guard_immutable`                                                                                           | 1430-1431                                              | **added**                                                                 |
| Trigger                        | `active_run.q12_guard_immutable_truncate`                                                                                  | 1432-1433                                              | **added**                                                                 |
| Trigger                        | `baseline.q12_guard_immutable`                                                                                             | 1434-1435                                              | **added**                                                                 |
| Trigger                        | `baseline.q12_guard_immutable_truncate`                                                                                    | 1436-1437                                              | **added**                                                                 |
| Trigger                        | `migration_guards.q12_guard_immutable`                                                                                     | 1438-1439                                              | **added**                                                                 |
| Trigger                        | `migration_guards.q12_guard_immutable_truncate`                                                                            | 1440-1441                                              | **added**                                                                 |
| Trigger                        | `probe.q12_guard_row`                                                                                                      | 1442-1443                                              | already correct                                                           |
| Trigger                        | `probe.q12_guard_truncate`                                                                                                 | 1444-1445                                              | already correct                                                           |
| Types (4 composite + 4 array)  | `active_run`/`baseline`/`migration_guards`/`probe` + `_`-prefixed                                                          | implicit (from the 4 `CREATE TABLE`s)                  | already correct                                                           |
| Indexes (4)                    | `<table>_pkey`                                                                                                             | implicit PK indexes                                    | already correct                                                           |
| Constraints (11)               | listed in barrier's own `CREATE TABLE` `CHECK`/`PRIMARY KEY` clauses                                                       | 923-943                                                | already correct                                                           |
| ACL: table privileges          | `DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` × 4 tables                                              | 1447, PG17 `MAINTAIN`                                  | **added `MAINTAIN`; grantable `true`→`false`**                            |
| ACL: array-type `PUBLIC USAGE` | `_active_run`/`_baseline`/`_migration_guards`/`_probe`                                                                     | 1455-1471 (barrier's own `typcategory<>'A'` exemption) | **added exact exception**                                                 |
| ACL: grantable flag            | all q12_guard ACL rows                                                                                                     | (real PG17 ACL-materialization semantics)              | **`true`→`false`**                                                        |

# Verification

See the `verification` frontmatter list for the full evidence summary
(RED reproduction, three-way allowlist GREEN proof, the UNION-truncation
fix proof, the STOP-and-report cron.job diagnosis, no-docker 305/305,
`pnpm type-check` 0, frozen bytes unchanged, zero leftover docker). The
concrete command transcripts follow.

## RED (real-PG17, stale allowlist)

```
$ MC2_Q12_REAL_PG17=1 python3 tests/unit/ops/fixtures/q12-live-real-barrier-cutover-runner.py
(barrier_rc=0, receipt_state=maintenance_guarded, post_mortem_q12_guard_functions=[10 real names], post_mortem_q12_guard_event_trigger_count=1)
capture_rc = 1
capture_stderr = 'source manifest failed: unexpected baseline-to-cutover delta: q12_guard function set'
```

## GREEN (allowlist layer — proven three ways)

1. No-docker fixture positive/negative (`q12-source-manifest-guard-surface.test.ts`, real barrier-derived fixtures):

```
$ tsx deploy/postgres/q12-source-manifest.ts verify-transition --manifest positive.json
baseline-to-cutover transition equality passed   (exit 0)

$ tsx deploy/postgres/q12-source-manifest.ts verify-transition --manifest negative.json  (fabricated 11th function)
source manifest failed: unexpected baseline-to-cutover delta: q12_guard function set   (exit 1, fail-closed preserved)
```

2. Real end-to-end harness, post-fix: advances past every q12_guard-specific
   check (function set, trigger set, ACL exact-set, event-trigger absence,
   types/columns/constraints/indexes) and fails only on the unrelated
   `cron.job` row-hash gap (STOP-and-report; not a q12_guard question):

```
capture_stderr = 'source manifest failed: unexpected baseline-to-cutover delta'
(no q12_guard-qualified message anywhere; isolated via a temporary,
reverted reportManifestDiff probe to /relations: cron.job row_sha256 only)
```

3. Direct psql introspection against the same disposable barrier install
   confirms exact counts and every ACL value (see Verification).

# Cascade

The amended tool (`q12-source-manifest.ts`) is invoked by
`LivePlanExecutor`'s capture path and by the R4 Sub-round C harness; once
this change and the correctness/docs reviews land, the next server
reinstall of the amended tool joins the barrier cascade already recorded for
the frozen-barrier-fix round (barrier sha `3673ee49…`). This round changes
only the TypeScript validation tool, not any deployed/installed artifact
itself, so no redeploy is required by this round alone.

# Plan / Implementation Log

- Read the full guard-surface region of `q12-source-manifest.ts` (lines
  ~950-1360) and the barrier's install program (lines 921-1509) byte for
  byte; built the provenance table above before writing any code.
- RED: reproduced the real-PG17 stale-allowlist failure via the existing R4
  Sub-round C harness (`q12-live-real-barrier-cutover-runner.py` +
  `q12-live-real-barrier-cutover.test.ts`), confirmed via `git stash`
  before/after.
- Reconciled `GUARD_FUNCTIONS` (5→10) and introduced `GUARD_TRIGGERS` (2→8
  approved identities), threading both through every consumer
  (`approvedGuardIdentity`, `filterApprovedGuardCatalog`,
  `validateExactGuardDelta`'s exact-set assertions, `expectedOwnerIdentities`,
  `aclPrivileges`) so there is one source of truth per dimension instead of
  the original's 3-way duplicated hardcoded arrays.
- Iteratively drove the real harness to find every subsequent, real
  divergence: added the `MAINTAIN` privilege and the array-type `PUBLIC
USAGE` exemption and corrected the `grantable` assumption (all
  empirically confirmed via direct psql introspection against the real
  barrier-installed q12_guard schema before encoding into the tool).
- Root-caused (not guessed) a genuine PostgreSQL UNION-type-resolution
  truncation defect in `catalogSql()`'s `object_owners`/`object_acls`/
  `comments`/`security_labels` blocks (bare `name`-typed columns mixed with
  `text`-computed columns in the same UNION output column resolve to `name`,
  silently truncating to 63 bytes) via a minimal, isolated, no-node-in-the-
  loop repro (`pg_typeof` proof); fixed with explicit `::text` casts.
- Found and explicitly declined to fix a third, unrelated `cron.job`
  row-hash normalization gap (STOP-and-report), since it is not a
  q12_guard-surface question.
- Built two no-docker fixtures from a disposable PostgreSQL 17.10 container
  where the barrier's own q12_guard install program was replayed
  byte-for-byte, added a new no-docker positive/negative test suite, and
  updated the R4 Sub-round C real-PG17 test's header comment (no assertion
  changes) to record the current, accurate state.
- Verified: frozen bytes unchanged, no-docker 305/305 (303 existing + 2
  new), `pnpm type-check` 0, zero leftover docker.

# Risks / Follow-ups

- The `cron.job` row-hash gap (see Explicit defers) blocks true end-to-end
  real-capture `capture_rc=0`. It is real, reproducible, and independent of
  this round's fixes; recommend a dedicated Beads issue and a follow-up TDD
  round scoped to cron-activation-state normalization in `validateTransition`.
- The same name/text UNION-truncation hazard this round fixed for
  q12_guard's four sections is a general `catalogSql()` correctness risk
  outside q12_guard too; a broader audit was out of scope for this round's
  guard-surface mandate.
- Medium risk level reflects touching a security-relevant validation tool's
  capture SQL (the `::text` cast fix) beyond the originally-scoped allowlist
  edit; the fix is value-preserving (adds casts, changes no logic) and was
  verified via `pg_typeof` before/after against the real barrier-installed
  schema, but the orchestrator should review it with the same scrutiny as
  the allowlist changes.

# Defect-4 fold-in (same source-manifest round)

RATIFIED, tightly-bounded validation-semantics amendment: `relationHash()` in
`deploy/postgres/q12-source-manifest.ts` now excludes ONLY the `active`
column, ONLY for the pg_cron authoritative relation `cron.job`, when computing
its RELATIONS-section `row_sha256`. `barrier.install` deactivates every cron
job (`cron.job.active` true→false) as its own SANCTIONED maintenance delta;
`validateTransition` already normalizes that exact delta at the top-level
`cron_jobs` SUMMARY (its `exactField` set is
`{jobid,username,command_sha256}` — no `active`). Before this fold-in, the
separate RELATIONS-section row hash was NOT coherent with that same
normalization: it hashed `to_jsonb(t)` over every `cron.job` column including
`active`, so the identical sanctioned delta made baseline vs. cutover
`row_sha256` diverge and `validateTransition` rejected an otherwise-legitimate
cutover. This was the "STILL OPEN" defect this artifact's earlier section
(above) explicitly deferred.

## The fix

```diff
   const qualified = `"${schema.replaceAll('"', '""')}"."${relation.replaceAll('"', '""')}"`;
+  // barrier.install deactivates every cron job (cron.job.active true->false)
+  // as its own SANCTIONED maintenance delta; validateTransition already
+  // normalizes that exact delta at the top-level `cron_jobs` SUMMARY ...
+  const rowExpression =
+    schema === 'cron' && relation === 'job' ? `(to_jsonb(t) - 'active')` : 'to_jsonb(t)';
   const sql = `${begin}
 COPY (
   SELECT jsonb_build_object(
     'row_count', count(*)::text,
-    'row_sha256', encode(extensions.digest(convert_to(COALESCE(string_agg(to_jsonb(t)::text, E'\n' ORDER BY to_jsonb(t)::text), ''), 'UTF8'), 'sha256'), 'hex')
+    'row_sha256', encode(extensions.digest(convert_to(COALESCE(string_agg(${rowExpression}::text, E'\n' ORDER BY ${rowExpression}::text), ''), 'UTF8'), 'sha256'), 'hex')
   ) FROM ${qualified} t
 ) TO STDOUT;
 COMMIT;`;
```

Branch is exact-scoped (`schema === 'cron' && relation === 'job'`); every
other relation's SQL is byte-identical to before; every other `cron.job`
column (`jobid`, `schedule`, `command`, `nodename`, `nodeport`, `database`,
`username`, `jobname`, …) stays fully hash-bound.

## RED → GREEN → tamper-negative (focused fixture, real PostgreSQL 17.10)

A NEW, focused, no-barrier real-PG17 fixture
(`q12-cron-row-hash-normalization-runner.py` +
`q12-cron-row-hash-normalization.test.ts`) drives the REAL, unmodified
`q12-source-manifest.ts capture` command against a disposable source with a
real `cron.job` table — deliberately NOT the full barrier harness, since the
barrier's write-barrier trigger would otherwise need to be routed around to
mutate `cron.job` post-install, and the full harness independently hits the
unrelated 7th defect (below) that would otherwise obscure this fix's own
proof. Three captures, each a fresh REPEATABLE READ snapshot after the prior
mutation: baseline (active=true) → sanctioned (ONLY active flipped false) →
tampered (sanctioned, PLUS a real `command` mutation on one row).

- **RED** (fix reverted via `git stash`): `baseline.row_sha256` (
  `da72285063b793a44a5f899d8b30b5ef6414eda291d4e54c0f517f88396196f3`) !=
  `sanctioned.row_sha256` (
  `2f84f332a4e7e873c665dcf445b71c12fae39c329b801d92d388b712824309eb`) — the
  active-only flip alone changed the hash. Defect reproduced live.
- **GREEN** (fix applied): `baseline.row_sha256` == `sanctioned.row_sha256`
  == `16c184f52590c81dd6e5485bbae1a6654523f4539fcd0515663a14637fd0e535` —
  identical. Official vitest acceptance:
  `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key MC2_Q12_REAL_PG17=1 pnpm exec vitest run --config vitest.config.unit.ts tests/unit/ops/q12-cron-row-hash-normalization.test.ts`
  → 1 passed (1), 122.01s.
- **TAMPER NEGATIVE (mandatory, fail-closed)**: on top of the SAME active
  flip, a real content mutation
  (`UPDATE cron.job SET command = command || ' -- tampered' WHERE jobid = 1`)
  yields `tampered.row_sha256` =
  `e42c5688c4227e6eb575f8a3caf9d1c584dbe8c0b3eca1cf37fc58fade6dd317` —
  distinct from BOTH `baseline` and `sanctioned`. Excluding `active` does not
  hide `command` (or, by the same SQL mechanism, any other column) tampering.

## STOP-and-report: a 7th, unrelated, out-of-scope defect

Re-running the FULL R4 Sub-round C harness
(`q12-live-real-barrier-cutover-runner.py`, real `barrier.install` against a
disposable, full-Supabase-shaped source) with the defect-4 fix applied:
`barrier_rc=0`, `receipt_state=maintenance_guarded` (unchanged), but
`capture_rc` is STILL `1` — `capture_stderr = "source manifest failed:
unexpected baseline-to-cutover delta"`.

A temporary, reverted `reportManifestDiff` probe isolated this precisely: the
`relations` arrays are now SET-EQUAL (zero source-only/target-only entries —
the `cron.job` content mismatch this fold-in targeted is fully resolved), but
the derived `relations_sha256` still diverges
(`a9cfe5316185aa47c7c93ef9a325329984312e23546765c7b194f9dd50360c34` vs.
`7c3e09c260d8ad6f5a03f8c74562610770139a617269c86f612fa11b0bccccb5`). Root
cause: `relations_sha256` is order-sensitive (it hashes the canonical
serialization of the array in its given sequence) while `relations` itself is
compared by `validateTransition`'s set-based logic. `baseline.relations`
keeps `catalogSql()`'s natural SQL order (`ORDER BY nspname, relname,
relkind`, never resorted). `validateTransition`'s own
`cutoverRelations = sortedArray(cutover.relations, ...)` re-sorts the
CUTOVER view by `canonical()`-string `localeCompare` — a key-alphabetical,
content-driven order (`acl` sorts first, not `schema`/`name`) — before the
q12_guard filter, and that resorted order becomes the final
`cutover.relations`. So the two views end up set-equal but
sequence-different, and the order-sensitive digest diverges even though the
content is byte-identical. This was never reached by any prior round because
the (now-fixed) `cron.job` content mismatch always failed first and masked
it.

Per the round's explicit STOP condition, this is reported, NOT fixed: it is a
relations-ordering/hash-derivation defect in `validateTransition` itself,
wholly unrelated to `cron`/`active`, and chasing it would exceed this
fold-in's tight cron-normalization scope.

## Final verification (defect-4 fold-in)

- No-docker suites (q12-live-controller + q12-live-cutover +
  retained-barrier-quiesce-seam + retained-barrier-w-composition-seam +
  q12-source-manifest-guard-surface): 305/305, unchanged.
- New focused fixture (q12-cron-row-hash-normalization): 1/1.
- `pnpm exec tsc --noEmit -p packages/course-gen-platform`: exit 0.
- Frozen bytes unchanged: q12-command-manifest.json
  `aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841`;
  q12-database-barrier.sh
  `3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9`;
  q12-structural-catalog.sql
  `0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e`.
  q12-writer-resume.py and source-recovery-run.sh untouched.
- Zero leftover docker after every run (`docker ps -a --filter name=mc2-q12`
  empty at each checkpoint and at final handoff).
- FINAL `deploy/postgres/q12-source-manifest.ts` sha256:
  `9d098edc4f26aad71ee2bb6135fbd86371c378e888b25870c9c4af411f47e935`.

# Defect-7 in-round bounded plumbing fix (same source-manifest round)

RATIFIED, tightly-bounded, behavior-preserving coherence fix: `validateTransition()`
in `deploy/postgres/q12-source-manifest.ts` sorted the CUTOVER projections of
`database.settings`, `schemas`, and `relations` via the tool's own `sortedArray()`
helper before the byte-strict final comparison, but never sorted the BASELINE
counterpart the same way — baseline kept `catalogSql()`'s natural SQL capture
order throughout. Since the final acceptance
(`canonical(baseline) !== canonical(cutover)`) compares full arrays, not sets, a
content-identical relation/schema set that merely differed in SEQUENCE between
baseline and cutover spuriously failed. This mirrors the tool's own
already-symmetric `cron_jobs` idiom (`baselineJobs`/`cutoverJobs`, both
`sortedArray()`'d) at the three sites that were missing it.

## The fix

At each of the three sites, sort the baseline counterpart with the exact same
`sortedArray()` call and label style already used for the cutover side, and
reassign it, before the final `refreshDerivedHashes(baseline)`/comparison:

```diff
+  baselineDatabase.settings = sortedArray(baselineDatabase.settings, 'baseline.database.settings');
   cutoverDatabase.settings = structuredClone(baselineDatabase.settings);
   cutoverDatabase.size_bytes = baselineDatabase.size_bytes;

   const cutoverSchemas = sortedArray(cutover.schemas, 'cutover.schemas');
+  baseline.schemas = sortedArray(baseline.schemas, 'baseline.schemas');
   const guardSchemas = cutoverSchemas.filter(...);
   ...
   const cutoverRelations = sortedArray(cutover.relations, 'cutover.relations');
+  baseline.relations = sortedArray(baseline.relations, 'baseline.relations');
   const guardRelations = cutoverRelations.filter(...);
```

Nothing is added, removed, or reprojected: no filter, guard check, `exactField`,
or the final byte-strict comparison itself changed — only the two baseline
arrays are canonically reordered to match how their cutover counterparts were
already being reordered.

## RED -> GREEN (no-docker fixture)

A new, self-contained, no-docker fixture pair
(`q12-source-manifest-baseline-order-symmetry-positive.json` /
`-content-negative.json`, built from the guard-surface fixture's real
barrier-derived q12_guard scaffold plus two synthetic `public` relations/two
synthetic schemas) drives the REAL, unmodified `verify-transition` CLI:

- **RED** (fix reverted via `git stash -- deploy/postgres/q12-source-manifest.ts`):
  the positive fixture (baseline `relations`/`schemas` content-identical to
  cutover but listed in non-canonical, reverse-of-sorted order) fails —
  `source manifest failed: unexpected baseline-to-cutover delta` (exit 1).
- **GREEN** (fix applied): same fixture — `baseline-to-cutover transition
equality passed` (exit 0).
- **MANDATORY CONTENT-DIVERGENCE NEGATIVE**: the same order shuffle plus a
  genuine `owner` content change on one relation and one schema still fails —
  `unexpected baseline-to-cutover delta` (exit 1) — both with and without the
  fix. The symmetric sort reorders only; it never masks a real content delta.
- **`database.settings`**: not independently reproducible as a pass/fail
  fixture (`cutoverDatabase.settings` is unconditionally overwritten with a
  literal clone of `baselineDatabase.settings` immediately after the sort, so
  the two can never diverge in sequence by construction). Asserted
  STRUCTURALLY instead: a dedicated no-docker test reads the tool's own
  source text and asserts the baseline sort line exists and precedes the
  clone line.

Official vitest run:
`SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key pnpm exec vitest run --config vitest.config.unit.ts tests/unit/ops/q12-source-manifest-baseline-order-symmetry.test.ts`
→ 4 passed (4).

## Real-PG17 corroboration

Driving the REAL `q12-live-real-barrier-cutover-runner.py` harness (real
`barrier.install` against a disposable `postgres:17.10-bookworm` source) with
the three-site fix applied: `barrier_rc=0`, `receipt_state=maintenance_guarded`
(unchanged). A temporary, reverted order-aware dump-and-diff probe (the tool's
own `reportManifestDiff` treats arrays as sets and so cannot surface an
order-only divergence; a small standalone order-aware deep-diff script was used
instead, then discarded) confirmed the three fixed sites (`relations`,
`schemas`, `database.settings`) are now fully order-normalized between baseline
and cutover — with exactly ONE remaining divergence left in the entire
manifest: the top-level `cron_jobs` array.

## STOP-and-report: an 8th, unrelated, out-of-scope defect

Re-running the FULL real-PG17 end-to-end harness with the three-site fix
applied: `capture_rc` is STILL `1` —
`capture_stderr = "source manifest failed: unexpected baseline-to-cutover delta"`
(`barrier_rc=0`, `receipt_state=maintenance_guarded`, unchanged).

Root cause (confirmed via the order-aware probe): `validateTransition`'s own
cron_jobs symmetric-sort idiom (`baselineJobs`/`cutoverJobs`, both
`sortedArray()`'d, cited in this round's own mandate as "the tool's OWN correct
idiom") sorts BOTH sides as LOCAL variables, used only for cardinality
checking and to build `normalizedCutoverJobs` — but only `cutover.cron_jobs` is
ever reassigned (`cutover.cron_jobs = normalizedCutoverJobs`, built from the
sorted `cutoverJobs`). `baseline.cron_jobs` itself is never reassigned to the
sorted `baselineJobs` order, so it keeps `catalogSql()`'s natural SQL capture
order (ascending `jobid`), while `cutover.cron_jobs` ends up in
`sortedArray()`'s canonical-string order — diverging at the final byte-strict
comparison exactly like the three sites this round fixed.

Confirmed live: a temporary, reverted diagnostic reassignment of
`baseline.cron_jobs = baselineJobs` added ON TOP of the three-site fix brought
the REAL end-to-end capture to `capture_rc=0`. This proves (a) the three-site
fix is correct and complete for its own scope, and (b) the cron_jobs order gap
is the SOLE remaining blocker to full end-to-end `capture_rc=0`.

This is a 4th instance of the SAME order-symmetry defect class, but at a site
this round's own mandate explicitly (and, it turns out, incorrectly) cited as
already correct/symmetric — not a new defect class, but a wrong premise in the
diagnosis. Per this round's own explicit STOP condition ("do NOT chase beyond
the three sort sites"), it is reported here, NOT fixed: fixing it would mean
editing a 4th site beyond the three pre-approved and reviewed in this round.
Recommend a dedicated Beads issue and a follow-up TDD round scoped to
reassigning `baseline.cron_jobs` the same way the three sites here were fixed.

Since GREEN (real end-to-end `capture_rc=0`) was not reached, the C acceptance
prerequisite this round targeted remains unmet; `q12-live-real-barrier-cutover.test.ts`'s
header comment is updated to document this accurately (a new "UPDATE
(defect-7 in-round bounded plumbing fix...)" section plus its own
STOP-and-report), but its assertions are UNCHANGED — `capture_rc`/`capture_stderr`
remain diagnostic-only, not asserted on, per the file's existing, unmodified
scope note.

## Final verification (defect-7 fix)

- No-docker suites (q12-live-controller + q12-live-cutover +
  retained-barrier-quiesce-seam + retained-barrier-w-composition-seam +
  q12-source-manifest-guard-surface + q12-source-manifest-baseline-order-symmetry):
  309/309 (305 previous + 4 new).
- `pnpm exec tsc --noEmit -p packages/course-gen-platform`: exit 0.
- Frozen bytes unchanged: q12-command-manifest.json
  `aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841`;
  q12-database-barrier.sh
  `3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9`;
  q12-structural-catalog.sql
  `0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e`.
  q12-writer-resume.py and source-recovery-run.sh untouched.
- Zero leftover docker after every run (`docker ps -a --filter name=mc2-q12`
  empty at each checkpoint and at final handoff).
- FINAL `deploy/postgres/q12-source-manifest.ts` sha256:
  `bdf08ddef855c733eb4ba9dba431881df45912ebbc2e0b394dc05cde86815a80`.
