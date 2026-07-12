---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13
stage_id: mc2-jz6y0
agent_type: deploy_specialist
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: staging security, secret handling, blue/green cutover, recovery, and rollback are high-risk cross-system work
repo: mc2
branch: codex/q12-deploy-preflight
base_branch: codex/self-hosted-qdrant-platform
base_commit: ebdf9c2eb85598c148eeada865378ee51ba2cdf0
worktree: /home/me/code/mc2/.worktrees/q12-deploy-preflight
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-deploy-preflight.md
success_criteria:
  - exact read-only staging target and pre-change state are recorded without secret values
  - repo-backed preflight, activation, cutover, observation, and rollback commands are ordered
  - credential, file-backed-secret, packaging, runtime, and product-truth gaps are explicit
  - no staging mutation is performed by this stream
selected_docs:
  - .claude/commands/deploy.md
  - .claude/docs/deployment-guide.md
  - docs/operations/qdrant-self-hosted.md
  - docs/operations/document-evidence.md
  - docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md
  - docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md
  - /tmp/q12-graphify-query.txt
selected_skills:
  - /home/me/code/mc2/.agents/skills/senior-devops/SKILL.md
selected_agents:
  - deploy_specialist
catalog_candidates:
  - none - installed senior-devops skill and repo operator docs cover this read-only stream
parallel_group: P
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: awaiting orchestrator acceptance; this stream created no remote resources
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: this stream records deployment truth only; stable runbook fixes belong in the blocking Q12 remediation stream
verification:
  - ssh read-only target inventory: passed
  - gh secret-name inventory without values: passed
  - repository deploy-path inspection: passed
  - python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-deploy-preflight.md: passed
  - git diff --check: passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-deploy-preflight.md
explicit_defers:
  - mc2-jz6y0.13 - live activation must remain open until the blocking release/runtime/secret/source-truth gates below are resolved and live acceptance passes
---

# Summary

Q12 is **NO-GO in the current repository/server state**, even though the owner
has authorized staging activation. The target is reachable and has sufficient
base capacity, but the checked-in `/deploy` path cannot deliver or operate the
accepted self-hosted stack safely:

1. GitHub Actions copies only the three Compose files and deploy scripts; it
   does not copy `deploy/qdrant`, `ops/qdrant`, or `deploy/systemd`.
2. GitHub Actions recreates `.env.production` without the new S3, read-only,
   monitoring, metrics-group, or document-evidence settings and creates none of
   the required files under `/opt/megacampus/secrets`.
3. the deploy and rollback scripts contain Compose invocations without the
   required production env file, so `${QDRANT_METRICS_GID:?}` and
   `${QDRANT_METRICS_TEXTFILE_HOST_DIR:?}` make those paths fail;
4. the server has no Node, `/usr/bin/pnpm`, `megacampus` system user, repository
   source, reindex tool, snapshot tool, or restore tool. The current API image
   also excludes all `tools/qdrant/*` files;
5. the first blue/green deploy calls `qdrant:verify` before there is any
   deployable bootstrap/reindex runner, creating a bootstrap/deploy deadlock;
6. the current staging clients still target the retired Cloud hostname, and the
   prior Cloud endpoint is not a valid data rollback target.

No remote file, service, secret, image, alias, database row, queue, S3 object,
notification, or GitHub secret was changed by this stream. All SSH and GitHub
operations below were read-only.

# Scope / Routing

- Role: visible `deploy_specialist`, read-heavy preflight only.
- Write ownership: only this artifact.
- Parallel siblings: credential/runtime inventory and acceptance-gate streams;
  this stream did not edit their zones.
- Graphify: the orchestrator-provided focused query was read. It confirms the
  designed `Bootstrap -> Alias, Reindex, And Cutover -> First cutover` path and
  the Stage 6 evidence loader connection. No graph refresh is needed for an
  artifact-only read audit.
- Version-sensitive sources: repository lock ledgers and the first-party URLs
  already recorded in `docs/operations/qdrant-self-hosted.md`; no version was
  silently changed.

# Read-only staging snapshot

Captured on 2026-07-12 through `megacampus-prod`; secret values were never
printed or read into the artifact.

| Item | Observed state |
| --- | --- |
| SSH target | `claude-deploy@95.81.98.230` (`info511.fvds.ru`) |
| Privilege | member of `sudo` and `docker`; `sudo -n` is allowed |
| Kernel / architecture | Linux `6.8.0-124-generic`, `x86_64` |
| systemd | `255`, satisfies the documented minimum `247` |
| Docker / Compose | Docker `29.2.1`; Compose `v5.0.2` |
| Host Node / pnpm | absent, including `/usr/bin/node` and `/usr/bin/pnpm` |
| Active app color | `blue` |
| Staging app | API/web blue healthy; main and Stage 6 workers running |
| Active API image ID | `sha256:7c32929af84b41ac06c5d880d23cfb54f745a4c079e0f996ba2b86b0fe7eac38` |
| Active web image ID | `sha256:9c11a85b619635cd3fd09700b7ba2ff10eb85f5ac6e24f55a24d08397e3506af` |
| Current Qdrant target | all three RAG-capable staging clients use the retired `*.aws.cloud.qdrant.io` hostname |
| Production Qdrant | absent; nothing listens on `127.0.0.1:6335` |
| Dev Qdrant | separate `megacampus-qdrant-dev`, unpinned `qdrant/qdrant:latest`, bound to `127.0.0.1:6333`; do not mutate it during staging activation |
| Monitoring | Qdrant Prometheus/Grafana/Alertmanager/node_exporter containers and loopback listeners absent |
| Disk | 148 GiB total, 100 GiB available, 29% used |
| Memory | 11 GiB total, about 6.9 GiB available at inspection time |
| Staging source files | 75 regular files, 94,789,095 bytes; all mode `0644`, UID/GID `1001:1001` |
| Source/database parity | not proven; `file_catalog` plan cannot run on the current host/runtime |
| Metrics identity | GID `2001` is available; `megacampus-metrics` group and metrics directory do not exist |
| Recovery identity | `megacampus` user and `/var/lib/megacampus-qdrant-recovery` do not exist |
| Repo/tooling on host | no root/package manifests, source checkout, reindex source, or compiled reindex tool |
| Document evidence env | absent in API, main worker, and Stage 6 worker |

Current application rollback anchors, which must be tagged before any image
pull/prune, are the two image IDs above plus active color `blue`. The previous
Cloud URL is recorded only as a hostname-class fact; its key and full URL are
not evidence and must not be printed.

# Findings

## F1 — The CI delivery payload is incomplete (blocking)

- **Evidence:** `.github/workflows/ci-cd.yml` copies
  `docker-compose.infra.yml`, `docker-compose.app.yml`,
  `docker-compose.production.yml`, nginx, and deploy/rollback scripts only.
  The target is missing `deploy/qdrant/secret-entrypoint.sh`, all
  `ops/qdrant/*`, and all Qdrant systemd units.
- **Implication:** the accepted Compose file would fail on missing bind mounts;
  monitoring and recovery assets cannot start or be verified.
- **Confidence:** high; local workflow and remote file metadata agree.
- **Next action:** add an atomic, reviewed copy/install step for
  `deploy/qdrant`, `ops/qdrant`, and `deploy/systemd`, preserving paths and
  non-secret modes. Verify hashes against the release commit before start.
- **Promotion target:** blocking Q12 release-remediation commit on
  `codex/self-hosted-qdrant-platform`, then `master` only after pre-cutover
  readiness is proven.

## F2 — The production env/secret contract is not delivered (blocking)

- **Evidence:** the target has none of the eight accepted Qdrant/monitoring
  files; `.env.production` lacks every new path/S3/metrics setting. GitHub repo
  secrets contain the legacy `QDRANT_URL` and `QDRANT_API_KEY`, but there are no
  environment secrets and no names for read-only Qdrant, S3, or Grafana. The
  existing Telegram names are `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
- **Implication:** Qdrant cannot start in S3 mode; Prometheus cannot authenticate;
  Grafana and Alertmanager cannot start securely; Compose required-variable
  expansion fails.
- **Confidence:** high; only secret *names* and remote file presence were read.
- **Next action:** provision the exact secret inventory below through stdin or
  an approved secret manager, create separate file copies with consumer-specific
  ownership, and update the CI env writer. Never pass values on a command line or
  include them in logs.
- **Promotion target:** GitHub Actions deployment environment/repo secret store
  plus owner-only files on `megacampus-prod`; workflow wiring in the Q12
  remediation commit.

## F3 — Deploy and rollback scripts lose required Compose env (blocking)

- **Evidence:** `scripts/deploy_blue_green.sh` invokes infra Compose for
  `worker-stage7` and `notebooklm-bridge` without `--env-file`; the target has no
  `/opt/megacampus/.env`. `scripts/rollback_blue_green.sh` runs the entire infra
  file without `--env-file`. The accepted Compose has hard `${...:?}` guards.
- **Implication:** a deployment can pass Qdrant/app gates and then fail while
  updating workers; the advertised rollback can fail before it reaches nginx.
  A failed rollback is unacceptable for Q12.
- **Confidence:** high; exact command paths and target file state were inspected.
- **Next action:** TDD-patch every infra/production Compose call to use
  `/opt/megacampus/.env.production` (or the exact selected color file where
  appropriate), add shell-contract tests for deploy *and rollback*, and rerun
  `bash -n` plus full Compose renders.
- **Promotion target:** blocking Q12 code fix on the integration branch before
  any remote file copy.

## F4 — There is no executable reindex/recovery runtime (blocking)

- **Evidence:** target Node/pnpm and the `megacampus` user are absent; the target
  has no repository source. `packages/course-gen-platform/tsconfig.json` builds
  only `src/**/*`, so the production image contains
  `dist/shared/qdrant/create-collection.js` but excludes
  `tools/qdrant/reindex-course-embeddings.ts`, `snapshot.ts`, and
  `restore-drill.ts`; it also has no pnpm.
- **Implication:** plan/execute/verify and both accepted systemd services cannot
  run. Q12 cannot prove source coverage, RPO, or restore.
- **Confidence:** high; checked local Dockerfile/tsconfig and remote host/image.
- **Next action:** choose and review one operator-runtime path before deploy:
  (A) the current runbook design — exact release source on the host, Node 22,
  `/usr/bin/pnpm` 8.15.0, frozen dependencies, and `megacampus` user; or (B) a
  new digest-pinned operator image with compiled tools and revised systemd units.
  Path B is a product/code change and cannot be improvised during activation.
- **Promotion target:** operator packaging/runtime decision in the Q12
  integration stream and stable runbook update.

## F5 — First deployment has a bootstrap deadlock (blocking)

- **Evidence:** `deploy_blue_green.sh` starts Qdrant, then calls
  `dist/shared/qdrant/create-collection.js --verify-only` before app deployment.
  It never runs bootstrap. The current old API image cannot create the accepted
  1.18.2 schema, and the new release image is not available until CI build.
- **Implication:** the first automatic blue/green deployment cannot pass its own
  gate unless a reviewed release runner bootstraps the physical collection and
  alias beforehand.
- **Confidence:** high.
- **Next action:** pre-stage the exact reviewed release/operator runtime, start
  Qdrant without changing clients, then run `qdrant:bootstrap` and
  `qdrant:verify` before merging/pushing the runtime release to `master`.
- **Promotion target:** Q12 cutover procedure plus deployment automation follow-up;
  do not weaken the verify gate.

## F6 — Reindex source-root and worker isolation must be explicit (blocking)

- **Evidence:** the host files live at `/opt/megacampus/data/uploads`, while the
  reindex tool resolves relative `file_catalog.storage_path` from
  `DOCLING_UPLOADS_BASE_PATH` or its process cwd. The runbook command does not set
  the host value. Reindex also uses `BULLMQ_QUEUE_NAME`, defaulting to the live
  `course-generation` queue; old workers do not understand the new target
  collection job fields.
- **Implication:** the default host command can incorrectly report every file as
  missing, or reindex jobs can be consumed by an old production worker and sent
  to the wrong backend.
- **Confidence:** high from `storage-paths.ts`, queue code, target filesystem, and
  job schema.
- **Next action:** run with
  `DOCLING_UPLOADS_BASE_PATH=/opt/megacampus/data` and a dedicated deterministic
  queue such as `qdrant-reindex-<run-id>`; start exactly one reviewed new-code
  worker on that same queue with the uploads mount and `QDRANT_URL=http://qdrant:6333`.
  Do not recreate normal clients until verify passes.
- **Promotion target:** Q12 runbook correction and operator execution record.

## F7 — Document evidence is not staged for remote activation (blocking)

- **Evidence:** the active staging containers and `.env.production` lack
  `DOCUMENT_EVIDENCE_ENABLED`, `DOCUMENT_EVIDENCE_MODE`, and
  `DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT`; `.env.production.example` and the CI
  env writer do not deliver them. The remote migration/observability ledger was
  not proven by this stream.
- **Implication:** Qdrant cutover alone would not satisfy the approved 100%
  staging evidence activation; blindly adding flags could run against missing
  schema/indexes.
- **Confidence:** high for env, unknown for remote database truth.
- **Next action:** first run the repository migration-drift and dedicated
  document-evidence observability preflight read-only; apply only the exact
  approved migrations if absent; then deliver the exact active gate and 100%
  cohort to API/main worker/Stage 6 together.
- **Promotion target:** Q12 migration/env substream and auditable remote decision
  record.

## F8 — The previous backend is not a usable data rollback (blocking truth)

- **Evidence:** current clients use the retired Cloud hostname; the project
  record states the test-only Cloud index was lost. There is no prior local
  physical collection or snapshot.
- **Implication:** blue/green image rollback can restore application binaries,
  but it cannot restore document RAG. Before first successful local snapshot,
  rollback means quiescing document-backed generation and preserving the visible
  `RAG_INFRA_UNAVAILABLE` failure, not claiming service restoration.
- **Confidence:** high.
- **Next action:** retain exact pre-change images for non-RAG rollback, never
  delete `course_embeddings_v1`, and do not declare Q12 complete until an
  off-host snapshot plus isolated restore creates the first valid data rollback.
- **Promotion target:** Q12 acceptance and rollback record.

## F9 — Release branch is not linearly based on current master (blocking release hygiene)

- **Evidence:** remote `master` is `4128a93858ef85089609cb11f098e02fb8aa08f5`;
  the integration release is `ebdf9c2eb85598c148eeada865378ee51ba2cdf0`.
  Current comparison shows 16 master-only commits and 150 integration-only
  commits; `master` is not an ancestor of the release.
- **Implication:** invoking `/deploy` now creates a large merge at the deployment
  boundary and may combine unreviewed conflict resolution with live mutation.
- **Confidence:** high from `git ls-remote` and graph comparison.
- **Next action:** reconcile current `origin/master` into the integration branch,
  review the complete release diff, rerun local gates, and push the reviewed
  result before any master merge. Never force-push master.
- **Promotion target:** `codex/self-hosted-qdrant-platform`, then reviewed merge
  to `master`.

# Required credential and file inventory

Values remain unavailable/missing unless noted. “Consumer UID” is the image or
unit identity from the accepted Compose/systemd contract.

| Purpose | Delivery name/path | Consumer / mode | Current truth |
| --- | --- | --- | --- |
| Qdrant admin and app key | GitHub `QDRANT_API_KEY`; `/opt/megacampus/secrets/qdrant_api_key` | Qdrant root `0`, file `0400`; app receives the same runtime value through protected env until file support exists | legacy GitHub name exists; target file missing; rotate away from Cloud value |
| Qdrant read-only key | new GitHub `QDRANT_READ_ONLY_API_KEY`; `/opt/megacampus/secrets/qdrant_read_only_api_key` | Qdrant root `0`, `0400` | missing |
| Prometheus copy of read-only key | `/opt/megacampus/secrets/prometheus_qdrant_read_only_api_key` | UID/GID `65534`, `0400`; same value, independent file | missing |
| S3 access key | new GitHub `QDRANT_S3_ACCESS_KEY`; `/opt/megacampus/secrets/qdrant_s3_access_key` | Qdrant root `0`, `0400` | missing |
| S3 secret key | new GitHub `QDRANT_S3_SECRET_KEY`; `/opt/megacampus/secrets/qdrant_s3_secret_key` | Qdrant root `0`, `0400` | missing |
| S3 destination | `QDRANT_S3_BUCKET`, `QDRANT_S3_REGION`, `QDRANT_S3_ENDPOINT_URL` | protected env/secret values; off-host bucket with 30-day lifecycle | missing and requires owner/source-of-truth input |
| Grafana admin | new GitHub `GRAFANA_ADMIN_PASSWORD`; `/opt/megacampus/secrets/grafana_admin_password` | UID/GID `472`, `0400` | missing |
| Alertmanager bot | `/opt/megacampus/secrets/alertmanager_telegram_bot_token` | UID/GID `65534`, `0400` | target file missing; legacy GitHub `TELEGRAM_BOT_TOKEN` name exists |
| Alertmanager chat | `/opt/megacampus/secrets/alertmanager_telegram_chat_id` | UID/GID `65534`, `0400` | target file missing; legacy GitHub `TELEGRAM_CHAT_ID` name exists |
| Recovery probe | `/opt/megacampus/recovery/probe.json` | `megacampus`, `0400` | missing; must be generated from accepted live point identities after reindex, not invented |
| Snapshot manifest | `/var/lib/megacampus-qdrant-recovery/manifests/latest-manifest.json` | generated by snapshot, owner-only | unavailable until first snapshot succeeds |

Non-secret required env:

```text
QDRANT_URL=http://qdrant:6333
QDRANT_COLLECTION_NAME=course_embeddings
QDRANT_PHYSICAL_COLLECTION_NAME=course_embeddings_v1
QDRANT_API_KEY_FILE=./secrets/qdrant_api_key
QDRANT_READ_ONLY_API_KEY_FILE=./secrets/qdrant_read_only_api_key
QDRANT_S3_ACCESS_KEY_FILE=./secrets/qdrant_s3_access_key
QDRANT_S3_SECRET_KEY_FILE=./secrets/qdrant_s3_secret_key
PROMETHEUS_QDRANT_READ_ONLY_API_KEY_FILE=./secrets/prometheus_qdrant_read_only_api_key
GRAFANA_ADMIN_PASSWORD_FILE=./secrets/grafana_admin_password
ALERTMANAGER_TELEGRAM_BOT_TOKEN_FILE=./secrets/alertmanager_telegram_bot_token
ALERTMANAGER_TELEGRAM_CHAT_ID_FILE=./secrets/alertmanager_telegram_chat_id
QDRANT_METRICS_TEXTFILE_HOST_DIR=/var/lib/megacampus/qdrant-metrics
QDRANT_METRICS_GID=2001
DOCUMENT_EVIDENCE_ENABLED=true
DOCUMENT_EVIDENCE_MODE=active
DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT=100
```

# Executable Q12 sequence after all blocking fixes

Every numbered gate is fail-closed. Commands are run on `megacampus-prod` from
`/opt/megacampus` unless marked “operator workstation”. Secret values are loaded
from files/stdin and never echoed.

## 0. Release and rollback preparation

1. Reconcile the integration release with current `origin/master`, independently
   review the full diff, rerun canonical local gates, and record the final SHA.
2. Patch F1-F7, including deploy/rollback shell tests and CI delivery. Do not
   invoke `.claude/scripts/deploy.sh` yet.
3. On the target, capture active color, exact container image IDs, file hashes,
   Compose version, disk/memory, and current filtered Qdrant hostname again.
4. Protect current images from dangling-image cleanup without overwriting
   `latest`:

   ```bash
   docker image tag sha256:7c32929af84b41ac06c5d880d23cfb54f745a4c079e0f996ba2b86b0fe7eac38 \
     ghcr.io/maslennikov-ig/mc-2/api:q12-pre-cutover
   docker image tag sha256:9c11a85b619635cd3fd09700b7ba2ff10eb85f5ac6e24f55a24d08397e3506af \
     ghcr.io/maslennikov-ig/mc-2/web:q12-pre-cutover
   ```

5. Stage the reviewed release files and operator runtime without changing
   running services. Compare staged hashes to the final release SHA.
6. Provision `megacampus`, exact Node 22 runtime, `/usr/bin/pnpm` 8.15.0,
   repository sources, and frozen dependencies if the runbook-aligned host path
   is selected. Do not use an unpinned convenience installer; record the exact
   Node package source/version first.
7. Provision secret files and the metrics directory using the runbook's complete
   GID/path check. Verify metadata only:

   ```bash
   systemd --version | head -1
   test "$(command -v pnpm)" = /usr/bin/pnpm
   /usr/bin/pnpm --version
   getent passwd megacampus
   getent group megacampus-metrics
   stat -c '%a %U:%G %n' /var/lib/megacampus/qdrant-metrics
   ```

8. Validate files and all four actual-env renders before service start:

   ```bash
   docker compose -f docker-compose.infra.yml --env-file .env.production config --quiet
   docker compose -f docker-compose.app.yml --env-file .env.production config --quiet
   docker compose -f docker-compose.production.yml --env-file .env.production config --quiet
   docker compose -f docker-compose.dev.yml --env-file .env.dev config --quiet
   sudo systemd-analyze verify deploy/systemd/megacampus-qdrant-{snapshot,restore-drill}.{service,timer}
   ```

9. Run the document-evidence migration/drift preflight. If an approved migration
   is missing, quiesce affected queues and use only the allowlisted migration
   command/confirmation from `docs/operations/document-evidence.md`; record exact
   before/after history. Do not enable flags against unproven schema.

## 1. Start isolated infrastructure, not application clients

Start only the new staging services; do not use the full deploy script here:

```bash
docker compose -f docker-compose.infra.yml --env-file .env.production pull \
  qdrant node_exporter alertmanager prometheus grafana
docker compose -f docker-compose.infra.yml --env-file .env.production up -d \
  qdrant node_exporter alertmanager prometheus grafana
```

Required evidence before bootstrap:

```bash
curl -fsS http://127.0.0.1:6335/readyz >/dev/null
docker inspect --format '{{.Config.Image}}|{{.Image}}|{{.State.Health.Status}}' megacampus-qdrant
docker ps --format '{{.Names}}|{{.Ports}}' | grep -E 'megacampus-(qdrant|prometheus|grafana|alertmanager)|qdrant-textfile'
ss -lnt | grep -E '127\.0\.0\.1:(6335|3005|9090|9093)'
```

Fail if any service binds a public address, Qdrant is not exact `1.18.2`, the
digest/platform child does not match the lock, an unauthenticated/invalid-key
metrics request succeeds, or read-only access can mutate.

## 2. Bootstrap and source plan

Use the reviewed operator runtime and an admin-key subshell as documented, with
the host source root added explicitly:

```bash
export DOCLING_UPLOADS_BASE_PATH=/opt/megacampus/data
qdrant_admin pnpm --dir packages/course-gen-platform qdrant:bootstrap
qdrant_admin pnpm --dir packages/course-gen-platform qdrant:verify
qdrant_admin pnpm --dir packages/course-gen-platform qdrant:reindex:plan \
  > artifacts/qdrant-reindex/staging-plan.json
```

Stop on any gap. Compare eligible/recoverable IDs to `file_catalog`, the 75
observed files, organization/course ownership, and supported MIME classes.
Physical file count is not an acceptance substitute for database parity. If a
source is truly absent, record the exact file ID in protected evidence and seek
the product decision required by the plan; never use `--allow-gaps` to cut over.

## 3. Dedicated resumable reindex

Generate and retain one UUID `RUN_ID`. Run a new-code dedicated worker and the
operator on the same non-default queue; no old worker may consume these jobs:

```bash
export RUN_ID='<uuid>'
export BULLMQ_QUEUE_NAME="qdrant-reindex-$RUN_ID"
export DOCLING_UPLOADS_BASE_PATH=/opt/megacampus/data

# Start exactly one reviewed release worker with the same queue, uploads mount,
# Redis URL, and QDRANT_URL=http://qdrant:6333. Record its image digest and name.

qdrant_admin pnpm --dir packages/course-gen-platform qdrant:reindex:execute -- \
  --target-collection course_embeddings_v1 \
  --run-id "$RUN_ID" --concurrency 2 \
  --artifact "/var/lib/megacampus-qdrant-recovery/reindex-$RUN_ID.json"

qdrant_admin pnpm --dir packages/course-gen-platform qdrant:reindex:verify -- \
  --target-collection course_embeddings_v1
```

If execution fails, rerun with the same run ID, queue, target, and artifact;
never generate a new run to hide pending/failing jobs. Acceptance is exact
source/document/known-point parity, zero unaccepted gaps, schema/strict indexes,
RU and EN native BM25, server RRF/Formula, controlled priority order, and
tenant/course isolation. Stop and remove only the dedicated worker after its
queue is empty and evidence is durable.

## 4. Snapshot and isolated restore before client cutover

Create the recovery probe from exact accepted point identities/content in
`course_embeddings_v1`; owner `megacampus`, mode `0400`. Then:

```bash
sudo cp deploy/systemd/megacampus-qdrant-* /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/megacampus-qdrant-*.service \
  /etc/systemd/system/megacampus-qdrant-*.timer
sudo systemctl daemon-reload
sudo systemctl start megacampus-qdrant-snapshot.service
sudo systemctl status --no-pager megacampus-qdrant-snapshot.service
sudo journalctl --no-pager -u megacampus-qdrant-snapshot.service -n 200
sudo systemctl start megacampus-qdrant-restore-drill.service
sudo systemctl status --no-pager megacampus-qdrant-restore-drill.service
sudo journalctl --no-pager -u megacampus-qdrant-restore-drill.service -n 200
```

Require manifest checksum, S3 URI, source count, exact-version isolated restore,
RU/EN/dense/Formula/isolation checks, cleanup of drill alias/collection, and an
unchanged stable alias. Only then enable timers:

```bash
sudo systemctl enable --now megacampus-qdrant-snapshot.timer
sudo systemctl enable --now megacampus-qdrant-restore-drill.timer
systemctl list-timers 'megacampus-qdrant-*'
```

## 5. Blue/green application cutover

Only after phases 0-4 pass, merge the reconciled release to `master` through the
reviewed non-force path. The patched CI must build immutable SHA-tagged images,
deliver the complete assets/env, and run `deploy_blue_green.sh`. Do not use
`--force`.

Immediately prove API, main worker, and Stage 6 worker use only
`QDRANT_URL=http://qdrant:6333`; Stage 7 must have no Qdrant URL/group/mount:

```bash
for container in "megacampus-api-$(cat active_color)" megacampus-worker megacampus-worker-stage6; do
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container" \
    | awk -F= -v container="$container" '$1=="QDRANT_URL" {print container ":" $0}'
done
docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' megacampus-worker-stage7 \
  | grep '^QDRANT_' && exit 1 || true
```

Require exact new image digests, active HTTP health, Docker DNS resolution of
`qdrant`, authenticated collection access, and zero retired Cloud hostnames in
the filtered env output.

## 6. Activate document evidence coherently

The exact three flags must be present in API, main worker, and Stage 6 in one
coherent restart:

```text
DOCUMENT_EVIDENCE_ENABLED=true
DOCUMENT_EVIDENCE_MODE=active
DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT=100
```

Quiesce Stage 4/5/6 intake first; drain or durably stop each in-flight job, then
restart all consumers and resume. Run an authorized document-backed Stage 2 ->
Stage 5/6 smoke plus a no-document course. Prove:

- exactly one durable `assessed|degraded|failed` outcome per uploaded document;
- 100% source/evidence coverage and 100% baseline preservation;
- required manual conflict stop and atomic automatic decision audit;
- advisory, non-destructive Stage 5 enrichment;
- Stage 6 decision/ref allowlist and tenant/course isolation;
- controlled CORE over SUPPLEMENTARY ordering without losing required evidence;
- courses without documents remain behavior-compatible.

## 7. Observability and 60-minute acceptance window

Use an SSH tunnel; never expose loopback services publicly. Require all three
Prometheus targets and Alertmanager to be healthy:

```bash
curl -fsS http://127.0.0.1:9090/-/ready >/dev/null
curl -fsS http://127.0.0.1:9093/-/ready >/dev/null
curl -fsS http://127.0.0.1:3005/api/health
curl -fsS http://127.0.0.1:9090/api/v1/targets
curl -fsS --get --data-urlencode 'query=up{job=~"qdrant|node-exporter|alertmanager"}' \
  http://127.0.0.1:9090/api/v1/query
```

Send one explicitly labelled real firing test and confirm the resolved message;
remove the test alert/silence afterward. Observe at least 60 continuous minutes
after the last cutover/restart. Stop/rollback on:

- any P0/P1, isolation breach, incomplete coverage, or baseline mutation;
- restore/snapshot failure or stale/missing recovery gauges;
- Qdrant down/recovery mode, schema drift, point drop, or unbounded errors;
- hybrid fallback ratio above 5% for any 15-minute window;
- any RAG-capable client using the retired Cloud hostname;
- any uploaded-document course silently continuing without required RAG.

# Rollback map

## Before application cutover

Stop only the new services; preserve named volumes, S3 objects, manifests, logs,
and metrics. Do not use `down -v` or delete `course_embeddings_v1`:

```bash
docker compose -f docker-compose.infra.yml --env-file .env.production stop \
  grafana prometheus alertmanager node_exporter qdrant
```

The current blue app remains on its prior binaries. Document-backed RAG remains
unavailable because Cloud is not a recovery target; this is a visible blocker,
not a successful RAG rollback.

## After application cutover, before evidence-specific failure

1. Quiesce new generation and Stage 4/5/6 queues.
2. Run the **patched and pre-proven** blue/green rollback; the current script is
   not accepted until F3 is fixed.
3. Retag the protected `q12-pre-cutover` images to the compose release tag only
   if the previous color no longer references their immutable IDs; recreate API,
   main worker, and Stage 6 with the recorded previous env/image IDs.
4. Do not claim document RAG restored. Keep uploaded-document jobs stopped or let
   them fail visibly with `RAG_INFRA_UNAVAILABLE`; resume only no-document paths
   proven behavior-compatible.

The rollback script does not restart workers by design, so worker rollback is a
separate mandatory command/evidence block.

## Evidence-only containment

Quiesce first. Preserve all audit rows. For evidence-aware containment, keep the
shared active gate and set only
`DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT=0`; Stage 6 continues using accepted
decisions/refs. For audit-only rollback, additionally set
`DOCUMENT_EVIDENCE_MODE=shadow` or disable the feature. Restart the main and
Stage 6 workers coherently, prove a no-document and document-backed case, then
resume gradually. Never flip flags across an in-flight job.

## Collection-version rollback

For future versioned collections, atomically point `course_embeddings` back to
the last verified physical collection, verify targeted tenant/course RU/EN
retrieval, then resume. For this first cutover no previous local collection
exists, so alias rollback is unavailable until a later version is created.
Never overwrite the active collection with a restore.

# Verification

Read-only checks actually run:

- `ssh -G megacampus-prod` — target resolved.
- SSH inventory of host/systemd/Docker/Compose, active color, ports, files,
  directories, filtered env, image IDs, upload counts/modes, and unit presence —
  passed; no values from secret fields were printed.
- `gh secret list` for repository and production environment — passed; names
  only, no secret values.
- `git ls-remote origin refs/heads/{master,codex/self-hosted-qdrant-platform}` —
  passed.
- focused inspection of deploy workflow/scripts, Compose, Dockerfile/tsconfig,
  systemd units, reindex queue/source paths, snapshot/restore tools, and operator
  runbooks — passed.

No remote mutation command from the executable sequence was run.

# Delivery / Cleanup

The artifact is returned for orchestrator review. No staging process, temporary
file, tunnel, container, secret, GitHub setting, S3 object, or database state was
created by this stream. The dedicated Git worktree/branch remains for
orchestrator acceptance and cleanup.

# Risks / Follow-ups / Explicit Defers

- Q12 must stay open until the release/runtime/secret/source-truth gates are
  resolved and the entire live matrix passes.
- The exact S3 endpoint/bucket/region/access credentials are unavailable. This
  is an external product-truth/secret blocker, not a placeholder opportunity.
- The exact Node 22 patch/source for host installation is not defined in the
  current runbook. Do not install an unpinned package source silently.
- Remote `file_catalog` eligible/recoverable/gap counts and remote
  document-evidence migration state are not yet proven.
- A real recovery probe must be derived from accepted staging data after
  reindex; test fixture values are forbidden.
- `megacampus-qdrant-dev` is unrelated unpinned dev state on the same host. Q12
  staging work must not remove, rename, or reuse its volume/port.
