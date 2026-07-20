---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-r5
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform
base_commit: 98219084e570696e5bce2695a62c627abce35750
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: >-
  Isolated worktree /home/me/code/mc2/.worktrees/q12-live-controller and branch
  codex/q12-live-controller left in place for orchestrator integration; no
  push. Sub-round A is pure in-process fixture journaling (no docker/PG17), so
  there are no container resources to reclaim.
risk_level: medium
docs_reviewed: updated
docs_review_notes: >-
  docs/superpowers/plans/2026-07-17-q12-live-controller.md implementation log
  updated (R5 Sub-round A done, added after the RATIFIED cascade round entry,
  under Round 5 — real forward FWM producer) in the same delivery; design spec
  doc unchanged (the FWM extension is exactly what design section 6a / plan
  Round 5 already specify; this round also resolves the R3-artifact's own
  flagged open question by exercising the ratified 3-part parity split rather
  than introducing a new design decision). No other product-behavior doc
  changed.
graph_reviewed: no-change-needed
graph_review_notes: >-
  Local change confined to deploy/qdrant/q12-lifecycle-core.py + ops
  test/fixture files; no architecture, durable workflow, or public-surface
  change. Worktree is a delegated stream awaiting integration, so no local
  Graphify refresh here.
verification:
  - 'RED->GREEN: 5bc73c08 -> 36f43593. RED (5bc73c08, tests+harness only) added a new "R5 Sub-round A: forward final-writer manifest (FWM) parity" describe block to q12-live-controller.test.ts requiring (1) FWM row structure at rows 67-68 (prepared_quiesced/intent and prepared_quiesced/accepted, accepted_object_kind=final_writer_manifest, command_sha256 byte-equal to the composers rows), (2) the full 68-row journal twin under the blessed exclusions plus a new row-scoped exclusion (withParityExclusions) that additionally drops accepted_object_sha256 ONLY on the writers.resume.forward/accepted row, and (3) a separate FWM-content byte parity once the two per-run-root physical fields are stripped from both the live and composer FWM files, plus a live-FWM self-consistency check (0400 mode, sha256(bytes)==row-68 accepted_object_sha256) and two fail-closed negatives via a new --fwm-negative seam. Confirmed RED genuinely failed against unmodified run_live (still 66 rows): the parity test failed with "missing witness writers.resume.forward/intent" (witnessIndex threw because run_live had not journaled the FWM rows at all). The two negatives and the other 6 pre-existing tests in the file already passed at RED (they either exercise publish_final_writer_manifest directly, independent of run_live, or predate this round).'
  - 'GREEN (36f43593): run_live (deploy/qdrant/q12-lifecycle-core.py) now, immediately after the ordinary("deploy.prepare", resource_step_before_completion=targets_digest) call and before engine.reload_durable(), adds: `inventory = engine.derive_root_writer_inventory(quiesce_bytes, include_targets=True)` then `engine.publish_final_writer_manifest("forward", inventory, resolved_command(manifest, "writers.resume.forward", request))` — verbatim mirror of run_joined_composers own forward_tail_through_activation_ready() call to the same method with the same include_targets=True inventory shape. quiesce_bytes and resolved_command/manifest were already in scope in run_live (used by the pre-existing d5()/ordinary() helpers and the earlier quiesce-digest validation at ~:3148-3150); no new module-level primitive was added. run_lives output dict now also sets output["forwardFinalWriterManifestPath"] = str(forward_path) if forward_path.exists() else None, where forward_path = engine.run_root / f"final-writer-manifest-forward-{request[run_id]}.json" — byte-identical construction to the composers own output augmentation (run_joined_composer ~:3072-3076). run_joined_composers own body is UNCHANGED (verified via git diff: only run_lives docstring and body were touched in this file).'
  - 'Row structure proof: witnessIndex(live.journalEntries, "writers.resume.forward", "intent") === 66 (row 67) and witnessIndex(..., "accepted") === 67 (row 68); live.journalEntries.length === 68; row 68s accepted_object_kind === "final_writer_manifest"; both new rows command_sha256 byte-equal the composers rows at the same indices (proving the FWM commands substitution values match the oracle, since derive_joined_fixture_values is shared).'
  - 'Full-journal-twin proof (part 2 of the 3-part split): a new withParityExclusions helper wraps withoutBlessedExclusions (the pre-existing closed 4-field set: capability_manifest_sha256, entry_hash, previous_hash, resource_manifest_sha256) and ADDITIONALLY deletes accepted_object_sha256 ONLY when command_id===writers.resume.forward && outcome===accepted (i.e. row 68 only). live.journalEntries.map(withParityExclusions) deep-equals composer.journalEntries.slice(0,68).map(withParityExclusions). Every other row (1-67, 69+ N/A since the window stops at 68) keeps exactly the unmodified 4-field blessed set — the row-scoped exclusion is provably narrow (a single row, a single extra field), not a widening of the closed set.'
  - 'FWM-content byte-parity proof (part 3, the separate assertion): both final-writer-manifest-forward-<run-id>.json files (live.forwardFinalWriterManifestPath, composer.forwardFinalWriterManifestPath — the latter already surfaced by materializeJoinedRetainedBarrierFixture) are JSON.parsed; publication_intent_journal_entry_hash and input_checkpoint_sha256 are confirmed present (non-empty) on both, then deleted from both; the TS canonical() serializer (sorted-key, no-whitespace — the same shape the production complete_object()/canonical() emit) is applied to each remainder and the two strings are asserted string-equal (===), i.e. TRUE byte parity, not just deep-equality. All 9 root-independent FWM fields (schema_version, run_id, mode, release_sha, expected_catalog_sha256, writer_quiesce_manifest_sha256, lease_epoch, final_writers, held_writers) byte-matched on the FIRST attempt — no field misclassification was found; nothing needed to move between the parity set and the excluded-physical set from what the task ratified. The two physical fields were additionally asserted to differ between the two independent run roots (proving the strip was meaningful, not a no-op on identical values).'
  - 'Self-consistency proof (mirrors the R3 resource-manifest artifact check): the live FWM file at live.forwardFinalWriterManifestPath is a real fsynced artifact — statSync(...).mode & 0o777 === 0o400, and sha256(readFileSync(path)) === String(live.journalEntries[67].accepted_object_sha256) — proving the row-68 excluded digest is a genuine artifact hash of the full file (physical fields included), exactly as the ratified split describes, not an arbitrary placeholder.'
  - 'Negatives: a new --fwm-negative CLI seam (tests/unit/ops/fixtures/q12-retained-barrier-runner.py, run_fwm_negative_fixture) constructs a real production Engine on a fresh fixture root and calls Engine.publish_final_writer_manifest/derive_root_writer_inventory DIRECTLY (no run_live/composer wrapper) for two cases: "bad-mode" (mode="sideways", inventory=None) raises exactly "final writer manifest mode mismatch" (the mode not in (forward, rollback) guard, unconditional on inventory shape); "no-targets" (mode="forward", inventory built with include_targets=False so inventory[targets] is None) raises exactly "forward manifest requires target identities". The TS wrapper runFwmNegative (fixtures/q12-retained-barrier-contract.ts) treats exit code 2 as the expected LifecycleError path (returns {ok:false, error}) and throws for exit 0/3 (unexpected success) or any other exit code, so a silently-passing negative cannot hide as green.'
  - 'Regression: the pre-existing R3 test ("journals the full forward window...") and both R4 Sub-round A/B tests groups-1-13 twin assertions were changed from a full-length equality (expect(live.journalEntries.length).toBe(c7End)) to a PREFIX comparison (expect(live.journalEntries.slice(0, c7End).map(withoutBlessedExclusions)).toEqual(...)), since run_live now legitimately journals past group 13 (through the new group-14 FWM) — the prefix-through-c7End content assertion is otherwise UNCHANGED, so the original R3/R4 parity claims still hold exactly as before, just no longer coupled to run_live stopping there.'
  - 'Suites green (from packages/course-gen-platform, SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key pnpm exec vitest run --config vitest.config.unit.ts tests/unit/ops/q12-live-controller.test.ts tests/unit/ops/q12-live-cutover.test.ts tests/unit/ops/q12-retained-barrier-quiesce-seam.test.ts tests/unit/ops/q12-retained-barrier-w-composition-seam.test.ts): 305/305 (q12-live-controller.test.ts itself 7/7 — the 5 pre-existing R1/R3/R4A/R4B tests + the 2 new R5 Sub-round A tests). Re-run after both commits landed, for fresh evidence: still 305/305.'
  - 'pnpm type-check (repo-root canonical command) = 0 across every workspace (shared-logger, shared-types, shared-utils, course-gen-platform, web); re-run after the GREEN commit.'
  - 'Frozen bytes byte-identical, verified after both commits: q12-command-manifest.json aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841, q12-database-barrier.sh 3673ee494549d6570c054af62660a9f96cb96ce7a9a08eafcf06c28e19d55ca9, q12-structural-catalog.sql 0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e. No W-owned file changed: q12-writer-resume.py, source-recovery-run.sh, q12-source-manifest.ts all untouched (not present in either commits changed-file list). run_joined_composer body byte-unchanged (diff confined to run_lives own docstring + body).'
  - 'python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-r5.md -> artifact validation OK.'
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-controller.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py
  - docs/superpowers/plans/2026-07-17-q12-live-controller.md
explicit_defers:
  - '`deploy.commit` (group 15) and `activate` (group 16) remain out of scope for this
    sub-round — run_live still stops after the group-14 FWM accepted row. These are R5
    Sub-round B / a later round per the plan Round 5/6 split.'
  - 'The FWM inventory stays the FIXTURE derivation (derive_root_writer_inventory over the
    W-owned quiesce bytes plus the deterministic fixture target identities already produced by
    R3s write_live_resource_manifest "targets" stage) exactly like the composer — this round
    does not introduce a live/real writer-topology authority beyond what R1-R4 already
    established. That remains explicitly the closed FIXTURE scope the task specified for this
    sub-round, not a silent shortcut.'
---

# Summary

R5 Sub-round A (forward final-writer manifest / FWM journaling) is delivered on
branch `codex/q12-live-controller`: RED `5bc73c08` -> GREEN `36f43593` -> docs.
The Task-9 live controller `run_live` now journals amendment §5 group 14 (the
forward FWM) immediately after `deploy.prepare`/completed, as a byte/order
**twin** of `run_joined_composer`'s `publish_final_writer_manifest("forward",
inventory, ...)` call. `run_live` journals 68 rows total (1-66 unchanged +
FWM rows 67-68); its output now surfaces `forwardFinalWriterManifestPath`.

This round directly resolves the open question the R3 artifact flagged to the
orchestrator: whether the FWM accepted row's `accepted_object_sha256` (which is
inherently per-run-root, since it hashes a file carrying the journal's
device+inode via `input_checkpoint_sha256` and the intent row's `entry_hash`)
should join the blessed physical-binding exclusion class on that one row, or be
kept out of cross-root parity entirely. The ratified answer (fed into this
round) is the **3-part split**: (1) row structure parity holds unconditionally,
(2) the row's `accepted_object_sha256` joins the exclusion set **on that row
only** (a narrow, row-scoped widening, not a 5th blessed field applied
everywhere), and (3) the FWM file's _content_ still gets a full, separate byte
parity assertion once its two genuinely per-run-root physical fields are
stripped — so parity is not simply abandoned for the FWM, it is re-partitioned
onto the field class it actually belongs to. All 9 root-independent FWM fields
byte-matched on the first attempt; no field needed to move between the two
classes, so there is no finding to escalate here.

# Verification

- RED `5bc73c08` / GREEN `36f43593`; frozen bytes verified byte-identical
  before and after (manifest `aaec6fc2…`, barrier `3673ee49…`,
  structural-catalog `0b8a943f…`).
- `q12-live-controller.test.ts` 7/7 (2 new + 5 pre-existing, the latter's
  groups-1-13 twin assertion updated to a prefix comparison); the 4-suite
  no-docker regression 305/305.
- `pnpm type-check` = 0 across every workspace. No W-owned file
  (`q12-writer-resume.py`, `source-recovery-run.sh`, `q12-source-manifest.ts`)
  changed. `run_joined_composer`'s own body byte-unchanged — no second
  authority forked; `run_live` reuses the same
  `derive_root_writer_inventory`/`publish_final_writer_manifest` primitives.
- `validate_artifact.py` on this file -> OK.

# Risks / Follow-ups

- **`deploy.commit`/`activate` (groups 15-16) remain later rounds.** This
  sub-round stops after the group-14 FWM accepted row, per its own scope.
- **FWM inventory stays FIXTURE, as specified.** The forward target identities
  still come from R3's deterministic fixture derivation
  (`write_live_resource_manifest`'s "targets" stage), not a live writer
  introspection. A future round that wants `run_live` to derive real target
  identities (rather than the fixture derivation both it and the composer
  share) would need its own explicit scoping — not silently assumed here.
- **Row-scoped exclusion is intentionally narrow.** `withParityExclusions`
  only widens the blessed set for the single `writers.resume.forward`/accepted
  row; every other row (including the intent row at 67) keeps the unmodified
  4-field blessed set. If a later round (rollback FWM, `deploy.commit`, etc.)
  introduces another per-run-root accepted-object row, it should get its own
  narrow row-scoped exclusion rather than widening the global blessed set.
- No field classification surprises to report: all 9 root-independent FWM
  fields (`schema_version`, `run_id`, `mode`, `release_sha`,
  `expected_catalog_sha256`, `writer_quiesce_manifest_sha256`, `lease_epoch`,
  `final_writers`, `held_writers`) byte-matched the composer's FWM on the
  first attempt.
