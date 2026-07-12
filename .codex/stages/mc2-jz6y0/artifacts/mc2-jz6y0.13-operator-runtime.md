---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.2
stage_id: mc2-jz6y0
agent_type: deploy_specialist
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: immutable release packaging, root-to-non-root credential handling, recovery, and staging isolation are high-risk deployment work
repo: mc2
branch: codex/q12-operator-runtime
base_branch: codex/self-hosted-qdrant-platform
base_commit: f9389b69e3b4a48bf9cfc6868ff1ef432e32027e
worktree: /home/me/code/mc2/.worktrees/q12-operator-runtime
write_zone:
  - packages/course-gen-platform/Dockerfile
  - packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh
  - docker-compose.infra.yml
  - deploy/systemd/megacampus-qdrant-snapshot.service
  - deploy/systemd/megacampus-qdrant-restore-drill.service
  - packages/course-gen-platform/tests/unit/ops/qdrant-operator-runtime.test.ts
  - packages/course-gen-platform/tests/unit/ops/qdrant-runtime-contract.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/recovery-systemd.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-operator-runtime.md
success_criteria:
  - bootstrap, verify, reindex, snapshot, and restore tools run from an immutable separately published image without host Node, pnpm, or source
  - reindex refuses the live queue, stable alias, wrong source root, and non-local Qdrant transport
  - operator services are profile-only, non-public, read-only, capability-minimized, and file-secret-backed
  - systemd uses the container operator and exposes credentials to Docker without leaking private systemd credential mounts
  - focused tests, Compose render, image build/runtime smoke, pinned Qdrant bootstrap/verify, type-check, build, and unit verification pass
selected_docs:
  - .codex/stages/mc2-jz6y0/artifacts/authoritative-docs.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-deploy-preflight.md
  - docs/operations/qdrant-self-hosted.md
  - docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md
  - docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md
  - Docker Compose profiles and secrets documentation, current 2026-07-12
  - systemd.exec and systemd.resource-control manuals, version 257 contract
selected_skills:
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
  - senior-devops
selected_agents:
  - deploy_specialist
catalog_candidates:
  - none - installed skills and repository deployment contracts cover this stream
parallel_group: Q12-local-remediation
depends_on_streams:
  - mc2-jz6y0.13-deploy-preflight
parallel_decision: parallel
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: disposable local Qdrant containers, network, image, fixtures, logs, and worktree-only dependency symlinks were removed; branch remains for review and integration
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updates-required
docs_review_notes: the stable Qdrant runbook still describes host pnpm and must be updated by the integration docs owner after this stream is accepted
graph_reviewed: blocked
graph_review_notes: graphify-out is absent from this isolated worktree; parent integration must run a safe local refresh after merge without external model/API modes
verification:
  - focused operator/runtime/observability/systemd Vitest: passed 25/25
  - package type-check: passed
  - package build: passed
  - qdrant-operator Docker target build and embedded self-check: passed
  - fresh container help, UID 1001 self-check, queue/alias guards: passed
  - pinned Qdrant 1.18.2 bootstrap and verify under Compose-equivalent hardening: passed
  - systemd-analyze verify for four recovery units in rootless mount namespace: passed
  - Compose render through qdrant runtime contract: passed
changed_files:
  - packages/course-gen-platform/Dockerfile
  - packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh
  - docker-compose.infra.yml
  - deploy/systemd/megacampus-qdrant-snapshot.service
  - deploy/systemd/megacampus-qdrant-restore-drill.service
  - packages/course-gen-platform/tests/unit/ops/qdrant-operator-runtime.test.ts
  - packages/course-gen-platform/tests/unit/ops/qdrant-runtime-contract.test.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/recovery-systemd.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-operator-runtime.md
explicit_defers:
  - mc2-jz6y0.25 - move Prometheus 3.13.1 retention from deprecated CLI flags to supported YAML before the next pin upgrade
  - mc2-jz6y0.13 - staging image publication, secret provisioning, source parity, reindex, snapshots, restore drill, timers, and cutover remain parent-owned remote work
---

# Summary

Q12 now has a separately buildable `qdrant-operator` image target for the exact
bootstrap, verification, deterministic reindex, snapshot, and restore commands.
The runtime inherits the already proven production runner dependencies, pins
`tsx` at `4.21.0`, carries the required source/tool entrypoints, and proves at
build time that all five tool modules import successfully under UID 1001.

The container starts as a minimal root wrapper only to read root-owned,
owner-only Compose secrets. It then uses `setpriv` to run every Node/tsx tool as
UID/GID 1001. The API key is never accepted as a tracked image environment
value. Snapshot and restore stage the key into tmpfs for the existing file
client; restore also stages the manifest and recovery probe into tmpfs before
dropping privileges.

No staging host, service, queue, database, S3 bucket, alias, secret store, or
remote image was changed by this stream.

# Runtime contract

## Immutable image and commands

- Docker target: `qdrant-operator`, built separately from the normal API target.
- Required publication form: a release-SHA tag or digest supplied as
  `QDRANT_OPERATOR_IMAGE`; `latest` is rejected by contract and Compose uses
  `pull_policy: never` during operation.
- Commands: `bootstrap`, `verify`, `reindex plan|execute|verify`,
  `reindex-worker`, `snapshot`, `restore-drill`, and `self-check`.
- Final local image manifest-list digest:
  `sha256:130775f2eebfd877a6039a49f2ce7ef158a9d045a86c08f12272adc1884d886f`.
- Local image size: `641109603` bytes. The target is intentionally derived from
  the proven runner for Q12 safety; slimming is not an activation prerequisite.

## Reindex isolation

The entrypoint refuses execution unless all of these invariants hold:

1. `QDRANT_URL` equals Docker-local `http://qdrant:6333`;
2. `DOCLING_UPLOADS_BASE_PATH` equals `/opt/megacampus/data`;
3. execution/worker queues match a dedicated UUIDv4
   `qdrant-reindex-<uuid>` name;
4. the target is an explicit physical collection and is not the stable alias;
5. the isolated worker has `STAGE6_WORKER=false`.

The Compose default queue is deliberately invalid (`qdrant-reindex-disabled`),
so an operator must explicitly supply a newly generated dedicated queue for a
reindex. The live course-generation queue cannot be consumed accidentally.

## Secrets and systemd

All three operator services are under the explicit `operator` profile, expose
no ports, use a read-only root filesystem, `no-new-privileges`, drop every
capability, and add only `CHOWN`, `SETGID`, and `SETUID` for the wrapper. The
recovery services do not load the broad production environment.

The systemd units retain `LoadCredential`, but Docker daemon cannot safely be
assumed to see the service-private `%d` credential mount. Each unit therefore
copies its credentials into a distinct root-owned mode-0400 path below the
host-visible recovery `StateDirectory`, passes that path only to Compose secret
resolution, and deletes the unit-specific directory in `ExecStopPost`. Snapshot
and restore use different directories, so a failed nonblocking lock attempt
cannot remove another run's credentials. Inside the container, the root wrapper
copies those inputs to tmpfs with UID 1001 ownership before executing tools.

# Verification

## RED / GREEN chronology

- Initial focused RED: five expected failures proved the absent image target,
  dispatcher, profile-only Compose services, and containerized systemd path.
- Initial GREEN: the two focused files passed 9/9.
- Expanded Compose/runtime contract passed 24/24 after adding the synthetic
  immutable operator image fixture.
- Restore credential RED: one expected failure proved root-owned manifest and
  probe files were not staged for UID 1001; GREEN passed the operator file 6/6.
- Docker-daemon visibility RED: one expected systemd failure proved `%d` was
  still being passed as a host Compose secret path; GREEN passed 4/4 after
  staging credentials in distinct host-visible state paths with cleanup.
- Final joined suite:
  `SUPABASE_URL=https://placeholder.supabase.co SUPABASE_SERVICE_KEY=placeholder-service-key vitest run --config vitest.config.unit.ts tests/unit/ops/qdrant-operator-runtime.test.ts tests/unit/ops/qdrant-runtime-contract.test.ts tests/unit/ops/qdrant-observability-contract.test.ts tests/unit/tools/qdrant/recovery-systemd.test.ts`
  -> 25/25.

## Image and pinned integration

`docker build --target qdrant-operator -t mc2-qdrant-operator:q12o-test -f packages/course-gen-platform/Dockerfile .`
completed successfully. Its embedded check returned
`{"status":"ok","uid":1001,"modules":5}`. Fresh containers then passed the
top-level help plus bootstrap, verify, and reindex help. Deliberate execution
with the default queue and with the logical alias failed closed before reading
credentials.

A disposable local network used exact Qdrant
`qdrant/qdrant:v1.18.2@sha256:75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c`.
The operator ran with a read-only filesystem, no-new-privileges, all
capabilities dropped except `CHOWN/SETGID/SETUID`, a root-owned mode-0600 API-key
file, and no public host port. Bootstrap created physical collection
`course_embeddings_v1` plus alias `course_embeddings`; verify passed; the
collection was green with zero points. The synthetic key did not occur in the
captured logs. The container, network, collection, alias, and fixture directory
were removed by the test trap.

## Other gates

- `pnpm --filter @megacampus/course-gen-platform type-check` -> exit 0 after
  restoring ignored worktree-local pnpm package links.
- `pnpm --filter @megacampus/course-gen-platform build` -> exit 0.
- Rootless `unshare -Urmpf` with a private writable `/run`, followed by
  `systemd-analyze verify` over both service/timer pairs -> exit 0 with no
  diagnostics. Direct host verification is unavailable because this WSL profile
  has no `/run/systemd`.
- Compose syntax and required-variable expansion are exercised by the joined
  runtime contract, including an immutable synthetic operator image and
  synthetic file paths without secret-value rendering.

# Risks / Follow-ups

The parent integration stream must still:

1. teach CI to build and publish the `qdrant-operator` target under the same
   release SHA as the application release, then deliver that exact
   `QDRANT_OPERATOR_IMAGE` and pull it before `pull_policy: never` operations;
2. copy the accepted Compose, Qdrant wrapper, monitoring, recovery units, and
   operator-aware runbook to the authorized target;
3. provision owner-only secret files and prove the systemd-to-Docker credential
   path with a controlled manual oneshot before enabling either timer;
4. prove source/database parity, run the dedicated reindex worker and targeted
   verification, then switch the alias only after every hard gate passes;
5. run the real off-host S3 snapshot/restore drill and alert delivery before
   closing Q12.

Rollback for this local stream is a normal revert of the eventual integration
commit. There is no external rollback because nothing remote was mutated. The
old Qdrant Cloud endpoint remains explicitly unavailable as a data rollback
target.

# Documentation and graph review

The current stable runbook still says systemd requires host `/usr/bin/pnpm` and
source. That is now stale and must be updated during parent integration to
describe the immutable operator image, release-SHA publication, credential
staging, dedicated queue, and manual-first timer verification. The isolated
worktree does not contain `graphify-out/GRAPH_REPORT.md`; a safe parent refresh
is required after merge, without external semantic/model/API modes or git hooks.

Prometheus `3.13.1` still accepts the current retention flags but deprecates
them. Because observability configuration is outside this stream's write zone,
the bounded P2 follow-up is tracked as `mc2-jz6y0.25`; it must be completed
before the next Prometheus pin upgrade.
