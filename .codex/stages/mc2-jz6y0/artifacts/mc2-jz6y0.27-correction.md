---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.27
stage_id: mc2-jz6y0
agent_type: correctness-fix-worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: malformed PostgreSQL client-version acceptance controls the fail-closed boundary before production credential access
repo: mc2
branch: codex/q12-backup-pg17-pin
base_branch: codex/q12-backup-pg17-pin
base_commit: f85c0e209cf8efb82f6a81b67d8317d06a4a6ddf
resolves_review: 4e32dcf9
worktree: /home/me/code/mc2/.worktrees/q12-backup-pg17-pin
write_zone:
  - deploy/postgres/backup-supabase.sh
  - packages/course-gen-platform/tests/unit/ops/supabase-backup-operator.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.27-correction.md
success_criteria:
  - reject CR or LF in complete pg_dump and pg_restore version output before URL or CA handling and before a dump attempt
  - accept canonical PostgreSQL 17 output and an optional same-line packaging suffix
  - preserve explicit production paths, major-17 pairing, protected overrides, and all accepted archive-safety invariants
  - pass focused tests, shell syntax, package type-check, artifact, formatting, diff, and process gates
selected_docs:
  - PostgreSQL 17 pg_dump - https://www.postgresql.org/docs/17/app-pgdump.html
  - PostgreSQL 17 pg_restore - https://www.postgresql.org/docs/17/app-pgrestore.html
  - immutable review 4e32dcf9 - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.27-review.md
selected_skills:
  - superpowers:receiving-code-review
  - superpowers:test-driven-development
  - senior-devops
  - superpowers:verification-before-completion
selected_agents:
  - deploy_specialist
  - correctness-fix worker
catalog_candidates:
  - none - installed assets and the immutable review fully define the bounded correction
parallel_decision: sequential correction - the regression must reproduce against f85c0e20 before the one-line parser boundary changes
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: correction is accepted by zero-finding rereview; temporary dependency symlinks and the dedicated worker worktree were removed, while the non-protected evidence branch remains because normal closeout does not force-delete cherry-picked history
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: integration-owned Qdrant and document-evidence runbooks now carry the explicit PostgreSQL 17 client paths; the historical server packet remains immutable and superseded
graph_reviewed: blocked
graph_review_notes: runtime behavior changed on an isolated correction branch; integration closeout refreshes the graph after final durable documentation and metadata updates
verification:
  - TDD RED executed 24 tests with exactly 2 malformed multiline failures and 22 passes; all existing 21 tests remained green
  - focused GREEN passed 1 file and 24 of 24 tests with zero skips
  - bash syntax and course-gen-platform package type-check passed
  - focused Prettier check, correction artifact validation, git diff check, and repository process verification passed
changed_files:
  - deploy/postgres/backup-supabase.sh
  - packages/course-gen-platform/tests/unit/ops/supabase-backup-operator.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.27-correction.md
explicit_defers:
  - independent zero-finding rereview, integration acceptance, Graphify refresh, and durable runbook corrections remain orchestrator-owned
  - a current verify-full Session pooler DSN, fresh dump, isolated PostgreSQL 17 restore, and every remote action remain deferred
  - no Supabase, SSH, server, credential, database, package installation, service, container, Qdrant, staging, or production mutation was performed
---

# Summary

The immutable review at `4e32dcf9` was reproduced: Bash regular-expression
`[[:space:]]` admitted a newline before an arbitrary second line, so malformed
`pg_dump` and `pg_restore --version` output reached credential validation.

The parser now rejects CR or LF in the complete captured output before parsing
the program label or major, and its optional suffix uses `[[:blank:]]` so only
same-line horizontal separation is accepted. Explicit production paths,
required major 17, pair-major equality, and protected synthetic overrides are
unchanged.

# Verification

RED executed 24 tests. Both independent multiline cases failed because the old
parser reached the deliberately absent URL rather than returning a version
error; the other 22 tests passed, including all 21 pre-correction cases and the
new Ubuntu-style same-line positive probe. GREEN passed 24/24 with zero skips.

`/usr/bin/bash -n deploy/postgres/backup-supabase.sh` and the complete
course-gen-platform package type-check passed. The latter reused the existing
workspace dependency runtime through temporary symlinks and installed or
updated no package. The focused Prettier check, correction artifact validation,
`git diff --check`, and repository process verification all passed.

# Risks / Follow-ups

This correction does not alter the accepted requirement to re-prove the exact
PostgreSQL 17 executables and patch version during the authorized server window.
It also does not turn offline archive traversal into rollback proof: the exact
fresh archive must still restore into an isolated, pinned PostgreSQL 17 target.

Durable runbook and server execution-packet corrections identified by the
immutable review remain outside this write zone until an independent rereview
returns zero findings. The current Session pooler DSN and every remote action
remain explicitly deferred.
