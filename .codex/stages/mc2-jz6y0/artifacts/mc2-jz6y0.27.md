---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.27
stage_id: mc2-jz6y0
agent_type: deploy_specialist
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: backup-client selection and validation ordering are a P1 rollback-safety boundary before any credential or database operation
repo: mc2
branch: codex/q12-backup-pg17-pin
base_branch: codex/self-hosted-qdrant-platform
base_commit: 71a4b14d433e19729fdb1af646fecd88a80e7827
worktree: /home/me/code/mc2/.worktrees/q12-backup-pg17-pin
write_zone:
  - deploy/postgres/backup-supabase.sh
  - packages/course-gen-platform/tests/unit/ops/supabase-backup-operator.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.27.md
success_criteria:
  - pin production pg_dump and pg_restore to the explicit PostgreSQL 17 binary directory
  - fail before opening URL or CA credentials when either command is unavailable, the pair is cross-major, or either command is not major 17
  - preserve protected synthetic overrides and the accepted archive, race, atomicity, retention, crash-residue, and secret invariants
  - pass focused tests, shell syntax, package type-check, artifact, formatting, diff, and process verification gates
selected_docs:
  - PostgreSQL 17 pg_dump compatibility rule - https://www.postgresql.org/docs/17/app-pgdump.html
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-browser-server-preflight-review.md
selected_skills:
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - senior-devops
  - superpowers:verification-before-completion
selected_agents:
  - deploy_specialist perspective
catalog_candidates:
  - none - installed assets and the assigned first-party compatibility rule fully cover the bounded correction
parallel_decision: isolated stream - this correction can be implemented and verified independently from the credential and documentation gates
status: accepted
delivery_method: cherry-pick
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: temporary dependency symlinks and the dedicated worker worktree were removed after immutable finding, correction, and zero-finding rereview integration; the non-protected evidence branch remains because normal closeout does not force-delete cherry-picked history
risk_level: high
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: integration-owned Qdrant and document-evidence runbooks now require the explicit verified PostgreSQL 17 dump and restore pair
graph_reviewed: blocked
graph_review_notes: source behavior changed in an isolated worker branch; the integration owner refreshes the local graph after final durable documentation and metadata updates
verification:
  - TDD RED passed as a regression proof with 21 tests executed, 3 expected failures, and 18 existing tests passing
  - focused GREEN passed 1 file and 21 of 21 tests with zero skips
  - bash syntax and course-gen-platform package type-check passed
  - focused Prettier check, artifact validation, git diff check, and repository process verification passed
changed_files:
  - deploy/postgres/backup-supabase.sh
  - packages/course-gen-platform/tests/unit/ops/supabase-backup-operator.test.ts
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.27.md
explicit_defers:
  - live Session pooler DSN, server installation, fresh dump, isolated restore, and every remote action remain external gates
  - no server, Supabase, credential, dump, database, package, service, Docker, staging, or production operation was performed
---

# Summary

The production backup operator now selects
`/usr/lib/postgresql/17/bin/pg_dump` and
`/usr/lib/postgresql/17/bin/pg_restore` instead of the ambiguous `/usr/bin`
wrappers that the current server resolves to PostgreSQL 18.1. Before it opens
the URL or CA file, the operator proves that both commands are executable,
parses each canonical `--version` response, rejects a cross-major pair, and
requires major 17 from both commands.

The protected synthetic override boundary is unchanged. Its fake commands now
implement only the additional `--version` seam, and the existing test paths,
ownership, mode, and exact test-token requirements remain intact.

# Verification

The TDD RED run executed 21 tests: three new tests failed for the intended
reason while all 18 existing tests passed. The old operator still named
`/usr/bin`; same-major 18.1 and mismatched 17.7/18.1 pairs reached credential
validation instead of stopping at the client boundary. After the minimal
operator change, the focused suite passed 21/21 with zero skips.

`/usr/bin/bash -n deploy/postgres/backup-supabase.sh` passed. The
course-gen-platform package type-check passed after the isolated worktree reused
the repository's existing dependency runtime through temporary symlinks; no
package was installed or updated. The focused Prettier check, artifact
validation, `git diff --check`, and repository process verification all passed.

# Risks / Follow-ups

This correction verifies the required major, not a specific PostgreSQL 17 minor.
The authorized server window must still re-prove the installed executable paths
and record their exact patch version. The resulting archive is not accepted as
rollback evidence until the exact archive passes a real isolated restore into a
pinned PostgreSQL 17 target.

Independent correction/rereview, integration acceptance, both durable runbook
updates, and the sole PG17 execution packet are complete. Only the live DSN,
server preparation, fresh dump, isolated restore, and later authorized Q12
actions remain. This worker made no remote or credential operation.
