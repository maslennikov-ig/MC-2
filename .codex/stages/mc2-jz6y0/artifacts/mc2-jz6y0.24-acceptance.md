---
schema_version: orchestration-artifact/v1
artifact_type: orchestrator-acceptance
task_id: mc2-jz6y0.24
stage_id: mc2-jz6y0
repo: /home/me/code/mc2
branch: codex/self-hosted-qdrant-platform
base_branch: origin/codex/self-hosted-qdrant-platform
base_commit: 9284529a68bbf140f7cf41213e7e1b28e42a19f4
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
status: blocked
delivery_method: n/a
accepted_by_orchestrator: yes
cleanup_status: not_applicable
cleanup_notes: All disposable PostgreSQL databases were dropped with FORCE; Graphify output remains ignored local state; no remote, staging, live, Q12, Qdrant Cloud, service, secret, or deployment state was changed.
risk_level: high
docs_reviewed: updated
docs_review_notes: E7 operator/product documentation passed independent review at 82831b6f with P0-P3 zero and was integrated at 756406a4; only the owner rollout decision remains intentionally unresolved.
graph_reviewed: updated
graph_review_notes: graphify 0.8.45 local-only update and cluster-only completed against the committed integration state with 50438 nodes and 74881 edges; no external model/API mode or Graphify git hook was used.
verification:
  - Focused course-gen Stage 2/4/5/6 evidence and retrieval gate passed 28/28 files and 330/330 tests.
  - Shared document-evidence and clarifying contracts passed 3/3 files and 23/23 tests with zero skips.
  - Web material-conflict unit/component gate passed 3/3 files and 20/20 tests with zero skips; four jsdom scrollTo diagnostics were non-blocking.
  - PostgreSQL 16.14 applied migration, recovery, isolation, automatic-decision, side-identity, and observability gate passed 4/4 files and 64/64 tests.
  - E7 observability focused integration passed 122/122; the independent implementation review passed at 7a7d54ae with P0-P3 zero.
  - Prometheus 3.13.1 LTS pinned promtool config, rule, and rule-test gates passed with 14 rules.
  - Workspace pnpm type-check passed after a clean ignored-cache rebuild.
  - E7 docs independent review passed at 82831b6f with P0-P3 zero; Prettier, artifact validation, and diff checks passed.
  - graphify update and graphify cluster-only --no-viz passed; focused document-evidence query found the approved design and Stage 4/5/6 graph surfaces.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.24-acceptance.md
explicit_defers:
  - mc2-jz6y0.24.2 remains the product-truth boundary for exact Stage 5 cohort, numeric promotion thresholds, measurement windows, accountable owners, and rollback contacts; the implementation fails closed at a zero-percent cohort until an owner decision exists.
  - Q12 mc2-jz6y0.13 remains open and authorization-gated; no remote deployment, live reindex, service or secret change, staging mutation, or production mutation is authorized.
---

# Summary

The integrated E1-E7 implementation is locally accepted across shared contracts, the material-conflict UI, durable PostgreSQL migrations and isolation, Stage 2/4/5/6 behavior, observability, and reviewed operator documentation. Courses without documents retain the baseline path; every document outcome remains explicit; automatic decisions are atomic and audited; Stage 5 remains non-destructive and advisory; Stage 6 consumes the same accepted decision/evidence contract.

The local engineering implementation is complete enough to remain safely disabled. E7 cannot close only because the repository contains no approved product source for a live Stage 5 cohort, numeric cost/latency/false-conflict/degradation/quality thresholds, their measurement windows, accountable owners, or rollback contacts. The zero-percent fail-closed default prevents accidental activation.

# Verification

The root focused Stage 2/4/5/6 run passed 28 files and 330 tests. An independent contract worker then passed the three shared-type suites with 23 tests and the three web conflict suites with 20 tests. An independent database worker used the loopback-only disposable database `mc2_e7_db_verify_20260712_v2_test` with:

```bash
DOCUMENT_EVIDENCE_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mc2_e7_db_verify_20260712_v2_test \
  pnpm exec vitest run --config ../../vitest.shared.ts \
  --no-file-parallelism --maxWorkers=1 \
  tests/integration/document-evidence-rls.test.ts \
  tests/integration/document-conflict-auto-decisions-applied.test.ts \
  tests/integration/document-conflict-side-identity-applied.test.ts \
  tests/integration/document-evidence-observability-index.test.ts
```

That gate passed 64 tests: E1 RLS/isolation 9, E3 automatic decisions 26, E6 side identity 8, and observability/recovery 21. The database was removed with `DROP DATABASE ... WITH (FORCE)` and a post-check reported `CLEANUP_DB_REMAINING=0`.

The local Graphify refresh used version 0.8.45 and only `graphify update .`, `graphify cluster-only . --no-viz`, and a focused query. The final report is required to match the committed integration HEAD; the post-acceptance refresh contains 50,438 nodes and 74,881 edges, with communities regenerated by the local clustering pass. `graphify-out/` is ignored, and scans found no `.worktrees/`, `.claude/`, `node_modules/`, or `graphify-out/` source entries.

# Risks / Follow-ups

The remaining blocker is not code or infrastructure: it is an absent product/operational decision. The safe recommendation is to explicitly defer activation, retain the Stage 5 cohort at 0%, and continue Q10/Q11 local documentation and acceptance. If activation is desired instead, the owner must provide the exact cohort percentage, numeric thresholds and windows for cost, latency, false material conflicts, degradation/failure, and enrichment quality, plus named owners and rollback contacts.

Q12 remains a separate hard authorization boundary. Before any remote action, the orchestrator must present exact staging actions, external effects, secret requirements, observation, rollback, and expected downtime/data effects and obtain explicit current-task authorization.
