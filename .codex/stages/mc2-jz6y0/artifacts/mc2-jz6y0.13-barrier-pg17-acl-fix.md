---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-barrier-pg17-acl-fix
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform
base_commit: 6e86d5387
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: >-
  Committed in place on the existing isolated worktree/branch per the launching
  orchestrator's explicit instruction; not pushed. No new worktree/branch created,
  nothing to reclaim. All docker containers created during verification were
  removed (`docker rm -f`) and their `/tmp` run roots deleted after each run;
  confirmed zero q12-related containers present at close.
risk_level: high
docs_reviewed: updated
docs_review_notes: >-
  docs/superpowers/plans/2026-07-17-q12-live-controller.md implementation log
  updated with the frozen-barrier-fix round entry (ACL-fix round c4c05d762 +
  this round's fd/precedence/scalar fixes, GREEN acceptance evidence, cascade
  note) and a new "Open risks carried forward" entry for the q12-source-
  manifest.ts q12_guard function-set drift found this round. No other product
  doc changed; q12-source-manifest.ts itself is untouched (frozen/out of scope).
graph_reviewed: no-change-needed
graph_review_notes: >-
  Change is confined to deploy/qdrant/q12-database-barrier.sh (5 in-file SQL/fd
  corrections, no new functions/schemas/architecture) plus test/fixture files
  under packages/course-gen-platform/tests/unit/ops/. No new module, service,
  durable workflow, or public surface; the existing local graph already models
  this file at the appropriate granularity. Read-only/bug-fix stream in a
  delegated worktree; no local Graphify refresh performed here.
verification:
  - 'Commits (this branch, chronological): c4c05d762 (ACL array-type fix, already
    landed before this round; parent 6e86d5387) -> RED (test+fixture harness
    extension) -> GREEN (fd-consumption + PG-dialect precedence/scalar fixes to
    q12-database-barrier.sh) -> docs (this artifact + plan implementation log).'
  - "FD AUDIT (independently re-verified, not just trusted): grep for every
    `cat <&$fd` (consuming) vs `/proc/self/fd/$fd` (non-consuming) read in
    q12-database-barrier.sh, cross-referenced against every by-fd-number read
    in the two embedded Node runners. CONSUMING: :296 `cat <&$structural_catalog_fd`
    (fd 15) and :361 `cat <&$catalog_fd` (fd 13, THE bug). NON-CONSUMING
    (/proc/self/fd): :301(13),:336-337(probe 14),:357(prior 16),:646(cap 12),
    :647/:666/:669/:770/:815/:820/:825(13). BY-NUMBER READERS: install NODE_RUNNER
    (:1916 call site :1942-1944) reads urlFd(10) via one(), caFd(11) via
    fs.readFileSync, capFd(12) via one(), catalogFd(13) via
    fs.readFileSync(Number(catalogFd)) -- THE site hit by the fd-13 consumption
    -- and sqlPath by path (not fd); structural_catalog_fd(15) is passed as an
    EXTRA, UNUSED trailing argv element to this runner (its own main() only
    destructures 11 positional args), so fd 15's consumption at :296 is safe
    for install regardless. TERMINAL_PROOF_RUNNER (:1925, cleanup/rollback only)
    reads urlFd(17), caFd(18), structuralFd(19) -- a SEPARATE dup fd, not 15 --
    confirming the authors already knew this exact double-consumption class and
    built a two-fd workaround (15 for bash cat, 19 for the Node reader) for the
    terminal runner, but missed applying it to the catalog fd for install.
    CONCLUSION independently confirmed: the ONLY double-consumption is fd 13
    (consumed at :361, re-read by-number at :1916); no other fd is both
    cat<&-consumed and re-read by number."
  - 'RED Mode A (ACL loop, isolated SQL repro against a fresh postgres:17.10-bookworm
    container): `CREATE TYPE q12_guard.active_run AS (...)` then
    `REVOKE ALL ON TYPE q12_guard._active_run FROM PUBLIC;` ->
    `ERROR: cannot set privileges of array types / HINT: Set the privileges of
    the element type instead.` -- exactly the pre-c4c05d762 loop behavior
    (verified against the parent-commit diff, not just described).'
  - "RED Mode B (ACL residual, isolated SQL repro, same container): after
    `REVOKE ALL ON TYPE q12_guard.active_run FROM PUBLIC` (composite only,
    succeeds) with the array type left untouched (default typacl NULL ->
    acldefault resolves to PUBLIC=USAGE for grantee 0), `aclexplode` on
    `_active_run` yields the row `_active_run | grantee_oid=0 | USAGE` exactly
    as specified; running the VERBATIM pre-fix residual predicate (the parent
    commit's text, no `typcategory <> 'A'` exclusion) against this state ->
    `ERROR: q12_guard ACL is not owner-only`. The fixed predicate (with the
    exclusion) on the identical state raises no exception (`NOTICE: fixed
    predicate: no violation`)."
  - 'RED Mode C (fd-consumption, full real-PG17 harness, pre-FIX-1 barrier at
    c4c05d762): `q12-live-real-barrier-cutover-runner.py` against a disposable
    full-Supabase-seeded (47 public/22 auth/5 storage/8 active cron/0 net)
    postgres:17.10-bookworm source -> barrier_rc=1, receipt_state=null,
    post_mortem_q12_guard_schema_present=false (clean tx1 rollback, no partial
    state). Independently isolated the exact underlying error (the barrier
    itself swallows it): `SELECT set_config(''megacampus.q12_expected_catalog'','''',false);
    SELECT current_setting(...)::jsonb;` on a bare PG17.10 container ->
    `ERROR: invalid input syntax for type json / DETAIL: The input string ended
    unexpectedly.` Independently isolated the fd mechanics with a minimal
    bash+node repro (no postgres involved): open fd 13 on a JSON file, `cat <&13`
    (consumes to EOF) then `node -e fs.readFileSync(Number(13))` -> empty string
    (len 0); with the fix (`cat "/proc/self/fd/13"` for the bash-side copy) the
    same by-number Node read returns the full original content (len 18,
    byte-identical) -- proves both the bug and the fix mechanically, independent
    of Postgres.'
  - 'FIX 1 applied: q12-database-barrier.sh:361
    `expected_json="$(cat <&"$catalog_fd")"` ->
    `expected_json="$(cat "/proc/self/fd/$catalog_fd")"`. Behavior-preserving:
    reads the identical bytes for the bash-side jq validation, via a fresh,
    independent file description instead of the shared one, matching the
    barrier''s own established pattern at its six other catalog reads.'
  - 'Re-running the real-PG17 harness with FIX 1 alone (+ the already-landed ACL
    fix) surfaced a FURTHER, previously-masked latent defect (never reached
    before because Mode A/B/C aborted earlier every prior time): barrier_rc=1
    still, but now post_mortem_q12_guard_schema_present=true and
    post_install_cron_active=0 (progress -- tx1/most of tx2 now execute for
    real). Root-caused via `docker logs` on the kept-alive disposable container
    (the barrier''s own generic message swallows real errors): PL/pgSQL
    `verify_install_resume_state()` raised
    `ERROR: operator is not unique: unknown - unknown ... LINE 1:
    (saved->''database_settings'' - ''setconfig'') ... HINT: Could not choose a
    best candidate operator.` Root cause: PostgreSQL''s operator-precedence table
    places binary `-` (tier 7, additive) TIGHTER than `->` (tier 8, "any other
    operator"), so `saved->''database_settings'' - ''setconfig''` parses as
    `saved -> (''database_settings'' - ''setconfig'')`, not
    `(saved->''database_settings'') - ''setconfig''` as intended -- two untyped
    string literals hit an ambiguous `-` resolution. Independently reproduced
    minimally (`DECLARE saved jsonb; ... (saved->''database_settings'' -
    ''setconfig'')` -> same "operator is not unique" error;
    `((saved->''database_settings'') - ''setconfig'')` with explicit parens ->
    resolves to the intended jsonb `-` and instead raises the expected runtime
    "cannot delete from scalar", confirming the precedence theory before
    editing the tracked file). Found at TWO sites (identical text): line 1303
    (`verify_install_resume_state()`, used by fresh install and resume) and
    line 1613 (the prepare-recovery readiness check). This is a pre-existing
    PG-dialect/operator-precedence mechanics defect, latent since the function
    was never reached in any prior round (Mode A/B/C always aborted first) --
    execution-enabling, behavior-preserving (adds parens only; does not change
    what is compared). Fixed by wrapping the left operand in explicit parens
    at both sites: `((saved->''database_settings'') - ''setconfig'') IS DISTINCT
    FROM (current_database_setting - ''setconfig'')`.'
  - 'Re-running with the precedence fix alone surfaced the SAME expression''s
    second, stacked defect: with parsing now correct, the LEFT operand
    `saved->''database_settings''` is the jsonb SCALAR `null` on every fresh
    install (no `pg_db_role_setting` row exists yet at baseline-capture time,
    matching the identical `COALESCE(...,''null''::jsonb)` sentinel the SAME
    function already uses for `current_database_setting`), and jsonb `-`
    categorically refuses non-object/array operands -> `ERROR: cannot delete
    from scalar` (confirmed via `docker logs`, reproduced independently in an
    isolated DO block with the exact scalar-null shape observed in the live
    `q12_guard.baseline` row). This is NOT a semantics change: the function''s
    OWN sibling computations (`saved_other_settings`/`current_other_settings`,
    3 sites in the same function) already guard the identical
    `->''database_settings''` access with `CASE WHEN jsonb_typeof(...)=''array''
    THEN ... ELSE ''[]''::jsonb END` for exactly this scalar/absent-row case --
    the raw `- ''setconfig''` subtraction was simply the one place that missed
    the same defensive pattern. Verified in isolation (3 cases before touching
    the tracked file): null-vs-null (both sides absent) -> "same, no drift"
    (correct: no row on either side is not a drift); a real matching
    `{setdatabase,setrole,setconfig}` row differing only in `setconfig` -> "same"
    (correct: setconfig is checked separately by the surrounding
    saved_other_settings/current_default logic); a real row with a genuinely
    different `setrole` -> "distinct" (correct: still detects real drift).
    Fixed at the same two sites (1303, 1613) with a
    `CASE WHEN jsonb_typeof(...)=''object'' THEN ... ELSE ''{}''::jsonb END`
    guard around BOTH operands before the `- ''setconfig''` subtraction,
    mirroring the function''s own established style.'
  - 'GREEN acceptance (official vitest run, MC2_Q12_REAL_PG17=1, real disposable
    postgres:17.10-bookworm, full Supabase-shaped seed): `barrier_rc=0`;
    `database-barrier-receipt.json` ==
    {"schema_version":"megacampus.q12.database-barrier-receipt/v1","run_id":"123e4567-e89b-42d3-a456-426614174000","state":"maintenance_guarded","zero_guard_residue":false,"expected_catalog_sha256":"5ca720b315b951ef584dc3c747df2e4b217fca971c7122864305b20f8fef07fb","last_command":"install","rollback_probes_verified":false,"probe_receipt_sha256":null};
    q12_guard schema present with exactly 4 tables
    (active_run,baseline,migration_guards,probe) and exactly 10 functions
    (assert_capability,assert_controller_binding,enforce_ddl_barrier,
    enforce_write_barrier,extend_guard,quiesce_client_backends,
    verify_activated_state,verify_capability,verify_expected_guards,
    verify_install_resume_state) and 1 event trigger
    (q12_guard_ddl_command_start); cron 0/8 active; `default_transaction_read_only`
    = on. `pnpm exec vitest run --config vitest.config.unit.ts
    tests/unit/ops/q12-live-real-barrier-cutover.test.ts` (MC2_Q12_REAL_PG17=1) ->
    1 passed (1), 114.96s.'
  - 'Test-harness gap found and fixed (fixture-only, not the barrier): the
    synthetic `cron.job` table in
    `fixtures/q12-live-real-barrier-cutover-runner.py`''s `SEED_SQL` was missing
    a `jobname` column (real Supabase pg_cron''s `cron.job` has a nullable
    `jobname text UNIQUE` column the barrier''s install Node runner''s cron-row
    validator requires as either null or string); its absence made `job.jobname`
    JS-`undefined`, which fails `job.jobname!==null` and threw "cron baseline
    row". Fixed by adding `jobname text UNIQUE` (left NULL by the seed INSERT,
    matching unnamed real cron jobs). This gap was invisible in every prior
    round because no prior round drove the real barrier''s install Node runner
    far enough to reach `publishInstallBaseline()``''s cron-row validation.'
  - 'No-docker regression (from packages/course-gen-platform,
    SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key
    pnpm exec vitest run --config vitest.config.unit.ts
    tests/unit/ops/q12-live-controller.test.ts tests/unit/ops/q12-live-cutover.test.ts
    tests/unit/ops/q12-retained-barrier-quiesce-seam.test.ts
    tests/unit/ops/q12-retained-barrier-w-composition-seam.test.ts): 303/303
    passed, 4 test files.'
  - '`pnpm exec tsc --noEmit` (packages/course-gen-platform) = 0 errors, exit 0.'
  - "Frozen bytes: q12-command-manifest.json
    aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841 (unchanged);
    q12-structural-catalog.sql
    0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e (unchanged).
    ONLY q12-database-barrier.sh changed: FINAL sha256
    3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9 (was
    134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68 at the
    round's base 6e86d5387; c063a71eee75404684aa1be23e4977266098eef4ed65aa1ec8e7b20e2a6b1f9a
    after the ACL fix c4c05d762 alone; the 3 further edits in this round produced
    the final 3673ee49… sha)."
  - 'Zero leftover docker: `docker ps -a` shows no q12-* containers after every
    run in this round (each disposable postgres:17.10-bookworm container and its
    /tmp run root were removed with `docker rm -f` + `shutil.rmtree` at the end
    of every harness invocation, including the diagnostic/debug runs used for
    root-causing).'
  - 'python3 scripts/orchestration/validate_artifact.py
    .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-barrier-pg17-acl-fix.md -> OK.'
changed_files:
  - deploy/qdrant/q12-database-barrier.sh
  - packages/course-gen-platform/tests/unit/ops/q12-live-real-barrier-cutover.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-barrier-cutover-runner.py
  - docs/superpowers/plans/2026-07-17-q12-live-controller.md
explicit_defers:
  - 'R4''s full validateTransition chain remains open: `q12-source-manifest.ts`''s
    `validateExactGuardDelta` hardcodes a 5-function q12_guard allowlist
    (assert_capability, enforce_write_barrier, extend_guard, verify_capability,
    verify_expected_guards) against the barrier''s real, current 10-function set
    (adds assert_controller_binding, enforce_ddl_barrier, quiesce_client_backends,
    verify_activated_state, verify_install_resume_state). This is a genuine,
    pre-existing, orthogonal drift, unrelated to any defect fixed in this round,
    surfaced only now because this is the first round to drive the real barrier
    install far enough for `capture` to reach that check. `q12-source-manifest.ts`
    is explicitly frozen/out of scope for this round; reconciling the allowlist
    is a separate, explicitly-scoped future round. Tracked in the plan''s "Open
    risks carried forward".'
  - "Cascade NOT executed in this round (orchestrator's next step, per this
    round's own scope): the FINAL barrier sha256
    (3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9) needs to
    replace `134255ce…` in the frozen-trio contract; the W-tuple field-4
    `activation_barrier_sha256` needs a Layer-1 amendment, and fields 5-9 need
    the repro-tool re-run against the new sha; a byte-verified server reinstall
    remains the team-lead's pre-window step. None of these were touched here."
---

# Summary

Completes the ratified frozen-barrier-fix round: the real, unmodified-except-for-
this-round `deploy/qdrant/q12-database-barrier.sh install` now reaches
`maintenance_guarded` END-TO-END against a full-Supabase-seeded, disposable real
PostgreSQL 17.10 source. Two stacked defect classes existed at the round's start
(one already fixed by the preceding round, one ratified for this round), and
fixing the ratified one (catalog-fd double consumption) uncovered two FURTHER,
previously-masked, bounded-class PG-dialect defects in the exact same function —
both fixed under the round's bounded-class pre-authorization, each independently
isolated and repro'd before touching the tracked file.

**Defect 1 (ACL array-type lockdown) — already fixed, preceding round, `c4c05d762`.**
`REVOKE ALL ON TYPE q12_guard.<name> FROM PUBLIC` iterated every `pg_type` row
including Postgres's four auto-generated array types; PG17 refuses
GRANT/REVOKE on array types outright ("cannot set privileges of array types"),
and even with that loop skipped, the untouched array type's default NULL
`typacl` resolves to PUBLIC=USAGE (grantee 0), which the residual owner-only
`EXISTS` check (without an array exclusion) also flagged. Fixed with
`typcategory <> 'A'` at all four owner-only ACL scan/loop sites.

**Defect 2 (catalog-fd double consumption) — this round's ratified FIX 1,
`q12-database-barrier.sh:361`.** The barrier opens the expected-catalog into a
single shared fd 13, then reads it TWICE: once via `cat <&13` (consumes the
shared open-file-description to EOF) for its own bash-side jq schema
validation, and once by fd number inside the install Node runner
(`fs.readFileSync(Number(catalogFd))`). The second read landed at EOF and
returned empty, so `set_config('megacampus.q12_expected_catalog','')` broke the
very first `current_setting(...)::jsonb` cast in tx1 with "invalid input
syntax for type json". Fixed by reading the bash-side copy via
`/proc/self/fd/13` (a fresh, independent file description that does not
disturb fd 13's shared offset) — matching the exact pattern the barrier
already uses at its other six catalog reads.

**Defect 3 (two further bounded-class PG-dialect fixes, found only after
Defects 1 and 2 stopped masking them, same expression, two sites: line 1303 in
`verify_install_resume_state()` and line 1613 in the prepare-recovery
readiness check).** (a) An operator-precedence bug: Postgres's additive `-`
binds tighter than `->`, so `saved->'database_settings' - 'setconfig'` parsed
as `saved -> ('database_settings' - 'setconfig')` — an ambiguous "unknown -
unknown" operator error between two untyped literals, not the intended
`(saved->'database_settings') - 'setconfig'`. Fixed with explicit parens.
(b) A missing scalar guard: with parsing now correct, the left operand is the
jsonb scalar `null` on every database's first-ever install (no
`pg_db_role_setting` row exists yet — the SAME `COALESCE(...,'null'::jsonb)`
sentinel the function already uses on the other side of the comparison), and
jsonb `-` refuses non-object operands ("cannot delete from scalar"). Fixed
with a `jsonb_typeof(...)='object'` guard around both operands, mirroring the
identical defensive pattern the SAME function already applies three times to
the sibling `->'database_settings'->'setconfig'` accesses. Both (a) and (b) are
minimal, execution-enabling, behavior-preserving PG-dialect mechanics fixes —
verified in isolation (null-vs-null → no drift; matching real row minus
setconfig → no drift; genuinely differing `setrole` → drift detected) before
touching the tracked file. Neither changes what is checked, the guard/type/
count sets, receipt shapes, identity pins, or ACL policy meaning.

A fourth, test-harness-only gap (not the barrier) was found and fixed:
the real-PG17 acceptance fixture's synthetic `cron.job` table was missing the
`jobname` column real Supabase `pg_cron` has (nullable), which the barrier's
own install-baseline validator requires present (as null or string). Fixed by
adding `jobname text UNIQUE` to the fixture's `SEED_SQL`.

The barrier's own real-PG17 acceptance test was rewritten to this round's
actual, narrower mandate (barrier reaches `maintenance_guarded`, not the full
R4 validateTransition chain) since `deploy/postgres/q12-source-manifest.ts` is
frozen/out of scope here and has its own, separate, pre-existing q12_guard
function-set drift (5 hardcoded vs. the barrier's real 10) — a genuine,
orthogonal, tracked-but-deferred finding, explicitly not fixed in this round.

# Verification

- Full round diff of `deploy/qdrant/q12-database-barrier.sh` from the round's
  base `6e86d5387` to HEAD: 5 hunks (line 361 fd fix; the four ACL
  `typcategory <> 'A'` sites from the preceding `c4c05d762`; the two
  precedence-fix + scalar-guard sites at 1303/1613 from this round).
- FD audit table independently re-verified (see `verification` list above):
  only fd 13 is both `cat <&`-consumed and re-read by number; fd 15's parallel
  consumption is safe (unused-extra-arg for install; separate dup fd 19 for
  the terminal runner).
- All three RED modes (ACL loop abort, ACL residual `_active_run|0|USAGE`,
  fd-consumption empty-catalog JSON error) reproduced via isolated SQL/fd
  repros against a disposable real PostgreSQL 17.10 container, independent of
  and prior to each fix.
- Two further latent defects (operator precedence; scalar-null guard) found,
  root-caused via `docker logs` on a kept-alive disposable container (the
  barrier swallows real errors by design), independently isolated and
  verified correct in minimal repros before editing the tracked file.
- GREEN: official vitest run of the real-PG17 acceptance test — 1 passed;
  barrier rc==0; receipt `state=="maintenance_guarded"`,
  `last_command=="install"`, `rollback_probes_verified==false`,
  `probe_receipt_sha256==null`; q12_guard schema present (4 tables, 10
  functions, 1 event trigger); cron 0/8 active; `default_transaction_read_only`
  ==on.
- No-docker regression 303/303 (q12-live-controller + q12-live-cutover +
  q12-retained-barrier-quiesce-seam + q12-retained-barrier-w-composition-seam).
- `pnpm exec tsc --noEmit` = 0.
- Frozen bytes: `q12-command-manifest.json` and `q12-structural-catalog.sql`
  byte-identical to before the round; only `q12-database-barrier.sh` changed
  (final sha256 `3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9`).
- Zero leftover docker containers after every run in this round.
- `validate_artifact.py` on this file -> OK.

# Risks / Follow-ups

- **Cascade not executed here (orchestrator's next step):** the FINAL barrier
  sha256 must replace `134255ce…` in the frozen-trio contract; the W-tuple
  field-4 `activation_barrier_sha256` needs a Layer-1 amendment, and fields 5-9
  need the repro-tool re-run against the new sha; a byte-verified server
  reinstall remains the team-lead's pre-window step.
- **`q12-source-manifest.ts` q12_guard function-set drift (found this round,
  explicitly out of scope, tracked in the plan's "Open risks carried
  forward"):** the tool's hardcoded 5-function allowlist no longer matches the
  barrier's real 10-function install surface. This is why the harness's
  diagnostic `capture` step (not asserted on by this round's test) still fails
  with "unexpected baseline-to-cutover delta: q12_guard function set" even
  though the barrier itself now reaches `maintenance_guarded` cleanly. Full R4
  closure needs a separate, explicitly-scoped round touching
  `q12-source-manifest.ts`.
- **Bounded-class scope judgment flagged for reviewer attention:** the scalar-
  null guard fix (Defect 3b) required a design judgment — that "no
  `pg_db_role_setting` row on either side" should compare as "no drift" — which
  is inferred from the function's own established sibling pattern (three
  existing `CASE WHEN jsonb_typeof(...)` guards in the identical function) and
  verified correct in 3 isolated cases (null-vs-null, matching real row, and a
  genuine `setrole` drift) before being applied. This is reported prominently
  because it sits closer to the plumbing/semantics boundary than the other
  fixes in this round; the orchestrator may want to specifically re-review
  this one hunk.
