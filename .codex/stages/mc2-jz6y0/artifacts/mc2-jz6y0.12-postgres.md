---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.12
stage_id: mc2-jz6y0
agent_type: database verification worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Applied migrations, RLS, atomic decisions, recovery, and isolation require a disposable real-PostgreSQL gate.
repo: /home/me/code/mc2
branch: codex/q11-postgres
base_branch: codex/self-hosted-qdrant-platform
base_commit: 2717885ef1b0bd1babfddb1a7661868c9f2073a5
worktree: /home/me/code/mc2/.worktrees/q11-postgres
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.12-postgres.md
success_criteria:
  - Four applied PostgreSQL integration suites pass without skips.
  - The owned database, container, and loopback listener are absent after the run.
  - Exact versions, commands, totals, cleanup, documentation, graph, and Q12 state are recorded.
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.12-readiness.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.24-acceptance.md
selected_skills:
  - test-pass
  - systematic-debugging
  - verification-before-completion
selected_agents:
  - db migration specialist
  - correctness reviewer
catalog_candidates:
  - none - installed assets and repository contracts covered this verification stream
parallel_group: Q11-P
depends_on_streams:
  - none - executed alongside Q11-F and Q11-I on an isolated database and write zone
parallel_decision: parallel
status: accepted
delivery_method: merge
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: The database was force-dropped, the uniquely named container was removed, and the loopback port was verified closed. Pushed evidence commit ec68b8a5 merged as b946d22b; the dedicated worktree/local branch were removed and the remote evidence branch retained. No unrelated database, container, port, secret, or remote state was touched.
risk_level: high
docs_impact: tests-only
docs_reviewed: no-change-needed
docs_review_notes: This stream changed only its verification artifact; repository migration and operator documentation were used as accepted truth and required no edits.
graph_reviewed: no-change-needed
graph_review_notes: The isolated worktree has no tracked or generated Graphify graph, and this artifact-only stream changed no code, architecture, or durable workflow; the integration orchestrator owns the final local-only graph refresh.
verification:
  - pnpm install --frozen-lockfile: passed without lockfile changes
  - PostgreSQL 16.14-alpine disposable applied matrix: passed 4/4 files and 64/64 tests with zero skips
  - document-evidence-rls.test.ts: passed 9/9
  - document-conflict-auto-decisions-applied.test.ts: passed 26/26
  - document-conflict-side-identity-applied.test.ts: passed 8/8
  - document-evidence-observability-index.test.ts: passed 21/21
  - cleanup proof for database, container, and loopback port: passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.12-postgres.md
explicit_defers:
  - Q12 mc2-jz6y0.13 only - deploy, live reindex, service or secret changes, and all staging/production mutation remain authorization-gated.
---

# Summary

The Q11 applied database gate passed on a real, disposable PostgreSQL 16.14 server. All 64 tests ran without skips and covered evidence RLS and tenant isolation, immutable and atomic automatic decisions, stable side identity with rollback/reapply, and the observability index/totals migrations. No remote database or secret was used.

# Scope / Routing

The owned runtime was container `mc2-q11-postgres-20260712`, database `mc2_q11_document_evidence_test`, and host binding `127.0.0.1:15439 -> 5432/tcp`. The database name satisfied the repository `_test` guard and the host was loopback-only. The image was `postgres:16.14-alpine`, server version `16.14`, image ID `sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777`, and repository digest `postgres@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777`.

The applied scope comprised the base document-evidence migration and rollback (`20260711120000`), conflict automatic-answer migration and rollback (`20260711130000`), conflict side-identity migration and rollback (`20260711140000`), and observability index/totals migrations and rollbacks (`20260711150000` and `20260711151000`). Test-owned schemas and roles were created only inside the disposable database.

# Verification

Dependencies were installed with:

```bash
pnpm install --frozen-lockfile
```

The container was started with a synthetic password and a loopback-only port:

```bash
docker run -d --name mc2-q11-postgres-20260712 \
  -e POSTGRES_PASSWORD=postgres \
  -p 127.0.0.1:15439:5432 \
  --health-cmd='pg_isready -U postgres -d postgres' \
  --health-interval=1s --health-timeout=3s --health-retries=30 \
  postgres:16.14-alpine
docker exec mc2-q11-postgres-20260712 \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c 'CREATE DATABASE mc2_q11_document_evidence_test;'
```

From `packages/course-gen-platform`, the exact applied matrix was:

```bash
DOCUMENT_EVIDENCE_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:15439/mc2_q11_document_evidence_test \
  pnpm exec vitest run --config ../../vitest.shared.ts \
  --no-file-parallelism --maxWorkers=1 \
  tests/integration/document-evidence-rls.test.ts \
  tests/integration/document-conflict-auto-decisions-applied.test.ts \
  tests/integration/document-conflict-side-identity-applied.test.ts \
  tests/integration/document-evidence-observability-index.test.ts
```

Vitest 4.1.8 reported `4 passed (4)` files and `64 passed (64)` tests in 18.54 seconds, with zero failed and zero skipped tests. Per-file totals were 9 RLS/isolation, 26 automatic decisions, 8 side identity, and 21 observability/recovery tests.

# Delivery / Cleanup

The finally-equivalent cleanup ran even if the test command failed:

```bash
docker exec mc2-q11-postgres-20260712 \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c 'DROP DATABASE IF EXISTS mc2_q11_document_evidence_test WITH (FORCE);'
docker rm -f mc2-q11-postgres-20260712
```

The drop command returned `DROP DATABASE`; the remove command returned the exact owned container name. Fresh post-checks reported `CONTAINER_ABSENT=yes`, `CONTAINER_MATCH_COUNT=0`, and `PORT_ABSENT=yes` for TCP port 15439. Because the database storage existed only inside that removed disposable container after the explicit force-drop, neither the database nor its storage remains.

This branch returns an artifact-only change for orchestrator inspection and acceptance. No implementation, test, migration, configuration, Beads, handoff, staging, or production state changed.

# Risks / Follow-ups / Explicit Defers

No database defect or skipped coverage remains in this stream. The only defer is Q12: remote deployment, live reindex, service/secret changes, staging activation, and production mutation require the separately specified explicit current-task authorization.
