---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.7
stage_id: mc2-jz6y0
agent_type: deploy_specialist
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: database credentials, backup atomicity, retention, crash residue, and remote-migration gating are high-risk operational boundaries
repo: mc2
branch: codex/q12-supabase-backup-gate
base_branch: codex/self-hosted-qdrant-platform
base_commit: dd3e6c76
worktree: /home/me/code/mc2/.worktrees/q12-supabase-backup-gate
write_zone:
  - deploy/postgres/backup-supabase.sh
  - packages/course-gen-platform/tests/unit/ops/supabase-backup-operator.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.md
success_criteria:
  - pg_dump failure is observed directly and cannot publish a backup
  - a nontrivial custom archive passes pg_restore list validation before atomic publication and directory fsync
  - credentials and CA are explicit owner-controlled files using verify-full and are never logged
  - one nonblocking lock covers the complete operation and retention runs only after validated publication
  - crash and ordinary failure cannot create a published partial backup or remove historical/unrelated files
selected_docs:
  - PostgreSQL 18 pg_dump — https://www.postgresql.org/docs/18/app-pgdump.html
  - PostgreSQL 18 pg_restore — https://www.postgresql.org/docs/18/app-pgrestore.html
  - PostgreSQL 18 libpq TLS/connect parameters — https://www.postgresql.org/docs/18/libpq-connect.html
selected_skills:
  - senior-devops
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - test-pass
  - superpowers:verification-before-completion
selected_agents:
  - deploy_specialist
catalog_candidates:
  - none - installed DevOps/TDD/debugging/verification assets and first-party PostgreSQL docs cover the bounded stream
parallel_group: B
depends_on_streams:
  - none
parallel_decision: parallel
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: no remote resources were created; local dependency symlinks are removed before return
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: parent owns the Task 6 deployment/runbook update; this artifact records the exact operator and restore contract for that integration
verification:
  - TDD RED initial focused suite: 8/8 failed because the fail-closed operator did not exist; legacy no-pipefail gzip pipeline reproduced exit 0 and exact 20-byte output
  - TDD RED command portability/hardening: two 1/9 cycles failed for rejecting distro-managed PostgreSQL symlinks and for a PATH-resolved interpreter
  - TDD RED credential minimization: 4/9 failed because pg_restore list inherited PGDATABASE unnecessarily
  - focused GREEN vitest: 9/9 passed
  - broader ops delta: 42/44 passed; two base-commit stale contract failures are outside this diff and recorded below
  - bash -n deploy/postgres/backup-supabase.sh: passed
  - node scripts/ci/test_ci_cd_workflow_gates.mjs: passed
  - bash scripts/ci/test_detect_deploy_changes.sh: passed
  - bash scripts/ci/test_blue_green_fail_closed.sh: passed
  - pnpm --filter @megacampus/course-gen-platform type-check: passed
  - scripts/orchestration/run_process_verification.sh: passed
changed_files:
  - deploy/postgres/backup-supabase.sh
  - packages/course-gen-platform/tests/unit/ops/supabase-backup-operator.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.md
explicit_defers:
  - independent correctness/security review and parent acceptance are required before server installation
  - current verify-full Session pooler credentials and a fresh live restore-validated backup remain mandatory remote activation inputs
  - no server script, cron, credential, CA, historical dump, live database, staging service, or remote state was read or changed by this stream
---

# Summary

Added a local-disk PostgreSQL/Supabase backup operator that replaces the
fail-open `pg_dump | gzip` shape with a direct custom-format archive. It keeps
`set -Eeuo pipefail`, holds one nonblocking directory lock for the complete
window, reads but never sources an owner-only one-line URL file, requires the
URL's exact `sslmode=verify-full` and explicit `sslrootcert` path, and sends the
URL to `pg_dump` only through `PGDATABASE`. Child stderr is quarantined and
removed so even a failing child that repeats its environment cannot disclose the
password in operator output. The URL is unset before offline archive validation.

The operator writes owner-only temporary files in the final directory, captures
the real `pg_dump` status, requires more than 1024 bytes, runs
`pg_restore --list`, requires a real TOC entry, fsyncs the archive, atomically
renames it, and fsyncs the directory. Retention occurs only after that validated
publication. It owns only mode-0600, current-user, regular non-symlink files
matching `supabase-YYYYMMDDTHHMMSSZ-PID.dump`; unrelated files, the historical
`.sql.gz` input, symlinks, and all existing files on failure remain untouched.
Ordinary failures remove only this run's exact dot-temporaries. A forced crash
may leave a dot-temporary, but it can never match or become a published backup.

# Scope / Routing

PostgreSQL 18 is the current first-party documentation line consulted on
2026-07-13. `pg_dump -Fc/--format=custom` is explicitly suitable for
`pg_restore`; `pg_restore --list` reads the archive table of contents; and libpq
documents `sslmode=verify-full` plus `sslrootcert` for certificate and hostname
verification. No Supabase blog, community guide, or broad web source was used.

For an actual isolated restore drill, use a separately prepared owner-only
libpq service file so no password appears in the process arguments:

```bash
PGSERVICEFILE=/opt/megacampus/secrets/pg_service.conf \
PGSSLMODE=verify-full \
PGSSLROOTCERT=/opt/megacampus/secrets/prod-ca-2021.crt \
/usr/bin/pg_restore \
  --exit-on-error \
  --single-transaction \
  --clean \
  --if-exists \
  --no-owner \
  --dbname='service=megacampus_restore' \
  /opt/megacampus/backups/supabase/supabase-YYYYMMDDTHHMMSSZ-PID.dump
```

The restore target must be a disposable/approved database and the service file
must carry `sslmode=verify-full` plus the same explicit CA. This command is
documentation only; it was not run against a live database in this stream.

# Verification

The first RED run reproduced the current server bug exactly: a failing left side
of a pipeline under `set -e` but without `pipefail` returned zero because gzip
succeeded and created a 20-byte stream. All eight new operator expectations then
failed because the tracked script was absent. The first GREEN reached 8/8. Two
additional bounded RED/GREEN cycles proved distro-managed `/usr/bin/pg_dump`
symlinks remain usable while synthetic overrides stay confined, fixed the
interpreter to `/usr/bin/bash`, and proved `pg_restore --list` receives no
database credentials. Fresh focused evidence is 9/9 passed.

The broader seven-file ops delta passed 42/44. Its two failures are present at
base `dd3e6c76` and no involved source or test differs from that base: the stale
dev-activation test still forbids the already approved staging
`DOCUMENT_EVIDENCE_ENABLED=true`, and the observability test requires a numeric
example GID while the accepted example intentionally retains
`<verified-free-numeric-gid>`. This stream did not alter or mask either contract.
All assigned focused shell, CI, type, and process gates passed.

# Delivery / Cleanup

The branch is returned committed and pushed for independent security/correctness
review. No remote operator installation, cron change, secret read/write, CA
copy, live dump, database connection, retention deletion, or staging mutation
was performed. Synthetic temporary roots were deleted by the tests; worktree
dependency symlinks are removed before return.

# Risks / Follow-ups / Explicit Defers

This branch is not authorization to replace `/opt/megacampus/scripts`, edit the
server crontab, or run a live backup. Parent integration must independently
review the exact URL/CA ownership policy, shell race boundaries, fsync ordering,
retention ownership, and restore procedure. Remote migration remains blocked
until a current Session pooler URL exists, the reviewed operator is installed,
and a fresh verify-full custom dump passes both archive validation and an
approved isolated restore drill.
