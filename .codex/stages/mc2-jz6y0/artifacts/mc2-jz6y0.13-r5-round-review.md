---
schema_version: orchestration-artifact/v1
artifact_type: review
task_id: mc2-jz6y0.13-r5-round-review
stage_id: mc2-jz6y0
repo: https://github.com/maslennikov-ig/MC-2.git
branch: codex/q12-live-controller
base_branch: master
base_commit: 30c5c1fdc
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: 'Read-only pre-merge review; single write is this artifact. No code/config modified, no server/db/docker command run.'
risk_level: low
verification:
  - 'Reviewed range 30c5c1fdc..704944cdc (26 commits, 8 TDD triples) via git show/diff in worktree /home/me/code/mc2/.worktrees/q12-live-controller.'
  - 'Frozen trio at 704944cdc UNTOUCHED: manifest aaec6fc2…, barrier 3673ee49…, structural 0b8a943f…; W-owned files (q12-writer-resume.py, source-recovery-run.sh) untouched; only deploy/qdrant/q12-lifecycle-core.py (+434) and q12-live-cutover.sh (+6) changed among deployed files.'
  - 'Composer body byte-unchanged: no diff hunk touches run_joined_composer; the 76-row twin is produced by run_live/run_recover via NEW d5/ordinary wrappers that call the SAME engine primitives (append_ordinary_lifecycle, retained_chain, publish_final_writer_manifest, derive_root_writer_inventory) — no forked serialization.'
  - "76-row tail (drive_forward_tail): group 14 FWM = engine.publish_final_writer_manifest('forward', derive_root_writer_inventory(...), resolved_command(...)); group 15 = ordinary('deploy.commit'); group 16 = d5('activate') — same primitives as the composer's forward tail."
  - "FWM 3-part parity (test): row-structure twin; accepted_object_sha256 excluded on the FWM accepted row ONLY (row-scoped, because it hashes the per-run-root physical fields); FWM-content parity strips EXACTLY publication_intent_journal_entry_hash + input_checkpoint_sha256; the test asserts both physical fields are present AND differ from the composer's (parity not cheated)."
  - 'Cleanup RECEIPT-ONLY (orchestrate_post_activate_cleanup): NO journal row (76-row twin preserved), grammar untouched, the v2 receipt gate lives in the resume child (run_live only binds hex64 receipt digest + resume-validates-same-receipt), outcomes recorded on output.postActivate.'
  - "Recover scope (run_recover): resumes ONLY head==deploy.prepare/completed (C7, from group 14) and head==writers.resume.forward/accepted (crash-after-FWM, from group 15); every other head raises a NAMED LifecycleError naming phase/outcome/command, with a supervisor pointer ('q12-live-cutover.sh <op>') for barrier heads; the refusal test asserts readFileSync(journal) unchanged."
  - "resource_manifest_sha256 rehydration matches the run_claim precedent (request value = durable last row's resource_manifest_sha256, source :~2723) — a legal request-global value (== entries[-1]) for validate_stable_binding_walk, so it anchors rather than bypasses the walk."
  - "Marker (write_quiesce_window_marker): EXACT 3-key object {schema_version:'megacampus.q12.quiesce-window-mode/v1', run_id, mode:'cutover'} matching the W consumer's exact(); 0400 immutable_publish; side artifact (never a journal row, parity-neutral); written before group 3; before-group-3 observation via stop_after=='writers.quiesce.pre'."
  - "stop_after seam fail-closed: any value not in {None,'writers.quiesce.pre','deploy.prepare','final-writer-manifest'} raises; every stop returns post_activate=False at a clean durable boundary (a stopped run does not run post-activate)."
  - 'Pre-flight gate (require_post_activate_executor): fires at the top of BOTH run_live and run_recover (production only), before Engine construction / genesis / run-root mutation; the late gate in orchestrate_post_activate_cleanup is kept as defense-in-depth.'
  - "R4 count corrections are strengthenings: ordinaryKeys 12→13 (adds deploy.commit), childExecutions 16→18 (full window incl the activate delegation) — larger, correct counts reflecting the extended window; no test weakened (the removed 'stops-at-C7' assertions are replaced by the full 76-row twin + the stop_after C7 coverage)."
  - 'CLI wiring: plan/supervisor/claim/smoke dispatch byte-unchanged (a distinct live/recover branch inserted before the run_claim fallthrough); the production request mirrors the supervisor branch exactly (run-root /opt/megacampus/backups/q12/<id>, cutover.lock FD9 O_NOFOLLOW+flock LOCK_EX|LOCK_NB, production=True, lease_fd 9, lock_identity); wrapper routing additive (live/recover exact-match, no supervisor misroute).'
  - 'Did NOT run the vitest suite or any server/db/docker command (constraint); relied on the reported 267+7 green + tsc 0 plus the static verification above.'
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - deploy/qdrant/q12-live-cutover.sh
  - packages/course-gen-platform/tests/unit/ops/q12-live-controller.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-live-cutover-cli.test.ts
explicit_defers:
  - 'P3-1: post-activate cleanup+resume is receipt-only (not journaled), so a crash AFTER the group-16 activate row but before writers.resume.forward completes leaves no recover-resumable head (recover refuses at the barrier.activate head); crash-anywhere idempotence for that point-of-no-return region is explicitly deferred to R8 and gated by the pre-flight/late executor checks — the window must not open until R8 proves it.'
  - "P3-2: run_recover's barrier-head refusal pointer fires for ANY barrier.* head including a completed run's barrier.activate head, where 're-run the standalone supervisor activate' is technically idempotent but semantically odd for an already-complete run; fail-closed and named, so harmless — minor message-precision polish."
  - 'Informational: the real post-activate docker/PG17 executor hooks (execute_barrier_cleanup/execute_forward_resume) are wired in R8, so a PRODUCTION live/recover intentionally fails closed at the pre-flight until then (correct); the barrier-fix cascade (frozen-trio succession, W-tuple field-4, server reinstall) tracked in earlier reviews still gates the window and is unaffected by this round.'
---

# Summary

**Correctness / compliance verdict: PASS.** **Quality / improvement verdict: PASS.**
**No P0, no P1 — mergeable.** Findings: two P3 (deferred crash-during-post-activate
resumption, and a minor refusal-message polish) plus one informational note. Every
ruling was implemented exactly as recorded, with no deviations, and every adversarial
focus item checks out.

The round completes the forward window (groups 14-16) and adds `recover` while keeping
the closed composer the byte/order parity oracle: the composer body is untouched, the
76-row tail is driven through the same engine primitives (no forked serialization), the
post-activate cleanup is receipt-only (no journal row, so the 76-row journal stays a
twin), and `recover` supports exactly the two ruled checkpoints with a NAMED
fail-closed refusal — journal byte-unchanged — everywhere else. The frozen trio and the
W-owned files are untouched, the CLI mirrors the supervisor's production seam, and the
count corrections are strengthenings.

# Verification

## Frozen surface and composer parity

Manifest `aaec6fc2…`, barrier `3673ee49…`, structural `0b8a943f…` byte-unchanged;
`q12-writer-resume.py` / `source-recovery-run.sh` untouched; only `q12-lifecycle-core.py`
(+434) and `q12-live-cutover.sh` (+6) changed. No hunk touches `run_joined_composer`, so
the parity oracle is byte-unchanged. `drive_forward_tail` emits groups 14-16 via
`engine.publish_final_writer_manifest` / `ordinary` (`append_ordinary_lifecycle`) / `d5`
(`retained_chain`) — the SAME primitives — so the 76-row twin forks no second serializer.

## FWM 3-part parity (RULING)

The R5-A parity test drives the live controller and the composer with the same
deterministic inputs and asserts: (1) the group-14/15/16 rows are a byte/order twin;
(2) the FWM accepted row's `accepted_object_sha256` is excluded from the row match ONLY
for that row, because it hashes the whole FWM file including the two per-run-root
physical fields; (3) a separate FWM-content parity strips EXACTLY
`publication_intent_journal_entry_hash` + `input_checkpoint_sha256` and byte-matches the
remaining root-independent fields, while asserting the two physical fields are present
and genuinely DIFFER from the composer's — so the exclusion is necessary and the parity
is not cheated. Exactly the ruling.

## Cleanup receipt-only (RULING 1)

`orchestrate_post_activate_cleanup` adds no journal row (grammar has no cleanup
`command_id`; the 76-row journal stays a twin), invokes the barrier cleanup + forward
resume through executor hooks, and records `{cleanup, resume}` on `output.postActivate`.
The v2 receipt gate is enforced by the resume child, not reimplemented in `run_live`; the
controller only binds a hex64 cleanup-receipt digest and that the resume validated the
same receipt (a wiring-coherence check). When the hooks are absent it degrades to `None`
for fixtures but fails closed for `production:true` (a production run that activated and
then silently skipped resume would strand the writers).

## Recover scope (RULING 2)

`run_recover` resumes ONLY `deploy.prepare/completed` (C7 → tail from group 14) and
`writers.resume.forward/accepted` (crash-after-FWM → tail from group 15, `include_fwm=False`);
every other head raises a NAMED `LifecycleError` naming `phase`/`outcome`/`command`, with a
`q12-live-cutover.sh <op>` supervisor pointer for `barrier.*` heads. The refusal path is
read-only (raise before `drive_forward_tail`), and the test asserts the durable journal is
byte-for-byte unchanged after the refusal. Resource-manifest rehydration mirrors
`run_claim` (`request[resource_manifest_sha256] = last row's value`), a legal
request-global value for `validate_stable_binding_walk`, so it anchors rather than bypasses
the walk; `current_resource/quiesce_manifest_sha256` are pinned to the head so resumed rows
carry the exact stepped values.

## Marker, stop_after, pre-flight

`write_quiesce_window_marker` publishes the exact 3-key object the W consumer's `exact()`
requires, 0400, as a parity-neutral side artifact written before group 3; the
before-group-3 observation point is `stop_after=="writers.quiesce.pre"`. `stop_after` is
fail-closed (unknown value raises) and every stop returns `post_activate=False` at a clean
durable boundary, so a stopped run leaves a valid journal prefix and never runs
post-activate — nothing for `recover` to mis-trust. `require_post_activate_executor` fires
at the top of both `run_live` and `run_recover` (production only), before Engine
construction / genesis / any run-root mutation, so a production run without the post-activate
hooks never journals through activate; the late seam gate remains as defense-in-depth.

## Counts, CLI, and no weakening

`ordinaryKeys` 12→13 (adds `deploy.commit`) and `childExecutions` 16→18 (full window through
the activate delegation) are strengthenings for the extended window; the removed
`journalEntries.length===c7End` assertions are obsolete (the default run now reaches
activate) and are replaced by the full 76-row twin plus the `stop_after=="deploy.prepare"`
C7 coverage — no net coverage loss. The CLI adds a `live`/`recover` branch before the
`run_claim` fallthrough without touching plan/supervisor/claim/smoke dispatch, and its
production request matches the supervisor's exactly (run-root shape, cutover.lock FD9
`O_NOFOLLOW`+`flock LOCK_EX|LOCK_NB`, `production=True`, `lease_fd 9`, `lock_identity`); the
wrapper routing is additive (`live`/`recover` exact-match, no supervisor misroute). The 7
removed lines are 3 docstring lines + the 4-line old inline tail (refactored into
`drive_forward_tail`) — no gate removed.

# Risks / Follow-ups

- **P3-1 (confidence high) — crash-during-post-activate is not recover-resumable yet.**
  The post-activate cleanup+resume is receipt-only (no journal row), so a crash after the
  group-16 activate row but before `writers.resume.forward` completes leaves the writers
  quiesced with no recover-resumable head (recover refuses at the `barrier.activate` head).
  This point-of-no-return crash-anywhere idempotence is explicitly deferred to R8 and gated
  by the pre-flight/late executor checks. Not a merge blocker for R5's scope, but the window
  must not open until R8 proves it.

- **P3-2 (confidence low) — refusal pointer for a completed run.** `run_recover`'s
  barrier-head pointer fires for any `barrier.*` head, including a completed run's
  `barrier.activate` head, where "re-run the standalone supervisor activate" is idempotent
  but semantically odd for an already-complete run. Fail-closed and named, so harmless;
  minor message-precision polish only.

- **Informational.** The real post-activate docker/PG17 executor hooks
  (`execute_barrier_cleanup` / `execute_forward_resume`) are wired in R8, so a production
  `live`/`recover` intentionally fails closed at the pre-flight until then (correct). The
  frozen-trio succession / W-tuple field-4 / server reinstall cascade tracked in the
  barrier-fix review still gates the window and is unaffected by this round (it leaves all
  frozen bytes untouched).
