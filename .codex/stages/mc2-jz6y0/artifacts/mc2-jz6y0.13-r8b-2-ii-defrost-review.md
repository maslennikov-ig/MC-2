---
schema_version: orchestration-artifact/v1
artifact_type: review
task_id: mc2-jz6y0.13-r8b-2-ii-defrost-review
stage_id: mc2-jz6y0
repo: https://github.com/maslennikov-ig/MC-2.git
branch: codex/q12-live-controller
base_branch: master
base_commit: 81d83c9f5
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: 'Read-only frozen-byte review; single write is this artifact. No code/config modified, no server/db/docker command run.'
risk_level: low
verification:
  - "Reviewed range 81d83c9f5..adc927305 (5 commits) via git show/diff; every byte-level claim verified independently, execution claims relied on the team-lead's re-runs per the constraint."
  - 'Frozen-byte succession recomputed INDEPENDENTLY: OLD barrier @81d83c9f5 = 3673ee49…; interim #13-only @c433bcfc0 = cb4c4f4abea083aade…; FINAL @adc927305 = bdb9d935e3c09fb01503ba9d016f36a9cf94db5539dfcdc73c1692eb442925ce — the FINAL matches the ratified target exactly.'
  - 'Diff is EXACTLY 10 insertions / 9 deletions in one file (q12-database-barrier.sh) across two regions (#14 enforce_write_barrier :1053-1066; #13 cron restore UPDATE :1725-1728); nothing else. manifest aaec6fc2 + catalog 0b8a943f byte-identical; W-owned files (q12-writer-resume.py, source-recovery-run.sh, q12-source-manifest.ts) and q12-lifecycle-core.py untouched in the range.'
  - "#14 SEMANTIC EQUIVALENCE proven: the nested plpgsql form short-circuits procedurally — the inner IF carrying the OLD.* reads (incl. OLD.run_id) is evaluated ONLY when the outer IF TG_TABLE_NAME='active_run' AND TG_OP='UPDATE' is true, so non-active_run (run_id-less) tables NEVER evaluate OLD.run_id (no 42703). The RETURN-NEW row set is identical to the intended old behavior {active_run legal activated-flip UPDATE ∪ migration_guards INSERT}; every other q12_guard write → the terminal RAISE 'Q12 durable guard truth is append-only' (P0001), INCLUDING an active_run UPDATE with any failed inner condition (outer true → inner false → fall-through RAISE), the :1789 self-test dependency. The :1055 migration_guards INSERT branch is byte-unchanged (context line)."
  - "#13 alias correctness: UPDATE cron.job AS restore_target resolves the plpgsql variable_conflict=error ambiguity between the loop variable `job` (jsonb) and the table `cron.job`; `job->>…` is now unambiguously the loop var and `restore_target.jobid` the column, with identical UPDATE semantics (same row set / same value). The IF NOT FOUND and the current_job exact-row drift-check lines are byte-unchanged. Fires in write_restore_sql (shared by activate + rollback). The added bytes are ` AS restore_target` (18) + `restore_target.` (15) = 33, matching the W-tuple fields 5/6 '+33B' exactly."
  - "Anti-weakening probe (q12-live-real-verify-chain.test.ts + runner): under `\\set VERBOSITY verbose`, it drives an active_run non-flip UPDATE, a baseline write, and a migration_guards write post-activate against the REAL installed function and asserts each stderr contains 'Q12 durable guard truth is append-only' — the exact P0001 RAISE message, which is unique to the append-only guard and excludes the pre-#14 42703 'record \"old\" has no field \"run_id\"' regression (whose message differs). VERBOSITY verbose also surfaces the SQLSTATE in stderr."
  - "CASCADE verified against the W-tuple artifact mc2-jz6y0.13.10: field 4 activation_barrier_sha256 = bdb9d935… (= the recomputed FINAL barrier sha) with the full 134255ce→3673ee49→cb4c4f4a→bdb9d935 succession + the server-copy defer noted; fields 5/6 AMENDED to 4aec7a61…/0c8eed33… (+33B each, MOVED by #13's activate-projection cron alias; #14 zero motion here); fields 7/8/9/10 stated BYTE-IDENTICAL (c41cf104…/cbfa2f09…/26163c33…/f2bb0bee…); field 11 untouched. The 2026-07-19 amendment records #13+#14 provenance."
  - 'CI guard q12-w-tuple-frozen-byte-guard.test.ts binds field 4 DYNAMICALLY (extracts activation_barrier_sha256 from the tuple artifact and asserts it equals sha256 of the real barrier script bytes) — stronger than a hardcoded expectation; green because both = bdb9d935 (team-lead re-ran 3/3).'
  - "SHA sweep: no authoritative CURRENT reference in deploy/**, packages/** hardcodes 3673ee49; the only 3673ee49 references are historical .codex round-logs/reviews (recording the then-current sha, correctly left un-rewritten) and the W-tuple succession-history provenance (current field 4 = bdb9d935). The deployed SERVER barrier stays 3673ee49 pending the team-lead's pre-rehearsal reinstall (explicit defer)."
  - "Did NOT run the vitest suite or any server/db/docker command (constraint); relied on the team-lead's re-runs (real-PG17 install→…→activate rc0 last_command=activate, 1 passed 122s; CI guard 3/3) for execution claims — all byte-level claims verified above."
changed_files:
  - deploy/qdrant/q12-database-barrier.sh
  - packages/course-gen-platform/tests/unit/ops/q12-live-real-verify-chain.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-verify-chain-runner.py
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w-activation-tuple.md
  - packages/course-gen-platform/tests/unit/ops/q12-w-tuple-frozen-byte-guard.test.ts
explicit_defers:
  - "P3 (confidence low): the anti-weakening probe asserts the exact P0001 RAISE message ('Q12 durable guard truth is append-only'), which is unique to the append-only guard and cleanly excludes the 42703 regression, and it runs under VERBOSITY verbose (so the SQLSTATE is in stderr) — but it does not additionally assert the literal SQLSTATE code 'P0001'. The message assertion is sufficient and unambiguous today; for a frozen-integrity gate, an explicit SQLSTATE=='P0001' assertion would be marginally more robust against a future message-text reword."
  - "Informational: the deployed SERVER barrier remains 3673ee49 (the repo is now bdb9d935); the byte-verified pre-rehearsal server reinstall is the team-lead's explicit deferred step, correctly recorded in the W-tuple field-4 note and the amendment."
  - "Informational: the known pre-existing supabase-restore-drill.test.ts 'exact guard multiset' failure (tracked separately in Beads) was NOT independently reproduced here (it needs a real run); per the brief it fails identically at the pre-round barrier and is out of this round's scope — not re-flagged as a round defect."
---

# Summary

**Correctness / compliance verdict: PASS.** **Quality / improvement verdict: PASS.**
**No P0, no P1.** This maximum-scrutiny frozen-barrier defrost is minimal (exactly
10/9, two regions), semantically equivalent, and cascade-complete. Findings: one low
P3 (a probe robustness nicety) and two informational notes (the deferred server
reinstall; the disclosed pre-existing drill failure) — none blocks the merge.

The two defect fixes are both correct and behavior-preserving relative to the
_intended_ barrier semantics: #14 moves the `OLD.*` field reads inside a nested plpgsql
`IF TG_TABLE_NAME='active_run' AND TG_OP='UPDATE' THEN` so a run_id-less q12_guard table
never resolves `OLD.run_id` (the 42703 escape that broke `activate`), while the
RETURN-NEW row set stays exactly `{active_run legal flip ∪ migration_guards INSERT}` and
everything else raises the P0001 append-only guard; #13 aliases the restore UPDATE as
`restore_target` to resolve the `variable_conflict=error` ambiguity between the loop
variable `job` and the table `cron.job`, with identical UPDATE semantics. The final
barrier sha `bdb9d935…` was recomputed independently and matches the ratified target,
the W-tuple cascade (field 4 + the #13-moved fields 5/6 + byte-identical fields 7-11) is
recorded correctly, and the CI guard dynamically binds field 4 to the real barrier bytes.

# Verification

## Frozen-byte integrity and scope

The diff is exactly 10 insertions / 9 deletions in `q12-database-barrier.sh` across the
two ratified regions; `manifest` (`aaec6fc2`) and `catalog` (`0b8a943f`) are byte-identical;
W-owned files and `q12-lifecycle-core.py` are untouched. The sha succession is recomputed
independently: `3673ee49` (base) → `cb4c4f4a` (interim #13) → `bdb9d935` (final #13+#14),
the last matching the ratified target.

## #14 — semantic equivalence (highest scrutiny)

plpgsql `IF` is procedural: the inner `IF (8 field conditions) THEN RETURN NEW; END IF;`
is only evaluated when the outer `IF TG_TABLE_NAME='active_run' AND TG_OP='UPDATE'` is
entered. Enumerating every input on a q12_guard table:

- active_run UPDATE, legal activated-flip → outer true, inner true → RETURN NEW (== old).
- active_run UPDATE, any inner condition false → outer true, inner false → fall through to
  RAISE P0001 (== old's fall-through; the `:1789` self-test depends on this).
- non-active_run table, or active_run non-UPDATE → outer false → the inner IF and its
  `OLD.run_id`/`OLD.*` reads are NEVER evaluated → RAISE P0001. **This is the fix:** the
  old single SQL `AND` expression evaluated `OLD.run_id` on run_id-less tables (PG does not
  guarantee AND short-circuit of a record field selection), raising 42703 and escaping the
  P0001-only handlers.
- migration_guards INSERT → RETURN NEW (branch byte-unchanged).

So the RETURN-NEW row set is identical to the _intended_ old behavior, and the 42703
escape is eliminated; the change is semantically equivalent and strictly corrective.

## #13 — alias correctness

`UPDATE cron.job AS restore_target SET active=… WHERE restore_target.jobid=…` renames the
target relation's range-table to `restore_target`, so `job->>…` is unambiguously the loop
variable and `restore_target.jobid` the column — resolving the `variable_conflict=error`
ambiguity without changing which rows are updated or to what. The `IF NOT FOUND` and the
`current_job` exact-row drift check are byte-unchanged. Added bytes = 33 (` AS
restore_target` + `restore_target.`), matching the W-tuple fields 5/6 `+33B`.

## Anti-weakening probe

Under `\set VERBOSITY verbose`, the probe drives an active_run non-flip UPDATE, a baseline
write, and a migration_guards write against the REAL installed function post-activate and
asserts each stderr contains `Q12 durable guard truth is append-only` — the exact P0001
RAISE message, unique to the append-only guard, which excludes the pre-#14 42703
`record "old" has no field "run_id"` regression (different message). Genuine SQLSTATE-level
proof of the fix (see P3 on the code-vs-message nicety).

## Cascade

W-tuple `mc2-jz6y0.13.10`: field 4 = `bdb9d935…` (the recomputed final sha) with the full
succession + server-copy defer; fields 5/6 amended `4aec7a61…`/`0c8eed33…` (+33B each,
moved by #13's activate-projection alias; #14 zero motion here); fields 7/8/9/10 stated
byte-identical; field 11 untouched; the 2026-07-19 amendment records #13+#14 provenance.
The CI guard reads field 4 from the artifact and asserts it equals `sha256(barrier)` — a
dynamic bind (stronger than a hardcode), green at `bdb9d935`. SHA sweep: no authoritative
current test/code reference still claims `3673ee49`; only historical `.codex` round-logs
(correctly left) and the W-tuple provenance history reference it, plus the deferred server
copy.

# Risks / Follow-ups

- **P3 (confidence low) — probe asserts message, not the explicit SQLSTATE code.** The
  anti-weakening probe proves P0001-not-42703 via the exact RAISE message (unique to the
  guard) under VERBOSITY verbose. Sufficient today, but for a frozen-integrity gate an
  explicit `SQLSTATE=='P0001'` assertion would be marginally more robust against a future
  message reword. Nicety only.

- **Informational — deferred server reinstall.** The deployed server barrier is still
  `3673ee49`; the repo is `bdb9d935`. The byte-verified pre-rehearsal server reinstall is
  the team-lead's explicit deferred step, correctly recorded in field-4's note.

- **Informational — pre-existing drill failure.** The known `supabase-restore-drill.test.ts`
  'exact guard multiset' failure is tracked separately and (per the brief) fails identically
  at the pre-round barrier; not independently reproduced here and out of this round's scope.
