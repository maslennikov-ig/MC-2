---
schema_version: orchestration-artifact/v1
artifact_type: delegated-review
task_id: mc2-jz6y0.27-review
stage_id: mc2-jz6y0
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: PostgreSQL client selection and validation ordering are a rollback-safety boundary before credential access or database operations.
repo: mc2
branch: codex/q12-backup-pg17-review
base_branch: codex/q12-backup-pg17-pin
base_commit: f85c0e209cf8efb82f6a81b67d8317d06a4a6ddf
reviewed_commit: f85c0e209cf8efb82f6a81b67d8317d06a4a6ddf
reviewed_range: 71a4b14d433e19729fdb1af646fecd88a80e7827..f85c0e209cf8efb82f6a81b67d8317d06a4a6ddf
worktree: /home/me/code/mc2/.worktrees/q12-backup-pg17-review
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.27-review.md
success_criteria:
  - independently inspect the exact implementation commit, full operator, full focused test, worker artifact, and prior compatibility review
  - verify explicit PostgreSQL 17 client paths and fail-closed validation before URL or CA credential reads
  - reject acceptance unless missing, malformed, wrong-major, and mismatched-major clients all fail closed
  - run the assigned focused, shell, type, process, artifact, formatting, and diff gates
selected_docs:
  - PostgreSQL 17 pg_dump - https://www.postgresql.org/docs/17/app-pgdump.html
  - PostgreSQL 17 pg_restore - https://www.postgresql.org/docs/17/app-pgrestore.html
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-browser-server-preflight-review.md
selected_skills:
  - code-review
  - senior-devops
  - superpowers:verification-before-completion
selected_agents:
  - correctness_reviewer
  - deploy_specialist perspective
catalog_candidates:
  - none - installed assets and first-party PostgreSQL documentation cover the bounded review
parallel_group: q12-backup-pg17-review
depends_on_streams:
  - mc2-jz6y0.27
parallel_decision: sequential - this review depends on the completed implementation commit
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: pending
cleanup_notes: Temporary dependency symlinks are removed before commit; review worktree and branch cleanup remain orchestrator-owned.
risk_level: high
docs_impact: ops-deploy
docs_reviewed: no-change-needed
docs_review_notes: The rejected commit must not yet drive durable runbook edits; exact PostgreSQL 17 path corrections required after remediation are listed in this artifact.
graph_reviewed: used
graph_review_notes: Read the existing local graph report and ran a focused read-only query; a review-only artifact does not require graph refresh.
verification:
  - focused unit configuration passed 1 file and 21 of 21 tests with zero skips
  - bash syntax, course-gen-platform package type-check, and process verification passed
  - malformed multiline version-output probe reproduced the P2 finding with exit status 0 and parsed major 17
  - review artifact validation and the four-path Prettier check passed
  - git diff checks passed after temporary dependency symlinks were removed
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.27-review.md
explicit_defers:
  - production code and tests require a separate remediation stream because this review write zone is immutable
  - runbook and server execution packet corrections remain outside this review write zone and must follow a passing rereview
  - remote client installation, real dump/restore, DSN, directory, cron, service, container, Qdrant, staging, and production changes were not performed
---

# Summary

## Findings-first verdict

**NO-GO for commit `f85c0e20`; P0: 0, P1: 0, P2: 1, P3: 0.**

The commit correctly pins production to
`/usr/lib/postgresql/17/bin/pg_dump` and
`/usr/lib/postgresql/17/bin/pg_restore`, validates both executable paths and
their reported majors before opening URL/CA inputs, rejects missing clients,
same-major PostgreSQL 18 clients, and cross-major pairs, and confines synthetic
overrides to the previously accepted protected test boundary. It is not
acceptable because one malformed `--version` response passes the new parser.

## P2 finding

### 1. Multiline `--version` output is accepted as a canonical PostgreSQL 17 response

- **File:** `deploy/postgres/backup-supabase.sh:101-115`, specifically line 113;
  missing regression coverage is adjacent to
  `packages/course-gen-platform/tests/unit/ops/supabase-backup-operator.test.ts:253-294`.
- **Evidence:** the suffix expression `([[:space:]].*)?` accepts a newline and
  arbitrary following text. A read-only in-memory probe of the exact function
  supplied `pg_dump (PostgreSQL) 17.7\nunexpected second line`; the function
  returned status 0 and `major=17`. Invalid numeric and wrong-label probes were
  rejected, so the defect is specifically the multiline canonicality boundary.
- **Impact:** a malformed or incorrectly wrapped client can pass the PostgreSQL
  17 preflight and allow credential files to be opened, contrary to the assigned
  fail-closed requirement for malformed clients. The explicit distro path limits
  exposure, so this is P2 rather than P1, but any P0-P3 finding is NO-GO.
- **Fix:** reject CR/LF in the complete captured output before parsing and allow
  only a single-line canonical version plus an optional same-line packaging
  suffix (for example with `[[:blank:]]`, not `[[:space:]]`). Add protected
  dump and restore regression cases proving malformed multiline output fails
  before URL/CA handling and before `pg_dump` execution.

# Verified boundaries

1. `backup-supabase.sh:12,18-19` fixes the required major and both production
   paths to the PostgreSQL 17 directory.
2. `backup-supabase.sh:117-165` validates both commands, both `--version`
   calls, pair-major equality, and required major 17. Missing commands fail
   before either version invocation.
3. `backup-supabase.sh:367-380` calls `configure_commands` before the backup
   directory lock and before `open_validated_input` opens either URL or CA.
4. `backup-supabase.sh:117-152` rejects override variables outside the exact
   test token; test commands remain current-user-owned mode-0700 regular
   non-symlinks below the protected `/tmp/mc2-supabase-backup-*` root.
5. PostgreSQL 17 documents `--version` for both utilities and states that a
   newer-major `pg_dump` output is not guaranteed to load into an older-major
   server. This supports the explicit same-major PostgreSQL 17 boundary.

# Verification

- `/usr/bin/bash -n deploy/postgres/backup-supabase.sh` - PASS, exit 0.
- The literal assigned Vitest command without the unit config stopped before
  executing tests because the package default config requires unavailable
  Qdrant variables. The network-free canonical focused rerun used
  `--config vitest.config.unit.ts` with synthetic Supabase placeholders and
  passed 1 file, 21/21 tests, zero skips.
- `pnpm --filter @megacampus/course-gen-platform type-check` - PASS, exit 0,
  after reusing the existing workspace runtime through temporary symlinks.
- `scripts/orchestration/run_process_verification.sh` - PASS, including the
  orchestration contract and `git diff --check`.
- `python3 scripts/orchestration/validate_artifact.py
.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.27-review.md` - PASS.
- `pnpm exec prettier --check --ignore-unknown` on the operator, focused test,
  worker artifact, and review artifact - PASS. The repository has no installed
  shell parser plugin, so the operator is covered separately by the assigned
  `/usr/bin/bash -n` gate; the TypeScript and both Markdown artifacts also
  passed the inferred-parser Prettier check.
- `git diff --check` - PASS after all temporary dependency symlinks were
  removed; only this review artifact remained changed.
- Parser probes - ordinary `17.7` and the Ubuntu same-line suffix parsed major
  17; invalid numeric and wrong-label responses failed; an embedded-newline
  response incorrectly parsed major 17 and returned zero, reproducing P2.

# Documentation impact

Do not update durable runbooks from this rejected commit. After remediation and
passing rereview, the ops-deploy stream must make these exact corrections:

1. `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.md:132` and the integration
   artifact `mc2-jz6y0.13.7-supabase-cli-login-role.md:178` must replace
   `/usr/bin/pg_restore` with
   `/usr/lib/postgresql/17/bin/pg_restore` in the isolated-restore examples.
2. `mc2-jz6y0.13.7-supabase-cli-login-role.md:45,118-130` must replace the old
   fixed `/usr/bin` operator claim with the explicit PostgreSQL 17 pair.
3. `mc2-jz6y0.13.7-server-preflight-20260713.md:56-57,98-106,166-222` must keep
   the observed `/usr/bin` 18.1 fact but stop calling it the required compatible
   client, update the operator SHA from the old packet, and preflight both
   `/usr/lib/postgresql/17/bin/{pg_dump,pg_restore}` paths and their accepted
   version output before installation, credential handling, or invocation.
4. `docs/operations/qdrant-self-hosted.md:370-376` and
   `docs/operations/document-evidence.md:320-331` must explicitly carry the same
   major-17 operator and isolated-restore path requirement when the corrected
   packet is integrated.

`docs-reviewed: no-change-needed` for this rejected review branch: documentation
edits must follow the corrected implementation, and the exact stale locations
are identified above.

`graph-reviewed: used` - the ignored graph in the primary checkout was read and
queried only; no refresh is appropriate for a review-only artifact.

# Delivery / Cleanup

Only this review artifact is changed. The implementation commit is not accepted
and must not be installed or integrated. Temporary runtime symlinks are removed
before delivery; worktree and branch cleanup remain pending orchestrator action.

# Risks / Follow-ups / Explicit Defers

- Correct the single-line version parser and add dump/restore malformed-output
  regressions, then request a fresh independent rereview.
- Remote package/client installation, a real verify-full DSN, directory and cron
  corrections, operator/service installation, fresh dump, and isolated
  PostgreSQL 17 restore remain explicit live-operation defers.
- No SSH, Supabase, credential, database, dump, restore, package installation,
  service, container, Qdrant, staging, or production mutation occurred.
