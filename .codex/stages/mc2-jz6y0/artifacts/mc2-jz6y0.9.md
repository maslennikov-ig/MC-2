---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.9
stage_id: mc2-jz6y0
agent_type: recovery_worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: Snapshot transport, retention, alias safety, recovery verification, locking, and scheduling are high-risk data and operations work.
repo: /home/me/code/mc2
branch: codex/qdrant-q8-recovery
base_branch: codex/self-hosted-qdrant-platform
base_commit: 26fcf065a432bf9aa4da69ec29b7c7088b209482
worktree: /home/me/code/mc2/.worktrees/qdrant-q8-recovery
write_zone:
  - packages/course-gen-platform/tools/qdrant/snapshot*
  - packages/course-gen-platform/tools/qdrant/restore-drill*
  - packages/course-gen-platform/tests/unit/tools/qdrant recovery tests
  - packages/course-gen-platform/tests/integration/qdrant recovery tests
  - packages/course-gen-platform/package.json
  - deploy/systemd/megacampus-qdrant snapshot and restore units
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.9.md
success_criteria:
  - Durable redacted snapshot manifests, streamed SHA-256 verification, deterministic safe retention, failure metrics, and shared nonblocking lock.
  - Authenticated supported restore transport with priority snapshot, isolated drill alias, stable alias preservation, full schema/relevance/isolation checks, and owned cleanup evidence.
  - Hardened snapshot and monthly restore systemd units with a proven maximum scheduling interval below six hours.
  - Pinned local Qdrant 1.18.2 integration including negative checksum, key, duplicate, and cleanup cases.
selected_docs:
  - AGENTS.md and .codex/orchestrator.toml
  - Task 8 in docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md
  - Backups and Recovery in docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.14-runtime.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.7.md
  - Graphify report at integration commit 26fcf065
selected_skills:
  - superpowers:test-driven-development
  - senior-devops
  - superpowers:systematic-debugging on the pinned transport failure
  - superpowers:verification-before-completion
selected_agents:
  - recovery_worker with deploy-specialist judgment
catalog_candidates:
  - none because accepted docs and installed skills covered the stream
parallel_group: Q8-Q9
depends_on_streams:
  - mc2-jz6y0.2
  - mc2-jz6y0.7
  - mc2-jz6y0.14
parallel_decision: parallel with Q9 in disjoint write zones
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: Exact-digest disposable Qdrant container, all owned aliases, collections, snapshots, temporary evidence/state directories, and systemd validation root were removed; no remote service or timer was touched.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: Q8 adds executable recovery behavior and unit templates; Q9/Q10 own the durable operator runbook and install/enable instructions, while this artifact records the exact current contract.
graph_reviewed: used
graph_review_notes: Read the fresh report built from 26fcf065 and ran a focused helper/schema query against the integration graph; child graph refresh was intentionally skipped because generated graph state is ignored and parent owns integration refresh.
verification:
  - TDD module RED 1/1 failed then minimal GREEN 1/1 passed.
  - TDD pure-helper RED 6 failed and 1 passed then GREEN 7/7 passed.
  - TDD snapshot orchestration RED missing module then GREEN 9/9 passed.
  - TDD restore orchestration RED missing module then joined snapshot and restore GREEN 12/12 passed.
  - TDD systemd contract RED 4/4 failed then GREEN 4/4 passed.
  - TDD self-review streaming and latest-manifest RED 2 failed and 11 passed then GREEN 13/13 passed.
  - Independent-review cleanup RED failed 4/7 then GREEN passed 7/7 for boolean results and cleanup postconditions.
  - Independent-review identity RED failed 2/8 then GREEN passed 8/8 for exact ranks and dual isolation.
  - Cross-stream shared-metrics RED failed 4/12: atomic metrics remained 0600 under UMask 0077 and missing/wrong-mode directories reached the snapshot client. Symmetric GREEN passed 26/26 across snapshot, restore, and systemd tests.
  - Final focused unit command passed 26/26 across 3 files.
  - Package type-check passed.
  - Package build passed.
  - systemd-analyze verify passed for 4 units in a rootless mount namespace with a writable isolated /run.
  - systemd-analyze calendar passed 8 iterations for four-hour snapshot and monthly restore schedules.
  - Exact Qdrant 1.18.2 integration passed 5/5, including intentional identity mismatch, and ended with empty collection and alias lists.
  - Exact image evidence matched index sha256 75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c and linux amd64 child sha256 da65a06bc75e42702f80c992b99c5144b0fbd675ae7a96d2991de0bf957b7071.
  - Owned-file secret scan passed with no matches.
  - Prettier check and git diff check passed.
  - Artifact validator passed.
changed_files:
  - packages/course-gen-platform/package.json
  - packages/course-gen-platform/tools/qdrant/snapshot-recovery.ts
  - packages/course-gen-platform/tools/qdrant/snapshot.ts
  - packages/course-gen-platform/tools/qdrant/restore-drill.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/snapshot.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/restore-drill.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/recovery-systemd.test.ts
  - packages/course-gen-platform/tests/integration/qdrant-snapshot-restore.test.ts
  - packages/course-gen-platform/tests/integration/qdrant-recovery.vitest.config.ts
  - deploy/systemd/megacampus-qdrant-snapshot.service
  - deploy/systemd/megacampus-qdrant-snapshot.timer
  - deploy/systemd/megacampus-qdrant-restore-drill.service
  - deploy/systemd/megacampus-qdrant-restore-drill.timer
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.9.md
explicit_defers:
  - Q9 owns the host directory, metrics GID, same-path node_exporter mount, scraping, and alerting for the atomic 0644 textfile metrics; Q8 only validates the precreated 2775 contract and emits the durable file.
  - Q10 owns durable install and enable documentation plus validation of the target-host absolute /usr/bin/pnpm path.
  - Q12 remains the explicit authority gate for real S3, staging, service installation, timer enabling, and any live recovery action.
  - Persistent timers catch up after restart but cannot guarantee the recovery objective during a host outage; Q9 must alert when snapshot age exceeds eight hours.
---

# Summary

Q8 now resolves the stable alias to one physical collection, creates and re-lists a native snapshot, streams an authenticated download through SHA-256 without whole-file buffering, checks size and server checksum, and atomically writes both immutable and latest redacted manifests before applying deterministic 30-day retention. Retention filters by physical collection and owned object prefix, preserves the newest successful snapshot, and never deletes an unlisted or foreign object. Atomic Prometheus textfile metrics retain success ages across failures and expose snapshot failures, restore failures, lock contention, and latest operation status. Metrics are written to the precreated shared `/var/lib/megacampus/qdrant-metrics` contract as 0644 before atomic visibility despite `UMask=0077`; recovery state, manifests, and evidence remain owner-only 0600 under the separate 0700 recovery directory.

The restore drill uses Qdrant 1.18.2's supported authenticated self-HTTP transport with `priority=snapshot` and the manifest checksum. It creates a unique owned physical collection and drill alias, verifies the complete physical schema and strict indexes, exact point count, exact top point/document/chunk/content for dense, RU BM25, and EN BM25, exact ordered Formula identities, and separate negative organization and course isolation through that drill alias. The stable alias is asserted unchanged before and after success or failure. Every create/delete boolean is checked; `finally` re-reads aliases and collections, proves the owned resources are absent, and records any false result or postcondition mismatch in redacted cleanup evidence.

Snapshot and restore commands share one real nonblocking `flock`. Hardened systemd services use narrow `LoadCredential` inputs, no broad environment file, owner-only state, an absolute command path, filesystem and privilege protections, and one shared runtime lock. Both services set `QDRANT_METRICS_TEXTFILE_DIR`, permit only the precreated shared path, and fail in `ExecStartPre` unless it is a real, writable mode-2775 directory. The TypeScript entrypoints repeat that fail-fast check before state, lock, snapshot, or restore activity and never create or chmod the shared directory. The snapshot timer runs every four hours with at most ten minutes jitter and one minute accuracy, so the proven bound is 4h11m, below six hours. The separate monthly restore timer is persistent and uses the same lock.

# Scope / Routing

The stream stayed inside the declared Q8 worktree and write zone. No Compose, Q9 monitoring asset, stage summary, handoff, project index, Beads, Q12 state, remote API, deploy script, system service, or timer was changed. The dedicated integration Vitest config lives with the owned integration test and avoids altering shared test routing.

The implementation consumed the already recorded Qdrant 1.18.2 OpenAPI/client shape: `recoverSnapshot(collection, { location, priority, checksum, api_key })`. No new product-truth gap required live documentation research. Graphify was read-only from the parent integration graph and used zero external model or API tokens.

# Verification

## TDD chronology

- Initial module RED: 1/1 failed on the absent recovery helper; minimal existence GREEN passed 1/1.
- Pure contract RED: 6 failures plus 1 pass for alias, manifest, retention, metrics, atomic write, and lock; GREEN passed 7/7.
- Snapshot workflow RED: missing command module; GREEN passed 9/9 including create/list/download/checksum/durable-before-delete ordering and failure evidence.
- Restore workflow RED: missing command module; GREEN passed 3/3 and the joined suite passed 12/12.
- systemd RED: 4/4 failed on absent scripts and units; GREEN passed 4/4.
- Pinned behavior RED: 3/4 passed and restore failed before alias creation. Redacted evidence plus Qdrant logs proved the server process could not fetch the host-published port from inside its container. A regression test failed 1/4 for the incorrect transport port; the single fix changed the self-fetch endpoint to Qdrant's internal listener on 6333. The integration then passed 4/4, including real corrupt-checksum and wrong-key failures against a reachable source.
- Self-review RED: 2 failures plus 11 passes proved whole-file buffering and a missing durable latest manifest. GREEN streams the response body and atomically updates `latest-manifest.json`; 13/13 passed.
- Independent cleanup review RED: 4/7 failed because false create/delete alias and delete-collection results plus residual owned resources were accepted. GREEN checks every boolean, performs post-cleanup alias/collection reads, preserves the stable alias, records cleanup failures, increments the failure metric, and exits nonzero; 7/7 passed.
- Independent relevance review first exposed the old scalar-only probe validator, then produced the behavioral RED: one test observed only five queries instead of separate negative organization and course checks, while an intentional top-identity mismatch reached a later Formula failure. GREEN requires exact expected dense/RU/EN identities and content, ordered Formula identities, and both isolation fixtures. Mismatch errors expose only field names, not expected or recovered content; restore unit tests passed 8/8.
- Cross-stream Q9 review RED: snapshot tests passed 8/12 and failed 4/12. Two failures proved metric temp/final files stayed 0600 under `UMask=0077`; missing and wrong-mode 0700 shared directories reached Qdrant client handling instead of stopping first. GREEN extends the atomic writer with an explicit mode applied to the temporary inode before rename, keeps the default at 0600, requires a precreated real/writable 2775 shared directory without creating or chmodding it, and mirrors the fail-fast contract in snapshot, restore, and systemd. The joined suite passed 26/26.

## Final evidence

- Focused unit: `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=[synthetic] pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/tools/qdrant/snapshot.test.ts tests/unit/tools/qdrant/restore-drill.test.ts tests/unit/tools/qdrant/recovery-systemd.test.ts` -> 26/26. This includes metric 0644 under `UMask=0077`, owner-only state/manifests/evidence, symmetric pre-client rejection for missing/0700 shared directories, and service preflight ordering.
- Type-check: `pnpm --filter @megacampus/course-gen-platform type-check` -> exit 0.
- Build: `pnpm --filter @megacampus/course-gen-platform build` -> exit 0.
- Units: rootless mount namespace with isolated writable `/run`, then `systemd-analyze verify` over all four Q8 units -> exit 0 and no diagnostics. Direct host verification is impossible in this WSL profile because `/run/systemd` is root-owned and absent.
- Calendars: `systemd-analyze calendar --iterations=8 '*-*-* 00/4:15:00'` showed consecutive 00:15, 04:15, 08:15, 12:15, 16:15, 20:15 events; `monthly` showed consecutive first-of-month events. Snapshot cadence plus jitter plus accuracy is 4h11m.
- Pinned integration: exact `qdrant/qdrant:v1.18.2@sha256:75eab8c4...`, `platform=linux/amd64`, client 1.18.0, dedicated Vitest config -> 5/5. The locally streamed digest equalled the server checksum; manifest count was 4; exact deterministic dense/RU/EN/Formula identities and both isolation checks passed; an intentional expected-content mismatch failed with no content or key in evidence and no stable-alias change; corrupt-checksum, wrong-key, and duplicate-target cases failed closed; final authenticated collection and alias lists were both empty.

Manifest evidence contains schema version, success status, logical alias, physical collection, snapshot name, point count, byte size, server checksum, locally verified SHA-256, UTC creation time, local/S3 mode, sanitized object identity, server version, and client version. It contains no endpoint credentials, bucket secret, access key, API key, or credential-bearing URL. Restore evidence records authenticated HTTP transport, snapshot priority, stable alias before/after, all checks, boolean cleanup outcomes, and postcondition results without secret values or recovered content.

# Delivery / Cleanup

The branch is returned for orchestrator review and merge; it is not accepted or integrated yet. The exact-digest Qdrant container was deleted after an authenticated empty-resource check. All test-owned snapshots disappeared with their owned source collections; drill collections and aliases were deleted by the command under test; the duplicate pre-existing target was preserved by the command and removed only by test teardown. Temporary manifests, evidence, metrics, lock files, systemd root, and container state were removed. No external rollback is required because no remote or service mutation occurred.

# Risks / Follow-ups / Explicit Defers

Q9 must provision the host directory and metrics GID, mount the same `/var/lib/megacampus/qdrant-metrics` path into node_exporter, scrape the emitted 0644 textfile, and enforce the accepted stale-snapshot and stale-restore alerts. Q8 deliberately does not create the shared directory, guess its group, or chmod recovery state directories. Q10 must document installation/enabling, recovery-probe ownership, and confirm the packaged target host exposes pnpm at the absolute unit path. Q12 alone may configure real bucket credentials, install or enable units, create an off-host snapshot, or exercise staging recovery. `Persistent=true` improves restart catch-up but cannot overcome a host outage, so the eight-hour stale alert remains mandatory.

Rollback is a normal revert of the eventual Q8 merge commit plus removal of uninstalled unit files. No alias rollback, restored data rollback, secret rollback, remote branch deletion, deployment rollback, or service rollback is currently necessary.
