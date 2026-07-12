# Self-hosted Qdrant operator runbook

This runbook covers the private Qdrant 1.18.2 retrieval, reindex, recovery,
observability, and rollback path. The owner explicitly authorized the Q12
staging activation on 2026-07-12, including live reindex, recovery drill, real
notification, and document evidence at `true/active/100`. The owner subsequently
approved local-disk snapshots for development staging on 2026-07-12 and deferred
off-host S3 to the production gate `mc2-jz6y0.13.6`. This runbook is not a second
authorization source. The downloaded Supabase Root 2021 CA is validated for
`verify-full`; activation remains **NO-GO** until a current Session pooler URL
passes with that CA and the authoritative source truth listed under “Initial
activation” is resolved. No remote mutation has occurred yet.

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

Tracked files contain paths and sanitized identifiers only. Compose file
secrets preserve host ownership; they do not remap it for a container. Provision
each input atomically at the exact path and identity below. Never print values,
checksums, file IDs, source content, or provenance hashes into a command log,
artifact, Beads note, or shell history.

| Host path                                                            | Consumer                                         | Required owner | Mode   |
| -------------------------------------------------------------------- | ------------------------------------------------ | -------------- | ------ |
| `/opt/megacampus/secrets/qdrant_api_key`                             | Qdrant and root operator wrapper                 | `root:root`    | `0400` |
| `/opt/megacampus/secrets/qdrant_read_only_api_key`                   | Qdrant server                                    | `root:root`    | `0400` |
| `/opt/megacampus/secrets/prometheus_qdrant_read_only_api_key`        | Prometheus                                       | `65534:65534`  | `0400` |
| `/opt/megacampus/secrets/grafana_admin_password`                     | Grafana                                          | `472:472`      | `0400` |
| `/opt/megacampus/secrets/alertmanager_telegram_bot_token`            | Alertmanager                                     | `65534:65534`  | `0400` |
| `/opt/megacampus/secrets/alertmanager_telegram_chat_id`              | Alertmanager                                     | `65534:65534`  | `0400` |
| `/opt/megacampus/recovery/probe.json`                                | restore drill via `LoadCredential`               | `root:root`    | `0400` |
| `/var/lib/megacampus-qdrant-recovery/manifests/latest-manifest.json` | restore drill input produced by snapshot service | `1001:1001`    | `0600` |

The Prometheus file is an independent copy of the read-only value. Never broaden
the root-owned Qdrant copy to make it readable by another container. The
operator wrapper accepts its mounted API key, manifest, and probe only after
systemd stages them as exact `root:root 0400` inputs in private per-unit runtime
directories.

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
if getent group "$QDRANT_METRICS_GID" >/dev/null &&
   [[ $(getent group "$QDRANT_METRICS_GID" | cut -d: -f1) != megacampus-metrics ]]; then
  echo "candidate metrics GID is already assigned" >&2
  exit 1
fi
if ! getent group megacampus-metrics >/dev/null; then
  sudo groupadd --system --gid "$QDRANT_METRICS_GID" megacampus-metrics
fi
[[ $(getent group megacampus-metrics | cut -d: -f3) == "$QDRANT_METRICS_GID" ]] || {
  echo "megacampus-metrics GID conflicts with QDRANT_METRICS_GID" >&2
  exit 1
}

if ! getent passwd megacampus >/dev/null; then
  getent passwd 1001 >/dev/null && {
    echo "UID 1001 is already assigned to another host identity" >&2
    exit 1
  }
  sudo useradd --system --uid 1001 --gid megacampus-metrics \
    --home-dir /nonexistent --shell /usr/sbin/nologin megacampus
fi
[[ $(getent passwd 1001 | cut -d: -f1) == megacampus ]] || {
  echo "UID 1001 must resolve to the reviewed megacampus runtime identity" >&2
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

The previously documented example GID conflicts on the target. `900` is only a
candidate: immediately before mutation, require both `getent group 900` and
`getent passwd 900` to show it is unused, then set
`QDRANT_METRICS_GID=900`. Any new conflict is a hard stop; do not choose another
identity silently.

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

## Immutable operator bootstrap, verify, and reindex

Production and staging never require repository source, host Node, host pnpm, or
a raw-key shell helper. CI builds the `qdrant-operator` Docker target for every
deploy-relevant release commit. `scripts/deploy_blue_green.sh` pulls the exact
40-character release tag, resolves its registry digest, writes only the 64-hex
`QDRANT_OPERATOR_IMAGE_SHA256` identifier to `.env.production`, and pre-pulls
the resulting fixed GHCR `repo@sha256:<digest>` reference. `latest`, a tag-only
reference, a missing digest, and `--force` are not bootstrap shortcuts.

Before any operator command, validate the release/digest contract without
printing environment or secret values:

```bash
cd /opt/megacampus
release_sha='<40-lowercase-hex-release-commit>'
[[ $release_sha =~ ^[0-9a-f]{40}$ ]]

operator_repo='ghcr.io/maslennikov-ig/mc-2/qdrant-operator'
docker pull "$operator_repo:$release_sha" >/dev/null
operator_ref="$(docker image inspect \
  --format '{{range .RepoDigests}}{{println .}}{{end}}' \
  "$operator_repo:$release_sha" |
  awk -v prefix="$operator_repo@sha256:" 'index($0, prefix) == 1 { print; exit }')"
operator_digest="${operator_ref#"$operator_repo@sha256:"}"
[[ $operator_ref == "$operator_repo@sha256:"* ]]
[[ $operator_digest =~ ^[0-9a-f]{64}$ ]]

tmp="$(mktemp .env.production.XXXXXX)"
awk 'index($0, "QDRANT_OPERATOR_IMAGE_SHA256=") != 1' .env.production >"$tmp"
printf 'QDRANT_OPERATOR_IMAGE_SHA256=%s\n' "$operator_digest" >>"$tmp"
chmod --reference=.env.production "$tmp"
mv "$tmp" .env.production
unset operator_digest operator_ref
```

The supported production prefix is:

```bash
OPERATOR=(
  /opt/megacampus/deploy/qdrant/operator-compose.sh
  --project-directory /opt/megacampus
  -f /opt/megacampus/docker-compose.infra.yml
  --env-file /opt/megacampus/.env.production
  --profile operator run --rm --no-deps -T
)

"${OPERATOR[@]}" qdrant-operator self-check
"${OPERATOR[@]}" qdrant-recovery-operator metrics-check
```

The wrapper rejects any non-64-hex digest before Docker runs. The operator
container is read-only, reads exact `root:root 0400` file secrets as a minimal
root wrapper, and drops every tool to UID/GID `1001:1001`.

### Deterministic first rebuild

Generate one UUIDv4 and reuse it for the isolated queue, execute run, ledger,
and worker target. The physical target must never equal the stable alias.

```bash
physical_collection=course_embeddings_v1
run_id="$(uuidgen | tr 'A-F' 'a-f')"
[[ $run_id =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]]
queue_name="qdrant-reindex-$run_id"
worker_name="megacampus-qdrant-reindex-$run_id"

"${OPERATOR[@]}" qdrant-operator bootstrap \
  --physical "$physical_collection" --alias course_embeddings
"${OPERATOR[@]}" qdrant-operator verify \
  --physical "$physical_collection" --alias course_embeddings
"${OPERATOR[@]}" qdrant-operator reindex plan

# Continue only when the plan has zero source gaps. Never pass --allow-gaps.
"${OPERATOR[@]}" -d --name "$worker_name" \
  -e BULLMQ_QUEUE_NAME="$queue_name" \
  -e QDRANT_REINDEX_TARGET_COLLECTION="$physical_collection" \
  qdrant-operator reindex-worker
trap 'docker rm -f "$worker_name" >/dev/null 2>&1 || true' EXIT

"${OPERATOR[@]}" \
  -e BULLMQ_QUEUE_NAME="$queue_name" \
  qdrant-operator reindex execute \
  --target-collection "$physical_collection" \
  --run-id "$run_id"

docker stop --time 30 "$worker_name"
"${OPERATOR[@]}" qdrant-operator reindex verify \
  --target-collection "$physical_collection"
trap - EXIT
```

The execute ledger is forced to
`/var/lib/megacampus-qdrant-recovery/reindex/<run-id>.json`; a different path is
rejected. Before alias cutover, inspect the dedicated queue in the private Bull
Board, require zero active/waiting jobs, preserve failed-job and ledger evidence,
and verify gap-free source parity, strict schema, exact point identities, RU and
EN BM25/RRF/Formula relevance, and negative organization/course isolation. Do
not flush Redis or touch the live course-generation queue to clean up a reindex.

### Audited source recovery before reindex

The source-recovery implementation and disposable exact-count acceptance are
locally complete. The acceptance harness passed 3/3 focused and 456/456 joined
recovery/reindex tests, including a publish-before-checkpoint restart, concrete
Stage 4 adapter binding, tenant CAS, guarded rollback, and pre-teardown residue
checks. This does not mean that staging files have already been copied.

For the authorized activation window, prepare the reviewed owner-only plan input
and empty UID/GID `1001:1001` mode-0700 state, progress, and capability
directories. The capability directory must be a sibling of both upload roots on
their filesystem, never inside either root. The plan input is mode 0600. Run the
single host wrapper; it holds the flock, requires explicit writer stopping,
restores exact prior service state, and sequences plan, networkless execute, copy
verification, disposition apply, and disposition verification:

```bash
sudo /opt/megacampus/deploy/qdrant/source-recovery-run.sh \
  --stop-writers \
  --operation forward \
  --run-id "$recovery_run_id" \
  --project-directory /opt/megacampus \
  --env-file /opt/megacampus/.env.production \
  --plan-input /var/lib/megacampus-source-recovery/plan-input.json \
  --manifest /var/lib/megacampus-source-recovery/state/manifest.json \
  --progress-directory /var/lib/megacampus-source-recovery/state/progress \
  --development-root /opt/megacampus/data/uploads-dev \
  --production-root /opt/megacampus/data/uploads \
  --capability-directory /opt/megacampus/data/source-recovery-capability
```

After an interruption, reuse the same run ID and immutable manifest/journal,
omit the fresh-only plan/capability arguments, and select the earliest durable
continuation with `--resume-from execute|verify|apply-dispositions|verify-dispositions`.
The wrapper never replans a resume and always reruns copy verification before a
disposition step. Before reindex, require exact post-truth
`240 = 234 recoverable + 6 audited failed`, all 24 dispositions verified, zero
unresolved eligible gaps, and no owned temporary residue. If rollback is
required before reindex, use `--operation rollback`; it removes only unchanged
manifest-created targets and refuses a replaced inode.

Host `pnpm` and loopback commands remain supported only for the checked-out
local-development procedure in
`packages/course-gen-platform/docs/qdrant-setup.md`.

## Q12 initial activation is not `/deploy`

The ordinary blue/green deploy intentionally runs verify-only before starting
the inactive app color. It cannot bootstrap an empty first installation. The
owner authorization does not waive these current hard stops:

1. the downloaded Supabase Root 2021 CA is valid, but the locally and
   server-stored Session pooler credentials are stale. A current URL must pass
   the required `sslmode=verify-full` and `sslrootcert` remote migration
   preflight;
2. the accepted read-only source audit found 261 catalog rows: 240 are
   Qdrant-eligible and 21 are `missing_course`. Forty-two exact no-replace
   copies can raise recoverable eligible sources from 109 to 234; exact
   originals for the remaining four missing and two invalid eligible rows were
   not found. Eighteen non-eligible Career Playbook originals are also absent;
3. source-recovery implementation `.13.4.1` and its independent local acceptance
   are complete; the authorized window must still execute the 42 crash-durable
   copies and all 24 audited dispositions before reindex. `--allow-gaps` and
   derived-content substitution are forbidden.

After these gates are resolved, execute this order as one observed activation
window:

1. confirm backup/PITR and apply/verify the complete document-evidence
   `120 -> 130 -> 140 -> 150 -> 151` migration chain using the project CA;
2. copy the reviewed Compose, `deploy/qdrant`, `deploy/systemd`, and
   `ops/qdrant` assets; provision exact secret metadata, UID 1001, free metrics
   GID, recovery state, metrics, upload, and probe paths;
3. publish the release-SHA `qdrant-operator`, resolve and persist only its
   registry digest, and pre-pull every exact image;
4. start only `qdrant`, `prometheus`, `node_exporter`, `alertmanager`, and
   `grafana` from `docker-compose.infra.yml`; keep app traffic and RAG workers on
   the previous environment;
5. run operator `self-check` and `metrics-check`, then bootstrap the physical
   collection before any deploy verify gate;
6. run the gap-free deterministic plan/worker/execute/verify procedure above;
7. prove a checksum-verified local-volume snapshot and isolated restore, both
   firing and resolved notification, private listeners, and rollback evidence;
8. only then invoke the normal release-bound blue/green deploy and observe the
   accepted app/worker environment for at least 60 minutes plus one complete
   normal course cycle.

`/deploy`, `/deploy --force`, mutable tags, the retired Cloud endpoint, and an
alias switch without the preceding evidence are not activation alternatives.

## Snapshot and restore command contracts

Development staging uses Qdrant `snapshots_storage=local` and explicitly sets
`storage.snapshots_path=/qdrant/storage/snapshots`. Snapshot files therefore
stay below `/qdrant/storage` on the persistent `qdrant-data` Docker volume and
survive a Qdrant container replacement as long as that named volume is
preserved. This exact path corrects review finding Q12-LR1 from the immutable
review of commit `ac494372`; the pinned-image default `/qdrant/snapshots` is in
the disposable container layer and must never be used for staging recovery.

The manifest records `storage_mode: local` and intentionally contains no remote
object or URI. No S3 credential is required, mounted, read, or copied in this
mode. This protects against collection/operator mistakes and proves recoverable
Qdrant 1.18.2 snapshots, but it does **not** protect against deletion of the
named volume or loss of the host, disk, volume, or datacenter and therefore does
not satisfy off-host RPO/DR. Before a production launch, complete
`mc2-jz6y0.13.6`, provision the reviewed HTTPS S3-compatible backend and
lifecycle, switch both Qdrant and the recovery operator explicitly to `s3`, and
repeat the checksum/restore/alert evidence.

`QDRANT_SNAPSHOT_STORAGE_MODE` is mandatory and accepts only `local` or `s3`.
The local staging environment sets it to `local`; the S3 path additionally
requires a sanitized object prefix plus the existing mode-0400 credentials and
bucket/region configuration. An absent or unknown mode and an incomplete S3
configuration fail before a successful manifest can be emitted.

Recovery tools never use a raw-key host environment. Both run inside the pinned
operator with Docker-local `QDRANT_URL=http://qdrant:6333`, the exact file-backed
API key, precreated recovery state, and the mode-2775 shared metrics directory.
Restore additionally mounts the latest manifest and deterministic recovery
probe as file secrets. A direct Compose oneshot keeps
`QDRANT_RECOVERY_LOCK_HELD=0` and acquires the internal lock in shared recovery
state:

```bash
"${OPERATOR[@]}" qdrant-recovery-operator snapshot
"${OPERATOR[@]}" qdrant-restore-operator restore-drill
```

Only the reviewed systemd units may override
`QDRANT_RECOVERY_LOCK_HELD=1`: each already owns the outer host
`/usr/bin/flock`. The units use `LoadCredential`, copy inputs into distinct
root-only runtime directories visible to Docker, call the digest-checking
operator wrapper, test metrics writability as UID 1001 with the configured
supplementary GID, and let systemd clean the staged credentials. Do not pass
`QDRANT_RECOVERY_LOCK_HELD=1` to an unwrapped direct run.

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

The commands above are an operator procedure under the recorded authorization;
they still remain NO-GO until the current verify-full database URL, source
recovery/disposition, and all initial activation preconditions are satisfied.

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
`LoadCredential`; the reference manuals consulted for hardening are systemd 257. Host Node, pnpm, and repository source are not runtime prerequisites.
Before installation, verify systemd and Docker Compose, complete the exact
identity/directory preflight, place the reviewed credential/probe files, and
confirm `.env.production` contains a valid operator digest identifier without
printing the file.

Install the reviewed wrapper and units without editing their commands:

```bash
systemd --version
docker compose version

sudo install -d -o root -g root -m 0755 /opt/megacampus/deploy/qdrant
sudo install -o root -g root -m 0555 \
  deploy/qdrant/operator-compose.sh \
  /opt/megacampus/deploy/qdrant/operator-compose.sh
sudo install -o root -g root -m 0644 \
  deploy/systemd/megacampus-qdrant-snapshot.service \
  deploy/systemd/megacampus-qdrant-snapshot.timer \
  deploy/systemd/megacampus-qdrant-restore-drill.service \
  deploy/systemd/megacampus-qdrant-restore-drill.timer \
  /etc/systemd/system/

sudo systemd-analyze verify \
  /etc/systemd/system/megacampus-qdrant-snapshot.service \
  /etc/systemd/system/megacampus-qdrant-snapshot.timer \
  /etc/systemd/system/megacampus-qdrant-restore-drill.service \
  /etc/systemd/system/megacampus-qdrant-restore-drill.timer
sudo systemctl daemon-reload

# Manual-first proof. Do not enable timers until both oneshots and cleanup pass.
sudo systemctl start megacampus-qdrant-snapshot.service
sudo systemctl status --no-pager megacampus-qdrant-snapshot.service
sudo journalctl --no-pager -u megacampus-qdrant-snapshot.service -n 200

sudo systemctl start megacampus-qdrant-restore-drill.service
sudo systemctl status --no-pager megacampus-qdrant-restore-drill.service
sudo journalctl --no-pager -u megacampus-qdrant-restore-drill.service -n 200

sudo systemctl enable --now megacampus-qdrant-snapshot.timer
sudo systemctl enable --now megacampus-qdrant-restore-drill.timer
systemctl list-timers 'megacampus-qdrant-*'
```

Require both service exit statuses to be zero, no credential files left in the
per-unit runtime directories, exact manifest/evidence ownership, no residual
drill collection/alias, and fresh textfile metrics before timer enablement.
Do not enable either timer until both manual oneshots and all cleanup
postconditions have passed in the installed staging environment.
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
- `QdrantSnapshotStale`: in staging, check the last durable manifest and local
  Qdrant volume snapshot; do not claim off-host protection or delete the last
  known-good snapshot. In production, also require the off-host object.
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

The owner has superseded gradual staging promotion and authorized document
evidence at exactly `enabled=true`, `mode=active`, Stage 5 cohort `100` for every
eligible staging course. Rollback remains three distinct operations: the
release-bound immutable app/color rollback recreates API, web, main worker and
Stage 6 from one prior environment; evidence containment quiesces queues before
setting cohort `0` or disabling the shared active gate; index rollback atomically
returns the alias to an already verified physical collection. Preserve evidence
rows, failed collections, manifests, and snapshots in every case. Do not use a
database down-migration or restore-over-active as incident rollback.

Prometheus `3.13.1` still accepts the current retention CLI flags but deprecates
them. This is the bounded nonblocking follow-up `mc2-jz6y0.25`: migrate the
accepted 30-day/20-GB policy to supported YAML before the next Prometheus pin
change. It is not permission to change retention during Q12 activation.

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
