---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-r8i-a
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform
base_commit: b4d2ae1ee
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: >-
  Committed in place on the existing isolated worktree/branch (codex/q12-live-controller)
  per the launching orchestrator's explicit instruction; NOT pushed. No new worktree/branch
  created. The frozen-barrier cleanup child runs in a per-invocation /tmp/mc2-q12-barrier-cleanup-*
  sandbox that the seam tears down (shutil.rmtree) after the child exits; no docker/PG used
  (the barrier's own protected test mode, no real PG). Confirmed no leaked sandbox dirs.
risk_level: high
docs_reviewed: updated
docs_review_notes: >-
  docs/superpowers/plans/2026-07-17-q12-live-controller.md implementation log updated with the
  R8-I-A entry (journaled post-activate barrier.cleanup segment; the three §6b.4 core extensions;
  the real frozen-barrier cleanup child invocation via the protected test-mode sandbox; the
  parity-neutral 76-row-prefix scoping; the shared derive_run_id uuid4 shape change). The design
  spec (docs/superpowers/specs/2026-07-17-q12-live-controller-design.md §6b) is the ratified gate
  and is unchanged. No frozen byte touched.
graph_reviewed: no-change-needed
graph_review_notes: >-
  Change is confined to deploy/qdrant/q12-lifecycle-core.py (three additive extensions + the
  run_live post-activate rewrite, no new module/service/public surface) plus two test/fixture
  files under packages/course-gen-platform/tests/unit/ops/. No new durable workflow or
  architecture edge; the existing local graph models q12-lifecycle-core.py at the right
  granularity. Delegated worktree stream; no local Graphify refresh performed here.
verification:
  - 'Branch confirmed codex/q12-live-controller for every commit (git rev-parse
    --abbrev-ref HEAD == codex/q12-live-controller; HEAD at start b4d2ae1ee).'
  - 'RED->GREEN->docs commits on codex/q12-live-controller (see Summary for shas).'
  - 'Vitest (no docker, no PG): SUPABASE_URL=http://127.0.0.1:54321
    SUPABASE_SERVICE_KEY=synthetic-test-key pnpm exec vitest run --config
    vitest.config.unit.ts tests/unit/ops/q12-live-controller.test.ts -> 13 passed
    (incl. the new R8-I-A test that drives the REAL frozen q12-database-barrier.sh
    cleanup child end-to-end). RED confirmed first: the R8-I-A test fails against the
    pre-impl core (asserts 81 rows / barrier.cleanup rows, old receipt-only path yields 76).'
  - 'Regression batch (shared derive_run_id uuid4 blast radius + runner/core consumers):
    q12-retained-barrier-quiesce-seam, q12-retained-barrier-w-composition-seam,
    qdrant-source-recovery-runtime -> 205 passed; q12-d6-root, q12-live-cutover-cli,
    q12-live-cutover, q12-root-join, q12-command-manifest, q12-migration-plan,
    q12-live-controller -> 380 passed / 12 skipped. No regressions.'
  - 'pnpm exec tsc --noEmit -> exit 0.'
  - 'Frozen trio sha256sum UNCHANGED: q12-command-manifest.json aaec6fc2...,
    q12-database-barrier.sh 3673ee49..., q12-structural-catalog.sql 0b8a943f...
    (byte-identical before/after).'
  - 'W-owned files clean in git status (q12-writer-resume.py, source-recovery-run.sh,
    q12-source-manifest.ts: no modification).'
  - 'OPERATIONS guard: "cleanup" NOT added to OPERATIONS/COMMANDS/MANIFEST_COMMAND_IDS
    (sed OPERATIONS block | grep -c cleanup == 0); barrier.cleanup lands entirely outside the
    manifest coupling, so load_manifest exact-set assert is untouched (no frozen-manifest hard stop).'
  - 'Runner-purity guard preserved: the seam contains 0 of the forbidden core serializer
    literals (cutover-journal/v1, cutover-checkpoint/v1, host-command-capability/v1); the
    barrier child input checkpoint reuses the core-published phase-checkpoint.json.'
changed_files:
  - 'deploy/qdrant/q12-lifecycle-core.py: (a) validate_journal_entry_grammar barrier.cleanup
    grammar branch + database_barrier_receipt accepted-object pairing; (b) reload_durable cleanup
    capability class; (c) publish_cleanup_capability / move_cleanup_capability / append_cleanup_row
    direct-append caller; run_live post-activate rewrite (orchestrate_post_activate_cleanup) to
    journal the §6b.1 5-row lifecycle around the real barrier child + final reload_durable.'
  - 'packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py:
    RealBarrierCleanupChild (protected-test-mode sandbox that runs the frozen barrier cleanup
    child FOR REAL against the controller journal); prepare_barrier_cleanup/execute_barrier_cleanup
    seam (v1 archive + exact 10-key v2 promotion + probe); derive_run_id -> deterministic UUIDv4.'
  - 'packages/course-gen-platform/tests/unit/ops/q12-live-controller.test.ts: R8-I-A RED test
    (the journaled 5-row barrier.cleanup segment + real barrier acceptance + 10-key v2 + 76-row
    prefix byte-unchanged); R5-A/R5-C/R5-D parity assertions rescoped to the 76-row PREFIX; the
    past-activate recover-refusal updated to the new barrier.cleanup/accepted head.'
explicit_defers:
  - 'run_recover DISPATCH generalization (Option A 8-head table, §6b.2) is R8-I-B — NOT touched
    here. run_recover still uses the R5 two-head dispatch; a full run now fails closed on the new
    barrier.cleanup/accepted head (named refusal, no supervisor pointer since cleanup is not an
    OPERATIONS barrier). The §6b.6 composed mid-barrier recover acceptance probes ride with R8-I-B.'
  - "The real full-PG17 cleanup window (MC2_Q12_REAL_PG17) is downstream R8-B — NOT started. The
    cleanup child here runs only in the barrier's protected test mode (no real PG), which is the
    exact sandbox the earlier R4-B/database-barrier rounds use."
---

# Summary

Implements design §6b (ratified 2026-07-18) R8-I-A: the journaled post-activate `barrier.cleanup`
CLEANUP SEGMENT in `run_live`, reversing RULING 1's receipt-only-after-activate decision (§6a item 6) for the real path while PRESERVING the receipt-only RESUME half (now frozen-forced by the
barrier's tail-contiguity rule).

Three additive `q12-lifecycle-core.py` extensions, all OUTSIDE the
`OPERATIONS`/`COMMANDS`/`MANIFEST_COMMAND_IDS` coupling (§6b.4 — `barrier.cleanup` is not a manifest
command, so no frozen-manifest change; `load_manifest`'s exact-set assert is untouched):

- (a) `validate_journal_entry_grammar` (~:290) — a `guard_cleanup_complete`/`barrier.cleanup`
  grammar branch mirroring the frozen barrier tail grammar (`q12-database-barrier.sh:507-553`),
  plus extending the shared accepted-object pairing gate (~:240) to admit
  `accepted_object_kind == database_barrier_receipt` for the terminal accepted row. This pairing
  extension is a SUB-PART of extension (a) (same function), NOT a separate/4th rejecting authority.
- (b) `reload_durable` (~:1122) — a cleanup capability class keyed off the non-manifest
  `barrier.cleanup` command id (`cleanup:<epoch>`), skipping the OPERATIONS retained-copy binding
  and the OPERATIONS capability-graph loop, keeping the journal-reference check.
- (c) `publish_cleanup_capability` / `move_cleanup_capability` / `append_cleanup_row` (~:1670) — a
  NEW direct-`Engine.append` caller fed the barrier-child-provided `command_sha256`, since
  `append_ordinary_lifecycle`/`retained_chain`/`append_controller_milestone` all KeyError through
  `resolved_command` on the non-manifest id. `Engine.append` stays the one journaling primitive.

`run_live` post-activate (`orchestrate_post_activate_cleanup`, ~:3262) now journals the §6b.1 5-row
lifecycle around the REAL frozen barrier child: intent (cap 0×64) -> capability_issued ->
capability_claimed; the frozen `q12-database-barrier.sh cleanup` child runs FOR REAL against the
controller's own journal (validating to the claimed boundary, publishing the 18-key terminal proof);
then capability_completed -> accepted (binding sha256 of the promoted v2 receipt). A final
`reload_durable` proves the controller's own durable walk accepts the extended 81-row journal.
`writers.resume.forward` stays receipt-only (journals nothing). The forward 76-row prefix is
byte-unchanged.

## Commits (this branch, chronological)

- RED: the R8-I-A test + rescoped R5-A/R5-C/R5-D assertions (fails against the pre-impl core).
- GREEN: the three extensions + the run_live post-activate rewrite + the runner real-barrier seam.
- docs: this artifact + the plan implementation-log entry.

## HARD-STOP classes — none triggered

- No manifest entry / no `cleanup` in OPERATIONS (verified grep-c == 0; the three extensions land
  outside the manifest coupling).
- No frozen byte modified (frozen trio sha256 byte-identical; the barrier is INVOKED, never edited)
  and no W-owned file touched.
- No 4th rejecting validation path: the amendment predicted exactly three (a/b/c). The
  accepted-object pairing gate is part of extension (a), not a fourth authority.

# Verification

See the frontmatter `verification` list for the exact commands and results (vitest 13-pass R8-I-A
suite driving the real barrier child, the 205- and 380-test regression batches, tsc 0, frozen
sha256 unchanged, W-owned clean, OPERATIONS/runner-purity guards). All commands run with
`cd .../q12-live-controller/packages/course-gen-platform` and the SUPABASE\_\* fixture env; no
docker/PG.

# Risks / Follow-ups

- `derive_run_id` (shared test fixture) now returns a deterministic UUIDv4 instead of a UUIDv5,
  because the frozen barrier requires `--run-id` to be a UUIDv4 (`q12-database-barrier.sh:72`).
  Composer and live both derive from the same helper, so parity is preserved; the 205-test
  cross-fixture regression batch confirms no consumer regressed. This is the one broad-blast-radius
  change and the reviewer should re-confirm it.
- `run_recover` dispatch is deliberately unchanged (R8-I-B). A full run now ends at the
  `barrier.cleanup/accepted` head; recover fails closed there with a named refusal. The Option A
  8-head table and the §6b.6 composed recover acceptance probes are the R8-I-B follow-up.
- The real full-PG17 cleanup window (R8-B) is not started; the child here runs only in the
  barrier's protected test mode.
