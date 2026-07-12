# Self-hosted Qdrant operator runbook

This runbook covers the private Qdrant 1.18.2 retrieval, reindex, recovery,
observability, and rollback path. It does not
authorize a deployment, live reindex, secret change, notification to a real
receiver, or any staging/production mutation. Those actions remain behind the
Q12 approval gate.

## Immutable runtime

The Qdrant server image is pinned in `deploy/qdrant/image-lock.json`; monitoring
images are pinned separately in `ops/qdrant/image-lock.json`:

- Qdrant 1.18.2;
- Prometheus 3.13.1 LTS;
- Grafana 12.4.5 extended support;
- node_exporter 1.12.0;
- Alertmanager 0.33.1.

Compose uses each tag plus its approved multi-platform index digest and
`linux/amd64`. The lock also records the approved platform child digest. Do not
replace a pin with `latest` or a tag-only reference.

The application uses exact `@qdrant/js-client-rest` 1.18.0. The stable alias
`course_embeddings` points to a versioned physical collection such as
`course_embeddings_v1`. Alias actions are atomic; applications never target a
physical name directly. Source documents and `file_catalog` are authoritative,
while Qdrant is a rebuildable derived index.

## Retrieval and strict-schema contract

The named `dense` vector is Jina v3 768D Cosine. The named `sparse` vector has
`modifier: idf`; ingest and query both send a Qdrant `Document` with
`model=qdrant/bm25`, `language=none`, `tokenizer=multilingual`, `lowercase=true`,
`k=1.2`, `b=0.75`, and `avg_len=256`. There is no custom/process-local BM25.

Qdrant executes dense and sparse prefetch, server RRF, then a nested Formula
Query over `$score` and `document_weight`. The application does not fuse or
boost scores client-side. Strict mode requires indexes for tenant
`organization_id`; `course_id`, `document_id`, `chunk_id`, `level`, `chapter`,
`section`; all four `has_*` flags; and float `document_weight`.

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

The shared textfile directory has one supported production path and a dedicated
supplementary group. Run this preflight before Compose activation. It creates
the group/directory when safe and exits nonzero for a missing, nonnumeric, or
conflicting GID, or a wrong path, owner, or mode:

```bash
: "${QDRANT_METRICS_GID:?QDRANT_METRICS_GID must be set}"
: "${QDRANT_METRICS_TEXTFILE_HOST_DIR:?QDRANT_METRICS_TEXTFILE_HOST_DIR must be set}"

[[ $QDRANT_METRICS_GID =~ ^[0-9]+$ ]] || {
  echo "QDRANT_METRICS_GID must be numeric" >&2
  exit 1
}
[[ $QDRANT_METRICS_TEXTFILE_HOST_DIR == /var/lib/megacampus/qdrant-metrics ]] || {
  echo "unsupported Qdrant metrics directory" >&2
  exit 1
}
if ! getent group megacampus-metrics >/dev/null; then
  sudo groupadd --system --gid "$QDRANT_METRICS_GID" megacampus-metrics
fi
[[ $(getent group megacampus-metrics | cut -d: -f3) == "$QDRANT_METRICS_GID" ]] || {
  echo "megacampus-metrics GID conflicts with QDRANT_METRICS_GID" >&2
  exit 1
}

sudo install -d -o megacampus -g megacampus-metrics -m 2775 \
  "$QDRANT_METRICS_TEXTFILE_HOST_DIR"
[[ $(stat -c '%U:%G' "$QDRANT_METRICS_TEXTFILE_HOST_DIR") == \
  megacampus:megacampus-metrics ]]
[[ $(stat -c '%a' "$QDRANT_METRICS_TEXTFILE_HOST_DIR") == 2775 ]]
```

Do not start Compose unless the entire block exits zero. Compose runs only API,
main worker, and Stage 6 as UID/GID `1001:1001` with
`QDRANT_METRICS_GID` as a supplementary group. Stage 7 receives neither the
group nor the mount. node_exporter stays UID `65534`, mounts the exact same host
path read-only, and relies only on directory traversal plus final file mode
`0644`; it never runs as root or joins the writer group. Application containers
write one persistent file per service and instance by atomic rename. Snapshot
and restore jobs publish their gauges the same way. Only `*.prom` final files
belong there; samples must not carry explicit timestamps, and writers must use a
same-directory temporary file plus atomic `mv`. Temporary files must never be
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

- `qdrant:6333/metrics?per_collection=true`, with the `api-key` loaded through
  `http_headers.api-key.files`;
- `node_exporter:9100`, reachable only on the private bridge;
- `alertmanager:9093`, reachable only on the private bridge.

Qdrant `service.metrics_port` must remain absent. An unauthenticated or invalid
key request to the main `/metrics` listener must fail, while the read-only key
must read metrics and collections but cannot mutate a collection.

The provisioned Grafana dashboard must show target/alert state, recovery mode,
Qdrant app/version info, points and vectors, request/error/p95, memory,
optimizations, snapshot/recovery age and activity, and hybrid fallback rate.
Anonymous access, sign-up, UI edits of provisioned assets, and public dashboards
remain disabled. Provisioned dashboards are filesystem-owned and are not
persisted back from the Grafana UI. Alertmanager reads both Telegram fields from
files and uses `send_resolved: true`.

## Client-based bootstrap, verify, and reindex

These five commands use the application client, which requires a host-reachable
loopback URL and the raw `QDRANT_API_KEY`. Run them only in an authorized
environment. The helper reads the untracked owner-only key without printing it;
each command runs in a short-lived subshell and removes the raw values on exit:

```bash
qdrant_admin() (
  set -eu
  key_file=${QDRANT_API_KEY_FILE:-./secrets/qdrant_api_key}
  test -r "$key_file"
  QDRANT_API_KEY=''
  IFS= read -r QDRANT_API_KEY <"$key_file" || test -n "$QDRANT_API_KEY"
  test -n "$QDRANT_API_KEY"
  export QDRANT_URL=http://127.0.0.1:6335 QDRANT_API_KEY
  trap 'unset QDRANT_API_KEY QDRANT_URL' EXIT
  "$@"
)

qdrant_admin pnpm --dir packages/course-gen-platform qdrant:bootstrap
qdrant_admin pnpm --dir packages/course-gen-platform qdrant:verify
qdrant_admin pnpm --dir packages/course-gen-platform qdrant:reindex:plan
# Execute only after accepting the plan output and cutover/rollback conditions.
qdrant_admin pnpm --dir packages/course-gen-platform qdrant:reindex:execute
qdrant_admin pnpm --dir packages/course-gen-platform qdrant:reindex:verify
unset -f qdrant_admin
```

`http://qdrant:6333` and `http://qdrant-dev:6333` are Docker-network names and
must not be used by these host commands. This operator runbook uses staging's
loopback mapping `127.0.0.1:6335`; local development uses the separate
`127.0.0.1:6333` procedure in `packages/course-gen-platform/docs/qdrant-setup.md`.

## Snapshot and restore command contracts

Recovery tools do **not** use raw `QDRANT_API_KEY`. `qdrant:snapshot` reads an
owner-only file from `QDRANT_API_KEY_FILE` and requires `QDRANT_URL` plus a
precreated writable mode-2775 `QDRANT_METRICS_TEXTFILE_DIR`. Its accepted unit
uses `QDRANT_URL=http://127.0.0.1:6335` and
`QDRANT_API_KEY_FILE=%d/qdrant_api_key`, then sets `QDRANT_COLLECTION_NAME`,
`QDRANT_SNAPSHOT_STORAGE_MODE=s3`,
`QDRANT_SNAPSHOT_OBJECT_PREFIX`, `QDRANT_RECOVERY_STATE_DIR`,
`QDRANT_RECOVERY_LOCK_PATH`, and `QDRANT_RECOVERY_LOCK_HELD=1`; the last value
is valid because the unit's outer `/usr/bin/flock` already owns the shared lock.

`qdrant:restore-drill` requires the same file-backed API key, Qdrant URL,
metrics directory, state directory, collection name, and shared-lock contract.
It additionally requires owner-only `QDRANT_SNAPSHOT_MANIFEST_FILE` and
`QDRANT_RECOVERY_PROBE_FILE`, plus `QDRANT_SNAPSHOT_TRANSPORT_URL`. The accepted
unit maps those files to `%d/snapshot_manifest` and `%d/recovery_probe`, uses
`QDRANT_URL=http://127.0.0.1:6335` for the host client, and sets
`QDRANT_SNAPSHOT_TRANSPORT_URL=http://127.0.0.1:6333` for Qdrant's authenticated
snapshot fetch. Do not substitute the raw-key client helper for either recovery
tool, and do not set `QDRANT_RECOVERY_LOCK_HELD=1` for an unwrapped direct run.

After an authorized installation, prefer the accepted systemd services because
`LoadCredential`, explicit environment entries, directory hardening, timeouts,
and the shared nonblocking lock are already encoded:

```bash
sudo systemctl start megacampus-qdrant-snapshot.service
sudo systemctl status --no-pager megacampus-qdrant-snapshot.service
sudo journalctl --no-pager -u megacampus-qdrant-snapshot.service -n 200

sudo systemctl start megacampus-qdrant-restore-drill.service
sudo systemctl status --no-pager megacampus-qdrant-restore-drill.service
sudo journalctl --no-pager -u megacampus-qdrant-restore-drill.service -n 200
```

The commands above are an operator procedure, not activation authorization.
Installing units, creating credentials, starting either service, or exercising
staging/production recovery still requires Q12 approval.

The recovery implementation owns the checksum manifest, retention, systemd
timers, isolated collection, and alias cleanup. Reindex uses deterministic,
bounded, resumable batches from `file_catalog` and authoritative source files;
verify targeted tenant/course counts, RU/EN retrieval, strict filters, and point
identity before an atomic alias cutover.

Qdrant snapshots do not contain aliases. Restore a Qdrant 1.18.2 snapshot only
on Qdrant 1.18.2 into an isolated collection with `priority=snapshot`, validate
the manifest checksum and recovery probe, and recreate/switch the alias as a
separate action. Never restore over the active alias. A failed drill leaves the
stable alias untouched and keeps evidence for triage.

## systemd installation and verification

The units in `deploy/systemd/` require systemd **247 or newer** because they use
`LoadCredential`; the reference manuals consulted for hardening are systemd 257. Before an authorized install, verify `systemd --version`, confirm pnpm is
available at `/usr/bin/pnpm`, provision the `megacampus` user and exact
state/runtime/metrics paths, and place credentials/probe/manifest files at the
unit-declared paths. Do not edit the units to embed secret values.

After copying reviewed units in an authorized environment:

```bash
sudo systemd-analyze verify \
  deploy/systemd/megacampus-qdrant-snapshot.service \
  deploy/systemd/megacampus-qdrant-snapshot.timer \
  deploy/systemd/megacampus-qdrant-restore-drill.service \
  deploy/systemd/megacampus-qdrant-restore-drill.timer
sudo systemctl daemon-reload
sudo systemctl enable --now megacampus-qdrant-snapshot.timer
sudo systemctl enable --now megacampus-qdrant-restore-drill.timer
systemctl list-timers 'megacampus-qdrant-*'
```

The snapshot timer runs every four hours with jitter; the restore drill is
monthly. `Persistent=true` catches up after short downtime but does not protect
against a host outage, so stale alerts remain mandatory. Snapshot and restore
share a nonblocking `flock`; a collision must fail visibly, not overlap.

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

For application/index rollback, stop new writes, point the alias atomically back
to the last verified physical collection, run targeted tenant/course retrieval
checks, and only then resume workers. Preserve the failed collection, manifests,
logs, and metrics for diagnosis. Do not delete the last verified collection or
known-good snapshot during the rollback window. If compatibility is uncertain,
keep traffic stopped and restore an exact-version snapshot into a new isolated
collection; never overwrite the active collection.

Development document evidence is already active for 100% of eligible courses.
That local/dev decision does not authorize staging/production deploy, service or
secret activation, live reindex, alias cutover, or any remote mutation; all of
those remain Q12-gated.

## First-party references checked for this configuration

Accessed 2026-07-12:

- Qdrant 1.18.2 release, native text search, hybrid queries, indexing, administration, aliases, snapshots, security, and metrics: <https://github.com/qdrant/qdrant/releases/tag/v1.18.2>, <https://qdrant.tech/documentation/search/text-search/full-text-search/>, <https://qdrant.tech/documentation/search/hybrid-queries/>, <https://qdrant.tech/documentation/manage-data/indexing/>, <https://qdrant.tech/documentation/operations/administration/>, <https://qdrant.tech/documentation/manage-data/collections/>, <https://qdrant.tech/documentation/operations/snapshots/>, <https://qdrant.tech/documentation/security/>, and <https://qdrant.tech/documentation/ops-monitoring/monitoring/>
- Prometheus 3.13.1 configuration: <https://github.com/prometheus/prometheus/blob/v3.13.1/docs/configuration/configuration.md>
- Prometheus release/LTS policy: <https://github.com/prometheus/prometheus/releases/tag/v3.13.1> and <https://prometheus.io/docs/introduction/release-cycle/>
- Alertmanager 0.33.1 configuration: <https://github.com/prometheus/alertmanager/blob/v0.33.1/docs/configuration.md>
- node_exporter 1.12.0 textfile collector: <https://github.com/prometheus/node_exporter/blob/v1.12.0/README.md#textfile-collector>
- Grafana provisioning and Docker secrets: <https://grafana.com/docs/grafana/latest/administration/provisioning/> and <https://grafana.com/docs/grafana/latest/setup-grafana/configure-docker/>
- Grafana 12.4.5 and support policy: <https://github.com/grafana/grafana/releases/tag/v12.4.5> and <https://grafana.com/docs/grafana/latest/upgrade-guide/when-to-upgrade/>
- systemd 257 execution, service, and timer manuals (runtime minimum 247 for `LoadCredential`): <https://www.freedesktop.org/software/systemd/man/257/systemd.exec.html>, <https://www.freedesktop.org/software/systemd/man/257/systemd.service.html>, and <https://www.freedesktop.org/software/systemd/man/257/systemd.timer.html>
- Docker Compose services, secrets and ports: <https://docs.docker.com/reference/compose-file/services/>, <https://docs.docker.com/reference/compose-file/secrets/>, and <https://docs.docker.com/compose/how-tos/networking/>
