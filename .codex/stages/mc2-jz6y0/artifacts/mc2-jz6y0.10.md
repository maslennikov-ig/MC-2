---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.10
stage_id: mc2-jz6y0
agent_type: observability_worker
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: Authenticated metrics transport, alert delivery, secret ownership, dashboards, and Compose topology are security/operations critical.
repo: /home/me/code/mc2
branch: codex/qdrant-q9-observability
base_branch: codex/self-hosted-qdrant-platform
base_commit: 26fcf065a432bf9aa4da69ec29b7c7088b209482
worktree: /home/me/code/mc2/.worktrees/qdrant-q9-observability
write_zone:
  - docker-compose.infra.yml
  - docker-compose.app.yml monitoring mount/env for API only
  - docker-compose.production.yml monitoring mount/env for API/main/Stage6 only
  - .env.production.example monitoring paths
  - ops/qdrant/**
  - docs/operations/qdrant-self-hosted.md
  - packages/course-gen-platform/src/shared/qdrant/metrics-textfile.ts
  - packages/course-gen-platform/src/shared/qdrant/search-operations.ts fallback metrics hook
  - packages/course-gen-platform/tests/unit/ops/qdrant-observability-contract.test.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/{metrics-textfile,search-operations}.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.10.md
success_criteria:
  - Pin Prometheus 3.13.1, Grafana 12.4.5, node_exporter 1.12.0, and Alertmanager 0.33.1 by owner-approved index digest and verify the linux/amd64 child.
  - Scrape authenticated Qdrant main-listener metrics with a separately owned read-only credential and no Qdrant metrics_port.
  - Export restart-persistent application and recovery textfiles through a private textfile-only unprivileged node_exporter.
  - Validate two recording rules and eight exact alerts, including absent/stale recovery signals.
  - Provision secret-free Grafana datasource/dashboard, file-secret Alertmanager routing, loopback Web UIs, and an operator runbook.
selected_docs:
  - docs/superpowers/specs/2026-07-10-self-hosted-qdrant-platform-design.md monitoring and Task 9
  - docs/superpowers/plans/2026-07-10-self-hosted-qdrant-platform.md Task 9
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.14-docs.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.14-runtime.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.7.md
  - Prometheus 3.13.1, Alertmanager 0.33.1, node_exporter 1.12.0, Grafana, Qdrant 1.18.2 and Compose first-party documentation
selected_skills:
  - senior-devops
  - superpowers:test-driven-development
  - superpowers:systematic-debugging on failures
  - superpowers:verification-before-completion
selected_agents:
  - deploy/observability specialist
catalog_candidates:
  - none; installed skills and accepted owner packets covered this stream
parallel_group: Q9-observability-alongside-Q8
depends_on_streams:
  - mc2-jz6y0.7
  - mc2-jz6y0.14
parallel_decision: parallel
status: returned
delivery_method: merge
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: All disposable Qdrant/Prometheus/Grafana/Alertmanager/node_exporter containers, private networks, secret volumes, temporary files, and smoke data were removed. Implementation commit 8d5d39c7 is pushed; the dedicated review worktree/branch remains for orchestrator acceptance.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: Added the durable self-hosted Qdrant operator runbook and monitoring-only environment paths; Q10 still owns broad deployment-guide/Cloud-retirement reconciliation.
graph_reviewed: used
graph_review_notes: Read fresh parent Graphify report at integration 26fcf065 and ran a focused query for the production fallback location. Per orchestrator instruction, the ignored graph was not copied or refreshed in this child worktree.
verification:
  - TDD/static contract final focused suite: 33/33 passed
  - Prometheus 3.13.1 promtool check config/check rules/test rules: passed; 10 rules
  - Alertmanager 0.33.1 amtool production/test config and route selection: passed
  - Four Compose config validations with synthetic paths: passed
  - Registry index and linux/amd64 child verification for all four monitoring images: passed
  - Authenticated pinned Qdrant scrape and read-only capability smoke: passed 401/401/200/200/403 and up=1
  - Local firing/resolved Alertmanager delivery smoke: passed; external receiver not contacted
  - Grafana 12.4.5 provisioning/dashboard API smoke: passed health=200/dashboard=200/provisioned=true
  - node_exporter 1.12.0 textfile exposition smoke: passed
  - pnpm type-check: passed
  - pnpm build with synthetic required web env: passed
  - Security/public-binding/secret scans and git diff --check: passed
  - Artifact validator: passed
  - Process verification with artifact: passed
  - Pull/rebase against unchanged remote base and push of implementation commit 8d5d39c7: passed
changed_files:
  - .env.production.example
  - docker-compose.app.yml
  - docker-compose.infra.yml
  - docker-compose.production.yml
  - docs/operations/qdrant-self-hosted.md
  - ops/qdrant/alertmanager/alertmanager.yml
  - ops/qdrant/grafana/dashboards/qdrant.json
  - ops/qdrant/grafana/provisioning/alerting/.gitkeep
  - ops/qdrant/grafana/provisioning/dashboards/qdrant.yml
  - ops/qdrant/grafana/provisioning/datasources/prometheus.yml
  - ops/qdrant/grafana/provisioning/plugins/.gitkeep
  - ops/qdrant/image-lock.json
  - ops/qdrant/prometheus/alert-tests.yml
  - ops/qdrant/prometheus/alerts.yml
  - ops/qdrant/prometheus/prometheus.yml
  - ops/qdrant/tests/alertmanager-webhook.yml
  - ops/qdrant/tests/test-webhook-url
  - ops/qdrant/tests/webhook-sink.py
  - ops/qdrant/textfile/publish-metrics.sh
  - packages/course-gen-platform/src/shared/qdrant/metrics-textfile.ts
  - packages/course-gen-platform/src/shared/qdrant/search-operations.ts
  - packages/course-gen-platform/tests/unit/ops/qdrant-observability-contract.test.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/metrics-textfile.test.ts
  - packages/course-gen-platform/tests/unit/shared/qdrant/search-operations.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.10.md
explicit_defers:
  - Q8 owns the production snapshot/restore tools and systemd jobs that advance recovery gauges; Q9 provides and validates their atomic textfile transport and alerts.
  - Q10 owns broad deployment-guide, project-index, and retired Cloud documentation reconciliation.
  - Q12 retains all remote activation, real receiver test, secret creation/change, deployment, staging mutation, and live observation authority.
---

# Summary

Q9 implements the approved private monitoring stack and proves the whole safe-local signal path. Prometheus uses `http_headers.api-key.files` against `qdrant:6333/metrics?per_collection=true`; the Qdrant metrics-only listener remains absent. The local smoke kept the server's mode-0400 source separate while a root helper populated a UID-65534/mode-0400 Prometheus credential volume; Prometheus itself ran unprivileged. Unauthenticated and invalid metrics requests returned 401, the read-only key returned 200 for metrics/collections and 403 for mutation, and Prometheus reported `up{job="qdrant"}=1`.

Application fallback accounting is wired at the real `hybridSearchWithFallback` decision. Each API/main/Stage6 service and instance writes its own persistent `.prom` file; existing counters are read after restart, concurrent in-process updates are serialized, and a same-directory temporary file is atomically renamed. Metrics failure is observable in logs but cannot break search availability. Stage 7 has no metrics environment or mount.

Prometheus has two recording rules and exactly eight alerts. Runtime inspection of pinned Qdrant 1.18.2 verified the prefixed app, collection, snapshot, memory, REST status-labelled counter, and REST duration histogram names used by rules/dashboard. Missing snapshot/restore gauges intentionally alert. Alertmanager is single-node with clustering disabled and file-backed Telegram fields; a separate disposable loopback webhook fixture delivered both firing and resolved payloads without contacting the external receiver.

# Scope / Routing

The final write zone is the validated Q9 monitoring zone plus the orchestrator-approved narrow expansion for the actual fallback sink and API/main/Stage6 Compose mounts. Q8 snapshot tools/systemd, deployment scripts, Beads, handoff/summary/project-index, Stage 7, and all remote/Q12 state stayed outside the stream. Installed DevOps/TDD/debugging/verification skills and accepted `.14`/Q6 packets were sufficient; no catalog discovery or additional agent was needed.

# Verification

## TDD chronology and command totals

- Monitoring RED: the initial static contract failed 6/6 because all Q9 assets were absent. The first GREEN passed 23/23 joined tests; the final focused acceptance is 33/33 across four files.
- Application metrics RED: the new module import was absent and three decision-point assertions saw zero recorder calls. GREEN passed 17/17. A later dense-fallback failure RED observed two counter calls; the refactored decision boundary made it one and the joined suite passed 24/24.
- Command-shape RED: pinned Prometheus rejected `--web.enable-lifecycle=false` with `unexpected false`; a 1/7 static guard failed, the invalid non-default flag was removed, exact Compose args parsed, and 7/7 passed.
- Rule fixture diagnostic: REST ratio and p95 values were correct, while expected samples omitted the recording `__name__` and rounded the IEEE quantile. Corrected fixture then passed.
- Final command totals: 33 focused tests; 3 promtool commands; 2 production amtool checks plus 1 local test-config check; 4 Compose models; 4 registry index/child checks; 4 service/signal smokes; 2 workspace gates; 1 security/public/secret scan group; artifact/process/diff checks recorded below.

# Exact approved image locks

- Prometheus `3.13.1`: index `sha256:3c42b892cf723fa54d2f262c37a0e1f80aa8c8ddb1da7b9b0df9455a35a7f893`; linux/amd64 `sha256:bd2dcadfb0d1096e2a4c21817ac7af918e2f19ff628e4bf25fd67a924c13dd80`.
- Grafana `12.4.5`: index `sha256:26b8f35a9e4e4431995cf64c3f396505a4faf17bcfc19f9ed84943ec6bfd5ecd`; linux/amd64 `sha256:5e8dea6bf166881f31f370c16ba87a9eebe8ed33db7cce29ee6baf675d60676a`.
- node_exporter `1.12.0`: index `sha256:9b0ade5e607f9dbedb0a8e11151b6011ae5bd79304c261804cfdd2cadf200a80`; linux/amd64 `sha256:fb027a472051259b5b7cfd027fe9faf7f8ac5f5fb58af93a818a832f7a90fc57`.
- Alertmanager `0.33.1`: index `sha256:9e082985f56f4c8c9f724e18f2288c6708f472e56a5286b8863d080434ea065d`; linux/amd64 `sha256:a89f8d4520954079275441eecdb71444328bd90633dd4eddfc33b9ed657f349b`.

# First-party URLs consulted

- <https://github.com/prometheus/prometheus/blob/v3.13.1/docs/configuration/configuration.md>
- <https://github.com/prometheus/prometheus/releases/tag/v3.13.1>
- <https://prometheus.io/docs/introduction/release-cycle/>
- <https://github.com/prometheus/alertmanager/blob/v0.33.1/docs/configuration.md>
- <https://github.com/prometheus/node_exporter/blob/v1.12.0/README.md#textfile-collector>
- <https://grafana.com/docs/grafana/latest/administration/provisioning/>
- <https://grafana.com/docs/grafana/latest/setup-grafana/configure-docker/>
- <https://qdrant.tech/documentation/ops-monitoring/monitoring/>
- <https://qdrant.tech/documentation/operations/security/>
- <https://docs.docker.com/reference/compose-file/services/>
- <https://docs.docker.com/reference/compose-file/secrets/>

# Delivery / Cleanup

## Rollback state

No remote activation, external receiver call, deploy, service installation, secret mutation, staging operation, Q12 action, or non-loopback host publication occurred. Disposable containers/networks/volumes/temp files are gone. No rollback was needed. Implementation commit `8d5d39c7f2794d98c2a2e568cf116013faf75d67` is pushed on `origin/codex/qdrant-q9-observability`; the branch/worktree remain isolated for orchestrator review. Runtime rollback is documented as stopping monitoring services without deleting named volumes or touching Qdrant/its stable alias.

# Risks / Follow-ups / Explicit Defers

Real Telegram delivery remains intentionally untested because it is an external action and requires Q12 authority/runtime files. Q8 must connect its accepted snapshot/restore success path to the provided atomic gauges; absent gauges remain visible critical/warning failures until then. The fixed 2 GiB memory divisor is coupled to the enforced Q6 staging limit and must change atomically with that limit or be replaced by a real container-limit exporter.

docs-reviewed: updated — the new runbook documents secure access, secrets, validation, triage, recovery handoff, rollback, and source versions.

graph-reviewed: used — read-only parent graph report/query at fresh base `26fcf065`; child graph refresh was explicitly forbidden because ignored graph state was not copied.
