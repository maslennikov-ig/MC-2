---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-w-amendment
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform
base_commit: 35b9e91189eb34aa8b86652a3338a477d710ffa0
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: >-
  Same isolated worktree/branch used by the live-controller stream; left in
  place for orchestrator integration, no push. No container/PG17 resources
  used by this round (pure Python/TS fixture surface).
risk_level: high
docs_reviewed: no-change-needed
docs_review_notes: >-
  docs/superpowers/specs/2026-07-17-q12-quiesce-window-mode-note.md is the
  ratified design for exactly this amendment and was read-only input; this
  round implements it faithfully and does not amend the note itself.
graph_reviewed: no-change-needed
graph_review_notes: >-
  Change confined to a single W-owned script (deploy/qdrant/q12-writer-resume.py)
  and its pinned test file; no architecture, durable workflow, or public
  surface change. Worktree is a delegated stream awaiting integration.
verification:
  - 'RED `fd7d2273` -> GREEN `2e84c12b`; RED genuinely failed against the
    unmodified q12-writer-resume.py: 4 of the 6 new cases failed (the two
    "already-true" negatives passed trivially), with the positive run_quiesce
    cutover case failing at the original unconditional require with message
    "database barrier receipt is not quiesce-ready" (assertion:
    `expect(result.status, result.stderr).toBe(0)` got 1), the stray-marker
    case failing because status was already 0 (no cutover-vs-recovery branch
    existed yet), the wrong-run_id case failing to match
    /window mode marker/ (message was still "...not quiesce-ready", no marker
    validation existed), and the resume-side positive failing at the original
    unconditional :1246 require ("writer quiesce barrier binding is invalid").'
  - 'Full suite from packages/course-gen-platform (SUPABASE_URL=http://127.0.0.1:54321
    SUPABASE_SERVICE_KEY=synthetic-test-key pnpm exec vitest run --config
    vitest.config.unit.ts tests/unit/ops/qdrant-source-recovery-runtime.test.ts):
    155/155 passed (149 pre-existing + 6 new cutover-window cases), including the
    frozen recovery-positive case ("publishes the exact immutable quiesce
    inventory, transitions, and final evidence") which is byte-unchanged (git
    diff over the whole round shows no edits inside it, only additions
    elsewhere in the file).'
  - 'pnpm exec tsc --noEmit = 0 (no sibling-workspace rebuild needed; only a
    .py file and the one .ts test file changed).'
  - 'Frozen bytes byte-identical, verified after GREEN: q12-command-manifest.json
    aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841,
    q12-database-barrier.sh
    134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68,
    q12-structural-catalog.sql prefix 0b8a943f38b43bf9. None touched.'
  - 'python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-w-amendment.md -> artifact validation OK.'
changed_files:
  - deploy/qdrant/q12-writer-resume.py
  - packages/course-gen-platform/tests/unit/ops/qdrant-source-recovery-runtime.test.ts
explicit_defers:
  - 'The live controller (Task-9) side of this amendment — writing
    quiesce-window-mode.json before invoking the frozen writers.quiesce
    manifest command — is out of scope for this W-owned round and is a
    separate controller-stream task; tracked as the design note''s own
    "Boundaries of the amendment round" item, not a new Beads issue, since
    the live-controller stream already owns that follow-on.'
---

# Summary

Implements the ratified OQ1 mode-aware quiesce W-contract amendment
(`docs/superpowers/specs/2026-07-17-q12-quiesce-window-mode-note.md`,
P2-1/P2-1b) on branch `codex/q12-live-controller`: RED `fd7d2273` -> GREEN
`2e84c12b`. This is a security-sensitive relaxation of a fail-closed
write-quiesce precondition, made mode-aware rather than weakened: the
recovery-mode gate stays byte-for-byte identical when the run-root
`quiesce-window-mode.json` marker is absent; only a present, run_id-matched,
`mode=="cutover"` marker opens the alternate join-era shape.

Two couplings in `deploy/qdrant/q12-writer-resume.py` were amended:

1. **`run_quiesce()` barrier-receipt gate** (originally lines 325-335,
   dispatched from `mode=="quiesce"` at what was 1024-1026): now branches on
   a new `window_is_cutover()` marker reader. Cutover branch requires
   `state=="maintenance_guarded"`, `last_command=="install"`,
   `rollback_probes_verified is False`, `probe_receipt_sha256 is None`,
   retaining `zero_guard_residue is False`, `run_id` match, and
   `hex64(expected_catalog_sha256)`. The unconditional db-capability-present
   check (originally :336-345) is untouched. Marker absent keeps the exact
   original recovery require verbatim (same conditions, same message).
2. **Resume-side quiesce-manifest barrier binding** (originally lines
   1245-1248, `mode` in `{forward, rollback}`): same marker read at resume
   time. Cutover branch requires `quiesce["barrier"]["state"] ==
"maintenance_guarded"`, `zero_guard_residue is False`,
   `expected_catalog_sha256` matching the resume-time v2 cleanup/rollback
   receipt, and `probe_receipt_sha256 is None`; for `mode=="forward"` it
   **drops** the `quiesce.barrier.probe == cleanup.barrier.probe` equality
   entirely (no cutover substitute — see Risks). Marker absent keeps the
   exact original binding verbatim, including the forward-only probe
   equality check.

`window_is_cutover()` applies the same owner/mode/`O_NOFOLLOW`/`run_id`
discipline as every other `q12-writer-resume.py` input via the existing
`Opened`/`exact`/`require` helpers: a present-but-invalid marker (wrong
`run_id`, wrong `schema_version`, wrong `mode` value, wrong owner, wrong
mode-bits, symlink) hard-fails via `require`/`Opened` — it never silently
falls back to either gate.

No frozen byte was touched: `q12-command-manifest.json`,
`q12-database-barrier.sh`, and `q12-structural-catalog.sql` are all
byte-identical to their pinned digests before and after this round.

# Verification

- RED `fd7d2273` -> GREEN `2e84c12b`. RED genuinely failed against the
  unmodified script: 4 of 6 new cases failed pre-GREEN (positive cutover
  run_quiesce gate, stray-marker rejection message, wrong-run_id rejection
  message, resume-side cutover positive); the 2 "unchanged recovery
  behavior" negatives passed trivially since they assert today's
  byte-identical rejection.
- Full `qdrant-source-recovery-runtime.test.ts` suite: **155/155 passed**
  (149 pre-existing + 6 new), including the frozen recovery-positive test
  (byte-unchanged — `git diff` over the whole round shows only additions
  elsewhere in the file, no edits inside that test body).
- `pnpm exec tsc --noEmit` = 0.
- Frozen bytes verified byte-identical after GREEN: manifest `aaec6fc2…`,
  barrier script `134255ce…`, structural-catalog prefix `0b8a943f…`.
- `validate_artifact.py` on this file -> OK.

# Risks / Follow-ups

- **MODE-SCOPED BINDING CHANGE, not a mechanical relaxation (flag for the
  round reviewer):** dropping the cutover-mode forward-resume probe equality
  (originally `:1248`, `quiesce.barrier.probe == cleanup.barrier.probe`) is
  a genuine removal of a cross-binding check, not a like-for-like weakening
  of an existing condition. Rationale: in the group-3 join ordering, the
  quiesce manifest is written before any barrier probe receipt exists, so it
  cannot carry a probe-receipt hash to bind against — there is nothing to
  bind at that point in the chronology. The probe receipt that _does_ exist
  by resume time remains fully validated by the forward cleanup receipt's
  own checks, independent of this binding: `last_command == "cleanup"` and
  `rollback_probes_verified is True` and `hex64(probe_receipt_sha256)`
  (originally `:1076`), and the receipt's `probe_receipt_sha256` is matched
  against the actual probe-receipt file's digest (originally `:1078`). So
  the probe receipt is still hash-verified against its own file; only the
  additional cross-check tying it back to a value the cutover quiesce
  manifest structurally cannot carry is removed. If the reviewer identifies
  a substitute cross-binding available under cutover ordering (e.g. binding
  against some other join-era artifact), that would be a normal, welcome
  finding — it is called out here specifically because it is a security
  binding removal, not because it is believed unsound.
- The live controller's side of this amendment (writing
  `quiesce-window-mode.json` before invoking the frozen `writers.quiesce`
  manifest command) is a separate Task-9 controller round per the design
  note; this W-side amendment is inert on its own until that marker-writing
  round lands and actually opens the cutover window in a real run.
- `window_is_cutover()` is defined once and read at two call sites
  (`run_quiesce()` gate and the resume-side binding); both reads apply
  identical validation, so there is no drift risk between the two call
  sites re-reading the same marker file within one process invocation (the
  script always processes exactly one `mode` per invocation, never both a
  quiesce and a resume in the same process).
