---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.2-review
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: The operator runtime can mutate the derived index, consume privileged queues, read recovery credentials, and execute snapshot/restore operations; fail-open packaging or isolation defects can corrupt the stable retrieval path.
repo: mc2
branch: codex/q12-operator-runtime
base_branch: codex/self-hosted-qdrant-platform
base_commit: f9389b69e3b4a48bf9cfc6868ff1ef432e32027e
reviewed_commit: 76caa6e5
worktree: /home/me/code/mc2/.worktrees/q12-operator-runtime
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-operator-runtime-review.md
success_criteria:
  - Findings-first review covers immutable image identity, non-root execution, capabilities, file secrets, source mounts, queue and alias isolation, executable operator commands, systemd credential staging, locking, bootstrap sequencing, secret leakage, and image contents.
  - Implementation defects are separated from CI publication, environment delivery, runbook, secret provisioning, and manual remote activation dependencies.
  - No implementation file, image, container, service, queue, alias, secret, database, S3 object, or remote state is changed by this review.
selected_docs:
  - .codex/stages/mc2-jz6y0/artifacts/authoritative-docs.md
  - docs/operations/qdrant-self-hosted.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-operator-runtime.md
selected_skills:
  - code-review
  - senior-devops
  - verification-before-completion
selected_agents:
  - correctness_reviewer
  - deploy_specialist perspective
catalog_candidates:
  - none - accepted repository docs and installed review/DevOps skills cover this bounded review
parallel_group: Q12-local-remediation
depends_on_streams:
  - mc2-jz6y0.13-deploy-preflight
parallel_decision: parallel
status: accepted
delivery_method: n/a
accepted_by_orchestrator: yes
cleanup_status: not_applicable
cleanup_notes: Review created no container, image, service, queue, alias, database, S3, or remote resource. Temporary synthetic files and dependency links created for verification were removed. Concurrent implementation edits in the assigned worktree were not touched or staged.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: This review changes no durable contract. The already-recorded operator-aware runbook update remains an integration dependency.
verification:
  - Focused Qdrant operator/runtime/observability/systemd Vitest passed 25/25 after temporary worktree dependency links; links were removed.
  - Synthetic Compose operator profile rendered and hardening assertions passed for 3/3 services.
  - Synthetic Compose also reproduced acceptance of a mutable qdrant-operator latest tag.
  - Rootless systemd-analyze verify passed for both service/timer pairs with no diagnostics.
  - qdrant-operator entrypoint passed bash -n; shellcheck was unavailable.
  - Copied src/tools trees were scanned for common private-key and token literal patterns; none were found.
  - git diff --check f9389b69..48cf8378 passed.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-operator-runtime-review.md
explicit_defers:
  - CI build/publication and host delivery of the exact operator image are integration work, not proof supplied by commit 48cf8378.
  - First-bootstrap ordering, secret/manifest/probe provisioning, operator runbook commands, target-host manual oneshots, S3 drill, timers, and alias cutover remain remote-gated integration work.
---

# Summary

## Findings-first verdict

**CHANGES_REQUIRED for local integration of `48cf8378`.** P0: 0, P1: 4,
P2: 2, P3: 0. The image target, root-to-UID-1001 wrapper, profile-only services,
source mount, root-owned credential staging, and systemd containerization are
directionally sound. The current contracts nevertheless permit a mutable
operator image, an unlocked direct recovery run, and a dedicated worker job that
falls back to the stable alias. Default reindex execution also cannot persist its
required resume ledger on the read-only root filesystem.

Line numbers below refer to tree `48cf8378`, not to concurrent uncommitted
remediation later observed in the worktree.

| ID     | Severity | Confidence | Finding                                                                                                    |
| ------ | -------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| Q12-O1 | P1       | high       | `QDRANT_OPERATOR_IMAGE` is required only to be non-empty; mutable/stale image references are accepted.     |
| Q12-O2 | P1       | high       | Default reindex execution writes its durable ledger below read-only `/app` and fails before enqueue.       |
| Q12-O3 | P1       | high       | The dedicated generic worker can process a job with no physical target and write through the stable alias. |
| Q12-O4 | P1       | high       | Direct Compose snapshot/restore runs claim an external lock that they do not hold.                         |
| Q12-O5 | P2       | high       | systemd's metrics writability preflight now runs as root and does not prove UID/GID 1001 access.           |
| Q12-O6 | P2       | high       | The root wrapper checks secret modes but not the required root ownership or exact `0400` mode.             |

## Findings

### Q12-O1 — P1 — mutable operator images pass the runtime contract

- **Evidence:** all three services use
  `${QDRANT_OPERATOR_IMAGE:?QDRANT_OPERATOR_IMAGE must be a release SHA or digest}`
  plus `pull_policy: never`, but no code validates the value
  (`docker-compose.infra.yml:87-91,139-143,181-185`). The contract test merely
  supplies one SHA-looking tag and checks that the service block itself does not
  contain `latest` (`qdrant-runtime-contract.test.ts:255-317`;
  `qdrant-operator-runtime.test.ts:168-192`). No systemd preflight resolves or
  verifies the local image identity.
- **Fresh reproduction:** `docker compose --profile operator ... config --quiet`
  returned success with
  `QDRANT_OPERATOR_IMAGE=ghcr.io/maslennikov-ig/mc-2/qdrant-operator:latest`.
- **Impact:** a stale, locally retagged, or mutable operator can run privileged
  bootstrap/reindex/recovery code against the protected Qdrant and secret files.
  `pull_policy: never` prevents a pull; it does not make the selected local tag
  immutable.
- **Required fix:** require the exact repository digest form at the execution
  boundary, or resolve an exact full release SHA tag to a registry digest and
  persist that digest before use. Verify the local image ID/RepoDigest and OCI
  revision before every systemd/manual command. Add negative tests for `latest`,
  short SHA, wrong repository, wrong digest, and a missing local image.

### Q12-O2 — P1 — the hardened service makes the default resume ledger unwritable

- **Evidence:** the image inherits `WORKDIR /app` (`Dockerfile:107-108,167`) and
  the operator service is read-only with no mount at `/app/artifacts`
  (`docker-compose.infra.yml:87-134`). Execute defaults to
  `artifacts/qdrant-reindex/<run-id>.json`, creates its parent, and atomically
  checkpoints `planned` before enqueueing any job
  (`reindex-course-embeddings.ts:451-457,590-612,870-880`). The dispatcher neither
  requires nor supplies `--artifact` (`entrypoint.sh:185-207`).
- **Impact:** the advertised `reindex execute` command fails deterministically on
  its first durable checkpoint unless the operator knows to pass an undocumented
  writable absolute path. Resume/retry truth is therefore absent from the
  default container contract. Failure is safe before enqueue, but Q12 reindex
  cannot proceed as packaged.
- **Required fix:** make an owner-only reindex-ledger directory below the mounted
  recovery state the container default, or require an explicit absolute
  `--artifact` inside that bounded mount and reject every other location. Test
  execute/resume in the actual read-only container, including atomic checkpoint
  persistence and restart.

### Q12-O3 — P1 — the isolated worker can fall back to the stable alias

- **Evidence:** `reindex-worker` validates the Docker-local URL, upload root,
  dedicated UUID queue, and Stage 6 flag, then starts the generic worker without
  a target/run binding (`entrypoint.sh:209-215`). Document-processing jobs keep
  both `qdrantTargetCollection` and `qdrantReindexRunId` optional
  (`packages/shared-types/src/bullmq-jobs.ts:128-137`). Stage 2 supplies a
  collection override only when the optional field exists; otherwise the upload
  client uses its default stable alias
  (`phase-6-qdrant-upload.ts:118-127`). The trusted producer includes both fields
  (`reindex-course-embeddings.ts:638-653`), but the worker does not enforce them.
- **Impact:** a malformed, stale, or injected job on the dedicated Redis queue
  can write directly to `course_embeddings`, defeating physical-collection
  isolation. Other application containers share unauthenticated private Redis,
  so queue-name isolation alone is not a target-authorization boundary.
- **Required fix:** bind the worker to an explicit physical target and run ID,
  require every consumed job to contain both values, require the target to differ
  from the stable alias, and require the run ID/target to match the worker's
  immutable environment. Reject unrelated job types before processing. Add a
  worker-level test for missing, alias, foreign-target, foreign-run, and
  non-document jobs.

### Q12-O4 — P1 — direct recovery services bypass the shared lock

- **Evidence:** both recovery services hardcode
  `QDRANT_RECOVERY_LOCK_HELD=1` (`docker-compose.infra.yml:155-176,197-223`). The
  recovery tools interpret that value as proof that an outer process already
  owns the lock. systemd does provide an outer nonblocking `flock`
  (`megacampus-qdrant-snapshot.service:17-23`;
  `megacampus-qdrant-restore-drill.service:20-28`), but a manual
  `docker compose ... run qdrant-{recovery,restore}-operator` does not.
- **Impact:** a manual oneshot can overlap the timer or another manual operation,
  while every participant believes concurrency is serialized. Snapshot and
  restore can then race over recovery state, metrics and Qdrant operations.
- **Required fix:** default Compose to internal locking on a writable tmpfs path.
  Set `QDRANT_RECOVERY_LOCK_HELD=1` only in the systemd invocation whose immediate
  parent is the external `flock`. Add one direct-Compose contention test and one
  systemd external-lock test; both must visibly reject overlap.

### Q12-O5 — P2 — systemd no longer proves the container tool can write metrics

- **Evidence:** removing `User=megacampus` makes every `ExecStartPre` run as root.
  Both units still use `test -w` plus mode `2775` but never compare directory GID
  with `QDRANT_METRICS_GID` or test as UID 1001 with that supplementary group
  (`megacampus-qdrant-snapshot.service:19-22`;
  `megacampus-qdrant-restore-drill.service:22-27`).
- **Fresh reproduction:** root inside a user namespace reported a mode-`0555`
  directory writable, demonstrating why `test -w` is not a non-root permission
  proof.
- **Impact:** a wrong directory group can pass unit preflight and fail only after
  the snapshot/restore operation tries to emit its required durable gauge.
- **Required fix:** validate the exact owner/group/mode/path contract and execute
  a write/atomic-rename probe as UID/GID 1001 with the configured supplementary
  metrics GID before starting Docker. Keep the activation runbook preflight, but
  do not substitute it for the recurring unit guard.

### Q12-O6 — P2 — root-owned input ownership is asserted in prose, not code

- **Evidence:** `read_secret_file` and `stage_owner_only_file` reject symlinks and
  group/world permissions, but accept any owner and any owner-only mode such as
  `0600` (`entrypoint.sh:79-96,129-139`). The implementation artifact's own pinned
  smoke used a root-owned mode-`0600` key, while the accepted host contract is
  root-owned mode `0400`.
- **Impact:** a misowned file readable by UID 1001 defeats the narrow root-wrapper
  exposure boundary, and the runtime self-check cannot detect drift from the
  deployment ownership contract.
- **Required fix:** require source UID `0`, GID `0`, exact regular-file/no-symlink
  identity and mode `0400` for API key, manifest and probe inputs. Test wrong UID,
  wrong GID, `0600`, symlink and multiline cases in an actual container.

## Verified positive surfaces

- The Dockerfile pins `tsx@4.21.0`, copies only the required `src` and `tools`
  trees into the operator target, and runs a build-time import/self-check for the
  five tool modules under UID 1001 (`Dockerfile:100-105,165-198`). The copied
  trees contained no common private-key/token literal patterns in the review
  scan.
- The dispatcher rejects a non-local Qdrant URL, wrong upload root, live/default
  queue, non-UUID reindex queue, missing execute target, and the stable alias for
  producer execute/verify (`entrypoint.sh:38-77,185-207`).
- All operator services are profile-only, have no ports, use a read-only root,
  `no-new-privileges`, drop all capabilities, and add only the root wrapper's
  `CHOWN`, `SETGID`, and `SETUID`. A synthetic rendered-model assertion passed
  for 3/3 services.
- The canonical upload mount is read-only and resolves the accepted
  `/opt/megacampus/data/uploads` source root. Worker/cache/state/metrics are the
  only writable mounts needed by the tools.
- The root wrapper rejects symlinked and group/world-readable inputs, stages
  recovery inputs into a per-container tmpfs, and uses `setpriv` to execute tools
  as UID/GID 1001. Raw API keys are not Dockerfile args or image environment
  values.
- systemd uses `LoadCredential`, unit-specific snapshot/restore staging
  directories, root-owned `0400` destination files, nonblocking external flock,
  and `ExecStopPost` cleanup. The private `%d` credential path is not passed to
  the Docker daemon.
- Default bootstrap resolves distinct `course_embeddings_v1` physical and
  `course_embeddings` alias names, so the image contains the capability needed
  to break the first-bootstrap deadlock once integration stages and invokes it.

# Verification

## Fresh verification and limitations

- Focused command: the four requested Vitest files passed **25/25**. The first
  attempt could not resolve worktree dependencies after stream cleanup; the
  successful rerun used temporary links to the primary workspace dependencies,
  and those links were removed immediately afterward.
- `docker compose --profile operator -f docker-compose.infra.yml ... config`
  passed. Parsed hardening assertions passed for all three operator services and
  no synthetic secret value appeared in rendered output. A separate negative
  probe proved that `:latest` is currently accepted.
- Rootless `systemd-analyze verify` over the two service/timer pairs passed with
  no diagnostics. Direct host verification is unavailable because this WSL
  profile cannot create `/run/systemd` without the isolated mount namespace.
- `bash -n` passed for the dispatcher. `shellcheck` is unavailable.
- The implementation stream had already removed its test image; read-only review
  confirmed that `mc2-qdrant-operator:q12o-test` is absent. To honor the no-image
  mutation boundary, this reviewer inspected the Dockerfile's build-time
  self-check and the recorded build/pinned-Qdrant evidence rather than rebuilding
  it. Therefore the prior image integration evidence is accepted as supplied,
  not independently reproduced here.
- `git diff --check f9389b69..48cf8378` passed.

The green static/focused suite does not cover mutable image rejection, a real
read-only-root execute checkpoint, worker-side job target authorization, direct
Compose recovery locking, exact secret ownership, or a UID-1001 metrics write.

# Risks / Follow-ups

## Integration dependencies — not implementation findings

These items remain blocking for Q12 activation but are outside the reviewed
implementation diff and should not inflate the P0-P3 counts above:

1. CI does not yet build/publish the `qdrant-operator` target, and the deployment
   environment does not yet deliver `QDRANT_OPERATOR_IMAGE`. The accepted flow
   must publish the reviewed release, resolve it to an exact digest, pre-pull it
   because operator services use `pull_policy: never`, and record the local image
   identity.
2. The current deploy path calls schema verification before it runs bootstrap.
   Integration must stage the operator image, start private Qdrant without
   changing clients, run bootstrap/verify, then reindex and only later enable the
   application deploy gate. Commit `48cf8378` supplies the missing runtime but
   does not itself order or execute this sequence.
3. The accepted root-owned API key, S3 settings, metrics directory/GID, latest
   snapshot manifest, and deterministic recovery probe still require exact
   target provisioning. Synthetic values are forbidden.
4. The stable runbook still shows host `pnpm` commands and old systemd assumptions.
   It must be updated with digest-pinned Compose commands, explicit dedicated
   queue/physical target/artifact paths, manual-first systemd verification,
   observation, cleanup and rollback.
5. A target-host controlled manual snapshot and restore oneshot, real off-host S3
   drill, source/database parity proof, reindex verification, notification proof,
   timer enablement and alias cutover remain Q12 remote-gated actions.

## Final disposition

Do not integrate `48cf8378` as the accepted Q12 operator runtime until Q12-O1
through Q12-O4 are fixed and independently re-reviewed. Q12-O5 and Q12-O6 should
also be closed in the same security-sensitive stream rather than silently
deferred. No remote action was performed or authorized by this review.
