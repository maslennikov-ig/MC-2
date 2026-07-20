---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.5-review
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Local snapshot persistence, recovery truth, retention isolation, and the production DR boundary are high-risk operational contracts.
repo: mc2
branch: codex/q12-local-snapshot-review
base_branch: codex/q12-local-snapshots
base_commit: ac494372a3ed14de0d9dbb032c3e79cf2373312a
reviewed_commit: ac494372a3ed14de0d9dbb032c3e79cf2373312a
integration_compatibility_commit: a0ddb285f02d547cfba6bb25ae9e37bfae8cbfb7
worktree: /home/me/code/mc2/.worktrees/q12-local-snapshot-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.5-review.md
success_criteria:
  - Review explicit local or s3 fail-closed parsing and manifest truth.
  - Review persistent local-disk storage, retention isolation, exact restore verification, systemd safety, documentation, and the production S3 gate.
  - Inspect merge compatibility with the parent-owned local-staging CI change without editing implementation or CI files.
selected_docs:
  - https://qdrant.tech/documentation/operations/snapshots/ (official Qdrant snapshot storage contract, consulted 2026-07-12 for pinned runtime 1.18.2)
  - pinned qdrant/qdrant 1.18.2 image config at sha256 75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c
  - docs/operations/qdrant-self-hosted.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.5.md
selected_skills:
  - code-review
  - test-pass
selected_agents:
  - correctness_reviewer
catalog_candidates:
  - none - installed review skills and first-party Qdrant documentation cover this bounded review
parallel_group: Q12-owner-input-recovery
depends_on_streams:
  - mc2-jz6y0.13.5
parallel_decision: sequential
status: blocked
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: Read-only image inspection container exited with --rm; temporary worktree dependency symlinks were removed; no Qdrant data, service, secret, database, alias, queue, remote host, or Beads state was mutated.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: The implementation runbook was reviewed and contains the same false persistent-volume location claim as the P1 finding; remediation must update it with the implementation fix.
graph_reviewed: used
graph_review_notes: Read Graphify report built at 52269005; this focused read-only review did not require or perform a refresh.
verification:
  - git diff --check 52269005...ac494372 passed.
  - Focused Qdrant recovery runtime Vitest passed 37/37 with synthetic Supabase test placeholders after the first environment-only setup failure.
  - Pinned Qdrant 1.18.2 image inspection proved WorkingDir=/qdrant, no image-declared volume, and snapshots_path=./snapshots.
  - Official Qdrant snapshot documentation states the Docker local default is /qdrant/snapshots.
  - git merge-tree for ac494372 plus a0ddb285 produced no conflict marker; parent CI sets local mode but does not add the missing persistent snapshot mount/path.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.5-review.md
explicit_defers:
  - mc2-jz6y0.13.6 remains the mandatory production gate for off-host S3, lifecycle, restore drill, alert, and rollback evidence; it does not defer the P1 staging persistence defect.
---

# Summary

## Findings-first verdict

**CHANGES_REQUIRED; P1 hard stop for integration of `ac494372`.** Findings:
P0: 0, P1: 1, P2: 0, P3: 0. The explicit storage-mode parser, local
manifest shape, storage-mode/collection retention filters, absence of staging
S3 credentials, restore relevance/isolation checks, alias cleanup, manual-first
systemd instructions, and production S3 defer are directionally sound. However,
the local snapshot bytes are not mounted on persistent storage, so container
replacement loses the recovery source while the runbook claims the opposite.

Review stopped before broader release gates as required after a P0/P1 finding.
No additional P0-P3 finding was identified in the completed focused scope.

| ID      | Severity | Confidence | Finding                                                                                  |
| ------- | -------- | ---------- | ---------------------------------------------------------------------------------------- |
| Q12-LR1 | P1       | high       | Local snapshots are written outside the only persistent Qdrant volume and are ephemeral. |

## Q12-LR1 — P1 — local snapshots do not survive container replacement

- **Repository evidence:** the staging Qdrant service mounts only
  `qdrant-data:/qdrant/storage` and does not set a snapshot path or mount
  `/qdrant/snapshots` (`docker-compose.infra.yml:53-55`). The runbook says the
  snapshot files stay inside `/qdrant/storage` on that volume
  (`docs/operations/qdrant-self-hosted.md:353-356`), but the runtime does not
  establish that path.
- **Pinned-image evidence:** inspecting the exact approved image
  `qdrant/qdrant:v1.18.2@sha256:75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c`
  returned `WorkingDir=/qdrant`, no image-declared volume, and
  `/qdrant/config/config.yaml` contains `snapshots_path: ./snapshots`. Therefore
  the resolved local path is `/qdrant/snapshots`, in the disposable container
  writable layer rather than the named volume.
- **First-party evidence:** the official Qdrant snapshot documentation states
  that Docker stores local snapshots at `/qdrant/snapshots` by default and that
  `storage.snapshots_path` / `QDRANT__STORAGE__SNAPSHOTS_PATH` controls it:
  <https://qdrant.tech/documentation/operations/snapshots/> (consulted
  2026-07-12 for the pinned Qdrant 1.18.2 runtime contract).
- **Impact:** an ordinary Compose container replacement or recreation discards
  every local snapshot while preserving live data. The documented local-disk
  recovery contract and timer success metrics can therefore report success even
  though the recovery source is not durable across the deployment operation it
  must survive. This does not affect the already-explicit lack of host/disk DR;
  it fails the narrower same-host persistent-volume requirement.
- **Required fix:** bind the snapshot path to durable same-host storage. Prefer
  explicitly setting `QDRANT__STORAGE__SNAPSHOTS_PATH` to a directory below the
  existing `/qdrant/storage` volume, or mount a dedicated persistent volume at
  `/qdrant/snapshots`. Keep the directory isolated from collection data and
  preserve exact ownership/permissions. Update the runbook to the exact mounted
  path.
- **Required invariant tests:** create a snapshot through the pinned wrapper,
  capture checksum/manifest, replace the Qdrant container without deleting its
  named volume, and restore into an isolated collection from the pre-replacement
  snapshot. Assert exact checksum, count, dense, RU/EN BM25, Formula ordering,
  negative tenant/course isolation, stable-alias immutability, and owned cleanup.
  Add rendered-Compose assertions that local mode has an explicit persistent
  snapshot path and that no local snapshot path resolves outside a mounted
  persistent volume. Add the negative control that deleting the named snapshot
  volume makes the drill fail visibly rather than emitting success evidence.

# Verification

## Test matrix

| Tier        | Risk / surface                         | Command or evidence                                           | Result                                    |
| ----------- | -------------------------------------- | ------------------------------------------------------------- | ----------------------------------------- |
| inner       | parser, manifest, retention, systemd   | focused Vitest, four files                                    | PASS, 37/37                               |
| delta       | diff hygiene                           | `git diff --check 52269005...ac494372`                        | PASS                                      |
| integration | actual local snapshot persistence      | pinned image config plus Compose mount comparison             | FAIL, P1                                  |
| merge       | parent-owned local CI compatibility    | `git merge-tree` for `ac494372` and `a0ddb285`                | no conflict marker; P1 remains            |
| release     | type-check/build/pinned restore/release | intentionally not repeated after the P1 hard stop             | skipped per reviewer stop rule            |

Commands and results:

1. `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=ci-placeholder pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/tools/qdrant/snapshot.test.ts tests/unit/tools/qdrant/restore-drill.test.ts tests/unit/tools/qdrant/recovery-systemd.test.ts tests/unit/ops/qdrant-runtime-contract.test.ts` — 4 files, 37/37 passed.
2. The same command without the two synthetic variables failed before test
   import because the shared unit setup requires Supabase variables. This was an
   environment precondition, not a product-test failure.
3. `docker image inspect ... --format 'WorkingDir={{.Config.WorkingDir}} Volumes={{json .Config.Volumes}}'` — `WorkingDir=/qdrant Volumes=null`.
4. Disposable `docker run --rm --entrypoint /bin/sh ...` inspection — pinned
   config contains `snapshots_path: ./snapshots`; the container was removed.
5. `git merge-tree $(git merge-base ac494372 a0ddb285) ac494372 a0ddb285` — no
   conflict marker. Commit `a0ddb285` correctly writes
   `QDRANT_SNAPSHOT_STORAGE_MODE=local` and removes staging S3 inputs, but does
   not change the Qdrant snapshot filesystem mount/path.

`docs-reviewed: no-change-needed` for the review branch: the implementation
documentation requires correction as part of the P1 fix.

`graph-reviewed: used`: read the local report built at `52269005`; no refresh
was appropriate for this read-only review.

# Delivery / Cleanup

The implementation commit is not accepted. This review changes only this
artifact. No implementation or Beads file was modified. The pinned image
inspection used `--rm`; temporary dependency links were removed before commit.

# Risks / Follow-ups / Explicit Defers

- Fix Q12-LR1 and repeat independent review before merging `.13.5`.
- The parent CI change at `a0ddb285` is merge-compatible and necessary, but not
  sufficient for persistent local snapshots.
- `mc2-jz6y0.13.6` remains the hard production off-host S3 gate. It must not be
  used to waive same-host staging snapshot persistence.
