---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.14
stage_id: mc2-jz6y0
agent_type: docs_researcher
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: Version, authentication, secret transport, and notification choices are security-sensitive and block Q6/Q9.
repo: /home/me/code/mc2
branch: codex/qdrant-observability-docs-preflight
base_branch: codex/self-hosted-qdrant-platform
base_commit: b88b179a16bd2f8827b8d39a3fa83daa81cc13b6
worktree: /home/me/code/mc2/.worktrees/qdrant-observability-docs-preflight
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.14-docs.md
success_criteria:
  - Verify the five proposed image tags, multi-architecture index digests, and linux/amd64 child digests.
  - Confirm supported file-backed scrape, textfile, and notification configuration shapes.
  - Record Qdrant health/metrics authentication behavior and security caveats.
  - Produce one exact owner recommendation with bounded alternatives and residual risks.
selected_docs:
  - Official tagged Qdrant, Prometheus, Grafana, node_exporter, and Alertmanager releases/source/documentation.
  - Maintainer-controlled Docker registry manifests for the five official images.
selected_skills:
  - task-router
selected_agents:
  - docs_researcher
catalog_candidates:
  - none because the installed router and docs_researcher role cover this bounded research stream
parallel_group: observability-decision
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: Dedicated branch is pushed for orchestrator inspection and integration.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: This is the decision evidence; durable Compose and operator documentation remain Q6/Q9/Q10 work after owner acceptance.
graph_reviewed: used
graph_review_notes: Read the graph report built from b88b179a for repository orientation only; no graph query or refresh was required for external version facts.
verification:
  - docker buildx imagetools inspect for all five tags: passed
  - GitHub release API and official download/support pages: passed
  - Tagged configuration/source inspection for Qdrant 1.18.2, Prometheus 3.13.1, node_exporter 1.12.0, and Alertmanager 0.33.1: passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.14-docs.md
explicit_defers:
  - mc2-jz6y0.13 remains the separate Q12 remote-mutation authorization gate
---

# Summary

Result: **READY FOR OWNER DECISION**. Accessed 2026-07-11. All proposed tags exist, are non-prerelease releases, and have official multi-architecture images with linux/amd64 children. The exact recommended stack is supportable without embedding credentials in tracked configuration.

The implementation-critical correction is that Qdrant itself has no documented `*_FILE` environment convention. Prometheus, Grafana, and Alertmanager do. Qdrant keys therefore need a narrow mounted-secret wrapper that reads the files, exports the two documented Qdrant variables, and `exec`s the stock entrypoint without printing values.

# Exact pins and immutable digests

`Index digest` is the immutable multi-platform manifest to pin in Compose. `linux/amd64 digest` is the selected child manifest and must be asserted by the registry verification test; it is not substituted for the index digest unless the deployment is intentionally architecture-locked.

| Component | Exact image | Multi-arch index digest | linux/amd64 child digest | Release/support evidence |
| --- | --- | --- | --- | --- |
| Qdrant | `qdrant/qdrant:v1.18.2` | `sha256:75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c` | `sha256:da65a06bc75e42702f80c992b99c5144b0fbd675ae7a96d2991de0bf957b7071` | [v1.18.2 release](https://github.com/qdrant/qdrant/releases/tag/v1.18.2), published 2026-06-04; current GitHub release on access date |
| Prometheus | `prom/prometheus:v3.13.1` | `sha256:3c42b892cf723fa54d2f262c37a0e1f80aa8c8ddb1da7b9b0df9455a35a7f893` | `sha256:bd2dcadfb0d1096e2a4c21817ac7af918e2f19ff628e4bf25fd67a924c13dd80` | [v3.13.1 release](https://github.com/prometheus/prometheus/releases/tag/v3.13.1), [downloads](https://prometheus.io/download/), [LTS policy](https://prometheus.io/docs/introduction/release-cycle/); 3.13 is supported through 2027-07-31 |
| Grafana | `grafana/grafana:12.4.5` | `sha256:26b8f35a9e4e4431995cf64c3f396505a4faf17bcfc19f9ed84943ec6bfd5ecd` | `sha256:5e8dea6bf166881f31f370c16ba87a9eebe8ed33db7cce29ee6baf675d60676a` | [v12.4.5 release](https://github.com/grafana/grafana/releases/tag/v12.4.5), [support policy](https://grafana.com/docs/grafana/latest/upgrade-guide/when-to-upgrade/); 12.4 is the extended-support final 12.x minor through 2027-05-24 |
| node_exporter | `prom/node-exporter:v1.12.0` | `sha256:9b0ade5e607f9dbedb0a8e11151b6011ae5bd79304c261804cfdd2cadf200a80` | `sha256:fb027a472051259b5b7cfd027fe9faf7f8ac5f5fb58af93a818a832f7a90fc57` | [v1.12.0 release](https://github.com/prometheus/node_exporter/releases/tag/v1.12.0), [downloads](https://prometheus.io/download/); current release on access date |
| Alertmanager | `prom/alertmanager:v0.33.1` | `sha256:9e082985f56f4c8c9f724e18f2288c6708f472e56a5286b8863d080434ea065d` | `sha256:a89f8d4520954079275441eecdb71444328bd90633dd4eddfc33b9ed657f349b` | [v0.33.1 release](https://github.com/prometheus/alertmanager/releases/tag/v0.33.1), [downloads](https://prometheus.io/download/); current release on access date |

Registry verification used read-only `docker buildx imagetools inspect <image> --format '{{json .Manifest}}'`. The Qdrant index is OCI; the other four are Docker v2 manifest lists. Each contains both linux/amd64 and linux/arm64 children. These registry observations must be checked again only when intentionally changing a pin; tags alone remain mutable labels.

# Verified secure integration shapes

## Qdrant API keys, readiness, and metrics

First-party evidence: [Qdrant monitoring](https://qdrant.tech/documentation/ops-monitoring/monitoring/), [security and access table](https://qdrant.tech/documentation/operations/security/), [configuration](https://qdrant.tech/documentation/operations/configuration/), tagged [`src/actix/mod.rs`](https://github.com/qdrant/qdrant/blob/v1.18.2/src/actix/mod.rs), tagged [`service_api.rs`](https://github.com/qdrant/qdrant/blob/v1.18.2/src/actix/api/service_api.rs), tagged [`metrics_service.rs`](https://github.com/qdrant/qdrant/blob/v1.18.2/src/actix/metrics_service.rs), and tagged [`config.yaml`](https://github.com/qdrant/qdrant/blob/v1.18.2/config/config.yaml).

- `/healthz`, `/livez`, and `/readyz` are deliberately auth-whitelisted and remain unauthenticated when API keys are enabled. Keeping them reachable only on the private bridge/loopback is therefore required.
- `/metrics` on the normal REST listener is not whitelisted. It accepts the admin or read-only key; use the read-only key.
- Do **not** set `service.metrics_port`. In v1.18.2 that starts a separate metrics-only Actix listener without the API-key middleware, so its `/metrics` is unauthenticated. Scrape the authenticated main listener at `qdrant:6333` instead.
- Qdrant supports `QDRANT__SERVICE__API_KEY` and `QDRANT__SERVICE__READ_ONLY_API_KEY`, but tagged docs/source expose no `API_KEY_FILE` or general `_FILE` mapping. Compose secrets are mounted files, not automatic environment variables.
- Use a minimal, tested wrapper with read-only secret mounts. It must reject missing/empty files, trim only the final line terminator, never use tracing/echo, export the two documented variables, and `exec /qdrant/entrypoint.sh`. Keep the stock digest-pinned image; do not bake keys into an image, tracked YAML, Compose interpolation, command arguments, or reports.
- Qdrant's vendor guidance requires TLS for API keys. The approved design's same-host private bridge plus loopback publication is an explicit bounded threat-model exception. TLS becomes mandatory before any cross-host/non-loopback exposure.
- Publish the REST/Web UI port only as `127.0.0.1:6335:6333`; never publish gRPC or a metrics-only port. `/dashboard` assets are public to that listener, while its API requests still use the read-only key. Operator access remains via SSH tunnel.

## Prometheus scrape authentication

Prometheus 3.13.1's tagged [configuration reference](https://github.com/prometheus/prometheus/blob/v3.13.1/docs/configuration/configuration.md) supports arbitrary `http_headers` with file-backed values. `authorization.credentials_file` generates an `Authorization` header and is not the exact `api-key` header required by this plan.

```yaml
scrape_configs:
  - job_name: qdrant
    metrics_path: /metrics
    params:
      per_collection: ["true"]
    static_configs:
      - targets: ["qdrant:6333"]
    http_headers:
      api-key:
        files:
          - /run/secrets/qdrant_read_only_api_key
```

Mount that secret only into Qdrant and Prometheus. Validate with digest-pinned `promtool check config`, then prove an authenticated scrape succeeds and the same request without/with an invalid key fails. Keep Prometheus host publishing at `127.0.0.1:9090:9090`.

## node_exporter textfile transport

The tagged [node_exporter 1.12.0 README](https://github.com/prometheus/node_exporter/blob/v1.12.0/README.md#textfile-collector) confirms `--collector.textfile.directory`; it parses only `*.prom`, does not support timestamps in samples, and recommends atomic temp-file plus rename writes.

For this bounded use, run only the textfile collector:

```text
--collector.disable-defaults
--collector.textfile
--collector.textfile.directory=/var/lib/node_exporter/textfile_collector
```

The snapshot and restore jobs write gauges to a shared host directory via a temporary file and atomic rename; node_exporter mounts it read-only. Do not add host `/proc`, `/sys`, rootfs mounts, host PID/network, or capabilities for this textfile-only instance. Do not publish port 9100 to the host; Prometheus reaches it on the private monitoring network.

This exporter supplies backup/restore age gauges only. It does not solve Qdrant container-limit or application fallback metrics. Use Qdrant `memory_resident_bytes` against the fixed, tested Compose memory limit, and expose the hybrid-fallback counter from the application-owned metrics path.

## Alertmanager routing and secret files

Prometheus rules do not deliver notifications by themselves. Configure its `alerting.alertmanagers` to the private `alertmanager:9093` target. Alertmanager 0.33.1's tagged [configuration reference](https://github.com/prometheus/alertmanager/blob/v0.33.1/docs/configuration.md) natively supports receiver secret files. For the planned Telegram route, both `bot_token_file` and `chat_id_file` are supported:

```yaml
route:
  receiver: qdrant-telegram
  group_by: [alertname, severity]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

receivers:
  - name: qdrant-telegram
    telegram_configs:
      - bot_token_file: /run/secrets/alertmanager_telegram_bot_token
        chat_id_file: /run/secrets/alertmanager_telegram_chat_id
        send_resolved: true
```

The exact route timings are operator policy, not a vendor guarantee; they must be covered by routing tests. Mount receiver secrets only into Alertmanager, validate with digest-pinned `amtool check-config`, and send one controlled non-production test alert before activation. For this single-node topology set `--cluster.listen-address=` to disable the default gossip listener. Keep any UI/API host publication loopback-only, or omit it entirely.

Alternative receivers use their documented file variants (`webhook url_file`, Slack URL/token files, and similar). Do not interpolate tokens into tracked YAML.

## Grafana

Grafana 12.4.5 is not the current feature release (13.1.0 is), but it is a supported extended-maintenance line and is a safer compatibility choice for the approved classic dashboard/provisioning scope. Official [Docker configuration](https://grafana.com/docs/grafana/latest/setup-grafana/configure-docker/) supports `GF_<SECTION>_<KEY>__FILE`, including `GF_SECURITY_ADMIN_PASSWORD__FILE=/run/secrets/grafana_admin_password`.

Use `grafana/grafana`, not the retired-for-new-updates `grafana/grafana-oss` repository. Disable anonymous/public dashboard access and usage reporting, provision a non-editable Prometheus data source and dashboards, keep the port at `127.0.0.1:3005:3000`, and use a persistent data volume.

# Recommended exact owner decision

Approve the following as one atomic decision for Q6/Q9:

1. Pin all five images by the exact tag **and multi-arch index digest** in the table; set/verify `platform: linux/amd64` and assert the recorded amd64 child digest in tests.
2. Keep Qdrant 1.18.2 on the authenticated main REST listener only; leave `service.metrics_port` unset. Permit unauthenticated health endpoints only on private/loopback reachability.
3. Approve the bounded same-host plaintext exception already present in the design; require TLS before any non-loopback or cross-host access.
4. Mount admin/read-only Qdrant key files and use a fail-closed, no-output wrapper to export the documented Qdrant variables. Prometheus scrapes `qdrant:6333/metrics?per_collection=true` with `http_headers.api-key.files` and the read-only key.
5. Add the textfile-only, unprivileged/private node_exporter service for atomic backup/restore gauges. Do not grant host mounts, host namespaces, or capabilities.
6. Add single-node Alertmanager 0.33.1 with clustering disabled, private networking, file-backed Telegram token/chat ID, tested routing, and Prometheus delivery configuration.
7. Keep Grafana on supported extended-maintenance 12.4.5 for compatibility, with file-backed admin password, anonymous/public sharing disabled, and loopback-only access.

This resolves `.14` without changing Q12 authorization or performing any remote mutation.

# Risks / Follow-ups

## Alternatives and residual risk

- **Grafana 13.1.0 instead of 12.4.5:** fresher features, but broadens compatibility/migration work and requires revalidating dashboards and provisioning. Not recommended for this bounded stage.
- **Prometheus 3.5 LTS instead of 3.13 LTS:** shorter remaining support (through 2026-07-31) and no benefit for a new install. Reject.
- **Grafana-managed alerting instead of Alertmanager:** removes one service but requires a separate provisioning/contact-point contract and secret substitution proof. The approved Prometheus rule design maps more directly to Alertmanager.
- **Qdrant dedicated `metrics_port`:** simpler scrape with no credential, but unauthenticated in 1.18.2. Reject.
- **cAdvisor/full node_exporter host monitoring:** could supply dynamic container-limit metrics, but adds host visibility and privilege. Defer until measured need; use the fixed Compose limit now.
- **Qdrant TLS on the private bridge:** strongest vendor-aligned option. It requires certificate issuance/rotation and changes every client URL, so treat it as a separate hardening task unless the owner rejects the same-host plaintext exception.
- **Mutable-tag risk:** even tag-plus-digest syntax must be enforced by tests; future upgrades require a new decision packet and restore/relevance regression gates.
- **File permissions:** each container must run with only the group/user access needed for its own secret. Never make the shared secret directory broadly readable merely to accommodate mismatched image UIDs.
- **Notification secrets unavailable:** local configuration and routing tests can proceed with synthetic files, but real receiver delivery and activation remain blocked until runtime secrets are supplied under the Q12 gate.

# Verification

Executed read-only checks:

```text
docker buildx imagetools inspect <each exact image> --format '{{json .Manifest}}'
GitHub releases API for all five exact tags and each repository's current release
Official Prometheus downloads and LTS pages
Tagged-source inspection of Qdrant auth whitelist/main metrics/dedicated metrics/config loader
Tagged Prometheus 3.13.1 http_headers/files schema
Tagged node_exporter 1.12.0 textfile collector contract
Tagged Alertmanager 0.33.1 receiver/secret-file and single-node cluster flags
```

No image was run, no service was started, no credential was read or created, no Beads state was changed, and no dev/staging/production system was contacted.
