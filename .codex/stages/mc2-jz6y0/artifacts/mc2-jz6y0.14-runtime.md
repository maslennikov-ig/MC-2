---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.14
stage_id: mc2-jz6y0
agent_type: deploy_specialist
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: Q6/Q8/Q9 cross security, recovery, deployment ordering, secret scope, and observability contracts.
repo: mc2
branch: codex/qdrant-runtime-preflight
base_branch: codex/self-hosted-qdrant-platform
base_commit: b88b179a16bd2f8827b8d39a3fa83daa81cc13b6
worktree: /home/me/code/mc2/.worktrees/qdrant-runtime-preflight
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.14-runtime.md
success_criteria:
  - Map current and required Q6/Q8/Q9 runtime state without implementation or service mutation.
  - Define exact write zones, invariants, RED tests, acceptance commands, dependency gates, and remote boundaries.
selected_docs:
  - docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md
  - docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md
  - .codex/stages/mc2-jz6y0/artifacts/authoritative-docs.md
  - First-party Qdrant 1.18.2 monitoring and Dockerfile sources, Prometheus/Alertmanager documentation, and repo-pinned client types
selected_skills:
  - task-router
  - senior-devops
selected_agents:
  - deploy_specialist
catalog_candidates:
  - none because the installed assets cover the bounded preflight
parallel_group: Q-runtime-preflight
depends_on_streams:
  - mc2-jz6y0.14 owner decision before Q6/Q9 implementation
parallel_decision: sequential
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: Read-only worktree; only this artifact was created.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: This artifact is implementation guidance; durable operator docs remain Q9/E7/Q10 work.
graph_reviewed: used
graph_review_notes: Read current report built from b88b179a and ran focused runtime queries; infra YAML has weak graph coverage, so exact file reads were authoritative. No refresh for a read-only audit.
verification:
  - bd prime and bd show mc2-jz6y0.7/.9/.10/.14: passed
  - docker buildx imagetools inspect qdrant/qdrant:v1.18.2: passed without pull
  - docker compose config --no-env-resolution --quiet for four Compose files: passed
  - bash -n scripts/deploy_dev.sh scripts/deploy_blue_green.sh: passed
  - python3 scripts/orchestration/validate_artifact.py artifact: passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.14-runtime.md
explicit_defers:
  - mc2-jz6y0.14 must record owner-approved observability/exporter/notification pins before Q6 or Q9 implementation.
  - mc2-jz6y0.13 remains the separate staging/live/secret/deploy authorization gate; nothing here authorizes Q12.
---

# Summary

Q6, Q8, and Q9 are not implemented at `b88b179a`. Q6 is correctly blocked by owner decision `.14`; Q8 and Q9 then depend on Q6. The repo has a dev-only `qdrant/qdrant:latest`, Cloud defaults in both environment examples, no staging Qdrant, snapshots tooling, systemd units, Prometheus/Grafana/node_exporter/Alertmanager stack, or operator runbook. Safe implementation can proceed after `.14` without touching staging.

The immutable Qdrant pin already selected by the approved design is:

- image index: `qdrant/qdrant:v1.18.2@sha256:75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c`;
- Linux/amd64 child manifest: `sha256:da65a06bc75e42702f80c992b99c5144b0fbd675ae7a96d2991de0bf957b7071`.

Do not select Prometheus, Grafana, node_exporter, or Alertmanager pins in Q6/Q9 until `.14` records the owner choice. Once chosen, pin each as `tag@digest`, not tag alone.

# Dependency and decomposition boundaries

| Stream | Goal | Write zone | Dependency | Verification | Decision |
| --- | --- | --- | --- | --- | --- |
| Q6 | Secure dev/staging runtime and pre-recreate gates | four Compose files, two deploy scripts, env examples, a narrow Qdrant secret-entrypoint helper, runtime contract tests | `.14`, Q1 | static contract tests, four Compose validations, shell syntax, pinned local health proof | blocked before edits by `.14` |
| Q8 | Snapshot manifest, retention, isolated restore, timer | `tools/qdrant/snapshot*`, `restore-drill*`, unit/integration tests, package scripts, `deploy/systemd/*` | accepted Q2 and Q6 | unit tests, systemd verify/calendar, pinned local snapshot/restore | starts only after Q6 |
| Q9 | Scrape/export/alerts/dashboard/notification path | `ops/qdrant/**`, infra Compose, Qdrant/app metric sink and tests, operator runbook | Q6 and `.14` | promtool/amtool, dashboard schema, Compose, local scrape/rule/delivery smoke | starts only after Q6; may run beside Q8 |

Q8 and Q9 have disjoint primary write zones after Q6 and should be separate worktrees with independent correctness review. `docker-compose.infra.yml` is shared ownership; Q8 should consume Q6's snapshot environment contract and Q9 alone should add monitoring services. Integrate Q6 before branching Q8/Q9 to avoid an unisolatable YAML conflict.

# Q6 file-by-file implementation map

## Current state

- `docker-compose.dev.yml`: `qdrant/qdrant:latest`, loopback REST port and persistent volume exist, but only an admin key is passed, there is no healthcheck/resource limit/telemetry or metrics configuration, and API/main/Stage 6 use `service_started`. API/main/Stage 6 already override `QDRANT_URL`; Stage 7 correctly has neither URL nor dependency.
- `docker-compose.infra.yml`: no Qdrant. It owns the persistent staging main worker and Stage 7 worker; main currently inherits the Cloud URL from `.env.production` and Stage 7 has no Qdrant wiring.
- `docker-compose.app.yml`: blue/green API inherits the Cloud URL and cannot express `depends_on` for a service owned by the separate infra Compose project. It needs the explicit internal URL; deploy ordering is the cross-project readiness gate.
- `docker-compose.production.yml`: full-stack API, main worker and Stage 6 all inherit the Cloud URL; no Qdrant exists. Stage 7 must remain untouched by Qdrant wiring.
- `scripts/deploy_dev.sh`: starts Qdrant and checks authenticated `/collections`, but recreates core app services before the full Qdrant gate, never checks `/readyz`, and never runs `qdrant:verify`.
- `scripts/deploy_blue_green.sh`: starts infra and immediately prepares/recreates the next color; no Qdrant readiness/auth/schema gate precedes API or worker recreation.
- `.env.production.example` and `packages/course-gen-platform/.env.example`: Cloud is still the default and there are no physical-name, read-only-key-file, snapshot S3, metrics, or notification paths.

## Required writes and invariants

1. **Pinned service and hardening** — use the Qdrant index digest above in dev, infra, and full-production Compose. Host publishing is only `127.0.0.1:6333:6333` in dev and `127.0.0.1:6335:6333` in staging; no nginx route and no `0.0.0.0` host publish. Persist `/qdrant/storage`; limits are 1 CPU/1 GiB dev and 2 CPU/2 GiB staging. Disable telemetry, set `QDRANT__SERVICE__METRICS_PREFIX=qdrant_`, and do not enable experimental hardware reporting merely because the old plan mentions it.
2. **Secret files** — Qdrant does not document Compose `_FILE` environment variables. Add a tracked, value-free Bash entrypoint under `deploy/qdrant/` that reads mounted admin/read-only/S3 credential files, rejects missing/empty/world-readable inputs, exports Qdrant's documented double-underscore variables only inside the container process, and `exec`s `/qdrant/entrypoint.sh`. Compose mounts the files read-only and never interpolates their values into rendered YAML, argv, logs, artifacts, or deploy output. Environment examples contain paths/placeholders, never real values.
3. **Curl-less healthcheck** — the pinned Dockerfile installs neither curl nor wget. Use a Bash-builtin `/dev/tcp/127.0.0.1/6333` HTTP request to unauthenticated `/readyz`, read the status line with Bash builtins, and require `200`. A static test must reject `curl`, `wget`, `nc`, and secret-bearing healthchecks; an actual pinned-container test must prove Docker reaches `healthy`.
4. **Explicit consumers** — set `QDRANT_URL=http://qdrant-dev:6333` for dev API/main/Stage 6 and `QDRANT_URL=http://qdrant:6333` for staging blue/green API, staging main worker, staging Stage 6, and their full-production equivalents. Add `condition: service_healthy` only where Qdrant is in the same Compose model. Cross-project `docker-compose.app.yml` cannot use `depends_on`; its deploy script must gate infra first. Never set `QDRANT_URL`, mount Qdrant secrets, or add a Qdrant dependency to any Stage 7 service.
5. **Staging storage/S3 contract** — infra/full-production Qdrant map native `snapshots_storage=s3`, bucket, region, endpoint, access key and secret key through the secret entrypoint. Dev explicitly uses local snapshot storage for drills. A same-host MinIO volume is not off-host recovery.
6. **Deploy ordering** — both scripts must perform, in order, unauthenticated `/readyz`, authenticated read-only `/collections`, and application `qdrant:verify` before recreating any API/main/Stage 6 consumer. Do not echo keys, headers, URLs containing credentials, or command traces. Failure exits before traffic switching or worker recreation. Stage 7 restarts remain independent and receive no Qdrant gate-induced configuration.
7. **Clean-checkout Compose validation** — current `env_file: .env.dev/.env.production` makes the plan's example-file commands fail before parsing. Parameterize service env-file paths (production and dev separately) or use a generated synthetic fixture outside Git; keep the deployed defaults unchanged. Run one structural `--no-env-resolution` check and one full synthetic-file check including secret-file existence.
8. **Workflow handoff** — Q10/Q12 must later copy the new `deploy/qdrant`, `deploy/systemd`, and `ops/qdrant` assets. Do not alter CI/CD deployment or install anything remotely in Q6 without the Q12 authorization.

## Q6 RED tests

Create a static runtime-contract suite (recommended `packages/course-gen-platform/tests/unit/ops/qdrant-runtime-contract.test.ts`) that initially fails for every current gap:

- all Qdrant Compose occurrences equal the approved `v1.18.2@sha256` pin and no `latest` remains;
- only the two required loopback host ports exist; resource/volume/telemetry/metrics settings are exact;
- healthcheck calls `/readyz`, uses only pinned-image binaries/Bash builtins, and contains no key;
- API/main/Stage 6 have explicit environment URLs and same-model healthy dependencies; every Stage 7 block lacks URL, secret and dependency;
- secret values do not appear in Compose/env examples and the wrapper fails closed for missing/empty/unsafe files;
- S3 settings are present only via secret paths/runtime exports;
- both deploy scripts order `/readyz`, authenticated `/collections`, and `qdrant:verify` before app/RAG worker recreation and never use shell tracing;
- Cloud endpoints/default collection names are absent from the two changed examples.

# Q8 recovery design

## Files and pure contract

- Add `tools/qdrant/snapshot.ts` plus a pure helper module for alias resolution, manifest validation, retention selection, metric rendering, and redaction.
- Add `tools/qdrant/restore-drill.ts`; reuse `verifyPhysicalCourseEmbeddingsCollection`, production BM25/Formula search helpers, and the accepted Q7 relevance/parity contract rather than inventing a weaker verifier.
- Add `tests/unit/tools/qdrant/snapshot.test.ts`, a restore-drill unit test, and a pinned local integration test/script.
- Add package scripts `qdrant:snapshot` and `qdrant:restore-drill`.
- Add `deploy/systemd/megacampus-qdrant-snapshot.{service,timer}` and, if monthly scheduling is separate, `megacampus-qdrant-restore-drill.{service,timer}`.

The snapshot command resolves the stable alias to exactly one physical collection, captures point count before creation, creates and re-lists the snapshot, then writes a single redacted manifest atomically. Required fields: schema version, physical collection, logical alias, snapshot name, point count, byte size, optional server checksum, locally calculated/verified SHA-256 when bytes are transported, creation time, storage mode, sanitized remote object identity, server/client version, and result status. A failed create/list/manifest write is nonzero and must not advance success-age metrics.

Retention is deterministic by creation timestamp/name, keeps 30 days, never deletes the newest successful object, never acts on another collection/prefix, and deletes only after a new successful manifest is durable. Concurrent snapshot/restore/retention runs use one nonblocking `flock`; failure to acquire is observable and nonzero.

## Supported local restore transport

Do not pass `s3://`. For the local pinned drill, use the client-supported authenticated self-HTTP transport:

```text
location=http://127.0.0.1:6333/collections/<physical>/snapshots/<url-encoded-name>
api_key=<read from credential file, never logged>
priority=snapshot
checksum=<manifest checksum when present>
```

Qdrant itself fetches that URL; prove it against 1.18.2. Restore to a unique `qdrant_restore_drill_<UTC>_<nonce>` physical collection. Snapshots exclude aliases, so create a unique drill alias, verify queries through it, then atomically remove that alias before deleting only the drill collection in `finally`. The stable `course_embeddings` alias is read and asserted unchanged before/after every success and failure. A real disaster recovery path recreates or atomically switches the stable alias only after schema/count/dense/RU BM25/EN BM25/Formula checks and requires a separate explicit operator action.

## systemd and RPO caveats

Use absolute target-host executables, `User`/`Group`, `UMask=0077`, `NoNewPrivileges=true`, filesystem protections, a writable manifest/textfile directory only, `flock`, timeouts, and narrowly scoped `LoadCredential=` files. Do not load all of `/opt/megacampus/.env.production`; the tool reads credential file paths directly.

The approved `00/6:15` calendar plus 10-minute jitter and default one-minute accuracy does **not** prove a strict six-hour RPO. The implementation must either remove jitter and set explicit tight `AccuracySec`, or schedule often enough that cadence + jitter + accuracy is at most six hours. `Persistent=true` catches up after restart but cannot guarantee RPO during a host outage; record that availability caveat and alert on age >8h. Monthly restore has its own lock and does not overlap snapshot retention.

## Q8 RED/acceptance matrix

| Test | Must prove |
| --- | --- |
| Pure manifest/retention | alias resolves, redaction, deterministic order, 30-day boundary, newest preserved, foreign prefix refused, failures do not publish success |
| Restore orchestration unit | `priority=snapshot`, API key not logged, stable alias unchanged, drill alias recreated, `finally` deletes only owned resources, cleanup failure retained in evidence |
| Recovery verification | exact schema/indexes/strict mode, counts, dense, RU BM25, EN BM25, Formula priority and tenant/course isolation |
| systemd static | credentials are narrow, lock and hardening exist, calendar upper bound is documented/proved, absolute paths validate |
| Pinned local integration | snapshot create/list/download/recover, checksum, alias recreation and negative corrupt/wrong-key/duplicate-run cases on 1.18.2 |

# Q9 observability design

## Files and services

- Add `ops/qdrant/prometheus/{prometheus.yml,alerts.yml,alert-tests.yml}`.
- Add `ops/qdrant/alertmanager/alertmanager.yml` using a secret-backed receiver such as generic `webhook_configs.url_file`; mount the receiver URL file read-only and persist Alertmanager state.
- Add Grafana datasource/dashboard provisioning and `dashboards/qdrant.json`; Prometheus is the datasource, while Alertmanager performs notification delivery.
- Add loopback-only Prometheus (`127.0.0.1:9090`), Grafana (`127.0.0.1:3005`), and Alertmanager (`127.0.0.1:9093`). node_exporter need not publish a host port; Prometheus reaches it on the private bridge.
- Add node_exporter with `--collector.textfile.directory=/var/lib/node_exporter/textfile_collector` and a read-only bind from a host directory written atomically by Q8 and application metric sinks.
- Add a Qdrant hybrid-attempt/fallback metric sink at the production fallback decision point. API, main worker and Stage 6 each own a distinct persistent `.prom` file; counters survive restart and files are atomically replaced. Stage 7 emits nothing.
- Add `docs/operations/qdrant-self-hosted.md` with SSH tunnels, read-only Web UI key, triage, backup/restore, receiver testing, exposure prohibition, and rollback.

Prometheus scrapes `qdrant:6333/metrics?per_collection=true` using the read-only key file header, node_exporter textfiles, and Alertmanager. With `metrics_prefix=qdrant_`, all rules/dashboard queries use the prefixed names. Per-collection mode replaces global response series and supplies status/collection labels; rule tests must catch prefix and label drift.

## Eight required alert signal sources

| Alert | Source/expression contract | Required duration |
| --- | --- | --- |
| `QdrantDown` | Prometheus `up{job="qdrant"} == 0` (the scrape target is gated separately by `/readyz`) | 2m, critical |
| `QdrantRecoveryMode` | `qdrant_app_status_recovery_mode == 1` | 5m, critical |
| `QdrantRestErrorRateHigh` | failed HTTP statuses from `rate(qdrant_rest_responses_total{status=~"4..|5.."}[10m]) / rate(qdrant_rest_responses_total[10m]) > 0.02`; protect zero denominator | 10m, warning |
| `QdrantMemoryHigh` | `qdrant_memory_resident_bytes / 2147483648 > 0.85` for the fixed staging 2 GiB limit; if the limit becomes variable, add cAdvisor rather than guessing | 15m, warning |
| `QdrantPointCountUnexpectedDrop` | active physical collection `qdrant_collection_points` compared with an offset/rule baseline; suppress alias-cutover maintenance only through an audited silence | critical when loss >10% between scrapes |
| `QdrantSnapshotStale` | node_exporter textfile gauge `megacampus_qdrant_last_successful_snapshot_unixtime_seconds`; `time()-gauge > 8h` and absent gauge is failure | critical |
| `QdrantRestoreDrillStale` | textfile gauge `megacampus_qdrant_last_successful_restore_drill_unixtime_seconds`; `time()-gauge > 35d` and absent gauge is failure | warning |
| `QdrantHybridFallbackHigh` | rates of durable per-instance `megacampus_qdrant_hybrid_fallback_total / megacampus_qdrant_hybrid_requests_total > 0.05`; protect zero denominator and sum instances | 15m, warning |

Dashboard panels use those same sources plus `qdrant_app_info`, points/vectors, REST rate/error/p95 histogram, allocator/resident memory, running optimizations, snapshot/recovery activity, and last success ages. Variables are environment and physical collection; links point to loopback Web UI/runbook only. Anonymous access/public sharing are disabled, and no datasource/API/receiver secret appears in JSON.

## Q9 RED tests

- static Compose test for exact owner-approved `tag@digest` images, private/loopback ports, persistent volumes, read-only mounts, secret files, and no Stage 7 wiring;
- `promtool check config`, `check rules`, and `test rules` fixtures for all eight alerts, missing series, counter reset, zero denominator, status labels, prefix drift, alias cutover, and exact `for`/severity values;
- `amtool check-config` plus a local non-production webhook sink smoke proving firing and resolved delivery, receiver-file secrecy, restart persistence, and no delivery when config is invalid;
- node_exporter textfile tests for atomic valid exposition, stale/absent files, no credentials, and independent app-service counters;
- Grafana JSON/provisioning schema tests asserting every required panel/query/variable/link and no embedded secret/public access;
- local scrape smoke confirms the read-only key can read metrics/collections but cannot mutate Qdrant.

# Verification

## Exact safe-local acceptance commands

Commands below are local-only; use synthetic secret files and never real deployment credentials:

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts \
  tests/unit/ops/qdrant-runtime-contract.test.ts \
  tests/unit/tools/qdrant/snapshot.test.ts \
  tests/unit/tools/qdrant/restore-drill.test.ts \
  tests/unit/shared/qdrant/search-operations.test.ts

docker compose -f docker-compose.dev.yml --env-file <synthetic-dev-env> config --quiet
docker compose -f docker-compose.infra.yml --env-file <synthetic-prod-env> config --quiet
docker compose -f docker-compose.app.yml --env-file <synthetic-prod-env> config --quiet
docker compose -f docker-compose.production.yml --env-file <synthetic-prod-env> config --quiet
bash -n scripts/deploy_dev.sh scripts/deploy_blue_green.sh deploy/qdrant/*.sh

systemd-analyze verify deploy/systemd/megacampus-qdrant-*.service deploy/systemd/megacampus-qdrant-*.timer
systemd-analyze calendar --iterations=8 '<final snapshot calendar>'

docker run --rm --entrypoint /bin/promtool -v "$PWD/ops/qdrant/prometheus:/etc/prometheus:ro" \
  <owner-approved-prometheus-tag@digest> check config /etc/prometheus/prometheus.yml
docker run --rm --entrypoint /bin/promtool -v "$PWD/ops/qdrant/prometheus:/etc/prometheus:ro" \
  <owner-approved-prometheus-tag@digest> check rules /etc/prometheus/alerts.yml
docker run --rm --entrypoint /bin/promtool -v "$PWD/ops/qdrant/prometheus:/etc/prometheus:ro" \
  <owner-approved-prometheus-tag@digest> test rules /etc/prometheus/alert-tests.yml
docker run --rm --entrypoint /bin/amtool -v "$PWD/ops/qdrant/alertmanager:/etc/alertmanager:ro" \
  <owner-approved-alertmanager-tag@digest> check-config /etc/alertmanager/alertmanager.yml

QDRANT_URL=http://localhost:6333 QDRANT_API_KEY=test-qdrant-key \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
  tests/integration/ci-qdrant-smoke.test.ts tests/integration/qdrant.test.ts \
  tests/integration/qdrant-snapshot-restore.test.ts

pnpm type-check
pnpm build
scripts/orchestration/run_process_verification.sh
```

Local pinned-container/service startup for health, scrape, notification, and restore drills is safe only in isolated disposable names/networks/volumes with synthetic keys; record and remove every resource. Image manifest inspection and Compose/config validators are non-mutating. Image pull is an implementation prerequisite, not part of this preflight.

# Forbidden remote boundary

Do not run `scripts/deploy_dev.sh`, `scripts/deploy_blue_green.sh`, `/deploy`, SSH/SCP, service/timer installation or enabling, real S3 snapshot/restore, secret creation/change, staging Compose, live reindex, traffic switch, or any staging/prod API call. These are Q12 `.13`, require the exact action/effect/secret/observation/rollback/downtime presentation, and need explicit current-task authorization. Q6-Q9 acceptance is local evidence only.

# Risks / Follow-ups / Explicit Defers

## Docs impact and residual risks

- Q9 owns the operator runbook; E7/Q10 must reconcile it with evidence decisions, environment examples, deployment guide, Qdrant module docs, project index, and Cloud retirement language.
- The regular Qdrant image is the currently approved design. Moving to `-unprivileged` is a separate compatibility/hardening decision; whichever image is selected must have its own digest and volume/health proof.
- Same-host private HTTP protects exposure but does not encrypt API keys; retain this explicit threat-model exception unless cross-container TLS is separately approved.
- Native S3 storage does not prove recovery. Only authenticated transport + checksum + `priority=snapshot` + alias recreation + full relevance/isolation verification closes Q8.
- A fixed 2 GiB divisor is valid only while Compose enforces that exact limit. Any resource change must update/test the rule atomically or add a real container-limit exporter.
