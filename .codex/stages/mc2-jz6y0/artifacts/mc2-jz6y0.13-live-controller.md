---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13-live-controller
stage_id: mc2-jz6y0
agent_type: implementation worker
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: /home/me/code/mc2
branch: codex/q12-live-controller
base_branch: codex/self-hosted-qdrant-platform
base_commit: 055df85f117c538bc20c4ef767d93025d83b19ad
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: >-
  Isolated worktree /home/me/code/mc2/.worktrees/q12-live-controller and branch
  codex/q12-live-controller left in place for orchestrator integration; no push.
  R3 is pure in-process fixture journaling (no docker/PG17), so there are no
  container resources to reclaim.
risk_level: medium
docs_reviewed: updated
docs_review_notes: >-
  docs/superpowers/plans/2026-07-17-q12-live-controller.md implementation log
  updated (R3 done) in the same delivery; design/spec docs unchanged (R3 is
  faithful to design §4 OQ4, §6a ruling 1/4, plan "R3 constraint 2026-07-18",
  and design-review P3-2). No product-behavior doc other than the plan changed.
graph_reviewed: no-change-needed
graph_review_notes: >-
  Local change confined to deploy/qdrant/q12-lifecycle-core.py + ops test/fixture
  files; no architecture, durable workflow, or public-surface change. Worktree is
  a delegated stream awaiting integration, so no local Graphify refresh here.
verification:
  - 'R3 resource-manifest 2-step binding RED->GREEN: 4fdef6e8 -> 2cd88fc3. run_live now journals amendment §5 groups 1-13 (through deploy.prepare/completed = the design §6a ruling-1 C7 planned-exit checkpoint) as a byte/order twin of run_joined_composer''s forward PREFIX on every shared binding. New module-level write_live_resource_manifest fsyncs a real checkpoint-bound resource-manifest artifact (0400) at three stages — genesis (empty-accepted, pre-first-row so no checkpoint), snapshot (records <exported-id>), targets (records five identities) — and run_live steps current_resource_manifest_sha256 to each digest EXACTLY at the two witnesses: snapshot set BEFORE pg.backup/intent (composer parity: snapshot_step), targets via resource_step_before_completion at deploy.prepare/completed (composer parity: targets_step). request["resource_manifest_sha256"] is set to the genesis digest so the walk''s first/last request-global pin (validate_stable_binding_walk:357-368) holds against a real controller-owned artifact. Substitution values come from derive_joined_fixture_values(run_id, quiesce_path) — the parity proof feeds the SAME quiesce-manifest PATH to both drivers so every <quiesce-manifest>-bearing command_sha256 (pg.backup/source.forward/deploy.prepare) matches.'
  - 'Parity exclusion is the BLESSED set only (design §6a ruling 4; plan 2026-07-18): capability_manifest_sha256, entry_hash, previous_hash (per-run-root physical binding) + resource_manifest_sha256 VALUE-only (real artifact digest != composer fixture derivation). seq is NOT excluded, so the twin reproduces the composer''s exact ordinary+in-process-barrier interleave. The test additionally asserts the resource step TOPOLOGY (changes exactly at pg.backup/intent and deploy.prepare/completed, carried unchanged on every other row, three distinct digests, none equal to the composer''s fixture values, first==genesis/last==targets pins), the P3-2 per-barrier segment values (barrier.install->genesis, barrier.verify-after-base/-observability->snapshot, barrier.prepare-recovery->snapshot), and artifact recomputability (each of the 3 files exists 0400 and sha256(bytes)==the row value). An off-witness-step negative drives the REAL validate_stable_binding_walk through a new --validate-walk fixture seam: the unmutated controller journal passes; mutating a mid-segment migration.base.apply/completed row''s resource value is rejected with "resource_manifest_sha256".'
  - 'Suites green (from packages/course-gen-platform, SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=synthetic-test-key pnpm exec vitest run --config vitest.config.unit.ts): q12-live-controller.test.ts 3/3; the shared-fixture suites q12-live-controller + q12-live-cutover + q12-retained-barrier-quiesce-seam + q12-retained-barrier-w-composition-seam 301/301 (composer, retained-barrier, W-composition machinery unregressed by the run_live + fixture-runner changes); qdrant-source-recovery-runtime.test.ts 149/149. Total 453 tests green. R3 is pure in-process journaling/parity so it needs no docker/PG17 surface.'
  - 'pnpm exec tsc --noEmit = 0 (after building the sibling workspace packages shared-types/shared-logger/shared-utils in this fresh worktree; the only .ts change is the ops test file).'
  - 'Frozen bytes byte-identical each round: q12-command-manifest.json aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841, q12-database-barrier.sh 134255cecfb4361d5e9f1922d98f889ab7d3e01898b197dee096ab720039ed68, q12-structural-catalog.sql 0b8a943f38b43bf99813343d365a7884e43d8237691532dc953554138f268b1e. No W-owned file changed (git status clean for q12-writer-resume.py and source-recovery-run.sh). No new resolver/manifest/command/journal authority — run_live drives the same Engine (production seam), load_manifest/resolved_command, and append_ordinary_lifecycle/retained_chain/append_controller_milestone primitives as the composer oracle.'
  - 'python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-live-controller.md -> artifact validation OK.'
changed_files:
  - deploy/qdrant/q12-lifecycle-core.py
  - packages/course-gen-platform/tests/unit/ops/q12-live-controller.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-contract.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-retained-barrier-runner.py
  - docs/superpowers/plans/2026-07-17-q12-live-controller.md
explicit_defers:
  - 'The final-writer manifest (§5 group 14), deploy.commit (15) and activate (16) are deferred past the C7 checkpoint. The FWM accepted_object_sha256 is itself per-run-root (it embeds input_checkpoint_sha256 + the intent row entry_hash, both carrying the journal device+inode), so it cannot cross-root-match within the current blessed 4-field exclusion set; whether it JOINS the blessed physical-binding exclusion class (on the FWM accepted row only) is flagged to the orchestrator for the FWM round (R5). Stopping run_live at the design §6a ruling-1 C7 planned-exit checkpoint keeps R3 parity strictly within the blessed set and needs no new exclusion.'
  - "R4 remains gated on its NON-NEGOTIABLE acceptance (full validateTransition POSITIVE = R2 baseline + a real barrier.install cutover on a full-Supabase seed) and adds real child-execution seams and the in-process barrier EXECUTION; R3 uses the composer's fixture barrier chains (default_joined_chain) and fixture-seeded substitution values only."
---

# Summary

R3 (resource-manifest 2-step binding, OQ4) is delivered on branch
`codex/q12-live-controller`: RED `4fdef6e8` -> GREEN `2cd88fc3` -> docs. The Task-9
live controller `run_live` now journals the forward window through amendment §5
group 13 (`deploy.prepare`/completed — the design §6a ruling-1 **C7 planned-exit
checkpoint**) as a byte/order **twin** of `run_joined_composer`'s forward prefix,
and owns the OQ4 resource-manifest authority: it fsyncs a real checkpoint-bound
resource-manifest artifact and steps `current_resource_manifest_sha256` to its
digest **exactly** at `pg.backup`/intent and `deploy.prepare`/completed.

The one structural decision worth the orchestrator's attention: R3 stops at the C7
checkpoint (group 13) rather than running the whole forward window. Extending
through `activate` (group 16) would pull in the group-14 final-writer manifest,
whose `accepted_object_sha256` is inherently per-run-root (it embeds the checkpoint
digest and the intent-row `entry_hash`, both of which carry the journal file's
device+inode). Excluding that field would be a **5th, un-blessed** parity exclusion
(ruling 1 forbids ad-hoc exclusions), so R3 stops at the sanctioned C7 exit — which
keeps parity strictly inside the blessed 4-field set and, per §6a ruling 1, is
exactly where the controller is designed to pause. The FWM and its exclusion
question move to the FWM round (R5). This is flagged, not silently chosen.

# Verification

- RED `4fdef6e8` / GREEN `2cd88fc3`; frozen bytes verified byte-identical before and
  after (manifest `aaec6fc2…`, barrier `134255ce…`, structural-catalog `0b8a943f…`).
- `q12-live-controller.test.ts` 3/3; shared-fixture suites (live-controller +
  live-cutover + retained-barrier-quiesce-seam + retained-barrier-w-composition-seam)
  301/301; `qdrant-source-recovery-runtime.test.ts` 149/149. Total 453 green.
- `pnpm exec tsc --noEmit` = 0 (sibling workspace packages built first in this fresh
  worktree). No W-owned file (`q12-writer-resume.py`, `source-recovery-run.sh`)
  changed. No second authority: `run_live` reuses the same Engine + serializer /
  capability / object / checkpoint primitives as the composer oracle.
- `validate_artifact.py` on this file -> OK.

# Risks / Follow-ups

- **FWM per-run-root field (ruling-class, flagged for R5):** the §5 group-14
  final-writer manifest's `accepted_object_sha256` transitively carries the journal
  device+inode (via `input_checkpoint_sha256` + the intent row `entry_hash`), so it
  cannot cross-root-match under the current blessed 4-field exclusion set. It belongs
  to the SAME physical-binding class the blessing enumerated but was not listed
  (R1–R2 never journaled the FWM row cross-root). Decision for the orchestrator when
  the FWM round is scoped: bless `accepted_object_sha256` into the physical-binding
  exclusion set **on the FWM accepted row only**, or keep the FWM row out of the
  cross-root parity assertion. R3 avoids the question entirely by stopping at C7.
- **Design-review P3-2 (`activate->targets`)** cannot be asserted inside R3 because
  `activate` is post-C7 (a later round). R3 asserts the in-scope equivalent —
  `install->genesis`, `verify-after-base/-observability->snapshot`,
  `prepare-recovery->snapshot` — plus the two ordinary witnesses and both walk pins.
- **Fixture-runner surface added (test-only):** `quiesceManifestPath` on the live
  spec (the parity proof shares ONE quiesce path with the composer so every
  `command_sha256` matches), a `quiesce_manifest_sha256_readonly` safe digest for
  that shared path, and a `--validate-walk` seam invoking the real
  `validate_stable_binding_walk`. No production seam added to `run_live`.
- OQ1 remains the single window-open blocker (W-contract amendment, other stream);
  R3 is OQ1-independent (fixture quiesce manifest, no live quiesce/resume).
