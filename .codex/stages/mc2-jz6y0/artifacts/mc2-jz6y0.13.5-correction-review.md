---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.5-correction-review
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Closing an immutable P1 persistence finding requires exact pinned-runtime evidence across container replacement, volume loss, restore correctness, and failure auditing.
repo: mc2
branch: codex/q12-local-snapshot-review
base_branch: codex/q12-local-snapshots
base_commit: 52aa83d02528fddd6c544467190f43023ea506b4
reviewed_range: ac494372a3ed14de0d9dbb032c3e79cf2373312a..52aa83d02528fddd6c544467190f43023ea506b4
immutable_finding_commit: 6326769d71bfeeae76afff00c6a75e4a8022b31a
worktree: /home/me/code/mc2/.worktrees/q12-local-snapshot-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.5-correction-review.md
success_criteria:
  - Rendered staging Compose places the exact local snapshot path inside a persistent named volume.
  - The wrapper forces the exact local path and removes the local path override for S3 mode.
  - Pinned Qdrant 1.18.2 preserves a checksummed snapshot across container replacement and passes the full isolated restore contract.
  - Named-volume deletion produces durable failure evidence and no successful restore or alias switch.
  - Correction documentation links the immutable finding and does not claim host, disk, volume, or off-host DR.
selected_docs:
  - https://qdrant.tech/documentation/operations/snapshots/ (official Qdrant snapshot storage contract, consulted 2026-07-12 for pinned runtime 1.18.2)
  - docs/operations/qdrant-self-hosted.md at 52aa83d0
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.5.md at 52aa83d0
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.5-review.md at 6326769d
selected_skills:
  - code-review
  - test-pass
selected_agents:
  - correctness_reviewer
catalog_candidates:
  - none - installed review skills and first-party Qdrant documentation cover this bounded delta
parallel_group: Q12-owner-input-recovery
depends_on_streams:
  - mc2-jz6y0.13.5
  - mc2-jz6y0.13.5-review
parallel_decision: sequential
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: Independently owned pinned test container, named volume, loopback listener, synthetic key files, recovery directories, temporary Vitest config, and dependency symlinks were removed; no implementation, Beads, staging, database, remote service, secret, queue, or alias was mutated outside the disposable test namespace.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: The corrected runbook names the exact persistent path, links Q12-LR1, scopes survival to preserved named-volume replacement, and explicitly excludes volume, host, disk, datacenter, and off-host DR.
graph_reviewed: used
graph_review_notes: The report built at 52269005 was already read for this focused stage; this read-only delta review did not refresh Graphify.
verification:
  - git diff --check ac494372..52aa83d0 passed.
  - Focused recovery/runtime Vitest passed 37/37 with synthetic Supabase placeholders.
  - Independent pinned Qdrant 1.18.2 managed recreate and negative volume-deletion suite passed 7/7 in 10.15 seconds.
  - Disposable managed test resource absence was verified after the run.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.5-correction-review.md
explicit_defers:
  - mc2-jz6y0.13.6 remains the mandatory production off-host S3 lifecycle, restore, alert, and rollback gate; it is not staging local-disk DR evidence.
---

# Summary

## Findings-first verdict

**PASS for correction `52aa83d0`; immutable Q12-LR1 is resolved.** Delta
findings: P0: 0, P1: 0, P2: 0, P3: 0. No findings were identified in the
bounded correction range.

The correction makes the local snapshot path exact at both configuration
boundaries: rendered staging Compose passes
`/qdrant/storage/snapshots`, which is below the persistent named-volume mount at
`/qdrant/storage`, and the secret wrapper overwrites any local-mode caller value
with the same path. Its S3 branch removes that local path override before
starting Qdrant. This closes the failure recorded immutably in review commit
`6326769d` without weakening the production S3 gate.

## Corrected invariant evidence

- `docker-compose.infra.yml:47-56` renders local mode, the exact snapshot path,
  and `qdrant-data:/qdrant/storage`. The runtime-contract test parses the
  rendered Compose JSON and requires the path to be nested under a named-volume
  target (`qdrant-runtime-contract.test.ts:321-346`).
- `deploy/qdrant/secret-entrypoint.sh:56-80` remains fail-closed for missing or
  unknown storage mode, forces `/qdrant/storage/snapshots` for local, and unsets
  `QDRANT__STORAGE__SNAPSHOTS_PATH` before validating S3 inputs.
- The independent managed test used the exact approved image
  `qdrant/qdrant:v1.18.2@sha256:75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c`,
  the repository wrapper, mode-safe synthetic file secrets, one owned container,
  one owned named volume, and one loopback listener.
- After snapshot creation, the test removed and recreated the container while
  preserving the named volume. The replacement returned Qdrant `1.18.2` and
  re-listed the same snapshot name and server checksum
  (`qdrant-snapshot-restore.test.ts:115-183,332-346`).
- Restore then passed exact streamed checksum, point count, dense identity,
  Russian and English native BM25, Formula priority/order, negative tenant and
  course isolation, stable-alias immutability, and drill collection/alias
  cleanup (`qdrant-snapshot-restore.test.ts:348-406` plus the unchanged
  `verifyRecoveredCollection` contract).
- The final negative control removed the named volume, created a new empty
  volume/container, and proved the prior snapshot was absent. Restore emitted a
  durable `status: failed` artifact, incremented the restore failure counter,
  kept `lastOperationSuccess=false`, reported no cleanup failure, and left the
  stable alias on its expected physical name
  (`qdrant-snapshot-restore.test.ts:510-562`). It emitted no successful restore
  result and performed no alias cutover.
- `docs/operations/qdrant-self-hosted.md:356-372` records the exact path,
  references Q12-LR1, limits survival to replacement with the named volume
  preserved, and explicitly states that volume deletion or host/disk/datacenter
  loss is not protected and does not satisfy off-host RPO/DR.

# Verification

## Bounded test matrix

| Tier        | Risk / surface                                  | Result                                          |
| ----------- | ----------------------------------------------- | ----------------------------------------------- |
| delta       | correction diff and documentation               | PASS, no whitespace error and no finding        |
| inner       | wrapper, Compose render, manifest, retention     | PASS, 37/37                                     |
| integration | pinned recreate with preserved named volume     | PASS, checksum survives and exact restore passes |
| negative    | named-volume deletion and failed recovery audit  | PASS, durable failure and no alias cutover      |
| release     | broad type-check/build/release matrix            | not repeated by bounded-review instruction      |

Commands and results:

1. `git diff --check ac494372..52aa83d0` — passed.
2. `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/tools/qdrant/snapshot.test.ts tests/unit/tools/qdrant/restore-drill.test.ts tests/unit/tools/qdrant/recovery-systemd.test.ts tests/unit/ops/qdrant-runtime-contract.test.ts` — 4 files, 37/37 passed.
3. A temporary no-global-setup Vitest configuration selected only
   `tests/integration/qdrant-snapshot-restore.test.ts`. With the pinned image,
   repository wrapper, owned container/volume/listener and
   `QDRANT_TEST_MANAGED_RECREATE=1`, it passed 1 file and 7/7 tests in 10.15
   seconds. The run covered both preserved-volume recreation and deleted-volume
   failure. The temporary configuration and all owned resources were removed.

`docs-reviewed: no-change-needed` — corrected docs are accurate for same-host
named-volume persistence and preserve the explicit production S3 defer.

`graph-reviewed: used` — no refresh was appropriate for this read-only delta
review.

# Delivery / Cleanup

Only this correction-review artifact is changed on the review branch. The
implementation commit `52aa83d0` is approved for orchestrator integration of
Q12-LR1. All independently owned test resources and temporary filesystem links
were removed, and both implementation and review worktrees were clean before
artifact creation.

# Risks / Follow-ups / Explicit Defers

- Local staging snapshots still share the named volume, host, disk, and
  datacenter failure domain with live Qdrant. This is accurately documented and
  is not a finding against the approved development-staging decision.
- `mc2-jz6y0.13.6` remains mandatory before production for off-host S3,
  lifecycle, restore, alert, and rollback evidence.
