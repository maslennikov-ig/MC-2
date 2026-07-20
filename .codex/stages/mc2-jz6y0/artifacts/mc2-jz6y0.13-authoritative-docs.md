---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13
stage_id: mc2-jz6y0
agent_type: docs_researcher
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: Q12 crosses authentication, secret transport, snapshot recovery, monitoring delivery, service scheduling, and rollback-sensitive deployment contracts.
repo: /home/me/code/mc2
branch: codex/q12-authoritative-docs
base_branch: codex/self-hosted-qdrant-platform
base_commit: ebdf9c2e
worktree: /home/me/code/mc2/.worktrees/q12-authoritative-docs
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-authoritative-docs.md
success_criteria:
  - Re-check exact supported versions and immutable image identities from first-party release and registry sources.
  - Confirm or correct deployment shapes for Qdrant security, metrics, S3 snapshots, recovery, aliases, Prometheus, Grafana, Alertmanager, node_exporter, Docker Compose, and systemd.
  - Record only deployment-affecting evidence and caveats without contacting or mutating staging.
selected_docs:
  - Qdrant 1.18.2 release, tagged config/source/OpenAPI, current security, monitoring, snapshots, and collections documentation.
  - Prometheus 3.13.1 release, tagged configuration/storage source, and current LTS policy.
  - Grafana 12.4.5 release, Docker configuration, provisioning, and version-support policy.
  - Alertmanager 0.33.1 release, tagged configuration/source, and current configuration reference.
  - node_exporter 1.12.0 release and tagged textfile collector documentation.
  - Current Docker Compose services/secrets reference and systemd 257 execution/timer manuals.
selected_skills:
  - none - the assigned docs_researcher persona and first-party sources covered the bounded research stream
selected_agents:
  - docs_researcher
catalog_candidates:
  - none - no reusable asset gap was found
parallel_group: Q12-D-authoritative-docs
depends_on_streams:
  - mc2-jz6y0.12
parallel_decision: parallel with read-only Q12 preflight and correctness streams in a disjoint write zone
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: awaiting orchestrator acceptance; research used read-only HTTP, GitHub release/registry inspection, and repository reads only
risk_level: high
docs_impact: docs-only
docs_reviewed: updated
docs_review_notes: Added a version-pinned, first-party Q12 deployment decision packet; no stable runtime document was changed.
graph_reviewed: used
graph_review_notes: Read only /tmp/q12-graphify-query.txt for orientation; no graph refresh or external model mode was used.
verification:
  - GitHub first-party release API for all five exact tags and latest-release state: passed
  - docker buildx imagetools inspect for all five exact tags and linux/amd64 children: passed
  - Qdrant v1.18.2 tagged config, source, OpenAPI, alias and URL-recovery tests: passed
  - Prometheus v3.13.1 tagged config/source plus current LTS policy: passed with one non-blocking deprecation correction
  - Grafana, Alertmanager, node_exporter, Docker Compose and systemd first-party shape checks: passed
  - scripts/orchestration/validate_artifact.py on this artifact: passed
  - Prettier check through the primary workspace dependency runtime: passed
  - git diff --check: passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-authoritative-docs.md
explicit_defers:
  - Real secret validation, external notification delivery, service installation, snapshot creation, live reindex, deployment, and staging observation remain Q12 remote actions and were not performed by this research stream.
  - Prometheus retention flags remain accepted in 3.13.1 but should move to storage.tsdb.retention YAML before the next Prometheus upgrade.
---

# Summary

**Result: READY FOR Q12 PREFLIGHT; NO REMOTE ACTION PERFORMED.** Sources were
accessed on 2026-07-12. The approved versions, immutable image digests, Qdrant
security/snapshot/alias shapes, authenticated Prometheus scrape, Grafana and
Alertmanager file-secret forms, node_exporter textfile contract, Docker Compose
topology, and systemd credential/timer forms remain supportable.

No deployment-blocking correction was found. One bounded correction is needed
for durable maintenance: Prometheus 3.13.1 still accepts the configured
`--storage.tsdb.retention.time` and `--storage.tsdb.retention.size` flags, but
its tagged source marks them deprecated and gives `storage.tsdb.retention` in
`prometheus.yml` precedence. This does not block Q12 because the pinned image
and current validation accept the flags; promote the YAML migration before the
next Prometheus upgrade.

## Exact release and image state

All five exact releases are non-draft, non-prerelease first-party releases.
Qdrant, Prometheus, Alertmanager, and node_exporter are also their repositories'
latest releases on the access date. Grafana 13.1.0 is the current feature
release, while 12.4.5 remains the approved final 12.x line under patch support
through 2027-05-24.

| Component | Approved image | Multi-arch index digest | linux/amd64 child | Release/support state |
| --- | --- | --- | --- | --- |
| Qdrant | `qdrant/qdrant:v1.18.2` | `sha256:75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c` | `sha256:da65a06bc75e42702f80c992b99c5144b0fbd675ae7a96d2991de0bf957b7071` | latest, released 2026-06-04 |
| Prometheus | `prom/prometheus:v3.13.1` | `sha256:3c42b892cf723fa54d2f262c37a0e1f80aa8c8ddb1da7b9b0df9455a35a7f893` | `sha256:bd2dcadfb0d1096e2a4c21817ac7af918e2f19ff628e4bf25fd67a924c13dd80` | latest 3.13 LTS bugfix, supported through 2027-07-31 |
| Grafana | `grafana/grafana:12.4.5` | `sha256:26b8f35a9e4e4431995cf64c3f396505a4faf17bcfc19f9ed84943ec6bfd5ecd` | `sha256:5e8dea6bf166881f31f370c16ba87a9eebe8ed33db7cce29ee6baf675d60676a` | final 12.x minor, patch support through 2027-05-24 |
| Alertmanager | `prom/alertmanager:v0.33.1` | `sha256:9e082985f56f4c8c9f724e18f2288c6708f472e56a5286b8863d080434ea065d` | `sha256:a89f8d4520954079275441eecdb71444328bd90633dd4eddfc33b9ed657f349b` | latest, released 2026-07-04 |
| node_exporter | `prom/node-exporter:v1.12.0` | `sha256:9b0ade5e607f9dbedb0a8e11151b6011ae5bd79304c261804cfdd2cadf200a80` | `sha256:fb027a472051259b5b7cfd027fe9faf7f8ac5f5fb58af93a818a832f7a90fc57` | latest, released 2026-07-11 |

The registry observations exactly match `deploy/qdrant/image-lock.json` and
`ops/qdrant/image-lock.json`. Tags remain mutable labels; Q12 must deploy the
tag-plus-index-digest strings and verify `platform: linux/amd64`, not deploy a
tag alone or substitute an unreviewed architecture child.

# Deployment findings

## Q12-D1 — Qdrant authentication, health, and metrics are correctly bounded

- **Finding:** Confirmed. Qdrant 1.18.2 supports admin and read-only API keys in
  `service.api_key` / `service.read_only_api_key`. The tagged config explicitly
  warns that API keys should be protected by TLS. `/healthz`, `/livez`, and
  `/readyz` are in the auth whitelist and remain unauthenticated. `/metrics` on
  the main REST listener passes through the normal auth middleware. A configured
  `service.metrics_port` starts a separate metrics application without that
  auth middleware.
- **Evidence:** Qdrant tagged `config/config.yaml`, `src/settings.rs`,
  `src/actix/mod.rs`, `src/actix/metrics_service.rs`, and current monitoring and
  security documentation.
- **Implication:** Keep `service.metrics_port` absent. Scrape
  `qdrant:6333/metrics?per_collection=true` with the separate read-only key.
  Health checks are acceptable only on the private bridge/loopback. The current
  same-host plaintext bridge is a documented bounded exception to Qdrant's TLS
  recommendation; any cross-host or non-loopback exposure requires TLS first.
- **Confidence:** High; tagged source and current first-party docs agree.
- **Next action:** Q12 preflight must prove unauthenticated readiness, 401 for
  unauthenticated/invalid metrics, 200 for the read-only metrics key, and 403 for
  read-only mutation before application cutover.
- **Promotion target:** Q12 deploy preflight and observation record.

## Q12-D2 — Qdrant needs the existing fail-closed file-secret wrapper

- **Finding:** Confirmed. Qdrant's tagged config loader maps environment keys with
  prefix `QDRANT` and separator `__`; it does not provide a general `*_FILE`
  convention for API or S3 credentials.
- **Evidence:** Qdrant v1.18.2 `src/settings.rs` and `config/config.yaml`; Docker
  Compose secret reference.
- **Implication:** Preserve `deploy/qdrant/secret-entrypoint.sh`: it must read
  mounted files without output, reject missing/empty/multiline or overly broad
  modes, export only the documented nested variables, and exec the stock
  entrypoint. Docker's current Compose reference says a non-null custom
  `entrypoint` ignores image `CMD`, while the repository's pinned target-engine
  test previously observed the stock `./entrypoint.sh` token. The current exact
  token guard is defensive and should not be removed without repeating the
  target-engine test.
- **Confidence:** High for the Qdrant config; medium-high for cross-engine
  entrypoint behavior because the current Docker reference and observed pinned
  engine behavior differ.
- **Next action:** Re-run the wrapper/Compose contract and secret-mode preflight
  on the target Docker/Compose versions before starting Qdrant.
- **Promotion target:** Q12 host preflight evidence, not tracked secret values.

## Q12-D3 — Native S3 snapshot environment mapping is valid

- **Finding:** Confirmed. Qdrant 1.18.2 accepts
  `storage.snapshots_config.snapshots_storage=local|s3` and an optional
  `s3_config` with `bucket`, `region`, `access_key`, `secret_key`, and
  `endpoint_url`. Its config loader makes the existing environment form valid:

  ```text
  QDRANT__STORAGE__SNAPSHOTS_CONFIG__SNAPSHOTS_STORAGE=s3
  QDRANT__STORAGE__SNAPSHOTS_CONFIG__S3_CONFIG__BUCKET=...
  QDRANT__STORAGE__SNAPSHOTS_CONFIG__S3_CONFIG__REGION=...
  QDRANT__STORAGE__SNAPSHOTS_CONFIG__S3_CONFIG__ACCESS_KEY=...
  QDRANT__STORAGE__SNAPSHOTS_CONFIG__S3_CONFIG__SECRET_KEY=...
  QDRANT__STORAGE__SNAPSHOTS_CONFIG__S3_CONFIG__ENDPOINT_URL=...
  ```

- **Evidence:** Tagged `config/config.yaml`, `src/settings.rs`, and
  `lib/collection/src/common/snapshots_manager.rs`.
- **Implication:** The wrapper's mapping is correct. `endpoint_url` is supported
  by tagged source even though the short example in current configuration docs
  lists only the first four fields. An `http://` endpoint explicitly enables
  plaintext S3 transport in Qdrant's builder; production off-host storage should
  use HTTPS unless a separately accepted private-network exception exists.
- **Confidence:** High.
- **Next action:** Q12 must validate only secret presence/path/mode and sanitized
  bucket/region/endpoint identity before startup; never print credential values.
  Prove one off-host snapshot and one checksum-verified restore drill after
  activation authority is in effect.
- **Promotion target:** Q12 secret preflight, snapshot manifest, restore evidence.

## Q12-D4 — Snapshot recovery request shape is correct but keeps an SSRF surface

- **Finding:** Confirmed with caveat. The v1.18 OpenAPI `SnapshotRecover` shape
  requires `location` and supports `priority`, SHA-256 `checksum`, and `api_key`
  for an authenticated remote fetch. `priority: snapshot` makes the snapshot the
  source of truth. Qdrant 1.18.2 defaults URL recovery to enabled; setting
  `QDRANT__SERVICE__ENABLE_SNAPSHOT_URL_RECOVERY=false` rejects HTTP/HTTPS
  recovery with 403 before a network request.
- **Evidence:** Tagged `openapi/openapi-snapshots.ytt.yaml`,
  `docs/redoc/v1.18.x/openapi.json`, `config/config.yaml`, and
  `tests/consensus_tests/test_disable_url_snapshot_recovery.py`.
- **Implication:** The current isolated drill's self-HTTP request with
  `location`, `priority: snapshot`, checksum, and `api_key` is supported. It
  requires URL recovery to stay enabled, which is an SSRF-capable administrative
  surface. Keep the admin API private, never expose it to untrusted callers, and
  use only the fixed self-listener transport. Disabling URL recovery later
  requires changing the drill to the upload/local-file recovery endpoint first.
- **Confidence:** High.
- **Next action:** Before the live drill, assert the transport URL is the fixed
  Qdrant-local listener, the stable alias is unchanged, and cleanup ownership is
  exact. Do not accept an arbitrary operator-supplied remote URL.
- **Promotion target:** Q12 recovery drill evidence and security caveat.

## Q12-D5 — Alias cutover and rollback must remain one atomic request

- **Finding:** Confirmed. Qdrant aliases are additional collection names, and
  multiple alias actions in one `POST /collections/aliases` request are atomic.
  The documented switch uses one delete-alias plus create-alias action list.
- **Evidence:** Current first-party collections documentation, “Collection
  Aliases” and “Switch Collection”.
- **Implication:** Build and verify the new physical collection in the background,
  then switch the stable `course_embeddings` alias in one request. Rollback is
  the inverse atomic action list. Never delete the previous physical collection
  until the rollback window and successful snapshot complete.
- **Confidence:** High.
- **Next action:** Record alias target before/after and retain the previous
  physical collection; abort cutover on any verification gap.
- **Promotion target:** Q12 alias cutover/rollback record.

## Q12-D6 — Prometheus authenticated scrape is supported; per-collection mode changes output

- **Finding:** Confirmed. Prometheus 3.13.1 supports arbitrary `http_headers`
  values loaded from `files`; the existing `http_headers.api-key.files` shape is
  exact. Qdrant's `?per_collection=true` mode is available since 1.18.0, replaces
  the unlabeled global REST/gRPC response series, and adds collection labels.
- **Evidence:** Prometheus v3.13.1 tagged configuration reference and Qdrant
  current monitoring documentation.
- **Implication:** Keep the authenticated main-listener scrape and the existing
  recording/dashboard selectors validated against per-collection labels. Do not
  expect global and per-collection response series simultaneously. Cardinality
  grows with collection count; current single-alias/versioned-collection scale is
  bounded, but Q12 observation should inspect series/target health.
- **Confidence:** High.
- **Next action:** Run digest-pinned `promtool` before startup, then require
  `up{job="qdrant"}=1` and inspect target errors after bootstrap/reindex.
- **Promotion target:** Q12 monitoring observation evidence.

## Q12-D7 — Prometheus retention flags are accepted but deprecated

- **Finding:** Correction, non-blocking. Prometheus 3.13.1 still accepts
  `--storage.tsdb.retention.time=15d` and
  `--storage.tsdb.retention.size=5GB`, but its tagged command source marks both
  flags deprecated. The supported runtime-reloadable shape is:

  ```yaml
  storage:
    tsdb:
      retention:
        time: 15d
        size: 5GB
  ```

- **Evidence:** Prometheus v3.13.1 `cmd/prometheus/main.go` and tagged
  configuration reference; the YAML values take precedence over deprecated
  flags.
- **Implication:** Current Q12 activation remains valid on the exact pinned image,
  but the Compose command will carry deprecation debt. Moving retention into the
  tracked Prometheus config is a small local change that must be revalidated by
  promtool and Compose before a future Prometheus upgrade.
- **Confidence:** High.
- **Next action:** Do not change runtime state during research. Either integrate
  the local YAML correction before Q12 activation and rerun existing gates, or
  explicitly defer it to a tracked pre-upgrade task; do not silently carry it
  past the next pin change.
- **Promotion target:** Q12 local preflight correction or explicit tracked defer.

## Q12-D8 — Grafana 12.4.5 remains supported and file provisioning is valid

- **Finding:** Confirmed with deletion caveat. Grafana 12.4.x is the last 12.x
  minor and receives patch support through 2027-05-24. `grafana/grafana` is the
  correct image repository; `grafana/grafana-oss` is no longer updated starting
  with 12.4. Docker configuration supports
  `GF_<SECTION>_<KEY>__FILE`, including
  `GF_SECURITY_ADMIN_PASSWORD__FILE`. File datasource/dashboard provisioning,
  `allowUiUpdates: false`, stable dashboard UIDs, and polling with
  `updateIntervalSeconds: 30` are supported.
- **Evidence:** Grafana 12.4.5 release, current Docker configuration,
  provisioning docs, and current self-managed support policy.
- **Implication:** Current secret, read-only root filesystem, persistent data,
  provisioned datasource/dashboard, and loopback port shapes are valid.
  `disableDeletion: false` means removing the provisioning source can delete the
  database dashboard; Q12 must keep the source mount present. Set it true only if
  preserving dashboards after source removal is an explicit rollback goal.
- **Confidence:** High.
- **Next action:** Before activation, validate provisioning through the pinned
  container, keep the source bind mounted, and observe the expected dashboard UID.
- **Promotion target:** Q12 Grafana provisioning smoke.

## Q12-D9 — Alertmanager file-backed Telegram and single-node mode are valid

- **Finding:** Confirmed. Alertmanager 0.33.1 supports mutually exclusive
  `bot_token_file`/`bot_token` and `chat_id_file`/`chat_id`, with
  `send_resolved`. Tagged source documents `--cluster.listen-address=` as the way
  to disable HA mode and `--storage.path` as persistent state storage.
- **Evidence:** Alertmanager v0.33.1 tagged configuration and
  `cmd/alertmanager/main.go`; current Prometheus Alertmanager reference.
- **Implication:** Existing file-secret route, clustering-disabled single-node
  command, persistent `/alertmanager`, and loopback UI are supported. Synthetic
  route validation is not evidence of real delivery; actual Telegram contact is
  an external effect requiring the Q12 authorization and secrets already in scope.
- **Confidence:** High.
- **Next action:** Run pinned `amtool check-config` before startup, then one
  controlled firing/resolved notification only within the authorized observation
  plan. Redact receiver identifiers from evidence.
- **Promotion target:** Q12 notification observation evidence.

## Q12-D10 — node_exporter textfile-only transport is the correct low-privilege shape

- **Finding:** Confirmed. node_exporter 1.12.0 supports
  `--collector.disable-defaults`, `--collector.textfile`, and the required
  `--collector.textfile.directory`. It parses `*.prom`, does not support sample
  timestamps, and documents temp-file plus atomic rename for batch metrics.
- **Evidence:** node_exporter v1.12.0 tagged README and release.
- **Implication:** The existing private textfile-only exporter does not need host
  `/proc`, `/sys`, rootfs, host namespaces, capabilities, or a host-published
  port. Continue writing timestamps as metric values, not exposition timestamps.
- **Confidence:** High.
- **Next action:** Prove the UID-65534 exporter can read the final mode-0644 files
  while it cannot write the shared directory; verify snapshot/restore age gauges.
- **Promotion target:** Q12 node_exporter/Prometheus target evidence.

## Q12-D11 — Docker Compose topology is valid; host file permissions are mandatory

- **Finding:** Confirmed with a material secret-permission caveat. Compose accepts
  OCI image references by digest, loopback host-IP port mappings,
  `depends_on.condition: service_healthy`, read-only filesystems, capability
  drops, and per-service secrets. File-backed secrets are implemented as bind
  mounts; Compose silently ignores requested secret `uid`, `gid`, and `mode`
  remapping for `file` sources.
- **Evidence:** Current Docker Compose services and secrets references.
- **Implication:** Digest pins, `127.0.0.1` bindings, Qdrant health dependencies,
  and explicit secret grants are correct. The source files themselves must have
  the tested owner/mode before `docker compose up`; Compose cannot repair their
  ownership. `service_started` for Prometheus/Grafana/Alertmanager/node_exporter
  is only process ordering, not readiness, so Q12 must observe targets and APIs
  explicitly before acceptance.
- **Confidence:** High.
- **Next action:** Record Docker/Compose versions, validate exact source paths,
  owners and modes without values, render Compose, start infrastructure
  selectively, and pass explicit readiness/auth/provisioning checks.
- **Promotion target:** Q12 host/Compose preflight and observation record.

## Q12-D12 — systemd credential and timer forms are supported

- **Finding:** Confirmed. systemd 257 documents
  `LoadCredential=ID:/absolute/path`, read-only per-unit credential copies, `%d`
  expansion in `Environment=`, and `$CREDENTIALS_DIRECTORY` as the primary runtime
  interface. `LoadCredential` and `%d` require systemd 247 or newer. For calendar
  timers, `Persistent=true` records last activation and performs one catch-up
  activation after downtime, still subject to `RandomizedDelaySec`. Jitter is
  added before the `AccuracySec` coalescing window.
- **Evidence:** systemd v257 `systemd.exec` and `systemd.timer` manuals.
- **Implication:** The snapshot/restore units' absolute credential sources and
  `%d/...` environment paths are valid when the target is systemd >=247. The
  four-hour snapshot schedule with 10-minute random delay and one-minute accuracy
  has a worst scheduled spacing of 4h11m, below the six-hour objective while the
  host is operating. `Persistent=true` improves restart catch-up but cannot meet
  RPO during a prolonged host outage. The restore service intentionally fails if
  its latest manifest or recovery probe credential source is absent.
- **Confidence:** High.
- **Next action:** Before installation, record `systemd --version`, verify the
  absolute `/usr/bin/pnpm` and credential/source paths, run `systemd-analyze
  verify` and `systemd-analyze calendar`, then install/enable units only under
  current Q12 authorization. Preserve stale-snapshot/restore alerts.
- **Promotion target:** Q12 systemd install/timer evidence.

# First-party sources

Accessed 2026-07-12:

- Qdrant release: <https://github.com/qdrant/qdrant/releases/tag/v1.18.2>
- Qdrant tagged config: <https://github.com/qdrant/qdrant/blob/v1.18.2/config/config.yaml>
- Qdrant tagged settings/auth/metrics source:
  <https://github.com/qdrant/qdrant/blob/v1.18.2/src/settings.rs>,
  <https://github.com/qdrant/qdrant/blob/v1.18.2/src/actix/mod.rs>, and
  <https://github.com/qdrant/qdrant/blob/v1.18.2/src/actix/metrics_service.rs>
- Qdrant tagged S3 storage:
  <https://github.com/qdrant/qdrant/blob/v1.18.2/lib/collection/src/common/snapshots_manager.rs>
- Qdrant v1.18 snapshot OpenAPI:
  <https://github.com/qdrant/qdrant/blob/v1.18.2/docs/redoc/v1.18.x/openapi.json>
- Qdrant URL-recovery security test:
  <https://github.com/qdrant/qdrant/blob/v1.18.2/tests/consensus_tests/test_disable_url_snapshot_recovery.py>
- Qdrant monitoring, security, snapshots, collections, and configuration:
  <https://qdrant.tech/documentation/ops-monitoring/monitoring/>,
  <https://qdrant.tech/documentation/operations/security/>,
  <https://qdrant.tech/documentation/operations/snapshots/>,
  <https://qdrant.tech/documentation/manage-data/collections/>, and
  <https://qdrant.tech/documentation/operations/configuration/>
- Prometheus 3.13.1 release and tagged configuration/source:
  <https://github.com/prometheus/prometheus/releases/tag/v3.13.1>,
  <https://github.com/prometheus/prometheus/blob/v3.13.1/docs/configuration/configuration.md>, and
  <https://github.com/prometheus/prometheus/blob/v3.13.1/cmd/prometheus/main.go>
- Prometheus LTS policy: <https://prometheus.io/docs/introduction/release-cycle/>
- Grafana 12.4.5 release, Docker config, provisioning and support:
  <https://github.com/grafana/grafana/releases/tag/v12.4.5>,
  <https://grafana.com/docs/grafana/latest/setup-grafana/configure-docker/>,
  <https://grafana.com/docs/grafana/latest/administration/provisioning/>, and
  <https://grafana.com/docs/grafana/latest/upgrade-guide/when-to-upgrade/>
- Alertmanager 0.33.1 release and tagged configuration/source:
  <https://github.com/prometheus/alertmanager/releases/tag/v0.33.1>,
  <https://github.com/prometheus/alertmanager/blob/v0.33.1/docs/configuration.md>, and
  <https://github.com/prometheus/alertmanager/blob/v0.33.1/cmd/alertmanager/main.go>
- node_exporter 1.12.0 release and textfile contract:
  <https://github.com/prometheus/node_exporter/releases/tag/v1.12.0> and
  <https://github.com/prometheus/node_exporter/blob/v1.12.0/README.md#textfile-collector>
- Docker Compose services/secrets:
  <https://docs.docker.com/reference/compose-file/services/> and
  <https://docs.docker.com/reference/compose-file/secrets/>
- systemd 257 execution and timer manuals:
  <https://www.freedesktop.org/software/systemd/man/257/systemd.exec.html> and
  <https://www.freedesktop.org/software/systemd/man/257/systemd.timer.html>

# Scope / Routing

The stream used only the assigned worktree and artifact write zone. Repository
orientation came only from `/tmp/q12-graphify-query.txt`; runtime assumptions
were compared with tracked Compose, Qdrant wrapper, monitoring configuration,
and systemd units. External research was restricted to first-party current docs,
tagged source/OpenAPI, release APIs, and maintainer registry manifests. No
community post or catalog asset was used.

# Verification

Read-only evidence commands included:

```text
GitHub releases API: exact tag plus latest release for all five repositories
docker buildx imagetools inspect <each exact image> --format '{{json .Manifest}}'
Tagged raw-source inspection for Qdrant 1.18.2, Prometheus 3.13.1,
Alertmanager 0.33.1, node_exporter 1.12.0, and systemd 257
Current first-party Qdrant, Prometheus, Grafana, Docker and systemd docs
Repository comparison with Compose, image locks, wrapper, monitoring files and units
```

No server, staging endpoint, secret, remote receiver, external snapshot bucket,
service manager, application container, Qdrant collection, alias, or database was
contacted or mutated.

# Delivery / Cleanup

This artifact is returned for orchestrator review. Acceptance, integration and
worktree cleanup remain parent-owned. Commit and push identity are reported by
the completion event because an artifact cannot record the SHA of the commit
that contains itself.

# Risks / Follow-ups / Explicit Defers

- Qdrant's API-key-without-TLS posture remains a bounded same-host private-bridge
  exception. Any cross-host or non-loopback exposure is blocked on TLS.
- URL snapshot recovery is intentionally enabled for the authenticated self-HTTP
  restore drill and therefore retains an administrative SSRF surface. Only the
  fixed private transport is acceptable.
- Real S3, notification, service, deploy, reindex, cutover and staging checks are
  Q12 actions; this research does not authorize or perform them.
- Prometheus retention flags are accepted by 3.13.1 but deprecated. Move them to
  YAML before the next pin change or record a bounded tracked defer.
- `Persistent=true` cannot provide recovery during a prolonged whole-host outage;
  off-host snapshots and stale-age alerts remain mandatory.
