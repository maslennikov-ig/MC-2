---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0
stage_id: mc2-jz6y0
agent_type: docs_researcher
subagent_model: inherit_orchestrator
reasoning_effort: role_default
model_reasoning_rationale: Version-sensitive platform, security, observability, backup, and service-manager contracts require exact first-party evidence.
repo: mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: 01f2c09049e3e87f503af29035df07d4825fe01b
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/authoritative-docs.md
success_criteria:
  - Re-check the approved self-hosted Qdrant plan against current first-party documentation.
  - Record exact supported request and configuration shapes, version risks, contradictions, and integration proofs for Q6, Q8, and Q9.
selected_docs:
  - Official Qdrant documentation, v1.18.2 release, v1.18.2 OpenAPI, v1.18.2 source, and official JS client release metadata.
  - Official Prometheus v3.11.3 release and documentation.
  - Official Grafana v12.4.0 release and documentation.
  - Official systemd source documentation and Docker Compose reference.
  - Official Node.js v24 filesystem documentation for hard links, fsync, O_EXCL, and O_NOFOLLOW.
selected_skills:
  - task-router
  - senior-devops
selected_agents:
  - docs_researcher persona for authoritative version-sensitive documentation research
catalog_candidates:
  - none because installed routing, DevOps, and docs-researcher assets cover the bounded research stream
parallel_group: D
depends_on_streams:
  - none
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Read-only research stream reviewed and accepted by the orchestrator; no branch, service, container, or source mutation was performed.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: This artifact identifies required corrections; implementation and durable operator documentation remain owned by the parent stage.
graph_reviewed: used
graph_review_notes: Read /home/me/code/mc2/graphify-out/GRAPH_REPORT.md and ran a focused query for Qdrant course embeddings/upload/search; no graph mutation was needed for this research-only stream.
verification:
  - Official-source audit completed for every requested platform area.
  - Docker manifest lookup passed for qdrant/qdrant:v1.18.2, prom/prometheus:v3.11.3, and grafana/grafana:12.4.0.
  - systemd-analyze calendar accepted and normalized *-*-* 00/6:15:00.
  - Artifact validator passed after authoring.
  - Orchestrator reviewed the complete artifact and independently confirmed BM25/IDF, Formula/grouping, tenant-index, and metrics/health claims against official Qdrant documentation and pinned client types.
  - Node.js v24.1 first-party filesystem contract rechecked against local Node v24.16.0 and repository engine >=20.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/authoritative-docs.md
explicit_defers:
  - Parent stage must choose final Prometheus and Grafana versions and prove the listed runtime integration shapes before implementation closes.
---

# Summary

Result: **RETURNED / PASSED / CLEAN**. The core Qdrant architecture is feasible on Qdrant 1.18.2, but the approved plan has implementation-critical gaps. Native BM25/IDF, nested RRF then Formula queries, grouping, tenant indexes, strict mode, atomic aliases, S3-compatible snapshot storage, metrics, API keys, and the Web UI are all confirmed by first-party sources. The exact image tags also exist.

The plan must be corrected before implementation in these areas:

1. Qdrant Formula Query has no arbitrary `clamp` expression; `document_weight` must be validated and normalized at ingestion, then used in a supported arithmetic expression.
2. Qdrant's S3 snapshot backend is supported, but a direct `s3://...` recovery request is not documented. The recovery transport and API-key handling require an integration proof.
3. Collection snapshots do not contain aliases; recovery must recreate or verify the alias separately.
4. Prometheus does not consume mounted textfile metrics. Backup-age and restore-drill metrics require node_exporter with its textfile collector, an HTTP exporter, or another explicit ingestion path.
5. Prometheus rule files alone do not deliver notifications. Grafana alert rule, contact point, and notification-policy provisioning, or an explicit Alertmanager service, is missing.
6. Qdrant metrics do not expose container memory limits or application hybrid-fallback rates. Q9 needs an explicit source for both signals.
7. Prometheus 3.11.3 and Grafana 12.4.0 exist, but both are superseded as of 2026-07-10. Grafana 12.4.0 is especially unsuitable as an unexamined security pin because patched 12.4 releases exist.
8. The systemd timer syntax is valid, but `Persistent=true`, `RandomizedDelaySec=10min`, and the default `AccuracySec=1min` mean the effective worst-case cadence is about 6 h 11 min, not a strict six-hour RPO.

No third-party documentation was used. Where this artifact makes a recommendation rather than restating a documented guarantee, it is marked as an inference.

## Node.js filesystem recovery primitives

The accepted source-recovery core runs under local Node `v24.16.0`; the
repository supports Node `>=20`. The official
[Node.js v24.1 filesystem documentation](https://nodejs.org/download/release/v24.1.0/docs/api/fs.html)
confirms the stable primitives used by the implementation:

- `fsPromises.link(existingPath, newPath)` creates a new hard link and has been
  available since Node v10. The recovery design relies on the underlying POSIX
  `link(2)` no-replace behavior for an already existing destination; the exact
  `EEXIST` behavior is also proved by local tests rather than inferred only from
  the JavaScript API summary.
- `FileHandle.sync()` requests that all data for the open descriptor be flushed
  to storage; the docs explicitly note that final behavior remains OS/device
  specific. Therefore same-filesystem support and the full crash-order drill
  remain runtime acceptance gates.
- `O_EXCL` with `O_CREAT` fails if the temporary already exists, while
  `O_NOFOLLOW` fails when the final opened path is a symbolic link. These flags
  are POSIX-specific on the Linux operator target and are not claimed portable
  to Windows.

The official docs also warn that promise-based filesystem operations are not
implicitly synchronized or thread-safe. The host-level `flock`, stopped upload
writers, owner-only directories, deterministic journal transitions, and
single-run operator are therefore required correctness controls, not optional
hardening.

## Routing and repository context

- Asset routing: `task-router` selected the installed `senior-devops` skill and the `docs_researcher` persona. Catalog candidates: none; no missing capability justified catalog lookup or promotion.
- Documentation route: exact tagged documentation/source first for Qdrant 1.18.2 and Prometheus 3.11.3; current official release pages for freshness checks; official Grafana, systemd, and Docker documentation for integration contracts.
- Knowledge graph: the report exists only in the primary checkout, so the root report was read and a focused `graphify query "Qdrant course embeddings upload search Stage 2 Stage 5 Stage 6"` was run against the local graph. It provided orientation but no authoritative platform fact; no broad graph dump or refresh was needed.

## Verdict matrix

| Plan assertion                  | Verdict                       | Exact qualification                                                                                                                             |
| ------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Qdrant 1.18.2 image             | Confirmed                     | `qdrant/qdrant:v1.18.2` exists; v1.18.2 was released 2026-06-04.                                                                                |
| Native BM25 plus collection IDF | Confirmed                     | Use model `qdrant/bm25` and sparse vector `modifier: "idf"`; ingestion and query text-processing options must match.                            |
| RRF followed by Formula         | Confirmed with correction     | Nested prefetch supports this ordering, but Formula has no `clamp`.                                                                             |
| Grouping by document            | Confirmed                     | Use Query Groups; its `limit` is the number of groups, not total points.                                                                        |
| Tenant payload index            | Confirmed                     | Keyword index shape is `{type:"keyword", is_tenant:true}`.                                                                                      |
| Strict mode fields              | Confirmed                     | The proposed v1.18 fields exist, including `max_resident_memory_percent`.                                                                       |
| Atomic aliases                  | Confirmed                     | Delete/create alias actions in one request are atomic; aliases are excluded from collection snapshots.                                          |
| Native S3 snapshot storage      | Confirmed with recovery gap   | Backend and environment mapping are supported; direct `s3://` recovery is not documented.                                                       |
| Metrics and health endpoints    | Confirmed with gaps           | `/metrics`, `/readyz`, `/healthz`, `/livez` exist; backup age, container limit, and app fallback rate need other sources.                       |
| API-key security and Web UI     | Confirmed with hardening gaps | Admin/read-only keys and `/dashboard` exist; plaintext same-host transport and privileged image choice require explicit threat-model decisions. |
| Prometheus 3.11.3               | Exists, superseded            | Exact image exists and its planned retention/header shapes are valid; current/LTS version choice must be revisited.                             |
| Grafana 12.4.0                  | Exists, superseded            | Exact image exists and `grafana/grafana` is the right repository; use a patched/current release unless compatibility requires otherwise.        |
| systemd timer                   | Confirmed with timing caveat  | Calendar expression is valid; jitter and accuracy widen the RPO.                                                                                |

## Qdrant 1.18.2 and JS client

- Exact server release: [Qdrant v1.18.2](https://github.com/qdrant/qdrant/releases/tag/v1.18.2).
- Exact REST contract: [v1.18.2 OpenAPI, v1.18.x](https://raw.githubusercontent.com/qdrant/qdrant/v1.18.2/docs/redoc/v1.18.x/openapi.json).
- Exact default configuration: [v1.18.2 config.yaml](https://raw.githubusercontent.com/qdrant/qdrant/v1.18.2/config/config.yaml).
- Exact image build: [v1.18.2 Dockerfile](https://raw.githubusercontent.com/qdrant/qdrant/v1.18.2/Dockerfile).
- Official JS client pin: [`@qdrant/js-client-rest` v1.18.0 release](https://github.com/qdrant/qdrant-js/releases/tag/v1.18.0). This aligns server/client major and minor versions; the server patch is newer.

The exact Docker image tag was verified by a read-only manifest lookup. Pinning the resolved digest in deployment is an implementation recommendation, not a Qdrant API requirement.

## BM25 and IDF

First-party evidence:

- [Full-text search and native BM25](https://qdrant.tech/documentation/search/text-search/full-text-search/)
- [Sparse vector IDF modifier](https://qdrant.tech/documentation/manage-data/indexing/#idf-modifier)
- [v1.18.2 local-model source](https://github.com/qdrant/qdrant/blob/v1.18.2/src/common/inference/local_model.rs)
- [v1.18.2 BM25 implementation](https://github.com/qdrant/qdrant/blob/v1.18.2/src/common/inference/bm25_inference.rs)
- [v1.18.2 BM25 OpenAPI integration test](https://github.com/qdrant/qdrant/blob/v1.18.2/tests/openapi/test_bm25.py)

Required collection shape:

```json
{
  "sparse_vectors": {
    "bm25": {
      "modifier": "idf"
    }
  }
}
```

Required document/query family:

```json
{
  "text": "course text",
  "model": "qdrant/bm25",
  "options": {
    "language": "none",
    "tokenizer": "multilingual",
    "k": 1.2,
    "b": 0.75,
    "avg_len": 256
  }
}
```

Use that document as the sparse value during upsert and as the query with `using: "bm25"`. The docs require the same text-processing settings at ingestion and query. The BM25 parameters are set when the document vector is inferred at ingestion; sharing one exact constant with query code is safe for drift prevention, but the query-time scoring guarantee still comes from the stored sparse vector plus collection-side IDF.

Conflict to track: the tagged v1.18.x OpenAPI description for `Document` still contains a stale warning that document inference is not implemented, while the v1.18.2 code, tagged integration test, and current official BM25 guide prove the local model is implemented. Treat the running image and an integration test as the decisive proof.

Integration proof:

- Upsert Russian, English, and mixed-language documents using the exact options; query with identical preprocessing; verify deterministic ranking and no external inference provider call.
- Prove behavior for empty text, stopwords, punctuation, oversized text, and collection updates that change the BM25 constant.
- Confirm the TypeScript client serializes the native `Document` request without casts that hide schema drift.

## Hybrid RRF, Formula, and grouping

First-party evidence:

- [Hybrid and multi-stage queries](https://qdrant.tech/documentation/search/hybrid-queries/)
- [Grouping API](https://qdrant.tech/documentation/concepts/search/#grouping-api)
- [v1.18.2 OpenAPI](https://raw.githubusercontent.com/qdrant/qdrant/v1.18.2/docs/redoc/v1.18.x/openapi.json)

The supported order is an outer Formula query over an inner Query object that itself has dense and sparse prefetches and an RRF query. The following is the proof shape, not a copy-paste final tuning decision:

```json
{
  "prefetch": {
    "prefetch": [
      {
        "query": { "text": "course text", "model": "qdrant/bm25", "options": {} },
        "using": "bm25",
        "filter": { "must": [] },
        "limit": 100
      },
      {
        "query": [0.1, 0.2],
        "using": "dense",
        "filter": { "must": [] },
        "score_threshold": 0.25,
        "limit": 100
      }
    ],
    "query": { "rrf": {} },
    "limit": 100
  },
  "query": {
    "formula": {
      "mult": [
        "$score",
        {
          "sum": [
            1,
            {
              "mult": [{ "sum": ["document_weight", -0.5] }, 0.2]
            }
          ]
        }
      ]
    },
    "defaults": { "document_weight": 0.5 }
  },
  "limit": 20,
  "with_payload": true
}
```

Critical correction: Formula expressions support arithmetic, conditions, geo/datetime scoring, and decay operations, but no arbitrary `clamp`, `min`, or `max`. `defaults` only handles a missing variable; it does not sanitize a nonnumeric or out-of-range payload. Therefore:

- validate `document_weight` at ingestion as a finite number in `[0.5, 1.0]`;
- store only the normalized value;
- use the supported arithmetic expression above and `defaults: {document_weight: 0.5}` for a missing field;
- reject or migrate legacy invalid values before switching the alias.

This arithmetic mapping is an inference from the supported Formula grammar. The exact coefficient remains a product-ranking decision.

Grouping uses `POST /collections/{collection_name}/points/query/groups` or JS `client.queryGroups`. Add `group_by: "document_id"`, `group_size`, and `limit` to the same query structure. `limit` is the number of groups. If the application promises N total chunks after round-robin flattening, request enough groups, flatten deterministically, then truncate to N.

Integration proof:

- Compile and run the exact nested query through `@qdrant/js-client-rest` 1.18.0 against server 1.18.2.
- Apply the same tenant/course filter to both dense and sparse inner prefetches; apply dense score threshold only to the dense prefetch.
- Verify prefetch limits do not starve outer RRF/Formula and grouped results.
- Test missing, string, NaN-like, below-minimum, and above-maximum weights. Only the missing case may rely on `defaults`.
- Verify group ordering, group count, per-group size, round-robin flattening, and total result limit.
- Benchmark Formula payload access. The docs recommend payload indexes for expression variables; omitting a `document_weight` index is a deliberate performance tradeoff that must be measured.

## Tenant indexes and strict mode

First-party evidence:

- [Tenant index](https://qdrant.tech/documentation/manage-data/indexing/#tenant-index)
- [Strict mode](https://qdrant.tech/documentation/operations/administration/#strict-mode)
- [Qdrant v1.18.0 release](https://github.com/qdrant/qdrant/releases/tag/v1.18.0)

Exact tenant index request:

```json
{
  "field_name": "tenant_id",
  "field_schema": {
    "type": "keyword",
    "is_tenant": true
  }
}
```

The v1.18.2 OpenAPI confirms `is_tenant` on `KeywordIndexParams`. `document_id` may use a normal keyword index for grouping.

The strict-mode collection key is `strict_mode_config`. The proposed fields exist in v1.18.2: `enabled`, `max_query_limit`, `max_timeout`, `unindexed_filtering_retrieve`, `unindexed_filtering_update`, `upsert_max_batchsize`, `search_max_batchsize`, `filter_max_conditions`, `condition_max_size`, `max_payload_index_count`, and `max_resident_memory_percent`. The resident-memory field was added in 1.18.0.

Integration proof:

- Create the collection with the exact strict config, read it back, and compare every field.
- Prove permitted tenant/course/document filters are indexed before strict mode blocks unindexed operations.
- Exercise one over-limit request for query limit, timeout, batch size, filter conditions, condition size, payload-index count, and memory limit.
- Count actual index definitions in the final schema. The proposed maximum of 16 has little room for silent schema growth.

## Aliases, snapshots, and S3 recovery

First-party evidence:

- [Collection aliases](https://qdrant.tech/documentation/manage-data/collections/#collection-aliases)
- [Snapshots and S3-compatible storage](https://qdrant.tech/documentation/snapshots/)
- [v1.18.2 snapshot storage manager source](https://github.com/qdrant/qdrant/blob/v1.18.2/lib/collection/src/common/snapshots_manager.rs)

Alias updates sent together to `POST /collections/aliases` are atomic. A switch request can delete the old target and create the alias for the new physical collection in one action list. Prove missing-alias, existing-target, name-conflict, retry, and rollback behavior.

Collection snapshots include collection configuration, points, and payloads, but explicitly exclude aliases. A recovery runbook must recreate or verify the stable alias after restoring a physical collection.

Exact storage structure:

```yaml
storage:
  snapshots_config:
    snapshots_storage: s3
    s3_config:
      bucket: megacampus-qdrant
      region: us-east-1
      access_key: ${S3_ACCESS_KEY}
      secret_key: ${S3_SECRET_KEY}
      endpoint_url: ${S3_ENDPOINT_URL}
```

The equivalent documented environment mapping uses double underscores:

```text
QDRANT__STORAGE__SNAPSHOTS_CONFIG__SNAPSHOTS_STORAGE=s3
QDRANT__STORAGE__SNAPSHOTS_CONFIG__S3_CONFIG__BUCKET=...
QDRANT__STORAGE__SNAPSHOTS_CONFIG__S3_CONFIG__REGION=...
QDRANT__STORAGE__SNAPSHOTS_CONFIG__S3_CONFIG__ACCESS_KEY=...
QDRANT__STORAGE__SNAPSHOTS_CONFIG__S3_CONFIG__SECRET_KEY=...
QDRANT__STORAGE__SNAPSHOTS_CONFIG__S3_CONFIG__ENDPOINT_URL=...
```

The snapshot response provides the snapshot name and size, with optional creation time and checksum. Point count must be recorded separately from collection info. Storage mode and remote URI are deployment metadata, not guaranteed fields of `SnapshotDescription`.

Recovery constraints:

- Restore into the same minor version; the target may be the same or a newer patch release within that minor.
- For a new target collection, set recovery priority to `snapshot`; the default replica priority can preserve an empty target.
- Official docs cover recovery from an HTTP/file URL, multipart upload, and startup recovery. They do not document passing a raw `s3://` URI to the recover endpoint.
- The tagged source proves Qdrant manages S3 snapshot objects, but the exact external restore transport remains an integration choice.

Recommended proof sequence (inference): create snapshot, list it, record checksum/size/point count, download through Qdrant's authenticated snapshot endpoint or stream the object through an approved tool, recover into a new physical collection with `priority: "snapshot"`, verify schema/points/search, then recreate/switch the alias. If self-URL recovery is chosen, evaluate `service.enable_snapshot_url_recovery` and SSRF exposure added to the platform in 1.18.

Do not assume Docker Compose secrets automatically become Qdrant environment variables. Compose mounts secrets as files, while Qdrant documents values/config variables rather than `_FILE` variables. Prove a narrow mounted config or controlled entrypoint mapping without exposing values in tracked files or process listings.

## Metrics, security, Web UI, and Docker

First-party evidence:

- [Qdrant monitoring](https://qdrant.tech/documentation/ops-monitoring/monitoring/)
- [Qdrant security configuration](https://qdrant.tech/documentation/tutorials-operations/secure-qdrant/)
- [Qdrant hardening](https://qdrant.tech/documentation/security/#hardening)
- [Qdrant Web UI](https://qdrant.tech/documentation/web-ui/)
- [Docker Compose ports](https://docs.docker.com/reference/compose-file/services/#ports)
- [Docker Compose depends_on](https://docs.docker.com/reference/compose-file/services/#depends_on)
- [Docker Compose resource limits](https://docs.docker.com/reference/compose-file/services/#mem_limit)
- [Docker Compose secrets](https://docs.docker.com/reference/compose-file/services/#secrets)

Confirmed Qdrant endpoints and behavior:

- `/metrics` exposes Prometheus/OpenMetrics metrics.
- `/readyz`, `/healthz`, and `/livez` are available and remain unauthenticated even when API keys are enabled.
- `?per_collection=true` is available in v1.18 and changes the returned metric set to collection-labelled metrics rather than simply adding labels to every global series.
- `service.metrics_prefix` can prefix metric names. All dashboard queries and alert rules must use the configured prefix consistently.
- Snapshot-running and snapshot-created counters exist, but counters reset on process restart and there is no native last-success timestamp.
- REST response metrics do not cover all collection-info, collection-list, and snapshot operations.
- Hardware reporting exists but the exact v1.18.2 configuration labels it experimental/unsupported. Enabling it is an explicit risk acceptance, not a required monitoring baseline.

Monitoring gaps:

- Qdrant metrics expose process memory, not the container memory limit. A `resident > 85% of container limit` alert needs a fixed per-environment limit in the expression or cAdvisor/container-exporter metrics.
- Qdrant has no application-level hybrid fallback-rate metric. The application must expose/scrape it or logs must be converted through an explicit metrics pipeline.
- Backup age and restore-drill age need an external durable gauge. Prometheus server does not read `.prom` textfiles mounted into its container. The official [node_exporter textfile collector](https://github.com/prometheus/node_exporter#textfile-collector) requires node_exporter with `--collector.textfile.directory`, or the tool must expose an HTTP metrics endpoint. Add one of those paths to Q9.

Security and networking:

- Self-hosted Qdrant has no authentication or encryption by default. Admin and read-only API keys are supported; requests use the `api-key` header and a read-only key rejects mutations.
- Qdrant warns that an API key over an unencrypted connection is insecure. Plain HTTP on a same-host private bridge must be recorded as an explicit threat-model exception; it is not the vendor's preferred security posture.
- `127.0.0.1:6335:6333` correctly restricts the host-published port. Inside the container Qdrant must still listen on `0.0.0.0` so peer containers can reach `http://qdrant:6333`. “Never bind 0.0.0.0” must refer to host publishing, not the in-container listener.
- Qdrant recommends the `-unprivileged` image and read-only-root/container hardening. Evaluate `qdrant/qdrant:v1.18.2-unprivileged`, capability drops, `no-new-privileges`, and the exact writable storage/temp mounts.
- Web UI is served at `/dashboard`; supply the read-only key and keep the host publication on loopback.
- The v1.18.2 Dockerfile does not install `curl` or `wget`. A Compose healthcheck may target `/readyz`, but the in-container command must use an available binary or a custom/external probe. Do not copy a curl-based probe without proving it against the pinned image.

## Prometheus 3.11.3

First-party evidence:

- [Prometheus v3.11.3 release](https://github.com/prometheus/prometheus/releases/tag/v3.11.3)
- [Official downloads and current/LTS releases](https://prometheus.io/download/)
- [v3.11.3 configuration reference](https://github.com/prometheus/prometheus/blob/v3.11.3/docs/configuration/configuration.md)
- [v3.11.3 storage reference](https://github.com/prometheus/prometheus/blob/v3.11.3/docs/storage.md)

`prom/prometheus:v3.11.3` exists. It was released 2026-04-27 and includes security fixes. As of 2026-07-10 the official downloads page lists newer current and LTS releases, so 3.11.3 is a valid reproducible pin but not a freshness-based recommendation. Before Q9 implementation, choose and record one policy: current release, LTS release, or explicitly time-bounded 3.11.3 compatibility pin.

Exact v3.11.3 scrape shape:

```yaml
scrape_configs:
  - job_name: qdrant
    metrics_path: /metrics
    params:
      per_collection: ['true']
    http_headers:
      api-key:
        files:
          - /run/secrets/qdrant_read_only_api_key
    static_configs:
      - targets: ['qdrant:6333']
```

Custom header values from files are supported in the tagged v3.11.3 config. Validate the mounted file and ensure the secret value does not include unintended whitespace.

The planned flags are valid in 3.11.3:

```text
--storage.tsdb.retention.time=15d
--storage.tsdb.retention.size=5GB
```

Whichever limit is reached first applies. The backing volume must be sized so 5 GB remains below the operational disk-watermark policy. If upgrading to a newer Prometheus release, re-check the current configuration contract because newer documentation deprecates some retention flags in favor of configuration fields.

Run both `promtool check config` and `promtool check rules`; add `promtool test rules` cases for alert thresholds, absent series, prefix changes, per-collection labels, and counter resets.

## Grafana 12.4.0

First-party evidence:

- [Grafana v12.4.0 release](https://github.com/grafana/grafana/releases/tag/v12.4.0)
- [Official Grafana download page](https://grafana.com/grafana/download)
- [Grafana Docker configuration](https://grafana.com/docs/grafana/latest/setup-grafana/configure-docker/)
- [Provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/)
- [Alerting file provisioning](https://grafana.com/docs/grafana/latest/alerting/set-up/provision-alerting-resources/file-provisioning/)

`grafana/grafana:12.4.0` exists. The image repository is correct: starting with 12.4.0, `grafana/grafana-oss` is no longer updated. Persist `/var/lib/grafana` and mount provisioning under `/etc/grafana/provisioning`.

The pin is superseded. The official release stream contains later 12.4 patches, including security variants, and the current download page lists Grafana 13.x. Recommendation: select a patched/current version before implementation and re-run dashboard/plugin compatibility tests; keep 12.4.0 only with a documented, time-bounded compatibility exception.

Critical notification gap: Prometheus `alerts.yml` defines evaluations but does not provide a receiver. The current Q9 file list contains datasource/dashboard provisioning but no Grafana files under `provisioning/alerting`, and no Alertmanager service. To satisfy “provisioned secret-backed contact point,” choose one architecture:

1. Grafana-managed alerting: provision rule groups, contact points, and notification policies under `/etc/grafana/provisioning/alerting`; or
2. Prometheus plus Alertmanager: add an Alertmanager service/configuration and configure Prometheus `alerting.alertmanagers`.

For Grafana-managed alerting, prove environment/secret substitution, contact-point delivery to a non-production sink, policy routing, restart/reload behavior, and that anonymous/public sharing is disabled. Dashboard JSON using the classic schema is appropriate for Grafana 12.4 compatibility.

## systemd facts for Q6/Q8/Q9

First-party evidence:

- [systemd.timer](https://github.com/systemd/systemd/blob/main/man/systemd.timer.xml)
- [systemd.time](https://github.com/systemd/systemd/blob/main/man/systemd.time.xml)
- [systemd.exec](https://github.com/systemd/systemd/blob/main/man/systemd.exec.xml)
- [systemd-analyze](https://github.com/systemd/systemd/blob/main/man/systemd-analyze.xml)

`OnCalendar=*-*-* 00/6:15:00` is valid systemd calendar syntax. Local `systemd-analyze` v259 normalized it and produced executions at 00:15, 06:15, 12:15, and 18:15 local time. Validate again on the target host's systemd version and timezone.

`Persistent=true` catches a missed calendar execution when the timer becomes active again. `RandomizedDelaySec=10min` adds up to ten minutes, and the default `AccuracySec=1min` can add/coalesce another minute. Therefore the proposed timer does not prove a strict six-hour RPO. Either document an approximately 6 h 11 min upper bound or reduce jitter/set an explicit `AccuracySec` consistent with the operational objective.

`EnvironmentFile=` is not parsed as a shell script, and systemd explicitly warns that environment variables are not suitable for secrets because they may propagate and be observable over IPC. Loading the entire `/opt/megacampus/.env.production` into backup/restore tools unnecessarily broadens access. Prefer a narrowly scoped file or systemd credentials if the CLI can consume a credential file.

Use an absolute, target-verified executable path in `ExecStart`; a development-machine pnpm path is not a deployment contract. Run `systemd-analyze verify` on the final timer/service files on the target OS, then perform one controlled manual start and inspect journal output, exit status, timeout, concurrency/locking, and metrics emission.

# Verification

Completed evidence checks:

- Read-only Docker manifest checks passed for all three pinned image tags.
- Exact tagged Qdrant v1.18.2 OpenAPI/config/source and BM25 test were cross-checked against the current official guides.
- Exact tagged Prometheus v3.11.3 configuration/storage documentation was used for header and retention shapes.
- Official Grafana release/Docker/provisioning documentation was used for the image and alerting model.
- `systemd-analyze calendar --iterations=8 '*-*-* 00/6:15:00'` passed and produced the expected six-hour sequence at minute 15.
- `python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-jz6y0/artifacts/authoritative-docs.md` passed after authoring.
- Delegated write-zone check showed this stream changed only this artifact. Concurrent parent/peer stage-summary and artifact changes were present in the shared worktree and were left untouched.

Required parent-stage integration proofs before acceptance:

1. Run native BM25 multilingual ingestion/query tests against the pinned image and client.
2. Compile and execute nested RRF then Formula and grouped variants; prove normalized payload-weight behavior and filter placement.
3. Exercise every strict-mode boundary and compare collection/index schema after creation.
4. Prove atomic alias switch, retry, conflict, and rollback behavior.
5. Complete an off-host S3 snapshot plus isolated recovery drill using a documented/proven transport, `priority: "snapshot"`, checksum/point/schema/search verification, and alias recreation.
6. Prove a healthcheck that works in the actual image without assuming curl/wget.
7. Validate Qdrant prefix/per-collection scrape labels, read-only header file, dashboard queries, and Prometheus rules with `promtool`.
8. Add and test the missing exporter paths for backup/restore age, container memory ratio, and application fallback rate.
9. Provision and test an actual alert receiver/policy via Grafana alerting or Alertmanager.
10. Resolve Prometheus/Grafana version policy, pin immutable digests, and rerun security/compatibility checks.
11. Verify final systemd units on the target version/timezone and prove secret scope, executable path, locking, catch-up, and maximum schedule delay.

# Risks / Follow-ups

- **High — invalid ranking request:** an unmodified `clamp(document_weight, ...)` design will not match the v1.18.2 Formula grammar.
- **High — false backup confidence:** native S3 storage does not by itself prove a valid recovery transport, restore priority, alias recreation, or integrity drill.
- **High — silent monitoring gaps:** mounted Prometheus textfiles, container-limit alerts, fallback-rate alerts, and receiver delivery are absent without additional components/configuration.
- **High — stale Grafana pin:** 12.4.0 is superseded by patched/current official releases; retain it only after an explicit security and compatibility decision.
- **Medium — Prometheus lifecycle:** 3.11.3 exists but is neither current nor LTS as of the research date; select a support policy before deployment.
- **Medium — plaintext API key:** loopback host publication does not encrypt same-host container traffic; record or eliminate the exception.
- **Medium — container hardening:** the regular Qdrant image and writable root depart from official hardening recommendations.
- **Medium — cardinality/query drift:** `per_collection=true` changes metric output and labels; prefixes and collection churn can invalidate dashboards and alerts.
- **Medium — timer/RPO mismatch:** randomized delay plus accuracy widens the real cadence beyond six hours.
- **Medium — secret exposure:** broad `EnvironmentFile=` use and unproven Compose-secret-to-environment mapping can expose more credentials than necessary.
- **Low — stale OpenAPI prose:** the tagged `Document` description conflicts with tagged code/tests; retain the integration regression test so documentation drift cannot mask a runtime regression.

Completion disposition: `returned`, verification `passed`, clean `yes`; no commit, push, container start, or service mutation was performed.
