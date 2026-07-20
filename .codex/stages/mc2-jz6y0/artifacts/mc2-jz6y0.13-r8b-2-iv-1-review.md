---
schema_version: orchestration-artifact/v1
artifact_type: review
task_id: mc2-jz6y0.13-r8b-2-iv-1-review
stage_id: mc2-jz6y0
repo: https://github.com/maslennikov-ig/MC-2.git
branch: codex/q12-live-controller
base_branch: master
base_commit: b5c79c61f
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: 'Read-only pre-merge review of the codex/q12-live-controller range; the single write is THIS artifact, deposited into the self-hosted-qdrant-platform STAGE worktree per the new artifact-location policy (prevents untracked collisions in the reviewed worktree). No code/config modified, no server/db/docker command run.'
risk_level: low
verification:
  - "Reviewed range f508b31be..b5c79c61f (14 commits incl. the a4e75118e P3-1 comment, merge 6c6cfc3d7, blueprint pins f7c25ffa5/8537c6000, and the 8-commit build round) via git show/diff; every byte-level claim verified independently. Execution claims (gated full-window probe 119.3s, strict-accept unit 4/4, fixtures 30/30, tsc 0) relied on the team-lead's re-runs per the read-only constraint."
  - 'REVIEW-CRITICAL SURFACE — the ONLY deploy change is deploy/qdrant/q12-lifecycle-core.py write_install_baseline (+25/-1, commit 9e352261f); confirmed by git diff --stat -- deploy/ (single file). The merge 6c6cfc3d7 brought NOTHING else into deploy/. Everything else in the range is tests/harness/docs/artifacts.'
  - 'FROZEN/UNTOUCHED (whole-range): at tip b5c79c61f — barrier q12-database-barrier.sh = bdb9d935e3c09fb01503ba9d016f36a9cf94db5539dfcdc73c1692eb442925ce; command-manifest = aaec6fc2…; structural-catalog = 0b8a943f… (frozen trio intact). W-owned q12-writer-resume.py (49ef1a07…), source-recovery-run.sh (9b0b5d53…), and q12-source-manifest.ts (902cd6a1…) byte-identical at base and tip.'
  - "STRICT-ACCEPT faithful to the ratified spec (Engine.write_install_baseline): path = run_root/database-barrier-baseline.json computed ONCE; PRESENT (os.path.lexists) → validate_regular_file(path, mode=0o400) → json.loads (UnicodeDecodeError/ValueError → LifecycleError 'unparseable') → (not dict OR complete_object(accepted)!=data → LifecycleError 'non-canonical') → (schema_version!='megacampus.q12.database-barrier-baseline/v1' → 'foreign schema') → (run_id!=self.request['run_id'] → 'foreign run_id') → trace.append('install:baseline-strict-accept'); return WITHOUT writing. Every failure is a LifecycleError fail-closed no-overwrite. The three call sites :2407/:2413/:2621 are OUTSIDE the diff hunk (:2640+) and unchanged."
  - 'ABSENT branch byte-identical (Duty b): the else path is the original code verbatim (journal `claim = next(...)`, 5-key baseline dict, immutable_publish(path, complete_object(baseline), 0o600, trace)); the ONLY textual change is the literal `self.run_root / "database-barrier-baseline.json"` → the `path` variable that is defined equal to it, so behavior is unchanged. Discriminator by design: ABSENT writes 0600 (controller''s minimal baseline), strict-accept requires 0400 (barrier''s authoritative artifact) — a controller-written 0600 file is REJECTED by a later strict-accept (the tamper_0600 case), cleanly separating the two custodies.'
  - 'TAMPER MATRIX complete + genuine (Duty c): the RED unit (q12-write-install-baseline-strict-accept.test.ts + -runner.py, no-docker, minimal Engine via __new__) constructs each case for real — ABSENT (5-key 0600, uid/gid 1000, exact 5-key set); PRESENT accept (canonical barrier bytes @0400 → byte_unchanged, trace record, admits the full structural shape); tamper_0600 (same canonical bytes chmod 0600 → wrong-mode LifecycleError); wrong_run_id (canonical @0400, foreign run_id); wrong_schema (…/v2); non-canonical (json.dumps indent=2 pretty, CORRECT schema+run_id, @0400 → complete_object!=data bites); unparseable (garbage bytes). All 5 tamper cases assert raised==true AND is_lifecycle==true. Case F proves the canonical guard bites even with correct schema+run_id.'
  - "ADVERSARIAL (a) — the ratified no-shape-check is SAFE: a canonical file with matching schema+run_id but FOREIGN structural content would pass the accept in isolation, BUT it is UNREACHABLE in a real run. (1) The 0700 owner-only run root admits writes only from the controller/operator uid. (2) The barrier publishes its baseline via publish_exact_immutable (barrier :601-633): if the destination already exists it runs `cmp -s` byte-EXACT and `fail`s on any non-exact file — so a pre-planted FOREIGN baseline aborts the BARRIER's own publish BEFORE write_install_baseline ever runs; a pre-planted IDENTICAL file is by definition the correct baseline. The controller's own ABSENT-path immutable_publish (:592+) likewise requires exact expected bytes / O_EXCL create. (3) Downstream the barrier binds database_barrier_baseline_sha256 into the terminal proof + receipt chain. So by the time strict-accept runs, the file is guaranteed the barrier's own 0400 artifact for this run; schema+run_id+0400+canonical is sufficient confirmation and no residual realistic-tamper path survives."
  - "HARNESS #15 DUAL-BIND (test-only, q12-live-real-full-window runner+test): (i) same-inode GENUINE — dual_bind_same_inode = (opt_stat.st_dev,st_ino)==(trust_stat.st_dev,st_ino) over journal_opt vs journal_trust, asserted true (test :224). (ii) command_sha256 binds the /opt (install via _rewrite_opt_to_trust) and controller-run_root (cleanup via _rewrite_run_root_to_trust) argv VERBATIM — both rewrite helpers operate on a `list(argv)` COPY handed to the barrier subprocess (runner :439 immediately before run_barrier_with_proxy), touch only indices ≥1 (argv[0] untouched), and never mutate the journaled argv/command_sha256; the passing 76-row prefix parity is itself the proof the journal was not perturbed by the rewrite. In PRODUCTION context['run_root']==/opt so _rewrite_run_root_to_trust is a no-op — harness-only (#17). (iv) checkpoint view-independence asserted — input_checkpoint_view_independent = checkpoint journal_device/inode == opt_stat dev/ino (==trust by dual-bind), asserted true (test :229)."
  - "NO EXCLUSION BROADENING (Duty #15 iii): the full-window test's BLESSED_EXCLUSIONS (capability_manifest_sha256, entry_hash, previous_hash, resource_manifest_sha256) and all three helpers (withoutBlessedExclusions / withParityExclusions[+writers.resume.forward accepted→accepted_object_sha256] / withConvergenceExclusions[+barrier.cleanup→command_sha256+accepted_object_sha256]) are BYTE-EQUIVALENT to the established set in q12-live-controller.test.ts:110-159. The 76-row PREFIX parity vs the composer twin uses withParityExclusions (does NOT drop cleanup command_sha256); the cleanup command_sha256 drop is scoped ONLY to withConvergenceExclusions on barrier.cleanup rows. No exclusion is broadened anywhere in the round."
  - "REAL FULL-WINDOW END-TO-END (rely on team-lead re-runs for execution): the test asserts live_rc==0; seed_counts {public:47,auth:22,storage:5,cron:8,net:0}; activate_db_state {activated:true,cron_active:8,read_only:'off'} (REAL DB activated/cron-restored/read-only-off); post_activate_cleanup_status=='guard_cleanup_complete'; post_activate_resume_status=='resumed'; quiesce-window marker 0400 with the exact 3-key mode=cutover object; the terminal barrier.cleanup accepted row binds accepted_object_sha256==v2_receipt_sha256 with the EXACT 10-key v2 (== the W forward-resume gate key set) and all v2 field values (state guard_cleanup_complete, zero_guard_residue, database_capability_deleted, etc.); + the added #16 witness that the controller strict-accepted (baseline carries the barrier's structural keys, not the controller's minimal capability_manifest_sha256 key)."
  - "BLUEPRINT PROVENANCE recorded (docs/superpowers/plans): #16 sanctioned-hard-stop→FIXED (Option-A strict-accept), #17 authorized harness-level fix (_rewrite_run_root_to_trust, cleanup-child argv, only the barrier child's argv touched, dropped from cleanup parity under withConvergenceExclusions), and #15 dual-bind with the step-3 transport adaptation (bwrap WITH --unshare-net auto-upping private loopback + in-netns bridging via the docker-exec unix socket, since the literal host-side 127.0.0.1:5432 is unexecutable when the host already binds 5432) + the step-4 dual-bind amendment carrying #15 provenance (commit 8537c6000). Clean TDD: strict-accept RED f59b17934→GREEN 9e352261f; full-window RED 4fd3dd26b→hard-stop→#16/#17 fixes→GREEN 16068fc77/b5c79c61f."
  - "Did NOT run vitest or any server/db/docker command (constraint); relied on the team-lead's stated re-runs for all green/execution claims — every byte-level and structural claim above verified independently against git show/diff bytes."
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - packages/course-gen-platform/tests/unit/ops/q12-write-install-baseline-strict-accept.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-write-install-baseline-strict-accept-runner.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-real-full-window.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-full-window-runner.py
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-live-real-verify-chain-runner.py
  - docs/superpowers/plans/2026-07-17-q12-live-controller.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r8b-2-iv-1.md
explicit_defers:
  - "P3-1 (confidence low, cosmetic docs/comment inaccuracy): the barrier baseline is called a 'full 12-key structural shape' in the strict-accept unit comment/docstring (test :92, runner :83) and the plan log, but the barrier baseline (q12-database-barrier.sh:2027-2037) and the test's own asserted before.keys array both enumerate ELEVEN top-level keys (schema_version, run_id, state, source_baseline_sha256, baseline_sha256, predecessor_checkpoint_sha256, predecessor_journal_entry_hash, resource_manifest_sha256, expected_post_migration_catalog_sha256, database_capability_sha256, baseline). The asserted code is correct; only the '12-key' label is off by one. Recurs in 3+ places — worth a one-token correction so a future auditor does not trust '12'."
  - "P3-2 (confidence low, test-scope observation): the full-window real test's cleanup-segment check (test :172-177) spot-checks the barrier.cleanup rows (lease_epoch=='cutover' + quiesce_manifest_sha256 defined + the terminal row's exact 10-key v2 binding) rather than a full byte-convergence .toEqual against a twin under withConvergenceExclusions. That full convergence equality is owned by the established composer-twin unit (q12-live-controller.test.ts:1361); the real test appropriately focuses on live rc/DB-state/v2-binding. The comment ':170-171 'byte-deterministic under the convergence exclusions' slightly oversells what THIS test asserts inline. No coverage gap given the twin unit."
  - "Informational: the strict-accept fix is the CONTROLLER (deploy) change; execute_forward_resume and the server-side owner-custody remain downstream. The deployed SERVER barrier remains 3673ee49 (repo bdb9d935); the byte-verified pre-rehearsal server reinstall + the full-path server run_live rehearsal remain the team-lead's non-negotiable pre-window gates."
---

# Summary

**Correctness / compliance verdict: PASS.** **Quality / improvement verdict: PASS.**
**No P0, no P1, no P2.** The R8-B-2-iv-1 round delivered the first full-window real
`run_live` (controller custody driving the REAL barrier end-to-end on one physical run
root) and its three ratified found-defects (#15 dual-bind, #16 baseline collision, #17
un-virtualized cleanup argv). The ONLY deploy change is `q12-lifecycle-core.py`
`write_install_baseline` (+25/-1); everything else is test/harness/docs.

Review-critical surface (found-defect #16): the strict-accept core edit is a faithful,
fail-closed implementation of the ratified publish-OR-strict-accept spec — PRESENT →
`validate_regular_file(0o400)` + canonical + schema + run_id → accept without writing
(`install:baseline-strict-accept`); ABSENT → the original 5-key 0600 write (byte-identical
logic, `path` == the prior literal); any deviation → `LifecycleError`, never overwrites.
Call sites `:2407/:2413/:2621` unchanged. The RED tamper matrix (0600 / wrong run_id /
wrong schema / non-canonical / unparseable) is complete and each case is genuinely
constructed.

Adversarial (a) resolved in the fix's favour: the ratified no-shape-check is **safe**
because a foreign canonical file with matching schema+run_id is unreachable in a real run —
the 0700 owner-only root plus the barrier's `publish_exact_immutable` exact-match guard
(`cmp -s` / `fail`) abort on any pre-planted non-exact baseline **before**
`write_install_baseline` runs, and downstream the terminal proof binds the baseline sha.

Harness (#15/#17): same-inode, VERBATIM-argv command_sha256 (rewrite touches only the
barrier subprocess argv, never the journal), and checkpoint view-independence are all
genuinely asserted; the blessed exclusion helpers are **byte-equivalent** to the
established set with **no broadening** (76-row prefix parity uses `withParityExclusions`;
cleanup `command_sha256` drop is scoped only to `withConvergenceExclusions`). Whole-range:
barrier `bdb9d935`, manifest `aaec6fc2`, catalog `0b8a943f`, W-owned files byte-untouched.

Findings: **three P3 informational** (a recurring "12-key" vs 11-key label typo; a
cleanup-segment spot-check-vs-full-convergence scope note; the standing server-custody
defer). None block merge.

# Verification

See the structured `verification:` block above — each item is an independent byte-level
check (deploy-only diff isolation; frozen-sha recomputation at the tip; strict-accept spec
line-by-line + ABSENT byte-identity + tamper-matrix genuineness; the `publish_exact_immutable`
exact-match guard that closes adversarial (a); dual-bind/inode/view-independence assertions;
blessed-exclusion byte-equivalence vs the established test). I did not run the vitest suites
or any server/db/docker command per the read-only constraint and relied on the team-lead's
stated re-runs (full-window 119.3s, strict-accept 4/4, fixtures 30/30, tsc 0) for green
execution claims.

# Risks / Follow-ups

- **P3-1 (cosmetic):** the "full 12-key structural shape" label (strict-accept comment,
  runner docstring, plan) is off by one — the barrier baseline has 11 top-level keys and
  the asserted array is correct; a one-token doc fix prevents a future mis-audit.
- **P3-2 (test-scope note):** the real full-window test spot-checks the cleanup rows
  (epoch + quiesce + exact terminal v2) rather than a full byte-convergence `.toEqual`;
  the full convergence equality is owned by the established composer-twin unit, so no gap —
  but the inline "byte-deterministic under the convergence exclusions" comment slightly
  oversells what this test asserts.
- **Program-level (team-lead-owned, not this round):** deployed SERVER barrier still
  `3673ee49` vs repo `bdb9d935` — byte-verified reinstall + full-path server `run_live`
  rehearsal remain the pre-window gates; `execute_forward_resume` and the real cleanup
  child under server owner-custody remain downstream, production fail-closed at the split
  pre-flight until then.
