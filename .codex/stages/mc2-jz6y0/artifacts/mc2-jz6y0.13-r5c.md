---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-r5c
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform
base_commit: e7461d4cf
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: >-
  Isolated worktree /home/me/code/mc2/.worktrees/q12-live-controller and branch
  codex/q12-live-controller left in place for orchestrator integration; no push.
  Sub-round C is pure in-process fixture journaling (no docker/PG17), so there are
  no container resources to reclaim.
risk_level: medium
docs_reviewed: updated
docs_review_notes: >-
  docs/superpowers/plans/2026-07-17-q12-live-controller.md implementation log
  updated (R5 Sub-round C done) in the same delivery. The marker contract itself
  is already specified by the design note
  2026-07-17-q12-quiesce-window-mode-note.md (section 57, "caller-declared
  run-root mode marker") and consumed verbatim by q12-writer-resume.py
  window_is_cutover(); this round implements the controller write side exactly to
  that spec and introduces no new design decision, so the note is unchanged. No
  other product-behavior doc changed.
graph_reviewed: no-change-needed
graph_review_notes: >-
  Local change confined to deploy/qdrant/q12-lifecycle-core.py (a new
  write_quiesce_window_marker helper + one run_live call + one output field) and
  the ops test/contract files; no architecture, durable workflow, or
  public-surface change. Worktree is a delegated stream awaiting integration.
verification:
  - 'RED->GREEN: 4070ed81e -> c5bd9f698. RED (4070ed81e, test + contract surface only) added the R5 Sub-round C test asserting run_live writes <run-root>/quiesce-window-mode.json with EXACTLY the three keys window_is_cutover() requires ({schema_version, run_id, mode}), schema_version == "megacampus.q12.quiesce-window-mode/v1", mode == "cutover", run_id === the run, mode bits 0o400, the full 76-row forward twin unchanged (parity-neutral), and the marker present after run_live returns (post-activate). It surfaces quiesceWindowMarkerPath on materializeLiveController (contract.ts). Confirmed RED genuinely failed against the current run_live: quiesceWindowMarkerPath was null (run_live wrote no marker) -> toBeTruthy failed.'
  - 'GREEN (c5bd9f698): a new module-level write_quiesce_window_marker(engine) helper (deploy/qdrant/q12-lifecycle-core.py, next to write_live_resource_manifest) builds {schema_version:"megacampus.q12.quiesce-window-mode/v1", run_id: engine.request["run_id"], mode:"cutover"}, canonicalizes via the shared complete_object(), and publishes it to engine.run_root/"quiesce-window-mode.json" through immutable_publish(path, body, 0o400, engine.trace) — the SAME 0400/fsync/atomic-rename discipline every other run-root artifact uses. run_live calls it as its FIRST forward step (before ordinary("operator.self-check"), hence before the group-3 writers.quiesce command) and sets output["quiesceWindowMarkerPath"] = marker_path. No journal API is touched, so the marker is out-of-band (never a journal row).'
  - 'Content/exact-projection proof: Object.keys(marker).sort() === ["mode","run_id","schema_version"] (exact set — a 4th key would fail the W-side exact() check and this assertion); marker.schema_version/mode/run_id equal the consumer constants and the run id. This is the exact projection q12-writer-resume.py window_is_cutover() (:229-234) validates.'
  - 'Parity-neutral proof: with the marker write added, run_live still journals length===76 and live.journalEntries.map(withParityExclusions) deep-equals composer.journalEntries.map(withParityExclusions) across all 76 rows — the marker perturbed nothing in the journal. Whole q12-live-controller.test.ts stays 8/8 (the R5-B full-76-row twin test re-runs green after the marker write).'
  - 'Post-activate persistence: existsSync(quiesceWindowMarkerPath) === true after run_live returns (i.e. after the group-16 activate row) — the marker survives the full forward window.'
  - '0400 proof: statSync(quiesceWindowMarkerPath).mode & 0o777 === 0o400, matching the Opened(..., 0o400) the consumer enforces.'
  - 'Suites green (from packages/course-gen-platform, SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key pnpm exec vitest run --config vitest.config.unit.ts) across the 4-suite no-docker set (q12-live-controller + q12-live-cutover + q12-retained-barrier-quiesce-seam + q12-retained-barrier-w-composition-seam): 306/306 (was 305; +1 = this test). pnpm exec tsc --noEmit = 0.'
  - 'Frozen bytes byte-identical after GREEN: q12-command-manifest.json aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841, q12-database-barrier.sh 3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9, q12-structural-catalog.sql 0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e. No W-owned file changed (q12-writer-resume.py untouched); run_joined_composer body byte-unchanged.'
  - 'python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r5c.md -> artifact validation OK.'
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-controller.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts
  - docs/superpowers/plans/2026-07-17-q12-live-controller.md
explicit_defers:
  - 'The SECOND observation point of the marker-lifetime duty — "present BEFORE the group-3
    writers.quiesce row" — is NOT asserted here. run_live runs to completion in one call, so
    observing mid-run state (before it journals writers.quiesce) requires a run_live
    stop/checkpoint seam. That seam is the C7-stop / drive_forward_tail machinery planned for
    R5 Sub-round D, which is HELD for orchestrator ruling 2 (recover idempotence scope). This
    round proves the write is run_live''s FIRST forward step structurally (before
    operator.self-check) and asserts the post-activate observation point; the before-group-3
    observation point rides on the R5-D checkpoint seam. FLAGGED for orchestrator awareness —
    not a silent omission.'
  - "Consumer-side negatives (missing marker -> recovery gate; stray cutover marker over a
    recovery-state receipt; wrong run_id) are owned by the W-amendment test
    (qdrant-source-recovery-runtime.test.ts) per the design note reviewer endorsement
    (2026-07-17-q12-quiesce-window-mode-note.md :164-170), and q12-writer-resume.py parses argv
    at module import so window_is_cutover() cannot be driven in isolation as a no-docker unit
    oracle. This round therefore proves the controller writes EXACTLY the valid contract
    (positive), and does not re-implement the consumer's validation as a live-side negative."
---

# Summary

R5 Sub-round C (cutover-window marker write) is delivered on branch
`codex/q12-live-controller`: RED `4070ed81e` -> GREEN `c5bd9f698` -> docs. The
Task-9 live controller `run_live` now writes the caller-declared
`quiesce-window-mode.json` marker — the out-of-band cutover signal the W-side
`q12-writer-resume.py` `window_is_cutover()` consumes (design note section 57)
— as its FIRST forward step, before the group-3 `writers.quiesce` command. The
marker carries EXACTLY the three keys the consumer's `exact()` check requires
(`schema_version` = `megacampus.q12.quiesce-window-mode/v1`, `run_id`,
`mode` = `cutover`), is published 0400 with the shared
`immutable_publish` fsync/atomic discipline, is a side artifact (never a journal
row, so the full 76-row forward twin is byte-unchanged), and persists through
post-activate. `run_live`'s output now surfaces `quiesceWindowMarkerPath`.

# Verification

- RED `4070ed81e` / GREEN `c5bd9f698`; frozen bytes verified byte-identical
  after GREEN (`aaec6fc2…`/`3673ee49…`/`0b8a943f…`).
- `q12-live-controller.test.ts` 8/8 (the new marker test + the R5-B full-76-row
  twin re-running green = parity-neutral); the 4-suite no-docker regression
  306/306; `pnpm exec tsc --noEmit` = 0. No W-owned file changed;
  `run_joined_composer` body byte-unchanged.
- `validate_artifact.py` on this file -> OK.

# Risks / Follow-ups

- **Marker-lifetime "before group-3" observation point is deferred to R5-D.**
  Asserting the marker is present _before_ the `writers.quiesce` row (not just
  at post-activate) requires a `run_live` mid-run stop/checkpoint seam — the
  same C7-stop machinery held for orchestrator ruling 2. This round delivers the
  write + post-activate observation point; the mid-run point is explicitly
  flagged, not silently dropped.
- **Consumer negatives stay W-side.** The missing/stray/wrong-run_id negatives
  live in the W-amendment test; `q12-writer-resume.py` parses argv at import so
  its `window_is_cutover()` is not a no-docker unit oracle. The live side proves
  it writes exactly the valid contract.
- **Next unblocked:** none on the live-controller marker path — R5-D/E remain
  held for the two pending rulings (OQ3 cleanup receipt-only; recover idempotence
  scope). The optional R5-F (live/recover CLI wiring) is independent of those.
