---
schema_version: orchestration-artifact/v1
artifact_type: review
task_id: mc2-jz6y0.13-r8b-2-iv-2-review
stage_id: mc2-jz6y0
repo: https://github.com/maslennikov-ig/MC-2.git
branch: codex/q12-live-controller
base_branch: master
base_commit: 2d845235b
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: 'Read-only pre-merge closing review of the codex/q12-live-controller range; the single write is THIS artifact, deposited into the self-hosted-qdrant-platform STAGE worktree per the artifact-location policy. No code/config modified, no server/db/docker command run.'
risk_level: low
verification:
  - "Reviewed range ab0d8865b..2d845235b (6 commits: crash+refusal triple ef518f4d9/28cd13dc3/d0f30b987 + cleanup-recovery triple d4c390b65/eb20896f2/2d845235b) via git show/diff; every byte-level claim verified independently. Execution claims (b' probe 235.4s, coordinator 233.7s + fixtures 30/30 + tsc 0, crash+refusal ~112s) relied on the team-lead's re-runs per the read-only constraint."
  - 'WHOLE-RANGE (Duty 5): ZERO deploy diff (git diff --stat -- deploy/ → no output, re-verified). At tip 2d845235b, barrier q12-database-barrier.sh = bdb9d935…, command-manifest = aaec6fc2…, structural-catalog = 0b8a943f…, AND q12-lifecycle-core.py (3bffa8ae…), q12-writer-resume.py (49ef1a07…), source-recovery-run.sh (9b0b5d53…), q12-source-manifest.ts (902cd6a1…) are ALL byte-identical at base ab0d8865b and tip. Clean TDD splits: RED ef518f4d9 (composed test only) → GREEN 28cd13dc3 (composed runner + full-window crash seam); RED d4c390b65 (cleanup test only) → GREEN eb20896f2 (cleanup runner only).'
  - "CRASH SEAM ADDITIVE/GATED (Duty 1): the crash injection hooks an EXISTING core extension point — q12-lifecycle-core.py:1589 already reads `after_journal_fsync = getattr(self.executor, 'after_journal_fsync', None)` (unchanged, deploy diff empty). The harness RealClaimExecutor.after_journal_fsync raises ONLY when crash_at_claim AND outcome=='capability_claimed'; crash_at_claim defaults False and MC2_Q12_FW_CRASH_AT_CLAIM is set by the launcher ONLY for the targeted command_id (RealBarrierWrapperExecutor.crash_operation defaults None). No production-path perturbation; iv-PART-1 behaviour intact when unset."
  - "CRASH+REFUSAL (Duty 1, composed-recovery test — real twin of fixture q12-live-controller.test.ts:1102-1145): asserts crash_rc==2 with 'injected delegated restart at claim-row'; crashed_head EXACTLY {barrier.install, capability_claimed, cutover} with the tail last row = barrier.install/capability_claimed/cutover and NO barrier.install/completed row (the real install barrier never executed — the crash raises AFTER the durable claim row, before execute()). Then refusal_rc==2 with 'recover does not support resuming from', 'command=barrier.install', 'outcome=capability_claimed', AND the EXACT R5-D2 standalone-supervisor pointer 'q12-live-cutover.sh install'; journal_byte_unchanged==true AND journal_after_refusal_sha256==journal_after_crash_sha256 (the durable journal is byte-for-byte unchanged). The test HONESTLY documents (per #18) that the recovery-epoch convergence tail is NOT asserted here because the frozen barrier install pins the checkpoint to lease_epoch=='cutover' (:420-433)."
  - "CLEANUP-RECOVERY CONVERGENCE (Duty 2, cleanup-recovery test — fixture head-8 :1046 made real): TWIN = 81-row oracle whose cleanup segment is exactly [intent, capability_issued, capability_claimed, capability_completed, accepted] all cutover. CRASH: crash_rc==2 'injected crash mid-cleanup at barrier.cleanup/capability_claimed/cutover'; crashed_rows length 79 (76 forward + 3 cleanup); crash head EXACTLY barrier.cleanup/capability_claimed/cutover; the crashed cleanup slice reached exactly intent→capability_issued→capability_claimed and NEVER capability_completed. RECOVER: recover_rc==0; recovered length 81 with explicit arithmetic recovered.length == twin.length == CRASH_ROWS+2; recovered[0:79] byte-identical to the crashed rows (.toEqual); appended EXACTLY [capability_completed/cutover, accepted/cutover]; recovery_reacquired ABSENT (asserted); EVERY recovered row lease_epoch=='cutover'. The crash raises via the EXISTING core execute_barrier_cleanup seam (:3503) between the claimed and completed rows, before super().execute_barrier_cleanup runs the real barrier cleanup child; recover feeds database-barrier-input-checkpoint-cleanup-cutover.json."
  - "CONVERGENCE UNDER EXISTING EXCLUSIONS ONLY (Duty 2 key requirement): the cleanup-recovery test's BLESSED_EXCLUSIONS (capability_manifest_sha256, entry_hash, previous_hash, resource_manifest_sha256) and all three helpers (withoutBlessedExclusions / withParityExclusions[+writers.resume.forward accepted→accepted_object_sha256] / withConvergenceExclusions[+barrier.cleanup→command_sha256+accepted_object_sha256]) are BYTE-EQUIVALENT to the established q12-live-controller.test.ts set — ZERO new exclusions. The primary oracle recovered_rows.map(withConvergenceExclusions).toEqual(twin_journal.map(withConvergenceExclusions)) converges +0 under those existing exclusions only."
  - "REAL CLEANUP CHILD + R8-B-1 SEAM during RECOVER (Duty 2): activate_archive_state=='activated'; the INDEPENDENT live query guard_residue_db == {schema:0, relation:0, function:0, event_trigger:0} (real DROP q12_guard, not the proof self-report); capability_exists_after==false (controller deleted it); the terminal accepted cleanup row binds accepted_object_sha256==v2_receipt_sha256 with v2_receipt_keys == the exact 10-key V2_RECEIPT_KEYS (== the W forward-resume gate) and the v2 field values (state guard_cleanup_complete, zero_guard_residue, database_capability_deleted); the receipt-validating resume ran (post_activate_cleanup_status 'guard_cleanup_complete', resume 'resumed', post_activate_resume_validated_sha256==v2_receipt_sha256). NB: child_executions==0 on the recover leg is BY DESIGN (recover drives only the cleanup segment via --real-cleanup, not launch_claim) — the real-cleanup-ran evidence is the independent residue/capability/v2 side-effects, which is stronger than a self-reported counter."
  - 'SHARED-QUIESCE_MANIFEST_PATH FIX (Duty 3): the cleanup-recovery runner writes ONE fw._write_quiesce_manifest(shared_quiesce, RUN_ID) at shared_scratch/''writer-quiesce.json'' and points BOTH twin_provision and crash_provision at it (quiesce_path=shared_quiesce). This pins a single quiesce-manifest path so the <quiesce-manifest> substitution that feeds command_sha256 on source.forward (core :729 `"<quiesce-manifest>": quiesce_manifest_path`, the iv-1 precedent) yields identical command_sha256 across the twin and the crash/recover run, enabling the +0 byte-convergence. It is entirely harness-side (the frozen core substitution is untouched; deploy diff empty).'
  - "DECISION-2 DOCS BYTE-CITES HOLD (Duty 4, spot-verified at the bytes): install pins its input checkpoint filename to -install-cutover.json AND jq-requires lease_epoch=='cutover' (barrier :420-433); input_checkpoint_file defaults EMPTY (:416) and is assigned ONLY for install (:420) and cleanup/rollback (:582, where the epoch matches ^cutover(-recovery-[1-9][0-9]*)?$ at :580 — the sole recovery-epoch branch, :444-598) — verify-*/prepare-recovery/activate consume no per-leg input checkpoint. Controller: OPERATIONS (:27-33) = (install, verify-after-base, verify-after-observability, prepare-recovery, activate) — barrier.cleanup NOT present; run_supervisor rejects any chain whose operation ∉ OPERATIONS ('chain operation mismatch', :4059-4060); publish_cleanup_capability pins CLEANUP_COMMAND_ID--cutover.json with hardcoded lease_epoch 'cutover' (:1797, driver :1791-1838). All cited references point at content that says what the docs claim."
  - "DOCS WORDING + POINTER + REHEARSAL PIN (Duty 4): the design diff is PURELY ADDITIVE (no `-` lines) — a §5.5 ADDENDUM and a §6b.6 NOTE that match the ratified operator-truth wording (forward mid-crash → NAMED fail-closed refusal or window ABORT via rollback where the predecessor gate permits, else manual runbook — not a forward supervisor re-claim; cleanup mid-crash → recover under cutover, +0; the recovery-epoch composed +2 story is W-side/server-custody). The R5-D2 pointer TEXT is UNCHANGED (additive-only; the addendum merely records that following it on a forward crash yields a named fail-closed-safe refusal, with any rewording deferred). The (c) REHEARSAL-SCOPE PIN is present and unambiguous: the server rehearsal 'MUST exercise the recovery-epoch cleanup leg (supervisor- or W-side-minted per its own contract) so the defer lands'."
  - "P3-1/P3-2 (my iv-1 informational findings) FOLDED: the '12-key' baseline label corrected to '11-key' in the strict-accept runner docstring + test comment; the full-window cleanup-segment comment softened to attribute the full byte-convergence to the composer-twin unit and scope the inline check to spot-verification (commit d0f30b987)."
  - "Did NOT run vitest or any server/db/docker command (constraint); relied on the team-lead's stated re-runs for all green/execution claims — every byte-level and structural claim above verified independently against git show/diff bytes."
changed_files:
  - packages/course-gen-platform/tests/unit/ops/q12-live-real-composed-recovery.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-composed-recovery-runner.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-real-cleanup-recovery.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-cleanup-recovery-runner.py
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-full-window-runner.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-real-full-window.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-write-install-baseline-strict-accept.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-write-install-baseline-strict-accept-runner.py
  - docs/superpowers/specs/2026-07-17-q12-live-controller-design.md
  - docs/superpowers/plans/2026-07-17-q12-live-controller.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r8b-2-iv-2.md
explicit_defers:
  - "P3-1 (confidence medium, informational — a real coverage boundary, NOT a defect): the recovery-epoch composed convergence (+2 rows: recovery_reacquired + a second capability_claimed under cutover-recovery-N) is genuinely UNREACHABLE from the controller fusion in BOTH directions — forward: the controller mints the epoch but the frozen barrier install child rejects a recovery-epoch checkpoint (#18, verified at barrier :420-433); cleanup: the barrier accepts it but the controller never mints it (#19, verified at OPERATIONS :27-33 / supervisor :4059 / cleanup driver :1797). This is correctly deferred to the server rehearsal with the (c) MUST-exercise pin. Flagging so it is not lost: the program's mid-crash cutover-safety story for the recovery-epoch leg now DEPENDS on the server rehearsal actually exercising that leg (W-side / source-recovery-run.sh custody); the disposable-fusion harness cannot and does not cover it."
  - 'P3-2 (confidence low, informational): the cleanup-recovery probe proves the real cleanup child executed via INDEPENDENT side-effects (guard_residue_db==0 from a fresh pg_namespace/pg_class/pg_proc/pg_event_trigger query + capability deletion + the exact promoted 10-key v2 receipt) rather than a direct child-execution counter (child_executions==0 by design on the --real-cleanup recover path). The side-effect evidence is independent and sufficient (arguably stronger than a self-reported counter); noting the indirectness only for completeness.'
  - "Informational: this round is harness/tests/docs only (zero deploy diff). The deployed SERVER barrier remains 3673ee49 (repo bdb9d935); the byte-verified pre-rehearsal server reinstall + the full-path server run_live rehearsal (which MUST exercise the recovery-epoch cleanup leg per the (c) pin) remain the team-lead's non-negotiable pre-window gates."
---

# Summary

**Correctness / compliance verdict: PASS.** **Quality / improvement verdict: PASS.**
**No P0, no P1, no P2.** The R8-B closing round is harness/tests/docs only (zero deploy
diff, re-verified) and cleanly lands the two ratified spec-level found-defects (#18 real
forward composed recovery unsatisfiable; #19 the controller never mints cleanup recovery
epochs) via the ratified b'+c resolution — the REAL satisfiable probes plus the honest
rehearsal defer. All five duties verified against the bytes:

1. **Crash+refusal** (real twin of fixture :1102-1145): `run_live` crashes mid-`barrier.install`
   at `capability_claimed/cutover` (real install barrier never runs), a separate lease session's
   `run_recover` fails closed with the EXACT `q12-live-cutover.sh install` supervisor pointer,
   and the durable journal is byte-for-byte unchanged. The crash seam is additive/gated on the
   pre-existing `after_journal_fsync` core hook — no production-path perturbation.
2. **Cleanup-recovery** (fixture head-8 made real): crash head EXACTLY
   `barrier.cleanup/capability_claimed/cutover` at 79 rows; `run_recover` converges to the 81-row
   twin (+0) UNDER CUTOVER; recovered[0:79] byte-identical; appended exactly
   `[capability_completed/cutover, accepted/cutover]`; `recovery_reacquired` absent; convergence
   under the EXISTING blessed/parity/convergence exclusions ONLY (helpers byte-equivalent to the
   established set, zero new); the real cleanup child + R8-B-1 seam completed (independent residue 0,
   exact 10-key v2, capability deleted, resume validated).
3. **Shared-quiesce_manifest_path fix**: one shared quiesce manifest pins the `<quiesce-manifest>`
   path that feeds `command_sha256` (core :729 iv-1 precedent) across twin + crash/recover, enabling
   +0 convergence; harness-side only.
4. **DECISION-2 docs**: the five-op byte-cites hold (spot-verified — install cutover-pin :420-433,
   cleanup/rollback :582/:444-598, empty :416; controller OPERATIONS :27-33, supervisor :4059,
   cleanup driver :1797); the §5.5 addendum + §6b.6 note match the ratified operator-truth wording;
   the R5-D2 pointer text is unchanged (additive-only) with the explicit defer recorded; the (c)
   rehearsal-scope pin is present and unambiguous ("MUST exercise the recovery-epoch cleanup leg").
5. **Whole-range**: barrier `bdb9d935`, manifest/catalog/W-owned/core all byte-identical; clean
   TDD RED→GREEN splits.

My prior iv-1 informational findings (P3-1 "12-key"→"11-key", P3-2 cleanup-segment comment) are
folded (commit d0f30b987). Findings this round: **two P3 informational** (the recovery-epoch leg
is a genuine harness coverage boundary deferred to the rehearsal; the real-cleanup evidence is
side-effect-based by design). None block merge.

# Verification

See the structured `verification:` block above — each item is an independent byte-level check
(zero-deploy-diff + frozen/core/W-owned byte-identity; the pre-existing `after_journal_fsync` /
`execute_barrier_cleanup` core seams the crash injections hook; the crash-head/refusal-pointer/
journal-byte-unchanged assertions; the +0 cleanup convergence under verbatim exclusions; the shared
quiesce-manifest pinning vs the core :729 precedent; the DECISION-2 barrier/controller cites at the
bytes; the additive-only docs + R5-D2 unchanged + (c) rehearsal pin). I did not run the vitest suites
or any server/db/docker command per the read-only constraint and relied on the team-lead's stated
re-runs (b' 235.4s, coordinator 233.7s, fixtures 30/30, tsc 0, crash+refusal ~112s) for green claims.

# Risks / Follow-ups

- **P3-1 (coverage boundary, informational):** the recovery-epoch composed convergence (+2) is
  genuinely unreachable from the controller fusion (#18 forward-reject + #19 controller-never-mints)
  and is correctly deferred to the server rehearsal; the program's mid-crash cutover-safety for that
  leg now depends on the rehearsal actually exercising it — the (c) pin makes that a MUST, which is
  the right handling, but it is a real defer to track to closure.
- **P3-2 (evidence-shape note):** the real cleanup child's execution is proven by independent
  side-effects (residue 0 / capability deleted / exact v2) rather than a direct counter
  (`child_executions==0` by design) — sufficient and arguably stronger; noted for completeness.
- **Program-level (team-lead-owned):** deployed SERVER barrier still `3673ee49` vs repo `bdb9d935` —
  the byte-verified reinstall + the full-path server `run_live` rehearsal (which MUST exercise the
  recovery-epoch cleanup leg) remain the non-negotiable pre-window gates.
