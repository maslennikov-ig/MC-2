---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-r8b-2-ii-defrost
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform
base_commit: 81d83c9f5
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: >-
  Committed in place on the existing isolated worktree/branch (codex/q12-live-controller); NOT
  pushed. No new worktree/branch created. All real-PG17 repros stand up uniquely-named disposable
  postgres:17.10-bookworm containers (mc2-q12-cronloop-*, mc2-q12-r8b2i-src-*, inv14-* isolation
  probes) torn down in finally/trap blocks; no persistent state, no shared/production DB, no Qdrant
  Cloud, no prod server. The deployed SERVER barrier is deliberately NOT reinstalled (stays
  3673ee49...) pending the team-lead's pre-rehearsal batch (explicit defer). Gated tests SKIP
  without MC2_Q12_REAL_PG17=1, so ordinary CI touches no docker.
risk_level: high
docs_reviewed: updated
docs_review_notes: >-
  W-tuple artifact mc2-jz6y0.13.10-q12-w-activation-tuple.md amended: fields {4,5,6} succession
  (field 4 -> bdb9d935..., fields 5/6 -> the #13-moved values), a new "2026-07-19 AMENDMENT"
  section records the full provenance and the {7,8,9,10} byte-identical proof. The plan
  implementation log (docs/superpowers/plans/2026-07-17-q12-live-controller.md) gains the defrost
  round entry. No design decision changed: the barrier operations were already ratified; this round
  only corrects two real PG17 defects in the frozen bytes under the ratified defrost sequencing.
  The sha sweep leaves dated historical round-logs (r5b/r5d/r5e/r8i/cascade.md, which record
  "frozen bytes byte-identical" true AT THAT round) unrewritten; only the authoritative current
  field-4 (CI-load-bearing, read by q12-w-tuple-frozen-byte-guard.test.ts) is updated.
graph_reviewed: no-change-needed
graph_review_notes: >-
  Change is a two-line + one-block edit to the frozen barrier script (bug fixes, no new
  edges/surface) plus test-harness/artifact/doc edits. No change to
  deploy/qdrant/q12-lifecycle-core.py or any W-owned file. The local graph already models the
  barrier/harness lineage at the right granularity. Delegated-worktree stream; no local Graphify
  refresh performed here.
verification:
  - 'Branch codex/q12-live-controller for every commit; base_commit 81d83c9f5. Round commits:
    bc765ba56 (RED repro #13) -> c433bcfc0 (fix #13, barrier cb4c4f4a) -> ba02f3bdd (fix #14, barrier
    bdb9d935) -> 28aafa738 (R8-B-2-ii GREEN + #14 probe). HEAD barrier sha256 bdb9d935e3c09fb01503ba9
    d016f36a9cf94db5539dfcdc73c1692eb442925ce.'
  - 'Found-defect #13 RED->GREEN (gated MC2_Q12_REAL_PG17=1,
    tests/unit/ops/q12-cron-restore-loop-ambiguity.test.ts): against the frozen barrier (3673ee49)
    the barrier-binding assertion fails (fix_present_in_barrier=false) and the OLD unaliased UPDATE
    raises `column reference "job" is ambiguous`; against the aliased fix the test passes (old form
    ambiguous, new form clean, active restored). Independently re-run both directions.'
  - 'Found-defect #14 localization independently reproduced on disposable postgres:17.10: a plpgsql
    trigger mirroring the active_run allow-branch, attached BEFORE UPDATE to a run_id-less table with
    the TG_TABLE_NAME=active_run guard FALSE, raises `record "old" has no field "run_id"` (CONTEXT
    naming the IF expression); a run_id-bearing control table updates clean. Barrier bytes confirm the
    failing write is the activate self-test UPDATE on q12_guard.baseline (:1795), uncaught by the
    P0001-only $activation_guard$ handlers (:1791/:1797/:1803).'
  - 'Found-defect #14 GREEN (gated, tests/unit/ops/q12-live-real-verify-chain.test.ts, 1 passed
    ~119s): real PG17.10 install (maintenance_guarded) -> verify-after-base
    (20260711140000_guard_verified) -> verify-after-observability (20260711151000_guard_verified) ->
    prepare-recovery (recovery_ready_guarded) -> activate REACHES `activated` (rc0, receipt
    last_command=activate, rollback_probes_verified=true, activated=true, cron restored to 8 active,
    read_only off). Anti-weakening probe: post-activate, each q12_guard-table write (active_run
    non-flip, baseline, migration_guards) still trips SQLSTATE P0001 "Q12 durable guard truth is
    append-only" and NONE regresses to 42703 -- exercising the REAL installed enforce_write_barrier.'
  - 'Cascade hard-stop gate (RULING 3): node
    .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-activation-tuple-repro.cjs against the final
    barrier bytes -> field 5 = 4aec7a61... (8872 bytes), field 6 = 0c8eed33... (8655 bytes) MOVED
    (from #13, +33B each); fields 7 c41cf104.../8 cbfa2f09.../9 26163c33.../10 f2bb0bee... BYTE-
    IDENTICAL to the frozen baseline; the three tracked JSON assets unchanged (git status clean after
    the re-run). Ratified union {4,5,6} moved, {7,8,9,10} identical -- no motion beyond {4,5,6}.'
  - 'CI frozen-byte guard (tests/unit/ops/q12-w-tuple-frozen-byte-guard.test.ts, no docker) -> 3
    passed: field 4 read from the amended tuple artifact equals sha256(barrier)=bdb9d935...; the
    discrimination sub-assertions (tuple != historical 134255ce, deliberately-wrong sha != real)
    still hold.'
  - 'Frozen/W-owned scope: git diff --stat 81d83c9f5..HEAD over q12-command-manifest.json (aaec6fc2),
    q12-structural-catalog.sql (0b8a943f), q12-writer-resume.py, source-recovery-run.sh,
    q12-source-manifest.ts, and deploy/qdrant/q12-lifecycle-core.py -> EMPTY (all untouched). The only
    frozen-artifact byte change this round is q12-database-barrier.sh (the ratified #13 two lines +
    the ratified #14 nested-IF block, scope-limited to :1727-1728 and :1056-1064).'
changed_files:
  - deploy/qdrant/q12-database-barrier.sh
  - packages/course-gen-platform/tests/unit/ops/q12-cron-restore-loop-ambiguity.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-cron-restore-loop-ambiguity-runner.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-real-verify-chain.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-verify-chain-runner.py
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w-activation-tuple.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r8b-2-ii-defrost.md
  - docs/superpowers/plans/2026-07-17-q12-live-controller.md
explicit_defers:
  - "SERVER barrier reinstall: the deployed barrier stays 3673ee49... (pre-defrost). Reinstalling the
    new bdb9d935... bytes on the server is the team-lead's pre-rehearsal step, NOT done here. Until
    then the deployed barrier still carries both #13 and #14 latent defects; a real server activate
    would abort on #14 -- so no server activate may run before the reinstall."
  - 'Fields 5/6/8/9 production re-freeze (W-tuple checklist item 2, Task C7): fields 5/6 remain
    TEST-CATALOG-bound Layer-1 values (now reflecting the defrosted barrier); the production catalog
    re-freeze at the live boundary is unchanged and remains open.'
  - "Dedicated frozen-byte review of this defrost round is the team-lead's next step (RULING 3): one
    pass covering the whole round against the final barrier byte-state (bdb9d935)."
---

# Summary

The **R8-B-2-ii defrost round** re-froze the Q12 database barrier
(`deploy/qdrant/q12-database-barrier.sh`) for two real PostgreSQL 17.10 production
defects surfaced during the R8-B real-execution rounds — the ninth and tenth
frozen-artifact defects of the program. Both were independently reproduced on
disposable `postgres:17.10-bookworm` before any edit, fixed with the exact ratified
byte-changes, and proven GREEN end-to-end on real PG17. The barrier sha256 moves
`3673ee49…` → `bdb9d935…`; no other frozen-artifact or W-owned file changed.

**Found-defect #13 — cron.job restore-loop ambiguity.** `write_restore_sql` (shared
by `activate` + `rollback`) restored each captured cron job with an UNALIASED
`UPDATE cron.job` inside a plpgsql `FOR job IN …` loop. Under the default
`plpgsql.variable_conflict=error`, `job` in `(job->>'active')`/`(job->>'jobid')` is
ambiguous between the loop variable and the implicit whole-row alias of the
`cron.job` target, raising `column reference "job" is ambiguous` and aborting real
activate/rollback in the restore loop. **Ratified fix (a):** alias the target —
`UPDATE cron.job AS restore_target SET active=(job->>'active')::boolean WHERE
restore_target.jobid=(job->>'jobid')::bigint;` (:1727-1728, +33B). This edit is in
the `activate` SQL projection / NORMAL slice → moved W-tuple fields **5 and 6**.

**Found-defect #14 — enforce_write_barrier OLD.\* short-circuit (#13-class).**
`enforce_write_barrier()` is one shared trigger function attached to every guarded
relation plus the internal `q12_guard` tables. Its allow-branch read
`OLD.singleton/run_id/capability_sha256/expected_catalog_sha256/expected_catalog`
in a single IF expression whose leading `TG_TABLE_NAME='active_run' AND
TG_OP='UPDATE'` terms do NOT short-circuit the row-field resolution under PG17.10.
On the activate self-test UPDATE of the `run_id`-less `q12_guard.baseline` (:1795),
`OLD.run_id` is still evaluated and raises SQLSTATE `42703` `record "old" has no
field "run_id"`; the `$activation_guard$` self-test handlers catch only `P0001`, so
the field error escapes and aborts real `activate` before `activated`.
`migration_guards` (:1801) shared the latent hazard. **Ratified fix (Candidate A):**
nest the `OLD.*` comparisons under an outer `IF TG_TABLE_NAME='active_run' AND
TG_OP='UPDATE' THEN … END IF;` with fall-through to the append-only RAISE
(:1056-1064). A `baseline`/`migration_guards` UPDATE now never evaluates
`OLD.run_id` and falls to the P0001 RAISE (which the self-tests catch); the
`active_run` non-flip self-test still lands on P0001 via inner fall-through, so the
guard is not weakened. This edit is in `write_install_sql` (the function
definition), which is NOT part of the `activate` projection → moved W-tuple field
**4 only**.

Sequencing followed RULING 3: the RED repro + #13 fix committed first (so the fix
could not be lost from an uncommitted tree), #14 investigated read-only/repro-only
and ratified (Candidate A) before any second edit, GREEN landed after #14, and the
W-tuple CASCADE ran ONCE against the final barrier byte-state.

# Verification

Real-PG17 evidence (each on a uniquely-named disposable `postgres:17.10-bookworm`,
torn down in a finally/trap; no shared/prod DB; secrets stdin-only):

- **#13 RED/GREEN** — `q12-cron-restore-loop-ambiguity.test.ts` (gated). RED against
  the frozen barrier (`3673ee49`): `fix_present_in_barrier=false`; the OLD unaliased
  form raises `column reference "job" is ambiguous`. GREEN against the aliased fix:
  old form ambiguous, new aliased form clean, captured `active` restored. Committed
  RED-first (against frozen bytes) then GREEN (bc765ba56 → c433bcfc0).
- **#14 localization** — independent minimal repro: a plpgsql trigger mirroring the
  allow-branch, attached BEFORE UPDATE to a `run_id`-less table with the
  `TG_TABLE_NAME='active_run'` guard FALSE, raises `record "old" has no field
"run_id"` (CONTEXT names the IF expression); a `run_id`-bearing control updates
  clean. Barrier bytes confirm the firing write is the `q12_guard.baseline` self-test
  UPDATE (:1795), uncaught by the P0001-only handlers.
- **#14 GREEN** — `q12-live-real-verify-chain.test.ts` (gated, 1 passed ~119s):
  install → verify-after-base → verify-after-observability → prepare-recovery
  (`recovery_ready_guarded`) → activate REACHES `activated` (rc0; receipt
  `last_command=activate`, `rollback_probes_verified=true`; `activated=true`, cron
  restored to 8 active, `read_only` off). Anti-weakening probe: post-activate, each
  `q12_guard`-table write still trips `P0001` "Q12 durable guard truth is append-only"
  and NONE regresses to `42703` — the REAL installed `enforce_write_barrier`, proving
  the fix preserved the append-only guarantee for the `run_id`-less tables.
- **Cascade hard-stop gate (RULING 3)** — `mc2-jz6y0.13.10-activation-tuple-repro.cjs`
  against the final barrier bytes: field 5 `4aec7a61…` (8872 B) and field 6
  `0c8eed33…` (8655 B) MOVED (from #13, +33B each); fields 7 `c41cf104…`, 8
  `cbfa2f09…`, 9 `26163c33…`, 10 `f2bb0bee…` BYTE-IDENTICAL; the three tracked JSON
  assets unchanged (`git status` clean after re-run). Ratified union {4,5,6} moved,
  {7,8,9,10} identical — no motion beyond {4,5,6}.
- **CI frozen-byte guard** — `q12-w-tuple-frozen-byte-guard.test.ts` (no docker): 3
  passed. Field 4 read from the amended tuple artifact equals `sha256(barrier) =
bdb9d935…`; discrimination sub-assertions still hold.
- **Frozen/W-owned scope** — `git diff --stat 81d83c9f5..HEAD` over the manifest
  (`aaec6fc2`), structural catalog (`0b8a943f`), `q12-writer-resume.py`,
  `source-recovery-run.sh`, `q12-source-manifest.ts`, and
  `deploy/qdrant/q12-lifecycle-core.py` → EMPTY. The only frozen-artifact byte change
  is `q12-database-barrier.sh` (the two ratified regions).

# Risks / Follow-ups

- **SERVER reinstall pending (explicit defer).** The deployed barrier still runs the
  pre-defrost `3673ee49…` bytes and therefore still carries both #13 and #14 latent
  defects. A real server `activate` would abort on #14; NO server activate may run
  before the team-lead's pre-rehearsal reinstall of `bdb9d935…`. This tuple/CI-guard
  pins the REPO bytes only.
- **Dedicated frozen-byte review (team-lead, next).** RULING 3 reserves one dedicated
  frozen-byte review covering the whole defrost round against the final barrier state
  (`bdb9d935…`) before any downstream merge/rehearsal.
- **Fields 5/6/8/9 production re-freeze unchanged.** W-tuple checklist item 2 (Task
  C7) stays open; fields 5/6 remain TEST-CATALOG-bound Layer-1 values (now reflecting
  the defrosted barrier); the production catalog re-freeze at the live boundary is
  unaffected.
- **Rollback-only predecessor-gate tension (carried note).** The rollback predecessor
  gate expects `rollback_probes_verified=false` while the barrier writes `true`; this
  did not bite the forward activate path this round and remains a note unless it
  surfaces on a real rollback exercise.
- **sha sweep discipline.** Dated historical round-logs referencing `3673ee49…`
  (r5b/r5d/r5e/r8i-a/r8i-c/r8b-2-i/cascade.md/source-manifest-round-review) were true
  at those rounds and are left unrewritten; only the authoritative current field-4
  (CI-load-bearing) was updated to `bdb9d935…`, with the succession recorded in the
  W-tuple 2026-07-19 amendment.
