---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.12
stage_id: mc2-jz6y0
agent_type: orchestrator_infra_verifier
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Pinned multilingual retrieval, strict Formula ranking, recovery, Compose, monitoring tools and complete cleanup are release-critical.
repo: /home/me/code/mc2
branch: codex/q11-infra
base_branch: codex/self-hosted-qdrant-platform
base_commit: 2717885e730a675cc5b4d55fcae7fcc81591bca6
worktree: /home/me/code/mc2/.worktrees/q11-infra
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: The uniquely owned Qdrant container mc2-q11-qdrant-20260712 was removed after authenticated empty collection and alias checks. Container matches and loopback port 16333 listeners are both zero; recovery temporary directories are absent. Promtool/amtool containers used --rm. No network, volume, Cloud, S3, notification, staging or production state was created.
risk_level: high
docs_impact: tests-only
docs_reviewed: no-change-needed
docs_review_notes: Q10 already reconciled the pinned retrieval/recovery/monitoring/operator contract; this stream only verifies it and creates acceptance evidence.
graph_reviewed: used
graph_review_notes: The parent local-only graph at integration base 2717885e was current and already queried for the canonical Qdrant runbook. This tests-only stream made no architecture or durable workflow change and did not refresh ignored graph state.
verification:
  - pnpm install --frozen-lockfile passed; the first integration attempt stopped before Qdrant test collection because isolated-worktree shared package dist outputs were absent.
  - Built @megacampus/shared-logger, @megacampus/shared-types and @megacampus/shared-utils; the unchanged integration command then passed.
  - Exact-digest Qdrant 1.18.2 integration passed the Qdrant-specific 19/19 gate across native RU/EN BM25, dense+sparse RRF, Formula, grouping, strict mode, snapshots, upload payload/batching and isolation. The full configured command reported 23 passed and 17 expected skips because it also collected 4 active observability/schema tests.
  - Qdrant runtime contract passed 8/8 and rendered all four full/no-env Compose models, including private bindings, exact pins and static S3 mapping.
  - Exact-version local snapshot/restore integration passed 5/5, including streamed checksum, dense/RU/EN/Formula relevance, tenant/course isolation, stable-alias preservation, intentional mismatch, wrong-key/corrupt-checksum, duplicate-target and cleanup cases.
  - Prometheus 3.13.1 exact-digest promtool check config, check rules and test rules passed with 14 rules.
  - Alertmanager 0.33.1 exact-digest amtool check-config passed with one receiver and zero inhibit/template rules.
  - Pre-test and post-test authenticated collection lists were empty; the final alias list was empty.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.12-infra.md
explicit_defers:
  - Real off-host S3 snapshot/restore, real notification delivery, deployment, service/secret changes, live reindex, alias cutover and every staging/production mutation remain Q12 authorization-gated.
---

# Summary

The Q11 local infrastructure matrix passed on integration code `2717885e` with the exact Qdrant `1.18.2` index digest `sha256:75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c`, platform `linux/amd64`, approved child lock `sha256:da65a06bc75e42702f80c992b99c5144b0fbd675ae7a96d2991de0bf957b7071`, and synthetic key `test-qdrant-key` on loopback port `16333`. Qdrant-specific coverage is 19/19; the configured CI command additionally ran four active observability/schema tests for 23 passed and 17 expected database-dependent skips.

Compose validation passed 8/8. Local recovery passed 5/5 against the same exact server version and used Qdrant local snapshot storage only; the S3 mapping was validated statically. Pinned promtool/amtool validation passed, with 14 Prometheus rules. No relevance, strict-mode, restore, cleanup or isolation assertion was weakened.

# Verification

```bash
docker run -d --name mc2-q11-qdrant-20260712 --platform linux/amd64 \
  -p 127.0.0.1:16333:6333 \
  -e QDRANT__SERVICE__API_KEY=test-qdrant-key \
  qdrant/qdrant:v1.18.2@sha256:75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c

QDRANT_URL=http://127.0.0.1:16333 QDRANT_API_KEY=test-qdrant-key \
  pnpm --filter @megacampus/course-gen-platform test:integration:ci

SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=q11-test-service-key \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts tests/unit/ops/qdrant-runtime-contract.test.ts

QDRANT_URL=http://127.0.0.1:16333 QDRANT_API_KEY=test-qdrant-key \
  pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config tests/integration/qdrant-recovery.vitest.config.ts
```

Promtool used `prom/prometheus:v3.13.1@sha256:3c42b892cf723fa54d2f262c37a0e1f80aa8c8ddb1da7b9b0df9455a35a7f893` for `check config`, `check rules` and `test rules`. Amtool used `prom/alertmanager:v0.33.1@sha256:9e082985f56f4c8c9f724e18f2288c6708f472e56a5286b8863d080434ea065d` for `check-config`.

# Cleanup and rollback

Before removal, authenticated `/collections` and `/aliases` both returned empty lists. After `docker rm -f mc2-q11-qdrant-20260712`, exact container matches were `0`, listeners on `127.0.0.1:16333` were `0`, and no `mc2-qdrant-recovery-integration-*` directory remained under `/tmp`. No rollback was required because all effects were disposable and local.

docs-reviewed: no-change-needed - Q10 already owns the durable current documentation; Q11-I adds only test evidence.

graph-reviewed: used - parent graph/readiness truth was current; no refresh is needed for an artifact-only child until final parent closeout.

# Risks / Follow-ups

No local infrastructure blocker remains. The only operational follow-up is Q12, which retains authority for real off-host S3, notifications, deployment, services, secrets, live reindex, alias cutover and staging/production observation.
