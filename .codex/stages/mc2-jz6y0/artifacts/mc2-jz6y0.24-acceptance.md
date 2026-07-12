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
status: accepted
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Historical E7 disposable resources were cleaned. The reviewed dev-activation branch was merged as ea183d83; its dedicated worktree and local branch were removed after the remote evidence branch was updated. No remote, staging, live, Q12, Qdrant Cloud, service, secret, or deployment state was changed.
risk_level: high
docs_reviewed: updated
docs_review_notes: Earlier E7 operator/product documentation passed independent review at 82831b6f with P0-P3 zero and was integrated at 756406a4. The combined 100% local/development activation checkpoint passed its final independent correctness/docs review with no P0-P3 findings and was accepted after integration reruns.
graph_reviewed: updated
graph_review_notes: Local-only Graphify 0.8.45 refresh after acceptance completed with 50469 nodes, 74909 edges and 3199 communities. The focused evidence query found the approved design plus Stage 4/5/6 and observability surfaces; no external model/API mode or Git hook was used.
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
  - Owner decision mc2-jz6y0.24.2 closed on 2026-07-12 with the exact active gate and a 100% local/development Stage 5 cohort; advisory signals and hard invariants are recorded in the approved dev activation design.
  - Dev activation contract at c50d8420 plus exact-value review fix ba27d573 passed 5/5 files and 24/24 tests; both dev workers and the package environment example use coherent exact values, while production/staging assets remain unactivated.
  - @megacampus/course-gen-platform type-check passed for the dev activation checkpoint; supported YAML/TypeScript files passed Prettier, the environment example passed dotenv exact-value parsing, and diff checks passed.
  - Final independent review of the combined activation/docs branch at d3417610 reported Ready to merge Yes with P0-P3 zero.
  - Reviewed branch merged at ea183d83; parent integration rerun passed 5/5 files and 24/24 tests, package type-check, process verification, and canonical stage closeout dry-run.
  - graphify update and graphify cluster-only --no-viz completed locally after acceptance; the report matched commit 677f35ee before this evidence-only record and is refreshed again after its commit.
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.24-acceptance.md
explicit_defers:
  - Q12 mc2-jz6y0.13 remains open and authorization-gated; no remote deployment, live reindex, service or secret change, staging mutation, or production mutation is authorized.
---

# Summary

The integrated E1-E7 implementation and its 100% local/development activation checkpoint are accepted across shared contracts, the material-conflict UI, durable PostgreSQL migrations and isolation, Stage 2/4/5/6 behavior, observability, and reviewed operator documentation. Courses without documents retain the baseline path; every document outcome remains explicit; automatic decisions are atomic and audited; Stage 5 remains non-destructive and advisory; Stage 6 consumes the same accepted decision/evidence contract.

The owner closed `mc2-jz6y0.24.2` on 2026-07-12 by approving the exact active gate and a 100% Stage 5 cohort for local/development. Development has no cohort-promotion step: cost, latency, false-conflict, degradation/failure and enrichment-quality signals are advisory, while coverage and baseline preservation remain 100% and tenant/course isolation violations plus unresolved P0/P1 findings remain zero. The checked-in dev values do not alter the fail-closed runtime parser or authorize staging/production.

The combined activation/docs checkpoint passed independent review at `d3417610`, merged as `ea183d83`, and passed the parent acceptance rerun. E7 is accepted locally. Q12 remains the separate authorization boundary for every remote mutation.

# Verification

The root focused Stage 2/4/5/6 run passed 28 files and 330 tests. An independent contract worker then passed the three shared-type suites with 23 tests and the three web conflict suites with 20 tests. The later dev activation contract passed 5/5 files and 24/24 tests at `c50d8420` plus exact-value review fix `ba27d573`; it proves coherent exact values for both dev workers and the package environment example and proves staging/production non-activation. An independent database worker used the loopback-only disposable database `mc2_e7_db_verify_20260712_v2_test` with:

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

The owner decision and E7 acceptance are resolved. Q10 documentation reconciliation is next, followed by the complete Q11 verification matrix. Q12 remains authorization-gated.

Q12 remains a separate hard authorization boundary. Before any remote action, the orchestrator must present exact staging actions, external effects, secret requirements, observation, rollback, and expected downtime/data effects and obtain explicit current-task authorization.
