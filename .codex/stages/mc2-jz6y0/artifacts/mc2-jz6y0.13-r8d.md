---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-r8d
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform
base_commit: 7e873c2e2
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: >-
  Isolated worktree /home/me/code/mc2/.worktrees/q12-live-controller and branch
  codex/q12-live-controller left in place for orchestrator integration; no push. R8 Sub-round D is a
  FIXTURE-FIRST TDD round (shared witness writer + activate-head recover dispatch + fixture resume
  hook wiring + tests + docs); no docker/PG17 run and no production run root were created
  (/opt/megacampus is not writable here), so there are no container/host resources to reclaim.
risk_level: medium
docs_reviewed: updated
docs_review_notes: >-
  docs/superpowers/plans/2026-07-17-q12-live-controller.md implementation log gained the R8
  Sub-round D entry (RED fef172dfc -> GREEN 36c68697e -> docs). The design spec
  docs/superpowers/specs/2026-07-17-q12-live-controller-design.md section 5.5 "Composed recover
  procedure" was CORRECTED: run_recover now supports THREE clean heads (the two forward tail heads
  plus the post-activate head barrier.activate/completed), with the receipt-presence dispatch on the
  durable resume witness, the folded-in R8-E no-op case, and the CHAIN-FIRST guarantee documented.
graph_reviewed: no-change-needed
graph_review_notes: >-
  Local change confined to deploy/qdrant/q12-lifecycle-core.py (one shared witness writer, one
  tamper-discipline validator, one recover_post_activate dispatch function, one new run_recover
  dispatch branch, and two module constants), the fixtures adapter
  q12-retained-barrier-runner.py (resume hook now writes the witness through the CORE writer + two
  receipt-name constant references), the contract q12-retained-barrier-contract.ts (two new optional
  recover output fields), the focused ops test, and docs. No architecture, durable workflow, or
  public-contract change beyond the already-specified recover surface; the journal grammar, composer
  76-row twin, and frozen manifests are byte-unchanged. Worktree is a delegated stream awaiting
  integration.
verification:
  - 'Commits: RED fef172dfc (7 new R8-D matrix tests + the past-activate refusal sub-case converted out of the negative test + the two new contract recover fields; feature absent => 7/20 fail because the fixture resume hook never wrote a witness and run_recover still refused barrier.activate) -> GREEN 36c68697e (shared writer + validator + recover_post_activate + run_recover activate-head dispatch branch + fixture resume-hook witness write) -> docs (this artifact + plan log + design 5.5 correction).'
  - 'SHARED WRITER signature (deploy/qdrant/q12-lifecycle-core.py): write_post_activate_resume_receipt(run_root, run_id, cleanup_receipt_sha256, outcome) -> str. Builds the EXACT minimal 4-key witness {schema_version="megacampus.q12.post-activate-resume-receipt/v1", run_id=str(uuid.UUID(run_id)), cleanup_receipt_sha256, outcome}, validates the digest is hex64 and outcome non-empty, then immutable_publish(<run_root>/post-activate-resume-receipt.json, complete_object(witness), 0o400, []) — the SAME atomic temp+rename + fsync + 0400 discipline as write_quiesce_window_marker. Returns the witness path. THE RESUME PATH writes the witness through this function: the FIXTURE resume hook LiveOrdinaryExecutor.execute_forward_resume (packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py) imports CORE and calls CORE.write_post_activate_resume_receipt(run_root, run_id, sha256(barrier_bytes), "resumed") AFTER its fail-closed validation of the v2 receipt passes, so the atomic-write + 0400 discipline is exercised in fixture tests. R8-A (real production resume child wiring to the same function) is deferred (see explicit_defers).'
  - 'ACTIVATE-HEAD DISPATCH (run_recover, after the two existing forward-tail branches, before the barrier refusal): if head["command_id"] == "barrier.activate" and head["outcome"] == "completed": return recover_post_activate(engine, request, run_id, resource_manifest_paths, marker_path). recover_post_activate reads witness_path = engine.run_root / "post-activate-resume-receipt.json" and branches on os.path.lexists: (ABSENT) finalize_forward_output(..., post_activate=True) — full idempotent re-drive cleanup->resume, output["postActivateRecoverOutcome"]="post-activate re-driven"; (PRESENT) validate_post_activate_resume_witness(...) then finalize_forward_output(..., post_activate=False), output["postActivate"]=None + output["postActivateRecoverOutcome"]="post-activate already complete". Both set output["postActivateResumeReceiptPath"]=str(witness_path). NO forward tail, NO journal row in either branch (finalize_forward_output only reloads durable + augments; post_activate=True re-runs the receipt-only cleanup/resume children which append no row).'
  - 'INVALID-WITNESS NAMED FAILS (validate_post_activate_resume_witness, all "(tamper suspicion)"): unreadable/non-0400 "post-activate resume witness is unreadable or not a safe 0400 file"; bad JSON "... is not valid JSON"; wrong key set "... key set is not exact"; non-canonical bytes "... is not canonical bytes"; bad schema "... schema_version is not recognized"; wrong run_id "... run_id does not match this run"; non-sha256 digest "... cleanup_receipt_sha256 is not a sha256"; missing/unsafe receipt "... references a missing or unsafe cleanup receipt"; digest mismatch vs the re-validated on-disk v2 receipt "post-activate resume witness cleanup receipt digest mismatch". The re-validation reads <run_root>/database-barrier-receipt.json (CORE constant DATABASE_BARRIER_RECEIPT_NAME, also now referenced by the fixture cleanup/resume hooks) via validate_regular_file(mode=0o400) and compares sha256 to the witness digest — so a tampered witness OR a tampered receipt both hard-fail.'
  - 'THE 6-CASE MATRIX (+ chain-first), each driven from a full materializeLiveController run (which now writes a valid witness through the shared writer) then a targeted mutation + materializeRecover / runRecoverExpectingRefusal: (1) crash-before-cleanup = rm witness+receipt+probe -> witness absent -> re-drive (outcome "post-activate re-driven", witness recreated, 76 rows, journal+marker byte-unchanged); (2) crash-after-cleanup-before-resume = rm witness only (receipt+probe kept) -> witness absent -> re-drive (the stale in-flight receipt does NOT short-circuit); (3) crash-after-resume = valid witness untouched -> no-op success "post-activate already complete", postActivate null, journal+marker+witness byte-unchanged; (4) tampered witness = rewrite cleanup_receipt_sha256 to f*64 at canonical 0400 -> named hard fail matching /post-activate resume witness/ + /tamper/, journal+marker byte-unchanged; (5) wrong-run_id witness = rewrite run_id to a different UUID at canonical 0400 -> named hard fail matching /run_id/ + /tamper/, journal byte-unchanged; (6) folded R8-E = a complete run recovered again -> valid witness -> no-op success (the converted past-activate case); CHAIN-FIRST = corrupt the head row operator_digest (a hash field, leaving resource_manifest_sha256 intact so run_recover reaches Engine construction) -> the durable-chain walk fails on /journal entry hash mismatch/ and the error does NOT match /witness/, proving the chain is validated before the witness is ever read.'
  - 'PARITY / SAFETY invariants proven: the witness is NEVER a journal row (recover_post_activate appends none; the two no-op/re-drive branches keep the journal at 76 rows and the journalEntries byte-equal to the pre-recover snapshot), the composer 76-row forward twin is unchanged (the R5-A/R5-E parity tests stay green), and the 0400 cutover-window marker (quiesce-window-mode.json) is byte-untouched after recover (asserted in the valid-witness and re-drive cases; recover never calls write_quiesce_window_marker). require_post_activate_executor stays the FIRST statement of run_recover (unchanged). stop_after stays fail-closed (untouched).'
  - 'Suites green (from packages/course-gen-platform, SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key pnpm exec vitest run --config vitest.config.unit.ts): q12-live-controller.test.ts 20/20 (was 13/13; +7 R8-D). The full ratified 5-suite set (q12-live-controller + q12-live-cutover-cli + q12-live-cutover + q12-retained-barrier-quiesce-seam + q12-retained-barrier-w-composition-seam) = 325 passed / 5 files. pnpm exec tsc --noEmit = 0.'
  - 'Frozen trio bytes byte-identical after GREEN: q12-command-manifest.json aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841, q12-database-barrier.sh 3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9, q12-structural-catalog.sql 0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e. No W-owned file changed (q12-writer-resume.py / source-recovery-run.sh / deploy/postgres/q12-source-manifest.ts untouched, verified via git status). No new journal command_id, no frozen manifest/grammar change: the witness is a receipt-only side file (never a journal row) and the composer 76-row twin is byte-unchanged.'
  - 'python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r8d.md -> artifact validation OK (re-validated after commit in case lint-staged/prettier reformatted the .md).'
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts
  - packages/course-gen-platform/tests/unit/ops/q12-live-controller.test.ts
  - docs/superpowers/plans/2026-07-17-q12-live-controller.md
  - docs/superpowers/specs/2026-07-17-q12-live-controller-design.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r8d.md
explicit_defers:
  - 'R8-A (REAL production resume-child wiring) is NOT in this round and is currently HARD-STOPPED on
    a separate contradiction. The shared writer write_post_activate_resume_receipt and the
    activate-head recover dispatch are wired FIXTURE-FIRST: the fixture resume hook
    (LiveOrdinaryExecutor.execute_forward_resume) writes the witness through the shared CORE writer,
    so the atomic-write + 0400 discipline is exercised in tests. The PRODUCTION resume child (sudo
    source-recovery-run.sh writers.resume.forward, wired by ProductionExecutor) MUST call the SAME
    write_post_activate_resume_receipt function when R8-A lands, so a real interrupted post-activate
    is recoverable by the same receipt-presence dispatch. Until then a production recover at the
    activate head with hooks absent still fails closed at require_post_activate_executor (the R5-F
    pre-flight, unchanged). TODO tracked here + in the plan log R8-D entry.'
  - 'The witness re-validation of cleanup_receipt_sha256 reads the on-disk v2 cleanup receipt at the
    CORE-owned path <run_root>/database-barrier-receipt.json (constant DATABASE_BARRIER_RECEIPT_NAME,
    now also referenced by the fixture cleanup/resume hooks so the name cannot drift). When R8-A
    wires the real cleanup child, it MUST publish the v2 guard_cleanup_complete receipt at this same
    path (or the constant must be updated in lockstep) so the tamper re-validation keeps working.'
  - 'No real production cutover was executed and no /opt/megacampus run root was created (not writable
    in this worktree). The receipt-presence dispatch, the tamper discipline, the CHAIN-FIRST
    guarantee, and the atomic 0400 witness write are proven via the fixture-driven ops tests against
    real Engine construction + the real immutable_publish/validate_regular_file primitives. A full
    server-side recover-at-activate rehearsal against the real run-root/lease/docker is the pre-window
    gate + R8 scope, unchanged by this round.'
---

# Summary

R8 Sub-round D (recover at the POST-ACTIVATE head via receipt-presence dispatch) is delivered
FIXTURE-FIRST on branch `codex/q12-live-controller`: RED `fef172dfc` -> GREEN `36c68697e` -> docs.
Per the ratified ruling, `barrier.activate`/`completed` becomes the THIRD supported `run_recover`
head, dispatching ONLY the receipt-only post-activate re-drive — NO forward tail, NO journal row
(activate stays the last row). R8-E is FOLDED IN: a complete 76-row run recovered again is now a
no-op success ("post-activate already complete"), not a refusal, so the old "past activate" negative
sub-case was converted.

Mechanism = OPTION (ii) receipt-presence dispatch on a durable resume WITNESS
`<run_root>/post-activate-resume-receipt.json` (exact 4-key schema `{schema_version, run_id,
cleanup_receipt_sha256, outcome}`, written ATOMICALLY temp+rename at 0400 via the same
`immutable_publish` discipline as the cutover-window marker, by the resume path ONLY after resume
genuinely completes — parity-neutral, born after the journal's last row, adds no journal row). ONE
shared writer `write_post_activate_resume_receipt(run_root, run_id, cleanup_receipt_sha256, outcome)`
lives in `q12-lifecycle-core.py`; the resume path writes through it and the FIXTURE resume hook
imports CORE and calls the SAME function. Dispatch (marker-consistent tamper discipline): witness
ABSENT => full idempotent re-drive (cleanup -> resume; a stale in-flight receipt with NO witness does
not short-circuit); PRESENT-and-VALID => no-op success; PRESENT-but-INVALID => NAMED hard fail
(tamper suspicion), never re-driving over it. CHAIN FIRST: the full durable-chain validation walk
runs during Engine construction BEFORE dispatch, so a corrupted chain fails on `journal entry hash
mismatch`, not the witness (proven).

# Verification

- RED `fef172dfc` (7/20 fail: the fixture never wrote a witness and run_recover still refused the
  activate head) -> GREEN `36c68697e` (20/20).
- `q12-live-controller.test.ts` 20/20; the ratified 5-suite set 325/325; `pnpm exec tsc --noEmit` 0.
- Frozen trio bytes byte-identical (`aaec6fc2…`/`3673ee49…`/`0b8a943f…`); no W-owned file changed;
  no new journal `command_id`; the witness is a receipt-only side file, never a journal row; the
  0400 cutover marker + the composer 76-row twin are byte-unchanged after recover.
- `validate_artifact.py` on this file -> OK.

# Risks / Follow-ups

- **R8-A is the blocked follow-up.** Wiring the REAL production resume child (`sudo
source-recovery-run.sh writers.resume.forward`) to the same shared writer is round R8-A, currently
  hard-stopped on a separate contradiction. Until then the witness discipline is FIXTURE-FIRST and a
  production recover at the activate head with hooks absent fails closed at the unchanged R5-F
  pre-flight.
- **Receipt path coupling.** The witness re-validation reads the CORE-owned
  `<run_root>/database-barrier-receipt.json`; R8-A's real cleanup child must publish the v2 receipt
  at the same path (or update the constant in lockstep).
- **No real production cutover was run.** The dispatch, tamper discipline, CHAIN-FIRST guarantee, and
  atomic 0400 witness write are proven via fixture-driven ops tests against real Engine construction
  and the real `immutable_publish`/`validate_regular_file` primitives; a server-side rehearsal is the
  pre-window gate + R8 scope.
