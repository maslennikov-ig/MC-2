---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-r5d
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform
base_commit: 7f7458259
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: >-
  Isolated worktree /home/me/code/mc2/.worktrees/q12-live-controller and branch
  codex/q12-live-controller left in place for orchestrator integration; no push. R5 Sub-round D
  drives fixture children in-process (no docker/PG17), so there are no container resources to
  reclaim.
risk_level: medium
docs_reviewed: updated
docs_review_notes: >-
  docs/superpowers/plans/2026-07-17-q12-live-controller.md implementation log gained the R5
  Sub-round D entry (refactor f41a20577 -> RED 78e8d797e -> GREEN 320257631). No design-spec or
  product-behavior doc changed: RULING 2 (RECOVER SCOPE) was already handed down by the
  orchestrator and is implemented verbatim; no new contract or ruling was authored here.
graph_reviewed: no-change-needed
graph_review_notes: >-
  Local change confined to deploy/qdrant/q12-lifecycle-core.py (a behavior-preserving
  drive_forward_tail/finalize_forward_output extraction + a stop_after seam + the new run_recover
  function) and the ops test/contract/runner fixtures; no architecture, durable workflow, or
  public-surface change. Worktree is a delegated stream awaiting integration.
verification:
  - 'Commits: refactor f41a20577 (extract drive_forward_tail + finalize_forward_output + stop_after seam, behavior-preserving, no test changes) -> RED 78e8d797e (tests + fixtures + contract, core run_recover ABSENT) -> GREEN 320257631 (core run_recover). RED evidence captured by stashing the uncommitted core run_recover: the 3 R5-D recover tests failed with "module ''q12_lifecycle_core'' has no attribute ''run_recover''" while the R5-C before-group-3 marker close (a stop_after-only test) passed, proving the seam and the recover feature are independently gated.'
  - 'run_recover DISPATCH TABLE (orchestrator RULING 2): head deploy.prepare/completed (C7 planned exit) -> drive_forward_tail(include_fwm=True) from group 14 (FWM); head writers.resume.forward/accepted (crash-after-FWM) -> drive_forward_tail(include_fwm=False) from group 15 (deploy.commit); ANY other durable head OR an empty/absent journal -> NAMED fail-closed LifecycleError. Refusal text: "recover does not support resuming from phase=<p> outcome=<o> command=<c>" (unsupported head) and "recover requires a non-empty durable journal" (empty). No heuristic/best-effort continuation. Mid-barrier partials are deliberately NOT resumed by run_recover (they route through the existing run_supervisor/resume_retained_chain machinery); run_recover fails closed on them by design, honoring RULING 2''s "recover supports resuming from exactly (a) and (b)".'
  - 'stop_after CHECKPOINT NAMES (request["stop_after"], validated fail-closed): "writers.quiesce.pre" = stop after group 2 (d5 install), BEFORE journaling writers.quiesce (the R5-C before-group-3 observation point); "deploy.prepare" = stop at the C7 planned-exit head (deploy.prepare/completed, 66-row prefix); "final-writer-manifest" = stop after the group-14 FWM accepted row (68-row prefix, crash-after-FWM). Absent stop_after reproduces the full 76-row window + post-activate byte-for-byte. A stopped run returns its partial output and does NOT run post-activate (output has no postActivate key -> null).'
  - 'UNSUPPORTED-HEAD NEGATIVE production: driven by run_live(stop_after="writers.quiesce.pre"), which leaves the durable head at barrier.install/completed (phase maintenance_guarded) — a real durable head that is neither the C7 head nor the FWM-accepted head. runRecoverExpectingRefusal asserts the refusal names command=barrier.install, outcome=completed, phase=maintenance_guarded, AND that the durable journal file is byte-for-byte unchanged after the refusal (recover did NOT continue). Plus two more negatives: an empty journal (fresh run root -> "recover requires a non-empty durable journal") and a head PAST activate (a full 76-row uninterrupted run -> refusal naming command=barrier.activate).'
  - 'HOW recover reproduces the 76-row twin: run_recover reads the durable journal tail before constructing the Engine and pins request["resource_manifest_sha256"] to the tail''s resource value (a legal request-global pin for validate_stable_binding_walk row-0/row-last, like run_claim reconstructs from durable truth), then rehydrates via Engine (which re-validates the full partial journal) and restores current_resource/quiesce_manifest_sha256 from the head. drive_forward_tail then appends the remaining rows from the REAL durable head onto the SAME run root, so every per-run-root field (entry_hash/previous_hash/capability_manifest_sha256/FWM accepted_object_sha256) is identical to what an uninterrupted run on that root would produce. Proven by asserting recovered.journalEntries.slice(0, prefix) deep-equals the stopped partial byte-for-byte AND recovered.journalEntries.map(withParityExclusions) deep-equals composer.journalEntries.map(withParityExclusions) across all 76 rows, with postActivate (R5-E) recorded (cleanup guard_cleanup_complete + resume resumed, resume.validated_receipt_sha256 == cleanup.cleanup_receipt_sha256).'
  - "Behavior-preserving refactor proof: after f41a20577 the pre-existing q12-live-controller suite ran 9/9 and the 4-suite no-docker set 307/307 with NO test changes; run_live's absent-stop_after path drives drive_forward_tail(include_fwm=True, stop_after=None) which is the original inline tail verbatim (durable reload, the three run-root artifact paths, then orchestrate_post_activate_cleanup)."
  - 'Suites green (from packages/course-gen-platform, SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key pnpm exec vitest run --config vitest.config.unit.ts): q12-live-controller.test.ts 13/13 (9 prior + 4 new: R5-C before-group-3 close, recover-from-C7, recover-from-crash-after-FWM, NAMED fail-closed negatives). 4-suite no-docker regression (q12-live-controller + q12-live-cutover + q12-retained-barrier-quiesce-seam + q12-retained-barrier-w-composition-seam) 311/311 (was 307; +4). pnpm exec tsc --noEmit = 0.'
  - 'Frozen bytes byte-identical after GREEN: q12-command-manifest.json aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841, q12-database-barrier.sh 3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9, q12-structural-catalog.sql 0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e. No W-owned file changed (q12-writer-resume.py / source-recovery-run.sh / q12-source-manifest.ts untouched, verified via git status). run_joined_composer body byte-unchanged (git diff 7f7458259..HEAD shows no +/- line touching its def or its snapshot_backup_restore_base/forward_tail_through_* helpers; the only run_joined_composer match is a removed COMMENT inside run_live).'
  - 'python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r5d.md -> artifact validation OK (re-validated after commit in case lint-staged/prettier reformatted the .md).'
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-controller.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py
  - docs/superpowers/plans/2026-07-17-q12-live-controller.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r5d.md
explicit_defers:
  - 'MID-BARRIER RESUME-AND-PROCEED is NOT wired into run_recover this round. Per orchestrator
    RULING 2 ("recover supports resuming from exactly (a) the C7 head and (b) the crash-after-FWM
    restart") plus the HARD fail-closed requirement, run_recover supports ONLY those two clean
    checkpoints and fails closed (NAMED refusal) on every other head, including a mid-barrier
    partial that has not reached its clean completed boundary. Deeper mid-barrier partials go
    through the existing run_supervisor/resume_retained_chain machinery, not run_recover.
    Implementing a deterministic resume-then-continue-the-forward-sequence path from an arbitrary
    in-flight barrier is genuinely large (it re-enters the whole remaining forward chronology from
    an unknown group) and has no test; wiring it now would be scope expansion with no coverage.
    FLAGGED, not a silent omission — this matches the ruling''s binding "exactly (a) and (b)".'
  - 'Crash-anywhere idempotence is probed further at R8. This round proves resume from the two
    named checkpoints reproduces the forward twin, and fail-closed on unsupported heads (including
    a real mid-forward barrier.install/completed head, an empty journal, and a head past activate).
    An unsupported-but-real head surfacing later (R8 crash-anywhere probing) is a normal finding,
    not a scope breach, per RULING 2.'
  - 'The activate barrier claim and the deploy.commit ordinary child in a recovered run cross the
    same fixture claim-launcher / execute_ordinary seams run_live uses (LiveOrdinaryExecutor via a
    bwrap sandbox); the REAL docker/PG17 barrier + resume children remain round R8 exactly as for
    run_live (unchanged by this round).'
---

# Summary

R5 Sub-round D (the RECOVER controller, orchestrator RULING 2 — RECOVER SCOPE) is delivered on
branch `codex/q12-live-controller`: behavior-preserving refactor `f41a20577` → RED `78e8d797e` →
GREEN `320257631` → docs. A first refactor extracted `run_live`'s forward tail (§5 groups 14 FWM →
15 `deploy.commit` → 16 `activate` → `reload_durable` → output augmentation → RULING 1 post-activate
cleanup/resume) into a reusable `drive_forward_tail(engine, request, manifest, values,
quiesce_bytes, run_id, resource_manifest_paths, marker_path, ordinary, d5, *, include_fwm,
stop_after)` plus a `finalize_forward_output(...)` projector, and added an optional
`request["stop_after"]` seam with three named checkpoints (`"writers.quiesce.pre"`,
`"deploy.prepare"`, `"final-writer-manifest"`). Absent `stop_after` reproduces the full 76-row
window + post-activate byte-for-byte; a stopped run returns its partial output and does NOT run
post-activate.

`run_recover(request, executor)` then resumes an interrupted forward cutover from an EXISTING run
root: unlike `run_live` (fresh-root guard) it requires a NON-EMPTY durable journal, pins the
request-global resource value from the durable tail (like `run_claim`), rehydrates through the same
`Engine` (which re-validates the full partial journal), restores the stepped resource/quiesce
domains from the head, and DISPATCHES on the durable head — `deploy.prepare`/`completed` (C7) →
`drive_forward_tail` from group 14; `writers.resume.forward`/`accepted` (crash-after-FWM) →
`drive_forward_tail(include_fwm=False)` from group 15; ANY other head or an empty journal → a NAMED
fail-closed `LifecycleError` naming phase/outcome/command, never a heuristic continuation. Because
every resumed row chains from the real durable head onto the same run root, the completed journal is
the SAME byte/order twin of the composer's 76 rows (+ post-activate) an uninterrupted run would have
produced.

# Verification

- Refactor `f41a20577` (9/9 + 307/307, no test changes) → RED `78e8d797e` (3 recover tests fail,
  `run_recover` absent; R5-C stop_after close passes) → GREEN `320257631`.
- `run_recover` dispatch: C7 head → group-14 tail; crash-after-FWM head → group-15 tail; else NAMED
  refusal. Negatives: unsupported `barrier.install/completed` head (journal proven byte-unchanged),
  empty journal, head past activate (`barrier.activate`).
- Recover reproduces the 76-row twin (prefix byte-equal to the stopped partial + full
  `withParityExclusions` twin) with `postActivate` recorded.
- `q12-live-controller.test.ts` 13/13; 4-suite regression 311/311; `pnpm exec tsc --noEmit` 0.
- Frozen bytes byte-identical (`aaec6fc2…`/`3673ee49…`/`0b8a943f…`); no W-owned file changed;
  `run_joined_composer` body byte-unchanged.
- `validate_artifact.py` on this file → OK.

# Risks / Follow-ups

- **Mid-barrier resume is not in `run_recover`.** Per RULING 2's binding "exactly (a) and (b)" +
  the hard fail-closed requirement, `run_recover` supports only the two clean checkpoints and fails
  closed on every other head, including mid-barrier partials (those stay on the existing
  `resume_retained_chain` path). Deterministic resume-and-proceed from an arbitrary in-flight
  barrier is large and untested; deferred, flagged.
- **Crash-anywhere idempotence is R8.** An unsupported-but-real head surfacing during R8
  crash-anywhere probing is a normal finding, not a scope breach.
- **Real barrier/resume children remain R8.** A recovered run's `activate` claim and
  `deploy.commit` child cross the same fixture seams `run_live` uses; the real docker/PG17 children
  are unchanged R8 work.
- **Next unblocked:** R8 (real barrier-cleanup + resume wiring, crash-anywhere probing) and R7
  (rollback recover path) can build on `drive_forward_tail` + `run_recover`.
