# Self-hosted Qdrant operator runbook

This runbook covers the private Qdrant 1.18.2 observability path. It does not
authorize a deployment, live reindex, secret change, notification to a real
receiver, or any staging/production mutation. Those actions remain behind the
Q12 approval gate.

## Immutable runtime

The approved monitoring images are pinned in `ops/qdrant/image-lock.json`:

- Prometheus 3.13.1 LTS;
- Grafana 12.4.5 extended support;
- node_exporter 1.12.0;
- Alertmanager 0.33.1.

Compose uses each tag plus its approved multi-platform index digest and
`linux/amd64`. The lock also records the approved platform child digest. Do not
replace a pin with `latest` or a tag-only reference.

## Access: loopback and SSH tunnel only

On an authorized operator workstation, open one tunnel to the target host:

```bash
ssh -L 6335:127.0.0.1:6335 \
  -L 3005:127.0.0.1:3005 \
  -L 9090:127.0.0.1:9090 \
  -L 9093:127.0.0.1:9093 \
  megacampus-prod
```

Then use:

- Qdrant Web UI: `http://127.0.0.1:6335/dashboard`;
- Grafana: `http://127.0.0.1:3005`;
- Prometheus: `http://127.0.0.1:9090`;
- Alertmanager: `http://127.0.0.1:9093`.

Use the Qdrant read-only key in Web UI requests. Never use the admin key for
inspection. The Web UI assets and health paths are not authenticated, so never
publish Qdrant, Prometheus, Grafana, Alertmanager, or node_exporter on a public
interface. The approved plaintext exception is limited to one host's private
Docker bridge plus loopback; cross-host access requires TLS first.

## Secret and directory preparation

Tracked files contain paths only. Before an authorized activation, provision
separate local files for the Qdrant read-only scrape credential, Grafana admin
password, Telegram bot token, and Telegram chat ID. Give each file only the UID
of its consuming image and mode `0400`; do not make the Qdrant server credential
more broadly readable to accommodate Prometheus. The Prometheus copy must carry
the same read-only value but has an independent path and ownership.

Create `QDRANT_METRICS_TEXTFILE_HOST_DIR` as a non-secret, exporter-readable
directory. Application containers write one persistent file per service and
instance by atomic rename. Snapshot and restore jobs publish their gauges the
same way. Only `*.prom` final files belong there; temporary files must never be
observed after a successful write.

## Safe local validation before activation

Use synthetic local files, never deployment credentials:

```bash
docker run --rm --entrypoint /bin/promtool \
  -v "$PWD/ops/qdrant/prometheus:/etc/prometheus:ro" \
  prom/prometheus:v3.13.1@sha256:3c42b892cf723fa54d2f262c37a0e1f80aa8c8ddb1da7b9b0df9455a35a7f893 \
  check rules /etc/prometheus/alerts.yml

docker run --rm --entrypoint /bin/promtool \
  -v "$PWD/ops/qdrant/prometheus:/etc/prometheus:ro" \
  prom/prometheus:v3.13.1@sha256:3c42b892cf723fa54d2f262c37a0e1f80aa8c8ddb1da7b9b0df9455a35a7f893 \
  test rules /etc/prometheus/alert-tests.yml

docker run --rm --entrypoint /bin/amtool \
  -v "$PWD/ops/qdrant/alertmanager:/etc/alertmanager:ro" \
  prom/alertmanager:v0.33.1@sha256:9e082985f56f4c8c9f724e18f2288c6708f472e56a5286b8863d080434ea065d \
  check-config /etc/alertmanager/alertmanager.yml
```

Validate notification routing with `amtool config routes test` and a disposable
local webhook override. Prove both firing and resolved payloads at a loopback
sink, then remove the disposable container/network/files. Do not contact the
real Telegram receiver during local acceptance.

## Prometheus and dashboard checks

Prometheus must show these three targets as healthy:

- `qdrant:6333/metrics?per_collection=true`, with `api-key` loaded from a file;
- `node_exporter:9100`, reachable only on the private bridge;
- `alertmanager:9093`, reachable only on the private bridge.

Qdrant `service.metrics_port` must remain absent. An unauthenticated or invalid
key request to the main `/metrics` listener must fail, while the read-only key
must read metrics and collections but cannot mutate a collection.

The provisioned Grafana dashboard must show target/alert state, recovery mode,
Qdrant app/version info, points and vectors, request/error/p95, memory,
optimizations, snapshot/recovery age and activity, and hybrid fallback rate.
Anonymous access, sign-up, UI edits of provisioned assets, and public dashboards
remain disabled.

## Bootstrap, verify, reindex, snapshot, and restore

Run these only in an already authorized environment and with credential paths
resolved outside command output:

```bash
pnpm --dir packages/course-gen-platform qdrant:bootstrap
pnpm --dir packages/course-gen-platform qdrant:verify
pnpm --dir packages/course-gen-platform qdrant:reindex:plan
pnpm --dir packages/course-gen-platform qdrant:reindex:execute
pnpm --dir packages/course-gen-platform qdrant:reindex:verify
pnpm --dir packages/course-gen-platform qdrant:snapshot
pnpm --dir packages/course-gen-platform qdrant:restore-drill
```

The Q8 recovery implementation owns the final snapshot/restore command details,
checksum manifest, retention, systemd timers, isolated collection and alias
cleanup. Never restore over the active alias. A failed drill leaves the stable
alias untouched and keeps evidence for triage.

## Alert triage

- `QdrantDown`: check `/readyz`, the private network, the read-only scrape file,
  and Prometheus target error. Do not enable an unauthenticated metrics port.
- `QdrantRecoveryMode`: preserve logs and storage evidence; do not restart-loop
  or delete storage.
- `QdrantRestErrorRateHigh`: split 4xx from 5xx, inspect recent callers and
  correlate with p95 latency.
- `QdrantMemoryHigh`: the rule assumes the enforced 2 GiB limit. If that limit
  changes, change the rule atomically or add a real limit exporter.
- `QdrantPointCountUnexpectedDrop`: check reindex/alias activity. Maintenance
  suppression requires an audited Alertmanager silence.
- `QdrantSnapshotStale`: check the last durable manifest and off-host copy; do
  not delete the last known-good snapshot.
- `QdrantRestoreDrillStale`: inspect the monthly drill evidence and cleanup
  state before retrying.
- `QdrantHybridFallbackHigh`: group by application service/instance, inspect
  Qdrant errors and native BM25/Formula compatibility, and retain dense fallback
  for availability.

Missing snapshot or restore gauges are deliberate failures, not healthy zeros.

## Rollback

For a monitoring-only rollback after an authorized activation, stop Grafana,
Prometheus, Alertmanager and node_exporter without deleting their named volumes.
Remove the application metrics environment/mount only in the same reviewed
release. Qdrant and its stable alias remain untouched. If notification routing
is wrong, stop Alertmanager first; never patch a token into tracked YAML.

## First-party references checked for this configuration

Accessed 2026-07-11:

- Prometheus 3.13.1 configuration: <https://github.com/prometheus/prometheus/blob/v3.13.1/docs/configuration/configuration.md>
- Prometheus release/LTS policy: <https://github.com/prometheus/prometheus/releases/tag/v3.13.1> and <https://prometheus.io/docs/introduction/release-cycle/>
- Alertmanager 0.33.1 configuration: <https://github.com/prometheus/alertmanager/blob/v0.33.1/docs/configuration.md>
- node_exporter 1.12.0 textfile collector: <https://github.com/prometheus/node_exporter/blob/v1.12.0/README.md#textfile-collector>
- Grafana provisioning and Docker secrets: <https://grafana.com/docs/grafana/latest/administration/provisioning/> and <https://grafana.com/docs/grafana/latest/setup-grafana/configure-docker/>
- Docker Compose services, secrets and ports: <https://docs.docker.com/reference/compose-file/services/>, <https://docs.docker.com/reference/compose-file/secrets/>, and <https://docs.docker.com/compose/how-tos/networking/>
