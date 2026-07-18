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
changed_files:
  - deploy/postgres/q12-source-manifest.ts
  - packages/course-gen-platform/tests/unit/ops/q12-live-real-barrier-cutover.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-source-manifest-guard-surface.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-source-manifest-guard-surface-positive.json
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-source-manifest-guard-surface-negative.json
explicit_defers:
  - "cron.job row_sha256 baseline-vs-cutover drift (STOP-and-report above): validateTransition compares the `relations` section's authoritative row-content hash for cron.job without normalizing the barrier's legitimate cron-deactivation content change, the way it already normalizes the separate top-level cron_jobs summary array's `active` flag. This blocks true end-to-end real-capture GREEN (capture_rc=0) even after the guard-surface and UNION-truncation fixes. Out of scope for this round (not a q12_guard-surface question); needs its own semantics decision (what should row_sha256 compare against post-cutover?) and TDD round. Recommend a dedicated Beads issue."
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
  behavior, not guessed): (1) every real q12_guard ACL row observed
  `is_grantable=false`, not the previously-assumed `true`; (2) PostgreSQL 17
  added the `MAINTAIN` table privilege, so each of the 4 guard tables now
  carries 8 ACL rows, not 7; (3) the 4 implicit array types
  (`_active_run`/`_baseline`/`_migration_guards`/`_probe`) keep an
  un-revocable default `PUBLIC USAGE` grant because PostgreSQL categorically
  refuses `GRANT`/`REVOKE` on array types — this is the barrier's _own_,
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
