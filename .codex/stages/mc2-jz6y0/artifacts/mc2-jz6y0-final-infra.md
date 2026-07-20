---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0
stage_id: mc2-jz6y0
agent_type: deploy_specialist_infra_verifier
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Exact-version multilingual retrieval, local recovery, Compose and monitoring pins are release-critical infrastructure gates.
repo: /home/me/code/mc2
branch: codex/q12-final-infra
base_branch: codex/self-hosted-qdrant-platform
base_commit: e033465ea1c3e6cbf9177ab95ad72ffec7987bb3
worktree: /home/me/code/mc2/.worktrees/q12-final-infra
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-final-infra.md
success_criteria:
  - Fresh exact-pin Qdrant retrieval, Compose, local recovery and monitoring validation on e033465e.
  - Pre/post empty Qdrant collections and aliases, then complete owned-resource cleanup.
selected_docs:
  - Existing accepted image ledgers and mc2-jz6y0.12-infra.md; no new lookup needed.
selected_skills:
  - senior-devops
  - test-pass
  - verification-before-completion
selected_agents:
  - deploy_specialist/infra verifier
catalog_candidates:
  - none; installed skills covered the bounded verification stream.
parallel_group: q12-final-gates
depends_on_streams:
  - final integration SHA e033465e
parallel_decision: parallel
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Evidence was integrated and the dedicated worktree/local branch removed. Removed only mc2-q12-final-qdrant-20260713 with -v; exact owned container, port, temp-directory, volume and network matches are all zero.
risk_level: high
docs_impact: tests-only
docs_reviewed: no-change-needed
docs_review_notes: This stream only records fresh final evidence for already accepted deployment and recovery contracts.
graph_reviewed: used
graph_review_notes: Read the local GRAPH_REPORT for orientation; artifact-only verification does not change architecture and requires no child refresh.
verification:
  - pnpm install --frozen-lockfile: passed; lockfile unchanged.
  - Shared logger/types/utils build prerequisite: passed.
  - Exact Qdrant index and linux/amd64 child manifest inspection: passed.
  - Qdrant two-file integration: 2 files, 15/15 passed.
  - Qdrant runtime/Compose contract: 1 file, 8/8 passed.
  - Local Qdrant recovery: 1 file, 5 passed and 2 managed-recreate-only skipped.
  - Prometheus 3.13.1 promtool config/rules/rule-tests: passed; 14 rules.
  - Alertmanager 0.33.1 amtool check-config: passed; 1 receiver, 0 inhibit rules, 0 templates.
  - Final owned-resource and listener scan: six zeroes.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-final-infra.md
explicit_defers:
  - External S3 remains deferred; this drill used Qdrant local snapshot storage only.
  - No Cloud, notification, database, secret, service, source, staging or production action was attempted.
---

# Summary

Fresh final infrastructure evidence passed on integration commit `e033465e`. The real
Qdrant gate used the immutable `qdrant/qdrant:v1.18.2` index digest
`sha256:75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c`.
Registry inspection selected the ledger-locked `linux/amd64` child
`sha256:da65a06bc75e42702f80c992b99c5144b0fbd675ae7a96d2991de0bf957b7071`.
The owned container `mc2-q12-final-qdrant-20260713` published only
`127.0.0.1:16433`, used the synthetic key `mc2-q12-final-synthetic-key`, and
started with empty authenticated collection and alias lists.

The two real-Qdrant files passed 15/15. Their actual coverage includes physical
schema/alias creation, required payload indexes and strict mode, deterministic
point IDs and complete priority metadata, empty/batched upload behavior, native
Russian and English BM25, dense+sparse RRF, post-RRF Formula priority, document
grouping/diversity, dense top-K ordering, tenant/course isolation, course-scoped
deletion, snapshot create/list/delete, and final collection cleanup.

The current recovery suite contains seven declarations, two of which require its
separate managed-container replacement mode. The requested local-storage matrix
therefore reported `5 passed | 2 skipped`: durable create/list/download/checksum,
restore plus alias and dense/RU/EN/Formula verification, intentional identity
mismatch, wrong-key/corrupt-checksum rejection, duplicate-target protection,
stable-alias isolation and owned cleanup. It used Qdrant's own credential-free
internal transport origin `http://127.0.0.1:6333`; the host client remained on
the unique owned port `16433`. No external S3 was used.

# Exact pins

`docker buildx imagetools inspect --raw` confirmed every ledger's
`linux/amd64` child without pulling a mutable tag:

| Component            | Index pin                                                                 | linux/amd64 child                                                         |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Qdrant 1.18.2        | `sha256:75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c` | `sha256:da65a06bc75e42702f80c992b99c5144b0fbd675ae7a96d2991de0bf957b7071` |
| Prometheus 3.13.1    | `sha256:3c42b892cf723fa54d2f262c37a0e1f80aa8c8ddb1da7b9b0df9455a35a7f893` | `sha256:bd2dcadfb0d1096e2a4c21817ac7af918e2f19ff628e4bf25fd67a924c13dd80` |
| Grafana 12.4.5       | `sha256:26b8f35a9e4e4431995cf64c3f396505a4faf17bcfc19f9ed84943ec6bfd5ecd` | `sha256:5e8dea6bf166881f31f370c16ba87a9eebe8ed33db7cce29ee6baf675d60676a` |
| node_exporter 1.12.0 | `sha256:9b0ade5e607f9dbedb0a8e11151b6011ae5bd79304c261804cfdd2cadf200a80` | `sha256:fb027a472051259b5b7cfd027fe9faf7f8ac5f5fb58af93a818a832f7a90fc57` |
| Alertmanager 0.33.1  | `sha256:9e082985f56f4c8c9f724e18f2288c6708f472e56a5286b8863d080434ea065d` | `sha256:a89f8d4520954079275441eecdb71444328bd90633dd4eddfc33b9ed657f349b` |

# Verification

```bash
pnpm install --frozen-lockfile
pnpm --filter @megacampus/shared-logger --filter @megacampus/shared-types \
  --filter @megacampus/shared-utils build

docker run -d --name mc2-q12-final-qdrant-20260713 --platform linux/amd64 \
  -p 127.0.0.1:16433:6333 \
  -e QDRANT__SERVICE__API_KEY=mc2-q12-final-synthetic-key \
  qdrant/qdrant:v1.18.2@sha256:75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c

QDRANT_URL=http://127.0.0.1:16433 \
QDRANT_API_KEY=mc2-q12-final-synthetic-key \
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.integration-ci.ts \
  tests/integration/ci-qdrant-smoke.test.ts tests/integration/qdrant.test.ts
# 2 files, 15/15 passed

SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_KEY=mc2-q12-final-placeholder \
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts tests/unit/ops/qdrant-runtime-contract.test.ts
# 1 file, 8/8 passed; all four full and --no-env-resolution Compose renders passed

QDRANT_URL=http://127.0.0.1:16433 \
QDRANT_API_KEY=mc2-q12-final-synthetic-key \
QDRANT_SNAPSHOT_TRANSPORT_URL=http://127.0.0.1:6333 \
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config tests/integration/qdrant-recovery.vitest.config.ts
# 1 file, 5 passed, 2 managed-recreate-only skipped

docker run --rm --platform linux/amd64 --entrypoint /bin/promtool \
  -v "$PWD/ops/qdrant/prometheus:/etc/prometheus:ro" \
  prom/prometheus:v3.13.1@sha256:3c42b892cf723fa54d2f262c37a0e1f80aa8c8ddb1da7b9b0df9455a35a7f893 \
  check config /etc/prometheus/prometheus.yml
# SUCCESS: config valid; 14 rules found

docker run --rm --platform linux/amd64 --entrypoint /bin/promtool \
  -v "$PWD/ops/qdrant/prometheus:/etc/prometheus:ro" \
  prom/prometheus:v3.13.1@sha256:3c42b892cf723fa54d2f262c37a0e1f80aa8c8ddb1da7b9b0df9455a35a7f893 \
  check rules /etc/prometheus/alerts.yml
# SUCCESS: 14 rules found

docker run --rm --name mc2-q12-final-promtool-rules-20260713 \
  --platform linux/amd64 --entrypoint /bin/promtool \
  -v "$PWD/ops/qdrant/prometheus:/etc/prometheus:ro" \
  prom/prometheus:v3.13.1@sha256:3c42b892cf723fa54d2f262c37a0e1f80aa8c8ddb1da7b9b0df9455a35a7f893 \
  test rules /etc/prometheus/alert-tests.yml
# SUCCESS

docker run --rm --platform linux/amd64 --entrypoint /bin/amtool \
  -v "$PWD/ops/qdrant/alertmanager:/etc/alertmanager:ro" \
  prom/alertmanager:v0.33.1@sha256:9e082985f56f4c8c9f724e18f2288c6708f472e56a5286b8863d080434ea065d \
  check-config /etc/alertmanager/alertmanager.yml
# SUCCESS: 1 receiver, 0 inhibit rules, 0 templates
```

The prior Q11 command was stale on this SHA because it omitted the now-required
`QDRANT_SNAPSHOT_TRANSPORT_URL`; that diagnostic run failed before tests. A
second diagnostic used the host-published `16433` as the server-side transport
and correctly failed two restore calls with Qdrant HTTP 500. The accepted fresh
command above uses the local Qdrant server's own internal origin `6333` and
passed 5/5. This was an in-scope command correction only; no assertion or
runtime behavior changed.

# Cleanup and rollback

Immediately before removal, authenticated `/collections` and `/aliases` again
returned empty lists. `docker inspect` showed no owned mounts. The only durable
test container was removed with:

```bash
docker rm -f -v mc2-q12-final-qdrant-20260713
```

The final scan returned six zeroes: exact Qdrant container matches, exact named
promtool container matches, listeners on `127.0.0.1:16433`,
`/tmp/mc2-qdrant-recovery-integration-*` directories, `mc2-q12-final` volumes,
and `mc2-q12-final` networks. No unrelated container or port was changed. No
rollback was required because all effects were disposable and local.

docs-reviewed: no-change-needed — existing accepted docs already define these pins and local-storage recovery; this child adds evidence only.

graph-reviewed: used — local report was read for orientation; artifact-only evidence does not require a graph refresh.

# Risks / Follow-ups / Explicit Defers

No local infrastructure gate is blocked. External S3 remains intentionally
deferred. Staging activation, database backup/restore, service or secret
installation, source recovery/reindex, notification delivery and observation
remain outside this bounded local stream.
