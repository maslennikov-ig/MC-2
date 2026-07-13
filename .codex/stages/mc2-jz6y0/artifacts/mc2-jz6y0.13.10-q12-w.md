---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.10
stage_id: mc2-jz6y0
agent_type: writer-barrier-worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: fail-closed PostgreSQL and Compose cutover behavior spans durable receipts, exact writer identity, crash recovery, and production trust boundaries
repo: mc2
branch: codex/q12-w-writer-barrier
base_branch: codex/q12-g7-backup-restore
base_commit: dfdcdcc7d6dafe6094eb469cedd929ed0904cb92
worktree: /home/me/code/mc2/.worktrees/q12-w-writer-barrier
write_zone:
  - deploy/qdrant/source-recovery-run.sh
  - deploy/qdrant/q12-writer-resume.py
  - deploy/qdrant/q12-database-barrier.sh
  - deploy/qdrant/q12-structural-catalog.sql
  - packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh
  - packages/course-gen-platform/tools/qdrant/source-recovery-database.ts
  - packages/course-gen-platform/tools/qdrant/source-recovery-reindex-adapters.ts
  - packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts
  - focused unit tests and this artifact
selected_docs:
  - Q12 live-cutover base design SHA-256 5d575bf8424dbd9b94eb79bc5e477c3152327b70593dae811c876c3c222d5c15
  - Q12 normative lifecycle addendum SHA-256 7188d792af79ec881c16ef0729394e5c1f5c2c67aa6d59b86bec1bdf91308b27 (final normative pass; P0=P1=P2=P3=0)
  - PostgreSQL 17 system catalog overview - https://www.postgresql.org/docs/17/catalogs-overview.html
  - PostgreSQL 17 event trigger behavior - https://www.postgresql.org/docs/17/event-trigger-matrix.html
  - PostgreSQL 17 acldefault object codes - https://www.postgresql.org/docs/17/functions-info.html
  - PostgreSQL 17 CREATE TRANSFORM - https://www.postgresql.org/docs/17/sql-createtransform.html
  - PostgreSQL 17 COMMENT - https://www.postgresql.org/docs/17/sql-comment.html
  - PostgreSQL 17 SECURITY LABEL - https://www.postgresql.org/docs/17/sql-security-label.html
  - Supabase Event Triggers - https://supabase.com/docs/guides/database/postgres/event-triggers
  - Supautils privileged-role behavior - https://github.com/supabase/supautils
selected_skills:
  - senior-devops
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
selected_agents:
  - writer-barrier worker
catalog_candidates:
  - none - installed DevOps, debugging, TDD, and verification assets cover the bounded stream
parallel_decision: sequential - the database barrier, immutable artifacts, and writer lifecycle share one fail-closed state machine and exact test fixture
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: root must independently inspect the diff and evidence before integration; do not remove this worktree before acceptance
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: this artifact now records the final approved lifecycle contract and exact design hashes; root owns consolidated runbook/addendum review at integration
graph_reviewed: blocked
graph_review_notes: graphify-out/GRAPH_REPORT.md is absent from this isolated worktree; root must query/refresh the local graph after accepted integration
verification:
  - focused barrier/runtime/database/adapters/reindex aggregate passed 241 of 241 with zero failures
  - complete source-recovery runtime passed 108 of 108, including exact environment and FD isolation, canonical journal chain/pairs, forward, rollback 0/3/5, compensation, signal, crash, recovery epoch, atomic terminal publication, exact-14 terminal receipt, and non-resume epoch rejection
  - opt-in stock PostgreSQL 17 fixture passed 34 of 34 including fresh-session default read-only and explicit primary READ WRITE proof
  - course-gen-platform type-check passed with shared-logger, shared-types, and shared-utils prerequisite builds
  - Prettier check passed every changed TypeScript test/tool file
  - bash syntax passed source-recovery-run.sh, q12-database-barrier.sh, and the Qdrant operator entrypoint
  - structural catalog remained one semicolon-free query and executed in the real PostgreSQL fixture
  - git diff --check passed; no synthetic resume process or Q12 test container remained
changed_files:
  - deploy/qdrant/source-recovery-run.sh
  - deploy/qdrant/q12-writer-resume.py
  - deploy/qdrant/q12-database-barrier.sh
  - deploy/qdrant/q12-structural-catalog.sql
  - packages/course-gen-platform/docker/qdrant-operator/entrypoint.sh
  - packages/course-gen-platform/tools/qdrant/source-recovery-database.ts
  - packages/course-gen-platform/tools/qdrant/source-recovery-reindex-adapters.ts
  - packages/course-gen-platform/tools/qdrant/reindex-course-embeddings.ts
  - packages/course-gen-platform/tests/unit/tools/qdrant/source-recovery-database.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-database-barrier.test.ts
  - packages/course-gen-platform/tests/unit/ops/q12-structural-catalog-pg17.test.ts
  - packages/course-gen-platform/tests/unit/ops/qdrant-source-recovery-runtime.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.10-q12-w.md
explicit_defers:
  - independent correctness and docs review, integration, canonical graph refresh, and stage-wide gates remain root-owned
  - no live database, Supabase, Docker service, Qdrant, staging, production, credential, or remote mutation was performed
---

# Summary

The W delta implements the approved local writer/database lifecycle without any
remote activation. `barrier.prepare-recovery` publishes
`recovery_ready_guarded` only from the exact final verified migration receipt.
The frozen writer commands are `writers.resume.forward` and
`writers.resume.rollback`, exposed only as:

```text
/opt/megacampus/deploy/qdrant/source-recovery-run.sh \
  --operation resume-writers-only \
  --resume-mode forward|rollback \
  --run-id <run-id>
```

The external resume controller accepts no path, database, CA, capability,
Qdrant, or generic environment argument. The shell launches it with exactly
`PATH`, `LC_ALL=C`, `LANG=C`, `HOME=/root`, and
`Q12_EXTERNAL_QUIESCE_LEASE_FD=9`; stdin is `/dev/null`; and the only inherited
descriptors are 0, 1, 2, and the held canonical cutover lease on FD 9. It
requires the fixed run root, exact owner/mode, exact artifact schemas and
hashes, the exact Docker identities, and a
`cutover|cutover-recovery-N` resume epoch. It rejects
`postcutover_schedule` and `credential_rotation` because those epochs belong
only to their later phase mappings.

Before Docker inspection, the controller validates the complete canonical
journal from sequence 1 through the current checkpoint: exact 19-key entries,
canonical UTF-8 JSONL encoding, safe integers, previous-hash continuity, and
recomputed entry hashes. The final manifest, handoff/rollback state, and resume
authority each require their own immediately adjacent intent/accepted
publication pair with the exact accepted object kind and digest. The current
head must remain an unaccepted `resume_committing_forward|rollback` intent
bound to the exact authority, final manifest, quiesce manifest, and checkpoint.

Forward selects the new five production writers plus the original five
development writers and holds the old five production writers stopped with
restart `no`. Rollback selects the original ten and holds the captured partial
target set of 0..5 stopped with restart `no`. Both modes start workers, then
API, then Web; verify each class before advancing; and restore restart policies
only after every required start is healthy. The previous unreachable in-process
Compose restore functions were removed, leaving `resume-writers-only` as the
only Compose restart path.

Every start, health, policy, identity, input-swap, signal, and protected crash
failure compensates the complete final set to stopped/restart-`no` and proves
the held set unchanged. The shell holds its host lock and waits for the Python
controller to finish compensation on INT/TERM. A crash after exact terminal
state but before receipt publication is completed without replay under a new
recovery epoch. A partial crash is compensated and fails closed, requiring the
next recovery epoch.

The terminal `megacampus.q12.writer-resume-state/v1` receipt has exactly the
normative 14 keys. `release_sha` is intentionally absent and is transitively
bound by the exact final-manifest and authority hashes; an extra
`release_sha` is rejected. Publication uses an owner-correct, fsynced temporary
inode and `renameat2(RENAME_NOREPLACE)`, so a crash after rename leaves exactly
one terminal receipt and no hard-link temporary residue.

# Database and catalog outcome

The PostgreSQL guard freezes the exact structural catalog, row/TRUNCATE/event
trigger sets, ACLs, owners, run/catalog binding, cron and pg_net state.
`assert_capability()` supports the approved migration client boundary while
`assert_controller_binding()` independently requires the direct-controller run,
capability, and catalog bindings. Activation retry after a DB COMMIT can publish
its receipt only after complete read-only durable-state proof. Cleanup and
rollback never infer success from a missing guard schema and never forge a
terminal receipt after a protected post-COMMIT fault.

The canonical PostgreSQL 17 payload projects 40 structural families, including
the 19 expanded DDL families and explicit schema-less COMMENT/SECURITY LABEL
classes. Secret-valued FDW, server, table, column, user-mapping, and subscription
options are represented only by SHA-256. The real PostgreSQL 17 fixture proves
hash drift/restoration, OID-order parity, transaction races, fresh-session
read-only inheritance, and explicit primary READ WRITE control.

# Verification evidence

```text
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_KEY=synthetic-test-key \
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/ops/q12-database-barrier.test.ts \
  tests/unit/ops/qdrant-source-recovery-runtime.test.ts \
  tests/unit/tools/qdrant/source-recovery-database.test.ts \
  tests/unit/tools/qdrant/source-recovery-reindex-adapters.test.ts \
  tests/unit/tools/qdrant/reindex-course-embeddings.test.ts
# 5 files, 241/241 passed

MC2_Q12_REAL_PG17=1 \
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_KEY=synthetic-test-key \
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/ops/q12-structural-catalog-pg17.test.ts
# 34/34 passed

pnpm --filter @megacampus/course-gen-platform type-check
# exit 0
```

The earlier pre-hardening combined run reached 215/216 because the test sent
SIGTERM to the whole synthetic process group and timed out while shell and
controller raced. The leftover local synthetic process was explicitly stopped.
The test was corrected to exercise the actual supervisor boundary: signal the
shell, forward to the controller, and wait for proven compensation. That test
then passed three consecutive isolated runs. After the final normative
hardening pass, the complete runtime file passed 108/108 and the fresh combined
run passed 241/241. Final process/container checks were empty.

# Risks / Follow-ups

All changes are local to `codex/q12-w-writer-barrier`; no external state exists
to roll back. Before integration, the branch commit can be reverted as one
unit. After integration, root must rerun canonical stage-wide verification and
refresh Graphify locally. Live cutover, Supabase/Qdrant mutation, service or
secret changes, and any staging/production activation remain outside this
stream and require the root-owned explicit remote gate.
