---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0
stage_id: mc2-jz6y0
agent_type: database verification worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: Final applied migrations, RLS, atomic decisions, rollback/reapply, and isolation require a disposable real-PostgreSQL gate.
repo: /home/me/code/mc2
branch: codex/q12-final-postgres
base_branch: codex/self-hosted-qdrant-platform
base_commit: e033465ea1c3e6cbf9177ab95ad72ffec7987bb3
worktree: /home/me/code/mc2/.worktrees/q12-final-postgres
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-final-postgres.md
success_criteria:
  - The exact four-file serial PostgreSQL matrix passes with zero skips.
  - The owned database is force-dropped and only the uniquely named container is removed.
  - Container and loopback-port post-check counts are zero.
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.12-postgres.md
selected_skills:
  - test-pass
  - systematic-debugging
  - verification-before-completion
selected_agents:
  - db_migration_specialist
catalog_candidates:
  - none - pinned repository migration and test contracts covered this stream
parallel_group: q12-final-verification
depends_on_streams:
  - final integration head e033465e
parallel_decision: parallel - disposable database and artifact-only write zone are isolated
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Evidence was integrated and the dedicated worktree/local branch removed. The owned database, container, and listener are absent; final exact counts are zero.
risk_level: high
docs_impact: tests-only
docs_reviewed: no-change-needed
docs_review_notes: The stream changed only final verification evidence and used the pinned repository migration/test contracts as authoritative truth.
graph_reviewed: no-change-needed
graph_review_notes: This test-only evidence changes no code, architecture, documentation, or durable workflow; no Graphify refresh is warranted.
verification:
  - pnpm install --frozen-lockfile: passed without tracked changes
  - PostgreSQL 16.14-alpine pinned-digest matrix: passed 4/4 files and 78/78 tests with zero skips
  - document-evidence-rls.test.ts: passed 9/9
  - document-conflict-auto-decisions-applied.test.ts: passed 40/40
  - document-conflict-side-identity-applied.test.ts: passed 8/8
  - document-evidence-observability-index.test.ts: passed 21/21
  - owned database force-drop and container removal: passed
  - container count, running-container count, and port-listener count: all zero
  - artifact schema validation: passed
  - Prettier artifact check: passed
  - git diff check and one-file write-zone inspection: passed
  - process verification: passed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-final-postgres.md
explicit_defers:
  - Remote deployment, live reindex, service or secret changes, and staging/production mutation are outside this local-only stream.
---

# Summary

The final PostgreSQL gate on integration head `e033465e` passed against a real,
disposable PostgreSQL 16.14 server. The exact four-file serial matrix ran all
78 tests with zero failures and zero skips, covering applied migrations, tenant
RLS/isolation, atomic automatic decisions, side identity, rollback/reapply, and
the evidence observability index. No existing database, remote service, secret,
SSH target, staging environment, or production environment was accessed.

# Verification

The owned runtime was container `mc2-q12-final-postgres-20260713`, test-guarded
database `mc2_q12_final_document_evidence_test`, and loopback-only binding
`127.0.0.1:15449 -> 5432/tcp`. The image was started by immutable repository
digest:

```text
postgres@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777
```

The server reported `postgres (PostgreSQL) 16.14`; Docker reported the same
digest as both the configured image and image ID. Dependencies were prepared
without lockfile or tracked-file changes:

```bash
pnpm install --frozen-lockfile
```

The exact disposable runtime and test command were:

```bash
docker run -d --name mc2-q12-final-postgres-20260713 \
  -e POSTGRES_PASSWORD=postgres \
  -p 127.0.0.1:15449:5432 \
  --health-cmd='pg_isready -U postgres -d postgres' \
  --health-interval=1s --health-timeout=3s --health-retries=30 \
  postgres@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777
docker exec mc2-q12-final-postgres-20260713 \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c 'CREATE DATABASE mc2_q12_final_document_evidence_test;'

cd packages/course-gen-platform
DOCUMENT_EVIDENCE_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:15449/mc2_q12_final_document_evidence_test \
  pnpm exec vitest run --config ../../vitest.shared.ts \
  --no-file-parallelism --maxWorkers=1 \
  tests/integration/document-evidence-rls.test.ts \
  tests/integration/document-conflict-auto-decisions-applied.test.ts \
  tests/integration/document-conflict-side-identity-applied.test.ts \
  tests/integration/document-evidence-observability-index.test.ts
```

Vitest 4.1.8 reported `4 passed (4)` files and `78 passed (78)` tests in
22.71 seconds. Per-file totals were `9/9` RLS/isolation, `40/40` applied atomic
automatic decisions, `8/8` applied side identity, and `21/21` observability,
rollback, reapply, and recovery checks. No test was skipped.

The first preflight attempt stopped before any test because this newly created
worktree had no installed `node_modules`, and `pnpm exec vitest` returned
`EACCES`. The finally-equivalent trap still force-dropped the owned database and
removed the owned container. After the repository-prescribed frozen install,
the full clean matrix above was rerun from container creation and passed; no
partial result from the preflight was counted.

Cleanup was finally-equivalent and scoped to the owned database and container:

```bash
docker exec mc2-q12-final-postgres-20260713 \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c 'DROP DATABASE IF EXISTS mc2_q12_final_document_evidence_test WITH (FORCE);'
docker rm -f mc2-q12-final-postgres-20260713
```

The successful run returned `DROP DATABASE` and the exact owned container name.
Fresh post-checks returned:

```text
CONTAINER_MATCH_COUNT=0
RUNNING_CONTAINER_MATCH_COUNT=0
PORT_LISTENER_COUNT=0
CONTAINER_ABSENT=yes
PORT_ABSENT=yes
```

Because the database storage existed only in the removed disposable container
after its explicit force-drop, no owned database state remains.

# Risks / Follow-ups

No PostgreSQL migration, RLS, isolation, atomic-decision, side-identity,
rollback/reapply, or observability defect was found, and no coverage was
skipped. The remaining remote activation boundary is outside this evidence-only
stream. `docs-reviewed: no-change-needed`; `graph-reviewed: no-change-needed`.
